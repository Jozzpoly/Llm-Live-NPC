# LLM Live NPC — Project State

Updated: 2026-09-05

## Core research question

Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

Durable boundary:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → VALIDATED EXECUTION → WORLD`

The LLM may eventually propose intent. The world remains authoritative about what exists, what an actor can perceive, whether an action is legal/possible, and what actually happened.

## Current stage

**P1 refoundation — active integration line, deliberately before LLM cognition.**

Integration branch: `p1/playable-world-slice`

Integration PR: `#3 — P1 integration — refound world before cognition`

`main` remains the proven P0 cloud/AI transport baseline. P1 is intentionally not merged to `main` yet.

The project is no longer trying to rush from a minimal playable world directly into LLM behavior. Owner hands-on evidence showed that the world, interaction contracts, debug surface, visual representation, perception and non-LLM execution substrate need a substantial but staged refoundation first.

## P0 — CLOSED / PASS

Canonical P0 production main:

`f207419ee87c03979544d2d579e624f043300bbc`

P0 proved GitHub → Cloudflare deployment, Worker + Static Assets, Workers AI through AI Gateway, usage/neuron accounting, Gateway log correlation, replaceable model transport, and normalization of multiple native model response shapes.

Important negative evidence retained: GLM-4.7-Flash exhausted both 96-token and 256-token bounded probes on reasoning without visible content. This falsified it as a sensible trivial transport probe, not as a model in general.

Owner-qualified transport examples:

- Granite 4.0 H Micro: 1637 ms, 0.17467461 neurons, usable completion PASS;
- Llama 3.2 3B Instruct: 162 ms, 0.7781149744987488 neurons, usable completion PASS.

No final NPC model has been selected.

## P1 foundation worth preserving

Current bounded stack:

- TypeScript;
- Vite 8 + official Cloudflare Vite plugin;
- Phaser 4.2.1 for presentation, camera and browser input;
- project-owned `World` domain as canonical state;
- Vitest for pure domain tests;
- Cloudflare non-production preview builds.

Durable client boundary:

`browser input/control → world authority → WorldSnapshot → Phaser presentation`

Phaser is not canonical world state. This remains one of the strongest P1 decisions.

Current world specimen is approximately `1440 × 900` with Common Yard, Workshop, Cottage, Grove and North Path; player Jozz; one static NPC shell; a hammer, mug and lantern; blockers/doorways/table/trees; fixed-step 30 Hz simulation; world-owned movement/collision; pickup/drop; location events; and a deterministic geometric LOS probe.

No Box2D/Arcade Physics is currently required. Physics remains an open later qualification, to be introduced only if it buys meaningful player ↔ NPC ↔ world interaction.

## Owner evidence from first P1 hands-on sessions

### Worth preserving

- browser world runs reliably on real Cloudflare previews;
- world size is sufficient for the first laboratory; later expansion can grow outward around the village;
- movement/authored collision behave consistently;
- pickup/drop alter canonical world state and semantic event history;
- geometric LOS reacts to occluders/doorways;
- World Inspector exposes useful live state;
- presentation is replaceable because it consumes snapshots;
- mouse-wheel zoom and optional debug/labels improved usability.

### Material deficiencies

- world still reads primarily as a technical diagram rather than a convincing place;
- presentation/debug need a large professional lifting before serious embodied-agent experimentation;
- debug controls belong mainly in a compact in-app workspace/buttons/tabs, not keyboard shortcuts;
- automatic item drop gives almost no spatial agency and cannot intentionally place an object on the table;
- manipulable/world richness is too low for meaningful free-play/destructive experimentation;
- current NPC line/radius is only a 360-degree LOS probe and must not be treated as sight;
- future sight needs facing, FOV, range, occlusion and temporal acquired/lost/last-seen state;
- chat should become a grounded world speech stimulus with location and voice intensity/range before it becomes an LLM conversation system;
- hearing needs an independently causal/debuggable model;
- behavior between sparse high-level LLM decisions needs a non-LLM execution substrate before autonomy.

