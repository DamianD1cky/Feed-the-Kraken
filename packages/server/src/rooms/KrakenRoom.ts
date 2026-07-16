import { randomUUID } from "node:crypto";
import { Client, Room } from "colyseus";
import { Schema } from "@colyseus/schema";
import {
  cellKey,
  clientActionEnvelopeSchema,
  crossedSupplyLine,
  mapActionPhase,
  MAX_PLAYERS,
  MIN_PLAYERS,
  mutinyThreshold,
  pickFloggingReveal,
  PROTOCOL_VERSION,
  type ClientActionEnvelope,
  type CultRitualKind,
  type GameEvent,
  type GameState,
  type PlayerId,
} from "@feed/shared";
import { createEventStore, type EventStore } from "../db/eventStore.js";
import { mapActionAt, nextDrunkCaptainId, reduceGameEvent, resolveOffDutyPlayerIds } from "../engine/reducer.js";
import {
  alivePlayerIds,
  appointablePlayerIds,
  convertiblePlayerIds,
  createLobbyState,
  cultLeaderId,
  peekDeckCardIds,
} from "../engine/setup.js";
import { createToken, hashToken, verifyToken, type SessionRecord } from "../session/tokens.js";
import { projectView } from "../visibility/projectView.js";

type JoinOptions = {
  nickname?: string;
  playerId?: string;
  sessionToken?: string;
  reconnectToken?: string;
};

type ProcessedAction = {
  actionId: string;
  result: "accepted" | "rejected";
  code?: string;
  reason?: string;
};

class EmptyRoomState extends Schema {}
type PendingGameEvent = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, "seq" | "at"> : never) : never;

export class KrakenRoom extends Room {
  private game: GameState = createLobbyState("pending");
  private events: GameEvent[] = [];
  private nextSeq = 1;
  private readonly sessions = new Map<PlayerId, SessionRecord>();
  private readonly clientToPlayer = new Map<string, PlayerId>();
  private readonly processedActions = new Map<string, ProcessedAction>();
  private eventStore: EventStore = createEventStore();

  onCreate() {
    this.maxClients = MAX_PLAYERS;
    this.game = createLobbyState(this.roomId);
    this.setState(new EmptyRoomState());
    this.onMessage("action", (client, payload) => this.handleAction(client, payload));
  }

  onJoin(client: Client, options: JoinOptions) {
    const reconnectPlayerId = this.resolveReconnect(options);
    if (reconnectPlayerId) {
      this.clientToPlayer.set(client.sessionId, reconnectPlayerId);
      this.appendAndApply({ type: "session.reconnected", playerId: reconnectPlayerId });
      this.issueSession(client, reconnectPlayerId);
      this.broadcastViews();
      return;
    }
    if (this.game.phase !== "lobby") {
      client.send("action.rejected", {
        type: "action.rejected",
        protocolVersion: PROTOCOL_VERSION,
        code: "room_already_started",
        reason: "游戏已经开始，只允许已有玩家重连。",
      });
      client.leave();
      return;
    }
    const nickname = normalizeNickname(options.nickname);
    const playerId = randomUUID();
    this.clientToPlayer.set(client.sessionId, playerId);
    this.appendAndApply({ type: "player.joined", playerId, nickname });
    this.issueSession(client, playerId);
    this.broadcastViews();
  }

  onLeave(client: Client) {
    const playerId = this.clientToPlayer.get(client.sessionId);
    if (!playerId) return;
    this.clientToPlayer.delete(client.sessionId);
    this.appendAndApply({ type: "session.disconnected", playerId });
    if (this.game.phase === "mutiny" && this.game.votes[playerId] === undefined) {
      const captainId = this.game.offices.captainId;
      if (playerId !== captainId && !this.game.players[playerId]?.dead) {
        this.appendAndApply({ type: "mutiny.committed", playerId, guns: 0 });
        this.maybeResolveMutiny();
      }
    }
    this.broadcastViews();
  }

  private resolveReconnect(options: JoinOptions) {
    if (!options.playerId || !options.sessionToken || !options.reconnectToken) return undefined;
    const session = this.sessions.get(options.playerId);
    if (!session) return undefined;
    if (!verifyToken(options.sessionToken, session.sessionTokenHash)) return undefined;
    if (!verifyToken(options.reconnectToken, session.reconnectTokenHash)) return undefined;
    if (!this.game.players[options.playerId]) return undefined;
    return options.playerId;
  }

