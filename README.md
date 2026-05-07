# Claude Code Activity Dashboard

A Next.js dashboard that visualizes every Claude Code session — prompts, responses, tool calls, token usage, and errors — stored in a MySQL database via Claude Code hooks.

## How it works

Claude Code fires hooks on every event (prompt submitted, response finished, tool used, etc.). A Python logger script catches each hook and writes a row to MySQL. This dashboard reads that database and displays it.

The hook setup is **global** — configure it once and every project is logged automatically, across both the CLI and VS Code extension.

---

## Pages

| Route | What it shows |
|---|---|
| `/` | Dashboard — stat cards, token summary, activity timeline, tool usage chart, recent sessions |
| `/projects` | Card grid per project directory |
| `/sessions` | Paginated session table with project/date/error filters |
| `/conversations` | Chat replay — session sidebar + scrollable event thread, auto-refreshes every 15s |
| `/chat` | Interactive AI chat with VS Code-style file explorer, Monaco editor, and file preview |
| `/tools` | Tool analytics — usage chart, per-tool avg/max duration table |
| `/tokens` | Token usage — totals, cost estimation, timeline chart, model breakdown, cost by project |
| `/errors` | Error log |

### `/chat` features

- **VS Code-style file explorer** — browse your project directory, lazy-load folders on expand
- **Monaco Editor** — full syntax highlighting and editing; save with Ctrl+S / Cmd+S
- **File preview** — Markdown (GitHub-flavored), PDF, and image preview
- **Resizable split pane** — drag to adjust file panel vs chat panel width
- **Right-click context menu** — create file, create folder, rename
- **Rich tool call cards** — each tool type (Bash, Write, Edit, Read, Glob, Grep, Agent, etc.) rendered with purpose-built UI; diffs, terminal blocks, file lists, checklists

---

## Part 1 — Set up the database & hooks

Do this once per machine.

---

### macOS + MySQL

#### 1. Install MySQL

```bash
brew install mysql
brew services start mysql
mysql_secure_installation
```

#### 2. Create the database and user

```bash
mysql -u root -p
```

```sql
CREATE DATABASE claude_logs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'claude'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON claude_logs.* TO 'claude'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### 3. Run migrations

```bash
git clone https://github.com/aayushmhu/dashboard_claude_code_events.git
cd dashboard_claude_code_events

bash migrations/run_migrations.sh -u root -p
```

This creates all tables and indexes. See [`migrations/`](migrations/) for the individual SQL files.

#### 4. Install the Python driver

```bash
pip3 install mysql-connector-python
```

#### 5. Copy and configure the logger script

```bash
cp log-to-db.py ~/.claude/log-to-db.py
```

Open `~/.claude/log-to-db.py` and set your password:

```python
DB_CONFIG = {
    "user":     "claude",
    "password": "your_strong_password",   # <-- update this
    "host":     "localhost",
    "port":     3306,
    "database": "claude_logs",
}
```

#### 6. Set permissions

```bash
chmod 700 ~/.claude/log-to-db.py
```

> **Important:** `700` (not `600`) — the execute bit is required or the hook silently fails.

#### 7. Register the hooks

Create `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "~/.claude/log-to-db.py" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "~/.claude/log-to-db.py" }] }],
    "SubagentStop":     [{ "hooks": [{ "type": "command", "command": "~/.claude/log-to-db.py" }] }],
    "PreToolUse":       [{ "hooks": [{ "type": "command", "command": "~/.claude/log-to-db.py" }] }],
    "PostToolUse":      [{ "hooks": [{ "type": "command", "command": "~/.claude/log-to-db.py" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "~/.claude/log-to-db.py" }] }],
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "~/.claude/log-to-db.py" }] }]
  }
}
```

---

### Ubuntu + MySQL

#### 1. Install MySQL

```bash
sudo apt update
sudo apt install -y mysql-server python3-pip
sudo systemctl start mysql && sudo systemctl enable mysql
sudo mysql_secure_installation
```

#### 2. Create the database and user

```bash
sudo mysql
```

```sql
CREATE DATABASE claude_logs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'claude'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON claude_logs.* TO 'claude'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### 3. Run migrations

```bash
git clone https://github.com/aayushmhu/dashboard_claude_code_events.git
cd dashboard_claude_code_events

bash migrations/run_migrations.sh -u root -p
```

