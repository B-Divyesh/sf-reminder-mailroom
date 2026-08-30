import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("landing page has one plain heading, working legal routes, and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page).toHaveTitle("Reminder Mailroom — archive each invoice once");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Archive one invoice from every reminder thread");
  await page.locator('a[href="/privacy/"]').first().click();
  await expect(page).toHaveURL(/\/privacy\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
  expect(errors).toEqual([]);
});

test("@claim:release-platform-download selects a real asset from GitHub API metadata", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route("https://api.github.com/repos/B-Divyesh/sf-reminder-mailroom/releases/latest", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ tag_name: "v0.2.0", assets: [
      { name: "Reminder.Mailroom_0.2.0_amd64.AppImage", browser_download_url: "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/download/v0.2.0/Reminder.Mailroom_0.2.0_amd64.AppImage" },
      { name: "Reminder.Mailroom_0.2.0_x64_en-US.msi", browser_download_url: "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/download/v0.2.0/Reminder.Mailroom_0.2.0_x64_en-US.msi" },
      { name: "Reminder.Mailroom_0.2.0_aarch64.dmg", browser_download_url: "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/download/v0.2.0/Reminder.Mailroom_0.2.0_aarch64.dmg" },
      { name: "Reminder.Mailroom_0.2.0_x64.dmg", browser_download_url: "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/download/v0.2.0/Reminder.Mailroom_0.2.0_x64.dmg" }
    ] })
  }));
  await page.goto("/?release-test=1");
  await expect(page.locator("#primary-download")).toHaveAttribute("href", /releases\/download\/v0\.2\.0\/.*AppImage$/);
  await expect(page.locator("#release-note")).toContainText("v0.2.0");
  expect(requests.some((url) => url.includes("releases/latest/download/latest.json"))).toBe(false);
});

test("@claim:changed-pdf-thread archives one invoice and skips a changed-PDF reminder", async ({ page }) => {
  await page.goto("/demo/");
  await page.getByRole("button", { name: "Run sample sort" }).click();
  await expect(page.locator("#demo-archived")).toHaveText("1");
  await expect(page.locator("#demo-skipped")).toHaveText("2");
  await expect(page.locator("#demo-forwarded")).toHaveText("1");
  await expect(page.getByText("Same invoice thread, changed PDF")).toBeVisible();
});

test("@claim:demo-isolation keeps the sample in its own namespace without external requests", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).origin !== "http://127.0.0.1:4173") external.push(request.url()); });
  await page.goto("/demo/");
  await page.getByRole("button", { name: "Run sample sort" }).click();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toEqual(["demo:reminder-mailroom"]);
  expect(external).toEqual([]);
});

test("@claim:local-interface-privacy sends no data while rules and activity are viewed", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).origin !== "http://127.0.0.1:4174") external.push(request.url()); });
  await page.goto("http://127.0.0.1:4174");
  await page.getByRole("button", { name: "Sorting rules" }).click();
  await page.getByRole("button", { name: "Activity" }).click();
  expect(external).toEqual([]);
});

test("@claim:audit-csv-export exports every sample decision", async ({ page }) => {
  await page.goto("/demo/");
  await page.getByRole("button", { name: "Run sample sort" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export audit CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("reminder-mailroom-demo-audit.csv");
  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv.trim().split("\n")).toHaveLength(4);
  expect(csv).toContain("Same invoice thread, changed PDF");
});

test("@claim:offline-reload reloads the sample after the first visit", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/demo/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("See one invoice archived from three messages");
  await context.close();
});

test("service worker removes a previous build cache during update", async ({ page }) => {
  await page.goto("/demo/");
  await page.evaluate(async () => { await caches.open("reminder-mailroom-site-old-build"); await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("reminder-mailroom-site-old-build"))).toBe(false);
});

test("@claim:oauth-provider-setup exposes Google and Microsoft OAuth connection", async ({ page }) => {
  await page.goto("http://127.0.0.1:4174");
  await page.locator("#auth-mode").selectOption("oauth");
  await expect(page.locator("#oauth-provider")).toBeVisible();
  await expect(page.locator("#oauth-provider option")).toHaveText(["Google", "Microsoft"]);
  await expect(page.getByRole("button", { name: "Connect with OAuth" })).toBeVisible();
  await expect(page.locator("#oauth-client-id")).toBeVisible();
});

test("@claim:paid-tier-copy states the exact one-time price and billing destination", async ({ page }) => {
  await page.goto("/");
  const paid = page.locator(".price-grid .paid");
  await expect(paid).toContainText("$29 one-time");
  await expect(paid).toContainText("Unlimited sorting rules");
  await expect(paid.getByRole("link", { name: "Buy Mailroom Plus" })).toHaveAttribute("href", "https://api.sociobot.in/api/v1/products/reminder-mailroom/checkout");
});

test("desktop app and demo are keyboard-ready and accessible", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:4174");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  let results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  await page.goto("/demo/");
  results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  expect(errors).toEqual([]);
});

test("landing and demo remain usable at 390px and 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#try-demo")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.goto("/demo/");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Run sample sort" })).toBeVisible();
});
