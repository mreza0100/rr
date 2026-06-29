export const meta = {
  name: 'Research and Report',
  description:
    'Research and Report — unbounded best-first web crawl steered by a BRAINER over a persistent id-keyed rabbit-hole store. haiku scout seeds rabbit-holes → opus PROSPECTOR names the high-value authoritative source venues → [the brainer looks up OR originates the rabbit-holes worth pursuing AND assigns each its relevant venue subset → parallel haiku lane-researchers pursue (preferring their assigned venues) → the brainer returns delta updates (rescore / add / lookupNext / rename / drop), maintains a running resultSoFar, decides done; in goal mode a sentinel may reopen a premature done and force one more wave] until done / rabbithole-dry / wave hard-cap (15) → FINALIZE: an opus INITIATOR names the load-bearing facts + report focus → a sonnet refine pass fact-checks + hardens those facts against the sources → an opus JUDGE judges the hardened answer (goal met, verification real, derivation valid) and steers a bounded remediation loop — the brain derives the answer (writing + running code, propagating error bars) when one is needed, refine re-checks a mis-hardened fact, or the crawl reopens on a real gap → an opus synthesiser writes the 7-section report. Pursued-archive (no delete-on-pursue) + pursued memory; scoreHistory rides natively on each rabbit-hole id. Two modes: goal (satisficing) / collect (exhaustive). Returns per-wave markdown + refinement + report + _rabbitHoles.json.',
  phases: [
    {
      title: 'Scout',
      detail:
        'the seed: haiku scout maps the landscape (fetch sources with the rabbit-hole footer) → opus prospector names the high-value authoritative source venues → the brainer scores the scout rabbit-holes, assigns each its venue subset, and looks up the first wave',
    },
    {
      title: 'Research',
      detail:
        'each wave: the brainer looks up OR originates the rabbit-holes worth pursuing + assigns each its venue subset → parallel haiku lane-researchers pursue (preferring assigned venues) → the brainer returns delta updates (rescore / add / lookupNext), maintains the running resultSoFar (knows pursued + score trajectory), decides done; goal-mode sentinel can force one more wave on a real gap',
    },
    {
      title: 'Finalize',
      detail:
        'an opus INITIATOR names the load-bearing facts + report focus → refinement (a sonnet refine agent fact-checks + hardens each fact against the sources) → an opus JUDGE judges the hardened answer and drives a bounded remediation loop — the brain DERIVES the answer (writing + running code, propagating error bars) when one is needed, refine re-checks a mis-hardened fact, or the crawl reopens on a real gap → an opus synthesiser writes the report',
    },
    {
      title: 'Debug',
      detail:
        'opt-in (arg.debug): a final Debug & Analysis agent consolidates metrics + run log + raw agent I/O into one _debug.md — incl. prospector→researcher venue-utilization and any arg.debugPrompt question',
    },
  ],
};
// ╔══ module: src/agents/shared.ts ════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
// Shared cross-agent fragments — imported by the per-agent modules in this folder so a
// fragment used by more than one agent lives in EXACTLY one place (never duplicated per agent).
//
// Two kinds live here:
//   • static PROMPT fragments (FINISH, WEB_ONLY) — guard clauses appended to several agents'
//     prompts. (The run-DERIVED fragments — NET, FOOTER, RUBRIC, STOP, THINKER_NOTE,
//     RESEARCHER_NOTE, COMPUTER_NOTE — are built per run on the CONFIG singleton in ../config.js.)
//   • shared StructuredOutput SCHEMA bricks — the nested sub-schemas reused across more than one
//     agent's output contract (RABBITHOLE), plus the single-source nested bricks the top-level
//     contracts compose. Each agent's TOP-LEVEL schema is co-located in its own file; these
//     reusable bricks stay here so each nesting identity has one definition.
// ─────────────────────────────────────────────────────────────────────────────
                                                

// ── static prompt guard clauses ──
// FINISH: the pure reducers (brainer, sentinel, initiator, synthesiser) already hold the data they
// need — they MAY use a tool if it genuinely helps, but the hard rule is they FINISH: emit the
// COMPLETE StructuredOutput rather than getting lost (the wave-0 brainer once spent its whole turn
// reading this repo's own files on a self-referential query and never emitted resultSoFar/lookupNext/stop).
const FINISH = `
The data above is enough to decide. You may consult a tool if it genuinely helps, but keep it brief — the answer does not require it. Your one required action: return the complete StructuredOutput with every required field, never a partial object.`;
// WEB_ONLY: the refine pass checks claims on the web — the local repo code is never evidence.
const WEB_ONLY = `
Use the web only (WebSearch/WebFetch) to check sources — never read local files or this repo's own code; they are not evidence.`;

// ── shared schema bricks (declaration order respects nesting) ──
const RABBITHOLE         = {
  type: 'object',
  properties: { keyword: { type: 'string' }, why: { type: 'string' } },
  required: ['keyword', 'why'],
};
const SCORED         = {
  type: 'object',
  properties: { keyword: { type: 'string' }, why: { type: 'string' }, score: { type: 'number' } },
  required: ['keyword', 'why', 'score'],
};
const PAGE         = {
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
const LOOKUP         = {
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
    ref: {
      type: 'string',
      description:
        'a concrete URL or DOI for this lane to fetch DIRECTLY (a followed citation) instead of WebSearching — set it when you are chasing a specific source',
    },
  },
};
// resultSoFar = the run's living MEMORY, carried wave to wave. The brainer maintains it; refinement gets the FINAL one only.
const RESULT_SO_FAR         = {
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
// ╔══ module: src/config.ts ═══════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
// Configs — validates the injected JSON args (which can be ANYTHING) and fills
// safe defaults in the constructor. One immutable CONFIG singleton holds the run.
// (Per-agent tier/effort/schema/prompt-builder live in src/agents/<agent>/; the
// shared prompt fragments + schema bricks live in src/agents/shared.ts.)
// ─────────────────────────────────────────────────────────────────────────────
                                                                

class Configs {
  // run config (validated + defaulted)
  query        ;
  mode      ;
  maxWave                 ;
  HARD_CAP        ;
  parallelLaneResearchAgentsPerWave                 ;
  parallelSourcesPerLaneResearchAgent                 ;
  PHASE          ;
  MAX_SENTINEL_REOPENS        ;
  MAX_JUDGE_PASSES        ;
  MAX_LANE_REFAILS        ;
  VALIDATOR_THIN        ;
  QUERY_PLATEAU        ;
  AGENT_RETRIES        ;
  INJECT_SCORE        ;
  compute         ;
  computerNote        ;
  thinkerNote        ;
  researcherNote        ;
  debug         ;
  debugPrompt        ;
  tag        ;
  slug        ;
  DIR        ;
  rawArgs         ; // the COMPLETE set of arguments the run was launched with, captured verbatim (persisted into the output)
  // derived prompt fragments woven into the agent builders
  FOOTER        ;
  NET        ;
  COMPUTER_NOTE        ;
  THINKER_NOTE        ;
  RESEARCHER_NOTE        ;
  RUBRIC        ;
  STOP        ;

  constructor(rawArgs         ) {
    // args: { query, mode?, compute?, maxWave?, parallelLaneResearchAgentsPerWave?, parallelSourcesPerLaneResearchAgent?, debug?, debugPrompt? }
    let parsed         ;
    try {
      parsed = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
    } catch (e) {
      throw new Error('RR: args is not valid JSON — ' + ((e && e.message) || e));
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('RR: args must be a JSON object { query, mode?, maxWave? }');
    }
    const arg = parsed           ;
    if (typeof arg.query !== 'string' || arg.query.trim() === '') {
      throw new Error('RR requires args { query: non-empty string, mode?, maxWave? }');
    }
    this.rawArgs = arg; // capture the COMPLETE launch args verbatim — persisted into the output files
    // typed readers — keep the supplied value only when it is the right type, else fall back to the default
    const str = (v         , d        )         => (typeof v === 'string' && v.length ? v : d);
    const posInt = (v         , d        )         =>
      Number.isInteger(v) && (v          ) > 0 ? (v          ) : d;
    const bool = (v         , d         )          => (typeof v === 'boolean' ? v : d);
    const autoInt = (v         , lo        , hi        , d                 )                  =>
      v === 'auto'
        ? 'auto'
        : Number.isInteger(v) && (v          ) > 0
          ? Math.min(hi, Math.max(lo, v          ))
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
const CONFIG = new Configs(args);
// ╔══ module: src/utils/index.ts ══════════════════════════════════════════

                                                                                          

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — stateless transforms + the file/markdown renderers.
// ─────────────────────────────────────────────────────────────────────────────
const norm = (s                           )         =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
// normalize a URL/DOI for dedup — drop scheme, www, the doi.org resolver prefix, and any trailing slash so
// "https://doi.org/10.x" and "10.X" collapse to one key (the fetch tool resolves either form).
const normRef = (s                           )         =>
  (s || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^(?:dx\.)?doi\.org\//, '')
    .replace(/\/+$/, '');
const lab = (s        )         => norm(s).replace(/ /g, '-').slice(0, 24);
const padIdx = (n        )         => String(n).padStart(2, '0');
const lastScore = (r                                )                =>
  r.scoreHistory.length ? r.scoreHistory[r.scoreHistory.length - 1].score : null;
// one-line render of an open store entry for the brainer / sentinel: `#id [last score or "new"] keyword — why`
// (a ` ↪ ref` suffix flags a lead that carries a concrete URL/DOI to fetch directly).
const openLine = (r   
             
                  
              
                             
               
 )         =>
  '#' +
  r.id +
  ' [' +
  (r.scoreHistory.length ? r.scoreHistory[r.scoreHistory.length - 1].score : 'new') +
  '] ' +
  r.keyword +
  ' — ' +
  r.why +
  (r.ref ? ' ↪ ' + r.ref : '');

// plain() — render a value as compact PLAIN TEXT for interpolation INTO an agent prompt (replaces JSON.stringify-in-prompts: less noise, no
// braces/quotes). string/number/boolean → as-is; array → one "- el" line each (recursing, nested indented two spaces); object → "key: value"
// per key, SKIPPING any key whose value is null/undefined/''/[]/{} unless opts.keep names it (those render "key: (none)"); nested indent two spaces.
const isEmpty = (v         )          =>
  v == null ||
  v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v          ).length === 0);
function plain(value         , opts                      )         {
  opts = opts || {};
  const keep = opts.keep || [];
  if (value == null) return '';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((el         ) =>
        plain(el, opts)
          .split('\n')
          .map((l, i) => (i === 0 ? '- ' : '  ') + l)
          .join('\n'),
      )
      .join('\n');
  }
  const lines           = [];
  for (const k of Object.keys(value                           )) {
    const v = (value                           )[k];
    if (isEmpty(v)) {
      if (keep.includes(k)) lines.push(k + ': (none)');
      continue;
    }
    if (typeof v === 'object') {
      lines.push(k + ':');
      for (const ln of plain(v, opts).split('\n')) lines.push('  ' + ln);
    } else {
      lines.push(k + ': ' + String(v));
    }
  }
  return lines.join('\n');
}

// the HIDDEN lane cap: the brainer is never told a count — JS clamps to laneCount (5 in auto) here.
const laneCount         =
  CONFIG.parallelLaneResearchAgentsPerWave === 'auto'
    ? 5
    : CONFIG.parallelLaneResearchAgentsPerWave;
const trailOf = (path          , keyword         )         =>
  [CONFIG.query.length > 60 ? CONFIG.query.slice(0, 57) + '…' : CONFIG.query]
    .concat(path || [], keyword ? [keyword] : [])
    .join('  →  ');

// PROMPT_LOG — the exact prompt sent for EVERY agent call, keyed by label (always populated, not just in debug). The numbered phase files
// prepend their own prompt (Change E): the prompt lives in the phase file, not a separate _io.md.
const PROMPT_LOG                         = {};
// CHANGE E — prepend the exact prompt sent for `label` ahead of a numbered phase file's body. result.md stays clean (never wrapped).
const withPrompt = (label        , body        )         =>
  (PROMPT_LOG[label] ? '## Prompt sent\n\n' + PROMPT_LOG[label] + '\n\n---\n\n' : '') + body;

// render — fill a template's `{{key}}` holes from a vars object. A tiny deterministic
// `String.replace` replacer (no engine, no globals): (1) strip ONE trailing template newline
// (editors add one; the inline templates carried none); (2) strip standalone `{{! … }}` comment
// lines whole — line + newline — so they stay invisible; (3) substitute each `{{key}}` with its
// value, an absent key rendering as ''. Single-pass, so a substituted value is never re-scanned.
const render = (tpl        , vars                         )         =>
  tpl
    .replace(/\n$/, '')
    .replace(/^[ \t]*\{\{![\s\S]*?\}\}[ \t]*(?:\r?\n|$)/gm, '')
    .replace(/\{\{(\w+)\}\}/g, (_, k        ) => {
      const v = vars[k];
      return v == null ? '' : String(v);
    });

// markdown render of a wave's resultSoFar (the brainer's living memory) — this IS the kept per-wave log.
const bullets = (arr                             )         =>
  arr && arr.length ? arr.map((x) => '- ' + x).join('\n') : '_none_';
function resultSoFarMd(r                    )         {
  if (!r || typeof r !== 'object') return '_none_';
  const ev = (r.evidence || [])
    .map(
      (e          ) =>
        '- [' +
        (e.status || '?') +
        '] **' +
        (e.fact || '') +
        ':** ' +
        (e.value || '') +
        (e.source ? ' — ' + e.source : ''),
    )
    .join('\n');
  return (
    '**Answer:** ' +
    (r.answer || '_(none)_') +
    '\n\n**Confidence:** ' +
    (r.confidence || '_(none)_') +
    (r.working ? '\n\n**Working:**\n\n' + r.working : '') +
    '\n\n**Evidence:**\n' +
    (ev || '_none_') +
    (r.assumptions && r.assumptions.length
      ? '\n\n**Assumptions:**\n' +
        r.assumptions.map((a) => '- **' + (a.claim || '') + '** — ' + (a.basis || '')).join('\n')
      : '') +
    '\n\n**Resolved:**\n' +
    bullets(r.resolved) +
    '\n\n**Open gaps:**\n' +
    bullets(r.openGaps) +
    '\n\n**Tensions:**\n' +
    bullets(r.tensions)
  );
}

// per-wave brainer markdown (one file per crawl wave). `store` = the open rabbit-hole store snapshot at write time.
                 
             
                  
              
                       
                 
                     
  
                                                                                  
function waveMd(
  wave        ,
  coord                                                 ,
  picks            ,
  finds           ,
  store                  ,
)         {
  const sc = (p                          ) => (p.score != null ? p.score : 'new');
  return (
    '# Wave ' +
    wave +
    ' — Brainer\n\n**done:** ' +
    coord.stop.done +
    ' — ' +
    coord.stop.reason +
    '\n\n## Result so far\n\n' +
    resultSoFarMd(coord.resultSoFar) +
    (finds.length
      ? '\n\n## Findings pursued this wave\n\n' +
        finds
          .map(
            (f) => '### ' + f.rabbitHole + '\n\n_trail: ' + (f.trail || '') + '_\n\n' + f.summary,
          )
          .join('\n\n')
      : '') +
    '\n\n## Looking up next (' +
    picks.length +
    ')\n\n' +
    (picks
      .map(
        (p, i) =>
          i +
          1 +
          '. **[' +
          sc(p) +
          ']** #' +
          p.id +
          ' ' +
          p.keyword +
          '\n   - trail: ' +
          trailOf(p.path) +
          (p.sources && p.sources.length ? '\n   - venues: ' + p.sources.join(', ') : '') +
          '\n   - ' +
          p.why,
      )
      .join('\n') || '_none_') +
    '\n\n## Open rabbit-holes (scored)\n\n' +
    ([...store]
      .sort((a, b) => (lastScore(b) ?? -1) - (lastScore(a) ?? -1))
      .map(
        (r) =>
          '- **[' +
          (lastScore(r) != null ? lastScore(r) : 'new') +
          ']** #' +
          r.id +
          ' ' +
          r.keyword,
      )
      .join('\n') || '_none_') +
    '\n'
  );
}
// ╔══ module: src/agents/scout/prompts.ts ═════════════════════════════════
// SCOUT prompts — the wave-0 seed template + its assembly function. The template strings are
// module-level consts; buildScout only assembles/substitutes (it holds no template text itself).

                                                      

const SCOUT_TPL = `{{! scout — one broad sweep that maps the web landscape and seeds the first rabbit-holes }}
Scout the web landscape for: "{{query}}". {{net}}
Step 1 — run one broad WebSearch to map the landscape and collect candidate sources (URLs).
Step 2 — pick the up-to-5 most relevant sources and WebFetch each. In every WebFetch prompt, first ask "What are the key facts on this page about: {{query}}?", then append this exact instruction: <<{{footer}}>>
Step 3 — return: landscape (one paragraph); pages[] (each: url, 2-3 sentence summary, rabbitHoles[] copied from the page's "Rabbit holes" section as {keyword, why}); deadEnds[] for any source that timed out, was parked, or was off-topic — do not invent rabbit-holes for those. If every source is dead/unreachable, still return a valid result: landscape from your search, pages [], the dead sources in deadEnds.{{researcherClause}}
`;

const buildScout = ({ query, net, footer, researcherNote }           ) => {
  const researcherClause = researcherNote ? '\n' + researcherNote : '';
  return render(SCOUT_TPL, { query, net, footer, researcherClause });
};
// ╔══ module: src/agents/scout/index.ts ═══════════════════════════════════
// SCOUT — wave-0 seed. One broad WebSearch maps the landscape, then up-to-5 WebFetches seed the
// first rabbit-holes. Tier: haiku — the page reading is the FIXED haiku WebFetch digester's job, leaving
// the scout a bounded "map + extract rabbit-holes" task (user directive + measured: haiku summaries
// were accurate + specific). Effort: medium (worker load). Escalate only on measured failure.


                                                                     

const SCOUT         = {
  type: 'object',
  properties: {
    landscape: { type: 'string' },
    pages: { type: 'array', items: PAGE },
    deadEnds: { type: 'array', items: { type: 'string' } },
  },
  required: ['landscape', 'pages'],
};

const scout                   = {
  tier: 'haiku',
  effort: 'medium',
  schema: SCOUT,
  buildPrompt: buildScout,
};
// ╔══ module: src/agents/prospector/prompts.ts ════════════════════════════
// PROSPECTOR prompts — the venue-naming template + its assembly function. Template strings are
// module-level consts; buildProspector only assembles/substitutes.


                                                           

const PROSPECTOR_TPL = `{{! prospector — names the high-value authoritative source venues for the topic }}
Goal: "{{query}}". Scout landscape: {{landscape}}
Sources the scout already opened:
{{sources}}
Name the 6-8 highest-value, authoritative source venues for this goal — where primary, expert, or rigorous information on the topic actually lives. The right set is domain-specific (GPU serving → arXiv/USENIX/MLSys/SemiAnalysis/r/LocalLLaMA; a stock → SEC EDGAR/earnings calls/Bloomberg; weather → NOAA/ECMWF).
Span what is relevant here: primary research (papers/preprints + where they live for this field), official docs, standards bodies/regulators, authoritative datasets/benchmarks, deep practitioner/industry analysis, high-signal community venues. Exclude generic SEO blogs.
Assess where this subject is most actively researched. When a non-English literature is genuinely significant for this topic — a disease studied mostly in China/Japan, a field led by Russian or Korean groups — name the high-value native venues for those languages (CNKI/Wanfang → Chinese, J-STAGE/ICHUSHI → Japanese, SciELO/LILACS → Spanish/Portuguese, eLibrary.ru → Russian, KoreaMed → Korean), each with how to query it, and set languageGuidance: one line telling the brainer which languages to cover and why. For an English-dominated topic, return only English venues and languageGuidance "".
Where the same concept is indexed under other names (older or alternate terms, regional spellings), fold those synonyms into the venues' search guidance so English-indexed work filed under a different name is still found.
For each venue: source (venue + how to reach/search it, e.g. "arXiv (site:arxiv.org)"), goodFor (the sub-questions it is best for — specific enough for the downstream brainer to match each research lane to the right venue), and lang (its language as an ISO-ish code like zh/ja/es/ru/ko — omit for English).
Run WebSearch (one or more queries) to discover and verify the actual highest-value venues — confirm each exists and is authoritative (memory alone misses recent venues). Return highValueSources (6-8, lang-tagged when non-English), languageGuidance ("" when the topic is English-dominated), and a brief reasoning naming what you searched.{{thinkerClause}}{{researcherClause}}{{WEB_ONLY}}
`;

const buildProspector = ({
  query,
  landscape,
  sources,
  thinkerNote,
  researcherNote,
}                ) => {
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  const researcherClause = researcherNote ? '\n' + researcherNote : '';
  return render(PROSPECTOR_TPL, {
    query,
    landscape,
    sources: plain(sources),
    thinkerClause,
    researcherClause,
    WEB_ONLY,
  });
};
// ╔══ module: src/agents/prospector/index.ts ══════════════════════════════
// PROSPECTOR — runs after the scout, first agent of the Crawl phase. Names the high-value
// AUTHORITATIVE source venues for THIS topic (domain-specific); output rides with the brainer, which
// assigns the relevant subset to each lane. Tier: opus (cross-domain venue judgment). Effort: high.

                                                                          

// PROSPECTOR schema — names the high-value AUTHORITATIVE source venues for THIS topic (domain-specific); output rides with the brainer.
const SOURCES         = {
  type: 'object',
  properties: {
    highValueSources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description:
              'the venue + how to reach/search it, e.g. "arXiv (site:arxiv.org)", "SemiAnalysis (semianalysis.com)"',
          },
          goodFor: {
            type: 'string',
            description:
              'the kinds of sub-questions/rabbit-holes this venue is BEST for — specific enough for the brainer to match a research lane to it',
          },
          lang: {
            type: 'string',
            description:
              "the venue's language as an ISO-ish code (zh, ja, es, pt, ru, ko, …) or language name; OMIT for English venues",
          },
        },
        required: ['source', 'goodFor'],
      },
    },
    languageGuidance: {
      type: 'string',
      description:
        'one line routing the brainer to the non-English literatures that matter for this topic and why; "" when the topic is English-dominated',
    },
    reasoning: {
      type: 'string',
      description: 'brief: how you chose these venues / what you searched to confirm',
    },
  },
  required: ['highValueSources'],
};

