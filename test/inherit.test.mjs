import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, MODES, priorOf, ownLessons, earlyLife } from '../src/inherit.mjs';
import { relive, live, sliceOf, isVerified, loss, shiftOf, founderIn, MIN_LATER } from '../src/memory.mjs';
import { genesOf, etaOf, cellsOf, cellKey } from '../src/mind.mjs';
import { prepare } from '../src/lab.mjs';

// rows 0–2,999 FIT, 3,000–3,099 GATE, 3,100–4,599 TEST; from TEST position 600 on, the segment's effect flips (a drift)
function synth(seed, n = 4600, flipAt = 3700) {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const features = ['a', 'b', 'c', 'seg'];
  const cols = Object.fromEntries(features.map((f) => [f, new Float64Array(n)]));
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (const f of ['a', 'b', 'c']) cols[f][i] = r() * 10;
    cols.seg[i] = r() < 0.5 ? 0 : 1;
    const k = (cols.seg[i] ? 1.5 : -1.5) * (i >= flipAt ? -1 : 1);
    y[i] = r() < 1 / (1 + Math.exp(-(0.5 * cols.a[i] - 2.5 + k * (cols.b[i] > 5 ? 1 : 0)))) ? 1 : 0;
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  return { name: 'syn', title: 'syn', outcome: 'won', features, cols, y, fitRows: idx.slice(0, 3000), gateRows: idx.slice(3000, 3100), testRows: idx.slice(3100) };
}
const L = prepare({ syn: synth(7) }).syn;
const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
const genes = genesOf(L, ['a', 'b', 'c'].map((f) => ({ op: 'raw', f })), 0, 400);
const founder = range(0, 400);
const ctx = { f: 'seg', side: 1 };
const segPos = range(400, 3000).filter((p) => L.ds.cols.seg[L.sets.fit[p]] === 1);
const parent = live(L, genes, 'p', founder, [0, 1, 2, 3, 4].map((k) => segPos.slice(k * 200, k * 200 + 200)), (p) => 'c' + p, (p) => 's' + p, ctx);
const slice = sliceOf(parent);
const early = range(0, 1500);

test('BATCH is organ 3’s batch size', () => assert.equal(BATCH, 200));

test('ownLessons: Laplace rates over the child’s cells, in no context, on any row set; no episode, no lesson', () => {
  const cells = cellsOf(genes);
  const eps = range(0, 300).map((p) => ({ pos: p, outcome: L.y.test[p] }));
  const out = ownLessons(L, cells, eps, 'test');
  for (const [k, l] of Object.entries(out)) {
    assert.equal(k, cellKey(l.cell));
    assert.equal(l.context, null);
    const inside = eps.filter((e) => cells.find((c) => cellKey(c) === k) && (L.ds.cols[l.cell.f][L.sets.test[e.pos]] > L.stats[l.cell.f].q[0.5] ? 1 : 0) === l.cell.a && (L.ds.cols[l.cell.g][L.sets.test[e.pos]] > L.stats[l.cell.g].q[0.5] ? 1 : 0) === l.cell.b);
    assert.equal(l.n, inside.length);
    assert.equal(l.rate, (inside.reduce((a, e) => a + e.outcome, 0) + 1) / (inside.length + 2));
  }
  assert.ok(Object.keys(out).length > 0);
  assert.deepEqual(ownLessons(L, cells, [], 'test'), {});
});

test('with no slice the early life IS the parents’ cycle: equal to relive, outcome for outcome, lesson for lesson', () => {
  const pos = segPos.slice(0, 1000);
  const a = earlyLife(L, genes, founder, 'fit', pos, []);
  const eps = pos.map((p, i) => ({ pos: p, batch: Math.floor(i / 200), outcome: L.y.fit[p] }));
  const b = relive(L, genes, founder, eps, null);
  assert.deepEqual(a.history.filter((h) => h.kind === 'outcome').map(({ kind, ...o }) => o), b.outcomes);
  assert.deepEqual(a.lessons, b.lessons);
  assert.deepEqual(a.history.filter((h) => h.kind === 'lesson'), Object.values(b.lessons).filter((l) => l.verified).map((l) => ({ kind: 'lesson', cell: l.cell, rate: l.rate, n: l.n, gain: l.gain })));
  assert.equal(a.history.length, 5 + Object.values(b.lessons).filter((l) => l.verified).length);
});

test('the first batch runs on the genes alone; every prediction is made before its outcome is read', () => {
  const a = earlyLife(L, genes, founder, 'test', early, slice);
  assert.equal(a.eta.length, early.length);
  assert.deepEqual(Array.from(a.eta.slice(0, BATCH)), Array.from(etaOf(L, genes, 'test', early.slice(0, BATCH))));
  // flip one outcome in the third batch: nothing up to and including that batch may change
  const L2 = { ...L, y: { ...L.y, test: Uint8Array.from(L.y.test) } };
  L2.y.test[450] = 1 - L2.y.test[450];
  const b = earlyLife(L2, genes, founder, 'test', early, slice);
  assert.deepEqual(Array.from(b.eta.slice(0, 600)), Array.from(a.eta.slice(0, 600)));
  assert.notDeepEqual(Array.from(b.eta), Array.from(a.eta));
});

