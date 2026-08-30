# Independent verification — FAIL

**Verifier:** factory QA  
**Candidate:** `eeadd171808f952d8ce91c6de1f008f4d9a79c86` (`main`)  
**Live URL:** https://reminder-mailroom.sociobot.in/  
**Date:** 2026-08-30

## Release decision

**FAIL. Do not release this candidate.** The mandatory claims contract and isolated one-click demo are absent. The deployed landing page has a fresh console error on every ordinary visit, and the mail engine has a thread-key defect that can forward a changed-PDF reminder as a second canonical invoice.

## Required preflight: claims and cold first read

- **FAIL — `.factory/claims.json` is missing.** The required first action was therefore impossible: there were no declared claim tests to run from the demo entry point. Under the factory claims contract, this alone blocks release. The repository contains no `@claim:` tests.
- **FAIL — no demo sandbox.** The cold live page describes a local desktop rule for solo businesses that want one archived invoice while payment reminders continue. Its first offered action is **“Download for your computer”**; there is no **“Try it with sample data”** action, no `/demo` or `?demo=1` route, no sample mail/project, no demo banner/reset/start-for-real flow, and no `.factory/demo.md`. This fails the mandatory one-click, isolated demo requirement for desktop apps.
- The headline, “One invoice in. Every reminder out.”, is not a plain job statement by itself, although the following sentence makes the intended audience and outcome understandable.

## Blocking defects

### P1 — A reply can be forwarded as a second canonical invoice

The implementation selects an `In-Reply-To`/`References` value as the reply’s `thread_key`, but uses normalized subject text for an original message with no reply header ([desktop.rs](/work/repo/src-tauri/src/desktop.rs:431)). Deduplication only compares that key or the PDF SHA-256 ([desktop.rs](/work/repo/src-tauri/src/desktop.rs:458)).

For example, the original `Invoice #1042` has key `invoice 1042`; a later `Reminder: Invoice #1042` with `In-Reply-To: <original@example>` has key `<original@example>`. If the reminder carries a regenerated PDF with a different hash, neither predicate matches and the app forwards it. That violates the researched job-to-be-done: preserve exactly one canonical archive record per invoice thread. Existing tests only prove string normalization, not this original-plus-reply path.

### P1 — OAuth-required providers are unsupported

The brief requires OAuth where required. The product instead requires IMAP/SMTP app passwords; the README explicitly says OAuth-only providers are unsupported ([README.md](/work/repo/README.md:23)). The setup UI says Gmail and Microsoft accounts that forbid app passwords require OAuth, but provides no OAuth flow ([main.ts](/work/repo/app/main.ts:62)). This leaves a material portion of the intended mailbox providers unable to use the product.

## High defects

### P2 — Every live landing-page visit logs a CORS error and loses OS-aware download selection

Fresh desktop and 390px contexts both requested the GitHub release API successfully, then requested `https://github.com/B-Divyesh/sf-reminder-mailroom/releases/latest/download/latest.json`. That response has no CORS header, producing:

```
Access to fetch at 'https://github.com/.../latest.json' ... has been blocked by CORS policy
Failed to load resource: net::ERR_FAILED
```

The site then shows **“Release assets are being prepared”** and leaves the primary button on the generic release page even though v0.1.0 and `latest.json` exist. The failing fetch is in [site.ts](/work/repo/site/site.ts:29). This violates the no-console-errors gate and the desktop installer requirement to select a real platform asset.

### P2 — The live deployment lacks required security, crawl, metadata, and cache controls

Live `/`, JS, CSS, image, legal pages, and `/sw.js` return only a 30-second `Cache-Control`; hashed static assets are not immutable. Response headers include HSTS, `nosniff`, and referrer policy, but no `Content-Security-Policy`, `frame-ancestors`, `X-Frame-Options`, or `Permissions-Policy`.

The output has no canonical URL or Open Graph/Twitter metadata; `/robots.txt` and `/sitemap.xml` are 404; `/404.html` returns the landing page with HTTP 200. No `staticwebapp.config.json` exists. These fail the required site/deployment skeleton and prevent a secure production header policy.

### P2 — The service worker has no safe update versioning

Offline reload works after an online visit, but [sw.js](/work/repo/public/sw.js:1) has a fixed cache name, `reminder-mailroom-site-v1`, and no build/version change mechanism. A later release reuses the old cache rather than safely invalidating it. The service-worker update requirement cannot be met with this implementation.

## Other defects and gaps

