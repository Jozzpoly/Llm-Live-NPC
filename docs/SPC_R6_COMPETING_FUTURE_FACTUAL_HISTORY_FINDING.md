# SPC R6 — Competing-Future Factual-History Finding

Date: **2026-09-27**  
Status: **MATERIAL BOUNDED POSITIVE FINDING / LIVE BEHAVIORAL HISTORY EFFECT + EXACT LOCAL CAUSAL ADMISSION**

Exact live-provider source: `c9999f589886311125dd91a215d27f3b46371a5c`  
Live Provider Evidence: **run #26**  
Stored live result: `evidence/r6-competing-future-terminal-history-choice-live-result.json`  
Exact local replay source: `c3e2efb784520d17e520f3373a2de97bc8caab53`  
Integrated Check at exact replay source: **#1653 PASS — 269 / 269 files, 979 / 979 tests**

## 1. Question

The preceding post-terminal probe established that Luna could semantically consume one resolved factual episode without reopening it, but the matched twins still chose the same behavior.

The next R6 question was therefore narrower and harder:

> Can terminal factual life alter a genuine endogenous competing-future choice or coherent non-action through causally attributable support, without becoming an open obligation or a generic personality system?

This probe deliberately excluded:
- fresh player command or addressed speech;
- an open standing social obligation;
- authored `self` / drives as the deciding cause;
- preference, aversion, needs, habit or relationship scores;
- random choice pressure;
- repeated sampling until a desired split appeared.

## 2. Earned causal-support gap

Before adding representation, the existing `ResidentLifeChoiceOwner` / causal-support contract was attacked directly.

The concrete failure was:

1. a resolved factual material episode could still be present in the bounded resident `life` view;
2. a new current candidate could concern the exact same material identity;
3. nevertheless the existing candidate-local support projection could not legally cite the terminal factual outcome as support for the new choice;
4. attaching the outcome only to the matching candidate was also insufficient, because an earlier factual outcome about candidate A may causally explain choosing candidate B instead.

That was a real admission/attribution gap, not evidence for a generic autobiographical-memory system.

## 3. Smallest earned seam

`ResidentLifeChoiceCandidateSupport` now recognizes one narrow relation:

`prior_same_material_outcome`

It exists only when:
- the current candidate has `semanticIntent.kind === "acquire_material_object"`;
- a different prior matter is `resolved` or `cancelled`;
- that prior matter is run-free;
- both intents use the exact same structured `objectId`;
- the prior matter owns factual `task_outcome` evidence;
- that terminal matter is still present in the bounded resident-life view.

The relation does **not**:
- reopen the prior matter;
- create a run;
- claim the body;
- mutate World;
- create a preference or aversion;
- retain terminal history forever;
- use summary-text similarity as identity.

Ordinary origin/current-context evidence remains candidate-local.

The only cross-candidate exception is the exact `prior_same_material_outcome`: it may be used comparatively to explain choosing the matching candidate or choosing another current candidate instead. The provider still cannot cite arbitrary evidence belonging to a competitor.

## 4. Matched competing-future twin

Frozen paired context:

`evidence/r6-competing-future-terminal-history-choice-context.json`

Both Janek twins have:
- the same resident identity and current region;
- the same free coarse body;
- exactly two active, legal, deferred futures;
- the same current private/World-facing context;
- the same uncertainty reason;
- no fresh speech;
- no fresh direct command;
- no authored `self`;
- no standing obligation.

The two current futures are:
1. retry the now-available familiar crate;
2. visit the familiar workshop for an unrelated ordinary reason.

The history twin alone additionally owns one old matter that:
- concerns the exact same crate identity;
- previously ended with factual `object_unavailable`;
- is `resolved`;
- has `activeRun: null`;
- therefore owns no body or execution authority.

Removing that one terminal episode makes the twins equal.

## 5. Provider-contract failure before semantic evidence

Live Provider run #25 at source:

`1f537579dfec368b1e62404f3385a6868e5a57ed`

is **apparatus evidence only**.

Both endpoint calls returned `502 upstream_http` with zero token usage and no model proposal. The strict Structured Outputs schema had introduced `uniqueItems: true` for support evidence IDs. That keyword was outside the provider's accepted strict schema subset.

The repair removed only that provider-incompatible schema keyword. Local proposal parsing continues to reject duplicate support IDs, so causal admission semantics were not weakened.

The harness was also hardened to:
- retain `upstreamStatus`;
- stop after a control provider-boundary failure instead of spending the matched history call.

Run #25 is not semantic negative evidence and is not part of the behavioral result.

## 6. Live Provider run #26

Exact source:

`c9999f589886311125dd91a215d27f3b46371a5c`

Run #26 used:
- exact commit-bound Cloudflare preview;
- exactly **2** GPT-5.6 Luna requests;
- **0** semantic retries;
- one control request;
- one history request.

### Control — no terminal episode

Decision:

`defer_all`

Reason:

> Both grounded matters have current support and neither has stronger resident-life priority, urgency, or comparative evidence. Defer until the ambiguity changes.

Review: **30 s**

Usage:
- input: **1615**
- output: **107**
- total: **1722**

### History — exact terminal same-object outcome

