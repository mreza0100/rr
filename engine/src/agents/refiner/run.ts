import { CONFIG } from '../../config.js';
import { refiner } from './index.js';
import { retryAgent } from '../../runtime.js';
import type { BrainerState } from '../../brainerState.js';
import type { CleanReport, FactToHarden, RefineOut } from '../../types/index.js';

// REFINE the named load-bearing facts in parallel — one sonnet refine agent per fact; on a re-run the judge `directive`
// rides into each so it re-checks what the judge flagged. Returns the hardened reports + the refinement artifact markdown
// (the engine writes/overwrites the refinement file). passTag keeps labels unique per pass.
export async function runRefine(
  bs: BrainerState,
  facts: FactToHarden[],
  directive: string,
  passTag: string,
): Promise<{ cleanReports: CleanReport[]; artifact: string }> {
  const refined = await parallel(
    facts.map(
      (f, i) => () =>
        retryAgent<RefineOut>(
          refiner.buildPrompt({
            net: CONFIG.NET,
            query: CONFIG.query,
            fact: f.fact,
            why: f.why,
            directive,
          }),
          {
            label: 'refine-' + passTag + i,
            phase: CONFIG.PHASE.finalize,
            model: refiner.tier,
            effort: refiner.effort,
            schema: refiner.schema,
          },
        ),
    ),
  );
  const cleanReports: CleanReport[] = facts.map((f, i) => ({
    fact: f.fact,
    why: f.why,
    clean: (refined[i] && refined[i]!.report) || '(refine failed)',
  }));
  const artifact =
    '# Refinement — fact-check & harden the load-bearing facts\n\n' +
    (facts.length
      ? facts
          .map(
            (f, i) =>
              '## ' +
              (i + 1) +
              ' — ' +
              f.fact +
              '\n\n_' +
              f.why +
              '_\n\n' +
              ((refined[i] && refined[i]!.report) || '_(refine failed)_'),
          )
          .join('\n\n')
      : '_no facts to harden_') +
    '\n';
  return { cleanReports, artifact };
}
