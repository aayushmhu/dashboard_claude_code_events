// Event type colors — used in activity timeline, overview charts, donut charts
export const EVENT_COLORS: Record<string, string> = {
  SessionStart:     '#6366F1',
  UserPromptSubmit: '#3B82F6',
  Stop:             '#10B981',
  SubagentStop:     '#8B5CF6',
  PreToolUse:       '#F59E0B',
  PostToolUse:      '#F59E0B',
  Notification:     '#64748B',
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
  TaskCreate: '#8B5CF6',
  TaskUpdate: '#8B5CF6',
  TodoWrite:       '#14B8A6',
  ToolSearch:      '#64748B',
  SendMessage:     '#06B6D4',
  AskUserQuestion: '#3B82F6',
  TeamCreate:      '#8B5CF6',
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
