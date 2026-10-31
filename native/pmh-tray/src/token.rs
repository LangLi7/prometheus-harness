//! Finding the login address in the harness output.
//!
//! The host prints `http://127.0.0.1:<port>/?token=…`. **Without that token the
//! interface answers 401** (measured 13.10.2026), so a tray menu that opens
//! `http://127.0.0.1:3080/` would open an error page while the harness runs
//! perfectly — an instruction that is followable and still wrong.
//!
//! `scripts/token-address.mjs` already solves this for the console launcher. This
//! module is the same rule, in Rust, for the same reason:
//!
//! | The host … | and the address is … | so |
//! |---|---|---|
//! | writes a newline | finished | complete |
//! | stops writing (exit) | finished | complete |
//! | writes on | still open | wait |
//! | — | token has full length | complete, report at once |
//!
//! Only the last row is an assumption: it uses the token length the host is
//! measured to produce, so the address appears even when no newline ever
//! follows. If that assumption ever stops holding, the report gets **later** —
//! never wrong.

/// Token length the host produces: 32 random bytes as base64url, `ceil(32/3)*4-1 = 43`.
///
/// Used **only** to report a complete address immediately when the host has not
/// finished a line yet. It does not rule out a truncated address — that is what
/// [`AddressWatcher::flush`] is for.
pub const TOKEN_FULL_LENGTH: usize = 43;

/// Shorter than this, whatever follows `?token=` is not a token at all.
pub const TOKEN_MIN_LENGTH: usize = 8;

/// The host shapes this itself. All four are loopback spellings; anything else
/// would be some unrelated URL from a tool that finished long ago.
const PREFIXES: [&str; 6] = [
    "http://127.0.0.1:",
    "https://127.0.0.1:",
    "http://localhost:",
    "https://localhost:",
    "http://[::1]:",
    "https://[::1]:",
];

const MARKER: &str = "/?token=";

/// Reads the token out of an address.
pub fn token_of(url: &str) -> &str {
    match url.find(MARKER) {
        Some(at) => &url[at + MARKER.len()..],
        None => "",
    }
}

/// Every address-shaped run in `text`: `http(s)://<loopback>:<port>/?token=<no space>`.
///
/// Returned are the **runs**, complete or not — deciding whether a run is
/// finished belongs to the caller, which is the only side that knows whether
/// more output is still coming.
fn runs(text: &str) -> Vec<&str> {
    let bytes = text.as_bytes();
    let mut found = Vec::new();
    let mut at = 0usize;
    while at < bytes.len() {
        // Only `h` can start a run, so the scan never steps over a candidate.
        let Some(next) = text[at..].find('h') else {
            break;
        };
        let start = at + next;
        if let Some(end) = run_at(text, start) {
            found.push(&text[start..end]);
            at = end;
        } else {
            at = start + 1;
        }
    }
    found
}

/// The end offset of a run starting at `start`, if one starts there.
fn run_at(text: &str, start: usize) -> Option<usize> {
    let rest = &text[start..];
    let prefix = PREFIXES
        .iter()
        .filter(|prefix| rest.starts_with(**prefix))
        .max_by_key(|prefix| prefix.len())?;
    let mut at = prefix.len();
    let digits = rest[at..]
        .find(|character: char| !character.is_ascii_digit())
        .unwrap_or(rest.len() - at);
    // A port is at least one digit; `http://127.0.0.1:/?token=` is not an address.
    if digits == 0 {
        return None;
    }
    at += digits;
    if !rest[at..].starts_with(MARKER) {
        return None;
    }
    at += MARKER.len();
    // To the next whitespace, not to a fixed character class: the token's shape is
    // the host's business, and a class here would silently cut at a character the
    // host is allowed to use.
    let tail = rest[at..]
        .find(char::is_whitespace)
        .unwrap_or(rest.len() - at);
    Some(start + at + tail)
}

/// The login address in one **finished** piece of output, if it carries one.
pub fn find_auth_url(line: &str) -> Option<&str> {
    runs(line)
        .into_iter()
        .find(|run| token_of(run).len() >= TOKEN_MIN_LENGTH)
}

/// Reports the login address exactly once, across chunk boundaries.
///
/// Output arrives in chunks (measured: up to 158 characters each), and a chunk can
/// end in the middle of the token. Announcing too early prints nonsense **and then
/// discards the real address**, because it counts as announced. Buffering is not
/// politeness here; it is the only way the address is found reliably.
#[derive(Debug, Default)]
pub struct AddressWatcher {
    /// Not yet finished remainder of the output.
    carry: String,
    announced: bool,
    address: Option<String>,
}

impl AddressWatcher {
    /// A fresh watcher.
    pub fn new() -> Self {
        Self::default()
    }

    /// The address, once it was reported.
    pub fn address(&self) -> Option<&str> {
        self.address.as_deref()
    }

    /// Whether the address has been reported.
    pub fn done(&self) -> bool {
        self.announced
    }

    /// Feeds one chunk of output; returns the address when this chunk finished it.
    ///
    /// Returns `None` for every later chunk: the address is reported once.
    pub fn feed(&mut self, chunk: &str) -> Option<String> {
        if self.announced {
            return None;
        }
        self.carry.push_str(chunk);
        let cut = match (self.carry.rfind('\n'), self.carry.rfind('\r')) {
            (Some(newline), Some(carriage)) => Some(newline.max(carriage)),
            (Some(newline), None) => Some(newline),
            (None, Some(carriage)) => Some(carriage),
            (None, None) => None,
        };
        let Some(cut) = cut else {
            // No finished line yet, so the whole remainder is open.
            return self.report_open();
        };
        let finished = self.carry[..cut].to_string();
        self.carry = self.carry[cut + 1..].to_string();
        if let Some(url) = find_auth_url(&finished) {
            return self.report(url.to_string());
        }
        // The new remainder can already hold the complete address **without** a
        // newline — measured: the host writes it as the last line, unterminated.
        self.report_open()
    }

