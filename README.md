# LLM Live NPC

Experimental web laboratory for **persistent embodied NPCs whose cognition may use LLMs without letting the model become the world, the physics engine or the per-frame controller**.

## North star

The project is trying to create **one persistent resident of a shared simulated world**, not a chatbot attached to a sprite.

A successful resident should remain one coherent participant across time and across players; experience only evidence that could legitimately reach it; allow novel language and situations to change its intentions; retain meaningful unresolved consequences of earlier decisions; remain legitimately uncertain when evidence is insufficient; and act or communicate through world mechanisms whose real outcomes — not model declarations — determine what actually happened.

Shorthand:

> **meaning may be generative; reality must remain grounded.**

## Current phase

**Live NPC Refoundation Pass 1 — presence / invariants / anti-goals — is closed as a problem-definition pass.**

Next stage:

**Pass 2 — architecture / donor / research campaign.**

Do **not** begin Pass 2 by implementing chat, memory, a planner or a `Mind Runtime`. The next job is to compare competing architecture hypotheses against the Presence Contract and select the smallest architecture capable of supporting a genuinely informative first Life Test.

Canonical Pass 1 contract:

[`docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`](docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md)

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

## Pass 1 product truths

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

Several attractive ideas remain **hypotheses**, not requirements: an explicit `Active Life State`, cognitive-pressure scheduling, a semantic-transition validator, skills/competences, a persistent `Live Mind Runtime`, planner families, long-term memory design and exact communication mechanics.

## Explicit non-claims

The project has not yet solved or selected:

- final Live Mind architecture;
- generic speech/hearing/shared-chat mechanics;
- attention/addressedness;
- belief representation;
- long-term memory/consolidation/forgetting;
- task/skill/planner architecture;
- routines/proactive autonomy/long-horizon goals;
- pathfinding/navmesh;
- multiplayer cognitive concurrency;
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
3. `docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md` — problem definition and qualification target;
4. `docs/FRESH_TAKEOVER.md` — startup mandate for the next conversation.

Historical design/evidence documents and closed PRs remain available when exact provenance is needed, but they are not the primary startup path.
