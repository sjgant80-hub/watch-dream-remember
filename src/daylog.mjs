// ════════════════════════════════════════════════════════════════
// daylog.mjs — the daydream's only output: a bounded log of INERT candidate records, kept in LIGHT. Pure, total, gated.
//
// A record is { key, dataset, spec, source, priority, born, at, inert: true } (at = the day its priority was last decayed). The log refuses a key it already holds or
// one already tested; each day a record's priority halves; a record older than 3 days, or below 0.001, is dropped;
// at most 48 records — the lowest priority goes first (ties: the older, then the larger key). Each night the highest
// priorities are promoted into the gate and leave the log. Nothing in a record is ever executed: it is data the
// nightly gate may test (the quarantine of Gary W. Floyd's Dream State Architecture — outputs inert until validated).
// ════════════════════════════════════════════════════════════════
import { encode } from '../vendor/fall-kit/core/vendor/light/codec.mjs';

export const CAP = 48, MAX_AGE = 3, FLOOR = 0.001, PROMOTE = 10, MAX_BYTES = 12288;

const rank = (a, b) => b.priority - a.priority || a.born - b.born || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** A clean, inert copy of a candidate, or null when it is not one. */
export function recordOf(c, day) {
  const x = c && typeof c === 'object' ? c : {};
  if (typeof x.key !== 'string' || !x.key || typeof x.dataset !== 'string' || !x.spec || typeof x.spec !== 'object') return null;
  if (!(Number.isFinite(x.priority) && x.priority >= 0) || !Number.isInteger(day)) return null;
  return { key: x.key, dataset: x.dataset, spec: { ...x.spec }, source: String(x.source ?? ''), priority: x.priority, born: day, at: day, inert: true };
}

/** Add candidates on `day`. tested = Set of keys already tested. → { log, added, refused } (the input is not changed) */
export function add(log, candidates, day, tested) {
  const out = (Array.isArray(log) ? log : []).slice();
  const seen = new Set(out.map((r) => r.key));
  const done = tested instanceof Set ? tested : new Set();
  let added = 0, refused = 0;
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const r = recordOf(c, day);
    if (!r || seen.has(r.key) || done.has(r.key)) { refused++; continue; }
    seen.add(r.key);
    out.push(r);
    added++;
  }
  out.sort(rank);
  return { log: out.slice(0, CAP), added, refused };
}

/** The log as it stands on `day`: priorities halved per day of age, the old and the faint dropped. */
export function decay(log, day) {
  return (Array.isArray(log) ? log : [])
    .map((r) => ({ ...r, priority: r.priority * 0.5 ** Math.max(0, day - r.at), at: Math.max(r.at, day) }))
    .filter((r) => day - r.born <= MAX_AGE && r.priority >= FLOOR)
    .sort(rank);
}

/** Promote the k highest priorities. → { promoted, log } */
export function promote(log, k) {
  const list = (Array.isArray(log) ? log : []).slice().sort(rank);
  const n = Number.isInteger(k) && k > 0 ? k : 0;
  return { promoted: list.slice(0, n), log: list.slice(n) };
}

/** The log as LIGHT bytes: one JSON line per record, in rank order. */
export function lightOf(log) {
  const text = (Array.isArray(log) ? log : []).map((r) => JSON.stringify(r)).join('\n');
  const e = encode(new TextEncoder().encode(text));
  return e.ok ? e.bytes : new Uint8Array(0);
}

/** Is the log within its bound? → { ok, records, bytes, unique } */
export function bound(log) {
  const list = Array.isArray(log) ? log : [];
  const bytes = lightOf(list).length;
  const unique = new Set(list.map((r) => r.key)).size === list.length;
  return { ok: list.length <= CAP && bytes <= MAX_BYTES && unique && list.every((r) => r.inert === true), records: list.length, bytes, unique };
}
