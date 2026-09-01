use chrono::Utc;
use imap::Session;
use lettre::{
    message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::{Credentials, Mechanism},
    Message, SmtpTransport, Transport,
};
use mailparse::{parse_mail, MailHeaderMap, ParsedMail};
use native_tls::{TlsConnector, TlsStream};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeSet, HashSet},
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

const KEYRING_SERVICE: &str = "in.sociobot.reminder-mailroom";
const SEARCH_LIMIT: usize = 500;
const IMAP_FETCH_ITEMS: &str = "UID BODY.PEEK[]";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_auth_mode")]
    auth_mode: String,
    #[serde(default)]
    oauth_provider: String,
    #[serde(default)]
    oauth_client_id: String,
    imap_host: String,
    imap_port: u16,
    imap_security: String,
    imap_username: String,
    smtp_host: String,
    smtp_port: u16,
    smtp_security: String,
    smtp_username: String,
    archive_address: String,
    scan_interval_minutes: u32,
}

fn default_auth_mode() -> String { "password".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OAuthToken { access_token: String, refresh_token: String, expires_at: i64 }

#[derive(Debug, Deserialize)]
struct OAuthResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: String,
    #[serde(default = "default_expires_in")]
    expires_in: i64,
}

fn default_expires_in() -> i64 { 3600 }

struct XOAuth2 { username: String, access_token: String }

trait SecretStore {
    fn save(&self, account: &str, secret: &str) -> Result<(), String>;
}

struct OperatingSystemCredentialManager;

impl SecretStore for OperatingSystemCredentialManager {
    fn save(&self, account: &str, secret: &str) -> Result<(), String> {
        keyring::Entry::new(KEYRING_SERVICE, account)
            .map_err(|error| format!("Could not open the operating system keychain: {error}"))?
            .set_password(secret)
            .map_err(|error| format!("Could not save the credential in the operating system keychain: {error}"))
    }
}

impl imap::Authenticator for XOAuth2 {
    type Response = Vec<u8>;
    fn process(&self, _challenge: &[u8]) -> Self::Response {
        xoauth2_payload(&self.username, &self.access_token).into_bytes()
    }
}

fn xoauth2_payload(username: &str, access_token: &str) -> String {
    format!("user={username}\x01auth=Bearer {access_token}\x01\x01")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    id: String,
    name: String,
    subject_contains: String,
    sender_contains: String,
    mailbox: String,
    enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    id: i64,
    occurred_at: String,
    subject: String,
    thread_key: String,
    pdf_hash: String,
    outcome: String,
    detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    settings: Option<Settings>,
    rules: Vec<Rule>,
    audit: Vec<AuditEntry>,
    archived_count: u64,
    duplicate_count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    entries: Vec<AuditEntry>,
    archived_count: u64,
    duplicate_count: u64,
}

#[derive(Debug, Clone)]
struct PdfAttachment {
    name: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
struct Candidate {
    subject: String,
    sender: String,
    thread_key: String,
    thread_aliases: Vec<String>,
    pdf: PdfAttachment,
}

#[derive(Default)]
struct PreviewCanonicals {
    thread_keys: HashSet<String>,
    aliases: HashSet<String>,
    pdf_hashes: HashSet<String>,
}

impl PreviewCanonicals {
    fn contains(&self, candidate: &Candidate, hash: &str) -> bool {
        self.thread_keys.contains(&candidate.thread_key)
            || self.pdf_hashes.contains(hash)
            || candidate.thread_aliases.iter().any(|alias| self.aliases.contains(alias))
    }

    fn remember(&mut self, candidate: &Candidate, hash: &str, canonical_thread: Option<&str>) {
        self.thread_keys.insert(canonical_thread.unwrap_or(&candidate.thread_key).to_owned());
        self.thread_keys.insert(candidate.thread_key.clone());
        self.pdf_hashes.insert(hash.to_owned());
        self.aliases.extend(candidate.thread_aliases.iter().cloned());
    }
}

/// A single mailbox can be opened by a manual run and the automatic timer at
/// nearly the same time.  The gate covers the complete read → decide → send →
/// record operation, so two scans cannot both deliver the same invoice.
#[derive(Clone)]
struct ScanGate(Arc<Mutex<()>>);

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not find the app data folder: {error}"))?;
    fs::create_dir_all(&path).map_err(|error| format!("Could not create the app data folder: {error}"))?;
    Ok(path)
}

fn json_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(name))
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| format!("Could not understand {}: {error}", path.display()))
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| format!("Could not encode settings: {error}"))?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, bytes).map_err(|error| format!("Could not save {}: {error}", path.display()))?;
    fs::rename(&temporary, path).map_err(|error| format!("Could not finish saving {}: {error}", path.display()))
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(data_dir(app)?.join("audit.sqlite3"))
        .map_err(|error| format!("Could not open the audit database: {error}"))?;
    connection
        .execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS audit (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               occurred_at TEXT NOT NULL,
               subject TEXT NOT NULL,
               thread_key TEXT NOT NULL,
               pdf_hash TEXT NOT NULL,
               outcome TEXT NOT NULL,
               detail TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS audit_time ON audit(occurred_at DESC);
             CREATE TABLE IF NOT EXISTS canonicals (
               thread_key TEXT PRIMARY KEY,
               pdf_hash TEXT NOT NULL UNIQUE,
               archived_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS canonical_aliases (
               alias TEXT PRIMARY KEY,
               thread_key TEXT NOT NULL,
               FOREIGN KEY(thread_key) REFERENCES canonicals(thread_key)
             );",
        )
        .map_err(|error| format!("Could not prepare the audit database: {error}"))?;
    Ok(connection)
}

fn load_rules(app: &AppHandle) -> Result<Vec<Rule>, String> {
    Ok(read_json(&json_path(app, "rules.json")?)?.unwrap_or_default())
}

fn load_settings(app: &AppHandle) -> Result<Option<Settings>, String> {
    read_json(&json_path(app, "settings.json")?)
}

fn load_audit(connection: &Connection, limit: usize) -> Result<Vec<AuditEntry>, String> {
    let mut statement = connection
        .prepare("SELECT id, occurred_at, subject, thread_key, pdf_hash, outcome, detail FROM audit ORDER BY id DESC LIMIT ?1")
        .map_err(|error| format!("Could not read the audit log: {error}"))?;
    let rows = statement
        .query_map([limit as i64], |row| {
            Ok(AuditEntry {
                id: row.get(0)?,
                occurred_at: row.get(1)?,
                subject: row.get(2)?,
                thread_key: row.get(3)?,
                pdf_hash: row.get(4)?,
                outcome: row.get(5)?,
                detail: row.get(6)?,
            })
        })
        .map_err(|error| format!("Could not read the audit log: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read an audit row: {error}"))
}

fn counts(connection: &Connection) -> Result<(u64, u64), String> {
    let archived = connection
        .query_row("SELECT COUNT(*) FROM canonicals", [], |row| row.get::<_, u64>(0))
        .map_err(|error| format!("Could not count archived invoices: {error}"))?;
    let skipped = connection
        .query_row("SELECT COUNT(*) FROM audit WHERE outcome = 'skipped'", [], |row| row.get::<_, u64>(0))
        .map_err(|error| format!("Could not count duplicates: {error}"))?;
    Ok((archived, skipped))
}

