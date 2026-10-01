import { useState } from "react";
import { MIN_PLAYERS, type PlayerView } from "@feed/shared";
import { ArrowCounterClockwise, Flask } from "@phosphor-icons/react";
import { testModeEnabled } from "../testMode";
import { inviteLink, joinGameRoom } from "../connection";
import { useAppStore } from "../store";
import { art, cardArt, directionLabels, effectLabels, phaseLabels } from "../labels";
import { ActionPanel } from "../components/ActionPanel";
import { CopyButton } from "../components/controls";
import { CrewRail } from "../components/CrewRail";
import { GuideRail } from "../components/GuideRail";
import { SeaChart } from "../components/SeaChart";

function reportCopyFailure(text: string) {
    useAppStore.getState().setError(`无法访问剪贴板，请手动复制：${text}`);
}

function formatClock(at: number) {
    const date = new Date(at);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function RoomView({ view }: { view: PlayerView }) {
    const connected = useAppStore((state) => state.connected);
    return (
        <div className="room-scene">
            {!connected && <ReconnectBanner view={view} />}
            <div className="room-grid">
                <CrewRail view={view} />
                <div className="room-center">
                    {view.phase === "lobby" ? <WaitingCenter view={view} /> : <VoyageCenter view={view} />}
                </div>
                <div className="side-stack">
                    {view.phase !== "lobby" && (
                        <ActionPanel key={`${view.roundNo}:${view.phase}:${view.privatePrompt?.action}`} view={view} />
                    )}
                    <GuideRail />
                </div>
            </div>
        </div>
    );
}

function ReconnectBanner({ view }: { view: PlayerView }) {
    const [reconnecting, setReconnecting] = useState(false);
    async function reconnect() {
        setReconnecting(true);
        try {
            await joinGameRoom(view.roomId, view.me.nickname, "reconnect");
        } catch (error) {
            useAppStore.getState().setError(error instanceof Error ? error.message : "恢复失败");
        } finally {
            setReconnecting(false);
        }
    }
    return (
        <div className="reconnect-banner" role="status">
            <span>连接已中断，恢复后可继续操作。</span>
            <button disabled={reconnecting} onClick={() => void reconnect()}>
                <ArrowCounterClockwise size={16} aria-hidden="true" />
                {reconnecting ? "正在恢复" : "恢复连接"}
            </button>
        </div>
    );
}

function WaitingCenter({ view }: { view: PlayerView }) {
    const missing = Math.max(0, MIN_PLAYERS - view.players.length);
    const host = view.players.find((player) => player.isHost);
    const status =
        missing > 0 ? `还差 ${missing} 位船员即可起航`
        : host?.id === view.viewerId ? "人数已够，随时可以起航"
        : `人数已够，等待 ${host?.nickname ?? "房主"} 起航`;

    return (
        <>
            <header className="waiting-hero">
                <img
                    src={art.warmHarbor}
                    srcSet={art.warmHarborSrcSet}
                    sizes="(max-width: 880px) 100vw, 760px"
                    alt="船员沿着石阶走向停泊的帆船"
                    decoding="async"
                />
                <div className="waiting-hero-copy">
                    <h1>{phaseLabels.lobby}</h1>
                    <p>{status}</p>
                </div>
            </header>

            <section className="invite" aria-label="邀请船员">
                <div className="room-code-block">
                    <span>房间号</span>
                    <strong className="room-code">{view.roomId}</strong>
                </div>
                <div className="invite-actions">
                    <CopyButton text={view.roomId} label="复制房间号" onFail={() => reportCopyFailure(view.roomId)} />
                    <CopyButton
                        text={inviteLink(view.roomId)}
                        label="复制邀请链接"
                        className="is-accent"
                        onFail={() => reportCopyFailure(inviteLink(view.roomId))}
                    />
                </div>
            </section>

            <div className="waiting-action">
                <ActionPanel key={`lobby:${view.privatePrompt?.action}`} view={view} />
                {testModeEnabled && view.me.isHost && missing > 0 && <TestFillButton view={view} missing={missing} />}
            </div>
        </>
    );
}

function TestFillButton({ view, missing }: { view: PlayerView; missing: number }) {
    const [busy, setBusy] = useState(false);
    async function fill() {
        setBusy(true);
        try {
            const { fillWithTestBots } = await import("../testBots");
            await fillWithTestBots(view.roomId, view.players.length);
        } catch (error) {
            useAppStore.getState().setError(error instanceof Error ? error.message : "无法加入测试船员");
        } finally {
            setBusy(false);
        }
    }
    return (
        <button className="quiet test-button" disabled={busy} onClick={() => void fill()}>
            <Flask size={16} aria-hidden="true" />
            {busy ? "正在加入" : `补齐 ${missing} 位测试船员`}
        </button>
    );
}

function VoyageCenter({ view }: { view: PlayerView }) {
    const connected = useAppStore((state) => state.connected);
    return (
        <>
            <header className="room-heading">
                <div>
                    <h1 key={view.phase}>{phaseLabels[view.phase]}</h1>
                    <p className="room-meta">
                        <span>第 {view.roundNo} 轮</span>
                        <span>{view.voyageMode === "long" ? "漫长航行" : "快速航行"}</span>
                        <CopyButton
                            className="room-chip"
                            text={view.roomId}
                            label={`房间 ${view.roomId}`}
                            onFail={() => reportCopyFailure(view.roomId)}
                        />
                    </p>
                </div>
                <span className={connected ? "connection live" : "connection"}>{connected ? "已连接" : "已断线"}</span>
            </header>

            <section className="chart-workspace">
                {view.voyageMode === "long" && (
                    <p className="supply-line">补给线{view.supplyLineCrossed ? "已越过，枪数已补足" : "尚未越过"}</p>
                )}
                <SeaChart view={view} />
                {view.lastRevealedCard && (
                    <div className="last-card" key={view.lastRevealedCard.id}>
                        <img src={cardArt[view.lastRevealedCard.direction]} alt="" width={56} height={56} />
                        <span>
                            <small>最近执行的航行牌</small>
                            <strong>
                                {directionLabels[view.lastRevealedCard.direction]}
                                <em>{effectLabels[view.lastRevealedCard.effect]}</em>
                            </strong>
                        </span>
                    </div>
                )}
            </section>

            <details className="ship-log" open>
                <summary>
                    航海日志 <span>公开事件</span>
                </summary>
                <ol>
                    {view.publicLog
                        .filter((entry) => entry.message)
                        .slice()
                        .reverse()
                        .map((entry) => (
                            <li key={entry.seq}>
                                <span className="log-seq">{String(entry.seq).padStart(3, "0")}</span>
                                <time className="log-time" dateTime={new Date(entry.at).toISOString()}>
                                    {formatClock(entry.at)}
                                </time>
                                <span className="log-msg">{entry.message}</span>
                            </li>
                        ))}
                </ol>
            </details>
        </>
    );
}
