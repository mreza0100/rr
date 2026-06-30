import { describe, it, expect } from 'vitest';
// Per-agent prompt-builders now live on the agent objects (X.buildPrompt); the shared guard clauses in agents/shared.js.
// The aliases below keep the case table + snapshot KEYS byte-identical, so these snapshots remain the prompt byte-equivalence proof.
import {
  scout,
  prospector,
  brainer,
  buildBrainerCompute,
  validator,
  researchScheduler,
  researcher,
  initiator,
  refiner,
  judge,
  synthesiser,
  debugAnalyst,
} from '../src/agents/index.js';
import { FINISH, WEB_ONLY } from '../src/agents/shared.js';
import type {
  SynthesiserArgs,
  CleanReport,
  JudgeArgs,
  InitiatorArgs,
  ResultSoFar,
  Venue,
  WaveLogEntry,
} from '../src/types/index.js';
const SCOUT_PROMPT = scout.buildPrompt;
const PROSPECTOR_PROMPT = prospector.buildPrompt;
const BRAINER_PROMPT = brainer.buildPrompt;
const VALIDATOR_PROMPT = validator.buildPrompt;
const SCHEDULER_PROMPT = researchScheduler.buildPrompt;
const RESEARCHER_PROMPT = researcher.buildPrompt;
const INITIATOR_PROMPT = initiator.buildPrompt;
const REFINE_PROMPT = refiner.buildPrompt;
const JUDGE_PROMPT = judge.buildPrompt;
const BRAIN_COMPUTE_PROMPT = buildBrainerCompute;
const SYNTHESISER_PROMPT = synthesiser.buildPrompt;
const DEBUG_PROMPT = debugAnalyst.buildPrompt;

const Q = 'best vector database for production RAG at scale';
const NET = 'NET-FRAGMENT';
const FOOTER = 'FOOTER-FRAGMENT';
const venues: Venue[] = [
  { source: 'arXiv (site:arxiv.org)', goodFor: 'ANN indexes' },
  { source: 'SemiAnalysis', goodFor: 'cost' },
];
const resultSoFar: ResultSoFar = {
  answer: 'pgvector',
  confidence: 'medium',
  evidence: [{ fact: 'recall', value: '0.98', source: 'arxiv', status: 'settled' }],
  resolved: ['idx'],
  openGaps: ['mt'],
  tensions: [],
  working: 'cost=x',
};
const waveLog: WaveLogEntry[] = [
  { wave: 0, pursued: [], topScore: 0, done: false, reason: 'seed' },
];
const cleanReports: CleanReport[] = [{ fact: 'recall', why: 'lb', clean: '0.96 ± 0.02' }];

