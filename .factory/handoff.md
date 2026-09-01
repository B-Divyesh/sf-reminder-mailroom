# Reminder Mailroom repair handoff

## Outcome

Release-blocking findings from verifier report `5af4c694507001968c8acd9e5422133d05fd60a2` are repaired in version 0.3.0. The Tauri 2 desktop-app and static-site deployment classes are unchanged. The researched brief and visual thesis are unchanged.

The shared checkout remains operator-gated. Product pages now state that checkout is being enabled and contain no dead checkout link. Existing license restore and verification remain available. No shared billing, database, key-vault, DNS, or unrelated service resource was read or changed.

## Repairs

- Mail candidates are sorted by ascending IMAP UID before any decision. A chained reminder can no longer win because its RFC thread key sorts before the original.
- Dry-run previews keep an in-memory set of canonical thread IDs, aliases, and PDF hashes. Later messages in the same preview are now skipped without writing SQLite records.
- Duplicate messages add their RFC aliases to the saved canonical. A later reply linked only through an intermediate reminder still resolves to the original.
- Mailbox scans use read-only `EXAMINE`, server-side subject plus sender matching, and `UID BODY.PEEK[]`. They do not request flag mutations.
- Passwords and OAuth tokens now pass through an explicit operating-system credential-store boundary. Rules remain JSON; hashes and audit entries remain SQLite in the app data directory.
- The release workflow runs the full native suite on Linux, embeds the source commit in the desktop UI, publishes it in `latest.json`, requires all six packages, and generates `SHA256SUMS`.
- Privacy, safety, purchase, release-integrity, license-cache, and installer promises now have one exact `@claim:` regression each. `.factory/claims.json` contains 23 claims and 23 unique tags.
- Landing, demo, legal, and desktop controls are at least 44 CSS px at 390 px. Essential mobile copy is at least 16 px; the mobile body is 17 px.
- The unsupported future-update promise and dead checkout action were removed. Purchase copy now matches the operator-gated state.

## Reproduction and regression evidence

The two controller-required failures were added before their fixes and reproduced against the verifier candidate:

- chained chronology: expected the original PDF first but received the final reminder first;
- same-scan dry run: expected `preview, skipped` but received `preview, preview`.

The fixed regressions are `claim_oldest_canonical_chained_reminders_keep_mailbox_chronology` and `claim_stateful_dry_run_models_earlier_decisions_in_the_same_scan` in `src-tauri/src/desktop.rs`. The chronology test uses reversed fetch order and adversarial `In-Reply-To`/`References`, then proves the original hash wins and both reminders skip. The dry-run test proves one preview, one skip, and zero canonical or audit writes.

## Local verification

Executed after a clean `npm ci`:

```sh
npm test
npm run test:native
npm run typecheck
npm run lint
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm run test:installer
npm run test:e2e
npm run build
```

Results:

- Vitest: 7 passed.
- Reduced Rust core: 3 passed.
- Full native Rust: 15 passed.
- Playwright: 19 passed.
- POSIX installer consumer check: passed on Linux; the equivalent PowerShell fixture runs in the Windows release job.
- All 22 locally applicable claim commands passed independently. The Windows-only claim is enforced by the Windows release runner.
- TypeScript, ESLint, Rust formatting, JSON validation, and `git diff --check`: passed.
- Production build: `dist/app` and `dist/site` created. Largest initial site JS is 3.85 KB raw / 1.72 KB gzip; CSS is 17.22 KB raw / 4.44 KB gzip. The mobile hero is 14.89 KB.
- Local production `verify-url.sh`: landing and demo returned 200 with no console errors, one `h1`, `lang=en`, a main landmark, complete image alt attributes, and labeled buttons.
- Standalone axe-core CLI 4.10.3: 0 violations on landing and demo. Playwright axe also found no serious or critical violations across desktop, 390 px, light, and dark flows.
- Mobile Lighthouse: Performance 99, Accessibility 100, Best Practices 100, SEO 100; LCP 1.7 s, CLS 0, total blocking time 0 ms.
- Keyboard focus/skip link, dialog focus trap and return, 200% text, reduced motion, offline reload, service-worker cache update, request privacy, and 390 px touch targets all passed in Playwright.

Local browser evidence is in `.factory/evidence/repair-3/local/`.

## Release and deployment evidence

Version 0.3.0 is ready for the `v0.3.0` tag. The release workflow will build unsigned `.dmg` packages for Apple silicon and Intel, Windows `.msi`/`.exe`, Linux `.AppImage`, `.deb`, and `.rpm`, then attach `SHA256SUMS` and source-bound `latest.json`. Exact release asset and live deployment evidence is appended after those jobs complete.

## Known gaps and operator action

- Enable/register the shared `reminder-mailroom` checkout route in the Sociobot billing engine, then verify the hosted return flow. This work order explicitly forbids changing that shared resource.
- Provide Apple and Windows signing credentials if signed packages are required. The workflow intentionally publishes unsigned builds until certificates are supplied (`APPLE_CERTIFICATE`, `WINDOWS_CERT_PFX`, plus their passwords if the signing action is enabled).
- `imap-proto 0.10.2` emits an upstream future-incompatibility warning. Current tests and builds pass.
