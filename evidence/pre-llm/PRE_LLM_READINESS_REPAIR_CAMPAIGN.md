# Pre-LLM Readiness — Dependency-Aware Repair Campaign

Status: **repair design after discovery saturation; implementation not started**

This document is a design artifact on temporary evidence PR #25. It is **not** a request to merge the evidence branch into E1 and it is **not** itself a runtime patch.

## 1. Transition decision

Expanded discovery is sufficiently saturated to stop broad open-ended falsification.

The last material new failure class was the cross-origin inference invocation/cost boundary. Multiple genuinely independent passes after that produced mostly:

- root-cause reinforcement of already-classified WorldSpecimen ingress gaps;
- localization of frame-observability loss to debug/readout rather than `ExecutionFrameResult`;
- PASS evidence for the current authored specimen;
- cognition response mismatch as another instance of the already-known request-attempt/retry root cause;
- current page-lifetime singleton lifecycle as DEFENDED / future-requirement-conditional rather than present remount debt;
- browser perception-source semantics consistent with the intended canonical-World trust boundary;
- no new material runtime class from a broad TODO/FIXME/placeholder/HACK residue pass.

This does **not** mean the substrate is ready for the next heavy LLM layer. It means the audit has enough classified evidence to replace broad discovery with a bounded repair campaign.

## 2. Branch / evidence discipline

- Preserve E1 runtime base: `9245c64474e894ac861c2529ae4919f906f106d1`.
- Preserve PR #25 as characterization evidence. **Never merge PR #25 wholesale into E1.**
- Start runtime repair work from the clean E1 line, not from the evidence branch.
- Selectively port only tests/config that should become durable contracts.
- Keep characterization-only tests as historical evidence when their job is to reproduce a defect rather than specify the repaired behavior.
- Do not make red evidence green by weakening or deleting its oracle.
- Each repair slice should have one explicit causal target, focused regression evidence, full validation and self-review before the next slice.

## 3. Root-cause dependency graph

The repair order is intentional:

`validation truth`
→ `World action/affordance causal legality`
→ `WorldSpecimen integrity + movement/attachment/location contracts`
→ `execution provenance / diagnostic truth`
→ `cognition session + attempt semantics`
→ `bounded perceptual-event / egocentric sensory foundation`
→ `Worker/public-runtime hardening + runtime build provenance`
→ `re-attack repaired substrate`

Do not implement higher layers while lower contracts they depend on are still knowingly ambiguous.

# R0 — Establish the durable validation line

## Goal

Make the repair branch capable of telling the truth before changing behavior.

## Work

1. Start a fresh repair branch from exact E1 `9245c644...`.
2. Carry forward expanded Vitest discovery (`src/**/*.test.ts`) as a real repository validation fix.
3. Port the pre-existing executor tests that were accidentally omitted by old discovery.
4. Selectively port focused characterization/regression tests needed by each subsequent repair; do not import the entire evidence apparatus by default.
5. Keep temporary browser/dependency/worker evidence workflows separate until their long-term role is deliberately chosen.

## Exit

The repair line intentionally begins red for the known contested-target executor contract and has no unexplained failures.

# R1 — World-derived interaction legality + executor dynamic validity

## Why first

The current red validation is not primarily an executor scheduling problem. The deeper issue is that semantic target availability, geometry legality and durative-task validity are not represented through one causal legality contract.

Today:

- executor owns `APPROACH_DISTANCE`;
- World owns `INTERACTION_RANGE` and action-result precedence;
- E1/Worker derive a separate `fetch` allow-list;
- a target becoming held by another actor can be reported as `target_out_of_range` because geometry is checked before semantic availability;
- executor can continue chasing a target whose task has become causally invalid.

## Desired repair shape

Introduce the **smallest World-derived interaction/affordance validation seam** that can answer current legality without mutating World.

It should be able to distinguish at least:

