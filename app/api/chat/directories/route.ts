import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { readdir } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  const [rows] = await pool.query(
    `SELECT DISTINCT project_dir,
            SUBSTRING_INDEX(project_dir, '/', -1) AS project_name,
            MAX(last_seen_at) AS last_active
     FROM cc_sessions
     WHERE project_dir IS NOT NULL
     GROUP BY project_dir
     ORDER BY last_active DESC`
  );

  const home = process.env.HOME || '';
  const projectDirs: Array<{ path: string; name: string }> = [];

  try {
    const projectsDir = join(home, 'projects');
    const entries = await readdir(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        projectDirs.push({ path: join(projectsDir, entry.name), name: entry.name });
      }
    }
  } catch {
    // ~/projects doesn't exist or can't be read
  }

  return NextResponse.json({
    recentProjects: rows,
    availableDirectories: projectDirs,
    homeDir: home,
  });
}
