// tools/datasets.mjs — the five real datasets as a lab (src/lab.mjs), read through dex-frontier's vendored loaders from
// .data/ (node tools/data.mjs --fetch). WDR_SYNTH=1 swaps in synthetic datasets of the same shape: a dry run of the
// tooling that never reads the real data. Shared by the organ 2 and organ 3 measurements; no top-level work.
import { readFileSync } from 'node:fs';
import { loadBank, loadAdult } from '../vendor/dex-frontier/src/fresh.mjs';
import { loadCredit } from '../vendor/dex-frontier/src/fresh2.mjs';
import { loadCoupon } from '../vendor/dex-frontier/src/fresh3.mjs';
import { loadShop } from '../vendor/dex-frontier/src/silos.mjs';
import { prepare } from '../src/lab.mjs';
import { mulberry32 } from '../src/dream.mjs';

const ROOT = new URL('../', import.meta.url);
const file = (p) => new URL(p, ROOT);

export function loadLab() {
  if (process.env.WDR_SYNTH) return synthLab();   // a dry run: every input synthetic
  const t = (p) => readFileSync(file('.data/' + p), 'utf8');
  const ds = {
    shop: loadShop(t('data/online_shoppers_intention.csv')), bank: loadBank(t('data/bank-additional-full.csv')),
    adult: loadAdult(t('data/adult.data'), t('data/adult.test')), credit: loadCredit(t('data/credit-default.csv')), coupon: loadCoupon(t('data/in-vehicle-coupon-recommendation.csv')),
  };
  for (const [k, d] of Object.entries(ds)) if (!d.ok) throw new Error(k + ': ' + d.error);
  return prepare(ds);
}

/** Synthetic datasets with the loaders' shape (a dry run of the tooling never reads the real data). */
function synthLab() {
  const rng = mulberry32(7), ds = {};
  for (const name of ['shop', 'bank', 'adult', 'credit', 'coupon']) {
    const features = Array.from({ length: 8 }, (_, j) => name + '_f' + j), n = 3000;
    const cols = Object.fromEntries(features.map((f, j) => [f, Float64Array.from({ length: n }, () => (j % 3 === 0 ? Math.floor(rng() * 2) : j % 3 === 1 ? Math.exp(rng() * 4) : rng() * 10))]));
    const y = Uint8Array.from({ length: n }, (_, i) => (rng() < 1 / (1 + Math.exp(-(Math.log(cols[features[1]][i]) - 2 + (cols[features[2]][i] > 7 ? 1 : 0)))) ? 1 : 0));
    const idx = Array.from({ length: n }, (_, i) => i);
    ds[name] = { ok: true, name, title: name + ' (synthetic)', outcome: 'y', features, cols, y, fitRows: idx.slice(0, 1500), gateRows: idx.slice(1500, 2200), testRows: idx.slice(2200) };
  }
  return prepare(ds);
}

