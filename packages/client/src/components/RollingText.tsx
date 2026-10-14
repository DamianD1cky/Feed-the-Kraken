import { useLayoutEffect, useRef } from "react";

const CJK = "\\u3000-\\u303f\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef";
const TOKENS = new RegExp(`[${CJK}]|[^\\s${CJK}]+|\\s+`, "g");

/**
 * Text that changes by rolling: the old words leave upward and the new ones rise into place from
 * behind a clip, one after another. A swap would read as a slide change; this carries the line.
 */
export function RollingText({ text, className = "", stagger = 0.032 }: { text: string; className?: string; stagger?: number }) {
    const stage = useRef<HTMLSpanElement>(null);
    const shown = useRef<string | null>(null);

    useLayoutEffect(() => {
        const host = stage.current;
        if (!host || shown.current === text) return;
        const first = shown.current === null;
        shown.current = text;
        for (const old of host.querySelectorAll<HTMLElement>(".roll-layer:not(.is-leaving)")) {
            old.classList.add("is-leaving");
            old.querySelectorAll<HTMLElement>(".roll-word > span").forEach((s, i) => {
                s.style.transitionDelay = `${(i * stagger * 0.5).toFixed(3)}s`;
            });
            window.setTimeout(() => old.remove(), 900);
        }
        if (!text) return;
        const layer = document.createElement("span");
        layer.className = "roll-layer";
        for (const token of text.match(TOKENS) ?? []) {
            if (/^\s+$/.test(token)) {
                layer.append(" ");
                continue;
            }
            const word = document.createElement("span");
            word.className = "roll-word";
            const inner = document.createElement("span");
            inner.textContent = token;
            word.append(inner);
            layer.append(word);
        }
        if (!first) {
            layer.classList.add("is-entering");
            layer.querySelectorAll<HTMLElement>(".roll-word > span").forEach((s, i) => {
                s.style.transitionDelay = `${(0.08 + i * stagger).toFixed(3)}s`;
            });
        }
        host.append(layer);
        if (!first) requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.remove("is-entering")));
    }, [text, stagger]);

    return (
        <span className={`roll ${className}`}>
            <span className="sr-only">{text}</span>
            <span ref={stage} className="roll-stage" aria-hidden="true" />
        </span>
    );
}
