# LLM Live NPC

Experimental web laboratory for embodied LLM-driven NPCs.

Core research question:

> Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

## Current state

**P0 is qualified.** GitHub → Cloudflare deployment, Workers AI through AI Gateway, usage/log correlation and a replaceable model transport seam have been proven with live Owner tests.

`@cf/ibm-granite/granite-4.0-h-micro` and `@cf/meta/llama-3.2-3b-instruct` both produced usable bounded completions through the same transport seam. Earlier `@cf/zai-org/glm-4.7-flash` probes are retained as negative evidence. **No final NPC model is selected.**

**P1 pre-cognition refoundation is now closed as a qualified substrate.** The P1 integration line contains:

- project-owned TypeScript `World` truth;
- a small top-down settlement specimen with collision, locations, items and semantic events;
- fixed-step movement with interpolated Phaser presentation;
- desktop/mobile human control and direct target interaction;
- canonical actor facing;
- world-owned placement target validation;
- a deterministic non-LLM NPC executor shared by browser runtime and headless evidence;
- an Owner-qualified embodied task in which NPC-001 approaches and picks up the lantern through the same validated World action substrate used by the player;
- explicit execution/debug provenance and bounded runtime failure state.

P1 still has **no autonomous cognition, NPC sight/hearing, pathfinding or final conversation system**. Integration PR #3 therefore remains draft and `main` intentionally remains the proven P0 baseline while the next phase is designed from the P1 branch.

Canonical project spine:

1. [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — current truth, evidence boundaries, architecture and frontier;
2. [`docs/FRESH_TAKEOVER.md`](docs/FRESH_TAKEOVER.md) — startup mandate for a new conversation.

## Architectural boundary

Target loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

Current proven lower substrate:

`human/scripted task → ExecutionDriver → World movement + World.attemptAction(...) → World outcome/event → presentation/debug evidence`

Phaser is presentation/input infrastructure, not canonical world truth. Future cognition should propose bounded intentions/tasks rather than mutate positions, inventory or events directly.

## Infrastructure contract

- GitHub `main` remains the production P0 source of truth until P1 is intentionally integrated.
- `p1/playable-world-slice` is the canonical pre-cognition refoundation/integration line.
- Cloudflare Worker serves the laboratory and API.
- Workers AI is available through the `AI` binding and routed through AI Gateway for observability.
- AI probe endpoints are transport evidence, not the NPC cognition architecture.
- P1 uses Vite 8 + the official Cloudflare Vite plugin.
- `package-lock.json` is committed and CI uses locked installation.
- Non-production branches receive Cloudflare preview builds for Owner testing.

## Current endpoints

Production remains the P0 qualification laboratory until P1 is deliberately integrated:

- `/` — production P0 laboratory;
- `/api/health` — Worker/AI-binding readiness;
- `/api/ai/qualify` — fixed-input two-model transport qualification;
- `/api/ai/smoke` — retired GLM smoke route (`410 Gone`).

Production laboratory:

`https://llm-live-npc.jozzpoly.workers.dev`

P1 and experiment URLs should be taken from the exact current Cloudflare branch/commit build rather than copied from an old handoff.

## P1 toolchain

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

`deploy:preview` is intentionally self-contained: it performs the Vite build before `wrangler versions upload`, so non-production Workers Builds cannot accidentally upload the input Wrangler config before Vite has generated deployment assets/configuration.

## Cloudflare Git build settings

Current intended settings:

- Production branch: `main`;
- Build command: `npm run build --if-present`;
- Production deploy command: `npx wrangler deploy`;
- Version command (non-production): `npm run deploy:preview`;
- non-production branch builds: enabled;
- Root directory: `/`.

The root `wrangler.jsonc` intentionally leaves `assets.directory` to the official Vite plugin output configuration. Do not add a hard-coded build directory merely to make a pre-build `wrangler versions upload` accept the input config.

## Next work

Do not restart closed P1 substrate stages. A fresh takeover should verify live P1 + PR #3, read the canonical spine, and then design the smallest useful experiment toward a grounded loop such as:

`WORLD → bounded NPC perception → limited LLM intention → existing deterministic executor → validated WORLD result`

The exact first perception/cognition slice is intentionally **not frozen** in this README; it should be selected from fresh evidence and the Owner's research goal.