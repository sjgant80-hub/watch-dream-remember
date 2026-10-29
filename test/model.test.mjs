import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPS, QS, LAMBDA, MAX_STEPS, TOL, keyOf, quantileOf, statsOf, valueOf, columnOf, linear, solve, fit, logLoss, baseEntropy, absCorr, shapeOf, shapeGap } from '../src/model.mjs';

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);

test('constants', () => {
  assert.deepEqual(OPS, ['raw', 'log', 'sq', 'step', 'cross']);
  assert.deepEqual(QS, [0.25, 0.5, 0.75, 0.9]);
  assert.deepEqual([LAMBDA, MAX_STEPS, TOL], [1, 10, 1e-9]);
});

test('keyOf: canonical, cross ordered, malformed → empty', () => {
  assert.equal(keyOf({ op: 'raw', f: 'a' }), 'raw(a)');
  assert.equal(keyOf({ op: 'log', f: 'a' }), 'log(a)');
  assert.equal(keyOf({ op: 'sq', f: 'a' }), 'sq(a)');
  assert.equal(keyOf({ op: 'step', f: 'a', q: 0.75 }), 'step(a,0.75)');
  assert.equal(keyOf({ op: 'cross', f: 'b', g: 'a' }), 'cross(a,b)');
  assert.equal(keyOf({ op: 'cross', f: 'a', g: 'b' }), 'cross(a,b)');
  for (const bad of [{ op: 'step', f: 'a', q: 0.3 }, { op: 'cross', f: 'a', g: 'a' }, { op: 'cross', f: 'a' }, { op: 'log', f: '' }, { op: 'log', f: 3 }, { op: 'pow', f: 'a' }, null, undefined])
    assert.equal(keyOf(bad), '', JSON.stringify(bad));
});

