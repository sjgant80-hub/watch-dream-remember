// src/fresh2.mjs — two more real public datasets, for organ 2g: test cases none of organs 2 to 2f touched. Downloaded after
// organ 2f was judged, each cut into departments by what its columns mean, every encoding fixed here before any
// measurement. Pure and total: a bad file is refused with its reason, never thrown.
//   · hospital — UCI Diabetes 130-US Hospitals 1999–2008 (Strack et al. 2014; CC BY 4.0): one stay per patient (the
//     first), stays that ended in death or hospice left out (they cannot be readmitted, as the dataset's paper does);
//     readmitted within 30 days = 1. Departments: admissions / clinical / pharmacy / history / discharge.
//   · credit — UCI Default of Credit Card Clients (Yeh & Lien 2009; CC BY 4.0): 30,000 Taiwanese card holders, default
//     next month = 1, read from data/credit-default.csv, which tools/convert-credit.mjs writes from the publisher's .xls
//     and CI re-derives byte for byte. Departments: customer / collections / billing / payments.
// Each split as the other fresh datasets: a stratified 30% TEST, the rest 75 / 25 FIT / GATE (src/fresh.mjs's seeds).
import { splitRows } from '../vendor/living-seed/vendor/seed-library/seedlib.mjs';
import { FRESH_SPLIT } from './fresh.mjs';

const of = (map) => (v) => (Object.hasOwn(map, v) ? map[v] : NaN);
const num = (v) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN);
const oneOf = (codes) => (v) => (/^\d+$/.test(v) ? Number(codes.includes(Number(v))) : NaN);

/** the primary diagnosis's ICD-9 group, as Strack et al. 2014 group them; codes they do not name, and "?", are "other" */
export function icdGroup(code) {
  if (code === '250' || /^250\.\d+$/.test(code)) return 'diabetes';
  if (!/^\d+(\.\d+)?$/.test(code)) return 'other';   // V and E codes, and the unknown "?"
  const n = Number(code);
  if ((n >= 390 && n < 460) || Math.floor(n) === 785) return 'circulatory';
  if ((n >= 460 && n < 520) || Math.floor(n) === 786) return 'respiratory';
  if ((n >= 520 && n < 580) || Math.floor(n) === 787) return 'digestive';
  if (n >= 800 && n < 1000) return 'injury';
  if (n >= 710 && n < 740) return 'musculoskeletal';
  if ((n >= 580 && n < 630) || Math.floor(n) === 788) return 'genitourinary';
  if (n >= 140 && n < 240) return 'neoplasms';
  return 'other';
}
const GROUPS = ['circulatory', 'respiratory', 'digestive', 'diabetes', 'injury', 'musculoskeletal', 'genitourinary', 'neoplasms'];
const DOSE = { No: 0, Down: 1, Steady: 2, Up: 3 };
const MEDS = ['insulin', 'metformin', 'glipizide', 'glyburide', 'glimepiride', 'pioglitazone', 'rosiglitazone', 'repaglinide'];
const RACES = ['Caucasian', 'AfricanAmerican', 'Hispanic', 'Asian'], RACE_ALL = [...RACES, 'Other', '?'];
export const ENDED = [11, 13, 14, 19, 20, 21];   // expired, or discharged to hospice: no readmission is possible

