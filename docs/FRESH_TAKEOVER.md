# LLM Live NPC — Fresh Takeover

Use this document to start a fresh Browser ChatGPT conversation after Pass 0 selective recovery and Pass 1 problem-definition closure.

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
4. this file

Only then inspect historical/evidence surfaces when exact provenance is needed:

- PR #47 — decisive Owner/browser FAIL of the old readiness line;
- PRs #70–#74 — final selective recovery repairs;
- PR #75 — evidence-only combined R8 re-attack;
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

## 5. Pass 1 closure — what changed conceptually

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

Read the full contract before architecture work:

`docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`

## 6. Do not mistake hypotheses for architecture truth

Pass 1 explored, but did **not** freeze:

- an explicit `Active Life State`;
- a persistent `Live Mind Runtime`;
- cognitive-pressure/event-trigger scheduling;
- expectation/discrepancy triggers;
- semantic delta transitions;
- skills/competences;
- planner/BT/FSM/utility/GOAP/HTN choices;
- exact belief/evidence representation;
- long-term memory design;
- exact attention/addressedness algorithm;
- exact speech/hearing channels;
- persistence/offscreen simulation;
- model routing/final provider.

Treat those as candidates to compare and falsify, not TODO items.

Historical R5b timeout/retry, later R6 sensory-buffer work and R7 ingress/provider-observability hardening also remain donors, not an automatic recovery queue.

## 7. Immediate task — Pass 2

Next stage:

**Live NPC Refoundation Pass 2 — architecture / donor / research campaign.**

Do **not** start by implementing chat, memory, a planner, speech UI or a `Mind Runtime`.

First:

1. derive the responsibilities implied by the Presence Contract without turning each noun into a class;
2. audit existing project donors and external architecture families;
3. construct multiple competing architecture hypotheses;
4. attack them against the Presence Life Test and anti-goals;
5. compare complexity, cost, responsiveness, inspectability, persistence and multiplayer implications;
6. select the smallest architecture capable of a genuinely informative first Presence experiment;
7. only then design the first bounded implementation slice.

Central question:

> **Which architecture can preserve one grounded resident through the Presence Contract while using expensive semantic cognition only where it creates real value?**

## 8. Presence Qualification to preserve during architecture work

Do not optimize only for attractive component diagrams.

The first meaningful implementation should eventually survive a parameterized 5–10 minute Life Test containing variants of:

- a player request that causes grounded action;
- a mid-task semantic revision;
- ambiguous reference;
- unverified player information;
- later contradictory World evidence;
- real execution failure/race;
- interruption by another meaningful matter;
- later return/resumption after time or other activity.

Hard failures include false success, omniscience, continuity reset, transcript-as-truth, private contradictory NPC copies, intention lock, inference-dependent identity and forced certainty.

## 9. Architecture boundaries worth preserving unless evidence overturns them

- `World` owns canonical truth and legality;
- perception/communication evidence must be grounded in world-accessible channels;
- LLM output does not self-certify physical or communication success;
- real execution outcomes return as later experience;
- semantic intention, grounded task and mechanical action remain conceptually distinct;
- mechanical task completion is not automatically semantic satisfaction;
- causal provenance remains inspectable without exposing hidden chain-of-thought;
- routine mechanics should not require semantic LLM control;
- semantic judgement should not be silently hard-coded into the executor.

E1-specific names/constants (`npc.001`, 220 range, 3 cycles, 750 ms, `wait|fetch`) are apparatus, not future architecture.

## 10. Owner-quality boundary

Do not make this mistake:

> automated/R8-qualified donor ≠ freshly Owner-qualified playable product.

The recovered checkpoint has not received a new final qualitative Owner/browser re-gate after selective recovery.

That does not block Pass 2 research. A new Owner gate becomes necessary when a decision depends on current feel/usability or when a new Presence experiment needs qualitative judgement.

## 11. Takeover self-check

Before continuing, be able to explain:

1. why `main` is historical P0 but not the current frontier;
2. why the old readiness line remains negative evidence;
3. what `b31a851c...` is and is not qualified to claim;
4. why Pass 1 demoted `Live Mind`, `Active Life State`, cognitive pressure and planner terms from requirements to hypotheses;
5. the difference between one resident/shared present and one conversation lock;
6. why an utterance is evidence but not automatic truth;
7. why semantic intention, grounded task and World outcome are distinct;
8. why the next task is architecture/research comparison rather than feature implementation.

If live evidence contradicts this document, live evidence wins.

## 12. Expected working behavior

Act as the Owner's browser-based second brain / technical co-worker.

Recover state independently, challenge attractive but unsupported architecture assumptions, preserve evidence boundaries and carry research long enough to distinguish alternatives. Avoid forcing the Owner to repeatedly restate context that the canonical spine already provides.

Pass 2 should narrow uncertainty before code expands scope.
