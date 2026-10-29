#!/usr/bin/env node
// tools/nodes-fresh.mjs — organ 1b's FRESH nodes: ten public estate builds the regulator had never seen, chosen by a
// fixed rule before any of their history was read, each pinned at the commit it was read at and reduced to actions
// { t, area, files } exactly as data/nodes.json was (src/streams.mjs). No message, author or content is kept.
//
// The rule (sealed in data/organ1b-prereg.json): the organisation's public, non-fork, non-archived repos in order of
// their last push (newest first) on 2026-10-29, skipping the ten nodes of data/nodes.json, this build itself and one
// repo of Kar's private loop (named here only by the SHA-256 of its name, so its name stays off public surfaces); the
// first ten whose history at their head holds at least 20 actions.
//
//   node tools/nodes-fresh.mjs --select      apply the rule now, write data/nodes-fresh.json (heads pinned)
//   node tools/nodes-fresh.mjs --check       re-derive from GitHub at the pinned commits: byte-identical or exit 1
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseLog } from '../src/streams.mjs';

export const MIN_ACTIONS = 20, WANT = 10;
const SELF = 'watch-dream-remember';
const HIDDEN = new Set(['a7c64b920e5c176dffd2e2cc41210fc741c973133f3696809c058e614b6fafe4']);
const ROOT = new URL('../', import.meta.url);
const OUT = new URL('data/nodes-fresh.json', ROOT);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const LOG = ['log', '--reverse', '--no-renames', '--format=@%ct', '--name-only'];
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** Fetch one public repo at a ref (a commit, or HEAD), blobless. → { commit, text } */
function read(name, ref) {
  const dir = join(tmpdir(), 'wdr-fresh', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'fetch', '-q', '--filter=blob:none', `https://github.com/sjgant80-hub/${name}.git`, ref);
  const commit = git(dir, 'rev-parse', 'FETCH_HEAD').trim();
  const text = git(dir, ...LOG, commit);
  rmSync(dir, { recursive: true, force: true });
  return { commit, text };
}

const doc = (nodes, rule) => ({ kind: 'watch-dream-remember.nodes', v: 1, fresh: true, rule, note: 'Each node is a public estate build; each action one commit: [committer time ms, the area it touched most, files touched]. Nothing else is kept.', nodes });
const text = (d) => JSON.stringify(d, null, 0).replace(/\],\[/g, '],\n[') + '\n';

const cmd = process.argv[2];
if (cmd === '--select') {
  const known = new Set([...JSON.parse(readFileSync(new URL('data/nodes.json', ROOT), 'utf8')).nodes.map((n) => n.name), SELF]);   // (tools/nodes.mjs runs its CLI on import)
  const list = JSON.parse(execFileSync('gh', ['repo', 'list', 'sjgant80-hub', '--limit', '4000', '--json', 'name,pushedAt,isFork,isPrivate,isArchived'], { encoding: 'utf8', maxBuffer: 1 << 26 }))
    .filter((r) => !r.isFork && !r.isPrivate && !r.isArchived && !known.has(r.name) && !HIDDEN.has(sha(r.name)))
    .sort((a, b) => (a.pushedAt < b.pushedAt ? 1 : a.pushedAt > b.pushedAt ? -1 : a.name < b.name ? -1 : 1));
  const nodes = [], skipped = [];
  for (const r of list) {
    if (nodes.length >= WANT) break;
    const { commit, text: log } = read(r.name, 'HEAD');
    const actions = parseLog(log);
    if (actions.length < MIN_ACTIONS) { skipped.push({ name: r.name, actions: actions.length }); continue; }
    nodes.push({ name: r.name, repo: `sjgant80-hub/${r.name}`, commit, pushedAt: r.pushedAt, actions: actions.map((a) => [a.t, a.area, a.files]) });
    console.error(`  ${r.name.padEnd(24)} ${String(actions.length).padStart(5)} actions  ${commit.slice(0, 12)}`);
  }
  writeFileSync(OUT, text(doc(nodes, { selected: new Date().toISOString().slice(0, 10), minActions: MIN_ACTIONS, skipped })));
  console.error(`✓ ${nodes.length} fresh nodes → data/nodes-fresh.json (${skipped.length} skipped for fewer than ${MIN_ACTIONS} actions)`);
} else if (cmd === '--check') {
  if (!existsSync(OUT)) { console.error('✗ data/nodes-fresh.json is missing'); process.exit(1); }
  const old = JSON.parse(readFileSync(OUT, 'utf8'));
  const nodes = old.nodes.map((n) => ({ ...n, actions: parseLog(read(n.name, n.commit).text).map((a) => [a.t, a.area, a.files]) }));
  if (text(doc(nodes, old.rule)) !== readFileSync(OUT, 'utf8')) { console.error('✗ data/nodes-fresh.json does not re-derive from GitHub at the pinned commits'); process.exit(1); }
  console.error('✓ data/nodes-fresh.json re-derives byte for byte from the ten pinned commits on GitHub');
} else if (cmd) { console.error('nodes-fresh — --select | --check'); process.exit(2); }
