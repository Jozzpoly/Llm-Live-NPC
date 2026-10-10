# R6 resident plan revision / refusal finding

Status: **DETERMINISTIC PLAN-REVISION MECHANISM PASS + BOUNDED NEUTRAL LIVE RELINQUISHMENT RESULT**

This document records the R6 pressure asking whether exact resident-owned history can make one already-current legal matter cease to be a resident's chosen future without turning provider output into arbitrary task deletion.

## 1. Why this pressure existed

Earlier R6 stages proved that lived history can:

- change which current matter receives the body;
- change later choice at fixed history count when factual outcome meaning changes;
- support deliberate `defer_all`;
- survive as bounded causal genealogy without reopening old matters.

But those mechanisms still left an important distinction unresolved:

> avoiding one plan for now is not the same thing as no longer carrying that plan.

The characterization in
`src/spc-next/r6-plan-revision-refusal-gap.characterization.test.ts`
showed the gap directly.

With current C and D both legal:

- choosing D leaves C active/deferred;
- evidence-grounded `defer_all` leaves C and D active;
- after D later finishes, ordinary arbitration automatically returns C to the body because C is still a legal resident demand.

So prior choice/non-action machinery could postpone C, but could not revise C's lifecycle.

## 2. Earned bounded repair

The repair does **not** add generic preference, aversion, personality or relationship state.

### 2.1 Evidence-grounded semantic admission

`ResidentLifeChoiceOwner` now admits a third bounded decision:

`relinquish_matter`

It is deliberately stricter than `focus_matter`:

- target must be one exact frozen current candidate;
- provider must cite 1–8 exact support evidence IDs;
- support must be factual and attached to the target matter;
- ordinary matter origin/current wording alone is insufficient.

Allowed plan-revision support is limited to existing factual relations such as:

- blocked/current factual outcome;
- last factual outcome;
- prior same-material outcome;
- prior same-actor outcome;
- prior counterparty social outcome.

This prevents a provider from receiving a generic "delete any task" capability.

### 2.2 Semantic admission is inert by itself

An applied `relinquish_matter` settlement does not directly mutate lifecycle or World.

`ResidentLifeChoiceOwner` issues a one-shot identity-bound
`ResidentLifePlanRevisionGrant` only for the exact admitted settlement.

Cloned settlements cannot claim the grant.
The grant cannot be reused.

### 2.3 Separate local lifecycle authority

`ResidentLifePlanRevisionAuthority` consumes that one-shot grant and revalidates:

- resident identity;
- exact matter ID;
- exact run ID;
- exact semantic revision;
- matter still active;
- run still has current semantic authority;
- application tick is not older than settlement.

Only then it:

1. records resident-owned `resident_relinquished_matter` evidence;
2. advances semantic context so the old run becomes stale;
3. terminalizes the matter as `cancelled`;
4. retires the exact old run.

It does not choose a replacement and does not mutate World.
Ordinary arbitration handles whatever legal demand remains.

If the matter changes after semantic admission but before application, the revision fails closed.

## 3. Deterministic qualification

The repaired characterization now preserves three distinct truths:

1. `focus_matter(D)` still does **not** revise C;
2. `defer_all` still does **not** revise C;
3. exact evidence-grounded `relinquish_matter(C)` plus separate local revision authority **does** cancel C and revoke C's run authority.

Additional tests defend:

- target-local factual support;
- rejection of origin-only arbitrary deletion;
- one-shot non-clonable revision grants;
- stale matter rejection between admission and application;
- Worker schema exposure only when a candidate has qualifying factual support.

The mechanism was qualified before live inference.

## 4. Real GPT-5.6 Luna — run #33

Run #33 intentionally reused the already-qualified run-30 matched Ida histories because they hold constant:

- resident;
- current Janek C;
- unrelated current D;
- history cardinality;
- old source/evidence identities and ticks;
- current body state;
- legal action space.

Only old factual outcome meaning differs:

- two succeeded same-actor communication outcomes;
- two blocked `recipient_absent_at_best_known_contact` outcomes.

