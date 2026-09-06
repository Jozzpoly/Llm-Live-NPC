# Pre-LLM Readiness Audit — Evidence Ledger

Status: **active discovery / falsification**

This file belongs only to the temporary readiness-evidence branch and PR #25. It is not canonical project architecture, is not a repair plan, and must not be merged into E1 unchanged.

## Exact substrate

Audit base / unchanged E1 runtime:

`9245c64474e894ac861c2529ae4919f906f106d1`

Runtime-clean pre-doc checkpoint:

`15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

Live compare established `15ed5e... -> 9245c644...` as documentation-only, so this audit studies the same runtime that passed the final E1 Owner gate.

Evidence branch:

`evidence/pre-llm-readiness-audit`

Evidence PR:

`#25` against `experiment/e1-grounded-notice-fetch`

Last exact evidence execution checkpoint before handoff-only docs:

`721b550abcb63e8cdcaece0ba6eeb22f9f81557c`

Characterization tests intentionally PASS when they reproduce an existing readiness gap. They are evidence, not fixes.

## Evidence hierarchy

1. Owner hands-on judgement for feel/readability/playability.
2. Exact live repository state and deterministic runtime behavior.
3. Characterization tests reproducing suspected failure modes.
4. Rendered-browser evidence for UI/layout/lifecycle contracts.
5. Cloudflare / platform documentation for infrastructure semantics.
6. Static source review where a runtime probe would add no meaningful discrimination.

Do not promote a static suspicion to a runtime defect when a direct probe can resolve it. Apparatus-invalid failures must be corrected before interpretation.

## PROVEN GAPS — reproducible or live-verified

### Validation / CI truth

- Canonical Vitest discovery omitted all `src/execution/*.test.ts` files. Existing executor tests therefore did not run in the previously reported full validation suite.
- Expanded discovery to `src/**/*.test.ts` exposes one existing red executor contract: contested pickup receives `target_out_of_range`, not the expected `target_unavailable`.
- This is not merely stale wording. Separate characterization shows the executor remains `running`, pursues an item after the player takes ownership, and can later fail for an incidental geometric reason such as `target_occluded` instead of the causal invalidation.
- The original existing executor test explicitly expected `target_unavailable` and executor failure after the player wins the item first, confirming the intended causal contract.

### Async cognition lifecycle / identity

- `cycleId` resets to `1` on every E1 arm session.
- A stale response from session A cycle `1` can finish a fresh session B cycle `1`, overwrite B provenance/status and cause B's real response to be ignored.
- A rejected stale request from a previous session can contaminate a newly armed session with `request_error`.
- Requests have no cancellation/timeout. An unresolved provider can keep the harness logically in flight indefinitely.
- A transport/provider failure consumes the triggering wake state and a cycle-budget slot; unchanged world state does not automatically retrigger the lost stimulus.
- These should converge later on one explicit session/request identity + attempt outcome/retry contract rather than independent special-case patches.

### Temporal observation semantics

- E1 observes sampled state deltas, not an event stream.
- A transient state that appears and disappears while cognition is in flight can leave no later cognition-visible trace.
- Same-tick `drop -> pickup` can generate two real World events while returning to baseline snapshot; E1 then sees zero `observedChanges` and makes zero provider calls.
- State observation and event observation therefore cannot be treated as interchangeable in a future embodied-perception layer.
- Current `WorldEvent` lacks event-time position/geometry and source/task/request causation. Therefore simply feeding the current event ring to an NPC would still be insufficient for honest local sensory filtering such as “was this event within perceptual range when it happened?”.

### Perception consistency / embodied semantics

- A visible relation can reveal the ID of an entity that did not itself pass the visibility gate. A held item can expose `heldBy = player.jozz` while the player entity is outside the perception radius.
- Worker sanitization bounds shape/collection sizes and fetch allow-lists, but does not independently enforce the browser's 220 px semantic range, normalized directions, unique visible entity IDs, or full internal consistency between current perception and `observedChanges`.
- The server is therefore shape-bounded and allow-list-consistent, not independently authoritative about temporal/local truth.
- E1 observer projection omits observer facing; entity `direction` is world-space `dx/dy`. Therefore current perception is not egocentric and cannot honestly encode front/behind/left/right relative to the NPC body.
- This orientation gap was outside E1's needs and is not an E1 regression, but becomes a foundation requirement before richer spatial attention/sight experiments.

### Held-item geometry / embodiment

