'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb, DollarSign, Database, AlertCircle, RotateCcw, Check, X, ChevronDown } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type Thresholds = {
  opus_min_turns: number;
  opus_min_cost: number;
  agent_min_calls: number;
  agent_min_avg_input: number;
  agent_max_cache_ratio: number;
  edit_retries_min_sessions: number;
  edit_retries_min_per_session: number;
};

interface Insight {
  id: string;
  title: string;
  body: string;
  saving?: string;
  savingSubtext?: string;
  type: 'cost' | 'cache' | 'pattern';
  details?: {
    metrics: { label: string; value: string }[];
    thresholds: { label: string; value: string }[];
  };
}

interface Props {
  insights: Insight[];
  thresholds: Thresholds;
  defaults: Thresholds;
}

const FIELDS: { key: keyof Thresholds; label: string; hint: string; step: number; suffix?: string }[] = [
  { key: 'opus_min_turns',               label: 'Opus min turns',            hint: 'Min Opus turns running only trivial tools',     step: 1 },
  { key: 'opus_min_cost',                label: 'Opus min cost ($)',         hint: 'Min total Opus cost of those turns',            step: 0.01, suffix: '$' },
  { key: 'agent_min_calls',              label: 'Subagent min calls',        hint: 'Min subagent calls in last 30 days',            step: 1 },
  { key: 'agent_min_avg_input',          label: 'Subagent min avg input',    hint: 'Min avg input tokens per subagent call',        step: 1000 },
  { key: 'agent_max_cache_ratio',        label: 'Subagent max cache ratio',  hint: 'Cache reuse below this triggers warning (0–1)', step: 0.05 },
  { key: 'edit_retries_min_sessions',    label: 'Edit retries min sessions', hint: 'Min sessions with repeated edit failures',      step: 1 },
  { key: 'edit_retries_min_per_session', label: 'Edit failures per session', hint: 'Min failed edits to flag a session',            step: 1 },
];

export function RecommendationsSection({ insights, thresholds, defaults }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Thresholds>(thresholds);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  const dirty = (Object.keys(values) as (keyof Thresholds)[]).some(k => values[k] !== thresholds[k]);

  const save = async () => {
    setSaving(true);
    const body: Record<string, number> = {};
    for (const k of Object.keys(values) as (keyof Thresholds)[]) {
      body[`insight_${k}`] = values[k];
    }
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSavedAt(Date.now());
    setSaving(false);
    setOpen(false);
    router.refresh();
  };

  const reset = () => setValues(defaults);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5" />Recommendations
        </p>
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
        >
          Adjust thresholds
        </button>
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Adjust insight thresholds"
            className="fixed z-50 bg-card border-border shadow-2xl flex flex-col
                       inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t
                       sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-2xl sm:border-l sm:border-t-0"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 shrink-0">
              <div>
                <p className="text-sm font-semibold">Adjust thresholds</p>
                <p className="text-xs text-muted-foreground mt-0.5">Lower values surface more recommendations</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {FIELDS.map(({ key, label, hint, step, suffix }) => (
                <div key={key} className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    {label}
                    {values[key] !== defaults[key] && (
                      <span className="text-[9px] text-amber-400">modified</span>
                    )}
                  </label>
                  <div className="flex items-center gap-1 border border-border rounded-lg bg-background overflow-hidden">
                    {suffix && <span className="pl-2 text-xs text-muted-foreground">{suffix}</span>}
                    <input
                      type="number"
                      min="0"
                      step={step}
                      value={values[key]}
                      onChange={(e) => setValues({ ...values, [key]: parseFloat(e.target.value) || 0 })}
                      className="flex-1 bg-transparent px-2 py-1.5 text-xs outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 leading-tight">{hint} · default {defaults[key]}</p>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between gap-2 shrink-0 bg-card">
              <button
                onClick={reset}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-border/80 flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />Reset
              </button>
              <div className="flex items-center gap-2">
                {savedAt > 0 && Date.now() - savedAt < 3000 && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <Check className="h-3 w-3" />Saved
                  </span>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={!dirty || saving}
                  className="text-xs px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {insights.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-8 text-center flex flex-col items-center gap-3">
          <div>
            <p className="text-sm font-medium">No recommendations right now</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your usage looks efficient against current thresholds.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            Adjust thresholds
          </button>
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = insight.type === 'cost' ? DollarSign : insight.type === 'cache' ? Database : AlertCircle;
  const iconColor   = insight.type === 'cost' ? 'text-amber-400'      : insight.type === 'cache' ? 'text-blue-400'      : 'text-violet-400';
  const borderColor = insight.type === 'cost' ? 'border-amber-500/20' : insight.type === 'cache' ? 'border-blue-500/20' : 'border-violet-500/20';
  const bgColor     = insight.type === 'cost' ? 'bg-amber-500/5'      : insight.type === 'cache' ? 'bg-blue-500/5'      : 'bg-violet-500/5';

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} px-4 py-4 flex flex-col`}>
      <div className="flex items-start gap-2.5 mb-2">
        <Icon className={`h-4 w-4 ${iconColor} shrink-0 mt-0.5`} />
        <p className="text-sm font-medium leading-snug">{insight.title}</p>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {renderBody(insight)}
      </p>

      {insight.saving && (
        <div className="mt-2.5">
          <p className={`text-xs font-medium ${iconColor}`}>{insight.saving}</p>
          {insight.savingSubtext && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{insight.savingSubtext}</p>
          )}
        </div>
      )}

      {insight.details && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 -mb-1 self-start text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? 'Hide details' : 'Why this triggered'}
          </button>
          {expanded && (
            <div className="mt-3 pt-3 border-t border-border/40 space-y-2 text-[11px]">
              <div>
                <p className="text-muted-foreground/70 uppercase tracking-wide text-[9px] mb-1">Measured</p>
                <div className="space-y-0.5">
                  {insight.details.metrics.map((m) => (
                    <div key={m.label} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{m.label}</span>
                      <span className="font-mono text-foreground/90">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground/70 uppercase tracking-wide text-[9px] mb-1">Threshold</p>
                <div className="space-y-0.5">
                  {insight.details.thresholds.map((th) => (
                    <div key={th.label} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{th.label}</span>
                      <span className="font-mono text-foreground/90">{th.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Renders the body, replacing "context drift" with a tooltip on Rule 3.
function renderBody(insight: Insight) {
  if (insight.id !== 'edit-retries') return insight.body;
  const phrase = 'context drift';
  const idx = insight.body.indexOf(phrase);
  if (idx === -1) return insight.body;
  return (
    <>
      {insight.body.slice(0, idx)}
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span className="underline decoration-dotted underline-offset-2 cursor-help text-foreground/80">
            {phrase}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs leading-snug">
          When the model loses track of what it already changed in a file — usually because intermediate edits weren't read back, or another tool modified the file between reads. Manifests as Edit calls with stale `old_string` values.
        </TooltipContent>
      </Tooltip>
      {insight.body.slice(idx + phrase.length)}
    </>
  );
}