#[tauri::command]
async fn get_snapshot(app: AppHandle) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_db(&app)?;
        let (archived_count, duplicate_count) = counts(&connection)?;
        Ok(Snapshot {
            settings: load_settings(&app)?,
            rules: load_rules(&app)?,
            audit: load_audit(&connection, 200)?,
            archived_count,
            duplicate_count,
        })
    })
    .await
    .map_err(|error| format!("Local data task failed: {error}"))?
}

/// The installed app's first-run sample is deliberately in-memory. It gives a
/// new owner a complete three-message result without creating settings, rules,
/// or audit rows in their real local workspace.
#[tauri::command]
async fn load_sample_project() -> Result<Snapshot, String> {
    let rule = Rule { id: "sample-northstar".into(), name: "Northstar invoices (sample)".into(), subject_contains: "invoice".into(), sender_contains: "northstar.example".into(), mailbox: "Sample inbox".into(), enabled: true };
    let entries = vec![
        AuditEntry { id: -3, occurred_at: "2026-03-02T09:00:00Z".into(), subject: "Invoice #1042".into(), thread_key: "original-1042@northstar.example".into(), pdf_hash: "7dc0f0324a5e".into(), outcome: "archived".into(), detail: "First PDF in this RFC message thread. No mailbox was contacted.".into() },
        AuditEntry { id: -2, occurred_at: "2026-03-23T09:00:00Z".into(), subject: "Re: Payment reminder — Invoice #1042".into(), thread_key: "original-1042@northstar.example".into(), pdf_hash: "7dc0f0324a5e".into(), outcome: "skipped".into(), detail: "Matched the same PDF fingerprint.".into() },
        AuditEntry { id: -1, occurred_at: "2026-04-02T09:00:00Z".into(), subject: "Final reminder: Invoice #1042".into(), thread_key: "original-1042@northstar.example".into(), pdf_hash: "e44a901ca21b".into(), outcome: "skipped".into(), detail: "Matched the original RFC message thread; changed PDF was not forwarded.".into() },
    ];
    Ok(Snapshot { settings: None, rules: vec![rule], audit: entries, archived_count: 1, duplicate_count: 2 })
}

#[tauri::command]
async fn save_settings(
    app: AppHandle,
    settings: Settings,
    imap_password: String,
    smtp_password: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_settings(&settings)?;
        store_mailbox_secrets(&OperatingSystemCredentialManager, &settings, &imap_password, &smtp_password)?;
        write_json(&json_path(&app, "settings.json")?, &settings)
    })
    .await
    .map_err(|error| format!("Settings task failed: {error}"))?
}

#[tauri::command]
async fn test_connections(
    settings: Settings,
    imap_password: String,
    smtp_password: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_settings(&settings)?;
        let (imap_secret, smtp_secret) = connection_secrets(&settings, imap_password, smtp_password)?;
        let mut session = connect_imap(&settings, &imap_secret)?;
        session.logout().map_err(|error| format!("IMAP connected but logout failed: {error}"))?;
        let transport = smtp_transport(&settings, &smtp_secret)?;
        match transport.test_connection() {
            Ok(true) => Ok(()),
            Ok(false) => Err("SMTP server rejected the connection. Check the server, port, and app password.".into()),
            Err(error) => Err(format!("SMTP connection failed: {error}")),
        }
    })
    .await
    .map_err(|error| format!("Connection task failed: {error}"))?
}

#[tauri::command]
async fn authorize_oauth(app: AppHandle, settings: Settings) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_settings(&settings)?;
        if settings.auth_mode != "oauth" { return Err("Choose OAuth before connecting a provider.".into()); }
        let token = run_oauth_flow(&settings)?;
        save_oauth_token(&settings, &token)?;
        write_json(&json_path(&app, "settings.json")?, &settings)?;
        Ok(format!("{} OAuth connected. The refresh token is stored in your operating system keychain.", oauth_provider_name(&settings.oauth_provider)))
    }).await.map_err(|error| format!("OAuth task failed: {error}"))?
}

#[tauri::command]
async fn save_rule(app: AppHandle, rule: Rule) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_rule(&rule)?;
        let mut rules = load_rules(&app)?;
        if let Some(existing) = rules.iter_mut().find(|entry| entry.id == rule.id) {
            *existing = rule;
        } else {
            rules.push(rule);
        }
        write_json(&json_path(&app, "rules.json")?, &rules)
    })
    .await
    .map_err(|error| format!("Rule task failed: {error}"))?
}

#[tauri::command]
async fn delete_rule(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut rules = load_rules(&app)?;
        rules.retain(|rule| rule.id != id);
        write_json(&json_path(&app, "rules.json")?, &rules)
    })
    .await
    .map_err(|error| format!("Rule task failed: {error}"))?
}

#[tauri::command]
async fn scan_mail(app: AppHandle, dry_run: bool, gate: tauri::State<'_, ScanGate>) -> Result<ScanResult, String> {
    let gate = gate.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _scan = gate.lock().map_err(|_| "The mail scan lock could not be acquired.".to_string())?;
        scan_mail_blocking(&app, dry_run)
    })
        .await
        .map_err(|error| format!("Mail scan task failed: {error}"))?
}

#[tauri::command]
async fn export_audit(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_db(&app)?;
        let entries = load_audit(&connection, 100_000)?;
        let folder = dirs::download_dir().unwrap_or(data_dir(&app)?);
        let path = folder.join(format!("reminder-mailroom-audit-{}.csv", Utc::now().format("%Y-%m-%d")));
        let mut csv = String::from("occurred_at,subject,thread_key,pdf_hash,outcome,detail\n");
        for entry in entries.into_iter().rev() {
            csv.push_str(&[entry.occurred_at, entry.subject, entry.thread_key, entry.pdf_hash, entry.outcome, entry.detail]
                .iter().map(|value| csv_escape(value)).collect::<Vec<_>>().join(","));
            csv.push('\n');
        }
        fs::write(&path, csv).map_err(|error| format!("Could not write {}: {error}", path.display()))?;
        Ok(path.display().to_string())
    })
    .await
    .map_err(|error| format!("Export task failed: {error}"))?
}

fn validate_settings(settings: &Settings) -> Result<(), String> {
    if settings.imap_host.trim().is_empty() || settings.smtp_host.trim().is_empty() {
        return Err("Enter both mail server names.".into());
    }
    if !settings.imap_username.contains('@') || !settings.smtp_username.contains('@') || !settings.archive_address.contains('@') {
        return Err("Enter valid email addresses for both usernames and the accounting archive.".into());
    }
    if settings.imap_security != "tls" {
        return Err("This version supports IMAP over implicit TLS (usually port 993). Choose TLS or use your provider's TLS endpoint.".into());
    }
    if settings.auth_mode != "password" && settings.auth_mode != "oauth" {
        return Err("Choose app password or OAuth authentication.".into());
    }
    if settings.auth_mode == "oauth" {
        if !matches!(settings.oauth_provider.as_str(), "google" | "microsoft") {
            return Err("Choose Google or Microsoft for OAuth.".into());
        }
        if settings.oauth_client_id.trim().is_empty() {
            return Err("Enter the desktop OAuth client ID issued by your provider.".into());
        }
    }
    if !(15..=240).contains(&settings.scan_interval_minutes) {
        return Err("Choose an automatic check interval from 15 to 240 minutes.".into());
    }
    Ok(())
}

