import { CONFIG } from '../config.js';
import type { Evidence, Finding, ResultSoFar, ScoreEntry, Stop } from '../types/index.js';

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
export const lastScore = (r: { scoreHistory: ScoreEntry[] }): number | null =>
  r.scoreHistory.length ? r.scoreHistory[r.scoreHistory.length - 1].score : null;
// one-line render of an open store entry for the brainer / sentinel: `#id [last score or "new"] keyword — why`
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

// the HIDDEN lane cap: the brainer is never told a count — JS clamps to laneCount (5 in auto) here.
export const laneCount: number =
  CONFIG.parallelLaneResearchAgentsPerWave === 'auto'
    ? 5
    : CONFIG.parallelLaneResearchAgentsPerWave;
export const trailOf = (path: string[], keyword?: string): string =>
  [CONFIG.query.length > 60 ? CONFIG.query.slice(0, 57) + '…' : CONFIG.query]
    .concat(path || [], keyword ? [keyword] : [])
    .join('  →  ');

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
