# Independent verification 4 — FAIL

**Candidate:** `805eb72ac52906c4191dc5707d03cc5a902a4951` (`main`)

**Live URL:** <https://reminder-mailroom.sociobot.in/>

**Date:** 1 September 2026

**Role:** independent product verifier

## Release decision

**FAIL. Do not release this candidate as the complete paid product.**

The free desktop workflow, demo, published installers, privacy boundary, accessibility, performance, and live static deployment all pass. The remaining release blocker is commercial availability: the brief specifies a one-time purchase, but the live product has no purchase link and its product-specific checkout route still returns HTTP 404. The page explains the unavailable state honestly, but that does not satisfy the paid-unlock acceptance contract.

No product code was changed during verification. QA evidence and this report are the only intentional repository additions. No out-of-scope service, database, vault, infrastructure, DNS, or billing configuration was read or changed.

## Mandatory preflight

### Clean candidate

A detached worktree at the exact candidate was used:

```text
/tmp/reminder-mailroom-clean-805eb72
HEAD 805eb72ac52906c4191dc5707d03cc5a902a4951
git status --short: empty
```

`npm ci` installed 167 packages with 0 reported vulnerabilities. The documented Linux Tauri packages and PowerShell 7.6.5 were installed in the disposable worker before native and Windows-script checks.

### Claim gate

`.factory/claims.json` exists. It contains 23 entries, and every claim ID occurs exactly once as an `@claim:<id>` tag. Every listed command passed independently in the detached clean worktree.

| Claim | Result |
| --- | --- |
| `release-platform-download` | PASS — 1 Playwright check |
| `changed-pdf-thread` | PASS — 1 Playwright check |
| `demo-isolation` | PASS — 1 Playwright check |
| `audit-csv-export` | PASS — 1 Playwright check |
| `local-interface-privacy` | PASS — 1 Playwright check |
| `offline-reload` | PASS — 1 Playwright check |
| `oauth-provider-setup` | PASS — 1 Playwright check |
| `paid-tier-copy` | PASS — 1 Playwright check |
| `paid-license-lifecycle` | PASS — 1 Playwright check |
| `license-token-storage` | PASS — 1 Vitest check |
| `license-verdict-cache` | PASS — 1 Vitest check |
| `thread-identity` | PASS — 1 native Rust check |
| `concurrent-scan-safety` | PASS — 1 native Rust check |
| `desktop-sample-project` | PASS — 1 Playwright check |
| `installer-checksum` | PASS — POSIX fixture |
| `windows-installer-checksum` | PASS — PowerShell fixture |
| `release-integrity-files` | PASS — 1 Vitest check |
| `oldest-canonical` | PASS — 1 native Rust check |
| `stateful-dry-run` | PASS — 1 native Rust check |
| `mailbox-read-safety` | PASS — 1 native Rust check |
| `credential-keychain` | PASS — 1 native Rust check |
| `local-native-storage` | PASS — 1 native Rust check |
| `website-request-privacy` | PASS — 1 Playwright check |

The exact command results are saved in [`claims-summary.tsv`](evidence/verification-4/claims-summary.tsv).

### Cold first-read check

**PASS.** A fresh 1440 × 900 browser context opened the live page with HTTP 200 and no console or page errors.

- What it does: “Archive one invoice from every reminder thread.”
- Who it serves: “For solo businesses that send payment reminders…”
- First action: “Try it with sample data.”
- One click opens `/demo/`, which immediately shows three realistic invoice messages and a visible run action.
- The first screen also states the sample privacy boundary, offline behavior, and $29 one-time price.

## Findings by severity

### P1 — The one-time paid edition cannot be purchased

Fresh checks confirmed both sides of the current state:

- The live pricing panel shows **“Checkout is being enabled”** as a disabled element.
- No link to `/products/reminder-mailroom/checkout` exists on the live page or in the desktop Plus view.
- `GET https://api.sociobot.in/api/v1/products/reminder-mailroom/checkout` returned HTTP 404 with `{"error":"enabled factory product","status":404}`.