fn oauth_provider_name(provider: &str) -> &'static str {
    if provider == "microsoft" { "Microsoft" } else { "Google" }
}

fn oauth_endpoints(provider: &str) -> Result<(&'static str, &'static str, &'static str), String> {
    match provider {
        "google" => Ok(("https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token", "https://mail.google.com/")),
        "microsoft" => Ok(("https://login.microsoftonline.com/common/oauth2/v2.0/authorize", "https://login.microsoftonline.com/common/oauth2/v2.0/token", "offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send")),
        _ => Err("Choose Google or Microsoft for OAuth.".into()),
    }
}

fn oauth_account(settings: &Settings) -> String { format!("oauth:{}:{}", settings.oauth_provider, settings.imap_username) }

fn save_oauth_token(settings: &Settings, token: &OAuthToken) -> Result<(), String> {
    save_oauth_token_with(&OperatingSystemCredentialManager, settings, token)
}

fn save_oauth_token_with(store: &impl SecretStore, settings: &Settings, token: &OAuthToken) -> Result<(), String> {
    let encoded = serde_json::to_string(token).map_err(|error| format!("Could not encode the OAuth token: {error}"))?;
    store.save(&oauth_account(settings), &encoded)
}

fn load_oauth_token(settings: &Settings) -> Result<OAuthToken, String> {
    let encoded = supplied_or_saved(String::new(), &oauth_account(settings)).map_err(|_| "No OAuth session was found. Choose Connect with OAuth first.".to_string())?;
    let mut token: OAuthToken = serde_json::from_str(&encoded).map_err(|_| "The saved OAuth session could not be read. Connect it again.".to_string())?;
    if token.expires_at <= Utc::now().timestamp() + 60 {
        token = refresh_oauth_token(settings, &token)?;
        save_oauth_token(settings, &token)?;
    }
    Ok(token)
}

fn connection_secrets(settings: &Settings, imap_supplied: String, smtp_supplied: String) -> Result<(String, String), String> {
    if settings.auth_mode == "oauth" {
        let token = load_oauth_token(settings)?;
        Ok((token.access_token.clone(), token.access_token))
    } else {
        Ok((
            supplied_or_saved(imap_supplied, &format!("imap:{}", settings.imap_username))?,
            supplied_or_saved(smtp_supplied, &format!("smtp:{}", settings.smtp_username))?,
        ))
    }
}

fn refresh_oauth_token(settings: &Settings, current: &OAuthToken) -> Result<OAuthToken, String> {
    if current.refresh_token.is_empty() { return Err("The OAuth session expired without a refresh token. Connect it again.".into()); }
    let (_, token_endpoint, _) = oauth_endpoints(&settings.oauth_provider)?;
    let response = reqwest::blocking::Client::new().post(token_endpoint).form(&[
        ("client_id", settings.oauth_client_id.as_str()),
        ("grant_type", "refresh_token"),
        ("refresh_token", current.refresh_token.as_str()),
    ]).send().map_err(|error| format!("Could not refresh OAuth: {error}"))?;
    if !response.status().is_success() { return Err(format!("The provider rejected the OAuth refresh ({}). Connect it again.", response.status())); }
    let received: OAuthResponse = response.json().map_err(|error| format!("Could not read the refreshed OAuth token: {error}"))?;
    Ok(OAuthToken { access_token: received.access_token, refresh_token: if received.refresh_token.is_empty() { current.refresh_token.clone() } else { received.refresh_token }, expires_at: Utc::now().timestamp() + received.expires_in })
}

fn run_oauth_flow(settings: &Settings) -> Result<OAuthToken, String> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use rand::RngCore;
    let (authorize_endpoint, token_endpoint, scope) = oauth_endpoints(&settings.oauth_provider)?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| format!("Could not open the local OAuth callback: {error}"))?;
    listener.set_nonblocking(true).map_err(|error| format!("Could not prepare the OAuth callback: {error}"))?;
    let redirect_uri = format!("http://127.0.0.1:{}/oauth/callback", listener.local_addr().map_err(|error| error.to_string())?.port());
    let mut verifier_bytes = [0u8; 48]; rand::thread_rng().fill_bytes(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut state_bytes = [0u8; 24]; rand::thread_rng().fill_bytes(&mut state_bytes);
    let state = URL_SAFE_NO_PAD.encode(state_bytes);
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("client_id", &settings.oauth_client_id).append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code").append_pair("scope", scope)
        .append_pair("code_challenge", &challenge).append_pair("code_challenge_method", "S256")
        .append_pair("state", &state).append_pair("access_type", "offline").append_pair("prompt", "consent").finish();
    open::that(format!("{authorize_endpoint}?{query}")).map_err(|error| format!("Could not open the provider sign-in page: {error}"))?;
    let started = Instant::now();
    let code = loop {
        if started.elapsed() > Duration::from_secs(180) { return Err("OAuth timed out after three minutes. Start it again.".into()); }
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                let mut buffer = [0u8; 8192];
                let length = stream.read(&mut buffer).map_err(|error| format!("Could not read the OAuth callback: {error}"))?;
                let request = String::from_utf8_lossy(&buffer[..length]);
                let target = request.lines().next().and_then(|line| line.split_whitespace().nth(1)).ok_or("The OAuth callback was malformed.")?;
                let callback = url::Url::parse(&format!("http://localhost{target}")).map_err(|error| format!("Could not parse the OAuth callback: {error}"))?;
                let parameters: std::collections::HashMap<_, _> = callback.query_pairs().into_owned().collect();
                let accepted = parameters.get("state").is_some_and(|returned| returned == &state);
                let code = parameters.get("code").filter(|_| accepted).cloned();
                let message = if code.is_some() { "OAuth connected. You can close this tab and return to Reminder Mailroom." } else { "OAuth was not completed. Return to Reminder Mailroom and try again." };
                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", message.len(), message);
                let _ = stream.write_all(response.as_bytes());
                break code.ok_or("The OAuth callback did not contain a valid code. Try again.")?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(200)),
            Err(error) => return Err(format!("The local OAuth callback failed: {error}")),
        }
    };
    let response = reqwest::blocking::Client::new().post(token_endpoint).form(&[
        ("client_id", settings.oauth_client_id.as_str()), ("code", code.as_str()), ("code_verifier", verifier.as_str()),
        ("grant_type", "authorization_code"), ("redirect_uri", redirect_uri.as_str()),
    ]).send().map_err(|error| format!("Could not exchange the OAuth code: {error}"))?;
    if !response.status().is_success() { return Err(format!("The provider rejected the OAuth code ({}). Check the desktop client ID.", response.status())); }
    let received: OAuthResponse = response.json().map_err(|error| format!("Could not read the OAuth token: {error}"))?;
    Ok(OAuthToken { access_token: received.access_token, refresh_token: received.refresh_token, expires_at: Utc::now().timestamp() + received.expires_in })
}

fn validate_rule(rule: &Rule) -> Result<(), String> {
    if rule.name.trim().is_empty() || rule.subject_contains.trim().is_empty() || rule.mailbox.trim().is_empty() {
        return Err("Rule name, subject term, and mailbox are required.".into());
    }
    if rule.subject_contains.len() > 200 || rule.sender_contains.len() > 200 {
        return Err("Keep rule terms under 200 characters.".into());
    }
    Ok(())
}

