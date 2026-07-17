import { Client, type Room } from "@colyseus/sdk";
import { PROTOCOL_VERSION, type ClientAction, type ClientActionEnvelope, type ServerMessage } from "@feed/shared";
import { useAppStore } from "./store";

const STORAGE_KEY = "feed-the-kraken-session";

type StoredSession = Extract<ServerMessage, { type: "session.established" }>;

function endpoint() {
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const host = location.hostname;
  return `${protocol}//${host}:2567`;
}

export async function createGameRoom(nickname: string) {
  const client = new Client(endpoint());
  const room = await client.create("kraken", { nickname });
  attachRoom(room);
  requestResync(room);
  return room;
}

export async function joinGameRoom(roomId: string, nickname: string, mode: "new-player" | "reconnect" = "new-player") {
  const client = new Client(endpoint());
  const trimmedRoomId = roomId.trim();

  if (mode === "reconnect") {
    const stored = readFullStoredSession(trimmedRoomId);
    if (!stored?.playerId || !stored.sessionToken || !stored.reconnectToken) {
      throw new Error("本标签页没有该房间的可恢复会话。请用原先进入游戏的标签页点「恢复上次身份」，或作为新玩家加入（仅大厅阶段）。");
    }
    const room = await client.joinById(trimmedRoomId, {
      nickname,
      playerId: stored.playerId,
      sessionToken: stored.sessionToken,
      reconnectToken: stored.reconnectToken,
    });
    attachRoom(room);
    // 重连不再下发 session.established，需从本地恢复，否则无法发动作。
    useAppStore.getState().setSession(stored);
    requestResync(room);
    return room;
  }

  const room = await client.joinById(trimmedRoomId, { nickname });
  attachRoom(room);
  requestResync(room);
  return room;
}

export function sendAction(action: ClientAction) {
  const { room, session } = useAppStore.getState();
  if (!room || !session) return;
  const envelope: ClientActionEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    actionId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    roomId: session.roomId,
    playerId: session.playerId,
    action,
    sentAt: Date.now(),
  };
  room.send("action", envelope);
}

function requestResync(room: Room) {
  // join 完成前服务端可能已推送 view；监听器挂上后补拉一次，避免卡在大厅。
  try {
    room.send("resync");
  } catch {
    // room may already be closing
  }
}

function attachRoom(room: Room) {
  const store = useAppStore.getState();
  store.setRoom(room);
  store.setError(undefined);

  room.onMessage("session.established", (message: StoredSession) => {
    store.setSession(message);
    writeStoredSession(message);
  });
  room.onMessage("view.updated", (message: Extract<ServerMessage, { type: "view.updated" }>) => {
    useAppStore.getState().setView(message.view);
    useAppStore.getState().setError(undefined);
  });
  room.onMessage("action.rejected", (message: Extract<ServerMessage, { type: "action.rejected" }>) => {
    useAppStore.getState().setError(message.reason);
  });
  room.onMessage("room.closed", (message: Extract<ServerMessage, { type: "room.closed" }>) => {
    useAppStore.getState().setError(`房间已关闭：${message.reason}`);
  });
  room.onLeave((code) => {
    const current = useAppStore.getState();
    // 若已有视图且只是短暂断开，保留视图并提示；完全未进房则只显示错误
    if (!current.view) {
      current.setError(`连接已断开：${code}。若正在恢复身份，请确认房间号与会话仍有效。`);
    } else {
      current.setError(`连接已断开：${code}。可返回大厅用「恢复上次身份」重连。`);
    }
  });
}

function storageKey(roomId: string) {
  return `${STORAGE_KEY}:${roomId}`;
}

/** Per-tab storage so multiple windows in one browser can join as different players. */
function writeStoredSession(message: StoredSession) {
  const payload = JSON.stringify(message);
  sessionStorage.setItem(storageKey(message.roomId), payload);
  localStorage.removeItem(storageKey(message.roomId));
}

function readFullStoredSession(roomId: string): StoredSession | undefined {
  const key = storageKey(roomId);
  const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
  if (!raw) return undefined;
  try {
    const session = JSON.parse(raw) as StoredSession;
    if (!session.playerId || !session.sessionToken || !session.reconnectToken) return undefined;
    if (session.sessionToken.includes("hidden") || session.reconnectToken.includes("hidden")) return undefined;
    if (session.roomId && session.roomId !== roomId) return undefined;
    return session;
  } catch {
    return undefined;
  }
}
