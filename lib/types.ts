export interface Session {
  session_id: string;
  started_at: string;
  last_seen_at: string;
  cwd: string;
  project_dir: string;
  project_name: string;
  event_count: number;
  error_count: number;
  tools_used: string[];
  duration_seconds: number;
  agent_types: string[];
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  model: string | null;
  models_used: string[];
  entrypoint: string | null;
  git_branch: string | null;
  thinking_count: number;
  image_count: number;
}

export interface Event {
  id: number;
  session_id: string;
  timestamp: string;
  event_type:
    | 'SessionStart'
    | 'UserPromptSubmit'
    | 'Stop'
    | 'SubagentStop'
    | 'PreToolUse'
    | 'PostToolUse'
    | 'Notification';
  agent: string;
  role: 'user' | 'assistant' | 'tool' | 'system' | null;
  content: string | null;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_output: Record<string, unknown> | null;
  is_error: boolean;
  error_message: string | null;
  raw_payload: Record<string, unknown>;
  transcript_path: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  total_tokens: number | null;
  notification_type: string | null;
  model: string | null;
}

export interface ProjectStats {
  project_dir: string;
  project_name: string;
  total_sessions: number;
  total_events: number;
  error_count: number;
  total_tokens: number;
  top_tool: string | null;
  last_active: string;
}

export interface ToolStats {
  tool_name: string;
  total_calls: number;
  error_count: number;
  error_rate: number;
  avg_output_size: number;
  last_used: string;
  avg_duration_ms: number;
  max_duration_ms: number;
}

export interface TokenTotals {
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  total_cost: number;
  cache_efficiency: number;
  first_event_at: string | null;
  last_event_at: string | null;
}

export interface ProjectTokenStats {
  project_dir: string;
  project_name: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost: number;
}

export interface ModelStats {
  model: string;
  event_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost: number;
}

export interface TokenTimelinePoint {
  time: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export interface StatsOverview {
  total_sessions: number;
  total_events: number;
  active_projects: number;
  error_rate: number;
}

export interface TimelinePoint {
  time: string;
  [eventType: string]: string | number;
}

export interface AgentStats {
  agent: string;
  agent_type: string | null;
  event_count: number;
}
