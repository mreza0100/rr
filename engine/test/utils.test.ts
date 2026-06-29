import { describe, it, expect } from 'vitest';
import {
  plain,
  norm,
  lab,
  padIdx,
  lastScore,
  openLine,
  resultSoFarMd,
  waveMd,
  render,
} from '../src/utils/index.js';
import type { ResultSoFar } from '../src/types/index.js';

describe('plain', () => {
  it('renders a string as-is', () => expect(plain('hello')).toBe('hello'));
  it('renders a number as-is', () => expect(plain(42)).toBe('42'));
  it('renders a boolean as-is', () => expect(plain(true)).toBe('true'));
  it('renders null as empty string', () => expect(plain(null)).toBe(''));
  it('renders an array one "- el" per line', () =>
    expect(plain(['a', 'b', 'c'])).toBe('- a\n- b\n- c'));
  it('renders an object as key: value lines', () =>
    expect(plain({ a: 1, b: 'two' })).toBe('a: 1\nb: two'));
  it('indents nested objects two spaces', () => {
    expect(plain({ a: 1, b: { c: 2, d: 3 } })).toBe('a: 1\nb:\n  c: 2\n  d: 3');
  });
  it('indents nested array elements two spaces after the dash', () => {
    expect(
      plain([
        { k: 'one', v: 1 },
        { k: 'two', v: 2 },
      ]),
    ).toBe('- k: one\n  v: 1\n- k: two\n  v: 2');
  });
  it('SKIPS empty values by default', () => {
    expect(plain({ a: '', b: [], c: {}, d: null, real: 'v' })).toBe('real: v');
  });
  it('KEEPS named empties as "(none)"', () => {
    expect(plain({ a: '', b: 'v' }, { keep: ['a'] })).toBe('a: (none)\nb: v');
  });
});

describe('norm', () => {
  it('lowercases + collapses non-alphanumerics to single spaces, trimmed', () => {
    expect(norm('Hello, World!')).toBe('hello world');
    expect(norm('  Multiple   Spaces  ')).toBe('multiple spaces');
    expect(norm('CamelCase_99')).toBe('camelcase 99');
  });
  it('handles null/empty', () => {
    expect(norm('')).toBe('');
    expect(norm(null)).toBe('');
  });
});

describe('lab', () => {
  it('slugifies + caps at 24 chars', () => {
    expect(lab('Hello, World!')).toBe('hello-world');
    expect(lab('a very long keyword that exceeds the cap')).toBe('a-very-long-keyword-that');
    expect(lab('a very long keyword that exceeds the cap').length).toBe(24);
  });
});

describe('padIdx', () => {
  it('zero-pads to width 2', () => {
    expect(padIdx(0)).toBe('00');
    expect(padIdx(3)).toBe('03');
    expect(padIdx(12)).toBe('12');
    expect(padIdx(100)).toBe('100');
  });
});

describe('lastScore', () => {
  it('returns the last scoreHistory score, else null', () => {
    expect(
      lastScore({
        scoreHistory: [
          { wave: 0, score: 60 },
          { wave: 1, score: 80 },
        ],
      }),
    ).toBe(80);
    expect(lastScore({ scoreHistory: [] })).toBe(null);
  });
});

describe('openLine', () => {
  it('renders a scored entry', () => {
    expect(
      openLine({ id: 7, keyword: 'hnsw', why: 'knobs', scoreHistory: [{ wave: 1, score: 80 }] }),
    ).toBe('#7 [80] hnsw — knobs');
  });
  it('renders an unscored entry as "new"', () => {
    expect(openLine({ id: 8, keyword: 'sharding', why: 'scale', scoreHistory: [] })).toBe(
      '#8 [new] sharding — scale',
    );
  });
});

describe('resultSoFarMd', () => {
  it('returns _none_ for non-objects', () => {
    expect(resultSoFarMd(null)).toBe('_none_');
    expect(resultSoFarMd('x' as unknown as ResultSoFar)).toBe('_none_'); // exercise the non-object guard
  });
  it('renders the full memory block with working', () => {
    const md = resultSoFarMd({
      answer: 'A',
      confidence: 'high',
      working: 'cost = x',
      evidence: [{ status: 'settled', fact: 'f', value: 'v', source: 's' }],
      resolved: ['r'],
      openGaps: ['g'],
      tensions: ['t'],
    });
    expect(md).toContain('**Answer:** A');
    expect(md).toContain('**Confidence:** high');
    expect(md).toContain('**Working:**\n\ncost = x');
    expect(md).toContain('- [settled] **f:** v — s');
    expect(md).toContain('**Resolved:**\n- r');
  });
  it('renders an Assumptions block when present', () => {
    const md = resultSoFarMd({
      answer: 'A',
      confidence: 'high',
      working: '',
      evidence: [],
      assumptions: [{ claim: 'demand holds', basis: 'one analyst note — unconfirmed' }],
      resolved: [],
      openGaps: [],
      tensions: [],
    });
    expect(md).toContain('**Assumptions:**\n- **demand holds** — one analyst note — unconfirmed');
  });
  it('omits the working block when empty and shows _none_ for empty lists', () => {
    const md = resultSoFarMd({
      answer: 'A',
      confidence: 'low',
      working: '',
      evidence: [],
      resolved: [],
      openGaps: [],
      tensions: [],
    });
    expect(md).not.toContain('**Working:**');
    expect(md).toContain('**Evidence:**\n_none_');
    expect(md).toContain('**Resolved:**\n_none_');
  });
});

describe('waveMd', () => {
  it('renders a wave block with picks + open store', () => {
    const coord = {
      stop: { done: false, reason: 'more to verify' },
      resultSoFar: {
        answer: 'A',
        confidence: 'med',
        working: '',
        evidence: [],
        resolved: [],
        openGaps: [],
        tensions: [],
      },
    };
    const picks = [
      { id: 1, keyword: 'hnsw', why: 'knobs', score: 80, path: [], sources: ['arXiv'] },
    ];
    const store = [
      { id: 1, keyword: 'hnsw', scoreHistory: [{ wave: 1, score: 80 }] },
      { id: 2, keyword: 'sharding', scoreHistory: [] },
    ];
    const md = waveMd(2, coord, picks, [], store);
    expect(md).toContain('# Wave 2 — Brainer');
    expect(md).toContain('**done:** false — more to verify');
    expect(md).toContain('## Looking up next (1)');
    expect(md).toContain('1. **[80]** #1 hnsw');
    expect(md).toContain('venues: arXiv');
    expect(md).toContain('## Open rabbit-holes (scored)');
    expect(md.endsWith('\n')).toBe(true);
  });
});

describe('render', () => {
  it('fills placeholders from vars', () => expect(render('a {{x}} b\n', { x: 'Z' })).toBe('a Z b'));
  it('renders an absent key as empty string', () =>
    expect(render('[{{missing}}]\n', {})).toBe('[]'));
  it('strips exactly ONE trailing newline', () => {
    expect(render('line\n', {})).toBe('line');
    expect(render('line\n\n', {})).toBe('line\n');
    expect(render('line', {})).toBe('line');
  });
  it('substitutes a placeholder whose value carries a newline', () => {
    expect(render('a{{c}}\n', { c: '\nmore' })).toBe('a\nmore');
  });
});