    /// Reports that no further output is coming.
    ///
    /// The one path that rescues an address written without a trailing newline;
    /// without it the address would wait in the buffer for a newline that never
    /// arrives.
    pub fn flush(&mut self) -> Option<String> {
        if self.announced {
            return None;
        }
        let carry = std::mem::take(&mut self.carry);
        if let Some(url) = find_auth_url(&carry) {
            return self.report(url.to_string());
        }
        self.report_open()
    }

    /// An open remainder is not a result — unless it is as long as a full token.
    fn report_open(&mut self) -> Option<String> {
        if self.announced {
            return None;
        }
        let run = runs(&self.carry).into_iter().find(|run| {
            let token = token_of(run);
            token.len() >= TOKEN_FULL_LENGTH
        })?;
        let url = run.to_string();
        self.report(url)
    }

    fn report(&mut self, url: String) -> Option<String> {
        if self.announced {
            return None;
        }
        self.announced = true;
        self.address = Some(url.clone());
        Some(url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_finished_line_with_a_token_is_found() {
        let line = "dsh web: http://127.0.0.1:3081/?token=jWQ8m2nB7pVx4kLr0tZf6cYd3sHh1aGe9uoQ5wRyABc";
        assert_eq!(
            find_auth_url(line),
            Some("http://127.0.0.1:3081/?token=jWQ8m2nB7pVx4kLr0tZf6cYd3sHh1aGe9uoQ5wRyABc")
        );
    }

    #[test]
    fn a_too_short_token_is_not_an_address() {
        // Followable and wrong: the caveat that made the console launcher lie.
        assert_eq!(find_auth_url("http://127.0.0.1:3081/?token=abc"), None);
    }

    #[test]
    fn loopback_spellings_are_accepted_and_foreign_hosts_are_not() {
        assert!(find_auth_url("http://localhost:3081/?token=abcdefghij").is_some());
        assert!(find_auth_url("http://[::1]:3081/?token=abcdefghij").is_some());
        assert!(find_auth_url("http://192.168.0.9:3081/?token=abcdefghij").is_none());
        assert!(find_auth_url("https://example.com/?token=abcdefghij").is_none());
    }

    #[test]
    fn an_address_without_a_port_is_not_an_address() {
        assert!(find_auth_url("http://127.0.0.1/?token=abcdefghij").is_none());
    }

    #[test]
    fn a_chunk_boundary_in_the_middle_of_the_token_waits() {
        let mut watcher = AddressWatcher::new();
        assert_eq!(watcher.feed("dsh web: http://127.0.0.1:3081/?token=jWQ8"), None);
        assert!(!watcher.done(), "a partial token must not count as an address");
        // The rest arrives with its newline: now the address is finished.
        assert_eq!(
            watcher.feed("m2nB7pVx4kLr0tZf6cYd3sHh1aGe9uoQ5wRyABc\n"),
            Some("http://127.0.0.1:3081/?token=jWQ8m2nB7pVx4kLr0tZf6cYd3sHh1aGe9uoQ5wRyABc".into())
        );
        assert!(watcher.done());
        // Reported once — a second chance is not a second report.
        assert_eq!(watcher.feed("?token=zzzzzzzzzzzz\n"), None);
    }

    #[test]
    fn a_full_length_token_without_a_newline_is_reported_at_once() {
        let mut watcher = AddressWatcher::new();
        let address = "http://127.0.0.1:3081/?token=jWQ8m2nB7pVx4kLr0tZf6cYd3sHh1aGe9uoQ5wRyABc";
        assert_eq!(watcher.feed(address), Some(address.to_string()));
    }

    #[test]
    fn flush_rescues_an_address_the_host_never_terminated() {
        let mut watcher = AddressWatcher::new();
        // Shorter than a full token, so `feed` correctly refuses to guess.
        assert_eq!(watcher.feed("dsh web: http://127.0.0.1:3081/?token=0123456789ABCDEF"), None);
        assert_eq!(
            watcher.flush(),
            Some("http://127.0.0.1:3081/?token=0123456789ABCDEF".into())
        );
    }

    #[test]
    fn carriage_return_terminates_a_line_too() {
        let mut watcher = AddressWatcher::new();
        assert_eq!(
            watcher.feed("http://127.0.0.1:3081/?token=abcdefghij\r\n"),
            Some("http://127.0.0.1:3081/?token=abcdefghij".into())
        );
    }

    #[test]
    fn output_without_an_address_yields_nothing() {
        let mut watcher = AddressWatcher::new();
        assert_eq!(watcher.feed("[pmh] Start — Bun 1.4.0 auf win32\n"), None);
        assert_eq!(watcher.feed("[pmh] Oberfläche: http://127.0.0.1:3080/\n"), None);
        assert_eq!(watcher.flush(), None);
    }

    #[test]
    fn a_longer_url_after_the_token_is_kept_whole() {
        // The rule returns the whole run, not a token-shaped excerpt: a fixed
        // character class would cut at a character the host may use.
        let url = "http://127.0.0.1:3081/?token=abc%2Fdef.ghij";
        assert_eq!(find_auth_url(url), Some(url));
    }
}
