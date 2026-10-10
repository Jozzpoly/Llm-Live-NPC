# R6 endogenous competing-future runtime generation — bounded finding

Date: 2026-09-27  
Branch: `recovery/spc-post-stress-complementary-personhood-r6`  
PR: #148  
Current strengthened deterministic source: `b4861568d222f11f3f0b0621cae14c92088acdc9`  
Original near-term runtime closure source: `d0163c7850809897e163dd589e3ce344ff162fa1`

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

originally closed the final-frame fixture-construction debt behind run #26. It has since been strengthened to cross the delayed-history boundary as well.

The test still starts from bounded authored A/B seed matters, but it does **not** hand-build the final resident-life choice frame.

### A — factual terminal material history

- Janek has one structured material matter for an exact crate.
- An external World actor factually removes that crate.
- Janek's authorized local attempt reaches World authority and receives `object_unavailable`.
- The exact result is reconciled as a blocked `task_outcome`.
- A becomes `resolved` and run-free.

### B — ordinary carrier life

- an independent ordinary travel matter owns the body;
- B is not one of the final choice candidates;
- it makes C and D arise while real body continuity is already underway.

### Delayed-history boundary before C exists

Before the object returns:

- ordinary World time advances;
- unrelated factual resident evidence churns normally;
- A's factual outcome leaves bounded recent evidence;
- `ResidentLifeMatterScope` removes terminal A from current life;
- the bounded terminal factual archive still retains the exact A outcome;
- A remains terminal/run-free and owns no body authority.

This is materially stronger than the original `d0163c78...` checkpoint, where A was still available through near-term bounded life evidence.

### C — fresh same-object future from delayed factual provenance

While B owns the body:

- the external actor factually returns the exact crate;
- resident-private material perception observes the invisible→visible reacquisition;
- the relevance bridge finds exactly one matching terminal same-object factual outcome through bounded resident history;
- it emits fresh semantic opportunity pressure without reopening A;
- normal life-intent admission creates a **new** current C matter/run;
- C carries typed causal genealogy:
  `prior_same_material_outcome -> { sourceMatterId: A, exact factual outcome }`;
- C cannot steal B's body and becomes a legal deferred demand.

The old A matter is still absent from current life.

### D — independent future from B's own factual outcome

B then factually reaches its destination.

- B's run outcome is reconciled and B becomes terminal;
- `ResidentLifeOutcomeReviewBridge` turns B's exact factual outcome into semantic pressure;
- normal life-intent admission accepts a new ordinary travel future D;
- D is grounded from B's own outcome, not from A;
- because C already waits deferred, D joins the deferred set rather than winning by arrival order.

No fresh addressed speech or direct user command creates D.

### Genuine delayed-history free-body ambiguity

Normal `ResidentExecutionArbitrator.reconcile()` produces:

`choice_required(C, D)`

Then `ResidentLifeChoiceReviewBridge` emits the exact uncertainty reason over those two authorized runs.

`ResidentLifeChoiceOwner` receives the generated life frame and proves:

- exactly C and D are current candidates;
- A is **not** present in `life.matters`;
- C alone carries exact typed `prior_same_material_outcome` support from A;
- D's ordinary support remains candidate-local;
- A's factual outcome may be used comparatively without turning A into an open obligation;
- final choice cognition contains no fresh `heard_speech`;
- no authored `self`/personality context is required;
- coherent `defer_all` remains locally admissible.

Current strengthened checkpoint `b4861568d222f11f3f0b0621cae14c92088acdc9`:

- Check #1725 PASS;
- **279 / 279 test files**;
- **1006 / 1006 tests**;
- typecheck PASS;
- build PASS;
- preview dry-run PASS.

The exact delayed-history live/provider result is recorded separately in
`docs/SPC_R6_DELAYED_FACTUAL_HISTORY_CHOICE_FINDING.md`.

## 6. Bounded conclusion

The run-#26-like relation is not only reachable through normal runtime causation; the strengthened chain now survives the specific recent-life eviction that originally motivated the next falsifier:

> **A resident can factually fail at one material episode, terminalize it, live through unrelated factual churn until that episode leaves current life, later privately reacquire the exact material identity, consciously create a new same-object future carrying exact causal provenance, independently generate another future, and reach genuine free-body ambiguity without reopening the old matter or giving history body authority.**

Evidence planes remain distinct:

- run #26: real-Luna near-term terminal-history behavioral split;
- `d0163c78...`: original normal-runtime generation of the competing-future situation;
- `b4861568...`: strengthened delayed-history normal-runtime chain;
- run #27: real-Luna behavioral split where A is absent from current life and only C carries exact delayed causal support;
- exact run-#27 local replay: local admission closure.

## 7. Nonclaims

This does **not** prove:

- broad R6 PASS;
- a stable learned preference or aversion;
- habit;
- generic or unlimited autobiographical memory;
- cumulative history across unrelated identities/domains;
- spontaneous generation of every seed concern from nothing;
- five distinct living people;
- browser-qualified Oren/Nela genericity;
- Owner-observed ordinary aliveness;
- that retry is always better than avoidance;
- that C should beat D.

The authored A/B seeds remain deliberate experiment setup. The factual A outcome, delayed eviction, archive-backed reacquisition, new C, factual B outcome, new D, arbitration boundary and final choice pressure are generated through the runtime authority/lifecycle path.

## 8. Evidence hygiene / next boundary

The delayed same-object lineage is now bounded CLOSED by the stronger evidence recorded in
`docs/SPC_R6_DELAYED_FACTUAL_HISTORY_CHOICE_FINDING.md`.

Do not:

- rerun run #26 or run #27 merely to seek another stochastic split;
- deepen the same crate lineage by inertia;
- convert this result into `aversion`, `preference`, needs or personality weights;
- expose the archive as a generic prompt-visible autobiography;
- retain all terminal matters forever;
- treat green machine/browser evidence as Owner-observed personhood.

The next R6 pressure should seek **qualitatively different personhood information**. The current high-information candidate is cumulative ordinary experience: several independently factual past episodes later alter one choice even though no single exact old matter/object/standing obligation is sufficient to explain the decision.

Characterize that pressure before adding preference, aversion, habit, relationship or generic memory state.

Browser Oren/Nela genericity remains honest promotion-plane debt.

PR #148 remains draft/open.
