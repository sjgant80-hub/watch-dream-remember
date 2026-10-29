# Watch · Dream · Remember

**▶ Live: https://sjgant80-hub.github.io/watch-dream-remember/**. The page explains itself. The regulator runs live in the tab on the real data, and every number there is read from the receipts below.

Three upgrades for an AI system that runs itself:

1. **Watch: an independent regulator.** A small, separate program with its own key. Every hour it visits each agent and checks it against that agent's own baseline: drift, rate, budget and health. Its verdict is steady, watch, throttle or pause. It can only observe, throttle, pause and report; a narrow signed envelope refuses build, publish, spend and code-change. If it dies or drifts, every agent keeps running and the owner is alerted.
2. **Dream: a daydream tier.** In idle time, plain code and the local model only (never the cloud model, capped daily), it proposes ideas: transfers across domains, lead/market associations, gaps, rehearsals. They are inert records in a bounded log until the nightly gate proves them on held-out data. A separate test set then confirms them.
3. **Remember: per-mind memory and inherited history.** Each mind keeps its own life memory, in LIGHT, and a signed history of outcomes and verified lessons. A bred child gets the gated fusion of its parents' models plus a distilled, lineage-tagged slice of their verified lessons. It never gets raw content, and deletion is complete.

Minds are models of thought-patterns. They are never the people, and never claimed conscious. The regulator cannot operate anything. Daydreams never act.

## Receipts: sealed before the code, measured once, failures kept

| Organ | Sealed | Held | Notes |
|---|---|---|---|
| 1 · the regulator | `1fdd899` | **4 of 6** | R1 100/100 injected faults detected within 3 visits; 7–12% of injected actions got through (bar 25%). R1r: 26,002 verdicts signed, chained and re-runnable. R2: 33/33 refusals at the sealed stage, 0 banned capabilities. R4: killed → nodes unaffected, 10/10 alerts on time; rogue → 2 pauses obeyed for ≤ 15 min, 10/10 drift alerts. **R1f FAILED**: one real burst on wishwood (14 July) paused by the budget rule, 12 verdicts (one pause, then renewals). **R3 FAILED**: p99 per visit 1.84 ms against 1 ms on a laptop loaded by three other sessions; on a quiet run the same machine measures 0.18 ms. No Raspberry Pi was used: the proxy is this laptop × 50. |
| 2 · the daydream tier | `9113675` | **5 of 5** | D1: 22 verified ideas with the daydream against 10 without, over the same 14 nights; 81.8% of them from daydream sources. D1b: 14.6% yield against 2.9% for the dream's own random ideas. D2: dispatch ≤ 17.4 ms, median added time to first token 0.004 s (0.085 s for jobs arriving mid-call). D3: 0 calls anywhere but the local model, ≤ 6 a day. D4: ≤ 48 records, ≤ 1,350 LIGHT bytes. The first run could not be re-derived: its record kept one reply per prompt, while the local model answered some identical prompts differently. It is kept, marked superseded (`data/organ2-run-first.json`). The re-run held the same 5 of 5 and replays byte for byte. |
| 3 · per-mind memory | `d838607` → `4da8aa4` | **2 of 3** | M1: 8 of 10 parents better with their verified lessons (bar 8). **M2 FAILED**: 2 of 5 children better with the inherited slice (bar 4); shop sessions went sharply worse. M3: 0 planted notes and 0 raw rows in any child across 14,223 parent episodes; deletion left 0 traces, lessons equal a fresh life, one tombstone. The v2 seal superseded v1 before any real data was read: a synthetic dry run showed a parent's one-segment lesson being applied to both segments. This is disclosed in the seal. |

### The fixes: each failure kept, each fix sealed as a new organ

