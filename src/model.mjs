// ════════════════════════════════════════════════════════════════
// model.mjs — what an "idea" changes, and how it is scored. Pure, total, deterministic, gated.
//
// A dataset's ORGAN is a list of feature specs. An idea adds ONE spec. The organ is a logistic regression on its specs,
// each column standardised by its FIT mean and sd, ridge λ = 1 (not on the intercept), fitted by Newton/IRLS — at most
// 10 steps, stopping when the largest step is below 1e-9. Log-loss (nats) scores it on any rows.
//
//   raw(f)       x                          log(f)   sign(x)·ln(1 + |x|)
//   sq(f)        ((x − mean_f) / sd_f)²     step(f, q)   1 when x > the FIT q-quantile of f, else 0
//   cross(f, g)  ((x_f − mean_f)/sd_f)·((x_g − mean_g)/sd_g)
// A column that is constant on FIT is all zeros (detected exactly, never by a threshold on a computed spread).
// ════════════════════════════════════════════════════════════════

export const OPS = Object.freeze(['raw', 'log', 'sq', 'step', 'cross']);
export const QS = Object.freeze([0.25, 0.5, 0.75, 0.9]);
export const LAMBDA = 1, MAX_STEPS = 10, TOL = 1e-9;

/** The canonical key of a spec: raw(f), log(f), sq(f), step(f,q), cross(f,g) with f < g. '' when malformed. */
export function keyOf(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const ok = (f) => typeof f === 'string' && f.length > 0;
  if ((s.op === 'raw' || s.op === 'log' || s.op === 'sq') && ok(s.f)) return `${s.op}(${s.f})`;
  if (s.op === 'step' && ok(s.f) && QS.includes(s.q)) return `step(${s.f},${s.q})`;
  if (s.op === 'cross' && ok(s.f) && ok(s.g) && s.f !== s.g) return s.f < s.g ? `cross(${s.f},${s.g})` : `cross(${s.g},${s.f})`;
  return '';
}

/** The q-quantile of values (sorted copy, nearest rank on (n − 1)·q). */
export function quantileOf(values, q) {
  const s = Float64Array.from(values).sort();
  return s.length ? s[Math.round(q * (s.length - 1))] : 0;
}

/** FIT statistics of one raw column over the FIT rows. */
export function statsOf(col, rows) {
  const xs = rows.map((i) => col[i]);
  const n = xs.length;
  const mean = n ? xs.reduce((a, b) => a + b, 0) / n : 0;
  const constant = xs.every((x) => x === xs[0]);
  const sd = constant ? 0 : Math.sqrt(xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / n);
  return { mean, sd, q: Object.fromEntries(QS.map((q) => [q, quantileOf(xs, q)])) };
}

const z = (x, st) => (st.sd > 0 ? (x - st.mean) / st.sd : 0);

/** The raw (unstandardised) value of a spec on one row. ds = { cols }, stats = { f: statsOf } */
export function valueOf(spec, ds, stats, i) {
  const x = (f) => ds.cols[f][i];
  switch (spec.op) {
    case 'raw': return x(spec.f);
    case 'log': { const v = x(spec.f); return Math.sign(v) * Math.log1p(Math.abs(v)); }
    case 'sq': { const v = z(x(spec.f), stats[spec.f]); return v * v; }
    case 'step': return x(spec.f) > stats[spec.f].q[spec.q] ? 1 : 0;
    case 'cross': return z(x(spec.f), stats[spec.f]) * z(x(spec.g), stats[spec.g]);
    default: return 0;
  }
}

/**
 * One spec's standardised column on each row set, standardised by its FIT values.
 * sets = { fit: [rows], gate: [rows], test: [rows] } → { fit: Float64Array, gate, test, sd }
 */
export function columnOf(spec, ds, stats, sets) {
  const raw = Object.fromEntries(Object.entries(sets).map(([k, rows]) => [k, Float64Array.from(rows, (i) => valueOf(spec, ds, stats, i))]));
  const f = raw.fit;
  const n = f.length;
  const mean = n ? f.reduce((a, b) => a + b, 0) / n : 0;
  const constant = f.every((v) => v === f[0]);
  const sd = constant ? 0 : Math.sqrt(f.reduce((a, v) => a + (v - mean) * (v - mean), 0) / n);
  const out = { sd };
  for (const [k, col] of Object.entries(raw)) out[k] = col.map((v) => (sd > 0 ? (v - mean) / sd : 0));
  return out;
}

const sigma = (t) => 1 / (1 + Math.exp(-t));

