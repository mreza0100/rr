import { CONFIG } from './config.js';
import {
  norm,
  clip,
  lab,
  padIdx,
  lastScore,
  trailOf,
  withPrompt,
  waveMd,
  resultSoFarMd,
  laneCount,
} from './utils/index.js';
import { brainer, refiner } from './agents/index.js';
import { runScout } from './agents/scout/run.js';
import { runProspector } from './agents/prospector/run.js';
import { runBrainer, runBrainerCompute } from './agents/brainer/run.js';
import { runValidator } from './agents/validator/run.js';
import { runScheduler } from './agents/researchScheduler/run.js';
import { runResearchers } from './agents/researcher/run.js';
import { runInitiator } from './agents/initiator/run.js';
import { runRefine } from './agents/refiner/run.js';
import { runJudge, COMPUTE_LIMIT_PREFIX } from './agents/judge/run.js';
import { runSynthesiser } from './agents/synthesiser/run.js';
import { runDebug } from './agents/debugAnalyst/run.js';
import {
  addRabbitHole,
  applyDeltas,
  resolveLookupNext,
  pursue,
  reopenRabbitHole,
} from './store.js';
import { BrainerState, spawnBrainer } from './brainerState.js';
import type {
  CleanReport,
  Coord,
  Files,
  Finding,
  JudgeOut,
  LaneRecord,
  Metrics,
  RabbitHole,
  RabbitHoleOut,
  RabbitHoleSeed,
  ReportOut,
  ResultLogEntry,
  ResultSoFar,
  RunResult,
  SchedulerSource,
  ScoutOut,
  SeedLead,
  StopReason,
  ValidatorLogEntry,
  Venue,
  WaveLogEntry,
} from './types/index.js';

log('▶ RR START · mode=' + CONFIG.mode + ' · maxWave=' + CONFIG.maxWave + ' · dir=' + CONFIG.DIR);

// compact "Run arguments" record — the COMPLETE launch args (CONFIG.rawArgs), verbatim as received. Surfaced at the top of result.md
// (and persisted as the `args` object in _rabbitHoles.json) so every output file records exactly how the run was launched.
const runArgsMd = (): string => '> **Run arguments:** `' + JSON.stringify(CONFIG.rawArgs) + '`\n\n';

// ─────────────────────────────────────────────────────────────────────────────
// ResearchReport — the pipeline backbone. Holds the crawl state; each phase method (runCrawl / runFinalize /
// reopenCrawl / buildResult / run) orchestrates the loop and owns every `files[name] = …` write. The per-agent
// work (buildPrompt → retryAgent → artifact) lives in each agent's src/agents/<agent>/run.ts; the store reducers
// live in store.ts; the shared agent caller (retryAgent + the debug I/O buffers) lives in runtime.ts.
// ─────────────────────────────────────────────────────────────────────────────
export class ResearchReport {
  // ── run globals — set ONCE by the scout + prospector before any brainer exists, then shared read-only
  // (by reference) into every BrainerState. Nothing mutates these during the crawl. ──
  scout: ScoutOut | null;
  scoutRabbitHoles: SeedLead[];
  highValueSources: Venue[]; // prospector's high-value source venues the brainer assigns per lane
  languageGuidance: string; // prospector's non-English routing note (''=English-dominated)
  sourcesReasoning: string;
  laneRecords: LaneRecord[]; // debug: per-lane reader feed (venue-utilization analysis) — a GLOBAL sink across all brainers

  files: Files; // every output artifact — written ONLY by the engine
  liveBrainers: BrainerState[]; // the brainer tree: the root + every spawned child (one entry when maxParallelBrainers=1)
  winner: BrainerState | null; // the first brainer whose speculative gate the judge upheld — owns result.md
  lastWaveTriggered: boolean; // a gate passed → run ONE more global wave (wrap-up), then drain

  constructor() {
    this.scout = null;
    this.scoutRabbitHoles = [];
    this.highValueSources = [];
    this.languageGuidance = '';
    this.sourcesReasoning = '';
    this.laneRecords = [];
    this.files = {};
    this.liveBrainers = [];
    this.winner = null;
    this.lastWaveTriggered = false;
  }

  // SCHEDULER (B4) — thin delegator to runScheduler (researchScheduler/run.ts); the crawl + finalize reopen route
  // their source discovery through here. Returns a Map<lane id, sources> the engine bin-packs into reader-units.
  scheduleSources(
    bs: BrainerState,
    picks: RabbitHole[],
    tag: string,
    phaseName: string,
  ): Promise<Map<number, SchedulerSource[]>> {
    return runScheduler(bs, picks, tag, phaseName);
  }

  // Crawl: wave 0 = score the scout rabbit-holes; waves 1..N = pursue → research → re-coordinate until the brainer stops.
  async runCrawl(bs: BrainerState, scoutRabbitHoles: SeedLead[]): Promise<void> {
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
      addRabbitHole(bs, { keyword: l.keyword, why: l.why, path: l.path || [], wave: 0 }),
    );

    const seedFindings: Finding[] = scoutOut.pages.map((p) => ({
      rabbitHole: p.url,
      summary: p.summary,
    }));
    log(
      '· brainer-w0 DISPATCH · ' +
        brainer.tier +
        ' · scoring ' +
        bs.rabbitHoles.length +
        ' rabbit-hole(s)',
    );
    let coord = await runBrainer(bs, 0, seedFindings, CONFIG.PHASE.scout);
    if (!coord) {
      log('✗ brainer-w0 DIED');
      throw new Error('brainer died at wave 0');
    }
    applyDeltas(bs, coord, 0);
    if (coord.resultSoFar) bs.resultSoFar = coord.resultSoFar;
    bs.resultLog.push({ wave: 0, resultSoFar: bs.resultSoFar });
    let lookupNext = resolveLookupNext(bs, coord, 0, laneCount);
    bs.topScores.push(lookupNext.length ? Math.max(...lookupNext.map((p) => p.score ?? 0)) : 0);
    bs.waveLog.push({
      wave: 0,
      pursued: [],
      newRabbitHoles: scoutRabbitHoles.length,
      rabbitHoles: bs.rabbitHoles.length,
      topScore: bs.topScores[bs.topScores.length - 1],
      done: coord.stop.done,
      reason: coord.stop.reason,
    });
    log(
      '· brainer-w0 RETURN · rabbitHoles=' +
        bs.rabbitHoles.length +
        ' · lookupNext=' +
        lookupNext.length +
        '/' +
        (coord.lookupNext || []).length +
        ' · topScore=' +
        bs.topScores[bs.topScores.length - 1] +
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
      waveMd(0, coord, lookupNext, [], bs.rabbitHoles),
    );

