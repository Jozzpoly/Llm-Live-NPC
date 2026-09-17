# SPC Autonomous Evidence Observatory — Capability Research Annex

Date: **2026-09-15**  
Status: **RESEARCH ANNEX / EMPIRICAL CAPABILITY MAP / NON-BINDING**

This is an annex to `SPC_AUTONOMOUS_EVIDENCE_OBSERVATORY_CAMPAIGN.md`.

It records concrete capability probes, negative results, and research hypotheses discovered while testing what Browser ChatGPT, GitHub Actions, Chromium/CDP, local image/video tooling and relational testing techniques can actually do.

It is **not** a second roadmap and is not architecture authority. Any idea below must still earn its place through a bounded SPC experiment.

---

## 1. Grounded execution split

### GitHub Actions = current real game/browser execution plane

The existing workflow can build the actual Vite/Phaser client, serve `dist/client`, launch system Chrome and exercise the real `?spc=1` scene.

### Browser ChatGPT local environment = strong post-run analysis plane

Verified tools include:

- Chromium;
- Playwright Python package;
- Node/Python;
- ffmpeg/ffprobe;
- ImageMagick;
- OpenCV/Pillow/NumPy/scikit-image;
- Graphviz;
- pandas/scipy/sklearn and general analysis tooling.

However, local Chromium navigation to both `http://127.0.0.1/...` and `file://...` is blocked by environment policy (`ERR_BLOCKED_BY_ADMINISTRATOR`).

Therefore local analysis must not be falsely described as equivalent to Actions browser execution.

### Possible bounded workaround to research later: injected self-contained lab bundle

`page.setContent()` works and Playwright can inject a local JS file via `addScriptTag(path=...)` without browser navigation. A synthetic probe executed local JS successfully.

This suggests an optional analysis-friendly single-page bundle might later be locally executable by injection if Phaser/assets can be made genuinely self-contained without distorting the product build.

Do not redesign the normal application around this unless a bounded experiment proves large research value.

---

## 2. Playwright / CDP capability probes

### Playwright is available locally but not a repository dependency

A synthetic `setContent` page successfully supported Playwright tracing and CDP instrumentation using system Chromium.

Native Playwright video recording did **not** work out of the box because the installed Playwright package expected its own bundled ffmpeg in the Playwright cache even though system ffmpeg exists.

This is a practical reason not to assume a feature is available merely because Playwright is importable.

### CDP screencast + system ffmpeg works

A synthetic run successfully produced CDP screencast frames and assembled them into MP4 with system ffmpeg.

Observed example:

- ~48 emitted screencast frames during a short toy run;
- Playwright trace ZIP also produced successfully;
- DOM snapshot, accessibility tree, Performance metrics and precise JS coverage were captured in the same experiment.

Potential conclusion: video evidence can be built without requiring Playwright's bundled browser/ffmpeg stack.

### Verified low-level channels

Synthetic probes successfully exercised:

- `Performance.getMetrics`;
- `DOMSnapshot.captureSnapshot`;
- accessibility tree capture;
- precise JavaScript coverage;
- screenshots;
- CDP screencast;
- CPU throttling control;
- Chrome tracing;
- `Runtime.getHeapUsage`;
- CDP Fetch request interception/fulfil/failure.

These prove tool capability, **not** SPC runtime qualification.

---

## 3. Negative capability results matter

### Headless lifecycle emulation is not automatically a hidden-tab simulation

A synthetic test using `Page.setWebLifecycleState("frozen")` did not stop the tested requestAnimationFrame loop in the expected way.

Bringing another headless page to front also did not make the first page behave like a real background tab.

Do not use these mechanisms as hidden-tab evidence without a dedicated qualification.

### CPU throttling alone is not a useful stress test for a light workload

A 4x throttling probe did not materially reduce requestAnimationFrame frequency on a light page.

Future performance experiments must measure actual workload/jank and use meaningful pressure rather than treating a throttle flag as evidence of stress.

### Observer-effect suspicion was not reproduced in the synthetic probe

A controlled ~2 second animation test produced roughly:

- 121 frames without instrumentation;
- 120 with light sampling;
- 120 with heavy tracing + repeated screenshots.

