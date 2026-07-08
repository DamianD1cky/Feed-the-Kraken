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

export function assignHiddenRoles(state: GameState, seed: string) {
  const seats = [...state.seats];
  const assignments = shuffle(
    seats.map((_, index) => {
      if (index === 0) return { faction: "pirate" as Faction, role: "pirate" as Role };
      if (index === seats.length - 1) return { faction: "cult" as Faction, role: "cultist" as Role };
      return { faction: "sailor" as Faction, role: "sailor" as Role };
    }),
    seed,
  );

  for (let index = 0; index < seats.length; index += 1) {
    const player = state.players[seats[index]];
    const assignment = assignments[index];
    if (!player || !assignment) continue;
    player.faction = assignment.faction;
    player.role = assignment.role;
    player.guns = INITIAL_GUNS;
  }
}

function shuffle<T>(items: T[], seed: string) {
  const result = [...items];
  const random = createSeededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function createSeededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawDestinationCards(state: GameState, count: number): DestinationCard[] {
  if (state.hands.destinationDeck.length < count) {
    state.hands.destinationDeck = [...state.hands.destinationDeck, ...state.hands.discardPile];
    state.hands.discardPile = [];
  }
  return state.hands.destinationDeck.splice(0, count);
}
