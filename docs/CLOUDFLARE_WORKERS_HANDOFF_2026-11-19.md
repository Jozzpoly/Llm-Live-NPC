# Cloudflare Workers — operational handoff
**Observed:** 2026-11-19. **Purpose:** preserve the actual shutdown state and the remaining reconstruction/security work for a future AI or developer. This is an operational addendum, not authorization to deploy, invoke a provider, rotate credentials, or resume the old SPC campaign.

## 1. Current Owner-observed Cloudflare state

The Owner disabled both visible Worker URL switches in Cloudflare → Workers & Pages → each Worker → Domains:

| Worker | Production workers.dev | Preview workers.dev |
| --- | --- | --- |
| `llm-live-npc` | OFF | OFF |
| `llm-live-npc-spc-research` | OFF | OFF |

The 2026-11-19 screenshots show both switches grey/off and no custom domains or routes on either Worker. A subsequent direct browser navigation to each former production `*.workers.dev` root displayed Cloudflare **Page not found**.

**What this proves:** the two standard production workers.dev hostnames are no longer serving the Worker through those routes at the time checked.

**What it does not prove:** that every historical version-specific hostname, any unobserved route, another account binding, or every possible external invocation path is unavailable. No POST was sent and no inference was triggered. Do not probe paid routes merely to test access.

The third Worker, `swm-medium-observation-probe`, was not changed. Its role is a read-only Medium source navigator, not an inference endpoint; preserve it unless a separate evidence-based review changes that conclusion.

## 2. Configuration drift — do not overlook

The dashboard switches are currently OFF, but the repository configurations do not consistently encode that intent:

- Historical/default `wrangler.jsonc` on `main` for `llm-live-npc`: `workers_dev: true`, `preview_urls: true`.
- Isolated `wrangler.spc-research.jsonc` on `staging/spc-research-first-luna-20261011`: `name: llm-live-npc-spc-research`, `workers_dev: true`, `preview_urls: false`.
- The isolated research deploy script verifies the dedicated generated manifest, including the Worker name and `preview_urls: false`, but does not require `workers_dev: false`.
- Historical `main` `package.json` exposes `"deploy": "wrangler deploy"` and `"check": "tsc -p tsconfig.json --noEmit && wrangler deploy --dry-run"`. The deploy script uses the default Wrangler config without a guard against either public URL flag. Thus a future `npm run deploy` from this historical source can re-enable the production workers.dev route and Preview URLs. This is source-level deploy-path evidence, not evidence that a deployment is scheduled or currently running.

The repository's `AGENTS.md` explicitly says the repo has provider-side configuration debt that the Owner, not an agent, resolves; it also warns that `main` is historical P0 and that branches must not be deleted. Respect that boundary.

Therefore a future deployment from either configuration may re-enable the standard workers.dev production hostname; the default configuration may also re-enable preview URLs. Dashboard state alone is not a durable repository-level policy.

**Recommended future code-only correction:** encode both `workers_dev: false` and `preview_urls: false` in each deployment manifest that can target these legacy Workers, and make the isolated build/deploy verifier reject either flag being true. Review every workflow and generated Wrangler manifest before changing anything. Do not deploy this correction as part of archival work. A documentation-only handoff must not be merged into historical `main` without reviewing its Cloudflare deployment side effect.

## 3. Security boundary and source-vs-live distinction

PR [#162](https://github.com/Jozzpoly/Llm-Live-NPC/pull/162) records the original finding: nine POST routes could reach OpenAI or Workers AI handlers without application-layer operator authorization. Rate limiting was not a project-wide financial hard cap. Its operator-token mitigation is source-level work and was not independently proven deployed to the old production Worker.

The isolated research source contains a fail-closed operator gate before API POST routes, keeps health read-only, and in its Luna-only mode allows only the exact life-intent route to proceed after authorization. Its deployment manifest requires `OPENAI_API_KEY` and `SPC_RESEARCH_OPERATOR_TOKEN`; the deploy script requires an explicit target-name confirmation and a local secret file, and its dry-run uses fake credentials. These are properties of the inspected source, **not proof of current live deployment or correctly configured secrets**.

PR #163 contains a later Owner stop instruction: stop Cloudflare/account/staging setup, deployment loops, API inference, and Owner UI instructions after the 2026-10-11 process failure. The current 2026-11-19 authorization is for autonomous analysis and preservation work; it does not authorize paid inference, secret handling, or resuming the old deployment campaign. The Owner explicitly rejected the Cloudflare Zero Trust enrollment path; do not re-propose it.

A prior staging health observation reported both the provider key and operator gate as unconfigured. That is a historical observation, not current account state. A key-like value was previously seen in a Cloudflare secret-name field; do not reproduce any literal, assume it is safe, or copy it into Git/chat. Credential rotation/usage review remains a separate secure Owner-controlled task.

## 4. What the old experiments actually established

The historical `docs/PROJECT_STATE.md` records P0 transport evidence:
- GLM-4.7-Flash consumed its bounded completion budget on reasoning and returned no usable content in two probes. This falsified that specific probe configuration, not all GLM use.
- Granite 4.0 H Micro and Llama 3.2 3B Instruct each returned a usable short completion through the same Worker + AI Gateway seam; response normalization handled both Workers AI native `{response}` and OpenAI-like `{choices}` shapes.
- This qualified replaceable model transport and telemetry, **not NPC cognition, autonomy, model selection, or a living-world product**.

The larger five-resident SPC work is preserved in draft PR stacks and research branches, not on historical `main`. The 2026-11-10 vendor-neutral entrypoint and branch audit remain the correct navigation starting points. In particular:
- Do not treat `main` as the latest SPC source.
- Do not mass-delete branches or close draft PRs by age/name.
- Preserve the 2026-09-18 stress failure and all negative evidence.
- Owner-observed living-world and visual quality remain FAIL / unqualified; CI and isolated workshop affordances do not override that.
- Do not merge the takeover documentation PR solely to make it visible on `main`; its own warning about historical deployment side effects remains in force.

## 5. Next safe work

1. Keep both dashboard workers.dev switches OFF; do not alter secrets, bindings, plans, or deployments during this preservation pass.
2. Reconcile deployment manifests and workflows in a separate reviewed code change, with no deploy. First inventory every Wrangler config and every workflow that can deploy either Worker.
3. Preserve and cross-link the P0 evidence, PR #162 security findings, PR #163 stop/correction history, PR #167 vendor-neutral takeover docs, and exact research branch/PR ancestry. Retain failures and uncertainty, not just successful experiments.
4. Keep `swm-medium-observation-probe` intact.
5. Treat Jaskinia as the future home for a new SPC architecture. The legacy Worker is a research archive and source of lessons, not the new foundation.

**Evidence discipline:** distinguish Owner screenshot/observation, live GET observation, inspected source configuration, CI result, and unverified account state. Never collapse them into one generic “secured” or “working” status.
