# LLM Live NPC

Experimental web laboratory for **persistent embodied NPCs whose cognition may use LLMs without letting the model become the world, the physics engine or the per-frame controller**.

## North star

The project is trying to create **one persistent resident of a shared simulated world**, not a chatbot attached to a sprite.

A successful resident should remain one coherent participant across time and across players; experience only evidence that could legitimately reach it; allow novel language and situations to change its semantic direction; retain meaningful unresolved consequences of earlier decisions; remain legitimately uncertain when evidence is insufficient; and act or communicate through world mechanisms whose real outcomes — not model declarations — determine what actually happened.

Shorthand:

> **meaning may be generative; reality must remain grounded.**

## Current phase

**Pass 1 — Presence Contract — is closed.**

**Pass 2 — architecture / donor / comparative research — is closed as a bounded architecture-selection pass.**

The bounded executable research campaign has now advanced through **P2-E0…P2-E12** on the canonical refoundation line. The resulting research substrate supports a causal chain from grounded experience and unresolved semantic matters, through scoped asynchronous semantic proposals, into grounded task execution and factual outcome reconciliation, including interruption, semantic reconsideration, terminal disposition and stale-cognition lifecycle handling.

This is substantial architecture evidence. It is **not yet a fresh playable Presence qualification and not a wholesale production integration of the research seams**.

Current-best architecture hypothesis for the first Presence experiment remains a **Minimal Resident Kernel**: one logical resident owner preserving bounded grounded experience, unresolved semantic matters, scoped asynchronous semantic proposals and grounded task causality while local competences act through World authority.

Current next step:

> **broaden the post-P2-E12 gap/readiness audit before selecting another implementation frontier.**

Do not jump automatically to a live LLM/provider, memory system, planner, generic scheduler or playable integration merely because the research chain is now deep. Candidate questions such as admission/bounding of multiple genuinely-live same-revision cognition requests remain hypotheses to attack, not selected architecture.

Canonical research docs:

- [`docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`](docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md)
- [`docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md`](docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md)

## Live repository state

Current research/refoundation line:

`recovery/owner-fail-2026-09-07`

Canonical P2-E12 merge head:

`be543147bbfcc43f92fd18bbc8aa7aac30588621`

Exact independent merge-head qualification:

- **247/247 tests across 56 files**;
- strict TypeScript PASS;
- Worker/client production build PASS;
- preview deploy dry-run PASS;
- GitHub validate PASS;
- Cloudflare Workers Build PASS;
- Worker Version ID `f22afa01-3fc0-4008-9a27-1150750e0f12`.

This qualification includes executable research apparatus. It does **not** create a new Owner/browser Presence claim.

Recovered playable-runtime donor checkpoint remains:

`b31a851c3f708077fbf9e6fb8206fa392f8def13`

That runtime is **automated/R8-qualified donor evidence, not a fresh final qualitative Owner/browser PASS**. Its bounded runtime qualification remains 145/145 tests across 26 files plus strict build/preview/Cloudflare PASS, Worker Version ID `0e1a7e36-edba-4660-8fa2-f2b38172d760`.

Final evidence-only combined R8 PR #75, closed without merge, reached 149/149 tests across 27 files and combined R8 4/4 PASS without runtime product changes.

`main` intentionally remains the historical P0 transport checkpoint:

`f207419ee87c03979544d2d579e624f043300bbc`

The former P1 integration PR #3 is closed as historical donor evidence. The old post-readiness `experiment/e1-grounded-notice-fetch` line is non-canonical after a decisive Owner/browser FAIL; recovery deliberately restarted from the last good pre-readiness checkpoint rather than forward-merging that failed line.

## What P2-E0…P2-E12 earned

The sequence is cumulative research evidence, not twelve independent product features.

