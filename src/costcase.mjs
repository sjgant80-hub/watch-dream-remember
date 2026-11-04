// ════════════════════════════════════════════════════════════════
// costcase.mjs — the staff time the regulator and the daydream tier take off people, priced at sourced UK pay; what the same
// work costs a year today, with rented AI assistant seats, and owned; and where every figure came from.
// Pure, total, deterministic, gated. Every pound comes from the vendored basis (vendor/sovereign-enterprise/data/basis.json,
// each figure with its source) and the reader's own inputs; nothing is typed onto the page, and no price of ours appears.
//
//   loadedHourly(basis, hoursPerWeek)  a senior IT person's hourly cost to the employer: ONS ASHE 2025 median salary for
//                                      IT managers (SOC 2132) + employer NI above its threshold + auto-enrolment pension on
//                                      qualifying earnings, over the hours they work in a year
//   costCase(basis, inputs)            → { ok, hourly, lines, perYear, running, seats, hours: { now, after },
//                                          routes: { today, rentSeats, own }, over: { today, rentSeats, own }, years, savingOver }
//   sourcesOf(basis)                   → [{ key, value, unit, what, source }] for every basis figure the case reads
//   over(perYear, cpi, years)          a yearly cost carried over `years`, rising by CPI each year after the first
//
// There is no line for inheritance. The receipts measured it four ways (organ 3's M2, then organs 3b, 3c and 3d) and it does
// not reliably help a child, so no saving is claimed for it. A rented assistant seat helps a person work; it does not visit
// agents hourly or test model changes on held-out data, so the rentSeats route takes none of these hours off.
// ════════════════════════════════════════════════════════════════

const val = (b, k) => (b && b[k] && Number.isFinite(b[k].value) ? b[k].value : null);
const r2 = (x) => Math.round(x * 100) / 100;

export function loadedHourly(basis, hoursPerWeek) {
  const pay = val(basis, 'seniorSalary'), ni = val(basis, 'employerNiRate'), th = val(basis, 'employerNiThreshold');
  const pr = val(basis, 'pensionEmployerRate'), lo = val(basis, 'pensionQeLower'), hi = val(basis, 'pensionQeUpper');
  if ([pay, ni, th, pr, lo, hi].some((v) => v === null) || !(hoursPerWeek > 0 && hoursPerWeek <= 80)) return null;
  const year = pay + ni * Math.max(0, pay - th) + pr * Math.max(0, Math.min(pay, hi) - lo);
  return r2(year / (hoursPerWeek * 52));
}

/** the reader's inputs, each one theirs to change; these are only where the boxes start */
export const DEFAULTS = Object.freeze({ hoursPerWeek: 37.5, watchHoursNow: 5, watchHoursAfter: 0.5, hoursPerIdea: 6, reviewHoursPerIdea: 1, ideasPerMonth: 4, people: 1, years: 3 });

/** every basis figure the case reads, in the order the page cites them */
export const BASIS_KEYS = Object.freeze(['seniorSalary', 'employerNiRate', 'employerNiThreshold', 'pensionEmployerRate', 'pensionQeLower', 'pensionQeUpper', 'cpi', 'seat.copilot', 'laptopExtraWatts', 'electricityPencePerKwh', 'hoursPerYear']);

/** where each figure came from, for the page to list beside the numbers; [] when the basis cannot be read */
export function sourcesOf(basis) {
  try {
    return BASIS_KEYS.map((k) => ({ key: k, value: basis[k].value, unit: basis[k].unit || null, what: basis[k].what || basis[k].product, source: basis[k].source || null }));
  } catch {
    return [];
  }
}

/** a yearly cost carried over `years`, rising by CPI each year after the first */
export function over(perYear, cpi, years) {
  let total = 0, factor = 1;
  for (let y = 0; y < years; y++) { total += perYear * factor; factor *= 1 + cpi; }
  return r2(total);
}

/**
 * inputs = { hoursPerWeek, watchHoursNow, watchHoursAfter, hoursPerIdea, reviewHoursPerIdea, ideasPerMonth, people, years }
 * (missing ones take DEFAULTS). Garbage in gives { ok: false, why }, never a throw.
 */
export function costCase(basis, inputs) {
  try {
    const x = { ...DEFAULTS, ...(inputs && typeof inputs === 'object' ? inputs : {}) };
    for (const k of Object.keys(DEFAULTS)) if (!(Number.isFinite(x[k]) && x[k] >= 0)) return { ok: false, why: `${k}: a number, zero or more` };
    if (x.watchHoursAfter > x.watchHoursNow) return { ok: false, why: 'watchHoursAfter: no more than watchHoursNow' };
    if (x.reviewHoursPerIdea > x.hoursPerIdea) return { ok: false, why: 'reviewHoursPerIdea: no more than hoursPerIdea' };
    if (!Number.isInteger(x.people)) return { ok: false, why: 'people: a whole number' };
    if (!Number.isInteger(x.years) || x.years < 1 || x.years > 10) return { ok: false, why: 'years: a whole number from 1 to 10' };
    const hourly = loadedHourly(basis, x.hoursPerWeek);
    const seat = val(basis, 'seat.copilot'), cpi = val(basis, 'cpi'), watts = val(basis, 'laptopExtraWatts'), pence = val(basis, 'electricityPencePerKwh'), hours = val(basis, 'hoursPerYear');
    if (hourly === null || [seat, cpi, watts, pence, hours].some((v) => v === null)) return { ok: false, why: 'the basis or the working week is not readable' };
    const lines = [
      { key: 'watch', what: 'checking what autonomous agents did — the regulator watches and pauses; a person reads its alerts', hoursPerYear: (x.watchHoursNow - x.watchHoursAfter) * 52 },
      { key: 'ideas', what: 'finding model improvements — the daydream proposes, the nightly gate proves; a person still reviews each one', hoursPerYear: (x.hoursPerIdea - x.reviewHoursPerIdea) * x.ideasPerMonth * 12 },
    ].map((l) => ({ ...l, hoursPerYear: r2(l.hoursPerYear), perYear: r2(l.hoursPerYear * hourly) }));
    const running = r2((watts / 1000) * hours * pence / 100);
    const now = r2(x.watchHoursNow * 52 + x.hoursPerIdea * x.ideasPerMonth * 12);
    const after = r2(x.watchHoursAfter * 52 + x.reviewHoursPerIdea * x.ideasPerMonth * 12);
    const today = r2(now * hourly), seats = r2(x.people * 12 * seat);
    const routes = { today, rentSeats: r2(today + seats), own: r2(after * hourly + running) };
    const total = { today: over(routes.today, cpi, x.years), rentSeats: over(routes.rentSeats, cpi, x.years), own: over(routes.own, cpi, x.years) };
    return { ok: true, hourly, lines, perYear: r2(lines.reduce((s, l) => s + l.perYear, 0)), running, seats, hours: { now, after }, routes, over: total, years: x.years, savingOver: r2(total.today - total.own) };
  } catch {
    return { ok: false, why: 'unreadable' };
  }
}
