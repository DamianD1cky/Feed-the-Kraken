import * as THREE from "three";
import type { Beat } from "../director/beats";
import type { BeatContext } from "../director/director";
import { afterPaint } from "../motion/clock";
import { curves, lerp, span, spring, wobble, type Curve } from "../motion/curves";
import { intent } from "../table/selection";
import { CHART, REVEAL_YAW, SPOTS, headingYaw } from "./layout";
import type { TableScene } from "./TableScene";

export type Run = (seconds: number, paint: (t: number) => void) => Promise<void>;
type BeatOf<K extends Beat["kind"]> = Extract<Beat, { kind: K }>;

/** Where a carried object is and how it lies: yaw about the table, tilt toward you, flip face down. */
type Pose = { at: THREE.Vector3; yaw?: number; tilt?: number; flip?: number; scale?: number };

const poseOf = (obj: THREE.Object3D): Pose => ({
    at: obj.position.clone(),
    yaw: obj.rotation.y,
    tilt: obj.rotation.x,
    flip: obj.rotation.z,
    scale: obj.scale.x,
});

/** Above the chart, tilted to face your chair: where a card is held up for everyone to read. */
const READING = new THREE.Vector3(CHART.x + 0.3, 1.85, CHART.z + 1.15);
const READING_TILT = 0.85;
const BOOK = SPOTS.book.clone().setY(0.3);

async function carry(
    table: TableScene,
    obj: THREE.Object3D,
    from: Pose,
    to: Pose,
    run: Run,
    { seconds = 0.55, arc = 0.6, curve = curves.cubicInOut, spin = 0 }: { seconds?: number; arc?: number; curve?: Curve; spin?: number } = {},
) {
    const done = table.begin();
    const scaled = from.scale !== undefined || to.scale !== undefined;
    const thickness = obj.scale.y;
    try {
        await run(seconds, (t) => {
            const k = curve(span(t, 0, seconds));
            obj.position.lerpVectors(from.at, to.at, k);
            obj.position.y += Math.sin(Math.PI * k) * arc;
            obj.rotation.set(lerp(from.tilt ?? 0, to.tilt ?? 0, k), lerp(from.yaw ?? 0, to.yaw ?? 0, k) + spin * k, lerp(from.flip ?? 0, to.flip ?? 0, k));
            if (scaled) {
                const s = lerp(from.scale ?? 1, to.scale ?? 1, k);
                obj.scale.set(s, thickness, s);
            }
        });
    } finally {
        done();
    }
}

/** Turns a held-up card face up on a spring, so it overshoots a little and settles. */
async function turnOver(table: TableScene, obj: THREE.Object3D, run: Run) {
    const done = table.begin();
    try {
        await run(0.72, (t) => {
            obj.rotation.z = Math.PI * (1 - spring(t, 0.58, 15));
        });
    } finally {
        done();
    }
}

const hold = (run: Run, seconds: number) => run(seconds, () => {});

/** The stage directions for each beat, played with the real things on the table. */
export async function stage(table: TableScene, beat: Beat, ctx: BeatContext, run: Run) {
    switch (beat.kind) {
        case "boarding":
            ctx.commit();
            return hold(run, 0.6);
        case "cast-off":
            return castOff(table, ctx, run);
        case "votes":
            ctx.commit();
            for (const id of beat.playerIds) table.pulseSeat(id);
            return hold(run, 0.2 + 0.06 * beat.playerIds.length);
        case "verdict":
            return verdict(table, beat, ctx, run);
        case "deal":
            return deal(table, beat, ctx, run);
        case "reveal":
            return reveal(table, beat, ctx, run);
        case "voyage":
            return voyage(table, beat, ctx, run);
        case "ritual":
            return ritual(table, beat, ctx, run);
        case "news":
            return hold(run, 1.05);
        case "appoint":
            return appoint(table, beat, ctx, run);
        case "seats":
            return seats(table, beat, ctx, run);
        case "phase":
            ctx.commit();
            return hold(run, 0.42);
        case "finale":
            ctx.commit();
            return hold(run, 1.9);
    }
}

