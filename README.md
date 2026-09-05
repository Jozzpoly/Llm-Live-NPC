# LLM Live NPC

Experimental web laboratory for embodied LLM-driven NPCs.

Core research question:

> Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

## Current state

**P0 is qualified.** GitHub → Cloudflare deployment, Workers AI through AI Gateway, usage/log correlation, and a replaceable two-shape model transport seam have all been proven with live Owner tests.

Two early `@cf/zai-org/glm-4.7-flash` probes were deliberately retained as negative evidence: the model exhausted 96- and 256-token completion budgets on reasoning without visible content. A bounded follow-up qualification then produced usable completions from both `@cf/ibm-granite/granite-4.0-h-micro` and `@cf/meta/llama-3.2-3b-instruct` through the same transport seam.

This **does not select the final NPC model**. The next stage is P1: establish a small playable top-down world with independent domain truth and an inspectable event stream before autonomous cognition is added.

Canonical compact state and evidence: [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).

## Infrastructure contract

- GitHub `main` is production source of truth.
- Cloudflare Worker serves the laboratory and API.
- Static assets are served by Workers Static Assets.
- Workers AI is available through the `AI` binding.
- AI requests are routed through Cloudflare AI Gateway using the `default` gateway for observability.
- AI probe endpoints are infrastructure evidence, not the NPC cognition architecture.
- The model seam remains replaceable; Granite/Llama qualification is not a canonical model decision.

## Current endpoints

- `/` — bootstrap / qualification laboratory page
- `/api/health` — Worker/AI-binding readiness
- `/api/ai/qualify` — fixed-input two-model transport qualification
- `/api/ai/smoke` — retired GLM smoke route (`410 Gone`)

Production laboratory:

`https://llm-live-npc.jozzpoly.workers.dev`

## Qualified P0 transport candidates

- `@cf/ibm-granite/granite-4.0-h-micro`
- `@cf/meta/llama-3.2-3b-instruct`

Both returned usable completions through AI Gateway in the same bounded Owner qualification run. See `docs/PROJECT_STATE.md` for exact latency, token, neuron and Gateway-log evidence.

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

A committed dependency lockfile and generated Wrangler runtime/binding types are known foundation debt and should be addressed just-in-time as P1 introduces the real client toolchain.
