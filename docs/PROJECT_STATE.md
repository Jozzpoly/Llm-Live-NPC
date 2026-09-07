# LLM Live NPC — Project State

Updated: 2026-09-07

## Core question

Can an LLM-driven NPC become a believable resident of a game world by receiving bounded local evidence, preserving causal continuity, and acting only through validated world mechanics rather than directly mutating world truth?

Target loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

`World` remains authoritative about what exists, what can be attempted and what actually happened. Perception is derived from World truth. Cognition proposes bounded intentions; it does not directly mutate positions, inventory, semantic events or executor internals.

## Live stage topology

### P0 — historical model-transport baseline

`main` intentionally remains the proven P0 cloud/model-transport line.

P0 proved GitHub → Cloudflare deployment, Worker/static assets, Workers AI through AI Gateway, usage/log correlation and replaceable model transport. Granite 4.0 H Micro and Llama 3.2 3B Instruct both produced usable bounded completions. Earlier GLM probes remain negative evidence. **No final NPC model is selected.**

### P1 — historical qualified pre-cognition substrate

Branch:

`p1/playable-world-slice`

Qualified head:

`e453f5862286328df92db91ba2f9adabc1e7899e`

P1 PR #3 remains the historical integration record.

P1 qualified project-owned World truth, fixed-step movement, interpolated Phaser presentation, desktop/mobile controls, direct targeting, actor facing, placement validation, semantic actions/events and the deterministic non-LLM executor through a shared `ExecutionDriver`.

P1 does not qualify autonomous cognition, long-term memory, sight/hearing, pathfinding or conversation.

### E1 — qualified + readiness-repaired embodied cognition slice

Branch:

`experiment/e1-grounded-notice-fetch`

Final repaired runtime checkpoint before documentation-only closure:

`7cc7bbde976963372ac590a8ad91518493ac76c1`

Historical E1 PR #23 is **closed without merge**. This is the explicit topology decision: P1 remains preserved as the pre-cognition stage; E1 remains the qualified/repaired cognition experiment line and current best substrate for a later deliberately chosen phase.

E1 originally qualified this exact real-model causal loop:

`player-caused held→free World change → bounded local perception + temporal evidence → Granite wait|fetch intention → client validation/revalidation → deterministic executor → validated World pickup → short real execution experience → subsequent Granite cycle`

The final Owner re-gate with Lantern completed `drop → fetch → NPC pickup → experience-bearing next cycle → wait` with independent World/executor/model/Gateway provenance.

This is a real embodied vertical-loop PASS, not a claim of general intelligence or final agent architecture.

Historical experiment evidence remains in [`E1_GROUNDED_NOTICE_FETCH_DESIGN.md`](E1_GROUNDED_NOTICE_FETCH_DESIGN.md). The live post-readiness runtime is broader and must be understood from this document + live code/tests.

## Expanded pre-LLM readiness campaign — CLOSED

After E1 qualified, Owner explicitly froze feature expansion and requested a much wider falsification/readiness audit before heavier agent logic. Temporary PR #25 characterized gaps and was never merged. The audit reached saturation; material findings were then repaired in dependency order through independent PRs.

### R0/R1 — validation truth + causal interaction/executor legality — PR #26

- Vitest discovery now includes all `src/**/*.test.ts` rather than omitting execution tests.
- explicit non-mutating `World.validateInteraction()` is the shared interaction legality contract;
- semantic target invalidity is resolved before incidental geometry;
- executor consumes World interaction legality instead of owning a separate approach-range contract;
- contested target ownership fails causally rather than continuing pursuit;
- `ExecutionDriver.playerActions` enforces canonical player identity.

### R2 — WorldSpecimen ingress integrity — PR #27

Construction rejects invalid scalar/geometry/reference/identity/ownership/topology states before canonical runtime mutation. Current specimen assumptions are therefore checked rather than discovered after stepping.

### R3 — spatial/embodiment semantics — PRs #28–#30

- movement uses deterministic swept static-blocker collision under the public step-duration contract, closing thin-wall/high-speed tunnelling;
- held-item canonical locality is co-located with the holder while decorative carry offset is presentation-derived;
- E1/World therefore no longer lose ownership history because visual carry geometry enters a wall/outside bounds;
- singular location identity uses explicit finite authored `priority`, independent of array order; ambiguous equal-priority overlaps are rejected.

