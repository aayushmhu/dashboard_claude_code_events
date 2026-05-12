#!/bin/bash
# Agent team coordinator
# Run order: CEO + PM in parallel → Designer → New User → CEO synthesis

set -e
PROJ="/Users/aayushsaini/projects/dashboard_claude_code_events"
REVIEWS="$PROJ/planning/reviews"
LOG="$REVIEWS/coordinator.log"

mkdir -p "$REVIEWS"
cd "$PROJ"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

# ── Phase 1: CEO analysis + PM audit run in parallel ──────────────────────────

log "STARTING: CEO (strategic analysis) + Product Manager (data audit) in parallel"

claude --agent ceo \
  --model opus \
  --dangerously-skip-permissions \
  -p "Analyze this entire project — codebase, database, architecture, product positioning. Explore every directory, read the schema, read every page component, read the Python logger (log-to-db.py), read CLAUDE.md. Write your strategic assessment covering: what this product does well, what it does poorly, who the real user is, and what the moat could be. Save your assessment to planning/reviews/ceo-analysis.md" \
  >> "$REVIEWS/ceo-raw.log" 2>&1 &
CEO_PID=$!

claude --agent product-manager \
  --model opus \
  --dangerously-skip-permissions \
  -p "Audit what data we capture vs what we're missing. Read log-to-db.py line by line — what events does it hook, what fields does it capture, what does it silently drop? Read lib/types.ts and the database schema in CLAUDE.md. Read every page in app/ to see what we surface. Find the gaps: what would make a Claude Code developer unable to live without this dashboard? Write your product review to planning/reviews/pm-review.md" \
  >> "$REVIEWS/pm-raw.log" 2>&1 &
PM_PID=$!

log "CEO PID=$CEO_PID | PM PID=$PM_PID"

# ── Phase 2: Wait for PM, then start Designer ─────────────────────────────────

log "Waiting for Product Manager to finish..."
wait $PM_PID
PM_EXIT=$?
log "Product Manager finished (exit $PM_EXIT)"

log "STARTING: UI/UX Designer"

claude --agent ui-designer \
  --model opus \
  --dangerously-skip-permissions \
  -p "Start by reading planning/reviews/pm-review.md — understand every gap the PM identified. Then do your visual audit: read app/globals.css, lib/colors.ts, components/ui/*, components/charts/*, components/session-table.tsx, components/tool-call-card.tsx, app/page.tsx, app/chat/client.tsx (this is the big one — the conversation view). For every gap the PM found, suggest how to visualize it. For every existing page, say what to keep, what to remove, what to redesign. Be specific: name the component, describe the change, reference a real product that does it better. Save your design review to planning/reviews/designer-review.md" \
  >> "$REVIEWS/designer-raw.log" 2>&1
DESIGNER_EXIT=$?
log "UI/UX Designer finished (exit $DESIGNER_EXIT)"

# ── Phase 3: Wait for Designer, then start New User ───────────────────────────

log "STARTING: New User"

claude --agent new-user \
  --dangerously-skip-permissions \
  -p "Read planning/reviews/designer-review.md first — that's the before-picture. Now experience the dashboard fresh. Read app/page.tsx (dashboard), app/sessions/page.tsx, app/tokens/page.tsx, app/tools/page.tsx, app/errors/page.tsx, app/projects/page.tsx, and app/chat/client.tsx. For each page: what would you understand immediately as a first-time user, what would confuse you, what would delight you, what's missing that you'd expect. Then write a brutally honest Hacker News-style review — specific, no sugarcoating, real examples. Score each page 1-10. Save to planning/reviews/new-user-review.md" \
  >> "$REVIEWS/new-user-raw.log" 2>&1
NEW_USER_EXIT=$?
log "New User finished (exit $NEW_USER_EXIT)"

# ── Phase 4: Wait for CEO analysis, then run CEO synthesis ────────────────────

log "Waiting for CEO analysis to finish..."
wait $CEO_PID
CEO_EXIT=$?
log "CEO initial analysis finished (exit $CEO_EXIT)"

log "STARTING: CEO final synthesis"

claude --agent ceo \
  --model opus \
  --dangerously-skip-permissions \
  -p "Read all three reviews your team wrote: planning/reviews/pm-review.md, planning/reviews/designer-review.md, planning/reviews/new-user-review.md, and your own earlier analysis at planning/reviews/ceo-analysis.md. Now write the final action plan. Prioritize ruthlessly: what are the top 3 things that will 10x this product vs the top 3 things that are nice-to-have. Call out any disagreements between reviewers and give your verdict. Be direct — this is the document the team will actually execute from. Save to planning/reviews/ceo-final-plan.md" \
  >> "$REVIEWS/ceo-synthesis-raw.log" 2>&1
CEO_SYNTH_EXIT=$?
log "CEO final synthesis finished (exit $CEO_SYNTH_EXIT)"

log "ALL AGENTS DONE. Reviews saved to planning/reviews/"
ls -lh "$REVIEWS/"*.md 2>/dev/null
