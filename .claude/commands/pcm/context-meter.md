---
name: pcm:context-meter
description: "Audits Claude Code context consumption across this repo's prompt surface — CLAUDE.md, SKILL.md, commands, output styles — ranks the heaviest offenders against the size limits, and reports prioritized token savings. Triggered by 'context budget', 'context meter', 'audit context', 'what's eating my context', or after growing SKILL.md or a command."
---

# Context Budget

Measure what every loaded component costs in context, find the bloat, rank fixes by tokens reclaimed.

## Measure

Token estimate: `words × 1.3` for prose, `chars / 4` for code/tables. Report bytes (exact) and tokens (the budget that matters); treat `/context` as ground truth and reconcile against it. The `wc` sweeps may run on a cheap child; the judgment stays with the auditor.

| Surface       | Path                         | Limit                  | Flag when                                                                       |
| ------------- | ---------------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| Repo rules    | `CLAUDE.md`                  | 200 lines              | > 200 lines                                                                     |
| Skill prompt  | `SKILL.md`                   | 500 lines / 1,024-char description | description bloat is the worst kind — it loads in EVERY consumer session |
| Commands      | `.claude/commands/**/*.md`   | 35 KB                  | > 35 KB                                                                         |
| Output styles | `.claude/output-styles/*.md` | —                      | loaded per-invocation; flag only if a command adopts one it doesn't use         |

```bash
wc -lc CLAUDE.md SKILL.md .claude/commands/**/*.md .claude/output-styles/*.md | sort -rn | head -15
```

## Classify

- **Always loaded (every consumer session):** SKILL.md `description:` frontmatter — weigh it hardest; it is this repo's export tax on every project that installs the skill.
- **This-repo always loaded:** CLAUDE.md + command/skill descriptions.
- **On demand:** command bodies, SKILL.md body, output styles — paid only when invoked.

## Report

```
Context Budget — rr
Surface          Lines/Bytes   ~Tokens
CLAUDE.md        …             …
SKILL.md         …             …  (description: N chars of every consumer session)
Commands (N)     …             …
Over limit: <file> <size> (limit <limit>) → <suggested trim>
Top savings: 1. <action> → ~N tokens …
```

## Rules

- Report only — never edit. Trimming routes through `/pcm` (it loads `/quality:prompt`).
- Rank by tokens reclaimed; target always-loaded surfaces before on-demand bodies.
- Verify counts against the filesystem (`wc`), never a doc's claim about itself.
