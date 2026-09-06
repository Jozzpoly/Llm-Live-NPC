# LLM Live NPC — Project State

Updated: 2026-09-06

## Core question

Can an LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world mechanics rather than directly mutating world truth?

Target loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

`World` is authoritative about what exists, what can be attempted and what actually happened. Perception is derived from world truth. Cognition may propose bounded intentions; it does not directly mutate positions, inventory, events or executor internals.

## Live stage topology

### P0 — production baseline

`main` intentionally remains the proven cloud/model-transport baseline.

P0 proved:

- GitHub → Cloudflare deployment;
- Worker + static assets;
- Workers AI through AI Gateway;
- usage/log correlation;
- replaceable model transport.

Granite 4.0 H Micro and Llama 3.2 3B Instruct both produced usable bounded completions. Earlier GLM probes remain negative evidence. **No final NPC model is selected.**

### P1 — qualified pre-cognition substrate

Canonical branch: `p1/playable-world-slice`

Canonical head: `e453f5862286328df92db91ba2f9adabc1e7899e`

Integration PR: #3, still draft.

P1 proves:

- project-owned TypeScript `World` truth;
- top-down settlement specimen with blockers, locations, items and semantic events;
- fixed 30 Hz authoritative stepping with interpolated Phaser presentation;
- desktop/mobile human controls and direct target interaction;
- canonical actor facing;
- world-owned placement target validation;
- deterministic non-LLM NPC executor + shared `ExecutionDriver`;
- Owner-qualified embodied pickup through the same validated World action substrate as the player;
- explicit action/event/executor/debug provenance;
- bounded causal failure state.

P1 does **not** qualify autonomous cognition, NPC perception semantics, long-term memory, pathfinding, hearing/speech or conversation.

### E1 — Grounded Notice → Fetch: qualified bounded vertical slice

Branch: `experiment/e1-grounded-notice-fetch`

PR: #23 against P1, still draft while final debt/continuity closure is completed.

Runtime-clean checkpoint before documentation-only closure commits:

