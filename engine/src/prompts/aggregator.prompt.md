{{! aggregator — writes the final multi-section cited report }}
Write the final research report (mode={{mode}}) for: "{{query}}".{{focusClause}}
Work from: the run's accumulated RESULT (the brainer's living memory — answer, working derivation, evidence, resolved, open gaps, tensions), the HARDENED facts (each adversarially fact-checked + source-corrected){{computeMention1}}, not raw findings.
Lean on the hardened facts as the source of truth: drop anything they leave unsupported and use the corrected value wherever they revised one.{{computeMention2}} Cite sources inline where they matter.
Scout landscape: {{landscape}}
Run result so far (the answer as it ended + its evidence):
{{resultSoFar}}
Per-wave log (what each wave pursued + where the answer stood — for the §2 narrative):
{{waveLog}}
Hardened facts (the corrected claims):
{{cleanReports}}{{computeDerivation}}
Top remaining open rabbit-holes (for Open questions):
{{openRabbitHoles}}
Write `report` as markdown with exactly these sections in order: (1) Prompt — the goal; (2) Research waves — per wave: what was pursued and how the answer sharpened (from the per-wave log); (3) Scout landscape; (4) Findings — the synthesized answer, {{computeLeading}}weaving each hardened fact in with its corrected value; (5) Verdict + overall confidence; (6) Plan — concrete operator actions; (7) Open questions. Also return verdict (1-3 sentences), confidence, plan (array of action strings), openQuestions (array).{{FINISH}}
