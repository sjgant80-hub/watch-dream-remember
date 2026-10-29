// ════════════════════════════════════════════════════════════════
// inherit.mjs — a child's EARLY LIFE, and inherited lessons that must earn their place. Pure, deterministic, gated.
//
// Organ 3b (sealed in data/organ3b-prereg.json, the fix for organ 3's failed M2, kept). Organ 3's child applied every
// inherited lesson from birth, blind: on shop one parent's lessons — verified in that parent's life — did badly on later
// cases, and the child carried the harm. Here the child lives its early life through the SAME cycle its parents lived
// (src/memory.mjs): in batches, in order; before each batch it uses only VERIFIED lessons; after it, the daydream re-forms
// its own candidate lessons from what it has seen and the dream tracks every lesson's gain, alone, on the batch.
//   own lessons        formed from the child's own episodes, over its own cells, in no context (it lives everywhere)
//   inherited lessons  the parents' slice, as CANDIDATES: tracked from the first batch (they were formed before this life
//                      began, so every case of it is a later case), used only once verified on the child's own cases by
//                      the parents' own rule (gain > 0 over ≥ 30 later cases), dropped while that fails. Their rate and n
//                      stay the parent's — the child's experience lives in its own lessons.
//   history            per batch an 'outcome'; an 'adopted' / 'dropped' entry each time an inherited lesson crosses the
//                      rule (cell, context, lineage, gain, later — never a case); its verified own lessons at the end
// Every prediction is made before the case's outcome is read (prequential): the life is scored as it is lived.
// No new constant: the batch size, MIN_LATER and the verification rule are organ 3's.
// Inspired by Gary W. Floyd's NexusGrid as he described it in chat (Gary W. Floyd, Lumiea Systems Research Division —
// ThunderStruck Service LLC); designed from that description only.
// ════════════════════════════════════════════════════════════════
import { etaOf, cellsOf, cellKey, inCell } from './mind.mjs';
import { inContext, founderIn, isVerified, shiftOf, loss, MIN_LATER } from './memory.mjs';

export const BATCH = 200;
export const MODES = Object.freeze(['prove', 'trust']);

const holds = (L, l, set, pos) => inCell(L, l.cell, set, pos) && inContext(L, l.context, set, pos);
const crossing = (kind, batch, l, t) => ({ kind, batch, cell: { ...l.cell }, context: l.context ? { ...l.context } : null, lineage: [...l.lineage], gain: t.gain, later: t.later });

/** Organ 3c: the parent's record as evidence worth MIN_LATER of the child's own cases — its gain per case in its life × 30. */
export const priorOf = (l) => (l && l.n > 0 && Number.isFinite(l.gain) ? MIN_LATER * (l.gain / l.n) : 0);

/** Lessons from the child's own episodes over its cells, in no context. → { key: { cell, context: null, rate, n } } */
export function ownLessons(L, cells, episodes, set) {
  const out = {};
  for (const c of cells) {
    let n = 0, k = 0;
    for (const e of episodes) if (inCell(L, c, set, e.pos)) { n++; k += e.outcome; }
    if (n) out[cellKey(c)] = { cell: c, context: null, rate: (k + 1) / (n + 2), n };
  }
  return out;
}

/**
 * Live an early life on positions of a row set, in batches of BATCH.
 *   genes, founder   the child's genes and founder positions (FIT)
 *   inherited        the slice (may be empty)
 *   mode             'prove' (organ 3b, the default): a candidate, used only once verified here, by the batch
 *                    'trust' (organ 3c): used from birth on its parent's record (priorOf), checked case by case, used for a case
 *                    exactly when prior + its gain here over the cases before it > 0
 * → { eta: Float64Array (the prediction used for each case, in order), lessons: { key: own lesson + gain, later, verified },
 *     inherited: [{ lesson: the slice entry as inherited, here: { gain, later, verified, usable } (+ prior, inUse under trust) }],
 *     history: [entry], episodes: [{ id, pos, batch, values, outcome }] }   (usable: the child has the ≥ 5 founder cases it needs)
 * The child's own lessons live organ 3's batch cycle in both modes.
 */
