import { describe, it, expect, vi } from 'vitest';
import type { AgentOpts, RunResult } from '../src/types/index.js';
type AgentStub = (prompt: string, opts: AgentOpts) => unknown;

// ── shared canned StructuredOutputs (the engine reads specific fields) ────────
const RSF = {
  answer: 'pgvector for most, Milvus at huge scale',
  confidence: 'medium',
  working: 'cost = nodes * price',
  evidence: [{ fact: 'recall', value: '0.98', source: 'arxiv', status: 'settled' }],
  resolved: ['index types'],
  openGaps: ['multi-tenant isolation'],
  tensions: [],
};
const SCOUT_OUT = {
  landscape: 'the landscape',
  pages: [
    {
      url: 'https://a.com',
      summary: 'page a',
      rabbitHoles: [
        { keyword: 'hnsw tuning', why: 'knobs' },
        { keyword: 'sharding', why: 'scale' },
      ],
    },
  ],
  deadEnds: [],
};
const PROSPECT_OUT = {
  highValueSources: [
    { source: 'arXiv (site:arxiv.org)', goodFor: 'ANN' },
    { source: 'SemiAnalysis', goodFor: 'cost' },
  ],
  reasoning: 'searched',
};
// a lane READER's output (the new researcher shape): the accumulated running answer + the leads it surfaced.
const LANE_OUT = {
  runningAnswer: 'found knobs',
  rabbitHoles: [{ keyword: 'ef tuning', why: 'recall' }],
  deadEnds: [],
};
// the per-wave validator's neutral verdict — nothing failed, nothing to reopen.
const VALIDATE_OUT = { checks: [], enough: true, missing: [] };
// the SCHEDULER stub — echoes one sized source per lane id it sees in the prompt (each lane renders `#id`),
// so every pursued lane bin-packs to exactly ONE reader-unit (size 1000 ≤ budget). Keeps reader labels at `-r1of1`.
function schedulerStub(prompt: string) {
  const ids = [...new Set([...prompt.matchAll(/#(\d+)/g)].map((m) => Number(m[1])))];
  return {
    lanes: ids.map((id) => ({
      id,
      sources: [
        {
          source: 'https://s' + id + '.com',
          path: '/cache/' + id + '.txt',
          size: 1000,
          chars: 2000,
        },
      ],
    })),
  };
}

// load the engine fresh with the given ambient args + agent (config/CONFIG are built at import).
async function loadEngine(
  args: unknown,
  agent: AgentStub,
  {
    parallel,
    pipeline,
  }: { parallel?: typeof globalThis.parallel; pipeline?: typeof globalThis.pipeline } = {},
) {
  globalThis.args = args;
  globalThis.agent = async (p: string, o: AgentOpts) => agent(p, o);
  globalThis.phase = () => {};
  globalThis.log = () => {};
  globalThis.parallel =
    parallel ||
    (async <T>(thunks: Array<() => Promise<T>>): Promise<T[]> =>
      Promise.all(thunks.map((t) => t())));
  globalThis.pipeline =
    pipeline ||
    (async (
      items: unknown[],
      s1: (item: unknown, i: number) => Promise<unknown>,
      s2: (a: unknown, item: unknown, i: number) => Promise<unknown>,
    ): Promise<unknown[]> => {
      const out: unknown[] = [];
      for (let i = 0; i < items.length; i++) {
        const a = await s1(items[i], i);
        out.push(await s2(a, items[i], i));
      }
      return out;
    });
  vi.resetModules();
  const mod = await import('../src/engine.js');
  return mod.ResearchReport;
}
const keys = (r: RunResult) => Object.keys(r.files);

// ── (a) GOAL mode — compute ON, brainer-driven stop, finalize brain-compute ──
function goalAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [
        { id: 1, score: 80 },
        { id: 2, score: 50 },
      ],
      add: [],
      lookupNext: [{ id: 1, sources: ['arXiv (site:arxiv.org)'] }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'scoring seeds' },
    };
  if (L === 'brainer-w1')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'goal answered' },
    };
  if (L.startsWith('scheduler-')) return schedulerStub(prompt);
  if (L.startsWith('validator-')) return VALIDATE_OUT;
  if (L.startsWith('lane-')) return LANE_OUT;
  if (L === 'initiator')
    return {
      refinement: { facts: [{ fact: 'recall is 0.98', why: 'headline' }] },
      synthesiser: { focus: 'lead with cost' },
    };
  if (L.startsWith('refine-')) return { report: 'refined: 0.96 ± 0.02 (verified)' };
  // judge pass 0 → needs a derivation (routes to brain-compute); pass 1 → derivation now sound → exit
  if (L === 'judge-0')
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: true,
      computeSound: false,
      reasoning: 'the answer needs a blended cost/query derivation',
      directive: 'derive blended cost/query with error bars',
      reopenRabbitHoles: [],
    };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: true,
      computeSound: true,
      reasoning: 'derivation is now sound',
      directive: '',
    };
  if (L.startsWith('brain-compute-'))
    return { resultSoFar: { ...RSF, working: 'blended cost = $0.0003/q ± 10%' } };
  if (L === 'synthesiser')
    return {
      report: '# Report\n\nbody',
      verdict: 'pgvector wins',
      confidence: 'high',
      plan: ['use pgvector'],
      openQuestions: ['multi-tenant'],
    };
  if (L === 'debug-analyst') return { diagnosis: '# Debug\n\nall good' };
  throw new Error('goalAgent: unexpected label ' + L);
}