/** The harbour gives way to the chart: the camera comes down to your chair and the ship is set on the start. */
async function castOff(table: TableScene, ctx: BeatContext, run: Run) {
    ctx.commit();
    await afterPaint();
    const ship = table.shipModel();
    const start = table.chart.at(0, 0);
    table.holdShip(true);
    const done = table.begin();
    try {
        await run(1.7, (t) => {
            table.push(1 - curves.expoOut(span(t, 0, 1.7)), start);
            if (ship) {
                const drop = curves.expoOut(span(t, 0.3, 1.0));
                ship.position.copy(start).setY(start.y + (1 - drop) * 2.4);
                ship.rotation.set(0, headingYaw.north, wobble(t - 1.0, 9, 22) * 0.12);
            }
            table.rippleAt(start, span(t, 0.95, 1.7));
        });
    } finally {
        table.push(0);
        table.holdShip(false);
        done();
    }
}

async function verdict(table: TableScene, beat: BeatOf<"verdict">, ctx: BeatContext, run: Run) {
    const voters = ctx.display.players.filter((p) => p.hasVoted);
    for (const [i, voter] of voters.entries()) {
        await hold(run, i ? 0.06 : 0);
        table.pulseSeat(voter.id);
    }
    if (beat.success) table.pulseSeat(ctx.display.offices.captainId);
    await hold(run, 0.85);
}

/**
 * Cards travel the route the rules describe: deck → the holder → the kept one into the logbook,
 * the other over the far edge into the deep. The logbook then hands its two to the navigator.
 */
async function deal(table: TableScene, beat: BeatOf<"deal">, ctx: BeatContext, run: Run) {
    const holderOf = (phase: string) =>
        phase === "captain_nav" ? beat.captainId : phase === "mate_nav" ? beat.firstMateId : phase === "navigator_nav" ? beat.navigatorId : undefined;
    const sink = async (card: THREE.Object3D, intoBook: boolean, delay = 0) => {
        await hold(run, delay);
        const from = poseOf(card);
        await carry(
            table,
            card,
            from,
            intoBook
                ? { at: BOOK, yaw: -0.14, flip: Math.PI, scale: 0.55 }
                : { at: SPOTS.deep, yaw: (from.yaw ?? 0) + 0.8, flip: Math.PI, scale: from.scale },
            run,
            { seconds: intoBook ? 0.6 : 0.75, arc: intoBook ? 0.9 : 1.6, curve: intoBook ? curves.cubicInOut : curves.sineInOut },
        );
        table.discard(card);
    };

    const outgoing: Promise<void>[] = [];
    const holder = holderOf(beat.from);
    if (holder && holder === ctx.viewerId) {
        const kept = beat.from === "navigator_nav" ? ctx.next.lastRevealedCard?.id : intent.keptCardId;
        for (const card of ctx.display.hand ?? []) {
            // The navigator's choice is the reveal's to carry.
            if (beat.from === "navigator_nav" && card.id === kept) continue;
            const mesh = table.takeHand(card.id);
            if (mesh) outgoing.push(sink(mesh, card.id === kept));
        }
    } else if (holder && holder === table.heldBy) {
        if (beat.from !== "navigator_nav") {
            const kept = table.takeHeld();
            if (kept) outgoing.push(sink(kept, true));
        }
        const thrown = table.takeHeld();
        if (thrown) outgoing.push(sink(thrown, false, 0.08));
    }
    await Promise.all(outgoing);

    const receiver = holderOf(beat.to);
    if (!receiver) return;
    const source = beat.to === "navigator_nav" ? BOOK : SPOTS.deck.clone().setY(0.22);
    if (receiver === ctx.viewerId) {
        const cards = (ctx.next.hand ?? []).slice(0, SPOTS.hand.length);
        await Promise.all(
            cards.map(async (card, i) => {
                await hold(run, i * 0.1);
                const mesh = table.looseCard({ card, faceUp: false, size: 0.6 });
                await carry(
                    table,
                    mesh,
                    { at: source, yaw: 0.12, flip: Math.PI, scale: 0.6 },
                    { at: SPOTS.hand[i]!, yaw: i % 2 ? -0.06 : 0.1, flip: 0, scale: 1 },
                    run,
                    { seconds: 0.7, arc: 1.2 },
                );
                table.park(`hand:${card.id}`, mesh);
            }),
        );
    } else {
        await Promise.all(
            [0, 1].map(async (i) => {
                await hold(run, i * 0.1);
                const spot = table.heldSpot(receiver, i);
                if (!spot) return;
                const mesh = table.looseCard({ faceUp: false, size: 0.5 });
                await carry(table, mesh, { at: source, yaw: 0.12, flip: Math.PI, scale: 0.5 }, { at: spot.position, yaw: spot.yaw, flip: Math.PI, scale: 0.5 }, run, {
                    seconds: 0.58,
                    arc: 0.9,
                });
                table.park(`held:${receiver}`, mesh);
            }),
        );
    }
}

