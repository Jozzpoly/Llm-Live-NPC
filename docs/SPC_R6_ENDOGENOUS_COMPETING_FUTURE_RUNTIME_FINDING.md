# R6 endogenous competing-future runtime generation — bounded finding

Date: 2026-09-27  
Branch: `recovery/spc-post-stress-complementary-personhood-r6`  
PR: #148  
Deterministic source: `d0163c7850809897e163dd589e3ce344ff162fa1`

## 1. Question

The previous competing-future result was strong on the cognition/admission plane but still used a frozen paired `resident_life_cognition_v1` fixture.

The next falsifier asked:

> Can factual material failure, terminalization, later exact reacquisition, an independently grounded second future, free-body arbitration and resulting life-choice pressure arise through normal resident/World lifecycle rather than being manually assembled into the final cognition frame?

This is a provenance/composition question. It is not a request for another stochastic Luna sample.

## 2. Earned failures before the repair

The first runtime characterization exposed two concrete gaps rather than a need for generic memory/personality state.

### 2.1 Terminal reacquisition fell out of semantic metabolism

The existing `ResidentMaterialMatterRelevanceBridge` correctly reactivated one still-open blocked material matter.

When the earlier material matter was genuinely terminal, however, later private invisible→visible reacquisition of the exact same object correctly did **not** reopen it, but no fresh semantic pressure was created either.

That preserved homeostasis but made a new post-terminal future impossible to originate naturally.

### 2.2 Native life intent could not accept a fresh material matter

`acquire_material_object` already existed as structured resident matter meaning in the continuity kernel, but `ResidentLifeIntentProposal` could accept only the older body/activity vocabulary.

So even an exact factual material opportunity could not become a new consciously admitted resident commitment through the normal life-intent membrane.

The characterization is executable in:

`src/spc-next/r6-endogenous-material-future-generation-gap.characterization.test.ts`

## 3. Smallest repair

No autobiographical store, preference, aversion, need, trait or score was added.

### 3.1 Fresh opportunity, not reopened obligation

For one exact private invisible→visible material reacquisition:

- an open blocked same-object matter still follows the existing R4 reactivation path;
- if there is no open match, but exactly one bounded terminal/run-free same-object material episode carries a factual blocked `task_outcome`, the bridge may emit `fresh_opportunity`;
- it records current `material_reacquired` evidence;
- it promotes one `direct_world_change` semantic pressure citing both the new reacquisition evidence and the prior factual outcome;
- it does **not** reopen the old matter, bind a run, claim body focus or mutate World;
- ambiguous multiple terminal matches fail closed.

### 3.2 Matter-level material life intent

`ResidentLifeIntentProposal` now admits a separate semantic intent:

`{ kind: "acquire_material_object", goal, objectId }`

This is deliberately not added to the legacy body/activity directive vocabulary.

It contains no route, task id, run id, pickup command or body-focus decision.

### 3.3 Exact local grounding

The existing `ResidentCausalReasonCommitmentAuthority` was reused instead of creating a parallel personhood system.

For a material commitment it revalidates:

- exact selected `direct_world_change` reason;
- exact terminal/run-free source matter;
- exact structured same `objectId`;
- exact blocked prior `task_outcome`;
- exact current reacquisition evidence;
- both evidence objects still present in bounded kernel evidence;
- current resident-private material knowledge still says the object is visible;
- no open/suspended same-object material matter already exists.

Only after that does the normal one-shot admission authority permit a **new** matter/run to be materialized.

The new matter identity derives from the reacquisition evidence, so a later distinct life episode is not silently collapsed into the old terminal one.

## 4. First vertical — fresh post-terminal material future

`src/spc-next/r6-endogenous-post-terminal-material-future.integration.test.ts`

proves one bounded chain:

1. Janek privately knows one exact material object.
2. An external World actor changes its factual availability.
3. The old material run receives a factual blocked outcome.
4. The old matter becomes terminal.
5. The exact object later returns through World truth and private resident sampling.
6. The relevance bridge emits only fresh semantic opportunity pressure.
7. Normal cognition cadence exposes that pressure.
8. Native life-intent admission accepts one new material matter-level goal.
9. Local causal grounding revalidates exact current/private evidence.
10. Only then a **new** material matter/run is created.
11. The new run factually picks up the object through World authority.
12. The old matter remains terminal throughout.

Checkpoint `d0b43400b1292ec818f15cc77fbc613ac72ce980`:

- Check #1670 PASS;
- **271 / 271 test files**;
- **983 / 983 tests**;
- typecheck PASS;
- build PASS;
- preview dry-run PASS;
- Browser Evidence #894 PASS.

## 5. Full endogenous competing-future chain

`src/spc-next/r6-endogenous-competing-future-history-chain.integration.test.ts`

