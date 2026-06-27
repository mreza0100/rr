export const meta = {
  name: 'Research and Report',
  description: 'Research and Report — unbounded best-first web crawl steered by a BRAINER (the brain) over a persistent id-keyed rabbit-hole store. haiku scout seeds rabbit-holes → opus PROSPECTOR names the high-value authoritative source venues for the topic → [the brainer looks up OR originates the rabbit-holes worth pursuing AND assigns each its relevant venue subset → parallel haiku lane-researchers pursue (preferring their assigned venues) → the brainer returns delta updates (rescore / add / lookupNext / rename / drop), maintains a running resultSoFar, decides done; in goal mode a sentinel may reopen a premature done and force one more wave] until done / rabbithole-dry / wave hard-cap (15) → FINALIZE: an opus INITIATOR plans the finish for the query → a sonnet refine pass fact-checks + hardens the load-bearing facts against the sources → an optional sequential opus COMPUTEMENT chain derives the answer (writing + running code, propagating error bars) when it must be built → an opus aggregator writes the 7-section report. Pursued-archive (no delete-on-pursue) + pursued memory; scoreHistory rides natively on each rabbit-hole id. Two modes: goal (satisficing) / collect (exhaustive). Returns per-wave markdown + refinement + report + _frontier.json.',
  phases: [
    { title: 'Scout', detail: 'the seed: haiku scout maps the landscape (fetch sources with the rabbit-hole footer) → opus prospector names the high-value authoritative source venues → the brainer scores the scout rabbit-holes, assigns each its venue subset, and looks up the first wave' },
    { title: 'Research', detail: 'each wave: the brainer looks up OR originates the rabbit-holes worth pursuing + assigns each its venue subset → parallel haiku lane-researchers pursue (preferring assigned venues) → the brainer returns delta updates (rescore / add / lookupNext), maintains the running resultSoFar (knows pursued + score trajectory), decides done; goal-mode sentinel can force one more wave on a real gap' },
    { title: 'Finalize', detail: 'an opus INITIATOR shapes the finish to the query → refinement (a sonnet refine agent fact-checks + hardens each load-bearing fact against the sources) → computement (optional: a sequential opus chain that DERIVES the answer — writing + running code, propagating error bars — when the answer must be built) → an opus aggregator writes the report' },
    { title: 'Debug', detail: 'opt-in (arg.debug): a final Debug & Analysis agent aggregates metrics + run log + raw agent I/O into one _debug.md — incl. prospector→researcher venue-utilization and any arg.debugPrompt question' },
  ],
}
// ╔══ module: src/schemas.js ══════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
// schemas — StructuredOutput contracts (declaration order respects nesting; nested
// items reference the schemas above). Extracted from the Configs constructor: each
// `this.X = {…}` became a module-level `export const X = {…}` (bare references).
// ─────────────────────────────────────────────────────────────────────────────
const RABBITHOLE = { type: 'object', properties: { keyword: { type: 'string' }, why: { type: 'string' } }, required: ['keyword', 'why'] }
const SCORED = { type: 'object', properties: { keyword: { type: 'string' }, why: { type: 'string' }, score: { type: 'number' } }, required: ['keyword', 'why', 'score'] }
const PAGE = { type: 'object', properties: { url: { type: 'string' }, summary: { type: 'string' }, rabbitHoles: { type: 'array', items: RABBITHOLE } }, required: ['url', 'summary', 'rabbitHoles'] }
const SCOUT = { type: 'object', properties: { landscape: { type: 'string' }, pages: { type: 'array', items: PAGE }, deadEnds: { type: 'array', items: { type: 'string' } } }, required: ['landscape', 'pages'] }
const RESEARCH = { type: 'object', properties: { summary: { type: 'string' }, rabbitHoles: { type: 'array', items: RABBITHOLE }, deadEnds: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'rabbitHoles'] }
// LOOKUP = one item in the brainer's `lookupNext` (research NOW): EITHER {id} (an existing open rabbit-hole) OR {keyword,why,score,…}
// (originate-and-pursue-now). All fields optional so both shapes validate; `sources`/`sourceCount` are the prospector venues the brainer
// assigns to THIS lane (its researcher searches them first).
const LOOKUP = { type: 'object', properties: {
  id: { type: 'number', description: 'id of an existing open rabbit-hole to research now — use this OR the keyword fields, not both' },
  keyword: { type: 'string' }, why: { type: 'string' }, score: { type: 'number' },
  sources: { type: 'array', items: { type: 'string' }, description: 'subset of the prospector venue identifiers (their exact `source` strings) best suited to THIS rabbit-hole — its researcher will prefer these. Empty if none fit.' },
  sourceCount: { type: 'number', description: 'how many sources this lane\'s researcher should fetch' },
} }
// resultSoFar = the run's living MEMORY, carried wave to wave. The brainer maintains it; refinement gets the FINAL one only.
const RESULT_SO_FAR = { type: 'object', properties: {
  answer: { type: 'string', description: 'the best current answer to the goal, as it stands this wave' },
  evidence: { type: 'array', items: { type: 'object', properties: {
    fact: { type: 'string' }, value: { type: 'string' }, source: { type: 'string' },
    status: { type: 'string', enum: ['settled', 'tentative', 'contested'] },
  }, required: ['fact', 'value', 'source', 'status'] }, description: 'load-bearing facts the answer rests on — NOT a transcript of everything seen' },
  resolved: { type: 'array', items: { type: 'string' }, description: 'sub-questions now closed' },
  openGaps: { type: 'array', items: { type: 'string' }, description: 'what is still missing' },
  tensions: { type: 'array', items: { type: 'string' }, description: 'conflicting sources / unresolved contradictions' },
  working: { type: 'string', description: 'for build-the-answer / estimate questions, the growing derivation chain; \'\' for non-derivation questions' },
  confidence: { type: 'string' },
}, required: ['answer', 'evidence', 'resolved', 'openGaps', 'tensions', 'working', 'confidence'] }
// COMPUTEMENT = a request to run the code-capable COMPUTE agent: run + ordered one-line derivation stages. The Finalize initiator emits it
// to derive the final answer (the brainer computes its own steering numbers inline — no separate stage).
const COMPUTEMENT = { type: 'object', properties: {
  run: { type: 'boolean', description: 'true when a calculation is needed — a quantitative estimate, a derivation, or a synthesis no single source holds; false otherwise' },
  stages: { type: 'array', items: { type: 'string' }, description: 'the ordered derivation steps, each ONE line of what to compute; [] when run is false. The last stage MAY be a sanity-check / verification of the derived value' },
}, required: ['run', 'stages'] }
// COORD = the brainer's per-wave output: the updated resultSoFar + DELTAS against the engine's id-keyed open store. The engine carries
// each rabbit-hole's id + scoreHistory natively — the brainer never re-emits the whole set, it only sends what changed.
const COORD = { type: 'object', properties: {
  resultSoFar: RESULT_SO_FAR,
  rescore: { type: 'array', items: { type: 'object', properties: { id: { type: 'number' }, score: { type: 'number' } }, required: ['id', 'score'] }, description: 'ONLY the open rabbit-holes whose score CHANGES this wave (the engine pushes {wave,score} to each id\'s history); unlisted leads keep their last score. Score every "new" (unscored) lead at least once.' },
  add: { type: 'array', items: SCORED, description: 'NEW rabbit-holes to PARK in the store for a later wave — the engine assigns each a fresh id, scoreHistory seeded with this score' },
  lookupNext: { type: 'array', items: LOOKUP, description: 'the rabbit-holes to research NOW — each EITHER {id} (a stored lead) OR {keyword,why,score,sources?,sourceCount?} (originate-and-pursue-now). NONE may be already pursued; assign each its relevant `sources` venue subset.' },
  rename: { type: 'array', items: { type: 'object', properties: { id: { type: 'number' }, keyword: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'keyword'] }, description: 'relabel a rabbit-hole, keeping its id + score history' },
  drop: { type: 'array', items: { type: 'number' }, description: 'ids of dead/duplicate rabbit-holes to eliminate (a MERGE = drop the duplicate, rescore the survivor)' },
  stop: { type: 'object', properties: { done: { type: 'boolean' }, reason: { type: 'string', description: 'one line: why done, or what is still missing' } }, required: ['done', 'reason'] },
}, required: ['resultSoFar', 'rescore', 'add', 'lookupNext', 'stop'] }
// L4 (directive B): the goal-mode SENTINEL schema — the TERMINAL skeptic of the crawl phase, the inverse of verify. It runs ONCE when the
// brainer declares done: it sees the open store + the brainer's running answer and decides whether stopping is SOLID. If not, it injects
// high-score gap objects at the TOP of the store and hands them back to the lane researchers — the crawl resumes. Bounded by MAX_SENTINEL_REOPENS.
const SENTINEL = { type: 'object', properties: {
  solid: { type: 'boolean', description: 'true = the brainer\'s decision to stop is SOLID (uphold it, end the crawl); false = the brainer stopped prematurely / left a load-bearing gap' },
  reasoning: { type: 'string', description: 'why the stop is solid, or what load-bearing gap was missed' },
  rabbitHoles: { type: 'array', items: { type: 'object', properties: { keyword: { type: 'string' }, why: { type: 'string' } }, required: ['keyword', 'why'] }, description: 'when solid=false: 1-3 concrete high-priority gap searches to inject at the store top (NONE already pursued); empty when solid=true' },
}, required: ['solid', 'reasoning'] }
// PROSPECTOR schema — names the high-value AUTHORITATIVE source venues for THIS topic (domain-specific); output rides with the brainer.
const SOURCES = { type: 'object', properties: {
  highValueSources: { type: 'array', items: { type: 'object', properties: {
    source: { type: 'string', description: 'the venue + how to reach/search it, e.g. "arXiv (site:arxiv.org)", "SemiAnalysis (semianalysis.com)"' },
    goodFor: { type: 'string', description: 'the kinds of sub-questions/rabbit-holes this venue is BEST for — specific enough for the brainer to match a research lane to it' },
  }, required: ['source', 'goodFor'] } },
  reasoning: { type: 'string', description: 'brief: how you chose these venues / what you searched to confirm' },
}, required: ['highValueSources'] }
// FINALIZE schemas. The INITIATOR plans the finish (which facts to harden, whether to derive, the report focus); a Sonnet REFINE pass
// adversarially fact-checks each load-bearing fact and returns its corrected claim; an optional sequential Opus COMPUTE chain derives the answer.
const INITIATOR = { type: 'object', properties: {
  refinement: { type: 'object', properties: {
    facts: { type: 'array', items: { type: 'object', properties: {
      fact: { type: 'string', description: 'a load-bearing fact the answer rests on' },
      why: { type: 'string', description: 'why it is load-bearing — what breaks if it is wrong' },
    }, required: ['fact', 'why'] }, description: 'every load-bearing fact to harden — NO cap; name all that would change the answer if wrong, skip soft restatements' },
  }, required: ['facts'] },
  computement: COMPUTEMENT,
  aggregator: { type: 'object', properties: {
    focus: { type: 'string', description: 'a note to the report writer on what to emphasize / the shape the answer should take' },
  }, required: ['focus'] },
}, required: ['refinement', 'computement', 'aggregator'] }
const REFINE = { type: 'object', properties: { report: { type: 'string', description: 'markdown: the clean / corrected claim(s) for this fact after adversarial fact-checking against the sources' } }, required: ['report'] }
const COMPUTE = { type: 'object', properties: {
  value: { type: 'string', description: 'the headline quantity this stage computed — with units and an error range where applicable' },
  result: { type: 'string', description: 'markdown: the derivation — the input numbers used, the steps, the result, and the self-check' },
  script: { type: 'string', description: 'the exact source of any code you wrote AND ran to compute this; "" if none' },
  scriptLang: { type: 'string', description: 'language of `script` (python / node); "" if none' },
  assumptions: { type: 'array', items: { type: 'string' }, description: 'assumptions the derivation rests on' },
}, required: ['value', 'result', 'assumptions'] }
const REPORT = { type: 'object', properties: {
  report: { type: 'string', description: 'the FULL report as markdown, all 7 sections in order per the contract' },
  verdict: { type: 'string', description: '1-3 sentence headline answer' },
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  plan: { type: 'array', items: { type: 'string' }, description: 'concrete, opinionated operator actions' },
  openQuestions: { type: 'array', items: { type: 'string' } },
}, required: ['report', 'verdict', 'confidence', 'plan', 'openQuestions'] }
const DIAG = { type: 'object', properties: { diagnosis: { type: 'string', description: 'the full corner-by-corner debug aggregation + analysis as markdown' } }, required: ['diagnosis'] }
// ╔══ module: src/config.js ═══════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
// Configs — validates the injected JSON args (which can be ANYTHING) and fills
// safe defaults in the constructor. One immutable CONFIG singleton holds the run.
// (The StructuredOutput schema literals it used to carry live in schemas.js now.)
// ─────────────────────────────────────────────────────────────────────────────
class Configs {
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
const CONFIG = new Configs(args)
// ╔══ module: src/vendor/mustache.js ══════════════════════════════════════
// Vendored from mustache@4.2.0 (mustache.mjs) — pure interpreter, no eval/new Function. Inlined because the Workflow sandbox allows no runtime imports. Named export adjusted; one comment word scrubbed for the determinism guard.
/*!
 * mustache.js - Logic-less {{mustache}} templates with JavaScript
 * http://github.com/janl/mustache.js
 */

var objectToString = Object.prototype.toString;
var isArray = Array.isArray || function isArrayPolyfill (object) {
  return objectToString.call(object) === '[object Array]';
};

function isFunction (object) {
  return typeof object === 'function';
}

/**
 * More correct typeof string handling array
 * which normally returns typeof 'object'
 */
function typeStr (obj) {
  return isArray(obj) ? 'array' : typeof obj;
}

function escapeRegExp (string) {
  return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
}

/**
 * Null safe way of checking whether or not an object,
 * including its prototype, has a given property
 */
function hasProperty (obj, propName) {
  return obj != null && typeof obj === 'object' && (propName in obj);
}

/**
 * Safe way of detecting whether or not the given thing is a primitive and
 * whether it has the given property
 */
function primitiveHasOwnProperty (primitive, propName) {
  return (
    primitive != null
    && typeof primitive !== 'object'
    && primitive.hasOwnProperty
    && primitive.hasOwnProperty(propName)
  );
}

// Workaround for https://issues.apache.org/jira/browse/COUCHDB-577
// See https://github.com/janl/mustache.js/issues/189
var regExpTest = RegExp.prototype.test;
function testRegExp (re, string) {
  return regExpTest.call(re, string);
}

var nonSpaceRe = /\S/;
function isWhitespace (string) {
  return !testRegExp(nonSpaceRe, string);
}

var entityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

function escapeHtml (string) {
  return String(string).replace(/[&<>"'`=\/]/g, function fromEntityMap (s) {
    return entityMap[s];
  });
}

var whiteRe = /\s*/;
var spaceRe = /\s+/;
var equalsRe = /\s*=/;
var curlyRe = /\s*\}/;
var tagRe = /#|\^|\/|>|\{|&|=|!/;

