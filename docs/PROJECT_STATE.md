# LLM Live NPC — Project State

Updated: 2026-09-05

## Current question

Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

## Current stage

**P0 — infrastructure bootstrap / hardening.**

Do not treat the current page or AI smoke endpoint as the game architecture or NPC cognition architecture. Their job is to establish a small, observable, replaceable path from browser to Cloudflare-hosted inference before the world stack is selected.

## Verified evidence

### P0-A1 — GitHub → Cloudflare deployment

Production source at the time of the first deployment:

`b4e5879d89f810d91bd48b2eaf6491bb5ae2fac3`

Cloudflare deployment completed successfully on 2026-09-05 and exposed:

`https://llm-live-npc.jozzpoly.workers.dev`

Deployment evidence showed:

- static asset upload succeeded;
- Worker upload succeeded;
- Worker startup time reported as 4 ms;
- `env.AI` binding was present;
- Workers.dev route was active.

### P0-A2 — first real Workers AI call

Owner ran the browser smoke probe against production.

Observed response:

- model: `@cf/zai-org/glm-4.7-flash`;
- AI Gateway id: `default`;
- measured endpoint latency: `1426 ms`;
- prompt tokens: `40`;
- completion tokens: `96`;
- total tokens: `136`;
- Workers AI usage: `3.7144 neurons`;
- model completion id: `chatcmpl-8433ddd841c1f754`;
- `env.AI.run()` returned a real model completion through the configured Gateway path.

The model spent the entire 96-token completion budget on reasoning and returned no user-facing content. `finish_reason` was `length`.

**Interpretation:** infrastructure inference is proven; usable completion at the original 96-token apparatus is not. This is an apparatus finding, not evidence that the model or Cloudflare path failed.

## Current hardening branch

`bootstrap/p0-hardening`

Purpose:

- keep working production `main` untouched while P0 apparatus is corrected;
- pin the basic toolchain instead of implicitly downloading the newest Wrangler on every deployment;
- make Workers.dev / preview / observability settings explicit;
- record Gateway log IDs and metadata for future correlation with the NPC Inspector;
- distinguish `inferenceReached` from `usableCompletion`;
- use low reasoning effort and a larger bounded completion budget for the smoke probe.

## Known unknowns / unproven claims

- A second smoke run has not yet shown a usable natural-language completion with the hardened request budget.
- The corresponding AI Gateway log has not yet been manually inspected in the Cloudflare dashboard.
- Cloudflare Access protection state is not recorded here.
- No game/render/physics stack has been accepted.
- No NPC perception, memory, action grammar, world simulation, multiplayer, database, or persistence implementation exists yet.
- The bootstrap model is a replaceable probe, not the selected NPC model.

## Active boundary

Finish P0 hardening before adding the game stack.

Natural P0 closure requires:

1. pinned/declarative bootstrap toolchain deploys successfully;
2. health endpoint remains healthy;
3. one hardened Workers AI request returns a usable completion without truncating on reasoning;
4. request exposes a Gateway log ID and usage data;
5. Gateway observability is confirmed once in the dashboard or equivalent API evidence.

After that, move immediately to a bounded **P1 world-stack qualification** and first playable world slice. Do not expand P0 into production backend architecture.

## Durable working hypothesis

Keep these boundaries explicit until evidence overturns them:

`WORLD → PERCEPTION → NPC COGNITION/MEMORY → INTENTION → VALIDATED EXECUTION → WORLD`

The LLM may propose intent. The game world remains authoritative about what exists, what the NPC can perceive, whether an action is legal/possible, and what actually happened.