- **P2-E0 — resident causal kernel:** bounded grounded evidence, unresolved matters, scoped proposal identity, task/run provenance and simple interruption/resumption without a general belief/planner architecture.
- **P2-E1 — grounded communication seam:** one canonical spoken occurrence can project receiver-specific grounded experience without exposing a global event log as omniscient cognition.
- **P2-E2 — communication runtime ownership:** one occurrence-time communication frame can enter only the matching resident as sourced `heard` evidence while World physical truth remains separate.
- **P2-E3 — explicit semantic attribution:** the same grounded evidence identity may explicitly advance one or more matters; merely recording evidence does not itself change semantic context.
- **P2-E4 — bounded semantic context:** a selected matter/proposal can be projected into a small self-contained semantic context without raw World/E1/perception spill or uncovered dependency state.
- **P2-E5 — provider authority membrane:** model-visible input carries semantic content but not resident mutation authority; settlement remains local, identity-safe and stale-protected.
- **P2-E6 — grounded task start:** committed semantics are grounded against current World state and tied to the exact semantic revision before executor start + resident binding.
- **P2-E7 — factual task outcome:** terminal executor/World outcome returns through exact resident binding as evidence; mechanical completion does not auto-resolve semantic meaning.
- **P2-E8 — open-matter semantic continuity:** each unresolved matter may retain exactly its current semantic evidence dependency through unrelated recent-evidence churn without creating a general archive.
- **P2-E9 — semantic reconsideration hold:** an exact semantically superseded run can be mechanically held while the shared World continues; unresolved reconsideration cannot silently release it.
- **P2-E10 — suspension execution causality:** suspending one matter can pause its exact bound run while unrelated World activity continues, then resume the same run after the interrupt is terminal and the matter is explicitly resumed.
- **P2-E11 — terminal task disposition:** a terminal matter can neutrally retire its exact still-running task and release resident ownership without fabricating success, failure or World outcome; P2-E9 sidecar state is cleaned with the retired run.
- **P2-E12 — pending cognition authority lifecycle:** active `pending` means semantic authority that is still genuinely live; terminal/superseded/losing proposals are revoked immediately with bounded recent causal provenance, and dead resident authority cannot retain a meaningless provider retry path.

The detailed RED/fix/re-attack evidence is preserved in merged PRs #79 and #82–#94. Use those only when exact provenance is needed; this README is the current orientation layer.

## Durable architecture boundaries

Preserve these unless later evidence overturns them:

- `World` owns canonical physical truth, legality and factual outcomes;
- Phaser/client presentation does not become World authority;
- one logical resident continuity is distinct from any particular hosting framework;
- communication/perception evidence must remain situated and sourced;
- `A said X` is evidence that A said X, not automatic truth of X;
- semantic proposal authority is scoped to explicit dependencies, not a global World-version CAS;
- unrelated physical change does not automatically stale valid semantic meaning;
- later semantic supersession of the same matter does stale older meaning;
- semantic intention, grounded task, mechanical attempt and factual success remain distinct;
- mechanical task success does not automatically equal semantic satisfaction;
- slow semantic cognition is a proposal/reconsideration participant, not temporary ownership of the resident;
- routine mechanics should not require per-frame LLM control;
- causal provenance should be inspectable without exposing model chain-of-thought.

## Research vs playable product boundary

Most P2-E0…P2-E12 code intentionally lives under `src/research/`. Some experiments reuse or minimally extend recovered execution donors, but the campaign has **not** claimed that every research seam is already wired together into the browser runtime as the final resident architecture.

The broader playable donor is still `b31a851c...`, and its old automated qualification is not equivalent to a fresh qualitative Owner gate. A new Owner/browser gate becomes meaningful when a coherent playable Presence slice exists and the decision depends on feel, readability, continuity or usability.

## Explicitly open / unselected

The project has not yet solved or selected:

- final production resident/Mind API or hosting topology;
- the orchestration layer that composes the qualified research seams into a playable resident;
- final attention/addressedness and cognition-admission policy;
- whether/how multiple genuinely-live same-revision provider requests should be deduplicated, bounded or scheduled;
- final hearing range/channel/acoustic rules and communication UI;
- automatic matter creation, focus selection and semantic satisfaction policy;
- general belief representation;
- long-term memory/consolidation/forgetting;
- planner/BT/GOAP/HTN/skill composition architecture;
- proactive autonomy/long-horizon goals;
- pathfinding/navmesh;
- multiplayer resident hosting/concurrency;
- persistence/offscreen simulation/time scaling;
- production scaling/cost architecture;
- final live model/provider and transport integration.

Historical R5b timeout/retry, R6 sensory-buffer and R7 ingress/provider-observability work remain donors to reconsider when an earned consumer requires them. They are not an automatic repair checklist.

## Canonical spine

A fresh takeover should read:

1. `README.md` — fast orientation;
2. `docs/PROJECT_STATE.md` — current evidence, topology and open frontier;
3. `docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md` — product/problem contract;
4. `docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md` — architecture-selection decision;
5. `docs/FRESH_TAKEOVER.md` — startup mandate for continuation.

If live repository state contradicts this spine, **live evidence wins** and the contradiction should be resolved before extending strong claims or implementation.