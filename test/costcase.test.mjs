import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadedHourly, costCase, sourcesOf, over, DEFAULTS, BASIS_KEYS } from '../src/costcase.mjs';

const basis = JSON.parse(readFileSync(new URL('../vendor/sovereign-enterprise/data/basis.json', import.meta.url), 'utf8'));
const b = {
  seniorSalary: { value: 52000, unit: 'GBP per year', what: 'pay', source: 'https://pay.example' }, employerNiRate: { value: 0.15, what: 'ni', source: 'https://ni.example' },
  employerNiThreshold: { value: 5000 }, pensionEmployerRate: { value: 0.03 }, pensionQeLower: { value: 6000 }, pensionQeUpper: { value: 50000 },
  laptopExtraWatts: { value: 10 }, electricityPencePerKwh: { value: 25 }, hoursPerYear: { value: 8760, what: '24 x 365' },
  'seat.copilot': { value: 20, unit: 'GBP per user per month', product: 'an assistant', source: 'https://seat.example' }, cpi: { value: 0.1 },
  hub: { product: 'a box', priceIncVat: 1000, priceSource: 'https://box.example', watts: 100, wattsSource: 'https://watts.example' },
};
const IN = { hoursPerWeek: 40, watchHoursNow: 5, watchHoursAfter: 1, hoursPerIdea: 3, reviewHoursPerIdea: 1, ideasPerMonth: 3, people: 2, years: 2, setupHours: 0, machines: 0 };

test('loadedHourly: salary + employer NI above the threshold + pension on qualifying earnings, over the year’s hours', () => {
  // 52000 + 0.15·47000 + 0.03·(50000 − 6000) = 52000 + 7050 + 1320 = 60370; / (40·52 = 2080) = 29.0240…
  assert.equal(loadedHourly(b, 40), 29.02);
  assert.equal(loadedHourly({ ...b, seniorSalary: { value: 4000 } }, 40), Math.round(((4000 + 0 + 0) / 2080) * 100) / 100);
  assert.equal(loadedHourly({ ...b, seniorSalary: { value: 60000 } }, 40), Math.round(((60000 + 0.15 * 55000 + 0.03 * 44000) / 2080) * 100) / 100);
  assert.equal(loadedHourly(b, 0), null);
  assert.equal(loadedHourly(b, 81), null);
  assert.equal(loadedHourly(b, 80), Math.round((60370 / 4160) * 100) / 100);
  assert.equal(loadedHourly({ ...b, seniorSalary: { value: 'x' } }, 40), null);
  assert.equal(loadedHourly(null, 40), null);
  for (const k of ['employerNiRate', 'employerNiThreshold', 'pensionEmployerRate', 'pensionQeLower', 'pensionQeUpper']) assert.equal(loadedHourly({ ...b, [k]: undefined }, 40), null, k);
  assert.ok(loadedHourly(basis, 37.5) > 30);
});

test('over: a yearly cost carried over the years, rising by CPI each year after the first', () => {
  assert.equal(over(100, 0.1, 1), 100);
  assert.equal(over(100, 0.1, 2), 210);
  assert.equal(over(100, 0.1, 3), 331);
  assert.equal(over(100, 0, 3), 300);
  assert.equal(over(100, 0.1, 0), 0);
});

test('costCase: two lines of hours taken off people, priced; today, rented seats and owned, a year and over the years', () => {
  const c = costCase(b, IN);
  assert.equal(c.ok, true);
  assert.equal(c.hourly, 29.02);
  // watch (5 − 1)·52 = 208 h; ideas (3 − 1)·3·12 = 72 h (the review hour stays with a person)
  assert.deepEqual(c.lines.map((l) => [l.key, l.hoursPerYear, l.perYear]), [['watch', 208, 6036.16], ['ideas', 72, 2089.44]]);
  assert.equal(c.perYear, 8125.6);
  assert.equal(c.running, 21.9);                       // 10 W × 8760 h = 87.6 kWh × 25p
  assert.deepEqual(c.hours, { now: 368, after: 88 });   // now 5·52 + 3·3·12; after 1·52 + 1·3·12
  assert.equal(c.seats, 480);                           // 2 people × 12 months × 20
  assert.deepEqual(c.routes, { today: 10679.36, rentSeats: 11159.36, own: 2575.66 });
  assert.equal(Math.round((c.routes.today - c.routes.own) * 100) / 100, Math.round((c.perYear - c.running) * 100) / 100);
  assert.deepEqual(c.over, { today: 22426.66, rentSeats: 23434.66, own: 5408.89 });
  assert.equal(c.years, 2);
  assert.equal(c.savingOver, 17017.77);
  assert.equal(c.oneOff, 0);
  assert.equal(c.paybackMonths, 0);   // nothing to pay back
  assert.ok(c.lines.every((l) => typeof l.what === 'string' && l.what.length > 20));
  const d = costCase(basis, {});
  assert.equal(d.ok, true);
  assert.equal(d.lines[0].hoursPerYear, (DEFAULTS.watchHoursNow - DEFAULTS.watchHoursAfter) * 52);
  assert.equal(d.years, DEFAULTS.years);
  assert.equal(costCase(b, null).ok, true);
  assert.equal(costCase(b, { ...IN, years: 1 }).over.today, c.routes.today);
  assert.equal(costCase(b, { ...IN, years: 10 }).ok, true);
  assert.equal(costCase(b, { ...IN, people: 0 }).seats, 0);
  assert.equal(costCase(b, { ...IN, watchHoursAfter: 0 }).lines[0].hoursPerYear, 260);
});

