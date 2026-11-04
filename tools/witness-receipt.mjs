// tools/witness-receipt.mjs — the mutation gate's reports from one CI run on GitHub's runner, kept as data/witness-ci.json so the
// page's blueprint can show each kernel's tests and gate result; and the check CI runs that the receipt still describes the
// files in the repository, byte for byte. Nothing in it is typed: every count comes from witness's own JSON report.
//
//   node tools/witness-receipt.mjs --from <dir> --meta <run.json> --witness <commit>
//        <dir>      the run's artifacts (gh run download <id> -D <dir>): witness-<kernel>/<kernel>.out, each witness's report
//        <run.json> gh run view <id> --json databaseId,url,headSha,conclusion,createdAt,event,jobs
//   A kernel change makes the push run's receipt check fail (the receipt describes the old code), so the receipt is refreshed
//   from a REFRESH run at the new code: gh workflow run gate.yml --ref <branch> -f refresh=true runs every gate but that check.
//        <commit>   the witness commit the run cloned (the v0.6 tag), as its log prints it
//   node tools/witness-receipt.mjs --check
//        every kernel in src/ is in the receipt, every one clean and not capped, the run succeeded, and every kernel, its test
//        file and the baseline still hash to what the run gated. A kernel or test changed since: refresh from a newer run.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'data/witness-ci.json');
const TAG = 'v0.6';
const sha = (p) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const declared = (p) => (readFileSync(join(ROOT, p), 'utf8').match(/^test\(/gm) || []).length;
const kernels = () => readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
const arg = (k) => { const i = process.argv.indexOf(k); return i === -1 ? null : process.argv[i + 1]; };
const fail = (m) => { console.error('✗ ' + m); process.exit(1); };

function build() {
  const from = arg('--from'), metaPath = arg('--meta'), witness = arg('--witness');
  if (!from || !metaPath || !/^[0-9a-f]{40}$/.test(witness || '')) fail('usage: --from <dir> --meta <run.json> --witness <40-hex commit>');
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const head = execHead();
  if (meta.headSha !== head) fail(`the run gated ${meta.headSha}, but HEAD is ${head}: build the receipt at the commit the run gated`);
  const jobs = Object.fromEntries((meta.jobs || []).map((j) => [j.name, j.conclusion]));
  const rows = kernels().map((k) => {
    const p = join(from, `witness-${k}`, `${k}.out`);
    if (!existsSync(p)) fail(`no witness report for ${k} in ${from}`);
    const r = JSON.parse(readFileSync(p, 'utf8'));
    const job = Object.keys(jobs).find((n) => n.endsWith(`— ${k}`));
    return {
      kernel: k, src: `src/${k}.mjs`, test: `test/${k}.test.mjs`, tests: declared(`test/${k}.test.mjs`),
      total: r.total, killed: r.killed, ignored: r.ignored.length, survived: r.survived.length, capped: r.capped, clean: r.clean,
      job: job ? jobs[job] : null, srcSha256: sha(`src/${k}.mjs`), testSha256: sha(`test/${k}.test.mjs`),
    };
  });
  const claims = Object.keys(jobs).find((n) => n.startsWith('unit suites'));
  const receipt = {
    kind: 'watch-dream-remember.witness-ci', v: 1,
    note: 'Each kernel\'s mutation gate as GitHub\'s runner reported it (witness, pinned at its tag), with the hashes of the files it gated. CI re-checks the hashes on every push (tools/witness-receipt.mjs --check), so the page never shows a gate result for code that has since changed.',
    run: { id: meta.databaseId, url: meta.url, headSha: meta.headSha, conclusion: meta.conclusion, createdAt: meta.createdAt, event: meta.event ?? null, claimsJob: claims ? jobs[claims] : null },
    witness: { repo: 'sjgant80-hub/witness', tag: TAG, commit: witness, cap: 1000 },
    baseline: { path: 'src/witness.baseline.json', sha256: sha('src/witness.baseline.json'), entries: JSON.parse(readFileSync(join(ROOT, 'src/witness.baseline.json'), 'utf8')).length },
    kernels: rows,
  };
  writeFileSync(OUT, JSON.stringify(receipt, null, 1) + '\n');
  console.log(`✓ data/witness-ci.json: ${rows.length} kernels from run ${meta.databaseId} at ${meta.headSha.slice(0, 7)}; ${rows.filter((x) => x.clean).length} clean`);
}

function execHead() {
  const git = readFileSync(join(ROOT, '.git/HEAD'), 'utf8').trim();
  if (!git.startsWith('ref: ')) return git;
  const ref = git.slice(5);
  const loose = join(ROOT, '.git', ref);
  if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
  const packed = readFileSync(join(ROOT, '.git/packed-refs'), 'utf8').split('\n').find((l) => l.endsWith(' ' + ref));
  return packed ? packed.split(' ')[0] : null;
}

function check() {
  if (!existsSync(OUT)) fail('data/witness-ci.json is missing');
  const r = JSON.parse(readFileSync(OUT, 'utf8'));
  const gate = readFileSync(join(ROOT, '.github/workflows/gate.yml'), 'utf8');
  if (r.witness.tag !== TAG || !gate.includes(`--branch ${TAG} https://github.com/sjgant80-hub/witness.git`)) fail(`witness is not pinned at ${TAG} in both the receipt and CI`);
  if (r.run.conclusion !== 'success') fail(`the receipt's run ${r.run.id} did not succeed (${r.run.conclusion})`);
  const ks = kernels();
  const have = r.kernels.map((x) => x.kernel).sort();
  if (JSON.stringify(have) !== JSON.stringify(ks)) fail(`the receipt covers [${have}] but src/ holds [${ks}]`);
  const stale = [];
  for (const x of r.kernels) {
    if (!(x.clean === true && x.capped === false && x.survived === 0 && x.total > 0 && x.killed + x.ignored === x.total && x.job === 'success')) fail(`${x.kernel}: the receipt does not show a clean, uncapped, successful gate`);
    if (sha(x.src) !== x.srcSha256) stale.push(x.src);
    if (sha(x.test) !== x.testSha256 || declared(x.test) !== x.tests) stale.push(x.test);
  }
  if (sha(r.baseline.path) !== r.baseline.sha256) stale.push(r.baseline.path);
  if (stale.length) fail(`changed since run ${r.run.id} gated them: ${stale.join(', ')}. Refresh data/witness-ci.json from a CI run of the new code (see the header of this file).`);
  console.log(`✓ data/witness-ci.json describes the code: ${r.kernels.length} kernels clean under witness ${r.witness.tag} in run ${r.run.id}, files unchanged since`);
}

if (process.argv.includes('--check')) check(); else build();
