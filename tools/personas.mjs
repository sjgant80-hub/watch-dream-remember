#!/usr/bin/env node
// tools/personas.mjs — the prospective-client walkthrough, on the LOCAL model (qwen2.5:7b): five buyer personas read the
// page's rendered text cold and list every confusion, unanswered objection and unbacked claim. Sovereign: nothing leaves.
//   node tools/personas.mjs <page-text.txt> [out.json]
import { readFileSync, writeFileSync } from 'node:fs';

const [, , textFile, outFile = 'data/personas-qwen7b.json'] = process.argv;
const page = readFileSync(textFile, 'utf8');
const MODEL = 'qwen2.5:7b';
export const PERSONAS = [
  ['CFO', 'the chief financial officer of a 200-person UK services firm that already runs a handful of AI agents. You care about cost, savings you can defend to the board, and anything that looks like a hidden bill.'],
  ['CTO / CISO', 'the chief technology and security officer of the same firm. You care about least privilege, what can go wrong, data protection, audit, and whether the measurements are honest.'],
  ['COO', 'the chief operating officer. You care about what changes for your people day to day, how the roll-out works, and what happens when it breaks.'],
  ['Owner-manager', 'the owner of a 15-person business with no technical staff. You care whether you can understand it, what it does for you, and how to start.'],
  ['Procurement', 'the procurement lead. You care who the supplier is, the licence, support terms, exit, references, and every claim the contract would rely on.'],
];

/** Streamed, so a long read of the page on a CPU never trips a header timeout. */
async function ask(prompt) {
  const r = await fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: MODEL, prompt, stream: true, options: { temperature: 0.2, seed: 7, num_ctx: 12288, num_predict: 700 } }) });
  const dec = new TextDecoder();
  let buf = '', out = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (line) out += JSON.parse(line).response || ''; }
  }
  return out;
}
const save = (results) => writeFileSync(outFile, JSON.stringify({ kind: 'watch-dream-remember.personas', model: MODEL, when: new Date().toISOString(), pageChars: page.length, results }, null, 1) + '\n');

const results = [];
for (const [role, who] of PERSONAS) {
  const prompt = `You are ${who}\n\nYou have opened this product page cold. Its full text follows between the lines.\n----\n${page}\n----\n\nAs that buyer, list in plain bullet points: (1) anything you could not understand or had to guess; (2) objections the page does not answer; (3) claims you do not believe or that have no evidence on the page; (4) what you would need before you said yes. Be specific and quote the page where you can. At most 12 bullets.`;
  const t0 = Date.now();
  const reply = await ask(prompt);
  results.push({ role, seconds: Math.round((Date.now() - t0) / 1000), reply });
  process.stderr.write(`  ${role}: ${Math.round((Date.now() - t0) / 1000)} s\n`);
  save(results);
}
console.error('✓ ' + results.length + ' personas → ' + outFile);
