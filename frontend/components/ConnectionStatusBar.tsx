"use client";

import { useRemoteParticipants, useConnectionState, useRoomContext } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import {
  isVoiceAgentParticipant,
  isPhoneMicParticipant,
  isKioskUserParticipant,
} from "@/lib/livekitParticipants";

type Props = { variant: "kiosk" | "mic" };

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`conn-pill ${ok ? "conn-pill--ok" : "conn-pill--no"}`}>
      <span className="conn-pill-dot" aria-hidden />
      {label}
    </span>
  );
}

export function ConnectionStatusBar({ variant }: Props) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const remotes = useRemoteParticipants();

  const lkConnected = connectionState === ConnectionState.Connected;
  const lkConnecting = connectionState === ConnectionState.Connecting;

  const agentHere = remotes.some((p) => isVoiceAgentParticipant(p));
  const phoneHere = remotes.some((p) => isPhoneMicParticipant(p));
  const kioskHere = remotes.some((p) => isKioskUserParticipant(p));

  const micOn = room?.localParticipant?.isMicrophoneEnabled ?? false;

  let roomLine = "LiveKit: …";
  if (connectionState === ConnectionState.Disconnected) roomLine = "LiveKit: disconnected";
  else if (lkConnecting) roomLine = "LiveKit: connecting…";
  else if (lkConnected) roomLine = "LiveKit: connected to room";

  return (
    <div className="connection-status-bar" role="status">
      <div className="connection-status-title">Connection</div>
      <div className="connection-status-line">{roomLine}</div>
      <div className="connection-status-pills">
        <Pill ok={lkConnected && micOn} label="Microphone publishing" />
        <Pill ok={lkConnected && agentHere} label="Ada (agent) in room" />
        {variant === "kiosk" ? (
          <Pill ok={lkConnected && phoneHere} label="Phone mic in room" />
        ) : (
          <Pill ok={lkConnected && kioskHere} label="Main screen in room" />
        )}
      </div>
    </div>
  );
}
