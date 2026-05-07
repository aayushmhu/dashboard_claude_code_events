#!/usr/bin/env python3
"""Claude Code -> MySQL logger.
Captures prompts, responses, tool calls, errors, and TOKEN USAGE.
Token data is summed from the transcript file on Stop/SubagentStop events.
Uses last_assistant_message from the hook payload instead of transcript parsing."""
import sys, os, json, time, traceback, datetime

DB_CONFIG = {
    "user":     "claude",
    "password": "YOUR_PASSWORD_HERE",          # <-- your real password
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