describe('ResearchReport.run — goal mode (compute on, brainer-driven stop)', () => {
  it('completes the full pipeline and writes the expected files', async () => {
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal' },
      goalAgent,
    );
    const result = await new RR().run();

    expect(result.stopReason).toBe('brainer-done');
    expect(result.done).toBe(true);
    expect(result.metrics.mode).toBe('goal');
    expect(result.metrics.reportWritten).toBe(true);
    expect(result.verdict).toBe('pgvector wins');
    expect(result.confidence).toBe('high');

    expect(result.files['result.md']).toContain('# Report\n\nbody');
    expect(keys(result)).toContain('01-scout.md');
    expect(keys(result)).toContain('02-prospector.md');
    expect(keys(result)).toContain('03-wave-0.md');
    expect(keys(result).some((k) => k.endsWith('-initiator.md'))).toBe(true);
    expect(keys(result).some((k) => k.endsWith('-refinement.md'))).toBe(true);
    expect(keys(result).some((k) => k.endsWith('-judge.md'))).toBe(true);
    // the judge is now the sole terminal skeptic — no crawl-phase sentinel file
    expect(keys(result).some((k) => k.endsWith('-sentinel.md'))).toBe(false);
    // the judge routed needsCompute → the brain derived the answer (folded into resultSoFar.working)
    expect(keys(result)).toContain('_finalize-compute.md');
    expect(result.files['_finalize-compute.md']).toContain('blended cost = $0.0003/q ± 10%');
    expect(keys(result)).toContain('_rabbitHoles.json');
    expect(keys(result)).toContain('_tree.md');
    // the COMPLETE launch args are persisted — surfaced at the top of result.md + as the `args` object in _rabbitHoles.json
    expect(result.files['result.md']).toContain('Run arguments');
    expect(JSON.parse(result.files['_rabbitHoles.json']).args).toEqual({
      query: 'best vector database for production RAG at scale',
      mode: 'goal',
    });
  });
});

// ── (b) COLLECT mode — the dry-plateau stop ─────────────────────────────────
function collectAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L.startsWith('brainer-w')) {
    const w = Number(L.slice('brainer-w'.length));
    // research-wave peak at w1=100, then plateau at 50 (≤ 0.7×peak) for w2,w3 → dry. The wave-0 SEED score (100)
    // is EXCLUDED from the plateau math (B9), so the plateau is judged on the research waves' own trajectory.
    const score = w <= 1 ? 100 : 50;
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [{ keyword: 'collect lead ' + w, why: 'breadth', score }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'still collecting' },
    };
  }
  if (L.startsWith('scheduler-')) return schedulerStub(prompt);
  if (L.startsWith('validator-')) return VALIDATE_OUT;
  if (L.startsWith('lane-')) return LANE_OUT;
  if (L === 'initiator')
    return {
      refinement: { facts: [] },
      synthesiser: { focus: '' },
    };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'inventory complete',
      directive: '',
    };
  if (L === 'synthesiser')
    return {
      report: '# Inventory\n\nbody',
      verdict: 'a broad landscape',
      confidence: 'medium',
      plan: [],
      openQuestions: [],
    };
  throw new Error('collectAgent: unexpected label ' + L);
}

describe('ResearchReport.run — collect mode (dry plateau)', () => {
  it('stops on the collect dry-plateau and writes a report with no compute', async () => {
    const RR = await loadEngine(
      { query: 'survey the vector-db landscape', mode: 'collect' },
      collectAgent,
    );
    const result = await new RR().run();
    expect(result.stopReason).toBe('collect-dry-plateau');
    expect(result.metrics.mode).toBe('collect');
    expect(result.files['result.md']).toContain('# Inventory\n\nbody');
    // the judge upheld first pass → no derivation; refinement file records "no facts to harden"
    expect(keys(result)).not.toContain('_finalize-compute.md');
    expect(keys(result).some((k) => k.endsWith('-judge.md'))).toBe(true);
    expect(keys(result).some((k) => k.endsWith('-refinement.md'))).toBe(true);
  });
});

// ── (c) GOAL mode + debug:true — exercises runDebug + IO capture ─────────────
describe('ResearchReport.run — debug:true', () => {
  it('writes _debug.md with the analyst narrative + raw I/O', async () => {
    const RR = await loadEngine(
      {
        query: 'best vector database for production RAG at scale',
        mode: 'goal',
        debug: true,
        debugPrompt: 'why did wave 2 stall?',
      },
      goalAgent,
    );
    const result = await new RR().run();
    expect(keys(result)).toContain('_debug.md');
    const dbg = result.files['_debug.md'];
    expect(dbg).toContain('Analysis (debug-analyst');
    expect(dbg).toContain('Raw agent I/O');
    expect(dbg).toContain('Debug prompt:');
  });
});

