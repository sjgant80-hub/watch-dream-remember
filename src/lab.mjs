// ════════════════════════════════════════════════════════════════
// lab.mjs — the five datasets as organs: their rows, statistics, columns and fitted models. Pure, deterministic.
//
// prepare(datasets) takes the loaders' output and keeps the sealed row sets (the first 6,000 FIT, 4,000 GATE and 6,000
// TEST rows in the loaders' own order). Columns are cached per spec. An organ = { specs, beta } fitted on FIT only.
// TEST is read only by `score(…, 'test')`, which the nightly gate calls after an adoption and nothing else calls.
// ════════════════════════════════════════════════════════════════
import { keyOf, statsOf, columnOf, fit, linear, logLoss, baseEntropy, shapeOf } from './model.mjs';

export const ROWS = Object.freeze({ fit: 6000, gate: 4000, test: 6000 });

/** datasets = { name: loader output } → lab */
export function prepare(datasets) {
  const lab = {};
  for (const [name, d] of Object.entries(datasets || {})) {
    const sets = { fit: d.fitRows.slice(0, ROWS.fit), gate: d.gateRows.slice(0, ROWS.gate), test: d.testRows.slice(0, ROWS.test) };
    const stats = Object.fromEntries(d.features.map((f) => [f, statsOf(d.cols[f], sets.fit)]));
    const shapes = Object.fromEntries(d.features.map((f) => [f, shapeOf(d.cols[f], sets.fit)]));
    const y = Object.fromEntries(Object.entries(sets).map(([k, rows]) => [k, Uint8Array.from(rows, (i) => d.y[i])]));
    lab[name] = { name, title: d.title, outcome: d.outcome, features: d.features.slice(), ds: d, sets, stats, shapes, y, cache: new Map() };
  }
  return lab;
}

/** One spec's standardised columns { fit, gate, test, sd }, cached. */
export function column(L, spec) {
  const k = keyOf(spec);
  if (!L.cache.has(k)) L.cache.set(k, columnOf(spec, L.ds, L.stats, L.sets));
  return L.cache.get(k);
}

/** The starting organ: raw(f) for every feature. */
export const startSpecs = (L) => L.features.map((f) => ({ op: 'raw', f }));

/** Fit an organ on FIT (warm-started from `start`). → { specs, beta } */
export function fitOrgan(L, specs, start) {
  const m = fit(specs.map((s) => column(L, s).fit), L.y.fit, start);
  return { specs: specs.slice(), beta: m.beta };
}

/** An organ's log-loss on one row set ('fit' | 'gate' | 'test'). */
export function score(L, organ, set) {
  const cols = organ.specs.map((s) => column(L, s)[set]);
  return logLoss(linear(organ.beta, cols, L.y[set].length), L.y[set]);
}

/** An organ's FIT predictions and residuals. */
export function fitResiduals(L, organ) {
  const eta = linear(organ.beta, organ.specs.map((s) => column(L, s).fit), L.y.fit.length);
  const p = eta.map((e) => 1 / (1 + Math.exp(-e)));
  return { p, r: p.map((v, i) => L.y.fit[i] - v) };
}

/** How far an organ is from knowing nothing, on FIT: its log-loss over the base-rate entropy (1 = no better than base). */
export function weakness(L, organ) {
  const h = baseEntropy(L.y.fit);
  return h > 0 ? score(L, organ, 'fit') / h : 1;
}
