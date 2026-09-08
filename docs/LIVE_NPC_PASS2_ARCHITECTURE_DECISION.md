# Live NPC Refoundation — Pass 2 Architecture Decision

Status: **PASS 2 CLOSED — current-best architecture selection for the first Presence experiment**

This document records the result of the Pass 2 architecture / donor / research campaign that followed the Pass 1 Presence Contract.

It is a **bounded research decision**, not a final production architecture. The selected shape must earn itself through a small executable architecture probe before it is expanded into world-grounded communication, live LLM semantics, long-term memory, multiplayer hosting or a larger planner/skill system.

Canonical problem definition remains:

`docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`

---

## 1. Decision summary

For the first Presence experiment, select a **Minimal Resident Kernel** architecture hypothesis.

The kernel is not a giant `Mind Runtime`. It is the smallest explicit continuity/causality layer needed to keep one NPC one resident while sparse external semantic cognition may arrive late and the World continues to change.

Current-best chain:

`WORLD OCCURRENCE`
→ `GROUNDED RESIDENT EXPERIENCE`
→ `ONE LOGICAL RESIDENT OWNER`
→ `BOUNDED EVIDENCE + OPEN MATTERS`
→ `SEMANTIC RECONSIDERATION WHEN NEEDED`
→ `SCOPED SEMANTIC PROPOSAL`
→ `RECONCILE / COMMIT AGAINST CURRENT CONTINUITY`
→ `GROUNDED TASK / COMPETENCE`
→ `WORLD OUTCOME`
→ `NEW EXPERIENCE`

The LLM participates primarily in **meaning / practical judgement**. It does not own the resident while inference is pending, does not author World history and does not drive mechanical continuation frame-by-frame.

The selected architecture deliberately borrows ideas from other families without adopting those families wholesale:

- **C4-like perceptual honesty** for the World→experience boundary;
- **BDI/PRS-like commitment and intention-reconsideration semantics** as an adversarial model for open matters and persistent intentions;
- **actor/single-writer consistency** for one logical resident owner;
- the project's recovered **deterministic executor** as the first local-competence donor;
- the recovered **session/cycle/run provenance** as the seed for asynchronous causal ownership.

This is not a best-of-everything stack. Each donor is admitted only for one distinct responsibility.

---

## 2. Why one named AI framework did not win

Pass 2 compared several families against the same Presence Contract and Life Test.

### BDI / PRS

Strong donor for:

- persistent intentions;
- commitment versus reconsideration;
- interruption / resumption;
- interleaving practical reasoning with acting in a changing environment;
- resource-bounded deliberation.

But a conventional BDI/PRS architecture brings machinery the first experiment has not earned:

- a general desire/goal store;
- a general plan library / partially elaborated plan structure;
- explicit intention-plan stacks;
- conventional belief databases that often do not preserve the distinction `Alice said X` versus `X is canonical World truth` without extension.

The recovered project already has a grounded task/execution substrate. Importing a PRS-style plan library now would duplicate the competence layer before evidence says composition requires it.

Verdict: **semantic donor and adversarial mirror, not the whole architecture.**

### C4 / layered creature architecture

Strong donor for:

- perceptual honesty;
- separating world state from what one creature can sense;
- treating working context as richer than raw canonical facts;
- reactive embodied processing.

But C4-like sensory/working-memory/action layers do not by themselves give the project a first-class durable representation of social/request consequences that must survive interruption, another player and slow semantic inference.

A shared mutable blackboard would also be dangerous as the canonical owner of causal/provenance state.

Verdict: **perception/embodiment donor, not the whole architecture.**

### BT / GOAP / HTN / procedural planner families

Strong donors for local execution and future competence composition.

They are weak candidates for semantic resident identity because they naturally answer questions such as:

- which known procedure should run?;
- how can a grounded objective be decomposed?;
- how should procedural behavior react to a changed precondition?

They should not become the canonical place for:

- whether a player claim is believed;
- whether a request remains socially unresolved;
- whether an ambiguous utterance requires clarification;
- whether an interruption supersedes or merely suspends an earlier matter.

Verdict: **possible future competence mechanisms, not the semantic mind.**

### Memory-centric / generative-agent architecture

Observation + memory + reflection + planning is useful later, but a transcript/memory-centric loop can appear socially intelligent while still lacking one explicit current present, grounded outcome authority and unresolved causal continuity.

