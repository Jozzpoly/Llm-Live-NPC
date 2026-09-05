# LLM Live NPC — Project State

Updated: 2026-09-05

## Current question

Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

## Current stage

**P0 — infrastructure + replaceable model transport qualified. Ready to close and move to P1.**

Do not treat the current page, probe endpoint, or any probe model as the game architecture or NPC cognition architecture. P0 only establishes a small, observable, replaceable Cloudflare inference seam before the world stack is selected.

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

The second run also proved that the Worker can expose a non-null AI Gateway log id for correlation.

### P0-B1 — two-model transport qualification PASS

Branch:

`experiment/p0-model-transport-qualification`

Validated automatically before Owner test:

- GitHub CI PASS on head `fa8673b389d736cd3f193c3117b87d0bd20c0007`;
- strict TypeScript compile PASS;
- Wrangler dry-run PASS;
- Cloudflare non-production preview deployment PASS.

Owner then ran exactly one bounded qualification action on the branch preview. Both free Cloudflare-hosted candidates produced usable completions through the same Worker + AI Gateway path and through two different response shapes.

#### IBM Granite 4.0 H Micro

- model: `@cf/ibm-granite/granite-4.0-h-micro`;
- `inferenceReached = true`;
- `usableCompletion = true`;
- Gateway log id: `01M1RTZ2CGW4E9CRD1KXPTHT1G`;
- latency: `1637 ms`;
- output shape: `openai-choices`;
- content: `LLM Live NPC cognition is online.`;
- finish reason: `stop`;
- prompt tokens: `54`;
- completion tokens: `9`;
- total tokens: `63`;
- usage: `0.17467461 neurons`.

#### Meta Llama 3.2 3B Instruct

- model: `@cf/meta/llama-3.2-3b-instruct`;
- `inferenceReached = true`;
- `usableCompletion = true`;
- Gateway log id: `01M1RTZ3Y63M16N8C5M8Y5ZYGB`;
- latency: `162 ms`;
- output shape: `workers-ai-response`;
- content: `LLM Live NPC cognition is now online and ready for testing.`;
- finish reason: `stop`;
- prompt tokens: `76`;
- completion tokens: `14`;
- total tokens: `90`;
- usage: `0.7781149744987488 neurons`.

**Interpretation:** the replaceable inference seam is qualified. The normalizer handled both native Workers AI `{response}` and OpenAI-like `{choices}` output shapes. This is not a final NPC-model benchmark. Llama's much lower observed latency is a useful hypothesis-generating signal only; the workloads were trivial and not yet representative of NPC cognition.

A short Owner screen recording additionally confirmed the expected branch-preview UI state, the single qualification action, and the resulting two-model PASS. The binary recording is not stored in the repository; the structured result and Gateway identifiers are the canonical evidence.

## Critical review correction

The previous work was directionally useful but contained two important process/architecture errors:

1. PR #1 was merged after CI + preview validation but **before** the hardened runtime inference had been Owner-tested. That was premature relative to the stated P0 closure contract.
2. The result normalizer was described as model/provider-neutral but actually only understood an OpenAI-like `choices[0].message.content` shape. Several native Workers AI models instead return `{ response, usage, tool_calls }`. Changing models without fixing this could have produced a false FAIL.

Both issues are corrected by P0-B1: runtime Owner evidence precedes merge, and the transport normalizer now handles the two response shapes actually observed in qualification.

## Remaining foundation debt

- exact top-level tool versions are pinned, but there is not yet a committed dependency lockfile;
- the public rate limiter is a lightweight abuse guard, not hard authentication or a strict global budget cap;
- Cloudflare Access state is not canonicalized;
- generated Wrangler binding/runtime types are not yet part of the TypeScript contract.

These are real debts but **do not block P0 closure**. They should be addressed just-in-time as P1 introduces the real client toolchain and before any public general-purpose cognition endpoint exists.

## P0 closure contract

1. production Cloudflare deployment path is healthy — **PROVEN**;
2. real Workers AI inference through AI Gateway is reachable — **PROVEN**;
3. usage and Gateway correlation are observable — **PROVEN**;
4. at least one free Cloudflare-hosted candidate returns a usable bounded completion through the normalized seam — **PROVEN, two candidates PASS**;
5. the qualification branch passes CI + Cloudflare preview before promotion — **PROVEN**.

**P0 closure decision: PASS.**

Do not require GLM-4.7-Flash specifically to pass P0. Do not promote Granite or Llama to canonical NPC model based on this transport probe.

## Next stage — P1 playable world slice

Move immediately to a bounded first playable world slice. P1 must establish a small world with its own domain truth before adding autonomous cognition.

P1 should preserve these boundaries:

- renderer/input are presentation and control layers, not canonical world state;
- world entities and events exist independently of the renderer;
- the world can emit a small event stream that later becomes raw material for perception;
- at least one player, one NPC shell, several world objects, obstacles/occlusion, and named locations exist;
- the slice is large enough to create distance, visibility changes and object-history situations, but small enough for rapid Owner experimentation;
- no vector memory, multiplayer, long-term database, final model selection, or large agent framework is added in P1.

Natural P1 boundary: Owner can enter the web build, move through a small top-down place, interact with a few objects, and inspect a deterministic/debuggable world/event state even with LLM cognition disabled.

## Durable working hypothesis

Keep these boundaries explicit until evidence overturns them:

`WORLD → PERCEPTION → NPC COGNITION/MEMORY → INTENTION → VALIDATED EXECUTION → WORLD`

The LLM may propose intent. The game world remains authoritative about what exists, what the NPC can perceive, whether an action is legal/possible, and what actually happened.