Therefore current evidence does **not** justify claiming that the browser observer demonstrably perturbs the simulation.

Observability non-interference remains an important future metamorphic invariant, but it is still a hypothesis to qualify on SPC after manual tick control exists.

---

## 4. Current Browser Evidence v1 has a timing limitation

The current game scene still advances through ordinary Phaser `update(delta)` plus an accumulator.

`?evidence=1` exposes a read-only `snapshot()` seam; it does not pause or manually advance World ticks.

Independent browser runs can produce highly similar corresponding screenshots while causal checkpoint ticks differ materially.

This proves three evidence dimensions must stay separate:

1. simulation/causal determinism;
2. render reproducibility;
3. performance/timing variability.

E1 manual World stepping remains the next Observatory stop-line.

### Two-clock requirement

Evidence mode should separate:

- **Simulation clock** — only explicit World steps advance residents/causal state;
- **Presentation clock** — browser/Phaser rendering can continue so the result can be displayed and captured.

Do not fake the whole browser clock to obtain simulation determinism.

---

## 5. Chrome trace as a causal-render instrument

A synthetic heavy Chrome trace collected more than 12k events in roughly 1.2 seconds and included animation/compositor activity.

Custom `performance.mark()` and `performance.measure()` labels were visible in the same trace, including scoped names such as:

- `spc:world:start:<run>`;
- `spc:world:end:<run>`;
- `spc:outcome:pickup:<run>`.

This creates a promising research tool: **Causal-Render Trace**.

Domain events may later be placed on the same observation timeline as browser frame/render/compositor events without giving the browser causal authority over World state.

### Causal Frame Index probe

CDP screencast frames carry wall-clock timestamps while browser user-timing events can be mapped through `performance.timeOrigin`.

In a synthetic alignment probe, a causal marker mapped to its nearest captured frame within roughly two milliseconds.

Potential use:

- an authoritative pickup occurs;
- the Observatory selects the nearest actual rendered frames before/after it;
- visual review does not depend on arbitrary `sleep(1000)` checkpoints.

Potential derived signals:

- causal-to-pixel latency;
- causal-to-pixel magnitude;
- automatically selected causal storyboard frames.

---

## 6. Adaptive trace tiers

Full Chrome traces are too expensive to keep continuously during long life simulations.

A 2-second synthetic comparison produced approximately:

- light user-timing trace: **~35 KB**;
- medium browser timeline trace: **~406 KB**;
- heavy compositor/V8 trace: **~3.85 MB**.

This supports an adaptive strategy:

> **Find → Shrink → Replay → Deep Trace → Visual Review**

1. cheap deterministic/causal monitoring finds a violation or suspicious pattern;
2. scenario is minimized;
3. minimized counterexample is replayed in real browser;
4. heavy trace is enabled only around the interesting window;
5. Browser ChatGPT receives a small causal storyboard + trace + state evidence.

Do not continuously record heavy Perfetto/V8 traces for ordinary long runs.

---

## 7. External network fault injection — verified

CDP `Fetch` interception can manipulate browser requests externally to product code.

Verified synthetic probes:

### Controlled late valid response

A POST request was intercepted, request body observed, response deliberately delayed ~250 ms, then fulfilled with controlled JSON. The page received it at roughly the expected delayed time.

### Connection-level failure

`Fetch.failRequest(... ConnectionReset)` caused the page's fetch to fail as a normal network error (`TypeError: Failed to fetch`).

This creates two useful future provider labs:

### Host fault lab

Intercept `/api/spc-next/semantic` from the real browser and inject:

- latency;
- HTTP errors;
- connection reset;
- malformed response;
- intentionally late/stale valid response.

No production `if (testMode)` branch is required.

### Full Worker/provider lab

Separately run the real Worker/model endpoint for actual provider evidence.

The two gates must not be conflated.

---

## 8. Important live-provider causal-order finding

`ResidentSemanticLiveHost.reviewMatter()` currently performs transport and then directly calls resident semantic settlement after the awaited response is parsed.

This means provider arrival can mutate semantic resident state between World ticks according to JS/network wall-time ordering.

