# SPC Next — Cross-project donor map

Date: **2026-09-15**  
Status: **RESEARCH SYNTHESIS / NON-BINDING DONOR MAP**

This document records current cross-project research that may help `LLM Live NPC / SPC Next` without making those sibling projects architecture owners.

It is intentionally **not** a final SPC architecture specification. A donor idea becomes SPC authority only after it is translated into a local falsifiable experiment and earns evidence in the SPC runtime.

Canonical SPC recovery authority remains:

- `docs/SPC_NEXT_OWNER_INTENT_AND_GAP_AUDIT.md`
- `docs/SPC_NEXT_ARCHITECTURE_RECOVERY_GATE.md`
- `docs/SPC_NEXT_RECOVERY_LEDGER.md`

The purpose of this map is to prevent two opposite failures:

1. forgetting valuable lessons already earned elsewhere;
2. importing another project's machinery wholesale without proving that its causal problem exists here.

---

# 1. Central synthesis

Several independent projects are converging on the same meta-lesson from different directions:

> **Do not collapse distinct truths/lifetimes/representations merely because a small prototype can make them coincide.**

Different projects expose different forms of this mistake:

- **FrameMatter:** logical Matter identity is not coordinate identity, physics-body identity, collider identity or current provider identity; logical Space is not current engine provider.
- **Multi_World:** World lifetime is not roster lifetime, ActorSession lifetime or transport/device lifetime.
- **Gloopipelago:** logical World is not browser View; research witnessing is not simulation authority.
- **Companion-Brain-Lab:** evidence about a future is not the intervention that causes that future; hard-body safety is not cooperation; cooperation preference is not automatically a scalar candidate score.
- **Feniks / LOD's World:** fidelity/representation level is not truth or identity.
- **Coopege:** canonical GameWorld/save state is not presentation/network snapshot; authored spawn identity can outlive active actor representation.
- **SPC recovery itself:** World truth is not resident observation, recognized identity, belief or remembered belief; continuing matter is not current bodily activity; activity is not factual World outcome; resident life is not provider-request lifetime.

These should be treated as a family of **separation laws**, not as requirements to create one giant abstraction layer.

---

# 2. A useful SPC separation lattice

The current donor research suggests at least five different axes that must remain conceptually separable.

## 2.1 Reality / representation

Potential long-term distinction:

`logical entity identity`
!= `current physical provider/body`
!= `current render node`
!= `participant projection`
!= `research projection`
!= `persistence representation`
!= `transport/network snapshot`

Immediate consequence:

- `crate.workshop.01` should not *be* a Phaser object or physics handle;
- Janek should not *be* his current body implementation;
- an authored place should not *be* a routing waypoint or renderer label.

FrameMatter is the strongest internal donor here. Its current research state explicitly defends:

- Matter identity != storage coordinate != provider/collider identity;
- logical Space != current provider != simulation domain;
- static/dynamic provider replacement may preserve one logical Space;
- topology split is different: the source retires and explicit successors are created rather than arbitrarily pretending one fragment is still the old whole.

SPC should not copy FrameMatter's implementation. The donor value is the identity discipline.

## 2.2 Epistemic state

Potential distinction:

`World fact`
→ `sensory provenance`
→ `resident-safe observation`
→ `recognized identity / acquired place knowledge`
→ `belief / uncertainty`
→ `remembered belief / episode`

Current T0 recovery is already the first small enforcement of this axis.

Long-term consequence:

- physical actor ID != resident-recognized person identity;
- faction/group knowledge != every member's knowledge;
- an actor saying proposition P proves that the actor said P, not that P is World truth;
- a remembered location can become stale without becoming false historical evidence;
- checked absence is local evidence about an inspected place/time, not global nonexistence.

Feniks social/epistemic LOD and old Living perception are important donors here.

## 2.3 Meaning / execution / outcome

Potential distinction:

`continuing matter / purpose (WHY)`
→ `available World affordance (WHAT CAN BE DONE)`
→ `local skill / execution strategy (HOW)`
→ `World action validation / resolution`
→ `factual outcome (WHAT ACTUALLY HAPPENED)`

This is probably the most important near-term synthesis.

The first SPC life slice should not recover `work` as a narrative activity label. It should force a real World object/action consequence.

