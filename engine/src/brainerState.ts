import type {
  CleanReport,
  Coord,
  FactToHarden,
  JudgeOut,
  RabbitHole,
  RabbitHoleOut,
  ReportOut,
  ResultLogEntry,
  ResultSoFar,
  ScoutOut,
  SeedLead,
  StopReason,
  ValidatorLogEntry,
  Venue,
  WaveLogEntry,
} from './types/index.js';

// the speculative GATE's reusable outputs — runGate hardens these once; finalizeWinner reuses them for the report.
export interface GateCache {
  facts: FactToHarden[];
  synthFocus: string;
  cleanReports: CleanReport[];
  topOpen: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// BrainerState — ONE brainer's private crawl state in the brainer tree.
// The single-brainer ResearchReport split its state in two: the RUN GLOBALS (scout
// + prospector seed, set once before any brainer exists) stay on ResearchReport;
// the PER-CRAWL state (the store + resultSoFar + the per-wave logs + the crawl
// outcome) moves here, so N brainers each carry their own. The store reducers in
// store.ts already operate on a structural `state` first-arg, so a BrainerState IS
// a StoreState and the reducers work on it unchanged.
//
// The run.ts agent fns read the same FIELD NAMES they read off ResearchReport — the
// per-crawl ones live here, the read-only globals (scout/highValueSources/…) are
// copied BY REFERENCE at construction (set once, shared, never mutated mid-crawl) —
// so each fn only changed its param TYPE, not its field accesses. The engine still
// owns every mutation + every files[name] = … write; it passes the active brainer in.
// ─────────────────────────────────────────────────────────────────────────────

// active = waving · done = declared done, awaiting gate dispatch (transient) · finalizing = a speculative gate is in
// flight · won = its gate passed (the run's winner) · drained = wrapped up without winning · lost = a CHILD abandoned
// its branch as a dead end.
export type BrainerStatus = 'active' | 'done' | 'finalizing' | 'won' | 'drained' | 'lost';

// the read-only run globals every BrainerState shares (ResearchReport satisfies this — the scout + prospector
// populate them before the first brainer is constructed, and nothing mutates them during the crawl).
export interface RunGlobals {
  scout: ScoutOut | null;
  scoutRabbitHoles: SeedLead[];
  highValueSources: Venue[];
  languageGuidance: string;
}

// the identity a brainer is born with — the root has parentName=null (and can never declare lost).
export interface BrainerIdentity {
  name: string; // descriptive, derived from the mandate/branch
  parentName: string | null; // null ⇒ the ROOT brainer
  mandate: string; // the parent-authored directive that aims a child ('' for the root)
  trail: string; // the branch path the child came from ('' for the root)
  depth: number; // root = 0; each spawn increments it (capped by MAX_BRAINER_DEPTH)
}

export class BrainerState {
  // ── identity ──
  name: string;
  parentName: string | null;
  mandate: string;
  trail: string;
  depth: number;
  status: BrainerStatus;
  gate: JudgeOut | null; // the last speculative-gate judge verdict (null until a gate runs)

  // ── run globals (shared by reference — read-only during the crawl) ──
  scout: ScoutOut | null;
  scoutRabbitHoles: SeedLead[];
  highValueSources: Venue[];
  languageGuidance: string;

  // ── StoreState (own, mutable — the reducers in store.ts mutate these) ──
  rabbitHoles: RabbitHole[];
  nextId: number;
  pursuedKeys: Set<string>;
  pursuedRefs: Set<string>;
  pursuedList: string[];
  pursuedArchive: RabbitHole[];

  // ── crawl accumulators (own) ──
  resultSoFar: ResultSoFar | null; // this brainer's living memory
  topScores: number[]; // its own decay signal (plateau detection)
  waveLog: WaveLogEntry[];
  resultLog: ResultLogEntry[];
  validatorLog: ValidatorLogEntry[];
  lastValidatorMissing: string;
  coord: Coord | null;
  lookupNext: RabbitHole[]; // the pending lanes this brainer pursues next wave (was a runCrawl local — per-brainer now)
  starvedWaves: number; // consecutive empty-schedule waves for THIS brainer (B6 starvation guard)
  gateCache: GateCache | null; // the speculative gate's hardened outputs, reused by finalizeWinner (no re-harden)
  wave: number; // its own wave counter (root: wave 0 scores the scout seeds, 1..N research)
  bestOpen: number;
  stopReason: StopReason | null;

  // ── finalize outcome (own) ──
  rabbitHolesOut: RabbitHoleOut[];
  synthesiserOut: ReportOut | null;
  reportOk: boolean;

  constructor(g: RunGlobals, id: BrainerIdentity) {
    this.name = id.name;
    this.parentName = id.parentName;
    this.mandate = id.mandate;
    this.trail = id.trail;
    this.depth = id.depth;
    this.status = 'active';
    this.gate = null;
    // globals by reference (set once, shared, never mutated mid-crawl)
    this.scout = g.scout;
    this.scoutRabbitHoles = g.scoutRabbitHoles;
    this.highValueSources = g.highValueSources;
    this.languageGuidance = g.languageGuidance;
    // own store
    this.rabbitHoles = [];
    this.nextId = 1;
    this.pursuedKeys = new Set();
    this.pursuedRefs = new Set();
    this.pursuedList = [];
    this.pursuedArchive = [];
    // own accumulators
    this.resultSoFar = null;
    this.topScores = [];
    this.waveLog = [];
    this.resultLog = [];
    this.validatorLog = [];
    this.lastValidatorMissing = '';
    this.coord = null;
    this.lookupNext = [];
    this.starvedWaves = 0;
    this.gateCache = null;
    this.wave = 1;
    this.bestOpen = 0;
    this.stopReason = null;
    // own finalize outcome
    this.rabbitHolesOut = [];
    this.synthesiserOut = null;
    this.reportOk = false;
  }

  get isRoot(): boolean {
    return this.parentName === null;
  }
}

// SPAWN — a clean deep-copy of the parent into a focused CHILD brainer. New arrays + new Sets (JSON-cloned plain
// data, zero shared references) so neither brainer can corrupt the other's store; the parent's resultSoFar is
// cloned as the child's SEED (the parent-authored `mandate` is what aims it). The run globals propagate by
// reference (the constructor copies them off the parent, which already holds them). depth = parent.depth + 1;
// the child joins at the parent's current wave. The engine calls this when it honors a `spawn` delta (caps first).
export function spawnBrainer(
  parent: BrainerState,
  id: { name: string; mandate: string; trail: string },
): BrainerState {
  const child = new BrainerState(parent, {
    name: id.name,
    parentName: parent.name,
    mandate: id.mandate,
    trail: id.trail,
    depth: parent.depth + 1,
  });
  // deep-copy the parent's store — clean branch (no shared refs): JSON-clone the plain-data arrays, fresh Sets.
  child.rabbitHoles = JSON.parse(JSON.stringify(parent.rabbitHoles));
  child.pursuedArchive = JSON.parse(JSON.stringify(parent.pursuedArchive));
  child.nextId = parent.nextId;
  child.pursuedKeys = new Set(parent.pursuedKeys);
  child.pursuedRefs = new Set(parent.pursuedRefs);
  child.pursuedList = parent.pursuedList.slice();
  child.topScores = parent.topScores.slice();
  // the parent AUTHORS the child's resultSoFar — a deep clone of its own living memory, the seed the mandate aims.
  child.resultSoFar = parent.resultSoFar ? JSON.parse(JSON.stringify(parent.resultSoFar)) : null;
  child.wave = parent.wave;
  return child;
}
