export const PRODUCT_SLUG = "reminder-mailroom";
export const BILLING_BASE = "https://api.sociobot.in/api/v1";
export const LICENSE_KEY = `sb_license:${PRODUCT_SLUG}`;
export const LICENSE_CACHE_KEY = `${LICENSE_KEY}:verdict`;
export const DAY_MS = 86_400_000;

export type LicenseVerdict = {
  valid: boolean;
  reason: "ok" | "invalid" | "expired" | "revoked" | "wrong_product" | "offline";
  checkedAt: number;
};

export function normalizeSubject(subject: string): string {
  return subject
    .toLocaleLowerCase()
    .replace(/^\s*((re|fw|fwd)\s*:\s*)+/gi, "")
    .replace(/\b(final|friendly|payment|reminder|due|overdue|past|follow[- ]?up)\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalThreadKey(subject: string): string {
  const normalized = normalizeSubject(subject);
  return normalized ? `subject:${normalized}` : `subject:unknown`;
}

export function subjectMatches(subject: string, needle: string): boolean {
  const terms = needle.split(",").map((term) => term.trim().toLocaleLowerCase()).filter(Boolean);
  const haystack = subject.toLocaleLowerCase();
  return terms.length > 0 && terms.some((term) => haystack.includes(term));
}

export function cachedLicense(storage: Pick<Storage, "getItem">, now = Date.now()): LicenseVerdict | null {
  try {
    const parsed = JSON.parse(storage.getItem(LICENSE_CACHE_KEY) ?? "null") as LicenseVerdict | null;
    if (!parsed || typeof parsed.valid !== "boolean" || typeof parsed.checkedAt !== "number") return null;
    if (now - parsed.checkedAt > DAY_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function consumeLicenseFromUrl(url: URL, storage: Pick<Storage, "setItem">): string | null {
  const token = url.searchParams.get("license")?.trim() || null;
  if (token) {
    storage.setItem(LICENSE_KEY, token);
    url.searchParams.delete("license");
  }
  return token;
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
