{{! scout — one broad sweep that maps the web landscape and seeds the first rabbit-holes }}
Scout the web landscape for: "{{query}}". {{net}}
Step 1 — run ONE broad WebSearch to map the landscape and collect candidate sources (URLs).
Step 2 — pick the up-to-5 most relevant sources and WebFetch each. In every WebFetch prompt, first ask "What are the key facts on this page about: {{query}}?", then append this exact instruction: <<{{footer}}>>
Step 3 — return: landscape (one paragraph); pages[] (each: url, 2-3 sentence summary, rabbitHoles[] copied from the page's "Rabbit holes" section as {keyword, why}); deadEnds[] for any source that timed out, was parked, or was off-topic — do not invent rabbit-holes for those. If every source is dead/unreachable, still return a valid result (landscape from your search, pages [], the dead sources in deadEnds) — never fail to return.
