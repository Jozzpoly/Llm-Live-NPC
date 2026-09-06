# Pre-LLM Readiness Audit — Fresh Takeover

Status: **active discovery / falsification; handoff prepared 2026-09-06**

This is the startup mandate for a fresh Browser ChatGPT conversation taking over `Jozzpoly/Llm-Live-NPC` during the expanded **pre-LLM readiness audit**.

Do not treat this as a request to resume feature implementation. The current job is to keep attacking and grounding the substrate until broad new passes stop discovering material new classes of failure. Only then should a bounded repair campaign be designed.

## 1. Owner intent and project role

`LLM Live NPC` is an experimental embodied-agent laboratory. The long-term question is not merely whether an LLM can roleplay an NPC in text, but whether an NPC can feel genuinely present in a shared world: perceive bounded local reality, preserve continuity, act through the same mechanics as the player, experience outcomes, and eventually support richer interaction without the prompt pretending that unobserved facts are known.

The initial world is intentionally small and web-native. It is a donor/laboratory candidate for future projects such as Multi_World, not a system that should be prematurely generalized into them.

Current priorities are evidence, causal correctness, debuggability and a strong embodied substrate. Do not add pathfinding, conversation, long-term memory, generic planning, multi-NPC architecture or other attractive features merely because they are absent.

Owner judgement remains first-class for playability, readability and feel. Technical work should remain reproducible and explainable.

## 2. Exact live topology to verify first

Repository:

`Jozzpoly/Llm-Live-NPC`

Canonical P1 integration branch:

`p1/playable-world-slice`

Canonical P1 head:

`e453f5862286328df92db91ba2f9adabc1e7899e`

P1 must remain historical qualified substrate; do not rewrite its evidence.

E1 experiment branch:

`experiment/e1-grounded-notice-fetch`

Expected E1 head at handoff preparation:

`9245c64474e894ac861c2529ae4919f906f106d1`

E1 PR:

`#23` — OPEN, DRAFT, NOT MERGED.

Important: PR #23's GitHub description is historically stale. E1 itself has already passed its intended Owner re-gate after the partial-pass repair. Treat the repo docs and the evidence summarized below as newer authority than the old PR body.

Active readiness evidence branch:

`evidence/pre-llm-readiness-audit`

Readiness PR:

`#25` — OPEN, DRAFT, NOT MERGED, **NEVER MERGE THIS CHARACTERIZATION BRANCH INTO E1 AS-IS**.

Last exact execution/evidence checkpoint before handoff-only documentation:

`721b550abcb63e8cdcaece0ba6eeb22f9f81557c`

At that checkpoint PR #25 was based exactly on E1 `9245c644...` and contained characterization tests, temporary browser/dependency evidence workflows and the readiness ledger. If live PR #25 head is later, inspect the commits after `721b550a...` first; the intended next commits are handoff/ledger documentation only unless live evidence proves otherwise.

## 3. Read in this order

After verifying live refs, read:

1. `evidence/pre-llm/PRE_LLM_READINESS_FRESH_TAKEOVER.md` — this file.
2. `evidence/pre-llm/PRE_LLM_READINESS_AUDIT_LEDGER.md` — classified evidence map.
3. `docs/PROJECT_STATE.md` on E1 branch/base.
4. `docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md`.
5. `docs/FRESH_TAKEOVER.md`.
6. PR #25 changed filenames and the characterization tests relevant to the next audit question.

Do not begin by rereading the whole repository indiscriminately. Recover the canonical spine first, then inspect source/tests targeted to the next falsification question.

## 4. Evidence hierarchy

Use this ordering when claims conflict:

1. Owner hands-on judgement for feel/readability/playability.
2. Exact live repository state and deterministic runtime behavior.
3. Reproducing characterization tests.
4. Rendered-browser evidence for UI/layout/lifecycle behavior.
5. Platform documentation for Cloudflare semantics.
6. Static source review when runtime probing adds no useful discrimination.

A characterization test intentionally PASSes when it reproduces an existing defect. PASS does not mean the substrate behavior is desirable.

Never promote a suspicion to a proven runtime defect if a cheap direct probe can resolve it. If a test fails because the oracle/fixture is wrong, classify it **APPARATUS-INVALID**, repair the apparatus, and only then interpret runtime behavior.

## 5. What E1 actually qualified

E1 is already closed at its intended research boundary. It qualified only this bounded causal loop:

`player-caused local World change`
→ bounded local projection around `npc.001`
→ small sampled temporal perceptual delta
→ real Workers AI / Granite intention restricted to `wait | fetch`
→ client validation/revalidation
→ existing deterministic executor
→ canonical `World` action/outcome
→ a subsequent cognition cycle carrying the real outcome as short E1 experience.

The final Owner recording showed the post-pickup second cycle settling to `wait` with real model/Gateway provenance and the NPC-held state. Do not repeat E1 research merely because PR #23's body still says the re-gate was pending.

Non-claims remain important:

- geometric LOS is only an occlusion primitive, not qualified sight;
- E1 experience is not long-term memory;
- symbolic labels/kinds are not visual object recognition;
- E1 is not generic autonomy;
- browser `World` remains canonical, so the Worker is not independently authoritative about temporal/local truth.

## 6. Why the current phase exists

After E1 passed, Owner explicitly asked for a much wider critical audit before placing heavier LLM/agent logic on top of the substrate. The concern was that apparently small runtime/UI defects exposed how much could remain hidden behind green tests or narrow experiment scope.

Feature work was therefore frozen and the audit was expanded from cleanup into a broader **readiness / gap audit**.

The goal is not impossible mathematical perfection. The target is:

**no known material technical/foundational debt in the agreed current substrate scope before the next heavy agent layer.**

Do not classify every missing future capability as debt.

## 7. Current most important PROVEN gaps

The ledger is the detailed source. The following are the highest-signal clusters that must survive takeover.

### A. Validation truth and executor dynamic validity

Canonical Vitest discovery previously omitted `src/execution/*.test.ts`. Expanded discovery exposed a pre-existing red contract.

Latest exact main Check at `721b550a...`:

- 116 tests PASS;
- 1 test FAIL;
- the only failure is `src/execution/deterministic-executor.test.ts` / `preserves player-action-before-executor-action ordering inside the shared driver`;
- expected causal outcome after player takes the target item first: `target_unavailable`;
- actual outcome: `target_out_of_range`.

Separate characterization proves this is not merely stale wording: executor can remain `running` and pursue an item now held by the player, then later fail for incidental geometry such as `target_occluded`. The original existing test explicitly intended `target_unavailable` and executor failure.

Do not make the suite green by weakening this assertion during discovery.

### B. Async cognition lifecycle / identity

Proven:

- E1 `cycleId` restarts from `1` on each arm session;
- stale session A cycle 1 can collide with fresh session B cycle 1 and mutate B state;
- a rejected old request can contaminate a newly armed session;
- no request timeout/cancellation means a provider promise may leave cognition in-flight indefinitely;
- transport failure consumes wake state and cycle budget, so an unchanged triggering stimulus is lost rather than automatically retried.

Future repair direction should converge on explicit request/session identity plus deliberate attempt outcome/retry semantics rather than piling individual special cases onto the harness.

### C. Sampled perception is not event history

E1 derives temporal change by comparing sampled local projections.

Proven failure mode: real transient World changes can occur and return to baseline before cognition is able to sample them. Same-tick `drop -> pickup` can produce real World events but zero later E1 `observedChanges` and zero provider calls.

Do not solve this by blindly feeding the current debug World event ring into the model. Current `WorldEvent` does not preserve enough event-time locality/causation for future local sensory filtering.

A future minimal perceptual-event seam will need bounded event-time context, not a general event-sourcing platform.

### D. Held-item embodiment changes cognition-visible history

`followHeldItem()` uses an actor-relative offset without blocker/world-bound validation.

Legal play can place canonical carried-item geometry outside world bounds or inside an occluding blocker. This is not merely visual: a visible player can carry a held item into a wall so the item disappears from E1 projection; after legal drop it may reappear as `item_entered_perception · free` rather than the real `holder player -> free` transition.

This proves attachment geometry can alter the temporal history supplied to cognition.

### E. WorldSpecimen ingress integrity

Current construction does not fully enforce the assumptions used by runtime APIs.

Characterized examples include:

- more than one player accepted despite singular-player APIs;
- duplicate blocker/location/site IDs accepted;
- inconsistent actor/item ownership accepted;
- logically paired held ownership may start with physically inconsistent geometry until first step;
- non-finite authored values such as `actorSpeed = NaN` can poison positions;
- missing held-item referent can throw only after a frame has already incremented tick/moved actor.

Likely corrective family: ingress/specimen validation, not a generic rollback engine.

### F. Location semantics are underspecified