- actor missing/invalid;
- target missing/non-interactable;
- item unavailable because another actor holds it;
- actor already holding an item;
- out of interaction range;
- occluded;
- currently legal interaction.

The atomic `attemptAction()` path and executor dynamic validity should derive from the same ordering/semantics rather than duplicating them.

Do not build GOAP, behavior trees, a generic action planner or a broad capability system.

## Related repairs in this slice

- restore causal contested-target behavior so the existing executor test becomes green for the right reason;
- stop executor pursuit immediately when its target becomes semantically unavailable;
- remove or derive duplicated interaction-range magic where practical;
- enforce that `ExecutionDriver.playerActions` actually carries the canonical player actor rather than permitting an NPC to masquerade through that channel.

## Exit

- full validation has no executor red;
- player/executor action ordering remains deterministic;
- contested target fails for causal unavailability rather than incidental later geometry;
- direct explicit targets still do not silently fall back.

# R2 — WorldSpecimen ingress integrity

## Why before richer agent work

Perception, execution and future memory must not sit on canonical state whose construction contract admits impossible or ambiguous worlds.

## R2a — Scalar, identity and reference validation

Validate at construction before canonical mutation/event initialization:

- finite positive world dimensions, actor speed and radii;
- finite entity positions and AABB geometry;
- exactly one player;
- unique entity/blocker/location/placement-site IDs within their semantic namespaces;
- actor facing remains a finite unit vector;
- held-item ownership is reciprocal and one-to-one;
- referenced held items/holders exist and have correct kinds;
- placement support referents exist.

Reject invalid specimens before the first semantic event/tick rather than permitting later partial failure.

## R2b — Spawn and support topology

Validate authored initial geometry deliberately:

- actor/item footprint inside world bounds where that entity state requires it;
- actors/free items not starting inside blockers;
- held-item initial geometry is canonicalized or validated consistently with the chosen attachment contract;
- a placement site's declared support blocker must be spatially compatible with that site, not merely have a matching ID.

Current authored specimen already passes these intended properties; preserve that as regression evidence.

## Exit

Arbitrary admitted `WorldSpecimen` states satisfy the invariants already assumed by normal runtime APIs. No general rollback engine is introduced.

# R3 — Movement, carried-item geometry and location semantics

These are related to authored world semantics but require deliberate contract choices rather than blind validation patches.

## R3a — Movement collision hidden contract

Choose one explicit invariant and encode it. Current evidence rules out leaving the contract implicit.

Current-best design direction: a **small swept/continuous test for actor movement against expanded static AABBs on each movement axis**, preserving current deterministic axis-separated movement behavior while preventing thin-wall tunnelling regardless of legal step duration or finite authored speed.

Why this is preferable to only rejecting thin blockers or tightening `seconds`:

- blocker thickness is an authoring detail that should not silently determine whether collision exists;
- `actorSpeed` is legitimate world tuning and should not require geometry-dependent hidden limits;
- `stepWithActorControls()` already exposes a bounded non-default duration contract;
- a bounded swept-AABB correction can solve the actual collision assumption without introducing a physics engine or pathfinding.

This direction still requires a focused implementation review before coding.

## R3b — Held-item attachment geometry

Do not merely clamp the item after `followHeldItem()`; that can invent attachment offsets and perception history.

First define the intended invariant:

- carried item remains canonical world geometry and must fit legal attachment space; **or**
- held ownership is canonical while display/sensory attachment geometry is derived separately from collision placement.

Current evidence proves the existing hybrid is unsafe because canonical carried geometry can enter walls/outside bounds and change cognition-visible history.

Choose the smaller semantically honest model before implementation.

## R3c — Location membership

Current singular first-match semantics are order-dependent and current authored zones overlap.

Do not let future durable memory depend on this until one explicit model is chosen:

- disjoint authored zones with ingress rejection;
- explicit authored priority;
- or multi-membership with deterministic primary-location derivation.