- `followHeldItem()` derives a held item's canonical position from an actor offset without world-bound or blocker validation.
- Legal gameplay can place a held item's canonical center outside world bounds or inside an authored blocker/occluder.
- This affects cognition-visible temporal semantics: an actor can remain visible while a carried item is hidden by the attachment offset, so a later legal drop may appear as `item_entered_perception · free` instead of the semantically richer `holder player -> free` transition.
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

### Interaction / affordance / provenance

- `interact(player -> npc)` returns `succeeded · npc_interaction_requested` while producing no semantic World event; this is a placeholder stimulus contract.
- Interaction is asymmetric: NPC cannot use the same action to interact with the player.
- `ExecutionDriver`'s `playerActions` channel does not enforce player actor identity; an NPC action can be executed through that channel while the executor remains idle.
- World action/event records identify actor/target but not source/task/request causation. Therefore `NPC-001 picked up Lantern` is insufficient by itself to distinguish executor, script/harness or another caller.
- Current debug UI exposes only `world.lastActionResult()`, even though `ExecutionFrameResult` already carries all `playerActionResults[]` plus a separate `executorActionResult`. Multiple attempts in one tick can therefore be lost from the visible diagnostic surface.
- Future correlation should remain lightweight but continuous across lab run/session -> cognition request -> task execution -> World action/event -> experience.
- Current action/intention semantics are spread across World `interact|drop`, E1/Worker `fetch`, and executor `approach-and-interact`. Before expanding tool vocabulary, a small World-derived affordance seam is justified; generic planner/GOAP infrastructure is not.
- Executor `APPROACH_DISTANCE = 48` while World `INTERACTION_RANGE = 54`. This is currently conservative rather than failing behavior, but is evidence that interaction legality should not proliferate duplicated magic numbers.

### Input batching

- Multiple player atomic requests can occur in one fixed tick.
- Current UI ordering places `drop` before `interact`; a same-frame pair can drop and immediately re-pick the same item, producing two semantic events while ending in the original held state.
- This is deterministic, but intent arbitration policy is implicit.

### Manual debug/executor lifecycle

- Core `DeterministicExecutor.start()` correctly refuses to overwrite a running task.
- `WorldScene.startNpcFetchLanternTask()` still disarms E1 before calling `executor.start(...)` and ignores the boolean return.
- Debug button disabled state is based on the last emitted debug snapshot, so a short stale-state window can exist after E1 asynchronously starts the executor.
- A manual click in that window can disarm E1 even though core executor correctly refuses replacement. This is a small current-scope lifecycle debt; likely repair the WorldScene ordering/return contract rather than add UI complexity.

### Runtime / scaling

- A disarmed E1 harness still recomputes a full snapshot/perception after every execution step even though no cognition can run.
- WorldScene then takes another snapshot for presentation. Current specimen cost is negligible, so this is a bounded scaling debt rather than justification for spatial indexing or a large performance refactor.

### Worker ingress / cost / error boundary

- Public E1 and legacy P0 inference endpoints are unauthenticated experiment surfaces.
- Request JSON is fully parsed before E1 sanitization and before the rate limiter; there is no explicit small body-size guard at this route boundary.
- E1 accepts a valid JSON body even when `Content-Type: text/plain`; content type is not currently an ingress gate.
- The Workers Rate Limiting binding is approximate/per-location rather than a strict global quota/accounting system. Treat it as abuse damping, not exact budget protection.
- Legacy `/api/ai/qualify` remains an inference-capable historical probe, requires only POST, and can run two model candidates after the limiter. It should be consciously gated/retired before broader public runtime.
- Worker provider exceptions can return raw `error.message` to the public client. This is convenient for the lab but should later become a stable external error code plus internal observability if the surface becomes public-facing.
- Worker responses already carry model usage data, but current client/debug envelope discards it. This is a concrete observability loss, not justification for a billing dashboard.

### Runtime / deployment evidence provenance

- UI and `/api/health` expose stage/model/Gateway information but not exact build commit/deploy identity.
- Because Owner evidence often arrives as screen recordings, a small runtime build fingerprint would materially strengthen evidence correlation.
- Repository `main` is live-verified as unprotected with no required status checks and no repository rulesets.
- Cloudflare can successfully build/deploy a commit whose GitHub validation is red. Deployment success is therefore not qualification evidence and an invalid commit could currently reach `main` without a GitHub merge gate.
- Audit-only commits trigger Cloudflare preview builds. Native Cloudflare Build watch paths can later reduce docs/tests/workflow-only deployment noise.
- PR #23 and older PR descriptions are stale relative to later Owner/E1 evidence and current readiness findings; this is a takeover/continuity hazard.
- Several accidental/temp branches have been live-compared and shown to contain no unique implementation/evidence; they are safe later cleanup candidates.

