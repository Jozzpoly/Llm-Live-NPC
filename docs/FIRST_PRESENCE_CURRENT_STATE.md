# Living resident — Current State

Updated: 2026-09-09

This checkpoint describes the candidate in [PR #119](https://github.com/Jozzpoly/Llm-Live-NPC/pull/119). Refresh the PR head, checks and preview before resuming. The user accepted the earlier probe's technical behavior but asked for free conversation and real actions in one coherent experience. That direction supersedes adding more probe controls.

## Playable experience

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
