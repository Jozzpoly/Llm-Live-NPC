import { expect, test, type Browser, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4173";

async function openLab(browser: Browser, options: Parameters<Browser["newContext"]>[0]) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await expect(page.locator("#game canvas")).toBeVisible();
  return { context, page };
}

async function documentMetrics(page: Page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    docWidth: document.documentElement.scrollWidth,
    docHeight: document.documentElement.scrollHeight,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight
  }));
}

test("desktop keeps document fixed while Debug Workspace owns vertical scroll", async ({ browser }) => {
  const { context, page } = await openLab(browser, { viewport: { width: 1600, height: 900 } });

  await expect(page.locator("#e1-stage-chip")).toHaveText("E1 cognition disarmed");
  const before = await documentMetrics(page);
  expect(before.scrollY).toBe(0);
  expect(before.docHeight).toBeLessThanOrEqual(before.innerHeight + 1);
  expect(before.docWidth).toBeLessThanOrEqual(before.innerWidth + 1);

  const gameRect = await page.locator(".game-shell").boundingBox();
  const debugRect = await page.locator(".debug-shell").boundingBox();
  expect(gameRect).not.toBeNull();
  expect(debugRect).not.toBeNull();
  expect(gameRect!.height).toBeGreaterThan(500);
  expect(debugRect!.height).toBeLessThanOrEqual(before.innerHeight - 20);

  const debugContent = page.locator(".debug-content");
  const scrollable = await debugContent.evaluate((node) => node.scrollHeight > node.clientHeight);
  expect(scrollable).toBe(true);
  await debugContent.hover();
  await page.mouse.wheel(0, 900);
  await expect.poll(() => debugContent.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect((await documentMetrics(page)).scrollY).toBe(0);

  const gameBeforeCollapse = await page.locator(".game-shell").boundingBox();
  await page.locator(".workspace-collapse").click();
  await expect(page.locator("#debug")).toHaveClass(/is-collapsed/);
  await expect(page.locator("#app")).toHaveClass(/debug-collapsed/);
  const gameAfterCollapse = await page.locator(".game-shell").boundingBox();
  expect(gameAfterCollapse!.width).toBeGreaterThan(gameBeforeCollapse!.width);
  expect((await documentMetrics(page)).scrollY).toBe(0);

  await context.close();
});

test("narrow desktop uses bounded two-row layout and compact collapsed debug row", async ({ browser }) => {
  const { context, page } = await openLab(browser, { viewport: { width: 900, height: 700 } });
  await expect(page.locator("#app")).not.toHaveClass(/mobile-owner-mode/);

  const before = await documentMetrics(page);
  expect(before.docHeight).toBeLessThanOrEqual(before.innerHeight + 1);
  const gameBefore = await page.locator(".game-shell").boundingBox();
  const debugBefore = await page.locator(".debug-shell").boundingBox();
  expect(gameBefore!.height).toBeGreaterThan(debugBefore!.height);

  await page.locator(".workspace-collapse").click();
  const gameAfter = await page.locator(".game-shell").boundingBox();
  const debugAfter = await page.locator(".debug-shell").boundingBox();
  expect(debugAfter!.height).toBeLessThanOrEqual(52);
  expect(gameAfter!.height).toBeGreaterThan(gameBefore!.height);
  expect((await documentMetrics(page)).scrollY).toBe(0);

  await context.close();
});

test("mobile portrait uses app-owned scroll only when expanded debug needs it", async ({ browser }) => {
  const { context, page } = await openLab(browser, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  await expect(page.locator("#app")).toHaveClass(/mobile-owner-mode/);
  await expect(page.locator("#debug")).toHaveClass(/is-collapsed/);
  expect((await documentMetrics(page)).scrollY).toBe(0);

  await page.locator(".workspace-collapse").click();
  await expect(page.locator("#debug")).not.toHaveClass(/is-collapsed/);
  const appScrollable = await page.locator("#app").evaluate((node) => node.scrollHeight > node.clientHeight);
  expect(appScrollable).toBe(true);

  await page.locator("#app").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  expect(await page.locator("#app").evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect((await documentMetrics(page)).scrollY).toBe(0);
  await expect(page.locator("#game canvas")).toBeVisible();

  await context.close();
});

test("mobile landscape fills the viewport and currently hides the debug workspace", async ({ browser }) => {
  const { context, page } = await openLab(browser, {
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true
  });

  await expect(page.locator("#app")).toHaveClass(/mobile-owner-mode/);
  await expect(page.locator("#debug")).toBeHidden();
  const game = await page.locator(".game-shell").boundingBox();
  expect(game!.width).toBeGreaterThanOrEqual(840);
  expect(game!.height).toBeGreaterThanOrEqual(386);

  const metrics = await documentMetrics(page);
  expect(metrics.scrollY).toBe(0);
  expect(metrics.docHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
  expect(metrics.docWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);

  await context.close();
});
