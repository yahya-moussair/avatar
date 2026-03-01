"use client";

import { useEffect, useRef, useState } from "react";
import { useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";

export interface AudioBands {
  volume: number;   // overall energy 0-1
  f1: number;       // 200-800 Hz  — first formant (mouth openness)
  f2: number;       // 800-2500 Hz — second formant (lip spread vs round)
  sibilant: number; // 2500-6000 Hz — S, SH, CH sounds
  fricative: number;// 6000-12000 Hz — F, TH, breathy sounds
  prevVolume: number; // previous frame volume (for burst detection)
}

const EMPTY: AudioBands = { volume: 0, f1: 0, f2: 0, sibilant: 0, fricative: 0, prevVolume: 0 };

/**
 * Extracts frequency-band data from the remote participant's audio.
 * Returns bands via a ref for real-time access in useFrame.
 */
export function useRemoteAudioLevel(): {
  volume: number;
  bandsRef: React.RefObject<AudioBands>;
} {
  const [volume, setVolume] = useState(0);
  const bandsRef = useRef<AudioBands>(EMPTY);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const tracks = useTracks(
    [Track.Source.Microphone, Track.Source.Unknown],
    { onlySubscribed: true }
  );

  useEffect(() => {
    const remoteAudio = tracks.find(
      (t) =>
        !t.participant.isLocal &&
        t.publication.kind === Track.Kind.Audio &&
        t.publication.track?.mediaStreamTrack
    );
    const track = remoteAudio?.publication.track?.mediaStreamTrack ?? null;

    if (!track || track === trackRef.current) return;
    trackRef.current = track;

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.1; // minimal smoothing for tight sync
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const sampleRate = ctx.sampleRate;
    const binHz = sampleRate / analyser.fftSize;

    // Pre-compute bin ranges
    const ranges = {
      f1Start: Math.floor(200 / binHz),
      f1End: Math.floor(800 / binHz),
      f2Start: Math.floor(800 / binHz),
      f2End: Math.floor(2500 / binHz),
      sibStart: Math.floor(2500 / binHz),
      sibEnd: Math.floor(6000 / binHz),
      fricStart: Math.floor(6000 / binHz),
      fricEnd: Math.min(Math.floor(12000 / binHz), data.length),
    };

    function bandEnergy(start: number, end: number): number {
      if (end <= start) return 0;
      let sum = 0;
      for (let i = start; i < end; i++) sum += data[i];
      return sum / ((end - start) * 255);
    }

    let prevVol = 0;
    let frameCount = 0;

    function tick() {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(data);

      const f1 = bandEnergy(ranges.f1Start, ranges.f1End);
      const f2 = bandEnergy(ranges.f2Start, ranges.f2End);
      const sibilant = bandEnergy(ranges.sibStart, ranges.sibEnd);
      const fricative = bandEnergy(ranges.fricStart, ranges.fricEnd);
      const vol = Math.min(1, (f1 * 1.5 + f2 + sibilant * 0.8 + fricative * 0.5) / 2);

      bandsRef.current = { volume: vol, f1, f2, sibilant, fricative, prevVolume: prevVol };
      prevVol = vol;

      frameCount++;
      if (frameCount % 3 === 0) setVolume(vol);

      animationRef.current = requestAnimationFrame(tick);
    }

    analyserRef.current = analyser;
    tick();

    return () => {
      cancelAnimationFrame(animationRef.current);
      analyserRef.current = null;
      trackRef.current = null;
      ctx.close();
    };
  }, [tracks]);

  return { volume, bandsRef };
}
