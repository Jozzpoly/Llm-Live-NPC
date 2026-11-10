# LLM Live SPC / NPC — independent takeover entrypoint
**Audit date:** 2026-11-10. **GitHub:** `Jozzpoly/Llm-Live-NPC`.
**Purpose:** Allow a new developer or AI system from any vendor to recover project purpose, technical topology and verified risks without private conversations.

## 0. State in one screen
| Dimension | Verified finding | Qualification |
| --- | --- | --- |
| Product | Five autonomous residents in a shared material/social World | **OWNER FAIL / unproven** for compelling self-directed ordinary life; machine tests are scoped |
| Default `main` | `f207419ee87c03979544d2d579e624f043300bbc` | **Historical P0**, 2026-09-05; README originally described only Worker/AI transport |
| Branches | **77** at audit | Not synonymous with 77 independent workstreams; many represent PR stacks, evidence, qualified sources |
| Open PRs | **41, all draft** at audit | Do **not** mass-close/merge. Many have non-`main` bases |
| Recovered R6 foundation | Draft [#148](https://github.com/Jozzpoly/Llm-Live-NPC/pull/148), `21eaaa364e7178b803266ed41165c2a8b3900ea5` | R1–R5 bounded research and R6 qualifiers; **not** Owner product PASS |
| Newer integrated candidate | Draft [#166](https://github.com/Jozzpoly/Llm-Live-NPC/pull/166), `555e64cf5e3f0cf2bf087361eef21298b2e11bdc` | **CI FAIL on exact tip**; important gameplay and art work, not to delete or deploy |
| Earlier manual causal candidate | Draft [#165](https://github.com/Jozzpoly/Llm-Live-NPC/pull/165), `af52d3d1262734caae5114e48af08da949ab630c` | Previously reported as bounded 1103-test and browser PASS; recheck exact run before reuse |
| Separate research staging | `staging/spc-research-first-luna-20261011`, `fcbc7b7de068baee5a1d05da4d3e63bd48470d44` | Remote health/auth smoke **FAIL**; no proof of safe deployed configuration |
| Public model-spend security | Draft [#162](https://github.com/Jozzpoly/Llm-Live-NPC/pull/162) auth countermeasure, not independently deployed | Existing/versioned Worker exposure unresolved; never infer safety from source-only auth changes |

**No promotion, release, key rotation, paid inference, branch deletion or Cloudflare changes were performed by this audit.** Source and CI were inspected remotely, not run locally.

## 1. What we are actually building
Five residents — **Mira, Janek, Ida, Oren, Nela** — should continue their own situated lives in one authored world; encounter material and social facts, hold different privately acquired knowledge, act and react without the player commanding every step, handle interrupted purposes, and actually alter/experience World outcomes.

This is **not** a chatbot, a task-dispatch benchmark, a queue of prewritten errands, a richer debug control panel, or a mere proof that the model can complete a JSON proposal. The 2026-09-18 sustained Owner/stress test and the 2026-10-09 and 2026-10-11 observations established real product/process failures despite numerous technical passes. Preserve negative evidence. The Oct 12 #166 authored repair-kit/workshop experiment proves one narrow player-caused World affordance; it does not prove autonomous residents or acceptable visuals. Procedural placeholder terrain was rejected by Owner: **never reintroduce it as approved art**.

**Architecture invariant:** `World (authoritative physical truth) → situated perception → resident-private experience & local brain → optional semantic LLM proposal → validated resident execution → factual World outcome → private consequences`. An LLM does not run frame-by-frame movement or manufacture completed physical actions. Exact implementation and art direction remain open to real product tests.

## 2. Recover without guessing
1. Read the `main` warning, this document and `AGENTS.md`. **Do not edit `main` as if it holds the latest residents.**
2. Inspect [#166](https://github.com/Jozzpoly/Llm-Live-NPC/pull/166), [#165](https://github.com/Jozzpoly/Llm-Live-NPC/pull/165), [#163](https://github.com/Jozzpoly/Llm-Live-NPC/pull/163) and R6 [#148](https://github.com/Jozzpoly/Llm-Live-NPC/pull/148) **including exact base/head ancestry**, not merely PR titles.
3. On an appropriate recovered source branch, read `README.md`, `docs/SPC_POST_STRESS_RECOVERY_PROGRAM.md`, `docs/SPC_R6_COMPLEMENTARY_PERSONHOOD_EXPERIMENT.md`, `docs/SPC_NEXT_OWNER_INTENT_AND_GAP_AUDIT.md` and `docs/SPC_AGENT_RUN_STATE.md` **where present**. Documents contain superseded sections; verify the latest correction against code and tests.
4. Read the actual scripts/World and resident implementation. Start **offline / zero provider**. On current research branches, `npm ci --ignore-scripts --no-audit --no-fund` then `npm run check` with Node 22; select a browser evidence check only after understanding its live/zero-spend behavior.
5. Produce an independent Owner-facing World experience before promoting product claims. Keep mechanical, browser, real-model, security and gameplay evidence separate. Never conceal failing checks.

## 3. Why current tips are not drop-in ready
- [Check #38276023430](https://github.com/Jozzpoly/Llm-Live-NPC/actions/runs/38276023430) on #166 exact `555e64c`: TypeScript errors TS2448/TS2454: `armedResearchMode` read before declaration in `src/client/spc-next-research-app.ts:69`. Tests/build did not run past typecheck.
- [Browser #38276023345](https://github.com/Jozzpoly/Llm-Live-NPC/actions/runs/38276023345) on same SHA: unified-armed evidence **FAIL** with deadline exceeded; separate R6 browser job **PASS**. A partial browser PASS does not override failing workflow.
- Staging `fcbc7b7`: GitHub status `spc-research-remote-health=failure` ([branch](https://github.com/Jozzpoly/Llm-Live-NPC/tree/staging/spc-research-first-luna-20261011)). Historic Oct 11 observations found isolated Worker reachable but required secret bindings missing; later strict build failed. **Do not claim present Cloudflare account state without inspecting it.**
- #162 documents unauthenticated paid routes and older versioned preview URL risk; custom login/operator gate remains an experimental unmerged mitigation. The owner rejected Cloudflare Zero Trust. A separate OpenAI `SPC Research.` project and a $0.50 enforced limit were Owner-reported on Oct 11; current account/billing state is **unverified**. A key-like value was reported in a Cloudflare variable **NAME** field; review/rotation is a future secure account task, never copy key material to Git/chat.

## 4. Branch topology (selection is NOT promotion)
```
main (P0 history, 2026-09-05)
└── ... First Hearth → SPC five-resident refoundation → integrated runtime
    └── R1 → R2 → R3 → R4 → R5 → R6 (#148)
        ├── #150 finite request cap → #163 manual choice
        │   └── #164 isolation → #165 factual choice → #166 World/art/workshop candidate
        ├── #152 → #153 → #154 → #155 material/contact donors
        └── independent #156–#162 causal/security falsifiers (not automatically in #166)
```
This is a **conceptual map**, not a complete DAG: confirm ancestry with `git merge-base`, `git log --graph`, GitHub compare or the API. In particular #166 and isolated staging **diverged**; do not overwrite one with the other. Security #162 is not an automatic ancestor of #166.

**Important:** branch source-only and historical preview URL do not imply a functioning or secured live deployment. No new model call is authorized by a documentation handoff.

## 5. Stop conditions for a future AI
- Stop if repository, owner, branch or exact SHA is ambiguous; don't write to another project such as Companion.
- Stop before deleting a branch with unique commits or an open PR without a verified retention path and a fresh ref/SHA lease.
- Stop before deploying, invoking an API, or touching secrets without independent operator authorization and budget/security evidence.
- Stop calling product ready until real Owner interaction proves meaningful resident life and acceptable visuals.
- When external GitHub history/CI files may disappear, preserve an independent backup of material evidence; branch-tip manifest is **not** a verified outside-platform backup.

For branch inventory and safe candidates, see [BRANCH_AUDIT_2026-11-10.md](BRANCH_AUDIT_2026-11-10.md).
