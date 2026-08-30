import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { BILLING_BASE, LICENSE_CACHE_KEY, LICENSE_KEY, PRODUCT_SLUG, cachedLicense, consumeLicenseFromUrl } from "./core";

type Settings = {
  authMode: string; oauthProvider: string; oauthClientId: string;
  imapHost: string; imapPort: number; imapSecurity: string; imapUsername: string;
  smtpHost: string; smtpPort: number; smtpSecurity: string; smtpUsername: string;
  archiveAddress: string; scanIntervalMinutes: number;
};
type Rule = { id: string; name: string; subjectContains: string; senderContains: string; mailbox: string; enabled: boolean };
type AuditEntry = { id: number; occurredAt: string; subject: string; threadKey: string; pdfHash: string; outcome: string; detail: string };
type AppSnapshot = { settings: Settings | null; rules: Rule[]; audit: AuditEntry[]; archivedCount: number; duplicateCount: number };

const isTauri = "__TAURI_INTERNALS__" in window;
const defaultSettings: Settings = { authMode: "password", oauthProvider: "google", oauthClientId: "", imapHost: "", imapPort: 993, imapSecurity: "tls", imapUsername: "", smtpHost: "", smtpPort: 587, smtpSecurity: "starttls", smtpUsername: "", archiveAddress: "", scanIntervalMinutes: 60 };
let snapshot: AppSnapshot = { settings: null, rules: [], audit: [], archivedCount: 0, duplicateCount: 0 };
let paid = false;
let activeView = "setup";
let lastFocused: HTMLElement | null = null;
let scanTimer = 0;

