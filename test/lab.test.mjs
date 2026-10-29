import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, fitOrgan, startSpecs, score, column, fitResiduals, weakness, ROWS } from '../src/lab.mjs';
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

test('ROWS', () => assert.deepEqual(ROWS, { fit: 6000, gate: 4000, test: 6000 }));

test('lab: rows, columns cached, scores, residuals, weakness', () => {
  assert.equal(lab.m.sets.fit.length, 800);
  assert.equal(lab.m.sets.gate.length, 350);
  const c1 = column(lab.m, { op: 'log', f: 'money' });
  assert.equal(column(lab.m, { op: 'log', f: 'money' }), c1);
  assert.equal(c1.test.length, 350);
  const o = fitOrgan(lab.m, startSpecs(lab.m));
  assert.deepEqual(o.specs.map(keyOf), ['raw(money)', 'raw(flag)', 'raw(noise)']);
  assert.ok(score(lab.m, o, 'fit') < score(lab.m, { specs: [], beta: Float64Array.from([0]) }, 'fit'));
  const { p, r } = fitResiduals(lab.m, o);
  assert.equal(p.length, 800);
  assert.ok(Math.abs(r[0] - (lab.m.y.fit[0] - p[0])) < 1e-12);
  const w = weakness(lab.m, o);
  assert.ok(w > 0 && w < 1);
  assert.equal(weakness({ ...lab.m, y: { fit: Uint8Array.from([1, 1]) } }, { specs: [], beta: [0] }), 1);
});


test('prepare keeps the sealed row counts, labels per set and FIT shapes', () => {
  const big = prepare({ b: { ...synth(3, 20000), fitRows: Array.from({ length: 9000 }, (_, i) => i), gateRows: Array.from({ length: 5000 }, (_, i) => 9000 + i), testRows: Array.from({ length: 6000 }, (_, i) => 14000 + i) } });
  assert.equal(big.b.sets.fit.length, 6000);
  assert.equal(big.b.sets.gate.length, 4000);
  assert.equal(big.b.sets.test.length, 6000);
  assert.equal(big.b.y.gate.length, 4000);
  assert.equal(big.b.y.fit[5], big.b.ds.y[5]);
  assert.equal(big.b.title, 'money');
  assert.equal(big.b.outcome, 'won');
  assert.ok('money' in big.b.shapes && 'money' in big.b.stats);
  assert.deepEqual(prepare(null), {});
});
