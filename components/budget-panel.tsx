'use client';

import { useState } from 'react';
import { AlertTriangle, DollarSign, X } from 'lucide-react';
import { formatCost } from '@/lib/utils';

interface BudgetPanelProps {
  todayCost: number;
  budget: number | null;
}

export function BudgetPanel({ todayCost, budget: initialBudget }: BudgetPanelProps) {
  const [budget, setBudget] = useState<number | null>(initialBudget);
  const [input, setInput] = useState(initialBudget != null ? String(initialBudget) : '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const exceeded = budget != null && todayCost > budget;

  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const val = parseFloat(input);
    setSaving(true);
    setError(null);
    const newBudget = !input || isNaN(val) || val <= 0 ? null : val;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget_daily_usd: newBudget === null ? '' : newBudget }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBudget(newBudget);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      {exceeded && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-400">Daily budget exceeded</p>
            <p className="text-xs text-red-400/70">
              Spent {formatCost(todayCost)} today · limit {formatCost(budget!)}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/50 hover:border-border rounded-lg px-3 py-1.5"
          >
            <DollarSign className="h-3 w-3" />
            {budget != null ? `Daily budget: ${formatCost(budget)}` : 'Set daily budget'}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden bg-card">
              <span className="pl-3 text-xs text-muted-foreground">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. 1.00"
                className="w-24 bg-transparent px-2 py-1.5 text-xs outline-none"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
              />
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Save
            </button>
            {budget != null && (
              <button
                onClick={() => { setInput(''); save(); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" />Clear
              </button>
            )}
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
        {error && <span className="text-xs text-red-400">Save failed: {error}</span>}
      </div>
    </div>
  );
}
