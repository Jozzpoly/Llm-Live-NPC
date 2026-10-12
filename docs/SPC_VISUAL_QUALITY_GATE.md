# SPC World — visual quality boundary (Owner FAIL, 2026-10-12)

**Authoritative Owner verdict:** the generated terrain shown at PR #166 HEAD `88b240e` is visually unacceptable. It must NOT become an art-direction donor, baseline to copy, or approved default. This supersedes earlier assistant aesthetic claims, any passing Chromium/CI and any 'better than empty' rationale.

## What failed in actual Chromium

- Flat, randomly scattered ellipses as generalized terrain texture, constant multicolored semi-transparent noise with no material identity or coherent visual hierarchy.
- Three blurred, translucent navigation lanes masquerading as roads, though not physically meaningful authored ground. A route graph is not evidence of a constructed path or traversable surface.
- Large region rectangles used as different visual terrain materials. Region knowledge is categorical/semantic; the bounds are not licensed to become rendered biome boundaries.
- Authored sites drawn as floating labels/rings, without actual physical built structures; decorative marks looked like non-existent objects. Avoid implying a wall, bridge, well mesh or tree collider that World does not actually have.
- Too much cheap procedural paint, too little functional world content, geometry or strong authored art. Source was `src/client/spc-next-world-ground.ts` (now retired as a forbidden decorative renderer, retained only through Git history).

## Immediate correction

- The active unified five-person scene must use a visibly **temporary, low-detail neutral substrate**. This is not a new art style and must not be promoted as one.
- Research-only diagnostics can render categorical region boundaries under an explicit epistemic overlay. Do not paint the region model onto the playable default ground.
- Retain actual resident bodies, World-registered pickable objects and semantic site identifiers. No World coordinates, cognition, collision, navigation, role identities or authored site data change as a side effect of visual cleanup.
- Other historic evidence scenarios remain unchanged. Production and unrelated projects remain untouched.

## Before any future terrain gets promoted

1. Establish Owner-led visual intent or clearly labelled candidate visual language. **Do not assume voxel, pixel, terrain mesh, heightfield, top-down tilemap or pseudo-3D is already chosen for SPC.** Preserve the ability for hybrid/future authoring.
2. Create one actual **workshop** and one **forest route** Golden Slice at gameplay camera scale using coherent authored assets/ground semantics. Pure code paint is not an automatic quality path. A screenshot is evidence only: Owner judges the lived look.
3. Demand readable figure-ground hierarchy, distinct materials, meaningful physical structure, consistent scale, usable negative space, responsive camera zoom and adequate contrast. Avoid repeating stamp noise, light-beam roads and huge fake circular 'site auras'.
4. Distinguish (a) authentic World-backed solids/material/affordances, (b) honest decoration without claimed physical properties, and (c) investigation-only overlays. Current asset pipeline may evolve. Cosmetic features are not licence to silently rewrite causal data.
5. Compare *side-by-side at true in-game view* with no-art fallback; reject any candidate that looks unconvincing, clutters residents/materials, or risks future style lock-in. **Machine PASS is not Owner approval**.

## Engineering note

The navigation graph may supply routes for actual movement but does **not** automatically define a road material. First-hearth legacy scenes and unmerged preview remain experiments. Keep this visual quality debt visible in the PR first-screen checkpoint; do not spend another round inflating decorative detail for its own sake.
