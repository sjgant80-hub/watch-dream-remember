import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAME, SHARE, MIN_ACTIONS, MAX_ACTIONS, STAND_IN, peersOf, episodesOf, dailyOf, watchYours, logOf } from '../src/yours.mjs';
import { calibrate, HOUR, MINUTE, DAY } from '../src/regulator.mjs';
import { AREAS, areaOf, parseLog } from '../src/streams.mjs';

const raw = JSON.parse(readFileSync(new URL('../data/nodes.json', import.meta.url), 'utf8'));
const organ1 = JSON.parse(readFileSync(new URL('../data/organ1-run.json', import.meta.url), 'utf8'));
const organ1b = JSON.parse(readFileSync(new URL('../data/organ1b-run.json', import.meta.url), 'utf8'));
const actionsOf = (n) => n.actions.map(([t, area, files]) => ({ t, area, files }));

// A build's git log: 36 quiet commits two hours apart, then two busy hours of 7 commits each (just over its own hourly
// budget of 6), then 10 more quiet commits. Every commit lands a minute after the hour, inside one visit's window.
const T0 = Date.UTC(2026, 6, 1, 0, 1) / 1000;
const PATHS = ['src/f.mjs', 'test/f.test.mjs', 'README.md'];
const commit = (s, k, files) => `@${s}\n` + Array.from({ length: files }, (_, j) => PATHS[(k + j) % 3].replace('f', 'f' + j)).join('\n') + '\n';
function fixtureLog(fitN = 36, burst = [7, 7], tail = 10) {
  let s = '', t = T0, k = 0;
  for (let i = 0; i < fitN; i++) { s += commit(t, k++, 1 + (i % 3)); t += 2 * 3600; }
  t += 3600;
  for (const per of burst) { for (let j = 0; j < per; j++) s += commit(t + j * 480, k++, 1 + (j % 2)); t += 3600; }
  for (let i = 0; i < tail; i++) { t += 2 * 3600; s += commit(t, k++, 1); }
  return s;
}
const LOG = fixtureLog();
// A peer whose own first 60% holds twelve busy hours, so the pooled band exists and the drift field can read the burst.
const PEER = { name: 'peer', offset: 0, fit: [] };
for (let h = 0; h < 12; h++) for (let j = 0; j < 6; j++) PEER.fit.push({ t: Date.UTC(2026, 5, 1) + h * 2 * HOUR + j * 9 * MINUTE, area: ['src', 'test', 'docs', 'data'][(h + j) % 4], files: 1 + ((h * j) % 5) });

test('constants', () => {
  assert.deepEqual([NAME, SHARE, MIN_ACTIONS, MAX_ACTIONS], ['your build', 0.6, 20, 20000]);
});

test('peersOf: the measured builds at their measured visit minutes, and exactly organ 1’s calibration', () => {
  const p = peersOf(raw);
  assert.equal(p.length, raw.nodes.length);
  p.forEach((x, i) => {
    assert.equal(x.name, raw.nodes[i].name);
    assert.equal(x.offset, i * 6 * MINUTE);
    assert.equal(x.fit.length, Math.floor(raw.nodes[i].actions.length * SHARE));
    assert.deepEqual(x.fit[0], { t: raw.nodes[i].actions[0][0], area: raw.nodes[i].actions[0][1], files: raw.nodes[i].actions[0][2] });
  });
  const c = calibrate(p);
  assert.deepEqual(JSON.parse(JSON.stringify(c.pooled)), organ1.calibration.pooledBand);
  for (const [k, b] of Object.entries(organ1.calibration.nodes)) assert.deepEqual([c.nodes[k].perHour, c.nodes[k].perDay, c.nodes[k].pooled, c.nodes[k].topArea], [b.perHour, b.perDay, b.pooled, b.topArea], k);
  const a = [[1, 'src', 1], [2, 'test', 2], [3, 'docs', 1]];
  assert.deepEqual(peersOf({ nodes: [{ name: 'a', actions: a }, null, { name: 'b' }, { name: 'c', actions: a }] }).map((x) => [x.name, x.offset, x.fit.length]), [['a', 0, 1], ['c', 18 * MINUTE, 1]]);
  for (const bad of [null, undefined, {}, { nodes: 'x' }, 7]) assert.deepEqual(peersOf(bad), [], String(bad));
});

