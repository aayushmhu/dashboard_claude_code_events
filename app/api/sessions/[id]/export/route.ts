import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { RowDataPacket } from '@/lib/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getRates(model: string | null | undefined) {
  const m = (model || '').toLowerCase();
  if (m.includes('opus'))  return { input: 15,   output: 75,   cw: 18.75, cr: 1.50 };
  if (m.includes('haiku')) return { input: 0.80, output: 4,    cw: 1.00,  cr: 0.08 };
  return                          { input: 3,    output: 15,   cw: 3.75,  cr: 0.30 };
}
function calcCost(input: number, output: number, cacheWrite: number, cacheRead: number, model: string | null | undefined): number {
  const r = getRates(model);
  return input * r.input / 1e6 + output * r.output / 1e6 + cacheWrite * r.cw / 1e6 + cacheRead * r.cr / 1e6;
}

function fmtCost(d: number): string {
  if (!d) return '$0.00';
  if (d < 0.001) return `$${d.toFixed(4)}`;
  return `$${d.toFixed(3)}`;
}

function fmtDuration(s: number): string {
  if (!s || s < 0) return '0s';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDate(d: string): string {
  try {
    const dt = new Date(d.includes('T') ? d : d.replace(' ', 'T'));
    return dt.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

function parseJson(v: unknown): unknown {
  if (!v || typeof v === 'object') return v ?? null;
  try { return JSON.parse(String(v)); } catch { return null; }
}

/** Very minimal markdown → safe HTML (code blocks, inline code, bold, newlines). */
function mdToHtml(raw: string): string {
  const escaped = esc(raw);
  const lines = escaped.split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeLines: string[] = [];

  for (const line of lines) {
    if (!inCode && line.startsWith('```')) {
      inCode = true;
      codeLang = line.slice(3).trim();
      codeLines = [];
      continue;
    }
    if (inCode && line.startsWith('```')) {
      inCode = false;
      out.push(`<pre><code${codeLang ? ` class="lang-${esc(codeLang)}"` : ''}>${codeLines.join('\n')}</code></pre>`);
      codeLang = '';
      codeLines = [];
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    let l = line
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');

    if (/^#{1,6}\s/.test(l)) {
      const lvl = l.match(/^(#{1,6})\s/)![1].length;
      l = `<h${lvl} class="md-h">${l.replace(/^#{1,6}\s/, '')}</h${lvl}>`;
    } else if (l.trim() === '') {
      l = '<br>';
    } else {
      l = `<p>${l}</p>`;
    }
    out.push(l);
  }

  if (inCode) out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
  return out.join('');
}

// ── HTML template ─────────────────────────────────────────────────────────────

function renderHTML(session: RowDataPacket, events: RowDataPacket[]): string {
  const projectName = esc(session.project_name || 'Unknown Project');
  const sessionId = esc(session.session_id);
  const startDate = fmtDate(session.started_at);
  const duration = fmtDuration(Number(session.duration_seconds));
  const totalTokens = fmtTokens(Number(session.total_tokens));
  const cost = fmtCost(calcCost(
    Number(session.input_tokens || 0),
    Number(session.output_tokens || 0),
    Number(session.cache_creation_tokens || 0),
    Number(session.cache_read_tokens || 0),
    (session as { model?: string | null }).model,
  ));
  const eventCount = Number(session.event_count || events.length);

  // Pair PreToolUse + PostToolUse by sequence
  const skipIds = new Set<number>();
  const postMap = new Map<string, RowDataPacket>();
  for (const ev of events) {
    if (ev.event_type === 'PostToolUse') {
      postMap.set(ev.tool_name, ev);
    }
  }

  const rendered: string[] = [];
  let postIdx = 0;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (skipIds.has(ev.id)) continue;

    const ts = ev.timestamp ? `<span class="ts">${fmtDate(ev.timestamp)}</span>` : '';

    if (ev.event_type === 'SessionStart') {
      rendered.push(`<div class="event session-start">
        <span class="event-label">Session Started</span>${ts}
      </div>`);
      continue;
    }

    if (ev.event_type === 'UserPromptSubmit') {
      const content = mdToHtml(String(ev.content || ''));
      rendered.push(`<div class="event user">
        <div class="bubble user-bubble">
          <div class="role-label">You</div>
          <div class="content">${content}</div>
          ${ts}
        </div>
      </div>`);
      continue;
    }

    if (ev.event_type === 'Stop' || ev.event_type === 'SubagentStop') {
      if (!ev.content) continue;
      const agent = ev.agent && ev.agent !== 'main' ? esc(ev.agent) : null;
      const agentLabel = agent ? `<span class="agent-badge">${agent}</span>` : '';
      const content = mdToHtml(String(ev.content));
      const turnCost = ev.input_tokens
        ? fmtCost(calcCost(Number(ev.input_tokens), Number(ev.output_tokens), Number(ev.cache_creation_tokens), Number(ev.cache_read_tokens), (ev as { model?: string | null }).model))
        : null;
      rendered.push(`<div class="event assistant">
        <div class="bubble assistant-bubble">
          <div class="role-label">Claude ${agentLabel}</div>
          <div class="content">${content}</div>
          <div class="bubble-footer">
            ${ts}
            ${turnCost ? `<span class="cost-badge">${turnCost}</span>` : ''}
          </div>
        </div>
      </div>`);
      continue;
    }

    if (ev.event_type === 'PreToolUse') {
      // Find matching PostToolUse
      let post: RowDataPacket | undefined;
      for (let j = i + 1; j < events.length; j++) {
        const next = events[j];
        if (next.event_type === 'PostToolUse' && next.tool_name === ev.tool_name && !skipIds.has(next.id)) {
          post = next;
          skipIds.add(next.id);
          break;
        }
      }
      postIdx++;

      const toolName = esc(ev.tool_name || 'Unknown');
      const inputObj = parseJson(ev.tool_input);
      const outputObj = post ? parseJson(post.tool_output) : null;
      const isError = post?.is_error ? ' tool-error' : '';

      const inputJson = inputObj ? JSON.stringify(inputObj, null, 2) : String(ev.tool_input || '');
      const outputJson = outputObj ? JSON.stringify(outputObj, null, 2) : String(post?.tool_output || post?.error_message || '');

      rendered.push(`<div class="event tool${isError}">
        <details>
          <summary>
            <span class="tool-icon">⚙</span>
            <span class="tool-name">${toolName}</span>
            ${isError ? '<span class="error-tag">error</span>' : ''}
            ${ts}
          </summary>
          <div class="tool-body">
            <div class="tool-section">
              <div class="tool-section-label">Input</div>
              <pre class="tool-json"><code>${esc(inputJson)}</code></pre>
            </div>
            ${outputJson ? `<div class="tool-section">
              <div class="tool-section-label">Output</div>
              <pre class="tool-json"><code>${esc(outputJson)}</code></pre>
            </div>` : ''}
          </div>
        </details>
      </div>`);
      continue;
    }

    if (ev.event_type === 'Notification') {
      const notifType = String(ev.notification_type || '');
      const content = ev.content ? esc(String(ev.content)) : notifType;
      rendered.push(`<div class="event notification">
        <span class="notif-icon">🔔</span>
        <span>${content}</span>${ts}
      </div>`);
      continue;
    }
  }

  const css = `
    :root { --bg:#0d1117;--surf:#161b22;--surf2:#1c2128;--border:#30363d;--text:#e6edf3;--muted:#7d8590;--blue:#388bfd;--green:#3fb950;--orange:#d29922;--red:#f85149;--purple:#bc8cff; }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6}
    a{color:var(--blue)}
    .wrap{max-width:860px;margin:0 auto;padding:24px 16px}
    header{background:var(--surf);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:24px}
    header h1{font-size:20px;font-weight:600;margin-bottom:6px}
    .meta{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--muted)}
    .meta span{display:flex;align-items:center;gap:4px}
    .thread{display:flex;flex-direction:column;gap:12px}
    .event{display:flex}
    .event.user{justify-content:flex-end}
    .event.assistant,.event.tool,.event.notification,.event.session-start{justify-content:flex-start}
    .bubble{max-width:72%;border-radius:16px;padding:12px 16px;border:1px solid var(--border)}
    .user-bubble{background:#1f3a61;border-color:#388bfd40;border-bottom-right-radius:4px}
    .assistant-bubble{background:var(--surf2);border-bottom-left-radius:4px}
    .role-label{font-size:11px;font-weight:600;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;display:flex;align-items:center;gap:6px}
    .agent-badge{background:#2d1f5e;color:var(--purple);border:1px solid #6e40c920;border-radius:4px;padding:0 5px;font-size:10px;text-transform:none;letter-spacing:0}
    .content p{margin:4px 0}
    .content p:first-child{margin-top:0}
    .content pre{background:#0d1117;border:1px solid var(--border);border-radius:8px;padding:12px;overflow-x:auto;font-size:12px;margin:8px 0;line-height:1.5}
    .content code{background:#21262d;padding:2px 5px;border-radius:4px;font-family:'SF Mono',Consolas,monospace;font-size:12px}
    .content pre code{background:none;padding:0}
    .content .md-h{margin:10px 0 4px;font-size:1em;font-weight:600;border-bottom:1px solid var(--border);padding-bottom:4px}
    .bubble-footer{display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:8px}
    .ts{font-size:10px;color:var(--muted)}
    .cost-badge{font-size:10px;color:var(--green);font-weight:600;background:#1a2e1a;border:1px solid #3fb95040;padding:1px 6px;border-radius:10px}
    .event.tool{padding:2px 0}
    .event.tool details{width:100%;max-width:680px;background:var(--surf);border:1px solid var(--border);border-radius:10px;overflow:hidden}
    .event.tool.tool-error details{border-color:#f8514940}
    details summary{cursor:pointer;padding:8px 12px;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);list-style:none;user-select:none}
    details summary::-webkit-details-marker{display:none}
    details summary:hover{background:var(--surf2)}
    .tool-icon{font-size:14px}
    .tool-name{font-weight:600;color:var(--text);font-family:'SF Mono',Consolas,monospace;font-size:12px}
    .error-tag{background:#2d1a1a;color:var(--red);border:1px solid #f8514940;border-radius:4px;padding:0 5px;font-size:10px}
    .tool-body{border-top:1px solid var(--border);padding:12px}
    .tool-section{margin-bottom:10px}
    .tool-section:last-child{margin-bottom:0}
    .tool-section-label{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
    .tool-json{background:#0d1117;border:1px solid var(--border);border-radius:6px;padding:10px;overflow-x:auto;max-height:320px;overflow-y:auto;font-size:11px;line-height:1.5;font-family:'SF Mono',Consolas,monospace}
    .event.notification{align-items:center;gap:8px;padding:4px 8px;background:var(--surf2);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--muted)}
    .notif-icon{font-size:14px}
    .event.session-start{align-items:center;gap:8px;font-size:11px;color:var(--muted);border-top:1px solid var(--border);padding-top:12px;margin-top:4px}
    .event-label{font-weight:600;text-transform:uppercase;letter-spacing:.06em}
    footer{margin-top:32px;padding-top:16px;border-top:1px solid var(--border);text-align:center;font-size:11px;color:var(--muted)}
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} — ${startDate}</title>
  <style>${css}</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${projectName}</h1>
      <div class="meta">
        <span>📅 ${startDate}</span>
        <span>⏱ ${duration}</span>
        <span>⚡ ${eventCount} events</span>
        <span>🪙 ${totalTokens} tokens</span>
        <span>💰 ${cost}</span>
        <span title="${sessionId}">🆔 ${sessionId.slice(0, 12)}…</span>
      </div>
    </header>
    <div class="thread">
      ${rendered.join('\n      ')}
    </div>
    <footer>
      Generated by <strong>Claude Code Dashboard</strong> · ${new Date().toLocaleString('en-US')}
    </footer>
  </div>
</body>
</html>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const [[session]] = await pool.query<RowDataPacket[]>(
      `SELECT
        s.session_id, s.started_at, s.last_seen_at, s.project_dir,
        SUBSTRING_INDEX(s.project_dir, '/', -1) AS project_name,
        TIMESTAMPDIFF('SECOND', s.started_at, s.last_seen_at) AS duration_seconds,
        COUNT(e.id) AS event_count,
        COALESCE(SUM(e.total_tokens), 0) AS total_tokens,
        COALESCE(SUM(e.input_tokens), 0) AS input_tokens,
        COALESCE(SUM(e.output_tokens), 0) AS output_tokens,
        COALESCE(SUM(e.cache_creation_tokens), 0) AS cache_creation_tokens,
        COALESCE(SUM(e.cache_read_tokens), 0) AS cache_read_tokens
      FROM cc_sessions s
      LEFT JOIN cc_events e ON s.session_id = e.session_id
      WHERE s.session_id = ?
      GROUP BY s.session_id`,
      [id]
    );

    if (!session) {
      return new NextResponse('Session not found', { status: 404 });
    }

    const [events] = await pool.query<RowDataPacket[]>(
      `SELECT
        id, event_type, timestamp, agent, role, content,
        tool_name, tool_input, tool_output,
        is_error, error_message,
        input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
        json_extract(raw_payload, '$.notification_type') AS notification_type
      FROM cc_events
      WHERE session_id = ?
      ORDER BY id ASC`,
      [id]
    );

    const html = renderHTML(session, events as RowDataPacket[]);
    const slug = String(session.project_name || id).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `session-${slug}-${id.slice(0, 8)}.html`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return new NextResponse('Export failed', { status: 500 });
  }
}
