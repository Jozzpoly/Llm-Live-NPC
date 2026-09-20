# SPC R5-B — Stale / Newer-Attention Safety PASS

Status: **QUALIFIED PASS**
Date: **2026-09-20**
Qualified source: `b0aa10c43ae833fdec95f86d2caa0b7343ba451e`
Parent contract: `docs/SPC_R5_SEMANTIC_ESCALATION_EXPERIMENT.md`

## Claim

R5-B qualifies this bounded claim:

> A provider judgement frozen before newer resident addressed attention cannot silently gain semantic or World authority afterward; the stale judgement is rejected, both old and new unresolved pressures remain represented, and retry begins only after a fresh bounded post-settlement delay rather than immediately because the original provider latency already exhausted scheduler cadence.

This closes a specific failure class exposed by R5-A.

## Why the extra retry boundary was necessary

The existing cognition scheduler already enforces ordinary minimum dispatch intervals.

That is not sufficient after a long asynchronous request.

If provider A remains in flight longer than the scheduler minimum interval, then:
- newer speech B may arrive;
- admission of A correctly returns `stale/newer_addressed_attention`;
- the old batch is requeued;
- but ordinary scheduler cadence may already be elapsed.

Without a new delay measured from stale settlement, the requeued pressure can immediately start another provider request on the same World boundary.

The first R5-B RED exposed exactly this.

The repair is shared:
`src/spc-next/resident-causal-cognition-retry-policy.ts`

It separates:
- ordinary cognition scheduling cadence;
from
- fresh retry-not-before windows after stale/rejected/provider-error settlement.

## Qualified causal sequence

1. Speech A creates one exact `heard_speech` reason.
2. Provider request A begins with frozen resident-private/life context.
3. A stays in flight for 60 World ticks.
4. Ida legally addresses Mira again with speech B.
5. B increments Mira addressed-attention revision.
6. B becomes a separate unresolved `heard_speech` pressure.
7. Provider A completes into an inert arrival.
8. Completion itself creates no matter/run/reply.
9. The next World admission boundary rejects A as stale because addressed attention changed.
10. A creates no durable commitment and no factual World consequence.
11. A returns unresolved to pending state.
12. B remains independently pending.
13. A+B remain inspectable as the current unresolved pressure set.
14. A fresh stale-retry deadline is set at settlement tick + 15.
15. 14 further ticks start no provider work.
16. Exactly tick 15 starts request #2.
17. Request #2 freezes the current A+B pressure set.
18. No matter/run/reply exists merely because retry began.

## Deterministic evidence

Qualified source:
`b0aa10c43ae833fdec95f86d2caa0b7343ba451e`

**Check #1515: PASS**

The immediately preceding behavior-equivalent deterministic head recorded:

- 250 / 250 test files PASS;
- 932 / 932 tests PASS;
- TypeScript PASS;
- production builds PASS;
- preview verification PASS.

The first R5-B RED was a real architectural finding:
immediate redispatch consumed A+B immediately after stale admission.

After the shared retry-policy fix, the only subsequent RED was an oracle mismatch:
the semantic-pressure lifecycle correctly represents a requeued unresolved reason as current state `pending` with transition detail `cognition batch returned unresolved`, rather than a persistent status named `requeued`.

## Real Chromium evidence

**Browser Evidence #740: PASS**

Qualified browser:
`Chrome/152.0.7977.82`

All 15 R5-B assertions passed:

- exact request A with no commitment;
- newer addressed B while A remains in flight;
- A completion inert after newer attention;
- next World boundary rejects A stale and preserves A+B;
- no old commitment/reply;
- 14-tick anti-hot-loop stale window;
- retry exactly on shared tick-15 boundary with current A+B pressure;
- six deterministic checkpoint hashes across two Chrome reloads;
- zero real provider/API requests;
- zero uncaught browser exceptions;
- non-empty read-only screenshots.

All earlier browser vetoes R1 through R5-A remained green on the same source.

## Earned principle

R5-A established:
`one semantic reason -> one provider judgement -> one grounded consequence -> quiet`.

R5-B adds:

> **semantic validity is versioned by resident causal attention, while retry timing is versioned by the settlement boundary—not by how long the stale request happened to spend in flight.**

Provider completion is therefore neither semantic authority nor retry authority.

## Non-claims

R5-B does not prove:
- provider/network errors remain homeostatic;
- malformed provider output is bounded end-to-end in the compact living loop;
- decline settles the correct origin without collateral settlement;
- defer/clarify retain pressure with correct not-before semantics in the live loop;
- repeated provider failures cannot produce a slower periodic storm;
- real-Luna judgement quality.

Those are R5-C / later boundaries.

## Next falsifier

R5-C should attack four non-success outcomes on the same compact no-player organism:

1. provider transport/HTTP/invalid-response error;
2. semantic `decline`;
3. semantic `defer`;
4. semantic `clarify`.

The goal is not to force them into one behavior.

The goal is:
> every outcome leaves the exact originating semantic pressure in an explicit, explainable lifecycle state and cannot create an immediate provider hot loop or ghost commitment.
