# SPC Post-Stress Recovery Program

Status: **CANONICAL CURRENT EXECUTION AUTHORITY**
Date: **2026-09-20**
Repository: `Jozzpoly/Llm-Live-NPC`

This document supersedes the execution authority of `docs/SPC_LIVING_WORLD_EXECUTION_PROGRAM.md`.
That earlier document remains valuable historical evidence describing the state immediately before the 18 September 2026 long-running Owner/stress observation. It must not be used as the current roadmap.

The frozen runtime `c1816785c89b5403889a7c57498843ecbbb69b97` is preserved as an **immutable forensic failure specimen**. Its narrow technical qualifications remain valid within scope, but the broader claim that it represented a credible living-world candidate is rejected by later evidence.


## 2026-10-09 canonical reassessment — living-NPC goal

**Latest Owner product truth overrides all older roadmap and machine-result optimism.** The target is *living characters in a shared game world*, not simulated biological organisms, courier/firefighting task runners, or superior instrumentation around tedious behavior. Owner directly rejected Cognitive Ecology Lab on 2026-10-09: **PRODUCT FAIL / TERMINATED**. Its authored policy tests and CI cannot moderate that verdict or supply a successor architecture. Prior September SPC stress/Owner FAIL also remains binding: strong transport/authority tests did not produce convincing ordinary resident life.

**Verified current source**, draft PR #148 head `b43a4e892b7d3ca3e4d440f923cd5806e8ef4ed2`:
- Single-current-plan review is **already implemented/tested**; live Luna run #34 is recorded in `evidence/r6-single-current-plan-review-outcome-meaning-live-result.json`. Both factual-outcome variants select `relinquish_matter`; wording changes rationale/cadence but **not** action class. The frozen live evidence identifiers were noncanonical. Later canonical-id local replay is *not* one end-to-end provider provenance proof. Sections 7 and 13 below describe older execution stages; their claim that single-plan reappraisal is still unimplemented is superseded.
- **Owner/browser activation boundary:** `src/client/main.ts` selects SPC research only with `?spc=1`, but `researchScenarioKindFromSearch()` defaults the research shell to `baseline-delivery`, **not** `unified-living`. The five-resident composition requires an explicit `?spc=1&scenario=unified-living` on a build containing the R6 code. `main` is still the historical P0 baseline, not R6; the README's `441dfa93` preview URL is explicitly the frozen pre-September-18 Owner failure specimen `c1816785...`, **not a current R6 preview**. Do not assess the latest R6 by casually opening the default research page or that frozen preview; do not switch the default to an unfinished provider-enabled runtime without a separate deployment, safety and Owner-experience gate.
- The public five-resident starting World (`src/spc-next/five-resident-region.ts`) has **one physical material object**; residents' scripted initial paths finish dispersed. Nearest authored completion pair Mira–Janek is ~851 world units apart versus default sight radius 520. **This calculation concerns authored completions, not all possible real-model subsequent movements**.
- `FiveResidentCausalLifeRuntime` permanently claims residents after scripted opening. Its provider-free integration test verifies bodies then stay motionless with no accepted recovered matters. This does not prove provider-enabled residents always remain motionless. Importantly, successful terminal recovered actions intentionally do **not** create endless higher-cognition reasons (`ResidentCausalExecutionCoordinator.finishRun`), preventing the observed September cognition treadmill. But the current resident-local intelligence does not yet sustain compelling independent ordinary-life goals, social encounters, and practical continuations in its place.
- Main R6 executor (`resident-causal-execution-coordinator.ts`) only executes known-region travel, actor communication, and bounded object pickup. Older local `src/living/runtime.ts` contains additional embodied search/follow/fetch/drop procedures, and `resident-local-material-delivery-routine.ts` has an unintegrated carry/place donor. **Donor existence is not automatic parity or permission to copy obsolete semantics.**
- Current strict five-resident Worker guidance constrains accepted bodily acts primarily to familiar-region travel, known-actor communication, idle and narrowly supported material acquisition. `FIVE_RESIDENT_LIFE_SELF` contains authored role/drives prose, not earned, ongoing resident-private self-interests. The real-model provider can make excellent bounded choices, but no one has demonstrated that these components yield intrinsically interesting, self-directed, continuous, shared-world NPC lives.
- **Donor recovery boundary:** R1's `resident-local-material-delivery-routine.ts` already implements bounded physical pickup/carry/place; R4-D's compact Mira/Ida specimen has three real objects, material observations and local addressed-contact response without inventing automatic chores. R4-D's negative-capability finding is **not** evidence of resident-originated interests: Ida's interventions are authored within the specimen and Mira's ordinary life does not spontaneously become a social/material agenda. The older `src/living/runtime.ts` offers richer search/follow/fetch/drop skills but carries older semantics. Thus merely placing residents close together, adding objects or transplanting R4-D would not solve agency. Treat these as distinct donor competences for a genuinely unforced integrated shared-world situation; distinguish scripted initial circumstances from planted decisions and prove any later autonomous action separately.
- Draft **PR #149**, `experiment/r6-private-encounter-relevance-20261009`, at `fded5b80fcfc273bce08d8f0cfe4566b50219ed5`, wires existing actor-relative private sight relevance into the five-resident runtime. **Mechanistic-only**: 1072/1072 tests and typecheck/build PASS, Browser Evidence regression PASS at an earlier change; final head browser run was still in progress at the previous audit. It does not create resident motives, spontaneous conversations, real Luna choice, or Owner-visible aliveness. Remains draft/unmerged; do not treat it as an earned product capability or use machine PASS to justify merging.

### Revised evidence-to-development rule

**Main bottleneck is missing situated, continuing agency in a causally sparse World**, not missing dashboards, prompt cleverness, more provider calls, scripted tours or a longer run of predetermined activities. The old and new systems each have different valuable capabilities; neither is an accepted living-NPC product.

