import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { MIN_N, MIN_FOUNDER, SHRINK, MIN_LATER, SLICE, hmac, isVerified, loss, episodeOf, inContext, founderIn, shiftOf, etaWith, lessonsFrom, relive, live, verified, forget, sliceOf, newborn, lightOf } from '../src/memory.mjs';
import { genesOf, etaOf, cellsOf } from '../src/mind.mjs';
import { prepare } from '../src/lab.mjs';
import { decode } from '../vendor/fall-kit/core/vendor/light/codec.mjs';

function synth(seed, n = 3200) {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const features = ['a', 'b', 'c', 'seg'];
  const cols = Object.fromEntries(features.map((f) => [f, new Float64Array(n)]));
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (const f of ['a', 'b', 'c']) cols[f][i] = r() * 10;
    cols.seg[i] = r() < 0.5 ? 0 : 1;
    // the segment flips how b matters: a model that ignores it is miscalibrated inside each segment
    y[i] = r() < 1 / (1 + Math.exp(-(0.5 * cols.a[i] - 2.5 + (cols.seg[i] ? 1.5 : -1.5) * (cols.b[i] > 5 ? 1 : 0)))) ? 1 : 0;
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  return { name: 'syn', title: 'syn', outcome: 'won', features, cols, y, fitRows: idx.slice(0, 3000), gateRows: idx.slice(3000, 3100), testRows: idx.slice(3100) };
}
const lab = prepare({ syn: synth(7) });
const L = lab.syn;
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const genes = genesOf(L, ['a', 'b', 'c'].map((f) => ({ op: 'raw', f })), 0, 400);
const founder = range(0, 400);
const ctx = { f: 'seg', side: 1 };
const segPos = range(400, 3000).filter((p) => L.ds.cols.seg[L.sets.fit[p]] === 1);
const batches = [0, 1, 2, 3, 4].map((k) => segPos.slice(k * 200, k * 200 + 200));
const can = (p) => 'c' + String(p).padStart(11, '0');
const salt = (p) => 's' + String(p * 7919).padStart(15, '0');
const mind = live(L, genes, 'mind-1', founder, batches, can, salt, ctx);

