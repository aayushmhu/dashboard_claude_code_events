import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getProjectName(projectDir: string): string {
  if (!projectDir) return 'Unknown';
  return projectDir.split('/').filter(Boolean).pop() || projectDir;
}

// MySQL returns timestamps as "YYYY-MM-DD HH:mm:ss" with no timezone suffix.
// Without correction, new Date() treats them as local time instead of UTC,
// causing times to appear offset by the local UTC offset (e.g. +5:30 for IST).
function parseDbDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  // "2026-05-07 10:00:00" or "2026-05-07 10:00:00.000" — no tz info → treat as UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dateStr)) {
    return new Date(dateStr.replace(' ', 'T') + 'Z');
  }
  return new Date(dateStr);
}

export function formatRelativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(parseDbDate(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export function formatAbsoluteTime(dateStr: string): string {
  try {
    return format(parseDbDate(dateStr), 'MMM d, yyyy HH:mm:ss');
  } catch {
    return dateStr;
  }
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function formatTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatCost(dollars: number): string {
  if (!dollars || dollars === 0) return '$0.00';
  if (dollars < 0.0001) return '< $0.0001';
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}

export function formatMs(ms: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const TOKEN_PRICING = {
  input: 3 / 1_000_000,
  output: 15 / 1_000_000,
  cache_write: 3.75 / 1_000_000,
  cache_read: 0.30 / 1_000_000,
} as const;

export function calcCost(
  input: number,
  output: number,
  cacheWrite: number,
  cacheRead: number
): number {
  return (
    input * TOKEN_PRICING.input +
    output * TOKEN_PRICING.output +
    cacheWrite * TOKEN_PRICING.cache_write +
    cacheRead * TOKEN_PRICING.cache_read
  );
}

export function truncateId(id: string, length = 8): string {
  if (id.length <= length) return id;
  return id.slice(0, length) + '…';
}

export function truncateText(text: string, maxLength = 120): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

export const CHART_COLORS = {
  blue: 'hsl(217, 91%, 60%)',
  indigo: 'hsl(239, 84%, 67%)',
  emerald: 'hsl(160, 84%, 39%)',
  amber: 'hsl(38, 92%, 50%)',
  rose: 'hsl(350, 89%, 60%)',
  slate: 'hsl(215, 20%, 65%)',
  violet: 'hsl(263, 70%, 58%)',
} as const;

export const EVENT_TYPE_COLORS: Record<string, string> = {
  UserPromptSubmit: CHART_COLORS.blue,
  Stop: CHART_COLORS.indigo,
  SubagentStop: CHART_COLORS.violet,
  PostToolUse: CHART_COLORS.emerald,
  PreToolUse: CHART_COLORS.slate,
  Notification: CHART_COLORS.amber,
  SessionStart: CHART_COLORS.slate,
};

export const TOOL_COLORS: Record<string, string> = {
  Write: CHART_COLORS.emerald,
  Bash: CHART_COLORS.amber,
  Read: CHART_COLORS.blue,
  Agent: CHART_COLORS.violet,
  Skill: CHART_COLORS.indigo,
  Glob: CHART_COLORS.slate,
  Edit: CHART_COLORS.rose,
  Grep: CHART_COLORS.indigo,
};