// ── (d) degraded — null prospector / lane / refine / synthesiser ─────
function degradedAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return null;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [{ id: 1, score: 80 }],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'done' },
    };
  if (L.startsWith('scheduler-')) return schedulerStub(prompt);
  // the validator flags the dead lane → the engine reopens it (also reached via the null-lane path)
  if (L.startsWith('validator-'))
    return {
      checks: [{ id: 1, fulfilled: false, reason: 'died' }],
      enough: false,
      missing: ['retry'],
    };
  if (L.startsWith('lane-')) return null;
  if (L === 'initiator')
    return {
      refinement: { facts: [{ fact: 'F', why: 'W' }] },
      synthesiser: { focus: '' },
    };
  if (L.startsWith('refine-')) return null;
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'upheld',
      directive: '',
    };
  if (L === 'synthesiser') return null;
  throw new Error('degradedAgent: unexpected label ' + L);
}

describe('ResearchReport.run — degraded agents (null guards)', () => {
  it('survives null prospector / lane / refinement / synthesiser', async () => {
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal' },
      degradedAgent,
    );
    const result = await new RR().run();
    expect(result.highValueSources).toEqual([]); // prospector failed → none
    expect(result.metrics.reportWritten).toBe(false); // synthesiser failed
    expect(result.verdict).toBe(null);
    expect(result.confidence).toBe(null);
    expect(result.files['result.md']).toBeUndefined();
    const refineFile = keys(result).find((k) => k.endsWith('-refinement.md'));
    expect(result.files[refineFile!]).toContain('_(refine failed)_');
  });
});

// ── (e) brainer mid-crawl death — covers the break path + wave-cap classification ──
function brainerDiesMidAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [{ id: 1, score: 80 }],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1') return null; // dies mid-crawl
  if (L.startsWith('scheduler-')) return schedulerStub(prompt);
  if (L.startsWith('validator-')) return VALIDATE_OUT;
  if (L.startsWith('lane-')) return LANE_OUT;
  if (L === 'initiator')
    return {
      refinement: { facts: [] },
      synthesiser: { focus: '' },
    };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'upheld',
      directive: '',
    };
  if (L === 'synthesiser')
    return { report: '# R', verdict: 'v', confidence: 'low', plan: [], openQuestions: [] };
  throw new Error('brainerDiesMidAgent: unexpected label ' + L);
}

describe('ResearchReport.run — brainer dies mid-crawl', () => {
  it('stops the crawl and still finalizes (stopReason wave-cap)', async () => {
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal' },
      brainerDiesMidAgent,
    );
    const result = await new RR().run();
    expect(result.stopReason).toBe('wave-cap');
    expect(result.done).toBe(false);
    expect(result.files['result.md']).toContain('# R');
  });
});

// ── (f) fatal: scout / wave-0 brainer death throw ───────────────────────────
describe('ResearchReport.run — fatal deaths throw', () => {
  it('throws when the scout dies', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, (p: string, o: AgentOpts) =>
      o.label === 'scout' ? null : {},
    );
    await expect(new RR().run()).rejects.toThrow(/scout died/);
  });
  it('throws when the wave-0 brainer dies', async () => {
    const agent = (p: string, o: AgentOpts) => {
      if (o.label === 'scout') return SCOUT_OUT;
      if (o.label === 'prospector') return PROSPECT_OUT;
      if (o.label === 'brainer-w0') return null;
      return {};
    };
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, agent);
    await expect(new RR().run()).rejects.toThrow(/brainer died at wave 0/);
  });
});

// ── (g) retryAgent — retry-then-success + retries-exhausted→null (debug on) ──
const SCOUT_OUT2 = {
  landscape: 'the landscape',
  pages: [
    {
      url: 'https://a.com',
      summary: 'page a',
      rabbitHoles: [
        { keyword: 'hnsw tuning', why: 'knobs' },
        { keyword: 'sharding', why: 'scale' },
      ],
    },
    { url: 'https://b.com', summary: 'page b', rabbitHoles: [] },
  ],
  deadEnds: ['https://dead.com — timed out'],
};

function makeRetryAgent() {
  let prospectorCalls = 0;
  return (prompt: string, opts: AgentOpts) => {
    const L = opts.label;
    if (L === 'scout') return SCOUT_OUT2;
    if (L === 'prospector') {
      prospectorCalls++;
      if (prospectorCalls === 1) throw new Error('transient prospector failure');
      return PROSPECT_OUT;
    }
    if (L === 'synthesiser') throw new Error('synthesiser always fails'); // 3 attempts → degrade to null
    return goalAgent(prompt, opts);
  };
}

describe('ResearchReport.run — retryAgent retry + exhaust paths', () => {
  it('retries a transient failure, degrades an always-failing agent to null, captures error I/O', async () => {
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal', debug: true },
      makeRetryAgent(),
    );
    const result = await new RR().run();
    expect(result.highValueSources.length).toBe(2); // prospector recovered on retry
    expect(result.metrics.reportWritten).toBe(false); // synthesiser exhausted → null
    expect(result.files['01-scout.md']).toContain('https://dead.com'); // deadEnds branch
    expect(result.files['_debug.md']).toContain('synthesiser always fails'); // error captured in raw I/O
  });
});

// ── (g2) rich goal run — flips the defensive-default branches in one pass ────
const LONG_Q =
  'best vector database for production retrieval-augmented generation at very large enterprise scale and operating cost';
