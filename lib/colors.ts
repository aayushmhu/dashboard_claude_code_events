// Event type colors — used in activity timeline, overview charts, donut charts
export const EVENT_COLORS: Record<string, string> = {
  SessionStart:     '#6366F1',
  UserPromptSubmit: '#3B82F6',
  Stop:             '#10B981',
  SubagentStop:     '#8B5CF6',
  PreToolUse:       '#F59E0B',
  PostToolUse:      '#D97706',
  Notification:     '#D97706',
};

// Role colors — used in conversation replay, agent breakdown
export const ROLE_COLORS: Record<string, string> = {
  user:      '#3B82F6',
  assistant: '#10B981',
  tool:      '#F59E0B',
  system:    '#64748B',
  subagent:  '#8B5CF6',
  error:     '#EF4444',
};

// Tool-specific colors — used in tool usage bar charts, tool analytics, badges
export const TOOL_COLORS: Record<string, string> = {
  Write:      '#06B6D4',
  Bash:       '#F97316',
  Read:       '#A78BFA',
  Agent:      '#34D399',
  Skill:      '#FB7185',
  Glob:       '#FBBF24',
  Edit:       '#F472B6',
  Grep:       '#818CF8',
  TaskCreate: '#A78BFA',
  TaskUpdate: '#8B5CF6',
  TodoWrite:       '#14B8A6',
  ToolSearch:      '#64748B',
  SendMessage:     '#06B6D4',
  AskUserQuestion: '#3B82F6',
  TeamCreate:      '#8B5CF6',
  TaskOutput:      '#7C3AED',
  WebFetch:        '#3B82F6',
  WebSearch:       '#EC4899',
  Monitor:         '#F59E0B',
  TaskStop:        '#EF4444',
  NotebookEdit:    '#F97316',
  PushNotification:'#F59E0B',
  CronCreate:      '#8B5CF6',
};

// Token breakdown colors — used in token usage charts, cost estimation
export const TOKEN_COLORS = {
  input:      '#3B82F6',
  output:     '#10B981',
  cacheWrite: '#F59E0B',
  cacheRead:  '#8B5CF6',
};

// Status badge styles
export const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  success:  { bg: 'rgba(16,185,129,0.12)',  text: '#10B981', border: 'rgba(16,185,129,0.30)' },
  warning:  { bg: 'rgba(245,158,11,0.12)',  text: '#F59E0B', border: 'rgba(245,158,11,0.30)' },
  error:    { bg: 'rgba(239,68,68,0.12)',   text: '#EF4444', border: 'rgba(239,68,68,0.30)' },
  info:     { bg: 'rgba(59,130,246,0.12)',  text: '#3B82F6', border: 'rgba(59,130,246,0.30)' },
  subagent: { bg: 'rgba(139,92,246,0.12)',  text: '#8B5CF6', border: 'rgba(139,92,246,0.30)' },
  inactive: { bg: 'rgba(100,116,139,0.12)', text: '#94a3b8', border: 'rgba(100,116,139,0.20)' },
};

// Conversation bubble colors — translucent backgrounds for chat replay
export const BUBBLE_COLORS: Record<string, { bg: string; border: string }> = {
  user:      { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.30)' },
  assistant: { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.25)' },
  tool:      { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.20)' },
  toolError: { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)' },
  system:    { bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.20)' },
  subagent:  { bg: 'rgba(139,92,246,0.10)',  border: 'rgba(139,92,246,0.25)' },
};

export function getToolColor(toolName: string): string {
  return TOOL_COLORS[toolName] || '#64748B';
}

