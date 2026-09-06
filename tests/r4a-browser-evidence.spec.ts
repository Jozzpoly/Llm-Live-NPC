import { expect, test } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4173";

test("rendered debug workspace preserves player and executor action-attempt provenance", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await expect(page.locator("#game canvas")).toBeVisible();

  const attemptsSection = page.locator("section.debug-section").filter({
    has: page.locator("h3", { hasText: "Recent action attempts" })
  });
  await expect(attemptsSection).toBeVisible();
  await expect(attemptsSection).toContainText("No atomic action attempts yet.");

  // Q is the normal player drop input. The default specimen starts with the
  // player empty-handed, so this produces a real rejected atomic World action.
  await page.keyboard.press("q");
  await expect(attemptsSection).toContainText("player channel · player.jozz · drop", { timeout: 3000 });
  await expect(attemptsSection).toContainText("rejected · not_holding_item");

  // Use the existing bounded B2 manual executor apparatus. This must eventually
  // produce an executor-channel atomic interaction attempt; the assertion does
  // not require success, only truthful rendered source/outcome provenance.
  const fetchButton = page.getByRole("button", { name: "Fetch lantern" });
  await fetchButton.click();
  await expect(attemptsSection).toContainText("executor · npc.001 · interact → item.lantern", {
    timeout: 15000
  });

  const attemptText = await attemptsSection.innerText();
  expect(attemptText).toContain("player channel");
  expect(attemptText).toContain("executor");
  expect(attemptText.indexOf("executor")).toBeLessThan(attemptText.lastIndexOf("player channel"));
});