  private issueSession(client: Client, playerId: PlayerId) {
    const sessionToken = createToken();
    const reconnectToken = createToken();
    this.sessions.set(playerId, {
      playerId,
      sessionTokenHash: hashToken(sessionToken),
      reconnectTokenHash: hashToken(reconnectToken),
    });
    client.send("session.established", {
      type: "session.established",
      protocolVersion: PROTOCOL_VERSION,
      roomId: this.roomId,
      playerId,
      sessionToken,
      reconnectToken,
    });
  }

  private handleAction(client: Client, payload: unknown) {
    const parsed = clientActionEnvelopeSchema.safeParse(payload);
    if (!parsed.success) {
      this.reject(client, undefined, "invalid_payload", "动作格式或协议版本不合法。");
      return;
    }
    const envelope = parsed.data as ClientActionEnvelope;
    const actorId = this.clientToPlayer.get(client.sessionId);
    if (!actorId || actorId !== envelope.playerId) {
      this.reject(client, envelope.actionId, "invalid_session", "连接身份与动作玩家不匹配。");
      return;
    }
    if (envelope.roomId !== this.roomId) {
      this.reject(client, envelope.actionId, "wrong_room", "动作房间与当前房间不匹配。");
      return;
    }
    const actionKey = `${envelope.playerId}:${envelope.actionId}`;
    const previous = this.processedActions.get(actionKey);
    if (previous) {
      if (previous.result === "rejected") {
        this.reject(client, previous.actionId, previous.code ?? "action_rejected", previous.reason ?? "动作被拒绝。");
        return;
      }
      this.sendView(client);
      return;
    }
    try {
      this.applyAction(envelope);
      this.processedActions.set(actionKey, { actionId: envelope.actionId, result: "accepted" });
      this.broadcastViews();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "动作被拒绝。";
      this.processedActions.set(actionKey, {
        actionId: envelope.actionId,
        result: "rejected",
        code: "action_rejected",
        reason,
      });
      this.reject(client, envelope.actionId, "action_rejected", reason);
    }
  }

  private applyAction(envelope: ClientActionEnvelope) {
    const actorId = envelope.playerId;
    const action = envelope.action;
    switch (action.type) {
      case "startGame": {
        this.requirePhase("lobby");
        this.requireHost(actorId);
        if (this.game.seats.length < MIN_PLAYERS) throw new Error(`至少需要 ${MIN_PLAYERS} 名玩家才能开始。`);
        this.appendAndApply({ type: "game.started", seed: randomUUID() }, envelope);
        return;
      }
      case "assignOfficers": {
        this.requirePhase("officers");
        if (this.game.offices.captainId !== actorId) throw new Error("只有船长可以任命职务。");
        const { firstMateId, navigatorId } = action;
        if (firstMateId === navigatorId) throw new Error("大副和领航员必须是不同玩家。");
        const appointable = new Set(appointablePlayerIds(this.game, actorId));
        if (!appointable.has(firstMateId) || !appointable.has(navigatorId)) {
          throw new Error("被任命玩家不可用（可能处于下班或已出局）。");
        }
        this.appendAndApply({ type: "officers.assigned", firstMateId, navigatorId }, envelope);
        if (this.game.emergencyVoyage) {
          // should not happen; emergency skips mutiny
        }
        return;
      }
      case "commitMutiny": {
        this.requirePhase("mutiny");
        if (actorId === this.game.offices.captainId) throw new Error("船长不参与叛变亮枪。");
        if (this.game.players[actorId]?.dead) throw new Error("出局玩家不能叛变。");
        if (this.game.votes[actorId] !== undefined) throw new Error("你已经亮过枪了。");
        if (action.guns > (this.game.players[actorId]?.guns ?? 0)) throw new Error("投入枪数超过剩余枪数。");
        this.appendAndApply({ type: "mutiny.committed", playerId: actorId, guns: action.guns }, envelope);
        this.maybeResolveMutiny(envelope);
        return;
      }
      case "eliminateTieCandidate": {
        this.requirePhase("mutiny_tiebreak");
        if (actorId !== this.game.offices.captainId) throw new Error("只有现任船长可以剔除平手者。");
        if (!this.game.mutinyTieCandidates.includes(action.playerId)) throw new Error("该玩家不在平手名单中。");
        this.appendAndApply({ type: "mutiny.tie_eliminated", playerId: action.playerId }, envelope);
        if (this.game.mutinyTieCandidates.length === 1) {
          this.appendAndApply({ type: "mutiny.captain_changed", captainId: this.game.mutinyTieCandidates[0]! }, envelope);
        }
        return;
      }
      case "keepNavigationCard": {
        this.handleKeepNavigationCard(actorId, action.cardId, envelope);
        return;
      }
      case "jumpShip": {
        this.requirePhase("navigator_nav");
        if (actorId !== this.game.offices.navigatorId) throw new Error("只有领航员可以跳船。");
        this.appendAndApply({ type: "navigation.jumped", playerId: actorId }, envelope);
        return;
      }
      case "pickPlayer": {
        this.handlePickPlayer(actorId, action.playerId, envelope);
        return;
      }
      case "telescopeDecision": {
        this.requirePhase("effect_telescope_decide");
        if (actorId !== this.game.telescopeViewerId) throw new Error("只有被指定的玩家可以决定望远镜。");
        const cardId = this.game.telescopeCard?.id;
        if (!cardId) throw new Error("没有望远镜目标牌。");
        this.appendAndApply(
          { type: "effect.telescope_resolved", cardId, discarded: action.discard },
          envelope,
        );
        this.continueAfterCardEffects(envelope);
        return;
      }
      case "distributeCultGuns": {
        this.requirePhase("ritual_guns");
        if (actorId !== cultLeaderId(this.game)) throw new Error("只有邪教领袖可以分发武器库手枪。");
        const total = action.grants.reduce((sum, g) => sum + g.guns, 0);
        if (total !== 3) throw new Error("必须正好分发 3 把手枪。");
        for (const grant of action.grants) {
          if (!this.game.players[grant.playerId] || this.game.players[grant.playerId]?.dead) {
            throw new Error("分发目标无效。");
          }
        }
        this.appendAndApply({ type: "ritual.guns", grants: action.grants }, envelope);
        this.finishSuccessfulVoyage(envelope);
        return;
      }
      case "acknowledge": {
        this.handleAcknowledge(actorId, envelope);
        return;
      }
    }
  }

