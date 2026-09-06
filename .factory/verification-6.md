# Archive one invoice per reminder thread — verification 6

**Verdict: FAIL — 3 findings, including 1 untested claim.**

- Implementation reviewed: `dbc990f92e1aa1e14db6746d17b59f3cda853a7f`
- Documentation baseline: `0e03cafea21927d78071e2cadf28163097bcd8e3`
- Later repository-only commit: `5c4a9a1e33fa1b71407475240a1c484a7044f6ca`
- Live URL: <https://reminder-mailroom.sociobot.in/>
- Verification date: 6 September 2026

The live website, isolated demo, core mail rules, accessibility checks, and local quality gates pass. The expected public checkout HTTP 404 is handled honestly and is not counted as a product defect. Acceptance is blocked because the downloadable desktop application does not contain the reviewed implementation, one material OAuth claim is not tested to its stated outcome, and the billing handoff file named by the repair is absent.

No product code, deployment, DNS, billing state, database, service, or secret was changed. The three pre-existing modified Graphify cache files were preserved.

## Findings

### P2 — Published desktop packages do not contain the candidate

The live download page selects release `v0.3.0`. Its tag and `latest.json` both identify source commit `214603375c4f3c76bf9ee0b38db72df84144f522`, while this verification was assigned implementation `dbc990f92e1aa1e14db6746d17b59f3cda853a7f`.

The difference includes shipped desktop UI code. Release source `2146033` contains the Plus heading **A quiet tool, bought once**. Candidate `dbc990f` replaces it with the plain heading **Mailroom Plus pricing** in `app/main.ts`. The release also predates the candidate's lint repair and current walkthrough assets. Report-only `0e03caf` and Graphify-only `5c4a9a1` do not require a new image, but the desktop code change in `dbc990f` does.

The package itself is intact: the Debian SHA-256 matches both `latest.json` and `SHA256SUMS`, package metadata reports version 0.3.0/amd64, and the extracted executable stayed open for a 12-second isolated Xvfb smoke test. This proves the older package works; it does not prove that the candidate is shipped.

Publish a new versioned desktop release from the accepted implementation and confirm its source commit in `latest.json`.

### P2 — The OAuth claim does not test OAuth behavior

Claim `oauth-provider-setup` says that the desktop app supports OAuth setup for Google and Microsoft. Its declared command passes, but the tagged browser test replaces `authorize_oauth` with a function that immediately returns a success sentence. It checks provider names, fields, defaults, and the button; it does not exercise a recorded authorization response, the loopback callback, PKCE verifier, token exchange, refresh, credential storage, or IMAP/SMTP XOAUTH2 use.

An untagged Rust test checks provider URLs and XOAUTH2 payload formatting, and the credential claim checks storage boundaries. Neither test proves the full public README statement: “Authorization Code + PKCE, a loopback callback, XOAUTH2 for IMAP and SMTP, and automatic refresh.” Under the claims contract, this is one incomplete and therefore untested public claim.

Add a deterministic provider fixture around the native OAuth flow and tag the observable end-to-end test `@claim:oauth-provider-setup`. No live provider account is needed.

### P3 — The documented billing handoff file is absent

The repair handoff and work order say that billing operator metadata is at `/work/.evidence/billing-offer.json`. The evidence directory exists, but that file was absent during this fresh verification. No credential or unrelated secret was inspected.

Restore the non-secret offer metadata at the stated path so the billing operator has the exact slug, one-time US $29 offer, features, and return URL needed to enable checkout.

## First screen

Fresh 1440 × 900 and 390 × 844 contexts passed before scrolling:

- Job: **Archive one invoice from every reminder thread**.
- Audience: solo businesses that send payment reminders and need one accounting copy.
- First action: **Try it with sample data**.
- The next-step sentence says the sample opens privately and saves nothing to the mailbox.
- The first screen states sample privacy, offline use after one visit, and the $29 one-time price.
- Both sizes had zero horizontal overflow and no console or page errors.

## Demo and product paths

