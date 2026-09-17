# SPC Next — Architecture Recovery Gate

Status: **STOP-THE-LINE RECOVERY GATE**  
Applies to: `refoundation/spc-next-five-resident-world` / draft PR #125  
Grounded against: `daad9c72e3da936fb35c6183c8bedadb63084108` and preserved First Presence / P2 / Living / World donor evidence.

This is not a final architecture specification. It is the minimum recovery contract that must be satisfied before this refoundation can be described as a credible living-SPC foundation or promoted toward an Owner living-world gate.

## 0. Executive verdict

SPC Next contains valuable new foundations, especially around one authoritative World clock, multi-resident locality, private resident state, event-time causality, spatial indexing, deterministic World phases, desired-vs-resolved motion and strict worker-side context validation.

However, the current executable resident-life architecture is materially behind both the Owner target **and several already-earned prior research invariants**.

The branch must therefore remain a draft research/refoundation line.

**Current qualification:**

> **CAUSAL / MULTI-RESIDENT SUBSTRATE PARTIALLY DEFENDED · RESIDENT CONTINUITY KERNEL REGRESSED / INCOMPLETE · LIVE END-TO-END SPC NOT CONNECTED · NOT OWNER-LIVING-WORLD READY**

The next campaign is not feature expansion. It is architecture recovery.

## 1. Protected assets — do not discard without contrary evidence

These current SPC Next directions are valuable and should be preserved unless a stronger experiment falsifies them:

- one authoritative World clock for all actors;
- World owns physical truth and outcomes;
- resident-private runtime/mind state;
- causal event-time witness snapshots;
- explicit sight/hearing modalities and non-exact directional hearing geometry;
- chunk/spatial locality;
- deterministic World phase semantics;
- desired motion separated from resolved physical motion;
- stable resident-local execution phase independent of registration order;
- resident-local cognition scheduling plus global concurrency/fairness;
- strict worker-side structural/epistemic sanitation;
- knowledge-limited semantic navigation;
- authored regions/places owned by World and defensively cloned;
- routing destination semantics separated from authored World places;
- research mode separated conceptually from gameplay truth.

Recovery must build on these strengths rather than restarting blindly from legacy.

## 2. Why recovery is required

The refoundation simplified several concepts that earlier research had already shown to be causally necessary:

- continuing matters / purposes;
- per-matter semantic revision;
- durable evidence anchors for live matters;
- task/run provenance;
- semantic reconsideration holds;
- suspend/resume without resetting the execution identity;
- exact supersession/disposition;
- terminal-state monotonicity;
- immediate loss of execution authority after terminal semantic state;
- atomic task start;
- ordered reconciliation of terminal task outcomes before a new run starts;
- provider-attempt lifecycle and exact abandonment;
- causal trace joining evidence through semantic and mechanical authority into World outcome.

These were not cosmetic framework features. They were introduced by adversarial failures.

The current `ResidentActivity` + resident-wide `attentionRevision/activityRevision` model cannot express all of these invariants safely.

## 3. Recovery matrix

