# Pre-LLM Readiness Audit — Fresh Takeover

Status: **active discovery approaching saturation; refreshed 2026-09-06**

This is the startup mandate for a fresh Browser ChatGPT conversation taking over `Jozzpoly/Llm-Live-NPC` during the expanded **pre-LLM readiness / gap audit**.

Do **not** resume feature implementation, merge the evidence branch, weaken the known red executor assertion, or begin a repair campaign merely because takeover succeeded. The current job is to keep attacking the substrate until multiple independent passes mostly stop finding material new failure classes; only then design a dependency-aware repair campaign.

## 1. Owner intent / project role

`LLM Live NPC` is an experimental embodied-agent laboratory. The long-term question is whether an NPC can feel genuinely present in a shared world: perceive bounded local reality, preserve continuity, act through the same mechanics as the player, experience real outcomes, and eventually support richer interaction without prompts pretending that unobserved facts are known.

The current world is intentionally small and web-native. It may later act as a donor/laboratory for projects such as Multi_World, but must not be prematurely generalized into them.

Priorities now: evidence, causal correctness, debuggability, embodied substrate quality and honest boundaries. Owner hands-on judgement remains first-class for feel/readability/playability.

## 2. Verify live topology first

Repository:

`Jozzpoly/Llm-Live-NPC`

P1 integration line:

`p1/playable-world-slice`

Expected qualified P1 head:

`e453f5862286328df92db91ba2f9adabc1e7899e`

P1 PR #3 remains historical qualified substrate / OPEN DRAFT unless live state proves otherwise.

E1 experiment line:

`experiment/e1-grounded-notice-fetch`

Expected E1 head:

`9245c64474e894ac861c2529ae4919f906f106d1`

E1 PR #23 is OPEN / DRAFT / NOT MERGED pending later explicit integration decision. E1 itself has already passed its intended bounded Owner re-gate; do not repeat E1 research.

Readiness evidence line:

`evidence/pre-llm-readiness-audit`

Readiness PR #25 is OPEN / DRAFT / NOT MERGED and **must never be merged into E1 as-is**.

Latest exact execution/evidence checkpoint at this refresh:

`86bc79fafda540f34a13af00369046cf9d5b9c82`

At that checkpoint the audit branch still changes only tests, evidence workflows/config and evidence documentation relative to E1. No E1 runtime source has been modified by the audit.

If live head is later, inspect commits after this checkpoint before relying on the summary below.

## 3. Read in this order

1. this file;
2. `evidence/pre-llm/PRE_LLM_READINESS_AUDIT_LEDGER.md` — detailed classified evidence map;
3. `docs/PROJECT_STATE.md` on E1/base;
4. `docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md`;
5. `docs/FRESH_TAKEOVER.md`;
6. live PR #25 changed filenames and only the source/tests required for the next falsification question.

Do not reconstruct the project by rereading all historical branches first.

## 4. Evidence method

Evidence priority:

1. Owner judgement for feel/readability/playability;
2. exact live repo state + deterministic runtime behavior;
3. reproducing characterization tests;
4. rendered-browser evidence;
5. platform docs when platform semantics matter;
6. static review where runtime probing adds no useful discrimination.

Characterization tests intentionally PASS when they reproduce existing defects. A PASS is evidence that the behavior exists, not approval of it.

If an apparatus oracle is wrong, classify it **APPARATUS-INVALID**, fix the apparatus, then interpret the runtime. The earlier portrait-width smoke failure is the precedent: CSS correctly left 6 px padding per side; the first test expectation was wrong and was replaced by a pre/post rotation geometry oracle.

## 5. What E1 actually qualified

E1 is closed as a bounded research result:

`player-caused held→free World change`
→ bounded 220 px local projection around `npc.001`
→ explicit sampled temporal delta
→ real Workers AI / Granite `wait | fetch` intention
→ client validation/revalidation
→ deterministic executor
→ canonical `World` outcome/event
→ subsequent cognition cycle carrying the real short E1 experience
→ `wait`.

Do not overread it. E1 did **not** qualify semantic sight/FOV, hearing/speech, long-term memory, pathfinding, generic autonomy/planning, multi-NPC coordination, visual object recognition or a final model/agent architecture.

`World` remains canonical. Phaser is presentation/input. Cognition proposes bounded intentions and never directly mutates canonical world truth.

## 6. Current highest-signal proven gap clusters

The ledger is authoritative for detail. Carry these clusters forward:

### Validation / executor dynamic validity

Expanded Vitest discovery exposed a pre-existing executor contract that earlier canonical discovery skipped. When the player wins a contested target first, the executor receives `target_out_of_range` instead of the established causal expectation `target_unavailable`, can remain running and pursue the already-held target, then fail for incidental geometry.