- One click opened `/demo/` with the persistent **Demo — sample data, nothing is saved** label, Reset demo, and Start for real.
- The realistic sample produced 1 archived invoice, 2 skipped duplicates, and 1 forwarded message. It showed the changed-PDF thread reason.
- CSV export produced the expected filename, header, and three decision rows.
- Reset removed only `demo:reminder-mailroom`, preserved a separate real-data sentinel, reset the counts, and returned focus to **Run sample sort**.
- Start for real removed sample state and opened `/#download`.
- A direct demo run made same-origin requests only. The ordinary landing made its documented GitHub release-metadata request and no checkout or tracking request.
- A dedicated context installed the service worker, removed a simulated old cache, switched offline, and reloaded the demo successfully.

The candidate desktop webview was also exercised at 390 px in dark/reduced-motion mode with a deterministic native boundary. It passed empty states, invalid email blocking, a 201-character rule-name error, retry after mailbox-save failure, retry after SMTP failure, retry after scan failure, offline status, the in-memory sample, and zero serious or critical axe results. Error messages stated what failed and what to do next.

Native tests separately cover mailbox ordering, changed PDFs, linked replies, unrelated same-subject invoices, the newest-500 boundary, stateful preview, concurrent scan exclusion, read-only IMAP planning, retryable delivery, keychain routing, local JSON/SQLite persistence, and OAuth endpoint/XOAUTH2 configuration.

## Declared claims

All 23 commands were run exactly as listed from a detached clean checkout of `dbc990f` after `npm ci`. Twenty-two claims have passing evidence. One command passes but does not test the complete public OAuth outcome described above.

| Claim | Result |
| --- | --- |
| `release-platform-download` | PASS |
| `changed-pdf-thread` | PASS |
| `demo-isolation` | PASS |
| `audit-csv-export` | PASS |
| `local-interface-privacy` | PASS |
| `offline-reload` | PASS |
| `oauth-provider-setup` | **UNTESTED OUTCOME** — mocked UI success only |
| `paid-tier-copy` | PASS |
| `paid-license-lifecycle` | PASS |
| `license-token-storage` | PASS |
| `license-verdict-cache` | PASS |
| `thread-identity` | PASS |
| `concurrent-scan-safety` | PASS |
| `desktop-sample-project` | PASS |
| `installer-checksum` | PASS |
| `windows-installer-checksum` | PASS |
| `release-integrity-files` | PASS |
| `oldest-canonical` | PASS |
| `stateful-dry-run` | PASS |
| `mailbox-read-safety` | PASS |
| `credential-keychain` | PASS |
| `local-native-storage` | PASS |
| `website-request-privacy` | PASS |

## Accessibility, routes, privacy, and performance

- `/`, `/demo/`, `/privacy/`, and `/terms/` return 200 with route-specific titles, `lang=en`, one h1, one main landmark, complete image alternatives, and no normal-flow console errors.
- A missing address returns the designed **Page not found** page with deliberate HTTP 404 and a home link. This is expected behavior, not a defect.
- The supplied `verify-url.sh` passed the four normal live routes.
- Twenty Playwright Axe scans covered five routes at desktop and phone sizes in light and dark modes. They found zero serious or critical issues.
- Keyboard use reaches the skip link first, shows a 3 px focus outline, and moves focus to `main`. Dialog keyboard behavior passes the repository suite.
- All measured standalone phone controls are at least 44 × 44 CSS px. Landing and demo remain usable at 200% text.
- Reduced motion limits animation and transition durations to 0.01 ms and disables smooth scrolling.
- The live CSP, frame denial, HSTS, `nosniff`, permissions, and strict referrer headers are present. HTML and `sw.js` revalidate after 30 seconds; hashed assets use one-year immutable caching.
- The live build matches 28 of 28 publicly served candidate files by SHA-256. `staticwebapp.config.json` is deployment configuration and correctly is not public.
- Initial landing JavaScript is 5.21 KB raw and about 2.50 KB gzip; CSS is 16.85 KB raw and 4.39 KB gzip. The mobile hero is 14.89 KB.
- A fresh mobile Lighthouse run completed with Performance 100, Accessibility 100, Best Practices 100, and SEO 100; FCP 1.4 s, LCP 1.4 s, TBT 0 ms, CLS 0, and 120 KiB transferred.
- The product has no product-owned HTTP backend or tenant model. The scoped license API returned a normal invalid verdict. A fresh allowance check returned 200 for requests 1–30 and 429 for requests 31–35; every 429 included `Retry-After`.

## Checkout state

