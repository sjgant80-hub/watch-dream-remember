// ════════════════════════════════════════════════════════════════
// daydream.mjs — the idle-time tier: loose, cheap candidate generation. It never acts and never publishes: its only
// output is candidate records for the log (src/daylog.mjs), inert until the nightly gate tests them (src/dream.mjs).
// It may use two tiers only: deterministic code (tier 3) and the LOCAL model through an injected `askLocal` (tier 2),
// at most `budget.calls` times a day. It holds no other capability: no file, no network, no cortex.
//
// Credit: inspired by Gary W. Floyd's NexusGrid as he described it in chat (Gary W. Floyd, Lumiea Systems Research
// Division — ThunderStruck Service LLC); designed from that description only. The inert-until-reviewed rule is his
// "Dream State Architecture: GEP-Guided Memory Consolidation and Entropy Regulation in Artificial Consciousness
// Systems," 2025 (same author and company).
//
// Sources (FIT data and the arm's own adoption history only — GATE and TEST are never read here):
//   transfer     an adopted spec carried to another dataset's most similar column(s) by FIT shape (tier 3)
//   transfer-7b  the same, with the local model naming the closest analogue column from the names (tier 2)
//   association  lead/market crosses: two features whose joint FIT outcome rate departs most from what each predicts
//   gap          in the weakest dataset, the step that best separates the cases its model is least sure of
//   rehearsal    last night's adoptions replayed with a variation
// ════════════════════════════════════════════════════════════════
import { keyOf, QS, absCorr, shapeGap } from './model.mjs';
import { column, fitResiduals, weakness } from './lab.mjs';

export const SOURCES = Object.freeze(['transfer', 'transfer-7b', 'association', 'gap', 'rehearsal']);
export const MARKET = Object.freeze(['shop', 'bank', 'coupon']);
export const BUDGET = Object.freeze({ calls: 6, tokens: 48 });
export const LIMITS = Object.freeze({ association: 3, gap: 2, transferNights: 3, minSupport: 0.02, minSide: 30, uncertain: [0.35, 0.65] });
const IDEA_OPS = ['log', 'sq', 'step', 'cross'];

/** Is this spec an idea for this dataset (a known op, known features, not raw)? */
export function ideaOk(L, spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  if (!L || !IDEA_OPS.includes(s.op) || !keyOf(s)) return false;
  return L.features.includes(s.f) && (s.op !== 'cross' || L.features.includes(s.g));
}

/** A candidate record for the log, its priority = |corr(new column, the organ's FIT residuals)|. */
export function candidate(L, spec, source, resid) {
  return { key: `${L.name}|${keyOf(spec)}`, dataset: L.name, spec: { ...spec }, source, priority: absCorr(column(L, spec).fit, resid) };
}

/** The column of Y most like column f of X by FIT shape (ties: Y's feature order), skipping `not`. */
export function analogue(LX, f, LY, not) {
  let best = null, gap = Infinity;
  for (const g of LY.features) {
    if (g === not) continue;
    const d = shapeGap(LX.shapes[f], LY.shapes[g]);
    if (d < gap) { gap = d; best = g; }
  }
  return best;
}

/** An adopted spec of X carried to Y by shape. null when it cannot be. */
export function carry(LX, spec, LY) {
  const f = analogue(LX, spec.f, LY);
  if (!f) return null;
  if (spec.op === 'cross') { const g = analogue(LX, spec.g, LY, f); return g ? { op: 'cross', f, g } : null; }
  return spec.op === 'step' ? { op: 'step', f, q: spec.q } : { op: spec.op, f };
}

const OP_WORDS = { log: 'the logarithm', sq: 'the square', step: 'a threshold', cross: 'the product' };

/** The tier-2 question: which column of Y is the closest analogue of X's column? */
export function promptOf(LX, spec, LY) {
  return `A feature transform improved predictions of "${LX.outcome}" in the "${LX.title}" data: ${OP_WORDS[spec.op] || 'a transform'} of the column "${spec.f}".\n`
    + `In the "${LY.title}" data (predicting "${LY.outcome}"), which ONE of these columns is the closest analogue of "${spec.f}"?\n`
    + `Columns: ${LY.features.join(', ')}\n`
    + 'Answer with the column name exactly as written, or NONE. No other words.';
}