// each builder on a representative input → { label, output }
const cases = [
  ['SCOUT_PROMPT', SCOUT_PROMPT({ query: Q, net: NET, footer: FOOTER })],
  [
    'PROSPECTOR_PROMPT',
    PROSPECTOR_PROMPT({ query: Q, landscape: 'L', sources: ['https://a.com'] }),
  ],
  [
    'BRAINER_PROMPT/w0',
    BRAINER_PROMPT({
      wave: 0,
      query: Q,
      rubric: 'RUBRIC',
      landscape: 'L',
      pursuedList: [],
      open: [],
      findings: [],
      topScores: [],
      resultSoFar: null,
      assignSources: false,
      stop: 'STOP',
      mode: 'goal',
      venues: [],
    }),
  ],
  [
    'BRAINER_PROMPT/wN',
    BRAINER_PROMPT({
      wave: 3,
      query: Q,
      rubric: 'RUBRIC',
      landscape: 'L',
      pursuedList: ['a'],
      open: ['#1 [80] x — y'],
      findings: [{ rabbitHole: 'x', summary: 's' }],
      topScores: [90, 70, 50],
      resultSoFar,
      assignSources: true,
      stop: 'STOP',
      mode: 'goal',
      venues,
    }),
  ],
  [
    'BRAINER_PROMPT/collect',
    BRAINER_PROMPT({
      wave: 2,
      query: Q,
      rubric: 'RUBRIC',
      landscape: 'L',
      pursuedList: ['a'],
      open: ['#1 [80] x — y'],
      findings: [],
      topScores: [60, 40],
      resultSoFar,
      assignSources: false,
      stop: 'STOP',
      mode: 'collect',
      venues,
    }),
  ],
  [
    'VALIDATOR_PROMPT',
    VALIDATOR_PROMPT({
      query: Q,
      requests: [{ id: 1, keyword: 'hnsw tuning', why: 'recall knobs' }],
      findings: [{ keyword: 'hnsw tuning', intro: 'covers ef/M tradeoffs' }],
      nullLanes: ['sharding'],
    }),
  ],
  [
    'SCHEDULER_PROMPT',
    SCHEDULER_PROMPT({
      query: Q,
      lanes: [
        {
          id: 1,
          keyword: 'hnsw tuning',
          why: 'recall knobs',
          note: 'find ef/M build-vs-query tradeoffs; if absent, the default recall/latency curve',
          venues,
          ref: '',
        },
      ],
    }),
  ],
  [
    'RESEARCHER_PROMPT',
    RESEARCHER_PROMPT({
      query: Q,
      trail: 'goal  →  x',
      keyword: 'x',
      why: 'w',
      note: 'extract the recall numbers; fallback to latency if recall is absent',
      footer: FOOTER,
      reads: [{ source: 'https://a.com', cachePath: '/cache/a.txt', offset: 0, limit: 2000 }],
      readerIndex: 2,
      readerCount: 3,
      priorAnswer: 'so far: pgvector recall ~0.96',
    }),
  ],
  [
    'INITIATOR_PROMPT',
    INITIATOR_PROMPT({ query: Q, resultSoFar, waveLog, landscape: 'L', openRabbitHoles: ['x'] }),
  ],
  ['REFINE_PROMPT', REFINE_PROMPT({ net: NET, query: Q, fact: 'F', why: 'W' })],
  [
    'JUDGE_PROMPT',
    JUDGE_PROMPT({
      query: Q,
      resultSoFar,
      cleanReports,
      focus: 'lead with cost',
      openRabbitHoles: ['[70] multi-tenant isolation — unverified at scale'],
      compute: true,
    }),
  ],
  [
    'BRAIN_COMPUTE_PROMPT',
    BRAIN_COMPUTE_PROMPT({
      query: Q,
      resultSoFar,
      hardenedFacts: cleanReports,
      directive: 'derive blended cost/query with error bars',
      reason: 'the answer needs a number',
    }),
  ],
  [
    'SYNTHESISER_PROMPT',
    SYNTHESISER_PROMPT({
      mode: 'goal',
      query: Q,
      landscape: 'L',
      resultSoFar,
      waveLog,
      cleanReports,
      focus: 'lead with cost',
      openRabbitHoles: ['x'],
    }),
  ],
  [
    'DEBUG_PROMPT',
    DEBUG_PROMPT({
      query: Q,
      focus: 'why?',
      metrics: {
        mode: 'goal',
        dir: 'RR/x',
        wavesRun: 1,
        stopReason: 'brainer-done',
        scoutRabbitHoles: 3,
        prospectorVenues: 4,
        pursuedTotal: 5,
        rabbitHolesFinal: 2,
        bestOpenScore: 80,
        topScores: [80],
        done: true,
        reportWritten: true,
        confidence: 'high',
      },
      waveLog,
      resultLog: [],
      highValueSources: venues,
      laneRecords: [],
    }),
  ],
];