/** how each hospital column becomes a number (a value outside its list is refused) */
export const HOSPITAL_CODES = {
  age: (v) => { const m = /^\[(\d+)-(\d+)\)$/.exec(v); return m ? (Number(m[1]) + Number(m[2])) / 2 : NaN; },
  female: of({ Female: 1, Male: 0, 'Unknown/Invalid': 0.5 }),
  ...Object.fromEntries(RACES.map((r) => ['race_' + r, (v) => (v === r ? 1 : RACE_ALL.includes(v) ? 0 : NaN)])),
  adm_emergency: oneOf([1]), adm_urgent: oneOf([2]), adm_elective: oneOf([3]),
  src_er: oneOf([7]), src_referral: oneOf([1, 2, 3]), src_transfer: oneOf([4, 5, 6, 10, 18, 22, 25, 26]),
  time_in_hospital: num, num_lab_procedures: num, num_procedures: num, num_medications: num, number_diagnoses: num,
  glucose: of({ None: 0, Norm: 1, '>200': 2, '>300': 3 }), a1c: of({ None: 0, Norm: 1, '>7': 2, '>8': 3 }),
  ...Object.fromEntries(GROUPS.map((g) => ['dx_' + g, (v) => Number(icdGroup(v) === g)])),
  ...Object.fromEntries(MEDS.map((m) => [m, of(DOSE)])),
  med_change: of({ Ch: 1, No: 0 }), diabetes_med: of({ Yes: 1, No: 0 }),
  number_outpatient: num, number_emergency: num, number_inpatient: num,
  dis_home: oneOf([1]), dis_home_health: oneOf([6]), dis_snf: oneOf([3]), dis_short_term: oneOf([2]), dis_rehab: oneOf([22]), dis_ama: oneOf([7]),
};
const HOSPITAL_RAW = { female: 'gender', glucose: 'max_glu_serum', a1c: 'A1Cresult', med_change: 'change', diabetes_med: 'diabetesMed',
  ...Object.fromEntries(RACES.map((r) => ['race_' + r, 'race'])), ...Object.fromEntries(['adm_emergency', 'adm_urgent', 'adm_elective'].map((k) => [k, 'admission_type_id'])),
  ...Object.fromEntries(['src_er', 'src_referral', 'src_transfer'].map((k) => [k, 'admission_source_id'])), ...Object.fromEntries(GROUPS.map((g) => ['dx_' + g, 'diag_1'])),
  ...Object.fromEntries(['dis_home', 'dis_home_health', 'dis_snf', 'dis_short_term', 'dis_rehab', 'dis_ama'].map((k) => [k, 'discharge_disposition_id'])) };
export const HOSPITAL_SILOS = {
  admissions: ['age', 'female', ...RACES.map((r) => 'race_' + r), 'adm_emergency', 'adm_urgent', 'adm_elective', 'src_er', 'src_referral', 'src_transfer'],
  clinical: ['time_in_hospital', 'num_lab_procedures', 'num_procedures', 'num_medications', 'number_diagnoses', 'glucose', 'a1c', ...GROUPS.map((g) => 'dx_' + g)],
  pharmacy: [...MEDS, 'med_change', 'diabetes_med'],
  history: ['number_outpatient', 'number_emergency', 'number_inpatient'],
  discharge: ['dis_home', 'dis_home_health', 'dis_snf', 'dis_short_term', 'dis_rehab', 'dis_ama'],
};

/** the hospital's stays, chosen and encoded: the first stay of each patient, deaths and hospice left out */
export function hospitalRows(csv) {
  const lines = String(csv).split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { ok: false, error: 'no rows' };
  const head = lines[0].split(','), need = [...new Set([...Object.keys(HOSPITAL_CODES).map((f) => HOSPITAL_RAW[f] || f), 'encounter_id', 'patient_nbr', 'readmitted'])];
  const missing = need.filter((c) => !head.includes(c));
  if (missing.length) return { ok: false, error: 'missing columns: ' + missing.join(', ') };
  const all = [];
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k].split(',');
    if (c.length !== head.length) return { ok: false, error: 'row ' + k + ' has ' + c.length + ' cells, not ' + head.length };
    all.push(Object.fromEntries(head.map((h, j) => [h, c[j]])));
  }
  all.sort((a, b) => Number(a.encounter_id) - Number(b.encounter_id));   // in encounter order, so a patient's first stay comes first
  const seen = new Set(), rows = [];
  for (const row of all) { if (seen.has(row.patient_nbr)) continue; seen.add(row.patient_nbr); if (!ENDED.includes(Number(row.discharge_disposition_id))) rows.push(row); }
  return { ok: true, rows, patients: seen.size };
}

function encode(rows, features, codes, raw, label, what) {
  const n = rows.length, cols = Object.fromEntries(features.map((f) => [f, new Float64Array(n)])), y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (const f of features) { const v = codes[f](rows[i][raw[f] || f]); if (!Number.isFinite(v)) return { ok: false, error: what + ' ' + (i + 1) + ': ' + f + ' is not readable' }; cols[f][i] = v; }
    const l = label(rows[i]);
    if (l === null) return { ok: false, error: what + ' ' + (i + 1) + ': the outcome is not readable' };
    y[i] = l;
  }
  return { ok: true, n, cols, y };
}

