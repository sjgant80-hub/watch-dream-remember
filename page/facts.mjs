// page/facts.mjs — the counts the page's prose states, read from the receipts and data files themselves. index.html
// carries each one as <span data-r="name">fallback</span>; page/app.mjs writes these values over the fallbacks once the
// receipts load, and test/page.test.mjs computes them from the same files on disk and checks every fallback equals its
// value here, so a count in the prose cannot drift from the receipt that holds it (page/constants.mjs does the same for
// the kernels' constants).
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** a small count as a word, the way the prose writes it; anything larger in figures */
export const word = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : Number(n).toLocaleString('en-GB'));
export const capital = (s) => { const t = String(s); return t.charAt(0).toUpperCase() + t.slice(1); };
/** ['a', 'b', 'c'] → 'a, b and c' */
export const and = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** the ids of a receipt's claims that failed, in the receipt's order */
export const failedIn = (o) => Object.entries(o.claims).filter(([, c]) => !c.pass).map(([id]) => id);
/** the organs that tried to fix M2, each sealed as a new step after organ 3 */
export const M2_FIXES = Object.freeze(['3b', '3c', '3d']);

/** M2's sealed bar, read from organ 3's preregistration: the least gain a child must show, and how many of how many must */
export function m2BarOf(p3) {
  const t = p3.claims.find((x) => x.id === 'M2').pass, g = t.match(/at least ([\d.]+) nats/), k = t.match(/at least (\d+) of the (\d+)/);
  return { gain: +g[1], need: +k[1], of: +k[2] };
}
/** R3's sealed bars, read from organ 1's preregistration: p99 per visit, and how many times slower the device it is scaled to */
export function r3BarOf(p1) {
  const t = p1.claims.find((x) => x.id === 'R3').pass;
  return { p99: +t.match(/p99 ≤ ([\d.]+) ms/)[1], slower: +t.match(/(\d+) times slower/)[1] };
}

/**
 * R holds the receipts as the page loads them: o1, o1b, o2, o3, o3b, o3c, o3d (data/organN-run.json), p1 and p3
 * (their preregistrations), and nodes (data/nodes.json).
 */
export function factsOf(R) {
  const first = ['o1', 'o2', 'o3'].flatMap((k) => failedIn(R[k]));
  const datasets = R.o3.claims.M2.children.length;
  return {
    builds: word(R.nodes.nodes.length),
    unseen: word(Object.keys(R.o1b.claims.B2.perNode).length),
    highStakes: word(R.p1.data.highStakes.length),
    nights: String(R.o2.arms.daydream.nights.length),
    datasets: word(datasets),
    datasetsN: String(datasets),
    families: word(R.o3d.families.length),
    firstFailed: capital(word(first.length)),
    firstFailedIds: and(first),
    m2Fixes: word(M2_FIXES.length),
    m2Ways: word(1 + M2_FIXES.length),
    c3Pass: String(R.o3c.children.filter((c) => c.D1.pass).length),
  };
}

export default { word, capital, and, failedIn, M2_FIXES, m2BarOf, r3BarOf, factsOf };
