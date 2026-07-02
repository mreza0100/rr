// build.js — custom concatenating bundler for the RR Workflow engine.
//
// Why not esbuild: the Workflow sandbox needs the output file to BEGIN with
// `export const meta = { …pure literal… }` AND END with a top-level `return await …run()`.
// esbuild (any --format) restructures exports to `var meta = …; export { meta }` at the
// bottom and REJECTS top-level return inside a module. Neither is fixable by flags. So we
// concatenate the ES modules into one flat script ourselves: strip cross-module import/export
// (everything shares one top-level scope), keep meta's `export const` verbatim at the very top,
// and append the harness return as a tail. (Prompt templates are now inlined as literals in each
// src/agents/<agent>/prompts.ts; inlinePromptImports below stays as a defensive no-op for any future `?raw`.)
//
// TypeScript: the source is `.ts`, but the bundle must be plain JS. We type-strip each module with
// Node's built-in `stripTypeScriptTypes` (mode:'strip') BEFORE acorn parses it. Strip mode BLANKS type
// annotations in place (replacing them with whitespace) — it never reflows code, so meta stays
// byte-identical at the top, acorn parses the result as plain JS, and no helper globals are injected.
// (This needs the source to avoid emit-requiring TS — no enums / namespaces / parameter-properties;
// we use plain `type`/annotations only.)
//
// build.js itself runs under Node at BUILD time — its fs/path/child_process use never enters the
// bundle (only the stripped module source does). Edit src/, run `npm run build`, commit both.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { parse } from 'acorn';

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = join(SRC, '..', 'workflow.js');

// Concatenation order MUST preserve the original file's load-time order so load-time consts
// (`const CONFIG = new Configs(args)`, `const laneCount = CONFIG.…`) resolve identically.
const ORDER = [
  'src/meta.ts', // keeps `export const meta` — the ONE surviving export, at the very top
  'src/agents/shared.ts', // shared prompt fragments (FINISH/WEB_ONLY) + shared schema bricks (pure literals, no deps)
  'src/config.ts', // Configs class + `const CONFIG = new Configs(args)`
  'src/utils/index.ts', // pure helpers + PROMPT_LOG/withPrompt + the local render() (depend on CONFIG)
  // per-agent modules — one DIRECTORY per agent: `prompts.ts` (template consts + the assembly fn) then
  // `index.ts` (the schema literal + the agent object referencing the assembly fn). prompts BEFORE index so
  // the assembly fn is defined before the agent object closes over it. All after shared (top-level schemas
  // reference the shared bricks at load) + after utils (builders call render/plain). The agents/index.ts
  // barrel is a re-export only → intentionally NOT bundled.
  'src/agents/scout/prompts.ts',
  'src/agents/scout/index.ts',
  'src/agents/prospector/prompts.ts',
  'src/agents/prospector/index.ts',
  'src/agents/brainer/prompts.ts',
  'src/agents/brainer/index.ts',
  'src/agents/validator/prompts.ts',
  'src/agents/validator/index.ts',
  'src/agents/researchScheduler/prompts.ts',
  'src/agents/researchScheduler/index.ts',
  'src/agents/researcher/prompts.ts',
  'src/agents/researcher/index.ts',
  'src/agents/initiator/prompts.ts',
  'src/agents/initiator/index.ts',
  'src/agents/refiner/prompts.ts',
  'src/agents/refiner/index.ts',
  'src/agents/judge/prompts.ts',
  'src/agents/judge/index.ts',
  'src/agents/synthesiser/prompts.ts',
  'src/agents/synthesiser/index.ts',
  'src/agents/debugAnalyst/prompts.ts',
  'src/agents/debugAnalyst/index.ts',
  // v3 ledger clerks — each a bounded, mechanical, batched-per-wave job wired into the engine's ingestWave.
  'src/agents/claimAuditor/prompts.ts',
  'src/agents/claimAuditor/index.ts',
  'src/agents/lineageClerk/prompts.ts',
  'src/agents/lineageClerk/index.ts',
  'src/agents/rerunner/prompts.ts',
  'src/agents/rerunner/index.ts',
  'src/agents/scribe/prompts.ts',
  'src/agents/scribe/index.ts',
  'src/store.ts', // store reducers (pure functions over a state object)
  'src/brainerState.ts', // BrainerState — one brainer's private crawl state (a StoreState); before the run.ts modules that type their param on it
  'src/runtime.ts', // shared sub-agent caller (retryAgent) + debug I/O buffers — before the run.ts modules
  // per-agent run.ts orchestration — buildPrompt → retryAgent → (artifact). Each AFTER its agent index/prompts
  // (above) + config/utils/store/runtime, BEFORE engine.ts (the backbone that one-line-calls them).
  'src/agents/scout/run.ts',
  'src/agents/prospector/run.ts',
  'src/agents/brainer/run.ts',
  'src/agents/validator/run.ts',
  'src/agents/researchScheduler/run.ts',
  'src/agents/researcher/run.ts',
  'src/agents/initiator/run.ts',
  'src/agents/refiner/run.ts',
  'src/agents/judge/run.ts',
  'src/agents/synthesiser/run.ts',
  'src/agents/debugAnalyst/run.ts',
  'src/agents/claimAuditor/run.ts',
  'src/agents/lineageClerk/run.ts',
  'src/agents/rerunner/run.ts',
  'src/agents/scribe/run.ts',
  'src/engine.ts', // the ResearchReport class — orchestration backbone + every files[name] = … write
];
const TAIL =
  '\n// ── entry — the Workflow harness wraps this file in an async scope and awaits its return ──\n' +
  'const rr = new ResearchReport()\n' +
  'return await rr.run()\n';

