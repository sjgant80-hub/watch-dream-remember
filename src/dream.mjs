// ════════════════════════════════════════════════════════════════
// dream.mjs — the nightly DREAM and its GATE. Pure, deterministic.
//
// Each night the dream proposes 2 ideas of its own per dataset (random specs from that night's seeded PRNG, skipping
// keys already tested), then THE GATE tests the night's candidates in a fixed order — the dream's own first, then the
// promoted daydreams by priority. A candidate is ADOPTED when the organ with it scores at least 0.0005 nats lower
// GATE log-loss than the organ without it; at most 2 adoptions per dataset a night; each adoption changes the organ the
// next candidate is judged against. An adoption is VERIFIED when its TEST log-loss falls by at least 0.0002 nats.
// TEST is read here only, and only to verify an adoption already made.
// ════════════════════════════════════════════════════════════════
import { keyOf, QS } from './model.mjs';
import { fitOrgan, score } from './lab.mjs';

export const PROPOSE = 2, ADOPT = 0.0005, VERIFY = 0.0002, MAX_ADOPT = 2;
const OPS = ['log', 'sq', 'step', 'cross'];

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The dream's own ideas for one night: PROPOSE per dataset, random, never a key already tested or held. */
export function proposals(lab, organs, tested, rng) {
  const out = [];
  for (const name of Object.keys(lab)) {
    const L = lab[name], have = new Set(organs[name].specs.map(keyOf));
    let made = 0;
    for (let tries = 0; made < PROPOSE && tries < 40; tries++) {
      const op = OPS[Math.floor(rng() * OPS.length)];
      const f = L.features[Math.floor(rng() * L.features.length)];
      const g = L.features[Math.floor(rng() * L.features.length)];
      const q = QS[Math.floor(rng() * QS.length)];
      const spec = op === 'cross' ? { op, f, g } : op === 'step' ? { op, f, q } : { op, f };
      const k = keyOf(spec);
      if (!k || have.has(k) || tested.has(`${name}|${k}`)) continue;
      have.add(k);
      out.push({ key: `${name}|${k}`, dataset: name, spec, source: 'dream', priority: 0 });
      made++;
    }
  }
  return out;
}

/**
 * The gate for one night. → { organs (new), records: [{ key, dataset, source, gate: [before, after], adopted, test?, verified, skipped? }] }
 * `tested` (a Set) gains every key judged; a candidate reached after its dataset's 2 adoptions is skipped, not judged
 * (gate null, not tested). `organs` are not changed (new ones are returned).
 */
export function gate(lab, organs, candidates, tested) {
  const now = { ...organs };
  const gateNow = Object.fromEntries(Object.keys(lab).map((n) => [n, score(lab[n], now[n], 'gate')]));
  const adopted = Object.fromEntries(Object.keys(lab).map((n) => [n, 0]));
  const records = [];
  for (const c of candidates) {
    const L = lab[c.dataset];
    if (!L || tested.has(c.key)) continue;
    if (adopted[c.dataset] >= MAX_ADOPT) { records.push({ key: c.key, dataset: c.dataset, source: c.source, gate: null, adopted: false, verified: false, skipped: true }); continue; }
    tested.add(c.key);
    const before = now[c.dataset];
    const after = fitOrgan(L, [...before.specs, c.spec], before.beta);
    const g1 = score(L, after, 'gate');
    const rec = { key: c.key, dataset: c.dataset, source: c.source, gate: [gateNow[c.dataset], g1], adopted: g1 <= gateNow[c.dataset] - ADOPT, verified: false };
    if (rec.adopted) {
      const t0 = score(L, before, 'test'), t1 = score(L, after, 'test');
      rec.test = [t0, t1];
      rec.verified = t1 <= t0 - VERIFY;
      now[c.dataset] = after;
      gateNow[c.dataset] = g1;
      adopted[c.dataset]++;
    }
    records.push(rec);
  }
  return { organs: now, records };
}
