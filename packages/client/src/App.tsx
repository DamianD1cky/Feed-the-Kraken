import { useState } from "react";
import type { PlayerId, PlayerView } from "@feed/shared";
import { createGameRoom, joinGameRoom, sendAction } from "./connection";
import { useAppStore } from "./store";
import "./styles.css";

export function App() {
  const { view, error } = useAppStore();
  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Feed the Kraken · MVP</p>
        <h1>险恶疑航</h1>
        <p>最小可玩版本：外部语音、服务端权威、按玩家视图下发。</p>
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
        <p>本地多人测试时，默认作为新玩家加入；只有断线后才使用“恢复上次身份”。</p>
        <input value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="房间号" />
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="你的昵称" />
        <button disabled={busy || !roomId.trim()} onClick={() => run(() => joinGameRoom(roomId.trim(), nickname, "new-player"))}>作为新玩家加入</button>
        <button className="secondary-button" disabled={busy || !roomId.trim()} onClick={() => run(() => joinGameRoom(roomId.trim(), nickname, "reconnect"))}>恢复上次身份</button>
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
          <span>阶段：<strong>{phaseLabel(view.phase)}</strong></span>
          <span>你是：<strong>{view.me.nickname}</strong></span>
        </div>
        <div className="map">
          <div className="ship" style={{ transform: `translate(${view.ship.x * 52}px, ${-view.ship.y * 52}px)` }}>⛵</div>
          <span className="goal north">克拉肯</span>
          <span className="goal east">水手</span>
          <span className="goal west">海盗</span>
          <span className="goal south">起点</span>
        </div>
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
          <div className="player-name">{player.nickname}</div>
          <div className="badges">
            {player.isHost ? <span>房主</span> : null}
            {player.isCaptain ? <span>船长</span> : null}
            {player.isFirstMate ? <span>大副</span> : null}
            {player.isNavigator ? <span>领航员</span> : null}
            {player.hasVoted ? <span>已握拳</span> : null}
          </div>
          <div className="muted">{player.connected ? "在线" : "离线"} · 枪 {player.guns}</div>
          <div>阵营：{factionLabel(player.faction)}</div>
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
      <p className="muted">隐藏信息只在这个私密区域出现，不会给其他玩家。</p>
    </div>
  );
}

function ActionPanel({ view }: { view: PlayerView }) {
  const [firstMateId, setFirstMateId] = useState("");
  const [navigatorId, setNavigatorId] = useState("");
  const prompt = view.privatePrompt;

  if (view.phase === "ended") {
    return <div className="panel"><h2>游戏结束</h2><p>胜利阵营：{factionLabel(view.winner ?? "unknown")}</p></div>;
  }

  return (
    <div className="panel action-panel">
      <h2>{prompt?.title ?? "等待"}</h2>
      <p>{prompt?.description ?? "等待服务端推进阶段。"}</p>
      {prompt?.action === "start-game" ? <button onClick={() => sendAction({ type: "startGame" })}>开始游戏</button> : null}
      {prompt?.action === "assign-officers" ? (
        <div className="stack">
          <select value={firstMateId} onChange={(event) => setFirstMateId(event.target.value)}>
            <option value="">选择大副</option>
            {selectablePlayers(view).map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
          </select>
          <select value={navigatorId} onChange={(event) => setNavigatorId(event.target.value)}>
            <option value="">选择领航员</option>
            {selectablePlayers(view).map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
          </select>
          <button disabled={!firstMateId || !navigatorId || firstMateId === navigatorId} onClick={() => sendAction({ type: "assignOfficers", firstMateId, navigatorId })}>确认任命</button>
        </div>
      ) : null}
      {prompt?.action === "vote" ? (
        <div className="button-row">
          {[0, 1, 2].filter((guns) => guns <= view.me.guns).map((guns) => (
            <button key={guns} onClick={() => sendAction({ type: "commitVote", guns })}>投入 {guns} 枪</button>
          ))}
        </div>
      ) : null}
      {prompt?.action === "navigate" ? (
        <div className="stack">
          {view.hand?.map((card) => (
            <button key={card.id} onClick={() => sendAction({ type: "chooseDestination", cardId: card.id })}>{card.label} · {directionLabel(card.direction)}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LogPanel({ view }: { view: PlayerView }) {
  return (
    <div className="panel log-panel">
      <h2>公开事件</h2>
      <ol>
        {view.publicLog.map((entry) => <li key={entry.seq}>{entry.message}</li>)}
      </ol>
    </div>
  );
}

function selectablePlayers(view: PlayerView) {
  return view.players.filter((player) => player.id !== view.viewerId && !player.dead);
}

function phaseLabel(phase: PlayerView["phase"]) {
  const labels = { lobby: "大厅", officers: "任命", vote: "投票", navigation: "航行", ended: "结束" };
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
  const labels: Record<string, string> = { captain: "船长", "first-mate": "大副", navigator: "领航员", sailor: "水手", pirate: "海盗", cultist: "邪教徒" };
  return labels[role] ?? role;
}

function directionLabel(direction: string) {
  if (direction === "east") return "向东（水手）";
  if (direction === "west") return "向西（海盗）";
  return "向北（克拉肯）";
}
