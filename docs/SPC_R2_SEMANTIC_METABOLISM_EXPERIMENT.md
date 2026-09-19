# SPC R2 — Resident Relevance / Semantic Metabolism Experiment

Status: **BINDING CURRENT R2 EXPERIMENT CONTRACT**
Date: **2026-09-20**
Parent authority: `docs/SPC_POST_STRESS_RECOVERY_PROGRAM.md`
R1 baseline: `docs/SPC_ZERO_PROVIDER_LOCAL_LIFE_R1_PASS.md`

R1 proved that embodied local life can continue without provider cognition manufacturing continuity.

R2 now attacks the next missing layer:

> **Perception must not automatically become unresolved semantic pressure, and unresolved semantic pressure must not automatically become a provider request.**

This is the central post-stress "middle intelligence" experiment.

---

## 1. R2 question

Can one resident experience a noisy causal world while retaining only the small, explainable set of unresolved semantic issues that genuinely deserve higher cognition?

R2 is not a request-rate optimization campaign.

The target is **better resident reasoning about significance**.

A low request rate produced by cooldowns, caps or aggressive deletion is a FAIL if the resident is simply becoming blind or forgetful.

---

## 2. Evidence from the R1 boundary

R1 intentionally preserved several current defects instead of hiding them.

Current `ResidentRuntime` still performs:

`percept`
→ `reasonFromPercept()`
→ `CognitionReason`
→ `CognitionScheduler.pending`.

Current automatic promotion includes:
- every heard speech with text;
- every `interaction` / `system` percept;
- every actor sight enter/exit;
- every authored region transition through a separate direct reason path.

Current scheduler also performs:

`pending == 0`
+ `quiet timer reached`
→ fabricated `quiet_review`
→ cognition batch.

Therefore even a resident whose local life is healthy can still be reconnected to a provider loop that manufactures semantic work from:
- ambient speech;
- ordinary visibility churn;
- expected movement through the world;
- or simply passage of time.

R2 exists to break those joins honestly.

---

## 3. Hard boundaries

### 3.1 Percept != semantic pressure

A percept is evidence that something reached the resident.

It is not automatically evidence that:
- the resident should care;
- anything is unresolved;
- a new matter should exist;
- higher cognition is required.

Percepts must remain available to local/private state according to bounded memory rules even when they do not become semantic pressure.

### 3.2 Local handling != semantic settlement

R1 already earned this boundary.

A resident may:
- stop;
- look;
- dodge;
- acknowledge;
- continue a routine;
- ignore something bodily;

without that implying semantic resolution of the underlying content.

### 3.3 Semantic pressure != provider request

R2 may leave genuine pressure pending while the resident continues local life.

Provider escalation is a later boundary.

No provider is required to qualify R2.

### 3.4 Passage of time != semantic discrepancy

A timer may trigger **local maintenance**.

A timer alone may not fabricate a provider-worthy semantic issue.

The current `quiet_review` provider cadence is therefore explicitly reopened.

### 3.5 Forgetting != metabolism

Dropping events because a TTL expired is not sufficient.

Pressure termination must be explainable as one of:
- never promoted beyond observation;
- locally explained;
- settled by factual/semantic consequence;
- superseded by newer evidence;
- no longer relevant under explicit resident/world state;
- deliberately forgotten under a bounded memory policy that does not pretend the issue was solved.

Exact implementation names remain open.

---

## 4. Pressure layers R2 must distinguish

The implementation does not have to use these exact types, but evidence must distinguish equivalent states.

### Observation

Something reached the resident.

May remain only in private percept/history state.

### Local significance / attention

Something deserves short-horizon local reaction or attention but not necessarily higher cognition.

Example:
an addressed `Mira?` can cause local stop/look/`Tak?`.

### Unresolved semantic pressure

There is a genuine resident-relative question, discrepancy, obligation or uncertainty that local competence cannot honestly settle.

Only this class should be eligible for future semantic escalation.

### Settled / explained / superseded state

The system can explain why a previously meaningful pressure no longer requires unresolved cognition.

---

## 5. R2-A — characterize current amplification before repair

Do not start with a framework.

Create executable characterization for at least these failure families.

### A. Ambient speech amplification

Many physically heard but unaddressed low-context speech occurrences currently become many independent `heard_speech` reasons.

Characterization must show:
- number of percepts;
- number of resulting pending reasons;
- reason identities;
- no corresponding resident matter/obligation explaining why each deserves unresolved cognition.

### B. Visibility / ordinary-world churn

Actor sight enter/exit and ordinary region transition currently create semantic pressure by default.

Characterization must establish which of these are:
- merely useful private observation;
- locally relevant;
- actually unresolved.

### C. Timer-generated cognition

With zero pending pressure, the current scheduler eventually fabricates `quiet_review`.

Characterization must prove this independently of provider transport.

This is a direct post-stress falsifier.

### D. Genuine high-value contrast

Use at least one case that **should not be filtered away**:
- addressed speech;
- checked absence breaking an active material expectation;
- or another explicit discrepancy tied to a continuing matter.

R2 cannot earn a PASS by making the resident insensitive.

---

## 6. R2-B — first metabolism boundary

After characterization, introduce the smallest boundary that stops raw perception from directly owning scheduler pressure.

Requirements:

- private perception remains causally intact;
- pressure promotion becomes an explicit operation with an inspectable reason;
- low-context ambient observations may remain observations without becoming unresolved issues;
- genuine addressed/discrepancy pressure remains possible;
- the scheduler no longer needs to understand raw percept types itself;
- no provider is introduced.

