import {
  cellKey,
  createMapActions,
  getWinner,
  INITIAL_GUNS,
  offDutyOffices,
  type CardId,
  type GameEvent,
  type GameState,
  type NavigationCard,
  type PlayerId,
} from "@feed/shared";
import {
  assignHiddenRoles,
  buildCultRituals,
  buildShuffledDeck,
  createLobbyPlayer,
  ensureDeckHasCards,
  pickCaptain,
  resolveVoyageMode,
} from "./setup.js";

export function reduceGameEvent(state: GameState, event: GameEvent) {
  switch (event.type) {
    case "player.joined": {
      if (state.players[event.playerId]) return;
      state.players[event.playerId] = createLobbyPlayer(event.playerId, event.nickname);
      state.seats.push(event.playerId);
      state.hostPlayerId ??= event.playerId;
      return;
    }
    case "session.reconnected": {
      const player = state.players[event.playerId];
      if (player) player.connected = true;
      return;
    }
    case "session.disconnected": {
      const player = state.players[event.playerId];
      if (player) player.connected = false;
      if (state.phase === "lobby" && state.hostPlayerId === event.playerId) {
        state.hostPlayerId =
          state.seats.find((id) => id !== event.playerId && state.players[id]?.connected) ??
          state.seats.find((id) => id !== event.playerId);
      }
      return;
    }
    case "game.started": {
      assignHiddenRoles(state, event.seed);
      state.voyageMode = resolveVoyageMode(state.seats.length);
      state.supplyLineCrossed = false;
      state.hands = {
        deck: buildShuffledDeck(event.seed, state.voyageMode),
        captainHand: [],
        mateHand: [],
        journal: [],
        discardPile: [],
        resumePile: [],
      };
      state.mapActions = createMapActions(state.voyageMode);
      state.cultRitualDeck = buildCultRituals(event.seed);
      state.offDuty = [];
      state.votes = {};
      state.mutinyTieCandidates = [];
      state.mutinyEliminatorId = undefined;
      state.pendingCultRitual = false;
      state.emergencyVoyage = false;
      state.phase = "officers";
      state.roundNo = 1;
      state.offices = { captainId: pickCaptain(state.seats, event.seed) };
      state.winner = undefined;
      clearEphemeral(state);
      return;
    }
    case "officers.assigned": {
      state.offices.firstMateId = event.firstMateId;
      state.offices.navigatorId = event.navigatorId;
      state.phase = "mutiny";
      state.votes = {};
      state.mutinyTieCandidates = [];
      state.mutinyEliminatorId = undefined;
      return;
    }
    case "mutiny.committed": {
      state.votes[event.playerId] = event.guns;
      return;
    }
    case "mutiny.resolved": {
      if (!event.success) {
        state.votes = {};
        state.mutinyTieCandidates = [];
        state.mutinyEliminatorId = undefined;
        state.phase = "captain_nav";
        return;
      }
      state.mutinyTieCandidates = event.candidates ?? [];
      if ((event.candidates?.length ?? 0) > 1) {
        state.mutinyEliminatorId = state.offices.captainId;
        state.phase = "mutiny_tiebreak";
      } else {
        state.mutinyEliminatorId = undefined;
      }
      return;
    }
    case "mutiny.tie_eliminated": {
      state.mutinyTieCandidates = state.mutinyTieCandidates.filter((id) => id !== event.playerId);
      state.mutinyEliminatorId =
        state.mutinyTieCandidates.length > 1 ? event.playerId : undefined;
      return;
    }
    case "mutiny.captain_changed": {
      for (const [playerId, guns] of Object.entries(state.votes)) {
        const player = state.players[playerId];
        if (player && guns > 0) player.guns = Math.max(0, player.guns - guns);
      }
      state.votes = {};
      state.mutinyTieCandidates = [];
      state.mutinyEliminatorId = undefined;
      state.offices = { captainId: event.captainId };
      state.phase = "officers";
      return;
    }
    case "navigation.dealt": {
      ensureDeckHasCards(state, event.cardIds.length);
      const cards = takeCardsFromDeck(state, event.cardIds);
      if (event.role === "captain") {
        state.hands.captainHand = cards;
        state.phase = "captain_nav";
      } else {
        state.hands.mateHand = cards;
        state.phase = "mate_nav";
      }
      return;
    }
    case "navigation.kept": {
      if (event.role === "captain") {
        applyKeep(state.hands.captainHand, state, event.keptCardId, event.discardedCardId);
        state.hands.captainHand = [];
      } else {
        applyKeep(state.hands.mateHand, state, event.keptCardId, event.discardedCardId);
        state.hands.mateHand = [];
      }
      return;
    }
    case "navigation.journal_ready": {
      const ordered = event.cardIds
        .map((cardId) => state.hands.journal.find((card) => card.id === cardId))
        .filter((card): card is NavigationCard => Boolean(card));
      if (ordered.length === event.cardIds.length) state.hands.journal = ordered;
      state.phase = "navigator_nav";
      return;
    }
    case "navigation.chosen": {
      const kept = state.hands.journal.find((card) => card.id === event.cardId);
      const discarded = state.hands.journal.find((card) => card.id === event.discardedCardId);
      if (discarded) state.hands.discardPile.push(discarded);
      state.hands.journal = kept ? [kept] : [];
      return;
    }
    case "navigation.revealed": {
      const card = state.hands.journal.find((c) => c.id === event.cardId) ?? state.lastRevealedCard;
      if (card) {
        state.lastRevealedCard = card;
        state.hands.resumePile.push(card);
        const captainId = state.offices.captainId;
        if (captainId && state.players[captainId]) {
          state.players[captainId]!.resumeCount += 1;
        }
      }
      state.hands.journal = [];
      if (card?.effect === "cult_uprising") state.pendingCultRitual = true;
      return;
    }
    case "navigation.jumped": {
      const player = state.players[event.playerId];
      if (player) player.dead = true;
      for (const card of state.hands.journal) state.hands.discardPile.push(card);
      state.hands.journal = [];
      state.emergencyVoyage = true;
      state.phase = "emergency_navigator";
      return;
    }
    case "ship.moved": {
      state.ship.x = event.to.x;
      state.ship.y = event.to.y;
      clearNavHands(state);
      const winner = getWinner(state.ship.x, state.ship.y, state.voyageMode);
      if (winner) {
        state.winner = winner;
        state.phase = "ended";
      }
      return;
    }
    case "map.triggered": {
      delete state.mapActions[event.cell];
      return;
    }
    case "map.cabin_search": {
      const target = state.players[event.targetId];
      if (target) {
        target.conversionImmune = true;
        state.cabinSearch = {
          captainId: event.captainId,
          targetId: event.targetId,
          faction: target.faction,
        };
      }
      return;
    }
    case "map.feed_kraken": {
      const target = state.players[event.targetId];
      if (target) {
        target.dead = true;
        if (target.role === "cult_leader") {
          state.winner = "cult";
          state.phase = "ended";
        }
      }
      return;
    }
    case "map.flogging": {
      const target = state.players[event.targetId];
      if (target) {
        target.conversionImmune = true;
        if (!target.notFactions.includes(event.notFaction)) {
          target.notFactions.push(event.notFaction);
        }
      }
      return;
    }
    case "map.tongue": {
      const target = state.players[event.targetId];
      if (target) target.muted = true;
      return;
    }
    case "supply.crossed": {
      state.supplyLineCrossed = true;
      for (const id of state.seats) {
        const player = state.players[id];
        if (player && !player.dead && player.guns < INITIAL_GUNS) {
          player.guns = INITIAL_GUNS;
        }
      }
      return;
    }
    case "effect.drunk": {
      state.offices = { captainId: event.toCaptainId };
      return;
    }
    case "effect.disarm": {
      const player = state.players[event.playerId];
      if (player && player.guns > 0) player.guns -= 1;
      return;
    }
    case "effect.armed": {
      const player = state.players[event.playerId];
      if (player) player.guns += 1;
      return;
    }
    case "effect.mermaid": {
      state.mermaidViewerId = event.viewerId;
      state.mermaidCards = event.cardIds
        .map((id) => state.hands.discardPile.find((card) => card.id === id))
        .filter((card): card is NavigationCard => Boolean(card));
      state.phase = "effect_mermaid";
      return;
    }
    case "effect.telescope": {
      ensureDeckHasCards(state, 1);
      const [card] = takeCardsFromDeck(state, [event.cardId]);
      state.telescopeViewerId = event.viewerId;
      state.telescopeCard = card;
      state.phase = "effect_telescope_decide";
      return;
    }
    case "effect.telescope_resolved": {
      if (state.telescopeCard) {
        if (event.discarded) state.hands.discardPile.push(state.telescopeCard);
        else state.hands.deck.unshift(state.telescopeCard);
      }
      state.telescopeCard = undefined;
      state.telescopeViewerId = undefined;
      return;
    }
    case "ritual.drawn": {
      state.lastCultRitual = event.ritual;
      state.pendingCultRitual = false;
      const index = state.cultRitualDeck.indexOf(event.ritual);
      if (index >= 0) state.cultRitualDeck.splice(index, 1);
      return;
    }
    case "ritual.converted": {
      const target = state.players[event.targetId];
      if (target) {
        target.faction = "cult";
        target.role = "cultist";
      }
      return;
    }
    case "ritual.guns": {
      for (const grant of event.grants) {
        const player = state.players[grant.playerId];
        if (player) player.guns += grant.guns;
      }
      return;
    }
    case "ritual.cabin_shown": {
      state.cultCabinReveal = {
        captain: state.offices.captainId ? state.players[state.offices.captainId]?.faction : undefined,
        firstMate: state.offices.firstMateId ? state.players[state.offices.firstMateId]?.faction : undefined,
        navigator: state.offices.navigatorId ? state.players[state.offices.navigatorId]?.faction : undefined,
      };
      state.phase = "ritual_cabin";
      return;
    }
    case "phase.set": {
      state.phase = event.phase;
      return;
    }
    case "offduty.set": {
      state.offDuty = [...event.playerIds];
      return;
    }
    case "round.advanced": {
      state.offices = { captainId: event.captainId };
      state.roundNo = event.roundNo;
      clearNavHands(state);
      clearEphemeral(state);
      state.emergencyVoyage = false;
      state.phase = "officers";
      return;
    }
    case "emergency.navigator": {
      state.offices.navigatorId = event.navigatorId;
      state.phase = "captain_nav";
      return;
    }
    case "game.ended": {
      state.winner = event.winner;
      state.phase = "ended";
      return;
    }
    case "room.closed": {
      state.phase = "ended";
      return;
    }
  }
}

