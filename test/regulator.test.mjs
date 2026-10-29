import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR, DAY, MINUTE, N_MIN, K_FIELD, EPS_FLOOR, CV_CAP, MIN_WINDOWS, PARTS, LADDER, BAR,
  filesBucket, gapBucket, entropy, cvOf, quantile, partsOf, bandOf, withGaps, windowsOf, peaks, calibrate, field, budget, freshNode, decide, fromBES, RULES,
} from '../src/regulator.mjs';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const sig = (x) => 1 / (1 + Math.exp(-x));

test('constants', () => {
  assert.deepEqual([HOUR, DAY, MINUTE], [3600000, 86400000, 60000]);
  assert.deepEqual([N_MIN, K_FIELD, EPS_FLOOR, CV_CAP, MIN_WINDOWS], [5, 8, 0.25, 0.35, 8]);
  assert.deepEqual(PARTS, ['area', 'files', 'gap']);
  assert.deepEqual(LADDER, ['steady', 'watch', 'throttle', 'pause']);
  assert.deepEqual({ ...BAR }, { watch: 0.3, throttle: 0.6, pause: 0.85, rapid: 0.5, field: 0.5 });
});

test('filesBucket: 1, 2, 3–4, 5–8, 9–16, 17+', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 8, 9, 16, 17, 32, 1000, 'x', NaN].map(filesBucket), [0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 0, 0]);
});

test('gapBucket: floor(log2(1 + minutes)), capped at 9', () => {
  assert.equal(gapBucket(0), 0);
  assert.equal(gapBucket(59999), 0);
  assert.equal(gapBucket(MINUTE), 1);
  assert.equal(gapBucket(2 * MINUTE), 1);
  assert.equal(gapBucket(3 * MINUTE), 2);
  assert.equal(gapBucket(7 * MINUTE), 3);
  assert.equal(gapBucket(10 * MINUTE), 3);
  assert.equal(gapBucket(511 * MINUTE), 9);
  assert.equal(gapBucket(1023 * MINUTE), 9);
  assert.equal(gapBucket(-5), 0);
  assert.equal(gapBucket('x'), 0);
});

test('entropy: Miller–Madow, nats', () => {
  assert.equal(entropy([]), null);
  assert.equal(entropy(null), null);
  assert.equal(entropy([1, 1, 1]), 0);
  close(entropy([1, 2]), Math.log(2) + 1 / 4);
  close(entropy([1, 2, 2, 3]), -(0.25 * Math.log(0.25) * 2 + 0.5 * Math.log(0.5)) + 2 / 8);
  close(entropy(['a', 'b', 'c', 'd', 'e', 'f']), Math.log(6) + 5 / 12);
});

test('cvOf: population sd / mean; null with no rhythm to read', () => {
  assert.equal(cvOf([5, 5, 5]), 0);
  close(cvOf([1, 3]), 0.5);
  close(cvOf([2, 4, 6]), Math.sqrt(8 / 3) / 4);
  assert.equal(cvOf([5]), null);
  assert.equal(cvOf([]), null);
  assert.equal(cvOf(null), null);
  assert.equal(cvOf([0, 0, 0]), null);
  assert.equal(cvOf([NaN, 4]), null);
  close(cvOf([NaN, 2, 6]), 0.5);
});

test('quantile: nearest rank on (n − 1)·q', () => {
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile(null, 0.5), null);
  assert.equal(quantile([3, 1, 2], 0.5), 2);
  const xs = Array.from({ length: 21 }, (_, i) => 20 - i);
  assert.equal(quantile(xs, 0.05), 1);
  assert.equal(quantile(xs, 0.95), 19);
  assert.equal(quantile(xs, 0), 0);
  assert.equal(quantile(xs, 1), 20);
  assert.equal(quantile(xs, 2), 20);
  assert.equal(quantile(xs, -1), 0);
  assert.equal(quantile([1, NaN, 'x', 4], 1), 4);
  assert.equal(quantile([10, 20, 30, 40], 0.5), 30);
});

