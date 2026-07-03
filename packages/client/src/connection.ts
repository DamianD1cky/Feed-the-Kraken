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
    if (!message.sessionToken.includes("hidden") && !message.reconnectToken.includes("hidden")) {
      localStorage.setItem(storageKey(message.roomId), JSON.stringify(message));
    }
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

function readStoredSession(roomId: string) {
  const raw = localStorage.getItem(storageKey(roomId));
  if (!raw) return {};
  try {
    const session = JSON.parse(raw) as StoredSession;
    return {
      playerId: session.playerId,
      sessionToken: session.sessionToken,
      reconnectToken: session.reconnectToken,
    };
  } catch {
    return {};
  }
}