/**
 * Breaks up the given `template` string into a tree of tokens. If the `tags`
 * argument is given here it must be an array with two string values: the
 * opening and closing tags used in the template (e.g. [ "<%", "%>" ]). Of
 * course, the default is to use mustaches (i.e. mustache.tags).
 *
 * A token is an array with at least 4 elements. The first element is the
 * mustache symbol that was used inside the tag, e.g. "#" or "&". If the tag
 * did not contain a symbol (i.e. {{myValue}}) this element is "name". For
 * all text that appears outside a symbol this element is "text".
 *
 * The second element of a token is its "value". For mustache tags this is
 * whatever else was inside the tag besides the opening symbol. For text tokens
 * this is the text itself.
 *
 * The third and fourth elements of the token are the start and end indices,
 * respectively, of the token in the original template.
 *
 * Tokens that are the root node of a subtree contain two more elements: 1) an
 * array of tokens in the subtree and 2) the index in the original template at
 * which the closing tag for that section begins.
 *
 * Tokens for partials also contain two more elements: 1) a string value of
 * indendation prior to that tag and 2) the index of that tag on that line -
 * eg a value of 2 indicates the partial is the third tag on this line.
 */
function parseTemplate (template, tags) {
  if (!template)
    return [];
  var lineHasNonSpace = false;
  var sections = [];     // Stack to hold section tokens
  var tokens = [];       // token holding array
  var spaces = [];       // Indices of whitespace tokens on the current line
  var hasTag = false;    // Is there a {{tag}} on the current line?
  var nonSpace = false;  // Is there a non-space char on the current line?
  var indentation = '';  // Tracks indentation for tags that use it
  var tagIndex = 0;      // Stores a count of number of tags encountered on a line

  // Strips all whitespace tokens array for the current line
  // if there was a {{#tag}} on it and otherwise only space.
  function stripSpace () {
    if (hasTag && !nonSpace) {
      while (spaces.length)
        delete tokens[spaces.pop()];
    } else {
      spaces = [];
    }

    hasTag = false;
    nonSpace = false;
  }

  var openingTagRe, closingTagRe, closingCurlyRe;
  function compileTags (tagsToCompile) {
    if (typeof tagsToCompile === 'string')
      tagsToCompile = tagsToCompile.split(spaceRe, 2);

    if (!isArray(tagsToCompile) || tagsToCompile.length !== 2)
      throw new Error('Invalid tags: ' + tagsToCompile);

    openingTagRe = new RegExp(escapeRegExp(tagsToCompile[0]) + '\\s*');
    closingTagRe = new RegExp('\\s*' + escapeRegExp(tagsToCompile[1]));
    closingCurlyRe = new RegExp('\\s*' + escapeRegExp('}' + tagsToCompile[1]));
  }

  compileTags(tags || mustache.tags);

  var scanner = new Scanner(template);

  var start, type, value, chr, token, openSection;
  while (!scanner.eos()) {
    start = scanner.pos;

    // Match any text between tags.
    value = scanner.scanUntil(openingTagRe);

    if (value) {
      for (var i = 0, valueLength = value.length; i < valueLength; ++i) {
        chr = value.charAt(i);

        if (isWhitespace(chr)) {
          spaces.push(tokens.length);
          indentation += chr;
        } else {
          nonSpace = true;
          lineHasNonSpace = true;
          indentation += ' ';
        }

        tokens.push([ 'text', chr, start, start + 1 ]);
        start += 1;

        // Check for whitespace on the current line.
        if (chr === '\n') {
          stripSpace();
          indentation = '';
          tagIndex = 0;
          lineHasNonSpace = false;
        }
      }
    }

    // Match the opening tag.
    if (!scanner.scan(openingTagRe))
      break;

    hasTag = true;

    // Get the tag type.
    type = scanner.scan(tagRe) || 'name';
    scanner.scan(whiteRe);

    // Get the tag value.
    if (type === '=') {
      value = scanner.scanUntil(equalsRe);
      scanner.scan(equalsRe);
      scanner.scanUntil(closingTagRe);
    } else if (type === '{') {
      value = scanner.scanUntil(closingCurlyRe);
      scanner.scan(curlyRe);
      scanner.scanUntil(closingTagRe);
      type = '&';
    } else {
      value = scanner.scanUntil(closingTagRe);
    }

    // Match the closing tag.
    if (!scanner.scan(closingTagRe))
      throw new Error('Unclosed tag at ' + scanner.pos);

    if (type == '>') {
      token = [ type, value, start, scanner.pos, indentation, tagIndex, lineHasNonSpace ];
    } else {
      token = [ type, value, start, scanner.pos ];
    }
    tagIndex++;
    tokens.push(token);

    if (type === '#' || type === '^') {
      sections.push(token);
    } else if (type === '/') {
      // Check section nesting.
      openSection = sections.pop();

      if (!openSection)
        throw new Error('Unopened section "' + value + '" at ' + start);

      if (openSection[1] !== value)
        throw new Error('Unclosed section "' + openSection[1] + '" at ' + start);
    } else if (type === 'name' || type === '{' || type === '&') {
      nonSpace = true;
    } else if (type === '=') {
      // Set the tags for the next time around.
      compileTags(value);
    }
  }

  stripSpace();

  // Make sure there are no open sections when we're done.
  openSection = sections.pop();

  if (openSection)
    throw new Error('Unclosed section "' + openSection[1] + '" at ' + scanner.pos);

  return nestTokens(squashTokens(tokens));
}

/**
 * Combines the values of consecutive text tokens in the given `tokens` array
 * to a single token.
 */
function squashTokens (tokens) {
  var squashedTokens = [];

  var token, lastToken;
  for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
    token = tokens[i];

    if (token) {
      if (token[0] === 'text' && lastToken && lastToken[0] === 'text') {
        lastToken[1] += token[1];
        lastToken[3] = token[3];
      } else {
        squashedTokens.push(token);
        lastToken = token;
      }
    }
  }

  return squashedTokens;
}

/**
 * Forms the given array of `tokens` into a nested tree structure where
 * tokens that represent a section have two additional items: 1) an array of
 * all tokens that appear in that section and 2) the index in the original
 * template that represents the end of that section.
 */
function nestTokens (tokens) {
  var nestedTokens = [];
  var collector = nestedTokens;
  var sections = [];

  var token, section;
  for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
    token = tokens[i];

    switch (token[0]) {
      case '#':
      case '^':
        collector.push(token);
        sections.push(token);
        collector = token[4] = [];
        break;
      case '/':
        section = sections.pop();
        section[5] = token[2];
        collector = sections.length > 0 ? sections[sections.length - 1][4] : nestedTokens;
        break;
      default:
        collector.push(token);
    }
  }

  return nestedTokens;
}

/**
 * A simple string scanner that is used by the template parser to find
 * tokens in template strings.
 */
function Scanner (string) {
  this.string = string;
  this.tail = string;
  this.pos = 0;
}

/**
 * Returns `true` if the tail is empty (end of string).
 */
Scanner.prototype.eos = function eos () {
  return this.tail === '';
};

/**
 * Tries to match the given regular expression at the current position.
 * Returns the matched text if it can match, the empty string otherwise.
 */
Scanner.prototype.scan = function scan (re) {
  var match = this.tail.match(re);

  if (!match || match.index !== 0)
    return '';

  var string = match[0];

  this.tail = this.tail.substring(string.length);
  this.pos += string.length;

  return string;
};

/**
 * Skips all text until the given regular expression can be matched. Returns
 * the skipped string, which is the entire tail if no match can be made.
 */
Scanner.prototype.scanUntil = function scanUntil (re) {
  var index = this.tail.search(re), match;

  switch (index) {
    case -1:
      match = this.tail;
      this.tail = '';
      break;
    case 0:
      match = '';
      break;
    default:
      match = this.tail.substring(0, index);
      this.tail = this.tail.substring(index);
  }

  this.pos += match.length;

  return match;
};

/**
 * Represents a rendering context by wrapping a view object and
 * maintaining a reference to the parent context.
 */
function Context (view, parentContext) {
  this.view = view;
  this.cache = { '.': this.view };
  this.parent = parentContext;
}

/**
 * Creates a new context using the given view with this context
 * as the parent.
 */
Context.prototype.push = function push (view) {
  return new Context(view, this);
};

/**
 * Returns the value of the given name in this context, traversing
 * up the context hierarchy if the value is absent in this context's view.
 */
Context.prototype.lookup = function lookup (name) {
  var cache = this.cache;

  var value;
  if (cache.hasOwnProperty(name)) {
    value = cache[name];
  } else {
    var context = this, intermediateValue, names, index, lookupHit = false;

    while (context) {
      if (name.indexOf('.') > 0) {
        intermediateValue = context.view;
        names = name.split('.');
        index = 0;

        /**
         * Using the dot notion path in `name`, we descend through the
         * nested objects.
         *
         * To be certain that the lookup has been successful, we have to
         * check if the last object in the path actually has the property
         * we are looking for. We store the result in `lookupHit`.
         *
         * This is specially necessary for when the value has been set to
         * `undefined` and we want to avoid looking up parent contexts.
         *
         * In the case where dot notation is used, we consider the lookup
         * to be successful even if the last "object" in the path is
         * not actually an object but a primitive (e.g., a string, or an
         * integer), because it is sometimes useful to access a property
         * of an autoboxed primitive, such as the length of a string.
         **/
        while (intermediateValue != null && index < names.length) {
          if (index === names.length - 1)
            lookupHit = (
              hasProperty(intermediateValue, names[index])
              || primitiveHasOwnProperty(intermediateValue, names[index])
            );

          intermediateValue = intermediateValue[names[index++]];
        }
      } else {
        intermediateValue = context.view[name];

        /**
         * Only checking against `hasProperty`, which always returns `false` if
         * `context.view` is not an object. Deliberately omitting the check
         * against `primitiveHasOwnProperty` if dot notation is not used.
         *
         * Consider this example:
         * ```
         * Mustache.render("The length of a football field is {{#length}}{{length}}{{/length}}.", {length: "100 yards"})
         * ```
         *
         * If we were to check also against `primitiveHasOwnProperty`, as we do
         * in the dot notation case, then render call would return:
         *
         * "The length of a football field is 9."
         *
         * rather than the expected:
         *
         * "The length of a football field is 100 yards."
         **/
        lookupHit = hasProperty(context.view, name);
      }

      if (lookupHit) {
        value = intermediateValue;
        break;
      }

      context = context.parent;
    }

    cache[name] = value;
  }

  if (isFunction(value))
    value = value.call(this.view);

  return value;
};

/**
 * A Writer knows how to take a stream of tokens and render them to a
 * string, given a context. It also maintains a cache of templates to
 * avoid the need to parse the same template twice.
 */
function Writer () {
  this.templateCache = {
    _cache: {},
    set: function set (key, value) {
      this._cache[key] = value;
    },
    get: function get (key) {
      return this._cache[key];
    },
    clear: function clear () {
      this._cache = {};
    }
  };
}

/**
 * Clears all cached templates in this writer.
 */
Writer.prototype.clearCache = function clearCache () {
  if (typeof this.templateCache !== 'undefined') {
    this.templateCache.clear();
  }
};

/**
 * Parses and caches the given `template` according to the given `tags` or
 * `mustache.tags` if `tags` is omitted,  and returns the array of tokens
 * that is generated from the parse.
 */
