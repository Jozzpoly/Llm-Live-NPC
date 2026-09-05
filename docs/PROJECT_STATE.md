# LLM Live NPC — Project State

Updated: 2026-09-05

## Core research question

Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

Durable boundary:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → VALIDATED EXECUTION → WORLD`

The LLM may eventually propose intent. The world remains authoritative about what exists, what an actor can perceive, whether an action is legal/possible, and what actually happened.

## Current stage

**P1 refoundation — active integration line, deliberately before LLM cognition.**

Integration branch:

`p1/playable-world-slice`

Integration PR:

`#3 — P1 integration — refound world before cognition`

`main` remains the proven P0 cloud/AI transport baseline. P1 is intentionally not merged to `main` yet.

The project is no longer trying to rush from a minimal playable world directly into LLM behavior. Owner hands-on evidence showed that the world, interaction contracts, debug surface, representation, perception and non-LLM execution substrate need a substantial but staged refoundation first.

## P0 — CLOSED / PASS

Canonical P0 production main:

`f207419ee87c03979544d2d579e624f043300bbc`

P0 proved:

- GitHub → Cloudflare deployment works;
- Worker + Static Assets work;
- Workers AI is reachable through AI Gateway;
- Gateway log IDs and model usage/neuron accounting are observable;
- at least two free Cloudflare-hosted models return usable completions through a replaceable transport seam;
- different native response shapes can be normalized without changing world/cognition contracts.

Important negative evidence retained: GLM-4.7-Flash exhausted both 96-token and 256-token bounded probes on reasoning without visible content. This falsified it as a sensible trivial transport probe, not as a model in general.

Owner-qualified transport examples:

- Granite 4.0 H Micro: 1637 ms, 0.17467461 neurons, usable completion PASS;
- Llama 3.2 3B Instruct: 162 ms, 0.7781149744987488 neurons, usable completion PASS.

No final NPC model has been selected.

## P1 foundation that is worth keeping

Current bounded stack:

- TypeScript;
- Vite 8 + official Cloudflare Vite plugin;
- Phaser 4.2.1 for presentation, camera and browser input;
- project-owned `World` domain as canonical state;
- Vitest for pure domain tests;
- Cloudflare non-production preview builds.

The durable client boundary is:

`browser input → action/command seam → World → WorldSnapshot → Phaser presentation`

Phaser is not canonical world state. This remains one of the strongest P1 decisions and is intentionally preserved through the refoundation.

Current world specimen is approximately `1440 × 900` with Common Yard, Workshop, Cottage, Grove and North Path; player Jozz; one static NPC shell; a hammer, mug and lantern; blockers/doorways/table/trees; fixed-step 30 Hz simulation; world-owned movement/collision; pickup/drop; location events; and a deterministic geometric LOS probe.

No Box2D/Arcade Physics is currently required. Physics remains an open later qualification, to be introduced only if it buys meaningful player ↔ NPC ↔ world interaction.

## Owner evidence from first P1 hands-on sessions

### What works well enough to preserve

- the browser world runs reliably on a real Cloudflare preview;
- world size is sufficient for the initial laboratory; future expansion can grow outward around the village rather than replacing it;
- movement and authored collision behave consistently;
- pickup/drop alter canonical world state and semantic event history;
- geometry-derived LOS reacts to occluders/doorways;
- World Inspector exposes useful live state;
- presentation remains replaceable because it consumes snapshots;
- mouse-wheel zoom and the ability to hide visual debug/labels improved usability.

### What remains materially inadequate

- the world still reads primarily as a technical diagram rather than a convincing place;
- presentation/debug needs a large professional lifting before serious embodied-agent experimentation;
- debug controls should live mainly in a compact in-app workspace/buttons/tabs, not rely on keyboard shortcuts;
- automatic item drop gives the Owner almost no spatial agency and cannot intentionally place an object on the table;
- there is not enough manipulable/world richness yet for meaningful free-play/destructive experimentation;
- current NPC line/radius is only a 360-degree LOS probe and must not be treated as a sight system;
- future sight requires deliberate research/design around facing, FOV, range, occlusion and temporal acquired/lost/last-seen state;
- chat should become a grounded world speech stimulus with location and voice intensity/range before it becomes an LLM conversation system;
- hearing needs its own causal/debuggable model rather than being inferred from chat proximity;
- behavior between high-level LLM decisions needs a non-LLM execution substrate before autonomy is attempted.

The project therefore remains intentionally **pre-cognition**.

## P1.1 representation/camera iteration — QUALITATIVE IMPROVEMENT, NOT CLOSURE

P1.1 added only presentation-side changes:

- bounded mouse-wheel camera zoom;
- separate visual debug and label visibility controls;
- reduced always-on label clutter;
- clearer naming of the existing system as an LOS probe rather than NPC sight.

Owner judgement: **better, but still far below the desired professional/experimental quality bar.** This iteration validated the direction of making debug optional and layered, but did not solve the wider representation problem.

## R1a action/event hygiene — CLOSED / PASS

Micro-PR:

`#4 — R1a — separate action outcomes from world events`

Merged into P1 as:

`882dd49713c024bd3e03853a95588c9a3b64eede`

R1a introduced a critical semantic boundary:

- `WorldEvent` = a fact that actually happened in the simulated world;
- `WorldActionResult` = the result of an attempted action, including rejection.

