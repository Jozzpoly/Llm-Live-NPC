# SPC R5-C — Provider Failure / Semantic Outcome Homeostasis PASS

Status: **QUALIFIED PASS**
Date: **2026-09-21**
Qualified source: `7256ccad2f82d99cbb89668b64ebdaf23f48f484`
Parent contract: `docs/SPC_R5_SEMANTIC_ESCALATION_EXPERIMENT.md`

## Claim

R5-C qualifies this bounded claim:

> Non-success higher-cognition outcomes can leave resident-owned semantic pressure in explicit, causally attributable states without manufacturing ghost commitments or an immediate provider heartbeat.

The qualified classes are:
- provider/HTTP failure;
- `decline`;
- `defer`;
- `clarify`;
- exact-origin settlement with sibling-pressure isolation.

This is infrastructure/homeostasis evidence. It is not evidence that a real model makes good semantic judgements.

## Qualified behavior

### Provider error

A provider error:
- completes into inert transport evidence;
- mutates no World/life state before admission;
- abandons the exact active cognition request;
- returns its causal batch unresolved;
- creates no matter/run/reply;
- starts a fresh provider-error retry window measured from settlement;
- cannot immediately redispatch merely because the failed request itself was slow.

Qualified retry boundary:
`120 World ticks`.

### Decline

A valid `decline`:
- settles the selected exact origin reason;
- creates no commitment;
- creates no body/World authority;
- does not settle unrelated sibling pressure;
- remains provider/matter/reply quiet for at least 600 later World ticks when no new semantic pressure appears.

### Defer

A valid `defer`:
- keeps the selected exact origin unresolved;
- gives it an explicit semantic `notBeforeTick`;
- creates no commitment;
- becomes eligible again only at its `reviewAfterSeconds` boundary.

Qualified fixture:
`reviewAfterSeconds = 1` -> `60 ticks`.

### Clarify

A valid `clarify`:
- keeps the selected exact origin unresolved;
- gives it an explicit semantic review deadline;
- creates no commitment;
- does **not** pretend that provider-authored clarification text was physically spoken by the resident.

Qualified fixture:
`reviewAfterSeconds = 0.5` -> `30 ticks`.

A future spoken clarification requires a separately grounded and authorized communicate commitment.

## Sibling isolation

One provider judgement names one exact `originReasonId`.

When two reasons share a batch:
- settlement of the selected origin does not settle the sibling;
- the sibling remains pending and causally inspectable.

This prevents one convenient provider answer from erasing unrelated resident-owned semantic pressure.

## Deterministic evidence

Qualified source:
`7256ccad2f82d99cbb89668b64ebdaf23f48f484`

**Check #1522: PASS**

The R5-C deterministic campaign at this source includes:
- provider error/requeue/backoff;
- decline + 600-tick quiet;
- defer deadline;
- clarify deadline/no fake speech;
- sibling isolation.

Full suite:
- 251 / 251 test files PASS;
- 937 / 937 tests PASS;
- TypeScript PASS;
- production builds PASS;
- preview verification PASS.

## Real Chromium evidence

**Browser Evidence #747: PASS**

Browser:
`Chrome/152.0.7977.82`

All 11 R5-C browser assertions passed:

1. provider error requeues exact pressure and waits 120 fresh settlement ticks;
2. decline settles exact pressure and stays matter/provider quiet for 600 ticks;
3. defer retains pressure to tick+60 and only then retries without ghost matter;
4. clarify retains pressure to tick+30 without speaking provider-authored question;
5. error outcome deterministic across two real-Chrome runs;
6. decline outcome deterministic across two real-Chrome runs;
7. defer outcome deterministic across two real-Chrome runs;
8. clarify outcome deterministic across two real-Chrome runs;
9. deterministic fixtures make zero real provider/API requests;
10. zero uncaught browser exceptions;
11. screenshots are non-empty and read-only.

All earlier browser gates R1 through R5-B also remained green on the same source.

## R5 state after C

The deterministic provider laboratory now defends three materially different classes:

- **R5-A success/homeostasis**:
  one genuine reason -> one provider judgement -> one grounded consequence -> settlement -> quiet;
- **R5-B concurrency/staleness**:
  newer addressed attention invalidates old judgement, with fresh settlement-time retry backoff;
- **R5-C non-success/error homeostasis**:
  failure, decline, defer and clarify leave pressure explicitly settled or retained without ghost authority or immediate churn.

## Non-claims

R5-C does not prove:
- real GPT-5.6 Luna follows the semantic contract reliably;
- real-Luna judgement quality is useful;
- real-Luna latency/usage distribution is acceptable;
- five residents remain stable with real provider cognition enabled;
- long-running cost remains bounded;
- residents are already genuinely alive in the Owner sense;
- preferences, aversions, relationships, habits, self-interest and broader character continuity are solved.

## Safety boundary before real provider work

The September runaway demonstrated that a soft account/project spend threshold is not a runtime kill-switch.

Do **not** re-enable a broad unattended real-provider loop from R5-C alone.

The first real-provider R5 experiment should be a bounded judgement probe whose apparatus itself enforces a very small hard request budget and cannot recursively continue into an unattended provider loop.

Its purpose is to test provider-specific judgement quality against already-qualified causal/homeostatic plumbing — not to prove that five residents are alive.
