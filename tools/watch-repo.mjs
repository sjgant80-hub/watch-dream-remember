#!/usr/bin/env node
// tools/watch-repo.mjs — the regulator on your own git repository, from a terminal. The same kernel the page's "Your build"
// panel runs (src/yours.mjs), calibrated alongside the ten measured builds (data/nodes.json). It reads the repository's
// commit times and file paths only, sends nothing anywhere, changes nothing, and prints the result as JSON.
//
//   node tools/watch-repo.mjs <path to a git repository> [--rules v1|v1b] [--high-stakes]
//   git log --reverse --format=@%ct --name-only | node tools/watch-repo.mjs -        (the log on standard input)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { watchYours, peersOf } from '../src/yours.mjs';

const args = process.argv.slice(2);
const where = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--rules');
if (!where) {
  console.error('watch-repo — node tools/watch-repo.mjs <git repository> [--rules v1|v1b] [--high-stakes]   (or - to read a log on stdin)');
  process.exit(2);
}
const text = where === '-'
  ? readFileSync(0, 'utf8')
  : execFileSync('git', ['-C', where, 'log', '--reverse', '--format=@%ct', '--name-only'], { maxBuffer: 1 << 28 }).toString('utf8');
const peers = peersOf(JSON.parse(readFileSync(new URL('../data/nodes.json', import.meta.url), 'utf8')));
const r = watchYours(text, { peers, rules: args[args.indexOf('--rules') + 1] === 'v1' && args.includes('--rules') ? 'v1' : 'v1b', highStakes: args.includes('--high-stakes') });
const iso = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
console.log(JSON.stringify(r.ok ? { ...r, from: iso(r.from), to: iso(r.to), episodes: r.episodes.map((e) => ({ ...e, from: iso(e.from), to: iso(e.to) })), daily: undefined } : r, null, 1));
process.exit(r.ok ? 0 : 1);
