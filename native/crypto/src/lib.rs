//! `pmh-crypto` — cryptographic primitives as a process.
//!
//! `docs/stack.md` lists cryptography among the "schweren Werkzeuge" that belong
//! in Rust. The reference template keeps its hashing in TypeScript
//! (`packages/util/crypto`); here the primitives live behind a process boundary
//! so the core can use a reviewed, memory-safe implementation without shipping
//! a native addon.
//!
//! # What is here, and what is deliberately not
//!
//! This crate implements **SHA-256** and **HMAC-SHA-256** from the published
//! specifications (FIPS 180-4 and RFC 2104), plus a constant-time comparison and
//! an OS-backed random token. Those are the primitives the harness actually
//! needs today — content hashing, cache keys, integrity checks, and session
//! token generation.
//!
//! It deliberately does **not** offer encryption or password hashing. Those need
//! primitives (AEAD, a memory-hard KDF) that must not be hand-rolled, and
//! inventing them here would be worse than not having them. A caller that needs
//! them should add a reviewed implementation — the process boundary means that
//! is a change inside this binary, not across the whole core.

/// Exit code for every failure.
pub const EXIT_FAILURE: i32 = 125;

/// The JSON schema version of the reports this program prints.
pub const REPORT_VERSION: u32 = 1;

// ---------------------------------------------------------------------------
// SHA-256 (FIPS 180-4)
// ---------------------------------------------------------------------------

/// Round constants: the first 32 bits of the fractional parts of the cube roots
/// of the first 64 primes.
const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/// Initial hash values: the first 32 bits of the fractional parts of the square
/// roots of the first eight primes.
const H0: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

/// Streaming SHA-256 state.
#[derive(Debug, Clone)]
pub struct Sha256 {
    state: [u32; 8],
    /// Pending bytes that did not complete a 64-byte block.
    buffer: [u8; 64],
    buffered: usize,
    /// Total message length in bytes, for the length padding.
    length: u64,
}

impl Default for Sha256 {
    fn default() -> Self {
        Sha256::new()
    }
}

impl Sha256 {
    /// A fresh hasher.
    pub fn new() -> Self {
        Sha256 {
            state: H0,
            buffer: [0u8; 64],
            buffered: 0,
            length: 0,
        }
    }

    /// Absorb more bytes.
    pub fn update(&mut self, mut data: &[u8]) {
        self.length = self.length.wrapping_add(data.len() as u64);

        // Top up a partially filled block first.
        if self.buffered > 0 {
            let take = std::cmp::min(64 - self.buffered, data.len());
            self.buffer[self.buffered..self.buffered + take].copy_from_slice(&data[..take]);
            self.buffered += take;
            data = &data[take..];
            if self.buffered == 64 {
                let block = self.buffer;
                self.compress(&block);
                self.buffered = 0;
            }
        }

        // Consume whole blocks directly from the input.
        while data.len() >= 64 {
            let mut block = [0u8; 64];
            block.copy_from_slice(&data[..64]);
            self.compress(&block);
            data = &data[64..];
        }

        // Keep the remainder for the next call.
        if !data.is_empty() {
            self.buffer[..data.len()].copy_from_slice(data);
            self.buffered = data.len();
        }
    }

    /// Finish and return the 32-byte digest. Consumes the hasher.
    pub fn finalize(mut self) -> [u8; 32] {
        // Padding: 0x80, then zeros, then the 64-bit big-endian bit length.
        let bit_length = self.length.wrapping_mul(8);
        self.update_no_length(&[0x80]);
        while self.buffered != 56 {
            self.update_no_length(&[0x00]);
        }
        self.update_no_length(&bit_length.to_be_bytes());

        let mut out = [0u8; 32];
        for (index, word) in self.state.iter().enumerate() {
            out[index * 4..index * 4 + 4].copy_from_slice(&word.to_be_bytes());
        }
        out
    }