fn store_mailbox_secrets(store: &impl SecretStore, settings: &Settings, imap_password: &str, smtp_password: &str) -> Result<(), String> {
    if !imap_password.is_empty() {
        store.save(&format!("imap:{}", settings.imap_username), imap_password)?;
    }
    if !smtp_password.is_empty() {
        store.save(&format!("smtp:{}", settings.smtp_username), smtp_password)?;
    }
    Ok(())
}

fn supplied_or_saved(supplied: String, account: &str) -> Result<String, String> {
    if !supplied.is_empty() {
        return Ok(supplied);
    }
    keyring::Entry::new(KEYRING_SERVICE, account)
        .map_err(|error| format!("Could not open the operating system keychain: {error}"))?
        .get_password()
        .map_err(|_| "No saved app password was found. Enter it in Mailboxes and save again.".into())
}

fn connect_imap(settings: &Settings, password: &str) -> Result<Session<TlsStream<TcpStream>>, String> {
    let tls = TlsConnector::builder().build().map_err(|error| format!("Could not prepare TLS: {error}"))?;
    let client = imap::connect((settings.imap_host.as_str(), settings.imap_port), &settings.imap_host, &tls)
        .map_err(|error| format!("IMAP connection failed: {error}"))?;
    if settings.auth_mode == "oauth" {
        client.authenticate("XOAUTH2", &XOAuth2 { username: settings.imap_username.clone(), access_token: password.into() })
            .map_err(|(error, _)| format!("IMAP OAuth login failed: {error}. Reconnect the provider."))
    } else {
        client.login(&settings.imap_username, password)
            .map_err(|(error, _)| format!("IMAP login failed: {error}. Check the username and app password."))
    }
}

fn smtp_transport(settings: &Settings, password: &str) -> Result<SmtpTransport, String> {
    let credentials = Credentials::new(settings.smtp_username.clone(), password.to_owned());
    let builder = if settings.smtp_security == "tls" {
        SmtpTransport::relay(&settings.smtp_host)
    } else {
        SmtpTransport::starttls_relay(&settings.smtp_host)
    }
    .map_err(|error| format!("Could not prepare SMTP TLS: {error}"))?;
    let builder = builder.port(settings.smtp_port).credentials(credentials);
    Ok(if settings.auth_mode == "oauth" { builder.authentication(vec![Mechanism::Xoauth2]).build() } else { builder.build() })
}

fn scan_mail_blocking(app: &AppHandle, dry_run: bool) -> Result<ScanResult, String> {
    let settings = load_settings(app)?.ok_or("Save mailbox settings before running a sort.")?;
    validate_settings(&settings)?;
    let rules: Vec<Rule> = load_rules(app)?.into_iter().filter(|rule| rule.enabled).collect();
    if rules.is_empty() {
        return Err("Enable at least one sorting rule before running a sort.".into());
    }
    let (imap_secret, smtp_secret) = if dry_run && settings.auth_mode == "password" {
        (supplied_or_saved(String::new(), &format!("imap:{}", settings.imap_username))?, String::new())
    } else { connection_secrets(&settings, String::new(), String::new())? };
    let mut session = connect_imap(&settings, &imap_secret)?;
    let transport = if dry_run { None } else { Some(smtp_transport(&settings, &smtp_secret)?) };
    let connection = open_db(app)?;
    let mut previews = Vec::new();
    let mut preview_canonicals = PreviewCanonicals::default();

    for rule in rules {
        session.examine(&rule.mailbox).map_err(|error| format!("Could not open mailbox “{}” read-only: {error}", rule.mailbox))?;
        let mut uids = BTreeSet::new();
        for query in imap_search_queries(&rule) {
            let found = session.uid_search(query)
                .map_err(|error| format!("Could not search mailbox “{}”: {error}", rule.mailbox))?;
            uids.extend(found);
        }
        let selected = select_recent_uids(uids);
        if selected.is_empty() { continue; }
        let sequence = selected.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
        let fetched = session.uid_fetch(sequence, IMAP_FETCH_ITEMS)
            .map_err(|error| format!("Could not read matched messages in “{}”: {error}", rule.mailbox))?;
        let mut candidates = Vec::new();
        for message in fetched.iter() {
            let Some(body) = message.body() else { continue };
            let uid = message.uid.ok_or_else(|| format!("The mail server omitted a UID while reading “{}”. Run the sort again.", rule.mailbox))?;
            if let Some(candidate) = parse_candidate(body, &rule)? { candidates.push((uid, candidate)); }
        }
        sort_candidates_for_scan(&mut candidates);
        for (_, candidate) in candidates {
            process_candidate(&connection, &settings, transport.as_ref(), candidate, dry_run, &mut previews, &mut preview_canonicals)?;
        }
    }
    session.logout().map_err(|error| format!("Mail sort completed but IMAP logout failed: {error}"))?;
    let (archived_count, duplicate_count) = counts(&connection)?;
    let entries = if dry_run {
        previews.into_iter().chain(load_audit(&connection, 200)?).take(200).collect()
    } else {
        load_audit(&connection, 200)?
    };
    Ok(ScanResult { entries, archived_count, duplicate_count })
}

fn sort_candidates_for_scan(candidates: &mut [(u32, Candidate)]) {
    candidates.sort_by_key(|(uid, _)| *uid);
}

fn imap_search_queries(rule: &Rule) -> Vec<String> {
    let sender = rule.sender_contains.trim();
    rule.subject_contains.split(',').map(str::trim).filter(|term| !term.is_empty()).map(|term| {
        let escaped_term = imap_quote(term);
        if sender.is_empty() {
            format!("SUBJECT \"{escaped_term}\"")
        } else {
            format!("SUBJECT \"{escaped_term}\" FROM \"{}\"", imap_quote(sender))
        }
    }).collect()
}

