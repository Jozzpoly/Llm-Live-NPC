# LLM Live NPC

Experimental web laboratory for **persistent embodied NPCs whose cognition may use LLMs without letting the model become the world, the physics engine or the per-frame controller**.

## Current project question

The project has moved beyond the original narrow question of whether an LLM can choose one grounded action.

The current research direction is:

> How do we build a believable resident of a simulated world that exists continuously between model calls, perceives only bounded evidence, communicates through the same world as players, develops continuity of intentions/beliefs/memory, and uses an LLM as a higher semantic cognitive mechanism while deterministic/local systems preserve world truth, execution and responsiveness?

This is a **research direction**, not a frozen final architecture.

## Live state — 2026-09-07

The active recovered/refoundation line is:

`recovery/owner-fail-2026-09-07`

Recovered runtime checkpoint before the canonical docs reconciliation:

`b31a851c3f708077fbf9e6fb8206fa392f8def13`

That checkpoint is **automated/R8-qualified donor evidence**, not a fresh final qualitative Owner/browser PASS.

`main` intentionally still points to the historical P0 transport checkpoint:

`f207419ee87c03979544d2d579e624f043300bbc`

The old P1 integration PR #3 is closed without merge as a historical donor line. The current recovery branch is a full descendant of P1, so no unique P1 runtime was discarded.

The old post-readiness `experiment/e1-grounded-notice-fetch` line is **not canonical**. A 2026-09-07 Owner/browser gate found that line materially worse than the previous good playable surface. Recovery deliberately restarted from the last good pre-readiness checkpoint instead of forward-merging the failed line.

## What is proven enough to preserve as donor substrate

The current ancestry/evidence supports a bounded stack containing:

- project-owned TypeScript `World` authority;
- fixed-step simulation with Phaser as presentation/input rather than truth;
- desktop/mobile player control and direct target interaction;
- explicit atomic World actions and causal action results;
- deterministic non-LLM NPC execution through the same World legality as player actions;
- bounded E1 perception/temporal evidence;
- a tiny LLM intention surface (`wait | fetch`);
- client-side revalidation before execution;
- async arm/session safety against stale model responses;
- cognition→executor diagnostic correlation;
- real World outcomes returning as later NPC experience;
- causal debug/provenance strong enough to distinguish player/manual/cognition execution in the recovered scope.

Final evidence-only combined R8 re-attack: PR #75, closed without merge, **149/149 tests across 27 files; R8 4/4; strict TypeScript/build/preview PASS; Cloudflare PASS**.

Canonical recovered runtime itself remains smaller: **145/145 tests across 26 files** at `b31a851c...`.

## Explicit non-claims

Do not infer that the project has already solved or re-qualified:

- final Live Mind architecture;
- generic speech/hearing/shared-chat semantics;
- attention or addressedness;
- beliefs or long-term memory;
- planning/routines/proactive autonomy;
- pathfinding/navmesh;
- multiplayer cognitive concurrency;
- persistence/offscreen simulation/production scaling;
- final model selection;
- historical R5b timeout/retry/cancellation policy;
- later historical R6 sensory-buffer refinements;
- later historical R7 Worker ingress/provider-observability hardening.

Those historical R5b/R6/R7 areas were deliberately **not mechanically ported** during selective recovery. Their absence is not automatically a current blocker; they may be reused later only when the new architecture gives them a concrete role.

Generic player↔NPC `interact` is currently unsupported rather than pretending that an event-less interaction succeeded. Future conversation should be designed as a truthful communication contract in the world, not resurrect that placeholder.

## Current Owner direction entering refoundation

The strongest current product direction is:

- one NPC should be one persistent cognitive identity, not a private chatbot clone per player;
- initial conversation should happen through ordinary shared world chat, with dedicated/focused UI only as optional QoL later;
- speech should become a world communication occurrence, not direct prompt plumbing;
- hearing a message and being addressed by it are different problems;
- an utterance is evidence that someone said something, not automatic canonical world truth;
- the NPC needs a cheap continuously alive runtime between sparse LLM cognitive acts;
- LLM authority should be strongest around language, interpretation, intentions, social judgement and deliberation, while World/local execution remains authoritative about what actually happened;
- debug should expose causal state and provenance, not hidden chain-of-thought.

These are the starting hypotheses/invariants for the next study pass and should still be challenged before architecture is frozen.

## Current frontier

**Do not implement chat, memory, Live Mind, planning or another E1 feature yet.**

**Pass 0 technical/evidence reconciliation is closed at this canonical-spine state.** The next real work is the **Live NPC Refoundation Study — Pass 1: vision, invariants and anti-goals**.

The purpose of Pass 1 is to reconstruct and challenge what “a real resident” means for this project before architecture research begins shaping the solution.

Canonical spine:

1. `README.md` — fast orientation;
2. `docs/PROJECT_STATE.md` — current evidence boundary, topology, donor architecture and frontier;
3. `docs/FRESH_TAKEOVER.md` — startup mandate for a new conversation.

Historical design/evidence documents and closed PRs remain available when exact provenance is needed, but they are not the primary startup path.