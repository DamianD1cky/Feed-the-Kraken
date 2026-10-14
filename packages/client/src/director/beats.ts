import type {
    CultRitualKind,
    Faction,
    MapAction,
    NavigationCard,
    Phase,
    PlayerView,
    PublicLogEntry,
    VisiblePlayer,
} from "@feed/shared";
import { directionLabels, effectLabels, factionLabel, mapLabels } from "../labels";

export type Office = "captain" | "firstMate" | "navigator";
export type Point = { x: number; y: number };

export type SeatChange = {
    playerId: string;
    died?: boolean;
    muted?: boolean;
    offDuty?: boolean;
    notFaction?: Faction;
    guns?: [number, number];
    online?: boolean;
};

export type OfficeMove = { office: Office; from?: string; to?: string };

/**
 * One thing that happened at the table, in the order a viewer should see it. Several server events
 * arrive in one view; each beat says what moved so the stage can carry it instead of swapping it.
 */
export type Beat = { caption?: string } & (
    | { kind: "boarding"; playerIds: string[] }
    | { kind: "cast-off" }
    | { kind: "votes"; playerIds: string[] }
    | { kind: "verdict"; success: boolean }
    | { kind: "deal"; from: Phase; to: Phase; captainId?: string; firstMateId?: string; navigatorId?: string }
    | { kind: "reveal"; card: NavigationCard; navigatorId?: string }
    | { kind: "voyage"; from: Point; to: Point; triggered?: MapAction; captainId?: string }
    | { kind: "ritual"; ritual: CultRitualKind }
    | { kind: "news" }
    | { kind: "appoint"; moves: OfficeMove[]; captainId?: string }
    | { kind: "seats"; changes: SeatChange[] }
    | { kind: "phase"; from: Phase; to: Phase; roundNo: number }
    | { kind: "finale"; winner: Faction }
);

export type BeatKind = Beat["kind"];

const NAV_PHASES: Phase[] = ["captain_nav", "mate_nav", "navigator_nav"];
const OFFICE_KEYS: Record<Office, "captainId" | "firstMateId" | "navigatorId"> = {
    captain: "captainId",
    firstMate: "firstMateId",
    navigator: "navigatorId",
};
const OFFICE_FLAGS: Record<Office, "isCaptain" | "isFirstMate" | "isNavigator"> = {
    captain: "isCaptain",
    firstMate: "isFirstMate",
    navigator: "isNavigator",
};
export const officeLabels: Record<Office, string> = { captain: "船长", firstMate: "大副", navigator: "领航员" };

/** Log kinds worth a caption of their own when nothing on the board shows them. */
const NEWS_KINDS = new Set<PublicLogEntry["kind"]>([
    "navigation.reshuffled",
    "navigation.jumped",
    "emergency.navigator",
    "map.cabin_search",
    "effect.mermaid",
    "effect.telescope",
    "effect.telescope_resolved",
    "ritual.converted",
    "ritual.guns",
    "ritual.cabin_shown",
    "supply.crossed",
]);

const lastSeq = (view: PlayerView) => view.publicLog.at(-1)?.seq ?? 0;
const cellKey = (p: Point) => `${p.x},${p.y}`;

export function diffViews(prev: PlayerView, next: PlayerView): Beat[] {
    const beats: Beat[] = [];
    const fresh = next.publicLog.filter((entry) => entry.seq > lastSeq(prev) && entry.message);
    const latest = (kind: PublicLogEntry["kind"]) => [...fresh].reverse().find((entry) => entry.kind === kind);
    const said = (kind: PublicLogEntry["kind"]) => latest(kind)?.message;
    const name = (id?: string) => next.players.find((p) => p.id === id)?.nickname ?? "";
    const before = new Map(prev.players.map((p) => [p.id, p]));

    if (prev.phase === "lobby") {
        const joined = next.players.filter((p) => !before.has(p.id)).map((p) => p.id);
        if (joined.length) beats.push({ kind: "boarding", playerIds: joined, caption: joined.map(name).join("、") + " 登船" });
        if (next.phase !== "lobby") {
            // The first deal changes everything at once; the cast-off carries the harbour into the chart.
            beats.push({ kind: "cast-off", caption: said("game.started") });
            beats.push({ kind: "phase", from: prev.phase, to: next.phase, roundNo: next.roundNo });
            return beats;
        }
    }

    const voted = next.players.filter((p) => p.hasVoted && !before.get(p.id)?.hasVoted).map((p) => p.id);
    if (voted.length) beats.push({ kind: "votes", playerIds: voted });

    const verdict = latest("mutiny.resolved");
    if (verdict) beats.push({ kind: "verdict", success: verdict.message.startsWith("叛变成功"), caption: verdict.message });

    if (prev.phase !== next.phase && (NAV_PHASES.includes(prev.phase) || NAV_PHASES.includes(next.phase))) {
        beats.push({
            kind: "deal",
            from: prev.phase,
            to: next.phase,
            captainId: prev.offices.captainId,
            firstMateId: prev.offices.firstMateId ?? next.offices.firstMateId,
            navigatorId: prev.offices.navigatorId ?? next.offices.navigatorId,
        });
    }

    const card = next.lastRevealedCard;
    if (card && card.id !== prev.lastRevealedCard?.id) {
        beats.push({
            kind: "reveal",
            card,
            navigatorId: prev.offices.navigatorId,
            caption: `最终航线 · ${directionLabels[card.direction]} · ${effectLabels[card.effect]}`,
        });
    }

    if (prev.ship.x !== next.ship.x || prev.ship.y !== next.ship.y) {
        const key = cellKey(next.ship);
        const triggered = prev.mapActions[key] && !next.mapActions[key] ? prev.mapActions[key] : undefined;
        beats.push({
            kind: "voyage",
            from: { x: prev.ship.x, y: prev.ship.y },
            to: { x: next.ship.x, y: next.ship.y },
            triggered,
            captainId: next.offices.captainId,
            caption: `船驶入 (${next.ship.x}, ${next.ship.y})` + (triggered ? ` · 触发${mapLabels[triggered]}` : ""),
        });
    }

    const ritual = said("ritual.drawn");
    if (ritual && next.lastCultRitual) beats.push({ kind: "ritual", ritual: next.lastCultRitual, caption: ritual });

    for (const entry of fresh) if (NEWS_KINDS.has(entry.kind)) beats.push({ kind: "news", caption: entry.message });

    const moves = (Object.keys(OFFICE_KEYS) as Office[])
        .map((office) => ({ office, from: prev.offices[OFFICE_KEYS[office]], to: next.offices[OFFICE_KEYS[office]] }))
        .filter((move) => move.from !== move.to);
    if (moves.length) {
        const arriving = moves.filter((move) => move.to);
        beats.push({
            kind: "appoint",
            moves,
            captainId: next.offices.captainId,
            caption: arriving.length ? arriving.map((m) => `${name(m.to)} 出任${officeLabels[m.office]}`).join(" · ") : undefined,
        });
    }

    const changes = next.phase === "lobby" ? [] : seatChanges(before, next.players);
    if (changes.length) beats.push({ kind: "seats", changes, caption: seatCaption(changes, name) });

    if (prev.phase !== next.phase || prev.roundNo !== next.roundNo) {
        beats.push({ kind: "phase", from: prev.phase, to: next.phase, roundNo: next.roundNo });
    }

    if (next.winner && !prev.winner) beats.push({ kind: "finale", winner: next.winner, caption: said("game.ended") });

    return beats;
}