Writer.prototype.parse = function parse (template, tags) {
  var cache = this.templateCache;
  var cacheKey = template + ':' + (tags || mustache.tags).join(':');
  var isCacheEnabled = typeof cache !== 'undefined';
  var tokens = isCacheEnabled ? cache.get(cacheKey) : undefined;

  if (tokens == undefined) {
    tokens = parseTemplate(template, tags);
    isCacheEnabled && cache.set(cacheKey, tokens);
  }
  return tokens;
};

/**
 * High-level method that is used to render the given `template` with
 * the given `view`.
 *
 * The optional `partials` argument may be an object that contains the
 * names and templates of partials that are used in the template. It may
 * also be a function that is used to load partial templates on the fly
 * that takes a single argument: the name of the partial.
 *
 * If the optional `config` argument is given here, then it should be an
 * object with a `tags` attribute or an `escape` attribute or both.
 * If an array is passed, then it will be interpreted the same way as
 * a `tags` attribute on a `config` object.
 *
 * The `tags` attribute of a `config` object must be an array with two
 * string values: the opening and closing tags used in the template (e.g.
 * [ "<%", "%>" ]). The default is to mustache.tags.
 *
 * The `escape` attribute of a `config` object must be a function which
 * accepts a string as input and outputs a safely escaped string.
 * If an `escape` function is not provided, then an HTML-safe string
 * escaping function is used as the default.
 */
Writer.prototype.render = function render (template, view, partials, config) {
  var tags = this.getConfigTags(config);
  var tokens = this.parse(template, tags);
  var context = (view instanceof Context) ? view : new Context(view, undefined);
  return this.renderTokens(tokens, context, partials, template, config);
};

/**
 * Low-level method that renders the given array of `tokens` using
 * the given `context` and `partials`.
 *
 * Note: The `originalTemplate` is only ever used to extract the portion
 * of the original template that was contained in a higher-order section.
 * If the template doesn't use higher-order sections, this argument may
 * be omitted.
 */
Writer.prototype.renderTokens = function renderTokens (tokens, context, partials, originalTemplate, config) {
  var buffer = '';

  var token, symbol, value;
  for (var i = 0, numTokens = tokens.length; i < numTokens; ++i) {
    value = undefined;
    token = tokens[i];
    symbol = token[0];

    if (symbol === '#') value = this.renderSection(token, context, partials, originalTemplate, config);
    else if (symbol === '^') value = this.renderInverted(token, context, partials, originalTemplate, config);
    else if (symbol === '>') value = this.renderPartial(token, context, partials, config);
    else if (symbol === '&') value = this.unescapedValue(token, context);
    else if (symbol === 'name') value = this.escapedValue(token, context, config);
    else if (symbol === 'text') value = this.rawValue(token);

    if (value !== undefined)
      buffer += value;
  }

  return buffer;
};

Writer.prototype.renderSection = function renderSection (token, context, partials, originalTemplate, config) {
  var self = this;
  var buffer = '';
  var value = context.lookup(token[1]);

  // This function is used to render an arbitrary template
  // in the current context by higher-order sections.
  function subRender (template) {
    return self.render(template, context, partials, config);
  }

  if (!value) return;

  if (isArray(value)) {
    for (var j = 0, valueLength = value.length; j < valueLength; ++j) {
      buffer += this.renderTokens(token[4], context.push(value[j]), partials, originalTemplate, config);
    }
  } else if (typeof value === 'object' || typeof value === 'string' || typeof value === 'number') {
    buffer += this.renderTokens(token[4], context.push(value), partials, originalTemplate, config);
  } else if (isFunction(value)) {
    if (typeof originalTemplate !== 'string')
      throw new Error('Cannot use higher-order sections without the original template');

    // Extract the portion of the original template that the section contains.
    value = value.call(context.view, originalTemplate.slice(token[3], token[5]), subRender);

    if (value != null)
      buffer += value;
  } else {
    buffer += this.renderTokens(token[4], context, partials, originalTemplate, config);
  }
  return buffer;
};

Writer.prototype.renderInverted = function renderInverted (token, context, partials, originalTemplate, config) {
  var value = context.lookup(token[1]);

  // Use JavaScript's definition of falsy. Include empty arrays.
  // See https://github.com/janl/mustache.js/issues/186
  if (!value || (isArray(value) && value.length === 0))
    return this.renderTokens(token[4], context, partials, originalTemplate, config);
};

Writer.prototype.indentPartial = function indentPartial (partial, indentation, lineHasNonSpace) {
  var filteredIndentation = indentation.replace(/[^ \t]/g, '');
  var partialByNl = partial.split('\n');
  for (var i = 0; i < partialByNl.length; i++) {
    if (partialByNl[i].length && (i > 0 || !lineHasNonSpace)) {
      partialByNl[i] = filteredIndentation + partialByNl[i];
    }
  }
  return partialByNl.join('\n');
};

Writer.prototype.renderPartial = function renderPartial (token, context, partials, config) {
  if (!partials) return;
  var tags = this.getConfigTags(config);

  var value = isFunction(partials) ? partials(token[1]) : partials[token[1]];
  if (value != null) {
    var lineHasNonSpace = token[6];
    var tagIndex = token[5];
    var indentation = token[4];
    var indentedValue = value;
    if (tagIndex == 0 && indentation) {
      indentedValue = this.indentPartial(value, indentation, lineHasNonSpace);
    }
    var tokens = this.parse(indentedValue, tags);
    return this.renderTokens(tokens, context, partials, indentedValue, config);
  }
};

Writer.prototype.unescapedValue = function unescapedValue (token, context) {
  var value = context.lookup(token[1]);
  if (value != null)
    return value;
};

Writer.prototype.escapedValue = function escapedValue (token, context, config) {
  var escape = this.getConfigEscape(config) || mustache.escape;
  var value = context.lookup(token[1]);
  if (value != null)
    return (typeof value === 'number' && escape === mustache.escape) ? String(value) : escape(value);
};

Writer.prototype.rawValue = function rawValue (token) {
  return token[1];
};

Writer.prototype.getConfigTags = function getConfigTags (config) {
  if (isArray(config)) {
    return config;
  }
  else if (config && typeof config === 'object') {
    return config.tags;
  }
  else {
    return undefined;
  }
};

Writer.prototype.getConfigEscape = function getConfigEscape (config) {
  if (config && typeof config === 'object' && !isArray(config)) {
    return config.escape;
  }
  else {
    return undefined;
  }
};

var mustache = {
  name: 'mustache.js',
  version: '4.2.0',
  tags: [ '{{', '}}' ],
  clearCache: undefined,
  escape: undefined,
  parse: undefined,
  render: undefined,
  Scanner: undefined,
  Context: undefined,
  Writer: undefined,
  /**
   * Allows a user to override the default caching strategy, by providing an
   * object with set, get and clear methods. This can also be used to disable
   * the cache by setting it to the literal `undefined`.
   */
  set templateCache (cache) {
    defaultWriter.templateCache = cache;
  },
  /**
   * Gets the default or overridden caching object from the default writer.
   */
  get templateCache () {
    return defaultWriter.templateCache;
  }
};

// All high-level mustache.* functions use this writer.
var defaultWriter = new Writer();

/**
 * Clears all cached templates in the default writer.
 */
mustache.clearCache = function clearCache () {
  return defaultWriter.clearCache();
};

/**
 * Parses and caches the given template in the default writer and returns the
 * array of tokens it contains. Doing this ahead of time avoids the need to
 * parse templates on the fly as they are rendered.
 */
mustache.parse = function parse (template, tags) {
  return defaultWriter.parse(template, tags);
};

/**
 * Renders the `template` with the given `view`, `partials`, and `config`
 * using the default writer.
 */
mustache.render = function render (template, view, partials, config) {
  if (typeof template !== 'string') {
    throw new TypeError('Invalid template! Template should be a "string" ' +
                        'but "' + typeStr(template) + '" was given as the first ' +
                        'argument for mustache#render(template, view, partials)');
  }

  return defaultWriter.render(template, view, partials, config);
};

// Export the escaping function so that the user may override it.
// See https://github.com/janl/mustache.js/issues/244
mustache.escape = escapeHtml;

// Export these mainly for testing, but also for advanced usage.
mustache.Scanner = Scanner;
mustache.Context = Context;
mustache.Writer = Writer;

const Mustache = mustache;
// ╔══ module: src/utils/index.js ══════════════════════════════════════════

// render() delegates to the vendored mustache interpreter. DISABLE html-escaping at load time —
// our prompts carry `<<…>>`, `&`, and raw markup that must pass through verbatim (the old
// hand-rolled render never escaped). Mustache must not introduce any non-deterministic global.
Mustache.escape = (t) => t

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — stateless transforms + the file/markdown renderers.
// ─────────────────────────────────────────────────────────────────────────────
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const lab = s => norm(s).replace(/ /g, '-').slice(0, 24)
const padIdx = n => String(n).padStart(2, '0')
const lastScore = r => r.scoreHistory.length ? r.scoreHistory[r.scoreHistory.length - 1].score : null
// one-line render of an open store entry for the brainer / sentinel: `#id [last score or "new"] keyword — why`
const openLine = r => '#' + r.id + ' [' + (r.scoreHistory.length ? r.scoreHistory[r.scoreHistory.length - 1].score : 'new') + '] ' + r.keyword + ' — ' + r.why

// plain() — render a value as compact PLAIN TEXT for interpolation INTO an agent prompt (replaces JSON.stringify-in-prompts: less noise, no
// braces/quotes). string/number/boolean → as-is; array → one "- el" line each (recursing, nested indented two spaces); object → "key: value"
// per key, SKIPPING any key whose value is null/undefined/''/[]/{} unless opts.keep names it (those render "key: (none)"); nested indent two spaces.
const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
function plain(value, opts) {
  opts = opts || {}
  const keep = opts.keep || []
  if (value == null) return ''
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(el => plain(el, opts).split('\n').map((l, i) => (i === 0 ? '- ' : '  ') + l).join('\n')).join('\n')
  }
  const lines = []
  for (const k of Object.keys(value)) {
    const v = value[k]
    if (isEmpty(v)) { if (keep.includes(k)) lines.push(k + ': (none)'); continue }
    if (typeof v === 'object') {
      lines.push(k + ':')
      for (const ln of plain(v, opts).split('\n')) lines.push('  ' + ln)
    } else {
      lines.push(k + ': ' + String(v))
    }
  }
  return lines.join('\n')
}

// the HIDDEN lane cap: the brainer is never told a count — JS clamps to laneCount (5 in auto) here.
const laneCount = CONFIG.parallelLaneResearchAgentsPerWave === 'auto' ? 5 : CONFIG.parallelLaneResearchAgentsPerWave
const trailOf = (path, keyword) => [CONFIG.query.length > 60 ? CONFIG.query.slice(0, 57) + '…' : CONFIG.query].concat(path || [], keyword ? [keyword] : []).join('  →  ')

// PROMPT_LOG — the exact prompt sent for EVERY agent call, keyed by label (always populated, not just in debug). The numbered phase files
// prepend their own prompt (Change E): the prompt lives in the phase file, not a separate _io.md.
const PROMPT_LOG = {}
// CHANGE E — prepend the exact prompt sent for `label` ahead of a numbered phase file's body. result.md stays clean (never wrapped).
const withPrompt = (label, body) => (PROMPT_LOG[label] ? '## Prompt sent\n\n' + PROMPT_LOG[label] + '\n\n---\n\n' : '') + body

// render — fill a `.prompt.md` template's `{{placeholder}}` holes from a vars object via the
// vendored mustache engine. Strips ONE trailing template newline (editors add one; the original
// inline templates carried none) BEFORE rendering; mustache leaves an absent key as ''. Standalone
// `{{! … }}` comment lines in a template are stripped whole (line + newline), so they're invisible.
const render = (tpl, vars) => Mustache.render(tpl.replace(/\n$/, ''), vars)

// markdown render of a wave's resultSoFar (the brainer's living memory) — this IS the kept per-wave log.
const bullets = arr => (arr && arr.length) ? arr.map(x => '- ' + x).join('\n') : '_none_'
function resultSoFarMd(r) {
  if (!r || typeof r !== 'object') return '_none_'
  const ev = (r.evidence || []).map(e => '- [' + (e.status || '?') + '] **' + (e.fact || '') + ':** ' + (e.value || '') + (e.source ? ' — ' + e.source : '')).join('\n')
  return '**Answer:** ' + (r.answer || '_(none)_') + '\n\n**Confidence:** ' + (r.confidence || '_(none)_') +
    (r.working ? '\n\n**Working:**\n\n' + r.working : '') +
    '\n\n**Evidence:**\n' + (ev || '_none_') +
    '\n\n**Resolved:**\n' + bullets(r.resolved) +
    '\n\n**Open gaps:**\n' + bullets(r.openGaps) +
    '\n\n**Tensions:**\n' + bullets(r.tensions)
}

