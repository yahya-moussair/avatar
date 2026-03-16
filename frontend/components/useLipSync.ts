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
  /** Extra weights for brows/cheek/smile from text-driven expression (add on top of visemes). */
  expressionWeights: Record<string, number>;
  /** True when the text-based viseme system is actively driving shapes. */
  active: boolean;
}

const EMPTY_STATE: LipSyncState = { morphWeights: {}, expressionWeights: {}, active: false };

// ─── Text → expression (for facial expression from content) ───────────────

type ExpressionKey = "neutral" | "happy" | "sad" | "angry" | "surprise" | "thoughtful";

const EXPRESSION_MORPH_PRESETS: Record<ExpressionKey, Record<string, number>> = {
  neutral: {},
  happy: {
    browInnerUp: 0.15,
    mouthSmileLeft: 0.42,
    mouthSmileRight: 0.42,
    cheekSquintLeft: 0.3,
    cheekSquintRight: 0.3,
  },
  sad: {
    browDownLeft: 0.45,
    browDownRight: 0.45,
    mouthFrownLeft: 0.15,
    mouthFrownRight: 0.15,
  },
  angry: {
    browDownLeft: 0.5,
    browDownRight: 0.5,
    browInnerUp: 0.05,
    mouthFrownLeft: 0.2,
    mouthFrownRight: 0.2,
    mouthPressLeft: 0.1,
    mouthPressRight: 0.1,
  },
  surprise: {
    browInnerUp: 0.5,
    browOuterUpLeft: 0.35,
    browOuterUpRight: 0.35,
    jawOpen: 0.08,
    mouthOpen: 0.05,
  },
  thoughtful: {
    browInnerUp: 0.2,
    browDownLeft: 0.08,
    browDownRight: 0.08,
    mouthPucker: 0.12,
  },
};

function textToExpression(text: string): { expression: ExpressionKey; intensity: number } {
  const lower = text.toLowerCase().trim();
  if (!lower.length) return { expression: "neutral", intensity: 0 };

  const sadWords = /(\bsad\b|\bsorry\b|\bsorrow\b|\bregret\b|\bunfortunate\b|\bterrible\b|\bawful\b|\bgrief\b|\bgrieves\b|\bmiss\b|\blost\b|\bdreadful\b)/i;
  const angryWords = /(\bangry\b|\bfurious\b|\bcross\b|\bannoyed\b|\bupset\b|\bindignant\b|\bthat will not do\b|\bmust say\b)/i;
  const happyWords = /(\bdelight\b|\bpleasure\b|\bpleased\b|\bhappy\b|\bglad\b|\bthrill\b|\bmarvellous\b|\bwonderful\b|\blovely\b|\bbrilliant\b|\bexcited\b|\bso glad\b)/i;
  const surpriseWords = /(\bsurprised\b|\bastonished\b|\bshocked\b|\bremarkable\b|\bunbelievable\b|\bgoodness\b|\bdear me\b)/i;
  const thoughtfulWords = /(\bsuppose\b|\breckon\b|\bconsider\b|\bperhaps\b|\bmaybe\b|\bwonder\b|\bthink\b|\bcurious\b)/i;

  if (angryWords.test(lower))
    return { expression: "angry", intensity: 0.85 };
  if (sadWords.test(lower))
    return { expression: "sad", intensity: 0.85 };
  if (happyWords.test(lower))
    return { expression: "happy", intensity: 0.85 };
  if (surpriseWords.test(lower))
    return { expression: "surprise", intensity: 0.8 };
  if (thoughtfulWords.test(lower))
    return { expression: "thoughtful", intensity: 0.7 };
  return { expression: "neutral", intensity: 0 };
}

// Average phoneme rate: ~13 phonemes/sec → ~77 ms per viseme.
// We advance through the queue when audio is detected, at this base rate.
// Slightly longer per-viseme duration so each mouth shape is clearer.
const BASE_VISEME_DURATION_MS = 90;
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
  // Current expression from the text being spoken (updated per segment)
  const currentExpressionRef = useRef<{ expression: ExpressionKey; intensity: number }>({
    expression: "neutral",
    intensity: 0,
  });
  // Smoothed expression morph weights (blended over time)
  const smoothExpressionWeightsRef = useRef<Record<string, number>>({});

  // ─── Handle incoming transcription events ─────────────────────────

  const handleTranscription = useCallback(
    (segments: TranscriptionSegment[], participant?: Participant) => {
      // Only process the remote agent's speech
      if (participant?.isLocal) return;

      for (const seg of segments) {
        // Skip already-processed segments
        if (processedIdsRef.current.has(seg.id)) {
          continue;
        }
        processedIdsRef.current.add(seg.id);

        if (processedIdsRef.current.size > 500) {
          const ids = Array.from(processedIdsRef.current);
          processedIdsRef.current = new Set(ids.slice(ids.length - 200));
        }

        // Update expression from this segment's text (face adapts to what she's saying)
        currentExpressionRef.current = textToExpression(seg.text);

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
        // Slightly slower blend so each mouth shape reads clearly (~80–100ms)
        blendRef.current = Math.min(1, blendRef.current + dt * 12);
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
      const smoothSpeed = 22 * dt;

      for (const key of allKeys) {
        const target = targetWeights[key] ?? 0;
        const current = sw[key] ?? 0;
        sw[key] = current + (target - current) * smoothSpeed;
        if (sw[key] < 0.001) sw[key] = 0;
      }

      // ── Expression: smooth toward preset for current segment's text ──
      const { expression, intensity } = currentExpressionRef.current;
      const exprPreset = EXPRESSION_MORPH_PRESETS[expression];
      const exprTarget: Record<string, number> = {};
      for (const [k, v] of Object.entries(exprPreset)) {
        exprTarget[k] = v * intensity;
      }
      const sew = smoothExpressionWeightsRef.current;
      const exprKeys = Array.from(new Set([...Object.keys(exprTarget), ...Object.keys(sew)]));
      const exprSpeed = 8 * dt; // slower blend so expression doesn't flicker
      for (const key of exprKeys) {
        const target = exprTarget[key] ?? 0;
        const current = sew[key] ?? 0;
        sew[key] = current + (target - current) * exprSpeed;
        if (sew[key] < 0.001) sew[key] = 0;
      }

      // ── Expose state ──
      const isActive = cur !== null || queue.length > 0;
      lipSyncRef.current = {
        morphWeights: sw,
        expressionWeights: sew,
        active: isActive,
      };
    },
    []
  );

  return { lipSyncRef, consumeVisemes };
}
