# RR — engine contributor guide

`workflow.js` and `persist.js` at the repo root are the RUNTIME (what the Claude Code skill
actually loads). `workflow.js` is a **build artifact** — never hand-edit it. The source is
`engine/src/`; `cd engine && npm run build` regenerates the bundle. Every code change commits
BOTH the source and the rebuilt `workflow.js`.

## Gates before any commit

```
cd engine
npm test         # vitest — all green
npm run typecheck
npm run build     # validates the sandbox contract: single file, `export const meta` literal
                   # at top, no Date.now/Math.random/argless `new Date` — the orchestrator
                   # must stay deterministic
```

## Architecture

- `engine.ts` — the orchestrator; owns ALL state mutations and `files[]` writes.
- `agents/<name>/{index,prompts,run}.ts` — one module per agent: descriptor / prompt template
  + builder / dispatch.
- `store.ts` — frontier reducers.
- `config.ts` — THE single source of truth for every knob, literal, tier, and prompt fragment.
  Never introduce a numeric literal anywhere else.
- `utils/` — pure helpers.
- `types/` — contracts.

## Design contract

`engine/docs/V3-DESIGN.md` — the canonical naming table and mechanism specs. Read it before any
structural change.

## Invariants

- The two wave paths — `runCrawl` (single-brainer) and `runOneWave` (multi-brainer) — MUST stay
  in behavioral parity. Any wave-loop change lands in both.
- Every agent call degrades to null: a dying agent leaves the run on the v2-equivalent path,
  never crashes it. Every loop carries a named cap read from `config.ts`.
- Prompts are template consts in each agent's `prompts.ts` with clause builders. Snapshot tests
  cover them — regenerate deliberately and eyeball the diff, never blind `-u`.
- Secrets and PII never go into code or docs.
