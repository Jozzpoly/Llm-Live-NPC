# SPC Next — adversarial refoundation audit

Status: active repair campaign on draft PR #125. This document is a checkpoint, not a declaration that the new architecture is ready.

## Audit question

Does the fresh five-resident refoundation actually improve the causal and product foundations of LLM Live NPC, or does it merely rename old failure modes behind cleaner modules?

Baseline compared against:
- the current SPC Next branch;
- `FIRST_HEARTH_FOUNDATION.md` and `CONTINUITY_OWNER_BUILD.md` at the integration base;
- the product pressure from a larger Tibia-like / mini-MMO living region rather than a small AI room.

## Current verdict

**Architecture direction: promising. Qualification: not yet sufficient.**

The new branch has real improvements: one authoritative World clock, independent resident runtimes, spatial candidate indexing, explicit high-level cognition directives, exact request authority, embodied communication, hierarchical region topology, and a model-agnostic multi-resident cognition coordinator. Latest CI at the opening of this audit is green.

However, the audit found material correctness and quality gaps. Several are regressions of lessons already learned in First Hearth. Green tests currently prove mechanical consistency of the slice, not that its causal semantics are good enough.

## Material findings

### F1 — auditory omniscience regression — CRITICAL

Current hearing percepts contain the speaker's exact world position. `ResidentMind.observe()` then stores that point as the actor's last-known position. A resident can therefore learn exact coordinates from hearing alone.

This conflicts with the previous project rule that a voice outside sight must not reveal a hidden marker/position. It also makes a larger map deceptively easy: searching and contact can silently use coordinates that perception never earned.

Repair requirement:
- represent perceptual spatial evidence by modality;
- sight may carry an exact position;
- hearing carries at most a directional / distance-band cue unless sight independently grounds the source;
- the model and local grounder must not receive an exact coordinate through auditory evidence.

### F2 — synchronized / eager cognition storms — HIGH

All default schedulers begin with the same quiet-review deadline. The existing test named as anti-synchronization permits all five residents to fire simultaneously, so it does not test its own claim.

Low-salience first events also become immediately eligible because `lastRequestTick` begins at negative infinity. A cluster of residents seeing/hearing ordinary nearby activity can therefore cause a startup request storm.

Repair requirement:
- deterministic per-resident staggering;
- low-salience debounce/coalescing based on event age;
- urgent addressed events still burst quickly;
- explicit tests proving five quiet residents do not all review on one tick.

### F3 — `reviewAfterSeconds` is parsed but ignored — CRITICAL

The model contract exposes adaptive review timing, but settling a proposal never changes the resident scheduler. This is a false contract surface.

Repair requirement:
- accepted proposals reschedule the resident's next quiet review;
- timing remains bounded locally and expressed in World ticks;
- rejected/stale outputs do not silently change review timing.

### F4 — hidden-map routing leak — HIGH

A proposal can target a known region and `CognitionGrounder` may route through intermediate authored regions the resident has never discovered. The navigation graph is currently treated as globally available body knowledge without an explicit knowledge policy.

Repair requirement:
- distinguish physical nav topology from the resident's navigational familiarity;
- semantic long-distance routing must not use unknown intermediate topology unless that topology is deliberately declared innate/public;
- tests must reject a route that requires unknown intermediate regions.

### F5 — stale async admission is still too permissive — HIGH

Addressed speech invalidates a request, but material local activity changes do not necessarily do so. A response based on an earlier activity may currently replace a method after that method completed or changed while the model was thinking.

Repair requirement:
- define an explicit decision epoch / causal revision;
- material activity transition and high-salience addressed attention invalidate stale decisions;
- stale causal reasons are requeued rather than silently discarded;
- unrelated overheard speech must not cause blanket invalidation.

### F6 — cognition can bypass World-side activity application — HIGH

`ResidentCognitionOwner` directly calls `ResidentRuntime.setActivity()`. `SpcWorldRuntime.setResidentActivity()` separately owns the actor-side velocity reset. A cognition transition can therefore change semantic activity while the physical actor keeps a previous velocity until later local-brain handling.

This is an ownership split, not merely a motion bug.

Repair requirement:
- cognition settlement returns an admitted activity transition;
- the World/host applies that transition through one authoritative path;
- idle/work transitions cannot leave inherited movement behind.