test('partsOf: three parts and the rhythm', () => {
  const w = [
    { t: 1, area: 'src', files: 1, gap: null },
    { t: 2, area: 'src', files: 2, gap: 2 * MINUTE },
    { t: 3, area: 'test', files: 2, gap: 4 * MINUTE },
  ];
  const p = partsOf(w);
  assert.equal(p.n, 3);
  close(p.H.area, entropy([0, 0, 1]));
  close(p.H.files, entropy([0, 1, 1]));
  close(p.H.gap, entropy([1, 2]));
  close(p.cv, cvOf([2 * MINUTE, 4 * MINUTE]));
  const e = partsOf(null);
  assert.deepEqual(e, { n: 0, H: { area: null, files: null, gap: null }, cv: null });
  assert.equal(partsOf([null, 5, { t: 1, area: 'x', files: 1, gap: null }]).n, 1);
});

test('bandOf: middle and half-width of q05–q95, with a floor', () => {
  const xs = Array.from({ length: 21 }, (_, i) => i / 10);
  close(bandOf(xs).Sb, 1);
  close(bandOf(xs).eps, 0.9);
  assert.deepEqual(bandOf([1, 1, 1]), { Sb: 1, eps: EPS_FLOOR });
  assert.deepEqual(bandOf([1, 1.2]), { Sb: 1.1, eps: EPS_FLOOR });
  assert.equal(bandOf([]), null);
});

test('withGaps and windowsOf', () => {
  const a = withGaps([{ t: 10 }, { t: 30 }, { t: 35 }]);
  assert.deepEqual(a.map((x) => x.gap), [null, 20, 5]);
  assert.deepEqual(withGaps(null), []);
  const acts = [{ t: 100 }, { t: HOUR }, { t: HOUR + 1 }, { t: 2 * HOUR + 5 }, { t: 5 * HOUR }];
  const ws = windowsOf(acts, 0, 3 * HOUR, 0);
  assert.deepEqual(ws.map((w) => w.map((x) => x.t)), [[], [100, HOUR], [HOUR + 1]]);
  const off = windowsOf(acts, 0, 3 * HOUR, 10);
  assert.deepEqual(off.map((w) => w.map((x) => x.t)), [[], [100, HOUR, HOUR + 1], [2 * HOUR + 5]]);   // visits at 10 ms, 1 h + 10 ms, …
  const late = windowsOf(acts, HOUR + 1, 4 * HOUR, 0);
  assert.deepEqual(late.map((w) => w.map((x) => x.t)), [[HOUR + 1], [2 * HOUR + 5]]);
  assert.deepEqual(windowsOf(null, 0, HOUR, 0), [[]]);
  assert.deepEqual(windowsOf(acts, 0, 0, 0), []);
  const old = windowsOf([{ t: 0 }, { t: 5 * HOUR }], 4 * HOUR, 6 * HOUR, 0);
  assert.deepEqual(old.map((w) => w.map((x) => x.t)), [[], [5 * HOUR]]);
});

test('peaks: most actions in a clock hour and a UTC day', () => {
  const acts = [{ t: 0 }, { t: 10 }, { t: HOUR - 1 }, { t: HOUR }, { t: DAY - 1 }, { t: DAY }];
  assert.deepEqual(peaks(acts), { hour: 3, day: 5 });
  assert.deepEqual(peaks([]), { hour: 0, day: 0 });
  assert.deepEqual(peaks(null), { hour: 0, day: 0 });
});

// a node with plenty of busy hours: 12 hours, 6 actions each, mixed areas and gaps
const busy = (start, areas = ['src', 'test', 'data'], step = [3, 7, 2, 11, 5]) => {
  const out = [];
  for (let h = 0; h < 12; h++) for (let k = 0; k < 6; k++) out.push({ t: start + h * HOUR + (k * 9 + step[(h + k) % step.length]) * MINUTE, area: areas[(h + k) % areas.length], files: 1 + ((h * 3 + k) % 5) });
  return out;
};

