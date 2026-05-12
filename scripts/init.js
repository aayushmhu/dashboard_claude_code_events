#!/usr/bin/env node
'use strict';

/**
 * Claude Dashboard bootstrapper.
 * Usage:
 *   npx claude-dashboard init   (once published to npm)
 *   npm run init                (from repo)
 *   node scripts/init.js        (directly)
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Paths ──────────────────────────────────────────────────────────────────
const HOME           = os.homedir();
const CLAUDE_DIR     = path.join(HOME, '.claude');
const DASHBOARD_DIR  = path.join(HOME, '.claude-dashboard');
const LOGGER_DEST    = path.join(CLAUDE_DIR, 'log-to-db.py');
const SETTINGS       = path.join(CLAUDE_DIR, 'settings.json');
const OLD_DB_PATH    = path.join(CLAUDE_DIR, 'dashboard.db');
const DB_PATH        = process.env.DB_PATH || path.join(DASHBOARD_DIR, 'dashboard.db');

const REPO_ROOT      = path.join(__dirname, '..');
const LOGGER_SRC     = path.join(REPO_ROOT, 'scripts', 'log-to-db.py');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'migrations');

const HOOK_COMMAND = '~/.claude/log-to-db.py';
const EVENT_TYPES  = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
  'Notification',
];

// ── Helpers ────────────────────────────────────────────────────────────────
const step = (msg) => process.stdout.write(`  ${msg}...`);
const ok   = (note) => process.stdout.write(` ✓${note ? '  ' + note : ''}\n`);
const fail = (msg)  => { process.stderr.write(`\n  ✗ ${msg}\n`); process.exit(1); };

function makeHook() {
  return { hooks: [{ type: 'command', command: HOOK_COMMAND }] };
}

// ── Commands ───────────────────────────────────────────────────────────────
function cmdInit() {
  console.log('\n  Claude Dashboard — Setup\n');

  // 1. ~/.claude directory
  step('Checking ~/.claude');
  if (!fs.existsSync(CLAUDE_DIR)) {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    ok('created');
  } else {
    ok('exists');
  }

  // 2. Dashboard data directory (safe from Claude Code uninstalls)
  step('Checking ~/.claude-dashboard');
  if (!fs.existsSync(DASHBOARD_DIR)) {
    fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
    ok('created');
  } else {
    ok('exists');
  }

  // Migrate database from old location if needed
  if (!fs.existsSync(DB_PATH) && fs.existsSync(OLD_DB_PATH)) {
    step('Migrating database from ~/.claude/ → ~/.claude-dashboard/');
    fs.renameSync(OLD_DB_PATH, DB_PATH);
    ok('moved');
  }

  // 3. Symlink logger (so updates to the repo are picked up automatically)
  step('Linking logger → ~/.claude/log-to-db.py');
  if (!fs.existsSync(LOGGER_SRC)) {
    fail('log-to-db.py not found in scripts/ — run this from the repo root directory.');
  }
  fs.chmodSync(LOGGER_SRC, 0o700);
  try {
    fs.lstatSync(LOGGER_DEST); // throws if nothing exists
    fs.unlinkSync(LOGGER_DEST); // remove old copy or stale symlink
  } catch { /* nothing there, nothing to remove */ }
  fs.symlinkSync(LOGGER_SRC, LOGGER_DEST);
  ok();

  // 3. Hook registration
  step('Registering Claude Code hooks → ~/.claude/settings.json');
  let settings = {};
  if (fs.existsSync(SETTINGS)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    } catch {
      const bak = SETTINGS + '.bak';
      fs.copyFileSync(SETTINGS, bak);
      process.stdout.write(`\n    Warning: unparseable settings.json — backed up to settings.json.bak\n  `);
      settings = {};
    }
  }

  if (!settings.hooks) settings.hooks = {};

  let added = 0;
  for (const eventType of EVENT_TYPES) {
    const existing = settings.hooks[eventType] || [];
    const alreadyWired = existing.some((entry) =>
      entry.hooks?.some((h) => h.command?.includes('log-to-db.py'))
    );
    if (!alreadyWired) {
      settings.hooks[eventType] = [...existing, makeHook()];
      added++;
    }
  }

  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
  ok(added > 0 ? `${added} hooks added` : 'already registered');

  // 4. Database migrations
  step('Running database migrations');
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    fail('better-sqlite3 not found — run: npm install');
  }

  try {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Migration tracking table
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT NOT NULL PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Run each migration file in order, skipping already-applied ones
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const applied = new Set(
      db.prepare('SELECT filename FROM schema_migrations').pluck().all()
    );

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
      ran++;
    }

    db.close();
    ok(ran > 0 ? `${ran} migration${ran > 1 ? 's' : ''} applied` : 'up to date');
  } catch (e) {
    fail(`Database error: ${e.message}`);
  }

  // 5. Done
  const port = process.env.PORT || 3000;
  const url  = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
  console.log(`
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Setup complete!

  Start the dashboard:

    npm run dev

  Then open:  ${url}

  Fully quit and reopen Claude Code, then
  start a new session to begin logging.

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

function cmdHelp() {
  console.log(`
  Usage: claude-dashboard <command>

  Commands:
    init    Set up logger, register events, run migrations
    help    Show this message
`);
}

// ── Entry point ────────────────────────────────────────────────────────────
const cmd = process.argv[2] || 'init';
if (cmd === 'init')                                          cmdInit();
else if (cmd === 'help' || cmd === '--help' || cmd === '-h') cmdHelp();
else { console.error(`\n  Unknown command: ${cmd}\n`); cmdHelp(); process.exit(1); }
