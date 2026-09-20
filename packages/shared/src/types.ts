export const PROTOCOL_VERSION = 6;

export type VoyageMode = "quick" | "long";

export type PlayerId = string;
export type RoomId = string;
export type CardId = string;

export type Faction = "sailor" | "pirate" | "cult";
/** 身份角色；职位（船长/大副/领航）在 offices 中。 */
export type Role = "sailor" | "pirate" | "cult_leader" | "cultist";

export type Phase =
  | "lobby"
  | "officers"
  | "mutiny"
  | "mutiny_tiebreak"
  | "captain_nav"
  | "mate_nav"
  | "navigator_nav"
  | "map_cabin"
  | "map_feed"
  | "map_flog"
  | "map_tongue"
  | "effect_mermaid"
  | "effect_telescope"
  | "effect_telescope_decide"
  | "ritual_pending"
  | "ritual_convert"
  | "ritual_guns"
  | "ritual_cabin"
  | "emergency_navigator"
  | "ended";

export type Direction = "east" | "west" | "north";
export type MapAction = "cabin_search" | "feed_kraken" | "flogging" | "tongue";
export type NavigationEffect = "cult_uprising" | "drunk" | "disarm" | "mermaid" | "telescope" | "armed";
export type CultRitualKind = "conversion" | "guns_stash" | "cult_cabin_search";

export type NavigationCard = {
  id: CardId;
  label: string;
  direction: Direction;
  dx: number;
  dy: number;
  effect: NavigationEffect;
};

export type DestinationCard = NavigationCard;

export type InternalPlayer = {
  id: PlayerId;
  nickname: string;
  connected: boolean;
  faction: Faction;
  role: Role;
  guns: number;
  /** 割舌：漫长航行用；快速图暂保留字段。 */
  muted: boolean;
  dead: boolean;
  /** 被船舱搜查或鞭笞后不可被皈依。 */
  conversionImmune: boolean;
  /** 鞭笞公开的「我不是……」阵营。 */
  notFactions: Faction[];
  /** 面前船长简历卡数量（醉酒换船长时参考）。 */
  resumeCount: number;
  /** 已获知的身份快照；皈依不会让旧同伴自动获知新阵营。 */
  knownFactions?: Record<PlayerId, Faction>;
};

export type GameState = {
  roomId: RoomId;
  phase: Phase;
  voyageMode: VoyageMode;
  /** 漫长航行：是否已越过补给线并补枪。 */
  supplyLineCrossed: boolean;
  players: Record<PlayerId, InternalPlayer>;
  seats: PlayerId[];
  hostPlayerId?: PlayerId;
  ship: { x: number; y: number; heading: Direction };
  offices: {
    captainId?: PlayerId;
    firstMateId?: PlayerId;
    navigatorId?: PlayerId;
  };
  /** 本次成功航行团队，独立于醉酒后的现任船长。 */
  voyageOffices?: GameState["offices"];
  offDuty: PlayerId[];
  mapActions: Record<string, MapAction>;
  hands: {
    deck: NavigationCard[];
    captainHand: NavigationCard[];
    mateHand: NavigationCard[];
    journal: NavigationCard[];
    discardPile: NavigationCard[];
    /** 已公开的航行牌（简历），不回洗。 */
    resumePile: NavigationCard[];
  };
  /** 叛变握枪；船长不参与。 */
  votes: Record<PlayerId, number>;
  mutinyTieCandidates: PlayerId[];
  /** 平手连锁裁决：当前有权剔除一名候选人的玩家。 */
  mutinyEliminatorId?: PlayerId;
  cultRitualDeck: CultRitualKind[];
  pendingCultRitual: boolean;
  lastCultRitual?: CultRitualKind;
  lastRevealedCard?: NavigationCard;
  /** 美人鱼：被指定查看者与其可见的弃牌。 */
  mermaidViewerId?: PlayerId;
  mermaidCards?: NavigationCard[];
  /** 望远镜 */
  telescopeViewerId?: PlayerId;
  telescopeCard?: NavigationCard;
  /** 船舱搜查：仅船长可见目标阵营 */
  cabinSearch?: { captainId: PlayerId; targetId: PlayerId; faction: Faction };
  /** 邪教船舱搜查：仅邪教领袖可见航行团队阵营 */
  cultCabinReveal?: {
    captain?: Faction;
    firstMate?: Faction;
    navigator?: Faction;
  };
  /** 紧急航行：跳过叛变 */
  emergencyVoyage: boolean;
  roundNo: number;
  termRemaining: number;
  winner?: Faction;
};

