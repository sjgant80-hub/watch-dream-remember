import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, areaOf, actionOf, parseLog, splitFit } from '../src/streams.mjs';

test('areaOf: each rule, in order', () => {
  assert.equal(areaOf('.github/workflows/gate.yml'), 'ci');
  assert.equal(areaOf('vendor/fall-kit/core/identity.mjs'), 'vendor');
  assert.equal(areaOf('core/vendor/light/sha256.mjs'), 'vendor');
  assert.equal(areaOf('test/regulator.test.mjs'), 'test');
  assert.equal(areaOf('tests/x.js'), 'test');
  assert.equal(areaOf('core/node.test.mjs'), 'test');
  assert.equal(areaOf('src/a.spec.ts'), 'test');
  assert.equal(areaOf('pkg/test/x.mjs'), 'test');
  assert.equal(areaOf('tools/nodes.mjs'), 'tools');
  assert.equal(areaOf('scripts/run.sh'), 'tools');
  assert.equal(areaOf('bin/cli'), 'tools');
  assert.equal(areaOf('data/x.bin'), 'data');
  assert.equal(areaOf('receipts/r.txt'), 'data');
  assert.equal(areaOf('records/a.md'), 'data');
  assert.equal(areaOf('package.json'), 'data');
  assert.equal(areaOf('x.jsonl'), 'data');
  assert.equal(areaOf('y.csv'), 'data');
  assert.equal(areaOf('z.tsv'), 'data');
  assert.equal(areaOf('index.html'), 'page');
  assert.equal(areaOf('a.css'), 'page');
  assert.equal(areaOf('i.svg'), 'page');
  assert.equal(areaOf('i.png'), 'page');
  assert.equal(areaOf('i.jpg'), 'page');
  assert.equal(areaOf('i.jpeg'), 'page');
  assert.equal(areaOf('i.webp'), 'page');
  assert.equal(areaOf('favicon.ico'), 'page');
  assert.equal(areaOf('page/a.mjs'), 'page');
  assert.equal(areaOf('ui/b.mjs'), 'page');
  assert.equal(areaOf('site/c'), 'page');
  assert.equal(areaOf('assets/d'), 'page');
  assert.equal(areaOf('README.md'), 'docs');
  assert.equal(areaOf('llms.txt'), 'docs');
  assert.equal(areaOf('sitemap.xml'), 'docs');
  assert.equal(areaOf('a.yml'), 'docs');
  assert.equal(areaOf('a.yaml'), 'docs');
  assert.equal(areaOf('LICENSE'), 'docs');
  assert.equal(areaOf('NOTICE'), 'docs');
  assert.equal(areaOf('sub/CITATION.cff'), 'docs');
  assert.equal(areaOf('src/a.mjs'), 'src');
  assert.equal(areaOf('run.js'), 'src');
  assert.equal(areaOf('x.cjs'), 'src');
  assert.equal(areaOf('x.ts'), 'src');
  assert.equal(areaOf('x.py'), 'src');
  assert.equal(areaOf('x.rs'), 'src');
  assert.equal(areaOf('x.go'), 'src');
  assert.equal(areaOf('x.sh'), 'src');
  assert.equal(areaOf('x.ps1'), 'src');
  assert.equal(areaOf('x.wat'), 'src');
  assert.equal(areaOf('x.wasm'), 'src');
  assert.equal(areaOf('Makefile'), 'other');
  assert.equal(areaOf('mytests/x.bin'), 'other');
  assert.equal(areaOf('xvendor/a.bin'), 'other');
  assert.equal(areaOf('a.github/x'), 'other');
  assert.equal(areaOf('x/tools/y.bin'), 'other');
  assert.equal(areaOf('mydata/y.bin'), 'other');
  assert.equal(areaOf('x/page/y.bin'), 'other');
  assert.equal(areaOf('NOTICES/x.bin'), 'other');
  assert.equal(areaOf('x.mdx'), 'other');
  assert.equal(areaOf('x.mjsx'), 'other');
  assert.equal(areaOf('x.htmlx'), 'other');
  assert.equal(areaOf('x.jsonx'), 'other');
  assert.equal(areaOf('x.test.'), 'other');
  assert.equal(areaOf('  src/a.mjs  '), 'src');
  assert.equal(areaOf(''), 'other');
  assert.equal(areaOf('   '), 'other');
  assert.equal(areaOf(null), 'other');
  assert.equal(areaOf(42), 'other');
});

