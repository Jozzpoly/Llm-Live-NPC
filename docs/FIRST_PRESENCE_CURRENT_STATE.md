# Living resident — Current State

Updated: 2026-09-10

This checkpoint describes the candidate in [PR #119](https://github.com/Jozzpoly/Llm-Live-NPC/pull/119). Refresh the PR head, checks and preview before resuming. The user accepted the earlier probe's technical behavior but asked for free conversation and real actions in one coherent experience. That direction supersedes adding more probe controls.

## Contact, search and continuing collection — 2026-09-10

**Current source and browser validation: complete.** The exact deployment identity and separate live-provider result are maintained in [PR #119](https://github.com/Jozzpoly/Llm-Live-NPC/pull/119); do not infer them from the earlier preview `29495114`. The broader design and its evidence are in [Mira: contact with the world and further direction](RESIDENT_WORLD_CONTACT.md), written after Owner explicitly asked for deeper and wider examination of embodiment and overlooked assumptions.

The new source connects these changes in the ordinary living scene:

- Directional sight and independent, visible attention, including turning in place and looking at a recipient while moving. Own body/carried-item knowledge remains available without sight.
- Per-resident observations distinguish current sight, remembered positions, inspected empty last positions and coarse audible calls. A physical call supplies a direction/distance band, not the caller's hidden coordinates. Typed messages still arrive remotely and supply no implicit position.
- Losing a target starts physical investigation without cancelling follow or the collection/delivery phase. Searching uses remembered evidence and the familiar static map, scans at viewpoints, reacquires by sight and resumes. Exhaustion produces a bounded report and can await a new contact/call.
- `find_item` accepts an observable description before an exact object is known. Type/color observations bind it to an item; several known candidates require clarification. A suggested search location differs from a requested place restriction. The limited vocabulary is mug/hammer/lantern/any plus red/blue; it is not unrestricted description understanding.
- Collection of all matching items remembers completed deliveries, discovers further items in familiar places, leaves deliveries separately within reach, and retains progress through smalltalk. Results describe the checked scope. Already delivered objects are not repeatedly collected. This is a durable collection objective, not yet a general arbitrary sequence planner.
- One shared host collects actor decisions on the same snapshot and steps World once. The default scene uses an independent living specimen; the laboratory specimen is retained.
- Filtered sensory experiences and commitment progress reach the next model request. Identical collection proposals preserve progress, and an obsolete proposal cannot repeat a delivery/collection that completed during its response.

Validation: TypeScript, **78 files / 329 tests**, Worker/client production builds passed. New integrated cases cover unseen-description discovery and delivery; all four items delivered once with smalltalk; ambiguous candidates; restricted-place collection; physical pursuit/search/call/reacquisition; unchanged decisions under two different hidden target positions; observed absence; stale delivery proposals; and a second inactive resident not accelerating World. These use controlled decisions and do not establish live model interpretation or Owner product acceptance.

Production-client Chromium checks passed on desktop (1440 × 1000) and mobile (390 × 844): requesting the initially unseen red mug and receiving it; hiding inside the cottage, calling and being found; collecting all four items with an intervening conversation and an honest completion report. There were no page exceptions, unexpected console errors or horizontal overflow. Screenshots were inspected. The Browser plugin was not available, so the frontend-testing workflow used bundled Playwright. These runs intercepted HTTP with controlled model decisions; the separate unmocked provider result belongs in the PR publication record. Local artifacts are `pilot/living-npc/contact-browser-check.cjs`, `contact-browser-results.json`, `contact-desktop.png` and `contact-mobile-collection.png` in the coordinating workspace.

The first directional-sight trial exposed a real regression: stepping backwards to place an item turned Mira away from the recipient and caused repeated loss/reacquisition. Independent gaze during movement fixed it. The first browser call assertion also assumed a signal reached farther through a wall than its configured range; the scenario was corrected to use a nearby occluded caller, without expanding hearing to make the assertion pass. Preserve those failure artifacts outside the repository.

**Still missing:** event-triggered autonomous LLM decisions (model calls still start on message/retry), consequential own activities (the old simple walk/rest remains), broader adaptive planning, pause/resume of multiple commitments, durable episodic memory/reload continuity, physical speech/gestures/footsteps, lighting-dependent sight, inter-actor collision, ownership/loans and an actual second resident with a distinct life. Source-grounded recommendations and migration order are in the design document. The next coherent experience should connect a useful world effect, Mira's own reason to care, event-triggered plan revision and remembered consequences; do not mistake more capable fetching for that milestone.

## Prior Owner reassessment — before the contact implementation

**Historical assessment of baseline `f7e926d9b255ac13e96ce13f3bc5b561f478ca2f`.** At this point the following direction had not yet been implemented. Owner tested the baseline, found most individual actions substantially better, and still judged it far from a living NPC. This supersedes treating the earlier seven-exchange success as adequate product acceptance.

Owner's examples: "bring all items" ends after one; fixed location cycling resembles a simple bot; following ends after losing sight; "search for me" produces words without search. The map and graphics are also too basic, but continuity of the NPC, both during and between LLM calls, is the priority.

### Diagnosis from the current code

| Symptom | Current mechanism | Required change |
| --- | --- | --- |
| One item and then finished | `ResidentIntent` names one target; `Task` stores one activity; completed `outcome()` calls `resumeRoutine()`. | Separate the durable objective, progress and completion condition from the currently executing skill. |
| Stops after losing the player | At the last observed location, absence calls `fail()`, which replaces the task with wait. | Preserve pursuit/delivery intent while investigating loss of contact; reacquisition resumes the original behavior. |
| Says it cannot see instead of searching | No search skill or representation of a sought target exists in the provider contract. | Searching must be an executable skill using remembered evidence and coverage, including targets not currently visible. |
| Mechanical looping | `routine()` alternates yard/grove with fixed rests. AI is only invoked by speech or explicit retry. | World events and meaningful decision points must reach cognition; local behavior should serve a current goal or actual need. |
| Thin “brain” | Recent chat and last-seen positions do not preserve commitments, task progress, reasons to change strategy or relevant episodes. | Maintain working state and durable relevant memories independently of the short dialogue window. |

The previous pass restored a useful language-to-action interface. Calling it a broadly living resident overstated what that evidence demonstrated. The existing World, collision/action legality, route planner and scene remain useful. The research causal kernel contains useful goal-scoped revision and evidence concepts; its own scope explicitly excludes a general mind, planner and memory system. Reusing its principles does not mean routing ordinary life through the old manual probe.

### Chosen direction: persistent purpose with feedback from execution

1. **Resident state exists continuously.** Keep identity/preferences, currently relevant observations, unresolved commitments, a short adaptive plan, progress, and relevant remembered experiences. An unfinished objective must not disappear when chat history rolls over. Remember which objects have already been delivered so a collection task does not fetch the same delivered objects forever.

2. **Plans are revisable and have a completion condition.** Accepting "bring everything" establishes a scoped collection objective, not a one-item skill. Resolve obvious scope from context; explain the intended scope briefly or clarify material ambiguity. Unknown areas can require exploration. Report what was checked and what remains unknown; completion of the known subset is not proof that all items in an unseen world were found. Sequence steps may be generated or refined as evidence arrives. A missing item, occupied hands or a moved recipient changes the next step without silently deleting the goal.

3. **Search is a first-class physical behavior.** Remember last sighting, age and observed movement direction. Check the last seen position, nearby occluding corners and plausible connected areas; record where searching has already failed. Use actual visibility to reacquire the target. Do not consult the hidden target's current coordinates to choose the search route. Search should be bounded by progress, coverage and context; it can ask for a clue, wait at a meeting point or explicitly explain failure. Losing sight is not cancellation. A spoken clue is heard information; chat delivery alone must not reveal exact physical coordinates.

4. **Execution returns structured events to cognition.** Feed actual skill outcomes, relevant discoveries, loss/reacquisition, obstacles and changed commitments back into decision making. Carry the original purpose and completed work into each decision. Local controls keep moving, navigating, observing, finishing known steps and searching while an LLM request is pending. New speech can pause, revise, replace or cancel a goal; a casual remark should not erase it. Old proposals are validated against their goal/revision and relevant assumptions.

5. **The LLM participates beyond replies.** It chooses or revises goals and near-term strategies after meaningful events, and may initiate an appropriate remark or question. A scheduler combines related events, avoids repeated unchanged input, gives user conversation priority, and respects a shared budget. The current six-per-minute chat limiter is not a complete budget for autonomous cognition; design separate user and background allowances before enabling background calls. Never use a model request for every movement frame.

6. **Own life has causes and consequences.** Start with a small grounded personal purpose, usable objects and real changing state. For example, an agreed preference for a tidy workspace can lead to noticing and returning an out-of-place tool, resuming after a conversation, and later doing something else. Motivation needs persistence, progress, cooldown and satiation so it does not become another endless patrol. An NPC can have preferences or decline an unsupported request; more obedient task execution alone does not establish a convincing resident. Claimed hobbies and activities should connect to what this world actually supports.

### Implementation boundaries

- Extend the dialogue decision contract to express an objective/plan revision, multiple steps and search; the motor skill contract can remain narrow and validated. Increasing the model size alone cannot overcome the current single-intent interface.
- Separate goal management and cognition scheduling from motion/skill execution. Replace unconditional return-to-routine and wait-on-failure with goal-aware outcome handling.
- Keep structured action outcomes and per-resident observations. Preserve observed/heard/inferred distinctions; uncertainty is actionable information, not an automatic prohibition on acting.
- The host should eventually collect controls from all actors, step World once and distribute results. Creating two current `LivingRuntime` instances would incorrectly give each its own World step; actor-specific data alone is not multi-NPC readiness.
- Retain revision protection for asynchronous decisions. Use the existing research kernel where an actual seam fits; do not inherit its experiment workflow as product UX.
- Store meaningful memories and open commitments separately from the recent transcript. Any later reload persistence must restore a compatible world and mark old observations stale; remembering a past object's position is not proof of its new position.
- The initial meaning of “live” is continuous behavior while the world is running. Simulation while the browser is closed requires an explicit host/time/budget design later.

### The next coherent experience

Give Mira a multi-step shared purpose, then perturb the situation during execution: change the item selection, take one object away, walk out of sight, offer a location clue, pause and resume the work, and talk about something unrelated. She should preserve the remaining purpose, search when appropriate, adapt and continue, explain an actual obstacle, finish or negotiate a clearly bounded partial result, and return to a meaningful own activity.

Use varied wording, item arrangements and interruptions. Compare intention, real action and subsequent explanation. A seven-command happy path, a larger brain panel, number of code modules or agents, and a prettier map are insufficient acceptance criteria. Measure unnecessary human prompting, goal continuity, repetition, actual recovery and model latency/call cost during ordinary use.

Improve legibility alongside this work: visible orientation/attention, carrying, searching and pauses; understandable rooms, occlusion and useful objects. A broader art pass and additional residents remain valuable, but the next environment additions should create meaningful situations for this behavior. Introduce a second resident after the shared state/clock is ready to expose cooperation and conflicting interests; do not wait for a theoretically perfect first resident or duplicate the current patrol logic.

### Research used to challenge the direction

[Generative Agents](https://arxiv.org/html/2304.03442v2) connects observation, retrieval, planning and reflection, and gives each agent an individual, potentially stale representation of familiar places and objects. [Voyager](https://arxiv.org/html/2305.16291v2) demonstrates composable skills with iterative feedback from the environment and execution. These are useful patterns, not evidence that our implementation already has those properties or that either architecture should be copied wholesale. For this game, physical success stays with World; language-based self-verification is not its replacement.

## Earlier playable baseline — f7e926d (historical publication record)

The default page is now **Mira i Ty**: the existing Phaser world, player controls and a Polish conversation panel. Mira remembers recent conversation during the session, observes nearby visible entities, moves around obstacles, goes to familiar places, follows a person, fetches and delivers an item, drops it or waits. Ordinary conversation can continue during a journey. A new request supersedes an older pending response; the immediate stop button also cancels its authority. Unaddressed, Mira walks and rests locally without polling AI.

This is one resident with a small skill palette and bounded session memory. Reload starts a fresh world. There is no long-term persistence, second resident, social simulation or day/night cycle yet. The visuals reuse the existing world and simple actor glyphs.

The earlier controlled Red-to-Blue First Presence experience remains available with `?lab=1`. It is no longer the default interface. Its historical tests and authority boundary remain useful in that laboratory mode; its seeded story and manual Resume/Replace are not required for free conversation.

## Implementation

- `src/living/runtime.ts` owns Mira's session, observations, intent, cached navigation and concrete actions. The active mode steps the same World once per frame; the old probe and executor do not step or accept manual commands in living mode.
- `src/execution/navigation.ts` finds routes around actual rectangular blockers with actor clearance. World collision and action results remain authoritative.
- `/api/resident/converse` returns a validated Polish reply plus one bounded intent through the existing Workers AI binding. The model cannot move the World or establish action success. Unknown targets and unsupported output fail visibly.
- Living conversation uses Qwen3-30B-A3B with its non-thinking prompt switch. A live trial of the earlier Granite micro model produced broken Polish and ignored a fetch request; it was insufficient for this experience. The laboratory keeps its original model. [Cloudflare model contract](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/) and [Qwen model guidance](https://huggingface.co/Qwen/Qwen3-30B-A3B-FP8) informed the bounded replacement; the PR records its actual live outcome.
- Requests are serialized and revision checked. Typing does not move the player. The world advances while AI responds. Errors expose retry without inventing a resident response.
- Fetch includes approaching the item, actual pickup, returning toward the remembered/observed player and actual drop within reach and line of sight. A world message reports completion only after that result. The player can pick up the delivered object.
- Known entities come from sight and are timestamped. Conversation distinguishes player statements, NPC speech and world outcomes. Familiar places are authored knowledge; an unseen hammer is not automatically known.

## Validation at publication

- Strict TypeScript, **77 test files / 318 tests**, Worker and client production builds passed.
- Runtime checks cover routing through the workshop doorway, perception before fetching, physical delivery and player pickup, conversation while moving, superseding a late response, provider failure/retry and explicit stop.
- Real Chromium checks of the production client passed on desktop and a 390 × 844 touch viewport: conversation and keyboard isolation, workshop visit, hammer delivery and player pickup; mobile provider failure/retry, follow and stop. No page exceptions or horizontal overflow occurred.
- These browser runs used **controlled HTTP model responses**. They establish the connected interface and world behavior, not live model quality. The latest PR body records the subsequent exact-head deployment and unmocked provider run, or explicitly says it remains pending.
- The Browser skill/plugin was unavailable, so the frontend testing workflow used bundled Playwright. Temporary runners, request evidence and screenshots are outside the project repository in the coordinating workspace.

## Branch and continuation

- Base: `recovery/owner-fail-2026-09-07`, originally `883bb1d39d0244f64c950770858c82cf60b34e72`.
- Candidate: `integration/first-presence-browser-live-probe`, existing draft PR #119.
- No canonical merge or Owner acceptance is implied by implementation, tests or preview.

Continue from the latest implemented candidate. Finish any unmocked deployed dialogue qualification reported in the PR, then assess several minutes of ordinary use. Fix concrete experience failures instead of restarting a general audit or reconstructing completed plumbing. A second resident and a simple daily rhythm should extend the same usable world after the first resident's interaction is convincing.

Local checks: `npm ci` and `npm run check`. Serving `dist/client` alone is sufficient for controlled-response UI checks; real dialogue requires the Worker and its existing AI binding. The shared limiter permits six requests per minute per client key; pace live checks rather than bypassing it.
