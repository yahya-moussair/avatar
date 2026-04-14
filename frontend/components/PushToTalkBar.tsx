"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext, useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";

/** Must match livekit-voice-agent/agent.py PTT_TOPIC */
export const PTT_DATA_TOPIC = "lk-avatar-ptt";

function encodePtt(action: "press" | "release") {
  return new TextEncoder().encode(JSON.stringify({ v: 1, e: action }));
}

type Props = {
  /** Wait until Ada is in the room before allowing PTT */
  disabled?: boolean;
};

/** Phone-only UI: kiosk does not publish mic or PTT (see agent.py). */
export function PushToTalkBar({ disabled = false }: Props) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);

  const connected = connectionState === ConnectionState.Connected;
  const canUseMic =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  const sendPtt = useCallback(
    async (action: "press" | "release") => {
      if (!room?.localParticipant) return;
      try {
        await room.localParticipant.publishData(encodePtt(action), {
          reliable: true,
          topic: PTT_DATA_TOPIC,
        });
      } catch {
        /* ignore */
      }
    },
    [room]
  );

  const endPress = useCallback(async () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    try {
      await room?.localParticipant?.setMicrophoneEnabled(false);
    } catch {
      /* ignore */
    }
    await sendPtt("release");
  }, [room, sendPtt]);

  const startPress = useCallback(async () => {
    if (!connected || disabled || holdingRef.current || !room?.localParticipant) return;
    if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    holdingRef.current = true;
    setHolding(true);
    await sendPtt("press");
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch {
      holdingRef.current = false;
      setHolding(false);
    }
  }, [connected, disabled, room, sendPtt]);

  useEffect(() => {
    if (!holding) return;
    const onUp = () => void endPress();
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [holding, endPress]);

  const busy = !connected || disabled || !canUseMic;

  return (
    <div className="ptt-bar">
      <p className="ptt-hint">Hold to talk · release to transcribe &amp; get Ada&apos;s reply</p>
      <button
        type="button"
        className={`ptt-button ${holding ? "ptt-button--active" : ""}`}
        disabled={busy}
        onPointerDown={(e) => {
          e.preventDefault();
          void startPress();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          void endPress();
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={holding}
      >
        {holding ? "Listening…" : busy ? "Waiting…" : "Push to talk"}
      </button>
    </div>
  );
}
