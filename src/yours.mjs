// ════════════════════════════════════════════════════════════════
// yours.mjs — the regulator on YOUR build's own history. Pure, total, deterministic, gated.
//
// Give it the text of `git log --reverse --format=@%ct --name-only` from any git repository: one your AI agents commit to,
// or any other. src/streams.mjs reads it exactly as the ten measured builds were read: each commit is one action
// { t, area, files } and nothing else is kept (no message, no author, no content). The first 60% of the history teaches the
// regulator this build's own normal. It is calibrated together with the ten measured builds' own first 60%, so a build with
// too little busy history of its own is judged by the band pooled over all of them, as in the measurement. The remaining
// 40% is replayed through src/mesh.mjs under the fix (organ 1b's rules, the default) or the rules as first sealed (organ 1):
// the same code the receipts measured. Nothing is injected: this is the build's real history, and nothing here can act.
//
//   peersOf(raw)            data/nodes.json → the measured builds' first 60%, at the visit minutes the measurement gave them
//   episodesOf(records)     runs of consecutive visits at throttle or pause: start, end, visits, the worst verdict, the reasons
//   dailyOf(records)        the worst verdict of each UTC day visited, oldest first
//   watchYours(text, opts)  → { ok: false, why } or { ok: true, … };  opts = { peers, highStakes, rules: 'v1' | 'v1b', max }
//                           max (default MAX_ACTIONS) keeps only the most recent commits, so a page stays quick on a big history
//   logOf(actions)          actions → a log in that same form, one stand-in path per file in the action's area, so a measured
//                           build's history can be tried here too (parseLog(logOf(a)) gives a back exactly)
// ════════════════════════════════════════════════════════════════
import { parseLog, splitFit, AREAS } from './streams.mjs';
import { calibrate, RULES, HOUR, DAY, MINUTE, LADDER } from './regulator.mjs';
import { replay } from './mesh.mjs';

export const NAME = 'your build', SHARE = 0.6, MIN_ACTIONS = 20, MAX_ACTIONS = 20000;

/** One stand-in path per area, each read back by src/streams.mjs areaOf as that area; # is the file's number. */
export const STAND_IN = Object.freeze({ src: 'f#.mjs', test: 'test/f#.mjs', tools: 'tools/f#.mjs', data: 'data/f#.json', page: 'page/f#.html', docs: 'f#.md', ci: '.github/f#.yml', vendor: 'vendor/f#.mjs', other: 'f#.bin' });

export function logOf(actions) {
  const NL = String.fromCharCode(10);
  const lines = (a) => Array.from({ length: a.files }, (_, j) => STAND_IN[AREAS.includes(a.area) ? a.area : 'other'].replace('#', j));
  return (Array.isArray(actions) ? actions : []).map((a) => [`@${Math.round(a.t / 1000)}`, ...lines(a)].join(NL)).join(NL) + NL;
}

/** The measured builds as peers: each one's FIT share of its history, at the visit minute the measurement gave it. */
export function peersOf(raw) {
  const list = raw && Array.isArray(raw.nodes) ? raw.nodes : [];
  return list.flatMap((n, i) => (n && Array.isArray(n.actions)
    ? [{ name: String(n.name), offset: i * 6 * MINUTE, fit: splitFit(n.actions.map(([t, area, files]) => ({ t, area, files })), SHARE).fit }]
    : []));
}

/** Runs of consecutive visits at throttle or pause. */
export function episodesOf(records) {
  const out = [];
  let cur = null;
  for (const r of Array.isArray(records) ? records : []) {
    if (!(r.verdict === 'throttle' || r.verdict === 'pause')) { cur = null; continue; }
    if (!cur) { cur = { from: r.at, to: r.at, visits: 0, worst: r.verdict, reasons: [] }; out.push(cur); }
    cur.to = r.at;
    cur.visits++;
    if (r.verdict === 'pause') cur.worst = 'pause';
    for (const q of r.reasons) if (!cur.reasons.includes(q)) cur.reasons.push(q);
  }
  return out;
}

/** The worst verdict of each UTC day the replay visited, oldest first. */
export function dailyOf(records) {
  const days = new Map();
  for (const r of Array.isArray(records) ? records : []) {
    const d = Math.floor(r.at / DAY) * DAY;
    days.set(d, Math.max(days.get(d) ?? -1, LADDER.indexOf(r.verdict)));
  }
  return [...days].map(([day, k]) => ({ day, worst: LADDER[k] }));
}

export function watchYours(text, opts) {
  try {
    const o = opts && typeof opts === 'object' ? opts : {};
    const max = Number.isInteger(o.max) && o.max > 0 ? o.max : MAX_ACTIONS;
    const all = parseLog(text);
    const acts = all.slice(Math.max(0, all.length - max));
    if (acts.length < MIN_ACTIONS) return { ok: false, why: `${acts.length} commits that touched a file were read; the regulator needs at least ${MIN_ACTIONS} (the first 60% teach it this build's normal)` };
    const rules = o.rules === 'v1' ? 'v1' : 'v1b';
    const { fit, held } = splitFit(acts, SHARE);
    const peers = (Array.isArray(o.peers) ? o.peers : []).filter((p) => p && p.name !== NAME && Array.isArray(p.fit));
    const cal = calibrate([{ name: NAME, fit, offset: 0 }, ...peers]);
    const from = held[0].t - 1, to = held[held.length - 1].t + HOUR;   // a visit's window is after `from`: from 1 ms early, every held commit counts
    const r = replay({ nodes: [{ name: NAME, highStakes: o.highStakes === true, offset: 0, fit, intents: held }], base: cal.nodes, from, to, regulator: {}, rules: RULES[rules] });
    const me = r.nodes[NAME], base = cal.nodes[NAME];
    return {
      ok: true, rules, commits: all.length, used: acts.length, fit: fit.length, held: held.length, from, to,
      base: { perHour: base.perHour, perDay: base.perDay, pooled: base.pooled, topArea: base.topArea },
      visits: r.records.length, activeVisits: r.activeVisits,
      verdicts: Object.fromEntries(LADDER.map((v) => [v, r.records.filter((x) => x.verdict === v).length])),
      executed: me.executed.length, heldBack: me.held, episodes: episodesOf(r.records), daily: dailyOf(r.records),
    };
  } catch {
    return { ok: false, why: 'the log could not be read' };
  }
}