const icons = {
  setup: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M7 4v6M4 17h16m-5-3v6"/></svg>',
  rules: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v14H4zM4 8l8 6 8-6"/></svg>',
  activity: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h14v16H5zM8 9h8m-8 4h8m-8 4h5"/></svg>',
  license: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 11a4 4 0 1 1 7.7 1.5L21 18v2h-3v-2h-2v-2h-2.2A4 4 0 0 1 8 11Z"/><circle cx="11" cy="11" r=".7" fill="currentColor"/></svg>'
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="app-shell">
    <aside class="rail" aria-label="Application navigation">
      <div class="brand"><img src="/app-mark.svg" alt="" width="38" height="38"><span>Reminder Mailroom</span></div>
      <nav>
        ${navButton("setup", "Mailboxes", icons.setup)}
        ${navButton("rules", "Sorting rules", icons.rules)}
        ${navButton("activity", "Activity", icons.activity)}
        ${navButton("license", "Plus", icons.license)}
      </nav>
      <div class="rail-note"><strong>Local by design</strong>Message content stays between this device and your mail servers.</div>
    </aside>
    <main class="workspace" id="main" tabindex="-1">
      <div class="offline-banner" id="offline"><strong>You’re offline.</strong> Saved rules and activity are still available. Connect before testing or sorting mail.</div>
      <header class="topline">
        <div><p class="eyebrow" id="view-eyebrow">01 · Connect</p><h1>Keep one invoice. Send every reminder.</h1><p class="lede" id="view-lede">Connect the mailbox that sends invoices and the accounting address that should receive exactly one canonical copy.</p></div>
        <div class="connection-pill"><span class="dot" id="connection-dot"></span><span id="connection-label">Not tested</span></div>
      </header>
      ${setupView()}
      ${rulesView()}
      ${activityView()}
      ${licenseView()}
    </main>
  </div>
  <div id="dialog-root"></div><div id="toast-root" aria-live="polite"></div>`;

function navButton(id: string, label: string, icon: string) {
  return `<button class="nav-button" data-view="${id}" aria-current="${id === activeView ? "page" : "false"}">${icon}<span>${label}</span></button>`;
}

function setupView() {
  return `<section class="view active" data-section="setup" aria-labelledby="setup-heading">
    <h2 id="setup-heading">Connect your mailroom</h2>
    <p class="section-intro">Use an app password or connect Google and Microsoft with OAuth. OAuth tokens stay in your operating system keychain.</p>
    <div class="sample-project" id="sample-project"><div><strong>Try the shipped sample first</strong><p>Load three Northstar invoice messages to see one archive and two duplicate decisions. It does not contact a mailbox.</p></div><button class="button secondary" type="button" id="load-sample-project">Load sample project</button></div>
    <form id="settings-form">
      <fieldset><legend>Sign-in method</legend><div class="form-grid">
        ${selectField("auth-mode", "Authentication", [["password", "App password"], ["oauth", "OAuth 2.0"]])}
        <div class="field oauth-field" hidden>${selectField("oauth-provider", "OAuth provider", [["google", "Google"], ["microsoft", "Microsoft"]])}</div>
        <div class="field oauth-field span-2" hidden>${field("oauth-client-id", "Desktop OAuth client ID", "Client ID from your provider console", "text", false, "Use a desktop client with a loopback redirect. Mailroom uses PKCE and never asks for a client secret.")}</div>
        <div class="oauth-field span-2" hidden><button class="button secondary" type="button" id="authorize-oauth">Connect with OAuth</button></div>
      </div></fieldset>
      <fieldset><legend>Invoice mailbox (IMAP)</legend><div class="form-grid">
        ${field("imap-host", "Server", "imap.example.com", "text", true)}
        ${field("imap-port", "Port", "993", "number", true)}
        ${field("imap-user", "Email or username", "you@example.com", "email", true)}
        ${selectField("imap-security", "Security", [["tls", "TLS (recommended)"], ["starttls", "STARTTLS"]])}
        ${field("imap-password", "App password", "Not changed when left blank", "password", false, "Stored in your operating system keychain, never in the settings file.")}
      </div></fieldset>
      <fieldset><legend>Archive delivery (SMTP)</legend><div class="form-grid">
        ${field("smtp-host", "Server", "smtp.example.com", "text", true)}
        ${field("smtp-port", "Port", "587", "number", true)}
        ${field("smtp-user", "Email or username", "you@example.com", "email", true)}
        ${selectField("smtp-security", "Security", [["starttls", "STARTTLS (recommended)"], ["tls", "TLS"]])}
        ${field("smtp-password", "App password", "Not changed when left blank", "password", false, "Stored separately in your operating system keychain.")}
        ${field("archive-address", "Accounting archive address", "archive@accounting.example", "email", true)}
        ${field("scan-interval", "Automatic check interval in minutes", "60", "number", true, "Mailroom Plus checks while the app is open; choose 15–240 minutes.")}
      </div></fieldset>
      <div class="actions"><button class="button" type="submit">Save mailboxes</button><button class="button secondary" type="button" id="test-connection">Test both connections</button></div>
      <p class="status-message" id="settings-status" role="status"></p>
    </form>
    <div class="privacy-strip">${icons.license}<div><strong>Your mail does not pass through us.</strong><p>Reminder Mailroom reads only messages matched by your explicit rules. Passwords and OAuth tokens use the OS keychain. Settings, hashes, and audit history stay on this device.</p></div></div>
  </section>`;
}

function rulesView() {
  return `<section class="view" data-section="rules" aria-labelledby="rules-heading"><h2 id="rules-heading">Visible, reversible sorting rules</h2><p class="section-intro">A message must match a subject term and, when set, the sender. The oldest matching PDF in each invoice thread becomes canonical; later reminders are logged but never forwarded.</p><div id="rule-list" class="rule-list"></div><div class="actions"><button class="button" id="add-rule">Add a sorting rule</button></div><p class="status-message" id="rules-status" role="status"></p></section>`;
}

function activityView() {
  return `<section class="view" data-section="activity" aria-labelledby="activity-heading"><h2 id="activity-heading">A receipt for every decision</h2><p class="section-intro">Preview before forwarding, then run the sort when the result looks right. Mailroom never deletes, moves, or marks source messages read.</p><div class="stats"><div class="stat"><strong id="stat-archived">0</strong><span>Canonical invoices archived</span></div><div class="stat"><strong id="stat-skipped">0</strong><span>Duplicates prevented</span></div><div class="stat"><strong id="stat-rules">0</strong><span>Rules enabled</span></div></div><div class="actions"><button class="button secondary" id="preview-run">Preview matches</button><button class="button" id="archive-run">Archive new originals</button><button class="button quiet" id="export-audit">Export audit CSV</button></div><p class="status-message" id="run-status" role="status"></p><div id="audit-list" class="audit-list"></div></section>`;
}

function licenseView() {
  return `<section class="view" data-section="license" aria-labelledby="license-heading"><h2 id="license-heading">A quiet tool, bought once</h2><p class="section-intro">One rule, manual previews, archiving, and complete audit export are free. Plus is for busy mailrooms that need more rules and automatic checks while the app is open.</p><div class="license-panel"><span class="badge" id="license-badge">Free</span><p class="price">$29 <small>one-time</small></p><ul class="feature-list"><li>Unlimited explicit sorting rules</li><li>Automatic checks every 15–240 minutes while open</li><li>Same local-only processing and full data export</li></ul><a class="button" id="buy-link" href="${BILLING_BASE}/products/${PRODUCT_SLUG}/checkout" target="_blank" rel="noreferrer">Buy Mailroom Plus</a><div class="license-restore"><div class="field"><label for="license-token">Have a license? Paste it here</label><input id="license-token" autocomplete="off" spellcheck="false"><span class="hint">The token is stored only on this device.</span></div><div class="actions"><button class="button secondary" id="restore-license">Verify license</button></div><p class="status-message" id="license-status" role="status"></p></div><p class="legal-note">Sociobot/Dodo is the merchant of record. Refunds are handled there and revoke the license. <a href="https://reminder-mailroom.sociobot.in/privacy" target="_blank">Privacy</a> · <a href="https://reminder-mailroom.sociobot.in/terms" target="_blank">Terms</a></p></div></section>`;
}

function field(id: string, label: string, placeholder: string, type: string, required: boolean, hint = "") {
  return `<div class="field"><label for="${id}">${label}${required ? "" : " <span class=\"hint\">(optional when already saved)</span>"}</label><input id="${id}" name="${id}" type="${type}" placeholder="${placeholder}" ${required ? "required" : ""} ${type === "number" ? 'min="1" max="65535"' : ""}>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
}
function selectField(id: string, label: string, options: string[][]) { return `<div class="field"><label for="${id}">${label}</label><select id="${id}">${options.map(([v,l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>`; }