Do not weaken this test during discovery.

### Async cognition session / attempt semantics

Proven independently:

- `cycleId` resets each arm session, enabling ABA collision between stale and fresh cycle `1`;
- stale success can finish a fresh session and overwrite provenance;
- stale rejection can contaminate a fresh arm;
- unresolved provider promise can keep E1 in-flight indefinitely;
- transport/provider failure consumes stimulus + cycle budget and does not retry unchanged state;
- a provider response with a mismatched `cycleId` likewise finishes the pending attempt before rejection, consumes a cycle, and does not retry unchanged state.

Same-session serialization itself is defended. Future repair should converge on explicit session/request identity plus explicit attempt outcome/retry semantics.

### Sampled perception is not event history

Transient real World changes can occur and return to baseline before cognition samples them. Same-tick `drop -> pickup` can generate real World events while E1 sees no later `observedChanges` and makes no provider call.

Do not feed the current diagnostic event ring directly to the model as a shortcut; current events lack event-time geometry/locality and source/task/request causation needed for honest local sensory filtering.

### Perception / embodiment consistency

- visible held-item relation can reveal the ID of an out-of-range holder;
- Worker sanitation is bounded but not independently authoritative about 220 px semantics, direction normalization, unique visible IDs or temporal consistency;
- current direction is world-space because observer facing is omitted, so E1 is not egocentric sight;
- carried-item offset can place canonical item geometry outside world bounds or inside an occluder and thereby alter cognition-visible temporal history.

### WorldSpecimen ingress integrity

Construction admits states that runtime APIs implicitly assume are valid: multiple players, duplicate semantic IDs, inconsistent ownership, inconsistent held geometry, non-finite speed, missing held referents, actor spawn inside blockers, free item outside bounds, and placement sites whose referenced support blocker exists but is spatially unrelated.

Important distinction: the **current authored specimen itself now has explicit PASS evidence** for one player, unique IDs per semantic category, finite positive scalar/geometry values, reciprocal ownership, in-bounds actor/free-item starts, free items outside blockers, and coherent current support-site topology. The root problem is the permissive ingress contract, not evidence that today's map is corrupt.

### Movement / collision hidden contract

The previous takeover frontier is resolved:

- public step duration allows `<= 0.25 s`;
- collision uses candidate endpoints, not swept movement;
- current 20 px workshop wall blocks the current actor at current speed even at 0.25 s;
- an otherwise admissible 1 px blocker is crossed by one legal 0.25 s step;
- the same thin wall blocks the normal current 30 Hz step;
- sufficiently high but finite admitted `actorSpeed` can tunnel even a current-thickness wall at normal 30 Hz.

This is a real hidden contract. Later repair must deliberately choose between validated authoring/movement-distance bounds, step contract or swept collision; do not silently turn it into a physics-engine rewrite.

### Location semantics

Locations overlap and singular location identity is first-array-match. Reordering authored zones changes semantic location at the same point. Player lifecycle events and E1 NPC location derive through different paths. Resolve semantics before durable memory/belief relies on location identity.

### Interaction / affordance / provenance

`interact(player -> npc)` is a placeholder success with no semantic World event and is asymmetric. `ExecutionDriver.playerActions` does not enforce player identity. World action/event records lack source task/request/run correlation.

A new probe importantly DEFENDS the execution substrate: `ExecutionFrameResult` retains all same-frame player attempts and the separate executor attempt. Loss occurs at `world.lastActionResult()` / current debug readout. E1 self-experience also uses `frame.executorActionResult`, so this specific debug collapse does not corrupt E1 experience.

### Public Worker / inference-cost boundary

Public unauthenticated inference surfaces are more than a theoretical CORS concern:

- E1 parses JSON before rate limiting and has no explicit small body gate;
- valid JSON in `text/plain` is accepted;
- a foreign-origin simple `text/plain` POST can reach E1 model execution even though the foreign page cannot read the response;
- a foreign-origin simple POST to historical `/api/ai/qualify` can run both model candidates when the limiter accepts it, again without needing a readable CORS response;
- limiter is abuse damping, not strict budget accounting;
- provider raw errors may be exposed;
- Worker usage exists but client/debug discards it.

Later hardening should be proportional to private-lab vs public-runtime intent. Do not build account infrastructure during discovery.

### Runtime evidence provenance

Runtime UI/health still lacks exact build/deploy fingerprint. `main` has no required status-check/ruleset gate; Cloudflare deployment success is not qualification evidence. A small build fingerprint will later materially improve correlation with Owner recordings without requiring a deployment platform.

### Manual B2 trigger lifecycle