const prospector                        = {
  tier: 'opus',
  effort: 'high',
  schema: SOURCES,
  buildPrompt: buildProspector,
};
// ╔══ module: src/agents/brainer/prompts.ts ═══════════════════════════════
// BRAINER prompts — the brain's per-wave template + the clause-assembly function. Template strings
// are module-level consts; buildBrainer only assembles/substitutes the per-wave clauses.


                                                                            

const BRAINER_TPL = `{{! brainer — the brain: scores and steers rabbit-holes, keeps resultSoFar, decides done }}
You are the BRAINER — you make every decision in this research run and set its direction.

How the run works: a scout seeded the first rabbit-holes and a prospector named the source venues; then you drive each wave. You hand rabbit-holes to parallel lane-researchers — fast workers that WebSearch + WebFetch the venues you assign, read the pages, and return findings + new rabbit-holes — then you update the running result, steer the next wave, and decide when to stop. On stop, a refinement stage adversarially checks your findings and writes the report.

The engine keeps the open rabbit-holes as an id-keyed store and carries each one's score history natively — you never re-emit the whole set, you return deltas against it.

Direction is two powers:
• LOOK UP rabbit-holes already in the store (by id) to research next.
• ORIGINATE — when the answer needs an angle, candidate, or sub-question no stored rabbit-hole covers, add it as a new directive {keyword, why, score} and a researcher will go collect it. Name a gap you can see rather than wait for one to surface; summon a candidate the scout missed — not padding. Put it in \`lookupNext\` to pursue now, or in \`add\` to park it for a later wave.

As you steer, hold three rules:
• Pivot on disproof — when a lead is fundamentally refuted, abandon it without sunk-cost and take a different road; a dead lead dropped is progress.
• Surfacing is not verifying — finding a result does not verify it. If the answer's headline rests on a claim you have not stress-tested, the judge will reject the stop, so stress-test load-bearing claims before declaring done.
• Promote serendipity — a surfaced, non-seeded candidate that out-evidences the seeded ones becomes first-class: deepen it like a seed rather than under-explore it for being off the seed list.

{{probeClause}}{{thinkerClause}}{{researcherClause}}

Wave {{wave}}. Query: "{{query}}". {{rubric}}
Scout landscape: {{landscape}}
RABBIT-HOLE STORE — open rabbit-holes (\`#id [last score or "new"] keyword — why\`); re-score up or down, a low one can resurrect, score every "new" one:
{{open}}
ALREADY PURSUED — do not look up or re-originate these (research history):
{{pursuedList}}
Findings this wave (from the researchers' page-reading):
{{findings}}{{trajectory}}{{venuesClause}}{{languageClause}}

{{memoryClause}}
Update and return \`resultSoFar\` as the run's memory: refine \`answer\`; append load-bearing \`evidence\` only (each {fact, value, source, status: settled|tentative|contested} — facts the answer rests on, not a transcript); record the working \`assumptions\` the answer leans on (each {claim, basis}) and revise or retire them as evidence lands; move closed parts into \`resolved\`; keep \`openGaps\` current; record any \`tensions\` (conflicting sources); for build-the-answer / estimate questions grow the \`working\` derivation chain (else ''); set \`confidence\`.
Weight findings by evidence quality — funding independence, sample size, replication, stated limitations — not mere existence; let it drive both your scores and \`confidence\`.
For each headline / load-bearing finding, originate a lane to hunt failed replications, null trials, or refutations. Keep such a claim at status \`tentative\` (single source) until an independent source — a different group and funder — corroborates it; only then mark it \`settled\`.{{computeField}}

Then return deltas against the store:
(1) \`rescore\`: [{id, score}] — only the rabbit-holes whose 0-100 score changes this wave (score every "new" one at least once); unlisted ones keep their last score. Score honestly per the rubric; a marginal one scores low.
(2) \`add\`: [{keyword, why, score}] — new rabbit-holes to park in the store for a later wave (the engine assigns each an id).
(3) \`lookupNext\`: the rabbit-holes to research now — each either {id} (a stored one) or {keyword, why, score{{scoreFields}}} (one you originate and pursue now). None may be already pursued.{{assignClause}}
(4) \`rename\`: [{id, keyword, why?}] — relabel a rabbit-hole, keeping its id + history (optional).
(5) \`drop\`: [id, …] — eliminate a dead/duplicate rabbit-hole; a merge = drop the duplicate and rescore the survivor (optional).
(6) \`stop\`: {done, reason}. {{stop}}{{goalClause}}{{sentinelClause}}{{validatorClause}}{{FINISH}}
`;

const buildBrainer = ({
  wave,
  query,
  rubric,
  landscape,
  pursuedList,
  open,
  findings,
  topScores,
  resultSoFar,
  stop,
  mode,
  venues,
  languageGuidance,
  lastSentinelReason,
  lastValidatorMissing,
  compute,
  computerNote,
  thinkerNote,
  researcherNote,
}             ) => {
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  const sentinelClause = lastSentinelReason
    ? `\nPRIOR SENTINEL REJECTION — clear this before declaring done: ${lastSentinelReason}`
    : '';
  const validatorClause = lastValidatorMissing
    ? `\nVALIDATOR — last wave left these unfilled; re-pursue the reopened lanes or originate new ones to close them: ${lastValidatorMissing}`
    : '';
  const researcherClause = researcherNote ? '\n' + researcherNote : '';
  const trajectory = topScores.length
    ? `
TOP-PICK SCORE TRAJECTORY by wave (calibrated 0-100): ${plain(topScores)}
A steadily declining trajectory means high-value rabbit-holes are drying up — read it as convergence.`
    : '';
  const goalClause =
    mode === 'goal'
      ? `
Goal mode: if the goal is already well answered and the best remaining rabbit-hole adds only marginal value (a declining trajectory is strong evidence), set stop.done=true rather than chase diminishing returns.`
      : '';
  const venuesClause =
    venues && venues.length
      ? `
SOURCE VENUES (from the prospector) — give each lookupNext pick the subset whose source fits its lane, in its \`sources\`, so its researcher searches the right places first:
${plain(venues)}`
      : '';
  const memoryClause =
    wave === 0
      ? `RESULT SO FAR — the run's living MEMORY. Start it this wave: capture the answer as it stands plus the load-bearing evidence behind it.`
      : `RESULT SO FAR — the run's living MEMORY, carried wave to wave. Prior version:
${plain(resultSoFar)}`;
  const languageClause =
    languageGuidance && languageGuidance.trim()
      ? `
Some of this topic's strongest literature is non-English. Guidance: ${languageGuidance}. Deliberately route some lanes to the non-English venues above, giving each its native venue(s) in \`sources\` — rather than defaulting every lane to English.`
      : '';
  const probeClause = `Before you decide, hunt for coverage gaps — a candidate, sub-question, or angle the goal needs that no lane has touched — and probe them yourself with WebSearch / WebFetch (as many as you need) to fill them; fold what you find into resultSoFar and originate the missing rabbit-holes into \`lookupNext\`. Beyond gap-filling, leave the heavy digging to the lane-researchers.`;
  const scoreFields = ', sources';
  const assignClause = venues && venues.length ? ' Assign each its `sources` venue subset.' : '';
  const computeField = compute
    ? `

COMPUTE TO STEER: when a calculation would change your next move — a number the answer is being built toward, or an estimate of which gap matters most — derive it yourself this wave (reason it out, or write and run a short Python/Node script when the arithmetic needs it) and fold the result into \`working\`. Keep it light; you are steering, not writing the final derivation.${computerNote ? '\n\n' + computerNote : ''}`
    : '';
  return render(BRAINER_TPL, {
    probeClause,
    thinkerClause,
    researcherClause,
    wave,
    query,
    rubric,
    landscape,
    open: plain(open),
    pursuedList: plain(pursuedList),
    findings: plain(findings),
    trajectory,
    venuesClause,
    languageClause,
    memoryClause,
    scoreFields,
    assignClause,
    stop,
    goalClause,
    sentinelClause,
    validatorClause,
    computeField,
    FINISH,
  });
};

