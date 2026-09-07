# LLM Live NPC — Fresh Takeover after pre-LLM readiness closure

Use this document to start a new Browser ChatGPT conversation after the qualified E1 experiment and the completed R0–R7 pre-LLM readiness repair campaign.

The previous conversation intentionally stopped before choosing a new research stage. Do **not** infer that the next task is pathfinding, memory, conversation, FOV, a generic planner or another LLM feature simply because those systems are absent.

## 1. First action — verify live truth

Repository:

`Jozzpoly/Llm-Live-NPC`

Current best repaired embodied-agent line:

`experiment/e1-grounded-notice-fetch`

Last exact **runtime** checkpoint before documentation-only closure/handoff commits:

`7cc7bbde976963372ac590a8ad91518493ac76c1`

At that runtime checkpoint:

- GitHub validation: PASS;
- final repair-head Vitest: **167 / 167 PASS across 29 files**;
- Vite production build: PASS;
- preview dry-run: PASS;
- Cloudflare Workers Build on the E1 merge head: PASS;
- Worker Version ID: `1cd90a41-a1ea-4677-8cff-4162bf97f84d`.

A live E1 head newer than `7cc7bbde...` is expected after this handoff because the intended remaining commits are documentation-only. **Do not trust that assumption blindly.** Compare live head to `7cc7bbde...`; if `src/`, `worker/`, config, dependencies or runtime tests changed, inspect and revalidate before continuing.

Historical stage topology:

- `main` — P0 model-transport baseline;
- `p1/playable-world-slice` at `e453f5862286328df92db91ba2f9adabc1e7899e` — preserved qualified P1 pre-cognition substrate;
- `experiment/e1-grounded-notice-fetch` — qualified + readiness-repaired E1 research line.

Historical E1 PR #23 is **CLOSED / NOT MERGED** by explicit topology decision. P1 remains a historical pre-cognition stage; E1 remains available as the repaired research substrate rather than rewriting P1.

Temporary readiness evidence PR #25 is also **CLOSED / NOT MERGED**. It is historical characterization evidence, not live architecture.

## 2. Read in this order

1. `README.md`
2. `docs/PROJECT_STATE.md`
3. this file
4. `docs/E1_GROUNDED_NOTICE_FETCH_DESIGN.md` only as historical E1 qualification evidence
5. live E1 branch/commit checks and Cloudflare build
6. closed PR #23 if exact E1 research/closure history is needed
7. closed PR #25 only if old readiness characterization evidence is needed
8. P1 PR #3 only for historical substrate/integration background

Do not reconstruct the project by reading every old branch/PR first.

## 3. What is closed evidence

Do not mechanically repeat:

- P0 cloud/model transport qualification;
- P1 world/presentation/input/executor refoundation through B2;
- E1 Grounded Notice → Fetch real-model experiment;
- the first E1 Owner partial-pass diagnosis and final Owner re-gate;
- the expanded pre-LLM readiness audit;
- R0–R7 repair campaign.

Closed does not mean “mathematically perfect forever.” It means the current evidence supports those bounded results and a new conversation needs **new live evidence** before reopening them.

## 4. What E1 actually proved

The original qualified loop was:

`player-caused held→free World change → bounded 220 px local evidence → temporal change → real Granite wait|fetch intention → client validation/revalidation → deterministic executor → validated World pickup → real short execution experience → next Granite cycle`

Final Owner Lantern evidence showed:

- player-caused `holder player.jozz → free`;
- legal real-model `fetch(item.lantern)`;
- NPC-001 pickup through the existing executor/World path;
- independent World semantic provenance;
- next cognition cycle containing real `picked_up_item`, NPC-held state and holder transition;
- final real Granite `wait`.

Do not expand that claim into general intelligence, sight, memory or autonomy.

## 5. What the readiness campaign changed after E1 qualification

### R0/R1 — validation + causal legality

- all `src/**/*.test.ts` are in normal Vitest discovery;
- explicit interaction legality is shared between World and executor;
- dynamic target invalidation fails for the causal semantic reason;
- player-action channel enforces player identity.

### R2 — specimen integrity

Invalid scalar, geometry, identity, reference, ownership and initial topology states are rejected at World construction rather than poisoning runtime state later.

### R3 — spatial/embodiment semantics

- actor movement uses deterministic swept static-blocker collision;
- held items are canonically co-located with holder; decorative carry offset is presentation-only;
- location identity is explicit priority-based and independent of authoring array order.

### R4 — provenance/debug truth

- bounded debug history preserves all atomic attempts + player/executor source;
- manual executor trigger has causal acceptance semantics;
- exact repository commit/branch + native Worker Version ID are exposed in runtime provenance.

### R5 — async cognition lifecycle

- monotonic page-lifetime arm-session + request identities;
- stale async completion/rejection cannot mutate a later re-arm;
- 12 s provider-attempt timeout/cancellation;
- maximum two provider attempts per logical cognition request;
- no extra cognition-budget slot for a retry;
- disarm aborts current attempt.

### R6 — sensory foundation

- entity direction is observer-body-relative;
- geometric LOS is still only occlusion, not qualified sight/FOV;
- successful semantic item actions preserve frame-local event-time post-action truth;
- same-frame `drop → pickup` survives final-state reversal as two ordered ownership occurrences;
- only already-localized semantic changes enter a bounded session-local sensory buffer;
- pending evidence survives request in-flight/cooldown/executor-busy periods;
- request observed-change limit is 32 with explicit omission count;
- no global event ring/raw snapshot becomes cognition memory.

