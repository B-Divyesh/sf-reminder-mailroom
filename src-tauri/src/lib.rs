#[cfg(feature = "desktop")]
include!("desktop.rs");

#[cfg(all(not(feature = "desktop"), test))]
mod core_tests {
    use mailparse::{parse_mail, MailHeaderMap, ParsedMail};
    use regex::Regex;

    fn subject_matches(subject: &str, terms: &str) -> bool {
        let subject = subject.to_lowercase();
        terms
            .split(',')
            .map(str::trim)
            .filter(|term| !term.is_empty())
            .any(|term| subject.contains(&term.to_lowercase()))
    }

    fn normalize_subject(subject: &str) -> String {
        let prefixes = Regex::new(r"(?i)^\s*((re|fw|fwd)\s*:\s*)+").unwrap();
        let reminders =
            Regex::new(r"(?i)\b(final|friendly|payment|reminder|due|overdue|past|follow[- ]?up)\b")
                .unwrap();
        let separators = Regex::new(r"[^a-z0-9]+").unwrap();
        let without_prefix = prefixes.replace_all(subject, "");
        let without_reminder = reminders.replace_all(&without_prefix, "").to_lowercase();
        separators
            .replace_all(&without_reminder, " ")
            .trim()
            .to_string()
    }

    fn pdf_bytes(mail: &ParsedMail<'_>) -> Option<Vec<u8>> {
        if mail.subparts.is_empty() {
            let disposition = mail.get_content_disposition();
            let name = disposition
                .params
                .get("filename")
                .cloned()
                .unwrap_or_default();
            if mail.ctype.mimetype.eq_ignore_ascii_case("application/pdf")
                || name.to_lowercase().ends_with(".pdf")
            {
                return mail.get_body_raw().ok();
            }
        }
        mail.subparts.iter().find_map(pdf_bytes)
    }

    #[test]
    fn reminder_subjects_share_a_canonical_key() {
        assert_eq!(
            normalize_subject("Invoice #1042"),
            normalize_subject("Re: PAYMENT REMINDER — Invoice #1042")
        );
    }

    #[test]
    fn comma_separated_subject_terms_are_alternatives() {
        assert!(subject_matches("March statement INV-2", "invoice, INV-"));
        assert!(!subject_matches("A friendly hello", "invoice, INV-"));
    }

    #[test]
    fn extracts_a_pdf_from_a_multipart_message() {
        let raw = b"From: client@example.com\r\nSubject: Invoice 42\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nHello\r\n--x\r\nContent-Type: application/pdf; name=invoice.pdf\r\nContent-Disposition: attachment; filename=invoice.pdf\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQ=\r\n--x--\r\n";
        let mail = parse_mail(raw).unwrap();
        assert_eq!(
            mail.headers.get_first_value("Subject").unwrap(),
            "Invoice 42"
        );
        assert_eq!(pdf_bytes(&mail).unwrap(), b"%PDF-1.4");
    }
}
