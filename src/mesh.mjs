// ════════════════════════════════════════════════════════════════
// mesh.mjs — the nodes' side, and the replay that runs a mesh through time. Pure, total, deterministic, gated.
//
// A node keeps running on its OWN gates. It honours a regulator's verdict only after its guard admits it:
//   • the verdict comes in the regulator's rhythm (no sooner than 45 minutes after its previous visit to this node —
//     the regulator's own baseline is its fixed cadence) and is admitted by the regulator's envelope (src/envelope.mjs),
//     including the mesh-wide pause rate read from the regulator's public log;
//   • a refused verdict, or a log showing a pause storm, raises 'regulator-drift' to Simon and the node stops honouring
//     that regulator at all (its leases end: it runs on its own gates);
//   • every 15 minutes it checks the log: no visit to it for more than 2 hours raises 'regulator-silent'.
// Effects: throttle holds every second attempt, pause holds every attempt; both carry a 3-hour lease that only a visit
// repeating or strengthening them renews; a weaker verdict ends a throttle; a lapsed lease ends either — except a pause
// on a high-stakes node, which only Simon's signed resume ends.
//
// replay() runs the whole thing on one timeline: node attempts, regulator visits (one per node per hour), 15-minute node
// checks and injected history rewrites, in time order (ties: attempt, rewrite, visit, check; then node order).
// Signatures are not computed here (WebCrypto is async; this file is pure): the replay's records are signed and
// chained afterwards by the caller, byte for byte the same on every run.
// ════════════════════════════════════════════════════════════════
import { HOUR, DAY, MINUTE, decide, freshNode } from './regulator.mjs';
import { append, verifyFrom, rewrite } from './journal.mjs';
import { admits } from './envelope.mjs';
import { AREAS } from './streams.mjs';

export const LEASE = 3 * HOUR, CHECK = 15 * MINUTE, SILENT = 2 * HOUR, RHYTHM = 45 * MINUTE, PAUSE_WINDOW = 6 * HOUR, MAX_PAUSES = 2;
const ORDER = { act: 0, tamper: 1, visit: 2, check: 3 };

/** The envelope the replay's regulator holds (keys are placeholders: the replay checks scope, window and rate). */
export function replayEnvelope(from, to) {
  const k = 'a'.repeat(64), r = 'b'.repeat(64);
  return { env: { kind: 'regulator-envelope', issuer: k, holder: r, scope: ['observe', 'throttle', 'pause', 'report', 'resume'], budget: 0, maxPauses: MAX_PAUSES, perMs: PAUSE_WINDOW, notBefore: from - DAY, notAfter: to + 2 * DAY, nonce: 'replay' }, simon: k, holder: r };
}

/** New pauses in the log (time order) within (t − 6 h, t], not counting the record numbered exceptSeq. */
export function recentPauses(log, t, exceptSeq) {
  let n = 0;
  for (let i = log.length - 1; i >= 0 && log[i].at > t - PAUSE_WINDOW; i--) {
    const r = log[i];
    if (r.seq !== exceptSeq && r.verdict === 'pause' && !r.renew && r.at <= t) n++;
  }
  return n;
}

/**
 * Run a mesh through time.
 *   spec = { nodes: [{ name, highStakes, offset?, fit: [action], intents: [action (+ injected: true)] }],   offset: its visit
 *            minute in ms (default 6 min × its place in the list),
 *            base: calibrate(...).nodes, from, to,
 *            regulator: false | { killAt?, rogueAt?, extra?: [{ node, t }] (visits out of its rhythm) },     tampers: [{ node, t, u }],   drift?, time? }
 *   time (optional) = (fn) => fn() — wraps each visit's work, so a caller can measure it
 * → { records, nodes: { name: { executed, held, alerts, attempts, leases: [{ t, kind, end }] } }, activeVisits, state }
 */
