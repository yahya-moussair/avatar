import { NextRequest, NextResponse } from "next/server";
import { networkInterfaces } from "os";

function isIpv4Interface(net: { family: string | number; internal?: boolean }): boolean {
  if (net.internal) return false;
  return net.family === "IPv4" || net.family === 4;
}

/** First non-internal IPv4 (for QR when the kiosk was opened via localhost). Node may report family as 4 on Windows. */
function getLanIPv4(): string | null {
  const nets = networkInterfaces();
  if (!nets) return null;
  for (const key of Object.keys(nets)) {
    for (const net of nets[key] ?? []) {
      if (isIpv4Interface(net)) {
        return net.address;
      }
    }
  }
  return null;
}

function parseHostHeader(hostHeader: string): { hostname: string; port: string } {
  if (!hostHeader) return { hostname: "", port: "" };
  if (hostHeader.startsWith("[")) {
    const end = hostHeader.indexOf("]");
    if (end === -1) return { hostname: hostHeader, port: "" };
    const hostname = hostHeader.slice(1, end);
    const rest = hostHeader.slice(end + 1);
    const port = rest.startsWith(":") ? rest.slice(1) : "";
    return { hostname, port };
  }
  const colon = hostHeader.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(hostHeader.slice(colon + 1))) {
    return { hostname: hostHeader.slice(0, colon), port: hostHeader.slice(colon + 1) };
  }
  return { hostname: hostHeader, port: "" };
}

/**
 * Returns the URL encoded in the phone-mic QR.
 * - JOIN_QR_BASE_URL / NEXT_PUBLIC_APP_URL: use as-is (production or tunnel).
 * - Otherwise: same host as the request; if that is localhost, swap in the machine LAN IP so phones on Wi‑Fi can open the app.
 */
export async function GET(req: NextRequest) {
  const explicit =
    process.env.JOIN_QR_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    try {
      const raw = explicit.includes("://") ? explicit : `https://${explicit}`;
      const u = new URL(raw);
      if (!u.pathname || u.pathname === "") u.pathname = "/";
      u.hash = "";
      u.searchParams.set("join", "1");
      u.searchParams.set("role", "mic");
      return NextResponse.json({ url: u.toString() });
    } catch {
      return NextResponse.json({ error: "Invalid JOIN_QR_BASE_URL / NEXT_PUBLIC_APP_URL" }, { status: 500 });
    }
  }

  const hostHeader =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host") ||
    "";
  const protoHeader =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "";
  /** Mobile Chrome/Safari require a secure context (HTTPS) for getUserMedia on LAN IPs; plain http:// is blocked. */
  const requestIsHttps = req.nextUrl.protocol === "https:";
  const envHttps =
    process.env.JOIN_QR_USE_HTTPS === "1" || process.env.JOIN_QR_FORCE_HTTPS === "1";
  const useHttps =
    requestIsHttps || envHttps || protoHeader === "https";
  const proto = useHttps ? "https" : "http";

  let { hostname, port } = parseHostHeader(hostHeader);

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const lan = getLanIPv4();
    if (lan) {
      hostname = lan;
      port = port || process.env.PORT || "3000";
    }
  }

  if (!hostname) {
    const lan = getLanIPv4();
    const p = process.env.PORT || "3000";
    if (lan) {
      const scheme = useHttps ? "https" : "http";
      const u = new URL(`${scheme}://${lan}:${p}/`);
      u.searchParams.set("join", "1");
      u.searchParams.set("role", "mic");
      return NextResponse.json({ url: u.toString() });
    }
    return NextResponse.json(
      {
        error:
          "Could not build join URL. Open the app via your LAN IP or set JOIN_QR_BASE_URL.",
      },
      { status: 500 }
    );
  }

  if (!port) {
    if (proto === "https") {
      port = "443";
    } else {
      port = process.env.PORT || "3000";
    }
  }

  const omitPort =
    (proto === "https" && port === "443") || (proto === "http" && port === "80");
  const origin = omitPort
    ? `${proto}://${hostname}`
    : `${proto}://${hostname}:${port}`;

  const u = new URL(`${origin.replace(/\/$/, "")}/`);
  u.searchParams.set("join", "1");
  u.searchParams.set("role", "mic");
  u.hash = "";

  return NextResponse.json({ url: u.toString() });
}
