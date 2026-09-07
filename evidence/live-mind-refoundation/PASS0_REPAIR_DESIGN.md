# Live NPC Refoundation Study — Pass 0 repair design

Status: **design only on evidence branch; runtime repair must start from clean E1**

This document narrows the two proven R4 closure residuals into minimal repairs. It deliberately avoids designing speech, addressedness, memory or the future Live Mind.

## Repair A — actor interaction semantic truth

### Proven defect

The old substrate currently accepts nearby `player -> npc` `interact` as `succeeded · npc_interaction_requested` while emitting no semantic event and retaining a stale P1 cognition-disabled message. The reverse `npc -> player` direction is rejected.

### Current-best closure decision

The old substrate does **not** contain a real generic actor→actor interaction mechanic. Therefore do not invent one during closure.

Repair the legality contract so actor targets are not accepted by the old generic `interact` action:

- explicit player→NPC targeting remains presentation-valid but World action legality returns `target_not_interactable`;
- NPC→player remains `target_not_interactable`;
- self-target remains `target_not_interactable`;
- contextual nearest-target interaction should not knowingly select an actor that the same World legality rejects; if no item is valid, return `no_interactable`;
- remove the stale `npc_interaction_requested` success path/code if no durable caller requires it;
- preserve direct mouse/touch entity target resolution itself: selecting an NPC is useful UI evidence and may later feed a different communication/addressing action, but selection must not fabricate a completed World semantic action.

### Guardrail

Do **not** add `actor.interacted`, `speech`, `conversation`, `address`, `focus`, social events or cognition wake behavior here. Those are new-agent semantics.

### Required regression evidence

1. nearby explicit player→NPC returns `target_not_interactable` and emits no World event;
2. nearby explicit NPC→player returns the same causal class;
3. contextual interact with only an NPC nearby does not fabricate a successful target;
4. direct targeting can still resolve/render the NPC target independently of World action legality;
5. item pickup/drop and current executor fetch remain unchanged;
6. executor targeting an actor fails through the same World legality instead of owning a contradictory path.

## Repair B — neutral execution causation and event correlation

### Proven defect

R5 request identity is causal only while a decision remains inside the E1 harness. The accepted task loses cognition origin at `executor.start()`, later frame attribution collapses to generic `executor`, and E1 associates the terminal result through local `activeTaskTargetId` state.

The original R4 exit required the lab to distinguish player, manual/script and cognition/executor causation without incidental reconstruction.

### Design principles

- provenance is diagnostic/causal metadata, never an input to World legality;
- do not put E1 class names into generic World semantics;
- keep canonical World facts independent of whether the caller was manual or LLM;
- correlate a semantic World event to the atomic action result that caused it explicitly rather than by matching tick/actor/message after the fact;
- keep the shape small enough to remain a donor for future Live Mind work, but do not pretend it is a final tracing architecture.

### Current-best minimal shape

#### 1. Executor run identity

Each accepted executor `start()` receives a small neutral cause and creates one executor-local monotonic `runId`.

Conceptual cause vocabulary for the current runtime:

- `manual`;
- `cognition` + opaque correlation identity supplied by the caller;
- optionally `unspecified` only for backward-compatible test/internal callers during migration, never for the two real browser start paths once repair closes.

The executor owns `runId`; the caller owns semantic cause.

#### 2. Runtime callers become explicit

- manual `Fetch lantern` starts the task with `manual` cause;
- E1 accepted fetch starts it with a cognition cause whose correlation identifies the existing arm/request/cycle without making the executor understand E1 semantics.

An opaque value such as `e1:s<session>:r<request>:c<cycle>` is preferable to adding E1-specific numeric fields to generic execution types at this closure stage.

#### 3. Execution frame preserves cause

When the executor produces an atomic World attempt, `ExecutionFrameResult`/the diagnostic action-attempt record preserves:

- executor `runId`;
- cause class `manual | cognition`;
- opaque cognition correlation when present.

The existing `player` source remains explicit for player-channel actions.

Debug can then distinguish player, manual and cognition causally without consulting unrelated harness state.

#### 4. Atomic result explicitly links semantic event

Add a small optional `eventSeq` (or equivalently named field) to `WorldActionResult` for successful atomic actions that emit exactly one semantic World event in the current vocabulary (`picked_up_item`, `dropped_item`).

Implementation direction:

- `World.emit(...)` returns the emitted event sequence;
- the successful action result records that exact sequence;
- rejected attempts and non-event outcomes have no event sequence.

This keeps World legality independent of execution cause while making `action result -> canonical semantic event` explicit.

Do not add event sourcing, a global correlation registry or E1 request fields to `WorldEvent`.

#### 5. E1 experience preserves execution lineage

When E1 observes its terminal executor outcome, its bounded `E1Experience` should retain enough lineage to point back to:

- executor `runId`;
- cognition correlation identity;
- action result/event sequence when one exists.

The experience remains factual feedback from execution; the model does not author these IDs.

This removes reliance on target identity alone as the causal join.

### Why not attach cognition provenance directly to World legality

`World.validateInteraction()` must answer whether an actor can interact with a target based on canonical state. A request being manual or LLM-originated must not change that answer. Keeping cause at execution/diagnostic layers plus an explicit result→event link preserves this separation.

### Required regression evidence

1. identical manual and cognition-origin tasks remain mechanically identical but produce distinguishable execution provenance;
2. provenance cannot alter `validateInteraction()` result;
3. repeated executor runs get distinct run IDs even when actor/target are identical;
4. a cognition fetch can be followed request/cycle → executor run → atomic result → `item.picked_up` event seq → E1 experience;
5. a manual fetch never acquires cognition correlation merely because E1 state exists nearby;
6. rejected World attempts have no fabricated event correlation;
7. player attempt history remains explicitly player-sourced;
8. returned provenance/read models are isolated enough that debug callers cannot mutate executor/World canonical state.

## Repair order

1. Repair A first: it is smaller and removes a false World semantic success without depending on provenance.
2. Merge/validate A into E1.
3. Start Repair B from the new clean E1 head.
4. After B merges, perform the final bounded R8 re-attack against the combined repaired substrate.

Do not merge this evidence branch or its characterization tests into E1 wholesale.
