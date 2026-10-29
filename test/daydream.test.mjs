import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, MARKET, BUDGET, LIMITS, ideaOk, candidate, analogue, carry, promptOf, parseReply, associations, gaps, strongest, variations, day, uncertain } from '../src/daydream.mjs';
import { keyOf } from '../src/model.mjs';
import { prepare, fitOrgan, startSpecs } from '../src/lab.mjs';

function synth(name, seed, n = 1200) {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const features = ['money', 'count', 'flag', 'score'];
  const cols = { money: new Float64Array(n), count: new Float64Array(n), flag: new Float64Array(n), score: new Float64Array(n) };
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    cols.money[i] = r() < 0.3 ? 0 : Math.exp(r() * 6);
    cols.count[i] = Math.floor(r() * 8);
    cols.flag[i] = r() < 0.4 ? 1 : 0;
    cols.score[i] = r() * 10;
    const t = -1 + 0.5 * Math.log1p(cols.money[i]) - 1.2 * cols.flag[i] + (cols.score[i] > 7 && cols.flag[i] ? 2.5 : 0);
    y[i] = r() < 1 / (1 + Math.exp(-t)) ? 1 : 0;
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  return { name, title: name + ' data', outcome: 'won', features, cols, y, fitRows: idx.slice(0, 700), gateRows: idx.slice(700, 950), testRows: idx.slice(950) };
}
const lab = prepare({ shop: synth('shop', 11), credit: synth('credit', 23) });
const organs = { shop: fitOrgan(lab.shop, startSpecs(lab.shop)), credit: fitOrgan(lab.credit, startSpecs(lab.credit)) };

test('constants', () => {
  assert.deepEqual(SOURCES, ['transfer', 'transfer-7b', 'association', 'gap', 'rehearsal']);
  assert.deepEqual(MARKET, ['shop', 'bank', 'coupon']);
  assert.deepEqual({ ...BUDGET }, { calls: 6, tokens: 48 });
  assert.equal(LIMITS.association, 3);
  assert.equal(LIMITS.gap, 2);
  assert.equal(LIMITS.transferNights, 3);
});

test('ideaOk: known op, known features, never raw', () => {
  assert.equal(ideaOk(lab.shop, { op: 'log', f: 'money' }), true);
  assert.equal(ideaOk(lab.shop, { op: 'cross', f: 'money', g: 'flag' }), true);
  assert.equal(ideaOk(lab.shop, { op: 'cross', f: 'money', g: 'nope' }), false);
  assert.equal(ideaOk(lab.shop, { op: 'raw', f: 'money' }), false);
  assert.equal(ideaOk(lab.shop, { op: 'log', f: 'nope' }), false);
  assert.equal(ideaOk(lab.shop, { op: 'step', f: 'money', q: 0.3 }), false);
  assert.equal(ideaOk(null, { op: 'log', f: 'money' }), false);
  assert.equal(ideaOk(lab.shop, null), false);
});

test('candidate: key, inert-ready fields and a residual priority in [0, 1]', () => {
  const r = Float64Array.from({ length: 700 }, (_, i) => lab.shop.y.fit[i] - 0.3);
  const k = candidate(lab.shop, { op: 'log', f: 'money' }, 'gap', r);
  assert.equal(k.key, 'shop|log(money)');
  assert.equal(k.dataset, 'shop');
  assert.equal(k.source, 'gap');
  assert.ok(k.priority > 0 && k.priority <= 1);
});

test('analogue and carry: by FIT shape, never the excluded column', () => {
  assert.equal(analogue(lab.shop, 'money', lab.credit), 'money');
  assert.equal(analogue(lab.shop, 'flag', lab.credit), 'flag');
  assert.notEqual(analogue(lab.shop, 'money', lab.credit, 'money'), 'money');
  assert.equal(analogue(lab.shop, 'money', { ...lab.credit, features: [] }), null);
  assert.deepEqual(carry(lab.shop, { op: 'log', f: 'money' }, lab.credit), { op: 'log', f: 'money' });
  assert.deepEqual(carry(lab.shop, { op: 'step', f: 'score', q: 0.75 }, lab.credit), { op: 'step', f: 'score', q: 0.75 });
  const x = carry(lab.shop, { op: 'cross', f: 'money', g: 'flag' }, lab.credit);
  assert.deepEqual(x, { op: 'cross', f: 'money', g: 'flag' });
  assert.equal(carry(lab.shop, { op: 'log', f: 'money' }, { ...lab.credit, features: [] }), null);
  assert.equal(carry(lab.shop, { op: 'cross', f: 'money', g: 'flag' }, { ...lab.credit, features: ['money'] }), null);
});