Locations can overlap. Current singular location is chosen by first array match, so reordering authored locations can change location identity at the same point.

Player receives location lifecycle events; NPC location is separately recomputed by E1 projection.

Do not make location identity durable memory/belief truth until overlap/membership/priority semantics are deliberately resolved.

### G. Interaction, affordances and causal provenance

Current world atomic vocabulary is only `interact | drop`; E1/Worker separately derive `fetch`; executor separately owns `approach-and-interact`.

`interact(player -> npc)` currently reports `succeeded · npc_interaction_requested` without a semantic World event and is placeholder/asymmetric behavior.

`ExecutionDriver.playerActions` does not itself enforce player actor identity.

World events/action results identify actor/target but not source task/request/agent-run causation. Debug UI also collapses a frame to `world.lastActionResult()`, losing other player/executor attempts already present in `ExecutionFrameResult`.

Before expanding tool vocabulary, prefer a small World-derived affordance seam and a lightweight continuous correlation chain, not GOAP/behavior-tree/observability frameworks.

Also note current duplicated range semantics: executor `APPROACH_DISTANCE = 48`, World `INTERACTION_RANGE = 54`. This is presently conservative, not itself a bug, but indicates the legal interaction contract should not proliferate magic numbers.

### H. Public Worker / cost surface

Current experiment endpoints are public/unauthenticated.

Proven or live-reviewed boundaries:

- E1 request body is parsed before rate limiting;
- route has no explicit small body-size gate;
- E1 accepts valid JSON even with `Content-Type: text/plain`, so content type is not a gate;
- Worker sanitizes shape/collections/text lengths well, but does not independently enforce browser 220 px semantics, normalized directions, unique visible IDs or full temporal consistency;
- rate limiting is abuse damping, not exact global accounting;
- historical `/api/ai/qualify` remains live and can run two model candidates after a simple POST;
- provider exceptions can expose raw `error.message` to the client;
- Worker returns usage data, but current client/debug envelope discards it.

Do not build account infrastructure prematurely. First decide the minimal hardening required for the lab versus future public game runtime.

### I. Runtime evidence provenance

UI and `/api/health` expose stage/model/Gateway state but no exact build commit/deploy identity. Owner evidence often arrives as screen recordings, so a small build fingerprint would materially improve evidence correlation.

Do not turn this into a deployment platform.

### J. Manual B2 trigger residual lifecycle race

Core executor now refuses overwriting a running task. However `WorldScene.startNpcFetchLanternTask()` still disarms E1 before calling `executor.start()` and ignores its boolean return.

Debug button disabling is based on the last emitted debug state, so there is a small stale-state window where E1 may have asynchronously started the executor while the button still appears usable. A manual click can then disarm E1 even though the executor correctly refuses replacement.

Small current-scope lifecycle debt; likely repair the WorldScene ordering/return contract, not add UI complexity.

### K. Perception is not yet egocentric sight

E1 observer projection omits observer facing. Entity direction is world-space `dx/dy`. Therefore the model cannot honestly derive `in front / behind / left / right` relative to its body.

This was not required by E1 and is not an E1 regression. It becomes a foundation requirement before spatial attention/embodied sight experiments.

The current debug panel provides IDs/deltas/provenance, while the map overlay shows only the 220 px range and raw NPC↔player LOS. Before richer perception work, a small visual per-entity perception/rejection overlay is justified as research apparatus.

## 8. Important DEFENDED/PASS areas

Do not reopen these without new evidence:

- `World` remains canonical gameplay authority; returned snapshots/read models do not alias mutable canonical state.
- Same specimen + same inputs/task sequence is deterministic in current tested scope.
- actor-control cardinality is validated before mutation: duplicate actor controls and player duplication through `actorControls` are rejected.
- finite movement validation is pre-mutation.
- explicit direct target does not silently fall back to another target.
- placement validation handles bounds/blockers/full item footprint/support/ambiguous sites.
- prompt/request sanitizer bounds collection size, text length and tool argument decoding; there is no hidden unbounded prompt-string path in the audited E1 request shape.
- mobile touch/coarse-pointer capability detection has explicit hybrid behavior tests.
- mobile controls handle `pointercancel`, lost pointer capture and pinch/tap cancellation sufficiently for current page-lifetime runtime.
- rendered browser shell PASSes desktop, narrow desktop, mobile portrait, mobile landscape and now **live portrait -> landscape -> portrait round-trip without reload**.
- dependency evidence currently PASSes high-severity audit.
- TypeScript `strict` is already enabled.
- current bundle-size warning is not yet evidence of user-visible performance failure.
- Cloudflare `compatibility_date` and bindings are explicitly pinned in `wrangler.jsonc`.

