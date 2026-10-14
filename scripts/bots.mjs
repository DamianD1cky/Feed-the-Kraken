// Run from root: node scripts/bots.mjs <roomId> [count=4] [delayMs=1200]
// Fills an existing lobby with automated crew so one human tab can watch a full voyage.
// Sessions are kept in the OS temp dir, so re-running the same command reattaches the same seats.
// Requires the local server on :2567 (override with SERVER_URL).
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(
    new URL("../packages/client/package.json", import.meta.url),
);
const { Client } = require("@colyseus/sdk");
const { PROTOCOL_VERSION } = await import("../packages/shared/dist/index.js");

const [roomId, countArg = "4", delayArg = "1200"] = process.argv.slice(2);
if (!roomId) {
    console.error("usage: node scripts/bots.mjs <roomId> [count] [delayMs]");
    process.exit(1);
}
const count = Number(countArg);
const delay = Number(delayArg);
const client = new Client(process.env.SERVER_URL ?? "ws://localhost:2567");
const names = ["老约翰", "灰鸥", "铁锚", "瞎眼汤姆", "红胡子", "小雀", "盐巴", "雾笛", "鲸骨", "白帆"];
const sessionFile = join(tmpdir(), `feed-the-kraken-bots-${roomId}.json`);
const sessions = existsSync(sessionFile) ? JSON.parse(readFileSync(sessionFile, "utf8")) : {};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);

function decide(view) {
    const prompt = view.privatePrompt;
    switch (prompt.action) {
        case "start-game":
            return view.players.length >= 5 ? { type: "startGame" } : undefined;
        case "assign-officers": {
            const [firstMateId, navigatorId] = shuffle(prompt.candidates);
            return { type: "assignOfficers", firstMateId, navigatorId };
        }
        case "mutiny":
            return {
                type: "commitMutiny",
                guns: Math.random() < 0.3 ? Math.min(view.me.guns, 1 + Math.floor(Math.random() * 2)) : 0,
            };
        case "keep-card":
        case "navigate":
            return { type: "keepNavigationCard", cardId: pick(view.hand).id };
        case "pick-player":
        case "ritual-convert":
            return { type: "pickPlayer", playerId: pick(prompt.candidates) };
        case "mutiny-tiebreak":
            return { type: "eliminateTieCandidate", playerId: pick(prompt.candidates) };
        case "acknowledge":
            return { type: "acknowledge" };
        case "telescope-decide":
            return { type: "telescopeDecision", discard: Math.random() < 0.5 };
        case "ritual-guns":
            return { type: "distributeCultGuns", grants: [{ playerId: pick(prompt.candidates), guns: 3 }] };
        default:
            return undefined;
    }
}

function fingerprint(view) {
    const prompt = view.privatePrompt;
    return JSON.stringify([view.roundNo, view.phase, prompt?.action, prompt?.candidates, view.hand?.map((c) => c.id), view.players.length]);
}

function attach(room, nickname) {
    const bot = { room, nickname, session: sessions[nickname], view: undefined, handled: "" };
    room.onMessage("session.established", (message) => {
        bot.session = message;
        sessions[nickname] = message;
        writeFileSync(sessionFile, JSON.stringify(sessions));
    });
    room.onMessage("action.rejected", (message) => {
        console.warn(`[${nickname}] rejected: ${message.reason}`);
    });
    room.onMessage("view.updated", ({ view }) => {
        bot.view = view;
        if (view.phase === "ended") {
            console.log(`[${nickname}] voyage ended, winner: ${view.winner}`);
            return;
        }
        const prompt = view.privatePrompt;
        // A prompt can repeat within a round (a second mutiny); any wait in between re-arms the bot.
        if (!prompt || prompt.action === "wait") bot.handled = "";
        if (!bot.session || !prompt || prompt.action === "wait") return;
        const key = fingerprint(view);
        if (bot.handled === key) return;
        bot.handled = key;
        setTimeout(() => {
            if (!bot.view || fingerprint(bot.view) !== key) return;
            const action = decide(bot.view);
            if (!action) return;
            room.send("action", {
                protocolVersion: PROTOCOL_VERSION,
                actionId: randomUUID(),
                roomId: room.roomId,
                playerId: bot.session.playerId,
                action,
                sentAt: Date.now(),
            });
        }, delay * (0.6 + Math.random() * 0.8));
    });
    room.onLeave(() => console.log(`[${nickname}] left`));
    room.send("resync");
    return bot;
}

const bots = [];
for (let i = 0; i < count; i++) {
    const nickname = names[i % names.length];
    const saved = sessions[nickname];
    const options = saved
        ? { nickname, playerId: saved.playerId, sessionToken: saved.sessionToken, reconnectToken: saved.reconnectToken }
        : { nickname };
    bots.push(attach(await client.joinById(roomId, options), nickname));
    console.log(`[${nickname}] ${saved ? "rejoined" : "joined"} ${roomId}`);
}
console.log(`${count} bots aboard. Ctrl+C to leave.`);
process.on("SIGINT", async () => {
    await Promise.all(bots.map((bot) => bot.room.leave().catch(() => undefined)));
    process.exit(0);
});
