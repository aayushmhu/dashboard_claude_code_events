import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync, readFileSync, existsSync, realpathSync } from 'fs';
import { join } from 'path';
import os from 'os';
import pool, { RowDataPacket } from '@/lib/db';

// Claude Code converts ALL non-alphanumeric characters (not just '/') to '-'
// e.g., '/Users/aayush/projects/my_app' → '-Users-aayush-projects-my-app'
function projectSlug(repoPath: string): string {
  return repoPath.replace(/[^a-zA-Z0-9]/g, '-');
}

function claudeFolderPath(repoPath: string): string {
  return join(os.homedir(), '.claude', 'projects', projectSlug(repoPath));
}

function formatTildeDir(dir: string): string {
  const home = os.homedir();
  return dir.startsWith(home) ? '~' + dir.slice(home.length) : dir;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project');

  if (!project) {
    return NextResponse.json({ error: 'project param required' }, { status: 400 });
  }

  // Reject obvious path traversal attempts early (before slugging)
  if (project.includes('..')) {
    return NextResponse.json({ error: 'invalid project path' }, { status: 400 });
  }

  // Security: verify the resolved claude folder is inside ~/.claude/projects/
  const claudeProjectsBase = join(os.homedir(), '.claude', 'projects');
  const slugged = projectSlug(project);
  const folderPath = join(claudeProjectsBase, slugged);

  // Path traversal check: slug must not escape .claude/projects
  // Since slug replaces all non-alphanumeric chars with '-', it cannot contain '..'
  // but we verify the candidate path starts with claudeProjectsBase as belt-and-suspenders.
  if (!folderPath.startsWith(claudeProjectsBase + '/') && folderPath !== claudeProjectsBase) {
    return NextResponse.json({ error: 'invalid project path' }, { status: 400 });
  }

  const realFolderPath = folderPath;

  if (!existsSync(realFolderPath)) {
    return NextResponse.json({ error: 'claude folder not found' }, { status: 404 });
  }

  // Read the folder
  let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
  try {
    entries = readdirSync(realFolderPath, { withFileTypes: true }) as Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
  } catch {
    return NextResponse.json({ error: 'cannot read folder' }, { status: 500 });
  }

  // Separate transcripts, subagent dirs, memory dir
  const transcriptFiles: Array<{
    session_id: string;
    file_name: string;
    size_bytes: number;
    modified_at: string;
    tracked_in_db: boolean;
  }> = [];
  const subagentDirs: Array<{
    name: string;
    file_count: number;
    modified_at: string;
  }> = [];

  const sessionIds: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const sessionId = entry.name.replace(/\.jsonl$/, '');
      const filePath = join(realFolderPath, entry.name);
      const st = statSync(filePath);
      sessionIds.push(sessionId);
      transcriptFiles.push({
        session_id: sessionId,
        file_name: entry.name,
        size_bytes: st.size,
        modified_at: st.mtime.toISOString(),
        tracked_in_db: false, // filled in below
      });
    } else if (entry.isDirectory() && entry.name !== 'memory') {
      const dirPath = join(realFolderPath, entry.name);
      const st = statSync(dirPath);
      let fileCount = 0;
      try {
        fileCount = readdirSync(dirPath).length;
      } catch { /* ignore */ }
      subagentDirs.push({
        name: entry.name,
        file_count: fileCount,
        modified_at: st.mtime.toISOString(),
      });
    }
  }

  // Cross-reference with DB
  if (sessionIds.length > 0) {
    try {
      const placeholders = sessionIds.map(() => '?').join(',');
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT session_id FROM cc_sessions WHERE session_id IN (${placeholders})`,
        sessionIds
      );
      const trackedSet = new Set((rows as RowDataPacket[]).map(r => r.session_id as string));
      for (const t of transcriptFiles) {
        t.tracked_in_db = trackedSet.has(t.session_id);
      }
    } catch { /* if DB query fails, leave tracked_in_db as false */ }
  }

  // Sort transcripts by mtime DESC
  transcriptFiles.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
  subagentDirs.sort((a, b) => b.modified_at.localeCompare(a.modified_at));

  // Read memory dir
  const memoryPath = join(realFolderPath, 'memory');
  let memoryExists = false;
  let memoryMdExcerpt: string | null = null;
  const memoryFiles: Array<{ name: string; size_bytes: number; modified_at: string }> = [];

  if (existsSync(memoryPath)) {
    memoryExists = true;
    try {
      const memEntries = readdirSync(memoryPath, { withFileTypes: true }) as Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
      for (const me of memEntries) {
        if (me.isFile()) {
          const mePath = join(memoryPath, me.name);
          const st = statSync(mePath);
          memoryFiles.push({
            name: me.name,
            size_bytes: st.size,
            modified_at: st.mtime.toISOString(),
          });
        }
      }
      memoryFiles.sort((a, b) => b.modified_at.localeCompare(a.modified_at));

      // Read MEMORY.md excerpt (~500 chars = first ~10 lines)
      const memoryMdPath = join(memoryPath, 'MEMORY.md');
      if (existsSync(memoryMdPath)) {
        const raw = readFileSync(memoryMdPath, 'utf-8');
        memoryMdExcerpt = raw.slice(0, 500);
      }
    } catch { /* ignore */ }
  }

  const totalBytes = transcriptFiles.reduce((sum, t) => sum + t.size_bytes, 0);

  return NextResponse.json({
    claude_folder_path: formatTildeDir(realFolderPath),
    claude_folder_path_full: realFolderPath,
    claude_folder_exists: true,
    transcripts: transcriptFiles,
    subagent_dirs: subagentDirs,
    memory: {
      exists: memoryExists,
      file_count: memoryFiles.length,
      memory_md_excerpt: memoryMdExcerpt,
      files: memoryFiles,
    },
    totals: {
      transcript_count: transcriptFiles.length,
      transcript_total_bytes: totalBytes,
      subagent_dir_count: subagentDirs.length,
      memory_file_count: memoryFiles.length,
    },
  });
}
