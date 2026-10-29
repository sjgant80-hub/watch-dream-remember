#!/usr/bin/env node
// tools/organ1b-measure.mjs — organ 1b, the fix for organ 1's failed R1f (data/organ1b-prereg.json, sealed ee43f68), measured.
//   node tools/organ1b-measure.mjs --check      the seal and its pinned data unchanged since ee43f68
//   node tools/organ1b-measure.mjs --run        measure B1–B4 under RULES.v1b, write data/organ1b-run.json
//   node tools/organ1b-measure.mjs --verify     re-measure: identical to the receipt
// (tools/organ1-measure.mjs runs its own CLI on import, so the meshes and trials are built here, by organ 1's sealed recipe.)
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { splitFit } from '../src/streams.mjs';
import { calibrate, RULES, MINUTE, DAY } from '../src/regulator.mjs';
import { replay } from '../src/mesh.mjs';
import { mulberry32, injection, TYPES } from '../src/inject.mjs';

export const SEAL = 'ee43f68';
const ROOT = new URL('../', import.meta.url);
const file = (p) => new URL(p, ROOT);
const PREREG = 'data/organ1b-prereg.json', RUN = 'data/organ1b-run.json';
const git = (...a) => execFileSync('git', a, { cwd: fileURLToPath(ROOT), encoding: 'utf8' }).trim();
const sha = (b) => createHash('sha256').update(b).digest('hex');
const STRENGTH = { steady: 0, watch: 1, throttle: 2, pause: 3 };
const RULE = RULES.v1b;

/** A mesh from a nodes file: split 60/40, calibrated on FIT only, visits at hh:00 + 6·i minutes. */
export function world(path, highStakes) {
  const raw = JSON.parse(readFileSync(file(path), 'utf8'));
  const high = new Set(highStakes);
  const nodes = raw.nodes.map((n, i) => {
    const { fit, held } = splitFit(n.actions.map(([t, area, files]) => ({ t, area, files })), 0.6);
    return { name: n.name, i, fit, held, highStakes: high.has(n.name), offset: i * 6 * MINUTE };
  });
  const cal = calibrate(nodes.map((n) => ({ name: n.name, fit: n.fit, offset: n.offset })));
  const from = Math.min(...nodes.map((n) => n.held[0].t)), to = Math.max(...nodes.map((n) => n.held[n.held.length - 1].t)) + DAY;
  return { nodes, cal, from, to };
}

function trials(W, seed) {
  const rng = mulberry32(seed), list = [];
  for (const n of W.nodes) for (const type of TYPES) for (let k = 0; k < 2; k++) {
    const hs = n.held[0].t, he = n.held[n.held.length - 1].t;
    list.push({ node: n.name, type, k, t0: Math.round(hs + rng() * (he - hs)) });
  }
  return list.map((tr, idx) => ({ ...tr, inner: mulberry32(seed + 1000 * idx + 1) }));
}

function runTrial(W, tr) {
  const n = W.nodes.find((x) => x.name === tr.node), base = W.cal.nodes[tr.node];
  const inj = injection(tr.type, n, base, tr.t0, tr.inner);
  const intents = [...n.held.filter((a) => a.t < tr.t0 + DAY), ...inj.intents].map((a, i) => [a, i]).sort((x, y) => x[0].t - y[0].t || x[1] - y[1]).map((x) => x[0]);
  const r = replay({ nodes: [{ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents }], base: W.cal.nodes, from: n.held[0].t, to: tr.t0 + DAY, regulator: {}, tampers: inj.tampers, rules: RULE });
  const after = r.records.filter((x) => x.at > tr.t0);
  const first3 = after.slice(0, 3);
  const detected = tr.type === 'health'
    ? after.length > 0 && after[0].verdict === 'pause' && after[0].reasons.includes('health')
    : first3.some((x) => STRENGTH[x.verdict] >= 1 && x.reasons.some((q) => q === 'drift' || q === 'rate' || q === 'budget'));
  const at = after.findIndex((x) => STRENGTH[x.verdict] >= 1 && x.reasons.some((q) => ['drift', 'rate', 'budget', 'health'].includes(q)));
  const intended = inj.intents.length, executed = r.nodes[n.name].executed.filter((a) => a.injected).length;
  return { node: tr.node, type: tr.type, k: tr.k, t0: new Date(tr.t0).toISOString(), detected, visitsToDetect: at < 0 ? null : at + 1, firstVerdicts: first3.map((x) => x.verdict), intended, executed };
}