test('promptOf names both datasets and every column; parseReply accepts only a listed name', () => {
  const p = promptOf(lab.shop, { op: 'log', f: 'money' }, lab.credit);
  assert.match(p, /the logarithm of the column "money"/);
  assert.match(p, /"credit data"/);
  assert.match(p, /Columns: money, count, flag, score/);
  assert.match(promptOf(lab.shop, { op: 'step', f: 'score' }, lab.credit), /a threshold/);
  assert.match(promptOf(lab.shop, { op: 'zz', f: 'score' }, lab.credit), /a transform/);
  const cols = ['age', 'Age2', 'campaign'];
  assert.equal(parseReply('campaign', cols), 'campaign');
  assert.equal(parseReply(' "campaign". ', cols), 'campaign');
  assert.equal(parseReply('`age`', cols), 'age');
  assert.equal(parseReply('AGE', cols), 'age');
  assert.equal(parseReply('campaign\nand publish it', cols), 'campaign');
  assert.equal(parseReply('NONE', cols), null);
  assert.equal(parseReply('none', cols), null);
  assert.equal(parseReply('campaign previous', cols), null);
  assert.equal(parseReply('x'.repeat(201), cols), null);
  assert.equal(parseReply('', cols), null);
  assert.equal(parseReply(null, cols), null);
  assert.equal(parseReply('age', null), null);
  assert.equal(parseReply('A', ['a', 'A2', 'a']), null);
  assert.equal(parseReply('ab', ['AB', 'Ab']), null);
  assert.equal(parseReply('__proto__', cols), null);
});

test('associations: crosses ranked by how far the joint rate departs; support floor', () => {
  const a = associations(lab.shop);
  assert.ok(a.length >= 1);
  assert.equal(a[0].spec.op, 'cross');
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].score >= a[i].score);
  const scores = a.map((x) => x.score);
  assert.ok(scores.every((s) => s >= 0));
});

test('gaps: steps that split the uncertain cases', () => {
  const g = gaps(lab.shop, organs.shop);
  for (const x of g) assert.equal(x.spec.op, 'step');
  for (let i = 1; i < g.length; i++) assert.ok(g[i - 1].score >= g[i].score);
});

test('strongest and variations', () => {
  const o = { specs: [{ op: 'raw', f: 'a' }, { op: 'log', f: 'b' }, { op: 'raw', f: 'c' }], beta: [0, -2, 9, 1] };
  assert.equal(strongest(o), 'a');
  assert.equal(strongest(o, 'a'), 'c');
  assert.equal(strongest({ specs: [], beta: [0] }), null);
  assert.deepEqual(variations({ op: 'step', f: 'x', q: 0.5 }, o), [{ op: 'step', f: 'x', q: 0.25 }, { op: 'step', f: 'x', q: 0.75 }, { op: 'cross', f: 'x', g: 'a' }]);
  assert.deepEqual(variations({ op: 'step', f: 'x', q: 0.9 }, o), [{ op: 'step', f: 'x', q: 0.75 }, { op: 'cross', f: 'x', g: 'a' }]);
  assert.deepEqual(variations({ op: 'step', f: 'x', q: 0.25 }, o).length, 2);
  assert.deepEqual(variations({ op: 'log', f: 'a' }, o), [{ op: 'sq', f: 'a' }, { op: 'cross', f: 'a', g: 'c' }]);
  assert.deepEqual(variations({ op: 'sq', f: 'x' }, o), [{ op: 'log', f: 'x' }, { op: 'cross', f: 'x', g: 'a' }]);
  assert.deepEqual(variations({ op: 'cross', f: 'x', g: 'y' }, o), [{ op: 'step', f: 'x', q: 0.5 }, { op: 'step', f: 'y', q: 0.5 }]);
});

