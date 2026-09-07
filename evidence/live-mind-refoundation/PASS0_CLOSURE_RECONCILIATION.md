# Live NPC Refoundation Study — Pass 0 closure reconciliation

Status: **evidence-only working conclusion; do not merge this branch into E1**

Base authority checked live: `experiment/e1-grounded-notice-fetch` at `5120e73983d2cd2e17843c7e90dd5555b7eead9d`.

Qualified runtime parent: `7cc7bbde976963372ac590a8ad91518493ac76c1`.

The merge from `7cc7bbde...` to `5120e739...` is the already-qualified documentation-only handoff closure. Pass 0 exists because fresh takeover review found a contradiction between the original readiness repair contract and the final runtime. It does **not** reopen the broad readiness campaign or authorize new Live Mind features.

## 1. Purpose

Before the project begins a new persistent Live NPC / Live Mind research program, separate three categories cleanly:

1. **closed old-substrate evidence** that should remain trusted;
2. **material closure residuals** promised by the old campaign but still absent in the final runtime;
3. **new-agent requirements** that belong to the refoundation study and must not be back-ported into E1 merely because they are now important.

The stop condition is not theoretical completeness. It is an honest old-substrate boundary from which the next architecture can use P1/E1 as donors without inheriting hidden contradictions.

## 2. R0–R8 reconciliation

| Slice | Pass 0 classification | Current interpretation |
| --- | --- | --- |
| R0 validation truth | **CLOSED** | Durable `src/**/*.test.ts` discovery and full validation were established. No fresh contradiction found. |
| R1 World legality / executor validity | **CLOSED** | Shared non-mutating `World.validateInteraction`, causal legality ordering, executor dynamic invalidation and canonical player-action identity are present. The actor→actor placeholder problem below is a semantic R4 closure issue, not evidence that item legality/executor validity regressed. |
| R2 WorldSpecimen integrity | **CLOSED** | Construction-time scalar/identity/reference/topology validation landed and later campaigns ran on it. No fresh contradiction found. |
| R3 movement / held locality / location identity | **CLOSED** | Swept static collision, held-item canonical co-locality and explicit priority location identity remain qualified. No fresh contradiction found. |
| R4 causal provenance / diagnostic truth | **PARTIAL — MATERIAL RESIDUALS** | R4a complete frame attempt history, R4b manual start causality and R4c exact build provenance landed. Two explicit original R4 work/exit requirements remain unmet: honest player→NPC semantic outcome and continuous manual/script vs cognition causation without incidental reconstruction. |
| R5 cognition lifecycle | **CLOSED FOR ITS OWN CONTRACT** | Session/request identity, timeout, cancellation and bounded retry are real. R5 identity currently stops at the harness/executor boundary; that does not reopen R5 async lifecycle, but it exposes the unfinished R4 correlation dependency. |
| R6 sensory foundation | **CLOSED WITH R4 DEPENDENCY LIMIT** | Egocentric projection, event-time item semantic occurrences and bounded delivery are qualified. The original R6 design expected lightweight causation correlation from R4; current item sensory occurrences preserve only `player | executor`, so richer source attribution must not assume R6 already solved causation. Do not reopen R6 broadly. |
| R7 Worker/public runtime | **CLOSED** | Bounded ingress, qualifier retirement, stable external errors, bounded usage provenance and build identity landed. No fresh contradiction found. |
| R8 repaired-substrate re-attack | **PARTIALLY REALIZED, NOT DEMONSTRABLY COMPLETED AS THE PLANNED FINAL PHASE** | Many repair slices performed strong self-review, browser/Worker evidence and independent corrections. However the original R8 explicitly required a post-R0–R7 independent re-attack before readiness declaration. No distinct final campaign is present on the canonical E1 line, and Pass 0 fresh review immediately reproduced two still-open R4 requirements. The old docs therefore closed readiness somewhat too broadly. |

## 3. Residual A — player→NPC interaction is a false semantic success

Current live behavior, now protected by characterization evidence:

- nearby explicit `player.jozz -> npc.001` `interact` returns `succeeded · npc_interaction_requested`;
- it emits no semantic `WorldEvent`;
- its message still states `cognition is disabled in P1` on the E1 line;
- `npc.001 -> player.jozz` is rejected as `target_not_interactable`.

