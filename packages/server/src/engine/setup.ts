import {
  buildFactionPool,
  createCultRitualDeck,
  createMapActions,
  createVoyageDeck,
  defaultVoyageMode,
  INITIAL_GUNS,
  RESHUFFLE_DECK_THRESHOLD,
  shuffle,
  type Faction,
  type GameState,
  type InternalPlayer,
  type PlayerId,
  type Role,
  type VoyageMode,
} from "@feed/shared";

export function createLobbyState(roomId: string): GameState {
  return {
    roomId,
    phase: "lobby",
    voyageMode: "quick",
    supplyLineCrossed: false,
    players: {},
    seats: [],
    ship: { x: 0, y: 0, heading: "north" },
    offices: {},
    offDuty: [],
    mapActions: createMapActions("quick"),
    hands: {
      deck: [],
      captainHand: [],
      mateHand: [],
      journal: [],
      discardPile: [],
      resumePile: [],
    },
    votes: {},
    mutinyTieCandidates: [],
    cultRitualDeck: [],
    pendingCultRitual: false,
    emergencyVoyage: false,
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
    conversionImmune: false,
    notFactions: [],
    resumeCount: 0,
  };
}

export function assignHiddenRoles(state: GameState, seed: string) {
  const pool = buildFactionPool(state.seats.length, seed);
  const seats = [...state.seats];
  for (let index = 0; index < seats.length; index += 1) {
    const player = state.players[seats[index]!];
    const faction = pool[index] ?? "sailor";
    if (!player) continue;
    player.faction = faction;
    player.role = roleForFaction(faction, seed, seats[index]!);
    player.guns = INITIAL_GUNS;
    player.dead = false;
    player.muted = false;
    player.conversionImmune = false;
    player.notFactions = [];
    player.resumeCount = 0;
  }

  // 11 人局：恰好一名 cultist，其余 cult 为领袖
  if (state.seats.length === 11) {
    const cultSeats = state.seats.filter((id) => state.players[id]?.faction === "cult");
    if (cultSeats.length >= 2) {
      const ordered = shuffle(cultSeats, `${seed}:cult-roles`);
      for (const [index, id] of ordered.entries()) {
        const player = state.players[id];
        if (player) player.role = index === 0 ? "cult_leader" : "cultist";
      }
    }
  } else {
    for (const id of state.seats) {
      const player = state.players[id];
      if (player?.faction === "cult") player.role = "cult_leader";
    }
  }
}

function roleForFaction(faction: Faction, _seed: string, _playerId: PlayerId): Role {
  if (faction === "pirate") return "pirate";
  if (faction === "cult") return "cult_leader";
  return "sailor";
}

export function pickCaptain(seats: PlayerId[], seed: string): PlayerId {
  if (seats.length === 0) throw new Error("Cannot pick captain without seats");
  return shuffle([...seats], `${seed}:captain`)[0]!;
}

export function buildShuffledDeck(seed: string, mode: VoyageMode = "quick") {
  return shuffle(createVoyageDeck(mode), `${seed}:deck`);
}

export function resolveVoyageMode(playerCount: number): VoyageMode {
  return defaultVoyageMode(playerCount);
}

export function buildCultRituals(seed: string) {
  return createCultRitualDeck(seed);
}

export function peekDeckCardIds(state: GameState, count: number): string[] {
  const deck =
    state.hands.deck.length < RESHUFFLE_DECK_THRESHOLD && state.hands.discardPile.length > 0
      ? [...state.hands.deck, ...state.hands.discardPile]
      : state.hands.deck;
  return deck.slice(0, count).map((card) => card.id);
}

export function ensureDeckHasCards(state: GameState, count: number) {
  if (
    (state.hands.deck.length < RESHUFFLE_DECK_THRESHOLD && state.hands.discardPile.length > 0) ||
    state.hands.deck.length < count
  ) {
    // 与 peekDeckCardIds 使用相同拼接顺序，保证预览 ID 与抽取一致。
    state.hands.deck = [...state.hands.deck, ...state.hands.discardPile];
    state.hands.discardPile = [];
  }
}

export function appointablePlayerIds(state: GameState, captainId: PlayerId): PlayerId[] {
  const candidates = state.seats.filter((playerId) => {
    const player = state.players[playerId];
    return player && !player.dead && playerId !== captainId;
  });
  const withoutOffDuty = candidates.filter((playerId) => !state.offDuty.includes(playerId));
  return withoutOffDuty.length >= 2 ? withoutOffDuty : candidates;
}

export function alivePlayerIds(state: GameState): PlayerId[] {
  return state.seats.filter((id) => state.players[id] && !state.players[id]!.dead);
}

export function cultLeaderId(state: GameState): PlayerId | undefined {
  return state.seats.find((id) => state.players[id]?.role === "cult_leader" && !state.players[id]?.dead);
}

export function convertiblePlayerIds(state: GameState): PlayerId[] {
  return alivePlayerIds(state).filter((id) => {
    const player = state.players[id]!;
    return player.faction !== "cult" && !player.conversionImmune;
  });
}
