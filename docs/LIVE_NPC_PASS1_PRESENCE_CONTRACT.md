# Live NPC Refoundation — Pass 1 Presence Contract

Status: **PASS 1 CLOSED — problem definition / presence contract**

This document captures the current-best problem definition produced by the Live NPC Refoundation Study after Pass 0 froze the recovered P0/P1/E1 substrate as bounded donor evidence.

It is intentionally **not an implementation architecture**. Terms such as `Active Life State`, `cognitive pressure`, skills/competences, semantic transition validation or a `Live Mind Runtime` remain hypotheses until later research compares alternatives.

---

## 1. North star

The project is trying to create **one persistent resident of a shared simulated world**, not a chatbot attached to a sprite.

A successful resident should remain one coherent participant across time and across players; experience only evidence that could reach it through the world; allow novel language and situations to change its intentions; retain meaningful unresolved consequences of earlier decisions; remain legitimately uncertain when evidence is insufficient; and act or communicate through world mechanisms whose real outcomes — not model declarations — determine what actually happened.

A useful shorthand is:

> **meaning may be generative; reality must remain grounded.**

The target is not maximum apparent intelligence. The target is **presence**: a player should increasingly treat the NPC as the same situated resident continuing through one history.

---

## 2. What Pass 1 changed

Several attractive early ideas were deliberately demoted from requirements to implementation hypotheses.

### Continuous computation is not the requirement

The requirement is:

> **NPC continuity exists independently of the lifecycle of an LLM inference.**

The future system may satisfy this with continuous local runtime, events, timers, reconstruction, scheduling or a hybrid. Pass 1 does not require a per-frame `Live Mind`.

### Public chat is not the requirement

The requirement is one **world-grounded communication reality**. Speech may later be local, whispered, directed or filtered. It must not create private contradictory copies of the NPC for different players.

Ordinary shared world chat remains the preferred first UX hypothesis, not a permanent global-audibility rule.

### Autonomy is not the requirement

A believable resident does not need to continuously invent goals. Persistent meaningful intentions, sensible inactivity and appropriate initiative are more important than action frequency.

### Rich memory is not the first requirement

The first Life Test mainly needs:

- immediate situation;
- active continuity;
- unresolved consequences;
- recent grounded outcomes.

Long-term memory, consolidation and forgetting are later research problems.

---

## 3. Product MUSTs

These are the strongest current product-level invariants. Future architecture may implement them differently, but breaking them would invalidate the intended NPC experience.

### P1. One resident / one shared present

One NPC remains one coherent resident in one world.

Multiple players, messages or tasks must not create mutually unaware private copies of its current intentions, commitments, knowledge or history.

This does **not** imply a single conversation lock. One resident may have several concurrent social matters while retaining one coherent present.

### P2. Situated evidence

The NPC may base experience on information that could actually reach it through legitimate world channels.

Direct observation, heard speech, its own action outcomes and later historical information must not collapse into arbitrary full-state omniscience.

### P3. Epistemic provenance and honesty

The system must preserve material distinctions such as:

- `X happened in canonical World truth`;
- `the NPC observed X`;
- `Alice said X`;
- `the NPC currently believes X`;
- `the NPC is uncertain about X`.

An utterance is evidence that someone said something. It is not automatic evidence that the utterance is true.

The NPC must be allowed to say or behave as if it **does not know**.

### P4. Continuity beyond inference

What the NPC is doing, why it is doing it and which earlier matters remain unresolved must not disappear merely because a model request ended, a conversation turn changed or an interrupt occurred.

Continuous LLM inference is not required; coherent continuity is.

### P5. Unresolved consequence persists causally

An accepted request, promise, unfinished matter, interrupted task or other meaningful consequence may later be completed, cancelled, suspended, superseded or renegotiated.

It must not silently vanish because a later inference omitted it from generated text.

This invariant does not require a specific `Commitment` data type.

### P6. Semantic agency

