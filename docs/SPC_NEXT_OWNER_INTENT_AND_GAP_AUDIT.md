# SPC Next — Owner intent recovery and live gap audit

> **CURRENT EXECUTION NOTICE (2026-09-25): DURABLE OWNER/PRODUCT GUARDRAILS, NOT EXECUTION ROADMAP.** The Owner intent in this document remains important; many implementation-gap statements are historical. Current execution authority is `docs/SPC_POST_STRESS_RECOVERY_PROGRAM.md`; the active R6 contract is `docs/SPC_R6_COMPLEMENTARY_PERSONHOOD_EXPERIMENT.md`; latest bounded empirical finding is `docs/SPC_R6_ENDOGENOUS_ORDINARY_PERSONHOOD_FINDING.md`.


Status: **binding direction/reality guardrail for the current refoundation, not a frozen architecture**  
Recovered against live head `f10553900a1662cec21aabfd5bee706a6864897f` on 2026-09-15.  
Scope: `refoundation/spc-next-five-resident-world` / draft PR #125.

## Why this document exists

The project can drift while every local change remains technically defensible. The recurring failure mode is to recover the latest implementation task but lose the Owner-level target, then optimize a substrate or abstraction until the resident itself becomes secondary.

This document prevents that failure. When a local roadmap, handoff or convenient technical sequence conflicts with the intent below, stop and re-evaluate rather than following inertia.

## 1. Product truth

The target is **five genuinely living SPCs in one shared authored world**.

The project is not primarily:

- a world engine waiting for future AI;
- five chatbots attached to bodies;
- a prompt/memory experiment;
- an LLM-controlled WASD loop;
- a collection of headless contracts that only become understandable through debug text.

The World is the causal substrate in which residents exist. A resident must have a private history, limited knowledge, ongoing matters, bodily presence, local competence, interruptions, consequences and continuity across model calls.

The Owner must be able to enter the world, interfere, disappear, return, talk, observe, follow residents and discover whether different lives remain coherent without reading implementation details.

Five residents are the first real design pressure, not five copies of one demo NPC and not a scalability afterthought.

## 2. Local brain is a primary intelligence, not an executor

The local live brain is intended to become a rich continuous embodied intelligence in its own right. It should eventually own or participate in:

- sensory processing and attention;
- facing/orientation and local spatial awareness;
- steering and navigation execution;
- micro-problem solving and recovery;
- procedural competence and manipulation;
- routine continuation;
- local reactions and improvisation;
- bounded learning/adaptation where evidence justifies it.

Game-AI practice is a donor, not the quality ceiling.

The LLM supplies higher-level judgement, reinterpretation, semantic decisions and difficult reconsideration. It is not the per-frame controller. Cognition intensity may be highly bursty and must not be prematurely constrained by old model cost/RPM assumptions. Real latency, quality, reasoning usage, tokens and cost are measured empirically.

## 3. Causal/epistemic truth remains non-negotiable

Keep these distinctions explicit:

`World truth != resident knowledge != resident belief != remembered belief`.

`hearing != understanding != addressee != responsibility`.

`semantic purpose != current bodily activity != physical outcome`.

A resident can know a place without the World granting them global map knowledge. A resident can hear a voice without learning an exact hidden coordinate. An LLM proposal cannot create a physical success. Debug visibility cannot become resident knowledge.

## 4. World-readable evidence is part of the foundation

The earlier project repeatedly advanced headless evidence faster than visible world quality. That is not presentation debt; it can hide a false architecture.

Every meaningful embodied milestone should be assessable in World-only mode before the research lens is used to explain it. Important public consequences belong in the world. Private cognition may be exposed by the research lens, but the panel must not substitute for missing embodied feedback.

The research tool is required to reconstruct causal state without exposing model chain-of-thought: perception/provenance, acquired knowledge, active matters, current execution, attention, cognition attempts, admitted decisions, physical outcomes and memory changes.

## 5. What SPC Next has genuinely improved

Current live code has real foundation gains:

- one authoritative World clock;
- independent resident runtimes/private state;
- spatial candidate indexing;
- resident-local adaptive cognition scheduling with bounded global concurrency;
- causal percept modality and private memory boundaries;
- stale async decision protection;
- region familiarity/visitation knowledge;
- deterministic World phase semantics;
- emission-time occurrence witness snapshots;
- continuous actor sight lifecycle;
- authored LOS blockers;
- intent vs resolved-motion outcome seam;
- resident-independent execution phase;
- authored regions and World anchors with defensive World authority;
- routing destinations separated from authored places.

These are useful foundations. They do **not** prove a living resident.

