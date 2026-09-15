# SPC Next — local-life authority replan

Status: **planning only · no runtime authority · post-physical-outcome audit**  
Parent checkpoint: `f10553900a1662cec21aabfd5bee706a6864897f`  
Purpose: address the demonstrated all-idle collapse without turning LLM cognition, scripted fixtures or fake activity labels into the source of life.

## 1. Why this stage exists

The current refoundation has earned a strong causal substrate: private perception, bounded resident memory, adaptive cognition scheduling, stale-attempt protection, authored region knowledge/routing, World-owned actor movement, physical motion outcomes and increasingly explicit authored World places.

It has **not** yet earned continuous local life.

The five-resident specimen contains an executable characterization:

- initial authored activities exist;
- those activities complete normally;
- by tick 900 (~15 s at 60 Hz), every resident is `idle`;
- the long soak then demonstrates bounded memory and runtime survival, not continuing life.

This is now a first-class product/architecture debt. Continuing directly into collision/FOV/pathing would improve embodiment while leaving the core living-world claim hollow.

## 2. Exact authority gap

Today there are three useful but incomplete layers:

1. **Resident semantic state** — beliefs and evidence-backed concerns live in `ResidentMind`.
2. **Current activity** — `ResidentRuntime` executes one concrete `ResidentActivity` through the local fast brain.
3. **LLM judgement** — cognition can KEEP / STOP / REPLACE the current activity and update concerns/beliefs.

What is missing is the layer between semantic state and one concrete activity:

> a resident-owned continuing purpose that can survive completion/interruption of a concrete activity and locally select the next bounded method when the World supplies enough grounded truth.

The current `concern` is not this authority. It is semantic memory written through cognition and no local executor consumes it.

The current `activity` is not this authority. Completion intentionally replaces it with idle.

The cognition scheduler is not this authority. More frequent model calls would only hide the missing local-life owner behind provider traffic.

## 3. Working term: local purpose

`LocalPurpose` is a provisional research term, **not a frozen public API or final ontology**.

A local purpose means:

- a bounded, resident-private reason to continue doing something across several concrete activities;
- grounded in facts/places/roles the resident is allowed to know;
- persistent across ordinary activity completion and recoverable interruption;
- executable locally when the next method is mechanically obvious and already inside its authority;
- revisable, suspendable or replaceable by higher cognition;
- incapable of manufacturing World outcomes or new semantic facts.

Examples of shape, not selected content:

- maintain a small World-owned resource condition;
- make a known delivery whose source and destination are grounded;
- patrol/check a known set of authored places under an explicit existing purpose;
- return to a known work/social place after a bounded interruption.

A local purpose must **not** mean “pretend to work”, “wander forever”, or “invent another quest because idle looks bad”.

## 4. Authority split to defend

### World owns

- existence and state of anchors/places/resources/actors;
- whether an interaction is physically/legal mechanically possible;
- actual movement, contact and interaction outcomes;
- resource transfer or other factual consequences;
- causal occurrence/evidence emitted from those consequences.

### Resident mind owns

- private knowledge and evidence provenance;
- beliefs and semantic concerns;
- which authored places/actors/resources it actually knows about;
- higher-level interpretation of why something matters.

### Local-life owner may own

- one bounded continuing local purpose already admitted from trusted seed or cognition;
- phase/method state needed to continue that purpose;
- choosing the next **locally permitted method** from grounded resident knowledge and factual World outcomes;
- suspend/resume state around interruptions;
- escalation when local methods are exhausted or ambiguous.

### Current activity owns only execution intent

- travel here;
- approach this actor;
- communicate this message;
- investigate this grounded location;
- invoke a future World-owned interaction capability.

Completion of one activity must not automatically resolve the continuing purpose.

### LLM cognition owns higher judgement, not every transition

The model may:

- admit/replace/resolve/suspend a purpose when semantic judgement is required;
- react to surprising failure or changing evidence;
- choose among genuinely ambiguous goals.

It should not need to be called merely because a resident reached a known waypoint or finished one obvious method in an already-understood routine.

## 5. The anti-theater rule

The first local-life experiment must contain at least one **real World-owned consequence**.

Anchors alone are not mechanics. A resident walking to `Workshop Bench` and changing its activity label to `work` would be theater, not evidence of embodied life.

Likewise, incrementing an arbitrary debug counter called `workDone` solely so the test turns green would not be enough.

The specimen needs a small causal loop in which:

1. a factual World state creates/maintains a bounded reason for action;
2. the resident knows enough to act but does not receive hidden World truth;
3. local purpose selects a sequence of ordinary concrete methods;
4. the World adjudicates the actual result;
5. the factual result enters private experience;
6. the purpose continues, changes phase, becomes satisfied or escalates because of that result.

## 6. Current-best first specimen

Do **not** build a generic economy, jobs framework or utility-AI planner.

The current-best bounded candidate is a tiny **resource transfer loop between two authored anchors**, because it requires real World consequences while staying small enough to falsify.

A concrete candidate for planning/falsification:

- one source anchor exposes a finite/renewable World-owned resource;
- one destination anchor exposes a World-owned local need/store;
- one resident has a pre-existing grounded local purpose to maintain/fulfil that condition;
- the resident can locally choose only a very small method vocabulary such as:
  `go to known source -> acquire if World permits -> go to known destination -> deposit if World permits -> reassess factual condition`;
- acquire/deposit are World actions with explicit success/failure outcomes;
- no model request is required between mechanically obvious phases;
- an unexpected absence/blockage/interruption can trigger cognition rather than being solved by an expanding local planner.

The exact fiction (`water`, materials, supplies, etc.) is intentionally not selected by this document. The experiment should choose the smallest content that exercises the authority structure without accidentally canonizing an economy.

