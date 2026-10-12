//! `pmh-pty` — a persistent pseudo-terminal as a process.
//!
//! # Why this exists
//!
//! `docs/risks.md` §1 rates the reference template's `node-pty` native addon as
//! a **medium** risk under Bun ("persistentes Terminal, ConPTY auf Windows").
//! This port removes the addon instead of measuring it: the terminal becomes a
//! process the TypeScript core talks to, which is the same move the whole port
//! makes for every language boundary (`docs/stack.md`: *Jede andere Sprache ist
//! ein Dienst, den er aufruft*).
//!
//! # The wire format
//!
//! One JSON object per line, in both directions, so a caller can drive the
//! terminal without parsing terminal output for control information:
//!
//! ```text
//! host → pty   {"op":"start","argv":["pwsh","-NoLogo"],"cols":120,"rows":30,"cwd":"…","env":{…}}
//! host → pty   {"op":"write","data":"ls\r"}
//! host → pty   {"op":"resize","cols":120,"rows":30}
//! host → pty   {"op":"signal","name":"SIGINT"}
//! host → pty   {"op":"close"}
//! pty → host   {"event":"started","pid":1234,"platform":"…"}
//! pty → host   {"event":"data","data":"…"}
//! pty → host   {"event":"exit","code":0,"signal":null}
//! pty → host   {"event":"error","code":"…","message":"…"}
//! ```
//!
//! Terminal output is delivered as separate `data` events, never interleaved
//! with protocol events, which is what makes this usable from the core without
//! a pseudo-terminal-aware parser on the JavaScript side.

/// Exit code for every failure.
pub const EXIT_FAILURE: i32 = 125;

/// The protocol version carried in the `started` event.
pub const PROTOCOL_VERSION: u32 = 1;

/// Terminal geometry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Geometry {
    pub cols: u16,
    pub rows: u16,
}

impl Default for Geometry {
    fn default() -> Self {
        // A conventional default so a caller can omit the geometry and still
        // get a usable terminal.
        Geometry { cols: 80, rows: 24 }
    }
}

impl Geometry {
    /// Reject a geometry no real terminal can have.
    pub fn validate(self) -> Result<Self, PtyError> {
        if self.cols == 0 || self.rows == 0 {
            return Err(PtyError::new(
                "ERR_PTY_GEOMETRY",
                format!("cols and rows must be positive, got {}x{}", self.cols, self.rows),
            ));
        }
        // 1000x1000 is far beyond any real window and catches a caller that
        // passed pixels where cells were expected.
        if self.cols > 1000 || self.rows > 1000 {
            return Err(PtyError::new(
                "ERR_PTY_GEOMETRY",
                format!(
                    "cols and rows must not exceed 1000, got {}x{}",
                    self.cols, self.rows
                ),
            ));
        }
        Ok(self)
    }
}

/// A request from the host.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Request {
    Start(StartRequest),
    Write(String),
    Resize(Geometry),
    Signal(String),
    Close,
}

/// Everything needed to start a terminal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartRequest {
    /// Command and arguments.
    pub argv: Vec<String>,
    /// Initial geometry.
    pub geometry: Geometry,
    /// Working directory; the current directory when absent.
    pub cwd: Option<String>,
    /// Environment additions, layered over the inherited environment.
    pub env: Vec<(String, String)>,
}

/// An event sent to the host.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Event {
    Started {
        pid: u32,
        /// Which terminal implementation was actually used: `conpty` on
        /// Windows, `openpty` on Unix. Reported so a caller never has to infer
        /// it from the platform.
        implementation: &'static str,
    },
    Data(String),
    Exit {
        code: Option<i32>,
        signal: Option<i32>,
    },
    Error(PtyError),
}

impl Event {
    /// Render as one line of JSON.
    pub fn to_json(&self) -> String {
        match self {
            Event::Started { pid, implementation } => format!(
                "{{\"event\":\"started\",\"version\":{PROTOCOL_VERSION},\"pid\":{pid},\"implementation\":{}}}",
                json_string(implementation)
            ),
            Event::Data(data) => format!("{{\"event\":\"data\",\"data\":{}}}", json_string(data)),
            Event::Exit { code, signal } => format!(
                "{{\"event\":\"exit\",\"code\":{},\"signal\":{}}}",
                code.map(|value| value.to_string())
                    .unwrap_or_else(|| "null".to_string()),
                signal
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "null".to_string())
            ),
            Event::Error(error) => format!(
                "{{\"event\":\"error\",\"code\":{},\"message\":{}}}",
                json_string(&error.code),
                json_string(&error.message)
            ),
        }
    }
}

/// A protocol or terminal failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PtyError {
    pub code: String,
    pub message: String,
}

impl PtyError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        PtyError {
            code: code.into(),
            message: message.into(),
        }
    }

    /// Render as JSON.
    pub fn to_json(&self) -> String {
        format!(
            "{{\"code\":{},\"message\":{}}}",
            json_string(&self.code),
            json_string(&self.message)
        )
    }
}