function safe(value: unknown) { const e = document.createElement("span"); e.textContent = String(value ?? ""); return e.innerHTML; }
function $<T extends HTMLElement>(selector: string) { return document.querySelector<T>(selector)!; }

async function call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isTauri) throw new Error("Open the installed desktop app to connect mail servers.");
  return invoke<T>(command, args);
}

async function loadState() {
  if (isTauri) {
    try { snapshot = await call<AppSnapshot>("get_snapshot"); }
    catch (error) { toast(`Could not open local data: ${String(error)}`, true); }
  }
  fillSettings(); renderRules(); renderAudit(); configureSchedule();
}

function fillSettings() {
  const s = snapshot.settings ?? defaultSettings;
  const values: Record<string, string | number> = { "auth-mode": s.authMode, "oauth-provider": s.oauthProvider, "oauth-client-id": s.oauthClientId, "imap-host": s.imapHost, "imap-port": s.imapPort, "imap-user": s.imapUsername, "imap-security": s.imapSecurity, "smtp-host": s.smtpHost, "smtp-port": s.smtpPort, "smtp-user": s.smtpUsername, "smtp-security": s.smtpSecurity, "archive-address": s.archiveAddress, "scan-interval": s.scanIntervalMinutes };
  for (const [id, value] of Object.entries(values)) { const node = $<HTMLInputElement | HTMLSelectElement>(`#${id}`); node.value = String(value); }
  updateAuthFields();
}

