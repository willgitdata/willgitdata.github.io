// The landing page's headline numbers — seven of them, and nothing else.
//
// The results section used to live on this page in full: three workloads, every
// split, the confidence intervals, the method, the caveats. That is the right
// material for someone deciding whether to believe us and the wrong material for
// someone deciding whether to keep reading. It moved to /performance.html intact
// — nothing measured was dropped, and every tile here links there.
//
// Same rule as everywhere else in this repo: no number below is typed by hand.
// Each one is computed from a run's own output file, and a tile whose file is
// missing renders as "not measured" rather than disappearing quietly — an absent
// measurement is a fact about us, not a gap to paper over.
//
// The file is in two halves, and the split is what makes the second claim
// testable rather than merely asserted:
//
//   window.ApoideaMetrics  — every computation, pure. Takes a parsed results
//                             file, returns a description of a tile. No DOM, no
//                             fetch, loadable in node.
//   the renderer below      — turns those descriptions into the same markup the
//                             page has always carried, and nothing else.
//
// fallback.test.mjs drives the first half with results files that have had keys
// removed and asserts each tile degrades to "not measured" instead of rendering
// NaN, undefined, or — worst — the previous tile's number.
//
// Two changes of behaviour, both deliberate and both made *after* the refactor
// was diffed against the old renderer and found byte-identical on thirteen
// inputs including the real results files:
//
//   1. A tile whose inputs are not finite numbers now renders "not measured".
//      It used to render them anyway: dropping `deltas.tokens_pct` produced the
//      headline tile "−NaN%", which is not a degradation, it is a wrong number
//      in the largest type on the page.
//   2. When a whole results file is missing, the tiles now carry their real
//      labels. They used to be labelled with the slot name — a card reading
//      "not measured / tokens" — because the fallback path passed the slot id
//      where a label was wanted.
(function (root) {
  const pct = (x) => (x * 100).toFixed(0) + '%';
  const signed = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(0) + '%';
  const num = (n) => Number(n).toLocaleString();

  // A tile is one of exactly two shapes. Nothing else is a legal return value,
  // which is what stops "we could not compute this" from being expressed as an
  // empty string that renders as a blank card.
  const measured = (value, label, detail, source) => ({ measured: true, value, label, detail, source });
  const unmeasured = (label, how) => ({ measured: false, label, how });

  // One place naming each tile, so the "not measured" card and the measured one
  // cannot drift apart, and so the renderer's catch-all has something better to
  // say than the slot id.
  const SLOT = {
    tokens: { label: 'Tokens per task', how: 'pnpm evals:live' },
    cost: { label: 'Cost per correct answer', how: 'pnpm evals:live' },
    accuracy: { label: 'Accuracy on tasks needing firm knowledge', how: 'pnpm evals:live' },
    recall: { label: 'Recall precision@5', how: 'pnpm evals:live' },
    external: { label: 'On a workload we did not write', how: 'pnpm evals:live --workload cuad' },
  };
  const absent = (slot) => unmeasured(SLOT[slot].label, SLOT[slot].how);

  // The guard. `undefined` arithmetic in JavaScript does not throw, it produces
  // NaN, and NaN formatted through toFixed is the string "NaN" — so a renamed
  // key does not break the page, it publishes a number that is not a number.
  // Strings get the same treatment because the provenance line ("live · model ·
  // N paired tasks") is part of the claim, not decoration.
  const finite = (x) => typeof x === 'number' && Number.isFinite(x);
  const filled = (x) => typeof x === 'string' && x.length > 0;
  const usable = (numbers, strings = []) => numbers.every(finite) && strings.every(filled);

  /** Tokens per task, both arms, from the live run. */
  function tokens(d) {
    const a = d.baseline, b = d.apoideia, c = d.config;
    const delta = (d.deltas || {}).tokens_pct;
    if (!usable([delta, a.tokens_per_task, b.tokens_per_task, (c || {}).completed_task_pairs], [(c || {}).model])) {
      return absent('tokens');
    }
    return measured(
      signed(delta),
      SLOT.tokens.label,
      `${num(Math.round(a.tokens_per_task))} → <b>${num(Math.round(b.tokens_per_task))}</b> — the same work, on a shorter prompt.`,
      `live · ${c.model} · ${c.completed_task_pairs} paired tasks`,
    );
  }

  // The causal claim, and the one that needs the most care. Both arms run the
  // same tasks, so the data are paired and McNemar is the right test — two
  // independent intervals would discard the pairing and with it the finding.
  function accuracy(d) {
    const kd = (d.by_dependence || {}).knowledge_dependent;
    const model = (d.config || {}).model;
    if (!kd || !kd.baseline || !kd.apoideia) return absent('accuracy');
    if (!usable([kd.baseline.accuracy, kd.apoideia.accuracy, kd.baseline.tasks], [model])) {
      return absent('accuracy');
    }
    // Same function the performance page uses, so the p-value on the landing
    // page can never disagree with the one in the breakdown.
    const sig = root.ApoideaPaired.paired(d, 'knowledge_dependent');
    return measured(
      `${pct(kd.baseline.accuracy)} → ${pct(kd.apoideia.accuracy)}`,
      SLOT.accuracy.label,
      `+${((kd.apoideia.accuracy - kd.baseline.accuracy) * 100).toFixed(0)} points across ${kd.baseline.tasks} tasks` +
        (sig && finite(sig.p_value) ? `, McNemar exact <b>p&nbsp;=&nbsp;${sig.p_value.toFixed(3)}</b>.` : '.'),
      `live · ${model} · paired test`,
    );
  }

  function recall(d) {
    const model = (d.config || {}).model;
    if (d.recall_precision_at_5 == null || !usable([d.recall_precision_at_5], [model])) {
      return absent('recall');
    }
    return measured(
      pct(d.recall_precision_at_5),
      SLOT.recall.label,
      'How often the memory that decides the task is in the five returned. A miss is counted as a failure against us.',
      `live · ${model}`,
    );
  }

  // Cost per *correct* answer, per arm, from that arm's own tokens at
  // undiscounted list price. The run's `cost` block is the shared bill across
  // both arms and cannot answer this. Undiscounted on purpose: caching is a
  // discount we happened to get, and a buyer substituting their own rates
  // wants the tokens priced plainly. A baseline pays full price for the
  // answers it gets wrong, which is the entire point of the metric.
  function cost(d) {
    const price = d.price_per_1m_usd || {};
    const model = (d.config || {}).model;
    // A missing price is not a zero price — priced at nothing, the cost tile
    // would read "$0.0000 → $0.0000" and the delta "+0%", which is a measured
    // claim about a thing nobody measured.
    if (!usable([price.input, price.output], [model])) return absent('cost');
    const perCorrect = (s) => (usable([s.correct, s.tokens_in, s.tokens_out]) && s.correct
      ? (s.tokens_in / 1e6 * price.input + s.tokens_out / 1e6 * price.output) / s.correct
      : null);
    const ca = perCorrect(d.baseline), cb = perCorrect(d.apoideia);
    if (!ca || !cb) return absent('cost');
    return measured(
      signed((cb - ca) / ca * 100),
      SLOT.cost.label,
      `$${ca.toFixed(4)} → <b>$${cb.toFixed(4)}</b> at list price. A baseline pays in full for answers it throws away.`,
      `live · ${model}`,
    );
  }

  /** The external workload — a different file, so a different function. */
  function external(x) {
    const model = (x.config || {}).model;
    if (!usable([x.baseline.accuracy, x.apoideia.accuracy, x.baseline.tasks], [model])) {
      return absent('external');
    }
    return measured(
      `${pct(x.baseline.accuracy)} → ${pct(x.apoideia.accuracy)}`,
      SLOT.external.label,
      `<b>CUAD</b> — real commercial contracts annotated by lawyers (The Atticus Project, CC BY 4.0), ${x.baseline.tasks} held-out tasks.`,
      `external · ${model}`,
    );
  }

  /** Does this file carry a run at all? Both callers ask the same question. */
  const hasRun = (d) => Boolean(d && d.baseline && d.baseline.tasks && d.apoideia);

  root.ApoideaMetrics = {
    pct, signed, num, measured, unmeasured, absent, finite, usable,
    SLOT, hasRun, tokens, accuracy, recall, cost, external,
  };
})(typeof window !== 'undefined' ? window : globalThis);

