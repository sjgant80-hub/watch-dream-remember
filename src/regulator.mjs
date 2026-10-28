// ════════════════════════════════════════════════════════════════
// regulator.mjs — the independent regulator's checks and verdict. Pure, total, deterministic, gated.
//
// A tiny separate entity that stands outside what it regulates. At each visit it checks ONE node against that node's
// OWN baseline and rules — drift, rate, budget, health — and returns steady / watch / throttle / pause. It decides;
// it does not act: the node honours a verdict (src/mesh.mjs) only after checking the regulator's signature and its
// envelope (src/envelope.mjs). It never builds, publishes, spends or changes code: nothing here can.
//
// Credit. The upgrade is inspired by Gary W. Floyd's NexusGrid as he described it in chat (Gary W. Floyd, Lumiea Systems
// Research Division — ThunderStruck Service LLC), designed from that description only. The field and the damping are
// his GEP-BES forms: Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC — "GEP-Based Security:
// Behavioral Entropy Signatures for Cybersecurity and DevOps," 2025 (CC BY 4.0), §3:
//     E(t) = σ(k(|S − S_baseline| − ε))    the field: divergence from the node's own baseline raises it sigmoidally
//     β|∇S(t)|                             the rate: a field rising fast is escalation
//   and his finding that scripted automation fails by being OVERLY REGULAR (the regularity row below).
//
// WHERE THE PAPER IS SILENT AND THIS BUILD CHOSE (ours, sealed in data/organ1-prereg.json before this file existed):
//   • three parts of behaviour (area, files bucket, gap bucket), each its own band — the worst part decides;
//   • S is a part's Miller–Madow entropy over the actions since the previous visit; S_b and ε are the middle and
//     half-width of its q05–q95 band over the node's FIT windows (pooled over all nodes when a node has < 8);
//   • the pressure P is the damping: P_t = ½P_{t−1} + ½E_t, frozen while a node is paused;
//   • "what the node has done since its previous visit" is read as what it ATTEMPTED — executed and held alike: a
//     held attempt is still the node's behaviour, and a throttled runaway that keeps trying is still a runaway.
//
// THE BES SLOT. The sibling BES layer's kernels had not landed when this was written. `decide` takes an optional
// `drift(window, base)` → { E, parts }; BES's decision can stand in through `fromBES` (its verdict → this ladder).
// ════════════════════════════════════════════════════════════════
import { AREAS } from './streams.mjs';

export const HOUR = 3600000, DAY = 24 * HOUR, MINUTE = 60000;
export const N_MIN = 5, K_FIELD = 8, EPS_FLOOR = 0.25, CV_CAP = 0.35, MIN_WINDOWS = 8;
export const PARTS = Object.freeze(['area', 'files', 'gap']);
export const LADDER = Object.freeze(['steady', 'watch', 'throttle', 'pause']);
export const BAR = Object.freeze({ watch: 0.3, throttle: 0.6, pause: 0.85, rapid: 0.5, field: 0.5 });

const sigma = (x) => 1 / (1 + Math.exp(-x));
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/** files touched → bucket 0..5: 1, 2, 3–4, 5–8, 9–16, 17+ */
export function filesBucket(files) {
  const f = num(files);
  if (f <= 1) return 0;
  return Math.min(5, Math.ceil(Math.log2(f)));
}
/** minutes since the node's previous action → floor(log2(1 + minutes)), 0..9 */
export const gapBucket = (ms) => Math.min(9, Math.floor(Math.log2(1 + Math.max(0, num(ms)) / MINUTE)));

/** Miller–Madow entropy (nats) of a list of symbols; null for an empty list. */
export function entropy(symbols) {
  const list = Array.isArray(symbols) ? symbols : [];
  if (!list.length) return null;
  const counts = new Map();
  for (const s of list) counts.set(s, (counts.get(s) || 0) + 1);
  let h = 0;
  for (const c of counts.values()) { const p = c / list.length; h -= p * Math.log(p); }
  return h + (counts.size - 1) / (2 * list.length);
}

/** Coefficient of variation of gaps (population sd / mean). null when there is no rhythm to read (fewer than 2 gaps,
 *  or every action landed at once). */
export function cvOf(gaps) {
  const g = (Array.isArray(gaps) ? gaps : []).filter((x) => Number.isFinite(x));
  if (g.length < 2) return null;
  const mean = g.reduce((s, x) => s + x, 0) / g.length;
  if (!(mean > 0)) return null;
  const v = g.reduce((s, x) => s + (x - mean) * (x - mean), 0) / g.length;
  return Math.sqrt(v) / mean;
}

/** The q-quantile of a list (nearest rank on (n − 1)·q). null for an empty list. */
export function quantile(values, q) {
  const s = (Array.isArray(values) ? values : []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.round(Math.min(1, Math.max(0, q)) * (s.length - 1))];
}

/**
 * A window → its parts. window = [{ t, area, files, gap }] where gap is ms since the node's previous action (null for
 * its first ever). → { n, H: { area, files, gap }, cv }
 */
