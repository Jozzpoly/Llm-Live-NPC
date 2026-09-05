# LLM Live NPC — Project State

Updated: 2026-09-05

## Core question

Can an LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience, and acting only through validated world mechanics rather than mutating world truth directly?

Target loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

The world remains authoritative about what exists, what can be perceived, what may be attempted and what actually happened.

## Current stage

**P1 refoundation — closure campaign before fresh-conversation takeover, intentionally pre-cognition.**

- branch: `p1/playable-world-slice`
- integration PR: `#3 — P1 integration — refound world before cognition`
- latest closed interaction stage: **A2 explicit direct mouse/touch targeting**, PR #18 → `0c47f3779f832f4821b18938f8837c0ef6071545`
- latest domain stage: **A1 explicit atomic action seam**, PR #17 → `bfee22c2bc35b6578cfedc46e15787c4cd639ef9`
- latest Owner-qualified usability stages: **M1 mobile Owner controls** + **M2 presentation interpolation**
- latest visual stage: **R4c richer visual evidence slice**
- `main` remains the proven P0 cloud/AI baseline until P1 is cognition-ready.

## Proven foundation

P0 proved GitHub → Cloudflare deployment, Worker + Static Assets, Workers AI through AI Gateway, usage/neuron accounting, Gateway correlation and replaceable model transport. No final NPC model is selected.

P1 stack: TypeScript, Vite 8 + Cloudflare Vite plugin, Phaser 4.2.1 as presentation/camera/input shell, project-owned `World` as canonical simulation, Vitest domain/presentation tests and Cloudflare branch previews.

Durable boundary:

`human/controller adapters → continuous control + atomic action requests → World authority → WorldSnapshot → presentation`

Phaser is not canonical world state.

Current specimen: ~`1440 × 900`, Common Yard / Workshop / Cottage / Grove / North Path, Jozz, NPC-001, hammer/mug/lantern, authored blockers, contextual pickup/drop, explicit target interaction, locations, one placement site, placement target validation and a geometric LOS probe.

## Owner judgement

Worth preserving:
- runtime/preview workflow is reliable;
- initial world size is sufficient;
- movement/collision and pickup/drop are coherent enough as a substrate;
- zoom, overlays, Pointer probe and persistent Debug Workspace improved usability;
- pointer→world targeting is stable enough across camera follow/zoom;
- placement semantics/legality are world-owned rather than renderer heuristics;
- R4c materially improved readability without contaminating `World`;
- **mobile Owner testing is genuinely useful**: floating movement control, action buttons, portrait/landscape play viewport and pinch zoom support regular project work from a phone;
- **presentation interpolation is a major qualitative improvement**: the previous stepping/teleporting was materially caused by sample-and-hold display of 30 Hz world positions. Interpolated presentation is strongly preferred by the Owner without a meaningful feel penalty in the current specimen;
- **explicit direct targeting is now Owner-qualified on both mobile and desktop**: the player can point at a concrete item/NPC while `World` still owns range/LOS/state legality. The Owner-confirmed mug regression in the joystick capture region was fixed by gesture arbitration rather than by enlarging gameplay range;
- mobile/desktop shell selection now distinguishes touch-first devices from touch-capable desktops, and the portrait mobile viewport uses materially more of the available screen.

Current visual decision:
- **R4c is enough cosmetic work for now.** Future major graphical change should enter through the proven presentation seam / later authored-map pipeline without contaminating `World`.

Mobile decision:
- mobile is a supported **Owner-test/play surface**, not a separate game fork;
- touch and keyboard are adapters into the same human-control/action path;
- direct tap and floating joystick coexist through bounded gesture arbitration; pinch remains distinct;
- future text/chat/LLM interaction should reuse this shell rather than require a separate mobile architecture, but no final conversation UI is designed yet.