function readSettings(): Settings { return { authMode: $<HTMLSelectElement>("#auth-mode").value, oauthProvider: $<HTMLSelectElement>("#oauth-provider").value, oauthClientId: $<HTMLInputElement>("#oauth-client-id").value.trim(), imapHost: $<HTMLInputElement>("#imap-host").value.trim(), imapPort: Number($<HTMLInputElement>("#imap-port").value), imapSecurity: $<HTMLSelectElement>("#imap-security").value, imapUsername: $<HTMLInputElement>("#imap-user").value.trim(), smtpHost: $<HTMLInputElement>("#smtp-host").value.trim(), smtpPort: Number($<HTMLInputElement>("#smtp-port").value), smtpSecurity: $<HTMLSelectElement>("#smtp-security").value, smtpUsername: $<HTMLInputElement>("#smtp-user").value.trim(), archiveAddress: $<HTMLInputElement>("#archive-address").value.trim(), scanIntervalMinutes: Number($<HTMLInputElement>("#scan-interval").value) }; }

function updateAuthFields() {
  const oauth = $<HTMLSelectElement>("#auth-mode").value === "oauth";
  document.querySelectorAll<HTMLElement>(".oauth-field").forEach((node) => { node.hidden = !oauth; });
  document.querySelectorAll<HTMLElement>("#imap-password, #smtp-password").forEach((node) => { node.closest<HTMLElement>(".field")!.hidden = oauth; });
}

function applyProviderDefaults() {
  if ($<HTMLSelectElement>("#auth-mode").value !== "oauth") return;
  const microsoft = $<HTMLSelectElement>("#oauth-provider").value === "microsoft";
  $<HTMLInputElement>("#imap-host").value = microsoft ? "outlook.office365.com" : "imap.gmail.com";
  $<HTMLInputElement>("#imap-port").value = "993";
  $<HTMLInputElement>("#smtp-host").value = microsoft ? "smtp.office365.com" : "smtp.gmail.com";
  $<HTMLInputElement>("#smtp-port").value = "587";
  $<HTMLSelectElement>("#smtp-security").value = "starttls";
}

function renderRules() {
  const host = $("#rule-list");
  if (!snapshot.rules.length) { host.innerHTML = `<div class="empty"><div class="empty-mark" aria-hidden="true"></div><h3>No sorting rules yet</h3><p>Add the invoice subject or sender you recognize. Nothing is read until a rule exists.</p></div>`; return; }
  host.innerHTML = snapshot.rules.map((r) => `<article class="rule-card ${r.enabled ? "enabled" : ""}"><div><div class="meta"><span class="badge">${r.enabled ? "Enabled" : "Paused"}</span><span>Mailbox: ${safe(r.mailbox)}</span></div><h3>${safe(r.name)}</h3><p>Subject contains <strong>${safe(r.subjectContains)}</strong>${r.senderContains ? ` · Sender contains <strong>${safe(r.senderContains)}</strong>` : ""}</p></div><div class="rule-actions"><button class="icon-button" data-edit-rule="${safe(r.id)}" aria-label="Edit ${safe(r.name)}">✎</button><button class="icon-button" data-delete-rule="${safe(r.id)}" aria-label="Delete ${safe(r.name)}">×</button></div></article>`).join("");
  host.querySelectorAll<HTMLElement>("[data-edit-rule]").forEach((b) => b.addEventListener("click", () => openRuleDialog(snapshot.rules.find(r => r.id === b.dataset.editRule))));
  host.querySelectorAll<HTMLElement>("[data-delete-rule]").forEach((b) => b.addEventListener("click", () => confirmDelete(b.dataset.deleteRule!)));
}

function renderAudit() {
  $("#stat-archived").textContent = String(snapshot.archivedCount);
  $("#stat-skipped").textContent = String(snapshot.duplicateCount);
  $("#stat-rules").textContent = String(snapshot.rules.filter(r => r.enabled).length);
  const host = $("#audit-list");
  if (!snapshot.audit.length) { host.innerHTML = `<div class="empty"><div class="empty-mark" aria-hidden="true"></div><h3>The audit shelf is empty</h3><p>Preview your enabled rules to see what would be archived. A real run records every forward, duplicate, and error here.</p></div>`; return; }
  host.innerHTML = snapshot.audit.map((a) => `<article class="audit-row"><time datetime="${safe(a.occurredAt)}">${safe(new Date(a.occurredAt).toLocaleDateString())}</time><div class="audit-subject"><strong>${safe(a.subject)}</strong><br><span class="hint">${safe(a.detail)}</span></div><span class="audit-hash" title="${safe(a.pdfHash)}">${safe(a.pdfHash.slice(0, 12) || "—")}</span><span class="outcome ${safe(a.outcome)}">${outcomeLabel(a.outcome)}</span></article>`).join("");
}
function outcomeLabel(v: string) { return ({ archived: "Archived once", skipped: "Duplicate skipped", preview: "Preview match", error: "Needs attention" } as Record<string,string>)[v] ?? v; }