/** The final card is held up over the chart, turned over for everyone, read, and set down. */
async function reveal(table: TableScene, beat: BeatOf<"reveal">, ctx: BeatContext, run: Run) {
    const own = beat.navigatorId === ctx.viewerId ? table.takeHand(beat.card.id) : undefined;
    let card = own;
    let from: Pose;
    if (own) from = poseOf(own);
    else {
        const held = beat.navigatorId && beat.navigatorId === table.heldBy ? table.takeHeld() : undefined;
        const seat = table.seat(beat.navigatorId);
        from = held ? poseOf(held) : { at: seat?.position ?? SPOTS.deck.clone(), flip: Math.PI, scale: 0.5 };
        if (held) table.discard(held);
        card = table.looseCard({ card: beat.card, faceUp: false, size: from.scale ?? 0.5 });
    }
    const up: Pose = { at: READING, yaw: 0, tilt: READING_TILT, flip: own ? 0 : Math.PI, scale: 1.25 };
    await carry(table, card!, from, up, run, { seconds: 0.62, arc: 0.35, curve: curves.cubicOut });
    if (!own) await turnOver(table, card!, run);
    await hold(run, 0.8);
    await carry(table, card!, { ...up, flip: 0 }, { at: SPOTS.reveal, yaw: REVEAL_YAW, tilt: 0, flip: 0, scale: 1 }, run, { seconds: 0.6, arc: 0.3 });
    table.park(`reveal:${beat.card.id}`, card!);
    ctx.commit();
}

