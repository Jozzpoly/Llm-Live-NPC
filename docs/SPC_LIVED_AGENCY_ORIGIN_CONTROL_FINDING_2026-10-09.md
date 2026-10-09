# R6 — World-only resident-origin negative control — 2026-10-09

**Authority / status:** SOURCE-LEVEL DIAGNOSTIC NEGATIVE, **not** Owner-level NPC-life qualification. Execution branch `research/r6-lived-agency-origin-control-20261009`, draft PR #151; parent R6 draft PR #148. Canonical product truth remains `docs/SPC_POST_STRESS_RECOVERY_PROGRAM.md`. This finding may be carried forward without merging test code until a broader integrated decision has been earned.

## Question

Is the absence of interesting shared-world behavior caused simply by too-large distances between existing residents, or by a deeper lack of resident-owned motive/actionable world meaning?

## Apparatus and observations

Actual `FiveResidentCausalLifeRuntime` + `createFiveResidentRegionComposition`, 1500 World ticks each, **no real model, no mocked model, no added matters**, no scripted words or desired resident choices, no direct recovered-resident bypass.

Run A: completely default authored World.

Run B: same World, except Ida's *authored opening travel destination* is adjusted into Janek's visual range. This is an **experimental spatial intervention**, not autonomous initiative.

GitHub Actions Check `37993648390` PASS on initial research source `ea58b3bc74e734a8b88151732e8395586c9aac56` (305 test files; 1071 tests). The two source-level test observations are:

| World-only measure (t=1500) | A: default | B: spatial-only |
|---|---:|---:|
| Janek–Ida body separation | 1609.8957 | 207.2730 |
| Ida present in Janek's currently visible PRIVATE known actors | no | yes |
| Janek's recognized workshop crate currently visible | yes | yes |
| Janek pending cognition reasons | 0 | 0 |
| Current recovered life matters, all five residents | 0 | 0 |
| Resident World speech occurrences | 0 | 0 |
| World material actions | 0 | 0 |

Thus a real resident–resident visual encounter can occur while the existing, rightly conservative `ResidentSemanticPressureGate` retains mere actor sight as observation-only. There is no distinct resident-owned reason/commitment to make that sight socially significant. The scene itself does not produce any resident World/social afterstate after scripted opening. Janek likewise knows the workshop crate exists and is visible but has no accepted personal matter about it.

This is a **negative diagnosis**; it is not evidence that every idle moment is pathological. Quiet is legitimate when a person has nothing meaningful to do.

## Extended third control — factual material displacement, 2026-10-09

Source `2f877317944d33e79d7a8937e6e1e2d6dc3a833b`, [GitHub Actions Check #37994093601](https://github.com/Jozzpoly/Llm-Live-NPC/actions/runs/37994093601): **PASS**, 305 files / 1072 tests. The third test does not fabricate a resident decision: a legitimate **player** performs actual World `pickup`, physically moves while holding the one recognized workshop crate, then performs actual World `place`. One continuous five-resident causal runtime advances and Janek samples the resulting material truth through its normal private observer.

- 2 successful factual material actions;
- final World crate position `{x:2122,y:800}`;
- Janek's private `lastKnownPosition` **exactly** `{x:2122,y:800}`, currently visible;
- Janek still has **0 resident-owned matters and 0 pending semantic reasons**.

This further isolates the *first personal-stake/meaning* gap from World material action and perception wiring. It does **not** mean Janek ought to have reacted: no object-specific resident obligation or attachment existed. It also does not test autonomous NPC-NPC relocation, provider decisions, or long-horizon game-feel.

## Cause discrimination and role-capability audit

**Not explained by physical isolation alone.** We forced the spatial condition without creating a social act or matter. It does *not* follow that physical distance is irrelevant to eventual dynamic lives; it only shows that one simple proximity change is insufficient in the no-provider control.

**Strong observed-source mismatch between authored roles and available causal world:**
- `FIVE_RESIDENT_LIFE_SELF`: Mira, Janek, Ida, Oren, Nela have role+drives prose. This is optional higher-cognition context, not ongoing private concern/interest authority.
- `FIVE_RESIDENT_MATERIAL_FAMILIARITY`: only Janek knows `crate.workshop.01`; Oren is called a gatherer but no material object is recognized by him; Nela is called an explorer but `investigate` is unsupported in the main R6 mode.
- `ResidentCausalExecutionCoordinator` physically implements `travel_region`, `communicate_actor`, `acquire_material_object`. Carry/place, search/follow and richer local procedures exist only in older/out-of-path donors.
- Worker `FIVE_RESIDENT_CAUSAL_V1_GUIDANCE` permits bounded known-region travel and known-actor communication, plus tightly grounded acquisition; `follow` and `investigate` are explicitly forbidden in this mode.
- `ResidentRuntime.completeActivity()` emits `activity_completed` reasons for authored opening completion; Janek begins idle and has **zero** reasons. Without an incoming cognition reason, the private `role/drives` prose is not even sent to higher cognition. That is an important *one-shot bootstrap and personal relevance* question, not a mandate for periodic provider polling.
- Absence of initial task should not be "repaired" by treating every object or visual encounter as an obligation. R4-D intentionally showed material affordance does not automatically entail chore creation.
- Already-existing positive control: `five-resident-causal-life-material-runtime.integration.test.ts` proves reacquisition → resident-recognized reason → test-supplied admitted intent → World pickup **when old matter and decisions are supplied**. This isolates a route for executing some existing purpose; it is **not** spontaneous origination of that purpose.

## What remains UNTESTED

- A real model could take `activity_completed` reasons of four residents and generate new, partially valid self-directed episodes. A provider-free baseline cannot prove that a provider-enabled World stays still.
- A carefully authored, causally meaningful initial relationship or consequence could legitimately create endogenous significance without a random need loop; this has not yet been implemented.
- Whether exact social history and lived counterparty actions ultimately lead to coherent long-duration personal change under one unforced shared-world runtime.
- Whether stronger local action execution is the bottleneck **after** a valid resident-owned matter exists.
- Owner's actual gameplay experience. This entire PR remains research-only.

## Next bounded experiment: motive-origin / capability discrimination

**Do not duplicate the distance-only control.** Choose a small shared place and one genuine, World-owned social/material conflict with durable afterstate and at least two plausible individual outcomes (including a justified refusal or non-action). Author starting conditions, **not** NPC decisions or their dialogue. Make the situation genuinely matter to a resident through grounded personal stake and private history; first locate exactly where that stake originates and how later facts might revise it.

Establish two controls before real provider traffic:
1. no pre-existing resident-specific stake: proximity and affordances alone must not create fake attention/chore obligations;
2. explicit, grounded personal stake from real/legitimate World history: the resident should at least be capable of holding a meaningful private matter or declining it for a reason; failure must identify *why* (no relevance, no model chance, no executable action, no World consequence), not silently choose an architecture.

Preserve real work from R1/R4 as **donor options**, not a wholesale transplant or canned fetch task. Never claim modeled life from a test-supplied response. If the next step needs actual Luna inference, first establish a finite physical client request ceiling (PR #150 only proposed), an enforceable independent budget guard and a deliberate short experiment; no uncontrolled paid soak or automatic preview called "Owner-ready."

**Next execution move:** design/implement a **single** research-only shared-world lived-stake slice with a clear before/after factual World consequence and with no planted decisions, then falsify the first failed causal seam. Do not turn this into indefinite documentation work or a permanent static fixture gallery.