impl std::fmt::Display for PtyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for PtyError {}

/// Minimal JSON string escaping for the wire format.
pub fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Parse one protocol line from the host.
///
/// A deliberately small hand-written parser over `serde_json::Value`: the
/// protocol is six operations, and a hand-written parser keeps the error codes
/// stable and specific, which matters more here than brevity.
pub fn parse_request(line: &str) -> Result<Request, PtyError> {
    let value: serde_json::Value = serde_json::from_str(line).map_err(|error| {
        PtyError::new("ERR_PTY_PROTOCOL", format!("invalid JSON: {error}"))
    })?;
    let op = value
        .get("op")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| PtyError::new("ERR_PTY_PROTOCOL", "missing \"op\" field"))?;

    match op {
        "start" => {
            let argv = value
                .get("argv")
                .and_then(serde_json::Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_string))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            if argv.is_empty() {
                return Err(PtyError::new(
                    "ERR_PTY_PROTOCOL",
                    "start requires a non-empty \"argv\" array",
                ));
            }
            let geometry = Geometry {
                cols: value
                    .get("cols")
                    .and_then(serde_json::Value::as_u64)
                    .map(|value| value as u16)
                    .unwrap_or(Geometry::default().cols),
                rows: value
                    .get("rows")
                    .and_then(serde_json::Value::as_u64)
                    .map(|value| value as u16)
                    .unwrap_or(Geometry::default().rows),
            }
            .validate()?;
            let cwd = value
                .get("cwd")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            let env = value
                .get("env")
                .and_then(serde_json::Value::as_object)
                .map(|map| {
                    map.iter()
                        .filter_map(|(key, item)| {
                            item.as_str().map(|text| (key.clone(), text.to_string()))
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            Ok(Request::Start(StartRequest {
                argv,
                geometry,
                cwd,
                env,
            }))
        }
        "write" => {
            let data = value
                .get("data")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| PtyError::new("ERR_PTY_PROTOCOL", "write requires \"data\""))?;
            Ok(Request::Write(data.to_string()))
        }
        "resize" => {
            let cols = value
                .get("cols")
                .and_then(serde_json::Value::as_u64)
                .ok_or_else(|| PtyError::new("ERR_PTY_PROTOCOL", "resize requires \"cols\""))?;
            let rows = value
                .get("rows")
                .and_then(serde_json::Value::as_u64)
                .ok_or_else(|| PtyError::new("ERR_PTY_PROTOCOL", "resize requires \"rows\""))?;
            let geometry = Geometry {
                cols: cols as u16,
                rows: rows as u16,
            }
            .validate()?;
            Ok(Request::Resize(geometry))
        }
        "signal" => {
            let name = value
                .get("name")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| PtyError::new("ERR_PTY_PROTOCOL", "signal requires \"name\""))?;
            Ok(Request::Signal(name.to_string()))
        }
        "close" => Ok(Request::Close),
        other => Err(PtyError::new(
            "ERR_PTY_PROTOCOL",
            format!("unknown op: {other}"),
        )),
    }
}

/// Translate a symbolic signal name to a number for the running platform.
///
/// `None` means the name is not supported here; the caller reports that instead
/// of guessing a number.
pub fn signal_number(name: &str) -> Option<i32> {
    #[cfg(unix)]
    {
        let number = match name {
            "SIGHUP" => libc::SIGHUP,
            "SIGINT" => libc::SIGINT,
            "SIGQUIT" => libc::SIGQUIT,
            "SIGKILL" => libc::SIGKILL,
            "SIGTERM" => libc::SIGTERM,
            "SIGUSR1" => libc::SIGUSR1,
            "SIGUSR2" => libc::SIGUSR2,
            "SIGWINCH" => libc::SIGWINCH,
            _ => return None,
        };
        Some(number)
    }
    #[cfg(not(unix))]
    {
        // Windows has no POSIX signal numbers. ConPTY terminates through
        // `ClosePseudoConsole`; the only name accepted is a graceful close.
        let _ = name;
        None
    }
}

