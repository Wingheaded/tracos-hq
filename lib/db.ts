import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  author TEXT NOT NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('human', 'agent')),
  content TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by TEXT,
  decided_by TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name TEXT,
  supplier_nif TEXT,
  invoice_number TEXT,
  issue_date TEXT,
  net_amount REAL,
  vat_amount REAL,
  total_amount REAL,
  category TEXT,
  file_path TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_id TEXT,
  company TEXT,
  website TEXT,
  city TEXT,
  sector TEXT,
  why_it_fits TEXT,
  segments TEXT,
  general_contact TEXT,
  source_url TEXT,
  status TEXT
);

CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  fallback INTEGER NOT NULL DEFAULT 0,
  message_id INTEGER
);
`;

const globalForDb = globalThis as unknown as { sqlite?: Database.Database };

export function getDb() {
  if (globalForDb.sqlite) {
    globalForDb.sqlite.exec(SCHEMA);
    return globalForDb.sqlite;
  }

  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(path.join(dir, "app.db"));
  db.pragma("journal_mode = WAL");
  globalForDb.sqlite = db;
  db.exec(SCHEMA);
  return db;
}