test('a helpful inherited lesson is adopted once 30 of the child’s cases have tested it, and used from the next batch; a harmful one never is', () => {
  const good = slice[3];
  const bad = { ...good, rate: 1 - good.rate, lineage: ['q'] };
  const a = earlyLife(L, genes, founder, 'test', early.slice(0, 600), [good, bad]);
  const adopted = a.history.filter((h) => h.kind === 'adopted');
  assert.equal(adopted.length, 1);
  assert.deepEqual(adopted[0].lineage, ['p']);
  assert.ok(adopted[0].gain > 0 && adopted[0].later >= MIN_LATER);
  assert.ok(a.inherited[0].here.verified && !a.inherited[1].here.verified);
  assert.ok(a.inherited[1].here.gain < 0);
  assert.equal(a.inherited[0].here.later, a.inherited[1].here.later);   // the same cell and context: the same cases
  // its record: exactly these fields, never a case
  assert.deepEqual(Object.keys(adopted[0]).sort(), ['batch', 'cell', 'context', 'gain', 'kind', 'later', 'lineage']);
  assert.deepEqual(adopted[0].context, good.context);
  // up to the batch it is adopted in, the child predicts as if it had inherited nothing; from the next, its shift is used
  const plain = earlyLife(L, genes, founder, 'test', early.slice(0, 600), []);
  const k = (adopted[0].batch + 1) * BATCH;
  assert.deepEqual(Array.from(a.eta.slice(0, k)), Array.from(plain.eta.slice(0, k)));
  assert.notDeepEqual(Array.from(a.eta.slice(k)), Array.from(plain.eta.slice(k)));
});

test('a lesson that stops holding is dropped (the drift at TEST position 600)', () => {
  const a = earlyLife(L, genes, founder, 'test', early, slice);
  const kinds = a.history.filter((h) => h.kind === 'adopted' || h.kind === 'dropped');
  const dropped = kinds.filter((h) => h.kind === 'dropped');
  assert.ok(dropped.length >= 1);
  for (const d of dropped) {
    assert.ok(d.batch >= 3);
    assert.ok(kinds.some((h) => h.kind === 'adopted' && cellKey(h.cell) === cellKey(d.cell) && h.batch < d.batch));
    assert.ok(!(d.gain > 0 && d.later >= MIN_LATER));
  }
  for (const x of a.inherited) assert.equal(x.here.verified, isVerified(x.here));
  assert.deepEqual(a.inherited.map((x) => x.lesson), slice);   // the slice itself is never rewritten
});

test('the gains are the losses saved, case by case, on the cases in the lesson’s cell and context', () => {
  const one = slice[3];
  const pos = early.slice(0, BATCH);
  const a = earlyLife(L, genes, founder, 'test', pos, [one]);
  const eta = etaOf(L, genes, 'test', pos);
  const sh = shiftOf(one, founderIn(L, genes, founder, one.cell, one.context));
  const above = (f, p) => (L.ds.cols[f][L.sets.test[p]] > L.stats[f].q[0.5] ? 1 : 0);
  let g = 0, n = 0;
  pos.forEach((p, j) => { if (above('seg', p) === one.context.side && above(one.cell.f, p) === one.cell.a && above(one.cell.g, p) === one.cell.b) { n++; g += loss(eta[j], L.y.test[p]) - loss(eta[j] + sh, L.y.test[p]); } });
  assert.ok(n > 0);
  assert.equal(a.inherited[0].here.later, n);
  assert.equal(a.inherited[0].here.gain, g);
});

test('an inherited lesson the child cannot apply (too few cases behind it) is never tracked or used', () => {
  const thin = { ...slice[0], n: 5 };
  const a = earlyLife(L, genes, founder, 'test', early.slice(0, 600), [thin]);
  assert.deepEqual(a.inherited[0].here, { gain: 0, later: 0, verified: false, usable: false });
  assert.deepEqual(Array.from(a.eta), Array.from(earlyLife(L, genes, founder, 'test', early.slice(0, 600), []).eta));
  assert.equal(a.history.filter((h) => h.kind === 'adopted' || h.kind === 'dropped').length, 0);
  assert.equal(earlyLife(L, genes, founder, 'test', early.slice(0, 600), [slice[0]]).inherited[0].here.usable, true);
});

test('episodes: the child’s own rows, batch by batch; outcomes count every case', () => {
  const a = earlyLife(L, genes, founder, 'test', early.slice(0, 450), []);
  assert.equal(a.episodes.length, 450);
  assert.deepEqual(a.episodes[0], { id: `syn:test:${L.sets.test[0]}`, pos: 0, batch: 0, values: L.features.map((f) => L.ds.cols[f][L.sets.test[0]]), outcome: L.y.test[0] });
  assert.deepEqual([a.episodes[199].batch, a.episodes[200].batch, a.episodes[449].batch], [0, 1, 2]);
  assert.deepEqual(a.history.filter((h) => h.kind === 'outcome').map((h) => [h.batch, h.n]), [[0, 200], [1, 200], [2, 50]]);
});

