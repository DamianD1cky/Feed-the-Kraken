import { useEffect, useRef, useState, type CSSProperties } from "react";
import { defaultVoyageMode, MIN_PLAYERS, mutinyThreshold, type PlayerView, type VoyageMode } from "@feed/shared";
import { ArrowRight, Minus, Plus } from "@phosphor-icons/react";
import { sendAction } from "../connection";
import { art, cardArt, directionLabels, effectLabels, factionLabel, identityArt } from "../labels";
import { useAppStore } from "../store";
import { CrewPicker, Segmented } from "./controls";

const CULT_GUNS = 3;

export function ActionPanel({ view }: { view: PlayerView }) {
    const [firstMateId, setFirstMateId] = useState("");
    const [navigatorId, setNavigatorId] = useState("");
    const [pickId, setPickId] = useState("");
    const [guns, setGuns] = useState(0);
    const [grants, setGrants] = useState<Record<string, number>>({});
    const [mode, setMode] = useState<VoyageMode>();
    const [jumpConfirm, setJumpConfirm] = useState(false);
    const connected = useAppStore((state) => state.connected);
    const prompt = view.privatePrompt;
    const candidates = (prompt?.candidates ?? []).map((id) => ({
        id,
        name: view.players.find((player) => player.id === id)?.nickname ?? id,
    }));
    const isCandidate = (id: string) => candidates.some((player) => player.id === id);
    const totalGrants = candidates.reduce((sum, player) => sum + (grants[player.id] ?? 0), 0);
    const playerCount = view.players.length;
    const voyageMode = playerCount === 7 ? (mode ?? defaultVoyageMode(7)) : defaultVoyageMode(playerCount);
    const waiting = !prompt || prompt.action === "wait";
    const panel = useRef<HTMLElement>(null);

    // The panel sits below the chart; bring it into view when a new decision is ours.
    useEffect(() => {
        if (waiting || view.phase === "lobby") return;
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        panel.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }, [waiting, view.phase]);

    if (view.phase === "ended")
        return (
            <section className="action-panel victory">
                {view.winner && <img className="victory-art" src={identityArt[view.winner]} alt="" />}
                <h2>{factionLabel(view.winner)}获胜</h2>
                <p className="action-description">航行结束，所有身份已在船员名册中揭晓。</p>
            </section>
        );

    return (
        <section ref={panel} className="action-panel" data-turn={!waiting || undefined}>
            <span className="turn-status">{waiting ? "等待中" : "轮到你了"}</span>
            <h2>{prompt?.title ?? "等待航行"}</h2>
            <p className="action-description">{prompt?.description ?? "等待下一轮指令。"}</p>
            <fieldset disabled={!connected}>
                {prompt?.action === "start-game" && (
                    <div className="stack">
                        {playerCount === 7 ?
                            <Segmented
                                label="航行模式"
                                value={voyageMode}
                                onChange={(value) => setMode(value)}
                                options={[
                                    { value: "quick", label: "快速 · 19 张" },
                                    { value: "long", label: "漫长 · 23 张" },
                                ]}
                            />
                        :   <p className="muted">
                                {voyageMode === "long" ? "漫长航行，23 张航行牌" : "快速航行，19 张航行牌"}
                            </p>
                        }
                        <button
                            className="primary"
                            disabled={playerCount < MIN_PLAYERS}
                            onClick={() => sendAction({ type: "startGame", voyageMode })}
                        >
                            {playerCount < MIN_PLAYERS ? `还差 ${MIN_PLAYERS - playerCount} 人` : "起航"}
                            <ArrowRight size={18} weight="bold" aria-hidden="true" />
                        </button>
                    </div>
                )}

                {prompt?.action === "assign-officers" && (
                    <div className="stack">
                        <CrewPicker
                            label="大副"
                            crew={candidates}
                            value={firstMateId}
                            onChange={setFirstMateId}
                            unavailable={navigatorId}
                        />
                        <CrewPicker
                            label="领航员"
                            crew={candidates}
                            value={navigatorId}
                            onChange={setNavigatorId}
                            unavailable={firstMateId}
                        />
                        <button
                            className="primary"
                            disabled={!isCandidate(firstMateId) || !isCandidate(navigatorId) || firstMateId === navigatorId}
                            onClick={() => sendAction({ type: "assignOfficers", firstMateId, navigatorId })}
                        >
                            确认任命
                        </button>
                    </div>
                )}

                {prompt?.action === "mutiny" && (
                    <div className="stack">
                        <div className="gun-vote">
                            <img src={art.gun} alt="" width={64} height={46} />
                            <strong key={guns}>{guns}</strong>
                            <span>/ {view.me.guns} 把</span>
                        </div>
                        <Segmented
                            label="投入枪数"
                            value={guns}
                            onChange={(value) => setGuns(value)}
                            options={Array.from({ length: view.me.guns + 1 }, (_, count) => ({
                                value: count,
                                label: count === 0 ? "信任" : `${count} 枪`,
                            }))}
                        />
                        <p className="muted">全船合计 {mutinyThreshold(playerCount)} 枪即发动叛变。</p>
                        <button className="primary" onClick={() => sendAction({ type: "commitMutiny", guns })}>
                            秘密握拳
                        </button>
                    </div>
                )}

                {prompt?.action === "mutiny-tiebreak" && (
                    <div className="stack">
                        {candidates.map((player) => (
                            <button
                                key={player.id}
                                onClick={() => sendAction({ type: "eliminateTieCandidate", playerId: player.id })}
                            >
                                剔除 {player.name}
                            </button>
                        ))}
                    </div>
                )}

                {(prompt?.action === "keep-card" || prompt?.action === "navigate") && (
                    <div className="stack">
                        <div className="navigation-hand">
                            {view.hand?.map((card, index) => (
                                <button
                                    className={`nav-card ${card.direction}`}
                                    key={card.id}
                                    style={{ "--i": index } as CSSProperties}
                                    onClick={() => sendAction({ type: "keepNavigationCard", cardId: card.id })}
                                >
                                    <span className="nav-card-inner" aria-hidden="true">
                                        <img className="nav-card-face is-back" src={art.cardBack} alt="" />
                                        <img className="nav-card-face is-front" src={cardArt[card.direction]} alt="" />
                                    </span>
                                    <span className="nav-card-caption">
                                        <strong>{effectLabels[card.effect]}</strong>
                                        <span>{directionLabels[card.direction]}</span>
                                    </span>
                                    <span className="sr-only">
                                        {prompt.action === "navigate" ? "执行这张牌" : "保留这张牌"}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <p className="muted">
                            {prompt.action === "navigate" ? "点选一张执行。" : "点选一张保留，另一张弃入深海。"}
                        </p>
                        {prompt.action === "navigate" &&
                            (jumpConfirm ?
                                <div className="confirm-box">
                                    <p>跳船后你将离船，无法继续操作，也不会触发领袖献祭胜利。</p>
                                    <div className="button-row">
                                        <button className="danger" onClick={() => sendAction({ type: "jumpShip" })}>
                                            确认跳船
                                        </button>
                                        <button className="quiet" onClick={() => setJumpConfirm(false)}>
                                            继续选牌
                                        </button>
                                    </div>
                                </div>
                            :   <button className="quiet" onClick={() => setJumpConfirm(true)}>
                                    跳船抗命
                                </button>)}
                    </div>
                )}

                {(prompt?.action === "pick-player" || prompt?.action === "ritual-convert") && (
                    <div className="stack">
                        <CrewPicker label="行动目标" crew={candidates} value={pickId} onChange={setPickId} />
                        <button
                            className="primary"
                            disabled={!isCandidate(pickId)}
                            onClick={() => sendAction({ type: "pickPlayer", playerId: pickId })}
                        >
                            确认目标
                        </button>
                    </div>
                )}

                {prompt?.action === "telescope-decide" && (
                    <div className="button-row is-split">
                        <button
                            className="primary"
                            onClick={() => sendAction({ type: "telescopeDecision", discard: false })}
                        >
                            放回牌堆顶
                        </button>
                        <button onClick={() => sendAction({ type: "telescopeDecision", discard: true })}>弃入深海</button>
                    </div>
                )}

                {prompt?.action === "ritual-guns" && (
                    <div className="stack">
                        <ul className="grant-list">
                            {candidates.map((player) => {
                                const value = grants[player.id] ?? 0;
                                const set = (next: number) => setGrants({ ...grants, [player.id]: next });
                                return (
                                    <li key={player.id}>
                                        <span>{player.name}</span>
                                        <span className="stepper">
                                            <button
                                                type="button"
                                                className="icon-button"
                                                aria-label={`减少给 ${player.name} 的枪`}
                                                disabled={value === 0}
                                                onClick={() => set(value - 1)}
                                            >
                                                <Minus size={14} weight="bold" />
                                            </button>
                                            <output aria-label={`给 ${player.name} 的枪数`}>{value}</output>
                                            <button
                                                type="button"
                                                className="icon-button"
                                                aria-label={`增加给 ${player.name} 的枪`}
                                                disabled={totalGrants >= CULT_GUNS}
                                                onClick={() => set(value + 1)}
                                            >
                                                <Plus size={14} weight="bold" />
                                            </button>
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="muted">
                            已分配 {totalGrants} / {CULT_GUNS} 枪，可以分给自己。
                        </p>
                        <button
                            className="primary"
                            disabled={totalGrants !== CULT_GUNS}
                            onClick={() =>
                                sendAction({
                                    type: "distributeCultGuns",
                                    grants: candidates
                                        .filter((player) => grants[player.id])
                                        .map((player) => ({ playerId: player.id, guns: grants[player.id]! })),
                                })
                            }
                        >
                            秘密分配
                        </button>
                    </div>
                )}

                {prompt?.action === "acknowledge" && (
                    <button className="primary" onClick={() => sendAction({ type: "acknowledge" })}>
                        已查看，继续
                    </button>
                )}
            </fieldset>
        </section>
    );
}