test('calibrate: own bands with enough windows, pooled otherwise; budgets and recipes', () => {
  const big = busy(0), small = [{ t: 0, area: 'docs', files: 3 }, { t: HOUR, area: 'docs', files: 3 }, { t: 2 * HOUR, area: 'src', files: 5 }];
  const cal = calibrate([{ name: 'big', fit: big, offset: 0 }, { name: 'small', fit: small, offset: 0 }]);
  const b = cal.nodes.big, s = cal.nodes.small;
  assert.equal(b.pooled, false);
  assert.equal(s.pooled, true);
  assert.deepEqual(s.band, cal.pooled.band);
  assert.equal(s.cvFloor, cal.pooled.cvFloor);
  assert.deepEqual(b.band, cal.pooled.band);   // the big node is the only one with windows: its own band equals the pool
  for (const k of PARTS) assert.ok(b.band[k].eps >= EPS_FLOOR);
  assert.ok(b.cvFloor > 0 && b.cvFloor <= CV_CAP);
  assert.equal(b.fitHourMax, 6);
  assert.equal(b.perHour, 12);
  assert.equal(b.perDay, Math.max(20, 2 * 72));
  assert.equal(s.perHour, 6);
  assert.equal(s.perDay, 20);
  assert.equal(s.topArea, 'docs');
  assert.equal(s.medianFiles, 3);
  assert.equal(b.topArea, 'src');
  assert.equal(calibrate([{ name: 'tie', fit: [{ t: 0, area: 'test', files: 1 }, { t: 1, area: 'src', files: 1 }] }]).nodes.tie.topArea, 'src');
  assert.equal(calibrate([{ name: 'm', fit: [{ t: 0, area: 'test', files: 1 }, { t: 1, area: 'test', files: 9 }, { t: 2, area: 'data', files: 4 }] }]).nodes.m.medianFiles, 4);
  const empty = calibrate([{ name: 'e', fit: [] }]);
  assert.equal(empty.nodes.e.medianFiles, 1);
  assert.equal(empty.nodes.e.cvFloor, 0);
  assert.deepEqual(empty.pooled.band, { area: null, files: null, gap: null });
  assert.deepEqual(calibrate(null), { pooled: { band: { area: null, files: null, gap: null }, cvFloor: 0 }, nodes: {} });
});

test('calibrate: a node with 8 busy windows of its own keeps its own band', () => {
  const a = busy(0, ['src', 'test', 'data']);
  const c = busy(0, ['page', 'page', 'page', 'docs'], [1, 1, 1, 1, 1]);
  const cal = calibrate([{ name: 'a', fit: a }, { name: 'c', fit: c }]);
  assert.equal(cal.nodes.a.pooled, false);
  assert.equal(cal.nodes.c.pooled, false);
  assert.notDeepEqual(cal.nodes.a.band.area, cal.nodes.c.band.area);
  const seven = busy(0).slice(0, 7 * 6);
  assert.equal(calibrate([{ name: 's', fit: seven }]).nodes.s.pooled, true);
  const eight = busy(0).slice(0, 8 * 6);
  assert.equal(calibrate([{ name: 's', fit: eight }]).nodes.s.pooled, false);
});

