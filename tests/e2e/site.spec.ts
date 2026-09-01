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
    body: JSON.stringify({ tag_name: "v0.3.0", assets: [
      { name: "Reminder.Mailroom_0.3.0_amd64.AppImage", browser_download_url: "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/download/v0.3.0/Reminder.Mailroom_0.3.0_amd64.AppImage" },
      { name: "Reminder.Mailroom_0.3.0_x64_en-US.msi", browser_download_url: "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/download/v0.3.0/Reminder.Mailroom_0.3.0_x64_en-US.msi" },
      { name: "Reminder.Mailroom_0.3.0_aarch64.dmg", browser_download_url: "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/download/v0.3.0/Reminder.Mailroom_0.3.0_aarch64.dmg" },
      { name: "Reminder.Mailroom_0.3.0_x64.dmg", browser_download_url: "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/download/v0.3.0/Reminder.Mailroom_0.3.0_x64.dmg" }
    ] })
  }));
  await page.goto("/?release-test=1");
  await expect(page.locator("#primary-download")).toHaveAttribute("href", /releases\/download\/v0\.3\.0\/.*AppImage$/);
  await expect(page.locator("#release-note")).toContainText("v0.3.0");
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
  await page.getByRole("button", { name: "Reset demo" }).click();
  expect(await page.evaluate(() => localStorage.getItem("demo:reminder-mailroom"))).toBeNull();
  await page.getByRole("button", { name: "Run sample sort" }).click();
  expect(external).toEqual([]);
  await page.getByRole("link", { name: "Start for real" }).click();
  expect(await page.evaluate(() => localStorage.getItem("demo:reminder-mailroom"))).toBeNull();
  await expect(page).toHaveURL(/\/#download$/);
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
  await page.addInitScript(() => {
    const calls: Array<{ command: string; args: Record<string, unknown> }> = [];
    (window as unknown as { __oauthCalls: typeof calls }).__oauthCalls = calls;
    (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> } }).__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        calls.push({ command, args });
        if (command === "get_snapshot") return { settings: null, rules: [], audit: [], archivedCount: 0, duplicateCount: 0 };
        if (command === "authorize_oauth") return "Google OAuth connected. The refresh token is stored in your operating system keychain.";
        throw new Error(`Unexpected command: ${command}`);
      }
    };
  });
  await page.goto("http://127.0.0.1:4174");
  await page.locator("#auth-mode").selectOption("oauth");
  await expect(page.locator("#oauth-provider")).toBeVisible();
  await expect(page.locator("#oauth-provider option")).toHaveText(["Google", "Microsoft"]);
  await expect(page.getByRole("button", { name: "Connect with OAuth" })).toBeVisible();
  await expect(page.locator("#oauth-client-id")).toBeVisible();
  await page.locator("#oauth-client-id").fill("fixture-desktop-client-id");
  await page.locator("#imap-user").fill("owner@example.com");
  await page.locator("#smtp-user").fill("owner@example.com");
  await page.locator("#archive-address").fill("archive@example.com");
  await page.getByRole("button", { name: "Connect with OAuth" }).click();
  await expect(page.locator("#settings-status")).toHaveText("Google OAuth connected. The refresh token is stored in your operating system keychain.");
  const oauthCall = await page.evaluate(() => (window as unknown as { __oauthCalls: Array<{ command: string; args: { settings?: Record<string, unknown> } }> }).__oauthCalls.find((call) => call.command === "authorize_oauth"));
  expect(oauthCall?.args.settings).toMatchObject({ authMode: "oauth", oauthProvider: "google", oauthClientId: "fixture-desktop-client-id", imapHost: "imap.gmail.com", smtpHost: "smtp.gmail.com" });
});

test("@claim:paid-tier-copy states the price and honest checkout status", async ({ page }) => {
  await page.goto("/");
  const paid = page.locator(".price-grid .paid");
  await expect(paid).toContainText("$29 one-time");
  await expect(paid).toContainText("Unlimited sorting rules");
  await expect(paid.getByText("Checkout is being enabled")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator('a[href*="/products/reminder-mailroom/checkout"]')).toHaveCount(0);
  await page.goto("http://127.0.0.1:4174");
  await page.getByRole("button", { name: "Plus", exact: true }).click();
  await expect(page.locator(".license-panel")).toContainText("$29 one-time");
  await expect(page.locator(".license-panel")).toContainText("Unlimited explicit sorting rules");
  await expect(page.locator("#buy-link")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator('a[href*="/products/reminder-mailroom/checkout"]')).toHaveCount(0);
});