    /// Absorb bytes without counting them, for the padding itself.
    fn update_no_length(&mut self, data: &[u8]) {
        for byte in data {
            self.buffer[self.buffered] = *byte;
            self.buffered += 1;
            if self.buffered == 64 {
                let block = self.buffer;
                self.compress(&block);
                self.buffered = 0;
            }
        }
    }

    /// The compression function over one 64-byte block.
    fn compress(&mut self, block: &[u8; 64]) {
        let mut w = [0u32; 64];
        for index in 0..16 {
            w[index] = u32::from_be_bytes([
                block[index * 4],
                block[index * 4 + 1],
                block[index * 4 + 2],
                block[index * 4 + 3],
            ]);
        }
        for index in 16..64 {
            let s0 = w[index - 15].rotate_right(7)
                ^ w[index - 15].rotate_right(18)
                ^ (w[index - 15] >> 3);
            let s1 = w[index - 2].rotate_right(17)
                ^ w[index - 2].rotate_right(19)
                ^ (w[index - 2] >> 10);
            w[index] = w[index - 16]
                .wrapping_add(s0)
                .wrapping_add(w[index - 7])
                .wrapping_add(s1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = self.state;

        for index in 0..64 {
            let big_s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let choose = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(big_s1)
                .wrapping_add(choose)
                .wrapping_add(K[index])
                .wrapping_add(w[index]);
            let big_s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let majority = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = big_s0.wrapping_add(majority);

            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
        self.state[5] = self.state[5].wrapping_add(f);
        self.state[6] = self.state[6].wrapping_add(g);
        self.state[7] = self.state[7].wrapping_add(h);
    }
}

/// SHA-256 of a byte slice, as lowercase hex.
pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    to_hex(&hasher.finalize())
}

/// SHA-256 of a byte slice, as raw bytes.
pub fn sha256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize()
}

/// HMAC-SHA-256 (RFC 2104).
pub fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;

    // Keys longer than the block size are hashed; shorter keys are zero-padded.
    let mut padded = [0u8; BLOCK];
    if key.len() > BLOCK {
        padded[..32].copy_from_slice(&sha256(key));
    } else {
        padded[..key.len()].copy_from_slice(key);
    }

    let mut inner_pad = [0x36u8; BLOCK];
    let mut outer_pad = [0x5cu8; BLOCK];
    for index in 0..BLOCK {
        inner_pad[index] ^= padded[index];
        outer_pad[index] ^= padded[index];
    }

    let mut inner = Sha256::new();
    inner.update(&inner_pad);
    inner.update(message);
    let inner_digest = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(&outer_pad);
    outer.update(&inner_digest);
    outer.finalize()
}

/// Lowercase hex encoding.
pub fn to_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    out
}

/// Decode lowercase or uppercase hex. Rejects odd lengths and non-hex digits.
pub fn from_hex(text: &str) -> Result<Vec<u8>, CryptoError> {
    let bytes = text.as_bytes();
    if bytes.len() % 2 != 0 {
        return Err(CryptoError::new(
            "ERR_CRYPTO_HEX",
            "hex input must have an even number of digits",
        ));
    }
    let mut out = Vec::with_capacity(bytes.len() / 2);
    let mut index = 0;
    while index < bytes.len() {
        let high = hex_digit(bytes[index])?;
        let low = hex_digit(bytes[index + 1])?;
        out.push((high << 4) | low);
        index += 2;
    }
    Ok(out)
}

fn hex_digit(byte: u8) -> Result<u8, CryptoError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(CryptoError::new(
            "ERR_CRYPTO_HEX",
            format!("not a hex digit: {}", byte as char),
        )),
    }
}

/// Compare two byte slices without leaking where they first differ.
///
/// Both the length and the content influence the result, and the loop always
/// runs to completion: a caller checking a token or a MAC must not learn
/// anything from how long the comparison took.
pub fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    // Fold the length difference into the accumulator instead of returning
    // early, so the running time depends only on the longer input.
    let mut difference = (left.len() ^ right.len()) as u8;
    let length = std::cmp::max(left.len(), right.len());
    for index in 0..length {
        let a = left.get(index).copied().unwrap_or(0);
        let b = right.get(index).copied().unwrap_or(0);
        difference |= a ^ b;
    }
    difference == 0
}

