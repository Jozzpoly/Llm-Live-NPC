# LLM Live NPC — Project State

Updated: 2026-09-05

## Core research question

Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

Durable intended loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

The world remains authoritative about what exists, what an actor can perceive, what can be attempted, and what actually happened.

## Current stage

**P1 refoundation — active integration line, deliberately before LLM cognition.**

- integration branch: `p1/playable-world-slice`
- integration PR: `#3 — P1 integration — refound world before cognition`
- latest integrated runtime stage: **R3a pointer/world targeting**, squash `c3ca2ae3cbfe23bd02299d4e4b3bb64770a35cdd`
- current bounded qualification branch: `refoundation/r5a-placement-site-qualification`
- `main` remains the proven P0 cloud/AI baseline until P1 is genuinely cognition-ready.

Owner testing shows that the current world is mechanically useful but still too diagram-like, interaction-poor and perception-naive to justify serious cognition work. Refoundation proceeds one bounded stage per work cycle.

## Proven foundations worth preserving

### P0 — cloud/AI transport — CLOSED / PASS

Proved GitHub → Cloudflare deployment, Worker + Static Assets, Workers AI through AI Gateway, usage/neuron accounting, Gateway correlation, replaceable model transport and normalization of multiple model response shapes.

Owner-qualified examples:

- Granite 4.0 H Micro: 1637 ms, 0.17467461 neurons, usable completion PASS;
- Llama 3.2 3B Instruct: 162 ms, 0.7781149744987488 neurons, usable completion PASS.

Negative evidence retained: GLM-4.7-Flash exhausted bounded 96- and 256-token probes on reasoning without visible content. No final NPC model is selected.

### P1 world/presentation foundation

Current stack:

- TypeScript;
- Vite 8 + official Cloudflare Vite plugin;
- Phaser 4.2.1 as browser presentation/camera/input shell;
- project-owned `World` as canonical simulation state;
- Vitest pure domain + presentation-contract tests;
- Cloudflare branch previews.

Durable boundary:

`browser/controller → world authority → WorldSnapshot → presentation`

Phaser is not canonical world state.

Current specimen is roughly `1440 × 900` with Common Yard, Workshop, Cottage, Grove and North Path; Jozz; one static NPC shell; hammer, mug and lantern; blockers/doorways/table/trees; 30 Hz fixed simulation; world-owned movement/collision; pickup/drop; location events; and a deterministic geometric LOS probe.

No Box2D/Arcade Physics is currently justified. Physics remains a later qualification only if it buys meaningful player ↔ NPC ↔ world interaction.

## Owner judgement / material deficiencies

Worth preserving:

- browser runtime and preview workflow are reliable;
- initial world size is sufficient;
- movement/authored collision and pickup/drop are coherent;
- geometric LOS reacts to blockers;
- zoom, optional overlays and persistent Debug Workspace improved usability;
- presentation is replaceable and has a minimal explicit seam;
- pointer→world mapping survives camera follow/zoom well enough for future targeted interaction work.

Still inadequate:

- the world reads mainly as a technical diagram;
- visual representation needs a major professional lift;
- automatic drop gives too little spatial agency and cannot intentionally place objects on surfaces;
- world richness is too low for meaningful free-play;
- current LOS is only a geometric probe, not NPC sight;
- sight needs real actor facing, FOV, range, occlusion and temporal perception state;
- chat must become a grounded speech stimulus before LLM conversation;
- hearing must be independently causal/debuggable;
- non-LLM temporal actor execution must exist before autonomy;
- incremental improvement must not be mistaken for cognition-readiness.

The project remains intentionally **pre-cognition**.

## Closed refoundation microstages

### R1a — action/event hygiene — CLOSED / PASS

PR #4 merged into P1 as `882dd49713c024bd3e03853a95588c9a3b64eede` after automated + Owner runtime PASS.

Durable boundary:

- `WorldEvent` = fact that actually happened in the simulated world;
- `WorldActionResult` = result of an attempted action, including rejection.

Rejected/empty `E/Q` no longer pollute semantic history. Successful pickup/drop still emit real world events and action outcomes.

### R2a — persistent Debug Workspace shell — CLOSED / PASS

PR #5 merged into P1 as `32b9dcbccaaf8d87d2ada02c9f85a48a51ff8376` after automated + Owner runtime PASS.

Established persistent/collapsible DOM debug UI, bounded metric updates and in-panel `Labels` / `LOS probe` controls synchronized with shortcuts. No speculative future subsystem tabs/framework were introduced.

### R4a — presentation / art-readiness qualification — CLOSED / PASS

PR #6 merged into P1 as `2b9ebae726eec7108b71115d62c2c74e950cee3e`. Research/design only; no runtime delta.

Qualified presentation as non-canonical, Tiled JSON as current-best future authoring input rather than runtime authority, one authored source → separate domain/presentation products, explicit visual strata, and no premature general asset system.

### R4b — minimal presentation seam — CLOSED / PASS

PR #7 merged into P1 as `abef7653c128def3eddc507a1d89efcc49108708` after automated validation + Cloudflare preview PASS.

Established pure presentation resolvers for current entity/blocker/location fallback visuals, explicit depth strata, separate ground/scenery graphics and pure Node presentation-contract tests. No `src/world` changes, asset IDs, archetype schema, Tiled adapter or visual rewrite were introduced.

### R3a — pointer ↔ world targeting contract — CLOSED / PASS

PR #8 merged into P1 as `c3ca2ae3cbfe23bd02299d4e4b3bb64770a35cdd` after automated validation + focused Owner runtime PASS.