Novel language and novel combinations of known world circumstances must be able to change the NPC's interpretation, priorities or intentions in ways that were not all enumerated as hard-coded dialogue branches.

The LLM must therefore have real semantic authority, not merely prose-generation authority.

### P7. Outcome authority and embodiment

Intending, attempting and succeeding are different states.

The NPC may choose what it wants to try, but canonical World/execution mechanisms determine what physically or communicatively happened.

The NPC must be able to experience resistance, rejection, interruption and failure from the world.

### P8. Temporal coherence

Time may change the meaning of open matters, evidence and expectations even without a new external event.

The project does not yet require full real-time offscreen simulation, but it must not behave as if meaningful elapsed time did not exist.

### P9. World-grounded communication

Communication is an occurrence in the same shared world, not private prompt plumbing.

The future communication system must be able to distinguish at least conceptually:

- what was spoken;
- who spoke;
- who could receive it;
- who actually experienced it;
- whether the NPC interpreted it as addressed to itself.

Exact hearing ranges, channels and UI remain open.

---

## 4. Research / engineering MUSTs

These are required to keep the laboratory falsifiable even though they are not all player-facing product properties.

### R1. World truth is not model-authored

LLM output must not directly manufacture position, inventory, perception, action success, canonical event history or elapsed time.

### R2. Meaning, task and mechanics remain distinguishable

Conceptually preserve:

`semantic intention → grounded task/objective → local/mechanical actions → World outcome`

One intention may survive several tasks. One mechanical task can serve different semantic intentions.

### R3. Mechanical completion is not semantic satisfaction

`pickup succeeded` may complete a mechanical objective without proving that a social intention is satisfied.

Conversely, a semantic matter may become satisfied through a different real-world route even when the NPC's current task did not succeed.

### R4. Causal state is inspectable

The research/debug surface should make it possible to answer questions such as:

`what experience/change mattered → why cognition reconsidered → what semantic intention changed → what task/run served it → what World attempt occurred → what actually happened`

This is explicit system provenance, not hidden chain-of-thought.

### R5. Qualification attacks meaning, not literal scripts

Presence evaluation must vary wording, entities, ordering and disturbances. A system should not pass because one exact phrase maps to one hand-authored command.

---

## 5. Minimal experiential distinctions

Pass 1 does **not** freeze an event schema. It does establish distinctions that future designs must not accidentally collapse.

At minimum the design must be able to reason separately about:

- a World occurrence;
- an occurrence becoming available to the NPC through perception/communication;
- the NPC's interpretation or uncertainty about that evidence;
- a semantic intention;
- an attempted action;
- the real action outcome;
- interruption versus ordinary completion;
- an unresolved matter versus historical fact;
- elapsed time changing current relevance.

Useful exploratory labels included `Observed`, `Heard`, `Spoke`, `Intended`, `Attempted`, `Succeeded`, `Failed`, `Interrupted`, `Elapsed` and `Resolved`, but these names are **not canonical API types**.

Beliefs, emotions, relationships, goals, plans and long-term memories are generally state/interpretation built from experience rather than additional canonical World occurrence types.

---

## 6. Presence Qualification v0 — Life Test

The first meaningful future implementation should be judged by a short family of hands-on scenarios, not by prose quality alone.

A 5–10 minute single-NPC test should include variants of:

1. **request → grounded action** — a player asks for a real world action;
2. **mid-task revision** — the player changes the request while execution is underway;
3. **ambiguity** — the instruction cannot be honestly grounded without context or clarification;
4. **unverified information** — the player claims something the NPC has not observed;
5. **world contradiction** — later evidence disagrees with that claim or expectation;
6. **execution failure/race** — another actor changes the target before the NPC succeeds;
7. **interruption** — another meaningful matter temporarily changes what the NPC is doing;
8. **return/resumption** — the earlier unresolved matter is revisited after other activity or elapsed time.

The exact words, items, locations and ordering should vary.

### Hard failure conditions

Any of these strongly indicates that the foundation is wrong:

- **false success** — the NPC claims a result that World never confirmed;
- **omniscience** — the NPC uses information that never legitimately reached it;
- **continuity reset** — a meaningful unfinished matter disappears without causal resolution;
- **transcript reality** — someone's statement silently becomes canonical fact;
- **conversation clone** — another participant creates a contradictory private present for the same NPC;
- **intention lock** — meaningful new language cannot change an existing semantic course;
- **inference dependency** — coherent NPC state exists only while an LLM call is active;
- **forced certainty** — ambiguity is resolved by arbitrary invention when uncertainty or clarification would be legitimate.

### Multiplayer extension

A later adversarial extension should place at least two players around one NPC with conflicting or overlapping requests.

The qualification target is not perfect social behaviour. It is proof that **one NPC still makes one coherent set of decisions and retains one history**.

---

## 7. Strong architecture hypotheses — not requirements

Pass 1 produced several promising hypotheses that Pass 2 should research and attack rather than immediately implement.

### H1. Explicit active continuity

A small explicit representation of current life may be more valuable initially than a general memory system. It may need to answer:

- what am I currently trying to do?;
- why?;
- what remains unresolved?;
- what do I currently expect?;
- what materially changed?;
- where am I uncertain?;
- what currently demands attention?;

`Active Life State` is a useful working name, not a frozen class/schema.

### H2. Cognitive pressure instead of LLM-on-every-event

Most experience should be integrated without semantic inference.

A useful future mechanism may detect when the current semantic course no longer suffices because of ambiguity, expectation violation, conflicting matters, execution dead-end or other meaningful discrepancy.

Pressure may accumulate, dissipate or be resolved by new evidence without an LLM call.

### H3. Sparse semantic cognition with local routine competence

Known mechanical continuation should remain local. LLM cognition should be reserved for semantic interpretation/reconsideration rather than movement, retry loops or per-frame control.

### H4. Delta-like semantic transitions

A future cognition boundary may be safer if the model proposes bounded changes relative to existing continuity rather than rewriting the entire mental state on every inference.

A deterministic layer could protect factual/provenance invariants without deciding whether a social judgement is wise.

### H5. Grounded task / competence layer

Semantic intentions may compile into grounded objectives that local competences can execute until a new semantic branch is required.

The project should remain open to novel compositions of existing capabilities instead of requiring one hard-coded command for every meaningful behaviour.

This hypothesis does **not** yet choose FSM, BT, utility AI, GOAP, HTN, planner, skill library or another mechanism.

### H6. Short grounded planning horizon

Long-lived meaning may coexist with short-lived executable objectives. Large model-generated future histories are likely brittle because the world changes after each real outcome.

### H7. Expectation/discrepancy as a cognition signal

Differences between expected and observed outcomes may be a useful trigger for reconsideration and attention allocation. This is a donor idea, not a commitment to predictive-processing or active-inference architecture.

### H8. Active continuity before rich long-term memory

The first Life Test may be achievable with working continuity, unresolved matters and recent episodes before general memory consolidation/retrieval is designed.

---

## 8. Cognitive authority boundary

A useful current-best principle is:

> **LLM cognition may change meaning and intended direction; it may not author the history of what actually happened.**

Cognition may eventually help with:

- interpreting language/context;
- deciding whether evidence is sufficient;
- maintaining or revising intentions;
- choosing among semantically different priorities;
- asking for clarification or additional evidence;
- interpreting social significance;
- revising confidence in a belief;
- deciding that no semantic change is needed.

It must not self-certify:

- perception that did not occur;
- physical success;
- inventory/position changes;
- canonical speech delivery;
- new historical evidence;
- elapsed time.

`no change`, `defer` and legitimate uncertainty must remain valid outcomes of cognition.

---

## 9. Intent → task boundary

Pass 1 converged on several durable distinctions without choosing a planner.

