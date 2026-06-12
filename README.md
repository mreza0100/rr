# RR — Research & Report

**Version:** 1.3.1 · **License:** MIT · **Repo:** [github.com/mreza0100/rr](https://github.com/mreza0100/rr)

A Claude Code skill for structured, multi-agent research pipelines. Instead of a single search and a one-paragraph answer, RR runs a **Workflow** pipeline that builds knowledge in batches — each batch shaped by what the previous batch found — and finishes with a synthesized, confidence-rated report and an actionable plan.

## Why this exists

When you ask an LLM to "research X," it runs one search, reads the top results, and gives you a summary. That's fine for simple lookups. But for real research — comparing options, auditing a codebase, investigating regulations, evaluating trade-offs — you need a pipeline that:

1. **Maps the landscape** first (what are the sub-questions?)
2. **Researches in judge-steered rounds** — after every research wave, a judge reads ALL findings so far and decides the next wave's questions; research → judgment → research, never a plan fixed up front
3. **Refuses to stop early** — the judge may only declare saturation after a pressure-test round has hunted counter-evidence
4. **Adversarially verifies** the load-bearing claims (tries to refute each, flags single-source claims, re-rates confidence)
5. **Synthesizes** everything into a verdict + plan (not just raw findings)

RR does this. It delegates the work to a background Workflow so the main conversation stays clean, persists the full research record to a file, and delivers a terse executive summary.

## Two modes

| Mode    | Trigger       | What happens                                                                        |
| ------- | ------------- | ----------------------------------------------------------------------------------- |
| **RR**  | `RR <topic>`  | Runs the committed Workflow engine (scout → judge-steered rounds → verify → synthesize), delivers a report |
| **RRP** | `RRP <topic>` | Writes a self-contained prompt you can run in another chat                          |

## Three research surfaces

| Surface      | Tools used             | When to pick                                                 |
| ------------ | ---------------------- | ------------------------------------------------------------ |
| **internet** | WebSearch, WebFetch    | External topics — libraries, regulations, market research    |
| **codebase** | Read, Grep, Glob, Bash | Internal topics — "how is auth wired", "audit our data flow" |
| **both**     | All of the above       | Mixed — "best practice X and how we currently do it"         |

RR infers the surface from the topic. If ambiguous, it asks.

## Installation

### As a Claude Code skill

```bash
# From your project root
mkdir -p .claude/skills/rr
cp SKILL.md workflow.js .claude/skills/rr/
```

Then use it in Claude Code:

```
RR <topic>              — run a full research pipeline
RRP <topic>             — write a portable research prompt
research <topic>        — alias for RR
look into <topic>       — alias for RR
```

## Pipeline architecture

```
User: "RR <topic>"
  │
  ├─ Step 1: Refine the goal (what do they actually want?)
  ├─ Step 2: Determine storage path
  ├─ Step 3: Launch the committed engine — Workflow({scriptPath: '.claude/skills/rr/workflow.js'})
  │    ├─ phase Scout:    one agent maps the landscape → 2-6 sub-questions     (opus)
  │    ├─ repeat until saturated or round cap (default 4):
  │    │    ├─ phase Research: wave of researchers (sonnet) ∥ decided-retrieval
  │    │    │                  collectors (haiku) — barrier at end of wave
  │    │    └─ phase Judge:   reads ALL findings, steers the next wave,        (opus)
  │    │                      calls saturation only after a pressure-test round
  │    ├─ phase Verify:   one adversarial skeptic per load-bearing claim       (sonnet)
  │    └─ phase Synthesize: writes the ONE report file, returns exec summary   (opus)
  ├─ Step 4: Verify the file landed (backfill from the structured return if not)
  └─ Step 5: Deliver terse summary to user
       └─ Verdict + key findings + plan + file path
```

## Key design decisions

**Delegate to a Workflow, don't inline.** Research generates a lot of tool noise. RR runs a background Workflow so the main conversation stays clean and focused.

**A committed engine, not an improvised script.** `workflow.js` ships with the skill and is invoked via `scriptPath` — the loop is enforced by a scheduler, never re-authored per run. A prose protocol asks the model to iterate; a scheduler makes the judge's output literally become the next round's input.

**Judge-steered rounds, not one fan-out.** Researchers within a wave run in parallel on different sub-questions; the dynamism lives between waves — the judge reads everything found so far, flags contradictions, and writes the next wave's questions. Decided retrievals (exact URL / grep / file) go to cheap collectors. The judge may only saturate after a pressure-test round has hunted counter-evidence.

**Tiered models.** Judgment (scout, judge, synthesizer) stays on opus; researchers and verifiers ride sonnet; decided-retrieval collectors ride haiku. An optional `sacred: true` lifts every stage to opus for compliance-grade topics. Collectors return raw excerpts + sources and never conclude — judgment never delegates down.

**One file, one run.** The pipeline produces exactly one research file — the synthesizer writes it from inside the workflow, and the orchestrator verifies it landed (backfilling from the structured return if not). No intermediates by construction.

**Adversarial verify.** Each load-bearing claim gets a skeptic that tries to refute it, drops what it can't corroborate, flags single-source claims, and re-rates confidence. The first plausible answer is often a confident-sounding wrong one.

**Plan, not just findings.** A wall of facts is half the deliverable. Every RR run must produce a concrete, opinionated recommendation.

## Updating

Compare the `version` field in your installed `SKILL.md` frontmatter against the repo's latest:

```bash
cd /path/to/rr-repo && git pull
cp SKILL.md workflow.js /your/project/.claude/skills/rr/
```

## License

MIT
