import { getWinner, type GameEvent, type GameState } from "@feed/shared";

export function reduceGameEvent(state: GameState, event: GameEvent) {
  switch (event.type) {
    case "player.joined": {
      return;
    }
    case "session.reconnected": {
      const player = state.players[event.playerId];
      if (player) player.connected = true;
      return;
    }
    case "game.started": {
      state.phase = "officers";
      state.roundNo = 1;
      state.offices.captainId = state.seats[0];
      state.votes = {};
      return;
    }
    case "officers.assigned": {
      state.offices.firstMateId = event.firstMateId;
      state.offices.navigatorId = event.navigatorId;
      state.phase = "vote";
      state.votes = {};
      return;
    }
    case "vote.committed": {
      state.votes[event.playerId] = event.guns;
      const player = state.players[event.playerId];
      if (player) player.guns = Math.max(0, player.guns - event.guns);
      return;
    }
    case "vote.resolved": {
      state.phase = event.passed ? "navigation" : "officers";
      state.votes = {};
      if (!event.passed) rotateCaptain(state);
      return;
    }
    case "destination.drawn": {
      return;
    }
    case "destination.chosen": {
      return;
    }
    case "ship.moved": {
      state.ship.x = event.to.x;
      state.ship.y = event.to.y;
      const winner = getWinner(state.ship.x, state.ship.y);
      if (winner) {
        state.winner = winner;
        state.phase = "ended";
      }
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

export function rotateCaptain(state: GameState) {
  const currentCaptain = state.offices.captainId;
  const currentIndex = currentCaptain ? state.seats.indexOf(currentCaptain) : -1;
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % state.seats.length : 0;
  state.offices = { captainId: state.seats[nextIndex] };
  state.roundNo += 1;
  state.hands.navigatorHand = [];
}
