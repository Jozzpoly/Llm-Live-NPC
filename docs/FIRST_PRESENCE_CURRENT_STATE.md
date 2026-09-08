# First Presence — Current State

Updated: 2026-09-08

This file is the compact live checkpoint for the product-adjacent Presence composition work. It does **not** replace the historical evidence in `PROJECT_STATE.md`, Pass-1/Pass-2 contracts or merged PR discussions. Where older project-state prose still describes the P2-E12 frontier, this newer live checkpoint plus repository history wins.

## Human state

We are no longer only proving isolated pieces of an NPC mind.

The project has crossed into the first stage where those pieces are being composed into **one continuous resident process**.

The resident can now, in a bounded deterministic specimen:

1. hear grounded player speech;
2. explicitly turn selected evidence into a still-live matter;
3. reconsider the meaning of that matter without giving model output World authority;
4. ground the current semantic course into a local mechanical task;
5. execute through the canonical World/executor path;
6. record factual task outcome without pretending that mechanical success automatically resolves semantic meaning;
7. receive later grounded speech relevant to the same matter;
8. change the semantic direction of that still-live matter;
9. retire only the exact old task that the newer decision has made obsolete;
10. start a replacement task from the newer semantic revision while preserving the same matter's continuity.

Concrete qualified scenario:

> `Bring me the red mug.` → NPC starts the Red-mug task → `Actually, bring me the blue mug.` → same matter changes meaning → old Red run is retired without fake outcome → new Blue task starts → NPC ends holding the Blue mug; Red mug remains untouched.

That is still far from a living NPC, but it is materially different from a sequence of disconnected prompt-response experiments: **meaning can now change an action already in progress without resetting the whole unresolved consequence.**

## Canonical line

Current canonical/refoundation branch:

`recovery/owner-fail-2026-09-07`

Current canonical head at this checkpoint:

`ba9710d9983c79ef7af3a451c527d07bc4881be5`

Latest canonical composition merge:

- PR #112 — `First Presence — mid-task semantic replacement`
- qualified candidate head: `fd632f8ad8b46f42ead66257e67fb4d7991e84a9`
- merge commit: `ba9710d9983c79ef7af3a451c527d07bc4881be5`

Previous first composition:

- PR #109 — `First Presence composition — explicit request to factual World outcome`
- candidate head: `77882f4defa0aa45561d617b31bb871f1ce97542`
- canonical merge: `c7f66fe8cd4cd28e6259d5e8548ff0b9d3aca82f`

Research substrate immediately beneath the composition line includes canonical P2-E17 provider-attempt abandonment at:

`7a0c16f1f85f3dc0a6be463bd3d7ea612057ef18`

## Latest exact qualification

PR #112 final candidate `fd632f8ad8b46f42ead66257e67fb4d7991e84a9`:

- **67/67 test files PASS**;
- **277/277 tests PASS**;
- superseded-task disposition: 3/3 PASS;
- full Red→Blue First Presence vertical composition: 1/1 PASS;
- previous First Presence composition: 3/3 PASS;
- strict TypeScript PASS;
- Worker production build PASS;
- client production build PASS;
- Wrangler preview dry-run PASS;
- GitHub validate run `34281424180`: completed / success;
- Cloudflare Workers Build: completed / success;
- Cloudflare Version ID `4e7d829a-294c-4cb4-b380-73f2bfec8575`.

The evidence-only precursor PR #111 was deliberately closed without merge after proving the missing replacement operation against the previous canonical composition:

- head `aa88a04ad74683fbaf1d72e1a909260cdeeb62e0`;
- 66/66 files, 274/274 tests PASS;
- it established that P2-E9 could hold the obsolete run, while P2-E6 correctly could not start a replacement and P2-E11 correctly could not retire a non-terminal matter's task.

## Current composition boundary

`FirstPresenceComposition` currently preserves several explicit separations.

### Hearing is not matter admission

Grounded speech may enter resident evidence without automatically becoming an unresolved matter.

The caller explicitly chooses whether evidence opens a new matter.

### New evidence is not automatically relevant to an existing matter

The caller explicitly chooses when grounded evidence advances a matter's semantic context.

