import { CONFIG } from './config.js';
import {
  norm,
  lab,
  padIdx,
  lastScore,
  openLine,
  trailOf,
  withPrompt,
  waveMd,
  PROMPT_LOG,
  laneCount,
} from './utils/index.js';
import {
  scout,
  prospector,
  brainer,
  BRAIN_COMPUTE,
  buildBrainerCompute,
  sentinel,
  validator,
  researcher,
  initiator,
  refiner,
  judge,
  synthesiser,
  debugAnalyst,
} from './agents/index.js';
import {
  addRabbitHole,
  applyDeltas,
  resolveLookupNext,
  pursue,
  reopenRabbitHole,
} from './store.js';
import type {
  AgentOpts,
  JudgeOut,
  BrainComputeOut,
  CleanReport,
  Coord,
  DiagOut,
  FactToHarden,
  Files,
  Finding,
  InitiatorOut,
  IoLogEntry,
  LaneRecord,
  Metrics,
  RabbitHole,
  RabbitHoleOut,
  RabbitHoleSeed,
  RefineOut,
  ReportOut,
  ResearchOut,
  ResultLogEntry,
  ResultSoFar,
  RunResult,
  ScoutOut,
  SeedLead,
  SentinelLogEntry,
  SentinelOut,
  SourcesOut,
  StopReason,
  Tier,
  ValidatorLogEntry,
  ValidatorOut,
  Venue,
  WaveLogEntry,
} from './types/index.js';

