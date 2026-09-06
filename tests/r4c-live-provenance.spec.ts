import { expect, test } from "@playwright/test";

const BASE_URL = process.env.BASE_URL;
const EXPECTED_SHA = process.env.EXPECTED_SHA;
const EXPECTED_BRANCH = process.env.EXPECTED_BRANCH;

if (!BASE_URL || !EXPECTED_SHA || !EXPECTED_BRANCH) {
  throw new Error("R4c live evidence requires BASE_URL, EXPECTED_SHA and EXPECTED_BRANCH.");
}

test("live preview health and rendered shell expose the exact deployed build identity", async ({ page, request }) => {
  const healthResponse = await request.get(`${BASE_URL}/api/health`);
  expect(healthResponse.ok()).toBe(true);
  const health = (await healthResponse.json()) as {
    build?: {
      commitSha?: string | null;
      branch?: string | null;
      workerVersionId?: string | null;
      workerVersionTimestamp?: string | null;
    };
  };

  expect(health.build?.commitSha).toBe(EXPECTED_SHA);
  expect(health.build?.branch).toBe(EXPECTED_BRANCH);
  expect(health.build?.workerVersionId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(health.build?.workerVersionTimestamp).toBeTruthy();

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await expect(page.locator("#game canvas")).toBeVisible();

  const fingerprint = page.locator(".workspace-build-fingerprint");
  await expect(fingerprint).toBeVisible();
  await expect(fingerprint).toHaveText(
    `build ${EXPECTED_SHA.slice(0, 12)} · v ${health.build!.workerVersionId!.slice(0, 8)}`
  );
  const title = await fingerprint.getAttribute("title");
  expect(title).toContain(`commit: ${EXPECTED_SHA}`);
  expect(title).toContain(`branch: ${EXPECTED_BRANCH}`);
  expect(title).toContain(`worker version: ${health.build!.workerVersionId}`);

  // The provenance line must remain inside the debug header rather than
  // expanding or overflowing the layout it is intended to identify.
  const geometry = await fingerprint.evaluate((node) => {
    const own = node.getBoundingClientRect();
    const header = node.closest(".workspace-header")?.getBoundingClientRect();
    return header
      ? {
          left: own.left,
          right: own.right,
          top: own.top,
          bottom: own.bottom,
          headerLeft: header.left,
          headerRight: header.right,
          headerTop: header.top,
          headerBottom: header.bottom
        }
      : null;
  });
  expect(geometry).not.toBeNull();
  expect(geometry!.left).toBeGreaterThanOrEqual(geometry!.headerLeft);
  expect(geometry!.right).toBeLessThanOrEqual(geometry!.headerRight);
  expect(geometry!.top).toBeGreaterThanOrEqual(geometry!.headerTop);
  expect(geometry!.bottom).toBeLessThanOrEqual(geometry!.headerBottom);
});