export type VisibleSelf = {
  id: PlayerId;
  nickname: string;
  faction?: Faction;
  role?: Role;
  guns: number;
  connected: boolean;
  isHost: boolean;
  conversionImmune?: boolean;
};

export type VisiblePlayer = {
  id: PlayerId;
  nickname: string;
  connected: boolean;
  guns: number;
  dead: boolean;
  offDuty: boolean;
  muted: boolean;
  notFactions: Faction[];
  faction: Faction | "unknown";
  role?: Role;
  isHost: boolean;
  isCaptain: boolean;
  isFirstMate: boolean;
  isNavigator: boolean;
  hasVoted?: boolean;
  resumeCount: number;
};

export type PublicLogEntry = {
  seq: number;
  message: string;
  at: number;
};

export type PrivatePromptAction =
  | "start-game"
  | "assign-officers"
  | "mutiny"
  | "mutiny-tiebreak"
  | "keep-card"
  | "navigate"
  | "jump-ship"
  | "pick-player"
  | "telescope-decide"
  | "ritual-convert"
  | "ritual-guns"
  | "acknowledge"
  | "wait";

export type PrivatePrompt = {
  title: string;
  description: string;
  action: PrivatePromptAction;
  /** pick-player / convert 等可选目标 */
  candidates?: PlayerId[];
};

export type PlayerView = {
  protocolVersion: number;
  roomId: RoomId;
  viewerId: PlayerId;
  phase: Phase;
  voyageMode: VoyageMode;
  supplyLineCrossed: boolean;
  roundNo: number;
  /** 服务端剩余的公开地图行动，客户端不再复制规则推导。 */
  mapActions: Record<string, MapAction>;
  me: VisibleSelf;
  players: VisiblePlayer[];
  ship: { x: number; y: number; heading: Direction };
  offices: {
    captainId?: PlayerId;
    firstMateId?: PlayerId;
    navigatorId?: PlayerId;
  };
  publicLog: PublicLogEntry[];
  privatePrompt?: PrivatePrompt;
  hand?: NavigationCard[];
  /** 美人鱼 / 望远镜私有信息 */
  peekCards?: NavigationCard[];
  cabinSearchFaction?: Faction;
  cultCabinReveal?: GameState["cultCabinReveal"];
  lastRevealedCard?: NavigationCard;
  lastCultRitual?: CultRitualKind;
  mutinyTieCandidates?: PlayerId[];
  winner?: Faction;
};

export type ClientAction =
  | { type: "startGame"; voyageMode?: VoyageMode }
  | { type: "assignOfficers"; firstMateId: PlayerId; navigatorId: PlayerId }
  | { type: "commitMutiny"; guns: number }
  | { type: "eliminateTieCandidate"; playerId: PlayerId }
  | { type: "keepNavigationCard"; cardId: CardId }
  | { type: "jumpShip" }
  | { type: "pickPlayer"; playerId: PlayerId }
  | { type: "telescopeDecision"; discard: boolean }
  | { type: "distributeCultGuns"; grants: Array<{ playerId: PlayerId; guns: number }> }
  | { type: "acknowledge" };

export type ClientActionEnvelope = {
  protocolVersion: number;
  actionId: string;
  roomId: RoomId;
  playerId: PlayerId;
  action: ClientAction;
  sentAt: number;
};

export type ServerMessage =
  | {
      type: "session.established";
      protocolVersion: number;
      roomId: RoomId;
      playerId: PlayerId;
      sessionToken: string;
      reconnectToken: string;
      expiresAt: number;
    }
  | { type: "view.updated"; protocolVersion: number; view: PlayerView }
  | { type: "action.rejected"; protocolVersion: number; actionId?: string; code: string; reason: string }
  | { type: "room.closed"; protocolVersion: number; reason: string };