Verdict: **later memory/reflection donor, not the first foundation.**

### Full event sourcing

Excellent for audit/replay when the product genuinely requires it, but too much storage/schema/concurrency machinery for the first Presence experiment.

Verdict: **bounded causal journal now; full event-sourced authority is not justified.**

---

## 3. Responsibility map after Pass 2

The architecture needs responsibilities, not one class per noun.

### Already strong donors

1. **World truth and legality**
   - donor: `World`;
   - canonical position/inventory/action outcomes remain outside cognition.

2. **Durative local execution**
   - donor: `DeterministicExecutor`;
   - routine pursuit can survive transient atomic unavailability without semantic replanning.

3. **Execution causality / factual outcome correlation**
   - donors: `ExecutionDriver`, executor run provenance;
   - task/run ownership can be traced to its accepted cause.

4. **Stale asynchronous request protection**
   - donor: E1 arm/session/cycle handling;
   - a completed external request does not automatically regain authority after its owning session is stale.

5. **Bounded per-observer evidence projection**
   - donor: E1 grounding/perception;
   - current E1 wake fingerprint is too narrow, but the separation itself is valuable.

### New or generalized responsibilities

6. **One logical resident owner**
   - one canonical current continuity for the NPC;
   - multiple social matters may coexist without creating multiple private NPC copies;
   - hosting is intentionally unspecified.

7. **Bounded grounded experience**
   - recently relevant observations, heard speech, action outcomes and meaningful elapsed-time evidence;
   - experience is not World omniscience and not a full long-term memory system.

8. **Open-matter continuity**
   - durable unresolved semantic consequence;
   - may represent a request, question, concern, expectation or self-directed intention;
   - it is not a universal ontology of the mind.

9. **Semantic reconsideration scheduling**
   - semantic events or discrepancies may require expensive cognition;
   - routine mechanics should continue locally when meaning is settled;
   - exact `cognitive pressure` algorithm remains open.

10. **Asynchronous semantic proposal / reconciliation**
    - LLM inference produces a proposal, not temporary ownership of the resident;
    - World/resident experience can continue changing while inference is pending;
    - the returning proposal must be reconciled against current semantic dependencies.

11. **Intent→task boundary**
    - committed semantic direction remains distinguishable from grounded executable objective;
    - task grounding reads current World/evidence, not the stale inference snapshot.

12. **Outcome→continuity reconciliation**
    - World outcome becomes new experience;
    - `task succeeded` does not imply every semantic matter is automatically resolved.

13. **Causal observability**
    - debug should answer `experience → reconsideration → semantic change → task/run → World outcome`;
    - this is explicit provenance, not model chain-of-thought.

---

## 4. Minimal durable resident state for Presence v0

The trace attack did **not** justify a general belief database, desire system, planner library or memory engine.

The first architecture only needs to preserve four categories between semantic inference calls.

### A. Bounded grounded experience

Recent evidence with causal source, for example conceptually:

- observed entity/state change;
- heard speaker/text occurrence;
- real task/action outcome;
- meaningful elapsed time.

The exact schema is not frozen.

### B. Open matters

A small set of unresolved semantic consequences with enough continuity to answer:

- what remains unresolved?;
- why did this matter exist?;
- what semantic course currently serves it?;
- is it active, suspended, resolved, cancelled or superseded?;
- what is still ambiguous/uncertain?

The content does **not** need to be a giant closed enum. A matter is not the entire mind.

### C. Grounded task binding / provenance

Which current task/run serves which semantic matter and what real outcome returned.

### D. Pending cognition causality

Which semantic proposal is in flight, what semantic state/evidence it depends on, and whether it still has authority to modify that state when it returns.

Resident time/revision/focus metadata may support those records, but do not become independent cognitive subsystems merely because they need fields.

---

## 5. The decisive asynchronous trace finding

The most important Pass 2 trace was:

1. Jozz asks for the blue mug;
2. local execution begins;
3. Jozz says `actually the red one`;
4. semantic inference starts;
5. **before inference returns, Bob picks up the red mug**;
6. the old inference returns to a newer present.

A single global rule such as:

`stateVersion changed → reject inference`

is too coarse.

The physical world changed, but the semantic conclusion `Jozz revised the request to red` may still be valid.

