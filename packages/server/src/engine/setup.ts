import {
  DESTINATION_CARDS,
  INITIAL_GUNS,
  type DestinationCard,
  type Faction,
  type GameState,
  type InternalPlayer,
  type PlayerId,
  type Role,
} from "@feed/shared";

export function createLobbyState(roomId: string): GameState {
  return {
    roomId,
    phase: "lobby",
    players: {},
    seats: [],
    ship: { x: 0, y: 0, heading: "north" },
    offices: {},
    hands: {
      destinationDeck: [...DESTINATION_CARDS],
      navigatorHand: [],
      discardPile: [],
    },
    votes: {},
    roundNo: 0,
    termRemaining: 0,
  };
}

export function createLobbyPlayer(id: PlayerId, nickname: string): InternalPlayer {
  return {
    id,
    nickname,
    connected: true,
    faction: "sailor",
    role: "sailor",
    guns: INITIAL_GUNS,
    muted: false,
    dead: false,
  };
}

export function assignHiddenRoles(state: GameState) {
  const seats = [...state.seats];
  const factions: Faction[] = seats.map((_, index) => {
    if (index === 0) return "pirate";
    if (index === seats.length - 1) return "cult";
    return "sailor";
  });
  const roles: Role[] = seats.map((_, index) => {
    if (index === 0) return "pirate";
    if (index === seats.length - 1) return "cultist";
    return "sailor";
  });

  for (let index = 0; index < seats.length; index += 1) {
    const player = state.players[seats[index]];
    if (!player) continue;
    player.faction = factions[index];
    player.role = roles[index];
    player.guns = INITIAL_GUNS;
  }
}

export function drawDestinationCards(state: GameState, count: number): DestinationCard[] {
  if (state.hands.destinationDeck.length < count) {
    state.hands.destinationDeck = [...state.hands.destinationDeck, ...state.hands.discardPile];
    state.hands.discardPile = [];
  }
  return state.hands.destinationDeck.splice(0, count);
}