| Invariant / capability | Current SPC Next | Prior evidence | Recovery obligation |
| --- | --- | --- | --- |
| One World / one clock | **RETAINED** | First Presence / Living | Preserve |
| Private resident state | **RETAINED / PARTIAL** | P1/P2/Living | Preserve; harden epistemic acquisition |
| Event-time causal witnessing | **RETAINED** | SPC Next audit | Preserve |
| Continuing semantic matter/purpose | **REGRESSED / ABSENT** | P2 kernel, First Hearth continuity | Reintroduce as resident authority, not text metadata |
| Per-matter semantic revision | **REGRESSED** | P2-E0+ | Required before rich async cognition |
| Matter-specific stale authority | **REGRESSED** | P2-E4/E9/E12 | Replace resident-global stale logic |
| Durable evidence for live matters | **REGRESSED** | P2-E8 | Pin/retain or otherwise reconstruct live semantic provenance |
| Grounded task/run binding | **REGRESSED / ABSENT** | P2-E6/E7 | Every executing run needs exact semantic provenance |
| Atomic task start | **ABSENT** | P2-E6 atomicity | No partial executor/resident authority split |
| Reconsideration hold during inference | **REGRESSED / ABSENT** | P2-E9 | Superseded execution cannot mutate World during latency |
| Suspend/resume preserving run/progress | **REGRESSED** | P2-E10, First Hearth | Recover under new kernel |
| Terminal-state monotonicity | **ABSENT AS MATTER MODEL** | post-P2-E13 | Required |
| Immediate execution revocation on terminal state | **ABSENT** | P2-E16/post-E15 | Required |
| Exact supersession/disposition | **ABSENT** | P2-E11, First Presence | Required |
| Terminal outcome reconciliation before next run | **ABSENT** | P2-E7 ordering | Required where execution resource is exclusive |
| Provider-attempt exact lifecycle / abandonment | **PARTIAL** | P2-E12/E17 | Integrate into resident-scoped authority |
| Orthogonal locomotion / attention / action / speech | **REGRESSED** | Living/World donor | Replace exclusive command union before capability growth |
| Facing / embodied attention | **REGRESSED / ABSENT** | Living/World donor | Recover early |
| Checked absence / deliberate search knowledge | **REGRESSED** | Living perception/search | Recover with local brain, not omniscient lookup |
| Speaker identity acquisition rules | **FAIL** | Living perception donor | Unknown voice must not become known actor automatically |
| Correct self-region null/transition truth | **FAIL** | World truth invariant | Fix stale region state |
| Actionable World entities/outcomes | **REGRESSED / ABSENT** | old World/Living | Reintroduce small real ontology through authoritative actions |
| Interaction occurrence is World-resolved fact | **FAIL / UNSAFE API** | outcome-authority principle | Product path must not fabricate interactions |
| Bounded semantic cognition pressure | **PARTIAL / GROWTH RISK** | Presence architecture | Replace event inbox behavior with bounded unresolved pressure |
| Public physical state separated from private semantics | **FAIL / MIXED** | epistemic boundary principle | Split public/player/research projections |
| Participant-bounded Owner view | **FAIL / RESEARCH-ONLY** | world-readable principle | Separate participant, spectator and research views |
| End-to-end live SPC provider loop | **ABSENT** | First Hearth live browser evidence | Wire and qualify after kernel recovery begins |
| Causal research ledger | **PARTIAL / REGRESSED** | First Presence trace | Restore full join |
| Five materially different residents | **ABSENT AS EXECUTABLE PROPERTY** | product target | Identity/capability/life divergence must be causal, not UI metadata |

`REGRESSED` does not mean the old implementation should be copied. It means the causal capability/invariant was previously demonstrated and the new architecture must either recover it or provide a stronger replacement.

## 4. Current hard correctness defects

These are not future product ambitions. They are present semantic/correctness problems.

### 4.1 Unknown-speaker identity leak

Hearing a speech occurrence currently carries the speaker `actorId`. `ResidentMind.observe()` then creates/touches a known actor for that ID even when the resident has never visually or socially learned the identity.

A directional non-exact position cue therefore still contains identity omniscience.

**Required gate:** an unknown voice remains an unknown voice unless an independently grounded recognition rule applies.

### 4.2 Stale self-region outside authored regions

After physical integration, region state is updated only when `regionAt(after)` returns a region. Entering an unregioned part of the valid World leaves the resident's previous `currentRegionId` active.

**Required gate:** self-location semantics must explicitly support `null` / no authored region and transition there immediately after authoritative motion.

### 4.3 Orphan semantic provenance

Beliefs and concerns preserve `evidenceIds`, but the bounded percept evidence store may evict those records. Cognition reason IDs may also be cited without a persistent record store. A later context can therefore contain a semantic state citing evidence that cannot be reconstructed.

**Required gate:** live semantic state cannot outlive the reconstructability of the evidence on which it claims to depend. Working-memory eviction and semantic evidence retention must be separate policies.

### 4.4 Fabricatable interaction occurrence

`emitInteraction()` can publish an interaction summary and arbitrary non-empty `subjectId` without proving that the subject exists, an action was attempted, or the World resolved an outcome.

**Required gate:** product/runtime interaction occurrences originate from authoritative action resolution. A synthetic research stimulus, if retained, must be explicitly typed and impossible to confuse with physical truth.

### 4.5 Owner/player omniscient speech presentation

The current research scene draws speech bubbles from global World diagnostics, independent of whether the player could perceive the speech. World-only mode hides telemetry but does not provide participant-bounded sensory presentation.

**Required gate:** distinguish:

- participant view — only player-available world information;
- spectator/world research view — explicit omniscient camera;
- private resident research lens — explicit selected-mind evidence.

## 5. Resident kernel requirements

The next resident kernel should be deliberately small, but it must have the right authority vocabulary.

### 5.1 Resident identity is not a biography prompt

Each resident needs durable, structured sources of divergence that can affect behaviour without relying on the LLM to roleplay a paragraph every time.

Likely categories to test experimentally:

- authored background/familiarity;
- ongoing matters and commitments;
- procedural competences / affordance knowledge;
- preferences/priorities where they have behavioral consequences;
- private history/evidence;
- social familiarity/recognition;
- physical capabilities/state.

Do not freeze a giant personality schema now. The requirement is causal divergence, not character-sheet completeness.

### 5.2 Matter / purpose owns semantic continuity

A matter is something the resident is still dealing with. It is not identical to the current body activity.

Minimum properties to prove through tests:

- exact stable identity;
- origin/provenance;
- active / suspended / terminal lifecycle;
- monotonic terminal status;
- semantic revision;
- current semantic course/judgement;
- live evidence dependency;
- optional active task/run binding;
- causal suspension owner/reason;
- last factual execution outcome where relevant.

### 5.3 Execution owns mechanical continuity

A task/run is a local attempt to realize part of a matter. It must not be mistaken for semantic success.

Minimum authority rules:

- task start is atomic with resident binding;
- run carries matter + semantic revision provenance;
- superseded or terminal semantic authority immediately prevents new World mutation;
- suspend/hold pauses execution without inventing completion;
- resume preserves legitimate mechanical progress where meaningful;
- supersession retires only the exact run that lost authority;
- terminal World outcome is reconciled into resident evidence before conflicting reuse of the same exclusive execution resource.

### 5.4 Local brain must become composable

Do not grow the current exclusive `none | move | speak` union into a long list of mutually exclusive behaviours.

The local embodied controller should evolve toward orthogonal channels, e.g.:

- locomotion / posture;
- attention / facing / look target;
- manipulation/action attempt;
- communication emission;
- possibly stance/interaction state later.

The exact data model remains experimental. The invariant is that walking, looking, carrying, talking and acting must be composable when the world allows it.

### 5.5 Cognition authority must be scoped

A provider result should be current because the semantic dependencies it used are still current — not merely because the resident has not changed any activity or heard any addressed speech globally.

At minimum, cognition attempts should bind to:

- resident identity;
- one or more relevant matters/discrepancies;
- exact semantic revisions / evidence anchors;
- creation tick / attempt identity;
- provider lifecycle.

Unrelated changes must not invalidate everything. Material changes to a depended-on matter must not be ignored.

## 6. Cognition pressure must not become an event inbox

Current scheduling gives useful cadence/concurrency behavior, but individual speech, interaction/system events and sight enter/exit transitions can each become unique pending reasons.

In a dense living world this risks historical backlog rather than present cognition.

Recovery requirements:

- bounded pending semantic pressure;
- explicit expiry or supersession;
- aggregation/coalescing by unresolved discrepancy/matter where appropriate;
- salience and urgency derived from current unresolved state, not only old event arrival;
- quiet reviews remain possible without duplicating the same unresolved work;
- observability of why cognition fired now and which pressure it discharged or retained.

Do not prematurely hardcode a universal scheduler theory. Falsify it under five residents and bursty events.

## 7. Perception and epistemic recovery

The stronger SPC Next causal boundaries should absorb useful Living donor capability rather than lose it.

Required experimental recovery areas:

- authoritative facing/attention separate from velocity;
- directional/FOV sight rather than permanent 360° awareness where appropriate;
- checked absence: inspecting a remembered place can update knowledge without proving global nonexistence;
- deliberate look/search as local actions;
- identity acquisition / voice recognition rules;
- known place acquisition with explicit provenance (`familiar`, `visited`; later observed only after a real sensory representation exists);
- no hidden dynamic obstacle/map update leaking through path planning before the resident can acquire the change;
- sensory observations distinguish event source, subject and spatial evidence.

## 8. World action/outcome recovery

The next resident-life slice requires at least one **small but real World-owned mechanic**.

Do not validate life through `work` labels, timers or narrative occurrences alone.

The minimal mechanic should have:

- explicit entity/resource/state in World truth;
- authoritative action request/attempt;
- validation of reach/conditions;
- factual success/failure outcome;
- visible public consequence;
- private perception/evidence according to causality;
- progress/state that survives a resident interruption when physically appropriate.

This mechanic exists to falsify continuity architecture, not to build an economy.

## 9. Research observability recovery

The selected resident should eventually expose an explicit causal ledger roughly equivalent to:

`World occurrence/outcome`
→ `resident percept/evidence`
→ `knowledge/belief update`
→ `matter/discrepancy pressure`
→ `cognition attempt + dependency revision`
→ `provider result`
→ `admission/rejection/stale/abandon decision`
→ `matter semantic revision`
→ `grounded task/run binding`
→ `local control/action attempt`
→ `World outcome`
→ `new evidence / matter progress`