Established explicit active-camera `screen → world` conversion, pointer validity/outside-canvas invalidation, world-bounds classification and an optional Pointer probe. Owner recording materially supports stable target/crosshair behavior across camera follow and zoom. This is targeting infrastructure only; no click action, placement or world mutation was introduced.

## R5a — placement-site semantics qualification — ACTIVE / DESIGN CANDIDATE

Purpose: determine what a placement target means before adding cursor-driven placement.

Current-best qualified shape:

1. **Do not turn `Blocker` into a generic interactable.** Collision/vision geometry and semantic interaction offers are separate concerns.
2. Introduce a narrow authored concept tentatively called **`PlacementSite`**: a semantically named region that can support a placement relation, without containing execution logic.
3. Preserve the spatial relation as world meaning. The first required relation is **`on`** (for the yard table). Do not add `in` until a real container exists, but keep the model extensible so `on table` and `in box` are not collapsed into coordinates alone.
4. **Ground remains an implicit fallback** for ordinary floor placement rather than one giant authored site.
5. A successful future placement must persist both spatial position and semantic support relation/site identity. Coordinates alone are insufficient for future perception, memory and language (`mug on table`).
6. `PlacementSite` describes an offered spatial relation and validation context; it does **not** execute pickup/place behavior. Execution remains world/executor-owned.
7. Do not introduce generic `Affordance[]`, capability-tag taxonomies, reservation/claim systems or a universal interaction API in R5a.
8. The current table may temporarily have separate blocker and placement-site records. The future Tiled adapter may derive both from one authored object/class, avoiding long-term hand duplication.
9. Do not design placement reach, occupancy, collision resolution, pointer preview or action codes in this qualification. Those belong to later bounded stages using concrete evidence.

Research precedent used only as guidance, not as a subsystem donor:

- Unreal Smart Objects separate authored interaction/slot information from execution performed by the interactor;
- AI2-THOR demonstrates the value of explicit pickupable/receptacle semantics and persistent object↔receptacle relations, but its broad receptacle abstraction should not force our future `on`/`in` semantics to collapse.

R5a has **no runtime implementation delta** yet. The qualification must pass review/CI before integration; subsequent implementation of an authored-site seam is a separate stage.

## Architecture conclusions currently considered durable

### World / presentation

Keep `World` independent from rendering assets and authoring-tool specifics. Presentation may change radically without changing canonical truth.

Future authored-map direction:

`Tiled authoring source → adapter/compiler → domain layout + presentation layout`

Do not implement the full pipeline until a concrete visual/map slice justifies its first real schema.

### Behavior / execution

Do not collapse all behavior into one universal action system. Keep distinct:

1. continuous actor control;
2. atomic validated world actions;
3. durative actor tasks/execution;
4. semantic world events;
5. self/action outcomes.

Future LLM cognition should operate mainly at the intent/task level. A deterministic non-LLM executor should translate tasks into continuous control and validated atomic actions. Player/scripted/LLM provenance must not change world legality.

Affordances/interaction offers should describe what a place/object offers and under what conditions while execution remains separate. Do not generalize beyond concrete evidence. R5a specifically narrows placement to a semantic site/relation rather than a universal affordance framework.

## Working method

One bounded stage per work cycle/message:

`live regrounding → critical analysis/research → narrow design → implementation when justified → self-review → automated validation → focused Owner gate when useful → integration → grounding`

`p1/playable-world-slice` is the integration line. Each bounded problem gets a short branch/PR into P1. The next stage is chosen from fresh evidence rather than stage numbering.

## Current-best dependency map

Directional only:

- **R2b candidate:** world-event vs action-outcome observability, if this becomes the largest apparatus weakness;
- **R4c+:** first materially better visual slice / first concrete authored-map or visual-descriptor evidence;
- **R5a:** placement-site semantics qualification — active candidate on its own branch;
- **R5b candidate:** smallest authored `PlacementSite` domain seam, only if R5a closes;
- **R6:** controlled placement/validation, dependent on R3a targeting and concrete authored-site evidence;
- **R7:** non-LLM actor orientation/execution/task lifecycle;
- **R8:** sight research + implementation;
- **R9:** grounded speech stimulus + hearing;
- **R10:** unified perception inspector / cognition observation seam;
- **R11:** cognition-readiness gate.

Memory/long-term beliefs remain intentionally undesigned until real cognition evidence requires them.

## Immediate frontier

**R5a qualification only. No placement implementation is authorized by this document.**

Gate R5a by checking that the proposed placement-site semantics are minimal, coherent with current `World`, preserve world authority and avoid premature generic interaction architecture. If accepted and integrated, return to fresh evidence before authorizing R5b or any other next stage.

Do not begin a large Tiled migration, asset system, map rewrite, cursor placement, perception or LLM work implicitly.

## P1 closure principle

P1 closes only when the laboratory is a credible substrate for embodied-agent experiments: world/action semantics are coherent; interaction gives enough agency; representation is readable enough that prototype crudity no longer dominates judgement; debug/perception is causally useful; a non-LLM executor carries temporal tasks; sight/hearing contracts are grounded and inspectable; and there is no obvious foundational reason to distrust the first cognition experiment.

This does not require a finished game, production art, multiplayer, a large world, advanced physics or a final NPC model.

## Non-blocking foundation debt

- generated Wrangler binding/runtime types are not canonicalized;
- public AI qualification endpoint has lightweight rate limiting rather than hard auth/global budget enforcement;
- Cloudflare Access state is not canonicalized;
- current Cloudflare build token name comes from another project and should later become project-specific if warranted;
- no persistence/database/multiplayer exists;
- no final model selection exists.

Do not let these debts expand the active microstage without evidence that they matter.
