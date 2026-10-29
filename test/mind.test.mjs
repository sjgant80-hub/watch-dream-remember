import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRONG, genesOf, idOf, etaOf, cellsOf, cellKey, inCell, fuse, bornOf, better } from '../src/mind.mjs';
import { prepare } from '../src/lab.mjs';

function synth(seed, n = 1400) {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const features = ['a', 'b', 'c', 'd', 'e', 'f'];
  const cols = Object.fromEntries(features.map((f) => [f, new Float64Array(n)]));
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (const f of features) cols[f][i] = r() * 10;
    y[i] = r() < 1 / (1 + Math.exp(-(0.6 * cols.a[i] - 0.4 * cols.b[i] + 0.2 * cols.c[i] - 1))) ? 1 : 0;
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  return { name: 'syn', title: 'syn', outcome: 'won', features, cols, y, fitRows: idx.slice(0, 1000), gateRows: idx.slice(1000, 1200), testRows: idx.slice(1200) };
}
const lab = prepare({ syn: synth(3) });
const L = lab.syn;
const raw = (fs) => fs.map((f) => ({ op: 'raw', f }));

test('genesOf fits on the given FIT positions; idOf is the genome hash', () => {
  const g = genesOf(L, raw(['a', 'b']), 0, 400);
  assert.equal(g.dataset, 'syn');
  assert.equal(g.beta.length, 3);
  assert.ok(g.beta[1] > 0 && g.beta[2] < 0);
  const h = genesOf(L, raw(['a', 'b']), 400, 800);
  assert.notDeepEqual(g.beta, h.beta);
  assert.match(idOf(g), /^[0-9a-f]{64}$/);
  assert.equal(idOf(g), idOf(genesOf(L, raw(['a', 'b']), 0, 400)));
  assert.notEqual(idOf(g), idOf(h));
  assert.notEqual(idOf(g), idOf({ ...g, dataset: 'other' }));
  assert.notEqual(idOf(g), idOf({ ...g, specs: raw(['b', 'a']) }));
  assert.equal(genesOf(L, raw(['a']), 5, 5).beta.length, 2);
});

test('etaOf: the linear predictor on chosen positions of a set', () => {
  const g = genesOf(L, raw(['a']), 0, 400);
  const e = etaOf(L, g, 'test', [0, 5]);
  assert.equal(e.length, 2);
  const one = etaOf(L, g, 'test', [5]);
  assert.equal(one[0], e[1]);
  assert.deepEqual(Array.from(etaOf(L, { ...g, specs: [], beta: [0.5] }, 'gate', [1, 2])), [0.5, 0.5]);
});

test('cellsOf: 4 strongest raw features, 6 pairs × 4 quadrants', () => {
  const g = { specs: [...raw(['a', 'b', 'c', 'd', 'e']), { op: 'log', f: 'f' }], beta: [0, 5, -4, 3, 2, 1, 99] };
  const cells = cellsOf(g);
  assert.equal(STRONG, 4);
  assert.equal(cells.length, 24);
  assert.deepEqual(cells[0], { f: 'a', a: 0, g: 'b', b: 0 });
  assert.deepEqual(cells[3], { f: 'a', a: 1, g: 'b', b: 1 });
  assert.ok(cells.every((c) => ['a', 'b', 'c', 'd'].includes(c.f) && ['a', 'b', 'c', 'd'].includes(c.g)));
  assert.equal(cellsOf({ specs: raw(['a', 'b']), beta: [0, 1, 1] }).length, 4);
  assert.deepEqual(cellsOf({ specs: raw(['x', 'y', 'z']), beta: [0, 1, 1, 1] })[0], { f: 'x', a: 0, g: 'y', b: 0 });
  assert.equal(cellKey({ f: 'a', a: 1, g: 'b', b: 0 }), 'a>1|b>0');
});

test('inCell: quadrant by FIT medians', () => {
  const pos = 3, row = L.sets.test[pos];
  const above = (f) => (L.ds.cols[f][row] > L.stats[f].q[0.5] ? 1 : 0);
  const c = { f: 'a', a: above('a'), g: 'b', b: above('b') };
  assert.equal(inCell(L, c, 'test', pos), true);
  assert.equal(inCell(L, { ...c, a: 1 - c.a }, 'test', pos), false);
  assert.equal(inCell(L, { ...c, b: 1 - c.b }, 'test', pos), false);
});

test('fuse: the union refitted on both founder sets, born only if it beats both parents on GATE', () => {
  const A = genesOf(L, raw(['a', 'c', 'e']), 0, 400), B = genesOf(L, raw(['b', 'd', 'f']), 400, 800);
  const z = fuse(L, A, B);
  assert.equal(z.born, true);
  assert.deepEqual(z.genes.specs.map((s) => s.f), ['a', 'c', 'e', 'b', 'd', 'f']);
  assert.ok(z.gate.child < z.gate.a && z.gate.child < z.gate.b);
  const same = fuse(L, A, A);
  assert.equal(same.born, false);
  assert.equal(same.genes, A);
  const weak = genesOf(L, raw(['f']), 0, 400);
  const nb = fuse(L, A, weak);
  if (!nb.born) assert.equal(nb.genes, nb.gate.a <= nb.gate.b ? A : weak);
  const tie = fuse(L, weak, A);
  assert.ok(tie.genes === A || tie.born);
});

test('bornOf: strictly better than BOTH parents; better: the lower GATE, A on a tie', () => {
  assert.equal(bornOf({ child: 1, a: 2, b: 3 }), true);
  assert.equal(bornOf({ child: 2, a: 2, b: 3 }), false);
  assert.equal(bornOf({ child: 3, a: 4, b: 3 }), false);
  assert.equal(bornOf({ child: 2, a: 1, b: 3 }), false);
  assert.equal(bornOf({ child: 2, a: 3, b: 1 }), false);
  const A = { n: 'A' }, B = { n: 'B' };
  assert.equal(better({ a: 1, b: 2 }, A, B), A);
  assert.equal(better({ a: 2, b: 1 }, A, B), B);
  assert.equal(better({ a: 2, b: 2 }, A, B), A);
});

test('cellsOf ranks by weight, not by position; inCell puts a value AT the median below it', () => {
  const g = { specs: raw(['a', 'b', 'c', 'd', 'e']), beta: [0, 1, 2, 3, 4, 5] };
  assert.deepEqual([...new Set(cellsOf(g).flatMap((c) => [c.f, c.g]))].sort(), ['b', 'c', 'd', 'e']);
  assert.deepEqual(cellsOf(g)[0], { f: 'e', a: 0, g: 'd', b: 0 });
  const tie = { specs: raw(['a', 'b', 'c', 'd', 'e']), beta: [0, 1, 1, 1, 1, 1] };
  assert.deepEqual(cellsOf(tie)[0], { f: 'a', a: 0, g: 'b', b: 0 });
  const pos = L.sets.test.findIndex(() => true);
  const row = L.sets.test[pos];
  const L2 = { ...L, stats: { ...L.stats, a: { ...L.stats.a, q: { ...L.stats.a.q, 0.5: L.ds.cols.a[row] } }, b: { ...L.stats.b, q: { ...L.stats.b.q, 0.5: L.ds.cols.b[row] } } } };
  assert.equal(inCell(L2, { f: 'a', a: 0, g: 'b', b: 0 }, 'test', pos), true);
  assert.equal(inCell(L2, { f: 'a', a: 1, g: 'b', b: 1 }, 'test', pos), false);
});
