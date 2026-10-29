import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAP, MAX_AGE, FLOOR, PROMOTE, MAX_BYTES, recordOf, add, decay, promote, lightOf, bound } from '../src/daylog.mjs';
import { decode } from '../vendor/fall-kit/core/vendor/light/codec.mjs';

const c = (key, priority, extra = {}) => ({ key, dataset: 'bank', spec: { op: 'log', f: 'age' }, source: 'gap', priority, ...extra });

test('constants', () => assert.deepEqual([CAP, MAX_AGE, FLOOR, PROMOTE, MAX_BYTES], [48, 3, 0.001, 10, 12288]));

test('recordOf: a clean inert copy, or null', () => {
  const spec = { op: 'log', f: 'age' };
  const r = recordOf({ ...c('k', 0.5), spec, extra: 'x' }, 2);
  assert.deepEqual(r, { key: 'k', dataset: 'bank', spec: { op: 'log', f: 'age' }, source: 'gap', priority: 0.5, born: 2, at: 2, inert: true });
  assert.notEqual(r.spec, spec);
  assert.equal(recordOf({ ...c('k', 0.5), source: undefined }, 0).source, '');
  for (const bad of [null, c('', 1), c(5, 1), { ...c('k', 1), dataset: 3 }, { ...c('k', 1), spec: null }, { ...c('k', 1), spec: 'x' }, c('k', -1), c('k', NaN), c('k', Infinity)]) assert.equal(recordOf(bad, 0), null);
  assert.equal(recordOf(c('k', 1), 1.5), null);
  assert.equal(recordOf(c('k', 0), 0).priority, 0);
});

test('add: dedup, tested refused, ranked, capped; input unchanged', () => {
  const log0 = [recordOf(c('a', 0.2), 0)];
  const r = add(log0, [c('b', 0.9), c('a', 0.99), c('t', 0.5), c('b', 0.1), null], 1, new Set(['t']));
  assert.deepEqual(r.log.map((x) => x.key), ['b', 'a']);
  assert.equal(r.added, 1);
  assert.equal(r.refused, 4);
  assert.equal(log0.length, 1);
  const many = Array.from({ length: 60 }, (_, i) => c('k' + String(i).padStart(2, '0'), i / 100));
  const big = add([], many, 0, null);
  assert.equal(big.log.length, CAP);
  assert.equal(big.log[0].key, 'k59');
  assert.equal(big.log[47].key, 'k12');
  const ties = add([], [c('b', 0.5), c('a', 0.5)], 0).log;
  assert.deepEqual(ties.map((x) => x.key), ['a', 'b']);
  const older = add([recordOf(c('z', 0.5), 0)], [c('a', 0.5)], 1).log;
  assert.deepEqual(older.map((x) => x.key), ['z', 'a']);
  assert.deepEqual(add(null, null, 0).log, []);
});

test('decay: halves per day, drops the old and the faint, idempotent within a day', () => {
  let log = add([], [c('a', 0.8), c('b', 0.003)], 0).log;
  log = decay(log, 1);
  assert.deepEqual(log.map((r) => [r.key, r.priority, r.at, r.born]), [['a', 0.4, 1, 0], ['b', 0.0015, 1, 0]]);
  assert.deepEqual(decay(log, 1), log);
  log = decay(log, 2);
  assert.deepEqual(log.map((r) => [r.key, r.priority]), [['a', 0.2]]);
  log = decay(log, 3);
  assert.equal(log.length, 1);
  assert.equal(decay(log, 4).length, 0);
  assert.equal(decay(add([], [c('x', 1)], 0).log, 3).length, 1);
  assert.equal(decay(add([], [c('x', 0.001)], 5).log, 5).length, 1);
  assert.equal(decay(add([], [c('x', 0.0019)], 5).log, 6).length, 0);
  assert.deepEqual(decay(null, 1), []);
  const back = decay(add([], [c('x', 0.5)], 4).log, 2);
  assert.equal(back[0].priority, 0.5);
  assert.equal(back[0].at, 4);
});

test('promote: the k highest leave the log', () => {
  const log = add([], [c('a', 0.1), c('b', 0.9), c('c', 0.5)], 0).log;
  const p = promote(log, 2);
  assert.deepEqual(p.promoted.map((r) => r.key), ['b', 'c']);
  assert.deepEqual(p.log.map((r) => r.key), ['a']);
  assert.deepEqual(promote(log, 0).promoted, []);
  assert.deepEqual(promote(log, -1).log.length, 3);
  assert.deepEqual(promote(log, 1.5).promoted, []);
  assert.deepEqual(promote(null, 3), { promoted: [], log: [] });
});

test('lightOf round-trips through LIGHT; bound checks records, bytes, uniqueness and inertness', () => {
  const log = add([], [c('a', 0.1), c('b', 0.9)], 0).log;
  const bytes = lightOf(log);
  assert.ok(bytes.length > 0);
  const back = decode(bytes);
  assert.equal(new TextDecoder().decode(back.ok === false ? new Uint8Array(0) : back.bytes ?? back), log.map((r) => JSON.stringify(r)).join('\n'));
  assert.deepEqual(bound(log), { ok: true, records: 2, bytes: bytes.length, unique: true });
  assert.equal(bound([...log, log[0]]).unique, false);
  assert.equal(bound([...log, log[0]]).ok, false);
  assert.equal(bound([{ ...log[0], inert: false }]).ok, false);
  assert.equal(bound(Array.from({ length: 49 }, (_, i) => ({ ...log[0], key: 'k' + i }))).ok, false);
  assert.equal(bound(Array.from({ length: 48 }, (_, i) => ({ ...log[0], key: 'k' + i }))).ok, true);
  assert.deepEqual(bound(null), { ok: true, records: 0, bytes: lightOf([]).length, unique: true });
  let s = 9;
  const noise = (n) => Array.from({ length: n }, () => (s = (s * 16807) % 2147483647).toString(36)).join('');   // incompressible: LIGHT cannot shrink it under the bound
  const huge = Array.from({ length: 40 }, (_, i) => ({ ...log[0], key: 'k' + i + '-' + noise(80) }));
  assert.equal(bound(huge).ok, false);
});
