import { describe, expect, it } from "vitest";
import { DAY_MS, LICENSE_CACHE_KEY, cachedLicense, canonicalThreadKey, consumeLicenseFromUrl, csvEscape, normalizeSubject, subjectMatches } from "../app/core";

describe("invoice identity", () => {
  it("normalizes reminder boilerplate to the original invoice subject", () => {
    expect(normalizeSubject("Re: PAYMENT REMINDER — Invoice #1042")).toBe(normalizeSubject("Invoice #1042"));
  });

  it("keeps a changed-PDF reminder in the original canonical thread", () => {
    expect(canonicalThreadKey("Final reminder: Invoice #1042")).toBe(canonicalThreadKey("Invoice #1042"));
  });

  it("treats comma-separated subject terms as alternatives", () => {
    expect(subjectMatches("March statement INV-2", "invoice, INV-")).toBe(true);
    expect(subjectMatches("A friendly hello", "invoice, INV-")).toBe(false);
  });
});

describe("license privacy and caching", () => {
  it("stores a returned token and strips it from the working URL", () => {
    const values = new Map<string, string>();
    const url = new URL("https://reminder-mailroom.sociobot.in/?license=secret-token&source=checkout");
    expect(consumeLicenseFromUrl(url, { setItem: (key, value) => values.set(key, value) })).toBe("secret-token");
    expect(url.searchParams.has("license")).toBe(false);
  });

  it("uses valid verdicts for at most one day", () => {
    const now = 2 * DAY_MS;
    const storage = { getItem: (key: string) => key === LICENSE_CACHE_KEY ? JSON.stringify({ valid: true, reason: "ok", checkedAt: now - 1000 }) : null };
    expect(cachedLicense(storage, now)?.valid).toBe(true);
    expect(cachedLicense(storage, now + DAY_MS + 1)).toBeNull();
  });
});

it("escapes exported audit values", () => {
  expect(csvEscape('Invoice "42", final')).toBe('"Invoice ""42"", final"');
});