### R4 — provenance / debug truth — PRs #31–#33

- browser debug retains a bounded ordered history of all execution-frame atomic attempts with `player | executor` source rather than collapsing truth to `World.lastActionResult()`;
- manual `Fetch lantern` starts before lifecycle side effects and cannot disarm E1 when executor start is refused;
- runtime exposes exact repository build commit/branch and native Worker Version ID in `/api/health` and the Debug Workspace fingerprint.

### R5 — cognition async lifecycle — PRs #34–#35

- each arm session and logical request has separate monotonic page-lifetime identity;
- stale completion/rejection cannot mutate a later re-arm session even when `cycleId` restarts at 1;
- provider attempts have a default 12 s timeout and cancellation seam;
- one logical cognition request has at most two provider attempts;
- retry does not consume another cognition-cycle budget slot;
- disarm/re-arm aborts the active attempt and invalidates its ownership;
- explicit non-retryable responses such as 429 stop immediately.

### R6 — sensory foundation — PRs #37–#39

- perceived `direction` is observer-body-relative rather than world-space; range/LOS remain unchanged;
- geometric LOS is still only an occlusion primitive, not qualified sight/FOV;
- successful frame-local semantic item actions preserve exact post-action occurrence snapshots before later actions overwrite state;
- same-frame `drop → pickup` can therefore produce two cognition-visible holder transitions even when final sampled state returns to baseline;
- only already-localized semantic changes enter the session-local sensory buffer; raw global events/snapshots are not journaled for cognition;
- pending local sensory evidence survives `inFlight`, cooldown and executor-busy periods;
- request delivery is bounded to 32 observed changes and reports explicit `observedChangesDropped` overflow;
- current sampled reconciliation facts receive capacity before older buffered event history;
- disarm/re-arm clears session-local sensory history.

This is bounded sensory continuity, not event sourcing or long-term memory.

### R7 — Worker/public laboratory boundary — PRs #41–#42

R7a:

- E1 accepts only POST + `application/json`;
- explicit browser `Sec-Fetch-Site: cross-site` requests are rejected before limiter/body access;
- raw request body is bounded to 96 KiB;
- declared oversize fails before limiter/body consumption;
- otherwise the rate limiter runs before actual stream consumption/parsing;
- unknown-length streams are incrementally bounded;
- a maximally populated legal current E1 request fits under the 96 KiB bound;
- historical `/api/ai/qualify` is retired on E1 as `410 Gone` and `/api/health` no longer advertises it.

This is browser/cost abuse damping, **not authentication**. Direct non-browser clients can still construct requests; the Cloudflare rate limiter remains abuse damping rather than globally exact accounting.

R7b:

- raw provider exceptions remain internal to Worker observability and public responses use stable external error codes/messages;
- provider usage is reduced to bounded known fields: prompt/completion/total tokens + neurons;
- browser errors/successes retain model/Gateway/latency/usage provenance when available;
- usage is retained per provider attempt so a failed attempt is not hidden by a later retry success;
- Debug Workspace exposes compact per-attempt model usage.

## Final readiness validation

Final repaired runtime checkpoint:

`7cc7bbde976963372ac590a8ad91518493ac76c1`

Evidence:

- strict TypeScript: PASS;
- final repair-head Vitest: **167 / 167 PASS across 29 files**;
- Vite production build: PASS;
- self-contained preview dry-run: PASS;
- final E1 merge-head GitHub validation: PASS;
- final E1 merge-head Cloudflare Workers Build: PASS;
- final E1 Worker Version ID: `1cd90a41-a1ea-4677-8cff-4162bf97f84d`.

Temporary audit PR #25, R6 characterization PR #36 and R7 characterization PR #40 are closed without merge. E1 PR #23 is also closed without merge after the explicit topology decision above.

## Architecture/contracts to preserve

### Authority

`human/controller adapters → continuous control + atomic requests → World authority → snapshots/events/outcomes → presentation/perception`

Phaser is presentation/camera/input infrastructure. `World` owns canonical truth.

### Execution

Keep separate:

1. continuous actor control;
2. atomic validated World actions;
3. durative task execution;
4. semantic World events / frame-local semantic occurrences;
5. self/action outcomes;
6. bounded perception evidence;
7. cognition/intention policy.

Current executor is still direct approach-and-interact. Obstacle geometry may make a task fail; that is bounded failure behavior, not pathfinding.

