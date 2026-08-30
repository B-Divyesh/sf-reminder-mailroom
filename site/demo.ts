import "./styles.css";
import { canonicalThreadKey, csvEscape } from "../app/core";

type SampleMessage = { date: string; subject: string; messageId: string; replyTo?: string; pdf: string; pdfHash: string };
type Decision = SampleMessage & { outcome: "archived" | "skipped"; reason: string; threadKey: string };
type DemoState = { processed: boolean; decisions: Decision[] };
const STORAGE_KEY = "demo:reminder-mailroom";
const sample: SampleMessage[] = [
  { date: "2026-03-02", subject: "Invoice #1042", messageId: "original-1042@northstar.example", pdf: "northstar-1042.pdf", pdfHash: "7dc0f0324a5e" },
  { date: "2026-03-23", subject: "Re: Payment reminder — Invoice #1042", messageId: "reminder-1042@northstar.example", replyTo: "original-1042@northstar.example", pdf: "northstar-1042.pdf", pdfHash: "7dc0f0324a5e" },
  { date: "2026-04-02", subject: "Final reminder: Invoice #1042", messageId: "final-1042@northstar.example", replyTo: "original-1042@northstar.example", pdf: "northstar-1042-reissued.pdf", pdfHash: "e44a901ca21b" }
];

function runSample(): Decision[] {
  const threads = new Set<string>();
  const hashes = new Set<string>();
  return sample.map((message) => {
    const threadKey = canonicalThreadKey(message.subject);
    const duplicate = threads.has(threadKey) || hashes.has(message.pdfHash);
    if (!duplicate) { threads.add(threadKey); hashes.add(message.pdfHash); }
    return { ...message, threadKey, outcome: duplicate ? "skipped" : "archived", reason: duplicate ? (hashes.has(message.pdfHash) ? "Same PDF fingerprint" : "Same invoice thread, changed PDF") : "First PDF in this invoice thread" };
  });
}

function readState(): DemoState {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") ?? { processed: false, decisions: [] }; }
  catch { return { processed: false, decisions: [] }; }
}
function saveState(state: DemoState) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function safe(value: string) { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; }

function render(state: DemoState) {
  document.querySelector("#demo-messages")!.innerHTML = sample.map((message, index) => `<li><span class="demo-date">${message.date}</span><div><strong>${safe(message.subject)}</strong><span>${safe(message.pdf)} · SHA-256 ${message.pdfHash}…</span></div><span class="demo-pill">${index ? "Reminder" : "Original"}</span></li>`).join("");
  const archived = state.decisions.filter(({ outcome }) => outcome === "archived").length;
  const skipped = state.decisions.filter(({ outcome }) => outcome === "skipped").length;
  document.querySelector("#demo-archived")!.textContent = String(archived);
  document.querySelector("#demo-skipped")!.textContent = String(skipped);
  document.querySelector("#demo-forwarded")!.textContent = String(archived);
  const audit = document.querySelector("#demo-audit")!;
  audit.innerHTML = state.processed ? state.decisions.map((item) => `<li data-outcome="${item.outcome}"><time>${item.date}</time><div><strong>${safe(item.subject)}</strong><span>${item.reason}</span></div><b>${item.outcome === "archived" ? "Archived once" : "Duplicate skipped"}</b></li>`).join("") : `<li class="demo-empty">Run the sample sort to record each decision.</li>`;
  (document.querySelector("#export-demo") as HTMLButtonElement).disabled = !state.processed;
  document.querySelector("#demo-status")!.textContent = state.processed ? "Sort complete. One canonical PDF was archived. Two reminders stayed in the inbox." : "Three messages are ready. Preview their subjects and PDF fingerprints below.";
}

let state = readState();
render(state);
document.querySelector("#run-demo")!.addEventListener("click", () => { state = { processed: true, decisions: runSample() }; saveState(state); render(state); });
document.querySelector("#reset-demo")!.addEventListener("click", () => { localStorage.removeItem(STORAGE_KEY); state = { processed: false, decisions: [] }; render(state); (document.querySelector("#run-demo") as HTMLButtonElement).focus(); });
document.querySelector("#start-real")!.addEventListener("click", () => localStorage.removeItem(STORAGE_KEY));
document.querySelector("#export-demo")!.addEventListener("click", () => {
  const rows = ["date,subject,thread_key,pdf_hash,outcome,reason", ...state.decisions.map((item) => [item.date, item.subject, item.threadKey, item.pdfHash, item.outcome, item.reason].map(csvEscape).join(","))];
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([rows.join("\n") + "\n"], { type: "text/csv" }));
  link.download = "reminder-mailroom-demo-audit.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});
document.querySelector<HTMLAnchorElement>(".skip-link")!.addEventListener("click", () => requestAnimationFrame(() => document.querySelector<HTMLElement>("#main")!.focus()));
if ("serviceWorker" in navigator) window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js"));