Mobile global window listeners lack teardown, but current runtime is page-lifetime singleton. Treat teardown as relevant if/when soft reset/remount becomes a chosen requirement; do not manufacture a refactor now.

## 9. Deliberately missing — do not call these debt by absence

Without a concrete current failure, do not automatically implement:

- pathfinding/navmesh/general obstacle solving;
- full actor-actor collision gameplay semantics;
- speech/hearing;
- long-term/episodic memory;
- generic planner/GOAP/behavior tree;
- multi-NPC coordination;
- persistence/save system;
- final map-authoring pipeline;
- final conversation UI;
- final LLM/model choice;
- large-scale spatial indexing;
- generic observability/OpenTelemetry stack.

## 10. Latest apparatus state

At exact evidence checkpoint `721b550abcb63e8cdcaece0ba6eeb22f9f81557c`:

- GitHub `Check`: **116 PASS / 1 known executor-contract FAIL**;
- `Readiness Browser Evidence`: **PASS**;
- `Readiness Dependency Evidence`: **PASS**.

The browser rotation probe initially failed because the test incorrectly expected almost full viewport width in portrait. CSS intentionally applies 6 px horizontal padding each side, so 390 px viewport -> 378 px game shell. That first failure was **APPARATUS-INVALID**. The corrected oracle compares portrait geometry before and after the orientation round-trip; it PASSes.

Keep this example in mind: audit rigor applies to the tests too.

## 11. Immediate frontier for the new conversation

Do **not** start by repairing the known list.

First re-ground live and continue discovery.

The first unfinished concrete probe from the previous conversation is the **World step / collision hidden contract**:

- `World.stepWithActorControls()` publicly accepts `seconds <= 0.25`;
- movement collision is resolved from the candidate final position rather than swept trajectory;
- current authored blockers appear thick enough for current normal fixed-step gameplay;
- `WorldSpecimen` does not enforce a minimum blocker thickness;
- therefore a future legal thin blocker may potentially be crossed by one otherwise legal large step.

Do not assume this is a bug until reproduced. Build one bounded characterization probe that separates:

1. current specimen behavior;
2. arbitrary valid authored thin-blocker behavior;
3. whether the real correction belongs to step-duration contract, specimen validation or swept collision.

Then continue several additional **independent** broad passes, preferably across different classes rather than variants of known failures. Candidate classes may include reset/remount lifecycle, causal frame observability, specimen topology invariants, local sensory/event boundaries, worker/public runtime boundaries, or other substrate assumptions discovered live.

Do not keep writing tests for the same async ABA problem under different response shapes once the root class is already proven.

## 12. Discovery stop condition

Do not stop because a checklist runs out.

Transition to a repair campaign only when multiple additional independent passes mostly result in:

- DEFENDED/PASS;
- duplicate of an already classified root cause;
- deliberately missing future capability;
- low-value speculation without a concrete failure mode.

If broad passes still discover material new classes, continue the audit.

Once discovery is saturated:

1. consolidate findings into a small dependency-aware repair plan;
2. repair root causes rather than symptoms;
3. re-attack the repaired foundation;
4. run full validation + rendered browser evidence + deployment provenance;
5. obtain Owner judgement where hands-on behavior matters;
6. only then claim `zero known material debt in the agreed current scope` and decide whether the substrate is ready for the next major embodied-agent layer.

## 13. Hard prohibitions during takeover

- Do not merge PR #25.
- Do not merge or mark PR #23 ready without explicit Owner integration decision.
- Do not weaken the red executor assertion just to make CI green.
- Do not mutate P1 historical evidence.
- Do not call geometric LOS `sight`.
- Do not call E1 experience `memory`.
- Do not introduce new LLM features during readiness discovery.
- Do not turn absent future capabilities into a giant refactor backlog.
- Do not silently trust SHAs from this document; verify live first.

## 14. Recommended first response behavior in the fresh conversation

The new assistant should not ask Owner to restate the project. Verify live state, read this takeover and ledger, report a compact grounding checkpoint, then continue the unfinished audit autonomously.

A short Owner command such as `kontynuuj`, `działaj` or `rozszerz audyt` should be sufficient after grounding.
