// ─────────────────────────────────────────────────────────────────────────────
// Configs — validates the injected JSON args (which can be ANYTHING) and fills
// safe defaults in the constructor. One immutable CONFIG singleton holds the run.
// (The StructuredOutput schema literals it used to carry live in schemas.js now.)
// ─────────────────────────────────────────────────────────────────────────────
export class Configs {
  constructor(rawArgs) {
    // args: { query, mode?, compute?, maxWave?, parallelLaneResearchAgentsPerWave?, parallelSourcesPerLaneResearchAgent?, debug?, debugPrompt? }
    let arg
    try { arg = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs }
    catch (e) { throw new Error('RR: args is not valid JSON — ' + ((e && e.message) || e)) }
    if (typeof arg !== 'object' || arg === null || Array.isArray(arg)) {
      throw new Error('RR: args must be a JSON object { query, mode?, maxWave? }')
    }
    if (typeof arg.query !== 'string' || arg.query.trim() === '') {
      throw new Error('RR requires args { query: non-empty string, mode?, maxWave? }')
    }
    // typed readers — keep the supplied value only when it is the right type, else fall back to the default
    const str = (v, d) => (typeof v === 'string' && v.length) ? v : d
    const posInt = (v, d) => (Number.isInteger(v) && v > 0) ? v : d
    const bool = (v, d) => (typeof v === 'boolean' ? v : d)
    const autoInt = (v, lo, hi, d) => v === 'auto' ? 'auto' : (Number.isInteger(v) && v > 0 ? Math.min(hi, Math.max(lo, v)) : d)

    // ---- run config (validated + defaulted) ----
    this.query = arg.query
    this.mode = arg.mode === 'collect' ? 'collect' : 'goal'   // canonical mode; anything not 'collect' → 'goal'
    this.maxWave = autoInt(arg.maxWave, 5, 15, 'auto')   // 'auto' (brainer-stopped, capped at HARD_CAP) or a clamped [5,15] override
    this.HARD_CAP = 15                                   // absolute ceiling on waves — no run ever exceeds this
    this.parallelLaneResearchAgentsPerWave = autoInt(arg.parallelLaneResearchAgentsPerWave, 1, 5, 'auto')   // lanes/wave: 'auto' (brainer-assigned, hidden cap 5) or clamped [1,5]
    this.parallelSourcesPerLaneResearchAgent = autoInt(arg.parallelSourcesPerLaneResearchAgent, 1, 5, 'auto')   // sources/lane: 'auto' (brainer-assigned, hidden cap 5) or clamped [1,5]
    // Tier policy. brainer = ALWAYS Opus (the global brain/reducer — measured: a Haiku brainer scored erratically + drifted off-goal).
    // scout + lane-researcher = Haiku (user directive + prior hands-on RND, re-affirmed 2026-06-26): the page reading is already done by the
    // FIXED Haiku WebFetch digester, leaving each worker a BOUNDED "summarize 1-2 already-digested pages + extract rabbit-holes" task — Haiku's
    // wheelhouse, not the cross-source synthesis the generic model-fit research warned about. Measured: Haiku researcher summaries were
    // accurate + specific; Sonnet's edge was modest, and a SONNET researcher is what crashed the vector-DB run. Escalate only on measured failure.
    this.TIER = {
      scout: 'haiku', researcher: 'haiku',
      prospector: 'opus', brainer: 'opus', sentinel: 'opus',
      initiator: 'opus', refiner: 'sonnet', computer: 'opus', aggregator: 'opus', debugAnalyst: 'opus',
    }
    // Reasoning effort by cognitive load (tuning effort is a better lever than model — esp. for the brainer): workers medium, adversarial/correct high, synthesis + brainer xhigh.
    this.EFFORT = {
      scout: 'medium', researcher: 'medium',
      prospector: 'high', refiner: 'high', debugAnalyst: 'high',
      sentinel: 'xhigh', initiator: 'xhigh', computer: 'xhigh', aggregator: 'xhigh',
      brainer: 'xhigh',   // the global brain — re-scores the store every wave AND sets direction (looks up + originates) AND maintains resultSoFar; the one role where the extra budget pays back most
    }
    this.PHASE = { scout: 'Scout', crawl: 'Research', finalize: 'Finalize', debug: 'Debug' }
    this.MAX_SENTINEL_REOPENS = this.mode === 'goal' ? 2 : 0  // L4: max extra waves the goal-mode sentinel may force (collect mode never reopens → 0)
    this.QUERY_PLATEAU = 0.7     // collect-mode DRY: stop when top novelty-score stays ≤ this × the run's PEAK for 2 waves (no magic absolute floor)
    // L7 robustness: RETRY a failed agent() call up to AGENT_RETRIES times (a fresh spawn). A single transient failure (e.g. StructuredOutput
    // retry-cap exceeded on a JS-rendered page) often clears on a clean re-run; only after the retries are exhausted does it degrade to null
    // (handled by the existing null-guards) instead of throwing and crashing the WHOLE workflow.
    this.AGENT_RETRIES = 2
    this.INJECT_SCORE = 90                              // L4: score for sentinel-injected gap rabbit-holes — high, so they top the store
    this.compute = bool(arg.compute, true)                    // master switch for ALL derivation: false → the brainer runs as a plain subagent (no code) + no finalize computement (the brainer/initiator are told it is off)
    this.debug = bool(arg.debug, false)                       // last-phase Debug & Analysis agent → one _debug.md (raw agent I/O + run log + metrics)
    this.debugPrompt = str(arg.debugPrompt, '')                 // optional run-specific analysis question handed to the debug agent
    this.tag = str(arg.tag, '')                              // optional slug suffix so parallel variants of one query write to distinct dirs
    const baseSlug = this.query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    this.slug = baseSlug + (this.tag ? '-' + this.tag : '')
    this.DIR = 'RR/' + this.slug

    // ---- shared prompt fragments (woven into the builders below) ----
    this.FOOTER =
`Then append a section titled "Rabbit holes": 0-5 rabbit-holes worth a researcher's time, prioritizing the biggest gaps the page raises but does not explain. Each rabbit-hole: a concrete next web-search query and one line on why it matters. If the page is a dead end or self-contained, give 1 or none — do not pad. Skip anything the page already explains.`
    // L3 (directive A): primary tools are WebSearch + WebFetch, but agents MAY reach for any other tool that genuinely helps the rabbit-hole.
    this.NET =
`Primary tools: WebSearch + WebFetch — load them via ToolSearch "select:WebSearch,WebFetch" if absent. You may also load any other tool that genuinely helps THIS rabbit-hole (e.g. context7 for library/API docs) via ToolSearch — pick the best tool for the question, not only web search. Prefer primary, recent sources; stay on-rabbit-hole.
PDF sources: WebFetch garbles PDFs. When a source is a PDF (its URL ends in .pdf, or WebFetch returns binary/garbled text), do not keep retrying it — load Bash via ToolSearch and read the PDF on disk with pypdf (already installed). Fetch then extract: f=$(mktemp --suffix=.pdf); curl -sL "<url>" -o "$f"; python3 -c "import pypdf; print(chr(10).join((p.extract_text() or '') for p in pypdf.PdfReader('$f').pages))" — then work from the printed text.`
    this.RUBRIC = this.mode === 'collect'
      ? `MODE = collect (exhaustive): score each rabbit-hole by how much NEW information it adds about the subject; favour breadth.`
      : `MODE = goal (directed): score each rabbit-hole by how much it improves or better-verifies the answer to the goal; favour rabbit-holes that close or verify it.`
    this.STOP = this.mode === 'collect'
      ? `done = true when the high-value material is collected and remaining rabbit-holes are only marginally novel — the novelty trajectory has fallen well below peak and plateaued. The subject need not be exhausted (a rich one never is); call it when further waves add footnotes, not substance.`
      : `done = true only when the goal is answered AND pursuing the top remaining rabbit-holes would not materially improve or better-verify the answer.`
  }
}
export const CONFIG = new Configs(args)
