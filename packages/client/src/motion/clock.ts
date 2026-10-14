type FrameFn = (now: number, dt: number) => void | false;

const frames = new Set<FrameFn>();
let handle = 0;
let last = 0;

function tick(now: number) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    for (const fn of [...frames]) if (fn(now, dt) === false) frames.delete(fn);
    handle = frames.size ? requestAnimationFrame(tick) : 0;
}

/** One requestAnimationFrame loop for the whole table. Return `false` from `fn` to leave it. */
export function onFrame(fn: FrameFn): () => void {
    frames.add(fn);
    if (!handle) {
        last = performance.now();
        handle = requestAnimationFrame(tick);
    }
    return () => {
        frames.delete(fn);
    };
}

const reduced = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined;

/** `?slowmo=4` stretches every choreography four times, for inspecting a beat frame by frame. */
const slowmo = typeof location === "undefined" ? 1 : Math.max(1, Number(new URLSearchParams(location.search).get("slowmo")) || 1);

/** Background tabs get no frames; reduced motion asks for none. Either way, land immediately. */
export const motionEnabled = () => !reduced?.matches && document.visibilityState === "visible";

export type Paint = (t: number) => void;

/**
 * Paints `paint(t)` for t from 0 to `seconds` and resolves once the final frame is painted.
 * When motion is off, the tab hides, or `signal` aborts, it paints the final frame at once,
 * so a choreography can never stall the game behind it.
 */
export function play(seconds: number, paint: Paint, signal?: AbortSignal): Promise<void> {
    if (!motionEnabled() || seconds <= 0 || signal?.aborted) {
        paint(seconds);
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        let start = -1;
        let finished = false;
        let leave = () => {};
        const finish = () => {
            if (finished) return;
            finished = true;
            leave();
            clearTimeout(guard);
            document.removeEventListener("visibilitychange", onVisibility);
            signal?.removeEventListener("abort", finish);
            paint(seconds);
            resolve();
        };
        const onVisibility = () => {
            if (document.hidden) finish();
        };
        // rAF can be throttled without a visibility change (embedded views); never wait much past the end.
        const guard = setTimeout(finish, seconds * slowmo * 1000 + 300);
        document.addEventListener("visibilitychange", onVisibility);
        signal?.addEventListener("abort", finish);
        leave = onFrame((now) => {
            if (start < 0) start = now;
            const t = (now - start) / 1000 / slowmo;
            if (t >= seconds) {
                finish();
                return false;
            }
            paint(t);
        });
    });
}

export const hold = (seconds: number, signal?: AbortSignal) => play(seconds, () => {}, signal);

/** Resolves once the DOM has painted the latest render; never waits on frames a hidden tab won't get. */
export const afterPaint = () =>
    new Promise<void>((resolve) => {
        const fallback = setTimeout(resolve, 80);
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                clearTimeout(fallback);
                resolve();
            }),
        );
    });