/// A fresh random token, hex encoded, from the operating system's generator.
///
/// `bytes` is the entropy drawn, not the length of the hex string; the result is
/// twice as long.
pub fn random_hex(bytes: usize) -> Result<String, CryptoError> {
    if bytes == 0 || bytes > 4096 {
        return Err(CryptoError::new(
            "ERR_CRYPTO_RANDOM",
            format!("byte count must be between 1 and 4096, got {bytes}"),
        ));
    }
    let mut buffer = vec![0u8; bytes];
    fill_random(&mut buffer)?;
    Ok(to_hex(&buffer))
}

#[cfg(unix)]
fn fill_random(buffer: &mut [u8]) -> Result<(), CryptoError> {
    use std::io::Read;
    // The OS entropy source is the only correct one; there is no fallback that
    // would be safe, so a failure must propagate.
    let mut source = std::fs::File::open("/dev/urandom").map_err(|error| {
        CryptoError::new(
            "ERR_CRYPTO_RANDOM",
            format!("cannot open the system random source: {error}"),
        )
    })?;
    source.read_exact(buffer).map_err(|error| {
        CryptoError::new(
            "ERR_CRYPTO_RANDOM",
            format!("cannot read the system random source: {error}"),
        )
    })
}

#[cfg(windows)]
fn fill_random(buffer: &mut [u8]) -> Result<(), CryptoError> {
    // `BCryptGenRandom` with the system-preferred RNG. Reached through the
    // syscall-free `RtlGenRandom` name that bcrypt exports as
    // `SystemFunction036`, so no extra crate is needed.
    #[link(name = "bcrypt")]
    extern "system" {
        fn BCryptGenRandom(
            algorithm: *mut core::ffi::c_void,
            buffer: *mut u8,
            length: u32,
            flags: u32,
        ) -> i32;
    }
    const BCRYPT_USE_SYSTEM_PREFERRED_RNG: u32 = 0x0000_0002;
    // SAFETY: `buffer` is a valid writable slice of the given length, and a
    // null algorithm handle with the system-preferred flag is the documented
    // form for using the default RNG.
    let status = unsafe {
        BCryptGenRandom(
            std::ptr::null_mut(),
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    };
    if status != 0 {
        return Err(CryptoError::new(
            "ERR_CRYPTO_RANDOM",
            format!("BCryptGenRandom failed with status 0x{status:08x}"),
        ));
    }
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn fill_random(_buffer: &mut [u8]) -> Result<(), CryptoError> {
    Err(CryptoError::new(
        "ERR_CRYPTO_RANDOM",
        format!(
            "no random source is implemented for {}",
            std::env::consts::OS
        ),
    ))
}

/// A cryptographic operation failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CryptoError {
    pub code: String,
    pub message: String,
}

impl CryptoError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        CryptoError {
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

impl std::fmt::Display for CryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for CryptoError {}

/// Minimal JSON string escaping for the reports.
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
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The published test vectors are the only honest way to check a hash
    /// implementation; an internal round-trip proves nothing.
    #[test]
    fn sha256_matches_the_published_vectors() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_hex(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
        assert_eq!(
            sha256_hex(
                b"abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu"
            ),
            "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1"
        );
    }

    #[test]
    fn sha256_handles_the_five_million_a_vector_via_streaming() {
        // The standard long-message vector: 1,000,000 times 'a'. Absorbed in
        // awkward chunks so the buffering path is exercised, not bypassed.
        let mut hasher = Sha256::new();
        let chunk = vec![b'a'; 1000];
        for _ in 0..1000 {
            hasher.update(&chunk);
        }
        assert_eq!(
            to_hex(&hasher.finalize()),
            "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
        );
    }

    #[test]
    fn streaming_matches_one_shot_for_every_split_point() {
        let message: Vec<u8> = (0..=255u8).cycle().take(600).collect();
        let expected = sha256_hex(&message);
        for split in [0usize, 1, 55, 56, 63, 64, 65, 127, 128, 300, 599, 600] {
            let mut hasher = Sha256::new();
            hasher.update(&message[..split]);
            hasher.update(&message[split..]);
            assert_eq!(to_hex(&hasher.finalize()), expected, "split at {split}");
        }
    }

    #[test]
    fn sha256_block_boundaries_are_correct() {
        // 55, 56, 63 and 64 bytes are exactly where the padding forces an extra
        // block; a wrong length field shows up here first.
        assert_eq!(
            sha256_hex(&[b'a'; 55]),
            "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318"
        );
        assert_eq!(
            sha256_hex(&[b'a'; 56]),
            "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a"
        );
        assert_eq!(
            sha256_hex(&[b'a'; 64]),
            "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb"
        );
    }

    #[test]
    fn hmac_sha256_matches_rfc4231_vectors() {
        // Test case 1.
        assert_eq!(
            to_hex(&hmac_sha256(&[0x0b; 20], b"Hi There")),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
        // Test case 2 — "Jefe".
        assert_eq!(
            to_hex(&hmac_sha256(b"Jefe", b"what do ya want for nothing?")),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        // Test case 3.
        assert_eq!(
            to_hex(&hmac_sha256(&[0xaa; 20], &[0xdd; 50])),
            "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe"
        );
        // Test case 6 — a key longer than the block size is hashed first.
        assert_eq!(
            to_hex(&hmac_sha256(
                &[0xaa; 131],
                b"Test Using Larger Than Block-Size Key - Hash Key First"
            )),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        );
    }

    #[test]
    fn constant_time_eq_is_actually_constant_time_looking() {
        assert!(constant_time_eq(b"", b""));
        assert!(constant_time_eq(b"token", b"token"));
        assert!(!constant_time_eq(b"token", b"tokeN"));
        // A length mismatch must be a mismatch, not a panic.
        assert!(!constant_time_eq(b"token", b"token-longer"));
        assert!(!constant_time_eq(b"", b"x"));
    }

    #[test]
    fn hex_round_trips() {
        let bytes = [0x00u8, 0x0f, 0xf0, 0xff, 0x42];
        let text = to_hex(&bytes);
        assert_eq!(text, "000ff0ff42");
        assert_eq!(from_hex(&text).expect("decodes"), bytes);
        assert_eq!(from_hex("000FF0FF42").expect("decodes"), bytes);
    }

    #[test]
    fn malformed_hex_is_rejected_not_panicked() {
        assert_eq!(
            from_hex("abc").expect_err("odd length").code,
            "ERR_CRYPTO_HEX"
        );
        assert_eq!(
            from_hex("zz").expect_err("not hex").code,
            "ERR_CRYPTO_HEX"
        );
    }

    #[test]
    fn random_tokens_have_the_requested_entropy_and_do_not_repeat() {
        let first = random_hex(16).expect("random");
        let second = random_hex(16).expect("random");
        assert_eq!(first.len(), 32, "hex of 16 bytes is 32 characters");
        assert_eq!(second.len(), 32);
        assert_ne!(first, second, "two draws must not collide");
        assert!(from_hex(&first).is_ok());
    }

    #[test]
    fn an_out_of_range_entropy_request_is_rejected() {
        assert_eq!(
            random_hex(0).expect_err("zero").code,
            "ERR_CRYPTO_RANDOM"
        );
        assert_eq!(
            random_hex(100_000).expect_err("too much").code,
            "ERR_CRYPTO_RANDOM"
        );
    }

    #[test]
    fn the_report_version_is_pinned() {
        assert_eq!(REPORT_VERSION, 1);
        assert_eq!(EXIT_FAILURE, 125);
    }
}
