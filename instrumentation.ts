export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const [fs, path, os] = await Promise.all([
    import(/* webpackIgnore: true */ 'fs'),
    import(/* webpackIgnore: true */ 'path'),
    import(/* webpackIgnore: true */ 'os'),
  ]);
  const { default: Database } = await import(/* webpackIgnore: true */ 'better-sqlite3');

  const oldDbPath = path.join(os.homedir(), '.claude', 'dashboard.db');
  const defaultDbPath = path.join(os.homedir(), '.claude-dashboard', 'dashboard.db');
  const dbPath = process.env.DB_PATH ?? defaultDbPath;
  const migrationsDir = path.join(process.cwd(), 'migrations');

  if (!fs.existsSync(migrationsDir)) return;

  // Migrate from old location inside ~/.claude/ if needed
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(dbPath) && fs.existsSync(oldDbPath)) {
    fs.renameSync(oldDbPath, dbPath);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT NOT NULL PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set<string>(
    db.prepare('SELECT filename FROM schema_migrations').pluck().all() as string[]
  );

  const files = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
    console.log(`[db] migration applied: ${file}`);
  }

  db.close();
}
