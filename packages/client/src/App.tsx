import { useMemo, useState } from "react";
import type { PlayerId, PlayerView } from "@feed/shared";
import { createGameRoom, joinGameRoom, sendAction } from "./connection";
import { HexMap } from "./HexMap";
import { useAppStore } from "./store";
import "./styles.css";

export function App() {
  const { view, error } = useAppStore();
  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Feed the Kraken</p>
        <h1>险恶疑航</h1>
        <p>5–6 人快速航行 / 7+ 人漫长航行（鞭笞、割舌、武装、补给线）。请配合外部语音。</p>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {view ? <RoomView view={view} /> : <Lobby />}
    </main>
  );
}

function Lobby() {
  const [nickname, setNickname] = useState("");
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false);
  const setError = useAppStore((state) => state.setError);

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await task();
    } catch (error) {
      setError(error instanceof Error ? error.message : "连接失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel lobby-grid">
      <div>
        <h2>创建房间</h2>
        <p>创建后把房间号发给朋友。首版默认使用外部语音。</p>
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="你的昵称" />
        <button disabled={busy} onClick={() => run(() => createGameRoom(nickname))}>创建房间</button>
      </div>
      <div>
        <h2>加入房间</h2>
        <p>输入房间号即可恢复本浏览器最近保存的身份；当前打开的多个标签页仍各自隔离。</p>
        <input value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="房间号" />
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="你的昵称" />
        <button disabled={busy || !roomId.trim()} onClick={() => run(() => joinGameRoom(roomId.trim(), nickname, "new-player"))}>
          作为新玩家加入
        </button>
        <button className="secondary-button" disabled={busy || !roomId.trim()} onClick={() => run(() => joinGameRoom(roomId.trim(), nickname, "reconnect"))}>
          恢复上次身份
        </button>
      </div>
    </section>
  );
}

function RoomView({ view }: { view: PlayerView }) {
  return (
    <section className="room-layout">
      <div className="panel table-panel">
        <div className="room-meta">
          <span>房间号：<strong>{view.roomId}</strong></span>
          <span>模式：<strong>{view.voyageMode === "long" ? "漫长航行" : "快速航行"}</strong></span>
          <span>阶段：<strong>{phaseLabel(view.phase)}</strong></span>
          <span>你是：<strong>{view.me.nickname}</strong></span>
          {view.voyageMode === "long" ? (
            <span>补给线：<strong>{view.supplyLineCrossed ? "已越过" : "未越过"}</strong></span>
          ) : null}
        </div>
        <HexMap x={view.ship.x} y={view.ship.y} voyageMode={view.voyageMode} />
        <PlayerRing view={view} />
      </div>
      <aside className="side-column">
        <SelfCard view={view} />
        <ActionPanel view={view} />
        <LogPanel view={view} />
      </aside>
    </section>
  );
}

