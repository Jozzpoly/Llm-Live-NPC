# SPC Next — Live Recovery Ledger

Updated: 2026-09-15

This is the operational ledger for the long SPC Next architecture-recovery campaign on draft PR #125.

It is deliberately narrower than a roadmap. Its purpose is to prevent evidence drift: every PASS below must name the exact scope it proves, and every OPEN item remains open even if unrelated repository CI is green.

Canonical recovery contract: `docs/SPC_NEXT_ARCHITECTURE_RECOVERY_GATE.md`.

Cross-project donor research is preserved separately in `docs/SPC_CROSS_PROJECT_DONOR_MAP_2026-09-15.md`. That document is research input, not architecture authority.

## Evidence language

- **FULL GREEN** — repository `Check` passed for the exact commit: typecheck, full Vitest suite, Vite build, preview dry-run.
- **SCOPED PASS** — the named executable invariant is defended; this is not product/life-slice readiness.
- **OPEN** — not yet defended on SPC Next.
- **REGRESSED** — prior research demonstrated the capability/invariant, but SPC Next has not yet re-earned it.
- **FAIL** — current executable behavior is known to violate the intended invariant.

## Campaign state

> **RECOVERY IN PROGRESS — DO NOT PROMOTE BY GREEN CI OR FEATURE COUNT.**

Current broad ordering:

`R0 truth/evidence recovery`
→ `R1 resident continuity authority`
→ `R2 execution + composable local brain`
→ `R3 first real material life slice`
→ `R4 live provider integration`
→ `R5 participant/research observability split`
→ `R6 five-resident pressure`
→ later persistence/offscreen/scaling only when earned.

The ordering is not a promise that each phase is completed horizontally before the next begins. Small vertical experiments may pull a needed lower layer forward. What is forbidden is silent promotion past an OPEN causal boundary.

## Completed / defended recovery atoms

### Governance / takeover truth

**SCOPED PASS**

- `fc0e02bfea266a18849993e55ad449b29817fc90` — established `SPC_NEXT_ARCHITECTURE_RECOVERY_GATE.md` and stop-the-line status.
- `735569554a7f298a0941a26c74ee47043b138f67` — made SPC Next recovery state the live README takeover authority; old P2 `PROJECT_STATE` is preserved as donor/history, not current branch authority.
- PR #125 body starts with the recovery verdict rather than scaffold-success language.
- `4c5a8890b1f4fed8be7066da05de41dd3ba9fdf7` — recorded the non-binding cross-project donor map so sibling-project discoveries do not disappear or silently become architecture authority.

This solves orientation/research-memory drift, not runtime architecture.

### K0 — scoped resident matter / execution authority skeleton

**SCOPED PASS · FULL GREEN**

- source: `e02e08ce492b5b2c5f16c3cd5dfa9d2a5d3e7d97`
- qualification tests: `9dab35b8d42c01059627d443acf8f2863f221702`
- GitHub Check: run #687 PASS

Re-earned:

- continuing matter identity independent of cognition-request lifetime;
- matter-scoped semantic revisions and evidence dependency;
- unrelated-matter changes do not stale another matter;
- same-matter supersession does stale older meaning;
- exactly one same-revision proposal can win;
- run binding retains exact matter + semantic revision;
- suspension removes World-mutation authority without deleting mechanical run identity;
- unchanged semantics may resume the same run;
- revised semantics cannot silently revive an old run;
- terminal state is monotonic;
- terminal semantics revoke run authority before later mechanical cleanup;
- neutral retirement does not invent outcome;
- suspension cycles are refused.

### K1 — factual run outcome reconciliation

**SCOPED PASS · FULL GREEN**

- source: `ea9574cbba899a0c645bcf6f87abd3b56cc2a8a5`
- qualification tests: `a28a62ff73e8afc4b5d7da16213900c5d0c10c21`
- GitHub Check: run #689 PASS

Re-earned:

- factual mechanical/World outcome joins to the exact resident run binding;
- outcome becomes resident evidence;
- mechanical success does **not** automatically resolve semantic matter;
- one factual outcome is reconciled once;
- neutral retirement remains distinct from success/failure;
- run ownership is released only through explicit reconciliation/retirement.

Still OPEN: integrated exclusive-execution ordering preventing a new incompatible run before factual reconciliation.

### K2 — resident-owned pending cognition authority

**SCOPED PASS · FULL GREEN**

- source: `d9e5db94e1b7e0ec86425d3167d25d210282107b`
- qualification tests/fix: `e414e13b3c95aa79fcfeaf24126aeddea98ded1c`
- GitHub Check: run #692 PASS

Re-earned:

- live pending proposal authority is explicit resident state;
- semantic revision revokes only same-matter attempts;
- suspension alone does not revoke a semantically current clarification;
- winning same-revision proposal revokes siblings;
- terminalization revokes only owning-matter attempts;
- exact provider attempt may be abandoned one-shot without changing matter semantics;
- recent revocation provenance is bounded;
- once exact old provenance is evicted, the system reports only stale authority instead of fabricating a precise historical cause.

### K3 — live-matter evidence reconstructability

**SCOPED PASS · FULL GREEN**

- source: `e400d7923b2a36aac06b9694cc6ef11e91855259`
- qualification tests: `5e746adcd7dbeaaf3f11c0e6a5123f0e66bd03e6`
- GitHub Check: run #695 PASS

Re-earned:

- while a matter is live, its origin evidence remains reconstructable;
- current semantic dependency remains reconstructable;
- latest factual run outcome remains reconstructable;
- ordinary recent-memory churn cannot orphan these live references;
- latest outcome replaces the previous live outcome pin rather than creating history;
- terminalization releases live pins;
- late factual outcome after terminalization cannot resurrect live-matter evidence authority.

This remains bounded live continuity, not persistence or long-term archival memory.

### K4 — provider authority membrane

**SCOPED PASS · FULL GREEN**

- source: `b05b0cf8219c0fa864f85b8d0cec437da4686433`
- qualification tests: `ab84d06392ff2701c8184c847ba2ea7d7fe9cc98`
- GitHub Check: run #697 PASS

Re-earned:

- model/provider-visible payload carries semantic content and correlation only;
- exact resident proposal authority remains in a local private sidecar;
- serialized/cloned provider input cannot recreate resident mutation authority;
- forged/replayed provider run IDs fail closed;
- malformed output may retry only while exact resident authority is still live;
- same-matter supersession and terminalization reject late provider returns;
- exact provider attempt can be abandoned without changing matter meaning or killing an unrelated/sibling attempt;
- dead authority does not retain a meaningless formatting retry path.

HTTP/model transport itself remains outside this seam and is still OPEN for live-provider qualification.

### T1 — explicit unregioned resident self-location

**SCOPED PASS · FULL GREEN**

- qualification commit: `154895bae61fc2c172293c23d2dd5c3ecd256025`
- GitHub Check: run #700 PASS

Fixed:

- `SpcWorldRuntime` synchronizes resident self-region after every authoritative movement, including `null` when no authored region contains the resident;
- leaving an authored region no longer leaves stale private `currentRegionId`;
- re-entering a region re-establishes the authored self-location normally.

### K5a — scoped run authority over real World effects

**SCOPED PASS · FULL GREEN**

- initial source/tests: `14281a0306c7614341e66a9a904f7731302fca3b`, `4fc437e71bdfac2217ffa14e82f2cf76a8370532`
- type-only qualification fix: `9dbb7eaa63316c0f8adb984ec4738309f6904fa6`
- GitHub Check: run #703 PASS

Re-earned on a **new bounded execution path** using the real `SpcWorldRuntime`:

- exact live run authority is required before resident-owned motion or speech effects are emitted;
- one execution frame may compose motion + speech instead of forcing them to be mutually exclusive;
- forged/stale/terminal runs cannot create effects on this path;
- the complete effect frame is validated before any mutation, preventing partial application from a later invalid effect;
- latched motion records the exact run that owns it;
- suspension, same-matter semantic supersession and terminalization can revoke stale latched motion before further physical integration;
- revocation of an older run cannot stop a newer run that legitimately owns motion.

K5a by itself did not close legacy runtime bypasses; K5b below is the qualification that closes the dual-controller condition for a recovered resident.

### K5b — recovered resident execution ownership in real World phase

**SCOPED PASS · FULL GREEN**

- ownership integration: `e87bc290...`
- run-scoped physical feedback correction / qualified head: `bb2c90465b0d84a44e5769bdc5155f15c47e74dc`
- GitHub Check: run #707 PASS

Re-earned for residents explicitly claimed by the recovered execution path:

- legacy `fastStep -> applyResidentCommand` no longer concurrently controls a claimed recovered resident;
- legacy activity/motion/speech bypasses cannot silently mutate that resident through the old controller path;
- World knows only the narrow execution-authority question `canRunMutateWorld(runId)`, not resident matters or semantic revisions;
- World itself owns application of authorized effect frames and the exact run owning latched motion;
- stale latched motion is re-checked/revoked at the World phase boundary before authoritative physical integration;
- physical motion outcome for a recovered resident is run-scoped rather than translated back into legacy `activity_blocked` cognition;
- old run cleanup cannot revoke a newer run that legitimately owns motion.

**Scope boundary:** current recovered material effects are still motion + speech. Attention/facing and manipulation/action are not yet qualified. K5b therefore does not claim complete embodied authority.

### T0a — physical source identity vs resident-recognized identity boundary

**SCOPED PASS · FULL GREEN**

- qualification commit: `f67952889c903d5a475a66f3d0c006e4c2a84dea`
- GitHub Check: run #709 PASS

Re-earned:

- World-side physical source identity can exist without automatically becoming resident-recognized identity;
- resident-safe hearing may preserve speech/direction/distance evidence while withholding actor identity;
- already-leaked identity in the ingress payload is rejected rather than trusted as resident knowledge;
- the boundary is intentionally minimal and does not pretend to be a final face/voice/social recognition system.

### T0b — real World → ResidentRuntime identity-safe hearing

**SCOPED PASS · FULL GREEN**

- integration/test corrections culminate at `f8c7bb5de964738d283942b42440a188bbba9a49`
- GitHub Check: run #713 PASS

Re-earned through the real SPC World/runtime path:

- an unknown heard speaker remains anonymous in the resident percept;
- speech content, addressed state and bounded directional evidence remain available;
- raw physical actor identity does not enter resident known-actor state, local heard-contact state or cognition context merely because hearing occurred;
- prior causally acquired visual recognition may allow a later voice from the same actor to be recognized;
- test fixtures that previously relied on magical identity setup were corrected to acquire identity causally rather than weakening the boundary;
- genuine visually acquired last-known position can then ground later semantic communication normally.

**T0 is not yet fully closed:** Worker-side context validation/instruction still needs to accept and preserve epistemically honest anonymous speech. That is T0c below.

## Immediate recovery frontier

### T0c — Worker accepts anonymous speech without reconstructing identity

**OPEN — CURRENT SMALL TRUTH BOUNDARY**

Required properties:

- worker sanitizer accepts `speech.actorId = null` as a valid heard-speech state;
- text, addressed state and legal hearing geometry remain available;
- exact coordinates remain illegal for hearing;
- known-speaker cases retain their existing validation;
- model instruction explicitly treats `actorId = null` as unrecognized identity and must not reconstruct a speaker identity from wording, direction or guesswork;
- trust-boundary hardening must not weaken unrelated percept or known-actor checks.

Prepared work exists, but no exact committed/CI-qualified T0c claim is recorded yet.

### T2 — orphan provenance in current `ResidentMind`

**FAIL — HIGH PRIORITY BEFORE NEW MATTERS DEPEND ON CURRENT MIND STATE**

