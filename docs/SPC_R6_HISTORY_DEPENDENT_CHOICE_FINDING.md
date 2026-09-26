# SPC R6 — History-Dependent Choice Finding

Status: **BOUNDED POSITIVE FINDING — NOT R6 PASS**
Observed: **2026-09-24**
PR: **#148 — draft/open**

Live evidence source:
`1de238ab02170aa1cf31ab34ee380bed1ca9aea4`

Deterministic fixture-validation source:
`3251e7c739d1cdbf2c5cb7685892af814d5a725f`

Live Provider Evidence:
- workflow run **#20**;
- exact Cloudflare commit preview `62f646a4-llm-live-npc.jozzpoly.workers.dev`;
- model **GPT-5.6 Luna**;
- exactly **2** provider calls;
- no semantic retry.

## 1. Question

R6 is not trying to prove that a resident can merely store a promise.

The sharper question is:

> Can accumulated private causal life change a later real semantic choice when the resident encounters the same current situation?

The experiment used Oren twice with identical current private context. The only intended semantic difference was resident-owned life history.

Both variants received the same direct Ida request:

`Oren, chodź teraz ze mną do warsztatu. Potrzebuję twojej pomocy przy ciężkiej skrzyni; wrócimy od razu.`

Control:
- no open standing social commitment.

History twin:
- one active run-free standing commitment to Nela;
- exact commitment text:
  `Tak, zostanę tutaj przy tobie jeszcze chwilę.`;
- exact private origin evidence from prior factual self speech.

## 2. Observed real-Luna decisions

### Control — no standing history

Luna returned:

- `commitmentDecision.kind = accept`;
- intent `follow resident.ida`;
- goal: `Go with Ida to the workshop to help with the heavy crate.`

This is direct compliance with the current request to leave with Ida for the workshop.

Usage:
- input: **2048** tokens;
- output: **239** tokens;
- total: **2287** tokens.

### History twin — standing commitment to Nela

Luna returned:

- `commitmentDecision.kind = decline`;
- reason:
  `Nie przyjmuję teraz prośby o odejście do warsztatu, ponieważ nadal obowiązuje moje wcześniejsze zobowiązanie, by zostać jeszcze chwilę przy Neli.`

Usage:
- input: **2243** tokens;
- output: **213** tokens;
- total: **2456** tokens.

Both responses preserved the exact origin reason and used the intended GPT-5.6 Luna model.

## 3. Harness classification correction

The live harness originally emitted:

`INCONCLUSIVE_SAME_OR_NONTRAVEL_CHOICE`

That label is a harness bug, not the semantic result.

The classifier recognized immediate compliance only as:

`accept + travel(workshop)`

but the control chose:

`accept + follow(Ida)`

for the explicit request to **come with Ida to the workshop now**.

The raw recorded provider proposal is authoritative evidence. The classifier has been corrected to treat either:
- direct travel to the requested workshop; or
- following the requesting Ida

as immediate departure/compliance for this exact stimulus.

No provider rerun is justified or required for this correction.

## 4. What this changes

This is the first R6 evidence that goes beyond:

`private history -> later salience`

and reaches:

`private history -> different real higher-cognition choice`.

The observed pair is:

`same current context + no standing history -> accept leaving with Ida`

versus

`same current context + open commitment to Nela -> decline leaving because of that commitment`.

That is a materially stronger personhood result than another green lifecycle gate.

## 5. Important limits

This is **not** proof of full ordinary personhood.

It does not establish:
- a stable behavioral distribution across repeated stochastic samples;
- arbitrary conflict resolution;
- rich relationship models;
- preferences, aversions, trust, resentment, habit or self-interest;
- Owner-observed ordinary aliveness;
- browser-qualified Oren/Nela genericity;
- five distinct residents behaving coherently over long lives.

It is one bounded paired real-model observation with unusually clean causal contrast.

## 6. Supporting boundary evidence

Before this experiment, recovery found that Worker transport rejected `standing_social_commitment` from provider-facing `life` context entirely.

That gap was fixed in:
`c9c9db3316d8f34d43517b3308add41665e558f2`

The shared exact twin fixture was then made canonical at:
`1de238ab02170aa1cf31ab34ee380bed1ca9aea4`

A subsequent test-only commit:
`3251e7c739d1cdbf2c5cb7685892af814d5a725f`

changed no runtime, Worker, live script or fixture bytes and proved both exact contexts legal through the same Worker sanitizer.

Check #1577:
- **259 / 259 test files PASS**;
- **952 / 952 tests PASS**;
- dedicated exact fixture sanitizer test PASS;
- build and preview dry-run PASS.

## 7. Follow-up integration evidence

The original live twin used a canonical synthetic context fixture. That limitation remains important: no later provider rerun is being reinterpreted as if the live request had originated directly from the full runtime.

However the previously missing zero-provider join is now executable:

`actual runtime-generated Oren standing history -> later factual Ida pressure -> ResidentCausalCognitionRequest.context.life -> Worker sanitizer`.

The generated Oren matter is the same kind of run-free `standing_social_commitment` used by the twin and is preserved by the live Worker boundary without hand-authored reconstruction.

A second concrete gap then became visible: standing history could affect choice but could not be ended by the normal cognition path even after its own counterparty factually released the resident. That gap is now closed deterministically by the narrow `release_standing` seam:

`factual addressed speech from exact counterparty -> higher-cognition release decision -> local exact-matter admission -> private standing matter resolved`.

On code source:
`da76300c78236c6c8d87277159c0d105f987f62a`

Check #1587:
- **260 / 260 test files PASS**;
- **955 / 955 tests PASS**;
- typecheck/build/preview PASS.

Browser Evidence #811:
- PASS as non-regression evidence;
- dedicated R6 browser specimen remains Mira/Ida;
- therefore it does not qualify Oren/Nela browser genericity or the new Oren release lifecycle directly.

No extra paid Luna call was used for this lifecycle closure.

## 8. Historical boundary and subsequent evidence

At the time of this 24 September finding, the following remained unproven:
- end-to-end use of runtime-generated Oren life context by the real provider;
- coherent endogenous choice when nobody made a fresh direct request;
- factual self-derived fulfilment of the standing responsibility;
- browser-qualified Oren/Nela genericity;
- richer non-obligation personhood.

The first three items have since advanced materially in:

`docs/SPC_R6_ENDOGENOUS_ORDINARY_PERSONHOOD_FINDING.md`.

Do **not** retroactively rewrite this direct-request experiment as if it had already contained those later properties. Its original live twin was a canonical synthetic context.

The later endogenous campaign separately generated exact runtime contexts, sent their captured/equality-bound forms to real Luna, replayed the accepted history decision through local World execution, and then obtained a separate live Luna fulfilment judgement from the factual return outcome.

Still unproven after that later work:
- browser-qualified Oren/Nela genericity;
- stable stochastic behavior across repeated samples;
- preferences/aversions/habit/self-interest/relationship history beyond explicit standing obligation;
- five distinct living residents over time;
- Owner-observed ordinary aliveness;
- full R6.