The brief specifies one-time monetization, and the paid-unlock contract requires a working hosted checkout link. Register and enable this product-specific route, restore the buy link, and add a live redirect check before release. Existing license restore remains functional in deterministic checks.

### P2 — Social-card metadata is missing outside the landing route

The landing page has canonical, Open Graph, and Twitter metadata. `/demo/`, `/privacy/`, and `/terms/` have titles, descriptions, and canonical URLs but no Open Graph or Twitter card fields. The designed 404 has neither a description nor a canonical URL and also lacks social-card fields. Add route-appropriate metadata or document a narrower metadata policy.

### P3 — Walkthrough captures are visibly faded

The three landing-page walkthrough images appear to have been captured during the 180 ms view-entry state. The rules and activity content is particularly faint, which reduces their value as visual instructions. The captions remain readable and the live product itself has passing contrast. Recapture the images after the view settles.

### P3 — Strict Rust lint reports two style warnings

`cargo clippy --all-targets --all-features` exits successfully but reports two `needless_borrow` warnings at `src-tauri/src/desktop.rs:794`. The required test, type, lint, formatting, and build commands still pass.

## End-to-end product checks

### Browser demo

An independent live harness completed 87/87 checks across 1440 px and 390 px, light and dark color schemes.

- One click from the landing page opened the sample workspace.
- Running the sample produced 1 archived invoice, 2 skipped reminders, and 1 forwarded message.
- The changed-PDF reminder was identified as the same invoice thread.
- CSV export produced `reminder-mailroom-demo-audit.csv`, the expected header, and three decision rows.
- Reset removed only `demo:reminder-mailroom`, preserved a separate sentinel key, reset the counts, and returned focus to **Run sample sort**.
- Starting for real removed the demo state and opened the download section.
- Direct demo use made only same-origin requests.
- An offline reload returned the demo after an online visit.
- A newly installed service worker removed a prior versioned cache.

### Desktop webview and native core

An independent Tauri-bridge fixture completed 20/20 desktop UI checks at 390 px in dark mode. Native behavior was separately covered by 15 Rust checks.

- The in-memory Northstar sample displayed one archive and two skipped reminders without a mailbox call.
- An invalid email was stopped by browser validation before a native save request.
- A 201-character rule name returned a clear boundary error; correcting it saved the rule.
- Mailbox-save, SMTP-connection, and archive-delivery errors remained recoverable on retry.
- Password fields cleared only after a successful save.
- The free one-rule limit opened the Plus explanation.
- Escape closed the delete confirmation and returned focus to its trigger.
- Preview stated that no mail was forwarded; the later successful sort updated the audit.
- Offline mode kept saved rules and activity available and explained what required a connection.
- The desktop webview made no external request while these local views were used.

Native checks confirmed oldest-UID ordering, linked RFC replies, separate same-subject invoices, changed PDFs, stateful previews, one concurrent scan, read-only IMAP planning, credential-store boundaries, local JSON/SQLite persistence, retryable delivery errors, OAuth endpoint and XOAUTH2 configuration, comma-separated subject terms, and the newest-500-message boundary.

## Accessibility, responsive behavior, and runtime quality

- Independent Playwright axe checks found 0 serious or critical findings on landing, demo, Privacy, Terms, and 404 routes at desktop and 390 px in light and dark modes.
- The desktop webview also had 0 serious or critical findings at 390 px in dark mode.
- Every checked route has `lang=en`, one `h1`, one `main`, and complete image alt attributes.
- Keyboard use reached the skip link first, showed a 3 px focus indicator, and moved focus to the main landmark.
- Reduced motion limited animation and transition durations to 0.01 ms and disabled smooth scrolling.
- All measured standalone mobile controls were at least 44 × 44 CSS px.
- The landing and desktop webview had no horizontal overflow at 390 px; the landing remained usable at 200% text.
- No console or page errors occurred during normal live routes and product flows.
- The supplied `verify-url.sh` passed the live landing and demo. Captures and JSON are under [`.factory/evidence/verification-4/live`](evidence/verification-4/live/).