  private handleKeepNavigationCard(actorId: PlayerId, cardId: string, envelope: ClientActionEnvelope) {
    if (this.game.phase === "captain_nav") {
      if (this.game.offices.captainId !== actorId) throw new Error("只有船长可以在此阶段选牌。");
      const discarded = this.game.hands.captainHand.find((card) => card.id !== cardId);
      if (!discarded || !this.game.hands.captainHand.some((card) => card.id === cardId)) {
        throw new Error("只能从你抽到的两张牌中保留一张。");
      }
      this.appendAndApply(
        { type: "navigation.kept", playerId: actorId, keptCardId: cardId, discardedCardId: discarded.id, role: "captain" },
        envelope,
      );
      this.dealToMate(envelope);
      return;
    }
    if (this.game.phase === "mate_nav") {
      if (this.game.offices.firstMateId !== actorId) throw new Error("只有大副可以在此阶段选牌。");
      const discarded = this.game.hands.mateHand.find((card) => card.id !== cardId);
      if (!discarded || !this.game.hands.mateHand.some((card) => card.id === cardId)) {
        throw new Error("只能从你抽到的两张牌中保留一张。");
      }
      this.appendAndApply(
        { type: "navigation.kept", playerId: actorId, keptCardId: cardId, discardedCardId: discarded.id, role: "mate" },
        envelope,
      );
      this.appendAndApply(
        { type: "navigation.journal_ready", cardIds: this.game.hands.journal.map((card) => card.id) },
        envelope,
      );
      return;
    }
    if (this.game.phase === "navigator_nav") {
      if (this.game.offices.navigatorId !== actorId) throw new Error("只有领航员可以在此阶段选牌。");
      const discarded = this.game.hands.journal.find((card) => card.id !== cardId);
      const kept = this.game.hands.journal.find((card) => card.id === cardId);
      if (!discarded || !kept) throw new Error("只能从航海日志的两张牌中选择一张执行。");
      this.appendAndApply(
        { type: "navigation.chosen", cardId: kept.id, discardedCardId: discarded.id, by: actorId },
        envelope,
      );
      this.resolveChosenCard(kept.id, kept.dx, kept.dy, envelope);
      return;
    }
    throw new Error("当前阶段不能选牌。");
  }