Before promoting the next feature:
1. Observe the existing five-resident runtime **without prescribing desired behavior** and explicitly separate legitimate quiet from practical/cognitive inertness. Identify resident-owned *reasons* to pursue matters, act locally, remember and change course.
2. Select a compact but genuinely consequential **shared-world ordinary-life situation** with more than task completion: NPC–NPC encounter, material affordance, private knowledge, competing interests/obligations and factual afterstate. Authored starting circumstances are legitimate; authored desired decisions/outcome are not. The World must be a causal place, not a plot script.
3. Test which missing link *causes* the absence of life: sparse real affordances, thin local competence, missing self-relative purpose/relevance, action-vocabulary bottleneck, or semantic-provider wiring. Import old donor skills **only after the lived-behavior failure earns them**.
4. Make the NPC's own unforced decisions and physical/social consequences the unit of progress. Confirm provider provenance separately. No fake model decisions credited as agency, no provider-request volume credited as life.
5. Retain performance/budget/regression evidence as narrower controls. **Owner's unscripted observed game experience alone can qualify or reject the product-level result.** Do not prepare another Owner demo on the strength of test green.

**Current product verdict: NOT OWNER-QUALIFIED LIVING NPC.**
**Current plan verdict: PR #149 is bounded research only, not the next release. R6 remains draft.** This checkpoint supersedes obsolete 'next single-current-plan reappraisal' work order below without erasing its historical evidence.


---

## 1. Product truth

The project is building **five genuinely living embodied residents in one shared authored causal world**.

Mira, Janek, Ida, Oren and Nela are not:
- five chatbots with bodies;
- five scenario-specific test actors;
- five LLM loops;
- five random walkers with dialogue;
- five state machines whose apparent life exists mainly in debug telemetry.

The target resident is a persistent participant with:
- a private and incomplete history;
- situated perception;
- beliefs that can be stale or wrong;
- continuing matters, obligations and unresolved consequences;
- bodily presence and local embodied competence;
- attention and local reactions;
- preferences, aversions, relationships and self-interest grounded in state rather than only prompt prose;
- continuity through interruption;
- factual World consequences;
- semantic judgement from an LLM when genuinely needed;
- meaningful continued existence when the player leaves.

The player is one participant, not the automatic center of every resident's cognition.

The long-horizon direction remains a living authored RPG / mini-world in which reality is causal and social meaning is perspective-dependent.

Governing shorthand:

> **meaning may be generative; reality must remain grounded.**

Additional post-stress correction:

> **perception is not cognition pressure, cognition pressure is not automatically a provider request, and provider activity is not evidence of life.**

---

## 2. What the 18 September stress observation falsified

Before the stress observation the project had earned strong narrow evidence for:
- one authoritative World;
- private resident perception/history boundaries;
- matter/run/outcome authority;
- exact provenance;
- stale async admission protection;
- interruption/return in qualified slices;
- real GPT-5.6 Luna transport;
- five residents coexisting in one unified runtime;
- addressed player speech entering the resident cognition path causally;
- Browser Evidence and repository Check on the frozen candidate.

Those facts remain useful.

What failed was the **composition-level interpretation** that these properties already formed a credible living-resident system.

The stress evidence showed that the runtime could sustain large amounts of technically valid provider activity while producing weak resident-life value.

The observed failure class was not simply "too many API calls". It was a deeper homeostasis failure:

`World changes / outcomes`
-> `resident pressure`
-> `provider request`
-> `new semantic commitment`
-> `movement / communication / outcome`
-> `new pressure`
-> repeat.

A quiet or low-information world could therefore continue generating cognition because the system had insufficient semantic metabolism between perception and provider escalation.

### Important evidence boundary

From the 18 September usage export:
- the **project-wide cumulative history** visible in dashboard context was approximately 1,751 requests;
- the exact 18 September export contained **1,313 requests**;
- input tokens: **10,901,434**;
- output tokens: **315,403**;
- incentivized-tier requests: **396**;
- paid requests: **917**;
- paid cost: approximately **$2.08004331**;
- the dominant paid cost component was cache-write traffic.

The project did **not** recover a complete per-request Responses-log corpus for those 1,313 calls. Therefore no document may claim that every individual request was reconstructed.

Controlled reproduction and runtime forensics nevertheless established the runaway mechanism strongly enough to invalidate the previous living-candidate interpretation.

---

## 3. Root diagnosis

### 3.1 Missing middle intelligence

The project has a comparatively strong causal substrate below and a capable semantic model above.

The missing layer is the resident-local mechanism that continuously asks:

- what actually happened?
- does this matter to me?
- is it already explained by something I am doing?
- is it stale, superseded or already resolved?
- can I handle it locally?
- does it affect an ongoing matter?
- is semantic judgement genuinely required?

Without this layer, situated perception can too easily become cognition pressure and cognition pressure can too easily become provider traffic.

This is the central architectural gap.

### 3.2 Local brain is below Owner intent

The local brain currently proves important execution primitives, but it is not yet a sufficiently rich continuous intelligence.

It is too close to:
- move toward target;
- communicate with actor;
- execute a small procedural action;
- resume an existing run.

The desired local brain must increasingly own:
- attention;
- local relevance;
- procedural competence;
- routine continuation;
- short-horizon problem solving;
- recovery;
- local social/physical reaction;
- bounded improvisation;
- ordinary low-intensity life.

The goal is not to choose a framework such as BT / Utility AI / GOAP / HTN first.
Those remain donor techniques. Resident-life pressure determines which mechanisms deserve to exist.

### 3.3 Personhood is too prompt-heavy

A resident described through role/drives prose can still behave like a model acting a role.

Personhood must increasingly exist in causal private state:
- own matters;
- promises and obligations;
- ownership/control relationships;
- preferences and aversions;
- comfort and inconvenience;
- relationships/history;
- expectations;
- unfinished business;
- interests;
- competences;
- things the resident chooses not to care about.

Do not implement a generic "needs simulator" by default.
The required representation must emerge from observed resident-life failures.

### 3.4 The World is spatially large but causally sparse

Map area is not life density.

A resident with little meaningful material affordance is pushed toward the few available generic actions, especially travel and communication. Provider cognition then manufactures activity because the World itself supplies too few grounded reasons for existence.

Future world work must increase **causal life density**, not map dimensions or content count for its own sake.

### 3.5 Event/pressure lifetime is under-specified

Pressure needs explicit lifecycle semantics.

At minimum the architecture must be capable of representing whether a reason is:
- unresolved;
- currently handled;
- consumed;
- superseded;
- expired/stale;
- deliberately retained because it still matters.

The exact representation remains open.

What is rejected is an effectively timeless event backlog in which old pressure can be resurrected after provider latency and treated as fresh significance.

### 3.6 Green causal plumbing does not answer the normative question

Previous evidence often answered:

> Did the event causally reach the correct resident, produce the correct reason, survive provider transport, become an admitted matter/run and yield a factual outcome?

