import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { GameEvent } from "@feed/shared";
import { reduceGameEvent } from "../engine/reducer.js";
import { createLobbyState } from "../engine/setup.js";
import { actionKey, restoreRoom } from "./roomRecovery.js";
import { createEventStore, type EventStore } from "./eventStore.js";

function databasePath(name: string) {
  return join(mkdtempSync(join(tmpdir(), `feed-kraken-${name}-`)), "test.sqlite");
}

function requirePersistence(store: EventStore) {
  assert.ok(store.transaction);
  assert.ok(store.registerRoom);
  assert.ok(store.saveSnapshot);
  assert.ok(store.loadEvents);
  assert.ok(store.loadSnapshot);
  assert.ok(store.listRecoverableRoomIds);
  assert.ok(store.upsertSession);
  assert.ok(store.loadSessions);
}

test("SQLite persists snapshots, sessions and replays events after the snapshot", () => {
  const path = databasePath("restore");
  const roomId = "restore-room";
  const state = createLobbyState(roomId);
  const joined: GameEvent = {
    type: "player.joined",
    seq: 1,
    playerId: "p1",
    nickname: "船员一",
    at: 1,
  };
  const phaseChanged: GameEvent = {
    type: "phase.set",
    seq: 2,
    phase: "officers",
    at: 2,
  };
  const session = {
    playerId: "p1",
    sessionTokenHash: "session-hash",
    reconnectTokenHash: "reconnect-hash",
    expiresAt: Date.now() + 60_000,
  };

  const first = createEventStore(path);
  requirePersistence(first);
  first.registerRoom!(roomId, state);
  first.transaction!(() => {
    first.append(roomId, joined, "join-action", "p1");
    reduceGameEvent(state, joined);
    first.upsertSession!(roomId, session);
    first.saveSnapshot!(roomId, 1, state);
  });
  // 模拟快照之后已有已提交事件；恢复器必须从 seq=2 继续重放。
  first.append(roomId, phaseChanged);
  first.close?.();

  const second = createEventStore(path);
  requirePersistence(second);
  assert.deepEqual(second.listRecoverableRoomIds!(), [roomId]);
  const restored = restoreRoom(second, roomId);
  assert.ok(restored);
  assert.equal(restored.nextSeq, 3);
  assert.equal(restored.events.length, 2);
  assert.equal(restored.game.phase, "officers");
  assert.equal(restored.game.players.p1?.connected, false);
  assert.deepEqual(restored.sessions.get("p1"), session);
  assert.equal(
    restored.acceptedActionKeys.has(actionKey("p1", "join-action")),
    true,
  );
  second.close?.();
});

test("SQLite rolls back an action and its snapshot atomically", () => {
  const store = createEventStore(databasePath("rollback"));
  requirePersistence(store);
  const roomId = "rollback-room";
  const state = createLobbyState(roomId);
  store.registerRoom!(roomId, state);
  const joined: GameEvent = {
    type: "player.joined",
    seq: 1,
    playerId: "p1",
    nickname: "船员一",
    at: 1,
  };

  assert.throws(() =>
    store.transaction!(() => {
      store.append(roomId, joined);
      reduceGameEvent(state, joined);
      store.saveSnapshot!(roomId, 1, state);
      throw new Error("abort");
    }),
  );
  assert.deepEqual(store.loadEvents!(roomId), []);
  assert.equal(store.loadSnapshot!(roomId)?.seq, 0);
  store.close?.();
});