- **Intentions carry meaning; tasks carry grounded executable objectives.**
- One semantic intention may generate several tasks over time.
- Task failure does not automatically delete the intention/open matter it was serving.
- Routine procedural decomposition should remain below semantic cognition when the meaning is already settled.
- When choosing the next grounded objective requires new semantic judgement, the problem should return upward rather than being hidden inside the executor.
- Every important task should retain causal provenance to the semantic matter it serves.

A useful granularity criterion for Pass 2 is:

> A task should be concrete enough that routine execution does not require new semantic judgement, but high enough that cognition is not driving mechanical micro-actions.

---

## 10. Anti-goals

The refoundation should actively avoid converging toward:

- **chatbot-with-a-sprite** — good prose with no grounded continuity;
- private per-player copies of one supposed NPC;
- an omniscient model with arbitrary full-world context;
- `LLM × NPC × FPS` cognition;
- an LLM acting as physics engine or movement controller;
- model-generated narration treated as future history;
- full mental-state replacement on every inference;
- transcript-as-mind or transcript-as-memory;
- speech automatically becoming belief or World truth;
- every event automatically forcing an LLM call;
- every execution failure automatically forcing an LLM call;
- autonomy measured as constant goal generation;
- forced certainty where clarification or uncertainty is appropriate;
- a giant hand-written social rules engine that resolves the very open-ended meaning the LLM is meant to handle;
- a giant general cognitive architecture before a small Presence Life Test earns the complexity;
- recovering E1-specific constants/interfaces merely because they already exist.

---

## 11. Open questions preserved for later passes

Pass 1 intentionally does **not** choose:

- the exact representation of current continuity;
- the exact cognitive-pressure/scheduling algorithm;
- the attention/addressedness model;
- the belief/evidence representation;
- memory storage, consolidation, retrieval and forgetting;
- planner vs FSM/BT/utility/GOAP/HTN/skill/hybrid approaches;
- task/competence representation and composition;
- speech/hearing range, channel and turn-taking semantics;
- persistence and offscreen/time-advance model;
- multi-NPC simulation and society;
- multiplayer cognitive concurrency strategy;
- long-horizon planning;
- social relationship/trust modelling;
- model routing and cost strategy;
- final model/provider;
- final conversation UI;
- final production/deployment architecture.

These are now **questions constrained by a presence contract**, not missing features to implement by checklist.

---

## 12. Pass 1 closure verdict

The Pass 1 model survives the current end-to-end contradiction audit.

The core chain is coherent:

`WORLD OCCURRENCE`
→ `GROUNDED EXPERIENCE`
→ `CONTINUITY / UNRESOLVED CONSEQUENCE`
→ `SEMANTIC RECONSIDERATION WHEN NEEDED`
→ `SEMANTIC INTENTION`
→ `GROUNDED TASK`
→ `LOCAL EXECUTION`
→ `WORLD OUTCOME`
→ `NEW EXPERIENCE`

No additional conceptual subsystem is currently required to define what the project is trying to prove.

Pass 1 is therefore **closed as a problem-definition pass**, subject to later Owner revision when real experiments reveal that a supposed invariant was wrong.

Closure does **not** mean the proposed architecture is known. It means later architecture work now has a falsifiable target.

---

## 13. Pass 2 mandate

Next stage:

**Live NPC Refoundation — Pass 2: architecture / donor / research campaign.**

Do not begin by implementing chat, memory, a planner or a `Mind Runtime`.

Pass 2 should:

1. map the responsibilities implied by this contract without prematurely mapping them to classes;
2. audit existing project donors and external architecture families against those responsibilities;
3. construct several competing architecture hypotheses;
4. attack each candidate with the Presence Life Test and anti-goals;
5. compare complexity, responsiveness, cost, persistence, inspectability and future multiplayer scaling;
6. select the smallest architecture capable of supporting a genuinely informative first Presence experiment;
7. only then define the first bounded implementation slice.

The central Pass 2 question is no longer:

> Which agent architecture sounds sophisticated?

It is:

> **Which architecture can preserve one grounded resident through the Presence Contract while using expensive semantic cognition only where it creates real value?**
