import type { PlayerView } from "@feed/shared";
import { commitBeat, diffViews, type Beat } from "./beats";

export type Stage = {
    /** The moment the table shows; it trails the server while beats are performed. */
    view: PlayerView;
    beat?: Beat;
    /** The narration line; it stays until a later beat replaces it. */
    caption?: string;
    busy: boolean;
};

export type BeatContext = {
    /** 1 at normal pace, higher while the table catches up with the server. */
    speed: number;
    display: PlayerView;
    next: PlayerView;
    viewerId: string;
    /** Apply this beat's change now, e.g. so the real element takes over from a landed ghost. */
    commit(): void;
    signal: AbortSignal;
};

export type Performer = (beat: Beat, ctx: BeatContext) => Promise<void>;

/**
 * Turns the server's views into a performed sequence. Each incoming view is diffed against the
 * previous one; its beats play in order, each committing only what it showed, and the table lands
 * on the server's view when they are done. Prompts therefore appear after the story that led to them.
 */
export class Director {
    private stage: Stage | undefined;
    private latest: PlayerView | undefined;
    private queue: Array<{ next: PlayerView; beats: Beat[] }> = [];
    private running = false;
    private performer: Performer | undefined;
    private listeners = new Set<() => void>();
    private abort = new AbortController();

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    snapshot = () => this.stage;

    setPerformer(performer: Performer | undefined) {
        this.performer = performer;
    }

    receive(view: PlayerView) {
        const sameSeat = this.latest?.roomId === view.roomId && this.latest.viewerId === view.viewerId;
        if (!sameSeat || !this.stage || !this.latest) {
            this.cut(view);
            return;
        }
        const beats = diffViews(this.latest, view);
        this.latest = view;
        this.queue.push({ next: view, beats });
        void this.drain();
    }

    /** Shows `view` as is, dropping any story still pending (joining, reconnecting, leaving). */
    cut(view: PlayerView | undefined) {
        this.abort.abort();
        this.abort = new AbortController();
        this.queue = [];
        this.latest = view;
        this.stage = view ? { view, busy: false } : undefined;
        this.emit();
    }

    private update(patch: Partial<Stage>) {
        if (!this.stage) return;
        this.stage = { ...this.stage, ...patch };
        this.emit();
    }

    private emit() {
        for (const listener of this.listeners) listener();
    }

    private async drain() {
        if (this.running) return;
        this.running = true;
        const signal = this.abort.signal;
        try {
            while (this.queue.length && !signal.aborted && this.stage) {
                const { next, beats } = this.queue.length > 1 ? this.coalesce(this.stage.view) : this.queue.shift()!;
                for (const beat of beats) {
                    if (signal.aborted) return;
                    await this.perform(beat, next, signal);
                }
                if (signal.aborted) return;
                this.update({ view: next, beat: undefined, busy: this.queue.length > 0 });
            }
        } finally {
            this.running = false;
            if (this.queue.length) void this.drain();
        }
    }

    /**
     * Behind by several views: tell one story from what is shown to the latest moment. The reveal,
     * the voyage and the new captain survive the merge; only the steps in between are dropped.
     */
    private coalesce(shown: PlayerView) {
        const next = this.queue[this.queue.length - 1]!.next;
        this.queue = [];
        return { next, beats: diffViews(shown, next) };
    }

    private async perform(beat: Beat, next: PlayerView, signal: AbortSignal) {
        const speed = this.queue.length ? 1.6 : 1;
        let committed = false;
        const commit = () => {
            if (committed || signal.aborted || !this.stage) return;
            committed = true;
            this.update({ view: commitBeat(beat, this.stage.view, next) });
        };
        this.update({ beat, busy: true, ...(beat.caption ? { caption: beat.caption } : {}) });
        if (this.performer && this.stage) {
            try {
                await this.performer(beat, { speed, display: this.stage.view, next, viewerId: next.viewerId, commit, signal });
            } catch (error) {
                console.error(`[director] ${beat.kind} failed`, error);
            }
        }
        commit();
    }
}

export const director = new Director();