(() => {
  // The renderer needs a DOM; node loads this file for the pure half above.
  if (typeof document === 'undefined') return;

  const M = window.ApoideaMetrics;
  const grid = document.getElementById('headline-metrics');
  if (!grid) return;

  // Fixed slots, rendered in order, so the page does not reflow into a different
  // shape depending on which files happen to exist.
  // Five headline tiles, rendered in DOM order. Tokens and cost lead — the two
  // numbers a buyer can verify against their own bill in a week. The full set
  // (steps, the deterministic suite, every split) lives on /performance.html.
  const SLOTS = ['tokens', 'cost', 'accuracy', 'external', 'recall'];

  const render = (slot, tile) => {
    const node = grid.querySelector(`[data-slot="${slot}"]`);
    if (!node) return;
    if (tile.measured) {
      node.innerHTML =
        `<div class="m-n">${tile.value}</div>` +
        `<div class="m-l">${tile.label}</div>` +
        `<div class="m-d">${tile.detail}</div>` +
        `<div class="m-s">${tile.source}</div>`;
      node.classList.add('is-measured');
    } else {
      node.innerHTML =
        `<div class="m-n m-none">not measured</div>` +
        `<div class="m-l">${tile.label}</div>` +
        `<div class="m-d">Run <code>${tile.how}</code> and this fills in.</div>`;
    }
  };

  for (const slot of SLOTS) {
    const node = grid.querySelector(`[data-slot="${slot}"]`);
    if (node && !node.innerHTML.trim()) node.innerHTML = '<div class="m-n">—</div>';
  }

  // --- the live run against a real model: five of the seven ----------------
  fetch('/apoidea/evals/real-model-results.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!M.hasRun(d)) throw new Error('no live run');
      // Rendered one at a time, in this order, so a tile that can be computed
      // survives a later one throwing — and the catch below still has the last
      // word if the file is malformed enough to take the whole block down.
      render('tokens', M.tokens(d));
      render('accuracy', M.accuracy(d));
      render('recall', M.recall(d));
      render('cost', M.cost(d));
    })
    .catch(() => {
      for (const s of ['tokens', 'cost', 'accuracy', 'recall']) render(s, M.absent(s));
    });

  // --- a workload we did not write ----------------------------------------
  fetch('/apoidea/evals/real-model-results-cuad.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((x) => {
      if (!M.hasRun(x)) throw new Error('no cuad');
      render('external', M.external(x));
    })
    .catch(() => render('external', M.absent('external')));
})();