export function earlyLife(L, genes, founder, set, positions, inherited, mode) {
  const pos = Array.isArray(positions) ? positions : [];
  const slice = Array.isArray(inherited) ? inherited : [];
  const trust = mode === 'trust';
  const cells = cellsOf(genes);
  const ys = L.y[set];
  const out = new Float64Array(pos.length);
  const track = {}, itrack = slice.map(() => ({ gain: 0, later: 0 }));
  const ishift = slice.map((l) => shiftOf(l, founderIn(L, genes, founder, l.cell, l.context)));
  const history = [];
  const prior = slice.map((l) => (trust ? priorOf(l) : 0));
  const inUse = (i) => ishift[i] !== null && prior[i] + itrack[i].gain > 0;
  if (trust) slice.forEach((l, i) => { if (inUse(i)) history.push(crossing('adopted', -1, l, itrack[i])); });   // at birth, on trust
  let seen = [];
  for (let b = 0, at = 0; at < pos.length; b++, at += BATCH) {
    const bp = pos.slice(at, at + BATCH);
    const eta = etaOf(L, genes, set, bp);
    const now = ownLessons(L, cells, seen, set);
    const shifts = [];
    for (const [k, l] of Object.entries(now)) {
      const s = shiftOf(l, founderIn(L, genes, founder, l.cell, l.context));
      if (s !== null) shifts.push({ l, s, own: k });
    }
    slice.forEach((l, i) => { if (ishift[i] !== null) shifts.push({ l, s: ishift[i], inh: i }); });
    const used = shifts.filter((x) => (x.own !== undefined ? isVerified(track[x.own]) : !trust && isVerified(itrack[x.inh])));
    const checked = trust ? shifts.filter((x) => x.inh !== undefined) : [];
    let w0 = 0, w1 = 0;
    bp.forEach((p, j) => {
      const hits = used.filter((x) => holds(L, x.l, set, p));
      for (const x of checked) if (inUse(x.inh) && holds(L, x.l, set, p)) hits.push(x);
      const e = hits.length ? eta[j] + hits.reduce((a, x) => a + x.s, 0) / hits.length : eta[j];
      out[at + j] = e;
      w0 += loss(eta[j], ys[p]); w1 += loss(e, ys[p]);
      for (const x of checked) {   // under trust each inherited lesson is checked the moment the case's outcome is read
        if (!holds(L, x.l, set, p)) continue;
        const was = inUse(x.inh), t = itrack[x.inh];
        t.gain += loss(eta[j], ys[p]) - loss(eta[j] + x.s, ys[p]); t.later++;
        if (was !== inUse(x.inh)) history.push(crossing(was ? 'dropped' : 'adopted', b, x.l, t));
      }
    });
    history.push({ kind: 'outcome', batch: b, n: bp.length, without: w0 / bp.length, with: w1 / bp.length });
    for (const x of shifts) {
      if (trust && x.inh !== undefined) continue;   // already checked, case by case
      const t = x.own !== undefined ? track[x.own] : itrack[x.inh];
      bp.forEach((p, j) => { if (holds(L, x.l, set, p)) { t.gain += loss(eta[j], ys[p]) - loss(eta[j] + x.s, ys[p]); t.later++; } });
    }
    if (!trust) slice.forEach((l, i) => {
      if (ishift[i] === null) return;
      const was = used.some((x) => x.inh === i), is = isVerified(itrack[i]);
      if (was !== is) history.push(crossing(is ? 'adopted' : 'dropped', b, l, itrack[i]));
    });
    seen = seen.concat(bp.map((p) => ({ pos: p, outcome: ys[p] })));
    for (const k of Object.keys(ownLessons(L, cells, seen, set))) if (!track[k]) track[k] = { gain: 0, later: 0, first: b };
  }
  const lessons = {};
  for (const [k, l] of Object.entries(ownLessons(L, cells, seen, set))) {
    const t = track[k] || { gain: 0, later: 0 };
    lessons[k] = { ...l, gain: t.gain, later: t.later, verified: isVerified(t) };
  }
  for (const l of Object.values(lessons)) if (l.verified) history.push({ kind: 'lesson', cell: l.cell, rate: l.rate, n: l.n, gain: l.gain });
  const episodes = seen.map((e, i) => ({ id: `${L.name}:${set}:${L.sets[set][e.pos]}`, pos: e.pos, batch: Math.floor(i / BATCH), values: L.features.map((f) => L.ds.cols[f][L.sets[set][e.pos]]), outcome: e.outcome }));
  const here = (i) => ({ gain: itrack[i].gain, later: itrack[i].later, verified: isVerified(itrack[i]), usable: ishift[i] !== null, ...(trust ? { prior: prior[i], inUse: inUse(i) } : {}) });
  return { eta: out, lessons, inherited: slice.map((l, i) => ({ lesson: l, here: here(i) })), history, episodes };
}
