import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Flask } from "@phosphor-icons/react";
import { MIN_PLAYERS, type PlayerView, type VisiblePlayer } from "@feed/shared";
import { inviteLink } from "../connection";
import type { Stage as StageState } from "../director/director";
import { publishRig } from "../motion/anchors";
import { art, directionLabels, effectHints, effectLabels, factionArt, factionLabel, phaseLabels, roleLabel, waitingOn } from "../labels";
import { useAppStore } from "../store";
import { trackRef } from "../table3d/overlay";
import { TableScene } from "../table3d/TableScene";
import { useDesk, useSelection } from "../table/selection";
import { testModeEnabled } from "../testMode";
import { openTestPlayerTabs } from "../testPlayers";
import { CopyButton } from "./controls";
import { RollingText } from "./RollingText";
import { RoomCode } from "./RoomCode";

/**
 * The table, seen from your chair. The scene draws the wood, the chart and everything on it;
 * the HTML here is what you read and press: name slips beside the seals, and invisible buttons
 * lying exactly over your cards, your identity card and the logbook.
 */
export function TableTop({ stage, onOpenLog }: { stage: StageState; onOpenLog(): void }) {
    const host = useRef<HTMLDivElement>(null);
    const [scene, setScene] = useState<TableScene>();
    const [failed, setFailed] = useState(false);
    const { view } = stage;

    useEffect(() => {
        let table: TableScene;
        try {
            table = new TableScene(host.current!);
        } catch (error) {
            console.error("[table] WebGL unavailable", error);
            setFailed(true);
            return;
        }
        setScene(table);
        const unpublish = publishRig("table", table);
        if (import.meta.env.DEV) Object.assign(window, { __table: table });
        return () => {
            unpublish();
            table.dispose();
        };
    }, []);

    useEffect(() => scene?.setView(view), [scene, view]);

    const cardId = useSelection((s) => s.cardId);
    const firstMateId = useSelection((s) => s.firstMateId);
    const navigatorId = useSelection((s) => s.navigatorId);
    const dossierOpen = useDesk((s) => s.dossierOpen);
    const hoverCardId = useDesk((s) => s.hoverCardId);
    useEffect(() => {
        scene?.setUi({ chosenCardId: cardId, hoverCardId, dossierOpen, pending: { firstMate: firstMateId, navigator: navigatorId } });
    }, [scene, cardId, hoverCardId, dossierOpen, firstMateId, navigatorId]);

    useEffect(() => {
        const conceal = () => {
            if (document.hidden) useDesk.getState().setDossierOpen(false);
        };
        document.addEventListener("visibilitychange", conceal);
        return () => document.removeEventListener("visibilitychange", conceal);
    }, []);

    const turn = new Set(waitingOn(view).ids);
    return (
        <div className="tabletop" ref={host} data-phase={view.phase}>
            <div className="table-veil" aria-hidden="true" />
            {failed && (
                <p className="table-failed" role="alert">
                    这台设备的浏览器无法绘制 3D 牌桌（WebGL 不可用）。请换用最新版 Chrome、Edge、Safari 或 Firefox。
                </p>
            )}
            <h1 className="sr-only">{phaseLabels[view.phase]}</h1>
            <TableStatus stage={stage} />
            <div className="table-overlay">
                {view.players.map((player, index) => (
                    <SeatSlip key={player.id} player={player} index={index} view={view} turn={turn.has(player.id)} />
                ))}
                <HandCards view={view} />
                <DossierCard view={view} />
                <button type="button" className="table-hit book-hit" ref={trackRef("book")} onClick={onOpenLog} aria-label="翻开航海日志" />
                {view.phase === "lobby" && <HarborCard view={view} />}
            </div>
        </div>
    );
}

function TableStatus({ stage }: { stage: StageState }) {
    const waiting = waitingOn(stage.view).text;
    return (
        <div className="table-status" aria-live="polite">
            <p className="status-caption">
                <RollingText text={stage.caption ?? ""} stagger={0.01} />
            </p>
            <p className="status-waiting">
                <RollingText text={waiting} stagger={0.012} />
            </p>
        </div>
    );
}

