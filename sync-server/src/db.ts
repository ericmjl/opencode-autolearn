import { Database } from "bun:sqlite";
import path from "node:path";
import fs from "node:fs";

export type Db = Database;

export function openDb(dataDir: string): Db {
  let dbPath: string;
  if (dataDir === ":memory:") {
    dbPath = ":memory:";
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
    dbPath = path.join(dataDir, "sync.db");
  }
  const db = new Database(dbPath);
  // bun:sqlite has no .pragma() helper; set via exec. foreign_keys is
  // scoped to this connection (SQLite default), WAL persists in the db file.
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  initSchema(db);
  return db;
}

export function initSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id       TEXT PRIMARY KEY,
      api_key_hash  TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_store (
      user_id    TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      file_key   TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      nonce      TEXT NOT NULL,
      tag        TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, persona_id, file_key),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );
  `);
}
