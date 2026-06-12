---
name: rr
version: "1.3.0"
repo: "https://github.com/mreza0100/rr"
description: Reza's Research-and-Report protocol. Research can target the **internet, the local codebase, or both** — RR detects this from the topic and tells the agents which sources to use. Two modes — RR (launch the deterministic research workflow that runs scout → judge-steered research rounds → adversarial verify → synthesize and writes the report) and RRP (write a self-contained prompt for the user to run in another chat). Triggered when the user says "RR", "research and report", "RRP", "RR-prompt", "research <topic>", "look into <topic>", or "find out <topic>". Use this skill INSTEAD of jumping straight to web search OR straight to grep — RR is a structured research pipeline, not a single query.
---

# RR — Research & Report

> Reza's research protocol. The trigger is `RR` — short for "research and report".

When the user says "RR <topic>", they don't want a single search and a one-paragraph answer. They want a **dynamic research pipeline** that builds knowledge in batches, where each batch is shaped by what the previous batch found, and that finishes with a **report and a plan** — not raw findings.

**Research surface — pick before spawning:**

| Surface | Tools the agent uses | When to pick |
|---------|---------------------|--------------|
| **internet** | WebSearch, WebFetch, context7 | External topics — libraries, regulations, market, competitive landscape, "what does X look like in 2026" |
| **codebase** | Read, Grep, Glob, Bash | Internal topics — "how is auth wired", "where do we use SQS", "find every place that touches PHI", "audit our consent flow" |
| **both** | All of the above | Mixed — "RR best-practice X and how we currently do it", "compare our impl to GraphQL Yoga's recommended pattern" |

If the user doesn't specify, infer from the topic. If genuinely ambiguous, ask one short question ("internet, codebase, or both?") rather than guess. Name the surface in the briefing so the agent uses the right tools.

There are two modes:

| Mode    | Trigger                                                                             | Output                                                                                                       |
| ------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **RR**  | "RR <topic>", "research and report on X", "research X", "look into X", "find out X" | Launch the research workflow (scout → research/judge rounds → verify → synthesize), then deliver its report  |
| **RRP** | "RRP <topic>", "RR-prompt for X", "write me an RR prompt for Y"                     | Write a self-contained prompt the user runs in another chat; do NOT execute and do NOT spawn an agent       |

---

## Mode 1 — RR (launch the research workflow)

**Don't run the pipeline in the main conversation.** Research generates a lot of tool noise — WebSearch results, fetched pages, context7 dumps, grep output — that you don't want filling the main thread. Launch the deterministic workflow instead: `workflow.js` (this directory) schedules every stage in the background, the synthesizer writes the research file, and the run returns only the executive summary. You verify the file and deliver the summary.

### Step 1 — Refine the goal (in reasoning, not output)

Before doing anything, work out in your reasoning what the user **actually** wants from this research. The topic as stated is rarely the goal:

- "RR vector DBs" → probably means "which vector DB should we use for this project given our stack and scale" — not a generic survey.
- "RR EU AI Act timeline" → probably means "what do we have to do and by when, for our specific risk class" — not a Wikipedia summary.

Restate the refined goal to yourself. If the refinement materially changes the scope and you're not sure, ask the user one short clarifying question before launching the workflow. Otherwise proceed.

### Step 2 — Determine the storage path

Every RR run produces a research file. **All research output goes to a single centralized directory regardless of which command invoked RR:**

**Storage directory:** `RR/` (gitignored local sandbox, like `RND/` — RR research is working material, not committed)

**Filename convention:** `{caller}-{topic-slug}-{YYYY-MM-DD}.md` where `{caller}` is the command or agent that triggered the RR (e.g., `mentor-funding-landscape-2026-05-10.md`, `professor-eu-llm-providers-2026-05-10.md`). If RR was triggered standalone (no command active), use `dev` as the caller prefix. Use today's date from the environment context.

**File contract** (declared copy of the synthesizer brief in `workflow.js` — update both together): ONE file, no intermediates, sections in this order: (1) Prompt — original request + refined goal, (2) Research rounds — per round, questions asked + judge assessment, (3) Scout landscape, (4) Findings per sub-question — claims with sources, confidence, verification verdicts, (5) Verdict + overall confidence, (6) Plan, (7) Open questions if any.

### Step 3 — Launch the research workflow

