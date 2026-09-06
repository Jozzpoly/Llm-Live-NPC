# E1 — Grounded Notice → Fetch

Status: **bounded experiment qualified by automated, live-model and Owner evidence**

Base: `p1/playable-world-slice` at `e453f5862286328df92db91ba2f9adabc1e7899e`

Runtime-clean checkpoint before documentation-only closure work: `15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

## Research question

Can NPC-001 react to a player-caused world change only after that change enters a bounded local perception, receive an explicit temporal perceptual delta describing what it actually observed changing, choose a tiny LLM intention, execute it through the existing deterministic executor and validated World actions, and then carry the real execution outcome into a subsequent cognition cycle?

For E1 the answer is **yes, within the exact bounded scenario below**. This does not qualify a general sight system, memory architecture, navigation system, conversation system or open-ended autonomy.

## Qualified scenario

`player carries item into NPC-local range while held → arm E1 to establish temporal baseline → player drops item → bounded perception derives holder player→free → Granite proposes fetch(item) → existing executor approaches/interacts → World records pickup → next cognition cycle receives real picked_up_item experience + NPC-held state → Granite proposes wait`

The deployed Owner re-gate reproduced this chain successfully with the Lantern.

## Perception boundary

One observer: `npc.001`.

One local geometric modality:

- range: `220 px`;
- canonical entity positions originate from `WorldSnapshot`;
- existing `World.hasLineOfSight(...)` is used only as an occlusion primitive;
- no raw blocker list, complete entity list, absolute map state or global event log is exposed to cognition;
- cognition receives relative distance/direction plus directly perceived ownership relations;
- `fetchableItemIds` contains only visible free items while NPC-001 is empty-handed.

Geometric LOS in E1 is **not** a qualified sight model.

## Temporal perceptual continuity

`observedChanges` is derived from consecutive bounded perceptions and can represent:

- item entered local perception;
- item left local perception;
- visible item holder changed;
- observer held item changed;
- observer location changed.

The important Owner stimulus is the explicit relation:

`item.lantern: holder player.jozz → free`

This is not long-term memory. It is only enough temporal continuity for the model to know what bounded perceptual fact changed.

### Wake semantics after Owner repair

The original implementation woke cognition on visible item entry/exit and `heldBy` churn. Owner testing falsified that cadence because a still-held item moving around the `220 px` boundary could waste `wait` cycles before the intended drop.

The qualified wake surface is therefore narrower:

- observer location;
- observer held-item state;
- **visible fetchable item IDs**;
- new E1 executor experience.

Pure actor motion and non-fetchable held-item boundary churn do **not** call the model. They still refresh the silent local perception baseline, so a later drop preserves the true `holder player → free` delta instead of fabricating `item entered perception`.

Cooldown remains `750 ms`; hard budget remains `3` cognition cycles per arm session; only one request may be in flight; cognition never interrupts a running executor task.

## Intention and authority contract

The only model intentions are:

- `wait`;
- `fetch(targetId)` where `targetId` must be in the current request's fetchable allow-list.

`fetch` maps to the already-qualified non-LLM executor task:

`approach-and-interact(npc.001, targetId)`.

Required causal chain:

`World truth → bounded perception → temporal delta → cognition request → model tool decision → validation → DeterministicExecutor → ExecutionDriver → World.attemptAction → WorldActionResult / WorldEvent → E1 experience → subsequent cognition`

The model cannot mutate position, inventory, events or executor internals.

The browser validates a fetch decision first against the request perception and again against fresh current perception immediately before executor start. The executor itself now refuses silent replacement of a running task; E1 also checks that `start(...)` was accepted before claiming `accepted_fetch`.

## Worker / Granite contract recovered live

Endpoint:

`POST /api/agent/e1/decide`

The Worker reconstructs a sanitized payload from allowed fields and discards unknown extras. A forged fetch allow-list must be backed by visible free item records.

Pinned experimental model:

`@cf/ibm-granite/granite-4.0-h-micro`

Live probes established two integration facts that were not safe to infer from older examples:

1. Workers AI accepted the OpenAI-style function wrapper (`type: "function"` with nested `function`) while the legacy flat tool shape failed with `8001: Invalid input`;
2. observed Granite completions placed tool calls under `choices[0].message.tool_calls[*].function` and, in the qualified run, double-encoded `function.arguments` as JSON.

The parser therefore permits at most two bounded JSON decodes and still validates the resulting object against the exact allow-list. A standards-shaped single-encoded result remains accepted as a bounded compatibility case.

## Evidence

### Automated

Before the Owner re-gate, the repaired E1 branch passed the full repository validation suite. The subsequent technical-debt campaign added regression coverage for executor start refusal while keeping the same E1 authority boundary.

Covered E1 properties include:

- out-of-range and occluded entities excluded;
- no absolute-position/blocker/global-snapshot leakage;
- held→free temporal delta;
- non-fetchable held-item boundary churn does not wake cognition but updates baseline;
- forged or stale targets rejected;
- Worker payload sanitization and tool allow-list enforcement;
- live-proven Granite nested/double-encoded tool response handling;
- fake cognition provider driving perception → executor → real World pickup → next-cycle experience;
- first-executor-step completion;
- executor refuses replacement of an in-flight task.

### Real model seam

A real two-cycle Granite probe passed before Owner testing:

- cycle 1: `item.mug holder player.jozz → free` → `fetch(item.mug)`; Gateway log `01M1SZ3H6M4MSYEG3X2GFFFWDP`;
- cycle 2: prior `picked_up_item` + NPC holding mug → `wait`; Gateway log `01M1SZ3KB5VXG5K5W2T9SWZXBC`.

### Owner evidence

The first Owner recording was a **partial pass** and exposed two apparatus defects:

- held-item boundary churn consumed unnecessary cognition cycles;
- the original `3 requests / 60 s` Worker limiter could block the required post-pickup cycle during repeated hands-on attempts.

Repairs narrowed wake semantics and raised the development limiter to `6 requests / 60 s`.

The Owner re-gate then passed the complete embodied loop. Final debug provenance showed:

- drop-derived holder change and legal fetch;
- NPC-001 picking up Lantern through the existing executor/World path;
- cycle `#2 · 2/3` triggered by `perception_and_experience_changed`;
- `self held none → item.lantern`;
- `item.lantern: holder free → npc.001`;
- prior experience `succeeded · picked_up_item`;
- real Granite/Gateway provenance;
- final decision `wait`.

