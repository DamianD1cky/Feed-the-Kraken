import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { GameEvent } from "@feed/shared";
import { createLobbyPlayer, createLobbyState } from "../engine/setup.js";
import { projectView } from "./projectView.js";

test("projectView only reveals the viewer role and allowed pirate teammates", () => {
  const state = createStartedState();

  const pirateView = projectView(state, "pirate-1", []);
  const sailor = pirateView.players.find((player) => player.id === "sailor-1");
  const pirateTeammate = pirateView.players.find((player) => player.id === "pirate-2");

  assert.equal(pirateView.me.faction, "pirate");
  assert.equal(pirateView.me.role, "pirate");
  assert.equal(sailor?.faction, "unknown");
  assert.equal(sailor?.role, undefined);
  assert.equal(pirateTeammate?.faction, "pirate");
  assert.equal(pirateTeammate?.role, undefined);
});

test("projectView only sends navigation cards to the active officer", () => {
  const state = createStartedState();
  state.phase = "navigator_nav";
  state.offices.navigatorId = "sailor-1";
  state.hands.journal = [
    { id: "north-1", label: "邪教起义", direction: "north", dx: 0, dy: 1, effect: "cult_uprising" },
    { id: "east-1", label: "醉酒", direction: "east", dx: 1, dy: 0, effect: "drunk" },
  ];

  const navigatorView = projectView(state, "sailor-1", []);
  const bystanderView = projectView(state, "pirate-1", []);

  assert.deepEqual(navigatorView.hand, state.hands.journal);
  assert.equal(bystanderView.hand, undefined);
});

test("projectView exposes mutiny completion without private gun counts", () => {
  const state = createStartedState();
  state.phase = "mutiny";
  state.votes = { "pirate-1": 2 };

  const view = projectView(state, "sailor-1", [mutinyEvent(2)]);
  const pirate = view.players.find((player) => player.id === "pirate-1");

  assert.equal(pirate?.hasVoted, true);
  assert.doesNotMatch(view.publicLog.at(-1)?.message ?? "", /2/);
});

function createStartedState() {
  const state = createLobbyState("room-1");
  const players = [
    { id: "pirate-1", faction: "pirate" as const, role: "pirate" as const },
    { id: "pirate-2", faction: "pirate" as const, role: "pirate" as const },
    { id: "sailor-1", faction: "sailor" as const, role: "sailor" as const },
    { id: "cult-1", faction: "cult" as const, role: "cult_leader" as const },
  ];

  for (const player of players) {
    state.players[player.id] = createLobbyPlayer(player.id, player.id);
    state.players[player.id].faction = player.faction;
    state.players[player.id].role = player.role;
    state.seats.push(player.id);
  }

  state.phase = "officers";
  state.hostPlayerId = "pirate-1";
  state.offices.captainId = "pirate-1";
  return state;
}

function mutinyEvent(guns: number): GameEvent {
  return { type: "mutiny.committed", seq: 1, playerId: "pirate-1", guns, at: 1000 };
}
