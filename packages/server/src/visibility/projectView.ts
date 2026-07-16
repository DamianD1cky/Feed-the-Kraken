import {
  PROTOCOL_VERSION,
  type Faction,
  type GameEvent,
  type GameState,
  type NavigationCard,
  type PlayerId,
  type PlayerView,
  type PrivatePrompt,
  type PublicLogEntry,
} from "@feed/shared";
import { appointablePlayerIds, convertiblePlayerIds, cultLeaderId } from "../engine/setup.js";

export function projectView(state: GameState, viewerId: PlayerId, events: GameEvent[]): PlayerView {
  const viewer = state.players[viewerId];
  if (!viewer) throw new Error(`Unknown viewer: ${viewerId}`);

  const players = state.seats.map((playerId) => {
    const player = state.players[playerId]!;
    const samePirateTeam = viewer.faction === "pirate" && player.faction === "pirate";
    const canSeeFaction = playerId === viewerId || samePirateTeam;
    return {
      id: player.id,
      nickname: player.nickname,
      connected: player.connected,
      guns: player.guns,
      dead: player.dead,
      offDuty: state.offDuty.includes(playerId),
      muted: player.muted,
      notFactions: player.notFactions,
      faction: canSeeFaction ? player.faction : ("unknown" as const),
      role: playerId === viewerId ? player.role : undefined,
      isHost: state.hostPlayerId === playerId,
      isCaptain: state.offices.captainId === playerId,
      isFirstMate: state.offices.firstMateId === playerId,
      isNavigator: state.offices.navigatorId === playerId,
      hasVoted: state.phase === "mutiny" ? state.votes[playerId] !== undefined : undefined,
      resumeCount: player.resumeCount,
    };
  });

  return {
    protocolVersion: PROTOCOL_VERSION,
    roomId: state.roomId,
    viewerId,
    phase: state.phase,
    voyageMode: state.voyageMode,
    supplyLineCrossed: state.supplyLineCrossed,
    me: {
      id: viewer.id,
      nickname: viewer.nickname,
      faction: viewer.faction,
      role: viewer.role,
      guns: viewer.guns,
      connected: viewer.connected,
      isHost: state.hostPlayerId === viewerId,
      conversionImmune: viewer.conversionImmune,
    },
    players,
    ship: state.ship,
    offices: state.offices,
    publicLog: events.slice(-24).map(toPublicLogEntry),
    privatePrompt: getPrivatePrompt(state, viewerId),
    hand: privateHand(state, viewerId),
    peekCards: peekFor(state, viewerId),
    cabinSearchFaction:
      state.cabinSearch?.captainId === viewerId ? state.cabinSearch.faction : undefined,
    cultCabinReveal: state.cultCabinReveal && cultLeaderId(state) === viewerId ? state.cultCabinReveal : undefined,
    lastRevealedCard: state.lastRevealedCard,
    lastCultRitual: state.lastCultRitual,
    mutinyTieCandidates: state.phase === "mutiny_tiebreak" ? state.mutinyTieCandidates : undefined,
    winner: state.winner,
  };
}

function privateHand(state: GameState, viewerId: PlayerId): NavigationCard[] | undefined {
  if (state.phase === "captain_nav" && state.offices.captainId === viewerId) return state.hands.captainHand;
  if (state.phase === "mate_nav" && state.offices.firstMateId === viewerId) return state.hands.mateHand;
  if (state.phase === "navigator_nav" && state.offices.navigatorId === viewerId) return state.hands.journal;
  return undefined;
}

function peekFor(state: GameState, viewerId: PlayerId): NavigationCard[] | undefined {
  if (state.mermaidViewerId === viewerId && state.mermaidCards?.length) return state.mermaidCards;
  if (state.telescopeViewerId === viewerId && state.telescopeCard) return [state.telescopeCard];
  return undefined;
}