- **P2 — Unlisted claims.** With no claims file, statements such as “forwards the first invoice PDF,” “quietly stops every duplicate,” “Never uploads your mailbox,” “There is no … telemetry,” and the price/free-tier statements have no required observable sandbox tests.
- **P2 — no full mail-flow integration fixture.** The tests cover five TypeScript helpers, three no-desktop Rust helpers, and four browser checks. They do not exercise the IMAP search → MIME parse → thread/PDF dedupe → SMTP/archive/audit flow using a deterministic mail fixture, nor preview/retry/persistence boundaries.
- **P3 — site skip link does not move focus to main.** On the live landing page, Tab focuses “Skip to main content,” but Enter leaves focus on `BODY` rather than `main`/the heading. The desktop app shell does focus `#main` correctly.
- **P3 — release packaging is incomplete against the supplied desktop matrix.** The v0.1.0 release contains macOS DMGs, Windows MSI/EXE, Linux AppImage, and Linux DEB, but no Linux RPM.

## Evidence and QA results

| Check | Result | Evidence |
| --- | --- | --- |
| Clean dependency install | PASS | `npm ci` completed; 67 packages audited, 0 vulnerabilities. |
| Declared claim tests via demo entry | **FAIL** | `.factory/claims.json` absent; no demo entry exists. |
| Unit + platform-independent Rust tests | PASS | `npm test`: 5 Vitest and 3 Rust tests passed. |
| Repository browser suite | PASS | `npm run test:e2e`: 4 Playwright tests passed. |
| Type check | PASS | `npx tsc --noEmit` passed. No lint script is defined. |
| Exact declared production build | PASS | `npm run build` created `dist/app` and `dist/site`; initial site JS is 4.04 kB (1.79 kB gzip), CSS 11.81 kB (3.39 kB gzip). |
| Full native Rust test | ENVIRONMENT BLOCKED | `cargo test --manifest-path src-tauri/Cargo.toml` cannot compile without the documented host `glib-2.0` development library. This is not counted as a code failure; no native app was built in the worker. |
| Live deployment identity | PASS | SHA-256 of live `main-ByO9dmOi.js`, `main-CiU6yM03.css`, and `sw.js` exactly matches freshly built candidate output. |
| Live desktop / 390px | Mixed | Both load with one h1, `lang=en`, main landmark, no horizontal overflow; both have the GitHub CORS console errors. |
| Keyboard / focus | Mixed | App shell: skip link, 3px visible focus, dialog validation/recovery pass. Live site: skip target does not receive focus. |
| Axe serious/critical | PASS | Fresh live mobile Axe scan: zero serious/critical findings. |
| Reduced motion | PASS | App shell reduced-motion path has near-zero transition duration. |
| Privacy request observation | Mixed | Landing visit sent same-origin assets plus GitHub release metadata/manifest requests; no analytics or mail-content request was observed. The manifest request fails CORS. Privacy statements remain unverified claims because the required claim test is absent. |
| Service worker/offline | Mixed | Active worker registered; after one online reload, offline root reload returned 200 with expected h1. Update cache versioning is absent; offline run logs the expected disconnected external-manifest fetch error. |
| Response headers/caching | FAIL | Missing CSP/frame protection/permissions policy; static assets only max-age=30. |
| Release artifact | PASS (partial) | v0.1.0 release exists. Downloaded `Reminder.Mailroom_0.1.0_amd64.deb`; `sha256sum -c SHA256SUMS --ignore-missing` returned `OK`. |

## Required repair before re-verification

1. Add `.factory/claims.json` and one independent tagged demo-entry test for every visitor claim; add a separate demo namespace, realistic bundled mailbox/project sample, persistent demo banner, reset, and direct demo URL.
2. Correct canonical-thread identity so an original and all replies use the same stable invoice/thread key even when the attached PDF changes; add fixture tests for original, reply, changed PDF, duplicate hash, retry, and audit persistence.
3. Add OAuth support for providers that require it, or revise the product scope only if the researched constraint is formally changed.
4. Fix the landing download path to avoid fetching a GitHub release-download URL with `fetch`; derive the manifest from the CORS-enabled GitHub API/assets or serve it same-origin. Verify a clean browser has no console/page errors and that each OS button targets an asset.
5. Add production deployment configuration: restrictive CSP that permits only actual sources, frame protection, appropriate static immutable caching, canonical/OG/Twitter metadata, `robots.txt`, `sitemap.xml`, and a real 404 response.
6. Version the service-worker cache per build and test update plus offline reload from a fresh browser context.

No product code was modified during verification.