// brain FINALIZE-COMPUTE — the brainer re-invoked (code-capable, full resultSoFar) to DERIVE the final answer
// on the hardened facts, on the judge's directive. Transplants the old compute chain's rigor: fact-check the
// input numbers, write + run a short script for the arithmetic, propagate error bars, self-check.
const BRAIN_COMPUTE_TPL = `{{! brain-compute — the brain derives the final answer on the hardened facts, with rigor + error bars }}
You are the BRAINER, now DERIVING the final answer for: "{{query}}". The judge ruled the answer still needs this derivation — build it, do not restate facts.
Judge directive: {{directive}}
Judge reasoning: {{reason}}
Hardened facts (adversarially fact-checked + source-corrected — your input numbers):
{{hardenedFacts}}
The run's accumulated RESULT (your answer + the half-built \`working\` derivation to finish):
{{resultSoFar}}
Derive with rigor:
- first fact-check your input numbers: verify each against a current primary source (WebSearch / WebFetch) and correct any that is stale, wrong, or imprecise before computing — a derivation is only as sound as its inputs;
- assemble the verified inputs with their units;
- write and run a short script for any non-trivial arithmetic — load Bash + Write via ToolSearch if absent, run python (or node) — compute, do not estimate;
- propagate the input uncertainties into an explicit ± error range;
- adversarially check your own work: re-derive a second way or sanity-check against an anchor, and fix any unit / formula / arithmetic slip.{{noteClause}}{{thinkerClause}}
Return the updated \`resultSoFar\`: fold the completed derivation into \`working\` (the verified inputs, the steps, the numbers, the ± result, the self-check), put the headline computed result in \`answer\`, and keep evidence / resolved / openGaps / tensions / confidence current.{{FINISH}}
`;

const buildBrainerCompute = ({
  query,
  resultSoFar,
  hardenedFacts,
  directive,
  reason,
  computerNote,
  thinkerNote,
}                    ) => {
  const noteClause = computerNote ? '\n' + computerNote : '';
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  return render(BRAIN_COMPUTE_TPL, {
    query,
    resultSoFar: plain(resultSoFar),
    hardenedFacts: plain(hardenedFacts),
    directive: directive || '(derive the answer the goal needs)',
    reason: reason || '',
    noteClause,
    thinkerClause,
    FINISH,
  });
};
// ╔══ module: src/agents/brainer/index.ts ═════════════════════════════════
// BRAINER — the brain / global reducer. Sees the open store + pursued set + running resultSoFar; returns
// the updated resultSoFar + DELTAS (rescore / add / lookupNext / rename / drop / stop). Looks up stored
// leads OR originates new directions; code-capable (general-purpose) when compute is on so it derives its
// own steering numbers inline — no separate compute stage.
// Tier: opus — ALWAYS Opus (the global brain/reducer — measured: a Haiku brainer scored erratically +
// drifted off-goal). Effort: xhigh — re-scores the store every wave AND sets direction AND maintains
// resultSoFar; the one role where the extra reasoning budget pays back most.


                                                                       


// COORD = the brainer's per-wave output: the updated resultSoFar + DELTAS against the engine's id-keyed open store. The engine carries
// each rabbit-hole's id + scoreHistory natively — the brainer never re-emits the whole set, it only sends what changed.
const COORD         = {
  type: 'object',
  properties: {
    resultSoFar: RESULT_SO_FAR,
    rescore: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'number' }, score: { type: 'number' } },
        required: ['id', 'score'],
      },
      description:
        'only the open rabbit-holes whose score changes this wave (the engine pushes {wave,score} to each id\'s history); unlisted ones keep their last score. Score every "new" (unscored) one at least once.',
    },
    add: {
      type: 'array',
      items: SCORED,
      description:
        'new rabbit-holes to park in the store for a later wave — the engine assigns each a fresh id, scoreHistory seeded with this score',
    },
    lookupNext: {
      type: 'array',
      items: LOOKUP,
      description:
        'the rabbit-holes to research now — each either {id} (a stored one) or {keyword,why,score,sources?} (originate-and-pursue-now). None may be already pursued; assign each its relevant `sources` venue subset.',
    },
    rename: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          keyword: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['id', 'keyword'],
      },
      description: 'relabel a rabbit-hole, keeping its id + score history',
    },
    drop: {
      type: 'array',
      items: { type: 'number' },
      description:
        'ids of dead/duplicate rabbit-holes to eliminate (a MERGE = drop the duplicate, rescore the survivor)',
    },
    stop: {
      type: 'object',
      properties: {
        done: { type: 'boolean' },
        reason: { type: 'string', description: 'one line: why done, or what is still missing' },
      },
      required: ['done', 'reason'],
    },
  },
  required: ['resultSoFar', 'rescore', 'add', 'lookupNext', 'stop'],
};

const brainer                     = {
  tier: 'opus',
  effort: 'xhigh',
  schema: COORD,
  buildPrompt: buildBrainer,
};

// BRAIN_COMPUTE = the brain finalize-compute output: the updated resultSoFar with the derivation folded into `working`.
const BRAIN_COMPUTE         = {
  type: 'object',
  properties: { resultSoFar: RESULT_SO_FAR },
  required: ['resultSoFar'],
};
// ╔══ module: src/agents/sentinel/prompts.ts ══════════════════════════════
// SENTINEL prompts — the terminal-skeptic template + its assembly function. Template strings are
// module-level consts; buildSentinel only assembles/substitutes.


                                                         

const SENTINEL_TPL = `{{! sentinel — goal-mode guard that contests a premature done and can force one more wave }}
The brainer just declared the crawl done for: "{{query}}". Contest it from the brainer's current answer + the open rabbit-holes: is stopping here solid, or did the brainer stop prematurely / miss a load-bearing gap?
Brainer's result so far (its current answer + evidence + open gaps):
{{resultSoFar}}
Reason it called done: {{reason}}
Per-wave log (what each wave pursued + where the answer stood):
{{waveLog}}
Open rabbit-holes not yet pursued (\`#id [score] keyword — why\`):
{{rabbitHoles}}
Already pursued — do not propose any of these:
{{pursuedList}}
High bar: uphold the brainer (solid=true) unless a load-bearing gap would materially change or undermine the answer — "more detail is possible" is not a reason to continue.
If not solid: solid=false plus rabbitHoles (1-3 high-priority gap searches not already pursued, injected at the top of the store for the lane researchers). If solid: solid=true, empty rabbitHoles.
Return solid (bool), reasoning, rabbitHoles.{{thinkerClause}}{{researcherClause}}{{FINISH}}
`;

const buildSentinel = ({
  query,
  resultSoFar,
  reason,
  waveLog,
  rabbitHoles,
  pursuedList,
  thinkerNote,
  researcherNote,
}              ) => {
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  const researcherClause = researcherNote ? '\n' + researcherNote : '';
  return render(SENTINEL_TPL, {
    query,
    resultSoFar: plain(resultSoFar),
    reason: plain(reason),
    waveLog: plain(waveLog),
    rabbitHoles: plain(rabbitHoles),
    pursuedList: plain(pursuedList),
    thinkerClause,
    researcherClause,
    FINISH,
  });
};
// ╔══ module: src/agents/sentinel/index.ts ════════════════════════════════
// SENTINEL — the goal-mode TERMINAL skeptic of the crawl phase, the inverse of verify. Runs ONCE when the
// brainer declares done: sees the open store + the brainer's running answer; if the stop isn't solid it
// injects high-score gap objects at the store top and the crawl resumes. Bounded by MAX_SENTINEL_REOPENS.
// Tier: opus (adversarial judgment). Effort: xhigh.

                                                                        

// the goal-mode SENTINEL schema — the TERMINAL skeptic of the crawl phase, the inverse of verify. It runs ONCE when the brainer declares
// done: it sees the open store + the brainer's running answer and decides whether stopping is SOLID. If not, it injects high-score gap objects
// at the TOP of the store and hands them back to the lane researchers — the crawl resumes. Bounded by MAX_SENTINEL_REOPENS.
const SENTINEL         = {
  type: 'object',
  properties: {
    solid: {
      type: 'boolean',
      description:
        "true = the brainer's decision to stop is SOLID (uphold it, end the crawl); false = the brainer stopped prematurely / left a load-bearing gap",
    },
    reasoning: {
      type: 'string',
      description: 'why the stop is solid, or what load-bearing gap was missed',
    },
    rabbitHoles: {
      type: 'array',
      items: {
        type: 'object',
        properties: { keyword: { type: 'string' }, why: { type: 'string' } },
        required: ['keyword', 'why'],
      },
      description:
        'when solid=false: 1-3 concrete high-priority gap searches to inject at the store top (NONE already pursued); empty when solid=true',
    },
  },
  required: ['solid', 'reasoning'],
};

const sentinel                      = {
  tier: 'opus',
  effort: 'xhigh',
  schema: SENTINEL,
  buildPrompt: buildSentinel,
};
// ╔══ module: src/agents/validator/prompts.ts ═════════════════════════════
// VALIDATOR prompts — the per-wave coverage-gate template + its assembly function. Template strings are
// module-level consts; buildValidator only assembles/substitutes the null-lane clause.


                                                          

const VALIDATE_TPL = `{{! validator — per-wave coverage gate: did this wave's lanes fulfill their requests? }}
You are the VALIDATOR for one research wave of: "{{query}}". Judge cheaply, from the intros below, whether each lane fulfilled what it was sent to find.
Requests this wave (\`#id keyword — why\`):
{{requests}}
What each lane returned (intro only):
{{findings}}{{nullClause}}
For each request return {id, fulfilled, reason}: fulfilled=true when the return actually answers the request; false when it is off-target, empty, or too thin to use (one-line reason). Then set enough — did the wave make real progress overall? — and missing — the specific gaps still open for the next wave to re-pursue.
Return checks, enough, missing.{{FINISH}}
`;

const buildValidator = ({ query, requests, findings, nullLanes }               ) => {
  const nullClause =
    nullLanes && nullLanes.length
      ? `\nLanes that returned nothing (failed outright): ${plain(nullLanes)}`
      : '';
  return render(VALIDATE_TPL, {
    query,
    requests: plain(requests),
    findings: plain(findings),
    nullClause,
    FINISH,
  });
};
// ╔══ module: src/agents/validator/index.ts ═══════════════════════════════
// VALIDATOR — the per-wave coverage gate of the Crawl phase (distinct from the terminal judge). After each
// research wave it asks, cheaply, whether every lane fulfilled its request; the engine re-opens any lane that
// returned null or fulfilled:false (bounded by a per-lane failCount) so the next brainer can re-pursue it.
// Tier: sonnet (a bounded, cheap per-wave check). Effort: medium.

                                                                         

const VALIDATE         = {
  type: 'object',
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'the request id this verdict is for' },
          fulfilled: {
            type: 'boolean',
            description:
              'true = the lane answered its request; false = off-target, empty, or too thin',
          },
          reason: {
            type: 'string',
            description: 'one line — why it fell short (when fulfilled is false)',
          },
        },
        required: ['id', 'fulfilled'],
      },
      description: 'one verdict per request',
    },
    enough: { type: 'boolean', description: 'true = the wave made real progress overall' },
    missing: {
      type: 'array',
      items: { type: 'string' },
      description: 'the specific gaps still open, for the next brainer to re-pursue',
    },
  },
  required: ['checks', 'enough'],
};

const validator                       = {
  tier: 'sonnet',
  effort: 'medium',
  schema: VALIDATE,
  buildPrompt: buildValidator,
};
// ╔══ module: src/agents/researcher/prompts.ts ════════════════════════════
// RESEARCHER prompts — the lane-researcher template + its assembly function. Template strings are
// module-level consts; buildResearcher only assembles/substitutes.

                                                           

const RESEARCHER_TPL = `{{! researcher — a lane researcher pursuing ONE rabbit-hole over its assigned venues }}
Pursue one rabbit-hole. {{net}}
TOP GOAL: "{{query}}".
TRAIL that led here (top goal → … → this rabbit-hole): {{trail}}.
Now investigating: "{{keyword}}" (why it matters: {{why}}). Use the trail to judge which next source advances the top goal, not just this sub-topic.{{refClause}}{{venuesClause}}{{translateClause}}
Run a targeted WebSearch, pick the best {{srcCount}} sources, and WebFetch each in parallel. In each WebFetch prompt, first ask the key question about this rabbit-hole, then append: <<{{footer}}>>
If a source is dead, parked, or returns nothing (e.g. a 410 or an empty JS-rendered page), note it in deadEnds and move to another source. If every source is dead, that is still a valid result: return summary noting the dead ends, rabbitHoles [], and the dead sources in deadEnds.
If a fetched source turns out off-goal — it does not advance the top goal even if it sits on the sub-topic — keep it and open one or more additional sources to reach goal-aligned data, returning both the off-goal find and the new ones. You may exceed the {{srcCount}}-source count for this — gather it and let the brainer decide relevance.
For any trial or study you report, capture its funding source, conflicts of interest, sample size, and key limitations in the summary — the provenance the brainer needs to weight it.
Return: summary (2-4 sentences of what you found); rabbitHoles (new gap searches from the footer, {keyword, why}); nextSources (up to 5 of the page's top outbound citations/links to follow, each {ref: exact URL or DOI, why}); deadEnds.{{researcherClause}}
`;

const buildResearcher = ({
  net,
  query,
  trail,
  keyword,
  why,
  footer,
  venues,
  parallelSourcesPerLaneResearchAgent,
  researcherNote,
  ref,
}                ) => {
  const refClause = ref
    ? `
This lane carries a concrete source: fetch ${ref} directly (the fetch tool resolves DOIs) and read it first; widen to WebSearch only if it is unreachable or thin.`
    : '';
  const venuesClause =
    venues && venues.length
      ? `
Search these high-value venues for this lane first: ${venues
          .map(
            (v) =>
              v.source +
              (v.lang ? ' [' + v.lang + ']' : '') +
              (v.goodFor ? ' (' + v.goodFor + ')' : ''),
          )
          .join('; ')}.`
      : '';
  const translateClause =
    venues && venues.some((v) => v.lang)
      ? `
A venue tagged with a non-English language (e.g. [zh]) holds its literature in that language: translate the query terms into it, WebSearch the native venue, read the native-language results, and translate the findings back to English. Carry provenance — give each cited source its original-language title alongside the English translation.`
      : '';
  const researcherClause = researcherNote ? '\n' + researcherNote : '';
  return render(RESEARCHER_TPL, {
    net,
    query,
    trail,
    keyword,
    why,
    refClause,
    venuesClause,
    translateClause,
    srcCount: parallelSourcesPerLaneResearchAgent,
    footer,
    researcherClause,
  });
};
// ╔══ module: src/agents/researcher/index.ts ══════════════════════════════
// RESEARCHER — a lane researcher pursuing ONE rabbit-hole over its assigned venues, parallel one per
// pursued lead. Tier: haiku — the page reading is done by the FIXED haiku WebFetch digester, leaving each
// worker a BOUNDED "summarize 1-2 already-digested pages + extract rabbit-holes" task (user directive +
// measured: haiku researcher summaries were accurate + specific; a SONNET researcher crashed the
// vector-DB run). Effort: medium (worker load). Escalate only on measured failure.


                                                                          

const RESEARCH         = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    rabbitHoles: { type: 'array', items: RABBITHOLE },
    nextSources: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          ref: {
            type: 'string',
            description: 'an exact URL or DOI the page points to, worth fetching directly',
          },
          why: { type: 'string', description: 'one line on why following it advances the goal' },
        },
        required: ['ref', 'why'],
      },
      description:
        "up to 5 of the page's highest-value outbound citations/links as concrete fetch targets — the next lane fetches each directly",
    },
    deadEnds: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'rabbitHoles'],
};