External donor: Unreal Engine Smart Objects (5.8) model activities/slots as World-side opportunities that can be spatially queried/claimed; behavior execution belongs to the interactor rather than the object. The useful concept is not to copy Smart Objects, but to preserve the ownership split:

> **matter owns why; World object/affordance owns what is physically available; local brain owns how; World owns whether it actually happened.**

Source:

- Epic Smart Objects overview: https://dev.epicgames.com/documentation/unreal-engine/smart-objects-in-unreal-engine---overview

## 2.4 Lifetimes

Potential independent lifetimes include:

- logical World / WorldEpoch;
- resident identity/life;
- physical body representation;
- human/AI control source;
- continuing matter;
- task/run;
- cognition proposal attempt;
- provider/HTTP request;
- presentation/client session;
- network transport/device connection.

Multi_World currently states the key donor distinction explicitly:

`world lifetime != roster lifetime != ActorSession lifetime != transport/device lifetime`

For SPC the analogous rule is:

> model/API failure, player disconnect, body reconstruction or simulation-fidelity change must not silently create a new resident or erase unresolved life.

This does **not** require persistence/networking work now. It only means new SPC state should avoid being keyed to ephemeral provider requests, body handles, browser objects or transport sessions.

## 2.5 Fidelity / LOD

Feniks's `LOD's World` should be treated as a future north star, not an immediate subsystem.

The cross-project research strongly argues against one monolithic field such as:

`residentLOD = HIGH | MEDIUM | LOW`

A more plausible long-term model is a **fidelity vector** whose dimensions may change independently:

- physical simulation fidelity;
- local-brain update fidelity;
- sensory/perception fidelity;
- social/ecology fidelity;
- LLM cognition frequency/depth;
- rendering/animation representation;
- history/evidence retention fidelity;
- persistence/streaming representation.

This is supported by multiple donors:

- Feniks: one reality, multiple representations and compute layers; compression/expansion must preserve truth, provenance, obligations and identity;
- FrameMatter: logical identity, representation provider, update locality and physical partitions are different concepts;
- Unreal Mass: Simulation LOD and Representation LOD are separate runtime concepts, with separate update/visibility concerns.

Epic sources:

- https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MassLOD
- https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MassLOD/FMassSimulationLODFragment
- https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MassRepresentation/FMassRepresentationParameters

Immediate SPC rule: **do not implement LOD now, but avoid coupling identity, matter, cognition, body and render lifetimes in ways that make future fidelity transitions equivalent to replacement.**

---

# 3. Donor: Companion-Brain-Lab

## 3.1 Current live lesson

As of this research checkpoint:

- A1.2n exact qualified head `ef8d1d2da942e7737181c684eb6d2160ad303bd6` passed validate #981;
- it is the first bounded pairwise G4 cooperation preference experiment;
- post-A1.2n replan is PR #42 / head `5f0634d8f59a38e81ba5222a3b02e366db13aaf9`.

Key findings:

1. physical admissibility/safety and teammate cooperation are separate questions;
2. cooperation can be a **relation between alternative futures**, not a scalar property of one candidate;
3. a candidate family label is not the same thing as a concrete executable command;
4. robustness under uncertainty must evaluate the **same concrete command** across honest player counterfactuals;
5. unresolved evidence must remain unresolved rather than being silently replaced by another hypothesis;
6. same-physics query-only rehearsal can be useful evidence without acquiring runtime movement authority.

## 3.2 SPC donor value

This is highly relevant to the future local brain, especially actor↔actor movement.

Example:

Janek carrying a crate meets the player in a narrow passage.

Separate questions should remain separable:

- can Janek physically continue?
- would it collide/contact?
- is contact structurally unsafe?
- does continuing unnecessarily obstruct the player?
- is yielding compatible with Janek's current matter?
- is the matter urgent enough to justify a different social choice?

Do not collapse this into one weighted `movementScore` prematurely.

A plausible future layered local decision may preserve:

- hard invalidity/safety constraints;
- pairwise cooperation/right-of-way preferences;
- matter progress/urgency;
- relationship/social evidence;
- uncertainty/robustness.

No exact ordering or scalarization is promoted yet.

## 3.3 Donor to cognition-pressure design

Companion also suggests a useful escalation ladder:

1. ordinary path correction → local brain;
2. physical obstacle/contact → local movement/recovery;
3. physically admissible alternatives with cooperation difference → local social movement policy;
4. known alternate local method/affordance → local competence;
5. semantic prerequisite broken, competing matter, genuine uncertainty or major social request → LLM cognition pressure.

This helps prevent every collision/path change from becoming an LLM event.

## 3.4 What not to import

Do not port the current A1.2 gate/candidate matrix wholesale into SPC.

SPC should adopt Companion machinery only when a real resident-life scenario creates the corresponding pressure. Same-physics rehearsal should eventually be spatially/situationally local, not a global future simulator for all residents.

---

# 4. Donor / north star: Feniks and `LOD's World`

