# SPC R5-A — One Semantic Escalation / Homeostasis PASS

Status: **QUALIFIED PASS**
Date: **2026-09-20**
Qualified source: `58f225e0090110edf75dbe4aaf1bf057ec8f590e`
Parent contract: `docs/SPC_R5_SEMANTIC_ESCALATION_EXPERIMENT.md`

## Claim

R5-A qualifies this bounded claim:

> One genuine resident-owned semantic discrepancy can escalate to exactly one higher-cognition attempt, remain causally inert through provider latency/completion, be admitted only at a later resident/World boundary, materialize one locally grounded durable commitment, produce one factual World consequence, settle its exact originating pressure and return to long quiet without semantic echo.

This is the first positive homeostasis result for provider-shaped semantic cognition after the September failure.

It is not a general claim about provider quality, stale-answer safety, provider failure handling, five-resident amplification or real-Luna behavior.

## Specimen

The qualified specimen is:

- `src/spc-next/r5-mira-semantic-escalation-slice.ts`
- `src/spc-next/r5-mira-semantic-escalation-slice.integration.test.ts`
- browser scenario `r5-mira-semantic-escalation`
- `scripts/spc-browser-r5-mira-semantic-escalation-evidence.mjs`

Composition:

- Mira + Ida only;
- no player;
- Mira owned by recovered causal-life substrate from the beginning;
- no pre-existing Mira matter;
- deterministic/injected provider fixture;
- shared resident-generic cognition lane and inert provider transport;
- existing local commitment grounding and execution authority.

## Qualified causal sequence

1. World starts no-player, matter-free and provider-free.
2. 120 ordinary ticks create no semantic/provider work.
3. Ida legally addresses Mira through resident World authority.
4. Mira acquires one exact private addressed-speech percept.
5. That percept creates one exact `heard_speech` semantic reason.
6. One scheduler-ready cognition request freezes resident-private + resident-life context.
7. No matter exists merely because cognition began.
8. Provider stays artificially in flight for 600 World ticks.
9. During those 600 ticks:
   - World continues;
   - Mira remains legal;
   - no second request appears;
   - no commitment appears;
   - semantic pressure remains explicitly `in_flight`.
10. Provider completes into an inert arrival inbox.
11. Completion itself changes no World/life/pressure authority.
12. The next explicit World boundary admits the proposal.
13. Fresh local grounding validates the exact speech origin and known Ida target.
14. One durable `communicate_actor` matter/run materializes.
15. The originating semantic reason settles.
16. Existing World execution authority emits exactly one Mira reply to Ida:
   `Tak, zostanę chwilę.`
17. Factual execution outcome resolves the matter and retires run/body authority.
18. 600 further World ticks create:
   - no second provider request;
   - no second reply;
   - no new matter;
   - no semantic pressure;
   - no timer-created novelty.

## Architectural result

R5-A also qualified two extractions used by the old five-resident runtime and the compact R5 specimen:

- `ResidentCausalCognitionLane`
  - reason-native semantic admission / exact-origin settlement;
- `ResidentCausalProviderTransport`
  - provider completion as inert transport evidence until explicit admission.

The established `FiveResidentCausalCognitionHost` and `FiveResidentCausalProviderTransport` now reuse those generic seams rather than owning duplicate semantic policy.

## Deterministic evidence

Qualified source:

`58f225e0090110edf75dbe4aaf1bf057ec8f590e`

**Check #1505: PASS**

- 249 / 249 test files PASS;
- 931 / 931 tests PASS;
- TypeScript PASS;
- Vite production builds PASS;
- preview verification PASS.

The earlier R5 implementation REDs were apparatus/oracle defects, not hidden product failures:

- deferred fixture callback typing;
- lifecycle oracle expecting `dispatched` instead of the more precise `in_flight`.

Neither repair weakened the causal PASS criteria.

## Real Chromium evidence

**Browser Evidence #730: PASS**

Qualified browser:

`Chrome/152.0.7977.82`

All 19 R5-A browser assertions passed:

- no-player / matter-free / provider-free start;
- pre-event quiet;
- one exact addressed-speech reason -> one provider attempt;
- 600-tick provider latency without duplicate request/commitment;
- completion inert before admission;
- next-World-boundary local admission;
- exact communicate commitment;
- exact originating reason settlement;
- factual one-time World reply;
- 600-tick post-settlement semantic quiet;
- deterministic checkpoint hashes across two Chrome reloads;
- no real provider/API network request;
- no uncaught runtime exception;
- read-only non-empty screenshots.

All earlier browser vetoes also passed on the same source, including R1, Janek R4 and Mira R4-D.

## Earned boundary

R5-A establishes:

`resident-owned reason -> one provider attempt -> explicit admission -> one grounded consequence -> settlement -> quiet`.

It does **not** establish that a provider result remains valid when resident attention changes while it is in flight.

That is now the R5-B boundary.

## Next falsifier

R5-B must inject a second addressed speech after the first provider request begins but before its result is admitted.

Required outcome:

- the first result is stale;
- no old commitment gains authority;
- the older causal pressure is safely retained/requeued;
- the newer speech remains present;
- retry is bounded rather than immediate hot-loop behavior;
- later cognition must be causally attributable to the now-current unresolved pressure state.
