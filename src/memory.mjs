// ════════════════════════════════════════════════════════════════
// memory.mjs — a mind's LIFE MEMORY, its verified LESSONS, its HISTORY, deletion and inheritance. Pure, deterministic.
//
//   episode   one case the mind saw: the row's values, the outcome, a note (here a PLANTED canary standing in for what a
//             person might have said), a per-episode random salt, provenance { mind, batch, ref = HMAC-SHA-256(salt, row) }
//   lesson    a fact about the world in one cell, in the context it was learnt in (the segment the mind lived in):
//             { cell, context, rate = (k + 1)/(n + 2), n } — never a copy of a case
//   apply     only to a case in the lesson's cell AND context: logit += mean over such lessons (n ≥ 20, and ≥ 5 of the
//             mind's own founder cases in that cell and context)
//             of w·(logit(rate) − logit(the mind's mean founder prediction in that cell)), w = n/(n + 50)
//   cycle     after each batch the daydream re-forms candidate lessons (inert) and the dream VERIFIES: a lesson is verified
//             when, over the batches after it was formed, applying it alone lowered its cell's log-loss in total over ≥ 30
//             later cases. Only verified lessons are used at work and only they can be inherited.
//   history   outcome / lesson / inherited / tombstone entries — never an episode, a row, a note, a salt or a ref
//   delete    the episodes and their salts leave; the lessons are recomputed from what remains; one tombstone is appended
//   slice     the inheritance: the top 8 verified lessons by gain, each { cell, context, rate, n, gain, lineage: [mind id] }
// Inspired by Gary W. Floyd's NexusGrid as he described it in chat (Gary W. Floyd, Lumiea Systems Research Division —
// ThunderStruck Service LLC); designed from that description only.
// ════════════════════════════════════════════════════════════════
import { sha256, hex } from '../vendor/fall-kit/core/vendor/light/sha256.mjs';
import { encode } from '../vendor/fall-kit/core/vendor/light/codec.mjs';
import { etaOf, cellsOf, cellKey, inCell } from './mind.mjs';

export const MIN_N = 20, MIN_FOUNDER = 5, SHRINK = 50, MIN_LATER = 30, SLICE = 8;
const enc = new TextEncoder();
const logit = (p) => Math.log(p / (1 - p));
const sigma = (t) => 1 / (1 + Math.exp(-t));
const loss = (eta, y) => { const p = Math.min(1 - 1e-12, Math.max(1e-12, sigma(eta))); return y ? -Math.log(p) : -Math.log(1 - p); };

/** HMAC-SHA-256 (RFC 2104) over strings → hex. */
export function hmac(key, message) {
  let k = enc.encode(String(key));
  if (k.length > 64) k = sha256(k);
  const pad = (x) => { const b = new Uint8Array(64); b.set(k); return b.map((v) => v ^ x); };
  const m = enc.encode(String(message));
  const inner = new Uint8Array(64 + m.length); inner.set(pad(0x36)); inner.set(m, 64);
  const outer = new Uint8Array(96); outer.set(pad(0x5c)); outer.set(sha256(inner), 64);
  return hex(sha256(outer));
}

/** One episode for the case at FIT position pos. */
export function episodeOf(L, pos, batch, canary, salt, mind) {
  const row = L.sets.fit[pos];
  return { id: `${L.name}:${row}`, pos, batch, values: L.features.map((f) => L.ds.cols[f][row]), outcome: L.y.fit[pos], note: `note ${L.name}:${row} ${canary}`, salt, mind, ref: hmac(salt, row) };
}

/** Is the case in the context (null: everywhere)? context = { f, side }: f above its FIT median (1) or not (0). */
export function inContext(L, context, set, pos) {
  if (!context) return true;
  return (L.ds.cols[context.f][L.sets[set][pos]] > L.stats[context.f].q[0.5] ? 1 : 0) === context.side;
}
const holds = (L, l, set, pos) => inCell(L, l.cell, set, pos) && inContext(L, l.context, set, pos);

/** The mind's mean founder prediction in a cell and context, and how many founder cases are there. */
export function founderIn(L, genes, founder, cell, context) {
  const pos = founder.filter((p) => inCell(L, cell, 'fit', p) && inContext(L, context, 'fit', p));
  if (!pos.length) return { n: 0, mean: 0 };
  const eta = etaOf(L, genes, 'fit', pos);
  let s = 0;
  for (const e of eta) s += sigma(e);
  return { n: pos.length, mean: s / pos.length };
}

/** A lesson's shift of the logit, or null when it cannot be applied. */
export function shiftOf(lesson, fin) {
  if (!(lesson && lesson.n >= MIN_N && fin && fin.n >= MIN_FOUNDER && fin.mean > 0 && fin.mean < 1)) return null;
  return (lesson.n / (lesson.n + SHRINK)) * (logit(lesson.rate) - logit(fin.mean));
}

/** η of the genes on positions of a set, with lessons applied. lessons = [{ cell, context, rate, n }] */
export function etaWith(L, genes, founder, set, positions, lessons) {
  const eta = etaOf(L, genes, set, positions);
  const shifts = (lessons || []).map((l) => ({ l, s: shiftOf(l, founderIn(L, genes, founder, l.cell, l.context)) })).filter((x) => x.s !== null);
  return eta.map((e, i) => {
    const hits = shifts.filter((x) => holds(L, x.l, set, positions[i]));
    return hits.length ? e + hits.reduce((a, x) => a + x.s, 0) / hits.length : e;
  });
}