Feniks is not a code donor for SPC. It is currently the strongest sibling source of world semantics.

Important current direction:

- authored world + systemic causality;
- actors have limited knowledge, own matters, private histories and consequences;
- ecology/group state exists independently of player attention;
- `LOD's World` means one causal reality represented/computed at multiple fidelities;
- fidelity depends not only on distance, but also observation, interaction, significance, history, social context and event instability;
- temporal LOD means one chronology with different resolution/update rates;
- coarse simulation may resolve routine continuation but must not invent unsupported dramatic events;
- promotion/demotion/reconciliation must preserve identity, provenance, obligations and epistemic honesty.

## SPC consequence

The current five-resident laboratory should be treated as the smallest high-fidelity specimen of a much larger possible future world.

The first Janek material-life slice should therefore preserve seams that could later answer:

- what is still true if Janek becomes offscreen/coarse?
- which unresolved matters survive demotion?
- what factual progress can routine coarse simulation safely advance?
- what uncertainty forces promotion back to higher fidelity?
- what evidence must exist when the player returns?
- how do we avoid retroactively fabricating exact unseen events?

Do not implement those answers yet.

---

# 5. Donor: FrameMatter-Lab

Current P1 rebuild is especially valuable because Owner-facing interaction falsified a mechanically sophisticated but misleading consumer.

Strong donor lessons:

## 5.1 No fake affordances

A visible floor that does not collide, a displayed capsule that is not a real volumetric controller, or visibly separated Matter that remains secretly one rigid construct all produce bad evidence even when underlying tests are green.

SPC analogue:

- an anchor icon is not a physical place the resident can see/use;
- `work` text is not work;
- a speech bubble is not proof the player could hear it;
- an `interaction` occurrence is not proof the World resolved an action;
- debug text explaining intended behavior cannot substitute for visible physical consequence.

## 5.2 Logical identity != current provider

FrameMatter explicitly defends logical Matter/Space identity across provider replacement and coordinate maintenance.

SPC analogue:

- resident/object identity should survive future body/provider reconstruction;
- same location does not imply same object identity;
- destroying an object and recreating a similar object at the same position should not automatically resurrect its historical identity;
- future object split/merge/destruction should use explicit succession semantics where needed rather than location-based identity guesses.

## 5.3 Quality planes

FrameMatter's current quality system distinguishes:

1. Owner-intent truth;
2. substrate truth;
3. composition truth;
4. observable truth;
5. interaction truth;
6. promotion truth.

This is extremely relevant to SPC because the project already suffered claim inflation from green headless tests and research telemetry.

SPC should not mechanically copy FrameMatter governance, but the next life-slice campaign should be judged as a **scenario × truth-plane matrix**, not a flat list of feature PASSes.

Example Janek slice:

- substrate: matter/run/object authority correct;
- composition: resident + World + interaction + cognition compose;
- observable: crate/interruption/resume is readable from the world;
- interaction: Owner can interfere naturally;
- live-provider: semantic reconsideration survives real latency/failure;
- five-resident pressure: the same architecture survives unrelated actors/events;
- promotion: one exact integrated runtime is actually worth Owner attention.

Source:

- `FrameMatter-Lab/docs/QUALITY-SYSTEM.md`
- `FrameMatter-Lab/docs/research-state.md`
- `FrameMatter-Lab/docs/p1-professional-rebuild-audit.md`

---

# 6. Donor: Gloopipelago

Gloopipelago is unexpectedly relevant to SPC observability.

## 6.1 Living world primary; causal apparatus secondary

Its project identity explicitly says the living world is primary and causal apparatus is enabling infrastructure.

This maps directly to the SPC correction:

> do not let the research panel become the product or the source of perceived life.

## 6.2 Passive downstream witness

M2a qualifies a lifecycle witness that:

