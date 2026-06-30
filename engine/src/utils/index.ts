import { CONFIG } from '../config.js';
import type {
  Evidence,
  Finding,
  ReadSlice,
  ResultSoFar,
  SchedulerSource,
  ScoreEntry,
  Stop,
  Venue,
} from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — stateless transforms + the file/markdown renderers.
// ─────────────────────────────────────────────────────────────────────────────
export const norm = (s: string | null | undefined): string =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
// normalize a URL/DOI for dedup — drop scheme, www, the doi.org resolver prefix, and any trailing slash so
// "https://doi.org/10.x" and "10.X" collapse to one key (the fetch tool resolves either form).
export const normRef = (s: string | null | undefined): string =>
  (s || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^(?:dx\.)?doi\.org\//, '')
    .replace(/\/+$/, '');
export const lab = (s: string): string => norm(s).replace(/ /g, '-').slice(0, 24);
export const padIdx = (n: number): string => String(n).padStart(2, '0');
// clip — when s exceeds n chars, keep the first n-3 and append '…'; shorter strings pass through unchanged.
export const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 3) + '…' : s);
export const lastScore = (r: { scoreHistory: ScoreEntry[] }): number | null =>
  r.scoreHistory.length ? r.scoreHistory[r.scoreHistory.length - 1].score : null;
// one-line render of an open store entry for the brainer: `#id [last score or "new"] keyword — why`
// (a ` ↪ ref` suffix flags a lead that carries a concrete URL/DOI to fetch directly).
export const openLine = (r: {
  id: number;
  keyword: string;
  why: string;
  scoreHistory: ScoreEntry[];
  ref?: string;
}): string =>
  '#' +
  r.id +
  ' [' +
  (r.scoreHistory.length ? r.scoreHistory[r.scoreHistory.length - 1].score : 'new') +
  '] ' +
  r.keyword +
  ' — ' +
  r.why +
  (r.ref ? ' ↪ ' + r.ref : '');

// plain() — render a value as compact PLAIN TEXT for interpolation INTO an agent prompt (replaces JSON.stringify-in-prompts: less noise, no
// braces/quotes). string/number/boolean → as-is; array → one "- el" line each (recursing, nested indented two spaces); object → "key: value"
// per key, SKIPPING any key whose value is null/undefined/''/[]/{} unless opts.keep names it (those render "key: (none)"); nested indent two spaces.
export const isEmpty = (v: unknown): boolean =>
  v == null ||
  v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
export function plain(value: unknown, opts?: { keep?: string[] }): string {
  opts = opts || {};
  const keep = opts.keep || [];
  if (value == null) return '';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((el: unknown) =>
        plain(el, opts)
          .split('\n')
          .map((l, i) => (i === 0 ? '- ' : '  ') + l)
          .join('\n'),
      )
      .join('\n');
  }
  const lines: string[] = [];
  for (const k of Object.keys(value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[k];
    if (isEmpty(v)) {
      if (keep.includes(k)) lines.push(k + ': (none)');
      continue;
    }
    if (typeof v === 'object') {
      lines.push(k + ':');
      for (const ln of plain(v, opts).split('\n')) lines.push('  ' + ln);
    } else {
      lines.push(k + ': ' + String(v));
    }
  }
  return lines.join('\n');
}

// the HIDDEN lane cap: the brainer is never told a count — JS clamps to laneCount (AUTO_CAP in auto) here.
export const laneCount: number =
  CONFIG.parallelLaneResearchAgentsPerWave === 'auto'
    ? CONFIG.AUTO_CAP
    : CONFIG.parallelLaneResearchAgentsPerWave;
export const trailOf = (path: string[], keyword?: string): string =>
  [clip(CONFIG.query, 60)].concat(path || [], keyword ? [keyword] : []).join('  →  ');

// map the brainer's assigned source-identifier strings back to the full {source, goodFor} venue objects (for the
// researcher prompt) — looked up against the prospector's high-value venue set on rr; an unknown id renders bare.
export const venuesFor = (rr: { highValueSources: Venue[] }, sources?: string[]): Venue[] => {
  if (!sources || !sources.length) return [];
  return sources.map(
    (s) => rr.highValueSources.find((v) => v.source === s) || { source: s, goodFor: '' },
  );
};

