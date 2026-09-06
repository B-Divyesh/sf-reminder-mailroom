# Reminder Mailroom repair 5 handoff

## Outcome

Implementation commit: `dbc990f92e1aa1e14db6746d17b59f3cda853a7f`.

The product-owned repair is deployed to `https://reminder-mailroom.sociobot.in/`. It removes the attempted background fetch of the unavailable checkout endpoint. That fetch turned the operator-owned HTTP 404 into a browser console error when visitors reached pricing. The landing page and desktop app now show the exact $29 one-time Mailroom Plus offer, existing license restore, and a non-navigating **Checkout is being enabled** state. The state is consistent with the live billing service and does not send a visitor to a known error page.

The paid edition has not been removed or made free. The free edition remains useful with one rule, manual processing, and audit CSV export. Plus remains defined as unlimited explicit rules and automatic checks while the app is open.

The actual purchase failure cannot be repaired inside this repository: `https://api.sociobot.in/api/v1/products/reminder-mailroom/checkout` still returns HTTP 404 for the public product. Billing registration is owned by the separate controller operator, and this work did not read or change billing configuration. Required public offer metadata was written to `/work/.evidence/billing-offer.json`; it contains no credential. The plain catalog description is in `.factory/catalog-description.txt` and was copied to `/work/.evidence/catalog-description.txt`.

## Repair and regression coverage

- Removed checkout-availability probing and its checkout URL dependency from the static landing page and Tauri app. The page no longer makes a billing request merely because a visitor scrolls to pricing.
- Kept existing license validation and restore intact. The billing API is contacted only after a person explicitly restores a license.
- Made the desktop pricing heading and unavailable message direct and plain.
- Restored privacy and README wording to describe the actual request boundary and current operator-gated purchase state.
- Replaced the old “available checkout” test with an outcome test. It proves the exact price and Plus features appear, the disabled control cannot navigate, and the browser makes zero checkout requests. The website privacy test now proves that the normal landing flow contacts only the documented GitHub release API externally.
- Added `.env` to `.gitignore`; the deployment CLI's temporary local credential file was removed without being read.

## Clean local verification

From a clean `npm ci` install (167 packages, 0 reported vulnerabilities), the following all passed after documented native prerequisites were installed:

```sh
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

- Vitest: 7 passed. Reduced Rust core: 3 passed. Full native Rust: 15 passed. Playwright: 21 passed.
- Every one of the 23 commands declared by `.factory/claims.json` passed individually. Each `@claim:` tag occurs exactly once.
- POSIX and PowerShell installer consumer fixtures passed, including checksum verification.
- TypeScript, ESLint, strict Clippy, and Rust formatting passed. Cargo still prints the upstream `imap-proto 0.10.2` future-incompatibility notice; it is not a Reminder Mailroom lint warning.
- The production build produces `dist/app` and `dist/site`. The landing JavaScript is 3.85 KB raw / 1.72 KB gzip; the largest CSS file is 17.22 KB raw / 4.44 KB gzip.
- `/opt/fleet/lib/verify-url.sh` passed `/`, `/demo/`, `/privacy/`, and `/terms/` against the production build: one h1, `lang=en`, a main landmark, complete image alt text, labelled buttons, and no console errors.
- Playwright Axe scanned landing, demo, Privacy, Terms, and the designed 404 at desktop and 390 px in light/dark combinations. It found 0 serious or critical issues. This is the allowed Playwright Axe integration; the standalone Axe CLI could not launch because the worker has no system Chrome binary.

Local evidence is under `.factory/evidence/repair-5/local/`.

## Deployment and live verification

`dist/site` was deployed through the existing durable Static Web Apps configuration to the product-owned `sf-reminder-mailroom` application. The deployment endpoint was `https://gray-cliff-0e617dd10.7.azurestaticapps.net`; the public product origin remains `https://reminder-mailroom.sociobot.in/`. SQLite/process-local settings and product scope were not changed.

- The live landing contains `main-Bc64ZVx8.js`, the final implementation bundle. All 28 publicly served build files match the live files by SHA-256.
- `/`, `/demo/`, `/privacy/`, and `/terms/` return 200 with route-specific titles. An unknown URL returns the designed **Page not found** screen with the expected HTTP 404 and a home link.
- Fresh desktop and 390 px browser contexts reported the first-screen job as “Archive one invoice from every reminder thread”; the audience is solo businesses that send payment reminders; the first action is “Try it with sample data.” Neither viewport had horizontal overflow.
- In both fresh contexts, the one-click demo showed the persistent sample banner, sorted the realistic sample to 1 archived invoice, 2 duplicates skipped, and 1 forwarded message, then Reset demo removed only `demo:reminder-mailroom`, preserved a separate real-data sentinel, and returned focus to **Run sample sort**.
- Fresh desktop and phone flows had zero console errors. Their only external normal-flow request was the documented GitHub release metadata request; neither made a checkout request. The price control had no `href` and remained `aria-disabled=true`.
- Live `verify-url.sh` checks passed on landing, demo, Privacy, and Terms. Live Playwright Axe found 0 serious/critical issues across those routes and the 404 on desktop and phone.
- Live responses retain the expected CSP, `nosniff`, and strict referrer policy. HTML uses 30-second revalidation and hashed assets use one-year immutable caching.

Live evidence is under `.factory/evidence/repair-5/live/`.

## Remaining blocker and next action

This is not a successful paid-product release: a new customer still cannot purchase Mailroom Plus. The public checkout route is an operator-owned dependency and returns 404. The controller must register and enable the exact `reminder-mailroom` one-time US $29 offer and return URL recorded in `/work/.evidence/billing-offer.json`. After it is live, a follow-up must add the plain hosted checkout link and verify the real redirect, returned license storage, and entitlement verification on the HTTPS product.

MacOS and Windows artifacts also remain unsigned until the operator provides signing material. No secrets were read, stored, committed, or reported during this repair.
