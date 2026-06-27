import { CONFIG } from '../config.js'
import { Mustache } from '../vendor/mustache.js'

// render() delegates to the vendored mustache interpreter. DISABLE html-escaping at load time —
// our prompts carry `<<…>>`, `&`, and raw markup that must pass through verbatim (the old
// hand-rolled render never escaped). Mustache must not introduce any non-deterministic global.
Mustache.escape = (t) => t

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — stateless transforms + the file/markdown renderers.
// ─────────────────────────────────────────────────────────────────────────────
export const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const lab = s => norm(s).replace(/ /g, '-').slice(0, 24)
export const padIdx = n => String(n).padStart(2, '0')
export const lastScore = r => r.scoreHistory.length ? r.scoreHistory[r.scoreHistory.length - 1].score : null
// one-line render of an open store entry for the brainer / sentinel: `#id [last score or "new"] keyword — why`
export const openLine = r => '#' + r.id + ' [' + (r.scoreHistory.length ? r.scoreHistory[r.scoreHistory.length - 1].score : 'new') + '] ' + r.keyword + ' — ' + r.why

// plain() — render a value as compact PLAIN TEXT for interpolation INTO an agent prompt (replaces JSON.stringify-in-prompts: less noise, no
// braces/quotes). string/number/boolean → as-is; array → one "- el" line each (recursing, nested indented two spaces); object → "key: value"
// per key, SKIPPING any key whose value is null/undefined/''/[]/{} unless opts.keep names it (those render "key: (none)"); nested indent two spaces.
export const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
export function plain(value, opts) {
  opts = opts || {}
  const keep = opts.keep || []
  if (value == null) return ''
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(el => plain(el, opts).split('\n').map((l, i) => (i === 0 ? '- ' : '  ') + l).join('\n')).join('\n')
  }
  const lines = []
  for (const k of Object.keys(value)) {
    const v = value[k]
    if (isEmpty(v)) { if (keep.includes(k)) lines.push(k + ': (none)'); continue }
    if (typeof v === 'object') {
      lines.push(k + ':')
      for (const ln of plain(v, opts).split('\n')) lines.push('  ' + ln)
    } else {
      lines.push(k + ': ' + String(v))
    }
  }
  return lines.join('\n')
}

// the HIDDEN lane cap: the brainer is never told a count — JS clamps to laneCount (5 in auto) here.
export const laneCount = CONFIG.parallelLaneResearchAgentsPerWave === 'auto' ? 5 : CONFIG.parallelLaneResearchAgentsPerWave
export const trailOf = (path, keyword) => [CONFIG.query.length > 60 ? CONFIG.query.slice(0, 57) + '…' : CONFIG.query].concat(path || [], keyword ? [keyword] : []).join('  →  ')

// PROMPT_LOG — the exact prompt sent for EVERY agent call, keyed by label (always populated, not just in debug). The numbered phase files
// prepend their own prompt (Change E): the prompt lives in the phase file, not a separate _io.md.
export const PROMPT_LOG = {}
// CHANGE E — prepend the exact prompt sent for `label` ahead of a numbered phase file's body. result.md stays clean (never wrapped).
export const withPrompt = (label, body) => (PROMPT_LOG[label] ? '## Prompt sent\n\n' + PROMPT_LOG[label] + '\n\n---\n\n' : '') + body

// render — fill a `.prompt.md` template's `{{placeholder}}` holes from a vars object via the
// vendored mustache engine. Strips ONE trailing template newline (editors add one; the original
// inline templates carried none) BEFORE rendering; mustache leaves an absent key as ''. Standalone
// `{{! … }}` comment lines in a template are stripped whole (line + newline), so they're invisible.
export const render = (tpl, vars) => Mustache.render(tpl.replace(/\n$/, ''), vars)

// markdown render of a wave's resultSoFar (the brainer's living memory) — this IS the kept per-wave log.
export const bullets = arr => (arr && arr.length) ? arr.map(x => '- ' + x).join('\n') : '_none_'
export function resultSoFarMd(r) {
  if (!r || typeof r !== 'object') return '_none_'
  const ev = (r.evidence || []).map(e => '- [' + (e.status || '?') + '] **' + (e.fact || '') + ':** ' + (e.value || '') + (e.source ? ' — ' + e.source : '')).join('\n')
  return '**Answer:** ' + (r.answer || '_(none)_') + '\n\n**Confidence:** ' + (r.confidence || '_(none)_') +
    (r.working ? '\n\n**Working:**\n\n' + r.working : '') +
    '\n\n**Evidence:**\n' + (ev || '_none_') +
    '\n\n**Resolved:**\n' + bullets(r.resolved) +
    '\n\n**Open gaps:**\n' + bullets(r.openGaps) +
    '\n\n**Tensions:**\n' + bullets(r.tensions)
}

// per-wave brainer markdown (one file per crawl wave). `store` = the open rabbit-hole store snapshot at write time.
export function waveMd(wave, coord, picks, finds, store) {
  const sc = p => (p.score != null ? p.score : 'new')
  return '# Wave ' + wave + ' — Brainer\n\n**done:** ' + coord.stop.done + ' — ' + coord.stop.reason +
    '\n\n## Result so far\n\n' + resultSoFarMd(coord.resultSoFar) +
    (finds.length ? '\n\n## Findings pursued this wave\n\n' + finds.map(f => '### ' + f.rabbitHole + '\n\n_trail: ' + (f.trail || '') + '_\n\n' + f.summary).join('\n\n') : '') +
    '\n\n## Looking up next (' + picks.length + ')\n\n' + (picks.map((p, i) => (i + 1) + '. **[' + sc(p) + ']** #' + p.id + ' ' + p.keyword + '\n   - trail: ' + trailOf(p.path) + (p.sources && p.sources.length ? '\n   - venues: ' + p.sources.join(', ') : '') + '\n   - ' + p.why).join('\n') || '_none_') +
    '\n\n## Open rabbit-holes (scored)\n\n' + ([...store].sort((a, b) => (lastScore(b) ?? -1) - (lastScore(a) ?? -1)).map(r => '- **[' + (lastScore(r) != null ? lastScore(r) : 'new') + ']** #' + r.id + ' ' + r.keyword).join('\n') || '_none_') + '\n'
}
