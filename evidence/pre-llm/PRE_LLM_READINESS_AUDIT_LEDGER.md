# Pre-LLM Readiness Audit — Evidence Ledger

Status: **active discovery / falsification**

This file belongs only to temporary readiness-evidence branch / PR #25. It is characterization apparatus, not canonical architecture or a repair branch, and must **never** be merged into E1 as-is.

## Exact substrate

Audit base / unchanged E1 runtime:

`9245c64474e894ac861c2529ae4919f906f106d1`

Runtime-clean pre-doc checkpoint:

`15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

The audit branch changes only tests, audit workflows/config and evidence documentation. It does not alter the E1 runtime under characterization.

Latest exact evidence checkpoint before this ledger consolidation:

`f0bfad954b3fea72a59b5735befc5d9e0e79475e`

At that checkpoint the expanded suite has **130 PASS / 1 known FAIL**. The sole failure remains the pre-existing executor contested-target contract described below. Targeted World, Worker-boundary, browser, dependency and Cloudflare preview evidence all PASS.

Characterization tests intentionally PASS when they reproduce an existing readiness gap; PASS means the behavior was reproduced, not that the behavior is desirable.

## Evidence hierarchy

1. Owner hands-on judgement for feel/readability/playability.
2. Exact live repository state and deterministic runtime behavior.
3. Reproducing characterization tests.
4. Rendered-browser evidence for UI/layout/lifecycle behavior.
5. Platform documentation where platform semantics matter.
6. Static source review when a runtime probe would add no useful discrimination.

Do not promote suspicion to a runtime defect when a cheap direct probe can resolve it. Apparatus-invalid failures must be corrected before interpreting the runtime.

# PROVEN GAPS — reproducible or live-verified

## Validation / CI truth

- Canonical Vitest discovery previously omitted `src/execution/*.test.ts`; existing executor tests therefore did not run in the earlier reported full suite.
- Expanded discovery `src/**/*.test.ts` exposes one existing red contract in `src/execution/deterministic-executor.test.ts`: after the player wins a contested pickup, the executor result is `target_out_of_range` while the established test expects causal `target_unavailable` and executor failure.
- Separate characterization proves this is not stale wording: the executor can remain `running`, continue pursuing an item now held by the player, and later fail for incidental geometry such as `target_occluded`.
- Do not weaken the existing assertion merely to make CI green during discovery.

## Async cognition lifecycle / identity

- E1 `cycleId` resets to `1` on every arm session.
- A stale response from session A cycle `1` can finish fresh session B cycle `1`, overwrite B provenance/status, and cause B's real response to be ignored.
- A rejected old request can contaminate a newly armed session with `request_error`.
- Requests have no cancellation/timeout; an unresolved provider can keep the harness logically in flight indefinitely.
- Transport/provider failure consumes the wake fingerprint and a cycle-budget slot; unchanged triggering world state is not automatically retried.
- Same-session request serialization itself is defended: the gate marks the request in-flight synchronously before `runCycle()` proceeds. The defect is cross-session identity/lifecycle, not ordinary parallel same-session calls.
- Future repair should converge on explicit session/request identity plus deliberate attempt outcome/retry semantics instead of independent special cases.

## Temporal observation semantics

- E1 observes sampled bounded-state deltas, not event history.
- A transient World state can appear and disappear while cognition is in flight and leave no later cognition-visible trace.
- Same-tick `drop -> pickup` can produce real semantic World events while returning to the prior sampled state; E1 then sees zero `observedChanges` and zero provider calls.
- Current `WorldEvent` lacks event-time geometry/locality and source/task/request causation, so simply feeding the current diagnostic event ring to the model would not create honest local sensory history.
- State observation and event observation therefore cannot be treated as interchangeable in a later embodied-perception layer.

## Perception consistency / embodied semantics

- A visible relation can reveal an entity ID that did not itself pass the visibility gate: a visible held item can expose `heldBy = player.jozz` while the player is outside the 220 px radius.
- Worker sanitation bounds request shape, collection sizes, text lengths and fetch allow-lists but does not independently enforce browser 220 px semantics, normalized directions, unique visible IDs or full current/temporal consistency.
- The Worker is shape-bounded and allow-list-consistent, not independently authoritative about local/temporal truth.
- E1 observer projection omits observer facing; entity direction is world-space `dx/dy`. Current perception is therefore not egocentric and cannot honestly encode front/behind/left/right relative to the NPC body.
- This orientation gap was outside E1 and is not an E1 regression, but it becomes foundational before richer spatial attention/sight experiments.

## Held-item geometry / embodiment

- `followHeldItem()` places a held item's canonical geometry at an actor-relative offset without world-bound or blocker validation.
- Legal play can place canonical carried-item geometry outside world bounds or inside an occluding blocker.
- This can alter cognition-visible temporal history: an actor may stay visible while the held item disappears behind the attachment geometry, so a later legal drop can look like `item_entered_perception · free` instead of the real holder transition.
- Player/NPC bodies can overlap. This is characterized but remains deliberately unqualified rather than automatically classified as repair debt.

## WorldSpecimen ingress integrity

World construction admits states that runtime APIs implicitly assume are valid:

- more than one player despite singular-player APIs;
- duplicate blocker/location/placement-site IDs;
- inconsistent actor/item ownership;
- logically reciprocal ownership with physically inconsistent held-item geometry until the first step;
- non-finite specimen values such as `actorSpeed = NaN`, which can poison canonical positions;
- missing held-item referent that throws only after a frame has already advanced tick/moved an actor;
- an actor spawned overlapping a blocker; zero movement does not repair the overlap;
- a free item whose full geometry begins outside world bounds;
- a placement site whose `supportBlockerId` exists but is spatially unrelated, while placement validation still reports that blocker-backed site as accepted support.

The current authored specimen is materially healthier than the admitted contract: current actors and free items begin in bounds; free items begin outside blocker footprints; the current supported placement site overlaps its referenced support blocker. These PASSes distinguish a presently coherent authored map from a too-permissive ingress boundary.

Likely corrective family remains ingress/specimen validation, not a generic rollback engine.

## Movement / collision hidden contract

Direct characterization resolved the previous unfinished collision question:

- `World.stepWithActorControls()` publicly accepts `seconds <= 0.25`;
- movement collision checks candidate endpoint positions rather than a swept trajectory;
- the current authored 20 px workshop wall blocks the current actor at the legal 0.25 s maximum under current speed;
- an otherwise admissible 1 px blocker can be crossed by one legal 0.25 s step;
- the same thin blocker correctly stops the normal current 30 Hz step;
- because specimen `actorSpeed` is not bounded by an ingress contract, a sufficiently high but finite authored speed can also tunnel through a current-thickness wall during an otherwise normal 30 Hz step.

Therefore the hidden contract is real, but it is not simply “the current map is broken.” The later repair decision must deliberately choose where legality belongs: validated specimen/movement-distance bounds, a tighter step contract, or swept collision. Do not smuggle in generalized physics/pathfinding work.

## Location semantics

- Location lifecycle/events are player-only; NPC location is separately recomputed in E1 projection.
- Authored location zones overlap.
- Singular location identity uses first array match, so the same point can change semantic location solely by reordering authored zones.
- Location overlap/membership/priority semantics must be deliberate before location identity becomes durable memory/belief truth.

## Interaction / affordance / causal provenance

- `interact(player -> npc)` reports `succeeded · npc_interaction_requested` but creates no semantic World event; it is placeholder/asymmetric behavior.
- NPC cannot use the same action to interact with the player.
- `ExecutionDriver.playerActions` does not enforce player actor identity; an NPC action can be executed through that channel while the executor remains idle.
- World actions/events identify actor/target but not source task/request/agent-run causation.
- `ExecutionFrameResult` itself **does** preserve all same-frame `playerActionResults[]` plus the separate executor result. A new probe confirms the information is not lost in the driver.
- `World.lastActionResult()` collapses that richer frame to only the last attempt; current debug state reads this collapsed value. The causal-observability gap therefore sits in the readout/debug surface, not in `ExecutionFrameResult`.
- E1 self-experience is also defended from this specific collapse: it consumes `frame.executorActionResult` plus executor state rather than `world.lastActionResult()`.
- Future correlation should remain lightweight but continuous across lab run/session -> cognition request -> task -> World attempt/event -> experience.
- Current action/intention semantics remain spread across World `interact|drop`, E1/Worker `fetch`, and executor `approach-and-interact`; before expanding tool vocabulary, prefer a small World-derived affordance seam rather than generic GOAP/behavior-tree infrastructure.
- Executor `APPROACH_DISTANCE = 48` vs World `INTERACTION_RANGE = 54` is currently conservative, not itself a failing behavior, but interaction legality should not proliferate magic numbers.

## Input batching

- Multiple player atomic requests can occur in one fixed tick.
- Current UI ordering queues `drop` before `interact`; same-frame input can drop and immediately re-pick the same item, producing two semantic events while ending in the original held state.
- Ordering is deterministic but intent arbitration policy is implicit.

## Manual debug / executor lifecycle

- `DeterministicExecutor.start()` correctly refuses replacement of a running task.
- `WorldScene.startNpcFetchLanternTask()` still disarms E1 before calling `executor.start()` and ignores its boolean return.
- Debug button disabling reflects the last emitted debug snapshot, so a small stale-state window can exist after E1 asynchronously starts the executor.
- A manual click in that window can disarm E1 even though the executor correctly refuses replacement.
- This is small current-scope lifecycle debt; likely repair the WorldScene ordering/return contract, not UI architecture.

## Runtime / scaling

- A disarmed E1 harness still recomputes a snapshot/perception after every execution step even though cognition cannot run.
- WorldScene subsequently snapshots again for presentation.
- Current specimen cost is negligible; classify this as bounded scaling debt, not justification for spatial indexing or a performance framework.
- WorldScene bounds incoming render delta to 100 ms before fixed-step accumulation, limiting catch-up work after a stall. No unbounded catch-up storm is currently demonstrated.

## Worker ingress / inference cost / error boundary

- E1 and historical P0 inference endpoints are public unauthenticated experiment surfaces.
- E1 consumes/parses request JSON before sanitation and before the rate limiter; there is no explicit small body-size gate at this route boundary.
- E1 accepts valid JSON carried as `Content-Type: text/plain`.
- Direct characterization proves this matters beyond response CORS: a foreign-origin simple `text/plain` POST can reach the E1 model even though the foreign page cannot read the response.
- The historical `/api/ai/qualify` route is an even simpler cross-site invocation surface: a foreign-origin simple POST with no body can pass the current route shape and run both model candidates when the limiter accepts it; the response still lacks readable CORS permission.
- Therefore “no CORS response” is not a cost/side-effect boundary. The current routes need a conscious future invocation/auth/origin/content-type policy before broader public exposure.
- Workers Rate Limiting remains abuse damping rather than exact global accounting.
- Provider exceptions can expose raw `error.message` to the public client.
- Worker responses carry model usage, but the current client/debug envelope discards it.
- Do not build account infrastructure during discovery; later hardening should be proportional to the lab/public-runtime boundary.

## Runtime / deployment evidence provenance

- UI and `/api/health` expose stage/model/Gateway state but not an exact build commit/deploy fingerprint.
- Owner evidence often arrives as recordings, so a small build fingerprint would materially improve evidence correlation.
- Repository `main` is live-verified as unprotected with no required status checks/rulesets.
- Cloudflare can build/deploy a commit whose GitHub validation is red; deployment success is not qualification evidence.
- Audit-only commits trigger preview deployments; later watch-path filtering may reduce evidence-branch deployment noise.
- PR #23 has since been updated to point at the readiness audit, so the earlier concern that its body still claimed the old E1 re-gate state is no longer current. Older historical descriptions can still be stale and should not outrank live docs/runtime evidence.
- Several accidental/temp branches have been compared and contain no unique canonical implementation/evidence; they remain cleanup candidates rather than runtime debt.

# DEFENDED / PASS — attacked and currently not repair targets

- `World` remains canonical gameplay authority; returned snapshots/read models do not alias mutable canonical state.
- Constructor input/read APIs use cloning sufficiently to prevent ordinary external alias mutation.
- Snapshot/event/action/placement read records are isolated copies.
- External continuous controls are validated before canonical mutation; duplicate actor controls, player duplication through actor controls, missing actors and non-finite movement are rejected pre-mutation.
- Same specimen + same control/task sequence is deterministic in tested scope.
- ExecutionDriver ordering is explicit/deterministic; the debt is dynamic task validity and causal semantics, not nondeterministic scheduling.
- Contextual interaction target tie-breaking is stable by distance then ID.
- Placement target validation handles world bounds, blocker footprint, site fit, support blocker exclusion and ambiguous sites.
- Explicit direct target does not silently fall back to another target.
- Current authored actor/free-item spawn geometry and the current supported site are coherent even though ingress does not guarantee those properties for arbitrary specimens.
- Current fixed 30 Hz movement is blocked by the characterized thin wall; tunnelling requires the larger legal step or otherwise admitted high authored speed.
- Mobile capability detection and hybrid behavior are explicitly tested.
- Mobile controls handle `pointercancel`, lost pointer capture, pinch cancellation and tap/action separation sufficiently for the current page-lifetime singleton runtime.
- Current app has no chosen soft-reset/remount lifecycle; missing global mobile-listener teardown remains an unknown tied to a future lifecycle requirement, not a demonstrated current failure.
- Rendered shell passes desktop, narrow desktop, mobile portrait, mobile landscape and live portrait -> landscape -> portrait without reload.
- The earlier portrait-width failure was apparatus-invalid: CSS intentionally gives 6 px horizontal padding per side; corrected pre/post geometry oracle passes.
- Dependency evidence passes the temporary high-severity audit.
- Worker request sanitation bounds collection sizes, text lengths and tool decoding; there is no hidden unbounded prompt-string path in the audited E1 shape.
- TypeScript `strict` is enabled.
- Current bundle warning is not evidence of a user-visible performance failure.
- No committed runtime credentials/secrets were found in audited config paths; Cloudflare bindings are used for platform resources.
- `wrangler.jsonc` pins compatibility date, bindings and current rate-limit config.

# DELIBERATELY MISSING / NOT DEBT BY ABSENCE ALONE

Do not automatically implement without a concrete current failure or bounded next experiment:

- pathfinding/navmesh/general obstacle solving;
- full actor-actor collision gameplay semantics;
- hearing/speech propagation;
- long-term/episodic memory;
- generic planner/GOAP/behavior tree;
- multi-NPC coordination;
- persistence/save format;
- final map-authoring pipeline;
- final conversation UI;
- final model choice;
- large-scale spatial indexing;
- generic observability/OpenTelemetry stack.

# IMPORTANT UNKNOWNS / decisions not yet promoted to defects

- Desired actor-body interaction/separation semantics for embodied presence.
- Time-domain semantics for future memory: simulation ticks vs active simulation time vs wall-clock time.
- Normal-runtime AI Gateway payload/logging policy once real dialogue/player data exists.
- Appropriate auth/session boundary for a private lab versus a public game.
- Whether location zones should be disjoint, prioritized, nested or multi-membership.
- Whether soft reset/remount becomes a requirement; if it does, global mobile listener teardown must be revisited.
- Node is pinned to major `22`, not an exact patch; currently a low-priority reproducibility choice, not a proven failure.

# Current apparatus state

At exact checkpoint `f0bfad954b3fea72a59b5735befc5d9e0e79475e`:

- expanded Vitest: **130 PASS / 1 FAIL** across 131 tests;
- sole FAIL: existing executor contested-target contract (`target_unavailable` expected, `target_out_of_range` received);
- `Readiness World Evidence`: PASS, including step/collision, topology/spawn and frame-observability probes;
- `Readiness Worker Boundary Evidence`: PASS, including E1 semantic-boundary and cross-origin invocation characterization;
- `Readiness Browser Evidence`: PASS;
- `Readiness Dependency Evidence`: PASS;
- Cloudflare preview build: PASS, Version ID `624b8313-4a1f-4b3e-9b00-95399a107222`.

The audit PR still contains no runtime-source modification relative to E1; it remains characterization apparatus.

# Discovery state / next frontier

Discovery remains active. Do **not** begin repairs yet.

The collision frontier is now resolved as a proven hidden-contract gap. Two subsequent independent World passes (spawn integrity and execution-frame observability) mostly reinforced already-known root causes rather than opening new classes, which is an early saturation signal. However the cross-origin inference pass did uncover a new material public-runtime/cost boundary, so saturation is not established yet.

Continue several independent broad falsification passes across different substrate classes. Prefer tests that distinguish:

- current authored specimen health from arbitrary admitted specimen states;
- actual runtime loss from debug/readout loss;
- current page-lifetime behavior from hypothetical future lifecycle requirements;
- existing root-cause duplicates from genuinely new material classes.

Transition to repair design only after multiple additional independent passes mostly produce one of:

- DEFENDED/PASS;
- duplicate/root-cause reinforcement;
- deliberately missing future capability;
- low-value speculation with no concrete present failure.

After repairs, attack the repaired foundation again. Only a later state with no known material debt in agreed scope, clean full validation, rendered-runtime evidence, deployment provenance and Owner judgement can support the next major agent/LLM layer.