function SeatSlip({ player, index, view, turn }: { player: VisiblePlayer; index: number; view: PlayerView; turn: boolean }) {
    const { mode, candidates, firstMateId, navigatorId, targetId, sent, pick } = useSelection();
    const picking = mode !== "none" && !sent;
    const candidate = picking && candidates.includes(player.id);
    const chosen =
        player.id === targetId ? "target" : player.id === firstMateId ? "firstMate" : player.id === navigatorId ? "navigator" : undefined;
    const me = player.id === view.viewerId;
    const ended = view.phase === "ended";
    const known = !me && !ended && player.faction !== "unknown";
    const offices = [player.isCaptain && "船长", player.isFirstMate && "大副", player.isNavigator && "领航员"].filter(Boolean);
    const label = [
        `${index + 1} 号 ${player.nickname}${me ? "（你）" : ""}`,
        ...offices,
        `${player.guns} 把枪`,
        player.offDuty && "下班",
        player.muted && "割舌",
        ...player.notFactions.map((f) => `不是${factionLabel(f)}`),
        known && `已知是${factionLabel(player.faction)}`,
        ended && player.faction !== "unknown" && `${factionLabel(player.faction)}阵营`,
        !player.connected && "离线",
        player.dead && "已离船",
        player.hasVoted && "已秘密决定",
    ]
        .filter(Boolean)
        .join("，");

    return (
        <button
            type="button"
            className="slip"
            ref={trackRef(`slip:${player.id}`)}
            data-me={me || undefined}
            data-turn={turn || undefined}
            data-dead={player.dead || undefined}
            data-offline={!player.connected || undefined}
            data-candidate={candidate || undefined}
            data-dim={(picking && !candidate) || undefined}
            data-chosen={chosen}
            disabled={!candidate}
            aria-pressed={candidate ? Boolean(chosen) : undefined}
            aria-label={label}
            onClick={() => pick(player.id)}
        >
            <span className="slip-seal" aria-hidden="true" />
            <span className="slip-paper" aria-hidden="true">
                <span className="slip-name">
                    {player.nickname}
                    {me && <small>你</small>}
                </span>
                <span className="slip-meta">
                    <span className="slip-guns">
                        <img src={art.gun} alt="" />
                        <b key={player.guns}>{player.guns}</b>
                    </span>
                    {player.isHost && view.phase === "lobby" && <span className="stamp is-ink">房主</span>}
                    {player.hasVoted && <span className="stamp is-ink">已决定</span>}
                    {player.offDuty && <span className="stamp is-verdigris">下班</span>}
                    {player.muted && <span className="stamp">割舌</span>}
                    {player.notFactions.map((f) => (
                        <span key={f} className="stamp is-ink">
                            不是{factionLabel(f)}
                        </span>
                    ))}
                    {known && <span className="stamp is-gold">已知 · {factionLabel(player.faction)}</span>}
                    {ended && player.faction !== "unknown" && (
                        <span className="stamp is-faction" data-faction={player.faction}>
                            <img src={factionArt[player.faction]} alt="" />
                            {factionLabel(player.faction)}
                        </span>
                    )}
                    {!player.connected && <span className="stamp is-ink">离线</span>}
                    {player.dead && <span className="stamp">离船</span>}
                </span>
            </span>
        </button>
    );
}

/** Your navigation cards, lying at the near edge; pick one up by clicking it. */
function HandCards({ view }: { view: PlayerView }) {
    const cardId = useSelection((s) => s.cardId);
    const sent = useSelection((s) => s.sent);
    const promptKey = useSelection((s) => s.promptKey);
    const action = view.privatePrompt?.action;
    const choosing = (action === "keep-card" || action === "navigate") && !sent && !promptKey.endsWith(":stale");
    return (
        <>
            {(view.hand ?? []).map((card) => (
                <button
                    key={card.id}
                    type="button"
                    className="table-hit card-hit"
                    ref={trackRef(`card:${card.id}`)}
                    disabled={!choosing}
                    aria-pressed={choosing ? cardId === card.id : undefined}
                    aria-label={`${directionLabels[card.direction]} · ${effectLabels[card.effect]}：${effectHints[card.effect]}`}
                    onClick={() => useSelection.getState().chooseCard(card.id)}
                    onPointerEnter={() => useDesk.getState().hoverCard(card.id)}
                    onPointerLeave={() => useDesk.getState().hoverCard(undefined)}
                />
            ))}
        </>
    );
}

