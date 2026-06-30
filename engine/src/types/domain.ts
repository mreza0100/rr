// Domain types — the crawl's data model, shared across the engine, store, utils, and agents.

// Run-level enums.
export type Mode = 'goal' | 'collect';
export type Tier = 'haiku' | 'sonnet' | 'opus';
export type Effort = 'medium' | 'high' | 'xhigh';
export type Confidence = 'high' | 'medium' | 'low';

// ── resultSoFar — the brainer's living memory, carried wave to wave ──
export type EvidenceStatus = 'settled' | 'tentative' | 'contested';
export interface Evidence {
  fact: string;
  value: string;
  source: string;
  status: EvidenceStatus;
}
export interface Assumption {
  claim: string; // a working assumption the answer currently leans on
  basis: string; // what it rests on, and how firm that is
}
export interface ResultSoFar {
  answer: string;
  confidence: string;
  evidence: Evidence[];
  assumptions?: Assumption[];
  resolved: string[];
  openGaps: string[];
  tensions: string[];
  working: string;
}

// ── rabbit-hole store ──
export interface ScoreEntry {
  wave: number;
  score: number;
}
// an OPEN rabbit-hole in the id-keyed store.
export interface RabbitHole {
  id: number;
  keyword: string;
  why: string;
  score: number | null;
  scoreHistory: ScoreEntry[];
  path: string[];
  sources?: string[];
  note?: string; // the brainer's research directive for this lane (what to find + ranked fallbacks); rides to the scheduler + reader as noteFromBrainer
  ref?: string; // a concrete fetch target (URL/DOI) this lane should fetch directly instead of WebSearching
  failCount?: number; // how many times the validator has reopened this lane after a failed/thin return (capped)
}
// a footer-surfaced lead (scout / researcher) before it enters the store.
export interface RabbitHoleSeed {
  keyword: string;
  why: string;
}
// a follow-the-citation target the page-reader surfaces: a concrete URL/DOI the page points to, worth fetching directly.
export interface NextSource {
  ref: string;
  why: string;
}
// a scout/fresh lead carrying its inherited trail, ready to seed the store.
export interface SeedLead {
  keyword: string;
  why: string;
  path: string[];
  ref?: string; // when set, the lane fetches this URL/DOI directly (a followed citation)
}
// a brainer-originated lead to PARK in the store (`add`).
export interface ScoredLead {
  keyword: string;
  why: string;
  score: number;
}
// arguments to addRabbitHole — a seed plus optional score/path/ref and the wave it is added on.
export interface AddRabbitHoleArgs {
  keyword: string;
  why?: string;
  path?: string[];
  score?: number;
  wave: number;
  ref?: string; // a concrete fetch target (URL/DOI) for the lane to fetch directly
}

// ── scout / prospector / researcher findings ──
export interface Page {
  url: string;
  summary: string;
  rabbitHoles?: RabbitHoleSeed[];
}
export interface Venue {
  source: string;
  goodFor: string;
  lang?: string; // venue's language (ISO-ish code or name); absent ⇒ English
}
// a researcher's page-reading handed back to the brainer.
export interface Finding {
  rabbitHole: string;
  summary: string;
  trail?: string;
}

// ── research scheduler / reader (B4/B5) ──
// a sized source the scheduler discovered for a lane: the cache path + its token/char size, ready for bin-packing.
export interface SchedulerSource {
  source: string; // the exact url or DOI
  path: string; // the local cache file path returned by the size_only fetch
  size: number; // size in tokens (the over-count heuristic from size_only)
  chars: number; // size in raw characters (drives the char windows)
}
// one scheduler-discovered lane: its rabbit-hole id + the sources chosen for it.
export interface SchedulerLane {
  id: number;
  sources: SchedulerSource[];
}
// one packed read instruction handed to a reader: a char window [offset, offset+limit) of one cache file.
export interface ReadSlice {
  source: string; // the url/DOI this slice came from (a label for the reader)
  cachePath: string; // the cache file to read from disk
  offset: number; // char offset to start at
  limit: number; // number of chars to read
}

// ── brainer deltas (its per-wave output, see agents.ts Coord) ──
export interface RescoreItem {
  id: number;
  score: number;
}
export interface RenameItem {
  id: number;
  keyword: string;
  why?: string;
}
// one `lookupNext` item: EITHER {id} (a stored lead) OR {keyword,why,score,…} (originate-and-pursue-now).
export interface LookupItem {
  id?: number;
  keyword?: string;
  why?: string;
  score?: number;
  sources?: string[];
  note?: string; // the research directive for this lane — what to find + ranked fallbacks; steers BOTH the scheduler (source pick) and the reader (extraction); distinct from `why`
  ref?: string; // a concrete fetch target (URL/DOI) the lane fetches directly instead of WebSearching
}
export interface Stop {
  done: boolean;
  reason: string;
  lost?: boolean; // CHILD brainers only: the branch proved a dead end → abandon it (quiet death, no finalize). The root can never set this.
}
// a brainer's OPTIONAL, at-most-one-per-wave spawn directive: aim a focused child brainer at a branch worth a dedicated
// brain. `id` hands off an open rabbit-hole; or `keyword`+`why` originate the branch. `mandate` is the parent-authored
// directive that aims the child. Only emitted when the brainer is SURE the branch deserves the (expensive) spawn.
export interface Spawn {
  id?: number;
  keyword?: string;
  why?: string;
  mandate: string;
}

// ── finalize ──
export interface FactToHarden {
  fact: string;
  why: string;
}
// a hardened fact handed to the brain finalize-compute + judge + synthesiser.
export interface CleanReport {
  fact: string;
  why: string;
  clean: string;
}

// ── per-wave / per-run logs ──
export interface WaveLogEntry {
  wave: number;
  pursued: string[];
  newRabbitHoles?: number;
  rabbitHoles?: number;
  topScore: number;
  done: boolean;
  reason: string;
}
export interface ValidatorLogEntry {
  wave: number;
  enough: boolean | null;
  reopened: string[]; // lanes moved back to the open store for re-pursuit
  cappedGaps: string[]; // lanes that failed too often — surfaced to the brainer as known gaps, not reopened
  missing: string[];
}
export interface ResultLogEntry {
  wave: number;
  resultSoFar: ResultSoFar | null;
}
export interface LaneRecord {
  wave: number;
  keyword: string;
  assignedVenues: string[];
  summary: string | null;
  rabbitHoles: string[];
}

// the minimal store surface the reducers in store.ts read+mutate; ResearchReport satisfies it too.
export interface StoreState {
  rabbitHoles: RabbitHole[];
  nextId: number;
  pursuedKeys: Set<string>;
  pursuedRefs: Set<string>; // norm(ref) of every pursued URL/DOI — so a followed citation is never fetched twice
  pursuedList: string[];
  pursuedArchive: RabbitHole[];
}
