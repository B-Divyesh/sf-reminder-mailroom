# Reminder Mailroom verification 6 handoff

## Outcome

**FAIL — 3 findings, including 1 untested claim.**

Implementation `dbc990f92e1aa1e14db6746d17b59f3cda853a7f` was verified independently. Documentation baseline is `0e03cafea21927d78071e2cadf28163097bcd8e3`; later commit `5c4a9a1e33fa1b71407475240a1c484a7044f6ca` changes Graphify output only.

The complete report is in `.factory/verification-6.md`. No product code or deployment was changed.

## Findings to repair

1. The published v0.3.0 desktop release records source `214603375c4f3c76bf9ee0b38db72df84144f522`, not candidate `dbc990f`. It therefore retains the older Plus heading and is not the reviewed implementation. Publish a new versioned release from the accepted source.
2. The declared `oauth-provider-setup` command mocks immediate success and does not test the public OAuth promise through callback, PKCE exchange, refresh, credential storage, and XOAUTH2 use. Add a deterministic native provider fixture and claim-tagged end-to-end test.
3. `/work/.evidence/billing-offer.json`, named by the repair handoff and work order, is absent. Restore the non-secret billing operator metadata.

## Verified working behavior

- All 23 declared commands ran from a clean detached checkout. Twenty-two claims are fully covered; the OAuth command passes but has incomplete outcome coverage.
- `npm test`, full native tests, 21 Playwright tests, both installer tests, typecheck, strict lint, Rust formatting, and the production build pass.
- Fresh live desktop and phone demos show 1 archived, 2 skipped, and 1 forwarded. Reset preserves a separate real-data sentinel, the sample label persists, and normal flows have no console errors.
- The live website matches all 28 publicly served candidate build files by SHA-256.
- Twenty live axe scans found zero serious or critical results. `verify-url.sh` passes landing, demo, Privacy, and Terms.
- Offline reload, service-worker cache replacement, keyboard focus, reduced motion, 200% text, 44 px controls, route titles, legal pages, security headers, caching, links, and designed HTTP 404 behavior pass.
- Mobile Lighthouse: 100 Performance, 100 Accessibility, 100 Best Practices, 100 SEO; LCP 1.4 s, TBT 0 ms, CLS 0, 120 KiB transfer.
- v0.3.0 publishes all required platform packages and integrity files. The downloaded Debian package matches both checksum sources and stays running in an isolated 12-second smoke test.
- The license API rate limit returned 429 starting at request 31 with `Retry-After`.

## Expected external checkout block

The public checkout endpoint still returns HTTP 404. Per this work order, that deliberate response is expected and is not a product finding while the live interface shows the $29 offer without a link or checkout request. Existing license restore remains available.

After billing enables the offer, add the hosted purchase link and verify the real redirect, returned token storage, and entitlement response. Do not embed a payment provider.

## Commands

```sh
npm ci
npm test
npm run test:native
npm run test:e2e
npm run test:installer
npm run test:installer:windows
npm run typecheck
npm run lint
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm run build
```

## Operator action

- Enable the one-time US $29 `reminder-mailroom` offer after restoring the missing non-secret offer metadata.
- Provide Apple and Windows signing material when signed packages are required. No credential was read, written, or reported during this verification.