test('costCase: a function carrying inputs is not inputs (the defaults stand)', () => {
  const f = Object.assign(() => {}, { watchHoursNow: 50 });
  assert.deepEqual(costCase(b, f), costCase(b, {}));
  assert.notDeepEqual(costCase(b, { watchHoursNow: 50 }), costCase(b, {}));
});

test('costCase refuses what it cannot price', () => {
  assert.deepEqual(costCase(b, { watchHoursNow: -1 }), { ok: false, why: 'watchHoursNow: a number, zero or more' });
  assert.deepEqual(costCase(b, { ideasPerMonth: 'x' }), { ok: false, why: 'ideasPerMonth: a number, zero or more' });
  assert.deepEqual(costCase(b, { watchHoursNow: 1, watchHoursAfter: 2 }), { ok: false, why: 'watchHoursAfter: no more than watchHoursNow' });
  assert.equal(costCase(b, { watchHoursNow: 2, watchHoursAfter: 2 }).ok, true);
  assert.deepEqual(costCase(b, { hoursPerIdea: 1, reviewHoursPerIdea: 2 }), { ok: false, why: 'reviewHoursPerIdea: no more than hoursPerIdea' });
  assert.equal(costCase(b, { hoursPerIdea: 2, reviewHoursPerIdea: 2 }).lines[1].hoursPerYear, 0);
  assert.deepEqual(costCase(b, { people: 1.5 }), { ok: false, why: 'people: a whole number' });
  for (const years of [0, 1.5, 11]) assert.deepEqual(costCase(b, { years }), { ok: false, why: 'years: a whole number from 1 to 10' }, String(years));
  assert.deepEqual(costCase(null, {}), { ok: false, why: 'the basis or the working week is not readable' });
  assert.deepEqual(costCase(b, { hoursPerWeek: 0 }), { ok: false, why: 'the basis or the working week is not readable' });
  assert.deepEqual(costCase(b, { machines: 1.5 }), { ok: false, why: 'machines: a whole number' });
  assert.deepEqual(costCase(b, { machines: -1 }), { ok: false, why: 'machines: a number, zero or more' });
  assert.deepEqual(costCase(b, { setupHours: -1 }), { ok: false, why: 'setupHours: a number, zero or more' });
  assert.deepEqual(costCase({ ...b, hub: { ...b.hub, priceIncVat: 'x' } }, {}), { ok: false, why: 'the basis or the working week is not readable' });
  assert.deepEqual(costCase({ ...b, hub: { ...b.hub, watts: null } }, {}), { ok: false, why: 'the basis or the working week is not readable' });
  for (const k of ['seniorSalary', 'seat.copilot', 'cpi', 'laptopExtraWatts', 'electricityPencePerKwh', 'hoursPerYear', 'hub']) assert.deepEqual(costCase({ ...b, [k]: undefined }, {}), { ok: false, why: 'the basis or the working week is not readable' }, k);
  const evil = {};
  Object.defineProperty(evil, 'hoursPerWeek', { enumerable: true, get() { throw new Error('x'); } });
  assert.deepEqual(costCase(b, evil), { ok: false, why: 'unreadable' });
  assert.deepEqual(Object.keys(DEFAULTS), ['hoursPerWeek', 'watchHoursNow', 'watchHoursAfter', 'hoursPerIdea', 'reviewHoursPerIdea', 'ideasPerMonth', 'people', 'years', 'setupHours', 'machines']);
});

