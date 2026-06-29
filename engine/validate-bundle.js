// validate-bundle.js — enforces the Workflow sandbox contract on the built ../workflow.js.
// Run by build.js after every bundle. Any violation throws → `npm run build` fails loudly.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const SRC = dirname(fileURLToPath(import.meta.url))
const BUNDLE = join(SRC, '..', 'workflow.js')
const src = readFileSync(BUNDLE, 'utf8')
const fail = (msg) => { console.error('✗ bundle invalid — ' + msg); process.exit(1) }

// 1) must parse as JS
try { execSync('node --check ' + JSON.stringify(BUNDLE), { stdio: 'pipe' }) }
catch (e) { fail('node --check failed:\n' + (e.stderr || e.stdout || e.message)) }

// 1b) must ALSO compile as the BODY of the async function the harness wraps it in. `node --check` above
//     parses the file as an ES MODULE, which tolerates dangling `} from '…'` fragments that a function
//     scope rejects — the exact failure a multi-line-import drop produced. Compile (don't run) it the way
//     Workflow loads it: de-export meta (illegal in a function body); the top-level `return await` needs async.
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const HARNESS_GLOBALS = ['agent', 'parallel', 'pipeline', 'log', 'phase', 'workflow', 'args', 'budget']
try { new AsyncFunction(...HARNESS_GLOBALS, src.replace(/^export const meta/, 'const meta')) }
catch (e) { fail('not valid as the harness function body (how Workflow loads it): ' + e.message) }

// 2) no surviving module system at runtime (the harness wraps it in a function scope).
//    The ONLY allowed export is the top `export const meta`; no import/require/module.exports.
if (/\brequire\s*\(/.test(src)) fail('contains require( — must be a self-contained single file')
if (/^\s*import\b/m.test(src)) fail('contains a surviving `import` statement')
if (/module\.exports|exports\./.test(src)) fail('contains CommonJS exports')
const exportHits = src.match(/^\s*export\b/gm) || []
if (exportHits.length !== 1) fail('expected exactly ONE export (`export const meta`), found ' + exportHits.length)

// 3) `export const meta = { … }` must be the first statement (top of file) and a pure literal.
const firstStmt = src.replace(/^(?:\s*\/\/[^\n]*\n|\s*\n)*/, '')   // skip leading comments + blank lines
if (!/^export const meta = \{/.test(firstStmt)) fail('file must BEGIN with `export const meta = {` (after comments)')
// meta literal ends at the first COLUMN-0 `}` (nested braces are indented; a formatter's trailing `;` is tolerated).
const metaEnd = firstStmt.indexOf('\n}')
const metaBlock = metaEnd >= 0 ? firstStmt.slice(0, metaEnd + 2) : firstStmt.slice(0, 4000)
if (/\.\.\./.test(metaBlock)) fail('meta object uses a spread — it must be a pure literal')
if (/=>|\bfunction\b|\brequire\s*\(|\bimport\s*\(/.test(metaBlock)) fail('meta object is computed (call/function) — it must be a pure literal')

// 4) determinism guard — none of these non-deterministic / host globals (usage-level, so prose
//    words like "url"/"WebFetch"/"process" do not trip it). Mirrors the harness static guard.
const FORBIDDEN = [
  [/\bDate\.now\b/, 'Date.now()'],
  [/\bMath\.random\b/, 'Math.random()'],
  [/new\s+Date\s*\(\s*\)/, 'argless new Date()'],
  [/\bBuffer\s*[.(]|new\s+Buffer\b/, 'Buffer'],
  [/\bprocess\./, 'process.*'],
  [/(^|[^A-Za-z.])fetch\s*\(/m, 'fetch('],
  [/\bcrypto\b/, 'crypto'],
  [/new\s+URL\s*\(/, 'new URL('],
  [/\bURL\./, 'URL.'],
]
for (const [re, label] of FORBIDDEN) {
  if (re.test(src)) fail('contains forbidden non-deterministic global: ' + label)
}

console.log('✓ bundle valid — single-file, `export const meta` literal at top, no forbidden globals')