This closes E1 at its intended natural boundary.

## Post-Owner technical-debt closure

Owner review of the deployed laboratory exposed unrelated shell/provenance debt that automated domain tests had not caught. Before moving to another research stage the branch was deliberately held for cleanup:

- desktop page/debug scroll coupling and an oversized blank game region were removed by constraining the shell to the viewport and making Debug Workspace its own scroll container;
- narrow/collapsed and mobile portrait scroll contracts were made explicit;
- stale `cognition disabled` UI provenance was replaced by live `E1 cognition armed/disarmed` state;
- `/api/health` now reports the E1 live stage rather than stale P0 stage provenance;
- `DeterministicExecutor.start()` refuses silent running-task replacement;
- manual B2 trigger UI is disabled while the executor is running and reports executor state rather than inventing an `accepted` acknowledgement.

These are quality repairs, not extensions of E1's research claim.

## Evidence boundary / non-claims

E1 qualifies only:

- one NPC;
- one bounded local geometric perception projection;
- one small temporal delta mechanism;
- `wait | fetch` intentions;
- one player-caused held→free stimulus;
- one real LLM intention decision;
- action through the existing deterministic executor and World legality;
- one subsequent cognition cycle carrying the real execution experience.

It does **not** qualify pathfinding, speech/hearing, personality, long-term memory, multi-NPC coordination, generic planning, semantic vision, autonomous goals, map migration or a final NPC architecture.

A future stage should begin from the evidence and limitations above rather than repeating E1.