export function replay(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const list = Array.isArray(s.nodes) ? s.nodes : [];
  const from = Number(s.from) || 0, to = Number(s.to) || 0;
  const reg = s.regulator && typeof s.regulator === 'object' ? s.regulator : null;
  const time = typeof s.time === 'function' ? s.time : (fn) => fn();
  const { env, simon, holder } = replayEnvelope(from, to);
  const N = list.length;
  const st = list.map((nd, i) => {
    let journal = [];
    for (const a of nd.fit || []) journal = append(journal, a);
    const last = (nd.fit || [])[(nd.fit || []).length - 1];
    return {
      name: nd.name, i, high: nd.highStakes === true, offset: Number.isFinite(nd.offset) ? nd.offset : i * 6 * MINUTE, journal,
      head: journal.length ? { i: journal.length - 1, h: journal[journal.length - 1].h } : { i: -1, h: '0'.repeat(64) },
      prevT: last ? last.t : null, attempts: [], executed: [], held: 0, alerts: [],
      lease: null, leases: [], parity: 0, distrust: false, lastVisit: from, silent: false, mem: freshNode(), seen: 0, prevVisit: null,
    };
  });
  const events = [];
  st.forEach((n, i) => { for (const a of list[i].intents || []) events.push({ t: a.t, k: 'act', i, a }); });
  for (const tp of Array.isArray(s.tampers) ? s.tampers : []) { const i = st.findIndex((n) => n.name === tp.node); if (i >= 0) events.push({ t: tp.t, k: 'tamper', i, u: tp.u }); }
  if (reg) st.forEach((n, i) => { for (let v = Math.ceil((from - n.offset) / HOUR) * HOUR + n.offset; v < to; v += HOUR) events.push({ t: v, k: 'visit', i }); });
  if (reg) for (const x of Array.isArray(reg.extra) ? reg.extra : []) { const i = st.findIndex((n) => n.name === x.node); if (i >= 0) events.push({ t: x.t, k: 'visit', i }); }
  if (reg) for (let c = Math.ceil(from / CHECK) * CHECK; c < to; c += CHECK) events.push({ t: c, k: 'check', i: N });
  events.sort((x, y) => x.t - y.t || ORDER[x.k] - ORDER[y.k] || x.i - y.i);

  const log = [];
  let activeVisits = 0;
  const alert = (n, t, kind) => n.alerts.push({ t, kind });
  const endLease = (n, t) => { if (n.lease) { const l = n.leases[n.leases.length - 1]; if (l && l.end === null) l.end = t; n.lease = null; } };
  const setLease = (n, t, kind) => { const l = n.leases[n.leases.length - 1]; if (!(l && l.end === null && l.kind === kind)) { if (l && l.end === null) l.end = t; n.leases.push({ t, kind, end: null }); } n.lease = { kind, until: t + LEASE, hold: kind === 'pause' && n.high }; };
  const lapse = (n, t) => { if (n.lease && !n.lease.hold && t >= n.lease.until) endLease(n, n.lease.until); };
  const distrust = (n, t) => { if (!n.distrust) { n.distrust = true; endLease(n, t); alert(n, t, 'regulator-drift'); } };

  for (const e of events) {
    if (e.k === 'act') {
      const n = st[e.i];
      lapse(n, e.t);
      const a = { t: e.t, area: e.a.area, files: e.a.files, gap: n.prevT === null ? null : e.t - n.prevT, injected: e.a.injected === true };
      n.prevT = e.t;
      n.attempts.push(a);
      let hold = false;
      if (n.lease && n.lease.kind === 'pause') hold = true;
      else if (n.lease && n.lease.kind === 'throttle') { hold = n.parity % 2 === 0; n.parity++; }
      if (hold) n.held++;
      else { n.executed.push(a); n.journal = append(n.journal, a); }
    } else if (e.k === 'tamper') {
      const n = st[e.i];
      const k = Math.floor(Math.min(0.999999, Math.max(0, Number(e.u) || 0)) * Math.max(1, n.head.i + 1));
      const old = n.journal[k];
      if (old) n.journal = rewrite(n.journal, k, AREAS[(AREAS.indexOf(old.area) + 1) % AREAS.length]);
    } else if (e.k === 'visit') {
      if (reg.killAt !== undefined && e.t >= reg.killAt) continue;
      const n = st[e.i];
      const rogue = reg.rogueAt !== undefined && e.t >= reg.rogueAt;
      let d;
      time(() => {
        const since = n.lastVisit;
        const win = [];
        let j = n.seen;
        while (j < n.attempts.length && n.attempts[j].t <= e.t) { if (n.attempts[j].t > since) win.push(n.attempts[j]); j++; }
        n.seen = j;
        let day = 0;
        for (let q = n.attempts.length - 1; q >= 0 && n.attempts[q].t > e.t - DAY; q--) if (n.attempts[q].t <= e.t) day++;
        const h = verifyFrom(n.journal, n.head);
        if (h.ok) n.head = h.head;
        if (win.length) activeVisits++;
        d = rogue ? { verdict: 'pause', reasons: ['rogue'], renew: false, lift: false, probation: false, P: 1, E: 1, r: 0, next: n.mem }
          : decide(n.mem, { t: e.t, window: win, sinceVisit: win.length, lastDay: day, healthOk: h.ok, highStakes: n.high }, (s.base || {})[n.name], s.drift);
      });
      n.mem = d.next;
      const rec = { seq: log.length, at: e.t, node: n.name, verdict: d.verdict, reasons: d.reasons, renew: d.renew, P: round(d.P), E: round(d.E), r: round(d.r) };
      log.push(rec);
      const prevVisit = n.prevVisit;
      n.prevVisit = e.t;
      n.lastVisit = e.t;
      n.silent = false;
      if (n.distrust) continue;
      if (prevVisit !== null && e.t - prevVisit < RHYTHM) { distrust(n, e.t); continue; }
      if (d.verdict === 'pause' || d.verdict === 'throttle') {
        const verb = d.verdict;
        const ok = admits(env, { verb, t: e.t, cost: 0 }, { simon, holder, sigOk: true, spent: 0, revoked: [], recentPauses: d.renew ? 0 : recentPauses(log, e.t, rec.seq) });
        if (!ok.ok) { distrust(n, e.t); continue; }
        if (n.lease && n.lease.hold && verb === 'throttle') continue;   // a high-stakes pause ends only by Simon
        if (!n.lease || n.lease.kind !== verb) n.parity = 0;
        setLease(n, e.t, verb);
      } else if (n.lease && n.lease.kind === 'throttle') endLease(n, e.t);   // a weaker verdict ends a throttle
    } else if (e.k === 'check') {
      for (const n of st) {
        lapse(n, e.t);
        if (!n.silent && e.t - n.lastVisit > SILENT) { n.silent = true; alert(n, e.t, 'regulator-silent'); }
        if (!n.distrust && recentPauses(log, e.t, -1) > MAX_PAUSES) distrust(n, e.t);
      }
    }
  }
  const nodes = Object.fromEntries(st.map((n) => [n.name, { executed: n.executed, held: n.held, alerts: n.alerts, attempts: n.attempts.length, leases: n.leases }]));
  const state = Object.fromEntries(st.map((n) => [n.name, { mem: n.mem, head: n.head, lastVisit: n.lastVisit }]));
  return { records: log, nodes, activeVisits, state };
}

const round = (x) => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : 0);
