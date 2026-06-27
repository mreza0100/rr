// build.js — custom concatenating bundler for the RR Workflow engine.
//
// Why not esbuild: the Workflow sandbox needs the output file to BEGIN with
// `export const meta = { …pure literal… }` AND END with a top-level `return await …run()`.
// esbuild (any --format) restructures exports to `var meta = …; export { meta }` at the
// bottom and REJECTS top-level return inside a module. Neither is fixable by flags. So we
// concatenate the ES modules into one flat script ourselves: strip cross-module import/export
// (everything shares one top-level scope), inline the `.prompt.md` templates as string consts,
// keep meta's `export const` verbatim at the very top, and append the harness return as a tail.
//
// build.js itself runs under Node at BUILD time — its fs/path/child_process use never enters the
// bundle (only the stripped module source does). Edit src/, run `npm run build`, commit both.

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const SRC = dirname(fileURLToPath(import.meta.url))
const OUT = join(SRC, '..', 'workflow.js')

// Concatenation order MUST preserve the original file's load-time order so load-time consts
// (`const CONFIG = new Configs(args)`, `const laneCount = CONFIG.…`) resolve identically.
const ORDER = [
  'src/meta.js',            // keeps `export const meta` — the ONE surviving export, at the very top
  'src/schemas.js',         // pure schema literals (no deps)
  'src/config.js',          // Configs class + `const CONFIG = new Configs(args)`
  'src/vendor/mustache.js', // vendored logic-less template engine (render() delegates here)
  'src/utils/index.js',     // pure helpers + PROMPT_LOG/withPrompt (depend on CONFIG + mustache)
  'src/prompts.js',         // prompt builders; `.prompt.md` templates inlined here
  'src/store.js',           // store reducers (pure functions over a state object)
  'src/engine.js',          // agent infra (retryAgent/log) + the ResearchReport class
]
const TAIL =
  '\n// ── entry — the Workflow harness wraps this file in an async scope and awaits its return ──\n' +
  'const rr = new ResearchReport()\n' +
  'return await rr.run()\n'

// `import NAME from './…x.prompt.md?raw'`  →  `const NAME = "<file contents, JSON-escaped>"`
// (dev/vitest loads templates as text via Vite's `?raw`; the bundler inlines the same bytes.)
function inlinePromptImports(code, fileDir) {
  return code.replace(
    /^import\s+(\w+)\s+from\s+['"](.+?\.prompt\.md)(?:\?raw)?['"]\s*;?\s*$/gm,
    (_, name, rel) => `const ${name} = ${JSON.stringify(readFileSync(join(fileDir, rel), 'utf8'))}`,
  )
}

// strip a module down to its bare declarations for flat concatenation
function stripModule(code, fileDir, isMeta) {
  code = inlinePromptImports(code, fileDir)
  const out = []
  for (const line of code.split('\n')) {
    if (/^\s*import\b/.test(line)) continue                                   // drop cross-module imports
    if (/^\s*export\s*\{[^}]*\}\s*(from\s+['"].*['"])?\s*;?\s*$/.test(line)) continue   // drop `export { … }` / re-exports
    if (isMeta) { out.push(line); continue }                                  // meta.js: keep `export const meta` verbatim
    out.push(line.replace(/^(\s*)export\s+(const|let|var|function|class|async\s+function)\b/, '$1$2'))
  }
  return out.join('\n')
}

let bundle = ''
ORDER.forEach((mod, i) => {
  const p = join(SRC, mod)
  // the FIRST module (meta.js) gets NO banner — the harness needs `export const meta` as the
  // literal first bytes of the bundle. Every later module keeps its `// ╔══ module:` banner.
  if (i > 0) bundle += '// ╔══ module: ' + mod + ' ' + '═'.repeat(Math.max(0, 60 - mod.length)) + '\n'
  bundle += stripModule(readFileSync(p, 'utf8'), dirname(p), mod === 'src/meta.js').replace(/\n+$/, '\n')
})
bundle += TAIL

writeFileSync(OUT, bundle)
console.log('bundled → ' + OUT + ' · ' + bundle.split('\n').length + ' lines')

// chain the validator — a non-zero exit here fails `npm run build` loudly
execSync('node ' + JSON.stringify(join(SRC, 'validate-bundle.js')), { stdio: 'inherit' })
