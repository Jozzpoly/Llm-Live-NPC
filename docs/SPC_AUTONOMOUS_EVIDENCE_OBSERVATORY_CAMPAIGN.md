# SPC Autonomous Evidence Observatory — Research and Campaign Contract

Updated: 2026-09-15
Grounded live head before this document: `f306931ee36b6cce0740685cf31c0763e1035162`
Scope: `refoundation/spc-next-five-resident-world` / draft PR #125
Status: **research/campaign contract, not frozen architecture**

## 0. Why this campaign exists

The project has reached a point where ordinary code review, unit tests and manually inspecting a browser are no longer enough to defend the Owner target.

The core project risk is not merely that code can fail. It is that a technically green implementation can produce a convincing *representation* of a living SPC while the causal system underneath is incomplete, coupled, omniscient, narratively fabricated, visually unreadable or only understandable through debug text.

The evidence system must therefore become a scientific instrument for the living-world project.

Its job is not to prove that a page loaded or that a screenshot looks approximately unchanged. Its job is to make increasingly difficult claims about resident life hard to fake:

`World truth`
→ `participant-observable consequence`
→ `resident perception / private evidence`
→ `resident knowledge / matter pressure`
→ `semantic authority / provider attempt`
→ `exact task/run authority`
→ `local embodied control/action`
→ `authoritative World outcome`
→ `new private/public evidence`

The Observatory exists to test that chain from several independent observation planes and to preserve enough evidence that Browser ChatGPT can later reconstruct what happened rather than trusting a green badge.

This campaign is intentionally broader than the current Browser Evidence workflow. It does **not** mean infrastructure should become the product. Every observability capability must justify itself by helping falsify a real living-SPC question.

---

## 1. Larger project target and our current place inside it

The Owner target remains five genuinely living embodied SPCs in one shared authored World.

A credible resident needs, at minimum:

- one authoritative physical reality shared with other actors;
- private and incomplete epistemic state;
- durable matters / commitments that are not identical to current bodily activity;
- local embodied competence that continues without per-frame LLM control;
- higher-level semantic reconsideration when local knowledge or circumstances demand it;
- consequences that physically exist in World truth;
- continuity across interruptions, provider latency, errors, unrelated events and other residents;
- behavior that is understandable in participant view without a research panel manufacturing the impression of life.

Five residents are a causal pressure target, not a late scalability benchmark.

The browser research scene is a laboratory specimen inside that goal. It is not itself the product target.

### Current live qualification

At the grounded head, the broad state is:

> **CAUSAL / MULTI-RESIDENT FOUNDATION MATERIAL · RESIDENT CONTINUITY / RUN AUTHORITY PARTIALLY RE-EARNED · FIRST DETERMINISTIC MATERIAL LIFE SLICE DEFENDED · REAL-BROWSER EVIDENCE NOW EXISTS · LIVE END-TO-END SPC STILL NOT CONNECTED · NOT OWNER-LIVING-WORLD READY**

The current branch has re-earned meaningful architecture rather than merely scaffolding it:

- continuing matter and semantic revision authority;
- exact task/run provenance and World-mutation authority;
- factual run outcome reconciliation;
- bounded live semantic evidence reconstructability;
- pending cognition/provider authority membrane;
- identity-safe anonymous hearing through resident and Worker boundaries;
- explicit null/unregioned self-location;
- World-owned material identity / possession / action outcomes;
- exact-run material pickup/place authority;
- first bounded local embodied material executor;
- Janek material composition in the five-resident World;
- real browser rendering of the same World/material execution path;
- first automated real-Chromium evidence workflow.

This is materially beyond the earlier recovery audit state. Do not describe the continuity kernel as absent anymore.

### Still not defended

The current work does not prove:

- five materially independent resident lives;
- a rich local live brain;
- authoritative facing / attention / deliberate search;
- full interruption → temporary concern → resume/revise/abandon life loop;
- participant-bounded sensory presentation;
- complete causal ledger through cognition/provider/run/World outcome;
- live Luna/provider participation in the current browser living-world loop;
- provider latency/failure behavior under real embodied execution;
- world readability of resident purpose and consequence;
- persistence/offscreen/LOD continuity;
- Owner-observed living-world quality.

The Observatory must protect this distinction rather than collapsing all green evidence into one readiness label.

---