describe('prompt builders', () => {
  for (const [label, out] of cases) {
    it(`${label} → non-empty string, no leftover holes, anchors the query`, () => {
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
      expect(out).not.toContain('{{');
      expect(out).not.toContain('}}');
    });
    it(`${label} → full-string snapshot`, () => {
      expect(out).toMatchSnapshot();
    });
  }
  it('the query anchors the prompts that take it', () => {
    expect(SCOUT_PROMPT({ query: Q, net: NET, footer: FOOTER })).toContain(Q);
    expect(REFINE_PROMPT({ net: NET, query: Q, fact: 'F', why: 'W' })).toContain(Q);
  });
  it('FINISH / WEB_ONLY guard clauses ride into the right prompts', () => {
    expect(
      BRAINER_PROMPT({
        wave: 0,
        query: Q,
        rubric: 'R',
        landscape: 'L',
        pursuedList: [],
        open: [],
        findings: [],
        topScores: [],
        resultSoFar: null,
        assignSources: false,
        stop: 'S',
        mode: 'goal',
        venues: [],
      }),
    ).toContain(FINISH.trim());
    expect(REFINE_PROMPT({ net: NET, query: Q, fact: 'F', why: 'W' })).toContain(WEB_ONLY.trim());
  });
});

describe('researcherNote — the web-research/probe-agent passthrough', () => {
  const RN = 'Research note: prefer 2025 primary sources';
  // the recipients (scout, prospector, scheduler, researcher, brainer) — each carrying researcherNote
  const recipients = {
    SCOUT_PROMPT: SCOUT_PROMPT({ query: Q, net: NET, footer: FOOTER, researcherNote: RN }),
    PROSPECTOR_PROMPT: PROSPECTOR_PROMPT({
      query: Q,
      landscape: 'L',
      sources: ['https://a.com'],
      researcherNote: RN,
    }),
    SCHEDULER_PROMPT: SCHEDULER_PROMPT({
      query: Q,
      lanes: [{ id: 1, keyword: 'x', why: 'w', note: 'n', venues, ref: '' }],
      researcherNote: RN,
    }),
    RESEARCHER_PROMPT: RESEARCHER_PROMPT({
      query: Q,
      trail: 'goal  →  x',
      keyword: 'x',
      why: 'w',
      note: 'n',
      footer: FOOTER,
      reads: [{ source: 'https://a.com', cachePath: '/cache/a.txt', offset: 0, limit: 100 }],
      readerIndex: 1,
      readerCount: 1,
      priorAnswer: '',
      researcherNote: RN,
    }),
    BRAINER_PROMPT: BRAINER_PROMPT({
      wave: 1,
      query: Q,
      rubric: 'R',
      landscape: 'L',
      pursuedList: [],
      open: [],
      findings: [],
      topScores: [],
      resultSoFar: null,
      assignSources: false,
      stop: 'S',
      mode: 'goal',
      venues: [],
      researcherNote: RN,
    }),
  };
  for (const [label, out] of Object.entries(recipients)) {
    it(`${label} folds in researcherNote when supplied`, () => expect(out).toContain(RN));
  }
  it('renders nothing when researcherNote is empty (the recipients)', () => {
    expect(SCOUT_PROMPT({ query: Q, net: NET, footer: FOOTER, researcherNote: '' })).not.toContain(
      'Research note',
    );
    expect(
      PROSPECTOR_PROMPT({ query: Q, landscape: 'L', sources: ['https://a.com'] }),
    ).not.toContain('Research note');
    expect(
      RESEARCHER_PROMPT({
        query: Q,
        trail: 't',
        keyword: 'x',
        why: 'w',
        note: 'n',
        footer: FOOTER,
        reads: [{ source: 'https://a.com', cachePath: '/cache/a.txt', offset: 0, limit: 100 }],
        readerIndex: 1,
        readerCount: 1,
        priorAnswer: '',
      }),
    ).not.toContain('Research note');
    expect(
      BRAINER_PROMPT({
        wave: 1,
        query: Q,
        rubric: 'R',
        landscape: 'L',
        pursuedList: [],
        open: [],
        findings: [],
        topScores: [],
        resultSoFar: null,
        assignSources: false,
        stop: 'S',
        mode: 'goal',
        venues: [],
      }),
    ).not.toContain('Research note');
  });
  it('never reaches the non-recipient agents even if a note is passed (initiator / judge / synthesiser)', () => {
    // these three builders do not accept researcherNote; the casts deliberately smuggle it in to prove it never reaches the prompt.
    expect(
      INITIATOR_PROMPT({
        query: Q,
        resultSoFar,
        waveLog,
        landscape: 'L',
        openRabbitHoles: ['x'],
        researcherNote: RN,
      } as InitiatorArgs),
    ).not.toContain(RN);
    expect(
      JUDGE_PROMPT({
        query: Q,
        resultSoFar,
        cleanReports,
        focus: 'f',
        openRabbitHoles: [],
        compute: true,
        researcherNote: RN,
      } as JudgeArgs),
    ).not.toContain(RN);
    expect(
      SYNTHESISER_PROMPT({
        mode: 'goal',
        query: Q,
        landscape: 'L',
        resultSoFar,
        waveLog,
        cleanReports,
        focus: 'f',
        openRabbitHoles: ['x'],
        researcherNote: RN,
      } as SynthesiserArgs),
    ).not.toContain(RN);
  });
});

