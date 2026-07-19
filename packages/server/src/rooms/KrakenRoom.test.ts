import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  PROTOCOL_VERSION,
  type ClientActionEnvelope,
  type GameEvent,
  type GameState,
} from "@feed/shared";
import type { EventStore } from "../db/eventStore.js";
import { reduceGameEvent } from "../engine/reducer.js";
import { createLobbyState } from "../engine/setup.js";
import { KrakenRoom } from "./KrakenRoom.js";

type RoomHarness = {
  game: GameState;
  events: GameEvent[];
  nextSeq: number;
  eventStore: EventStore;
  appendAndApply(event: unknown, envelope?: ClientActionEnvelope): void;
  maybeResolveMutiny(envelope?: ClientActionEnvelope): void;
};

function asHarness(room: KrakenRoom) {
  return room as unknown as RoomHarness;
}

test("only the first event derived from an action persists its idempotency key", () => {
  const room = asHarness(new KrakenRoom());
  const persisted: Array<{ actionId?: string; playerId?: string }> = [];
  room.eventStore = {
    append(_roomId, _event, actionId, playerId) {
      persisted.push({ actionId, playerId });
    },
  };
  const envelope: ClientActionEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    actionId: "action-1",
    roomId: "pending",
    playerId: "player-1",
    action: { type: "commitMutiny", guns: 0 },
    sentAt: 1,
  };

  room.appendAndApply(
    { type: "player.joined", playerId: "player-1", nickname: "甲" },
    envelope,
  );
  room.appendAndApply(
    { type: "session.disconnected", playerId: "player-1" },
    envelope,
  );

  assert.deepEqual(persisted, [
    { actionId: "action-1", playerId: "player-1" },
    { actionId: undefined, playerId: undefined },
  ]);
});

test("a player disconnected before mutiny is auto-committed with zero guns", () => {
  const state = createLobbyState("room-disconnected-mutiny");
  for (let index = 0; index < 5; index += 1) {
    reduceGameEvent(state, {
      type: "player.joined",
      seq: index + 1,
      playerId: `p${index}`,
      nickname: `玩家${index}`,
      at: index + 1,
    });
  }
  reduceGameEvent(state, {
    type: "game.started",
    seq: 6,
    seed: "disconnect-seed",
    at: 6,
  });
  const captainId = state.offices.captainId!;
  const voters = state.seats.filter((id) => id !== captainId);
  reduceGameEvent(state, {
    type: "officers.assigned",
    seq: 7,
    firstMateId: voters[0]!,
    navigatorId: voters[1]!,
    at: 7,
  });

  const disconnectedId = voters.at(-1)!;
  state.players[disconnectedId]!.connected = false;
  for (const voterId of voters.slice(0, -1)) state.votes[voterId] = 0;

  const room = asHarness(new KrakenRoom());
  const persistedTypes: string[] = [];
  room.game = state;
  room.events = [];
  room.nextSeq = 8;
  room.eventStore = {
    append(_roomId, event) {
      persistedTypes.push(event.type);
    },
  };

  room.maybeResolveMutiny();

  assert.equal(state.phase, "captain_nav");
  assert.deepEqual(persistedTypes.slice(0, 2), [
    "mutiny.committed",
    "mutiny.resolved",
  ]);
  assert.ok(persistedTypes.includes("navigation.dealt"));
});
