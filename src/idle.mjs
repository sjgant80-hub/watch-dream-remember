// ════════════════════════════════════════════════════════════════
// idle.mjs — the idle trigger: the daydream works only while no real job is queued, and any real job pre-empts it at
// once. Deterministic control; the work and the clock are injected (no file, network or timer of its own).
//
//   createIdle({ clock, yieldNow, tier3, tier2, plan })
//     clock()        ms now                         yieldNow()   resolves after the host has run its timers
//     tier3()        one small step of deterministic work; returns false when there is nothing left to do
//     tier2(signal)  one local-model call; must stop when the AbortSignal fires
//     plan(i)        'tier2' | 'tier3' for the i-th unit of daydream work
//   → { start(), stop(), job(fn), pause(on), stats }
// Tier-3 work runs in slices of at most SLICE_MS between which the loop yields, so a job's arrival is seen within one
// slice; a tier-2 call in flight is aborted the instant a job arrives.
// ════════════════════════════════════════════════════════════════

export const SLICE_MS = 5;

export function createIdle(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const clock = o.clock, yieldNow = o.yieldNow, tier3 = o.tier3, tier2 = o.tier2, plan = o.plan || (() => 'tier3');
  const stats = { slices: 0, tier2: 0, aborted: 0, jobs: 0 };
  let running = false, paused = false, jobs = 0, inflight = null, wake = null, i = 0;
  const idle = () => !paused && jobs === 0;
  const sleep = () => new Promise((resolve) => { wake = resolve; });
  const rouse = () => { if (wake && idle()) { const w = wake; wake = null; w(); } };

  async function loop() {
    while (running) {
      if (!idle()) { await sleep(); continue; }
      const kind = plan(i++);
      if (kind === 'tier2') {
        const ctl = new AbortController();
        inflight = ctl;
        stats.tier2++;
        try { await tier2(ctl.signal); } catch { /* an aborted call ends here */ }
        if (ctl.signal.aborted) stats.aborted++;
        inflight = null;
      } else {
        const t0 = clock();
        let more = true;
        while (more && clock() - t0 < SLICE_MS && idle()) more = tier3() !== false;
        stats.slices++;
        if (!more) running = false;
      }
      await yieldNow();
    }
  }

  return {
    stats,
    start() { if (!running) { running = true; loop(); } },
    stop() { running = false; if (inflight) inflight.abort(); const w = wake; wake = null; if (w) w(); },
    pause(on) { paused = on === true; if (paused && inflight) inflight.abort(); rouse(); },
    /** A real job: the daydream stops at once (its local-model call aborted), the job runs, the daydream resumes. */
    async job(fn) {
      jobs++;
      stats.jobs++;
      if (inflight) inflight.abort();
      try { return await fn(); } finally { jobs--; rouse(); }
    },
    busy: () => inflight !== null,
  };
}