export function resolveOffDutyPlayerIds(state: GameState): PlayerId[] {
  const offices = offDutyOffices(state.seats.length);
  const ids: PlayerId[] = [];
  for (const office of offices) {
    if (office === "captain" && state.offices.captainId) ids.push(state.offices.captainId);
    if (office === "firstMate" && state.offices.firstMateId) ids.push(state.offices.firstMateId);
    if (office === "navigator" && state.offices.navigatorId) ids.push(state.offices.navigatorId);
  }
  return [...new Set(ids)].filter((id) => state.players[id] && !state.players[id]!.dead);
}

/** 醉酒：顺时针找简历最少且可任船长者（跳过出局/割舌）。 */
export function nextDrunkCaptainId(state: GameState): PlayerId {
  const seats = state.seats;
  const current = state.offices.captainId;
  const start = current ? seats.indexOf(current) : 0;
  let best: PlayerId | undefined;
  let bestResumes = Number.POSITIVE_INFINITY;
  for (let offset = 1; offset <= seats.length; offset += 1) {
    const id = seats[(start + offset) % seats.length]!;
    const player = state.players[id];
    if (!player || player.dead || player.muted) continue;
    if (player.resumeCount < bestResumes) {
      bestResumes = player.resumeCount;
      best = id;
    }
  }
  return best ?? current ?? seats[0]!;
}

