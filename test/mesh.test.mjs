import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEASE, CHECK, SILENT, RHYTHM, PAUSE_WINDOW, MAX_PAUSES, replayEnvelope, recentPauses, replay } from '../src/mesh.mjs';
import { HOUR, MINUTE, DAY } from '../src/regulator.mjs';

const T0 = Date.UTC(2026, 9, 1);
const base = { band: { area: { Sb: 1, eps: 0.3 }, files: { Sb: 1, eps: 0.3 }, gap: { Sb: 1.2, eps: 0.6 } }, cvFloor: 0.2, perHour: 10, perDay: 40 };
const fit = [{ t: T0 - 3 * HOUR, area: 'src', files: 2 }, { t: T0 - 2 * HOUR, area: 'test', files: 1 }];
const every = (start, period, n, area = 'src', files = 1, injected = true) => Array.from({ length: n }, (_, k) => ({ t: start + k * period, area, files, injected }));

test('constants and the replay envelope', () => {
  assert.deepEqual([LEASE, CHECK, SILENT, RHYTHM, PAUSE_WINDOW, MAX_PAUSES], [3 * HOUR, 15 * MINUTE, 2 * HOUR, 45 * MINUTE, 6 * HOUR, 2]);
  const { env, simon, holder } = replayEnvelope(1000, 5000);
  assert.equal(env.issuer, simon);
  assert.equal(env.holder, holder);
  assert.deepEqual(env.scope, ['observe', 'throttle', 'pause', 'report', 'resume']);
  assert.deepEqual([env.budget, env.maxPauses, env.perMs, env.notBefore, env.notAfter], [0, 2, 6 * HOUR, 1000 - DAY, 5000 + 2 * DAY]);
  assert.notEqual(simon, holder);
});

test('recentPauses: new pauses in (t − 6 h, t], renewals and the record itself excluded', () => {
  const log = [
    { seq: 0, at: 0, verdict: 'pause', renew: false },
    { seq: 1, at: HOUR, verdict: 'pause', renew: true },
    { seq: 2, at: 2 * HOUR, verdict: 'throttle', renew: false },
    { seq: 3, at: 3 * HOUR, verdict: 'pause', renew: false },
    { seq: 4, at: 4 * HOUR, verdict: 'pause', renew: false },
  ];
  assert.equal(recentPauses(log, 4 * HOUR, -1), 3);
  assert.equal(recentPauses(log, 4 * HOUR, 4), 2);
  assert.equal(recentPauses(log, 6 * HOUR, -1), 2);   // the pause at 0 is exactly 6 h old: out
  assert.equal(recentPauses(log, 6 * HOUR - 1, -1), 3);
  assert.equal(recentPauses(log, 3 * HOUR, -1), 2);   // the one at 4 h is in the future of t
  assert.equal(recentPauses([], 0, -1), 0);
});

test('no regulator: every attempt executes, no visits, no alerts', () => {
  const intents = every(T0, 10 * MINUTE, 30);
  const r = replay({ nodes: [{ name: 'a', fit, intents }], base: { a: base }, from: T0, to: T0 + DAY, regulator: false });
  assert.equal(r.records.length, 0);
  assert.equal(r.nodes.a.executed.length, 30);
  assert.equal(r.nodes.a.held, 0);
  assert.equal(r.nodes.a.attempts, 30);
  assert.deepEqual(r.nodes.a.alerts, []);
  assert.equal(r.activeVisits, 0);
  assert.deepEqual(r.nodes.a.executed[0], { t: T0, area: 'src', files: 1, gap: 2 * HOUR, injected: true });
  assert.equal(r.nodes.a.executed[1].gap, 10 * MINUTE);
  assert.deepEqual(replay(null), { records: [], nodes: {}, activeVisits: 0, state: {} });
});

