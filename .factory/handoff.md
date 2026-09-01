# Reminder Mailroom handoff

## Independent verification 4 outcome — FAIL

Candidate `805eb72ac52906c4191dc5707d03cc5a902a4951` was independently checked on 1 September 2026 against <https://reminder-mailroom.sociobot.in/>.

The free desktop product, sample demo, all 23 claim commands, all repository quality gates, release packages, live deployment parity, accessibility, privacy boundary, offline behavior, and performance checks pass. The candidate is not ready as the complete paid product because the one-time purchase flow is unavailable: the live page has no purchase link, and the product-specific checkout route returns HTTP 404. This conflicts with the researched one-time monetization requirement and the paid-unlock contract.

Fresh headline evidence:

- Detached clean worktree: exact candidate SHA and empty `git status`.
- Claims: 23/23 exact commands passed.
- Quality gates: `npm test`, `npm run test:native`, `npm run test:e2e`, both installer checks, typecheck, lint, Rust formatting, and `npm run build` passed.
- Live browser: 87/87 independent checks passed across desktop/mobile and light/dark modes; a separate desktop-webview exercise passed 20/20 checks.
- Lighthouse mobile: 98 Performance, 100 Accessibility, 100 Best Practices, 100 SEO; LCP 1.4 s, CLS 0.
- Deployment: all 28 served files match the clean production build byte-for-byte.
- Release: the downloaded v0.3.0 Debian package matches SHA-256 `a9be293c5e571ec1d76163b7121b8d8c66dad4ad4b2e1d4461851c3a0715cc46` and launches in an isolated Linux smoke check.
- License API allowance: 30 successful invalid-license responses; request 31 returned 429 with `Retry-After: 4`.
- Additional findings: missing social-card metadata on non-landing routes; faded walkthrough captures; two non-blocking Rust `needless_borrow` lint warnings.

Full evidence and required next steps are in [`.factory/verification-4.md`](verification-4.md). No product code was modified during verification.

## Builder repair record

## Outcome

Release-blocking findings from verifier report `5af4c694507001968c8acd9e5422133d05fd60a2` are repaired in version 0.3.0. The Tauri 2 desktop-app and static-site deployment classes are unchanged. The researched brief and visual thesis are unchanged.

The shared checkout remains operator-gated. Product pages now state that checkout is being enabled and contain no dead checkout link. Existing license restore and verification remain available. No shared billing, database, key-vault, DNS, or unrelated service resource was read or changed.

## Repairs

- Mail candidates are sorted by ascending IMAP UID before any decision. A chained reminder can no longer win because its RFC thread key sorts before the original.
- Dry-run previews keep an in-memory set of canonical thread IDs, aliases, and PDF hashes. Later messages in the same preview are now skipped without writing SQLite records.
- Duplicate messages add their RFC aliases to the saved canonical. A later reply linked only through an intermediate reminder still resolves to the original.
- Mailbox scans use read-only `EXAMINE`, server-side subject plus sender matching, and `UID BODY.PEEK[]`. They do not request flag mutations.
- Passwords and OAuth tokens now pass through an explicit operating-system credential-store boundary. Rules remain JSON; hashes and audit entries remain SQLite in the app data directory.
- The release workflow runs the full native suite on Linux, embeds the source commit in the desktop UI, publishes it in `latest.json`, requires all six packages, and generates `SHA256SUMS`.
- Privacy, safety, purchase, release-integrity, license-cache, and installer promises now have one exact `@claim:` regression each. `.factory/claims.json` contains 23 claims and 23 unique tags.
- Landing, demo, legal, and desktop controls are at least 44 CSS px at 390 px. Essential mobile copy is at least 16 px; the mobile body is 17 px.
- The unsupported future-update promise and dead checkout action were removed. Purchase copy now matches the operator-gated state.

## Reproduction and regression evidence

The two controller-required failures were added before their fixes and reproduced against the verifier candidate:

- chained chronology: expected the original PDF first but received the final reminder first;
- same-scan dry run: expected `preview, skipped` but received `preview, preview`.

The fixed regressions are `claim_oldest_canonical_chained_reminders_keep_mailbox_chronology` and `claim_stateful_dry_run_models_earlier_decisions_in_the_same_scan` in `src-tauri/src/desktop.rs`. The chronology test uses reversed fetch order and adversarial `In-Reply-To`/`References`, then proves the original hash wins and both reminders skip. The dry-run test proves one preview, one skip, and zero canonical or audit writes.

