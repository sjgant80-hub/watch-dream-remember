# Buyer walk 3 — 2026-11-04, read cold by Kar

Four buyers (CFO, CTO/CISO, COO, procurement) read the page from the top, pressed every button and read every number.
Rounds 1 and 2 ran on the local qwen2.5:7b (`personas-qwen7b*.json`, answered in `personas-answered*.md`). This round
was read by Kar directly, as the finishing brief asked. Every point is either answered on the page now, or is a decision
only Simon can make (listed at the end). Nothing below is a number: every number on the page is read from a receipt,
a kernel or the sourced basis.

## CFO

| Point raised | Where it is answered now |
|---|---|
| Owning it is not free in year one: someone has to set it up. | The case has a one-off set-up input (hours, at the same sourced hourly cost), counted in the first year of the years column and the board case. |
| Do I have to buy a machine? | No by default (the measured run used a laptop processor, shown in *What it needs from your systems*). A "machines bought for it" input prices the basis's Mac mini M4 Pro at its sourced UK price and its maximum rated draw, as a ceiling. |
| How fast does it pay back? | The kernel computes the payback in months; the case and the board case state it, and say plainly when it does not pay back. |
| Why would checking fall from 5 hours to 0.5? | It is the reader's figure. The case now anchors it on the measured history: the watches, throttles and pauses the fix gave across the ten builds' held-out days are the only verdicts a person has to read; *Your build* shows the same for the reader's own history. |
| What does support cost? | Not on the page by rule (no price of ours); the page says support is agreed per deployment and is not in the table. |

## CTO / CISO

| Point raised | Where it is answered now |
|---|---|
| Will it work on our agents, not yours? | *Your build*: any git repository's own history, replayed through the measured kernel in the tab; `tools/watch-repo.mjs` from a terminal. It reproduces the receipts' own R1f and B1 counts on wishwood (tested). |
| Does my history leave the browser? | The page now carries a strict Content Security Policy (its code may connect only to its own site; the one inline script is pinned by hash; no inline handlers), gated by a page test. The claim on the page says exactly that, not more. |
| What exactly does it need from our systems? | New panel: the action record (and the nine fixed parts), the hash-chained journal, the signed envelope, both keys (custody set per deployment), where alerts go (wired per deployment), what the daydream improves, the local model and the hardware it was measured on, the runtime. |
| Supply chain? | No package dependencies; every vendored file is checked against its pinned SHA-256 by a page test (it was pinned but unchecked for the fall-kit files and the basis). |
| Can I trust the blueprint's gate numbers? | They come from a CI run's own witness reports, hash-checked against the files on every push. The refresh path was broken (a kernel change could never produce a successful run to refresh from); a refresh dispatch now runs every gate except that one check. |

## COO

| Point raised | Where it is answered now |
|---|---|
| How am I told when it acts? | New straight answer: alerts and verdicts are records; delivery (email, chat, ticket) is wired per deployment; the measurement proves they are raised on time. |
| What does a person still do each week? | New straight answer: read its alerts and verdicts, review each adopted improvement, resume high-stakes pauses. The case counts those hours as staying. |
| Can we see it before switching anything on? | Roll-out now starts with "try it on one build", before week one. |

## Procurement

| Point raised | Where it is answered now |
|---|---|
| Who is the supplier, and what do we receive? | New *For procurement* panel: AI Native Solutions (contact route on its site), the source under MIT with no licence fee, the receipts and the means to re-run them. |
| Personal data, sub-processors? | Runs on the buyer's machines and sends nothing out, so no sub-processor of its own; what it keeps stays there; deletion is complete (Art. 17). |
| Third-party material and its licences? | Gary W. Floyd's papers (Open Defensive Prior Art, Creative Commons), the Konomi architecture (with Thomas Frumkin's permission), the five datasets (CC BY 4.0, used only to measure, not shipped). |
| Company registration, insurance, certifications? | Not on the page: the panel says to ask via the supplier's site. Only Simon holds these facts. |
| Exit? | Stop at any time; agents keep running; records are JSON and LIGHT with the reading code in the repository. |

## Left for Simon

- The supplier's company details for procurement (registration number, insurance, any certifications), if he wants them on buyer pages.
- Support terms or prices: by rule not on the page; agreed per deployment.
