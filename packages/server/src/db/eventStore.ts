import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { GameEvent, GameState, PlayerId } from "@feed/shared";
import type { SessionRecord } from "../session/tokens.js";

export type RoomSnapshot = {
  roomId: string;
  seq: number;
  state: GameState;
  updatedAt: number;
};

export type AcceptedActionKey = {
  playerId: PlayerId;
  actionId: string;
};

export type EventStore = {
  append(roomId: string, event: GameEvent, actionId?: string, playerId?: string): void;
  /** 一个动作及所有派生事件作为一组提交。 */
  transaction?(work: () => void): void;
  registerRoom?(roomId: string, state: GameState): void;
  saveSnapshot?(roomId: string, seq: number, state: GameState): void;
  loadSnapshot?(roomId: string): RoomSnapshot | undefined;
  loadEvents?(roomId: string, afterSeq?: number): GameEvent[];
  listRecoverableRoomIds?(now?: number): string[];
  upsertSession?(roomId: string, session: SessionRecord): void;
  deleteSession?(roomId: string, playerId: PlayerId): void;
  loadSessions?(roomId: string, now?: number): SessionRecord[];
  loadAcceptedActionKeys?(roomId: string): AcceptedActionKey[];
  close?(): void;
};

type SnapshotRow = {
  room_id: string;
  snapshot_seq: number;
  snapshot_payload: string;
  updated_at: number;
};

type EventRow = { payload: string };

type SessionRow = {
  player_id: string;
  session_token_hash: string;
  reconnect_token_hash: string;
  expires_at: number;
};

type ActionRow = { player_id: string; action_id: string };

let sharedStore: EventStore | undefined;

export function getEventStore() {
  return sharedStore ??= createEventStore();
}

