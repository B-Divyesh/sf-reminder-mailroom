import "./styles.css";
import { BILLING_BASE, LICENSE_CACHE_KEY, LICENSE_KEY, PRODUCT_SLUG, consumeLicenseFromUrl } from "../app/core";

type ReleaseAsset = { name: string; browser_download_url: string };
type Release = { tag_name: string; assets: ReleaseAsset[] };
const releaseApi = "https://api.github.com/repos/B-Divyesh/sf-reminder-mailroom/releases/latest";
const fallback = "https://github.com/B-Divyesh/sf-reminder-mailroom/releases/latest";
const RELEASE_CACHE_KEY = "reminder-mailroom:release:v1";
const RELEASE_CACHE_MS = 3_600_000;

declare global { interface Navigator { userAgentData?: { getHighEntropyValues(keys: string[]): Promise<{ architecture?: string }> } } }

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

async function latestRelease(): Promise<Release> {
  try {
    const cached = JSON.parse(localStorage.getItem(RELEASE_CACHE_KEY) ?? "null") as { checkedAt: number; release: Release } | null;
    if (cached && Date.now() - cached.checkedAt < RELEASE_CACHE_MS) return cached.release;
  } catch { localStorage.removeItem(RELEASE_CACHE_KEY); }
  const response = await fetch(releaseApi, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error("No release yet");
  const release = await response.json() as Release;
  localStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), release }));
  return release;
}

async function loadDownloads() {
  const primary = document.querySelector<HTMLAnchorElement>("#primary-download")!;
  const button = document.querySelector<HTMLAnchorElement>("#download-button")!;
  const note = document.querySelector<HTMLElement>("#release-note")!;
  try {
    const release = await latestRelease();
    const find = (...patterns: RegExp[]) => release.assets.find(({ name }) => patterns.every((pattern) => pattern.test(name)));
    const assets: Record<string, { asset?: ReleaseAsset; label: string }> = {
      linux: { asset: find(/\.AppImage$/i), label: "Linux AppImage" },
      windows: { asset: find(/\.(msi|exe)$/i), label: "Windows" },
      macos_arm64: { asset: find(/\.dmg$/i, /(aarch64|arm64)/i), label: "macOS Apple silicon" },
      macos_x64: { asset: release.assets.find(({ name }) => /\.dmg$/i.test(name) && !/(aarch64|arm64)/i.test(name)), label: "macOS Intel" }
    };
    const key = await platformKey();
    const selected = assets[key]?.asset ? assets[key] : Object.values(assets).find(({ asset }) => asset);
    if (!selected?.asset) throw new Error("Installers are not published yet");
    primary.href = button.href = selected.asset.browser_download_url;
    primary.textContent = button.textContent = `Download ${selected.label}`;
    note.textContent = `${release.tag_name} · checksums published with every installer`;
    const map: Record<string, string[]> = { macOS: ["macos_arm64", "macos_x64"], Windows: ["windows"], Linux: ["linux"] };
    document.querySelector("#platform-links")!.innerHTML = Object.entries(map).map(([label, keys]) => {
      const asset = keys.map((item) => assets[item]?.asset).find(Boolean);
      return `<a href="${asset?.browser_download_url ?? fallback}">${label}</a>`;
    }).join("");
  } catch {
    primary.href = button.href = fallback;
    note.textContent = "Downloads are being published — view the release page.";
  }
}

async function verify(token: string) {
  const status = document.querySelector<HTMLElement>("#license-status")!;
  status.textContent = "Checking license…";
  try {
    const response = await fetch(`${BILLING_BASE}/products/${PRODUCT_SLUG}/verify?license=${encodeURIComponent(token)}`);
    const result = await response.json() as { valid: boolean; reason: string };
    localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify({ ...result, checkedAt: Date.now() }));
    status.textContent = result.valid ? "License verified. Paste this token into Mailroom Plus on the device you want to use." : "This license is not active. Check that you pasted the complete token.";
  } catch { status.textContent = "The license service could not be reached. Downloads and free features still work."; }
}

document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => button.addEventListener("click", async () => {
  await navigator.clipboard.writeText(button.dataset.copy!);
  const old = button.textContent;
  button.textContent = "Copied";
  setTimeout(() => button.textContent = old, 1600);
}));
document.querySelector("#verify-license")!.addEventListener("click", () => {
  const token = document.querySelector<HTMLInputElement>("#site-license")!.value.trim();
  if (token) { localStorage.setItem(LICENSE_KEY, token); void verify(token); }
});
document.querySelector<HTMLAnchorElement>(".skip-link")?.addEventListener("click", () => {
  requestAnimationFrame(() => document.querySelector<HTMLElement>("#main")?.focus());
});
const url = new URL(location.href);
const incoming = consumeLicenseFromUrl(url, localStorage);
if (incoming) { history.replaceState({}, "", url); document.querySelector<HTMLInputElement>("#site-license")!.value = incoming; void verify(incoming); }
if (location.hostname === "reminder-mailroom.sociobot.in" || url.searchParams.has("release-test")) void loadDownloads();
else document.querySelector<HTMLElement>("#release-note")!.textContent = "Preview build · release assets are linked on GitHub";
if ("serviceWorker" in navigator) window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"));