The opposite failure is also possible:

- Jozz says `red`;
- inference starts;
- Jozz later says `no, blue after all`;
- the first result returns.

That proposal **is** semantically stale even if most unrelated resident state did not change.

Current architecture principle:

> **semantic proposals should carry scoped causal dependencies, not unconditional authority over the whole resident.**

A proposal that wants to modify matter `M1` should be valid only relative to the semantic revision/evidence dependency it was computed for.

New unrelated physical evidence does not automatically invalidate it.
A later semantic supersession of the same matter does.

After semantic commit, task grounding/revalidation always reads current World/evidence.

This generalizes the useful E1 stale-session lesson without turning every World tick into an inference-invalidating global CAS.

---

## 6. Execution while semantic reconsideration is pending

The trace exposed another real design problem:

> what should routine execution do after a semantically important message arrived but before slow cognition has interpreted it?

Two naive policies both fail:

- always continue: a mid-task revision can be heard yet the old task completes before cognition responds;
- always freeze on any speech: the NPC becomes latency-bound and chatbot-like.

For the first Presence experiment, the conservative candidate is:

- a clearly addressed semantic event may temporarily hold/suspend the currently affected task while reconsideration is unresolved;
- unrelated routine/world processing and resident experience continue;
- after semantic commit, the old task may resume, be replaced, remain suspended or be cancelled.

This policy is **not yet a permanent architecture invariant**. More permissive reversible continuation may later be safe.

The important invariant is that slow inference cannot silently make new semantic input irrelevant merely because the executor kept running.

---

## 7. Exact Life Test trace used to attack the architecture

The same trace was used against the Minimal Kernel, BDI-like and C4-like candidates.

1. clear request causes grounded action;
2. request is revised mid-task;
3. world changes while semantic inference is pending;
4. returned proposal is reconciled with the newer present;
5. transient target state changes again and local competence can continue without unnecessary new cognition;
6. ambiguous reference produces uncertainty/clarification rather than invention;
7. another player's meaningful request interrupts the first matter;
8. clarification for the suspended matter arrives while the interrupt is active;
9. an unverified world claim is heard and preserved as sourced speech rather than truth;
10. interrupting task completes and the earlier unresolved matter returns;
11. later direct observation contradicts the earlier player claim;
12. a later request must use the resulting epistemic conflict honestly rather than resurrecting transcript reality.

Key result:

- BDI semantics are excellent for intention persistence/reconsideration but require the same grounded/provenance/async shell and add plan machinery not yet needed;
- C4 is excellent for perceptual honesty but requires an A/BDI-like persistent matter/commitment layer to survive social interruption;
- the Minimal Kernel can satisfy the trace without general beliefs/desires/plans/blackboard if recent sourced evidence and open matters remain explicit.

---

## 8. Hosting / multiplayer boundary

`one logical resident owner` does **not** mean `must use Actor Framework X`.

For an isolated first architecture probe the kernel may be an in-process pure state machine.

For a later single-browser playable experiment it may still be hosted locally, with an explicit non-multiplayer qualification.

Before the multiplayer Presence extension, current resident authority must move to or already live in shared authority. The semantic core should therefore be designed so hosting can change without changing what one resident means.

Cloudflare Durable Objects are a strong future hosting donor because a Durable Object is a globally unique single-threaded stateful coordination unit and is explicitly suited to multiplayer/chat-style coordination. That is **not a Pass 2 hosting selection**; asynchronous interleaving and stale external cognition would still require the proposal/reconciliation contract.

---

## 9. Explicit non-decisions

Pass 2 does **not** select:

- a class/schema named `ResidentKernel` as permanent API;
- a BDI framework or BDI programming language;
- a general belief database;
- a desire store;
- a plan library;
- an intention stack implementation;
- a global cognitive blackboard;
- a BT, GOAP or HTN planner;
- a vector database;
- long-term memory / reflection / consolidation;
- full event sourcing;
- Durable Objects as the immediate host;
- concurrent LLM calls per matter;
- final cognitive-pressure algorithm;
- final addressedness/hearing mechanics;
- final task satisfaction algorithm;
- final communication UI;
- final model/provider.

These remain later questions. Do not turn this list into an implementation checklist.

---

## 10. First bounded implementation probe — P2-E0

