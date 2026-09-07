# LLM Live NPC

Experimental web laboratory for embodied LLM-driven NPCs.

Core research question:

> Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded local evidence, preserving causal continuity, and acting only through validated world mechanics rather than directly mutating world truth?

## Current state

The first three project layers are now closed evidence and should not be conflated.

### P0 — model transport: qualified

`main` remains the historical production/model-transport baseline. It proved GitHub → Cloudflare deployment, Workers AI through AI Gateway, usage/log correlation and replaceable model transport. Granite 4.0 H Micro and Llama 3.2 3B Instruct both produced usable bounded completions; no final NPC model is selected.

### P1 — pre-cognition substrate: qualified and preserved

Canonical historical branch:

`p1/playable-world-slice` at `e453f5862286328df92db91ba2f9adabc1e7899e`

P1 qualified project-owned `World` truth, fixed-step movement, presentation interpolation, desktop/mobile input, direct interaction, actor facing, placement validation and deterministic non-LLM NPC execution through the same World legality used by the player.

P1 is intentionally retained as the historical pre-cognition substrate rather than being rewritten by later experiments.

### E1 — Grounded Notice → Fetch: qualified, readiness-repaired, closed

Canonical E1 line:

`experiment/e1-grounded-notice-fetch`

Final repaired runtime checkpoint before documentation-only handoff closure:

`7cc7bbde976963372ac590a8ad91518493ac76c1`

Historical E1 PR #23 is **closed without merge**. This is deliberate: E1 is a qualified experiment/repaired research line, while P1 remains the preserved pre-cognition stage.

E1 originally qualified this bounded real-model loop:

`player-caused held→free World change → bounded local evidence → Granite wait|fetch intention → client revalidation → deterministic executor → canonical World outcome → subsequent experience-bearing cognition cycle`

The final Owner re-gate with Lantern completed fetch → pickup → real execution experience → wait with inspectable World/executor/model/Gateway provenance.

That research claim remains deliberately narrow. It does not establish general sight, long-term memory, pathfinding, speech/hearing, generic autonomy/planning, multi-NPC architecture or a final model/agent architecture.

## Expanded pre-LLM readiness campaign — closed

After E1 qualified, feature work was frozen for a broad readiness/gap audit. Temporary evidence PR #25 characterized material gaps and was **closed without merge** after independent repairs landed.

The bounded repair sequence was:

- #26 — R0/R1 validation truth + causal interaction/executor legality;
- #27 — R2 WorldSpecimen ingress integrity;
- #28 — R3a swept static-blocker movement;
- #29 — R3b held-item canonical locality separated from presentation attachment;
- #30 — R3c explicit priority-based location identity;
- #31–#33 — R4 action/debug truth, manual trigger lifecycle and exact build provenance;
- #34–#35 — R5 cognition session/request identity, timeout/cancellation and bounded retries;
- #37–#39 — R6 egocentric perception + frame-local semantic occurrences + bounded sensory delivery;
- #41–#42 — R7 bounded inference ingress, qualifier retirement, stable provider errors and per-attempt model-usage provenance.

Evidence-only PRs #36 and #40 were also closed without merge after their findings were repaired independently.

Final runtime validation at `7cc7bbde...`:

- strict TypeScript: PASS;
- final repair-head Vitest: **167 / 167 PASS across 29 files**;
- Vite production build: PASS;
- self-contained preview dry-run: PASS;
- final E1 merge-head GitHub validation: PASS;
- final E1 merge-head Cloudflare Workers Build: PASS;
- final E1 Worker Version ID: `1cd90a41-a1ea-4677-8cff-4162bf97f84d`.

## Current important contracts

- `World` owns canonical entities, movement legality, interaction legality and semantic outcomes.
- Phaser owns presentation/camera/input, not world truth.
- cognition receives bounded World-derived evidence and proposes only bounded intentions.
- deterministic execution translates accepted intentions into actor controls + validated World actions.
- explicit interaction legality is shared between World and executor.
- current movement uses deterministic swept static-blocker collision under the public step-duration contract.
- held items are canonically co-located with their holder; decorative carry offset is presentation-only.
- singular location identity uses explicit authored priority rather than array order.
- E1 perceived direction is observer-body-relative; geometric LOS remains only an occlusion primitive, not qualified sight.
- event-time item ownership occurrences can survive same-frame state reversal and temporary cognition unavailability through a bounded local sensory buffer; this is not event sourcing or long-term memory.
- cognition requests have page-lifetime session/request identity, 12 s attempt timeout and at most two provider attempts per logical request.
- E1 Worker ingress requires JSON, rejects explicit cross-site browser requests, bounds raw body size to 96 KiB, rate-limits before body parsing and no longer exposes the historical two-model `/api/ai/qualify` route.
- provider exceptions use stable external errors; bounded Workers AI usage remains inspectable per provider attempt.
- runtime debug exposes exact build commit / Worker version provenance.

## Canonical project spine

Read in this order:

1. [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — current authority, repair closure and remaining boundaries;
2. [`docs/FRESH_TAKEOVER.md`](docs/FRESH_TAKEOVER.md) — exact startup mandate for a new conversation;
3. [`docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md`](docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md) — historical E1 qualification evidence and original bounded research contract.

The E1 design document is evidence for the experiment that was actually qualified; use `PROJECT_STATE.md` + live code for the post-readiness repaired runtime semantics.

## Infrastructure

- `main` remains historical P0 production/model-transport truth.
- `p1/playable-world-slice` remains historical qualified P1.
- `experiment/e1-grounded-notice-fetch` is the qualified + readiness-repaired E1 research line and current best substrate for future work unless a later explicit integration decision changes topology.
- E1 cognition uses same-origin browser `POST /api/agent/e1/decide` with bounded Worker ingress.
- `/api/ai/qualify` is retired on E1 (`410 Gone`); P0 transport qualification remains historical evidence.
- Vite + Cloudflare Worker/Workers AI/AI Gateway remain the current laboratory stack.
- exact branch preview URLs should be recovered from the current Cloudflare build rather than copied from old handoffs.

## Deliberately missing / not debt by absence alone

Do not automatically implement generalized pathfinding/navmesh, actor-actor collision gameplay semantics, hearing/speech, long-term memory, generic planner/behavior-tree infrastructure, multi-NPC coordination, persistence, final conversation UI, final model choice, a large authoring pipeline, generic observability infrastructure or full account/auth product systems merely because they do not yet exist.

A future stage may require one of them, but it must begin from a concrete research uncertainty and falsification criterion.

## Next work

Do **not** restart P1, E1 or the R0–R7 readiness campaign.

The next conversation should first verify that changes after runtime checkpoint `7cc7bbde...` are documentation-only, recover the canonical spine, inspect live repository/PR state, and then choose the **next bounded embodied-agent research uncertainty**. Before committing to a major new layer, distinguish deliberately missing future capabilities, low-priority governance choices and any newly reproduced current defect.

No next experiment is preselected by this README.