Do not generalize into a full utility/GOAP/BT framework.

---

## 7. R2-C — causal explanation

Pressure must be evaluated relative to current resident life.

Candidate questions:
- was this expected from my current run?
- did my own matter already explain this location/state transition?
- is this the same issue I am already handling?
- did a factual World outcome already settle it?
- is this only a newer observation of the same known fact?
- does this contradict my last-known state?

The architecture must be able to suppress **self-generated semantic echo** without suppressing real surprises.

---

## 8. R2-D — lifecycle / homeostasis

Unresolved pressure cannot be an immortal event bag.

The eventual representation must support equivalent semantics for:
- active unresolved;
- locally explained;
- settled;
- superseded;
- expired/stale with an explicit reason;
- retained because it still matters.

A completed or superseded issue must not resurrect merely because old percept evidence remains in memory.

No global TTL-only solution qualifies.

---

## 9. R2-E — scheduler correction

The scheduler should schedule **already-established unresolved pressure**, not manufacture semantic reasons.

Target boundary:

`resident/world evidence`
→ `local relevance/metabolism`
→ `explicit unresolved semantic pressure`
→ `scheduler/cognition opportunity`
→ later provider escalation.

The current automatic provider-shaped `quiet_review` must not survive as an unconditional semantic request source.

If periodic maintenance remains useful, it should run locally and create semantic pressure only when that maintenance discovers a real unresolved issue.

---

## 10. Noisy-world qualification

Before R2 PASS, create a deterministic noisy-world campaign.

Minimum shape:
- one resident with a continuing local matter or legitimate quiet state;
- many ambient percepts;
- repeated non-addressed speech;
- actor visibility churn;
- at least one ordinary expected transition;
- one genuinely material discrepancy;
- one addressed player contact;
- long enough runtime to exercise lifecycle.

Required evidence:
- raw percept count can be high;
- unresolved semantic-pressure count remains small and explainable;
- exact promotion reason is inspectable;
- no important addressed/discrepancy issue is lost;
- local life continues;
- stable old pressure does not spawn duplicate pressure;
- timer passage alone does not create semantic work;
- no provider call is needed to achieve this.

Do not freeze a numeric compression ratio before observing the experiment.

---

## 11. Complementary resident pressure

### Mira

Use for:
- ordinary life;
- ambient social noise;
- addressed contact;
- legitimate quiet;
- local routine;
- person-relative concern later.

### Janek

Use for:
- stale material knowledge;
- checked absence;
- search/recovery;
- expected vs unexpected material state;
- interruption while a meaningful matter is already active.

Core metabolism must be shared.

No `if resident == "Mira"` / `if resident == "Janek"` semantic logic.

---

## 12. R2 anti-cheat rules

R2 is FAIL if apparent success mainly comes from:

- longer cooldowns;
- global request caps;
- dropping oldest reasons;
- one arbitrary TTL for everything;
- muting all unaddressed speech;
- making the resident unable to notice other actors;
- deleting pressure whenever local body behavior occurs;
- calling an LLM to decide the relevance of every percept;
- hard-coding the R2 test scenario;
- counting fewer requests as proof of better cognition.

---

## 13. Evidence planes

R2 needs separate claims:

- **PERCEPT CAUSALITY** — the resident really received the evidence;
- **LOCAL RELEVANCE** — local state classified its significance;
- **PRESSURE LIFECYCLE** — unresolved state and settlement/supersession are explicit;
- **BODY NONINTERFERENCE** — local life continues while pressure waits;
- **SCHEDULER NONMANUFACTURE** — time alone does not invent semantic work;
- **NOISY-WORLD HOMEOSTASIS** — many observations yield a bounded explainable unresolved set;
- **COMPLEMENTARY RESIDENT** — same mechanisms survive Mira/Janek pressure.

Do not collapse these into one green test.

---

## 14. R2 PASS criteria

R2 earns **SEMANTIC-METABOLISM PASS** only if:

1. raw percept ingestion no longer directly implies scheduler pressure;
2. high-volume low-context observations can remain private observation without becoming an equally large unresolved set;
3. genuine addressed/discrepancy pressure still promotes;
4. local body handling does not falsely settle semantic content;
5. pressure lifecycle can explain why an issue remains, settles or becomes superseded/stale;
6. already-settled/superseded evidence does not resurrect;
7. expected consequences of current local life do not echo into new semantic work without a discrepancy;
8. passage of time with no new discrepancy does not create a provider-shaped semantic batch;
9. local life remains intact under noisy perception;
10. Mira and Janek pressure use the same core mechanisms;
11. deterministic noisy-world replay is stable;
12. no provider is required for the qualification.

Passing R2 still does not imply:
- causal personhood solved;
- provider reintegration ready in every case;
- five-resident homeostasis solved;
- Owner living-world quality.

---

## 15. Immediate work order

1. characterize the current amplification path executable-first;
2. quantify the raw `percept -> pending reason` join;
3. separately prove timer-generated `quiet_review`;
4. identify the smallest shared seam between private perception and unresolved pressure;
5. implement only enough metabolism to defeat the characterized failures;
6. reattack R1 to ensure local life is preserved;
7. attack with Janek discrepancy pressure;
8. build the deterministic noisy-world gate;
9. only then consider R2 PASS.

The first implementation milestone is:

> **Raw perception can remain true private evidence without automatically becoming unresolved semantic work.**
