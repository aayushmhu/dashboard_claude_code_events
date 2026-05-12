-- SQLite schema for Claude Code Dashboard
-- Run: sqlite3 ~/.claude/dashboard.db < migrations/sqlite/001_schema.sql

CREATE TABLE IF NOT EXISTS cc_sessions (
  session_id   TEXT NOT NULL PRIMARY KEY,
  started_at   TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  cwd          TEXT,
  project_dir  TEXT,
  model        TEXT,
  source       TEXT DEFAULT 'claude-code'
);

CREATE TABLE IF NOT EXISTS cc_events (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id            TEXT    NOT NULL,
  timestamp             TEXT    DEFAULT (datetime('now')),
  event_type            TEXT    NOT NULL,
  agent                 TEXT,
  role                  TEXT,
  content               TEXT,
  tool_name             TEXT,
  tool_input            TEXT,   -- JSON stored as TEXT
  tool_output           TEXT,   -- JSON stored as TEXT
  is_error              INTEGER DEFAULT 0,
  error_message         TEXT,
  raw_payload           TEXT,   -- JSON stored as TEXT
  transcript_path       TEXT,
  model                 TEXT,
  input_tokens          INTEGER DEFAULT 0,
  output_tokens         INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens     INTEGER DEFAULT 0,
  total_tokens          INTEGER DEFAULT 0,
  duration_ms           INTEGER,
  entrypoint            TEXT,
  git_branch            TEXT,
  stop_reason           TEXT,
  has_thinking          INTEGER DEFAULT 0,
  source                TEXT    DEFAULT 'claude-code'
);

CREATE INDEX IF NOT EXISTS idx_events_session   ON cc_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_time      ON cc_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_type      ON cc_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_errors    ON cc_events(is_error);

CREATE TABLE IF NOT EXISTS cc_transcript_records (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id            TEXT    NOT NULL,
  record_index          INTEGER NOT NULL,
  record_type           TEXT    NOT NULL,
  record_subtype        TEXT,
  parent_uuid           TEXT,
  uuid                  TEXT,
  timestamp             TEXT,
  content_text          TEXT,
  content_image         BLOB,
  image_media_type      TEXT,
  model                 TEXT,
  entrypoint            TEXT,
  git_branch            TEXT,
  permission_mode       TEXT,
  stop_reason           TEXT,
  is_sidechain          INTEGER DEFAULT 0,
  input_tokens          INTEGER DEFAULT 0,
  output_tokens         INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens     INTEGER DEFAULT 0,
  is_rejection          INTEGER DEFAULT 0,
  is_error              INTEGER DEFAULT 0,
  UNIQUE (session_id, record_index)
);

CREATE INDEX IF NOT EXISTS idx_tr_session       ON cc_transcript_records(session_id);
CREATE INDEX IF NOT EXISTS idx_tr_type          ON cc_transcript_records(record_type, record_subtype);
CREATE INDEX IF NOT EXISTS idx_tr_timestamp     ON cc_transcript_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_tr_session_order ON cc_transcript_records(session_id, record_index);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT    NOT NULL,
  display_name    TEXT,
  cwd             TEXT    NOT NULL,
  permission_mode TEXT    DEFAULT 'default',
  model           TEXT,
  total_cost_usd  REAL    DEFAULT 0,
  total_turns     INTEGER DEFAULT 0,
  created_at      TEXT    DEFAULT (datetime('now')),
  last_active_at  TEXT    DEFAULT (datetime('now')),
  is_active       INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_active  ON chat_sessions(is_active, last_active_at);
