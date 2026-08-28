# Reminder Mailroom

Reminder Mailroom is a local desktop companion for solo businesses that need one canonical invoice in an accounting archive without suppressing ordinary payment reminders.

It connects directly to an invoice mailbox over IMAP, applies only the subject/sender rules you create, identifies the first PDF in each invoice thread, forwards that PDF to an accounting archive over SMTP, and records every archive or skipped duplicate in a local SQLite audit trail. It does not generate invoices, move source mail, or provide bookkeeping.

Live site: <https://reminder-mailroom.sociobot.in>

## Who it is for

Use Mailroom when an invoicing tool BCCs every outbound message to accounting and reminders create duplicate records. It is deliberately narrow: the sending workflow stays unchanged, while the archive receives one searchable canonical PDF.

## Privacy and safety

- Mail content travels only between the computer and the configured IMAP/SMTP servers.
- The app searches only explicit subject terms and optional senders.
- IMAP reads use `BODY.PEEK[]`, so source messages are not marked read, moved, or deleted.
- Passwords are stored in the operating system credential manager; rules and non-secret settings are plain local JSON.
- PDF SHA-256 hashes, normalized thread keys, and audit events are stored in local SQLite.
- Preview mode never forwards mail. The full audit CSV export is free.
- There is no telemetry, behavioral analytics, or third-party runtime code.

Use a provider app password with TLS IMAP and TLS/STARTTLS SMTP. Providers that allow only OAuth are not yet supported because a distributable provider client registration is required.

## Install

The [download page](https://reminder-mailroom.sociobot.in/#download) detects macOS, Windows, or Linux and reads the checksum manifest from the latest GitHub Release.

```sh
curl -fsSL https://reminder-mailroom.sociobot.in/install.sh | sh
```

```powershell
irm https://reminder-mailroom.sociobot.in/install.ps1 | iex
```

The v0.1 desktop packages are open-source but unsigned. On macOS, Control-click the app and choose **Open** the first time. Windows may show a SmartScreen publisher warning. The install scripts verify SHA-256 before opening or placing an artifact.

## Develop

Prerequisites: Node 22+, Rust stable, and the Tauri 2 system dependencies for your OS.

```sh
npm ci
npm run dev          # app UI in a browser
npm run dev:site     # landing site
npm run tauri dev    # native desktop app
```

On Ubuntu/Debian, the desktop build uses:

```sh
sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

## Test and build

```sh
npm test             # TypeScript tests + platform-independent Rust core tests
npm run test:e2e     # Chromium, axe, keyboard, and 390 px checks
cargo test --manifest-path src-tauri/Cargo.toml  # full native tests when Tauri system libs exist
npm run build        # dist/app and dist/site
npm run build:site   # exact static deploy output: dist/site
npm run tauri build  # native packages for the current platform
```

The tag-triggered workflow in `.github/workflows/release.yml` builds `.dmg` for Apple silicon and Intel, `.msi`/`.exe` for Windows, and `.AppImage`/`.deb` for Linux. It publishes the installers plus `SHA256SUMS` and `latest.json` to a GitHub Release. Platform binaries are never produced by the factory worker.

## Purchase

The free edition supports one rule, manual sorting, and complete audit export. Mailroom Plus is a $29 one-time purchase for unlimited rules and scheduled checks while the app is open. Checkout and license verification use only the Sociobot billing API; no payment provider is embedded in this repository.

## Repository map

- `app/` — Tauri webview UI and product logic
- `src-tauri/` — Rust IMAP, SMTP, keychain, hashing, SQLite, and packaging core
- `site/` — static download, privacy, and terms pages
- `public/install.*` — checksum-verifying installers
- `.factory/design.md` — visual system and generated-art provenance
- `.factory/handoff.md` — verification and operator handoff

## License

MIT. See [LICENSE](LICENSE).
