import { defineConfig } from 'vitest/config'

// Coverage is measured over the engine LOGIC modules. meta.js (pure data) and index.js (entry
// wiring) carry no testable logic; build/validate are build-time tooling. Everything else —
// config validation, schemas, utils, prompt builders, store reducers, and the engine phases
// (exercised via mocked ambient globals) — must clear the 90% bar.
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/config.js', 'src/schemas.js', 'src/prompts.js', 'src/store.js', 'src/engine.js', 'src/utils/**/*.js'],
      exclude: ['src/meta.js', 'src/index.js', 'src/vendor/**', 'build.js', 'validate-bundle.js', 'vitest.config.js', 'test/**'],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
})