const base = { band: { area: { Sb: 1, eps: 0.3 }, files: { Sb: 1, eps: 0.3 }, gap: { Sb: 1, eps: 0.3 } }, cvFloor: 0.2, perHour: 10, perDay: 30 };
const win = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('field: Gary’s sigmoid per part, the regularity row, the worst decides; nothing below N_MIN', () => {
  const four = win(4, (i) => ({ t: i, area: 'src', files: 1, gap: 10 * MINUTE }));
  assert.deepEqual(field(four, base), { E: 0, parts: { area: 0, files: 0, gap: 0, reg: 0 }, n: 4 });
  const clock = win(5, (i) => ({ t: i, area: 'src', files: 1, gap: 10 * MINUTE }));
  const f = field(clock, base);
  assert.equal(f.parts.reg, 1);
  assert.equal(f.E, 1);
  close(f.parts.area, sig(K_FIELD * (Math.abs(0 - 1) - 0.3)));
  const mixed = win(6, (i) => ({ t: i, area: ['src', 'test', 'data'][i % 3], files: 1 + (i % 2), gap: (i + 1) * 4 * MINUTE }));
  const p = partsOf(mixed), g = field(mixed, base);
  close(g.parts.area, sig(K_FIELD * (Math.abs(p.H.area - 1) - 0.3)));
  close(g.parts.files, sig(K_FIELD * (Math.abs(p.H.files - 1) - 0.3)));
  close(g.parts.gap, sig(K_FIELD * (Math.abs(p.H.gap - 1) - 0.3)));
  assert.equal(g.parts.reg, 0);
  close(g.E, Math.max(g.parts.area, g.parts.files, g.parts.gap));
  assert.equal(field(clock, { ...base, cvFloor: 0 }).parts.reg, 0);
  assert.equal(field(clock, null).E, 0);
  assert.equal(field(clock, { band: { area: null, files: { Sb: 0, eps: 0.3 }, gap: null }, cvFloor: 0 }).parts.area, 0);
  close(field(clock, { band: { area: null, files: { Sb: 0, eps: 0.3 }, gap: null }, cvFloor: 0 }).parts.files, sig(-2.4));
  const firstEver = win(5, (i) => ({ t: i, area: 'src', files: 1, gap: null }));
  assert.equal(field(firstEver, base).parts.gap, 0);
  assert.equal(field(firstEver, base).parts.reg, 0);
  const edge = win(5, () => ({ t: 0, area: 'src', files: 1, gap: 10 * MINUTE }));
  assert.equal(field(edge, { ...base, cvFloor: 0.0000001 }).parts.reg, 1);
});

test('budget: attempts against perHour and perDay', () => {
  assert.deepEqual(budget(10, 30, base), { r: 1, E: 0 });
  assert.deepEqual(budget(15, 0, base), { r: 1.5, E: 0.8 });
  assert.deepEqual(budget(0, 60, base), { r: 2, E: 1 });
  assert.deepEqual(budget(40, 0, base), { r: 4, E: 1 });
  close(budget(11, 0, base).E, 0.64, 1e-12);
  assert.deepEqual(budget(5, 0, null), { r: 5, E: 1 });
  assert.deepEqual(budget('x', NaN, { perHour: 0, perDay: 0 }), { r: 0, E: 0 });
});

test('fromBES maps the BES verdicts onto this ladder', () => {
  assert.deepEqual(['ALLOW', 'THROTTLE', 'STEP_UP', 'BLOCK', 'ISOLATE', 'X', undefined].map(fromBES), ['steady', 'throttle', 'watch', 'pause', 'pause', 'watch', 'watch']);
});

const quiet = win(5, (i) => ({ t: i, area: 'src', files: 2, gap: (3 + 7 * (i % 3)) * MINUTE }));
const obs = (over = {}) => ({ t: 100 * HOUR, window: [], sinceVisit: 0, lastDay: 0, healthOk: true, highStakes: false, ...over });

test('decide: steady with no evidence; pressure decays', () => {
  const d = decide(freshNode(), obs(), base);
  assert.equal(d.verdict, 'steady');
  assert.deepEqual(d.reasons, []);
  assert.equal(d.P, 0);
  assert.equal(d.renew, false);
  assert.equal(d.lift, false);
  assert.equal(d.probation, false);
  const e = decide({ ...freshNode(), P: 0.7, E: 1 }, obs(), base);
  assert.equal(e.P, 0.35);
  assert.equal(e.verdict, 'watch');
  assert.equal(e.g, 0);
  const z = decide({ ...freshNode(), P: 0.5, E: 1 }, obs(), base);
  assert.equal(z.P, 0.25);
  assert.equal(z.verdict, 'steady');
  assert.deepEqual(decide(undefined, undefined, base).verdict, 'pause');   // unreadable health is a failed health
});

