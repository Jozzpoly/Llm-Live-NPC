# LLM Live NPC — Fresh Takeover

Use this document to start a fresh Browser ChatGPT conversation after the 2026-09-07 selective recovery and Pass 0 evidence reconciliation.

## 1. First action: verify live truth

Repository:

`Jozzpoly/Llm-Live-NPC`

Current recovered/refoundation line at this handoff:

`recovery/owner-fail-2026-09-07`

Recovered runtime checkpoint immediately before the final docs-only reconciliation:

`b31a851c3f708077fbf9e6fb8206fa392f8def13`

Do **not** trust that SHA merely because it is written here. Verify the live branch first.

Expected relationship at takeover:

- the live branch may be newer only because of the final canonical-spine docs closure;
- if runtime/product files changed after `b31a851c...`, inspect and classify those changes before continuing;
- do not assume a newer docs head changes the qualified runtime claim.

`main` is **not** the current research frontier. It intentionally remains the historical P0 checkpoint:

`f207419ee87c03979544d2d579e624f043300bbc`

The old P1 integration PR #3 and the failed-readiness evidence PR #47 are closed without merge. There should be no open PRs at this handoff unless newer work has started.

## 2. Read in this order

1. `README.md`
2. `docs/PROJECT_STATE.md`
3. this file

Only then inspect exact historical/evidence surfaces if needed:

- PR #47 — decisive Owner/browser FAIL of the old readiness line;
- PRs #70–#74 — final bounded selective recovery repairs;
- PR #75 — evidence-only combined R8 re-attack;
- PR #3 — historical P1 donor/integration line;
- `docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md` — historical E1 design context.

The canonical startup spine is intentionally small. Do not reconstruct the project by reading every historical branch or readiness PR first.

## 3. The critical historical distinction

Do not collapse these two lines into one story.

### Failed old readiness line

`experiment/e1-grounded-notice-fetch` continued beyond the last good pre-readiness runtime. Automated evidence became strong, but the final 2026-09-07 Owner/browser gate found the playable lab materially worse than the earlier good surface.

That Owner FAIL remains valid negative evidence.

### Selective recovery line

Recovery deliberately restarted from:

`15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

It did **not** forward-merge the failed readiness line. Useful changes were independently re-earned when justified.

Current recovered runtime checkpoint:

`b31a851c3f708077fbf9e6fb8206fa392f8def13`

Never describe the failed old line as having been “fixed forward” into recovery.

## 4. What the recovered checkpoint currently proves

The recovered runtime is bounded evidence for a causally coherent old substrate:

`World truth → bounded E1 evidence → wait|fetch cognition → revalidation → deterministic executor → World attempt/outcome → subsequent experience`

It also preserves:

- P1 World/action/execution substrate;
- player/manual/cognition provenance distinctions;
- arm/session stale-response protection;
- concrete cognition→executor diagnostic correlation;
- truthful unsupported generic actor interaction rather than event-less pseudo-success;
- same-frame ordering and ownership behavior challenged by the final R8.

Canonical recovered runtime qualification at `b31a851c...`:

- 145/145 tests across 26 files;
- strict TypeScript/build/preview PASS;
- Cloudflare PASS;
- post-merge Cloudflare Version ID `0e1a7e36-edba-4660-8fa2-f2b38172d760`.

Final combined R8 evidence-only PR #75:

- evidence head `72ea11abd7a0b56230ced6019e7c550b5109b476`;
- exactly one added test file, no runtime product changes;
- 149/149 tests across 27 files;
- R8 4/4 PASS;
- strict TypeScript/build/preview PASS;
- Cloudflare PASS;
- Version ID `ff9be74c-754a-46b0-851f-36ffb8a9233b`;
- closed without merge.

This is sufficient to treat the old substrate as a bounded donor. It is **not** a production-readiness claim.

## 5. Owner-quality boundary

Do not make this mistake during takeover:

> automated/R8-qualified ≠ freshly Owner-qualified.

The old readiness line failed its final Owner/browser gate. The recovered checkpoint has not yet received a new final qualitative Owner/browser re-gate after selective recovery.

A new Owner gate is **not required merely to begin conceptual Refoundation Pass 1**. It becomes required when a claim or decision depends on the recovered runtime's current feel, usability or browser quality.

## 6. Do not mechanically recover historical readiness work

The selective recovery intentionally left some later historical work unported, including:

- R5b timeout/retry/cancellation policy;
- later R6 sensory/event-buffer refinements;
- later R7 ingress/provider-observability hardening.

Do not treat this list as an automatic repair queue.

First ask whether the new Live NPC architecture still needs the same contract in the same place. Reuse donor ideas when justified; do not preserve obsolete apparatus for checklist completeness.

## 7. Product direction to carry into Pass 1

The Owner's current direction has changed the level of the project.

The question is no longer merely “can the LLM notice a dropped item and fetch it?” The intended subject is a **persistent embodied resident**.

Carry these as hypotheses to challenge, not as already-final architecture:

- one NPC = one persistent cognitive identity;
- ordinary shared world chat is the preferred initial communication surface;
- dedicated/focused conversation UI may exist later as QoL but should not create a private alternate reality;
- speech should be a world communication occurrence;
- hearing ≠ addressedness;
- an utterance ≠ canonical world fact;
- the NPC should remain alive between LLM calls through cheap local runtime state/behavior;
- LLM calls should be event/need-driven and semantically meaningful, not per-frame heartbeat;
- LLM should have real authority over meaning, language, interpretation, social judgement, intentions and deliberation;
- World/deterministic systems remain authoritative about execution and factual outcomes;
- one shared NPC must remain coherent with multiple players/participants;
- debug should reveal causal state and provenance, not hidden chain-of-thought.

Do not turn these bullets directly into classes/tables/managers yet.

## 8. Immediate task after takeover

The next stage is:

**Live NPC Refoundation Study — Pass 1: Owner vision reconstruction, invariants and anti-goals.**

Do **not** start by implementing chat, speech, memory, a Mind Runtime, planner, utility AI or another E1 feature.

Pass 1 should critically reconstruct:

- what “real/alive/present NPC” means in this project;
- which player↔NPC↔world experiences matter most;
- which failures would immediately make the NPC feel fake;
- what must persist when no LLM request exists;
- where procedural/local intelligence should end and semantic LLM cognition should begin;
- how much weight conversation, autonomy, world competence, relations and memory should receive;
- what complexity is explicitly unwanted in early experiments;
- what success would look like from the Owner's hands-on perspective.

The output should be a **north star + invariants + anti-goals**, not an implementation roadmap.

Only after this should the project proceed into donor audit, architecture research, competing hypotheses, recursive falsification and an experiment program.

## 9. Architecture boundaries worth preserving during study

Unless evidence overturns them:

- `World` owns canonical truth and legality;
- perception derives from bounded world evidence rather than arbitrary full-state access;
- LLM output is a proposal/decision, not self-certified success;
- execution returns actual outcomes as later experience;
- continuous controls, atomic actions, durative tasks, semantic events and cognition remain conceptually distinct;
- player/manual/cognition provenance is diagnostic and must not alter legality;
- visible behavior alone is insufficient evidence when provenance can distinguish its cause.

E1-specific names/constants (`npc.001`, 220 range, 3 cycles, 750 ms, `wait|fetch`) are **not** durable architecture.

## 10. Things intentionally open

Do not pretend takeover must resolve these immediately:

- exact Live Mind implementation form;
- attention/addressedness algorithm;
- belief representation;
- memory storage/consolidation/forgetting;
- planner vs utility/BT/FSM/hybrid;
- proactive cognition cadence;
- multiplayer turn-taking;
- offscreen simulation/time model;
- long-horizon planning;
- final speech/hearing range/modality;
- final model/API allocation.

These are study targets, not missing boilerplate.

## 11. Takeover self-check

Before proceeding, you should be able to explain:

1. why `main` is historical P0 but not the current frontier;
2. why P1 remains valid donor evidence even though PR #3 is closed;
3. why the failed old E1/readiness line must remain separate from selective recovery;
4. what `b31a851c...` is actually qualified to claim;
5. why the current recovery is not yet freshly Owner-qualified;
6. which historical R5b/R6/R7 areas are intentionally not re-earned;
7. which E1 details are apparatus rather than future architecture;
8. why the next task is vision/invariants work rather than feature implementation.

If live state contradicts this document, resolve the contradiction first. Live repository evidence wins.

## 12. Expected working behavior

Act as the Owner's browser-based second brain / technical co-worker.

Recover state independently, challenge stale recommendations, preserve exact evidence boundaries, and conduct long research/audit stages when they still add material value. Do not force the Owner to defensively restate context that the repository and current project state can provide.

The goal of this handoff is not to preserve today's wording forever. Once the Refoundation Study establishes better live truth, update the small canonical spine and let obsolete recovery detail recede.