Decision:

`focus_matter(matter.janek.r6.competing-future.retry)`

Reason:

> The familiar crate is currently available again, directly addressing the earlier blocked attempt, while the workshop visit is an ordinary competing reason.

Causal support cited:
- `evidence:janek:r6:competing-future:history-outcome`
- `evidence:janek:r6:competing-future:retry-origin`

Review: **120 s**

Usage:
- input: **1937**
- output: **177**
- total: **2114**

Harness result:

`HISTORY_CAUSAL_COMPETING_FUTURE_DIFFERENCE_OBSERVED`

Specifically:
- control behavior = `defer_all`;
- history behavior = `focus_matter(retry)`;
- `exactBehaviorEqual = false`;
- `historyCitesTerminalOutcome = true`.

This is an actual behavioral-class difference, not merely different rationale wording.

## 7. Exact local replay

`src/spc-next/r6-competing-future-terminal-history-choice-pair.integration.test.ts`

replays the exact stored Luna proposals through `ResidentLifeChoiceOwner`.

It proves:
- the exact control `defer_all` is locally admissible;
- the exact history `focus_matter(retry)` with both cited evidence IDs is locally admissible;
- the history outcome is exposed specifically as `prior_same_material_outcome`;
- the old history matter remains `resolved`;
- the old history matter remains run-free;
- semantic choice admission itself does not seize body authority.

At source `c3e2efb784520d17e520f3373a2de97bc8caab53`:

**Check #1653 PASS — 269 / 269 files, 979 / 979 tests.**

## 8. Defended claim

Within this bounded specimen:

> **One terminal factual episode from a resident's own past can causally alter a genuine competing-future higher-cognition behavior, while the old episode remains terminal and body-authority-free.**

The causal attribution is stronger than prose correlation because:
1. the current twins are matched outside the old episode;
2. the behaviors differ;
3. the history proposal cites the exact pre-existing factual outcome;
4. the local admission membrane verifies that citation;
5. the exact live proposals replay successfully under the normal choice owner.

The observed direction also matters:

The earlier blocked attempt did **not** produce a learned aversion. With the crate currently available again, history made retry sufficiently meaningful to focus it, while the no-history control deferred.

Therefore the finding is about **history-sensitive significance**, not a hard-coded “failure means avoid” rule.

## 9. Runtime-generation follow-up

The fixture-construction limitation recorded by the original run #26 finding has now been tested directly.

Canonical follow-up:

`docs/SPC_R6_ENDOGENOUS_COMPETING_FUTURE_RUNTIME_FINDING.md`

At source `d0163c7850809897e163dd589e3ce344ff162fa1`, the deterministic runtime creates the relevant chain through normal authorities from bounded authored seed matters:

- factual `object_unavailable` material failure;
- terminal old material matter;
- later exact private reacquisition;
- fresh material opportunity pressure;
- native matter-level material commitment;
- new material future C deferred behind ongoing body work;
- independent future D generated from another factual completed-life outcome;
- normal free-body `choice_required(C,D)`;
- normal life-choice pressure with exact terminal-history support;
- coherent `defer_all` remains legal;
- old history never reopens.

Check #1672 passes **272 / 272 files, 984 / 984 tests**, plus typecheck/build/preview.

This closes the specific claim that run #26 might depend on an impossible hand-assembled final life frame.

It does **not** prove that all seed motives arise spontaneously from nothing: A and the ordinary carrier B remain bounded authored experiment seeds.

## 10. What remains unproven

Do not promote the combined live + runtime result into:

- learned preference or aversion;
- habit;
- generalized autobiographical memory;
- long-lived terminal-history persistence;
- durable identity/personality model;
- broad relationship history;
- ownership psychology;
- general cross-domain history reasoning;
- full R6;
- five distinct living residents;
- Owner-observed ordinary aliveness.

One paired model observation is still not a behavioral distribution.

## 11. Next high-information frontier

The run-#26 cognition question and its runtime provenance question are now bounded closed.

The next materially different pressure is temporal:

> **Can a resident's terminal factual life still causally matter after ordinary unrelated life has pushed that episode beyond the bounded recent-evidence window?**

This is already grounded by an executable limitation: `ResidentLifeMatterScope` deliberately stops exposing terminal episodes after their outcome leaves recent evidence. That remains correct homeostasis for finished work, but it may be insufficient for the Owner's stronger goal of accumulated private life.

Required next pressure:

1. create one factual terminal episode through normal runtime authority;
2. let enough unrelated factual resident life occur to move its outcome beyond current recent-evidence retention;
3. verify the old matter remains terminal and does not re-enter current obligation scope;
4. later create a genuine competing-future ambiguity structurally related to that old episode;
5. determine whether the resident has any legal causal surface for the old experience;
6. characterize the exact failure before adding representation;
7. if a new representation is earned, make it narrower than generic autobiography and keep body/World authority separate.

Do not retain all terminal matters forever merely to pass this pressure.

A new Luna sample is not yet justified: the next unknown is whether the local runtime can carry delayed factual self-history at all.

Browser-qualified Oren/Nela genericity remains separate promotion-plane debt.

PR #148 remains draft/open.
