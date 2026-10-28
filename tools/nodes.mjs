#!/usr/bin/env node
// tools/nodes.mjs — the regulator's real data: the public commit histories of ten estate builds, each read from GitHub
// at a pinned commit and reduced to actions { t, area, files } (src/streams.mjs). No message, author or content is kept.
//
//   node tools/nodes.mjs --write [--local <dir>]   derive data/nodes.json (from local clones under <dir> if given)
//   node tools/nodes.mjs --check                   re-derive from GitHub at the pinned commits: byte-identical or exit 1
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseLog } from '../src/streams.mjs';

export const NODES = Object.freeze([
  ['living-seed', '77b902d2aa259a48b6ebd4ad293bfb3ff9f4b0ee'],
  ['kardlings', '28c089270af6e5ce250690590dd957f012f41a76', 'digi-card'],
  ['fall-kit', '9244d6128c7be0094c9d800acac0a9ee70ecdd97'],
  ['dex-frontier', '426d26bbd54a52b48497f8571c8b912692da7f62'],
  ['wishwood', '670b3f284800ed8bcb9f20ba144a394d80dcbc2c'],
  ['kar-mind', 'a8ca2922b7bba2a6951c0fe0b9b7102f3c911b35'],
  ['sovereign-enterprise', '21f838be5e03b2ec7da58cdd8eb68664380ddd7f'],
  ['konomi-slm', 'e74cb6f517a7d960bc418dcf28c831cf3cfd2ea6'],
  ['break-it', 'badc6ff158b60b764aae68b3deae18014f4b5480'],
  ['ai-first-company', '37d7d948a9c1cc6f77db2f3edce0711073f07934'],
]);

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('data/nodes.json', ROOT);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const LOG = ['log', '--reverse', '--no-renames', '--format=@%ct', '--name-only'];

function logOf(name, sha, localDir, folder) {
  if (localDir) return git(join(localDir, folder || name), ...LOG, sha);
  const dir = join(tmpdir(), 'wdr-nodes', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'fetch', '-q', '--filter=blob:none', `https://github.com/sjgant80-hub/${name}.git`, sha);
  const text = git(dir, ...LOG, sha);
  rmSync(dir, { recursive: true, force: true });
  return text;
}

export function derive(localDir) {
  const nodes = NODES.map(([name, sha, folder]) => {
    const actions = parseLog(logOf(name, sha, localDir, folder));
    return { name, repo: `sjgant80-hub/${name}`, commit: sha, actions: actions.map((a) => [a.t, a.area, a.files]) };
  });
  return { kind: 'watch-dream-remember.nodes', v: 1, note: 'Each node is a public estate build; each action one commit: [committer time ms, the area it touched most, files touched]. Nothing else is kept.', nodes };
}

const text = (d) => JSON.stringify(d, null, 0).replace(/\],\[/g, '],\n[') + '\n';
const cmd = process.argv[2];
if (cmd === '--write') {
  const i = process.argv.indexOf('--local');
  const d = derive(i > 0 ? process.argv[i + 1] : null);
  writeFileSync(OUT, text(d));
  for (const n of d.nodes) console.error(`  ${n.name.padEnd(22)} ${String(n.actions.length).padStart(4)} actions`);
} else if (cmd === '--check') {
  if (!existsSync(OUT)) { console.error('✗ data/nodes.json is missing'); process.exit(1); }
  const fresh = text(derive(null));
  if (fresh !== readFileSync(OUT, 'utf8')) { console.error('✗ data/nodes.json does not re-derive from GitHub at the pinned commits'); process.exit(1); }
  console.error('✓ data/nodes.json re-derives byte for byte from the ten pinned commits on GitHub');
} else if (cmd) { console.error('nodes — --write [--local <dir>] | --check'); process.exit(2); }