test('decide: a clockwork runaway climbs watch → throttle → pause', () => {
  const clock = win(6, (i) => ({ t: i, area: 'src', files: 1, gap: 10 * MINUTE }));
  let m = freshNode();
  const seen = [];
  for (let k = 0; k < 4; k++) { const d = decide(m, obs({ t: (100 + k) * HOUR, window: clock, sinceVisit: 6, lastDay: 6 * (k + 1) }), base); seen.push([d.verdict, d.P]); m = d.next; }
  assert.deepEqual(seen.map((x) => x[0]), ['watch', 'throttle', 'pause', 'pause']);
  assert.deepEqual(seen.map((x) => x[1]), [0.5, 0.75, 0.875, 0.875]);
  const d0 = decide(freshNode(), obs({ window: clock, sinceVisit: 6, lastDay: 6 }), base);
  assert.deepEqual(d0.reasons, ['drift', 'rate']);
  assert.equal(d0.g, 1);
  assert.equal(d0.E, 1);
  assert.equal(d0.r, 0.6);
  assert.deepEqual(d0.parts && d0.parts.reg, 1);
  assert.equal(d0.next.throttled, false);
  const d1 = decide(d0.next, obs({ window: clock, sinceVisit: 6, lastDay: 12 }), base);
  assert.equal(d1.next.throttled, true);
  assert.deepEqual(d1.reasons, ['drift']);
  const d2 = decide(d1.next, obs({ t: 102 * HOUR, window: clock, sinceVisit: 6, lastDay: 18 }), base);
  assert.equal(d2.verdict, 'pause');
  assert.equal(d2.renew, false);
  assert.equal(d2.next.paused, true);
  assert.equal(d2.next.pauses, 1);
  assert.equal(d2.next.coolUntil, 102 * HOUR + 12 * HOUR);
  assert.equal(d2.next.throttled, false);
  const held = decide(d2.next, obs({ t: 103 * HOUR, window: [], sinceVisit: 9, lastDay: 99 }), base);
  assert.deepEqual([held.verdict, held.reasons, held.renew, held.P], ['pause', ['held'], true, 0.875]);
  assert.deepEqual(held.next, d2.next);
});

test('decide: probation after the cool-down, doubled on the second pause; high-stakes never', () => {
  const paused = { ...freshNode(), P: 0.9, E: 1, paused: true, pauses: 1, coolUntil: 50 * HOUR };
  const early = decide(paused, obs({ t: 50 * HOUR - 1 }), base);
  assert.equal(early.verdict, 'pause');
  assert.equal(early.renew, true);
  const calm = decide(paused, obs({ t: 50 * HOUR }), base);
  assert.equal(calm.verdict, 'throttle');
  assert.equal(calm.probation, true);
  assert.equal(calm.renew, false);
  assert.equal(calm.next.paused, false);
  assert.equal(calm.next.throttled, true);
  assert.equal(calm.next.pauses, 1);
  const clock = win(6, (i) => ({ t: i, area: 'src', files: 1, gap: 10 * MINUTE }));
  const again = decide(paused, obs({ t: 50 * HOUR, window: clock, sinceVisit: 6, lastDay: 6 }), base);
  assert.equal(again.verdict, 'pause');
  assert.equal(again.renew, false);
  assert.equal(again.probation, false);
  assert.equal(again.next.pauses, 2);
  assert.equal(again.next.coolUntil, 50 * HOUR + 24 * HOUR);
  const hs = decide(paused, obs({ t: 500 * HOUR, highStakes: true }), base);
  assert.deepEqual([hs.verdict, hs.reasons, hs.renew], ['pause', ['held'], true]);
});

