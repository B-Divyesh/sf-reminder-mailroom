# Reminder Mailroom v0.2 repair handoff

## Outcome

Candidate `eeadd171808f952d8ce91c6de1f008f4d9a79c86` was reproduced from verifier base `133aa86cae3afde67244bfe32feb60ada8e88a6e` and repaired. The repair is commit `66a113a3444a33a6157abfa653ccc9147b93f4b8` on `main`, tagged `v0.2.0`. The static product is deployed at <https://reminder-mailroom.sociobot.in/>.

## Root causes and repairs

- **Claims and demo:** the candidate had neither a claims contract nor an isolated demo. `.factory/claims.json` now declares eight deterministic claims, each with exactly one tagged Playwright test. `/demo/` starts with a realistic original invoice, same-PDF reminder, and changed-PDF final reminder. It uses only `demo:reminder-mailroom`, includes the persistent demo/reset/start-for-real banner, makes no external requests, works offline after first load, and exports its three audit decisions as CSV. See `.factory/demo.md`.
- **Changed-PDF deduplication:** originals used normalized subjects while replies used `In-Reply-To`, creating two identities. The native engine now uses one normalized subject identity and records Message-ID, In-Reply-To, and References as aliases in SQLite. The full fixture proves one archive and two skips across restart/persistence, including a changed PDF; SMTP errors remain retryable.
- **GitHub CORS:** the browser fetched `github.com/.../releases/latest/download/latest.json`, which is not CORS-readable. It now fetches only the CORS-enabled GitHub Releases API, derives asset links from that response, caches metadata for one hour, and degrades to the release page without an uncaught error. The CSP permits only `api.github.com` for this request.
- **OAuth-only providers:** the desktop app now implements OAuth 2 Authorization Code with PKCE and a loopback redirect for Google and Microsoft. It stores access/refresh tokens in the OS keychain, refreshes expired access tokens, and authenticates IMAP and SMTP with XOAUTH2. Users supply their provider-issued desktop client ID; no client secret is embedded.
- **Production site:** added canonical/OG/Twitter metadata, original social image, robots, sitemap, a real 404, security headers, immutable hashed-asset caching, and build-versioned service-worker cache cleanup. Skip-link focus, dark-theme contrast, explicit copy-button names, mobile layout, 200% text, and reduced-motion behavior are covered.
- **Packaging:** the release matrix covers Apple silicon and Intel macOS, Windows, and Linux. Linux publication now requires AppImage, DEB, and RPM. `SHA256SUMS` and `latest.json` are produced from the collected artifacts.

## Exact clean verification

Run from `/work/repo`:

```sh
npm ci && npm test && cargo test --manifest-path src-tauri/Cargo.toml && npx tsc --noEmit && npm run build && npm run test:e2e
```

Final uninterrupted run on 2026-08-30:

- `npm ci`: 67 packages audited, 0 vulnerabilities.
- `npm test`: 6 Vitest tests and 3 platform-independent Rust tests passed.
- full `cargo test`: 7 native engine tests, binary tests, and doc tests passed. This includes MIME parsing, changed-PDF thread identity, persistent canonical/alias lookup, audit/error retry behavior, provider endpoints/scopes, and exact XOAUTH2 framing.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; produced `dist/app` and `dist/site`.
- `npm run test:e2e`: 12 passed. This covers all eight declared claims plus keyboard focus, axe in light/dark/reduced-motion modes, 390 px layout, 200% text, service-worker update cleanup, and offline reload in a dedicated browser context.
- Every one of the eight commands in `.factory/claims.json` was then run independently; all eight passed from their own Playwright invocation.
- Initial bundles: desktop UI JavaScript 23.42 KB raw / 7.99 KB gzip; site JavaScript 3.83 KB raw / 1.72 KB gzip; site CSS 15.17 KB raw / 4.06 KB gzip.

Run one claim independently with the exact command in `.factory/claims.json`, or all claims with:

```sh
npm run test:e2e -- --grep '@claim:'
```

## Live evidence

- `/opt/fleet/lib/verify-url.sh https://reminder-mailroom.sociobot.in/ .factory/evidence/repair-2026-08-30`: HTTP 200, 970 ms load, no console errors, correct title and `lang`, one h1, main landmark present, no missing alt text, and no unlabeled buttons.
- Live Lighthouse mobile: Performance 100, Accessibility 100, Best Practices 100, SEO 100; LCP 1.36 s, TBT 0 ms, CLS 0.0003.
- `/`, `/demo/`, `/privacy/`, `/terms/`, `robots.txt`, and `sitemap.xml` return 200. A missing route returns the designed page with HTTP 404.
- Live CSP, frame protection, permissions policy, referrer policy, and `nosniff` headers are present. Hashed assets return `Cache-Control: public, max-age=31536000, immutable`.
- Every emitted JS/CSS asset and `sw.js` was downloaded from the custom domain and matched the local production build by SHA-256.
- Deployment was made only to the existing Azure Static Web App named `sf-reminder-mailroom`. No unrelated Azure resource, application setting, database, vault, or service was read or changed.
- GitHub Actions release run `33297139260`: Apple silicon macOS, Intel macOS, Windows, Linux, and publish jobs all passed. The v0.2.0 release contains DMG (both architectures), MSI, EXE, AppImage, DEB, RPM, `SHA256SUMS`, and valid `latest.json` metadata.
- The published 6,333,208-byte RPM was downloaded and passed `sha256sum -c`; its published and measured SHA-256 is `bce5a83fe3dd12ca56b07746237221be70d0ae9c6170947186bb7f3971a87a33`.
- A fresh live Chromium session made one external metadata request, only to `api.github.com`; it logged no console/page errors and selected the v0.2.0 AppImage URL for Linux.

## Data and privacy behavior

The Tauri app stores `settings.json`, `rules.json`, and `audit.sqlite3` under the platform app-data directory for `in.sociobot.reminder-mailroom`. Passwords and OAuth tokens use the OS credential manager. The app talks directly to the configured mail servers; it has no analytics or product mailbox relay. The browser demo is static and isolated from desktop data.

Each enabled rule searches at most the newest 500 matching IMAP UIDs and fetches with `BODY.PEEK[]`. The first matching PDF becomes canonical. Later messages are skipped when the stable thread identity, a recorded RFC message alias, or the PDF hash matches. Audit CSV exports go to Downloads, or app data when Downloads cannot be resolved.

## Known limits and operator action

- Google and Microsoft require the user or organization to create a public desktop OAuth client and enter its client ID. A real provider consent/mailbox exchange was not run because no mailbox identity or provider client ID is present in the worker; endpoint, PKCE, refresh, keychain, IMAP, and SMTP paths have deterministic native coverage.
- The Sociobot checkout URL currently returns HTTP 404 because `reminder-mailroom` is not registered in the billing engine. The worker has no scoped billing-registration tool or credential, and the isolation rule prohibited inspecting shared service settings. Register the product with price `$29`, one-time billing, and return URL `https://reminder-mailroom.sociobot.in/`; no application change is required.
- Builds are unsigned. Add Apple notarization and Windows Authenticode only when operator certificates are available. Expected secrets are `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `WINDOWS_CERT_PFX`, and `WINDOWS_CERT_PASSWORD`.
- Automatic checks run while the desktop app is open; there is no background daemon or login item.
- SMTP has no universal idempotency key. A crash after server acceptance but before the local commit could permit one duplicate on retry; ordinary send failures remain auditable and retryable.

## Visual provenance

The glacial-minimal-ceramics system, light/dark palette, self-hosted type, spacing, motion policy, original asset prompt, model, date, and license notes are in `.factory/design.md`. Source/prompt sidecars are in `assets/src/`; optimized assets are in `public/assets/`. The site footer discloses the generated illustration.
