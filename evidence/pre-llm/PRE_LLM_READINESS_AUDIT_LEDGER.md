# Pre-LLM Readiness Audit — Evidence Ledger

Status: **active discovery / falsification**

This file belongs only to the temporary readiness-evidence branch and PR #25. It is not canonical project architecture, is not a repair plan, and must not be merged into E1 unchanged.

## Exact substrate

Audit base / unchanged E1 runtime:

`9245c64474e894ac861c2529ae4919f906f106d1`

Runtime-clean pre-doc checkpoint:

`15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

Live compare confirms `15ed5e... -> 9245c644...` contains only four documentation files and no runtime, test or config changes. The readiness audit therefore studies the same runtime that passed the final E1 Owner gate.

Evidence branch:

`evidence/pre-llm-readiness-audit`

Evidence PR:

`#25` against `experiment/e1-grounded-notice-fetch`

The branch contains characterization tests and audit-only workflows/docs. Characterization tests intentionally PASS when they reproduce an existing readiness gap. They are evidence, not fixes.

## Evidence hierarchy

1. Owner hands-on judgement for feel/readability/playability.
2. Exact live repository state and deterministic runtime behavior.
3. Characterization tests reproducing suspected failure modes.
4. Rendered-browser evidence for UI/layout contracts.
5. Cloudflare / platform documentation for infrastructure semantics.
6. Static source review where a runtime probe would add no meaningful discrimination.

Do not promote a static suspicion to a runtime defect when a direct probe can resolve it. Apparatus-invalid failures must be corrected before interpretation.

## PROVEN GAPS — reproducible or live-verified

### Validation / CI truth

- Canonical Vitest discovery omitted all `src/execution/*.test.ts` files. Existing executor tests therefore did not run in the previously reported full validation suite.
- Expanding discovery to `src/**/*.test.ts` exposes one existing red executor contract: the contested pickup receives `target_out_of_range`, not the expected `target_unavailable`.
- This is not merely a stale assertion: separate characterization shows the executor remains `running`, pursues an item after the player takes ownership, and can later fail for an incidental geometric reason such as `target_occluded` instead of the causal invalidation.

### Async cognition lifecycle / identity

- `cycleId` resets to `1` on every E1 arm session.
- A stale response from session A cycle `1` can finish a fresh session B cycle `1`, overwrite B provenance/status and cause B's real response to be ignored. This is reproduced end-to-end through `E1AgentHarness`.
- A rejected stale request from a previous session can contaminate a newly armed session with `request_error`.
- Requests have no cancellation/timeout. An unresolved provider can keep the harness logically in flight indefinitely.
- A transport/provider failure consumes the triggering wake state and a cycle-budget slot; unchanged world state does not automatically retrigger the lost stimulus.

### Temporal observation semantics

- E1 observes sampled state deltas, not an event stream.
- A transient state that appears and disappears while cognition is in flight can leave no later cognition-visible trace.
- Same-tick `drop -> pickup` can generate two real World events while returning to the baseline snapshot; E1 then sees zero `observedChanges` and makes zero provider calls.
- State observation and event observation therefore cannot be treated as interchangeable in a future embodied-perception layer.

### Perception consistency

- A visible relation can reveal the ID of an entity that did not itself pass the visibility gate. A held item can expose `heldBy = player.jozz` while the player entity is outside the perception radius.
- Worker sanitization bounds shape/collection sizes and fetch allow-lists, but does not independently enforce the browser's 220 px semantic range, normalized directions, unique visible entity IDs, or full internal consistency between current perception and `observedChanges`.
- The server is therefore shape-bounded and allow-list-consistent, not independently authoritative about temporal/local truth.

### Held-item geometry / embodiment

- `followHeldItem()` derives a held item's canonical position from an actor offset without world-bound or blocker validation.
- Legal gameplay can therefore place a held item's canonical center outside world bounds or inside an authored blocker/occluder.
- This can affect perception semantics: an actor can be visible while the carried item is hidden by the attachment offset, so a later legal drop may appear as `item_entered_perception · free` instead of the semantically richer `holder player -> free` transition.
- Player and NPC bodies currently do not collide with each other. This is characterized, but remains deliberately unqualified rather than automatically classified as repair debt.

### WorldSpecimen ingress integrity

- World construction does not enforce exactly one player despite singular-player APIs and diagnostics.
- Duplicate IDs for authored categories such as blockers/locations/sites can be accepted where no explicit duplicate invariant is checked.
- Actor/item ownership can start referentially inconsistent.
- Logically consistent ownership can still start physically inconsistent until the first step synchronizes held-item geometry.
- Non-finite specimen values such as `actorSpeed = NaN` can poison canonical positions.
- A missing held-item referent can throw only after `step()` has already advanced tick/mutated actor state, leaving partial frame mutation.
- Corrective direction should therefore be ingress/specimen validation, not a general rollback engine.

### Location semantics

- Location lifecycle/events are player-only; NPC location is separately recomputed by E1 projection.
- Authored location zones overlap. Singular location identity is selected by array order (`find()`), and the same point can change location identity solely by reordering definitions.
- This is an implicit semantic-priority contract and must be resolved before location identity becomes durable memory/belief truth.

### Interaction / provenance

- `interact(player -> npc)` returns `succeeded · npc_interaction_requested` while producing no semantic World event; this is a placeholder stimulus contract.
- Interaction is asymmetric: NPC cannot use the same action to interact with the player.
- `ExecutionDriver`'s `playerActions` channel does not enforce player actor identity; an NPC action can be executed through that channel while the executor remains idle.
- World action/event records identify actor/target but not source/task/request causation. Therefore `NPC-001 picked up Lantern` is insufficient by itself to distinguish executor, script/harness or another caller.
- Future correlation should remain lightweight but continuous across lab run/session -> cognition request -> task execution -> World action/event -> experience.

