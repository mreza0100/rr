// Agent contracts — one entry per agent. For each: an `*Args` type (what its buildPrompt receives) and an
// `*Out` type (its StructuredOutput shape, what the engine reads back). The generic `Agent<Args>` ties an
// agent object's buildPrompt to its Args.
import type { Schema } from './schema.js';
import type { Metrics } from './run.js';
import type {
  Confidence,
  CleanReport,
  Effort,
  FactToHarden,
  Finding,
  LaneRecord,
  LookupItem,
  Mode,
  NextSource,
  Page,
  RabbitHoleSeed,
  ReadSlice,
  RenameItem,
  RescoreItem,
  ResultLogEntry,
  ResultSoFar,
  SchedulerLane,
  ScoredLead,
  Spawn,
  Stop,
  Tier,
  Venue,
  WaveLogEntry,
} from './domain.js';

// the shape every agent object exposes; the engine reads tier/effort/schema and calls buildPrompt(args).
export interface Agent<Args> {
  tier: Tier;
  effort: Effort;
  schema: Schema;
  buildPrompt: (args: Args) => string;
}

// ── scout ──
export interface ScoutArgs {
  query: string;
  net: string;
  footer: string;
  researcherNote?: string;
}
export interface ScoutOut {
  landscape: string;
  pages: Page[];
  deadEnds?: string[];
}

// ── prospector ──
export interface ProspectorArgs {
  query: string;
  landscape: string;
  sources: string[];
  thinkerNote?: string;
  researcherNote?: string;
}
export interface SourcesOut {
  highValueSources: Venue[];
  languageGuidance?: string; // routing note for non-English literatures; '' when the topic is English-dominated
  reasoning?: string;
}

// ── brainer ──
export interface BrainerArgs {
  wave: number;
  query: string;
  rubric: string;
  landscape: string;
  pursuedList: string[];
  open: string[];
  findings: Finding[];
  topScores: number[];
  resultSoFar: ResultSoFar | null;
  assignSources: boolean;
  stop: string;
  mode: Mode;
  venues: Venue[];
  languageGuidance?: string; // non-empty ⇒ route some lanes to the non-English venues
  lastValidatorMissing?: string; // the last wave's validator gaps (reopened lanes + capped known-gaps), 1 line; '' when none
  compute?: boolean;
  computeNote?: string;
  thinkerNote?: string;
  researcherNote?: string;
  // ── brainer-tree context (multi-brainer; all absent/false in a single-brainer run) ──
  isChild?: boolean; // a spawned CHILD brainer — knows its parent + branch, and MAY declare stop.lost
  parentName?: string; // the brainer it spawned from
  mandate?: string; // the parent-authored directive aiming this child at its branch
  trail?: string; // the branch path this child came from
  canSpawn?: boolean; // spawning is still permitted this wave (caps not yet hit) — only then may it emit spawn
  lastWave?: boolean; // last wave: wrap up the answer, request no new research
}
export interface Coord {
  resultSoFar: ResultSoFar;
  rescore: RescoreItem[];
  add: ScoredLead[];
  lookupNext: LookupItem[];
  rename?: RenameItem[];
  drop?: number[];
  spawn?: Spawn; // OPTIONAL, ≤1 per wave: spawn a focused child brainer onto a branch (engine honors the maxParallelBrainers / depth / 1-per-wave caps)
  stop: Stop;
}

// ── brain finalize-compute (the brainer, re-invoked code-capable to derive the final answer on the hardened facts) ──
export interface BrainerComputeArgs {
  query: string;
  resultSoFar: ResultSoFar | null;
  hardenedFacts: CleanReport[];
  directive: string; // the judge's precise derivation directive
  reason: string; // the judge's reasoning, fed forward
  computeNote?: string;
  thinkerNote?: string;
}
export interface BrainComputeOut {
  resultSoFar: ResultSoFar; // the updated memory with the derivation folded into `working`
}

// ── researchScheduler — discovery: picks + sizes the highest-value sources per lane ──
export interface SchedulerLaneInput {
  id: number; // the rabbit-hole id (the scheduler echoes it back so the engine maps sources → lane)
  keyword: string;
  why: string;
  note: string; // the brainer's research directive (what to find + ranked fallbacks)
  venues: Venue[]; // the prospector venues the brainer assigned this lane (prefer these)
  ref?: string; // a concrete url/DOI to take directly instead of searching (a followed citation)
}
export interface ResearchSchedulerArgs {
  query: string;
  lanes: SchedulerLaneInput[];
  researcherNote?: string;
}
export interface SchedulerOut {
  lanes: SchedulerLane[]; // the chosen, sized sources grouped per lane id
}