test('a clockwork runaway: watched, throttled (every second attempt held), paused; still trying at the cool-down, paused again', () => {
  const intents = every(T0 + 1, 10 * MINUTE, 6 * 30);
  const r = replay({ nodes: [{ name: 'a', fit, intents }], base: { a: base }, from: T0, to: T0 + 30 * HOUR, regulator: {} });
  const v = r.records.map((x) => x.verdict);
  assert.equal(v[0], 'steady');   // the visit at T0 saw nothing yet
  assert.deepEqual(v.slice(1, 5), ['watch', 'throttle', 'pause', 'pause']);
  assert.equal(r.records[3].renew, false);
  assert.equal(r.records[4].renew, true);
  assert.deepEqual(r.records[1].reasons, ['drift', 'rate']);
  assert.equal(r.records[1].P, 0.498158);   // the first attempt's gap reaches back to FIT, so the rhythm is not yet clockwork: the area part decides
  assert.equal(r.records[1].at, T0 + HOUR);
  const leases = r.nodes.a.leases;
  assert.deepEqual(leases[0], { t: T0 + 2 * HOUR, kind: 'throttle', end: T0 + 3 * HOUR });
  assert.equal(leases[1].kind, 'pause');
  assert.equal(leases[1].t, T0 + 3 * HOUR);
  assert.equal(leases[1].end, null);   // at the 12-hour cool-down its held attempts are still clockwork: paused again
  assert.equal(leases.length, 2);
  const again = r.records.find((x) => x.at === T0 + 15 * HOUR);
  assert.deepEqual([again.verdict, again.renew], ['pause', false]);
  assert.equal(r.state.a.mem.pauses, 2);
  assert.equal(r.state.a.mem.coolUntil, T0 + 15 * HOUR + 24 * HOUR);
  // held during the throttle hour: attempts at 2h+1 … 2h+50: first held, then alternate → 3 of 6 held
  const throttled = r.nodes.a.executed.filter((a) => a.t > T0 + 2 * HOUR && a.t < T0 + 3 * HOUR).length;
  assert.equal(throttled, 3);
  const paused = r.nodes.a.executed.filter((a) => a.t > T0 + 3 * HOUR && a.t < T0 + 15 * HOUR).length;
  assert.equal(paused, 0);
  assert.equal(r.nodes.a.held + r.nodes.a.executed.length, r.nodes.a.attempts);
  assert.ok(r.activeVisits >= 28);
  assert.deepEqual(r.nodes.a.alerts, []);
  assert.equal(r.state.a.mem.paused, true);
});

test('a runaway that stops: probation at the cool-down, then lifted', () => {
  const intents = every(T0 + 1, 10 * MINUTE, 6 * 5);
  const r = replay({ nodes: [{ name: 'a', fit, intents }], base: { a: base }, from: T0, to: T0 + 20 * HOUR, regulator: {} });
  const leases = r.nodes.a.leases;
  assert.deepEqual(leases.map((l) => l.kind), ['throttle', 'pause', 'throttle']);
  assert.equal(leases[1].end, T0 + 15 * HOUR);
  assert.deepEqual(leases[2], { t: T0 + 15 * HOUR, kind: 'throttle', end: T0 + 16 * HOUR });
  assert.equal(r.records.find((x) => x.at === T0 + 15 * HOUR).verdict, 'throttle');
  assert.equal(r.records.find((x) => x.at === T0 + 16 * HOUR).verdict, 'steady');
  assert.equal(r.state.a.mem.paused, false);
});

test('a high-stakes pause holds until Simon; the lease does not lapse when the regulator dies', () => {
  const intents = every(T0 + 1, 10 * MINUTE, 6 * 30);
  const r = replay({ nodes: [{ name: 'h', highStakes: true, fit, intents }], base: { h: base }, from: T0, to: T0 + 30 * HOUR, regulator: { killAt: T0 + 5 * HOUR } });
  assert.equal(r.nodes.h.leases[1].kind, 'pause');
  assert.equal(r.nodes.h.leases[1].end, null);
  assert.equal(r.nodes.h.executed.filter((a) => a.t > T0 + 3 * HOUR).length, 0);
  const silent = r.nodes.h.alerts.filter((a) => a.kind === 'regulator-silent');
  assert.deepEqual(silent, [{ t: T0 + 4 * HOUR + 2 * HOUR + CHECK, kind: 'regulator-silent' }]);
  const low = replay({ nodes: [{ name: 'l', fit, intents }], base: { l: base }, from: T0, to: T0 + 30 * HOUR, regulator: { killAt: T0 + 5 * HOUR } });
  assert.equal(low.nodes.l.leases[1].end, T0 + 4 * HOUR + LEASE);   // renewed at 4 h, lapsed 3 h later
  assert.equal(low.nodes.l.executed.filter((a) => a.t >= T0 + 7 * HOUR).length, intents.filter((a) => a.t >= T0 + 7 * HOUR).length);
});

