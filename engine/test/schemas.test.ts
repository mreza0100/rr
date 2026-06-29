import { describe, it, expect } from 'vitest';
// Shared nested schema bricks live in agents/shared.js; each agent's TOP-LEVEL output schema is co-located in its agent module.
import { RABBITHOLE, SCORED, PAGE, LOOKUP, RESULT_SO_FAR } from '../src/agents/shared.js';
import type { Schema } from '../src/types/index.js';
import { SCOUT } from '../src/agents/scout/index.js';
import { SOURCES } from '../src/agents/prospector/index.js';
import { COORD, BRAIN_COMPUTE } from '../src/agents/brainer/index.js';
import { SENTINEL } from '../src/agents/sentinel/index.js';
import { VALIDATE } from '../src/agents/validator/index.js';
import { RESEARCH } from '../src/agents/researcher/index.js';
import { INITIATOR } from '../src/agents/initiator/index.js';
import { REFINE } from '../src/agents/refiner/index.js';
import { JUDGE } from '../src/agents/judge/index.js';
import { REPORT } from '../src/agents/synthesiser/index.js';
import { DIAG } from '../src/agents/debugAnalyst/index.js';

const isObjSchema = (s: Schema) =>
  s && s.type === 'object' && s.properties && typeof s.properties === 'object';

describe('schemas — shape', () => {
  it('every schema is a valid object schema', () => {
    for (const s of [
      RABBITHOLE,
      SCORED,
      PAGE,
      SCOUT,
      RESEARCH,
      LOOKUP,
      RESULT_SO_FAR,
      BRAIN_COMPUTE,
      COORD,
      SENTINEL,
      VALIDATE,
      SOURCES,
      INITIATOR,
      REFINE,
      JUDGE,
      REPORT,
      DIAG,
    ]) {
      expect(isObjSchema(s)).toBe(true);
    }
  });
  it('required arrays are correct', () => {
    expect(RABBITHOLE.required).toEqual(['keyword', 'why']);
    expect(SCORED.required).toEqual(['keyword', 'why', 'score']);
    expect(PAGE.required).toEqual(['url', 'summary', 'rabbitHoles']);
    expect(SCOUT.required).toEqual(['landscape', 'pages']);
    expect(RESEARCH.required).toEqual(['summary', 'rabbitHoles']);
    expect(SENTINEL.required).toEqual(['solid', 'reasoning']);
    expect(VALIDATE.required).toEqual(['checks', 'enough']);
    expect(SOURCES.required).toEqual(['highValueSources']);
    expect(JUDGE.required).toEqual([
      'goalMet',
      'verificationSound',
      'needsCompute',
      'computeSound',
      'reasoning',
    ]);
    expect(REPORT.required).toEqual(['report', 'verdict', 'confidence', 'plan', 'openQuestions']);
    expect(DIAG.required).toEqual(['diagnosis']);
  });
});

describe('schemas — nesting', () => {
  it('PAGE.items references the RABBITHOLE shape', () => {
    expect(PAGE.properties!.rabbitHoles.items).toBe(RABBITHOLE);
  });
  it('SCOUT.pages references PAGE; RESEARCH.rabbitHoles references RABBITHOLE', () => {
    expect(SCOUT.properties!.pages.items).toBe(PAGE);
    expect(RESEARCH.properties!.rabbitHoles.items).toBe(RABBITHOLE);
  });
  it('COORD nests RESULT_SO_FAR/SCORED/LOOKUP and requires the delta fields', () => {
    expect(COORD.properties!.resultSoFar).toBe(RESULT_SO_FAR);
    expect(COORD.properties!.add.items).toBe(SCORED);
    expect(COORD.properties!.lookupNext.items).toBe(LOOKUP);
    expect(COORD.required).toEqual(['resultSoFar', 'rescore', 'add', 'lookupNext', 'stop']);
  });
  it('RESULT_SO_FAR requires the full memory contract', () => {
    expect(RESULT_SO_FAR.required).toEqual([
      'answer',
      'evidence',
      'resolved',
      'openGaps',
      'tensions',
      'working',
      'confidence',
    ]);
    expect(RESULT_SO_FAR.properties!.evidence.items!.properties!.status.enum).toEqual([
      'settled',
      'tentative',
      'contested',
    ]);
    // assumptions carry {claim, basis} and are optional (not part of the required memory contract)
    expect(RESULT_SO_FAR.properties!.assumptions.items!.required).toEqual(['claim', 'basis']);
    expect(RESULT_SO_FAR.required).not.toContain('assumptions');
  });
  it('INITIATOR requires refinement/synthesiser (no computement — the judge decides derivation)', () => {
    expect(INITIATOR.required).toEqual(['refinement', 'synthesiser']);
    expect(INITIATOR.properties!.computement).toBeUndefined();
  });
  it('JUDGE is the finalize terminal skeptic — four boolean flags + reasoning required', () => {
    expect(JUDGE.properties!.goalMet.type).toBe('boolean');
    expect(JUDGE.properties!.verificationSound.type).toBe('boolean');
    expect(JUDGE.properties!.needsCompute.type).toBe('boolean');
    expect(JUDGE.properties!.computeSound.type).toBe('boolean');
    expect(JUDGE.properties!.reopenRabbitHoles.items).toBe(RABBITHOLE); // gap leads reuse the shared brick
    expect(JUDGE.required).not.toContain('directive'); // directive + reopenRabbitHoles are optional
  });
  it('BRAIN_COMPUTE returns the updated resultSoFar (derivation folded into `working`)', () => {
    expect(BRAIN_COMPUTE.required).toEqual(['resultSoFar']);
    expect(BRAIN_COMPUTE.properties!.resultSoFar).toBe(RESULT_SO_FAR);
    expect(COORD.properties!.computement).toBeUndefined(); // the brainer computes inline — no computement field on its output
  });
  it('VALIDATE is the per-wave coverage gate — checks{id,fulfilled} + enough required', () => {
    expect(VALIDATE.properties!.checks.items!.required).toEqual(['id', 'fulfilled']);
    expect(VALIDATE.properties!.enough.type).toBe('boolean');
    expect(VALIDATE.required).not.toContain('missing'); // missing is optional
  });
  it('REFINE requires report', () => {
    expect(REFINE.required).toEqual(['report']);
    expect(REFINE.properties!.report.type).toBe('string');
  });
  it('REPORT.confidence is an enum', () => {
    expect(REPORT.properties!.confidence.enum).toEqual(['high', 'medium', 'low']);
  });
});
