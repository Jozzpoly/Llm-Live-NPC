# LLM Live NPC — Project State

Updated: 2026-09-08

## 1. Current phase

**Live NPC Refoundation Pass 1 — presence / invariants / anti-goals — is closed as a problem-definition pass.**

Next stage:

**Pass 2 — architecture / donor / research campaign.**

Pass 2 should not start by implementing chat, memory, a planner, a `Live Mind Runtime` or another E1 feature. It should compare competing architecture hypotheses against the Presence Contract and select the smallest architecture capable of supporting a genuinely informative first Presence Life Test.

Current research/refoundation branch:

`recovery/owner-fail-2026-09-07`

Recovered runtime checkpoint preserved as bounded donor evidence:

`b31a851c3f708077fbf9e6fb8206fa392f8def13`

Canonical Pass 1 contract:

`docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`

---

## 2. Evidence boundary

### Recovered runtime

The recovered runtime at `b31a851c...` is **automated/R8-qualified donor evidence**.

Qualification:

- 145/145 tests across 26 files;
- cognition→executor causal join PASS;
- R5a arm/session stale-response protection PASS;
- Owner pursuit regressions PASS;
- R4c/R4d recovery guards PASS;
- strict TypeScript PASS;
- Worker/client build PASS;
- preview deploy dry-run PASS;
- Cloudflare PASS;
- Worker Version ID `0e1a7e36-edba-4660-8fa2-f2b38172d760`.

### Independent combined R8

Evidence-only PR #75, closed without merge:

- evidence head `72ea11abd7a0b56230ced6019e7c550b5109b476`;
- exactly one test file added, no runtime product changes;
- 149/149 tests across 27 files;
- combined R8 4/4 PASS;
- strict TypeScript/build/preview PASS;
- Cloudflare PASS;
- Version ID `ff9be74c-754a-46b0-851f-36ffb8a9233b`.

Bounded conclusion:

> No new general causal-correctness defect was exposed in the tested recovered World→execution→cognition ownership/outcome substrate. The old substrate is trustworthy enough to preserve as bounded donor evidence instead of continuing historical repair by inertia.

This is **not** a production-readiness claim.

### Owner-quality boundary

The broad old readiness line failed its final 2026-09-07 Owner/browser gate. That negative evidence remains valid.

The recovered checkpoint has **not** yet received a new final qualitative Owner/browser re-gate after selective recovery. Do not describe it as freshly Owner-qualified.

A new Owner gate becomes necessary when a later claim depends on current browser feel/usability, not merely to conduct architecture research.

---

## 3. Repository topology

### `main` — historical P0 donor

`main` remains at:

`f207419ee87c03979544d2d579e624f043300bbc`

It is the historical qualified P0 cloud/model-transport baseline, not the current research frontier.

### P1 — historical embodied donor

Former integration line:

`p1/playable-world-slice`

Final P1 head:

`e453f5862286328df92db91ba2f9adabc1e7899e`

PR #3 is closed without merge as historical donor/integration evidence. Recovery is a full descendant of that line, so no unique P1 runtime was lost by closing the stale PR.

### Old E1/readiness line — non-canonical

`experiment/e1-grounded-notice-fetch` continued beyond the last good pre-readiness runtime. Automated evidence became strong, but the final Owner/browser gate found the playable laboratory materially worse than the previous good surface.

Recovery therefore did **not** repair forward from that line.

Selective recovery restarted from:

