-- Migration 003: Create cc_events table
-- Run as: mysql -u claude -p claude_logs < migrations/003_create_events.sql

USE claude_logs;

CREATE TABLE IF NOT EXISTS cc_events (
  id                    BIGINT           NOT NULL AUTO_INCREMENT,
  session_id            VARCHAR(255)     NOT NULL,
  timestamp             TIMESTAMP(3)     NULL DEFAULT CURRENT_TIMESTAMP(3),

  -- Event classification
  event_type            VARCHAR(64)      NOT NULL,
  agent                 VARCHAR(128)     NULL,
  role                  VARCHAR(32)      NULL,

  -- Content
  content               LONGTEXT         NULL,
  tool_name             VARCHAR(128)     NULL,
  tool_input            JSON             NULL,
  tool_output           JSON             NULL,

  -- Error tracking
  is_error              TINYINT(1)       DEFAULT '0',
  error_message         TEXT             NULL,

  -- Raw hook payload
  raw_payload           JSON             NULL,
  transcript_path       TEXT             NULL,

  -- Token usage (populated on Stop / SubagentStop events)
  model                 VARCHAR(64)      NULL,
  input_tokens          INT              DEFAULT '0',
  output_tokens         INT              DEFAULT '0',
  cache_creation_tokens INT              DEFAULT '0',
  cache_read_tokens     INT              DEFAULT '0',
  total_tokens          INT              DEFAULT '0',

  -- Tool performance (populated on PostToolUse events)
  duration_ms           INT              NULL,

  PRIMARY KEY (id),
  KEY idx_session (session_id),
  KEY idx_time    (timestamp),
  KEY idx_type    (event_type),
  KEY idx_errors  (is_error)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