Core executor correctly refuses replacement, but `WorldScene.startNpcFetchLanternTask()` disarms E1 before `executor.start()` and ignores the boolean result. Combined with debug-state update cadence, a small stale-button window can disarm E1 even when replacement is refused.

## 7. Strong defended/pass areas

Do not reopen without new evidence:

- `World` canonical authority and clone/read-model isolation;
- deterministic current substrate for same specimen + same inputs/task sequence;
- external movement/cardinality validation before mutation;
- explicit driver ordering;
- stable interaction tie-breaking and explicit-target no-fallback;
- current placement target bounds/blocker/site-fit checks;
- current authored specimen invariants described above;
- same-session E1 request serialization;
- E1 self-experience uses the frame's executor result rather than collapsed global last action;
- current `WorldScene` bounds incoming render delta to 100 ms, preventing an unbounded fixed-step catch-up storm;
- mobile capability/hybrid input and cancellation behavior in current page-lifetime runtime;
- no chosen soft-reset/remount path exists today, so missing global mobile-listener teardown is an unknown tied to a future lifecycle requirement, not a demonstrated current failure;
- rendered desktop/narrow/mobile/orientation-roundtrip shell evidence;
- high-severity dependency audit;
- bounded Worker request sanitation/tool decoding;
- TypeScript strict mode;
- no proven user-visible bundle performance failure;
- pinned Wrangler compatibility date/bindings/rate-limit config;
- no committed runtime credentials found in audited config paths.

## 8. Deliberately missing — not debt by absence

Do not implement merely because absent:

- pathfinding/navmesh/general obstacle solving;
- full actor-actor collision gameplay system;
- hearing/speech;
- long-term/episodic memory;
- generic planner/GOAP/behavior tree;
- multi-NPC coordination;
- persistence/save system;
- final map-authoring pipeline;
- final conversation UI;
- final model choice;
- large-scale spatial indexing;
- generic OpenTelemetry/observability platform.

## 9. Exact current validation fingerprint

At `86bc79fafda540f34a13af00369046cf9d5b9c82`:

- expanded Vitest: **134 PASS / 1 FAIL** across **135 tests / 27 files**;
- only FAIL remains `src/execution/deterministic-executor.test.ts` / contested-target contract: expected `target_unavailable`, received `target_out_of_range`;
- `Readiness World Evidence`: **PASS**;
- `Readiness Worker Boundary Evidence`: **PASS**;
- `Readiness Browser Evidence`: **PASS**;
- `Readiness Dependency Evidence`: **PASS**.

The last exact Cloudflare preview explicitly verified before the final saturation probes was on the same unchanged E1 runtime/evidence line and PASSed; re-check live if deployment provenance is needed. Do not infer runtime qualification from deployment success alone.

## 10. Discovery saturation status

Discovery is **approaching**, not yet declared at, saturation.

The last genuinely new material class was the cross-origin inference invocation/cost surface. Subsequent independent passes across different axes produced mostly:

- spawn-integrity findings that reinforce WorldSpecimen ingress root cause;
- frame-observability evidence that localizes loss to debug/readout rather than the execution frame;
- current-authored-specimen PASS evidence separating healthy current content from permissive ingress;
- mismatched-response behavior reinforcing the existing cognition attempt/retry root cause.

This pattern is the first strong saturation signal. Do not use a predefined checklist as the stopping rule. Continue a small number of genuinely independent broad passes; stop discovery only when new passes mostly produce PASS, duplicate/root-cause reinforcement, deliberately missing future capability, or low-value speculation.

If another material new class appears, keep auditing.

## 11. What happens after discovery — not yet started

When saturation is genuinely established:

1. freeze/classify the evidence map;
2. design a dependency-aware bounded repair campaign rather than a pile of isolated patches;
3. repair foundational/root-cause contracts first;
4. restore clean full validation rather than weakening evidence;
5. re-attack the repaired substrate with independent falsification;
6. run rendered/browser/deployment evidence where relevant;
7. use Owner judgement for the surfaces that require feel/readability/playability;
8. only then make E1 integration/closure and next-agent-layer decisions.

No new heavy LLM/agent layer before that sequence is complete.

## 12. Takeover behavior

A fresh assistant should:

- verify live refs instead of trusting copied SHAs;
- read this file and the ledger before broad repo archaeology;
- distinguish current authored specimen health from arbitrary admitted states;
- distinguish runtime defects from apparatus defects and future capability absence;
- use direct bounded probes where cheap;
- keep claims narrower than evidence;
- update the evidence docs when the classification map materially changes;
- not ask Owner to restate the project if live repo evidence already provides the context;
- continue autonomously after a short command such as `kontynuuj`, `działaj` or `rozszerz audyt`.