const researcher                        = {
  tier: 'haiku',
  effort: 'medium',
  schema: RESEARCH,
  buildPrompt: buildResearcher,
};
// ╔══ module: src/agents/initiator/prompts.ts ═════════════════════════════
// INITIATOR prompts — the finalize-planner template + its assembly function. Template strings are
// module-level consts; buildInitiator only substitutes the operator-steering clause.


                                                          

const INITIATOR_TPL = `{{! initiator — plans the finalize pipeline, shaping the finish to this query }}
You direct the FINALIZE phase for: "{{query}}". The research is done; below is everything it gathered. Shape the finishing pipeline to fit this query, then return the plan.
The finish runs in two parts, and you set how each starts:
1. REFINEMENT — one refine agent per item adversarially fact-checks that group of load-bearing facts and returns them corrected and hardened. You decide the grouping. (A judge then evaluates the hardened answer and may trigger a derivation or a re-check; you do not plan that.)
2. SYNTHESIS — writes the final report from the hardened, judged answer. You give it a focus note.
The run's accumulated RESULT (the brainer's living memory — answer, the \`working\` derivation, evidence, gaps, tensions):
{{resultSoFar}}
Per-wave log:
{{waveLog}}
Scout landscape: {{landscape}}
Top open rabbit-holes left unpursued:
{{openRabbitHoles}}
Return:
- refinement.facts[] — the load-bearing facts to harden, aggressively grouped: bundle facts that share sources or stand or fall together into ONE item (each {fact, why}); prefer a few broad groups over many atomic facts. Cover every fact that would change the answer if wrong; skip soft restatements.
- synthesiser.focus — one note on what the report must emphasize / the shape the answer should take.{{thinkerClause}}{{FINISH}}
`;

const buildInitiator = ({
  query,
  resultSoFar,
  waveLog,
  landscape,
  openRabbitHoles,
  thinkerNote,
}               ) => {
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  return render(INITIATOR_TPL, {
    query,
    resultSoFar: plain(resultSoFar),
    waveLog: plain(waveLog),
    landscape,
    openRabbitHoles: plain(openRabbitHoles),
    thinkerClause,
    FINISH,
  });
};
// ╔══ module: src/agents/initiator/index.ts ═══════════════════════════════
// INITIATOR — opens the Finalize phase. Reads the final resultSoFar and shapes the finish to the query:
// names the load-bearing facts to harden and sets the report focus. Tier: opus (synthesis/planning).
// Effort: xhigh.

                                                                         

// FINALIZE schemas. The INITIATOR plans the finish (which facts to harden, the report focus); a Sonnet REFINE pass adversarially
// fact-checks each load-bearing fact and returns its corrected claim; an Opus JUDGE then judges the hardened answer.
const INITIATOR         = {
  type: 'object',
  properties: {
    refinement: {
      type: 'object',
      properties: {
        facts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fact: {
                type: 'string',
                description:
                  'a group of related load-bearing facts the answer rests on (state the whole cluster)',
              },
              why: {
                type: 'string',
                description: 'why this group is load-bearing — what breaks if it is wrong',
              },
            },
            required: ['fact', 'why'],
          },
          description:
            'load-bearing facts to harden, aggressively grouped into a few items — bundle facts that share sources or stand or fall together into one; cover all that would change the answer if wrong, skip soft restatements',
        },
      },
      required: ['facts'],
    },
    synthesiser: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          description:
            'a note to the report writer on what to emphasize / the shape the answer should take',
        },
      },
      required: ['focus'],
    },
  },
  required: ['refinement', 'synthesiser'],
};

const initiator                       = {
  tier: 'opus',
  effort: 'xhigh',
  schema: INITIATOR,
  buildPrompt: buildInitiator,
};
// ╔══ module: src/agents/refiner/prompts.ts ═══════════════════════════════
// REFINER prompts — the fact-hardening template + its assembly function. Template strings are
// module-level consts; buildRefiner only assembles/substitutes.


                                                       

const REFINE_TPL = `{{! refine — adversarially fact-check ONE load-bearing fact and return its corrected, hardened version }}
Fact-check and harden this load-bearing fact for the goal "{{query}}". {{net}}
Fact: {{fact}}
Why it is load-bearing: {{why}}
First verify it adversarially: hunt counter-evidence, newer information, and the real numbers — actively look for where it is false, outdated, or imprecise. Do not rubber-stamp a well-supported fact; do not manufacture doubt about one you cannot actually break. Then settle every doubt against the sources and return only the clean, corrected claim(s) — the right values, current and verified, dropping anything that does not hold. Cite sources inline.{{directiveClause}}
Return report (markdown): the hardened claim(s) for this fact.{{WEB_ONLY}}
`;

const buildRefiner = ({ net, query, fact, why, directive }            ) => {
  const directiveClause = directive
    ? `\nA judge flagged the prior verification — re-check it: ${directive}`
    : '';
  return render(REFINE_TPL, { net, query, fact, why, directiveClause, WEB_ONLY });
};
// ╔══ module: src/agents/refiner/index.ts ═════════════════════════════════
// REFINER — one per load-bearing fact (parallel) in the Finalize phase. Adversarially fact-checks a fact
// against the web and returns its corrected, hardened claim. Tier: sonnet (adversarial verification on the
// web — modest middle tier). Effort: high.

                                                                      

const REFINE         = {
  type: 'object',
  properties: {
    report: {
      type: 'string',
      description:
        'markdown: the clean / corrected claim(s) for this fact after adversarial fact-checking against the sources',
    },
  },
  required: ['report'],
};

const refiner                    = {
  tier: 'sonnet',
  effort: 'high',
  schema: REFINE,
  buildPrompt: buildRefiner,
};
// ╔══ module: src/agents/judge/prompts.ts ═════════════════════════════════
// JUDGE prompts — the finalize-phase terminal-skeptic template + its assembly function. Template
// strings are module-level consts; buildJudge only assembles/substitutes the compute-aware clauses.


                                                      

const JUDGE_TPL = `{{! judge — finalize-phase terminal skeptic: judges the hardened answer before the report is written }}
You are the JUDGE — the terminal skeptic of the FINALIZE phase for: "{{query}}". The crawl is done and its load-bearing facts were just hardened. Judge whether the answer is actually sound before the report is written.
The answer + its evidence + \`working\` derivation (the run's living memory):
{{resultSoFar}}
Hardened facts (each adversarially fact-checked + source-corrected by a refine pass):
{{cleanReports}}
What the answer must deliver: {{focus}}
Before upholding, actively try to disprove the load-bearing claim as hard as you can — \`verificationSound\` holds only when it survives every angle:
- funding / conflict of interest — is the trial run or funded by the product's own seller?
- independent replication — does a separate group confirm it, or does the headline rest on a single source?
- contradicting / null results — search for failed replications and negative trials that cut against it.
- retraction status — check PubPeer, retraction notices, and expressions of concern.
- evidence quality — a weak sample size or unaddressed limitations downgrade a claim, however confidently stated.
A claim that survives this cross-examination is sound; one that does not → \`verificationSound\` false, naming the specific weakness in \`directive\`.
Judge four things, each a strict boolean:
- goalMet — the answer fully meets the goal AND delivers the spec above, not merely "close enough".
- verificationSound — the refine pass genuinely verified the facts (caught real errors, used current correct values) rather than rubber-stamping or mis-hardening one.
- needsCompute — the answer rests on a quantitative derivation it does not yet hold.{{computeClause}}
- computeSound — any derivation already present is valid (right inputs, propagated error bars, no arithmetic slip); true when none is needed.
Uphold a sound finish: when goalMet, verificationSound, and computeSound all hold, return them true with an empty directive. Otherwise name the single most load-bearing problem and the precise fix.
Return goalMet, verificationSound, needsCompute, computeSound, reasoning (the load-bearing reason for the verdict), directive (the exact fix or derivation to perform; '' when satisfied), reopenRabbitHoles (1-3 {keyword, why} ONLY when a real evidence/coverage gap needs more crawling, else []).{{thinkerClause}}{{FINISH}}
`;

const buildJudge = ({
  query,
  resultSoFar,
  cleanReports,
  focus,
  compute,
  computerNote,
  thinkerNote,
}           ) => {
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  const computeClause = compute
    ? ` A derivation may be written and run (Python scientific stack).${computerNote ? '\n' + computerNote : ''}`
    : ' Derivation is off for this run — set needsCompute false and computeSound true.';
  return render(JUDGE_TPL, {
    query,
    resultSoFar: plain(resultSoFar),
    cleanReports: plain(cleanReports),
    focus: focus || '(meet the goal as stated)',
    computeClause,
    thinkerClause,
    FINISH,
  });
};
// ╔══ module: src/agents/judge/index.ts ═══════════════════════════════════
// JUDGE — the TERMINAL skeptic of the Finalize phase, the inverse of the synthesiser. Runs AFTER refine:
// sees the hardened facts + the brain's resultSoFar + the goal/deliverable, and judges whether the answer
// is sound (goal met, verification real, derivation valid). Drives a bounded remediation loop in the engine.
// Tier: opus (adversarial judgment). Effort: xhigh.


                                                                     

const JUDGE         = {
  type: 'object',
  properties: {
    goalMet: {
      type: 'boolean',
      description:
        'true = the answer fully meets the goal AND delivers the spec; false = it falls short',
    },
    verificationSound: {
      type: 'boolean',
      description:
        'true = the refine pass genuinely verified the facts; false = it rubber-stamped or mis-hardened a load-bearing fact',
    },
    needsCompute: {
      type: 'boolean',
      description: 'true = the answer rests on a quantitative derivation it does not yet hold',
    },
    computeSound: {
      type: 'boolean',
      description:
        'true = any derivation already present is valid (or none is needed); false = an existing derivation is wrong / lacks error bars',
    },
    reasoning: {
      type: 'string',
      description:
        'the load-bearing reason for the verdict — why it is sound, or the single biggest problem',
    },
    directive: {
      type: 'string',
      description: "the precise fix or derivation to perform when not satisfied; '' when satisfied",
    },
    reopenRabbitHoles: {
      type: 'array',
      items: RABBITHOLE,
      description:
        '1-3 concrete gap searches ONLY when a real evidence/coverage gap needs more crawling (NONE already pursued); empty otherwise',
    },
  },
  required: ['goalMet', 'verificationSound', 'needsCompute', 'computeSound', 'reasoning'],
};

const judge                   = {
  tier: 'opus',
  effort: 'xhigh',
  schema: JUDGE,
  buildPrompt: buildJudge,
};
// ╔══ module: src/agents/synthesiser/prompts.ts ═══════════════════════════
// SYNTHESISER prompts — the report-writer template + its assembly function. Template strings are
// module-level consts; buildSynthesiser only assembles/substitutes the compute-mention clauses.


                                                            

const SYNTHESISER_TPL = `{{! synthesiser — writes the final multi-section cited report }}
Write the final research report (mode={{mode}}) for: "{{query}}".{{focusClause}}{{thinkerClause}}
Work from: the run's accumulated RESULT (the brainer's living memory — answer, working derivation, evidence, resolved, open gaps, tensions), the hardened facts (each adversarially fact-checked + source-corrected), not raw findings.
Lean on the hardened facts as the source of truth: drop anything they leave unsupported and use the corrected value wherever they revised one.{{computeMention}} Cite sources inline where they matter.
Scout landscape: {{landscape}}
Run result so far (the answer as it ended + its evidence + the \`working\` derivation):
{{resultSoFar}}
Per-wave log (what each wave pursued + where the answer stood — for the §2 narrative):
{{waveLog}}
Hardened facts (the corrected claims):
{{cleanReports}}
Top remaining open rabbit-holes (for Open questions):
{{openRabbitHoles}}
Write \`report\` as markdown with exactly these sections in order: (1) Prompt — the goal; (2) Research waves — per wave: what was pursued and how the answer sharpened (from the per-wave log); (3) Scout landscape; (4) Findings — the synthesized answer, {{computeLeading}}weaving each hardened fact in with its corrected value; (5) Assumptions — the working assumptions the answer leans on (from resultSoFar.assumptions), each with its basis, flagging any that is load-bearing but unconfirmed; (6) Verdict + overall confidence; (7) Plan — concrete operator actions; (8) Open questions. Also return verdict (1-3 sentences), confidence, plan (array of action strings), openQuestions (array).{{FINISH}}
`;

const buildSynthesiser = ({
  mode,
  query,
  landscape,
  resultSoFar,
  waveLog,
  cleanReports,
  focus,
  openRabbitHoles,
  thinkerNote,
}                 ) => {
  // the brain folds any finalize derivation into resultSoFar.working — present that as the quantitative result.
  const hasCompute = !!(resultSoFar && resultSoFar.working && resultSoFar.working.trim());
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  const focusClause = focus
    ? `
Emphasis from the finalize director: ${focus}`
    : '';
  const computeMention = hasCompute
    ? ' The `working` field holds the computed derivation (the calculated answer with error bars) — present it verbatim, do not re-derive or second-guess it.'
    : '';
  const computeLeading = hasCompute
    ? 'LEADING with the computed result + its error bars from `working` and showing the derivation, then '
    : '';
  return render(SYNTHESISER_TPL, {
    mode,
    query,
    focusClause,
    thinkerClause,
    computeMention,
    landscape,
    resultSoFar: plain(resultSoFar),
    waveLog: plain(waveLog),
    cleanReports: plain(cleanReports),
    openRabbitHoles: plain(openRabbitHoles),
    computeLeading,
    FINISH,
  });
};
// ╔══ module: src/agents/synthesiser/index.ts ═════════════════════════════
// SYNTHESISER — writes the END report (always) from the hardened facts (source of truth) + the computed
// derivation (verbatim) + the final resultSoFar. Tier: opus (final synthesis). Effort: xhigh.

                                                                           