## 2. What Browser Evidence v1 actually achieved

The first Browser Evidence campaign was valuable precisely because it found a contradiction that ordinary tests did not expose.

The workflow now builds the real client, serves `dist/client`, launches system Chrome, enters the real `?spc=1` Phaser scene, operates existing UI controls, captures screenshots and runtime/browser evidence, uploads an Actions artifact, and publishes one rotating `evidence/spc-browser-latest` snapshot.

The analyzer derives a trajectory/timeline view from the run.

At `f306931e...`, the real browser evidence showed approximately:

- Janek sampled 51 times;
- 45 moving samples;
- maximum resolved speed 90;
- ~1033 World units of displacement;
- transition `workshop → crossroads`;
- player speech appearing in Mira's private hearing evidence;
- zero browser runtime exceptions;
- zero console/log errors;
- zero network failures;
- zero HTTP errors.

It also found that legacy `ResidentActivity` claimed `idle` during all 45 sampled moving frames.

That finding caused the research panel to be corrected so `legacy activity` is explicitly presented as a superseded projection rather than current recovered execution authority.

### Qualitative visual finding

Direct inspection of the captured screenshots showed a second class of problem:

- the material delivery is physically real and visible;
- the rendered World remains extremely sparse and abstract;
- a follow camera can hide a large physical journey because the resident remains centered while nearly featureless background moves beneath them;
- the destination and purpose of the delivery are not readable from the World alone;
- debug/research labels can therefore make a stronger impression of life than participant-visible World feedback justifies.

Local image analysis quantified this: two world-only checkpoints separated by more than 1000 World units of resident travel differed in less than roughly one percent of pixels under a simple difference threshold.

This motivates a future **World Readability Gap** heuristic: large causal/material change paired with weak participant-visible change is a research finding even when the mechanics are correct.

---

## 3. Browser Evidence v1 limitations — do not silently promote it

The first harness is a useful eye, not yet a deterministic laboratory.

### 3.1 Evidence mode is read-only, not manual-tick controlled

The current `?evidence=1` seam exposes only:

`window.__SPC_EVIDENCE__.snapshot() -> scene.currentFrame()`

The Phaser scene still advances through normal `update(delta)` plus a fixed-step accumulator.

The current browser script waits on wall-clock time / observed state and therefore does not own exact deterministic World advancement.

This corrects an earlier planning assumption that manual fixed-tick evidence control had already been implemented. It has not.

### 3.2 Cross-run image similarity does not equal causal determinism

Two independent browser runs produced very similar corresponding world-only images (high SSIM), while checkpoint ticks differed materially, e.g. a mid-delivery capture around `t164` in one run versus `t184` in another.

Therefore the Observatory must separate:

- **simulation determinism** — same scenario/seed/input produces the same authoritative causal state/event order/ticks;
- **render reproducibility** — corresponding visual output remains stable within declared tolerance;
- **performance variability** — timings/frame durations vary but remain within separate budgets.

A visual regression must never be allowed to certify causal determinism.

### 3.3 DOM scraping is currently carrying too much semantic weight

The current analyzer reads facts from the rendered research panel.

This is useful for testing whether presentation says something honest, but fragile as a canonical data source. A UI wording/layout change can break evidence collection; worse, a UI bug can become the source of truth used to judge the UI itself.

Future evidence must read a versioned canonical snapshot directly, then independently inspect the DOM/canvas as presentation outputs.

### 3.4 One hardcoded scenario is not a research matrix

The current scene hardcodes `createFiveResidentJanekMaterialSlice()`.

The first browser workflow mainly observes one happy-path delivery plus one player speech action. It cannot yet select and run missing-object, hold/resume, semantic supersession, provider delay, contention or five-resident pressure specimens through one common scenario contract.

### 3.5 Artifact is not yet a self-contained replay/lab bundle

The Actions artifact retains screenshots, JSON, analysis, CSV, trajectory and browser logs, but not the exact built client needed to re-run that source candidate locally.

Browser ChatGPT can download and deeply analyze the artifact, but cannot currently reconstruct that exact executable without another build/repo operation.

A future **lab bundle** should include the exact browser build plus scenario manifest/harness metadata so one Actions build can be downloaded and probed repeatedly in the Browser environment.

---

## 4. Capability research — what is actually available

This section distinguishes verified capabilities from attractive ideas.