This is system state and provenance, not model hidden chain-of-thought.

A trace that cannot answer "which exact semantic authority caused this exact World mutation?" is not sufficient for the next stage.

## 10. Evidence language — prevent claim inflation

From this point forward use evidence labels narrowly:

- **STATIC / CONTRACT PASS** — types/parsers/invariants or unit contracts only;
- **DETERMINISTIC CAUSAL PASS** — controlled executable lifecycle through real runtime classes;
- **LIFE-SLICE PASS** — one bounded resident-life scenario survives interruption and return with real World consequence;
- **LIVE PROVIDER PASS** — real model/provider participates under measured latency/failure;
- **WORLD-READABLE PASS** — behavior is understandable in participant view without research telemetry;
- **OWNER-OBSERVED** — Owner personally exercised/observed the relevant behavior;
- **FIVE-RESIDENT PRESSURE PASS** — same architecture survives independent concurrent resident lives/events/cognition.

Never promote a broader claim from a narrower gate.

Test names must describe what assertions actually demonstrate. Geographic spread + five role metadata entries is not evidence of five independent roles.

## 11. Recovery campaign order

### R0 — protect truth before feature work

Add executable regression tests for the hard current defects and import/restate the critical P2 invariants as SPC Next recovery tests.

The goal is not to make old tests run unchanged. It is to make the new architecture answer the same adversarial questions.

### R1 — resident continuity kernel

Introduce the smallest matter/purpose authority with scoped revisions, durable evidence and terminal/suspend semantics.

Do not yet build a general planner or personality framework.

### R2 — execution authority + composable local control

Bind matter revision → task/run → local execution. Recover hold/suspend/resume/supersession/terminal revocation. Split local controls so attention/action/speech can coexist with locomotion.

### R3 — first real material life slice

Use Janek's existing pressure role only as a test anchor, not as special-case architecture:

`own matter`
→ `real material progress in World`
→ `player/world interruption`
→ `embodied attention/reaction`
→ `temporary alternate matter/activity`
→ `old matter remains causally valid or is consciously revised`
→ `resume or abandon`
→ `factual World continuation/outcome`.

### R4 — live cognition in the actual browser loop

Connect `SpcCognitionHost` and the SPC worker endpoint. Exercise real Luna-class cognition, latency, timeout, abandon/retry and local continuation while inference is in flight.

Do not call this pass from worker unit tests alone.

### R5 — participant-readable and research-readable evidence

Separate participant/spectator/private research projections and make the life slice readable without omniscient presentation.

### R6 — five-resident adversarial pressure

Run the same kernel with all five residents under:

- unrelated overheard events;
- direct player interruptions;
- NPC↔NPC contact;
- simultaneous different matters;
- provider delays/failures;
- resident divergence over time;
- long local execution without LLM;
- bursty cognition when genuinely needed.

Only after this should the architecture be generalized further.

## 12. Not immediate blockers unless a recovery slice requires them

Do not let these become horizontal infrastructure campaigns by inertia:

- more macro-world area;
- rich anchor taxonomy;
- generic ECS/plugin architecture;
- broad economy/progression;
- final save format;
- universal relationship/reputation model;
- combat;
- generalized full navigation stack.

Collision/local obstacle navigation may enter as soon as a real life slice requires physical recovery. Facing/attention is earlier because it directly affects embodied perception and readable interruption.

## 13. Promotion gate for this recovery

The architecture recovery campaign is not complete when the new types look cleaner.

A credible first promotion requires all of the following in the same integrated runtime:

1. one resident has a persistent own matter with durable evidence and scoped semantic revision;
2. a real World-owned task is bound to that matter/revision and produces visible factual progress;
3. a semantically material interruption stops or holds only the execution that has actually lost authority;
4. unrelated events do not erase the resident's ongoing life;
5. provider latency cannot allow a superseded run to mutate World;
6. suspend/resume preserves legitimate progress without rewinding World truth;
7. a terminal matter cannot resurrect, mutate World later or manufacture an outcome;
8. the resident can resume or consciously revise/abandon the matter;
9. participant view shows enough physical behavior to judge interruption/return without omniscient debug help;
10. the research ledger can reconstruct the exact causal chain;
11. the same kernel survives at least one five-resident interference test;
12. live provider evidence exists for the actual integrated path.

Until then, the correct status remains:

> **RECOVERY IN PROGRESS — DO NOT PROMOTE BY GREEN CI OR FEATURE COUNT.**