The new mandatory second question is:

> **Should this resident have escalated this situation into higher cognition at all?**

A system may be causally correct and psychologically absurd.

From now on the project must qualify both.

---

## 4. What survives the failure

Do not perform a blind rewrite.

### Preserve as strong foundations unless new evidence overturns them

- authoritative World physical/social facts;
- World truth distinct from resident observation/belief/memory;
- private resident histories and knowledge boundaries;
- causal occurrence provenance;
- provider output not being World authority;
- resident continuity distinct from a provider request;
- matter / execution / factual outcome separation;
- stale async admission protection;
- exact interruption / suspend / return lessons;
- factual outcome reconciliation;
- addressed vs overheard speech boundaries;
- research visibility not becoming resident knowledge;
- real-browser evidence infrastructure;
- adversarial contract-to-oracle discipline;
- five pressure residents as research instruments;
- model/provider flexibility;
- highly bursty LLM cognition when evidence genuinely warrants it.

### Reopen aggressively

- cognition scheduling;
- reason prioritisation;
- pressure lifetime;
- context construction;
- local relevance;
- local brain;
- personhood/drives;
- ordinary routine;
- authored affordance density;
- memory retention/forgetting/summarisation;
- resident-to-resident amplification control;
- criteria for semantic escalation.

### Reject as current truth

- `c181...` being an Owner Living Sandbox quality candidate;
- green CI + Browser Evidence + live-provider transport implying living-system readiness;
- request rate as the primary failure metric;
- random wandering/chatter as a repair for inertness;
- simple cooldowns/TTL alone as a sufficient architectural fix;
- another large provider campaign before local life is worth escalating.

---

## 5. The new development unit: homeostatic life

The project previously progressed mainly through capability slices.

Capability slices remain useful, but the next unit of promotion is stronger:

> **Can a resident remain meaningfully alive for an extended period without external prompting, without provider churn manufacturing continuity, and without losing causal identity?**

This means:
- legitimate stillness is allowed;
- silence is allowed;
- local routine is allowed;
- repeated actions may be mundane;
- a resident does not need constant novelty;
- no cognition request is required merely to prove that the system is active.

The system should naturally spend long periods in locally handled life and still be capable of intense cognition bursts when reality warrants them.

---

## 6. Recovery campaign

The sequence is pressure-ordered and may be replanned after evidence.

### Phase R0 — forensic baseline and runtime safety

Goal:
preserve the failure exactly and make future long runs fully inspectable.

Required:
- keep `c181...` frozen and reproducible;
- retain 18 September usage/forensic conclusions;
- add an explicit runtime budget guard independent of dashboard soft limits;
- capture raw request metadata and sanitized request/response payload evidence for future bounded experiments;
- expose request reason/origin and settlement;
- make event/pressure lifecycle inspectable;
- prevent unbounded test runs from silently consuming budget.

Do not optimize cognition quality in R0.
This phase exists so later evidence is trustworthy.

### Phase R1 — zero-provider local-life specimen — **PASS**

Qualified 2026-09-20 at source SHA `69c40225fffaf0f97bdba95aaa36cfb1c9c3ba25`.

Evidence authority:
`docs/SPC_ZERO_PROVIDER_LOCAL_LIFE_R1_PASS.md`.

Goal:
prove that one resident can have ordinary causal continuity without an LLM manufacturing life.

Provider cognition is disabled for the experiment.

Use a deliberately small, dense authored micro-world.
The resident must have enough material/social affordances to exhibit:
- ordinary routine;
- attention shifts;
- continuing matters;
- local choice;
- interruption;
- local recovery;
- meaningful stillness;
- at least one factual World consequence;
- continuation after that consequence.

The experiment must distinguish:
- **quiet but alive**
from
- **runtime inert**.

Do not use random wandering, random chatter or cosmetic activity churn to satisfy the gate.

The binding experiment contract is:
`docs/SPC_ZERO_PROVIDER_LOCAL_LIFE_EXPERIMENT.md`.

### Phase R2 — resident relevance / semantic metabolism — **PASS**

Qualified 2026-09-20 at source SHA `f0cd892a7915dbe5a382bcdd60966415e4544604`.

Evidence authority:
`docs/SPC_R2_SEMANTIC_METABOLISM_PASS.md`.

Goal achieved within the bounded R2 claim:
insert a real decision boundary between perception and higher cognition.

A resident must be able to classify incoming change relative to:
- self;
- current matter(s);
- local competence;
- freshness;
- causal relationship;
- expected routine;
- risk/urgency;
- whether the issue has already been resolved or superseded.

The exact algorithm is intentionally not frozen.

Qualification question:

> Can a noisy World produce many perceptions while only a small, explainable subset becomes unresolved semantic pressure?

### Phase R3 — causal personhood — **PASS**

Qualified 2026-09-20 at source SHA `14028a8075ca725260c658e35a1cb4d87fff9e08`.

Evidence authority:
`docs/SPC_R3_CAUSAL_PERSONHOOD_PASS.md`.

Bounded goal achieved:

> resident-relative significance and a legitimate competing-matter choice can be traced to persistent private causal history that existed before the decision, rather than being supplied only by role prose or a provider-authored post-hoc reason.

R3 deliberately did **not** generalize this into a universal personality system.

Key retained conclusions:
- existing continuity state is already part of the resident's causal self;
- same evidence can acquire different significance because of different private history;
- real accepted social responsibility has a system-owned origin and nonterminal lifecycle;
- choice rationale must cite exact pre-existing support for the selected matter;
- generic provider-authored concern prose is not personhood authority;
- generic matter origin alone still does not explain broad preference;
- R2 pressure lifecycle, defer timing, supersession and invalidation remain authoritative through the choice layer.

Broad preferences, aversions, relationships, habits, ownership psychology and other personhood dimensions remain future pressures and must be earned by concrete failures rather than added speculatively.

### Phase R4 — dense authored affordance surface — **PASS**

Qualified 2026-09-20 at source SHA `0f7945d74db6b4ed6044f5d636b3c4696dce5201`.

Evidence authority:
`docs/SPC_R4D_MIRA_ORDINARY_LIFE_PASS.md`.

Bounded result:
causal affordance density can produce both grounded local action and grounded non-action without automatically converting nearby World possibility into chores or provider pressure.

Goal achieved within the bounded R4 claim:
give residents enough grounded reality that travel/communicate are no longer the default semantic outlet.

