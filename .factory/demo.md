# Reminder Mailroom sample demo

- URL: `https://reminder-mailroom.sociobot.in/demo/`
- Local URL: `http://127.0.0.1:4173/demo/` after `npm run dev:site`
- Sample: invoice #1042, an unchanged-PDF reminder, and a final reminder with a regenerated PDF.
- Expected result: one canonical invoice archived, two duplicates skipped, one forwarded message.
- Storage: only the `demo:reminder-mailroom` localStorage key. The demo does not read production app storage.
- Reset: choose **Reset demo** in the persistent banner. **Start for real** clears demo state and opens the download section.
- Network boundary: the demo uses same-origin static files only. It never contacts mail, billing, analytics, or GitHub services.
- Installed app sample: **Load sample project** on the first-run Mailboxes screen returns the same three-message result from bundled in-memory data. It does not write to the real settings, rules, or audit storage and does not contact a mailbox.
