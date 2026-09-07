import { expect, test } from "@playwright/test";

const previewUrl = process.env.R4A_PREVIEW_URL;
if (!previewUrl) throw new Error("R4A_PREVIEW_URL is required.");

test("rendered debug surface preserves complete player/executor action-attempt truth", async ({ page }) => {
  await page.goto(previewUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  const attemptSection = page
    .locator("section.debug-section")
    .filter({ has: page.getByRole("heading", { name: "Recent action attempts", exact: true }) });
  await expect(attemptSection).toBeVisible();
  await expect(attemptSection.getByText("No atomic action attempts yet.", { exact: true })).toBeVisible();

  // Real normal player input: empty-handed drop is a rejected atomic attempt.
  await page.keyboard.press("q");
  const playerAttempt = attemptSection
    .locator("li")
    .filter({ hasText: "player channel · player.jozz · drop" });
  await expect(playerAttempt).toBeVisible({ timeout: 5_000 });
  await expect(playerAttempt).toContainText("rejected · not_holding_item");

  // Real manual executor apparatus: let the NPC approach and interact with the lantern.
  await page.getByRole("button", { name: "Fetch lantern", exact: true }).click();
  const executorAttempt = attemptSection
    .locator("li")
    .filter({ hasText: "executor · npc.001 · interact → item.lantern" });
  await expect(executorAttempt).toBeVisible({ timeout: 15_000 });
  await expect(executorAttempt).toContainText("succeeded · picked_up_item");

  const renderedAttempts = await attemptSection.locator("li").allTextContents();
  expect(renderedAttempts.length).toBeGreaterThanOrEqual(2);
  expect(renderedAttempts[0]).toContain("executor · npc.001 · interact → item.lantern");
  expect(renderedAttempts.some((text) => text.includes("player channel · player.jozz · drop"))).toBe(true);

  // Empty later fixed-step frames must not erase either attempt from the bounded history.
  await page.waitForTimeout(1_000);
  await expect(executorAttempt).toBeVisible();
  await expect(playerAttempt).toBeVisible();

  // The old singular glance remains intentionally lossy, while the new panel retains both sources.
  const lastActionSection = page
    .locator("section.debug-section")
    .filter({ has: page.getByRole("heading", { name: "Last action outcome", exact: true }) });
  await expect(lastActionSection).toContainText("npc.001");
  await expect(lastActionSection).toContainText("item.lantern");
  await expect(lastActionSection).toContainText("succeeded · picked_up_item");
  await expect(playerAttempt).toContainText("rejected · not_holding_item");
});