### 4.1 GitHub / repository capabilities — VERIFIED

Browser ChatGPT can:

- inspect and update the live repository through the GitHub connection;
- verify branch/PR/head state;
- inspect Actions runs/jobs/logs;
- download workflow artifacts;
- inspect retained evidence branches;
- make bounded repo changes and let real CI qualify them.

Current evidence storage can use GitHub Actions artifacts with explicit retention plus a lightweight rotating latest-evidence branch.

### 4.2 Browser ChatGPT local analysis environment — VERIFIED

The current analysis environment exposes usable tooling including:

- Chromium;
- Node.js;
- Python;
- `ffmpeg` / `ffprobe`;
- ImageMagick;
- OpenCV;
- Pillow;
- NumPy;
- scikit-image;
- Graphviz;
- `jq`.

This means Browser ChatGPT can do substantially more after downloading an evidence bundle than merely read JSON:

- inspect screenshots visually;
- create contact sheets/storyboards;
- crop regions of interest;
- calculate pixel/SSIM-style differences;
- derive frame-difference timelines;
- inspect or extract video frames;
- generate trajectory or causal-graph visualizations;
- correlate structured state with images.

### 4.3 Raw Chromium DevTools instrumentation — VERIFIED ON A SYNTHETIC LOCAL PAGE

A local Chromium capability probe successfully exercised:

- `Performance.getMetrics`;
- `DOMSnapshot.captureSnapshot`;
- accessibility tree capture;
- precise JavaScript coverage;
- screenshot capture;
- screencast frame emission;
- CPU throttling control;
- tracing.

This was a Chromium capability probe, not an SPC runtime qualification.

It establishes that a deeper low-level diagnostic channel is feasible if/when a specific SPC experiment needs it.

### 4.4 Playwright — RESEARCHED, NOT YET INSTALLED/QUALIFIED IN THIS REPO

Playwright is an attractive higher-level layer because it can provide:

- robust selectors and browser actions;
- trace viewer with action timeline, DOM snapshots, screenshots/screencast filmstrip, console/network/error context and attachments;
- video capture;
- visual screenshot comparison;
- mobile/viewport/touch emulation;
- clock manipulation;
- BrowserContext-level isolation.

However:

- Playwright is not currently a repository dependency;
- local package installation/network availability cannot be assumed;
- adding it must be qualified through the actual locked project/CI environment;
- its fake clock changes `requestAnimationFrame`, timers, `performance` and event timestamps, so it must not become the hidden authority for World simulation determinism.

Likely direction: use Playwright as an ergonomic scenario/trace layer and raw CDP selectively for laboratory instrumentation, while explicit World tick control remains inside the application evidence seam.

### 4.5 External practice donor — large-engine automation

Modern game-engine automation practice separates several evidence classes: unit tests, functional/feature tests, stress tests and screenshot comparisons.

Screenshot systems explicitly manage camera state, rendering noise and tolerances because pixels are not perfectly stable across environments.

The relevant lesson is architectural, not technological: visual evidence should be a first-class but separate gate rather than being mistaken for simulation truth.

### 4.6 Distributed tracing as a conceptual donor

OpenTelemetry-style tracing provides a useful conceptual model:

- one experiment/causal flow can share a correlation identifier;
- units of work carry explicit IDs and attributes;
- events can attach to units of work;
- links can express causal relationships that do not form one simple parent/child tree;
- logs become much more useful when they carry the same correlation context.

We should borrow these concepts, not automatically import the OpenTelemetry SDK.

The SPC causal chain is domain-specific and should remain understandable in resident/World vocabulary.

---

## 5. Observatory design principle: independent observation planes

The strongest version of this system should not have one universal debug snapshot.

It should observe the same scenario through four explicit planes.

### A. Authoritative World plane

What physically exists and what the World resolved:

- actors / positions / velocities;
- material objects / possession / physical state;
- authoritative action attempts and outcomes;
- region/world geometry needed by the experiment;
- exact World tick / ordering.

This plane may know objective physical identity and hidden truth.

### B. Participant plane

What the Owner/player could legitimately obtain from the game presentation:

- participant camera output;
- participant-visible/hearable events;
- interaction affordances/feedback;
- no omniscient debug speech or resident-private meaning.

This plane is the basis for future `WORLD-READABLE PASS`.

### C. Selected-resident private plane

