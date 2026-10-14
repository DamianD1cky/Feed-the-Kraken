import { useState } from "react";
import { useAppStore } from "../store";

export function RoomCode({ roomId, className = "" }: { roomId: string; className?: string }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(roomId);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            useAppStore.getState().setError(`请手动复制房间号：${roomId}`);
        }
    }
    return (
        <button type="button" className={`room-code ${className}`} onClick={() => void copy()} aria-label={`复制房间号 ${roomId}`}>
            <span className="room-code-label">ROOM</span>
            <span className="room-code-id">{roomId}</span>
            <span className="room-code-state" data-copied={copied || undefined}>
                {copied ? "已复制" : "复制"}
            </span>
        </button>
    );
}