Rejected/empty `E` and `Q` attempts no longer pollute semantic world history. Successful pickup/drop still emit semantic world events and also return action outcomes. NPC interaction request is currently an action result, not fabricated world history.

Automated evidence includes:

- empty `E` repeated 20× leaves semantic event history unchanged;
- empty `Q` leaves semantic event history unchanged;
- pickup through an occluder is rejected without inventing a world event;
- successful pickup/drop still create correct world events + action outcomes;
- determinism includes the action result channel.

Owner runtime gate confirmed all intended R1a behavior. R1a is closed.

This boundary is considered important for future LLM integration: a proposed/failed intent must never masquerade as something that actually happened.

## Refoundation working method

The previous tendency to combine camera, placement, sight, hearing, chat and debug into one large revision was explicitly rejected.

From now on:

1. `p1/playable-world-slice` is the P1 integration line;
2. each bounded refoundation problem gets a short branch + PR targeting P1;
3. every microstage starts with fresh design/research appropriate to that problem;
4. implementation scope stays narrow;
5. automated evidence is followed by a focused Owner/runtime gate when useful;
6. only qualified work is integrated into P1;
7. the next microstage is redesigned after reviewing the newest evidence rather than mechanically following an old plan.

The goal is not process for its own sake. The goal is to spend more reasoning on each foundational contract while keeping blast radius and Owner attention small.

## Current-best refoundation map — directional, not a frozen roadmap

The following sequence expresses current dependencies and priorities. Later stages may split, move or disappear after new evidence.

### R1 — action / interaction foundation

- **R1a — action outcomes vs world events: CLOSED / PASS.**
- R1b candidate — explicit actor command/action envelope rather than letting raw key-edge booleans become the semantic action interface.
- R1c candidate — affordance/context query: what can this actor meaningfully attempt here, and why?

### R2 — debug workspace shell

Compact in-app debug controls/tabs/buttons; world remains primary visual surface; overlays independently controllable.

### R3 — camera + pointer/world inspection contract

Refine zoom/focus and establish reliable screen↔world pointer conversion for later inspection and placement. Presentation/input only.

### R4 — presentation architecture / art-readiness qualification

Research before implementation. Establish the smallest useful boundary for map authoring, tiles/sprites/animation/lighting and richer visual representation without contaminating world truth. Avoid a speculative graphics framework.

### R5 — authored interaction semantics

Explicit interactables/affordances/support surfaces and semantic geometry independent from appearance.

### R6 — controlled object placement

Targeted placement with visual preview, reach/occlusion/collision validation, and first real support surface such as the table.

### R7/R8 — sight research/design then bounded implementation

Facing/orientation, FOV, range, occlusion, temporal state and visual debugging. Current LOS probe is only donor evidence and must not automatically become the sight architecture.

### R9/R10 — speech stimulus then hearing

Text/voice-mode input becomes a grounded world event/stimulus with source position/intensity/range. Hearing remains independently testable and explainable.

### R11 — unified perception inspector

Expose what the NPC currently perceives, what was gained/lost, and why; define the exact observation seam cognition will consume.

### R12 — non-LLM NPC execution substrate

Exercise high-level intents deterministically/scripted before LLM autonomy: move, face, inspect, pick, place, wait, speak; action queues, interruption/completion and outcome feedback; behavior between sparse high-level decisions.

### R13 — cognition-readiness gate

Only then decide whether the project is mature enough for the first meaningful:

`WORLD → PERCEPTION → LLM → INTENT → VALIDATED EXECUTION → WORLD`

experiment.

## Immediate frontier

**Do not implement R1b yet.**

The next work is a planning/design pass that must reconsider R1b and R1c in the context of the whole refoundation:

- what is the smallest durable action contract shared by player input, scripted NPC execution and future LLM intents?
- which layer owns action identity, actor, target/position, parameters and request correlation?
- what belongs in an action request, validation result, execution state, semantic world event and transient UI feedback?
- do we need an explicit command envelope now, or would that be premature abstraction before authored affordances/placement exist?
- should R1b and R1c remain separate, merge, or be reordered with the debug/pointer work?
- what minimum action/execution semantics are required to avoid redesign when non-LLM NPC control arrives later?

The next implementation decision must come from this analysis, not from the current candidate labels.

## P1 closure principle

P1 is not a checklist of the original minimal prototype anymore. It closes only when the laboratory is a credible substrate for embodied-agent experiments:

- world truth and action semantics are coherent;
- interaction gives sufficient agency to create meaningful situations;
- representation is readable enough that Owner judgement is not dominated by prototype crudity;
- debug/perception apparatus is first-class and causally useful;
- sight/hearing observation contracts are grounded and inspectable;
- a non-LLM execution layer can carry high-level intents over time;
- there is no obvious foundational reason to distrust the first cognition experiment.

This does **not** require a finished game, production art, multiplayer, a large world, advanced physics or a final NPC model.

## Non-blocking foundation debt

- generated Wrangler binding/runtime types are not yet canonicalized;
- public AI qualification endpoint still has a lightweight rate limiter rather than hard auth/global budget enforcement;
- Cloudflare Access state is not canonicalized;
- current Cloudflare build token is named after another project and should later become project-specific if scope/provenance warrants cleanup;
- no persistence/database/multiplayer exists;
- no final model selection exists.

Do not allow these debts to expand the active microstage without direct evidence that they matter.