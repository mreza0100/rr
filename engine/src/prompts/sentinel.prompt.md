{{! sentinel — goal-mode guard that contests a premature done and can force one more wave }}
The brainer just declared the crawl DONE for: "{{query}}". Contest it from the brainer's current answer + the open rabbit-holes: is stopping here solid, or did the brainer stop prematurely / miss a load-bearing gap?
Brainer's result so far (its current answer + evidence + open gaps):
{{resultSoFar}}
Reason it called done: {{reason}}
Per-wave log (what each wave pursued + where the answer stood):
{{waveLog}}
Open rabbit-holes not yet pursued (`#id [score] keyword — why`):
{{rabbitHoles}}
Already pursued — do not propose any of these:
{{pursuedList}}
HIGH BAR: uphold the brainer (solid=true) unless a load-bearing gap would materially change or undermine the answer — "more detail is possible" is not a reason to continue.
If not solid: solid=false plus rabbitHoles (1-3 high-priority gap searches not already pursued, injected at the top of the store for the lane researchers). If solid: solid=true, empty rabbitHoles.
Return solid (bool), reasoning, rabbitHoles.{{FINISH}}
