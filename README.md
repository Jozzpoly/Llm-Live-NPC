# LLM Live NPC

Experimental web laboratory for embodied LLM-driven NPCs.

Core research question:

> Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

## Current state

Three evidence layers now exist and must not be conflated.

### P0 — model transport: qualified

GitHub → Cloudflare deployment, Workers AI through AI Gateway, usage/log correlation and a replaceable model transport seam were proven with live tests.

`@cf/ibm-granite/granite-4.0-h-micro` and `@cf/meta/llama-3.2-3b-instruct` both produced usable bounded completions through the same transport seam. Earlier `@cf/zai-org/glm-4.7-flash` probes remain negative evidence. **No final NPC model is selected.**

`main` intentionally remains this proven P0 baseline until later integration is deliberate.

### P1 — pre-cognition world/execution substrate: qualified

Canonical line: `p1/playable-world-slice` at `e453f5862286328df92db91ba2f9adabc1e7899e`.

P1 contains:

- project-owned TypeScript `World` truth;
- a small top-down settlement specimen with collision, locations, items and semantic events;
- fixed-step movement with interpolated Phaser presentation;
- desktop/mobile human control and direct target interaction;
- canonical actor facing and world-owned placement validation;
- deterministic non-LLM NPC execution shared by browser runtime and headless evidence;
- Owner-qualified embodied pickup through the same validated World action substrate used by the player;
- explicit execution/debug provenance and bounded runtime failure state.

P1 itself does **not** qualify autonomous cognition, NPC sight/hearing, pathfinding or conversation.

### E1 — Grounded Notice → Fetch: qualified at its bounded stop boundary

Active integration/closure branch: `experiment/e1-grounded-notice-fetch`, draft PR #23 against P1.

E1 is the first real vertical cognition experiment:

`World change → bounded local perception → explicit temporal perceptual delta → real Granite wait|fetch intention → validated existing executor → World outcome → next cognition cycle with real prior experience`

The final Owner re-gate passed the intended two-cycle Lantern scenario:

1. player-held Lantern becomes free inside NPC-local perception;
2. E1 derives `holder player.jozz → free`;
3. Granite proposes `fetch(item.lantern)`;
4. NPC-001 picks it up through the existing executor/World path;
5. the next cycle receives `picked_up_item`, NPC-held state and `holder free → npc.001`;
6. Granite settles to `wait`.

This qualifies only that narrow loop. It does **not** qualify semantic sight, long-term memory, general planning, autonomous goals, pathfinding, speech/hearing, multiple NPCs or a final agent architecture.

See [`docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md`](docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md) for the exact contract, recovered Workers AI/Granite quirks, falsification history and evidence boundary.

## Technical-debt closure before the next research stage

After the E1 Owner re-gate, the project was deliberately held for a bounded debt campaign instead of immediately adding features. Owner testing exposed quality gaps that domain tests had not caught, especially in shell/UI and provenance.

Repairs on the E1 branch include:

- fixed viewport shell: no giant blank game region or document/debug scroll coupling on desktop;
- independent Debug Workspace scroll and explicit narrow/mobile layout contracts;
- live `E1 cognition armed/disarmed` shell status instead of stale `cognition disabled` text;
- `/api/health` stage provenance aligned with the E1 preview runtime;
- executor refuses silent replacement of a running task;
- E1 checks executor start acceptance before claiming an accepted fetch;
- manual B2 debug trigger is disabled while the executor is running and reports actual executor state rather than an inferred button acknowledgement;
- regression coverage for held-item wake cadence and executor task replacement.

The next research stage must not begin until the current debt/continuity campaign is closed and the final preview has passed its focused smoke.

## Architectural boundary

Target loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

Current strongest proven vertical slice:

`player-caused World change → E1 bounded perception + delta → Granite intention → DeterministicExecutor → ExecutionDriver → World.attemptAction(...) → World outcome/event → E1 prior experience → next Granite intention`

Phaser is presentation/input infrastructure, not canonical world truth. Cognition proposes bounded intentions; it does not mutate positions, inventory or events directly.

## Canonical project spine

1. [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — current live truth, evidence boundaries, architecture and frontier;
2. [`docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md`](docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md) — qualified E1 experiment/evidence;
3. [`docs/FRESH_TAKEOVER.md`](docs/FRESH_TAKEOVER.md) — startup mandate for a new conversation.

## Infrastructure contract

- `main` remains the production P0 source of truth until integration is intentional.
- `p1/playable-world-slice` is the qualified P1 substrate line.
- `experiment/e1-grounded-notice-fetch` / PR #23 carries the qualified E1 vertical slice and current debt closure.
- Cloudflare Worker serves laboratory previews and APIs.
- Workers AI is routed through AI Gateway for observability.
- `/api/ai/qualify` remains historical P0 transport evidence; it is not the NPC cognition architecture.
- E1 cognition uses same-origin `POST /api/agent/e1/decide` on E1 builds.
- Vite 8 + official Cloudflare Vite plugin drive builds.
- `package-lock.json` is committed and CI uses locked installation.
- non-production branches receive exact Cloudflare preview builds for Owner testing.

## Current production vs preview endpoints

Production `main` remains P0:

- `/` — production P0 laboratory;
- `/api/health` — Worker/AI-binding readiness for that deployed branch;
- `/api/ai/qualify` — fixed-input transport qualification;
- `/api/ai/smoke` — retired GLM smoke route (`410 Gone`).

E1 preview additionally exposes:

- `/api/agent/e1/decide` — sanitized bounded E1 cognition endpoint.

Production laboratory:

`https://llm-live-npc.jozzpoly.workers.dev`

P1/E1 URLs must be taken from the exact current Cloudflare commit build rather than copied from an old handoff.

## Toolchain

Current bounded versions:

- Node `22`;
- Phaser `4.2.1`;
- Vite `8.2.2`;
- Cloudflare Vite plugin `1.54.3`;
- Wrangler `4.129.0`;
- TypeScript `7.0.2`;
- Vitest `5.0.0`.

Useful commands after dependencies are installed:

```bash
npm run check
npm run preview
npm run deploy
npm run deploy:preview
```

`deploy:preview` is self-contained: it builds before `wrangler versions upload`, preventing non-production Workers Builds from uploading an input config before Vite has generated deployment assets/configuration.

## Next work

Do **not** restart P1 or E1.

Immediate frontier is closure quality, not another feature:

1. finish the bounded technical-debt/continuity campaign on PR #23;
2. run final automated + exact-deployment validation;
3. perform only the focused Owner smoke needed to validate repaired shell/provenance behavior;
4. then make an explicit integration/closure decision for E1;
5. only after that, critically choose the next research question from the new evidence rather than automatically expanding E1 into a generic agent framework.
