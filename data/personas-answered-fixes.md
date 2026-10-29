# The second buyer walkthrough (the fixes), and what changed

After organs 1b and 3b went on the page, buyer personas read its rendered text cold again, on the local qwen2.5:7b
(`WDR_CTX=16384 node tools/personas.mjs`; the page had outgrown a 12k-token window). Their replies are in
`personas-qwen7b-fixes.json`. The walk read the page before organ 3c's panel was added. The CFO and CTO / CISO walked it in full.
The COO walk was stopped part-way to keep the round bounded, since each persona took 40 minutes on this laptop. Procurement walked it on
its own. The COO and owner-manager walked the whole page in the first round (`personas-answered.md`). Every point raised, and
where the page now answers it:

| They asked | Now on the page |
|---|---|
| How the inherited slice is applied in a child's early life (CFO) | Remember, opening paragraph: the child lives its parents' cycle and uses an inherited lesson only while it keeps helping; the three ways tried follow, each with its receipt |
| Behaviour the test faults don't cover (CFO) | Watch → "The five test faults": the faults are tests; the regulator looks for any departure from each agent's own normal |
| Long-term reliability (CFO) | FAQ "Has it run in a real business yet?": the longest measured stretch (days of held-out history, hourly visits, all signed), and "not a year in production", said plainly |
| Evidence for "100 of 100 faults caught" (CFO) | New FAQ "How can I check the 100 of 100?": every trial in the receipt, re-run under the fix and on ten new builds, and replayable in Watch on the same code |
| Evidence that inheritance "does not clearly help" (CFO); "helped 2 of 5" (CTO / CISO) | The organ 3b panel gives the counts against the bar, with N1/N2 and the chart; the risks line names claim M2 under Receipts |
| "Stuck loop, fast" vs "normal speed" (CTO / CISO) | The five faults: "the same stuck loop, but 20 or more times an hour" |
| What "regulator-silent" means (CTO / CISO) | FAQ "What happens if it breaks?" now defines both alerts, "regulator-silent" and "regulator-drift" |
| A wrong verdict on a well-behaved agent (CTO / CISO) | New FAQ "What if it pauses an agent that was behaving normally?": a throttle only slows the agent, a pause has a 3-hour lease, probation, the owner's signed resume, every verdict logged with its reasons, and the measured false-alarm count under the fix |
| A harmful daydream idea, or one an attacker steers (CTO / CISO) | New FAQ "Could a daydream propose something harmful, or be steered by an attacker?": an idea is one model-reading change with no action in it, the gate refuses a worse model, the parser yields one column or NONE, and 0 actions came from hostile replies (measured) |
| "12 more verified improvements" unsubstantiated (CTO / CISO) | The cost-case note names claim D1 under Receipts; every verified idea is listed in Dream |
| A real-world daydream case (CTO / CISO) | FAQ "Has it run in a real business yet?": not yet outside the estate, said plainly; the pilot path is in Roll-out |
| What "inert" and "LIGHT" mean (Procurement) | Dream → "'Inert', and what happens when the gate says no"; Remember now glosses LIGHT as a compact, lossless storage format |
| "Blind" and "proven" (Procurement) | The organ 3b panel defines blind (the first version, lessons applied from birth); the chart note defines blind, proven and trusted |
| Agents that are always erratic, or always drifting (Procurement) | New FAQ "What about an agent that is always erratic, or always drifting?": its own band, its own regularity floor, a pooled band until it has 8 busy hours; it catches change from its own normal |
| Models if the daydream or gate is off (Procurement) | FAQ "Can a daydream do anything?": switch either off and every model stays as it is; the current model is always the fallback |
| Inheritance "helps on shop and bank" (Procurement) | A misreading: the page says inheritance helped on census and credit and hurt on shop; the chart shows each dataset |
| R1f's fix on real-world bursts (Procurement) | Said plainly in Watch → "A harder test was looked for, and none exists yet": proven on the one real burst there is, not yet on one it has never seen |
| A comparison with Gary W. Floyd's NexusGrid (Procurement) | Credit and FAQ: it follows his catch-up call; the differences will be recorded on the page |
| Long-term support and maintenance (Procurement) | "Ownership, support, exit": MIT, and support, service levels and warranty agreed per deployment (no terms invented here) |
