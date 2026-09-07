# Recovery baseline

This branch starts from exact pre-readiness runtime-clean checkpoint:

`15ed5e3146df07cb2624c7bd77dd5f2e9a4a5105`

It is not automatically qualified. It exists to rebuild the post-readiness substrate selectively after the 2026-09-07 Owner gate exposed severe regressions in the current line.

Do not forward-merge the failed readiness line into this branch. Re-earn later repairs selectively and preserve useful pre-readiness behavior unless a new, explicit evidence-backed change replaces it.
