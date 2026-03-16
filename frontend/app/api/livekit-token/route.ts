import { NextRequest, NextResponse } from "next/server";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";

/** LiveKit API host (https) from env wss URL. */
function liveKitHost(): string | null {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;
  if (!url) return null;
  return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomName, participantName } = body as {
      roomName?: string;
      participantName?: string;
    };

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 }
      );
    }

    const room = roomName || "voice-agent-room";
    const identity = participantName || `user-${Date.now()}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: participantName || identity,
      ttl: "2h",
    });
    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    // Explicitly request the voice agent to join this room (so Ada responds).
    let dispatchWarning: string | undefined;
    const host = liveKitHost();
    const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;
    const agentName = process.env.LIVEKIT_AGENT_NAME || "default";
    if (host) {
      try {
        const dispatchClient = new AgentDispatchClient(host, apiKey, apiSecret);
        const dispatch = await dispatchClient.createDispatch(room, agentName);
        console.log("Agent dispatch OK:", JSON.stringify(dispatch));
      } catch (dispatchErr: unknown) {
        const msg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
        console.error("AGENT DISPATCH FAILED:", msg);
        dispatchWarning = "Agent may not join. Is the voice agent worker running? (See README troubleshooting.)";
      }
    } else {
      console.error("NO LIVEKIT HOST — cannot dispatch agent");
      dispatchWarning = "LiveKit URL not set; agent will not be dispatched.";
    }

    return NextResponse.json({
      token,
      serverUrl: serverUrl ?? null,
      ...(dispatchWarning && { dispatchWarning }),
    });
  } catch (e) {
    console.error("Token error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Token generation failed" },
      { status: 500 }
    );
  }
}
