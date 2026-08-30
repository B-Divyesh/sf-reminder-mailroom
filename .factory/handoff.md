# Reminder Mailroom independent verification handoff

## Outcome

**FAIL — do not release candidate `4592e686b42149e6df67f21597a7ee1bebb5a38b`.**

Tested on 2026-08-30 against <https://reminder-mailroom.sociobot.in/>. Full evidence and reproduction details are in [verification-2.md](verification-2.md).

## Release blockers

- The live **Buy Mailroom Plus** endpoint returns HTTP 404, so the advertised $29 one-time purchase cannot be completed.
- Native deduplication uses normalized subject as a globally unique thread key. Separate clients or recurring invoice threads with the same subject can lose a required canonical archive record.
- Concurrent scans can both send before either writes the SQLite canonical row, allowing duplicate delivery.
- Material site/README claims about mailbox privacy, keychain storage, oldest-message selection, installer checksum verification, and purchase functionality are absent from `.factory/claims.json`.
- Live axe scans find serious dark-theme contrast failures and unnamed mobile home links on Privacy, Terms, and 404.
- The delete alert dialog leaks keyboard focus and does not close with Escape.
- The macOS shell installer uses GNU-only `find -maxdepth`, so the advertised one-line install is not portable to stock macOS.
- The desktop artifact lacks the required installed first-run sample flow and captioned walkthrough.

## What passed

- Cold first-read and one-click `/demo/` gate.
- All eight exact claim commands after `npm ci`.
- `npm test`: 6 Vitest + 3 reduced Rust tests.
- Full `cargo test --manifest-path src-tauri/Cargo.toml`: 7 native tests after installing the documented Linux Tauri prerequisites.
- `npx tsc --noEmit`.
- `npm run build`: produced `dist/app` and `dist/site`; bundles are within budget.
- `npm run test:e2e`: 12 passed.
- Live static files match the candidate build by SHA-256; headers, immutable asset caching, routes, 404, privacy request boundary, offline reload, and service-worker cache update behavior pass.
- Successful fresh Lighthouse: 100/100/100/100, LCP 1.4 s, TBT 10 ms, CLS 0.
- Release run `33297139260` passed all platform jobs; v0.2.0 has all required formats, manifest, and checksums. Fresh RPM and DEB checksum/extraction checks passed.
- License verification allowance: requests 1–30 returned 200; request 31 returned 429 with `Retry-After: 3`.

## How to reproduce

```sh
npm ci
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npx tsc --noEmit
npm run build
npm run test:e2e
```

Run every declared claim independently using the exact commands in `.factory/claims.json`. On Ubuntu, install the Tauri packages documented in README before the full default-feature Rust test.

## Scope and safety

No product code, deployment, infrastructure, DNS, database, app setting, secret, or unrelated service was changed. Only this verification report and handoff were authored. Pre-existing `graphify-out` worktree changes were preserved and excluded from the verifier commit.
