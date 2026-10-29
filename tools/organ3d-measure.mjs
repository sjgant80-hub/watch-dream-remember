#!/usr/bin/env node
// tools/organ3d-measure.mjs — organ 3d, M2 on fresh data (data/organ3d-prereg.json, sealed b0dea93), measured.
//   --check | --run | --verify      (needs node tools/data.mjs --fetch)
// Five fresh families, each built by organ 3's own steps on rows no organ has read (slices of the loaders' row lists beyond
// what prepare() keeps). WDR_SYNTH=1 is a dry run on synthetic data of the same shape, which writes nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadRaw } from './datasets.mjs';
import { prepare } from '../src/lab.mjs';
import { genesOf, idOf, fuse } from '../src/mind.mjs';
import { live, sliceOf, newborn, lightOf, loss } from '../src/memory.mjs';
import { earlyLife } from '../src/inherit.mjs';
import { mulberry32 } from '../src/dream.mjs';
import { decode } from '../vendor/fall-kit/core/vendor/light/codec.mjs';
import { makeIdentity, verifyBytes, hex } from '../vendor/fall-kit/core/identity.mjs';
import { sha256 } from '../vendor/fall-kit/core/vendor/light/sha256.mjs';

export const SEAL = 'b0dea93';
const ROOT = new URL('../', import.meta.url);
const file = (p) => new URL(p, ROOT);
const PREREG = 'data/organ3d-prereg.json', RUN = 'data/organ3d-run.json';
const DRY = !!process.env.WDR_SYNTH;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', a, { cwd: fileURLToPath(ROOT), encoding: 'utf8' }).trim();
const enc = new TextEncoder();
const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
const SLICE_FIELDS = JSON.stringify(['cell', 'context', 'gain', 'lineage', 'n', 'rate']);
const CROSS_FIELDS = JSON.stringify(['batch', 'cell', 'context', 'gain', 'kind', 'later', 'lineage']);

