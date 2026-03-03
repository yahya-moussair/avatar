"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import type { TranscriptionSegment, Participant } from "livekit-client";
import { textToVisemes, VISEME_MORPH_PRESETS, VISEME_KEYS } from "./visemeMap";
import type { VisemeKey, MorphWeights } from "./visemeMap";
import type { AudioBands } from "./useRemoteAudioLevel";

// ─── Scheduled viseme in the playback queue ────────────────────────────

interface QueuedViseme {
  viseme: VisemeKey;
  morphs: MorphWeights;
}

// ─── Lip-sync state exposed via ref for real-time access ───────────────

export interface LipSyncState {
  /** Current morph target weights to apply (blended between visemes). */
  morphWeights: Record<string, number>;
  /** True when the text-based viseme system is actively driving shapes. */
  active: boolean;
}

const EMPTY_STATE: LipSyncState = { morphWeights: {}, active: false };

// Average phoneme rate: ~13 phonemes/sec → ~77 ms per viseme.
// We advance through the queue when audio is detected, at this base rate.
const BASE_VISEME_DURATION_MS = 75;
// Minimum volume to consider the avatar "speaking"
const SPEAK_THRESHOLD = 0.012;

/**
 * Hook that listens for LiveKit agent transcription events, converts
 * spoken text into a viseme queue, and exposes smoothly interpolated
 * morph weights synchronised to the audio stream.
 *
 * Usage:
 *   const { lipSyncRef, consumeVisemes } = useLipSync();
 *   // In useFrame: call consumeVisemes(bandsRef, delta)
 *   // then read lipSyncRef.current.morphWeights
 */
export function useLipSync() {
  const room = useRoomContext();

  // Viseme queue: visemes waiting to be "spoken"
  const queueRef = useRef<QueuedViseme[]>([]);
  // Accumulated time since the last viseme was consumed (ms)
  const accumulatorRef = useRef(0);
  // The viseme currently being displayed
  const currentVisemeRef = useRef<QueuedViseme | null>(null);
  // The previous viseme (for crossfade blending)
  const prevVisemeRef = useRef<QueuedViseme | null>(null);
  // Blend progress 0→1 from previous viseme to current
  const blendRef = useRef(1);
  // Smoothed morph weights (what we actually apply)
  const smoothWeightsRef = useRef<Record<string, number>>({});
  // Exposed state
  const lipSyncRef = useRef<LipSyncState>(EMPTY_STATE);
  // Track processed segment IDs to avoid duplicates
  const processedIdsRef = useRef<Set<string>>(new Set());

  // ─── Handle incoming transcription events ─────────────────────────

  const handleTranscription = useCallback(
    (segments: TranscriptionSegment[], participant?: Participant) => {
      // Only process the remote agent's speech
      if (participant?.isLocal) return;

      for (const seg of segments) {
        // Skip already-processed segments
        if (processedIdsRef.current.has(seg.id)) {
          // If it's a final update for an existing segment, skip
          continue;
        }
        processedIdsRef.current.add(seg.id);

        // Limit the processed-IDs set to prevent memory leak
        if (processedIdsRef.current.size > 500) {
          const ids = Array.from(processedIdsRef.current);
          processedIdsRef.current = new Set(ids.slice(ids.length - 200));
        }

        const visemeKeys = textToVisemes(seg.text);
        for (const vk of visemeKeys) {
          queueRef.current.push({
            viseme: vk,
            morphs: VISEME_MORPH_PRESETS[vk],
          });
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!room) return;
    room.on(RoomEvent.TranscriptionReceived, handleTranscription);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, handleTranscription);
    };
  }, [room, handleTranscription]);

  // ─── Per-frame viseme consumer (called from useFrame) ─────────────

  /**
   * Call this every frame. It advances through the viseme queue
   * based on detected audio activity and produces smoothly
   * interpolated morph weights.
   *
   * @param bandsRef  Current audio frequency bands (for speak detection)
   * @param deltaSec  Frame delta time in seconds (from useFrame)
   */
  const consumeVisemes = useCallback(
    (bandsRef: React.RefObject<AudioBands> | undefined, deltaSec: number) => {
      const dt = Math.min(deltaSec, 0.05);
      const dtMs = dt * 1000;
      const bands = bandsRef?.current;
      const vol = bands?.volume ?? 0;
      const speaking = vol > SPEAK_THRESHOLD;
      const queue = queueRef.current;

      // ── Advance through the queue when audio is playing ──
      if (speaking && queue.length > 0) {
        // Scale advancement by volume (louder = slightly faster articulation)
        const speedScale = 0.7 + Math.min(vol, 0.5) * 0.6;
        accumulatorRef.current += dtMs * speedScale;

        if (accumulatorRef.current >= BASE_VISEME_DURATION_MS) {
          accumulatorRef.current -= BASE_VISEME_DURATION_MS;
          // Shift to next viseme
          prevVisemeRef.current = currentVisemeRef.current;
          currentVisemeRef.current = queue.shift() ?? null;
          blendRef.current = 0;
        }
      } else if (!speaking && queue.length === 0) {
        // No audio and no queued visemes → decay to silence
        currentVisemeRef.current = null;
        accumulatorRef.current = 0;
      }

      // ── Crossfade blend progress ──
      if (blendRef.current < 1) {
        // Fast blend: reach full weight in ~60ms
        blendRef.current = Math.min(1, blendRef.current + dt * 16);
      }

      // ── Compute target weights ──
      const targetWeights: Record<string, number> = {};

      const cur = currentVisemeRef.current;
      const prev = prevVisemeRef.current;
      const blend = blendRef.current;

      if (cur) {
        // Current viseme (fading in)
        for (const [key, val] of Object.entries(cur.morphs)) {
          targetWeights[key] = (targetWeights[key] ?? 0) + val * blend;
        }
        // Previous viseme (fading out)
        if (prev && blend < 1) {
          for (const [key, val] of Object.entries(prev.morphs)) {
            targetWeights[key] = (targetWeights[key] ?? 0) + val * (1 - blend);
          }
        }
      }

      // ── Smooth towards target (exponential ease) ──
      const sw = smoothWeightsRef.current;
      const allKeys = Array.from(new Set([...Object.keys(targetWeights), ...Object.keys(sw)]));
      const smoothSpeed = 22 * dt; // fast enough for speech, smooth enough for visual

      for (const key of allKeys) {
        const target = targetWeights[key] ?? 0;
        const current = sw[key] ?? 0;
        sw[key] = current + (target - current) * smoothSpeed;
        if (sw[key] < 0.001) sw[key] = 0;
      }

      // ── Expose state ──
      const isActive = cur !== null || queue.length > 0;
      lipSyncRef.current = {
        morphWeights: sw,
        active: isActive,
      };
    },
    []
  );

  return { lipSyncRef, consumeVisemes };
}
