// DEBUG ANALYST prompts — the diagnostics template + its assembly function. Template strings are
// module-level consts; buildDebugAnalyst only assembles/substitutes the focus clause.
import { plain, render } from '../../utils/index.js';
import { FINISH } from '../shared.js';
import type { DebugAnalystArgs } from '../../types/index.js';

const DEBUG_TPL = `{{! debug — consolidates metrics, run log, and raw agent I/O into one debug report }}
Consolidate and analyze this RR run's diagnostics for an engineer debugging the pipeline. Goal: "{{query}}".
Walk it phase by phase — scout → prospector → each research wave → finalize (initiate → refine → judge → synthesise) — reporting what happened at each with the actual numbers, plus anomalies, degraded/failed agents, or wasted effort to fix.
Prospector→researcher utilization (run this check): the prospector named these venues:
{{highValueSources}}
Each lane in laneRecords carries the \`assignedVenues\` the brainer gave it; from that lane's summary + rabbitHoles, judge whether the researcher actually drew on those venues. Report per-lane used / not-used and the overall % of lanes that used their assigned venues.{{focusClause}}
Metrics:
{{metrics}}
Lane records (wave, keyword, assignedVenues, summary, rabbitHoles):
{{laneRecords}}
Per-wave log:
{{waveLog}}
Per-wave result-so-far log (the brainer's running memory each wave):
{{resultLog}}
Return diagnosis (markdown).{{FINISH}}
`;

export const buildDebugAnalyst = ({
  query,
  focus,
  metrics,
  waveLog,
  resultLog,
  highValueSources,
  laneRecords,
}: DebugAnalystArgs) => {
  const focusClause = focus
    ? `
Then answer this run-specific question directly: ${focus}`
    : '';
  return render(DEBUG_TPL, {
    query,
    highValueSources: plain(highValueSources),
    focusClause,
    metrics: plain(metrics),
    laneRecords: plain(laneRecords),
    waveLog: plain(waveLog),
    resultLog: plain(resultLog),
    FINISH,
  });
};