describe('multilingual routing — conditional, prospector → brainer → researcher', () => {
  const guidance =
    'Cover Chinese (CNKI) and Japanese (J-STAGE) — most clinical work on this disease is published there.';
  const nativeVenues: Venue[] = [
    { source: 'CNKI', goodFor: 'Chinese biomedical literature', lang: 'zh' },
    { source: 'arXiv (site:arxiv.org)', goodFor: 'preprints' },
  ];
  const brainerBase = {
    wave: 1,
    query: Q,
    rubric: 'R',
    landscape: 'L',
    pursuedList: [],
    open: [],
    findings: [],
    topScores: [],
    resultSoFar: null,
    assignSources: false,
    stop: 'S',
    mode: 'goal' as const,
  };
  it('languageGuidance threads prospector → brainer when non-empty', () => {
    const out = BRAINER_PROMPT({
      ...brainerBase,
      venues: nativeVenues,
      languageGuidance: guidance,
    });
    expect(out).toContain(guidance);
    expect(out).toContain('non-English');
  });
  it('the brainer language clause renders nothing for an English-dominated run', () => {
    const en = BRAINER_PROMPT({ ...brainerBase, venues, languageGuidance: '' });
    expect(en).not.toContain('non-English');
    // empty languageGuidance is byte-identical to passing none at all
    expect(en).toBe(BRAINER_PROMPT({ ...brainerBase, venues }));
  });
  it('a non-English venue triggers the scheduler translate clause + lang tag (the scheduler now searches)', () => {
    const out = SCHEDULER_PROMPT({
      query: Q,
      lanes: [{ id: 1, keyword: 'x', why: 'w', note: 'n', venues: nativeVenues, ref: '' }],
    });
    expect(out).toContain('CNKI [zh] (Chinese biomedical literature)');
    expect(out).toContain('translate its query terms');
  });
  it('an all-English lane leaves the scheduler prompt untouched (no translate clause, no lang tag)', () => {
    const out = SCHEDULER_PROMPT({
      query: Q,
      lanes: [{ id: 1, keyword: 'x', why: 'w', note: 'n', venues, ref: '' }],
    });
    expect(out).not.toContain('translate its query terms');
    expect(out).toContain('arXiv (site:arxiv.org) (ANN indexes)'); // un-tagged, exactly as before
  });
});

