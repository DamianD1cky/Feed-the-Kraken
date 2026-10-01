import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "@phosphor-icons/react";

type Crew = { id: string; name: string };

export function CrewPicker({
    label,
    crew,
    value,
    onChange,
    unavailable,
}: {
    label: string;
    crew: Crew[];
    value: string;
    onChange(id: string): void;
    /** 已被另一个选择器占用的船员 */
    unavailable?: string;
}) {
    return (
        <div className="picker" role="radiogroup" aria-label={label}>
            <span className="picker-label">{label}</span>
            <div className="picker-options">
                {crew.map((member) => (
                    <button
                        key={member.id}
                        type="button"
                        role="radio"
                        aria-checked={value === member.id}
                        disabled={unavailable === member.id}
                        className="crew-chip"
                        onClick={() => onChange(member.id)}
                    >
                        {member.name}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function Segmented<T extends string | number>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: Array<{ value: T; label: ReactNode }>;
    value: T;
    onChange(value: T): void;
}) {
    return (
        <div className="picker" role="radiogroup" aria-label={label}>
            <span className="picker-label">{label}</span>
            <div className="segmented">
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={value === option.value}
                        onClick={() => onChange(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

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
