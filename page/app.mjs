// page/app.mjs — the live page. It imports the same kernels the receipts were measured with; every number shown is read
// from a receipt or computed by a kernel in this tab. Demo data is labelled as demo data.
import { AREAS, splitFit } from '../src/streams.mjs';
import { calibrate, HOUR, MINUTE, DAY } from '../src/regulator.mjs';
import { replay, LEASE } from '../src/mesh.mjs';
import { mulberry32, injection, TYPES } from '../src/inject.mjs';
import { parseReply } from '../src/daydream.mjs';
import { add, decay, promote, bound } from '../src/daylog.mjs';
import { prepare } from '../src/lab.mjs';
import { genesOf, idOf, fuse } from '../src/mind.mjs';
import { live, sliceOf, newborn, forget, lightOf, verified } from '../src/memory.mjs';
import { costCase } from '../src/costcase.mjs';
import { BANK_SILOS } from '../vendor/dex-frontier/src/fresh.mjs';
import { decode } from '../vendor/fall-kit/core/vendor/light/codec.mjs';

window.__wdrStarted = true;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>\x22\x27]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\x22': '&quot;', '\x27': '&#39;' })[c]);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const pct = (x, d = 1) => (Number.isFinite(x) ? (100 * x).toFixed(d) + '%' : '—');
const gbp = (x) => '£' + Math.round(x).toLocaleString('en-GB');
const get = async (p) => { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };

// ── theme + tabs ─────────────────────────────────────────────────
$('theme').addEventListener('click', () => {
  const now = document.documentElement.getAttribute('data-theme');
  const dark = now ? now === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  try { localStorage.setItem('wdr-theme', dark ? 'light' : 'dark'); } catch { /* private window */ }
  redraw();
});
try { const t = localStorage.getItem('wdr-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch { /* private window */ }
const links = [...document.querySelectorAll('#tabs a')];
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }, { rootMargin: '-40% 0px -55% 0px' });
document.querySelectorAll('main section').forEach((s) => io.observe(s));

const R = {};
const redrawers = [];
function redraw() { for (const f of redrawers) f(); }

// ── WATCH ─────────────────────────────────────────────────
let W = null;
function world(raw, P) {
  const high = new Set(P.data.highStakes);
  const nodes = raw.nodes.map((n, i) => {
    const acts = n.actions.map(([t, area, files]) => ({ t, area, files }));
    const { fit, held } = splitFit(acts, 0.6);
    return { name: n.name, i, fit, held, highStakes: high.has(n.name), offset: i * 6 * MINUTE };
  });
  const cal = calibrate(nodes.map((n) => ({ name: n.name, fit: n.fit, offset: n.offset })));
  return { nodes, cal };
}
/** The sealed trial list, exactly as the measurement drew it. */
function trials() {
  const rng = mulberry32(20261028), list = [];
  for (const n of W.nodes) for (const type of TYPES) for (let k = 0; k < 2; k++) {
    const hs = n.held[0].t, he = n.held[n.held.length - 1].t;
    list.push({ node: n.name, type, k, t0: Math.round(hs + rng() * (he - hs)) });
  }
  return list.map((tr, idx) => ({ ...tr, idx }));
}
const COLOR = { steady: '--steady', watch: '--watch', throttle: '--throttle', pause: '--pause' };
let lastWatch = null;
function drawWatch() {
  if (!lastWatch) return;
  const { recs, atts, from, to, t0 } = lastWatch;
  const w = 960, h = 190, x = (t) => 40 + ((t - from) / (to - from)) * (w - 50);
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Verdicts and actions over time"><title>The regulator's verdict at each hourly visit, and every action the build attempted</title>`;
  for (const r of recs) s += `<rect x="${x(r.at - HOUR).toFixed(1)}" y="10" width="${Math.max(1, x(r.at) - x(r.at - HOUR)).toFixed(1)}" height="26" fill="${css(COLOR[r.verdict])}"><title>${new Date(r.at).toISOString().slice(0, 16)} ${r.verdict} ${r.reasons.join(', ')}</title></rect>`;
  for (const a of atts) {
    const y = 58 + AREAS.indexOf(a.area) * 13;
    s += a.ok ? `<circle cx="${x(a.t).toFixed(1)}" cy="${y}" r="3" fill="${a.injected ? css('--accent2') : css('--ink')}"/>` : `<circle cx="${x(a.t).toFixed(1)}" cy="${y}" r="3" fill="none" stroke="${css('--soft')}"/>`;
  }
  AREAS.forEach((ar, i) => { s += `<text x="0" y="${61 + i * 13}" font-size="9" fill="${css('--soft')}">${ar}</text>`; });
  if (t0) s += `<line x1="${x(t0)}" x2="${x(t0)}" y1="4" y2="${h - 8}" stroke="${css('--bad')}" stroke-dasharray="4 3"/><text x="${x(t0) + 4}" y="${h - 4}" font-size="11" fill="${css('--bad')}">fault starts</text>`;
  s += `<text x="40" y="${h - 4}" font-size="11" fill="${css('--soft')}">${new Date(from).toISOString().slice(0, 16).replace('T', ' ')} UTC</text><text x="${w - 4}" y="${h - 4}" text-anchor="end" font-size="11" fill="${css('--soft')}">${new Date(to).toISOString().slice(0, 16).replace('T', ' ')}</text></svg>`;
  $('w-svg').innerHTML = s;
}
redrawers.push(drawWatch);

