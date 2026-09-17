# SPC Next — perception continuity qualification

Status: **PASS within explicit scope**

Qualified branch: `refoundation/spc-next-five-resident-world`
Final qualification head: `96de0da86bd83dca226b4e4fce5b493f4900f5e8`
Final workflow: `Check` run `34918102636` — success

This is a bounded subsystem qualification, not an Owner-readiness or overall foundation declaration.

## Qualified question

When World has already determined that an actor is visually observable by one resident, can that visual contact remain causally coherent across World sensing, the resident's fast local execution, durable private memory, cognition context, contact loss and reacquisition — without per-tick percept spam, boundary chatter, hidden durable-memory writes or unbounded history growth?

**Answer at this checkpoint: yes, for the current radial visibility source.**

## What is now defended

### One resident reality across fast and semantic sensing

The local execution brain may consume current `visibleActors` frequently, but it does not silently advance durable exact actor memory. Durable contact history changes only through explicit semantic sight percepts.

World semantic sight and fast execution now use one shared visibility decision path. A resident therefore does not have one actor considered visible by the fast brain while the semantic mind independently considers that actor absent, or vice versa.

### Explicit sight lifecycle

Visual actor contact is represented as typed phenomena rather than inferred from debug strings:

- `actor_sight_enter`
- `actor_sight_update`
- `actor_sight_exit`

`ResidentMind` distinguishes current contact from historical contact:

- `currentlyVisible`
- `visibilityChangedTick`
- `lastKnownPosition`
- `lastObservedTick`

Losing sight changes current visibility but does not erase or magically advance the final exact point that was actually observed.

### Multi-rate semantic sampling

A visible moving actor does not create one durable percept per World tick. The sight continuity tracker emits a positional update after meaningful displacement or after bounded time while movement continues. A stationary actor does not receive periodic fake refreshes.

On sight loss, if the last actually observed point has not yet crossed the normal reporting threshold, that final point is emitted before the exit percept. This keeps post-contact pursuit/memory grounded in the final observation rather than the last arbitrary sampling boundary.

### No cognition storm from ordinary visible motion

Sight updates refresh private evidence but do not create LLM cognition reasons. Sight entry/exit may create bounded attention/world-change reasons. This preserves the distinction between continuous local sensing and expensive semantic reconsideration.

### Edge-of-range hysteresis

A red-team test proved that a hard `distance <= sightRadius` threshold manufactured repeated enter/exit episodes when an actor jittered by two world units around the boundary.

The repair introduces an explicit sight release margin:

- acquisition still requires the nominal resident `sightRadius`;
- an already-acquired contact may remain acquired through a small release margin;
- after contact is lost, reacquisition again requires the nominal radius;
- the same retained-contact decision is used by semantic sight and the fast brain.

The release margin is validated configuration: negative, non-finite values fail closed; zero is a legal deliberate no-hysteresis policy.

## Evidence campaign

### Integration qualification

Head `0d5fdb9cde2528a388a1f0a023992e4a20745bcb` passed a real `SpcWorldRuntime -> sight sensor -> ResidentMind -> cognition context` test covering:

- sight acquisition;
- bounded semantic position updates;
- exact final observed position before sight exit;
- `currentlyVisible` transition;
- no sight-update cognition churn;
- no fast-sensor durable-memory bypass;
- reacquisition as a new causal episode.

Workflow `34917196665`: success.

### Adversarial boundary red test

Head `3780b19e141d9ed6d7561fc08a4513a76fa231a1` deliberately failed only the new edge-jitter case while 499 other tests passed. This demonstrated real enter/exit chatter at the hard radial boundary.

Workflow `34917675289`: expected qualification failure.

Multi-actor history isolation and independence from `brainIntervalTicks` already passed in that red run.

### Repair falsification

World visibility was changed so nominal radius controls acquisition and an explicit release margin controls retention for already tracked contacts. Semantic sight and fast execution use the same gate.

A subsequent failure in the departure phase was traced to the adversarial test itself: the test unintentionally left negative velocity active during its third observation step and accumulated inward drift. The implementation was not relaxed to satisfy that failure; the experiment was corrected to stop explicitly at the returned boundary position.

The repaired experiment then passed unchanged semantic expectations.

### Long-run qualification

Final head `96de0da86bd83dca226b4e4fce5b493f4900f5e8` adds:

- 12 repeated real loss/reacquisition episodes with strict alternating `enter -> exit -> enter ...` lifecycle;
- exactly one enter/exit boundary per real episode;
- monotonic boundary ticks;
- 40 prolonged churn episodes under small `memoryLimit` and `traceLimit`;
- bounded recent percept and causal trace storage after prolonged churn;
- valid surviving actor memory after history rotation;
- poison validation for release-margin configuration.

Workflow `34918102636`: success.

## Explicit non-claims

This qualification does **not** establish that the resident has physically truthful sight.

The current source of `visibleActors` is still spatial/radial. The system does not yet prove:

- wall or terrain occlusion;
- line of sight;
- field of view / facing;
- collision geometry;
- doorway / portal visibility;
- local pathfinding around physical geometry;
- visual occurrence occlusion;
- agreement between actor sight and event sight across authored blockers.

Therefore the correct statement is:

> **Perception continuity is qualified for an already-decided visual contact. Physical visibility is not yet qualified.**

## Next campaign boundary

The next subsystem is **physical sight / perceptual geometry**.

Its first job is not pathfinding or a finished map. It is to establish one authoritative, deterministic answer to a narrower question:

> Given observer position, target position and authored sight-blocking geometry, is visual contact physically available?

Only after that answer survives adversarial geometry tests should it be connected to both persistent actor sight and visual World occurrences. Collision and navigation remain later, separately qualified layers even if they eventually share authored geometry data.
