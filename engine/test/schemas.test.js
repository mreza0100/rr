import { describe, it, expect } from 'vitest'
import { RABBITHOLE, SCORED, PAGE, SCOUT, RESEARCH, LOOKUP, RESULT_SO_FAR, COMPUTEMENT, COORD, SENTINEL, SOURCES, INITIATOR, REFINE, COMPUTE, REPORT, DIAG } from '../src/schemas.js'

const isObjSchema = s => s && s.type === 'object' && s.properties && typeof s.properties === 'object'

describe('schemas — shape', () => {
  it('every schema is a valid object schema', () => {
    for (const s of [RABBITHOLE, SCORED, PAGE, SCOUT, RESEARCH, LOOKUP, RESULT_SO_FAR, COMPUTEMENT, COORD, SENTINEL, SOURCES, INITIATOR, REFINE, COMPUTE, REPORT, DIAG]) {
      expect(isObjSchema(s)).toBe(true)
    }
  })
  it('required arrays are correct', () => {
    expect(RABBITHOLE.required).toEqual(['keyword', 'why'])
    expect(SCORED.required).toEqual(['keyword', 'why', 'score'])
    expect(PAGE.required).toEqual(['url', 'summary', 'rabbitHoles'])
    expect(SCOUT.required).toEqual(['landscape', 'pages'])
    expect(RESEARCH.required).toEqual(['summary', 'rabbitHoles'])
    expect(SENTINEL.required).toEqual(['solid', 'reasoning'])
    expect(SOURCES.required).toEqual(['highValueSources'])
    expect(COMPUTE.required).toEqual(['value', 'result', 'assumptions'])
    expect(REPORT.required).toEqual(['report', 'verdict', 'confidence', 'plan', 'openQuestions'])
    expect(DIAG.required).toEqual(['diagnosis'])
  })
})

describe('schemas — nesting', () => {
  it('PAGE.items references the RABBITHOLE shape', () => {
    expect(PAGE.properties.rabbitHoles.items).toBe(RABBITHOLE)
  })
  it('SCOUT.pages references PAGE; RESEARCH.rabbitHoles references RABBITHOLE', () => {
    expect(SCOUT.properties.pages.items).toBe(PAGE)
    expect(RESEARCH.properties.rabbitHoles.items).toBe(RABBITHOLE)
  })
  it('COORD nests RESULT_SO_FAR/SCORED/LOOKUP and requires the delta fields', () => {
    expect(COORD.properties.resultSoFar).toBe(RESULT_SO_FAR)
    expect(COORD.properties.add.items).toBe(SCORED)
    expect(COORD.properties.lookupNext.items).toBe(LOOKUP)
    expect(COORD.required).toEqual(['resultSoFar', 'rescore', 'add', 'lookupNext', 'stop'])
  })
  it('RESULT_SO_FAR requires the full memory contract', () => {
    expect(RESULT_SO_FAR.required).toEqual(['answer', 'evidence', 'resolved', 'openGaps', 'tensions', 'working', 'confidence'])
    expect(RESULT_SO_FAR.properties.evidence.items.properties.status.enum).toEqual(['settled', 'tentative', 'contested'])
  })
  it('INITIATOR requires refinement/computement/aggregator', () => {
    expect(INITIATOR.required).toEqual(['refinement', 'computement', 'aggregator'])
    expect(INITIATOR.properties.computement.required).toEqual(['run', 'stages'])
  })
  it('COMPUTEMENT is the object the Finalize initiator emits to derive the answer', () => {
    expect(COMPUTEMENT.required).toEqual(['run', 'stages'])
    expect(INITIATOR.properties.computement).toBe(COMPUTEMENT)
    expect(COORD.properties.computement).toBeUndefined()   // the brainer computes inline — no computement field on its output
  })
  it('REFINE requires report', () => {
    expect(REFINE.required).toEqual(['report'])
    expect(REFINE.properties.report.type).toBe('string')
  })
  it('REPORT.confidence is an enum', () => {
    expect(REPORT.properties.confidence.enum).toEqual(['high', 'medium', 'low'])
  })
})