Recover proven donors only when demanded:
- checked absence;
- deliberate looking;
- attention/facing;
- object search;
- carry/pick/place;
- material work;
- physical obstruction/recovery;
- resident-to-resident contact.

Prefer a small world where most places/objects matter over a huge empty map.

### Phase R5 — LLM as semantic escalation — **QUALIFIED PASS**

R5-A one-reason / one-provider / one-grounded-consequence / return-to-quiet:
**QUALIFIED PASS** at source SHA `58f225e0090110edf75dbe4aaf1bf057ec8f590e`.

Evidence authority:
`docs/SPC_R5A_SEMANTIC_ESCALATION_PASS.md`.

R5-B stale/newer-attention safety:
**QUALIFIED PASS** at source SHA `b0aa10c43ae833fdec95f86d2caa0b7343ba451e`.

Evidence authority:
`docs/SPC_R5B_STALE_ATTENTION_PASS.md`.

R5-C provider failure and explicit semantic retention/settlement outcomes:
**QUALIFIED PASS** at source SHA `7256ccad2f82d99cbb89668b64ebdaf23f48f484`.

Evidence authority:
`docs/SPC_R5C_PROVIDER_OUTCOMES_PASS.md`.

Real-provider causal boundary:
**QUALIFIED PASS** at source SHA `3122baabd64fdf57cc178f29ee98b81b9b8071af`.

Evidence authority:
`docs/SPC_R5_REAL_LUNA_CAUSAL_BOUNDARY_PASS.md`.

The single real Luna result also exposed a semantic fidelity debt:
a `communicate` action can speak a future promise that does not exist as durable resident state. Broad judgement/personhood quality is therefore not promoted from the green causal result.

**Current recovery target: R6 — complementary resident falsifiers / ordinary personhood.**

Goal:
reintroduce the provider into a resident who already lives locally.

Provider cognition fires because a genuine unresolved semantic discrepancy exists, not because a timer needs novelty.

A legitimate burst may be very intense.
The success metric is not minimal requests.

Required evidence:
- exact causal reason;
- why local competence was insufficient;
- provider context remains bounded/relevant;
- settlement resolves, changes or explicitly retains the pressure;
- provider latency does not halt local life;
- one completed provider decision does not manufacture another request without a new unresolved reason.

### Phase R6 — complementary resident falsifiers

Use:
- **Mira** for ordinary-life/personhood pressure;
- **Janek** for material work, interruption, stale knowledge and exact continuation.

Both must use the same shared architecture.
No core `if resident == ...` behavior.

### Phase R7 — five-resident homeostasis

Goal:
run five independent lives together without cognition amplification turning interaction into a provider storm.

Start without the player.

Measure:
- resident-local request rates;
- cross-resident propagation;
- event amplification;
- unresolved-pressure lifetime;
- provider burst clustering;
- quiet intervals;
- factual World consequences;
- whether lives remain distinguishable over time.

A single ordinary occurrence should not automatically multiply into five semantic requests.

### Phase R8 — bounded real-Luna campaigns

Run controlled real-provider scenarios with complete evidence and hard budgets:
- calm baseline;
- legitimate semantic burst;
- interruption;
- resident↔resident consequence propagation;
- player interruption;
- provider failure/latency.

Measure quality, reason density, token usage, latency and cost.

Do not tune architecture only to today's complimentary quotas or prices.

### Phase R9 — endurance stress tests

Only after ordinary life is compelling.

Run two separate budget-bounded experiments:
1. residents without a player;
2. residents with a player.

The World runs until the predefined experiment budget is exhausted.

Primary question:

> After prolonged life, are these still five coherent residents with meaningful accumulated histories, or has provider activity become the system's substitute for existence?

---

## 7. Immediate experiment gate

**R1 — LOCAL LIFE: PASS.**

**R2 — SEMANTIC METABOLISM: PASS.**

**R3 — FIRST CAUSAL-PERSONHOOD MILESTONE: PASS.**

**R4 — DENSE AUTHORED AFFORDANCE SURFACE: QUALIFIED PASS.**

**R5 — LLM AS SEMANTIC ESCALATION / REAL LUNA CAUSAL BOUNDARY: QUALIFIED PASS.**

**Current recovery target: R6 — COMPLEMENTARY RESIDENT PERSONHOOD.**

Current R6 evidence is deliberately split by plane:

- **R6-A — resident-originated standing social commitment: QUALIFIED BOUNDED PASS** at its documented source;
- **R6-B — native standing social continuation: QUALIFIED BOUNDED PASS** at source `54fe9fbe2f615d4dd37e5f4e6a0577d2c359d3da`;
- **R6-C Oren → Nela generated-history genericity: deterministic/domain GREEN**;
- **direct-request history-sensitive real-model choice: BOUNDED POSITIVE FINDING** — same Ida request, control accepts departure while history Oren declines because earlier Nela responsibility still binds;
- **exact counterparty release lifecycle: deterministic/domain GREEN**;
- **endogenous history-after-outcome choice: MATERIAL BOUNDED POSITIVE FINDING** — exact runtime-generated no-fresh-command frames; control chooses no new matter, history chooses return to Nela from standing responsibility;
- **factual World continuation: deterministic GREEN** — exact live history proposal survives local admission and Oren physically returns workshop → commons without fresh speech;
- **factual standing fulfilment: LIVE-SEMANTIC + DETERMINISTIC LIFECYCLE GREEN** — one-call Luna run #23 selects `complete_standing` from the exact factual return outcome, then local authority resolves the standing matter;
- **Check #1603: PASS** on integrated source `32bae5f34982ef942ef6d3ea58fc0000212f79ec` — 263 / 263 files, 961 / 961 tests, typecheck/build/preview green;
- **Browser Evidence #827: PASS as regression evidence**, including dedicated Mira/Ida R6 and legacy R1–R5-C browser vetoes.
- **stage-closure hardening `2c7adf94...`: PASS** — explicit stale-life rejection for `complete_standing`; Check #1605 **263 / 263 files, 962 / 962 tests**; Browser Evidence #829 PASS; no production/runtime semantic change after `32bae5f3...`.
- **post-terminal factual-history probe: BOUNDED NEUTRAL FINDING** — exact matched Janek contexts with one terminal material episode only in history; Live Provider run #24 makes two Luna calls / zero retries and returns the same behavioral class in both twins while the history rationale explicitly consumes the earlier factual unavailability; exact proposals replay through local authority without reopening the old matter or granting material-action authority.
- integrated single-opportunity closure head `b79793cf625da93d4909c644a3e56511febde67a`: **Check #1628 PASS — 266 / 266 files, 970 / 970 tests**; **Browser Evidence #852 PASS**.
- **competing-future terminal-history support gap: CHARACTERIZED + NARROWLY REPAIRED** — exact terminal same-object `task_outcome` may become `prior_same_material_outcome` support while the old matter remains terminal/run-free; ordinary cross-candidate evidence remains forbidden.
- **Live Provider run #25: APPARATUS / PROVIDER-CONTRACT FAILURE ONLY** — strict response schema used unsupported `uniqueItems`; both calls failed upstream before model output with zero token usage. Removing only that keyword restored provider compatibility while local duplicate rejection remained intact.
- **Live Provider run #26: MATERIAL BOUNDED POSITIVE FINDING** at source `c9999f589886311125dd91a215d27f3b46371a5c` — exact matched competing-future twins; control `defer_all`, history `focus_matter(retry)`; history cites the exact terminal factual outcome; `exactBehaviorEqual = false`; exactly two GPT-5.6 Luna calls and zero semantic retries.
- **exact run-#26 local replay: GREEN** at source `c3e2efb784520d17e520f3373a2de97bc8caab53` — both exact Luna proposals survive `ResidentLifeChoiceOwner` admission; old history remains resolved/run-free; Check #1653 **269 / 269 files, 979 / 979 tests**.
- **delayed same-object factual-history gap: CHARACTERIZED + NARROWLY REPAIRED** — bounded terminal factual outcomes remain non-live archive provenance; exact current relevance may create a new C carrying typed `prior_same_material_outcome { sourceMatterId, evidenceId }`; ambiguous old episodes fail closed; support is released when C terminalizes.
- **strengthened delayed endogenous chain: BOUNDED DETERMINISTIC PASS** at `b4861568d222f11f3f0b0621cae14c92088acdc9` — A leaves bounded recent/current life **before** reacquisition; archive-backed exact relevance later creates C, B independently yields D, and normal arbitration reaches `choice_required(C,D)` while A remains absent/run-free; Check #1725 **279 / 279 files, 1006 / 1006 tests**, typecheck/build/preview PASS.
- **Live Provider run #27: MATERIAL BOUNDED POSITIVE FINDING** at `ebf41ab8d67c86dd4eb4b3e4c8a30978ef73b827` — matched C/D twins with A absent from both current-life frames; control `defer_all`, delayed-history `focus_matter(retry)`; history cites the exact old factual outcome carried only as candidate-scoped support on C; `exactBehaviorEqual = false`; exactly two GPT-5.6 Luna calls and zero semantic retries.
- **exact run-#27 local replay: GREEN** at `31a162e7debd25ec1d2aa742963e34cc67a225fb` — both exact Luna proposals survive `ResidentLifeChoiceOwner` admission with A still absent from `life.matters`; Check #1724 **279 / 279 files, 1006 / 1006 tests**.

Evidence hygiene / limits:

- Live Provider #21 at `4861abf6...` made two real Luna inferences but failed at the provider/local admission contract; it is apparatus/cost evidence, **not positive semantic evidence**;
- canonical endogenous run #22 at `592a19ec...` made exactly two calls with no within-run semantic retry;
- fulfilment run #23 at `9aff2659...` made exactly one call with no retry;
- the no-fresh-command reflection point is an explicit one-outcome R6 opt-in; R2 still suppresses normal successful-completion echo globally;
- the initial standing-history construction in this paired specimen is deterministic experiment setup;
- runtime contexts are generated exactly and equality-bound to the live fixtures, then replayed through the real endpoint; this is not one uninterrupted live browser process;
- one paired model observation is not a behavior distribution;
- Live Provider run #24 is a neutral single-sample result: semantic uptake of terminal history is observed, but history-caused behavioral differentiation is **not** proven;
- the visible reacquired crate is a strong current fact, so retrying remained coherent in both run-#24 twins; do not treat equal behavior as proof that terminal history is useless;
- Live Provider run #25 is provider/schema apparatus evidence only: it produced no model proposal and zero token usage, so it cannot count as a semantic sample;
- Live Provider runs #26 and #27 are each one paired positive observation, not behavioral distributions;
- run #26 proves a bounded near-term factual-history effect; run #27 proves a bounded delayed candidate-scoped factual-history effect after A is absent from current life;
- neither result proves learned aversion/preference, habit or generalized autobiography;
- the strengthened `b4861568...` chain supplies the delayed normal-runtime causal provenance that the frozen live twins do not by themselves prove;
- the dedicated R6 browser specimen still exercises Mira/Ida, so **browser-qualified Oren/Nela genericity remains UNPROVEN**;
- explicit social obligation is now deeply exercised, but preference/aversion, habit, broader relationship history, ownership/self-interest and other personhood causes remain largely open;
- no machine result here is Owner-observed ordinary aliveness.

Therefore do **not** promote:

- a broad R6 PASS;
- browser-qualified cross-resident Oren/Nela personhood;
- general social intelligence;
- five distinct living people;
- Owner-observed ordinary aliveness.

The active research boundary has now moved through five materially different steps:

1. explicit standing obligation demonstrated one bounded endogenous history-caused World continuation and is closed;
2. run #24 showed terminal-history semantic uptake in a single-opportunity frame without behavioral differentiation;
3. competing-future pressure earned the narrow `prior_same_material_outcome` relation and run #26 showed a causally cited behavioral split;
4. normal runtime generation then reproduced the A → C / B → D → `choice_required(C,D)` causal situation from bounded seeds;
5. delayed-history pressure forced A beyond recent/current life, earned bounded factual archive + candidate-scoped causal genealogy, and run #27 again produced a causally cited behavioral split with A absent from both live current-life twins.

The specific delayed same-object factual-history question is therefore **bounded CLOSED** across deterministic runtime causation, real-Luna judgement and exact local admission.

The next highest-information question is no longer "can the same old crate fact survive longer?". It is a qualitatively different personhood pressure:

> **Can several independently factual past experiences, none of which is itself an open obligation or exact same-object continuation, jointly alter a later endogenous choice in a causally attributable way without replacing resident life with generic personality/preference state?**

Do not answer that by prebuilding preference, aversion, habit, relationship scores or a generic autobiographical store. First characterize where the current causal representation actually fails.

