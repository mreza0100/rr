export const meta = {
  name: 'Research and Report',
  description:
    'Research and Report — unbounded best-first web crawl steered by a BRAINER over a persistent id-keyed rabbit-hole store. haiku scout seeds rabbit-holes → opus PROSPECTOR names the high-value authoritative source venues → [the brainer looks up OR originates the rabbit-holes worth pursuing AND assigns each its relevant venue subset → parallel haiku lane-researchers pursue (preferring their assigned venues) → the brainer returns delta updates (rescore / add / lookupNext / rename / drop), maintains a running resultSoFar, decides done; in goal mode a sentinel may reopen a premature done and force one more wave] until done / rabbithole-dry / wave hard-cap (15) → FINALIZE: an opus INITIATOR names the load-bearing facts + report focus → a sonnet refine pass fact-checks + hardens those facts against the sources → an opus JUDGE judges the hardened answer (goal met, verification real, derivation valid) and steers a bounded remediation loop — the brain derives the answer (writing + running code, propagating error bars) when one is needed, refine re-checks a mis-hardened fact, or the crawl reopens on a real gap → an opus synthesiser writes the 7-section report. Pursued-archive (no delete-on-pursue) + pursued memory; scoreHistory rides natively on each rabbit-hole id. Two modes: goal (satisficing) / collect (exhaustive). Returns per-wave markdown + refinement + report + _rabbitHoles.json.',
  phases: [
    {
      title: 'Scout',
      detail:
        'the seed: haiku scout maps the landscape (fetch sources with the rabbit-hole footer) → opus prospector names the high-value authoritative source venues → the brainer scores the scout rabbit-holes, assigns each its venue subset, and looks up the first wave',
    },
    {
      title: 'Research',
      detail:
        'each wave: the brainer looks up OR originates the rabbit-holes worth pursuing + assigns each its venue subset → parallel haiku lane-researchers pursue (preferring assigned venues) → the brainer returns delta updates (rescore / add / lookupNext), maintains the running resultSoFar (knows pursued + score trajectory), decides done; goal-mode sentinel can force one more wave on a real gap',
    },
    {
      title: 'Finalize',
      detail:
        'an opus INITIATOR names the load-bearing facts + report focus → refinement (a sonnet refine agent fact-checks + hardens each fact against the sources) → an opus JUDGE judges the hardened answer and drives a bounded remediation loop — the brain DERIVES the answer (writing + running code, propagating error bars) when one is needed, refine re-checks a mis-hardened fact, or the crawl reopens on a real gap → an opus synthesiser writes the report',
    },
    {
      title: 'Debug',
      detail:
        'opt-in (arg.debug): a final Debug & Analysis agent consolidates metrics + run log + raw agent I/O into one _debug.md — incl. prospector→researcher venue-utilization and any arg.debugPrompt question',
    },
  ],
};
