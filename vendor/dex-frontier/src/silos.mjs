// src/silos.mjs — the real data, as the separate departments of a business hold it. Two real public datasets, each cut
// into SILOS (the records one department keeps), with one seeded split each: FIT (a node grows its body here), GATE (it
// must prove itself here before it may answer, and the composer learns its weights here) and TEST (never seen by any node,
// composer or rule until the sealed measurement). Pure and total: a bad file is refused with its reason, never thrown.
//   · telco — IBM's Telco Customer Churn sample (7,043 real customers, Apache-2.0): customer / services / account
//   · shop  — UCI Online Shoppers Purchasing Intention (12,330 real sessions, CC BY 4.0): browsing / analytics / context
import { splitRows } from '../vendor/living-seed/vendor/seed-library/seedlib.mjs';

const yes = (v) => (v === 'Yes' ? 1 : 0);
const NUM = /^-?\d+(\.\d+)?(E-?\d+)?$/i;

/** how each raw telco column becomes a number; every encoding is fixed here, before any measurement */
export const TELCO_CODES = {
  gender: (v) => (v === 'Female' ? 1 : 0), SeniorCitizen: Number, Partner: yes, Dependents: yes,
  PhoneService: yes, MultipleLines: yes, InternetService: (v) => ({ No: 0, DSL: 1, 'Fiber optic': 2 })[v] ?? NaN,
  OnlineSecurity: yes, OnlineBackup: yes, DeviceProtection: yes, TechSupport: yes, StreamingTV: yes, StreamingMovies: yes,
  tenure: Number, Contract: (v) => ({ 'Month-to-month': 0, 'One year': 1, 'Two year': 2 })[v] ?? NaN, PaperlessBilling: yes,
  ElectronicCheck: (v, row) => (row.PaymentMethod === 'Electronic check' ? 1 : 0),
  AutoPay: (v, row) => (/\(automatic\)$/.test(row.PaymentMethod) ? 1 : 0),
  MonthlyCharges: Number, TotalCharges: (v) => (v.trim() === '' ? 0 : Number(v)),   // blank only for customers in their first month
};
export const TELCO_SILOS = {
  customer: ['gender', 'SeniorCitizen', 'Partner', 'Dependents'],
  services: ['PhoneService', 'MultipleLines', 'InternetService', 'OnlineSecurity', 'OnlineBackup', 'DeviceProtection', 'TechSupport', 'StreamingTV', 'StreamingMovies'],
  account: ['tenure', 'Contract', 'PaperlessBilling', 'ElectronicCheck', 'AutoPay', 'MonthlyCharges', 'TotalCharges'],
};
export const SHOP_SILOS = {
  browsing: ['Administrative', 'Administrative_Duration', 'Informational', 'Informational_Duration', 'ProductRelated', 'ProductRelated_Duration'],
  analytics: ['BounceRates', 'ExitRates', 'PageValues'],
  context: ['SpecialDay', 'OperatingSystems', 'Browser', 'Region', 'TrafficType', 'VisitorType', 'Weekend'],
};
const SHOP_CODES = { VisitorType: (v) => ({ Returning_Visitor: 1, New_Visitor: 0, Other: 0.5 })[v] ?? NaN, Weekend: (v) => (v === 'TRUE' ? 1 : v === 'FALSE' ? 0 : NaN) };
const HELD_MONTHS = new Set(['Nov', 'Dec']);
export const SPLIT = { telcoTest: 0.3, gate: 0.25, telcoSeed: 2026, gateSeed: 2027 };

function table(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { ok: false, error: 'no rows' };
  const head = lines[0].split(',');
  const rows = [];
  for (let k = 1; k < lines.length; k++) {
    const cells = lines[k].split(',');
    if (cells.length !== head.length) return { ok: false, error: 'row ' + k + ' has ' + cells.length + ' cells, not ' + head.length };
    rows.push(Object.fromEntries(head.map((h, j) => [h, cells[j]])));
  }
  return { ok: true, head, rows };
}