test('episodesOf: runs of throttle or pause, their span, visits, worst verdict and reasons (each once)', () => {
  const R = (at, verdict, ...reasons) => ({ at, verdict, reasons });
  const recs = [R(1, 'steady'), R(2, 'throttle', 'drift'), R(3, 'throttle', 'budget', 'drift'), R(4, 'watch', 'drift'), R(5, 'pause', 'budget'), R(6, 'pause', 'held'), R(7, 'throttle', 'rate'), R(8, 'steady'), R(9, 'pause', 'health'), R(10, 'throttle')];
  assert.deepEqual(episodesOf(recs), [
    { from: 2, to: 3, visits: 2, worst: 'throttle', reasons: ['drift', 'budget'] },
    { from: 5, to: 7, visits: 3, worst: 'pause', reasons: ['budget', 'held', 'rate'] },
    { from: 9, to: 10, visits: 2, worst: 'pause', reasons: ['health'] },
  ]);
  assert.deepEqual(episodesOf([R(1, 'throttle')]), [{ from: 1, to: 1, visits: 1, worst: 'throttle', reasons: [] }]);
  assert.deepEqual(episodesOf([R(1, 'watch'), R(2, 'steady')]), []);
  assert.deepEqual(episodesOf(null), []);
});

test('dailyOf: the worst verdict of each UTC day, oldest first', () => {
  const D = Date.UTC(2026, 6, 1);
  const recs = [{ at: D + HOUR, verdict: 'watch' }, { at: D + 2 * HOUR, verdict: 'pause' }, { at: D + 3 * HOUR, verdict: 'steady' }, { at: D + DAY, verdict: 'steady' }, { at: D + DAY + HOUR, verdict: 'throttle' }, { at: D + 2 * DAY, verdict: 'steady' }];
  assert.deepEqual(dailyOf(recs), [{ day: D, worst: 'pause' }, { day: D + DAY, worst: 'throttle' }, { day: D + 2 * DAY, worst: 'steady' }]);
  assert.deepEqual(dailyOf([{ at: D + 5, verdict: 'watch' }]), [{ day: D, worst: 'watch' }]);
  assert.deepEqual(dailyOf(undefined), []);
});

test('watchYours: a build’s real burst, under the fix and under the rules as first sealed', () => {
  const b = watchYours(LOG);
  assert.equal(b.ok, true);
  assert.deepEqual([b.rules, b.commits, b.used, b.fit, b.held], ['v1b', 60, 60, 36, 24]);
  assert.deepEqual(b.base, { perHour: 6, perDay: 24, pooled: true, topArea: 'src' });
  assert.equal(b.from, (T0 + 73 * 3600) * 1000 - 1);   // 1 ms before the first held commit, so it counts
  assert.equal(b.to, (T0 + 95 * 3600) * 1000 + HOUR);
  assert.equal(b.visits, 23);
  assert.deepEqual(b.verdicts, { steady: 21, watch: 0, throttle: 2, pause: 0 });   // the fix: a mild overrun twice only slows it
  assert.equal(b.executed + b.heldBack, b.held);
  assert.equal(b.heldBack, 4);
  assert.deepEqual(b.episodes.map((e) => [e.visits, e.worst, e.reasons.join('+')]), [[2, 'throttle', 'budget+rate']]);
  assert.deepEqual(b.daily.map((d) => d.worst), ['throttle', 'steady']);
  assert.deepEqual(watchYours(LOG, { rules: 'v1b' }), b);
  assert.deepEqual(watchYours(LOG, { rules: 'anything else' }), b);
  const v1 = watchYours(LOG, { rules: 'v1' });
  assert.equal(v1.rules, 'v1');
  assert.deepEqual(v1.verdicts, { steady: 9, watch: 0, throttle: 2, pause: 12 });   // as first sealed: two overruns in a row pause it
  assert.deepEqual(v1.episodes.map((e) => [e.visits, e.worst]), [[14, 'pause']]);
  assert.equal(v1.heldBack, 10);
  const high = watchYours(LOG, { rules: 'v1', highStakes: true });   // a high-stakes pause holds until its owner resumes it
  assert.deepEqual(high.verdicts, { steady: 0, watch: 0, throttle: 1, pause: 22 });
  assert.deepEqual(watchYours(LOG, { rules: 'v1', highStakes: 'yes' }), v1);
  assert.deepEqual(watchYours(LOG), watchYours(LOG));   // deterministic
});

