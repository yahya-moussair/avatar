import type { Participant } from "livekit-client";

/** LiveKit voice agents usually set isAgent; fall back to identity for older workers. */
export function isVoiceAgentParticipant(p: Participant): boolean {
  if (p.isAgent) return true;
  const id = p.identity.toLowerCase();
  return id.startsWith("agent") || id.includes("agent_");
}

export function isPhoneMicParticipant(p: Participant): boolean {
  return p.identity.startsWith("phone-");
}

export function isKioskUserParticipant(p: Participant): boolean {
  return p.identity.startsWith("user-");
}
