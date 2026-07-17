---
name: pcm
description: Prompt & Contract Manager — owns this repo's prompt surface (CLAUDE.md, SKILL.md, .claude/**) and its release discipline. Mandatory route for any change to those files; also runs the repo consistency audit (audit). Engine source changes stay normal dev work under CLAUDE.md's gates.
argument-hint: [change request|audit]
---

# PCM — Prompt & Contract Manager

$ARGUMENTS

---

## Mandatory skill load (before any prompt-file edit)

Hook-enforced: `pcm-guard.sh` denies prompt-file edits until `.claude/commands/quality/prompt.md` is READ this session (the Read auto-stamps the quality marker). Its rules govern prose leanness; **§ Authoring conventions** below governs the file skeleton.

**Persona:** Read `.claude/output-styles/dr-house.md` now and adopt it for all responses while this command's work is active.

---

## System wiring knowledge

```
SKILL.md            → the skill's runtime prompt: Claude Code indexes its description in EVERY
                      session of every consumer project; the body loads on invocation. The single
                      most expensive prompt file in this repo. Frontmatter version pins releases.
workflow.js         → build artifact (engine/src/ → npm run build). NEVER hand-edit; not PCM territory.
persist.js midrun.js→ hand-edited host scripts; tested from engine/test/. Not PCM territory.
CLAUDE.md           → contributor rules for this repo (≤200 lines).
.claude/commands/   → slash commands (this file, quality/*, pcm/*).
.claude/output-styles/ → persona overlays, loaded by a command at invocation — never a session style.
.claude/scripts/    → pcm-guard.sh + guard-stamp.sh (the edit gate).
.claude/settings.json → hook wiring.
engine/src/agents/*/prompts.ts + config.ts fragments → the ENGINE's prompt surface: code, not PCM
                      territory — snapshot tests + the build gates own it. PCM only checks that
                      SKILL.md/README/design.md stay consistent WITH it.
```

### Critical invariants

1. **workflow.js is generated** — a PCM change never touches it directly; if a doc change references engine behavior, verify against `engine/src/`, not the bundle.
2. **SKILL.md ↔ engine parity** — every arg SKILL.md documents must exist in `config.ts` validation (and vice versa); the artifact list must match what `engine.ts` writes to `files[]`; the version triple (SKILL.md frontmatter, engine/package.json, README header) moves together.
3. **Downstream vendors these root files** — consumers copy SKILL.md/workflow.js/persist.js/midrun.js verbatim and patch `this.DIR = 'RR/' + this.slug`; keep that expression's shape greppable, and treat root-file renames as breaking.
4. **Registry over rosters** — commands/skills self-index from `description:` frontmatter; CLAUDE.md carries guards and routing only, never lists.
5. **No command >35KB; CLAUDE.md ≤200 lines; SKILL.md ≤500 lines.**
6. **Never hardcode names that change** — point at where to discover (a config key, a directory), not the current value.
7. **Voice lives in `.claude/output-styles/`** — CLAUDE.md, SKILL.md, commands carry zero voice.

---

## What you own

| Artifact       | Path                         |
| -------------- | ---------------------------- |
| Root CLAUDE.md | `CLAUDE.md`                  |
| Skill prompt   | `SKILL.md`                   |
| Commands       | `.claude/commands/**/*.md`   |
| Output styles  | `.claude/output-styles/*.md` |
| Scripts        | `.claude/scripts/*.sh`       |
| Settings       | `.claude/settings.json`      |

Docs (`README.md`, `design.md`, `engine/docs/`) are shared territory: PCM verifies their consistency with the prompt surface; `quality:doc` governs their format.

---

## How to process a change request

### Step 1 — Understand

Parse `$ARGUMENTS`. Dispatch: `audit` → the **Repo Consistency Audit** below; anything else → the change flow. Common categories: SKILL.md contract change, CLAUDE.md rule change, new command/skill, hook/script fix, release.

### Step 2 — Audit impact

Before ANY change, read every affected file and grep every reference across the repo — including `engine/src/` when the change describes engine behavior (SKILL.md args ↔ `config.ts`, artifacts ↔ `engine.ts` `files[]` writes).

### Step 3 — Plan

Group changes: breaking (atomic) vs non-breaking (independent).

### Step 4 — Execute

**Open the gate first.** The PreToolUse hook denies Edit/Write to `CLAUDE.md`, `SKILL.md`, and `.claude/**` unless BOTH session markers are fresh: reading `quality/prompt.md` stamps the quality marker automatically; the pcm marker is stamped with the exact command the deny message provides. Markers slide on every allowed edit; the Stop hook clears them at turn end. If a write is denied, follow the deny message and retry — never route around the hook.