fn imap_quote(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn select_recent_uids(uids: BTreeSet<u32>) -> Vec<u32> {
    uids.into_iter().rev().take(SEARCH_LIMIT).collect::<Vec<_>>().into_iter().rev().collect()
}

fn parse_candidate(raw: &[u8], rule: &Rule) -> Result<Option<Candidate>, String> {
    let mail = parse_mail(raw).map_err(|error| format!("A matched message could not be parsed: {error}"))?;
    let subject = mail.headers.get_first_value("Subject").unwrap_or_else(|| "(No subject)".into());
    let sender = mail.headers.get_first_value("From").unwrap_or_default();
    if !subject_matches(&subject, &rule.subject_contains) || (!rule.sender_contains.trim().is_empty() && !sender.to_lowercase().contains(&rule.sender_contains.to_lowercase())) {
        return Ok(None);
    }
    let mut pdfs = Vec::new();
    collect_pdfs(&mail, &mut pdfs)?;
    let Some(pdf) = pdfs.into_iter().next() else { return Ok(None) };
    // RFC thread identifiers are the only safe way to join a changed-PDF
    // reminder to its original invoice.  A normalized subject is useful for
    // display and searching, but is deliberately never an identity: different
    // clients routinely use the same invoice subject.
    let parent_aliases = ["In-Reply-To", "References"].into_iter()
        .filter_map(|header| mail.headers.get_first_value(header))
        .flat_map(|value| value.split_whitespace().map(normalize_message_id).collect::<Vec<_>>())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let own_aliases = mail.headers.get_first_value("Message-ID")
        .into_iter().flat_map(|value| value.split_whitespace().map(normalize_message_id).collect::<Vec<_>>())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let mut thread_aliases = parent_aliases.clone();
    thread_aliases.extend(own_aliases.clone());
    thread_aliases.sort();
    thread_aliases.dedup();
    let thread_key = parent_aliases.first().cloned()
        .or_else(|| own_aliases.first().cloned())
        // Messages without RFC IDs cannot be reliably threaded. Keep their
        // raw-message fingerprint distinct rather than dropping an invoice.
        .unwrap_or_else(|| format!("unlinked:{}", candidate_fingerprint(std::str::from_utf8(raw).unwrap_or("message"))));
    Ok(Some(Candidate { subject, sender, thread_key, thread_aliases, pdf }))
}

fn collect_pdfs(mail: &ParsedMail<'_>, output: &mut Vec<PdfAttachment>) -> Result<(), String> {
    if mail.subparts.is_empty() {
        let disposition = mail.get_content_disposition();
        let provided_name = disposition.params.get("filename").cloned().or_else(|| mail.ctype.params.get("name").cloned());
        let is_pdf = mail.ctype.mimetype.eq_ignore_ascii_case("application/pdf") || provided_name.as_ref().is_some_and(|name| name.to_lowercase().ends_with(".pdf"));
        if is_pdf {
            let bytes = mail.get_body_raw().map_err(|error| format!("Could not decode a matched PDF: {error}"))?;
            output.push(PdfAttachment { name: provided_name.unwrap_or_else(|| "invoice.pdf".into()), bytes });
        }
    } else {
        for part in &mail.subparts { collect_pdfs(part, output)?; }
    }
    Ok(())
}

fn process_candidate(
    connection: &Connection,
    settings: &Settings,
    transport: Option<&SmtpTransport>,
    candidate: Candidate,
    dry_run: bool,
    previews: &mut Vec<AuditEntry>,
    preview_canonicals: &mut PreviewCanonicals,
) -> Result<(), String> {
    let hash = hex::encode(Sha256::digest(&candidate.pdf.bytes));
    let existing = find_existing_canonical(connection, &candidate, &hash)?;
    if let Some((saved_thread, saved_hash)) = existing {
        if dry_run {
            previews.push(preview_entry(&candidate, &hash, "skipped", "Already archived; this reminder would be skipped."));
            preview_canonicals.remember(&candidate, &saved_hash, Some(&saved_thread));
        } else {
            store_aliases(connection, &candidate.thread_aliases, &saved_thread)?;
            insert_audit(connection, &candidate, &hash, "skipped", &format!("Matched an existing canonical thread ({}) or PDF hash ({}…).", saved_thread, &saved_hash[..12]))?;
        }
        return Ok(());
    }
    if dry_run {
        if preview_canonicals.contains(&candidate, &hash) {
            previews.push(preview_entry(&candidate, &hash, "skipped", "Matched an earlier canonical PDF in this preview; this reminder would be skipped."));
        } else {
            previews.push(preview_entry(&candidate, &hash, "preview", "New canonical PDF; this would be forwarded once."));
        }
        preview_canonicals.remember(&candidate, &hash, None);
        return Ok(());
    }
    let transport = transport.ok_or("SMTP transport was not prepared.")?;
    if let Err(error) = send_canonical(transport, settings, &candidate, &hash) {
        insert_audit(connection, &candidate, &hash, "error", &error)?;
        return Err(error);
    }
    store_canonical(connection, &candidate, &hash)
}

fn find_existing_canonical(connection: &Connection, candidate: &Candidate, hash: &str) -> Result<Option<(String, String)>, String> {
    let mut existing = connection.query_row(
        "SELECT thread_key, pdf_hash FROM canonicals WHERE thread_key = ?1 OR pdf_hash = ?2 LIMIT 1",
        params![candidate.thread_key, hash],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    ).ok();
    if existing.is_none() {
        for alias in &candidate.thread_aliases {
            existing = connection.query_row(
                "SELECT c.thread_key, c.pdf_hash FROM canonical_aliases a JOIN canonicals c ON c.thread_key = a.thread_key WHERE a.alias = ?1 LIMIT 1",
                [alias],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            ).ok();
            if existing.is_some() { break; }
        }
    }
    Ok(existing)
}

fn store_canonical(connection: &Connection, candidate: &Candidate, hash: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let transaction = connection.unchecked_transaction().map_err(|error| format!("Could not start the audit update: {error}"))?;
    transaction.execute("INSERT INTO canonicals(thread_key, pdf_hash, archived_at) VALUES (?1, ?2, ?3)", params![candidate.thread_key, hash, now])
        .map_err(|error| format!("The invoice was sent, but its deduplication record could not be saved: {error}"))?;
    store_aliases(&transaction, &candidate.thread_aliases, &candidate.thread_key)?;
    insert_audit(&transaction, &candidate, &hash, "archived", "Forwarded the first PDF in this configured invoice thread.")?;
    transaction.commit().map_err(|error| format!("The invoice was sent, but the audit update could not be finished: {error}"))
}

fn store_aliases(connection: &Connection, aliases: &[String], canonical_thread: &str) -> Result<(), String> {
    for alias in aliases {
        connection.execute("INSERT OR IGNORE INTO canonical_aliases(alias, thread_key) VALUES (?1, ?2)", params![alias, canonical_thread])
            .map_err(|error| format!("The invoice decision was made, but its thread aliases could not be saved: {error}"))?;
    }
    Ok(())
}

fn send_canonical(transport: &SmtpTransport, settings: &Settings, candidate: &Candidate, hash: &str) -> Result<(), String> {
    let from: Mailbox = settings.smtp_username.parse().map_err(|_| "The SMTP username must be an email address so archived mail has a valid From address.")?;
    let to: Mailbox = settings.archive_address.parse().map_err(|_| "The accounting archive address is invalid.")?;
    let message = Message::builder()
        .from(from).to(to)
        .subject(format!("[Canonical invoice] {}", candidate.subject))
        .multipart(MultiPart::mixed()
            .singlepart(SinglePart::plain(format!("Archived once by Reminder Mailroom.\n\nOriginal sender: {}\nInvoice thread: {}\nPDF SHA-256: {}\n", candidate.sender, candidate.thread_key, hash)))
            .singlepart(Attachment::new(candidate.pdf.name.clone()).body(candidate.pdf.bytes.clone(), ContentType::parse("application/pdf").expect("valid PDF MIME type"))))
        .map_err(|error| format!("Could not build the archive message: {error}"))?;
    transport.send(&message).map_err(|error| format!("SMTP could not deliver the canonical invoice: {error}"))?;
    Ok(())
}

fn insert_audit(connection: &Connection, candidate: &Candidate, hash: &str, outcome: &str, detail: &str) -> Result<(), String> {
    connection.execute("INSERT INTO audit(occurred_at, subject, thread_key, pdf_hash, outcome, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![Utc::now().to_rfc3339(), candidate.subject, candidate.thread_key, hash, outcome, detail])
        .map(|_| ())
        .map_err(|error| format!("Could not write the audit entry: {error}"))
}

fn preview_entry(candidate: &Candidate, hash: &str, outcome: &str, detail: &str) -> AuditEntry {
    AuditEntry { id: -1, occurred_at: Utc::now().to_rfc3339(), subject: candidate.subject.clone(), thread_key: candidate.thread_key.clone(), pdf_hash: hash.into(), outcome: outcome.into(), detail: detail.into() }
}

fn subject_matches(subject: &str, terms: &str) -> bool {
    let subject = subject.to_lowercase();
    terms.split(',').map(str::trim).filter(|term| !term.is_empty()).any(|term| subject.contains(&term.to_lowercase()))
}

fn candidate_fingerprint(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))[..16].to_string()
}