K5 can still prevent stale physical World effects, but causal ordering of semantic revision is not yet deterministic under manual scenario control.

Required future distinction:

> **provider arrival != semantic admission**

Candidate model:

1. semantic review/proposal is created during an explicit resident cognition phase;
2. transport runs asynchronously;
3. response arrival is recorded as an external event with monotonic/wall timing;
4. validated result enters a resident-owned pending-arrival inbox;
5. only a later explicit simulation/cognition phase performs stale-check + settlement/abandon at a named World tick.

This would support deterministic replay, manual pause and `same response / different latency` experiments.

No final implementation is frozen in this annex.

---

## 9. Scenario Tape / Nondeterminism Capsule

A future live run can preserve external nondeterministic inputs as a replayable tape:

- participant inputs;
- explicit fixture interventions;
- RNG seeds where used;
- provider response content after sanitization;
- provider arrival/settlement ordering;
- relevant transport outcomes.

Then a **Shadow Replay** can re-run the same external tape without a live provider and compare state/causal-lineage hashes.

This separates:

1. model output variability;
2. transport/scheduling variability;
3. local runtime nondeterminism.

It also enables controlled experiments:

- same semantic response, different latency;
- different valid semantic response, same timing.

Raw model hidden reasoning is neither required nor desired.

---

## 10. Relational / metamorphic testing as a primary oracle

Living agents often do not have one exact correct sentence/action. Many of the strongest SPC properties are relations between executions rather than exact final outputs.

This maps naturally to metamorphic/property-based testing and information-flow non-interference research.

### Epistemic Non-Interference

Two executions differ in hidden World truth but are observationally equivalent for one resident.

Until a legal acquisition event differs, resident-private state/decisions should remain equivalent, assuming equal resident state and equal nondeterministic low inputs/seeds.

Example:

- A: hidden crate is at B1;
- B: hidden crate is at B2;
- Janek has seen neither change;
- Janek should not behave differently merely because objective hidden truth differs.

This generalizes current anti-telepathy tests.

### Legal acquisition as the information-flow boundary

A previously hidden difference may become allowed to influence resident state only through an explicit acquisition path, such as:

- sight/recognition;
- hearing;
- testimony;
- checked absence;
- later explicit social/memory rules.

Future twin-run leak analysis can ask:

> What is the first tick at which resident-private state diverged, and was there a different legal acquisition event before that divergence?

If not, flag an epistemic leak.

### History sensitivity

The converse also matters.

The same current authoritative World can coexist with different resident-private histories.

Current World equality must not erase genuine differences in acquired evidence/history.

A deliberately chosen scenario can require that relevant private history later causes a different grounded decision.

This defends the claim that resident history is causal rather than decorative.

---

## 11. Twin-World / Counterfactual Harness

Run two worlds with the same build/seed/input tape while varying one declared dimension.

Useful twins include:

- camera/overlay A vs B;
- hidden crate relocation A vs B;
- player call vs no call;
- one resident vs unrelated distant resident;
- provider latency 100 ms vs 5 s;
- observability off vs light vs heavy;
- later high-fidelity vs coarse/LOD representation.

Compare each evidence plane separately.

Differences are legal only where a causal path exists.

This turns many architecture principles into executable relational claims.

---

## 12. State fingerprints are insufficient without lineage fingerprints

Two executions may converge to the same current state despite different histories.

Therefore candidate future evidence should maintain at least:

### State fingerprint

Canonical hash of the current selected plane/state.

### Causal lineage hash

Incremental hash-chain of canonical causal events/provenance leading to that state.

Use separate fingerprints for planes where useful:

- authoritative World;
- each resident-private state;
- matter/run authority;
- participant projection.

A twin-run first-divergence search should detect both state divergence and lineage divergence.

---

## 13. First-Divergence Bisect

Long-run failures should not force humans/AI to inspect full logs.

Candidate workflow:

1. record cheap per-tick/per-event fingerprints;
2. compare twin/replay runs;
3. identify first tick/plane whose state or lineage fingerprint diverges illegally;
4. replay a small window around that point;
5. collect canonical snapshots, PNGs, causal graph and optional heavy trace only there.

This is especially useful for epistemic leaks and long-running five-resident coupling bugs.

