// SCOUT prompts — the wave-0 seed template + its assembly function. The template strings are
// module-level consts; buildScout only assembles/substitutes (it holds no template text itself).
import { render } from '../../utils/index.js';
import type { ScoutArgs } from '../../types/index.js';

const SCOUT_TPL = `{{! scout — one broad sweep that maps the web landscape and seeds the first rabbit-holes }}
Scout the web landscape for: "{{query}}". {{net}}
Step 1 — run one broad WebSearch to map the landscape and collect candidate sources (URLs).
Step 2 — pick the up-to-5 most relevant sources and fetch each via mcp__harvester__fetch — built-in WebFetch is denied. For each fetched page, first surface the key facts about "{{query}}", then apply this instruction: <<{{footer}}>>
Step 3 — return: landscape (one paragraph); pages[] (each: url, 2-3 sentence summary, rabbitHoles[] copied from the page's "Rabbit holes" section as {keyword, why}); deadEnds[] for any source that timed out, was parked, or was off-topic — do not invent rabbit-holes for those. If every source is dead/unreachable, still return a valid result: landscape from your search, pages [], the dead sources in deadEnds.{{researcherClause}}
`;

export const buildScout = ({ query, net, footer, researcherNote }: ScoutArgs) => {
  const researcherClause = researcherNote ? '\n' + researcherNote : '';
  return render(SCOUT_TPL, { query, net, footer, researcherClause });
};
