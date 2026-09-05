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
- current integrated head after R2a: `32b9dcbccaaf8d87d2ada02c9f85a48a51ff8376`
- `main` remains the proven P0 cloud/AI baseline until P1 is genuinely cognition-ready.

The project is intentionally not rushing from a minimal playable map to an LLM NPC. Owner testing showed that the world, interaction semantics, debug apparatus, visual representation, actor execution and perception need staged refoundation first.

## P0 — CLOSED / PASS

P0 proved:

- GitHub → Cloudflare deployment;
- Worker + Static Assets;
- Workers AI through AI Gateway;
- Gateway log correlation and usage/neuron accounting;
- replaceable model transport;
- normalization of multiple native model response shapes.

Owner-qualified transport examples:

- Granite 4.0 H Micro: 1637 ms, 0.17467461 neurons, usable completion PASS;
- Llama 3.2 3B Instruct: 162 ms, 0.7781149744987488 neurons, usable completion PASS.

Negative evidence retained: GLM-4.7-Flash exhausted bounded 96- and 256-token probes on reasoning without visible content. This falsified it as a sensible trivial transport probe, not as a model in general.

No final NPC model is selected.

## P1 foundation worth preserving

Current bounded stack:

- TypeScript;
- Vite 8 + official Cloudflare Vite plugin;
- Phaser 4.2.1 for presentation, camera and browser input;
- project-owned `World` as canonical simulation state;
- Vitest pure domain tests;
- Cloudflare branch previews.

Durable presentation boundary:

`browser/controller → world authority → WorldSnapshot → presentation`

Phaser is not canonical world state.

Current specimen is roughly `1440 × 900` with Common Yard, Workshop, Cottage, Grove and North Path; Jozz; one static NPC shell; hammer, mug and lantern; blockers/doorways/table/trees; 30 Hz fixed simulation; world-owned movement/collision; pickup/drop; location events; and a deterministic geometric LOS probe.

No Box2D/Arcade Physics is currently justified. Physics remains a later qualification only if it buys meaningful player ↔ NPC ↔ world interaction.

## Owner evidence / project judgement

What is currently worth preserving:

- public browser runtime and preview workflow are reliable;
- initial world size is sufficient; future space can grow outward around the village;
- movement and authored collision are coherent;
- pickup/drop mutate canonical world state;
- geometric LOS responds to blockers/doorways;
- zoom and optional overlays improve usability;
- presentation remains replaceable;
- the new persistent Debug Workspace is a real improvement over the previous text-dump inspector.

What remains materially inadequate:

- the world still reads mainly as a technical diagram rather than a convincing place;
- visual representation needs a fundamental professional lift and future art-readiness;
- automatic drop gives too little spatial agency and cannot intentionally place objects on surfaces;
- the world is too sparse/primitive for meaningful free-play or destructive experimentation;
- current LOS is only a geometric probe, not NPC sight;
- future sight requires actor facing/orientation, FOV, range, occlusion and temporal acquired/lost/last-seen state;
- chat must become a grounded speech stimulus before it becomes LLM conversation;
- hearing must be independently causal/debuggable;
- non-LLM temporal actor execution must exist before autonomy;
- the project requires continued strict quality control: recent improvements are directional evidence, not a signal to rush cognition.

The project therefore remains intentionally **pre-cognition**.

## Closed refoundation microstages

### R1a — action/event hygiene — CLOSED / PASS

PR #4, merged into P1 as `882dd49713c024bd3e03853a95588c9a3b64eede`.

Durable boundary:

- `WorldEvent` = fact that actually happened in the simulated world;
- `WorldActionResult` = result of an attempted action, including rejection.

Rejected/empty `E` and `Q` no longer pollute semantic world history. Successful pickup/drop still emit real world events and action outcomes. Automated tests and Owner runtime gate passed.

Future implication: a proposed, rejected or failed LLM/NPC intent must never masquerade as something that actually happened.

### R2a — persistent Debug Workspace shell — CLOSED / PASS

PR #5, merged into P1 as `32b9dcbccaaf8d87d2ada02c9f85a48a51ff8376` after automated and Owner runtime PASS.

R2a established:

- persistent DOM workspace built once instead of replacing the whole panel with `innerHTML` per update;
- bounded ~10 Hz metric DOM updates;
- semantic event list rebuild only when event identity changes;
- normal in-panel `Labels` and `LOS probe` controls;
- `L` / `V` retained as secondary shortcuts synchronized with the same scene state;
- collapsible side workspace so the world can regain visual area;
- no speculative Perception/Cognition tabs and no new UI framework.

Owner runtime evidence:

- buttons and shortcuts remain synchronized;
- collapse/expand works;
- movement, zoom, pickup/drop and LOS remain functional;
- workspace feels incrementally more like a laboratory surface, but the whole project still needs substantial lifting and careful stewardship.

Merged P1 head validation:

- GitHub CI PASS;
- Cloudflare Workers Build PASS;
- Cloudflare Version ID `182db2c7-f9ae-46bf-91b0-001be235a5fc`.

## Refoundation working method

One bounded stage per work cycle/message:

`live regrounding → critical analysis/research → narrow design → implementation → self-review → automated validation → focused Owner gate when useful → integration → grounding`

