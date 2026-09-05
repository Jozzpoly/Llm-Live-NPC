# LLM Live NPC — Project State

Updated: 2026-09-06

## Core question

Can an LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world mechanics rather than directly mutating world truth?

Target loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

The `World` remains authoritative about what exists, what can be attempted and what actually happened. Future perception must also be derived from world truth rather than letting the model read arbitrary canonical state.

## Current stage

**P1 pre-cognition refoundation is closed as a substrate and prepared for fresh takeover.**

Canonical integration line:

- branch: `p1/playable-world-slice`;
- integration PR: `#3 — P1 integration — refound world before cognition`;
- `main` intentionally remains the proven P0 cloud/AI baseline;
- PR #3 remains draft: P1 is a qualified pre-cognition substrate, but perception/cognition itself has not yet been qualified.

Stable implementation checkpoints before the final docs-only handoff cleanup:

- **B2 deterministic non-LLM NPC executor** — PR #20, Owner-qualified and merged into P1 at `5985a4f4353528899801e198321cadf3daa400cd`;
- **bounded post-B2 technical-debt campaign** — PR #21, automated PASS and merged into P1 at `f25c48e65135007c8c58af730d954ec8d740bce0`.

The final handoff cleanup is documentation/workflow/repository grounding only. Fresh takeover must verify the live P1 head rather than assuming these implementation checkpoints are the final branch SHA.

## What is now proven

### P0 — cloud/model transport

P0 proved:

- GitHub → Cloudflare deployment;
- Worker + Static Assets;
- Workers AI through AI Gateway;
- usage/neuron accounting and Gateway correlation;
- a replaceable model transport seam.

Two early `@cf/zai-org/glm-4.7-flash` probes are retained as negative evidence: they exhausted bounded completion budgets on reasoning without visible content. `@cf/ibm-granite/granite-4.0-h-micro` and `@cf/meta/llama-3.2-3b-instruct` both produced usable bounded completions through the same transport seam.

**No final NPC model has been selected.**

### P1 — world/presentation substrate

Current specimen: approximately `1440 × 900`, with Common Yard / Workshop / Cottage / Grove / North Path, Jozz, NPC-001, hammer/mug/lantern, authored blockers, locations, one semantic placement site and geometric LOS inspection.

P1 proves:

- project-owned TypeScript `World` as canonical simulation truth;
- Phaser as presentation/camera/input shell rather than authority;
- fixed 30 Hz world truth with presentation interpolation between authoritative snapshots;
- deterministic blocker collision and canonical actor facing;
- contextual and explicit item/NPC interaction with causal `WorldActionResult`;
- semantic `WorldEvent` only when a world fact actually occurs;
- direct mouse/touch target selection without presentation code bypassing world legality;
- world-owned placement target validation as a non-mutating seam;
- desktop and mobile Owner-test/play surfaces sharing the same world contracts;
- persistent debug/inspection workspace with pointer, action, event and execution provenance.

### B2 — first embodied non-LLM actor task

B2 proves the lower action/execution half of the intended agent loop:

`explicit task → deterministic executor → actor control → World movement → validated atomic action → World outcome/event`

The final fresh Owner gate on the deployed browser runtime demonstrated:

1. executor started `idle`;
2. Owner triggered `Fetch lantern` once;
3. acknowledgement identified `npc.001 → item.lantern` and status became `running`;
4. progress advanced while NPC-001 visibly moved in the browser world;
5. NPC-001 reached interaction range and completed at `75/180` steps;
6. Last Action Outcome identified `actor: npc.001`, `target: item.lantern`, `succeeded · picked_up_item`;
7. the semantic event independently recorded `NPC-001 picked up Lantern`;
8. the player did not create the apparent success.

Important revision history: an earlier Owner recording was **rejected as invalid B2 evidence** because executor status remained `idle` and visible lantern manipulation belonged to `player.jozz`. That failure led to the shared `ExecutionDriver` and stronger provenance apparatus before the successful repeat gate.

B2 implementation boundaries now include:

- one canonical `ExecutionDriver` shared by browser runtime and headless evidence;
- fixed-step execution only;
- executor step budget in runtime state (`180` default);
- causal failure codes rather than silent fallback;
- player atomic actions occur before executor atomic action inside one driver frame;
- continuous player/NPC controls are finite-validated before canonical world mutation;
- `DeterministicExecutor` is explicitly an NPC executor and rejects non-NPC actors causally;
- shared movement speed is named `actorSpeed`, reflecting the multi-actor substrate.

