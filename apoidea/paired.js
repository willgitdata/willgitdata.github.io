// McNemar's exact test, in one place.
//
// Two pages need this now — the landing page's headline tile and the full
// performance breakdown — and a statistic computed twice is a statistic that
// eventually disagrees with itself. The published p-value has to be the same
// number wherever it appears, so there is exactly one implementation.
//
// Why this test at all: both arms run the same tasks, so the observations are
// paired. Comparing two independent confidence intervals throws that pairing
// away, and with it the finding — on the knowledge-dependent split the intervals
// overlap while McNemar on identical data gives p = 0.041.
window.ApoideaPaired = (function () {
  /**
   * @param {object} d  a real-model results file
   * @param {'overall'|'knowledge_dependent'|'no_knowledge_needed'} kind
   * @returns {{memory_wins:number, memory_loses:number, discordant_pairs:number,
   *            p_value:number, significant_at_05:boolean}|null}
   */
  function paired(d, kind) {
    // Prefer a value the run recorded itself; derive only when it did not.
    const recorded = d.paired_significance && d.paired_significance[kind];
    if (recorded) return recorded;

    const misses = d.misses || [];
    const inSplit = (m) => kind === 'overall'
      || (kind === 'knowledge_dependent' ? m.knowledge_dependent : !m.knowledge_dependent);
    const wrong = (arm) => new Set(misses
      .filter((m) => m.arm === arm && inSplit(m)).map((m) => m.task_id));

    const a = wrong('baseline'), b = wrong('Apoidea');
    const wins = [...a].filter((t) => !b.has(t)).length;
    const loses = [...b].filter((t) => !a.has(t)).length;
    const n = wins + loses;
    if (!n) return null;

    // Exact two-sided binomial: sum the tail at or below the smaller count.
    const choose = (m, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (m - i) / (i + 1); return r; };
    let tail = 0;
    for (let k = 0; k <= Math.min(wins, loses); k++) tail += choose(n, k);
    const p = Math.min(1, (tail / 2 ** n) * 2);

    return {
      memory_wins: wins,
      memory_loses: loses,
      discordant_pairs: n,
      p_value: p,
      significant_at_05: p < 0.05,
    };
  }

  return { paired };
})();
