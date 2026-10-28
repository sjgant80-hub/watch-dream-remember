// src/fresh.mjs — two more real public datasets, for the gate's retest on cases no earlier attempt has touched. Organs 2
// to 2e all scored the same telco and shop test cases, so by the fifth attempt those were no longer fresh. These two were
// downloaded after organ 2e was judged; each is cut into departments by what its columns mean, with every encoding fixed
// here before any measurement. Pure and total: a bad file is refused with its reason, never thrown.
//   · bank  — UCI Bank Marketing, bank-additional-full.csv (41,188 real calls of a Portuguese bank's term-deposit
//             campaign, May 2008 – Nov 2010; Moro, Cortez & Rita 2014; CC BY 4.0): profile / credit / campaign / economy.
//             The call's duration is dropped: it is known only once the call is over (the dataset's own note).
//   · adult — UCI Adult (the 1994 US census extract, Becker & Kohavi 1996; CC BY 4.0): person / work / employer / tax;
//             income over $50K = 1. TEST is the dataset's own official test file (16,281 people). The census sampling
//             weight (fnlwgt) is not a fact about the person and is dropped; the education name duplicates its number.
import { splitRows } from '../vendor/living-seed/vendor/seed-library/seedlib.mjs';

export const FRESH_SPLIT = { test: 0.3, gate: 0.25, testSeed: 2026, gateSeed: 2027 };   // the telco split's shares and seeds

const JOBS = ['admin.', 'blue-collar', 'entrepreneur', 'housemaid', 'management', 'retired', 'self-employed', 'services', 'student', 'technician', 'unemployed'];
const EDU = { illiterate: 0, 'basic.4y': 1, 'basic.6y': 2, 'basic.9y': 3, 'high.school': 4, 'professional.course': 5, 'university.degree': 6, unknown: -1 };
const TRI = { no: 0, unknown: 0.5, yes: 1 };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DAYS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
const POUT = { nonexistent: 0, failure: 1, success: 2 };
const job = (name) => (v) => (v === name ? 1 : JOBS.includes(v) || v === 'unknown' ? 0 : NaN);
const num = (v) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN);
const of = (map) => (v) => (Object.hasOwn(map, v) ? map[v] : NaN);

/** how each bank column becomes a number (a category outside its list is refused) */
export const BANK_CODES = {
  age: num, ...Object.fromEntries(JOBS.map((j) => ['job_' + j, job(j)])),
  married: (v) => ({ married: 1, single: 0, divorced: 0, unknown: 0 })[v] ?? NaN, single: (v) => ({ married: 0, single: 1, divorced: 0, unknown: 0 })[v] ?? NaN,
  education: of(EDU), default: of(TRI), housing: of(TRI), loan: of(TRI),
  cellular: (v) => ({ cellular: 1, telephone: 0 })[v] ?? NaN, month: of(MONTHS), day: of(DAYS), campaign: num, pdays: num, previous: num, poutcome: of(POUT),
  'emp.var.rate': num, 'cons.price.idx': num, 'cons.conf.idx': num, euribor3m: num, 'nr.employed': num,
};
const BANK_RAW = { married: 'marital', single: 'marital', cellular: 'contact', day: 'day_of_week', ...Object.fromEntries(JOBS.map((j) => ['job_' + j, 'job'])) };
export const BANK_SILOS = {
  profile: ['age', ...JOBS.map((j) => 'job_' + j), 'married', 'single', 'education'],
  credit: ['default', 'housing', 'loan'],
  campaign: ['cellular', 'month', 'day', 'campaign', 'pdays', 'previous', 'poutcome'],
  economy: ['emp.var.rate', 'cons.price.idx', 'cons.conf.idx', 'euribor3m', 'nr.employed'],
};

const RACES = ['White', 'Black'], MARITAL = ['Married-civ-spouse', 'Never-married', 'Divorced', 'Separated', 'Widowed', 'Married-spouse-absent'];
const MARITAL_ALL = [...MARITAL, 'Married-AF-spouse'], REL = ['Husband', 'Wife', 'Own-child', 'Not-in-family', 'Unmarried'], REL_ALL = [...REL, 'Other-relative'];
const RACE_ALL = [...RACES, 'Asian-Pac-Islander', 'Amer-Indian-Eskimo', 'Other'];
const OCC = ['Tech-support', 'Craft-repair', 'Other-service', 'Sales', 'Exec-managerial', 'Prof-specialty', 'Handlers-cleaners', 'Machine-op-inspct', 'Adm-clerical', 'Farming-fishing', 'Transport-moving', 'Priv-house-serv', 'Protective-serv'];
const OCC_ALL = [...OCC, 'Armed-Forces', '?'];
const WORK = ['Private', 'Self-emp-not-inc', 'Self-emp-inc', 'Federal-gov', 'Local-gov', 'State-gov', 'Without-pay'];
const WORK_ALL = [...WORK, 'Never-worked', '?'];
const oneOf = (name, all) => (v) => (v === name ? 1 : all.includes(v) ? 0 : NaN);
const int = (v) => (/^-?\d+$/.test(v) ? Number(v) : NaN);

