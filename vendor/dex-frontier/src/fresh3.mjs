// src/fresh3.mjs — two more real public datasets, for organ 2h: test cases none of organs 2 to 2g touched. Downloaded after
// organ 2g was judged, each cut into departments by what its columns mean, every encoding fixed here before any
// measurement. Pure and total: a bad file is refused with its reason, never thrown.
//   · coupon — UCI In-Vehicle Coupon Recommendation (Wang et al. 2017; CC BY 4.0): 12,684 survey answers on whether a
//     driver accepts a coupon offered on the way. Departments: trip / coupon / driver / habits. The near-empty car
//     column, the always-1 "five minutes away" flag and the mirror of "same direction" are not used.
//   · cover — UCI Covertype (Blackard & Dean 1999; CC BY 4.0): US Forest Service 30 m cells in four Colorado wilderness
//     areas; spruce/fir = 1. A stratified seeded sample of about 60,000 of the 581,012 cells, drawn before the split.
//     Departments: terrain / distances / light / land / soil (soil by its land-type code's climate and geology zones and
//     its 14 most common types: 40 indicator columns are more than a department's 16).
// Each split as the other fresh datasets: a stratified 30% TEST, the rest 75 / 25 FIT / GATE (src/fresh.mjs's seeds).
import { splitRows } from '../vendor/living-seed/vendor/seed-library/seedlib.mjs';
import { FRESH_SPLIT } from './fresh.mjs';

const of = (map) => (v) => (Object.hasOwn(map, v) ? map[v] : NaN);
const flag = (v) => ({ 0: 0, 1: 1 })[v] ?? NaN;
const isOf = (name, all) => (v) => (v === name ? 1 : all.includes(v) ? 0 : NaN);

const DEST = ['No Urgent Place', 'Home', 'Work'], PASS = ['Alone', 'Friend(s)', 'Partner', 'Kid(s)'], WEATHER = ['Sunny', 'Snowy', 'Rainy'];
const COUPONS = ['Coffee House', 'Restaurant(<20)', 'Carry out & Take away', 'Bar', 'Restaurant(20-50)'], MARITAL = ['Married partner', 'Single', 'Unmarried partner', 'Divorced', 'Widowed'];
const OCC = ['Student', 'Unemployed', 'Retired'];
const FREQ = { never: 0, less1: 1, '1~3': 2, '4~8': 3, gt8: 4, '': -1 };   // visits a month; blank = not answered
/** how each coupon column becomes a number (a value outside its list is refused) */
export const COUPON_CODES = {
  dest_home: isOf('Home', DEST), dest_work: isOf('Work', DEST), with_friends: isOf('Friend(s)', PASS), with_partner: isOf('Partner', PASS), with_kids: isOf('Kid(s)', PASS),
  snowy: isOf('Snowy', WEATHER), rainy: isOf('Rainy', WEATHER), temperature: of({ 30: 30, 55: 55, 80: 80 }), hour: of({ '7AM': 7, '10AM': 10, '2PM': 14, '6PM': 18, '10PM': 22 }),
  far15: flag, far25: flag, same_way: flag,
  coffee: isOf('Coffee House', COUPONS), cheap_meal: isOf('Restaurant(<20)', COUPONS), carry_out: isOf('Carry out & Take away', COUPONS), bar: isOf('Bar', COUPONS), lasts_a_day: of({ '1d': 1, '2h': 0 }),
  female: of({ Female: 1, Male: 0 }), age: of({ below21: 18, 21: 21, 26: 26, 31: 31, 36: 36, 41: 41, 46: 46, '50plus': 55 }),
  married: isOf('Married partner', MARITAL), single: isOf('Single', MARITAL), partnered: isOf('Unmarried partner', MARITAL), children: flag,
  education: of({ 'Some High School': 1, 'High School Graduate': 2, 'Some college - no degree': 3, 'Associates degree': 4, 'Bachelors degree': 5, 'Graduate degree (Masters or Doctorate)': 6 }),
  income: of({ 'Less than $12500': 1, '$12500 - $24999': 2, '$25000 - $37499': 3, '$37500 - $49999': 4, '$50000 - $62499': 5, '$62500 - $74999': 6, '$75000 - $87499': 7, '$87500 - $99999': 8, '$100000 or More': 9 }),
  student: (v) => (typeof v === 'string' && v.length ? Number(v === 'Student') : NaN), unemployed: (v) => (typeof v === 'string' && v.length ? Number(v === 'Unemployed') : NaN), retired: (v) => (typeof v === 'string' && v.length ? Number(v === 'Retired') : NaN),
  bar_visits: of(FREQ), coffee_visits: of(FREQ), carry_out_visits: of(FREQ), cheap_meal_visits: of(FREQ), mid_meal_visits: of(FREQ),
};
const COUPON_RAW = { dest_home: 'destination', dest_work: 'destination', with_friends: 'passanger', with_partner: 'passanger', with_kids: 'passanger', snowy: 'weather', rainy: 'weather', hour: 'time',
  far15: 'toCoupon_GEQ15min', far25: 'toCoupon_GEQ25min', same_way: 'direction_same', coffee: 'coupon', cheap_meal: 'coupon', carry_out: 'coupon', bar: 'coupon', lasts_a_day: 'expiration',
  female: 'gender', married: 'maritalStatus', single: 'maritalStatus', partnered: 'maritalStatus', children: 'has_children', student: 'occupation', unemployed: 'occupation', retired: 'occupation',
  bar_visits: 'Bar', coffee_visits: 'CoffeeHouse', carry_out_visits: 'CarryAway', cheap_meal_visits: 'RestaurantLessThan20', mid_meal_visits: 'Restaurant20To50' };
