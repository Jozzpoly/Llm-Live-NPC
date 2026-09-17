# SPC Next — World, Visualization, and Feedback Contract

Status: **current-best research contract; not a final game UI specification**

## Why this exists

SPC Next can be mechanically correct and still fail the project if the Owner cannot look at the world and understand that an NPC is present, situated, reacting, failing, recovering, and acting for causes that belong to that world.

The earlier project repeatedly allowed headless evidence and debug text to advance faster than world readability. That is now treated as a foundation risk, not as presentation debt.

## Three feedback layers

### 1. World truth

The world itself must visibly carry the important consequence whenever that consequence is physical or public.

Examples: where a body actually moved, where it stopped, whether it crossed a boundary, whether speech happened, what object changed state, who physically approached whom, and what geometry blocked an action.

A debug panel is never allowed to substitute for missing world consequence.

### 2. Diegetic / player-facing feedback

Use restrained feedback when a player needs to read an intention or event that would naturally be perceptible but is not clear enough from raw geometry alone.

This layer may include speech bubbles, body/facing cues once facing is authoritative, interaction reactions, short-lived spatial cues, and other in-world communication.

It must not fabricate private cognition or imply a state the simulation does not own.

### 3. Research lens

The research lens is an optional microscope. It may expose private percepts, causal trace, activity targets, exact World truth, epistemic divergence, sensory reach, cognition queues, and later intent-versus-outcome resolution.

Research evidence is not gameplay readability evidence. If a behavior only makes sense with the lens open, it remains a world/feedback problem.

## Owner evaluation order

Every meaningful embodied-system milestone should support this sequence:

1. enter **World-only** mode;
2. observe and interact without telemetry;
3. form a judgement about presence/readability/causality;
4. only then open the research lens;
5. use causal evidence to explain or falsify the judgement;
6. repair the world/system first when the panel is doing explanatory work the world should have done.

World-only mode therefore disables the epistemic overlay as well as hiding the research panel.

## No fabricated semantics

Presentation must not claim a semantic state simply because it is visually convenient.

Current examples:

- a movement vector may be drawn as movement direction, but must not be labelled gaze/facing until facing exists as authoritative state;
- a directional hearing percept must not be rendered as an exact source position;
- a last-seen actor position must remain visibly distinguishable from current omniscient World truth;
- `activity.reason` is research evidence, not dialogue or a thought bubble;
- cognition queues are research telemetry, not emotion or urgency icons in the game world.

## Current scaffold: what it proves and what it does not

The `?spc=1` browser mode is a research scaffold for SPC Next. It currently provides a playable player, five spatially separated residents, authored macro-regions, camera/focus/overview controls, public speech visualization, resident selection, private perception/trace inspection, and an epistemic overlay.

This is **not** evidence that a living world has been achieved.

Known material absences remain:

- no physical collision or body geometry;
- no obstacle-rich local environment in the five-resident specimen;
- no persistent resident routine/local-life loop after initial activities complete;
- almost no world objects or actionable ecology in SPC Next;
- no authoritative facing/attention state;
- no general physical action outcome contract yet;
- hearing capability and voice emission range are still semantically coupled in the current runtime defaults;
- physical `velocity` still needs qualification as actual outcome rather than desired motion at constraints.

The browser harness should make these deficits easier to see, not hide them with decorative motion or explanatory prose.

## Research stimuli

A research control may generate a real world stimulus if it uses the same authority path as future gameplay.

The initial player call is therefore emitted through `SpcWorldRuntime.speak()` with an explicit radius. It is not allowed to inject percepts, cognition reasons, or resident state directly.

## Next foundation gates

The immediate priority is not visual polish. It is feedback truth.

1. Separate **motion intent** from **resolved physical outcome** so a body stopped at the world boundary cannot publicly report non-zero physical velocity merely because its controller still wants to move.
2. Surface constrained/blocked motion through one authoritative outcome seam usable by the resident local brain and the research overlay.
3. Put collision behind that same seam rather than creating a second execution path.
4. Build enough persistent local life that World-only observation remains meaningful after the initial few seconds.
5. Introduce authored local geometry/objects so perception, movement and interaction can be judged together rather than as isolated contracts.
6. Continue visual feedback review at every major subsystem gate instead of postponing it to an Owner build.

## Qualification language

Use these labels deliberately:

- **MECHANICAL PASS** — automated contracts pass.
- **VISUAL RESEARCH READY** — a browser harness exists and is mechanically qualified.
- **OWNER-OBSERVED** — the Owner has actually watched/played the relevant behavior.
- **WORLD-READABLE PASS** — behavior remains understandable enough in World-only mode.

Do not infer `WORLD-READABLE PASS` from automated tests or from the research lens.
