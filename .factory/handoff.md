# Reminder Mailroom v0.1 handoff

## What was built

- Tauri 2 desktop app with responsive vanilla TypeScript UI and a Rust mail engine.
- Direct TLS IMAP search scoped to visible subject/sender/mailbox rules; matched messages are fetched with `BODY.PEEK[]` so they remain unread and untouched.
- PDF attachment decoding, SHA-256 deduplication, normalized invoice-thread deduplication, SMTP forwarding of one canonical PDF, and SQLite audit logging for archives, duplicates, and delivery errors.
- Safe preview, explicit empty/offline/error/loading states, reversible rule editing, keyboard-managed dialogs, complete CSV export, and OS-keychain credential storage.
- Free tier with one useful rule; $29 one-time Plus unlock for unlimited rules and scheduled checks while the app is open. Checkout, return-token storage, daily verification caching, offline cached verdicts, and license restore use the Sociobot contract without a hardcoded product ID.
- Static product site in `dist/site`, original generated hero imagery, OS-aware release download button, checksum-verifying shell/PowerShell installers, privacy and terms pages, and a versioned service-worker cache.
- Tag-triggered GitHub Actions matrix for Apple silicon + Intel macOS, Windows, and Linux; release publication includes all Tauri packages, `SHA256SUMS`, and `latest.json`.

## How to run and verify

```sh
npm ci
npm test
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```

Static deployment command: `npm run build:site`. Deploy directory: `dist/site` (with `index.html` at its root).

Verified locally on 2026-08-28:

- `npm test`: 5 Vitest + 3 platform-independent Rust tests passed.
- Full `cargo test`: 4 native mail-engine tests passed after installing Tauri Linux prerequisites.
- `npm run test:e2e`: 4 Playwright checks passed, including axe (zero serious/critical findings), keyboard skip navigation, legal routing, and 390 px horizontal-overflow coverage.
- `cargo check`: full Tauri desktop feature compiled successfully.
- `npm run build`: app and site production bundles completed.
- Static initial payload: 3.5 KB JS, 11.4 KB CSS, 92 KB of Latin font files, 54 KB desktop hero / 15 KB mobile hero; all within the 200/50/120/300 KB budgets.
- Lighthouse mobile: Performance 99, Accessibility 100, Best Practices 96, SEO 92; LCP 1.7 s, FCP 1.5 s, TBT 0 ms, CLS 0.
- GitHub Actions run `33158412536`: all four native matrix jobs and the publish job passed. Release: `https://github.com/B-Divyesh/sf-reminder-mailroom/releases/tag/v0.1.0`.
- Public release verification: `latest.json` contains Linux, Windows, macOS Apple silicon, and macOS Intel URLs. Downloaded `Reminder.Mailroom_0.1.0_amd64.deb` passed its published SHA-256 check (`da6bee48…` in the first run; the final rebuilt asset is represented by the current release checksum).

## Data locations and behavior

Tauri resolves the OS app-data directory for `in.sociobot.reminder-mailroom`. It stores `settings.json`, `rules.json`, and `audit.sqlite3` there. IMAP and SMTP secrets use the operating system credential manager under service `in.sociobot.reminder-mailroom`. Audit CSV exports go to Downloads (or app data when Downloads cannot be resolved).

Each enabled rule searches at most the newest 500 IMAP UIDs matching its explicit subject alternatives. The oldest fetched candidate per normalized thread is considered first. The first matching PDF attachment is the canonical document; later occurrences of either that thread or PDF hash are logged and skipped. SMTP errors are logged and leave the message eligible for a future retry.

## Known gaps

- OAuth-only Microsoft/Google accounts need operator-owned OAuth client registrations and are not supported in v0.1; app-password-capable TLS IMAP/SMTP accounts work. The UI rejects non-TLS IMAP rather than silently downgrading security.
- Automatic checks run while the desktop app is open; there is no background daemon or OS login item.
- Live IMAP/SMTP end-to-end verification requires pilot mailbox credentials, which are intentionally absent from the repository and worker environment. MIME parsing, matching, hashing, persistence paths, UI orchestration, and a full native compile are verified locally.
- SMTP has no universal idempotency key. A process crash in the narrow interval after the server accepts a message but before local SQLite commit could permit one duplicate on retry; ordinary send failures are audited and retry safely.

## Needs operator action

1. The `v0.1.0` workflow completed and published all four platform variants. Preserve the workflow's `contents: write` permission for future releases.
2. Configure the static deployment to run `npm run build:site` and serve `dist/site` at `https://reminder-mailroom.sociobot.in`.
3. Register the `reminder-mailroom` production product and return URL in the Sociobot billing engine; no product IDs belong in this repo.
4. Add signing when certificates are available. Future workflow secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `WINDOWS_CERT_PFX`, and `WINDOWS_CERT_PASSWORD`.
5. Register OAuth clients and add provider authorization flows before advertising support for OAuth-only mailboxes.

## Visual provenance

The art direction, exact prompt, generation model/date, and asset policy are in `.factory/design.md`. Source and prompt sidecars are under `assets/src/`; optimized shipping files are under `public/assets/`. The site footer discloses generated imagery.