### F7 — causal debug trace is self-erasing — HIGH

A move command is appended on each fast-brain step. At the default 20 Hz brain cadence a 256-entry trace can become mostly repeated locomotion in seconds, evicting the cognition/perception chain the Owner actually needs.

Repair requirement:
- record movement command changes / meaningful milestones, not every repeated command;
- preserve causal events long enough for useful diagnosis;
- add a test showing long travel does not erase the initiating activity/cognition story immediately.

### F8 — subject position can be misattributed — HIGH

A percept has one event position, but `ResidentMind.observe()` and `ResidentRuntime.ingestPercepts()` currently apply that same point to both `actorId` and `subjectId`. For an interaction whose subject is elsewhere, this fabricates subject location. It also assumes every subject is an actor.

Repair requirement:
- event-source position and subject position are distinct concepts;
- never update subject location without subject-specific spatial evidence.

### F9 — no-op `work` risks fake autonomy — MEDIUM/HIGH

`work` currently behaves exactly like `idle`: no movement, no world consequence, no progress. It exists in the model-visible capability vocabulary and the authored five-resident specimen uses it.

Repair requirement:
- either remove `work` from model-visible abilities until it has mechanics, or implement a minimal real World-owned work consequence;
- do not count a label as local life.

### F10 — large map is not yet a physical map — HIGH for product readiness

The 8192×8192 envelope and region graph provide scale/topology pressure, but there is no obstacle/collision/line-of-sight geometry in SPC Next. Sight is radial through walls because walls do not exist; travel is point motion through an empty plane.

This does not invalidate the architecture slice, but it prevents claiming a Tibia-like living-region test.

Repair requirement before Owner build:
- authored collision / sight-blocking geometry;
- local navigation around it;
- browser-visible region where distance and topology are physically real.

### F11 — context projection is too broad and evidence retention is under-specified — MEDIUM/HIGH

The private mind can retain dozens of beliefs, concerns, actors and regions, while `ResidentRuntime` forwards the full recent percept ring. At five residents this can become noisy and token-heavy. More importantly, a cognition reason can outlive the percept it references before request construction.

Repair requirement:
- retain causal evidence independently from the short display/recent ring;
- build a bounded relevance projection per request;
- preserve all evidence referenced by the triggering batch even when it aged out of the recent window.

### F12 — new provider endpoint is not yet integrated or hardened to old transport quality — HIGH for live gate

`worker/spc-next-cognition.ts` exists but is not routed from `worker/index.ts`. It also has less mature stage-specific diagnostics and limiter deadline behavior than the existing Hearth transport.

Repair requirement:
- integrate only after the local ownership fixes are green;
- preserve strict structured output and private context sanitation;
- add a global project-rate guard as well as resident-local pressure control;
- preserve useful stage diagnostics for rejected outputs.

## What is defended for now

These decisions survived the first adversarial pass and should remain unless later evidence contradicts them:

- one World clock / one physical truth;
- independent resident private state;
- spatial candidate indexing;
- model chooses semantic intent, local brain owns continuous execution;
- embodied communication rather than an instant reply side-channel;
- exact local authority over asynchronous attempts;
- five residents as the first real scale target rather than a future afterthought;
- authored region topology as a separate layer from per-tick local motion;
- existing First Hearth code as donor/evidence rather than an architectural obligation.

## Repair sequence

1. Repair perception epistemics and evidence ownership.
2. Repair scheduler semantics: stagger, debounce, accepted adaptive review timing.
3. Tighten async decision epochs and World-owned activity transition.
4. Constrain semantic routing by resident navigation knowledge.
5. De-spam causal tracing and retain triggering evidence.
6. Re-run deterministic five-resident, long-soak and adversarial scheduling tests.
7. Only then harden/wire the Luna endpoint.
8. After the mechanical layer is defended, add real physical map geometry and at least one meaningful World-owned local-life mechanic before calling the browser scene an Owner living-region build.

## Gate language

Until the repair sequence above passes, use:

**FOUNDATION DIRECTION DEFENDED · CURRENT IMPLEMENTATION UNDER ADVERSARIAL REPAIR · NOT OWNER-READY**

Do not use `FOUNDATION READY`, `LIVING WORLD PASS`, or equivalent wording merely because CI is green.
