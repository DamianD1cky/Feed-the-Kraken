import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

export function CopyButton({
    text,
    label,
    copiedLabel = "已复制",
    onFail,
    className = "",
}: {
    text: string;
    label: string;
    copiedLabel?: string;
    onFail(): void;
    className?: string;
}) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<number>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1800);
        } catch {
            onFail();
        }
    }
    return (
        <button
            type="button"
            className={`copy-button ${copied ? "is-copied" : ""} ${className}`}
            onClick={() => void copy()}
        >
            <span className="copy-icon" aria-hidden="true">
                <Copy size={16} />
                <Check size={16} weight="bold" />
            </span>
            <span aria-live="polite">{copied ? copiedLabel : label}</span>
        </button>
    );
}
