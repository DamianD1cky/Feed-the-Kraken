import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    PROTOCOL_VERSION,
    clientActionSchema,
    createQuickVoyageDeck,
    type ClientAction,
    type ClientActionEnvelope,
    type GameEvent,
    type GameState,
} from "@feed/shared";
import { reduceGameEvent, resolveOffDutyPlayerIds } from "../engine/reducer.js";
import { createLobbyState } from "../engine/setup.js";
import { projectView } from "../visibility/projectView.js";
import { KrakenRoom } from "./KrakenRoom.js";
import type { EventStore } from "../db/eventStore.js";

type Harness = {
    game: GameState;
    events: GameEvent[];
    nextSeq: number;
    eventStore: EventStore;
    applyAction(envelope: ClientActionEnvelope): void;
    runGameTransaction(work: () => void): void;
    reshuffleIfNeeded(minimum: number): void;
    beginShortCrewVoyage(): void;
    drawCultRitual(): void;
};
function setup(count = 7) {
    const room = new KrakenRoom() as unknown as Harness;
    const state = createLobbyState("test");
    for (let i = 0; i < count; i++)
        reduceGameEvent(state, {
            type: "player.joined",
            seq: i + 1,
            at: 1,
            playerId: `p${i}`,
            nickname: `船员${i}`,
        });
    reduceGameEvent(state, {
        type: "game.started",
        seq: count + 1,
        at: 1,
        seed: "regression",
        voyageMode: "quick",
    });
    room.game = state;
    room.events = [];
    room.nextSeq = count + 2;
    room.eventStore = { append() {} };
    const captain = state.offices.captainId!;
    const others = state.seats.filter((id) => id !== captain);
    state.offices = {
        captainId: captain,
        firstMateId: others[0],
        navigatorId: others[1],
    };
    return { room, state, captain, others };
}
function act(room: Harness, playerId: string, action: ClientAction) {
    room.applyAction({
        protocolVersion: PROTOCOL_VERSION,
        actionId: `a-${room.nextSeq}`,
        roomId: "test",
        playerId,
        action,
        sentAt: 1,
    });
}

test("eleven players receive five sailors, four pirates, a leader and an initial cultist", () => {
    const { state } = setup(11);
    const roles = Object.values(state.players).map((p) => p.role);
    assert.equal(roles.filter((r) => r === "sailor").length, 5);
    assert.equal(roles.filter((r) => r === "pirate").length, 4);
    assert.equal(roles.filter((r) => r === "cult_leader").length, 1);
    assert.equal(roles.filter((r) => r === "cultist").length, 1);
    const cult = state.seats.filter(
        (id) => state.players[id]!.faction === "cult",
    );
    assert.equal(
        projectView(state, cult[0]!, []).players.find((p) => p.id === cult[1])!
            .faction,
        "unknown",
    );
});

test("seven players may choose either voyage, incompatible player counts are rejected", () => {
    const { room, state } = setup(7);
    state.phase = "lobby";
    act(room, state.hostPlayerId!, { type: "startGame", voyageMode: "quick" });
    assert.equal(state.hands.deck.length, 19);
    const five = setup(5);
    five.state.phase = "lobby";
    assert.throws(
        () =>
            act(five.room, five.state.hostPlayerId!, {
                type: "startGame",
                voyageMode: "long",
            }),
        /7/,
    );
    const eleven = setup(11);
    eleven.state.phase = "lobby";
    assert.throws(
        () =>
            act(eleven.room, eleven.state.hostPlayerId!, {
                type: "startGame",
                voyageMode: "quick",
            }),
        /7/,
    );
});

test("guns gained beyond three can all be committed", () => {
    assert.equal(
        clientActionSchema.safeParse({ type: "commitMutiny", guns: 6 }).success,
        true,
    );
    const { room, state, others } = setup();
    state.phase = "mutiny";
    state.players[others[0]!]!.guns = 6;
    act(room, others[0]!, { type: "commitMutiny", guns: 6 });
    assert.equal(state.votes[others[0]!], 6);
});

test("cabin search waits for captain acknowledgement before effects clear private results", () => {
    const { room, state, captain, others } = setup();
    state.phase = "map_cabin";
    state.lastRevealedCard = createQuickVoyageDeck().find(
        (c) => c.effect === "drunk",
    );
    act(room, captain, { type: "pickPlayer", playerId: others[0]! });
    assert.equal(state.phase, "map_cabin");
    assert.equal(
        projectView(state, captain, []).cabinSearchFaction,
        state.players[others[0]!]!.faction,
    );
    assert.equal(
        projectView(state, others[1]!, []).cabinSearchFaction,
        undefined,
    );
    assert.equal(
        projectView(state, captain, []).privatePrompt?.action,
        "acknowledge",
    );
    act(room, captain, { type: "acknowledge" });
    assert.equal(state.phase, "officers");
});

