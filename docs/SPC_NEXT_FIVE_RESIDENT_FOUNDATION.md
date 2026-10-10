# SPC Next — five-resident living-world refoundation

> **CURRENT EXECUTION NOTICE (2026-09-25): HISTORICAL FOUNDATION / DONOR CONTRACT.** The architectural commitments here remain useful donor constraints where later evidence has not overturned them, but the document's “fresh refoundation branch” status and campaign sequencing are obsolete. Do not use it as current execution authority. Current authority: `docs/SPC_POST_STRESS_RECOVERY_PROGRAM.md`; current R6 contract: `docs/SPC_R6_COMPLEMENTARY_PERSONHOOD_EXPERIMENT.md`.

Status: fresh aggressive refoundation branch. The existing First Hearth runtime is a donor and regression specimen, not an architecture constraint.

## Product target

Build a shared living 2D world in which five independent SPCs can inhabit a materially larger authored map at once, continue useful local behaviour between model calls, perceive only causally available information, form different histories, meet and affect one another, and remain inspectable enough that failures can be explained from public causal evidence.

This is not five copies of Mira in a larger room. It is a pressure test for the long-term direction shared by LLM SPC, the resurrected Tibia-like 2D game, Mini_World / mini-MMO aspirations and Tibia3D-like living-world ambitions:

- strong sense of place, distance, expedition and return;
- actors sharing one world rather than private conversational realities;
- information acquired through world causality rather than injected omniscience;
- local physical/social continuity that does not wait for an LLM round-trip;
- authored places and territorial structure rather than a featureless AI arena;
- SPCs behaving as fellow inhabitants/participants under the same world rules as players;
- future compatibility with 1–6 human actors without making this branch a multiplayer rewrite.

The resurrected legacy Tibia-like project is used here as a product-pressure donor, not as an executable specification. Its useful soul is locality, traversal, danger, vertical/connected authored places, encounters and return. Legacy combat, quests, classes, AI, progression and old implementation mistakes are not preserved by default.

## Architectural commitments

### 1. One authoritative World

Physical truth, actor positions, interactions and occurrences are owned by one World runtime. Resident minds may propose intent but cannot directly mutate truth. There is no per-SPC private world simulation.

### 2. Identity is not control source

An actor may be controlled by a player, an SPC runtime or later another authority source. Actor identity, control source, authority and capability remain separate. This keeps the system compatible with future mini-MMO pressure without implementing networking now.

### 3. Spatial locality first

A much larger map must not imply every resident scanning every entity each tick. World queries use a spatial index and regions/chunks. Perception is candidate-driven and then filtered by the perceiver's own range and modality.

### 4. Multi-rate cognition

World simulation, local live-brain updates and model cognition have separate cadences.

- World truth can advance at a fixed simulation cadence.
- The local live brain runs frequently and cheaply.
- LLM cognition is event/salience/uncertainty driven and may burst when needed, but is not a per-frame controller.
- Quiet residents can continue work, travel, wait, follow routines or remain idle without manufacturing model traffic.

No current model name, complimentary quota or current pricing is part of the architecture contract.

### 5. One SPC = one continuing mind

Each SPC owns an independent perspective, working state, concerns, activity, memories and cognition scheduling state. Public speech is a world occurrence. Hearing the same utterance does not make two residents share a private cognitive state.

### 6. Intent -> activity -> skills -> World consequences

High-level cognition should choose or revise intent and commitments. A resident's local activity runtime then performs bounded skills over time. Skills query current world truth and produce validated commands. World facts determine outcomes.

The goal is not a giant enum of bespoke behaviours. The goal is a composable activity layer capable of travel, investigate, communicate, acquire, carry, use/work, wait, accompany and later combat/social work without teaching the LLM trajectories.

### 7. Causal perception and memory

Perception is grounded from occurrences and spatial state. Memory records what a resident experienced or concluded, with provenance. World truth, observation, belief and remembered belief are distinct. Debug tools may expose all of those to the Owner while the resident itself only receives its private perspective.

### 8. Bounded public observability

Every meaningful resident transition should be explainable without chain-of-thought:

world occurrence -> perception -> attention/reason -> cognition request (if any) -> admitted decision -> activity transition -> skill/world command -> factual outcome -> memory/concern update.

This trace is diagnostic evidence, not causal authority.

## Scale target for the first refoundation campaign

The first new architecture is designed around:

- 5 simultaneous independent SPCs;
- 1 local player actor;
- a world envelope on the order of several thousand world units across, split into authored regions;
- residents distributed across different places rather than clustered in one hearth;
- at least several independently active activities at once;
- local communication, travel and discovery without global scans;
- event-driven cognition pressure rather than synchronized request storms;
- deterministic/headless qualification before expensive live-model runs.

Five residents is the first real design target, not the final scalability ceiling.

## Initial world shape

The first large-map specimen should feel like a tiny inhabited RPG region rather than an AI lab room. Suggested topology:

- Hearth / settlement core;
- workshop / material-work area;
- market / social crossing;
- field / road transition;
- forest edge;
- cave or ruin approach;
- one deeper dangerous destination.

The important property is connected geography with distance and reasons to move, not the exact theme list. Residents should be able to be genuinely elsewhere and have histories that diverge.

## Resident pressure roles

The first five residents should differ in situation and routine rather than only prompt biography. For example:

- one settlement worker;
- one gatherer / courier;
- one explorer / scout;
- one social/service resident;
- one resident with a distant recurring activity.

These are test pressures, not permanent RPG classes. Their purpose is to force independent schedules, travel, meetings, interruption, memory and resource contention.

## Runtime decomposition

`SpcWorldRuntime`
- owns authoritative tick, actors, regions, spatial index, occurrences and resident control registration;
- steps the World exactly once;
- delivers only spatially plausible perceptual candidates;
- applies resident commands after validation.

`ResidentRuntime`
- owns private resident state;
- receives grounded percepts;
- maintains bounded recent experience;
- owns one current activity plus future extension points for suspended/background commitments;
- runs the fast local brain;
- queues cognition reasons through a model-agnostic scheduler;
- never owns World truth.

`ChunkSpatialIndex`
- maps actors/entities to coarse cells;
- supports bounded radius candidate queries;
- makes larger maps cheap when actors are spatially separated.

`CognitionScheduler`
- coalesces reasons by salience and causal freshness;
- allows urgent bursts without synchronizing all residents;
- supports quiet review deadlines;
- exposes request eligibility but does not call a provider itself.

Future seams, deliberately not implemented in the first mechanical slice:
- provider/model router;
- episodic/semantic long-term memory retrieval;
- hierarchical navigation graph and local steering;
- persistent resident save/restore;
- work/resource economy;
- social relationship model;
- combat;
- remote multiplayer authority.

## Donor policy

Existing First Hearth code may donate proven mechanics such as physical perception, communication, item handling, browser instrumentation and Luna transport. Donor code is imported only when it fits the new ownership model. Old host contracts are not preserved just because they already exist.

Companion-Brain-Lab may later donate local-brain, coordination or command findings, but it is not the architectural owner of this project.

Multi_World may later donate proven identity/control/authority and networking seams, but this campaign remains single-process until a shared-world question actually requires networking.

## First qualification campaign

The new foundation earns the right to proceed when deterministic tests establish all of the following together:

1. five resident identities coexist in one World with independent private state;
2. a large spatially separated world does not leak distant events into resident perception;
3. local live-brain activity continues without any model response;
4. cognition reasons are resident-local and burst/quiet capable rather than one global polling loop;
5. world mutations remain authoritative and validated;
6. one resident cannot observe another resident's private memory or cognition state through normal runtime APIs;
7. simultaneous resident activity does not create a second World clock;
8. debug evidence can reconstruct the public causal story for each resident;
9. existing project code remains available as donor/regression evidence while the new runtime is built beside it.

After that mechanical foundation, the next product-facing gate is not 'add more abstractions'. It is a playable large-map five-resident scene with real Luna calls and enough world mechanics that the Owner can simply live in it, interfere with routines, follow residents, disappear, return, ask questions and observe whether five different lives remain coherent.