const REPORT         = {
  type: 'object',
  properties: {
    report: {
      type: 'string',
      description: 'the FULL report as markdown, all 7 sections in order per the contract',
    },
    verdict: { type: 'string', description: '1-3 sentence headline answer' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    plan: {
      type: 'array',
      items: { type: 'string' },
      description: 'concrete, opinionated operator actions',
    },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['report', 'verdict', 'confidence', 'plan', 'openQuestions'],
};

const synthesiser                         = {
  tier: 'opus',
  effort: 'xhigh',
  schema: REPORT,
  buildPrompt: buildSynthesiser,
};
// ╔══ module: src/agents/debugAnalyst/prompts.ts ══════════════════════════
// DEBUG ANALYST prompts — the diagnostics template + its assembly function. Template strings are
// module-level consts; buildDebugAnalyst only assembles/substitutes the focus clause.


                                                             

const DEBUG_TPL = `{{! debug — consolidates metrics, run log, and raw agent I/O into one debug report }}
Consolidate and analyze this RR run's diagnostics for an engineer debugging the pipeline. Goal: "{{query}}".
Walk it phase by phase — scout → prospector → each research wave → sentinel → finalize (initiate → refine → judge → synthesise) — reporting what happened at each with the actual numbers, plus anomalies, degraded/failed agents, or wasted effort to fix.
Prospector→researcher utilization (run this check): the prospector named these venues:
{{highValueSources}}
Each lane in laneRecords carries the \`assignedVenues\` the brainer gave it; from that lane's summary + rabbitHoles, judge whether the researcher actually drew on those venues. Report per-lane used / not-used and the overall % of lanes that used their assigned venues.{{focusClause}}
Metrics:
{{metrics}}
Lane records (wave, keyword, assignedVenues, summary, rabbitHoles):
{{laneRecords}}
Per-wave log:
{{waveLog}}
Sentinel log:
{{sentinelLog}}
Per-wave result-so-far log (the brainer's running memory each wave):
{{resultLog}}
Return diagnosis (markdown).{{FINISH}}
`;

const buildDebugAnalyst = ({
  query,
  focus,
  metrics,
  waveLog,
  sentinelLog,
  resultLog,
  highValueSources,
  laneRecords,
}                  ) => {
  const focusClause = focus
    ? `
Then answer this run-specific question directly: ${focus}`
    : '';
  return render(DEBUG_TPL, {
    query,
    highValueSources: plain(highValueSources),
    focusClause,
    metrics: plain(metrics),
    laneRecords: plain(laneRecords),
    waveLog: plain(waveLog),
    sentinelLog: plain(sentinelLog),
    resultLog: plain(resultLog),
    FINISH,
  });
};
// ╔══ module: src/agents/debugAnalyst/index.ts ════════════════════════════
// DEBUG ANALYST — last phase, opt-in (arg.debug). Consolidates the run's diagnostics corner by corner
// (incl. prospector→researcher venue utilization + any arg.debugPrompt question) into one _debug.md.
// Tier: opus (diagnostic synthesis). Effort: high.

                                                                            

const DIAG         = {
  type: 'object',
  properties: {
    diagnosis: {
      type: 'string',
      description: 'the full corner-by-corner debug consolidation + analysis as markdown',
    },
  },
  required: ['diagnosis'],
};

const debugAnalyst                          = {
  tier: 'opus',
  effort: 'high',
  schema: DIAG,
  buildPrompt: buildDebugAnalyst,
};
// ╔══ module: src/store.ts ════════════════════════════════════════════════

             
                    
             
             
             
              
             
             
                          

// ─────────────────────────────────────────────────────────────────────────────
// Store reducers — pure functions over a `state` object that carries the crawl's
// rabbit-hole store (rabbitHoles, nextId, pursuedKeys, pursuedList, pursuedArchive).
// In the original these were methods on ResearchReport; here `state` is the first
// arg (the engine passes `this`). Logic is identical.
// ─────────────────────────────────────────────────────────────────────────────

// the brainer-delta subset applyDeltas consumes (the test passes partial coords, so each field is optional).
                   
                        
                  
                          
                     
  

// light near-duplicate check — Jaccard token-set overlap ≥ this counts as "the same lead, reworded" (catches
// re-orderings the exact norm() match misses); kept high so genuinely distinct leads are never merged away.
const NEAR_DUP = 0.85;
const tokenSet = (s        )              => new Set(norm(s).split(' ').filter(Boolean));
const nearDup = (a        , b        )          => {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter) >= NEAR_DUP;
};

// add-or-find an OPEN rabbit-hole. Dedup by norm(keyword), a near-duplicate keyword, AND normRef(ref) against the
// open store AND the pursued sets; returns the existing/new entry, or null when the keyword/ref is already pursued
// (never re-open a pursued lane or re-fetch a pursued citation). New entries get a fresh id; scoreHistory seeded only when scored.
function addRabbitHole(
  state            ,
  { keyword, why, path, score, wave, ref }                   ,
)                    {
  const k = norm(keyword);
  const r = ref ? normRef(ref) : '';
  if (!k && !r) return null;
  if (k && state.pursuedKeys.has(k)) return null;
  if (r && state.pursuedRefs.has(r)) return null;
  if (k && state.pursuedList.some((p) => nearDup(keyword, p))) return null; // near-duplicate of a pursued lane
  const existing = state.rabbitHoles.find(
    (x) =>
      (k && norm(x.keyword) === k) ||
      (r && x.ref && normRef(x.ref) === r) ||
      (k && nearDup(keyword, x.keyword)),
  );
  if (existing) return existing;
  const scored = typeof score === 'number';
  const rh             = {
    id: state.nextId++,
    keyword: keyword || ref || '',
    why: why || '',
    score: scored ? score : null,
    scoreHistory: scored ? [{ wave, score }] : [],
    path: path || [],
  };
  if (ref) rh.ref = ref;
  state.rabbitHoles.push(rh);
  return rh;
}

// apply the brainer's DELTAS to the open store, in order: rename → drop → rescore → add. scoreHistory carried natively by id (no reconcile).
function applyDeltas(state            , coord            , wave        )       {
  for (const r of coord.rename || []) {
    const rh = state.rabbitHoles.find((x) => x.id === r.id);
    if (rh) {
      rh.keyword = r.keyword;
      if (r.why) rh.why = r.why;
    }
  }
  if (coord.drop && coord.drop.length) {
    const gone = new Set(coord.drop);
    state.rabbitHoles = state.rabbitHoles.filter((x) => !gone.has(x.id));
  }
  for (const r of coord.rescore || []) {
    const rh = state.rabbitHoles.find((x) => x.id === r.id);
    if (rh) {
      rh.score = r.score;
      rh.scoreHistory.push({ wave, score: r.score });
    }
  }
  for (const a of coord.add || [])
    addRabbitHole(state, { keyword: a.keyword, why: a.why, path: [], score: a.score, wave });
}

// resolve the brainer's `lookupNext` into open-store entries to pursue NOW: id → existing lead; keyword → originate (or find). Drop any
// already pursued, attach the lane's assigned venues, dedup, then take the highest-scoring up to laneCount (the hard ceiling).
function resolveLookupNext(
  state            ,
  coord                               ,
  wave        ,
  laneCount        ,
)               {
  const picks               = [];
  for (const item of coord.lookupNext || []) {
    let rh                                = null;
    if (typeof item.id === 'number') rh = state.rabbitHoles.find((x) => x.id === item.id);
    else if (item.keyword || item.ref)
      rh = addRabbitHole(state, {
        keyword: item.keyword || '',
        why: item.why,
        path: [],
        score: item.score,
        wave,
        ref: item.ref,
      });
    if (!rh || state.pursuedKeys.has(norm(rh.keyword))) continue;
    if (item.sources) rh.sources = item.sources;
    if (item.ref && !rh.ref) rh.ref = item.ref;
    if (!picks.some((p) => p.id === rh.id)) picks.push(rh);
  }
  return picks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, laneCount);
}

// REOPEN — the inverse of pursue (validator-driven): move a pursued lead back into the open store so the next
// brainer can re-pursue it. Clears its pursued keys/ref + drops it from the archive, and bumps failCount (the cap).
function reopenRabbitHole(state            , rh            )             {
  const ai = state.pursuedArchive.indexOf(rh);
  if (ai >= 0) state.pursuedArchive.splice(ai, 1);
  state.pursuedKeys.delete(norm(rh.keyword));
  if (rh.ref) state.pursuedRefs.delete(normRef(rh.ref));
  const li = state.pursuedList.indexOf(rh.keyword);
  if (li >= 0) state.pursuedList.splice(li, 1);
  rh.failCount = (rh.failCount || 0) + 1;
  if (!state.rabbitHoles.some((x) => x.id === rh.id)) state.rabbitHoles.push(rh);
  return rh;
}

// PURSUE — MOVE picks out of the open store into the pursued-archive (no delete-on-pursue): the archive keeps each lead's id + scoreHistory + path.
function pursue(state            , picks              )       {
  for (const p of picks) {
    state.pursuedKeys.add(norm(p.keyword));
    if (p.ref) state.pursuedRefs.add(normRef(p.ref));
    state.pursuedList.push(p.keyword);
    state.pursuedArchive.push(p);
  }
  const gone = new Set(picks.map((p) => p.id));
  state.rabbitHoles = state.rabbitHoles.filter((r) => !gone.has(r.id));
}
// ╔══ module: src/engine.ts ═══════════════════════════════════════════════




             
            
           
                  
              
        
          
               
        
          
               
             
             
          
             
                
                 
            
            
              
                 
              
            
           
           
                   
              
             
             
       
                    
               
        
               
                          

// L7 retry indirection — wraps every agent() call; the _agent alias keeps it from rewriting itself.
const _agent = agent;
// Debug capture (opt-in via arg.debug): the raw agent I/O + the full run-log stream, consumed by the end Debug & Analysis agent.
const IO_LOG               = [];
const LOG_BUFFER           = [];
const _log = globalThis.log;
try {
  globalThis.log = (m          ) => {
    if (CONFIG.debug) LOG_BUFFER.push(typeof m === 'string' ? m : String(m));
    return _log(m);
  };
} catch (e) {
  /* log not writable → run-log just won't be buffered */
}
// run a sub-agent with AGENT_RETRIES retries, narrowing the result to its agent's typed `*Out` shape (T); degrades to null when exhausted.
const retryAgent = async    (prompt        , opts           )                    => {
  if (opts && opts.label) PROMPT_LOG[opts.label] = prompt;
  for (let attempt = 0; attempt <= CONFIG.AGENT_RETRIES; attempt++) {
    try {
      const out = (await _agent(prompt, opts))     ;
      if (CONFIG.debug)
        IO_LOG.push({
          label: (opts && opts.label) || '?',
          model: (opts && opts.model) || '?',
          phase: (opts && opts.phase) || '?',
          prompt,
          output: out,
        });
      return out;
    } catch (e) {
      log(
        '  ⚠ agent error (attempt ' +
          (attempt + 1) +
          '/' +
          (CONFIG.AGENT_RETRIES + 1) +
          '): ' +
          ((e && e.message) || e),
      );
      if (attempt === CONFIG.AGENT_RETRIES) {
        log('  ⚠ agent retries exhausted → degraded to null');
        if (CONFIG.debug)
          IO_LOG.push({
            label: (opts && opts.label) || '?',
            model: (opts && opts.model) || '?',
            phase: (opts && opts.phase) || '?',
            prompt,
            output: null,
            error: (e && e.message) || String(e),
          });
        return null;
      }
    }
  }
  return null;
};
log('▶ RR START · mode=' + CONFIG.mode + ' · maxWave=' + CONFIG.maxWave + ' · dir=' + CONFIG.DIR);

// compact "Run arguments" record — the COMPLETE launch args (CONFIG.rawArgs), verbatim as received. Surfaced at the top of result.md
// (and persisted as the `args` object in _rabbitHoles.json) so every output file records exactly how the run was launched.
const runArgsMd = ()         => '> **Run arguments:** `' + JSON.stringify(CONFIG.rawArgs) + '`\n\n';

// ─────────────────────────────────────────────────────────────────────────────
// ResearchReport — the pipeline. Holds the crawl state; each method is a phase. Each agent's tier +
// effort + schema + prompt-builder + template live in its own src/agents/<agent>/ module (shared
// fragments in agents/shared.ts); the store reducers live in store.ts (called with `this`).
// ─────────────────────────────────────────────────────────────────────────────
class ResearchReport {
  // scout seed
  scout                 ;
  scoutRabbitHoles            ;
  // prospector seed (set by runProspect) — high-value source venues the brainer assigns per lane
  highValueSources         ;
  languageGuidance        ; // prospector's non-English routing note (''=English-dominated); threads into the brainer every wave
  sourcesReasoning        ;
  laneRecords              ; // debug: per lane-researcher feed for the venue-utilization analysis
  // crawl accumulators (persist across waves)
  pursuedKeys             ;
  pursuedRefs             ; // L3: norm(ref) of every fetched URL/DOI — dedup so a followed citation is never fetched twice
  pursuedList          ;
  pursuedArchive              ; // L2: rabbit-holes are MOVED here on pursue (no delete-on-pursue)
  topScores          ; // L2: max lookupNext score per wave — the decay signal
  waveLog                ; // slim per-wave log — feeds §2 narrative / sentinel / debug
  resultLog                  ; // per-wave resultSoFar snapshots — for the debug agent
  sentinelReopensUsed        ; // L4: how many times the goal-mode sentinel has forced an extra wave
  sentinelLog                    ;
  lastSentinelReason        ; // a crawl-sentinel rejection (1 line) → a standing reminder threaded into the brainer to raise its bar before declaring done again; '' when none
  validatorLog                     ; // per-wave coverage-gate record (reopened lanes + capped known-gaps)
  lastValidatorMissing        ; // the last wave's validator gaps → threaded into the next brainer; '' when none

  files       ;
  rabbitHoles              ; // OPEN rabbit-hole store (id-keyed); scoreHistory rides natively on the id
  nextId        ;
  resultSoFar                    ; // the run's living MEMORY — carried wave to wave
  // crawl outcome (set by runCrawl)
  coord              ;
  wave        ;
  bestOpen        ;
  stopReason                   ;
  // finalize outcome (set by runFinalize) — this.synthesiserOut holds the synthesiser's REPORT
  rabbitHolesOut                 ;
  synthesiserOut                  ;
  reportOk         ;

  constructor() {
    this.scout = null;
    this.scoutRabbitHoles = [];
    this.highValueSources = [];
    this.languageGuidance = '';
    this.sourcesReasoning = '';
    this.laneRecords = [];
    this.pursuedKeys = new Set();
    this.pursuedRefs = new Set();
    this.pursuedList = [];
    this.pursuedArchive = [];
    this.topScores = [];
    this.waveLog = [];
    this.resultLog = [];
    this.sentinelReopensUsed = 0;
    this.sentinelLog = [];
    this.lastSentinelReason = '';
    this.validatorLog = [];
    this.lastValidatorMissing = '';
    this.files = {};
    this.rabbitHoles = [];
    this.nextId = 1;
    this.resultSoFar = null;
    this.coord = null;
    this.wave = 1;
    this.bestOpen = 0;
    this.stopReason = null;
    this.rabbitHolesOut = [];
    this.synthesiserOut = null;
    this.reportOk = false;
  }

  // ── agent wrappers ──

  // the single Opus BRAINER — the brain / global reducer. Sees the open store + pursued set + running resultSoFar; returns the updated
  // resultSoFar + DELTAS (rescore / add / lookupNext / rename / drop / stop). Can LOOK UP stored leads OR ORIGINATE new directions; code-capable
  // (general-purpose) when compute is on, so it can derive its own steering numbers inline — no separate compute stage.
  async coordinate(
    wave        ,
    findings           ,
    phaseName         = CONFIG.PHASE.crawl,
  )                        {
    const open = this.rabbitHoles.map(openLine);
    return retryAgent       (
      brainer.buildPrompt({
        wave,
        query: CONFIG.query,
        rubric: CONFIG.RUBRIC,
        landscape: this.scout .landscape,
        pursuedList: this.pursuedList,
        open,
        findings,
        topScores: this.topScores,
        resultSoFar: this.resultSoFar,
        assignSources: CONFIG.parallelSourcesPerLaneResearchAgent === 'auto',
        stop: CONFIG.STOP,
        mode: CONFIG.mode,
        venues: this.highValueSources,
        languageGuidance: this.languageGuidance,
        lastSentinelReason: this.lastSentinelReason,
        lastValidatorMissing: this.lastValidatorMissing,
        compute: CONFIG.compute,
        computerNote: CONFIG.COMPUTER_NOTE,
        thinkerNote: CONFIG.THINKER_NOTE,
        researcherNote: CONFIG.RESEARCHER_NOTE,
      }),
      {
        label: 'brainer-w' + wave,
        phase: phaseName,
        model: brainer.tier,
        effort: brainer.effort,
        schema: brainer.schema,
        agentType: CONFIG.compute ? 'general-purpose' : undefined,
      },
    );
  }

  // map the brainer's assigned source-identifier strings back to the full {source, goodFor} venue objects (for the researcher prompt).
  venuesFor(sources           )          {
    if (!sources || !sources.length) return [];
    return sources.map(
      (s) => this.highValueSources.find((v) => v.source === s) || { source: s, goodFor: '' },
    );
  }

