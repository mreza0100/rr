// REFINER prompts — the fact-hardening template + its assembly function. Template strings are
// module-level consts; buildRefiner only assembles/substitutes.
import { render } from '../../utils/index.js';
import { WEB_ONLY } from '../shared.js';
import type { RefineArgs } from '../../types/index.js';

const REFINE_TPL = `{{! refine — adversarially fact-check ONE load-bearing fact and return its corrected, hardened version }}
Fact-check and harden this load-bearing fact for the goal "{{query}}". {{net}}
Fact: {{fact}}
Why it is load-bearing: {{why}}
First verify it adversarially: hunt counter-evidence, newer information, and the real numbers — actively look for where it is false, outdated, or imprecise. Do not rubber-stamp a well-supported fact; do not manufacture doubt about one you cannot actually break. Then settle every doubt against the sources and return only the clean, corrected claim(s) — the right values, current and verified, dropping anything that does not hold. Cite sources inline.{{directiveClause}}
Return report (markdown): the hardened claim(s) for this fact.{{WEB_ONLY}}
`;

export const buildRefiner = ({ net, query, fact, why, directive }: RefineArgs) => {
  const directiveClause = directive
    ? `\nA judge flagged the prior verification — re-check it: ${directive}`
    : '';
  return render(REFINE_TPL, { net, query, fact, why, directiveClause, WEB_ONLY });
};