- observes factual transitions;
- receives detached scalar/copy records;
- is optional;
- may throw or mutate its own payload without perturbing authoritative simulation;
- does not force the core simulation to retain a growing history collection.

SPC should eventually separate:

### Resident-owned causal memory

Evidence required for behavior, belief and continuing matters.

### World factual transitions

Authoritative occurrences/outcomes produced by World actions.

### Research witness/history

Optional downstream recording for humans/tests; never resident knowledge and never reverse authority.

This may be a better long-term direction than storing every research trace inside resident/world runtime objects.

## 6.3 Logical World != browser View

Gloopipelago M3 was triggered because viewport authority materially changed simulated trajectories.

SPC consequence:

- camera size/zoom/research focus/UI layout must never change World size or resident perception range unless explicitly designed as a gameplay intervention;
- spectator/research camera is presentation authority only;
- participant perception is derived from World/player senses, not what the renderer happens to draw.

Sources:

- `Gloopipelago/README.md`
- `Gloopipelago/docs/CURRENT_STATE.md`
- `Gloopipelago/evidence/m2a/M2A_QUALIFICATION_REPORT.md`

---

# 7. Donor: Multi_World / Cloudflare multiplayer lab

Strongest donor is lifetime/authority separation, not networking code.

## 7.1 Shared physical truth

Durable objective:

> another person's actions should feel like consequences in the same place, not synchronized coordinates.

This maps cleanly to resident/player co-presence.

## 7.2 Actor/session/transport continuity

Multi_World has already earned bounded evidence for one ActorSession surviving transport loss/recovery while remaining in the same WorldEpoch.

SPC analogue:

- LLM provider failure must not reset resident life;
- browser/research scene reconstruction must not reset resident identity;
- future player disconnect/rejoin should not reset existing resident consequences;
- body/presentation replacement should be treated separately from semantic continuity.

## 7.3 Late roster vs world lifetime frontier

Current frontier asks whether one world can already evolve with actor 0, retain physical consequences and admit actor 1 later without replacing/resetting the WorldEpoch.

Future SPC relevance:

- world exists before/without human player presence;
- adding another human/SPC controller should not imply world reset;
- actor slot/existence and active control/session occupancy should remain separable concepts.

Sources:

- `cloudflare-multiplayer-lab/README.md`
- `docs/WORLD_V0_ROSTER_LIFETIME_FRONTIER.md`

---

# 8. Donor: Coopege

Coopege is useful mainly for authored-world and representation/persistence boundaries.

Defended/current characteristics include:

- canonical deterministic `GameWorld` independent of DOM/camera/renderer;
- stable IDs/checksums;
- serializable authored spawns expanded into canonical runtime spawn states;
- explicit save schema and migrations;
- active actor limits plus sleep/respawn/threat lifecycle outside the camera;
- authoritative host owns GameWorld/save;
- client/network snapshot is a separate presentation protocol, not the save format.

## SPC donor value

### Authored definitions vs runtime truth

As the five-resident map grows, hard-coded TypeScript region/object tables should eventually give way to validated authored data with stable IDs.

Do not build that schema now. Trigger extraction when the first few real material objects/places make code authoring genuinely painful.

### Active representation vs canonical lifecycle

Coopege's active/sleep actor model is too simple to copy as Feniks-quality LOD, but it demonstrates the useful principle that a canonical actor/spawn lifecycle can outlive active full representation.

### Persistence vs presentation

SPC should eventually avoid using one public snapshot as:

- save state;
- network state;
- debug state;
- player presentation;
- resident knowledge.

These are different projections with different privacy and lifetime contracts.

Source:

- `Coopege/AI_PROJECT_MEMORY.md`
- `Coopege/README.md`

---

# 9. External research: structured resident memory

Two external results are useful as direction checks, not architecture authorities.

## Ella (2025)

Embodied social agents in a 3D community use structured long-term memory with distinct name-centric semantic memory and spatiotemporal episodic memory; 15 agents are evaluated over days of social activity.

Source:

- https://arxiv.org/abs/2506.24019

## Memory in the Age of AI Agents (2025 survey)

The survey argues that traditional short-term/long-term terminology is insufficient and distinguishes, among other axes, factual, experiential and working memory functions.

Source:

- https://arxiv.org/abs/2512.13564

## SPC consequence

Do not make `ResidentMind` a single universal bag.

Likely long-term conceptual separations include:

