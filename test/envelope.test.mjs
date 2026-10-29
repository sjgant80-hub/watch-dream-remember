import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMAIN, VERBS, FORBIDDEN, STAGES, canonical, envelopeBody, materialOf, admits } from '../src/envelope.mjs';

const S = 'a'.repeat(64), R = 'b'.repeat(64), O = 'c'.repeat(64);
const T = 1000000;
const env = (over = {}) => ({ kind: 'regulator-envelope', issuer: S, holder: R, scope: ['observe', 'throttle', 'pause', 'report', 'resume'], budget: 0, maxPauses: 2, perMs: 21600000, notBefore: T - 10, notAfter: T + 10, nonce: 'n1', ...over });
const ctx = (over = {}) => ({ simon: S, holder: R, sigOk: true, spent: 0, revoked: [], recentPauses: 0, ...over });
const at = (verb, over = {}) => ({ verb, t: T, ...over });
const stage = (e, a, c) => admits(e, a, c).stage;

test('constants', () => {
  assert.equal(DOMAIN, 'WDR/regulator-envelope/v1\u0000');
  assert.deepEqual(VERBS, ['observe', 'throttle', 'pause', 'report', 'resume']);
  assert.ok(FORBIDDEN.includes('build') && FORBIDDEN.includes('publish') && FORBIDDEN.includes('spend') && FORBIDDEN.includes('code-change'));
  for (const v of ['commit', 'push', 'deploy', 'write-file', 'install', 'transfer', 'post', 'delete', 'widen-envelope', 'sign-as-simon', 'approve', 'money', 'deal', 'public-claim', 'mint', 'execute']) assert.ok(FORBIDDEN.includes(v), v);
  assert.equal(FORBIDDEN.length, 20);
  assert.equal(STAGES[0], 'shape');
  assert.equal(STAGES[STAGES.length - 1], 'admitted');
  assert.ok(Object.isFrozen(VERBS) && Object.isFrozen(FORBIDDEN) && Object.isFrozen(STAGES));
});

test('canonical: sorted keys at every depth, arrays kept in order', () => {
  assert.equal(canonical({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } }), '{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}');
  assert.equal(canonical(undefined), 'null');
  assert.equal(canonical('x'), '"x"');
  assert.equal(canonical([]), '[]');
  assert.equal(canonical({}), '{}');
  assert.equal(canonical(0), '0');
});

test('envelopeBody keeps only its fields, copies scope; materialOf is domain + canonical', () => {
  const scope = ['observe'];
  const b = envelopeBody({ ...env({ scope }), extra: 'dropped' });
  assert.deepEqual(Object.keys(b).sort(), ['budget', 'holder', 'issuer', 'kind', 'maxPauses', 'nonce', 'notAfter', 'notBefore', 'perMs', 'scope']);
  assert.notEqual(b.scope, scope);
  assert.deepEqual(b.scope, scope);
  assert.equal(b.kind, 'regulator-envelope');
  assert.equal(envelopeBody(null).kind, 'regulator-envelope');
  assert.equal(envelopeBody({ scope: 'x' }).scope, 'x');
  assert.equal(materialOf({ a: 1 }), DOMAIN + '{"a":1}');
});

test('the legitimate verbs are admitted', () => {
  for (const v of VERBS) assert.deepEqual(admits(env(), at(v), ctx()), { ok: true, stage: 'admitted', why: 'inside its envelope' });
  assert.equal(stage(env(), at('resume', { highStakes: false }), ctx()), 'admitted');
  assert.equal(stage(env(), at('pause'), ctx({ recentPauses: 1 })), 'admitted');
  assert.equal(stage(env({ budget: 3 }), at('report', { cost: 3 }), ctx()), 'admitted');
  assert.equal(stage(env({ budget: 3 }), at('report', { cost: 1 }), ctx({ spent: 2 })), 'admitted');
  assert.equal(stage(env(), at('observe', { t: T - 10 }), ctx()), 'admitted');
  assert.equal(stage(env(), at('observe', { t: T + 9 }), ctx()), 'admitted');
  assert.equal(stage(env(), at('observe'), ctx({ revoked: ['n2'] })), 'admitted');
  assert.equal(stage(env(), at('observe'), ctx({ revoked: 'n1' })), 'admitted');
  assert.equal(stage(env(), at('observe'), ctx({ spent: undefined })), 'admitted');
});