function PlayerRing({ view }: { view: PlayerView }) {
  return (
    <div className="players">
      {view.players.map((player) => (
        <article key={player.id} className={player.id === view.viewerId ? "player-card current" : "player-card"}>
          <div className="player-name">{player.nickname}{player.dead ? "（出局）" : ""}</div>
          <div className="badges">
            {player.isHost ? <span>房主</span> : null}
            {player.isCaptain ? <span>船长</span> : null}
            {player.isFirstMate ? <span>大副</span> : null}
            {player.isNavigator ? <span>领航员</span> : null}
            {player.hasVoted ? <span>已握拳</span> : null}
            {player.offDuty ? <span>下班</span> : null}
            {player.muted ? <span>割舌</span> : null}
          </div>
          <div className="muted">
            {player.connected ? "在线" : "离线"} · 枪 {player.guns} · 简历 {player.resumeCount}
          </div>
          <div>阵营：{factionLabel(player.faction)}</div>
          {player.notFactions.length ? (
            <div className="muted">我不是：{player.notFactions.map(factionLabel).join("、")}</div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function SelfCard({ view }: { view: PlayerView }) {
  return (
    <div className="panel">
      <h2>你的秘密信息</h2>
      <p>阵营：<strong>{factionLabel(view.me.faction ?? "unknown")}</strong></p>
      <p>角色：<strong>{roleLabel(view.me.role)}</strong></p>
      <p>剩余枪数：<strong>{view.me.guns}</strong></p>
      {view.me.conversionImmune ? <p className="muted">你已被搜查/鞭笞，不可被皈依。</p> : null}
      {view.cabinSearchFaction ? <p>船舱搜查结果：目标是 <strong>{factionLabel(view.cabinSearchFaction)}</strong>（可撒谎）</p> : null}
      {view.cultCabinReveal ? (
        <p>
          邪教窥视：船长 {factionLabel(view.cultCabinReveal.captain)} /
          大副 {factionLabel(view.cultCabinReveal.firstMate)} /
          领航 {factionLabel(view.cultCabinReveal.navigator)}
        </p>
      ) : null}
      {view.peekCards?.length ? (
        <div>
          <p>私密窥视：</p>
          <ul>
            {view.peekCards.map((card) => (
              <li key={card.id}>{card.label} · {directionLabel(card.direction)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ActionPanel({ view }: { view: PlayerView }) {
  const [firstMateId, setFirstMateId] = useState("");
  const [navigatorId, setNavigatorId] = useState("");
  const [pickId, setPickId] = useState("");
  const [gunTarget, setGunTarget] = useState("");
  const prompt = view.privatePrompt;
  const nameById = useMemo(() => {
    const map = new Map<PlayerId, string>();
    for (const player of view.players) map.set(player.id, player.nickname);
    return map;
  }, [view.players]);

  if (view.phase === "ended") {
    return (
      <div className="panel">
        <h2>游戏结束</h2>
        <p>胜利阵营：{factionLabel(view.winner ?? "unknown")}</p>
      </div>
    );
  }

  const candidates = (prompt?.candidates ?? []).map((id) => ({
    id,
    nickname: nameById.get(id) ?? id.slice(0, 6),
  }));

  return (
    <div className="panel action-panel">
      <h2>{prompt?.title ?? "等待"}</h2>
      <p>{prompt?.description ?? "等待服务端推进阶段。"}</p>

      {prompt?.action === "start-game" ? (
        <button onClick={() => sendAction({ type: "startGame" })}>开始游戏</button>
      ) : null}

      {prompt?.action === "assign-officers" ? (
        <div className="stack">
          <select value={firstMateId} onChange={(event) => setFirstMateId(event.target.value)}>
            <option value="">选择大副</option>
            {selectableOfficers(view).map((player) => (
              <option key={player.id} value={player.id}>{player.nickname}</option>
            ))}
          </select>
          <select value={navigatorId} onChange={(event) => setNavigatorId(event.target.value)}>
            <option value="">选择领航员</option>
            {selectableOfficers(view).map((player) => (
              <option key={player.id} value={player.id}>{player.nickname}</option>
            ))}
          </select>
          <button
            disabled={!firstMateId || !navigatorId || firstMateId === navigatorId}
            onClick={() => sendAction({ type: "assignOfficers", firstMateId, navigatorId })}
          >
            确认任命
          </button>
        </div>
      ) : null}

      {prompt?.action === "mutiny" ? (
        <div className="button-row">
          {[0, 1, 2, 3].filter((guns) => guns <= view.me.guns).map((guns) => (
            <button key={guns} onClick={() => sendAction({ type: "commitMutiny", guns })}>
              亮出 {guns} 枪
            </button>
          ))}
        </div>
      ) : null}

      {prompt?.action === "mutiny-tiebreak" ? (
        <div className="stack">
          {candidates.map((player) => (
            <button key={player.id} onClick={() => sendAction({ type: "eliminateTieCandidate", playerId: player.id })}>
              剔除 {player.nickname}
            </button>
          ))}
        </div>
      ) : null}

      {prompt?.action === "keep-card" || prompt?.action === "navigate" ? (
        <div className="stack">
          <p className="muted">
            {prompt.action === "navigate" ? "选择要执行的一张：" : "选择要保留的一张（另一张弃入深海）："}
          </p>
          {view.hand?.map((card) => (
            <button key={card.id} onClick={() => sendAction({ type: "keepNavigationCard", cardId: card.id })}>
              {card.label} · {directionLabel(card.direction)} · {effectLabel(card.effect)}
            </button>
          ))}
          {prompt.action === "navigate" ? (
            <button className="secondary-button" onClick={() => sendAction({ type: "jumpShip" })}>
              跳船抗命
            </button>
          ) : null}
        </div>
      ) : null}

      {prompt?.action === "pick-player" || prompt?.action === "ritual-convert" ? (
        <div className="stack">
          <select value={pickId} onChange={(event) => setPickId(event.target.value)}>
            <option value="">选择玩家</option>
            {candidates.map((player) => (
              <option key={player.id} value={player.id}>{player.nickname}</option>
            ))}
          </select>
          <button
            disabled={!pickId}
            onClick={() => sendAction({ type: "pickPlayer", playerId: pickId })}
          >
            确认
          </button>
        </div>
      ) : null}

      {prompt?.action === "telescope-decide" ? (
        <div className="button-row">
          <button onClick={() => sendAction({ type: "telescopeDecision", discard: false })}>放回牌堆顶</button>
          <button onClick={() => sendAction({ type: "telescopeDecision", discard: true })}>弃入深海</button>
        </div>
      ) : null}

      {prompt?.action === "ritual-guns" ? (
        <div className="stack">
          <select value={gunTarget} onChange={(event) => setGunTarget(event.target.value)}>
            <option value="">选择独吞 3 枪的玩家</option>
            {candidates.map((player) => (
              <option key={player.id} value={player.id}>{player.nickname}</option>
            ))}
          </select>
          <button
            disabled={!gunTarget}
            onClick={() => sendAction({ type: "distributeCultGuns", grants: [{ playerId: gunTarget, guns: 3 }] })}
          >
            给一人 3 枪
          </button>
          <button
            disabled={candidates.length < 3}
            onClick={() =>
              sendAction({
                type: "distributeCultGuns",
                grants: candidates.slice(0, 3).map((player) => ({ playerId: player.id, guns: 1 })),
              })
            }
          >
            给前三人各 1 枪
          </button>
          <button
            onClick={() =>
              sendAction({
                type: "distributeCultGuns",
                grants: [{ playerId: view.viewerId, guns: 3 }],
              })
            }
          >
            全部给自己
          </button>
        </div>
      ) : null}

      {prompt?.action === "acknowledge" ? (
        <button onClick={() => sendAction({ type: "acknowledge" })}>确认完毕</button>
      ) : null}

      {view.lastRevealedCard ? (
        <p className="muted">
          上一张公开航行牌：{view.lastRevealedCard.label}（{directionLabel(view.lastRevealedCard.direction)} /{" "}
          {effectLabel(view.lastRevealedCard.effect)}）
        </p>
      ) : null}
      {view.lastCultRitual ? <p className="muted">最近邪教仪式：{view.lastCultRitual}</p> : null}
    </div>
  );
}

function LogPanel({ view }: { view: PlayerView }) {
  return (
    <div className="panel log-panel">
      <h2>公开事件</h2>
      <ol>
        {view.publicLog.filter((entry) => entry.message).map((entry) => (
          <li key={entry.seq}>{entry.message}</li>
        ))}
      </ol>
    </div>
  );
}

function selectableOfficers(view: PlayerView) {
  const base = view.players.filter((player) => player.id !== view.viewerId && !player.dead);
  const withoutOffDuty = base.filter((player) => !player.offDuty);
  return withoutOffDuty.length >= 2 ? withoutOffDuty : base;
}

function phaseLabel(phase: PlayerView["phase"]) {
  const labels: Record<PlayerView["phase"], string> = {
    lobby: "大厅",
    officers: "任命",
    mutiny: "叛变",
    mutiny_tiebreak: "叛变平手",
    captain_nav: "船长选牌",
    mate_nav: "大副选牌",
    navigator_nav: "领航抉择",
    map_cabin: "船舱搜查",
    map_feed: "喂食克拉肯",
    map_flog: "鞭笞",
    map_tongue: "割舌",
    effect_mermaid: "美人鱼",
    effect_telescope: "望远镜",
    effect_telescope_decide: "望远镜决定",
    ritual_pending: "邪教仪式",
    ritual_convert: "皈依",
    ritual_guns: "武器库",
    ritual_cabin: "邪教搜查",
    emergency_navigator: "紧急领航",
    ended: "结束",
  };
  return labels[phase];
}

function factionLabel(faction: string | undefined) {
  if (faction === "sailor") return "水手";
  if (faction === "pirate") return "海盗";
  if (faction === "cult") return "邪教";
  return "未知";
}

function roleLabel(role: string | undefined) {
  if (!role) return "未知";
  const labels: Record<string, string> = {
    sailor: "水手",
    pirate: "海盗",
    cult_leader: "邪教领袖",
    cultist: "邪教徒",
  };
  return labels[role] ?? role;
}

function directionLabel(direction: string) {
  if (direction === "east") return "向东（水手）";
  if (direction === "west") return "向西（海盗）";
  return "向北（克拉肯）";
}

function effectLabel(effect: string) {
  const labels: Record<string, string> = {
    drunk: "醉酒",
    disarm: "缴械",
    mermaid: "美人鱼",
    telescope: "望远镜",
    cult_uprising: "邪教起义",
    armed: "武装",
  };
  return labels[effect] ?? effect;
}
