import { describe, it, expect } from 'vitest'
import { addRabbitHole, applyDeltas, resolveLookupNext, pursue } from '../src/store.js'

const newState = () => ({ rabbitHoles: [], nextId: 1, pursuedKeys: new Set(), pursuedList: [], pursuedArchive: [] })

describe('addRabbitHole', () => {
  it('assigns fresh ids and seeds scoreHistory only when scored', () => {
    const st = newState()
    const a = addRabbitHole(st, { keyword: 'hnsw tuning', why: 'knobs', wave: 0 })
    const b = addRabbitHole(st, { keyword: 'sharding', why: 'scale', score: 55, wave: 1 })
    expect(a.id).toBe(1)
    expect(a.score).toBe(null)
    expect(a.scoreHistory).toEqual([])
    expect(b.id).toBe(2)
    expect(b.score).toBe(55)
    expect(b.scoreHistory).toEqual([{ wave: 1, score: 55 }])
    expect(st.nextId).toBe(3)
  })
  it('dedups by norm(keyword), returning the existing entry (no new id)', () => {
    const st = newState()
    const a = addRabbitHole(st, { keyword: 'HNSW Tuning!', why: 'x', wave: 0 })
    const dup = addRabbitHole(st, { keyword: 'hnsw   tuning', why: 'y', wave: 1 })
    expect(dup).toBe(a)
    expect(st.rabbitHoles.length).toBe(1)
    expect(st.nextId).toBe(2)
  })
  it('returns null for an empty keyword or one already pursued', () => {
    const st = newState()
    expect(addRabbitHole(st, { keyword: '', why: 'x', wave: 0 })).toBe(null)
    st.pursuedKeys.add('sharding')
    expect(addRabbitHole(st, { keyword: 'Sharding', why: 'x', wave: 0 })).toBe(null)
    expect(st.rabbitHoles.length).toBe(0)
  })
})

describe('applyDeltas', () => {
  it('applies rename → drop → rescore → add and pushes scoreHistory', () => {
    const st = newState()
    addRabbitHole(st, { keyword: 'one', why: 'a', wave: 0 })   // id 1
    addRabbitHole(st, { keyword: 'two', why: 'b', wave: 0 })   // id 2
    addRabbitHole(st, { keyword: 'three', why: 'c', wave: 0 }) // id 3
    applyDeltas(st, {
      rename: [{ id: 1, keyword: 'one-renamed', why: 'a2' }],
      drop: [3],
      rescore: [{ id: 1, score: 70 }, { id: 2, score: 40 }],
      add: [{ keyword: 'four', why: 'd', score: 88 }],
    }, 1)
    const byId = Object.fromEntries(st.rabbitHoles.map(r => [r.id, r]))
    expect(byId[1].keyword).toBe('one-renamed')
    expect(byId[1].why).toBe('a2')
    expect(byId[1].score).toBe(70)
    expect(byId[1].scoreHistory).toEqual([{ wave: 1, score: 70 }])
    expect(byId[3]).toBeUndefined()          // dropped
    expect(byId[4].score).toBe(88)           // added (id 4), scoreHistory seeded
    expect(byId[4].scoreHistory).toEqual([{ wave: 1, score: 88 }])
  })
  it('tolerates missing delta arrays and unknown ids', () => {
    const st = newState()
    addRabbitHole(st, { keyword: 'one', why: 'a', wave: 0 })
    expect(() => applyDeltas(st, { rescore: [{ id: 999, score: 5 }] }, 1)).not.toThrow()
    expect(st.rabbitHoles[0].score).toBe(null)
  })
})

describe('resolveLookupNext', () => {
  it('resolves ids + originates keywords, skips pursued, sorts desc, caps at laneCount', () => {
    const st = newState()
    addRabbitHole(st, { keyword: 'a', why: '', score: 10, wave: 0 }) // id 1
    addRabbitHole(st, { keyword: 'b', why: '', score: 90, wave: 0 }) // id 2
    st.pursuedKeys.add('c'); st.rabbitHoles.push({ id: 3, keyword: 'c', why: '', score: 99, scoreHistory: [], path: [] })
    const picks = resolveLookupNext(st, {
      lookupNext: [
        { id: 1, sources: ['arXiv'], sourceCount: 3 },
        { keyword: 'd', why: 'new', score: 50 },   // originate → id 4
        { id: 3 },                                  // pursued → skipped
        { id: 1 },                                  // dup id → skipped
      ],
    }, 1, 2)
    expect(picks.map(p => p.keyword)).toEqual(['d', 'a'])  // 50 > 10, capped to 2
    expect(picks.find(p => p.id === 1).sources).toEqual(['arXiv'])
    expect(picks.find(p => p.id === 1).sourceCount).toBe(3)
  })
})

describe('pursue', () => {
  it('moves picks into the archive, removes them from the store, marks pursuedKeys', () => {
    const st = newState()
    const a = addRabbitHole(st, { keyword: 'alpha', why: '', score: 10, wave: 0 })
    const b = addRabbitHole(st, { keyword: 'beta', why: '', score: 20, wave: 0 })
    addRabbitHole(st, { keyword: 'gamma', why: '', score: 30, wave: 0 })
    pursue(st, [a, b])
    expect(st.rabbitHoles.map(r => r.keyword)).toEqual(['gamma'])
    expect(st.pursuedArchive.map(r => r.keyword)).toEqual(['alpha', 'beta'])
    expect(st.pursuedList).toEqual(['alpha', 'beta'])
    expect(st.pursuedKeys.has('alpha')).toBe(true)
    expect(st.pursuedKeys.has('beta')).toBe(true)
  })
})