function openRuleDialog(rule?: Rule) {
  if (!paid && !rule && snapshot.rules.length >= 1) { switchView("license"); setStatus("#license-status", "The free mailroom includes one active rule. Plus unlocks unlimited rules."); return; }
  lastFocused = document.activeElement as HTMLElement;
  $("#dialog-root").innerHTML = `<div class="dialog-backdrop" role="presentation"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rule-dialog-title"><h2 id="rule-dialog-title">${rule ? "Edit" : "Add"} sorting rule</h2><form id="rule-form"><div class="form-grid"><div class="field span-2"><label for="rule-name">Rule name</label><input id="rule-name" required value="${safe(rule?.name ?? "")}" placeholder="Client invoices"></div><div class="field span-2"><label for="rule-subject">Subject contains</label><input id="rule-subject" required value="${safe(rule?.subjectContains ?? "invoice")}" aria-describedby="subject-hint"><span class="hint" id="subject-hint">Comma-separated terms are alternatives. Matching ignores letter case.</span></div><div class="field"><label for="rule-sender">Sender contains <span class="hint">(optional)</span></label><input id="rule-sender" value="${safe(rule?.senderContains ?? "")}" placeholder="billing@client.com"></div><div class="field"><label for="rule-mailbox">Mailbox</label><input id="rule-mailbox" required value="${safe(rule?.mailbox ?? "INBOX")}"></div><div class="field"><label><input id="rule-enabled" type="checkbox" ${rule?.enabled === false ? "" : "checked"}> Rule enabled</label></div></div><div class="actions"><button class="button" type="submit">Save rule</button><button class="button secondary" type="button" id="cancel-dialog">Cancel</button></div><p class="status-message" id="dialog-status" role="status"></p></form></div></div>`;
  const dialog = $(".dialog"); const first = $<HTMLInputElement>("#rule-name"); first.focus();
  $("#cancel-dialog").addEventListener("click", closeDialog);
  $(".dialog-backdrop").addEventListener("mousedown", e => { if (e.target === e.currentTarget) closeDialog(); });
  dialog.addEventListener("keydown", trapDialogKeys);
  $("#rule-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const next: Rule = { id: rule?.id ?? crypto.randomUUID(), name: $<HTMLInputElement>("#rule-name").value.trim(), subjectContains: $<HTMLInputElement>("#rule-subject").value.trim(), senderContains: $<HTMLInputElement>("#rule-sender").value.trim(), mailbox: $<HTMLInputElement>("#rule-mailbox").value.trim(), enabled: $<HTMLInputElement>("#rule-enabled").checked };
    try { await call("save_rule", { rule: next }); snapshot.rules = [...snapshot.rules.filter(r => r.id !== next.id), next]; renderRules(); renderAudit(); closeDialog(); toast("Sorting rule saved."); }
    catch (error) { setStatus("#dialog-status", String(error), true); }
  });
}

