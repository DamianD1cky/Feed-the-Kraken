import { createHash, randomUUID } from "node:crypto";

export type SessionRecord = {
  playerId: string;
  sessionTokenHash: string;
  reconnectTokenHash: string;
  expiresAt: number;
};

const DEFAULT_RECONNECT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function reconnectSessionTtlMs() {
  const configured = Number(process.env.RECONNECT_SESSION_TTL_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_RECONNECT_SESSION_TTL_MS;
}

export function createToken() {
  return randomUUID() + "." + randomUUID();
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyToken(token: string | undefined, expectedHash: string) {
  return typeof token === "string" && hashToken(token) === expectedHash;
}

export function createSessionExpiry(now = Date.now()) {
  return now + reconnectSessionTtlMs();
}

export function isSessionExpired(session: SessionRecord, now = Date.now()) {
  return session.expiresAt <= now;
}