test('constants and HMAC-SHA-256 (RFC 4231 test case 2)', () => {
  assert.deepEqual([MIN_N, MIN_FOUNDER, SHRINK, MIN_LATER, SLICE], [20, 5, 50, 30, 8]);
  assert.equal(hmac('Jefe', 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  assert.equal(hmac('k'.repeat(100), 'x').length, 64);
  assert.notEqual(hmac('k'.repeat(100), 'x'), hmac('k'.repeat(99), 'x'));
  assert.notEqual(hmac('a', 'm'), hmac('b', 'm'));
});

test('episodeOf: values, outcome, note, salt, ref — the personal content lives here only', () => {
  const e = episodeOf(L, 5, 2, 'CANARY', 'SALT', 'm');
  const row = L.sets.fit[5];
  assert.equal(e.id, `syn:${row}`);
  assert.deepEqual(e.values, L.features.map((f) => L.ds.cols[f][row]));
  assert.equal(e.outcome, L.y.fit[5]);
  assert.equal(e.note, `note syn:${row} CANARY`);
  assert.equal(e.ref, hmac('SALT', row));
  assert.deepEqual([e.batch, e.salt, e.mind, e.pos], [2, 'SALT', 'm', 5]);
});

test('inContext and founderIn', () => {
  const p = segPos[0];
  assert.equal(inContext(L, ctx, 'fit', p), true);
  assert.equal(inContext(L, { f: 'seg', side: 0 }, 'fit', p), false);
  assert.equal(inContext(L, null, 'fit', p), true);
  const cell = cellsOf(genes)[0];
  const fin = founderIn(L, genes, founder, cell, ctx);
  const pos = founder.filter((q) => inContext(L, ctx, 'fit', q) && (L.ds.cols[cell.f][L.sets.fit[q]] > L.stats[cell.f].q[0.5] ? 1 : 0) === cell.a && (L.ds.cols[cell.g][L.sets.fit[q]] > L.stats[cell.g].q[0.5] ? 1 : 0) === cell.b);
  assert.equal(fin.n, pos.length);
  const eta = etaOf(L, genes, 'fit', pos);
  assert.ok(Math.abs(fin.mean - eta.reduce((a, e) => a + 1 / (1 + Math.exp(-e)), 0) / pos.length) < 1e-12);
  assert.deepEqual(founderIn(L, genes, [], cell, ctx), { n: 0, mean: 0 });
});

test('shiftOf: shrunk logit gap, refused below the floors', () => {
  const s = shiftOf({ n: 50, rate: 0.5 }, { n: 10, mean: 0.25 });
  assert.ok(Math.abs(s - 0.5 * (0 - Math.log(1 / 3))) < 1e-12);
  assert.equal(shiftOf({ n: 19, rate: 0.5 }, { n: 10, mean: 0.25 }), null);
  assert.ok(shiftOf({ n: 20, rate: 0.5 }, { n: 5, mean: 0.25 }) !== null);
  assert.equal(shiftOf({ n: 20, rate: 0.5 }, { n: 4, mean: 0.25 }), null);
  assert.equal(shiftOf({ n: 20, rate: 0.5 }, { n: 9, mean: 0 }), null);
  assert.equal(shiftOf({ n: 20, rate: 0.5 }, { n: 9, mean: 1 }), null);
  assert.equal(shiftOf(null, { n: 9, mean: 0.5 }), null);
  assert.equal(shiftOf({ n: 20, rate: 0.5 }, null), null);
});

test('lessonsFrom: rates per cell in a context; relive and live agree; only verified lessons work', () => {
  const eps = mind.episodes;
  const ls = lessonsFrom(L, cellsOf(genes), eps, ctx);
  for (const l of Object.values(ls)) { assert.deepEqual(l.context, ctx); assert.ok(l.rate > 0 && l.rate < 1); }
  const k = Object.keys(ls)[0];
  assert.equal(ls[k].n, eps.filter((e) => (L.ds.cols[ls[k].cell.f][L.sets.fit[e.pos]] > L.stats[ls[k].cell.f].q[0.5] ? 1 : 0) === ls[k].cell.a && (L.ds.cols[ls[k].cell.g][L.sets.fit[e.pos]] > L.stats[ls[k].cell.g].q[0.5] ? 1 : 0) === ls[k].cell.b).length);
  assert.equal(Object.values(lessonsFrom(L, cellsOf(genes), eps, null))[0].context, null);
  const r = relive(L, genes, founder, eps, ctx);
  assert.deepEqual(r.lessons, mind.lessons);
  assert.equal(r.outcomes.length, 5);
  assert.ok(verified(mind).length > 0, 'a segment-flipped signal leaves lessons that hold up');
  assert.ok(verified(mind).every((l) => l.gain > 0 && l.later >= MIN_LATER));
  assert.deepEqual(verified(null), []);
  assert.equal(mind.history.filter((h) => h.kind === 'outcome').length, 5);
  assert.equal(mind.history.filter((h) => h.kind === 'lesson').length, verified(mind).length);
  assert.ok(mind.history.every((h) => !JSON.stringify(h).includes('note ')));
  const last = r.outcomes[4];
  assert.ok(last.with <= last.without);
});

test('etaWith: lessons move only cases in their cell and context', () => {
  const pos = range(0, 100);
  const base = etaOf(L, genes, 'test', pos);
  const lessons = verified(mind);
  const w = etaWith(L, genes, founder, 'test', pos, lessons);
  pos.forEach((p, i) => { if (!inContext(L, ctx, 'test', p)) assert.equal(w[i], base[i]); });
  assert.ok(w.some((v, i) => v !== base[i]));
  assert.deepEqual(Array.from(etaWith(L, genes, founder, 'test', pos, [])), Array.from(base));
  assert.deepEqual(Array.from(etaWith(L, genes, founder, 'test', pos, null)), Array.from(base));
});

test('forget: the episodes, notes and salts leave; lessons re-lived; one tombstone; a fresh life agrees', () => {
  const ids = mind.episodes.slice(10, 35).map((e) => e.id);
  const gone = mind.episodes.slice(10, 35);
  const after = forget(L, genes, founder, mind, ids);
  assert.equal(after.episodes.length, mind.episodes.length - 25);
  const text = new TextDecoder().decode(decode(lightOf(after)).bytes) + JSON.stringify(after);
  for (const e of gone) { assert.ok(!text.includes(e.note)); assert.ok(!text.includes(e.salt)); assert.ok(!text.includes(e.ref)); }
  assert.deepEqual(after.history.slice(0, -1), mind.history);
  assert.deepEqual(after.history[after.history.length - 1], { kind: 'tombstone', count: 25 });
  const goneSet = new Set(ids);
  const fresh = live(L, genes, 'mind-1', founder, batches.map((b) => b.filter((p) => !goneSet.has(`syn:${L.sets.fit[p]}`))), can, salt, ctx);
  assert.deepEqual(after.lessons, fresh.lessons);
  assert.equal(forget(L, genes, founder, mind, ['nope']).history.at(-1).count, 0);
});

test('sliceOf, newborn and lightOf', () => {
  const sl = sliceOf(mind);
  assert.ok(sl.length > 0 && sl.length <= SLICE);
  for (let i = 1; i < sl.length; i++) assert.ok(sl[i - 1].gain >= sl[i].gain);
  assert.deepEqual(Object.keys(sl[0]).sort(), ['cell', 'context', 'gain', 'lineage', 'n', 'rate']);
  assert.deepEqual(sl[0].lineage, ['mind-1']);
  assert.notEqual(sl[0].cell, verified(mind)[0].cell);
  const many = { mind: 'x', lessons: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['k' + i, { cell: { f: 'a', a: i % 2, g: 'b', b: 0 }, context: null, rate: 0.5, n: 30, gain: i, verified: true }])) };
  assert.equal(sliceOf(many).length, 8);
  assert.equal(sliceOf(many)[0].gain, 11);
  assert.equal(sliceOf({ mind: 'z', lessons: { a: { cell: { f: 'a', a: 0, g: 'b', b: 0 }, context: { f: 's', side: 1 }, rate: 0.4, n: 30, gain: 1, verified: false } } }).length, 0);
  const kid = newborn('child', [sl, sliceOf(many)]);
  assert.equal(kid.inherited.length, sl.length + 8);
  assert.deepEqual(kid.episodes, []);
  assert.deepEqual(kid.history, [{ kind: 'inherited', lessons: sl.length + 8, lineage: ['mind-1', 'x'] }]);
  assert.equal(kid.context, null);
  const empty = decode(lightOf(kid));
  assert.equal(new TextDecoder().decode(empty.bytes), '');
  assert.ok(lightOf(mind).length < JSON.stringify(mind.episodes).length);
  assert.ok(lightOf({}).length > 0);
});