test('garbage in: no positions, no slice', () => {
  const a = earlyLife(L, genes, founder, 'test', null, null);
  assert.deepEqual([a.eta.length, a.history.length, a.episodes.length, a.inherited.length], [0, 0, 0, 0]);
  assert.deepEqual(a.lessons, {});
  const b = earlyLife(L, genes, founder, 'test', early.slice(0, 10), 'x');
  assert.equal(b.inherited.length, 0);
  assert.equal(b.eta.length, 10);
});

// ── organ 3c: trust from birth, checked case by case ──
test('MODES and priorOf: the parent’s record worth 30 of the child’s cases', () => {
  assert.deepEqual(MODES, ['prove', 'trust']);
  assert.ok(Object.isFrozen(MODES));
  assert.equal(priorOf({ n: 100, gain: 5 }), 30 * 0.05);
  assert.equal(priorOf({ n: 100, gain: -5 }), -1.5);
  assert.equal(priorOf({ n: 0, gain: 5 }), 0);
  assert.equal(priorOf({ n: 100, gain: NaN }), 0);
  assert.equal(priorOf(null), 0);
});

test('trust: with no slice, the same life as prove', () => {
  const pos = early.slice(0, 600);
  assert.deepEqual(earlyLife(L, genes, founder, 'test', pos, [], 'trust'), earlyLife(L, genes, founder, 'test', pos, []));
});

test('trust: used from birth, exactly while prior + its gain over the cases before > 0', () => {
  const one = slice[3], pos = early.slice(0, BATCH);
  const a = earlyLife(L, genes, founder, 'test', pos, [one], 'trust');
  const eta = etaOf(L, genes, 'test', pos);
  const sh = shiftOf(one, founderIn(L, genes, founder, one.cell, one.context));
  const above = (f, p) => (L.ds.cols[f][L.sets.test[p]] > L.stats[f].q[0.5] ? 1 : 0);
  const prior = priorOf(one);
  let g = 0, n = 0;
  const want = pos.map((p, j) => {
    const hit = above('seg', p) === one.context.side && above(one.cell.f, p) === one.cell.a && above(one.cell.g, p) === one.cell.b;
    const e = hit && prior + g > 0 ? eta[j] + sh : eta[j];
    if (hit) { g += loss(eta[j], L.y.test[p]) - loss(eta[j] + sh, L.y.test[p]); n++; }
    return e;
  });
  assert.deepEqual(Array.from(a.eta), want);
  assert.deepEqual(a.inherited[0].here, { gain: g, later: n, verified: g > 0 && n >= MIN_LATER, usable: true, prior, inUse: prior + g > 0 });
  assert.deepEqual(a.history[0], { kind: 'adopted', batch: -1, cell: one.cell, context: one.context, lineage: ['p'], gain: 0, later: 0 });
  assert.ok(prior > 0);
});

test('trust: a lesson that hurts is dropped the moment the child’s evidence outweighs its parent’s; prove mode carries no prior', () => {
  const bad = { ...slice[3], rate: 1 - slice[3].rate, lineage: ['q'] };
  const a = earlyLife(L, genes, founder, 'test', early.slice(0, 600), [bad], 'trust');
  const drops = a.history.filter((h) => h.kind === 'dropped');
  assert.ok(drops.length >= 1);
  assert.equal(drops[0].batch, 0);
  assert.ok(drops[0].gain + priorOf(bad) <= 0);
  assert.ok(drops[0].later < 60);
  assert.deepEqual(Object.keys(drops[0]).sort(), ['batch', 'cell', 'context', 'gain', 'kind', 'later', 'lineage']);
  assert.equal(a.inherited[0].here.inUse, false);
  const p = earlyLife(L, genes, founder, 'test', early.slice(0, 600), [bad]);
  assert.ok(!('prior' in p.inherited[0].here) && !('inUse' in p.inherited[0].here));
});

test('trust: a lesson with no record behind it waits for the child’s own evidence; one the child cannot apply is never used', () => {
  const blank = { ...slice[3], gain: 0 };
  const a = earlyLife(L, genes, founder, 'test', early.slice(0, 600), [blank], 'trust');
  assert.equal(a.history.filter((h) => h.kind === 'adopted' && h.batch === -1).length, 0);
  assert.deepEqual(Array.from(a.eta.slice(0, 1)), Array.from(etaOf(L, genes, 'test', [0])));
  const later = a.history.find((h) => h.kind === 'adopted');
  if (later) assert.ok(later.batch >= 0 && later.gain > 0);
  const thin = { ...slice[3], n: 5 };
  const t = earlyLife(L, genes, founder, 'test', early.slice(0, 600), [thin], 'trust');
  assert.equal(t.history.filter((h) => h.kind === 'adopted' || h.kind === 'dropped').length, 0);
  assert.deepEqual(t.inherited[0].here, { gain: 0, later: 0, verified: false, usable: false, prior: priorOf(thin), inUse: false });
  assert.deepEqual(Array.from(t.eta), Array.from(earlyLife(L, genes, founder, 'test', early.slice(0, 600), [], 'trust').eta));
});
