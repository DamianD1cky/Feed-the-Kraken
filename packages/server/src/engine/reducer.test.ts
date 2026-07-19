import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { GameEvent } from "@feed/shared";
import { reduceGameEvent, resolveOffDutyPlayerIds } from "./reducer.js";
import { createLobbyState } from "./setup.js";

test("mutiny failure proceeds to navigation deal phase; success can change captain", () => {
  const state = createLobbyState("room-mutiny");
  for (const event of joinEvents(5)) reduceGameEvent(state, event);
  reduceGameEvent(state, { type: "game.started", seq: 6, seed: "m-seed", at: 6 });
  const captainId = state.offices.captainId!;
  const others = state.seats.filter((id) => id !== captainId);
  reduceGameEvent(state, {
    type: "officers.assigned",
    seq: 7,
    firstMateId: others[0]!,
    navigatorId: others[1]!,
    at: 7,
  });
  assert.equal(state.phase, "mutiny");

  for (const id of others) {
    reduceGameEvent(state, { type: "mutiny.committed", seq: 8, playerId: id, guns: 0, at: 8 });
  }
  reduceGameEvent(state, { type: "mutiny.resolved", seq: 9, totalGuns: 0, success: false, at: 9 });
  assert.equal(state.phase, "captain_nav");
  assert.equal(state.offices.captainId, captainId);

  // success path
  state.phase = "mutiny";
  state.votes = { [others[0]!]: 3, [others[1]!]: 0, [others[2]!]: 0, [others[3]!]: 0 };
  reduceGameEvent(state, {
    type: "mutiny.resolved",
    seq: 10,
    totalGuns: 3,
    success: true,
    candidates: [others[0]!],
    at: 10,
  });
  reduceGameEvent(state, { type: "mutiny.captain_changed", seq: 11, captainId: others[0]!, at: 11 });
  assert.equal(state.offices.captainId, others[0]);
  assert.equal(state.phase, "officers");
  assert.equal(state.players[others[0]!]?.guns, 0); // spent 3
});

test("mutiny tie-break authority passes to each eliminated candidate", () => {
  const state = createLobbyState("room-mutiny-tie");
  for (const event of joinEvents(5)) reduceGameEvent(state, event);
  reduceGameEvent(state, { type: "game.started", seq: 6, seed: "tie-seed", at: 6 });

  const captainId = state.offices.captainId!;
  const others = state.seats.filter((id) => id !== captainId);
  const [alpha, beta, gamma, bystander] = others;
  reduceGameEvent(state, {
    type: "officers.assigned",
    seq: 7,
    firstMateId: alpha!,
    navigatorId: beta!,
    at: 7,
  });
  state.votes = {
    [alpha!]: 3,
    [beta!]: 3,
    [gamma!]: 3,
    [bystander!]: 0,
  };

  reduceGameEvent(state, {
    type: "mutiny.resolved",
    seq: 8,
    totalGuns: 9,
    success: true,
    candidates: [alpha!, beta!, gamma!],
    at: 8,
  });
  assert.equal(state.phase, "mutiny_tiebreak");
  assert.equal(state.mutinyEliminatorId, captainId);

  reduceGameEvent(state, {
    type: "mutiny.tie_eliminated",
    seq: 9,
    playerId: alpha!,
    at: 9,
  });
  assert.deepEqual(state.mutinyTieCandidates, [beta, gamma]);
  assert.equal(state.mutinyEliminatorId, alpha);

  reduceGameEvent(state, {
    type: "mutiny.tie_eliminated",
    seq: 10,
    playerId: gamma!,
    at: 10,
  });
  assert.deepEqual(state.mutinyTieCandidates, [beta]);
  assert.equal(state.mutinyEliminatorId, undefined);

  reduceGameEvent(state, {
    type: "mutiny.captain_changed",
    seq: 11,
    captainId: beta!,
    at: 11,
  });
  assert.equal(state.offices.captainId, beta);
  assert.equal(state.players[alpha!]?.guns, 0);
  assert.equal(state.players[beta!]?.guns, 0);
  assert.equal(state.players[gamma!]?.guns, 0);
});