function DossierCard({ view }: { view: PlayerView }) {
    const open = useDesk((s) => s.dossierOpen);
    const { faction, role, conversionImmune } = view.me;
    if (!faction || !role) return null;
    const known = view.players.filter((p) => p.id !== view.viewerId && p.faction !== "unknown");
    return (
        <>
            <button
                type="button"
                className="table-hit dossier-hit"
                ref={trackRef("dossier")}
                aria-expanded={open}
                aria-label={open ? `身份卡：${roleLabel(role)}，${factionLabel(faction)}阵营。点击合上` : "翻开身份卡（只有你看得到）"}
                onClick={() => useDesk.getState().setDossierOpen(!open)}
            />
            {open && (
                <div className="dossier-note" role="note" style={{ "--n": known.length } as CSSProperties}>
                    <p className="eyebrow">FOR YOUR EYES ONLY</p>
                    <strong>
                        {roleLabel(role)} · {factionLabel(faction)}阵营
                    </strong>
                    {conversionImmune && <small>你已被搜查或鞭笞，不可再被皈依。</small>}
                    {known.length > 0 && (
                        <small>
                            你知道：{known.map((p) => `${p.nickname} 是${factionLabel(p.faction)}`).join("，")}
                            {view.phase !== "ended" && "（可能已变化）"}
                        </small>
                    )}
                    <small>离开页面时会自动合上。</small>
                </div>
            )}
        </>
    );
}

/** In port, the chart carries the muster: who is aboard, how many more are needed, the room to share. */
function HarborCard({ view }: { view: PlayerView }) {
    const count = view.players.length;
    const missing = Math.max(0, MIN_PLAYERS - count);
    const link = inviteLink(view.roomId);
    return (
        <div className="harbor-card" ref={trackRef("chart")}>
            <div className="harbor-card-inner">
                <p className="eyebrow">ALL ABOARD · 港口集结</p>
                <h2>
                    船已就位。
                    <br />
                    只等你的同伴。
                </h2>
                <p>{missing ? `已有 ${count} 位船员登船，至少还需 ${missing} 位。` : `${count} 位船员已登船，等待房主扬帆。`}</p>
                <div className="harbor-invite">
                    <RoomCode roomId={view.roomId} className="is-large" />
                    <CopyButton
                        text={link}
                        label="复制邀请链接"
                        onFail={() => useAppStore.getState().setError(`无法访问剪贴板，请手动复制：${link}`)}
                    />
                </div>
                <ol className="berths" aria-label={`${count} / 11 个铺位已占用`}>
                    {Array.from({ length: 11 }, (_, i) => (
                        <li key={i} style={{ "--i": i } as CSSProperties} data-filled={i < count || undefined} data-required={i < MIN_PLAYERS || undefined} />
                    ))}
                </ol>
                {testModeEnabled && view.me.isHost && missing > 0 && <TestFillButton roomId={view.roomId} missing={missing} />}
            </div>
        </div>
    );
}

/** Test mode: the host fills the empty berths with real players, each in a tab of its own. */
function TestFillButton({ roomId, missing }: { roomId: string; missing: number }) {
    function fill() {
        try {
            const opened = openTestPlayerTabs(roomId, missing);
            if (opened < missing) {
                useAppStore
                    .getState()
                    .setError(`只成功打开了 ${opened}/${missing} 个测试窗口。若浏览器拦截了弹窗，请点击地址栏的弹窗拦截图标并选择「始终允许此网站的弹出式窗口」，然后重试。`);
            }
        } catch (error) {
            useAppStore.getState().setError(error instanceof Error ? error.message : "无法加入测试船员");
        }
    }
    return (
        <button type="button" className="quiet test-button" onClick={fill}>
            <Flask size={16} aria-hidden="true" />
            打开 {missing} 个测试窗口
        </button>
    );
}
