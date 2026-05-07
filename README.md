# Claude Code Activity Dashboard

A Next.js dashboard that visualizes every Claude Code session — prompts, responses, tool calls, errors, and subagent activity — stored in a MySQL (or PostgreSQL) database via Claude Code hooks.

## How it works

Claude Code fires hooks on every event (prompt submitted, response finished, tool used, etc.). A small Python logger script catches each hook and writes a row to a database. This dashboard reads that database and displays it.

The hook setup is **global** — configure it once on your machine and every project is logged automatically, across both the CLI and VS Code extension.

---

## Part 1 — Set up the database & hooks

Do this once per machine. After setup, every Claude Code session is logged automatically.

### Prerequisites

- Claude Code installed (CLI or VS Code extension)
- Python 3 with pip
- MySQL or PostgreSQL running locally
- Terminal access

---

### Option B — macOS + MySQL (recommended)

#### B.1 Install MySQL

```bash
brew install mysql
brew services start mysql
mysql_secure_installation
```

#### B.2 Create the database and user

```bash
mysql -u root -p
```

Inside the MySQL prompt:

```sql
CREATE DATABASE claude_logs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'claude'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON claude_logs.* TO 'claude'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **Password tip:** Avoid `#`, `;`, `=`, `&` in the password — they can break config parsers. Use letters, digits, underscores, and hyphens.

#### B.3 Create the tables

```bash
mysql -u claude -p claude_logs
```

Paste this schema, then type `EXIT`:

```sql
CREATE TABLE IF NOT EXISTS cc_sessions (
    session_id   VARCHAR(255) PRIMARY KEY,
    started_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cwd          TEXT,
    project_dir  TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cc_events (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id     VARCHAR(255) NOT NULL,
    timestamp      TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    event_type     VARCHAR(64) NOT NULL,
    agent          VARCHAR(128),
    role           VARCHAR(32),
    content        LONGTEXT,
    tool_name      VARCHAR(128),
    tool_input     JSON,
    tool_output    JSON,
    is_error       BOOLEAN DEFAULT FALSE,
    error_message  TEXT,
    raw_payload    JSON,
    transcript_path TEXT,
    INDEX idx_session (session_id),
    INDEX idx_time (timestamp),
    INDEX idx_type (event_type),
    INDEX idx_errors (is_error)
) ENGINE=InnoDB;
```

#### B.4 Install the Python driver

```bash
pip3 install mysql-connector-python
```

---

### Option A — macOS + PostgreSQL

#### A.1 Install PostgreSQL

```bash
brew install postgresql@16
brew services start postgresql@16
```

#### A.2 Create the database and user

```bash
psql postgres
```

```sql
CREATE USER claude WITH PASSWORD 'your_strong_password';
CREATE DATABASE claude_logs OWNER claude;
\q
```

#### A.3 Create the tables

```bash
psql -U claude -d claude_logs -h localhost
```

```sql
CREATE TABLE IF NOT EXISTS cc_sessions (
    session_id   TEXT PRIMARY KEY,
    started_at   TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    cwd          TEXT,
    project_dir  TEXT
);

CREATE TABLE IF NOT EXISTS cc_events (
    id             BIGSERIAL PRIMARY KEY,
    session_id     TEXT NOT NULL,
    timestamp      TIMESTAMPTZ DEFAULT NOW(),
    event_type     TEXT NOT NULL,
    agent          TEXT,
    role           TEXT,
    content        TEXT,
    tool_name      TEXT,
    tool_input     JSONB,
    tool_output    JSONB,
    is_error       BOOLEAN DEFAULT FALSE,
    error_message  TEXT,
    raw_payload    JSONB,
    transcript_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_cc_events_session ON cc_events(session_id);
CREATE INDEX IF NOT EXISTS idx_cc_events_time    ON cc_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_cc_events_type    ON cc_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cc_events_errors  ON cc_events(is_error) WHERE is_error = TRUE;
```

#### A.4 Install the Python driver

```bash
pip3 install psycopg2-binary
```

---

