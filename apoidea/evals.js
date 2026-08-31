// Renders the results section from examples/evals/eval-results.json — the
// actual output of `pnpm evals`, served live by the site server. Nothing here
// is hand-typed: if the file is missing the section says so rather than showing
// numbers from memory.
(function () {
  const el = (id) => document.getElementById(id);
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const num = (x) => Math.round(x).toLocaleString();
  const signed = (x, unit = '%') => `${x >= 0 ? '+' : ''}${x.toFixed(x > -10 && x < 10 ? 1 : 0)}${unit}`;
  const usd = (x) => '$' + (x < 0.001 ? x.toFixed(6) : x.toFixed(4));

  // Lower is better for cost-shaped metrics, higher is better for accuracy.
  const tone = (delta, lowerIsBetter = true) =>
    (lowerIsBetter ? delta < -0.5 : delta > 0.5) ? 'good' : (lowerIsBetter ? delta > 0.5 : delta < -0.5) ? 'bad' : 'flat';

  function bar(label, valueLabel, fillPct, t) {
    const on = Math.max(1, Math.round(Math.min(1, fillPct) * 20));
    const cells = Array.from({ length: 20 }, (_, i) =>
      `<div class="bm-cell ${i < on ? 'on ' + t : ''}"></div>`).join('');
    return `
      <div class="bm-row">
        <div class="bm-label">${label}</div>
        <div class="bm-track">${cells}</div>
        <div class="bm-value ${t}">${valueLabel}</div>
      </div>`;
  }

  // One panel = one metric, both arms, scaled against the larger of the two.
  // The baseline bar is deliberately neutral and the Apoidea bar carries the
  // colour: green where we win, red where we lose. A panel that comes out red
  // is the page working, not the page broken.
  function panel(o) {
    const max = Math.max(o.aVal, o.bVal) || 1;
    const t = tone(o.delta, o.lowerIsBetter !== false);
    return `
      <div class="bm-panel hv-card">
        <h3>${o.title} <span class="bm-delta ${t}">${signed(o.delta, o.unit ?? '%')}</span></h3>
        <p class="bm-sub">${o.sub}</p>
        ${bar('Without Apoidea', o.aLabel, o.aVal / max, 'flat')}
        ${bar('With Apoidea', o.bLabel, o.bVal / max, t)}
        <p class="bm-note">${o.note}</p>
      </div>`;
  }

  const FAMILY_LABELS = {
    insurance_triage: ['Claims triage', 'insurance · single-shot'],
    insurance_investigation: ['Claim investigation', 'insurance · tool loop'],
    finance_kyc: ['KYC / enhanced due diligence', 'finance · tool loop'],
    healthcare_prior_auth: ['Prior authorization', 'healthcare · dialogue'],
    legal_contract: ['Contract clause review', 'legal · long context'],
    fleet_incident: ['Fleet incident resolution', 'agent ops · tool loop'],
    control_unaided: ['Control: no knowledge to recall', 'mixed · memory cannot help'],
  };

  const SHAPE_LABELS = {
    single_shot: ['Single shot', 'One call, one answer. No loop to shorten.'],
    tool_loop: ['Tool loop', 'Plan → search → read → tools → decide.'],
    long_context: ['Long context', 'The corpus arrives in the prompt.'],
    multi_turn: ['Dialogue', 'A bounded set of turns.'],
  };

  function deltaCell(v, lowerIsBetter = true, unit = '%') {
    if (v === null || v === undefined) return '<td class="ev-num flat">—</td>';
    return `<td class="ev-num ${tone(v, lowerIsBetter)}">${signed(v, unit)}</td>`;
  }

  function table(groups, labels, caption) {
    const rows = Object.entries(groups).map(([key, v]) => {
      const [name, meta] = labels[key] ?? [key, ''];
      const isControl = key === 'control_unaided';
      return `
        <tr class="${isControl ? 'ev-control' : ''}">
          <td>
            <div class="ev-name">${name}</div>
            <div class="ev-meta">${meta} · ${v.baseline.tasks} runs</div>
          </td>
          <td class="ev-num">${pct(v.baseline.accuracy)}</td>
          <td class="ev-num">${pct(v.Apoidea.accuracy)}</td>
          ${deltaCell(v.deltas.accuracy_points, false, ' pts')}
          <td class="ev-num">${num(v.baseline.tokens_per_task)}</td>
          <td class="ev-num">${num(v.Apoidea.tokens_per_task)}</td>
          ${deltaCell(v.deltas.tokens_pct)}
          ${deltaCell(v.deltas.cost_per_correct_pct)}
          <td class="ev-num">${v.recall_precision === null || v.recall_precision === undefined
            ? '<span class="ev-na">n/a</span>' : pct(v.recall_precision)}</td>
        </tr>`;
    }).join('');
    return `
      <div class="ev-table-wrap">
        <table class="ev-table">
          <caption>${caption}</caption>
          <thead>
            <tr>
              <th></th>
              <th colspan="3">Accuracy</th>
              <th colspan="3">Tokens per task</th>
              <th>Cost per<br />correct</th>
              <th>Recall<br />precision</th>
            </tr>
            <tr class="ev-sub">
              <th></th><th>base</th><th>apo</th><th>Δ</th>
              <th>base</th><th>apo</th><th>Δ</th><th>Δ</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function render(d) {
    const a = d.overall.baseline, b = d.overall.Apoidea, dl = d.overall.deltas;
    const c = d.config, w = d.workload;
    const dep = d.by_dependence || {};
    const kd = dep.knowledge_dependent, nk = dep.no_knowledge_needed;
    const st = d.stability || {};

    el('bm-body').innerHTML = `
      <div class="ev-scope">
        <div class="ev-scope-item"><b>${num(c.task_runs_total)}</b><span>task runs measured</span></div>
        <div class="ev-scope-item"><b>${w.families.length}</b><span>task families</span></div>
        <div class="ev-scope-item"><b>${w.shapes.length}</b><span>shapes of agent work</span></div>
        <!-- The control family's vertical is "mixed" by construction, so it is not
             counted here — it is a control, not a sixth market. -->
        <div class="ev-scope-item"><b>${w.verticals.filter((v) => v !== 'mixed').length}</b><span>regulated verticals</span></div>
        <div class="ev-scope-item"><b>${c.seeds.length}</b><span>independent seeds</span></div>
        <div class="ev-scope-item"><b>${num(c.governing_memories + c.distractor_memories)}</b><span>memories in the store</span></div>
      </div>

      <div class="bm-grid">
        ${panel({
          title: 'Accuracy', unit: ' pts', lowerIsBetter: false,
          sub: `Correct determinations across all ${num(a.tasks)} runs.`,
          aLabel: `${pct(a.accuracy)} <span class="bm-n">(${num(a.correct)}/${num(a.tasks)})</span>`, aVal: a.accuracy,
          bLabel: `${pct(b.accuracy)} <span class="bm-n">(${num(b.correct)}/${num(b.tasks)})</span>`, bVal: b.accuracy,
          delta: dl.accuracy_points,
          note: `${w.knowledge_dependent} of ${w.knowledge_dependent + w.not_knowledge_dependent} tasks per seed turn
            on a firm-specific fact that exists nowhere in a model's weights. The rest are decidable unaided
            and are counted here too.`,
        })}

        ${panel({
          title: 'Tokens per task', sub: 'Everything the pipeline sent and received.',
          aLabel: num(a.tokens_per_task), aVal: a.tokens_per_task,
          bLabel: num(b.tokens_per_task), bVal: b.tokens_per_task,
          delta: dl.tokens_pct,
          note: `Injected context adds a fixed cost to every call. Skipping a step removes that call
            <em>and</em> everything it would have added to every prompt after it. Which effect wins depends
            on the shape of the work — both are in this average.`,
        })}

        ${panel({
          title: 'Steps per task', sub: 'LLM calls before a determination.',
          aLabel: a.steps_per_task.toFixed(2), aVal: a.steps_per_task,
          bLabel: b.steps_per_task.toFixed(2), bVal: b.steps_per_task,
          delta: dl.steps_pct,
          note: `An agent that does not know which document governs reads until it finds one, then reworks
            what it got wrong. An agent that remembers opens the right one and skips the rework.`,
        })}

        ${panel({
          title: 'Cost per <em>correct</em> answer', sub: 'What one right answer actually costs.',
          aLabel: usd(a.cost_per_correct_usd), aVal: a.cost_per_correct_usd,
          bLabel: usd(b.cost_per_correct_usd), bVal: b.cost_per_correct_usd,
          delta: dl.cost_per_correct_pct,
          note: `The metric that survives both effects: a baseline pays full price for the answers it gets
            wrong. ${d.price_assumption}`,
        })}
      </div>

      ${kd && nk ? `
      <div class="ev-split">
        <div class="ev-split-card hv-card">
          <div class="ev-split-tag good">WHERE IT HELPS</div>
          <h4>Tasks that turn on institutional knowledge</h4>
          <p class="ev-split-stat">
            <span>${pct(kd.baseline.accuracy)}</span> → <b>${pct(kd.Apoidea.accuracy)}</b>
            <em>accuracy, ${num(kd.baseline.tasks)} runs</em>
          </p>
          <p class="bm-note">
            Tokens ${signed(kd.deltas.tokens_pct)}, cost per correct answer ${signed(kd.deltas.cost_per_correct_pct)}.
            These are the tasks where an agent without memory is structurally stuck — no amount of tokens
            recovers a fact that only exists inside one company.
          </p>
        </div>
        <div class="ev-split-card hv-card">
          <div class="ev-split-tag bad">WHERE IT COSTS</div>
          <h4>Tasks no memory layer can help with</h4>
          <p class="ev-split-stat">
            <span>${pct(nk.baseline.accuracy)}</span> → <b>${pct(nk.Apoidea.accuracy)}</b>
            <em>accuracy, ${num(nk.baseline.tasks)} runs</em>
          </p>
          <p class="bm-note">
            Tokens ${signed(nk.deltas.tokens_pct)}. Both arms answer these correctly, so the injected block is
            pure overhead. ${Math.round(nk.baseline.tasks / a.tasks * 100)}% of the suite is this, and it is inside
            the headline numbers above rather than excluded from them.
          </p>
        </div>
      </div>` : ''}

      ${table(d.by_family, FAMILY_LABELS, 'Every family in the suite — including the one where we lose')}
      ${table(d.by_shape, SHAPE_LABELS, 'The same runs, cut by the shape of the work instead')}

      <div class="ev-footnotes">
        <div class="ev-foot hv-card">
          <div class="ev-foot-n">${d.recall_precision_at_5 !== null ? pct(d.recall_precision_at_5) : '—'}</div>
          <div class="ev-foot-l">Recall precision@${c.recall_top_k}</div>
          <p>How often the opening recall surfaced the governing memory out of a store of
            ${num(c.governing_memories + c.distractor_memories)}. When it misses, the task fails and the failure is
            counted against us — retrieval quality is inside the measurement, not assumed away.</p>
        </div>
        <div class="ev-foot hv-card">
          <div class="ev-foot-n">±${(st.tokens_pct?.stdev ?? 0).toFixed(1)}%</div>
          <div class="ev-foot-l">Seed-to-seed spread</div>
          <p>Across ${c.seeds.length} independent seeds the token delta ranged
            ${signed(st.tokens_pct?.min ?? 0)} to ${signed(st.tokens_pct?.max ?? 0)} and accuracy
            ${signed(st.accuracy_points?.min ?? 0, ' pts')} to ${signed(st.accuracy_points?.max ?? 0, ' pts')}.
            Seeds shuffle where governing documents sit, how long they are, and how many turns a dialogue takes.</p>
        </div>
      </div>

      <details class="bm-method">
        <summary>How this was measured — and what it is not</summary>
        <p>${d.what_this_is}</p>
        <ul>${d.caveats.map((x) => `<li>${x}</li>`).join('')}</ul>
        <p class="bm-note">Reproduce with <code>pnpm evals</code> — re-running it reproduces every measured
          value on this page exactly; only the wall-clock timings move.
          Last run ${new Date(d.generated_at).toLocaleString()}.</p>
      </details>`;
  }

  // ------------------------------------------------------------------
  // The live-model arm, from examples/evals/real-model-results.json.
  //
  // A separate file and a separate disclosure because it is a separate
  // measurement: a stratified sample against a real model, with sampling noise
  // and a real bill, where the block above is 1,020 deterministic runs. Neither
  // supersedes the other. If the file is not there this says so — an absent
  // measurement is reported as absent, never filled in from the other column.
  // ------------------------------------------------------------------

  const ci = (a) => `${pct(a[0])}–${pct(a[1])}`;

  // 95% Wilson interval — the same function run_real_evals.py uses, so a
  // recomputed figure carries an interval of the same kind as the reported ones
  // rather than a bare point estimate.
  function wilson(correct, n, z = 1.96) {
    if (!n) return [0, 0];
    const p = correct / n, d = 1 + (z * z) / n;
    const centre = (p + (z * z) / (2 * n)) / d;
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
    return [Math.max(0, centre - half), Math.min(1, centre + half)];
  }

  // McNemar's exact test on the discordant pairs.
  //
  // Both arms run the same tasks, so the observations are paired, and the
  // question worth asking is not "could these two proportions share a
  // population?" but "where the arms disagreed, did memory win more than it
  // lost?" Tasks both arms got right — or both got wrong — say nothing about
  // the difference. On this run the unpaired reading and the paired one
  // disagree: the Wilson intervals overlap on the knowledge-dependent split
  // while the paired test lands at p≈0.04, on identical data.
  //
  // Prefers the value the run recorded; falls back to deriving it from the
  // published `misses`, so a results file written before the runner computed
  // it still renders the right number rather than nothing.
  // McNemar lives in paired.js — the landing page renders the same p-value, and a
  // statistic computed in two places eventually disagrees with itself.
  const paired = (d, kind) => window.ApoideaPaired.paired(d, kind);


  // What accuracy looks like with the tasks nobody answered removed.
  //
  // A reply carrying no determination is a failed call, not a wrong answer, but
  // it grades as wrong — so when they land unevenly across the arms they move
  // the delta for a reason that has nothing to do with memory. Both arms drop
  // the same task ids, so this stays a like-for-like comparison. Derived from
  // the run's own `misses` records; nothing here is entered by hand.
  function excludingUnparseable(d) {
    const dead = new Set((d.misses || [])
      .filter((m) => m.determination === null || m.determination === undefined)
      .map((m) => m.task_id));
    if (!dead.size) return null;
    const n = d.baseline.tasks - dead.size;
    if (n <= 0) return null;
    const arm = (key, summary) => {
      const missedHere = (d.misses || [])
        .filter((m) => m.arm === key && dead.has(m.task_id)).length;
      const correct = summary.correct - (dead.size - missedHere);
      return { correct, n, accuracy: correct / n, ci95: wilson(correct, n) };
    };
    return { dropped: dead.size, baseline: arm('baseline', d.baseline),
             Apoidea: arm('Apoidea', d.Apoidea) };
  }

  function livePanel(o) {
    const max = Math.max(o.aVal, o.bVal) || 1;
    const t = tone(o.delta, o.lowerIsBetter !== false);
    return `
      <div class="bm-panel hv-card">
        <h3>${o.title} <span class="bm-delta ${t}">${signed(o.delta, o.unit ?? '%')}</span></h3>
        <p class="bm-sub">${o.sub}</p>
        ${bar('Without Apoidea', o.aLabel, o.aVal / max, 'flat')}
        ${bar('With Apoidea', o.bLabel, o.bVal / max, t)}
        <p class="bm-note">${o.note}</p>
      </div>`;
  }

  // Misses grouped by the kind of failure they are. The distinction is the whole
  // point: retrieval missing a memory is our bug, the model ignoring a memory it
  // was handed is a different our-bug, and an unparseable reply is neither — it
  // is a grading artifact that would otherwise depress a score silently.
  function missBreakdown(misses) {
    if (!misses || !misses.length) return '';
    const byKind = {};
    misses.forEach((m) => {
      const k = `${m.arm} · ${m.kind}`;
      byKind[k] = (byKind[k] ?? 0) + 1;
    });
    const rows = Object.entries(byKind)
      .sort((x, y) => y[1] - x[1])
      .map(([k, n]) => `<li><b>${n}</b> — ${k}</li>`)
      .join('');
    return `
      <div class="ev-foot hv-card">
        <div class="ev-foot-n">${misses.length}</div>
        <div class="ev-foot-l">Wrong answers, classified</div>
        <ul style="margin:8px 0 0; padding-left:18px;">${rows}</ul>
        <p>Every miss in both arms, sorted by what kind of failure it is. A baseline miss we
          cannot explain damages the claim exactly as much as a treatment miss, so both are
          listed.</p>
      </div>`;
  }

  function renderLive(d, target) {
    const a = d.baseline, b = d.Apoidea, dl = d.deltas, c = d.config, cost = d.cost;
    const h = d.reply_health || {};
    const cb = d.class_breakdown || {};
    const dep = d.by_dependence || {};
    const w = d.workload || {};
    const external = w.authored_by_us === false;

    // n=0 in either arm means nothing completed; showing 0.0% would read as a
    // measured zero rather than as an absent measurement.
    if (!a || !b || !a.tasks || !b.tasks) {
      el(target).innerHTML = `
        <div class="hv-card" style="padding:24px;">
          <h3>Not measured</h3>
          <p class="bm-note">A results file exists but contains no completed task pairs${
            d.stopped_early ? ` (${d.stopped_early})` : ''}. Nothing is published from it.</p>
        </div>`;
      return;
    }

    // Prefer the figure computed over the tasks that actually ran. The budget
    // guard routinely stops a run part-way, and the workload's own
    // sampled_majority_class_baseline describes the tasks that were *drawn* —
    // comparing accuracy on 13 completed pairs against a constant-answer score
    // over 80 sampled ones compares two different task sets.
    // Derived from per_class counts, which are already over completed runs, so
    // this is right for results files written before the runner reported it.
    const completedMajority = (() => {
      const per = cb.baseline && cb.baseline.per_class;
      if (!per) return null;
      const ns = Object.values(per).map((v) => v.n);
      const total = ns.reduce((s, n) => s + n, 0);
      return total ? Math.max(...ns) / total : null;
    })();
    // Is this run strong enough to put a percentage on the page?
    //
    // Accuracy is a proportion and its uncertainty collapses slowly with n; the
    // token and step figures are means over the same runs and are far tighter.
    // So the two get different treatment rather than one verdict for the whole
    // block: a run can legitimately establish a token delta while establishing
    // nothing at all about accuracy. Gated on the measured interval rather than
    // a task count, because the interval is the thing that actually matters and
    // it is already computed.
    const halfWidth = (a.accuracy_ci95[1] - a.accuracy_ci95[0]) / 2;
    const underpowered = halfWidth > 0.15;
    const truncated = c.completed_task_pairs < c.sampled_tasks;
    const failed = (d.failed_tasks || []).length;

    const majority = completedMajority
      ?? (c.completed_task_pairs === c.sampled_tasks
        ? (w.sampled_majority_class_baseline ?? w.majority_class_baseline)
        : null);
    const ex = excludingUnparseable(d);

    const kd = dep.knowledge_dependent, nk = dep.no_knowledge_needed;
    const mc = kd ? paired(d, 'knowledge_dependent') : null;
    const p = d.price_per_1m_usd || {};
    const perCorrect = (s) => (s.correct
      ? (s.tokens_in / 1e6 * (p.input ?? 0) + s.tokens_out / 1e6 * (p.output ?? 0)) / s.correct : null);
    const ca = perCorrect(a), cb2 = perCorrect(b);
    const costPct = (ca && cb2) ? (cb2 - ca) / ca * 100 : null;

    el(target).innerHTML = `
      ${truncated && underpowered ? `
      <div class="hv-card" style="padding:16px; margin-bottom:20px;">
        <p class="bm-note" style="margin:0;"><b>${num(a.tasks)} task pairs.</b> At this size the
          accuracy figures are not published as results — the interval is wider than the effect.</p>
      </div>` : ''}

      <div class="bm-grid">
        ${kd ? livePanel({
          title: 'Accuracy where memory applies', unit: ' pts', lowerIsBetter: false,
          sub: `${num(kd.baseline.tasks)} tasks that turn on a fact existing only inside one firm.`,
          aLabel: pct(kd.baseline.accuracy), aVal: kd.baseline.accuracy,
          bLabel: pct(kd.Apoidea.accuracy), bVal: kd.Apoidea.accuracy,
          delta: (kd.Apoidea.accuracy - kd.baseline.accuracy) * 100,
          note: mc ? `Both arms ran the same tasks, so the test is paired: of the
            ${mc.discordant_pairs} they disagreed on, memory won <b>${mc.memory_wins}</b> and lost
            ${mc.memory_loses}. McNemar exact <b>p&nbsp;=&nbsp;${mc.p_value.toFixed(3)}</b>${
            mc.significant_at_05 ? '.' : ', not significant.'}` : '',
        }) : ''}

        ${livePanel({
          title: 'Tokens per task', sub: 'Provider usage figures, cached reads included.',
          aLabel: num(a.tokens_per_task), aVal: a.tokens_per_task,
          bLabel: num(b.tokens_per_task), bVal: b.tokens_per_task,
          delta: dl.tokens_pct,
          note: `An agent that knows which document governs opens that one instead of reading the
            pile — and every step it skips also removes what that step would have added to every
            later prompt. Steps fall ${a.steps_per_task.toFixed(1)} → ${b.steps_per_task.toFixed(1)}.`,
        })}

        ${costPct !== null ? livePanel({
          title: 'Cost per <em>correct</em> answer',
          sub: 'Each arm priced on its own tokens at list rate.',
          aLabel: usd(ca), aVal: ca, bLabel: usd(cb2), bVal: cb2, delta: costPct,
          note: `The metric that survives both effects at once: a baseline pays full price for the
            answers it gets wrong. Priced undiscounted so you can substitute your own rates.`,
        }) : ''}
      </div>

      <p class="bm-note" style="max-width:820px;">
        <b>What is inside those numbers.</b> ${nk ? `The suite also carries ${num(nk.baseline.tasks)}
        tasks no memory layer can help with — decidable from the task itself, where the injected
        block is pure overhead and costs ${Math.abs((nk.Apoidea.accuracy - nk.baseline.accuracy) * 100).toFixed(1)}
        points. They stay in the combined figure rather than being excluded from it: across all
        ${num(a.tasks)} tasks accuracy is ${pct(a.accuracy)} → ${pct(b.accuracy)}.` : ''}
        Recall surfaced the governing memory ${d.recall_precision_at_5 !== null
          ? pct(d.recall_precision_at_5) : '—'} of the time against a store of
        ${num(c.governing_memories + c.distractor_memories)}; when it misses, the task fails and the
        failure is counted against us. ${d.unparseable_answers === 0
          ? 'Every reply committed to an option — no grading artifacts.' : ''}
      </p>

      <div id="bm-corroboration" class="ev-footnotes"></div>

      <details class="bm-method">
        <summary>Method, sample, and what this is not</summary>
        <p>${d.what_this_is}</p>
        <p class="bm-note"><b>95% Wilson intervals</b> on the combined accuracies:
          ${pct(a.accuracy)} <span class="bm-n">(${ci(a.accuracy_ci95)})</span> →
          ${pct(b.accuracy)} <span class="bm-n">(${ci(b.accuracy_ci95)})</span>. They overlap — which
          is why the headline is the paired McNemar test above, the one this design actually
          supports, rather than a comparison of two independent intervals.</p>
        <p class="bm-note"><b>The split is pre-specified.</b> It is a property of each task
          (<code>knowledge is None</code>), it predates this run, and it is the same cut the
          deterministic suite has always published. A subgroup chosen after seeing results would be
          fishing.</p>
        ${(d.failed_tasks || []).length ? `<p class="bm-note"><b>${num(d.failed_tasks.length)}
          task(s) did not run</b> — <code>${(d.failed_tasks[0].error || '').slice(0, 120)}</code>.
          They cost nothing, and the task order is shuffled, so the completed pairs are a random
          subsample rather than a biased prefix.</p>` : ''}
        <ul>${(d.caveats || []).map((x) => `<li>${x}</li>`).join('')}</ul>
        <p class="bm-note">Reproduce with <code>pnpm evals:live</code> — model ${c.model}, seed
          ${c.seed}, ${num(cost.calls)} calls, $${cost.usd.toFixed(2)} at list price
          (${cost.caching_discount_pct}% saved by caching, which lowers the bill and not the token
          counts). Last run ${new Date(d.generated_at).toLocaleString()}.${
            c.code_version?.commit
              ? ` Measured at commit <code>${c.code_version.commit.slice(0, 7)}</code>${
                  c.code_version.dirty ? ' (working tree dirty)' : ''
                } — every live call costs money, so these numbers are not re-run on each change to the
                code they measure. The commit is published so you can tell.`
              : ''
          }</p>
      </details>`;
  }

  fetch('/apoidea/evals/eval-results.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !d.overall) throw new Error('no results');
      render(d);
    })
    .catch(() => {
      el('bm-body').innerHTML = `
        <div class="hv-card" style="text-align:center; padding:32px;">
          <p>No eval results checked in yet.</p>
          <pre class="hv-code" style="display:inline-block; text-align:left;">pnpm evals</pre>
          <p class="bm-note">Runs the whole suite and writes the numbers this section renders.</p>
        </div>`;
    });

  // One section, three files. The live run is the headline; the external workload
  // and the deterministic suite corroborate it in a single compact strip rather
  // than as two more full blocks. Nothing measured was dropped — the numbers that
  // used to occupy their own sections are still rendered, just not at the same
  // weight as the primary result.
  fetch('/apoidea/evals/real-model-results.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !d.config) throw new Error('no live results');
      renderLive(d, 'bm-live');
      corroborate();
    })
    .catch(() => {
      el('bm-live').innerHTML = `
        <div class="hv-card" style="padding:24px;">
          <h3>Not measured yet</h3>
          <p class="bm-note">No run against a real model has completed, so there is nothing to show.</p>
          <pre class="hv-code" style="display:inline-block; text-align:left;">pnpm evals:live</pre>
        </div>`;
    });

  // Corroboration: one card per companion measurement, each a single line.
  function corroborate() {
    const box = el('bm-corroboration');
    if (!box) return;
    const card = (n, label, body) =>
      `<div class="ev-foot hv-card"><div class="ev-foot-n">${n}</div>
       <div class="ev-foot-l">${label}</div><p>${body}</p></div>`;

    fetch('/apoidea/evals/real-model-results-cuad.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => {
        if (!x || !x.baseline || !x.baseline.tasks) return;
        const cb = (x.class_breakdown || {}).baseline;
        const per = cb && cb.per_class;
        const ns = per ? Object.values(per).map((v) => v.n) : null;
        const constant = ns ? Math.max(...ns) / ns.reduce((s, v) => s + v, 0) : null;
        box.insertAdjacentHTML('beforeend', card(
          `${pct(x.baseline.accuracy)} → ${pct(x.Apoidea.accuracy)}`,
          'On a workload we did not write',
          `<b>CUAD</b> — ${num(x.workload.contracts_loaded)} real commercial contracts annotated by
           lawyers under The Atticus Project (CC BY 4.0), ${num(x.baseline.tasks)} held-out tasks.
           ${constant ? `A constant answer scores ${pct(constant)}, so both arms beat guessing.` : ''}
           Arm B's memories are distilled only from contracts disjoint from the ones under review —
           asserted in code before a run is allowed to start. Tokens ${signed(x.deltas.tokens_pct)}.`));
      })
      .catch(() => {});

    fetch('/apoidea/evals/eval-results.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s || !s.overall) return;
        box.insertAdjacentHTML('beforeend', card(
          signed(s.overall.deltas.tokens_pct),
          'Tokens, with the model removed as a variable',
          `<b>${num(s.config.task_runs_total)} deterministic runs</b> against a stub — byte
           reproducible, zero sampling noise. It isolates the memory layer, so its token and recall
           figures are exact where the live run's carry noise. Its accuracy figure is
           <em>not</em> an accuracy claim: the stub answers from the recalled cue and never opens a
           document, which is why rebuilding the workload left it unchanged while the live numbers
           moved. Reproduce with <code>pnpm evals</code> — no credential, no cost.`));
      })
      .catch(() => {});
  }
})();