`15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

E1 qualifies this exact loop:

`player-caused held→free World change → 220 px bounded local perception → explicit temporal delta → real Granite wait|fetch intention → client revalidation → existing deterministic executor → validated World pickup → E1 self experience → subsequent Granite cycle`

The final Owner re-gate passed with Lantern:

1. player carried Lantern into NPC-local range while held;
2. E1 was armed as a no-call baseline;
3. drop produced `item.lantern: holder player.jozz → free` and Lantern became fetchable;
4. Granite selected `fetch(item.lantern)`;
5. NPC-001 approached and picked up Lantern through the existing executor/World path;
6. World/event provenance independently recorded the pickup;
7. the next cognition cycle received `succeeded · picked_up_item`, `self held none → item.lantern`, and `holder free → npc.001`;
8. Granite selected `wait`.

This is a real embodied vertical-loop PASS, not a claim of general intelligence or a final agent architecture.

Full E1 contract/evidence: [`E1_GROUNDED_NOTICE_FETCH_DESIGN.md`](E1_GROUNDED_NOTICE_FETCH_DESIGN.md).

## E1 falsification/recovery history worth preserving

E1 only became qualified after several failures were treated as evidence rather than papered over.

### Workers AI / Granite seam

Live diagnostics established:

- messages-only Granite call worked;
- legacy flat tool schema failed with Workers AI `8001: Invalid input`;
- OpenAI-style function wrapper succeeded;
- tool calls arrived under `choices[0].message.tool_calls[*].function`;
- observed Granite `function.arguments` was double-encoded JSON.

The Worker now uses the live-proven wrapper and permits at most two bounded JSON decodes before normal allow-list validation.

A real pre-Owner two-cycle probe passed:

- holder `player.jozz → free` → `fetch(item.mug)`, Gateway `01M1SZ3H6M4MSYEG3X2GFFFWDP`;
- prior `picked_up_item` + NPC holding mug → `wait`, Gateway `01M1SZ3KB5VXG5K5W2T9SWZXBC`.

### First Owner gate: partial pass

The first hands-on recording proved the central pickup path but exposed apparatus debt:

- non-fetchable held-item boundary churn could wake cognition and waste `wait` cycles;
- `3 requests / 60 s` was too small for repeated hands-on attempts plus the required post-pickup cycle.

Repairs:

- wake fingerprint narrowed to observer state + **fetchable item IDs** + own new execution experience;
- silent perception baseline still updates during ignored held-item churn, preserving a later true holder delta;
- development limiter raised to `6 requests / 60 s`.

The repaired Owner re-gate then passed completely.

## Post-E1 technical-debt campaign

Owner review after the successful E1 gate exposed several quality debts that domain tests had not caught. Feature work was intentionally stopped until they were addressed.

### Repaired runtime/UI/provenance debt

- desktop shell is constrained to the viewport;
- the giant blank scrollable game region is gone;
- Debug Workspace owns its vertical scroll instead of scrolling the entire game/document;
- narrow-window collapsed debug uses a fixed compact row instead of wasting one-third of the viewport;
- mobile portrait has an explicit controlled app/debug scroll contract;
- shell stage label reflects real `E1 cognition armed/disarmed` state rather than stale `cognition disabled` text;
- E1 preview `/api/health` reports the E1 stage rather than stale P0 stage provenance;
- `DeterministicExecutor.start()` refuses silent replacement of a running task;
- regression test verifies refused replacement leaves task/progress provenance unchanged;
- E1 checks the boolean executor-start result before claiming `accepted_fetch`;
- manual B2 `Fetch lantern` control is disabled while executor state is `running` and its debug field reports actual executor state rather than inventing an `accepted` acknowledgement.

These are debt repairs, not extensions of the E1 research claim.

### Current closure boundary

Before a new research stage:

1. finish documentation/handoff alignment;
2. perform a second repo/diff audit for remaining **known material** debt in current P1/E1 scope;
3. run final full CI + exact Cloudflare deployment;
4. perform only a focused Owner smoke for repaired shell/provenance behavior if needed;
5. make an explicit E1 integration/closure decision.

Do not use “remove all technical debt” to justify speculative framework work. Deliberately absent future systems are not debt merely because they do not exist.

## Proven architecture and contracts

### Authority and presentation

`human/controller adapters → continuous control + atomic action requests → World authority → WorldSnapshot → presentation`

Phaser is presentation/camera/input infrastructure, not canonical gameplay authority.

`30 Hz World truth → previous/current authoritative snapshots → interpolated presentation`

Debug truth comes from canonical current state even when presentation is interpolated.

### Human interaction

`mouse/touch → screen→world + rendered-target resolution → intended targetId → SAME World legality`

Presentation determines what the human pointed at. `World` determines whether the attempt is legal.

### Execution

Keep separate:

1. continuous actor control;
2. atomic validated World actions;
3. durative task execution;
4. semantic World events;
5. self/action outcomes;
6. perception/cognition/intention policy.

Current execution seam:

`task { actorId, targetId } → DeterministicExecutor → ExecutionDriver → World.stepWithActorControls(...) → World.attemptAction(...) → causal result`

The executor now has an explicit no-replacement invariant while a task is `running`.

### E1 perception/cognition

`WorldSnapshot → bounded projection → observedChanges + own previous experience → sanitized Worker request → Granite tool intention → client validation → executor`

The raw snapshot, blocker list, absolute map state and global event log do not go to the model.

Current geometric `hasLineOfSight()` is only a geometry/occlusion primitive. It is **not qualified NPC sight**.

## Deliberately missing / not proven

Do not infer any of these from E1:

- semantic vision, FOV or attention architecture;
- hearing or grounded speech propagation;
- long-term/episodic memory or belief revision;
- pathfinding/navmesh/general obstacle solving;
- actor-actor collision;
- generic behavior trees, task graphs or planner framework;
- autonomous goals or open-ended task selection;
- multi-NPC coordination;
- final conversation UI;
- controlled placement execution/persistent support relation/full placement UX;
- final map authoring pipeline or large Tiled migration;
- final model choice.

The current executor's approach behavior is naive direct movement. A blocker can make it stall until the explicit step budget fails. That is not pathfinding.

## Owner judgement worth preserving

- Runtime/preview workflow is useful enough for frequent hands-on gates.
- Initial world size is sufficient for the current research laboratory.
- Movement/collision and pickup/drop are substrate, not final gameplay.
- Presentation interpolation materially improved the earlier 30 Hz sample-and-hold feel.
- Direct targeting is Owner-qualified on desktop and mobile.
- Mobile Owner testing is genuinely useful and should remain viable.
- Debugging must answer **who did what, through which system, and why** rather than just expose numbers.
- The B2 invalid-recording correction remains an important precedent: visible behavior alone is not enough when provenance can distinguish player/script/NPC action.
- The E1 UI incident adds another precedent: green domain CI does not prove rendered shell quality. Owner-visible layout/scroll/status contracts need explicit smoke coverage or focused hands-on validation.

## Repository / workflow status

Validation contract:

- Node 22;
- locked `npm ci --ignore-scripts --no-audit --no-fund`;
- `npm run check` = TypeScript + Vitest + Vite build;
- `npm run deploy:preview -- --dry-run` verifies self-contained preview path;
- Cloudflare non-production branch builds provide exact deployed previews.

Known low-risk repository-hygiene residue:

- accidental branches `tmp-do-not-use`, `tmp-do-not-use-2`, `tmp-stop` still exist;
- they contain no unique implementation and are not canonical;
- current GitHub write tooling does not expose branch deletion, so cleanup must not claim they were removed.

Historical feature/evidence branches are not debt merely because they still exist.

## Closed evidence that must not be repeated mechanically

P1's R/A/B/M stages through B2 and its post-B2 debt campaign are closed evidence on `p1/playable-world-slice`.

E1 Grounded Notice → Fetch is also closed **as a research experiment** after the successful Owner re-gate. The current remaining work is debt/continuity/integration closure, not another E1 research run.

## Immediate frontier

**No new feature or research stage yet.**

Immediate work is:

`finish debt audit → final automated/deployment validation → focused quality smoke → explicit E1 closure/integration decision`

After that, critically choose the next bounded uncertainty from E1 evidence. Do not automatically expand E1 into a generic agent framework and do not restart P1/E1.

A future experiment may investigate a richer aspect of embodied presence, but its scope must be selected from a concrete uncertainty and falsification criterion first.

## Working method

`live regrounding → identify uncertainty → bounded experiment → implementation only when justified → self-review → automated validation → focused Owner gate → integrate/close → update canonical state`

Owner hands-on judgement remains first-class evidence for feel, legibility, believability and rendered-runtime quality. Automated tests establish narrower implementation/invariant claims.

## Fresh takeover order

A new conversation should recover the project by reading, in order:

1. `README.md`;
2. `docs/PROJECT_STATE.md`;
3. `docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md`;
4. `docs/FRESH_TAKEOVER.md`;
5. live PR #23 and its current checks/deployment;
6. P1 PR #3 only as substrate/integration background when needed.

If live repository state contradicts these documents, live branch/PR evidence wins and the contradiction must be resolved before new work.
