import { NextRequest, NextResponse } from 'next/server';
import { readdir } from 'fs/promises';
import { existsSync } from 'fs';

const SKIP = new Set(['.git', 'node_modules', '.next', '__pycache__', 'dist', 'build', 'coverage', '.cache', 'venv', '.venv', 'target', 'vendor', '.turbo', 'out']);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dirPath = searchParams.get('path') || '';

  if (!dirPath || !existsSync(dirPath)) {
    return NextResponse.json({ error: 'Path not found' }, { status: 404 });
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const result = entries
      .filter(e => {
        if (e.name.startsWith('.') && e.isDirectory()) return false;
        if (e.isDirectory() && SKIP.has(e.name)) return false;
        return true;
      })
      .map(e => ({
        name: e.name,
        path: `${dirPath}/${e.name}`.replace(/\/+/g, '/'),
        type: e.isDirectory() ? 'directory' : ('file' as const),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({ entries: result });
  } catch {
    return NextResponse.json({ error: 'Cannot read directory' }, { status: 403 });
  }
}
