# Reminder Mailroom

Reminder Mailroom is a local desktop companion for solo businesses that send payment reminders. It keeps one canonical invoice in an accounting archive while later reminders continue normally.

Live site: <https://reminder-mailroom.sociobot.in>

One-click sample: <https://reminder-mailroom.sociobot.in/demo/>

## What it does

The app searches the IMAP mailbox and subjects you choose. It reads matching PDFs without marking source messages as read. RFC message IDs connect an original invoice with its replies; unrelated invoices with the same subject stay separate. The first PDF in a linked invoice thread is sent to your accounting mailbox over SMTP. Later copies, including regenerated PDFs in that thread, are skipped and recorded in a local SQLite audit. A process-wide scan gate prevents overlapping manual and scheduled scans from delivering the same canonical invoice twice.

The bundled demo contains three messages for invoice #1042. One is the original, one repeats its PDF, and one has a changed PDF. Running the sample produces one archive decision and two duplicate decisions. The demo uses only `demo:reminder-mailroom` browser storage and works offline after its first visit.

The installed app also includes **Load sample project** on its first screen. It loads the same three-message result in memory and does not write to your mailbox settings, rules, or audit history.

## Sign in to mail

Choose either method in **Mailboxes**:

- App password: supported by any provider that permits TLS IMAP and SMTP app passwords.
- OAuth 2.0: supported for Google and Microsoft with Authorization Code + PKCE, a loopback callback, XOAUTH2 for IMAP and SMTP, and automatic refresh.

OAuth needs a desktop client ID from your own provider account. For Google, create a Desktop OAuth client and enable Gmail access. For Microsoft, register a public desktop client and allow loopback redirects. Paste the client ID, choose the provider, then select **Connect with OAuth**. Client IDs and non-secret settings use local JSON. Passwords, access tokens, and refresh tokens use the operating system credential manager.

## Privacy and safety

Mail content travels directly between the desktop app and the configured mail servers. The website has no analytics, ads, or third-party fonts. It requests only public release metadata from `api.github.com`; license actions use `api.sociobot.in`. Every claim and its deterministic verification command is listed in [.factory/claims.json](.factory/claims.json).

## Install

The [download page](https://reminder-mailroom.sociobot.in/#download) selects a published macOS, Windows, or Linux asset from the CORS-enabled GitHub API.

```sh
curl -fsSL https://reminder-mailroom.sociobot.in/install.sh | sh
```

```powershell
irm https://reminder-mailroom.sociobot.in/install.ps1 | iex
```

Packages are open source and currently unsigned. macOS and Windows may show a first-open warning. Each GitHub Release includes `SHA256SUMS`. Its `latest.json` records the exact source commit and six package URLs. The install scripts verify SHA-256 before installing.

## Develop and verify

Use Node 22+, Rust stable, and the Tauri 2 system libraries for your OS.

```sh
npm ci
npm test
npm run test:native
npm run test:e2e
npm run test:installer
npm run typecheck
npm run lint
npm run build
```

`npm run build` is the clean production build and creates `dist/app` plus `dist/site`. Static deployment serves `dist/site`. Native packages are built only by [.github/workflows/release.yml](.github/workflows/release.yml) on the four GitHub runner targets.

On Ubuntu/Debian, install `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, and `patchelf` before a full desktop build.

## Purchase

The free edition includes one rule, manual processing, and audit CSV export. Mailroom Plus costs US $29 once. It adds unlimited rules and checks while the app is open. New checkout remains operator-gated until the product route is enabled. Existing license verification uses the Sociobot billing API.

## Repository map

- `app/` — Tauri webview UI
- `src-tauri/` — Rust mail, OAuth, keychain, hashing, SQLite, and packaging core
- `site/` — static product, demo, privacy, terms, and 404 pages
- `public/install.*` — checksum-verifying installers
- `.factory/` — brief, visual thesis, claims, demo contract, copy audit, and handoff

## License

MIT. See [LICENSE](LICENSE).