Current-best bias for the small laboratory: prefer an explicit, inspectable semantic rule over array order; avoid a generalized spatial ontology.

## Exit

Movement cannot tunnel through legal static blockers under the public step contract; carried-item geometry has one coherent canonical/sensory meaning; location identity no longer depends accidentally on array ordering.

# R4 — Causal provenance and diagnostic truth

## Goal

Preserve the project's central methodological requirement: debugging must answer **who did what, through which system, and why**.

## Work

- add a lightweight correlation/source identity across accepted intention/task → executor World action/result/event → E1 experience;
- do not change World action legality based on provenance;
- expose the whole current `ExecutionFrameResult` attempt set in debug state instead of collapsing the frame to `world.lastActionResult()`;
- keep `World.lastActionResult()` only if it remains useful as a narrow convenience, not as the sole frame truth;
- give player→NPC interaction a deliberate semantic outcome/event contract or stop presenting the placeholder result as a completed semantic interaction;
- fix `WorldScene.startNpcFetchLanternTask()` ordering so a refused manual start cannot disarm E1; consume the executor's boolean result truthfully.

Avoid a generic observability platform.

## Exit

For any relevant frame, the lab can distinguish player, manual/script and cognition/executor causation without reconstructing it from incidental state.

# R5 — Cognition session identity and attempt semantics

## Goal

Make asynchronous cognition lifecycle causal rather than keyed only by a reused integer cycle ID.

## Minimum contract

Use explicit arm/session identity plus request/attempt identity. A completion may mutate harness state only if both identities still match the active pending attempt.

Define an explicit attempt outcome vocabulary such as:

- accepted decision;
- model/transport failure;
- timeout/cancel;
- stale session/response;
- invalid/mismatched response;
- decision rejected on request perception;
- stale decision on current revalidation;
- executor start refused.

## Retry semantics

Do not implicitly consume the triggering stimulus on transport/protocol failure.

Use a small bounded retry policy tied to the same semantic stimulus/attempt, respecting:

- the existing per-arm research budget;
- cooldown/rate constraints;
- no concurrent duplicate request;
- no interruption of a running executor task.

Avoid an autonomous job queue/retry framework.

## Cancellation / timeout

Add a bounded provider timeout and/or cancellation signal appropriate to browser fetch. Disarm/new arm must make old completion unable to mutate the new session even if underlying transport cannot be cancelled instantly.

## Exit

ABA stale responses, stale rejections, indefinite in-flight hangs, mismatch consumption and one-shot transport-loss behavior are all covered by one coherent lifecycle contract.

# R6 — Minimal sensory foundation before richer cognition

This stage is required before the next heavier embodied-agent experiment, but it is not a full sight/memory system.

## R6a — Bounded perceptual-event seam

Current sampled-state delta is useful but cannot represent transient history.

Add the smallest event-time sensory seam that can preserve relevant local changes with enough event-time context to answer whether an event was perceptible when it happened. It should not expose the global debug event ring or become a generic event-sourcing platform.

Needed event-time context likely includes:

- event tick/time;
- relevant entity/actor IDs;
- event-time positions or a bounded local relation needed for filtering;
- lightweight source/causation correlation from R4.

State projection and event observation should remain distinct inputs with explicit semantics.

## R6b — Egocentric relation

Use canonical actor facing to derive observer-relative direction so future cognition can honestly distinguish front/back/left/right. Preserve current bounded range/occlusion semantics as primitives; do not claim semantic vision/FOV yet.

## R6c — Relational visibility consistency

Decide how ownership relations are represented when the referenced holder is not itself perceived. Do not leak a supposedly unseen entity identity merely because a visible item references it unless that relation itself is intentionally observable.

## Research apparatus

Add a small visual per-entity perception/rejection overlay only to the extent needed to inspect the new sensory contract. Do not start a cosmetic campaign.

## Exit

The next cognition experiment can consume bounded current state plus bounded local event history with egocentric, inspectable semantics without pretending global/unobserved facts are sensed.

