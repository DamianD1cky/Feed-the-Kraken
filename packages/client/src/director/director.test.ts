import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { PlayerView, PublicLogEntry, VisiblePlayer } from "@feed/shared";
import { commitBeat, diffViews, type Beat } from "./beats";
import { Director } from "./director";

test("a navigator's choice plays as discard, reveal, voyage, then the new phase", () => {
    const prev = view({ phase: "navigator_nav", mapActions: { "0,1": "feed_kraken", "1,1": "flogging" }, offices: crew() });
    const card = { id: "n-1", label: "邪教起义", direction: "north" as const, dx: 0, dy: 1, effect: "cult_uprising" as const };
    const next = view({
        ...prev,
        phase: "map_feed",
        ship: { x: 0, y: 1, heading: "north" },
        mapActions: { "1,1": "flogging" },
        lastRevealedCard: card,
        publicLog: log(prev, ["navigation.chosen", "领航员选定了最终航线"], ["navigation.revealed", "船长公开了最终航行牌"], ["ship.moved", "船只移动到 (0, 1)"], ["map.triggered", "触发地图行动：喂食克拉肯"]),
    });

    const beats = diffViews(prev, next);

    assert.deepEqual(kinds(beats), ["deal", "reveal", "voyage", "phase"]);
    const voyage = beats.find((b) => b.kind === "voyage");
    assert.equal(voyage?.kind === "voyage" && voyage.triggered, "feed_kraken");
    const reveal = beats.find((b) => b.kind === "reveal");
    assert.equal(reveal?.kind === "reveal" && reveal.navigatorId, "c");
});

test("each beat commits only what it showed", () => {
    const prev = view({ phase: "navigator_nav", mapActions: { "0,1": "feed_kraken" }, offices: crew() });
    const next = view({ ...prev, phase: "map_feed", ship: { x: 0, y: 1, heading: "north" }, mapActions: {} });
    const voyage = diffViews(prev, next).find((b) => b.kind === "voyage")!;

    const shown = commitBeat(voyage, prev, next);

    assert.deepEqual(shown.ship, next.ship);
    assert.deepEqual(shown.mapActions, {});
    assert.equal(shown.phase, "navigator_nav");
});

test("appointing officers carries both tokens before the mutiny begins", () => {
    const prev = view({ phase: "officers", offices: { captainId: "a" } });
    const next = view({ ...prev, phase: "mutiny", offices: crew(), players: flag(prev.players, crew()) });

    const beats = diffViews(prev, next);

    assert.deepEqual(kinds(beats), ["appoint", "phase"]);
    const appoint = beats[0];
    assert.ok(appoint.kind === "appoint");
    assert.deepEqual(appoint.moves, [
        { office: "firstMate", from: undefined, to: "b" },
        { office: "navigator", from: undefined, to: "c" },
    ]);
    assert.equal(appoint.caption, "Bo 出任大副 · Cy 出任领航员");
});

test("the round's end returns the officers' tokens", () => {
    const prev = view({ phase: "map_feed", roundNo: 1, offices: crew() });
    const next = view({ ...prev, phase: "officers", roundNo: 2, offices: { captainId: "a" } });

    const appoint = diffViews(prev, next).find((b) => b.kind === "appoint");

    assert.ok(appoint?.kind === "appoint");
    assert.deepEqual(appoint.moves.map((m) => [m.office, m.to]), [["firstMate", undefined], ["navigator", undefined]]);
    assert.equal(appoint.caption, undefined);
});

test("votes arrive one by one and the verdict is read from the public log", () => {
    const voting = view({ phase: "mutiny", offices: crew() });
    const oneVoted = view({ ...voting, players: voting.players.map((p) => (p.id === "b" ? { ...p, hasVoted: true } : p)) });
    assert.deepEqual(diffViews(voting, oneVoted), [{ kind: "votes", playerIds: ["b"] }]);

    const resolved = view({
        ...oneVoted,
        phase: "captain_nav",
        players: oneVoted.players.map((p) => ({ ...p, hasVoted: undefined })),
        publicLog: log(oneVoted, ["mutiny.resolved", "叛变失败（总枪数 2），枪收回，进入航行"], ["navigation.dealt", "船长抽取了 2 张航行牌"]),
    });
    const beats = diffViews(oneVoted, resolved);

    assert.deepEqual(kinds(beats), ["verdict", "deal", "phase"]);
    assert.ok(beats[0].kind === "verdict" && !beats[0].success);
});