export type GameEvent =
  | { type: "player.joined"; seq: number; playerId: PlayerId; nickname: string; at: number }
  | { type: "session.reconnected"; seq: number; playerId: PlayerId; at: number }
  | { type: "session.disconnected"; seq: number; playerId: PlayerId; at: number }
  | { type: "game.started"; seq: number; seed: string; voyageMode?: VoyageMode; at: number }
  | { type: "navigation.reshuffled"; seq: number; cardIds: CardId[]; at: number }
  | { type: "officers.assigned"; seq: number; firstMateId: PlayerId; navigatorId: PlayerId; at: number }
  | { type: "mutiny.committed"; seq: number; playerId: PlayerId; guns: number; at: number }
  | { type: "mutiny.resolved"; seq: number; totalGuns: number; success: boolean; candidates?: PlayerId[]; at: number }
  | { type: "mutiny.tie_eliminated"; seq: number; playerId: PlayerId; at: number }
  | { type: "mutiny.captain_changed"; seq: number; captainId: PlayerId; at: number }
  | { type: "navigation.dealt"; seq: number; holderId: PlayerId; cardIds: CardId[]; role: "captain" | "mate"; at: number }
  | { type: "navigation.kept"; seq: number; playerId: PlayerId; keptCardId: CardId; discardedCardId: CardId; role: "captain" | "mate"; at: number }
  | { type: "navigation.journal_ready"; seq: number; cardIds: CardId[]; at: number }
  | { type: "navigation.chosen"; seq: number; cardId: CardId; discardedCardId: CardId; by: PlayerId; at: number }
  | { type: "navigation.revealed"; seq: number; cardId: CardId; at: number }
  | { type: "navigation.jumped"; seq: number; playerId: PlayerId; at: number }
  | { type: "ship.moved"; seq: number; cardId: CardId; to: { x: number; y: number }; at: number }
  | { type: "map.triggered"; seq: number; action: MapAction; cell: string; at: number }
  | { type: "map.cabin_search"; seq: number; captainId: PlayerId; targetId: PlayerId; at: number }
  | { type: "map.feed_kraken"; seq: number; captainId: PlayerId; targetId: PlayerId; at: number }
  | { type: "map.flogging"; seq: number; captainId: PlayerId; targetId: PlayerId; notFaction: Faction; at: number }
  | { type: "map.tongue"; seq: number; captainId: PlayerId; targetId: PlayerId; at: number }
  | { type: "supply.crossed"; seq: number; at: number }
  | { type: "effect.drunk"; seq: number; fromCaptainId: PlayerId; toCaptainId: PlayerId; at: number }
  | { type: "effect.disarm"; seq: number; playerId: PlayerId; at: number }
  | { type: "effect.armed"; seq: number; playerId: PlayerId; at: number }
  | { type: "effect.mermaid"; seq: number; viewerId: PlayerId; cardIds: CardId[]; at: number }
  | { type: "effect.telescope"; seq: number; viewerId: PlayerId; cardId: CardId; at: number }
  | { type: "effect.telescope_resolved"; seq: number; cardId: CardId; discarded: boolean; at: number }
  | { type: "ritual.drawn"; seq: number; ritual: CultRitualKind; at: number }
  | { type: "ritual.converted"; seq: number; targetId: PlayerId; at: number }
  | { type: "ritual.guns"; seq: number; grants: Array<{ playerId: PlayerId; guns: number }>; at: number }
  | { type: "ritual.cabin_shown"; seq: number; at: number }
  | { type: "phase.set"; seq: number; phase: Phase; at: number }
  | { type: "offduty.set"; seq: number; playerIds: PlayerId[]; at: number }
  | { type: "round.advanced"; seq: number; captainId: PlayerId; roundNo: number; at: number }
  | { type: "emergency.navigator"; seq: number; navigatorId: PlayerId; at: number }
  | { type: "game.ended"; seq: number; winner: Faction; reason: string; at: number }
  | { type: "room.closed"; seq: number; reason: "ended" | "abandoned" | "timeout"; at: number };