// per-wave brainer markdown (one file per crawl wave). `store` = the open rabbit-hole store snapshot at write time.
function waveMd(wave, coord, picks, finds, store) {
  const sc = p => (p.score != null ? p.score : 'new')
  return '# Wave ' + wave + ' — Brainer\n\n**done:** ' + coord.stop.done + ' — ' + coord.stop.reason +
    '\n\n## Result so far\n\n' + resultSoFarMd(coord.resultSoFar) +
    (finds.length ? '\n\n## Findings pursued this wave\n\n' + finds.map(f => '### ' + f.rabbitHole + '\n\n_trail: ' + (f.trail || '') + '_\n\n' + f.summary).join('\n\n') : '') +
    '\n\n## Looking up next (' + picks.length + ')\n\n' + (picks.map((p, i) => (i + 1) + '. **[' + sc(p) + ']** #' + p.id + ' ' + p.keyword + '\n   - trail: ' + trailOf(p.path) + (p.sources && p.sources.length ? '\n   - venues: ' + p.sources.join(', ') : '') + '\n   - ' + p.why).join('\n') || '_none_') +
    '\n\n## Open rabbit-holes (scored)\n\n' + ([...store].sort((a, b) => (lastScore(b) ?? -1) - (lastScore(a) ?? -1)).map(r => '- **[' + (lastScore(r) != null ? lastScore(r) : 'new') + ']** #' + r.id + ' ' + r.keyword).join('\n') || '_none_') + '\n'
}
// ╔══ module: src/prompts.js ══════════════════════════════════════════════
const SCOUT_TPL = "{{! scout — one broad sweep that maps the web landscape and seeds the first rabbit-holes }}\nScout the web landscape for: \"{{query}}\". {{net}}\nStep 1 — run ONE broad WebSearch to map the landscape and collect candidate sources (URLs).\nStep 2 — pick the up-to-5 most relevant sources and WebFetch each. In every WebFetch prompt, first ask \"What are the key facts on this page about: {{query}}?\", then append this exact instruction: <<{{footer}}>>\nStep 3 — return: landscape (one paragraph); pages[] (each: url, 2-3 sentence summary, rabbitHoles[] copied from the page's \"Rabbit holes\" section as {keyword, why}); deadEnds[] for any source that timed out, was parked, or was off-topic — do not invent rabbit-holes for those. If every source is dead/unreachable, still return a valid result (landscape from your search, pages [], the dead sources in deadEnds) — never fail to return.\n"
const PROSPECTOR_TPL = "{{! prospector — names the high-value authoritative source venues for the topic }}\nGoal: \"{{query}}\". Scout landscape: {{landscape}}\nSources the scout already opened:\n{{sources}}\nName the 6-8 highest-value, authoritative source venues for THIS goal — where primary, expert, or rigorous information on the topic actually lives. The right set is domain-specific (GPU serving → arXiv/USENIX/MLSys/SemiAnalysis/r/LocalLLaMA; a stock → SEC EDGAR/earnings calls/Bloomberg; weather → NOAA/ECMWF).\nSpan what is relevant here: primary research (papers/preprints + where they live for this field), official docs, standards bodies/regulators, authoritative datasets/benchmarks, deep practitioner/industry analysis, high-signal community venues. Exclude generic SEO blogs.\nFor each: source (venue + how to reach/search it, e.g. \"arXiv (site:arxiv.org)\") and goodFor (the sub-questions it is best for — specific enough for the downstream brainer to match each research lane to the right venue).\nRun WebSearch (one or more queries) to discover and verify the actual highest-value venues for THIS topic — confirm each exists and is authoritative (memory alone misses recent venues). Return highValueSources (6-8) and a brief reasoning naming what you searched.{{WEB_ONLY}}\n"
const BRAINER_TPL = "{{! brainer — the brain: scores and steers rabbit-holes, keeps resultSoFar, decides done }}\nYou are the BRAINER — you make every decision in this research run and set its direction.\n\nHow the run works: a scout seeded the first rabbit-holes and a prospector named the source venues; then you drive each wave. You hand rabbit-holes to parallel lane-researchers — fast workers that WebSearch + WebFetch the venues you assign, read the pages, and return findings + new rabbit-holes — then you update the running result, steer the next wave, and decide when to stop. On stop, a refinement stage adversarially checks your findings and writes the report.\n\nThe engine keeps the OPEN rabbit-holes as an id-keyed store and carries each one's score history natively — you NEVER re-emit the whole set. You return DELTAS against it.\n\nDirection is two powers:\n• LOOK UP rabbit-holes already in the store (by id) to research next.\n• ORIGINATE — when the answer needs an angle, candidate, or sub-question no stored rabbit-hole covers, add it as a new directive {keyword, why, score} and a researcher will go collect it. Name a gap you can see rather than wait for one to surface; summon a candidate the scout missed — not padding. Put it in `lookupNext` to pursue NOW, or in `add` to PARK it for a later wave.\n\n{{probeClause}}\n\nWave {{wave}}. Query: \"{{query}}\". {{rubric}}\nScout landscape: {{landscape}}\nRABBIT-HOLE STORE — open leads (`#id [last score or \"new\"] keyword — why`); re-score up or down, a low one can resurrect, every \"new\" lead you MUST score:\n{{open}}\nALREADY PURSUED — do not look up or re-originate these (research history):\n{{pursuedList}}\nFindings this wave (from the researchers' page-reading):\n{{findings}}{{trajectory}}{{venuesClause}}{{sourcesClause}}\n\n{{memoryClause}}\nUpdate and RETURN `resultSoFar` as the run's memory: refine `answer`; APPEND load-bearing `evidence` only (each {fact, value, source, status: settled|tentative|contested} — facts the answer rests on, NOT a transcript); move closed parts into `resolved`; keep `openGaps` current; record any `tensions` (conflicting sources); for build-the-answer / estimate questions grow the `working` derivation chain (else ''); set `confidence`.{{computeField}}\n\nThen return DELTAS against the store:\n(1) `rescore`: [{id, score}] — ONLY the leads whose 0-100 score CHANGES this wave (score every \"new\" lead at least once); unlisted leads keep their last score. Score honestly per the rubric; a marginal lead scores low.\n(2) `add`: [{keyword, why, score}] — NEW leads to PARK in the store for a later wave (the engine assigns each an id).\n(3) `lookupNext`: the leads to research NOW — each EITHER {id} (a stored lead) OR {keyword, why, score{{scoreFields}}} (a lead you originate AND pursue now). NONE may be already pursued.{{assignClause}}\n(4) `rename`: [{id, keyword, why?}] — relabel a lead, keeping its id + history (optional).\n(5) `drop`: [id, …] — eliminate a dead/duplicate lead; a MERGE = drop the duplicate AND rescore the survivor (optional).\n(6) `stop`: {done, reason}. {{stop}}{{goalClause}}{{FINISH}}\n"
const SENTINEL_TPL = "{{! sentinel — goal-mode guard that contests a premature done and can force one more wave }}\nThe brainer just declared the crawl DONE for: \"{{query}}\". Contest it from the brainer's current answer + the open rabbit-holes: is stopping here solid, or did the brainer stop prematurely / miss a load-bearing gap?\nBrainer's result so far (its current answer + evidence + open gaps):\n{{resultSoFar}}\nReason it called done: {{reason}}\nPer-wave log (what each wave pursued + where the answer stood):\n{{waveLog}}\nOpen rabbit-holes not yet pursued (`#id [score] keyword — why`):\n{{rabbitHoles}}\nAlready pursued — do not propose any of these:\n{{pursuedList}}\nHIGH BAR: uphold the brainer (solid=true) unless a load-bearing gap would materially change or undermine the answer — \"more detail is possible\" is not a reason to continue.\nIf not solid: solid=false plus rabbitHoles (1-3 high-priority gap searches not already pursued, injected at the top of the store for the lane researchers). If solid: solid=true, empty rabbitHoles.\nReturn solid (bool), reasoning, rabbitHoles.{{FINISH}}\n"
const RESEARCHER_TPL = "{{! researcher — a lane researcher pursuing ONE rabbit-hole over its assigned venues }}\nPursue ONE rabbit-hole. {{net}}\nTOP GOAL: \"{{query}}\".\nTRAIL that led here (top goal → … → this rabbit-hole): {{trail}}.\nNow investigating: \"{{keyword}}\" (why it matters: {{why}}). Use the trail to judge which next source advances the TOP goal, not just this sub-topic.{{venuesClause}}\nRun a targeted WebSearch, pick the best {{srcCount}} sources, and WebFetch each in parallel. In each WebFetch prompt, first ask the key question about this rabbit-hole, then append: <<{{footer}}>>\nIf a source is dead, parked, or returns nothing (e.g. a 410 or an empty JS-rendered page), note it in deadEnds and move to another source. If EVERY source is dead, that is still a valid result: return summary noting the dead ends, rabbitHoles [], and the dead sources in deadEnds — never fail to return.\nIf a fetched source turns out OFF-GOAL — it does not advance the TOP goal even if it sits on the sub-topic — do not discard it and do not stop: open one or more ADDITIONAL sources to reach goal-aligned data, and return BOTH the off-goal find and the new ones. You MAY exceed the {{srcCount}}-source count for this — gather it and let the brainer decide relevance.\nReturn: summary (2-4 sentences of what you found); rabbitHoles (new rabbit-holes from the footer, {keyword, why}); deadEnds.\n"
const INITIATOR_TPL = "{{! initiator — plans the finalize pipeline, shaping the finish to this query }}\nYou direct the FINALIZE phase for: \"{{query}}\". The research is done; below is everything it gathered. Shape the finishing pipeline to fit THIS query, then return the plan.\nThe finish has three stages, and you set how each runs:\n1. REFINEMENT (always) — one refine agent per fact adversarially fact-checks each load-bearing fact and returns its corrected, hardened claim. You name WHICH facts to harden.\n{{computementStage}}\n3. AGGREGATION (always) — writes the final report from the hardened facts (and the derivation, if any). You give it a focus note.\nThe run's accumulated RESULT (the brainer's living memory — answer, the `working` derivation, evidence, gaps, tensions):\n{{resultSoFar}}\nPer-wave log:\n{{waveLog}}\nScout landscape: {{landscape}}\nTop open rabbit-holes left unpursued:\n{{openRabbitHoles}}\nReturn:\n- refinement.facts[] — the load-bearing facts to harden (each {fact, why}); NO cap, name every fact that would change the answer if wrong, skip soft restatements.\n{{computementReturn}}\n- aggregator.focus — one note on what the report must emphasize / the shape the answer should take.{{FINISH}}\n"
const REFINE_TPL = "{{! refine — adversarially fact-check ONE load-bearing fact and return its corrected, hardened version }}\nFact-check and HARDEN this load-bearing fact for the goal \"{{query}}\". {{net}}\nFact: {{fact}}\nWhy it is load-bearing: {{why}}\nFirst verify it adversarially: hunt counter-evidence, newer information, and the REAL numbers — actively look for where it is false, outdated, or imprecise. Do not rubber-stamp a well-supported fact; do not manufacture doubt about one you cannot actually break. Then settle every doubt against the sources and return ONLY the clean, corrected claim(s) — the right values, current and verified, dropping anything that does not hold. Cite sources inline.\nReturn report (markdown): the clean / corrected claim(s) for this fact, hardened against the sources.{{WEB_ONLY}}\n"
const COMPUTE_TPL = "{{! compute — derives the answer by writing and running code, propagating error bars }}\nYou are a COMPUTE stage for: \"{{query}}\". DERIVE the answer — do the actual calculation rather than restating facts.\nThis stage's goal: {{goal}}\nFacts to compute from (the load-bearing facts the answer rests on — use these as the input numbers):\n{{hardenedFacts}}\nThe run's accumulated RESULT (the answer + the brainer's half-built `working` derivation to finish):\n{{resultSoFar}}{{priorClause}}\nCarry the derivation out with rigor:\n- FIRST fact-check your input numbers: verify each against a current primary source (WebSearch / WebFetch) and correct any that is stale, wrong, or imprecise before computing — a derivation is only as sound as its inputs;\n- assemble the verified input numbers, with their units;\n- when the calculation is non-trivial (unit conversions, a nearest-neighbor distance, Monte-Carlo error propagation), WRITE AND RUN actual code — load Bash + Write via ToolSearch if absent, run python or node — rather than doing arithmetic in your head; compute, do not estimate;\n- propagate the input uncertainties into an explicit ± error range;\n- then adversarially CHECK your own work: re-derive a second way or sanity-check against an anchor, and correct any unit / formula / arithmetic slip before reporting.\nReturn: value (the headline computed quantity, with units + error range); result (markdown: the inputs, the steps, the numbers, the self-check); script (the exact code you wrote AND ran, \"\" if none) with scriptLang; assumptions[]. Always finish by emitting the complete StructuredOutput with every required field — never stop after a partial object.\n"
const AGGREGATOR_TPL = "{{! aggregator — writes the final multi-section cited report }}\nWrite the final research report (mode={{mode}}) for: \"{{query}}\".{{focusClause}}\nWork from: the run's accumulated RESULT (the brainer's living memory — answer, working derivation, evidence, resolved, open gaps, tensions), the HARDENED facts (each adversarially fact-checked + source-corrected){{computeMention1}}, not raw findings.\nLean on the hardened facts as the source of truth: drop anything they leave unsupported and use the corrected value wherever they revised one.{{computeMention2}} Cite sources inline where they matter.\nScout landscape: {{landscape}}\nRun result so far (the answer as it ended + its evidence):\n{{resultSoFar}}\nPer-wave log (what each wave pursued + where the answer stood — for the §2 narrative):\n{{waveLog}}\nHardened facts (the corrected claims):\n{{cleanReports}}{{computeDerivation}}\nTop remaining open rabbit-holes (for Open questions):\n{{openRabbitHoles}}\nWrite `report` as markdown with exactly these sections in order: (1) Prompt — the goal; (2) Research waves — per wave: what was pursued and how the answer sharpened (from the per-wave log); (3) Scout landscape; (4) Findings — the synthesized answer, {{computeLeading}}weaving each hardened fact in with its corrected value; (5) Verdict + overall confidence; (6) Plan — concrete operator actions; (7) Open questions. Also return verdict (1-3 sentences), confidence, plan (array of action strings), openQuestions (array).{{FINISH}}\n"
const DEBUG_TPL = "{{! debug — aggregates metrics, run log, and raw agent I/O into one debug report }}\nAggregate and analyze this RR run's diagnostics for an engineer debugging the pipeline. Goal: \"{{query}}\".\nWalk it phase by phase — scout → prospector → each research wave → sentinel → finalize (initiate → refine → compute → aggregate) — reporting what happened at each with the actual numbers, plus anomalies, degraded/failed agents, or wasted effort to fix.\nProspector→researcher utilization (run this check): the prospector named these venues:\n{{highValueSources}}\nEach lane in laneRecords carries the `assignedVenues` the brainer gave it; from that lane's summary + rabbitHoles, judge whether the researcher actually drew on those venues. Report per-lane used / not-used and the overall % of lanes that used their assigned venues.{{focusClause}}\nMetrics:\n{{metrics}}\nLane records (wave, keyword, assignedVenues, summary, rabbitHoles):\n{{laneRecords}}\nPer-wave log:\n{{waveLog}}\nSentinel log:\n{{sentinelLog}}\nPer-wave result-so-far log (the brainer's running memory each wave):\n{{resultLog}}\nReturn diagnosis (markdown).{{FINISH}}\n"
// ─────────────────────────────────────────────────────────────────────────────
// Prompt library — every prompt the pipeline sends to an agent. The STATIC text
// lives in the `prompts/*.prompt.md` templates ({{placeholder}} holes); each builder
// computes the dynamic pieces (incl. each conditional clause to the exact string the
// original `${…}` produced) and renders the template. Output is byte-identical to the
// original inline backtick templates (proven by test/equivalence.mjs).
// ─────────────────────────────────────────────────────────────────────────────

