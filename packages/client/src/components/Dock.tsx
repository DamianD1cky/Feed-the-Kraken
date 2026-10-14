import { useEffect, useState, type CSSProperties } from "react";
import {
    defaultVoyageMode,
    mutinyThreshold,
    type ClientAction,
    type PlayerView,
    type PrivatePrompt,
    type VoyageMode,
} from "@feed/shared";
import { leaveGameRoom, sendAction } from "../connection";
import { art, directionLabels, effectLabels, factionArt, factionLabel, officeArt } from "../labels";
import { officeLabels } from "../director/beats";
import { useAppStore } from "../store";
import { intent, useSelection, type PickMode } from "../table/selection";
import { NavCard } from "./NavCard";

const PICK_ACTIONS = new Set(["pick-player", "ritual-convert", "mutiny-tiebreak"]);

export function Dock({ view }: { view: PlayerView }) {
    return (
        <aside className="dock" aria-label="你的行动">
            <Intel view={view} />
            <ActionDock view={view} />
        </aside>
    );
}

function act(action: ClientAction) {
    useSelection.getState().markSent();
    sendAction(action);
}

/** Everything that makes a prompt this prompt; two views with the same signature ask the same thing. */
function promptSignature(view: PlayerView) {
    const prompt = view.privatePrompt;
    return [
        view.roomId,
        view.roundNo,
        view.phase,
        prompt?.action ?? "wait",
        prompt?.title,
        (prompt?.candidates ?? []).join(","),
        (view.hand ?? []).map((card) => card.id).join(","),
    ].join("|");
}

function ActionDock({ view }: { view: PlayerView }) {
    const connected = useAppStore((s) => s.connected);
    const error = useAppStore((s) => s.error);
    const latest = useAppStore((s) => s.view);
    const sent = useSelection((s) => s.sent);
    const prompt = view.privatePrompt;
    const action = prompt?.action ?? "wait";
    const candidates = prompt?.candidates ?? [];
    const promptKey = promptSignature(view);
    // While the table is still telling what happened, the server may already have moved past this prompt.
    const stale = Boolean(latest) && promptSignature(latest!) !== promptKey;
    const mode: PickMode = stale ? "none" : action === "assign-officers" ? "officers" : PICK_ACTIONS.has(action) ? "single" : "none";

    useEffect(() => {
        // The key covers mode and the candidate list.
        useSelection.getState().begin(stale ? `${promptKey}:stale` : promptKey, mode, stale ? [] : candidates);
    }, [promptKey, stale]);
    useEffect(() => {
        if (error) useSelection.getState().unsend();
    }, [error]);

    if (view.phase === "ended") return <Victory view={view} />;
    const yourMove = action !== "wait" && !stale;
    return (
        <section
            key={`${action}|${prompt?.title}|${candidates.join(",")}`}
            className="action-dock"
            data-your-move={yourMove || undefined}
        >
            <p className="eyebrow">{yourMove ? "YOUR MOVE · 轮到你了" : "STAND BY · 静候"}</p>
            <h2>{prompt?.title ?? "等待航行"}</h2>
            {prompt?.description && <p className="dock-note">{prompt.description}</p>}
            <fieldset disabled={!connected || sent || stale}>
                <Controls view={view} prompt={prompt} />
            </fieldset>
            {sent && <p className="dock-sent">已送出，等待船上的回应…</p>}
            {!sent && stale && action !== "wait" && <p className="dock-sent">船上正在结算刚才发生的事…</p>}
        </section>
    );
}

function Controls({ view, prompt }: { view: PlayerView; prompt?: PrivatePrompt }) {
    switch (prompt?.action) {
        case "start-game":
            return <StartControls view={view} />;
        case "assign-officers":
            return <OfficerControls view={view} />;
        case "mutiny":
            return <MutinyControls view={view} />;
        case "mutiny-tiebreak":
            return <PickControls view={view} verb="剔除" />;
        case "pick-player":
            return <PickControls view={view} verb="选定" />;
        case "ritual-convert":
            return <PickControls view={view} verb="皈依" />;
        case "keep-card":
        case "navigate":
            return <Hand view={view} navigate={prompt.action === "navigate"} />;
        case "telescope-decide":
            return <TelescopeControls view={view} />;
        case "ritual-guns":
            return <RitualGunsControls view={view} candidates={prompt.candidates ?? []} />;
        case "acknowledge":
            return (
                <button className="primary" onClick={() => act({ type: "acknowledge" })}>
                    已查看私密信息 · 继续
                </button>
            );
        default:
            return null;
    }
}

