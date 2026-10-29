#!/usr/bin/env node
// tools/organ3c-measure.mjs — organ 3c, the third sealed try at M2: trust from birth, checked case by case (data/organ3c-prereg.json,
// sealed 8d8e403), measured. Organ 3b's tool, with the child in 'trust' mode; organ 3b's receipt is read for comparison.
//   --check | --run | --verify      (needs node tools/data.mjs --fetch)
// Organ 3's parents, lives, slices and children are rebuilt here by organ 3's own steps (tools/organ3-measure.mjs runs its
// CLI on import) and checked against organ 3's receipt, mind id by mind id, before anything is measured.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadLab } from './datasets.mjs';
import { genesOf, idOf, fuse } from '../src/mind.mjs';
import { live, sliceOf, newborn, lightOf, loss } from '../src/memory.mjs';
import { earlyLife } from '../src/inherit.mjs';
import { mulberry32 } from '../src/dream.mjs';
import { decode } from '../vendor/fall-kit/core/vendor/light/codec.mjs';
import { makeIdentity, verifyBytes, hex } from '../vendor/fall-kit/core/identity.mjs';
import { sha256 } from '../vendor/fall-kit/core/vendor/light/sha256.mjs';

export const SEAL = '8d8e403';
const ROOT = new URL('../', import.meta.url);
const file = (p) => new URL(p, ROOT);
const PREREG = 'data/organ3c-prereg.json', RUN = 'data/organ3c-run.json';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', a, { cwd: fileURLToPath(ROOT), encoding: 'utf8' }).trim();
const enc = new TextEncoder();
const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
const SLICE_FIELDS = JSON.stringify(['cell', 'context', 'gain', 'lineage', 'n', 'rate']);
const CROSS_FIELDS = JSON.stringify(['batch', 'cell', 'context', 'gain', 'kind', 'later', 'lineage']);

/** Paired improvement (without − with): mean and the 95% bootstrap bounds (organ 3's resampling, both tails). */
export function improvement(etaWithout, etaWithLessons, y, seed) {
  const d = Array.from(y, (yi, i) => loss(etaWithout[i], yi) - loss(etaWithLessons[i], yi));
  const n = d.length, mean = n ? d.reduce((a, b) => a + b, 0) / n : 0;
  const rng = mulberry32(seed), means = [];
  for (let r = 0; r < 1000; r++) { let s = 0; for (let k = 0; k < n; k++) s += d[Math.floor(rng() * n)]; means.push(s / n); }
  means.sort((a, b) => a - b);
  return { n, mean, lb: means[25], ub: means[974] };
}

async function chain(history, phrase) {
  const id = await makeIdentity(sha256(enc.encode(phrase)));
  let prev = '0'.repeat(64), ok = true;
  for (const e of history) {
    const h = hex(sha256(enc.encode('WDR/history/v1\u0000' + prev + JSON.stringify(e))));
    const sig = await id.sign(enc.encode(h));
    ok = ok && (await verifyBytes(id.id, enc.encode(h), sig));
    prev = h;
  }
  return { key: id.id, head: prev, entries: history.length, ok };
}