function finish(ds) {
  const all = Array.from({ length: ds.n }, (_, i) => i), t = splitRows({ y: ds.y }, all, FRESH_SPLIT.test, FRESH_SPLIT.testSeed), g = splitRows(ds, t.rest, FRESH_SPLIT.gate, FRESH_SPLIT.gateSeed);
  return { ok: true, ...ds, fitRows: g.rest, gateRows: g.held, testRows: t.held };
}

export function loadHospital(csv) {
  const h = hospitalRows(csv);
  if (!h.ok) return h;
  const features = Object.values(HOSPITAL_SILOS).flat(), e = encode(h.rows, features, HOSPITAL_CODES, HOSPITAL_RAW, (r) => ({ '<30': 1, '>30': 0, NO: 0 })[r.readmitted] ?? null, 'stay');
  if (!e.ok) return e;
  return finish({ name: 'hospital', title: 'Hospital stays', outcome: 'readmitted within 30 days', features, ...e, silos: HOSPITAL_SILOS, patients: h.patients });
}

export const CREDIT_SILOS = {
  customer: ['limit', 'female', 'education', 'married', 'single', 'age'],
  collections: ['PAY_0', 'PAY_2', 'PAY_3', 'PAY_4', 'PAY_5', 'PAY_6'],
  billing: ['BILL_AMT1', 'BILL_AMT2', 'BILL_AMT3', 'BILL_AMT4', 'BILL_AMT5', 'BILL_AMT6'],
  payments: ['PAY_AMT1', 'PAY_AMT2', 'PAY_AMT3', 'PAY_AMT4', 'PAY_AMT5', 'PAY_AMT6'],
};
const int = (v) => (Number.isInteger(v) ? v : NaN);
/** how each credit column becomes a number: education ranked (graduate school 3, university 2, high school 1, other or unknown 0) */
export const CREDIT_CODES = {
  limit: int, female: (v) => ({ 1: 0, 2: 1 })[v] ?? NaN, education: (v) => (Number.isInteger(v) && v >= 0 && v <= 6 ? ({ 1: 3, 2: 2, 3: 1 })[v] ?? 0 : NaN),
  married: (v) => (Number.isInteger(v) && v >= 0 && v <= 3 ? Number(v === 1) : NaN), single: (v) => (Number.isInteger(v) && v >= 0 && v <= 3 ? Number(v === 2) : NaN), age: int,
  ...Object.fromEntries([...CREDIT_SILOS.collections, ...CREDIT_SILOS.billing, ...CREDIT_SILOS.payments].map((f) => [f, int])),
};
const CREDIT_RAW = { limit: 'LIMIT_BAL', female: 'SEX', education: 'EDUCATION', married: 'MARRIAGE', single: 'MARRIAGE', age: 'AGE' };

/** the credit clients, from data/credit-default.csv: a row of column names, then one client a row, every cell a number */
export function creditRows(csv) {
  const lines = String(csv).split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { ok: false, error: 'no rows' };
  const head = lines[0].split(','), need = [...new Set([...Object.keys(CREDIT_CODES).map((f) => CREDIT_RAW[f] || f), 'default payment next month'])], missing = need.filter((c) => !head.includes(c));
  if (missing.length) return { ok: false, error: 'missing columns: ' + missing.join(', ') };
  const rows = [];
  for (let k = 1; k < lines.length; k++) { const c = lines[k].split(','); if (c.length !== head.length) return { ok: false, error: 'row ' + k + ' has ' + c.length + ' cells, not ' + head.length }; rows.push(Object.fromEntries(head.map((h, j) => [h, /^-?\d+$/.test(c[j]) ? Number(c[j]) : c[j]]))); }
  return { ok: true, rows };
}

export function loadCredit(csv) {
  const c = creditRows(csv);
  if (!c.ok) return c;
  const features = Object.values(CREDIT_SILOS).flat(), e = encode(c.rows, features, CREDIT_CODES, CREDIT_RAW, (r) => ({ 1: 1, 0: 0 })[r['default payment next month']] ?? null, 'client');
  if (!e.ok) return e;
  return finish({ name: 'credit', title: 'Credit clients', outcome: 'default next month', features, ...e, silos: CREDIT_SILOS });
}