/** the telco customers: every feature encoded, churn = 1; test is a stratified 30%, the rest split fit / gate */
export function loadTelco(csv) {
  const t = table(csv);
  if (!t.ok) return t;
  const features = Object.values(TELCO_SILOS).flat(), raw = [...features.filter((f) => !['ElectronicCheck', 'AutoPay'].includes(f)), 'PaymentMethod', 'Churn'];
  const missing = raw.filter((c) => !t.head.includes(c));
  if (missing.length) return { ok: false, error: 'missing columns: ' + missing.join(', ') };
  const n = t.rows.length, cols = Object.fromEntries(features.map((f) => [f, new Float64Array(n)])), y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const row = t.rows[i];
    for (const f of features) {
      const v = TELCO_CODES[f](row[f], row);
      if (!Number.isFinite(v)) return { ok: false, error: 'customer ' + (i + 1) + ': ' + f + ' is not readable' };
      cols[f][i] = v;
    }
    if (row.Churn !== 'Yes' && row.Churn !== 'No') return { ok: false, error: 'customer ' + (i + 1) + ': Churn is not Yes or No' };
    y[i] = yes(row.Churn);
  }
  const all = Array.from({ length: n }, (_, i) => i), test = splitRows({ y }, all, SPLIT.telcoTest, SPLIT.telcoSeed);
  return finish({ name: 'telco', title: 'Telco customers', outcome: 'churn', features, cols, y, n, silos: TELCO_SILOS }, test.rest, test.held);
}

/** the shop sessions: test is November–December (as every shop organ before), the rest split fit / gate */
export function loadShop(csv) {
  const t = table(csv);
  if (!t.ok) return t;
  const features = Object.values(SHOP_SILOS).flat(), need = [...features, 'Month', 'Revenue'];
  const missing = need.filter((c) => !t.head.includes(c));
  if (missing.length) return { ok: false, error: 'missing columns: ' + missing.join(', ') };
  const n = t.rows.length, cols = Object.fromEntries(features.map((f) => [f, new Float64Array(n)])), y = new Uint8Array(n), early = [], late = [];
  for (let i = 0; i < n; i++) {
    const row = t.rows[i];
    for (const f of features) {
      const v = SHOP_CODES[f] ? SHOP_CODES[f](row[f]) : NUM.test(row[f]) ? Number(row[f]) : NaN;
      if (!Number.isFinite(v)) return { ok: false, error: 'session ' + (i + 1) + ': ' + f + ' is not readable' };
      cols[f][i] = v;
    }
    if (row.Revenue !== 'TRUE' && row.Revenue !== 'FALSE') return { ok: false, error: 'session ' + (i + 1) + ': Revenue is not TRUE or FALSE' };
    y[i] = row.Revenue === 'TRUE' ? 1 : 0;
    (HELD_MONTHS.has(row.Month) ? late : early).push(i);
  }
  return finish({ name: 'shop', title: 'Shop sessions', outcome: 'purchase', features, cols, y, n, silos: SHOP_SILOS }, early, late);
}

function finish(ds, known, test) {
  const g = splitRows(ds, known, SPLIT.gate, SPLIT.gateSeed);
  return { ok: true, ...ds, fitRows: g.rest, gateRows: g.held, testRows: test };
}

/** one silo as a node sees it: only that silo's columns, grown on FIT and graded on GATE (seed-library's shape) */
export function silo(ds, name) {
  const features = ds.silos[name];
  if (!features) return { ok: false, error: 'no silo ' + name + ' in ' + ds.name };
  return { ok: true, name: ds.name + '-' + name, features, cols: Object.fromEntries(features.map((f) => [f, ds.cols[f]])), y: ds.y, n: ds.n, trainRows: ds.fitRows, heldRows: ds.gateRows };
}

/** everything pooled in one place, the way a centrally trained model sees it: every column, FIT and GATE together */
export const pooled = (ds) => ({ features: ds.features, cols: ds.cols, y: ds.y, rows: [...ds.fitRows, ...ds.gateRows].sort((a, b) => a - b) });