export const COUPON_SILOS = {
  trip: ['dest_home', 'dest_work', 'with_friends', 'with_partner', 'with_kids', 'snowy', 'rainy', 'temperature', 'hour', 'far15', 'far25', 'same_way'],
  coupon: ['coffee', 'cheap_meal', 'carry_out', 'bar', 'lasts_a_day'],
  driver: ['female', 'age', 'married', 'single', 'partnered', 'children', 'education', 'income', 'student', 'unemployed', 'retired'],
  habits: ['bar_visits', 'coffee_visits', 'carry_out_visits', 'cheap_meal_visits', 'mid_meal_visits'],
};

export const COVER_COLUMNS = ['Elevation', 'Aspect', 'Slope', 'Horizontal_Distance_To_Hydrology', 'Vertical_Distance_To_Hydrology', 'Horizontal_Distance_To_Roadways', 'Hillshade_9am', 'Hillshade_Noon', 'Hillshade_3pm', 'Horizontal_Distance_To_Fire_Points',
  ...[1, 2, 3, 4].map((k) => 'Wilderness_Area' + k), ...Array.from({ length: 40 }, (_, k) => 'Soil_Type' + (k + 1)), 'Cover_Type'];
/** each soil type's USFS land-type (ELU) code, from the dataset's own notes (covtype.info) */
export const ELU = [2702, 2703, 2704, 2705, 2706, 2717, 3501, 3502, 4201, 4703, 4704, 4744, 4758, 5101, 5151, 6101, 6102, 6731, 7101, 7102, 7103, 7201, 7202, 7700, 7701, 7702, 7709, 7710, 7745, 7746, 7755, 7756, 7757, 7790, 8703, 8707, 8708, 8771, 8772, 8776];
export const COMMON_SOILS = [29, 23, 32, 33, 22, 10, 30, 12, 31, 24, 13, 38, 39, 11];   // the 14 most frequent of 581,012 cells
export const COVER_SILOS = {
  terrain: ['elevation', 'aspect', 'slope'],
  distances: ['water_across', 'water_up', 'road', 'fire_point'],
  light: ['shade_9am', 'shade_noon', 'shade_3pm'],
  land: ['rawah', 'neota', 'comanche_peak', 'cache_la_poudre'],
  soil: ['climate_zone', 'geology_zone', ...COMMON_SOILS.map((k) => 'soil_' + k)],
};
export const COVER_SAMPLE = { share: 60000 / 581012, seed: 2028 };

