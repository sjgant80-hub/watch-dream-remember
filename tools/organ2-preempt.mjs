#!/usr/bin/env node
// tools/organ2-preempt.mjs — D2, measured live: real jobs (real local-model requests) arriving while the daydream works,
// each paired with a control job while the daydream is paused. Writes data/organ2-preempt.json.
//   node tools/organ2-preempt.mjs            (needs the local model at localhost:11434 and node tools/data.mjs --fetch)
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setImmediate as tick } from 'node:timers/promises';
import { loadShop } from '../vendor/dex-frontier/src/silos.mjs';
import { prepare } from '../src/lab.mjs';
import { createIdle } from '../src/idle.mjs';
import { promptOf } from '../src/daydream.mjs';
import { mulberry32 } from '../src/dream.mjs';

const ROOT = new URL('../', import.meta.url);
const LOCAL = 'http://localhost:11434/api/generate', MODEL = 'qwen2.5:7b', JOBS = Number(process.env.WDR_JOBS) || 30;   // WDR_JOBS / WDR_OUT: a tooling smoke only
const lab = prepare({ shop: loadShop(readFileSync(new URL('.data/data/online_shoppers_intention.csv', ROOT), 'utf8')) });
const L = lab.shop, rows = L.sets.fit, n = rows.length;

// tier-3 work: real association arithmetic over the shop's FIT rows, one feature pair per step, round and round
const pairs = [];
for (let a = 0; a < L.features.length; a++) for (let b = a + 1; b < L.features.length; b++) pairs.push([L.features[a], L.features[b]]);
let at = 0, sink = 0;
const tier3 = () => {
  const [f, g] = pairs[at++ % pairs.length], mf = L.stats[f].q[0.5], mg = L.stats[g].q[0.5];
  let k = 0, s = 0;
  for (let i = 0; i < n; i++) if (L.ds.cols[f][rows[i]] > mf && L.ds.cols[g][rows[i]] > mg) { k++; s += L.y.fit[i]; }
  sink += k ? s / k : 0;
  return true;
};

/** A streaming local-model request; resolves at the first token (→ ms) or when aborted. Reads to the end unless aborted. */
async function stream(prompt, maxTokens, signal, onFirst) {
  const r = await fetch(LOCAL, { method: 'POST', signal, body: JSON.stringify({ model: MODEL, prompt, stream: true, options: { temperature: 0, seed: 0, num_predict: maxTokens } }) });
  const reader = r.body.getReader();
  let first = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!first && value && value.length) { first = true; onFirst && onFirst(); }
  }
}

const daydreamPrompt = promptOf(L, { op: 'log', f: 'ProductRelated_Duration' }, { ...L, title: 'Bank calls', outcome: 'subscribed', features: ['age', 'campaign', 'pdays', 'previous', 'euribor3m'] });
let inTier2 = false;
const idle = createIdle({
  clock: () => performance.now(), yieldNow: () => tick(),
  tier3, plan: (i) => (i % 200 === 199 ? 'tier2' : 'tier3'),
  tier2: async (signal) => { inTier2 = true; try { await stream(daydreamPrompt, 48, signal); } finally { inTier2 = false; } },
});

const rng = mulberry32(20261029 + 2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const JOB_PROMPT = 'In five words, what does an independent regulator of a software mesh do?';

async function runJob() {
  return new Promise((resolve) => {
    const gap = 2000 + rng() * 6000, scheduled = performance.now() + gap;
    setTimeout(() => {
      const during = inTier2;
      idle.job(async () => {
        const start = performance.now();
        let first = null;
        await stream(JOB_PROMPT, 8, undefined, () => { first = performance.now(); });
        resolve({ dispatchMs: start - scheduled, ttftMs: (first ?? performance.now()) - start, duringTier2: during });
      });
    }, gap);
  });
}

const jobs = [], pairs2 = [];
idle.start();
await wait(3000);
for (let k = 0; k < JOBS; k++) {
  idle.pause(false);
  const on = await runJob();
  jobs.push(on);
  idle.pause(true);
  await wait(2500);   // the daydream is paused: any call of its own was aborted; let the model go idle
  const off = await runJob();
  pairs2.push({ on: on.ttftMs, off: off.ttftMs });
  process.stderr.write(`  job ${k + 1}/${JOBS}: dispatch ${on.dispatchMs.toFixed(2)} ms${on.duringTier2 ? ' (during a daydream model call)' : ''}, first token ${(on.ttftMs / 1000).toFixed(2)} s vs ${(off.ttftMs / 1000).toFixed(2)} s paused\n`);
}
idle.stop();
const out = { kind: 'watch-dream-remember.organ2.preempt', model: MODEL, measured: new Date().toISOString(), device: '12th Gen Intel Core i7-1255U, CPU only (size_vram 0)', note: 'Each real job is a streaming local-model request; dispatch = its handler start − its scheduled arrival; time-to-first-token from the handler start. Each job with the daydream working is paired with the next job while the daydream is paused. Other sessions may share the same local model; their load falls on both arms alike.', stats: idle.stats, jobs, pairs: pairs2, tier3Sink: Math.round(sink) };
writeFileSync(process.env.WDR_OUT ? process.env.WDR_OUT : new URL('data/organ2-preempt.json', ROOT), JSON.stringify(out, null, 1) + '\n');
console.error(`✓ ${jobs.length} jobs; daydream: ${idle.stats.slices} tier-3 slices, ${idle.stats.tier2} model calls (${idle.stats.aborted} aborted by a job)`);