  private resolveChosenCard(cardId: string, dx: number, dy: number, envelope: ClientActionEnvelope) {
    this.appendAndApply({ type: "navigation.revealed", cardId }, envelope);
    const to = { x: this.game.ship.x + dx, y: this.game.ship.y + dy };
    this.appendAndApply({ type: "ship.moved", cardId, to }, envelope);
    if (this.game.phase === "ended") {
      if (this.game.winner) {
        this.appendAndApply({ type: "game.ended", winner: this.game.winner, reason: "ship_reached_goal" }, envelope);
      }
      return;
    }
    this.maybeCrossSupplyLine(to.x, to.y, envelope);
    const action = mapActionAt(this.game, to.x, to.y);
    if (action) {
      this.appendAndApply({ type: "map.triggered", action, cell: cellKey(to.x, to.y) }, envelope);
      this.appendAndApply({ type: "phase.set", phase: mapActionPhase(action) }, envelope);
      return;
    }
    this.beginCardEffects(envelope);
  }

  private maybeCrossSupplyLine(x: number, y: number, envelope?: ClientActionEnvelope) {
    if (this.game.voyageMode !== "long" || this.game.supplyLineCrossed) return;
    if (!crossedSupplyLine(x, y)) return;
    this.appendAndApply({ type: "supply.crossed" }, envelope);
  }

  private handlePickPlayer(actorId: PlayerId, targetId: PlayerId, envelope: ClientActionEnvelope) {
    const target = this.game.players[targetId];
    if (!target || target.dead) throw new Error("目标玩家无效。");

    if (this.game.phase === "map_cabin") {
      if (actorId !== this.game.offices.captainId) throw new Error("只有船长可以发动船舱搜查。");
      if (targetId === actorId) throw new Error("不能搜查自己。");
      this.appendAndApply({ type: "map.cabin_search", captainId: actorId, targetId }, envelope);
      this.appendAndApply({ type: "phase.set", phase: "map_cabin" }, envelope); // keep until ack
      // auto-continue after search recorded; captain sees faction in view
      this.beginCardEffects(envelope);
      return;
    }
    if (this.game.phase === "map_feed") {
      if (actorId !== this.game.offices.captainId) throw new Error("只有船长可以喂食克拉肯。");
      if (targetId === actorId) throw new Error("船长不能选择自己。");
      this.appendAndApply({ type: "map.feed_kraken", captainId: actorId, targetId }, envelope);
      if (this.game.winner === "cult") {
        this.appendAndApply({ type: "game.ended", winner: "cult", reason: "cult_leader_fed" }, envelope);
        return;
      }
      this.beginCardEffects(envelope);
      return;
    }
    if (this.game.phase === "map_flog") {
      if (actorId !== this.game.offices.captainId) throw new Error("只有船长可以发动鞭笞。");
      if (targetId === actorId) throw new Error("不能鞭笞自己。");
      const notFaction = pickFloggingReveal(target.faction, `${this.roomId}:${this.nextSeq}:flog`);
      this.appendAndApply({ type: "map.flogging", captainId: actorId, targetId, notFaction }, envelope);
      this.beginCardEffects(envelope);
      return;
    }
    if (this.game.phase === "map_tongue") {
      if (actorId !== this.game.offices.captainId) throw new Error("只有船长可以发动割舌。");
      if (targetId === actorId) throw new Error("不能割舌自己。");
      this.appendAndApply({ type: "map.tongue", captainId: actorId, targetId }, envelope);
      this.beginCardEffects(envelope);
      return;
    }
    if (this.game.phase === "effect_mermaid") {
      if (actorId !== this.game.offices.captainId) throw new Error("只有船长可以指定美人鱼查看者。");
      if (targetId === actorId) throw new Error("请选择其他玩家。");
      const cardIds = this.game.hands.discardPile.slice(-3).map((card) => card.id);
      this.appendAndApply({ type: "effect.mermaid", viewerId: targetId, cardIds }, envelope);
      return;
    }
    if (this.game.phase === "effect_telescope") {
      if (actorId !== this.game.offices.captainId) throw new Error("只有船长可以指定望远镜查看者。");
      const top = peekDeckCardIds(this.game, 1)[0];
      if (!top) throw new Error("牌堆没有牌可供望远镜查看。");
      this.appendAndApply({ type: "effect.telescope", viewerId: targetId, cardId: top }, envelope);
      return;
    }
    if (this.game.phase === "ritual_convert") {
      if (actorId !== cultLeaderId(this.game)) throw new Error("只有邪教领袖可以皈依玩家。");
      if (!convertiblePlayerIds(this.game).includes(targetId)) throw new Error("该玩家不可被转化。");
      this.appendAndApply({ type: "ritual.converted", targetId }, envelope);
      this.finishSuccessfulVoyage(envelope);
      return;
    }
    if (this.game.phase === "emergency_navigator") {
      if (actorId !== this.game.offices.captainId) throw new Error("只有船长可以指定紧急领航员。");
      if (targetId === actorId) throw new Error("不能指定自己。");
      if (target.dead) throw new Error("不能指定已出局玩家。");
      this.appendAndApply({ type: "emergency.navigator", navigatorId: targetId }, envelope);
      this.dealToCaptain(envelope);
      return;
    }
    throw new Error("当前阶段不能选择玩家。");
  }

