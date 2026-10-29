import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, mulberry32, injection } from '../src/inject.mjs';
import { AREAS } from '../src/streams.mjs';
import { HOUR, MINUTE, DAY } from '../src/regulator.mjs';

const node = { name: 'n', fit: [{ t: 0, area: 'src', files: 2 }, { t: 1, area: 'docs', files: 7 }] };
const base = { fitHourMax: 4, topArea: 'data', medianFiles: 3 };

test('TYPES and the PRNG', () => {
  assert.deepEqual(TYPES, ['runaway-fast', 'runaway-quiet', 'scatter-quiet', 'overrun', 'health']);
  const a = mulberry32(20261028);
  const xs = [a(), a(), a()];
  const b = mulberry32(20261028);
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.equal(mulberry32(1)(), mulberry32(1)());
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('runaway-fast: identical action at the faster of 20 an hour or 3 × the FIT peak, for 24 h', () => {
  const r = injection('runaway-fast', node, base, 1000, mulberry32(1));
  assert.equal(r.intents.length, 24 * 20);
  assert.deepEqual(r.intents[0], { t: 1000, area: 'data', files: 3, injected: true });
  assert.equal(r.intents[1].t - r.intents[0].t, HOUR / 20);
  assert.deepEqual(r.tampers, []);
  const busy = injection('runaway-fast', node, { ...base, fitHourMax: 10 }, 0, mulberry32(1));
  assert.equal(busy.intents.length, 24 * 30);
  assert.ok(busy.intents.every((a) => a.t < DAY));
});

test('runaway-quiet: one every 10 minutes exactly', () => {
  const r = injection('runaway-quiet', node, base, 0, mulberry32(1));
  assert.equal(r.intents.length, 144);
  assert.ok(r.intents.every((a, i) => a.t === i * 10 * MINUTE && a.area === 'data' && a.files === 3));
});

test('scatter-quiet: every 5–15 minutes, any area, 1–20 files', () => {
  const r = injection('scatter-quiet', node, base, 0, mulberry32(3));
  assert.ok(r.intents.length > 24 * 4 && r.intents.length <= 24 * 12 + 1);
  for (let i = 1; i < r.intents.length; i++) { const g = r.intents[i].t - r.intents[i - 1].t; assert.ok(g >= 5 * MINUTE - 1 && g <= 15 * MINUTE + 1, String(g)); }
  assert.ok(r.intents.every((a) => AREAS.includes(a.area) && a.files >= 1 && a.files <= 20 && a.injected === true));
  assert.ok(new Set(r.intents.map((a) => a.area)).size >= 6);
});

test('overrun: the node’s own actions, about 3 × its peak an hour', () => {
  const r = injection('overrun', node, { ...base, fitHourMax: 10 }, 0, mulberry32(5));
  assert.ok(r.intents.length > 24 * 30 * 0.8 && r.intents.length < 24 * 30 * 1.2, String(r.intents.length));
  assert.ok(r.intents.every((a) => (a.area === 'src' && a.files === 2) || (a.area === 'docs' && a.files === 7)));
  assert.ok(r.intents.every((a, i) => i === 0 || a.t >= r.intents[i - 1].t));
  const slow = injection('overrun', node, base, 0, mulberry32(5));
  assert.ok(slow.intents.length > 24 * 20 * 0.8 && slow.intents.length < 24 * 20 * 1.2);
});

test('the 24-hour horizon is half-open: an action exactly at its end is not in it', () => {
  assert.equal(injection('scatter-quiet', node, base, 0, () => 0.5).intents.length, 144);   // every 10 minutes exactly
  assert.equal(injection('overrun', node, base, 0, () => 0).intents.length, 86399);         // a zero draw steps a second
  assert.equal(injection('runaway-quiet', node, base, 0, () => 0.5).intents.at(-1).t, DAY - 10 * MINUTE);
});

test('health: a rewrite at t0, no actions; unknown types do nothing', () => {
  const r = injection('health', node, base, 77, mulberry32(9));
  assert.deepEqual(r.intents, []);
  assert.equal(r.tampers.length, 1);
  assert.equal(r.tampers[0].node, 'n');
  assert.equal(r.tampers[0].t, 77);
  assert.ok(r.tampers[0].u >= 0 && r.tampers[0].u < 1);
  assert.deepEqual(injection('nope', node, base, 0, mulberry32(1)), { intents: [], tampers: [] });
});