What one resident legitimately carries:

- percept/evidence records;
- recognized vs anonymous identities;
- known / remembered spatial information;
- live matters and semantic revision;
- current semantic evidence dependency;
- task/run binding and suspension state;
- pending cognition/provider attempts and their exact dependencies.

This is private research evidence, not public game state.

### D. Research/provenance plane

What the laboratory needs to reconstruct the system:

- correlation IDs;
- causal links;
- admission/rejection/revocation reasons;
- execution ownership;
- fixture/exogenous experiment events;
- browser/network/performance instrumentation.

This information must never silently become resident knowledge or participant presentation.

The Observatory should actively test that information does not leak across these planes.

---

## 6. Proposed Evidence Observatory architecture

This section is a research hypothesis to test, not a final data model.

### 6.1 Scenario Control Plane

Each browser specimen should have an explicit versioned scenario manifest with, at minimum:

- scenario ID/version;
- source SHA/build identity;
- seed(s) where randomness exists;
- viewport/device mode;
- initial authored specimen/setup;
- provider mode/model when relevant;
- declared fixture/exogenous interventions;
- causal checkpoints / run-until conditions;
- expected claim class, not merely expected final screenshot.

The application should expose a bounded test-only/evidence-only control seam capable of:

- pause;
- exact `stepWorld(nTicks)`;
- run until a declared observable condition with a hard tick guard;
- read canonical snapshot / evidence cursor;
- select research camera modes without mutating World truth.

The control seam must **not** become a God API for silently teleporting/product-mutating the runtime under test.

Exogenous pressure events may exist, but must be explicit experiment fixtures with their own provenance.

### 6.2 Canonical Evidence Snapshot

Replace presentation-DOM scraping as the main semantic data source with a versioned serializable evidence snapshot.

It should be designed around exact authority questions rather than final product DTOs.

Candidate fields should include only what an experiment needs, such as:

- World tick + monotonic evidence sequence;
- authoritative actor/material facts;
- selected resident private evidence/knowledge;
- live matter ID/status/revision/evidence dependency;
- task/run binding and authority state;
- pending provider-attempt IDs/dependencies;
- recent authoritative action attempts/outcomes;
- explicit participant projection state where needed.

The DOM/research UI remains independently captured and compared against this snapshot.

### 6.3 Causal Ledger

The Observatory should eventually output an append-only structured event ledger, probably JSONL initially.

Important events should carry stable correlation fields rather than forcing later analysis to infer causality from timestamps:

- experiment/scenario run ID;
- World tick + sequence;
- resident ID;
- matter ID + semantic revision;
- evidence IDs;
- cognition/provider attempt ID;
- task ID / run ID;
- action attempt ID / World outcome ID;
- parent/link IDs where one event depends on several predecessors.

A mature causal trace should be able to answer:

> Which exact semantic authority and resident evidence allowed this exact World mutation?

and the reverse:

> Which public/private evidence was created by this exact World outcome?

Any authoritative resident World mutation with no reconstructable owner/lineage should be a hard evidence failure.

### 6.4 Causal Checkpoints instead of elapsed-time screenshots

Capture should occur on named causal conditions whenever possible:

- object acquired;
- checked absence acquired;
- matter revision advanced;
- exact execution hold began;
- provider attempt dispatched/settled;
- run lost authority;
- destination outcome resolved;
- participant observed consequence;
- five-resident contention started/resolved.

At each checkpoint, capture a coordinated evidence packet:

`authoritative state + private state + participant screenshot + spectator/research screenshot + event window + browser health`

Wall-clock timestamps remain diagnostics, not scenario authority.

### 6.5 Browser trace/video layer

Likely future split:

**Playwright** for routine scenario orchestration, trace/video, DOM/UI actions and device emulation.

**CDP** for selected deep probes: performance tracing, coverage, accessibility/DOM snapshots, CPU throttling, raw input or browser internals.

Do not enable every expensive instrument on every gate. Rich trace/video can be retained on failure or on selected research runs.

### 6.6 Lab bundle

An Actions run should be able to emit a self-contained reproducibility bundle containing:

- exact `dist/client` build;
- scenario manifest;
- evidence/harness version;
- canonical ledger/snapshots;
- screenshots/video/trace as configured;
- browser/environment manifest;
- analyzer output.

