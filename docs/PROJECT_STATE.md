# LLM Live NPC — Project State

Updated: 2026-09-05

## Core research question

Can a lightweight LLM-driven NPC become a believable resident of a game world by receiving bounded perception, maintaining its own experience/beliefs, and acting only through validated world affordances rather than directly mutating world truth?

Durable boundary:

`WORLD → PERCEPTION → NPC COGNITION/MEMORY → INTENTION → VALIDATED EXECUTION → WORLD`

The LLM may propose intent. The game world remains authoritative about what exists, what an NPC can perceive, whether an action is legal/possible, and what actually happened.

## Current stage

**P1 — domain-first playable world slice. Active, not yet Owner-qualified.**

Active branch:

`p1/playable-world-slice`

Draft PR:

`#3 — Build P1 domain-first playable world slice`

P1 exists to establish a small, inspectable world with its own truth before autonomous LLM cognition is added.

## P0 closure — PASS

Canonical P0 production main after model-transport qualification:

`f207419ee87c03979544d2d579e624f043300bbc`

Cloudflare production version:

`2e71d9e8-67fc-4398-9e08-63c43083903e`

P0 proved:

- GitHub → Cloudflare deployment works;
- Worker + Static Assets work;
- `env.AI` reaches Workers AI through AI Gateway;
- usage/neuron accounting is observable;
- Gateway log IDs are exposed for correlation;
- the transport seam can normalize at least two real Workers AI response shapes;
- a model can be replaced without changing the project’s world/cognition contract.

Important negative evidence retained:

- `@cf/zai-org/glm-4.7-flash` exhausted a 96-token completion budget on reasoning and returned no visible content;
- a second Owner run with `reasoning_effort=low` and a 256-token completion budget again ended `finishReason=length`, with `content=null`, latency `2905 ms`, and `9.5769 neurons`;
- this falsified GLM as a sensible trivial transport probe, not GLM as a model in general.

P0 transport qualification then passed 2/2 candidates in one Owner run:

### Granite 4.0 H Micro

- model: `@cf/ibm-granite/granite-4.0-h-micro`;
- latency: `1637 ms`;
- total tokens: `63`;
- usage: `0.17467461 neurons`;
- output shape: `openai-choices`;
- Gateway log: `01M1RTZ2CGW4E9CRD1KXPTHT1G`;
- usable completion: **PASS**.

### Llama 3.2 3B Instruct

- model: `@cf/meta/llama-3.2-3b-instruct`;
- latency: `162 ms`;
- total tokens: `90`;
- usage: `0.7781149744987488 neurons`;
- output shape: `workers-ai-response`;
- Gateway log: `01M1RTZ3Y63M16N8C5M8Y5ZYGB`;
- usable completion: **PASS**.

These numbers are transport evidence only. They do not select the final NPC model.

## P1 current implementation

### Stack boundary

Current bounded choice:

- TypeScript;
- Vite 8;
- official Cloudflare Vite plugin;
- Phaser 4.2.1 for rendering, camera and browser input;
- independent project-owned `World` domain for canonical state;
- Vitest for pure domain tests.

No Phaser Arcade Physics and no Box2D are used in P1. Physics remains an open later qualification, to be added only if it buys meaningful player ↔ NPC ↔ world interaction.

Phaser is deliberately not canonical world state:

`browser input → World.step() → WorldSnapshot → Phaser presentation`

The renderer never directly mutates entity truth.

### World specimen

The current authored slice is approximately `1440 × 900` and contains:

- named locations: Common Yard, Workshop, Cottage, Grove, North Path;
- player `Jozz`;
- static `NPC-001` shell;
- hammer, red mug and lantern;
- authored walls, doorway gaps, a table and trees;
- movement and collision owned by the World domain;
- pickup/drop owned by the World domain;
- semantic event history;
- deterministic line-of-sight derived from authored occluders;
- interaction range constrained by both distance and world LOS;
- fixed-step world simulation at 30 Hz, decoupled from browser render cadence;
- queued E/Q edge inputs so interaction events are not lost between render frames and fixed world steps.

