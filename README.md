# LLM Live NPC

Experimental web laboratory for embodied LLM-driven NPCs.

Core research question:

> Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

## Current state

P0 Cloudflare infrastructure is proven live. Two bounded `@cf/zai-org/glm-4.7-flash` probes reached Workers AI through AI Gateway but exhausted their completion budgets on reasoning before producing visible content. The active work is now a small **model transport qualification**, not further GLM tuning and not game-stack implementation.

Canonical compact state and evidence: [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).

## P0 infrastructure contract

- GitHub `main` is production source of truth.
- Cloudflare Worker serves the laboratory and API.
- Static assets are served by Workers Static Assets.
- Workers AI is available through the `AI` binding.
- AI requests are routed through Cloudflare AI Gateway using the `default` gateway for observability.
- AI probe endpoints are infrastructure evidence, not the NPC cognition architecture.
- Game/render/physics architecture remains intentionally uncommitted until P0 closes.

## Endpoints

- `/` — bootstrap / qualification laboratory page
- `/api/health` — Worker/AI-binding readiness
- `/api/ai/qualify` — fixed-input two-model transport qualification
- `/api/ai/smoke` — retired GLM smoke route (`410 Gone` on the qualification branch)

Production laboratory:

`https://llm-live-npc.jozzpoly.workers.dev`

## Active P0 candidates

The qualification branch compares:

- `@cf/ibm-granite/granite-4.0-h-micro`
- `@cf/meta/llama-3.2-3b-instruct`

These are **transport candidates**, not a final NPC-model selection.

## Toolchain

Current top-level versions:

- Node `22`;
- Wrangler `4.129.0`;
- TypeScript `7.0.2`.

Useful commands after dependencies are installed:

```bash
npm run check
npm run preview
npm run deploy
```

## Cloudflare Git build settings

For the current zero-build bootstrap:

- Build command: leave empty
- Deploy command: `npx wrangler deploy`
- Production branch: `main`
- non-production branch builds: enabled

Cloudflare Workers Builds uses the Wrangler version declared in `package.json` when present. A committed dependency lockfile remains desirable before the project grows beyond this bootstrap.
