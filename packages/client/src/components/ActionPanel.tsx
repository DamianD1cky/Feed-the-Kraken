import { useState } from "react";
import {
    defaultVoyageMode,
    mutinyThreshold,
    type PlayerView,
    type VoyageMode,
} from "@feed/shared";
import { sendAction } from "../connection";
import { art, directionLabels, effectLabels, factionLabel } from "../labels";
import { useAppStore } from "../store";

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
    const validPick = candidates.some((player) => player.id === pickId);
    const totalGrants = candidates.reduce(
        (sum, player) => sum + (grants[player.id] ?? 0),
        0,
    );
    const voyageMode =
        view.players.length === 7 ?
            (mode ?? defaultVoyageMode(7))
        :   defaultVoyageMode(view.players.length);
    const options = candidates.map((player) => (
        <option key={player.id} value={player.id}>
            {player.name}
        </option>
    ));
    if (view.phase === "ended")
        return (
            <section className="action-panel victory">
                <p className="eyebrow">THE VOYAGE IS OVER</p>
                <h2>{factionLabel(view.winner)}获胜</h2>
                <p>航行结束，所有阵营现已揭晓。</p>
            </section>
        );
    return (
        <section className="action-panel">
            <p className="eyebrow">
                {prompt?.action === "wait" ?
                    "STAND BY / 等待船员"
                :   "YOUR MOVE / 轮到你了"}
            </p>
            <h2>{prompt?.title ?? "等待航行"}</h2>
            <p className="action-description">
                {prompt?.description ?? "等待下一轮指令。"}
            </p>
            <fieldset disabled={!connected}>
                {prompt?.action === "start-game" && (
                    <div className="stack">
                        <label>
                            航行模式
                            <select
                                value={voyageMode}
                                onChange={(event) =>
                                    setMode(event.target.value as VoyageMode)
                                }
                            >
                                {view.players.length <= 7 && (
                                    <option value="quick">
                                        快速航行 · 19 张牌
                                    </option>
                                )}
                                {view.players.length >= 7 && (
                                    <option value="long">
                                        漫长航行 · 23 张牌
                                    </option>
                                )}
                            </select>
                        </label>
                        <p className="muted">
                            当前 {view.players.length} / 11 人
                            {view.players.length < 5 ?
                                `，还需 ${5 - view.players.length} 位船员。`
                            :   "，准备好语音即可出发。"}
                        </p>
                        <button
                            className="primary"
                            disabled={view.players.length < 5}
                            onClick={() =>
                                sendAction({ type: "startGame", voyageMode })
                            }
                        >
                            开始游戏 →
                        </button>
                    </div>
                )}
                {prompt?.action === "assign-officers" && (
                    <div className="stack">
                        <label>
                            大副
                            <select
                                value={firstMateId}
                                onChange={(event) =>
                                    setFirstMateId(event.target.value)
                                }
                            >
                                <option value="">选择大副</option>
                                {options}
                            </select>
                        </label>
                        <label>
                            领航员
                            <select
                                value={navigatorId}
                                onChange={(event) =>
                                    setNavigatorId(event.target.value)
                                }
                            >
                                <option value="">选择领航员</option>
                                {options}
                            </select>
                        </label>
                        <button
                            className="primary"
                            disabled={
                                !candidates.some((p) => p.id === firstMateId) ||
                                !candidates.some((p) => p.id === navigatorId) ||
                                firstMateId === navigatorId
                            }
                            onClick={() =>
                                sendAction({
                                    type: "assignOfficers",
                                    firstMateId,
                                    navigatorId,
                                })
                            }
                        >
                            确认任命
                        </button>
                    </div>
                )}
                {prompt?.action === "mutiny" && (
                    <div className="stack">
                        <div className="gun-vote">
                            <img src={art.gun} alt="" />
                            <strong>{guns}</strong>
                            <span>/ {view.me.guns} 把</span>
                        </div>
                        <label>
                            投入枪数
                            <select
                                value={guns}
                                onChange={(event) =>
                                    setGuns(Number(event.target.value))
                                }
                            >
                                {Array.from(
                                    { length: view.me.guns + 1 },
                                    (_, count) => (
                                        <option key={count} value={count}>
                                            {count === 0 ?
                                                "0 · 信任这次任命"
                                            :   `${count} 把枪`}
                                        </option>
                                    ),
                                )}
                            </select>
                        </label>
                        <p className="muted">
                            全船共需 {mutinyThreshold(view.players.length)}{" "}
                            枪发动叛变。
                        </p>
                        <button
                            className="primary"
                            onClick={() =>
                                sendAction({ type: "commitMutiny", guns })
                            }
                        >
                            秘密握拳 · 确认 {guns} 枪
                        </button>
                    </div>
                )}
                {prompt?.action === "mutiny-tiebreak" && (
                    <div className="stack">
                        {candidates.map((player) => (
                            <button
                                key={player.id}
                                onClick={() =>
                                    sendAction({
                                        type: "eliminateTieCandidate",
                                        playerId: player.id,
                                    })
                                }
                            >
                                剔除 {player.name}
                            </button>
                        ))}
                    </div>
                )}
                {(prompt?.action === "keep-card" ||
                    prompt?.action === "navigate") && (
                    <div className="stack">
                        <div className="navigation-hand">
                            {view.hand?.map((card) => (
                                <button
                                    className={`navigation-card ${card.direction}`}
                                    key={card.id}
                                    onClick={() =>
                                        sendAction({
                                            type: "keepNavigationCard",
                                            cardId: card.id,
                                        })
                                    }
                                >
                                    <span className="card-direction">
                                        {directionLabels[card.direction]}
                                    </span>
                                    <span
                                        className="card-compass"
                                        aria-hidden="true"
                                    >
                                        {card.direction === "east" ?
                                            "→"
                                        : card.direction === "west" ?
                                            "←"
                                        :   "↑"}
                                    </span>
                                    <strong>{effectLabels[card.effect]}</strong>
                                    <span>
                                        {prompt.action === "navigate" ?
                                            "执行这张牌"
                                        :   "保留这张牌"}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {prompt.action === "navigate" &&
                            (jumpConfirm ?
                                <div className="stack">
                                    <p>
                                        跳船后你将离船，无法继续操作，且不会触发领袖献祭胜利。
                                    </p>
                                    <button
                                        onClick={() =>
                                            sendAction({ type: "jumpShip" })
                                        }
                                    >
                                        确认跳船抗命
                                    </button>
                                    <button
                                        className="quiet"
                                        onClick={() => setJumpConfirm(false)}
                                    >
                                        继续选牌
                                    </button>
                                </div>
                            :   <button
                                    className="quiet"
                                    onClick={() => setJumpConfirm(true)}
                                >
                                    跳船抗命…
                                </button>)}
                    </div>
                )}
                {(prompt?.action === "pick-player" ||
                    prompt?.action === "ritual-convert") && (
                    <div className="stack">
                        <label>
                            行动目标
                            <select
                                value={pickId}
                                onChange={(event) =>
                                    setPickId(event.target.value)
                                }
                            >
                                <option value="">选择船员</option>
                                {options}
                            </select>
                        </label>
                        <button
                            className="primary"
                            disabled={!validPick}
                            onClick={() =>
                                sendAction({
                                    type: "pickPlayer",
                                    playerId: pickId,
                                })
                            }
                        >
                            确认目标
                        </button>
                    </div>
                )}
                {prompt?.action === "telescope-decide" && (
                    <div className="stack">
                        <button
                            className="primary"
                            onClick={() =>
                                sendAction({
                                    type: "telescopeDecision",
                                    discard: false,
                                })
                            }
                        >
                            放回牌堆顶
                        </button>
                        <button
                            onClick={() =>
                                sendAction({
                                    type: "telescopeDecision",
                                    discard: true,
                                })
                            }
                        >
                            弃入深海
                        </button>
                    </div>
                )}
                {prompt?.action === "ritual-guns" && (
                    <div className="stack">
                        {candidates.map((player) => (
                            <label className="grant-row" key={player.id}>
                                {player.name}
                                <select
                                    aria-label={`给 ${player.name} 的枪数`}
                                    value={grants[player.id] ?? 0}
                                    onChange={(event) =>
                                        setGrants({
                                            ...grants,
                                            [player.id]: Number(
                                                event.target.value,
                                            ),
                                        })
                                    }
                                >
                                    {[0, 1, 2, 3].map((count) => (
                                        <option key={count} value={count}>
                                            {count} 枪
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ))}
                        <p className="muted">
                            已分配 {totalGrants} / 3 枪，可以分给自己。
                        </p>
                        <button
                            className="primary"
                            disabled={totalGrants !== 3}
                            onClick={() =>
                                sendAction({
                                    type: "distributeCultGuns",
                                    grants: candidates
                                        .filter((p) => grants[p.id])
                                        .map((p) => ({
                                            playerId: p.id,
                                            guns: grants[p.id]!,
                                        })),
                                })
                            }
                        >
                            秘密分配
                        </button>
                    </div>
                )}
                {prompt?.action === "acknowledge" && (
                    <button
                        className="primary"
                        onClick={() => sendAction({ type: "acknowledge" })}
                    >
                        已查看私密信息 · 继续
                    </button>
                )}
            </fieldset>
        </section>
    );
}