closes the specific fixture-construction debt behind run #26.

The test starts from bounded authored seed matters, but it does **not** hand-build the final resident-life choice frame.

### A — factual terminal material history

- Janek has one structured material matter for an exact crate.
- An external World actor factually picks up and removes that crate.
- Janek's authorized local pickup attempt reaches World authority and receives `object_unavailable`.
- The exact factual result is reconciled as a blocked `task_outcome`.
- A becomes `resolved` and run-free.

### B — ordinary carrier life

- an independent ordinary travel matter owns the body;
- B is not one of the final choice candidates;
- it exists only to make the later C and D generation occur while real body continuity is already in progress.

### C — fresh history-related material future

While B owns the body:

- the external actor factually returns the exact crate;
- resident-private material knowledge acquires the invisible→visible change;
- the post-terminal relevance bridge emits fresh semantic opportunity pressure;
- normal cognition cadence reaches `ResidentLifeIntentOwner`;
- a material proposal is admitted through exact local grounding;
- a **new** C matter/run is created;
- C cannot steal B's body and becomes a legal deferred demand.

A remains terminal.

### D — independent future from B's own factual outcome

B then factually reaches its destination.

- B's run outcome is reconciled and B becomes terminal;
- `ResidentLifeOutcomeReviewBridge` turns that exact factual outcome into `activity_completed` semantic pressure;
- normal life-intent admission accepts a new travel future;
- `ResidentCausalOutcomeTravelCommitmentAuthority` proves the exact B outcome and grounds D;
- because C already waits deferred, D joins the deferred set rather than winning by arrival order.

No fresh addressed speech or direct user command creates D.

### Genuine free-body ambiguity

Normal `ResidentExecutionArbitrator.reconcile()` now produces:

`choice_required(C, D)`

Then `ResidentLifeChoiceReviewBridge` emits the exact `uncertainty` reason over those two authorized runs.

`ResidentLifeChoiceOwner` receives the generated life frame and proves:

- exactly C and D are current candidates;
- A is still terminal/run-free;
- C carries exact `prior_same_material_outcome` support from A;
- D's candidate-local facts do not pretend A is its own origin;
- comparative citation of A remains available without turning A into an open obligation;
- final choice cognition contains no fresh `heard_speech`;
- no authored `self`/personality context is required;
- coherent `defer_all` is locally admissible and leaves both futures deferred/body-free.

Checkpoint `d0163c7850809897e163dd589e3ce344ff162fa1`:

- Check #1672 PASS;
- **272 / 272 test files**;
- **984 / 984 tests**;
- typecheck PASS;
- build PASS;
- preview dry-run PASS.

Browser Evidence #896 is regression evidence for this source and must be recorded only after its workflow completes successfully.

## 6. Bounded conclusion

The fixture-proven run-#26 relation is now reachable through a defended normal runtime chain:

> **A resident can factually fail at one material episode, terminalize it, later privately reacquire the exact material identity, consciously create a new same-object future, independently generate another future from a different factual life outcome, reach a genuine free-body ambiguity, and expose the old terminal fact as causal support at the normal life-choice boundary — without reopening the old matter or granting history body authority.**

This materially strengthens run #26 because the final choice context is no longer only a plausible hand-assembled contract specimen.

The evidence planes remain distinct:

- run #26 is the real-Luna behavioral history-effect observation;
- this document's runtime chain proves the corresponding causal situation can actually be generated by resident/World lifecycle and local authorities.

A new Luna rerun is **not automatically informative** merely because runtime generation is now proven.

## 7. Nonclaims

This does **not** prove:

- broad R6 PASS;
- a stable learned preference or aversion;
- habit;
- generic autobiographical memory;
- long-lived history beyond bounded evidence retention;
- spontaneous generation of every seed concern from nothing;
- five distinct living people;
- browser-qualified genericity of this exact chain;
- Owner-observed ordinary aliveness;
- that retry is always better than avoidance;
- that C should beat D.

The authored A/B seeds are deliberate experiment setup. The material historical outcome, terminalization, later reacquisition, new C, factual B outcome, new D, arbitration boundary and final choice pressure are generated through the runtime authority/lifecycle path.

## 8. Evidence hygiene / next boundary

Do not:

- rerun run #26 to seek a preferred stochastic split;
- convert this result into `aversion`, `preference`, needs or personality weights;
- retain all terminal matters forever;
- make reacquisition automatically reopen history or automatically create a task;
- treat green browser regression evidence as an Owner-observed personhood PASS.

The next R6 pressure should be chosen for **new personhood information**, not because this material chain can be made even more elaborate.

Browser Oren/Nela genericity remains honest promotion-plane debt.

PR #148 remains draft/open.
