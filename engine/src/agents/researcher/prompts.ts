// RESEARCHER prompts — the lane-researcher template + its assembly function. Template strings are
// module-level consts; buildResearcher only assembles/substitutes.
import { render } from '../../utils/index.js';
import type { ResearcherArgs } from '../../types/index.js';

const RESEARCHER_TPL = `{{! researcher — a lane researcher pursuing ONE rabbit-hole over its assigned venues }}
Pursue one rabbit-hole. {{net}}
TOP GOAL: "{{query}}".
TRAIL that led here (top goal → … → this rabbit-hole): {{trail}}.
Now investigating: "{{keyword}}" (why it matters: {{why}}). Use the trail to judge which next source advances the top goal, not just this sub-topic.{{refClause}}{{venuesClause}}{{translateClause}}
Run a targeted WebSearch, pick the best {{srcCount}} sources, and WebFetch each in parallel. In each WebFetch prompt, first ask the key question about this rabbit-hole, then append: <<{{footer}}>>
If a source is dead, parked, or returns nothing (e.g. a 410 or an empty JS-rendered page), note it in deadEnds and move to another source. If every source is dead, that is still a valid result: return summary noting the dead ends, rabbitHoles [], and the dead sources in deadEnds.
If a fetched source turns out off-goal — it does not advance the top goal even if it sits on the sub-topic — keep it and open one or more additional sources to reach goal-aligned data, returning both the off-goal find and the new ones. You may exceed the {{srcCount}}-source count for this — gather it and let the brainer decide relevance.
For any trial or study you report, capture its funding source, conflicts of interest, sample size, and key limitations in the summary — the provenance the brainer needs to weight it.
Return: summary (2-4 sentences of what you found); rabbitHoles (new gap searches from the footer, {keyword, why}); nextSources (up to 5 of the page's top outbound citations/links to follow, each {ref: exact URL or DOI, why}); deadEnds.{{researcherClause}}
`;

export const buildResearcher = ({
  net,
  query,
  trail,
  keyword,
  why,
  footer,
  venues,
  parallelSourcesPerLaneResearchAgent,
  researcherNote,
  ref,
}: ResearcherArgs) => {
  const refClause = ref
    ? `
This lane carries a concrete source: fetch ${ref} directly (the fetch tool resolves DOIs) and read it first; widen to WebSearch only if it is unreachable or thin.`
    : '';
  const venuesClause =
    venues && venues.length
      ? `
Search these high-value venues for this lane first: ${venues
          .map(
            (v) =>
              v.source +
              (v.lang ? ' [' + v.lang + ']' : '') +
              (v.goodFor ? ' (' + v.goodFor + ')' : ''),
          )
          .join('; ')}.`
      : '';
  const translateClause =
    venues && venues.some((v) => v.lang)
      ? `
A venue tagged with a non-English language (e.g. [zh]) holds its literature in that language: translate the query terms into it, WebSearch the native venue, read the native-language results, and translate the findings back to English. Carry provenance — give each cited source its original-language title alongside the English translation.`
      : '';
  const researcherClause = researcherNote ? '\n' + researcherNote : '';
  return render(RESEARCHER_TPL, {
    net,
    query,
    trail,
    keyword,
    why,
    refClause,
    venuesClause,
    translateClause,
    srcCount: parallelSourcesPerLaneResearchAgent,
    footer,
    researcherClause,
  });
};