/// Which terminal implementation a host would use.
pub const fn implementation() -> &'static str {
    if cfg!(windows) {
        "conpty"
    } else {
        "openpty"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_start_request_parses_with_defaults() {
        let request = parse_request(r#"{"op":"start","argv":["pwsh"]}"#).expect("parses");
        let Request::Start(start) = request else {
            panic!("expected Start");
        };
        assert_eq!(start.argv, vec!["pwsh".to_string()]);
        assert_eq!(start.geometry, Geometry { cols: 80, rows: 24 });
        assert_eq!(start.cwd, None);
        assert!(start.env.is_empty());
    }

    #[test]
    fn a_full_start_request_parses() {
        let request = parse_request(
            r#"{"op":"start","argv":["bash","-l"],"cols":132,"rows":43,"cwd":"/work","env":{"TERM":"xterm-256color"}}"#,
        )
        .expect("parses");
        let Request::Start(start) = request else {
            panic!("expected Start");
        };
        assert_eq!(start.argv, vec!["bash".to_string(), "-l".to_string()]);
        assert_eq!(start.geometry, Geometry { cols: 132, rows: 43 });
        assert_eq!(start.cwd.as_deref(), Some("/work"));
        assert_eq!(
            start.env,
            vec![("TERM".to_string(), "xterm-256color".to_string())]
        );
    }

    #[test]
    fn start_without_argv_is_a_protocol_error() {
        let error = parse_request(r#"{"op":"start"}"#).expect_err("rejects");
        assert_eq!(error.code, "ERR_PTY_PROTOCOL");
    }

    #[test]
    fn geometry_must_be_plausible() {
        let error = Geometry { cols: 0, rows: 24 }.validate().expect_err("rejects");
        assert_eq!(error.code, "ERR_PTY_GEOMETRY");
        let error = Geometry {
            cols: 5000,
            rows: 24,
        }
        .validate()
        .expect_err("rejects");
        assert_eq!(error.code, "ERR_PTY_GEOMETRY");
        assert!(Geometry { cols: 120, rows: 30 }.validate().is_ok());
    }

    #[test]
    fn resize_requires_both_dimensions() {
        assert!(parse_request(r#"{"op":"resize","cols":100}"#).is_err());
        assert_eq!(
            parse_request(r#"{"op":"resize","cols":100,"rows":50}"#).expect("parses"),
            Request::Resize(Geometry { cols: 100, rows: 50 })
        );
    }

    #[test]
    fn write_carries_its_data_verbatim_including_control_characters() {
        let request = parse_request(r#"{"op":"write","data":"ls\r\n"}"#).expect("parses");
        assert_eq!(request, Request::Write("ls\r\n".to_string()));
    }

    #[test]
    fn signal_and_close_parse() {
        assert_eq!(
            parse_request(r#"{"op":"signal","name":"SIGINT"}"#).expect("parses"),
            Request::Signal("SIGINT".to_string())
        );
        assert_eq!(
            parse_request(r#"{"op":"close"}"#).expect("parses"),
            Request::Close
        );
    }

    #[test]
    fn an_unknown_operation_is_a_protocol_error() {
        let error = parse_request(r#"{"op":"frobnicate"}"#).expect_err("rejects");
        assert_eq!(error.code, "ERR_PTY_PROTOCOL");
        assert!(error.message.contains("frobnicate"));
    }

    #[test]
    fn invalid_json_is_a_protocol_error_not_a_panic() {
        let error = parse_request("not json").expect_err("rejects");
        assert_eq!(error.code, "ERR_PTY_PROTOCOL");
    }

    #[test]
    fn a_request_without_an_op_is_a_protocol_error() {
        let error = parse_request(r#"{"argv":["pwsh"]}"#).expect_err("rejects");
        assert_eq!(error.code, "ERR_PTY_PROTOCOL");
    }

    #[test]
    fn data_events_escape_control_characters_so_each_event_is_one_line() {
        let event = Event::Data("line1\r\nline2\u{7}".to_string());
        let json = event.to_json();
        assert!(!json.contains('\n'), "an event must stay on one line");
        assert!(!json.contains('\r'), "an event must stay on one line");
        assert!(json.contains("\\r\\n"));
    }

    #[test]
    fn the_started_event_reports_the_real_implementation() {
        let json = Event::Started {
            pid: 4242,
            implementation: implementation(),
        }
        .to_json();
        assert!(json.contains("\"event\":\"started\""), "{json}");
        assert!(json.contains("\"pid\":4242"), "{json}");
        assert!(json.contains(&format!("\"{}\"", implementation())), "{json}");
        assert!(json.contains("\"version\":1"), "{json}");
    }

    #[test]
    fn the_exit_event_renders_missing_values_as_null() {
        assert_eq!(
            Event::Exit {
                code: Some(0),
                signal: None
            }
            .to_json(),
            "{\"event\":\"exit\",\"code\":0,\"signal\":null}"
        );
        assert_eq!(
            Event::Exit {
                code: None,
                signal: Some(9)
            }
            .to_json(),
            "{\"event\":\"exit\",\"code\":null,\"signal\":9}"
        );
    }

    #[test]
    fn an_error_event_carries_code_and_message() {
        let json = Event::Error(PtyError::new("ERR_PTY_SPAWN", "no such file")).to_json();
        assert!(json.contains("\"event\":\"error\""), "{json}");
        assert!(json.contains("ERR_PTY_SPAWN"), "{json}");
    }

    #[test]
    fn the_protocol_version_is_pinned() {
        assert_eq!(PROTOCOL_VERSION, 1);
        assert_eq!(EXIT_FAILURE, 125);
    }

    #[cfg(unix)]
    #[test]
    fn known_signal_names_resolve_on_unix() {
        assert_eq!(signal_number("SIGINT"), Some(libc::SIGINT));
        assert_eq!(signal_number("SIGTERM"), Some(libc::SIGTERM));
        assert_eq!(signal_number("SIGWINCH"), Some(libc::SIGWINCH));
        assert_eq!(signal_number("SIGFROBNICATE"), None);
    }
}
