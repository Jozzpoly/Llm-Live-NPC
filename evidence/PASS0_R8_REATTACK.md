# Pass 0 R8 — independent repaired-substrate re-attack

Status: **AUTOMATED R8 PASS; OWNER / INTERACTIVE PUBLIC-RUNTIME GATE STILL OPEN**

This document belongs to the evidence-only branch `evidence/live-mind-pass0-r8-reattack`. The branch and PR #47 must not be merged wholesale into the canonical E1 runtime line.

## 1. Exact repaired substrate under attack

Canonical branch: `experiment/e1-grounded-notice-fetch`

Exact combined repaired runtime head:

`caeb15cb875a83ffbab684f8e55880a87d723d15`

This head contains both fresh-live R4 residual repairs:

- PR #45 / Repair A — old generic actor interaction no longer fabricates a semantic success;
- PR #46 / Repair B — explicit executor run ownership, manual/cognition causation, action-to-event correlation, and exact E1 run-to-experience lineage.

The evidence branch was created directly from this exact commit before any R8 tests were authored.

Post-merge Cloudflare evidence for the exact canonical repaired head:

- Workers Build: PASS;
- Build ID: `9a881ed1-3733-405a-bc69-13896d65010a`;
- Version ID: `c13d0442-104c-42ec-b148-a6d9374f98d0`.

## 2. Independent falsification head

Initial tests-only R8 head:

`63ec5cec51e907c306c48970d2f1024ce7eb8481`

Diff against the repaired runtime base at this checkpoint:

- one file added: `src/execution/r8-independent-reattack.test.ts`;
- no production source changes;
- no test-oracle migrations;
- no runtime fixes after seeing the R8 results.

### New independent attacks

The four attacks were designed after Repairs A and B had already been integrated.

1. **Same tick / same actor / same item / two semantic actions**
   - player drops and immediately picks up the same item inside one fixed execution frame;
   - both actions share actor, item and tick;
   - they must still receive distinct, ordered exact `eventSeq` joins;
   - event-time occurrence snapshots must preserve the free state after drop and held state after pickup.
   - Purpose: falsify any hidden reconstruction from tick/target coincidence.

2. **Cause independence**
   - identical World, NPC, target and executor task are run once as `manual` and once as `cognition`;
   - pre-action World legality, action result, final canonical snapshot, World events and raw `lastActionResult()` must be identical;
   - only executor provenance may differ.
   - Purpose: falsify provenance influencing mechanics or legality.

3. **Cross-layer actor-interaction truth**
   - presentation-side direct targeting must still resolve NPC-001;
   - the old generic World actor interaction must reject with `target_not_interactable`;
   - rejection must not gain `eventSeq`, semantic occurrence or new World event.
   - Purpose: prove Repair A did not destroy the useful targeting donor while removing fake semantic completion.

4. **Wrong-run resistance**
   - a real E1 drop→cognition→pickup run is produced;
   - before the harness consumes its terminal frame, executor ownership is deliberately moved to another manual run on the same target;
   - E1 must not claim the stale same-target terminal result as its own experience or lineage.
   - Purpose: falsify target-based reconstruction surviving beneath the new run join.

### Result

All four independent attacks passed on their first automated execution.

No production change and no oracle migration was required.

## 3. Durable validation result

On tests-only head `63ec5cec51e907c306c48970d2f1024ce7eb8481`:

- TypeScript: PASS;
- independent R8 tests: **4/4 PASS**;
- Vitest: **32/32 test files, 177/177 tests PASS**;
- Vite Worker build: PASS;
- Vite client build: PASS;
- `npm run deploy:preview -- --dry-run`: PASS;
- Cloudflare Workers Build: PASS;
- Cloudflare Build ID: `58ebbee6-d63f-47b3-a420-bb72f344a409`;
- Cloudflare Version ID: `cd63fcae-97d7-4ad7-a104-f8e4d385f1c1`.

The historical large-client-chunk warning remains present and unchanged. It is not classified as a new R8 failure.

## 4. Selected old characterization re-run on the repaired substrate

The full suite passing is necessary but not sufficient evidence. The following older contracts are selected explicitly because they defend the substrate that Repairs A/B could plausibly have disturbed.

### A. E1 embodied vertical chain — DEFENDED

`src/client/e1-agent-harness.test.ts` — PASS.

