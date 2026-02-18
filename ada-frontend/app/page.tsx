"use client";

import { useState, useCallback, useEffect } from "react";
import {
  LiveKitRoom,
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
} from "@livekit/components-react";
import "@livekit/components-styles";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/token?room=ada-room&identity=visitor-" + Date.now());
      const data = await res.json();
      setToken(data.token);
      setUrl(data.url);
      setConnected(true);
    } catch (e) {
      console.error("Failed to get token", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return (
    <main className="ada-main">
      <div className="bg-texture" />
      <div className="vignette" />

      <header className="ada-header">
        <div className="header-ornament">✦</div>
        <h1 className="ada-title">Ada Lovelace</h1>
        <p className="ada-subtitle">Mathematician · Visionary · First Programmer</p>
        <div className="header-ornament">✦</div>
      </header>

      <div className="ada-content">
        {!connected ? (
          <LandingView onConnect={connect} loading={loading} />
        ) : (
          <LiveKitRoom
            token={token!}
            serverUrl={url!}
            connect={true}
            audio={true}
            video={false}
            onDisconnected={() => setConnected(false)}
            style={{ height: "100%" }}
          >
            <AdaInterface />
            <RoomAudioRenderer />
          </LiveKitRoom>
        )}
      </div>

      <footer className="ada-footer">
        <p>1815 – 1852 &nbsp;·&nbsp; London, England</p>
      </footer>
    </main>
  );
}

function LandingView({ onConnect, loading }: { onConnect: () => void; loading: boolean }) {
  return (
    <div className="landing">
      <div className="portrait-frame">
        <div className="portrait-glow" />
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/a/a4/Ada_Lovelace_portrait.jpg"
          alt="Ada Lovelace"
          className="ada-portrait"
        />
        <div className="portrait-border" />
      </div>

      <div className="landing-text">
        <blockquote className="ada-quote">
          "The Analytical Engine weaves algebraical patterns just as the Jacquard loom weaves flowers and leaves."
        </blockquote>
        <p className="landing-desc">
          Speak with Ada Lovelace — mathematician, writer, and the world's first computer programmer.
          Ask her about her life, her work with Charles Babbage, or her vision for the future of computing.
        </p>
        <button className="connect-btn" onClick={onConnect} disabled={loading}>
          {loading ? (
            <span className="btn-loading">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </span>
          ) : (
            <><span className="btn-icon">🎙</span> Begin Conversation</>
          )}
        </button>
      </div>
    </div>
  );
}

function AdaInterface() {
  const { state, audioTrack } = useVoiceAssistant();

  const isSpeaking = state === "speaking";
  const isListening = state === "listening";
  const isThinking = state === "thinking";

  return (
    <div className="ada-interface">
      <div className="avatar-section">
        <div className={`portrait-frame active ${isSpeaking ? "speaking" : ""}`}>
          <div className={`portrait-glow ${isSpeaking ? "pulse" : ""}`} />
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/a/a4/Ada_Lovelace_portrait.jpg"
            alt="Ada Lovelace"
            className="ada-portrait"
          />
          <div className="portrait-border" />
          {isSpeaking && (
            <div className="speaking-indicator">
              <BarVisualizer
                state={state}
                trackRef={audioTrack}
                barCount={5}
                style={{ height: "40px", width: "80px" }}
              />
            </div>
          )}
        </div>

        <div className="status-badge">
          {isSpeaking && <span className="status speaking">Ada is speaking...</span>}
          {isListening && <span className="status listening">Listening...</span>}
          {isThinking && <span className="status thinking">Ada is thinking...</span>}
          {state === "connecting" && <span className="status connecting">Connecting...</span>}
        </div>
      </div>

      <div className="controls-section">
        <p className="controls-hint">Speak naturally — Ada is listening</p>
        <VoiceAssistantControlBar />
      </div>
    </div>
  );
}