Rules:

1. `p1/playable-world-slice` is the integration line;
2. each bounded problem gets a short branch/PR into P1;
3. each stage is redesigned from current evidence instead of mechanically executing an old roadmap;
4. do not start the next stage before the current one is closed or explicitly revised;
5. Owner attention is used where qualitative/runtime judgement matters, not as a substitute for automation;
6. rigor exists to improve decisions, not to create process as the product.

## Architecture conclusions currently considered durable

Do **not** collapse all behavior into one universal action system.

Keep distinct:

1. **continuous actor control** — movement axes now; later facing/steering;
2. **atomic world actions** — discrete validated mutations such as pick/place/speak once real semantics exist;
3. **durative actor tasks/execution** — `move_to`, `inspect`, `pick_then_place`, etc., with temporal lifecycle;
4. **semantic world events** — facts that actually happened;
5. **self/action outcomes** — accepted/rejected/completed/failed information for the acting controller without pretending to be global world history.

Future LLM cognition should operate mainly at the intent/task level. A deterministic non-LLM executor should translate tasks into continuous control and validated atomic actions.

Player input, scripted NPC control and future LLM control should converge on the same world legality. Request provenance belongs to tracing/debugging, not special permissions.

Affordances should eventually describe what an object/place offers and under what conditions while execution remains separate. Do not derive a universal affordance framework from the current nearest-item `E` heuristic.

The previously considered universal command-envelope R1b remains deferred until placement, real authored interactions and executor evidence expose the action shapes worth generalizing.

## Current-best refoundation dependency map

This is directional, not a frozen checklist.

### R2 — debug workspace / observability

- R2a persistent shell: **CLOSED / PASS**.
- R2b candidate: clearer world-event vs action-outcome observability. Must be freshly justified before implementation; do not assume it is automatically next.
- future categories/tabs only when real subsystems exist.

### R3 — camera + pointer/world contract

Establish reliable screen↔world targeting/inspection across camera/zoom before deliberate placement or richer point inspection.

### R4 — presentation / art-readiness qualification

Research first. Establish the smallest useful boundaries for render layers, map authoring, visual descriptors/assets, sprites/tiles/animation/lighting and richer representation while keeping presentation non-canonical.

This stage must prepare the project for a major future graphical lift without building a speculative universal graphics framework.

### R5 — authored interaction semantics / affordance evidence

Introduce concrete interactables, support surfaces and semantic geometry independent from appearance. Derive affordance/query contracts from these examples.

### R6 — controlled object placement

Targeted placement with preview, reach/occlusion/collision validation and a meaningful support surface such as the table.

### R7 — non-LLM actor execution substrate

Before true sight/perception, establish actor orientation/facing and the smallest deterministic executor needed for high-level temporal tasks.

Likely evidence targets include `move_to`, atomic action execution, task completion/failure/interruption and scripted behavior between sparse high-level decisions.

### R8 — sight

Research/design first, then facing/FOV/range/occlusion/temporal acquired-lost-last-seen plus causal visualization.

### R9 — speech stimulus + hearing

Ground speech in world position/intensity/range; hearing decides causally what was heard.

### R10 — unified perception inspector / cognition observation seam

Expose what the NPC perceives, what changed, and why; define the bounded observation contract cognition will consume.

### R11 — cognition-readiness gate

Only then decide whether the first meaningful:

`WORLD → PERCEPTION → LLM → INTENT → EXECUTOR → VALIDATED WORLD ACTIONS → WORLD`

experiment is justified.

Memory/long-term beliefs remain intentionally undesigned until real cognition evidence requires them.

## Immediate frontier

**No next implementation stage is pre-authorized.**

R2a is closed. At the next `kontynuuj`, first reground on this state and decide which single next bounded problem has the highest leverage.

Candidates include:

- R2b observability if action-outcome visibility is now the largest apparatus weakness;
- R3 pointer/world targeting if future placement/inspection is the more important dependency;
- an R4 presentation/art-readiness research stage if the technical-diagram representation is now materially limiting Owner judgement.

The choice must be made from current evidence, not stage numbering.

## P1 closure principle

P1 closes only when the laboratory is a credible substrate for embodied-agent experiments:

- world truth and action semantics are coherent;
- interaction gives enough agency to create meaningful situations;
- representation is readable enough that Owner judgement is not dominated by prototype crudity;
- debug/perception apparatus is first-class and causally useful;
- a non-LLM actor executor can carry high-level tasks over time;
- sight/hearing observation contracts are grounded and inspectable;
- there is no obvious foundational reason to distrust the first cognition experiment.

This does not require a finished game, production art, multiplayer, a large world, advanced physics or a final NPC model.

## Non-blocking foundation debt

- generated Wrangler binding/runtime types are not yet canonicalized;
- public AI qualification endpoint still has a lightweight rate limiter rather than hard auth/global budget enforcement;
- Cloudflare Access state is not canonicalized;
- current Cloudflare build token is named after another project and should later become project-specific if scope/provenance warrants cleanup;
- no persistence/database/multiplayer exists;
- no final model selection exists.

Do not let these debts expand the active microstage without evidence that they matter.