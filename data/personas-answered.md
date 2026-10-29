# The buyer walkthrough, and what changed

Five buyer personas (CFO, CTO / CISO, COO, owner-manager, procurement) read the page's rendered text cold, on the local
qwen2.5:7b (`node tools/personas.mjs`; their replies are in `personas-qwen7b.json`). Every point they raised, and where the
page now answers it:

| They asked | Now on the page |
|---|---|
| What "stuck loop", "hijacked" and the other faults mean (CFO, COO, owner, procurement) | Watch → "The five test faults, in plain words" |
| What about behaviour nobody listed? (CFO, owner) | Same panel: the faults are tests; the regulator looks for any departure from each agent's own normal |
| A high-stakes agent that keeps overspending (CFO); what "high-stakes" means (CTO, procurement) | Same panel, and "What it can and cannot do" |
| The evidence for five verbs and a zero budget (CTO, COO, owner) | The measured battery result beside the claim; FAQ "How is the zero budget enforced?" |
| How "transfer-7b" and "association" work; where 378 candidates and the 14.6% yield come from (CFO, procurement) | Dream → "What the daydream found, in plain words": every source explained, every verified find listed |
| "Inert", and what happens when the gate says no (CTO, COO, procurement) | Dream → "'Inert', and what happens when the gate says no" |
| Tampering with the daydream and the gate (CTO, owner) | Dream → "Integrity" |
| What a "canary" is (CTO) | Remember → the breed-and-delete panel |
| What the "inherited slice" is (COO) | Remember → the opening paragraph |
| What "health" means (owner) | Watch → "What it checks" |
| A hacked regulator (COO) | FAQ "What if the regulator itself is hacked?" (the measured rogue case) |
| Real-world use; long-term reliability (COO, procurement) | FAQ "Has it run in a real business yet?": not yet outside the estate, said plainly |
| Scale to many agents (owner) | FAQ "Does it scale to many agents?", computed from the measured round time |
| Hidden costs; hardware; maintenance (COO, owner) | FAQ "What does it cost to run?", plus the cost case |
| Does anything leave the machine? (procurement) | FAQ "Does anything leave my machines?" |
| False alarms and misses (procurement) | FAQ "How often is it wrong?" |
| How to re-run; which code version was measured (procurement) | Receipts: the sealing commit for each claim, a CI link, and the re-run steps open on the page |
| A comparison with Gary W. Floyd's NexusGrid (procurement) | Credit and FAQ: it follows his call, and the differences will be recorded on the page |
| The speed sentence ("a fraction of a millisecond") | Corrected to the measured round time, read from the receipt |
