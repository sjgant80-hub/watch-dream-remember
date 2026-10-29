// ════════════════════════════════════════════════════════════════
// costcase.mjs — the staff time the three upgrades take off people, priced at sourced UK pay, and what they cost to run.
// Pure, total, deterministic, gated. Every pound comes from the vendored basis (vendor/sovereign-enterprise/data/basis.json,
// each figure with its source) and the buyer's own inputs; nothing is typed onto the page.
//
//   loadedHourly(basis, hoursPerWeek)  a senior IT person's hourly cost to the employer: ONS ASHE 2025 median salary for
//                                      IT managers (SOC 2132) + employer NI above its threshold + auto-enrolment pension on
//                                      qualifying earnings, over the hours they work in a year
//   costCase(basis, inputs)            → { ok, hourly, lines: [{ key, what, hoursPerYear, perYear }], perYear, running }
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

export const DEFAULTS = Object.freeze({ hoursPerWeek: 37.5, watchHoursNow: 5, watchHoursAfter: 0.5, hoursPerIdea: 6, ideasPerMonth: 4, handoverHours: 8, mindsPerYear: 12 });

/**
 * inputs = { hoursPerWeek, watchHoursNow, watchHoursAfter, hoursPerIdea, ideasPerMonth, handoverHours, mindsPerYear }
 * (missing ones take DEFAULTS; ideasPerMonth is meant to be read off the daydream receipt by the page).
 */
export function costCase(basis, inputs) {
  try {
    const x = { ...DEFAULTS, ...(inputs && typeof inputs === 'object' ? inputs : {}) };
    for (const k of Object.keys(DEFAULTS)) if (!(Number.isFinite(x[k]) && x[k] >= 0)) return { ok: false, why: `${k}: a number, zero or more` };
    if (x.watchHoursAfter > x.watchHoursNow) return { ok: false, why: 'watchHoursAfter: no more than watchHoursNow' };
    const hourly = loadedHourly(basis, x.hoursPerWeek);
    if (hourly === null) return { ok: false, why: 'the basis or the working week is not readable' };
    const lines = [
      { key: 'watch', what: 'checking what autonomous agents did — the regulator watches and pauses; a person reads its alerts', hoursPerYear: (x.watchHoursNow - x.watchHoursAfter) * 52 },
      { key: 'ideas', what: 'finding model improvements — the daydream proposes, the nightly gate proves, a person reviews', hoursPerYear: x.hoursPerIdea * x.ideasPerMonth * 12 },
      { key: 'handover', what: 'teaching a new agent what its predecessors learned — it inherits their verified lessons', hoursPerYear: x.handoverHours * x.mindsPerYear },
    ].map((l) => ({ ...l, hoursPerYear: r2(l.hoursPerYear), perYear: r2(l.hoursPerYear * hourly) }));
    const watts = val(basis, 'laptopExtraWatts'), pence = val(basis, 'electricityPencePerKwh'), hours = val(basis, 'hoursPerYear');
    const running = watts === null || pence === null || hours === null ? null : r2((watts / 1000) * hours * pence / 100);
    return { ok: true, hourly, lines, perYear: r2(lines.reduce((s, l) => s + l.perYear, 0)), running };
  } catch {
    return { ok: false, why: 'unreadable' };
  }
}