### Cognition

`World truth → bounded local projection / bounded temporal evidence → sanitized Worker request → Granite bounded intention → client revalidation → deterministic executor → World outcome → subsequent experience`

The model does not receive raw global snapshots/blocker lists/global event logs and cannot directly mutate canonical gameplay state.

## Deliberately missing / not debt by absence alone

Do not infer or automatically implement:

- semantic visual recognition, FOV or final attention architecture;
- hearing/speech propagation;
- long-term/episodic memory or belief revision;
- generalized pathfinding/navmesh;
- full actor-actor collision gameplay semantics;
- generic behavior trees/GOAP/planning framework;
- open-ended goals/autonomy;
- multi-NPC coordination;
- persistence/save format;
- final conversation UI;
- final placement UX/system;
- final map authoring pipeline;
- final model choice;
- large-scale spatial indexing;
- generic observability platform;
- full account/auth/product infrastructure for the current private laboratory.

A later bounded experiment may establish one of these as a prerequisite. Absence alone is not present technical debt.

## Residual bounded observations / decisions — do not silently call them repaired

The readiness campaign repaired the selected material runtime/foundation clusters, but several lower-priority or policy-level observations remain deliberately outside those repairs:

- `main`/stage branches have historically lacked strong branch-protection/required-check governance; deployment success is not itself qualification evidence. Treat repository governance as an explicit release/integration decision if/when the project topology changes.
- actor-body separation/collision semantics remain intentionally unqualified.
- a future soft reset/remount contract is not selected; page-lifetime singleton listeners are acceptable only under the current page-lifetime runtime assumption.
- Node is pinned to major `22`, not an exact patch; this is a bounded reproducibility choice, not a demonstrated runtime defect.
- disarmed E1 still performs some tiny current-specimen projection/read work; no evidence justifies a large optimization or spatial-indexing campaign.

Do not let these notes become an excuse for open-ended cleanup. Reproduce a material failure or establish a concrete next-stage prerequisite first.

## Owner judgement worth preserving

- real player ↔ NPC ↔ world interaction is more valuable than prompt-only roleplay;
- small functioning experiments should precede broad architectures;
- current world size/readability is sufficient for the research laboratory;
- mobile remains a useful real Owner-test surface;
- direct mouse/touch targeting is useful and qualified;
- interpolation materially improved movement feel;
- debugging should answer who acted, through which system, with what causal result and provenance;
- apparently small rendered-runtime/UI defects matter because they affect the Owner evidence loop;
- negative evidence and apparatus-invalid failures should be preserved rather than papered over.

## Repository / workflow state

Validation contract:

- Node 22;
- locked `npm ci --ignore-scripts --no-audit --no-fund`;
- `npm run check` = TypeScript + full Vitest discovery + Vite build;
- `npm run deploy:preview -- --dry-run` verifies the self-contained preview path;
- Cloudflare branch builds provide exact preview deployments and native Worker Version Metadata.

Historical/temporary branches may remain. They are not canonical merely because they exist.

## Closed evidence — do not repeat mechanically

Closed:

- P0 transport qualification;
- P1 refoundation/Owner B2 qualification;
- E1 Grounded Notice → Fetch research result;
- E1 first Owner partial-pass recovery and final Owner re-gate;
- expanded pre-LLM readiness characterization;
- R0–R7 bounded repair campaign.

Reopen a closed cluster only if new live evidence reproduces a material failure under the current runtime.

## Immediate frontier for the next conversation

There is **no preselected next implementation stage** in this closure.

A fresh conversation should:

1. verify live `experiment/e1-grounded-notice-fetch` and ensure changes after runtime checkpoint `7cc7bbde...` are documentation-only;
2. read the canonical spine;
3. confirm there are no unexpectedly open repair/evidence PRs or failing final checks;
4. recover Owner intent and critically choose the next bounded embodied-agent research uncertainty from the repaired substrate;
5. define its falsification criterion before implementation.

Do not restart the readiness campaign merely because old evidence branches exist, and do not automatically jump to a generic LLM-agent framework.

## Working method

`live regrounding → identify uncertainty → bounded experiment → implement only what evidence justifies → self-review → automated/runtime validation → focused Owner gate → integrate/close → refresh canonical state`

Owner hands-on judgement remains first-class evidence for feel, readability, believability and rendered-runtime quality. Automated tests establish narrower implementation/invariant claims.
