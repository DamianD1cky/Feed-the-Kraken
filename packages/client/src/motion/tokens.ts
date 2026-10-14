import { curves, spring, springSettle, type Curve } from "./curves";

const sample = (fn: Curve, steps: number) =>
    `linear(${Array.from({ length: steps + 1 }, (_, i) => Number(fn(i / steps).toFixed(4))).join(", ")})`;

/** A spring as a CSS easing plus the duration it needs to settle. */
function springEasing(damping: number, stiffness: number) {
    const seconds = springSettle(damping, stiffness, 0.004);
    return { easing: sample((u) => spring(u * seconds, damping, stiffness), 56), seconds };
}

/**
 * Publishes the JS curves to CSS as `linear()` easings, so a CSS transition lands on the same spring
 * a choreography uses. styles.css declares cubic-bezier fallbacks for browsers without `linear()`.
 */
export function installMotionTokens(root = document.documentElement) {
    if (typeof CSS === "undefined" || !CSS.supports("transition-timing-function", "linear(0, 1)")) return;
    const springs = {
        land: springEasing(0.62, 19),
        pop: springEasing(0.46, 26),
        firm: springEasing(0.86, 17),
    };
    for (const [name, { easing, seconds }] of Object.entries(springs)) {
        root.style.setProperty(`--ease-${name}`, easing);
        root.style.setProperty(`--dur-${name}`, `${seconds.toFixed(3)}s`);
    }
    root.style.setProperty("--ease-snap", sample(curves.expoOut, 40));
    root.style.setProperty("--ease-glide", sample(curves.cubicInOut, 32));
    root.style.setProperty("--ease-whip", sample(curves.expoInOut, 48));
}