This directly matches the original R4 requirement:

> give player→NPC interaction a deliberate semantic outcome/event contract **or stop presenting the placeholder result as a completed semantic interaction**.

### Pass 0 direction

Do **not** invent the future speech/address/conversation model as an E1 repair.

Current-best minimal closure direction is to stop reporting this unimplemented actor interaction as `succeeded`. The exact repaired outcome should be chosen after focused regression review, but it should truthfully state that generic actor interaction is not implemented in the old substrate. Future Live Mind communication/addressedness will then be designed intentionally rather than inheriting a P1 placeholder.

This is a cleanup of old semantic truth, not the first chat feature.

## 4. Residual B — cognition causation stops before execution

Current live behavior, now protected by characterization evidence:

- E1 has real `sessionId`, `requestId`, `attempt` and `cycleId` while cognition is in the harness;
- accepted `fetch` starts an `ExecutorTask` containing only `kind / actorId / targetId`;
- `ExecutionDriver` attributes the later atomic action only as `source: executor`;
- `WorldActionResult` and the semantic occurrence have no manual/cognition/request correlation;
- `E1Experience` has no origin identity;
- the harness associates a completed executor outcome with E1 through local `activeTaskTargetId` state.

That is sufficient for the one-task-at-a-time E1 experiment, but it does not satisfy the original R4 exit criterion:

> distinguish player, manual/script and cognition/executor causation without reconstructing it from incidental state.

### Pass 0 direction

This residual **should be repaired as a donor contract**, because the new Live Mind will make causation more important, not less.

The repair must remain lightweight:

- provenance must not affect World legality;
- no generic tracing platform, event sourcing or telemetry framework;
- distinguish at minimum player vs manual/script vs cognition-originated execution;
- preserve enough correlation that an accepted cognition intention can be followed through task → atomic attempt/result → semantic occurrence/event where applicable → resulting experience;
- avoid coupling generic World types directly to E1-specific class names if a smaller neutral correlation shape can express the fact.

The exact representation is **not selected by this evidence document**. It requires a bounded design + regression pass from clean E1.

## 5. What is explicitly NOT old-substrate debt

The new Live NPC direction makes the following important, but Pass 0 must not retroactively classify them as failed R0–R7 work:

- world/public chat;
- speech occurrence semantics;
- hearing range/modality;
- attention and addressedness;
- persistent Mind Runtime;
- working memory;
- beliefs/source-of-knowledge;
- long-term memory;
- personality/values affecting policy;
- autonomous routines/goals;
- multi-party conversation;
- multi-NPC social behavior;
- generic planner/BT/utility architecture;
- final model choice.

They belong to the new research program unless a future bounded experiment proves a lower prerequisite.

## 6. Missing R8 work that remains justified

After the two R4 residuals are resolved independently from clean E1, perform one bounded final re-attack rather than reopening every old stage:

1. full durable validation with zero unexplained failures;
2. selected old causal scenarios: explicit target legality, contested target, swept collision, held/drop/pickup temporal evidence, stale cognition response, retry/timeout;
3. independent cross-cutting attacks centered on provenance and semantic truth rather than tests copied from repair implementation;
4. rendered browser check for any changed debug/interaction surface;
5. Worker/public boundary sanity check only if Worker code changes (otherwise preserve R7 evidence rather than repeating it mechanically);
6. exact build/Worker provenance;
7. focused Owner gate only if the repair changes something Owner-visible or interaction-relevant;
8. update canonical docs so they no longer claim broader closure than the evidence supports.

## 7. Pass 0 exit criterion

Pass 0 is complete when:

- characterization tests pass on the evidence-only branch and remain unmerged;
- residual A and B are repaired independently on clean E1 or deliberately defended by stronger equivalent contracts;
- the bounded final R8 re-attack passes;
- canonical docs state the honest closed boundary;
- E1 is frozen as historical embodied-cognition evidence / donor substrate;
- no Live Mind feature has been smuggled into the closure campaign.

Only then should the refoundation study treat old-substrate uncertainty as closed and move its center of gravity to vision invariants, donor classification and competing Live Mind architectures.
