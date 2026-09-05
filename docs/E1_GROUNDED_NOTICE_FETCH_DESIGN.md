# E1 — Grounded Notice → Fetch

Status: active bounded experiment design

Base: `p1/playable-world-slice` at `e453f5862286328df92db91ba2f9adabc1e7899e`

## Research question

Can NPC-001 react to a player-caused world change only after that change enters a bounded local perception, choose a tiny LLM intention, execute it through the existing deterministic executor and validated World actions, and then carry the real execution outcome into a subsequent cognition cycle?

The focused Owner scenario is deliberately small:

`player carries item into NPC-local range while it is held → arm E1 to capture that state as baseline → player drops item → held→free change wakes cognition → LLM proposes fetch(item) → existing executor approaches/interacts → World records pickup → next cognition cycle receives the real outcome and new self state`

This is not a sight-system qualification, memory architecture, navigation experiment or conversation system.

## Experiment boundary

One NPC: `npc.001`.

One perception modality: local 360° geometric neighborhood with:

- range: `220 px`;
- canonical entity positions from `WorldSnapshot`;
- existing `World.hasLineOfSight(...)` used only as an occlusion primitive;
- no raw blocker list, complete entity list, absolute map state or global event log exposed to cognition.

One intention vocabulary:

- `wait`;
- `fetch(targetId)` where `targetId` must be one of the currently perceived free item IDs.

`fetch` maps directly to the already-qualified executor task:

`approach-and-interact(npc.001, targetId)`.

No new approach task, generic planner or behavior tree is introduced.

## Perception payload

The cognition input may contain only:

- observer identity, label, current location and held item;
- entities within range and geometric LOS;
- relative distance/direction, not absolute world position;
- actor/item ownership relations that are directly represented by perceived entities;
- an explicit `fetchableItemIds` allow-list of currently visible free items;
- NPC-001's own most recent E1 execution experience, if one exists.

The full bounded perception may contain a visible actor, but the **wake fingerprint is intentionally narrower**. It ignores tick and continuous actor distance/direction changes and reacts to:

- NPC-001 location/held-item state;
- locally perceived item entry/exit;
- locally perceived item `heldBy` changes;
- new E1 executor experience.

This is an experiment-specific anti-burst policy, not a final attention architecture.

## Trigger / cadence contract

E1 is manually armed from the laboratory debug workspace.

Arming captures the current perception fingerprint as baseline and does not immediately call the model. This makes the primary Owner gate causal: carry the item into local range while it is still held, arm, then drop it.

While armed:

- perception may be recomputed cheaply after fixed World steps;
- at most one model request may be in flight;
- cognition does not interrupt a running executor task;
- a call is eligible when semantic perception changes or new E1 executor experience appears;
- cooldown: `750 ms`;
- hard decision budget: `3` model cycles per arm session;
- the existing Worker rate limiter independently bounds server-side requests.

This intentionally avoids periodic free-running "thinking".

## Cognition contract

The browser sends only the bounded perception plus previous E1 self experience to the same-origin Worker endpoint:

`POST /api/agent/e1/decide`

E1 pins `@cf/ibm-granite/granite-4.0-h-micro` only as an experimental constant. It is not a final NPC model decision.

The Worker uses **traditional Workers AI function calling**, not an agent framework and not direct game tools. The available tool set is generated from the request:

- `wait` is always available;
- `fetch` is exposed only when `fetchableItemIds` is non-empty;
- `fetch.targetId` is constrained to the exact request allow-list.

Accepted client-side decision shape remains:

```text
{ kind: "wait" }
{ kind: "fetch", targetId: <currently fetchable item id> }
```

The browser validates the response twice:

1. against the exact perception that caused the model request;
2. again against fresh current perception immediately before executor start.

A hallucinated, non-visible, no-longer-free or otherwise stale target cannot reach the executor.

## Authority / provenance

Required causal chain:

`World truth → bounded perception → cognition request → model tool decision → decision validation → existing DeterministicExecutor → ExecutionDriver → World.attemptAction → WorldActionResult / WorldEvent → E1 experience → subsequent cognition`

The model cannot directly mutate position, inventory, events or executor internals.

The debug workspace must expose enough state to distinguish:

- E1 armed/disarmed;
- cognition request/cycle status and trigger;
- perceived/fetchable entity IDs;
- accepted/rejected/stale decision;
- selected model, Gateway log ID and latency when available;
- executor target/progress through the existing B2 apparatus;
- resulting World action outcome;
- last E1 experience carried forward.

## Evidence plan

Automated evidence should establish:

1. out-of-range entities are absent from perception;
2. LOS-occluded entities are absent;
3. perception contains no blocker/global snapshot or absolute-position leakage;
4. the wake fingerprint ignores pure actor distance drift but changes on item visibility/ownership and self-state changes;
5. `fetch` is accepted only for a currently perceived free item;
6. invalid/hallucinated targets are rejected before executor start;
7. the Worker exposes `fetch` only for allow-listed IDs and rejects an invalid model tool call;
8. a deterministic fake cognition provider can drive the full perception→decision→existing-executor→World pickup path;
9. an executor task that succeeds on its very first step still produces E1 experience;
10. the real executor outcome becomes the next cognition cycle's previous experience and changed self state.

Focused deployed Owner gate:

- carry one item into NPC-local perception while still holding it;
- arm E1 and confirm the item is perceived but not fetchable;
- drop it;
- observe the held→free cognition trigger and provenance;
- confirm NPC approaches/picks it up through the existing executor/World path;
- confirm the subsequent cognition state contains `picked_up_item`, NPC-held item state and no repeated legal fetch.

Negative control: keep an item out of range or geometrically occluded and verify it never becomes a legal cognition target.

## Falsification / revision criteria

Revise or fail E1 if any of these occur:

- cognition receives hidden/global world truth;
- model output can bypass intention validation, executor or World legality;
- provenance cannot distinguish the LLM-triggered action from player/script behavior;
- the model regularly fails the tiny structured tool contract;
- request cadence can burst from ordinary actor movement;
- the post-action cognition cycle does not receive the real prior outcome;
- stale target state can start an executor task;
- the technically correct loop provides no materially different Owner experience from a scripted trigger.

The last case is valid research-negative evidence, not an implementation failure.

## Natural stop boundary

Stop E1 after one NPC, one local perception projection, `wait|fetch`, one player-caused observable held→free change, one real LLM decision, one existing executor task, one validated World outcome and one subsequent cognition cycle containing that experience.

Explicitly defer pathfinding, speech/hearing, personality, long-term memory, multiple NPCs, generic tasks, map migration and additional visual polish.
