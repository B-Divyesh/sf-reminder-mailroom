import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { preview } from "vite";

const outputDirectory = resolve("public/assets");
const sample = {
  settings: null,
  rules: [{
    id: "sample-northstar",
    name: "Northstar invoices (sample)",
    subjectContains: "invoice",
    senderContains: "northstar.example",
    mailbox: "Sample inbox",
    enabled: true,
  }],
  audit: [
    { id: -3, occurredAt: "2026-03-02T09:00:00Z", subject: "Invoice #1042", threadKey: "original-1042@northstar.example", pdfHash: "7dc0f0324a5e", outcome: "archived", detail: "First PDF in this RFC message thread. No mailbox was contacted." },
    { id: -2, occurredAt: "2026-03-23T09:00:00Z", subject: "Re: Payment reminder — Invoice #1042", threadKey: "original-1042@northstar.example", pdfHash: "7dc0f0324a5e", outcome: "skipped", detail: "Matched the same PDF fingerprint." },
    { id: -1, occurredAt: "2026-04-02T09:00:00Z", subject: "Final reminder: Invoice #1042", threadKey: "original-1042@northstar.example", pdfHash: "e44a901ca21b", outcome: "skipped", detail: "Matched the original RFC message thread; changed PDF was not forwarded." },
  ],
  archivedCount: 1,
  duplicateCount: 2,
};

const server = await preview({
  configFile: resolve("vite.app.config.ts"),
  preview: { host: "127.0.0.1", port: 4174, strictPort: true },
});
const browser = await chromium.launch();

async function waitForSettledView(page, name) {
  await page.waitForFunction((section) => {
    const view = document.querySelector(`[data-section="${section}"]`);
    if (!(view instanceof HTMLElement) || !view.classList.contains("active")) return false;
    const style = getComputedStyle(view);
    return style.opacity === "1" && style.transform === "none" && view.getAnimations().every((animation) => animation.playState === "finished");
  }, name);
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.addInitScript((sampleSnapshot) => {
    window.__TAURI_INTERNALS__ = {
      invoke: async (command) => {
        if (command === "get_snapshot") return { settings: null, rules: [], audit: [], archivedCount: 0, duplicateCount: 0 };
        if (command === "load_sample_project") return sampleSnapshot;
        throw new Error(`Unexpected capture command: ${command}`);
      },
    };
  }, sample);
  await page.goto("http://127.0.0.1:4174", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  await waitForSettledView(page, "setup");
  await page.screenshot({ path: resolve(outputDirectory, "app-setup-walkthrough.png"), animations: "disabled" });

  await page.getByRole("button", { name: "Load sample project" }).click();
  await page.getByRole("button", { name: "Sorting rules" }).click();
  await page.getByText("Northstar invoices (sample)").waitFor();
  await waitForSettledView(page, "rules");
  await page.screenshot({ path: resolve(outputDirectory, "app-rules-walkthrough.png"), animations: "disabled" });

  await page.getByRole("button", { name: "Activity" }).click();
  await page.locator(".audit-row").first().waitFor();
  await waitForSettledView(page, "activity");
  await page.screenshot({ path: resolve(outputDirectory, "app-activity-walkthrough.png"), animations: "disabled" });
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.httpServer.close(resolveClose));
}
