// ════════════════════════════════════════════════════════════════
// streams.mjs — a node's real behaviour, as the regulator sees it. Pure, total, deterministic, gated.
//
// The regulator is measured on the REAL public commit histories of ten estate builds: each build is a node, each
// commit one of its actions. An action is { t, area, files }: when it landed (committer time, ms), the part of the
// build it touched most, and how many files it touched. Nothing else is kept — no message, no author, no content.
//
// areaOf(path) — which part of a build a file belongs to, by the first rule that matches (order matters):
//   ci      .github/…                         vendor  vendor/… or …/vendor/…
//   test    test/ tests/ or *.test.* *.spec.*  tools   tools/ scripts/ bin/
//   data    data/ receipts/ records/ or *.json *.jsonl *.csv *.tsv
//   page    *.html *.css *.svg *.png *.jpg *.webp *.ico  or  page/ ui/ site/ assets/
//   docs    *.md *.txt LICENSE NOTICE CITATION *.xml *.yml *.yaml (anything not caught above)
//   src     *.mjs *.js *.cjs *.ts *.py *.rs *.go *.sh *.ps1 *.wat *.wasm
//   other   everything else
// ════════════════════════════════════════════════════════════════

export const AREAS = Object.freeze(['src', 'test', 'tools', 'data', 'page', 'docs', 'ci', 'vendor', 'other']);

const RULES = Object.freeze([
  ['ci', /^\.github\//],
  ['vendor', /(^|\/)vendor\//],
  ['test', /(^|\/)tests?\/|\.(test|spec)\.[a-z]+$/],
  ['tools', /^(tools|scripts|bin)\//],
  ['data', /^(data|receipts|records)\/|\.(json|jsonl|csv|tsv)$/],
  ['page', /\.(html|css|svg|png|jpe?g|webp|ico)$|^(page|ui|site|assets)\//],
  ['docs', /\.(md|txt|xml|ya?ml)$|(^|\/)(LICENSE|NOTICE|CITATION)[^/]*$/],
  ['src', /\.(mjs|js|cjs|ts|py|rs|go|sh|ps1|wat|wasm)$/],
]);

/** The area of one file path (forward slashes). Anything unreadable is 'other'. */
export function areaOf(path) {
  const p = typeof path === 'string' ? path.trim() : '';
  if (!p) return 'other';
  for (const [area, re] of RULES) if (re.test(p)) return area;
  return 'other';
}

/** One commit → one action: the area holding the most of its files (ties go to the earlier area in AREAS).
 *  → { t, area, files } or null when it touched no file or its time is not readable. */
export function actionOf(t, paths) {
  const list = Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && p.trim()) : [];
  if (!list.length || !Number.isFinite(t)) return null;
  const n = Object.fromEntries(AREAS.map((a) => [a, 0]));
  for (const p of list) n[areaOf(p)]++;
  let best = AREAS[0];
  for (const a of AREAS) if (n[a] > n[best]) best = a;
  return { t, area: best, files: list.length };
}

/**
 * `git log --reverse --format=@%ct --name-only` text → actions, oldest first (stable for equal times).
 * A line '@<seconds>' opens a commit; the non-empty lines after it are its files.
 */
export function parseLog(text) {
  const out = [];
  let t = null, paths = [];
  const flush = () => { const a = actionOf(t, paths); if (a) out.push(a); };
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^@\d+$/.test(line)) { if (t !== null) flush(); t = Number(line.slice(1)) * 1000; paths = []; }
    else if (t !== null) paths.push(line);
  }
  if (t !== null) flush();
  return out.map((a, i) => [a, i]).sort((x, y) => x[0].t - y[0].t || x[1] - y[1]).map((x) => x[0]);
}

/** A node's actions split by order: the first `share` (rounded down, at least 1 when there are 2+) are FIT. */
export function splitFit(actions, share) {
  const list = Array.isArray(actions) ? actions : [];
  const s = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0.6;
  let k = Math.floor(list.length * s);
  if (list.length >= 2) k = Math.min(list.length - 1, Math.max(1, k));
  return { fit: list.slice(0, k), held: list.slice(k) };
}