test('isVerified: a gain above zero over at least 30 later cases', () => {
  assert.equal(isVerified({ gain: 0.1, later: 30 }), true);
  assert.equal(isVerified({ gain: 0.1, later: 29 }), false);
  assert.equal(isVerified({ gain: 0, later: 30 }), false);
  assert.equal(isVerified({ gain: -1, later: 99 }), false);
  assert.equal(isVerified(undefined), false);
  assert.equal(isVerified(null), false);
});

test('hmac agrees with node:crypto for keys of 63, 64 and 65 bytes', () => {
  for (const n of [63, 64, 65, 100]) { const k = 'k'.repeat(n); assert.equal(hmac(k, 'msg'), createHmac('sha256', k).update('msg').digest('hex'), String(n)); }
});

test('loss is clamped at both ends', () => {
  assert.ok(Math.abs(loss(100, 0) + Math.log(1e-12)) < 1e-3);
  assert.ok(Math.abs(loss(-100, 1) + Math.log(1e-12)) < 1e-3);
  assert.ok(Math.abs(loss(0, 1) - Math.log(2)) < 1e-12);
  assert.ok(Number.isFinite(loss(1e6, 0)));
});

test('inContext puts a value AT the median below it; each batch is its own outcome; rates are (k + 1)/(n + 2)', () => {
  const p = segPos[0], row = L.sets.fit[p];
  const L2 = { ...L, stats: { ...L.stats, seg: { ...L.stats.seg, q: { ...L.stats.seg.q, 0.5: L.ds.cols.seg[row] } } } };
  assert.equal(inContext(L2, { f: 'seg', side: 0 }, 'fit', p), true);
  const r = relive(L, genes, founder, mind.episodes, ctx);
  assert.deepEqual(r.outcomes.map((o) => o.n), batches.map((b) => b.length));
  assert.deepEqual(r.outcomes.map((o) => o.batch), [0, 1, 2, 3, 4]);
  for (const l of Object.values(r.lessons)) {
    const inIt = mind.episodes.filter((e) => (L.ds.cols[l.cell.f][L.sets.fit[e.pos]] > L.stats[l.cell.f].q[0.5] ? 1 : 0) === l.cell.a && (L.ds.cols[l.cell.g][L.sets.fit[e.pos]] > L.stats[l.cell.g].q[0.5] ? 1 : 0) === l.cell.b);
    const k = inIt.reduce((a, e) => a + e.outcome, 0);
    assert.equal(l.rate, (k + 1) / (inIt.length + 2));
  }
});

test('the slice breaks ties in gain by cell key', () => {
  const cell = (a) => ({ f: 'x', a, g: 'y', b: 0 });
  const m = { mind: 'q', lessons: { p: { cell: cell(1), context: null, rate: 0.5, n: 30, gain: 2, verified: true }, r: { cell: cell(0), context: null, rate: 0.5, n: 30, gain: 2, verified: true } } };
  assert.deepEqual(sliceOf(m).map((l) => l.cell.a), [0, 1]);
});
