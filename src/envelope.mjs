// ════════════════════════════════════════════════════════════════
// envelope.mjs — the regulator's DELEGATION ENVELOPE: the narrow, signed list of what Simon's key lets it do.
// Pure, total, deterministic, gated. (The estate's extension; the same shape as the BES layer's envelope — stages that
// name the first check to fail — so either can stand in for the other.)
//
//   issuer   Simon's public key (pinned)           holder    the regulator's public key
//   scope    the verbs it may use: a subset of observe, throttle, pause, report, resume
//   budget   units it may spend — 0: it spends nothing, ever
//   maxPauses / perMs   new pauses allowed mesh-wide in any window (a pause storm is itself a drift)
//   notBefore / notAfter   its validity          nonce   names it, so Simon can revoke it
//
// FORBIDDEN verbs — building, publishing, spending, changing code and their kin — are refused at their own stage,
// before scope, so no envelope can grant them: not one the regulator signs for itself, not even one Simon signs.
// A resume of a high-stakes node is refused here too: only Simon's own signed resume lifts that pause.
// Signatures are checked by the caller (WebCrypto is async; this file is pure) and arrive as sigOk.
// ════════════════════════════════════════════════════════════════

export const DOMAIN = 'WDR/regulator-envelope/v1\u0000';
export const VERBS = Object.freeze(['observe', 'throttle', 'pause', 'report', 'resume']);
export const FORBIDDEN = Object.freeze(['build', 'publish', 'spend', 'code-change', 'commit', 'push', 'deploy', 'write-file',
  'install', 'transfer', 'post', 'delete', 'widen-envelope', 'sign-as-simon', 'approve', 'money', 'deal', 'public-claim', 'mint', 'execute']);
export const STAGES = Object.freeze(['shape', 'issuer', 'holder', 'signature', 'forbidden', 'scope', 'high-stakes', 'window', 'expiry', 'revoked', 'budget', 'rate', 'admitted']);

const HEX64 = /^[0-9a-f]{64}$/;
const isKey = (k) => typeof k === 'string' && HEX64.test(k);
const isInt = (n) => Number.isInteger(n) && n >= 0;

/** Canonical text: keys sorted at every depth, so the signed bytes never depend on the order fields were written. */
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}

/** The envelope body as it is signed. Unknown fields are dropped; nothing is checked here (admits() checks). */
export function envelopeBody(p) {
  const x = p && typeof p === 'object' ? p : {};
  return {
    kind: 'regulator-envelope', issuer: x.issuer, holder: x.holder, scope: Array.isArray(x.scope) ? x.scope.slice() : x.scope,
    budget: x.budget, maxPauses: x.maxPauses, perMs: x.perMs, notBefore: x.notBefore, notAfter: x.notAfter, nonce: x.nonce,
  };
}
export const materialOf = (body) => DOMAIN + canonical(body);

function shapeOk(b) {
  return !!b && b.kind === 'regulator-envelope' && isKey(b.issuer) && isKey(b.holder) && Array.isArray(b.scope)
    && b.scope.every((v) => typeof v === 'string') && isInt(b.budget) && isInt(b.maxPauses) && isInt(b.perMs) && b.perMs > 0
    && isInt(b.notBefore) && isInt(b.notAfter) && typeof b.nonce === 'string' && b.nonce.length > 0;
}

/**
 * May the holder do this action under this envelope?
 *   action = { verb, t, cost?, target?, highStakes? }      (highStakes: the target is a high-stakes node)
 *   ctx    = { simon, holder, sigOk, spent, revoked: [nonce…], recentPauses }
 * → { ok, stage, why } — stage names the first check that failed, or 'admitted'.
 */
export function admits(envelope, action, ctx) {
  try {
    const b = envelope && typeof envelope === 'object' ? envelope : null;
    const a = action && typeof action === 'object' ? action : {};
    const c = ctx && typeof ctx === 'object' ? ctx : {};
    const no = (stage, why) => ({ ok: false, stage, why });
    if (!shapeOk(b) || typeof a.verb !== 'string' || !Number.isFinite(a.t)) return no('shape', 'the envelope or the action is not readable');
    if (b.issuer !== c.simon) return no('issuer', 'not issued by the pinned key');
    if (b.holder !== c.holder) return no('holder', 'presented by a key it was not issued to');
    if (c.sigOk !== true) return no('signature', 'the issuer’s signature does not verify');
    if (FORBIDDEN.includes(a.verb) || b.scope.some((v) => FORBIDDEN.includes(v))) return no('forbidden', 'no envelope can grant building, publishing, spending or changing code');
    if (!VERBS.includes(a.verb) || !b.scope.includes(a.verb)) return no('scope', `'${a.verb}' is not in its scope`);
    if (a.verb === 'resume' && a.highStakes === true) return no('high-stakes', 'a high-stakes node is resumed by Simon only');
    if (a.t < b.notBefore) return no('window', 'not valid yet');
    if (a.t >= b.notAfter) return no('expiry', 'expired');
    if (Array.isArray(c.revoked) && c.revoked.includes(b.nonce)) return no('revoked', 'revoked by Simon');
    const cost = a.cost === undefined ? 0 : a.cost;
    const spent = c.spent === undefined ? 0 : c.spent;
    if (!isInt(cost) || !isInt(spent) || spent + cost > b.budget) return no('budget', `it may spend ${b.budget} units`);
    if (a.verb === 'pause' && !(isInt(c.recentPauses) && c.recentPauses < b.maxPauses)) return no('rate', `at most ${b.maxPauses} new pauses in any ${b.perMs / 3600000} hours`);
    return { ok: true, stage: 'admitted', why: 'inside its envelope' };
  } catch {
    return { ok: false, stage: 'shape', why: 'unreadable' };
  }
}
