// ─────────────────────────────────────────────────────────────────────────────
// Configs — THE single source of truth for the whole engine. ALL configuration
// lives here: tunable knobs, caps, char budgets, the per-agent model TIER + reasoning
// EFFORT maps, and the run-derived prompt fragments. Nothing is hardcoded elsewhere —
// engine.ts / utils / store / the agent modules READ every number and policy off the
// CONFIG singleton. Change a value here and it changes everywhere; never re-introduce a
// literal in another module.
//
// Configs also validates the injected JSON args (which can be ANYTHING) and fills safe
// defaults in the constructor. One immutable CONFIG singleton holds the run. (Each agent's
// schema + prompt-builder still live in src/agents/<agent>/; its tier/effort value lives
// ONLY in the TIER/EFFORT maps below — the agent module reads it from CONFIG.)
// ─────────────────────────────────────────────────────────────────────────────
import type { Effort, Mode, PhaseMap, RawArgs, Tier } from './types/index.js';

export class Configs {
  // run config (validated + defaulted)
  query: string;
  mode: Mode;
  maxWave: number | 'auto';
  HARD_CAP: number;
  maxParallelBrainers: number; // max LIVE brainers in the brainer tree (1 = today's single-brainer behavior; clamps to a hard ceiling of 5)
  MAX_BRAINER_DEPTH: number; // safety cap on spawn-chain depth (a child of a child of … )
  parallelLaneResearchAgentsPerWave: number | 'auto';
  parallelSourcesPerLaneResearchAgent: number | 'auto';
  PHASE: PhaseMap;
  MAX_JUDGE_PASSES: number;
  MAX_LANE_REFAILS: number;
  VALIDATOR_THIN: number;
  VALIDATOR_INTRO_CHARS: number;
  VALIDATOR_MISSING_CHARS: number;
  QUERY_PLATEAU: number;
  PLATEAU_MIN_WAVES: number;
  PLATEAU_WINDOW: number;
  AGENT_RETRIES: number;
  INJECT_SCORE: number;
  AUTO_CAP: number;
  AUTO_SOURCE_DEFAULT: number;
  NEAR_DUP: number;
  FINALIZE_TOP_OPEN: number;
  RESEARCHER_TOKEN_BUDGET: number;
  BRAINER_LANE_CAP: number;
  CHUNK_OVERLAP_CHARS: number;
  CHARS_PER_TOKEN: number;
  CONTEXT: Record<Tier, number>;
  MAX_SLICES_PER_READER: number;
  MAX_SOURCES_PER_LANE: number;
  HANDOFF_CHARS: number;
  MAX_STARVED_WAVES: number;
  TREE_LOG_WIDTH: number;
  GENERAL_PURPOSE: string;
  TIER: Record<string, Tier>;
  EFFORT: Record<string, Effort>;
  compute: boolean;
  computeNote: string;
  thinkerNote: string;
  researcherNote: string;
  debug: boolean;
  debugPrompt: string;
  tag: string;
  slug: string;
  DIR: string;
  rawArgs: RawArgs; // the COMPLETE set of arguments the run was launched with, captured verbatim (persisted into the output)
  // derived prompt fragments woven into the agent builders
  FOOTER: string;
  NET: string;
  COMPUTE_NOTE: string;
  THINKER_NOTE: string;
  RESEARCHER_NOTE: string;
  RUBRIC: string;
  STOP: string;

