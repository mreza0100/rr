// ─────────────────────────────────────────────────────────────────────────────
// Configs — validates the injected JSON args (which can be ANYTHING) and fills
// safe defaults in the constructor. One immutable CONFIG singleton holds the run.
// (Per-agent tier/effort/schema/prompt-builder live in src/agents/<agent>/; the
// shared prompt fragments + schema bricks live in src/agents/shared.ts.)
// ─────────────────────────────────────────────────────────────────────────────
import type { Mode, PhaseMap, RawArgs } from './types/index.js';

export class Configs {
  // run config (validated + defaulted)
  query: string;
  mode: Mode;
  maxWave: number | 'auto';
  HARD_CAP: number;
  parallelLaneResearchAgentsPerWave: number | 'auto';
  parallelSourcesPerLaneResearchAgent: number | 'auto';
  PHASE: PhaseMap;
  MAX_SENTINEL_REOPENS: number;
  MAX_JUDGE_PASSES: number;
  MAX_LANE_REFAILS: number;
  VALIDATOR_THIN: number;
  QUERY_PLATEAU: number;
  AGENT_RETRIES: number;
  INJECT_SCORE: number;
  compute: boolean;
  computerNote: string;
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
  COMPUTER_NOTE: string;
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
    const posInt = (v: unknown, d: number): number =>
      Number.isInteger(v) && (v as number) > 0 ? (v as number) : d;
    const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
    const autoInt = (v: unknown, lo: number, hi: number, d: number | 'auto'): number | 'auto' =>
      v === 'auto'
        ? 'auto'
        : Number.isInteger(v) && (v as number) > 0
          ? Math.min(hi, Math.max(lo, v as number))
          : d;