// Guard clauses appended to agent prompts. FINISH: the pure reducers (brainer, sentinel, initiator,
// aggregator) already hold the data they need — they MAY use a tool if it genuinely helps, but the hard rule is
// they FINISH: emit the COMPLETE StructuredOutput rather than getting lost (the wave-0 brainer once spent its whole
// turn reading this repo's own files on a self-referential query and never emitted resultSoFar/lookupNext/stop).
// WEB_ONLY: the refine pass checks claims on the web — the local repo code is never evidence.
const FINISH = `
The data above is enough to decide — work from it. You MAY consult a tool if it genuinely helps, but keep it brief and don't get lost; the answer does not require it. Your one required action is to return the StructuredOutput with EVERY required field present — never stop after a partial object.`
const WEB_ONLY = `
Use the WEB only (WebSearch/WebFetch) to check sources — never read local files or this repository's own code; they are not evidence.`

const SCOUT_PROMPT = ({ query, net, footer }) => render(SCOUT_TPL, { query, net, footer })

const PROSPECTOR_PROMPT = ({ query, landscape, sources }) =>
  render(PROSPECTOR_TPL, { query, landscape, sources: plain(sources), WEB_ONLY })

const BRAINER_PROMPT = ({ wave, query, rubric, landscape, pursuedList, open, findings, topScores, resultSoFar, assignSources, stop, mode, venues, compute }) => {
  const trajectory = topScores.length
    ? `
TOP-PICK SCORE TRAJECTORY by wave (calibrated 0-100): ${plain(topScores)}
A steadily declining trajectory means high-value rabbit-holes are drying up — read it as convergence.`
    : ''
  const goalClause = mode === 'goal'
    ? `
Goal mode: if the goal is already well answered AND the best remaining rabbit-hole adds only marginal value (a declining trajectory is strong evidence), set stop.done=true rather than chase diminishing returns.`
    : ''
  const venuesClause = (venues && venues.length)
    ? `
SOURCE VENUES (from the prospector) — give each lookupNext pick the subset whose source fits its lane, in its \`sources\`, so its researcher searches the right places first:
${plain(venues)}`
    : ''
  const sourcesClause = assignSources
    ? `
For each lookupNext pick, also set \`sourceCount\`: how many sources its researcher should fetch, sized to what that lane needs.`
    : ''
  const memoryClause = wave === 0
    ? `RESULT SO FAR — the run's living MEMORY. Start it this wave: capture the answer as it stands plus the load-bearing evidence behind it.`
    : `RESULT SO FAR — the run's living MEMORY, carried wave to wave. Prior version:
${plain(resultSoFar)}`
  const probeClause = `Before you decide, hunt for coverage GAPS — a candidate, sub-question, or angle the goal needs that no lane has touched — and probe them YOURSELF with WebSearch / WebFetch (as many as you need) to fill them; fold what you find into resultSoFar and ORIGINATE the missing leads into \`lookupNext\`. Beyond gap-filling, leave the heavy digging to the lane-researchers.`
  const scoreFields = assignSources ? ', sources, sourceCount' : ', sources'
  const assignClause = (venues && venues.length) ? ' Assign each its `sources` venue subset.' : ''
  const computeField = compute ? `

COMPUTE TO STEER: when a calculation would change your next move — a number the answer is being built toward, or an estimate of which gap matters most — derive it YOURSELF this wave (reason it out, or write and run a short Python/Node script when the arithmetic needs it) and fold the result into \`working\`. Keep it light; you are steering, not writing the final derivation.` : ''
  return render(BRAINER_TPL, {
    probeClause, wave, query, rubric, landscape,
    open: plain(open), pursuedList: plain(pursuedList), findings: plain(findings),
    trajectory, venuesClause, sourcesClause, memoryClause,
    scoreFields, assignClause, stop, goalClause, computeField, FINISH,
  })
}

const SENTINEL_PROMPT = ({ query, resultSoFar, reason, waveLog, rabbitHoles, pursuedList }) =>
  render(SENTINEL_TPL, {
    query, resultSoFar: plain(resultSoFar), reason: plain(reason), waveLog: plain(waveLog),
    rabbitHoles: plain(rabbitHoles), pursuedList: plain(pursuedList), FINISH,
  })

const RESEARCHER_PROMPT = ({ net, query, trail, keyword, why, footer, venues, parallelSourcesPerLaneResearchAgent }) => {
  const venuesClause = venues && venues.length ? `
Search these high-value venues for this lane first: ${venues.map(v => v.goodFor ? v.source + ' (' + v.goodFor + ')' : v.source).join('; ')}.` : ''
  return render(RESEARCHER_TPL, { net, query, trail, keyword, why, venuesClause, srcCount: parallelSourcesPerLaneResearchAgent, footer })
}

const INITIATOR_PROMPT = ({ query, resultSoFar, waveLog, landscape, openRabbitHoles, compute }) => {
  const computementStage = compute
    ? `2. COMPUTEMENT (only when the answer must be BUILT) — a sequential chain of agents that DERIVE the answer: they assemble the hardened facts, do the actual arithmetic (writing + running code when it helps), and propagate uncertainty into error bars. Turn this ON only when the answer is a quantitative estimate or a synthesis no single source holds (e.g. "estimate the distance to the nearest undetected black hole, with error bars"); turn it OFF for a found fact, a decision, or an inventory.`
    : `2. COMPUTEMENT — OFF for this run (launched with compute disabled); it will not run regardless of what you return here.`
  const computementReturn = compute
    ? `- computement.run + computement.stages[] — run true ONLY when the answer must be derived; stages = the ordered derivation steps (each ONE line of what to compute), [] when run is false. The last stage MAY sanity-check the derived answer.`
    : `- computement — return {run: false, stages: []} (computement is OFF for this run).`
  return render(INITIATOR_TPL, {
    query, resultSoFar: plain(resultSoFar), waveLog: plain(waveLog), landscape, openRabbitHoles: plain(openRabbitHoles), computementStage, computementReturn, FINISH,
  })
}

const REFINE_PROMPT = ({ net, query, fact, why }) => render(REFINE_TPL, { net, query, fact, why, WEB_ONLY })

const COMPUTE_PROMPT = ({ query, goal, resultSoFar, hardenedFacts, priorStages }) => {
  const priorClause = priorStages && priorStages.length ? `
Outputs of the prior compute stages (build on these):
${plain(priorStages)}` : ''
  return render(COMPUTE_TPL, { query, goal, hardenedFacts: plain(hardenedFacts), resultSoFar: plain(resultSoFar), priorClause })
}

const AGGREGATOR_PROMPT = ({ mode, query, landscape, resultSoFar, waveLog, cleanReports, computeResults, focus, openRabbitHoles }) => {
  const hasCompute = computeResults && computeResults.length
  const focusClause = focus ? `
Emphasis from the finalize director: ${focus}` : ''
  const computeMention1 = hasCompute ? ', and the COMPUTED derivation (the actual calculated answer with error bars)' : ''
  const computeMention2 = hasCompute ? ' Present the computed answer verbatim — do not re-derive or second-guess it.' : ''
  const computeDerivation = hasCompute ? `
Computed derivation (the calculated answer — present this as the quantitative result):
${plain(computeResults)}` : ''
  const computeLeading = hasCompute ? 'LEADING with the computed quantitative result + its error bars and showing the derivation, then ' : ''
  return render(AGGREGATOR_TPL, {
    mode, query, focusClause, computeMention1, computeMention2,
    landscape, resultSoFar: plain(resultSoFar), waveLog: plain(waveLog), cleanReports: plain(cleanReports),
    computeDerivation, openRabbitHoles: plain(openRabbitHoles), computeLeading, FINISH,
  })
}

const DEBUG_PROMPT = ({ query, focus, metrics, waveLog, sentinelLog, resultLog, highValueSources, laneRecords }) => {
  const focusClause = focus ? `
Then answer this run-specific question directly: ${focus}` : ''
  return render(DEBUG_TPL, {
    query, highValueSources: plain(highValueSources), focusClause, metrics: plain(metrics),
    laneRecords: plain(laneRecords), waveLog: plain(waveLog), sentinelLog: plain(sentinelLog), resultLog: plain(resultLog), FINISH,
  })
}
// ╔══ module: src/store.js ════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Store reducers — pure functions over a `state` object that carries the crawl's
// rabbit-hole store (rabbitHoles, nextId, pursuedKeys, pursuedList, pursuedArchive).
// In the original these were methods on ResearchReport; here `state` is the first
// arg (the engine passes `this`). Logic is identical.
// ─────────────────────────────────────────────────────────────────────────────

// add-or-find an OPEN rabbit-hole. Dedup by norm(keyword) against the open store AND the pursued set; returns the existing/new entry, or
// null when the keyword is already pursued (never re-open a pursued lane). New entries get a fresh id; scoreHistory seeded only when a score is given.
function addRabbitHole(state, { keyword, why, path, score, wave }) {
  const k = norm(keyword)
  if (!k || state.pursuedKeys.has(k)) return null
  const existing = state.rabbitHoles.find(r => norm(r.keyword) === k)
  if (existing) return existing
  const scored = typeof score === 'number'
  const rh = { id: state.nextId++, keyword, why: why || '', score: scored ? score : null, scoreHistory: scored ? [{ wave, score }] : [], path: path || [] }
  state.rabbitHoles.push(rh)
  return rh
}

// apply the brainer's DELTAS to the open store, in order: rename → drop → rescore → add. scoreHistory carried natively by id (no reconcile).
function applyDeltas(state, coord, wave) {
  for (const r of (coord.rename || [])) {
    const rh = state.rabbitHoles.find(x => x.id === r.id)
    if (rh) { rh.keyword = r.keyword; if (r.why) rh.why = r.why }
  }
  if (coord.drop && coord.drop.length) {
    const gone = new Set(coord.drop)
    state.rabbitHoles = state.rabbitHoles.filter(x => !gone.has(x.id))
  }
  for (const r of (coord.rescore || [])) {
    const rh = state.rabbitHoles.find(x => x.id === r.id)
    if (rh) { rh.score = r.score; rh.scoreHistory.push({ wave, score: r.score }) }
  }
  for (const a of (coord.add || [])) addRabbitHole(state, { keyword: a.keyword, why: a.why, path: [], score: a.score, wave })
}

