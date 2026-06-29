// SENTINEL prompts — the terminal-skeptic template + its assembly function. Template strings are
// module-level consts; buildSentinel only assembles/substitutes.
import { plain, render } from '../../utils/index.js';
import { FINISH } from '../shared.js';
import type { SentinelArgs } from '../../types/index.js';

const SENTINEL_TPL = `{{! sentinel — goal-mode guard that contests a premature done and can force one more wave }}
The brainer just declared the crawl done for: "{{query}}". Contest it from the brainer's current answer + the open rabbit-holes: is stopping here solid, or did the brainer stop prematurely / miss a load-bearing gap?
Brainer's result so far (its current answer + evidence + open gaps):
{{resultSoFar}}
Reason it called done: {{reason}}
Per-wave log (what each wave pursued + where the answer stood):
{{waveLog}}
Open rabbit-holes not yet pursued (\`#id [score] keyword — why\`):
{{rabbitHoles}}
Already pursued — do not propose any of these:
{{pursuedList}}
High bar: uphold the brainer (solid=true) unless a load-bearing gap would materially change or undermine the answer — "more detail is possible" is not a reason to continue.
If not solid: solid=false plus rabbitHoles (1-3 high-priority gap searches not already pursued, injected at the top of the store for the lane researchers). If solid: solid=true, empty rabbitHoles.
Return solid (bool), reasoning, rabbitHoles.{{thinkerClause}}{{researcherClause}}{{FINISH}}
`;

export const buildSentinel = ({
  query,
  resultSoFar,
  reason,
  waveLog,
  rabbitHoles,
  pursuedList,
  thinkerNote,
  researcherNote,
}: SentinelArgs) => {
  const thinkerClause = thinkerNote ? '\n\n' + thinkerNote : '';
  const researcherClause = researcherNote ? '\n' + researcherNote : '';
  return render(SENTINEL_TPL, {
    query,
    resultSoFar: plain(resultSoFar),
    reason: plain(reason),
    waveLog: plain(waveLog),
    rabbitHoles: plain(rabbitHoles),
    pursuedList: plain(pursuedList),
    thinkerClause,
    researcherClause,
    FINISH,
  });
};