## Local verification

Executed after a clean `npm ci`:

```sh
npm test
npm run test:native
npm run typecheck
npm run lint
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm run test:installer
npm run test:e2e
npm run build
```

Results:

- Vitest: 7 passed.
- Reduced Rust core: 3 passed.
- Full native Rust: 15 passed.
- Playwright: 19 passed.
- POSIX installer consumer check: passed on Linux; the equivalent PowerShell fixture runs in the Windows release job.
- All 22 locally applicable claim commands passed independently. The Windows-only claim is enforced by the Windows release runner.
- TypeScript, ESLint, Rust formatting, JSON validation, and `git diff --check`: passed.
- Production build: `dist/app` and `dist/site` created. Largest initial site JS is 3.85 KB raw / 1.72 KB gzip; CSS is 17.22 KB raw / 4.44 KB gzip. The mobile hero is 14.89 KB.
- Local production `verify-url.sh`: landing and demo returned 200 with no console errors, one `h1`, `lang=en`, a main landmark, complete image alt attributes, and labeled buttons.
- Standalone axe-core CLI 4.10.3: 0 violations on landing and demo. Playwright axe also found no serious or critical violations across desktop, 390 px, light, and dark flows.
- Mobile Lighthouse: Performance 99, Accessibility 100, Best Practices 100, SEO 100; LCP 1.7 s, CLS 0, total blocking time 0 ms.
- Keyboard focus/skip link, dialog focus trap and return, 200% text, reduced motion, offline reload, service-worker cache update, request privacy, and 390 px touch targets all passed in Playwright.

Local browser evidence is in `.factory/evidence/repair-3/local/`.

## Release and deployment evidence

Source candidate `214603375c4f3c76bf9ee0b38db72df84144f522` was pushed to `main` and tagged with the lightweight `v0.3.0` tag. Both resolve to the same commit.

GitHub Actions run [33548846280](https://github.com/B-Divyesh/sf-reminder-mailroom/actions/runs/33548846280) completed successfully on Linux, Windows, macOS Intel, and macOS Apple silicon. The release target is the candidate SHA. Nine assets are published: two `.dmg` files, `.msi`, `.exe`, `.AppImage`, `.deb`, `.rpm`, `SHA256SUMS`, and `latest.json`. The manifest contains all six platform entries and `sourceCommit: 214603375c4f3c76bf9ee0b38db72df84144f522`.

The published `Reminder.Mailroom_0.3.0_amd64.deb` reports package version 0.3.0 and architecture amd64. Its downloaded SHA-256 is `a9be293c5e571ec1d76163b7121b8d8c66dad4ad4b2e1d4461851c3a0715cc46`, exactly matching the published checksum. Release evidence is in `.factory/evidence/repair-3/release/`.

`dist/site` was uploaded only to the existing `sf-reminder-mailroom` Static Web App with SWA CLI 2.0.10. No DNS or shared resource was touched. The live `index.html` SHA-256 is `0ad73cad18454350a62e9a68e39e62c58130613c0aa793cb0c321ec64fd9ef94`, exactly matching `dist/site/index.html`; demo, Privacy, Terms, service worker, and both installer scripts also match byte-for-byte.

Live checks after publication:

- `/`, `/demo/`, `/privacy/`, `/terms/`, `robots.txt`, `sitemap.xml`, and both installer scripts return 200; the designed missing route returns 404.
- The detected Linux action links directly to the v0.3.0 AppImage and reports that checksums are published.
- `verify-url.sh` reports no console errors on landing or demo, with correct title, language, single `h1`, main landmark, alt attributes, and button names.
- Live standalone axe-core reports 0 violations on landing and demo.
- HTML revalidates at 30 seconds; hashed assets use one-year immutable caching. CSP, HSTS, permissions policy, referrer policy, MIME sniffing protection, and frame denial are present.

Live evidence is in `.factory/evidence/repair-3/live/`.

## Known gaps and operator action

- Enable/register the shared `reminder-mailroom` checkout route in the Sociobot billing engine, then verify the hosted return flow. This work order explicitly forbids changing that shared resource.
- Provide Apple and Windows signing credentials if signed packages are required. The workflow intentionally publishes unsigned builds until certificates are supplied (`APPLE_CERTIFICATE`, `WINDOWS_CERT_PFX`, plus their passwords if the signing action is enabled).
- `imap-proto 0.10.2` emits an upstream future-incompatibility warning. Current tests and builds pass.