## Owner judgement worth preserving

- Runtime/preview workflow is reliable enough for frequent hands-on gates.
- Initial world size is sufficient for the current research laboratory.
- Movement/collision and pickup/drop are coherent enough as substrate, not final gameplay.
- R4c visual treatment is enough cosmetic work for now; future art/map work should use the presentation/authoring seam rather than contaminate `World`.
- Mobile Owner testing is genuinely useful: floating movement, action buttons, portrait/landscape viewport and pinch zoom support real project work from a phone.
- Presentation interpolation was a material qualitative improvement over the earlier 30 Hz sample-and-hold stepping/teleporting.
- Explicit direct targeting is Owner-qualified on desktop and mobile; touch ergonomics do not enlarge gameplay interaction range.
- Debugging should keep answering **who did what, through which system, and why**, not merely expose raw numbers.
- The B2 correction is an important methodological precedent: visible behavior alone is not enough when provenance can distinguish player/script/NPC execution.

## Evidence boundaries / deliberately missing systems

The following are **not proven and should not be inferred from B2**:

- autonomous task selection;
- LLM cognition or long-term memory;
- NPC sight/FOV/range/temporal perception;
- hearing or grounded speech propagation;
- pathfinding/navmesh or generalized obstacle solving;
- actor-actor collision;
- generic behavior trees/task graphs;
- controlled placement execution, persistent item↔support relation or full placement UX;
- final conversation/chat UI;
- final map authoring pipeline or large Tiled migration;
- final NPC model choice.

Current geometric `hasLineOfSight()` is a world geometry utility/inspection primitive, **not NPC sight**.

The B2 approach behavior is intentionally naive direct movement. A blocker may cause it to stall until its explicit step budget fails. Do not describe this as pathfinding.

## Durable architecture

### Authority and presentation

`human/controller adapters → continuous control + atomic action requests → World authority → WorldSnapshot → presentation`

Phaser does not own canonical gameplay state.

Authoritative and visual cadence remain separate:

`30 Hz World truth → previous/current authoritative snapshots → interpolated presentation`

Inspector/debug truth comes from canonical current state even when visuals are interpolated.

### Human input and interaction

Keyboard, mouse and touch are presentation-side adapters.

Continuous movement and atomic actions remain distinct contracts:

`continuous player control → fixed-step ExecutionDriver / World`

`atomic request { actorId, action, targetId? } → World.attemptAction(...) → causal WorldActionResult → WorldEvent only when a fact occurs`

Direct targeting proves:

`mouse/touch → screen→world + presentation hit resolution → intended targetId → SAME World legality`

Presentation determines what the human pointed at. `World` determines whether the attempt is legal.

### Placement

`Blocker` remains collision/vision geometry. `PlacementSite` is separate semantic placement geometry.

Proven chain:

1. reliable world target;
2. authored semantic site/relation;
3. world-owned non-mutating placement legality.

Not yet implemented: controlled placement execution, persistent support relation, placement event/outcome and full player placement UX.

### Execution

Keep these concepts distinct:

1. continuous actor control;
2. atomic validated world actions;
3. durative actor tasks/execution;
4. semantic world events;
5. self/action outcomes;
6. future perception/cognition/intention policy.

Current execution seam:

`task { actorId, targetId } → DeterministicExecutor → ExecutionDriver → World.stepWithActorControls(...) → World.attemptAction(...) → executor result`

Future LLM cognition should primarily propose bounded intentions/tasks. It should not directly mutate positions, inventory, events or other world truth.

### Future map authoring

Current-best direction remains a hypothesis, not a committed runtime dependency:

`Tiled authoring source → adapter/compiler → domain layout + presentation layout`

Do not start a large Tiled migration until a concrete authored-map experiment justifies the schema.

## Closed P1 stages

The following stages are closed evidence and should not be mechanically repeated during takeover:

- **R1a action/event hygiene** — PR #4 → `882dd49713c024bd3e03853a95588c9a3b64eede`;
- **R2a Debug Workspace** — PR #5 → `32b9dcbccaaf8d87d2ada02c9f85a48a51ff8376`;
- **R4a presentation/art qualification** — PR #6 → `2b9ebae726eec7108b71115d62c2c74e950cee3e`;
- **R4b presentation seam** — PR #7 → `abef7653c128def3eddc507a1d89efcc49108708`;
- **R3a pointer↔world targeting** — PR #8 → `c3ca2ae3cbfe23bd02299d4e4b3bb64770a35cdd` after Owner PASS;
- **R5a placement-site semantics** — PR #9 → `2f286a6117742da7c1f532cfa48741c26f69059b`;
- **R5b authored PlacementSite seam** — PR #10 → `51d19a191d89a81ed15e733bd60d1569a62caa13`;
- **R6a placement target validation** — PR #11 → `6183d28410512634d822f73f44ef9d84d2dccfbd`;
- **R4c richer visual evidence slice** — PR #12 → `a9d176b15d522c6a81dc370cab3d5ddd1c53b7e7` after Owner PASS;
- **M1 mobile Owner controls** — PR #14 → `5e93d759769300afa63deac1323960ef313a5915` after iterative Owner testing;
- **M2 presentation interpolation** — PR #16 → `3a27365a7c2cd784b9cd1f1f135895fd4ffd65a1` after Owner A/B qualification;
- **A1 explicit atomic action seam** — PR #17 → `bfee22c2bc35b6578cfedc46e15787c4cd639ef9`;
- **A2 explicit direct mouse/touch targeting** — PR #18 → `0c47f3779f832f4821b18938f8837c0ef6071545` after Owner REVISE→PASS;
- **B1 minimal canonical actor facing** — PR #19 → `13c20f5e5f5d366a6c095af10582318e69532135`;
- **B2 deterministic non-LLM NPC executor** — PR #20 → merged P1 checkpoint `5985a4f4353528899801e198321cadf3daa400cd` after revision campaign + fresh deployed Owner PASS;
- **bounded post-B2 technical-debt campaign** — PR #21 → merged P1 checkpoint `f25c48e65135007c8c58af730d954ec8d740bce0`, automated PASS.

## Repo / workflow status

Validation workflow remains intentionally simple:

- Node 22;
- `npm ci --ignore-scripts --no-audit --no-fund`;
- `npm run check` = TypeScript + Vitest + Vite build;
- `npm run deploy:preview -- --dry-run` verifies the self-contained preview path;
- Cloudflare non-production branch builds provide deployed previews.

The final workflow review found no reason to change this contract.

Known low-risk repo-hygiene residue:

- accidental branches `tmp-do-not-use`, `tmp-do-not-use-2`, `tmp-stop` still exist;
- they contain no unique implementation and are not canonical;
- the currently available GitHub write tooling can create/move branches but does not expose branch deletion, so cleanup must not pretend they were removed.

Historical feature/evidence branches are not treated as debt merely because they still exist.

## Immediate frontier after fresh takeover

**Do not restart the closed P1 substrate campaign. Do not automatically begin implementation from the last chat recommendation.**

The next conversation should first verify live P1/PR #3 and recover this canonical state. Then it should critically design the first small post-refoundation embodied-agent experiment.

Current-best research direction is a **minimal vertical loop**, not a broad AI framework:

`WORLD → bounded NPC PERCEPTION → small agent context/state → limited LLM INTENTION → existing NON-LLM EXECUTOR → VALIDATED WORLD RESULT → experience/context update`

A likely first slice should use only a few inspectable entities/relations and a tiny intention vocabulary such as `wait`, `approach(entity)` or `fetch(item)`. This is a candidate, not a frozen design. The fresh agent should first decide what uncertainty the experiment must resolve and what evidence would falsify the idea.

Do not jump directly to unconstrained chat/personality roleplay. Speech/hearing should eventually become grounded world stimuli, and perception should be an explicit bounded projection rather than raw access to all world state.

## Working method

Use bounded research stages:

`live regrounding → identify uncertainty → narrow design/experiment → implementation when justified → self-review → automated validation → focused Owner gate → integrate → update canonical state`

Owner hands-on judgement remains first-class evidence for feel, legibility, believability and whether an experiment is worth continuing. Automated tests establish narrower implementation/invariant claims.

## Handoff rule

A fresh conversation should be able to recover the project without this chat by reading, in order:

1. `README.md`;
2. `docs/PROJECT_STATE.md`;
3. `docs/FRESH_TAKEOVER.md`;
4. live PR #3 plus any specific evidence PR linked by the takeover document.

If live repository state contradicts these docs, live branch/PR evidence wins and the contradiction must be resolved before new feature work.