"use client";

import { useState, useCallback } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { AvatarScene } from "@/components/AvatarScene";
import { useRemoteAudioLevel } from "@/components/useRemoteAudioLevel";

const ROOM_NAME = "voice-agent-room";

function RoomContent({ onDisconnect }: { onDisconnect: () => void }) {
  const volume = useRemoteAudioLevel();

  return (
    <>
      <RoomAudioRenderer volume={1} />
      <AvatarScene volume={volume} />
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
  }, []);

  if (token && serverUrl) {
    return (
      <div className="app">
        <div className="canvas-wrap" />
        <div className="status connected">Connected — speak to Ada</div>
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
          style={{ width: "100%", height: "100%" }}
        >
          <RoomContent onDisconnect={handleDisconnect} />
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="canvas-wrap" />
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
      <AvatarScene volume={0} />
    </div>
  );
}
