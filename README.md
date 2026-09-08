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

**P2-E0 — headless resident causal-kernel probe — is closed and canonical.**

Current-best architecture hypothesis for the first Presence experiment remains a **Minimal Resident Kernel**: one logical resident owner preserving bounded grounded experience, unresolved semantic matters, scoped asynchronous semantic proposals and grounded task causality while local competences act through World authority.

P2-E0 supplied executable evidence for the hardest causal semantics without requiring a general belief DB, desire store, plan library, global blackboard, long-term memory or whole-state LLM ownership.

Next earned frontier:

> **world-grounded communication / experience seam** — first characterize the live World/client/perception surfaces, then establish the smallest truthful way for a player utterance or communication occurrence to become sourced resident evidence before adding a live semantic provider.

Do **not** jump directly to chat UI, long-term memory, planner selection or a new LLM endpoint.

Canonical research docs:

- [`docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`](docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md)
- [`docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md`](docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md)

## Live repository state

Current research/refoundation line:

`recovery/owner-fail-2026-09-07`

Canonical P2-E0 merge head:

`ae967830847ef4d5b62e0694e262c0a64fe41d4a`

Exact merge-head qualification:

- 160/160 tests across 28 files;
- strict TypeScript PASS;
- Worker/client production build PASS;
- preview deploy dry-run PASS;
- Cloudflare PASS;
- Worker Version ID `986dcd72-326c-4abe-bcf5-a153e5d9bfa2`.

This qualification includes research tests. It does **not** create a new Owner/browser Presence claim.

Recovered playable-runtime donor checkpoint remains:

`b31a851c3f708077fbf9e6fb8206fa392f8def13`

That runtime is **automated/R8-qualified donor evidence, not a fresh final qualitative Owner/browser PASS**. Its bounded runtime qualification remains 145/145 tests across 26 files plus strict build/preview/Cloudflare PASS, Worker Version ID `0e1a7e36-edba-4660-8fa2-f2b38172d760`.

Final evidence-only combined R8 PR #75, closed without merge, reached 149/149 tests across 27 files and combined R8 4/4 PASS without runtime product changes.

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

## P2-E0 earned causal constraints

The bounded probe now has executable evidence for:

- semantic proposals scoped to `matterId + semanticRevision + semanticEvidenceId`, not a global World-version CAS;
- unrelated physical evidence not automatically staling a still-valid semantic proposal;
- later same-matter semantic supersession staling the older proposal;
- task bindings preserving the semantic revision at which grounding occurred;
- late outcomes from older runs remaining factual evidence without rolling back newer semantics or auto-resolving the matter;
- interruption preserving one causal parent and refusing overwrite/cycles in the bounded model;
- mechanical task completion remaining distinct from semantic satisfaction.

Important non-claim: the bounded recent-evidence window may evict payloads referenced by durable causal tokens. P2-E0 deliberately did **not** invent an evidence archive or memory system. A later earned causal-inspector/live-context consumer must determine the smallest bounded dereference strategy.

## Explicit non-claims

The project has not yet solved or selected:

- final production Live Mind/resident architecture;
- generic speech/hearing/shared-chat mechanics;
- final attention/addressedness policy;
- evidence-retention/dereference strategy beyond bounded recent experience and causal tokens;
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

Generic player↔NPC `interact` is currently unsupported rather than pretending that an event-less interaction succeeded. The next frontier must recover live truth before deciding how communication enters the world.

## Canonical spine

A fresh takeover should read:

1. `README.md` — fast orientation;
2. `docs/PROJECT_STATE.md` — live evidence/topology/frontier;
3. `docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md` — product/problem contract;
4. `docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md` — architecture decision;
5. `docs/FRESH_TAKEOVER.md` — startup mandate for the next conversation.

For exact P2-E0 falsification provenance, inspect merged PR #79 and its preserved RED checkpoints `19a44207...` and `90fb9439...`.

Historical design/evidence documents and closed PRs remain available when exact provenance is needed, but they are not the primary startup path.
