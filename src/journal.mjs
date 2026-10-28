// ════════════════════════════════════════════════════════════════
// journal.mjs — a node's own record of what it executed: hash-chained, append-only. Pure, total, deterministic, gated.
//
// Each record is { i, t, area, files, prev, h }: h = SHA-256 over the canonical text of the record without h, and prev
// names the record before it ('0'×64 for the first). The regulator's health check keeps the head it last verified
// (index and hash) and, at each visit, checks that the head is still there unchanged and that every record after it
// links. A history rewritten behind the regulator's back fails there — that is one of the node's sealed invariants.
// ════════════════════════════════════════════════════════════════
import { sha256, hex } from '../vendor/fall-kit/core/vendor/light/sha256.mjs';

export const GENESIS = '0'.repeat(64);
const enc = new TextEncoder();
const textOf = (r) => `${r.i}|${r.t}|${r.area}|${r.files}|${r.prev}`;
export const hashOf = (r) => hex(sha256(enc.encode(textOf(r))));

/** A new journal with one more record (the input is not changed). */
export function append(journal, action) {
  const list = Array.isArray(journal) ? journal : [];
  const a = action && typeof action === 'object' ? action : {};
  const last = list[list.length - 1];
  const r = { i: list.length, t: Number(a.t) || 0, area: String(a.area ?? ''), files: Number(a.files) || 0, prev: last ? last.h : GENESIS };
  return [...list, { ...r, h: hashOf(r) }];
}

/** Does this record link to `prev` and hash to itself? */
function sound(r, i, prev) {
  return !!r && typeof r === 'object' && r.i === i && r.prev === prev && r.h === hashOf(r);
}

/**
 * The health check from a verified head. head = { i, h } (i = -1, h = GENESIS before anything was verified).
 * → { ok, head, why } — head is the new verified head when ok; on failure it stays where it was.
 */
export function verifyFrom(journal, head) {
  const list = Array.isArray(journal) ? journal : [];
  const at = head && Number.isInteger(head.i) ? head : { i: -1, h: GENESIS };
  if (at.i >= list.length) return { ok: false, head: at, why: 'the journal is shorter than the head already verified' };
  if (at.i >= 0 && !sound(list[at.i], at.i, at.i === 0 ? GENESIS : list[at.i - 1]?.h)) return { ok: false, head: at, why: `record ${at.i} no longer hashes to itself` };
  if (at.i >= 0 && list[at.i].h !== at.h) return { ok: false, head: at, why: `record ${at.i} was rewritten after it was verified` };
  let prev = at.i >= 0 ? at.h : GENESIS;
  for (let i = at.i + 1; i < list.length; i++) {
    if (!sound(list[i], i, prev)) return { ok: false, head: at, why: `record ${i} does not link` };
    prev = list[i].h;
  }
  const last = list.length - 1;
  return { ok: true, head: last >= 0 ? { i: last, h: list[last].h } : at, why: 'linked' };
}

/** The same journal with record k rewritten (area changed) and every later record re-hashed — a forged history. */
export function rewrite(journal, k, area) {
  const list = Array.isArray(journal) ? journal : [];
  if (!Number.isInteger(k) || k < 0 || k >= list.length) return list.slice();
  let out = list.slice(0, k);
  for (let i = k; i < list.length; i++) out = append(out, i === k ? { ...list[i], area } : list[i]);
  return out;
}