test('AREAS is the fixed alphabet', () => {
  assert.deepEqual(AREAS, ['src', 'test', 'tools', 'data', 'page', 'docs', 'ci', 'vendor', 'other']);
  assert.ok(Object.isFrozen(AREAS));
});

test('actionOf: the area with most files, ties to the earlier area', () => {
  assert.deepEqual(actionOf(1000, ['src/a.mjs', 'test/a.test.mjs', 'test/b.test.mjs']), { t: 1000, area: 'test', files: 3 });
  assert.deepEqual(actionOf(5, ['README.md', 'src/a.mjs']), { t: 5, area: 'src', files: 2 });
  assert.deepEqual(actionOf(5, ['README.md', 'data/x.json']), { t: 5, area: 'data', files: 2 });
  assert.deepEqual(actionOf(5, ['other.bin']), { t: 5, area: 'other', files: 1 });
  assert.deepEqual(actionOf(0, ['x.md', ' ', '', 3]), { t: 0, area: 'docs', files: 1 });
  assert.equal(actionOf(5, []), null);
  assert.equal(actionOf(5, ['  ']), null);
  assert.equal(actionOf(NaN, ['a.mjs']), null);
  assert.equal(actionOf(5, null), null);
  assert.equal(actionOf(Infinity, ['a.mjs']), null);
});

test('parseLog: commits, times in ms, empty commits dropped, stable order by time', () => {
  const text = '@100\n\nsrc/a.mjs\ntest/a.test.mjs\n\n@50\nREADME.md\r\n@70\n\n@100\ndata/x.json\n';
  assert.deepEqual(parseLog(text), [
    { t: 50000, area: 'docs', files: 1 },
    { t: 100000, area: 'src', files: 2 },
    { t: 100000, area: 'data', files: 1 },
  ]);
  assert.deepEqual(parseLog('stray line\n@3\nx.mjs'), [{ t: 3000, area: 'src', files: 1 }]);
  assert.deepEqual(parseLog('@3x\nx.mjs'), []);
  assert.deepEqual(parseLog(''), []);
  assert.deepEqual(parseLog(undefined), []);
  assert.deepEqual(parseLog('@1\n'), []);
  assert.deepEqual(parseLog('  @2  \n  a.py  '), [{ t: 2000, area: 'src', files: 1 }]);
});

test('splitFit: first share is FIT, at least one each side when there are two or more', () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual(splitFit(a, 0.6), { fit: [1, 2, 3, 4, 5, 6], held: [7, 8, 9, 10] });
  assert.deepEqual(splitFit([1, 2, 3, 4, 5, 6, 7], 0.6), { fit: [1, 2, 3, 4], held: [5, 6, 7] });
  assert.deepEqual(splitFit([1, 2], 0.1), { fit: [1], held: [2] });
  assert.deepEqual(splitFit([1, 2], 1), { fit: [1], held: [2] });
  assert.deepEqual(splitFit([1, 2, 3], 2), { fit: [1, 2], held: [3] });
  assert.deepEqual(splitFit([1, 2, 3], -1), { fit: [1], held: [2, 3] });
  assert.deepEqual(splitFit([1], 0.6), { fit: [], held: [1] });
  assert.deepEqual(splitFit([], 0.6), { fit: [], held: [] });
  assert.deepEqual(splitFit(null, 0.6), { fit: [], held: [] });
  assert.deepEqual(splitFit([1, 2, 3, 4, 5], NaN), { fit: [1, 2, 3], held: [4, 5] });
  assert.deepEqual(splitFit([1, 2, 3, 4, 5], 'x'), { fit: [1, 2, 3], held: [4, 5] });
});
