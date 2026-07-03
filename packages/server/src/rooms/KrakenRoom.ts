import { randomUUID } from "node:crypto";
import { Client, Room } from "colyseus";
import { Schema } from "@colyseus/schema";
import {
  clientActionEnvelopeSchema,
  DESTINATION_CARDS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PROTOCOL_VERSION,
  VOTE_PASS_THRESHOLD,
  type ClientActionEnvelope,
  type GameEvent,
  type GameState,
  type PlayerId,
} from "@feed/shared";
import { createEventStore, type EventStore } from "../db/eventStore.js";
import { reduceGameEvent, rotateCaptain } from "../engine/reducer.js";
import { assignHiddenRoles, createLobbyPlayer, createLobbyState, drawDestinationCards } from "../engine/setup.js";
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

type PendingGameEvent = GameEvent extends infer E ? E extends GameEvent ? Omit<E, "seq" | "at"> : never : never;

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
      this.game.players[reconnectPlayerId].connected = true;
      this.appendAndApply({ type: "session.reconnected", playerId: reconnectPlayerId });
      this.sendSession(client, reconnectPlayerId, this.sessions.get(reconnectPlayerId));
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
    const sessionToken = createToken();
    const reconnectToken = createToken();
    this.sessions.set(playerId, {
      playerId,
      sessionTokenHash: hashToken(sessionToken),
      reconnectTokenHash: hashToken(reconnectToken),
    });
    this.clientToPlayer.set(client.sessionId, playerId);
    this.game.players[playerId] = createLobbyPlayer(playerId, nickname);
    this.game.seats.push(playerId);
    this.game.hostPlayerId ??= playerId;
    this.appendAndApply({ type: "player.joined", playerId, nickname });
    client.send("session.established", {
      type: "session.established",
      protocolVersion: PROTOCOL_VERSION,
      roomId: this.roomId,
      playerId,
      sessionToken,
      reconnectToken,
    });
    this.broadcastViews();
  }

  onLeave(client: Client) {
    const playerId = this.clientToPlayer.get(client.sessionId);
    if (!playerId) return;
    this.clientToPlayer.delete(client.sessionId);
    const player = this.game.players[playerId];
    if (player) player.connected = false;
    this.broadcastViews();
  }

  private resolveReconnect(options: JoinOptions) {
    if (!options.playerId || !options.reconnectToken) return undefined;
    const session = this.sessions.get(options.playerId);
    if (!session) return undefined;
    if (!verifyToken(options.reconnectToken, session.reconnectTokenHash)) return undefined;
    if (!this.game.players[options.playerId]) return undefined;
    return options.playerId;
  }

  private sendSession(client: Client, playerId: PlayerId, session?: SessionRecord) {
    if (!session) return;
    client.send("session.established", {
      type: "session.established",
      protocolVersion: PROTOCOL_VERSION,
      roomId: this.roomId,
      playerId,
      sessionToken: "reconnected-session-token-hidden",
      reconnectToken: "reconnected-token-hidden",
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
    if (this.processedActions.has(actionKey)) {
      return;
    }

    try {
      this.applyAction(envelope);
      this.processedActions.set(actionKey, { actionId: envelope.actionId, result: "accepted" });
      this.broadcastViews();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "动作被拒绝。";
      this.processedActions.set(actionKey, { actionId: envelope.actionId, result: "rejected", code: "action_rejected", reason });
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
        if (this.game.seats.length < MIN_PLAYERS) {
          throw new Error(`至少需要 ${MIN_PLAYERS} 名玩家才能开始。`);
        }
        assignHiddenRoles(this.game);
        this.game.hands.destinationDeck = [...DESTINATION_CARDS];
        this.appendAndApply({ type: "game.started", seed: randomUUID() }, envelope);
        return;
      }
      case "assignOfficers": {
        this.requirePhase("officers");
        if (this.game.offices.captainId !== actorId) throw new Error("只有船长可以任命职务。");
        const { firstMateId, navigatorId } = action;
        if (firstMateId === navigatorId) throw new Error("大副和领航员必须是不同玩家。");
        if (!this.game.players[firstMateId] || !this.game.players[navigatorId]) throw new Error("被任命玩家不存在。");
        if (firstMateId === actorId || navigatorId === actorId) throw new Error("船长不能任命自己为大副或领航员。");
        this.appendAndApply({ type: "officers.assigned", firstMateId, navigatorId }, envelope);
        return;
      }
      case "commitVote": {
        this.requirePhase("vote");
        const player = this.game.players[actorId];
        if (this.game.votes[actorId] !== undefined) throw new Error("你已经投过票。");
        if (action.guns > player.guns) throw new Error("投入枪数超过剩余枪数。");
        this.appendAndApply({ type: "vote.committed", playerId: actorId, guns: action.guns }, envelope);
        if (this.game.seats.every((playerId) => this.game.votes[playerId] !== undefined)) {
          const totalGuns = Object.values(this.game.votes).reduce((sum, guns) => sum + guns, 0);
          const passed = totalGuns >= VOTE_PASS_THRESHOLD;
          this.appendAndApply({ type: "vote.resolved", totalGuns, passed }, envelope);
          if (passed) this.prepareNavigation(envelope);
        }
        return;
      }
      case "chooseDestination": {
        this.requirePhase("navigation");
        if (this.game.offices.navigatorId !== actorId) throw new Error("只有领航员可以选择航线。");
        const card = this.game.hands.navigatorHand.find((candidate) => candidate.id === action.cardId);
        if (!card) throw new Error("该航线不在你的候选手牌中。");
        this.appendAndApply({ type: "destination.chosen", cardId: card.id, by: actorId }, envelope);
        this.game.hands.discardPile.push(...this.game.hands.navigatorHand.filter((candidate) => candidate.id !== card.id));
        this.game.hands.navigatorHand = [];
        const to = { x: this.game.ship.x + card.dx, y: this.game.ship.y + card.dy };
        this.appendAndApply({ type: "ship.moved", cardId: card.id, to }, envelope);
        if (this.game.winner) {
          this.appendAndApply({ type: "game.ended", winner: this.game.winner, reason: "ship_reached_goal" }, envelope);
        } else {
          rotateCaptain(this.game);
          this.game.phase = "officers";
        }
        return;
      }
    }
  }

  private prepareNavigation(envelope: ClientActionEnvelope) {
    const navigatorId = this.game.offices.navigatorId;
    if (!navigatorId) throw new Error("缺少领航员，无法进入航行阶段。");
    const cards = drawDestinationCards(this.game, 3);
    this.game.hands.navigatorHand = cards;
    this.appendAndApply({ type: "destination.drawn", cardIds: cards.map((card) => card.id), holderId: navigatorId }, envelope);
  }

  private appendAndApply(event: PendingGameEvent, envelope?: ClientActionEnvelope) {
    const fullEvent = { ...event, seq: this.nextSeq, at: Date.now() } as GameEvent;
    this.nextSeq += 1;
    this.events.push(fullEvent);
    this.eventStore.append(this.roomId, fullEvent, envelope?.actionId, envelope?.playerId);
    reduceGameEvent(this.game, fullEvent);
  }

  private broadcastViews() {
    for (const client of this.clients) {
      const playerId = this.clientToPlayer.get(client.sessionId);
      if (!playerId) continue;
      client.send("view.updated", {
        type: "view.updated",
        protocolVersion: PROTOCOL_VERSION,
        view: projectView(this.game, playerId, this.events),
      });
    }
  }

  private reject(client: Client, actionId: string | undefined, code: string, reason: string) {
    client.send("action.rejected", { type: "action.rejected", protocolVersion: PROTOCOL_VERSION, actionId, code, reason });
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