Browser Oren/Nela genericity remains genuine promotion-plane debt. It must be obtained or the promotion contract deliberately revised before any claim that requires it, but it is not the highest-information research target.

---

## 8. Evidence hierarchy after the stress failure

Evidence planes remain separate.

Use:
- **STATIC / CONTRACT**
- **DETERMINISTIC CAUSAL**
- **LOCAL-LIFE**
- **SEMANTIC-RELEVANCE**
- **LIVE PROVIDER**
- **FIVE-RESIDENT HOMEOSTASIS**
- **PARTICIPANT-OBSERVED**
- **OWNER-OBSERVED**
- **ENDURANCE**

Never promote upward automatically.

Examples:

- green provider transport does not prove semantic relevance;
- a correct matter/run transition does not prove the matter was worth creating;
- low request count does not prove life;
- high request count does not automatically prove failure if the World contains a genuinely intense event;
- world-readable behavior does not prove private epistemics;
- a beautiful debug trace does not prove an alive resident.

---

## 9. Promotion metric: cognition value, not request minimisation

Do not optimize for:
- fewer calls;
- fixed calls/minute;
- arbitrary cooldown targets.

Instead investigate metrics such as:
- provider requests per genuinely unresolved semantic issue;
- fraction of perceptions handled locally;
- fraction of provider outputs that resolve/change a real matter;
- repeated reasoning on already-settled pressure;
- cross-resident amplification factor;
- quiet-life duration without loss of continuity;
- context relevance density;
- provider decisions that produce observable durable consequences;
- stale/superseded reason rejection rate.

These are research metrics, not frozen KPIs.

---

## 10. Self-correction triggers

Stop momentum and re-plan if:

- a change mainly lowers request rate but does not improve resident-life reasoning;
- local life still requires periodic provider novelty;
- random wandering/chatter is being used to hide inertness;
- new personhood exists only in prompt prose;
- event queues grow without explicit unresolved meaning;
- one resident's movement repeatedly causes unrelated provider cognition in others;
- the local brain remains only a command executor;
- a new framework is being introduced before a resident failure demands it;
- map/content volume increases without increasing causal affordance density;
- instrumentation becomes more convincing than the actual world;
- a green gate answers "did machinery execute?" but not "was the resident behavior sensible?".

---

## 11. `CONTINUE` semantics

A short Owner instruction such as `continue`, `kontynuuj`, `ruszaj` means:

> Continue the post-stress recovery objective intelligently through safe, reversible work until the next real evidence boundary.

Before acting:
1. recover this document and latest Owner correction;
2. verify volatile branch/HEAD/PR truth;
3. identify the highest-value unresolved recovery gate;
4. finish or falsify that gate before opening another subsystem;
5. preserve `c181...` as the failure specimen;
6. prefer integrated resident-life evidence over abstract architecture work;
7. do not wait for another Owner prompt after every local success.

Ask the Owner only when:
- human feel/taste is genuinely the missing evidence;
- a major irreversible product choice cannot be recovered from context;
- destructive, financial or security-sensitive action is needed;
- two materially different directions remain equally plausible after evidence.

Do not interpret `continue` as permission to merge to main.

---

## 12. Documentation authority

Current recovery order:

1. **\`latest explicit Owner correction\`**
   - outranks product-level interpretations for the same claim;
2. **\`docs/SPC_POST_STRESS_RECOVERY_PROGRAM.md\`**
   - canonical post-stress execution authority;
3. **\`docs/SPC_R6_COMPLEMENTARY_PERSONHOOD_EXPERIMENT.md\`**
   - binding current R6 experiment contract;
4. **\`docs/SPC_R6_PLAN_REVISION_REFUSAL_FINDING.md\`**
   - current plan-revision authority: bounded multi-matter relinquishment mechanism is deterministically defended; run #33 is live-neutral for actual relinquishment and must not be rerolled;
5. **\`docs/SPC_R6_SYMMETRIC_SOCIAL_NONACTION_FINDING.md\`**
   - preceding symmetric social/non-action authority: run #32 is behaviorally neutral, and the resulting causal-attribution gap for deliberate non-action is now deterministically repaired;
6. **\`docs/SPC_R6_COUNTERPARTY_SOCIAL_HISTORY_FINDING.md\`**
   - preceding counterparty-history authority: exact Nela release survives beyond recent/current life as bounded provenance and is cited by real Luna; run #31 is behaviorally neutral and does not prove relationship state;
7. **\`docs/SPC_R6_SAME_CARDINALITY_OUTCOME_MEANING_FINDING.md\`**
   - strongest own-outcome meaning result: at fixed actor/history count/support identities, two succeeded outcomes versus two blocked outcomes produced opposite real-Luna C-vs-D choices and both exact old facts were cited;
8. **\`docs/SPC_R6_CUMULATIVE_SAME_ACTOR_HISTORY_FINDING.md\`**
   - preceding cumulative-history result: two independent terminal same-actor factual outcomes jointly changed a later real-Luna C-vs-D judgement while old matters remained absent from current life;
9. **\`docs/SPC_R6_DELAYED_FACTUAL_HISTORY_CHOICE_FINDING.md\`**
   - preceding delayed-history result: A may leave recent/current life, become exact causal genealogy of current C after later relevance, and change a real-Luna C-vs-D choice without reopening A;
10. **\`docs/SPC_R6_ENDOGENOUS_COMPETING_FUTURE_RUNTIME_FINDING.md\`**
   - deterministic provenance/composition authority for the normal A → delayed reacquisition/C + B → D → genuine choice chain;
11. **\`docs/SPC_R6_COMPETING_FUTURE_FACTUAL_HISTORY_FINDING.md\`**
   - preceding near-term exact real-Luna competing-future split and local causal admission;
12. **\`docs/SPC_R6_POST_TERMINAL_FACTUAL_HISTORY_FINDING.md\`**
   - preceding single-opportunity neutral finding; authoritative for what run #24 did and did not prove;
13. **\`docs/SPC_R6_ENDOGENOUS_ORDINARY_PERSONHOOD_FINDING.md\`**
   - bounded positive endogenous standing-history finding and evidence/nonclaim boundary;
14. **\`docs/SPC_R6B_NATIVE_STANDING_SOCIAL_CONTINUATION_PASS.md\`**
   - qualified bounded R6 mechanism evidence;
15. **\`docs/SPC_R6A_STANDING_SOCIAL_COMMITMENT_PASS.md\`**
   - earlier bounded R6-A evidence and nonclaims;
16. **R5 evidence documents**
   - semantic escalation, stale attention, provider outcomes and real-Luna causal boundary;
17. **R4 / R3 / R2 / R1 qualified evidence documents**
   - preserved scoped evidence, not current feature sequence;
18. **\`docs/SPC_NEXT_OWNER_INTENT_AND_GAP_AUDIT.md\`**, pressure/re-observation documents
   - durable Owner/product guardrails and donor evidence;
19. **\`docs/SPC_LIVING_WORLD_EXECUTION_PROGRAM.md\`** and older recovery/Pass-2 documents
   - historical evidence only.

\`docs/PROJECT_STATE.md\`, \`docs/FRESH_TAKEOVER.md\`, \`docs/SPC_NEXT_CURRENT_STATE_RECONCILIATION.md\` and older architecture-recovery documents must **not** be used as the current feature sequence.

When prose conflicts with live evidence, live evidence wins and prose must be corrected.
---

## 13. Current work order

Completed and retained only within their documented scopes:

1. preserve `c181...` as the immutable composition-level failure specimen;
2. R1 zero-provider local life — PASS;
3. R2 semantic metabolism — PASS;
4. R3 first causal-personhood milestone — PASS;
5. R4 dense authored affordance surface — QUALIFIED PASS;
6. R5 semantic escalation / provider safety / real-Luna causal boundary — QUALIFIED PASS;
7. R6-A standing social commitment — QUALIFIED BOUNDED PASS;
8. R6-B native standing social continuation — QUALIFIED BOUNDED PASS;
9. Oren → Nela generated standing history and Worker-context join — deterministic/domain GREEN;
10. direct-request real-Luna history-dependent Oren choice — POSITIVE FINDING;
11. exact counterparty-grounded release — deterministic/domain GREEN;
12. runtime-generated no-fresh-command endogenous standing-history twin — deterministic exact-context GREEN;
13. canonical live Luna endogenous standing choice run #22 — MATERIAL POSITIVE FINDING;
14. exact live history proposal replay → factual Oren return — deterministic World GREEN;
15. `complete_standing` exact factual-outcome lifecycle — bounded deterministic GREEN;
16. live Luna factual fulfilment run #23 + exact local replay — LIVE-SEMANTIC + deterministic lifecycle GREEN;
17. post-terminal Janek single-opportunity factual-history probe + live run #24 + replay — BOUNDED NEUTRAL / semantic uptake only;
18. competing-future terminal-history support + live run #26 + replay — MATERIAL BOUNDED POSITIVE / near-term history-caused behavioral difference observed;
19. endogenous competing-future runtime generation — original BOUNDED DETERMINISTIC PASS at `d0163c78...`;
20. delayed same-object factual-history durability — **BOUNDED DETERMINISTIC + LIVE-SEMANTIC POSITIVE**:
    - strengthened endogenous chain `b4861568d222f11f3f0b0621cae14c92088acdc9`: A leaves recent/current life before reacquisition, then archive-backed relevance creates C and normal B outcome creates D; Check #1725 **279 / 279 files, 1006 / 1006 tests**;
    - Live Provider run #27 `ebf41ab8d67c86dd4eb4b3e4c8a30978ef73b827`: control `defer_all`, delayed-history `focus_matter(retry)`, exact old factual outcome cited, exactly two Luna calls, zero retries;
    - exact replay `31a162e7debd25ec1d2aa742963e34cc67a225fb`: local admission GREEN, Check #1724 **279 / 279 files, 1006 / 1006 tests**.
21. cumulative same-actor factual history — **MATERIAL BOUNDED POSITIVE; bounded CLOSED**:
    - characterized gap: two old Ida communication outcomes survive bounded archive but have no legal path into later Ida-vs-other choice;
    - earned repair: bounded typed `prior_same_actor_outcome` genealogy on a current exact-same-actor `communicate_actor` matter, max 8 most recent, no score/sentiment;
    - Live Provider run #29 `900d626b9049a43438993a96e7b442c6e59aa369`: control `defer_all`, history `focus_matter(other)`, **both** old Ida outcomes cited, exactly two Luna calls, zero retries;
    - run #28 is zero-spend apparatus-only failure before inference;
    - exact local replay `0bf8ad82e691c6fbd8accf7d975a0bb7d71574f8`: Check #1753 **284 / 284 files, 1020 / 1020 tests**, Browser Evidence #977 PASS.
22. same-cardinality factual outcome meaning — **MATERIAL BOUNDED POSITIVE; bounded CLOSED**:
    - deterministic World-grounded contrast creates exactly two structured same-actor communication outcomes in each history through `ResidentMessageDeliveryExecutor`: either `2×succeeded` or `2×blocked: recipient_absent_at_best_known_contact`;
    - actor, eligible history count, source/evidence IDs, current C/D and body state are held fixed; existing `task_outcome.summary` preserves the factual distinction without new personhood representation;
    - Worker frozen twin accepts both histories with identical legal evidence-ID/schema surfaces;
    - Live Provider run #30 `d4dd09c0d6afefefaf60772ebdb169728128b548`: succeeded-history `focus_matter(current Janek C)`, blocked-history `focus_matter(unrelated D)`, both sides cite both exact old outcomes, exactly two Luna calls, zero semantic retries;
    - exact local replay: Check #1766 **287 / 287 files, 1026 / 1026 tests**, typecheck/build/preview PASS.
23. counterparty-caused social history — **BOUNDED NEUTRAL LIVE FINDING / PROVEN DURABLE PROVENANCE, BEHAVIORAL EFFECT UNPROVEN**:
    - characterized gap: exact Nela release of Oren's standing commitment disappeared after recent-evidence churn and had no legal route into later Nela choice;
    - earned repair: separate bounded terminal social-lifecycle archive + typed \`prior_counterparty_social_outcome\`, exact standing source/counterparty/World occurrence/release evidence, no relationship score;
    - normal production later creates Nela C with that history automatically; snapshot/boundedness/Worker/local admission are defended;
    - Live Provider run #31 \`14383cec2e7e75b07d8ed240d076aa1e935695f2\`: control \`focus_matter(C=Nela)\`, history also \`focus_matter(C=Nela)\`; history cites exact release; exactly two Luna calls, zero retries; classification \`COUNTERPARTY_SOCIAL_HISTORY_UPTAKE_WITHOUT_BEHAVIOR_CHANGE\`;
    - exact replay \`ddef04f5a098ea7b6894dea57723879652d33943\`: Check #1789 **292 / 292 files, 1037 / 1037 tests**, typecheck/build/preview PASS.
24. symmetric social-vs-social counterparty history + causal non-action — **BOUNDED NEUTRAL LIVE + DETERMINISTIC CONTRACT PASS**:
    - deterministic generated Oren Nela-vs-Ida ambiguity: old Nela release fully settled in its own period, equal-salience current reasons originate together, normal causal cognition cadence forms both current social futures behind a carrier, old standing absent;
    - Live Provider run #32 \`9a0086a0a06fcf2d108ea7bdca32053f3a388f60\`: control \`defer_all\`, history also \`defer_all\`; history rationale explicitly considers the release but old defer schema cannot cite it; exactly two Luna calls, zero retries; classification \`SYMMETRIC_SAME_DECISION_NO_COUNTERPARTY_HISTORY_USE\`;
    - run #32 is not retroactively promoted after repair;
    - earned gap: deliberate non-action had no causal evidence surface;
    - repaired contract admits optional bounded \`defer_all.supportEvidenceIds\` from the frozen union of candidate support only, preserves legacy defer and rejects forged evidence;
    - exact run-#32 replay remains legal; Check #1809 **296 / 296 files, 1045 / 1045 tests**.

25. resident plan revision / refusal — **DETERMINISTIC MECHANISM PASS + BOUNDED NEUTRAL LIVE RELINQUISHMENT RESULT**:
    - characterization proves `focus_matter(D)` and `defer_all` postpone C but do not remove C from resident life; after D ends, lone C auto-reacquires body authority;
    - earned repair adds target-local evidence-grounded `relinquish_matter`, one-shot non-clonable revision grant and separate stale-safe `ResidentLifePlanRevisionAuthority`;
    - ordinary origin/current wording alone cannot authorize plan deletion; exact factual support attached to the target is required;
    - Live Provider run #33 `677df1acc0c029d8ad6761556f5840139326be37`: succeeded history `focus_matter(C)`, blocked history `focus_matter(D)`; both cite both old outcome facts, neither relinquishes C; exactly two Luna calls, zero retries;
    - exact local replay `db6453abee0263eb4c8f1153d2d94f8082d2b5a9`: no revision grant is smuggled out of either focus decision; Check #1831 **300 / 300 files, 1057 / 1057 tests**, Browser Evidence #1055 PASS.


Current:

> **R6 personhood breadth — durable history now reaches action selection, factual outcome meaning, comparative social judgement, deliberate non-action and a bounded locally-authorized multi-matter plan-revision mechanism without becoming direct World/body authority. Run #33 did not exercise relinquishment, so live behavioral plan revision remains unproven. The next pressure is single-current-plan autonomous reappraisal.**

The explicit-standing-obligation endogenous stage remains **bounded CLOSED**.

The delayed same-object factual-history stage is now **bounded CLOSED**.

The post-terminal material evidence sequence has four distinct layers:

- run #24: terminal history reached real cognition and changed rationale, but not behavioral class;
- run #26: near-term terminal factual history changed behavioral class in genuine competing futures and cited exact old evidence;
- `b4861568...`: after unrelated evidence churn removes A from current life **before** reacquisition, normal resident/World authorities still create C with typed A provenance, independently create D and reach `choice_required(C,D)`;
- run #27 + exact replay: with A absent from both provider current-life twins, candidate-scoped delayed history alone changes the behavioral class from `defer_all` to `focus_matter(retry)` and survives local admission.

Canonical records:

- `docs/SPC_R6_POST_TERMINAL_FACTUAL_HISTORY_FINDING.md`;
- `docs/SPC_R6_COMPETING_FUTURE_FACTUAL_HISTORY_FINDING.md`;
- `docs/SPC_R6_ENDOGENOUS_COMPETING_FUTURE_RUNTIME_FINDING.md`;
- `docs/SPC_R6_DELAYED_FACTUAL_HISTORY_CHOICE_FINDING.md`;
- `docs/SPC_R6_CUMULATIVE_SAME_ACTOR_HISTORY_FINDING.md`;
- `docs/SPC_R6_SAME_CARDINALITY_OUTCOME_MEANING_FINDING.md`;
- `docs/SPC_R6_COUNTERPARTY_SOCIAL_HISTORY_FINDING.md`;
- `docs/SPC_R6_SYMMETRIC_SOCIAL_NONACTION_FINDING.md`;
- `docs/SPC_R6_PLAN_REVISION_REFUSAL_FINDING.md`.

Run #25 remains explicitly non-semantic apparatus evidence: strict-schema failure, no proposal, zero token usage.

Immediate method:

- preserve runs #24/#26/#27/#29/#30/#31/#32/#33 exactly as their canonical findings describe;
- do not rerun #32 after causal defer-all repair and do not rerun #33 merely to obtain a relinquishment sample;
- preserve the distinction between live neutral evidence and later deterministic contract repair;
- keep history as bounded provenance, never direct body/World authority;
- retain evidence-grounded `defer_all` as causal non-action, not a hidden priority score;
- retain target-local `relinquish_matter` as a bounded multi-matter mechanism, not proof of generic refusal;
- next characterize **single-current-plan autonomous reappraisal**: can one lone current legal matter be reconsidered for exact resident-owned reasons without manufacturing a competing D or a periodic provider heartbeat?
- preserve terminal/history truth and stale-safe local lifecycle authority on any future revision path;
- do not add preferences, aversion, trust, affinity, habits, gratitude or generic autobiographical state before a concrete failure earns them;
- retain Browser Oren/Nela genericity as honest promotion-plane debt;
- keep full R6 / five living residents / Owner-observed ordinary personhood **UNPROVEN**;
- do not prepare an Owner gate or merge PR #148 by CI inertia.

Next research question:

> **Can one already-current plan be endogenously reconsidered and relinquished when it is the resident's only current legal future, because new or recovered resident-owned evidence changed its meaning — without requiring a competing future, periodic provider heartbeat or generic preference state?**

The earlier Nela-vs-Ida counterparty-history question remains behaviorally unproven, but it is no longer the highest-information frontier and must not displace the single-plan autonomy pressure by inertia.

The architecture must continue to be earned by resident-life pressure, not by a desire to fill a personality feature list.
