# SPC Next — current-state reconciliation and authority roadmap

Status: **live working reconciliation, not a frozen architecture**  
Scope: `refoundation/spc-next-five-resident-world` / draft PR #125  
Purpose: replace the stale assumption that the original F1–F12 audit is still the current roadmap.

## 1. Current truth

SPC Next is no longer only a five-resident skeleton. It now has independently exercised seams for:

- private resident perception and bounded memory;
- local fast-brain execution between model reviews;
- per-resident cognition scheduling plus bounded global LLM concurrency;
- evidence-grounded cognition proposals and stale-attempt protection;
- semantic region knowledge and authored inter-region routing;
- continuous actor sight lifecycle with distance hysteresis;
- authored point-to-point LOS through opaque AABB sight geometry;
- emission-time World-occurrence witness snapshots;
- deterministic World phase semantics captured by characterization tests.

Qualified campaign checkpoints at this reconciliation:

- private cognition trust boundary — **PASS**;
- World invariants — **PASS**;
- perception continuity — **PASS**;
- physical point-LOS — **PASS**;
- occurrence emission-time causality — **PASS**;
- World phase characterization — **PASS**.

These labels are intentionally scoped. In particular, `physical point-LOS PASS` does **not** mean that sight, embodiment or navigation are finished.

## 2. Original F1–F12 reconciliation

| Finding | Live status | Current interpretation |
| --- | --- | --- |
| F1 — global 1 Hz cognition poll | **DEFENDED** | `CognitionScheduler` is resident-local, event/reason driven and adaptive; `CognitionCoordinator` only arbitrates scarce LLM concurrency. Local life does not depend on a global model poll. |
| F2 — no causal event stream | **DEFENDED** | World occurrences, private percepts, causal evidence IDs and emission-time witness snapshots now preserve the distinction between world fact and personal evidence. |
| F3 — no persistent world knowledge | **PARTIAL** | `ResidentMind` owns bounded known actors/regions, beliefs and concerns. Runtime continuity exists, but save/load persistence and richer durable world knowledge are not yet a defended contract. |
| F4 — no `interact` execution path | **OPEN IN SPC NEXT** | `emitInteraction()` represents an observed World occurrence; it is not a resident action/execution authority. A real interaction mechanic must be World-owned before the LLM can request it. |
| F5 — movement blocked by old stop-radius design | **SUPERSEDED / PARTIAL** | The old mechanism is gone. Local activities continuously produce movement intent, but today a `move` command still becomes velocity directly. Collision and authoritative movement outcomes are not present yet. |
| F6 — no actual route authority | **PARTIAL** | `RegionNavigationGraph` supplies authored inter-region routes and resident-knowledge constraints. It is not local obstacle navigation and cannot replace future collision-aware pathing. |
| F7 — hard-coded client/worker knowledge | **DEFENDED IN CURRENT SCOPE** | Model context comes from private resident state; region familiarity is explicitly seeded or physically discovered rather than injected through prompt-global world knowledge. |
| F8 — `visibleNearby` encoded omniscience | **DEFENDED** | Current model context receives private percept-derived knowledge. Current visibility, last-known position and hearing cues are distinct. The model does not receive the public World snapshot. |
| F9 — weak movement planning at radius edge | **SUPERSEDED / OPEN AS NEW PROBLEM** | The original edge behavior is no longer authoritative, but movement quality has not yet been qualified against collision, target-body geometry or local navigation. Fixed arrival/contact radii remain provisional. |
| F10 — no physical LOS / geometry | **PARTIAL** | Point-LOS through authored blockers is qualified. Actor visibility volume, FOV/facing, collision geometry, dynamic occluders and acoustic occlusion remain open. |
| F11 — no cancellation / in-flight coordination | **DEFENDED LOCALLY, PARTIAL END-TO-END** | Per-resident cognition attempts have identity, stale-revision rejection, requeue/abandon semantics and a global concurrency coordinator. Full transport/runtime cancellation and recovery still need live-system qualification. |
| F12 — model template repeats current activity | **DEFENDED** | The contract exposes explicit KEEP / STOP / REPLACE semantics. The system prompt tells the model to preserve continuity when appropriate rather than re-authoring the current activity mechanically. |

## 3. New debt revealed by successful refoundation

The original audit could not list problems created by the new architecture. The material ones now are:

### N1 — World authority concentration

`SpcWorldRuntime` accumulated actor state, spatial indexing, motion integration, occurrence buffering, witness capture/delivery, continuous sight, resident cadence and region updates.

This is not yet an unrecoverable God object, but adding collision, navigation, interactions, FOV and acoustic propagation directly to it would make one.

**Current response:** extract by authority, not file size. `ActorWorldState` is the first boundary: it owns mutable physical actor state, spatial indexing and integration while returning snapshots to callers.