test('costCase: the one-off costs of owning it, set-up hours and machines, in the first year; the payback', () => {
  const c = costCase(b, IN);
  const s = costCase(b, { ...IN, setupHours: 10 });
  assert.equal(s.oneOff, 290.2);                         // 10 h × 29.02
  assert.equal(s.running, c.running);
  assert.deepEqual(s.routes, c.routes);                  // a one-off is not a yearly cost
  assert.equal(s.over.own, 5699.09);                     // 5408.89 + 290.2, in the first year, no CPI
  assert.deepEqual([s.over.today, s.over.rentSeats], [c.over.today, c.over.rentSeats]);
  assert.equal(s.savingOver, 16727.57);
  assert.equal(s.paybackMonths, 0.4);                    // 12 × 290.2 / (10679.36 − 2575.66)
  const m = costCase(b, { ...IN, machines: 2 });
  assert.equal(m.oneOff, 2000);                          // 2 × 1000
  assert.equal(m.running, 438);                          // 2 × 100 W (they replace the laptop's 10 W) × 8760 h × 25p
  assert.equal(m.routes.own, 2991.76);                   // 88 h × 29.02 + 438
  assert.equal(m.paybackMonths, 3.1);                    // 12 × 2000 / (10679.36 − 2991.76)
  assert.equal(costCase(b, { ...IN, years: 1, setupHours: 1, machines: 1 }).over.own, Math.round((costCase(b, { ...IN, machines: 1 }).routes.own + 29.02 + 1000) * 100) / 100);
  assert.equal(costCase(b, { ...IN, watchHoursNow: 1, hoursPerIdea: 1 }).paybackMonths, null);   // no saving: nothing pays back
  // a saving of exactly zero pays nothing back: 26 an hour, 2 h a week now and 1 after, and 1,352 a year of electricity
  const z = { ...b, seniorSalary: { value: 54080 }, employerNiRate: { value: 0 }, employerNiThreshold: { value: 0 }, pensionEmployerRate: { value: 0 }, pensionQeLower: { value: 0 }, pensionQeUpper: { value: 0 }, laptopExtraWatts: { value: 1000 }, electricityPencePerKwh: { value: 100 }, hoursPerYear: { value: 1352 } };
  const zero = costCase(z, { hoursPerWeek: 40, watchHoursNow: 2, watchHoursAfter: 1, hoursPerIdea: 0, reviewHoursPerIdea: 0, ideasPerMonth: 0, setupHours: 1, machines: 0 });
  assert.deepEqual([zero.hourly, zero.routes.today, zero.routes.own, zero.paybackMonths], [26, 2704, 2704, null]);
  const d = costCase(basis, {});
  assert.equal(d.oneOff, Math.round(DEFAULTS.setupHours * d.hourly * 100) / 100);
  assert.ok(d.paybackMonths > 0 && d.paybackMonths < 12);
});

test('sourcesOf: every figure the case reads, with its unit, what it is and where it came from', () => {
  const s = sourcesOf(b);
  assert.deepEqual(s.map((x) => x.key), [...BASIS_KEYS.filter((k) => k !== 'hub'), 'hub', 'hub.watts']);
  assert.deepEqual(s.slice(-2), [
    { key: 'hub', value: 1000, unit: 'GBP including VAT', what: 'a box', source: 'https://box.example' },
    { key: 'hub.watts', value: 100, unit: 'watts at most', what: 'a box', source: 'https://watts.example' },
  ]);
  assert.deepEqual(sourcesOf({ ...b, hub: undefined }), []);
  assert.deepEqual(s[0], { key: 'seniorSalary', value: 52000, unit: 'GBP per year', what: 'pay', source: 'https://pay.example' });
  assert.deepEqual(s[1], { key: 'employerNiRate', value: 0.15, unit: null, what: 'ni', source: 'https://ni.example' });
  assert.deepEqual(s.find((x) => x.key === 'seat.copilot'), { key: 'seat.copilot', value: 20, unit: 'GBP per user per month', what: 'an assistant', source: 'https://seat.example' });
  assert.equal(s.find((x) => x.key === 'hoursPerYear').source, null);
  assert.deepEqual(sourcesOf({ ...b, cpi: undefined }), []);
  assert.deepEqual(sourcesOf(null), []);
  const real = sourcesOf(basis);
  assert.equal(real.length, BASIS_KEYS.length + 1);
  for (const x of real) {
    assert.ok(Number.isFinite(x.value), x.key);
    assert.ok(typeof x.what === 'string' && x.what.length > 5, x.key);
    if (x.key !== 'hoursPerYear') assert.match(x.source, /^https:\/\//, x.key);
  }
});
