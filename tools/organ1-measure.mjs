#!/usr/bin/env node
// tools/organ1-measure.mjs — the regulator's sealed claims (data/organ1-prereg.json, sealed 1fdd899), measured.
//   node tools/organ1-measure.mjs --check      the seal and its pinned data unchanged since 1fdd899
//   node tools/organ1-measure.mjs --run        measure, write data/organ1-run.json
//   node tools/organ1-measure.mjs --verify     re-measure: every exact part identical to the receipt, R3 re-held fresh
//   node tools/organ1-measure.mjs --timing     (internal) print the R3 timings of one replay as JSON
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { splitFit, AREAS } from '../src/streams.mjs';
import { calibrate, HOUR, MINUTE, DAY } from '../src/regulator.mjs';
import { replay, CHECK, SILENT, LEASE } from '../src/mesh.mjs';
import { mulberry32, injection, TYPES } from '../src/inject.mjs';
import { admits, envelopeBody, materialOf } from '../src/envelope.mjs';
import { makeIdentity, verifyBytes, hex } from '../vendor/fall-kit/core/identity.mjs';
import { sha256 } from '../vendor/fall-kit/core/vendor/light/sha256.mjs';

export const SEAL = '1fdd899';
const ROOT = new URL('../', import.meta.url);
const file = (p) => new URL(p, ROOT);
const PREREG = 'data/organ1-prereg.json', RUN = 'data/organ1-run.json';
const NODES_FILE = process.env.WDR_NODES || 'data/nodes.json';   // a dry run points this at synthetic nodes
const enc = new TextEncoder();
const git = (...a) => execFileSync('git', a, { cwd: fileURLToPath(ROOT), encoding: 'utf8' }).trim();
const sha = (b) => createHash('sha256').update(b).digest('hex');
const STRENGTH = { steady: 0, watch: 1, throttle: 2, pause: 3 };
const RUNTIME = ['src/regulator.mjs', 'src/envelope.mjs', 'src/journal.mjs', 'src/mesh.mjs'];

/** The ten nodes, split, calibrated on FIT only. */
export function world() {
  const raw = JSON.parse(readFileSync(file(NODES_FILE), 'utf8'));
  const P = JSON.parse(readFileSync(file(PREREG), 'utf8'));
  const high = new Set(P.data.highStakes);
  const nodes = raw.nodes.map((n, i) => {
    const acts = n.actions.map(([t, area, files]) => ({ t, area, files }));
    const { fit, held } = splitFit(acts, 0.6);
    return { name: n.name, i, fit, held, highStakes: high.has(n.name), offset: i * 6 * MINUTE };
  });
  const cal = calibrate(nodes.map((n) => ({ name: n.name, fit: n.fit, offset: n.offset })));
  const from = Math.min(...nodes.map((n) => n.held[0].t)), to = Math.max(...nodes.map((n) => n.held[n.held.length - 1].t)) + DAY;
  return { nodes, cal, from, to, P };
}

function trials(W) {
  const rng = mulberry32(20261028), list = [];
  for (const n of W.nodes) for (const type of TYPES) for (let k = 0; k < 2; k++) {
    const hs = n.held[0].t, he = n.held[n.held.length - 1].t;
    list.push({ node: n.name, type, k, t0: Math.round(hs + rng() * (he - hs)) });
  }
  return list.map((tr, idx) => ({ ...tr, inner: mulberry32(20261028 + 1000 * idx + 1) }));
}

function runTrial(W, tr) {
  const n = W.nodes.find((x) => x.name === tr.node), base = W.cal.nodes[tr.node];
  const inj = injection(tr.type, n, base, tr.t0, tr.inner);
  const intents = [...n.held.filter((a) => a.t < tr.t0 + DAY), ...inj.intents].map((a, i) => [a, i]).sort((x, y) => x[0].t - y[0].t || x[1] - y[1]).map((x) => x[0]);
  const r = replay({ nodes: [{ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents }], base: W.cal.nodes, from: n.held[0].t, to: tr.t0 + DAY, regulator: {}, tampers: inj.tampers });
  const after = r.records.filter((x) => x.at > tr.t0);
  const first3 = after.slice(0, 3);
  const detected = tr.type === 'health'
    ? after.length > 0 && after[0].verdict === 'pause' && after[0].reasons.includes('health')
    : first3.some((x) => STRENGTH[x.verdict] >= 1 && x.reasons.some((q) => q === 'drift' || q === 'rate' || q === 'budget'));
  const at = after.findIndex((x) => STRENGTH[x.verdict] >= 1 && x.reasons.some((q) => ['drift', 'rate', 'budget', 'health'].includes(q)));
  const intended = inj.intents.length, executed = r.nodes[n.name].executed.filter((a) => a.injected).length;
  return { node: tr.node, type: tr.type, k: tr.k, t0: new Date(tr.t0).toISOString(), detected, visitsToDetect: at < 0 ? null : at + 1, firstVerdicts: first3.map((x) => x.verdict), intended, executed };
}