The project therefore remains intentionally **pre-cognition**.

## P1.1 representation/camera iteration — QUALITATIVE IMPROVEMENT, NOT CLOSURE

P1.1 added bounded mouse-wheel zoom, optional visual debug/labels, reduced label clutter and clearer naming of the current system as an LOS probe.

Owner judgement: **better, but still far below the desired professional/experimental quality bar.** It validated layered/optional debug, not the wider presentation quality.

## R1a action/event hygiene — CLOSED / PASS

Micro-PR: `#4 — R1a — separate action outcomes from world events`

Merged into P1 as:

`882dd49713c024bd3e03853a95588c9a3b64eede`

R1a established:

- `WorldEvent` = a fact that actually happened in the simulated world;
- `WorldActionResult` = the result of an attempted action, including rejection.

Rejected/empty `E` and `Q` attempts no longer pollute semantic history. Successful pickup/drop still emit semantic world events and action outcomes. Owner runtime gate confirmed the intended behavior.

This boundary is considered durable for future LLM work: a proposed or failed intent must never masquerade as something that actually happened.

## Refoundation working method

The earlier tendency to combine camera, placement, sight, hearing, chat and debug into one revision was explicitly rejected.

From now on:

1. `p1/playable-world-slice` is the P1 integration line;
2. each bounded problem gets a short branch + PR targeting P1;
3. each microstage begins with fresh design/research appropriate to that problem;
4. implementation scope stays narrow;
5. automated evidence is followed by a focused Owner/runtime gate when useful;
6. only qualified work is integrated into P1;
7. the next microstage is redesigned after reviewing the newest evidence rather than mechanically following an old roadmap.

The goal is not process for its own sake. It is to spend more reasoning on each foundational contract while keeping blast radius and Owner attention small.

## Architecture conclusions from the post-R1a design review

The next architecture must **not** collapse all behavior into one universal action system.

Current-best distinction:

1. **continuous actor control** — e.g. movement axes now, later possibly facing/steering;
2. **atomic world actions** — discrete validated mutations such as pick/place/speak once their real semantics exist;
3. **durative actor tasks/execution** — e.g. `move_to`, `inspect`, `pick_then_place`, which can be in-progress/interrupted/completed and are executed over time;
4. **semantic world events** — facts that actually happened;
5. **self/action outcomes** — accepted/rejected/completed/failed information available to the acting controller/NPC without pretending it is a global world event.

Future LLM cognition should operate primarily at the **intent/task level**, not raw motor control and not direct world mutation. A deterministic/non-LLM executor should translate tasks into continuous control and atomic world actions.

Player input, scripted NPC control and future LLM control should ultimately converge on the same world rules, but the provenance of a request should not change whether the world considers it legal. Controller/source information belongs to tracing/debugging, not special world permissions.

Affordances should eventually describe **what interactions an object/place offers and under what conditions**, while execution logic stays with the interactor/executor. Do not encode a universal affordance framework from the current nearest-item `E` heuristic.

### Critical consequence

**The previously proposed R1b universal command envelope is deferred.**

We do not yet know the real action shapes worth generalizing. Targeted placement, authored support surfaces and a non-LLM executor will provide much better evidence. Continuing R1 abstraction now would risk designing around the prototype rather than the intended system.

## Revised current-best refoundation order

This is a dependency map, not a frozen checklist. Each item may split or move after evidence.

### R2 — debug workspace refoundation — NEXT

Owner feedback directly supports this and it improves every later experiment without changing world semantics.

Current client currently reconstructs the entire Inspector `innerHTML` on frequent debug updates. The next design should establish a persistent DOM-based laboratory workspace rather than adding more transient markup or Phaser UI.

Candidate microstages:

- **R2a — persistent Debug Workspace shell:** persistent DOM structure, compact controls/buttons, no whole-panel reconstruction per frame; V/L remain optional secondary shortcuts;
- **R2b — world/action observability:** clearly separate semantic world events from latest/recent action outcomes;
- later debug categories/tabs are added only when real subsystems exist rather than as empty placeholders.

Natural R2a gate: same world behavior, but Owner can toggle labels/LOS from a small stable UI and the inspector behaves like a laboratory surface rather than a constantly rewritten text dump.

### R3 — camera + pointer/world inspection contract

Refine zoom/focus and establish reliable screen↔world pointer conversion. This is required before deliberate object targeting/placement and later point inspection.

### R4 — presentation/art-readiness qualification

Research before implementation. Split later as needed. Establish only the smallest useful boundaries for render layers, map authoring, visual descriptors/assets, sprites/tiles/animation/lighting and richer representation while keeping all art/presentation non-canonical.

This is where the project should become fundamentally ready for a large future graphical lift. Do not prebuild a speculative universal graphics framework.

### R5 — authored interaction semantics + affordance evidence

Introduce explicit interactables, support surfaces and semantic geometry independent from appearance. Only here should a real affordance/query contract be designed from concrete examples.

### R6 — controlled object placement

Targeted placement with preview, reach/occlusion/collision validation and a first meaningful support surface such as the table.

### R7 — non-LLM actor execution substrate

This moves **earlier** than sight/perception compared with the previous map.

Reason: NPC facing/orientation and temporal behavior should arise from a real actor/executor model rather than being invented only to support a vision cone.

Likely later microstages include:

- actor orientation/facing;
- bounded locomotion/navigation task such as `move_to`;
- atomic action execution against the same world rules as the player;
- task lifecycle: requested/active/completed/failed/cancelled/interrupted;
- small queue/interruption semantics;
- scripted scenarios proving behavior between high-level decisions without an LLM.

Do not copy a heavyweight ability/behavior framework; derive the smallest executor from our actual actions.

### R8 — sight research/design + implementation

Use actual actor facing/orientation, then design FOV, range, occlusion, temporal acquired/lost/last-seen state and visual debugging. Current LOS probe is donor evidence only.

### R9 — speech stimulus + hearing

Text/voice-mode input becomes a grounded world stimulus with source position/intensity/range. Hearing remains independently testable and causally explainable.

### R10 — unified perception inspector / cognition observation seam

Expose what the NPC currently perceives, what changed, and why; define the exact bounded observation contract cognition will consume.

### R11 — cognition-readiness gate

Only then decide whether the first meaningful:

`WORLD → PERCEPTION → LLM → INTENT → EXECUTOR → VALIDATED WORLD ACTIONS → WORLD`

experiment is justified.

Memory/long-term belief systems are not being designed prematurely; the first cognition experiment may deliberately start with a very small working context and add memory only when evidence demands it.

## Immediate frontier

**R2a planning/design, not implementation yet.**

Questions to resolve before opening the R2a branch:

- which controls belong permanently in the laboratory shell versus temporary shortcuts?
- should the Debug Workspace live as a side panel, collapsible drawer, or compact overlay while preserving maximum world area?
- what minimal DOM structure can persist across updates without introducing React or another framework?
- which debug state values truly need high-frequency updates and which should update only on change/event?
- how should control commands reach the Phaser scene without coupling the DOM panel to world truth?
- how do we make the UI visually scalable for later World / Actions / Perception / Cognition categories without creating empty speculative tabs now?
- what evidence will distinguish a genuine apparatus improvement from cosmetic rearrangement?

Only after answering these should R2a implementation begin.

## P1 closure principle

P1 closes only when the laboratory is a credible substrate for embodied-agent experiments:

- world truth and action semantics are coherent;
- interaction gives enough agency to create meaningful situations;
- representation is readable enough that Owner judgement is not dominated by prototype crudity;
- debug/perception apparatus is first-class and causally useful;
- a non-LLM actor executor can carry high-level tasks over time;
- sight/hearing observation contracts are grounded and inspectable;
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