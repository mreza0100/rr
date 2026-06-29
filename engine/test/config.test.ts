import { describe, it, expect } from 'vitest';
import { Configs, CONFIG } from '../src/config.js';

describe('Configs validation', () => {
  it('throws on a missing query', () => expect(() => new Configs({})).toThrow(/non-empty string/));
  it('throws on an empty / whitespace query', () =>
    expect(() => new Configs({ query: '   ' })).toThrow(/non-empty string/));
  it('throws on a non-object args', () => {
    expect(() => new Configs(42)).toThrow(/JSON object/);
    expect(() => new Configs([])).toThrow(/JSON object/);
    expect(() => new Configs(null)).toThrow(/JSON object/);
  });
  it('throws on invalid JSON string args', () =>
    expect(() => new Configs('{not json')).toThrow(/not valid JSON/));
  it('parses a JSON string args', () =>
    expect(new Configs(JSON.stringify({ query: 'x' })).query).toBe('x'));
});

describe('Configs canonicalization', () => {
  it('canonicalizes mode: anything ≠ collect → goal', () => {
    expect(new Configs({ query: 'q', mode: 'collect' }).mode).toBe('collect');
    expect(new Configs({ query: 'q', mode: 'goal' }).mode).toBe('goal');
    expect(new Configs({ query: 'q', mode: 'weird' }).mode).toBe('goal');
    expect(new Configs({ query: 'q' }).mode).toBe('goal');
  });
  it('clamps maxWave to [5,15] or keeps "auto"', () => {
    expect(new Configs({ query: 'q' }).maxWave).toBe('auto');
    expect(new Configs({ query: 'q', maxWave: 'auto' }).maxWave).toBe('auto');
    expect(new Configs({ query: 'q', maxWave: 3 }).maxWave).toBe(5);
    expect(new Configs({ query: 'q', maxWave: 10 }).maxWave).toBe(10);
    expect(new Configs({ query: 'q', maxWave: 99 }).maxWave).toBe(15);
    expect(new Configs({ query: 'q', maxWave: 'nope' }).maxWave).toBe('auto');
  });
  it('clamps the lane + source knobs to [1,5] or keeps "auto"', () => {
    expect(new Configs({ query: 'q' }).parallelLaneResearchAgentsPerWave).toBe('auto');
    expect(
      new Configs({ query: 'q', parallelLaneResearchAgentsPerWave: 9 })
        .parallelLaneResearchAgentsPerWave,
    ).toBe(5);
    expect(
      new Configs({ query: 'q', parallelSourcesPerLaneResearchAgent: 0 })
        .parallelSourcesPerLaneResearchAgent,
    ).toBe('auto');
    expect(
      new Configs({ query: 'q', parallelSourcesPerLaneResearchAgent: 3 })
        .parallelSourcesPerLaneResearchAgent,
    ).toBe(3);
  });
  it('derives slug / tag / DIR', () => {
    const c = new Configs({ query: 'Hello, World!' });
    expect(c.slug).toBe('hello-world');
    expect(c.DIR).toBe('RR/hello-world');
    const t = new Configs({ query: 'Hello, World!', tag: 'v2' });
    expect(t.slug).toBe('hello-world-v2');
    expect(t.DIR).toBe('RR/hello-world-v2');
  });
  it('sets MAX_SENTINEL_REOPENS by mode (goal 2 / collect 0)', () => {
    expect(new Configs({ query: 'q', mode: 'goal' }).MAX_SENTINEL_REOPENS).toBe(2);
    expect(new Configs({ query: 'q', mode: 'collect' }).MAX_SENTINEL_REOPENS).toBe(0);
  });
  it('reads booleans + strings with type-guarded defaults', () => {
    expect(new Configs({ query: 'q' }).debug).toBe(true); // debug is ON by default
    expect(new Configs({ query: 'q', debug: false }).debug).toBe(false); // only debug:false turns it off
    expect(new Configs({ query: 'q', debug: true }).debug).toBe(true);
    expect(new Configs({ query: 'q', debug: 'yes' }).debug).toBe(true); // wrong type → default (true)
    expect(new Configs({ query: 'q', debugPrompt: 'why?' }).debugPrompt).toBe('why?');
    expect(new Configs({ query: 'q' }).debugPrompt).toBe('');
  });
  it('reads computerNote and folds it into COMPUTER_NOTE', () => {
    expect(new Configs({ query: 'q', computerNote: 'use sympy' }).computerNote).toBe('use sympy');
    expect(new Configs({ query: 'q' }).computerNote).toBe('');
    expect(new Configs({ query: 'q', computerNote: 'use sympy' }).COMPUTER_NOTE).toMatch(
      /use sympy/,
    );
  });
  it('captures the COMPLETE launch args verbatim on rawArgs', () => {
    const a = { query: 'q', mode: 'collect', tag: 'v2', computerNote: 'use scipy', debug: false };
    expect(new Configs(a).rawArgs).toEqual(a);
  });
  it('exposes the run-wide constants', () => {
    const c = new Configs({ query: 'q' });
    expect(c.HARD_CAP).toBe(15);
    expect(c.QUERY_PLATEAU).toBe(0.7);
    expect(c.INJECT_SCORE).toBe(90);
    expect(c.AGENT_RETRIES).toBe(2);
    expect(c.MAX_JUDGE_PASSES).toBe(2); // finalize: max remediation passes the judge may drive (judge runs ≤ MAX+1)
    expect(c.MAX_LANE_REFAILS).toBe(2); // crawl: max validator re-opens of one lane before it becomes a known gap
    expect(c.VALIDATOR_THIN).toBe(120); // crawl: finding length under which the validator gate fires
    expect(c.PHASE.crawl).toBe('Research'); // model TIER + reasoning EFFORT now live per-agent in src/agents/* (asserted in agents.test.js)
  });
});

describe('CONFIG singleton', () => {
  it('is built from the ambient args (setup query, goal mode)', () => {
    expect(CONFIG.mode).toBe('goal');
    expect(typeof CONFIG.query).toBe('string');
    expect(CONFIG.RUBRIC).toMatch(/MODE = goal/);
    expect(CONFIG.STOP).toMatch(/goal is answered/);
  });
});

describe('Configs mode-dependent prompt fragments', () => {
  it('builds the collect RUBRIC + STOP', () => {
    const c = new Configs({ query: 'q', mode: 'collect' });
    expect(c.RUBRIC).toMatch(/MODE = collect/);
    expect(c.STOP).toMatch(/novelty trajectory/);
  });
});
