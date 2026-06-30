# RR — Research and Report

**Version:** 2.3.0 · **License:** MIT · **Repo:** [github.com/mreza0100/rr](https://github.com/mreza0100/rr)

A Claude Code skill that runs a deterministic background **Workflow** to research a question — an unbounded, best-first, brainer-steered web crawl that **derives** the answer and writes a cited, multi-section report with a verdict, stated assumptions, and a plan.

## Why this exists

Ask an LLM to "research X" and it runs one search, reads the top hits, and summarizes. RR is for the questions that need more than that — where the answer has to be **built**, not found: a synthesis, a quantitative estimate, or a judgment no single source holds (*"estimate the distance to the nearest yet-undetected stellar-mass black hole, with error bars"*). RR gathers the components and **reasons them into one answer**, computing it when the answer is a number. It never stops because a fact wasn't found — a missing piece becomes stated uncertainty, not a dead end.

## How it works

One Opus **brainer** drives the whole run; everything else is its instrument.

```
Scout (haiku)         one broad sweep maps the landscape, seeds the first rabbit-holes
  → Prospector (opus) names the authoritative source venues — and, when the topic is more
        active in another language, the native venues (tagged by language) to search in
  → Research waves:
        brainer scores an id-keyed rabbit-hole store → looks up / originates the leads worth
        pursuing, authoring a per-lane note (what to find + ranked fallbacks) → a Scheduler
        (sonnet) batch-discovers + sizes the best sources per lane (web-search, then
        mcp__harvester__fetch size_only) → code bin-packs each lane into <=130k-token
        reader-units and runs one sequential reader thread per lane (haiku), reading the
        cached source slices off disk and carrying a running answer across them → a per-wave
        validator (sonnet) checks coverage and reopens thin lanes → the brainer folds the
        findings into a living resultSoFar, re-scores via deltas, decides done, and derives
        any steering calculation itself mid-wave (reasoning or running code)
  → Finalize: initiator groups the load-bearing facts → refine adversarially hardens each
        group against the sources → an Opus JUDGE (the sole terminal skeptic) stress-tests the
        hardened answer — goal met? verification sound? compute needed and valid? — and steers
        a bounded remediation loop: the brain derives the answer (runs code, propagates error
        bars), refine re-checks a flagged fact, or the crawl reopens on a real gap → a
        synthesiser writes the report
  → Debug (opt-in) writes _debug.md
```

Fetching runs through **Harvester** (an MCP server) — it resolves walled sources via the legal open-access chain (DOI → Unpaywall / OpenAlex / Europe PMC / …), reads PDFs and books, views images, and falls back through Chrome-impersonation + the Wayback Machine when a URL is blocked — so the readers work on primary literature, not just the open web.

The brainer never re-emits the whole frontier — it returns **deltas** (rescore / add / look-up / rename / drop) against a persistent id-keyed store, and carries a structured **resultSoFar** (the answer + evidence + open gaps + derivation + assumptions) wave to wave.

**The brainer tree (`maxParallelBrainers`).** When a goal holds two or more genuinely independent investigations, a brainer can **spawn** a focused child onto one branch — a clean deep-copy of its store + memory, aimed by a mandate. The children run in parallel; the first whose answer the judge upholds wins (its report becomes `result.md`), a child may abandon a dead-end branch, and every non-winner's partial is preserved. Default `1` (single brainer); raise to `2`–`5` for goals with several deep, separable branches.

**Adversarial by construction.** The agent that *derives* the answer is never the one that *approves* it. A per-wave validator catches a wave that quietly missed its goal; a terminal Opus judge then tries to break the finished answer — chasing disconfirming and null results, funding / conflicts of interest, replication, and retractions — before it ships.

**Multilingual.** When the subject is more active in another language, the prospector surfaces the native venues; the brainer routes the relevant lanes there; the reader translates the query into that language, reads the native results, and translates the findings back — carrying each source's original-language title alongside the English.

## Modes

| Mode | Trigger | What happens |
| --- | --- | --- |
| **goal** | `RR <question>` (default) | Satisficing — answers ONE question, stops when solid; the judge guards against stopping early |
| **collect** | `mode: 'collect'` | Exhaustive — inventories breadth until saturation (a landscape or roster) |
| **fast** | `rr fast <query>` | Skips the background run — a **Sonnet** lead nests parallel **Haiku** diggers down the rabbit-holes and answers inline, right now |

## Installation

As a Claude Code skill — copy the runtime files into your project:

```bash
mkdir -p .claude/skills/rr
cp SKILL.md workflow.js persist.js .claude/skills/rr/
```

RR fetches through the **Harvester** MCP server ([github.com/mreza0100/harvester-web-mcp](https://github.com/mreza0100/harvester-web-mcp)) — install and connect it first; without it, every fetch errors and the run is snippet-only. Then in Claude Code: `RR <question>`, `research <topic>`, `look into <topic>`, or `rr fast <query>`.

## Launch + results

```
Workflow({ scriptPath: "<skill-base-dir>/workflow.js",   // absolute — the CWD may be a child project
           args: { query, mode, maxParallelBrainers, compute, computeNote, thinkerNote, researcherNote, tag, debug, debugPrompt } })
```

- `compute` defaults `true` — the master switch for all derivation; set `false` for a faster gather-only run.
- `maxParallelBrainers` defaults `1` — raise to `2`–`5` to let the brainer spawn focused children for independent investigations (the brainer tree).
- `thinkerNote` steers the Opus reasoning tier (priorities, framing, audience); `researcherNote` steers the web agents (which sources to favour); `computeNote` adds run-specific guidance for derivations.

The run returns its artifacts in the completion output; persist them with `node <skill-base-dir>/persist.js <output-file>` → `RR/{slug}/result.md` (read this first) plus `_rabbitHoles.json`, `_tree.md`, and any `_compute-*` derivations. With `debug: true` (default) it also writes `_debug.md`. A multi-brainer run additionally writes `_brainers.json` + `_brainers-tree.md` and each non-winning brainer's `result-<name>.md`.

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
- **One brainer, delta-driven — that can fork.** A single Opus brain scores and steers an id-keyed rabbit-hole store via deltas and carries a structured running answer; for a goal with independent branches it can spawn focused child brainers (the brainer tree) that race to the first judge-upheld answer.
- **Derive, don't just aggregate.** The brainer computes mid-wave itself to set direction; the Finalize phase hardens each load-bearing fact (refine) and, when the answer is quantitative, derives it with real code and propagated error bars.
- **Separate the deriver from the judge.** A per-wave validator and a terminal Opus judge pressure-test the work; neither is the brain that produced it, so the answer is never self-certified.
- **Fetch through Harvester.** All fetching routes through the Harvester MCP — legal open-access resolution, PDF / book / image parsing, and a wall-bypass chain — so the readers reach primary literature, not just snippets.
- **Tiered models.** Haiku scout + readers; Sonnet scheduler + validator + refine; Opus brainer / prospector / initiator / judge / synthesiser / debug-analyst.
- **Prompts as code.** Each agent is a `src/agents/<agent>/` module — a backtick prompt template plus its schema and tier; the build inlines them into the bundle.

## License

MIT