## 6. Live reality gaps at `f1055390`

### G1 — the browser SPC Next scene is not an end-to-end LLM-SPC runtime

`SpcNextResearchScene` directly creates/steps the five-resident World. It does not own a `SpcCognitionHost`, collect cognition batches, dispatch provider requests or settle proposals.

`worker/spc-next-cognition.ts` exists, but `worker/index.ts` does not expose an SPC Next endpoint.

Therefore the current `?spc=1` living-world research scene is a local World/perception scaffold, not evidence of live SPC cognition.

### G2 — the local brain is much thinner than the intended second intelligence

`ResidentRuntime.fastStep()` currently resolves mostly:

- idle/work => stand still;
- travel/investigate => move toward points/waypoints;
- follow => chase current/best-known contact;
- communicate => seek contact and speak.

This is a useful execution kernel, not yet the local intelligence target. Do not mistake clean ownership for sufficient cognition.

### G3 — resident life is still flattened into one current `ResidentActivity`

The cognition contract offers KEEP / STOP / REPLACE of one bodily activity. The grounder maps semantic judgement directly into the same activity layer.

There is no defended persistent representation of an ongoing matter/purpose/commitment that survives a temporary bodily interruption.

This is the architectural meaning of the fresh correction:

> **semantic purpose != bodily activity**

A resident interrupted while working must not lose the fact that the work still matters merely because the body temporarily talks, searches or moves elsewhere.

### G4 — the five-resident specimen is still mostly a scripted scaffold

The five residents begin with manually seeded travel/investigate/idle activities. Janek is explicitly idle because a fake `work` mechanic was rejected.

This is honest and preferable to fake autonomy, but it means persistent local life has not yet been built.

### G5 — the authored world is large but still sparse

The 8192x8192 envelope and regions create distance/topology pressure, but the current SPC Next specimen has almost no actionable ecology or objects, no movement collision, no rich local environment and no meaningful World-owned work/resource loop.

Do not confuse map dimensions with a living world.

### G6 — attention/facing has regressed from useful donor work

SPC Next sight is currently radial + LOS. There is no authoritative facing/attention state; the client heading is derived from resolved velocity and deliberately cannot claim gaze.

This blocks an important class of readable embodied reactions: turn toward a speaker, look at a workpiece, check a remembered location, visibly redirect attention after interruption.

### G7 — interaction capability is not real yet

`emitInteraction()` emits an observed World occurrence; it is not a resident execution authority. There is no general resident interaction command/outcome path and almost no actionable objects in SPC Next.

### G8 — memory exists, but durable life does not

`ResidentMind` has bounded beliefs, concerns, known actors/regions and percept evidence. Save/restore persistence is not qualified. More importantly, current concerns are not yet integrated strongly enough with persistent purpose/execution continuity to constitute a resident life model.

### G9 — the current research lens lost some useful First Hearth observability

The SPC Next panel exposes recent percepts, public activity, recent trace and public occurrences. It does not yet expose the full private semantic story needed for the Owner target: current matters/purpose, beliefs/concerns, attention, acquired place knowledge, cognition attempt/settlement and interruption/resume chain as one coherent causal narrative.

## 7. Donor-loss audit — useful First Hearth capabilities that must not be forgotten

First Hearth is not the architecture to preserve, but it already demonstrated several valuable behaviours/concepts that SPC Next currently lacks.

### D1 — suspend/resume continuity

First Hearth supported explicit continue/replace/stop/suspend/resume semantics, one suspended execution and local checkpoint/progress continuity. This is directly relevant to the new purpose/activity separation.

Do not re-import the old host wholesale. Recover the semantic lesson and useful mechanics behind it.

### D2 — object search/manipulation/delivery

The donor could search for described items, carry/pick/deliver them and preserve parts of local progress. SPC Next currently has no equivalent actionable object loop.

The old implementation may not fit the new World authority, but the capability is important evidence that embodied task execution must extend beyond locomotion.

### D3 — checked absence and richer spatial epistemics

First Hearth distinguished remembered positions from checking an old location and finding it empty. That is a materially richer epistemic action than simply keeping `lastKnownPosition`.

This should return when the local brain gains deliberate attention/search behaviour.

### D4 — facing/looking

The old donor explored directional vision, facing and the ability to gather information by looking. SPC Next currently has cleaner LOS authority but less embodied attention.

The right future system should combine the stronger new causal boundaries with the useful donor capability.

### D5 — richer research/decision observability

The old research view exposed World vs resident knowledge, matters, beliefs, pending cognition and preserved decision evidence. The new lens is cleaner in some physical areas but semantically thinner.

