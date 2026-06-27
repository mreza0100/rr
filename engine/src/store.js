import { norm } from './utils/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// Store reducers — pure functions over a `state` object that carries the crawl's
// rabbit-hole store (rabbitHoles, nextId, pursuedKeys, pursuedList, pursuedArchive).
// In the original these were methods on ResearchReport; here `state` is the first
// arg (the engine passes `this`). Logic is identical.
// ─────────────────────────────────────────────────────────────────────────────

// add-or-find an OPEN rabbit-hole. Dedup by norm(keyword) against the open store AND the pursued set; returns the existing/new entry, or
// null when the keyword is already pursued (never re-open a pursued lane). New entries get a fresh id; scoreHistory seeded only when a score is given.
export function addRabbitHole(state, { keyword, why, path, score, wave }) {
  const k = norm(keyword)
  if (!k || state.pursuedKeys.has(k)) return null
  const existing = state.rabbitHoles.find(r => norm(r.keyword) === k)
  if (existing) return existing
  const scored = typeof score === 'number'
  const rh = { id: state.nextId++, keyword, why: why || '', score: scored ? score : null, scoreHistory: scored ? [{ wave, score }] : [], path: path || [] }
  state.rabbitHoles.push(rh)
  return rh
}

// apply the brainer's DELTAS to the open store, in order: rename → drop → rescore → add. scoreHistory carried natively by id (no reconcile).
export function applyDeltas(state, coord, wave) {
  for (const r of (coord.rename || [])) {
    const rh = state.rabbitHoles.find(x => x.id === r.id)
    if (rh) { rh.keyword = r.keyword; if (r.why) rh.why = r.why }
  }
  if (coord.drop && coord.drop.length) {
    const gone = new Set(coord.drop)
    state.rabbitHoles = state.rabbitHoles.filter(x => !gone.has(x.id))
  }
  for (const r of (coord.rescore || [])) {
    const rh = state.rabbitHoles.find(x => x.id === r.id)
    if (rh) { rh.score = r.score; rh.scoreHistory.push({ wave, score: r.score }) }
  }
  for (const a of (coord.add || [])) addRabbitHole(state, { keyword: a.keyword, why: a.why, path: [], score: a.score, wave })
}

// resolve the brainer's `lookupNext` into open-store entries to pursue NOW: id → existing lead; keyword → originate (or find). Drop any
// already pursued, attach the lane's assigned venues, dedup, then take the highest-scoring up to laneCount (the hard ceiling).
export function resolveLookupNext(state, coord, wave, laneCount) {
  const picks = []
  for (const item of (coord.lookupNext || [])) {
    let rh = null
    if (typeof item.id === 'number') rh = state.rabbitHoles.find(x => x.id === item.id)
    else if (item.keyword) rh = addRabbitHole(state, { keyword: item.keyword, why: item.why, path: [], score: item.score, wave })
    if (!rh || state.pursuedKeys.has(norm(rh.keyword))) continue
    if (item.sources) rh.sources = item.sources
    if (typeof item.sourceCount === 'number') rh.sourceCount = item.sourceCount
    if (!picks.some(p => p.id === rh.id)) picks.push(rh)
  }
  return picks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, laneCount)
}

// PURSUE — MOVE picks out of the open store into the pursued-archive (no delete-on-pursue): the archive keeps each lead's id + scoreHistory + path.
export function pursue(state, picks) {
  for (const p of picks) {
    state.pursuedKeys.add(norm(p.keyword))
    state.pursuedList.push(p.keyword)
    state.pursuedArchive.push(p)
  }
  const gone = new Set(picks.map(p => p.id))
  state.rabbitHoles = state.rabbitHoles.filter(r => !gone.has(r.id))
}