### R7 — Worker/public laboratory boundary

- E1 requires POST + JSON;
- explicit cross-site browser requests are rejected;
- raw request body is bounded to 96 KiB;
- limiter precedes normal body consumption/parsing after cheap ingress checks;
- historical `/api/ai/qualify` is retired on E1;
- provider exceptions use stable public errors while detailed failure remains internal observability;
- bounded model usage is retained per provider attempt into browser/debug provenance.

R7 is browser/cost hardening, **not authentication or exact global quota accounting**.

## 6. Architecture to preserve

Target loop:

`WORLD → PERCEPTION → COGNITION/MEMORY → INTENTION → NON-LLM EXECUTION → VALIDATED WORLD ACTIONS → WORLD`

Preserve:

- `World` as canonical gameplay authority;
- Phaser as presentation/camera/input only;
- bounded World-derived evidence rather than raw global-state prompt access;
- LLM intentions separated from canonical mutation;
- deterministic executor translating accepted intentions into normal actor controls/actions;
- causal player/executor/request/build provenance;
- semantic state/event evidence separated from debug history and future durable memory concepts.

## 7. Important methodology lessons

### Visible behavior is not enough

An early B2 Owner recording looked successful but provenance proved the player, not NPC execution, caused the visible outcome. Evidence must answer who acted and through which system.

### Green domain tests are not rendered-runtime qualification

Owner testing exposed a badly broken debug/game shell despite green domain CI. Browser/runtime evidence matters when the claim is visual/lifecycle/interaction quality.

### Tests can be wrong too

The readiness campaign included apparatus-invalid failures and fixture migrations. Fix the oracle/apparatus when it is wrong; do not reinterpret every red result as runtime debt.

### Self-review after green CI matters

R6b2 self-review found an overflow-order semantic defect after the first fully green run. R7b review found that a snake_case-only usage normalizer would have discarded the new camelCase wire provenance. Green CI is necessary, not sufficient.

## 8. Deliberately missing — do not call debt by absence

Without a concrete next-stage requirement or current failure, do not automatically build:

- generalized pathfinding/navmesh;
- actor-actor collision gameplay semantics;
- hearing/speech;
- long-term/episodic memory;
- generic planner/GOAP/behavior trees;
- autonomous open-ended goals;
- multi-NPC coordination;
- persistence/save systems;
- final conversation UI;
- final map-authoring pipeline;
- final model selection;
- large-scale spatial indexing;
- generic observability stack;
- full account/auth/product infrastructure for this private laboratory.

## 9. Residual bounded decisions that are NOT silently repaired

Do not turn closure language into a false claim that every old note disappeared:

- repository branch protection / required-check governance has historically been weak; treat this as an explicit release/integration governance decision if topology changes;
- actor-body separation semantics are intentionally unqualified;
- soft-reset/remount is not a selected runtime contract; current listener lifetime assumes page-lifetime singleton runtime;
- Node is pinned to major 22 rather than one patch;
- current small-specimen duplicate projection/read work is not evidence for a large performance refactor.

These are not a mandate for immediate cleanup. Require a concrete material failure or next-stage prerequisite.

## 10. Immediate takeover job

There is **no preselected implementation task**.

A new conversation should:

1. verify live E1 ref and exact changes after `7cc7bbde...`;
2. confirm final checks remain green and repair/evidence PRs are not unexpectedly open;
3. recover Owner intent from the current conversation/project context;
4. critically survey the repaired substrate and choose the next **bounded research uncertainty**;
5. define what would falsify the proposed experiment before implementing it;
6. keep the new slice small enough to produce real hands-on evidence.

Do not restart the old audit merely because the old evidence branch exists. Do not automatically continue E1 into a generic agent framework.

## 11. Owner judgement to carry forward

Treat these as current Owner judgement rather than universal rules:

- real player ↔ NPC ↔ world interaction matters more than prompt-only roleplay;
- small functioning experiments should precede broad architectures;
- the current world is large/readable enough for the current lab;
- mobile is a real useful Owner-test surface;
- direct mouse/touch targeting is useful and qualified;
- interpolation materially improved movement feel;
- debugging should make causation and provenance legible;
- small UI/apparatus failures matter because they affect confidence in research evidence;
- known material debt should not be hidden behind new features.

## 12. Suggested fresh-conversation opening

A compact continuation prompt can simply say:

> Przejmij `Jozzpoly/Llm-Live-NPC` po zamknięciu pre-LLM readiness campaign. Zweryfikuj live `experiment/e1-grounded-notice-fetch`; runtime checkpoint przed docs-only handoffem to `7cc7bbde976963372ac590a8ad91518493ac76c1`, ale nie ufaj SHA bez sprawdzenia. Przeczytaj `README.md`, `docs/PROJECT_STATE.md`, `docs/FRESH_TAKEOVER.md`, potem live refs/checks. Nie powtarzaj P1/E1/R0–R7 bez nowego evidence. Ugruntuj projekt, krytycznie wybierz następny bounded embodied-agent research problem i dopiero wtedy zaplanuj dalszą pracę.

If live state contradicts this document, live repository/runtime evidence wins and the contradiction must be resolved before new implementation.
