import { NextResponse } from "next/server";
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
import { isMode } from "@/lib/modes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const agentName = process.env.AGENT_NAME ?? "s2s-cascade";
  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({ error: "LiveKit env vars missing" }, { status: 500 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const mode = (body as { mode?: unknown })?.mode;
  if (!isMode(mode)) {
    return NextResponse.json({ error: "mode must be cascade | live | live-nobackend" }, { status: 400 });
  }

  // Unique room per session so the token's agent dispatch always applies
  // (dispatch-from-token only runs when the room is first created).
  const roomName = `demo-${mode}-${Math.random().toString(36).slice(2, 8)}`;
  const identity = `visitor-${Math.random().toString(36).slice(2, 8)}`;

  const at = new AccessToken(apiKey, apiSecret, { identity, ttl: "15m" });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName, metadata: JSON.stringify({ mode }) })],
  });

  return NextResponse.json({ token: await at.toJwt(), url, roomName, identity, mode });
}