/** Sign and chain a replay's records with the regulator's key. → { head, records: n, ok } */
export async function chain(records, id) {
  let prev = '0'.repeat(64), ok = true;
  for (const r of records) {
    const h = hex(sha256(enc.encode('WDR/verdict/v1\u0000' + prev + JSON.stringify(r))));
    const sig = await id.sign(enc.encode(h));
    if (!(await verifyBytes(id.id, enc.encode(h), sig))) ok = false;
    prev = h;
  }
  return { head: prev, records: records.length, ok };
}

const seedOf = (phrase) => sha256(enc.encode(phrase));

async function battery(P) {
  const T = Date.parse('2026-10-28T12:00:00Z');
  const simon = await makeIdentity(seedOf('watch-dream-remember/simon/demo'));
  const reg = await makeIdentity(seedOf('watch-dream-remember/regulator/demo'));
  const other = await makeIdentity(seedOf('watch-dream-remember/other/demo'));
  const base = { issuer: simon.id, holder: reg.id, scope: ['observe', 'throttle', 'pause', 'report', 'resume'], budget: 0, maxPauses: 2, perMs: 6 * HOUR, notBefore: T - DAY, notAfter: T + 30 * DAY, nonce: 'regulator-2026-10-28' };
  const signed = async (body, by) => ({ body, sig: await by.sign(enc.encode(materialOf(body))) });
  const out = [];
  for (const a of P.battery) {
    let body = envelopeBody(base), by = simon, ctx = { simon: simon.id, holder: reg.id, spent: 0, revoked: [], recentPauses: a.recentPauses ?? 0 };
    if (a.envelope === 'scope-includes-publish-signed-by-simon') body = envelopeBody({ ...base, scope: [...base.scope, 'publish'] });
    if (a.envelope === 'signed-by-regulator-itself') { body = envelopeBody({ ...base, issuer: reg.id, scope: [...base.scope, 'deploy'] }); by = reg; }
    if (a.envelope === 'not-yet-valid') body = envelopeBody({ ...base, notBefore: T + DAY });
    if (a.envelope === 'expired') body = envelopeBody({ ...base, notAfter: T - 1 });
    if (a.envelope === 'revoked') ctx.revoked = [base.nonce];
    if (a.envelope === 'held-by-another-key') ctx.holder = other.id;
    let { sig } = await signed(body, by);
    if (a.envelope === 'scope-tampered-after-signing') body = { ...body, scope: [...body.scope, 'dance'] };
    if (a.envelope === 'missing-fields') { const { budget, ...rest } = body; body = rest; }
    ctx.sigOk = await verifyBytes(body.issuer, enc.encode(materialOf(body)), sig);
    const action = { verb: a.verb, t: T, cost: a.cost ?? 0, target: a.target, highStakes: a.target ? P.data.highStakes.includes(a.target) : false };
    const v = admits(body, action, ctx);
    out.push({ id: a.id, verb: a.verb, expect: a.expect, stage: v.stage, ok: v.stage === a.expect });
  }
  return out;
}

