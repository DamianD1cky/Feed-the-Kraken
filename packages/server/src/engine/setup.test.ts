import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Faction, GameState } from "@feed/shared";
import { assignHiddenRoles, createLobbyPlayer, createLobbyState } from "./setup.js";

test("assignHiddenRoles is reproducible for the same seed", () => {
  const first = createState(6);
  const second = createState(6);

  assignHiddenRoles(first, "fixed-seed");
  assignHiddenRoles(second, "fixed-seed");

  assert.deepEqual(factions(first), factions(second));
  assert.deepEqual(countFactions(first), { cult: 1, pirate: 2, sailor: 3 });
});

test("assignHiddenRoles five-player pool always includes cult and four others", () => {
  const state = createState(5);
  assignHiddenRoles(state, "five-seed");
  const counts = countFactions(state);
  assert.equal(counts.cult, 1);
  assert.equal(counts.sailor + counts.pirate, 4);
  assert.ok(counts.pirate >= 1 && counts.pirate <= 2);
});

function createState(count: number) {
  const state = createLobbyState("room-1");
  for (let index = 1; index <= count; index += 1) {
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