test("navigation keep chain and off-duty for 5 players uses quick deck", () => {
  const state = createLobbyState("room-nav");
  for (const event of joinEvents(5)) reduceGameEvent(state, event);
  reduceGameEvent(state, { type: "game.started", seq: 6, seed: "nav-seed", at: 6 });
  assert.equal(state.voyageMode, "quick");
  assert.equal(state.hands.deck.length, 19);
  assert.equal(state.cultRitualDeck.length, 5);

  const captainId = state.offices.captainId!;
  const others = state.seats.filter((id) => id !== captainId);
  reduceGameEvent(state, {
    type: "officers.assigned",
    seq: 7,
    firstMateId: others[0]!,
    navigatorId: others[1]!,
    at: 7,
  });

  const [c1, c2, m1, m2] = state.hands.deck;
  reduceGameEvent(state, {
    type: "navigation.dealt",
    seq: 8,
    holderId: captainId,
    cardIds: [c1!.id, c2!.id],
    role: "captain",
    at: 8,
  });
  reduceGameEvent(state, {
    type: "navigation.kept",
    seq: 9,
    playerId: captainId,
    keptCardId: c1!.id,
    discardedCardId: c2!.id,
    role: "captain",
    at: 9,
  });
  reduceGameEvent(state, {
    type: "navigation.dealt",
    seq: 10,
    holderId: others[0]!,
    cardIds: [m1!.id, m2!.id],
    role: "mate",
    at: 10,
  });
  reduceGameEvent(state, {
    type: "navigation.kept",
    seq: 11,
    playerId: others[0]!,
    keptCardId: m1!.id,
    discardedCardId: m2!.id,
    role: "mate",
    at: 11,
  });
  reduceGameEvent(state, {
    type: "navigation.journal_ready",
    seq: 12,
    cardIds: [c1!.id, m1!.id],
    at: 12,
  });
  assert.equal(state.phase, "navigator_nav");

  const offDuty = resolveOffDutyPlayerIds(state);
  assert.deepEqual(offDuty, [others[1]!]);
});

test("seven players start long voyage with 23-card deck and flog/tongue map", () => {
  const state = createLobbyState("room-long");
  for (const event of joinEvents(7)) reduceGameEvent(state, event);
  reduceGameEvent(state, { type: "game.started", seq: 8, seed: "long-seed", at: 8 });
  assert.equal(state.voyageMode, "long");
  assert.equal(state.hands.deck.length, 23);
  assert.ok(state.hands.deck.some((card) => card.effect === "armed"));
  assert.equal(Object.values(state.mapActions).filter((action) => action === "flogging").length, 2);
  assert.equal(Object.values(state.mapActions).filter((action) => action === "tongue").length, 1);
  assert.equal(Object.values(state.mapActions).filter((action) => action === "cabin_search").length, 4);
  assert.equal(Object.values(state.mapActions).filter((action) => action === "feed_kraken").length, 3);
});

test("flogging reveals a not-faction and immunizes conversion; supply refills guns", () => {
  const state = createLobbyState("room-flog");
  for (const event of joinEvents(7)) reduceGameEvent(state, event);
  reduceGameEvent(state, { type: "game.started", seq: 8, seed: "flog-seed", at: 8 });
  const targetId = state.seats[1]!;
  const captainId = state.offices.captainId!;
  state.players[targetId]!.guns = 1;
  reduceGameEvent(state, {
    type: "map.flogging",
    seq: 9,
    captainId,
    targetId,
    notFaction: "pirate",
    at: 9,
  });
  assert.equal(state.players[targetId]!.conversionImmune, true);
  assert.deepEqual(state.players[targetId]!.notFactions, ["pirate"]);

  reduceGameEvent(state, { type: "map.tongue", seq: 10, captainId, targetId, at: 10 });
  assert.equal(state.players[targetId]!.muted, true);

  reduceGameEvent(state, { type: "supply.crossed", seq: 11, at: 11 });
  assert.equal(state.supplyLineCrossed, true);
  assert.equal(state.players[targetId]!.guns, 3);
});

test("feed kraken on cult leader ends with cult win", () => {
  const state = createLobbyState("room-feed");
  for (const event of joinEvents(5)) reduceGameEvent(state, event);
  reduceGameEvent(state, { type: "game.started", seq: 6, seed: "feed-seed", at: 6 });
  const cultLeader = state.seats.find((id) => state.players[id]?.role === "cult_leader")!;
  const captainId = state.offices.captainId!;
  reduceGameEvent(state, {
    type: "map.feed_kraken",
    seq: 7,
    captainId,
    targetId: cultLeader,
    at: 7,
  });
  assert.equal(state.winner, "cult");
  assert.equal(state.phase, "ended");
});

function joinEvents(count: number): GameEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    type: "player.joined" as const,
    seq: index + 1,
    playerId: `p${index + 1}`,
    nickname: `玩家${index + 1}`,
    at: index + 1,
  }));
}