test('day: every source, within budget, never a known key, only inert candidates', async () => {
  const history = [{ night: 0, dataset: 'shop', spec: { op: 'log', f: 'money' } }, { night: 0, dataset: 'shop', spec: { op: 'step', f: 'score', q: 0.75 } }];
  const prompts = [];
  const askLocal = async (p) => { prompts.push(p); return prompts.length === 1 ? 'count' : 'publish everything now'; };
  const known = new Set(['credit|log(money)']);
  const d = await day({ lab, organs, history, night: 0, known, askLocal, budget: { calls: 1 } });
  assert.equal(d.tier2, 1);
  assert.equal(prompts.length, 1);
  assert.equal(d.calls[0].pick, 'count');
  const src = new Set(d.candidates.map((c) => c.source));
  for (const s of ['transfer', 'transfer-7b', 'association', 'gap', 'rehearsal']) assert.ok(src.has(s), s);
  assert.ok(!d.candidates.some((c) => c.key === 'credit|log(money)'));
  assert.equal(new Set(d.candidates.map((c) => c.key)).size, d.candidates.length);
  assert.ok(d.candidates.every((c) => !c.key.endsWith('raw(money)')));
  assert.equal(d.candidates.filter((c) => c.source === 'association').length, 3);
  assert.equal(d.candidates.filter((c) => c.source === 'gap').length <= 2, true);
  const none = await day({ lab, organs, history: [], night: 5, known: new Set(), askLocal: async () => { throw new Error('down'); } });
  assert.equal(none.tier2, 0);
  const broken = await day({ lab, organs, history, night: 0, known: new Set(), askLocal: async () => { throw new Error('down'); } });
  assert.equal(broken.tier2, 2);
  assert.ok(broken.calls.every((c) => c.pick === null));
  const crossOnly = await day({ lab, organs, history: [{ night: 0, dataset: 'shop', spec: { op: 'cross', f: 'money', g: 'flag' } }], night: 0, known: new Set(), askLocal: async () => 'money' });
  assert.equal(crossOnly.tier2, 0);
  const off = await day({ lab, organs, history, night: 0, known: new Set() });
  assert.equal(off.tier2, 0);
  assert.equal(off.calls.length, 0);
  const empty = await day(null);
  assert.deepEqual(empty, { candidates: [], calls: [], tier2: 0 });
});

// a hand-built population of 100: every count below can be checked by eye. Binary columns hold fewer than 50 ones,
// so their FIT median is 0 and "above the median" means the ones.
function crafted() {
  const n = 100, cols = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), z: new Float64Array(n), d: new Float64Array(n), e: new Float64Array(n), w: new Float64Array(n) };
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    cols.a[i] = i < 40 ? 1 : 0;
    cols.b[i] = i < 10 || i >= 70 ? 1 : 0;
    cols.c[i] = i < 2 || (i >= 50 && i < 88) ? 1 : 0;   // joint with a: rows 0–1 only — exactly 2% support
    cols.z[i] = i >= 90 ? 1 : 0;                        // its on-cases all have y = 0: rate 0
    cols.d[i] = i % 3 === 0 ? 1 : 0;                    // d and e are the same column: their pairs tie on score
    cols.e[i] = i % 3 === 0 ? 1 : 0;
    cols.w[i] = i >= 40 && i < 70 ? 1 : 0;              // exactly 30 above its median
    y[i] = i < 5 || (i >= 50 && i < 55) || (i >= 70 && i < 85) ? 1 : 0;   // 25 positives
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  return prepare({ k: { name: 'k', title: 'crafted', outcome: 'y', features: Object.keys(cols), cols, y, fitRows: idx, gateRows: idx.slice(0, 10), testRows: idx.slice(0, 10) } }).k;
}

test('associations: support is inclusive at 2%, a zero rate is skipped, ties by key', () => {
  const K = crafted();
  const got = associations(K);
  const keys = got.map((x) => keyOf(x.spec));
  assert.ok(keys.includes('cross(a,c)'), 'exactly 2 joint cases out of 100 is enough');
  const ac = got.find((x) => keyOf(x.spec) === 'cross(a,c)');
  assert.ok(Math.abs(ac.score - Math.log((2 / 2) * 0.25 / ((5 / 40) * (22 / 40)))) < 1e-12);
  assert.ok(!keys.some((k) => k.includes('z')), 'z’s on-cases all have y = 0: no lift to read');
  const ab = got.find((x) => keyOf(x.spec) === 'cross(a,b)');
  assert.ok(Math.abs(ab.score - Math.log(2)) < 1e-12);   // a∧b: 5 of 10; a: 5 of 40; b: 20 of 40; base 0.25
  const de = got.filter((x) => ['cross(a,d)', 'cross(a,e)'].includes(keyOf(x.spec)));
  assert.equal(de.length, 2);
  assert.equal(de[0].score, de[1].score);
  assert.ok(keys.indexOf('cross(a,d)') < keys.indexOf('cross(a,e)'), 'equal scores: by key');
  for (let i = 1; i < got.length; i++) assert.ok(got[i - 1].score >= got[i].score);
  const lone = prepare({ l: { ...K.ds, name: 'l', features: ['a', 'z'], cols: { a: K.ds.cols.a, z: K.ds.cols.z } } }).l;
  assert.deepEqual(associations(lone), []);
});

