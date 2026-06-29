// Agent contracts — one entry per agent. For each: an `*Args` type (what its buildPrompt receives) and an
// `*Out` type (its StructuredOutput shape, what the engine reads back). The generic `Agent<Args>` ties an
// agent object's buildPrompt to its Args.
import type { Schema } from './schema.js';
import type { Metrics } from './run.js';
import type {
  Confidence,
  CleanReport,
  Effort,
  Evidence,
  FactToHarden,
  Finding,
  LaneRecord,
  LookupItem,
  Mode,
  NextSource,
  Page,
  RabbitHoleSeed,
  RenameItem,
  RescoreItem,
  ResultLogEntry,
  ResultSoFar,
  ScoredLead,
  SentinelLogEntry,
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
  lastSentinelReason?: string; // a prior crawl-sentinel rejection, 1 line — raises the brainer's bar before it declares done again; '' when none
  lastValidatorMissing?: string; // the last wave's validator gaps (reopened lanes + capped known-gaps), 1 line; '' when none
  compute?: boolean;
  computerNote?: string;
  thinkerNote?: string;
  researcherNote?: string;
}
export interface Coord {
  resultSoFar: ResultSoFar;
  rescore: RescoreItem[];
  add: ScoredLead[];
  lookupNext: LookupItem[];
  rename?: RenameItem[];
  drop?: number[];
  stop: Stop;
}

// ── brain finalize-compute (the brainer, re-invoked code-capable to derive the final answer on the hardened facts) ──
export interface BrainerComputeArgs {
  query: string;
  resultSoFar: ResultSoFar | null;
  hardenedFacts: CleanReport[];
  directive: string; // the judge's precise derivation directive
  reason: string; // the judge's reasoning, fed forward
  computerNote?: string;
  thinkerNote?: string;
}
export interface BrainComputeOut {
  resultSoFar: ResultSoFar; // the updated memory with the derivation folded into `working`
}

// ── sentinel ──
export interface SentinelArgs {
  query: string;
  resultSoFar: ResultSoFar | null;
  reason: string;
  waveLog: WaveLogEntry[];
  rabbitHoles: string[];
  pursuedList: string[];
  thinkerNote?: string;
  researcherNote?: string;
}
export interface SentinelOut {
  solid: boolean;
  reasoning: string;
  rabbitHoles?: RabbitHoleSeed[];
}

// ── researcher ──
export interface ResearcherArgs {
  net: string;
  query: string;
  trail: string;
  keyword: string;
  why: string;
  footer: string;
  venues: Venue[];
  parallelSourcesPerLaneResearchAgent: number;
  researcherNote?: string;
  ref?: string; // a concrete URL/DOI this lane fetches directly (a followed citation) instead of WebSearching
}
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

// ── judge — the FINALIZE-phase terminal skeptic (mirrors the crawl sentinel) ──
export interface JudgeArgs {
  query: string;
  resultSoFar: ResultSoFar | null;
  cleanReports: CleanReport[];
  focus: string; // the deliverable spec the answer must meet (the initiator's report focus)
  compute: boolean; // false ⇒ no derivation path; the judge sets needsCompute false
  computerNote?: string;
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
}

// ── validator — the per-wave crawl coverage gate (distinct from the terminal judge) ──
export interface ValidatorArgs {
  query: string;
  requests: { id: number; keyword: string; why: string }[]; // the wave's lookupNext picks
  findings: { keyword: string; intro: string }[]; // each lane's return, intro only — kept cheap
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
  // the run Metrics in production; the prompt test passes a minimal object — both render via plain().
  metrics: Metrics | Record<string, unknown>;
  waveLog: WaveLogEntry[];
  sentinelLog: SentinelLogEntry[];
  resultLog: ResultLogEntry[];
  highValueSources: Venue[];
  laneRecords: LaneRecord[];
}
export interface DiagOut {
  diagnosis: string;
}
