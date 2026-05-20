# Claude Code Activity Dashboard

See everything Claude does for you — every conversation, tool call, token spent, and dollar saved — in a clean local dashboard.

> Works with Claude Code CLI and the VS Code extension. All data stays on your machine.

---

## What you get

| Page | |
|---|---|
| **Dashboard** | At-a-glance stats, activity over time, tool usage, recent sessions, top-3 active insights |
| **Conversations** | Replay any session like a chat thread + per-session Summary tab with prompt-anchored cost breakdown. Export to HTML. |
| **Session Summary** | Dedicated narrative view of a session: every prompt anchored with cost, files touched, tools used, and Claude's response excerpt |
| **Tokens** | How many tokens you've used, what it cost, how much cache saved you. Rows link to project detail. |
| **Projects** | Activity broken down by project + per-project drilldown (cost timeline, cost by model, top tools, agents used) |
| **Sessions** | Full session list with filters |
| **Tools** | Which tools Claude used most and how fast |
| **Errors** | Any errors Claude hit, in one place |
| **Model Pricing** | Per-model rates + your usage breakdown by token type |
| **Chat** | Ask Claude questions about a past session *(Experimental)* |

---

## Get started

**Requirements:** Node.js 18+, Python 3.8+, Claude Code — macOS or Linux only

```bash
git clone https://github.com/aayushmhu/claude_dashboard.git
cd claude_dashboard
npm install
npm run init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Fully quit and reopen Claude Code, then start a new session — data will appear automatically.

---

## Configuration

Only needed if you changed the default port. Duplicate `.env.local.example`, rename it to `.env.local`, and update the URL inside.

---

## Troubleshooting

**Nothing showing up?**

1. Fully quit and reopen Claude Code after setup
2. Start a new session and wait a few seconds

**Setting up on a new machine?**

```bash
npm run init
```

Safe to run multiple times — it skips anything already set up.

---

## Security

Your full conversation history is saved locally on your machine. Nothing leaves your computer. Back it up if you care about the history.

---

## Windows

Not supported yet. Contributions welcome.