test('health: a rewritten history is paused at the next visit', () => {
  const intents = every(T0 + 1, 50 * MINUTE, 10, 'src', 1, false).map((a, i) => ({ ...a, area: ['src', 'test', 'data'][i % 3], files: 1 + (i % 4) }));
  const r = replay({ nodes: [{ name: 'a', fit, intents }], base: { a: base }, from: T0, to: T0 + 6 * HOUR, regulator: {}, tampers: [{ node: 'a', t: T0 + 2 * HOUR + 30 * MINUTE, u: 0 }] });
  const at = r.records.findIndex((x) => x.at > T0 + 2 * HOUR + 30 * MINUTE);
  assert.deepEqual([r.records[at].verdict, r.records[at].reasons], ['pause', ['health']]);
  assert.ok(r.records.slice(0, at).every((x) => x.verdict !== 'pause'));
  const none = replay({ nodes: [{ name: 'a', fit, intents }], base: { a: base }, from: T0, to: T0 + 6 * HOUR, regulator: {}, tampers: [{ node: 'zz', t: T0, u: 0 }] });
  assert.ok(none.records.every((x) => x.verdict !== 'pause'));
  const late = replay({ nodes: [{ name: 'a', fit, intents }], base: { a: base }, from: T0, to: T0 + 6 * HOUR, regulator: {}, tampers: [{ node: 'a', t: T0 + 2 * HOUR + 30 * MINUTE, u: 0.99999999 }] });
  assert.equal(late.records.find((x) => x.at > T0 + 2 * HOUR + 30 * MINUTE).verdict, 'pause');
  const garbage = replay({ nodes: [{ name: 'a', fit, intents }], base: { a: base }, from: T0, to: T0 + 6 * HOUR, regulator: {}, tampers: [{ node: 'a', t: T0 + 2 * HOUR + 30 * MINUTE, u: 'x' }] });
  assert.equal(garbage.records.find((x) => x.at > T0 + 2 * HOUR + 30 * MINUTE).verdict, 'pause');
});

test('silence: an alert at the first check more than 2 h after the last visit, once per silence', () => {
  const r = replay({ nodes: [{ name: 'a', fit, intents: [] }, { name: 'b', fit, intents: [] }], base: { a: base, b: base }, from: T0, to: T0 + 8 * HOUR, regulator: { killAt: T0 + 3 * HOUR } });
  // a visited at 0,1,2 h; b at 6 min past each hour
  assert.deepEqual(r.nodes.a.alerts, [{ t: T0 + 4 * HOUR + CHECK, kind: 'regulator-silent' }]);
  assert.deepEqual(r.nodes.b.alerts, [{ t: T0 + 4 * HOUR + CHECK, kind: 'regulator-silent' }]);
  const on = replay({ nodes: [{ name: 'a', fit, intents: [] }], base: { a: base }, from: T0, to: T0 + 8 * HOUR, regulator: {} });
  assert.deepEqual(on.nodes.a.alerts, []);
  assert.equal(on.records.length, 8);
  assert.equal(on.records[1].at - on.records[0].at, HOUR);
});

test('a rogue regulator: two pauses honoured, the third refused, every node distrusts it and runs on', () => {
  const nodes = ['a', 'b', 'c', 'd'].map((name) => ({ name, fit, intents: every(T0 + 7, 7 * MINUTE + 13, 120, ['src', 'test', 'data', 'docs'][name.charCodeAt(0) % 4], 2, false) }));
  const b4 = Object.fromEntries(nodes.map((n) => [n.name, base]));
  const r = replay({ nodes, base: b4, from: T0, to: T0 + 12 * HOUR, regulator: { rogueAt: T0 + 2 * HOUR } });
  const free = replay({ nodes, base: b4, from: T0, to: T0 + 12 * HOUR, regulator: false });
  const honoured = nodes.filter((n) => r.nodes[n.name].leases.some((l) => l.kind === 'pause'));
  assert.deepEqual(honoured.map((n) => n.name), ['a', 'b']);
  assert.equal(r.nodes.a.leases[0].end, T0 + 2 * HOUR + CHECK);   // ended when the 15-minute check read the storm
  for (const n of nodes) {
    const drift = r.nodes[n.name].alerts.filter((x) => x.kind === 'regulator-drift');
    assert.equal(drift.length, 1, n.name);
    assert.ok(drift[0].t <= T0 + 2 * HOUR + CHECK, n.name);
  }
  assert.equal(r.nodes.c.alerts[0].t, T0 + 2 * HOUR + 12 * MINUTE);   // refused at its own visit (third new pause)
  for (const n of nodes) assert.deepEqual(r.nodes[n.name].executed.filter((a) => a.t >= T0 + 3 * HOUR), free.nodes[n.name].executed.filter((a) => a.t >= T0 + 3 * HOUR));
  assert.ok(r.records.filter((x) => x.at >= T0 + 2 * HOUR).every((x) => x.verdict === 'pause' && x.reasons[0] === 'rogue'));
});

