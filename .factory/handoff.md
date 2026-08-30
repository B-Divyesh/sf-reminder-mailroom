# Reminder Mailroom verification handoff — FAIL

## Independent verification 3

**Decision: FAIL. Do not release candidate `819de0b9569e68e9f76ff1455fa40a1a1b4005d1`.**

The clean candidate passes all 12 declared claim commands, all unit/native/browser tests, TypeScript checking, installer verification, and the exact production build. The cold live page and one-click isolated demo pass. The deployed static files match `dist/site` byte-for-byte, live axe scans have no serious/critical findings, and mobile Lighthouse scores 100 in all four categories.

Release blockers remain:

- the live site downloads v0.2.0 packages built from pre-repair commit `66a113a`, not the candidate; those packages omit the scan lock, RFC thread fix, delete-dialog fix, and installed sample;
- `https://api.sociobot.in/api/v1/products/reminder-mailroom/checkout` returns HTTP 404;
- candidate thread sorting can process a chained reminder before its original and archive the wrong PDF;
- candidate dry-run previews do not account for earlier messages in the same scan;
- material privacy/safety/purchase claims are not represented by one observable claim test;
- standalone mobile controls are as small as 36–42 px, and important copy is 12–15 px.

Full commands, measurements, response evidence, defect explanations, and required repairs are in [`.factory/verification-3.md`](verification-3.md).

The license verification endpoint did enforce a limit: 30 requests succeeded and request 31 returned 429 with `Retry-After: 3`. No product code was changed. The verifier changed only this handoff and the new verification report.

---

# Prior repair handoff

## Repair scope

Repaired the independent verifier findings from `a4fd0bb3edabf689a24218efe12f21314b8f1a93` while retaining the Tauri 2 desktop app and static landing-site deployment.

- Canonical identity now uses RFC `In-Reply-To`/`References`/`Message-ID` values, never a normalized subject. Separate same-subject invoices, recurring invoices, reply chains, changed PDFs, and the 500-message boundary have native regressions.
- The full native scan is guarded by one process-wide mutex, so manual and timed scans cannot interleave a lookup and SMTP delivery.
- The installed first-run app now has **Load sample project**. It returns the three-message Northstar sample in memory and does not alter real local storage or contact a mailbox. The landing page includes three captioned, original app walkthrough captures.
- Fixed the delete alertdialog’s Tab/Shift+Tab trap, Escape close, and focus return.
- Fixed dark-mode contrast and accessible mobile home names across landing, Privacy, Terms, and 404. Browser coverage now scans each public route at 390 px in both themes.
- Replaced GNU-only macOS `find` use in `install.sh`, added an isolated checksum execution test, and run it in Linux/macOS release jobs. The Windows installer gets an equivalent PowerShell fixture in its release job.
- Added claims for native thread identity, concurrent scan safety, installed sample data, and installer checksum verification. Added the required first-screen privacy/offline/price facts.

## Verification

Executed after `npm ci`:

```sh
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npx tsc --noEmit
npm run test:installer
npm run test:e2e
npm run build
```

Results: 6 Vitest + 3 no-default-feature Rust tests, 9 native Rust tests, 15 Playwright tests, and production build all pass. Every command in `.factory/claims.json` was run independently after the clean install. The site’s browser suite includes offline reload, service-worker update, desktop/mobile keyboard paths, and public-route axe scans. `verify-url.sh` against the final local production preview reported HTTP 200, no console errors, title/lang, one h1, main landmark, and no missing image alt text. Evidence is in `.factory/evidence/repair-2/`.

Mobile Lighthouse against that preview: Performance **99**, Accessibility **100**, SEO **100**, LCP **1.7 s**, CLS **0**. The standalone `@axe-core/cli` could not start its Selenium Chrome binary in this worker; the repository’s Playwright axe integration ran successfully instead.

The native toolchain emits the existing upstream `imap-proto 0.10.2` future-incompatibility warning; no current test or build fails because of it.

## Billing registration

The repository correctly links the required Sociobot checkout and verifies licenses, but the verifier’s live 404 is an external product-registration state. No billing-provisioning script or credential is present in this repository or worker environment, and the work order prohibits reading or changing non-`sf-reminder-mailroom` resources. The checkout registration therefore remains operator/factory work outside this code repair; do not represent a release as purchase-verified until the registered product endpoint returns the hosted checkout flow.

## Deployment

Committed and pushed as `02a60a0ce579b74db8355f80a3c9fa0c1b336644` (`fix: repair mailroom release blockers`). Deployed `dist/site` to the existing `sf-reminder-mailroom` Static Web App on 2026-08-30. The deployment completed successfully as `0256519b-a25f-40ec-9a6b-8ff71cc1e30d`; the live HTTPS URL returned 200. `verify-url.sh` on the live URL found no console errors and passed title/lang/main/alt checks. Live evidence is in `.factory/evidence/repair-2-live/`.

## Operator follow-up

- Register/enable the existing `reminder-mailroom` one-time product in the Sociobot billing engine, then verify the hosted checkout response before release.
- Provide Apple and Windows signing certificates if signed desktop packages are required. The release workflow deliberately ships unsigned builds until those credentials are supplied.
