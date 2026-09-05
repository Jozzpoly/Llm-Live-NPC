# LLM Live NPC

Experimental web laboratory for embodied LLM-driven NPCs.

Core research question:

> Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

## Current state

**P0 is qualified.** GitHub → Cloudflare deployment, Workers AI through AI Gateway, usage/log correlation, and a replaceable two-shape model transport seam have all been proven with live Owner tests.

Two early `@cf/zai-org/glm-4.7-flash` probes are retained as negative evidence: the model exhausted 96- and 256-token completion budgets on reasoning without visible content. A bounded follow-up qualification then produced usable completions from both `@cf/ibm-granite/granite-4.0-h-micro` and `@cf/meta/llama-3.2-3b-instruct` through the same transport seam.

This **does not select the final NPC model**.

**P1 is active and not yet Owner-qualified.** The current branch contains the first domain-first playable world slice: a small top-down settlement, independent TypeScript `World` truth, authored collision/locations, pickup/drop, semantic events, deterministic LOS, a static NPC shell, and a Phaser presentation/inspection layer. Autonomous LLM cognition remains disabled until the world itself passes hands-on review.

Canonical compact state and evidence: [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).

## Architectural boundary

The durable project boundary remains:

`WORLD → PERCEPTION → NPC COGNITION/MEMORY → INTENTION → VALIDATED EXECUTION → WORLD`

P1 additionally enforces:

`browser input → World.step() → WorldSnapshot → Phaser presentation`

Phaser is presentation/input infrastructure, not canonical world truth.

## Infrastructure contract

- GitHub `main` is production source of truth.
- Cloudflare Worker serves the laboratory and API.
- Workers AI is available through the `AI` binding and routed through AI Gateway for observability.
- AI probe endpoints are infrastructure evidence, not the NPC cognition architecture.
- The model seam remains replaceable; Granite/Llama qualification is not a canonical model decision.
- P1 uses Vite 8 + the official Cloudflare Vite plugin.
- `package-lock.json` is committed and CI uses `npm ci`.

## Current endpoints

- `/` — production currently serves the P0 qualification laboratory until P1 is Owner-qualified and merged
- `/api/health` — Worker/AI-binding readiness
- `/api/ai/qualify` — fixed-input two-model transport qualification
- `/api/ai/smoke` — retired GLM smoke route (`410 Gone`)

Production laboratory:

`https://llm-live-npc.jozzpoly.workers.dev`

## Qualified P0 transport candidates

- `@cf/ibm-granite/granite-4.0-h-micro`
- `@cf/meta/llama-3.2-3b-instruct`

Both returned usable completions through AI Gateway in the same bounded Owner qualification run. See `docs/PROJECT_STATE.md` for exact latency, token, neuron and Gateway-log evidence.

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

`deploy:preview` is intentionally self-contained: it performs the Vite build before `wrangler versions upload`, so non-production Workers Builds cannot accidentally upload the input Wrangler config before Vite has generated the deployment config/assets.

## Cloudflare Git build settings

Current intended settings:

- Production branch: `main`
- Build command: `npm run build --if-present`
- Production deploy command: `npx wrangler deploy`
- Version command (non-production): `npm run deploy:preview`
- non-production branch builds: enabled
- Root directory: `/`

The P1 root `wrangler.jsonc` intentionally leaves `assets.directory` to the official Vite plugin output configuration. Do not add a hard-coded build directory merely to make a pre-build `wrangler versions upload` accept the input config.
