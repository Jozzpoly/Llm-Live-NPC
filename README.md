# LLM Live NPC

Experimental web laboratory for embodied LLM-driven NPCs.

Core research question:

> Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

## Current state

P0 infrastructure is live on Cloudflare. The first production deployment and first real Workers AI call both succeeded at the infrastructure level. The initial 96-token model probe exhausted its completion budget on reasoning before producing visible content, so P0 is now being hardened rather than prematurely expanded into the game stack.

Canonical compact state and evidence: [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).

## P0 infrastructure contract

- GitHub `main` is production source of truth.
- Cloudflare Worker serves the laboratory and API.
- Static assets are served by Workers Static Assets.
- Workers AI is available through the `AI` binding.
- AI requests are routed through Cloudflare AI Gateway using the `default` gateway for observability.
- The AI endpoint is an infrastructure probe, not the NPC cognition architecture.
- Game/render/physics architecture remains intentionally uncommitted until P0 closes.

## Endpoints

- `/` — bootstrap laboratory page
- `/api/health` — Worker/AI-binding readiness
- `/api/ai/smoke` — bounded Workers AI smoke request

Production laboratory:

`https://llm-live-npc.jozzpoly.workers.dev`

## Current model probe

`@cf/zai-org/glm-4.7-flash`

This is a replaceable bootstrap choice, not a canonical project model.

## Toolchain

The hardening branch pins:

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

Cloudflare Workers Builds uses the Wrangler version declared in `package.json` when present. A generated dependency lockfile remains desirable before the project grows beyond this bootstrap.
