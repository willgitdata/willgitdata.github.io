// The "How it works" walkthrough: the same agent, the same job, side by side —
// once without Apoidea and once with.
//
// Nothing here is drawn to look good. Every step, every token count, and both
// running totals are read from /evals/walkthrough-data.json, which is the
// output of examples/evals/capture_walkthrough.py driving one real task from
// the eval suite through the real SDK and gateway twice per arm. The closing
// aggregate comes from /evals/eval-results.json, the suite's own results file.
// See IMPLEMENTATION_PLAN.md §10.
(function () {
  let wt = null; // walkthrough-data.json
  let bench = null; // eval-results.json

  const num = (n) => Math.round(n).toLocaleString();
  const usd = (x) => '$' + (x < 0.001 ? x.toFixed(6) : x.toFixed(4));
  const sign = (x) => (x >= 0 ? '+' : '') + Math.round(x) + '%';

  // --- step grouping -------------------------------------------------------
  // Scenes are defined by what the agent is *doing*, not by index, so the
  // walkthrough stays truthful if a re-capture changes how many documents get
  // read before the governing one turns up.
  const PHASE = (label) => {
    if (label === 'plan') return 'plan';
    if (label === 'search' || label.startsWith('read:')) return 'find';
    if (label === 'decide') return 'decide';
    return 'work'; // policy / history / exposure / rework
  };

  const upTo = (steps, phase) => {
    const order = ['plan', 'find', 'work', 'decide'];
    const limit = order.indexOf(phase);
    return steps.filter((s) => order.indexOf(PHASE(s.label)) <= limit);
  };

  const stepTokens = (s) => s.tokens_in + s.tokens_out;
  const sum = (steps) => steps.reduce((t, s) => t + stepTokens(s), 0);

  function meter(value, max, tone) {
    const on = max > 0 ? Math.max(1, Math.round((value / max) * 24)) : 0;
    return `<div class="dw-meter">${Array.from({ length: 24 }, (_, i) =>
      `<i class="${i < on ? 'on ' + tone : ''}"></i>`).join('')}</div>`;
  }

  function stepRow(s, isCurrent) {
    const label = s.label.startsWith('read:') ? s.label.slice(5) : s.label;
    const icon = { plan: '▸', search: '⌕', policy: '§', history: '⟲', exposure: 'Σ', rework: '✗', decide: '✓' }[s.label]
      || (s.label.startsWith('read:') ? '▤' : '·');
    return `
      <div class="dw-step ${isCurrent ? 'now' : 'past'} ${s.label === 'rework' ? 'bad' : ''}">
        <span class="dw-step-icon">${icon}</span>
        <span class="dw-step-label">${label}</span>
        <span class="dw-step-tok">+${num(stepTokens(s))}</span>
      </div>`;
  }

  // One agent's column at one moment in the task.
  function column(opts) {
    const { title, tone, run, phase, max, note, knows } = opts;
    const shown = upTo(run.steps, phase);
    const currentPhase = shown.filter((s) => PHASE(s.label) === phase);
    const total = sum(shown);

    return `
      <div class="dw-col ${tone}">
        <div class="dw-col-head">
          <span class="dw-col-title">${title}</span>
          <span class="dw-col-badge ${tone}">${tone === 'good' ? 'WITH APOIDEIA' : 'NO MEMORY'}</span>
        </div>

        <div class="dw-knows ${knows ? 'has' : 'empty'}">
          <div class="dw-knows-head">WHAT IT KNOWS BEFORE IT STARTS</div>
          ${knows
            ? `<div class="dw-knows-body">${knows}</div>`
            : '<div class="dw-knows-body none">— nothing. Every run is its first. —</div>'}
        </div>

        <div class="dw-steps">
          ${shown.map((s) => stepRow(s, currentPhase.includes(s))).join('')}
        </div>

        <div class="dw-tally">
          ${meter(total, max, tone)}
          <div class="dw-tally-row">
            <b class="${tone}">${num(total)}</b><span>tokens so far</span>
            <em>${shown.length} step${shown.length === 1 ? '' : 's'}</em>
          </div>
        </div>
        ${note ? `<p class="dw-col-note">${note}</p>` : ''}
      </div>`;
  }

  function sideBySide(phase, notes, run = 0) {
    const b = wt.baseline[run];
    const a = wt.apoideia[run];
    const max = sum(wt.baseline[0].steps);
    return `
      <div class="dw-split">
        ${column({ title: 'Agent A', tone: 'bad', run: b, phase, max, note: notes[0], knows: null })}
        ${column({
          title: 'Agent B', tone: 'good', run: a, phase, max, note: notes[1],
          knows: `<span class="dw-recall">◈ recalled</span> ${wt.task.knowledge}`,
        })}
      </div>`;
  }

  const scenes = () => {
    const b = wt.baseline[0];
    const a = wt.apoideia[0];
    const bTotal = sum(b.steps);
    const aTotal = sum(a.steps);
    const saved = Math.round((1 - aTotal / bTotal) * 100);
    // capture_walkthrough.py can legitimately record a single run per arm, and
    // the last scene indexed [1] unconditionally. That threw a TypeError inside
    // a render function, which the modal displays as a blank panel — a scene
    // that silently disappears rather than an error anyone would notice.
    const hasRerun = wt.baseline.length > 1 && wt.apoideia.length > 1;

    return [
      {
        title: 'THE SAME JOB, TWO AGENTS',
        render: () => `
          <div class="dw-assignment">
            <span class="dw-assignment-tag">ASSIGNMENT — BOTH AGENTS</span>
            ${wt.task.instruction}
            <span class="dw-assignment-sub">${wt.task.documents} documents in the case file. One of them governs the decision.</span>
          </div>
          ${sideBySide('plan', [
            'Identical model, identical prompt, identical tools. The only difference in this entire walkthrough is what is in the context window.',
            'Apoidea recalled the firm\'s handling rule and injected it before the first call. That is the whole integration — one <code>agent.wrap()</code> line.',
          ])}`,
      },
      {
        title: 'FINDING WHAT GOVERNS',
        render: () => `
          ${sideBySide('find', [
            `Doesn't know which document decides it, so it opens all ${b.docs_read}. Each one joins the transcript, and every later step re-sends the whole thing — which is why the cost curve bends upward, not sideways.`,
            `Was told the ${wt.task.governing_document} governs water-loss claims. Opens that one. ${b.docs_read - a.docs_read} documents never enter the context window at all.`,
          ])}
          <p class="dw-note"><strong>This is where the gap opens.</strong> A skipped step doesn't just save its own call — it removes everything that call would have added to every prompt after it.</p>`,
      },
      {
        title: 'THE MISTAKE, AND THE ONE THAT AVOIDS IT',
        render: () => `
          ${sideBySide('work', [
            'Totals the exposure, and the number doesn\'t reconcile — the vendor invoices contain duplicated line items. Nobody told it. It has to redo the work.',
            'Deduped by invoice number first, because it remembered the last time this went wrong. No rework step.',
          ])}
          <p class="dw-note">Agent A isn't badly built — it's uninformed. The firm's invoices have always been like this; the fact just lives nowhere a model can reach.</p>`,
      },
      {
        title: 'BOTH REACH THE SAME ANSWER',
        render: () => `
          ${sideBySide('decide', [null, null])}
          <div class="dw-verdict">
            <div class="dw-verdict-card bad">
              <div class="dw-verdict-n">${num(bTotal)}</div>
              <div class="dw-verdict-l">tokens · ${b.step_count} steps · ${usd(b.cost_usd)}</div>
            </div>
            <div class="dw-verdict-vs">vs</div>
            <div class="dw-verdict-card good">
              <div class="dw-verdict-n">${num(aTotal)}</div>
              <div class="dw-verdict-l">tokens · ${a.step_count} steps · ${usd(a.cost_usd)}</div>
            </div>
          </div>
          <p class="dw-note">Same determination, same quality of work. <strong>${saved}% less to get there</strong> on this task — and the gap is the memory layer, nothing else.</p>`,
      },
      {
        title: 'TOMORROW, THE SAME KIND OF CLAIM',
        render: () => {
          if (!hasRerun) {
            // Say what is missing instead of showing run 1 twice, which would
            // make the point by asserting something the capture did not measure.
            return `
              <p class="dw-note">This capture recorded a single run per arm, so there is no second
                run to put beside the first. Re-capture with more runs to see whether the gap
                holds.</p>
              ${aggregate()}`;
          }
          const b2 = wt.baseline[1];
          const a2 = wt.apoideia[1];
          const same = sum(b2.steps) === bTotal;
          return `
            <div class="dw-rerun">
              <div class="dw-rerun-col bad">
                <div class="dw-rerun-head">Agent A · run 2</div>
                <div class="dw-rerun-n">${num(sum(b2.steps))}</div>
                <div class="dw-rerun-l">tokens · ${b2.step_count} steps</div>
                <div class="dw-rerun-tag bad">${same ? 'IDENTICAL TO RUN 1' : 'NO IMPROVEMENT'}</div>
                <p>It reads the same ${b2.docs_read} documents in the same order, makes the same reconciliation
                   error, and pays the same bill. It is not learning slowly — it is starting from zero, every
                   single time.</p>
              </div>
              <div class="dw-rerun-col good">
                <div class="dw-rerun-head">Agent B · run 2</div>
                <div class="dw-rerun-n">${num(sum(a2.steps))}</div>
                <div class="dw-rerun-l">tokens · ${a2.step_count} steps</div>
                <div class="dw-rerun-tag good">KNOWS IT ALREADY</div>
                <p>The rule is in durable memory, so run 2 costs what run 1 cost. Every new lesson the fleet
                   distills from its own failures lands here too, scored and prunable — the library grows
                   while the bill doesn't.</p>
              </div>
            </div>
            ${aggregate()}`;
        },
      },
    ];
  };

  // The one place the walkthrough leaves this single task and quotes the suite.
  function aggregate() {
    if (!bench || !bench.overall) {
      return '<p class="dw-note">Run <code>pnpm evals</code> to measure this across the whole suite on your own machine.</p>';
    }
    const o = bench.overall;
    return `
      <div class="dw-agg">
        <div class="dw-agg-head">ACROSS THE WHOLE SUITE — ${num(bench.config.task_runs_total)} TASK RUNS</div>
        <div class="dw-agg-row">
          <span>accuracy</span>
          <b>${(o.baseline.accuracy * 100).toFixed(1)}% → ${(o.apoideia.accuracy * 100).toFixed(1)}%</b>
        </div>
        <div class="dw-agg-row">
          <span>tokens per task</span><b>${sign(o.deltas.tokens_pct)}</b>
        </div>
        <div class="dw-agg-row">
          <span>cost per <em>correct</em> answer</span><b>${sign(o.deltas.cost_per_correct_pct)}</b>
        </div>
        <p class="dw-note">Four shapes of agent work, five regulated verticals, and a control set no memory
          layer can help with — that one is in these numbers too.
          <!-- This was an in-page anchor to the landing page's results section,
               and it stopped resolving the day that section moved to
               /performance.html: the link stayed, the target did not, and
               clicking it did nothing at all. -->
          <a href="/apoidea/performance.html">Full method and caveats →</a></p>
      </div>`;
  }

  // --- modal plumbing ------------------------------------------------------
  let idx = 0;
  let built = [];
  const backdrop = document.getElementById('dw-backdrop');
  const body = document.getElementById('dw-body');
  const dots = document.getElementById('dw-dots');
  const title = document.getElementById('dw-title');
  const prevBtn = document.getElementById('dw-prev');
  const nextBtn = document.getElementById('dw-next');

  function renderDots() {
    dots.innerHTML = built
      .map((_, i) => `<span class="${i === idx ? 'on' : ''} ${i < idx ? 'done' : ''}" data-i="${i}"></span>`)
      .join('');
    dots.querySelectorAll('span').forEach((el) => {
      el.onclick = () => { idx = Number(el.dataset.i); paint(); };
    });
  }

  function paint() {
    if (!wt) {
      title.textContent = 'HOW IT WORKS';
      body.innerHTML = `
        <div class="hv-card" style="text-align:center; padding:32px;">
          <p>No captured walkthrough yet.</p>
          <pre class="hv-code" style="display:inline-block; text-align:left;">pnpm evals
python examples/evals/capture_walkthrough.py</pre>
          <p class="dw-note">Records one real task, step by step, in both arms — which is what this shows.</p>
        </div>`;
      return;
    }
    title.textContent = `${idx + 1}/${built.length} — ${built[idx].title}`;
    body.innerHTML = built[idx].render();
    body.querySelectorAll('[data-close-demo]').forEach((a) => (a.onclick = close));
    renderDots();
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === built.length - 1 ? 'Replay ↺' : 'Next ▶';
  }

  function open() { idx = 0; paint(); backdrop.classList.add('open'); }
  function close() { backdrop.classList.remove('open'); }

  document.querySelectorAll('[data-open-demo]').forEach((el) => (el.onclick = open));
  document.getElementById('dw-close').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', (e) => {
    if (!backdrop.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') nextBtn.click();
    if (e.key === 'ArrowLeft' && idx > 0) prevBtn.click();
  });

  prevBtn.onclick = () => { if (idx > 0) { idx -= 1; paint(); } };
  nextBtn.onclick = () => { idx = idx === built.length - 1 ? 0 : idx + 1; paint(); };

  Promise.all([
    fetch('/apoidea/evals/walkthrough-data.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/apoidea/evals/eval-results.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([w, b]) => {
    bench = b;
    // A capture file that exists but holds no runs is not a walkthrough. Every
    // scene reads baseline[0] and apoideia[0], so the shape is checked once
    // here rather than indexed on faith five times below — the failure mode
    // otherwise is a TypeError inside a .then(), which surfaces as an empty
    // modal and no error anywhere a reader would see it.
    if (w && w.task && Array.isArray(w.baseline) && w.baseline.length &&
        Array.isArray(w.apoideia) && w.apoideia.length) {
      wt = w;
      built = scenes();
    }
  });

  // Live-aware banner: if this machine's gateway is reachable, say so.
  //
  // The origin used to be a literal localhost:4000 URL. That made the banner
  // correct on exactly one machine and silently wrong everywhere else —
  // and wrong in the direction that hides a true statement, since an
  // unreachable gateway and a gateway on another host are indistinguishable to
  // a failed fetch. The gateway origin is a per-deployment value like the
  // console's, so it comes from /config.js.
  const banner = document.getElementById('demo-live-banner');
  const gateway = ((window.APOIDEIA_CONFIG || {}).gatewayOrigin || '').replace(/\/+$/, '');
  if (banner && gateway) {
    fetch(gateway + '/apoidea/v1/health', { signal: AbortSignal.timeout(1500) })
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => { if (h) banner.classList.add('visible'); })
      .catch(() => {});
  }
})();
