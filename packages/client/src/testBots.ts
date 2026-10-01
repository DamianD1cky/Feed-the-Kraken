import type { Room } from "@colyseus/sdk";
import { MIN_PLAYERS, PROTOCOL_VERSION, type ClientAction, type PlayerView, type ServerMessage } from "@feed/shared";
import { createClient } from "./connection";
import { useAppStore } from "./store";

type Session = Extract<ServerMessage, { type: "session.established" }>;

const NAMES = ["阿沅", "老周", "Mira", "小满", "阿岚", "海雀", "柯林", "白帆", "老舵", "铁锚"];
const bots: Room[] = [];

// Bots belong to the human's room; drop them when the human leaves or switches rooms.
useAppStore.subscribe((state, previous) => {
    if (previous.room && state.room !== previous.room) dismissTestBots();
});

export async function fillWithTestBots(roomId: string, currentCount: number, target = MIN_PLAYERS) {
    const client = await createClient();
    for (let seat = currentCount; seat < target; seat += 1) {
        const room = await client.joinById(roomId, { nickname: `测试·${NAMES[(seat - 1) % NAMES.length]}` });
        bots.push(room);
        drive(room);
    }
}

export function dismissTestBots() {
    for (const room of bots.splice(0)) void room.leave().catch(() => undefined);
}

function drive(room: Room) {
    let session: Session | undefined;
    let fingerprint = "";
    let timer: number | undefined;
    room.onMessage("session.established", (message: Session) => {
        session = message;
    });
    room.onMessage("action.rejected", () => undefined);
    room.onMessage("room.closed", () => undefined);
    room.onMessage("view.updated", ({ view }: { view: PlayerView }) => {
        const prompt = view.privatePrompt;
        if (!session || !prompt || prompt.action === "wait" || prompt.action === "start-game") return;
        const next = JSON.stringify([view.roundNo, view.phase, prompt.action, prompt.candidates, view.hand?.map((card) => card.id)]);
        if (next === fingerprint) return;
        fingerprint = next;
        const action = decide(view);
        if (!action) return;
        const playerId = session.playerId;
        window.clearTimeout(timer);
        // A short think time keeps bot turns visible instead of resolving instantly.
        timer = window.setTimeout(() => {
            room.send("action", {
                protocolVersion: PROTOCOL_VERSION,
                actionId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
                roomId: room.roomId,
                playerId,
                action,
                sentAt: Date.now(),
            });
        }, 500 + Math.random() * 900);
    });
    room.send("resync");
}

const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;

function decide(view: PlayerView): ClientAction | undefined {
    const prompt = view.privatePrompt!;
    const candidates = prompt.candidates ?? [];
    switch (prompt.action) {
        case "assign-officers": {
            const firstMateId = pick(candidates);
            const navigatorId = pick(candidates.filter((id) => id !== firstMateId));
            return { type: "assignOfficers", firstMateId, navigatorId };
        }
        case "mutiny":
            return { type: "commitMutiny", guns: Math.random() < 0.2 ? Math.min(1, view.me.guns) : 0 };
        case "mutiny-tiebreak":
            return { type: "eliminateTieCandidate", playerId: pick(candidates) };
        case "keep-card":
        case "navigate":
            return view.hand?.length ? { type: "keepNavigationCard", cardId: pick(view.hand).id } : undefined;
        case "pick-player":
        case "ritual-convert":
            return { type: "pickPlayer", playerId: pick(candidates) };
        case "telescope-decide":
            return { type: "telescopeDecision", discard: Math.random() < 0.5 };
        case "ritual-guns":
            return { type: "distributeCultGuns", grants: [{ playerId: pick(candidates), guns: 3 }] };
        case "acknowledge":
            return { type: "acknowledge" };
        default:
            return undefined;
    }
}
