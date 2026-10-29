import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, MARKET, BUDGET, LIMITS, ideaOk, candidate, analogue, carry, promptOf, parseReply, associations, gaps, strongest, variations, day } from '../src/daydream.mjs';
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