/** how each adult column becomes a number (a category outside its list is refused; "?" is the census's unknown) */
export const ADULT_CODES = {
  age: int, male: (v) => ({ Male: 1, Female: 0 })[v] ?? NaN, ...Object.fromEntries(RACES.map((r) => ['race_' + r, oneOf(r, RACE_ALL)])),
  usBorn: (v) => (v === 'United-States' ? 1 : v.length ? 0 : NaN),
  ...Object.fromEntries(MARITAL.map((m) => ['marital_' + m, oneOf(m, MARITAL_ALL)])), ...Object.fromEntries(REL.map((r) => ['rel_' + r, oneOf(r, REL_ALL)])),
  educationYears: int, hours: int, ...Object.fromEntries(OCC.map((o) => ['occ_' + o, oneOf(o, OCC_ALL)])),
  ...Object.fromEntries(WORK.map((w) => ['work_' + w, oneOf(w, WORK_ALL)])), capitalGain: int, capitalLoss: int,
};
const ADULT_RAW = { male: 'sex', usBorn: 'native-country', educationYears: 'education-num', hours: 'hours-per-week', capitalGain: 'capital-gain', capitalLoss: 'capital-loss',
  ...Object.fromEntries(RACES.map((r) => ['race_' + r, 'race'])), ...Object.fromEntries(MARITAL.map((m) => ['marital_' + m, 'marital-status'])), ...Object.fromEntries(REL.map((r) => ['rel_' + r, 'relationship'])),
  ...Object.fromEntries(OCC.map((o) => ['occ_' + o, 'occupation'])), ...Object.fromEntries(WORK.map((w) => ['work_' + w, 'workclass'])) };
export const ADULT_SILOS = {
  person: ['age', 'male', ...RACES.map((r) => 'race_' + r), 'usBorn', ...MARITAL.map((m) => 'marital_' + m), ...REL.map((r) => 'rel_' + r)],
  work: ['educationYears', 'hours', ...OCC.map((o) => 'occ_' + o)],
  employer: WORK.map((w) => 'work_' + w),
  tax: ['capitalGain', 'capitalLoss'],
};
const ADULT_HEAD = ['age', 'workclass', 'fnlwgt', 'education', 'education-num', 'marital-status', 'occupation', 'relationship', 'race', 'sex', 'capital-gain', 'capital-loss', 'hours-per-week', 'native-country', 'income'];

function encode(rows, features, codes, raw, label, what) {
  const n = rows.length, cols = Object.fromEntries(features.map((f) => [f, new Float64Array(n)])), y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (const f of features) {
      const v = codes[f](rows[i][raw[f] || f]);
      if (!Number.isFinite(v)) return { ok: false, error: what + ' ' + (i + 1) + ': ' + f + ' is not readable' };
      cols[f][i] = v;
    }
    const l = label(rows[i]);
    if (l === null) return { ok: false, error: what + ' ' + (i + 1) + ': the outcome is not readable' };
    y[i] = l;
  }
  return { ok: true, n, cols, y };
}

/** the bank's calls: ";"-separated with quoted text; subscribed = 1; a stratified 30% test, the rest 75 / 25 fit / gate */
export function loadBank(csv) {
  const lines = String(csv).split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { ok: false, error: 'no rows' };
  const cells = (l) => l.split(';').map((c) => c.replace(/^"|"$/g, '')), head = cells(lines[0]);
  const need = [...new Set(Object.keys(BANK_CODES).map((f) => BANK_RAW[f] || f)), 'y'], missing = need.filter((c) => !head.includes(c));
  if (missing.length) return { ok: false, error: 'missing columns: ' + missing.join(', ') };
  const rows = [];
  for (let k = 1; k < lines.length; k++) { const c = cells(lines[k]); if (c.length !== head.length) return { ok: false, error: 'row ' + k + ' has ' + c.length + ' cells, not ' + head.length }; rows.push(Object.fromEntries(head.map((h, j) => [h, c[j]]))); }
  const features = Object.values(BANK_SILOS).flat(), e = encode(rows, features, BANK_CODES, BANK_RAW, (r) => ({ yes: 1, no: 0 })[r.y] ?? null, 'call');
  if (!e.ok) return e;
  const all = Array.from({ length: e.n }, (_, i) => i), t = splitRows({ y: e.y }, all, FRESH_SPLIT.test, FRESH_SPLIT.testSeed);
  return finish({ name: 'bank', title: 'Bank calls', outcome: 'subscribed', features, ...e, silos: BANK_SILOS }, t.rest, t.held);
}

/** the census people: the training file is split 75 / 25 fit / gate; TEST is the official test file (its "." labels read too) */
export function loadAdult(dataText, testText) {
  const parse = (text, skipComment) => {
    const lines = String(text).split(/\r?\n/).filter((l) => l.trim() && !(skipComment && l.startsWith('|')));
    const rows = [];
    for (const [k, l] of lines.entries()) { const c = l.split(',').map((x) => x.trim()); if (c.length !== ADULT_HEAD.length) return { error: 'line ' + (k + 1) + ' has ' + c.length + ' cells, not ' + ADULT_HEAD.length }; rows.push(Object.fromEntries(ADULT_HEAD.map((h, j) => [h, c[j]]))); }
    return { rows };
  };
  const a = parse(dataText, false), b = parse(testText, true);
  if (a.error || b.error) return { ok: false, error: a.error ? 'training file: ' + a.error : 'test file: ' + b.error };
  if (!a.rows.length || !b.rows.length) return { ok: false, error: 'no rows' };
  const features = Object.values(ADULT_SILOS).flat(), label = (r) => ({ '>50K': 1, '<=50K': 0, '>50K.': 1, '<=50K.': 0 })[r.income] ?? null;
  const e = encode([...a.rows, ...b.rows], features, ADULT_CODES, ADULT_RAW, label, 'person');
  if (!e.ok) return e;
  const known = a.rows.map((_, i) => i), test = b.rows.map((_, i) => a.rows.length + i);
  return finish({ name: 'adult', title: 'Census people', outcome: 'income over $50K', features, ...e, silos: ADULT_SILOS }, known, test);
}

function finish(ds, known, test) {
  const g = splitRows(ds, known, FRESH_SPLIT.gate, FRESH_SPLIT.gateSeed);
  return { ok: true, ...ds, fitRows: g.rest, gateRows: g.held, testRows: test };
}