const LONG_KW =
  'unknown venue lane that is deliberately far longer than sixty-four characters to exercise tree truncation';
const SCOUT_OUT3 = {
  landscape: 'the landscape',
  pages: [
    {
      url: 'https://a.com',
      summary: 'page a',
      rabbitHoles: [
        { keyword: 'hnsw tuning', why: 'knobs' },
        { keyword: 'sharding', why: 'scale' },
      ],
    },
    { url: 'https://b.com', summary: 'page b (no rabbitHoles key)' }, // omits rabbitHoles → exercises the `|| []` guard
  ],
}; // omits deadEnds → exercises the `|| []` guard

function richAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT3;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [
        { id: 1, score: 80 },
        { id: 2, score: 50 },
      ],
      add: [],
      lookupNext: [
        { id: 1 },
        { keyword: LONG_KW, why: 'gap', score: 75, sources: ['Unknown Venue XYZ'] },
      ],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'answered' },
    };
  if (L.startsWith('scheduler-')) return schedulerStub(prompt);
  if (L.startsWith('validator-')) return VALIDATE_OUT; // null lane still reopens via the null-lane path
  if (L.startsWith('lane-w1:hnsw-tuning')) return LANE_OUT;
  if (L.startsWith('lane-')) return null; // the unknown-venue lane fails → null-researcher branches
  if (L === 'initiator')
    return {
      refinement: { facts: [{ fact: 'F', why: 'W' }] },
      synthesiser: { focus: '' },
    };
  if (L.startsWith('refine-')) return { report: 'r' };
  // judge pass 0 → routes to brain finalize-compute; pass 1 → derivation sound → exit
  if (L === 'judge-0')
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: true,
      computeSound: false,
      reasoning: 'needs a derivation',
      directive: 'derive it',
      reopenRabbitHoles: [],
    };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: true,
      computeSound: true,
      reasoning: 'derivation sound',
      directive: '',
    };
  if (L.startsWith('brain-compute-')) return { resultSoFar: { ...RSF, working: 'derived 42 ± 3' } };
  if (L === 'synthesiser')
    return {
      report: '# R\n\nx',
      verdict: 'v',
      confidence: 'medium',
      plan: ['p'],
      openQuestions: ['q'],
    };
  if (L === 'debug-analyst') return null; // diag null → failed-narrative branch
  throw new Error('richAgent: unexpected label ' + L);
}

describe('ResearchReport.run — rich goal run (defensive defaults)', () => {
  it('handles missing scout fields, unknown venue, null lane/sentinel/analyst, brain finalize-compute', async () => {
    const RR = await loadEngine({ query: LONG_Q, mode: 'goal', debug: true }, richAgent);
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    // the judge routed needsCompute → the brain derived the answer (folded into resultSoFar.working)
    expect(keys(result)).toContain('_finalize-compute.md');
    expect(result.files['_finalize-compute.md']).toContain('derived 42 ± 3');
    expect(result.files['_debug.md']).toContain('_(debug analyst failed'); // null analyst narrative
    expect(result.files['_tree.md']).toContain('enterprise scale and operating cost'); // tree-viz renders the goal line FULL in the file — no clip (the tail used to be truncated at 80 chars)
    expect(result.metrics.reportWritten).toBe(true);
  });
});

// ── (g3) rabbithole-dry / rabbithole-empty stop classification ──────────────
function dryAgent(drop: boolean) {
  return (prompt: string, opts: AgentOpts) => {
    const L = opts.label;
    if (L === 'scout') return SCOUT_OUT;
    if (L === 'prospector') return PROSPECT_OUT;
    if (L === 'brainer-w0')
      return {
        resultSoFar: RSF,
        rescore: [
          { id: 1, score: 30 },
          { id: 2, score: 20 },
        ],
        add: [],
        lookupNext: [],
        rename: [],
        drop: drop ? [1, 2] : [],
        stop: { done: false, reason: 'no good leads' },
      };
    if (L === 'initiator')
      return {
        refinement: { facts: [] },
        synthesiser: { focus: '' },
      };
    if (L.startsWith('judge-'))
      return {
        goalMet: true,
        verificationSound: true,
        needsCompute: false,
        computeSound: true,
        reasoning: 'upheld',
        directive: '',
      };
    if (L === 'synthesiser')
      return { report: '# R', verdict: 'v', confidence: 'low', plan: [], openQuestions: [] };
    throw new Error('dryAgent: unexpected label ' + L);
  };
}

describe('ResearchReport.run — dry-store stop classification', () => {
  it('classifies rabbithole-dry when leads remain but none are looked up', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, dryAgent(false));
    const result = await new RR().run();
    expect(result.stopReason).toBe('rabbithole-dry');
  });
  it('classifies rabbithole-empty when the store is emptied', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, dryAgent(true));
    const result = await new RR().run();
    expect(result.stopReason).toBe('rabbithole-empty');
  });
});

// ── (h) manual knobs — non-auto lane/source branches ────────────────────────
describe('ResearchReport.run — manual lane/source knobs', () => {
  it('runs with fixed knobs (assignSources off, fixed srcCount, fixed laneCount)', async () => {
    const RR = await loadEngine(
      {
        query: 'best vector database for production RAG at scale',
        mode: 'goal',
        parallelLaneResearchAgentsPerWave: 2,
        parallelSourcesPerLaneResearchAgent: 3,
      },
      goalAgent,
    );
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    expect(result.files['result.md']).toContain('# Report\n\nbody');
  });
});

