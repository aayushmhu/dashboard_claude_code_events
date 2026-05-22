import { NextRequest, NextResponse } from 'next/server';
import { existsSync, statSync, readFileSync, realpathSync } from 'fs';
import { join } from 'path';
import os from 'os';

const ONE_MB = 1024 * 1024;

// Claude Code converts ALL non-alphanumeric characters (not just '/') to '-'
function projectSlug(repoPath: string): string {
  return repoPath.replace(/[^a-zA-Z0-9]/g, '-');
}

function claudeFolderPath(repoPath: string): string {
  return join(os.homedir(), '.claude', 'projects', projectSlug(repoPath));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project');
  const file = searchParams.get('file');

  if (!project || !file) {
    return NextResponse.json({ error: 'project and file params required' }, { status: 400 });
  }

  // Reject path traversal in project param
  if (project.includes('..')) {
    return NextResponse.json({ error: 'invalid project path' }, { status: 400 });
  }

  // Path traversal: reject if file contains / or ..
  if (file.includes('/') || file.includes('..')) {
    return NextResponse.json({ error: 'invalid file name' }, { status: 400 });
  }

  // Validate claude folder path
  const claudeProjectsBase = join(os.homedir(), '.claude', 'projects');
  const folderPath = claudeFolderPath(project);

  // Validate slug doesn't escape projects base
  if (!folderPath.startsWith(claudeProjectsBase + '/') && folderPath !== claudeProjectsBase) {
    return NextResponse.json({ error: 'invalid project path' }, { status: 400 });
  }

  const memoryDirPath = join(folderPath, 'memory');
  const filePath = join(memoryDirPath, file);

  // Safety: realpath must stay inside the memory dir
  try {
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'file not found' }, { status: 404 });
    }
    const real = realpathSync(filePath);
    const realMemoryDir = realpathSync(memoryDirPath);
    if (!real.startsWith(realMemoryDir + '/') && real !== realMemoryDir) {
      return NextResponse.json({ error: 'invalid file path' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'file not found' }, { status: 404 });
  }

  const st = statSync(filePath);

  if (st.size > ONE_MB) {
    return NextResponse.json({ error: 'too large' }, { status: 413 });
  }

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return NextResponse.json({ error: 'cannot read file' }, { status: 500 });
  }

  return NextResponse.json({
    file_name: file,
    size_bytes: st.size,
    modified_at: st.mtime.toISOString(),
    content,
  });
}
