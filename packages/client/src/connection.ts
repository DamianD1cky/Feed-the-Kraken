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
      throw new Error("本浏览器没有该房间的有效身份。请确认房间号，或作为新玩家加入（仅大厅阶段）。");
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
  const { room, session, connected } = useAppStore.getState();
  if (!room || !session || !connected) return;
  const envelope: ClientActionEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    actionId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    roomId: session.roomId,
    playerId: session.playerId,
    action,
    sentAt: Date.now(),
  };
  try {
    room.send("action", envelope);
  } catch {
    useAppStore.getState().setConnected(false);
    useAppStore.getState().setError("动作未发送，请恢复连接后重试。");
  }
}

export function leaveGameRoom() {
  const { room } = useAppStore.getState();
  useAppStore.getState().reset();
  void room?.leave().catch(() => undefined);
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
  const previous = store.room;
  if (previous && previous !== room) void previous.leave().catch(() => undefined);
  store.setRoom(room);
  store.setConnected(true);
  store.setError(undefined);

  room.onMessage("session.established", (message: StoredSession) => {
    if (useAppStore.getState().room !== room) return;
    store.setSession(message);
    writeStoredSession(message);
  });
  room.onMessage("view.updated", (message: Extract<ServerMessage, { type: "view.updated" }>) => {
    if (useAppStore.getState().room !== room) return;
    useAppStore.getState().setView(message.view);
    useAppStore.getState().setError(undefined);
  });
  room.onMessage("action.rejected", (message: Extract<ServerMessage, { type: "action.rejected" }>) => {
    if (useAppStore.getState().room !== room) return;
    useAppStore.getState().setError(message.reason);
  });
  room.onMessage("room.closed", (message: Extract<ServerMessage, { type: "room.closed" }>) => {
    if (useAppStore.getState().room !== room) return;
    useAppStore.getState().setConnected(false);
    useAppStore.getState().setError(`房间已关闭：${message.reason}`);
  });
  room.onLeave((code) => {
    const current = useAppStore.getState();
    if (current.room !== room) return;
    current.setConnected(false);
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

/**
 * sessionStorage 保持本地多标签联调时的身份隔离；
 * localStorage 保存每个房间最近使用的身份，使关闭页面后只输入房间号即可恢复。
 */
function writeStoredSession(message: StoredSession) {
  const payload = JSON.stringify(message);
  const key = storageKey(message.roomId);
  sessionStorage.setItem(key, payload);
  try {
    localStorage.setItem(key, payload);
  } catch {
    // 隐私模式或存储额度受限时，仍保留当前标签页的恢复能力。
  }
}

function readFullStoredSession(roomId: string): StoredSession | undefined {
  const key = storageKey(roomId);
  const tabSession = parseStoredSession(sessionStorage.getItem(key), roomId);
  if (tabSession) return tabSession;
  sessionStorage.removeItem(key);

  let persistedRaw: string | null = null;
  try {
    persistedRaw = localStorage.getItem(key);
  } catch {
    return undefined;
  }
  const persistedSession = parseStoredSession(persistedRaw, roomId);
  if (!persistedSession) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignored
    }
    return undefined;
  }
  sessionStorage.setItem(key, JSON.stringify(persistedSession));
  return persistedSession;
}

function parseStoredSession(raw: string | null, roomId: string): StoredSession | undefined {
  if (!raw) return undefined;
  try {
    const session = JSON.parse(raw) as StoredSession;
    if (!session.playerId || !session.sessionToken || !session.reconnectToken) return undefined;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) return undefined;
    if (session.sessionToken.includes("hidden") || session.reconnectToken.includes("hidden")) return undefined;
    if (session.roomId !== roomId) return undefined;
    return session;
  } catch {
    return undefined;
  }
}
