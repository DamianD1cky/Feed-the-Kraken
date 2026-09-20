// Run from root: node scripts/smoke-game.mjs [5..11] [quick|long]
// Requires the local server on :2567. Exercises real WebSocket clients.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { strict as assert } from "node:assert";
const require = createRequire(
    new URL("../packages/client/package.json", import.meta.url),
);
const { Client } = require("@colyseus/sdk");
const { PROTOCOL_VERSION } = await import("../packages/shared/dist/index.js");
const count = Number(process.argv[2] ?? 5);
const mode = process.argv[3] ?? (count >= 7 ? "long" : "quick");
assert.ok(count >= 5 && count <= 11);
const client = new Client("ws://localhost:2567");
const actors = [];
const rejections = [];
let started = false;
let actions = 0;
let finish;
let fail;
const completed = new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
});
const timeout = setTimeout(
    () => fail(new Error("Game did not complete in 25 seconds")),
    25000,
);

function attach(room, session) {
    const actor = { room, session, view: undefined, fingerprint: "" };
    room.onMessage("session.established", (message) => {
        actor.session = message;
    });
    room.onMessage("action.rejected", (message) => {
        rejections.push(message.reason);
        fail(new Error(message.reason));
    });
    room.onMessage("view.updated", ({ view }) => {
        actor.view = view;
        if (view.phase === "ended") {
            finish(view);
            return;
        }
        if (!started || !actor.session) return;
        const prompt = view.privatePrompt;
        if (
            !prompt ||
            prompt.action === "wait" ||
            prompt.action === "start-game"
        )
            return;
        const fingerprint = JSON.stringify([
            view.roundNo,
            view.phase,
            prompt.action,
            prompt.candidates,
            view.hand?.map((c) => c.id),
        ]);
        if (actor.fingerprint === fingerprint) return;
        actor.fingerprint = fingerprint;
        let action;
        switch (prompt.action) {
            case "assign-officers":
                action = {
                    type: "assignOfficers",
                    firstMateId: prompt.candidates[0],
                    navigatorId: prompt.candidates[1],
                };
                break;
            case "mutiny":
                action = { type: "commitMutiny", guns: 0 };
                break;
            case "keep-card":
            case "navigate":
                action = {
                    type: "keepNavigationCard",
                    cardId: view.hand[0].id,
                };
                break;
            case "pick-player":
            case "ritual-convert":
                action = { type: "pickPlayer", playerId: prompt.candidates[0] };
                break;
            case "mutiny-tiebreak":
                action = {
                    type: "eliminateTieCandidate",
                    playerId: prompt.candidates[0],
                };
                break;
            case "acknowledge":
                action = { type: "acknowledge" };
                break;
            case "telescope-decide":
                action = { type: "telescopeDecision", discard: false };
                break;
            case "ritual-guns":
                action = {
                    type: "distributeCultGuns",
                    grants: [{ playerId: prompt.candidates[0], guns: 3 }],
                };
                break;
        }
        if (action) send(actor, action);
    });
    room.send("resync");
    return actor;
}
function send(actor, action) {
    actions++;
    actor.room.send("action", {
        protocolVersion: PROTOCOL_VERSION,
        actionId: randomUUID(),
        roomId: actor.room.roomId,
        playerId: actor.session.playerId,
        action,
        sentAt: Date.now(),
    });
}
async function ready(actor) {
    // Bounded event readiness; no arbitrary delay before actions.
    if (actor.session && actor.view) return;
    await new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error("No session/view received")),
            3000,
        );
        const unsubscribe = actor.room.onMessage("view.updated", () => {
            if (actor.session) {
                clearTimeout(timer);
                unsubscribe();
                resolve();
            }
        });
        actor.room.send("resync");
    });
}
try {
    actors.push(attach(await client.create("kraken", { nickname: "Smoke 1" })));
    await ready(actors[0]);
    for (let i = 1; i < count; i++) {
        const actor = attach(
            await client.joinById(actors[0].room.roomId, {
                nickname: `Smoke ${i + 1}`,
            }),
        );
        actors.push(actor);
        await ready(actor);
    }
    // Replace a live socket (including an eleven-seat room), then recover offline.
    const previous = actors.pop();
    const liveReplacement = attach(
        await client.joinById(actors[0].room.roomId, previous.session),
        previous.session,
    );
    await ready(liveReplacement);
    assert.equal(liveReplacement.view.players.length, count);
    await liveReplacement.room.leave();
    const replacement = attach(
        await client.joinById(actors[0].room.roomId, previous.session),
        previous.session,
    );
    actors.push(replacement);
    await ready(replacement);
    assert.equal(replacement.view.viewerId, previous.session.playerId);
    assert.equal(replacement.view.players.length, count);
    started = true;
    send(actors[0], { type: "startGame", voyageMode: mode });
    const result = await completed;
    assert.ok(result.winner);
    assert.ok(result.players.every((p) => p.faction !== "unknown"));
    console.log(
        JSON.stringify({
            players: count,
            mode,
            winner: result.winner,
            rounds: result.roundNo,
            actions,
            rejections,
            reconnect: "passed",
            ended: true,
        }),
    );
} finally {
    clearTimeout(timeout);
    await Promise.all(
        actors.map((actor) => actor.room.leave().catch(() => undefined)),
    );
}