Material deficiencies:
- automatic `Q` drop still gives too little spatial agency;
- controlled placement execution and persistent item↔support relation do not exist;
- actor orientation/facing does not yet exist;
- deterministic non-LLM temporal actor execution does not exist;
- current LOS is not NPC sight;
- sight needs facing/FOV/range/occlusion/temporal state;
- chat must become grounded speech stimulus before LLM conversation;
- hearing needs independent causal/debuggable propagation.

## Closed refoundation / usability stages

- **R1a action/event hygiene** — PR #4 → `882dd49713c024bd3e03853a95588c9a3b64eede`. `WorldEvent` = fact that happened; `WorldActionResult` = attempted-action outcome.
- **R2a Debug Workspace** — PR #5 → `32b9dcbccaaf8d87d2ada02c9f85a48a51ff8376`.
- **R4a presentation/art qualification** — PR #6 → `2b9ebae726eec7108b71115d62c2c74e950cee3e`. Tiled is current-best future authoring input, not runtime authority.
- **R4b presentation seam** — PR #7 → `abef7653c128def3eddc507a1d89efcc49108708`. Pure visual resolvers + explicit visual strata.
- **R3a pointer↔world targeting** — PR #8 → `c3ca2ae3cbfe23bd02299d4e4b3bb64770a35cdd` after Owner PASS.
- **R5a placement-site semantics** — PR #9 → `2f286a6117742da7c1f532cfa48741c26f69059b`.
- **R5b authored PlacementSite seam** — PR #10 → `51d19a191d89a81ed15e733bd60d1569a62caa13`.
- **R6a non-mutating placement validation** — PR #11 → `6183d28410512634d822f73f44ef9d84d2dccfbd`.
- **R4c richer visual evidence slice** — PR #12 → `a9d176b15d522c6a81dc370cab3d5ddd1c53b7e7` after automated + Owner runtime PASS.
- **M1 mobile Owner-test controls** — PR #14 → `5e93d759769300afa63deac1323960ef313a5915` after iterative Owner REVISE→PASS. Touch viewport, floating joystick, Interact/Drop and pinch zoom remain human input adapters; zero `src/world` delta.
- **M2 presentation interpolation** — PR #16 → `3a27365a7c2cd784b9cd1f1f135895fd4ffd65a1` after mobile A/B Owner qualification. `World` remains fixed 30 Hz; presentation interpolates previous/current authoritative snapshots.
- **A1 explicit atomic action seam** — PR #17 → `bfee22c2bc35b6578cfedc46e15787c4cd639ef9`. `World.step(WorldInput)` carries continuous player control only; `World.attemptAction(WorldActionRequest)` owns atomic `interact/drop`. Explicit actor/target requests receive causal world-owned outcomes and never silently fall back to another target. Contextual E/mobile Interact remains an adapter into the same action seam. NPC-001 can use the same explicit pickup/drop substrate as the player, but still has no movement executor or autonomy.
- **A2 explicit direct mouse/touch targeting** — PR #18 → `0c47f3779f832f4821b18938f8837c0ef6071545` after Owner REVISE→PASS. Presentation resolves the concrete rendered item/NPC the human intended; the resulting `targetId` is queued into the next fixed step and executed only through the A1 action seam. Touch hit ergonomics do not enlarge gameplay interaction range. Debug Workspace exposes Last Action Outcome separately from World Events. Owner also qualified corrected `tap ↔ joystick ↔ pinch` arbitration, touch-first mobile-mode detection and improved portrait viewport use.

## Durable architecture

### Presentation and motion

Keep `World` independent from assets and authoring-tool specifics.

Current-best future map direction:

`Tiled authoring source → adapter/compiler → domain layout + presentation layout`

Do not start a large Tiled migration or asset system until a concrete authored-map slice justifies its schema.

Authoritative simulation cadence and visual cadence are distinct concerns:

`30 Hz World truth → previous/current snapshots → interpolated presentation`

Inspector/debug truth remains sourced from canonical current state even when the rendered view is interpolated.

### Human input and atomic interaction

Keyboard/touch/mouse are presentation-side human input adapters. Continuous movement and atomic world actions are separate contracts.

Current action seam:

`continuous human control → World.step({ moveX, moveY })`