  // dispatch one haiku lane-researcher per pick, in parallel — each carries its full TRAIL + the venues the brainer assigned its lane.
  // Used by the crawl waves (tag='w'+wave) and the finalize judge crawl-reopen (tag='reopen'). Returns each lane's ResearchOut or null.
  async runResearchers(
    picks              ,
    tag        ,
    phaseName        ,
  )                                  {
    return parallel(
      picks.map((p) => () => {
        // per-lane source count: auto → derived from the number of venues the brainer assigned this lane (capped 5, default 2); manual → the fixed clamped knob.
        const srcCount =
          CONFIG.parallelSourcesPerLaneResearchAgent === 'auto'
            ? Math.min(5, (p.sources && p.sources.length) || 2)
            : CONFIG.parallelSourcesPerLaneResearchAgent;
        return retryAgent             (
          researcher.buildPrompt({
            net: CONFIG.NET,
            query: CONFIG.query,
            trail: trailOf(p.path, p.keyword),
            keyword: p.keyword,
            why: p.why,
            footer: CONFIG.FOOTER,
            venues: this.venuesFor(p.sources),
            parallelSourcesPerLaneResearchAgent: srcCount,
            researcherNote: CONFIG.RESEARCHER_NOTE,
            ref: p.ref, // when set, this lane fetches the citation directly instead of WebSearching
          }),
          {
            label: 'lane-' + tag + ':' + lab(p.keyword),
            phase: phaseName,
            model: researcher.tier,
            effort: researcher.effort,
            agentType: 'general-purpose',
            schema: researcher.schema,
          },
        );
      }),
    );
  }

  // the goal-mode SENTINEL — the TERMINAL skeptic of the crawl phase, the inverse of verify. Runs ONCE when the brainer declares done:
  // sees the open store + the brainer's running answer; if the stop isn't solid it injects high-score gaps. Bounded by MAX_SENTINEL_REOPENS.
  async checkSentinel(
    wave        ,
    waveLog                ,
    pursuedList          ,
    lastBrainer       ,
  )                              {
    const rabbitHoles = this.rabbitHoles.map(openLine);
    return retryAgent             (
      sentinel.buildPrompt({
        query: CONFIG.query,
        resultSoFar: lastBrainer.resultSoFar,
        reason: lastBrainer.stop.reason,
        waveLog,
        rabbitHoles,
        pursuedList,
        thinkerNote: CONFIG.THINKER_NOTE,
        researcherNote: CONFIG.RESEARCHER_NOTE,
      }),
      {
        label: 'sentinel-w' + wave,
        phase: CONFIG.PHASE.crawl,
        model: sentinel.tier,
        effort: sentinel.effort,
        schema: sentinel.schema,
      },
    );
  }

  // VALIDATOR — the per-wave coverage gate (distinct from the terminal sentinel/judge). Given the wave's lookupNext
  // requests + each lane's intro + which lanes died, it rules whether each request was fulfilled and what is still missing.
  async runValidator(
    wave        ,
    requests                                                ,
    findings                                      ,
    nullLanes          ,
  )                               {
    return retryAgent              (
      validator.buildPrompt({ query: CONFIG.query, requests, findings, nullLanes }),
      {
        label: 'validator-w' + wave,
        phase: CONFIG.PHASE.crawl,
        model: validator.tier,
        effort: validator.effort,
        schema: validator.schema,
      },
    );
  }

  // PROSPECTOR — runs after the scout, first agent of the Crawl phase. Given the goal + scout landscape, it names the high-value
  // AUTHORITATIVE source venues for THIS topic (domain-specific). Output rides with the brainer, which assigns the relevant subset to each lane.
  async prospect(model      )                             {
    return retryAgent            (
      prospector.buildPrompt({
        query: CONFIG.query,
        landscape: this.scout .landscape,
        sources: this.scout .pages.map((p) => p.url),
        thinkerNote: CONFIG.THINKER_NOTE,
        researcherNote: CONFIG.RESEARCHER_NOTE,
      }),
      {
        label: 'prospector',
        phase: CONFIG.PHASE.scout,
        model,
        effort: prospector.effort,
        schema: prospector.schema,
      },
    );
  }

  // ── phases ──

  // Scout (wave 0 seed): broad WebSearch → fetch sources with the rabbit-hole footer → seed rabbit-holes.
  async runScout()                      {
    phase(CONFIG.PHASE.scout);
    log('· scout DISPATCH · ' + scout.tier);
    const scoutOut = await retryAgent          (
      scout.buildPrompt({
        query: CONFIG.query,
        net: CONFIG.NET,
        footer: CONFIG.FOOTER,
        researcherNote: CONFIG.RESEARCHER_NOTE,
      }),
      {
        label: 'scout',
        phase: CONFIG.PHASE.scout,
        model: scout.tier,
        effort: scout.effort,
        agentType: 'general-purpose',
        schema: scout.schema,
      },
    );
    if (!scoutOut) {
      log('✗ scout DIED');
      throw new Error('scout died');
    }
    this.scout = scoutOut;
    const scoutRabbitHoles             = scoutOut.pages.flatMap((p) =>
      (p.rabbitHoles || []).map((l) => ({ keyword: l.keyword, why: l.why, path: []             })),
    ); // PATH: scout rabbit-holes descend directly from the goal
    this.scoutRabbitHoles = scoutRabbitHoles;
    log(
      '· scout RETURN · pages=' +
        scoutOut.pages.length +
        ' · rabbit-holes=' +
        scoutRabbitHoles.length +
        ' · deadEnds=' +
        (scoutOut.deadEnds || []).length,
    );
    scoutOut.pages.forEach((p, i) =>
      log(
        '    source ' + (i + 1) + ' · rabbit-holes=' + (p.rabbitHoles || []).length + ' · ' + p.url,
      ),
    );
    return scoutRabbitHoles;
  }

  // PROSPECT (real flow): one Opus prospector after the scout names the high-value source venues; the brainer assigns the relevant subset per lane.
  async runProspect()                {
    log('· prospector DISPATCH · ' + prospector.tier);
    const res = await this.prospect(prospector.tier);
    this.highValueSources = (res && res.highValueSources) || [];
    this.languageGuidance = (res && res.languageGuidance) || '';
    this.sourcesReasoning = (res && res.reasoning) || '';
    log(
      '· prospector RETURN · venues=' +
        this.highValueSources.length +
        (this.languageGuidance ? ' · languages="' + this.languageGuidance.slice(0, 80) + '"' : '') +
        (res ? '' : ' (FAILED → none; researchers fall back to general search)'),
    );
    this.highValueSources.forEach((s, i) =>
      log('    venue ' + (i + 1) + ' · ' + s.source + ' — ' + s.goodFor),
    );
    this.files['02-prospector.md'] = withPrompt(
      'prospector',
      '# 02 — Prospector\n\n**Query:** ' +
        CONFIG.query +
        (this.sourcesReasoning ? '\n\n_' + this.sourcesReasoning + '_' : '') +
        (this.languageGuidance ? '\n\n**Language routing:** ' + this.languageGuidance : '') +
        '\n\n## High-value source venues\n\n' +
        (this.highValueSources
          .map(
            (s, i) =>
              i +
              1 +
              '. **' +
              s.source +
              '**' +
              (s.lang ? ' [' + s.lang + ']' : '') +
              ' — ' +
              s.goodFor,
          )
          .join('\n') || '_(none returned)_') +
        '\n',
    );
  }