#### 4. Install the Python driver

```bash
pip3 install mysql-connector-python
```

#### 5. Copy and configure the logger script

```bash
cp log-to-db.py ~/.claude/log-to-db.py
```

Edit `~/.claude/log-to-db.py` and update `DB_CONFIG` with your password.

#### 6. Set permissions

```bash
chmod 700 ~/.claude/log-to-db.py
```

#### 7. Register the hooks

Create `~/.claude/settings.json` with the same JSON shown in the macOS section above.

---

### Step 8 — Test the setup

Fully restart Claude Code (Cmd+Q on Mac, or exit and re-run `claude`), then send any message. Verify rows are being written:

```bash
mysql -u claude -p claude_logs -e "
  SELECT id, event_type, role, LEFT(content, 80) AS preview
  FROM cc_events ORDER BY id DESC LIMIT 10;"
```

You should see `SessionStart → UserPromptSubmit → Stop` with Claude's reply in the preview.

**Quick connection test (before restarting Claude Code):**

```bash
echo '{"hook_event_name":"Test","session_id":"manual-test"}' | ~/.claude/log-to-db.py
cat ~/.claude/logger-debug.log | tail -5
# Should end with: INSERT OK for Test

# Clean up test row
mysql -u claude -p claude_logs -e "
  DELETE FROM cc_events WHERE session_id='manual-test';
  DELETE FROM cc_sessions WHERE session_id='manual-test';"
```

---

## Part 2 — Run the dashboard

### Setup

```bash
npm install

cp .env.local.example .env.local
# Edit .env.local with your credentials
```

### Environment variables

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=claude
DB_PASSWORD="your_password"   # quote if password contains special characters
DB_NAME=claude_logs
```

### Development

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # production server
npm run lint     # ESLint
```

---

## Troubleshooting

### Nothing logs at all

Check in this order:

1. **Permissions** — most common cause:
   ```bash
   ls -la ~/.claude/log-to-db.py   # should show -rwx------
   chmod 700 ~/.claude/log-to-db.py
   ```

2. **settings.json syntax:**
   ```bash
   python3 -m json.tool ~/.claude/settings.json
   ```

3. **Fully restart Claude Code** — settings are loaded once at startup.

4. **Check logs:**
   ```bash
   tail -30 ~/.claude/logger-debug.log
   cat ~/.claude/logger-errors.log
   ```

### Access denied to database

Passwords containing `#`, `;`, or `=` can break config parsers. Verify the connection manually:

```bash
mysql -u claude -p   # type password interactively
```

Check the auth plugin:

```bash
mysql -u root -p -e "SELECT user, plugin FROM mysql.user WHERE user='claude';"
```

If you see `auth_socket`, fix it:

```sql
ALTER USER 'claude'@'localhost'
  IDENTIFIED WITH caching_sha2_password BY 'your_password';
FLUSH PRIVILEGES;
```

### mysql.connector module not found

The driver may be installed for a different Python. Check the shebang:

```bash
head -1 ~/.claude/log-to-db.py      # shows which Python is used
/usr/bin/python3 -m pip install mysql-connector-python
```

### Token counts are all zero

Token data is read from the transcript file on `Stop`/`SubagentStop` events. Check:

```bash
grep "tokens summed" ~/.claude/logger-debug.log | tail -5
```

If the transcript path is empty, make sure Claude Code is writing transcripts (enabled by default).

---

## Security notes

- The database contains your full conversation history — treat it as sensitive.
- `~/.claude/log-to-db.py` contains the DB password in plaintext. `chmod 700` limits access to your own user account.
- `~/.claude/settings.json` should not be committed to git.
- To disable logging temporarily: rename `~/.claude/settings.json` to `settings.json.off` and restart Claude Code.

---

## Events logged

| Event | What is captured |
|---|---|
| `SessionStart` | New session opened, model name |
| `UserPromptSubmit` | Every prompt you send |
| `Stop` | Claude's final reply + token usage |
| `SubagentStop` | Subagent responses with agent type + token usage |
| `PreToolUse` | Tool name + input before execution |
| `PostToolUse` | Tool output, error flag, duration_ms |
| `Notification` | Permission prompts, system alerts |