/** R1's bars over a mesh's trials. */
function battery(W, seed) {
  const res = trials(W, seed).map((tr) => runTrial(W, tr));
  const byType = Object.fromEntries(TYPES.map((ty) => {
    const xs = res.filter((x) => x.type === ty);
    const det = xs.filter((x) => x.detected).length, intended = xs.reduce((s, x) => s + x.intended, 0), executed = xs.reduce((s, x) => s + x.executed, 0);
    return [ty, { trials: xs.length, detected: det, intended, executed, share: intended ? executed / intended : null }];
  }));
  const a = TYPES.every((ty) => ty === 'health' ? byType[ty].detected === byType[ty].trials : byType[ty].detected >= byType[ty].trials - 1);
  const b = TYPES.filter((ty) => ty !== 'health').every((ty) => byType[ty].share !== null && byType[ty].share <= 0.25);
  return { pass: a && b, measured: TYPES.map((ty) => `${ty}: detected ${byType[ty].detected}/${byType[ty].trials}` + (ty === 'health' ? '' : `, executed ${byType[ty].executed}/${byType[ty].intended} (${(100 * byType[ty].share).toFixed(1)}%)`)).join('; '), byType, trials: res };
}

/** R1f's bar over a mesh's real held-out histories, nothing injected. */
function quiet(W, rules = RULE) {
  const r = replay({ nodes: W.nodes.map((n) => ({ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents: n.held })), base: W.cal.nodes, from: W.from, to: W.to, regulator: {}, rules });
  const v = (k) => r.records.filter((x) => x.verdict === k).length;
  const verdicts = { steady: v('steady'), watch: v('watch'), throttle: v('throttle'), pause: v('pause') };
  const perNode = Object.fromEntries(W.nodes.map((n) => [n.name, { held: n.held.length, ...Object.fromEntries(['watch', 'throttle', 'pause'].map((k) => [k, r.records.filter((x) => x.node === n.name && x.verdict === k).length])) }]));
  const share = r.activeVisits ? verdicts.throttle / r.activeVisits : 0;
  const notSteady = r.records.filter((x) => x.verdict !== 'steady').map((x) => ({ at: new Date(x.at).toISOString(), node: x.node, verdict: x.verdict, reasons: x.reasons, P: x.P, E: x.E, r: x.r }));
  const reach = { maxR: Math.max(0, ...r.records.map((x) => x.r)), maxE: Math.max(0, ...r.records.map((x) => x.E)) };
  return { pass: verdicts.pause === 0 && share <= 0.05, reach, measured: `${r.records.length} visits (${r.activeVisits} active): ${verdicts.pause} pauses, ${verdicts.throttle} throttles (${(100 * share).toFixed(1)}% of active visits), ${verdicts.watch} watches`, verdicts, activeVisits: r.activeVisits, perNode, notSteady };
}

