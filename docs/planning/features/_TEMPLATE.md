# Feature Planning Template

> This is the canonical template for every feature planning file in this repo. Copy it to `docs/planning/features/<YYYY-MM-DD>-<short-slug>.md` **before writing any code** for the feature. See AGENTS.md Rule 5.

## Statuses

`proposed` → `in-progress` → `shipped`

`shipped` is **terminal**. Once the SRS row + test cases + CHANGELOG bullet + (where relevant) prototype-changes row are all in place, status flips to `shipped` and the file becomes historical record. There is no `stable` to flip to, no closure ceremony.

## Reactivation discipline

When starting any backend / frontend work, OR when a user reports a bug, **grep `docs/planning/features/` first**:

```bash
grep -l "<keyword>" docs/planning/features/*.md
```

If a related file exists, read it for design context BEFORE coding, and append any new post-deploy issue to Section 6 of the existing file rather than fixing silently. The file is the single timeline for that feature, even across many sessions.

---

## The template (copy from here)

```markdown
# <Feature title>

| Field | Value |
|---|---|
| Status | proposed / in-progress / shipped |
| Started | YYYY-MM-DD |
| Shipped | YYYY-MM-DD |
| SRS row | v2.X |
| Test cases | TC-XX-NN..NN |
| Prototype todo | row # in prototype-changes.md |

## 1. Requirement (as given)

> Verbatim quote of what the user / client said.

## 2. Plan

Rule-by-rule analysis (against AGENTS.md Rules), files to touch, security / performance considerations, open questions for the user.

## 3. Test cases (designed up front)

**Defined in this file BEFORE coding** so the feature is testable from day one and tests are crafted alongside the design, not as an afterthought. List the full TC table here in the same shape as `docs/testing/TEST_CASES.md`:

| TC-ID | Title | Pre-condition | Steps | Expected Result | Priority |
|---|---|---|---|---|---|
| TC-XX-NN | ... | ... | ... | ... | H/M/L |

Cover at minimum: happy path, every forbidden role, every validation failure mode, every error / edge condition surfaced in §2's plan. When the feature ships, **copy these rows verbatim into `docs/testing/TEST_CASES.md`** under the appropriate module and tick the cross-reference in §7.

## 4. Sign-off

Pre-implementation questions + the user's answers. Dated entries.

## 5. Execution log

Dated entries on each meaningful milestone — commits, live verifications, typecheck passes, agent dispatches. Each test case from §3 gets a `PASS` / `FAIL` row here as it's verified live.

## 6. Files touched

**Filled in at the end of the feature (or partial milestone).** Plain bullet list of every file modified or created during this feature. Mark new files with `(new)`. No other references needed — git history has the diffs; this list is for at-a-glance recall of where the changes landed.

- `path/to/file/one.ts`
- `path/to/file/two.tsx` (new)
- `docs/example/three.md`

## 7. Post-deploy

Issues surfaced after going live + their diagnosis + the fix. Multiple dated entries OK. Stays open indefinitely — there's no formal close.

## 8. Cross-references

- SRS §14 row vN.M
- TEST_CASES TC-XX-NN..NN (promoted from §3 on ship)
- prototype-changes.md row #
- product/CHANGELOG bullet
- Production deploy notes (if any non-standard steps needed)
```

---

## File naming

`docs/planning/features/<YYYY-MM-DD>-<short-slug>.md`

- `YYYY-MM-DD`: the date work started (matches the `Started` row in the metadata table)
- `short-slug`: kebab-case, 2-5 words, describes the feature in scannable form

Examples:
- `2026-05-21-bidirectional-scroll.md`
- `2026-05-22-task-notification-render.md`
- `2026-06-01-llm-narrative-summary.md`

The underscore-prefix file `_TEMPLATE.md` sorts first and stays untouched.

## Why this discipline exists

- **Continuity across sessions**: when a Claude session ends and the next one starts, the planning file is the single timeline for the feature. Section 5 (execution log) replaces tribal knowledge.
- **Test-first discipline**: Section 3 forces designing tests at requirement time, not after the bug ships.
- **Post-deploy memory**: Section 6 prevents the "we already fixed this bug" / "no we didn't" loops by keeping the fix trail on the same file as the original requirement.
- **One source of truth per feature**: SRS, TEST_CASES, CHANGELOG, prototype-changes all link back here via Section 7, so the planning file is canonical and downstream artifacts are derived from it.
