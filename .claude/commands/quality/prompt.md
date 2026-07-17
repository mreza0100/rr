---
name: quality:prompt
description: Use BEFORE editing any prompt file — CLAUDE.md, SKILL.md, .claude/commands/*.md, .claude/skills/*/SKILL.md, .claude/output-styles/*.md. Enforces Anthropic's prompt-quality rules — cut test, ≤200-line CLAUDE.md, ≤500-line skills, positive framing, no time-sensitive narration, one canonical term, frontmatter discipline. Mandatory load for /pcm.
---

# Prompt Quality

You are about to edit a prompt file that Claude Code loads at runtime. Every line is paid for on every invocation. Apply the rules below at write-time. This law binds runtime-loaded prompts; a human-consumed reference file (README, design.md, engine/docs/) follows `quality:doc` instead. The engine's own prompt templates (`engine/src/agents/*/prompts.ts`, `config.ts` fragments) are code — the spirit of these rules applies, but edits route through the engine gates (snapshot tests, build), not this file's hook.

**When to load:** `/pcm` loads this before editing any infrastructure prompt file. Also load it yourself before hand-editing any CLAUDE.md, command, skill, or output style.

## Cut mode — `quality:prompt cut <file>`

Rewrite the target leaner in place: read it, apply every rule below, cut hard. Preserve every distinct behavioral rule, threshold, and behavior-pinning example; cut scaffolding, never substance; unsure = keep and flag. Never weaken a sacred-ground rule (evidence integrity, sandbox determinism, secrets/PII) to save tokens. Every cut names its justification — the duplicate's surviving location or the failed cut test; a negative claim ("no duplicate", "zero references", "unused") is grep-verified before the cut lands, and a duplicate SECTION's heading is grep-checked for citers first (a cited section is a navigation index: keep it or retarget its citers). Report each cut in one line.

## The cut test (apply to every line)

> Would removing this line cause Claude to make a mistake?

If no — delete it. Bloat dilutes the rules that matter; the model "may start forgetting earlier instructions or making more mistakes" as the file grows.

## Compact aggressively (the layer below the cut test)

The cut test deletes lines that change nothing; this compacts the survivors. Run both passes, repeat until neither fires:

- **Merge.** Rules covering overlapping ground collapse into one that covers both.
- **One word for two.** Where one precise word carries a phrase, use it. Recurse clause by clause until removing any word costs meaning.

## The prompt stream — audit in context, not in isolation

A prompt rarely loads alone. The LLM reads one concatenated context: root `CLAUDE.md`, the auto-loaded skill descriptions, the active command, and every skill loaded this session — all at once. Audit a prompt against that whole stream: a rule may already live in a co-loaded file (duplication), contradict one (conflict), or push the combined context past what the model holds well (budget).

## Hard thresholds (Anthropic-published)

| File type                       | Limit                                                     |
| ------------------------------- | --------------------------------------------------------- |
| CLAUDE.md (any)                 | ≤ 200 lines                                               |
| SKILL.md body                   | ≤ 500 lines — split via progressive disclosure above this |
| Skill description + when_to_use | ≤ 1,536 chars combined                                    |
| Sub-agent body                  | No formal cap; Anthropic examples are 20–35 lines         |

Above threshold = split into a referenced file (one level deep, with a Table of Contents at the top if >100 lines).

## Anti-patterns — cut on sight

1. **Time-sensitive narration.** "On 2026-05-19...", "after the X incident", recency markers ("now", "recently", "no longer"), deferred-feature notes ("not wired yet"). Encode the current rule; incidents go in the commit message.
2. **Dates of change.** Version control already timestamps every change. State the current rule, never when it changed.
3. **Restating one rule — reworded OR repeated across sections.** State each rule ONCE in its canonical home. Before adding a rule, grep the file for its key noun; if it already lives somewhere, sharpen that one and stop. When a rule sits in both step prose and a Rules section, the Rules section is canonical; sacred-ground rules alone may keep one extra point-of-use reminder.
4. **Frontmatter ↔ body duplication.** If `description:` says it, the body opening must not.
5. **Voice flavor that doesn't change behavior.** Backstory, provenance ("adapted from X"). Keep the behavioral kernel, cut the costume. Voice lives in `.claude/output-styles/`; every other file carries zero voice.
6. **Rationale that rephrases the rule.** The rule's purpose lives in the rule's wording.
7. **Negative framing where positive works.** "Use prose paragraphs" beats "don't use bullets." Reserve NEVER for sacred ground.
8. **Aggressive emphasis on non-sacred rules** — "CRITICAL", "YOU MUST". Frontier models overtrigger on it. Reserve emphasis for invariants.
9. **Inconsistent terminology.** One canonical term per concept, used everywhere.
10. **Cross-references that say nothing new.** If the reference matters, summarize the takeaway inline.
11. **Inline cross-file restatement.** Each file keeps ONLY its local delta over what co-loads with it.
12. **Multiple options when one default suffices.**
13. **Examples that don't pin down behavior.** An example earns its tokens only if the rule alone wouldn't produce the same output.
14. **Vague descriptions.** "Helps with documents" → no auto-invocation.
15. **Deeply nested file references.** Keep references one level deep.
16. **Inline incident logs.** Once the rule is codified, the incident is redundant — commit message.
17. **Cross-document restatement.** Cite doc + section plus the local delta ("cite, don't restate").
18. **Token-heavy formatting.** HTML/XML wrappers, drawn ASCII boxes, decorative dividers — markdown gives structure free.
19. **List-item definitions read `- term: gloss`** — a plain term, a colon, one tight gloss; never bold-term + em-dash + `;`-chained run-ons.

## Teaching by example — when a stated rule keeps leaking

Repeated violation is confusion about where the rule applies, not disobedience — sharpening wording or piling on emphasis adds noise. Use a **contrastive example**: the tempting WRONG answer and its trap, then the correct one (✗→✓), drawn from a real failure. **Counterweight** every "avoid X" example with an "X is correct here" example, or you teach avoiding X everywhere.

## Example — encoding an incident rule

Wrong (in the prompt):

> The seed script once published the analysis request before registering the result waiter, so the seed hung to its full timeout. Never publish before registering again.

Right (in the prompt):

> Register the result waiter before publishing the analysis request.

## Pre-commit self-check (run before saving any prompt file)

1. **Cut test:** every surviving line changes behavior.
2. **Threshold:** under its limit (CLAUDE.md ≤200, SKILL.md ≤500).
3. **Frontmatter discipline:** body doesn't restate `description:`.
4. **One canonical term:** swept for synonym mixing.
5. **Positive framing:** every "do NOT" is sacred-ground.
6. **No time-stamps:** rules, not history.
7. **Emphasis only on invariants.**
8. **References one level deep.**
9. **Cross-file deduplication:** only the local delta survives.
10. **Colleague test:** followable with zero context.
11. **No duplication:** each rule's key noun greps to exactly ONE section; no skill/command rosters (Claude Code self-indexes them).

## Where things go (anti-bloat routing)

| Content                                   | Belongs in                                     | NOT in                       |
| ----------------------------------------- | ---------------------------------------------- | ---------------------------- |
| Behavioral rules                          | Prompt files (CLAUDE.md, SKILL.md, commands)   | —                            |
| Incident narratives                       | Commit messages                                | Prompt files                 |
| Architectural decisions / why-this-design | `design.md`, `engine/docs/`                    | Prompt files (encode the rule) |
| Voice / character flavor                  | `.claude/output-styles/`                       | Everything else (zero voice) |

## Hooks vs prompts

For things that must happen every time, write a hook (`.claude/settings.json` PreToolUse / PostToolUse) — deterministic, cheap. Prompts are advisory; the model can drift. Once a hook owns an invariant, delete the prompt rule that restated it — keeping both is duplication against a deterministic mechanism.

## Iteration discipline

When a rule fails in practice: observe Claude's actual output, diagnose (ambiguous? contradicted? buried in noise?), fix surgically — sharpen, move, scope. More emphasis is rarely the answer. Recurring structural failure → a hook.
