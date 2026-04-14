"use client";

import { useState, useCallback, useEffect, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
import { useAgentSubtitles } from "@/components/useAgentSubtitles";
import type { AudioBands } from "@/components/useRemoteAudioLevel";
import type { LipSyncState } from "@/components/useLipSync";
import { PhoneJoinQr } from "@/components/PhoneJoinQr";
import { ConnectionStatusBar } from "@/components/ConnectionStatusBar";
import { PushToTalkBar } from "@/components/PushToTalkBar";
import { isVoiceAgentParticipant } from "@/lib/livekitParticipants";

const ROOM_NAME = "voice-agent-room";

const SESSION_AUTOJOIN_KEY = "ada_qr_autojoin";

const DEFAULT_AUDIO_PROPS = {
  volume: 0,
  bandsRef: undefined as React.RefObject<AudioBands> | undefined,
  lipSyncRef: undefined as React.RefObject<LipSyncState> | undefined,
  consumeVisemes: undefined as ((bandsRef: React.RefObject<AudioBands> | undefined, delta: number) => void) | undefined,
};

function RoomContent({
  onDisconnect,
  setAudioSceneProps,
  dispatchWarning,
}: {
  onDisconnect: () => void;
  setAudioSceneProps: (p: typeof DEFAULT_AUDIO_PROPS) => void;
  dispatchWarning: string | null;
}) {
  const { volume, bandsRef } = useRemoteAudioLevel();
  const { lipSyncRef, consumeVisemes } = useLipSync();
  const agentSubtitle = useAgentSubtitles();
  const remoteParticipants = useRemoteParticipants();
  const connectionState = useConnectionState();

  useEffect(() => {
    setAudioSceneProps({ volume, bandsRef, lipSyncRef, consumeVisemes });
    return () => setAudioSceneProps(DEFAULT_AUDIO_PROPS);
  }, [volume, bandsRef, lipSyncRef, consumeVisemes, setAudioSceneProps]);

  const agentConnected = remoteParticipants.some((p) => isVoiceAgentParticipant(p));
  let statusText = "Connecting to room…";
  let statusClass = "";

  if (connectionState === ConnectionState.Connected) {
    if (agentConnected) {
      statusText =
        "Ready — use your phone (QR): hold Push to talk there; release to run STT → Groq → TTS. Ada speaks on this screen.";
      statusClass = "connected";
    } else {
      statusText =
        "Room connected — waiting for Ada. Start the voice agent worker, or disconnect and try again.";
      statusClass = "waiting";
    }
  } else if (connectionState === ConnectionState.Disconnected) {
    statusText = "Disconnected";
    statusClass = "disconnected";
  }

  return (
    <>
      <RoomAudioRenderer />
      {agentSubtitle ? (
        <div className="ai-subtitles" role="status" aria-live="polite">
          <span className="ai-subtitles-label">Ada</span>
          <p className="ai-subtitles-text">{agentSubtitle}</p>
        </div>
      ) : null}
      <div className={`status ${statusClass}`}>{statusText}</div>
      {dispatchWarning && (
        <div className="status waiting" style={{ marginTop: "0.25rem", fontSize: "0.85rem" }}>
          {dispatchWarning}
        </div>
      )}
      <ConnectionStatusBar variant="kiosk" />
      <PhoneJoinQr compact />
      <div className="controls">
        <button className="btn-disconnect" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    </>
  );
}

/** Phone / tablet: publish mic only; no agent audio here — avatar + voice stay on the kiosk browser. */
function MicOnlyRoomContent({
  onDisconnect,
  dispatchWarning,
}: {
  onDisconnect: () => void;
  dispatchWarning: string | null;
}) {
  const remoteParticipants = useRemoteParticipants();
  const connectionState = useConnectionState();
  const agentConnected = remoteParticipants.some((p) => isVoiceAgentParticipant(p));
  const kioskInRoom = remoteParticipants.some(
    (p) => p.identity.startsWith("user-") && !isVoiceAgentParticipant(p)
  );

  const insecureMic = useMemo(
    () => typeof window !== "undefined" && !window.isSecureContext,
    []
  );

  let statusText = "Connecting…";
  let statusClass = "";
  if (connectionState === ConnectionState.Connected) {
    if (agentConnected) {
      statusText = kioskInRoom
        ? "Hold Push to talk — release to send your speech to Ada (reply plays on the main screen)."
        : "Ada is in the room but the main screen left — reconnect the kiosk, or speak if you still hear Ada.";
      statusClass = "connected";
    } else {
      statusText =
        "Waiting for Ada. On the main computer: open this app (same Wi‑Fi), tap Connect, wait for green “Ada in room”, then scan the QR from the phone.";
      statusClass = "waiting";
    }
  } else if (connectionState === ConnectionState.Disconnected) {
    statusText = "Disconnected";
    statusClass = "disconnected";
  }

  return (
    <>
      <ConnectionStatusBar variant="mic" />
      {insecureMic ? (
        <div className="ios-mic-warning" role="alert">
          Your address bar shows <strong>http://</strong>. On a phone, <strong>Chrome and Safari</strong>{" "}
          (including <strong>Chrome on iPhone</strong>, which uses the same rules as Safari) hide{" "}
          <code className="ios-mic-code">navigator.mediaDevices</code> for plain HTTP on a Wi‑Fi IP — that
          breaks the mic. Close this tab, run <code className="ios-mic-code">npm run dev:lan</code> on the
          PC, open <code className="ios-mic-code">https://localhost:3000</code> on the kiosk, scan the QR
          again, and open <strong>https://192.168…</strong> on the phone. Trust the dev certificate once.
        </div>
      ) : null}
      <div className={`status mic-only-banner ${statusClass}`}>{statusText}</div>
      {connectionState === ConnectionState.Connected && agentConnected ? (
        <PushToTalkBar disabled={false} />
      ) : null}
      {dispatchWarning ? (
        <div className="status waiting mic-only-banner" style={{ marginTop: "0.35rem", fontSize: "0.8rem" }}>
          {dispatchWarning}
        </div>
      ) : null}
      <div className="controls mic-only-controls">
        <button type="button" className="btn-disconnect" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    </>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const roleMic = searchParams.get("role") === "mic";
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dispatchWarning, setDispatchWarning] = useState<string | null>(null);
  const [audioSceneProps, setAudioSceneProps] = useState<typeof DEFAULT_AUDIO_PROPS>(DEFAULT_AUDIO_PROPS);

  const connect = useCallback(async (): Promise<boolean> => {
    setStatus("connecting");
    setError(null);
    try {
      const res = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: ROOM_NAME,
          participantName: roleMic
            ? `phone-${Math.random().toString(36).slice(2, 10)}`
            : `user-${Math.random().toString(36).slice(2, 8)}`,
          skipAgentDispatch: roleMic,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.serverUrl == null) {
        throw new Error("Server URL not configured. Set LIVEKIT_URL or NEXT_PUBLIC_LIVEKIT_URL.");
      }
      setToken(data.token);
      setServerUrl(data.serverUrl);
      setDispatchWarning(data.dispatchWarning ?? null);
      setStatus("connected");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get token");
      setStatus("error");
      return false;
    }
  }, [roleMic]);

  useEffect(() => {
    if (searchParams.get("join") !== "1") return;
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_AUTOJOIN_KEY) === "pending") {
        return;
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(SESSION_AUTOJOIN_KEY, "pending");
      }
    } catch {
      /* private / SSR */
    }
    void connect().then(() => {
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem(SESSION_AUTOJOIN_KEY);
        }
      } catch {
        /* ignore */
      }
    });
  }, [searchParams, connect]);

  const handleDisconnect = useCallback(() => {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(SESSION_AUTOJOIN_KEY);
      }
    } catch {
      /* ignore */
    }
    setToken(null);
    setServerUrl(null);
    setStatus("idle");
    setDispatchWarning(null);
    setAudioSceneProps(DEFAULT_AUDIO_PROPS);
  }, []);

  return (
    <div className={`app${roleMic ? " app--mic-client" : ""}`}>
      <div className="canvas-wrap" />
      {!roleMic ? (
        <AvatarScene
          volume={audioSceneProps.volume}
          bandsRef={audioSceneProps.bandsRef}
          lipSyncRef={audioSceneProps.lipSyncRef}
          consumeVisemes={audioSceneProps.consumeVisemes}
          isConnected={!!(token && serverUrl)}
        />
      ) : null}
      {token && serverUrl ? (
        <LiveKitRoom
          serverUrl={serverUrl}
          token={token}
          connect={true}
          audio={false}
          video={false}
          onDisconnected={handleDisconnect}
          onError={(err) => {
            setError(err.message);
            setStatus("error");
          }}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <div style={{ pointerEvents: "auto" }}>
            {roleMic ? (
              <MicOnlyRoomContent onDisconnect={handleDisconnect} dispatchWarning={dispatchWarning} />
            ) : (
              <RoomContent onDisconnect={handleDisconnect} setAudioSceneProps={setAudioSceneProps} dispatchWarning={dispatchWarning} />
            )}
          </div>
        </LiveKitRoom>
      ) : (
        <>
          <h1 className="title">
            {roleMic ? (
              <>
                Ada <span>·</span> phone mic
              </>
            ) : (
              <>
                Avatar <span>·</span> Ada Lovelace
              </>
            )}
          </h1>
          {!roleMic ? <PhoneJoinQr /> : null}
          <div className={`status ${status === "error" ? "disconnected" : ""}`}>
            {status === "idle" &&
              (roleMic
                ? "Tap Connect after the main screen is in the room (Connect there first)."
                : "Connect for the avatar · then hold Push to talk (release to process your turn). Scan the QR for the phone mic.")}
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

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="app">
          <div className="canvas-wrap" />
          <div className="status">Loading…</div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
