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
const metaBlock = firstStmt.slice(0, firstStmt.indexOf('\n}\n') + 3) || firstStmt.slice(0, 4000)
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
