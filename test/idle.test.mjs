import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLICE_MS, SLICE_STEPS, createIdle } from '../src/idle.mjs';

const tick = () => new Promise((r) => setImmediate(r));

test('SLICE_MS and SLICE_STEPS', () => { assert.equal(SLICE_MS, 5); assert.equal(SLICE_STEPS, 1000); });

test('a stalled clock cannot hold the loop: a slice ends at SLICE_STEPS', async () => {
  let steps = 0;
  const idle = createIdle({ clock: () => 0, yieldNow: tick, tier3: () => { steps++; return steps < 2500; } });
  idle.start();
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(steps, 2500);
  assert.equal(idle.stats.slices, 3);
});

test('tier-3 runs in slices until there is nothing left; a slice never outlasts SLICE_MS of clock', async () => {
  let t = 0, steps = 0;
  const idle = createIdle({ clock: () => t, yieldNow: tick, tier3: () => { t += 2; steps++; return steps < 7; } });
  idle.start();
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(steps, 7);
  assert.equal(idle.stats.slices, 3);   // 2+2+2 > 5 → 3 steps a slice: 3, 3, 1
  idle.start();
  assert.equal(idle.busy(), false);
});

test('a job aborts the tier-2 call in flight, runs, and the daydream resumes', async () => {
  let t = 0, calls = 0, sawAbort = false;
  const idle = createIdle({
    clock: () => (t += 1), yieldNow: tick, tier3: () => true, plan: (i) => (i === 0 ? 'tier2' : 'tier3'),
    tier2: (signal) => new Promise((resolve, reject) => { calls++; signal.addEventListener('abort', () => { sawAbort = true; reject(new Error('aborted')); }); }),
  });
  idle.start();
  await tick();
  assert.equal(idle.busy(), true);
  const order = [];
  const r = await idle.job(async () => { order.push('job'); return 42; });
  assert.equal(r, 42);
  assert.equal(sawAbort, true);
  assert.equal(calls, 1);
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(idle.stats.aborted, 1);
  assert.equal(idle.stats.tier2, 1);
  assert.equal(idle.stats.jobs, 1);
  assert.ok(idle.stats.slices > 0);
  idle.stop();
});

test('nothing runs while a job is queued or the daydream is paused; stop wakes and ends it', async () => {
  let t = 0, steps = 0;
  const idle = createIdle({ clock: () => t, yieldNow: tick, tier3: () => { t += 10; steps++; return true; } });
  idle.pause(true);
  idle.start();
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(steps, 0);
  idle.pause(false);
  for (let i = 0; i < 3; i++) await tick();
  assert.ok(steps > 0);
  let release;
  const hold = idle.job(() => new Promise((r) => { release = r; }));
  await tick();
  const during = steps;
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(steps, during);
  release();
  await hold;
  for (let i = 0; i < 3; i++) await tick();
  assert.ok(steps > during);
  idle.stop();
  const after = steps;
  for (let i = 0; i < 5; i++) await tick();
  assert.ok(steps <= after + 1);
});

test('pausing aborts a tier-2 call; a failing job still releases the daydream', async () => {
  let aborted = 0;
  const idle = createIdle({ clock: () => 0, yieldNow: tick, tier3: () => true, plan: () => 'tier2', tier2: (signal) => new Promise((_, rej) => signal.addEventListener('abort', () => { aborted++; rej(new Error('x')); })) });
  idle.start();
  await tick();
  idle.pause(true);
  for (let i = 0; i < 3; i++) await tick();
  assert.equal(aborted, 1);
  idle.pause(false);
  await tick();
  await assert.rejects(idle.job(async () => { throw new Error('job failed'); }));
  for (let i = 0; i < 3; i++) await tick();
  assert.equal(idle.busy(), true);
  idle.stop();
  for (let i = 0; i < 3; i++) await tick();
  assert.equal(idle.busy(), false);
  const bare = createIdle(null);
  assert.equal(bare.busy(), false);
});

test('a slice holds exactly SLICE_STEPS steps on a stalled clock, and stops the moment SLICE_MS has passed', async () => {
  const per = [];
  let calls = 0;
  const idle = createIdle({ clock: () => 0, yieldNow: tick, tier3: () => { per[idle.stats.slices] = (per[idle.stats.slices] || 0) + 1; return ++calls < 1500; } });
  idle.start();
  for (let i = 0; i < 4; i++) await tick();
  assert.deepEqual(per, [1000, 500]);
  let t = 0;
  const each = [];
  const timed = createIdle({ clock: () => t, yieldNow: tick, tier3: () => { each[timed.stats.slices] = (each[timed.stats.slices] || 0) + 1; t += 5; return each.length < 3; } });
  timed.start();
  for (let i = 0; i < 6; i++) await tick();
  assert.deepEqual(each, [1, 1, 1]);   // 5 ms is the whole slice: the step that reaches it is the last
});