  private handleAcknowledge(actorId: PlayerId, envelope: ClientActionEnvelope) {
    if (this.game.phase === "effect_mermaid") {
      if (actorId !== this.game.mermaidViewerId) throw new Error("只有查看者可以确认。");
      this.continueAfterCardEffects(envelope);
      return;
    }
    if (this.game.phase === "ritual_cabin") {
      if (actorId !== cultLeaderId(this.game)) throw new Error("只有邪教领袖可以确认。");
      this.finishSuccessfulVoyage(envelope);
      return;
    }
    throw new Error("当前阶段无需确认。");
  }

  private beginCardEffects(envelope?: ClientActionEnvelope) {
    if (this.game.phase === "ended") return;
    const card = this.game.lastRevealedCard;
    if (!card) {
      this.continueAfterCardEffects(envelope);
      return;
    }
    switch (card.effect) {
      case "drunk": {
        const from = this.game.offices.captainId!;
        const to = nextDrunkCaptainId(this.game);
        this.appendAndApply({ type: "effect.drunk", fromCaptainId: from, toCaptainId: to }, envelope);
        this.continueAfterCardEffects(envelope);
        return;
      }
      case "disarm": {
        const navigatorId = this.game.offices.navigatorId;
        if (navigatorId) this.appendAndApply({ type: "effect.disarm", playerId: navigatorId }, envelope);
        this.continueAfterCardEffects(envelope);
        return;
      }
      case "armed": {
        const navigatorId = this.game.offices.navigatorId;
        if (navigatorId) this.appendAndApply({ type: "effect.armed", playerId: navigatorId }, envelope);
        this.continueAfterCardEffects(envelope);
        return;
      }
      case "mermaid": {
        this.appendAndApply({ type: "phase.set", phase: "effect_mermaid" }, envelope);
        return;
      }
      case "telescope": {
        this.appendAndApply({ type: "phase.set", phase: "effect_telescope" }, envelope);
        return;
      }
      case "cult_uprising": {
        this.continueAfterCardEffects(envelope);
        return;
      }
    }
  }

  private continueAfterCardEffects(envelope?: ClientActionEnvelope) {
    if (this.game.phase === "ended") return;
    if (this.game.pendingCultRitual) {
      this.drawCultRitual(envelope);
      return;
    }
    this.finishSuccessfulVoyage(envelope);
  }

  private drawCultRitual(envelope?: ClientActionEnvelope) {
    const ritual = this.game.cultRitualDeck[0] as CultRitualKind | undefined;
    if (!ritual) {
      this.finishSuccessfulVoyage(envelope);
      return;
    }
    this.appendAndApply({ type: "ritual.drawn", ritual }, envelope);
    if (ritual === "conversion") {
      this.appendAndApply({ type: "phase.set", phase: "ritual_convert" }, envelope);
      return;
    }
    if (ritual === "guns_stash") {
      this.appendAndApply({ type: "phase.set", phase: "ritual_guns" }, envelope);
      return;
    }
    this.appendAndApply({ type: "ritual.cabin_shown" }, envelope);
  }

  private finishSuccessfulVoyage(envelope?: ClientActionEnvelope) {
    if (this.game.phase === "ended") return;
    this.appendAndApply({ type: "offduty.set", playerIds: resolveOffDutyPlayerIds(this.game) }, envelope);
    const captainId = this.game.offices.captainId;
    if (!captainId) throw new Error("缺少船长。");
    this.appendAndApply(
      { type: "round.advanced", captainId, roundNo: this.game.roundNo + 1 },
      envelope,
    );
  }

