export const meta = {
  name: 'Research and Report',
  description:
    'Research and Report — unbounded best-first web crawl steered by a BRAINER over a persistent id-keyed rabbit-hole store. haiku scout seeds rabbit-holes → opus PROSPECTOR names the high-value authoritative source venues → [the brainer looks up OR originates the rabbit-holes worth pursuing, assigning each its venue subset + a steering `note` (what to find + ranked fallbacks) → a sonnet SCHEDULER discovers + sizes the highest-value sources per lane (batched search, then mcp__harvester size_only → {size, path}) → code bin-packs each lane into 130k-token reader-units and runs ONE sequential haiku reader thread per lane (each reads its assigned cache slice off disk, carrying a running answer across all the lane sources) → the brainer returns delta updates (rescore / add / lookupNext / rename / drop), maintains a running resultSoFar, decides done] until done / rabbithole-dry / wave hard-cap (15) → FINALIZE: an opus INITIATOR names the load-bearing facts + report focus → a sonnet refine pass fact-checks + hardens those facts against the sources → an opus JUDGE — the sole terminal skeptic, also handed the leftover open rabbit-holes — judges the hardened answer (goal met, verification real, derivation valid) and steers a bounded remediation loop — the brain derives the answer (writing + running code, propagating error bars) when one is needed, refine re-checks a mis-hardened fact, or the crawl reopens on a real gap → an opus synthesiser writes the 8-section report. Pursued-archive (no delete-on-pursue) + pursued memory; scoreHistory rides natively on each rabbit-hole id. Two modes: goal (satisficing) / collect (exhaustive). Returns per-wave markdown + refinement + report + _rabbitHoles.json.',
  // ONLY the always-first phase is declared; everything after Scout is driven dynamically by phase() calls in run
  // order — each crawl wave its own phase (Research wN), then Finalize ONLY when a brainer declares done, then Debug
  // only at the very end. Declaring Finalize/Debug statically would pin them ahead of the dynamic wave phases.
  phases: [
    {
      title: 'Scout',
      detail:
        'the seed: haiku scout maps the landscape (fetch sources with the rabbit-hole footer) → opus prospector names the high-value authoritative source venues → the brainer (wave 0) scores the scout rabbit-holes, assigns each its venue subset, and looks up the first wave',
    },
  ],
};
