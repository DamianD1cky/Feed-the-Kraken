export type Curve = (u: number) => number;

export const clamp = (value: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Where `t` sits inside [start, end], as 0…1. */
export const span = (t: number, start: number, end: number) =>
    end <= start ? (t >= end ? 1 : 0) : clamp((t - start) / (end - start));

const outPow =
    (n: number): Curve =>
    (u) =>
        1 - (1 - u) ** n;
const expoIn: Curve = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : (2 ** (10 * u) - 1) / 1023);

/**
 * Speed shapes. The "Out" curves cover most of the distance early and settle — they read as a
 * landing. The "InOut" curves start and stop at rest — a camera leg or a carry between two places.
 * A soft symmetric curve on everything makes every move feel the same, so pick by what lands.
 */
export const curves = {
    linear: (u) => u,
    smoothstep: (u) => u * u * (3 - 2 * u),
    sineInOut: (u) => (1 - Math.cos(Math.PI * u)) / 2,
    cubicInOut: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (2 - 2 * u) ** 3 / 2),
    cubicOut: outPow(3),
    quintOut: outPow(5),
    expoOut: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : (1 - 2 ** (-10 * u)) / (1 - 2 ** -10)),
    expoInOut: (u) => (u < 0.5 ? expoIn(2 * u) / 2 : 1 - expoIn(2 - 2 * u) / 2),
} satisfies Record<string, Curve>;

/**
 * A damped spring released at 0 and pulled toward 1, `t` seconds after release.
 * `damping` below 1 overshoots (0.45 bouncy … 0.85 firm); `stiffness` is the natural angular frequency.
 */
export function spring(t: number, damping = 0.7, stiffness = 18): number {
    if (t <= 0) return 0;
    const decay = damping * stiffness;
    if (damping < 1) {
        const w = stiffness * Math.sqrt(1 - damping * damping);
        return 1 - Math.exp(-decay * t) * (Math.cos(w * t) + (decay / w) * Math.sin(w * t));
    }
    return 1 - Math.exp(-stiffness * t) * (1 + stiffness * t);
}

/** Seconds until a spring stays within `eps` of rest — how long a beat must hold for it. */
export function springSettle(damping = 0.7, stiffness = 18, eps = 0.01) {
    let last = 0;
    for (let ms = 1; ms <= 4000; ms++) if (Math.abs(1 - spring(ms / 1000, damping, stiffness)) > eps) last = ms;
    return last / 1000;
}

/** The after-shock of a hit: a sine that dies away. Zero before the hit. */
export const wobble = (t: number, decay = 8, freq = 24) => (t <= 0 ? 0 : Math.exp(-decay * t) * Math.sin(freq * t));

/** A smooth hump: 1 at x = 0, falling to 0 at |x| ≥ 1. */
export const bump = (x: number) => {
    const a = Math.abs(x);
    return a >= 1 ? 0 : (1 - a * a) ** 2;
};

/** Frame-rate independent approach toward `target`; `rate` is per second. */
export const approach = (current: number, target: number, rate: number, dt: number) =>
    current + (target - current) * (1 - Math.exp(-rate * dt));