/** η = β0 + Σ βj·col_j[i] for each row. cols = [Float64Array], one per spec. */
export function linear(beta, cols, n) {
  const eta = new Float64Array(n).fill(beta[0]);
  cols.forEach((c, j) => { const b = beta[j + 1]; for (let i = 0; i < n; i++) eta[i] += b * c[i]; });
  return eta;
}

/** Solve A·x = b for a symmetric positive-definite A (Cholesky). → x, or null when A is not positive definite. */
export function solve(A, b) {
  const p = b.length, L = new Float64Array(p * p);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * p + j];
      for (let k = 0; k < j; k++) s -= L[i * p + k] * L[j * p + k];
      if (i === j) { if (!(s > 0)) return null; L[i * p + i] = Math.sqrt(s); }
      else L[i * p + j] = s / L[j * p + j];
    }
  }
  const y = new Float64Array(p), x = new Float64Array(p);
  for (let i = 0; i < p; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * p + k] * y[k]; y[i] = s / L[i * p + i]; }
  for (let i = p - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < p; k++) s -= L[k * p + i] * x[k]; x[i] = s / L[i * p + i]; }
  return x;
}

/**
 * Fit the logistic model by IRLS. cols = standardised FIT columns, y = 0/1 labels on the FIT rows, start = optional
 * β to begin from (shorter is padded with zeros). → { beta, steps }
 */
export function fit(cols, y, start) {
  const p = cols.length + 1, n = y.length;
  const beta = new Float64Array(p);
  if (start) for (let j = 0; j < Math.min(p, start.length); j++) beta[j] = start[j];
  const col = (j, i) => (j === 0 ? 1 : cols[j - 1][i]);
  let steps = 0;
  for (; steps < MAX_STEPS; steps++) {
    const eta = linear(beta, cols, n);
    const H = new Float64Array(p * p), g = new Float64Array(p);
    for (let i = 0; i < n; i++) {
      const mu = sigma(eta[i]), w = mu * (1 - mu), r = y[i] - mu;
      for (let a = 0; a < p; a++) {
        const xa = col(a, i);
        g[a] += xa * r;
        const wa = w * xa;
        for (let b = 0; b <= a; b++) H[a * p + b] += wa * col(b, i);
      }
    }
    for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) H[b * p + a] = H[a * p + b];
    for (let a = 1; a < p; a++) { H[a * p + a] += LAMBDA; g[a] -= LAMBDA * beta[a]; }
    const d = solve(H, g);
    if (!d) break;
    let big = 0;
    for (let a = 0; a < p; a++) { beta[a] += d[a]; big = Math.max(big, Math.abs(d[a])); }
    if (big < TOL) { steps++; break; }
  }
  return { beta, steps };
}

/** Mean log-loss (nats) of probabilities sigma(eta) against labels y, each probability clamped to [1e-12, 1 − 1e-12]. */
export function logLoss(eta, y) {
  let s = 0;
  for (let i = 0; i < y.length; i++) {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, sigma(eta[i])));
    s -= y[i] ? Math.log(p) : Math.log(1 - p);
  }
  return y.length ? s / y.length : 0;
}

/** The entropy (nats) of a 0/1 base rate. */
export function baseEntropy(y) {
  const n = y.length;
  if (!n) return 0;
  let k = 0;
  for (const v of y) k += v;
  const p = k / n;
  return p <= 0 || p >= 1 ? 0 : -(p * Math.log(p) + (1 - p) * Math.log(1 - p));
}

/** |Pearson correlation| of a column with residuals (0 when either is constant). */
export function absCorr(a, b) {
  const n = a.length;
  if (!n) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return saa > 0 && sbb > 0 ? Math.abs(sab) / Math.sqrt(saa * sbb) : 0;
}

/** A column's FIT shape: skewness, share of zeros, and its distinct-count class (2, ≤10, ≤100, more). */
export function shapeOf(col, rows) {
  const xs = rows.map((i) => col[i]);
  const n = xs.length || 1;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const m2 = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / n, m3 = xs.reduce((a, x) => a + (x - mean) ** 3, 0) / n;
  const distinct = new Set(xs).size;
  return { skew: m2 > 0 ? m3 / m2 ** 1.5 : 0, zeros: xs.filter((x) => x === 0).length / n, kind: distinct <= 2 ? 0 : distinct <= 10 ? 1 : distinct <= 100 ? 2 : 3 };
}

/** How unlike two shapes are: skew gap (relative), zero-share gap, and 1 for a different kind. */
export function shapeGap(a, b) {
  return Math.abs(a.skew - b.skew) / (1 + Math.abs(a.skew)) + Math.abs(a.zeros - b.zeros) + (a.kind === b.kind ? 0 : 1);
}