// ── (i) brainer self-compute — code-capable (general-purpose) when compute is on, default subagent when off ──
function captureBrainerType(captured: Array<string | undefined>) {
  return function (prompt: string, opts: AgentOpts) {
    const L = opts.label;
    if (L.startsWith('brainer-')) captured.push(opts.agentType);
    if (L === 'scout') return SCOUT_OUT;
    if (L === 'prospector') return PROSPECT_OUT;
    if (L === 'brainer-w0')
      return {
        resultSoFar: RSF,
        rescore: [{ id: 1, score: 80 }],
        add: [],
        lookupNext: [],
        rename: [],
        drop: [],
        stop: { done: true, reason: 'answered' },
      };
    if (L === 'initiator')
      return {
        refinement: { facts: [] },
        synthesiser: { focus: '' },
      };
    if (L.startsWith('judge-'))
      return {
        goalMet: true,
        verificationSound: true,
        needsCompute: false,
        computeSound: true,
        reasoning: 'upheld',
        directive: '',
      };
    if (L === 'synthesiser')
      return { report: '# R', verdict: 'v', confidence: 'medium', plan: [], openQuestions: [] };
    throw new Error('captureBrainerType: unexpected label ' + L);
  };
}

describe('ResearchReport.run — brainer self-compute capability', () => {
  it('runs the brainer as a code-capable general-purpose agent when compute is on, with no separate wave-compute stage', async () => {
    const captured: Array<string | undefined> = [];
    const RR = await loadEngine(
      { query: 'estimate the nearest undetected black hole distance', mode: 'goal' },
      captureBrainerType(captured),
    );
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.every((t) => t === 'general-purpose')).toBe(true); // compute on → the brainer can write+run code itself
    expect(keys(result).some((k) => k.startsWith('_compute-w'))).toBe(false); // no separate wave-compute artifacts — derived inline into `working`
  });

  it('runs the brainer as the default subagent (no code capability) when compute is off', async () => {
    const captured: Array<string | undefined> = [];
    const RR = await loadEngine(
      {
        query: 'estimate the nearest undetected black hole distance',
        mode: 'goal',
        compute: false,
      },
      captureBrainerType(captured),
    );
    await new RR().run();
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.every((t) => t === undefined)).toBe(true); // compute off → no code capability at all
  });
});

// ── (j) compute flag OFF — no computation runs even when agents request it ───
describe('ResearchReport.run — compute flag off', () => {
  it('runs no computation when args.compute is false, even though the judge requests it', async () => {
    // goalAgent's judge returns needsCompute:true — with compute off the engine forces it false (no derivation path)
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal', compute: false },
      goalAgent,
    );
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    expect(keys(result).some((k) => k.startsWith('_compute-'))).toBe(false); // NO compute files at all
    expect(result.files['result.md']).toContain('# Report\n\nbody'); // still finalizes normally
    // A1c — the judge asked for a derivation (needsCompute:true); with compute off it is surfaced as an HONEST
    // limitation (open gap → Open questions), never rubber-stamped away into a fabricated-derivation pass
    expect(
      (result.resultSoFar!.openGaps || []).some((g) =>
        /Quantitative derivation unavailable/.test(g),
      ),
    ).toBe(true);
  });
});

// ── (j2) finalize crawl-reopen carries the judge directive as the lane note (A5) ──
function reopenAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [{ id: 1, score: 80 }],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'answered' },
    };
  if (L.startsWith('brainer-'))
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      stop: { done: true, reason: 'folded' },
    }; // the reopen-fold coordinate
  if (L.startsWith('scheduler-')) return schedulerStub(prompt);
  if (L.startsWith('validator-')) return VALIDATE_OUT;
  if (L.startsWith('lane-')) return LANE_OUT;
  if (L === 'initiator')
    return { refinement: { facts: [{ fact: 'F', why: 'W' }] }, synthesiser: { focus: '' } };
  if (L.startsWith('refine-')) return { report: 'r' };
  if (L === 'judge-0')
    return {
      goalMet: false, // a real coverage gap → reopen the crawl
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'a real evidence gap remains',
      directive: 'DIG INTO THE GAP',
      reopenRabbitHoles: [{ keyword: 'evidence gap', why: 'needed for the headline' }],
    };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'gap closed',
      directive: '',
    };
  if (L === 'synthesiser')
    return { report: '# R', verdict: 'v', confidence: 'medium', plan: [], openQuestions: [] };
  throw new Error('reopenAgent: unexpected label ' + L);
}

describe('ResearchReport.run — finalize crawl-reopen steers with the judge directive', () => {
  it('passes the judge directive as the reopened lane note (A5)', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, reopenAgent);
    const result = await new RR().run();
    const reopened = result.pursuedArchive.find((r) => r.keyword === 'evidence gap');
    expect(reopened).toBeTruthy();
    expect(reopened!.note).toBe('DIG INTO THE GAP'); // the directive steered the finalize lane
    expect(reopened!.path).toContain('⚖ judge');
  });
});