  constructor(rawArgs: unknown) {
    // args: { query, mode?, compute?, maxWave?, parallelLaneResearchAgentsPerWave?, parallelSourcesPerLaneResearchAgent?, debug?, debugPrompt? }
    let parsed: unknown;
    try {
      parsed = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
    } catch (e) {
      throw new Error('RR: args is not valid JSON — ' + ((e && e.message) || e));
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('RR: args must be a JSON object { query, mode?, maxWave? }');
    }
    const arg = parsed as RawArgs;
    if (typeof arg.query !== 'string' || arg.query.trim() === '') {
      throw new Error('RR requires args { query: non-empty string, mode?, maxWave? }');
    }
    this.rawArgs = arg; // capture the COMPLETE launch args verbatim — persisted into the output files
    // typed readers — keep the supplied value only when it is the right type, else fall back to the default
    const str = (v: unknown, d: string): string => (typeof v === 'string' && v.length ? v : d);
    const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
    // coerceBool — a STRICT boolean reader (B8): a real boolean passes; the common string/number truthy/falsy
    // spellings coerce explicitly; absent ⇒ the default; ANYTHING else throws LOUDLY rather than silently
    // defaulting. (A bare `bool()` would default "false"/0/"no" back to true — a foot-gun for `compute:false`.)
    const coerceBool = (v: unknown, d: boolean): boolean => {
      if (v === undefined || v === null) return d;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') {
        if (v === 1) return true;
        if (v === 0) return false;
        throw new Error('RR: expected a boolean, got number ' + v);
      }
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
        if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
        throw new Error('RR: expected a boolean-ish value, got string "' + v + '"');
      }
      throw new Error('RR: expected a boolean, got ' + typeof v);
    };
    const autoInt = (v: unknown, lo: number, hi: number, d: number | 'auto'): number | 'auto' =>
      v === 'auto'
        ? 'auto'
        : Number.isInteger(v) && (v as number) > 0
          ? Math.min(hi, Math.max(lo, v as number))
          : d;

    // ---- centralized constants (the single source of truth — no literal of these lives anywhere else) ----
    this.AUTO_CAP = 5; // auto-mode hard cap on lanes/wave AND sources/lane (the brainer is never told the number); read by the lane+source autoInt bounds, utils laneCount, and the engine srcCount
    this.AUTO_SOURCE_DEFAULT = 2; // auto-mode sources/lane when the brainer assigns none to a lane
    this.NEAR_DUP = 0.85; // store dedup: Jaccard token-set overlap ≥ this counts as "the same lead, reworded"; kept high so distinct leads are never merged
    this.FINALIZE_TOP_OPEN = 6; // finalize: how many top open rabbit-holes feed the initiator + synthesiser (Open questions)
    this.VALIDATOR_INTRO_CHARS = 240; // crawl: char budget for each finding's intro handed to the validator gate
    this.VALIDATOR_MISSING_CHARS = 300; // crawl: char budget for the validator's `missing` gaps threaded into the next brainer
    this.PLATEAU_MIN_WAVES = 3; // collect DRY: minimum waves before the novelty-plateau stop can fire
    this.PLATEAU_WINDOW = 2; // collect DRY: how many trailing top-scores must all sit ≤ QUERY_PLATEAU×peak to call it dry
    // scheduler/reader knobs (B4/B5) — read by utils.packReaders + the engine lane threads
    this.RESEARCHER_TOKEN_BUDGET = 130000; // one reader-unit budget: the calibrated safe ceiling a single reader may carry (the bin-pack unit)
    this.BRAINER_LANE_CAP = 5; // lanes/wave — the wave bound (≥ this many lanes never run in one wave)
    this.CHUNK_OVERLAP_CHARS = 2000; // overlap re-read at each split boundary when one source is packed across multiple reader-units
    // CHARS_PER_TOKEN — inverts Harvester's size_only token heuristic (tokens ≈ chars/2 for prose, A6) so the
    // engine's CHAR windows agree with the scheduler's TOKEN sizes: budget(tokens) × CHARS_PER_TOKEN = the char
    // ceiling a reader-unit may span. The heuristic deliberately OVER-counts tokens (real prose is ~chars/4), so
    // 130k heuristic-tokens ≈ ~65k real tokens — comfortably inside the worker context window with headroom.
    this.CHARS_PER_TOKEN = 2;
    // CONTEXT — each tier's real context window (Claude models, tokens). The reader budget is ANCHORED against the
    // researcher tier's window below (a reader-unit can never be asked to ingest more than the model can hold).
    this.CONTEXT = { haiku: 200000, sonnet: 200000, opus: 200000 };
    this.MAX_SLICES_PER_READER = 8; // B7: max whole sources combined into ONE reader-unit (a lane of 40 tiny files never packs 40 into one turn)
    this.MAX_SOURCES_PER_LANE = 12; // B7: max sources packed per lane per wave (caps a runaway scheduler lane before bin-packing)
    this.HANDOFF_CHARS = 16000; // B7: cap the running-answer handoff carried between sequential readers (keeps read + handoff inside context)
    this.MAX_STARVED_WAVES = 2; // B6: consecutive all-null / empty-schedule waves before the crawl breaks with stopReason scheduler-starved
    this.MAX_BRAINER_DEPTH = 3; // safety cap on the spawn-chain depth (root=0); spawning past this depth is refused
    this.TREE_LOG_WIDTH = 120; // crawl-tree render: per-line clip width for the LIVE TERMINAL log ONLY — the persisted _tree.md + returned tree keep full, unclipped lines
    this.GENERAL_PURPOSE = 'general-purpose'; // the harness agentType handed to code-capable / tool-using sub-agents
    // Per-agent model TIER + reasoning EFFORT — keyed by agent name; each src/agents/<agent>/ module reads its value
    // here (the tiering rationale travels in each agent's own comment). Brainer = ALWAYS Opus + xhigh (the global
    // brain/reducer); scout + researcher = Haiku (bounded summarize + extract — the page reading is the fixed
    // Haiku reader's job); escalate only on measured failure.
    this.TIER = {
      scout: 'haiku',
      prospector: 'opus',
      brainer: 'opus',
      validator: 'sonnet',
      researcher: 'haiku',
      researchScheduler: 'sonnet',
      initiator: 'opus',
      refiner: 'sonnet',
      judge: 'opus',
      synthesiser: 'opus',
      debugAnalyst: 'opus',
    };
    this.EFFORT = {
      scout: 'medium',
      prospector: 'high',
      brainer: 'xhigh',
      validator: 'medium',
      researcher: 'medium',
      researchScheduler: 'high',
      initiator: 'xhigh',
      refiner: 'high',
      judge: 'xhigh',
      synthesiser: 'xhigh',
      debugAnalyst: 'high',
    };
    // ANCHOR the reader budget (B10) — now that TIER is set: a reader-unit must FIT the researcher tier's context
    // window, and (in chars) EXCEED the overlap re-read so every split makes forward progress. Fail loudly otherwise.
    if (this.RESEARCHER_TOKEN_BUDGET > this.CONTEXT[this.TIER.researcher])
      throw new Error(
        'RR config: RESEARCHER_TOKEN_BUDGET exceeds the researcher tier context window',
      );
    if (this.RESEARCHER_TOKEN_BUDGET * this.CHARS_PER_TOKEN <= this.CHUNK_OVERLAP_CHARS)
      throw new Error(
        'RR config: RESEARCHER_TOKEN_BUDGET (in chars) must exceed CHUNK_OVERLAP_CHARS',
      );

    // ---- run config (validated + defaulted) ----
    this.query = arg.query;
    // normalize mode (B8): trim + lowercase BEFORE the 'collect' test (so 'Collect'/' COLLECT ' canonicalize),
    // and warn LOUDLY when a non-empty mode fails to match either canonical value instead of silently → goal.
    const rawMode = arg.mode == null ? '' : String(arg.mode).trim().toLowerCase();
    this.mode = rawMode === 'collect' ? 'collect' : 'goal'; // canonical mode; anything not 'collect' → 'goal'
    if (rawMode && rawMode !== 'collect' && rawMode !== 'goal') {
      try {
        if (typeof log === 'function')
          log('⚠ RR: unrecognized mode "' + String(arg.mode) + '" → defaulting to goal');
      } catch (e) {
        /* log not available at construction (unit test) → skip the warning */
      }
    }
    this.maxWave = autoInt(arg.maxWave, 5, 15, 'auto'); // 'auto' (brainer-stopped, capped at HARD_CAP) or a clamped [5,15] override
    this.HARD_CAP = 15; // absolute ceiling on waves — no run ever exceeds this
    // maxParallelBrainers: max LIVE brainers in the brainer tree. A positive integer clamps to [1,5];
    // anything else (absent / 'auto' / junk) defaults to 1 — today's single-brainer behavior, so the tree is strictly opt-in.
    this.maxParallelBrainers =
      Number.isInteger(arg.maxParallelBrainers) && (arg.maxParallelBrainers as number) > 0
        ? Math.min(5, Math.max(1, arg.maxParallelBrainers as number))
        : 1;
    this.parallelLaneResearchAgentsPerWave = autoInt(
      arg.parallelLaneResearchAgentsPerWave,
      1,
      this.AUTO_CAP,
      'auto',
    ); // lanes/wave: 'auto' (brainer-assigned, hidden cap AUTO_CAP) or clamped [1,AUTO_CAP]
    this.parallelSourcesPerLaneResearchAgent = autoInt(
      arg.parallelSourcesPerLaneResearchAgent,
      1,
      this.AUTO_CAP,
      'auto',
    ); // sources/lane: 'auto' (brainer-assigned, hidden cap AUTO_CAP) or clamped [1,AUTO_CAP]
    this.PHASE = { scout: 'Scout', crawl: 'Research', finalize: 'Finalize', debug: 'Debug' };
    this.MAX_JUDGE_PASSES = 2; // finalize: max remediation passes the judge may drive (brain-compute / re-refine / crawl-reopen) before the report is written — the judge runs at most MAX+1 times
    this.MAX_LANE_REFAILS = 2; // crawl: max times the per-wave validator re-opens one lane after a null/thin return; after that it surfaces as a known gap (no infinite loop)
    this.VALIDATOR_THIN = 120; // crawl: a finding shorter than this (chars) is "thin" → it (or any null lane) gates the validator to run that wave
    this.QUERY_PLATEAU = 0.7; // collect-mode DRY: stop when top novelty-score stays ≤ this × the run's PEAK for 2 waves (no magic absolute floor)
    // L7 robustness: RETRY a failed agent() call up to AGENT_RETRIES times (a fresh spawn). A single transient failure (e.g. StructuredOutput
    // retry-cap exceeded on a JS-rendered page) often clears on a clean re-run; only after the retries are exhausted does it degrade to null
    // (handled by the existing null-guards) instead of throwing and crashing the WHOLE workflow.
    this.AGENT_RETRIES = 2;
    this.INJECT_SCORE = 90; // score for judge-reopened gap rabbit-holes (finalize crawl-reopen) — high, so they top the store
    this.compute = coerceBool(arg.compute, true); // master switch for ALL derivation: false → the brainer runs as a plain subagent (no code) + no finalize derivation (the brainer/judge are told it is off). STRICT: "false"/0/"no" coerce to false, never silently default to true
    this.computeNote = str(arg.computeNote, ''); // optional run-specific compute guidance; appended after the baked stack note (COMPUTE_NOTE) the compute-aware agents receive
    this.thinkerNote = str(arg.thinkerNote, ''); // optional operator run-steering (priorities/framing/constraints/audience); reaches the Opus reasoning tier ONLY (THINKER_NOTE), pure passthrough
    this.researcherNote = str(arg.researcherNote, ''); // optional operator note to the web-research/probe agents (RESEARCHER_NOTE); terse passthrough, reaches scout/prospector/researcher/brainer
    this.debug = bool(arg.debug, true); // last-phase Debug & Analysis agent → one _debug.md (raw agent I/O + run log + metrics); ON by default, pass debug:false to turn it off
    this.debugPrompt = str(arg.debugPrompt, ''); // optional run-specific analysis question handed to the debug agent
    this.tag = str(arg.tag, ''); // optional slug suffix so parallel variants of one query write to distinct dirs
    const baseSlug = this.query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    this.slug = baseSlug + (this.tag ? '-' + this.tag : '');
    this.DIR = 'RR/' + this.slug;

    // ---- shared prompt fragments (woven into the builders below) ----
    this.FOOTER = `Then append a section titled "Rabbit holes": 0-5 rabbit-holes worth a researcher's time, prioritizing the biggest gaps the page raises but does not explain. Each rabbit-hole: a concrete next web-search query and one line on why it matters. If the page is a dead end or self-contained, give 1 or none — do not pad. Skip anything the page already explains.
Then append a section titled "Next sources": up to 5 of the page's highest-value outbound citations or links as concrete fetch targets — each the exact URL or DOI the page points to, plus one line on why following it matters. Give none when the page cites nothing worth following.`;
    // L3 (directive A): primary tools are WebSearch + mcp__harvester__fetch, but agents MAY reach for any other tool that genuinely helps the rabbit-hole.
    this.NET = `Primary tools: WebSearch + mcp__harvester__fetch — load WebSearch via ToolSearch "select:WebSearch" if absent (built-in WebFetch is hook-denied; fetch only through Harvester). You may also load any other tool that genuinely helps THIS rabbit-hole (e.g. context7 for library/API docs) via ToolSearch — pick the best tool for the question, not only web search. Prefer primary, recent sources; stay on-rabbit-hole.`;
    // COMPUTE_NOTE — capability fragment for the compute-aware agents (mirrors NET). Names the scientific Python stack the compute
    // environment ships so they reach for it over hand-rolled math; the optional computeNote arg appends per-run guidance after it.
    this.COMPUTE_NOTE =
      `The compute environment's python3 ships a scientific stack — prefer it over hand-rolled math: scipy (integration/ODEs, optimization, stats, linear algebra), sympy (symbolic math + dimensional/algebra checks), uncertainties or a numpy Monte-Carlo for error-bar propagation, pint for unit consistency, pandas + statsmodels + scikit-learn for data and statistics, networkx for graph/path reasoning, rdkit for molecular similarity. Import what fits the derivation instead of coding the method yourself.` +
      (this.computeNote ? '\n' + this.computeNote : '');
    // THINKER_NOTE — the operator's run-steering, labeled so the reasoning tier treats it as HOW to approach the run (priorities,
    // framing, constraints, audience) rather than WHAT to research. Pure passthrough of the thinkerNote arg; empty ⇒ nothing renders.
    this.THINKER_NOTE = this.thinkerNote
      ? 'OPERATOR STEERING — how to approach THIS run (priorities, framing, constraints, audience), not additional questions to research:\n' +
        this.thinkerNote
      : '';
    // RESEARCHER_NOTE — the operator's terse one-line note to the agents that DO web research/fetching (scout, prospector,
    // researcher, brainer). Minimal framing — a short prefix then the note. Pure passthrough; empty ⇒ nothing renders.
    this.RESEARCHER_NOTE = this.researcherNote ? 'Research note: ' + this.researcherNote : '';
    this.RUBRIC =
      this.mode === 'collect'
        ? `MODE = collect (exhaustive): score each rabbit-hole by how much NEW information it adds about the subject; favour breadth.`
        : `MODE = goal (directed): score each rabbit-hole by how much it improves or better-verifies the answer to the goal; favour rabbit-holes that close or verify it.`;
    this.STOP =
      this.mode === 'collect'
        ? `done = true when the high-value material is collected and remaining rabbit-holes are only marginally novel — the novelty trajectory has fallen well below peak and plateaued. The subject need not be exhausted (a rich one never is); call it when further waves add footnotes, not substance.`
        : `done = true only when the goal is answered AND pursuing the top remaining rabbit-holes would not materially improve or better-verify the answer.`;
  }
}
export const CONFIG = new Configs(args);
