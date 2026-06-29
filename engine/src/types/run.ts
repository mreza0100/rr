// Run infra types — the engine/config plumbing: untrusted args, agent-call options, the IO/metrics logs,
// and the final returned result shape.
import type { Schema } from './schema.js';
import type {
  Confidence,
  Mode,
  RabbitHole,
  ResultSoFar,
  ScoreEntry,
  SentinelLogEntry,
  Tier,
  Effort,
  Venue,
  WaveLogEntry,
} from './domain.js';

// the injected JSON args — anything until validated, so every field is `unknown`.
export interface RawArgs {
  query?: unknown;
  mode?: unknown;
  compute?: unknown;
  computerNote?: unknown;
  thinkerNote?: unknown;
  researcherNote?: unknown;
  maxWave?: unknown;
  parallelLaneResearchAgentsPerWave?: unknown;
  parallelSourcesPerLaneResearchAgent?: unknown;
  debug?: unknown;
  debugPrompt?: unknown;
  tag?: unknown;
}

// the canonical phase-name map CONFIG.PHASE carries.
export interface PhaseMap {
  scout: string;
  crawl: string;
  finalize: string;
  debug: string;
}

// per-call options handed to agent()/retryAgent alongside the prompt.
export interface AgentOpts {
  label: string;
  phase?: string;
  model?: Tier;
  effort?: Effort;
  schema?: Schema;
  agentType?: string;
}

// one captured agent call (debug mode): exact prompt in, exact output out (or the error on degrade).
export interface IoLogEntry {
  label: string;
  model: string;
  phase: string;
  prompt: string;
  output: unknown;
  error?: string;
}

// why the crawl stopped (engine classification).
export type StopReason =
  'brainer-done' | 'collect-dry-plateau' | 'wave-cap' | 'rabbithole-dry' | 'rabbithole-empty';

// the run's diagnostic metrics (logged + fed to the debug analyst + written to _rabbitHoles-adjacent files).
export interface Metrics {
  mode: Mode;
  dir: string;
  wavesRun: number;
  stopReason: StopReason | null;
  scoutRabbitHoles: number;
  prospectorVenues: number;
  pursuedTotal: number;
  rabbitHolesFinal: number;
  bestOpenScore: number;
  topScores: number[];
  done: boolean;
  sentinelReopensForced: number;
  reportWritten: boolean;
  confidence: Confidence | null;
}

// a rabbit-hole flattened for the finalize report / _rabbitHoles.json.
export interface RabbitHoleOut {
  id: number;
  keyword: string;
  why: string;
  path: string[];
  score: number | null;
  scoreHistory: ScoreEntry[];
}

// the file bundle the workflow returns (the caller writes them).
export type Files = Record<string, string>;

// the value ResearchReport.run() resolves to.
export interface RunResult {
  query: string;
  mode: Mode;
  dir: string;
  stopReason: StopReason | null;
  done: boolean;
  tree: string[];
  verdict: string | null;
  confidence: Confidence | null;
  plan: string[];
  openQuestions: string[];
  pursued: string[];
  pursuedArchive: RabbitHole[];
  highValueSources: Venue[];
  rabbitHoles: RabbitHoleOut[];
  resultSoFar: ResultSoFar | null;
  sentinelLog: SentinelLogEntry[];
  waveLog: WaveLogEntry[];
  metrics: Metrics;
  files: Files;
}
