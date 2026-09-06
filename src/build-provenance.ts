export interface BuildProvenance {
  commitSha: string | null;
  branch: string | null;
}

function normalized(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Values are injected by Vite from the current CI/build environment. Workers
 * Builds supplies WORKERS_CI_COMMIT_SHA / WORKERS_CI_BRANCH; other build
 * environments may leave them unavailable rather than fabricating provenance.
 */
export const BUILD_PROVENANCE: BuildProvenance = Object.freeze({
  commitSha: normalized(import.meta.env.LLM_LIVE_NPC_BUILD_COMMIT),
  branch: normalized(import.meta.env.LLM_LIVE_NPC_BUILD_BRANCH)
});