/** Paired improvement (without − with): mean and the 95% bootstrap bounds (organ 3's resampling). */
function improvement(etaWithout, etaWithLessons, y, seed) {
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

/** A dry run's raw data: three synthetic datasets large enough for the sealed windows (no real row is read). */
function synthRaw() {
  const rng = mulberry32(11), out = {};
  for (const name of ['bank', 'adult', 'credit']) {
    const features = Array.from({ length: 8 }, (_, j) => name + '_f' + j), n = 46000;
    const cols = Object.fromEntries(features.map((f, j) => [f, Float64Array.from({ length: n }, () => (j % 3 === 0 ? Math.floor(rng() * 2) : j % 3 === 1 ? Math.exp(rng() * 4) : rng() * 10))]));
    const y = Uint8Array.from({ length: n }, (_, i) => (rng() < 1 / (1 + Math.exp(-(Math.log(cols[features[1]][i]) - 2 + (cols[features[2]][i] > 7 ? 1 : 0)))) ? 1 : 0));
    const idx = Array.from({ length: n }, (_, i) => i);
    out[name] = { ok: true, name, title: name + ' (synthetic)', outcome: 'y', features, cols, y, fitRows: idx.slice(0, 22000), gateRows: idx.slice(22000, 30200), testRows: idx.slice(30200) };
  }
  return out;
}

/** A family's own lab: its windows of its dataset loader's row lists, prepared on their own. */
function familyLab(raw, fam) {
  const d = raw[fam.dataset];
  const cut = (rows, [a, b], what) => { if (rows.length < b) throw new Error(`${fam.id}: ${what} has ${rows.length} rows, the window needs ${b}`); return rows.slice(a, b); };
  const lab = prepare({ [fam.id]: { ...d, fitRows: cut(d.fitRows, fam.fit, 'fit'), gateRows: cut(d.gateRows, fam.gate, 'gate'), testRows: cut(d.testRows, fam.test, 'test') } });
  return lab[fam.id];
}

async function measure() {
  const P = JSON.parse(readFileSync(file(PREREG), 'utf8'));
  const raw = DRY ? synthRaw() : loadRaw();
  const canaryRng = mulberry32(20261030 + 3), saltRng = mulberry32(20261030 + 5);
  const canaries = new Map(), salts = new Map();
  const canaryOf = (name) => (p) => { const k = name + ':' + p; if (!canaries.has(k)) canaries.set(k, Array.from({ length: 12 }, () => '0123456789abcdef'[Math.floor(canaryRng() * 16)]).join('')); return canaries.get(k); };
  const saltOf = (name) => (p) => { const k = name + ':' + p; if (!salts.has(k)) salts.set(k, Math.floor(saltRng() * 2 ** 32).toString(16).padStart(8, '0') + Math.floor(saltRng() * 2 ** 32).toString(16).padStart(8, '0')); return salts.get(k); };
  const rows = [], leaks = [], heads = [];
  for (const fam of P.data.families) {
    const L = familyLab(raw, fam), name = fam.id;
    // organ 3's steps, exactly, on the family's own lab
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
    const fC = range(0, 800), pos = range(0, Math.min(2000, L.sets.test.length));
    const y = Uint8Array.from(pos, (p) => L.y.test[p]);
    const life = (inherited, mode, opts) => earlyLife(L, fz.genes, fC, 'test', pos, inherited, mode, opts);
    const f1With = life(child.inherited, 'trust', { own: false }), f1Without = life([], 'trust', { own: false });
    const f4With = life(child.inherited, 'trust'), f4Without = life([], 'trust');
    const blind = life(child.inherited, 'blind', { own: false });
    const i1 = improvement(f1Without.eta, f1With.eta, y, 20261029 + 4), i4 = improvement(f4Without.eta, f4With.eta, y, 20261029 + 4), ib = improvement(f1Without.eta, blind.eta, y, 20261029 + 4);
    const r6 = (x) => +x.toFixed(6);
    const cross = f1With.history.filter((h) => h.kind === 'adopted' || h.kind === 'dropped');
    rows.push({
      family: name, dataset: fam.dataset, segment: s, born: fz.born, gate: { child: r6(fz.gate.child), a: r6(fz.gate.a), b: r6(fz.gate.b) },
      parents: { A: { mind: idA.slice(0, 16), episodes: mA.episodes.length, verified: Object.values(mA.lessons).filter((l) => l.verified).length }, B: { mind: idB.slice(0, 16), episodes: mB.episodes.length, verified: Object.values(mB.lessons).filter((l) => l.verified).length } },
      inherited: child.inherited.length, fromA: sA.length, fromB: sB.length, tasks: pos.length,
      F1: { mean: r6(i1.mean), lb: r6(i1.lb), ub: r6(i1.ub), pass: i1.mean >= 0.001 && i1.lb > 0, noHarm: i1.ub >= 0, trustedAtBirth: cross.filter((h) => h.kind === 'adopted' && h.batch === -1).length, dropped: cross.filter((h) => h.kind === 'dropped').length, inUseAtEnd: f1With.inherited.filter((x) => x.here.inUse).length },
      F4: { mean: r6(i4.mean), lb: r6(i4.lb), ub: r6(i4.ub), pass: i4.mean >= 0.001 && i4.lb > 0 },
      blind: { mean: r6(ib.mean), lb: r6(ib.lb), ub: r6(ib.ub), pass: ib.mean >= 0.001 && ib.lb > 0 },
    });
    // F3 — organ 3b's N4 test on the child after its early lives
    const history = [...child.history, ...f1With.history.map((h) => ({ life: 'F1', ...h })), ...f4With.history.map((h) => ({ life: 'F4', ...h }))];
    const lifeBytes = [f1With, f4With].map((x) => new TextDecoder().decode(decode(lightOf({ episodes: x.episodes, lessons: x.lessons })).bytes) + JSON.stringify(x.lessons)).join('\n');
    const core = JSON.stringify({ genes: fz.genes, inherited: child.inherited, history });
    const parentEps = [...mA.episodes, ...mB.episodes];
    const canaryHits = parentEps.filter((e) => (core + lifeBytes).includes(e.note.split(' ').pop())).length;
    const rowHits = parentEps.filter((e) => core.includes(JSON.stringify(e.values))).length;
    const sliceOk = child.inherited.every((l) => JSON.stringify(Object.keys(l).sort()) === SLICE_FIELDS);
    const crossOk = history.filter((h) => h.kind === 'adopted' || h.kind === 'dropped').every(({ life, ...h }) => JSON.stringify(Object.keys(h).sort()) === CROSS_FIELDS);
    leaks.push({ family: name, scannedEpisodes: parentEps.length, childBytes: core.length + lifeBytes.length, canaryHits, rowHits, sliceFieldsOk: sliceOk, crossFieldsOk: crossOk, pass: canaryHits === 0 && rowHits === 0 && sliceOk && crossOk });
    heads.push({ family: name, child: await chain(history, 'watch-dream-remember/mind/' + childId) });
  }
  const fmt = (r, k) => `${r.family} ${r[k].mean >= 0 ? '+' : ''}${r[k].mean.toFixed(4)} (lb ${r[k].lb.toFixed(4)})`;
  const n1 = rows.filter((r) => r.F1.pass).length, n4 = rows.filter((r) => r.F4.pass).length, harm = rows.filter((r) => !r.F1.noHarm).map((r) => r.family);
  const F1 = { pass: n1 >= 4, measured: `${n1} of 5 fresh children better with their inheritance, checked against their own cases (bar 4): ` + rows.map((r) => fmt(r, 'F1')).join('; ') };
  const F2 = { pass: harm.length === 0, measured: harm.length ? `significantly worse with the slice: ${harm.join(', ')}` : '0 of 5 fresh children significantly worse (every 95% upper bound ≥ 0): ' + rows.map((r) => `${r.family} ub ${r.F1.ub.toFixed(4)}`).join(', ') };
  const F3 = { pass: leaks.every((x) => x.pass), measured: `${leaks.reduce((a, x) => a + x.canaryHits, 0)} canaries and ${leaks.reduce((a, x) => a + x.rowHits, 0)} raw rows of ${leaks.reduce((a, x) => a + x.scannedEpisodes, 0)} parent episodes in the children; slice fields exact in ${leaks.filter((x) => x.sliceFieldsOk).length}/5, adopted/dropped fields exact in ${leaks.filter((x) => x.crossFieldsOk).length}/5`, children: leaks };
  const F4 = { pass: n4 >= 4, measured: `${n4} of 5 better when both arms also learn their own lessons (bar 4): ` + rows.map((r) => fmt(r, 'F4')).join('; ') };
  const claims = { F1, F2, F3, F4 };
  return {
    kind: 'watch-dream-remember.organ3d.inheritance-fresh.run', seal: SEAL,
    notes: ['Every family is built from rows prepare() never kept: no organ of this build had read them.', 'blind is organ 3’s M2 mechanism (the slice from birth, never dropped) on the same fresh children: context, not a claim.', 'F4 is reported whatever it shows; it is not part of the fix.'],
    fixed: F1.pass && F2.pass && F3.pass, context: { blind: `${rows.filter((r) => r.blind.pass).length} of 5 fresh children better with blind inheritance: ` + rows.map((r) => fmt(r, 'blind')).join('; ') },
    claims, held: [F1, F2, F3, F4].filter((c) => c.pass).length, of: 4, families: rows, histories: heads,
  };
}

const out = (x) => JSON.stringify(x, null, 1) + '\n';
const cmd = process.argv[2];
if (cmd === '--check') {
  const sealed = git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim();
  if (sealed !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the organ 3d seal changed since ' + SEAL); process.exit(1); }
  const Pp = JSON.parse(sealed);
  if (sha(readFileSync(file(Pp.data.sources))) !== Pp.data.sha256) { console.error('✗ the data pins changed'); process.exit(1); }
  console.error('✓ organ 3d seal and its pins unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = await measure();
  if (cmd === '--run') {
    if (!DRY) writeFileSync(file(RUN), out(result));   // a dry run writes nothing
    console.error(`✓ organ 3d${DRY ? ' (DRY RUN, synthetic — not evidence)' : ''}: ${result.held} of 4 held · M2 ${result.fixed ? 'FIXED' : 'NOT fixed'}`);
    if (!DRY) { for (const [k, c] of Object.entries(result.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`); console.error('  (context) ' + result.context.blind); }
  } else {
    if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== out(result)) { console.error('✗ organ 3d does not re-measure to the committed receipt'); process.exit(1); }
    console.error(`✓ organ 3d re-measured: identical (${result.held} of 4 held)`);
  }
} else if (cmd) { console.error('organ3d-measure — --check | --run | --verify'); process.exit(2); }
