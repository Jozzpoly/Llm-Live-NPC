# LLM Live NPC — Fresh Takeover

Use this document to start a new Browser ChatGPT conversation after the qualified E1 vertical slice and during/after its bounded technical-debt closure.

## 1. First action: verify live truth

Repository:

`Jozzpoly/Llm-Live-NPC`

Current E1 closure line:

`experiment/e1-grounded-notice-fetch`

Current PR:

`#23 — E1 experiment — grounded notice to fetch`

Qualified P1 base:

`p1/playable-world-slice` at `e453f5862286328df92db91ba2f9adabc1e7899e`

`main` intentionally remains the proven P0 production/model-transport baseline.

Do **not** trust a copied E1 SHA without live verification. The runtime-clean checkpoint immediately before the final documentation-only closure commits is:

`15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

A live PR #23 head newer than that is expected if changes are documentation/closure only. If runtime code changed after that checkpoint, inspect the diff and revalidate before continuing.

Do not merge PR #23 merely because takeover succeeded. Integration remains an explicit Owner/project decision after final debt/quality closure.

## 2. Read in this order

1. `README.md`
2. `docs/PROJECT_STATE.md`
3. `docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md`
4. this file
5. live PR #23 and its current checks/deployment
6. P1 PR #3 only when substrate/integration background is needed

The canonical spine is intentionally compact. Do not reconstruct the project by reading every historical branch or PR first.

## 3. What is closed evidence

Do not mechanically repeat or repolish:

- P0 cloud/model transport qualification;
- P1 world/presentation refoundation stages through B2;
- P1 mobile controls, interpolation, direct targeting, actor facing and post-B2 debt campaign;
- **E1 Grounded Notice → Fetch research experiment**, including its real-model probe and final Owner re-gate.

E1 is closed as a **bounded research result**. The remaining E1-line work is quality/debt/continuity/integration closure, not another attempt to prove the same experiment.

## 4. What E1 actually proves

Qualified causal chain:

`player-caused held→free World change → bounded 220 px local projection → explicit temporal perceptual delta → real Granite wait|fetch intention → client revalidation → existing deterministic executor → validated World pickup → real E1 experience → subsequent Granite cycle`

The final Owner re-gate with Lantern showed:

- `holder player.jozz → free`;
- legal `fetch(item.lantern)`;
- NPC-001 pickup through existing executor/World legality;
- semantic World pickup provenance;
- next cycle with `succeeded · picked_up_item`, `self held none → item.lantern`, and `holder free → npc.001`;
- final real Granite decision `wait`.

This is a meaningful vertical-loop PASS and still a deliberately tiny claim.

## 5. Do not overread E1

E1 does **not** establish:

- semantic sight, FOV or a final attention architecture;
- hearing or grounded speech propagation;
- long-term/episodic memory or belief revision;
- pathfinding/navmesh/general obstacle solving;
- actor-actor collision;
- generic behavior trees/task graphs/planner framework;
- open-ended goals or autonomous task selection;
- multi-NPC coordination;
- final conversation UI;
- final placement system;
- final map authoring pipeline;
- final model choice.

Current geometric LOS is an occlusion/geometry primitive, not qualified NPC sight.

Current direct approach execution may stall on geometry and exhaust its explicit step budget. That is bounded failure behavior, not pathfinding.

## 6. Architecture to preserve

Target research loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

Preserve these boundaries:

- `World` owns canonical entities, movement legality, action legality and semantic outcomes;
- Phaser owns presentation/camera/input, not world truth;
- perception is a bounded projection derived from `World`, not arbitrary raw-state access;
- LLM cognition proposes bounded intentions, never direct canonical mutation;
- deterministic execution translates accepted intentions into actor control + validated atomic actions;
- player/script/LLM provenance must remain inspectable without changing gameplay legality;
- a running executor task must not be silently replaced.

E1 additionally established a useful temporal rule: a model call should carry an inspectable bounded delta telling the model what it actually observed changing, rather than waking after an opaque hidden trigger.

## 7. Important falsification/recovery history

Carry these methodological lessons forward:

### B2 provenance lesson

An early Owner recording that visually looked successful was rejected because provenance showed the player, not NPC execution, created the apparent success. The later B2 apparatus added a shared `ExecutionDriver` and stronger causal evidence before qualification.

### E1 transport lesson

Do not assume example/API shapes without live evidence. E1 discovered:

- legacy flat Workers AI tools failed with `8001: Invalid input`;
- OpenAI-style wrapped functions succeeded;
- Granite tool calls arrived in nested OpenAI-style choices;
- observed `function.arguments` was double-encoded JSON.

### E1 cadence lesson

A still-held item crossing the 220 px boundary originally wasted cognition cycles. The qualified wake surface is observer state + fetchable item IDs + new own execution experience, while ignored held-item churn silently refreshes the temporal baseline.

### Rendered-UI quality lesson

Green domain CI did not catch a severely broken desktop shell where Debug Workspace content expanded the entire page/game and scrolling the debug scrolled the runtime. Owner testing exposed it.

The debt campaign therefore treats rendered shell/scroll/status behavior as a first-class quality surface rather than assuming unit tests imply usable UI.

## 8. Current technical-debt closure state

The E1 branch already contains these repairs:

- desktop shell fixed to viewport;
- independent Debug Workspace scrolling;
- explicit narrow-window collapsed layout;
- explicit mobile portrait app/debug scroll contract;
- live `E1 cognition armed/disarmed` shell status;
- E1-aligned `/api/health` provenance;
- executor no-replacement invariant + regression test;
- E1 checks `executor.start()` acceptance;
- manual B2 trigger disabled while executor is running and debug state no longer invents an `accepted` acknowledgement.

Do not treat intentionally missing future systems as technical debt. The goal is zero **known material debt in current P1/E1 scope**, not speculative framework completion.

## 9. Immediate takeover job

**Do not begin a new feature or research experiment yet.**

First:

1. verify live PR #23 head and compare it to runtime-clean checkpoint `15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`;
2. confirm any newer changes are documentation/closure unless explicitly proven otherwise;
3. perform a second critical audit of the P1→E1 diff and current runtime/config/docs for remaining known material debt;
4. run full CI + exact Cloudflare deployment;
5. use only the focused Owner smoke needed to validate repaired shell/provenance behavior;
6. then make an explicit E1 integration/closure decision.

Only after that should the next research uncertainty be selected.

## 10. Owner judgement to carry forward

Treat these as current Owner judgement, not universal truths:

- real player ↔ NPC ↔ world interaction is more valuable than prompt-only roleplay;
- small functioning experiments should precede broad formal architectures;
- the current world is large/readable enough for the present research laboratory;
- mobile is a useful real Owner-test surface, not a separate game fork;
- interpolation materially improved movement feel;
- current visual polish is enough unless a research need justifies more;
- direct mouse/touch targeting is useful and qualified;
- debugging should expose causal/provenance structure, not just telemetry;
- apparently tiny UX/layout defects matter because they directly affect the Owner test loop and confidence in the apparatus;
- before the next stage, known technical debt should be deliberately paid down rather than accumulated behind new features.

## 11. Things intentionally deferred

Do not smuggle these into debt cleanup or the next slice without evidence:

- broad behavior framework;
- generalized navigation/pathfinding;
- large Tiled/map migration;
- another cosmetic campaign;
- full placement system;
- sophisticated long-term memory;
- full speech/hearing architecture;
- multi-NPC society simulation;
- auth/account/product infrastructure for the lab preview unless a concrete risk requires it.

They are future possibilities, not current debts merely because they do not exist.

## 12. Repo hygiene note

Three accidental branches remain documented:

- `tmp-do-not-use`
- `tmp-do-not-use-2`
- `tmp-stop`

They contain no unique canonical implementation. Available GitHub write tooling during closure did not expose branch deletion, so they were documented instead of falsely reported as removed.

Historical experiment/evidence branches are not automatically debt.

## 13. Takeover rehearsal checklist

Before declaring yourself grounded, answer from live evidence:

1. Why does `main` remain P0 while P1 and E1 live on draft integration/experiment lines?
2. What exact claim does P1/B2 prove?
3. What exact additional claim does E1 prove?
4. What did the first E1 Owner gate expose, and how was wake/rate-limit behavior repaired?
5. What Workers AI/Granite function-calling shapes were actually proven live?
6. Where does canonical world truth live, and what may Phaser/LLM own?
7. Why is geometric LOS not qualified NPC sight?
8. Why can a green domain CI still be insufficient evidence for the rendered Owner loop?
9. Which current items are real technical debt versus intentionally deferred capabilities?
10. Why is the immediate frontier debt/integration closure rather than another cognition feature?

If any answer is unclear or live state contradicts the docs, resolve it before new feature work.

## 14. Expected takeover behavior

Act as the Owner's browser-based second brain / technical co-worker. Recover intent from live repo evidence, independently challenge stale recommendations, perform research/implementation/validation where justified, and keep claims narrower than evidence.

Once the debt/closure frontier is clean, do not preserve this handoff forever. Update the canonical spine for the next stage and let obsolete closure detail recede.
