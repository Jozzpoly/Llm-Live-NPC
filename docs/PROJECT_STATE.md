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
- `main` remains the proven P0 cloud/AI baseline until P1 is genuinely cognition-ready.

Owner testing showed that the current world is mechanically useful but still too diagram-like, interaction-poor and perception-naive to justify serious cognition work. Refoundation therefore proceeds one bounded stage at a time.

## Proven foundations worth preserving

### P0 — cloud/AI transport — CLOSED / PASS

Proved GitHub → Cloudflare deployment, Worker + Static Assets, Workers AI through AI Gateway, usage/neuron accounting, Gateway log correlation, replaceable model transport and normalization of multiple model response shapes.

Owner-qualified transport examples:

- Granite 4.0 H Micro: 1637 ms, 0.17467461 neurons, usable completion PASS;
- Llama 3.2 3B Instruct: 162 ms, 0.7781149744987488 neurons, usable completion PASS.

Negative evidence retained: GLM-4.7-Flash exhausted bounded 96- and 256-token probes on reasoning without visible content. No final NPC model is selected.

### P1 world/presentation foundation

Current bounded stack:

- TypeScript;
- Vite 8 + official Cloudflare Vite plugin;
- Phaser 4.2.1 as browser presentation/camera/input shell;
- project-owned `World` as canonical simulation state;
- Vitest pure domain tests;
- Cloudflare branch previews.

Durable boundary:

`browser/controller → world authority → WorldSnapshot → presentation`

Phaser is not canonical world state.

Current specimen is roughly `1440 × 900` with Common Yard, Workshop, Cottage, Grove and North Path; Jozz; one static NPC shell; hammer, mug and lantern; blockers/doorways/table/trees; 30 Hz fixed simulation; world-owned movement/collision; pickup/drop; location events; and a deterministic geometric LOS probe.

No Box2D/Arcade Physics is currently justified. Physics remains a later qualification only if it buys meaningful player ↔ NPC ↔ world interaction.

## Owner judgement / remaining deficiencies

Worth preserving:

- browser runtime and preview workflow are reliable;
- initial world size is sufficient;
- movement/authored collision and pickup/drop are coherent;
- geometric LOS reacts to blockers;
- zoom, optional overlays and the persistent Debug Workspace improved usability;
- presentation remains replaceable.

Material deficiencies:

- the world still reads mainly as a technical diagram;
- visual representation needs a fundamental professional lift and future art-readiness;
- automatic drop gives too little spatial agency and cannot intentionally place objects on surfaces;
- world richness is too low for meaningful free-play;
- current LOS is only a geometric probe, not NPC sight;
- sight needs real actor facing, FOV, range, occlusion and temporal perception state;
- chat must become a grounded speech stimulus before LLM conversation;
- hearing must be independently causal/debuggable;
- non-LLM temporal actor execution must exist before autonomy;
- project quality must continue to be actively guarded rather than treating incremental improvement as cognition-readiness.

The project remains intentionally **pre-cognition**.

## Closed refoundation microstages

### R1a — action/event hygiene — CLOSED / PASS

PR #4 merged into P1 as `882dd49713c024bd3e03853a95588c9a3b64eede`.

Durable boundary:

- `WorldEvent` = fact that actually happened in the simulated world;
- `WorldActionResult` = result of an attempted action, including rejection.

Rejected/empty `E/Q` no longer pollute semantic history. Successful pickup/drop still emit semantic world events and action outcomes. Automated and Owner runtime gates passed.

### R2a — persistent Debug Workspace shell — CLOSED / PASS

PR #5 merged into P1 as `32b9dcbccaaf8d87d2ada02c9f85a48a51ff8376` after automated and Owner runtime PASS.

Established persistent DOM debug UI, bounded metric updates, in-panel `Labels`/`LOS probe` controls synchronized with keyboard shortcuts and a collapsible workspace. No speculative future subsystem tabs/framework were introduced.

Owner judgement: materially better and worth preserving, but still only an early laboratory foundation.

### R4a — presentation / art-readiness qualification — CLOSED / PASS

Research/design stage. No runtime/art rewrite was performed.

Current-best decisions:

1. **Keep presentation non-canonical.** `World` must not acquire texture keys, frame names, render-layer IDs, lighting parameters or other art concerns.
2. **Do not author static spatial layout twice.** The current hard-coded domain geometry plus separately hand-drawn presentation is acceptable only as the first specimen, not as the long-term map pipeline.
3. **Tiled JSON is the current-best map authoring input**, because it supports tile layers, freely placed object layers, custom classes/properties/templates and has direct Phaser tilemap support. Tiled is authoring data, not runtime world authority.
4. A future **map-authoring adapter/compiler seam** should read one authored map and derive at least two products:
   - domain/static layout for `World` (blockers, locations, semantic surfaces/spawns as appropriate);
   - presentation layout for Phaser (ground/scenery/decorative layers and visual references).
   Runtime dynamic truth remains in `World`.
5. **Dynamic entity visuals should resolve from semantic identity/archetype to a presentation descriptor/catalog**, rather than growing `switch(entity.kind)` rendering or putting asset IDs directly into domain entities. The exact archetype field is intentionally deferred until concrete visual/interaction examples justify it.
6. Prefer explicit visual strata: **ground → static scenery → y-sorted actors/items → overhead/canopy/roof → effects → debug**. Phaser Layers/depth are sufficient for this; avoid deep Container hierarchies without a concrete need.
7. Animation state is presentation-derived when cosmetic. If exact animation timing ever causes gameplay/world events, that timing must be owned by simulation rather than presentation.
8. Start future visual work with simple browser assets/spritesheets as needed; texture atlases are supported and may become useful, but no general asset manager/atlas pipeline is justified yet.
9. Lighting, particles/post-FX and other polish remain later presentation capabilities. Their existence should not contaminate domain semantics.
10. Coopege is a donor of lessons, not a subsystem transplant. Its separate asset resolver/validation demonstrates the value of stable asset identity and validation, but reproducing that machinery now would be premature.

R4a does **not** select an art style, tile size, final asset toolchain, final map schema, or production graphics target.

## Architecture conclusions currently considered durable

Do not collapse all behavior into one universal action system. Keep distinct:

1. continuous actor control;
2. atomic validated world actions;
3. durative actor tasks/execution;
4. semantic world events;
5. self/action outcomes.

Future LLM cognition should operate mainly at the intent/task level. A deterministic non-LLM executor should translate tasks into continuous control and validated atomic actions. Player/scripted/LLM provenance must not change world legality.

Affordances should eventually describe what an object/place offers and under what conditions while execution remains separate. The universal command-envelope idea remains deferred until placement, authored interactions and executor evidence expose action shapes worth generalizing.

## Working method

One bounded stage per work cycle/message:

`live regrounding → critical analysis/research → narrow design → implementation when justified → self-review → automated validation → focused Owner gate when useful → integration → grounding`

`p1/playable-world-slice` is the integration line. Each bounded problem gets a short branch/PR into P1. The next stage is chosen from fresh evidence rather than stage numbering.

## Current-best dependency map

Directional only:

- **R2b candidate:** world-event vs action-outcome observability, if this becomes the largest apparatus weakness;
- **R3:** camera + reliable screen↔world pointer/targeting contract;
- **R4b+:** staged implementation of the newly qualified presentation seam and first materially better visual slice;
- **R5:** authored interactions/support surfaces and concrete affordance evidence;
- **R6:** controlled object placement;
- **R7:** non-LLM actor orientation/execution/task lifecycle;
- **R8:** sight research + implementation;
- **R9:** grounded speech stimulus + hearing;
- **R10:** unified perception inspector / cognition observation seam;
- **R11:** cognition-readiness gate.

Memory/long-term belief systems remain intentionally undesigned until real cognition evidence requires them.

## Immediate frontier

**No next implementation stage is pre-authorized.**

R4a only qualifies the presentation direction. At the next `kontynuuj`, reground and choose one bounded next problem. Strong candidates now include:

- a first R4b implementation seam that separates presentation structure from `WorldScene` without producing art;
- R3 pointer/world targeting if placement/inspection has become the higher-leverage dependency;
- R2b action-outcome observability if debug causality is blocking judgement.

Do not begin a large visual rewrite, Tiled migration, asset system or LLM work implicitly.

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