// packReaders — the MECHANICAL splitter (B5/B2/B7). Bin-pack a lane's sized sources into reader-units, each ≤
// `budget` tokens AND ≤ budget×charsPerToken CHARS. The UNIT is the budget, not the source: small sources that
// fit together COMBINE into one reader (its `reads` list holds several whole files); a source bigger than the
// budget SPLITS across enough readers, with `overlap` chars re-read at each split boundary.
//
// B2 — UNIT CONSISTENCY: the read window is in CHARS but the budget is in TOKENS, so `budget` is converted to a
//   char ceiling (`budgetChars = budget × charsPerToken`, the SAME over-count heuristic the scheduler sizes with)
//   and BOTH dimensions gate every pack: a source is split when size > budget OR chars > budgetChars, and the
//   split count is the MAX of both estimates — so a source the scheduler under-counts in tokens but is huge in
//   chars still splits. The scheduler's `size`/`chars` are treated as HINTS only (re-confirmed here defensively).
//   (The true byte-length / file-existence check lives in the reader — the workflow VM has no fs; see B3.)
// B7 — bounded packing: at most `maxSlices` whole sources combine into one reader (a lane of 40 tiny files never
//   packs 40 into one turn). Caller also caps sources-per-lane before this.
// A path-less / zero-char source is DROPPED (never emit a doomed reader). Returns one ReadSlice[] per reader.
export function packReaders(
  sources: SchedulerSource[],
  budget: number,
  overlap: number,
  maxSlices: number = Infinity,
  charsPerToken: number,
): ReadSlice[][] {
  const budgetChars = Math.max(1, Math.floor(budget * charsPerToken));
  const readers: ReadSlice[][] = [];
  let cur: ReadSlice[] = [];
  let curTokens = 0;
  let curChars = 0;
  const flush = () => {
    if (cur.length) {
      readers.push(cur);
      cur = [];
      curTokens = 0;
      curChars = 0;
    }
  };
  for (const s of sources || []) {
    if (!s || !s.path) continue; // a path-less source is dropped (the reader has nothing on disk to read)
    // mechanical guard: derive chars + size defensively (inverse heuristic when one is missing), never trust junk.
    const chars =
      Number.isFinite(s.chars) && s.chars > 0
        ? Math.floor(s.chars)
        : Math.max(0, Math.round((Number(s.size) || 0) * charsPerToken));
    if (chars <= 0) continue;
    const size =
      Number.isFinite(s.size) && s.size > 0
        ? Math.floor(s.size)
        : Math.max(1, Math.round(chars / charsPerToken));
    // a source must split when it overflows EITHER the token budget OR the char ceiling (units kept consistent).
    if (size <= budget && chars <= budgetChars) {
      // whole source fits a reader-unit; flush first if combining it would overflow tokens/chars OR the slice cap.
      if (
        cur.length &&
        (curTokens + size > budget || curChars + chars > budgetChars || cur.length >= maxSlices)
      )
        flush();
      cur.push({ source: s.source, cachePath: s.path, offset: 0, limit: chars });
      curTokens += size;
      curChars += chars;
    } else {
      // oversized source — flush the current pack, then split it across enough readers (by BOTH dimensions) with overlap.
      flush();
      const parts = Math.max(Math.ceil(size / budget), Math.ceil(chars / budgetChars));
      const per = Math.ceil(chars / parts); // ≤ budgetChars by construction (forward progress past the overlap)
      for (let p = 0; p < parts; p++) {
        const start = Math.max(0, p * per - (p > 0 ? overlap : 0));
        const end = Math.min(chars, (p + 1) * per); // capped by the real remaining chars
        if (end > start)
          readers.push([
            { source: s.source, cachePath: s.path, offset: start, limit: end - start },
          ]);
      }
    }
  }
  flush();
  return readers;
}

// PROMPT_LOG — the exact prompt sent for EVERY agent call, keyed by label (always populated, not just in debug). The numbered phase files
// prepend their own prompt (Change E): the prompt lives in the phase file, not a separate _io.md.
export const PROMPT_LOG: Record<string, string> = {};
// CHANGE E — prepend the exact prompt sent for `label` ahead of a numbered phase file's body. result.md stays clean (never wrapped).
export const withPrompt = (label: string, body: string): string =>
  (PROMPT_LOG[label] ? '## Prompt sent\n\n' + PROMPT_LOG[label] + '\n\n---\n\n' : '') + body;