/** Lessons from episodes over the mind's cells, in its context: { key: { cell, context, rate, n } } (no episode, no lesson). */
export function lessonsFrom(L, cells, episodes, context) {
  const out = {};
  for (const c of cells) {
    let n = 0, k = 0;
    for (const e of episodes) if (inCell(L, c, 'fit', e.pos) && inContext(L, context, 'fit', e.pos)) { n++; k += e.outcome; }
    if (n) out[cellKey(c)] = { cell: c, context: context || null, rate: (k + 1) / (n + 2), n };
  }
  return out;
}

/**
 * Live (or re-live) a life from its episodes, batch by batch in order: before each batch, every lesson formed earlier is
 * tried alone on the batch's cases in its cell (its gain), then the batch is learnt. → { lessons, outcomes }
 * lessons = { key: { cell, rate, n, gain, later, first, verified } }
 */
export function relive(L, genes, founder, episodes, context) {
  const cells = cellsOf(genes);
  const batches = [...new Set(episodes.map((e) => e.batch))].sort((a, b) => a - b);
  const track = {};
  const outcomes = [];
  let seen = [];
  for (const b of batches) {
    const eps = episodes.filter((e) => e.batch === b).sort((x, y) => x.pos - y.pos);
    const pos = eps.map((e) => e.pos);
    const eta = etaOf(L, genes, 'fit', pos);
    const now = lessonsFrom(L, cells, seen, context);
    const usable = Object.entries(now).filter(([k]) => track[k] && track[k].gain > 0 && track[k].later >= MIN_LATER).map(([, l]) => l);
    const withAll = etaWith(L, genes, founder, 'fit', pos, usable);
    let w0 = 0, w1 = 0;
    eps.forEach((e, i) => { w0 += loss(eta[i], e.outcome); w1 += loss(withAll[i], e.outcome); });
    outcomes.push({ batch: b, n: eps.length, without: w0 / eps.length, with: w1 / eps.length });
    for (const [k, l] of Object.entries(now)) {
      const s = shiftOf(l, founderIn(L, genes, founder, l.cell, l.context));
      if (s === null) continue;
      const t = (track[k] ??= { gain: 0, later: 0 });
      eps.forEach((e, i) => { if (holds(L, l, 'fit', e.pos)) { t.gain += loss(eta[i], e.outcome) - loss(eta[i] + s, e.outcome); t.later++; } });
    }
    seen = seen.concat(eps);
    for (const k of Object.keys(lessonsFrom(L, cells, seen, context))) if (!track[k]) track[k] = { gain: 0, later: 0, first: b };
  }
  const final = lessonsFrom(L, cells, seen, context);
  const lessons = {};
  for (const [k, l] of Object.entries(final)) {
    const t = track[k] || { gain: 0, later: 0 };
    lessons[k] = { ...l, gain: t.gain, later: t.later, verified: t.gain > 0 && t.later >= MIN_LATER };
  }
  return { lessons, outcomes };
}

/** A whole life in a context: episodes from the batches, re-lived. canaryOf(pos), saltOf(pos): the caller's draws. */
export function live(L, genes, mind, founder, batches, canaryOf, saltOf, context) {
  const episodes = batches.flatMap((pos, b) => pos.map((p) => episodeOf(L, p, b, canaryOf(p), saltOf(p), mind)));
  const r = relive(L, genes, founder, episodes, context);
  const history = [
    ...r.outcomes.map((o) => ({ kind: 'outcome', ...o })),
    ...Object.values(r.lessons).filter((l) => l.verified).map((l) => ({ kind: 'lesson', cell: l.cell, rate: l.rate, n: l.n, gain: l.gain })),
  ];
  return { mind, context: context || null, episodes, lessons: r.lessons, history, inherited: [] };
}

/** The verified lessons, for work. */
export const verified = (m) => Object.values((m && m.lessons) || {}).filter((l) => l.verified);

/** Delete episodes by id: they and their salts leave, the lessons are re-lived from what remains, one tombstone. */
export function forget(L, genes, founder, m, ids) {
  const gone = new Set(ids);
  const keep = m.episodes.filter((e) => !gone.has(e.id));
  const count = m.episodes.length - keep.length;
  const r = relive(L, genes, founder, keep, m.context);
  return { ...m, episodes: keep, lessons: r.lessons, history: [...m.history, { kind: 'tombstone', count }] };
}

/** The inheritance from one parent: its top SLICE verified lessons by gain (ties by cell key), lineage-tagged. */
export function sliceOf(m) {
  return verified(m).sort((a, b) => b.gain - a.gain || (cellKey(a.cell) < cellKey(b.cell) ? -1 : 1)).slice(0, SLICE)
    .map((l) => ({ cell: { ...l.cell }, context: l.context ? { ...l.context } : null, rate: l.rate, n: l.n, gain: l.gain, lineage: [m.mind] }));
}

/** A newborn's memory: an empty life, the parents' slices, one 'inherited' history entry. */
export function newborn(mind, slices) {
  const inherited = slices.flat();
  return { mind, context: null, episodes: [], lessons: {}, inherited, history: [{ kind: 'inherited', lessons: inherited.length, lineage: [...new Set(inherited.flatMap((l) => l.lineage))] }] };
}

/** The life memory as LIGHT bytes: one JSON line per episode, then per lesson. */
export function lightOf(m) {
  const lines = [...(m.episodes || []).map((e) => JSON.stringify(e)), ...Object.values(m.lessons || {}).map((l) => JSON.stringify(l))];
  const e = encode(enc.encode(lines.join('\n')));
  return e.ok ? e.bytes : new Uint8Array(0);
}