  // Crawl: wave 0 = score the scout rabbit-holes; waves 1..N = pursue → research → re-coordinate; then the terminal sentinel gate.
  async runCrawl(scoutRabbitHoles            )                {
    const scoutOut = this.scout ;

    this.files['01-scout.md'] = withPrompt(
      'scout',
      '# 01 — Scout\n\n**Query:** ' +
        CONFIG.query +
        '\n\n## Landscape\n\n' +
        scoutOut.landscape +
        '\n\n## Sources\n\n' +
        scoutOut.pages
          .map(
            (p, i) =>
              '### ' +
              (i + 1) +
              ' — ' +
              p.url +
              '\n\n' +
              p.summary +
              '\n\n' +
              (p.rabbitHoles || []).map((l) => '- **' + l.keyword + '** — ' + l.why).join('\n'),
          )
          .join('\n\n') +
        '\n\n## Dead ends\n\n' +
        ((scoutOut.deadEnds || []).map((d) => '- ' + d).join('\n') || '_none_') +
        '\n',
    );

    // seed the open store with the scout rabbit-holes (UNSCORED — the brainer scores them this wave via rescore).
    scoutRabbitHoles.forEach((l) =>
      addRabbitHole(this, { keyword: l.keyword, why: l.why, path: l.path || [], wave: 0 }),
    );

    const seedFindings            = scoutOut.pages.map((p) => ({
      rabbitHole: p.url,
      summary: p.summary,
    }));
    log(
      '· brainer-w0 DISPATCH · ' +
        brainer.tier +
        ' · scoring ' +
        this.rabbitHoles.length +
        ' rabbit-hole(s)',
    );
    let coord = await this.coordinate(0, seedFindings, CONFIG.PHASE.scout);
    if (!coord) {
      log('✗ brainer-w0 DIED');
      throw new Error('brainer died at wave 0');
    }
    applyDeltas(this, coord, 0);
    if (coord.resultSoFar) this.resultSoFar = coord.resultSoFar;
    this.resultLog.push({ wave: 0, resultSoFar: this.resultSoFar });
    let lookupNext = resolveLookupNext(this, coord, 0, laneCount);
    this.topScores.push(lookupNext.length ? Math.max(...lookupNext.map((p) => p.score ?? 0)) : 0);
    this.waveLog.push({
      wave: 0,
      pursued: [],
      newRabbitHoles: scoutRabbitHoles.length,
      rabbitHoles: this.rabbitHoles.length,
      topScore: this.topScores[this.topScores.length - 1],
      done: coord.stop.done,
      reason: coord.stop.reason,
    });
    log(
      '· brainer-w0 RETURN · rabbitHoles=' +
        this.rabbitHoles.length +
        ' · lookupNext=' +
        lookupNext.length +
        '/' +
        (coord.lookupNext || []).length +
        ' · topScore=' +
        this.topScores[this.topScores.length - 1] +
        ' · done=' +
        coord.stop.done,
    );
    lookupNext.forEach((p, i) =>
      log(
        '    look-up ' +
          (i + 1) +
          ' · [' +
          (p.score ?? '?') +
          '] #' +
          p.id +
          ' ' +
          p.keyword +
          (p.sources && p.sources.length ? ' · venues=[' + p.sources.join(', ') + ']' : ''),
      ),
    );

    this.files['03-wave-0.md'] = withPrompt(
      'brainer-w0',
      waveMd(0, coord, lookupNext, [], this.rabbitHoles),
    );

    phase(CONFIG.PHASE.crawl); // scout → prospector → seed brainer = the Scout phase; waves 1..N = Crawl
    let wave = 1;
    let crawlSettled = false;
    let dryStop = false; // collect-mode dry: set when the novelty trajectory has plateaued (diminishing returns)
    let sentinelFileLabel = ''; // label of the LAST sentinel gate — its prompt is prepended to the sentinel file (Change E)
    const baseCap = CONFIG.maxWave === 'auto' ? CONFIG.HARD_CAP : CONFIG.maxWave; // effective wave cap; 'auto' rides up to HARD_CAP, the brainer stops it sooner
    // Outer crawl: the inner loop runs waves until the brainer stops; then the goal-mode SENTINEL gate (terminal skeptic) contests a
    // `done` — if the brainer stopped prematurely it injects high-score gaps at the store top and the inner loop resumes. Bounded by MAX_SENTINEL_REOPENS.
    while (!crawlSettled) {
      while (
        wave <= Math.min(CONFIG.HARD_CAP, baseCap + this.sentinelReopensUsed) &&
        !coord.stop.done &&
        lookupNext.length &&
        !dryStop
      ) {
        // PURSUE — move lookupNext into the pursued-archive (keeps id + scoreHistory + path) and out of the open store, so the brainer
        // re-scores a clean open-only set next wave.
        pursue(this, lookupNext);
        log(
          '— wave ' +
            wave +
            ' · pursuing ' +
            lookupNext.length +
            ' rabbit-hole(s) · pursued-total=' +
            this.pursuedList.length +
            ' · archived=' +
            this.pursuedArchive.length,
        );

        // RESEARCH wave — one haiku lane-researcher per pursued rabbit-hole, parallel; each carries its full TRAIL (goal → … → here).
        const toPursue = lookupNext;
        const raw = await this.runResearchers(toPursue, 'w' + wave, CONFIG.PHASE.crawl);
        const findings            = raw.map((r, i) => ({
          rabbitHole: toPursue[i].keyword,
          trail: trailOf(toPursue[i].path, toPursue[i].keyword),
          summary: r ? r.summary : '(researcher failed)',
        }));
        if (CONFIG.debug)
          raw.forEach((r, i) =>
            this.laneRecords.push({
              wave,
              keyword: toPursue[i].keyword,
              assignedVenues: toPursue[i].sources || [],
              summary: r ? r.summary : null,
              rabbitHoles: r ? (r.rabbitHoles || []).map((l) => l.keyword) : [],
            }),
          );

        // PATH: each freshly-surfaced rabbit-hole inherits its parent's trail (parent path + parent keyword). The engine adds them to the open
        // store UNSCORED (scoreHistory=[]); deduped against pursued + the current store; the brainer scores them next wave (shown as "new").
        const fresh             = raw.flatMap((r, i) =>
          r && r.rabbitHoles
            ? r.rabbitHoles.map((l) => ({
                keyword: l.keyword,
                why: l.why,
                path: [...(toPursue[i].path || []), toPursue[i].keyword],
              }))
            : [],
        );
        // FOLLOW-THE-LINKS: each page's top outbound citations become ref-carrying leads the next lane fetches directly.
        const freshSources             = raw.flatMap((r, i) =>
          r && r.nextSources
            ? r.nextSources.map((s) => ({
                keyword: s.why,
                why: 'followed citation',
                ref: s.ref,
                path: [...(toPursue[i].path || []), toPursue[i].keyword],
              }))
            : [],
        );
        const beforeAdd = this.rabbitHoles.length;
        fresh.forEach((l) =>
          addRabbitHole(this, { keyword: l.keyword, why: l.why, path: l.path, wave }),
        );
        freshSources.forEach((l) =>
          addRabbitHole(this, { keyword: l.keyword, why: l.why, path: l.path, wave, ref: l.ref }),
        );
        const newCount = this.rabbitHoles.length - beforeAdd;
        log(
          '  wave ' +
            wave +
            ' · researchers=' +
            raw.filter(Boolean).length +
            '/' +
            toPursue.length +
            ' · freshRabbitHoles=' +
            (fresh.length + freshSources.length) +
            ' → +' +
            newCount +
            ' new after dedup',
        );

        // VALIDATOR GATE — the per-wave coverage check. Runs only when a lane died or a finding is thin (keeps it cheap).
        // Re-opens every lane that returned null OR fulfilled:false (bounded per-lane by MAX_LANE_REFAILS) so the next
        // brainer can re-pursue; a lane past the cap is surfaced as a known gap; `missing` threads into the next brainer.
        const anyNull = raw.some((r) => !r);
        const anyThin = findings.some(
          (f) => !f.summary || f.summary.length < CONFIG.VALIDATOR_THIN,
        );
        if (anyNull || anyThin) {
          const requests = toPursue.map((p) => ({ id: p.id, keyword: p.keyword, why: p.why }));
          const vFindings = findings.map((f) => ({
            keyword: f.rabbitHole,
            intro: (f.summary || '').slice(0, 240),
          }));
          const nullLanes = toPursue.filter((p, i) => !raw[i]).map((p) => p.keyword);
          const val = await this.runValidator(wave, requests, vFindings, nullLanes);
          const failedIds = new Set        ();
          toPursue.forEach((p, i) => {
            if (!raw[i]) failedIds.add(p.id);
          });
          if (val && Array.isArray(val.checks))
            val.checks.forEach((c) => {
              if (c && c.fulfilled === false && typeof c.id === 'number') failedIds.add(c.id);
            });
          const reopened           = [];
          const cappedGaps           = [];
          for (const id of failedIds) {
            const rh = this.pursuedArchive.find((r) => r.id === id);
            if (!rh) continue;
            if ((rh.failCount || 0) >= CONFIG.MAX_LANE_REFAILS) cappedGaps.push(rh.keyword);
            else reopened.push(reopenRabbitHole(this, rh).keyword);
          }
          const missing = (val && val.missing) || [];
          this.lastValidatorMissing = [
            ...missing,
            ...cappedGaps.map((k) => k + ' (lane retried twice — treat as a known gap)'),
          ]
            .join('; ')
            .slice(0, 300);
          this.validatorLog.push({
            wave,
            enough: val ? val.enough : null,
            reopened,
            cappedGaps,
            missing,
          });
          log(
            '  wave ' +
              wave +
              ' · validator · enough=' +
              (val ? val.enough : '?') +
              ' · reopened=' +
              reopened.length +
              ' · cappedGaps=' +
              cappedGaps.length,
          );
        } else {
          this.lastValidatorMissing = '';
        }

        // BRAINER — the single Opus brain re-scores the open store via deltas, updates the running result, and sets the next direction.
        log(
          '  wave ' +
            wave +
            ' · brainer DISPATCH · ' +
            brainer.tier +
            ' · open=' +
            this.rabbitHoles.length,
        );
        const nextCoord = await this.coordinate(wave, findings);
        if (!nextCoord) {
          log('✗ brainer-w' + wave + ' DIED — stopping');
          crawlSettled = true;
          break;
        }
        coord = nextCoord;
        applyDeltas(this, coord, wave);
        if (coord.resultSoFar) this.resultSoFar = coord.resultSoFar;
        this.resultLog.push({ wave, resultSoFar: this.resultSoFar });
        lookupNext = resolveLookupNext(this, coord, wave, laneCount);
        this.topScores.push(
          lookupNext.length ? Math.max(...lookupNext.map((p) => p.score ?? 0)) : 0,
        );
        this.waveLog.push({
          wave,
          pursued: toPursue.map((p) => p.keyword),
          newRabbitHoles: newCount,
          rabbitHoles: this.rabbitHoles.length,
          topScore: this.topScores[this.topScores.length - 1],
          done: coord.stop.done,
          reason: coord.stop.reason,
        });
        this.files[padIdx(wave + 3) + '-wave-' + wave + '.md'] = withPrompt(
          'brainer-w' + wave,
          waveMd(wave, coord, lookupNext, findings, this.rabbitHoles),
        );
        log(
          '  wave ' +
            wave +
            ' · rabbitHoles=' +
            this.rabbitHoles.length +
            ' · lookupNext=' +
            lookupNext.length +
            '/' +
            (coord.lookupNext || []).length +
            ' · topScore=' +
            this.topScores[this.topScores.length - 1] +
            ' · done=' +
            coord.stop.done +
            (coord.stop.done ? ' (' + coord.stop.reason + ')' : ''),
        );
        lookupNext.forEach((p, i) =>
          log(
            '    next ' +
              (i + 1) +
              ' · [' +
              (p.score ?? '?') +
              '] #' +
              p.id +
              ' ' +
              p.keyword +
              (p.sources && p.sources.length ? ' · venues=[' + p.sources.join(', ') + ']' : ''),
          ),
        );

        // collect-mode DRY stop: diminishing returns relative to the run's OWN peak novelty (adapts per topic — no magic absolute floor).
        if (CONFIG.mode === 'collect' && !coord.stop.done && this.topScores.length >= 3) {
          const peak = Math.max(...this.topScores);
          if (peak > 0 && this.topScores.slice(-2).every((s) => s <= peak * CONFIG.QUERY_PLATEAU)) {
            dryStop = true;
            log(
              '  wave ' +
                wave +
                ' · collect DRY — top novelty plateaued (' +
                this.topScores.slice(-2).join(',') +
                ' ≤ ' +
                CONFIG.QUERY_PLATEAU +
                '×peak ' +
                peak +
                ') → stopping',
            );
          }
        }
        wave++;
      }

      // SENTINEL GATE — terminal skeptic of the crawl phase (goal mode). Runs once when the BRAINER declared done: sees the open store + the
      // brainer's running answer. If the stop isn't solid, inject high-score gap objects at the store TOP and resume.
      if (
        CONFIG.mode === 'goal' &&
        (coord.stop.done || !lookupNext.length) &&
        wave <= CONFIG.HARD_CAP &&
        this.sentinelReopensUsed < CONFIG.MAX_SENTINEL_REOPENS
      ) {
        log(
          "· sentinel GATE · contesting the brainer's done (sees the open store + the running answer)",
        );
        sentinelFileLabel = 'sentinel-w' + wave;
        const ch = await this.checkSentinel(wave, this.waveLog, this.pursuedList, coord);
        const inject =
          ch && ch.solid === false && Array.isArray(ch.rabbitHoles)
            ? ch.rabbitHoles
                .filter((l) => l && l.keyword && !this.pursuedKeys.has(norm(l.keyword)))
                .slice(0, laneCount)
            : [];
        this.sentinelLog.push({
          afterWave: wave - 1,
          solid: ch ? ch.solid : null,
          reasoning: ch ? ch.reasoning : '(sentinel failed)',
          injected: inject.map((l) => l.keyword),
        });
        if (inject.length) {
          this.sentinelReopensUsed++;
          coord.stop.done = false;
          // standing 1-line reminder threaded into the brainer next wave — raise the bar before declaring done again
          this.lastSentinelReason = ((ch && ch.reasoning) || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200);
          // inject high-score gap objects into the store (path marks them sentinel-born) and hand them to the lane researchers next iteration
          lookupNext = inject
            .map((l) =>
              addRabbitHole(this, {
                keyword: l.keyword,
                why: l.why,
                path: ['⚔ sentinel'],
                score: CONFIG.INJECT_SCORE,
                wave,
              }),
            )
            .filter(Boolean)                ;
          log(
            "· ⚔ SENTINEL REOPENED the brainer's done (" +
              this.sentinelReopensUsed +
              '/' +
              CONFIG.MAX_SENTINEL_REOPENS +
              ') — injected ' +
              lookupNext.length +
              ' high-score gap(s) into the store; crawl resumes',
          );
          lookupNext.forEach((p, i) =>
            log(
              '    inject ' +
                (i + 1) +
                ' · [' +
                CONFIG.INJECT_SCORE +
                '] #' +
                p.id +
                ' ' +
                p.keyword,
            ),
          );
        } else {
          crawlSettled = true;
          log(
            "· ✓ sentinel UPHELD the brainer's done" +
              (ch && ch.reasoning ? ' · ' + ch.reasoning.slice(0, 110) : ''),
          );
        }
      } else {
        crawlSettled = true;
      }
    }

    // L2 stop classification: the brainer's own satisficing `done` (primary), else why the loop stopped.
    const bestOpen = this.rabbitHoles.length
      ? Math.max(...this.rabbitHoles.map((r) => lastScore(r) ?? 0))
      : 0;
    const stopReason             = coord.stop.done
      ? 'brainer-done'
      : dryStop
        ? 'collect-dry-plateau'
        : lookupNext.length
          ? 'wave-cap'
          : this.rabbitHoles.length
            ? 'rabbithole-dry'
            : 'rabbithole-empty';
    log(
      '■ crawl DONE · stopReason=' +
        stopReason +
        ' · waves=' +
        (wave - 1) +
        ' · rabbitHoles=' +
        this.rabbitHoles.length +
        ' · sentinelReopens=' +
        this.sentinelReopensUsed,
    );

    // SENTINEL output → file (every gate invocation: uphold or reopen + what it injected)
    if (this.sentinelLog.length) {
      this.files[padIdx(wave + 3) + '-sentinel.md'] = withPrompt(
        sentinelFileLabel,
        '# Sentinel — crawl-phase terminal skeptic\n\n' +
          this.sentinelLog
            .map(
              (c, i) =>
                '## Gate ' +
                (i + 1) +
                ' — after wave ' +
                c.afterWave +
                ' — ' +
                (c.solid
                  ? "✓ UPHELD the brainer's done"
                  : '⚔ REOPENED (brainer stopped prematurely)') +
                '\n\n' +
                (c.reasoning || '') +
                (c.injected && c.injected.length
                  ? '\n\n**Injected high-score gaps (handed back to lane researchers):**\n' +
                    c.injected.map((k) => '- ' + k).join('\n')
                  : ''),
            )
            .join('\n\n') +
          '\n',
      );
    }

    // VALIDATOR output → file (every wave it ran: enough verdict + reopened lanes + capped known-gaps + missing)
    if (this.validatorLog.length) {
      this.files[padIdx(wave + 3) + '-validator.md'] =
        '# Validator — per-wave crawl coverage gate\n\n' +
        this.validatorLog
          .map(
            (v) =>
              '## Wave ' +
              v.wave +
              ' — enough=' +
              v.enough +
              (v.reopened.length ? '\n\n**Reopened (re-pursue):** ' + v.reopened.join(', ') : '') +
              (v.cappedGaps.length
                ? '\n\n**Known gaps (retried twice, not reopened):** ' + v.cappedGaps.join(', ')
                : '') +
              (v.missing.length ? '\n\n**Missing:** ' + v.missing.join('; ') : ''),
          )
          .join('\n\n') +
        '\n';
    }

    // hand the crawl outcome to the later phases
    this.coord = coord;
    this.wave = wave;
    this.bestOpen = bestOpen;
    this.stopReason = stopReason;
  }

  // REFINE the named load-bearing facts in parallel — one sonnet refine agent per fact; on a re-run the judge `directive`
  // rides into each so it re-checks what the judge flagged. Writes/overwrites the refinement file. passTag keeps labels unique per pass.
  async refineFacts(
    facts                ,
    directive        ,
    passTag        ,
  )                         {
    const refined = await parallel(
      facts.map(
        (f, i) => () =>
          retryAgent           (
            refiner.buildPrompt({
              net: CONFIG.NET,
              query: CONFIG.query,
              fact: f.fact,
              why: f.why,
              directive,
            }),
            {
              label: 'refine-' + passTag + i,
              phase: CONFIG.PHASE.finalize,
              model: refiner.tier,
              effort: refiner.effort,
              schema: refiner.schema,
            },
          ),
      ),
    );
    const cleanReports                = facts.map((f, i) => ({
      fact: f.fact,
      why: f.why,
      clean: (refined[i] && refined[i] .report) || '(refine failed)',
    }));
    this.files[padIdx(this.wave + 5) + '-refinement.md'] =
      '# Refinement — fact-check & harden the load-bearing facts\n\n' +
      (facts.length
        ? facts
            .map(
              (f, i) =>
                '## ' +
                (i + 1) +
                ' — ' +
                f.fact +
                '\n\n_' +
                f.why +
                '_\n\n' +
                ((refined[i] && refined[i] .report) || '_(refine failed)_'),
            )
            .join('\n\n')
        : '_no facts to harden_') +
      '\n';
    return cleanReports;
  }

  // JUDGE — the TERMINAL skeptic of the finalize phase. Judges the hardened answer (goal met, verification real, derivation valid) and
  // names the precise fix when not. When compute is off, needsCompute/computeSound are forced (no derivation path). Bounded by MAX_JUDGE_PASSES.
  async runJudge(
    cleanReports               ,
    focus        ,
    pass        ,
  )                           {
    log(
      '· finalize · judge · ' + judge.tier + ' · judging the hardened answer (pass ' + pass + ')',
    );
    const out = await retryAgent          (
      judge.buildPrompt({
        query: CONFIG.query,
        resultSoFar: this.resultSoFar,
        cleanReports,
        focus,
        compute: CONFIG.compute,
        computerNote: CONFIG.COMPUTER_NOTE,
        thinkerNote: CONFIG.THINKER_NOTE,
      }),
      {
        label: 'judge-' + pass,
        phase: CONFIG.PHASE.finalize,
        model: judge.tier,
        effort: judge.effort,
        schema: judge.schema,
      },
    );
    if (out && !CONFIG.compute) {
      out.needsCompute = false; // compute off → no derivation path; never block the exit on it
      out.computeSound = true;
    }
    if (out)
      log(
        '· finalize · judge pass ' +
          pass +
          ' · goalMet=' +
          out.goalMet +
          ' verif=' +
          out.verificationSound +
          ' needsCompute=' +
          out.needsCompute +
          ' computeSound=' +
          out.computeSound,
      );
    return out;
  }

  // CRAWL REOPEN (rare) — the judge found a real evidence gap: pursue its leads through lane-researchers and fold the
  // findings back into resultSoFar via a brainer pass. Bounded by the leads the judge returns (≤ laneCount, deduped vs pursued).
  async reopenCrawl(leads                  )                {
    const picks = leads
      .filter((l) => l && l.keyword && !this.pursuedKeys.has(norm(l.keyword)))
      .slice(0, laneCount)
      .map((l) =>
        addRabbitHole(this, {
          keyword: l.keyword,
          why: l.why,
          path: ['⚖ judge'],
          score: CONFIG.INJECT_SCORE,
          wave: this.wave,
        }),
      )
      .filter(Boolean)                ;
    if (!picks.length) {
      log('· finalize · judge reopen · no fresh leads (all already pursued)');
      return;
    }
    pursue(this, picks);
    const raw = await this.runResearchers(picks, 'reopen', CONFIG.PHASE.finalize);
    const findings            = raw.map((r, i) => ({
      rabbitHole: picks[i].keyword,
      trail: trailOf(picks[i].path, picks[i].keyword),
      summary: r ? r.summary : '(researcher failed)',
    }));
    const coord = await this.coordinate(this.wave, findings, CONFIG.PHASE.finalize);
    if (coord && coord.resultSoFar) this.resultSoFar = coord.resultSoFar;
    log('· finalize · judge reopen · folded ' + picks.length + ' lane(s) into the answer');
  }

