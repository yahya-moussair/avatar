"use client";

import { useEffect, useState, useRef } from "react";
import { useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";

/**
 * Returns a 0-1 volume level from the first remote participant's audio track.
 * Used to drive avatar lip-sync.
 */
export function useRemoteAudioLevel(): number {
  const [volume, setVolume] = useState(0);
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
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(data);
      const sum = data.reduce((a, b) => a + b, 0);
      const avg = sum / data.length;
      const normalized = Math.min(1, (avg / 128) * 2.5);
      setVolume(normalized);
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

  return volume;
}