### World Inspector

The P1 browser shell exposes:

- world tick;
- player position;
- current named location;
- held item;
- NPC → player line-of-sight state;
- NPC distance;
- recent semantic world events;
- visual NPC/player LOS line and debug radius.

LLM cognition is explicitly disabled in P1.

## P1 automated evidence

The first P1 implementation exposed and corrected two apparatus/code issues before Owner testing:

1. strict TypeScript caught a nullable DOM-root closure;
2. Vitest initially inherited the Cloudflare Vite plugin and tried to start a remote AI proxy in CI. A separate pure-node `vitest.config.ts` now keeps domain tests independent from Cloudflare credentials/runtime.

After correction, CI proved:

- locked dependency install with `npm ci` — **PASS**;
- strict TypeScript — **PASS**;
- domain determinism — **PASS**;
- authored collision boundary — **PASS**;
- pickup/drop authoritative events — **PASS**;
- workshop doorway LOS — **PASS**;
- no pickup through an occluding wall — **PASS**;
- Vite Worker build — **PASS**;
- Vite client build — **PASS**.

Current client bundle observation: approximately `1.39 MB` minified / `362 kB gzip`, dominated by the full Phaser runtime. This is a non-blocking P1 optimization signal, not yet a reason to optimize or change renderer.

## Toolchain hardening completed during P1

P1 is the first real client toolchain, so the earlier dependency reproducibility debt was resolved here:

- `package-lock.json` is committed (npm lockfile v3);
- CI uses `npm ci` rather than unconstrained `npm install`;
- Node remains pinned to major `22`;
- top-level packages remain exact-version pinned;
- GitHub Actions use current Node24-based `actions/checkout@v6` and `actions/setup-node@v6`.

## Current deployment blocker — configuration, not application

Cloudflare non-production preview currently fails before serving P1 because the Worker project still has the P0 Workers Builds configuration:

- Build command: blank;
- Deploy command: `npx wrangler deploy`.

The Cloudflare Vite plugin requires `vite build` to run first so it can create the generated output `wrangler.json` that points at the client build artifacts.

The intended migration is a dashboard-only build setting:

`Build command = npm run build --if-present`

Keep the existing Deploy command:

`npx wrangler deploy`

Why `--if-present`: it is backward-compatible with the already-deployed P0 main, which has no `build` script, while the P1 branch does have `build = vite build`.

Do not add application-side build hacks to work around this Cloudflare setting.

## P1 closure contract

P1 is not closed and PR #3 must not merge until:

1. locked CI remains green — **PROVEN**;
2. Cloudflare non-production preview serves the actual Vite/Phaser P1 client — **OPEN, dashboard build command needed**;
3. Owner can enter the preview and move around the authored world — **OPEN**;
4. authored blockers visibly constrain movement — **OPEN Owner runtime evidence**;
5. Owner can pick up/drop at least one object and see semantic events change — **OPEN**;
6. NPC LOS visibly changes across an occluder/doorway and agrees with the inspector — **OPEN**;
7. no runtime evidence contradicts the domain-world/presentation boundary — **OPEN**.

Natural boundary after a P1 PASS: review Owner feedback before adding LLM cognition. Do not mechanically proceed to P2 if the world itself is too weak, awkward or poorly inspectable to support meaningful embodied-agent experiments.

## Remaining non-blocking foundation debt

- generated Wrangler binding/runtime types are not yet canonicalized;
- the fixed public AI qualification endpoint still has only a lightweight Cloudflare rate limiter, not hard auth/global budget enforcement;
- Cloudflare Access state is not canonicalized;
- no persistence/database/multiplayer exists;
- no final model selection exists.

Do not let these expand P1 unless hands-on evidence makes one of them necessary.