    phase(CONFIG.PHASE.crawl); // scout → prospector → seed brainer = the Scout phase; waves 1..N = Crawl
    let wave = 1;
    let dryStop = false; // collect-mode dry: set when the novelty trajectory has plateaued (diminishing returns)
    let starvedStop = false; // B6: set when the scheduler/readers starved for MAX_STARVED_WAVES in a row
    let starvedWaves = 0; // consecutive all-null / empty-schedule waves
    const baseCap = CONFIG.maxWave === 'auto' ? CONFIG.HARD_CAP : CONFIG.maxWave; // effective wave cap; 'auto' rides up to HARD_CAP, the brainer stops it sooner
    // the crawl runs waves until the brainer declares done, the store dries up, the collect novelty plateaus, or the wave cap is hit.
    while (
      wave <= Math.min(CONFIG.HARD_CAP, baseCap) &&
      !coord.stop.done &&
      lookupNext.length &&
      !dryStop
    ) {
      // PURSUE — move lookupNext into the pursued-archive (keeps id + scoreHistory + path) and out of the open store, so the brainer
      // re-scores a clean open-only set next wave.
      pursue(bs, lookupNext);
      log(
        '— wave ' +
          wave +
          ' · pursuing ' +
          lookupNext.length +
          ' rabbit-hole(s) · pursued-total=' +
          bs.pursuedList.length +
          ' · archived=' +
          bs.pursuedArchive.length,
      );

      // RESEARCH wave — the SCHEDULER discovers + sizes the sources for the wave's lanes, then code bin-packs
      // each lane and runs ONE sequential reader thread per lane (parallel across lanes); each carries its full TRAIL.
      const toPursue = lookupNext;
      const schedule = await this.scheduleSources(bs, toPursue, 'w' + wave, CONFIG.PHASE.crawl);
      const raw = await runResearchers(bs, toPursue, schedule, 'w' + wave, CONFIG.PHASE.crawl);
      // B6 — guard scheduler-DEATH starvation: a wave is "starved" when the scheduler returned NO usable sources at
      // all (an empty map, or every lane's source list empty). After MAX_STARVED_WAVES in a row, break with an
      // explicit stopReason instead of grinding to HARD_CAP with nothing to read. (An all-null wave whose schedule
      // DID carry sources is a reader failure — left to the validator reopen/cap + brainer-convergence path, which
      // this guard must not preempt.)
      const waveStarved = [...schedule.values()].every((srcs) => !srcs || !srcs.length);
      starvedWaves = waveStarved ? starvedWaves + 1 : 0;
      if (starvedWaves >= CONFIG.MAX_STARVED_WAVES) {
        starvedStop = true;
        log(
          '  wave ' +
            wave +
            ' · scheduler-starved (' +
            starvedWaves +
            ' consecutive empty waves) → stopping',
        );
        break;
      }
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
      const beforeAdd = bs.rabbitHoles.length;
      fresh.forEach((l) =>
        addRabbitHole(bs, { keyword: l.keyword, why: l.why, path: l.path, wave }),
      );
      freshSources.forEach((l) =>
        addRabbitHole(bs, { keyword: l.keyword, why: l.why, path: l.path, wave, ref: l.ref }),
      );
      const newCount = bs.rabbitHoles.length - beforeAdd;
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
      const anyThin = findings.some((f) => !f.summary || f.summary.length < CONFIG.VALIDATOR_THIN);
      if (anyNull || anyThin) {
        const requests = toPursue.map((p) => ({ id: p.id, keyword: p.keyword, why: p.why }));
        const vFindings = findings.map((f) => ({
          keyword: f.rabbitHole,
          intro: (f.summary || '').slice(0, CONFIG.VALIDATOR_INTRO_CHARS),
        }));
        const nullLanes = toPursue.filter((p, i) => !raw[i]).map((p) => p.keyword);
        const val = await runValidator(bs, wave, requests, vFindings, nullLanes);
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
          const rh = bs.pursuedArchive.find((r) => r.id === id);
          if (!rh) continue;
          if ((rh.failCount || 0) >= CONFIG.MAX_LANE_REFAILS) cappedGaps.push(rh.keyword);
          else reopened.push(reopenRabbitHole(bs, rh).keyword);
        }
        const missing = (val && val.missing) || [];
        bs.lastValidatorMissing = [
          ...missing,
          ...cappedGaps.map((k) => k + ' (lane retried twice — treat as a known gap)'),
        ]
          .join('; ')
          .slice(0, CONFIG.VALIDATOR_MISSING_CHARS);
        bs.validatorLog.push({
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
        bs.lastValidatorMissing = '';
      }

      // BRAINER — the single Opus brain re-scores the open store via deltas, updates the running result, and sets the next direction.
      log(
        '  wave ' +
          wave +
          ' · brainer DISPATCH · ' +
          brainer.tier +
          ' · open=' +
          bs.rabbitHoles.length,
      );
      const nextCoord = await runBrainer(bs, wave, findings);
      if (!nextCoord) {
        log('✗ brainer-w' + wave + ' DIED — stopping');
        break;
      }
      coord = nextCoord;
      applyDeltas(bs, coord, wave);
      if (coord.resultSoFar) bs.resultSoFar = coord.resultSoFar;
      bs.resultLog.push({ wave, resultSoFar: bs.resultSoFar });
      lookupNext = resolveLookupNext(bs, coord, wave, laneCount);
      bs.topScores.push(lookupNext.length ? Math.max(...lookupNext.map((p) => p.score ?? 0)) : 0);
      bs.waveLog.push({
        wave,
        pursued: toPursue.map((p) => p.keyword),
        newRabbitHoles: newCount,
        rabbitHoles: bs.rabbitHoles.length,
        topScore: bs.topScores[bs.topScores.length - 1],
        done: coord.stop.done,
        reason: coord.stop.reason,
      });
      this.files[padIdx(wave + 3) + '-wave-' + wave + '.md'] = withPrompt(
        'brainer-w' + wave,
        waveMd(wave, coord, lookupNext, findings, bs.rabbitHoles),
      );
      log(
        '  wave ' +
          wave +
          ' · rabbitHoles=' +
          bs.rabbitHoles.length +
          ' · lookupNext=' +
          lookupNext.length +
          '/' +
          (coord.lookupNext || []).length +
          ' · topScore=' +
          bs.topScores[bs.topScores.length - 1] +
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
      // B9 — peak/window are computed over the RESEARCH waves only (topScores.slice(1)) so the inflated wave-0 SEED
      // score never masks a plateau; PLATEAU_MIN_WAVES gates on the research-wave count (3 = 3 research waves).
      const crawlScores = bs.topScores.slice(1);
      if (
        CONFIG.mode === 'collect' &&
        !coord.stop.done &&
        crawlScores.length >= CONFIG.PLATEAU_MIN_WAVES
      ) {
        const peak = Math.max(...crawlScores);
        const window = crawlScores.slice(-CONFIG.PLATEAU_WINDOW);
        if (peak > 0 && window.every((s) => s <= peak * CONFIG.QUERY_PLATEAU)) {
          dryStop = true;
          log(
            '  wave ' +
              wave +
              ' · collect DRY — top novelty plateaued (' +
              window.join(',') +
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

    // L2 stop classification: the brainer's own satisficing `done` (primary), else why the loop stopped.
    const bestOpen = bs.rabbitHoles.length
      ? Math.max(...bs.rabbitHoles.map((r) => lastScore(r) ?? 0))
      : 0;
    // Classify in priority order: the brainer's own `done`, then a starved scheduler, then an EMPTY store (an
    // empty-store exit is labelled BEFORE the plateau label — B9), then the collect plateau, the wave cap, and a dry store.
    const stopReason: StopReason = coord.stop.done
      ? 'brainer-done'
      : starvedStop
        ? 'scheduler-starved'
        : !bs.rabbitHoles.length
          ? 'rabbithole-empty'
          : dryStop
            ? 'collect-dry-plateau'
            : lookupNext.length
              ? 'wave-cap'
              : 'rabbithole-dry';
    log(
      '■ crawl DONE · stopReason=' +
        stopReason +
        ' · waves=' +
        (wave - 1) +
        ' · rabbitHoles=' +
        bs.rabbitHoles.length,
    );

    // VALIDATOR output → file (every wave it ran: enough verdict + reopened lanes + capped known-gaps + missing)
    if (bs.validatorLog.length) {
      this.files[padIdx(wave + 3) + '-validator.md'] =
        '# Validator — per-wave crawl coverage gate\n\n' +
        bs.validatorLog
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
    bs.coord = coord;
    bs.wave = wave;
    bs.bestOpen = bestOpen;
    bs.stopReason = stopReason;
  }

  // CRAWL REOPEN (rare) — the judge found a real evidence gap: pursue its leads through lane readers and fold the
  // findings back into resultSoFar via a brainer pass. Bounded by the leads the judge returns (≤ laneCount, deduped vs pursued).
  async reopenCrawl(bs: BrainerState, leads: RabbitHoleSeed[], directive: string): Promise<void> {
    const picks = leads
      .filter((l) => l && l.keyword && !bs.pursuedKeys.has(norm(l.keyword)))
      .slice(0, laneCount)
      .map((l) => {
        const rh = addRabbitHole(bs, {
          keyword: l.keyword,
          why: l.why,
          path: ['⚖ judge'],
          score: CONFIG.INJECT_SCORE,
          wave: bs.wave,
        });
        // steer the finalize lane: the judge's directive becomes the lane `note` (so the scheduler + reader get
        // the same WHAT-to-find steering the crawl lanes get); fall back to the lead's own `why` if no directive.
        if (rh) rh.note = directive || l.why || '';
        return rh;
      })
      .filter(Boolean) as RabbitHole[];
    if (!picks.length) {
      log('· finalize · judge reopen · no fresh leads (all already pursued)');
      return;
    }
    pursue(bs, picks);
    const schedule = await this.scheduleSources(bs, picks, 'reopen', CONFIG.PHASE.finalize);
    const raw = await runResearchers(bs, picks, schedule, 'reopen', CONFIG.PHASE.finalize);
    const findings: Finding[] = raw.map((r, i) => ({
      rabbitHole: picks[i].keyword,
      trail: trailOf(picks[i].path, picks[i].keyword),
      summary: r ? r.summary : '(researcher failed)',
    }));
    const coord = await runBrainer(bs, bs.wave, findings, CONFIG.PHASE.finalize);
    if (coord && coord.resultSoFar) bs.resultSoFar = coord.resultSoFar;
    log('· finalize · judge reopen · folded ' + picks.length + ' lane(s) into the answer');
  }

  // Finalize (end-only). An opus INITIATOR names the load-bearing facts + the report focus → REFINEMENT: one sonnet REFINE pass per fact,
  // hardening it against the sources → an opus JUDGE judges the hardened answer and drives a bounded remediation loop (the brain DERIVES the
  // answer when one is needed / refine re-checks a mis-hardened fact / the crawl reopens on a real gap) → the opus SYNTHESISER writes the END report.
  async runFinalize(bs: BrainerState): Promise<void> {
    phase(CONFIG.PHASE.finalize);
    const rabbitHolesOut: RabbitHoleOut[] = bs.rabbitHoles
      .map((f) => ({
        id: f.id,
        keyword: f.keyword,
        why: f.why,
        path: f.path || [],
        score: lastScore(f),
        scoreHistory: f.scoreHistory,
        ...(f.note ? { note: f.note } : {}), // B8: surface the per-lane directive in _rabbitHoles.json
      }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    bs.rabbitHolesOut = rabbitHolesOut;
    const topOpen = rabbitHolesOut.slice(0, CONFIG.FINALIZE_TOP_OPEN).map((f) => f.keyword);

    // ── INITIATOR — names the load-bearing facts to harden + sets the report focus ──
    const { facts, synthFocus, artifact: initiatorMd } = await runInitiator(bs, topOpen);
    this.files[padIdx(bs.wave + 4) + '-initiator.md'] = initiatorMd;

    // ── REFINEMENT — one REFINE agent per fact (parallel): adversarially fact-checks, returns the corrected solid claim ──
    // a local writer keeps the refinement file (always the same key — re-refine overwrites) owned by the engine.
    const writeRefinement = (r: {
      cleanReports: CleanReport[];
      artifact: string;
    }): CleanReport[] => {
      this.files[padIdx(bs.wave + 5) + '-refinement.md'] = r.artifact;
      return r.cleanReports;
    };
    log('· finalize · refinement · ' + facts.length + ' fact(s) → refine · ' + refiner.tier);
    let cleanReports = writeRefinement(await runRefine(bs, facts, '', ''));
    log('· finalize · refinement DONE · ' + cleanReports.length + ' hardened fact(s)');

    // ── JUDGE loop — terminal skeptic judges, then a bounded remediation loop fixes the single biggest problem and re-judges ──
    // fold the judge's compute-off limitation (returned, not applied by the judge) into openGaps, deduped — the engine
    // is the sole layer that mutates resultSoFar (replace, never alias-mutate a shared object across the loop).
    const foldComputeLimitation = (j: JudgeOut | null): JudgeOut | null => {
      if (j && j.computeLimitation && bs.resultSoFar) {
        const gaps = bs.resultSoFar.openGaps || [];
        if (!gaps.some((g) => g.startsWith(COMPUTE_LIMIT_PREFIX)))
          bs.resultSoFar = { ...bs.resultSoFar, openGaps: [...gaps, j.computeLimitation] };
      }
      return j;
    };
    const judgeLog: JudgeOut[] = [];
    const computeDirectives: string[] = [];
    let judgement = foldComputeLimitation(await runJudge(bs, cleanReports, synthFocus, 0));
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
        const out = await runBrainerCompute(bs, cleanReports, directive, reason, pass);
        if (out && out.resultSoFar) bs.resultSoFar = out.resultSoFar;
        computeDirectives.push(directive || '(derive the answer the goal needs)');
      } else if (!judgement.verificationSound) {
        // RE-REFINE — the judge flagged a mis-hardened / rubber-stamped fact; re-run refine with its directive
        log('· finalize · judge pass ' + pass + ' → re-refine the flagged fact(s)');
        cleanReports = writeRefinement(await runRefine(bs, facts, directive, 'r' + pass + '-'));
      } else if (
        !judgement.goalMet &&
        judgement.reopenRabbitHoles &&
        judgement.reopenRabbitHoles.length
      ) {
        // CRAWL REOPEN (rare) — a real evidence/coverage gap; reopen the crawl on the judge's leads, then re-harden
        log('· finalize · judge pass ' + pass + ' → reopen the crawl on a real gap');
        await this.reopenCrawl(bs, judgement.reopenRabbitHoles, directive);
        cleanReports = writeRefinement(await runRefine(bs, facts, directive, 'r' + pass + '-'));
      } else {
        log(
          '· finalize · judge pass ' +
            pass +
            ' → no actionable remediation; proceeding to the report',
        );
        break;
      }
      judgement = foldComputeLimitation(await runJudge(bs, cleanReports, synthFocus, pass));
      if (judgement) judgeLog.push(judgement);
    }

    // JUDGE file — every pass: the four-flag verdict + reasoning + directive + any reopen
    if (judgeLog.length)
      this.files[padIdx(bs.wave + 6) + '-judge.md'] = withPrompt(
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
        ((bs.resultSoFar && bs.resultSoFar.working) || '_none_') +
        '\n';

    // ── SYNTHESISER — writes the END report (always) from the judged answer + the hardened facts ──
    const agg = await runSynthesiser(bs, cleanReports, synthFocus, topOpen);
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
    bs.synthesiserOut = agg;
    bs.reportOk = reportOk;
  }

  // metrics + _rabbitHoles.json + the crawl-tree render, then the final return shape.
  buildResult(bs: BrainerState): RunResult {
    const { synthesiserOut, reportOk, rabbitHolesOut, coord, wave } = bs;

    const metrics: Metrics = {
      mode: CONFIG.mode,
      dir: CONFIG.DIR,
      wavesRun: wave - 1,
      stopReason: bs.stopReason,
      scoutRabbitHoles: this.scoutRabbitHoles.length,
      prospectorVenues: this.highValueSources.length,
      pursuedTotal: bs.pursuedList.length,
      rabbitHolesFinal: bs.rabbitHoles.length,
      bestOpenScore: bs.bestOpen,
      topScores: bs.topScores,
      done: coord!.stop.done,
      reportWritten: reportOk,
      confidence: reportOk ? synthesiserOut!.confidence : null,
    };
    log('■ RR DONE · ' + JSON.stringify(metrics));

    this.files['_rabbitHoles.json'] = JSON.stringify(
      {
        args: CONFIG.rawArgs, // the COMPLETE set of arguments the run was launched with, verbatim
        query: CONFIG.query,
        mode: CONFIG.mode,
        stopReason: bs.stopReason,
        topScores: bs.topScores,
        highValueSources: this.highValueSources,
        rabbitHoles: rabbitHolesOut,
        pursued: bs.pursuedArchive,
      },
      null,
      2,
    );

    // CRAWL TREE — reconstruct the branching from the pursued-archive paths (the global trail record) and render it visually.
    type TreeNode = {
      kw: string;
      children: Map<string, TreeNode>;
      score: number | null;
      note?: string;
    };
    const treeRoot: TreeNode = { kw: CONFIG.query, children: new Map(), score: null };
    for (const l of bs.pursuedArchive) {
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
      if (l.note) cur.note = l.note; // B8: surface the per-lane directive on the tree leaf
    }
    // treeLines + goalLine are FULL (unclipped) — they feed the persisted _tree.md and the returned `tree`; only the
    // live terminal stream is clipped per-line (CONFIG.TREE_LOG_WIDTH) so the file keeps every keyword/note in full.
    const treeLines: string[] = [];
    const walkTree = (node: TreeNode, prefix: string): void => {
      const kids = [...node.children.values()];
      kids.forEach((c, i) => {
        const last = i === kids.length - 1;
        treeLines.push(
          prefix +
            (last ? '└─ ' : '├─ ') +
            c.kw +
            (c.score != null ? '  [' + c.score + ']' : '') +
            (c.note ? '  ‹' + c.note + '›' : ''),
        );
        walkTree(c, prefix + (last ? '   ' : '│  '));
      });
    };
    walkTree(treeRoot, '');
    const goalLine = 'GOAL: ' + CONFIG.query;
    log('');
    log('🌳 CRAWL TREE — how it branched (goal → lanes pursued · [score]):');
    log(clip(goalLine, CONFIG.TREE_LOG_WIDTH));
    treeLines.forEach((l) => log(clip(l, CONFIG.TREE_LOG_WIDTH)));
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
      stopReason: bs.stopReason,
      done: coord!.stop.done,
      tree: [goalLine, ...treeLines],
      verdict: reportOk ? synthesiserOut!.verdict : null,
      confidence: reportOk ? synthesiserOut!.confidence : null,
      plan: reportOk ? synthesiserOut!.plan : [],
      openQuestions: reportOk ? synthesiserOut!.openQuestions : [],
      pursued: bs.pursuedList,
      pursuedArchive: bs.pursuedArchive,
      highValueSources: this.highValueSources,
      rabbitHoles: rabbitHolesOut,
      resultSoFar: bs.resultSoFar,
      waveLog: bs.waveLog,
      metrics,
      files: this.files,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // MULTI-BRAINER (maxParallelBrainers > 1) — the brainer tree. The single-brainer path above
  // (runCrawl / runFinalize) is left UNTOUCHED so its proven behavior is preserved; this parallel
  // orchestration runs only when the operator opts in. Shape: a global wave loop runs every ACTIVE
  // brainer's wave concurrently; a brainer that declares done fires a speculative GATE (initiator →
  // refine → judge) WITHOUT pausing the others; the FIRST gate the judge upholds wins → one more
  // last wave → drain → the winner's report is result.md, the rest preserved as result-<name>.md.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════

  // the 01-scout.md artifact (shared/global; the single path writes its own inline copy).
  writeScoutFile(): void {
    const s = this.scout!;
    this.files['01-scout.md'] = withPrompt(
      'scout',
      '# 01 — Scout\n\n**Query:** ' +
        CONFIG.query +
        '\n\n## Landscape\n\n' +
        s.landscape +
        '\n\n## Sources\n\n' +
        s.pages
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
        ((s.deadEnds || []).map((d) => '- ' + d).join('\n') || '_none_') +
        '\n',
    );
  }

  // a brainer's INITIAL pick — one brainer call with NO preceding research (root: scores the scout seeds;
  // child: re-scores its inherited store through its mandate) → sets its first lookupNext. Mirrors wave 0.
  async pickFirst(
    bs: BrainerState,
    seedFindings: Finding[],
    gw: number,
    phaseName: string,
  ): Promise<void> {
    bs.wave = gw;
    const coord = await runBrainer(bs, gw, seedFindings, phaseName, {
      canSpawn: false,
      lastWave: false,
    });
    if (!coord) {
      bs.status = 'drained';
      log('  ✗ ' + bs.name + ' pick-first brainer died → drained');
      return;
    }
    bs.coord = coord;
    applyDeltas(bs, coord, gw);
    if (coord.resultSoFar) bs.resultSoFar = coord.resultSoFar;
    bs.resultLog.push({ wave: gw, resultSoFar: bs.resultSoFar });
    bs.lookupNext = resolveLookupNext(bs, coord, gw, laneCount);
    bs.topScores.push(
      bs.lookupNext.length ? Math.max(...bs.lookupNext.map((p) => p.score ?? 0)) : 0,
    );
    bs.waveLog.push({
      wave: gw,
      pursued: [],
      newRabbitHoles: 0,
      rabbitHoles: bs.rabbitHoles.length,
      topScore: bs.topScores[bs.topScores.length - 1],
      done: coord.stop.done,
      reason: coord.stop.reason,
    });
    this.files[bs.name + '/wave-' + gw + '.md'] = withPrompt(
      'brainer-' + (bs.isRoot ? '' : bs.name + '-') + 'w' + gw,
      waveMd(gw, coord, bs.lookupNext, seedFindings, bs.rabbitHoles),
    );
    if (coord.stop.lost && !bs.isRoot) bs.status = 'lost';
    else if (coord.stop.done) bs.status = 'done';
    else if (!bs.lookupNext.length) bs.status = 'drained';
  }

  // ONE research wave for ONE brainer: pursue its pending lanes → schedule → read → validate → re-coordinate.
  // Mutates bs; sets bs.status (done / lost / drained) and leaves bs.coord (carrying any spawn) for the caller.
  async runOneWave(
    bs: BrainerState,
    gw: number,
    isLastWave: boolean,
    phaseName: string,
    canSpawn: boolean,
  ): Promise<void> {
    bs.wave = gw;
    const toPursue = bs.lookupNext;
    pursue(bs, toPursue);
    const tag = (bs.isRoot ? '' : bs.name + '-') + 'w' + gw;
    const schedule = await this.scheduleSources(bs, toPursue, tag, phaseName);
    const raw = await runResearchers(bs, toPursue, schedule, tag, phaseName);
    const waveStarved = [...schedule.values()].every((s) => !s || !s.length);
    bs.starvedWaves = waveStarved ? bs.starvedWaves + 1 : 0;
    const findings: Finding[] = raw.map((r, i) => ({
      rabbitHole: toPursue[i].keyword,
      trail: trailOf(toPursue[i].path, toPursue[i].keyword),
      summary: r ? r.summary : '(researcher failed)',
    }));
    if (CONFIG.debug)
      raw.forEach((r, i) =>
        this.laneRecords.push({
          wave: gw,
          keyword: bs.name + ':' + toPursue[i].keyword,
          assignedVenues: toPursue[i].sources || [],
          summary: r ? r.summary : null,
          rabbitHoles: r ? (r.rabbitHoles || []).map((l) => l.keyword) : [],
        }),
      );
    raw.forEach((r, i) => {
      if (!r) return;
      const par = [...(toPursue[i].path || []), toPursue[i].keyword];
      for (const l of r.rabbitHoles || [])
        addRabbitHole(bs, { keyword: l.keyword, why: l.why, path: par, wave: gw });
      for (const s of r.nextSources || [])
        addRabbitHole(bs, {
          keyword: s.why,
          why: 'followed citation',
          path: par,
          wave: gw,
          ref: s.ref,
        });
    });
    const anyNull = raw.some((r) => !r);
    const anyThin = findings.some((f) => !f.summary || f.summary.length < CONFIG.VALIDATOR_THIN);
    if (anyNull || anyThin) {
      const requests = toPursue.map((p) => ({ id: p.id, keyword: p.keyword, why: p.why }));
      const vFindings = findings.map((f) => ({
        keyword: f.rabbitHole,
        intro: (f.summary || '').slice(0, CONFIG.VALIDATOR_INTRO_CHARS),
      }));
      const nullLanes = toPursue.filter((p, i) => !raw[i]).map((p) => p.keyword);
      const val = await runValidator(bs, gw, requests, vFindings, nullLanes);
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
        const rh = bs.pursuedArchive.find((r) => r.id === id);
        if (!rh) continue;
        if ((rh.failCount || 0) >= CONFIG.MAX_LANE_REFAILS) cappedGaps.push(rh.keyword);
        else reopened.push(reopenRabbitHole(bs, rh).keyword);
      }
      bs.lastValidatorMissing = [
        ...((val && val.missing) || []),
        ...cappedGaps.map((k) => k + ' (lane retried twice — known gap)'),
      ]
        .join('; ')
        .slice(0, CONFIG.VALIDATOR_MISSING_CHARS);
      bs.validatorLog.push({
        wave: gw,
        enough: val ? val.enough : null,
        reopened,
        cappedGaps,
        missing: (val && val.missing) || [],
      });
    } else bs.lastValidatorMissing = '';
    const coord = await runBrainer(bs, gw, findings, phaseName, { canSpawn, lastWave: isLastWave });
    if (!coord) {
      bs.status = 'drained';
      log('  ✗ ' + bs.name + ' brainer died w' + gw + ' → drained');
      return;
    }
    bs.coord = coord;
    applyDeltas(bs, coord, gw);
    if (coord.resultSoFar) bs.resultSoFar = coord.resultSoFar;
    bs.resultLog.push({ wave: gw, resultSoFar: bs.resultSoFar });
    bs.lookupNext = isLastWave ? [] : resolveLookupNext(bs, coord, gw, laneCount);
    bs.topScores.push(
      bs.lookupNext.length ? Math.max(...bs.lookupNext.map((p) => p.score ?? 0)) : 0,
    );
    bs.waveLog.push({
      wave: gw,
      pursued: toPursue.map((p) => p.keyword),
      newRabbitHoles: 0,
      rabbitHoles: bs.rabbitHoles.length,
      topScore: bs.topScores[bs.topScores.length - 1],
      done: coord.stop.done,
      reason: coord.stop.reason,
    });
    this.files[bs.name + '/wave-' + gw + '.md'] = withPrompt(
      'brainer-' + (bs.isRoot ? '' : bs.name + '-') + 'w' + gw,
      waveMd(gw, coord, bs.lookupNext, findings, bs.rabbitHoles),
    );
    log(
      '  · ' +
        bs.name +
        ' w' +
        gw +
        ' · researchers=' +
        raw.filter(Boolean).length +
        '/' +
        toPursue.length +
        ' · open=' +
        bs.rabbitHoles.length +
        ' · done=' +
        coord.stop.done +
        (coord.stop.lost ? ' · LOST' : ''),
    );
    if (coord.stop.lost && !bs.isRoot) bs.status = 'lost';
    else if (isLastWave)
      bs.status = 'drained'; // the last wave: collect, do not re-gate
    else if (coord.stop.done) bs.status = 'done';
    else if (bs.starvedWaves >= CONFIG.MAX_STARVED_WAVES) {
      bs.status = 'drained';
      bs.stopReason = 'scheduler-starved';
    } else if (!bs.lookupNext.length) {
      bs.status = 'drained';
      bs.stopReason = 'rabbithole-dry';
    } else if (CONFIG.mode === 'collect') {
      const cs = bs.topScores.slice(1);
      if (cs.length >= CONFIG.PLATEAU_MIN_WAVES) {
        const peak = Math.max(...cs);
        const win = cs.slice(-CONFIG.PLATEAU_WINDOW);
        if (peak > 0 && win.every((s) => s <= peak * CONFIG.QUERY_PLATEAU)) {
          bs.status = 'drained';
          bs.stopReason = 'collect-dry-plateau';
        }
      }
    }
  }

  // process a brainer's spawn delta (≤1) — spawn a focused child if the maxParallelBrainers / depth caps allow, then aim + seed it.
  // Called SEQUENTIALLY after the parallel wave so the caps are race-free; delegate-and-release drops the branch.
  async processSpawn(parent: BrainerState, gw: number, phaseName: string): Promise<void> {
    const sp = parent.coord && parent.coord.spawn;
    if (!sp || !sp.mandate) return;
    const live = this.liveBrainers.filter(
      (b) => b.status !== 'lost' && b.status !== 'drained',
    ).length;
    if (live >= CONFIG.maxParallelBrainers) {
      log(
        '  · ' +
          parent.name +
          ' spawn refused — maxParallelBrainers cap (' +
          CONFIG.maxParallelBrainers +
          ' live)',
      );
      return;
    }
    if (parent.depth + 1 > CONFIG.MAX_BRAINER_DEPTH) {
      log('  · ' + parent.name + ' spawn refused — depth cap');
      return;
    }
    let branch: RabbitHole | undefined;
    if (typeof sp.id === 'number') branch = parent.rabbitHoles.find((r) => r.id === sp.id);
    const trail = branch
      ? [...(branch.path || []), branch.keyword].join('  →  ')
      : (parent.trail ? parent.trail + '  →  ' : '') + (sp.keyword || sp.mandate);
    const name = 'b' + this.liveBrainers.length + '-' + lab(sp.keyword || sp.mandate);
    const child = spawnBrainer(parent, { name, mandate: sp.mandate, trail });
    this.liveBrainers.push(child); // reserve the live slot synchronously (before the pickFirst await)
    if (branch) parent.rabbitHoles = parent.rabbitHoles.filter((r) => r.id !== branch!.id); // delegate-and-release
    log('  ✚ ' + parent.name + ' spawned ' + name + ' — ‹' + clip(sp.mandate, 60) + '›');
    await this.pickFirst(child, [], gw, phaseName); // the child's initial pick, aimed by its mandate
  }

  // the speculative GATE for a brainer that declared done — initiator → refine → judge (no synthesiser). Returns the
  // judge verdict; caches the hardened facts so the winner's report reuses them. Namespaced artifacts; never pauses others.
  async runGate(bs: BrainerState): Promise<JudgeOut | null> {
    const rabbitHolesOut: RabbitHoleOut[] = bs.rabbitHoles
      .map((f) => ({
        id: f.id,
        keyword: f.keyword,
        why: f.why,
        path: f.path || [],
        score: lastScore(f),
        scoreHistory: f.scoreHistory,
        ...(f.note ? { note: f.note } : {}),
      }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    bs.rabbitHolesOut = rabbitHolesOut;
    const topOpen = rabbitHolesOut.slice(0, CONFIG.FINALIZE_TOP_OPEN).map((f) => f.keyword);
    const { facts, synthFocus, artifact: initiatorMd } = await runInitiator(bs, topOpen);
    this.files[bs.name + '/initiator.md'] = initiatorMd;
    const { cleanReports, artifact: refineMd } = await runRefine(bs, facts, '', '');
    this.files[bs.name + '/refinement.md'] = refineMd;
    const verdict = await runJudge(bs, cleanReports, synthFocus, 0);
    bs.gateCache = { facts, synthFocus, cleanReports, topOpen };
    if (verdict)
      this.files[bs.name + '/judge.md'] =
        '# Gate judge — ' +
        bs.name +
        '\n\n- goalMet: ' +
        verdict.goalMet +
        '\n- verificationSound: ' +
        verdict.verificationSound +
        '\n- computeSound: ' +
        verdict.computeSound +
        '\n\n' +
        (verdict.reasoning || '') +
        (verdict.directive ? '\n\n**Directive:** ' + verdict.directive : '') +
        '\n';
    return verdict;
  }

  // the WINNER's report — its gate already upheld the hardened facts, so reuse them and run the synthesiser → result.md.
  async finalizeWinner(bs: BrainerState): Promise<void> {
    phase(CONFIG.PHASE.finalize);
    const gc = bs.gateCache;
    if (!gc) {
      log('  ✗ winner ' + bs.name + ' has no gate cache — falling back to full finalize');
      await this.runFinalize(bs);
      return;
    }
    const agg = await runSynthesiser(bs, gc.cleanReports, gc.synthFocus, gc.topOpen);
    bs.synthesiserOut = agg;
    bs.reportOk = !!(agg && agg.report);
    if (bs.reportOk) {
      this.files['result.md'] = runArgsMd() + agg!.report;
      log('· winner ' + bs.name + ' finalized · confidence=' + agg!.confidence);
    } else log('✗ winner ' + bs.name + ' finalize FAILED — no report');
  }

  // a non-winning brainer's wrapped-up state — preserved for later review (its living memory + gate verdict if any).
  writeLoserResult(bs: BrainerState): void {
    this.files['result-' + bs.name + '.md'] =
      '# ' +
      bs.name +
      ' — ' +
      (bs.status === 'lost' ? 'LOST branch (dead end)' : 'wrapped up — not the winner') +
      '\n\n_Mandate: ' +
      (bs.mandate || '(root)') +
      '_\n\n_Trail: ' +
      (bs.trail || '(root)') +
      '_\n\n' +
      resultSoFarMd(bs.resultSoFar) +
      '\n';
  }

  // _brainers.json + _brainers-tree.md — the brainer tree: who spawned whom, mandate, outcome, final status.
  writeBrainerTree(): void {
    const recs = this.liveBrainers.map((b) => ({
      name: b.name,
      parent: b.parentName,
      depth: b.depth,
      status: b.status,
      mandate: b.mandate,
      trail: b.trail,
      waves: b.waveLog.length,
      topScores: b.topScores,
      gate: b.gate
        ? {
            goalMet: b.gate.goalMet,
            verificationSound: b.gate.verificationSound,
            computeSound: b.gate.computeSound,
          }
        : null,
      confidence: b.resultSoFar ? b.resultSoFar.confidence : null,
      answer: b.resultSoFar ? clip(b.resultSoFar.answer || '', 400) : null,
    }));
    this.files['_brainers.json'] = JSON.stringify(
      { winner: this.winner ? this.winner.name : null, brainers: recs },
      null,
      2,
    );
    const lines: string[] = [];
    const walk = (parentName: string | null, pre: string): void => {
      const cs = this.liveBrainers.filter((b) => b.parentName === parentName);
      cs.forEach((c, i) => {
        const last = i === cs.length - 1;
        const mark =
          this.winner && c.name === this.winner.name
            ? ' ⚑WINNER'
            : c.status === 'lost'
              ? ' ✗lost'
              : ' (' + c.status + ')';
        lines.push(
          pre +
            (last ? '└─ ' : '├─ ') +
            c.name +
            mark +
            (c.mandate ? '  ‹' + clip(c.mandate, 60) + '›' : ''),
        );
        walk(c.name, pre + (last ? '   ' : '│  '));
      });
    };
    walk(null, '');
    log('');
    log('🧠 BRAINER TREE:');
    lines.forEach((l) => log(clip(l, CONFIG.TREE_LOG_WIDTH)));
    this.files['_brainers-tree.md'] =
      '# Brainer tree — the brainer-tree run\n\n```\n' +
      (lines.join('\n') || '(root only)') +
      '\n```\n';
  }

  // the GLOBAL multi-brainer loop (maxParallelBrainers > 1): run every active brainer's wave concurrently each global wave; a done brainer
  // fires its gate without pausing the others; the first upheld gate wins → one last wave → drain.
  async runCrawlMulti(root: BrainerState, scoutRabbitHoles: SeedLead[]): Promise<void> {
    this.writeScoutFile();
    scoutRabbitHoles.forEach((l) =>
      addRabbitHole(root, { keyword: l.keyword, why: l.why, path: l.path || [], wave: 0 }),
    );
    const seedFindings: Finding[] = this.scout!.pages.map((p) => ({
      rabbitHole: p.url,
      summary: p.summary,
    }));
    // brainer-0 (the root's first pick) belongs to the Scout phase, beside scout + prospector — NOT a crawl wave.
    phase(CONFIG.PHASE.scout);
    await this.pickFirst(root, seedFindings, 0, CONFIG.PHASE.scout);

    type GateRec = { bs: BrainerState; promise: Promise<void>; settled: boolean };
    const gates: GateRec[] = [];
    const cap = CONFIG.maxWave === 'auto' ? CONFIG.HARD_CAP : CONFIG.maxWave;
    let gw = 1;
    while (gw <= Math.min(CONFIG.HARD_CAP, cap)) {
      const isLastWave = this.lastWaveTriggered;
      const active = this.liveBrainers.filter((b) => b.status === 'active' && b.lookupNext.length);
      if (!active.length) {
        const pending = gates.filter((g) => !g.settled);
        if (pending.length) {
          await Promise.race(pending.map((g) => g.promise));
          continue; // a gate settled — it may have reactivated a brainer or set the winner; re-evaluate
        }
        break; // no active brainers and no gates in flight → the run is done
      }
      const phaseName = 'Research w' + gw;
      phase(phaseName);
      const canSpawnNow =
        !isLastWave &&
        this.liveBrainers.filter((b) => b.status !== 'lost' && b.status !== 'drained').length <
          CONFIG.maxParallelBrainers;
      log(
        '— global wave ' +
          gw +
          ' · active=' +
          active.length +
          ' · live=' +
          this.liveBrainers.length +
          (isLastWave ? ' · LAST WAVE' : ''),
      );
      await parallel(
        active.map((bs) => () => this.runOneWave(bs, gw, isLastWave, phaseName, canSpawnNow)),
      );
      // ── post-wave (sequential) — spawns first (cap-safe), then fire gates for brainers that declared done ──
      for (const bs of active)
        if (canSpawnNow && bs.status === 'active' && bs.coord && bs.coord.spawn)
          await this.processSpawn(bs, gw, phaseName);
      for (const bs of active) {
        if (bs.status !== 'done') continue;
        bs.status = 'finalizing';
        const rec: GateRec = { bs, settled: false, promise: Promise.resolve() };
        rec.promise = this.runGate(bs).then((verdict) => {
          rec.settled = true;
          bs.gate = verdict;
          const upheld = !!(
            verdict &&
            verdict.goalMet &&
            verdict.verificationSound &&
            verdict.computeSound
          );
          if (upheld) {
            if (!this.winner) {
              this.winner = bs;
              this.lastWaveTriggered = true;
              log('  ⚑ ' + bs.name + ' GATE PASSED — winner; triggering the last wave');
            }
            bs.status = 'won';
          } else {
            const reopen = (verdict && verdict.reopenRabbitHoles) || [];
            if (reopen.length) {
              bs.lookupNext = resolveLookupNext(
                bs,
                {
                  lookupNext: reopen.map((l) => ({
                    keyword: l.keyword,
                    why: l.why,
                    score: CONFIG.INJECT_SCORE,
                  })),
                },
                bs.wave,
                laneCount,
              );
              bs.lastValidatorMissing = (verdict && verdict.directive) || '';
              bs.status = bs.lookupNext.length ? 'active' : 'drained';
              log(
                '  ↺ ' +
                  bs.name +
                  ' gate REJECTED — ' +
                  (bs.status === 'active' ? 'continuing on a flagged gap' : 'drained'),
              );
            } else {
              bs.status = 'drained';
              log('  ↺ ' + bs.name + ' gate REJECTED — no concrete gap → drained');
            }
          }
        });
        gates.push(rec);
      }
      if (isLastWave) break;
      gw++;
    }
    await Promise.all(gates.map((g) => g.promise)); // DRAIN — let every in-flight gate settle
    log(
      '■ multi-crawl DONE · brainers=' +
        this.liveBrainers.length +
        ' · winner=' +
        (this.winner ? this.winner.name : 'none'),
    );
  }

  async run(): Promise<RunResult> {
    const scoutRabbitHoles = await runScout(this);
    this.files['02-prospector.md'] = await runProspector(this); // name the high-value venues before the crawl
    // the ROOT brainer — globals (scout + prospector) are now set, copied by reference into it; the root can never declare lost.
    const root = new BrainerState(this, {
      name: 'root',
      parentName: null,
      mandate: '',
      trail: '',
      depth: 0,
    });
    this.liveBrainers = [root];
    let result: RunResult;
    if (CONFIG.maxParallelBrainers <= 1) {
      // ── single-brainer (default) — the proven path, unchanged ──
      await this.runCrawl(root, scoutRabbitHoles);
      await this.runFinalize(root);
      result = this.buildResult(root);
    } else {
      // ── multi-brainer brainer tree (opt-in via maxParallelBrainers > 1) ──
      await this.runCrawlMulti(root, scoutRabbitHoles);
      const winner = this.winner;
      if (winner) await this.finalizeWinner(winner);
      else await this.runFinalize(root); // no gate ever passed → full finalize on the root
      for (const bs of this.liveBrainers) if (bs !== (winner || root)) this.writeLoserResult(bs);
      this.writeBrainerTree();
      result = this.buildResult(winner || root);
    }
    if (CONFIG.debug)
      this.files['_debug.md'] = await runDebug(this, this.winner || root, result.metrics); // opt-in Debug & Analysis agent → _debug.md
    return result;
  }
}
