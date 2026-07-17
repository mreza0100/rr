---
name: quality:doc
description: Use BEFORE writing or restructuring any permanent reference doc — README.md, design.md, engine/docs/*. Defines how to shape reference docs for LLM Read/grep consumption — the ~500-line topic-file target (~80 KB hard cap), the table-vs-sections record-format rule, grep-true naming, current-state-only content, and the no-byline rule.
---

# Doc Format

Reference docs here (README.md, design.md, engine/docs/) are read by LLM agents (whole-file `Read`, `grep`) at least as often as by humans. Shape them for that reader. Apply at write-time. Runtime-loaded prompt files follow `quality:prompt` instead.

## The deciding principle

Format barely affects whether the model _understands_ content — capability dominates. So decide on the **mechanics the reader pays for**: token cost, grep context, edit/diff locality, prettier stability.

## Size

- **Target ≤ ~500 lines per doc; hard cap ~2,000 lines / ~80 KB** (where a single `Read` strains). Between target and cap = a split that hasn't happened yet.
- **Table of Contents** at the top of any doc over ~100 lines.
- **Split signals:** covers more than one subject; sections have different edit cadence; reads as an append-log of changes rather than current state.

## Record format — table vs sections

Decide by **field shape**: short uniform cells → markdown table (one grep hit shows the whole record). Any long free-text field → **heading-per-record sections** (`###` per record, one-line bold metadata strip, prose paragraph). **Never put long prose in a table cell** — prettier aligns every column to its widest cell, so one 600-char description pads every row, and editing one record reflows the whole column.

## Current-state only — delete, don't annotate

A reference doc describes what IS. When a record is removed, delete it — no `~~strikethrough~~`, no "Removed {date}", no "Added in vN" notes. Stale annotations poison retrieval. History lives in `git log`.

## Edit locality

A change to one record touches only that record's lines — zero reflow of neighbors. If editing one fact rewrites unrelated lines, the format is wrong.

## Anti-patterns — cut on sight

- Monolithic multi-topic file (split it) · per-release changelog structure inside a reference doc (re-group by topic) · tombstones · long prose in a table cell · doc → doc → doc reference chains (one hop; inline the essential fact) · narrative bloat ("Background", "Why we chose X in 2024").

## No byline

Git owns authorship and dates. No `> Author:` / `> Last updated:` lines.

## Name fidelity — docs are grep-true

Every identifier is the exact code name, verbatim: a config knob is its `config.ts` name (`RESEARCHER_TOKEN_BUDGET`), an agent its directory name (`lineageClerk`), an artifact its filename (`_claims.json`). A consumer who greps the code symbol must land in the doc, and the reverse — Claude Code's grep is exact-match. When the code renames, the doc renames in the same edit; a `###` heading that maps to a symbol IS that symbol.

## Pre-write checklist

1. Size under target; ToC if >100 lines.
2. Long-prose fields in sections, not tables.
3. Current state only — no tombstones or version-annotations.
4. One-hop references; essential facts inlined.
5. No byline.
6. Every code identifier verbatim-greppable.
7. Format pass: `npx prettier --write --prose-wrap preserve <file>` on everything touched.
