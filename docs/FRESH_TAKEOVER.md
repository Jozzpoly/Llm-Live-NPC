# LLM Live NPC — Fresh Takeover

Use this document to start a new Browser ChatGPT conversation after the P1 pre-cognition refoundation closure.

## 1. First action: verify live truth

Repository:

`Jozzpoly/Llm-Live-NPC`

Canonical working/integration line:

`p1/playable-world-slice`

Integration PR:

`#3 — P1 integration — refound world before cognition`

Do **not** trust a copied SHA without checking live state. The stable implementation checkpoint immediately before the final docs-only handoff cleanup is:

`f25c48e65135007c8c58af730d954ec8d740bce0`

The live P1 head should be newer because the final handoff cleanup updates documentation only. If it differs for any other reason, inspect all changes from that checkpoint before continuing.

`main` intentionally remains the proven P0 production/cloud baseline. PR #3 is expected to remain draft until a later explicit integration decision; do not merge it merely because takeover succeeded.

## 2. Read in this order

1. `README.md`
2. `docs/PROJECT_STATE.md`
3. this file
4. live PR #3

Then inspect these only when exact evidence is needed:

- PR #20 — B2 deterministic non-LLM NPC executor;
- PR #21 — bounded post-B2 technical-debt campaign;
- earlier stage PRs linked from `PROJECT_STATE.md`.

The compact canonical spine is intentionally small. Do not reconstruct the project by reading every historical branch first.

## 3. What is closed evidence

Do not mechanically repeat or polish these stages during takeover:

- P0 cloud/model transport qualification;
- P1 world/presentation refoundation stages R1a/R2a/R3a/R4a-c/R5a-b/R6a;
- M1 mobile Owner controls;
- M2 presentation interpolation;
- A1 atomic action seam;
- A2 direct mouse/touch targeting;
- B1 canonical actor facing;
- B2 deterministic non-LLM NPC execution;
- the one bounded post-B2 technical-debt campaign.

B2 received a fresh deployed Owner PASS after an earlier invalid Owner recording was explicitly rejected. The qualified claim is narrow but important: NPC-001 can receive one explicit durative task, move through canonical World stepping and pick up the known lantern through the same validated atomic interaction substrate used by the player.

## 4. Do not overread B2

B2 does **not** establish:

- LLM cognition or autonomy;
- NPC perception/sight/hearing;
- memory architecture;
- pathfinding/navmesh/general obstacle solving;
- actor-actor collision;
- generic behavior trees/task graphs;
- final placement execution/UX;
- final chat/speech system;
- final map pipeline;
- final model choice.

Current direct approach behavior may stall on geometry and exhaust its explicit step budget. That is bounded failure evidence, not pathfinding.

Current geometric LOS is not NPC sight.

## 5. Architecture to preserve

Target research loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

Preserve the authority boundary:

- `World` owns canonical entities, movement legality, action legality and semantic outcomes;
- presentation/input code may resolve human intent but must not bypass World legality;
- future perception should be a bounded projection derived from World truth, not arbitrary raw-state access;
- future LLM cognition should propose intentions/tasks, not directly mutate canonical state;
- deterministic execution translates accepted intentions into continuous actor control + validated atomic actions;
- provenance must remain inspectable: player/script/LLM source must not alter gameplay legality.

Browser and headless B2 evidence use the same `ExecutionDriver` fixed-step contract.

## 6. Owner judgement to carry forward

Treat these as current Owner judgement, not universal truths:

- the world is large/readable enough for the current research laboratory;
- mobile is a useful real Owner-test surface, not a separate game fork;
- interpolation materially improved feel and removed visible fixed-step sample-and-hold artifacts;
- current visual polish is enough for now;
- explicit direct targeting is useful and qualified on desktop/mobile;
- debugging should reveal causal/provenance structure, not just raw telemetry;
- the project should increasingly maximize real player ↔ NPC ↔ world interaction rather than roleplay entirely inside prompts;
- small functioning experiments are preferred before large formal architectures.

## 7. Immediate post-takeover job

Do **not** automatically implement sight or plug in an LLM on the first turn.

First perform live regrounding and ask: **what is the smallest experiment that can materially test whether an NPC starts to feel present in the world?**

Current-best candidate direction:

`WORLD → bounded NPC perception → small inspectable agent context/state → limited LLM intention → existing deterministic executor → validated World result → context/experience update`

A tiny intention vocabulary such as `wait`, `approach(entity)` and `fetch(item)` may be enough for the first experiment, but this is not canonical design yet.

Before implementation, decide:

- the research question/unknown;
- what exact world information NPC-001 may perceive;
- update cadence and cost budget;
- what the model is allowed to output;
- how intention reaches the existing executor;
- how outcomes become subsequent experience/context;
- what debug evidence distinguishes real grounding from prompt roleplay;
- failure/falsification criteria and natural stop boundary.

Research current model/API options if model choice materially affects the experiment. P0's Granite/Llama successes are transport candidates, not a final cognition choice.

## 8. Things intentionally deferred

Do not smuggle these into the first post-handoff slice without new evidence:

- broad behavior framework;
- generalized navigation/pathfinding;
- large Tiled/map migration;
- additional cosmetic campaign;
- full placement system;
- sophisticated long-term memory;
- full speech/hearing architecture;
- multi-NPC society simulation.

They remain legitimate future directions, but the next experiment should earn them.

## 9. Repo hygiene note

Three accidental branches still exist:

- `tmp-do-not-use`
- `tmp-do-not-use-2`
- `tmp-stop`

They contain no unique implementation and are non-canonical. The GitHub connector available during closure did not expose branch deletion, so they were deliberately documented rather than falsely reported as removed.

Historical stage/evidence branches are not automatically debt.

## 10. Takeover rehearsal checklist

Before declaring yourself grounded, you should be able to answer from live repo evidence:

1. Why does `main` still serve P0 while P1 exists on a draft integration line?
2. What does B2 actually prove, and what did the rejected first Owner recording fail to prove?
3. Where does canonical world truth live, and what is Phaser allowed to own?
4. How do continuous controls differ from atomic actions and durative tasks?
5. Why is geometric LOS not NPC perception?
6. What is the exact evidence boundary around navigation/autonomy/cognition?
7. What is the next research uncertainty rather than merely the next implementation task?

If any answer is unclear or live state contradicts the docs, resolve that before new feature work.

## 11. Expected takeover behavior

Act as the Owner's browser-based second brain / technical co-worker. Recover intent from the repository and current conversation, independently challenge stale recommendations, perform research/implementation/validation where justified, and keep evidence claims narrower than the evidence.

The goal after takeover is not to preserve this handoff forever. Once the new phase establishes better live truth, update the canonical spine and let obsolete closure details recede.