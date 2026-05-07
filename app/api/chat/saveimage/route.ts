import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';

export async function POST(req: NextRequest) {
  try {
    const { data, mimeType } = await req.json() as { data: string; mimeType: string };
    const dir = join(tmpdir(), 'claude-dashboard-images');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = mimeType === 'image/png' ? 'png'
      : mimeType === 'image/webp' ? 'webp'
      : mimeType === 'image/gif' ? 'gif'
      : 'jpg';

    const filename = `${randomUUID()}.${ext}`;
    const filePath = join(dir, filename);
    const base64 = data.replace(/^data:[^;]+;base64,/, '');
    await writeFile(filePath, Buffer.from(base64, 'base64'));

    return NextResponse.json({ path: filePath });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
