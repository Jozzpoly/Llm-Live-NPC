# SPC Next — Live Recovery Ledger

Updated: 2026-09-15

This is the operational ledger for the long SPC Next architecture-recovery campaign on draft PR #125.

It is deliberately narrower than a roadmap. Its purpose is to prevent evidence drift: every PASS below must name the exact scope it proves, and every OPEN item remains open even if unrelated repository CI is green.

Canonical recovery contract: `docs/SPC_NEXT_ARCHITECTURE_RECOVERY_GATE.md`.

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

This solves orientation drift, not runtime architecture.

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

**Critical scope boundary:** K5a is **not** runtime-wide authority. Current `ResidentRuntime.fastStep() -> SpcWorldRuntime.applyResidentCommand()` and public World control APIs still exist as bypasses. K5b must close this dual-authority condition before any claim that resident execution is generally protected.

## Immediate recovery frontier

### K5b — close dual resident execution authority

**OPEN — CURRENT FRONTIER**

Target is not merely to call `canRunMutateWorld()` more often. The architecture must make the run-authorized path the owner of material resident effects used by the first life slice.

Required properties:

- private resident semantic state remains resident-owned; World must not inspect matters/semantic revisions;
- World phase can ask a narrow execution authority/capability to revoke stale latched effects **before physical integration**;
- current flat `ResidentRuntime.fastStep()` cannot silently bypass the authority for the recovered life path;
- motion, attention/facing, action/manipulation and communication should grow as composable effect channels rather than a longer mutually-exclusive command union;
- no new resident-owned physical effect is introduced outside the authority path;
- any temporary legacy scaffold bypass remains explicitly labeled legacy and cannot be used as evidence for the recovered life slice.

Do not promote K5b until an adversarial test proves that semantic authority can disappear between local-control updates and the next World integration without allowing the old effect to persist.

### T0 — recognized identity must be distinct from physical source identity

**FAIL — HIGH PRIORITY AFTER/ALONGSIDE K5b**

Current hearing path can expose stable `actorId` from an unrecognized speaker. Fixing only `knownActors` is insufficient because raw percept and local contact maps also receive the ID.

The recovery needs a boundary such as private physical source provenance vs resident-recognized identity, without prematurely building a face-recognition system.

### T2 — orphan provenance in current `ResidentMind`

**FAIL**

Beliefs/concerns may preserve evidence IDs after bounded percept evidence eviction. The new continuity kernel has solved this for live matters, but the current cognition context still has this defect.

### T3 — fabricated authoritative-looking interaction occurrence

**FAIL / UNSAFE API**

`emitInteraction()` can publish an interaction summary/subject without authoritative entity/action/outcome proof. Product/runtime interaction must eventually originate from World-resolved action authority; synthetic research stimuli must be impossible to confuse with physical truth.

### T4 — public/private projection mixing

**OPEN / UNSAFE BOUNDARY**

`ResidentPublicState.activity.reason` can expose private semantic reasoning through a public snapshot contract.

### T5 — participant-view omniscient speech

**FAIL FOR OWNER EVIDENCE**

Research scene speech bubbles use global World diagnostics rather than participant-bounded perception.

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
- live SPC cognition host/worker browser integration;
- real provider latency/failure/abandon/retry qualification;
- participant / spectator / private-resident research projection split;
- five materially divergent resident lives under concurrent interference;
- persistence/offscreen/time-scaling/scaling architecture.

## First meaningful vertical promotion target

Still unchanged:

`Janek has an own continuing matter`
→ `real World-owned material progress`
→ `player/world interruption`
→ `embodied attention/reaction`
→ `temporary alternate matter/activity`
→ `old matter remains valid OR is consciously revised`
→ `resume or abandon`
→ `factual visible World continuation/outcome`
→ `causal ledger explains the whole chain`.

The scenario must eventually pass deterministic, live-provider, participant-readable and five-resident pressure gates. A scripted activity/timer/narrative occurrence is not sufficient.
