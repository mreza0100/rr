// ─────────────────────────────────────────────────────────────────────────────
// Shared cross-agent fragments — imported by the per-agent modules in this folder so a
// fragment used by more than one agent lives in EXACTLY one place (never duplicated per agent).
//
// Two kinds live here:
//   • static PROMPT fragments (FINISH, WEB_ONLY) — guard clauses appended to several agents'
//     prompts. (The run-DERIVED fragments — NET, FOOTER, RUBRIC, STOP, THINKER_NOTE,
//     RESEARCHER_NOTE, COMPUTE_NOTE — are built per run on the CONFIG singleton in ../config.js.)
//   • shared StructuredOutput SCHEMA bricks — the nested sub-schemas reused across more than one
//     agent's output contract (RABBITHOLE), plus the single-source nested bricks the top-level
//     contracts compose. Each agent's TOP-LEVEL schema is co-located in its own file; these
//     reusable bricks stay here so each nesting identity has one definition.
// ─────────────────────────────────────────────────────────────────────────────
import type { Schema } from '../types/index.js';

// ── static prompt guard clauses ──
// FINISH: the pure reducers (brainer, initiator, synthesiser) already hold the data they
// need — they MAY use a tool if it genuinely helps, but the hard rule is they FINISH: emit the
// COMPLETE StructuredOutput rather than getting lost (the wave-0 brainer once spent its whole turn
// reading this repo's own files on a self-referential query and never emitted resultSoFar/lookupNext/stop).
export const FINISH = `
The data above is enough to decide. You may consult a tool if it genuinely helps, but keep it brief — the answer does not require it. Your one required action: return the complete StructuredOutput with every required field, never a partial object.`;
// WEB_ONLY: the refine pass checks claims on the web — the local repo code is never evidence.
export const WEB_ONLY = `
Use the web only (WebSearch / mcp__harvester__fetch) to check sources — never read local files or this repo's own code; they are not evidence.`;

// ── shared schema bricks (declaration order respects nesting) ──
export const RABBITHOLE: Schema = {
  type: 'object',
  properties: { keyword: { type: 'string' }, why: { type: 'string' } },
  required: ['keyword', 'why'],
};
export const SCORED: Schema = {
  type: 'object',
  properties: { keyword: { type: 'string' }, why: { type: 'string' }, score: { type: 'number' } },
  required: ['keyword', 'why', 'score'],
};
export const PAGE: Schema = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    summary: { type: 'string' },
    rabbitHoles: { type: 'array', items: RABBITHOLE },
  },
  required: ['url', 'summary', 'rabbitHoles'],
};
// LOOKUP = one item in the brainer's `lookupNext` (research NOW): EITHER {id} (an existing open rabbit-hole) OR {keyword,why,score,…}
// (originate-and-pursue-now). All fields optional so both shapes validate; `sources` are the prospector venues the brainer
// assigns to THIS lane (its researcher searches them first).
export const LOOKUP: Schema = {
  type: 'object',
  properties: {
    id: {
      type: 'number',
      description:
        'id of an existing open rabbit-hole to research now — use this OR the keyword fields, not both',
    },
    keyword: { type: 'string' },
    why: { type: 'string' },
    score: { type: 'number' },
    sources: {
      type: 'array',
      items: { type: 'string' },
      description:
        'subset of the prospector venue identifiers (their exact `source` strings) best suited to THIS rabbit-hole — its researcher will prefer these. Empty if none fit.',
    },
    note: {
      type: 'string',
      description:
        'the research directive for THIS lane — WHAT to find plus ranked fallbacks ("if not X, focus on Y; give both if available"). Steers BOTH the scheduler (which sources to pick) and the reader (what to extract). Distinct from `why` (your store/scoring rationale).',
    },
    ref: {
      type: 'string',
      description:
        'a concrete URL or DOI for this lane to fetch DIRECTLY (a followed citation) instead of WebSearching — set it when you are chasing a specific source',
    },
  },
};
// resultSoFar = the run's living MEMORY, carried wave to wave. The brainer maintains it; refinement gets the FINAL one only.
export const RESULT_SO_FAR: Schema = {
  type: 'object',
  properties: {
    answer: {
      type: 'string',
      description: 'the best current answer to the goal, as it stands this wave',
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fact: { type: 'string' },
          value: { type: 'string' },
          source: { type: 'string' },
          status: { type: 'string', enum: ['settled', 'tentative', 'contested'] },
        },
        required: ['fact', 'value', 'source', 'status'],
      },
      description: 'load-bearing facts the answer rests on — NOT a transcript of everything seen',
    },
    assumptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: {
            type: 'string',
            description: 'a working assumption the answer currently leans on',
          },
          basis: { type: 'string', description: 'what it rests on, and how firm that is' },
        },
        required: ['claim', 'basis'],
      },
      description:
        'working assumptions the answer leans on (each {claim, basis}); revise or retire them as evidence lands',
    },
    resolved: { type: 'array', items: { type: 'string' }, description: 'sub-questions now closed' },
    openGaps: { type: 'array', items: { type: 'string' }, description: 'what is still missing' },
    tensions: {
      type: 'array',
      items: { type: 'string' },
      description: 'conflicting sources / unresolved contradictions',
    },
    working: {
      type: 'string',
      description:
        "for build-the-answer / estimate questions, the growing derivation chain; '' for non-derivation questions",
    },
    confidence: { type: 'string' },
  },
  required: ['answer', 'evidence', 'resolved', 'openGaps', 'tensions', 'working', 'confidence'],
};