function trapDialogKeys(event: KeyboardEvent) {
  if (event.key === "Escape") { closeDialog(); return; }
  if (event.key !== "Tab") return;
  const focusable = [...document.querySelectorAll<HTMLElement>(".dialog button, .dialog input, .dialog select")].filter(el => !el.hasAttribute("disabled"));
  const first = focusable[0], last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
function closeDialog() { $("#dialog-root").innerHTML = ""; lastFocused?.focus(); }

function confirmDelete(id: string) {
  const rule = snapshot.rules.find(r => r.id === id); if (!rule) return;
  lastFocused = document.activeElement as HTMLElement;
  $("#dialog-root").innerHTML = `<div class="dialog-backdrop"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-copy"><h2 id="delete-title">Delete “${safe(rule.name)}”?</h2><p id="delete-copy">Existing audit entries stay intact. New messages will no longer be checked against this rule.</p><div class="actions"><button class="button danger" id="confirm-delete">Delete rule</button><button class="button secondary" id="cancel-dialog">Keep rule</button></div></div></div>`;
  $(".dialog").addEventListener("keydown", trapDialogKeys);
  $(".dialog-backdrop").addEventListener("mousedown", event => { if (event.target === event.currentTarget) closeDialog(); });
  $("#cancel-dialog").addEventListener("click", closeDialog); $("#cancel-dialog").focus();
  $("#confirm-delete").addEventListener("click", async () => { try { await call("delete_rule", { id }); snapshot.rules = snapshot.rules.filter(r => r.id !== id); renderRules(); renderAudit(); closeDialog(); toast("Rule deleted."); } catch (e) { toast(String(e), true); } });
}

function switchView(view: string) {
  activeView = view;
  document.querySelectorAll<HTMLElement>(".view").forEach(v => v.classList.toggle("active", v.dataset.section === view));
  document.querySelectorAll<HTMLElement>(".nav-button").forEach(b => b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false"));
  const content: Record<string, [string,string]> = { setup: ["01 · Connect", "Connect the mailbox that sends invoices and the accounting address that should receive exactly one canonical copy."], rules: ["02 · Decide", "Describe only the invoice mail you expect. Every route stays visible and can be paused or removed."], activity: ["03 · Verify", "See the original saved, every duplicate stopped, and the reason for each decision."], license: ["Optional · Plus", "The free workflow stays useful. Upgrade once for more rules and automatic checks while Mailroom is open."] };
  $("#view-eyebrow").textContent = content[view][0]; $("#view-lede").textContent = content[view][1];
  $("#main").focus({ preventScroll: true });
}

async function runScan(dryRun: boolean) {
  const button = $<HTMLButtonElement>(dryRun ? "#preview-run" : "#archive-run"); button.disabled = true; setStatus("#run-status", dryRun ? "Reading headers and matching PDFs…" : "Sorting new invoice records…");
  try { const result = await call<{ entries: AuditEntry[]; archivedCount: number; duplicateCount: number }>("scan_mail", { dryRun }); snapshot.audit = result.entries; snapshot.archivedCount = result.archivedCount; snapshot.duplicateCount = result.duplicateCount; renderAudit(); setStatus("#run-status", dryRun ? "Preview complete. No mail was forwarded." : "Sort complete. The audit trail is up to date.", false, true); }
  catch (error) { setStatus("#run-status", String(error), true); }
  finally { button.disabled = false; }
}

function settingsPayload() { return { settings: readSettings(), imapPassword: $<HTMLInputElement>("#imap-password").value, smtpPassword: $<HTMLInputElement>("#smtp-password").value }; }

async function verifyLicense(token: string, force = false) {
  const cached = !force ? cachedLicense(localStorage) : null;
  if (cached) { applyLicense(cached.valid, cached.reason); return; }
  if (!navigator.onLine) { applyLicense(Boolean(JSON.parse(localStorage.getItem(LICENSE_CACHE_KEY) ?? "null")?.valid), "offline"); return; }
  try {
    const response = await fetch(`${BILLING_BASE}/products/${PRODUCT_SLUG}/verify?license=${encodeURIComponent(token)}`);
    if (!response.ok) throw new Error("License service did not respond.");
    const verdict = await response.json() as { valid: boolean; reason: string };
    localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify({ valid: verdict.valid, reason: verdict.reason, checkedAt: Date.now() }));
    applyLicense(verdict.valid, verdict.reason);
  } catch { const previous = JSON.parse(localStorage.getItem(LICENSE_CACHE_KEY) ?? "null"); applyLicense(Boolean(previous?.valid), "offline"); }
}

function applyLicense(valid: boolean, reason: string) {
  paid = valid;
  $("#license-badge").textContent = valid ? "Plus unlocked" : "Free";
  $<HTMLElement>("#buy-link").hidden = valid;
  if (reason === "offline") setStatus("#license-status", valid ? "Offline — using your last valid license check." : "Connect to verify this license.");
  else if (valid) setStatus("#license-status", "Mailroom Plus is active on this device.", false, true);
  else if (reason !== "none") setStatus("#license-status", "This license is no longer active. You can paste another token or buy a new license.", true);
  configureSchedule();
}

function configureSchedule() {
  window.clearInterval(scanTimer);
  if (paid && snapshot.settings?.scanIntervalMinutes) scanTimer = window.setInterval(() => { if (navigator.onLine) void runScan(false); }, snapshot.settings.scanIntervalMinutes * 60_000);
}

function setStatus(selector: string, message: string, error = false, success = false) { const node = $(selector); node.textContent = message; node.className = `status-message${error ? " error" : success ? " success" : ""}`; }
function toast(message: string, error = false) { $("#toast-root").innerHTML = `<div class="toast" style="${error ? "border-left-color:var(--danger)" : ""}">${safe(message)}</div>`; window.setTimeout(() => { $("#toast-root").innerHTML = ""; }, 5000); }
function updateOnline() { $("#offline").classList.toggle("visible", !navigator.onLine); }

document.querySelectorAll<HTMLElement>("[data-view]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view!)));
$("#auth-mode").addEventListener("change", () => { updateAuthFields(); applyProviderDefaults(); });
$("#oauth-provider").addEventListener("change", applyProviderDefaults);
$("#load-sample-project").addEventListener("click", async () => {
  try {
    snapshot = await call<AppSnapshot>("load_sample_project");
    fillSettings(); renderRules(); renderAudit(); switchView("activity");
    setStatus("#run-status", "Sample loaded. It contains one archived invoice and two skipped reminders; no mailbox was contacted.", false, true);
  } catch (error) { toast(String(error), true); }
});
$("#authorize-oauth").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("#authorize-oauth");
  button.disabled = true;
  setStatus("#settings-status", "Opening your provider. Finish sign-in in the browser within three minutes.");
  try {
    const message = await call<string>("authorize_oauth", { settings: readSettings() });
    snapshot.settings = readSettings();
    setStatus("#settings-status", message, false, true);
  } catch (error) { setStatus("#settings-status", String(error), true); }
  finally { button.disabled = false; }
});
$("#settings-form").addEventListener("submit", async (event) => { event.preventDefault(); const payload = settingsPayload(); try { await call("save_settings", payload); snapshot.settings = payload.settings; $<HTMLInputElement>("#imap-password").value = ""; $<HTMLInputElement>("#smtp-password").value = ""; setStatus("#settings-status", "Mailboxes saved. Test the connection before sorting.", false, true); toast("Mailbox settings saved."); configureSchedule(); } catch (error) { setStatus("#settings-status", String(error), true); } });
$("#test-connection").addEventListener("click", async () => { const button = $<HTMLButtonElement>("#test-connection"); button.disabled = true; setStatus("#settings-status", "Checking IMAP and SMTP securely…"); try { await call("test_connections", settingsPayload()); $("#connection-label").textContent = "Both connected"; $("#connection-dot").classList.add("connected"); setStatus("#settings-status", "Both servers accepted the connection. No message was sent.", false, true); } catch (error) { $("#connection-label").textContent = "Check failed"; $("#connection-dot").classList.remove("connected"); setStatus("#settings-status", String(error), true); } finally { button.disabled = false; } });
$("#add-rule").addEventListener("click", () => openRuleDialog());
$("#preview-run").addEventListener("click", () => void runScan(true));
$("#archive-run").addEventListener("click", () => void runScan(false));
$("#export-audit").addEventListener("click", async () => { try { const path = await call<string>("export_audit"); toast(`Audit exported to ${path}`); } catch (error) { toast(String(error), true); } });
$("#restore-license").addEventListener("click", async () => { const token = $<HTMLInputElement>("#license-token").value.trim(); if (!token) { setStatus("#license-status", "Paste the license token from your receipt.", true); return; } localStorage.setItem(LICENSE_KEY, token); await verifyLicense(token, true); });
window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline); updateOnline();

const url = new URL(location.href); const incoming = consumeLicenseFromUrl(url, localStorage); if (incoming) history.replaceState({}, "", url); const stored = incoming ?? localStorage.getItem(LICENSE_KEY); if (stored) void verifyLicense(stored); else applyLicense(false, "none");
void loadState();