Before changing the playable runtime, build a **headless host-agnostic causal kernel probe**.

Purpose:

> prove or falsify the selected continuity/reconciliation semantics deterministically before LLM variance, UI and communication mechanics are added.

### P2-E0 must prove

At minimum, deterministic tests should demonstrate:

1. an unresolved semantic matter persists independently of a cognition-call lifecycle;
2. a pending proposal is causally scoped to the matter/evidence it wants to change;
3. unrelated new World/evidence state during inference does not automatically invalidate a still-valid semantic revision;
4. a later semantic supersession of the same matter does invalidate the older proposal;
5. task/run binding remains causally attached to the matter it serves;
6. interruption/suspension does not erase the earlier matter;
7. after the interrupt resolves, the earlier matter remains eligible for resumption;
8. a mechanical task outcome returns as evidence and is not silently equated with arbitrary semantic satisfaction;
9. no test requires a general belief DB, plan library, blackboard or long-term memory system.

### P2-E0 deliberately excludes

- production/runtime integration;
- new World action semantics;
- speech UI;
- new Worker/model endpoint;
- real LLM calls;
- long-term memory;
- planner/skill composition;
- multiplayer hosting;
- Owner/browser qualitative testing.

A deterministic fake semantic provider is valid apparatus here because the question is causal ownership, not model intelligence.

### P2-E0 falsifiers

Reopen the architecture decision if the probe shows that the basic trace cannot be represented without one or more of:

- a broad general belief ontology;
- a plan library/intention graph merely to preserve simple interruption/resume;
- a global mutable blackboard;
- whole-state LLM rewriting;
- freezing the resident while inference is in flight;
- letting stale inference overwrite newer semantic reality.

If P2-E0 succeeds, the next earned stage is to connect the kernel to **world-grounded communication/experience** and then a live semantic provider, rather than immediately adding memory or a planner.

---

## 11. Qualification / evidence boundary

This Pass 2 decision changes **research direction only**.

It does not expand the recovered runtime claim at `b31a851c...`.

No Owner/browser gate is required merely to choose the architecture probe. A new Owner gate becomes meaningful once a playable Presence experiment exists and the project claims qualitative presence/feel.

The first implementation probe should use red-first behavioral tests where the proposed causal contract naturally admits them, exact-head CI/Cloudflare qualification where applicable, and bounded evidence before product integration.

---

## 12. External research donors

Primary or high-quality sources used during Pass 2 include:

- C4 / Creature Smarts, MIT Media Lab — perceptual honesty, sensory/perceptual separation, working context:
  - https://characters.media.mit.edu/Papers/gdc01.pdf
- BDI Agent Architectures: A Survey, IJCAI 2020 — interpreter structure and trade-offs:
  - https://www.ijcai.org/proceedings/2020/0684.pdf
- Bratman, Israel & Pollack, Plans and Resource-Bounded Practical Reasoning — plans/intention as constraints on repeated deliberation:
  - https://www.sri.com/publication/plans-and-resource-bounded-practical-reasoning/
- SRI PRS material — reactive monitoring and partially elaborated procedural knowledge:
  - https://www.sri.com/wp-content/uploads/2021/12/1028.pdf
- Microsoft Orleans request scheduling — turn-based/single-threaded actor execution and async interleaving hazards:
  - https://learn.microsoft.com/en-us/dotnet/orleans/grains/request-scheduling
- Cloudflare Durable Objects rules/overview — globally unique stateful coordination units and multiplayer/chat use cases:
  - https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
  - https://developers.cloudflare.com/durable-objects/

These sources are donors and constraints, not authority over the product vision.

---

## 13. Pass 2 closure verdict

The comparative architecture campaign has reduced the main uncertainty enough to stop broad framework shopping.

Current-best architecture for the **first Presence experiment**:

> **one host-agnostic logical resident owner preserving bounded grounded experience, unresolved semantic matters, task causality and scoped asynchronous semantic proposals; local competences execute grounded work through World authority; BDI and C4 remain design donors rather than adopted whole frameworks.**

The next question is no longer `which agent framework?`.

It is:

> **Can the minimal resident causal kernel survive P2-E0 without growing into the complexity Pass 2 deliberately rejected?**

Pass 2 is therefore closed as an architecture-selection research pass. P2-E0 is the next bounded implementation/research frontier.