function StartControls({ view }: { view: PlayerView }) {
    const count = view.players.length;
    const [chosen, setChosen] = useState<VoyageMode>();
    const mode = count === 7 ? (chosen ?? defaultVoyageMode(7)) : defaultVoyageMode(count);
    return (
        <div className="stack">
            <div className="segmented" role="radiogroup" aria-label="航行模式">
                {(["quick", "long"] as const).map((option) => (
                    <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={mode === option}
                        disabled={option === "quick" ? count > 7 : count < 7}
                        onClick={() => setChosen(option)}
                    >
                        <strong>{option === "quick" ? "快速航行" : "漫长航行"}</strong>
                        <small>{option === "quick" ? "19 张航行牌" : "23 张航行牌"}</small>
                    </button>
                ))}
            </div>
            <p className="muted">
                {count} / 11 人{count < 5 ? `，还需 ${5 - count} 位船员。` : "，准备好语音即可出发。"}
            </p>
            <button className="primary embark" disabled={count < 5} onClick={() => act({ type: "startGame", voyageMode: mode })}>
                扬帆起航 <span aria-hidden="true">→</span>
            </button>
        </div>
    );
}

function OfficerControls({ view }: { view: PlayerView }) {
    const firstMateId = useSelection((s) => s.firstMateId);
    const navigatorId = useSelection((s) => s.navigatorId);
    const name = (id?: string) => view.players.find((p) => p.id === id)?.nickname;
    return (
        <div className="stack">
            <div className="officer-slots">
                {(["firstMate", "navigator"] as const).map((office) => {
                    const id = office === "firstMate" ? firstMateId : navigatorId;
                    const active = office === "firstMate" ? !firstMateId : Boolean(firstMateId) && !navigatorId;
                    return (
                        <div key={office} className="officer-slot" data-filled={Boolean(id) || undefined} data-active={active || undefined}>
                            <img src={officeArt[office]} alt="" />
                            <span>
                                <small>{officeLabels[office]}</small>
                                <strong>{id ? name(id) : active ? "点选一位船员" : "—"}</strong>
                            </span>
                            {id && (
                                <button
                                    type="button"
                                    className="quiet slot-clear"
                                    onClick={() => useSelection.getState().pick(id)}
                                    aria-label={`取消任命${officeLabels[office]}`}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            <button
                className="primary"
                disabled={!firstMateId || !navigatorId}
                onClick={() => act({ type: "assignOfficers", firstMateId: firstMateId!, navigatorId: navigatorId! })}
            >
                确认任命
            </button>
        </div>
    );
}

function MutinyControls({ view }: { view: PlayerView }) {
    const [guns, setGuns] = useState(0);
    const total = view.me.guns;
    return (
        <div className="stack">
            <div className="gun-rack" role="group" aria-label="投入枪数">
                {Array.from({ length: total }, (_, i) => (
                    <button
                        key={i}
                        type="button"
                        className="gun-token"
                        style={{ "--i": i } as CSSProperties}
                        aria-pressed={i < guns}
                        aria-label={`投入 ${i + 1} 把枪`}
                        onClick={() => setGuns(guns === i + 1 ? i : i + 1)}
                    >
                        <img src={art.gun} alt="" />
                    </button>
                ))}
                {total === 0 && <p className="muted">你手里没有枪。</p>}
            </div>
            <p className="muted">
                已选 {guns} / {total} 把 · 全船共需 {mutinyThreshold(view.players.length)} 枪发动叛变
            </p>
            <button className="primary" onClick={() => act({ type: "commitMutiny", guns })}>
                {guns === 0 ? "信任这次任命 · 不亮枪" : `秘密握拳 · 亮出 ${guns} 把枪`}
            </button>
        </div>
    );
}

function PickControls({ view, verb }: { view: PlayerView; verb: string }) {
    const targetId = useSelection((s) => s.targetId);
    const name = view.players.find((p) => p.id === targetId)?.nickname;
    const tiebreak = view.privatePrompt?.action === "mutiny-tiebreak";
    return (
        <div className="stack">
            <div className="pick-target" data-filled={Boolean(targetId) || undefined}>
                <small>目标</small>
                <strong>{name ?? "点选桌上的封蜡或名签"}</strong>
            </div>
            <button
                className="primary"
                disabled={!targetId}
                onClick={() =>
                    act(tiebreak ? { type: "eliminateTieCandidate", playerId: targetId! } : { type: "pickPlayer", playerId: targetId! })
                }
            >
                {name ? `${verb} ${name}` : `${verb}目标`}
            </button>
        </div>
    );
}

/** The cards lie on the table in front of you; here you only confirm the one you picked up. */
function Hand({ view, navigate }: { view: PlayerView; navigate: boolean }) {
    const chosenId = useSelection((s) => s.cardId);
    const [jumping, setJumping] = useState(false);
    const cards = view.hand ?? [];
    const chosen = cards.find((card) => card.id === chosenId);
    return (
        <div className="stack">
            <div className="pick-target" data-filled={Boolean(chosen) || undefined}>
                <small>{navigate ? "航线" : "保留"}</small>
                <strong>{chosen ? `${directionLabels[chosen.direction]} · ${effectLabels[chosen.effect]}` : "点选你面前的一张牌"}</strong>
            </div>
            <button
                className="primary"
                disabled={!chosen}
                onClick={() => {
                    intent.keptCardId = chosen!.id;
                    act({ type: "keepNavigationCard", cardId: chosen!.id });
                }}
            >
                {navigate ? "执行这条航线" : "保留这张 · 另一张弃入深海"}
            </button>
            {navigate &&
                (jumping ? (
                    <div className="jump-confirm">
                        <p>跳船后你将离船，无法继续操作，且不会触发领袖献祭胜利。</p>
                        <button onClick={() => act({ type: "jumpShip" })}>确认跳船抗命</button>
                        <button className="quiet" onClick={() => setJumping(false)}>
                            继续选牌
                        </button>
                    </div>
                ) : (
                    <button className="quiet" onClick={() => setJumping(true)}>
                        跳船抗命…
                    </button>
                ))}
        </div>
    );
}

function TelescopeControls({ view }: { view: PlayerView }) {
    const card = view.peekCards?.[0];
    return (
        <div className="stack">
            {card && (
                <div className="peek-card">
                    <NavCard card={card} />
                </div>
            )}
            <div className="button-row">
                <button className="primary" onClick={() => act({ type: "telescopeDecision", discard: false })}>
                    放回牌堆顶
                </button>
                <button onClick={() => act({ type: "telescopeDecision", discard: true })}>弃入深海</button>
            </div>
        </div>
    );
}

function RitualGunsControls({ view, candidates }: { view: PlayerView; candidates: string[] }) {
    const [grants, setGrants] = useState<Record<string, number>>({});
    const total = Object.values(grants).reduce((sum, n) => sum + n, 0);
    const name = (id: string) => view.players.find((p) => p.id === id)?.nickname ?? id;
    const adjust = (id: string, delta: number) => setGrants((g) => ({ ...g, [id]: Math.max(0, Math.min(3, (g[id] ?? 0) + delta)) }));
    return (
        <div className="stack">
            <ul className="grant-list">
                {candidates.map((id) => (
                    <li key={id}>
                        <span className="grant-name">
                            {name(id)}
                            {id === view.viewerId && <small>你</small>}
                        </span>
                        <span className="grant-guns">
                            {Array.from({ length: grants[id] ?? 0 }, (_, i) => (
                                <img key={i} src={art.gun} alt="" />
                            ))}
                        </span>
                        <button type="button" className="quiet" disabled={!grants[id]} onClick={() => adjust(id, -1)} aria-label={`收回给 ${name(id)} 的一把枪`}>
                            −
                        </button>
                        <button type="button" className="quiet" disabled={total >= 3} onClick={() => adjust(id, 1)} aria-label={`给 ${name(id)} 一把枪`}>
                            +
                        </button>
                    </li>
                ))}
            </ul>
            <p className="muted">已分配 {total} / 3 把，可以分给自己。</p>
            <button
                className="primary"
                disabled={total !== 3}
                onClick={() =>
                    act({
                        type: "distributeCultGuns",
                        grants: candidates.filter((id) => grants[id]).map((id) => ({ playerId: id, guns: grants[id]! })),
                    })
                }
            >
                秘密分配
            </button>
        </div>
    );
}

function Victory({ view }: { view: PlayerView }) {
    const winner = view.winner;
    const mine = Boolean(winner) && view.me.faction === winner;
    return (
        <section className="action-dock victory" data-faction={winner}>
            <p className="eyebrow">THE VOYAGE IS OVER</p>
            {winner && <img className="victory-emblem" src={factionArt[winner]} alt="" />}
            <h2>{factionLabel(winner)}获胜</h2>
            <p className="dock-note">{mine ? "你的阵营赢下了这次航行。" : "航行结束，所有阵营现已揭晓。"}</p>
            <button className="primary" onClick={leaveGameRoom}>
                返回港口
            </button>
        </section>
    );
}

function Intel({ view }: { view: PlayerView }) {
    const { cabinSearchFaction, cultCabinReveal, peekCards } = view;
    const showPeek = Boolean(peekCards?.length) && view.privatePrompt?.action !== "telescope-decide";
    if (!cabinSearchFaction && !cultCabinReveal && !showPeek) return null;
    return (
        <div className="intel">
            <p className="eyebrow">本轮私密情报</p>
            {cabinSearchFaction && (
                <p>
                    搜查目标：<strong>{factionLabel(cabinSearchFaction)}</strong>
                </p>
            )}
            {cultCabinReveal && (
                <p>
                    船长 <strong>{factionLabel(cultCabinReveal.captain)}</strong> · 大副 <strong>{factionLabel(cultCabinReveal.firstMate)}</strong> · 领航员{" "}
                    <strong>{factionLabel(cultCabinReveal.navigator)}</strong>
                </p>
            )}
            {showPeek && (
                <div className="intel-cards">
                    {peekCards!.map((card) => (
                        <NavCard key={card.id} card={card} />
                    ))}
                </div>
            )}
        </div>
    );
}