export function partsOf(window) {
  const w = (Array.isArray(window) ? window : []).filter((a) => a && typeof a === 'object');
  const gaps = w.map((a) => a.gap).filter((g) => Number.isFinite(g));
  return {
    n: w.length,
    H: { area: entropy(w.map((a) => AREAS.indexOf(a.area))), files: entropy(w.map((a) => filesBucket(a.files))), gap: entropy(gaps.map(gapBucket)) },
    cv: cvOf(gaps),
  };
}

/** A band from window entropies: { Sb, eps } — the middle and half-width of q05–q95, half-width at least EPS_FLOOR. */
export function bandOf(values) {
  const lo = quantile(values, 0.05), hi = quantile(values, 0.95);
  if (lo === null || hi === null) return null;
  return { Sb: (lo + hi) / 2, eps: Math.max(EPS_FLOOR, (hi - lo) / 2) };
}

/** Each action with its gap to the previous action in the same stream (null for the first). */
export function withGaps(actions) {
  const list = Array.isArray(actions) ? actions : [];
  return list.map((a, i) => ({ ...a, gap: i > 0 ? a.t - list[i - 1].t : null }));
}

/** Hourly windows (actions since the previous visit) over [from, to), visits at offset + k·HOUR. */
export function windowsOf(actionsWithGaps, from, to, offset) {
  const list = Array.isArray(actionsWithGaps) ? actionsWithGaps : [];
  const out = [];
  const first = Math.ceil((from - offset) / HOUR) * HOUR + offset;
  let j = 0;
  for (let v = first; v < to; v += HOUR) {
    const w = [];
    while (j < list.length && list[j].t <= v) { if (list[j].t > v - HOUR) w.push(list[j]); j++; }
    out.push(w);
  }
  return out;
}

/** The most actions in one clock hour and in one UTC day. */
export function peaks(actions) {
  const h = new Map(), d = new Map();
  for (const a of Array.isArray(actions) ? actions : []) {
    const hk = Math.floor(a.t / HOUR), dk = Math.floor(a.t / DAY);
    h.set(hk, (h.get(hk) || 0) + 1); d.set(dk, (d.get(dk) || 0) + 1);
  }
  return { hour: Math.max(0, ...h.values()), day: Math.max(0, ...d.values()) };
}

/**
 * Calibrate every node's baseline from its FIT actions only.
 * fits = [{ name, fit: [{ t, area, files }], offset }] → { pooled, nodes: { name: base } }
 * base = { band: { area, files, gap }, cvFloor, perHour, perDay, topArea, medianFiles, fitHourMax, pooled: bool }
 */
export function calibrate(fits) {
  const per = [];
  const all = { area: [], files: [], gap: [], cv: [] };
  for (const f of Array.isArray(fits) ? fits : []) {
    const acts = withGaps(f.fit || []);
    const span = acts.length ? [acts[0].t, acts[acts.length - 1].t + 1] : [0, 0];
    const ws = windowsOf(acts, span[0], span[1] + HOUR, num(f.offset)).filter((w) => w.length >= N_MIN).map(partsOf);
    const mine = { area: [], files: [], gap: [], cv: [] };
    for (const p of ws) {
      for (const k of PARTS) if (p.H[k] !== null) { mine[k].push(p.H[k]); all[k].push(p.H[k]); }
      if (p.cv !== null) { mine.cv.push(p.cv); all.cv.push(p.cv); }
    }
    per.push({ f, acts, ws: ws.length, mine });
  }
  const floorOf = (cvs) => { const q = quantile(cvs, 0.05); return q === null ? 0 : Math.min(CV_CAP, q); };
  const pooled = { band: Object.fromEntries(PARTS.map((k) => [k, bandOf(all[k])])), cvFloor: floorOf(all.cv) };
  const nodes = {};
  for (const { f, acts, ws, mine } of per) {
    const own = ws >= MIN_WINDOWS;
    const pk = peaks(acts);
    const tally = new Map();
    for (const a of acts) tally.set(a.area, (tally.get(a.area) || 0) + 1);
    let top = AREAS[0];
    for (const a of AREAS) if ((tally.get(a) || 0) > (tally.get(top) || 0)) top = a;
    nodes[f.name] = {
      band: own ? Object.fromEntries(PARTS.map((k) => [k, bandOf(mine[k]) || pooled.band[k]])) : pooled.band,
      cvFloor: own ? floorOf(mine.cv) : pooled.cvFloor,
      perHour: Math.max(6, 2 * pk.hour), perDay: Math.max(20, 2 * pk.day),
      topArea: top, medianFiles: Math.max(1, quantile(acts.map((a) => a.files), 0.5) || 1), fitHourMax: pk.hour, pooled: !own,
    };
  }
  return { pooled, nodes };
}