function getPrivatePrompt(state: GameState, viewerId: PlayerId): PrivatePrompt | undefined {
  if (state.phase === "lobby") {
    if (state.hostPlayerId === viewerId) {
      return { title: "等待开局", description: "凑齐玩家后由你开始游戏。", action: "start-game" };
    }
    return { title: "等待房主", description: "等待房主开始游戏。", action: "wait" };
  }
  if (state.phase === "officers") {
    if (state.offices.captainId === viewerId) {
      return {
        title: "任命大副和领航员",
        description: "下班船员默认不可任命；人手不足时可忽略。",
        action: "assign-officers",
        candidates: appointablePlayerIds(state, viewerId),
      };
    }
    return { title: "等待船长任命", description: "船长正在任命大副和领航员。", action: "wait" };
  }
  if (state.phase === "mutiny") {
    if (viewerId === state.offices.captainId) {
      return { title: "忠诚的拷问", description: "船员正在决定是否亮枪发动叛变。你不参与亮枪。", action: "wait" };
    }
    if (state.players[viewerId]?.dead) {
      return { title: "已出局", description: "你不能参与叛变。", action: "wait" };
    }
    if (state.votes[viewerId] === undefined) {
      return {
        title: "忠诚的拷问",
        description: "秘密投入枪数。达到阈值则叛变成功，亮枪最多者成为新船长；失败则枪收回并进入航行。",
        action: "mutiny",
      };
    }
    return { title: "等待其他船员", description: "你已亮枪，等待结果。", action: "wait" };
  }
  if (state.phase === "mutiny_tiebreak") {
    if (viewerId === state.offices.captainId) {
      return {
        title: "叛变平手",
        description: "轮流剔除一名平手者，直到只剩一位新船长。",
        action: "mutiny-tiebreak",
        candidates: state.mutinyTieCandidates,
      };
    }
    return { title: "叛变平手", description: "船长正在裁决平手。", action: "wait" };
  }
  if (state.phase === "captain_nav") {
    if (viewerId === state.offices.captainId) {
      return {
        title: "船长选牌",
        description: "抽 2 张，保留 1 张入航海日志，另一张弃入深海。航行中请保持沉默。",
        action: "keep-card",
      };
    }
    return { title: "航行中", description: "船长正在选牌。", action: "wait" };
  }
  if (state.phase === "mate_nav") {
    if (viewerId === state.offices.firstMateId) {
      return {
        title: "大副选牌",
        description: "抽 2 张，保留 1 张入航海日志，另一张弃入深海。",
        action: "keep-card",
      };
    }
    return { title: "航行中", description: "大副正在选牌。", action: "wait" };
  }
  if (state.phase === "navigator_nav") {
    if (viewerId === state.offices.navigatorId) {
      return {
        title: "领航员抉择",
        description: "从两张候选牌中选 1 张执行；或跳船抗命（出局并触发紧急航行）。",
        action: "navigate",
      };
    }
    return { title: "航行中", description: "领航员正在抉择。", action: "wait" };
  }
  if (state.phase === "map_cabin") {
    if (viewerId === state.offices.captainId) {
      return {
        title: "船舱搜查",
        description: "选择一名玩家秘密查看其阵营。被搜查者不可再被皈依。",
        action: "pick-player",
        candidates: state.seats.filter((id) => id !== viewerId && !state.players[id]?.dead),
      };
    }
    return { title: "地图行动", description: "船长正在进行船舱搜查。", action: "wait" };
  }
  if (state.phase === "map_feed") {
    if (viewerId === state.offices.captainId) {
      return {
        title: "喂食克拉肯",
        description: "选择一名玩家献祭（不能选自己）。若其为邪教领袖，邪教立即获胜。",
        action: "pick-player",
        candidates: state.seats.filter((id) => id !== viewerId && !state.players[id]?.dead),
      };
    }
    return { title: "地图行动", description: "船长正在选择喂食克拉肯的目标。", action: "wait" };
  }
  if (state.phase === "map_flog") {
    if (viewerId === state.offices.captainId) {
      return {
        title: "鞭笞",
        description: "选择一名玩家。将公开其「我不是……」某一阵营，且该玩家不可再被皈依。",
        action: "pick-player",
        candidates: state.seats.filter((id) => id !== viewerId && !state.players[id]?.dead),
      };
    }
    return { title: "地图行动", description: "船长正在执行鞭笞。", action: "wait" };
  }
  if (state.phase === "map_tongue") {
    if (viewerId === state.offices.captainId) {
      return {
        title: "割舌",
        description: "选择一名玩家：其不能再成为船长；叛变亮枪仍计入总数，但竞选船长时视为 0。",
        action: "pick-player",
        candidates: state.seats.filter((id) => id !== viewerId && !state.players[id]?.dead),
      };
    }
    return { title: "地图行动", description: "船长正在执行割舌。", action: "wait" };
  }
  if (state.phase === "effect_mermaid") {
    if (!state.mermaidViewerId && viewerId === state.offices.captainId) {
      return {
        title: "美人鱼",
        description: "选择一名玩家秘密查看最近 3 张弃牌。",
        action: "pick-player",
        candidates: state.seats.filter((id) => id !== viewerId && !state.players[id]?.dead),
      };
    }
    if (viewerId === state.mermaidViewerId) {
      return {
        title: "美人鱼 · 深海弃牌",
        description: "你看到了最近弃入深海的牌。可以讨论，也可以撒谎。确认后继续。",
        action: "acknowledge",
      };
    }
    return { title: "美人鱼", description: "有人正在窥视深海弃牌。", action: "wait" };
  }
  if (state.phase === "effect_telescope") {
    if (viewerId === state.offices.captainId) {
      return {
        title: "望远镜",
        description: "选择一名玩家查看牌堆顶。",
        action: "pick-player",
        candidates: state.seats.filter((id) => !state.players[id]?.dead),
      };
    }
    return { title: "望远镜", description: "船长正在指定查看者。", action: "wait" };
  }
  if (state.phase === "effect_telescope_decide") {
    if (viewerId === state.telescopeViewerId) {
      return {
        title: "望远镜 · 牌堆顶",
        description: "选择将这张牌放回牌堆顶，或弃入深海。",
        action: "telescope-decide",
      };
    }
    return { title: "望远镜", description: "有人正在决定牌堆顶的命运。", action: "wait" };
  }
  if (state.phase === "ritual_convert") {
    if (viewerId === cultLeaderId(state)) {
      return {
        title: "邪教仪式 · 皈依",
        description: "秘密选择一名可转化玩家成为邪教徒。",
        action: "ritual-convert",
        candidates: convertiblePlayerIds(state),
      };
    }
    return { title: "邪教仪式", description: "邪教领袖正在进行皈依……全员请闭眼（外部语音配合）。", action: "wait" };
  }
  if (state.phase === "ritual_guns") {
    if (viewerId === cultLeaderId(state)) {
      return {
        title: "邪教仪式 · 武器库",
        description: "将 3 把手枪分给最多 3 名玩家（可含自己）。下方为快捷：各给三人 1 枪，或一人 3 枪。",
        action: "ritual-guns",
        candidates: state.seats.filter((id) => !state.players[id]?.dead),
      };
    }
    return { title: "邪教仪式", description: "邪教领袖正在分发武器库手枪。", action: "wait" };
  }
  if (state.phase === "ritual_cabin") {
    if (viewerId === cultLeaderId(state)) {
      return {
        title: "邪教仪式 · 船舱搜查",
        description: "你已获知本轮航行团队阵营。确认后继续。",
        action: "acknowledge",
      };
    }
    return { title: "邪教仪式", description: "邪教领袖正在窥视航行团队。", action: "wait" };
  }
  if (state.phase === "emergency_navigator") {
    if (viewerId === state.offices.captainId) {
      return {
        title: "紧急领航员",
        description: "领航员已跳船。指定紧急领航员（可为下班玩家），跳过叛变立即航行。",
        action: "pick-player",
        candidates: state.seats.filter((id) => id !== viewerId && !state.players[id]?.dead),
      };
    }
    return { title: "紧急航行", description: "船长正在指定紧急领航员。", action: "wait" };
  }
  return undefined;
}

