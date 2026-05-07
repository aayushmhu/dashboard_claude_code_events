import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const action = body.action as string;

    if (action === 'create') {
      const path = body.path as string;
      const isDir = !!body.isDir;
      if (!path) return NextResponse.json({ error: 'No path' }, { status: 400 });
      if (existsSync(path)) return NextResponse.json({ error: 'Already exists' }, { status: 409 });
      // Ensure parent exists
      const parent = dirname(path);
      if (!existsSync(parent)) return NextResponse.json({ error: 'Parent does not exist' }, { status: 400 });
      if (isDir) {
        await mkdir(path, { recursive: true });
      } else {
        await writeFile(path, '', 'utf8');
      }
      return NextResponse.json({ ok: true, path });
    }

    if (action === 'rename') {
      const oldPath = body.oldPath as string;
      const newPath = body.newPath as string;
      if (!oldPath || !newPath) return NextResponse.json({ error: 'Missing paths' }, { status: 400 });
      if (!existsSync(oldPath)) return NextResponse.json({ error: 'Source not found' }, { status: 404 });
      if (existsSync(newPath)) return NextResponse.json({ error: 'Destination already exists' }, { status: 409 });
      await rename(oldPath, newPath);
      return NextResponse.json({ ok: true, oldPath, newPath });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
}