// resolve the brainer's `lookupNext` into open-store entries to pursue NOW: id → existing lead; keyword → originate (or find). Drop any
// already pursued, attach the lane's assigned venues, dedup, then take the highest-scoring up to laneCount (the hard ceiling).
function resolveLookupNext(state, coord, wave, laneCount) {
  const picks = []
  for (const item of (coord.lookupNext || [])) {
    let rh = null
    if (typeof item.id === 'number') rh = state.rabbitHoles.find(x => x.id === item.id)
    else if (item.keyword) rh = addRabbitHole(state, { keyword: item.keyword, why: item.why, path: [], score: item.score, wave })
    if (!rh || state.pursuedKeys.has(norm(rh.keyword))) continue
    if (item.sources) rh.sources = item.sources
    if (typeof item.sourceCount === 'number') rh.sourceCount = item.sourceCount
    if (!picks.some(p => p.id === rh.id)) picks.push(rh)
  }
  return picks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, laneCount)
}

// PURSUE — MOVE picks out of the open store into the pursued-archive (no delete-on-pursue): the archive keeps each lead's id + scoreHistory + path.
function pursue(state, picks) {
  for (const p of picks) {
    state.pursuedKeys.add(norm(p.keyword))
    state.pursuedList.push(p.keyword)
    state.pursuedArchive.push(p)
  }
  const gone = new Set(picks.map(p => p.id))
  state.rabbitHoles = state.rabbitHoles.filter(r => !gone.has(r.id))
}
// ╔══ module: src/engine.js ═══════════════════════════════════════════════

// L7 retry indirection — wraps every agent() call; the _agent alias keeps it from rewriting itself.
const _agent = agent
// Debug capture (opt-in via arg.debug): the raw agent I/O + the full run-log stream, consumed by the end Debug & Analysis agent.
const IO_LOG = []
const LOG_BUFFER = []
const _log = globalThis.log
try { globalThis.log = (m) => { if (CONFIG.debug) LOG_BUFFER.push(typeof m === 'string' ? m : String(m)); return _log(m) } } catch (e) { /* log not writable → run-log just won't be buffered */ }
const retryAgent = async (...a) => {
  const [prompt, opts] = a
  if (opts && opts.label) PROMPT_LOG[opts.label] = prompt
  for (let attempt = 0; attempt <= CONFIG.AGENT_RETRIES; attempt++) {
    try {
      const out = await _agent(...a)
      if (CONFIG.debug) IO_LOG.push({ label: (opts && opts.label) || '?', model: (opts && opts.model) || '?', phase: (opts && opts.phase) || '?', prompt, output: out })
      return out
    }
    catch (e) {
      log('  ⚠ agent error (attempt ' + (attempt + 1) + '/' + (CONFIG.AGENT_RETRIES + 1) + '): ' + ((e && e.message) || e))
      if (attempt === CONFIG.AGENT_RETRIES) {
        log('  ⚠ agent retries exhausted → degraded to null')
        if (CONFIG.debug) IO_LOG.push({ label: (opts && opts.label) || '?', model: (opts && opts.model) || '?', phase: (opts && opts.phase) || '?', prompt, output: null, error: (e && e.message) || String(e) })
        return null
      }
    }
  }
}
log('▶ RR START · mode=' + CONFIG.mode + ' · maxWave=' + CONFIG.maxWave + ' · dir=' + CONFIG.DIR)

// ─────────────────────────────────────────────────────────────────────────────
// ResearchReport — the pipeline. Holds the crawl state; each method is a phase. Prompts live
// in the prompt library (prompts.js); the store reducers live in store.js (called with `this`).
// ─────────────────────────────────────────────────────────────────────────────
class ResearchReport {
  constructor() {
    // scout seed
    this.scout = null
    this.scoutRabbitHoles = []
    // prospector seed (set by runProspect) — high-value source venues the brainer assigns per lane
    this.highValueSources = []
    this.sourcesReasoning = ''
    this.laneRecords = []                       // debug: per lane-researcher {wave, keyword, assignedVenues, summary, rabbitHoles} — feeds the venue-utilization analysis
    // crawl accumulators (persist across waves)
    this.pursuedKeys = new Set()
    this.pursuedList = []
    this.pursuedArchive = []                    // L2: rabbit-holes are MOVED here on pursue (no delete-on-pursue) — keeps full scoreHistory + path for the audit / _frontier.json
    this.topScores = []                         // L2: max lookupNext score per wave — the decay signal, fed back to the brainer
    this.waveLog = []                           // slim per-wave log {wave, pursued, newRabbitHoles, rabbitHoles, topScore, done, reason} — feeds §2 narrative / sentinel / debug
    this.resultLog = []                         // per-wave resultSoFar snapshots {wave, resultSoFar} — for the debug agent
    this.sentinelReopensUsed = 0                       // L4: how many times the goal-mode sentinel has forced an extra wave
    this.sentinelLog = []
    this.files = {}
    // OPEN rabbit-hole store (id-keyed) — each: {id, keyword, why, score, scoreHistory:[{wave,score}], path:[]}. scoreHistory rides natively on
    // the id (no reconcile/merge). Pursued ones leave the store for the pursuedArchive (keeping id + scoreHistory + path).
    this.rabbitHoles = []
    this.nextId = 1
    this.resultSoFar = null                     // the run's living MEMORY — carried wave to wave; refinement gets the FINAL one only
    // crawl outcome (set by runCrawl)
    this.coord = null
    this.wave = 1
    this.bestOpen = 0
    this.stopReason = null
    // finalize outcome (set by runFinalize) — this.aggregatorOut holds the aggregator's REPORT
    this.rabbitHolesOut = []
    this.aggregatorOut = null
    this.reportOk = false
  }

  // ── agent wrappers ──

  // the single Opus BRAINER — the brain / global reducer. Sees the open store + pursued set + running resultSoFar; returns the updated
  // resultSoFar + DELTAS (rescore / add / lookupNext / rename / drop / stop). Can LOOK UP stored leads OR ORIGINATE new directions; code-capable
  // (general-purpose) when compute is on, so it can derive its own steering numbers inline — no separate compute stage.
  async coordinate(wave, findings, phaseName = CONFIG.PHASE.crawl) {
    const open = this.rabbitHoles.map(openLine)
    return retryAgent(
      BRAINER_PROMPT({ wave, query: CONFIG.query, rubric: CONFIG.RUBRIC, landscape: this.scout.landscape, pursuedList: this.pursuedList, open, findings, topScores: this.topScores, resultSoFar: this.resultSoFar, assignSources: CONFIG.parallelSourcesPerLaneResearchAgent === 'auto', stop: CONFIG.STOP, mode: CONFIG.mode, venues: this.highValueSources, compute: CONFIG.compute }),
      { label: 'brainer-w' + wave, phase: phaseName, model: CONFIG.TIER.brainer, effort: CONFIG.EFFORT.brainer, schema: COORD, agentType: CONFIG.compute ? 'general-purpose' : undefined })
  }

  // map the brainer's assigned source-identifier strings back to the full {source, goodFor} venue objects (for the researcher prompt).
  venuesFor(sources) {
    if (!sources || !sources.length) return []
    return sources.map(s => this.highValueSources.find(v => v.source === s) || { source: s, goodFor: '' })
  }

  // the goal-mode SENTINEL — the TERMINAL skeptic of the crawl phase, the inverse of verify. Runs ONCE when the brainer declares done:
  // sees the open store + the brainer's running answer; if the stop isn't solid it injects high-score gaps. Bounded by MAX_SENTINEL_REOPENS.
  async checkSentinel(wave, waveLog, pursuedList, lastBrainer) {
    const rabbitHoles = this.rabbitHoles.map(openLine)
    return retryAgent(
      SENTINEL_PROMPT({ query: CONFIG.query, resultSoFar: lastBrainer.resultSoFar, reason: lastBrainer.stop.reason, waveLog, rabbitHoles, pursuedList }),
      { label: 'sentinel-w' + wave, phase: CONFIG.PHASE.crawl, model: CONFIG.TIER.sentinel, effort: CONFIG.EFFORT.sentinel, schema: SENTINEL })
  }

  // PROSPECTOR — runs after the scout, first agent of the Crawl phase. Given the goal + scout landscape, it names the high-value
  // AUTHORITATIVE source venues for THIS topic (domain-specific). Output rides with the brainer, which assigns the relevant subset to each lane.
  async prospect(model) {
    return retryAgent(
      PROSPECTOR_PROMPT({ query: CONFIG.query, landscape: this.scout.landscape, sources: this.scout.pages.map(p => p.url) }),
      { label: 'prospector', phase: CONFIG.PHASE.scout, model, effort: CONFIG.EFFORT.prospector, schema: SOURCES })
  }

  // ── phases ──

  // Scout (wave 0 seed): broad WebSearch → fetch sources with the rabbit-hole footer → seed rabbit-holes.
  async runScout() {
    phase(CONFIG.PHASE.scout)
    log('· scout DISPATCH · ' + CONFIG.TIER.scout)
    const scout = await retryAgent(
      SCOUT_PROMPT({ query: CONFIG.query, net: CONFIG.NET, footer: CONFIG.FOOTER }),
      { label: 'scout', phase: CONFIG.PHASE.scout, model: CONFIG.TIER.scout, effort: CONFIG.EFFORT.scout, agentType: 'general-purpose', schema: SCOUT })
    if (!scout) { log('✗ scout DIED'); throw new Error('scout died') }
    this.scout = scout
    const scoutRabbitHoles = scout.pages.flatMap(p => (p.rabbitHoles || []).map(l => ({ keyword: l.keyword, why: l.why, path: [] })))   // PATH: scout rabbit-holes descend directly from the goal
    this.scoutRabbitHoles = scoutRabbitHoles
    log('· scout RETURN · pages=' + scout.pages.length + ' · rabbit-holes=' + scoutRabbitHoles.length + ' · deadEnds=' + ((scout.deadEnds || []).length))
    scout.pages.forEach((p, i) => log('    source ' + (i + 1) + ' · rabbit-holes=' + ((p.rabbitHoles || []).length) + ' · ' + p.url))
    return scoutRabbitHoles
  }

  // PROSPECT (real flow): one Opus prospector after the scout names the high-value source venues; the brainer assigns the relevant subset per lane.
  async runProspect() {
    log('· prospector DISPATCH · ' + CONFIG.TIER.prospector)
    const res = await this.prospect(CONFIG.TIER.prospector)
    this.highValueSources = (res && res.highValueSources) || []
    this.sourcesReasoning = (res && res.reasoning) || ''
    log('· prospector RETURN · venues=' + this.highValueSources.length + (res ? '' : ' (FAILED → none; researchers fall back to general search)'))
    this.highValueSources.forEach((s, i) => log('    venue ' + (i + 1) + ' · ' + s.source + ' — ' + s.goodFor))
    this.files['02-prospector.md'] = withPrompt('prospector', '# 02 — Prospector\n\n**Query:** ' + CONFIG.query +
      (this.sourcesReasoning ? '\n\n_' + this.sourcesReasoning + '_' : '') +
      '\n\n## High-value source venues\n\n' + (this.highValueSources.map((s, i) => (i + 1) + '. **' + s.source + '** — ' + s.goodFor).join('\n') || '_(none returned)_') + '\n')
  }

