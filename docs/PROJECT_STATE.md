# LLM Live NPC — Project State

Updated: 2026-09-05

## Current question

Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

## Current stage

**P0 — infrastructure proven; model transport qualification active.**

Do not treat the current page, probe endpoint, or any probe model as the game architecture or NPC cognition architecture. Their job is to establish a small, observable, replaceable Cloudflare inference seam before the world stack is selected.

## Verified evidence

### P0-A1 — GitHub → Cloudflare deployment

First production source:

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

Owner ran the first browser probe against production using `@cf/zai-org/glm-4.7-flash`.

Observed response:

- AI Gateway id: `default`;
- latency: `1426 ms`;
- prompt tokens: `40`;
- completion tokens: `96`;
- total tokens: `136`;
- Workers AI usage: `3.7144 neurons`;
- completion id: `chatcmpl-8433ddd841c1f754`;
- `env.AI.run()` returned a real completion through the configured Gateway path.

The model spent the entire 96-token completion budget on reasoning, returned no user-facing content, and ended with `finish_reason = length`.

**Interpretation:** end-to-end infrastructure inference was proven. A usable completion was not.

### P0-A3 — hardening deploy / CI

PR #1 hardened the bootstrap and was merged to production `main` as:

`33cc674776ba714605ac8bd6926ed0b6bbdc3599`

Verified before/after merge:

- Node 22 + pinned Wrangler `4.129.0` + TypeScript `7.0.2` installed successfully in GitHub Actions;
- strict TypeScript compile passed;
- `wrangler deploy --dry-run` passed;
- dry-run saw both `env.AI` and the rate-limit binding;
- Cloudflare non-production preview deploy passed;
- Cloudflare production deploy passed;
- production Cloudflare version: `fb603f00-b34c-4f0e-82e3-7468a7d01528`.

The public probe was changed from arbitrary user input to fixed input and protected with a lightweight Cloudflare rate limiter.

### P0-A4 — second GLM probe falsified the proposed budget fix

Owner ran the hardened production probe with `reasoning_effort = low` and `max_completion_tokens = 256`.

Observed:

- model: `@cf/zai-org/glm-4.7-flash`;
- Gateway log id: `01M1RTDY9FB4ZZV0K4WQ3X9PH8`;
- latency: `2905 ms`;
- prompt tokens: `47`;
- completion tokens: `256`;
- total tokens: `303`;
- usage: `9.5769 neurons`;
- reasoning characters observed: `1004`;
- `content = null`;
- `finishReason = length`.

**Interpretation:** the hypothesis that low reasoning effort plus a 256-token budget would make GLM-4.7-Flash a suitable bounded completion probe is falsified. This does not establish that GLM is generally unusable; it establishes that continuing to tune this reasoning model for a trivial transport smoke is poor apparatus design.

The second run also proves that the Worker can expose a non-null AI Gateway log id for correlation.

## Critical review correction

The previous work was directionally useful but contained two important process/architecture errors:

1. PR #1 was merged after CI + preview validation but **before** the hardened runtime inference had been Owner-tested. That was premature relative to the stated P0 closure contract.
2. The result normalizer was described as model/provider-neutral but actually only understood an OpenAI-like `choices[0].message.content` shape. Several native Workers AI models instead return `{ response, usage, tool_calls }`. Changing models without fixing this could have produced a false FAIL.

Additional remaining debt:

- exact top-level tool versions are pinned, but there is not yet a committed dependency lockfile;
- the public rate limiter is a lightweight abuse guard, not hard authentication or a strict global budget cap;
- Cloudflare Access state is not canonicalized;
- generated Wrangler binding/runtime types are not yet part of the TypeScript contract.

These are foundation debts, but none should be allowed to turn P0 into a production-backend project.

## Active experiment — P0-B model transport qualification

Branch:

`experiment/p0-model-transport-qualification`

Goal: prove a usable fixed-input completion through the same Worker + Gateway path without tuning a reasoning-heavy model.

Bounded candidates:

- `@cf/ibm-granite/granite-4.0-h-micro` — non-reasoning, function calling, low unit cost;
- `@cf/meta/llama-3.2-3b-instruct` — non-reasoning, small multilingual instruct model with structured-output support.

The probe:

- uses one fixed prompt;
- runs both candidates sequentially in one Owner action;
- normalizes both native Workers AI `{response}` and OpenAI-like `{choices}` output shapes;
- captures latency, usage, output shape and Gateway log id per candidate;
- does **not** select the final NPC model.

## P0 closure contract

P0 may close when all of the following are true:

1. production Cloudflare deployment path is healthy — **PROVEN**;
2. real Workers AI inference through AI Gateway is reachable — **PROVEN**;
3. usage and Gateway correlation are observable — **PROVEN at response/log-id level**;
4. at least one free Cloudflare-hosted candidate returns a usable bounded completion through the normalized seam — **OPEN**;
5. the current qualification branch passes CI + Cloudflare preview before promotion — **OPEN**.

Do not require GLM-4.7-Flash specifically to pass P0.

## After P0

Move immediately to a bounded **P1 playable world slice**. Do not expand P0 into production auth, persistence, multiplayer, vector memory, or final model benchmarking.

The next world slice should preserve a clean domain boundary so rendering is not the source of world truth.

## Durable working hypothesis

Keep these boundaries explicit until evidence overturns them:

`WORLD → PERCEPTION → NPC COGNITION/MEMORY → INTENTION → VALIDATED EXECUTION → WORLD`

The LLM may propose intent. The game world remains authoritative about what exists, what the NPC can perceive, whether an action is legal/possible, and what actually happened.