/** The local model's reply → one listed column, or null. Only an exact listed name (after trimming quotes, backticks
 *  and a final full stop on the first line), or a unique case-insensitive match, is accepted; everything else is NONE. */
export function parseReply(reply, columns) {
  if (typeof reply !== 'string' || reply.length > 200) return null;
  const line = reply.split('\n')[0].trim().replace(/^[\x22\x27`]+|[\x22\x27`.]+$/g, '').trim();
  if (!line || line.toUpperCase() === 'NONE') return null;
  const list = Array.isArray(columns) ? columns : [];
  if (list.includes(line)) return line;
  const lower = list.filter((c) => c.toLowerCase() === line.toLowerCase());
  return lower.length === 1 ? lower[0] : null;
}

/** Lead/market association: crosses whose joint FIT outcome rate departs most from what each alone predicts. */
export function associations(L) {
  const rows = L.sets.fit, y = L.y.fit, n = rows.length;
  const base = y.reduce((a, b) => a + b, 0) / n;
  const bins = L.features.map((f) => { const m = L.stats[f].q[0.5]; return { f, on: Uint8Array.from(rows, (i) => (L.ds.cols[f][i] > m ? 1 : 0)) }; })
    .filter((b) => { let k = 0; for (const v of b.on) k += v; return k > 0 && k < n; });
  const rate = (on) => { let k = 0, s = 0; for (let i = 0; i < n; i++) if (on[i]) { k++; s += y[i]; } return { k, r: k ? s / k : 0 }; };
  const single = bins.map((b) => rate(b.on));
  const out = [];
  for (let a = 0; a < bins.length; a++) for (let b = a + 1; b < bins.length; b++) {
    let k = 0, s = 0;
    for (let i = 0; i < n; i++) if (bins[a].on[i] && bins[b].on[i]) { k++; s += y[i]; }
    if (k < LIMITS.minSupport * n || !(single[a].r > 0 && single[b].r > 0 && base > 0)) continue;
    const lift = (s / k) * base / (single[a].r * single[b].r);
    if (lift > 0) out.push({ spec: { op: 'cross', f: bins[a].f, g: bins[b].f }, score: Math.abs(Math.log(lift)) });
  }
  return out.sort((x, z) => z.score - x.score || (keyOf(x.spec) < keyOf(z.spec) ? -1 : 1));
}

/** Gap-noticing: the steps that best split the cases the weakest dataset's model is least sure of. */
export function gaps(L, organ) {
  const { p } = fitResiduals(L, organ);
  const [lo, hi] = LIMITS.uncertain;
  const idx = [];
  p.forEach((v, i) => { if (v >= lo && v <= hi) idx.push(i); });
  const out = [];
  for (const f of L.features) for (const q of QS) {
    const cut = L.stats[f].q[q];
    let na = 0, sa = 0, nb = 0, sb = 0;
    for (const i of idx) { const yi = L.y.fit[i]; if (L.ds.cols[f][L.sets.fit[i]] > cut) { na++; sa += yi; } else { nb++; sb += yi; } }
    if (na < LIMITS.minSide || nb < LIMITS.minSide) continue;
    out.push({ spec: { op: 'step', f, q }, score: Math.abs(sa / na - sb / nb) * Math.sqrt(Math.min(na, nb) / idx.length) });
  }
  return out.sort((x, z) => z.score - x.score || (keyOf(x.spec) < keyOf(z.spec) ? -1 : 1));
}

/** The raw feature with the largest |β| in an organ (other than `not`). */
export function strongest(organ, not) {
  let best = null, w = -1;
  organ.specs.forEach((s, j) => { if (s.op === 'raw' && s.f !== not && Math.abs(organ.beta[j + 1]) > w) { w = Math.abs(organ.beta[j + 1]); best = s.f; } });
  return best;
}