## 7. Why not start with generic routines

A scheduler such as `home -> work -> social -> home` would make the map look alive very quickly but would answer the wrong question.

It would prove only that scripted motion can continue indefinitely.

The desired evidence is stronger:

> a resident can keep pursuing a persistent, grounded local purpose through changing factual World state, without requiring the LLM to issue every next action and without taking outcome authority away from the World.

Routine/schedule semantics may later become one source of purpose activation, after this causal split is defended.

## 8. Why not make `concerns` executable directly

Directly converting every open concern into activity authority would collapse semantic interpretation into motor policy.

Problems:

- model-authored prose would silently become executable state;
- many concerns are informational/social and have no obvious physical method;
- priority does not establish physical legality or method selection;
- resolving a concern and completing an activity are different facts;
- local fast-brain code would become coupled to LLM vocabulary.

A purpose may reference a concern/provenance source, but the executable contract should remain narrower and explicitly admitted.

## 9. Interruption contract to test early

The purpose layer is valuable only if it survives interruption cleanly.

Minimum intended semantics:

- `ACTIVE` purpose may own one current activity;
- addressed/urgent evidence may interrupt or replace the current activity without deleting the purpose;
- explicit higher cognition may `suspend`, `replace` or `resolve` the purpose;
- when interruption ends, local logic may resume/re-ground the purpose from **current** World/resident evidence rather than replaying a stale activity;
- obsolete activity identity must never regain authority merely because a purpose still exists.

First Hearth's realization suspend/resume evidence is a donor for this boundary, not an implementation to transplant wholesale.

## 10. Physical-outcome integration

The local-life stage should consume the physical causality being qualified separately rather than bypass it.

PR #126 currently qualifies a candidate seam where materially constrained/blocked World motion becomes bounded resident-private self evidence and exact blockage cognition provenance.

Do not make this local-life plan depend on PR #126 merging unchanged, but preserve the architectural rule:

`local purpose -> current activity/method -> World physical/action resolution -> resident evidence -> local continuation or cognition escalation`.

The local-life owner must never infer success merely because it issued a command.

## 11. First falsifiers

Before authority promotion, encode failures that the design must survive:

1. **All-idle baseline** — preserve the current tick-900 collapse as control evidence.
2. **No-provider continuity** — after purpose admission, several phase transitions occur with zero model responses.
3. **No fake success** — withholding the required World result prevents purpose advancement even if the resident reached the anchor.
4. **World refusal** — an acquire/deposit/action rejection produces evidence and does not silently advance phase.
5. **Interruption/resume** — an addressed interruption changes current activity; the purpose survives and later re-grounds from current truth.
6. **Stale method invalidation** — if source/destination truth changes while interrupted, the old activity is not blindly resumed.
7. **Knowledge boundary** — resident cannot choose an anchor/resource it has not learned/been explicitly familiarized with.
8. **No LLM metronome** — ordinary successful local transitions do not create mandatory cognition requests.
9. **Bounded failure escalation** — repeated locally unresolvable failure escalates once/boundedly rather than spinning or flooding cognition.
10. **Independent residents** — one resident's purpose/phase does not become shared mutable state or synchronize unrelated residents.

## 12. Owner-visible evidence

A future playable gate should make these distinctions visible without turning debug into gameplay UI:

- current purpose (if any);
- current method/activity;
- why this method is locally authorized;
- latest factual World outcome used to advance/hold/escalate;
- suspended/interrupted state;
- whether the last transition was local or cognition-authored.

The desired visual story is not “NPC is busy”. It is:

> “I can tell what this person is trying to maintain, what they are doing about it right now, what actually happened, and why they continued or changed course.”

## 13. Stage sequence

### L0 — characterization / authority contract

- keep existing all-idle characterization;
- select one bounded purpose specimen and one tiny World mechanic;
- prove which layer owns purpose, method and outcome;
- no broad feature architecture.

### L1 — one resident, one purpose, real consequence

- explicit seeded/admitted purpose;
- local multi-step continuation without provider;
- World-owned action result;
- evidence-driven completion/repetition/escalation;
- deterministic tests before browser polish.

### L2 — interruption and stale-state re-grounding

- addressed interruption;
- suspend/resume/replan from fresh World truth;
- bounded blocked/failure escalation;
- prove no stale activity resurrection.

### L3 — five-resident pressure

- several independent purposes/routines with different phases;
- long soak no longer collapses trivially to all idle;
- no global synchronized cadence;
- bounded state/memory/cognition pressure;
- residents may still legitimately idle when their purpose/world state gives them nothing to do.

### L4 — Owner living-world gate

Only after causal qualification ask whether the result actually reads as ongoing life rather than loops and debug machinery.

## 14. Explicit non-goals

Do not introduce during this stage unless evidence forces it:

- generic GOAP/HTN/utility-AI framework;
- ECS refoundation;
- general economy/inventory/jobs simulation;
- day/night schedule framework;
- hunger/thirst meters merely to keep NPCs moving;
- broad multi-agent planner;
- LLM call on every phase transition;
- fake `work` completion without World consequences;
- collision/pathfinding rewrite unrelated to the selected specimen;
- final save/load persistence design.

## 15. Decision rule after planning

Do not implement the whole stage from this document by inertia.

The next executable slice should be **L0 only**: choose the smallest real World mechanic + purpose specimen, encode red falsifiers around authority/continuity, and use those failures to decide the actual representation.

If the smallest honest mechanic already requires a large generic system, stop and redesign the specimen rather than expanding scope to justify the abstraction.

The project goal remains stronger than constant motion: **residents should have continuity of situated purpose in a shared causal world.** Idling is valid when earned; universal idle caused by exhausted one-shot scripts is not.