// ── (k) finalize JUDGE loop bounded by MAX_JUDGE_PASSES ──────────────────────
function capAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'initiator')
    return {
      refinement: { facts: [{ fact: 'recall is 0.98', why: 'headline' }] },
      synthesiser: { focus: 'lead with cost' },
    };
  // the judge is NEVER satisfied (derivation never sound) → every pass routes to brain-compute, so the loop runs to the cap
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: true,
      computeSound: false,
      reasoning: 'the derivation still is not sound',
      directive: 'derive again with tighter error bars',
      reopenRabbitHoles: [],
    };
  if (L.startsWith('brain-compute-')) return { resultSoFar: { ...RSF, working: 'derived again' } };
  return goalAgent(prompt, opts);
}

describe('ResearchReport.run — finalize judge loop bounded by MAX_JUDGE_PASSES', () => {
  it('runs the judge at most MAX_JUDGE_PASSES+1 times even when it is never satisfied', async () => {
    const RR = await loadEngine(
      { query: 'best vector database for production RAG at scale', mode: 'goal' },
      capAgent,
    );
    const result = await new RR().run();
    const judgeFile = result.files[keys(result).find((k) => k.endsWith('-judge.md'))!];
    // MAX_JUDGE_PASSES = 2 → the judge runs passes 0,1,2 (3 total), then the loop is capped
    expect(judgeFile).toContain('## Pass 2');
    expect(judgeFile).not.toContain('## Pass 3');
    // the brain derived on each remediation pass, captured into _finalize-compute.md
    expect(keys(result)).toContain('_finalize-compute.md');
  });
});

// ── (l) validator gate — re-opens failing lanes, caps re-fails, surfaces a known gap ──
function refailAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT; // seeds id1 (hnsw tuning) + id2 (sharding)
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [
        { id: 1, score: 80 },
        { id: 2, score: 50 },
      ],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1' || L === 'brainer-w2')
    // keep re-pursuing the reopened lane id1
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'retry the dead lane' },
    };
  if (L === 'brainer-w3')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'gave up on the dead lane' },
    };
  if (L.startsWith('scheduler-')) return schedulerStub(prompt);
  if (L.startsWith('lane-')) return null; // every lane fails outright
  if (L.startsWith('validator-'))
    return {
      checks: [{ id: 1, fulfilled: false, reason: 'empty' }],
      enough: false,
      missing: ['hnsw depth'],
    };
  if (L === 'initiator') return { refinement: { facts: [] }, synthesiser: { focus: '' } };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'ok',
      directive: '',
    };
  if (L === 'synthesiser')
    return { report: '# R', verdict: 'v', confidence: 'low', plan: [], openQuestions: [] };
  throw new Error('refailAgent: unexpected label ' + L);
}

describe('ResearchReport.run — validator reopens then caps a persistently-failing lane', () => {
  it('reopens the dead lane twice, then surfaces it as a known gap (failCount cap)', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, refailAgent);
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    const vFile = result.files[keys(result).find((k) => k.endsWith('-validator.md'))!];
    expect(vFile).toContain('Reopened'); // it was moved back to the open store
    expect(vFile).toContain('Known gaps'); // and then capped after MAX_LANE_REFAILS
    // the capped lane carries the cap as its failCount in the pursued archive
    expect(
      result.pursuedArchive.some((r) => r.keyword === 'hnsw tuning' && r.failCount === 2),
    ).toBe(true);
  });
});

// ── (m) validator gate skipped when every lane returns a substantial finding ──
const THICK = 'x'.repeat(200); // ≥ VALIDATOR_THIN, so the gate does not fire
function skipValidatorAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [{ id: 1, score: 80 }],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'answered' },
    };
  if (L.startsWith('scheduler-')) return schedulerStub(prompt);
  if (L.startsWith('lane-w1:hnsw-tuning'))
    return { runningAnswer: THICK, rabbitHoles: [], deadEnds: [] };
  if (L === 'initiator') return { refinement: { facts: [] }, synthesiser: { focus: '' } };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'ok',
      directive: '',
    };
  if (L === 'synthesiser')
    return { report: '# R', verdict: 'v', confidence: 'high', plan: [], openQuestions: [] };
  // a 'validator-*' label here would throw → proves the gate skipped it
  throw new Error('skipValidatorAgent: unexpected label ' + L);
}

describe('ResearchReport.run — validator gate skips when findings are substantial', () => {
  it('does not run the validator (no -validator.md) when no lane died and findings are thick', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, skipValidatorAgent);
    const result = await new RR().run();
    expect(result.stopReason).toBe('brainer-done');
    expect(keys(result).some((k) => k.endsWith('-validator.md'))).toBe(false);
  });
});