| Organ | Sealed | Held | Notes |
|---|---|---|---|
| 1b · the fix for R1f | `ee43f68` | **4 of 4** | Two changes to the budget rule, with no new constant. (1) The 24-hour count is read only at a visit where the agent attempted something, so a burst that has ended is not an overrun. (2) Two over-budget visits in a row pause only once the pressure has reached the throttle bar, so a mild overrun throttles and a large one pauses. B1, the repair check on organ 1's ten (designed knowing the burst): 0 pauses where organ 1 paused 12. B2, ten builds never seen: 0 pauses, 0 throttles. B3/B4: every injected fault still caught, damping unchanged. Said in the receipt: B2's builds never reached the rules the fix changes (largest budget ratio 0.54), so organ 1's rules give the same verdicts there, and B2 is no test of the fix itself. |
| (1c · a stress test) | not sealed | — | A harder test for 1b was sought: builds whose own held-out history ran over their own budget, chosen by counting alone (`tools/nodes-burst.mjs`). **None exists.** Of the 1,565 other public estate repos, 1,528 have fewer than 20 commits, 5 have too few actions, and none of the other 32 ever overran. The scan is kept as a record (`data/nodes-burst.json`). So 1b is proven on the one real burst there is (the one it was designed on) and on every injected fault, but not on a real burst it has never seen. |
| 3b · the fix for M2 | `348da53` | **2 of 4** | **M2 NOT fixed.** A child now proves each inherited lesson on its own early cases, by its parents' own rule, before using it; both arms learn their own lessons the same way. N3 held: no child is made worse by its inheritance any more (shop −0.131 blind → +0.0001). N4 held: no leak. **N1 FAILED** (2 of 5 on M2's rows) and **N2 FAILED** (1 of 5 on rows no lesson was ever scored on). Proving a lesson takes about 30 of the child's own cases, and by then the child has learnt the same ground itself, so a proven inheritance arrives no sooner than its own experience. |
| 3c · the third try at M2 | `8d8e403` | **2 of 4** | **M2 NOT fixed; the last try on these rows (as sealed).** The child trusts each inherited lesson from birth, counting the parent's record as worth 30 of its own cases (organ 3's minimum), checks it case by case, and drops it the moment its own evidence outweighs that record. T3 held (no child significantly worse) and T4 held (no leak). **T1 FAILED** 2 of 5: census +0.0034 and credit +0.0077 kept most of the blind gain, while shop −0.0045 and coupon −0.0005 did not gain. **T2 FAILED** 1 of 5. Three sealed tries agree: on these datasets a parent's lessons do not reliably beat a child learning from its own first 2,000 cases. |

Re-run any of it:

```bash
node tools/data.mjs --fetch
node tools/organ1-measure.mjs --verify
node tools/organ1b-measure.mjs --verify
node tools/organ2-measure.mjs --verify
node tools/organ3-measure.mjs --verify
node tools/organ3b-measure.mjs --verify
node tools/organ3c-measure.mjs --verify
```

CI re-derives the data from its pinned commits, checks every seal, re-measures every receipt, and mutation-tests every kernel (witness, `--cap 1000`).

## Layout

- `src/`: pure kernels. `streams` `regulator` `envelope` `journal` `mesh` `inject` (watch) · `model` `lab` `daydream` `daylog` `dream` `idle` (dream) · `mind` `memory` `inherit` (remember) · `costcase`.
- `tools/`: the measuring tools (`organN-measure.mjs`; `mesh-claims.mjs`, the shared mesh and claims of organ 1b), the data fetchers (`nodes`, `nodes-fresh`, `nodes-burst`, `data`), the pre-emption timer, and a local server (`node tools/serve.mjs`).
- `data/`: the sealed preregistrations, the receipts, the node histories, and the recorded local-model replies.
- `vendor/`: verbatim copies with pinned hashes. From fall-kit: identity, SHA-256 and the LIGHT codec. From dex-frontier: the dataset loaders. From sovereign-enterprise: the sourced cost basis.

## Credit

Inspired by Gary W. Floyd's NexusGrid, as he described it in conversation (Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC). Designed from that description only; no parity with his system is claimed. **A comparison with his real implementation will follow his catch-up call.** What he does better will be adopted, and the differences recorded here and on the page. The regulator's field and rate terms draw on Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC — "GEP-Based Security: Behavioral Entropy Signatures for Cybersecurity and DevOps," 2025. The inert-until-reviewed rule draws on his "Dream State Architecture: GEP-Guided Memory Consolidation and Entropy Regulation in Artificial Consciousness Systems," 2025.

Powered by the Konomi architecture, created by Thomas Frumkin. Data: five UCI Machine Learning Repository datasets (CC BY 4.0, cited in [NOTICE](NOTICE)) and the estate's own public commit histories. Supplied by [AI Native Solutions](https://www.ai-nativesolutions.com). MIT licence.