The pipeline is deterministic — `workflow.js` schedules every stage; the loop is never improvised. Flow graph (declared copy of the script — update both together):

> **scout** → repeat: [**research wave** ∥ → **judge**] until saturated or round cap (default 4) → **adversarial verify** → **synthesize** → report file

The judge is the only stage that thinks: after every wave it reads ALL findings so far and decides the next wave — new open questions go to researchers, decided retrievals (exact URL / grep pattern / file) go to cheap collectors. Research → judgment → research, never a plan fixed up front. The judge saturates only after a pressure-test round has hunted counter-evidence.

**Stage→model:** judgment (scout, judge, synthesizer) = `opus`; researchers and verifiers = `sonnet`; decided-retrieval collectors = `haiku`. `sacred: true` (compliance or clinical topics) lifts every stage to `opus` — no cheap collectors near that ground.

Invoke from the main conversation:

```
Workflow({ scriptPath: '.claude/skills/rr/workflow.js', args: {
  goal,          // refined goal from Step 1 — not the raw topic
  context,       // cold-start briefing: stack, constraints, why the question is asked — workflow agents see nothing else
  surface,       // 'internet' | 'codebase' | 'both'
  reportPath,    // storage path from Step 2
  timestamp,     // today's date YYYY-MM-DD from the environment (workflow scripts cannot read the clock)
  subQuestions,  // optional [{q, rationale}] — when the goal is already structured ("compare A, B, C"), skips the scout
  sacred,        // optional — true for compliance/clinical surfaces
  maxRounds,     // optional, default 4
}})
```

Tell the user one sentence — "RR workflow dispatched — scout, research/judge rounds, verify, synthesize." — and let it run. Don't predict findings.

**Sub-agent path (no Workflow tool):** an agent running RR inside its own context (e.g. a researcher sub-agent spawned by another command) executes the same flow graph itself — it is scout, judge, and synthesizer in one context; decided retrievals may go to `model: "haiku"` collector children that return raw excerpts + sources and never conclude; judgment never delegates down; sacred surfaces keep all retrieval at the agent's own tier.

### Step 4 — Verify the file landed

When the workflow completes, confirm the file exists at the storage path and carries every section of the Step 2 file contract (a quick `ls` + `wc -l`, not a full re-read). If the run returned `fileWritten: false` or findings without the file, write the file yourself from the returned record before delivering.

### Step 5 — Deliver the aggregate report

The **one file at the storage path is the complete record.** There are no other files to read. The user does NOT want the per-lane parade or the per-sub-question expansion in the chat — they want the synthesized answer, with a pointer to the single file that has everything.

**Default chat output — terse:**

```
Saved: {full path to file}

## Verdict
{1-3 sentences — the headline answer / decision / recommendation} (confidence: high/medium/low)

## Findings (key points)
{3-7 bullets — the substantive answer condensed. Cite sources inline where it matters.}

## Plan
{concrete, opinionated, actionable — the action the user should take. If a decision: name it.}

## Open questions
{anything unresolved, only if material. Skip the section entirely if there's nothing.}
```

**Do NOT print the round-by-round trail in the chat.** That belongs in the file. If the user wants to see how the research got there, they read the file or ask "show me the rounds."

The **file** carries the full structure per the file contract — that's the persisted research record. Your **chat reply** is the executive summary: Verdict + key Findings + Plan + path to the file.

If the run's summary is thin on Plan or Verdict, write it yourself from the findings, clearly marking it as your synthesis.

---

## Mode 2 — RRP (write a prompt for someone else to execute)

When the user says RRP, they will run the prompt **in a different chat** (often a fresh context, possibly a different model). Your job is to write a prompt that produces a usable RR report **without** the executor having access to this conversation, this codebase, or any of the surrounding context.

### Constraints on the prompt you write

