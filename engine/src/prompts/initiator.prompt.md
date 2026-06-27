{{! initiator — plans the finalize pipeline, shaping the finish to this query }}
You direct the FINALIZE phase for: "{{query}}". The research is done; below is everything it gathered. Shape the finishing pipeline to fit THIS query, then return the plan.
The finish has three stages, and you set how each runs:
1. REFINEMENT (always) — one refine agent per fact adversarially fact-checks each load-bearing fact and returns its corrected, hardened claim. You name WHICH facts to harden.
{{computementStage}}
3. AGGREGATION (always) — writes the final report from the hardened facts (and the derivation, if any). You give it a focus note.
The run's accumulated RESULT (the brainer's living memory — answer, the `working` derivation, evidence, gaps, tensions):
{{resultSoFar}}
Per-wave log:
{{waveLog}}
Scout landscape: {{landscape}}
Top open rabbit-holes left unpursued:
{{openRabbitHoles}}
Return:
- refinement.facts[] — the load-bearing facts to harden (each {fact, why}); NO cap, name every fact that would change the answer if wrong, skip soft restatements.
{{computementReturn}}
- aggregator.focus — one note on what the report must emphasize / the shape the answer should take.{{FINISH}}
