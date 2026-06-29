// raw-hooks.mjs — a Node ESM loader hook that resolves `./x.prompt.md?raw` imports to a
// string default-export (the file's exact bytes), so the oracle can import the REAL
// prompts.js under plain `node` exactly as Vite's `?raw` does under vitest. Build-time
// tooling only — never bundled, so its fs/URL use is fine (the determinism guard only
// scans the built ../workflow.js).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const isRawMd = s => typeof s === 'string' && s.includes('.md') && s.endsWith('?raw')

export async function resolve(specifier, context, next) {
  if (isRawMd(specifier)) {
    const target = new URL(specifier.slice(0, -'?raw'.length), context.parentURL)
    return { url: target.href + '?raw', shortCircuit: true }
  }
  return next(specifier, context)
}

export async function load(url, context, next) {
  if (isRawMd(url)) {
    const src = readFileSync(fileURLToPath(url.slice(0, -'?raw'.length)), 'utf8')
    return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(src) }
  }
  return next(url, context)
}