/** a cell's numbers: the 54 measured columns and its cover type, every one an integer, exactly one wilderness area and soil type */
export function coverCell(line) {
  const c = String(line).split(',');
  if (c.length !== COVER_COLUMNS.length || !c.every((x) => /^-?\d+$/.test(x))) return null;
  const n = c.map(Number), w = n.slice(10, 14), s = n.slice(14, 54);
  if (!w.every((v) => v === 0 || v === 1) || !s.every((v) => v === 0 || v === 1) || w.reduce((a, v) => a + v, 0) !== 1 || s.reduce((a, v) => a + v, 0) !== 1 || n[54] < 1 || n[54] > 7) return null;
  const soil = s.indexOf(1) + 1, elu = ELU[soil - 1];
  return {
    elevation: n[0], aspect: n[1], slope: n[2], water_across: n[3], water_up: n[4], road: n[5], shade_9am: n[6], shade_noon: n[7], shade_3pm: n[8], fire_point: n[9],
    rawah: w[0], neota: w[1], comanche_peak: w[2], cache_la_poudre: w[3], climate_zone: Math.floor(elu / 1000), geology_zone: Math.floor(elu / 100) % 10,
    ...Object.fromEntries(COMMON_SOILS.map((k) => ['soil_' + k, Number(soil === k)])), soilType: soil, coverType: n[54],
  };
}

function finish(ds) {
  const all = Array.from({ length: ds.n }, (_, i) => i), t = splitRows({ y: ds.y }, all, FRESH_SPLIT.test, FRESH_SPLIT.testSeed), g = splitRows(ds, t.rest, FRESH_SPLIT.gate, FRESH_SPLIT.gateSeed);
  return { ok: true, ...ds, fitRows: g.rest, gateRows: g.held, testRows: t.held };
}

/** the coupon answers: comma-separated with a header row; accepted = 1 */
export function couponRows(csv) {
  const lines = String(csv).split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { ok: false, error: 'no rows' };
  const head = lines[0].split(','), need = [...new Set([...Object.keys(COUPON_CODES).map((f) => COUPON_RAW[f] || f), 'Y'])], missing = need.filter((c) => !head.includes(c));
  if (missing.length) return { ok: false, error: 'missing columns: ' + missing.join(', ') };
  const rows = [];
  for (let k = 1; k < lines.length; k++) { const c = lines[k].split(','); if (c.length !== head.length) return { ok: false, error: 'row ' + k + ' has ' + c.length + ' cells, not ' + head.length }; rows.push(Object.fromEntries(head.map((h, j) => [h, c[j]]))); }
  return { ok: true, rows };
}

export function loadCoupon(csv) {
  const c = couponRows(csv);
  if (!c.ok) return c;
  const features = Object.values(COUPON_SILOS).flat(), n = c.rows.length, cols = Object.fromEntries(features.map((f) => [f, new Float64Array(n)])), y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (const f of features) { const v = COUPON_CODES[f](c.rows[i][COUPON_RAW[f] || f]); if (!Number.isFinite(v)) return { ok: false, error: 'answer ' + (i + 1) + ': ' + f + ' is not readable' }; cols[f][i] = v; }
    const l = flag(c.rows[i].Y);
    if (!Number.isFinite(l)) return { ok: false, error: 'answer ' + (i + 1) + ': the outcome is not readable' };
    y[i] = l;
  }
  return finish({ name: 'coupon', title: 'Coupon offers', outcome: 'coupon accepted', features, n, cols, y, silos: COUPON_SILOS });
}

/** the cells of covtype.data (already unzipped): the sample first (stratified, seeded, from every cell), then the split */
export function coverCells(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { ok: false, error: 'no rows' };
  const cells = [];
  for (const [k, l] of lines.entries()) { const c = coverCell(l); if (!c) return { ok: false, error: 'cell ' + (k + 1) + ' is not readable' }; cells.push(c); }
  const y = Uint8Array.from(cells, (c) => Number(c.coverType === 1)), keep = splitRows({ y }, cells.map((_, i) => i), COVER_SAMPLE.share, COVER_SAMPLE.seed).held.sort((a, b) => a - b);
  return { ok: true, all: cells.length, cells: keep.map((i) => cells[i]) };
}

export function loadCover(text) {
  const c = coverCells(text);
  if (!c.ok) return c;
  const features = Object.values(COVER_SILOS).flat(), n = c.cells.length, cols = Object.fromEntries(features.map((f) => [f, Float64Array.from(c.cells, (x) => x[f])])), y = Uint8Array.from(c.cells, (x) => Number(x.coverType === 1));
  return finish({ name: 'cover', title: 'Forest cells', outcome: 'spruce/fir', features, n, cols, y, silos: COVER_SILOS, all: c.all });
}
