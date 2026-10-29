import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROPOSE, ADOPT, VERIFY, MAX_ADOPT, mulberry32, proposals, gate } from '../src/dream.mjs';
import { prepare, fitOrgan, startSpecs } from '../src/lab.mjs';
import { keyOf } from '../src/model.mjs';

function synth(seed, n = 1500) {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cols = { money: new Float64Array(n), flag: new Float64Array(n), noise: new Float64Array(n) };
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    cols.money[i] = r() < 0.3 ? 0 : Math.exp(r() * 7);
    cols.flag[i] = r() < 0.5 ? 1 : 0;
    cols.noise[i] = r();
    y[i] = r() < 1 / (1 + Math.exp(-(-2 + 0.7 * Math.log1p(cols.money[i])))) ? 1 : 0;
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  return { name: 'm', title: 'money', outcome: 'won', features: ['money', 'flag', 'noise'], cols, y, fitRows: idx.slice(0, 800), gateRows: idx.slice(800, 1150), testRows: idx.slice(1150) };
}
const lab = prepare({ m: synth(5) });

test('constants and the PRNG', () => {
  assert.deepEqual([PROPOSE, ADOPT, VERIFY, MAX_ADOPT], [2, 0.0005, 0.0002, 2]);
  const a = mulberry32(1), b = mulberry32(1);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notEqual(mulberry32(2)(), xs[0]);
});

test('proposals: PROPOSE per dataset, never tested or held, deterministic', () => {
  const o = { m: fitOrgan(lab.m, startSpecs(lab.m)) };
  const p1 = proposals(lab, o, new Set(), mulberry32(3));
  const p2 = proposals(lab, o, new Set(), mulberry32(3));
  assert.equal(p1.length, PROPOSE);
  assert.deepEqual(p1, p2);
  for (const c of p1) { assert.equal(c.source, 'dream'); assert.equal(c.priority, 0); assert.equal(c.key, `m|${keyOf(c.spec)}`); assert.notEqual(c.spec.op, 'raw'); }
  const tested = new Set(p1.map((c) => c.key));
  const p3 = proposals(lab, o, tested, mulberry32(3));
  assert.ok(p3.every((c) => !tested.has(c.key)));
  const tiny = prepare({ t: { ...synth(9, 200), features: ['flag'] } });
  const few = proposals(tiny, { t: fitOrgan(tiny.t, startSpecs(tiny.t)) }, new Set(), mulberry32(1));
  assert.ok(few.length <= PROPOSE);
});

test('gate: adopts only a real gain, verifies on TEST, caps adoptions, skips past the cap, never retests', () => {
  const o = { m: fitOrgan(lab.m, startSpecs(lab.m)) };
  const tested = new Set();
  const good = { key: 'm|log(money)', dataset: 'm', spec: { op: 'log', f: 'money' }, source: 'gap' };
  const junk = { key: 'm|sq(noise)', dataset: 'm', spec: { op: 'sq', f: 'noise' }, source: 'dream' };
  const g = gate(lab, o, [junk, good, good, { ...good, dataset: 'zz', key: 'zz|x' }], tested);
  const [rj, rg] = g.records;
  assert.equal(g.records.length, 2);
  assert.equal(rj.adopted, false);
  assert.equal(rj.test, undefined);
  assert.equal(rg.adopted, true);
  assert.ok(rg.gate[1] <= rg.gate[0] - ADOPT);
  assert.equal(rg.verified, rg.test[1] <= rg.test[0] - VERIFY);
  assert.equal(g.organs.m.specs.length, 4);
  assert.equal(o.m.specs.length, 3);
  assert.ok(tested.has('m|log(money)') && tested.has('m|sq(noise)'));
  const again = gate(lab, g.organs, [good], tested);
  assert.equal(again.records.length, 0);
  const many = ['step(money,0.5)', 'step(money,0.75)', 'step(money,0.25)', 'step(money,0.9)'].map((k, i) => ({ key: 'm|' + k, dataset: 'm', spec: { op: 'step', f: 'money', q: [0.5, 0.75, 0.25, 0.9][i] }, source: 'rehearsal' }));
  const t2 = new Set();
  const capped = gate(lab, o, [good, ...many], t2);
  const adopted = capped.records.filter((r) => r.adopted).length;
  assert.ok(adopted <= MAX_ADOPT);
  const skipped = capped.records.filter((r) => r.skipped);
  for (const s of skipped) { assert.equal(t2.has(s.key), false); assert.equal(s.gate, null); }
  if (adopted === MAX_ADOPT) assert.ok(skipped.length >= 1);
});