- working context / attention;
- factual/semantic knowledge and beliefs;
- experiential/episodic evidence/history;
- skills/procedural competence;
- continuing matters/purposes;
- social identity/recognition;
- research-only witness history.

Critically:

> **matter is not memory; evidence is not belief; research trace is not resident memory.**

No final memory storage architecture is promoted yet.

---

# 10. The first material Janek slice — refined donor-driven hypothesis

Cross-project research strengthens the case for a tangible object rather than an abstract `workProgress` bar.

A high-information first slice could be:

> **Janek has his own continuing matter to move one specific crate from the workshop to a market/storage destination.**

This is not yet an implementation decision, but it is a strong experimental candidate because one small object pressures many needed boundaries honestly.

## Required factual state

Potential minimal World truth:

- stable crate logical ID;
- crate state: at world position / carried by actor / placed at destination;
- current holder is possession, not social ownership;
- pickup/drop/placement are authoritative World actions with reach/condition validation;
- crate visual position is derived from factual state;
- action outcome emits factual evidence only after resolution.

Do **not** add economy/inventory/crafting/general ownership yet.

## Resident semantics

- Janek's continuing matter refers to the logical crate and destination purpose;
- current body activity may approach/pick up/carry/place, but interruption does not erase the matter;
- local brain should resume routine continuation without asking the LLM to remember obvious physical work;
- LLM escalation should occur when semantic assumptions break or real judgement is needed.

## High-information adversarial scenarios

### Nominal

Janek finds, picks up, carries and places the crate.

### Player calls while Janek is carrying

Tests matter != activity, attention/communication composition and local return.

### Player blocks the route

Tests local movement/cooperation without necessarily invoking LLM cognition.

Companion is the likely future donor here.

### Player physically takes/moves the crate while Janek can see it

Tests World ownership, observation, recognized actor, updated object belief and semantic reconsideration.

### Crate is moved while Janek cannot observe it

Janek should retain stale last-known evidence, not receive hidden truth.

Returning and checking the remembered location may create checked-absence evidence and then genuine uncertainty.

### Crate becomes unavailable/destroyed

Tests affordance invalidation and matter reconsideration rather than narrative task failure.

### Provider/model delay during interruption

Tests K0-K5 authority: old execution cannot continue illegitimately while semantic reconsideration is pending.

### Another resident wants/uses the same relevant slot/object

Later five-resident pressure; potential need for World-side claim/reservation semantics should be earned here rather than prebuilt.

## Why this is a strong future LOD specimen

The same scenario can later be used to test:

- high-fidelity execution near the player;
- coarse routine progress offscreen;
- preservation of crate identity/possession/matter across fidelity transitions;
- promotion back to high fidelity when conflict/uncertainty occurs;
- player return to a world whose consequences happened without being fabricated retroactively.

---

# 11. Research observability — refined architecture hypothesis

Current donor evidence suggests two distinct systems are needed.

## 11.1 Behavioral provenance

Resident-owned minimum evidence required for actual decisions/matters.

This must remain causally reconstructable while relevant.

## 11.2 Detached research witness

A downstream diagnostic surface should observe factual transitions without becoming resident knowledge or World authority.

Desirable long-term properties inspired by Gloopipelago:

- detached immutable/copy payloads;
- optional sink;
- sink failure cannot perturb World/resident behavior;
- no growing retained history in the core merely because research is enabled;
- external retention policy can be bounded/exportable;
- participant view, spectator view and private-resident research view remain separate projections.

Potential causal chain to witness:

`World fact`
→ `resident acquisition`
→ `matter/discrepancy`
→ `cognition attempt`
→ `semantic revision`
→ `run/action`
→ `World outcome`
→ `new evidence`.

Do not expose hidden model chain-of-thought; system state/provenance is sufficient.

---

# 12. A better cognition escalation boundary

One major long-term goal is to let the local brain become a genuine second intelligence rather than an LLM executor.

Donor synthesis suggests LLM cognition should be triggered by **semantic discrepancy**, not raw mechanical novelty.

Possible escalation ladder to falsify later:

### Level 0 — routine continuation

Known action/route/procedure remains valid.

Local brain only.

### Level 1 — mechanical correction

Minor blockage/path deviation/contact recovery.

Local embodied control only.

### Level 2 — local alternative / cooperation

