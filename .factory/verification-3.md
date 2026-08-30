# Independent verification 3 — FAIL

**Candidate:** `819de0b9569e68e9f76ff1455fa40a1a1b4005d1` (`main`)

**Live URL:** <https://reminder-mailroom.sociobot.in/>

**Date:** 2026-08-30

**Role:** independent factory verifier

## Release decision

**FAIL. Do not release this candidate.**

The cold first-read gate passes, all 12 declared claim commands pass after a clean install with the documented Linux Tauri prerequisites, all repository quality gates pass, and the deployed static site is byte-for-byte identical to the candidate build. The complete product is still not releasable:

1. The live site offers v0.2.0 desktop packages built from pre-repair commit `66a113a`, not candidate `819de0b`. Those packages omit the candidate's scan lock, RFC thread-identity repair, keyboard repair, and installed sample.
2. The advertised $29 purchase path returns HTTP 404.
3. Candidate source can archive a later chained reminder before the original because it sorts candidates by a derived thread key rather than mailbox order.
4. The installed app's dry-run preview does not model decisions made earlier in the same scan, so every message in a new thread can be shown as a new canonical PDF.
5. Material privacy, safety, and purchase claims remain outside the claims contract.
6. The live mobile site has touch targets below 44 px and informational text below the required mobile/body size.

No product code was modified during verification.

## Mandatory preflight

### Claims file and exact commands

`.factory/claims.json` exists with 12 entries. Every ID occurs exactly once as `@claim:<id>` in the test sources.

The first run was made from a detached clean worktree at the candidate commit after `npm ci`. Ten commands passed. The two native commands initially stopped during compilation because the worker image did not contain GLib/Tauri development libraries. After installing the Linux prerequisites documented by the repository, both exact commands were rerun in the same clean worktree and passed. This was an environment prerequisite failure, not a test assertion failure.

| Claim | Exact result |
| --- | --- |
| `release-platform-download` | PASS — 1 Playwright test passed |
| `changed-pdf-thread` | PASS — 1 Playwright test passed |
| `demo-isolation` | PASS — 1 Playwright test passed |
| `audit-csv-export` | PASS — 1 Playwright test passed |
| `local-interface-privacy` | PASS — 1 Playwright test passed |
| `offline-reload` | PASS — 1 Playwright test passed |
| `oauth-provider-setup` | PASS — 1 Playwright test passed |
| `paid-tier-copy` | PASS — 1 Playwright test passed |
| `thread-identity` | PASS — 1 native Rust test passed |
| `concurrent-scan-safety` | PASS — 1 native Rust test passed |
| `desktop-sample-project` | PASS — 1 Playwright test passed |
| `installer-checksum` | PASS — exit 0 |

### Cold first-read gate

**PASS.** A fresh 1440 × 900 browser context loaded the live page with HTTP 200 and no console, page, or failed-request errors.

- What it does: **“Archive one invoice from every reminder thread.”**
- Who it is for: **“For solo businesses that send payment reminders…”**
- What to click first: **“Try it with sample data.”**
- The first screen also says what the sample does and gives the required privacy, offline, and price facts.

One click opened `/demo/`. The persistent banner identifies the isolated sample and exposes **Reset demo** and **Start for real**.

## Release-blocking findings

### P1 — Published desktop packages do not contain the candidate

The live platform button selects v0.2.0. The annotated `v0.2.0` tag resolves to commit `66a113a3444a33a6157abfa653ccc9147b93f4b8`, timestamped 06:32 UTC. Candidate `819de0b` is timestamped 07:45 UTC.

The candidate differs from that release in the shipped desktop product:

```text
app/main.ts              | 10 insertions
app/styles.css           |  3 insertions
src-tauri/src/desktop.rs | 100 insertions, 29 deletions
```

Those differences add the process-wide scan mutex, replace subject-only thread identity with RFC identifiers, add the installed sample, and repair the delete dialog. The old release therefore still contains the exact duplicate-delivery and same-subject collision defects that candidate tests claim to fix. The live landing page also promises an installed **Load sample project** action that the released package does not contain.

The published Debian package downloaded successfully and its checksum is valid:

```text
file: Reminder.Mailroom_0.2.0_amd64.deb
size: 6,332,250 bytes
sha256: bc4b3c9697c82cc2c03dba65a80947a9e9b464ef8db2d3d5370a46ceac402de4
```

