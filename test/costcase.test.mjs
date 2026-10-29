import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadedHourly, costCase, DEFAULTS } from '../src/costcase.mjs';

const basis = JSON.parse(readFileSync(new URL('../vendor/sovereign-enterprise/data/basis.json', import.meta.url), 'utf8'));
const b = { seniorSalary: { value: 52000 }, employerNiRate: { value: 0.15 }, employerNiThreshold: { value: 5000 }, pensionEmployerRate: { value: 0.03 }, pensionQeLower: { value: 6000 }, pensionQeUpper: { value: 50000 }, laptopExtraWatts: { value: 10 }, electricityPencePerKwh: { value: 25 }, hoursPerYear: { value: 8760 } };

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

test('costCase: three lines of hours taken off people, priced; running cost from sourced watts and pence', () => {
  const c = costCase(b, { hoursPerWeek: 40, watchHoursNow: 5, watchHoursAfter: 1, hoursPerIdea: 2, ideasPerMonth: 3, handoverHours: 10, mindsPerYear: 4 });
  assert.equal(c.ok, true);
  assert.equal(c.hourly, 29.02);
  assert.deepEqual(c.lines.map((l) => [l.key, l.hoursPerYear, l.perYear]), [['watch', 208, 6036.16], ['ideas', 72, 2089.44], ['handover', 40, 1160.8]]);
  assert.equal(c.perYear, 9286.4);
  assert.equal(c.running, 21.9);   // 10 W × 8760 h = 87.6 kWh × 25p
  assert.ok(c.lines.every((l) => typeof l.what === 'string' && l.what.length > 20));
  const d = costCase(basis, {});
  assert.equal(d.ok, true);
  assert.equal(d.lines[0].hoursPerYear, (DEFAULTS.watchHoursNow - DEFAULTS.watchHoursAfter) * 52);
  assert.equal(costCase(b, null).ok, true);
  assert.equal(costCase({ ...b, laptopExtraWatts: undefined }, {}).running, null);
  assert.equal(costCase({ ...b, electricityPencePerKwh: undefined }, {}).running, null);
  assert.equal(costCase({ ...b, hoursPerYear: undefined }, {}).running, null);
});

test('costCase refuses what it cannot price', () => {
  assert.deepEqual(costCase(b, { watchHoursNow: -1 }), { ok: false, why: 'watchHoursNow: a number, zero or more' });
  assert.deepEqual(costCase(b, { ideasPerMonth: 'x' }), { ok: false, why: 'ideasPerMonth: a number, zero or more' });
  assert.deepEqual(costCase(b, { watchHoursNow: 1, watchHoursAfter: 2 }), { ok: false, why: 'watchHoursAfter: no more than watchHoursNow' });
  assert.equal(costCase(b, { watchHoursNow: 2, watchHoursAfter: 2 }).ok, true);
  assert.deepEqual(costCase(null, {}), { ok: false, why: 'the basis or the working week is not readable' });
  assert.deepEqual(costCase(b, { hoursPerWeek: 0 }), { ok: false, why: 'the basis or the working week is not readable' });
  const evil = {};
  Object.defineProperty(evil, 'hoursPerWeek', { enumerable: true, get() { throw new Error('x'); } });
  assert.deepEqual(costCase(b, evil), { ok: false, why: 'unreadable' });
  assert.deepEqual(Object.keys(DEFAULTS), ['hoursPerWeek', 'watchHoursNow', 'watchHoursAfter', 'hoursPerIdea', 'ideasPerMonth', 'handoverHours', 'mindsPerYear']);
});