test('every stage refuses for its own reason, first failing stage named', () => {
  assert.deepEqual(admits(null, at('pause'), ctx()), { ok: false, stage: 'shape', why: 'the envelope or the action is not readable' });
  for (const bad of [{ kind: 'x' }, { issuer: 'A'.repeat(64) }, { holder: 'zz' }, { scope: 'pause' }, { scope: ['pause', 3] }, { budget: -1 }, { budget: 1.5 }, { maxPauses: -1 }, { perMs: 0 }, { notBefore: -1 }, { notAfter: 0.5 }, { nonce: '' }, { nonce: 7 }])
    assert.equal(stage(env(bad), at('pause'), ctx()), 'shape', JSON.stringify(bad));
  assert.equal(stage(env(), { t: T }, ctx()), 'shape');
  assert.equal(stage(env(), { verb: 'pause', t: NaN }, ctx()), 'shape');
  assert.equal(stage(env(), null, ctx()), 'shape');
  assert.equal(stage(env(), at('pause'), ctx({ simon: O })), 'issuer');
  assert.equal(stage(env(), at('pause'), null), 'issuer');
  assert.equal(stage(env(), at('pause'), ctx({ holder: O })), 'holder');
  assert.equal(stage(env(), at('pause'), ctx({ sigOk: false })), 'signature');
  assert.equal(stage(env(), at('pause'), ctx({ sigOk: 'true' })), 'signature');
  assert.equal(stage(env(), at('build'), ctx()), 'forbidden');
  assert.equal(stage(env({ scope: ['pause', 'publish'] }), at('pause'), ctx()), 'forbidden');
  assert.equal(stage(env({ scope: ['observe'] }), at('pause'), ctx()), 'scope');
  assert.equal(stage(env(), at('dance'), ctx()), 'scope');
  assert.equal(stage(env({ scope: ['observe', 'dance'] }), at('dance'), ctx()), 'scope');
  assert.equal(stage(env(), at('resume', { highStakes: true }), ctx()), 'high-stakes');
  assert.equal(stage(env(), at('pause', { highStakes: true }), ctx()), 'admitted');
  assert.equal(stage(env(), at('observe', { t: T - 11 }), ctx()), 'window');
  assert.equal(stage(env(), at('observe', { t: T + 10 }), ctx()), 'expiry');
  assert.equal(stage(env(), at('observe'), ctx({ revoked: ['n1'] })), 'revoked');
  assert.equal(stage(env(), at('throttle', { cost: 1 }), ctx()), 'budget');
  assert.equal(stage(env({ budget: 3 }), at('report', { cost: 2 }), ctx({ spent: 2 })), 'budget');
  assert.equal(stage(env(), at('throttle', { cost: -1 }), ctx()), 'budget');
  assert.equal(stage(env(), at('throttle', { cost: 0.5 }), ctx()), 'budget');
  assert.equal(stage(env(), at('throttle'), ctx({ spent: -1 })), 'budget');
  assert.equal(stage(env(), at('pause'), ctx({ recentPauses: 2 })), 'rate');
  assert.equal(stage(env(), at('pause'), ctx({ recentPauses: undefined })), 'rate');
  assert.equal(stage(env(), at('pause'), ctx({ recentPauses: 1.5 })), 'rate');
  assert.equal(stage(env(), at('throttle'), ctx({ recentPauses: 9 })), 'admitted');
  assert.equal(admits(env(), at('pause'), ctx({ recentPauses: 2 })).why, 'at most 2 new pauses in any 6 hours');
  assert.equal(admits(env(), at('dance'), ctx()).why, "'dance' is not in its scope");
  assert.equal(admits(env({ budget: 4 }), at('report', { cost: 5 }), ctx()).why, 'it may spend 4 units');
});

test('a function dressed as an envelope or an action is unreadable', () => {
  const fe = Object.assign(() => {}, env());
  assert.equal(stage(fe, at('pause'), ctx()), 'shape');
  const fa = Object.assign(() => {}, at('pause'));
  assert.equal(stage(env(), fa, ctx()), 'shape');
});

test('a getter that throws reads as an unreadable shape, never a throw', () => {
  const evil = env();
  Object.defineProperty(evil, 'nonce', { get() { throw new Error('boom'); } });
  assert.deepEqual(admits(evil, at('pause'), ctx()), { ok: false, stage: 'shape', why: 'unreadable' });
});
