# LLM Live NPC — Fresh Takeover

Use this document to start a fresh Browser ChatGPT conversation after Pass 0 selective recovery, Pass 1 Presence Contract closure and Pass 2 architecture-selection closure.

## 1. First action: verify live truth

Repository:

`Jozzpoly/Llm-Live-NPC`

Current research/refoundation line:

`recovery/owner-fail-2026-09-07`

Recovered runtime evidence checkpoint:

`b31a851c3f708077fbf9e6fb8206fa392f8def13`

Do **not** trust copied SHAs without live verification.

The branch should be newer than `b31a851c...` because later commits may be docs/research closure. If runtime/product files changed after that checkpoint, inspect and classify them before extending any runtime claim.

`main` intentionally remains the historical P0 checkpoint:

`f207419ee87c03979544d2d579e624f043300bbc`

The old P1 integration PR #3 and failed-readiness PR #47 are closed without merge. There should be no open PR unless newer work has started.

## 2. Read in this order

1. `README.md`
2. `docs/PROJECT_STATE.md`
3. `docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`
4. `docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md`
5. this file

Only then inspect historical/evidence surfaces when exact provenance is needed:

- PR #47 — decisive Owner/browser FAIL of the old readiness line;
- PRs #70–#74 — final selective recovery repairs;
- PR #75 — evidence-only combined R8 re-attack;
- PR #77 — canonical Pass 1 closure;
- PR #3 — historical P1 donor/integration line;
- `docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md` — historical E1 design context.

Do not reconstruct the project by reading every old readiness branch first.

## 3. Historical boundary you must preserve

### Failed old readiness line

`experiment/e1-grounded-notice-fetch` advanced beyond the last good pre-readiness runtime. Automated evidence became strong, but the final 2026-09-07 Owner/browser gate found the playable laboratory materially worse than the earlier good surface.

That Owner FAIL remains valid negative evidence.

### Selective recovery

Recovery deliberately restarted from:

`15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

It did **not** forward-merge the failed readiness line. Useful changes were independently re-earned when justified.

Recovered runtime checkpoint:

`b31a851c3f708077fbf9e6fb8206fa392f8def13`

Never describe the failed line as having been “fixed forward” into recovery.

## 4. What the recovered runtime is qualified to claim

Bounded recovered loop:

`World truth → bounded E1 evidence → tiny wait|fetch cognition → revalidation → deterministic executor → World attempt/outcome → subsequent experience`

Qualification at `b31a851c...`:

- 145/145 tests across 26 files;
- strict TypeScript/build/preview PASS;
- Cloudflare PASS;
- Worker Version ID `0e1a7e36-edba-4660-8fa2-f2b38172d760`.

Final combined evidence-only R8 PR #75:

- head `72ea11abd7a0b56230ced6019e7c550b5109b476`;
- one added test file, no runtime changes;
- 149/149 tests across 27 files;
- combined R8 4/4 PASS;
- Cloudflare Version ID `ff9be74c-754a-46b0-851f-36ffb8a9233b`;
- closed without merge.

This is enough to preserve the old substrate as a bounded donor. It is **not production readiness** and **not a fresh final Owner/browser PASS**.

Pass 1 and Pass 2 closure commits after `b31a851c...` are research/docs decisions unless live diff proves otherwise. Do not silently expand the runtime claim from their newer SHA alone.

## 5. Pass 1 closure — what the project is trying to prove

The project is no longer defined as “make the LLM choose a grounded action”.

North star:

> **Create one persistent resident of a shared simulated world whose experience is grounded, whose meaningful unresolved consequences persist, whose semantic cognition can interpret novel language and revise intentions without fabricating reality, and whose physical/communication outcomes remain determined by the world.**

Shorthand:

> **meaning may be generative; reality must remain grounded.**

Strong product invariants include:

- one resident / one shared present;
- situated evidence rather than omniscience;
- epistemic provenance: saying X ≠ X being true;
- continuity and unresolved consequence beyond individual inference;
- legitimate uncertainty;
- real semantic agency from novel language/context;
- intention ≠ attempt ≠ success;
- World/execution remains final authority over factual outcomes;
- temporal coherence without requiring continuous LLM computation;
- communication exists in one world-grounded reality rather than private per-player NPC copies.

Read the full contract:

`docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`

## 6. Pass 2 closure — current architecture decision

Pass 2 compared current repo donors and several external architecture families against the same Presence Life Test.

Canonical decision:

`docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md`

Current-best architecture for the **first Presence experiment** is a **Minimal Resident Kernel** hypothesis:

- one logical resident owner;
- bounded grounded recent experience;
- a small set of unresolved/open semantic matters;
- sparse semantic reconsideration when meaning requires it;
- external LLM inference returning proposals rather than owning state;
- scoped causal reconciliation of returned proposals;
- clean intent→task boundary;
- local deterministic competence/execution through World authority;
- real outcomes returning as experience;
- causal observability across the chain.

### Important donor status

- **BDI/PRS** is a semantic donor for commitment, intention persistence, reconsideration and interruption/resumption. It is **not** adopted as a whole framework.
- **C4** is a donor for perceptual honesty and World→individual-experience separation. It is **not** adopted as a global blackboard mind.
- **BT/GOAP/HTN/skills** remain possible future competence mechanisms, not semantic identity.
- **memory-centric agent architectures** remain later memory/reflection donors.
- **full event sourcing** remains unselected.
- **Cloudflare Durable Objects** are a promising future shared-hosting donor, not the immediate host selection.

### Minimal durable continuity for v0

Between semantic calls, the first experiment currently needs only:

- bounded sourced recent experience;
- unresolved/open matters with their semantic course and uncertainty;
- grounded task/run binding to the matter served;
- pending semantic-proposal dependencies/authority;
- small time/revision/focus metadata supporting those records.

Do not invent a general belief DB, desire store, plan library, blackboard or long-term memory merely because a mature architecture could contain one.

### Critical async rule

A semantic proposal is **not** invalid merely because any unrelated World state changed while inference was pending.

Use scoped causal dependency:

- unrelated physical evidence may leave the semantic proposal valid;
- a later semantic supersession of the same matter invalidates the older proposal;
- after semantic commit, task grounding/revalidation uses current World/evidence.

This is more precise than one global `stateVersion changed → reject` rule.

## 7. Immediate task — P2-E0

Next stage:

**P2-E0 — headless resident causal-kernel probe.**

Do **not** jump directly to chat UI, a live LLM endpoint, long-term memory, planner selection or multiplayer hosting.

P2-E0 is a deterministic architecture probe. A fake semantic provider is correct apparatus because the claim under test is causal continuity/reconciliation, not model intelligence.

### P2-E0 must prove

1. unresolved matter persists independently of a cognition-call lifecycle;
2. pending semantic proposal has scoped causal dependencies;
3. unrelated new evidence while inference is pending does not automatically invalidate a still-valid semantic revision;
4. a later semantic supersession of the same matter invalidates the older proposal;
5. task/run causality remains linked to the matter served;
6. interruption/suspension does not erase the earlier matter;
7. the earlier matter remains eligible for resumption after the interrupt resolves;
8. mechanical task outcome returns as evidence and is not silently equated with arbitrary semantic satisfaction;
9. the probe does not require general belief DB, plan library, global blackboard or long-term memory.

### P2-E0 deliberate exclusions

- no playable/runtime integration;
- no new World action semantics;
- no speech UI;
- no new Worker/model endpoint;
- no real LLM calls;
- no long-term memory;
- no planner/skill framework;
- no multiplayer hosting;
- no Owner/browser qualitative gate.

### Falsification rule

If this small probe requires a broad mental-state ontology, plan library/intention graph, global mutable blackboard, whole-state LLM rewriting, resident freeze during inference or stale semantic overwrite, **reopen Pass 2 architecture selection instead of widening implementation to protect the decision**.

If P2-E0 succeeds, the next earned stage is world-grounded communication/experience integration and then a live semantic provider.

## 8. Execution while semantic reconsideration is pending

Pass 2 exposed a real policy question:

> after a semantically important addressed message arrives, what may local execution do while slow cognition is still interpreting it?

Two extremes are both bad:

- unconditional continuation can make heard mid-task revision practically irrelevant;
- unconditional freeze on all speech makes the NPC latency-bound.

For the first Presence experiment, a conservative hold/suspend of the **affected** task on clearly addressed semantic input is the leading candidate. Unrelated World/resident processing continues.

This is not yet a permanent rule; the probe should keep the policy separable from resident identity/continuity semantics.

## 9. Presence Qualification to preserve

The first meaningful playable implementation should eventually survive a parameterized 5–10 minute Life Test containing variants of:

- a player request that causes grounded action;
- a mid-task semantic revision;
- ambiguous reference;
- unverified player information;
- later contradictory World evidence;
- real execution failure/race;
- interruption by another meaningful matter;
- later return/resumption after time or other activity.

Hard failures include false success, omniscience, continuity reset, transcript-as-truth, private contradictory NPC copies, intention lock, inference-dependent identity and forced certainty.

P2-E0 does not itself claim to pass the full playable Life Test; it isolates the causal kernel needed to make that later test meaningful.

## 10. Architecture boundaries worth preserving unless evidence overturns them

- `World` owns canonical truth and legality;
- perception/communication evidence must be grounded in world-accessible channels;
- LLM output does not self-certify physical or communication success;
- real execution outcomes return as later experience;
- semantic intention, grounded task and mechanical action remain conceptually distinct;
- mechanical task completion is not automatically semantic satisfaction;
- causal provenance remains inspectable without exposing hidden chain-of-thought;
- routine mechanics should not require semantic LLM control;
- semantic judgement should not be silently hard-coded into the executor;
- one logical resident owner is a semantic/consistency contract, not a mandate for one specific hosting framework.

E1-specific names/constants (`npc.001`, 220 range, 3 cycles, 750 ms, `wait|fetch`) are apparatus, not future architecture.

## 11. Owner-quality boundary

Do not make this mistake:

> automated/R8-qualified donor ≠ freshly Owner-qualified playable product.

The recovered checkpoint has not received a new final qualitative Owner/browser re-gate after selective recovery.

That does not block P2-E0. A new Owner gate becomes necessary when a playable Presence slice exists and a decision depends on presence/feel/usability.

## 12. Takeover self-check

Before continuing, be able to explain:

1. why `main` is historical P0 but not the current frontier;
2. why the old readiness line remains negative evidence;
3. what `b31a851c...` is and is not qualified to claim;
4. the core Pass 1 Presence invariants;
5. why BDI/PRS and C4 are donors rather than adopted whole frameworks;
6. why the first architecture does not yet need a general belief DB or plan library;
7. why slow LLM inference is a proposal, not resident ownership;
8. why proposal validity must be scoped to semantic dependencies rather than any global World change;
9. why task outcome and semantic matter resolution remain distinct;
10. why the immediate task is P2-E0 rather than chat/memory/planner implementation.

If live evidence contradicts this document, live evidence wins.

## 13. Expected working behavior

Act as the Owner's browser-based second brain / technical co-worker.

Recover state independently, preserve negative evidence and causal boundaries, and implement P2-E0 as a bounded falsifiable probe. Do not turn the selected architecture into dogma: if the small probe falsifies the decision, reopen the architecture instead of adding compensating complexity.

The next run should narrow architecture uncertainty through executable evidence before expanding the playable product.