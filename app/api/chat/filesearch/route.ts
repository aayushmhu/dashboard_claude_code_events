import { NextRequest, NextResponse } from 'next/server';
import { readdirSync } from 'fs';
import { join, relative } from 'path';
import { existsSync } from 'fs';

const SKIP = new Set([
  '.git', 'node_modules', '.next', '__pycache__', 'dist', 'build',
  'coverage', '.cache', 'venv', '.venv', 'target', 'vendor', '.turbo', 'out',
]);

function walk(dir: string, base: string, query: string, results: string[], depth: number): void {
  if (depth > 6 || results.length >= 30) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (SKIP.has(e.name)) continue;
    if (e.isDirectory()) {
      walk(join(dir, e.name), base, query, results, depth + 1);
    } else if (!query || e.name.toLowerCase().includes(query.toLowerCase())) {
      results.push(relative(base, join(dir, e.name)));
    }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get('cwd') || '';
  const q = (searchParams.get('q') || '').trim();

  if (!cwd || !existsSync(cwd)) return NextResponse.json({ files: [] });

  const results: string[] = [];
  walk(cwd, cwd, q, results, 0);

  results.sort((a, b) => {
    const aName = a.split('/').pop()!.toLowerCase();
    const bName = b.split('/').pop()!.toLowerCase();
    const qLow = q.toLowerCase();
    const aStart = qLow && aName.startsWith(qLow) ? 0 : 1;
    const bStart = qLow && bName.startsWith(qLow) ? 0 : 1;
    return aStart - bStart || a.length - b.length;
  });

  return NextResponse.json({ files: results.slice(0, 20) });
}
