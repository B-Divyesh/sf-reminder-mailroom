# Independent verification 2 — FAIL

**Candidate:** `4592e686b42149e6df67f21597a7ee1bebb5a38b` (`main`)

**Live URL:** <https://reminder-mailroom.sociobot.in/>

**Date:** 2026-08-30

**Role:** independent factory verifier

## Release decision

**FAIL. Do not release this candidate.**

The required cold first-read and one-click demo pass, every declared claim command passes after the clean lockfile install, the complete repository suites pass, the live static deployment matches the candidate, and the release artifacts/checksums are present. The candidate still has release-blocking product defects:

1. The advertised one-time purchase cannot be completed because the live checkout endpoint returns HTTP 404.
2. Independent invoice threads with the same normalized subject collapse to one canonical record, so a valid invoice can be skipped.
3. Concurrent scans can both send the same invoice before either scan commits its canonical record.
4. The landing page and README contain material claims not represented by `.factory/claims.json`.
5. Axe reports serious accessibility failures on the live 390 px dark landing page and on the mobile legal/404 routes.

No product code was modified during verification.

## Mandatory preflight

### Claims file and exact commands

`.factory/claims.json` exists with eight entries. Each ID occurs in exactly one `@claim:<id>` test. On the literal first invocation before dependency installation, all eight commands stopped with `ERR_MODULE_NOT_FOUND` for `@playwright/test`. After the required clean `npm ci`, every exact command was rerun independently and passed:

| Claim | Exact test result |
| --- | --- |
| `release-platform-download` | PASS — 1 passed |
| `changed-pdf-thread` | PASS — 1 passed |
| `demo-isolation` | PASS — 1 passed |
| `audit-csv-export` | PASS — 1 passed |
| `local-interface-privacy` | PASS — 1 passed |
| `offline-reload` | PASS — 1 passed |
| `oauth-provider-setup` | PASS — 1 passed |
| `paid-tier-copy` | PASS — 1 passed |

The installed reruns are the meaningful claim results. The initial failures record that a clean clone must be installed before the commands can execute.

### Cold first-read gate

**PASS.** A cold live response and fresh 1440 × 900 browser context show:

- What it does: **“Archive one invoice from every reminder thread.”**
- Who it is for: **“For solo businesses that send payment reminders…”**
- What to click first: **“Try it with sample data.”**
- The adjacent explanation says the sample opens a private demo and saves nothing to the mailbox.

One click opens `/demo/`. The persistent banner says **“Demo — sample data, nothing is saved”** and provides **Reset demo** and **Start for real**. Running the sample produces one archive, two skips, and one forwarded message. Reset removes `demo:reminder-mailroom` and returns focus to **Run sample sort**.

## Blocking defects

### P1 — Mailroom Plus checkout is unavailable

The live product advertises **Buy Mailroom Plus** for **$29 one-time**, but its destination is not registered/enabled:

```text
GET https://api.sociobot.in/api/v1/products/reminder-mailroom/checkout
HTTP/2 404
{"error":"enabled factory product","status":404}
```

An invalid-token verification request does work (`200`, `{valid:false, reason:"invalid"}`), so this is specifically a purchase-path failure. The declared `paid-tier-copy` claim only checks the price text and URL; it does not prove checkout works.

### P1 — Separate invoices with the same subject are treated as one thread

The native engine always prefers the normalized subject as `thread_key`, even when RFC message IDs are present ([desktop.rs](/work/repo/src-tauri/src/desktop.rs:600)). The canonical table makes that key globally unique ([desktop.rs](/work/repo/src-tauri/src/desktop.rs:180)), and duplicate lookup matches it before aliases ([desktop.rs](/work/repo/src-tauri/src/desktop.rs:660)). Sender, mailbox, rule, and actual RFC thread are not part of the identity.

Therefore two unrelated clients sending `Invoice`, or two separate recurring invoices named `Invoice #1042`, receive the same key. The second, changed-hash invoice is skipped as a duplicate. The shared TypeScript normalizer demonstrates the collision:

```text
client A / "Invoice" -> subject:invoice
client B / "Invoice" -> subject:invoice
```

This violates the success requirement to preserve one original for 100% of configured invoice threads. Existing tests cover one original/reply fixture but not two unrelated threads with the same subject.

### P1 — Concurrent scans can double-forward before SQLite records the first send