test('quantileOf and statsOf (constant columns exactly)', () => {
  assert.equal(quantileOf([5, 1, 3], 0.5), 3);
  assert.equal(quantileOf([5, 1, 3, 2, 4], 0.25), 2);
  assert.equal(quantileOf([], 0.5), 0);
  const col = Float64Array.from([2, 4, 4, 4, 5, 5, 7, 9]);
  const s = statsOf(col, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(s.mean, 5);
  assert.equal(s.sd, 2);
  assert.deepEqual(s.q, { 0.25: 4, 0.5: 5, 0.75: 5, 0.9: 7 });   // nearest rank on 7·q: 1.75→2, 3.5→4, 5.25→5, 6.3→6
  const c = statsOf(Float64Array.from([3, 3, 3]), [0, 1, 2]);
  assert.equal(c.sd, 0);
  assert.equal(c.mean, 3);
  assert.deepEqual(statsOf(Float64Array.from([1]), []), { mean: 0, sd: 0, q: { 0.25: 0, 0.5: 0, 0.75: 0, 0.9: 0 } });
  assert.equal(statsOf(col, [6, 7]).mean, 8);
});

const ds = { cols: { a: Float64Array.from([-3, 0, 2, 4]), b: Float64Array.from([1, 1, 2, 4]) } };
const stats = { a: { mean: 1, sd: 2, q: { 0.25: 0, 0.5: 1, 0.75: 2, 0.9: 4 } }, b: { mean: 2, sd: 1, q: { 0.5: 1.5 } }, z: { mean: 0, sd: 0, q: {} } };

test('valueOf: each op on one row', () => {
  assert.equal(valueOf({ op: 'raw', f: 'a' }, ds, stats, 0), -3);
  close(valueOf({ op: 'log', f: 'a' }, ds, stats, 0), -Math.log1p(3));
  close(valueOf({ op: 'log', f: 'a' }, ds, stats, 3), Math.log1p(4));
  assert.equal(valueOf({ op: 'log', f: 'a' }, ds, stats, 1), 0);
  assert.equal(valueOf({ op: 'sq', f: 'a' }, ds, stats, 0), 4);
  assert.equal(valueOf({ op: 'step', f: 'a', q: 0.75 }, ds, stats, 2), 0);
  assert.equal(valueOf({ op: 'step', f: 'a', q: 0.75 }, ds, stats, 3), 1);
  assert.equal(valueOf({ op: 'cross', f: 'a', g: 'b' }, ds, stats, 3), 1.5 * 2);
  assert.equal(valueOf({ op: 'nope', f: 'a' }, ds, stats, 3), 0);
  assert.equal(valueOf({ op: 'sq', f: 'z' }, { cols: { z: Float64Array.from([9]) } }, stats, 0), 0);
});

test('columnOf: standardised by FIT; constant FIT column is all zeros', () => {
  const c = columnOf({ op: 'raw', f: 'a' }, ds, stats, { fit: [0, 1, 2, 3], gate: [3] });
  close(c.sd, Math.sqrt(((-3 - 0.75) ** 2 + 0.75 ** 2 + 1.25 ** 2 + 3.25 ** 2) / 4));
  close(c.fit.reduce((s, v) => s + v, 0), 0);
  close(c.gate[0], (4 - 0.75) / c.sd);
  const k = columnOf({ op: 'raw', f: 'b' }, ds, stats, { fit: [0, 1], test: [3] });
  assert.equal(k.sd, 0);
  assert.deepEqual(Array.from(k.fit), [0, 0]);
  assert.deepEqual(Array.from(k.test), [0]);
});

test('linear, solve, logLoss, baseEntropy, absCorr', () => {
  assert.deepEqual(Array.from(linear(Float64Array.from([1, 2, -1]), [Float64Array.from([1, 0]), Float64Array.from([3, 1])], 2)), [0, 0]);
  const x = solve(Float64Array.from([4, 2, 2, 3]), Float64Array.from([2, 5]));
  close(x[0], -0.5); close(x[1], 2);
  assert.equal(solve(Float64Array.from([0, 0, 0, 0]), Float64Array.from([1, 1])), null);
  assert.equal(solve(Float64Array.from([1, 2, 2, 1]), Float64Array.from([1, 1])), null);
  close(logLoss(Float64Array.from([0, 0]), Uint8Array.from([1, 0])), Math.log(2));
  close(logLoss(Float64Array.from([1000]), Uint8Array.from([0])), -Math.log(1e-12), 1e-4);   // 1 − (1 − 1e-12) is not exactly 1e-12 in doubles
  close(logLoss(Float64Array.from([-1000]), Uint8Array.from([0])), 0, 1e-11);
  assert.equal(logLoss(new Float64Array(0), new Uint8Array(0)), 0);
  close(baseEntropy(Uint8Array.from([1, 0, 0, 0])), -(0.25 * Math.log(0.25) + 0.75 * Math.log(0.75)));
  assert.equal(baseEntropy(Uint8Array.from([1, 1])), 0);
  assert.equal(baseEntropy(Uint8Array.from([0, 0])), 0);
  assert.equal(baseEntropy(new Uint8Array(0)), 0);
  close(absCorr([1, 2, 3], [3, 2, 1]), 1);
  close(absCorr([1, 2, 3, 4], [1, 3, 2, 4]), 0.8);
  assert.equal(absCorr([1, 1, 1], [1, 2, 3]), 0);
  assert.equal(absCorr([], []), 0);
});

test('fit: recovers a clear signal, warm start converges in fewer steps, ridge keeps it finite on separable data', () => {
  const n = 400, a = new Float64Array(n), y = new Uint8Array(n);
  let s = 1;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { a[i] = r() * 4 - 2; y[i] = r() < 1 / (1 + Math.exp(-(0.5 + 2 * a[i]))) ? 1 : 0; }
  const m = fit([a], y);
  assert.ok(m.beta[1] > 1.2 && m.beta[1] < 3, String(m.beta[1]));
  assert.ok(m.steps >= 3 && m.steps <= 10);
  const w = fit([a], y, m.beta);
  assert.ok(w.steps <= 2, String(w.steps));
  close(w.beta[1], m.beta[1], 1e-6);
  const sep = Float64Array.from([-1, -1, 1, 1]), ys = Uint8Array.from([0, 0, 1, 1]);
  const f = fit([sep], ys);
  assert.ok(Number.isFinite(f.beta[1]) && f.beta[1] > 0);
  assert.equal(fit([], Uint8Array.from([1, 0])).beta.length, 1);
  close(fit([], Uint8Array.from([1, 0, 0, 0])).beta[0], Math.log(1 / 3), 1e-6);
  const short = fit([a], y, [m.beta[0]]);
  close(short.beta[1], m.beta[1], 1e-6);
});

test('shapeOf and shapeGap', () => {
  const sh = shapeOf(Float64Array.from([0, 0, 0, 1, 10]), [0, 1, 2, 3, 4]);
  assert.equal(sh.zeros, 0.6);
  assert.equal(sh.kind, 1);
  assert.ok(sh.skew > 1);
  assert.equal(shapeOf(Float64Array.from([1, 0]), [0, 1]).kind, 0);
  assert.equal(shapeOf(Float64Array.from({ length: 50 }, (_, i) => i), Array.from({ length: 50 }, (_, i) => i)).kind, 2);
  assert.equal(shapeOf(Float64Array.from({ length: 200 }, (_, i) => i), Array.from({ length: 200 }, (_, i) => i)).kind, 3);
  assert.equal(shapeOf(Float64Array.from([5, 5]), [0, 1]).skew, 0);
  assert.equal(shapeOf(Float64Array.from([]), []).zeros, 0);
  assert.equal(shapeGap({ skew: 2, zeros: 0.5, kind: 1 }, { skew: 2, zeros: 0.5, kind: 1 }), 0);
  close(shapeGap({ skew: 1, zeros: 0.2, kind: 1 }, { skew: 3, zeros: 0.5, kind: 2 }), 2 / 2 + 0.3 + 1);
});
