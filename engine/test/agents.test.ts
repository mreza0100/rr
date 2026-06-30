import { describe, it, expect } from 'vitest';
import {
  scout,
  prospector,
  brainer,
  validator,
  researchScheduler,
  researcher,
  initiator,
  refiner,
  judge,
  synthesiser,
  debugAnalyst,
} from '../src/agents/index.js';

// The model TIER + reasoning EFFORT live in the central config.js TIER/EFFORT maps; each agent object reads
// its value from CONFIG. This pins that policy (the engine reads <agent>.tier / <agent>.effort / <agent>.schema).
const AGENTS = {
  scout,
  prospector,
  brainer,
  validator,
  researchScheduler,
  researcher,
  initiator,
  refiner,
  judge,
  synthesiser,
  debugAnalyst,
};

describe('agents — shape', () => {
  it('every agent exposes tier + effort + schema + a buildPrompt function', () => {
    for (const [name, a] of Object.entries(AGENTS)) {
      expect(typeof a.tier, name).toBe('string');
      expect(['haiku', 'sonnet', 'opus'], name).toContain(a.tier);
      expect(['medium', 'high', 'xhigh'], name).toContain(a.effort);
      expect(a.schema, name).toBeTypeOf('object');
      expect(a.schema.type, name).toBe('object');
      expect(typeof a.buildPrompt, name).toBe('function');
    }
  });
});

describe('agents — tier policy (from config.TIER)', () => {
  it('workers are haiku; brainer/synthesis/adversarial are opus; refiner + validator are sonnet', () => {
    expect(scout.tier).toBe('haiku');
    expect(researcher.tier).toBe('haiku');
    expect(refiner.tier).toBe('sonnet');
    expect(validator.tier).toBe('sonnet');
    expect(researchScheduler.tier).toBe('sonnet');
    expect(prospector.tier).toBe('opus');
    expect(brainer.tier).toBe('opus');
    expect(initiator.tier).toBe('opus');
    expect(judge.tier).toBe('opus');
    expect(synthesiser.tier).toBe('opus');
    expect(debugAnalyst.tier).toBe('opus');
  });
});

describe('agents — effort policy (from config.EFFORT)', () => {
  it('workers medium; prospector/refiner/debug high; brainer/initiator/judge/synthesiser xhigh', () => {
    expect(scout.effort).toBe('medium');
    expect(researcher.effort).toBe('medium');
    expect(validator.effort).toBe('medium');
    expect(prospector.effort).toBe('high');
    expect(refiner.effort).toBe('high');
    expect(researchScheduler.effort).toBe('high');
    expect(debugAnalyst.effort).toBe('high');
    expect(brainer.effort).toBe('xhigh');
    expect(initiator.effort).toBe('xhigh');
    expect(judge.effort).toBe('xhigh');
    expect(synthesiser.effort).toBe('xhigh');
  });
});