# R7 — Worker/public-runtime hardening and evidence provenance

This can happen after core causal contracts because it should not dictate the embodied architecture, but it must be closed before treating the preview as a broader public runtime.

## R7a — Inference invocation boundary

Define the lab's minimal allowed invocation policy. At minimum evaluate:

- requiring the intended JSON content type for E1;
- rejecting cross-origin invocation where appropriate rather than relying on unreadable CORS responses;
- a small explicit request-body size boundary before expensive parsing/model work where feasible;
- consciously disabling/gating/retiring historical `/api/ai/qualify` outside deliberate transport qualification;
- keeping rate limiting as abuse damping rather than claiming exact accounting.

Do not build accounts/authentication unless the actual deployment boundary requires them.

## R7b — Error/usage visibility

- return stable external error codes instead of raw provider `error.message` on public surfaces;
- retain useful internal diagnostics;
- propagate model usage into the client/debug envelope so experiment cost is inspectable.

## R7c — Build/deploy fingerprint

Expose a small exact build/deploy identity in `/api/health` and/or the lab UI so Owner recordings can be correlated with repository evidence.

Repository protection/rulesets are operational governance, not runtime code. Configure an appropriate merge gate if available; do not mistake Cloudflare deployment success for qualification.

# R8 — Re-attack the repaired substrate

No readiness declaration follows directly from implementing R0–R7.

After repairs:

1. run the complete durable validation suite with **zero unexplained failures**;
2. re-run selected old characterization scenarios against repaired behavior;
3. add independent new falsification passes, not only tests written from the repair implementation;
4. rerun rendered-browser evidence for changed UI/lifecycle surfaces;
5. rerun Worker/public-boundary evidence for changed routes;
6. verify exact deployment/build provenance;
7. use focused Owner hands-on gates for feel/readability/interaction surfaces that automated tests cannot qualify;
8. update canonical E1/project docs from the repaired line;
9. only then make the explicit E1 integration/closure decision and choose the next bounded agent research question.

# 4. Dependency/priority summary

| Order | Slice | Why it precedes later work |
| --- | --- | --- |
| R0 | validation truth | repairs are meaningless if the suite lies |
| R1 | World legality + executor validity | every higher intention must terminate in causal World legality |
| R2 | specimen ingress | perception/execution must not ingest impossible canonical state |
| R3 | movement/attachment/location semantics | removes hidden spatial contracts before richer embodied sensing |
| R4 | provenance/debug truth | later event/cognition history needs source causation and inspectability |
| R5 | cognition session/attempt lifecycle | prevents async history from being attached to the wrong session/attempt |
| R6 | local event + egocentric sensory seam | prerequisite for richer embodied cognition, not a feature expansion |
| R7 | public runtime + build provenance | closes cost/deployment/evidence boundaries without driving core architecture |
| R8 | independent re-attack | proves repairs rather than merely implementing them |

## 5. Anti-overbuild constraints

The repair campaign must **not** turn into:

- a physics-engine replacement;
- navmesh/pathfinding work;
- actor-actor collision gameplay design unless later evidence makes it necessary;
- a generalized ECS/event-sourcing rewrite;
- GOAP/behavior-tree/planner architecture;
- long-term memory;
- multi-NPC architecture;
- full authentication/account infrastructure for a private lab;
- generic observability/OpenTelemetry;
- cosmetic polish unrelated to research readability.

The target remains: **no known material foundational debt in current agreed substrate scope before the next heavy agent layer**, not theoretical completeness.

## 6. First implementation recommendation

When implementation begins, start with **R0 + the narrow R1 causal-legality/executor slice** on a fresh branch from E1.

Reason: this is the only known red durable contract, it sits directly on the `intention → executor → World` authority chain, and a correct World-derived legality seam can remove a root cause rather than patching the executor's symptom.

Do not begin R2–R7 until R1 is green and reviewed.
