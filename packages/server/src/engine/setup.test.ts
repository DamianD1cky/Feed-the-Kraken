import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Faction, GameState } from "@feed/shared";
import { assignHiddenRoles, createLobbyPlayer, createLobbyState } from "./setup.js";

test("assignHiddenRoles is reproducible for the same seed", () => {
  const first = createState();
  const second = createState();

  assignHiddenRoles(first, "fixed-seed");
  assignHiddenRoles(second, "fixed-seed");

  assert.deepEqual(factions(first), factions(second));
  assert.deepEqual(countFactions(first), { cult: 1, pirate: 1, sailor: 3 });
});

test("assignHiddenRoles does not bind hidden factions to join order", () => {
  const state = createState();

  assignHiddenRoles(state, "known-non-order-seed");

  assert.notEqual(state.players["player-1"]?.faction, "pirate");
  assert.notEqual(state.players["player-5"]?.faction, "cult");
});

function createState() {
  const state = createLobbyState("room-1");
  for (let index = 1; index <= 5; index += 1) {
    const playerId = `player-${index}`;
    state.players[playerId] = createLobbyPlayer(playerId, `玩家 ${index}`);
    state.seats.push(playerId);
  }
  return state;
}

function factions(state: GameState) {
  return state.seats.map((playerId) => state.players[playerId]?.faction);
}

function countFactions(state: GameState) {
  return state.seats.reduce<Record<Faction, number>>(
    (counts, playerId) => {
      const faction = state.players[playerId]?.faction;
      if (faction) counts[faction] += 1;
      return counts;
    },
    { cult: 0, pirate: 0, sailor: 0 },
  );
}
