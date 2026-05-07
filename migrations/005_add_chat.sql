-- Add source column to track dashboard-initiated vs IDE sessions
ALTER TABLE cc_events
  ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'claude-code' AFTER duration_ms;

ALTER TABLE cc_sessions
  ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'claude-code' AFTER model;

-- Chat sessions table for dashboard-initiated Claude Code sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id      VARCHAR(255) NOT NULL,
    display_name    VARCHAR(255),
    cwd             TEXT NOT NULL,
    permission_mode VARCHAR(32) DEFAULT 'default',
    model           VARCHAR(64),
    total_cost_usd  DECIMAL(10,6) DEFAULT 0,
    total_turns     INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active       BOOLEAN DEFAULT TRUE,
    INDEX idx_chat_session (session_id),
    INDEX idx_chat_active  (is_active, last_active_at)
) ENGINE=InnoDB;
