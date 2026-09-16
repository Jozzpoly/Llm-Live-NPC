# SPC Re-observation — Findings Ledger

Date: **2026-09-16**  
Campaign: `SPC_REOBSERVATION_CAMPAIGN.md`  
Status: **ACTIVE / findings are scoped, not global project verdicts**

This ledger records concrete mismatches discovered by re-observing the running project rather than promoting old green evidence by inertia.

## F-01 — `world-only` is spectator, not participant view

**Status: CONFIRMED**  
**Class: instrument semantics / claim inflation**

The current presentation hides research telemetry but still renders global World actors and speech occurrences. Evidence scripts may additionally focus the camera on a selected resident.

Therefore the current `WORLD VIEW · NO TELEMETRY` / `world-only` mode is an omniscient spectator lens, not a participant-bounded Owner/player view.

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

Hard distinction:

`artifact captured` != `visual behavior qualified` != `participant experience qualified` != `living behavior qualified`.

## F-03 — duplicate visible Owner identity from research fixture

**Status: CONFIRMED**  
**Class: presentation contamination**

The missing-crate fixture creates `player.relocator`. The renderer currently labels every actor with `kind === "player"` as `Jozz`.

Result: interruption screenshots visibly contain two actors labelled `Jozz`: the real `player.jozz` and fixture-only `player.relocator`.

The causal Janek test can still pass because Janek initially does not perceive the relocator. The rendered product world is nevertheless nonsensical.

This proves that resident-private epistemic correctness alone is insufficient product evidence.

## F-04 — hidden relocator later contaminates resident actor perception

**Status: CONFIRMED BY CURRENT GEOMETRY / NEEDS DIRECT REGRESSION ORACLE**  
**Class: fixture interference / private-history contamination**

The hidden relocation fixture leaves `player.relocator` at the relocated crate position B=(2752,720).

Current default resident actor sight radius is 520 units. Actor sight admits actors within that radius with line-of-sight. Material knowledge uses the same resident sight radius and line-of-sight.

The recovery specimen legally reacquires the crate at B through sight while the relocator remains at exactly B. Therefore any position from which Janek can visually reacquire the crate also satisfies distance/LOS conditions for visually perceiving the colocated relocator.

The current browser recovery summary does not report relocator percepts, so this contamination is invisible to its oracle.

This matters beyond presentation: an adversarial research stimulus can remain in authoritative World truth long enough to enter the resident's private history and possibly cognition pressure.

Required next step: add a direct characterization/regression that reports fixture-actor percepts throughout the whole recovery timeline, then redesign the perturbation so research apparatus cannot become unintended resident experience.

## F-05 — Ida causal execution works further than the terminal browser claim

**Status: CONFIRMED / OPEN OWNERSHIP QUESTION**  
**Class: causal-history boundary**

Real Chrome evidence on head `1324332fd168504ab0a3ea1329fcd25897ca5646` showed Ida:

- starting from one accepted social commitment;
- moving under the exact social run;
- legally reacquiring Janek through private sight;
- emitting one factual World speech occurrence addressed to Janek;
- Janek receiving addressed hearing;
- nearby Mira receiving the same occurrence as unaddressed hearing;
- distant residents not receiving it;
- repeated runs reaching deterministic causal checkpoints.

The qualifier fails because it expects `lastOutcomeEvidence` after the matter is already terminal.

The continuity kernel intentionally releases live evidence pins on terminalization and explicitly does not act as a historical archive. Therefore the failing assertion conflicts with the current live-kernel contract rather than proving that the speech/delivery execution itself failed.

Do not merely delete the assertion. The larger need remains valid: if the system claims a matter ended *because of a particular factual World outcome*, some durable causal-history owner must be able to reconstruct that terminal justification without forcing the live semantic kernel to become an archive.

## F-06 — interruption is causally stronger than it is temporally legible

**Status: OBSERVED / MATERIAL**  
**Class: world readability / temporal legibility**

The Janek interruption qualifier demonstrates a meaningful causal sequence:

`search active -> addressed hearing -> search suspended -> body stops/turns -> "Tak?" -> hold -> exact same search resumes -> motion reclaims facing -> original crate consequence eventually resolves`.

However spectator screenshots around response and return-to-search look nearly identical. The scene relies on speech bubbles and hidden authority transitions to carry much of the story.

Therefore causal interruption/resume is stronger than its current physical readability.

Future visual qualification should judge temporal sequences, not isolated endpoint PNGs. Reaction latency, turn, pause, resumed movement, attention handoff and aftermath all matter.

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
→ **`promotion oracle measures a weaker proxy`**
→ `green evidence is psychologically/generalistically promoted beyond its actual scope`
→ `the final experienced product remains far from the vision`.

Examples now observed directly:

- document says participant truth; tool supplies spectator view;
- document says observable truth; assertion checks PNG byte count;
- resident epistemics are valid; fixture visibly creates a second Jozz;
- missing-crate recovery is causally valid; fixture actor can later enter private sight;
- Ida delivery works physically; terminal audit expectation conflicts with lifecycle ownership;
- interruption state machine works; physical timing remains weakly readable.

This is why re-observation must continue experience-by-experience and why no single green evidence plane may promote the whole scenario.

## Current stop-line

Before another large resident-capability expansion, ROBS-0 should close or explicitly bound:

1. spectator vs participant view semantics;
2. fixture contamination, especially `player.relocator`;
3. truthful naming of visual evidence assertions;
4. temporal observation of behavior rather than isolated screenshots;
5. terminal causal-history ownership for completed matters;
6. at least one genuinely participant-bounded observation path.

The objective is not prettier instrumentation. It is to ensure that the next long build campaign is conducted with trustworthy senses.