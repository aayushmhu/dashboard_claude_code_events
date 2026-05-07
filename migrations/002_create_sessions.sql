-- Migration 002: Create cc_sessions table
-- Run as: mysql -u claude -p claude_logs < migrations/002_create_sessions.sql

USE claude_logs;

CREATE TABLE IF NOT EXISTS cc_sessions (
  session_id   VARCHAR(255)  NOT NULL,
  started_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cwd          TEXT          NULL,
  project_dir  VARCHAR(1024) NULL,

  PRIMARY KEY (session_id),
  INDEX idx_project_dir  (project_dir(255)),
  INDEX idx_started_at   (started_at),
  INDEX idx_last_seen_at (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
