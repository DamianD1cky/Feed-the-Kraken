import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import type { GameEvent } from "@feed/shared";

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): void };
};

type DatabaseConstructor = new (path: string) => SqliteDatabase;

export type EventStore = {
  append(roomId: string, event: GameEvent, actionId?: string, playerId?: string): void;
};

export function createEventStore(databasePath = process.env.DATABASE_PATH ?? "./data/kraken.sqlite"): EventStore {
  mkdirSync(dirname(databasePath), { recursive: true });
  const require = createRequire(import.meta.url);
  try {
    const Database = require("better-sqlite3") as DatabaseConstructor;
    const db = new Database(databasePath);
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
      CREATE INDEX IF NOT EXISTS idx_match_events_room_seq ON match_events(room_id, seq);
    `);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO match_events (room_id, seq, action_id, player_id, type, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return {
      append(roomId, event, actionId, playerId) {
        insert.run(roomId, event.seq, actionId ?? null, playerId ?? null, event.type, JSON.stringify(event), event.at);
      },
    };
  } catch (error) {
    const fallbackPath = join(dirname(databasePath), "events.jsonl");
    console.warn("SQLite unavailable, falling back to JSONL event log", error);
    return {
      append(roomId, event, actionId, playerId) {
        appendFileSync(fallbackPath, JSON.stringify({ roomId, actionId, playerId, event }) + "\n");
      },
    };
  }
}
