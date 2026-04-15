import { NextRequest, NextResponse } from "next/server";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";

/** LiveKit API host (https) from env wss URL. */
function liveKitHost(): string | null {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;
  if (!url) return null;
  return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

function isLikelyVoiceAgentIdentity(identity: string | undefined | null): boolean {
  const id = (identity ?? "").toLowerCase();
  return id.startsWith("agent") || id.includes("agent_");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomName, participantName, skipAgentDispatch } = body as {
      roomName?: string;
      participantName?: string;
      /** Set true for phone "mic only" clients so the kiosk can dispatch the agent once. */
      skipAgentDispatch?: boolean;
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
    if (host && !skipAgentDispatch) {
      try {
        // Prevent multiple agents from being dispatched into the same room (which causes "double voices").
        const roomClient = new RoomServiceClient(host, apiKey, apiSecret);
        const participants = await roomClient.listParticipants(room);
        const agentAlreadyInRoom = participants.some((p: any) => {
          if (p?.kind != null && (p.kind === "AGENT" || p.kind === 2)) return true;
          if (p?.isAgent === true) return true;
          return isLikelyVoiceAgentIdentity(p?.identity);
        });
        if (agentAlreadyInRoom) {
          console.log("Agent already in room — skipping dispatch");
        } else {
        const dispatchClient = new AgentDispatchClient(host, apiKey, apiSecret);
        const dispatch = await dispatchClient.createDispatch(room, agentName);
        console.log("Agent dispatch OK:", JSON.stringify(dispatch));
        }
      } catch (dispatchErr: unknown) {
        const msg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
        console.error("AGENT DISPATCH FAILED:", msg);
        dispatchWarning = "Agent may not join. Is the voice agent worker running? (See README troubleshooting.)";
      }
    } else if (!skipAgentDispatch) {
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