describe('follow-the-links — the scheduler takes a carried ref directly', () => {
  const lane = { id: 1, keyword: 'x', why: 'w', note: 'n', venues };
  it('surfaces a carried ref to the scheduler as a direct source', () => {
    const out = SCHEDULER_PROMPT({ query: Q, lanes: [{ ...lane, ref: '10.1234/foo' }] });
    expect(out).toContain('10.1234/foo');
    expect(out).toContain('ref (fetch directly)');
  });
  it('renders no ref line (byte-identical) when no ref is carried', () => {
    const none = SCHEDULER_PROMPT({ query: Q, lanes: [{ ...lane, ref: '' }] });
    expect(none).not.toContain('ref (fetch directly)');
    expect(none).toBe(SCHEDULER_PROMPT({ query: Q, lanes: [lane] }));
  });
});

describe('validator — per-wave coverage gate', () => {
  const base = {
    query: Q,
    requests: [{ id: 1, keyword: 'k', why: 'w' }],
    findings: [{ keyword: 'k', intro: 'i' }],
  };
  it('lists the dead lanes when any returned nothing', () => {
    const out = VALIDATOR_PROMPT({ ...base, nullLanes: ['sharding'] });
    expect(out).toContain('Lanes that returned nothing');
    expect(out).toContain('sharding');
  });
  it('renders nothing (byte-identical) when no lane died', () => {
    const none = VALIDATOR_PROMPT({ ...base, nullLanes: [] });
    expect(none).not.toContain('Lanes that returned nothing');
  });
});

describe('validator → brainer feedback', () => {
  const base = {
    wave: 2,
    query: Q,
    rubric: 'R',
    landscape: 'L',
    pursuedList: [],
    open: [],
    findings: [],
    topScores: [],
    resultSoFar: null,
    assignSources: false,
    stop: 'S',
    mode: 'goal' as const,
    venues: [],
  };
  const missing = 'multi-tenant isolation; sharding (lane retried twice — treat as a known gap)';
  it('threads the validator gaps into the brainer when set', () => {
    const out = BRAINER_PROMPT({ ...base, lastValidatorMissing: missing });
    expect(out).toContain('VALIDATOR — last wave left these unfilled');
    expect(out).toContain(missing);
  });
  it('renders nothing (byte-identical) when there are no validator gaps', () => {
    const none = BRAINER_PROMPT({ ...base, lastValidatorMissing: '' });
    expect(none).not.toContain('VALIDATOR — last wave left these unfilled');
    expect(none).toBe(BRAINER_PROMPT(base));
  });
});

describe('brainer — the working-derivation clause is gated on compute (A1a)', () => {
  const base = {
    wave: 1,
    query: Q,
    rubric: 'R',
    landscape: 'L',
    pursuedList: [],
    open: [],
    findings: [],
    topScores: [],
    resultSoFar: null,
    assignSources: false,
    stop: 'S',
    mode: 'goal' as const,
    venues: [],
  };
  it('compute ON ⇒ instructs growing the `working` derivation chain', () => {
    const out = BRAINER_PROMPT({ ...base, compute: true });
    expect(out).toContain('grow the `working` derivation chain');
    expect(out).not.toContain('STATED UNCERTAINTY');
  });
  it('compute OFF ⇒ leave `working` empty + STATED UNCERTAINTY, never hand-roll a derivation', () => {
    const out = BRAINER_PROMPT({ ...base, compute: false });
    expect(out).toContain('STATED UNCERTAINTY');
    expect(out).toContain('never hand-roll a derivation');
    expect(out).not.toContain('grow the `working` derivation chain');
    expect(out).not.toContain('COMPUTE TO STEER'); // the steering-compute block is also gated off
  });
});