`GET https://api.sociobot.in/api/v1/products/reminder-mailroom/checkout` returns the expected HTTP 404. The live site and candidate desktop UI show the exact $29 one-time offer, included features, license restore, and a non-link **Checkout is being enabled** state. Fresh normal flows made no checkout request and logged no console error.

The work order explicitly classifies this deliberate 404 as an external operator block. It is therefore not counted as a product finding. A follow-up must add and verify a hosted checkout link only after the operator enables the offer.

## Release and install evidence

- GitHub release `v0.3.0` has AppImage, DEB, RPM, MSI, EXE, Intel DMG, Apple-silicon DMG, `SHA256SUMS`, and `latest.json`.
- All six platform entries in `latest.json` match `SHA256SUMS`. The extra Windows EXE is also listed in `SHA256SUMS`.
- Debian package SHA-256: `a9be293c5e571ec1d76163b7121b8d8c66dad4ad4b2e1d4461851c3a0715cc46`.
- The live Linux, Windows, and macOS actions resolve to real v0.3.0 assets. All non-deliberate links checked successfully.
- The published package source mismatch is Finding 1.

## Clean quality gates

| Command | Result |
| --- | --- |
| `npm ci` | PASS — 167 packages, 0 vulnerabilities |
| `npm test` | PASS — 7 Vitest and 3 reduced-feature Rust tests |
| `npm run test:native` | PASS — 15 Rust tests |
| `npm run test:e2e` | PASS — 21 Playwright tests |
| `npm run test:installer` | PASS |
| `npm run test:installer:windows` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — ESLint and Clippy with warnings denied |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | PASS |
| `npm run build` | PASS — produced `dist/app` and `dist/site` |

Cargo still reports the upstream future-incompatibility notice for `imap-proto 0.10.2`. It is not a product lint warning.

## Earlier findings

| Earlier issue | Current disposition |
| --- | --- |
| Missing claims file and demo sandbox | Resolved: 23 declarations and a live isolated demo exist. |
| Changed-PDF reminder could become canonical | Resolved by browser and native fixtures. |
| OAuth providers absent | Product implementation exists; complete claim verification remains open as Finding 2. |
| GitHub release CORS error | Resolved: only the CORS-enabled GitHub API is fetched. |
| Missing headers, metadata, crawl files, cache policy, and designed 404 | Resolved on every checked live route. |
| Fixed service-worker cache | Resolved by versioned cache cleanup and offline test. |
| Missing integrated mail fixture | Resolved by the native fixture flow and focused claims. |
| Skip-link focus failure | Resolved in live keyboard checks. |
| Missing RPM | Resolved in v0.3.0. |
| Separate same-subject invoices merged | Resolved by `thread-identity`. |
| Concurrent scans could double-forward | Resolved by `concurrent-scan-safety`. |
| Unlisted material mail and storage claims | Resolved except the incomplete OAuth outcome in Finding 2. |
| Dark-mode axe failures | Resolved: zero serious/critical results in current scans. |
| Delete dialog keyboard trap | Resolved by the 21-test browser suite. |
| GNU-only macOS installer command | Resolved; both installer consumer tests pass. |
| Missing installed sample and walkthrough | Resolved in source; the current release contains the sample, and settled walkthrough checks pass. |
| Missing first-screen privacy/offline/price facts | Resolved. |
| Apple-silicon Safari defaulted to Intel | Resolved: Safari defaults to Apple silicon and keeps an explicit Intel link. |
| Chained reply ordering defect | Resolved by oldest-canonical and alias-chain tests. |
| Dry-run overstatement | Resolved by `stateful-dry-run`. |
| Small touch targets and body text | Resolved by mobile measurements. |
| Missing route social metadata | Resolved and matched live. |
| Faded walkthrough captures | Resolved by settled-image checks. |
| Two Rust lint warnings | Resolved; strict Clippy passes. |
| Previously stale desktop package | Recurred in a smaller form as Finding 1. |
| Unavailable checkout | Still externally blocked, but now represented honestly; expected 404 is not a product defect for this order. |

## Required next steps

1. Publish desktop installers from `dbc990f` or a later accepted implementation and update `latest.json` with that source commit.
2. Replace the mocked OAuth success with a deterministic native end-to-end fixture that covers callback, PKCE exchange, refresh, credential storage, and XOAUTH2 use.
3. Restore `/work/.evidence/billing-offer.json` without credentials, then let the billing operator enable the offer and verify checkout in a follow-up.
