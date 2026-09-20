import { useEffect, useState } from "react";
import type { PlayerView } from "@feed/shared";
import { joinGameRoom } from "../connection";
import { useAppStore } from "../store";
import { art, directionLabels, effectLabels, factionLabel, phaseLabels, roleLabel } from "../labels";
import { ActionPanel } from "../components/ActionPanel";
import { SeaChart } from "../components/SeaChart";

export function RoomView({ view }: { view: PlayerView }) {
  const connected = useAppStore((state) => state.connected);
  const [reconnecting, setReconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  async function reconnect() {
    setReconnecting(true);
    try { await joinGameRoom(view.roomId, view.me.nickname, "reconnect"); }
    catch (error) { useAppStore.getState().setError(error instanceof Error ? error.message : "恢复失败"); }
    finally { setReconnecting(false); }
  }
  async function copyRoom() {
    try { await navigator.clipboard.writeText(view.roomId); setCopied(true); }
    catch { useAppStore.getState().setError(`请手动复制房间号：${view.roomId}`); }
  }
  return (
    <div className="room-scene">
      <header className="room-heading">
        <div><p className="eyebrow">ROOM / <button className="room-code" onClick={() => void copyRoom()} aria-label={`复制房间号 ${view.roomId}`}>{view.roomId} {copied ? "✓" : "↗"}</button></p><h1>{phaseLabels[view.phase]}</h1></div>
        <div className="room-status"><span className={connected ? "connection live" : "connection"}>{connected ? "已连接" : "已断线"}</span><span>{view.players.length} 位船员 · {view.phase === "lobby" ? "等待出发" : `第 ${view.roundNo} 轮`}</span></div>
      </header>
      {!connected && <div className="reconnect-banner" role="status"><span>航线已中断，恢复连接后可继续操作。</span><button disabled={reconnecting} onClick={() => void reconnect()}>{reconnecting ? "正在恢复…" : "恢复连接"}</button></div>}
      <div className="room-layout">
        <div className="table-column">
          {view.phase === "lobby" ? <section className="waiting-harbor"><img src={art.warmHarbor} alt="船员在港口登上一艘帆船" /><div><p className="eyebrow">ALL ABOARD</p><h2>船已就位。<br />只等你的同伴。</h2><p>分享房间号，召集至少 5 位船员。</p></div></section> : <section className="chart-workspace">
            <div className="section-heading"><h2>{view.voyageMode === "long" ? "漫长航行" : "快速航行"}</h2><span>{view.voyageMode === "long" ? `补给线 · ${view.supplyLineCrossed ? "已越过" : "未越过"}` : "19 张航行牌"}</span></div>
            <SeaChart view={view} />
            {view.lastRevealedCard && <div className="last-card"><span className="eyebrow">最近航线</span><strong>{directionLabels[view.lastRevealedCard.direction]}</strong><span>{effectLabels[view.lastRevealedCard.effect]}</span></div>}
          </section>}
          <section className="crew-section"><div className="section-heading"><h2>船员名册</h2><span>{view.players.filter((p) => p.connected).length} 人在线</span></div><div className="crew-list">
            {view.players.map((player, index) => <article className={`crew-member ${player.id === view.viewerId ? "is-me" : ""} ${player.dead ? "is-dead" : ""}`} key={player.id}>
              <span className="seat-number">{String(index + 1).padStart(2, "0")}</span>
              <div className="crew-info"><strong>{player.nickname}{player.id === view.viewerId && <small>你</small>}</strong><div className="crew-badges">
                {player.isHost && <span>房主</span>}{player.isCaptain && <span>船长</span>}{player.isFirstMate && <span>大副</span>}{player.isNavigator && <span>领航员</span>}{player.hasVoted && <span>已握拳</span>}{player.offDuty && <span>下班</span>}{player.muted && <span>割舌</span>}{player.dead && <span>已离船</span>}{!player.connected && <span>离线</span>}
              </div>{player.notFactions.length > 0 && <small>不是{player.notFactions.map(factionLabel).join("、")}</small>}
              {view.phase === "ended" && <small>{factionLabel(player.faction)}</small>}</div>
              <div className="crew-counts"><strong>{player.guns}<small> 枪</small></strong><span>{player.resumeCount} 简历</span></div>
            </article>)}
          </div></section>
          <details className="ship-log" open><summary>航海日志 <span>公开事件</span></summary><ol>{view.publicLog.filter((entry) => entry.message).slice().reverse().map((entry) => <li key={entry.seq}><span>{String(entry.seq).padStart(3, "0")}</span>{entry.message}</li>)}</ol></details>
        </div>
        <aside className="action-column">
          <PrivateDossier key={`${view.roomId}:${view.viewerId}`} view={view} />
          <ActionPanel key={`${view.roundNo}:${view.phase}:${view.privatePrompt?.action}`} view={view} />
          <p className="table-reminder">谨慎信任你的同伴。<br />选牌时保持沉默，讨论时真假自辨。</p>
        </aside>
      </div>
    </div>
  );
}

function PrivateDossier({ view }: { view: PlayerView }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const conceal = () => { if (document.hidden) setOpen(false); };
    document.addEventListener("visibilitychange", conceal);
    return () => document.removeEventListener("visibilitychange", conceal);
  }, []);
  return <section className="private-dossier">
    <button className="dossier-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><img src={art.secret} alt="" /><span><span className="eyebrow">FOR YOUR EYES ONLY</span><strong>{open ? "收起秘密档案" : "查看秘密档案"}</strong></span><span aria-hidden="true">{open ? "−" : "+"}</span></button>
    {open && <div className="dossier-body"><h3>{roleLabel(view.me.role)}</h3><p>你的阵营：{factionLabel(view.me.faction)}</p>
      {view.me.conversionImmune && <p>你已被搜查或鞭笞，不可再被皈依。</p>}
      {view.players.filter((p) => p.id !== view.viewerId && p.faction !== "unknown").map((p) => <p key={p.id}>{p.nickname} · {factionLabel(p.faction)}<small>（已知身份，可能已变化）</small></p>)}
    </div>}
    {(view.cabinSearchFaction || view.cultCabinReveal || view.peekCards?.length) && <div className="private-result"><p className="eyebrow">本轮私密情报</p>
      {view.cabinSearchFaction && <p>搜查目标：<strong>{factionLabel(view.cabinSearchFaction)}</strong></p>}
      {view.cultCabinReveal && <p>船长：{factionLabel(view.cultCabinReveal.captain)}<br />大副：{factionLabel(view.cultCabinReveal.firstMate)}<br />领航员：{factionLabel(view.cultCabinReveal.navigator)}</p>}
      {view.peekCards?.map((card) => <p key={card.id}>{directionLabels[card.direction]} · {effectLabels[card.effect]}</p>)}
    </div>}
  </section>;
}