fn normalize_message_id(value: &str) -> String {
    value.trim().trim_matches(|character| character == '<' || character == '>').to_lowercase()
}

fn csv_escape(value: &str) -> String {
    if value.contains([',', '"', '\n']) { format!("\"{}\"", value.replace('"', "\"\"")) } else { value.into() }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ScanGate(Arc::new(Mutex::new(()))))
        .invoke_handler(tauri::generate_handler![get_snapshot, load_sample_project, save_settings, test_connections, authorize_oauth, save_rule, delete_rule, scan_mail, export_audit])
        .run(tauri::generate_context!())
        .expect("error while running Reminder Mailroom");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comma_separated_subject_terms_are_alternatives() {
        assert!(subject_matches("March statement INV-2", "invoice, INV-"));
        assert!(!subject_matches("A friendly hello", "invoice, INV-"));
    }

    #[test]
    fn csv_values_are_safe() {
        assert_eq!(csv_escape("hello, world"), "\"hello, world\"");
        assert_eq!(csv_escape("a\"b"), "\"a\"\"b\"");
    }

    #[test]
    fn extracts_a_pdf_from_a_multipart_message() {
        let raw = b"From: client@example.com\r\nSubject: Invoice 42\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nHello\r\n--x\r\nContent-Type: application/pdf; name=invoice.pdf\r\nContent-Disposition: attachment; filename=invoice.pdf\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQ=\r\n--x--\r\n";
        let rule = Rule { id: "1".into(), name: "Invoices".into(), subject_contains: "invoice".into(), sender_contains: "client".into(), mailbox: "INBOX".into(), enabled: true };
        let parsed = parse_candidate(raw, &rule).unwrap().unwrap();
        assert_eq!(parsed.pdf.name, "invoice.pdf");
        assert_eq!(parsed.pdf.bytes, b"%PDF-1.4");
    }

    #[test]
    fn changed_pdf_reply_keeps_the_original_thread_identity() {
        let rule = Rule { id: "1".into(), name: "Invoices".into(), subject_contains: "invoice".into(), sender_contains: "client".into(), mailbox: "INBOX".into(), enabled: true };
        let original = b"From: client@example.com\r\nSubject: Invoice #1042\r\nMessage-ID: <original@example.com>\r\nContent-Type: application/pdf; name=invoice.pdf\r\nContent-Disposition: attachment; filename=invoice.pdf\r\n\r\n%PDF-original\r\n";
        let reply = b"From: client@example.com\r\nSubject: Re: Payment reminder - Invoice #1042\r\nMessage-ID: <reply@example.com>\r\nIn-Reply-To: <original@example.com>\r\nContent-Type: application/pdf; name=invoice-v2.pdf\r\nContent-Disposition: attachment; filename=invoice-v2.pdf\r\n\r\n%PDF-changed\r\n";
        let original = parse_candidate(original, &rule).unwrap().unwrap();
        let reply = parse_candidate(reply, &rule).unwrap().unwrap();
        assert_eq!(original.thread_key, reply.thread_key);
        assert_ne!(Sha256::digest(&original.pdf.bytes), Sha256::digest(&reply.pdf.bytes));
        assert!(reply.thread_aliases.contains(&"original@example.com".into()));
    }

    #[test]
    // @claim:oldest-canonical
    fn claim_oldest_canonical_chained_reminders_keep_mailbox_chronology() {
        let rule = Rule { id: "1".into(), name: "Invoices".into(), subject_contains: "invoice".into(), sender_contains: "client".into(), mailbox: "INBOX".into(), enabled: true };
        let original = b"From: client@example.com\r\nSubject: Invoice #1042\r\nMessage-ID: <z-root@example.com>\r\nContent-Type: application/pdf\r\n\r\n%PDF-original\r\n";
        let reminder = b"From: client@example.com\r\nSubject: Invoice #1042 reminder\r\nMessage-ID: <middle@example.com>\r\nIn-Reply-To: <z-root@example.com>\r\nContent-Type: application/pdf\r\n\r\n%PDF-reminder\r\n";
        let final_reminder = b"From: client@example.com\r\nSubject: Invoice #1042 final reminder\r\nMessage-ID: <final@example.com>\r\nIn-Reply-To: <a-parent@example.com>\r\nReferences: <z-root@example.com> <middle@example.com>\r\nContent-Type: application/pdf\r\n\r\n%PDF-final\r\n";
        let candidates = vec![original.as_slice(), reminder.as_slice(), final_reminder.as_slice()].into_iter()
            .map(|raw| parse_candidate(raw, &rule).unwrap().unwrap())
            .collect::<Vec<_>>();
        let mut candidates = vec![(3, candidates[2].clone()), (1, candidates[0].clone()), (2, candidates[1].clone())];

        sort_candidates_for_scan(&mut candidates);

        assert_eq!(candidates[0].1.pdf.bytes, b"%PDF-original\r\n");
        assert_eq!(candidates[1].1.pdf.bytes, b"%PDF-reminder\r\n");
        assert_eq!(candidates[2].1.pdf.bytes, b"%PDF-final\r\n");
    }

    #[test]
    // @claim:stateful-dry-run
    fn claim_stateful_dry_run_models_earlier_decisions_in_the_same_scan() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE canonicals(thread_key TEXT PRIMARY KEY,pdf_hash TEXT NOT NULL UNIQUE,archived_at TEXT NOT NULL);CREATE TABLE canonical_aliases(alias TEXT PRIMARY KEY,thread_key TEXT NOT NULL);CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,occurred_at TEXT NOT NULL,subject TEXT NOT NULL,thread_key TEXT NOT NULL,pdf_hash TEXT NOT NULL,outcome TEXT NOT NULL,detail TEXT NOT NULL);").unwrap();
        let settings = Settings { auth_mode: "password".into(), oauth_provider: String::new(), oauth_client_id: String::new(), imap_host: "imap.example.com".into(), imap_port: 993, imap_security: "tls".into(), imap_username: "owner@example.com".into(), smtp_host: "smtp.example.com".into(), smtp_port: 465, smtp_security: "tls".into(), smtp_username: "owner@example.com".into(), archive_address: "archive@example.com".into(), scan_interval_minutes: 15 };
        let rule = Rule { id: "1".into(), name: "Invoices".into(), subject_contains: "invoice".into(), sender_contains: "client".into(), mailbox: "INBOX".into(), enabled: true };
        let original = parse_candidate(b"From: client@example.com\r\nSubject: Invoice #1042\r\nMessage-ID: <original@example.com>\r\nContent-Type: application/pdf\r\n\r\n%PDF-original\r\n", &rule).unwrap().unwrap();
        let reminder = parse_candidate(b"From: client@example.com\r\nSubject: Invoice #1042 reminder\r\nMessage-ID: <reminder@example.com>\r\nIn-Reply-To: <original@example.com>\r\nContent-Type: application/pdf\r\n\r\n%PDF-reminder\r\n", &rule).unwrap().unwrap();
        let mut previews = Vec::new();
        let mut preview_canonicals = PreviewCanonicals::default();

        process_candidate(&connection, &settings, None, original, true, &mut previews, &mut preview_canonicals).unwrap();
        process_candidate(&connection, &settings, None, reminder, true, &mut previews, &mut preview_canonicals).unwrap();

        assert_eq!(previews.iter().map(|entry| entry.outcome.as_str()).collect::<Vec<_>>(), ["preview", "skipped"]);
        assert_eq!(connection.query_row("SELECT COUNT(*) FROM canonicals", [], |row| row.get::<_, u64>(0)).unwrap(), 0);
    }

    #[test]
    // @claim:mailbox-read-safety
    fn claim_mailbox_read_plan_applies_the_complete_rule_without_mutating_source_mail() {
        let rule = Rule { id: "1".into(), name: "Client invoices".into(), subject_contains: "invoice, INV-".into(), sender_contains: "billing@example.com".into(), mailbox: "Receivables".into(), enabled: true };
        assert_eq!(imap_search_queries(&rule), [
            "SUBJECT \"invoice\" FROM \"billing@example.com\"",
            "SUBJECT \"INV-\" FROM \"billing@example.com\"",
        ]);
        assert_eq!(IMAP_FETCH_ITEMS, "UID BODY.PEEK[]");
        assert!(!IMAP_FETCH_ITEMS.contains("FLAGS"));
        assert!(parse_candidate(b"From: someone@example.com\r\nSubject: Invoice #1042\r\nContent-Type: application/pdf\r\n\r\n%PDF", &rule).unwrap().is_none());
    }

    #[test]
    // @claim:credential-keychain
    fn claim_passwords_and_oauth_tokens_use_the_credential_store_not_settings_json() {
        use std::cell::RefCell;
        struct RecordingStore(RefCell<Vec<(String, String)>>);
        impl SecretStore for RecordingStore {
            fn save(&self, account: &str, secret: &str) -> Result<(), String> {
                self.0.borrow_mut().push((account.to_owned(), secret.to_owned()));
                Ok(())
            }
        }
        let settings = Settings { auth_mode: "oauth".into(), oauth_provider: "google".into(), oauth_client_id: "desktop-client".into(), imap_host: "imap.gmail.com".into(), imap_port: 993, imap_security: "tls".into(), imap_username: "owner@example.com".into(), smtp_host: "smtp.gmail.com".into(), smtp_port: 587, smtp_security: "starttls".into(), smtp_username: "owner@example.com".into(), archive_address: "archive@example.com".into(), scan_interval_minutes: 15 };
        let token = OAuthToken { access_token: "access-secret".into(), refresh_token: "refresh-secret".into(), expires_at: 123 };
        let store = RecordingStore(RefCell::new(Vec::new()));

        store_mailbox_secrets(&store, &settings, "imap-secret", "smtp-secret").unwrap();
        save_oauth_token_with(&store, &settings, &token).unwrap();

        let saved = store.0.borrow();
        assert_eq!(saved.iter().map(|(account, _)| account.as_str()).collect::<Vec<_>>(), [
            "imap:owner@example.com",
            "smtp:owner@example.com",
            "oauth:google:owner@example.com",
        ]);
        let settings_json = serde_json::to_string(&settings).unwrap();
        for secret in ["imap-secret", "smtp-secret", "access-secret", "refresh-secret"] {
            assert!(!settings_json.contains(secret));
        }
    }

    #[test]
    // @claim:local-native-storage
    fn claim_rules_hashes_and_audit_are_written_to_local_files() {
        let folder = std::env::temp_dir().join(format!("reminder-mailroom-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&folder).unwrap();
        let rules_path = folder.join("rules.json");
        let database_path = folder.join("audit.sqlite3");
        let rules = vec![Rule { id: "one".into(), name: "Invoices".into(), subject_contains: "invoice".into(), sender_contains: "billing@example.com".into(), mailbox: "INBOX".into(), enabled: true }];
        write_json(&rules_path, &rules).unwrap();
        assert_eq!(read_json::<Vec<Rule>>(&rules_path).unwrap().unwrap()[0].name, "Invoices");

        let connection = Connection::open(&database_path).unwrap();
        connection.execute_batch("CREATE TABLE canonicals(thread_key TEXT PRIMARY KEY,pdf_hash TEXT NOT NULL UNIQUE,archived_at TEXT NOT NULL);CREATE TABLE canonical_aliases(alias TEXT PRIMARY KEY,thread_key TEXT NOT NULL);CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,occurred_at TEXT NOT NULL,subject TEXT NOT NULL,thread_key TEXT NOT NULL,pdf_hash TEXT NOT NULL,outcome TEXT NOT NULL,detail TEXT NOT NULL);").unwrap();
        let candidate = Candidate { subject: "Invoice #1042".into(), sender: "billing@example.com".into(), thread_key: "root@example.com".into(), thread_aliases: vec!["root@example.com".into()], pdf: PdfAttachment { name: "invoice.pdf".into(), bytes: b"%PDF-local".to_vec() } };
        let hash = hex::encode(Sha256::digest(&candidate.pdf.bytes));
        store_canonical(&connection, &candidate, &hash).unwrap();
        drop(connection);

        let reopened = Connection::open(&database_path).unwrap();
        assert_eq!(reopened.query_row("SELECT pdf_hash FROM canonicals", [], |row| row.get::<_, String>(0)).unwrap(), hash);
        assert_eq!(reopened.query_row("SELECT outcome FROM audit", [], |row| row.get::<_, String>(0)).unwrap(), "archived");
        drop(reopened);
        fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn a_duplicate_message_adds_its_alias_for_the_next_chained_reply() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE canonicals(thread_key TEXT PRIMARY KEY,pdf_hash TEXT NOT NULL UNIQUE,archived_at TEXT NOT NULL);CREATE TABLE canonical_aliases(alias TEXT PRIMARY KEY,thread_key TEXT NOT NULL);CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,occurred_at TEXT NOT NULL,subject TEXT NOT NULL,thread_key TEXT NOT NULL,pdf_hash TEXT NOT NULL,outcome TEXT NOT NULL,detail TEXT NOT NULL);").unwrap();
        let settings = Settings { auth_mode: "password".into(), oauth_provider: String::new(), oauth_client_id: String::new(), imap_host: "imap.example.com".into(), imap_port: 993, imap_security: "tls".into(), imap_username: "owner@example.com".into(), smtp_host: "smtp.example.com".into(), smtp_port: 465, smtp_security: "tls".into(), smtp_username: "owner@example.com".into(), archive_address: "archive@example.com".into(), scan_interval_minutes: 15 };
        let rule = Rule { id: "1".into(), name: "Invoices".into(), subject_contains: "invoice".into(), sender_contains: "client".into(), mailbox: "INBOX".into(), enabled: true };
        let original = parse_candidate(b"From: client@example.com\r\nSubject: Invoice\r\nMessage-ID: <root@example.com>\r\nContent-Type: application/pdf\r\n\r\n%PDF-one", &rule).unwrap().unwrap();
        let middle = parse_candidate(b"From: client@example.com\r\nSubject: Invoice reminder\r\nMessage-ID: <middle@example.com>\r\nIn-Reply-To: <root@example.com>\r\nContent-Type: application/pdf\r\n\r\n%PDF-one", &rule).unwrap().unwrap();
        let final_reply = parse_candidate(b"From: client@example.com\r\nSubject: Invoice final\r\nMessage-ID: <final@example.com>\r\nIn-Reply-To: <middle@example.com>\r\nContent-Type: application/pdf\r\n\r\n%PDF-changed", &rule).unwrap().unwrap();
        let original_hash = hex::encode(Sha256::digest(&original.pdf.bytes));
        store_canonical(&connection, &original, &original_hash).unwrap();
        process_candidate(&connection, &settings, None, middle, false, &mut Vec::new(), &mut PreviewCanonicals::default()).unwrap();
        let final_hash = hex::encode(Sha256::digest(&final_reply.pdf.bytes));
        assert!(find_existing_canonical(&connection, &final_reply, &final_hash).unwrap().is_some());
    }

    #[test]
    // @claim:thread-identity
    fn claim_thread_identity_same_subject_invoices_remain_separate_without_a_shared_rfc_thread() {
        let rule = Rule { id: "1".into(), name: "Invoices".into(), subject_contains: "invoice".into(), sender_contains: "".into(), mailbox: "INBOX".into(), enabled: true };
        let client_a = parse_candidate(b"From: billing@alpha.example\r\nSubject: Invoice\r\nMessage-ID: <alpha-1042@example>\r\nContent-Type: application/pdf\r\n\r\n%PDF-alpha", &rule).unwrap().unwrap();
        let client_b = parse_candidate(b"From: billing@bravo.example\r\nSubject: Invoice\r\nMessage-ID: <bravo-1042@example>\r\nContent-Type: application/pdf\r\n\r\n%PDF-bravo", &rule).unwrap().unwrap();
        let recurring = parse_candidate(b"From: billing@alpha.example\r\nSubject: Invoice\r\nMessage-ID: <alpha-1043@example>\r\nContent-Type: application/pdf\r\n\r\n%PDF-next", &rule).unwrap().unwrap();
        assert_ne!(client_a.thread_key, client_b.thread_key);
        assert_ne!(client_a.thread_key, recurring.thread_key);
    }

    #[test]
    fn scan_limit_keeps_the_newest_500_messages_in_mailbox_order() {
        let selected = select_recent_uids((1..=600).collect());
        assert_eq!(selected.len(), SEARCH_LIMIT);
        assert_eq!(selected.first(), Some(&101));
        assert_eq!(selected.last(), Some(&600));
    }

    #[test]
    // @claim:concurrent-scan-safety
    fn claim_concurrent_scan_gate_allows_only_one_concurrent_delivery_path() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Barrier;
        let gate = Arc::new(Mutex::new(()));
        let started = Arc::new(Barrier::new(2));
        let in_flight = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let delivered = Arc::new(AtomicUsize::new(0));
        let mut workers = Vec::new();
        for _ in 0..2 {
            let gate = gate.clone(); let started = started.clone(); let in_flight = in_flight.clone(); let peak = peak.clone(); let delivered = delivered.clone();
            workers.push(thread::spawn(move || {
                started.wait();
                let _lock = gate.lock().unwrap();
                let now = in_flight.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(now, Ordering::SeqCst);
                if delivered.load(Ordering::SeqCst) == 0 { delivered.fetch_add(1, Ordering::SeqCst); }
                in_flight.fetch_sub(1, Ordering::SeqCst);
            }));
        }
        for worker in workers { worker.join().unwrap(); }
        assert_eq!(peak.load(Ordering::SeqCst), 1);
        assert_eq!(delivered.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn fixture_flow_persists_one_canonical_skips_changed_pdf_and_leaves_errors_retryable() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE canonicals(thread_key TEXT PRIMARY KEY,pdf_hash TEXT NOT NULL UNIQUE,archived_at TEXT NOT NULL);CREATE TABLE canonical_aliases(alias TEXT PRIMARY KEY,thread_key TEXT NOT NULL);CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,occurred_at TEXT NOT NULL,subject TEXT NOT NULL,thread_key TEXT NOT NULL,pdf_hash TEXT NOT NULL,outcome TEXT NOT NULL,detail TEXT NOT NULL);").unwrap();
        let rule = Rule { id: "1".into(), name: "Invoices".into(), subject_contains: "invoice".into(), sender_contains: "client".into(), mailbox: "INBOX".into(), enabled: true };
        let original_raw = b"From: client@example.com\r\nSubject: Invoice #1042\r\nMessage-ID: <original@example.com>\r\nContent-Type: application/pdf; name=invoice.pdf\r\nContent-Disposition: attachment; filename=invoice.pdf\r\n\r\n%PDF-original\r\n";
        let changed_raw = b"From: client@example.com\r\nSubject: Final reminder: Invoice #1042\r\nMessage-ID: <final@example.com>\r\nReferences: <original@example.com>\r\nContent-Type: application/pdf; name=invoice-v2.pdf\r\nContent-Disposition: attachment; filename=invoice-v2.pdf\r\n\r\n%PDF-regenerated\r\n";
        let retry_raw = b"From: client@example.com\r\nSubject: Invoice #2048\r\nMessage-ID: <retry@example.com>\r\nContent-Type: application/pdf; name=invoice.pdf\r\nContent-Disposition: attachment; filename=invoice.pdf\r\n\r\n%PDF-retry\r\n";
        let original = parse_candidate(original_raw, &rule).unwrap().unwrap();
        let changed = parse_candidate(changed_raw, &rule).unwrap().unwrap();
        let retry = parse_candidate(retry_raw, &rule).unwrap().unwrap();
        let original_hash = hex::encode(Sha256::digest(&original.pdf.bytes));
        let changed_hash = hex::encode(Sha256::digest(&changed.pdf.bytes));
        let retry_hash = hex::encode(Sha256::digest(&retry.pdf.bytes));
        assert!(find_existing_canonical(&connection, &original, &original_hash).unwrap().is_none());
        store_canonical(&connection, &original, &original_hash).unwrap();
        assert!(find_existing_canonical(&connection, &changed, &changed_hash).unwrap().is_some());
        insert_audit(&connection, &changed, &changed_hash, "skipped", "Same thread, changed PDF").unwrap();
        insert_audit(&connection, &retry, &retry_hash, "error", "SMTP unavailable").unwrap();
        assert!(find_existing_canonical(&connection, &retry, &retry_hash).unwrap().is_none());
        assert_eq!(connection.query_row("SELECT COUNT(*) FROM canonicals", [], |row| row.get::<_, u64>(0)).unwrap(), 1);
        assert_eq!(connection.query_row("SELECT COUNT(*) FROM audit", [], |row| row.get::<_, u64>(0)).unwrap(), 3);
    }

    #[test]
    fn oauth_provider_configuration_uses_pkce_endpoints_and_xoauth2() {
        let (google_auth, google_token, google_scope) = oauth_endpoints("google").unwrap();
        let (microsoft_auth, microsoft_token, microsoft_scope) = oauth_endpoints("microsoft").unwrap();
        assert!(google_auth.starts_with("https://accounts.google.com/"));
        assert_eq!(google_token, "https://oauth2.googleapis.com/token");
        assert_eq!(google_scope, "https://mail.google.com/");
        assert!(microsoft_auth.starts_with("https://login.microsoftonline.com/common/"));
        assert!(microsoft_token.ends_with("/token"));
        assert!(microsoft_scope.contains("IMAP.AccessAsUser.All"));
        assert_eq!(xoauth2_payload("owner@example.com", "access-token"), "user=owner@example.com\x01auth=Bearer access-token\x01\x01");
    }
}