async function measure() {
  const lab = loadLab();
  const o3 = JSON.parse(readFileSync(file('data/organ3-run.json'), 'utf8'));
  const o3b = JSON.parse(readFileSync(file('data/organ3b-run.json'), 'utf8'));
  const canaryRng = mulberry32(20261029 + 3), saltRng = mulberry32(20261029 + 5);
  const canaries = new Map(), salts = new Map();
  const canaryOf = (name) => (p) => { const k = name + ':' + p; if (!canaries.has(k)) canaries.set(k, Array.from({ length: 12 }, () => '0123456789abcdef'[Math.floor(canaryRng() * 16)]).join('')); return canaries.get(k); };
  const saltOf = (name) => (p) => { const k = name + ':' + p; if (!salts.has(k)) salts.set(k, Math.floor(saltRng() * 2 ** 32).toString(16).padStart(8, '0') + Math.floor(saltRng() * 2 ** 32).toString(16).padStart(8, '0')); return salts.get(k); };
  const children = [], leaks = [], heads = [];
  for (const name of Object.keys(lab)) {
    const L = lab[name];
    // organ 3's steps, exactly
    const all = genesOf(L, L.features.map((f) => ({ op: 'raw', f })), 0, 800);
    let s = L.features[0], w = -1;
    L.features.forEach((f, j) => { if (Math.abs(all.beta[j + 1]) > w) { w = Math.abs(all.beta[j + 1]); s = f; } });
    const med = L.stats[s].q[0.5];
    const segFit = (p, side) => (L.ds.cols[s][L.sets.fit[p]] > med ? 1 : 0) === side;
    const A = genesOf(L, L.features.filter((_, j) => j % 2 === 0).map((f) => ({ op: 'raw', f })), 0, 400);
    const B = genesOf(L, L.features.filter((_, j) => j % 2 === 1).map((f) => ({ op: 'raw', f })), 400, 800);
    const idA = idOf(A), idB = idOf(B);
    const batchesOf = (side) => { const pos = range(800, L.sets.fit.length).filter((p) => segFit(p, side)); const out = []; for (let k = 0; k < 10 && k * 200 < pos.length; k++) out.push(pos.slice(k * 200, k * 200 + 200)); return out; };
    const mA = live(L, A, idA, range(0, 400), batchesOf(0), canaryOf(name), saltOf(name), { f: s, side: 0 });
    const mB = live(L, B, idB, range(400, 800), batchesOf(1), canaryOf(name), saltOf(name), { f: s, side: 1 });
    const fz = fuse(L, A, B);
    const childId = idOf(fz.genes);
    const sA = sliceOf(mA), sB = sliceOf(mB);
    const child = newborn(childId, [sA, sB]);
    const was = o3.minds[name], dry = !!process.env.WDR_SYNTH;   // a dry run on synthetic data has no organ 3 to match
    if (!dry && (!was || was.parents.A.mind !== idA || was.parents.B.mind !== idB || was.child.mind !== childId || was.child.born !== fz.born)) throw new Error(`${name}: the rebuilt minds are not organ 3's (receipt data/organ3-run.json)`);
    const blind = dry ? { mean: null, lb: null, inherited: child.inherited.length } : o3.claims.M2.children.find((c) => c.dataset === name);
    if (blind.inherited !== child.inherited.length) throw new Error(`${name}: the rebuilt slice is not organ 3's`);
    // the two early lives, each arm living the same cycle; only the slice differs
    const fC = range(0, 800);
    const proven = dry ? null : o3b.children.find((c) => c.dataset === name);
    const row = { dataset: name, born: fz.born, inherited: child.inherited.length, fromA: sA.length, fromB: sB.length, blindD1: { mean: blind.mean, lb: blind.lb }, provenD1: proven ? { mean: proven.D1.mean, lb: proven.D1.lb } : null, provenD2: proven ? { mean: proven.D2.mean, lb: proven.D2.lb } : null };
    const history = [...child.history], lives = [];
    for (const [life, set, n] of [['D1', 'test', Math.min(2000, L.sets.test.length)], ['D2', 'gate', Math.min(2000, L.sets.gate.length)]]) {
      const pos = range(0, n);
      const y = Uint8Array.from(pos, (p) => L.y[set][p]);
      const withSlice = earlyLife(L, fz.genes, fC, set, pos, child.inherited, 'trust');
      const without = earlyLife(L, fz.genes, fC, set, pos, [], 'trust');
      const imp = improvement(without.eta, withSlice.eta, y, 20261029 + 4);
      const cross = withSlice.history.filter((h) => h.kind === 'adopted' || h.kind === 'dropped');
      const end = withSlice.inherited.filter((x) => x.here.inUse);
      row[life] = {
        rows: `${set} 0–${n - 1}`, tasks: n, mean: +imp.mean.toFixed(6), lb: +imp.lb.toFixed(6), ub: +imp.ub.toFixed(6), pass: imp.mean >= 0.001 && imp.lb > 0, noHarm: imp.ub >= 0,
        adoptedAtBirth: cross.filter((h) => h.kind === 'adopted' && h.batch === -1).length, adopted: cross.filter((h) => h.kind === 'adopted').length, dropped: cross.filter((h) => h.kind === 'dropped').length,
        inUseAtEnd: { A: end.filter((x) => x.lesson.lineage[0] === idA).length, B: end.filter((x) => x.lesson.lineage[0] === idB).length },
        neverUsed: withSlice.inherited.filter((x) => !cross.some((h) => h.kind === 'adopted' && JSON.stringify(h.cell) === JSON.stringify(x.lesson.cell) && JSON.stringify(h.context) === JSON.stringify(x.lesson.context) && h.lineage[0] === x.lesson.lineage[0])).length,
        ownVerified: Object.values(withSlice.lessons).filter((l) => l.verified).length,
      };
      history.push(...withSlice.history.map((h) => ({ life, ...h })));
      lives.push({ life, withSlice });
    }
    children.push(row);
    // T4 — organ 3b's N4 test: every byte the child holds after both lives
    const lifeBytes = lives.map(({ withSlice: x }) => new TextDecoder().decode(decode(lightOf({ episodes: x.episodes, lessons: x.lessons })).bytes) + JSON.stringify(x.lessons)).join('\n');
    const core = JSON.stringify({ genes: fz.genes, inherited: child.inherited, history });
    const parentEps = [...mA.episodes, ...mB.episodes];
    const canaryHits = parentEps.filter((e) => (core + lifeBytes).includes(e.note.split(' ').pop())).length;
    const rowHits = parentEps.filter((e) => core.includes(JSON.stringify(e.values))).length;
    const sliceOk = child.inherited.every((l) => JSON.stringify(Object.keys(l).sort()) === SLICE_FIELDS);
    const crossOk = history.filter((h) => h.kind === 'adopted' || h.kind === 'dropped').every(({ life, ...h }) => JSON.stringify(Object.keys(h).sort()) === CROSS_FIELDS);
    leaks.push({ dataset: name, scannedEpisodes: parentEps.length, childBytes: core.length + lifeBytes.length, canaryHits, rowHits, sliceFieldsOk: sliceOk, crossFieldsOk: crossOk, pass: canaryHits === 0 && rowHits === 0 && sliceOk && crossOk });
    heads.push({ dataset: name, child: await chain(history, 'watch-dream-remember/mind/' + childId) });
  }
  const n1 = children.filter((c) => c.D1.pass).length, n2 = children.filter((c) => c.D2.pass).length;
  const harm = children.flatMap((c) => [['D1', c.D1], ['D2', c.D2]].filter(([, x]) => !x.noHarm).map(([l]) => `${c.dataset} ${l}`));
  const fmt = (c, l) => `${c.dataset} ${c[l].mean >= 0 ? '+' : ''}${c[l].mean.toFixed(4)} (lb ${c[l].lb.toFixed(4)}; ${c[l].adoptedAtBirth} trusted at birth, ${c[l].dropped} dropped)`;
  const T1 = { pass: n1 >= 4, measured: `${n1} of 5 children better trusting and checking their inheritance on M2's rows (bar 4): ` + children.map((c) => fmt(c, 'D1')).join('; '), note: 'the third look at these rows, chosen knowing organs 3 and 3b' };
  const T2 = { pass: n2 >= 4, measured: `${n2} of 5 children better on the gate rows (bar 4): ` + children.map((c) => fmt(c, 'D2')).join('; ') };
  const T3 = { pass: harm.length === 0, measured: harm.length ? `significantly worse with its slice: ${harm.join(', ')}` : '0 of 10 early lives significantly worse with the slice (every 95% upper bound ≥ 0): ' + children.flatMap((c) => [`${c.dataset} D1 ub ${c.D1.ub.toFixed(4)}`, `${c.dataset} D2 ub ${c.D2.ub.toFixed(4)}`]).join(', ') };
  const T4 = { pass: leaks.every((x) => x.pass), measured: `${leaks.reduce((a, x) => a + x.canaryHits, 0)} canaries and ${leaks.reduce((a, x) => a + x.rowHits, 0)} raw rows of ${leaks.reduce((a, x) => a + x.scannedEpisodes, 0)} parent episodes in the children after both lives; slice fields exact in ${leaks.filter((x) => x.sliceFieldsOk).length}/5, adopted/dropped fields exact in ${leaks.filter((x) => x.crossFieldsOk).length}/5`, children: leaks };
  const claims = { T1, T2, T3, T4 };
  return { kind: 'watch-dream-remember.organ3c.inheritance-trust.run', seal: SEAL, notes: ['Organ 3’s minds rebuilt and checked against data/organ3-run.json (every parent and child id, born or not, slice size) before anything was measured.', 'blindD1 is organ 3’s M2 result on the same rows (the slice applied from birth); provenD1 and provenD2 are organ 3b’s (proven first), for comparison.', 'Both arms live the same cycle; the arm without the slice still learns its own lessons. The improvement is what inheritance adds on top of that.'], fixed: T1.pass && T2.pass && T3.pass && T4.pass, claims, held: Object.values(claims).filter((c) => c.pass).length, of: 4, children, histories: heads };
}

const out = (x) => JSON.stringify(x, null, 1) + '\n';
const cmd = process.argv[2];
if (cmd === '--check') {
  const sealed = git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim();
  if (sealed !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the organ 3c seal changed since ' + SEAL); process.exit(1); }
  const P = JSON.parse(sealed);
  if (sha(readFileSync(file(P.data.sources))) !== P.data.sha256) { console.error('✗ the data pins changed'); process.exit(1); }
  console.error('✓ organ 3c seal and its pins unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = await measure();
  if (cmd === '--run') {
    if (!process.env.WDR_SYNTH) writeFileSync(file(RUN), out(result));   // a dry run writes nothing
    console.error(`✓ organ 3c: ${result.held} of 4 held · M2 ${result.fixed ? 'FIXED' : 'NOT fixed'}`);
    for (const [k, c] of Object.entries(result.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`);
  } else {
    if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== out(result)) { console.error('✗ organ 3c does not re-measure to the committed receipt'); process.exit(1); }
    console.error(`✓ organ 3c re-measured: identical (${result.held} of 4 held)`);
  }
} else if (cmd) { console.error('organ3c-measure — --check | --run | --verify'); process.exit(2); }