// ── researcher (a lane READER: reads its assigned cache slice(s) from disk via code, then digests) ──
export interface ResearcherArgs {
  query: string;
  trail: string;
  keyword: string;
  why: string;
  note: string; // the brainer's directive (noteFromBrainer) — what to extract + ranked fallbacks
  footer: string;
  reads: ReadSlice[]; // the char window(s) of the cache file(s) this reader-unit covers
  readerIndex: number; // 1-based: reader i of N on this lane
  readerCount: number; // N — total readers on this lane
  priorAnswer: string; // the running answer handed forward from the earlier readers ('' for reader 1) — renders LAST
  researcherNote?: string;
}
// one reader's StructuredOutput: the updated running answer + the leads the slice surfaced.
export interface ReaderOut {
  runningAnswer: string; // the accumulated lane answer after merging this slice into the prior one
  rabbitHoles?: RabbitHoleSeed[];
  nextSources?: NextSource[];
  deadEnds?: string[];
}
// the lane thread's aggregated return (final running answer as `summary` + the collected leads) — what runResearchers yields.
export interface ResearchOut {
  summary: string;
  rabbitHoles?: RabbitHoleSeed[];
  nextSources?: NextSource[]; // top outbound citations the next lane fetches directly
  deadEnds?: string[];
}

// ── initiator ──
export interface InitiatorArgs {
  query: string;
  resultSoFar: ResultSoFar | null;
  waveLog: WaveLogEntry[];
  landscape: string;
  openRabbitHoles: string[];
  mode?: Mode; // collect ⇒ harden breadth/coverage, not the shape of a single answer
  thinkerNote?: string;
}
export interface InitiatorOut {
  refinement: { facts: FactToHarden[] };
  synthesiser: { focus: string };
}

// ── refiner ──
export interface RefineArgs {
  net: string;
  query: string;
  fact: string;
  why: string;
  directive?: string; // on a re-run, the judge's precise re-check directive; '' on the first pass
}
export interface RefineOut {
  report: string;
}

// ── judge — the sole terminal skeptic (FINALIZE phase) ──
export interface JudgeArgs {
  query: string;
  resultSoFar: ResultSoFar | null;
  cleanReports: CleanReport[];
  focus: string; // the deliverable spec the answer must meet (the initiator's report focus)
  openRabbitHoles: string[]; // the leftover/unpursued open rabbit-holes — the judge weighs whether a real gap remains and may reopen the crawl on it
  compute: boolean; // false ⇒ no derivation path; the judge sets needsCompute false
  mode?: Mode; // collect ⇒ gate goalMet on inventory-completeness + per-item verification, not a single-answer goal
  computeNote?: string;
  thinkerNote?: string;
}
export interface JudgeOut {
  goalMet: boolean;
  verificationSound: boolean;
  needsCompute: boolean;
  computeSound: boolean;
  reasoning: string;
  directive?: string; // the precise fix/derivation to perform when not satisfied; '' when satisfied
  reopenRabbitHoles?: RabbitHoleSeed[]; // only for a genuine evidence/coverage gap that needs the crawl; else empty
  computeLimitation?: string; // engine-applied (not from the model): the compute-off stated limitation runJudge returns for the engine to fold into openGaps
}

// ── validator — the per-wave crawl coverage gate (distinct from the terminal judge) ──
export interface ValidatorRequest {
  id: number;
  keyword: string;
  why: string;
}
export interface ValidatorFinding {
  keyword: string;
  intro: string;
}
export interface ValidatorArgs {
  query: string;
  requests: ValidatorRequest[]; // the wave's lookupNext picks
  findings: ValidatorFinding[]; // each lane's return, intro only — kept cheap
  nullLanes: string[]; // keywords of lanes that returned nothing
}
export interface ValidatorCheck {
  id: number;
  fulfilled: boolean;
  reason?: string;
}
export interface ValidatorOut {
  checks: ValidatorCheck[];
  enough: boolean;
  missing?: string[]; // gaps still open, threaded into the next brainer
}

// ── synthesiser ──
export interface SynthesiserArgs {
  mode: Mode;
  query: string;
  landscape: string;
  resultSoFar: ResultSoFar | null;
  waveLog: WaveLogEntry[];
  cleanReports: CleanReport[];
  focus: string;
  openRabbitHoles: string[];
  compute?: boolean; // false ⇒ no derivation was run; never present a `working` derivation even if one leaked into resultSoFar
  thinkerNote?: string;
}
export interface ReportOut {
  report: string;
  verdict: string;
  confidence: Confidence;
  plan: string[];
  openQuestions: string[];
}

// ── debug analyst ──
export interface DebugAnalystArgs {
  query: string;
  focus: string;
  metrics: Metrics; // the run's diagnostic metrics, rendered via plain()
  waveLog: WaveLogEntry[];
  resultLog: ResultLogEntry[];
  highValueSources: Venue[];
  laneRecords: LaneRecord[];
}
export interface DiagOut {
  diagnosis: string;
}
