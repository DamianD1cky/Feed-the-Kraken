import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import type { GameEvent } from "@feed/shared";

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): void };
  transaction<T>(work: () => T): () => T;
};

type DatabaseConstructor = new (path: string) => SqliteDatabase;

export type EventStore = {
  append(roomId: string, event: GameEvent, actionId?: string, playerId?: string): void;
  /** 一个动作及所有派生事件作为一组提交。 */
  transaction?(work: () => void): void;
};

let sharedStore: EventStore | undefined;
export function getEventStore() {
  return sharedStore ??= createEventStore();
}

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
      INSERT INTO match_events (room_id, seq, action_id, player_id, type, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return {
      transaction(work) { db.transaction(work)(); },
      append(roomId, event, actionId, playerId) {
        insert.run(roomId, event.seq, actionId ?? null, playerId ?? null, event.type, JSON.stringify(event), event.at);
      },
    };
  } catch (error) {
    const fallbackPath = join(dirname(databasePath), "events.jsonl");
    console.warn("SQLite unavailable; using JSONL:", fallbackPath, error instanceof Error ? error.message.split("\n")[0] : error);
    let pendingLines: string[] | undefined;
    return {
      transaction(work) {
        if (pendingLines) throw new Error("Nested event transactions are not supported");
        pendingLines = [];
        try {
          work();
          if (pendingLines.length) appendFileSync(fallbackPath, pendingLines.join(""));
        } finally {
          pendingLines = undefined;
        }
      },
      append(roomId, event, actionId, playerId) {
        const line = JSON.stringify({ roomId, actionId, playerId, event }) + "\n";
        if (pendingLines) pendingLines.push(line);
        else appendFileSync(fallbackPath, line);
      },
    };
  }
}