function seatChanges(before: Map<string, VisiblePlayer>, players: VisiblePlayer[]): SeatChange[] {
    const changes: SeatChange[] = [];
    for (const p of players) {
        const was = before.get(p.id);
        if (!was) continue;
        const change: SeatChange = { playerId: p.id };
        if (p.dead && !was.dead) change.died = true;
        if (p.muted !== was.muted) change.muted = p.muted;
        if (p.offDuty !== was.offDuty) change.offDuty = p.offDuty;
        if (p.connected !== was.connected) change.online = p.connected;
        if (p.guns !== was.guns) change.guns = [was.guns, p.guns];
        const revealed = p.notFactions.find((f) => !was.notFactions.includes(f));
        if (revealed) change.notFaction = revealed;
        if (Object.keys(change).length > 1) changes.push(change);
    }
    return changes;
}

function seatCaption(changes: SeatChange[], name: (id?: string) => string) {
    const lines: string[] = [];
    for (const c of changes) {
        if (c.died) lines.push(`${name(c.playerId)} 被喂给了克拉肯`);
        if (c.muted) lines.push(`${name(c.playerId)} 被割舌`);
        if (c.notFaction) lines.push(`鞭笞：${name(c.playerId)} 不是${factionLabel(c.notFaction)}`);
    }
    return lines.join(" · ") || undefined;
}

function patchPlayers(display: PlayerView, next: PlayerView, fields: (keyof VisiblePlayer)[], only?: Set<string>) {
    const latest = new Map(next.players.map((p) => [p.id, p]));
    return display.players.map((p) => {
        const n = latest.get(p.id);
        if (!n || (only && !only.has(p.id))) return p;
        const patch: Partial<VisiblePlayer> = {};
        for (const field of fields) (patch as Record<string, unknown>)[field] = n[field];
        return { ...p, ...patch };
    });
}

/** Advances what the table shows by exactly what this beat told; everything else waits its turn. */
export function commitBeat(beat: Beat, display: PlayerView, next: PlayerView): PlayerView {
    switch (beat.kind) {
        case "boarding":
            return { ...display, players: next.players };
        case "cast-off":
        case "finale":
            return next;
        case "votes":
            return { ...display, players: patchPlayers(display, next, ["hasVoted"], new Set(beat.playerIds)) };
        case "reveal":
            return { ...display, lastRevealedCard: next.lastRevealedCard };
        case "voyage":
            return { ...display, ship: next.ship, mapActions: next.mapActions, supplyLineCrossed: next.supplyLineCrossed };
        case "ritual":
            return { ...display, lastCultRitual: next.lastCultRitual };
        case "appoint":
            return {
                ...display,
                offices: next.offices,
                players: patchPlayers(display, next, beat.moves.map((m) => OFFICE_FLAGS[m.office])),
            };
        case "seats":
            return {
                ...display,
                players: patchPlayers(
                    display,
                    next,
                    ["dead", "muted", "offDuty", "connected", "guns", "notFactions"],
                    new Set(beat.changes.map((c) => c.playerId)),
                ),
            };
        case "phase":
            return {
                ...display,
                phase: next.phase,
                roundNo: next.roundNo,
                mutinyTieCandidates: next.mutinyTieCandidates,
                players: patchPlayers(display, next, ["hasVoted"]),
            };
        default:
            return display;
    }
}
