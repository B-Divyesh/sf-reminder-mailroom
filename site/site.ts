import "./styles.css";
import { BILLING_BASE, LICENSE_CACHE_KEY, LICENSE_KEY, PRODUCT_SLUG, consumeLicenseFromUrl } from "../app/core";

type Asset = { url: string; sha256: string; label: string };
type Manifest = { version: string; platforms: Record<string, Asset> };
const manifestUrl = "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/latest/download/latest.json";
const fallback = "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/latest";

async function platformKey() {
  const platform = navigator.platform.toLowerCase();
  const agent = navigator.userAgent.toLowerCase();
  if (platform.includes("win") || agent.includes("windows")) return "windows";
  if (platform.includes("linux") || agent.includes("linux")) return "linux";
  if (platform.includes("mac") || agent.includes("mac")) {
    try {
      const data = navigator.userAgentData && await navigator.userAgentData.getHighEntropyValues(["architecture"]);
      return data?.architecture === "arm" ? "macos_arm64" : "macos_x64";
    } catch { return "macos_arm64"; }
  }
  return "linux";
}

declare global { interface Navigator { userAgentData?: { getHighEntropyValues(keys: string[]): Promise<{ architecture?: string }> } } }

async function loadDownloads() {
  const primary = document.querySelector<HTMLAnchorElement>("#primary-download")!;
  const button = document.querySelector<HTMLAnchorElement>("#download-button")!;
  const note = document.querySelector<HTMLElement>("#release-note")!;
  try {
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error("No release yet");
    const manifest = await response.json() as Manifest;
    const key = await platformKey(); const selected = manifest.platforms[key] ?? Object.values(manifest.platforms)[0];
    primary.href = button.href = selected.url; primary.textContent = `Download ${selected.label}`; button.textContent = `Download ${selected.label}`;
    note.textContent = `${manifest.version} · SHA-256 verified installers`;
    const map: Record<string, string[]> = { macOS: ["macos_arm64", "macos_x64"], Windows: ["windows"], Linux: ["linux"] };
    document.querySelector("#platform-links")!.innerHTML = Object.entries(map).map(([label, keys]) => {
      const asset = keys.map(k => manifest.platforms[k]).find(Boolean); return `<a href="${asset?.url ?? fallback}">${label}</a>`;
    }).join("");
  } catch { primary.href = button.href = fallback; note.textContent = "Release assets are being prepared — view the release page."; }
}

async function verify(token: string) {
  const status = document.querySelector<HTMLElement>("#license-status")!;
  status.textContent = "Checking license…";
  try {
    const response = await fetch(`${BILLING_BASE}/products/${PRODUCT_SLUG}/verify?license=${encodeURIComponent(token)}`);
    const result = await response.json() as { valid: boolean; reason: string };
    localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify({ ...result, checkedAt: Date.now() }));
    status.textContent = result.valid ? "License verified. Copy this token into Mailroom → Mailroom Plus on the device you want to unlock." : "This license is not active. Check that the complete token was pasted.";
  } catch { status.textContent = "Could not reach the license service. Your download and free features are unaffected."; }
}

document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach(button => button.addEventListener("click", async () => { await navigator.clipboard.writeText(button.dataset.copy!); const old = button.textContent; button.textContent = "Copied"; setTimeout(() => button.textContent = old, 1600); }));
document.querySelector("#verify-license")!.addEventListener("click", () => { const token = document.querySelector<HTMLInputElement>("#site-license")!.value.trim(); if (token) { localStorage.setItem(LICENSE_KEY, token); void verify(token); } });
const url = new URL(location.href); const incoming = consumeLicenseFromUrl(url, localStorage); if (incoming) { history.replaceState({}, "", url); document.querySelector<HTMLInputElement>("#site-license")!.value = incoming; void verify(incoming); }
void loadDownloads();
if ("serviceWorker" in navigator) window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"));