Still defends the old qualified sequence:

`player-caused drop -> bounded temporal evidence -> cognition -> revalidation -> deterministic executor -> canonical World pickup -> subsequent semantic experience`

Repair B extends its causal observability but does not replace the semantic experience contract or the old embodied chain.

### B. R6 event-time/local sensory substrate — DEFENDED

- `src/client/r6b-event-time-occurrences.test.ts` — PASS;
- `src/client/r6b-sensory-delivery.test.ts` — PASS.

The new executor/run metadata did not break event-time snapshots, locality filtering, own-action handling or bounded sensory delivery.

### C. R4b manual executor lifecycle — DEFENDED

`src/client/manual-executor-trigger.test.ts` — PASS.

The original rule remains: manual/debug lifecycle side effects happen only after executor acceptance. The repaired contract additionally proves explicit manual ownership and preservation of an already-running cognition owner.

### D. Deterministic execution mechanics — DEFENDED

- `src/execution/deterministic-executor.test.ts` — PASS;
- `src/execution/execution-contract.test.ts` — PASS.

The executor remains deterministic and World-authority-driven. Provenance is observational ownership metadata, not a mechanic-selection input.

### E. Direct targeting / mobile input surface — DEFENDED

- `src/client/pointer-targeting.test.ts` — PASS;
- `src/client/mobile-controls.test.ts` — PASS.

Repair A removed the false World actor-interaction success without removing the useful mouse/touch ability to identify NPC presentation targets.

### F. R7 Worker boundary semantics — DEFENDED in automated characterization

- `src/client/r7a-worker-ingress.test.ts` — PASS;
- `src/client/r7b-error-usage-provenance.test.ts` — PASS;
- `src/client/e1-worker.test.ts` — PASS;
- preview upload dry-run — PASS.

Repairs A/B did not alter Worker prompt/tool vocabulary, ingress limits, provider-error semantics or usage provenance.

This automated defense is not being misrepresented as a new live public POST probe; see the open gate below.

### G. World/presentation foundational regressions — DEFENDED by durable suite

The repaired substrate also retains green collision, held-item, location, facing, presentation, specimen-validation, interaction-validation and build-provenance tests. These are treated as broad regression coverage rather than independent new R8 claims.

## 5. What automated R8 now supports

The current evidence supports all of the following bounded claims:

- the two fresh-live R4 residuals are repaired on the canonical substrate;
- manual and cognition executor ownership are explicit and cannot silently replace each other while running;
- provenance does not alter World legality or canonical outcome in the independently attacked case;
- semantic action/event joins remain distinguishable even when actor, item and tick are identical;
- E1 experience attribution is exact-run based rather than reconstructed from target coincidence;
- model-facing semantic experience remains separate from diagnostic lineage;
- direct NPC targeting remains available despite removal of the false actor-interaction success;
- old E1/R6/R7 and execution contracts continue to pass after both repairs;
- exact build/deploy provenance exists for both repaired canonical head and tests-only R8 head.

## 6. Open evidence boundary before Pass 0 closure

Automated R8 is **PASS**, but Pass 0 is not yet declared closed.

Two related hands-on/public-runtime questions remain:

1. **Changed debug surface / browser truth**
   - Recent action attempts now visibly expose executor run number, manual/cognition cause and action→event sequence;
   - this environment has not yet supplied interactive browser/computer-use evidence that the rendered debug surface is legible and faithful in the real app.

2. **Live public Worker / real-model path after the combined repair**
   - R7 ingress/error/usage tests, build, dry-run and Cloudflare deploy are green;
   - no new real public POST/model request has yet been performed as part of this R8 phase;
   - a focused Owner E1 run on the deployed preview can potentially satisfy both this public path and the changed-debug-surface gate in one low-cost hands-on check.

No claim is made that these two gates have passed yet.

## 7. Current R8 verdict

**AUTOMATED / HEADLESS R8: PASS**

**PASS 0 CLOSURE: PENDING FOCUSED OWNER / INTERACTIVE PUBLIC-RUNTIME GATE**

If the remaining hands-on gate passes, the evidence PR should be closed without merge and the canonical README / `docs/PROJECT_STATE.md` / `docs/FRESH_TAKEOVER.md` should be refreshed on a docs-only branch. If it fails, the failure becomes new evidence and must be classified before any closure declaration.
