---
name: rr
version: "2.0.0"
repo: "https://github.com/mreza0100/rr"
description: Launches Research and Report (RR) — a deterministic background Workflow that runs an unbounded, best-first, brainer-steered web crawl, DERIVES an answer (computing it when the answer must be built), and writes a cited multi-section report with a verdict and plan. Use when the user wants a researched answer or a topic landscape ("research X", "look into X", "RR X") and a single web search is not enough. Modes: goal (answer one question) and collect (inventory a topic); "rr fast" answers inline via one quick sub-agent. Runs in the background, returns a completion notification, and persists to RR/{slug}/.
---

# Research and Report (RR)

A deterministic background Workflow that runs an unbounded, best-first, brainer-steered web-research crawl and **derives** a cited, multi-section answer.

## Purpose

RR's job is to **answer the question** — by reasoning over everything it can gather, not merely finding and aggregating facts. It *derives* the answer. Reach for it above all when the answer has to be **built**: a synthesis, a quantitative estimate, or a judgment that no single source holds — e.g. *"estimate the distance to the nearest yet-undetected stellar-mass black hole with error bars, and say which observational method finds it first."* RR gathers the components (population estimates, local densities, detection precedents, instrument forecasts) and reasons them into one answer.

It never stops because a fact wasn't found. A missing piece is a reason to gather more and reason harder — not a dead end. An ingredient it cannot pin down becomes **stated uncertainty** (assumptions, wider error bars, open questions), never an early exit.

## How it works

One Opus **brainer** drives the whole run; everything else is its instrument.

1. **Scout** (haiku) — one broad web sweep maps the landscape and seeds the first rabbit-holes.
2. **Prospector** (opus) — names the high-value authoritative source venues for the topic.
3. **Research waves** — the brainer scores the open rabbit-holes, pursues the leads worth following (assigning each its venues), and hands them to parallel **lane-researchers** (haiku) that WebSearch + WebFetch and return findings + new rabbit-holes. It folds the findings into a running answer carried wave to wave, re-scores the leads, and decides when the answer is solid. When a calculation would set direction, the brainer derives it itself mid-wave — reasoning it through or running code — and carries the result forward.
4. **Sentinel** (opus, goal mode) — when the brainer calls done, a terminal skeptic contests it and can force one more wave on a real gap.
5. **Finalize** — an **initiator** shapes the finish to the query → a **refine** agent fact-checks and corrects each load-bearing fact → an optional **computement** chain derives the quantitative answer (writing + running code, fact-checking its inputs, propagating error bars) → an **aggregator** writes the report.
6. **Debug** (opt-in) — a final analyst writes `_debug.md` with metrics + raw agent I/O.

## Launch