---

## 14. Causal Necessity / Ablation Probes

A state field can look architecturally impressive while behavior actually ignores it.

Therefore some experiments should deliberately perturb one claimed cause and verify allowed downstream influence.

Examples:

- change Janek last-known position while keeping hidden World fixed → local approach should change accordingly;
- change hidden object position while Janek knowledge remains identical → local behavior should not change before perception;
- revoke exact run authority → World effect must disappear;
- later change semantic course → grounded task should change where the scenario makes that course causally relevant;
- enable/disable research observer → World/private result must remain unchanged.

This detects:

- **dead semantics** — state exists but does not actually control behavior;
- **hidden coupling** — state changes unrelated downstream planes.

A future **causal influence matrix** can make expected/forbidden propagation explicit.

---

## 15. Causal coverage-guided scenario search

Ordinary line coverage is useful but insufficient for living-agent behavior.

A future scenario search can reward new domain-state coverage, for example:

- matter status × semantic revision × run state;
- material action/rejection outcomes;
- recognized vs anonymous identity states;
- perception modalities;
- provider attempt lifecycle states;
- authority revocation reasons;
- resident↔resident pair interactions;
- possession/contention states;
- checked absence/search states;
- participant-visible vs private-only consequences.

Headless deterministic search should find/shrink scenarios cheaply; expensive browser replay should be reserved for novel/failing minimized specimens.

Property-based/model-based tools such as fast-check are attractive because they support generated command sequences, deterministic seeds and shrinking, including scheduled async execution. They are not currently an SPC repository dependency and should be introduced only through a bounded experiment.

---

## 16. Evidence Mutation Campaign

The Observatory itself must prove that it can detect important faults.

A future bounded mutation campaign can intentionally seed controlled test-only faults such as:

- hidden material position leaks into resident knowledge;
- camera affects World state;
- stale provider result is admitted;
- exact run authority is bypassed;
- renderer omits a real held object;
- research witness perturbation changes simulation.

Each mutant should be killed by the intended evidence class.

Do not use mutation score as a product-quality number. The goal is to find blind spots in the evidence system.

---

## 17. Render Truth Cross-Check

Current simple graphics already permit independent pixel-level detection of the crate from world-only screenshots.

A local OpenCV probe detected the crate's characteristic render color/shape independently from DOM text.

This suggests a future three-way check:

`World/material truth`
↔ `camera projection`
↔ `actual rendered pixels`.

### Evidence Render-ID Pass hypothesis

For richer graphics, evidence mode could optionally produce a non-participant ID/segmentation buffer where each logical rendered entity receives a stable unique render ID/color.

Possible uses:

- exact screen-space entity masks;
- automatic ROI extraction;
- material holder/render tracking;
- object visibility checks;
- causal storyboard crops;
- render-truth consistency.

This must remain a presentation-only evidence output and never become resident/player knowledge.

---

## 18. Visual evidence format split

Current Browser Evidence v1 captures JPEGs at quality 72.

Therefore current pixel/SSIM numbers are useful research signals but not rigorous lossless visual-regression oracles.

Local conversions indicate PNG can be several times larger (roughly 3x world-only and 5x research-view in the current sparse specimen), but causal checkpoint counts are small enough that lossless capture is still practical.

Recommended future split:

- lossless PNG for exact causal checkpoints, render-ID masks and pixel comparisons;
- compressed JPEG/WebP for contact sheets/human review;
- video/screencast as a separate temporal artifact.

---

## 19. Environment fingerprinting for visual evidence

Headless visual output should be scoped to the exact evidence environment.

Record at least:

- Chrome version;
- viewport + device pixel ratio;
- actual Phaser renderer type (`CANVAS` vs `WEBGL`);
- headless mode;
- GPU/WebGL renderer where available;
- source/build identity.

A local headless Chromium probe did not expose useful GPU strings and failed to create a WebGL context, reinforcing the need to record the **actual renderer used**, rather than assume headless output matches Owner desktop GPU rendering.

---

## 20. Lightweight long-run pathology monitors

Hard causal invariants should be distinct from exploratory pathology detection.

### Hard runtime/trace monitors

Examples:

- revoked run never mutates World afterward;
- terminal matter never becomes active again;
- admitted provider result uses current dependency revision;
- hidden truth does not influence resident output before acquisition.

Violations can FAIL a scenario.

### Soft pathology findings

Examples:

- semantic revision thrashing;
- repeated blocked → review → retry loops;
- matter remains active with no progress for long periods;
- repeated identical semantic pressure;
- event/cognition amplification;
- five residents converge suspiciously despite different experiences;
- player presence dominates unrelated resident lives.

These should select material for review rather than automatically define good/bad behavior.

Runtime-verification and process-mining concepts are useful donors, but no formal-monitoring framework is required initially. The first implementation may simply be explicit domain monitors over the causal ledger.

---

## 21. Cheap memory monitoring is available

`Runtime.getHeapUsage` was verified in a controlled Chromium probe.

Example synthetic observation:

- baseline used heap ~0.7 MB;
- controlled allocation raised used heap to ~84 MB;
- explicit GC returned it near baseline.

This is sufficient for lightweight memory-trend sampling during long-run evidence.

Heavy heap snapshots should be anomaly-triggered, not continuous.

---

## 22. Interaction fidelity levels

Current Browser Evidence uses DOM `element.click()` for research controls. This tests handler/runtime integration but not real hit-testing/pointer mechanics.

Future evidence should label the interaction level explicitly:

1. **fixture action** — declared experiment intervention;
2. **semantic UI invocation** — DOM handler path;
3. **participant input** — real CDP/Playwright mouse/keyboard/touch;
4. **Owner manual** — qualitative human exercise.

Do not call a lower level participant-interaction proof when it is not one.

---

## 23. Manual Owner run → regression specimen

A future low-attention workflow can turn Owner testing into replayable evidence.

A lightweight ring buffer records:

- World ticks;
- participant input tape;
- causal fingerprints/events;
- recent screenshots/frame references.

When the Owner sees something wrong, one `mark finding` action can flush a bounded window before/after the point.

Then Observatory can:

1. replay the run;
2. locate first divergence/anomaly;
3. shrink the input/event sequence;
4. preserve the minimized specimen as a regression scenario.

This can reduce the need for the Owner to technically describe a difficult emergent bug.

---

## 24. Evidence privacy / retention warning

Raw tracing can retain more data than expected.

A synthetic Playwright trace ZIP contained:

- trace data;
- many screenshot resources;
- source resources;
- a network trace file.

Chrome/Perfetto traces may also contain URLs/environment details.

Before live-provider traces become routine, define evidence classes:

### Retained/sanitized evidence

Safe structured causal snapshots, hashes, metrics and explicitly selected screenshots suitable for the evidence branch.

### Short-lived raw diagnostic artifact

Playwright/Chrome trace, full network details or other high-volume/context-rich debugging material retained only when needed and never containing API secrets.

Do not publish raw authorization headers/tokens or full sensitive provider payloads to the rotating evidence branch.

---

## 25. Evidence triangulation

No single internal source should certify itself.

A high-value material event should eventually be cross-checked across independent evidence channels:

`authoritative state transition`
↔ `causal ledger/provenance`
↔ `external browser/participant render`.

Examples:

- state changes but no authorized ledger owner → authority leak;
- ledger claims pickup but material state did not change → outcome/logging defect;
- state + ledger agree but pixels do not show the object → presentation defect.

The Observatory should intentionally make its evidence sources capable of disagreeing.

---

## 26. Research direction after these probes

The capability research strengthens, rather than changes, the main campaign order.

Near-term stop-line remains:

1. explicit evidence/manual simulation stepping;
2. replay/determinism qualification;
3. canonical per-plane evidence snapshot;
4. event-driven causal ledger + state/lineage fingerprints;
5. observability non-interference twin;
6. first adversarial deterministic browser specimen: missing crate;
7. causal-frame / light user-timing instrumentation;
8. then bounded metamorphic/property-based and provider-fault experiments.

Do not build all advanced tools at once.

The strongest new principle is:

> **The Observatory should first search cheaply for relational/causal violations, then automatically spend expensive browser/trace/AI attention only on the smallest interesting counterexamples.**
