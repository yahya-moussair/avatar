"use client";

import { useState, useCallback, useEffect } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRemoteParticipants,
  useConnectionState,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { AvatarScene } from "@/components/AvatarScene";
import { useRemoteAudioLevel } from "@/components/useRemoteAudioLevel";
import { useLipSync } from "@/components/useLipSync";
import type { AudioBands } from "@/components/useRemoteAudioLevel";
import type { LipSyncState } from "@/components/useLipSync";

const ROOM_NAME = "voice-agent-room";

const DEFAULT_AUDIO_PROPS = {
  volume: 0,
  bandsRef: undefined as React.RefObject<AudioBands> | undefined,
  lipSyncRef: undefined as React.RefObject<LipSyncState> | undefined,
  consumeVisemes: undefined as ((bandsRef: React.RefObject<AudioBands> | undefined, delta: number) => void) | undefined,
};

function RoomContent({
  onDisconnect,
  setAudioSceneProps,
}: {
  onDisconnect: () => void;
  setAudioSceneProps: (p: typeof DEFAULT_AUDIO_PROPS) => void;
}) {
  const { volume, bandsRef } = useRemoteAudioLevel();
  const { lipSyncRef, consumeVisemes } = useLipSync();
  const remoteParticipants = useRemoteParticipants();
  const connectionState = useConnectionState();

  useEffect(() => {
    setAudioSceneProps({ volume, bandsRef, lipSyncRef, consumeVisemes });
    return () => setAudioSceneProps(DEFAULT_AUDIO_PROPS);
  }, [volume, bandsRef, lipSyncRef, consumeVisemes, setAudioSceneProps]);

  const agentConnected = remoteParticipants.length > 0;
  let statusText = "Connecting to room…";
  let statusClass = "";

  if (connectionState === ConnectionState.Connected) {
    if (agentConnected) {
      statusText = "Connected — speak to Ada";
      statusClass = "connected";
    } else {
      statusText = "Waiting for Ada to join…";
      statusClass = "waiting";
    }
  } else if (connectionState === ConnectionState.Disconnected) {
    statusText = "Disconnected";
    statusClass = "disconnected";
  }

  return (
    <>
      <RoomAudioRenderer />
      <div className={`status ${statusClass}`}>{statusText}</div>
      <div className="controls">
        <button className="btn-disconnect" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    </>
  );
}

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [audioSceneProps, setAudioSceneProps] = useState<typeof DEFAULT_AUDIO_PROPS>(DEFAULT_AUDIO_PROPS);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      const res = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: ROOM_NAME,
          participantName: `user-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setToken(data.token);
      setServerUrl(data.serverUrl);
      setStatus("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get token");
      setStatus("error");
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    setToken(null);
    setServerUrl(null);
    setStatus("idle");
    setAudioSceneProps(DEFAULT_AUDIO_PROPS);
  }, []);

  return (
    <div className="app">
      <div className="canvas-wrap" />
      {/* Avatar and environment mount once and stay mounted; only audio/connection changes on Connect */}
      <AvatarScene
        volume={audioSceneProps.volume}
        bandsRef={audioSceneProps.bandsRef}
        lipSyncRef={audioSceneProps.lipSyncRef}
        consumeVisemes={audioSceneProps.consumeVisemes}
      />
      {token && serverUrl ? (
        <LiveKitRoom
          serverUrl={serverUrl}
          token={token}
          connect={true}
          audio={true}
          video={false}
          onDisconnected={handleDisconnect}
          onError={(err) => {
            setError(err.message);
            setStatus("error");
          }}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <div style={{ pointerEvents: "auto" }}>
            <RoomContent onDisconnect={handleDisconnect} setAudioSceneProps={setAudioSceneProps} />
          </div>
        </LiveKitRoom>
      ) : (
        <>
          <h1 className="title">Avatar <span>·</span> Ada Lovelace</h1>
          <div className={`status ${status === "error" ? "disconnected" : ""}`}>
            {status === "idle" && "Click Connect to start"}
            {status === "connecting" && "Connecting…"}
            {status === "error" && (error || "Connection failed")}
          </div>
          <div className="controls">
            <button
              className="btn-connect"
              onClick={connect}
              disabled={status === "connecting"}
            >
              {status === "connecting" ? "Connecting…" : "Connect"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