Every `scan_mail` invocation starts an independent blocking task ([desktop.rs](/work/repo/src-tauri/src/desktop.rs:333)). Processing checks SQLite, sends over SMTP, and only then inserts the unique canonical row ([desktop.rs](/work/repo/src-tauri/src/desktop.rs:638), [desktop.rs](/work/repo/src-tauri/src/desktop.rs:652), [desktop.rs](/work/repo/src-tauri/src/desktop.rs:679)). There is no process mutex, reservation row, or transaction around check-and-send.

Two manual/automatic scans can both observe no canonical and both deliver the same PDF. The later unique-key error happens after both SMTP sends. This breaks the product's core duplicate-prevention promise. No concurrency test exists.

### P1 — Material visitor claims are absent from the claims contract

The claims cross-check fails even though the eight listed tests pass. Examples with no matching `.factory/claims.json` entry include:

- **“Never uploads your mailbox”** and **“There is no … telemetry or behavioral analytics”** on the landing page.
- **“Passwords and OAuth tokens use the operating system keychain”** on the site, in the app, and in the README.
- **“The oldest matching PDF in each invoice thread becomes canonical”** in the desktop app.
- **“Install scripts verify the download before installing”** on the site and in the README.
- The functional promise implied by **Buy Mailroom Plus**; only its copy and URL are tested, and the URL is currently dead.

The existing `local-interface-privacy` test only opens the webview's Rules and Activity views. It does not prove the broader mailbox-upload/keychain claims. Under the supplied claims contract, any unlisted claim blocks acceptance.

## High defects

### P2 — Live accessibility has serious axe failures

Fresh Playwright + axe scans at 390 × 844 found:

- Dark landing page: `.canonical > em` has 2.84:1 contrast and `.clay-seal` has 2.01:1; both require 4.5:1.
- Privacy, Terms, and 404 pages in both light and dark modes: the mobile header home link has no accessible name. At ≤440 px CSS hides `.site-brand span`, while the image has `alt=""` and those three links have no `aria-label`.

The repository accessibility test misses these paths: it scans the desktop app and demo, then scans only the demo after enabling dark mode.

### P2 — Delete confirmation is not keyboard-modal

In the desktop app at 390 px, opening **Delete “Client invoices”?** focuses **Keep rule**. Pressing Tab moves focus outside the `alertdialog`, and pressing Escape leaves the dialog open. The rule-edit dialog has explicit focus trapping, but `confirmDelete` does not attach that handler ([main.ts](/work/repo/app/main.ts:196)). This violates the required dialog focus-management baseline.

### P2 — The macOS one-line installer uses a GNU-only `find` option

The advertised `install.sh` runs this after mounting the DMG:

```sh
find "$MOUNT" -maxdepth 1 -name '*.app' -print -quit
```

`-maxdepth` is not supported by the BSD `find` shipped with macOS. The documented one-line macOS install path therefore fails after mounting the image ([install.sh](/work/repo/public/install.sh:35)). The release workflow builds packages but does not execute the published installer scripts on their target OS.

### P2 — Desktop-class sample is not shipped in the installed first-run app

The website has a good isolated `/demo/`, but the installed desktop first-run UI has no **Load sample project** action or bundled sample-mail flow, and the landing page has no required 3–5 frame captioned app walkthrough. The sample simulator exists only in the website `site/demo.ts`, not in the desktop app.

## Lower-severity gaps

- **P3 — First screen facts do not cover offline and price.** The first screen communicates privacy and audit behavior, but not the required privacy/offline/price trio.
- **P3 — Architecture detection is unreliable for Apple-silicon Safari.** `platformKey()` selects macOS x64 when `navigator.userAgentData` is unavailable, which is normal in Safari. Users can still choose a platform link, but the primary detected download may be wrong.
- **P3 — Native dependency warning.** The full Rust run warns that `imap-proto 0.10.2` contains code a future Rust version will reject. It does not fail the current build.

## Clean local quality gates

| Check | Result | Evidence |
| --- | --- | --- |
| Candidate identity | PASS | `git rev-parse HEAD` = `4592e686b42149e6df67f21597a7ee1bebb5a38b` |
| Clean dependency install | PASS | `npm ci`; 67 packages audited, 0 vulnerabilities |
| Declared claims | PASS after install | All eight exact commands passed independently |
| Repository tests | PASS | `npm test`: 6 Vitest + 3 no-default-feature Rust tests |
| Full native tests | PASS | After installing documented Tauri Linux libraries, `cargo test --manifest-path src-tauri/Cargo.toml`: 7 tests passed |
| Type check | PASS | `npx tsc --noEmit` |
| Lint | N/A | No lint script/configured lint gate exists |
| Production build | PASS | `npm run build`; produced `dist/app` and `dist/site` |
| Full browser suite | PASS | `npm run test:e2e`: 12 passed |