`15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

Useful changes were independently re-earned when justified.

### Current refoundation line

`recovery/owner-fail-2026-09-07`

The exact runtime evidence checkpoint is `b31a851c...`; later commits on the branch may be docs/research-only and must not silently expand the runtime qualification claim.

---

## 4. Durable donor boundaries

These are worth preserving unless later evidence disproves them.

### World authority

`World` owns canonical entities, movement/action legality and factual outcomes.

The model does not directly set positions, inventory, canonical events, perceptions or success.

### Presentation/input separation

Phaser and human input adapters may resolve intended input, but they do not bypass World legality.

### Layer separation

Keep conceptually distinct:

1. continuous controls/movement;
2. atomic World actions;
3. durative execution/tasks;
4. semantic World occurrences/events;
5. actor experience/outcomes;
6. higher semantic cognition/intention.

### Real outcome feedback

A chosen intention does not equal success. Execution returns through World truth, and later cognition may receive what actually happened.

### Causal provenance

Research/debug should make it possible to trace:

`cause/evidence → semantic intention → task/run → World attempt → actual outcome`

Provenance is diagnostic and must not change gameplay legality.

---

## 5. Pass 1 closure — what the project is trying to prove

Pass 1 moved the project away from “LLM chooses a grounded action” toward a stronger north star:

> Create one persistent resident of a shared simulated world whose experience is grounded, whose meaningful unresolved consequences persist, whose semantic cognition can interpret novel language and revise intentions without fabricating reality, and whose physical/communication outcomes remain determined by the world.

Shorthand:

> **meaning may be generative; reality must remain grounded.**

### Product-level MUSTs

Current strongest invariants:

- one NPC remains one resident in one shared present;
- experience is situated rather than omniscient;
- material information retains epistemic source/provenance;
- utterance ≠ automatic canonical truth;
- continuity and unresolved consequence persist beyond single model calls;
- uncertainty is legitimate;
- novel language can materially change semantic intention;
- intention, attempt and success remain distinct;
- World/execution owns real outcomes;
- meaningful elapsed time cannot disappear from continuity;
- communication belongs to one world-grounded reality rather than private per-player chatbot universes.

The full contract, anti-goals and Life Test are canonical in:

`docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`

---

## 6. What Pass 1 deliberately did NOT freeze

These remain **strong architecture hypotheses or open questions**, not project truth:

- an explicit `Active Life State` representation;
- a continuously running `Live Mind Runtime`;
- cognitive-pressure/event-trigger scheduling;
- expectation/discrepancy triggers;
- semantic-delta transitions versus whole-state generation;
- a task/skill/competence layer;
- short-horizon versus long-horizon planner structure;
- exact attention/addressedness mechanics;
- exact belief/evidence representation;
- long-term memory/consolidation/forgetting;
- speech/hearing range and channels;
- persistence/offscreen simulation/time model;
- multiplayer cognitive concurrency;
- multi-NPC society;
- model routing/cost strategy;
- final model/provider;
- final conversation UI.

Historical R5b timeout/retry, later R6 sensory-buffer work and R7 ingress/provider-observability hardening remain donors, not an automatic repair queue.

---

## 7. Presence Qualification v0

Future implementation should be judged against a parameterized 5–10 minute single-NPC Life Test, not one scripted phrase path.

Required stressors include variants of:

- request → grounded action;
- mid-task semantic revision;
- ambiguous reference requiring honest clarification or context;
- unverified player information;
- later World contradiction/expectation violation;
- real execution failure/race;
- interruption by another meaningful matter;
- later return/resumption after activity or elapsed time.

Hard failure examples:

- false success;
- omniscience;
- meaningful continuity reset;
- transcript claim becoming World truth;
- private contradictory NPC copies for different players;
- meaningful language unable to change intention;
- coherent state existing only during an LLM request;
- forced certainty when evidence is insufficient.

A later multiplayer extension should place at least two players around one NPC with conflicting/overlapping requests and verify that one coherent present survives.

---

## 8. Immediate frontier — Pass 2

**Live NPC Refoundation Pass 2: architecture / donor / research campaign.**

Pass 2 should:

1. derive architecture responsibilities from the Presence Contract without immediately naming classes;
2. audit current project donors and external architecture families against those responsibilities;
3. construct multiple competing architecture hypotheses;
4. attack each with the Life Test, anti-goals and World/semantic authority boundaries;
5. compare complexity, cost, responsiveness, inspectability, persistence and multiplayer implications;
6. select the smallest architecture capable of supporting a genuinely informative first Presence experiment;
7. only then define a bounded implementation slice.

The central question is:

> **Which architecture can preserve one grounded resident through the Presence Contract while using expensive semantic cognition only where it creates real value?**

Do not let an attractive framework or donor implementation silently redefine the product problem.

---

## 9. Working method

Use:

`live truth → narrow claim → adversarial characterization/research → competing hypotheses → falsification → bounded experiment → Owner judgement when qualitative evidence matters`

Preserve:

- negative evidence;
- exact provenance;
- explicit non-claims;
- separation between demonstrated behavior and architectural hypothesis.

Do not implement a former checklist item merely because it once appeared in readiness work.

---

## 10. Canonical handoff spine

A fresh conversation should read:

1. `README.md`;
2. `docs/PROJECT_STATE.md`;
3. `docs/LIVE_NPC_PASS1_PRESENCE_CONTRACT.md`;
4. `docs/FRESH_TAKEOVER.md`.

Then inspect closed PRs/historical docs only when exact evidence is needed, especially:

- #47 — Owner FAIL that triggered selective recovery;
- #70–#74 — final bounded recovery repairs;
- #75 — combined R8 evidence-only re-attack;
- #3 — historical P1 donor/integration line;
- `docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md` — historical E1 experiment context.

If live repository state contradicts this spine, **live evidence wins** and the contradiction must be resolved before implementation.
