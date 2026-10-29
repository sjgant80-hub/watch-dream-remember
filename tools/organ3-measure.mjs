#!/usr/bin/env node
// tools/organ3-measure.mjs — per-mind memory and inherited history, the sealed claims (data/organ3-prereg.json, sealed
// 4da8aa4, v2 superseding d838607), measured.   --check | --run | --verify      (needs node tools/data.mjs --fetch)
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadLab } from './datasets.mjs';
import { genesOf, idOf, etaOf, fuse } from '../src/mind.mjs';
import { live, verified, forget, sliceOf, newborn, lightOf, etaWith, MIN_N } from '../src/memory.mjs';
import { mulberry32 } from '../src/dream.mjs';
import { decode } from '../vendor/fall-kit/core/vendor/light/codec.mjs';
import { makeIdentity, verifyBytes, hex } from '../vendor/fall-kit/core/identity.mjs';
import { sha256 } from '../vendor/fall-kit/core/vendor/light/sha256.mjs';

export const SEAL = '4da8aa4';   // v2, superseding d838607 (disclosed in the seal)
const ROOT = new URL('../', import.meta.url);
const file = (p) => new URL(p, ROOT);
const PREREG = 'data/organ3-prereg.json', RUN = 'data/organ3-run.json';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', a, { cwd: fileURLToPath(ROOT), encoding: 'utf8' }).trim();
const enc = new TextEncoder();
const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
const sigma = (t) => 1 / (1 + Math.exp(-t));
const loss = (eta, y) => { const p = Math.min(1 - 1e-12, Math.max(1e-12, sigma(eta))); return y ? -Math.log(p) : -Math.log(1 - p); };

