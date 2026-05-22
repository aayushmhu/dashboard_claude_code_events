import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { extname } from 'path';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB — covers all memory files and typical transcripts; Monaco handles this fine

const PDF_EXTS  = new Set(['.pdf']);
const IMG_EXTS  = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp']);

const LANG: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TSX', '.js': 'JavaScript', '.jsx': 'JSX',
  '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.java': 'Java', '.kt': 'Kotlin',
  '.css': 'CSS', '.scss': 'SCSS', '.html': 'HTML', '.json': 'JSON',
  '.yaml': 'YAML', '.yml': 'YAML', '.md': 'Markdown', '.sh': 'Bash',
  '.sql': 'SQL', '.toml': 'TOML', '.xml': 'XML', '.rb': 'Ruby',
  '.php': 'PHP', '.c': 'C', '.cpp': 'C++', '.h': 'C', '.swift': 'Swift',
  '.vue': 'Vue', '.svelte': 'Svelte', '.env': 'Env', '.txt': 'Text',
  '.lock': 'Lock', '.prisma': 'Prisma', '.graphql': 'GraphQL',
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path') || '';

  if (!filePath || !existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const st = await stat(filePath);
    if (st.isDirectory()) {
      return NextResponse.json({ error: 'Path is a directory' }, { status: 400 });
    }

    const ext = extname(filePath).toLowerCase();

    // Return metadata-only for PDF/image — client will fetch via /api/chat/fileraw
    if (PDF_EXTS.has(ext)) {
      return NextResponse.json({ isPdf: true, isBinary: true, size: st.size, content: '', language: 'PDF', lines: 0 });
    }
    if (IMG_EXTS.has(ext)) {
      return NextResponse.json({ isImage: true, isBinary: true, size: st.size, content: '', language: 'Image', lines: 0 });
    }

    if (st.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large', size: st.size, tooLarge: true });
    }

    const buf = await readFile(filePath);
    if (buf.includes(0x00)) {
      return NextResponse.json({ isBinary: true, size: st.size, content: '', language: 'Binary', lines: 0 });
    }

    const content = buf.toString('utf8');
    const language = LANG[ext] || 'Plain Text';

    return NextResponse.json({ content, language, size: st.size, lines: content.split('\n').length });
  } catch {
    return NextResponse.json({ error: 'Cannot read file' }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { path: filePath, content } = await req.json() as { path: string; content: string };
    if (!filePath || typeof content !== 'string') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    await writeFile(filePath, content, 'utf8');
    const st = await stat(filePath);
    return NextResponse.json({ ok: true, size: st.size, lines: content.split('\n').length });
  } catch {
    return NextResponse.json({ error: 'Cannot write file' }, { status: 403 });
  }
}