// ── (n) B6 — scheduler-death starvation: an empty schedule N waves running → stopReason scheduler-starved ──
function starveAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L.startsWith('brainer-w')) {
    const w = Number(L.slice('brainer-w'.length));
    // originate a FRESH pursuable lane every wave, so the crawl keeps trying (only the scheduler is starving it)
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [{ keyword: 'fresh lead ' + w, why: 'breadth', score: 80 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'still going' },
    };
  }
  if (L.startsWith('scheduler-')) {
    // the scheduler echoes the lane ids but discovers NO usable sources (every candidate walled/dead)
    const ids = [...new Set([...prompt.matchAll(/#(\d+)/g)].map((m) => Number(m[1])))];
    return { lanes: ids.map((id) => ({ id, sources: [] })) };
  }
  if (L.startsWith('validator-')) return VALIDATE_OUT;
  if (L.startsWith('lane-')) return LANE_OUT; // never reached — empty source lists spawn no readers
  if (L === 'initiator') return { refinement: { facts: [] }, synthesiser: { focus: '' } };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'ok',
      directive: '',
    };
  if (L === 'synthesiser')
    return { report: '# R', verdict: 'v', confidence: 'low', plan: [], openQuestions: [] };
  throw new Error('starveAgent: unexpected label ' + L);
}

describe('ResearchReport.run — scheduler-death starvation guard (B6)', () => {
  it('breaks the crawl with stopReason scheduler-starved after MAX_STARVED_WAVES empty schedules', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, starveAgent);
    const result = await new RR().run();
    expect(result.stopReason).toBe('scheduler-starved');
    expect(result.metrics.wavesRun).toBeLessThan(15); // did NOT grind to HARD_CAP
    expect(result.files['result.md']).toContain('# R'); // still finalizes
  });
});

// ── (n2) B6 — scheduleSources drops hallucinated ids + duplicate-id last-wins ──
describe('ResearchReport.scheduleSources — id discipline (B6)', () => {
  it('keeps only real pick ids and resolves a duplicate id last-wins', async () => {
    const agent = (_p: string, o: AgentOpts) => {
      if (o.label.startsWith('scheduler-'))
        return {
          lanes: [
            { id: 1, sources: [{ source: 'a', path: '/c/a', size: 1, chars: 2 }] },
            { id: 999, sources: [{ source: 'b', path: '/c/b', size: 1, chars: 2 }] }, // hallucinated id → dropped
            { id: 1, sources: [{ source: 'c', path: '/c/c', size: 1, chars: 2 }] }, // duplicate id → last wins
          ],
        };
      return {};
    };
    const RR = await loadEngine({ query: 'q' }, agent);
    const rr = new RR();
    const picks = [{ id: 1, keyword: 'k', why: 'w', score: 50, scoreHistory: [], path: [] }] as any;
    const map = await rr.scheduleSources(
      { highValueSources: [] } as any,
      picks,
      'test',
      'Research',
    );
    expect([...map.keys()]).toEqual([1]); // 999 dropped
    expect(map.get(1)![0].source).toBe('c'); // last-wins
  });
});

// ── (o) B3 — a partial reader failure (one of N readers null) fails the WHOLE lane (gate reopens it) ──
function bigSchedulerStub(prompt: string) {
  const ids = [...new Set([...prompt.matchAll(/#(\d+)/g)].map((m) => Number(m[1])))];
  // a big source (size > budget) → packReaders splits it into 2 reader-units (labels -r1of2 / -r2of2)
  return {
    lanes: ids.map((id) => ({
      id,
      sources: [
        {
          source: 'https://big' + id,
          path: '/cache/big' + id + '.txt',
          size: 260000,
          chars: 520000,
        },
      ],
    })),
  };
}
function partialFailAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'scout') return SCOUT_OUT;
  if (L === 'prospector') return PROSPECT_OUT;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [{ id: 1, score: 80 }],
      add: [],
      lookupNext: [{ id: 1 }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  if (L === 'brainer-w1')
    return {
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: true, reason: 'answered' },
    };
  if (L.startsWith('scheduler-')) return bigSchedulerStub(prompt);
  if (L.includes('-r2of')) return null; // the SECOND reader-unit fails → a dropped chunk
  if (L.startsWith('lane-')) return LANE_OUT; // the first reader-unit succeeds
  if (L.startsWith('validator-'))
    return {
      checks: [{ id: 1, fulfilled: false, reason: 'partial' }],
      enough: false,
      missing: ['rest'],
    };
  if (L === 'initiator') return { refinement: { facts: [] }, synthesiser: { focus: '' } };
  if (L.startsWith('judge-'))
    return {
      goalMet: true,
      verificationSound: true,
      needsCompute: false,
      computeSound: true,
      reasoning: 'ok',
      directive: '',
    };
  if (L === 'synthesiser')
    return { report: '# R', verdict: 'v', confidence: 'low', plan: [], openQuestions: [] };
  throw new Error('partialFailAgent: unexpected label ' + L);
}

describe('ResearchReport.run — a dropped chunk fails the lane (B3 coverage gate)', () => {
  it('reopens a lane when one of its reader-units failed (never masks the drop behind survivors)', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, partialFailAgent);
    const result = await new RR().run();
    // the lane returned null despite reader-1 succeeding → the validator gate fired and reopened it
    const vKey = keys(result).find((k) => k.endsWith('-validator.md'));
    expect(vKey).toBeTruthy();
    expect(result.files[vKey!]).toContain('Reopened');
    expect(result.files[vKey!]).toContain('hnsw tuning');
  });
});