Several physical ways to preserve the same matter exist; choose among them using local safety/cooperation rules.

Local brain; Companion donor may become useful.

### Level 3 — affordance/search problem

Expected object/slot/action is unavailable but known local alternatives/search competence exist.

Local brain may search/retry/check without LLM.

### Level 4 — semantic discrepancy

The resident's assumptions or plan meaning break:

- target genuinely absent after search;
- conflicting continuing matter;
- novel/socially significant request;
- dangerous or unprecedented condition;
- uncertain interpretation with meaningful consequences.

This is a strong candidate for LLM cognition pressure.

This ladder is not yet policy authority. It is a research hypothesis for preventing an event-inbox cognition architecture.

---

# 13. What should remain deliberately deferred

Cross-project donor enthusiasm must not re-expand scope horizontally.

Do **not** build now:

- generic SmartObject framework;
- complete inventory/economy/crafting;
- universal relationship/reputation model;
- final persistence schema;
- networking/multiplayer implementation;
- global LOD manager;
- generalized offscreen simulation;
- full same-physics future planner;
- large-scale ECS rewrite;
- final authored-world schema/editor;
- arbitrary object succession graph;
- generalized reservation system;
- global utility-score architecture.

Pressure from real resident-life slices should earn these seams one at a time.

---

# 14. Immediate implications for SPC recovery

This research does **not** replace the current T0/T2/K5 recovery frontier.

Recommended near-term interpretation:

1. finish T0 end-to-end so physical identity cannot bypass private recognition;
2. fix T2 enough that current cognition/memory cannot orphan evidence needed by live semantic state;
3. update the recovery ledger before further implementation so K5b/T0 progress is not lost;
4. start the first material Janek slice rather than another long horizontal substrate campaign;
5. give the first object/action model stable logical identity and World-owned outcome authority, but keep it minimal;
6. grow attention/facing/action channels only as that slice requires them;
7. use local movement/cooperation donors when actual actor contention appears;
8. keep live-provider integration early enough that latency/failure is tested on the real life slice rather than after the architecture fossilizes;
9. evaluate the same life slice across causal, observable, interaction, provider and five-resident evidence planes;
10. leave LOD/persistence/multiplayer as future pressure while deliberately preserving their identity/lifetime seams.

---

# 15. Source index / donor freshness

## LLM Live NPC / SPC

- `docs/SPC_NEXT_OWNER_INTENT_AND_GAP_AUDIT.md`
- `docs/SPC_NEXT_ARCHITECTURE_RECOVERY_GATE.md`
- `docs/SPC_NEXT_RECOVERY_LEDGER.md`

## Companion-Brain-Lab

Fast-moving source; verify live PRs before implementation decisions.

At this checkpoint:

- PR #41: A1.2n scoped PASS / pairwise G4 cooperation;
- PR #42: post-A1.2n robustness replan.

## FrameMatter-Lab

- `docs/research-state.md`
- `docs/p1-professional-rebuild-audit.md`
- `docs/QUALITY-SYSTEM.md`
- PR #1 `rebuild/p1-interactive-foundation`

## Gloopipelago

- `README.md`
- `docs/CURRENT_STATE.md`
- `evidence/m2a/M2A_QUALIFICATION_REPORT.md`

## Multi_World

- `README.md`
- `docs/WORLD_V0_ROSTER_LIFETIME_FRONTIER.md`

## Coopege

- `README.md`
- `AI_PROJECT_MEMORY.md`

## Feniks

Current Browser ChatGPT research/vision exploration on 2026-09-15; no claim that a repository implementation has yet earned LOD's World semantics.

## External

- Epic Smart Objects 5.8 overview: https://dev.epicgames.com/documentation/unreal-engine/smart-objects-in-unreal-engine---overview
- Epic Mass LOD 5.8: https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/MassLOD
- Ella: https://arxiv.org/abs/2506.24019
- Memory in the Age of AI Agents: https://arxiv.org/abs/2512.13564

---

# Closing research verdict

The strongest cross-project conclusion is not a component recommendation. It is a discipline:

> **SPC should grow by preserving causal separations and then forcing them to compose through concrete resident life.**

The next useful sophistication is therefore not a larger planner or a richer prompt. It is a small amount of **real world truth** that gives one resident something factual to care about, do, lose, recover from, remember and reconsider.

That is why the first material life slice now looks more valuable than another horizontal architecture tranche.