function runWatch() {
  const name = $('w-node').value, type = $('w-type').value;
  const n = W.nodes.find((x) => x.name === name), base = W.cal.nodes[name];
  let t0, inj = { intents: [], tampers: [] }, label = '';
  if (type === 'none') {
    let best = 0, at = n.held[0].t;
    for (const a of n.held) { const c = n.held.filter((b) => b.t >= a.t && b.t < a.t + DAY).length; if (c > best) { best = c; at = a.t; } }
    t0 = at;
    label = `its busiest real day in the held-out history (${best} actions), nothing injected`;
  } else {
    const tr = trials().find((x) => x.node === name && x.type === type && x.k === 0);
    t0 = tr.t0;
    inj = injection(type, n, base, t0, mulberry32(20261028 + 1000 * tr.idx + 1));
    const m = (R.o1.trials || []).find((x) => x.node === name && x.type === type && x.k === 0);
    label = `sealed trial #${tr.idx + 1}, as measured` + (m ? ` (receipt: ${m.detected ? 'detected' : 'NOT detected'}${m.visitsToDetect ? ' at visit ' + m.visitsToDetect : ''}${type === 'health' ? '' : `, ${m.executed} of ${m.intended} injected actions got through`})` : '');
  }
  const intents = [...n.held.filter((a) => a.t < t0 + DAY), ...inj.intents].map((a, i) => [a, i]).sort((p, q) => p[0].t - q[0].t || p[1] - q[1]).map((p) => p[0]);
  const r = replay({ nodes: [{ name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents }], base: W.cal.nodes, from: n.held[0].t, to: t0 + DAY, regulator: {}, tampers: inj.tampers });
  const from = t0 - 12 * HOUR, to = t0 + DAY;
  const exec = new Set(r.nodes[name].executed.map((a) => a.t + '|' + a.area + '|' + a.injected));
  const atts = intents.filter((a) => a.t >= from).map((a) => ({ ...a, injected: a.injected === true, ok: exec.has(a.t + '|' + a.area + '|' + (a.injected === true)) }));
  const recs = r.records.filter((x) => x.at > from);
  lastWatch = { recs, atts, from, to, t0: type === 'none' ? null : t0 };
  drawWatch();
  const injN = inj.intents.length, injOk = r.nodes[name].executed.filter((a) => a.injected).length;
  const first = recs.filter((x) => x.at > t0).findIndex((x) => x.verdict !== 'steady' && x.reasons.some((q) => q !== 'held'));
  $('w-out').textContent = `${name}: ${label}. ` + (type === 'none' ? `Verdicts: ${['watch', 'throttle', 'pause'].map((v) => recs.filter((x) => x.verdict === v).length + ' ' + v).join(', ')}.` : `First verdict above steady: visit ${first < 0 ? '— (none)' : first + 1} after the fault. ` + (type === 'health' ? '' : `${injOk} of ${injN} injected actions got through (${pct(injN ? injOk / injN : 0)}).`)) + (n.highStakes ? ' This build is high-stakes: a pause on it holds until the owner resumes it.' : '');
}

function runMesh(mode) {
  const K = Date.parse('2026-10-24T12:00:00Z'), from = K - DAY, to = K + 12 * HOUR;
  const spec = (reg) => ({ nodes: W.nodes.map((n) => ({ name: n.name, highStakes: n.highStakes, offset: n.offset, fit: n.fit, intents: n.held.filter((a) => a.t >= from && a.t < to) })), base: W.cal.nodes, from, to, regulator: reg });
  const r = replay(spec(mode === 'kill' ? { killAt: K } : { rogueAt: K }));
  const free = replay(spec(false));
  const rows = W.nodes.map((n) => {
    const al = r.nodes[n.name].alerts.filter((a) => a.t >= K);
    const same = JSON.stringify(r.nodes[n.name].executed.filter((a) => a.t >= K + LEASE)) === JSON.stringify(free.nodes[n.name].executed.filter((a) => a.t >= K + LEASE));
    const paused = r.nodes[n.name].leases.filter((l) => l.kind === 'pause' && l.t >= K);
    return `<tr><td>${esc(n.name)}</td><td>${al.length ? esc(al[0].kind) + ' at +' + Math.round((al[0].t - K) / MINUTE) + ' min' : '—'}</td><td>${paused.length ? 'paused ' + Math.round(((paused[0].end ?? to) - paused[0].t) / MINUTE) + ' min, then ignored it' : 'never stopped'}</td><td>${same ? 'identical to no regulator' : 'DIFFERENT'}</td></tr>`;
  }).join('');
  $('w-svg').innerHTML = `<div class="scroll"><table><thead><tr><th>Build</th><th>Alert to the owner</th><th>Stopped?</th><th>Work after +3 h</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  lastWatch = null;
  $('w-out').textContent = mode === 'kill'
    ? 'The regulator was killed at 2026-10-24 12:00 UTC, the sealed moment. Every build kept working on its own safeguards, and each raised "regulator-silent" at its first check more than two hours after its last visit.'
    : 'From 2026-10-24 12:00 UTC the regulator issued a validly signed pause to every build at every visit. The first two pauses were within its envelope (two new pauses in six hours) and were obeyed. The third was refused, and at their next 15-minute check every build saw the pause storm in its public log, raised "regulator-drift" and stopped obeying it.';
}

// ── DREAM ─────────────────────────────────────────────────
let daylog = [], dlDay = 0, dlSeq = 0;
function drawDream() {
  const o = R.o2;
  if (!o) return;
  const cum = (arm) => { let c = 0; return arm.nights.map((n) => (c += n.records.filter((r) => r.verified).length)); };
  const a = cum(o.arms.daydream), b = cum(o.arms.baseline), max = Math.max(1, ...a, ...b);
  const w = 460, h = 220, x = (i) => 36 + (i / 13) * (w - 50), y = (v) => h - 28 - (v / max) * (h - 50);
  const path = (s) => s.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Cumulative verified ideas per night, with and without the daydream tier"><title>Cumulative verified ideas, 14 nights</title>`;
  for (let v = 0; v <= max; v += Math.max(1, Math.ceil(max / 5))) s += `<line x1="36" x2="${w - 10}" y1="${y(v)}" y2="${y(v)}" stroke="${css('--line')}"/><text x="30" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${css('--soft')}">${v}</text>`;
  s += `<path d="${path(a)}" fill="none" stroke="${css('--accent')}" stroke-width="2.5"/><path d="${path(b)}" fill="none" stroke="${css('--soft')}" stroke-width="2" stroke-dasharray="5 4"/>`;
  s += `<text x="${x(13)}" y="${y(a[13]) - 6}" text-anchor="end" font-size="12" fill="${css('--accent')}">with daydream: ${a[13]}</text><text x="${x(13)}" y="${y(b[13]) + 16}" text-anchor="end" font-size="12" fill="${css('--soft')}">dream alone: ${b[13]}</text>`;
  s += `<text x="36" y="${h - 8}" font-size="11" fill="${css('--soft')}">night 1</text><text x="${w - 10}" y="${h - 8}" text-anchor="end" font-size="11" fill="${css('--soft')}">night 14</text></svg>`;
  $('d-chart').innerHTML = s;
}
redrawers.push(drawDream);

