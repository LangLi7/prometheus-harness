//! Is anything listening on the harness port?
//!
//! A TCP connect is the smallest honest question: the harness answers HTTP only on
//! a bound port, and a bound port accepts a connection. Asking for `/` instead
//! would add a 401 to the answer — the interface refuses unauthenticated requests
//! by design, so an HTTP check would have to treat a refusal as "running".

use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

/// How long one probe may take before the port counts as closed.
///
/// Loopback connects either succeed immediately or fail immediately; a long
/// timeout would only make the tray's status stale.
pub const PROBE_TIMEOUT: Duration = Duration::from_millis(400);

/// Whether something accepts connections on `127.0.0.1:<port>`.
pub fn is_open(port: u16) -> bool {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    TcpStream::connect_timeout(&address, PROBE_TIMEOUT).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn a_bound_port_is_reported_open() {
        // Bind to port 0: the operating system picks a free one, so the test does
        // not fight a real harness for 3080.
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("a free port");
        let port = listener.local_addr().expect("an address").port();
        assert!(is_open(port));
    }

    #[test]
    fn a_released_port_is_reported_closed() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("a free port");
        let port = listener.local_addr().expect("an address").port();
        drop(listener);
        assert!(!is_open(port));
    }
}
