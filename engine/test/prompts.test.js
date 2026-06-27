import { describe, it, expect } from 'vitest'
import { SCOUT_PROMPT, PROSPECTOR_PROMPT, BRAINER_PROMPT, SENTINEL_PROMPT, RESEARCHER_PROMPT, INITIATOR_PROMPT, REFINE_PROMPT, COMPUTE_PROMPT, AGGREGATOR_PROMPT, DEBUG_PROMPT, FINISH, WEB_ONLY } from '../src/prompts.js'

const Q = 'best vector database for production RAG at scale'
const NET = 'NET-FRAGMENT'
const FOOTER = 'FOOTER-FRAGMENT'
const venues = [{ source: 'arXiv (site:arxiv.org)', goodFor: 'ANN indexes' }, { source: 'SemiAnalysis', goodFor: 'cost' }]
const resultSoFar = { answer: 'pgvector', confidence: 'medium', evidence: [{ fact: 'recall', value: '0.98', source: 'arxiv', status: 'settled' }], resolved: ['idx'], openGaps: ['mt'], tensions: [], working: 'cost=x' }
const waveLog = [{ wave: 0, pursued: [], topScore: 0, done: false, reason: 'seed' }]
const cleanReports = [{ fact: 'recall', why: 'lb', clean: '0.96 ± 0.02' }]
const computeResults = [{ goal: 'cost', value: '$0.0003/q', result: 'd', assumptions: ['1200 qps'] }]

// each builder on a representative input → { label, output }
const cases = [
  ['SCOUT_PROMPT', SCOUT_PROMPT({ query: Q, net: NET, footer: FOOTER })],
  ['PROSPECTOR_PROMPT', PROSPECTOR_PROMPT({ query: Q, landscape: 'L', sources: ['https://a.com'] })],
  ['BRAINER_PROMPT/w0', BRAINER_PROMPT({ wave: 0, query: Q, rubric: 'RUBRIC', landscape: 'L', pursuedList: [], open: [], findings: [], topScores: [], resultSoFar: null, assignSources: false, stop: 'STOP', mode: 'goal', venues: [] })],
  ['BRAINER_PROMPT/wN', BRAINER_PROMPT({ wave: 3, query: Q, rubric: 'RUBRIC', landscape: 'L', pursuedList: ['a'], open: ['#1 [80] x — y'], findings: [{ rabbitHole: 'x', summary: 's' }], topScores: [90, 70, 50], resultSoFar, assignSources: true, stop: 'STOP', mode: 'goal', venues })],
  ['BRAINER_PROMPT/collect', BRAINER_PROMPT({ wave: 2, query: Q, rubric: 'RUBRIC', landscape: 'L', pursuedList: ['a'], open: ['#1 [80] x — y'], findings: [], topScores: [60, 40], resultSoFar, assignSources: false, stop: 'STOP', mode: 'collect', venues })],
  ['SENTINEL_PROMPT', SENTINEL_PROMPT({ query: Q, resultSoFar, reason: 'done', waveLog, rabbitHoles: ['#1 [80] x — y'], pursuedList: ['a'] })],
  ['RESEARCHER_PROMPT', RESEARCHER_PROMPT({ net: NET, query: Q, trail: 'goal  →  x', keyword: 'x', why: 'w', footer: FOOTER, venues, parallelSourcesPerLaneResearchAgent: 3 })],
  ['INITIATOR_PROMPT', INITIATOR_PROMPT({ query: Q, resultSoFar, waveLog, landscape: 'L', openRabbitHoles: ['x'] })],
  ['REFINE_PROMPT', REFINE_PROMPT({ net: NET, query: Q, fact: 'F', why: 'W' })],
  ['COMPUTE_PROMPT', COMPUTE_PROMPT({ query: Q, goal: 'derive', resultSoFar, hardenedFacts: cleanReports, priorStages: [] })],
  ['AGGREGATOR_PROMPT', AGGREGATOR_PROMPT({ mode: 'goal', query: Q, landscape: 'L', resultSoFar, waveLog, cleanReports, computeResults, focus: 'lead with cost', openRabbitHoles: ['x'] })],
  ['DEBUG_PROMPT', DEBUG_PROMPT({ query: Q, focus: 'why?', metrics: { a: 1 }, waveLog, sentinelLog: [], resultLog: [], highValueSources: venues, laneRecords: [] })],
]

describe('prompt builders', () => {
  for (const [label, out] of cases) {
    it(`${label} → non-empty string, no leftover holes, anchors the query`, () => {
      expect(typeof out).toBe('string')
      expect(out.length).toBeGreaterThan(0)
      expect(out).not.toContain('{{')
      expect(out).not.toContain('}}')
    })
    it(`${label} → full-string snapshot`, () => {
      expect(out).toMatchSnapshot()
    })
  }
  it('the query anchors the prompts that take it', () => {
    expect(SCOUT_PROMPT({ query: Q, net: NET, footer: FOOTER })).toContain(Q)
    expect(REFINE_PROMPT({ net: NET, query: Q, fact: 'F', why: 'W' })).toContain(Q)
  })
  it('FINISH / WEB_ONLY guard clauses ride into the right prompts', () => {
    expect(BRAINER_PROMPT({ wave: 0, query: Q, rubric: 'R', landscape: 'L', pursuedList: [], open: [], findings: [], topScores: [], resultSoFar: null, assignSources: false, stop: 'S', mode: 'goal', venues: [] })).toContain(FINISH.trim())
    expect(REFINE_PROMPT({ net: NET, query: Q, fact: 'F', why: 'W' })).toContain(WEB_ONLY.trim())
  })
})
