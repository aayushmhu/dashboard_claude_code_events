import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Header } from '@/components/header';
import { DollarSign, ExternalLink, Info } from 'lucide-react';
import { MODEL_PRICING, formatCost } from '@/lib/utils';
import { Calculator } from './calculator';
import { Usage } from './usage';

export const metadata: Metadata = {
  title: 'Model Pricing · Claude Code Dashboard',
  description:
    'Per-token rates for Claude Opus, Sonnet, and Haiku — input, output, cache write, and cache read rates.',
};

const RATES_VERIFIED_AT = '2026-05-14';

interface ModelCardSpec {
  key: 'opus' | 'sonnet' | 'haiku';
  name: string;
  versions: string[];
  tagline: string;
  accent: string;
  isDefault?: boolean;
}

const MODELS: ModelCardSpec[] = [
  {
    key: 'opus',
    name: 'Opus',
    versions: ['4.7', '4.6', '4.5'],
    tagline: 'Highest capability — for the hardest tasks.',
    accent: '#A78BFA',
  },
  {
    key: 'sonnet',
    name: 'Sonnet',
    versions: ['4.6', '4.5'],
    tagline: 'Balanced — Claude Code’s default.',
    accent: '#34D399',
    isDefault: true,
  },
  {
    key: 'haiku',
    name: 'Haiku',
    versions: ['4.5'],
    tagline: 'Fastest and cheapest — for light work.',
    accent: '#FBBF24',
  },
];

function formatRate(dollarsPerMillion: number): string {
  return `${formatCost(dollarsPerMillion)} / MTok`;
}

export default function PricingPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Model Pricing" />
      <div className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:p-6 space-y-6 overflow-y-auto">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-border bg-card p-2.5 shrink-0">
            <DollarSign className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              Per-token rates for Claude Opus, Sonnet, and Haiku — the same numbers used to price every session in this dashboard.
            </p>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="sr-only">Per-model rates</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MODELS.map((m) => {
              const p = MODEL_PRICING[m.key];
              const cacheWrite5m = p.input * 1.25;
              return (
                <div
                  key={m.key}
                  className="rounded-xl border border-border bg-card p-5 space-y-4"
                  style={{ borderLeft: `3px solid ${m.accent}` }}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-semibold" style={{ color: m.accent }}>
                        {m.name}
                      </h3>
                      <span className="text-[11px] font-mono text-muted-foreground/80">
                        {m.versions.join(' · ')}
                      </span>
                      {m.isDefault && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 leading-none">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{m.tagline}</p>
                  </div>

                  <dl className="divide-y divide-border/50 text-sm">
                    <div className="flex items-baseline justify-between gap-3 py-2">
                      <dt className="text-xs text-muted-foreground">Base Input Tokens</dt>
                      <dd className="font-mono text-foreground">{formatRate(p.input)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 py-2">
                      <dt className="text-xs text-muted-foreground">5m Cache Writes</dt>
                      <dd className="font-mono text-foreground">{formatRate(cacheWrite5m)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 py-2">
                      <dt className="text-xs text-muted-foreground">1h Cache Writes</dt>
                      <dd className="font-mono text-foreground">{formatRate(p.cache_write)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 py-2">
                      <dt className="text-xs text-muted-foreground">Cache Hits &amp; Refreshes</dt>
                      <dd className="font-mono text-foreground">{formatRate(p.cache_read)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 py-2">
                      <dt className="text-xs text-muted-foreground">Output Tokens</dt>
                      <dd className="font-mono text-foreground">{formatRate(p.output)}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>

          <div className="space-y-3 pt-2">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] px-4 py-3.5 flex gap-3 items-start">
              <span className="rounded-full border border-blue-400/50 h-5 w-5 flex items-center justify-center shrink-0 mt-0.5">
                <Info className="h-3 w-3 text-blue-400" strokeWidth={2.5} />
              </span>
              <p className="text-sm text-muted-foreground/90 leading-relaxed">
                <span className="font-mono text-foreground/95">MTok</span> = Million tokens. The{' '}
                <span className="text-foreground/95">&ldquo;Base Input Tokens&rdquo;</span> column shows
                standard input pricing, the{' '}
                <span className="text-foreground/95">&ldquo;5m Cache Writes&rdquo;</span>,{' '}
                <span className="text-foreground/95">&ldquo;1h Cache Writes&rdquo;</span>, and{' '}
                <span className="text-foreground/95">&ldquo;Cache Hits &amp; Refreshes&rdquo;</span> columns
                are specific to{' '}
                <a
                  href="https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/50 underline-offset-2"
                >
                  prompt caching
                </a>
                , and <span className="text-foreground/95">&ldquo;Output Tokens&rdquo;</span> shows output
                pricing. See{' '}
                <a
                  href="https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/50 underline-offset-2"
                >
                  prompt caching pricing
                </a>{' '}
                for an explanation of the cache columns and pricing multipliers.
              </p>
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] px-4 py-3.5 flex gap-3 items-start">
              <span className="rounded-full border border-blue-400/50 h-5 w-5 flex items-center justify-center shrink-0 mt-0.5">
                <Info className="h-3 w-3 text-blue-400" strokeWidth={2.5} />
              </span>
              <p className="text-sm text-muted-foreground/90 leading-relaxed">
                <span className="text-foreground/95">Opus 4.7</span> uses a new tokenizer compared to
                previous models, contributing to its improved performance on a wide range of tasks. This new
                tokenizer may use up to 35% more tokens for the same fixed text.
              </p>
            </div>

            <p className="text-xs text-muted-foreground/70 pt-1 px-1">
              Rates last verified {RATES_VERIFIED_AT} ·{' '}
              <a
                href="https://www.anthropic.com/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground underline decoration-dotted underline-offset-2"
              >
                View official pricing on anthropic.com
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </section>

        <Calculator />

        <Suspense fallback={null}>
          <Usage />
        </Suspense>
      </div>
    </div>
  );
}