export function mapActionAt(state: GameState, x: number, y: number) {
  return state.mapActions[cellKey(x, y)];
}

function applyKeep(hand: NavigationCard[], state: GameState, keptCardId: CardId, discardedCardId: CardId) {
  const kept = hand.find((card) => card.id === keptCardId);
  const discarded = hand.find((card) => card.id === discardedCardId);
  if (discarded) state.hands.discardPile.push(discarded);
  if (kept) state.hands.journal.push(kept);
}

function takeCardsFromDeck(state: GameState, cardIds: CardId[]) {
  const drawn: NavigationCard[] = [];
  for (const cardId of cardIds) {
    const index = state.hands.deck.findIndex((card) => card.id === cardId);
    if (index < 0) throw new Error(`Deck missing card ${cardId}`);
    drawn.push(...state.hands.deck.splice(index, 1));
  }
  return drawn;
}

function clearNavHands(state: GameState) {
  state.hands.captainHand = [];
  state.hands.mateHand = [];
  state.hands.journal = [];
}

function clearEphemeral(state: GameState) {
  state.cabinSearch = undefined;
  state.mermaidViewerId = undefined;
  state.mermaidCards = undefined;
  state.telescopeViewerId = undefined;
  state.telescopeCard = undefined;
  state.cultCabinReveal = undefined;
}
