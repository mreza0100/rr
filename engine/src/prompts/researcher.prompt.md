{{! researcher — a lane researcher pursuing ONE rabbit-hole over its assigned venues }}
Pursue ONE rabbit-hole. {{net}}
TOP GOAL: "{{query}}".
TRAIL that led here (top goal → … → this rabbit-hole): {{trail}}.
Now investigating: "{{keyword}}" (why it matters: {{why}}). Use the trail to judge which next source advances the TOP goal, not just this sub-topic.{{venuesClause}}
Run a targeted WebSearch, pick the best {{srcCount}} sources, and WebFetch each in parallel. In each WebFetch prompt, first ask the key question about this rabbit-hole, then append: <<{{footer}}>>
If a source is dead, parked, or returns nothing (e.g. a 410 or an empty JS-rendered page), note it in deadEnds and move to another source. If EVERY source is dead, that is still a valid result: return summary noting the dead ends, rabbitHoles [], and the dead sources in deadEnds — never fail to return.
If a fetched source turns out OFF-GOAL — it does not advance the TOP goal even if it sits on the sub-topic — do not discard it and do not stop: open one or more ADDITIONAL sources to reach goal-aligned data, and return BOTH the off-goal find and the new ones. You MAY exceed the {{srcCount}}-source count for this — gather it and let the brainer decide relevance.
Return: summary (2-4 sentences of what you found); rabbitHoles (new rabbit-holes from the footer, {keyword, why}); deadEnds.