Then Browser ChatGPT can download one build and run additional local analysis/visual experiments without changing source or spending another Actions build for every question.

---

## 7. Analysis engine — what should be automated

No single oracle is sufficient. The analyzer should deliberately combine several independent classes.

### 7.1 Hard causal oracles

Examples:

- no World mutation without valid authority;
- stale/held/terminal run cannot mutate World;
- action outcome matches authoritative object state;
- checked absence does not imply global nonexistence;
- hidden relocation does not update resident last-known position;
- unknown heard speaker does not acquire identity;
- one resident's private state does not silently enter another's;
- terminal semantic state is monotonic;
- factual terminal run outcome is reconciled exactly once.

These should remain deterministic executable assertions.

### 7.2 Temporal/sequence oracles

Examples:

- perception evidence precedes dependent semantic revision;
- hold precedes the first tick on which stale execution would otherwise mutate World;
- terminal outcome is reconciled before incompatible execution reuse;
- provider result cannot be admitted after dependency supersession;
- resume continues exact legitimate progress rather than reconstructing fake completion.

These are better answered by the causal ledger than by final-state assertions.

### 7.3 Metamorphic tests

Instead of hardcoding one expected story, alter one relevant variable and require invariants:

- unrelated speech should not stale a different matter;
- same-matter new evidence should affect only that scoped authority;
- hidden object movement changes World truth but not private knowledge until acquired;
- changing viewport/camera must not change World simulation;
- CPU throttling must change latency/performance, not authoritative deterministic outcome when provider/runtime semantics are unchanged.

### 7.4 Cross-run reproducibility

Run the same scenario multiple times and compare separately:

- authoritative final state hash;
- causal event order/ticks;
- scenario checkpoints;
- screenshot similarity in the same environment;
- performance distributions.

Do not merge these into one `deterministic=true` flag.

### 7.5 Visual/readability analysis

Useful automatic research signals include:

- pixel/YIQ/SSIM-style differences;
- perceptual hashes;
- frame-difference timeline;
- contact sheets/storyboards;
- region-of-interest crops around actors/objects/events;
- trajectory overlays;
- camera-space movement visibility;
- optical flow later if it answers a real question;
- screenshot-to-canonical-state consistency checks.

Visual heuristics should usually produce `FINDING` rather than hard semantic FAIL unless the claim is explicitly visual.

### 7.6 Qualitative AI visual review

Browser ChatGPT can directly inspect screenshots/contact sheets and later selected video frames.

This is valuable for questions that are difficult to reduce to pixels:

- does behavior read as caused or arbitrary?
- can a human infer the material consequence?
- does the World communicate interruption/return?
- does debug presentation contradict the rendered reality?
- does camera composition hide the behavior under test?

AI review must remain an explicit qualitative research signal, not a hidden authority that overrides mechanical truth.

---

## 8. Candidate derived research metrics

These are hypotheses for useful diagnostics, not frozen KPIs.

### World Readability Gap

Compare magnitude of real causal/material change against participant-visible change/cues.

Current motivating case: >1000 World units of Janek displacement with very small full-frame pixel change under follow camera.

Large gap = mechanics may be real but not readable.

### Projection Truth Consistency

Compare canonical body/run/material state with participant/research labels.

Current motivating case: body moving while legacy activity displayed `idle`.

### Causal Coverage

Measure how many authoritative World mutations can be traced back to an exact participant/resident/exogenous authority and forward to their factual outcomes/evidence.

Unowned mutation should be a hard failure; incomplete research lineage may begin as a coverage gap.

### Epistemic Leak Audit

Check resident-private evidence against permitted acquisition paths and forbidden hidden fields.

Examples: unknown identity, hidden object relocation, other resident private matter, omniscient exact position from hearing.

### Semantic Stability Under Noise

Inject unrelated events and confirm scoped matter/run authority remains stable; inject relevant evidence and confirm only dependent semantics are reconsidered.

### Autonomy During Provider Silence

Delay/timeout provider cognition while measuring:

- legitimate local continuation;
- exact hold of semantically superseded execution;
- unrelated resident routines continuing;
- recovery/retry/abandon behavior.

### Five-Life Independence Matrix

For five residents, record which World event affects which resident's evidence, matter, cognition and run state.

Unexpected cross-resident changes become coupling/leak findings.

---

## 9. Scenario matrix — the Observatory should grow through specimens