    // ---- run config (validated + defaulted) ----
    this.query = arg.query;
    this.mode = arg.mode === 'collect' ? 'collect' : 'goal'; // canonical mode; anything not 'collect' → 'goal'
    this.maxWave = autoInt(arg.maxWave, 5, 15, 'auto'); // 'auto' (brainer-stopped, capped at HARD_CAP) or a clamped [5,15] override
    this.HARD_CAP = 15; // absolute ceiling on waves — no run ever exceeds this
    this.parallelLaneResearchAgentsPerWave = autoInt(
      arg.parallelLaneResearchAgentsPerWave,
      1,
      5,
      'auto',
    ); // lanes/wave: 'auto' (brainer-assigned, hidden cap 5) or clamped [1,5]
    this.parallelSourcesPerLaneResearchAgent = autoInt(
      arg.parallelSourcesPerLaneResearchAgent,
      1,
      5,
      'auto',
    ); // sources/lane: 'auto' (brainer-assigned, hidden cap 5) or clamped [1,5]
    // Per-agent model TIER + reasoning EFFORT now live co-located in each src/agents/<agent>/ module
    // (the engine reads <agent>.tier / <agent>.effort). The tiering rationale travels with each agent: brainer
    // = ALWAYS Opus + xhigh (the global brain/reducer); scout + lane-researcher = Haiku (bounded summarize +
    // extract — the page reading is the fixed Haiku WebFetch digester's job); escalate only on measured failure.
    this.PHASE = { scout: 'Scout', crawl: 'Research', finalize: 'Finalize', debug: 'Debug' };
    this.MAX_SENTINEL_REOPENS = this.mode === 'goal' ? 2 : 0; // L4: max extra waves the goal-mode sentinel may force (collect mode never reopens → 0)
    this.MAX_JUDGE_PASSES = 2; // finalize: max remediation passes the judge may drive (brain-compute / re-refine / crawl-reopen) before the report is written — the judge runs at most MAX+1 times
    this.MAX_LANE_REFAILS = 2; // crawl: max times the per-wave validator re-opens one lane after a null/thin return; after that it surfaces as a known gap (no infinite loop)
    this.VALIDATOR_THIN = 120; // crawl: a finding shorter than this (chars) is "thin" → it (or any null lane) gates the validator to run that wave
    this.QUERY_PLATEAU = 0.7; // collect-mode DRY: stop when top novelty-score stays ≤ this × the run's PEAK for 2 waves (no magic absolute floor)
    // L7 robustness: RETRY a failed agent() call up to AGENT_RETRIES times (a fresh spawn). A single transient failure (e.g. StructuredOutput
    // retry-cap exceeded on a JS-rendered page) often clears on a clean re-run; only after the retries are exhausted does it degrade to null
    // (handled by the existing null-guards) instead of throwing and crashing the WHOLE workflow.
    this.AGENT_RETRIES = 2;
    this.INJECT_SCORE = 90; // L4: score for sentinel-injected gap rabbit-holes — high, so they top the store
    this.compute = bool(arg.compute, true); // master switch for ALL derivation: false → the brainer runs as a plain subagent (no code) + no finalize derivation (the brainer/judge are told it is off)
    this.computerNote = str(arg.computerNote, ''); // optional run-specific compute guidance; appended after the baked stack note (COMPUTER_NOTE) the compute-aware agents receive
    this.thinkerNote = str(arg.thinkerNote, ''); // optional operator run-steering (priorities/framing/constraints/audience); reaches the Opus reasoning tier ONLY (THINKER_NOTE), pure passthrough
    this.researcherNote = str(arg.researcherNote, ''); // optional operator note to the web-research/probe agents (RESEARCHER_NOTE); terse passthrough, reaches scout/prospector/researcher/brainer/sentinel
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
    // L3 (directive A): primary tools are WebSearch + WebFetch, but agents MAY reach for any other tool that genuinely helps the rabbit-hole.
    this.NET = `Primary tools: WebSearch + WebFetch — load them via ToolSearch "select:WebSearch,WebFetch" if absent. You may also load any other tool that genuinely helps THIS rabbit-hole (e.g. context7 for library/API docs) via ToolSearch — pick the best tool for the question, not only web search. Prefer primary, recent sources; stay on-rabbit-hole.
PDF sources: WebFetch garbles PDFs. When a source is a PDF (its URL ends in .pdf, or WebFetch returns binary/garbled text), do not keep retrying it — load Bash via ToolSearch and read the PDF on disk with pypdf (already installed). Fetch then extract: f=$(mktemp --suffix=.pdf); curl -sL "<url>" -o "$f"; python3 -c "import pypdf; print(chr(10).join((p.extract_text() or '') for p in pypdf.PdfReader('$f').pages))" — then work from the printed text.`;
    // COMPUTER_NOTE — capability fragment for the compute-aware agents (mirrors NET). Names the scientific Python stack the compute
    // environment ships so they reach for it over hand-rolled math; the optional computerNote arg appends per-run guidance after it.
    this.COMPUTER_NOTE =
      `The compute environment's python3 ships a scientific stack — prefer it over hand-rolled math: scipy (integration/ODEs, optimization, stats, linear algebra), sympy (symbolic math + dimensional/algebra checks), uncertainties or a numpy Monte-Carlo for error-bar propagation, pint for unit consistency, pandas + statsmodels + scikit-learn for data and statistics, networkx for graph/path reasoning, rdkit for molecular similarity. Import what fits the derivation instead of coding the method yourself.` +
      (this.computerNote ? '\n' + this.computerNote : '');
    // THINKER_NOTE — the operator's run-steering, labeled so the reasoning tier treats it as HOW to approach the run (priorities,
    // framing, constraints, audience) rather than WHAT to research. Pure passthrough of the thinkerNote arg; empty ⇒ nothing renders.
    this.THINKER_NOTE = this.thinkerNote
      ? 'OPERATOR STEERING — how to approach THIS run (priorities, framing, constraints, audience), not additional questions to research:\n' +
        this.thinkerNote
      : '';
    // RESEARCHER_NOTE — the operator's terse one-line note to the agents that DO web research/fetching (scout, prospector,
    // lane-researcher, brainer, sentinel). Minimal framing — a short prefix then the note. Pure passthrough; empty ⇒ nothing renders.
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