test('decide: health fails → pause at once, counted once, cool-down by count', () => {
  const d = decide(freshNode(), obs({ healthOk: false }), base);
  assert.deepEqual([d.verdict, d.reasons, d.renew], ['pause', ['health'], false]);
  assert.equal(d.next.paused, true);
  assert.equal(d.next.pauses, 1);
  assert.equal(d.next.coolUntil, 100 * HOUR + 12 * HOUR);
  const d2 = decide(d.next, obs({ t: 200 * HOUR, healthOk: false }), base);
  assert.deepEqual([d2.verdict, d2.renew], ['pause', true]);
  assert.equal(d2.next.pauses, 1);
  assert.equal(d2.next.coolUntil, d.next.coolUntil);
  const third = decide({ ...freshNode(), pauses: 2, throttled: true }, obs({ healthOk: false }), base);
  assert.equal(third.next.coolUntil, 100 * HOUR + 48 * HOUR);
  assert.equal(third.next.throttled, false);
  assert.equal(decide(freshNode(), obs({ healthOk: 'yes' }), base).verdict, 'pause');
});

test('decide: budget — over once throttles, over twice pauses', () => {
  const one = decide(freshNode(), obs({ window: quiet, sinceVisit: 11, lastDay: 11 }), { ...base, band: { area: null, files: null, gap: null }, cvFloor: 0 });
  assert.equal(one.verdict, 'throttle');
  assert.deepEqual(one.reasons, ['budget', 'rate']);
  assert.equal(one.next.over, true);
  const two = decide(one.next, obs({ window: quiet, sinceVisit: 11, lastDay: 22 }), { ...base, band: { area: null, files: null, gap: null }, cvFloor: 0 });
  assert.equal(two.verdict, 'pause');
  assert.deepEqual(two.reasons, ['budget']);
  const atBar = decide(freshNode(), obs({ sinceVisit: 10, lastDay: 30 }), base);
  assert.equal(atBar.verdict, 'steady');
  assert.equal(atBar.next.over, false);
});

test('decide: a weaker verdict lifts a throttle; the BES slot; an unreadable drift reads as watch', () => {
  const lifted = decide({ ...freshNode(), P: 0.1, E: 0, throttled: true }, obs(), base);
  assert.equal(lifted.verdict, 'steady');
  assert.equal(lifted.lift, true);
  const kept = decide({ ...freshNode(), P: 0.1, E: 0, throttled: false }, obs(), base);
  assert.equal(kept.lift, false);
  const viaBES = decide(freshNode(), obs({ window: quiet }), base, () => ({ E: 0.7, parts: { bes: 0.7 } }));
  assert.equal(viaBES.E, 0.7);
  assert.deepEqual(viaBES.parts, { bes: 0.7 });
  assert.deepEqual(viaBES.reasons, ['drift', 'rate']);
  const broken = decide(freshNode(), obs(), base, () => { throw new Error('x'); });
  assert.equal(broken.E, 0.5);
  assert.equal(broken.verdict, 'watch');
  assert.equal(broken.parts, null);
  const nan = decide(freshNode(), obs(), base, () => ({ E: NaN }));
  assert.equal(nan.E, 0.5);
  assert.equal(decide(freshNode(), obs(), base, () => ({ E: 3 })).E, 1);
  assert.equal(decide(freshNode(), obs(), base, () => ({ E: -3 })).E, 0);
  assert.equal(decide(freshNode(), obs(), base, () => null).E, 0.5);
});

test('decide: rate alone raises watch; a field at 0.5 is watch', () => {
  const r = decide({ ...freshNode(), P: 0, E: 0 }, obs(), base, () => ({ E: 0.55 }));
  assert.deepEqual([r.verdict, r.reasons], ['watch', ['drift', 'rate']]);
  const s = decide({ ...freshNode(), P: 0, E: 0.1 }, obs(), base, () => ({ E: 0.5 }));
  assert.deepEqual([s.verdict, s.reasons], ['watch', ['drift']]);
  const q = decide({ ...freshNode(), P: 0, E: 0 }, obs(), base, () => ({ E: 0.49 }));
  assert.deepEqual([q.verdict, q.reasons], ['steady', []]);
  const p = decide({ ...freshNode(), P: 0.12, E: 0.49 }, obs(), base, () => ({ E: 0.49 }));
  assert.deepEqual([p.verdict, p.reasons], ['watch', []]);
  close(p.P, 0.305);
});

