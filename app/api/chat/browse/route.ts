import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reqPath = searchParams.get('path') || process.env.HOME || '/';

  if (!existsSync(reqPath)) {
    return NextResponse.json({ error: 'Path not found' }, { status: 404 });
  }

  try {
    const st = await stat(reqPath);
    if (!st.isDirectory()) {
      return NextResponse.json({ error: 'Not a directory' }, { status: 400 });
    }

    const entries = await readdir(reqPath, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort((a, b) => a.localeCompare(b));

    const parent = dirname(reqPath);

    return NextResponse.json({
      path: reqPath,
      parent: parent !== reqPath ? parent : null,
      dirs,
      home: process.env.HOME || '',
    });
  } catch {
    return NextResponse.json({ error: 'Cannot read directory' }, { status: 403 });
  }
}
