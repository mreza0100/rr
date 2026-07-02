// RESEARCH SCHEDULER prompts — the discovery template + its assembly function. Template strings are
// module-level consts; buildResearchScheduler only assembles/substitutes the per-wave clauses.
import { render } from '../../utils/index.js';
import type { ResearchSchedulerArgs, SchedulerLaneInput } from '../../types/index.js';

const SCHEDULER_TPL = `{{! researchScheduler — discovery: per lane, find + size the highest-value sources, grouped per lane }}
You are the RESEARCH SCHEDULER — you own source discovery for this wave. For each lane below, find the HIGHEST-VALUE sources to read — as MANY as genuinely add value, no cap. The readers only read what you return; they do not search.
TOP GOAL: "{{query}}".
Tools (load any missing via ToolSearch): WebSearch; mcp__harvester__search; mcp__harvester__findWorks — resolves a work/DOI to its open-access full text; mcp__harvester__fetch — fetches + caches a url/DOI. Built-in WebFetch is denied; fetch only through Harvester.
LANES — each carries a rabbit-hole, the brainer's directive \`note\` (WHAT to find + ranked fallbacks), and the venues to prefer:
{{lanes}}
Work in TWO batched rounds — never one-source-at-a-time round-trips:
1. DISCOVER — run ALL lanes' searches in ONE parallel batch (WebSearch / mcp__harvester__search / findWorks). Prefer each lane's assigned venues; let its \`note\` decide which results serve it. A lane carrying a concrete ref takes that ref as a source directly — no search needed for it.
2. SIZE — call mcp__harvester__fetch with size_only:true on EVERY candidate across all lanes in ONE parallel batch. With size_only it fetches + caches the full text and returns {size in tokens, path to the cache file, chars} and NO body. Drop any candidate that failed or came back walled/thin and pick another from the same lane.
For each lane, return its chosen sources as {source (the exact url or DOI), path (the cache path from size_only), size (tokens), chars}. Group them under the lane's id. A lane may return several sources; return an empty list for a lane only when every candidate failed.{{translateClause}}{{researcherClause}}{{vocabClause}}
Return \`lanes\`: one entry per input lane id, each {id, sources:[{source, path, size, chars}]}. Use the sizes you measured — never invent them.
`;

const laneLine = (l: SchedulerLaneInput): string =>
  '#' +
  l.id +
  ' ' +
  l.keyword +
  ' — ' +
  l.why +
  '\n  directive: ' +
  (l.note && l.note.trim() ? l.note : '(none — use the rabbit-hole + goal)') +
  '\n  venues: ' +
  ((l.venues || [])
    .map(
      (v) =>
        v.source + (v.lang ? ' [' + v.lang + ']' : '') + (v.goodFor ? ' (' + v.goodFor + ')' : ''),
    )
    .join('; ') || '(none — general search)') +
  (l.ref ? '\n  ref (fetch directly): ' + l.ref : '');

export const buildResearchScheduler = ({
  query,
  lanes,
  researcherNote,
  vocabulary,
}: ResearchSchedulerArgs) => {
  const anyLang = lanes.some((l) => (l.venues || []).some((v) => v.lang));
  const translateClause = anyLang
    ? `
For a lane routed to a non-English venue (tagged [zh], [ja], …), translate its query terms into that language, search the native venue, and choose the native-language sources — the readers translate the content back to English.`
    : '';
  const researcherClause = researcherNote ? '\n' + researcherNote : '';
  // vocabClause — the field's own terms of art (v3 STEERING), so venue queries speak the community's
  // language rather than the operator's; omitted entirely when the vocabulary is still empty.
  const vocabClause = vocabulary
    ? `
COMMUNITY VOCABULARY — the field's own terms of art (usage counts); phrase venue queries in THESE terms, not the operator's wording, where they fit: ${vocabulary}`
    : '';
  return render(SCHEDULER_TPL, {
    query,
    lanes: lanes.map(laneLine).join('\n') || '(no lanes)',
    translateClause,
    researcherClause,
    vocabClause,
  });
};