  // Finalize (end-only). An opus INITIATOR names the load-bearing facts + the report focus → REFINEMENT: one sonnet REFINE pass per fact,
  // hardening it against the sources → an opus JUDGE judges the hardened answer and drives a bounded remediation loop (the brain DERIVES the
  // answer when one is needed / refine re-checks a mis-hardened fact / the crawl reopens on a real gap) → the opus SYNTHESISER writes the END report.
  async runFinalize()                {
    phase(CONFIG.PHASE.finalize);
    const rabbitHolesOut                  = this.rabbitHoles
      .map((f) => ({
        id: f.id,
        keyword: f.keyword,
        why: f.why,
        path: f.path || [],
        score: lastScore(f),
        scoreHistory: f.scoreHistory,
      }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    this.rabbitHolesOut = rabbitHolesOut;
    const topOpen = rabbitHolesOut.slice(0, 6).map((f) => f.keyword);

    // ── INITIATOR — shapes the finish to the query: names the load-bearing facts to harden + sets the report focus ──
    log(
      '· finalize · initiator · ' +
        initiator.tier +
        ' · naming the facts to harden + the report focus',
    );
    const plan = await retryAgent              (
      initiator.buildPrompt({
        query: CONFIG.query,
        resultSoFar: this.resultSoFar,
        waveLog: this.waveLog,
        landscape: this.scout .landscape,
        openRabbitHoles: topOpen,
        thinkerNote: CONFIG.THINKER_NOTE,
      }),
      {
        label: 'initiator',
        phase: CONFIG.PHASE.finalize,
        model: initiator.tier,
        effort: initiator.effort,
        schema: initiator.schema,
      },
    );
    const facts =
      plan && plan.refinement && Array.isArray(plan.refinement.facts) ? plan.refinement.facts : [];
    const synthFocus = (plan && plan.synthesiser && plan.synthesiser.focus) || '';
    log(
      '· finalize · plan · facts=' +
        facts.length +
        ' · synthFocus=' +
        (synthFocus ? '"' + synthFocus.slice(0, 60) + '"' : 'none'),
    );
    this.files[padIdx(this.wave + 4) + '-initiator.md'] = withPrompt(
      'initiator',
      '# Initiator — finalize plan\n\n' +
        '## Facts to harden (' +
        facts.length +
        ')\n\n' +
        (facts.map((f, i) => i + 1 + '. **' + f.fact + '** — ' + f.why).join('\n') || '_none_') +
        '\n\n## Synthesiser focus\n\n' +
        (synthFocus || '_none_') +
        '\n',
    );

    // ── REFINEMENT — one REFINE agent per fact (parallel): adversarially fact-checks, returns the corrected solid claim ──
    log('· finalize · refinement · ' + facts.length + ' fact(s) → refine · ' + refiner.tier);
    let cleanReports = await this.refineFacts(facts, '', '');
    log('· finalize · refinement DONE · ' + cleanReports.length + ' hardened fact(s)');

    // ── JUDGE loop — terminal skeptic judges, then a bounded remediation loop fixes the single biggest problem and re-judges ──
    const judgeLog             = [];
    const computeDirectives           = [];
    let judgement = await this.runJudge(cleanReports, synthFocus, 0);
    if (judgement) judgeLog.push(judgement);
    let pass = 0;
    while (
      judgement &&
      pass < CONFIG.MAX_JUDGE_PASSES &&
      !(judgement.goalMet && judgement.verificationSound && judgement.computeSound)
    ) {
      pass++;
      const directive = judgement.directive || '';
      const reason = judgement.reasoning || '';
      if (CONFIG.compute && judgement.needsCompute && !judgement.computeSound) {
        // brain FINALIZE-COMPUTE — the brain (code-capable) derives the answer on the hardened facts, per the judge directive
        log('· finalize · judge pass ' + pass + ' → brain finalize-compute · ' + brainer.tier);
        const out = await retryAgent                 (
          buildBrainerCompute({
            query: CONFIG.query,
            resultSoFar: this.resultSoFar,
            hardenedFacts: cleanReports,
            directive,
            reason,
            computerNote: CONFIG.COMPUTER_NOTE,
            thinkerNote: CONFIG.THINKER_NOTE,
          }),
          {
            label: 'brain-compute-' + pass,
            phase: CONFIG.PHASE.finalize,
            model: brainer.tier,
            effort: brainer.effort,
            agentType: 'general-purpose',
            schema: BRAIN_COMPUTE,
          },
        );
        if (out && out.resultSoFar) this.resultSoFar = out.resultSoFar;
        computeDirectives.push(directive || '(derive the answer the goal needs)');
      } else if (!judgement.verificationSound) {
        // RE-REFINE — the judge flagged a mis-hardened / rubber-stamped fact; re-run refine with its directive
        log('· finalize · judge pass ' + pass + ' → re-refine the flagged fact(s)');
        cleanReports = await this.refineFacts(facts, directive, 'r' + pass + '-');
      } else if (
        !judgement.goalMet &&
        judgement.reopenRabbitHoles &&
        judgement.reopenRabbitHoles.length
      ) {
        // CRAWL REOPEN (rare) — a real evidence/coverage gap; reopen the crawl on the judge's leads, then re-harden
        log('· finalize · judge pass ' + pass + ' → reopen the crawl on a real gap');
        await this.reopenCrawl(judgement.reopenRabbitHoles);
        cleanReports = await this.refineFacts(facts, directive, 'r' + pass + '-');
      } else {
        log(
          '· finalize · judge pass ' +
            pass +
            ' → no actionable remediation; proceeding to the report',
        );
        break;
      }
      judgement = await this.runJudge(cleanReports, synthFocus, pass);
      if (judgement) judgeLog.push(judgement);
    }

    // JUDGE file — every pass: the four-flag verdict + reasoning + directive + any reopen
    if (judgeLog.length)
      this.files[padIdx(this.wave + 6) + '-judge.md'] = withPrompt(
        'judge-' + (judgeLog.length - 1),
        '# Judge — finalize-phase terminal skeptic\n\n' +
          judgeLog
            .map(
              (a, i) =>
                '## Pass ' +
                i +
                ' — ' +
                (a.goalMet && a.verificationSound && a.computeSound
                  ? '✓ UPHELD'
                  : '⚔ flagged a problem') +
                '\n\n- goalMet: ' +
                a.goalMet +
                '\n- verificationSound: ' +
                a.verificationSound +
                '\n- needsCompute: ' +
                a.needsCompute +
                '\n- computeSound: ' +
                a.computeSound +
                '\n\n' +
                (a.reasoning || '') +
                (a.directive ? '\n\n**Directive:** ' + a.directive : '') +
                (a.reopenRabbitHoles && a.reopenRabbitHoles.length
                  ? '\n\n**Reopen:**\n' +
                    a.reopenRabbitHoles.map((l) => '- **' + l.keyword + '** — ' + l.why).join('\n')
                  : ''),
            )
            .join('\n\n') +
          '\n',
      );

    // FINALIZE-COMPUTE file — when the brain derived the answer, capture the directive(s) + the derivation folded into `working`
    if (computeDirectives.length)
      this.files['_finalize-compute.md'] =
        '# Finalize compute — the brain derived the answer on the hardened facts\n\n' +
        '## Directive(s)\n\n' +
        computeDirectives.map((d, i) => i + 1 + '. ' + d).join('\n') +
        '\n\n## Derivation (resultSoFar.working)\n\n' +
        ((this.resultSoFar && this.resultSoFar.working) || '_none_') +
        '\n';

    // ── SYNTHESISER — writes the END report (always) from the judged answer (resultSoFar, any derivation folded into `working`) + the hardened facts ──
    const hasDerivation = !!(
      this.resultSoFar &&
      this.resultSoFar.working &&
      this.resultSoFar.working.trim()
    );
    log(
      '· finalize · synthesiser · ' +
        synthesiser.tier +
        ' · writing the report' +
        (hasDerivation ? ' (with derivation)' : ''),
    );
    const agg = await retryAgent           (
      synthesiser.buildPrompt({
        mode: CONFIG.mode,
        query: CONFIG.query,
        landscape: this.scout .landscape,
        resultSoFar: this.resultSoFar,
        waveLog: this.waveLog,
        cleanReports,
        focus: synthFocus,
        openRabbitHoles: topOpen,
        thinkerNote: CONFIG.THINKER_NOTE,
      }),
      {
        label: 'synthesiser',
        phase: CONFIG.PHASE.finalize,
        model: synthesiser.tier,
        effort: synthesiser.effort,
        schema: synthesiser.schema,
      },
    );
    const reportOk = !!(agg && agg.report);
    if (reportOk) {
      this.files['result.md'] = runArgsMd() + agg .report; // surface the launch args at the top of the deliverable
      log(
        '· finalize DONE · confidence=' +
          agg .confidence +
          ' · plan=' +
          (agg .plan || []).length +
          ' step(s) · openQ=' +
          (agg .openQuestions || []).length,
      );
    } else {
      log('✗ finalize FAILED — no report returned');
    }
    this.synthesiserOut = agg;
    this.reportOk = reportOk;
  }

  // metrics + _rabbitHoles.json + the crawl-tree render, then the final return shape.
  buildResult()            {
    const { synthesiserOut, reportOk, rabbitHolesOut, coord, wave } = this;

    const metrics          = {
      mode: CONFIG.mode,
      dir: CONFIG.DIR,
      wavesRun: wave - 1,
      stopReason: this.stopReason,
      scoutRabbitHoles: this.scoutRabbitHoles.length,
      prospectorVenues: this.highValueSources.length,
      pursuedTotal: this.pursuedList.length,
      rabbitHolesFinal: this.rabbitHoles.length,
      bestOpenScore: this.bestOpen,
      topScores: this.topScores,
      done: coord .stop.done,
      sentinelReopensForced: this.sentinelReopensUsed,
      reportWritten: reportOk,
      confidence: reportOk ? synthesiserOut .confidence : null,
    };
    log('■ RR DONE · ' + JSON.stringify(metrics));

    this.files['_rabbitHoles.json'] = JSON.stringify(
      {
        args: CONFIG.rawArgs, // the COMPLETE set of arguments the run was launched with, verbatim
        query: CONFIG.query,
        mode: CONFIG.mode,
        stopReason: this.stopReason,
        topScores: this.topScores,
        highValueSources: this.highValueSources,
        rabbitHoles: rabbitHolesOut,
        pursued: this.pursuedArchive,
      },
      null,
      2,
    );

    // CRAWL TREE — reconstruct the branching from the pursued-archive paths (the global trail record) and render it visually.
                                                                                          
    const treeRoot           = { kw: CONFIG.query, children: new Map(), score: null };
    for (const l of this.pursuedArchive) {
      let cur = treeRoot;
      for (const kw of [...(l.path || []), l.keyword]) {
        const k = norm(kw);
        if (!cur.children.has(k)) cur.children.set(k, { kw, children: new Map(), score: null });
        cur = cur.children.get(k) ;
      }
      cur.score =
        l.scoreHistory && l.scoreHistory.length
          ? l.scoreHistory[l.scoreHistory.length - 1].score
          : null;
    }
    const treeLines           = [];
    const walkTree = (node          , prefix        )       => {
      const kids = [...node.children.values()];
      kids.forEach((c, i) => {
        const last = i === kids.length - 1;
        const kw = c.kw.length > 64 ? c.kw.slice(0, 61) + '…' : c.kw;
        treeLines.push(
          prefix + (last ? '└─ ' : '├─ ') + kw + (c.score != null ? '  [' + c.score + ']' : ''),
        );
        walkTree(c, prefix + (last ? '   ' : '│  '));
      });
    };
    walkTree(treeRoot, '');
    const goalLine =
      'GOAL: ' + (CONFIG.query.length > 80 ? CONFIG.query.slice(0, 77) + '…' : CONFIG.query);
    log('');
    log('🌳 CRAWL TREE — how it branched (goal → lanes pursued · [score]):');
    log(goalLine);
    treeLines.forEach((l) => log(l));
    this.files['_tree.md'] =
      '# Crawl tree — how the lanes branched\n\n```\n' +
      goalLine +
      '\n' +
      treeLines.join('\n') +
      '\n```\n';

    return {
      query: CONFIG.query,
      mode: CONFIG.mode,
      dir: CONFIG.DIR,
      stopReason: this.stopReason,
      done: coord .stop.done,
      tree: [goalLine, ...treeLines],
      verdict: reportOk ? synthesiserOut .verdict : null,
      confidence: reportOk ? synthesiserOut .confidence : null,
      plan: reportOk ? synthesiserOut .plan : [],
      openQuestions: reportOk ? synthesiserOut .openQuestions : [],
      pursued: this.pursuedList,
      pursuedArchive: this.pursuedArchive,
      highValueSources: this.highValueSources,
      rabbitHoles: rabbitHolesOut,
      resultSoFar: this.resultSoFar,
      sentinelLog: this.sentinelLog,
      waveLog: this.waveLog,
      metrics,
      files: this.files,
    };
  }

  // DEBUG & ANALYSIS (last phase, opt-in via arg.debug): an Opus agent consolidates the run's diagnostics — corner-by-corner,
  // prospector→researcher venue utilization, and any arg.debugPrompt question — then JS appends the verbatim metrics, run log,
  // and raw agent I/O (exact prompt in / exact output out) into one shippable _debug.md.
  async runDebug(metrics         )                {
    phase(CONFIG.PHASE.debug);
    log(
      '· debug & analysis · ' +
        debugAnalyst.tier +
        ' · over ' +
        IO_LOG.length +
        ' agent calls + ' +
        LOG_BUFFER.length +
        ' log lines + ' +
        this.laneRecords.length +
        ' lane records',
    );
    const diag = await retryAgent         (
      debugAnalyst.buildPrompt({
        query: CONFIG.query,
        focus: CONFIG.debugPrompt,
        metrics,
        waveLog: this.waveLog,
        sentinelLog: this.sentinelLog,
        resultLog: this.resultLog,
        highValueSources: this.highValueSources,
        laneRecords: this.laneRecords,
      }),
      {
        label: 'debug-analyst',
        phase: CONFIG.PHASE.debug,
        model: debugAnalyst.tier,
        effort: debugAnalyst.effort,
        schema: debugAnalyst.schema,
      },
    );
    const narrative =
      (diag && diag.diagnosis) || '_(debug analyst failed — see raw sections below)_';
    const rawIO = IO_LOG.map(
      (e, i) =>
        '### ' +
        (i + 1) +
        '. `' +
        e.label +
        '` · ' +
        e.model +
        ' · ' +
        e.phase +
        '\n\n**PROMPT**\n\n' +
        (e.prompt || '') +
        '\n\n**OUTPUT**' +
        (e.error ? ' _(' + e.error + ')_' : '') +
        '\n\n' +
        (e.output == null ? '_(null)_' : JSON.stringify(e.output, null, 2)),
    ).join('\n\n');
    this.files['_debug.md'] =
      '# RR debug & analysis — ' +
      (CONFIG.query.length > 80 ? CONFIG.query.slice(0, 77) + '…' : CONFIG.query) +
      (CONFIG.debugPrompt ? '\n\n**Debug prompt:** ' + CONFIG.debugPrompt : '') +
      '\n\n## Analysis (debug-analyst · opus)\n\n' +
      narrative +
      '\n\n## Metrics\n\n```json\n' +
      JSON.stringify(metrics, null, 2) +
      '\n```' +
      '\n\n## Run log (' +
      LOG_BUFFER.length +
      ' lines)\n\n```\n' +
      LOG_BUFFER.join('\n') +
      '\n```' +
      '\n\n## Raw agent I/O — exact prompt in, exact output out (' +
      IO_LOG.length +
      ' calls)\n\n' +
      (rawIO || '_(none captured)_') +
      '\n';
    log('· debug DONE · _debug.md written');
  }

  async run()                     {
    const scoutRabbitHoles = await this.runScout();
    await this.runProspect(); // name the high-value venues before the crawl
    await this.runCrawl(scoutRabbitHoles);
    await this.runFinalize();
    const result = this.buildResult();
    if (CONFIG.debug) await this.runDebug(result.metrics); // last phase, opt-in: Debug & Analysis agent → _debug.md
    return result;
  }
}

// ── entry — the Workflow harness wraps this file in an async scope and awaits its return ──
const rr = new ResearchReport()
return await rr.run()
