#!/usr/bin/env node
// tools/nodes-burst.mjs — the stress set organ 1c would have used: estate builds whose held-out history REALLY overran their own budget envelope,
// the case organ 1b's fix is about and organ 1b's fresh ten never reached. Chosen by counting alone (no calibration of
// bands, no replay, no verdict), each pinned at the commit it was read at, reduced to actions exactly as organ 1's were.
//
// The rule (sealed in data/organ1c-prereg.json): the organisation's public, non-fork, non-archived repos in order of their
// last push (newest first) on 2026-10-29, skipping the twenty nodes of organs 1 and 1b, this build and one repo of Kar's
// private loop (by the SHA-256 of its name); a repo qualifies when its history at its head holds at least 20 actions AND
// its held-out 40% (src/streams.mjs splitFit) holds a clock hour with more actions than max(6, 2 × its FIT busiest clock
// hour) or a UTC day with more than max(20, 2 × its FIT busiest UTC day) — organ 1's own budget envelope; the first ten.
// (GitHub's commit count is read first, to skip repos with fewer than 20 commits without fetching them.)
//
// RUN ONCE, 2026-10-29: NO repo qualified. Of 1,565 candidates, 1,528 have fewer than 20 commits, 5 fewer than 20 actions,
// and none of the other 32 overran its own envelope in its held-out history (data/nodes-burst.json keeps the tally and
// their names). So organ 1c, the stress test this was for, was never sealed: the estate's only real case of the problem
// is the burst organ 1b was designed on. The file is kept as the record of the search.
//
//   node tools/nodes-burst.mjs --select      apply the rule now, write data/nodes-burst.json (heads pinned)
//   node tools/nodes-burst.mjs --check       re-derive from GitHub at the pinned commits: byte-identical or exit 1
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseLog, splitFit } from '../src/streams.mjs';
import { peaks } from '../src/regulator.mjs';

export const MIN_ACTIONS = 20, WANT = 10;
const SELF = 'watch-dream-remember';
const HIDDEN = new Set(['a7c64b920e5c176dffd2e2cc41210fc741c973133f3696809c058e614b6fafe4']);
const ROOT = new URL('../', import.meta.url);
const OUT = new URL('data/nodes-burst.json', ROOT);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
const LOG = ['log', '--reverse', '--no-renames', '--format=@%ct', '--name-only'];
const sha = (s) => createHash('sha256').update(s).digest('hex');

function read(name, ref) {
  const dir = join(tmpdir(), 'wdr-burst', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'fetch', '-q', '--filter=blob:none', `https://github.com/sjgant80-hub/${name}.git`, ref);
  const commit = git(dir, 'rev-parse', 'FETCH_HEAD').trim();
  const text = git(dir, ...LOG, commit);
  rmSync(dir, { recursive: true, force: true });
  return { commit, text };
}

/** GitHub's commit count on the default branch (an upper bound on actions: a commit touching no file is no action). */
function commits(name) {
  try {
    const head = execFileSync('gh', ['api', '-i', `repos/sjgant80-hub/${name}/commits?per_page=1`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = head.match(/[?&]page=(\d+)>; rel="last"/);
    return m ? Number(m[1]) : 1;
  } catch { return 0; }   // an empty repository
}

/** Organ 1's envelope from FIT, and the held-out hour and day counts against it (counting only). */
export function overrun(actions) {
  const { fit, held } = splitFit(actions, 0.6);
  const f = peaks(fit), h = peaks(held);
  const perHour = Math.max(6, 2 * f.hour), perDay = Math.max(20, 2 * f.day);
  return { perHour, perDay, heldHour: h.hour, heldDay: h.day, over: h.hour > perHour || h.day > perDay };
}

const doc = (nodes, rule) => ({ kind: 'watch-dream-remember.nodes', v: 1, burst: true, rule, note: 'Each node is a public estate build; each action one commit: [committer time ms, the area it touched most, files touched]. Nothing else is kept.', nodes });
const text = (d) => JSON.stringify(d, null, 0).replace(/\],\[/g, '],\n[') + '\n';
const used = () => ['data/nodes.json', 'data/nodes-fresh.json'].flatMap((p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8')).nodes.map((n) => n.name));

const cmd = process.argv[2];
if (cmd === '--select') {
  const known = new Set([...used(), SELF]);
  const list = JSON.parse(execFileSync('gh', ['repo', 'list', 'sjgant80-hub', '--limit', '4000', '--json', 'name,pushedAt,isFork,isPrivate,isArchived'], { encoding: 'utf8', maxBuffer: 1 << 26 }))
    .filter((r) => !r.isFork && !r.isPrivate && !r.isArchived && !known.has(r.name) && !HIDDEN.has(sha(r.name)))
    .sort((a, b) => (a.pushedAt < b.pushedAt ? 1 : a.pushedAt > b.pushedAt ? -1 : a.name < b.name ? -1 : 1));
  const nodes = [], tally = { fewCommits: 0, fewActions: 0, noOverrun: [] };
  for (const r of list) {
    if (nodes.length >= WANT) break;
    if (commits(r.name) < MIN_ACTIONS) { tally.fewCommits++; continue; }
    const { commit, text: log } = read(r.name, 'HEAD');
    const actions = parseLog(log);
    if (actions.length < MIN_ACTIONS) { tally.fewActions++; continue; }
    const o = overrun(actions);
    if (!o.over) { tally.noOverrun.push(r.name); continue; }
    nodes.push({ name: r.name, repo: `sjgant80-hub/${r.name}`, commit, pushedAt: r.pushedAt, envelope: o, actions: actions.map((a) => [a.t, a.area, a.files]) });
    console.error(`  ✓ ${r.name.padEnd(26)} ${String(actions.length).padStart(5)} actions · held hour ${o.heldHour}/${o.perHour}, day ${o.heldDay}/${o.perDay}`);
  }
  writeFileSync(OUT, text(doc(nodes, { selected: new Date().toISOString().slice(0, 10), minActions: MIN_ACTIONS, skipped: { fewerThan20Commits: tally.fewCommits, fewerThan20Actions: tally.fewActions, noHeldOverrun: tally.noOverrun } })));
  console.error(`✓ ${nodes.length} burst nodes → data/nodes-burst.json (skipped: ${tally.fewCommits} under 20 commits, ${tally.fewActions} under 20 actions, ${tally.noOverrun.length} with no held-out overrun)`);
} else if (cmd === '--check') {
  if (!existsSync(OUT)) { console.error('✗ data/nodes-burst.json is missing'); process.exit(1); }
  const old = JSON.parse(readFileSync(OUT, 'utf8'));
  const nodes = old.nodes.map((n) => { const actions = parseLog(read(n.name, n.commit).text); return { ...n, envelope: overrun(actions), actions: actions.map((a) => [a.t, a.area, a.files]) }; });
  if (text(doc(nodes, old.rule)) !== readFileSync(OUT, 'utf8')) { console.error('✗ data/nodes-burst.json does not re-derive from GitHub at the pinned commits'); process.exit(1); }
  console.error('✓ data/nodes-burst.json re-derives byte for byte from the pinned commits on GitHub');
} else if (cmd) { console.error('nodes-burst — --select | --check'); process.exit(2); }
