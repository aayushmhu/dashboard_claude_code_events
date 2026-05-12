import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Type alias matching mysql2's RowDataPacket (index signature with any for compatibility).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RowDataPacket = Record<string, any>;

const oldDbPath = path.join(os.homedir(), '.claude', 'dashboard.db');
const defaultDbPath = path.join(os.homedir(), '.claude-dashboard', 'dashboard.db');
const dbPath = process.env.DB_PATH ?? defaultDbPath;

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Migrate from old location inside ~/.claude/ if needed
if (!fs.existsSync(dbPath) && fs.existsSync(oldDbPath)) {
  fs.renameSync(oldDbPath, dbPath);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── MySQL compatibility functions ─────────────────────────────────────────────

// SUBSTRING_INDEX(str, delim, count) — extract count-th segment
db.function('SUBSTRING_INDEX', (str: unknown, delim: unknown, count: unknown) => {
  if (str == null) return null;
  const s = String(str);
  const d = String(delim ?? '/');
  const c = Number(count ?? -1);
  if (!d) return s;
  const parts = s.split(d);
  if (c < 0) return parts.slice(c).join(d);
  return parts.slice(0, c).join(d);
});

// TIMESTAMPDIFF(unit, start, end) — returns integer diff
db.function('TIMESTAMPDIFF', (unit: unknown, start: unknown, end: unknown) => {
  if (!start || !end) return 0;
  const s = new Date(String(start)).getTime();
  const e = new Date(String(end)).getTime();
  switch (String(unit).toUpperCase()) {
    case 'SECOND': return Math.floor((e - s) / 1000);
    case 'MINUTE': return Math.floor((e - s) / 60000);
    case 'HOUR':   return Math.floor((e - s) / 3600000);
    case 'DAY':    return Math.floor((e - s) / 86400000);
    default:       return Math.floor((e - s) / 1000);
  }
});

// JSON_LENGTH(json) — length of JSON array or object
db.function('JSON_LENGTH', (json: unknown) => {
  if (!json) return 0;
  try {
    const parsed = JSON.parse(String(json));
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object') return Object.keys(parsed).length;
    return 0;
  } catch { return 0; }
});

// ── Thin async wrapper matching mysql2 pool.query signature ───────────────────
// Returns [rows, null] so existing `const [rows] = await pool.query(...)` and
// `const [[row]] = await pool.query(...)` destructuring keeps working unchanged.

export const pool = {
  query: async <T = RowDataPacket[]>(
    sql: string,
    params?: unknown[],
  ): Promise<[T, null]> => {
    const stmt = db.prepare(sql);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (params && params.length > 0
      ? stmt.all(params as any[])
      : stmt.all()) as unknown as T;
    return [rows, null];
  },
};

export default pool;
