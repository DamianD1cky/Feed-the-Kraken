import { useEffect, useState, type CSSProperties } from "react";
import { MAX_PLAYERS, MIN_PLAYERS, type Faction, type PlayerView, type VisiblePlayer } from "@feed/shared";
import { Compass, Eye, EyeSlash, MagnifyingGlass } from "@phosphor-icons/react";
import { art, cardArt, effectLabels, factionLabel, identityArt, roleLabel } from "../labels";

const seatNumber = (index: number) => String(index + 1).padStart(2, "0");
const FACTIONS: Faction[] = ["sailor", "pirate", "cult"];

type Suspicions = Record<string, Faction>;

/** 怀疑标记只是个人笔记：保存在本机，不发送给服务端。 */
function useSuspicions(roomId: string, viewerId: string) {
    const key = `feed-the-kraken-suspicion:${roomId}:${viewerId}`;
    const [suspicions, setSuspicions] = useState<Suspicions>(() => {
        try {
            return JSON.parse(localStorage.getItem(key) ?? "{}") as Suspicions;
        } catch {
            return {};
        }
    });
    function mark(playerId: string, faction?: Faction) {
        setSuspicions((previous) => {
            const next = { ...previous };
            if (faction) next[playerId] = faction;
            else delete next[playerId];
            try {
                localStorage.setItem(key, JSON.stringify(next));
            } catch {
                // 隐私模式下只在本次页面内保留。
            }
            return next;
        });
    }
    return [suspicions, mark] as const;
}

export function CrewRail({ view }: { view: PlayerView }) {
    const waiting = view.phase === "lobby";
    const count = view.players.length;
    const missing = waiting ? Math.max(0, MIN_PLAYERS - count) : 0;
    const openSeats = MAX_PLAYERS - Math.max(count, MIN_PLAYERS);
    const online = view.players.filter((player) => player.connected).length;
    const [revealed, setRevealed] = useState(false);
    const [suspecting, setSuspecting] = useState<string>();
    const [suspicions, mark] = useSuspicions(view.roomId, view.viewerId);

    useEffect(() => {
        const conceal = () => {
            if (document.hidden) setRevealed(false);
        };
        document.addEventListener("visibilitychange", conceal);
        return () => document.removeEventListener("visibilitychange", conceal);
    }, []);

    return (
        <aside className="side-rail crew-rail" aria-labelledby="crew-title">
            <div className="rail-heading">
                <h2 id="crew-title">船员名册</h2>
                <span>{waiting ? `${count} / ${MAX_PLAYERS}` : `${online} 人在线`}</span>
            </div>
            <ol className="rail-list">
                {view.players.map((player, index) => (
                    <CrewRow
                        key={player.id}
                        view={view}
                        player={player}
                        index={index}
                        revealed={revealed}
                        onToggleReveal={() => setRevealed(!revealed)}
                        suspicion={suspicions[player.id]}
                        suspecting={suspecting === player.id}
                        onToggleSuspect={() => setSuspecting(suspecting === player.id ? undefined : player.id)}
                        onSuspect={(faction) => {
                            mark(player.id, faction);
                            setSuspecting(undefined);
                        }}
                    />
                ))}
                {Array.from({ length: missing }, (_, offset) => (
                    <li key={`empty-${offset}`} className="rail-seat is-empty">
                        <span className="seat-no">{seatNumber(count + offset)}</span>
                        <span className="rail-name">等待登船</span>
                    </li>
                ))}
            </ol>
            {waiting && openSeats > 0 && <p className="rail-note">还可再加入 {openSeats} 人</p>}
            {!waiting && <PrivateIntel view={view} />}
        </aside>
    );
}

