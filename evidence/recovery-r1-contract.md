# Recovery R1 — pursuit task vs atomic interaction legality

Status: TESTS-ONLY RED CHARACTERIZATION.

This recovery slice starts from `recovery/owner-fail-2026-09-07` and protects the Owner-observed historical behavior that a fetch task can pursue an item while another actor is carrying it.

The key distinction is deliberate:

- atomic interaction legality answers whether an `interact` action may succeed now;
- durative task viability answers whether the executor should keep pursuing/waiting for the target.

A held item may be `target_unavailable` for pickup while remaining a valid moving target for the active task.

Before runtime changes, the added falsifiers require:

1. far held target remains pursued;
2. close held target does not kill the task merely because pickup is temporarily unavailable;
3. if the holder moves away, pursuit resumes;
4. after the holder drops the target, the same task can finish by picking it up.

The pre-existing full-discovery contested-target oracle is also intentionally left unchanged at this checkpoint. Its expectation of immediate `target_unavailable`/task failure is under review because that exact oracle previously drove the Owner-facing regression in PR #26.