### Input batching

- Multiple player atomic requests can occur in one fixed tick.
- Current UI ordering places `drop` before `interact`; a same-frame pair can drop and immediately re-pick the same item, producing two semantic events while ending in the original held state.
- This is deterministic, but the intent arbitration policy is implicit.

### Runtime / scaling

- A disarmed E1 harness still recomputes a full snapshot/perception after every execution step even though no cognition can run.
- WorldScene then takes another snapshot for presentation. Current specimen cost is negligible, so this is a bounded scaling debt rather than justification for spatial indexing or a large performance refactor.

### Worker ingress / cost boundary

- Public E1 and legacy P0 inference endpoints are unauthenticated experiment surfaces.
- Request JSON is fully parsed before E1 sanitization and before the rate limiter; there is no explicit small body-size guard at this route boundary.
- The Workers Rate Limiting binding is approximate/per-location rather than a strict global quota/accounting system. Treat it as abuse damping, not exact budget protection.
- Legacy `/api/ai/qualify` remains an inference-capable historical probe and should be consciously gated/retired before a broader public runtime.

### Operational workflow

- Repository `main` is live-verified as unprotected with no required status checks and no repository rulesets.
- Cloudflare can successfully build/deploy a commit whose GitHub validation is red. Therefore deployment success is not qualification evidence, and an invalid commit could currently reach `main` without a GitHub merge gate.
- Audit-only commits trigger Cloudflare preview builds. Native Cloudflare Build watch paths can later reduce docs/tests/workflow-only deployment noise.
- PR #23 and PR #3 descriptions are stale relative to later Owner/E1 evidence and current readiness findings; this is a takeover/continuity hazard.
- Several accidental/temp branches have been live-compared and shown to contain no unique implementation/evidence; they are safe later cleanup candidates.

## DEFENDED / PASS — attacked and currently not repair targets

- `World` remains canonical gameplay authority; Phaser/presentation cannot mutate entity truth through returned snapshots.
- Constructor input and read APIs use cloning sufficiently to prevent ordinary external alias mutation.
- Snapshot/event/action/placement read models are isolated copies.
- Valid external control vectors are checked before canonical mutation.
- Same initial specimen + same control/task sequence is deterministic in current tested substrate.
- ExecutionDriver ordering is explicit and deterministic; the debt lies in dynamic task validity/causal semantics, not nondeterministic scheduling.
- Contextual interaction selection has stable distance/ID tie-breaking.
- Placement target validation explicitly handles world bounds, blockers, full footprint, support blocker and ambiguous sites.
- Direct target selection does not silently fall back to another explicit target.
- Mobile-mode capability detection intentionally requires touch + coarse pointer + no hover; hybrid touch+mouse behavior is already tested.
- Current rendered shell passed temporary Chromium smoke on desktop, narrow desktop, mobile portrait and mobile landscape.
- Current dependency lockfile passed the temporary high-severity `npm audit` evidence job.
- TypeScript already uses `strict: true`; no evidence currently justifies lint/type-hardening work for its own sake.
- Current bundle warning is not yet evidence of a user-visible performance problem.
- No committed runtime credentials/secrets were found in the audited config paths; Cloudflare bindings are used for platform resources.

## DELIBERATELY MISSING / NOT DEBT BY ABSENCE ALONE

Do not convert these into automatic cleanup tasks without concrete evidence:

- pathfinding/navmesh/general obstacle solving;
- actor-actor collision as a full gameplay system;
- hearing/speech propagation;
- long-term/episodic memory;
- generic planner/GOAP/behavior-tree framework;
- multi-NPC coordination;
- persistence/save format;
- final map-authoring pipeline;
- final conversation UI;
- final model choice;
- large-scale spatial indexing;
- generic observability platform / OpenTelemetry integration.

Some may become prerequisites for a later bounded experiment. Their current absence alone is not technical debt.

## IMPORTANT UNKNOWNS / decisions not yet promoted to defects

- Desired final actor-body interaction/separation semantics for embodied presence.
- Time-domain semantics for future memory: simulation ticks vs active simulation time vs wall-clock time.
- Exact normal-runtime policy for AI Gateway payload logging once real player dialogue exists.
- Appropriate authentication/session boundary for a public game versus the current private experimental lab.
- Whether location zones should be disjoint, prioritized, nested or multi-membership.

## Current apparatus state

At evidence head immediately before this ledger, expanded Vitest discovery runs all `src/**/*.test.ts` files. Latest known result:

- 113 characterization/regular tests PASS;
- 1 existing executor contract FAIL;
- temporary rendered-browser evidence PASS;
- temporary dependency audit PASS.

The red executor test is retained intentionally during discovery because it exposes a real dynamic task-validity mismatch. Do not make the evidence suite green by weakening the assertion before the underlying contract is deliberately resolved.

## Discovery stop condition

Do **not** stop because a predefined checklist is exhausted.

Discovery is ready to transition into a repair campaign only after multiple additional independent passes mostly produce one of:

- DEFENDED/PASS;
- duplicate of an already classified gap;
- deliberately missing future capability rather than present debt;
- low-value speculation with no concrete failure mode.

If broad new passes continue finding material new classes of failure, continue the audit.

After repairs, the repaired foundation must be attacked again. Only a later state with no known material debt in the agreed current scope, clean full validation, rendered-runtime evidence, deployment provenance and Owner judgement can support a claim of readiness for the next major agent/LLM layer.