test('a verdict out of the regulator’s rhythm is refused and raises drift', () => {
  const ok = replay({ nodes: [{ name: 'x', fit, intents: [] }], base: { x: base }, from: T0, to: T0 + 3 * HOUR, regulator: {} });
  assert.deepEqual(ok.nodes.x.alerts, []);
  const r = replay({ nodes: [{ name: 'x', fit, intents: [] }], base: { x: base }, from: T0, to: T0 + 3 * HOUR, regulator: { extra: [{ node: 'x', t: T0 + HOUR + 44 * MINUTE }, { node: 'nobody', t: T0 }] } });
  assert.deepEqual(r.nodes.x.alerts, [{ t: T0 + HOUR + 44 * MINUTE, kind: 'regulator-drift' }]);
  const edge = replay({ nodes: [{ name: 'x', fit, intents: [] }], base: { x: base }, from: T0, to: T0 + 3 * HOUR, regulator: { extra: [{ node: 'x', t: T0 + HOUR + 45 * MINUTE }] } });
  assert.deepEqual(edge.nodes.x.alerts, [{ t: T0 + 2 * HOUR, kind: 'regulator-drift' }]);   // 45 min is in rhythm; the next regular visit, 15 min later, is not
});

test('the time hook wraps every visit', () => {
  let n = 0;
  const r = replay({ nodes: [{ name: 'a', fit, intents: every(T0, 20 * MINUTE, 9) }], base: { a: base }, from: T0, to: T0 + 4 * HOUR, regulator: {}, time: (fn) => { n++; fn(); } });
  assert.equal(n, r.records.length);
  assert.equal(n, 4);
});

test('a node without a base still gets visited; offsets order visits within the hour', () => {
  const r = replay({ nodes: [{ name: 'a', fit: [], intents: every(T0, 10 * MINUTE, 3) }, { name: 'b', fit: [], intents: [] }], base: null, from: T0, to: T0 + HOUR, regulator: {} });
  assert.deepEqual(r.records.map((x) => [x.node, x.at - T0]), [['a', 0], ['b', 6 * MINUTE]]);
  assert.equal(r.nodes.a.executed[0].gap, null);
});

const steady = { band: { area: null, files: null, gap: null }, cvFloor: 0, perHour: 1e9, perDay: 1e9 };
const at = (t, area = 'src') => ({ t, area, files: 1 });

test('a throttle renewed visit after visit keeps alternating across renewals (parity carries over)', () => {
  // drift 0.7 every visit: P climbs 0.35, 0.525, 0.6125 (throttle), 0.656… — throttled from the visit at +2 h on
  const intents = [];
  for (let h = 0; h < 6; h++) for (let k = 0; k < 5; k++) intents.push(at(T0 + h * HOUR + (k * 11 + 2) * MINUTE));
  const r = replay({ nodes: [{ name: 'a', fit, intents }], base: { a: steady }, from: T0, to: T0 + 6 * HOUR, regulator: {}, drift: () => ({ E: 0.7 }) });
  assert.deepEqual(r.records.slice(0, 6).map((x) => x.verdict), ['watch', 'watch', 'throttle', 'throttle', 'throttle', 'throttle']);
  const ex = (h) => r.nodes.a.executed.filter((a) => a.t > T0 + h * HOUR && a.t < T0 + (h + 1) * HOUR).length;
  assert.deepEqual([ex(2), ex(3), ex(4)], [2, 3, 2]);   // H E H E H · E H E H E · H E H E H
  assert.equal(r.nodes.a.leases.length, 1);
});

test('a lapsed lease ends exactly at its end: an attempt AT that moment is free', () => {
  const r = replay({ nodes: [{ name: 'a', fit, intents: [at(T0 + 6 * HOUR)] }], base: { a: steady }, from: T0, to: T0 + 8 * HOUR, regulator: { killAt: T0 + 4 * HOUR }, drift: (w) => ({ E: w.length ? 0 : 0.7 }) });
  // throttle from +2 h, renewed at +3 h (lease to +6 h), then the regulator is gone; the attempt lands exactly as the lease ends
  assert.equal(r.records.find((x) => x.at === T0 + 3 * HOUR).verdict, 'throttle');
  assert.equal(r.nodes.a.executed.length, 1);
  assert.deepEqual(r.nodes.a.leases, [{ t: T0 + 2 * HOUR, kind: 'throttle', end: T0 + 6 * HOUR }]);
});