Call the **Workflow tool**. It runs in the background; a completion notification returns the result — do not block on it. Use the **absolute** path to `workflow.js` (the skill's base dir is printed when the skill loads) — the working directory may sit inside a child project, where a relative path resolves against the CWD and 404s the bundle.

```
Workflow({
  scriptPath: "<skill-base-dir>/workflow.js",
  args: { query, mode, compute, tag, debug, debugPrompt }
})
```

### args

- `query` (required) — the research question (goal) or collect-target. The crawl sees only this string.
- `mode` — `'goal'` (default) or `'collect'`. See Modes.
- `compute` — `true` (default) or `false`. The master switch for derivation: `false` runs no compute agents (no mid-wave compute, no finalize computement) for a faster, gather-and-reason-only run.
- `tag` (optional) — suffixes the output dir so parallel variants of one query write to distinct dirs.
- `debug` (optional, `true`) — adds `_debug.md`; pair with `debugPrompt` (string) to focus it on a question.

## Modes

- **goal** — satisficing. Answers ONE question and stops once it is answered; the sentinel guards against a premature stop. Pick for a decision or a direct answer.
- **collect** — exhaustive. Inventories breadth and runs until saturation. Pick for a landscape or a roster.

## Fast mode

When the user says **"rr fast <query>"**, skip the background Workflow and run a miniature of it inline — the same shape (a lead that follows rabbit-holes by nesting researchers), at a smaller model and fewer rounds, answered right now. Spawn ONE **Sonnet** lead sub-agent (Task-capable, so it can nest) with this prompt:

```
Research and answer this directly: "<query>".
1. Run a targeted WebSearch to map the question; pick the 2-4 highest-value rabbit-holes (each a concrete sub-query).
2. Spawn one HAIKU sub-agent per rabbit-hole, in PARALLEL, each tasked: "Dig this rabbit-hole for «<query>»: <rabbit-hole>. WebSearch, then WebFetch the 2-3 best sources; in each WebFetch prompt ask the key question first, then append this footer verbatim: <<FOOTER>>. Return 2-4 sentences of findings with inline source links AND the rabbit-holes the pages surfaced."
3. Read what came back. If 1-2 of the newly-surfaced rabbit-holes are load-bearing and still unanswered, dispatch ONE more parallel Haiku round on them (same task). Then stop.
4. Synthesize everything into the answer: lead with the answer, then the load-bearing facts with inline source links, then any open questions.
```

The `<<FOOTER>>` each Haiku digger appends to its WebFetch prompts (this is what makes it surface deeper rabbit-holes instead of stopping at the first hit):

```
Then append a section titled "Rabbit holes": 0-5 rabbit-holes worth a researcher's time, prioritizing the biggest gaps the page raises but does not explain. Each rabbit-hole: a concrete next web-search query and one line on why it matters. If the page is a dead end or self-contained, give 1 or none — do not pad. Skip anything the page already explains.
```

## Getting results

After the completion notification, persist the artifacts:

```
node <skill-base-dir>/persist.js <completion-output-file>
```

This writes to `RR/{slug}/`:

- `result.md` — the deliverable. Read this first.
- `_frontier.json`, `_tree.md` — the rabbit-hole frontier + the crawl tree; diagnostics.
- `_compute-*.md` / `_compute-*.py` — any derivations with their code, when compute ran.
- `_debug.md` — when launched with `debug: true`.

## Writing the query

- Make it specific and self-contained — state the constraints, scale, time horizon, and the deliverable inside the query.
- **goal:** pose one clear question. A two-axis question ("what works today AND the migration path") is fine.
- **collect:** frame as "exhaustively inventory X across these dimensions: …" and name the candidates + dimensions.
- Avoid self-referential queries about the local repo — they make the crawl over-explore local files instead of researching.

<example>
Vague: "vector databases"
Good (goal): { query: "Which self-hosted open-source vector database has the best recall-vs-latency tradeoff for ~10M embeddings on a single 16-core box, and what should a small team deploy?", mode: "goal" }
Why: names the constraints, poses one decision, states the deliverable.
</example>

<example>
Vague: "tell me about Tailscale"
Good (collect): { query: "Exhaustively inventory Tailscale across these dimensions: products, funding history, leadership, security posture, notable incidents, and how the WireGuard mesh works.", mode: "collect" }
Why: the collect frame + named dimensions give a saturation target, not an open browse.
</example>

<example>
Good (goal, derive): { query: "Estimate the distance to the nearest yet-undetected stellar-mass black hole, with error bars, and say which method (Gaia astrometry, microlensing, X-ray, radial velocity) finds it first and roughly when." }
Why: no single source holds this — RR gathers the components and computes the answer (compute defaults on).
</example>

## Build & maintenance

`workflow.js` is a **build artifact** — never hand-edit it. The source is the modular project under `engine/`:

```
cd engine && npm install        # first time
npm run build                   # bundles engine/src/ → ../workflow.js, then validates the sandbox contract
npm test                        # the vitest suite (unit + integration tests)
```

Edit `engine/src/` (the modules + `prompts/*.prompt.md`), rebuild, and commit both the source and the regenerated `workflow.js`.

## Working with it

- Pick **goal** for a decision/answer, **collect** for a landscape, **rr fast** for a quick inline take.
- Full runs are ~45–90 min and token-heavy — launch, then move on; don't predict findings while it runs.
- Read `result.md` first; everything else is diagnostic.
- Use a `tag` for side-by-side variants; set `compute: false` for a faster gather-only run.