  // Crawl: wave 0 = score the scout rabbit-holes; waves 1..N = pursue → research → re-coordinate; then the terminal sentinel gate.
  async runCrawl(scoutRabbitHoles) {
    const scout = this.scout

    this.files['01-scout.md'] = withPrompt('scout', '# 01 — Scout\n\n**Query:** ' + CONFIG.query + '\n\n## Landscape\n\n' + scout.landscape + '\n\n## Sources\n\n' +
      scout.pages.map((p, i) => '### ' + (i + 1) + ' — ' + p.url + '\n\n' + p.summary + '\n\n' + (p.rabbitHoles || []).map(l => '- **' + l.keyword + '** — ' + l.why).join('\n')).join('\n\n') +
      '\n\n## Dead ends\n\n' + ((scout.deadEnds || []).map(d => '- ' + d).join('\n') || '_none_') + '\n')

    // seed the open store with the scout rabbit-holes (UNSCORED — the brainer scores them this wave via rescore).
    scoutRabbitHoles.forEach(l => addRabbitHole(this, { keyword: l.keyword, why: l.why, path: l.path || [], wave: 0 }))

    const seedFindings = scout.pages.map(p => ({ rabbitHole: p.url, summary: p.summary }))
    log('· brainer-w0 DISPATCH · ' + CONFIG.TIER.brainer + ' · scoring ' + this.rabbitHoles.length + ' rabbit-hole(s)')
    let coord = await this.coordinate(0, seedFindings, CONFIG.PHASE.scout)
    if (!coord) { log('✗ brainer-w0 DIED'); throw new Error('brainer died at wave 0') }
    applyDeltas(this, coord, 0)
    if (coord.resultSoFar) this.resultSoFar = coord.resultSoFar
    this.resultLog.push({ wave: 0, resultSoFar: this.resultSoFar })
    let lookupNext = resolveLookupNext(this, coord, 0, laneCount)
    this.topScores.push(lookupNext.length ? Math.max(...lookupNext.map(p => p.score ?? 0)) : 0)
    this.waveLog.push({ wave: 0, pursued: [], newRabbitHoles: scoutRabbitHoles.length, rabbitHoles: this.rabbitHoles.length, topScore: this.topScores[this.topScores.length - 1], done: coord.stop.done, reason: coord.stop.reason })
    log('· brainer-w0 RETURN · rabbitHoles=' + this.rabbitHoles.length + ' · lookupNext=' + lookupNext.length + '/' + ((coord.lookupNext || []).length) + ' · topScore=' + this.topScores[this.topScores.length - 1] + ' · done=' + coord.stop.done)
    lookupNext.forEach((p, i) => log('    look-up ' + (i + 1) + ' · [' + (p.score ?? '?') + '] #' + p.id + ' ' + p.keyword + (p.sources && p.sources.length ? ' · venues=[' + p.sources.join(', ') + ']' : '')))

    this.files['03-wave-0.md'] = withPrompt('brainer-w0', waveMd(0, coord, lookupNext, [], this.rabbitHoles))

    phase(CONFIG.PHASE.crawl)                                   // scout → prospector → seed brainer = the Scout phase; waves 1..N = Crawl
    let wave = 1
    let crawlSettled = false
    let dryStop = false                              // collect-mode dry: set when the novelty trajectory has plateaued (diminishing returns)
    let sentinelFileLabel = ''                       // label of the LAST sentinel gate — its prompt is prepended to the sentinel file (Change E)
    const baseCap = CONFIG.maxWave === 'auto' ? CONFIG.HARD_CAP : CONFIG.maxWave   // effective wave cap; 'auto' rides up to HARD_CAP, the brainer stops it sooner
    // Outer crawl: the inner loop runs waves until the brainer stops; then the goal-mode SENTINEL gate (terminal skeptic) contests a
    // `done` — if the brainer stopped prematurely it injects high-score gaps at the store top and the inner loop resumes. Bounded by MAX_SENTINEL_REOPENS.
    while (!crawlSettled) {
      while (wave <= Math.min(CONFIG.HARD_CAP, baseCap + this.sentinelReopensUsed) && !coord.stop.done && lookupNext.length && !dryStop) {
        // PURSUE — move lookupNext into the pursued-archive (keeps id + scoreHistory + path) and out of the open store, so the brainer
        // re-scores a clean open-only set next wave.
        pursue(this, lookupNext)
        log('— wave ' + wave + ' · pursuing ' + lookupNext.length + ' rabbit-hole(s) · pursued-total=' + this.pursuedList.length + ' · archived=' + this.pursuedArchive.length)

        // RESEARCH wave — one haiku lane-researcher per pursued rabbit-hole, parallel; each carries its full TRAIL (goal → … → here).
        const toPursue = lookupNext
        const raw = await parallel(toPursue.map(p => () => {
          // per-lane source count: auto → the brainer's per-pick sourceCount (capped 5, default 2); manual → the fixed clamped knob.
          const srcCount = CONFIG.parallelSourcesPerLaneResearchAgent === 'auto' ? Math.min(5, (p.sourceCount || 2)) : CONFIG.parallelSourcesPerLaneResearchAgent
          return retryAgent(
            RESEARCHER_PROMPT({ net: CONFIG.NET, query: CONFIG.query, trail: trailOf(p.path, p.keyword), keyword: p.keyword, why: p.why, footer: CONFIG.FOOTER, venues: this.venuesFor(p.sources), parallelSourcesPerLaneResearchAgent: srcCount }),
            { label: 'lane-w' + wave + ':' + lab(p.keyword), phase: CONFIG.PHASE.crawl, model: CONFIG.TIER.researcher, effort: CONFIG.EFFORT.researcher, agentType: 'general-purpose', schema: RESEARCH })
        }))
        const findings = raw.map((r, i) => ({ rabbitHole: toPursue[i].keyword, trail: trailOf(toPursue[i].path, toPursue[i].keyword), summary: r ? r.summary : '(researcher failed)' }))
        if (CONFIG.debug) raw.forEach((r, i) => this.laneRecords.push({ wave, keyword: toPursue[i].keyword, assignedVenues: toPursue[i].sources || [], summary: r ? r.summary : null, rabbitHoles: r ? (r.rabbitHoles || []).map(l => l.keyword) : [] }))

        // PATH: each freshly-surfaced rabbit-hole inherits its parent's trail (parent path + parent keyword). The engine adds them to the open
        // store UNSCORED (scoreHistory=[]); deduped against pursued + the current store; the brainer scores them next wave (shown as "new").
        const fresh = raw.flatMap((r, i) => (r && r.rabbitHoles) ? r.rabbitHoles.map(l => ({ keyword: l.keyword, why: l.why, path: [...(toPursue[i].path || []), toPursue[i].keyword] })) : [])
        const beforeAdd = this.rabbitHoles.length
        fresh.forEach(l => addRabbitHole(this, { keyword: l.keyword, why: l.why, path: l.path, wave }))
        const newCount = this.rabbitHoles.length - beforeAdd
        log('  wave ' + wave + ' · researchers=' + raw.filter(Boolean).length + '/' + toPursue.length + ' · freshRabbitHoles=' + fresh.length + ' → +' + newCount + ' new after dedup')

        // BRAINER — the single Opus brain re-scores the open store via deltas, updates the running result, and sets the next direction.
        log('  wave ' + wave + ' · brainer DISPATCH · ' + CONFIG.TIER.brainer + ' · open=' + this.rabbitHoles.length)
        const nextCoord = await this.coordinate(wave, findings)
        if (!nextCoord) { log('✗ brainer-w' + wave + ' DIED — stopping'); crawlSettled = true; break }
        coord = nextCoord
        applyDeltas(this, coord, wave)
        if (coord.resultSoFar) this.resultSoFar = coord.resultSoFar
        this.resultLog.push({ wave, resultSoFar: this.resultSoFar })
        lookupNext = resolveLookupNext(this, coord, wave, laneCount)
        this.topScores.push(lookupNext.length ? Math.max(...lookupNext.map(p => p.score ?? 0)) : 0)
        this.waveLog.push({ wave, pursued: toPursue.map(p => p.keyword), newRabbitHoles: newCount, rabbitHoles: this.rabbitHoles.length, topScore: this.topScores[this.topScores.length - 1], done: coord.stop.done, reason: coord.stop.reason })
        this.files[padIdx(wave + 3) + '-wave-' + wave + '.md'] = withPrompt('brainer-w' + wave, waveMd(wave, coord, lookupNext, findings, this.rabbitHoles))
        log('  wave ' + wave + ' · rabbitHoles=' + this.rabbitHoles.length + ' · lookupNext=' + lookupNext.length + '/' + ((coord.lookupNext || []).length) + ' · topScore=' + this.topScores[this.topScores.length - 1] + ' · done=' + coord.stop.done + ((coord.stop.done) ? ' (' + coord.stop.reason + ')' : ''))
        lookupNext.forEach((p, i) => log('    next ' + (i + 1) + ' · [' + (p.score ?? '?') + '] #' + p.id + ' ' + p.keyword + (p.sources && p.sources.length ? ' · venues=[' + p.sources.join(', ') + ']' : '')))

        // collect-mode DRY stop: diminishing returns relative to the run's OWN peak novelty (adapts per topic — no magic absolute floor).
        if (CONFIG.mode === 'collect' && !coord.stop.done && this.topScores.length >= 3) {
          const peak = Math.max(...this.topScores)
          if (peak > 0 && this.topScores.slice(-2).every(s => s <= peak * CONFIG.QUERY_PLATEAU)) {
            dryStop = true
            log('  wave ' + wave + ' · collect DRY — top novelty plateaued (' + this.topScores.slice(-2).join(',') + ' ≤ ' + CONFIG.QUERY_PLATEAU + '×peak ' + peak + ') → stopping')
          }
        }
        wave++
      }

      // SENTINEL GATE — terminal skeptic of the crawl phase (goal mode). Runs once when the BRAINER declared done: sees the open store + the
      // brainer's running answer. If the stop isn't solid, inject high-score gap objects at the store TOP and resume.
      if (CONFIG.mode === 'goal' && (coord.stop.done || !lookupNext.length) && wave <= CONFIG.HARD_CAP && this.sentinelReopensUsed < CONFIG.MAX_SENTINEL_REOPENS) {
        log('· sentinel GATE · contesting the brainer\'s done (sees the open store + the running answer)')
        sentinelFileLabel = 'sentinel-w' + wave
        const ch = await this.checkSentinel(wave, this.waveLog, this.pursuedList, coord)
        const inject = (ch && ch.solid === false && Array.isArray(ch.rabbitHoles))
          ? ch.rabbitHoles.filter(l => l && l.keyword && !this.pursuedKeys.has(norm(l.keyword))).slice(0, laneCount) : []
        this.sentinelLog.push({ afterWave: wave - 1, solid: ch ? ch.solid : null, reasoning: ch ? ch.reasoning : '(sentinel failed)', injected: inject.map(l => l.keyword) })
        if (inject.length) {
          this.sentinelReopensUsed++
          coord.stop.done = false
          // inject high-score gap objects into the store (path marks them sentinel-born) and hand them to the lane researchers next iteration
          lookupNext = inject.map(l => addRabbitHole(this, { keyword: l.keyword, why: l.why, path: ['⚔ sentinel'], score: CONFIG.INJECT_SCORE, wave })).filter(Boolean)
          log('· ⚔ SENTINEL REOPENED the brainer\'s done (' + this.sentinelReopensUsed + '/' + CONFIG.MAX_SENTINEL_REOPENS + ') — injected ' + lookupNext.length + ' high-score gap(s) into the store; crawl resumes')
          lookupNext.forEach((p, i) => log('    inject ' + (i + 1) + ' · [' + CONFIG.INJECT_SCORE + '] #' + p.id + ' ' + p.keyword))
        } else {
          crawlSettled = true
          log('· ✓ sentinel UPHELD the brainer\'s done' + (ch && ch.reasoning ? ' · ' + ch.reasoning.slice(0, 110) : ''))
        }
      } else {
        crawlSettled = true
      }
    }

    // L2 stop classification: the brainer's own satisficing `done` (primary), else why the loop stopped.
    const bestOpen = this.rabbitHoles.length ? Math.max(...this.rabbitHoles.map(r => lastScore(r) ?? 0)) : 0
    const stopReason = coord.stop.done ? 'brainer-done'
      : dryStop ? 'collect-dry-plateau'
      : lookupNext.length ? 'wave-cap'
      : this.rabbitHoles.length ? 'rabbithole-dry'
      : 'rabbithole-empty'
    log('■ crawl DONE · stopReason=' + stopReason + ' · waves=' + (wave - 1) + ' · rabbitHoles=' + this.rabbitHoles.length + ' · sentinelReopens=' + this.sentinelReopensUsed)

    // SENTINEL output → file (every gate invocation: uphold or reopen + what it injected)
    if (this.sentinelLog.length) {
      this.files[padIdx(wave + 3) + '-sentinel.md'] = withPrompt(sentinelFileLabel, '# Sentinel — crawl-phase terminal skeptic\n\n' +
        this.sentinelLog.map((c, i) => '## Gate ' + (i + 1) + ' — after wave ' + c.afterWave + ' — ' + (c.solid ? '✓ UPHELD the brainer\'s done' : '⚔ REOPENED (brainer stopped prematurely)') +
          '\n\n' + (c.reasoning || '') + ((c.injected && c.injected.length) ? '\n\n**Injected high-score gaps (handed back to lane researchers):**\n' + c.injected.map(k => '- ' + k).join('\n') : '')).join('\n\n') + '\n')
    }

    // hand the crawl outcome to the later phases
    this.coord = coord
    this.wave = wave
    this.bestOpen = bestOpen
    this.stopReason = stopReason
  }

  // Finalize COMPUTE chain — sequential code-capable opus stages. Each stage gets the full resultSoFar + the given facts + ALL prior stage outputs,
  // and may WRITE+RUN code; its prompt+result are captured into `{tag.file}{N}.*`. Derives the final answer (the brainer computes its own steering numbers inline).
  async runCompute(stages, facts, phaseName, tag) {
    const out = []
    for (let i = 0; i < stages.length; i++) {
      const goal = stages[i]
      const label = tag.label + i
      log('  compute ' + tag.name + (i + 1) + '/' + stages.length + ' · ' + String(goal).slice(0, 80))
      const res = await retryAgent(
        COMPUTE_PROMPT({ query: CONFIG.query, goal, resultSoFar: this.resultSoFar, hardenedFacts: facts, priorStages: out.slice() }),
        { label, phase: phaseName, model: CONFIG.TIER.computer, effort: CONFIG.EFFORT.computer, agentType: 'general-purpose', schema: COMPUTE })
      const r = res || { value: '(compute failed)', result: '(compute failed)', script: '', scriptLang: '', assumptions: [] }
      out.push({ goal, value: r.value, result: r.result, assumptions: r.assumptions || [] })
      if (r.script) {
        const ext = (r.scriptLang === 'node' || r.scriptLang === 'javascript' || r.scriptLang === 'js') ? 'js' : (r.scriptLang === 'python' || r.scriptLang === 'py' ? 'py' : 'txt')
        this.files[tag.file + (i + 1) + '.' + ext] = r.script
      }
      this.files[tag.file + (i + 1) + '.out.md'] = withPrompt(label, '# Compute ' + tag.name + (i + 1) + '\n\n**Goal:** ' + goal +
        '\n\n**Value:** ' + (r.value || '_none_') + '\n\n' + (r.result || '') +
        '\n\n**Assumptions:**\n' + ((r.assumptions || []).map(a => '- ' + a).join('\n') || '_none_') + '\n')
      log('  compute ' + tag.name + (i + 1) + ' · value=' + (r.value ? '"' + String(r.value).slice(0, 60) + '"' : 'none') + (r.script ? ' · script=' + r.scriptLang : ''))
    }
    return out
  }

