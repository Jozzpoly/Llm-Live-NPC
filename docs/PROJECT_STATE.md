# LLM Live NPC — Project State

Updated: 2026-09-05

## Core question

Can an LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience, and acting only through validated world mechanics rather than mutating world truth directly?

Target loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

The world remains authoritative about what exists, what can be perceived, what may be attempted and what actually happened.

## Current stage

**P1 refoundation — active integration line, intentionally pre-cognition.**

- branch: `p1/playable-world-slice`
- integration PR: `#3 — P1 integration — refound world before cognition`
- latest visual stage: **R4c richer visual evidence slice**, squash `a9d176b15d522c6a81dc370cab3d5ddd1c53b7e7`
- latest domain stage: **R6a placement target validation**, squash `6183d28410512634d822f73f44ef9d84d2dccfbd`
- `main` remains the proven P0 cloud/AI baseline until P1 is cognition-ready.

## Proven foundation

P0 proved GitHub → Cloudflare deployment, Worker + Static Assets, Workers AI through AI Gateway, usage/neuron accounting, Gateway correlation and replaceable model transport. No final NPC model is selected.

P1 stack: TypeScript, Vite 8 + Cloudflare Vite plugin, Phaser 4.2.1 as presentation/camera/input shell, project-owned `World` as canonical simulation, Vitest domain/presentation tests and Cloudflare branch previews.

Durable boundary:

`browser/controller → World authority → WorldSnapshot → presentation`

Phaser is not canonical world state.

Current specimen: ~`1440 × 900`, Common Yard / Workshop / Cottage / Grove / North Path, Jozz, one NPC shell, hammer/mug/lantern, authored blockers, pickup/drop, locations, one placement site, placement target validation and a geometric LOS probe.

## Owner judgement

Worth preserving:
- runtime/preview workflow is reliable;
- initial world size is sufficient;
- movement/collision and pickup/drop are coherent enough as a substrate;
- zoom, overlays, Pointer probe and persistent Debug Workspace improved usability;
- pointer→world targeting is stable enough across camera follow/zoom;
- placement semantics/legality are world-owned rather than renderer heuristics;
- R4c materially improved readability: Common Yard/table now read more like a place/object; Jozz/NPC/items are clearer; mug/hammer/lantern are recognizable without labels.

Current visual decision:
- **R4c is enough visual work for now. Do not continue cosmetic polish merely because more is possible.**
- future major graphical change should enter through the proven presentation seam / later authored-map pipeline without contaminating `World`.

Material deficiencies:
- automatic `Q` drop still gives too little spatial agency;
- controlled placement execution and persistent item↔support relation do not exist;
- actor/holding/reach/LOS placement preconditions remain undesigned;
- current LOS is not NPC sight;
- sight needs facing/FOV/range/occlusion/temporal state;
- chat must become grounded speech stimulus before LLM conversation;
- hearing needs independent causal/debuggable propagation;
- non-LLM temporal actor execution must exist before autonomy;
- **player movement visibly steps/jumps enough to annoy the Owner. Cause is unproven.** Fixed 30 Hz simulation + render/camera synchronization is a plausible hypothesis requiring its own qualification.

## Closed refoundation stages

- **R1a action/event hygiene** — PR #4 → `882dd49713c024bd3e03853a95588c9a3b64eede`. `WorldEvent` = fact that happened; `WorldActionResult` = attempted-action outcome.
- **R2a Debug Workspace** — PR #5 → `32b9dcbccaaf8d87d2ada02c9f85a48a51ff8376`.
- **R4a presentation/art qualification** — PR #6 → `2b9ebae726eec7108b71115d62c2c74e950cee3e`. Tiled is current-best future authoring input, not runtime authority.
- **R4b presentation seam** — PR #7 → `abef7653c128def3eddc507a1d89efcc49108708`. Pure visual resolvers + explicit visual strata.
- **R3a pointer↔world targeting** — PR #8 → `c3ca2ae3cbfe23bd02299d4e4b3bb64770a35cdd` after Owner PASS.
- **R5a placement-site semantics** — PR #9 → `2f286a6117742da7c1f532cfa48741c26f69059b`.
- **R5b authored PlacementSite seam** — PR #10 → `51d19a191d89a81ed15e733bd60d1569a62caa13`.
- **R6a non-mutating placement validation** — PR #11 → `6183d28410512634d822f73f44ef9d84d2dccfbd`.
- **R4c richer visual evidence slice** — PR #12 → `a9d176b15d522c6a81dc370cab3d5ddd1c53b7e7` after automated + Owner runtime PASS. Presentation-only; proves the seam, not a final art style/schema.

## Durable architecture

### Presentation

Keep `World` independent from assets and authoring-tool specifics.

Current-best future map direction:

`Tiled authoring source → adapter/compiler → domain layout + presentation layout`

Do not start a large Tiled migration or asset system until a concrete authored-map slice justifies its schema.

### Placement

`Blocker` remains collision/vision geometry. `PlacementSite` is separate semantic placement geometry.

Proven chain:
1. reliable world target (R3a);
2. authored semantic site/relation (R5a/R5b);
3. world-owned non-mutating target legality (R6a);
4. **not yet implemented:** actor/action preconditions, execution, support persistence, event/outcome and player UI.

Do not bypass R6a legality from UI or renderer code.

### Behavior/execution

Keep distinct:
1. continuous actor control;
2. atomic validated world actions;
3. durative actor tasks/execution;
4. semantic world events;
5. self/action outcomes.

Future LLM cognition should mainly propose intents/tasks. A deterministic non-LLM executor should translate them into continuous control + validated atomic actions. Player/scripted/LLM provenance must not change legality.

## Working method

One bounded stage per work cycle/message:

`live regrounding → critical analysis/research → narrow design → implementation when justified → self-review → validation → focused Owner gate when useful → integration → grounding`

Each stage gets a short branch/PR into P1. The next stage is chosen from fresh evidence rather than numbering.

## Immediate frontier

**No next implementation stage is pre-authorized.**

Strong current candidates for the next `kontynuuj`:
- **motion-smoothness qualification/fix**, because visible player stepping is now a direct Owner-quality complaint;
- narrow **placement action/execution qualification** before cursor placement UI;
- action-outcome observability if causal debug becomes the highest-leverage need.

Do not implicitly start more art polish, large Tiled migration, cursor placement, perception or LLM cognition.

## P1 closure principle

P1 closes only when the laboratory is credible enough for embodied-agent experiments: world/action semantics are coherent; interaction gives enough agency; representation no longer dominates judgement; debug/perception is causally useful; non-LLM execution carries temporal tasks; sight/hearing are grounded and inspectable; and there is no obvious foundational reason to distrust the first cognition experiment.

This does not require a finished game, production art, multiplayer, a large world, advanced physics or a final NPC model.