Production bundle sizes are within budget:

- Initial site JS: 5,189 bytes raw total; build output reports 2.48 kB gzip total.
- Site CSS: 15,174 bytes raw / 4.06 kB gzip.
- Initial Latin fonts: 92,080 bytes total.
- Mobile hero: 14,892 bytes; desktop hero: 54,708 bytes.
- Desktop UI JS: 23.42 kB raw / 7.99 kB gzip.

## Live deployment evidence

### Candidate parity

Every built site file exposed by the deployment matched the fresh candidate build by SHA-256, including HTML routes, emitted JS/CSS/fonts/images, installers, legal pages, and `sw.js`. `staticwebapp.config.json` correctly returns 404 because deployment configuration is consumed rather than served. Native/app sources do not differ between candidate `4592e68` and release tag `v0.2.0` (`66a113a`).

### Browser, privacy, and headers

- Fresh 1440 × 900 landing: no console errors, page errors, or failed requests.
- Requests: same-origin assets plus one public metadata request to `https://api.github.com`; no analytics/tracking request.
- Fresh direct demo flow: same-origin requests only; storage uses `demo:reminder-mailroom`.
- Invalid license recovery: browser calls only the documented Sociobot verify endpoint, reports inactive license, and logs no error.
- Main response includes CSP, HSTS, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, Permissions-Policy, referrer policy, and `nosniff`.
- Hashed assets return `Cache-Control: public, max-age=31536000, immutable`; HTML returns a 30-second revalidation policy.
- `/`, `/demo/`, `/privacy/`, `/terms/`, `/robots.txt`, and `/sitemap.xml` return 200. An unknown route returns the designed page with HTTP 404.
- `/opt/fleet/lib/verify-url.sh`: HTTP 200, 973 ms, correct title/lang, one h1, main landmark, no missing alt, no unlabeled buttons on the landing route, and no console errors.

### Responsive, motion, PWA, and performance

- Desktop and 390 px layouts have no horizontal overflow; 200% text on the demo remains usable.
- Reduced motion reduces transition/animation duration to `0.01ms`.
- Offline reload after an online demo visit returns 200 with the expected h1 and no console errors.
- A simulated prior service-worker cache is removed when the current worker installs; only `reminder-mailroom-site-21609eff52c6` remains.
- Fresh successful mobile Lighthouse: Performance 100, Accessibility 100, Best Practices 100, SEO 100; FCP 1.4 s, LCP 1.4 s, TBT 10 ms, CLS 0. Lighthouse's light-mode scan does not cover the dark/mobile axe defects above.

### API allowance

The product has no product-owned backend. For its factory license verification endpoint, one client received 30 successful invalid-token verification responses; request 31 returned HTTP 429 with `Retry-After: 3`. Observed allowance: **30 requests in the active short window**.

### Release and install artifacts

- GitHub Actions release run `33297139260`: Linux, Windows, Intel macOS, Apple-silicon macOS, and publish jobs all succeeded.
- v0.2.0 includes AppImage, DEB, RPM, MSI, EXE, two DMGs, `SHA256SUMS`, and valid `latest.json` metadata.
- Fresh RPM download: 6,333,208 bytes; SHA-256 `bce5a83fe3dd12ca56b07746237221be70d0ae9c6170947186bb7f3971a87a33`; checksum passed.
- Fresh DEB download: 6,332,250 bytes; checksum passed; `dpkg-deb --info` and extraction succeeded and produced `/usr/bin/reminder-mailroom`.
- Site platform selection chose the real v0.2.0 Linux AppImage URL in the verifier browser.

## Required repair before another verification

1. Register/enable the Sociobot one-time product and add a claim test that verifies the checkout reaches the hosted purchase flow.
2. Replace subject-only canonical identity with a collision-safe thread model that distinguishes unrelated messages/senders while connecting replies. Add fixtures for separate same-subject invoices, two senders, recurring invoices, reply chains, and the 500-message boundary.
3. Serialize scans or reserve the canonical atomically before SMTP; add a deterministic concurrent-scan test proving one delivery.
4. Add/remove claims until every material landing/README/app promise has exactly one observable demo test.
5. Fix dark contrast and mobile accessible names; scan every public route in light/dark at 390 px.
6. Apply the edit-dialog keyboard handler to delete confirmation and test Tab, Shift+Tab, Escape, and focus return.
7. Make `install.sh` portable to macOS and execute both installer scripts in their release-matrix jobs.
8. Ship a desktop first-run sample and the required captioned walkthrough.
