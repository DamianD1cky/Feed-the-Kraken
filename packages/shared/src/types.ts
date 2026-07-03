export const PROTOCOL_VERSION = 1;

export type PlayerId = string;
export type RoomId = string;
export type CardId = string;

export type Faction = "sailor" | "pirate" | "cult";
export type Role = "captain" | "first-mate" | "navigator" | "sailor" | "pirate" | "cultist";

export type Phase =
  | "lobby"
  | "officers"
  | "vote"
  | "navigation"
  | "ended";

export type Direction = "east" | "west" | "north";

export type DestinationCard = {
  id: CardId;
  label: string;
  direction: Direction;
  dx: number;
  dy: number;
};

export type InternalPlayer = {
  id: PlayerId;
  nickname: string;
  connected: boolean;
  faction: Faction;
  role: Role;
  guns: number;
  muted: boolean;
  dead: boolean;
};

export type GameState = {
  roomId: RoomId;
  phase: Phase;
  players: Record<PlayerId, InternalPlayer>;
  seats: PlayerId[];
  hostPlayerId?: PlayerId;
  ship: {
    x: number;
    y: number;
    heading: Direction;
  };
  offices: {
    captainId?: PlayerId;
    firstMateId?: PlayerId;
    navigatorId?: PlayerId;
  };
  hands: {
    destinationDeck: DestinationCard[];
    navigatorHand: DestinationCard[];
    discardPile: DestinationCard[];
  };
  votes: Record<PlayerId, number>;
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
};

export type VisiblePlayer = {
  id: PlayerId;
  nickname: string;
  connected: boolean;
  guns: number;
  dead: boolean;
  faction: Faction | "unknown";
  role?: Role;
  isHost: boolean;
  isCaptain: boolean;
  isFirstMate: boolean;
  isNavigator: boolean;
  hasVoted?: boolean;
};

export type PublicLogEntry = {
  seq: number;
  message: string;
  at: number;
};

export type PrivatePrompt = {
  title: string;
  description: string;
  action: "start-game" | "assign-officers" | "vote" | "navigate" | "wait";
};

export type PlayerView = {
  protocolVersion: number;
  roomId: RoomId;
  viewerId: PlayerId;
  phase: Phase;
  me: VisibleSelf;
  players: VisiblePlayer[];
  ship: {
    x: number;
    y: number;
    heading: Direction;
  };
  offices: {
    captainId?: PlayerId;
    firstMateId?: PlayerId;
    navigatorId?: PlayerId;
  };
  publicLog: PublicLogEntry[];
  privatePrompt?: PrivatePrompt;
  hand?: DestinationCard[];
  winner?: Faction;
};

export type ClientAction =
  | { type: "startGame" }
  | { type: "assignOfficers"; firstMateId: PlayerId; navigatorId: PlayerId }
  | { type: "commitVote"; guns: number }
  | { type: "chooseDestination"; cardId: CardId };

export type ClientActionEnvelope = {
  protocolVersion: number;
  actionId: string;
  roomId: RoomId;
  playerId: PlayerId;
  action: ClientAction;
  sentAt: number;
};

export type ServerMessage =
  | { type: "session.established"; protocolVersion: number; roomId: RoomId; playerId: PlayerId; sessionToken: string; reconnectToken: string }
  | { type: "view.updated"; protocolVersion: number; view: PlayerView }
  | { type: "action.rejected"; protocolVersion: number; actionId?: string; code: string; reason: string }
  | { type: "room.closed"; protocolVersion: number; reason: string };

export type GameEvent =
  | { type: "player.joined"; seq: number; playerId: PlayerId; nickname: string; at: number }
  | { type: "session.reconnected"; seq: number; playerId: PlayerId; at: number }
  | { type: "game.started"; seq: number; seed: string; at: number }
  | { type: "officers.assigned"; seq: number; firstMateId: PlayerId; navigatorId: PlayerId; at: number }
  | { type: "vote.committed"; seq: number; playerId: PlayerId; guns: number; at: number }
  | { type: "vote.resolved"; seq: number; totalGuns: number; passed: boolean; at: number }
  | { type: "destination.drawn"; seq: number; cardIds: CardId[]; holderId: PlayerId; at: number }
  | { type: "destination.chosen"; seq: number; cardId: CardId; by: PlayerId; at: number }
  | { type: "ship.moved"; seq: number; cardId: CardId; to: { x: number; y: number }; at: number }
  | { type: "game.ended"; seq: number; winner: Faction; reason: string; at: number }
  | { type: "room.closed"; seq: number; reason: "ended" | "abandoned" | "timeout"; at: number };
