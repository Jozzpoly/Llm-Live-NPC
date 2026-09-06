export interface RuntimeBuildFingerprint {
  commitSha: string | null;
  branch: string | null;
  workerVersionId: string | null;
  workerVersionTimestamp: string | null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function parseRuntimeBuildFingerprint(value: unknown): RuntimeBuildFingerprint | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  if (!root.build || typeof root.build !== "object") return null;
  const build = root.build as Record<string, unknown>;
  return {
    commitSha: stringOrNull(build.commitSha),
    branch: stringOrNull(build.branch),
    workerVersionId: stringOrNull(build.workerVersionId),
    workerVersionTimestamp: stringOrNull(build.workerVersionTimestamp)
  };
}

function compact(value: string | null, length: number): string {
  return value ? value.slice(0, length) : "unknown";
}

export function formatBuildFingerprint(fingerprint: RuntimeBuildFingerprint): string {
  return `build ${compact(fingerprint.commitSha, 12)} · v ${compact(fingerprint.workerVersionId, 8)}`;
}

export function formatBuildFingerprintTitle(fingerprint: RuntimeBuildFingerprint): string {
  return [
    `commit: ${fingerprint.commitSha ?? "unavailable"}`,
    `branch: ${fingerprint.branch ?? "unavailable"}`,
    `worker version: ${fingerprint.workerVersionId ?? "unavailable"}`,
    `version timestamp: ${fingerprint.workerVersionTimestamp ?? "unavailable"}`
  ].join("\n");
}

export async function requestRuntimeBuildFingerprint(
  fetcher: typeof fetch = fetch
): Promise<RuntimeBuildFingerprint | null> {
  const response = await fetcher("/api/health", {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return parseRuntimeBuildFingerprint(await response.json());
}
