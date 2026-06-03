# RR — Research & Report

**Version:** 1.2.0 · **License:** MIT · **Repo:** [github.com/mreza0100/rr](https://github.com/mreza0100/rr)

A Claude Code skill for structured, multi-agent research pipelines. Instead of a single search and a one-paragraph answer, RR runs a **Workflow** pipeline that builds knowledge in batches — each batch shaped by what the previous batch found — and finishes with a synthesized, confidence-rated report and an actionable plan.

## Why this exists

When you ask an LLM to "research X," it runs one search, reads the top results, and gives you a summary. That's fine for simple lookups. But for real research — comparing options, auditing a codebase, investigating regulations, evaluating trade-offs — you need a pipeline that:

1. **Maps the landscape** first (what are the sub-questions?)
2. **Fans out** into parallel research lanes (one per sub-question)
3. **Adversarially verifies** each finding (tries to refute it, flags single-source claims, re-rates confidence)
4. **Synthesizes** everything into a verdict + plan (not just raw findings)

RR does this. It delegates the work to a background Workflow so the main conversation stays clean, persists the full research record to a file, and delivers a terse executive summary.

## Two modes

| Mode    | Trigger       | What happens                                                                        |
| ------- | ------------- | ----------------------------------------------------------------------------------- |
| **RR**  | `RR <topic>`  | Runs a Workflow pipeline (scout → fan-out → verify → synthesize), delivers a report |
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
cp SKILL.md .claude/skills/rr/SKILL.md
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
  ├─ Step 3: Author & run the Workflow
  │    ├─ phase Scout:     one agent maps the landscape → 2-6 sub-questions
  │    ├─ phase Fan-out:   pipeline() lane per sub-question — research ─▶ adversarial verify
  │    └─ phase Synthesize: fold verified lanes → verdict + findings + plan + confidence
  ├─ Step 4: Write ONE aggregate file (workflow returns structured data; no intermediates)
  └─ Step 5: Deliver terse summary to user
       └─ Verdict + key findings + plan + file path
```

## Key design decisions

**Delegate to a Workflow, don't inline.** Research generates a lot of tool noise. RR runs a background Workflow so the main conversation stays clean and focused.

**Piped stages.** Each sub-question flows through its own `pipeline()` lane: the research result is piped straight into an adversarial verify stage. Lanes are independent — one verifies while another still researches.

**Dynamic batches, not a fixed plan.** Within a lane, each batch is shaped by what the previous batch found. If batch 3 was decided before batch 1 ran, it's not RR.

**One file, one run.** The pipeline produces exactly one research file. Workflow agents have no filesystem access, so the orchestrator writes it at the end from the workflow's structured return — no intermediates by construction.

**Adversarial verify.** Each finding gets a stage that tries to refute it, drops what it can't corroborate, flags single-source claims, and re-rates confidence. The first plausible answer is often a confident-sounding wrong one.

**Plan, not just findings.** A wall of facts is half the deliverable. Every RR run must produce a concrete, opinionated recommendation.

## Updating

Compare the `version` field in your installed `SKILL.md` frontmatter against the repo's latest:

```bash
cd /path/to/rr-repo && git pull
cp SKILL.md /your/project/.claude/skills/rr/SKILL.md
```

## License

MIT