Both twins were given the **same** new plan-revision action space.
Only current Janek C was legally relinquishable, and only through exact target-local factual history.

Source:

`677df1acc0c029d8ad6761556f5840139326be37`

Exact retained result:

`evidence/r6-plan-revision-outcome-meaning-live-result.json`

The run used:

- exactly 2 GPT-5.6 Luna requests;
- 0 semantic retries.

Succeeded-history:

- `focus_matter(current Janek C)`;
- cites current C origin and both old successful Janek outcomes.

Blocked-history:

- `focus_matter(unrelated D)`;
- cites D origin and both old blocked Janek outcomes;
- explicitly says the blocked history does **not** establish that current Janek C is impossible.

Neither side chose `relinquish_matter`.

Harness classification:

**`OUTCOME_MEANING_BEHAVIOR_DIFFERENCE_WITHOUT_PLAN_RELINQUISHMENT`**

Therefore run #33 is **not** a live behavioral plan-revision PASS.

It re-confirms the earlier outcome-meaning effect on immediate priority, while leaving real-Luna relinquishment unproven.

## 5. Exact local replay

`src/spc-next/r6-plan-revision-outcome-meaning-choice-pair.integration.test.ts`

replays both exact run-#33 proposals through local `ResidentLifeChoiceOwner`.

The replay proves:

- both exact proposals remain legal;
- neither exact `focus_matter` settlement creates a plan-revision grant;
- both current matters remain current in the frozen life state;
- the new action space did not silently reinterpret ordinary focus as cancellation.

Current qualified head:

`db6453abee0263eb4c8f1153d2d94f8082d2b5a9`

Check #1831:

- **300 / 300 test files PASS**;
- **1057 / 1057 tests PASS**;
- typecheck/build PASS.

Browser Evidence #1055: PASS.

PR #148 remains draft/open.

## 6. Bounded conclusion

Two claims must stay separate.

### Mechanistic claim — PASS

> A resident can now relinquish one exact already-current matter through bounded factual support, stale-safe semantic admission and a separate local one-shot lifecycle authority, without granting the provider arbitrary deletion or World/body authority.

### Live behavioral claim — UNPROVEN

> The one qualified real-Luna pair did not use the new relinquishment path.

Run #33 must not be rerolled until a preferred outcome appears.

The blocked-history answer was coherent: it changed immediate priority but explicitly refused to conclude that current C should cease to exist. That is valid evidence about this specimen, not a failure to obey the experiment.

## 7. Important remaining limitation

The current plan-revision capability exists only on the **multi-matter life-choice plane**.

`ResidentLifeChoiceOwner` requires:

- a free coarse body;
- at least two legal deferred current matters;
- exact multi-run ambiguity pressure.

The existing characterization already demonstrates the consequence:

- if D is chosen instead of C;
- D later terminates;
- C remains the only legal demand;
- ordinary arbitration automatically reacquires C.

There is no resident-owned reappraisal gate at that point.

Likewise, generic life-intent `decline` means "do not create this new commitment"; it does not target and revise one already-current matter.

Therefore the next high-information pressure is **not** another run-#33 reroll.

It is:

> **Can one already-current plan be endogenously reconsidered and relinquished when it is the resident's only current legal future, because new or recovered resident-owned evidence changed its meaning — without requiring a competing D merely to create a choice surface?**

This is the strongest currently demonstrated boundary between "choice among plans" and genuine autonomous plan revision.

## 8. Nonclaims

This finding does not prove:

- broad R6 PASS;
- live-Luna plan relinquishment;
- generic refusal in arbitrary situations;
- single-current-plan autonomous reappraisal;
- learned preference or aversion;
- relationship state;
- trust/affinity;
- habit;
- generic autobiography;
- five distinct living people;
- Owner-observed ordinary aliveness;
- browser-qualified Oren/Nela genericity.

Do not introduce those systems merely to fill the gap.

The next representation must be earned by the single-current-plan pressure or another stronger Owner-relevant failure.