  private maybeResolveMutiny(envelope?: ClientActionEnvelope) {
    if (this.game.phase !== "mutiny") return;
    const captainId = this.game.offices.captainId;
    const voters = alivePlayerIds(this.game).filter((id) => id !== captainId);
    if (!voters.every((id) => this.game.votes[id] !== undefined)) return;

    const totalGuns = voters.reduce((sum, id) => sum + (this.game.votes[id] ?? 0), 0);
    const success = totalGuns >= mutinyThreshold(this.game.seats.length);

    // 割舌玩家亮枪计入总数，但不可成为船长；竞选时其枪数视为 0
    const eligible = voters.filter((id) => !this.game.players[id]?.muted);
    const scored = eligible.map((id) => ({ id, guns: this.game.votes[id] ?? 0 }));
    const max = Math.max(...scored.map((entry) => entry.guns), 0);
    let candidates = scored.filter((entry) => entry.guns === max).map((entry) => entry.id);
    if (candidates.length === 0) candidates = eligible;

    this.appendAndApply(
      { type: "mutiny.resolved", totalGuns, success, candidates: success ? candidates : undefined },
      envelope,
    );
    if (!success) {
      this.dealToCaptain(envelope);
      return;
    }
    if (candidates.length === 1) {
      this.appendAndApply({ type: "mutiny.captain_changed", captainId: candidates[0]! }, envelope);
    } else if (candidates.length === 0 && captainId) {
      // 极端情况：无合格新船长，枪已该弃——保持现任船长重开任命
      this.appendAndApply({ type: "mutiny.captain_changed", captainId }, envelope);
    }
  }

  private dealToCaptain(envelope?: ClientActionEnvelope) {
    const captainId = this.game.offices.captainId;
    if (!captainId) throw new Error("缺少船长。");
    const cardIds = peekDeckCardIds(this.game, 2);
    if (cardIds.length < 2) throw new Error("航行牌不足以开始航行。");
    this.appendAndApply({ type: "navigation.dealt", holderId: captainId, cardIds, role: "captain" }, envelope);
  }

  private dealToMate(envelope?: ClientActionEnvelope) {
    const mateId = this.game.offices.firstMateId;
    if (!mateId) throw new Error("缺少大副。");
    // 缺席大副时由船长代抽：若大副出局
    const cardIds = peekDeckCardIds(this.game, 2);
    if (cardIds.length < 2) throw new Error("航行牌不足以发给大副。");
    this.appendAndApply({ type: "navigation.dealt", holderId: mateId, cardIds, role: "mate" }, envelope);
  }

  private appendAndApply(event: PendingGameEvent, envelope?: ClientActionEnvelope) {
    const fullEvent = { ...event, seq: this.nextSeq, at: Date.now() } as GameEvent;
    this.nextSeq += 1;
    this.events.push(fullEvent);
    this.eventStore.append(this.roomId, fullEvent, envelope?.actionId, envelope?.playerId);
    reduceGameEvent(this.game, fullEvent);
  }

  private broadcastViews() {
    for (const client of this.clients) this.sendView(client);
  }

  private sendView(client: Client) {
    const playerId = this.clientToPlayer.get(client.sessionId);
    if (!playerId) return;
    client.send("view.updated", {
      type: "view.updated",
      protocolVersion: PROTOCOL_VERSION,
      view: projectView(this.game, playerId, this.events),
    });
  }

  private reject(client: Client, actionId: string | undefined, code: string, reason: string) {
    client.send("action.rejected", {
      type: "action.rejected",
      protocolVersion: PROTOCOL_VERSION,
      actionId,
      code,
      reason,
    });
  }

  private requirePhase(phase: GameState["phase"]) {
    if (this.game.phase !== phase) throw new Error(`当前阶段不是 ${phase}。`);
  }

  private requireHost(playerId: PlayerId) {
    if (this.game.hostPlayerId !== playerId) throw new Error("只有房主可以开始游戏。");
  }
}

function normalizeNickname(nickname: string | undefined) {
  const trimmed = nickname?.trim();
  return trimmed ? trimmed.slice(0, 20) : `船员-${Math.floor(Math.random() * 1000)}`;
}
