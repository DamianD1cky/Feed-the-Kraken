import type { GameEvent, GameState, PlayerId } from "@feed/shared";
import { reduceGameEvent } from "../engine/reducer.js";
import type { SessionRecord } from "../session/tokens.js";
import type { EventStore } from "./eventStore.js";

export type RestoredRoom = {
  game: GameState;
  events: GameEvent[];
  nextSeq: number;
  sessions: Map<PlayerId, SessionRecord>;
  acceptedActionKeys: Set<string>;
};

export function restoreRoom(
  store: EventStore,
  roomId: string,
  now = Date.now(),
): RestoredRoom | undefined {
  if (
    !store.loadSnapshot ||
    !store.loadEvents ||
    !store.loadSessions ||
    !store.loadAcceptedActionKeys
  ) {
    throw new Error("当前事件存储不支持房间恢复。");
  }

  const snapshot = store.loadSnapshot(roomId);
  if (!snapshot) return undefined;
  if (snapshot.roomId !== roomId || snapshot.state.roomId !== roomId) {
    throw new Error(`房间 ${roomId} 的快照标识不一致。`);
  }

  const events = store.loadEvents(roomId);
  const game = structuredClone(snapshot.state);
  const pendingEvents = events.filter((event) => event.seq > snapshot.seq);
  let expectedSeq = snapshot.seq + 1;
  for (const event of pendingEvents) {
    if (event.seq !== expectedSeq) {
      throw new Error(
        `房间 ${roomId} 事件序列不连续：期望 ${expectedSeq}，实际 ${event.seq}。`,
      );
    }
    reduceGameEvent(game, event);
    expectedSeq += 1;
  }

  // 进程重启后旧 WebSocket 均已失效；玩家需凭持久会话重新连接。
  for (const player of Object.values(game.players)) player.connected = false;

  const sessions = new Map(
    store.loadSessions(roomId, now).map((session) => [session.playerId, session]),
  );
  const acceptedActionKeys = new Set(
    store
      .loadAcceptedActionKeys(roomId)
      .map(({ playerId, actionId }) => actionKey(playerId, actionId)),
  );
  const lastSeq = events.at(-1)?.seq ?? snapshot.seq;

  return {
    game,
    events,
    nextSeq: lastSeq + 1,
    sessions,
    acceptedActionKeys,
  };
}

export function actionKey(playerId: PlayerId, actionId: string) {
  return `${playerId}:${actionId}`;
}
