import { useEffect, useState } from "react";
import type { PlayerView } from "@feed/shared";
import { joinGameRoom } from "../connection";
import { perform } from "../director/choreography";
import { director, type Stage as StageState } from "../director/director";
import { useAppStore } from "../store";
import { Dock } from "../components/Dock";
import { TableTop } from "../components/TableTop";

const TITLE = "险恶疑航 · Feed the Kraken";

export function Table({ stage, onOpenLog }: { stage: StageState; onOpenLog(): void }) {
    const { view } = stage;
    const connected = useAppStore((s) => s.connected);
    const yourMove = view.phase !== "ended" && Boolean(view.privatePrompt && view.privatePrompt.action !== "wait");

    useEffect(() => {
        director.setPerformer(perform);
        return () => director.setPerformer(undefined);
    }, []);
    useEffect(() => {
        document.title = yourMove ? `● 轮到你了 · ${TITLE}` : TITLE;
    }, [yourMove]);
    useEffect(() => () => void (document.title = TITLE), []);

    return (
        <div className="table" data-phase={view.phase} data-your-move={yourMove || undefined}>
            <TableTop stage={stage} onOpenLog={onOpenLog} />
            {!connected && <ReconnectBanner view={view} />}
            <Dock view={view} />
        </div>
    );
}

function ReconnectBanner({ view }: { view: PlayerView }) {
    const [busy, setBusy] = useState(false);
    async function reconnect() {
        setBusy(true);
        try {
            await joinGameRoom(view.roomId, view.me.nickname, "reconnect");
        } catch (error) {
            useAppStore.getState().setError(error instanceof Error ? error.message : "恢复失败");
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="reconnect-banner" role="status">
            <span>航线已中断，恢复连接后可继续操作。</span>
            <button className="primary" disabled={busy} onClick={() => void reconnect()}>
                {busy ? "正在恢复…" : "恢复连接"}
            </button>
        </div>
    );
}
