// The page itself is gated: its script parses, every element it reaches for exists, nothing is duplicated, every section a
// stranger needs is there, the credits are whole, and no price of ours appears anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  for (const s of ['overview', 'start', 'watch', 'dream', 'remember', 'how', 'blueprint', 'business', 'case', 'paper', 'receipts', 'faq']) assert.match(html, new RegExp(`<section id="${s}"`), s);
  for (const h of ['Start here', 'How it works', 'Blueprint', 'For your business', 'Roll-out', 'Security, data protection, compliance', 'Ownership, support, exit', 'Risks, answered straight', 'The case for the board', 'White paper']) assert.ok(html.includes(h), h);
  for (const r of ['CEO', 'CFO', 'COO', 'CTO / CISO']) assert.ok(app.includes(`['${r}'`), r);
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