test('decide: every bar is inclusive — P 0.3 watches, 0.6 throttles, 0.85 pauses; a field of 0.5 and a rise of 0.5 count', () => {
  const at = (P, E, Enew) => decide({ ...freshNode(), P, E }, obs(), base, () => ({ E: Enew }));
  assert.deepEqual([at(0.6, 0, 0).verdict, at(0.6, 0, 0).P], ['watch', 0.3]);
  assert.equal(at(0.58, 0, 0).verdict, 'steady');
  assert.deepEqual([at(0.2, 1, 1).verdict, at(0.2, 1, 1).P], ['throttle', 0.6]);
  assert.equal(at(0.18, 1, 1).verdict, 'watch');
  assert.deepEqual([at(0.7, 1, 1).verdict, at(0.7, 1, 1).P], ['pause', 0.85]);
  assert.equal(at(0.68, 1, 1).verdict, 'throttle');
  assert.deepEqual(at(0, 0, 0.5).reasons, ['drift', 'rate']);
  assert.deepEqual(at(0, 0.01, 0.5).reasons, ['drift']);
  assert.equal(at(0, 0.01, 0.5).verdict, 'watch');   // P 0.25: the field alone raises watch
  assert.equal(at(0, 0.01, 0.49).verdict, 'steady');
  assert.equal(at(0, 0, 0.5).g, 0.5);
  const still = decide({ ...freshNode(), P: 0.7, E: 1, throttled: true }, obs(), base, () => ({ E: 1 }));
  assert.deepEqual([still.verdict, still.lift], ['pause', false]);
  const kept = decide({ ...freshNode(), P: 0.5, E: 1, throttled: true }, obs(), base, () => ({ E: 1 }));
  assert.deepEqual([kept.verdict, kept.lift, kept.renew], ['throttle', false, false]);
  const fresh = decide(freshNode(), obs(), base, () => ({ E: 0 }));
  assert.equal(fresh.next.pauses, 0);
  assert.equal(fresh.next.coolUntil, 0);
});

test('decide: a function carrying memory or an observation is neither', () => {
  const f = Object.assign(() => {}, { P: 0.9, E: 1, paused: true, coolUntil: Infinity });
  assert.equal(decide(f, obs(), base).verdict, 'steady');
  const o = Object.assign(() => {}, obs({ healthOk: true }));
  assert.equal(decide(freshNode(), o, base).verdict, 'pause');   // a function is not an observation: its health is unread
});

test('calibrate: a window of exactly N_MIN actions counts', () => {
  const five = [];
  for (let h = 0; h < 8; h++) for (let k = 0; k < 5; k++) five.push({ t: h * HOUR + (k * 11 + 3) * MINUTE, area: ['src', 'test', 'data'][(h + k) % 3], files: 1 + ((h + k) % 4) });
  assert.equal(calibrate([{ name: 'f', fit: five }]).nodes.f.pooled, false);
  assert.equal(calibrate([{ name: 'f', fit: five.filter((_, i) => i % 5 !== 4) }]).nodes.f.pooled, true);
});

// ── organ 1b (sealed ee43f68): the second rule set ──
test('RULES: v1 is organ 1 (the default), v1b organ 1b; frozen', () => {
  assert.deepEqual(RULES.v1, { now: false, size: false });
  assert.deepEqual(RULES.v1b, { now: true, size: true });
  assert.ok(Object.isFrozen(RULES) && Object.isFrozen(RULES.v1) && Object.isFrozen(RULES.v1b));
});

