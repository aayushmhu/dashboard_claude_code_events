-- Migration 002: Create cc_sessions table
-- Run as: mysql -u claude -p claude_logs < migrations/002_create_sessions.sql

USE claude_logs;

CREATE TABLE IF NOT EXISTS cc_sessions (
  session_id   VARCHAR(255) NOT NULL,
  started_at   TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  cwd          TEXT         NULL,
  project_dir  TEXT         NULL,
  model        VARCHAR(64)  NULL,

  PRIMARY KEY (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
