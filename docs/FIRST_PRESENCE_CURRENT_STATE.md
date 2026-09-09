# First Presence — Current State

Updated: 2026-09-09

This checkpoint describes the integration candidate in [PR #119](https://github.com/Jozzpoly/Llm-Live-NPC/pull/119). Check the live PR head, checks and preview before resuming. Historical claims below an older branch or chat must not restart work already present in this candidate.

## Human state

The bounded First Presence experiment is now connected to the visible Phaser game. The user can start the selected Red-mug story, let a Blue-mug correction go through the existing asynchronous semantic transport, and explicitly choose Resume or Replace. NPC execution pauses during inference while the same World and player continue advancing.

This is a controlled integration probe. The initial Red meaning and the subsequent Blue correction are seeded by the probe. It is not free-form conversation or an automatic resident policy.

## Branch boundary

- Canonical/refoundation branch: `recovery/owner-fail-2026-09-07`.
- Canonical base of this candidate: `883bb1d39d0244f64c950770858c82cf60b34e72` (PR #118).
- Candidate branch: `integration/first-presence-browser-live-probe`.
- PR #119 remains separate from a canonical merge or Owner product acceptance.

The older PR #112 checkpoint and deterministic-only transport frontier have been superseded by the deferred semantic owner, transport coordinator and this browser integration. Preserve their historical evidence; do not reconstruct these implemented layers.

## What is wired

`WorldScene` owns one World with the browser probe specimen, one probe, and one canonical ExecutionDriver using that probe's executor. Every completed frame is reconciled by the active probe. There is no second World clock or separate executor animating a parallel NPC.

The probe's panel is at the top of Debug Workspace. It updates from current probe state, exposes Start / Retry / Resume / Replace, and shows bounded factual trace, transport diagnostics and outcome. The browser-only Blue mug uses an identifiable blue mug glyph. Mobile probe controls retain their full names in two columns.

Once the probe takes ownership, E1 is disarmed and both E1 and manual Fetch-lantern entry points are blocked. That exclusion persists through retry, blocked and terminal probe states until page reload. A rejected probe start while the executor is already busy does not disarm E1. Late E1 responses are invalidated by the existing arm-session checks.

## Validation of the integration change

- Strict TypeScript and the existing 74 test files / 300 tests passed.
- Worker and client production builds passed.
- The self-contained Wrangler preview upload dry-run passed; it did not upload a version.
- An independent static review of the ownership integration found no concrete defect. It did not claim to run a browser.
- Real Chromium runs of the production client verified:
  1. one Red execution frame, held NPC with moving player and advancing World, current Blue decision still held until explicit Replace, factual Blue pickup;
  2. mobile touch controls, transport failure, preserved hold, explicit Retry, current decision, explicit Resume and factual Red pickup; reload returns to idle;
  3. an already-running manual task refuses a probe start without creating a matter or replacing that task;
  4. a real pending E1 HTTP request, probe takeover, late E1 response, unchanged held Red run, then explicit Blue replacement and pickup.
- These browser cases used controlled HTTP provider responses to make timing, failure and return values reproducible. They do not establish live-provider availability or model quality. Use the PR's latest exact-head evidence for any later deployed live-provider check.
- No page exceptions occurred. Chromium screenshot capture produced driver `ReadPixels` performance warnings; the failure-path case deliberately produced HTTP 503. Neither is reported as an unexplained application exception.

The browser checks used bundled Playwright because the Browser skill/plugin was not available. Evidence and the temporary runner are outside the project repository in the coordinating Codex workspace.

## Retained product and authority boundaries

Grounded speech is not automatic matter admission. New evidence is not automatic relevance or a new decision. Model output proposes semantic meaning; it cannot move the World, release a hold, cancel or replace a run. Resume and Replace remain explicit Owner controls in this probe.

Mechanical success returns as factual evidence and does not automatically resolve semantic meaning. This work does not settle matter selection, attention, memory, semantic satisfaction, general conversation, final interaction UX, multi-NPC behavior, persistence or production scaling. The earlier qualitative Owner failure is not erased by passing integration tests.

## Resume from here

1. Check the live candidate and whether PR #119 has advanced or merged.
2. Reuse the implemented scene/panel wiring. Do not treat browser integration as still unwritten.
3. Use exact-head preview and provider evidence in the PR to identify any remaining qualification, then a coherent human trial to assess the experience.
4. Keep merge/Owner acceptance distinct from implementation and technical proof.

Local reproduction starts with `npm ci`, `npm run check` and `npm run deploy:preview -- --dry-run`. Live local development uses the existing Workers AI binding and requires Cloudflare authentication; serving only the built client is sufficient for controlled HTTP-response browser checks but is not a live Worker deployment.
