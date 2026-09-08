# LLM Live NPC

Experimental web laboratory for **persistent embodied NPCs whose cognition may use LLMs without letting the model become the world, the physics engine or the per-frame controller**.

## North star

The project is trying to create **one persistent resident of a shared simulated world**, not a chatbot attached to a sprite.

A successful resident should remain one coherent participant across time and across players; experience only evidence that could legitimately reach it; allow novel language and situations to change its intentions; retain meaningful unresolved consequences of earlier decisions; remain legitimately uncertain when evidence is insufficient; and act or communicate through world mechanisms whose real outcomes — not model declarations — determine what actually happened.

Shorthand:

> **meaning may be generative; reality must remain grounded.**

## Current phase

**Pass 1 — Presence Contract — is closed.**

**Pass 2 — architecture / donor / comparative research — is closed as a bounded architecture-selection pass.**

Current-best architecture hypothesis for the first Presence experiment:

> a **Minimal Resident Kernel**: one logical resident owner preserving bounded grounded experience, unresolved semantic matters, task causality and scoped asynchronous semantic proposals, while local competences act through World authority.

BDI/PRS and C4 remain important design donors rather than adopted whole frameworks. Planner families, long-term memory, a global blackboard and full event sourcing remain deliberately unselected.

Next bounded frontier:

**P2-E0 — headless resident causal-kernel probe.**

P2-E0 must deterministically prove or falsify matter persistence, scoped stale-proposal reconciliation, interruption/resumption and task/outcome causality **before** new speech UI, real LLM semantics or runtime integration are added.

Canonical research docs:

- [`docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`](docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md)
- [`docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md`](docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md)

## Live repository state

Current research/refoundation line:

`recovery/owner-fail-2026-09-07`

Recovered runtime checkpoint preserved as bounded donor evidence:

`b31a851c3f708077fbf9e6fb8206fa392f8def13`

That runtime is **automated/R8-qualified donor evidence, not a fresh final qualitative Owner/browser PASS**.

Canonical runtime qualification:

- 145/145 tests across 26 files;
- strict TypeScript/build/preview PASS;
- Cloudflare PASS;
- Worker Version ID `0e1a7e36-edba-4660-8fa2-f2b38172d760`.

Final evidence-only combined R8 PR #75, closed without merge:

- 149/149 tests across 27 files;
- combined R8 4/4 PASS;
- no runtime product changes;
- Cloudflare Version ID `ff9be74c-754a-46b0-851f-36ffb8a9233b`.

`main` intentionally remains the historical P0 transport checkpoint:

`f207419ee87c03979544d2d579e624f043300bbc`

The former P1 integration PR #3 is closed as historical donor evidence. The old post-readiness `experiment/e1-grounded-notice-fetch` line is non-canonical after a decisive Owner/browser FAIL; recovery deliberately restarted from the last good pre-readiness checkpoint rather than forward-merging that failed line.

## Durable donor substrate

The recovered ancestry supports a bounded donor stack containing:

- project-owned TypeScript `World` authority;
- fixed-step simulation with Phaser as presentation/input rather than truth;
- desktop/mobile player control and direct target interaction;
- explicit atomic World actions and factual outcomes;
- deterministic non-LLM NPC execution through World legality;
- bounded E1 perception/temporal evidence;
- a tiny historical `wait | fetch` LLM intention experiment;
- client-side revalidation before execution;
- arm/session stale-response protection;
- cognition→executor diagnostic correlation;
- real World outcomes returning as later NPC experience;
- causal debug/provenance distinguishing player/manual/cognition execution in the recovered scope.

E1 constants and names (`npc.001`, range, cooldown, `wait|fetch`) are experiment apparatus, not future architecture.

## Product truths preserved from Pass 1

The strongest current invariants are:

- one NPC remains one resident in one shared present;
- experience is situated and epistemically sourced;
- an utterance is evidence that someone said something, not automatic World truth;
- continuity and unresolved consequence persist beyond individual model calls;
- uncertainty is a legitimate state;
- novel language can materially change semantic intention;
- intention/attempt/success remain distinct;
- canonical physical/communication outcomes remain World-grounded;
- meaningful elapsed time cannot disappear from NPC continuity.

## Pass 2 current-best architecture constraints

For the first experiment:

- the resident has one logical current owner, independent of where it is hosted;
- recent grounded experience and unresolved matters persist outside LLM calls;
- the LLM returns a **semantic proposal**, not ownership of the resident or World;
- proposal validity is scoped to the semantic matter/evidence it depends on rather than one global World-version CAS;
- task grounding/revalidation uses current World/evidence after semantic commit;
- routine local competence should continue without unnecessary semantic inference;
- task success returns as evidence and does not automatically equal arbitrary semantic satisfaction.

These are current research decisions for P2-E0, not a claim that the final production architecture is solved.

## Explicit non-claims

The project has not yet solved or selected:

- final production Live Mind/resident architecture;
- generic speech/hearing/shared-chat mechanics;
- final attention/addressedness policy;
- general belief representation;
- long-term memory/consolidation/forgetting;
- planner/BT/GOAP/HTN/skill composition architecture;
- routines/proactive autonomy/long-horizon goals;
- pathfinding/navmesh;
- multiplayer resident hosting/concurrency;
- persistence/offscreen simulation/time scaling;
- production scaling/cost architecture;
- final model/provider;
- final conversation UI.

Historical R5b timeout/retry, later R6 sensory-buffer work and R7 ingress/provider hardening remain donors, not an automatic repair queue.

Generic player↔NPC `interact` is currently unsupported rather than pretending that an event-less interaction succeeded. Future conversation should become a truthful world communication contract.

## Canonical spine

A fresh takeover should read:

1. `README.md` — fast orientation;
2. `docs/PROJECT_STATE.md` — live evidence/topology/frontier;
3. `docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md` — product/problem contract;
4. `docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md` — current architecture decision and first probe;
5. `docs/FRESH_TAKEOVER.md` — startup mandate for the next conversation.

Historical design/evidence documents and closed PRs remain available when exact provenance is needed, but they are not the primary startup path.