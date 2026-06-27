# RR — Research and Report

**Version:** 2.0.0 · **License:** MIT · **Repo:** [github.com/mreza0100/rr](https://github.com/mreza0100/rr)

A Claude Code skill that runs a deterministic background **Workflow** to research a question — an unbounded, best-first, brainer-steered web crawl that **derives** the answer and writes a cited, multi-section report with a verdict and a plan.

## Why this exists

Ask an LLM to "research X" and it runs one search, reads the top hits, and summarizes. RR is for the questions that need more than that — where the answer has to be **built**, not found: a synthesis, a quantitative estimate, or a judgment no single source holds (*"estimate the distance to the nearest yet-undetected stellar-mass black hole, with error bars"*). RR gathers the components and **reasons them into one answer**, computing it when the answer is a number. It never stops because a fact wasn't found — a missing piece becomes stated uncertainty, not a dead end.

## How it works

One Opus **brainer** drives the whole run; everything else is its instrument.

```
Scout (haiku)        one broad sweep maps the landscape, seeds the first rabbit-holes
  → Prospector (opus) names the authoritative source venues for the topic
  → Research waves:
       brainer scores an id-keyed rabbit-hole store → looks up / originates the leads
       worth pursuing → parallel lane-researchers (haiku) WebSearch + WebFetch → the
       brainer folds findings into a living resultSoFar, re-scores via deltas, decides
       done; it derives any steering calculation itself mid-wave (reasoning or running code)
  → Sentinel (opus, goal mode) contests a premature "done" and can force one more wave
  → Finalize: initiator plans the finish → refine fact-checks each load-bearing fact →
       optional computement chain derives the quantitative answer (runs code, propagates
       error bars) → aggregator writes the report
  → Debug (opt-in) writes _debug.md
```

The brainer never re-emits the whole frontier — it returns **deltas** (rescore / add / look-up / rename / drop) against a persistent id-keyed store, and carries a structured **resultSoFar** (the answer + evidence + open gaps + derivation) wave to wave.

## Modes

| Mode | Trigger | What happens |
| --- | --- | --- |
| **goal** | `RR <question>` (default) | Satisficing — answers ONE question, stops when solid; a sentinel guards against stopping early |
| **collect** | `mode: 'collect'` | Exhaustive — inventories breadth until saturation (a landscape or roster) |
| **fast** | `rr fast <query>` | Skips the background run — one **Sonnet** sub-agent researches RR-style (with the rabbit-hole footer) and answers inline, right now |

## Installation

As a Claude Code skill — copy the runtime files into your project:

```bash
mkdir -p .claude/skills/rr
cp SKILL.md workflow.js persist.js .claude/skills/rr/
```

Then in Claude Code: `RR <question>`, `research <topic>`, `look into <topic>`, or `rr fast <query>`.

## Launch + results

```
Workflow({ scriptPath: "<skill-base-dir>/workflow.js",   // absolute — the CWD may be a child project
           args: { query, mode, compute, tag, debug, debugPrompt } })
```

`compute` defaults `true` (the master switch for all derivation; set `false` for a faster gather-only run). The run returns its artifacts in the completion output; persist them with `node <skill-base-dir>/persist.js <output-file>` → `RR/{slug}/result.md` (read this first) plus `_frontier.json`, `_tree.md`, and any `_compute-*` derivations.

## Build & development

`workflow.js` is a **build artifact** — never hand-edit it. The source is the modular project under `engine/`, which bundles to a single self-contained file the Workflow sandbox can run:

```bash
cd engine
npm install
npm run build      # bundles engine/src/ → ../workflow.js, then validates the sandbox contract
npm test           # vitest: unit + integration coverage of the engine logic
```

Edit `engine/src/` (the modules + `prompts/*.prompt.md`), rebuild, and commit both the source and the regenerated `workflow.js`.

## Key design decisions

- **A committed, sandbox-safe engine.** The bundle is a single self-contained file: `export const meta` at the top, no runtime imports, no non-deterministic globals — enforced by a build-time validator.
- **One brainer, delta-driven.** A single Opus brain scores and steers an id-keyed rabbit-hole store via deltas and carries a structured running answer, instead of re-deriving the whole frontier each wave.
- **Derive, don't just aggregate.** The brainer computes mid-wave itself to set direction; the Finalize phase fact-checks each load-bearing fact (refine) and, when the answer is quantitative, derives it with real code and propagated error bars.
- **Tiered models.** Haiku scouts + lane-researchers, Opus brainer / prospector / sentinel / initiator / compute / aggregator, Sonnet refine.
- **Prompts as templates.** Each agent prompt is a `prompts/*.prompt.md` template rendered by a builder; the build inlines them into the bundle.

## License

MIT
