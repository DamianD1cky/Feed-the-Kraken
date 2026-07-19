import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createSessionExpiry,
  hashToken,
  isSessionExpired,
  verifyToken,
  type SessionRecord,
} from "./tokens.js";

test("reconnect session expiry is finite and enforced", () => {
  const now = 1_000;
  const expiresAt = createSessionExpiry(now);
  assert.ok(expiresAt > now);
  assert.ok(Number.isFinite(expiresAt));

  const session: SessionRecord = {
    playerId: "player-1",
    sessionTokenHash: hashToken("session-token"),
    reconnectTokenHash: hashToken("reconnect-token"),
    expiresAt,
  };

  assert.equal(isSessionExpired(session, expiresAt - 1), false);
  assert.equal(isSessionExpired(session, expiresAt), true);
  assert.equal(verifyToken("session-token", session.sessionTokenHash), true);
  assert.equal(verifyToken("wrong-token", session.sessionTokenHash), false);
});
