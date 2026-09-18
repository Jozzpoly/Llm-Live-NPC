# SPC Re-observation — Findings Ledger

> **CURRENT EXECUTION NOTICE (2026-09-18):** These findings remain valid evidence within their recorded scope, especially the contract-to-oracle warnings. Some composition gaps have since advanced materially. Use `docs/SPC_LIVING_WORLD_EXECUTION_PROGRAM.md` for current execution state and do not promote this ledger's old stop-line as today's roadmap.


Date: **2026-09-16**  
Campaign: `SPC_REOBSERVATION_CAMPAIGN.md`  
Status: **ACTIVE / findings are scoped, not global project verdicts**

This ledger records concrete mismatches discovered by re-observing the running project rather than promoting old green evidence by inertia.

## F-01 — `world-only` is spectator, not participant view

**Status: CONFIRMED**  
**Class: instrument semantics / claim inflation**

The current presentation hides research telemetry but still renders global World actors, material objects, region labels and speech occurrences. Evidence scripts may additionally focus the camera on a selected resident or switch to whole-World overview.

Therefore the current `WORLD VIEW · NO TELEMETRY` / `world-only` mode is an omniscient/public spectator lens, not a participant-bounded Owner/player view.

Consequence: screenshots captured in this mode may support **SPECTATOR-OBSERVED** claims. They cannot support **PARTICIPANT-OBSERVED** claims until a real participant projection exists.

## F-02 — visual artifact assertions were being over-promoted

**Status: CONFIRMED**  
**Class: contract-to-oracle gap**

Several browser qualifiers assert that PNGs are non-empty, hash-identified and canonically read-only. Those are valuable capture-integrity properties.

They do **not** prove:

- the depicted behavior is readable;
- the resident appears alive;
- the timing/rhythm of the behavior is coherent;
- the participant could causally perceive the depicted information;
- the scene is free from fixture contamination.

A concrete example on Browser Evidence #136 (`e4ef1508...`): the recovery assertion named `recovery participant screenshots are non-empty and canonically frozen` only tests screenshot byte sizes. The captured metadata contains canonical hashes, but that assertion does not compare a before/after canonical state and the camera is a spectator camera, not participant-bounded.

Hard distinction:

`artifact captured` != `capture is observationally non-mutating` != `visual behavior qualified` != `participant experience qualified` != `living behavior qualified`.

## F-03 — duplicate visible Owner identity from research fixture

**Status: CONFIRMED**  
**Class: presentation contamination**

The missing-crate fixture creates `player.relocator`. The renderer currently labels every actor with `kind === "player"` as `Jozz` rather than distinguishing `player.jozz` from research-only player-kind actors.

Result: any frame containing `player.relocator` can visually imply a second Owner/player identity even though the actor exists only to perturb research World truth.

The causal Janek tests can still be correct while the rendered research world communicates a false situation. This proves that resident-private epistemic correctness alone is insufficient presentation evidence.

## F-04 — hidden relocator contaminated Janek's later private actor perception

**Status: CONFIRMED -> REGRESSION ORACLE ADDED -> FIX RE-ATTACKED GREEN**  
**Class: fixture interference / private-history contamination**

The old hidden relocation fixture left `player.relocator` colocated with relocated crate B=(2752,720). The immediate relocation boundary looked clean, but that was not enough.

Re-observation added two stronger executable oracles:

1. `4d9177db...` required that no resident acquire the fixture actor immediately after hidden relocation. **Check #901 PASS**, falsifying the earlier hypothesis that Ida or another resident was already contaminated at that boundary.
2. `068cf530...` tracked fixture actor percepts through the complete recovery timeline. **Check #902 RED** with exactly:

`{ "resident.janek": 1 }`

Only Janek later acquired one `player.relocator` percept as he approached/reacquired the colocated crate. This turned the suspected fixture problem into direct executable evidence.

The first repair (`07259b8c...`) moved the crate to a different axis and removed the leak, but six existing search/semantic tests rejected it because it changed the experiment's spatial variable. That repair was discarded rather than weakening the tests.

The narrower repair (`e4ef1508...`) restores the exact old crate destination B=(2752,720) and the same explicit physical pickup -> one relocation World tick -> place sequence. After placement, the relocator retains a southbound physical motion intent so the next World integration carries the research actor away before Janek's later reacquisition.

Evidence:

- **Check #904 PASS** with the same full-recovery leak oracle that was RED on `068cf530...`;
- Browser Evidence #136 on `e4ef1508...` independently passed missing-crate epistemic boundary, embodied recovery and interruption/return in real Chrome.

Scope: the core oracle covers all five resident private streams. The current browser recovery report still lacks a transient fixture-percept oracle and should gain one so real-Chrome evidence can guard the exact failure mode too.

## F-05 — Ida browser FAIL is a reporter false-negative, not a demonstrated delivery failure

**Status: CONFIRMED INSTRUMENT CONTRACT DRIFT**  
**Class: false-negative promotion oracle / lifecycle mismatch**

Real Chrome Browser Evidence #136 on `e4ef1508...` observed Ida:

- starting from one accepted social commitment;
- moving under the exact social run;
- legally reacquiring Janek through private sight;
- emitting one factual World speech occurrence addressed to Janek;
- matter becoming resolved with the run retired;
- Janek receiving that exact occurrence as addressed hearing;
- nearby Mira receiving the same occurrence as unaddressed hearing;
- distant Oren/Nela not receiving it;
- deterministic causal checkpoints across reloads.

