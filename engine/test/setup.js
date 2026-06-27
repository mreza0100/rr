// vitest setupFiles — set the ambient globals the engine reads at MODULE LOAD (`new
// Configs(args)`, `const _agent = agent`, `log('▶ RR START')`) BEFORE any module imports.
// The engine test overrides agent/parallel/pipeline (and args, to switch modes) per-test
// via vi.resetModules() + a fresh dynamic import; these are the safe defaults.
globalThis.args = { query: 'best vector database for production RAG at scale', mode: 'goal' }
globalThis.log = () => {}
globalThis.phase = () => {}
globalThis.agent = async () => ({})
globalThis.parallel = async (thunks) => Promise.all(thunks.map(t => t()))
globalThis.pipeline = async (items, s1, s2) => {
  const out = []
  for (let i = 0; i < items.length; i++) { const a = await s1(items[i], i); out.push(await s2(a, items[i], i)) }
  return out
}
globalThis.budget = { total: null, spent: () => 0, remaining: () => Infinity }