describe('synthesiser — the derivation mention is gated on compute (A1b)', () => {
  const base = {
    mode: 'goal' as const,
    query: Q,
    landscape: 'L',
    resultSoFar, // carries working: 'cost=x'
    waveLog,
    cleanReports,
    focus: 'lead with cost',
    openRabbitHoles: ['x'],
  };
  it('compute ON (or unset) + a `working` derivation ⇒ presents it verbatim', () => {
    expect(SYNTHESISER_PROMPT({ ...base, compute: true })).toContain('present it verbatim');
    expect(SYNTHESISER_PROMPT(base)).toContain('present it verbatim'); // unset ⇒ present-when-derived default
  });
  it('compute OFF ⇒ never presents a derivation even when `working` is non-empty', () => {
    const out = SYNTHESISER_PROMPT({ ...base, compute: false });
    expect(out).not.toContain('present it verbatim');
    expect(out).not.toContain('LEADING with the computed result');
  });
});

describe('initiator — collect mode hardens breadth, not a single answer (A4)', () => {
  const base = { query: Q, resultSoFar, waveLog, landscape: 'L', openRabbitHoles: ['x'] };
  it('collect ⇒ harden BREADTH / completeness of the catalogue', () => {
    const out = INITIATOR_PROMPT({ ...base, mode: 'collect' });
    expect(out).toContain('COLLECT inventory');
    expect(out).toContain('completeness of the catalogue');
  });
  it('goal (or unset) ⇒ no collect breadth clause', () => {
    expect(INITIATOR_PROMPT({ ...base, mode: 'goal' })).not.toContain('COLLECT inventory');
    expect(INITIATOR_PROMPT(base)).not.toContain('COLLECT inventory');
  });
});

describe('judge — collect mode gates goalMet on inventory-completeness (A4)', () => {
  const base = {
    query: Q,
    resultSoFar,
    cleanReports,
    focus: 'lead with cost',
    openRabbitHoles: [],
    compute: true,
  };
  it('collect ⇒ judge goalMet as INVENTORY COMPLETENESS', () => {
    const out = JUDGE_PROMPT({ ...base, mode: 'collect' });
    expect(out).toContain('INVENTORY COMPLETENESS');
    expect(out).toContain('individually verified');
  });
  it('goal (or unset) ⇒ no inventory-completeness clause', () => {
    expect(JUDGE_PROMPT({ ...base, mode: 'goal' })).not.toContain('INVENTORY COMPLETENESS');
    expect(JUDGE_PROMPT(base)).not.toContain('INVENTORY COMPLETENESS');
  });
});

describe('judge — the finalize compute switch', () => {
  const base = {
    query: Q,
    resultSoFar,
    cleanReports,
    focus: 'lead with cost',
    openRabbitHoles: [],
  };
  it('offers the derivation path when compute is on', () => {
    const out = JUDGE_PROMPT({ ...base, compute: true });
    expect(out).toContain('A derivation may be written and run');
    expect(out).not.toContain('Derivation is off');
  });
  it('disables the derivation path when compute is off but allows an HONEST needsCompute (A1c)', () => {
    const out = JUDGE_PROMPT({ ...base, compute: false });
    expect(out).toContain('Derivation is off for this run');
    expect(out).toContain('set needsCompute false');
    // honesty path: the judge may still flag a genuinely-needed derivation as a stated limitation
    expect(out).toContain('set needsCompute true');
    expect(out).toContain('stated limitation');
  });
});

describe('judge — the leftover open-rabbit-holes input (B1-refinement)', () => {
  const base = {
    query: Q,
    resultSoFar,
    cleanReports,
    focus: 'lead with cost',
    compute: true,
  };
  it('threads the leftover open rabbit-holes in and offers to reopen the crawl', () => {
    const out = JUDGE_PROMPT({
      ...base,
      openRabbitHoles: ['[80] multi-tenant isolation — unverified'],
    });
    expect(out).toContain('LEFTOVER OPEN RABBIT-HOLES');
    expect(out).toContain('multi-tenant isolation');
    expect(out).toContain('reopen the crawl');
  });
  it('renders nothing (byte-identical) when there are no leftover rabbit-holes', () => {
    const none = JUDGE_PROMPT({ ...base, openRabbitHoles: [] });
    expect(none).not.toContain('LEFTOVER OPEN RABBIT-HOLES');
  });
});