- Preserve frontmatter shape (`name`, `description`, `argument-hint`).
- SKILL.md edits keep the operator-facing structure (Launch/args/Modes/Getting results/Recovery) — agents downstream navigate by those headings.

### Step 5 — Verify consistency

1. Grep for stale references to old names/paths.
2. SKILL.md args ↔ `config.ts` validation parity.
3. Version triple consistent (SKILL.md, engine/package.json, README).
4. Every `.claude/commands/**/*.md` carries `name:` + `description:`.
5. Script paths referenced in settings.json exist and are executable.

### Step 6 — Report

```
Infrastructure updated. N files changed.
Changes: [what + why]
Consistency verified: [stale refs: none/N fixed · SKILL↔engine parity · version triple]
Manual verification needed: [list or "none"]
```

---

## Release discipline

This repo IS the upstream (github.com/mreza0100/rr) — consumers resync from it. A release: (1) gates green (`npm test` + `typecheck` + `build` in engine/), (2) bump the version triple together, (3) commit source + regenerated `workflow.js`, (4) annotated tag `vX.Y.Z`, (5) `git push origin main --follow-tags`, (6) notify known vendoring projects to resync (they re-apply their DIR patch). Never force-push; the repo is public — no secrets, no founder PII, no machine-absolute paths in any commit.

---

## Repo Consistency Audit

Run when `$ARGUMENTS` starts with `audit`. **Read-only** — reports problems, does not fix them. Spawn one Explore agent per scope in parallel; aggregate after all return.

- **`skill`** — SKILL.md ↔ engine parity: every documented arg exists in `config.ts` (and every validated arg is documented); the artifact list matches `engine.ts` `files[]` writes; defaults quoted in prose match `config.ts` values; the version triple agrees.
- **`docs`** — README/design.md/V3-DESIGN.md claims spot-checked against `engine/src/` (stop conditions, fallback table, tier map); stale names; broken paths.
- **`infra`** — every command has valid frontmatter; scripts exist, are `+x`, keep `set -euo pipefail`; settings.json hook paths resolve; size limits hold (CLAUDE.md ≤200 lines, commands ≤35KB).
- **`cross-refs`** — CLAUDE.md guard claims match the hooks that enforce them; output-style pointers resolve; the greppable DIR patch line still exists in `workflow.js`.

Severity: CRITICAL (broken reference, parity violation) / WARNING (stale name, near-limit) / INFO. Report totals per severity, then: "Want me to fix these issues?"

---

## Authoring conventions — file skeletons

`quality:prompt` governs how lean the prose is; this governs the shape.

### Slash commands (`.claude/commands/**/*.md`)

```
---
name: cmd-name
description: One sentence. Action verb first.
argument-hint: [arg]
disable-model-invocation: true  # if side effects
---
{Numbered procedure — or markdown body if non-procedural}
```

`$ARGUMENTS` / `$1` / `$N` substitute at invocation.

### Skills (`SKILL.md` here or `.claude/skills/*/SKILL.md`)

```
---
name: lowercase-hyphenated
description: What it does AND when to use it. Highest-signal use case first. Third person. ≤1,024 chars.
---
{Role/scope · triggers · steps · 3-5 examples · non-obvious constraints}
```

Skill content stays in context for the rest of the session after invocation. Every line is a recurring tax.

### CLAUDE.md

Keep: commands Claude can't guess, invariants, non-obvious gotchas. NOT: standard conventions, file listings, platitudes, anything readable from the code. No skill/command rosters — Claude Code self-indexes; CLAUDE.md carries only guards, routing decisions, and mandatory-load obligations.

---

## Self-update protocol

After every execution, verify this command's knowledge is still accurate: the wiring diagram, the invariants, the owned-paths table. If anything is stale, update this file before completing the report — this command must never give outdated advice about its own repo.

---

## Rules

- **Never weaken sacred ground** — evidence integrity (computed confidence, honest degradation), the sandbox determinism contract, secrets/PII.
- **Never hand-edit workflow.js** — even for a "one-character" doc-string fix; it regenerates.
- **Minimal edits** — fewest changes possible; prefer deletion over addition.
- **Research before writing** — verify a claim against `engine/src/` before documenting it.
- **Sync in the same commit** — a behavior change and its SKILL.md/README prose land together.
- **Every check names what its OWN broken state reports** — authoring any gate/audit/probe, ask what it reports when IT is broken, not when the world is clean; same answer both ways = a coincidence detector that will bless the failure it exists to catch.