/** The drift field of one window against a base: Gary's E per part, the regularity row, the worst decides. */
export function field(window, base) {
  const p = partsOf(window);
  const parts = { area: 0, files: 0, gap: 0, reg: 0 };
  if (p.n >= N_MIN && base && base.band) {
    for (const k of PARTS) {
      const b = base.band[k];
      if (b && p.H[k] !== null) parts[k] = sigma(K_FIELD * (Math.abs(p.H[k] - b.Sb) - b.eps));
    }
    if (p.cv !== null && p.cv < num(base.cvFloor)) parts.reg = 1;
  }
  return { E: Math.max(parts.area, parts.files, parts.gap, parts.reg), parts, n: p.n };
}

/** The budget check: attempts since the last visit against perHour, the last 24 h against perDay. */
export function budget(sinceVisit, lastDay, base) {
  const b = base || {};
  const r = Math.max(num(sinceVisit) / Math.max(1, num(b.perHour)), num(lastDay) / Math.max(1, num(b.perDay)));
  return { r, E: r <= 1 ? 0 : Math.min(1, 0.6 + 0.4 * (r - 1)) };
}

export const freshNode = () => ({ P: 0, E: 0, over: false, paused: false, pauses: 0, coolUntil: 0, throttled: false });

/**
 * One visit's verdict. Pure.
 *   prev = the regulator's memory of this node (freshNode() at first)
 *   obs  = { t, window: [{ t, area, files, gap }], sinceVisit, lastDay, healthOk, highStakes }
 *   base = this node's calibration;  drift = optional (window, base) → { E, parts } (the BES slot)
 * → { verdict, reasons, renew, lift, probation, P, E, g, r, parts, next }   next = the new memory
 */
export function decide(prev, obs, base, drift) {
  const m = { ...freshNode(), ...(prev && typeof prev === 'object' ? prev : {}) };
  const o = obs && typeof obs === 'object' ? obs : {};
  const t = num(o.t);
  const out = (verdict, reasons, extra, next) => ({ verdict, reasons, renew: false, lift: false, probation: false, ...extra, next });
  if (o.healthOk !== true) {
    const fresh = !m.paused;
    return out('pause', ['health'], { renew: !fresh, P: m.P, E: m.E, g: 0, r: 0, parts: null },
      { ...m, paused: true, pauses: m.pauses + (fresh ? 1 : 0), coolUntil: fresh ? t + 12 * HOUR * 2 ** m.pauses : m.coolUntil, throttled: false });
  }
  if (m.paused && (o.highStakes === true || t < m.coolUntil)) {
    return out('pause', ['held'], { renew: true, P: m.P, E: m.E, g: 0, r: 0, parts: null }, m);
  }
  let f;
  try { f = typeof drift === 'function' ? drift(o.window, base) : field(o.window, base); } catch { f = null; }
  const Ed = f && Number.isFinite(f.E) ? Math.min(1, Math.max(0, f.E)) : 0.5;   // an unreadable drift check reads as watch, never as steady
  const bud = budget(o.sinceVisit, o.lastDay, base);
  const E = Math.max(Ed, bud.E);
  const g = Math.max(0, E - m.E);
  const P = 0.5 * m.P + 0.5 * E;
  const over = bud.r > 1;
  const reasons = [];
  if (Ed >= BAR.field) reasons.push('drift');
  if (over) reasons.push('budget');
  if (g >= BAR.rapid) reasons.push('rate');
  const probation = m.paused;   // a low-stakes pause whose cool-down is over: judged afresh, on probation
  let verdict = 'steady';
  if (P >= BAR.pause || (over && m.over)) verdict = 'pause';
  else if (P >= BAR.throttle || over) verdict = 'throttle';
  else if (P >= BAR.watch || E >= BAR.field || g >= BAR.rapid) verdict = 'watch';
  if (probation && verdict !== 'pause') verdict = 'throttle';   // the first visit after a cool-down lifts a pause to throttle only
  const pausing = verdict === 'pause';
  const freshPause = pausing && !m.paused;
  const reasonsOut = reasons.length ? reasons : pausing ? ['pressure'] : [];
  const lift = (m.throttled || m.paused) && (verdict === 'steady' || verdict === 'watch');
  const next = {
    ...m, P, E, over,
    paused: pausing,
    pauses: m.pauses + (pausing && (freshPause || probation) ? 1 : 0),
    coolUntil: pausing && (freshPause || probation) ? t + 12 * HOUR * 2 ** m.pauses : m.coolUntil,
    throttled: verdict === 'throttle',
  };
  return out(verdict, reasonsOut, { renew: pausing && !freshPause && !probation, lift, probation: probation && verdict === 'throttle', P, E, g, r: bud.r, parts: f && f.parts ? f.parts : null }, next);
}

/** The BES layer's verdicts on this ladder: ALLOW → steady, THROTTLE → throttle, STEP_UP → watch (a person is asked),
 *  BLOCK / ISOLATE → pause. Anything else reads as watch. */
export function fromBES(v) {
  return { ALLOW: 'steady', THROTTLE: 'throttle', STEP_UP: 'watch', BLOCK: 'pause', ISOLATE: 'pause' }[v] || 'watch';
}