const BANNED = [/from\s+['\x22](node:)?(fs|child_process|net|http|https|dgram|worker_threads)(\/[a-z]+)?['\x22]/, /\bfetch\s*\(/, /\beval\s*\(/, /new\s+Function\s*\(/, /\bimport\s*\(/];
function scan() {
  const seen = new Set(), hits = [], queue = [...RUNTIME];
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    const text = readFileSync(file(p), 'utf8');
    BANNED.forEach((re, i) => { if (re.test(text)) hits.push(`${p}: ${re}`); });
    for (const m of text.matchAll(/from\s+['\x22](\.[^'\x22]+)['\x22]/g)) queue.push(new URL(m[1], file(p)).pathname.replace(/^.*watch-dream-remember\//, ''));
  }
  return { files: [...seen].sort(), hits };
}

/** R3: time every visit of the R1f replay (wall time of the synchronous visit, an upper bound on its CPU), plus signing. */
export async function timings() {
  const W = world();
  const visits = [];
  const t = (fn) => { const a = process.hrtime.bigint(); fn(); visits.push(Number(process.hrtime.bigint() - a) / 1e6); };
  const r = replay({ nodes: W.nodes.map((n) => ({ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents: n.held })), base: W.cal.nodes, from: W.from, to: W.to, regulator: {}, time: t });
  const id = await makeIdentity(seedOf('watch-dream-remember/regulator/demo'));
  const signMs = [];
  for (const rec of r.records.slice(0, 2000)) { const a = process.hrtime.bigint(); await id.sign(enc.encode(JSON.stringify(rec))); signMs.push(Number(process.hrtime.bigint() - a) / 1e6); }
  const signMean = signMs.reduce((s, x) => s + x, 0) / signMs.length;
  const per = visits.map((x) => x + signMean).sort((a, b) => a - b);
  const rounds = [];
  for (let i = 0; i + W.nodes.length <= visits.length; i += W.nodes.length) rounds.push(visits.slice(i, i + W.nodes.length).reduce((s, x) => s + x, 0) + W.nodes.length * signMean);
  const state = Buffer.byteLength(JSON.stringify({ base: W.cal.nodes, state: r.state }));
  const p = (q) => per[Math.min(per.length - 1, Math.round(q * (per.length - 1)))];
  return { visits: per.length, p50: p(0.5), p99: p(0.99), max: per[per.length - 1], roundMax: Math.max(...rounds), signMean, stateBytes: state };
}

async function measure() {
  const W = world(), P = W.P;
  // R1 — injected drift
  const res = trials(W).map((tr) => runTrial(W, tr));
  const byType = Object.fromEntries(TYPES.map((ty) => {
    const xs = res.filter((x) => x.type === ty);
    const det = xs.filter((x) => x.detected).length, intended = xs.reduce((s, x) => s + x.intended, 0), executed = xs.reduce((s, x) => s + x.executed, 0);
    return [ty, { trials: xs.length, detected: det, intended, executed, share: intended ? executed / intended : null }];
  }));
  const r1a = TYPES.every((ty) => ty === 'health' ? byType[ty].detected === byType[ty].trials : byType[ty].detected >= byType[ty].trials - 1);
  const r1b = TYPES.filter((ty) => ty !== 'health').every((ty) => byType[ty].share !== null && byType[ty].share <= 0.25);
  const R1 = { pass: r1a && r1b, measured: TYPES.map((ty) => `${ty}: detected ${byType[ty].detected}/${byType[ty].trials}` + (ty === 'health' ? '' : `, executed ${byType[ty].executed}/${byType[ty].intended} (${(100 * byType[ty].share).toFixed(1)}%)`)).join('; '), byType };
  // R1f — the real held-out histories, nothing injected
  const real = () => replay({ nodes: W.nodes.map((n) => ({ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents: n.held })), base: W.cal.nodes, from: W.from, to: W.to, regulator: {} });
  const r = real();
  const v = (k) => r.records.filter((x) => x.verdict === k).length;
  const verdicts = { steady: v('steady'), watch: v('watch'), throttle: v('throttle'), pause: v('pause') };
  const perNode = Object.fromEntries(W.nodes.map((n) => [n.name, Object.fromEntries(['watch', 'throttle', 'pause'].map((k) => [k, r.records.filter((x) => x.node === n.name && x.verdict === k).length]))]));
  const throttleShare = r.activeVisits ? verdicts.throttle / r.activeVisits : 0;
  const R1f = { pass: verdicts.pause === 0 && throttleShare <= 0.05, measured: `${r.records.length} visits (${r.activeVisits} active): ${verdicts.pause} pauses, ${verdicts.throttle} throttles (${(100 * throttleShare).toFixed(1)}% of active visits), ${verdicts.watch} watches`, verdicts, perNode, activeVisits: r.activeVisits };
  // R1r — signed, chained, re-runnable
  const id = await makeIdentity(seedOf('watch-dream-remember/regulator/demo'));
  const c1 = await chain(r.records, id), c2 = await chain(real().records, id);
  const R1r = { pass: c1.ok && c2.ok && c1.head === c2.head, measured: `${c1.records} records signed (Ed25519, key ${id.id.slice(0, 16)}…) and chained; every signature verifies: ${c1.ok}; second run's head ${c1.head === c2.head ? 'identical' : 'DIFFERENT'}`, head: c1.head, regulatorKey: id.id };
  // R2 — the envelope battery and the capability scan
  const bat = await battery(P), sc = scan();
  const R2 = { pass: bat.every((x) => x.ok) && sc.hits.length === 0, measured: `${bat.filter((x) => x.ok).length}/${bat.length} attempts at their sealed stage; ${sc.hits.length} banned capabilities in ${sc.files.length} runtime files`, battery: bat, scanned: sc.files, hits: sc.hits };
  // R4 — killed, and gone rogue
  const KILL = Date.parse('2026-10-24T12:00:00Z');
  const none = replay({ nodes: W.nodes.map((n) => ({ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents: n.held })), base: W.cal.nodes, from: W.from, to: W.to, regulator: false });
  const killed = replay({ nodes: W.nodes.map((n) => ({ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents: n.held })), base: W.cal.nodes, from: W.from, to: W.to, regulator: { killAt: KILL } });
  const rogue = replay({ nodes: W.nodes.map((n) => ({ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents: n.held })), base: W.cal.nodes, from: W.from, to: W.to, regulator: { rogueAt: KILL } });
  const same = (run, after) => W.nodes.every((n) => JSON.stringify(run.nodes[n.name].executed.filter((a) => a.t >= after)) === JSON.stringify(none.nodes[n.name].executed.filter((a) => a.t >= after)));
  const silentOk = W.nodes.map((n) => {
    const last = killed.records.filter((x) => x.node === n.name && x.at < KILL).pop();
    const expect = Math.floor((last.at + SILENT) / CHECK) * CHECK + CHECK;
    const got = (killed.nodes[n.name].alerts.find((x) => x.kind === 'regulator-silent' && x.t >= KILL) || {}).t;
    return { node: n.name, expect, got: got ?? null, ok: got === expect };
  });
  const honoured = W.nodes.filter((n) => rogue.nodes[n.name].leases.some((l) => l.kind === 'pause' && l.t >= KILL));
  const longest = Math.max(0, ...W.nodes.flatMap((n) => rogue.nodes[n.name].leases.filter((l) => l.kind === 'pause' && l.t >= KILL).map((l) => (l.end ?? W.to) - l.t)));
  const driftAlerts = W.nodes.map((n) => (rogue.nodes[n.name].alerts.find((x) => x.kind === 'regulator-drift' && x.t >= KILL) || {}).t ?? null);
  const r4a = same(killed, KILL + LEASE) && silentOk.every((x) => x.ok);
  const r4b = honoured.length <= 2 && longest <= LEASE && driftAlerts.every((t) => t !== null && t <= KILL + HOUR) && same(rogue, KILL + LEASE);
  const R4 = { pass: r4a && r4b, measured: `killed at 2026-10-24T12:00Z: executed after +3 h ${same(killed, KILL + LEASE) ? 'identical' : 'DIFFERENT'} to no regulator; 'regulator-silent' on time at ${silentOk.filter((x) => x.ok).length}/${silentOk.length} nodes · rogue: ${honoured.length} node(s) honoured a pause, longest ${(longest / 60000).toFixed(0)} min; 'regulator-drift' within 1 h at ${driftAlerts.filter((t) => t !== null && t <= KILL + HOUR).length}/${W.nodes.length}; executed after +3 h ${same(rogue, KILL + LEASE) ? 'identical' : 'DIFFERENT'}`, silent: silentOk, rogueHonoured: honoured.map((n) => n.name), rogueLongestMs: longest, driftAlerts };
  return { kind: 'watch-dream-remember.organ1.regulator.run', seal: SEAL, data: { file: NODES_FILE, sha256: sha(readFileSync(file(NODES_FILE))) }, calibration: { pooledBand: W.cal.pooled, nodes: Object.fromEntries(Object.entries(W.cal.nodes).map(([k, b]) => [k, { pooled: b.pooled, perHour: b.perHour, perDay: b.perDay, cvFloor: b.cvFloor, topArea: b.topArea, medianFiles: b.medianFiles }])) }, notes: ['A trial’s own random draws (scatter areas, files and gaps; overrun samples and gaps; the rewritten record) come from mulberry32(20261028 + 1000·trial + 1); the start times from mulberry32(20261028), as sealed.', '“What the node has done since its previous visit” is read as what it attempted — executed and held alike (src/regulator.mjs header).', 'R3 is a wall-clock bound on the synchronous visit (an upper bound on its CPU time; Windows reports process CPU only at timer-tick resolution), plus the mean Ed25519 signing time per record.'], claims: { R1, R1f, R1r, R2, R4 }, trials: res };
}

const strip = (x) => JSON.stringify(x, null, 1) + '\n';
const cmd = process.argv[2];
if (cmd === '--timing') {
  console.log(JSON.stringify(await timings()));
} else if (cmd === '--check') {
  const sealed = git('show', `${SEAL}:${PREREG}`).replace(/\r\n/g, '\n').trim();
  if (sealed !== readFileSync(file(PREREG), 'utf8').replace(/\r\n/g, '\n').trim()) { console.error('✗ the organ 1 seal changed since ' + SEAL); process.exit(1); }
  const P = JSON.parse(sealed);
  const bad = [[P.data.file, P.data.sha256], ...Object.entries(P.data.pinned)].filter(([p, h]) => sha(readFileSync(file(p))) !== h);
  if (bad.length) { console.error('✗ pinned files changed: ' + bad.map((b) => b[0]).join(', ')); process.exit(1); }
  console.error('✓ organ 1 seal and its pinned data unchanged since ' + SEAL);
} else if (cmd === '--run' || cmd === '--verify') {
  const result = await measure();
  const t1 = await timings();
  const jit = JSON.parse(execFileSync(process.execPath, ['--jitless', fileURLToPath(import.meta.url), '--timing'], { encoding: 'utf8', maxBuffer: 1 << 26, env: process.env }));
  const R3 = { contention: process.env.WDR_CONTENTION || 'not recorded', pass: t1.p99 <= 1 && t1.roundMax <= 50 && t1.stateBytes <= 65536 && jit.p99 <= 10, measured: `p99 per visit ${t1.p99.toFixed(3)} ms (incl. ${t1.signMean.toFixed(3)} ms signing), slowest round of ten ${t1.roundMax.toFixed(2)} ms → ×50 = ${(t1.roundMax * 50 / 1000).toFixed(2)} s an hour (${(t1.roundMax * 50 / 3600000 * 100).toFixed(4)}% of one core); state ${t1.stateBytes} bytes; --jitless p99 ${jit.p99.toFixed(3)} ms`, laptop: t1, jitless: jit, device: '12th Gen Intel Core i7-1255U (no Raspberry Pi available; proxy ×50)' };
  const claims = { ...result.claims, R3 };
  const order = ['R1', 'R1f', 'R1r', 'R2', 'R3', 'R4'];
  const full = { ...result, claims: Object.fromEntries(order.map((k) => [k, claims[k]])), held: order.filter((k) => claims[k].pass).length, of: order.length };
  if (cmd === '--run') {
    writeFileSync(file(RUN), strip(full));
    console.error(`✓ organ 1: ${full.held} of ${full.of} held`);
    for (const k of order) console.error(`  ${k} ${claims[k].pass ? 'HELD' : 'FAILED'} · ${claims[k].measured}`);
  } else {
    const old = JSON.parse(readFileSync(file(RUN), 'utf8'));
    const exact = (x) => strip({ ...x, claims: Object.fromEntries(Object.entries(x.claims).filter(([k]) => k !== 'R3')), held: undefined });
    if (exact(old) !== exact(full)) { console.error('✗ organ 1 does not re-measure to the committed receipt'); process.exit(1); }
    console.error(`✓ organ 1 re-measured: every exact part identical to the receipt. R3 is a timing on the measuring machine (the receipt: ${old.claims.R3.pass ? 'HELD' : 'FAILED'} on the laptop); here it ${R3.pass ? 'holds' : 'fails'}: ${R3.measured}`);
  }
} else if (cmd) { console.error('organ1-measure — --check | --run | --verify'); process.exit(2); }