## DEFENDED / PASS — attacked and currently not repair targets

- `World` remains canonical gameplay authority; Phaser/presentation cannot mutate entity truth through returned snapshots.
- Constructor input and read APIs use cloning sufficiently to prevent ordinary external alias mutation.
- Snapshot/event/action/placement read models are isolated copies.
- Valid external control vectors are checked before canonical mutation.
- `stepWithActorControls()` rejects duplicate actor IDs, rejects duplicating the player through actor controls, rejects invalid targets and validates finite movement before tick/movement mutation.
- Same initial specimen + same control/task sequence is deterministic in current tested substrate.
- ExecutionDriver ordering is explicit and deterministic; the debt lies in dynamic task validity/causal semantics, not nondeterministic scheduling.
- Contextual interaction selection has stable distance/ID tie-breaking.
- Placement target validation explicitly handles world bounds, blockers, full footprint, support blocker and ambiguous sites.
- Direct target selection does not silently fall back to another explicit target.
- Mobile-mode capability detection intentionally requires touch + coarse pointer + no hover; hybrid touch+mouse behavior is already tested.
- Mobile controls handle `pointercancel`, lost pointer capture, pinch cancellation and tap/action separation sufficiently for current page-lifetime runtime.
- Current rendered shell passes temporary Chromium smoke on desktop, narrow desktop, mobile portrait, mobile landscape and live portrait -> landscape -> portrait round-trip without reload.
- The first rotation test failure was apparatus-invalid: portrait CSS intentionally applies 6 px horizontal padding each side, so a 390 px viewport correctly produced a 378 px game shell. The corrected oracle compares pre/post portrait geometry and passes.
- Current dependency lockfile passes the temporary high-severity `npm audit` evidence job.
- Worker request sanitation bounds collection sizes, text lengths and tool argument decoding; no unbounded prompt-size path was found in the audited E1 shape.
- TypeScript already uses `strict: true`; no evidence currently justifies lint/type-hardening work for its own sake.
- Current bundle warning is not yet evidence of a user-visible performance problem.
- No committed runtime credentials/secrets were found in the audited config paths; Cloudflare bindings are used for platform resources.
- `wrangler.jsonc` explicitly pins `compatibility_date`, binding names and current rate-limit configuration.

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
- Whether a future soft reset/remount is required. Current `MobileOwnerControls` installs global window listeners without teardown, but this is not a current page-lifetime failure.
- Node is pinned to major `22` rather than an exact patch. This is currently a low-priority reproducibility choice, not a proven failure.

### Active unfinished probe

The next concrete falsification question at handoff is the World **step-duration / collision hidden contract**:

- public `World.stepWithActorControls()` permits `seconds <= 0.25`;
- collision uses candidate final position rather than swept trajectory;
- current authored blockers appear thick enough for normal fixed-step gameplay;
- `WorldSpecimen` does not enforce a minimum blocker thickness;
- a future otherwise-valid thin blocker may potentially be crossed by one legal large step.

Do not classify this as a defect until a bounded probe separates current specimen behavior from arbitrary authored thin-blocker behavior and identifies whether the real contract belongs to max step duration, specimen validation or swept collision.

## Current apparatus state

At exact evidence checkpoint `721b550abcb63e8cdcaece0ba6eeb22f9f81557c`:

- expanded Vitest discovery: **116 PASS / 1 FAIL**;
- the only FAIL is the known executor contested-target contract (`target_unavailable` expected, `target_out_of_range` received);
- `Readiness Browser Evidence`: PASS, including dynamic portrait -> landscape -> portrait round-trip;
- `Readiness Dependency Evidence`: PASS.

The red executor test is retained intentionally during discovery because it exposes a real dynamic task-validity mismatch. Do not make the evidence suite green by weakening the assertion before the underlying contract is deliberately resolved.

## Discovery stop condition

Do **not** stop because a predefined checklist is exhausted.

Discovery is ready to transition into a repair campaign only after multiple additional independent passes mostly produce one of:

- DEFENDED/PASS;
- duplicate of an already classified gap/root cause;
- deliberately missing future capability rather than present debt;
- low-value speculation with no concrete failure mode.

If broad new passes continue finding material new classes of failure, continue the audit.

After repairs, attack the repaired foundation again. Only a later state with no known material debt in the agreed current scope, clean full validation, rendered-runtime evidence, deployment provenance and Owner judgement can support readiness for the next major agent/LLM layer.