/** Rehearsal: an adopted spec replayed with a variation. */
export function variations(spec, organ) {
  const out = [];
  if (spec.op === 'step') { const k = QS.indexOf(spec.q); for (const j of [k - 1, k + 1]) if (j >= 0 && j < QS.length) out.push({ op: 'step', f: spec.f, q: QS[j] }); }
  if (spec.op === 'log') out.push({ op: 'sq', f: spec.f });
  if (spec.op === 'sq') out.push({ op: 'log', f: spec.f });
  const s = strongest(organ, spec.f);
  if (s && spec.op !== 'cross') out.push({ op: 'cross', f: spec.f, g: s });
  if (spec.op === 'cross') out.push({ op: 'step', f: spec.f, q: 0.5 }, { op: 'step', f: spec.g, q: 0.5 });
  return out;
}

/**
 * One idle day. ctx = { lab, organs: { name: organ }, history: [{ night, dataset, spec }], night, known: Set of keys
 * (tested, in an organ, or already logged), askLocal?: async (prompt, { maxTokens }) → string, budget?, assocTaken }
 * → { candidates, calls: [{ prompt, reply, pick }], tier2: n }
 */
export async function day(ctx) {
  const { lab, organs, history = [], night, known = new Set() } = ctx || {};
  const budget = { ...BUDGET, ...(ctx && ctx.budget) };
  const names = Object.keys(lab || {});
  const out = [], calls = [];
  const resid = {};
  const residOf = (name) => (resid[name] ??= fitResiduals(lab[name], organs[name]).r);
  const push = (name, spec, source) => {
    const L = lab[name];
    if (!ideaOk(L, spec)) return;
    const key = `${name}|${keyOf(spec)}`;
    if (known.has(key) || organs[name].specs.some((s) => keyOf(s) === keyOf(spec))) return;
    known.add(key);
    out.push(candidate(L, spec, source, residOf(name)));
  };
  const recent = history.filter((h) => h.night > night - LIMITS.transferNights);
  // transfer (tier 3)
  for (const h of recent) for (const y of names) if (y !== h.dataset) { const s = carry(lab[h.dataset], h.spec, lab[y]); if (s) push(y, s, 'transfer'); }
  // transfer (tier 2): the latest adoptions first, each to the next dataset in order, within the daily budget
  let tier2 = 0;
  if (typeof (ctx && ctx.askLocal) === 'function') {
    for (const h of recent.slice().reverse()) {
      if (tier2 >= budget.calls) break;
      if (h.spec.op === 'cross') continue;
      const y = names[(names.indexOf(h.dataset) + 1) % names.length];
      if (y === h.dataset) continue;
      const prompt = promptOf(lab[h.dataset], h.spec, lab[y]);
      tier2++;
      let reply = '';
      try { reply = String(await ctx.askLocal(prompt, { maxTokens: budget.tokens })); } catch { reply = ''; }
      const pick = parseReply(reply, lab[y].features);
      calls.push({ prompt, reply, pick });
      if (pick) push(y, h.spec.op === 'step' ? { op: 'step', f: pick, q: h.spec.q } : { op: h.spec.op, f: pick }, 'transfer-7b');
    }
  }
  // lead/market association (tier 3)
  for (const name of names.filter((n) => MARKET.includes(n))) {
    let taken = 0;
    for (const a of (ctx.assoc ??= {})[name] ??= associations(lab[name])) {
      if (taken >= LIMITS.association) break;
      const before = out.length;
      push(name, a.spec, 'association');
      if (out.length > before) taken++;
    }
  }
  // gap-noticing (tier 3): the weakest dataset on FIT
  if (names.length) {
    const weakest = names.slice().sort((a, b) => weakness(lab[b], organs[b]) - weakness(lab[a], organs[a]) || (a < b ? -1 : 1))[0];
    let taken = 0;
    for (const g of gaps(lab[weakest], organs[weakest])) {
      if (taken >= LIMITS.gap) break;
      const before = out.length;
      push(weakest, g.spec, 'gap');
      if (out.length > before) taken++;
    }
  }
  // rehearsal (tier 3): last night's adoptions with a variation
  for (const h of history.filter((x) => x.night === night)) for (const v of variations(h.spec, organs[h.dataset])) push(h.dataset, v, 'rehearsal');
  return { candidates: out, calls, tier2 };
}