The system should not become one enormous E2E test.

Candidate specimen sequence:

1. **Baseline material delivery** — same real Janek crate path already browser-qualified; use it to qualify deterministic control and new evidence packets.
2. **Missing crate / private knowledge divergence** — hidden World relocation; Janek goes to last-known position; checked absence creates semantic pressure; hidden true location remains private from Janek.
3. **Exact hold / resume** — pause the active material run, prove zero stale mutation while held, then resume exact legitimate progress.
4. **Player material interference** — player takes/moves the shared object through participant-authoritative action while Janek is executing.
5. **Player speech interruption** — participant communication competes with current matter without erasing it.
6. **Unknown speaker** — hearing preserves useful directional/content evidence without identity omniscience.
7. **Relevant semantic supersession during provider latency** — exact old run loses mutation authority before a late result can preserve stale course.
8. **Unrelated-event non-staleness** — noise must not globally invalidate resident life.
9. **Provider malformed/timeout/abandon/retry** — exact lifecycle under real browser loop.
10. **Two-resident shared-resource contention** — World object authority plus independent private histories.
11. **Five-resident pressure** — concurrent matters/events/cognition/local continuation.
12. **Participant-view readability** — same scenarios with research lens removed and participant sensory projection bounded.
13. **Mobile/touch/device pressure** — only when relevant to the product surface, without conflating UI emulation with resident semantics.

A scenario is promoted only for the exact claim it exercises.

---

## 10. Campaign plan — build the Observatory by falsification

### E0 — consolidate current evidence truth

**Goal:** make the present Browser Evidence v1 reproducible and honestly documented before adding features.

Work:

- record the current nondeterministic browser timing limitation;
- preserve latest known PASS source SHA and v1 artifact shape;
- define evidence claim language for browser runs;
- add a self-contained build/lab bundle to artifacts if practical;
- do not alter living-world semantics merely to simplify the harness.

Exit condition: a future takeover can identify exactly what v1 proves and does not prove.

### E1 — explicit deterministic scenario control

**Goal:** the harness owns World ticks, not wall-clock luck.

Experiment:

- introduce evidence-only pause/manual-step/run-until control around the existing authoritative `SpcWorldRuntime`;
- ensure camera/render updates can occur without advancing World truth;
- prove the same scenario repeated several times produces the same causal tick sequence/state hash;
- prove evidence control does not leak into normal runtime behavior.

This is the first major architecture gate of the Observatory.

### E2 — canonical snapshot + causal ledger

**Goal:** stop using research DOM as semantic truth.

Build the smallest versioned evidence contract required by baseline delivery + missing-crate.

Do not prematurely serialize the whole final game state.

Exit condition: browser analyzer can reconstruct exact World/matter/run/material/evidence lineage without scraping text labels.

### E3 — hybrid browser instrumentation

**Goal:** determine whether Playwright meaningfully improves scenario authoring/trace review without replacing domain evidence.

Bounded experiment:

- pin Playwright version in dev dependencies;
- qualify install/build on GitHub Actions;
- run one existing deterministic scenario;
- produce trace/video only where useful;
- compare maintenance/diagnostic value against raw CDP harness.

Retain raw CDP for capabilities Playwright does not expose cleanly or for targeted performance probes.

### E4 — visual analysis and readability lab

**Goal:** turn screenshots/video into structured research evidence.

Add contact sheets, causal checkpoint crops, trajectory overlays and cross-run image comparisons.

Develop `World Readability Gap` and `Projection Truth Consistency` as findings, not magic scores.

### E5 — adversarial scenario matrix

**Goal:** stop overfitting to Janek happy-path delivery.

Start with missing-crate because it already has a strong deterministic causal specimen and directly pressures `World truth != resident knowledge`.

Then add hold/resume and player interference before live provider complexity.

### E6 — provider + fault/latency laboratory

**Goal:** test the actual architecture under the condition that makes SPC different from ordinary game AI.

Inject controlled delay/timeout/malformed/stale results, then qualify real provider participation.

Measure both semantic correctness and what the local brain/world continue doing while cognition is unavailable.

### E7 — five-life pressure and longitudinal runs

**Goal:** discover cross-resident coupling, cognition backlog, starvation, hidden omniscience and local-brain collapse that one-resident specimens cannot expose.