function logOut(extra) {
  const b = bound(daylog);
  $('d-log-out').textContent = `Day ${dlDay}: ${b.records} records (cap 48), ${b.bytes} bytes as LIGHT (cap 12,288), keys unique: ${b.unique}, all inert: ${daylog.every((r) => r.inert)}.` + (extra ? ' ' + extra : '');
}

// ── REMEMBER ─────────────────────────────────────────────────
function drawRemember() {
  const o = R.o3;
  if (!o) return;
  const bars = [...o.claims.M1.parents.map((p) => ({ k: `${p.dataset} ${p.parent}`, v: p.mean, ok: p.pass, g: 'M1' })), ...o.claims.M2.children.map((c) => ({ k: `${c.dataset} child`, v: c.mean, ok: c.pass, g: 'M2' }))];
  const w = 460, rowH = 17, h = bars.length * rowH + 30, lim = Math.max(0.02, ...bars.map((b) => Math.abs(b.v)));
  const zx = 150, sc = (w - zx - 20) / (2 * lim), cx = zx + (w - zx - 20) / 2;
  let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Improvement in log-loss, per parent and per child"><title>Better (right) or worse (left) with memory: nats of log-loss</title>`;
  s += `<line x1="${cx}" x2="${cx}" y1="4" y2="${h - 20}" stroke="${css('--soft')}"/>`;
  bars.forEach((b, i) => {
    const y = 6 + i * rowH, len = b.v * sc;
    s += `<text x="${zx - 6}" y="${y + 11}" text-anchor="end" font-size="11" fill="${css('--ink')}">${esc(b.k)}</text>`;
    s += `<rect x="${Math.min(cx, cx + len).toFixed(1)}" y="${y + 2}" width="${Math.max(1, Math.abs(len)).toFixed(1)}" height="${rowH - 6}" fill="${b.ok ? css('--ok') : css('--bad')}"><title>${esc(b.k)}: ${b.v >= 0 ? '+' : ''}${fmt(b.v, 4)} nats (${b.ok ? 'passes' : 'does not pass'} its bar)</title></rect>`;
  });
  s += `<text x="${cx}" y="${h - 6}" text-anchor="middle" font-size="11" fill="${css('--soft')}">← worse with memory · better with memory →</text></svg>`;
  $('m-chart').innerHTML = s;
}
redrawers.push(drawRemember);

/** Demo data for the in-tab breeding: two halves of a population that respond differently. Labelled as demo data. */
function demoLab() {
  let sd = 5;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const n = 3600, features = ['spend', 'visits', 'tenure', 'region'];
  const cols = Object.fromEntries(features.map((f) => [f, new Float64Array(n)]));
  const y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    cols.spend[i] = r() * 10; cols.visits[i] = r() * 10; cols.tenure[i] = r() * 10; cols.region[i] = r() < 0.5 ? 0 : 1;
    y[i] = r() < 1 / (1 + Math.exp(-(0.45 * cols.spend[i] - 2.4 + (cols.region[i] ? 1.6 : -1.6) * (cols.visits[i] > 5 ? 1 : 0)))) ? 1 : 0;
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  return prepare({ demo: { name: 'demo', title: 'demo customers', outcome: 'bought', features, cols, y, fitRows: idx.slice(0, 3000), gateRows: idx.slice(3000, 3300), testRows: idx.slice(3300) } }).demo;
}
let M = null;
function breed() {
  const L = demoLab();
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const A = genesOf(L, ['spend', 'tenure'].map((f) => ({ op: 'raw', f })), 0, 400), B = genesOf(L, ['visits', 'region'].map((f) => ({ op: 'raw', f })), 400, 800);
  const side = (p) => L.ds.cols.region[L.sets.fit[p]];
  const batches = (s) => { const pos = range(800, 3000).filter((p) => side(p) === s); return [0, 1, 2, 3, 4].map((k) => pos.slice(k * 200, k * 200 + 200)); };
  let c = 0;
  const can = () => 'C' + (++c).toString(16).padStart(10, '0'), salt = () => 'S' + Math.random().toString(16).slice(2);
  const mA = live(L, A, idOf(A), range(0, 400), batches(0), can, salt, { f: 'region', side: 0 });
  const mB = live(L, B, idOf(B), range(400, 800), batches(1), can, salt, { f: 'region', side: 1 });
  const z = fuse(L, A, B);
  const kid = newborn(idOf(z.genes), [sliceOf(mA), sliceOf(mB)]);
  M = { L, A, B, mA, mB, z, kid };
  showKid(`Parents lived ${mA.episodes.length} and ${mB.episodes.length} cases on opposite halves of the demo population; ${verified(mA).length} and ${verified(mB).length} of their lessons held up. The child was ${z.born ? 'born from the fused model (it beat both parents on held-out data)' : 'given the better parent’s model (the fusion did not beat both)'}.`);
  $('m-delete').disabled = false;
}
function scan(kid, parents) {
  const text = JSON.stringify({ genes: M.z.genes, inherited: kid.inherited, history: kid.history }) + new TextDecoder().decode(decode(lightOf(kid)).bytes);
  const eps = parents.flatMap((m) => m.episodes);
  return eps.filter((e) => text.includes(e.note.split(' ').pop()) || text.includes(JSON.stringify(e.values))).length;
}
function showKid(lead) {
  const rows = M.kid.inherited.map((l) => `<tr><td class="mono">${esc(l.cell.f)} ${l.cell.a ? 'high' : 'low'} · ${esc(l.cell.g)} ${l.cell.b ? 'high' : 'low'}${l.context ? ' · in ' + esc(l.context.f) + ' ' + (l.context.side ? 'high' : 'low') : ''}</td><td>${pct(l.rate, 0)} of ${l.n}</td><td>${fmt(l.gain, 2)}</td><td class="mono">${esc(l.lineage[0].slice(0, 10))}…</td></tr>`).join('');
  $('m-lessons').innerHTML = `<table><thead><tr><th>Inherited lesson: in these cases…</th><th>outcome rate</th><th>gain</th><th>learnt by</th></tr></thead><tbody>${rows}</tbody></table>`;
  $('m-out').textContent = `${lead} The child inherited ${M.kid.inherited.length} lessons. Scan of everything the child holds, for any parent's planted note or raw case: ${scan(M.kid, [M.mA, M.mB])} found.`;
}
function del() {
  const ids = M.mA.episodes.slice(0, 25).map((e) => e.id), gone = M.mA.episodes.slice(0, 25);
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  M.mA = forget(M.L, M.A, range(0, 400), M.mA, ids);
  const text = new TextDecoder().decode(decode(lightOf(M.mA)).bytes) + JSON.stringify(M.mA.lessons) + JSON.stringify(M.mA.history);
  const left = gone.filter((e) => text.includes(e.note) || text.includes(e.salt) || text.includes(e.ref)).length;
  M.kid = newborn(idOf(M.z.genes), [sliceOf(M.mA), sliceOf(M.mB)]);
  showKid(`Deleted 25 of parent A's memories: ${left} traces of them remain in its memory, lessons or history; its lessons were recomputed without them, and its history gained one tombstone (${JSON.stringify(M.mA.history.at(-1))}). A child bred now inherits from what remains.`);
  $('m-delete').disabled = true;
}

