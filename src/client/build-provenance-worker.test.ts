import { describe, expect, it } from "vitest";
import worker from "../../worker/index";

describe("Worker build provenance health envelope", () => {
  it("exposes native Worker version metadata alongside explicit build provenance fields", async () => {
    const env = {
      AI: {
        async run() {
          throw new Error("AI must not run for health.");
        }
      },
      AI_PROBE_LIMITER: {
        async limit() {
          throw new Error("Rate limiter must not run for health.");
        }
      },
      CF_VERSION_METADATA: {
        id: "version-test-id",
        tag: "test-tag",
        timestamp: "2026-09-06T17:00:00.000Z"
      }
    };

    const response = await worker.fetch(new Request("https://example.test/api/health"), env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      build?: Record<string, unknown>;
    };

    expect(payload.build).toMatchObject({
      workerVersionId: "version-test-id",
      workerVersionTag: "test-tag",
      workerVersionTimestamp: "2026-09-06T17:00:00.000Z"
    });
    expect(payload.build).toHaveProperty("commitSha");
    expect(payload.build).toHaveProperty("branch");
  });
});
