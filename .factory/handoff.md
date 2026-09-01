# Reminder Mailroom repair 4 handoff

## Outcome

All product-owned findings in verifier report commit `7f67e2d493d86bb67057ec9b63fab455a9774cd2` for candidate `805eb72ac52906c4191dc5707d03cc5a902a4951` are repaired. The Tauri 2 desktop artifact and static-site deployment classes are unchanged.

The repair was committed as `40d0421` and pushed to `origin/main`. `dist/site` was deployed to the existing `sf-reminder-mailroom` Static Web App. No shared app, database, key vault, DNS, billing configuration, or unrelated resource was read or changed.

The controller explicitly excluded the operator-gated checkout 404. The landing site and desktop app still show **Checkout is being enabled** as a disabled status, contain no checkout URL, and keep existing license restore available.

## Reproduction before repair

The exact failures were reproduced before product code changed:

- A route-metadata regression expected description, canonical, Open Graph, and Twitter fields. `/demo/`, `/privacy/`, and `/terms/` returned no Open Graph or Twitter fields. The 404 also lacked description and canonical metadata.
- A walkthrough regression measured readable dark-pixel coverage in the app-content crop. The old setup capture measured `0.023291`, below the `0.03` floor; the rules and activity frames were visibly captured during the 180 ms opacity transition.
- `npm run lint` invoked Clippy with `-D warnings` and failed on the two reported `needless_borrow` diagnostics at `src-tauri/src/desktop.rs:794`.

## Repairs and regression coverage

- Added route-specific canonical, Open Graph, and Twitter metadata to demo, Privacy, Terms, and the designed 404. All use the existing original 1200 × 630 product social card.
- Replaced all three walkthroughs with real 1280 × 800 app captures. Rules and activity now show the bundled Northstar sample instead of an empty or transparent transition frame.
- Added `npm run capture:walkthroughs`. The deterministic Playwright capture waits for opacity, transform, and active animations to settle before writing each frame.
- Added Playwright coverage for the complete metadata matrix on all four non-landing pages and for dimensions plus readable content coverage in every walkthrough asset.
- Removed the redundant Rust borrows. `npm run lint` now includes `cargo clippy --all-targets --all-features -- -D warnings`, so the warning cannot return unnoticed.
- Recorded the capture method and provenance in `.factory/design.md` and the developer commands in `README.md`.

Live walkthrough crop ratios are `0.041033` (setup), `0.043789` (rules), and `0.053511` (activity), all above the regression floor.

## Clean local verification

The following ran after a clean `npm ci`:

```sh
npm test
npm run test:native
npm run test:e2e
npm run test:installer
npm run test:installer:windows
npm run typecheck
npm run lint
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm run build
```

Results:

- Clean install: 167 packages, 0 vulnerabilities.
- Vitest: 7 passed; reduced Rust core: 3 passed; full native Rust: 15 passed.
- Playwright: 21 passed at desktop and 390 px, including keyboard, focus, dialog, 200% text, light/dark, privacy, offline reload, and service-worker update checks.
- Claims: all 23 commands passed independently; all 23 `@claim:` tags occur exactly once.
- POSIX and PowerShell installer consumer fixtures passed.
- TypeScript, ESLint, strict Clippy, Rust formatting, and `git diff --check` passed. Clippy reports no product warnings.
- Production build created `dist/app` and `dist/site`. Initial site JavaScript is at most 3.85 KB raw / 1.72 KB gzip; CSS is at most 17.22 KB raw / 4.44 KB gzip. Loaded font files remain 92.08 KB, and the mobile hero is 14.89 KB.
- `verify-url.sh` passed landing, demo, Privacy, Terms, and 404 locally: HTTP 200 for direct artifacts, one `h1`, `lang=en`, a main landmark, complete alt text, labeled buttons, and no console errors.
- Standalone axe-core 4.10.3 found 0 violations on all five local pages.
- Local mobile Lighthouse: Performance 99, Accessibility 100, Best Practices 100, SEO 100; FCP/LCP 1.7 s, total blocking time 0 ms, CLS 0.
- The SWA 2.0.10 emulator confirmed the `/demo` redirect, designed 404 rewrite, 30-second HTML/service-worker revalidation, one-year immutable asset caching, and the configured CSP, permissions, referrer, MIME, and frame policies.

Local browser evidence is under `.factory/evidence/repair-4/local/`.

## Deployment and live verification

SWA CLI 2.0.10 deployed `dist/site` to production using only the exact `sf-reminder-mailroom` resource. The generated endpoint was `https://gray-cliff-0e617dd10.7.azurestaticapps.net`; the public identity remains <https://reminder-mailroom.sociobot.in/>.

- `/`, `/demo/`, `/privacy/`, and `/terms/` return 200. An unknown route returns the designed page with HTTP 404. `robots.txt`, `sitemap.xml`, `sw.js`, and both installer scripts return 200.
- Live landing, demo, Privacy, and Terms HTML hashes match `dist/site` byte-for-byte. The live 404 hash is `7c4eeef265d18454a22a572db99cdf56b55a5c62055812281a7dc51ed55f6182`, also identical to the build.
- Live walkthrough hashes match the build: setup `a25ffe8fa84dab6f8cbd390535a83bc8fe8f554bd5885158446d3bb668a7759e`, rules `927c31a892e0ce1008ac195c0acd44d0eda7f41f58b177b08aec94f63e756957`, activity `0b350c796c355f24a5fc2f141be66ebe79aba55da86df305dbbdea55fbdb87ff`.
- Route-specific metadata passed on demo, Privacy, Terms, and a real 404 response. The landing and all normal routes had 0 console errors; the unavailable checkout remained a disabled status with zero checkout links.
- `verify-url.sh` passed all four live 200 routes. Standalone axe-core found 0 violations across landing, demo, Privacy, Terms, and the live 404.
- A fresh live demo archived one invoice, skipped two reminders, made same-origin requests only, and reloaded successfully offline.
- Live responses include CSP, HSTS, Permissions-Policy, Referrer-Policy, `nosniff`, and frame denial. HTML and `sw.js` revalidate after 30 seconds; walkthrough assets use one-year immutable caching.
- Live mobile Lighthouse: 100 Performance, 100 Accessibility, 100 Best Practices, 100 SEO; FCP/LCP 1.4 s, total blocking time 0 ms, CLS 0, 120 KiB transfer.
- All crawled live internal and GitHub download links returned 200 or the expected GitHub 302 download response.

Live browser evidence is under `.factory/evidence/repair-4/live/`.

## Release package verification

The desktop behavior and package inputs did not change; the Rust edit removes redundant references only. The existing v0.3.0 release remains the current package release and contains AppImage, DEB, RPM, MSI, EXE, Intel and Apple silicon DMGs, `SHA256SUMS`, and `latest.json`.

The downloaded Debian consumer artifact reports package `reminder-mailroom`, version `0.3.0`, architecture `amd64`. Its SHA-256 is `a9be293c5e571ec1d76163b7121b8d8c66dad4ad4b2e1d4461851c3a0715cc46`, matching the published checksum.

## Known external gaps

- New checkout remains operator-gated. Per controller direction, this repair did not query or modify the checkout service and did not add a dead purchase action.
- macOS and Windows packages remain unsigned until the operator supplies signing credentials.
- `imap-proto 0.10.2` still emits Cargo's upstream future-incompatibility notice. Strict Clippy passes with no Reminder Mailroom warning.