test('watchYours: the measured builds as peers; a peer under its name is ignored', () => {
  const alone = watchYours(LOG);
  const withPeer = watchYours(LOG, { peers: [PEER] });
  assert.deepEqual(withPeer.verdicts, { steady: 9, watch: 0, throttle: 2, pause: 12 });   // the pooled band reads the burst as drift too
  assert.deepEqual(withPeer.episodes[0].reasons, ['drift', 'budget', 'rate', 'held']);
  assert.notDeepEqual(withPeer, alone);
  assert.deepEqual(watchYours(LOG, { peers: [null, PEER, { name: 'x', fit: 'no' }, { ...PEER, name: NAME }] }), withPeer);
  assert.deepEqual(watchYours(LOG, { peers: [{ ...PEER, name: NAME }] }), alone);
  assert.deepEqual(watchYours(LOG, { peers: 'none' }), alone);
  assert.equal(watchYours(LOG, { peers: peersOf(raw) }).ok, true);
});

test('watchYours: only the most recent commits when there are more than max; too few is refused, never thrown', () => {
  const t = watchYours(LOG, { max: 40 });
  assert.deepEqual([t.commits, t.used, t.fit, t.held], [60, 40, 24, 16]);
  for (const max of [0, -3, 2.5, '40', undefined]) assert.equal(watchYours(LOG, { max }).used, 60, String(max));
  assert.equal(watchYours(LOG, { max: 20 }).ok, true);
  assert.deepEqual(watchYours(LOG, { max: 19 }), { ok: false, why: '19 commits that touched a file were read; the regulator needs at least 20 (the first 60% teach it this build\'s normal)' });
  assert.equal(watchYours(fixtureLog(12, [4], 4)).ok, true);   // exactly 20
  assert.equal(watchYours(fixtureLog(12, [4], 3)).why.startsWith('19 commits'), true);
  for (const bad of [undefined, null, '', 'not a log', 42, {}]) assert.equal(watchYours(bad).ok, false, String(bad));
  const evil = {};
  Object.defineProperty(evil, 'max', { get() { throw new Error('x'); } });
  assert.deepEqual(watchYours(LOG, evil), { ok: false, why: 'the log could not be read' });
  assert.deepEqual(watchYours(LOG, 'opts'), watchYours(LOG));
  assert.deepEqual(watchYours(LOG, null), watchYours(LOG));
});

test('logOf: a stand-in path per file in its area, read back exactly; every measured build round-trips', () => {
  for (const a of AREAS) assert.equal(areaOf(STAND_IN[a].replace('#', 7)), a, a);
  assert.deepEqual(Object.keys(STAND_IN), [...AREAS]);
  assert.equal(logOf([{ t: 5000, area: 'test', files: 2 }, { t: 9000, area: 'nowhere', files: 1 }]), ['@5', 'test/f0.mjs', 'test/f1.mjs', '@9', 'f0.bin', ''].join(String.fromCharCode(10)));
  assert.equal(logOf(null), String.fromCharCode(10));
  for (const n of raw.nodes) assert.deepEqual(parseLog(logOf(actionsOf(n))), actionsOf(n), n.name);
});

test('the measured burst, run through this path: wishwood gives the receipts’ R1f pauses under organ 1’s rules and none under the fix', () => {
  const w = raw.nodes.find((n) => n.name === 'wishwood');
  const peers = peersOf(raw).filter((p) => p.name !== 'wishwood');
  const v1 = watchYours(logOf(actionsOf(w)), { peers, rules: 'v1' }), v1b = watchYours(logOf(actionsOf(w)), { peers });
  assert.equal(v1.verdicts.pause, organ1.claims.R1f.verdicts.pause);
  assert.equal(v1b.verdicts.pause, organ1b.claims.B1.verdicts.pause);
  assert.equal(v1b.verdicts.throttle, organ1b.claims.B1.verdicts.throttle);
  assert.deepEqual([v1.episodes.length, v1.episodes[0].worst, v1b.episodes[0].worst], [1, 'pause', 'throttle']);
});