Only after smaller causal specimens are trustworthy should the Observatory run longer multi-resident campaigns and summarize them automatically.

---

## 11. Artifact contract hypothesis

A future evidence bundle may look roughly like:

```text
manifest.json
build/
scenario.json
ledger.jsonl
checkpoints/
  <causal-checkpoint>/
    world.json
    participant.png
    spectator.png
    research.png
    resident-private.json
    event-window.json
trace.zip / video.webm (selected runs)
browser/
  console.jsonl
  network.jsonl
  performance.json
  coverage.json (selected runs)
analysis/
  summary.json
  findings.md
  timeline.csv
  trajectories.svg
  causal-graph.svg
  contact-sheet.jpg
```

This is a shape to test, not a requirement to fill every file on every run.

Successful runs should remain cheap enough for frequent use. Rich evidence belongs on failures, promotion gates and research campaigns.

---

## 12. Evidence/promotion language for the new system

Keep existing recovery labels and add narrow browser-observatory qualifiers where useful.

Suggested distinctions:

- **CAUSAL SIMULATION PASS** — exact controlled World/matter/run invariant;
- **REPRODUCIBLE BROWSER PASS** — same controlled scenario reproduced in real browser/build with matching canonical state;
- **RENDER / PRESENTATION PASS** — explicitly visual claim within fixed environment/tolerance;
- **FAULT-PRESSURE PASS** — named latency/failure/interference matrix survived;
- **LIVE PROVIDER PASS** — real provider participated under measured runtime conditions;
- **WORLD-READABLE PASS** — participant view communicates the tested behavior without private/research telemetry;
- **FIVE-RESIDENT PRESSURE PASS** — same architecture survives concurrent independent resident life pressure;
- **OWNER-OBSERVED** — Owner personally exercised/observed the relevant behavior.

Never let `Browser Evidence PASS` alone imply any of the last four.

---

## 13. Anti-goals and failure modes

The Observatory itself can become dangerous if it starts optimizing the project for testability rather than truth.

Avoid:

- a privileged test API that performs product actions residents could not perform;
- snapshots that become a second mutable game state;
- using fake browser time as World authority;
- measuring only what is easy to serialize;
- screenshot-golden-file cargo cult on dynamic scenes;
- forcing deterministic provider text when the claim being tested is robustness to semantic variation;
- giant universal scenario DSL before a handful of real specimens justify it;
- saving every possible browser trace on every commit;
- making research instrumentation visible to residents or player projections;
- allowing evidence labels or dashboards to substitute for Owner observation;
- growing infrastructure horizontally while resident life remains unchanged.

The Observatory is successful only if it repeatedly discovers uncomfortable truths about the product.

---

## 14. Immediate next campaign entry

Do **not** jump directly to missing-crate browser implementation from the old v1 harness.

The next serious tranche should begin by qualifying the laboratory itself:

1. design and implement the smallest explicit deterministic evidence control seam around the existing Janek baseline slice;
2. run the exact baseline several times under manual World-tick authority;
3. capture canonical state separate from presentation;
4. compare causal hashes/ticks and rendered checkpoints independently;
5. package the exact built client as a downloadable lab bundle;
6. only after that, port the existing missing-crate specimen as the first adversarial browser scenario.

This order prevents the campaign from building a large scenario suite on a nondeterministic timing foundation.

Once missing-crate is browser-qualified, the Observatory will have its first genuinely important multi-plane proof:

`World truth says crate moved`
while
`Janek privately still knows old position`
→ `local body acts on resident knowledge, not omniscient truth`
→ `old position is deliberately checked`
→ `checked absence becomes durable semantic evidence`
→ `matter remains alive but requires reconsideration`.

That is much closer to the actual SPC research problem than another page-load or screenshot test.

---

## 15. Final campaign principle

The project does not need more confidence. It needs **better instruments for destroying false confidence**.

The Observatory should make it progressively harder for us to claim that a resident is living unless all relevant layers agree:

- the World really changed;
- the exact authority that changed it can be reconstructed;
- the resident knew only what it could legitimately know;
- its continuing matters survived the right interruptions;
- local embodiment and semantic cognition cooperated under latency/failure;
- other residents remained independent;
- the participant could actually perceive enough consequence for the behavior to read as life.

If a new subsystem passes unit tests but fails that combined evidence, the Observatory has done its job.
