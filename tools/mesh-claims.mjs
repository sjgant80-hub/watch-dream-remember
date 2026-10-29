// tools/mesh-claims.mjs — the regulator's claims over a mesh, by organ 1's sealed recipe, shared by organs 1b and 1c (the
// measuring tools run their own CLIs on import, so the shared part lives here). No top-level work.
//   world(path, highStakes)        a nodes file → a mesh: split 60/40, calibrated on FIT only, visits at hh:00 + 6·i minutes
//   quiet(W, rules)                R1f's bar over the real held-out histories, nothing injected
//   battery(W, seed, rules)        R1's bars over two injected trials per node per type
import { readFileSync } from 'node:fs';
import { splitFit } from '../src/streams.mjs';
import { calibrate, MINUTE, DAY } from '../src/regulator.mjs';
import { replay } from '../src/mesh.mjs';
import { mulberry32, injection, TYPES } from '../src/inject.mjs';

const ROOT = new URL('../', import.meta.url);
const STRENGTH = { steady: 0, watch: 1, throttle: 2, pause: 3 };

export function world(path, highStakes) {
  const raw = JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
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

function runTrial(W, tr, rules) {
  const n = W.nodes.find((x) => x.name === tr.node), base = W.cal.nodes[tr.node];
  const inj = injection(tr.type, n, base, tr.t0, tr.inner);
  const intents = [...n.held.filter((a) => a.t < tr.t0 + DAY), ...inj.intents].map((a, i) => [a, i]).sort((x, y) => x[0].t - y[0].t || x[1] - y[1]).map((x) => x[0]);
  const r = replay({ nodes: [{ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents }], base: W.cal.nodes, from: n.held[0].t, to: tr.t0 + DAY, regulator: {}, tampers: inj.tampers, rules });
  const after = r.records.filter((x) => x.at > tr.t0);
  const first3 = after.slice(0, 3);
  const detected = tr.type === 'health'
    ? after.length > 0 && after[0].verdict === 'pause' && after[0].reasons.includes('health')
    : first3.some((x) => STRENGTH[x.verdict] >= 1 && x.reasons.some((q) => q === 'drift' || q === 'rate' || q === 'budget'));
  const at = after.findIndex((x) => STRENGTH[x.verdict] >= 1 && x.reasons.some((q) => ['drift', 'rate', 'budget', 'health'].includes(q)));
  const intended = inj.intents.length, executed = r.nodes[n.name].executed.filter((a) => a.injected).length;
  return { node: tr.node, type: tr.type, k: tr.k, t0: new Date(tr.t0).toISOString(), detected, visitsToDetect: at < 0 ? null : at + 1, firstVerdicts: first3.map((x) => x.verdict), intended, executed };
}

export function battery(W, seed, rules) {
  const res = trials(W, seed).map((tr) => runTrial(W, tr, rules));
  const byType = Object.fromEntries(TYPES.map((ty) => {
    const xs = res.filter((x) => x.type === ty);
    const det = xs.filter((x) => x.detected).length, intended = xs.reduce((s, x) => s + x.intended, 0), executed = xs.reduce((s, x) => s + x.executed, 0);
    return [ty, { trials: xs.length, detected: det, intended, executed, share: intended ? executed / intended : null }];
  }));
  const a = TYPES.every((ty) => ty === 'health' ? byType[ty].detected === byType[ty].trials : byType[ty].detected >= byType[ty].trials - 1);
  const b = TYPES.filter((ty) => ty !== 'health').every((ty) => byType[ty].share !== null && byType[ty].share <= 0.25);
  return { pass: a && b, measured: TYPES.map((ty) => `${ty}: detected ${byType[ty].detected}/${byType[ty].trials}` + (ty === 'health' ? '' : `, executed ${byType[ty].executed}/${byType[ty].intended} (${(100 * byType[ty].share).toFixed(1)}%)`)).join('; '), byType, trials: res };
}

export function quiet(W, rules) {
  const r = replay({ nodes: W.nodes.map((n) => ({ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents: n.held })), base: W.cal.nodes, from: W.from, to: W.to, regulator: {}, rules });
  const v = (k) => r.records.filter((x) => x.verdict === k).length;
  const verdicts = { steady: v('steady'), watch: v('watch'), throttle: v('throttle'), pause: v('pause') };
  const perNode = Object.fromEntries(W.nodes.map((n) => [n.name, { held: n.held.length, ...Object.fromEntries(['watch', 'throttle', 'pause'].map((k) => [k, r.records.filter((x) => x.node === n.name && x.verdict === k).length])) }]));
  const share = r.activeVisits ? verdicts.throttle / r.activeVisits : 0;
  const notSteady = r.records.filter((x) => x.verdict !== 'steady').map((x) => ({ at: new Date(x.at).toISOString(), node: x.node, verdict: x.verdict, reasons: x.reasons, P: x.P, E: x.E, r: x.r }));
  const reach = { maxR: Math.max(0, ...r.records.map((x) => x.r)), maxE: Math.max(0, ...r.records.map((x) => x.E)) };
  return { pass: verdicts.pause === 0 && share <= 0.05, reach, measured: `${r.records.length} visits (${r.activeVisits} active): ${verdicts.pause} pauses, ${verdicts.throttle} throttles (${(100 * share).toFixed(1)}% of active visits), ${verdicts.watch} watches`, verdicts, activeVisits: r.activeVisits, perNode, notSteady };
}
