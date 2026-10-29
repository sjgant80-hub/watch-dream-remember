// ════════════════════════════════════════════════════════════════
// mind.mjs — a MIND: a small model of an outcome (its genes), the cells its lessons live in, and how two minds breed.
// Pure, deterministic, gated. A mind is a model of a pattern in data — never a person, never claimed conscious.
//
//   genes      an organ (feature specs + logistic weights, organ 2's model) fitted on the mind's founder rows
//   id         SHA-256 of its canonical genes — the genome hash a mind card names it by
//   cells      for its 4 strongest raw features, each pair × 4 quadrants (by FIT medians): 24 cells. A cell is self-
//              describing { f, a, g, b } — "f above its median (a = 1) or not, and g …" — so any mind can use any cell.
//   fuse       breeding: the union of both parents' specs refitted on both founder sets; born only when it beats both
//              parents on GATE, otherwise the better parent's genes (recorded)
// Inspired by Gary W. Floyd's NexusGrid as he described it in chat (Gary W. Floyd, Lumiea Systems Research Division —
// ThunderStruck Service LLC); designed from that description only.
// ════════════════════════════════════════════════════════════════
import { keyOf, fit, linear, logLoss } from './model.mjs';
import { column } from './lab.mjs';
import { sha256, hex } from '../vendor/fall-kit/core/vendor/light/sha256.mjs';

export const STRONG = 4;
const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

/** Fit genes on FIT positions [from, to). */
export function genesOf(L, specs, from, to) {
  const pos = range(from, to);
  const cols = specs.map((s) => { const c = column(L, s).fit; return Float64Array.from(pos, (i) => c[i]); });
  const m = fit(cols, Uint8Array.from(pos, (i) => L.y.fit[i]));
  return { dataset: L.name, specs: specs.map((s) => ({ ...s })), beta: Array.from(m.beta) };
}

/** The genome hash. */
export function idOf(genes) {
  const text = JSON.stringify({ dataset: genes.dataset, specs: genes.specs.map(keyOf), beta: genes.beta.map((b) => b.toFixed(9)) });
  return hex(sha256(new TextEncoder().encode(text)));
}

/** η of the genes on the given positions of a row set. */
export function etaOf(L, genes, set, positions) {
  const cols = genes.specs.map((s) => { const c = column(L, s)[set]; return Float64Array.from(positions, (i) => c[i]); });
  return linear(genes.beta, cols, positions.length);
}

/** The mind's 24 cells: its 4 strongest raw features (|β|; ties by spec order), each pair × 4 quadrants. */
export function cellsOf(genes) {
  const raw = genes.specs.map((s, j) => ({ f: s.f, w: Math.abs(genes.beta[j + 1]), op: s.op, j })).filter((x) => x.op === 'raw')
    .sort((x, y) => y.w - x.w || x.j - y.j).slice(0, STRONG).map((x) => x.f);
  const out = [];
  raw.forEach((f, i) => raw.slice(i + 1).forEach((g) => { for (const a of [0, 1]) for (const b of [0, 1]) out.push({ f, a, g, b }); }));
  return out;
}

export const cellKey = (c) => `${c.f}>${c.a}|${c.g}>${c.b}`;

/** Does the case at this position of a row set fall in the cell? */
export function inCell(L, c, set, pos) {
  const row = L.sets[set][pos];
  const above = (f) => (L.ds.cols[f][row] > L.stats[f].q[0.5] ? 1 : 0);
  return above(c.f) === c.a && above(c.g) === c.b;
}

/** Born only when the child beats BOTH parents on GATE. */
export const bornOf = (gate) => gate.child < gate.a && gate.child < gate.b;
/** Not born: the parent with the lower GATE log-loss gives its genes (A on a tie). */
export const better = (gate, A, B) => (gate.a <= gate.b ? A : B);

/** Breed: the gated fusion of two parents. → { genes, born, gate: { child, a, b } } */
export function fuse(L, A, B) {
  const seen = new Set(), specs = [];
  for (const s of [...A.specs, ...B.specs]) { const k = keyOf(s); if (!seen.has(k)) { seen.add(k); specs.push(s); } }
  const child = genesOf(L, specs, 0, 800);
  const all = range(0, L.sets.gate.length);
  const g = (genes) => logLoss(etaOf(L, genes, 'gate', all), L.y.gate);
  const gate = { child: g(child), a: g(A), b: g(B) };
  const born = bornOf(gate);
  return { genes: born ? child : better(gate, A, B), born, gate };
}