/** The camera leans toward the landing a beat ahead; the ship crosses, lands, and the water answers. */
async function voyage(table: TableScene, beat: BeatOf<"voyage">, ctx: BeatContext, run: Run) {
    const ship = table.shipModel();
    if (!ship) return ctx.commit();
    const chart = table.chart;
    const a = chart.at(beat.from.x, beat.from.y);
    const b = chart.at(beat.to.x, beat.to.y);
    const focus = b.clone().lerp(a, 0.35);
    const turn = (from: number, to: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
    const yaw0 = ship.rotation.y;
    const yawTravel = turn(yaw0, Math.atan2(b.z - a.z, -(b.x - a.x)));
    const yawEnd = turn(yawTravel, headingYaw[ctx.next.ship.heading]);
    table.holdShip(true);
    const done = table.begin();
    try {
        await run(1.05, (t) => {
            table.push(curves.cubicInOut(span(t, 0, 0.7)) * 0.85, focus);
            const k = curves.cubicInOut(span(t, 0.18, 1.05));
            const hump = Math.sin(Math.PI * k);
            ship.position.lerpVectors(a, b, k);
            ship.position.y += hump * 0.28;
            ship.rotation.set(hump * 0.08, lerp(yaw0, yawTravel, curves.cubicOut(span(t, 0, 0.4))), Math.sin(t * 9) * 0.05 * hump);
        });
        await run(0.55, (t) => {
            const w = wobble(t, 10, 26);
            ship.position.copy(b);
            ship.rotation.set(w * 0.06, lerp(yawTravel, yawEnd, curves.cubicInOut(span(t, 0, 0.55))), w * 0.08);
            table.rippleAt(b, span(t, 0, 0.55));
            const jolt = 6 * Math.exp(-10 * t);
            table.push(0.85, focus, { x: jolt * Math.sin(t * 62), y: jolt * 0.7 * Math.sin(t * 79) });
        });
        table.rippleAt(b, 1);
        // Committing first wipes the order off the paper, so the token lifting off is the order itself.
        ctx.commit();
        await afterPaint();
        if (beat.triggered) await orderToCaptain(table, beat, b, run);
        await run(0.75, (t) => table.push(0.85 * (1 - curves.cubicInOut(span(t, 0, 0.75))), focus));
    } finally {
        table.push(0);
        table.holdShip(false);
        done();
    }
}

/** The order on the hex goes to the one who must carry it out. */
async function orderToCaptain(table: TableScene, beat: BeatOf<"voyage">, at: THREE.Vector3, run: Run) {
    if (!beat.triggered) return;
    const token = table.markerToken(beat.triggered);
    const target = table.slot(beat.captainId, "held") ?? table.seat(beat.captainId)?.position;
    if (!token || !target) return;
    const start = at.clone().setY(at.y + 0.02);
    await carry(table, token, { at: start }, { at: start.clone().setY(0.75), tilt: 0.6 }, run, { seconds: 0.4, arc: 0, curve: curves.cubicOut });
    await carry(table, token, { at: start.clone().setY(0.75), tilt: 0.6 }, { at: target.clone().setY(0.1), scale: 1.4 }, run, { seconds: 0.75, arc: 0.6 });
    table.pulseSeat(beat.captainId);
    await hold(run, 0.5);
    await carry(table, token, poseOf(token), { at: target.clone().setY(0.1), scale: 0.01 }, run, { seconds: 0.3, arc: 0 });
    table.discard(token);
}

/** A ritual card rises out of the chart in the dark, turns over, and is taken back down. */
async function ritual(table: TableScene, beat: BeatOf<"ritual">, ctx: BeatContext, run: Run) {
    table.darken(1);
    const card = table.looseCard({ ritual: beat.ritual, faceUp: false });
    const below = CHART.clone().setY(-0.45);
    const up: Pose = { at: READING, tilt: READING_TILT, flip: Math.PI, scale: 1.2 };
    await carry(table, card, { at: below, flip: Math.PI, scale: 0.8 }, up, run, { seconds: 0.8, arc: 0, curve: curves.expoOut });
    await turnOver(table, card, run);
    await hold(run, 0.95);
    ctx.commit();
    await carry(table, card, { ...up, flip: 0 }, { at: below, tilt: 0, flip: 0, scale: 0.8 }, run, { seconds: 0.6, arc: 0, curve: curves.cubicInOut });
    table.discard(card);
    table.darken(0);
}

/** Office tokens hop from whoever held them (or the captain) to their new seat. */
async function appoint(table: TableScene, beat: BeatOf<"appoint">, ctx: BeatContext, run: Run) {
    const legs = beat.moves.map(async (move, i) => {
        const placed = table.office(move.office);
        if (!placed) return;
        const from = placed.obj.visible ? placed.obj.position.clone() : (table.slot(move.from ?? beat.captainId, "office") ?? table.slot(move.to, "office"));
        const to = move.to ? table.slot(move.to, "office") : undefined;
        if (!from) return;
        await hold(run, i * 0.14);
        placed.held = true;
        placed.obj.visible = true;
        try {
            if (to) {
                const captain = move.office === "captain";
                await carry(table, placed.obj, { at: from }, { at: to }, run, { seconds: 0.66, arc: captain ? 1.1 : 0.75, spin: captain ? Math.PI * 2 : 0 });
                placed.target.copy(to);
            } else {
                await carry(table, placed.obj, { at: from }, { at: from.clone().setY(1.1), scale: 0.01 }, run, { seconds: 0.45, arc: 0 });
                placed.obj.visible = false;
                placed.obj.scale.setScalar(1);
            }
        } finally {
            placed.held = false;
        }
        if (to) table.pulseSeat(move.to);
    });
    await Promise.all(legs);
    ctx.commit();
    await hold(run, 0.2);
}

/** Fates at the seats: the knife goes to the tongueless; the fed seat goes dark with the room. */
async function seats(table: TableScene, beat: BeatOf<"seats">, ctx: BeatContext, run: Run) {
    const captain = ctx.display.offices.captainId;
    const knives = beat.changes
        .filter((c) => c.muted)
        .map(async (c) => {
            const to = table.slot(c.playerId, "knife");
            const from = table.slot(captain, "office") ?? table.seat(captain)?.position;
            if (!to || !from) return;
            const knife = await table.looseProp("knife", 0.62, [0, 0.9, Math.PI / 2]);
            if (!knife) return;
            await carry(table, knife, { at: from }, { at: to }, run, { seconds: 0.7, arc: 1.0, spin: Math.PI });
            table.park(`knife:${c.playerId}`, knife);
        });
    const fed = beat.changes.some((c) => c.died);
    if (fed) table.darken(0.85);
    await Promise.all(knives);
    ctx.commit();
    for (const c of beat.changes) if (c.died || c.muted || c.notFaction || c.guns) table.pulseSeat(c.playerId);
    await hold(run, beat.changes.some((c) => c.died || c.muted || c.notFaction) ? 1.15 : 0.5);
    if (fed) table.darken(0);
}