// ── (p) B8 — the per-lane note is surfaced in waveMd + _rabbitHoles.json + _tree.md (no debug mode needed) ──
function noteAgent(prompt: string, opts: AgentOpts) {
  const L = opts.label;
  if (L === 'brainer-w0')
    return {
      resultSoFar: RSF,
      rescore: [{ id: 1, score: 80 }],
      add: [],
      lookupNext: [{ id: 1, note: 'DIG-NOTE', sources: ['arXiv (site:arxiv.org)'] }],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'go' },
    };
  return goalAgent(prompt, opts);
}

describe('ResearchReport.run — per-lane note observability (B8)', () => {
  it('surfaces the lane note in the wave file, _rabbitHoles.json, and _tree.md', async () => {
    const RR = await loadEngine({ query: 'q', mode: 'goal' }, noteAgent);
    const result = await new RR().run();
    expect(result.files['03-wave-0.md']).toContain('note: DIG-NOTE');
    expect(
      JSON.parse(result.files['_rabbitHoles.json']).pursued.some(
        (r: { note?: string }) => r.note === 'DIG-NOTE',
      ),
    ).toBe(true);
    expect(result.files['_tree.md']).toContain('DIG-NOTE');
  });
});

// ── (q) MULTI-BRAINER (maxParallelBrainers > 1) — fork-and-branch: spawn a child, child declares LOST, root wins the gate ──
describe('ResearchReport.run — multi-brainer fork-and-branch (B>1)', () => {
  // root: w0 score seeds → w1 SPAWN a child onto the sharding branch (still active) → w2 declare done (→ gate → winner).
  // child b1-sharding: pick a lane → w2 declare its branch LOST. Asserts: tree has 2 nodes, winner=root, loser file written.
  function multiAgent(prompt: string, opts: AgentOpts) {
    const L = opts.label;
    const coord = (over: Record<string, unknown>) => ({
      resultSoFar: RSF,
      rescore: [],
      add: [],
      lookupNext: [],
      rename: [],
      drop: [],
      stop: { done: false, reason: 'x' },
      ...over,
    });
    if (L === 'scout') return SCOUT_OUT;
    if (L === 'prospector') return PROSPECT_OUT;
    // ROOT
    if (L === 'brainer-w0')
      return coord({
        rescore: [
          { id: 1, score: 80 },
          { id: 2, score: 78 },
        ],
        lookupNext: [{ id: 1, sources: ['arXiv (site:arxiv.org)'] }],
      });
    if (L === 'brainer-w1')
      return coord({
        spawn: { id: 2, mandate: 'sharding' }, // fork a child onto the sharding branch
        lookupNext: [{ keyword: 'root next lane', why: 'more', score: 75 }],
      });
    if (L === 'brainer-w2') return coord({ stop: { done: true, reason: 'root answered' } });
    // CHILD  b1-sharding
    if (L === 'brainer-b1-sharding-w1')
      return coord({ lookupNext: [{ keyword: 'shard internals', why: 'deep', score: 70 }] });
    if (L === 'brainer-b1-sharding-w2')
      return coord({ stop: { done: false, lost: true, reason: 'sharding was a dead end' } });
    // shared sub-agents
    if (L.startsWith('scheduler-')) return schedulerStub(prompt);
    if (L.startsWith('validator-')) return VALIDATE_OUT;
    if (L.startsWith('lane-')) return LANE_OUT;
    if (L === 'initiator')
      return { refinement: { facts: [{ fact: 'f', why: 'w' }] }, synthesiser: { focus: 'lead' } };
    if (L.startsWith('refine-')) return { report: 'hardened fact' };
    if (L.startsWith('judge-'))
      return {
        goalMet: true,
        verificationSound: true,
        needsCompute: false,
        computeSound: true,
        reasoning: 'solid',
        directive: '',
        reopenRabbitHoles: [],
      };
    if (L === 'synthesiser')
      return {
        report: '# Winner report\n\nbody',
        verdict: 'root wins',
        confidence: 'high',
        plan: ['ship'],
        openQuestions: [],
      };
    if (L === 'debug-analyst') return { diagnosis: '# Debug\n\nok' };
    throw new Error('multiAgent: unexpected label ' + L);
  }

  it('forks a child, abandons a lost branch, and the root wins the gate', async () => {
    const RR = await loadEngine(
      { query: 'q', mode: 'goal', maxParallelBrainers: 2, debug: false },
      multiAgent,
    );
    const rr = new RR();
    const result = await rr.run();
    // two brainers in the tree: the root + the spawned child
    expect(rr.liveBrainers.length).toBe(2);
    const names = rr.liveBrainers.map((b: { name: string }) => b.name).sort();
    expect(names).toEqual(['b1-sharding', 'root']);
    // the root won its gate → canonical report
    expect(rr.winner!.name).toBe('root');
    expect(result.files['result.md']).toContain('Winner report');
    // the child abandoned its branch
    const child = rr.liveBrainers.find((b: { name: string }) => b.name === 'b1-sharding')!;
    expect(child.status).toBe('lost');
    // outputs: brainer tree + the loser's preserved partial
    expect(result.files['_brainers-tree.md']).toContain('b1-sharding');
    expect(result.files['_brainers-tree.md']).toContain('⚑WINNER');
    expect(JSON.parse(result.files['_brainers.json']).winner).toBe('root');
    expect(result.files['result-b1-sharding.md']).toContain('LOST');
  });
});