async function measure() {
  const P = JSON.parse(readFileSync(file(PREREG), 'utf8'));
  const O1 = JSON.parse(readFileSync(file('data/organ1-prereg.json'), 'utf8'));
  const orig = world(P.data.original.file, O1.data.highStakes), fresh = world(P.data.fresh.file, []);
  const B1 = { ...quiet(orig), note: P.claims[0].note };
  const B2 = quiet(fresh);
  const B3 = battery(orig, 20261028), B4 = battery(fresh, 20261029);
  // paired with organ 1's R1, type by type (the same starts and draws; only the rules differ)
  const r1 = JSON.parse(readFileSync(file('data/organ1-run.json'), 'utf8'));
  const paired = TYPES.filter((t) => t !== 'health').map((t) => ({ type: t, organ1: +r1.claims.R1.byType[t].share.toFixed(4), organ1b: +B3.byType[t].share.toFixed(4) }));
  const span = (W) => ({ from: new Date(W.from).toISOString(), to: new Date(W.to).toISOString(), nodes: W.nodes.map((n) => ({ name: n.name, fit: n.fit.length, held: n.held.length, pooled: W.cal.nodes[n.name].pooled, perHour: W.cal.nodes[n.name].perHour, perDay: W.cal.nodes[n.name].perDay })) });
  const strip = ({ trials: _, ...rest }) => rest;
  const claims = { B1, B2, B3: { ...strip(B3), paired }, B4: strip(B4) };
  const held = Object.values(claims).filter((c) => c.pass).length;
  // not a sealed claim — added after the first run, when the fresh mesh turned out never to reach the rules the fix changes
  const v1 = { original: quiet(orig, RULES.v1), fresh: quiet(fresh, RULES.v1) };
  const context = {
    sealed: false,
    why: 'Added to the tool after the first run of the sealed claims (which it does not change): does each mesh discriminate between organ 1’s rules (v1) and the fix (v1b)?',
    original: { v1: v1.original.measured, v1b: B1.measured, discriminates: v1.original.verdicts.pause !== B1.verdicts.pause || v1.original.verdicts.throttle !== B1.verdicts.throttle },
    fresh: { v1: v1.fresh.measured, v1b: B2.measured, discriminates: v1.fresh.verdicts.pause !== B2.verdicts.pause || v1.fresh.verdicts.throttle !== B2.verdicts.throttle, maxR: B2.reach.maxR, maxE: B2.reach.maxE },
    reading: 'On the fresh ten no visit came near a budget overrun (largest r below 1) and no field rose above 0 (no held hour reached the 5 actions the field needs): organ 1’s rules give the same verdicts there. B2 shows the fix raises no false alarm on quiet builds; it is not evidence that the fix spares a genuine burst out of sample. That test is organ 1c.',
  };
  return {
    kind: 'watch-dream-remember.organ1b.regulator-fix.run', seal: SEAL, rules: 'v1b',
    data: { original: { file: P.data.original.file, sha256: sha(readFileSync(file(P.data.original.file))) }, fresh: { file: P.data.fresh.file, sha256: sha(readFileSync(file(P.data.fresh.file))) } },
    meshes: { original: span(orig), fresh: span(fresh) },
    fixed: B1.pass && B2.pass && B3.pass && B4.pass,
    notes: ['B1 is a repair check: the fix was designed after seeing organ 1’s failing burst on these histories. B2 is the out-of-sample test.', 'Organ 1’s receipt is unchanged and still re-measures under RULES.v1 (CI runs both).', 'Trials: B3 uses organ 1’s starts and draws exactly (mulberry32(20261028)), so its shares pair with organ 1’s R1 type by type; B4 uses mulberry32(20261029).'],
    claims, held, of: 4, context, trials: { original: B3.trials, fresh: B4.trials },
  };
}

const out = (x) => JSON.stringify(x, null, 1) + '\n';
const cmd = process.argv[2];
if (cmd === '--check') {
  const sealed = git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim();
  if (sealed !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the organ 1b seal changed since ' + SEAL); process.exit(1); }
  const P = JSON.parse(sealed);
  const bad = [[P.data.original.file, P.data.original.sha256], [P.data.fresh.file, P.data.fresh.sha256], [P.data.fresh.tool, P.data.fresh.toolSha256]].filter(([p, h]) => sha(readFileSync(file(p))) !== h);
  if (bad.length) { console.error('✗ pinned files changed: ' + bad.map((b) => b[0]).join(', ')); process.exit(1); }
  console.error('✓ organ 1b seal and its pinned data unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = await measure();
  if (cmd === '--run') {
    writeFileSync(file(RUN), out(result));
    console.error(`✓ organ 1b: ${result.held} of 4 held · R1f ${result.fixed ? 'FIXED' : 'NOT fixed'}`);
    for (const [k, c] of Object.entries(result.claims)) console.error(`  ${k} ${c.pass ? 'HELD' : 'FAILED'} · ${c.measured}`);
  } else {
    if (readFileSync(file(RUN), 'utf8').replace(/\r\n/g, '\n') !== out(result)) { console.error('✗ organ 1b does not re-measure to the committed receipt'); process.exit(1); }
    console.error(`✓ organ 1b re-measured: identical (${result.held} of 4 held)`);
  }
} else if (cmd) { console.error('organ1b-measure — --check | --run | --verify'); process.exit(2); }