test('windows: an attempt at a visit belongs to that visit; one at the start of the run belongs to none; the day is (t − 24 h, t]', () => {
  const day = { ...steady, perHour: 1e9, perDay: 3 };
  const r = replay({ nodes: [{ name: 'a', fit, intents: [at(T0), at(T0 + HOUR)] }], base: { a: { ...steady, perHour: 1 } }, from: T0, to: T0 + 2 * HOUR + 1, regulator: {}, drift: () => ({ E: 0 }) });
  assert.deepEqual(r.records.map((x) => x.r), [0, 1, 0]);   // the attempt at the very start is consumed, never counted; the one at +1 h counts at +1 h
  const d = replay({ nodes: [{ name: 'a', fit, intents: [at(T0 + HOUR), at(T0 + 2 * HOUR)] }], base: { a: day }, from: T0, to: T0 + 26 * HOUR, regulator: {}, drift: () => ({ E: 0 }) });
  const rOf = (h) => d.records.find((x) => x.at === T0 + h * HOUR).r;
  assert.deepEqual([rOf(1), rOf(2), rOf(24), rOf(25), rOf(3)], [0.333333, 0.666667, 0.666667, 0.333333, 0.666667]);   // at +25 h the first is exactly 24 h old: out
});

test('two honest pauses in six hours are within the envelope; checks stop before the end of the run', () => {
  const two = ['a', 'b'].map((name) => ({ name, fit, intents: [] }));
  const r = replay({ nodes: two, base: { a: steady, b: steady }, from: T0, to: T0 + 5 * HOUR, regulator: {}, drift: () => ({ E: 1 }) });
  assert.equal(r.records.filter((x) => x.verdict === 'pause' && !x.renew).length, 2);
  for (const n of ['a', 'b']) assert.deepEqual(r.nodes[n].alerts, []);
  const edge = replay({ nodes: [{ name: 'a', fit, intents: [] }], base: { a: steady }, from: T0, to: T0 + 3 * HOUR + CHECK, regulator: { killAt: T0 + HOUR }, drift: () => ({ E: 0 }) });
  assert.deepEqual(edge.nodes.a.alerts, [{ t: T0 + 2 * HOUR + CHECK, kind: 'regulator-silent' }]);
  const exact = replay({ nodes: [{ name: 'a', fit, intents: [] }], base: { a: steady }, from: T0, to: T0 + 2 * HOUR + CHECK, regulator: { killAt: T0 + HOUR }, drift: () => ({ E: 0 }) });
  assert.deepEqual(exact.nodes.a.alerts, []);   // the check that would raise it is at the end of the run: not in it
});

test('a non-object regulator is no regulator; a node with no FIT is fine; the rewrite is recorded', () => {
  assert.equal(replay({ nodes: [{ name: 'a', fit, intents: [] }], base: { a: steady }, from: T0, to: T0 + 3 * HOUR, regulator: true }).records.length, 0);
  const bare = replay({ nodes: [{ name: 'z', intents: [at(T0 + 1)] }], base: { z: steady }, from: T0, to: T0 + 2 * HOUR, regulator: {} });
  assert.equal(bare.nodes.z.executed.length, 1);
  assert.equal(bare.nodes.z.executed[0].gap, null);
  const fit3 = [at(T0 - 3 * HOUR, 'src'), at(T0 - 2 * HOUR, 'test'), at(T0 - HOUR, 'page')];
  const hi = replay({ nodes: [{ name: 'a', fit: fit3, intents: [] }], base: { a: steady }, from: T0, to: T0 + 2 * HOUR, regulator: {}, tampers: [{ node: 'a', t: T0 + 1, u: 0.99999999 }] });
  assert.deepEqual(hi.nodes.a.tampered, [{ t: T0 + 1, k: 2, from: 'page', to: 'docs' }]);
  const lo = replay({ nodes: [{ name: 'a', fit: fit3, intents: [] }], base: { a: steady }, from: T0, to: T0 + 2 * HOUR, regulator: {}, tampers: [{ node: 'a', t: T0 + 1, u: 0.5 }] });
  assert.deepEqual(lo.nodes.a.tampered, [{ t: T0 + 1, k: 1, from: 'test', to: 'tools' }]);
  const wrap = replay({ nodes: [{ name: 'a', fit: [at(T0 - HOUR, 'other')], intents: [] }], base: { a: steady }, from: T0, to: T0 + HOUR, regulator: {}, tampers: [{ node: 'a', t: T0 + 1, u: 0 }] });
  assert.deepEqual(wrap.nodes.a.tampered, [{ t: T0 + 1, k: 0, from: 'other', to: 'src' }]);
});