// L7 retry indirection — wraps every agent() call; the _agent alias keeps it from rewriting itself.
const _agent = agent;
// Debug capture (opt-in via arg.debug): the raw agent I/O + the full run-log stream, consumed by the end Debug & Analysis agent.
const IO_LOG: IoLogEntry[] = [];
const LOG_BUFFER: string[] = [];
const _log = globalThis.log;
try {
  globalThis.log = (m?: unknown) => {
    if (CONFIG.debug) LOG_BUFFER.push(typeof m === 'string' ? m : String(m));
    return _log(m);
  };
} catch (e) {
  /* log not writable → run-log just won't be buffered */
}
// run a sub-agent with AGENT_RETRIES retries, narrowing the result to its agent's typed `*Out` shape (T); degrades to null when exhausted.
const retryAgent = async <T>(prompt: string, opts: AgentOpts): Promise<T | null> => {
  if (opts && opts.label) PROMPT_LOG[opts.label] = prompt;
  for (let attempt = 0; attempt <= CONFIG.AGENT_RETRIES; attempt++) {
    try {
      const out = (await _agent(prompt, opts)) as T;
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
const runArgsMd = (): string => '> **Run arguments:** `' + JSON.stringify(CONFIG.rawArgs) + '`\n\n';

// ─────────────────────────────────────────────────────────────────────────────
// ResearchReport — the pipeline. Holds the crawl state; each method is a phase. Each agent's tier +
// effort + schema + prompt-builder + template live in its own src/agents/<agent>/ module (shared
// fragments in agents/shared.ts); the store reducers live in store.ts (called with `this`).
// ─────────────────────────────────────────────────────────────────────────────
export class ResearchReport {
  // scout seed
  scout: ScoutOut | null;
  scoutRabbitHoles: SeedLead[];
  // prospector seed (set by runProspect) — high-value source venues the brainer assigns per lane
  highValueSources: Venue[];
  languageGuidance: string; // prospector's non-English routing note (''=English-dominated); threads into the brainer every wave
  sourcesReasoning: string;
  laneRecords: LaneRecord[]; // debug: per lane-researcher feed for the venue-utilization analysis
  // crawl accumulators (persist across waves)
  pursuedKeys: Set<string>;
  pursuedRefs: Set<string>; // L3: norm(ref) of every fetched URL/DOI — dedup so a followed citation is never fetched twice
  pursuedList: string[];
  pursuedArchive: RabbitHole[]; // L2: rabbit-holes are MOVED here on pursue (no delete-on-pursue)
  topScores: number[]; // L2: max lookupNext score per wave — the decay signal
  waveLog: WaveLogEntry[]; // slim per-wave log — feeds §2 narrative / sentinel / debug
  resultLog: ResultLogEntry[]; // per-wave resultSoFar snapshots — for the debug agent
  sentinelReopensUsed: number; // L4: how many times the goal-mode sentinel has forced an extra wave
  sentinelLog: SentinelLogEntry[];
  lastSentinelReason: string; // a crawl-sentinel rejection (1 line) → a standing reminder threaded into the brainer to raise its bar before declaring done again; '' when none
  validatorLog: ValidatorLogEntry[]; // per-wave coverage-gate record (reopened lanes + capped known-gaps)
  lastValidatorMissing: string; // the last wave's validator gaps → threaded into the next brainer; '' when none

  files: Files;
  rabbitHoles: RabbitHole[]; // OPEN rabbit-hole store (id-keyed); scoreHistory rides natively on the id
  nextId: number;
  resultSoFar: ResultSoFar | null; // the run's living MEMORY — carried wave to wave
  // crawl outcome (set by runCrawl)
  coord: Coord | null;
  wave: number;
  bestOpen: number;
  stopReason: StopReason | null;
  // finalize outcome (set by runFinalize) — this.synthesiserOut holds the synthesiser's REPORT
  rabbitHolesOut: RabbitHoleOut[];
  synthesiserOut: ReportOut | null;
  reportOk: boolean;

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
    wave: number,
    findings: Finding[],
    phaseName: string = CONFIG.PHASE.crawl,
  ): Promise<Coord | null> {
    const open = this.rabbitHoles.map(openLine);
    return retryAgent<Coord>(
      brainer.buildPrompt({
        wave,
        query: CONFIG.query,
        rubric: CONFIG.RUBRIC,
        landscape: this.scout!.landscape,
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
  venuesFor(sources?: string[]): Venue[] {
    if (!sources || !sources.length) return [];
    return sources.map(
      (s) => this.highValueSources.find((v) => v.source === s) || { source: s, goodFor: '' },
    );
  }

  // dispatch one haiku lane-researcher per pick, in parallel — each carries its full TRAIL + the venues the brainer assigned its lane.
  // Used by the crawl waves (tag='w'+wave) and the finalize judge crawl-reopen (tag='reopen'). Returns each lane's ResearchOut or null.
  async runResearchers(
    picks: RabbitHole[],
    tag: string,
    phaseName: string,
  ): Promise<(ResearchOut | null)[]> {
    return parallel(
      picks.map((p) => () => {
        // per-lane source count: auto → derived from the number of venues the brainer assigned this lane (capped 5, default 2); manual → the fixed clamped knob.
        const srcCount =
          CONFIG.parallelSourcesPerLaneResearchAgent === 'auto'
            ? Math.min(5, (p.sources && p.sources.length) || 2)
            : CONFIG.parallelSourcesPerLaneResearchAgent;
        return retryAgent<ResearchOut>(
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
    wave: number,
    waveLog: WaveLogEntry[],
    pursuedList: string[],
    lastBrainer: Coord,
  ): Promise<SentinelOut | null> {
    const rabbitHoles = this.rabbitHoles.map(openLine);
    return retryAgent<SentinelOut>(
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
    wave: number,
    requests: { id: number; keyword: string; why: string }[],
    findings: { keyword: string; intro: string }[],
    nullLanes: string[],
  ): Promise<ValidatorOut | null> {
    return retryAgent<ValidatorOut>(
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
  async prospect(model: Tier): Promise<SourcesOut | null> {
    return retryAgent<SourcesOut>(
      prospector.buildPrompt({
        query: CONFIG.query,
        landscape: this.scout!.landscape,
        sources: this.scout!.pages.map((p) => p.url),
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
  async runScout(): Promise<SeedLead[]> {
    phase(CONFIG.PHASE.scout);
    log('· scout DISPATCH · ' + scout.tier);
    const scoutOut = await retryAgent<ScoutOut>(
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
    const scoutRabbitHoles: SeedLead[] = scoutOut.pages.flatMap((p) =>
      (p.rabbitHoles || []).map((l) => ({ keyword: l.keyword, why: l.why, path: [] as string[] })),
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
  async runProspect(): Promise<void> {
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
  async runCrawl(scoutRabbitHoles: SeedLead[]): Promise<void> {
    const scoutOut = this.scout!;

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

    const seedFindings: Finding[] = scoutOut.pages.map((p) => ({
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
        const findings: Finding[] = raw.map((r, i) => ({
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
        const fresh: SeedLead[] = raw.flatMap((r, i) =>
          r && r.rabbitHoles
            ? r.rabbitHoles.map((l) => ({
                keyword: l.keyword,
                why: l.why,
                path: [...(toPursue[i].path || []), toPursue[i].keyword],
              }))
            : [],
        );
        // FOLLOW-THE-LINKS: each page's top outbound citations become ref-carrying leads the next lane fetches directly.
        const freshSources: SeedLead[] = raw.flatMap((r, i) =>
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
          const failedIds = new Set<number>();
          toPursue.forEach((p, i) => {
            if (!raw[i]) failedIds.add(p.id);
          });
          if (val && Array.isArray(val.checks))
            val.checks.forEach((c) => {
              if (c && c.fulfilled === false && typeof c.id === 'number') failedIds.add(c.id);
            });
          const reopened: string[] = [];
          const cappedGaps: string[] = [];
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
            .filter(Boolean) as RabbitHole[];
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
    const stopReason: StopReason = coord.stop.done
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
    facts: FactToHarden[],
    directive: string,
    passTag: string,
  ): Promise<CleanReport[]> {
    const refined = await parallel(
      facts.map(
        (f, i) => () =>
          retryAgent<RefineOut>(
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
    const cleanReports: CleanReport[] = facts.map((f, i) => ({
      fact: f.fact,
      why: f.why,
      clean: (refined[i] && refined[i]!.report) || '(refine failed)',
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
                ((refined[i] && refined[i]!.report) || '_(refine failed)_'),
            )
            .join('\n\n')
        : '_no facts to harden_') +
      '\n';
    return cleanReports;
  }

  // JUDGE — the TERMINAL skeptic of the finalize phase. Judges the hardened answer (goal met, verification real, derivation valid) and
  // names the precise fix when not. When compute is off, needsCompute/computeSound are forced (no derivation path). Bounded by MAX_JUDGE_PASSES.
  async runJudge(
    cleanReports: CleanReport[],
    focus: string,
    pass: number,
  ): Promise<JudgeOut | null> {
    log(
      '· finalize · judge · ' + judge.tier + ' · judging the hardened answer (pass ' + pass + ')',
    );
    const out = await retryAgent<JudgeOut>(
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
  async reopenCrawl(leads: RabbitHoleSeed[]): Promise<void> {
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
      .filter(Boolean) as RabbitHole[];
    if (!picks.length) {
      log('· finalize · judge reopen · no fresh leads (all already pursued)');
      return;
    }
    pursue(this, picks);
    const raw = await this.runResearchers(picks, 'reopen', CONFIG.PHASE.finalize);
    const findings: Finding[] = raw.map((r, i) => ({
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
  async runFinalize(): Promise<void> {
    phase(CONFIG.PHASE.finalize);
    const rabbitHolesOut: RabbitHoleOut[] = this.rabbitHoles
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
    const plan = await retryAgent<InitiatorOut>(
      initiator.buildPrompt({
        query: CONFIG.query,
        resultSoFar: this.resultSoFar,
        waveLog: this.waveLog,
        landscape: this.scout!.landscape,
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
    const judgeLog: JudgeOut[] = [];
    const computeDirectives: string[] = [];
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
        const out = await retryAgent<BrainComputeOut>(
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
    const agg = await retryAgent<ReportOut>(
      synthesiser.buildPrompt({
        mode: CONFIG.mode,
        query: CONFIG.query,
        landscape: this.scout!.landscape,
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
      this.files['result.md'] = runArgsMd() + agg!.report; // surface the launch args at the top of the deliverable
      log(
        '· finalize DONE · confidence=' +
          agg!.confidence +
          ' · plan=' +
          (agg!.plan || []).length +
          ' step(s) · openQ=' +
          (agg!.openQuestions || []).length,
      );
    } else {
      log('✗ finalize FAILED — no report returned');
    }
    this.synthesiserOut = agg;
    this.reportOk = reportOk;
  }

  // metrics + _rabbitHoles.json + the crawl-tree render, then the final return shape.
  buildResult(): RunResult {
    const { synthesiserOut, reportOk, rabbitHolesOut, coord, wave } = this;

    const metrics: Metrics = {
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
      done: coord!.stop.done,
      sentinelReopensForced: this.sentinelReopensUsed,
      reportWritten: reportOk,
      confidence: reportOk ? synthesiserOut!.confidence : null,
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
    type TreeNode = { kw: string; children: Map<string, TreeNode>; score: number | null };
    const treeRoot: TreeNode = { kw: CONFIG.query, children: new Map(), score: null };
    for (const l of this.pursuedArchive) {
      let cur = treeRoot;
      for (const kw of [...(l.path || []), l.keyword]) {
        const k = norm(kw);
        if (!cur.children.has(k)) cur.children.set(k, { kw, children: new Map(), score: null });
        cur = cur.children.get(k)!;
      }
      cur.score =
        l.scoreHistory && l.scoreHistory.length
          ? l.scoreHistory[l.scoreHistory.length - 1].score
          : null;
    }
    const treeLines: string[] = [];
    const walkTree = (node: TreeNode, prefix: string): void => {
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
      done: coord!.stop.done,
      tree: [goalLine, ...treeLines],
      verdict: reportOk ? synthesiserOut!.verdict : null,
      confidence: reportOk ? synthesiserOut!.confidence : null,
      plan: reportOk ? synthesiserOut!.plan : [],
      openQuestions: reportOk ? synthesiserOut!.openQuestions : [],
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
  async runDebug(metrics: Metrics): Promise<void> {
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
    const diag = await retryAgent<DiagOut>(
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

  async run(): Promise<RunResult> {
    const scoutRabbitHoles = await this.runScout();
    await this.runProspect(); // name the high-value venues before the crawl
    await this.runCrawl(scoutRabbitHoles);
    await this.runFinalize();
    const result = this.buildResult();
    if (CONFIG.debug) await this.runDebug(result.metrics); // last phase, opt-in: Debug & Analysis agent → _debug.md
    return result;
  }
}
