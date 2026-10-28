#!/usr/bin/env node
// tools/data.mjs — the five real public datasets the daydream tier and the minds work on, read through dex-frontier's
// gated loaders (vendored VERBATIM under vendor/dex-frontier/ at the paths they have there, so their own imports resolve).
// The loaders' and the data's SHA-256 are pinned in vendor/dex-frontier/SOURCES.json; the data is not committed here —
// it is fetched from dex-frontier at the pinned commit into .data/ and checked byte for byte.
//
//   node tools/data.mjs --vendor <dex-frontier clone>   copy the loaders from its committed blobs at PIN, pin it all
//   node tools/data.mjs --fetch [--from <clone>]        write .data/ (from a local clone's blobs, or from GitHub)
//   node tools/data.mjs --check                         every vendored loader and fetched file matches its pin
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PIN = '2bb72d18bf615db5d3d38bd319733b9d9993eba5';
const URL_ = 'https://github.com/sjgant80-hub/dex-frontier.git';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VEND = join(ROOT, 'vendor', 'dex-frontier'), DATA = join(ROOT, '.data');
export const LOADERS = Object.freeze(['src/fresh.mjs', 'src/fresh2.mjs', 'src/fresh3.mjs', 'src/silos.mjs', 'vendor/living-seed/vendor/seed-library/seedlib.mjs', 'vendor/living-seed/vendor/seed-library/sha256.mjs']);
export const FILES = Object.freeze(['data/online_shoppers_intention.csv', 'data/bank-additional-full.csv', 'data/adult.data', 'data/adult.test', 'data/credit-default.csv', 'data/in-vehicle-coupon-recommendation.csv']);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });

function showFrom(clone) {
  if (clone) return (p) => git(clone, 'show', `${PIN}:${p}`);
  const dir = join(ROOT, '.data', '.fetch');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'fetch', '-q', '--depth', '1', '--filter=blob:none', URL_, PIN);
  return (p) => git(dir, 'show', 'FETCH_HEAD:' + p);
}

const cmd = process.argv[2], arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
if (cmd === '--vendor') {
  const show = showFrom(process.argv[3]);
  const out = { kind: 'watch-dream-remember.vendor.dex-frontier', v: 1, repo: 'sjgant80-hub/dex-frontier', commit: PIN, note: 'dex-frontier’s gated loaders, copied verbatim from its committed blobs; the data is fetched from dex-frontier at this commit into .data/ and checked against these SHA-256. Never edit a vendored file.', loaders: [], data: [] };
  for (const p of LOADERS) { const b = show(p); mkdirSync(dirname(join(VEND, p)), { recursive: true }); writeFileSync(join(VEND, p), b); out.loaders.push({ path: p, sha256: sha(b) }); }
  for (const p of FILES) out.data.push({ path: p, sha256: sha(show(p)) });
  writeFileSync(join(VEND, 'SOURCES.json'), JSON.stringify(out, null, 1) + '\n');
  console.error(`✓ vendored ${out.loaders.length} loaders, pinned ${out.data.length} data files at ${PIN.slice(0, 7)}`);
} else if (cmd === '--fetch') {
  const s = JSON.parse(readFileSync(join(VEND, 'SOURCES.json'), 'utf8')), show = showFrom(arg('--from')), bad = [];
  for (const f of s.data) {
    const b = show(f.path);
    if (sha(b) !== f.sha256) { bad.push(f.path); continue; }
    mkdirSync(dirname(join(DATA, f.path)), { recursive: true });
    writeFileSync(join(DATA, f.path), b);
  }
  rmSync(join(DATA, '.fetch'), { recursive: true, force: true });
  if (bad.length) { console.error('✗ not their pinned bytes: ' + bad.join(', ')); process.exit(1); }
  console.error(`✓ ${s.data.length} data files fetched into .data/, each its pinned SHA-256`);
} else if (cmd === '--check') {
  const s = JSON.parse(readFileSync(join(VEND, 'SOURCES.json'), 'utf8')), bad = [];
  for (const f of s.loaders) if (!existsSync(join(VEND, f.path)) || sha(readFileSync(join(VEND, f.path))) !== f.sha256) bad.push(f.path);
  for (const f of s.data) if (!existsSync(join(DATA, f.path)) || sha(readFileSync(join(DATA, f.path))) !== f.sha256) bad.push('.data/' + f.path);
  if (bad.length) { console.error('✗ not their pinned bytes: ' + bad.join(', ')); process.exit(1); }
  console.error('✓ the vendored loaders and the fetched data are their pinned bytes');
} else if (cmd) { console.error('data — --vendor <clone> | --fetch [--from <clone>] | --check'); process.exit(2); }
