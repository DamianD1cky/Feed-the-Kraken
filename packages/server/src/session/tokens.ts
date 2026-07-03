import { createHash, randomUUID } from "node:crypto";

export type SessionRecord = {
  playerId: string;
  sessionTokenHash: string;
  reconnectTokenHash: string;
};

export function createToken() {
  return randomUUID() + "." + randomUUID();
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyToken(token: string | undefined, expectedHash: string) {
  return typeof token === "string" && hashToken(token) === expectedHash;
}
