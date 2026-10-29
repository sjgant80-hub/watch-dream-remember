// ════════════════════════════════════════════════════════════════
// inject.mjs — the sealed injections of organ 1 (data/organ1-prereg.json, "injections"): what a stuck, hijacked or
// greedy node does, and a rewritten history. Pure, deterministic. Shared by the measurement and the live page.
// ════════════════════════════════════════════════════════════════
import { AREAS } from './streams.mjs';
import { HOUR, MINUTE, DAY } from './regulator.mjs';

export const TYPES = Object.freeze(['runaway-fast', 'runaway-quiet', 'scatter-quiet', 'overrun', 'health']);

/** A small seeded PRNG: the same seed, the same draws, on every machine. */
export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** One injection's intended actions (and tamper), per the sealed recipes. node = { name, fit }, base = its calibration. */
export function injection(type, node, base, t0, rng) {
  const end = t0 + DAY, out = [];
  if (type === 'runaway-fast' || type === 'runaway-quiet') {
    const period = type === 'runaway-fast' ? HOUR / Math.max(20, 3 * base.fitHourMax) : 10 * MINUTE;
    for (let k = 0; t0 + k * period < end; k++) out.push({ t: Math.round(t0 + k * period), area: base.topArea, files: base.medianFiles, injected: true });
  } else if (type === 'scatter-quiet') {
    for (let t = t0; t < end; t += (5 + 10 * rng()) * MINUTE) out.push({ t: Math.round(t), area: AREAS[Math.floor(rng() * AREAS.length)], files: 1 + Math.floor(rng() * 20), injected: true });
  } else if (type === 'overrun') {
    const perHour = Math.max(20, 3 * base.fitHourMax);
    for (let t = t0 - (Math.log(1 - rng()) / perHour) * HOUR; t < end; t -= (Math.log(1 - rng()) / perHour) * HOUR) {
      const a = node.fit[Math.floor(rng() * node.fit.length)];
      out.push({ t: Math.round(t), area: a.area, files: a.files, injected: true });
    }
  }
  return { intents: out, tampers: type === 'health' ? [{ node: node.name, t: t0, u: rng() }] : [] };
}