export function createEventStore(
  databasePath = process.env.DATABASE_PATH ?? "./data/kraken.sqlite",
): EventStore {
  mkdirSync(dirname(databasePath), { recursive: true });

  // SQLite 是可恢复牌局的硬依赖。初始化失败必须阻止服务启动，不能静默降级。
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS match_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      action_id TEXT,
      player_id TEXT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (room_id, seq),
      UNIQUE (room_id, player_id, action_id)
    );
    CREATE INDEX IF NOT EXISTS idx_match_events_room_seq
      ON match_events(room_id, seq);

    CREATE TABLE IF NOT EXISTS game_rooms (
      room_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
      snapshot_seq INTEGER NOT NULL DEFAULT 0,
      snapshot_payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_game_rooms_status_updated
      ON game_rooms(status, updated_at);

    CREATE TABLE IF NOT EXISTS player_sessions (
      room_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      session_token_hash TEXT NOT NULL,
      reconnect_token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, player_id),
      FOREIGN KEY (room_id) REFERENCES game_rooms(room_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_player_sessions_expiry
      ON player_sessions(room_id, expires_at);
  `);

  const insertEvent = db.prepare(`
    INSERT INTO match_events
      (room_id, seq, action_id, player_id, type, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRoom = db.prepare(`
    INSERT INTO game_rooms
      (room_id, status, snapshot_seq, snapshot_payload, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?, ?)
    ON CONFLICT(room_id) DO NOTHING
  `);
  const saveRoomSnapshot = db.prepare(`
    INSERT INTO game_rooms
      (room_id, status, snapshot_seq, snapshot_payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(room_id) DO UPDATE SET
      status = excluded.status,
      snapshot_seq = excluded.snapshot_seq,
      snapshot_payload = excluded.snapshot_payload,
      updated_at = excluded.updated_at
  `);
  const selectSnapshot = db.prepare(`
    SELECT room_id, snapshot_seq, snapshot_payload, updated_at
    FROM game_rooms
    WHERE room_id = ?
  `);
  const selectEvents = db.prepare(`
    SELECT payload
    FROM match_events
    WHERE room_id = ? AND seq > ?
    ORDER BY seq ASC
  `);
  const selectRecoverableRooms = db.prepare(`
    SELECT room_id
    FROM game_rooms
    WHERE status = 'active'
      AND EXISTS (
        SELECT 1 FROM player_sessions
        WHERE player_sessions.room_id = game_rooms.room_id
          AND player_sessions.expires_at > ?
      )
    ORDER BY updated_at ASC
  `);
  const upsertSessionStatement = db.prepare(`
    INSERT INTO player_sessions
      (room_id, player_id, session_token_hash, reconnect_token_hash, expires_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(room_id, player_id) DO UPDATE SET
      session_token_hash = excluded.session_token_hash,
      reconnect_token_hash = excluded.reconnect_token_hash,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `);
  const deleteSessionStatement = db.prepare(`
    DELETE FROM player_sessions WHERE room_id = ? AND player_id = ?
  `);
  const selectSessions = db.prepare(`
    SELECT player_id, session_token_hash, reconnect_token_hash, expires_at
    FROM player_sessions
    WHERE room_id = ? AND expires_at > ?
    ORDER BY player_id ASC
  `);
  const selectAcceptedActionKeys = db.prepare(`
    SELECT player_id, action_id
    FROM match_events
    WHERE room_id = ? AND player_id IS NOT NULL AND action_id IS NOT NULL
    ORDER BY seq ASC
  `);

  return {
    transaction(work: () => void) {
      return db.transaction(work)();
    },
    registerRoom(roomId, state) {
      const now = Date.now();
      insertRoom.run(
        roomId,
        state.phase === "ended" ? "ended" : "active",
        JSON.stringify(state),
        now,
        now,
      );
    },
    append(roomId, event, actionId, playerId) {
      insertEvent.run(
        roomId,
        event.seq,
        actionId ?? null,
        playerId ?? null,
        event.type,
        JSON.stringify(event),
        event.at,
      );
    },
    saveSnapshot(roomId, seq, state) {
      const now = Date.now();
      saveRoomSnapshot.run(
        roomId,
        state.phase === "ended" ? "ended" : "active",
        seq,
        JSON.stringify(state),
        now,
        now,
      );
    },
    loadSnapshot(roomId) {
      const row = selectSnapshot.get(roomId) as SnapshotRow | undefined;
      if (!row) return undefined;
      return {
        roomId: row.room_id,
        seq: row.snapshot_seq,
        state: parseJson<GameState>(row.snapshot_payload, `房间 ${roomId} 快照`),
        updatedAt: row.updated_at,
      };
    },
    loadEvents(roomId, afterSeq = 0) {
      const rows = selectEvents.all(roomId, afterSeq) as EventRow[];
      return rows.map((row, index) =>
        parseJson<GameEvent>(row.payload, `房间 ${roomId} 事件 ${index + 1}`),
      );
    },
    listRecoverableRoomIds(now = Date.now()) {
      return (selectRecoverableRooms.all(now) as Array<{ room_id: string }>).map(
        (row) => row.room_id,
      );
    },
    upsertSession(roomId, session) {
      upsertSessionStatement.run(
        roomId,
        session.playerId,
        session.sessionTokenHash,
        session.reconnectTokenHash,
        session.expiresAt,
        Date.now(),
      );
    },
    deleteSession(roomId, playerId) {
      deleteSessionStatement.run(roomId, playerId);
    },
    loadSessions(roomId, now = Date.now()) {
      return (selectSessions.all(roomId, now) as SessionRow[]).map((row) => ({
        playerId: row.player_id,
        sessionTokenHash: row.session_token_hash,
        reconnectTokenHash: row.reconnect_token_hash,
        expiresAt: row.expires_at,
      }));
    },
    loadAcceptedActionKeys(roomId) {
      return (selectAcceptedActionKeys.all(roomId) as ActionRow[]).map((row) => ({
        playerId: row.player_id,
        actionId: row.action_id,
      }));
    },
    close() {
      db.close();
    },
  };
}

function parseJson<T>(payload: string, label: string): T {
  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    throw new Error(`${label} JSON 已损坏。`, { cause: error });
  }
}
