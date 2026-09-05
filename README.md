# LLM Live NPC

Experimental web laboratory for embodied LLM-driven NPCs.

Current bootstrap goal: prove the infrastructure path before choosing the game/render/physics stack.

## P0 infrastructure contract

- GitHub `main` is the source of truth.
- Cloudflare Worker serves the laboratory and API.
- Static assets are served by Workers Static Assets.
- Workers AI is available through the `AI` binding.
- AI requests are routed through Cloudflare AI Gateway using the `default` gateway for observability.
- The current AI endpoint is only a smoke probe; it is not the NPC cognition architecture.

## Endpoints

- `/` — bootstrap laboratory page
- `/api/health` — Worker/AI-binding readiness
- `/api/ai/smoke` — bounded Workers AI smoke request

## Current model probe

`@cf/zai-org/glm-4.7-flash`

This is a replaceable bootstrap choice, not a canonical project model.

## Cloudflare Git build settings

For the current zero-build bootstrap:

- Build command: leave empty
- Deploy command: `npx wrangler deploy`
- Production branch: `main`

The project will move to a pinned Vite/TypeScript client toolchain once the first game-world stack is selected.