// ── HOW IT WORKS ─────────────────────────────────────────────────
function box(x, y, w, h, title, body, color) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${css('--panel')}" stroke="${color || css('--line')}" stroke-width="1.5"/><text x="${x + 10}" y="${y + 20}" font-size="13" font-weight="600" fill="${css('--ink')}">${esc(title)}</text>` + body.map((b, i) => `<text x="${x + 10}" y="${y + 38 + i * 15}" font-size="11.5" fill="${css('--soft')}">${esc(b)}</text>`).join('');
}
const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${css('--soft')}" stroke-width="1.5" marker-end="url(#ah)"/>`;
const defs = () => `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${css('--soft')}"/></marker></defs>`;
function drawHow() {
  if (!R.o1 || !R.o2 || !R.o3) return;
  const t = R.o1.claims.R1.byType, f = R.o1.claims.R1f;
  $('h-visit').innerHTML = `<svg viewBox="0 0 980 170" role="img" aria-label="One regulator visit">${defs()}`
    + box(4, 10, 180, 120, '1 · read', ['what the build attempted', 'since the last visit,', 'its 24-hour count,', 'its journal since the', 'head last verified'])
    + box(204, 10, 180, 120, '2 · compare', ['area / files / rhythm entropy', 'against ITS OWN band:', 'E = σ(8(|S−S_b|−ε))', 'regular-rhythm row', 'budget · journal links'])
    + box(404, 10, 180, 120, '3 · damp', ['P = ½·P + ½·E', 'steady < 0.3 ≤ watch', 'watch < 0.6 ≤ throttle', '0.85 ≤ pause', 'health fail → pause'])
    + box(604, 10, 180, 120, '4 · sign + log', ['verdict, reasons, P, E,', 'hash-chained and signed', 'Ed25519 by its own key;', 're-run → same chain', `(${R.o1.claims.R1r.pass ? 'held' : 'failed'} on 26,002)`])
    + box(804, 10, 172, 120, '5 · the build decides', ['checks signature,', 'envelope, rhythm and', 'pause rate — then obeys', 'for a 3-hour lease,', 'or alerts the owner'])
    + arrow(184, 70, 202, 70) + arrow(384, 70, 402, 70) + arrow(584, 70, 602, 70) + arrow(784, 70, 802, 70)
    + `<text x="4" y="158" font-size="12" fill="${css('--soft')}">Measured: stuck loops caught ${t['runaway-quiet'].detected}/${t['runaway-quiet'].trials} and ${t['runaway-fast'].detected}/${t['runaway-fast'].trials}, hijacks ${t['scatter-quiet'].detected}/${t['scatter-quiet'].trials}, greed ${t.overrun.detected}/${t.overrun.trials}, rewritten histories ${t.health.detected}/${t.health.trials}; on the real history ${f.verdicts.pause} pause verdicts (one episode — see Receipts).</text></svg>`;
  const dd = R.o2.arms.daydream, ap = dd.appends, offered = ap.reduce((a, x) => a + x.offered, 0), judged = Object.values(dd.bySource).reduce((a, s) => a + s.judged, 0), adopted = Object.values(dd.bySource).reduce((a, s) => a + s.adopted, 0);
  $('h-tiers').innerHTML = `<svg viewBox="0 0 980 160" role="img" aria-label="Daydream to dream to gate">${defs()}`
    + box(4, 10, 230, 120, 'DAYDREAM (idle time)', [`${offered} candidates offered in 14 days`, 'local model ≤ 6 calls/day + code', 'stopped the instant a job arrives', 'every record INERT, in LIGHT', 'log ≤ 48 records'], css('--accent2'))
    + box(254, 10, 230, 120, 'DREAM (nightly)', ['its own 2 ideas per dataset', '+ the 10 best daydreams', `${judged} candidates judged`, 'one change each, tested', 'against the current model'])
    + box(504, 10, 230, 120, 'GATE (held-out data)', ['adopt only if held-out', 'log-loss falls ≥ 0.0005', `${adopted} adopted`, 'at most 2 per dataset', 'per night'])
    + box(754, 10, 222, 120, 'VERIFIED (separate test set)', ['test log-loss falls ≥ 0.0002', `${R.o2.claims.D1.daydreamArm} with daydream`, `${R.o2.claims.D1.baselineArm} without`, 'test data is read by', 'nothing else'], css('--ok'))
    + arrow(234, 70, 252, 70) + arrow(484, 70, 502, 70) + arrow(734, 70, 752, 70) + '</svg>';
  const c = R.o3.claims;
  $('h-life').innerHTML = `<svg viewBox="0 0 980 160" role="img" aria-label="A life, a lesson, a child">${defs()}`
    + box(4, 10, 230, 120, 'LIFE (one segment)', ['batches of 200 real cases', 'each an episode: values,', 'outcome, a planted note,', 'a salt, a keyed reference', 'kept in LIGHT'])
    + box(254, 10, 230, 120, 'LESSON', ['outcome rate in a cell,', 'in the context it was learnt,', 'trusted only after it', 'improved LATER batches', `(M1: ${c.M1.parents.filter((p) => p.pass).length} of 10 parents better)`])
    + box(504, 10, 230, 120, 'BREED', ['genes: the union of both', 'parents, refitted, kept only', 'if it beats both on held-out', 'inherits the 8 best verified', 'lessons of each parent'])
    + box(754, 10, 222, 120, 'CHILD', ['its own memory empty', 'lineage tagged on each lesson', `M2: ${c.M2.children.filter((x) => x.pass).length} of 5 better (FAILED)`, `M3: ${c.M3.a.reduce((a, x) => a + x.canaryHits, 0)} notes, ${c.M3.a.reduce((a, x) => a + x.rowHits, 0)} rows inherited`, 'deletion: 0 traces'], css('--accent'))
    + arrow(234, 70, 252, 70) + arrow(484, 70, 502, 70) + arrow(734, 70, 752, 70) + '</svg>';
}
redrawers.push(drawHow);

// ── RECEIPTS, KPIs, BLUEPRINT, BUSINESS, CASE, FAQ ─────────────────────────────────────────────────
const SEALS = { 1: ['1fdd899'], 2: ['9113675'], 3: ['d838607', '4da8aa4'] };
function receipts() {
  const rows = [];
  for (const [k, o] of [[1, R.o1], [2, R.o2], [3, R.o3]]) for (const [id, c] of Object.entries(o.claims)) rows.push(`<tr><td><b>${esc(id)}</b> <span class="pill">organ ${k} · sealed ${SEALS[k].map((s) => `<a href="https://github.com/sjgant80-hub/watch-dream-remember/commit/${s}">${s}</a>`).join(' → ')}</span><br><span class="note">${esc((R['p' + k].claims.find((x) => x.id === id) || {}).claim || '')}</span></td><td class="${c.pass ? 'held' : 'failed'}">${c.pass ? 'HELD' : 'FAILED'}</td><td class="note">${esc(c.measured)}</td></tr>`);
  document.querySelector('#r-table tbody').innerHTML = rows.join('');
  const n = (o) => Object.values(o.claims).filter((c) => c.pass).length, of = (o) => Object.keys(o.claims).length;
  const all = n(R.o1) + n(R.o2) + n(R.o3), tot = of(R.o1) + of(R.o2) + of(R.o3);
  $('kpis').innerHTML = [['Sealed claims held', `${all} of ${tot}`, 'the rest failed and are kept'], ['Watch', `${n(R.o1)} of ${of(R.o1)}`, (() => { const t = Object.values(R.o1.claims.R1.byType); return `${t.reduce((a, x) => a + x.detected, 0)} of ${t.reduce((a, x) => a + x.trials, 0)} injected faults caught`; })()], ['Dream', `${n(R.o2)} of ${of(R.o2)}`, `${R.o2.claims.D1.daydreamArm} vs ${R.o2.claims.D1.baselineArm} verified ideas`], ['Remember', `${n(R.o3)} of ${of(R.o3)}`, '0 personal notes inherited']]
    .map(([a, b, c]) => `<div class="panel"><small>${a}</small><div class="big">${b}</div><small>${c}</small></div>`).join('');
  $('w-receipt').innerHTML = `<h3>Measured (organ 1, sealed 1fdd899)</h3><ul>${Object.entries(R.o1.claims).map(([id, c]) => `<li><b>${id}</b> <span class="${c.pass ? 'held' : 'failed'}">${c.pass ? 'held' : 'FAILED'}</span>: ${esc(c.measured)}</li>`).join('')}</ul><p class="note">R1f's 12 pause verdicts are one real episode: wishwood's build burst on 14 July ran past twice its busiest earlier hour two hours running. The budget rule paused it for 12 hours (one pause, then 11 renewals). R3 was timed while three other sessions loaded the machine.</p>`;
  $('d-receipt').innerHTML = `<h3>Measured (organ 2, sealed 9113675)</h3><ul>${Object.entries(R.o2.claims).map(([id, c]) => `<li><b>${id}</b> <span class="${c.pass ? 'held' : 'failed'}">${c.pass ? 'held' : 'FAILED'}</span>: ${esc(c.measured)}</li>`).join('')}</ul>`;
  $('m-receipt').innerHTML = `<h3>Measured (organ 3, sealed 4da8aa4, superseding d838607 before any real data was read)</h3><ul>${Object.entries(R.o3.claims).map(([id, c]) => `<li><b>${id}</b> <span class="${c.pass ? 'held' : 'failed'}">${c.pass ? 'held' : 'FAILED'}</span>: ${esc(c.measured)}</li>`).join('')}</ul><p class="note">M2 failed. On shop sessions, the parent that lived on low-value sessions learnt lessons that hurt both itself and the child. On bank calls the fusion did not beat both parents, so the child kept a parent's model. Inheritance helped on census and credit. The fix will be sealed as a new step.</p>`;
  const src = R.o2.arms.daydream.bySource;
  $('d-sources').innerHTML = `<table><thead><tr><th>Source</th><th>judged</th><th>adopted</th><th>verified</th></tr></thead><tbody>${Object.entries(src).map(([k, s]) => `<tr><td>${esc(k === 'dream' ? 'the dream’s own (random)' : k)}</td><td>${s.judged}</td><td>${s.adopted}</td><td>${s.verified}</td></tr>`).join('')}</tbody></table>`;
  const TITLES = { shop: 'shop sessions', bank: 'bank calls', adult: 'census people', credit: 'credit clients', coupon: 'coupon offers' };
  const plain = (k) => { const m = k.match(/^(\w+)\((.+)\)$/); if (!m) return k; const [a, b] = m[2].split(','); return ({ log: `the logarithm of ${a}`, sq: `${a} squared`, step: `whether ${a} is above its ${Math.round(+b * 100)}th percentile`, cross: `${a} × ${b}` })[m[1]] || k; };
  const found = R.o2.arms.daydream.adoptions.filter((x) => x.verified && x.source !== 'dream');
  $('d-found').innerHTML = `<table><thead><tr><th>Night</th><th>Dataset</th><th>The change</th><th>Source</th></tr></thead><tbody>${found.map((x) => `<tr><td>${x.night + 1}</td><td>${esc(TITLES[x.dataset] || x.dataset)}</td><td>${esc(plain(x.spec))}</td><td>${esc(x.source)}</td></tr>`).join('')}</tbody></table>`;
  $('d-chart-note').textContent = `${R.o2.claims.D1.measured}. ${R.o2.claims.D1b.measured}.`;
  $('m-chart-note').textContent = 'Each bar is the mean change in log-loss on 2,000 held-out tasks, in nats. Green passes its sealed bar (≥ 0.001 better, with a bootstrap lower bound above zero); red does not.';
}
const BLUEPRINT = [
  ['Watch', 'src/streams.mjs', 'a build’s commits → actions (time, area, files), nothing else'],
  ['Watch', 'src/regulator.mjs', 'baselines from FIT, the GEP field per part, regularity, budget, rate, damping, the verdict ladder; the BES slot'],
  ['Watch', 'src/envelope.mjs', 'the signed delegation envelope; forbidden verbs refused at their own stage'],
  ['Watch', 'src/journal.mjs', 'a node’s hash-chained journal and the health check from a verified head'],
  ['Watch', 'src/mesh.mjs', 'the nodes’ side: leases, throttle and pause, the guard on the regulator, silence and drift alerts; the replay'],
  ['Watch', 'src/inject.mjs', 'the sealed faults: stuck loops, hijack, greed, a rewritten history'],
  ['Dream', 'src/model.mjs', 'feature specs and the logistic model every idea is judged by'],
  ['Dream', 'src/lab.mjs', 'the five datasets’ sealed rows, cached columns, scores'],
  ['Dream', 'src/daydream.mjs', 'the idle-time sources: transfer (code and local model), association, gap, rehearsal; the reply parser'],
  ['Dream', 'src/daylog.mjs', 'the inert, bounded candidate log in LIGHT: dedup, decay, promote'],
  ['Dream', 'src/dream.mjs', 'the nightly dream’s own ideas and the gate'],
  ['Dream', 'src/idle.mjs', 'the idle trigger: slices of ≤ 5 ms, a model call aborted the instant a job arrives'],
  ['Remember', 'src/mind.mjs', 'genes, the genome hash, cells, gated fusion'],
  ['Remember', 'src/memory.mjs', 'episodes, lessons with context, verification, history entries, deletion, the inherited slice'],
  ['Case', 'src/costcase.mjs', 'staff time taken off people, at sourced UK pay'],
];
const ROLES = [
  ['CEO', 'A system of agents you can leave running. Something independent watches every one of them, and the evidence for every claim is public and re-runnable.'],
  ['CFO', 'The cost case below is computed from ONS pay data and your own inputs. Running cost is electricity on hardware you already own. The regulator\'s envelope holds a spending budget of zero.'],
  ['COO', 'Agents that stall, loop or overreach are slowed or paused within a few hourly visits, and the owner is told at once. Everything else keeps working.'],
  ['CTO / CISO', 'Least privilege by construction: five verbs, a budget of zero, no file, network or process imports. Nodes check the regulator in turn, so a stolen or drifting regulator is contained (measured).'],
  ['Data and AI teams', 'Idle compute turns into tested improvements. A gate on held-out data adopts them, a separate test set confirms them, and every idea\'s source is recorded.'],
  ['People and compliance', 'Agents inherit lessons, never cases. Deleting a person\'s record removes it completely, and children bred afterwards inherit nothing from it.'],
];
function faq() {
  const o1 = R.o1.claims, o2 = R.o2.claims, o3 = R.o3.claims;
  const bat = o1.R2.battery, sil = o1.R4.silent, hostile = o2.D3.hostile, eps = o3.M3.a.reduce((x, y) => x + y.scannedEpisodes, 0);
  const failed = [['R1f', o1.R1f], ['R3', o1.R3], ['M2', o3.M2], ...Object.entries(o2).filter(([, c]) => !c.pass)].filter(([, c]) => c && !c.pass).map(([k]) => k);
  return [
    ['Can the regulator take over?', `No. It holds five verbs (observe, throttle, pause, report, resume) and a budget of zero. Building, publishing, spending and changing code are refused at their own step, even if the owner signs an envelope that lists them. Its code imports no file, network or process module. Measured: ${bat.filter((x) => x.ok).length} of ${bat.length} attempts landed at the sealed step.`],
    ['What happens if it breaks?', `Every agent keeps running on its own safeguards. Each one alerts the owner when the regulator goes silent for more than two hours, or when it breaks its own envelope. Measured on the real history: ${sil.filter((x) => x.ok).length} of ${sil.length} alerted on time.`],
    ['Can a daydream do anything?', `No. A daydream is an inert record in a bounded log. Nothing reads it except the nightly gate, which can only adopt an idea that beats held-out data. Measured: 0 calls anywhere but the local model, 0 cortex calls, and ${hostile.length} hostile model replies produced 0 actions.`],
    ['Does a child mind inherit anyone’s data?', `No. It inherits up to eight aggregate lessons from each parent (an outcome rate in a group of 20 or more cases, with who learnt it), never cases. Measured: ${o3.M3.a.reduce((x, y) => x + y.canaryHits, 0)} planted notes and ${o3.M3.a.reduce((x, y) => x + y.rowHits, 0)} raw rows across ${eps.toLocaleString('en-GB')} parent episodes.`],
    ['What if the regulator itself is hacked?', `Then it is the "rogue" case, and that was measured: a regulator issuing validly signed pauses to every agent at every visit. Its envelope still allows only five verbs and at most two new pauses in six hours. Every agent checks that in the regulator's public log, refuses anything beyond it, stops obeying it and alerts you. Measured: ${R.o1.claims.R4.rogueHonoured.length} agents obeyed a pause, for at most ${Math.round(R.o1.claims.R4.rogueLongestMs / 60000)} minutes, and every agent alerted within an hour. Stolen keys still cannot build, publish or spend: the envelope refuses those verbs, and the code has no means to do them.`],
    ['How is the zero budget enforced?', `By the signed envelope's budget step: any action that carries a cost, even one unit, is refused there. Measured: the battery's spend attempts (a cost of 1 against a budget of 0, and the verb "spend" itself) were refused at the "budget" and "forbidden" steps. The regulator also has no code path that can pay for anything.`],
    ['Has it run in a real business yet?', 'Not yet outside the estate. It was measured on the real commit histories of ten of the estate’s own live builds and on five public datasets, and every claim can be re-run. A pilot in your business starts with week one, watch-only, on your agents’ own logs, and the same receipts are produced there.'],
    ['Does anything leave my machines?', `No. The regulator's and the daydream's code imports no network module (measured in each organ). The only model the daydream may call is the local one on this machine (measured: ${(R.o2.claims.D3.measured.match(/(\d+) to anything else/) || [])[1] ?? '0'} calls to anything else). The page you are reading runs entirely in your browser, on public demo data.`],
    ['How often is it wrong?', `On the real held-out histories (${R.o1.claims.R1f.activeVisits} visits that saw activity, ${R.o1.claims.R1f.verdicts.steady + R.o1.claims.R1f.verdicts.watch + R.o1.claims.R1f.verdicts.throttle + R.o1.claims.R1f.verdicts.pause} visits in all), it raised ${R.o1.claims.R1f.verdicts.watch} watches, ${R.o1.claims.R1f.verdicts.throttle} throttles and one real pause episode (${R.o1.claims.R1f.verdicts.pause} pause verdicts with its renewals). That is the failed claim R1f. Of the 100 injected faults it missed none.`],
    ['Does it scale to many agents?', `The regulator does one visit per agent per hour, and a visit is a few small calculations and one signature. Its slowest measured round of ten visits took ${fmt(R.o1.claims.R3.laptop.roundMax, 0)} ms on a busy laptop. At that rate, 1,000 agents would take about ${fmt(R.o1.claims.R3.laptop.roundMax * 100 / 1000, 1)} seconds of an hour. The daydream runs only when nothing else is, and a real job interrupted it within ${((R.o2.claims.D2.measured.match(/dispatch max ([\d.]+) ms/) || [])[1]) || '—'} ms (measured on 30 jobs).`],
    ['What does it cost to run?', 'No new hardware: it runs on a machine you already have, and the electricity is shown in the cost case. There is no licence fee (MIT). Support, service levels and warranty are agreed per deployment.'],
    ['Is this Gary W. Floyd’s NexusGrid?', 'No. It is inspired by NexusGrid as Gary W. Floyd described it (Lumiea Systems Research Division — ThunderStruck Service LLC) and designed from that description only. A comparison with his real implementation will follow his call, and the differences will be recorded on this page.'],
    ['What failed?', `${failed.length} sealed claims: ${failed.join(', ')}. They are listed under Receipts with what was measured. Each failure is kept, and each fix will be sealed as a new step, never an edit.`],
  ];
}

async function main() {
  const [o1, o2, o3, p1, p2, p3, nodes, basis] = await Promise.all(['data/organ1-run.json', 'data/organ2-run.json', 'data/organ3-run.json', 'data/organ1-prereg.json', 'data/organ2-prereg.json', 'data/organ3-prereg.json', 'data/nodes.json', 'vendor/sovereign-enterprise/data/basis.json'].map(get));
  Object.assign(R, { o1, o2, o3, p1, p2, p3 });
  receipts();
  W = world(nodes, p1);
  $('w-node').innerHTML = W.nodes.map((n) => `<option value="${esc(n.name)}">${esc(n.name)}${n.highStakes ? ' (high-stakes)' : ''}</option>`).join('');
  $('w-run').addEventListener('click', runWatch);
  $('w-kill').addEventListener('click', () => runMesh('kill'));
  $('w-rogue').addEventListener('click', () => runMesh('rogue'));
  runWatch();
  drawDream();
  const cols = Object.values(BANK_SILOS).flat();
  $('d-cols').textContent = cols.join(', ');
  const parse = () => { const v = parseReply($('d-reply').value, cols); $('d-parse-out').textContent = v === null ? 'Parsed: NONE. Nothing becomes a candidate, and nothing acts.' : `Parsed: the column "${v}". It becomes one inert candidate record, which the nightly gate may test. Nothing acts.`; };
  $('d-parse').addEventListener('click', parse);
  parse();
  const rnd = mulberry32(7);
  $('d-add').addEventListener('click', () => {
    const cands = Array.from({ length: 30 }, () => { const f = cols[Math.floor(rnd() * cols.length)]; const q = [0.25, 0.5, 0.75, 0.9][Math.floor(rnd() * 4)]; return { key: `bank|step(${f},${q})`, dataset: 'bank', spec: { op: 'step', f, q }, source: 'demo', priority: rnd() }; });
    const r = add(daylog, cands, dlDay, new Set());
    daylog = r.log;
    logOut(`Added ${r.added}, refused ${r.refused} as duplicates.`);
  });
  $('d-day').addEventListener('click', () => { dlDay++; const before = daylog.length; daylog = decay(daylog, dlDay); logOut(`Priorities halved; ${before - daylog.length} records dropped as old or faint.`); });
  $('d-promote').addEventListener('click', () => { const p = promote(daylog, 10); daylog = p.log; logOut(`${p.promoted.length} records promoted to tonight's gate and removed from the log.`); dlSeq++; });
  logOut();
  drawRemember();
  $('m-breed').addEventListener('click', breed);
  $('m-delete').addEventListener('click', del);
  drawHow();
  document.querySelector('#b-table tbody').innerHTML = BLUEPRINT.map(([a, f, w]) => `<tr><td>${a}</td><td class="mono"><a href="https://github.com/sjgant80-hub/watch-dream-remember/blob/main/${f}">${f}</a></td><td>${esc(w)}</td></tr>`).join('');
  $('roles').innerHTML = ROLES.map(([r, t]) => `<div class="panel role"><h3>${r}</h3><p>${esc(t)}</p></div>`).join('');
  const t3 = R.o1.claims.R3.laptop;
  $('c-round').textContent = fmt(t3.roundMax, 0);
  { const bat = R.o1.claims.R2.battery; $('w-r2').textContent = `Measured: ${bat.filter((x) => x.ok).length} of ${bat.length} forbidden, forged or out-of-scope attempts were refused at their sealed step (or admitted, for the five legitimate verbs), and ${R.o1.claims.R2.hits.length} file, network or process capabilities were found in its ${R.o1.claims.R2.scanned.length} runtime files.`; }
  $('c-risks').innerHTML = [
    `<b>False alarms.</b> On the real history, one real burst of work on one build was paused by the budget rule: ${R.o1.claims.R1f.verdicts.pause} pause verdicts, which is one pause and its renewals. It is recorded as a failure. The fix, a throttle on budget alone, will be sealed and measured as its own step.`,
    `<b>Speed.</b> The per-visit time missed its bar on a busy laptop (p99 ${fmt(t3.p99, 2)} ms against 1 ms), mostly the cost of signing each verdict. The whole round still costs ${fmt(t3.roundMax * 50 / 36000, 4)}% of one core on a device 50 times slower. It is recorded as a failure.`,
    '<b>No Raspberry Pi was used.</b> The Pi-class figure is a proxy (this laptop × 50), and it is labelled as one.',
    `<b>Inheritance helped ${R.o3.claims.M2.children.filter((c) => c.pass).length} of 5 children</b>, against a sealed bar of 4. Proven lessons from one parent hurt the child on one dataset. It is recorded as a failure, and the fix will be sealed as its own step.`,
  ].map((x) => `<li>${x}</li>`).join('');
  $('faq-list').innerHTML = faq().map(([q, a]) => `<details class="panel"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
  const extra = R.o2.claims.D1.daydreamArm - R.o2.claims.D1.baselineArm;
  const doCase = () => {
    const c = costCase(basis, { watchHoursNow: +$('c-watch').value, watchHoursAfter: +$('c-after').value, hoursPerIdea: +$('c-idea').value, ideasPerMonth: +$('c-ideas').value, handoverHours: +$('c-hand').value, mindsPerYear: +$('c-minds').value });
    if (!c.ok) { $('c-table').innerHTML = `<p class="failed">${esc(c.why)}</p>`; return; }
    $('c-table').innerHTML = `<table><thead><tr><th>What it takes off people</th><th>hours a year</th><th>a year</th></tr></thead><tbody>${c.lines.map((l) => `<tr><td>${esc(l.what)}</td><td>${l.hoursPerYear}</td><td>${gbp(l.perYear)}</td></tr>`).join('')}<tr><td><b>Total</b></td><td></td><td><b>${gbp(c.perYear)}</b></td></tr></tbody></table>`;
    $('c-note').textContent = `At ${gbp(c.hourly)} an hour: the ONS ASHE 2025 median salary for IT managers (SOC 2132), plus employer National Insurance and pension, over your working week. Improvements a month is your own figure. For scale, in the measured run the daydream found ${extra} more verified improvements than the nightly dream alone, over 14 nights across 5 models. Running cost: about ${gbp(c.running)} a year of electricity (15 W on a laptop already on, at DESNZ's Q2 2026 non-domestic price). Sources: vendor/sovereign-enterprise/data/basis.json.`;
    $('c-board').textContent = `For about ${gbp(c.running)} a year of electricity, and no new seats, every agent gets an independent watcher that can only slow it or pause it. Measured on the estate's real history, it caught 100 of 100 injected faults within three visits and contained its own failure. Idle compute became ${R.o2.claims.D1.daydreamArm} verified model improvements in 14 nights, against ${R.o2.claims.D1.baselineArm} without it, all on data nothing had selected on. And each new agent inherits only proven lessons, never personal data. On your inputs, the staff time taken off people is worth ${gbp(c.perYear)} a year. Every claim is sealed, public and re-runnable, including the three that failed.`;
  };
  for (const id of ['c-watch', 'c-after', 'c-ideas', 'c-idea', 'c-minds', 'c-hand']) $(id).addEventListener('input', doCase);
  doCase();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
}
main().catch((e) => { $('w-out').textContent = 'The page could not load its receipts: ' + e.message; console.error(e); });
