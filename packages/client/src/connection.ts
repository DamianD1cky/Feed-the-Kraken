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
  return room;
}

export async function joinGameRoom(roomId: string, nickname: string, mode: "new-player" | "reconnect" = "new-player") {
  const client = new Client(endpoint());
  const stored = mode === "reconnect" ? readStoredSession(roomId) : {};
  const room = await client.joinById(roomId, { nickname, ...stored });
  attachRoom(room);
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
  });
  room.onMessage("action.rejected", (message: Extract<ServerMessage, { type: "action.rejected" }>) => {
    useAppStore.getState().setError(message.reason);
  });
  room.onMessage("room.closed", (message: Extract<ServerMessage, { type: "room.closed" }>) => {
    useAppStore.getState().setError(`房间已关闭：${message.reason}`);
  });
  room.onLeave((code) => {
    useAppStore.getState().setError(`连接已断开：${code}`);
  });
}

function storageKey(roomId: string) {
  return `${STORAGE_KEY}:${roomId}`;
}

/** Per-tab storage so multiple windows in one browser can join as different players. */
function writeStoredSession(message: StoredSession) {
  const payload = JSON.stringify(message);
  sessionStorage.setItem(storageKey(message.roomId), payload);
  // Clear legacy shared storage that caused multi-tab identity collisions.
  localStorage.removeItem(storageKey(message.roomId));
}

function readStoredSession(roomId: string) {
  const key = storageKey(roomId);
  const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
  if (!raw) return {};
  try {
    const session = JSON.parse(raw) as StoredSession;
    if (!session.playerId || !session.sessionToken || !session.reconnectToken) return {};
    if (session.sessionToken.includes("hidden") || session.reconnectToken.includes("hidden")) return {};
    return {
      playerId: session.playerId,
      sessionToken: session.sessionToken,
      reconnectToken: session.reconnectToken,
    };
  } catch {
    return {};
  }
}