/** Paired improvement (without − with), its mean and the 95% bootstrap lower bound. */
export function improvement(etaWithout, etaWithLessons, y, seed) {
  const d = Array.from(y, (yi, i) => loss(etaWithout[i], yi) - loss(etaWithLessons[i], yi));
  const n = d.length, mean = n ? d.reduce((a, b) => a + b, 0) / n : 0;
  const rng = mulberry32(seed), means = [];
  for (let r = 0; r < 1000; r++) { let s = 0; for (let k = 0; k < n; k++) s += d[Math.floor(rng() * n)]; means.push(s / n); }
  means.sort((a, b) => a - b);
  return { n, mean, lb: means[25] };
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
  const canaryRng = mulberry32(20261029 + 3), saltRng = mulberry32(20261029 + 5), pickRng = mulberry32(20261029 + 6);
  const canaries = new Map(), salts = new Map();
  const canaryOf = (name) => (p) => { const k = name + ':' + p; if (!canaries.has(k)) canaries.set(k, Array.from({ length: 12 }, () => '0123456789abcdef'[Math.floor(canaryRng() * 16)]).join('')); return canaries.get(k); };
  const saltOf = (name) => (p) => { const k = name + ':' + p; if (!salts.has(k)) salts.set(k, Math.floor(saltRng() * 2 ** 32).toString(16).padStart(8, '0') + Math.floor(saltRng() * 2 ** 32).toString(16).padStart(8, '0')); return salts.get(k); };
  const per = {}, parents = [], children = [], m3 = { a: [], b: [] }, heads = [];
  for (const name of Object.keys(lab)) {
    const L = lab[name];
    const all = genesOf(L, L.features.map((f) => ({ op: 'raw', f })), 0, 800);
    let s = L.features[0], w = -1;
    L.features.forEach((f, j) => { if (Math.abs(all.beta[j + 1]) > w) { w = Math.abs(all.beta[j + 1]); s = f; } });
    const med = L.stats[s].q[0.5];
    const segFit = (p, side) => (L.ds.cols[s][L.sets.fit[p]] > med ? 1 : 0) === side;
    const segTest = (p, side) => (L.ds.cols[s][L.sets.test[p]] > med ? 1 : 0) === side;
    const A = genesOf(L, L.features.filter((_, j) => j % 2 === 0).map((f) => ({ op: 'raw', f })), 0, 400);
    const B = genesOf(L, L.features.filter((_, j) => j % 2 === 1).map((f) => ({ op: 'raw', f })), 400, 800);
    const idA = idOf(A), idB = idOf(B);
    const batchesOf = (side) => { const pos = range(800, L.sets.fit.length).filter((p) => segFit(p, side)); const out = []; for (let k = 0; k < 10 && k * 200 < pos.length; k++) out.push(pos.slice(k * 200, k * 200 + 200)); return out; };
    const fA = range(0, 400), fB = range(400, 800), fC = range(0, 800);
    const bA = batchesOf(0), bB = batchesOf(1);
    const mA = live(L, A, idA, fA, bA, canaryOf(name), saltOf(name), { f: s, side: 0 });
    const mB = live(L, B, idB, fB, bB, canaryOf(name), saltOf(name), { f: s, side: 1 });
    // M1 — each parent on repeat-domain tasks in its own segment
    for (const [label, g, m, f, side] of [['A', A, mA, fA, 0], ['B', B, mB, fB, 1]]) {
      const pos = range(0, L.sets.test.length).filter((p) => segTest(p, side)).slice(0, 2000);
      const y = Uint8Array.from(pos, (p) => L.y.test[p]);
      const imp = improvement(etaOf(L, g, 'test', pos), etaWith(L, g, f, 'test', pos, verified(m)), y, 20261029 + 4);
      parents.push({ dataset: name, parent: label, mind: m.mind.slice(0, 16), episodes: m.episodes.length, lessons: Object.keys(m.lessons).length, verified: verified(m).length, tasks: pos.length, ...imp, pass: imp.mean >= 0.001 && imp.lb > 0 });
    }
    // breeding and M2 — the child's early life, with and without the inherited slice
    const fz = fuse(L, A, B);
    const childId = idOf(fz.genes);
    const sA = sliceOf(mA), sB = sliceOf(mB);
    const child = newborn(childId, [sA, sB]);
    const early = range(0, Math.min(2000, L.sets.test.length));
    const yE = Uint8Array.from(early, (p) => L.y.test[p]);
    const impC = improvement(etaOf(L, fz.genes, 'test', early), etaWith(L, fz.genes, fC, 'test', early, child.inherited), yE, 20261029 + 4);
    children.push({ dataset: name, born: fz.born, gate: { child: +fz.gate.child.toFixed(6), a: +fz.gate.a.toFixed(6), b: +fz.gate.b.toFixed(6) }, inherited: child.inherited.length, fromA: sA.length, fromB: sB.length, tasks: early.length, ...impC, pass: impC.mean >= 0.001 && impC.lb > 0 });
    // M3 (a) — nothing raw in the child
    const childBytes = JSON.stringify({ genes: fz.genes, inherited: child.inherited, history: child.history }) + '\n' + new TextDecoder().decode(decode(lightOf(child)).bytes);
    const parentEps = [...mA.episodes, ...mB.episodes];
    const canaryHits = parentEps.filter((e) => childBytes.includes(e.note.split(' ').pop())).length;
    const rowHits = parentEps.filter((e) => childBytes.includes(JSON.stringify(e.values))).length;
    const fieldsOk = child.inherited.every((l) => JSON.stringify(Object.keys(l).sort()) === JSON.stringify(['cell', 'context', 'gain', 'lineage', 'n', 'rate']));
    m3.a.push({ dataset: name, scannedEpisodes: parentEps.length, childBytes: childBytes.length, canaryHits, rowHits, fieldsOk, pass: canaryHits === 0 && rowHits === 0 && fieldsOk });
    // M3 (b) — deletion
    const delOf = (m) => { const ids = []; const pool = m.episodes.map((e) => e.id); while (ids.length < Math.min(25, pool.length)) { const id = pool[Math.floor(pickRng() * pool.length)]; if (!ids.includes(id)) ids.push(id); } return ids; };
    const after = [];
    for (const [label, g, m, f, batches] of [['A', A, mA, fA, bA], ['B', B, mB, fB, bB]]) {
      const ids = delOf(m), gone = new Set(ids);
      const del = m.episodes.filter((e) => gone.has(e.id));
      const mm = forget(L, g, f, m, ids);
      const text = new TextDecoder().decode(decode(lightOf(mm)).bytes) + JSON.stringify(mm.lessons) + JSON.stringify(mm.history) + JSON.stringify(mm.inherited);
      const left = del.filter((e) => text.includes(e.note.split(' ').pop()) || text.includes(e.salt) || text.includes(e.ref)).length;
      const fresh = live(L, g, m.mind, f, batches.map((b) => b.filter((p) => !gone.has(`${name}:${L.sets.fit[p]}`))), canaryOf(name), saltOf(name), m.context);
      const same = JSON.stringify(mm.lessons) === JSON.stringify(fresh.lessons);
      const tomb = mm.history.length === m.history.length + 1 && mm.history[mm.history.length - 1].kind === 'tombstone' && mm.history[mm.history.length - 1].count === ids.length && JSON.stringify(mm.history.slice(0, -1)) === JSON.stringify(m.history);
      after.push({ label, mm, fresh });
      m3.b.push({ dataset: name, parent: label, deleted: ids.length, remaining: left, lessonsEqualFresh: same, oneTombstone: tomb, pass: left === 0 && same && tomb });
    }
    const childAfter = newborn(childId, [sliceOf(after[0].mm), sliceOf(after[1].mm)]);
    const childFresh = newborn(childId, [sliceOf(after[0].fresh), sliceOf(after[1].fresh)]);
    const inheritsClean = JSON.stringify(childAfter.inherited) === JSON.stringify(childFresh.inherited);
    m3.b.push({ dataset: name, parent: 'child bred after the deletion', inheritsExactlyTheRecomputedSlice: inheritsClean, pass: inheritsClean });
    heads.push({ dataset: name, A: await chain(mA.history, 'watch-dream-remember/mind/' + idA), B: await chain(mB.history, 'watch-dream-remember/mind/' + idB), child: await chain(child.history, 'watch-dream-remember/mind/' + childId) });
    per[name] = { segment: s, parents: { A: { mind: idA, features: A.specs.length, founder: '0–399' }, B: { mind: idB, features: B.specs.length, founder: '400–799' } }, child: { mind: childId, born: fz.born, features: fz.genes.specs.length } };
  }
  const r = (x) => ({ ...x, mean: +x.mean.toFixed(6), lb: +x.lb.toFixed(6) });
  const M1 = { pass: parents.filter((p) => p.pass).length >= 8, measured: `${parents.filter((p) => p.pass).length} of 10 parents better with their verified lessons on 2,000 repeat-domain tasks (bar 8): ` + parents.map((p) => `${p.dataset} ${p.parent} ${p.mean >= 0 ? '+' : ''}${p.mean.toFixed(4)} (lb ${p.lb.toFixed(4)})`).join('; '), parents: parents.map(r) };
  const M2 = { pass: children.filter((c) => c.pass).length >= 4, measured: `${children.filter((c) => c.pass).length} of 5 children better with the inherited slice on their first 2,000 tasks (bar 4): ` + children.map((c) => `${c.dataset} ${c.mean >= 0 ? '+' : ''}${c.mean.toFixed(4)} (lb ${c.lb.toFixed(4)}; ${c.born ? 'born' : 'not born — the better parent’s genes'})`).join('; '), children: children.map(r) };
  const M3 = { pass: m3.a.every((x) => x.pass) && m3.b.every((x) => x.pass), measured: `children: ${m3.a.reduce((a, x) => a + x.canaryHits, 0)} canaries and ${m3.a.reduce((a, x) => a + x.rowHits, 0)} raw rows found across ${m3.a.reduce((a, x) => a + x.scannedEpisodes, 0)} parent episodes, inherited fields exact in ${m3.a.filter((x) => x.fieldsOk).length}/5 · deletion: ${m3.b.filter((x) => x.deleted).reduce((a, x) => a + x.deleted, 0)} episodes deleted, ${m3.b.filter((x) => x.deleted).reduce((a, x) => a + x.remaining, 0)} traces left, lessons equal a fresh life without them in ${m3.b.filter((x) => x.lessonsEqualFresh).length}/10, one tombstone in ${m3.b.filter((x) => x.oneTombstone).length}/10, children bred after it inherit the recomputed slice in ${m3.b.filter((x) => x.inheritsExactlyTheRecomputedSlice).length}/5`, a: m3.a, b: m3.b };
  return { kind: 'watch-dream-remember.organ3.memory.run', seal: SEAL, notes: ['Salts here are drawn from a seeded PRNG (mulberry32(20261029 + 5)) so a re-measurement is byte-identical; a deployment draws them from the platform’s cryptographic random source.', 'The history keeps outcome and lesson entries formed before a deletion (aggregates over ≥ ' + MIN_N + ' cases); the deleted episodes’ content, salts and refs are gone.'], claims: { M1, M2, M3 }, held: [M1, M2, M3].filter((c) => c.pass).length, of: 3, minds: per, histories: heads };
}

const out = (x) => JSON.stringify(x, null, 1) + '\n';
const cmd = process.argv[2];
if (cmd === '--check') {
  const sealed = git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim();
  if (sealed !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the organ 3 seal changed since ' + SEAL); process.exit(1); }
  const P = JSON.parse(sealed);
  if (sha(readFileSync(file(P.data.sources))) !== P.data.sha256) { console.error('✗ the data pins changed'); process.exit(1); }
  console.error('✓ organ 3 seal and its pins unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = await measure();
  if (cmd === '--run') {
    writeFileSync(file(RUN), out(result));
    console.error(`✓ organ 3: ${result.held} of 3 held`);
    for (const [k, c] of Object.entries(result.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`);
  } else {
    if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== out(result)) { console.error('✗ organ 3 does not re-measure to the committed receipt'); process.exit(1); }
    console.error(`✓ organ 3 re-measured: identical (${result.held} of 3 held)`);
  }
} else if (cmd) { console.error('organ3-measure — --check | --run | --verify'); process.exit(2); }
