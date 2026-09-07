# Owner-fail regression recovery — 2026-09-07

Status: ACTIVE RECOVERY. DO NOT TREAT CURRENT E1 HEAD AS QUALIFIED OWNER-FACING RUNTIME.

## Trigger

Final Owner/browser gate on current E1 runtime `caeb15cb875a83ffbab684f8e55880a87d723d15` failed qualitatively and severely. Owner recording confirms the tested build fingerprint is exactly `caeb15cb...` with Worker version `c13d0442-104c-42ec-b148-a6d9374f98d0`.

The failure invalidates the previous readiness-closure direction. Green CI/public Worker/model transport/provenance are retained only as bounded technical evidence; they do not qualify the playable laboratory.

## Two confirmed regressions

### 1. Debug Workspace starvation / disappearance

R4a PR #31 added `ActionAttemptDebugPanel` as a direct child of `#debug`, while the existing `.debug-content` is the intended flexing/scrolling child of `.debug-shell`.

Because `.debug-shell` is a fixed-height flex column and the action-attempt section is outside `.debug-content`, the bounded history grows as a separate auto-sized flex item and progressively squeezes `.debug-content`. The controls therefore become effectively inaccessible/disappear during normal use.

The PR #31 browser probe proved immediate panel visibility and a few entries only. It did not attack long-running growth or preservation of access to the pre-existing controls.

Classification: MATERIAL OWNER-FACING REGRESSION; validation apparatus blind spot.

### 2. Held-target pursuit removed

Pre-readiness executor `15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105` computed the live target position first and approached while beyond its approach threshold. A player-held item therefore remained a moving spatial target and the NPC could follow the player carrying that item; only an eventual in-range interaction would fail if the item was still unavailable.

R0/R1 PR #26 replaced that behavior with pre-movement `World.validateInteraction()`. Since a held item yields `target_unavailable`, the executor now immediately fails and never pursues the moving target. PR #26 explicitly described this as immediate termination when a target becomes semantically unavailable.

This conflated two different questions:

- Is an atomic interaction legal *right now*?
- Is a durative pursuit task still meaningful and should it continue approaching a dynamic target?

Classification: MATERIAL BEHAVIOR/PLAYABILITY REGRESSION; wrong task-semantics model embedded into tests.

## Recovery baseline

Use exact pre-readiness runtime-clean checkpoint as the first forensic baseline, not as an automatically re-qualified product:

`15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

Historical Worker Version ID:

`1e85f121-0fa5-4fd7-a098-0f9a3f581303`

This checkpoint is a donor/baseline candidate only until differential review and later Owner qualification. Do not ask Owner to test it yet merely because it is older.

## Recovery rules

1. Stop feature work and Live Mind implementation.
2. Do not repair current `caeb15cb...` forward by accretion.
3. Preserve current broken head and PR #47 as failure evidence.
4. Build recovery from a known pre-readiness runtime, selectively re-earning later repairs.
5. Split mixed repair PRs; retain useful invariants without retaining behavior regressions.
6. Owner-facing playability/feel and usable apparatus are first-class gates, not postscript gates.
7. Long-lived UI tests must attack accumulated history/state, not only initial visibility.
8. Durative task validity must not be equated with instantaneous atomic-action legality.
9. Do not request another Owner test until automated/differential review has reached a genuinely bounded uncertainty that cannot be resolved headlessly.

## Initial campaign classification

- #26 R0/R1: MIXED. Keep durable test discovery/player-channel identity/shared World action legality as donors; reject current executor rule that any instantaneous semantic unavailability terminates pursuit.
- #27 R2 specimen validation: likely KEEP, pending differential confirmation.
- #28 R3a swept collision: MATERIAL FEEL RISK; re-earn independently, not blindly port.
- #29 R3b held-item locality: MATERIAL GAMEPLAY/TARGETING RISK; re-earn independently.
- #30 R3c location priority: likely KEEP, pending differential confirmation.
- #31 R4a action-attempt history: KEEP diagnostic concept, RETIRE current UI mounting/layout implementation.
- #32 R4b manual trigger lifecycle: likely KEEP.
- #33 R4c build provenance: KEEP.
- #34/#35 R5 lifecycle/timeout/retry: useful but behavior/cadence sensitive; re-earn with long-run scenario tests.
- #37 R6a egocentric direction: likely KEEP.
- #38/#39 R6b temporal sensory delivery: cognition-behavior sensitive; re-earn against Owner-relevant scenarios rather than only buffer invariants.
- #41/#42 R7 Worker hardening/error/usage: likely KEEP; low direct playability coupling.
- Repair A actor-interaction truth: defer/reconsider in context of upcoming world communication rather than treating as required recovery behavior.
- Repair B causal provenance: KEEP concept; UI surface must be redesigned and cannot starve gameplay controls.

## Current stop boundary

No closure declaration. No canonical docs rewrite as if readiness succeeded. No new Owner gate until recovery produces a candidate whose important historical behaviors and apparatus usability are independently defended.