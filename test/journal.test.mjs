import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENESIS, hashOf, append, verifyFrom, rewrite } from '../src/journal.mjs';

const acts = [{ t: 1, area: 'src', files: 2 }, { t: 2, area: 'test', files: 1 }, { t: 3, area: 'data', files: 4 }];
const build = (list) => list.reduce((j, a) => append(j, a), []);

test('append: indexed, linked, hashed; input untouched', () => {
  const j = build(acts);
  assert.equal(j.length, 3);
  assert.equal(GENESIS, '0'.repeat(64));
  assert.equal(j[0].prev, GENESIS);
  assert.equal(j[1].prev, j[0].h);
  assert.equal(j[2].prev, j[1].h);
  assert.deepEqual(j.map((r) => r.i), [0, 1, 2]);
  assert.equal(j[0].h, hashOf({ i: 0, t: 1, area: 'src', files: 2, prev: GENESIS }));
  assert.match(j[0].h, /^[0-9a-f]{64}$/);
  assert.equal(hashOf({ i: 0, t: 1, area: 'src', files: 2, prev: GENESIS }), '18a18384b1ea348f0e6dfb7b4e08d3c56c0c947c276f3fe4bd17eef9d6734139');   // SHA-256 of '0|1|src|2|000…0'
  const one = append([], acts[0]);
  const two = append(one, acts[1]);
  assert.equal(one.length, 1);
  assert.equal(two.length, 2);
  assert.notEqual(hashOf({ i: 0, t: 1, area: 'src', files: 2, prev: GENESIS }), hashOf({ i: 0, t: 1, area: 'src', files: 3, prev: GENESIS }));
  assert.notEqual(hashOf({ i: 0, t: 1, area: 'src', files: 2, prev: GENESIS }), hashOf({ i: 1, t: 1, area: 'src', files: 2, prev: GENESIS }));
  assert.notEqual(hashOf({ i: 0, t: 1, area: 'src', files: 2, prev: GENESIS }), hashOf({ i: 0, t: 2, area: 'src', files: 2, prev: GENESIS }));
  assert.notEqual(hashOf({ i: 0, t: 1, area: 'src', files: 2, prev: GENESIS }), hashOf({ i: 0, t: 1, area: 'srd', files: 2, prev: GENESIS }));
  assert.notEqual(hashOf({ i: 0, t: 1, area: 'src', files: 2, prev: GENESIS }), hashOf({ i: 0, t: 1, area: 'src', files: 2, prev: '1'.repeat(64) }));
});

test('append: garbage reads as zeros and empty strings, never throws', () => {
  const j = append(null, null);
  assert.deepEqual({ i: j[0].i, t: j[0].t, area: j[0].area, files: j[0].files, prev: j[0].prev }, { i: 0, t: 0, area: '', files: 0, prev: GENESIS });
  const k = append(undefined, { t: 'x', area: undefined, files: 'y' });
  assert.deepEqual([k[0].t, k[0].area, k[0].files], [0, '', 0]);
  const m = append([], { t: '7', area: 5, files: '3' });
  assert.deepEqual([m[0].t, m[0].area, m[0].files], [7, '5', 3]);
});

test('verifyFrom: from genesis, from a head, and the new head', () => {
  const j = build(acts);
  assert.deepEqual(verifyFrom(j, { i: -1, h: GENESIS }), { ok: true, head: { i: 2, h: j[2].h }, why: 'linked' });
  assert.deepEqual(verifyFrom(j, undefined), { ok: true, head: { i: 2, h: j[2].h }, why: 'linked' });
  assert.deepEqual(verifyFrom(j, { i: 0, h: j[0].h }), { ok: true, head: { i: 2, h: j[2].h }, why: 'linked' });
  assert.deepEqual(verifyFrom(j, { i: 1, h: j[1].h }), { ok: true, head: { i: 2, h: j[2].h }, why: 'linked' });
  assert.deepEqual(verifyFrom(j, { i: 2, h: j[2].h }), { ok: true, head: { i: 2, h: j[2].h }, why: 'linked' });
  assert.deepEqual(verifyFrom([], { i: -1, h: GENESIS }), { ok: true, head: { i: -1, h: GENESIS }, why: 'linked' });
  const one = build(acts.slice(0, 1));
  assert.deepEqual(verifyFrom(one, { i: -1, h: GENESIS }), { ok: true, head: { i: 0, h: one[0].h }, why: 'linked' });
  assert.deepEqual(verifyFrom(null, null), { ok: true, head: { i: -1, h: GENESIS }, why: 'linked' });
  assert.deepEqual(verifyFrom(j, { i: 'x', h: 'y' }), { ok: true, head: { i: 2, h: j[2].h }, why: 'linked' });
});