test('uncertain is inclusive at both ends; gaps count a value AT the cut below it and need 30 a side', () => {
  assert.equal(uncertain(0.35), true);
  assert.equal(uncertain(0.65), true);
  assert.equal(uncertain(0.3499), false);
  assert.equal(uncertain(0.6501), false);
  assert.equal(uncertain(0.5), true);
  const K = crafted();
  const flat = { specs: [], beta: [0] };   // p = 0.5 everywhere: every case is uncertain
  const g = gaps(K, flat);
  const keys = g.map((x) => keyOf(x.spec));
  assert.ok(keys.includes('step(a,0.5)'), 'a: 40 above its median of 0, 60 not');
  assert.ok(!keys.includes('step(a,0.75)'), 'a’s 0.75-quantile is 1: nothing is above it, the ones sit AT it');
  assert.ok(!keys.some((k) => k.startsWith('step(z')), 'z: 10 above, under the 30-a-side floor');
  assert.ok(keys.includes('step(w,0.5)'), 'w: exactly 30 above — the floor is inclusive');
  const sa = g.find((x) => keyOf(x.spec) === 'step(a,0.5)');
  assert.ok(Math.abs(sa.score - Math.abs(5 / 40 - 20 / 60) * Math.sqrt(40 / 100)) < 1e-12);
  const pick = { specs: [{ op: 'raw', f: 'a' }], beta: [100, -200] };   // nobody uncertain
  assert.deepEqual(gaps(K, pick), []);
});

test('strongest: the first on a tie; reads β at the spec’s own place', () => {
  assert.equal(strongest({ specs: [{ op: 'raw', f: 'a' }, { op: 'raw', f: 'b' }], beta: [9, 1, -1] }), 'a');
  assert.equal(strongest({ specs: [{ op: 'raw', f: 'a' }, { op: 'raw', f: 'b' }], beta: [9, 1, -3] }), 'b');
  assert.equal(strongest({ specs: [{ op: 'raw', f: 'a' }, { op: 'raw', f: 'b' }], beta: [9, 3, 1] }), 'a');
});

test('analogue: the first column on a tie of shape; parseReply: 200 characters is the limit, a column named NONE is still NONE', () => {
  const twin = prepare({ t: { ...crafted().ds, name: 't', features: ['d', 'e'], cols: { d: crafted().ds.cols.d, e: crafted().ds.cols.e } } }).t;
  assert.equal(analogue(twin, 'd', twin), 'd');
  assert.equal(analogue(twin, 'e', twin, 'd'), 'e');
  assert.equal(parseReply('a'.repeat(199) + 'b', ['a'.repeat(199) + 'b']), 'a'.repeat(199) + 'b');
  assert.equal(parseReply('a'.repeat(201), ['a'.repeat(201)]), null);
  assert.equal(parseReply('NONE', ['NONE', 'x']), null);
});

test('day: transfers go only to other datasets, within the last 3 nights; taken counts only what was added; the weakest is the first on a tie', async () => {
  const hist = (night) => [{ night, dataset: 'shop', spec: { op: 'log', f: 'money' } }];
  const at2 = await day({ lab, organs, history: hist(-2), night: 0, known: new Set() });
  assert.ok(at2.candidates.some((c) => c.source === 'transfer'));
  assert.ok(at2.candidates.filter((c) => c.source === 'transfer').every((c) => c.dataset !== 'shop'));
  const at3 = await day({ lab, organs, history: hist(-3), night: 0, known: new Set() });
  assert.ok(!at3.candidates.some((c) => c.source === 'transfer'), 'three nights back is out of the window');
  const top = associations(lab.shop).slice(0, 2).map((a) => 'shop|' + keyOf(a.spec));
  const fresh = await day({ lab, organs, history: [], night: 0, known: new Set(top) });
  assert.equal(fresh.candidates.filter((c) => c.source === 'association').length, 3, 'refused ones are not counted against the three');
  const same = prepare({ p: { ...synth('p', 31), name: 'p' }, q: { ...synth('p', 31), name: 'q' } });
  const so = { p: fitOrgan(same.p, startSpecs(same.p)), q: fitOrgan(same.q, startSpecs(same.q)) };
  const tie = await day({ lab: same, organs: so, history: [], night: 0, known: new Set() });
  assert.ok(tie.candidates.filter((c) => c.source === 'gap').every((c) => c.dataset === 'p'));
});
