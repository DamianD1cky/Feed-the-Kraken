import type { Beat } from "./beats";
import type { BeatContext } from "./director";
import { rig } from "../motion/anchors";
import { play, type Paint } from "../motion/clock";
import { stage, type Run } from "../table3d/stagecraft";
import type { TableScene } from "../table3d/TableScene";

/**
 * The stage directions for each beat. Durations vary on purpose — a vote is a tick, a reveal holds
 * still long enough to read — and every boundary hands something on: a card, a token, the ship.
 * The table performs them with its own pieces; without a table there is nothing to show, so the
 * beat just lands.
 */
export async function perform(beat: Beat, ctx: BeatContext) {
    const run: Run = (seconds: number, paint: Paint) => play(seconds / ctx.speed, (t) => paint(t * ctx.speed), ctx.signal);
    const table = rig<TableScene>("table");
    if (!table) return ctx.commit();
    return stage(table, beat, ctx, run);
}
