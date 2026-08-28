# Reminder Mailroom — visual thesis

## Direction: glacial minimal ceramics

Reminder Mailroom should feel like placing one paper invoice into a cool, quiet porcelain archive tray: deliberate, legible, and final. The visual language combines blue-white ceramic planes, fine cobalt rules, and small clay-red stamps. It avoids both accounting-dashboard density and generic SaaS gloss. Decoration is only used to explain the product's central action: many messages approach; one canonical record crosses the archive threshold.

The light treatment is the product default and paints every surface explicitly. A dark “kiln” treatment follows the OS preference: blue-black slate replaces ice, with chalk-white type and the same restrained mineral accents.

## Tokens

| Role | Light | Dark | Rationale |
| --- | --- | --- | --- |
| background | `#f3f6f4` | `#10191c` | blue-white porcelain / kiln interior |
| surface | `#fbfcf8` | `#172428` | warm glaze / raised fired shelf |
| text | `#152d35` | `#ecf4f1` | deep mineral ink / chalk |
| muted text | `#52686e` | `#aec0c0` | weathered slate; ≥4.5:1 |
| accent | `#155d70` | `#78c6d1` | glacial cobalt seal |
| accent contrast | `#ffffff` | `#0c252c` | accessible button text |
| success | `#287553` | `#7ccaa2` | celadon green |
| warning | `#8b5a16` | `#f1c06e` | kiln amber |
| danger | `#9d3e35` | `#ff9c90` | oxide red |
| hairline | `#cbd8d7` | `#365055` | ceramic edge |

## Typography

- Display: `Newsreader`, self-hosted variable WOFF2, used only for the wordmark, the single h1, and numeric outcome statements. Its soft calligraphic contrast gives the interface a crafted, archival character.
- Utility: `Atkinson Hyperlegible Next`, self-hosted WOFF2, for body, labels, rules, tables, and buttons. Open forms keep addresses, hashes, and timestamps readable.
- Scale: 14 / 16 / 18 / 24 / clamp(40–68) px. Body is never below 16 px. Tabular figures are enabled for logs and metrics.

## Space, shape, and depth

An 8 px base rhythm, with 4 px only for optical tightening. Content measure is 1184 px; text measure is 68 characters. Corners are asymmetric and modest (6–18 px), recalling slip-cast trays rather than app-store pills. Layering uses 1 px mineral rules, very soft under-shelf shadows, and overlapping paper edges. Cards exist only for distinct rules or audit entries. Touch targets are at least 44 px.

The desktop app uses a narrow persistent rail for setup → rules → activity. At 760 px it becomes a horizontal step bar and all two-column forms stack. At 390 px, secondary explanatory copy shortens, tables become labeled rows, and the primary action remains in normal flow so it never obscures content or safe areas.

## Interaction grammar

- A rule is a “sorting tile”: selection receives a cobalt inset line and status word, not color alone.
- Connection checks show immediate progress, then a textual success/error result in a polite live region.
- New audit events enter from the mail slot (8 px upward movement + opacity, 180 ms).
- Destructive changes name the exact rule, require confirmation, and retain a 10-second undo affordance.
- Empty, offline, processing, and failure states all explain the next action.
- Keyboard: skip link, logical tab order, Enter/Space activation, Escape closes dialogs, focus returns to its trigger.

## Motion policy

Motion is sparse and physical: 180 ms cubic-bezier(.2,.7,.2,1) for tray selection and audit arrival; 240 ms for dialogs. No loops or parallax. With `prefers-reduced-motion: reduce`, transforms and smooth scrolling are removed and state changes are instantaneous with opacity retained only where useful.

## Asset plan and provenance

- Landing hero: an original still-life of a porcelain mail-sorting tray with multiple translucent reminder envelopes held behind one crisp invoice crossing a cobalt archive slot. It explains deduplication without showing a fake product UI.
- Interface icons: original inline SVG strokes authored in-repository; no icon library.
- App mark: an authored SVG combining an envelope flap with a single archive slot.

### Hero prompt sheet

Use case: `stylized-concept`. Asset type: wide landing-page hero. Subject: a sculptural ceramic mailroom sorting tray; three thin frosted paper envelopes approach from the left, but only one clean invoice sheet passes through a narrow cobalt archive slot on the right. World/materials: matte bone porcelain, translucent vellum, glazed cobalt channel, one tiny terracotta wax dot. Light/lens: cool diffuse northern studio light, gentle contact shadows, 55 mm editorial still-life, slightly elevated three-quarter view. Palette words: glacier white, mineral blue, fog grey, celadon trace, oxide red. Composition: wide, object weighted to the right with calm negative space, no interface screenshot. Negative list: no people, hands, legible writing, letters, logos, brands, watermark, gradients, neon, glossy plastic, generic 3D app icons, clutter, duplicate slot exits.

Generated on 2026-08-28 with the factory Azure image deployment (`factory-image`) via `/opt/fleet/lib/gen-image.sh`. The selected image is original to this product; source PNG and exact prompt sidecar are retained under `assets/src/`. WebP derivatives are generated locally. Generated imagery is disclosed in the site footer.
