import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const room = req.nextUrl.searchParams.get("room") || "ada-room";
    const identity = req.nextUrl.searchParams.get("identity") || "visitor-" + Math.random().toString(36).slice(2);

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
        return NextResponse.json({ error: "LiveKit credentials not configured" }, { status: 500 });
    }

    const token = new AccessToken(apiKey, apiSecret, { identity, ttl: "1h" });
    token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

    return NextResponse.json({ token: await token.toJwt(), url: process.env.NEXT_PUBLIC_LIVEKIT_URL });
}