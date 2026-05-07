-- Migration 003: Create cc_events table
-- Run as: mysql -u claude -p claude_logs < migrations/003_create_events.sql

USE claude_logs;

CREATE TABLE IF NOT EXISTS cc_events (
  id                    BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  session_id            VARCHAR(255)     NOT NULL,
  timestamp             DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Event classification
  event_type            VARCHAR(64)      NOT NULL,
  agent                 VARCHAR(64)      NULL,
  role                  VARCHAR(32)      NULL,

  -- Content
  content               MEDIUMTEXT       NULL,
  tool_name             VARCHAR(255)     NULL,
  tool_input            JSON             NULL,
  tool_output           JSON             NULL,

  -- Error tracking
  is_error              TINYINT(1)       NOT NULL DEFAULT 0,
  error_message         TEXT             NULL,

  -- Raw hook payload
  raw_payload           JSON             NULL,
  transcript_path       VARCHAR(1024)    NULL,

  -- Token usage (populated on Stop / SubagentStop events)
  model                 VARCHAR(128)     NULL,
  input_tokens          INT UNSIGNED     NULL,
  output_tokens         INT UNSIGNED     NULL,
  cache_creation_tokens INT UNSIGNED     NULL,
  cache_read_tokens     INT UNSIGNED     NULL,
  total_tokens          INT UNSIGNED     NULL,

  -- Tool performance (populated on PostToolUse events)
  duration_ms           INT UNSIGNED     NULL,

  PRIMARY KEY (id),

  -- Foreign key to sessions
  CONSTRAINT fk_events_session
    FOREIGN KEY (session_id) REFERENCES cc_sessions (session_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  -- Query-optimised indexes
  INDEX idx_session_id              (session_id),
  INDEX idx_timestamp               (timestamp),
  INDEX idx_event_type              (event_type),
  INDEX idx_tool_name               (tool_name),
  INDEX idx_is_error                (is_error),
  INDEX idx_session_timestamp       (session_id, timestamp),
  INDEX idx_event_type_tool         (event_type, tool_name),
  INDEX idx_is_error_timestamp      (is_error, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