The single failing reporter assertion additionally required terminal `lastOutcomeEvidenceSummary` to contain the speech occurrence id. That requirement conflicts with the current kernel contract: `terminalizeMatter()` intentionally calls `releaseLiveEvidencePins()`, and `lastOutcomeEvidence()` is therefore expected to be `null` after resolve.

The headless I1 test already uses the correct lifecycle boundary: it checks the `reconcileRunOutcome()` result while the matter is still active, then checks terminal matter state and factual/private speech consequences separately.

Therefore Browser #136 is correctly described as:

- **Ida observed behavior in this slice: causal PASS within the exercised scope**;
- **Ida browser reporter: FAIL due to stale/invalid post-terminal evidence-pin expectation**;
- **whole Browser Evidence #136: FAIL**, because workflow conclusion follows the reporter.

Do not simply promote the whole workflow to green by prose. Repair the browser oracle to observe the correct lifecycle boundary or durable provenance owner.

The broader architecture question remains legitimate: if a completed matter must be reconstructable long after terminalization, durable causal history needs an owner other than the live evidence pins. That is distinct from the false-negative reporter bug.

## F-06 — interruption is causally stronger than it is temporally legible

**Status: OBSERVED / MATERIAL**  
**Class: world readability / temporal legibility**

The Janek interruption qualifier demonstrates a meaningful causal sequence:

`search active -> addressed hearing -> search suspended -> body stops/turns -> "Tak?" -> hold -> exact same search resumes -> motion reclaims facing -> original crate consequence eventually resolves`.

Exact Browser #136 frames make the response itself reasonably visible through Janek's turn and the `Tak?` speech bubble. However response and returned-to-search frames remain visually very similar, and old speech bubbles can still dominate the scene after authority has already changed back.

Therefore causal interruption/resume is stronger than its current temporal readability.

Future visual qualification should judge temporal sequences, not isolated endpoint PNGs. Reaction latency, turn, pause, resumed movement, attention handoff, speech lifetime and aftermath all matter.

## F-07 — five residents still function mainly as isolated pressure fixtures

**Status: CONFIRMED AS CURRENT QUALIFICATION BOUNDARY**  
**Class: product-composition gap**

Current strong browser slices are scenario-specific: baseline Janek material delivery, missing crate, recovery, interruption, live-provider variants, and Ida message delivery.

These are useful vertical specimens. They are not evidence that five residents are simultaneously living independent lives in one running world.

The five-resident campaign document already requires independent `Five-resident truth`; re-observation confirms that this plane has not yet been earned.

## F-08 — central systemic diagnosis: contract-to-oracle gap

**Status: WORKING ROOT CAUSE, SUPPORTED BY MULTIPLE FINDINGS**

The recurring failure pattern is not simply bad planning or bad code.

A stronger explanation is:

`Owner intent is correct`
→ `architecture/specification preserves it`
→ `implementation satisfies many local contracts`
→ **`promotion oracle measures a weaker or stale proxy`**
→ `green/red evidence is psychologically/generalistically promoted beyond its actual scope`
→ `the final experienced product remains far from the vision`.

Examples now observed directly:

- document says participant truth; tool supplies spectator view;
- visual assertion says participant/frozen; predicate checks PNG byte count;
- renderer says every player-kind actor is Jozz; research fixture can become a fake Owner;
- missing-crate recovery was causally green while fixture actor later entered Janek's private sight;
- immediate-contamination hypothesis looked geometrically plausible but a stronger oracle falsified it;
- Ida delivery works physically/private-epistemically while the browser reporter fails on a deliberately released live evidence pin;
- interruption state machine works; physical timing remains only partly readable.

This is why re-observation must continue experience-by-experience and why no single green or red evidence plane may promote the whole scenario.

## F-09 — baseline demonstrates an authored start, not sustained resident life

**Status: OBSERVED / NEEDS DETERMINISTIC LONG-WINDOW ORACLE**  
**Class: living-world composition / temporal depth**

A bounded free exploratory browser run of the actual SPC Next build reached roughly `t1215` and observed all five resident list entries as `still · legacy idle`. Mira's selected projection showed:

- `motion intent = 0`;
- `resolved velocity = 0`;
- legacy reason `completed activity:mira:initial`.

This is not proof that a resident must always be moving, nor proof of permanent infinite idleness. Stillness can be valid life behavior.

It is evidence that the current baseline specimen, after its authored initial activities complete, does not visibly demonstrate another autonomous resident matter/routine/consequence within that observed window. The current long-idle test only proves that the substrate survives such a window; it does not prove sustained life.

Required next step for ROBS-1: build a deterministic long-window observation that distinguishes legitimate stillness from inertness by tracking continuing matters, private pressure, attention changes, body activity, resident-originated World effects and subsequent self-directed transitions across all five residents.

Do **not** repair this with random wandering or cosmetic status churn.

## Current stop-line

Before another large resident-capability expansion, ROBS-0 should close or explicitly bound:

1. spectator vs participant view semantics;
2. browser-level fixture contamination regression coverage;
3. truthful naming of visual evidence assertions;
4. Ida browser false-negative lifecycle assertion;
5. temporal observation of behavior rather than isolated screenshots;
6. durable terminal causal-history ownership as a separate architecture question;
7. at least one genuinely participant-bounded observation path.

After those senses are trustworthy enough, ROBS-1 should attack sustained five-resident life over time rather than adding isolated feature count.

The objective is not prettier instrumentation. It is to ensure that the next long build campaign is conducted with trustworthy senses.