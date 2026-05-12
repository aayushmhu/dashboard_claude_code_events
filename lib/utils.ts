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

// MySQL returns timestamps as "YYYY-MM-DD HH:mm:ss" in local time.
// Replace the space separator so JS Date parses it as local time (no Z suffix).
export function parseDbDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dateStr)) {
    return new Date(dateStr.replace(' ', 'T') + 'Z');
  }
  return new Date(dateStr);
}

export function formatRelativeTime(dateStr: string): string {
  try {
    const d = parseDbDate(dateStr);
    const clamped = new Date(Math.min(d.getTime(), Date.now()));
    return formatDistanceToNow(clamped, { addSuffix: true });
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

// Kept for per-type rate labels in the UI (e.g. "$3/M", "$15/M").
// Do NOT use for cost totals — use calcCost(model) instead.
export const TOKEN_PRICING = {
  input: 3 / 1_000_000,
  output: 15 / 1_000_000,
  cache_write: 3.75 / 1_000_000,
  cache_read: 0.30 / 1_000_000,
} as const;

export interface ModelPricing {
  input: number;      // $ per million tokens
  output: number;
  cache_write: number;
  cache_read: number;
}

// Pricing per million tokens, keyed by model family.
// All rates from Anthropic's published pricing page.
export const MODEL_PRICING: Record<string, ModelPricing> = {
  opus:   { input: 15,   output: 75,   cache_write: 18.75, cache_read: 1.50 },
  sonnet: { input: 3,    output: 15,   cache_write: 3.75,  cache_read: 0.30 },
  haiku:  { input: 0.80, output: 4,    cache_write: 1.00,  cache_read: 0.08 },
};

export function getModelPricing(model: string | null | undefined): ModelPricing {
  if (!model) return MODEL_PRICING.sonnet;
  const m = model.toLowerCase();
  if (m.includes('opus'))  return MODEL_PRICING.opus;
  if (m.includes('haiku')) return MODEL_PRICING.haiku;
  return MODEL_PRICING.sonnet;
}

export function calcCost(
  input: number,
  output: number,
  cacheWrite: number,
  cacheRead: number,
  model?: string | null
): number {
  const p = getModelPricing(model);
  return (
    input     * p.input       / 1_000_000 +
    output    * p.output      / 1_000_000 +
    cacheWrite * p.cache_write / 1_000_000 +
    cacheRead  * p.cache_read  / 1_000_000
  );
}

export function calcCacheSavings(cacheRead: number, model?: string | null): number {
  const p = getModelPricing(model);
  return cacheRead * (p.input - p.cache_read) / 1_000_000;
}

export function truncateId(id: string, length = 8): string {
  if (id.length <= length) return id;
  return id.slice(0, length) + '…';
}

export function truncateText(text: string, maxLength = 120): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

export function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

export function getRelativePath(filePath: string, basePath?: string): string {
  if (basePath && filePath.startsWith(basePath)) {
    return filePath.slice(basePath.length).replace(/^\//, '');
  }
  const match = filePath.match(/(?:projects|src|Users\/[^/]+)\/(.+)/);
  return match ? match[1] : filePath;
}

export function getFileExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts.pop()! : '';
}

export function getLanguageLabel(filePath: string): string {
  const ext = getFileExtension(filePath).toLowerCase();
  const map: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
    py: 'Python', html: 'HTML', css: 'CSS', json: 'JSON', md: 'Markdown',
    sql: 'SQL', sh: 'Shell', bash: 'Shell', yml: 'YAML', yaml: 'YAML',
    rs: 'Rust', go: 'Go', rb: 'Ruby', java: 'Java', c: 'C', cpp: 'C++',
    h: 'C', hpp: 'C++', swift: 'Swift', kt: 'Kotlin', toml: 'TOML',
  };
  return map[ext] || ext.toUpperCase() || 'Text';
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

export function truncateLines(
  text: string,
  maxLines: number,
): { text: string; truncated: boolean; totalLines: number } {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return { text, truncated: false, totalLines: lines.length };
  return { text: lines.slice(0, maxLines).join('\n'), truncated: true, totalLines: lines.length };
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function formatAgentName(name: string): string {
  if (!name) return 'Agent';
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getAgentIconType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('lead') || lower.includes('manager')) return 'crown';
  if (lower.includes('security') || lower.includes('analyzer')) return 'shield-check';
  if (lower.includes('test') || lower.includes('qa')) return 'flask-conical';
  if (lower.includes('backend') || lower.includes('api') || lower.includes('server')) return 'server';
  if (lower.includes('frontend') || lower.includes('ui') || lower.includes('design')) return 'layout';
  if (lower.includes('devops') || lower.includes('deploy') || lower.includes('infra')) return 'cloud';
  if (lower.includes('data') || lower.includes('database') || lower.includes('db')) return 'database';
  if (lower.includes('doc') || lower.includes('writer') || lower.includes('content')) return 'file-text';
  return 'bot';
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
  SessionStart:     '#6366F1',
  UserPromptSubmit: '#3B82F6',
  Stop:             '#10B981',
  SubagentStop:     '#8B5CF6',
  PreToolUse:       '#F59E0B',
  PostToolUse:      '#F59E0B',
  Notification:     '#64748B',
};

// Shared chart styles using CSS variables — work in both light and dark mode
export const CT = {
  box: {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '10px',
    padding: '10px 14px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
    minWidth: '150px',
  },
  label: {
    fontSize: 11,
    color: 'hsl(var(--muted-foreground))',
    marginBottom: 8,
    fontWeight: 500,
  },
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
  },
  name: { fontSize: 11, color: 'hsl(var(--muted-foreground))' },
  val: {
    fontSize: 12,
    color: 'hsl(var(--foreground))',
    fontWeight: 700,
    fontFamily: 'ui-monospace, monospace',
  },
  divider: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid hsl(var(--border))',
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
  },
  dot: (color: string) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: color,
    flexShrink: 0 as const,
    marginRight: 0,
  }),
} as const;

// Common axis tick style
export const AXIS_TICK = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
// Common grid stroke
export const GRID_STROKE = 'hsl(var(--border))';

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
  TaskOutput: '#8B5CF6',
  TodoWrite:  '#14B8A6',
  ToolSearch: '#64748B',
};

export function detectMessageType(content: string): 'task-notification' | 'agent-report' | 'agent-message' | 'user' {
  const t = content.trimStart();
  if (t.startsWith('<task-notification>')) return 'task-notification';
  if (t.startsWith('<analysis>') || t.startsWith('<summary>')) return 'agent-report';
  if (t.startsWith('<teammate-message>') || t.startsWith('<team-') || t.startsWith('</teammate-message>')) return 'agent-message';
  return 'user';
}
