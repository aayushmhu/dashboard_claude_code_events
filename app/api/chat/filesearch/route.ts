import { NextRequest, NextResponse } from 'next/server';
import { readdirSync } from 'fs';
import { join, relative } from 'path';
import { existsSync } from 'fs';

const SKIP = new Set([
  '.git', 'node_modules', '.next', '__pycache__', 'dist', 'build',
  'coverage', '.cache', 'venv', '.venv', 'target', 'vendor', '.turbo', 'out',
]);

function walkFiles(dir: string, base: string, nameQuery: string, results: string[], depth: number): void {
  if (depth > 6 || results.length >= 30) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const fullPath = join(dir, e.name);
    if (e.isDirectory()) {
      walkFiles(fullPath, base, nameQuery, results, depth + 1);
    } else {
      const relPath = relative(base, fullPath);
      // Match against full relative path so folder names also trigger results
      if (!nameQuery || relPath.toLowerCase().includes(nameQuery.toLowerCase())) {
        results.push(relPath);
      }
    }
  }
}

function walkDirs(dir: string, base: string, nameQuery: string, results: string[], depth: number): void {
  if (depth > 3 || results.length >= 10) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name)) continue;
    if (!nameQuery || e.name.toLowerCase().includes(nameQuery.toLowerCase())) {
      results.push(relative(base, join(dir, e.name)));
    }
    walkDirs(join(dir, e.name), base, nameQuery, results, depth + 1);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get('cwd') || '';
  const q = (searchParams.get('q') || '').trim();

  if (!cwd || !existsSync(cwd)) return NextResponse.json({ files: [], dirs: [] });

  // Split on last slash: part before scopes the walk, part after is the name filter
  const lastSlash = q.lastIndexOf('/');
  const folderPath = lastSlash >= 0 ? q.slice(0, lastSlash) : '';
  const nameQuery  = lastSlash >= 0 ? q.slice(lastSlash + 1) : q;
  const searchRoot = folderPath ? join(cwd, folderPath) : cwd;

  const files: string[] = [];
  const dirs: string[] = [];

  if (existsSync(searchRoot)) {
    walkFiles(searchRoot, cwd, nameQuery, files, 0);
    walkDirs(searchRoot, cwd, nameQuery, dirs, 0);
  } else {
    // Folder path doesn't resolve — fall back to full-path fuzzy match from root
    walkFiles(cwd, cwd, q, files, 0);
    walkDirs(cwd, cwd, q.split('/')[0], dirs, 0);
  }

  files.sort((a, b) => {
    if (!nameQuery) return a.length - b.length;
    const qLow = nameQuery.toLowerCase();
    const aName = a.split('/').pop()!.toLowerCase();
    const bName = b.split('/').pop()!.toLowerCase();
    // Rank: filename-starts-with > filename-contains > path-only-contains
    const rank = (relPath: string, name: string) =>
      name.startsWith(qLow) ? 0 : name.includes(qLow) ? 1 : 2;
    return rank(a, aName) - rank(b, bName) || a.length - b.length;
  });

  return NextResponse.json({ files: files.slice(0, 15), dirs: dirs.slice(0, 6) });
}
