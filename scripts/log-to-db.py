#!/usr/bin/env python3
"""Claude Code -> SQLite logger.
Captures prompts, responses, tool calls, errors, and TOKEN USAGE.
Also parses the full JSONL transcript on Stop/SubagentStop events to extract
thinking blocks, images, permission decisions, and tool rejections into
cc_transcript_records."""
import sys, os, json, time, traceback, datetime, sqlite3

DB_PATH = os.environ.get("DB_PATH", os.path.expanduser("~/.claude-dashboard/dashboard.db"))

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

dbg("sqlite3 ready")


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
# Transcript record parsing
# ---------------------------------------------------------------------------
def read_transcript_records(transcript_path):
    """Read and parse all lines from a transcript JSONL. Returns list of raw dicts."""
    if not transcript_path or not os.path.exists(transcript_path):
        return []
    records = []
    try:
        with open(transcript_path, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except Exception:
                    records.append(None)  # keep index alignment
    except Exception as e:
        dbg(f"read_transcript_records failed: {e}")
    return records


def parse_transcript_records(session_id, transcript_path, cur):
    """Parse the transcript JSONL and insert new records into cc_transcript_records.
    Only processes records past the last already-imported record_index (for resumed sessions).
    Returns extra cc_events fields: entrypoint, git_branch, stop_reason, has_thinking."""

    extras = {"entrypoint": None, "git_branch": None, "stop_reason": None, "has_thinking": False}

    try:
        records = read_transcript_records(transcript_path)
        if not records:
            return extras

        # Find the last already-imported record_index for this session
        cur.execute(
            "SELECT COALESCE(MAX(record_index), -1) FROM cc_transcript_records WHERE session_id = ?",
            (session_id,)
        )
        last_index = cur.fetchone()[0]

        rows_to_insert = []

        for i, record in enumerate(records):
            if i <= last_index:
                continue
            if not isinstance(record, dict):
                continue

            rtype = record.get("type", "")
            msg   = record.get("message") or {}
            ts    = record.get("timestamp")

            # ── assistant records ────────────────────────────────────────────
            if rtype == "assistant":
                content = msg.get("content") if isinstance(msg, dict) else None
                model   = msg.get("model") if isinstance(msg, dict) else None
                usage   = msg.get("usage") if isinstance(msg, dict) else None
                uuid    = record.get("uuid") or record.get("messageId")
                parent  = record.get("parentUuid")
                is_side = bool(record.get("isSidechain"))

                in_tok = ca_tok = cr_tok = out_tok = 0
                if isinstance(usage, dict):
                    in_tok  = usage.get("input_tokens", 0) or 0
                    out_tok = usage.get("output_tokens", 0) or 0
                    ca_tok  = usage.get("cache_creation_input_tokens", 0) or 0
                    cr_tok  = usage.get("cache_read_input_tokens", 0) or 0

                if isinstance(content, list):
                    for block in content:
                        if not isinstance(block, dict):
                            continue
                        btype = block.get("type")

                        if btype == "text":
                            rows_to_insert.append((
                                session_id, i, "assistant", "text",
                                parent, uuid, ts,
                                block.get("text"), None, None,
                                model, None, None, None, None,
                                is_side,
                                in_tok, out_tok, ca_tok, cr_tok,
                                False, False,
                            ))

                        elif btype == "thinking":
                            rows_to_insert.append((
                                session_id, i, "assistant", "thinking",
                                parent, uuid, ts,
                                block.get("thinking"), None, None,
                                model, None, None, None, None,
                                is_side,
                                in_tok, out_tok, ca_tok, cr_tok,
                                False, False,
                            ))
                            extras["has_thinking"] = True

                        # tool_use blocks: skip — already in cc_events via PreToolUse/PostToolUse

            # ── user records ─────────────────────────────────────────────────
            elif rtype == "user":
                content     = msg.get("content") if isinstance(msg, dict) else None
                entrypoint  = record.get("entrypoint")
                git_branch  = record.get("gitBranch")
                perm_mode   = record.get("permissionMode")
                uuid        = record.get("uuid") or record.get("messageId")
                parent      = record.get("parentUuid")
                is_side     = bool(record.get("isSidechain"))

                # Capture extras from first real user record
                if entrypoint and not extras["entrypoint"]:
                    extras["entrypoint"] = entrypoint
                if git_branch and not extras["git_branch"]:
                    extras["git_branch"] = git_branch

                if isinstance(content, str):
                    rows_to_insert.append((
                        session_id, i, "user", "text",
                        parent, uuid, ts,
                        content, None, None,
                        None, entrypoint, git_branch, perm_mode, None,
                        is_side,
                        0, 0, 0, 0,
                        False, False,
                    ))

                elif isinstance(content, list):
                    for block in content:
                        if not isinstance(block, dict):
                            continue
                        btype = block.get("type")

                        if btype == "text":
                            rows_to_insert.append((
                                session_id, i, "user", "text",
                                parent, uuid, ts,
                                block.get("text"), None, None,
                                None, entrypoint, git_branch, perm_mode, None,
                                is_side,
                                0, 0, 0, 0,
                                False, False,
                            ))

                        elif btype == "tool_result":
                            # Detect user rejection of a tool call
                            result_content = block.get("content", "")
                            if isinstance(result_content, list):
                                result_content = " ".join(
                                    c.get("text", "") for c in result_content
                                    if isinstance(c, dict) and c.get("type") == "text"
                                )
                            if isinstance(result_content, str) and result_content.startswith(
                                "The user doesn't want to proceed"
                            ):
                                rows_to_insert.append((
                                    session_id, i, "user", "rejection",
                                    parent, uuid, ts,
                                    result_content[:2000], None, None,
                                    None, entrypoint, git_branch, perm_mode, None,
                                    is_side,
                                    0, 0, 0, 0,
                                    True, False,
                                ))

                        elif btype == "image":
                            source = block.get("source") or {}
                            img_data = source.get("data")
                            img_type = source.get("media_type")
                            if img_data:
                                rows_to_insert.append((
                                    session_id, i, "user", "image",
                                    parent, uuid, ts,
                                    None, img_data.encode() if isinstance(img_data, str) else img_data, img_type,
                                    None, entrypoint, git_branch, perm_mode, None,
                                    is_side,
                                    0, 0, 0, 0,
                                    False, False,
                                ))

                        elif btype == "document":
                            source = block.get("source") or {}
                            doc_data = source.get("data")
                            doc_type = source.get("media_type") or "application/pdf"
                            if doc_data:
                                rows_to_insert.append((
                                    session_id, i, "user", "document",
                                    parent, uuid, ts,
                                    None, doc_data.encode() if isinstance(doc_data, str) else doc_data, doc_type,
                                    None, entrypoint, git_branch, perm_mode, None,
                                    is_side,
                                    0, 0, 0, 0,
                                    False, False,
                                ))

            # ── permission-mode records ──────────────────────────────────────
            elif rtype == "permission-mode":
                perm_mode = record.get("permissionMode")
                rows_to_insert.append((
                    session_id, i, "permission-mode", "mode_change",
                    None, None, ts,
                    perm_mode, None, None,
                    None, None, None, perm_mode, None,
                    False,
                    0, 0, 0, 0,
                    False, False,
                ))

            # ── system records ───────────────────────────────────────────────
            elif rtype == "system":
                subtype = record.get("subtype", "")
                if subtype == "stop_hook_summary":
                    # Extract stop_reason; skip inserting this record
                    extras["stop_reason"] = record.get("stopReason")
                    continue
                elif subtype in ("api_error", "compact_boundary", "informational"):
                    is_err = subtype == "api_error"
                    if subtype == "compact_boundary":
                        meta = record.get("compactMetadata")
                        text = json.dumps(meta) if meta else (record.get("content") or None)
                    else:
                        text = record.get("error") or record.get("message") or None
                    rows_to_insert.append((
                        session_id, i, "system", subtype,
                        None, None, ts,
                        json.dumps(text) if isinstance(text, dict) else text, None, None,
                        None, None, None, None, record.get("stopReason"),
                        False,
                        0, 0, 0, 0,
                        False, is_err,
                    ))
                # other system subtypes: skip

        # Batch insert
        if rows_to_insert:
            cur.executemany("""
                INSERT OR IGNORE INTO cc_transcript_records (
                    session_id, record_index, record_type, record_subtype,
                    parent_uuid, uuid, timestamp,
                    content_text, content_image, image_media_type,
                    model, entrypoint, git_branch, permission_mode, stop_reason,
                    is_sidechain,
                    input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
                    is_rejection, is_error
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, rows_to_insert)
            dbg(f"transcript: inserted {len(rows_to_insert)} records for session {session_id}")
        else:
            dbg(f"transcript: no new records for session {session_id}")

    except Exception as e:
        dbg(f"parse_transcript_records failed: {e}\n{traceback.format_exc()}")
        log_error(f"parse_transcript_records failed: {e}\n{traceback.format_exc()}")

    return extras


# ---------------------------------------------------------------------------
# Transcript readiness check
# ---------------------------------------------------------------------------
def _wait_for_transcript(path, retries=10, interval=0.1):
    """Wait until the transcript file exists and its size is stable.
    Replaces the old time.sleep(0.3) which was a race condition — Claude may
    still be flushing the JSONL when the Stop hook fires."""
    if not path:
        return
    prev_size = -1
    for _ in range(retries):
        if not os.path.exists(path):
            time.sleep(interval)
            continue
        size = os.path.getsize(path)
        if size > 0 and size == prev_size:
            return  # file size stable — write is complete
        prev_size = size
        time.sleep(interval)


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
        # New columns (populated from transcript on Stop/SubagentStop)
        "entrypoint": None, "git_branch": None,
        "stop_reason": None, "has_thinking": False,
    }

    if event == "UserPromptSubmit":
        row["role"] = "user"
        row["content"] = data.get("prompt", "")

    elif event == "Stop":
        row["role"] = "assistant"
        row["content"] = data.get("last_assistant_message")
        _wait_for_transcript(transcript)
        tokens = sum_tokens_from_transcript(transcript)
        row["model"] = tokens["model"]
        row["input_tokens"] = tokens["input_tokens"]
        row["output_tokens"] = tokens["output_tokens"]
        row["cache_creation_tokens"] = tokens["cache_creation_tokens"]
        row["cache_read_tokens"] = tokens["cache_read_tokens"]
        row["total_tokens"] = (tokens["input_tokens"] + tokens["output_tokens"] +
                               tokens["cache_creation_tokens"] + tokens["cache_read_tokens"])
        # Transcript extras populated in main() after DB connection is open

    elif event == "SubagentStop":
        row["role"] = "assistant"
        row["agent"] = data.get("agent_type") or data.get("agent_name") or "subagent"
        row["content"] = data.get("last_assistant_message")
        _t = data.get("agent_transcript_path") or transcript
        _wait_for_transcript(_t)
        tokens = sum_tokens_from_transcript(_t)
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
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        cur = conn.cursor()

        # Parse transcript on Stop/SubagentStop — fills extras and inserts transcript records
        if row["event_type"] in ("Stop", "SubagentStop"):
            transcript_path = (
                data.get("agent_transcript_path") if row["event_type"] == "SubagentStop"
                else data.get("transcript_path")
            ) or data.get("transcript_path")
            try:
                extras = parse_transcript_records(row["session_id"], transcript_path, cur)
                row["entrypoint"]   = extras["entrypoint"]
                row["git_branch"]   = extras["git_branch"]
                row["stop_reason"]  = extras["stop_reason"]
                row["has_thinking"] = extras["has_thinking"]
            except Exception as e:
                dbg(f"transcript parsing failed (non-fatal): {e}")
                log_error(f"transcript parsing failed: {e}\n{traceback.format_exc()}")

        if row["event_type"] == "SessionStart" and row["model"]:
            cur.execute("""
                INSERT INTO cc_sessions (session_id, cwd, project_dir, model, last_seen_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(session_id) DO UPDATE SET
                    last_seen_at = datetime('now'), model = excluded.model
            """, (row["session_id"], data.get("cwd"),
                  data.get("project_dir") or data.get("cwd"),
                  row["model"]))
        else:
            cur.execute("""
                INSERT INTO cc_sessions (session_id, cwd, project_dir, last_seen_at)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(session_id) DO UPDATE SET last_seen_at = datetime('now')
            """, (row["session_id"], data.get("cwd"),
                  data.get("project_dir") or data.get("cwd")))

        cur.execute("""
            INSERT INTO cc_events (
              session_id, event_type, agent, role, content,
              tool_name, tool_input, tool_output,
              is_error, error_message, raw_payload, transcript_path,
              model, input_tokens, output_tokens,
              cache_creation_tokens, cache_read_tokens, total_tokens,
              duration_ms,
              entrypoint, git_branch, stop_reason, has_thinking
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (row["session_id"], row["event_type"], row["agent"], row["role"],
              row["content"], row["tool_name"],
              jdump(row["tool_input"]), jdump(row["tool_output"]),
              row["is_error"], row["error_message"],
              jdump(row["raw_payload"]), row["transcript_path"],
              row["model"], row["input_tokens"], row["output_tokens"],
              row["cache_creation_tokens"], row["cache_read_tokens"],
              row["total_tokens"], row["duration_ms"],
              row["entrypoint"], row["git_branch"],
              row["stop_reason"], row["has_thinking"]))

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