test("@claim:paid-license-lifecycle verifies a license, enables paid controls, and locks them after revocation", async ({ page }) => {
  let verdict = { valid: true, reason: "ok" };
  const licenseRequests: string[] = [];
  await page.route("https://api.sociobot.in/api/v1/products/reminder-mailroom/verify?*", async (route) => {
    licenseRequests.push(route.request().url());
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(verdict) });
  });
  await page.addInitScript(() => {
    const intervals: number[] = [];
    (window as unknown as { __scheduledIntervals: number[] }).__scheduledIntervals = intervals;
    window.setInterval = ((_handler: TimerHandler, milliseconds?: number) => { intervals.push(milliseconds ?? 0); return 1; }) as typeof window.setInterval;
    window.clearInterval = (() => undefined) as typeof window.clearInterval;
    (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string) => Promise<unknown> } }).__TAURI_INTERNALS__ = {
      invoke: async (command) => command === "get_snapshot" ? {
        settings: { authMode: "password", oauthProvider: "google", oauthClientId: "", imapHost: "imap.example.com", imapPort: 993, imapSecurity: "tls", imapUsername: "owner@example.com", smtpHost: "smtp.example.com", smtpPort: 587, smtpSecurity: "starttls", smtpUsername: "owner@example.com", archiveAddress: "archive@example.com", scanIntervalMinutes: 15 },
        rules: [{ id: "rule-1", name: "Client invoices", subjectContains: "invoice", senderContains: "", mailbox: "INBOX", enabled: true }],
        audit: [], archivedCount: 0, duplicateCount: 0,
      } : undefined,
    };
  });
  await page.goto("http://127.0.0.1:4174");
  await page.getByRole("button", { name: "Plus" }).click();
  await page.locator("#license-token").fill("valid-token");
  await page.getByRole("button", { name: "Verify license" }).click();
  await expect(page.locator("#license-badge")).toHaveText("Plus active");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __scheduledIntervals: number[] }).__scheduledIntervals)).toContain(900_000);
  await page.getByRole("button", { name: "Sorting rules" }).click();
  await page.getByRole("button", { name: "Add a sorting rule" }).click();
  await expect(page.getByRole("dialog", { name: "Add sorting rule" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  verdict = { valid: false, reason: "revoked" };
  await page.getByRole("button", { name: "Plus" }).click();
  await page.locator("#license-token").fill("revoked-token");
  await page.getByRole("button", { name: "Verify license" }).click();
  await expect(page.locator("#license-badge")).toHaveText("Free");
  await expect(page.locator("#license-status")).toContainText("no longer active");
  expect(licenseRequests).toEqual([
    "https://api.sociobot.in/api/v1/products/reminder-mailroom/verify?license=valid-token",
    "https://api.sociobot.in/api/v1/products/reminder-mailroom/verify?license=revoked-token",
  ]);
});

test("@claim:website-request-privacy sends no tracking or visitor data", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route("https://api.github.com/repos/B-Divyesh/sf-reminder-mailroom/releases/latest", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ tag_name: "v0.3.0", assets: [] }),
  }));
  await page.goto("/?release-test=1");
  await page.locator("#privacy").scrollIntoViewIfNeeded();
  const external = requests.map((request) => new URL(request)).filter((url) => url.origin !== "http://127.0.0.1:4173");
  expect(external.map((url) => `${url.origin}${url.pathname}`)).toEqual(["https://api.github.com/repos/B-Divyesh/sf-reminder-mailroom/releases/latest"]);
  expect(requests.some((request) => /analytics|doubleclick|segment|pixel/i.test(request))).toBe(false);
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
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/demo/");
  results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  expect(errors).toEqual([]);
});

