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

Re-run any of it:

```bash
node tools/data.mjs --fetch
node tools/organ1-measure.mjs --verify
node tools/organ2-measure.mjs --verify
node tools/organ3-measure.mjs --verify
```

CI re-derives the data from its pinned commits, checks every seal, re-measures every receipt, and mutation-tests every kernel (witness, `--cap 1000`).

## Layout

- `src/`: pure kernels. `streams` `regulator` `envelope` `journal` `mesh` `inject` (watch) · `model` `lab` `daydream` `daylog` `dream` `idle` (dream) · `mind` `memory` (remember) · `costcase`.
- `tools/`: the measuring tools (`organN-measure.mjs`), the data fetchers, the pre-emption timer, and a local server (`node tools/serve.mjs`).
- `data/`: the sealed preregistrations, the receipts, the node histories, and the recorded local-model replies.
- `vendor/`: verbatim copies with pinned hashes. From fall-kit: identity, SHA-256 and the LIGHT codec. From dex-frontier: the dataset loaders. From sovereign-enterprise: the sourced cost basis.

## Credit

Inspired by Gary W. Floyd's NexusGrid, as he described it in conversation (Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC). Designed from that description only; no parity with his system is claimed. **A comparison with his real implementation will follow his catch-up call.** What he does better will be adopted, and the differences recorded here and on the page. The regulator's field and rate terms draw on Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC — "GEP-Based Security: Behavioral Entropy Signatures for Cybersecurity and DevOps," 2025. The inert-until-reviewed rule draws on his "Dream State Architecture: GEP-Guided Memory Consolidation and Entropy Regulation in Artificial Consciousness Systems," 2025.

Powered by the Konomi architecture, created by Thomas Frumkin. Data: five UCI Machine Learning Repository datasets (CC BY 4.0, cited in [NOTICE](NOTICE)) and the estate's own public commit histories. Supplied by [AI Native Solutions](https://www.ai-nativesolutions.com). MIT licence.