### Option C — Ubuntu + PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib python3-pip
sudo systemctl start postgresql && sudo systemctl enable postgresql
sudo -u postgres psql
```

```sql
CREATE USER claude WITH PASSWORD 'your_strong_password';
CREATE DATABASE claude_logs OWNER claude;
\q
```

Then create the same tables as Option A above.

> **Ubuntu note:** If you get a peer authentication error, edit `/etc/postgresql/*/main/pg_hba.conf`, change the local line for `claude_logs` to use `md5`, then `sudo systemctl restart postgresql`.

```bash
pip3 install psycopg2-binary
```

---

### Option D — Ubuntu + MySQL

```bash
sudo apt update
sudo apt install -y mysql-server python3-pip
sudo systemctl start mysql && sudo systemctl enable mysql
sudo mysql_secure_installation
sudo mysql
```

```sql
CREATE DATABASE claude_logs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'claude'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON claude_logs.* TO 'claude'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Then create the same tables as Option B above, and:

```bash
pip3 install mysql-connector-python
```

---

### Step 1 — Create the logger script

Save the appropriate script as `~/.claude/log-to-db.py` and replace `YOUR_PASSWORD_HERE` with your actual password.

**For MySQL** — save as `~/.claude/log-to-db.py`:

```python
#!/usr/bin/env python3
"""Claude Code -> MySQL logger.
Captures prompts, responses, tool calls, errors, and TOKEN USAGE.
Token data is summed from the transcript file on Stop/SubagentStop events.
Uses last_assistant_message from the hook payload instead of transcript parsing."""
import sys, os, json, time, traceback, datetime

DB_CONFIG = {
    "user":     "claude",
    "password": "YOUR_PASSWORD_HERE",
    "host":     "localhost",
    "port":     3306,
    "database": "claude_logs",
}

DEBUG_LOG = os.path.expanduser("~/.claude/logger-debug.log")
ERR_LOG   = os.path.expanduser("~/.claude/logger-errors.log")


def dbg(msg):
    try:
        with open(DEBUG_LOG, "a") as f:
            f.write(f"[{datetime.datetime.utcnow().isoformat()}] {msg}\n")
    except Exception:
        pass


def log_error(msg):
    try:
        with open(ERR_LOG, "a") as f:
            f.write(f"[{datetime.datetime.utcnow().isoformat()}] {msg}\n")
    except Exception:
        pass


dbg(f"=== script started, pid={os.getpid()} ===")

try:
    import mysql.connector
    dbg("mysql.connector imported OK")
except Exception as e:
    dbg(f"FAILED to import mysql.connector: {e}")
    log_error(f"import failed: {e}\n{traceback.format_exc()}")
    sys.exit(0)


# ---------------------------------------------------------------------------
# Token counting from transcript
# ---------------------------------------------------------------------------
def sum_tokens_from_transcript(transcript_path, since_user_idx=None):
    """Read the transcript JSONL and sum token usage from all assistant
    message.usage blocks after the last real user prompt."""
    result = {
        "model": None,
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_tokens": 0,
        "cache_read_tokens": 0,
    }
    if not transcript_path or not os.path.exists(transcript_path):
        return result

    try:
        with open(transcript_path, "r") as f:
            records = []
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except Exception:
                    continue

        # Find the last real user prompt index if not provided
        if since_user_idx is None:
            for i in range(len(records) - 1, -1, -1):
                r = records[i]
                if isinstance(r, dict) and r.get("type") == "user":
                    msg = r.get("message") or {}
                    content = msg.get("content") if isinstance(msg, dict) else None
                    if isinstance(content, list):
                        has_text = any(c.get("type") == "text" for c in content if isinstance(c, dict))
                        if has_text:
                            since_user_idx = i
                            break
                    elif isinstance(content, str):
                        since_user_idx = i
                        break

        if since_user_idx is None:
            since_user_idx = 0

        # Sum usage from all assistant records after the user prompt
        seen_ids = set()
        for j in range(since_user_idx, len(records)):
            r = records[j]
            if not isinstance(r, dict) or r.get("type") != "assistant":
                continue
            msg = r.get("message") or {}
            if not isinstance(msg, dict):
                continue

            mid = r.get("messageId") or r.get("uuid")
            if mid:
                if mid in seen_ids:
                    continue
                seen_ids.add(mid)

            usage = msg.get("usage")
            if isinstance(usage, dict):
                result["input_tokens"] += usage.get("input_tokens", 0) or 0
                result["output_tokens"] += usage.get("output_tokens", 0) or 0
                result["cache_creation_tokens"] += usage.get("cache_creation_input_tokens", 0) or 0
                result["cache_read_tokens"] += usage.get("cache_read_input_tokens", 0) or 0

            model = msg.get("model")
            if model:
                result["model"] = model

        dbg(f"tokens summed: in={result['input_tokens']} out={result['output_tokens']} "
            f"cache_create={result['cache_creation_tokens']} cache_read={result['cache_read_tokens']} "
            f"model={result['model']}")

    except Exception as e:
        dbg(f"token counting failed: {e}")

    return result


# ---------------------------------------------------------------------------
# Event extraction
# ---------------------------------------------------------------------------
def extract(data):
    event = data.get("hook_event_name", "Unknown")
    transcript = data.get("transcript_path")
    row = {
        "session_id": data.get("session_id", "unknown"),
        "event_type": event, "agent": "main", "role": None, "content": None,
        "tool_name": None, "tool_input": None, "tool_output": None,
        "is_error": False, "error_message": None,
        "raw_payload": data, "transcript_path": transcript,
        "model": None,
        "input_tokens": 0, "output_tokens": 0,
        "cache_creation_tokens": 0, "cache_read_tokens": 0,
        "total_tokens": 0,
        "duration_ms": None,
    }

    if event == "UserPromptSubmit":
        row["role"] = "user"
        row["content"] = data.get("prompt", "")

    elif event == "Stop":
        row["role"] = "assistant"
        row["content"] = data.get("last_assistant_message")
        time.sleep(0.3)
        tokens = sum_tokens_from_transcript(transcript)
        row["model"] = tokens["model"]
        row["input_tokens"] = tokens["input_tokens"]
        row["output_tokens"] = tokens["output_tokens"]
        row["cache_creation_tokens"] = tokens["cache_creation_tokens"]
        row["cache_read_tokens"] = tokens["cache_read_tokens"]
        row["total_tokens"] = (tokens["input_tokens"] + tokens["output_tokens"] +
                               tokens["cache_creation_tokens"] + tokens["cache_read_tokens"])

    elif event == "SubagentStop":
        row["role"] = "assistant"
        row["agent"] = data.get("agent_type") or data.get("agent_name") or "subagent"
        row["content"] = data.get("last_assistant_message")
        time.sleep(0.3)
        tokens = sum_tokens_from_transcript(
            data.get("agent_transcript_path") or transcript
        )
        row["model"] = tokens["model"]
        row["input_tokens"] = tokens["input_tokens"]
        row["output_tokens"] = tokens["output_tokens"]
        row["cache_creation_tokens"] = tokens["cache_creation_tokens"]
        row["cache_read_tokens"] = tokens["cache_read_tokens"]
        row["total_tokens"] = (tokens["input_tokens"] + tokens["output_tokens"] +
                               tokens["cache_creation_tokens"] + tokens["cache_read_tokens"])

    elif event == "PreToolUse":
        row["role"] = "tool"
        row["tool_name"] = data.get("tool_name")
        row["tool_input"] = data.get("tool_input")

    elif event == "PostToolUse":
        row["role"] = "tool"
        row["tool_name"] = data.get("tool_name")
        row["tool_input"] = data.get("tool_input")
        row["duration_ms"] = data.get("duration_ms")
        tr = data.get("tool_response") or {}
        row["tool_output"] = tr if isinstance(tr, (dict, list)) else {"raw": str(tr)}
        err = None
        if isinstance(tr, dict):
            if tr.get("is_error") or tr.get("error"):
                err = tr.get("error") or tr.get("message") or "tool reported error"
            elif isinstance(tr.get("stderr"), str) and tr["stderr"].strip():
                err = tr["stderr"][:2000]
        if err:
            row["is_error"] = True
            row["error_message"] = str(err)

    elif event == "Notification":
        row["role"] = "system"
        row["content"] = data.get("message", "")

    elif event == "SessionStart":
        row["model"] = data.get("model")

    else:
        row["content"] = data.get("message") or data.get("prompt")

    return row


def jdump(v):
    return json.dumps(v) if v is not None else None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    try:
        raw = sys.stdin.read()
        dbg(f"stdin: {len(raw)} bytes")
    except Exception as e:
        log_error(f"stdin read failed: {e}\n{traceback.format_exc()}")
        sys.exit(0)

    if not raw.strip():
        dbg("stdin empty — exiting")
        sys.exit(0)

    try:
        data = json.loads(raw)
        dbg(f"event={data.get('hook_event_name')}")
    except Exception as e:
        log_error(f"json parse failed: {e}")
        sys.exit(0)

    try:
        row = extract(data)
        dbg(f"row: type={row['event_type']} role={row['role']} "
            f"content_len={len(row['content']) if row['content'] else 0} "
            f"tokens={row['total_tokens']} model={row['model']}")
    except Exception as e:
        log_error(f"extract failed: {e}\n{traceback.format_exc()}")
        sys.exit(0)

    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cur = conn.cursor()

        if row["event_type"] == "SessionStart" and row["model"]:
            cur.execute("""
                INSERT INTO cc_sessions (session_id, cwd, project_dir, model, last_seen_at)
                VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE last_seen_at = CURRENT_TIMESTAMP, model = %s
            """, (row["session_id"], data.get("cwd"),
                  data.get("project_dir") or data.get("cwd"),
                  row["model"], row["model"]))
        else:
            cur.execute("""
                INSERT INTO cc_sessions (session_id, cwd, project_dir, last_seen_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE last_seen_at = CURRENT_TIMESTAMP
            """, (row["session_id"], data.get("cwd"),
                  data.get("project_dir") or data.get("cwd")))

        cur.execute("""
            INSERT INTO cc_events (
              session_id, event_type, agent, role, content,
              tool_name, tool_input, tool_output,
              is_error, error_message, raw_payload, transcript_path,
              model, input_tokens, output_tokens,
              cache_creation_tokens, cache_read_tokens, total_tokens,
              duration_ms
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (row["session_id"], row["event_type"], row["agent"], row["role"],
              row["content"], row["tool_name"],
              jdump(row["tool_input"]), jdump(row["tool_output"]),
              row["is_error"], row["error_message"],
              jdump(row["raw_payload"]), row["transcript_path"],
              row["model"], row["input_tokens"], row["output_tokens"],
              row["cache_creation_tokens"], row["cache_read_tokens"],
              row["total_tokens"], row["duration_ms"]))

        conn.commit()
        cur.close()
        conn.close()
        dbg(f"INSERT OK for {row['event_type']}")
    except Exception as e:
        dbg(f"INSERT FAILED: {e}")
        log_error(f"db op failed: {e}\n{traceback.format_exc()}")
        sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log_error(f"unhandled: {e}\n{traceback.format_exc()}")
        sys.exit(0)
```

> For the **PostgreSQL** version of the script, replace `mysql.connector` with `psycopg2` and adjust the DB_CONFIG keys (`dbname` instead of `database`, `port: 5432`). See `docs/claude-code-db-logging-setup.pdf` for the full PostgreSQL variant.

---

### Step 2 — Set permissions

```bash
chmod 700 ~/.claude/log-to-db.py
```

> **Important:** Use `700`, not `600`. The `7` includes execute permission — without it, the hook silently fails.

---

### Step 3 — Register the hooks

Create `~/.claude/settings.json` (the global Claude Code config — covers both CLI and VS Code extension):

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

### Step 4 — Test the script

```bash
# Test the connection directly
echo '{"hook_event_name":"Test","session_id":"manual-test"}' | ~/.claude/log-to-db.py
cat ~/.claude/logger-debug.log
```

You should see a line ending with `INSERT OK for Test`. Clean up the test row:

```bash
mysql -u claude -p claude_logs -e "
  DELETE FROM cc_events WHERE session_id = 'manual-test';
  DELETE FROM cc_sessions WHERE session_id = 'manual-test';"
```

### Step 5 — Test in Claude Code

Fully restart Claude Code (Cmd+Q on Mac, or exit and re-run `claude`), then send any message. Check the database:

```bash
mysql -u claude -p claude_logs -e "
  SELECT id, event_type, role, LEFT(content, 100) AS preview
  FROM cc_events ORDER BY id DESC LIMIT 10;"
```

You should see `SessionStart → UserPromptSubmit → Stop` with Claude's reply in the preview.

---

## Part 2 — Run the dashboard

### Prerequisites

- Node.js 18+
- MySQL 8+ running locally (or accessible remotely)

### Database migrations

The `migrations/` folder contains numbered SQL files that create everything from scratch. Run them in order once:

```bash
# Option 1 — runner script (runs all migrations automatically)
bash migrations/run_migrations.sh -u root -p

# Option 2 — run individually
mysql -u root -p < migrations/001_create_database.sql   # create DB + user
mysql -u claude -p claude_logs < migrations/002_create_sessions.sql
mysql -u claude -p claude_logs < migrations/003_create_events.sql

# Optional: load fake data to verify the UI before real hooks fire
mysql -u claude -p claude_logs < migrations/004_seed_example.sql
```

| File | What it does |
|---|---|
| `001_create_database.sql` | Creates `claude_logs` DB and `claude` user |
| `002_create_sessions.sql` | Creates `cc_sessions` table with indexes |
| `003_create_events.sql` | Creates `cc_events` table with all columns and indexes |
| `004_seed_example.sql` | Optional fake sessions/events for UI testing |

### Setup

```bash
# Clone the repo
git clone <repo-url>
cd dashboard-claude-code-events

# Install dependencies
npm install

# Configure database connection
cp .env.local.example .env.local
# Edit .env.local and fill in your DB credentials
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

## Troubleshooting hooks

### Nothing logs at all

Check in this order:

1. **Permissions** — most common cause:
   ```bash
   ls -la ~/.claude/log-to-db.py
   # Should show -rwx------ (note the x)
   chmod 700 ~/.claude/log-to-db.py
   ```

2. **settings.json syntax:**
   ```bash
   python3 -m json.tool ~/.claude/settings.json
   ```

3. **Fully restart Claude Code** — settings are loaded once at startup, changes while running don't take effect.

4. **Check the debug log:**
   ```bash
   tail -30 ~/.claude/logger-debug.log
   cat ~/.claude/logger-errors.log
   ```

### Access denied errors

Characters like `#`, `;`, `=` in your password can cause auth failures. Verify by connecting manually:

```bash
mysql -u claude -p  # type password interactively
```

Also check the auth plugin:

```bash
mysql -u root -p -e "SELECT user, host, plugin FROM mysql.user WHERE user='claude';"
```

If you see `auth_socket`, fix it:

```sql
ALTER USER 'claude'@'localhost'
  IDENTIFIED WITH caching_sha2_password BY 'your_password';
FLUSH PRIVILEGES;
```

### Stop event logs empty content

This is the transcript-write race condition. The script retries up to 5 times with 300ms delays. Check:

```bash
grep -E "attempt|found assistant" ~/.claude/logger-debug.log | tail -10
```

### mysql.connector module not found

The driver may be installed for a different Python. Check which Python the script uses:

```bash
head -1 ~/.claude/log-to-db.py   # shows the shebang
/usr/bin/python3 -m pip install mysql-connector-python
```

### Verify hooks fire at all

Replace `settings.json` temporarily with a debug echo hook, restart Claude Code, send a message, then check `~/.claude/hook-debug.log`. If raw JSON appears there, hooks are firing — the issue is in the Python script.

---

## Security notes

- The log database contains your full conversation history — treat it as sensitive.
- `~/.claude/log-to-db.py` contains the DB password in plaintext. `chmod 700` limits access to your user account. **Do not commit this file to git.**
- `~/.claude/settings.json` should also not be committed to git.
- To disable logging temporarily: rename `~/.claude/settings.json` to `settings.json.off` and restart Claude Code.

---

## Events logged

| Event | What is captured |
|---|---|
| `SessionStart` | New session opened — populates `cc_sessions` |
| `UserPromptSubmit` | Every prompt you send |
| `Stop` | Claude's final reply |
| `SubagentStop` | Subagent responses with agent type |
| `PreToolUse` | Tool name + input before execution |
| `PostToolUse` | Tool output + error flag if failed |
| `Notification` | Permission prompts, system alerts |

For full detail on the database schema, logger script internals, and PostgreSQL variants, see `docs/claude-code-db-logging-setup.pdf`.