// render — fill a template's `{{key}}` holes from a vars object. A tiny deterministic
// `String.replace` replacer (no engine, no globals): (1) strip ONE trailing template newline
// (editors add one; the inline templates carried none); (2) strip standalone `{{! … }}` comment
// lines whole — line + newline — so they stay invisible; (3) substitute each `{{key}}` with its
// value, an absent key rendering as ''. Single-pass, so a substituted value is never re-scanned.
export const render = (tpl: string, vars: Record<string, unknown>): string =>
  tpl
    .replace(/\n$/, '')
    .replace(/^[ \t]*\{\{![\s\S]*?\}\}[ \t]*(?:\r?\n|$)/gm, '')
    .replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      const v = vars[k];
      return v == null ? '' : String(v);
    });

// markdown render of a wave's resultSoFar (the brainer's living memory) — this IS the kept per-wave log.
export const bullets = (arr: string[] | null | undefined): string =>
  arr && arr.length ? arr.map((x) => '- ' + x).join('\n') : '_none_';
export function resultSoFarMd(r: ResultSoFar | null): string {
  if (!r || typeof r !== 'object') return '_none_';
  const ev = (r.evidence || [])
    .map(
      (e: Evidence) =>
        '- [' +
        (e.status || '?') +
        '] **' +
        (e.fact || '') +
        ':** ' +
        (e.value || '') +
        (e.source ? ' — ' + e.source : ''),
    )
    .join('\n');
  return (
    '**Answer:** ' +
    (r.answer || '_(none)_') +
    '\n\n**Confidence:** ' +
    (r.confidence || '_(none)_') +
    (r.working ? '\n\n**Working:**\n\n' + r.working : '') +
    '\n\n**Evidence:**\n' +
    (ev || '_none_') +
    (r.assumptions && r.assumptions.length
      ? '\n\n**Assumptions:**\n' +
        r.assumptions.map((a) => '- **' + (a.claim || '') + '** — ' + (a.basis || '')).join('\n')
      : '') +
    '\n\n**Resolved:**\n' +
    bullets(r.resolved) +
    '\n\n**Open gaps:**\n' +
    bullets(r.openGaps) +
    '\n\n**Tensions:**\n' +
    bullets(r.tensions)
  );
}

// per-wave brainer markdown (one file per crawl wave). `store` = the open rabbit-hole store snapshot at write time.
type WavePick = {
  id: number;
  keyword: string;
  why: string;
  score: number | null;
  path: string[];
  sources?: string[];
  note?: string; // the brainer's per-lane directive — surfaced so degraded runs are debuggable without debug mode
};
type WaveStoreEntry = { id: number; keyword: string; scoreHistory: ScoreEntry[] };
export function waveMd(
  wave: number,
  coord: { stop: Stop; resultSoFar: ResultSoFar | null },
  picks: WavePick[],
  finds: Finding[],
  store: WaveStoreEntry[],
): string {
  const sc = (p: { score: number | null }) => (p.score != null ? p.score : 'new');
  return (
    '# Wave ' +
    wave +
    ' — Brainer\n\n**done:** ' +
    coord.stop.done +
    ' — ' +
    coord.stop.reason +
    '\n\n## Result so far\n\n' +
    resultSoFarMd(coord.resultSoFar) +
    (finds.length
      ? '\n\n## Findings pursued this wave\n\n' +
        finds
          .map(
            (f) => '### ' + f.rabbitHole + '\n\n_trail: ' + (f.trail || '') + '_\n\n' + f.summary,
          )
          .join('\n\n')
      : '') +
    '\n\n## Looking up next (' +
    picks.length +
    ')\n\n' +
    (picks
      .map(
        (p, i) =>
          i +
          1 +
          '. **[' +
          sc(p) +
          ']** #' +
          p.id +
          ' ' +
          p.keyword +
          '\n   - trail: ' +
          trailOf(p.path) +
          (p.sources && p.sources.length ? '\n   - venues: ' + p.sources.join(', ') : '') +
          (p.note ? '\n   - note: ' + p.note : '') +
          '\n   - ' +
          p.why,
      )
      .join('\n') || '_none_') +
    '\n\n## Open rabbit-holes (scored)\n\n' +
    ([...store]
      .sort((a, b) => (lastScore(b) ?? -1) - (lastScore(a) ?? -1))
      .map(
        (r) =>
          '- **[' +
          (lastScore(r) != null ? lastScore(r) : 'new') +
          ']** #' +
          r.id +
          ' ' +
          r.keyword,
      )
      .join('\n') || '_none_') +
    '\n'
  );
}
