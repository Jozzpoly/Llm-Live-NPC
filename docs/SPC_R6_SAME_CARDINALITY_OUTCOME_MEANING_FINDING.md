# R6 same-cardinality factual outcome-meaning finding

Status: **MATERIAL BOUNDED POSITIVE FINDING — FACTUAL OUTCOME MEANING CHANGED REAL-LUNA BEHAVIOR AT FIXED HISTORY CARDINALITY**

This finding closes the ambiguity left by the cumulative same-actor run #29.

Run #29 proved that two independent old same-actor episodes can jointly change a later choice. It did not prove whether the model cared about **what happened** in those episodes or merely that the same interaction had happened twice before.

This stage holds actor identity, history count, support identities, current futures and body state fixed while changing only the factual meaning of the two old outcomes.

## 1. Question

> With the same actor, the same number of old episodes and the same current C-vs-D ambiguity, can different factual past outcomes change later judgement — or is current personhood only sensitive to repetition/cardinality?

No relationship score, preference, habit, trust state or autobiographical summary was added for this experiment.

## 2. Deterministic World-grounded contrast

Characterization:

\`src/spc-next/r6-same-cardinality-outcome-meaning.characterization.test.ts\`

The specimen uses the existing real message-delivery machinery.

A legacy I1 communication fixture is used only to establish World/contact geometry. Its old matter predates structured \`communicate_actor\` intent and is deliberately **not** admitted into exact same-actor genealogy.

Two new structured communication matters A/B are then executed through:

- \`ResidentMessageDeliveryExecutor\`;
- exact Janek private contact;
- \`ResidentWorldExecutionAuthority\`;
- normal run reconciliation.

Two counterfactual histories are produced:

### succeeded history

Both A and B factually reach Janek and reconcile as \`succeeded\`.

### blocked history

Janek is moved outside Ida's acquired contact without oracle-updating Ida. Both structured attempts reach the stale best-known contact and factually reconcile as \`blocked\` with:

\`recipient_absent_at_best_known_contact\`

Blocked matters are then terminalized after the bounded review fixture rather than being left as live obligations.

For both histories:

- exactly two eligible structured same-actor episodes exist;
- both source matters are terminal and run-free;
- old A/B are absent from current life;
- the same later current C is \`communicate_actor -> resident.janek\`;
- \`derivePriorSameActorOutcomeSupport\` returns exactly two facts;
- support relation remains \`prior_same_actor_outcome\`.

The only material historical distinction is factual outcome meaning:

- \`2 × succeeded:\`
- versus
- \`2 × blocked:\`

The existing evidence contract already preserves this distinction in exact factual \`task_outcome.summary\`.

**No new production representation was required.**

Check #1759: PASS.

## 3. Frozen provider pair

Frozen context:

\`evidence/r6-same-cardinality-outcome-meaning-choice-context.json\`

Worker contract:

\`worker/r6-same-cardinality-outcome-meaning-choice-context.test.ts\`

Both provider frames have identical:

- resident Ida;
- current region;
- current C = speak with Janek;
- current D = unrelated workshop visit;
- free body;
- uncertainty reason;
- old A/B source matter IDs;
- old A/B evidence IDs;
- old A/B evidence ticks;
- exactly two historical facts;
- no old matters in current life;
- no fresh speech;
- no authored \`self\`.

After replacing only historical outcome summaries with one placeholder, the two frozen contexts are exactly equal.

The Worker:

- accepts both frames;
- exposes the same legal evidence-ID schema in both;
- preserves the different factual summaries;
- keeps ordinary current origins candidate-local;
- permits the same comparative use of old evidence IDs.

Check #1761: PASS.

## 4. Real GPT-5.6 Luna — run #30

Source:

\`d4dd09c0d6afefefaf60772ebdb169728128b548\`

Live result:

\`evidence/r6-same-cardinality-outcome-meaning-live-result.json\`

The live harness enforces:

- exact commit preview;
- exactly 2 GPT-5.6 Luna requests;
- no semantic retry;
- no preferred winner.

### Two succeeded old outcomes

Luna chooses:

\`focus_matter(matter.ida.r6.same-cardinality.current-janek)\`

Reason:

> prior factual outcomes show that speaking with Janek has been successfully carried out before

Support cites:

- current Janek C origin;
- old A exact task outcome;
- old B exact task outcome.

Usage:

- input: 2,084;
- output: 143;
- total: 2,227.

### Two blocked old outcomes

Luna chooses:

\`focus_matter(matter.ida.r6.same-cardinality.other)\`

Reason:

> two prior communications with Janek ended with the recipient absent

Support cites:

- current D origin;
- old A exact task outcome;
- old B exact task outcome.

Usage:

- input: 2,096;
- output: 155;
- total: 2,251.

Comparison:

- history cardinality: identical;
- actor: identical;
- evidence identities/ticks: identical;
- current C/D: identical;
- body state: identical;
- behavioral choice: **different**;
- both decisions cite **both** exact historical outcome IDs.

Classification:

**\`SAME_CARDINALITY_OUTCOME_MEANING_BEHAVIOR_DIFFERENCE_OBSERVED\`**

This is a stronger bounded result than a rationale-only semantic difference.

## 5. Exact local replay

\`src/spc-next/r6-same-cardinality-outcome-meaning-choice-pair.integration.test.ts\`

replays both exact Luna proposals through \`ResidentLifeChoiceOwner\`.

The replay proves:

- success-history C choice is locally admissible;
- blocked-history D choice is locally admissible;
- both exact old outcomes are legal comparative causal support;
- old A/B remain absent from current life;
- current candidate-local origins do not leak across candidates;
- the behavioral split survives local admission rather than existing only as provider prose.

Check #1766: PASS.

## 6. Bounded conclusion

> **At fixed same-actor history cardinality, changing only the factual outcome meaning of two old episodes was sufficient to change a real GPT-5.6 Luna competing-future decision, with both exact old outcomes explicitly cited and both exact proposals accepted by local admission.**

Therefore the run #29 effect cannot be explained solely as:

> “this happened twice before.”

The current narrow factual-history substrate can already carry some **meaningful consequence sensitivity** without relationship or preference state.

## 7. Important nonclaims

This does **not** prove:

- friendship;
- trust;
- liking or dislike;
- social affinity;
- stable preference or aversion;
- habit;
- generic autobiographical memory;
- a learned relationship model;
- arbitrary cross-domain transfer;
- that success should generally increase future engagement;
- that blocked attempts should generally reduce future engagement;
- a behavioral distribution over repeated stochastic samples;
- broad R6;
- five distinct living people;
- Owner-observed ordinary aliveness.

The old facts describe **Ida's own communication attempts and their World outcomes**. They do not yet represent what Janek himself chose, intended, reciprocated, refused, helped with, or did to Ida.

That distinction is now the higher-value pressure.

## 8. Stage closure / next pressure

This exact **same-cardinality own-outcome meaning** stage is **bounded CLOSED**.

Do not:

- rerun run #30 to collect a preferred stochastic direction;
- encode “success = liking/trust”;
- encode “blocked = dislike/avoidance”;
- add relationship scores;
- add preference weights;
- summarize the two episodes into a generic actor trait;
- expose the entire terminal archive.

The next high-information question is:

> **Can durable factual history of what the other actor actually did — for example a response, refusal, assistance, release, or other actor-caused social consequence — later affect a resident's endogenous choice after the immediate percept has left recent life, without reducing that history to a relationship score?**

The first step is characterization, not implementation:

1. identify an existing World-grounded counterparty action/response;
2. let it leave bounded recent percept history;
3. create a later genuine current ambiguity;
4. test whether the old counterparty-caused fact has any exact admissible causal route into the later choice;
5. only if that route is missing, earn the smallest typed provenance seam.

PR #148 remains draft/open.