This protects unrelated experience from globally rewriting intention.

### New evidence is not yet a new decision

Merely advancing semantic context does not authorize destruction of the old task.

Superseded-task disposition requires a specific **applied semantic decision** whose semantic state still exactly matches the current matter.

### Mechanical task success is not semantic satisfaction

World/executor outcome returns as factual resident evidence.

The matter remains semantically open until a later explicit policy/cognition step resolves or cancels it.

### Retiring an obsolete task is not task failure

When a newer current semantic decision makes an older run obsolete, the exact run can be retired without manufacturing `task_outcome` evidence and without terminalizing the matter.

The same matter can then ground a replacement task from its current semantic revision.

### Composition does not own the World clock

The browser/headless runtime owns the canonical `ExecutionDriver`.

Presence composition only consumes completed `ExecutionFrameResult` values for factual outcome reconciliation, avoiding a second simulation clock.

### Model transport is still deliberately deterministic

These first composition slices use a synchronous deterministic semantic provider stub.

Live/async provider latency, timeouts, retry/backpressure and production transport are **not** yet selected by this composition.

## Current owner-level trace

The bounded composition trace can currently express:

`experience → semantic_commit → task_started → [later experience → semantic_commit → task_superseded → replacement task_started] → task_outcome`

This is causal provenance for debugging/explanation. It is not chain-of-thought, general event sourcing or final long-term memory.

## Still not earned

Do not infer that the following are solved:

- live LLM/provider transport;
- async inference while the World keeps advancing;
- automatic decision whether a changed intention should resume, replace or cancel its old task;
- automatic matter admission, attention, focus or priority;
- semantic satisfaction/resolution policy;
- ambiguity/clarification policy;
- long-term/episodic memory;
- final Resident/Mind API;
- browser-facing Presence UI/debugging;
- multi-NPC society;
- persistence/offscreen simulation;
- production provider routing/cost/scaling;
- fresh broad Owner/browser Presence PASS.

The old 2026-09-07 qualitative Owner failure remains valid negative evidence. These new composition slices do not silently erase it.

## Immediate frontier

The next high-value falsification should stay close to the newly composed behavior rather than jumping directly to live model variance.

Current-best candidate:

> **deterministic asynchronous reconsideration under real elapsed World time**

Target scenario:

1. NPC is already executing a task;
2. new grounded evidence changes the same matter's semantic context;
3. the exact old run is held while semantic inference remains deliberately pending;
4. player/World time continues through the same canonical execution driver;
5. the pending provider attempt either returns, fails or is abandoned without leaking authority;
6. a current applied decision explicitly selects the next mechanical disposition;
7. the old run may be resumed or retired/replaced without fabricating World outcomes.

Why this is the next useful step:

The current synchronous specimen proves **semantic replacement logic**, but it cannot expose timing bugs because reconsideration has no real pending interval. Before adding an actual LLM, a deterministic deferred provider can test the ownership problem created by real latency without adding model nondeterminism, cost or transport noise.

This frontier is a hypothesis, not an automatic commitment. Re-check live canonical state and attack the boundary before implementation.

## Owner-quality boundary

A new broad Owner/browser test becomes meaningful only when enough of this composition reaches a coherent playable Presence slice that feel, readability, continuity or usability can be judged directly.

Until then:

- automated causal evidence is necessary;
- it is not a substitute for the later Owner test;
- playable integration should become more important as soon as it can falsify more than another isolated headless micro-probe.

## Recommended fresh continuation

For a fresh continuation of the current work:

1. verify live `recovery/owner-fail-2026-09-07` head;
2. read `docs/FIRST_PRESENCE_CURRENT_STATE.md`;
3. read `docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md` and `docs/LIVE_NPC_PASS2_ARCHITECTURE_DECISION.md` only as needed for durable boundaries;
4. inspect PR #109 and #112 when exact composition evidence is needed;
5. inspect closed evidence-only PR #111 when the replacement gap's negative proof matters;
6. treat older `PROJECT_STATE.md` frontier prose as historical where it conflicts with this live checkpoint;
7. prefer the next product-adjacent falsification over restarting the old P2 numbering by inertia.

Live repository evidence always wins over this document if the branch advances further.
