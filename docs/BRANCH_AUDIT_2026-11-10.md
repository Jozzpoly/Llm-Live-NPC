# LLM Live SPC — branch audit / prune map
**Checked:** 2026-11-10 via GitHub repository metadata, open PRs, exact branch SHAs and selected compare results. **77 branches; 41 open draft PRs.** No branch has been deleted during this audit.

## Never prune by label alone
- **41 open PR heads and all their bases:** preserve pending an explicit stack-consolidation review; closing/retargeting a parent breaks navigation to its child changes.
- **R1–R6 research/qualified source branches, archive and historical negative-evidence refs:** can contain nonmerged causal and audit proof; not synonymous with junk.
- **`staging/spc-research-first-luna-20261011`:** a failed, divergent, isolated Worker attempt — important forensic security context; not a launchable release.
- **`forensics/runaway-cognition-2026-09-18`:** preserve costly negative evidence.
- **`archive/repository-cleanup-2026-09-11`:** contains `.cleanup/recovery-manifest.tsv` with old branch→SHA mapping and historical cleanup workflow. The manifest is not an outside-GitHub backup.
- **`scratch-do-not-use`, `tmp-do-not-use`:** despite misleading names, GitHub compare reports **543** and **637** commits ahead of old P0 `main` respectively. They have no open PR head, but are **not demonstrated empty, merged, or safe for deletion**.

## First five exact duplicate aliases; deletion candidates, not yet executed
Each was verified at **exact SHA equal to `main`** `f207419ee87c03979544d2d579e624f043300bbc`, has no open PR as head or base at audit, and has no unique commit at its tip:

```
maintenance/repository-cleanup-v5-e2e-target-dd44c0188986
maintenance/repository-cleanup-v5-prepare-7cbe12b39b0e52477f
maintenance/repository-cleanup-v5-prepare-146e3f4482ff16ad3f
maintenance/repository-cleanup-v5-prepare-231d6f5f73bf307e6b
maintenance/repository-cleanup-v5-prepare-fa829b2a97d5ec64eb
```

Before deletion, re-read live refs, rerun open-PR base/head checks, and confirm there is no external deployment/job referencing the branch by **name**. Delete each using an exact expected SHA (compare-and-swap), never force-delete a ref that moved. Do **not** delete `main`.

## Other maintenance experiments — not duplicate
- `maintenance/repository-cleanup-v5-e2e-helper-dd44c0188986`: +2 commits vs main; unique `.cleanup-kit.tgz`.
- `maintenance/repository-cleanup-v5-live-e2e-a6-target-a` and `-b`: each +1 commit; distinct `.cleanup-e2e/*` marker.
- `maintenance/repository-cleanup-v5-prepare-fa1ab57d197a961321`: +6 commits; split runtime zip and workflow.
- `maintenance/repository-cleanup-v5-prepare-c584673d1d44815012`: includes `.cleanup-bootstrap/runtime.zip` and workflow.
- `maintenance/repository-cleanup-v5-prepare-3cd44bb70d2b5f23a4`: unique head; inspect and retain via a verified archive/manifest before deletion.

These look like technical cleanup apparatus, **not product branches**, but uniqueness means no unverified mass deletion. Keep archive branch (historical recovery manifest). If later retiring unique refs, publish a verifiable SHA-indexed archive that actually retains each commit, and verify no open PR or external build/release dependency.

## What a finished cleanup must actually prove
1. Every retired branch maps to a captured SHA; selected source/evidence remains reachable after deletion.
2. Open-PR stacks are either deliberately consolidated/closed with traceable successors or kept intact.
3. Default-branch landing explains the historical P0 status and leads to verified active research code.
4. No runtime, Cloudflare, production, credential, paid model endpoint, or automated deployment changed as a side effect.
5. Real tests pass on the branch being proposed for adoption; Owner-observed product FAIL and visual FAIL remain documented until requalified.

**No automatic deletion of all old branches is justified.** Branch count is a symptom; recoverability and source-of-truth are the actual goal.