`atomic request { actorId, action, targetId? } → World.attemptAction(...) → causal WorldActionResult → WorldEvent only if a fact actually occurred`

Missing `targetId` is retained only for contextual legacy E/Interact target selection. Explicit target requests do not fall back to a nearer entity when rejected.

A2 now proves:

`mouse/touch → screen→world + presentation hit resolution → intended targetId → SAME World.attemptAction(...) legality`

Presentation determines what the human pointed at, using rendered/interpolated entity position and ergonomic screen-space hit radius. Canonical `World` determines whether that interaction is legal using canonical state, range and LOS.

Touch gesture arbitration is deliberately separate from world semantics. Tiny touch jitter does not prematurely destroy a valid tap candidate; real drag beyond the tap threshold does, and pinch cancels tap candidates. Action buttons remain separate explicit controls.

### Placement

`Blocker` remains collision/vision geometry. `PlacementSite` is separate semantic placement geometry.

Proven chain:
1. reliable world target (R3a);
2. authored semantic site/relation (R5a/R5b);
3. world-owned non-mutating target legality (R6a);
4. **not yet implemented:** execution, support persistence, event/outcome and player placement UI.

Do not bypass R6a legality from UI or renderer code.

### Behavior/execution

Keep distinct:
1. continuous actor control;
2. atomic validated world actions;
3. durative actor tasks/execution;
4. semantic world events;
5. self/action outcomes.

A1 proves the atomic action substrate can be actor-agnostic enough for player and NPC item interaction. A2 proves a new human targeting adapter can use it without changing `World` legality. Neither proves actor movement/execution; `World.step()` still controls the player specimen only.

Future LLM cognition should mainly propose intents/tasks. A deterministic non-LLM executor should translate them into movement/control + validated atomic actions. Player/scripted/LLM provenance must not change legality.

## Closure campaign toward fresh takeover

Feature work is intentionally converging rather than expanding P1 indefinitely. Current dependency scaffold, re-evaluated after every gate:

`A1 atomic action seam [CLOSED] → A2 direct human targeting [CLOSED] → B1 actor orientation/facing → B2 deterministic non-LLM executor → one bounded technical-debt campaign → final repo/docs/workflow cleanup + takeover rehearsal`

After B2, feature work freezes unless a foundational blocker must be resolved. Sight, hearing, cognition, large placement UX, Tiled migration and additional art polish are deferred until after the fresh-conversation handoff.

The intended pre-cleanup milestone is not “finished NPC”. It is: **NPC-001 can perform a first deterministic embodied task such as approach a known item and attempt the same validated explicit interaction used by the player, without any LLM.**

## Working method

One bounded stage per work cycle/message:

`live regrounding → critical analysis/research → narrow design → implementation when justified → self-review → validation → focused Owner gate when useful → integration → grounding`

Each stage gets a short branch/PR into P1. The next stage is re-evaluated from fresh evidence rather than mechanically executed.

## Immediate frontier

**A1 and A2 are closed. No B1 implementation has started.**

The intended next gate is **B1 — actor orientation/facing**. Before implementation, re-ground live and verify the minimum canonical orientation state that is justified by current movement/action evidence and useful to B2, without prematurely designing sight/FOV.

B1 should establish real actor direction as world/domain state derived from embodied behavior, not a renderer-only heading or a fake parameter added later solely for perception. It must remain small enough that B2 can consume it without forcing a generalized behavior framework.

Do not implicitly start placement UX, additional mobile/art polish, large Tiled migration, sight/hearing or LLM cognition.

## P1 / handoff closure principle

This conversation's closure target is narrower than full cognition-readiness: establish the final action/execution substrate through B2, then run one deliberate technical-debt campaign and one final repo/docs/workflow/handoff campaign.

The fresh conversation should be able to recover current truth, evidence boundaries, Owner judgement, architecture and next frontier from the repository without depending on this chat. After takeover, the project can proceed toward grounded sight, speech/hearing, perception apparatus and first cognition experiments.
