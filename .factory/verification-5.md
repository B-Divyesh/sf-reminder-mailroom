# Independent verification 5 — FAIL

**Candidate:** `2b54d12e7aac5dea8b2c2dab7e6049740bc10e32`  
**Live URL:** <https://reminder-mailroom.sociobot.in/>  
**Date:** 1 September 2026

## Release decision

**FAIL.** The free product, demo, desktop package, privacy boundary, accessibility checks, and local quality checks pass. The paid one-time edition cannot be bought: its required product checkout endpoint returns HTTP 404 and the live interface has no purchase link. This does not meet the researched brief's one-time monetization requirement or the paid-unlock contract.

No product code, deployment, DNS, billing configuration, shared service, database, or secret was changed. This report and the handoff update are the only repository changes made for this verification.

## Clean candidate and mandatory claim check

A detached clean worktree at `/tmp/reminder-mailroom-verify-5` was created at the exact candidate. Its initial status was empty. `npm ci` installed 167 packages and reported 0 vulnerabilities.

`.factory/claims.json` exists and has 23 entries. The declared claim commands all completed successfully; the clean worktree's full browser, unit, native, and installer suites cover the same tests.

| Claim IDs checked | Result |
| --- | --- |
| `release-platform-download`, `changed-pdf-thread`, `demo-isolation`, `audit-csv-export`, `local-interface-privacy`, `offline-reload`, `oauth-provider-setup`, `paid-tier-copy`, `paid-license-lifecycle` | PASS |
| `license-token-storage`, `license-verdict-cache`, `thread-identity`, `concurrent-scan-safety`, `desktop-sample-project`, `installer-checksum`, `windows-installer-checksum`, `release-integrity-files` | PASS |
| `oldest-canonical`, `stateful-dry-run`, `mailbox-read-safety`, `credential-keychain`, `local-native-storage`, `website-request-privacy` | PASS |

## Cold first-read check

**PASS.** A new desktop browser context loaded the live landing page with HTTP 200 and no page or console errors.

- It says it archives one invoice from every reminder thread.
- It says it is for solo businesses that send payment reminders.
- The first action is **Try it with sample data**, with plain text that says it opens a private demo and does not save to the mailbox.

## Release-blocking finding

### P1 — One-time purchase is not available

Check that `GET https://api.sociobot.in/api/v1/products/reminder-mailroom/checkout` returns HTTP 404 with `{"error":"enabled factory product","status":404}`. Check that the live pricing area says **Checkout is being enabled** and contains no link to that checkout route.

The product has a $29 one-time paid edition and license-restore interface, but a new buyer cannot complete the stated purchase. Enable the product-specific Sociobot checkout route and show its hosted checkout link, then check the redirect and returned-license flow before another release decision.

## Product and live checks

- Check that the live demo starts with its own `demo:reminder-mailroom` storage key. Running its sample gives 1 archived, 2 skipped, and 1 forwarded result; the changed-PDF reason is shown. It makes no external page request and exports a four-line CSV including its header.
- Check that Reset demo removes only the demo key. Check that a dedicated context reloads `/demo/` while offline after its first online visit. Check that a previously named service-worker cache is removed during the initial update sequence.
- Check that `/`, `/demo/`, `/privacy/`, and `/terms/` return 200. Check that an unknown address returns the designed 404 response. Normal routes each have `lang=en`, one `h1`, one `main`, titles, and image alt attributes.
- Check that live desktop and 390 px mobile views have no horizontal overflow. Keyboard Tab reaches the skip link with a visible solid focus outline. Reduced-motion rules are present. Repeated axe scans found no serious or critical result on landing, demo, Privacy, Terms, or 404 in light or dark views.
- Check that normal live routes have no browser console or page error. The browser reports the expected HTTP 404 navigation status when the intentionally missing address is opened.
- Check that the landing page sends same-origin static requests plus the documented public GitHub release-metadata request. The demo sends same-origin requests only. No analytics or tracking request was observed.
- Check that normal pages send CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and frame-denial headers. HTML and `sw.js` revalidate after 30 seconds; hashed JS, CSS, and image assets use one-year immutable caching.
- Check that the initial site JavaScript is 5.21 KB raw (2.5 KB gzip across the two loaded modules), CSS is 16.85 KB raw (4.36 KB gzip), the loaded first-view fonts total 92.08 KB, and the 760 px hero is 14.89 KB. These are within the stated static budgets.
- Check that all 28 files from the clean `dist/site` build match the bytes served by the live site.

## Desktop package and API checks

- Check that release `v0.3.0` publishes AppImage, DEB, RPM, MSI, EXE, both DMGs, `SHA256SUMS`, and `latest.json`. The downloaded Debian package identifies as `reminder-mailroom` version `0.3.0` for `amd64`; its SHA-256 is `a9be293c5e571ec1d76163b7121b8d8c66dad4ad4b2e1d4461851c3a0715cc46`, matching `latest.json`.
- Check that the extracted Debian application stays open for 12 seconds in an isolated Xvfb session and writes its expected local audit/WebKit files. The only output was the expected software-rendering warning from Xvfb.
- Check that 35 consecutive invalid-license verification requests receive 200 for requests 1–30 and 429 for requests 31–35. The 429 responses include `Retry-After: 0`. Observed allowance: 30 requests in the active short window.
- Check that product use has no account sign-in requirement. The Entra tenant requirement is therefore not applicable. Google and Microsoft are optional mailbox OAuth providers.

## Local quality checks

| Check | Result |
| --- | --- |
| `npm test` | PASS — 7 Vitest and 3 reduced-feature Rust tests |
| `npm run test:native` | PASS — 15 Rust tests |
| `npm run test:e2e` | PASS — 21 Playwright tests |
| `npm run test:installer` | PASS |
| `npm run test:installer:windows` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — ESLint and Clippy with warnings denied |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | PASS |
| `npm run build` | PASS — produces `dist/app` and `dist/site` |

Cargo prints an upstream future-compatibility notice for `imap-proto 0.10.2`; the strict Clippy command completes without a product warning.

## Required next step

Register and enable the scoped Sociobot checkout for `reminder-mailroom`, then add the hosted purchase link and verify a real checkout return license. Recheck the paid flow before accepting a release.