  // Finalize (end-only). An opus INITIATOR reads the final resultSoFar and shapes the finish to the query → REFINEMENT: a single sonnet REFINE
  // pass per fact — adversarially fact-checks then returns the corrected claims — hardening each load-bearing fact the initiator named →
  // COMPUTEMENT (optional, sequential): a chain of code-capable opus agents DERIVES the answer on the hardened facts, propagating error bars →
  // the opus AGGREGATOR writes the END report from the cleaned facts + the computed derivation + the final resultSoFar.
  async runFinalize() {
    phase(CONFIG.PHASE.finalize)
    const rabbitHolesOut = this.rabbitHoles.map(f => ({ id: f.id, keyword: f.keyword, why: f.why, path: f.path || [], score: lastScore(f), scoreHistory: f.scoreHistory })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    this.rabbitHolesOut = rabbitHolesOut
    const topOpen = rabbitHolesOut.slice(0, 6).map(f => f.keyword)

    // ── INITIATOR — shapes the finish to the query: names the facts to harden, decides whether to derive (+ the stages), sets the report focus ──
    log('· finalize · initiator · ' + CONFIG.TIER.initiator + ' · planning the finish from the final resultSoFar')
    const plan = await retryAgent(
      INITIATOR_PROMPT({ query: CONFIG.query, resultSoFar: this.resultSoFar, waveLog: this.waveLog, landscape: this.scout.landscape, openRabbitHoles: topOpen, compute: CONFIG.compute }),
      { label: 'initiator', phase: CONFIG.PHASE.finalize, model: CONFIG.TIER.initiator, effort: CONFIG.EFFORT.initiator, schema: INITIATOR })
    const facts = (plan && plan.refinement && Array.isArray(plan.refinement.facts)) ? plan.refinement.facts : []
    const computePlan = (plan && plan.computement && typeof plan.computement === 'object') ? plan.computement : { run: false, stages: [] }
    const computeStages = (CONFIG.compute && computePlan.run && Array.isArray(computePlan.stages)) ? computePlan.stages : []
    const aggFocus = (plan && plan.aggregator && plan.aggregator.focus) || ''
    log('· finalize · plan · facts=' + facts.length + ' · compute=' + (computeStages.length ? computeStages.length + ' stage(s)' : 'off') + ' · aggFocus=' + (aggFocus ? '"' + aggFocus.slice(0, 60) + '"' : 'none'))
    this.files[padIdx(this.wave + 4) + '-initiator.md'] = withPrompt('initiator', '# Initiator — finalize plan\n\n' +
      '## Refinement — facts to harden (' + facts.length + ')\n\n' + (facts.map((f, i) => (i + 1) + '. **' + f.fact + '** — ' + f.why).join('\n') || '_none_') +
      '\n\n## Computement: ' + (computeStages.length ? 'ON — ' + computeStages.length + ' stage(s)\n\n' + computeStages.map((s, i) => (i + 1) + '. ' + s).join('\n') : 'OFF') +
      '\n\n## Aggregator focus\n\n' + (aggFocus || '_none_') + '\n')

    // ── REFINEMENT — one REFINE agent per fact (parallel): adversarially fact-checks, returns the corrected solid claim ──
    log('· finalize · refinement · ' + facts.length + ' fact(s) → refine · ' + CONFIG.TIER.refiner)
    const refined = await parallel(facts.map((f, i) => () => retryAgent(
      REFINE_PROMPT({ net: CONFIG.NET, query: CONFIG.query, fact: f.fact, why: f.why }),
      { label: 'refine-' + i, phase: CONFIG.PHASE.finalize, model: CONFIG.TIER.refiner, effort: CONFIG.EFFORT.refiner, schema: REFINE })))
    const cleanReports = facts.map((f, i) => ({ fact: f.fact, why: f.why, clean: (refined[i] && refined[i].report) || '(refine failed)' }))
    log('· finalize · refinement DONE · ' + cleanReports.length + ' hardened fact(s)')
    this.files[padIdx(this.wave + 5) + '-refinement.md'] = '# Refinement — fact-check & harden the load-bearing facts\n\n' +
      (facts.length ? facts.map((f, i) => '## ' + (i + 1) + ' — ' + f.fact + '\n\n_' + f.why + '_\n\n' + ((refined[i] && refined[i].report) || '_(refine failed)_')).join('\n\n') : '_no facts to harden_') + '\n'

    // ── COMPUTEMENT — sequential derivation chain (optional). Each stage gets the full resultSoFar + the hardened facts + ALL prior stage
    // outputs, and may WRITE+RUN code (general-purpose agentType = Bash/Write-capable). Its script + result are captured into _compute-stage-N.* ──
    let computeResults = []
    if (computeStages.length) {
      log('· finalize · computement · ' + computeStages.length + ' sequential stage(s) · ' + CONFIG.TIER.computer + ' (code-capable)')
      computeResults = await this.runCompute(computeStages, cleanReports, CONFIG.PHASE.finalize, { file: '_compute-stage-', label: 'compute-', name: 'stage ' })
    } else { log('· finalize · computement · OFF (initiator: this answer is not a derivation)') }

    // ── AGGREGATOR — writes the END report (always): the hardened facts (source of truth) + the computed derivation (verbatim) + the final resultSoFar ──
    log('· finalize · aggregator · ' + CONFIG.TIER.aggregator + ' · writing the report' + (computeResults.length ? ' (with computed derivation)' : ''))
    const agg = await retryAgent(
      AGGREGATOR_PROMPT({ mode: CONFIG.mode, query: CONFIG.query, landscape: this.scout.landscape, resultSoFar: this.resultSoFar, waveLog: this.waveLog, cleanReports, computeResults, focus: aggFocus, openRabbitHoles: topOpen }),
      { label: 'aggregator', phase: CONFIG.PHASE.finalize, model: CONFIG.TIER.aggregator, effort: CONFIG.EFFORT.aggregator, schema: REPORT })
    const reportOk = !!(agg && agg.report)
    if (reportOk) {
      this.files['result.md'] = agg.report
      log('· finalize DONE · confidence=' + agg.confidence + ' · plan=' + (agg.plan || []).length + ' step(s) · openQ=' + (agg.openQuestions || []).length)
    } else { log('✗ finalize FAILED — no report returned') }
    this.aggregatorOut = agg
    this.reportOk = reportOk
  }

  // metrics + _frontier.json + the crawl-tree render, then the final return shape.
  buildResult() {
    const { aggregatorOut, reportOk, rabbitHolesOut, coord, wave } = this

    const metrics = {
      mode: CONFIG.mode, dir: CONFIG.DIR, wavesRun: wave - 1, stopReason: this.stopReason,
      scoutRabbitHoles: this.scoutRabbitHoles.length, prospectorVenues: this.highValueSources.length, pursuedTotal: this.pursuedList.length,
      rabbitHolesFinal: this.rabbitHoles.length, bestOpenScore: this.bestOpen, topScores: this.topScores, done: coord.stop.done,
      sentinelReopensForced: this.sentinelReopensUsed,
      reportWritten: reportOk, confidence: reportOk ? aggregatorOut.confidence : null,
    }
    log('■ RR DONE · ' + JSON.stringify(metrics))

    this.files['_frontier.json'] = JSON.stringify({ query: CONFIG.query, mode: CONFIG.mode, stopReason: this.stopReason, topScores: this.topScores, highValueSources: this.highValueSources, rabbitHoles: rabbitHolesOut, pursued: this.pursuedArchive }, null, 2)

    // CRAWL TREE — reconstruct the branching from the pursued-archive paths (the global trail record) and render it visually.
    const treeRoot = { kw: CONFIG.query, children: new Map(), score: null }
    for (const l of this.pursuedArchive) {
      let cur = treeRoot
      for (const kw of [...(l.path || []), l.keyword]) {
        const k = norm(kw)
        if (!cur.children.has(k)) cur.children.set(k, { kw, children: new Map(), score: null })
        cur = cur.children.get(k)
      }
      cur.score = (l.scoreHistory && l.scoreHistory.length) ? l.scoreHistory[l.scoreHistory.length - 1].score : null
    }
    const treeLines = []
    const walkTree = (node, prefix) => {
      const kids = [...node.children.values()]
      kids.forEach((c, i) => {
        const last = i === kids.length - 1
        const kw = c.kw.length > 64 ? c.kw.slice(0, 61) + '…' : c.kw
        treeLines.push(prefix + (last ? '└─ ' : '├─ ') + kw + (c.score != null ? '  [' + c.score + ']' : ''))
        walkTree(c, prefix + (last ? '   ' : '│  '))
      })
    }
    walkTree(treeRoot, '')
    const goalLine = 'GOAL: ' + (CONFIG.query.length > 80 ? CONFIG.query.slice(0, 77) + '…' : CONFIG.query)
    log('')
    log('🌳 CRAWL TREE — how it branched (goal → lanes pursued · [score]):')
    log(goalLine)
    treeLines.forEach(l => log(l))
    this.files['_tree.md'] = '# Crawl tree — how the lanes branched\n\n```\n' + goalLine + '\n' + treeLines.join('\n') + '\n```\n'

    return {
      query: CONFIG.query, mode: CONFIG.mode, dir: CONFIG.DIR, stopReason: this.stopReason, done: coord.stop.done, tree: [goalLine, ...treeLines],
      verdict: reportOk ? aggregatorOut.verdict : null, confidence: reportOk ? aggregatorOut.confidence : null,
      plan: reportOk ? aggregatorOut.plan : [], openQuestions: reportOk ? aggregatorOut.openQuestions : [],
      pursued: this.pursuedList, pursuedArchive: this.pursuedArchive, highValueSources: this.highValueSources,
      rabbitHoles: rabbitHolesOut, resultSoFar: this.resultSoFar, sentinelLog: this.sentinelLog,
      waveLog: this.waveLog, metrics, files: this.files,
    }
  }

  // DEBUG & ANALYSIS (last phase, opt-in via arg.debug): an Opus agent aggregates the run's diagnostics — corner-by-corner,
  // prospector→researcher venue utilization, and any arg.debugPrompt question — then JS appends the verbatim metrics, run log,
  // and raw agent I/O (exact prompt in / exact output out) into one shippable _debug.md.
  async runDebug(metrics) {
    phase(CONFIG.PHASE.debug)
    log('· debug & analysis · ' + CONFIG.TIER.debugAnalyst + ' · over ' + IO_LOG.length + ' agent calls + ' + LOG_BUFFER.length + ' log lines + ' + this.laneRecords.length + ' lane records')
    const diag = await retryAgent(
      DEBUG_PROMPT({ query: CONFIG.query, focus: CONFIG.debugPrompt, metrics, waveLog: this.waveLog, sentinelLog: this.sentinelLog, resultLog: this.resultLog, highValueSources: this.highValueSources, laneRecords: this.laneRecords }),
      { label: 'debug-analyst', phase: CONFIG.PHASE.debug, model: CONFIG.TIER.debugAnalyst, effort: CONFIG.EFFORT.debugAnalyst, schema: DIAG })
    const narrative = (diag && diag.diagnosis) || '_(debug analyst failed — see raw sections below)_'
    const rawIO = IO_LOG.map((e, i) => '### ' + (i + 1) + '. `' + e.label + '` · ' + e.model + ' · ' + e.phase +
      '\n\n**PROMPT**\n\n' + (e.prompt || '') +
      '\n\n**OUTPUT**' + (e.error ? ' _(' + e.error + ')_' : '') + '\n\n' + (e.output == null ? '_(null)_' : JSON.stringify(e.output, null, 2))).join('\n\n')
    this.files['_debug.md'] = '# RR debug & analysis — ' + (CONFIG.query.length > 80 ? CONFIG.query.slice(0, 77) + '…' : CONFIG.query) +
      (CONFIG.debugPrompt ? '\n\n**Debug prompt:** ' + CONFIG.debugPrompt : '') +
      '\n\n## Analysis (debug-analyst · opus)\n\n' + narrative +
      '\n\n## Metrics\n\n```json\n' + JSON.stringify(metrics, null, 2) + '\n```' +
      '\n\n## Run log (' + LOG_BUFFER.length + ' lines)\n\n```\n' + LOG_BUFFER.join('\n') + '\n```' +
      '\n\n## Raw agent I/O — exact prompt in, exact output out (' + IO_LOG.length + ' calls)\n\n' + (rawIO || '_(none captured)_') + '\n'
    log('· debug DONE · _debug.md written')
  }

  async run() {
    const scoutRabbitHoles = await this.runScout()
    await this.runProspect()                                            // name the high-value venues before the crawl
    await this.runCrawl(scoutRabbitHoles)
    await this.runFinalize()
    const result = this.buildResult()
    if (CONFIG.debug) await this.runDebug(result.metrics)               // last phase, opt-in: Debug & Analysis agent → _debug.md
    return result
  }
}

// ── entry — the Workflow harness wraps this file in an async scope and awaits its return ──
const rr = new ResearchReport()
return await rr.run()