This proves package integrity for the old release, not candidate parity. A new versioned release must be built from the accepted commit and the site must select it.

### P1 — Mailroom Plus cannot be purchased

Fresh evidence from the product-specific billing route:

```text
GET https://api.sociobot.in/api/v1/products/reminder-mailroom/checkout
HTTP/2 404
{"error":"enabled factory product","status":404}
```

The live page advertises **Buy Mailroom Plus** and links directly to this dead route. The `paid-tier-copy` claim only verifies price text and the URL; it does not verify that checkout reaches the hosted purchase flow.

Invalid-license recovery itself works: the verification route returns `200` with `{"valid":false,"reason":"invalid"}`, and the live form shows a useful inactive-license message without a console error.

### P1 — A chained reminder can become the canonical invoice

Candidate code derives `thread_key` from the first value in `In-Reply-To` followed by `References` ([desktop.rs](../src-tauri/src/desktop.rs#L632)), then sorts all candidates lexicographically by that key before processing ([desktop.rs](../src-tauri/src/desktop.rs#L601)).

A normal three-message chain demonstrates the defect:

```text
UID 1 original: Message-ID z-root                     -> key z-root
UID 2 reminder: In-Reply-To z-root                    -> key z-root
UID 3 final: In-Reply-To a-parent; References z-root  -> key a-parent
sorted processing order                               -> UID 3, UID 1, UID 2
```

UID 3 is sent first and stores `z-root` as an alias. The actual original is then classified as a duplicate. Message IDs are arbitrary, so this is not a safe ordering rule. The existing native test covers a reply directly linked to the original, not a chained reply with both headers. This violates the core promise that the first invoice PDF becomes canonical.

### P1 — Material claims are not represented by one observable claim test

The declared claims pass, but the page, app, privacy policy, terms, and README make additional material promises without corresponding entries/tests. Examples include:

- credentials and OAuth tokens use the operating-system credential manager;
- mail content is read only when it matches the complete explicit rule;
- the app never deletes, moves, or marks source messages read;
- the oldest matching PDF becomes canonical;
- every release includes `SHA256SUMS`;
- refunded purchases revoke automatically and paid users receive all v1 updates;
- the **Buy Mailroom Plus** path actually reaches checkout.

`local-interface-privacy` records browser requests while two webview screens are opened. It does not exercise native IMAP/SMTP behavior or keychain persistence. `paid-tier-copy` verifies only copy and href. Under the supplied claims contract, these unlisted or under-tested promises block acceptance.

## Other product defects

### P2 — Dry-run preview overstates what will be forwarded

For a new thread, `process_candidate` checks only persisted canonicals. In dry-run mode it adds a preview row but does not add an in-memory canonical before processing the next candidate ([desktop.rs](../src-tauri/src/desktop.rs#L676)). Consequently, an original and two reminders from a not-yet-archived thread can all be labeled **“New canonical PDF; this would be forwarded once.”** The subsequent real run archives only one. This contradicts the UI promise to preview which PDF becomes canonical.

### P2 — Mobile touch targets are below 44 px

At 390 px, computed hit boxes include:

- demo **Reset demo** and **Start for real**: 36 px high;
- landing **Copy** buttons: 38 px high;
- OS chooser links: 21 px high;
- footer Privacy/Terms links: 20 px high;
- mobile home link: 42 × 42 px.

Inline prose links may reasonably use the inline-text exception, but the demo controls, copy buttons, OS chooser, and home control are standalone controls and fail the supplied 44 px baseline.

### P2 — Important mobile and body copy is below the required size

Computed live sizes include first-screen facts and action help at 14 px, walkthrough captions at 15 px, footer links at 15 px, and hero outcome labels at 12 px on the 390 px layout. The supplied design/accessibility contract requires body text of at least 16 px on web and 17 pt on mobile.

## End-to-end and boundary evidence

- Direct demo requests were same-origin only, and the only storage key was `demo:reminder-mailroom`.
- Running the sample produced 1 archived, 2 skipped, and 1 forwarded result.
- CSV export produced the expected filename, header, and three decision rows.
- **Reset demo** removed the sample key and returned focus to **Run sample sort**.
- **Start for real** removed the sample key and opened `/#download`.
- Offline reload returned 200 with the demo heading after a first online visit.
- A simulated prior service-worker cache was removed when the current worker installed.
- The local candidate webview handled a 201-character rule error, recovered from a mailbox-save error, cleared passwords after a successful save, reported an SMTP failure, restored dialog focus on Escape, and had no serious/critical axe finding. Native calls were deterministic bridge fixtures; no real mailbox credentials were available or used.
- Native tests cover two unrelated same-subject invoices, recurring same-subject invoices, direct RFC replies, changed PDFs, a concurrent scan gate, retryability after SMTP failure, and the newest-500-message boundary.

## Clean local quality gates

| Check | Result |
| --- | --- |
| Candidate identity | PASS — exact `819de0b9569e68e9f76ff1455fa40a1a1b4005d1` |
| Clean install | PASS — `npm ci`, 67 packages, 0 vulnerabilities |
| Declared claims | PASS — 12/12 after documented system prerequisites |
| `npm test` | PASS — 6 Vitest + 3 reduced-feature Rust tests |
| Full native tests | PASS — 9 Rust tests |
| `npx tsc --noEmit` | PASS |
| Lint | N/A — no lint script/configuration exists |
| `npm run test:installer` | PASS |
| Windows installer fixture | Not run — PowerShell is absent from this Linux worker; workflow covers it on Windows |
| `npm run test:e2e` | PASS — 15 tests |
| `npm run build` | PASS — produced `dist/app` and `dist/site` |

The Rust toolchain reports the existing future-incompatibility warning for `imap-proto 0.10.2`; it does not fail this build.

## Live deployment, accessibility, privacy, and performance

- Every deployed static file matched the clean `dist/site` candidate file by SHA-256, including all HTML routes, emitted JS/CSS/fonts/images, service worker, and install scripts. Static-site parity passes.
- The downloadable desktop packages fail candidate parity as described above.
- `/`, `/demo/`, `/privacy/`, and `/terms/` return 200. An unknown route returns the designed page with HTTP 404.
- All normal public routes loaded without console, page, or failed-request errors. Chromium reports the expected failed-document console message when intentionally loading the HTTP 404 route.
- Independent Playwright axe scans found zero serious/critical findings on landing, demo, privacy, terms, and 404 at 1440 px and 390 px in light and dark modes.
- Keyboard checks reached the skip link first, moved focus to `<main>`, and showed a 3 px visible focus outline on subsequent controls. Reduced motion changed animations/transitions to `0.01ms` and smooth scrolling to `auto`.
- At 390 px there was no horizontal overflow, including after 200% text scaling.
- Landing requests were same-origin assets plus the documented public GitHub release-metadata request. Direct demo and desktop-webview flows made no external requests. No analytics/tracking request appeared.
- Security headers include CSP, HSTS, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, and Permissions-Policy.
- HTML and `sw.js` use `max-age=30` revalidation. Hashed assets use `max-age=31536000, immutable`.
- `/opt/fleet/lib/verify-url.sh`: HTTP 200 in 791 ms; correct title/lang; one h1; main landmark; no missing alt text, unlabeled button, or console error.
- Mobile Lighthouse: Performance 100, Accessibility 100, Best Practices 100, SEO 100; FCP 1.2 s, LCP 1.2 s, TBT 10 ms, CLS 0, Speed Index 1.2 s.
- Landing JS is 5,213 raw bytes total; CSS is 16,072 bytes; initial Latin fonts total 92,080 bytes; mobile hero is 14,892 bytes. All supplied static budgets pass.

## API allowance and authentication

The product has no product-owned HTTP backend. The product-specific license verification endpoint allowed 30 consecutive requests from one client; request 31 returned HTTP 429 with `Retry-After: 3`. Observed allowance: **30 requests per active short window**.

Product use does not require an account sign-in, so the Entra External ID requirement is not applicable. Google/Microsoft OAuth in the desktop app is explicitly for the user's mailbox connection, not product authentication.

## Required work before re-verification

1. Publish a new versioned desktop release built from the repaired candidate (or a successor), update the site to select it, and verify one package against its checksum and the expected repaired UI/core behavior.
2. Register/enable the `reminder-mailroom` checkout and add an observable checkout claim.
3. Preserve mailbox/UID chronology while grouping RFC-linked messages, and add a chained `In-Reply-To` + `References` regression proving the original PDF wins.
4. Make dry-run decisions stateful within the scan and add a multi-message new-thread preview regression.
5. Add or remove claims until every material promise has one correctly scoped test.
6. Raise standalone mobile hit areas to at least 44 px and important body/help text to the required size.
