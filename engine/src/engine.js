import { CONFIG } from './config.js'
import { SCOUT, RESEARCH, COORD, SENTINEL, SOURCES, INITIATOR, REFINE, COMPUTE, REPORT, DIAG } from './schemas.js'
import { norm, lab, padIdx, lastScore, openLine, trailOf, withPrompt, waveMd, PROMPT_LOG, laneCount } from './utils/index.js'
import { SCOUT_PROMPT, PROSPECTOR_PROMPT, BRAINER_PROMPT, SENTINEL_PROMPT, RESEARCHER_PROMPT, INITIATOR_PROMPT, REFINE_PROMPT, COMPUTE_PROMPT, AGGREGATOR_PROMPT, DEBUG_PROMPT } from './prompts.js'
import { addRabbitHole, applyDeltas, resolveLookupNext, pursue } from './store.js'

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
export class ResearchReport {
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