test("drunk off-duty belongs to the team that actually navigated", () => {
    const { state, captain, others } = setup(9);
    state.voyageOffices = { ...state.offices };
    reduceGameEvent(state, {
        type: "effect.drunk",
        seq: 20,
        at: 1,
        fromCaptainId: captain,
        toCaptainId: others[2]!,
    });
    assert.deepEqual(resolveOffDutyPlayerIds(state), [
        captain,
        others[0],
        others[1],
    ]);
});

test("conversion preserves old pirate knowledge without revealing conversion, and teaches new cultist their leader", () => {
    const { state } = setup(11);
    const pirates = state.seats.filter(
        (id) => state.players[id]!.faction === "pirate",
    );
    const leader = state.seats.find(
        (id) => state.players[id]!.role === "cult_leader",
    )!;
    reduceGameEvent(state, {
        type: "ritual.converted",
        seq: 20,
        at: 1,
        targetId: pirates[0]!,
    });
    assert.equal(
        projectView(state, pirates[1]!, []).players.find(
            (p) => p.id === pirates[0],
        )!.faction,
        "pirate",
    );
    assert.equal(
        projectView(state, pirates[0]!, []).players.find(
            (p) => p.id === leader,
        )!.faction,
        "cult",
    );
    assert.equal(
        projectView(state, leader, []).players.find((p) => p.id === pirates[0])!
            .faction,
        "cult",
    );
    state.phase = "ended";
    assert.equal(
        projectView(state, pirates[1]!, []).players.find(
            (p) => p.id === pirates[0],
        )!.faction,
        "cult",
    );
});

test("reshuffle records complete order, excludes resumes and reproduces on replay", () => {
    const { room, state } = setup();
    const deck = createQuickVoyageDeck();
    state.hands.deck = deck.slice(0, 2);
    state.hands.discardPile = deck.slice(2, -1);
    state.hands.resumePile = deck.slice(-1);
    const before = structuredClone(state);
    room.reshuffleIfNeeded(4);
    assert.equal(state.hands.deck.length, 18);
    assert.equal(state.hands.discardPile.length, 0);
    for (const event of room.events) reduceGameEvent(before, event);
    assert.deepEqual(before.hands, state.hands);
    assert.ok(!state.hands.deck.some((c) => c.id === deck.at(-1)!.id));
});

test("telescope may not select captain; emergency navigator may not be the mate", () => {
    const { room, state, captain, others } = setup();
    state.phase = "effect_telescope";
    assert.throws(
        () => act(room, captain, { type: "pickPlayer", playerId: captain }),
        /其他玩家/,
    );
    assert.ok(
        !projectView(state, captain, []).privatePrompt?.candidates?.includes(
            captain,
        ),
    );
    state.phase = "emergency_navigator";
    assert.throws(
        () => act(room, captain, { type: "pickPlayer", playerId: others[0]! }),
        /兼任/,
    );
});

test("unavailable cult rituals finish without trapping the round", () => {
    const { room, state } = setup();
    state.pendingCultRitual = true;
    state.cultRitualDeck = ["conversion"];
    for (const p of Object.values(state.players)) p.conversionImmune = true;
    room.drawCultRitual();
    assert.equal(state.phase, "officers");
    assert.equal(state.cultRitualDeck.length, 0);
});

test("one remaining player gets random substitutes and reaches another navigation or victory", () => {
    const { room, state, captain } = setup();
    for (const player of Object.values(state.players))
        player.dead = player.id !== captain;
    room.beginShortCrewVoyage();
    const beforeRound = state.roundNo;
    act(room, captain, {
        type: "keepNavigationCard",
        cardId: state.hands.captainHand[0]!.id,
    });
    assert.ok(
        state.phase === "ended" ||
            (state.phase === "captain_nav" && state.roundNo > beforeRound),
    );
    assert.equal(state.hands.mateHand.length, 0);
});

test("failed multi-event action restores state, seq and event history", () => {
    const { room, state, captain } = setup();
    state.phase = "captain_nav";
    state.hands.captainHand = state.hands.deck.splice(0, 2);
    const before = structuredClone(state);
    const seq = room.nextSeq;
    let writes = 0;
    room.eventStore = {
        append() {
            if (++writes === 2) throw new Error("disk full");
        },
        transaction(work) {
            work();
        },
    };
    assert.throws(
        () =>
            room.runGameTransaction(() =>
                act(room, captain, {
                    type: "keepNavigationCard",
                    cardId: state.hands.captainHand[0]!.id,
                }),
            ),
        /disk full/,
    );
    assert.deepEqual(room.game, before);
    assert.equal(room.events.length, 0);
    assert.equal(room.nextSeq, seq);
});
