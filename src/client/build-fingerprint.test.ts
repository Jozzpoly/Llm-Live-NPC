import { describe, expect, it } from "vitest";
import {
  formatBuildFingerprint,
  formatBuildFingerprintTitle,
  parseRuntimeBuildFingerprint,
  requestRuntimeBuildFingerprint
} from "./build-fingerprint";

const full = {
  ok: true,
  build: {
    commitSha: "1234567890abcdef1234567890abcdef12345678",
    branch: "repair/example",
    workerVersionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    workerVersionTimestamp: "2026-09-06T17:00:00.000Z"
  }
};

describe("runtime build fingerprint", () => {
  it("parses exact health provenance while ignoring unrelated health fields", () => {
    expect(parseRuntimeBuildFingerprint(full)).toEqual({
      commitSha: full.build.commitSha,
      branch: full.build.branch,
      workerVersionId: full.build.workerVersionId,
      workerVersionTimestamp: full.build.workerVersionTimestamp
    });
  });

  it("renders a compact recording-friendly fingerprint without losing exact title provenance", () => {
    const fingerprint = parseRuntimeBuildFingerprint(full)!;
    expect(formatBuildFingerprint(fingerprint)).toBe("build 1234567890ab · v aaaaaaaa");
    expect(formatBuildFingerprintTitle(fingerprint)).toContain(`commit: ${full.build.commitSha}`);
    expect(formatBuildFingerprintTitle(fingerprint)).toContain(`worker version: ${full.build.workerVersionId}`);
  });

  it("keeps missing build metadata explicit rather than fabricating identity", () => {
    const fingerprint = parseRuntimeBuildFingerprint({ build: {} })!;
    expect(formatBuildFingerprint(fingerprint)).toBe("build unknown · v unknown");
    expect(formatBuildFingerprintTitle(fingerprint)).toContain("commit: unavailable");
  });

  it("returns null for non-health shapes and non-successful responses", async () => {
    expect(parseRuntimeBuildFingerprint({ ok: true })).toBeNull();

    const unavailable = await requestRuntimeBuildFingerprint(async () =>
      new Response(JSON.stringify({ error: "no health" }), { status: 503 })
    );
    expect(unavailable).toBeNull();
  });
});
