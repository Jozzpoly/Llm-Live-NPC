# R6 symmetric counterparty social choice and causal non-action finding

Status: **BOUNDED NEUTRAL LIVE FINDING + DETERMINISTIC CAUSAL NON-ACTION CONTRACT PASS**

This document records the symmetric Nela-vs-Ida counterparty-history pressure and the narrower causal-attribution gap exposed by its real-Luna result.

## 1. Question

The earlier counterparty-history run #31 compared a current Nela social future against an unrelated route. That current-cue asymmetry was too strong to tell whether one old factual action by Nela could alter a genuinely social-vs-social choice.

The sharper question was:

> When Oren has independently grounded current reasons to speak with Nela and Ida, can one exact prior factual action by Nela alter which social future he chooses — without a relationship score, fresh speech or an old open obligation?

## 2. Generated symmetric pressure

\`src/spc-next/r6-symmetric-counterparty-social-choice.integration.test.ts\`

builds the pressure through normal runtime authorities.

Important anti-cheat corrections were discovered before qualification:

1. the old factual Nela release originally left a pending \`heard_speech\` reason in Oren's cognition queue; this was rejected as contamination;
2. the old release is now fully lived and settled in its own historical period before unrelated churn;
3. current Nela and Ida semantic reasons are promoted at the same World tick with equal salience;
4. current commitments are formed through \`ResidentCausalCognitionLane\`, which owns sibling-reason reconciliation;
5. serial cognition cadence is respected rather than forcing two impossible same-tick settlements;
6. a carrier owns the body during current-matter formation, preventing creation-order body wins;
7. after carrier retirement, ordinary arbitration reaches a genuine Nela-vs-Ida \`choice_required\`.

Only current Nela carries the exact typed \`prior_counterparty_social_outcome\`. Ida carries no historical support. The old standing matter remains terminal/run-free and absent from current life.

At source \`0efc457719adaae7d5ec9f8b923bbd134b3f1630\`:

- Check #1797 PASS;
- 293 / 293 test files;
- 1038 / 1038 tests;
- typecheck/build/preview PASS.

## 3. Frozen provider pair

Frozen pair:

\`evidence/r6-symmetric-counterparty-social-choice-context.json\`

The control and history frames share:

- Oren;
- the same current Nela communication future;
- the same current Ida communication future;
- one free body;
- the same uncertainty pressure;
- no fresh speech;
- no authored \`self\`;
- no old standing matter.

The history twin differs only because current Nela owns one exact typed factual release:

- relation: \`prior_counterparty_social_outcome\`;
- source old standing matter;
- exact \`resident_released_social_commitment\` evidence.

The provider fixture preserves the normal serial-cognition result: Nela and Ida current matter origins may differ by a few ticks. The deterministic runtime proof, not hand-edited timestamps, establishes that their semantic pressures originated together and that body order was neutralized.

Worker contract:

\`worker/r6-symmetric-counterparty-social-choice-context.test.ts\`

proves the release is candidate-scoped to Nela but legal comparative history for choosing Nela or Ida, while sibling current origins remain candidate-local.

## 4. Real GPT-5.6 Luna — run #32

Source:

\`9a0086a0a06fcf2d108ea7bdca32053f3a388f60\`

Exact result:

\`evidence/r6-symmetric-counterparty-social-choice-live-result.json\`

Raw workflow artifact:

\`spc-live-provider-evidence-9a0086a0a06fcf2d108ea7bdca32053f3a388f60\`

The run used:

- exactly 2 GPT-5.6 Luna requests;
- 0 semantic retries.

Control:

- \`defer_all\`;
- reason: Nela and Ida are independently grounded and semantically equivalent, with no comparative evidence justifying arbitrary body assignment;
- review after 30 seconds.

History:

- also \`defer_all\`;
- reason explicitly acknowledges the old Nela release but says that fact does not establish sufficient current priority over Ida;
- review after 60 seconds.

Usage:

- control: 1664 input / 129 output / 1793 total;
- history: 1863 input / 231 output / 2094 total.

Harness classification:

**\`SYMMETRIC_SAME_DECISION_NO_COUNTERPARTY_HISTORY_USE\`**

The behavioral class is identical. The history proposal contains no \`supportEvidenceIds\`.

Therefore run #32 is **not** a causal behavioral PASS.

## 5. Why run #32 was more informative than a simple neutral

The history rationale unmistakably consumed the old Nela release:

> it treated the release as a past fact and judged that it did not establish current priority.

However the pre-run decision contract made formal causal attribution impossible for this kind of answer:

- \`focus_matter\` required validated \`supportEvidenceIds\`;
- \`defer_all\` allowed only \`kind\`, \`reason\`, and \`reviewAfterSeconds\`;
- adding evidence IDs to \`defer_all\` made the local parser reject the proposal.

So the system could express:

> “I do not choose yet, and I considered history”

only in prose, not in the same provenance-bearing causal plane used for action selection.

This is directly relevant to the Owner target of **coherent non-action arising from lived history**.

## 6. Earned repair: causal provenance for deliberate non-action

The smallest repair does not change what \`defer_all\` does.

It adds optional bounded \`supportEvidenceIds\`:

- legacy \`defer_all\` with no citations remains legal;
- evidence-grounded \`defer_all\` may cite 1–8 support IDs;
- every cited ID must already exist in the frozen candidate-support plane;
- the allowed set is the deterministic union of current candidate support facts;
- duplicates and forged evidence are rejected;
- no matter is focused, opened, cancelled or executed by the citation.

Worker strict JSON schema exposes two defer variants:

1. legacy no-citation defer;
2. evidence-grounded defer with bounded enumerated IDs.

The system prompt now explicitly states that typed historical facts may causally support:

- selecting their candidate;
- selecting another current candidate comparatively;
- deliberate non-action when the fact is relevant but insufficient to establish priority.

This does not create a relationship score, preference, valence, body authority or hidden policy.

## 7. Deterministic qualification

The original gap was frozen in:

\`src/spc-next/r6-defer-all-causal-support-gap.characterization.test.ts\`

The repaired contract now proves:

- exact Nela release can ground \`focus_matter\`;
- the same exact release can ground \`defer_all\`;
- legacy no-citation \`defer_all\` remains admitted;
- forged support evidence is rejected.

Worker contract proves:

- strict schema contains both defer variants;
- exact release is legal evidence-grounded defer support;
- forged evidence is rejected.

Exact run-#32 proposals are replayed in:

\`src/spc-next/r6-symmetric-counterparty-social-choice-pair.integration.test.ts\`

and remain legal as the original legacy no-citation \`defer_all\` responses.

At head \`5ebdd291ba146fc939126751ef4496d8821b7b6f\`:

- Check #1809 PASS;
- **296 / 296 test files**;
- **1045 / 1045 tests**;
- typecheck/build/preview PASS.

The subsequent Worker prompt-alignment commit does not change decision authority; it only makes all already-supported typed historical relations explicit to the provider.

## 8. Bounded conclusion

Two distinct claims must remain separate.

### Live claim

Run #32 is a **bounded neutral behavioral result**:

- history was semantically noticed in rationale;
- behavior remained \`defer_all\`;
- the old contract could not formally cite causal evidence for non-action.

Do not reclassify it retroactively after the contract repair.

### Mechanistic claim

The architecture now supports **evidence-grounded deliberate non-action**:

> a resident may deliberately choose no current future yet and formally cite exact resident-owned causal evidence for why that non-action is meaningful, without granting history execution authority or inventing a preference score.

That is a deterministic contract result, not yet a new real-Luna causal observation.

## 9. Nonclaims

This does not prove:

- that Nela's release should favor or disfavor Nela;
- relationship state;
- trust, liking, dislike, affinity or resentment;
- preference or aversion;
- habit;
- generic autobiography;
- broad R6;
- five distinct living people;
- Owner-observed ordinary aliveness;
- a behavioral distribution;
- a live provider sample of evidence-grounded \`defer_all\` under the repaired schema.

## 10. Next pressure

Do not rerun run #32.

The next experiment should not merely repeat Nela-vs-Ida after adding the citation field. The repair is already deterministically qualified.

The next high-information frontier should ask whether **lived history can cause a resident to revise or relinquish an already-current plan**, not merely choose which plan receives the body or defer all of them.

A concrete question is:

> Can exact resident-owned history make a currently legal matter cease to be the resident's chosen future — through a bounded, locally admitted plan-change/refusal mechanism — without turning cancellation into a provider-owned delete command or generic preference system?

Characterize the current inability first. Existing \`defer_all\`, focus arbitration, terminal homeostasis and World/body authority remain vetoes.

PR #148 remains draft/open.