- **Self-contained.** No "as we discussed", no reference to prior turns, no assumption that the executor has read any file. If context matters (project stack, scale, constraints, deadline), inline it in the prompt.
- **Goal first, topic second.** State the refined goal at the top so the executor doesn't waste batches figuring out what's actually wanted.
- **State the surface.** "Research surface: internet / codebase / both." For codebase research the executor needs path orientation; for internet research the executor needs a time horizon.
- **Embed the RR protocol inline.** Do NOT assume the executor has the `rr` skill. Briefly explain the dynamic-batch pipeline, the "satisfies and beyond N+1" rule, and the required report structure. ~10 lines is enough — copy the essentials below.
- **Specify the deliverable shape.** Tell the executor exactly which sections to return (Verdict / Findings / Plan / Open questions in the chat reply; full Pipeline run details in the saved file if any).
- **Name the time horizon (internet research).** "Use sources from 2025–2026 unless older is the canonical reference." Stale data is the #1 RR failure mode for internet topics.
- **Authorize tools.** Internet: "Use web search, fetch official docs, prefer primary sources over blog summaries." Codebase: "Use grep, glob, read; prefer reading actual code over guessing from doc strings."
- Do **not** include secrets, internal URLs, or anything Reza wouldn't paste into a fresh chat window.

### Output format for RRP mode

Wrap the prompt in a fenced block so Reza can copy-paste it cleanly. Briefly above the block, state in one line what context you embedded so he can sanity-check.

```
Context I embedded: {one line}

---PROMPT BELOW — copy into another chat---

```

{the prompt}

```

```

### Reusable RR-protocol snippet to embed inside RRP prompts

When writing an RRP, paste a compact version of the protocol so the executor knows the shape. Suggested wording:

> Run this as a **dynamic research pipeline**, not a single search/grep. The research surface is **{internet / codebase / both}** — use those tools accordingly (web search & fetch for internet; read/grep/glob/bash for codebase). Start with one entry-point query to map the landscape, then plan each next batch based on what the previous batch returned — not a plan written up front. Continue until the goal is answered, then do one extra "pressure-test" batch to look for counter-evidence, newer sources, or contradicting code paths before stopping. Return the result in this shape: **Verdict** (1-3 sentences — the headline answer) / **Findings** (3-7 bullets, citations inline) / **Plan** (concrete, opinionated recommendation) / **Open questions** (anything unresolved). Keep the per-batch breakdown out of the reply — if the user wants the trail, they'll ask.

---

## Common failure modes (avoid these in both modes)

- **Executing RR inline instead of delegating.** RR mode launches the workflow (or, as a sub-agent, runs the flow graph in its own context). If you're running WebSearch/WebFetch/Grep in the main conversation for an RR request, you're doing it wrong — that noise is exactly what delegation keeps out of the main thread.
- **Single-shot search/grep.** RR is a pipeline. One WebSearch is not RR. One Grep is not RR. (Applies to whoever executes — research agent, or the user in another chat.)
- **Picking the wrong surface.** Codebase questions ("how does our auth work") sent as internet research return generic blog posts; internet questions ("which vector DB should we use") sent as codebase research return "we don't have one." Pick deliberately. If unsure, ask.
- **Plan the whole pipeline up front.** The research within each lane is supposed to evolve. If batch 3 was decided before batch 1 ran, the lane isn't doing RR.
- **Skip the verify stage.** The adversarial verify lane exists because the first answer is often a confident-sounding wrong one — it refutes, drops uncorroborated claims, and flags single-source findings. Don't collapse research and verify into one pass.
- **A collector that summarizes** has moved judgment to a weak model — reject that collection and re-run it; collectors return raw excerpts, the judge does the thinking.
- **Dump findings, skip the plan.** Reza asked for a report **and a plan**. A wall of facts is half the deliverable.
- **Spam the chat with the round-by-round trail.** The user-facing reply is Verdict + Findings + Plan + file path. The per-round trail goes in the file.
- **Assume the executor has context.** Neither the research agent (RR) nor the user's other chat (RRP) sees this conversation. Inline everything that matters into the briefing / the RRP prompt.
- **Predicting the findings while the run is live.** You know nothing about what it found until it returns. Don't fabricate or summarize in advance.
- **Skipping the file write.** Every RR run produces exactly ONE research file in the storage directory — the synthesizer writes it per the file contract, and Step 4 has you backfill it from the run's return if it didn't. If no file is written, the work isn't persisted — future conversations can't reference it. The file is the canonical record; the chat reply is the courtesy summary.

---

## Triggers (so you know when to load this skill)

Load this skill when the user's message includes any of:

- `RR <something>`
- `RRP <something>` / `RR-prompt for <something>` / "write me an RR prompt"
- "research and report on <something>" / "do an RR on <something>"

Do NOT load this skill for ordinary research requests like "look up X" or "what is Y" — those don't need the pipeline.