test("public routes remain accessible at 390px in light and dark themes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const route of ["/", "/privacy/", "/terms/", "/missing-page"]) {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    }
  }
});

test("delete confirmation traps focus, closes on Escape, and restores its trigger", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string) => Promise<unknown> } }).__TAURI_INTERNALS__ = {
      invoke: async (command) => command === "get_snapshot" ? { settings: null, rules: [{ id: "rule-1", name: "Client invoices", subjectContains: "invoice", senderContains: "", mailbox: "INBOX", enabled: true }], audit: [], archivedCount: 0, duplicateCount: 0 } : undefined
    };
  });
  await page.goto("http://127.0.0.1:4174");
  await page.getByRole("button", { name: "Sorting rules" }).click();
  const trigger = page.getByRole("button", { name: "Delete Client invoices" });
  await trigger.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Delete rule" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Keep rule" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Delete rule" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("@claim:desktop-sample-project loads an in-memory first-run sample", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string) => Promise<unknown> } }).__TAURI_INTERNALS__ = {
      invoke: async (command) => {
        if (command === "get_snapshot") return { settings: null, rules: [], audit: [], archivedCount: 0, duplicateCount: 0 };
        if (command === "load_sample_project") return { settings: null, rules: [{ id: "sample", name: "Northstar invoices (sample)", subjectContains: "invoice", senderContains: "northstar.example", mailbox: "Sample inbox", enabled: true }], audit: [{ id: -1, occurredAt: "2026-03-02T09:00:00Z", subject: "Invoice #1042", threadKey: "original", pdfHash: "7dc0", outcome: "archived", detail: "First PDF in this RFC message thread. No mailbox was contacted." }], archivedCount: 1, duplicateCount: 2 };
        throw new Error(`Unexpected command: ${command}`);
      }
    };
  });
  await page.goto("http://127.0.0.1:4174");
  await page.getByRole("button", { name: "Load sample project" }).click();
  await expect(page.getByRole("heading", { name: "A receipt for every decision" })).toBeVisible();
  await expect(page.locator("#stat-archived")).toHaveText("1");
  await expect(page.locator("#stat-skipped")).toHaveText("2");
  await expect(page.locator("#audit-list").getByText("No mailbox was contacted.")).toBeVisible();
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

test("mobile standalone controls are 44px and essential copy is at least 16px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("details summary").click();
  const landingControls = page.locator(".site-header .site-brand, .header-download, .hero-actions a, .platform-links a, details summary, .code-line button, .price-grid a, .restore button, footer nav a");
  for (let index = 0; index < await landingControls.count(); index += 1) {
    const box = await landingControls.nth(index).boundingBox();
    expect(box, `landing control ${index} has a box`).not.toBeNull();
    expect(box!.height, `landing control ${index} height`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `landing control ${index} width`).toBeGreaterThanOrEqual(44);
  }
  for (const selector of [".action-note", ".hero-facts", ".release-note", ".hero-art figcaption", ".walkthrough-frames figcaption", "footer"]) {
    expect(await page.locator(selector).first().evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)), selector).toBeGreaterThanOrEqual(16);
  }

  await page.goto("/demo/");
  const demoControls = page.locator(".demo-banner button, .demo-banner a");
  for (let index = 0; index < await demoControls.count(); index += 1) {
    const box = await demoControls.nth(index).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test("desktop app controls remain touch-sized and readable at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:4174");
  for (const view of ["Mailboxes", "Sorting rules", "Activity", "Plus"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    const dimensions = await page.locator("button:visible, input:visible, select:visible, a:visible").evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { label: node.getAttribute("aria-label") || node.textContent?.trim() || node.getAttribute("id"), width: box.width, height: box.height };
    }));
    for (const item of dimensions) {
      expect(item.height, `${view}: ${item.label} height`).toBeGreaterThanOrEqual(44);
      expect(item.width, `${view}: ${item.label} width`).toBeGreaterThanOrEqual(44);
    }
  }
  for (const selector of [".section-intro", ".sample-project p", ".privacy-strip p", ".legal-note", ".nav-button"]) {
    expect(await page.locator(selector).first().evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)), selector).toBeGreaterThanOrEqual(16);
  }
});
