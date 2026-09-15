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
- PR #125 body now starts with the recovery verdict rather than scaffold-success language.

This solves orientation drift, not runtime architecture.

### K0 — scoped resident matter / execution authority skeleton

**SCOPED PASS · FULL GREEN**

- source: `e02e08ce492b5b2c5f16c3cd5dfa9d2a5d3e7d97`
- qualification tests: `9dab35b8d42c01059627d443acf8f2863f221702`
- GitHub Check: run #687 PASS

Executable invariants re-earned in `src/spc-next/resident-continuity-kernel.ts`:

- a continuing matter has stable identity independent of a cognition request;
- semantic proposal authority is scoped to exact matter + semantic revision + evidence dependency;
- unrelated matter changes do not stale another matter's semantic decision;
- same-matter semantic supersession does stale older decisions;
- exactly one same-revision proposal may win;
- run binding carries exact matter + semantic revision provenance;
- suspension removes World-mutation authority from the bound run without deleting the run;
- activity-only resume can restore the same run when semantics did not change;
- semantic change while suspended prevents the old run from silently regaining authority;
- terminal status is monotonic;
- terminal semantic state removes run authority immediately even before mechanical retirement;
- neutral retirement does not invent a World/task outcome;
- current semantic evidence of a live matter survives ordinary recent-evidence churn;
- suspension cycles are refused.

This kernel is still isolated recovery substrate. It is **not yet wired into `ResidentRuntime` or World execution**.

### K1 — factual run outcome reconciliation

**SCOPED PASS · FULL GREEN**

- source: `ea9574cbba899a0c645bcf6f87abd3b56cc2a8a5`
- qualification tests: `a28a62ff73e8afc4b5d7da16213900c5d0c10c21`
- GitHub Check: run #689 PASS

Re-earned:

- a factual mechanical/World outcome joins back to the exact resident run binding;
- outcome becomes resident evidence;
- factual mechanical success does **not** automatically resolve semantic matter;
- one run outcome is reconciled once;
- neutral retirement remains distinct from factual success/failure;
- run ownership is released only through explicit reconciliation/retirement.

Still OPEN: integrated executor/World ordering gate preventing reuse of an exclusive execution resource before factual reconciliation.

### K2 — resident-owned pending cognition authority

**IMPLEMENTED · QUALIFICATION PENDING**

- source: `d9e5db94e1b7e0ec86425d3167d25d210282107b`
- qualification tests: `e414e13b3c95aa79fcfeaf24126aeddea98ded1c`

Targeted invariants:

- live pending proposal authority is explicit resident state;
- semantic revision revokes only same-matter attempts;
- suspension alone does not revoke a semantically current clarification;
- winning same-revision proposal revokes siblings;
- terminalization revokes only the owning matter's pending cognition;
- exact provider attempt may be abandoned one-shot without changing matter semantics;
- recent revocation provenance is bounded;
- once bounded provenance is evicted, system reports only stale authority rather than fabricating an exact historical cause.

Do not promote to PASS until exact-head CI is green.

## Immediate recovery frontier

### K3 — live-matter evidence reconstructability

**OPEN — NEXT KERNEL ATOM**

The new kernel currently pins current semantic evidence, but a living matter also exposes `originEvidenceId` and `lastOutcomeEvidenceId`. Those references must not become orphan IDs after recent-evidence eviction.

Target:

- while a matter is live, reconstruct current origin, semantic dependency and latest factual outcome evidence;
- bounded by live matters, not an unbounded archive;
- terminalization releases live pins; later historical persistence/archival remains a separate future problem.

### K4 — provider membrane / exact attempt transport lifecycle

**OPEN**

Separate from resident kernel. It should carry semantic content but no resident mutation authority, bind to an exact resident proposal attempt, support measured timeout/abandon/retry, and fail closed on late returns.

### K5 — executor/World authority adapter

**OPEN**

The kernel's `canRunMutateWorld(runId)` must become an actual mandatory gate on the execution path before a bound run can create a World fact.

This is where P2-E9/E16-style latency safety becomes real rather than theoretical.

## Current hard truth defects outside the new kernel

These remain blockers even while K-series work progresses.

### T0 — unknown voice identity leak

**FAIL**

Current `ResidentPercept.actorId` / `ResidentMind.observe()` can turn a heard but unrecognized speaker into a known actor. Raw percept/cognition/local-contact paths must all stop receiving recognized identity unless an explicit acquisition rule permits it.

### T1 — stale current region in unregioned World space

**FAIL**

Current `SpcWorldRuntime` only updates resident region when `regionAt(after)` is non-null. Leaving all authored regions can leave stale self-location.

### T2 — orphan provenance in current `ResidentMind`

**FAIL**

Beliefs/concerns may preserve evidence IDs after the bounded percept-evidence store has evicted their records.

### T3 — fabricated authoritative-looking interaction occurrence

**FAIL / UNSAFE API**

`emitInteraction()` can publish an interaction summary/subject without authoritative entity/action/outcome proof. Product path must be replaced by World-resolved action outcomes; synthetic research stimuli must be explicitly typed as synthetic.

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
- provider latency/failure/abandon/retry qualification;
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
