# RR — Research and Report

**Version:** 2.1.0 · **License:** MIT · **Repo:** [github.com/mreza0100/rr](https://github.com/mreza0100/rr)

A Claude Code skill that runs a deterministic background **Workflow** to research a question — an unbounded, best-first, brainer-steered web crawl that **derives** the answer and writes a cited, multi-section report with a verdict, stated assumptions, and a plan.

## Why this exists

Ask an LLM to "research X" and it runs one search, reads the top hits, and summarizes. RR is for the questions that need more than that — where the answer has to be **built**, not found: a synthesis, a quantitative estimate, or a judgment no single source holds (*"estimate the distance to the nearest yet-undetected stellar-mass black hole, with error bars"*). RR gathers the components and **reasons them into one answer**, computing it when the answer is a number. It never stops because a fact wasn't found — a missing piece becomes stated uncertainty, not a dead end.

## How it works

One Opus **brainer** drives the whole run; everything else is its instrument.

```
Scout (haiku)        one broad sweep maps the landscape, seeds the first rabbit-holes
  → Prospector (opus) names the authoritative source venues — and, when the topic is more
       active in another language, the native venues (tagged by language) to search in
  → Research waves:
       brainer scores an id-keyed rabbit-hole store → looks up / originates the leads
       worth pursuing (assigning each its venues) → parallel lane-researchers (haiku)
       WebSearch + WebFetch, capture each source's evidence quality (funding, conflicts,
       sample size, limitations) and follow-the-links (nextSources) → a per-wave validator
       (sonnet) checks the wave met its goal and reopens the failed or thin lanes → the
       brainer folds findings into a living resultSoFar, re-scores via deltas, and derives
       any steering calculation itself mid-wave (reasoning or running code)
  → Sentinel (opus, goal mode) contests a premature "done" and can force one more wave
  → Finalize: initiator plans the finish, grouping the load-bearing facts → refine
       adversarially hardens each fact group against the sources → an Opus JUDGE
       stress-tests the hardened answer — goal met? verification sound? compute needed and
       valid? — and steers a bounded remediation loop: the brain derives the answer (runs
       code, propagates error bars), refine re-checks a flagged fact, or the crawl reopens
       on a real gap → a synthesiser writes the report
  → Debug (opt-in) writes _debug.md
```

The brainer never re-emits the whole frontier — it returns **deltas** (rescore / add / look-up / rename / drop) against a persistent id-keyed store, and carries a structured **resultSoFar** (the answer + evidence + open gaps + derivation + assumptions) wave to wave.

**Adversarial by construction.** The agent that *derives* the answer is never the one that *approves* it. A per-wave validator catches a wave that quietly missed its goal; a terminal Opus judge then tries to break the finished answer — chasing disconfirming and null results, funding/conflicts of interest, replication, and retractions — before it ships.

**Multilingual.** When the subject is more active in another language, the prospector surfaces the native venues; the brainer routes the relevant lanes there; the lane-researcher translates the query into that language, reads the native results, and translates the findings back — carrying each source's original-language title alongside the English.

## Modes

| Mode | Trigger | What happens |
| --- | --- | --- |
| **goal** | `RR <question>` (default) | Satisficing — answers ONE question, stops when solid; a sentinel guards against stopping early |
| **collect** | `mode: 'collect'` | Exhaustive — inventories breadth until saturation (a landscape or roster) |
| **fast** | `rr fast <query>` | Skips the background run — a **Sonnet** lead nests parallel **Haiku** diggers down the rabbit-holes (with the footer) and answers inline, right now |

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
           args: { query, mode, compute, computerNote, thinkerNote, researcherNote, tag, debug, debugPrompt } })
```

- `compute` defaults `true` — the master switch for all derivation; set `false` for a faster gather-only run.
- `thinkerNote` steers the Opus reasoning tier (priorities, framing, audience); `researcherNote` steers the web agents (which sources to favour); `computerNote` adds run-specific guidance for derivations.

The run returns its artifacts in the completion output; persist them with `node <skill-base-dir>/persist.js <output-file>` → `RR/{slug}/result.md` (read this first) plus `_rabbitHoles.json`, `_tree.md`, and any `_compute-*` derivations. With `debug: true` (default) it also writes `_debug.md`.

## Build & development

`workflow.js` is a **build artifact** — never hand-edit it. The source is the modular TypeScript project under `engine/`, which bundles to a single self-contained file the Workflow sandbox can run:

```bash
cd engine
npm install
npm run build      # bundles engine/src/ → ../workflow.js, then validates the sandbox contract
npm test           # vitest: unit + integration coverage of the engine logic
```

Edit `engine/src/` — one directory per agent under `src/agents/<agent>/` (a `prompts.ts` template + an `index.ts` schema/tier) — then rebuild and commit both the source and the regenerated `workflow.js`.

## Key design decisions

- **A committed, sandbox-safe engine.** The bundle is a single self-contained file: `export const meta` at the top, no runtime imports, no non-deterministic globals — enforced by a build-time validator. The bundler is an acorn-AST pass, so it can never mis-strip an import or an export.
- **One brainer, delta-driven.** A single Opus brain scores and steers an id-keyed rabbit-hole store via deltas and carries a structured running answer, instead of re-deriving the whole frontier each wave.
- **Derive, don't just aggregate.** The brainer computes mid-wave itself to set direction; the Finalize phase hardens each load-bearing fact (refine) and, when the answer is quantitative, derives it with real code and propagated error bars.
- **Separate the deriver from the judge.** A per-wave validator and a terminal Opus judge pressure-test the work; neither is the brain that produced it, so the answer is never self-certified.
- **Tiered models.** Haiku scouts + lane-researchers; Sonnet validator + refine; Opus brainer / prospector / sentinel / initiator / judge / synthesiser / debug-analyst.
- **Prompts as code.** Each agent is a `src/agents/<agent>/` module — a backtick prompt template plus its schema and tier; the build inlines them into the bundle.

## License

MIT
