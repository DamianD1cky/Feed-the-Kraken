import { useEffect, useRef, type CSSProperties } from "react";
import type { PlayerView } from "@feed/shared";
import { leaveGameRoom } from "../connection";
import { art } from "../labels";
import { RoomCode } from "./RoomCode";

export type Scene = "harbor" | "table";

/** The harbour picture behind everything: the lobby's scene, then the ground the table sits on. */
export function World({ scene }: { scene: Scene }) {
    return (
        <div className="world" data-scene={scene} aria-hidden="true">
            <img className="world-art" src={art.harbor} srcSet={art.harborSrcSet} sizes="100vw" alt="" fetchPriority="high" />
            <div className="world-shade" />
            <div className="world-veil" />
        </div>
    );
}

type TopBarProps = { view?: PlayerView; connected: boolean; onRules(): void; onLog(): void };

export function TopBar({ view, connected, onRules, onLog }: TopBarProps) {
    return (
        <nav className="topbar" aria-label="主导航">
            <span className="wordmark">
                <span className="wordmark-star" aria-hidden="true">
                    ✦
                </span>
                <span className="wordmark-text">FEED THE KRAKEN</span>
            </span>
            {view && (
                <div className="topbar-room">
                    <RoomCode roomId={view.roomId} />
                    <span className={connected ? "connection live" : "connection"}>{connected ? "已连接" : "已断线"}</span>
                </div>
            )}
            <div className="topbar-actions">
                {view && (
                    <button className="quiet" onClick={onLog}>
                        航海日志
                    </button>
                )}
                <button className="quiet" onClick={onRules}>
                    船员手册 ↗
                </button>
                {view && (
                    <button className="quiet" onClick={leaveGameRoom}>
                        返回港口
                    </button>
                )}
            </div>
        </nav>
    );
}

export function LogDrawer({ view, onClose }: { view: PlayerView; onClose(): void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const trigger = document.activeElement;
        const modal = dialog.current;
        modal?.showModal();
        return () => {
            modal?.close();
            if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
        };
    }, []);
    const entries = view.publicLog.filter((entry) => entry.message).slice().reverse();
    return (
        <dialog ref={dialog} className="drawer" onCancel={onClose} aria-labelledby="log-title">
            <header>
                <div>
                    <span className="eyebrow">SHIP'S LOG · 公开事件</span>
                    <h2 id="log-title">航海日志</h2>
                </div>
                <button className="quiet" onClick={onClose} aria-label="关闭航海日志">
                    关闭 ×
                </button>
            </header>
            <ol className="log-list">
                {entries.map((entry, i) => (
                    <li key={entry.seq} style={{ "--i": i } as CSSProperties}>
                        <span>{String(entry.seq).padStart(3, "0")}</span>
                        {entry.message}
                    </li>
                ))}
            </ol>
        </dialog>
    );
}
