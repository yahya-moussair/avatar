"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Props = {
  /** Slightly smaller QR when shown alongside connected UI */
  compact?: boolean;
};

/**
 * QR for phone mic mode (?join=1&role=mic).
 * URL comes from GET /api/join-url so localhost is replaced with the machine LAN IP when possible.
 */
export function PhoneJoinQr({ compact }: Props) {
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const res = await fetch("/api/join-url");
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        if (data.url && !cancelled) {
          setJoinUrl(data.url);
          return;
        }
      } catch {
        /* fall through to client fallback */
      }

      try {
        const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
        let u: URL;
        if (env) {
          const raw = env.includes("://") ? env : `https://${env}`;
          u = new URL(raw);
          if (!u.pathname || u.pathname === "") u.pathname = "/";
        } else {
          u = new URL(window.location.href);
        }
        u.hash = "";
        u.searchParams.set("join", "1");
        u.searchParams.set("role", "mic");
        if (!cancelled) setJoinUrl(u.toString());
      } catch {
        if (!cancelled) {
          setJoinUrl(null);
          setError("Could not build QR link");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const size = compact ? 104 : 128;

  if (error && !joinUrl) {
    return (
      <div className={`phone-join-qr ${compact ? "phone-join-qr--compact" : ""}`}>
        <p className="phone-join-qr-label">Phone mic</p>
        <p className="phone-join-qr-hint">{error}</p>
      </div>
    );
  }

  if (!joinUrl) {
    return (
      <div className={`phone-join-qr ${compact ? "phone-join-qr--compact" : ""}`}>
        <p className="phone-join-qr-label">Phone mic</p>
        <p className="phone-join-qr-hint">Preparing QR…</p>
      </div>
    );
  }

  return (
    <div className={`phone-join-qr ${compact ? "phone-join-qr--compact" : ""}`}>
      <p className="phone-join-qr-label">Talk on your phone</p>
      <div className="phone-join-qr-frame">
        <QRCodeSVG value={joinUrl} size={size} level="M" marginSize={2} />
      </div>
      <p className="phone-join-qr-url" title={joinUrl}>
        {joinUrl.replace(/^https?:\/\//, "")}
      </p>
      <p className="phone-join-qr-hint">
        Scan with your phone (same Wi‑Fi). Mic on phone — avatar and voice stay here.
      </p>
    </div>
  );
}