test('verifyFrom: shorter, rewritten, unlinked, self-inconsistent', () => {
  const j = build(acts);
  const head = { i: 1, h: j[1].h };
  assert.deepEqual(verifyFrom(j.slice(0, 1), head), { ok: false, head, why: 'the journal is shorter than the head already verified' });
  assert.deepEqual(verifyFrom(j.slice(0, 2), { i: 2, h: 'x' }).ok, false);
  const forged = rewrite(j, 1, 'docs');
  assert.deepEqual(verifyFrom(forged, head), { ok: false, head, why: 'record 1 was rewritten after it was verified' });
  const forged0 = rewrite(j, 0, 'docs');
  assert.deepEqual(verifyFrom(forged0, head), { ok: false, head, why: 'record 1 was rewritten after it was verified' });
  assert.deepEqual(verifyFrom(forged0, { i: 0, h: j[0].h }), { ok: false, head: { i: 0, h: j[0].h }, why: 'record 0 was rewritten after it was verified' });
  const bent = j.map((r) => ({ ...r }));
  bent[1].area = 'page';   // changed without re-hashing
  assert.deepEqual(verifyFrom(bent, head), { ok: false, head, why: 'record 1 no longer hashes to itself' });
  assert.deepEqual(verifyFrom(bent, { i: -1, h: GENESIS }), { ok: false, head: { i: -1, h: GENESIS }, why: 'record 1 does not link' });
  const bent0 = j.map((r) => ({ ...r }));
  bent0[0].files = 9;
  assert.deepEqual(verifyFrom(bent0, { i: 0, h: j[0].h }), { ok: false, head: { i: 0, h: j[0].h }, why: 'record 0 no longer hashes to itself' });
  const tail = j.map((r) => ({ ...r }));
  tail[2].prev = j[0].h;
  assert.deepEqual(verifyFrom(tail, head), { ok: false, head, why: 'record 2 does not link' });
  const renum = j.map((r) => ({ ...r }));
  renum[2] = { ...renum[2], i: 5 };
  assert.equal(verifyFrom(renum, head).ok, false);
  const holed = j.slice();
  holed[2] = null;
  assert.equal(verifyFrom(holed, head).ok, false);
  const prim = j.slice();
  prim[2] = 7;
  assert.equal(verifyFrom(prim, head).ok, false);
});

test('rewrite: a forged history re-hashed after k; out of range is a copy', () => {
  const j = build(acts);
  const f = rewrite(j, 1, 'docs');
  assert.equal(f.length, 3);
  assert.equal(f[0].h, j[0].h);
  assert.equal(f[1].area, 'docs');
  assert.notEqual(f[1].h, j[1].h);
  assert.notEqual(f[2].h, j[2].h);
  assert.equal(f[2].area, 'data');
  assert.equal(f[2].prev, f[1].h);
  assert.deepEqual(verifyFrom(f, { i: -1, h: GENESIS }).ok, true);
  const g = rewrite(j, 2, 'ci');
  assert.equal(g[1].h, j[1].h);
  assert.equal(g[2].area, 'ci');
  for (const k of [-1, 3, 1.5, 'x']) { const c = rewrite(j, k, 'ci'); assert.deepEqual(c, j); assert.notEqual(c, j); }
  assert.deepEqual(rewrite(null, 0, 'ci'), []);
});
