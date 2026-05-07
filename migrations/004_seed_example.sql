-- Migration 004: Optional seed data for UI testing
-- Run as: mysql -u claude -p claude_logs < migrations/004_seed_example.sql
-- Skip this file in production — it inserts fake data only for local UI verification.

USE claude_logs;

INSERT IGNORE INTO cc_sessions (session_id, started_at, last_seen_at, cwd, project_dir)
VALUES
  ('example-session-001', NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 1 HOUR,
   '/Users/dev/projects/my-app', '/Users/dev/projects/my-app'),
  ('example-session-002', NOW() - INTERVAL 1 DAY,  NOW() - INTERVAL 23 HOUR,
   '/Users/dev/projects/my-app', '/Users/dev/projects/my-app');

INSERT IGNORE INTO cc_events
  (session_id, timestamp, event_type, agent, role, content, tool_name, is_error,
   model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens)
VALUES
  ('example-session-001', NOW() - INTERVAL 2 HOUR,   'SessionStart',     'main', NULL, NULL,         NULL,   0, NULL, NULL, NULL, NULL, NULL, NULL),
  ('example-session-001', NOW() - INTERVAL 110 MINUTE, 'UserPromptSubmit', 'main', 'user', 'Hello, can you help me build a REST API?', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL),
  ('example-session-001', NOW() - INTERVAL 108 MINUTE, 'PreToolUse',       'main', NULL, NULL, 'Read',   0, NULL, NULL, NULL, NULL, NULL, NULL),
  ('example-session-001', NOW() - INTERVAL 107 MINUTE, 'PostToolUse',      'main', NULL, NULL, 'Read',   0, NULL, NULL, NULL, NULL, NULL, NULL),
  ('example-session-001', NOW() - INTERVAL 105 MINUTE, 'PreToolUse',       'main', NULL, NULL, 'Write',  0, NULL, NULL, NULL, NULL, NULL, NULL),
  ('example-session-001', NOW() - INTERVAL 104 MINUTE, 'PostToolUse',      'main', NULL, NULL, 'Write',  0, NULL, NULL, NULL, NULL, NULL, NULL),
  ('example-session-001', NOW() - INTERVAL 100 MINUTE, 'Stop',             'main', 'assistant', 'I have created the REST API skeleton for you.', NULL, 0,
   'claude-sonnet-4-6', 1200, 4500, 8000, 32000, 45700),
  ('example-session-002', NOW() - INTERVAL 1 DAY,     'SessionStart',     'main', NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL),
  ('example-session-002', NOW() - INTERVAL 1 DAY + INTERVAL 5 MINUTE, 'UserPromptSubmit', 'main', 'user', 'Fix the failing tests', NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL),
  ('example-session-002', NOW() - INTERVAL 1 DAY + INTERVAL 7 MINUTE, 'PreToolUse', 'main', NULL, NULL, 'Bash', 0, NULL, NULL, NULL, NULL, NULL, NULL),
  ('example-session-002', NOW() - INTERVAL 1 DAY + INTERVAL 8 MINUTE, 'PostToolUse', 'main', NULL, NULL, 'Bash', 1, NULL, NULL, NULL, NULL, NULL, NULL),
  ('example-session-002', NOW() - INTERVAL 23 HOUR, 'Stop', 'main', 'assistant', 'Tests are now passing.', NULL, 0,
   'claude-sonnet-4-6', 800, 2100, 5000, 18000, 25900);

UPDATE cc_events SET error_message = 'Command exited with code 1'
WHERE session_id = 'example-session-002' AND event_type = 'PostToolUse' AND tool_name = 'Bash';