test('budget under v1b: the 24-hour count enters only at a visit that saw an attempt', () => {
  assert.deepEqual(budget(0, 60, base, RULES.v1b), { r: 0, E: 0 });
  assert.deepEqual(budget(0, 60, base, RULES.v1), { r: 2, E: 1 });
  assert.deepEqual(budget(0, 60, base), { r: 2, E: 1 });
  assert.deepEqual(budget(0, 60, base, 'v1b'), { r: 2, E: 1 });   // not a rule set: organ 1's
  assert.deepEqual(budget(0, 60, base, { now: true }), { r: 0, E: 0 });
  assert.deepEqual(budget(1, 60, base, RULES.v1b), { r: 2, E: 1 });
  assert.deepEqual(budget(-1, 60, base, RULES.v1b), { r: 0, E: 0 });
  assert.deepEqual(budget(NaN, 60, base, RULES.v1b), { r: 0, E: 0 });
  assert.deepEqual(budget(15, 0, base, RULES.v1b), { r: 1.5, E: 0.8 });
});

test('decide under v1b: a mild overrun twice throttles, a large one twice pauses; the throttle bar is inclusive', () => {
  const b = { ...base, band: { area: null, files: null, gap: null }, cvFloor: 0 };
  const one = decide(freshNode(), obs({ window: quiet, sinceVisit: 11, lastDay: 11 }), b, undefined, RULES.v1b);
  assert.equal(one.verdict, 'throttle');
  const two = decide(one.next, obs({ window: quiet, sinceVisit: 11, lastDay: 22 }), b, undefined, RULES.v1b);
  close(two.P, 0.48, 1e-12);
  assert.equal(two.verdict, 'throttle');   // organ 1 paused here
  assert.deepEqual(two.reasons, ['budget']);
  assert.equal(decide(one.next, obs({ window: quiet, sinceVisit: 11, lastDay: 22 }), b).verdict, 'pause');
  const big1 = decide(freshNode(), obs({ window: quiet, sinceVisit: 20, lastDay: 20 }), b, undefined, RULES.v1b);
  assert.equal(big1.verdict, 'throttle');
  const big2 = decide(big1.next, obs({ window: quiet, sinceVisit: 20, lastDay: 40 }), b, undefined, RULES.v1b);
  assert.equal(big2.P, 0.75);
  assert.equal(big2.verdict, 'pause');
  assert.deepEqual(big2.reasons, ['budget']);
  const atBar = decide({ ...freshNode(), P: 0.2, E: 1, over: true }, obs({ window: quiet, sinceVisit: 20, lastDay: 20 }), b, undefined, RULES.v1b);
  assert.equal(atBar.P, 0.6);
  assert.equal(atBar.verdict, 'pause');
  const under = decide({ ...freshNode(), P: 0.19, E: 1, over: true }, obs({ window: quiet, sinceVisit: 20, lastDay: 20 }), b, undefined, RULES.v1b);
  assert.equal(under.verdict, 'throttle');
  const once = decide({ ...freshNode(), P: 0.6, E: 1, over: false }, obs({ window: quiet, sinceVisit: 20, lastDay: 20 }), b, undefined, RULES.v1b);
  close(once.P, 0.8, 1e-12);
  assert.equal(once.verdict, 'throttle');   // over once, P under the pause bar
  assert.equal(decide({ ...freshNode(), P: 0.6, E: 1, over: true }, obs({ window: quiet, sinceVisit: 20, lastDay: 20 }), b, undefined, RULES.v1b).verdict, 'pause');
  const quietVisit = decide({ ...freshNode(), P: 0.5, E: 0.7, over: true }, obs({ window: [], sinceVisit: 0, lastDay: 99 }), b, undefined, RULES.v1b);
  assert.equal(quietVisit.r, 0);
  assert.equal(quietVisit.verdict, 'steady');   // P 0.25, E 0: a burst that ended
  assert.equal(quietVisit.next.over, false);
  assert.equal(decide({ ...freshNode(), P: 0.5, E: 0.7, over: true }, obs({ window: [], sinceVisit: 0, lastDay: 99 }), b).verdict, 'pause');   // organ 1: still over, twice
});
