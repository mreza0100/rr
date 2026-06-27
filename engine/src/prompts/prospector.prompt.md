{{! prospector — names the high-value authoritative source venues for the topic }}
Goal: "{{query}}". Scout landscape: {{landscape}}
Sources the scout already opened:
{{sources}}
Name the 6-8 highest-value, authoritative source venues for THIS goal — where primary, expert, or rigorous information on the topic actually lives. The right set is domain-specific (GPU serving → arXiv/USENIX/MLSys/SemiAnalysis/r/LocalLLaMA; a stock → SEC EDGAR/earnings calls/Bloomberg; weather → NOAA/ECMWF).
Span what is relevant here: primary research (papers/preprints + where they live for this field), official docs, standards bodies/regulators, authoritative datasets/benchmarks, deep practitioner/industry analysis, high-signal community venues. Exclude generic SEO blogs.
For each: source (venue + how to reach/search it, e.g. "arXiv (site:arxiv.org)") and goodFor (the sub-questions it is best for — specific enough for the downstream brainer to match each research lane to the right venue).
Run WebSearch (one or more queries) to discover and verify the actual highest-value venues for THIS topic — confirm each exists and is authoritative (memory alone misses recent venues). Return highValueSources (6-8) and a brief reasoning naming what you searched.{{WEB_ONLY}}
