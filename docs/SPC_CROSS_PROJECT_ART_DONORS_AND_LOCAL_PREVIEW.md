# SPC living world: source-verified cross-project art donors & first practical visual bridge (2026-10-12)

**Owner product verdict remains FAIL.** Previous procedural ellipses/beam roads were rejected and removed in `7c5ae81`. This is a *practical authoring bridge*, NOT an approved visual direction, final terrain implementation, collision system or world-scale editor. The Owner explicitly values high visual quality and building the dream of five genuinely living residents more than isolated labs or repeated checks.

## Source-inspected donor evaluation (main branches as seen on 2026-10-12)

| Repo | Evidence read, exact path | Transferable leverage | Explicit non-transfer |
| --- | --- | --- | --- |
| `Coopege` | `apps/studio/src/asset-browser.ts`, `apps/studio/src/map-editor.ts`, `packages/asset-system/src/index.ts`, `packages/schema/src/types.ts` | Owner-local PNG input/replacement, live art preview, stable asset IDs, sprite layouts, source validation | Not inherited mandatory tile grid, hard classes or pixel aesthetic |
| `voxel-aeronautics-workshop` | `src/game/visual_asset_registry.js`, `docs/visual_asset_pack_v1.md` | Validated source-driven visual packs, explicit fallback, Blockbench roundtrip, visual-only binding | Do not import vehicle entity/compiler semantics; old fixture is explicitly NOT visually final |
| `HomeScan-Web-Builder` | `packages/render/src/scene-controller.ts`, `apps/web/src/components/TerrainInspector.tsx` | Source reference as a calibrated/opacity-adjustable visual layer with explicit Owner control | Do not presume 3D engine, scans, or a metric coordinate conversion for SPC |
| `Jozz-Universal-Rig-Editor` | `src/editor/session.ts` | Preview/commit/cancel, undo/redo, separate authored document vs runtime | No universal Editor architecture prematurely |
| `JV-Box3D-Web-experiment` | `src/scene/scene-package.ts` | Separate render GLB and collision TRIANGLE_MESH sources, strict asset/path validation | No 3D vehicle renderer or metre convention in 2D SPC |
| `JOZZ-ENGINEERING-SANDBOX` | `docs/planning_reviews/JES_TEXTURE_IN_HAND_EXECUTION_PROGRAM_SOL_HIGH_2026-07-29_PL.md` | Owner chooses texture, sees exact binding in Edit/Run, can correct it without editing code | Do not claim aspirational P3B+ programs are already implemented |
| `Jozz-Splat-Game-Lab` | `contracts/scan-to-world.schema.json` | Explicit calibrated transform and provenance before scan becomes spatial reference | No conversion of visual splat to collision or perceivable geometry |
| `Gloopipelago` | `docs/M3_LOGICAL_WORLD_VIEW_SEPARATION_CONTRACT_2026-09-10.md` | Camera / viewport and authored world coordinate independence | Logical 900x700 blob world is unrelated gameplay |
| `Combat-Lab` | `docs/VISUAL_TRUTH_PERCEPTION_EXPLORATION_2026-10-10.md` | Observer render vs actor sensing vs canonical physical state | Exploratory research is not approved NPC visual engine |
| `Box3d_FunProject` | `docs/MAPA_ETAP_1_FUNDAMENT_TERENU_PL.md` | Real physical terrain heightfield can be sampled, tested, and driven by authored units | Do not port automotive ridged noise as SPC landscape style |

`MinecraftLike-Fun-Project` was empty on inspected `main`, not a source-proven implementable terrain donor. Review future work on its real branch before citing it.

## Implemented narrow transfer: browser-local ground ART reference

The normal `?spc=1` five-person game can now **opt into an Owner-chosen local PNG/WebP under a real place anchor**, tune actual in-World size and opacity, hide/show it for comparison and focus the site camera. Only the renderer texture is changed. The image file is decoded locally, with a strict type, byte and decoded pixel cap. It is never persisted, uploaded, sent to a model, interpreted as perception, or consumed as material/collider/navigation truth.

- An image can make the ground attractive but **does not license invented buildings or physical surfaces**. It stays explicitly `visual-only-ground-reference`.
- No image supplied means the temporary honest neutral baseline; no new procedural art is smuggled in.
- A reference overlay is not an imported authored map or a committed visual asset pack. No GLTF, tile grid, source revisions or undo system is falsely claimed.
- Start from a single small **workshop floor candidate** and a separate **forest-floor candidate**, inspect in game with moving SPC, without asking the Owner to accept a style in advance. Content production and later Studio asset integration remain real work, not checkbox test victory.
- Retain explicit visual promotion veto: Owner-observed ugly image is FAIL regardless of green CI. Art quality must be judged at real player zoom and under movement.
- The higher-value next step is a real authorable site substrate with authenticated source art and independently authored physical affordances, not cosmetic procedural stamps.

No production deployment, PR merge, API request or provider credential changes are authorized by this preview.
