import {
  PROTOCOL_VERSION,
  type Faction,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerView,
  type PublicLogEntry,
} from "@feed/shared";

export function projectView(state: GameState, viewerId: PlayerId, events: GameEvent[]): PlayerView {
  const viewer = state.players[viewerId];
  if (!viewer) {
    throw new Error(`Unknown viewer: ${viewerId}`);
  }

  const players = state.seats.map((playerId) => {
    const player = state.players[playerId];
    const samePirateTeam = viewer.faction === "pirate" && player.faction === "pirate";
    const canSeeFaction = playerId === viewerId || samePirateTeam;
    return {
      id: player.id,
      nickname: player.nickname,
      connected: player.connected,
      guns: player.guns,
      dead: player.dead,
      faction: canSeeFaction ? player.faction : ("unknown" as const),
      role: playerId === viewerId ? player.role : undefined,
      isHost: state.hostPlayerId === playerId,
      isCaptain: state.offices.captainId === playerId,
      isFirstMate: state.offices.firstMateId === playerId,
      isNavigator: state.offices.navigatorId === playerId,
      hasVoted: state.phase === "vote" ? state.votes[playerId] !== undefined : undefined,
    };
  });

  return {
    protocolVersion: PROTOCOL_VERSION,
    roomId: state.roomId,
    viewerId,
    phase: state.phase,
    me: {
      id: viewer.id,
      nickname: viewer.nickname,
      faction: viewer.faction,
      role: viewer.role,
      guns: viewer.guns,
      connected: viewer.connected,
      isHost: state.hostPlayerId === viewerId,
    },
    players,
    ship: state.ship,
    offices: state.offices,
    publicLog: events.slice(-20).map(toPublicLogEntry),
    privatePrompt: getPrivatePrompt(state, viewerId),
    hand: state.offices.navigatorId === viewerId && state.phase === "navigation" ? state.hands.navigatorHand : undefined,
    winner: state.winner,
  };
}

function getPrivatePrompt(state: GameState, viewerId: PlayerId) {
  if (state.phase === "lobby") {
    if (state.hostPlayerId === viewerId) {
      return { title: "等待开局", description: "凑齐玩家后由你开始游戏。", action: "start-game" as const };
    }
    return { title: "等待房主", description: "等待房主开始游戏。", action: "wait" as const };
  }
  if (state.phase === "officers") {
    if (state.offices.captainId === viewerId) {
      return { title: "任命大副和领航员", description: "请选择两名不同玩家担任本轮职务。", action: "assign-officers" as const };
    }
    return { title: "等待船长任命", description: "船长正在任命大副和领航员。", action: "wait" as const };
  }
  if (state.phase === "vote") {
    if (state.votes[viewerId] === undefined) {
      return { title: "秘密投入枪数", description: "选择本轮信任投票投入的枪数。个人投入不会公开。", action: "vote" as const };
    }
    return { title: "等待其他玩家", description: "你的投票已提交。", action: "wait" as const };
  }
  if (state.phase === "navigation") {
    if (state.offices.navigatorId === viewerId) {
      return { title: "选择航线", description: "只有你能看到候选航线。选择后船只移动。", action: "navigate" as const };
    }
    return { title: "等待领航员", description: "领航员正在选择航线。", action: "wait" as const };
  }
  return undefined;
}

function toPublicLogEntry(event: GameEvent): PublicLogEntry {
  return {
    seq: event.seq,
    at: event.at,
    message: publicMessage(event),
  };
}

function publicMessage(event: GameEvent) {
  switch (event.type) {
    case "player.joined": return `${event.nickname} 加入房间`;
    case "session.reconnected": return `一名玩家重新连接`;
    case "game.started": return "游戏开始，身份已由服务端秘密分配";
    case "officers.assigned": return "船长任命了大副和领航员";
    case "vote.committed": return "一名玩家已秘密投票";
    case "vote.resolved": return `信任投票总枪数 ${event.totalGuns}，${event.passed ? "通过" : "未通过"}`;
    case "destination.drawn": return "领航员收到候选航线";
    case "destination.chosen": return "领航员选择了航线";
    case "ship.moved": return `船只移动到 (${event.to.x}, ${event.to.y})`;
    case "game.ended": return `游戏结束，胜利阵营：${translateFaction(event.winner)}`;
    case "room.closed": return `房间关闭：${event.reason}`;
  }
}

function translateFaction(faction: Faction) {
  if (faction === "sailor") return "水手";
  if (faction === "pirate") return "海盗";
  return "邪教";
}