function toPublicLogEntry(event: GameEvent): PublicLogEntry {
  return { seq: event.seq, at: event.at, message: publicMessage(event) };
}

function publicMessage(event: GameEvent): string {
  switch (event.type) {
    case "player.joined": return `${event.nickname} 加入房间`;
    case "session.reconnected": return "一名玩家重新连接";
    case "session.disconnected": return "一名玩家暂时离线";
    case "game.started": return "游戏开始：阵营已秘密分配，牌库与邪教仪式已就绪";
    case "officers.assigned": return "船长任命了大副和领航员";
    case "mutiny.committed": return "一名船员已决定是否亮枪";
    case "mutiny.resolved":
      return event.success
        ? `叛变成功！总枪数 ${event.totalGuns}`
        : `叛变失败（总枪数 ${event.totalGuns}），枪收回，进入航行`;
    case "mutiny.tie_eliminated": return "船长剔除了一名叛变平手者";
    case "mutiny.captain_changed": return "叛变产生了新船长";
    case "navigation.dealt": return event.role === "captain" ? "船长抽取了 2 张航行牌" : "大副抽取了 2 张航行牌";
    case "navigation.kept": return event.role === "captain" ? "船长已将 1 张牌放入航海日志" : "大副已将 1 张牌放入航海日志";
    case "navigation.journal_ready": return "航海日志已交给领航员";
    case "navigation.chosen": return "领航员选定了最终航线";
    case "navigation.revealed": return "船长公开了最终航行牌";
    case "navigation.jumped": return "领航员跳船抗命！";
    case "ship.moved": return `船只移动到 (${event.to.x}, ${event.to.y})`;
    case "map.triggered": return `触发地图行动：${mapActionLabel(event.action)}`;
    case "map.cabin_search": return "船长完成了一次船舱搜查";
    case "map.feed_kraken": return "一名船员被喂食克拉肯，已出局";
    case "map.flogging": return `鞭笞结果：一名船员「不是${translateFaction(event.notFaction)}」`;
    case "map.tongue": return "一名船员被割舌，不能再担任船长";
    case "supply.crossed": return "船只越过补给线：手枪不足 3 把的船员已补足";
    case "effect.drunk": return "航行牌效果：醉酒——船长职务转移";
    case "effect.disarm": return "航行牌效果：缴械——领航员失去 1 枪";
    case "effect.armed": return "航行牌效果：武装——领航员获得 1 枪";
    case "effect.mermaid": return "航行牌效果：美人鱼";
    case "effect.telescope": return "航行牌效果：望远镜";
    case "effect.telescope_resolved": return event.discarded ? "望远镜：牌被弃入深海" : "望远镜：牌放回牌堆";
    case "ritual.drawn": return `邪教仪式翻开：${ritualLabel(event.ritual)}`;
    case "ritual.converted": return "一名玩家被秘密皈依为邪教徒";
    case "ritual.guns": return "邪教武器库已分发 3 把手枪";
    case "ritual.cabin_shown": return "邪教领袖窥视了航行团队阵营";
    case "phase.set": return "";
    case "offduty.set": return event.playerIds.length ? `下班轮换：${event.playerIds.length} 人下班` : "本轮无人下班";
    case "round.advanced": return "新一轮：请船长任命领航团队";
    case "emergency.navigator": return "紧急领航员已指定";
    case "game.ended": return `游戏结束，胜利阵营：${translateFaction(event.winner)}`;
    case "room.closed": return `房间关闭：${event.reason}`;
  }
}

function ritualLabel(ritual: string) {
  if (ritual === "conversion") return "皈依";
  if (ritual === "guns_stash") return "邪教武器库";
  return "邪教船舱搜查";
}

function mapActionLabel(action: string) {
  if (action === "cabin_search") return "船舱搜查";
  if (action === "feed_kraken") return "喂食克拉肯";
  if (action === "flogging") return "鞭笞";
  if (action === "tongue") return "割舌";
  return action;
}

function translateFaction(faction: Faction) {
  if (faction === "sailor") return "水手";
  if (faction === "pirate") return "海盗";
  return "邪教";
}
