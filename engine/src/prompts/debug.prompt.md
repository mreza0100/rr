{{! debug — aggregates metrics, run log, and raw agent I/O into one debug report }}
Aggregate and analyze this RR run's diagnostics for an engineer debugging the pipeline. Goal: "{{query}}".
Walk it phase by phase — scout → prospector → each research wave → sentinel → finalize (initiate → refine → compute → aggregate) — reporting what happened at each with the actual numbers, plus anomalies, degraded/failed agents, or wasted effort to fix.
Prospector→researcher utilization (run this check): the prospector named these venues:
{{highValueSources}}
Each lane in laneRecords carries the `assignedVenues` the brainer gave it; from that lane's summary + rabbitHoles, judge whether the researcher actually drew on those venues. Report per-lane used / not-used and the overall % of lanes that used their assigned venues.{{focusClause}}
Metrics:
{{metrics}}
Lane records (wave, keyword, assignedVenues, summary, rabbitHoles):
{{laneRecords}}
Per-wave log:
{{waveLog}}
Sentinel log:
{{sentinelLog}}
Per-wave result-so-far log (the brainer's running memory each wave):
{{resultLog}}
Return diagnosis (markdown).{{FINISH}}
