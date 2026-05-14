'use client';

import { useState, useMemo } from 'react';
import { Calculator as CalculatorIcon, RotateCcw } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { calcCost, formatCost } from '@/lib/utils';

type ModelKey = 'opus' | 'sonnet' | 'haiku';

const MODEL_OPTIONS: { key: ModelKey; label: string; versions: string }[] = [
  { key: 'opus',   label: 'Opus',   versions: '4.7 · 4.6 · 4.5' },
  { key: 'sonnet', label: 'Sonnet', versions: '4.6 · 4.5' },
  { key: 'haiku',  label: 'Haiku',  versions: '4.5' },
];

interface FieldSpec {
  key: 'input' | 'output' | 'cacheWrite' | 'cacheRead';
  label: string;
}

const FIELDS: FieldSpec[] = [
  { key: 'input',      label: 'Input tokens' },
  { key: 'output',     label: 'Output tokens' },
  { key: 'cacheWrite', label: 'Cache Write tokens' },
  { key: 'cacheRead',  label: 'Cache Read tokens' },
];

const EMPTY_VALUES: Record<FieldSpec['key'], string> = {
  input: '',
  output: '',
  cacheWrite: '',
  cacheRead: '',
};

export function Calculator() {
  const [model, setModel] = useState<ModelKey>('sonnet');
  const [values, setValues] = useState<Record<FieldSpec['key'], string>>(EMPTY_VALUES);
  const isDirty = Object.values(values).some((v) => v !== '');
  const reset = () => setValues(EMPTY_VALUES);

  const cost = useMemo(() => {
    const num = (v: string) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    return calcCost(
      num(values.input),
      num(values.output),
      num(values.cacheWrite),
      num(values.cacheRead),
      model,
    );
  }, [model, values]);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <CalculatorIcon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Cost calculator</h2>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Model</label>
            <Select value={model} onValueChange={(v) => setModel(v as ModelKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>
                    <span>{opt.label}</span>
                    <span className="ml-2 text-[11px] font-mono text-muted-foreground/70">{opt.versions}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <label htmlFor={`calc-${f.key}`} className="text-xs text-muted-foreground">
                  {f.label}
                </label>
                <input
                  id={`calc-${f.key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  placeholder="0"
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-4 pt-4 border-t border-border/60">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Estimated cost
            </span>
            <button
              type="button"
              onClick={reset}
              disabled={!isDirty}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
          <span className="text-2xl font-semibold text-emerald-400 font-mono">
            {formatCost(cost)}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground/70">
          Cache write uses the 1h rate. The 5-min rate is 1.25× input — billed-at-5m totals will be lower.
        </p>
      </div>
    </section>
  );
}