// `import NAME from './…x.prompt.md?raw'`  →  `const NAME = "<file contents, JSON-escaped>"`
// (dev/vitest loads templates as text via Vite's `?raw`; the bundler inlines the same bytes.)
function inlinePromptImports(code, fileDir) {
  return code.replace(
    /^import\s+(\w+)\s+from\s+['"](.+?\.prompt\.md)(?:\?raw)?['"]\s*;?\s*$/gm,
    (_, name, rel) => `const ${name} = ${JSON.stringify(readFileSync(join(fileDir, rel), 'utf8'))}`,
  );
}

const fail = (msg) => {
  console.error('✗ build failed — ' + msg);
  process.exit(1);
};

// Every import in a bundled module MUST resolve to another bundled module — else its symbols won't
// exist in the one flat scope. `resolvable` = the ORDER files + re-export barrels (engine.ts pulls the
// agents through src/agents/index.ts, which is NOT bundled itself but whose names all reach the flat
// scope from their own ORDER modules). Any OTHER import — an npm package, or an internal file left out
// of ORDER — FAILS the build loudly: a silent drop is exactly what left a dangling `} from '…'` fragment
// (Prettier wrapped a long import; the old line-based drop deleted only the first line) or a ReferenceError.
const REEXPORT_BARRELS = ['src/agents/index.ts'];
const resolvable = new Set([...ORDER, ...REEXPORT_BARRELS].map((m) => join(SRC, m)));

function assertBundled(spec, fileDir, mod) {
  if (!spec.startsWith('.')) {
    fail(
      mod +
        ': imports external package "' +
        spec +
        '" — the Workflow sandbox has no module loader.\n' +
        '       Vendor it as pure JS under src/ + add to ORDER (no forbidden globals), or move the work to a compute agent.',
    );
  }
  const target = join(fileDir, spec).replace(/\.js$/, '.ts'); // map the runtime .js specifier back to its .ts source
  if (!resolvable.has(target)) {
    fail(
      mod +
        ': imports "' +
        spec +
        '" but its target is not bundled — its symbols would be undefined in the flat scope.\n' +
        '       Add the resolved module to ORDER (or, if it is a pure re-export barrel, to REEXPORT_BARRELS).',
    );
  }
}

// strip a module down to its bare declarations for flat concatenation. AST-based (acorn) so it is
// provably correct: a real parser tells code from strings, so it can never mis-handle a multi-line
// import, a string literal that contains the word `import`, or an unusual import/export form.
function stripModule(code, fileDir, mod, isMeta) {
  code = stripTypeScriptTypes(code, { mode: 'strip' }); // blank TS type annotations → valid JS for acorn (position-preserving, no reflow)
  code = inlinePromptImports(code, fileDir);
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  // collect byte-offset spans to delete, then apply right-to-left so earlier offsets stay valid
  const cuts = [];
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      assertBundled(node.source.value, fileDir, mod); // every import must resolve to a bundled module
      cuts.push([node.start, node.end]); // drop the whole import — its symbols live in the flat scope
    } else if (isMeta) {
      // meta.ts keeps `export const meta` verbatim — leave its export untouched
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        cuts.push([node.start, node.declaration.start]); // `export const X` → strip just the `export ` keyword
      } else {
        if (node.source) assertBundled(node.source.value, fileDir, mod);
        cuts.push([node.start, node.end]); // `export { … } [from '…']` re-export → drop the whole statement
      }
    } else if (node.type === 'ExportAllDeclaration') {
      if (node.source) assertBundled(node.source.value, fileDir, mod);
      cuts.push([node.start, node.end]); // `export * from '…'` → drop the whole statement
    } else if (node.type === 'ExportDefaultDeclaration') {
      cuts.push([node.start, node.declaration.start]); // `export default <x>` → strip the `export default ` prefix
    }
  }
  cuts.sort((a, b) => b[0] - a[0]);
  for (const [start, end] of cuts) code = code.slice(0, start) + code.slice(end);
  return code;
}

let bundle = '';
ORDER.forEach((mod, i) => {
  const p = join(SRC, mod);
  // the FIRST module (meta.ts) gets NO banner — the harness needs `export const meta` as the
  // literal first bytes of the bundle. Every later module keeps its `// ╔══ module:` banner.
  if (i > 0)
    bundle += '// ╔══ module: ' + mod + ' ' + '═'.repeat(Math.max(0, 60 - mod.length)) + '\n';
  bundle += stripModule(readFileSync(p, 'utf8'), dirname(p), mod, mod === 'src/meta.ts').replace(
    /\n+$/,
    '\n',
  );
});
bundle += TAIL;

writeFileSync(OUT, bundle);
console.log('bundled → ' + OUT + ' · ' + bundle.split('\n').length + ' lines');

// chain the validator — a non-zero exit here fails `npm run build` loudly
execSync('node ' + JSON.stringify(join(SRC, 'validate-bundle.js')), { stdio: 'inherit' });