### D6 — real Luna/browser loop and transport recovery

First Hearth actually exercised the live Luna endpoint in browser runs and implemented retry/diagnostic separation around failures. SPC Next has a newer worker implementation but is not yet connected end to end.

The new system should recover live-model experimentation without restoring old ownership mistakes.

## 8. Corrected development strategy

Do **not** return to horizontal substrate-first development.

Do **not** attempt to build every final subsystem at once either.

Use **bounded vertical living slices**:

1. choose one material question about resident life;
2. add only the World/local-brain/cognition capability required to test it honestly;
3. make the behaviour visible/readable in the browser;
4. exercise it with deterministic/adversarial tests **and** real provider/runtime evidence where relevant;
5. falsify it through interruption and multi-resident pressure;
6. only then generalize the architecture that survived.

Subsystems can still receive deep professional campaigns. The campaign must remain anchored to an observable resident capability rather than becoming infrastructure momentum.

## 9. Corrected immediate campaign

The previous handoff (`anchor-private-knowledge -> visitation -> interruption/return`) captured a real next seam but was too narrow if interpreted as the entire direction.

### Phase A — finish place epistemics only to the minimum required

Add resident-private known anchors with provenance such as familiar/visited. Known place coordinates may ground a semantic destination only when that resident legitimately knows the place.

Embodied visitation may upgrade private knowledge. Do not invent `observed` until anchors have real sensory representation.

Stop expanding the anchor system after this prerequisite is qualified.

### Phase B — introduce a resident-life kernel before more substrate work

Create the smallest falsifiable representation that separates:

- continuing matter/purpose/commitment;
- current bodily execution/activity;
- interruption/suspension state;
- completion/abandonment/reconsideration.

Do not design a universal planner or giant theory-of-mind framework. Recover the useful suspend/resume lesson from First Hearth under the new ownership model.

### Phase C — make the first interruption/return slice visibly embodied

Use one resident (Janek is the existing pressure role) inside the five-resident World:

`own local matter -> bodily execution -> player/world interruption -> attention/reaction -> temporary different activity -> preserved matter -> return/resume or conscious semantic change`.

This slice needs enough authoritative attention/facing and visible World feedback that the Owner can see the interruption and return without reading only a trace.

### Phase D — require one real World consequence

Do not validate life using a `work` label or timer alone. The resident's activity must cause or progress some World-owned state that survives interruption.

Keep the mechanic deliberately small; its purpose is to falsify continuity, not to build an economy.

### Phase E — wire SPC cognition end to end in the same campaign

Expose the SPC Next worker endpoint, connect the browser runtime to `SpcCognitionHost`, preserve private context sanitation/stale-attempt authority, and exercise real Luna-class cognition.

Local execution must continue during provider latency/failure. Measure actual request timing, model usage, reasoning/latency and failures rather than optimizing from assumptions.

### Phase F — restore the research lens around the real life loop

Make it possible to inspect, for the selected resident:

`private evidence -> acquired knowledge -> current matter/purpose -> attention -> active/suspended bodily activity -> cognition reason/attempt -> admitted semantic change -> World action/outcome -> memory/update`.

This is explicit state/provenance, not hidden model chain-of-thought.

### Phase G — reattack under all five residents

After the slice works for one resident, stress it with five independent residents, NPC<->NPC and player<->NPC interruption, unrelated overheard events, concurrent cognition and long local continuation.

The architecture only earns generalization after this pressure.

## 10. What is deliberately not the immediate priority

Until the living slice requires them, do not let these become the main campaign again:

- more macro map area;
- richer anchor taxonomies;
- generic ECS/plugin frameworks;
- broad economy/progression;
- full collision/navigation stack;
- persistence/save format;
- universal social/reputation model;
- combat.

This does not declare them unimportant. It prevents them from outrunning the resident-life experiment again.

Collision/navigation can move forward immediately when the vertical slice produces a real blocked/recovery question. Facing/attention is different: it is likely required early because it directly carries resident presence and reaction readability.

## 11. Gate language

Current branch status should be described as:

**CAUSAL/MULTI-RESIDENT FOUNDATION MATERIAL · MAJOR RESIDENT-LIFE CAPABILITIES STILL MISSING · LIVE SPC LOOP NOT YET CONNECTED · NOT OWNER-LIVING-WORLD READY**

Do not call the current state `living world PASS`, `SPC ready` or equivalent.

The next meaningful milestone is not "anchors complete" or "collision complete". It is the first credible, world-readable demonstration that one of five residents has a continuing life matter, can be physically and cognitively interrupted, remains the same resident through that interruption, and then resumes or consciously changes course through grounded judgement.