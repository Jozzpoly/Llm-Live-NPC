# Recovery R1 — pursuit task vs atomic interaction legality

Status: QUALIFIED FOR RECOVERY INTEGRATION; NOT OWNER-QUALIFIED PRODUCT.

This recovery slice starts from `recovery/owner-fail-2026-09-07` and protects the Owner-observed historical behavior that a fetch task can pursue an item while another actor is carrying it.

The key distinction is deliberate:

- atomic interaction legality answers whether an `interact` action may succeed now;
- durative task viability answers whether the executor should keep pursuing/waiting for the target.

A held item may be `target_unavailable` for pickup while remaining a valid moving target for the active task.

## Tests-only red checkpoint

Exact head:

`ae011eb9ee29f44fee1b8bb87e4d590770f08dc3`

Full discovery produced **81 PASS / 3 FAIL**.

The failures were exactly the intended conflict surface:

1. historical full-discovery contested-target oracle expected `target_unavailable`, while the pre-readiness runtime produced `target_out_of_range` after the player picked the target first;
2. close held target caused the executor to fail `target_unavailable` instead of keeping the durative task alive;
3. because of that same terminal failure, a target that later moved and was then dropped could not be pursued/completed.

The already-historical far-held-target pursuit scenario passed at this red checkpoint, proving the Owner-reported follow behavior was genuinely present in the pre-readiness runtime.

## Repair

The executor now distinguishes temporary pickup unavailability from task invalidity:

- if a held target is far away, the NPC continues pursuing its live position;
- if a held target is close, the NPC waits without emitting a doomed atomic interaction;
- if the holder moves away, pursuit resumes on later frames;
- if the target becomes free, the same task may complete normally;
- a same-frame `target_unavailable` result caused by player-action-before-executor ordering is non-terminal, like `target_out_of_range`.

No World legality, E1 cognition, UI, Worker, map or sensory code changed in this slice.

The historical ordering test was not deleted or weakened. It still proves that the player action runs before the executor action, that the player acquires the item, and that the NPC does not. Its terminal-task oracle was corrected to the Owner-derived semantics: the still-meaningful pursuit remains `running` rather than being killed.

## Green qualification

Exact runtime/test head:

`2864b6a27e4a50705d9e4fb4f452e5f9828a5114`

- strict TypeScript: PASS;
- **13/13 test files, 84/84 tests PASS**;
- all three Owner-derived pursuit falsifiers PASS;
- Vite Worker build: PASS;
- Vite client build: PASS;
- preview dry-run: PASS;
- Cloudflare Workers Build: PASS;
- Cloudflare Version ID: `f056d4ec-3daa-4927-b963-c75ce51a2048`.

## Explicit remaining boundary

This slice does **not** silently re-import the rest of old PR #26.

Still separate:

- the executor's historical `APPROACH_DISTANCE = 48` differs from World's `INTERACTION_RANGE = 54`; this geometry-contract issue must be reconsidered without making semantic availability drive pursuit;
- canonical player-action channel identity from old PR #26 remains a useful donor and should be recovered independently;
- a non-mutating World interaction validation API may still be useful, but it must not be reused as a blanket durative-task validity oracle.

This PR may be integrated into the recovery umbrella after exact-head validation, but it does not qualify the playable product and does not trigger an Owner test.