// Short descriptions for tooltip surfaces. Two-line max so they fit in a
// max-w-xs tooltip without being intimidating. Each one tries to answer "what
// does it do AND when would I reach for it?" — the one-liners they replaced
// were too tautological ("Read reads files") to actually teach anything.
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  Read:            'Loads a file from disk into context — text, images, PDFs, or notebooks. Always read before editing rather than guessing the contents.',
  Write:           'Creates a new file or overwrites an existing one wholesale. For partial changes prefer Edit; Write replaces the entire file.',
  Edit:            'Replaces an exact string in an existing file. The old text must be unique in the file or the edit fails — read first when in doubt.',
  Bash:            'Executes a shell command in the project directory. Used for git, npm, builds, tests; returns stdout and stderr.',
  Glob:            'Lists files matching a glob pattern like **/*.tsx. Best for "find every file of type X" — results are ordered by modification time.',
  Grep:            'Searches file contents with regex across the repo (ripgrep under the hood). Supports glob, path, and type filters to narrow scope.',
  Agent:           'Spawns a subagent (Explore, Plan, general-purpose) for an isolated sub-task. The subagent runs with its own context — keeps the parent lean.',
  Skill:           'Invokes a built-in slash command from inside the conversation (e.g. /loop, /schedule). The skill prompt is loaded and executed in-context.',
  TaskCreate:      'Creates a long-running background task that an agent works on asynchronously. Returns a task_id you can poll with TaskOutput.',
  TaskUpdate:      'Changes a running task’s status, priority, or dependencies without restarting it. Useful for pausing, reordering, or linking work.',
  TaskOutput:      'Reads progress or final output of a background task by task_id. Can block until the task finishes or return current state immediately.',
  TaskStop:        'Cancels a running background task by task_id. Use when a task is no longer needed or has stalled.',
  TodoWrite:       'Updates the agent’s current todo list, shown as a checklist in the UI. Use for multi-step tasks to track progress visibly for the user.',
  ToolSearch:      'Looks up deferred tool schemas by name or keyword. Used to fetch a tool’s signature before calling it for the first time.',
  SendMessage:     'Sends a message to another agent in the same team — agent-to-agent communication for coordinated multi-agent work.',
  TeamCreate:      'Spins up a new multi-agent team with a designated lead. The lead orchestrates; sub-agents do specialized work.',
  AskUserQuestion: 'Pauses the agent to ask the user a structured question with options. Supports single- or multi-select and free-text "Other".',
  WebFetch:        'Downloads a URL and extracts relevant content using a focused prompt. Returns markdown — cleaner than dumping raw HTML.',
  WebSearch:       'Runs a web search and returns ranked links plus an AI-written summary. Can be restricted to specific domains via allowed_domains.',
  Monitor:         'Runs a shell command in the background while streaming its output back. Use for tail-style watches or periodic process checks.',
  NotebookEdit:    'Adds, modifies, or deletes a single cell in a Jupyter notebook (.ipynb). Preserves outputs in untouched cells.',
  EnterPlanMode:   'Switches the session into plan mode — research and propose changes without touching files. Exit with a written plan for approval.',
  ExitPlanMode:    'Leaves plan mode by presenting the user with the proposed changes for approval before any files are written.',
  EnterWorktree:   'Creates an isolated git worktree on a separate branch so the agent can work without affecting the main checkout.',
  ExitWorktree:    'Leaves a git worktree, optionally deleting the branch. If changes were made, the worktree path and branch are returned.',
  ScheduleWakeup:  'Schedules when the next /loop iteration should fire. Used in dynamic-paced loops to self-throttle without polling.',
  CronCreate:      'Schedules a recurring agent run on a cron expression. The agent fires at the scheduled time with the prompt you provide.',
  CronList:        'Lists every cron job currently scheduled for this user, with their next firing time and last run status.',
  CronDelete:      'Permanently deletes a scheduled cron job by id. There is no recovery — the job stops firing immediately.',
  RemoteTrigger:   'Creates, lists, or deletes remote triggers — webhooks that fire an agent on external events via the claude.ai API.',
  PushNotification:'Pushes a notification to the user’s device — useful when long-running work finishes or needs attention.',
};

export function getToolDescription(toolName: string): string | undefined {
  return TOOL_DESCRIPTIONS[toolName];
}

export function getEventColor(eventType: string): string {
  return EVENT_COLORS[eventType] || '#64748B';
}

export function getRoleColor(role: string): string {
  return ROLE_COLORS[role] || '#64748B';
}

// Agent team colors — keyed by Claude Code's color names
export const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  orange: { bg: 'rgba(249,115,22,0.12)',  text: '#F97316', border: 'rgba(249,115,22,0.30)' },
  purple: { bg: 'rgba(139,92,246,0.12)',  text: '#8B5CF6', border: 'rgba(139,92,246,0.30)' },
  blue:   { bg: 'rgba(59,130,246,0.12)',  text: '#3B82F6', border: 'rgba(59,130,246,0.30)' },
  green:  { bg: 'rgba(16,185,129,0.12)',  text: '#10B981', border: 'rgba(16,185,129,0.30)' },
  red:    { bg: 'rgba(239,68,68,0.12)',   text: '#EF4444', border: 'rgba(239,68,68,0.30)' },
  cyan:   { bg: 'rgba(6,182,212,0.12)',   text: '#06B6D4', border: 'rgba(6,182,212,0.30)' },
  pink:   { bg: 'rgba(236,72,153,0.12)',  text: '#EC4899', border: 'rgba(236,72,153,0.30)' },
  yellow: { bg: 'rgba(245,158,11,0.12)',  text: '#F59E0B', border: 'rgba(245,158,11,0.30)' },
  indigo: { bg: 'rgba(99,102,241,0.12)',  text: '#6366F1', border: 'rgba(99,102,241,0.30)' },
  teal:   { bg: 'rgba(20,184,166,0.12)',  text: '#14B8A6', border: 'rgba(20,184,166,0.30)' },
};

export function getAgentColor(
  agentName: string,
  colorHint?: string,
): { bg: string; text: string; border: string } {
  if (colorHint && AGENT_COLORS[colorHint]) return AGENT_COLORS[colorHint];
  const palette = Object.values(AGENT_COLORS);
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) hash = ((hash << 5) - hash + agentName.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}