test("the lobby boards newcomers and casts off into the chart", () => {
    const four = view({ phase: "lobby", players: players().slice(0, 4) });
    const five = view({ ...four, players: players() });
    assert.deepEqual(diffViews(four, five), [{ kind: "boarding", playerIds: ["e"], caption: "Ed 登船" }]);

    const started = view({ ...five, phase: "officers", offices: { captainId: "a" }, publicLog: log(five, ["game.started", "游戏开始"]) });
    assert.deepEqual(kinds(diffViews(five, started)), ["cast-off", "phase"]);
});

test("seat changes name what the table can already see", () => {
    const prev = view({ phase: "map_flog", offices: crew() });
    const next = view({
        ...prev,
        phase: "officers",
        players: prev.players.map((p) => (p.id === "d" ? { ...p, notFactions: ["pirate" as const] } : p.id === "e" ? { ...p, dead: true } : p)),
    });

    const seats = diffViews(prev, next).find((b) => b.kind === "seats");

    assert.ok(seats?.kind === "seats");
    assert.deepEqual(seats.changes, [
        { playerId: "d", notFaction: "pirate" },
        { playerId: "e", died: true },
    ]);
    assert.equal(seats.caption, "鞭笞：Dee 不是海盗 · Ed 被喂给了克拉肯");
});

test("a backlog is told as one story that still sails", async () => {
    const director = new Director();
    const performed: string[] = [];
    let release = () => {};
    director.setPerformer(async (beat) => {
        performed.push(beat.kind);
        if (beat.kind === "appoint") await new Promise<void>((resolve) => (release = resolve));
    });
    const officers = view({ phase: "officers", offices: { captainId: "a" } });
    const mutiny = view({ ...officers, phase: "mutiny", offices: crew(), players: flag(officers.players, crew()) });
    const captainNav = view({ ...mutiny, phase: "captain_nav" });
    const mateNav = view({ ...captainNav, phase: "mate_nav" });
    const card = { id: "n-1", label: "醉酒", direction: "north" as const, dx: 0, dy: 1, effect: "drunk" as const };
    const sailed = view({ ...mateNav, phase: "map_feed", ship: { x: 0, y: 1, heading: "north" }, lastRevealedCard: card });

    director.receive(officers);
    director.receive(mutiny);
    director.receive(captainNav);
    director.receive(mateNav);
    director.receive(sailed);
    release();
    while (director.snapshot()?.busy) await new Promise((resolve) => setTimeout(resolve, 1));

    assert.deepEqual(performed, ["appoint", "phase", "reveal", "voyage", "phase"]);
    assert.equal(director.snapshot()?.view, sailed);
});

const kinds = (beats: Beat[]) => beats.map((b) => b.kind);

function crew() {
    return { captainId: "a", firstMateId: "b", navigatorId: "c" };
}

function flag(list: VisiblePlayer[], offices: PlayerView["offices"]) {
    return list.map((p) => ({
        ...p,
        isCaptain: p.id === offices.captainId,
        isFirstMate: p.id === offices.firstMateId,
        isNavigator: p.id === offices.navigatorId,
    }));
}

function players(): VisiblePlayer[] {
    return ["a:Al", "b:Bo", "c:Cy", "d:Dee", "e:Ed"].map((entry) => {
        const [id, nickname] = entry.split(":");
        return {
            id: id!,
            nickname: nickname!,
            connected: true,
            guns: 3,
            dead: false,
            offDuty: false,
            muted: false,
            notFactions: [],
            faction: "unknown" as const,
            isHost: id === "a",
            isCaptain: false,
            isFirstMate: false,
            isNavigator: false,
            resumeCount: 0,
        };
    });
}

function log(base: PlayerView, ...entries: Array<[PublicLogEntry["kind"], string]>): PublicLogEntry[] {
    let seq = base.publicLog.at(-1)?.seq ?? 0;
    return [...base.publicLog, ...entries.map(([kind, message]) => ({ seq: ++seq, kind, message, at: seq }))];
}

function view(patch: Partial<PlayerView>): PlayerView {
    return {
        protocolVersion: 6,
        roomId: "room",
        viewerId: "a",
        phase: "lobby",
        voyageMode: "quick",
        supplyLineCrossed: false,
        roundNo: 1,
        mapActions: {},
        me: { id: "a", nickname: "Al", guns: 3, connected: true, isHost: true },
        players: players(),
        ship: { x: 0, y: 0, heading: "north" },
        offices: {},
        publicLog: [{ seq: 1, kind: "player.joined", message: "Al 加入房间", at: 1 }],
        ...patch,
    };
}
