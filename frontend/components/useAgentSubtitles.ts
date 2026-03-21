"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import type { TranscriptionSegment, Participant } from "livekit-client";

type SegmentEntry = { text: string; order: number };

const MAX_CHARS = 1200;

/**
 * Builds subtitle text from LiveKit agent transcription (same source as lip-sync).
 */
export function useAgentSubtitles(): string {
  const room = useRoomContext();
  const byIdRef = useRef<Map<string, SegmentEntry>>(new Map());
  const orderRef = useRef(0);
  const [subtitle, setSubtitle] = useState("");

  const rebuild = useCallback(() => {
    const parts = Array.from(byIdRef.current.values())
      .sort((a, b) => a.order - b.order)
      .map((e) => e.text.trim())
      .filter(Boolean);
    const merged = parts.join(" ").replace(/\s+/g, " ").trim();
    setSubtitle(merged.length > MAX_CHARS ? merged.slice(-MAX_CHARS) : merged);
  }, []);

  const handleTranscription = useCallback(
    (segments: TranscriptionSegment[], participant?: Participant) => {
      if (participant?.isLocal) return;

      for (const seg of segments) {
        const text = (seg.text ?? "").trim();
        const prev = byIdRef.current.get(seg.id);
        if (prev && prev.text === text) continue;
        if (!prev) {
          orderRef.current += 1;
          byIdRef.current.set(seg.id, { text, order: orderRef.current });
        } else {
          byIdRef.current.set(seg.id, { text, order: prev.order });
        }
      }

      if (byIdRef.current.size > 400) {
        const sorted = Array.from(byIdRef.current.entries()).sort(
          (a, b) => a[1].order - b[1].order
        );
        byIdRef.current = new Map(sorted.slice(-200));
      }

      rebuild();
    },
    [rebuild]
  );

  useEffect(() => {
    if (!room) return;
    room.on(RoomEvent.TranscriptionReceived, handleTranscription);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, handleTranscription);
    };
  }, [room, handleTranscription]);

  return subtitle;
}
