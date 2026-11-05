// The page itself is gated: its script parses, every element it reaches for exists, nothing is duplicated, every section a
// stranger needs is there, the credits are whole, and no price of ours appears anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { K } from '../page/constants.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const app = readFileSync(new URL('page/app.mjs', root), 'utf8');

test('the page script parses', () => {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('page/app.mjs', root))]);
});

test('every id the script reaches for exists, once', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  const wanted = new Set([...app.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]));
  for (const id of wanted) assert.ok(ids.includes(id), `missing #${id}`);
  for (const sel of [...app.matchAll(/querySelector(?:All)?\('#([a-z0-9-]+)/g)].map((m) => m[1])) assert.ok(ids.includes(sel), `missing #${sel}`);
});

test('every module the script imports exists', () => {
  for (const m of app.matchAll(/from '(\.\.?\/[^']+)'/g)) readFileSync(new URL(m[1], new URL('page/app.mjs', root)));
});

test('the page explains itself and sells itself', () => {
  for (const s of ['overview', 'start', 'watch', 'yours', 'dream', 'remember', 'how', 'blueprint', 'business', 'case', 'paper', 'receipts', 'faq']) {
    assert.match(html, new RegExp(`<section id="${s}"`), s);
    assert.ok(html.includes(`<a href="#${s}">`), `the nav links #${s}`);
  }
  for (const h of ['Start here', 'How it works', 'Blueprint', 'For your business', 'What it needs from your systems', 'Roll-out', 'Security, data protection, compliance', 'Ownership, support, exit', 'For procurement', 'Risks, answered straight', 'The case for the board', 'White paper']) assert.ok(html.includes(h), h);
  for (const r of ['CEO', 'CFO', 'COO', 'CTO / CISO', 'Procurement and legal']) assert.ok(app.includes(`['${r}'`), r);
});

test('credits whole: Gary W. Floyd with division and company, the Konomi line, the supplier', () => {
  for (const t of [html, readFileSync(new URL('README.md', root), 'utf8'), readFileSync(new URL('NOTICE', root), 'utf8')]) {
    assert.ok(t.includes('Gary W. Floyd'), 'Gary W. Floyd');
    assert.ok(t.includes('Lumiea Systems Research Division') && t.includes('ThunderStruck Service LLC'), 'division and company');
    assert.ok(!t.includes('ThunderStruck Services'), 'Service, singular');
    assert.ok(/Powered by the Konomi architecture, created by Thomas Frumkin/.test(t), 'Konomi credit');
  }
  assert.ok(html.includes('https://www.ai-nativesolutions.com'));
  assert.ok(/designed from (that|his) description only/i.test(html));
});

test('no price of ours, and none of the private cosmology', () => {
  for (const t of [html, app]) {
    assert.ok(!/\/mo\b|per seat|per month|pricing|priceCurrency|"@type":\s*"Offer"/i.test(t), 'price words');
    assert.ok(!/[φκ]|\+1\b/.test(t), 'cosmology');
  }
  assert.ok(!/£\s?\d/.test(html), 'a pound figure typed into the page');
});

test('every kernel is on the blueprint and in the CI mutation gate, and the gate is witness pinned at v0.6', () => {
  const kernels = readdirSync(new URL('src/', root)).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
  const gate = readFileSync(new URL('.github/workflows/gate.yml', root), 'utf8');
  const matrix = (gate.match(/kernel: \[([^\]]+)\]/) || [])[1].split(',').map((x) => x.trim()).sort();
  assert.deepEqual(matrix, kernels, 'the witness matrix is every kernel in src/');
  for (const k of kernels) assert.ok(app.includes(`'src/${k}.mjs'`), `blueprint row for src/${k}.mjs`);
  assert.match(gate, /git clone --depth 1 --branch v0\.6 https:\/\/github\.com\/sjgant80-hub\/witness\.git witness/);
});

test('no sourced figure is typed into the page: the cost case reads every one from the vendored basis', () => {
  const basis = JSON.parse(readFileSync(new URL('vendor/sovereign-enterprise/data/basis.json', root), 'utf8'));
  for (const k of ['seniorSalary', 'employerNiThreshold', 'pensionQeLower', 'pensionQeUpper', 'cpi', 'seat.copilot', 'electricityPencePerKwh', 'hoursPerYear']) {
    const v = basis[k].value, forms = [String(v), v.toLocaleString('en-GB'), k === 'cpi' ? `${(v * 100).toFixed(1)}%` : null].filter(Boolean);
    for (const t of [html, app]) for (const f of forms) assert.ok(!new RegExp(`(^|[^0-9.,])${f.replace(/[.]/g, '\.')}([^0-9]|$)`).test(t), `${k} typed as ${f}`);
  }
  assert.ok(!/\b15 W\b/.test(html + app), 'the laptop draw typed in');
  for (const f of [String(basis.hub.priceIncVat), basis.hub.priceIncVat.toLocaleString('en-GB'), `${basis.hub.watts} W`]) assert.ok(!(html + app).includes(f), `the machine typed in as ${f}`);
  assert.ok(app.includes('sourcesOf(basis)'), 'every figure cited from the basis');
});

test('every constant the prose states is the kernel’s own: each data-k fallback equals page/constants.mjs', () => {
  const spans = [...html.matchAll(/<span data-k="([A-Za-z]+)">([^<]*)<\/span>/g)];
  assert.ok(spans.length >= 20, `${spans.length} constants in the prose`);
  for (const [, k, text] of spans) assert.equal(text, K[k], `data-k="${k}"`);
  assert.equal([...html.matchAll(/data-k="/g)].length, spans.length, 'every data-k is a plain span');
  assert.ok(app.includes("document.querySelectorAll('[data-k]')"), 'the page writes them from the kernels');
});

test('the page can only talk to its own site: a strict Content Security Policy, its one inline script pinned by hash', () => {
  const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/) || [])[1];
  assert.ok(csp, 'a CSP');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(inline.length, 1);
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update(inline[0]).digest('base64')}'`), 'the inline script hash');
  for (const d of ["default-src 'none'", "connect-src 'self'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(d), d);
  assert.ok(!/https?:|\*|unsafe-eval/.test(csp), 'no other origin, no wildcard, no eval');
  assert.ok(!/\son[a-z]+="/.test(html), 'no inline event handlers');
  assert.ok(!/<script[^>]+src="https?:/.test(html), 'no script from elsewhere');
});

test('every vendored file is its pinned bytes', () => {
  const v = JSON.parse(readFileSync(new URL('vendor/SOURCES.json', root), 'utf8'));
  const d = JSON.parse(readFileSync(new URL('vendor/dex-frontier/SOURCES.json', root), 'utf8'));
  const files = [...v.files.map((f) => [f.path, f.sha256]), ...d.loaders.map((f) => ['vendor/dex-frontier/' + f.path, f.sha256])];
  assert.ok(files.length >= 10);
  for (const [p, h] of files) assert.equal(createHash('sha256').update(readFileSync(new URL(p, root))).digest('hex'), h, p);
});

test('every data file the page fetches is in the repository', () => {
  const files = [...new Set([...app.matchAll(/'((?:data|vendor)\/[^'$`]+\.json)'/g)].map((m) => m[1]))];
  assert.ok(files.includes('data/witness-ci.json') && files.includes('vendor/sovereign-enterprise/data/basis.json'));
  for (const f of files) readFileSync(new URL(f, root));
});

test('every count the prose states is the receipts’ own: each data-r fallback equals page/facts.mjs on the files themselves', async () => {
  const { factsOf } = await import('../page/facts.mjs');
  const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
  const R = { nodes: read('data/nodes.json') };
  for (const k of ['1', '1b', '2', '3', '3b', '3c', '3d']) R['o' + k] = read(`data/organ${k}-run.json`);
  for (const k of ['1', '3']) R['p' + k] = read(`data/organ${k}-prereg.json`);
  const F = factsOf(R);
  const spans = [...html.matchAll(/<span data-r="([A-Za-z0-9]+)">([^<]*)<\/span>/g)];
  assert.ok(spans.length >= 15, `${spans.length} counts in the prose`);
  for (const [, k, text] of spans) assert.equal(text, F[k], `data-r="${k}"`);
  assert.equal([...html.matchAll(/data-r="/g)].length, spans.length, 'every data-r is a plain span');
  assert.ok(app.includes("document.querySelectorAll('[data-r]')"), 'the page writes them from the receipts');
  // the first measurement's failures, as the prose names them
  assert.equal(F.firstFailedIds, 'R1f, R3 and M2');
});

test('no count a receipt or a sealed bar holds is typed into the page script', () => {
  const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
  const o1 = read('data/organ1-run.json'), o2 = read('data/organ2-run.json');
  const visits = +o1.claims.R1r.measured.match(/^(\d+) records/)[1], jobs = +o2.claims.D2.measured.match(/^(\d+) real jobs/)[1];
  for (const f of [visits.toLocaleString('en-GB'), String(visits), `${jobs} jobs`, `of ${o1.trials.length} faults`, `the ${o1.trials.length} trials`,
    'of 5 children', 'of 5 better', 'of 10 parents', 'bar of 4', 'against 1 ms', '× 50', '50 times slower', 'batches of 200', '15-minute', 'two hours after',
    'two new pauses in six hours', '0.001 nats', '≥ 0.001', 'on ten builds', 'the ten builds', 'ten never seen', 'five datasets', 'five fresh', 'five public', 'promote(daylog, 10)']) {
    assert.ok(!app.includes(f), `typed into page/app.mjs: "${f}"`);
  }
});

test('every sealed bar and receipt line the page reads by pattern is there to read', async () => {
  const { m2BarOf, r3BarOf } = await import('../page/facts.mjs');
  const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
  const p1 = read('data/organ1-prereg.json'), p3 = read('data/organ3-prereg.json'), o1 = read('data/organ1-run.json'), o2 = read('data/organ2-run.json');
  assert.deepEqual(m2BarOf(p3), { gain: 0.001, need: 4, of: 5 }, 'M2: at least 0.001 nats, for at least 4 of the 5');
  assert.deepEqual(r3BarOf(p1), { p99: 1, slower: 50 }, 'R3: p99 ≤ 1 ms, a device 50 times slower');
  for (const [text, re] of [[o1.claims.R1r.measured, /^(\d+) records/], [o1.claims.R4.measured, /'regulator-drift' within (\d+ h)/],
    [o2.claims.D2.measured, /^(\d+) real jobs/], [o2.claims.D2.measured, /dispatch max ([\d.]+) ms/],
    [o2.claims.D3.measured, /(\d+) to anything else/], [o2.claims.D3.measured, /(\d+) cortex/], [o2.claims.D3.measured, /(\d+) actions/]]) {
    assert.match(text, re);
    assert.ok(app.includes(re.source), `the page reads ${re}`);
  }
});