### N2 — resident cadence depended on registration order

The local-brain phase was previously derived from `residents.size % brainIntervalTicks`. A red test demonstrated that the same resident could act on tick 4 or tick 1 solely because an unrelated resident was registered first.

**Required invariant:** execution phase is stable from resident identity + interval, independent of registration order. This is important for future streaming, save/load and dynamic populations.

### N3 — intent and physical outcome are not yet separate enough

`ResidentRuntime.fastStep()` produces a `move` command and World currently accepts it as desired velocity. This is adequate for a no-collision foundation but not for embodied SPC.

Before collision becomes authoritative, the architecture needs an explicit seam:

`resident intent -> World physical resolution -> causal outcome -> resident evidence/replanning`

A resident may decide *what it is trying to do*. It must not decide whether the body actually moved, reached, touched, picked up or interacted.

### N4 — point sight is not embodied sight

A point ray is now trustworthy, but an actor is not a mathematical point. Future qualification must decide what fraction / sample / shape of an actor body constitutes visible contact, then layer FOV/facing deliberately rather than hiding those semantics in LOS epsilon hacks.

### N5 — inter-region route knowledge and local pathing are different layers

The current graph is useful semantic/large-scale route authority. Collision-aware local navigation remains absent and should not be forced into `RegionNavigationGraph`.

### N6 — private runtime memory is not yet persistence

Bounded in-memory knowledge is real and useful, but save/load continuity has not been qualified. Do not call the current mind "durable memory" until persistence and provenance survive serialization/reconstruction.

## 4. World phase contract now treated as architecture

The current tested phase semantics are:

1. advance the authoritative World tick;
2. deliver occurrences queued earlier while preserving their emission-time witness evidence;
3. sample continuous sight from the current pre-integration world state;
4. run eligible local resident brains against that same pre-integration state;
5. apply resident commands as World inputs;
6. integrate authoritative actor motion once;
7. update semantic region membership from post-integration positions.

Speech produced during a resident fast step is snapshotted at emission but delivered to another mind on the following World step. This avoids cross-resident mutation in the middle of execution iteration while preserving event-time causality.

This ordering is now protected by `world-phase-contract.test.ts`. A refactor may change it only deliberately, with a new causal argument and red/green evidence.

## 5. Authority refoundation — current-best sequence

This is a direction, not a frozen framework design.

### A. Physical actor authority

Move mutable actor registry, velocity, position integration and spatial index behind one authority. No mutable `ActorState` escapes. This becomes the future insertion point for collision/motion resolution.

### B. Occurrence / witness authority

Extract creation, bounded World ledger, emission-time observer snapshots and deferred delivery from the orchestrator. Keep public World facts separate from private sensory witness state.

### C. Continuous sensory authority

Extract candidate gathering / LOS / sight lifecycle orchestration while preserving resident-private trackers. Do not merge hearing and sight merely because both are perception.

### D. Explicit execution resolution

Replace the accidental equivalence `move command == movement outcome` with a contract that can report accepted/limited/blocked/partial physical outcomes. Feed meaningful failure back into local replanning/cognition without teaching the LLM collision details.

### E. Keep `SpcWorldRuntime` as phase orchestrator

The World runtime should compose authorities and define deterministic phase order. It should not re-own each subsystem's mutable internals.

## 6. Capability sequence after authority refoundation

Do not automatically execute this list without re-planning each slice.

1. actor body / visual exposure semantics;
2. collision geometry and authoritative movement resolution;
3. collision-aware local navigation and blocked/recovery outcomes;
4. FOV / facing and deliberate attention geometry;
5. real World-owned interaction authority;
6. acoustic propagation / occlusion as a separate sensory model;
7. long-run multi-resident scale, churn, streaming and persistence pressure;
8. richer live LLM cognition and finally a broad multi-resident Owner gate.

The ordering is intentionally different from simply adding FOV next. Collision/navigation/interactions need a clean physical authority seam first.

## 7. Non-goals for this refactor

Do **not** turn SPC Next into a generic ECS, plugin framework, universal agent platform or abstract event-bus architecture.

Do **not** make the LLM a frame controller.

Do **not** move World truth into resident state.

Do **not** equate public debug visibility with resident knowledge.

Do **not** preserve an implementation merely because many tests now exercise it; tests defend intended semantics, not accidental class boundaries.

## 8. Current decision rule

Large changes are allowed when they improve the long-term embodied-SPC architecture, but each large change must preserve or consciously revise the defended causal contracts above.

The target remains a resident that genuinely exists in one shared world: it continuously acts through a local brain, privately perceives only what it can acquire, remembers with provenance, experiences physical success/failure, and invokes LLM cognition adaptively for higher-level judgement rather than for every movement tick.