Beliefs/concerns may preserve evidence IDs after bounded percept evidence eviction. The new continuity kernel has solved this for live matters, but the current cognition context still has this defect.

Recovery should stay bounded: do not build a universal archival memory system. Ensure live semantic state cannot claim evidence that is no longer reconstructable, and separate recent working evidence from longer-lived evidence dependencies.

### T3 — fabricated authoritative-looking interaction occurrence

**FAIL / UNSAFE API — EXPECTED TO BE PRESSURED BY FIRST MATERIAL LIFE SLICE**

`emitInteraction()` can publish an interaction summary/subject without authoritative entity/action/outcome proof. Product/runtime interaction must originate from World-resolved action authority; synthetic research stimuli must be impossible to confuse with physical truth.

The first real material object/action slice is expected to replace this class of fake interaction evidence with authoritative World actions/outcomes rather than adding more narrative occurrences.

### T4 — public/private projection mixing

**OPEN / UNSAFE BOUNDARY**

`ResidentPublicState.activity.reason` can expose private semantic reasoning through a public snapshot contract.

Cross-project research strengthens the likely direction: authoritative truth, participant projection, research projection, persistence representation and eventual transport snapshot should remain distinct views rather than one universal DTO.

### T5 — participant-view omniscient speech

**FAIL FOR OWNER EVIDENCE**

Research scene speech bubbles use global World diagnostics rather than participant-bounded perception.

Participant, spectator/research and selected-resident-private projections must eventually be explicitly distinct.

## Resident-life architecture still OPEN

- durable resident identity/capability/life-context beyond name + sensory/motion parameters;
- place/anchor private acquisition (`familiar` / embodied `visited`);
- persistent own matters generated/maintained through actual life rather than test injection;
- composable locomotion + attention/facing + action/manipulation + communication channels;
- checked absence and deliberate embodied search;
- real actionable World entities/resources/state;
- collision/local obstacle navigation when first material life slice needs it;
- bounded discrepancy/matter cognition pressure instead of historical event inbox;
- causal trace joining evidence → matter → proposal attempt → exact run → World outcome;
- detached research-witness/history semantics distinct from resident behavioral memory;
- live SPC cognition host/worker browser integration;
- real provider latency/failure/abandon/retry qualification;
- participant / spectator / private-resident research projection split;
- five materially divergent resident lives under concurrent interference;
- persistence/offscreen/time-scaling/scaling architecture.

Future seams intentionally preserved but not implemented now:

- logical identity should not be tied to render/physics/provider handles;
- World/resident/body/matter/run/provider-request lifetimes should remain separable;
- future `LOD's World` should not be forced into one monolithic fidelity switch;
- authored world definitions should eventually separate from runtime state when real content pressure justifies a schema/editor;
- persistence/network snapshots should not be conflated with participant/debug projections.

See `docs/SPC_CROSS_PROJECT_DONOR_MAP_2026-09-15.md` for donor evidence and nonclaims.

## First meaningful vertical promotion target

The core target remains:

`Janek has an own continuing matter`
→ `real World-owned material progress`
→ `player/world interruption`
→ `embodied attention/reaction`
→ `temporary alternate matter/activity`
→ `old matter remains valid OR is consciously revised`
→ `resume or abandon`
→ `factual visible World continuation/outcome`
→ `causal ledger explains the whole chain`.

Cross-project research strengthens one experimental candidate for this target:

> one stable logical crate/object, one workshop origin, one destination, one Janek matter, authoritative pickup/carry/place outcomes, and deliberate player interference.

This remains a **research hypothesis**, not a frozen implementation specification. Its value is that a single tangible object can pressure identity, possession, private knowledge, affordances, interruption/resume, local search, real World outcomes and later offscreen/LOD continuity without inventing an economy.

The scenario must eventually pass deterministic, live-provider, participant-readable and five-resident pressure gates. A scripted activity/timer/narrative occurrence is not sufficient.