function CrewRow({
    view,
    player,
    index,
    revealed,
    onToggleReveal,
    suspicion,
    suspecting,
    onToggleSuspect,
    onSuspect,
}: {
    view: PlayerView;
    player: VisiblePlayer;
    index: number;
    revealed: boolean;
    onToggleReveal(): void;
    suspicion?: Faction;
    suspecting: boolean;
    onToggleSuspect(): void;
    onSuspect(faction?: Faction): void;
}) {
    const waiting = view.phase === "lobby";
    const ended = view.phase === "ended";
    const isMe = player.id === view.viewerId;
    const knownFaction = !isMe && player.faction !== "unknown" ? player.faction : undefined;
    const myFaction = view.me.faction;

    return (
        <li
            className={`rail-seat${isMe ? " is-me" : ""}${player.connected ? "" : " is-offline"}${player.dead ? " is-dead" : ""}`}
        >
            <span className="seat-no">{seatNumber(index)}</span>
            <div className="rail-body">
                <span className="rail-name">
                    {player.nickname}
                    {isMe && <small>你</small>}
                </span>
                {!waiting && (
                    <span className="rail-offices">
                        {player.isCaptain && (
                            <span>
                                <img src={art.captain} alt="" width={16} height={16} />
                                船长
                            </span>
                        )}
                        {player.isFirstMate && (
                            <span>
                                <img src={art.mate} alt="" width={16} height={16} />
                                大副
                            </span>
                        )}
                        {player.isNavigator && (
                            <span>
                                <Compass size={14} aria-hidden="true" />
                                领航员
                            </span>
                        )}
                    </span>
                )}
                <span className="seat-tags">
                    {player.isHost && <span>房主</span>}
                    {player.hasVoted && <span>已握拳</span>}
                    {player.offDuty && <span>下班</span>}
                    {player.muted && <span>割舌</span>}
                    {player.dead && <span>已离船</span>}
                    {!player.connected && <span>离线</span>}
                </span>
                {player.notFactions.length > 0 && (
                    <small className="rail-hint">不是{player.notFactions.map(factionLabel).join("、")}</small>
                )}

                {knownFaction && revealed && !ended && (
                    <small className={`faction-tag is-${knownFaction}`}>已知：{factionLabel(knownFaction)}</small>
                )}
                {ended && <small className={`faction-tag is-${player.faction}`}>{factionLabel(player.faction)}</small>}
            </div>
            {!waiting && (
                <span className="rail-counts" aria-label={`${player.guns} 把枪，${player.resumeCount} 份简历`}>
                    <strong>
                        <img src={art.gun} alt="" width={18} height={13} />
                        {player.guns}
                    </strong>
                    <small>{player.resumeCount} 简历</small>
                </span>
            )}

            {isMe && !waiting && !ended && (
                <div className="rail-extra">
                    <button className="identity-toggle" data-open={revealed} aria-expanded={revealed} onClick={onToggleReveal}>
                        <span className="identity-card" aria-hidden="true">
                            <span className="identity-card-inner">
                                <img className="identity-face is-back" src={art.secret} alt="" />
                                <span className="identity-face is-front">
                                    {myFaction && <img src={identityArt[myFaction]} alt="" />}
                                </span>
                            </span>
                        </span>
                        <span className="identity-copy">
                            <strong>{revealed ? roleLabel(view.me.role) : "秘密身份"}</strong>
                            <small>{revealed ? `阵营：${factionLabel(myFaction)}` : "点击翻开"}</small>
                        </span>
                        {revealed ? <EyeSlash size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                    {revealed && view.me.conversionImmune && <small className="rail-hint">已被搜查或鞭笞，不可再被皈依</small>}
                </div>
            )}

            {!isMe && !waiting && (
                <div className="rail-extra">
                    <div className="suspect">
                        <button
                            className={`suspect-toggle${suspicion ? ` is-${suspicion}` : ""}`}
                            aria-expanded={suspecting}
                            onClick={onToggleSuspect}
                        >
                            <MagnifyingGlass size={12} aria-hidden="true" />
                            {suspicion ? `怀疑：${factionLabel(suspicion)}` : "怀疑"}
                        </button>
                        <div className="reveal" data-open={suspecting} inert={!suspecting}>
                            <div>
                                <div className="suspect-options" role="radiogroup" aria-label={`怀疑 ${player.nickname} 的阵营`}>
                                    {FACTIONS.map((faction) => (
                                        <button
                                            key={faction}
                                            role="radio"
                                            aria-checked={suspicion === faction}
                                            className={`is-${faction}`}
                                            onClick={() => onSuspect(faction)}
                                        >
                                            {factionLabel(faction)}
                                        </button>
                                    ))}
                                    <button disabled={!suspicion} onClick={() => onSuspect(undefined)}>
                                        清除
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </li>
    );
}

function PrivateIntel({ view }: { view: PlayerView }) {
    if (!view.cabinSearchFaction && !view.cultCabinReveal && !view.peekCards?.length) return null;
    return (
        <div className="private-intel">
            <h3>本轮私密情报</h3>
            {view.cabinSearchFaction && (
                <p>
                    搜查目标是<strong>{factionLabel(view.cabinSearchFaction)}</strong>
                </p>
            )}
            {view.cultCabinReveal && (
                <p>
                    船长 {factionLabel(view.cultCabinReveal.captain)}，大副 {factionLabel(view.cultCabinReveal.firstMate)}，领航员{" "}
                    {factionLabel(view.cultCabinReveal.navigator)}
                </p>
            )}
            {view.peekCards && view.peekCards.length > 0 && (
                <div className="peek-cards">
                    {view.peekCards.map((card, index) => (
                        <figure key={card.id} style={{ "--i": index } as CSSProperties}>
                            <img src={cardArt[card.direction]} alt="" width={56} height={56} />
                            <figcaption>{effectLabels[card.effect]}</figcaption>
                        </figure>
                    ))}
                </div>
            )}
        </div>
    );
}