## Privacy, headers, caching, and performance

- The cold landing requested same-origin assets plus the documented public GitHub release metadata endpoint. No analytics, advertising, or tracking request appeared.
- Direct demo and desktop-webview checks made no external requests.
- The live response includes CSP, HSTS, Permissions-Policy, Referrer-Policy, `nosniff`, and frame denial.
- `/`, `/demo/`, `/privacy/`, `/terms/`, and the designed 404 use `Cache-Control: public, must-revalidate, max-age=30`.
- `sw.js` also revalidates after 30 seconds. Hashed JS/CSS assets use one-year immutable caching.
- All 28 served files matched the detached candidate build byte-for-byte. The candidate has no product or release-input changes after the v0.3.0 source commit; later commits contain only QA evidence, handoff, and repository-analysis files.
- Initial mobile resources measured 2,397 encoded bytes of JavaScript, 4,498 bytes of CSS, 92,080 bytes of loaded fonts, and a 14,892-byte hero image.
- Mobile Lighthouse: Performance 98, Accessibility 100, Best Practices 100, SEO 100; FCP 1.4 s, LCP 1.4 s, total blocking time 160 ms, CLS 0, total transfer 119 KiB.

## Release and install checks

- GitHub Actions run `33548846280` completed successfully for Linux, Windows, macOS Intel, and macOS Apple silicon.
- Release v0.3.0 publishes AppImage, DEB, RPM, MSI, EXE, two DMGs, `SHA256SUMS`, and `latest.json`.
- `latest.json` is valid and records source commit `214603375c4f3c76bf9ee0b38db72df84144f522` plus six platform package entries.
- The downloaded Debian package SHA-256 was `a9be293c5e571ec1d76163b7121b8d8c66dad4ad4b2e1d4461851c3a0715cc46`, exactly matching the manifest and `SHA256SUMS`.
- The package reports `reminder-mailroom`, version 0.3.0, architecture amd64.
- Its executable remained open for a 12-second isolated Xvfb smoke check and created only its expected local SQLite/WebKit files; no app error was reported.
- The live Linux, Windows, and macOS download actions point to real v0.3.0 assets. Link checks returned 200 or the expected GitHub 302 download response.

## API allowance and authentication

The product has no product-owned HTTP backend. Existing license verification is the only product-specific API call made by the app. One client received 30 consecutive HTTP 200 invalid-license responses; request 31 returned HTTP 429 with `Retry-After: 4`. Observed allowance: **30 requests per active short window**.

Product use does not require account sign-in, so the Sociobot Entra tenant requirement is not applicable. Google and Microsoft OAuth are optional mailbox-connection methods, not product accounts.

## Clean quality gates

| Check | Result |
| --- | --- |
| `npm ci` | PASS — 167 packages, 0 vulnerabilities |
| All 23 claim commands | PASS |
| `npm test` | PASS — 7 Vitest and 3 reduced-feature Rust checks |
| `npm run test:native` | PASS — 15 Rust checks |
| `npm run test:e2e` | PASS — 19 Playwright checks |
| `npm run test:installer` | PASS |
| `npm run test:installer:windows` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | PASS |
| `npm run build` | PASS — produced `dist/app` and `dist/site` |

The clean command summary is saved in [`quality-summary.tsv`](evidence/verification-4/quality-summary.tsv).

## Required work before re-verification

1. Enable the product-specific hosted checkout, add the purchase link required by the paid-unlock contract, and confirm its redirect and return flow.
2. Add route-specific social metadata to the non-landing pages.
3. Recapture the walkthrough images after the view-entry transition finishes.
4. Optionally remove the two Rust lint warnings and update `imap-proto` when an upstream-compatible release is available.
