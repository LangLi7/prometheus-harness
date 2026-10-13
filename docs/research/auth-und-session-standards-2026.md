# Auth-, Session- und Speicher-Standards 2026 — entscheidungsreifer Bericht

**Zielumgebung:** Prometheus Harness — TypeScript auf Bun, TypeScript 7 / `tsgo`, Go und Rust für Dienste, kein Python. Windows-Entwicklung, Linux-Produktion, PostgreSQL, Redis, React-Weboberfläche (Server-Rendering + API).

**Methode:** Ausschließlich Primärquellen (OWASP Cheat Sheet Series, NIST, IETF-RFCs, Herstellerdoku) wurden gelesen, nicht nur Suchergebnis-Snippets. Jede Zahl in diesem Bericht steht in einer der unten verlinkten Quellen. Wo eine Behauptung nicht belegbar war, steht ausdrücklich **„nicht belegt"**.

**Stand der Prüfung:** 2026. Die zitierten OWASP-Cheat-Sheets wurden zum Prüfzeitpunkt abgerufen und enthalten u. a. Verweise auf `draft-ietf-oauth-rfc8725bis-10` (Stand 2026-08) und auf die OWASP-Top-10-Ausgabe 2025 — die Zitate sind also aktuell, nicht aus dem Archiv.

**Nichts in diesem Bericht ändert Code.** Es ist eine Entscheidungsvorlage.

---

## 1. Kurzfassung: die 12 Entscheidungen, je mit Empfehlung

| # | Entscheidung | Empfehlung |
|---|---|---|
| 1 | Passwort-Hashing | **Argon2id**, OWASP-Minimumprofil `m=19456 (19 MiB), t=2, p=1`. Kein SHA-256/512+Salt. Parameter **auf der Zielmaschine benchmarken**, Ziel < 1 s pro Hash. |
| 2 | Hashing-Bibliothek (Bun/Node) | **`@node-rs/argon2`** (native Rust-Bindung, PHC-Format) **oder** `Bun.password` (eingebaut, argon2id) — bei Bun `memoryCost`/`timeCost` **explizit setzen**, nicht die Voreinstellung übernehmen. |
| 3 | Sitzungsmechanismus | **Opakes Server-Session-Cookie** als Primärmechanismus (`__Host-` + `Secure` + `HttpOnly` + `SameSite=Lax`), Session-Datensatz in Postgres, Hot-Pfad-Cache in Redis. **Kein JWT als Sitzung.** |
| 4 | Wann JWT | Nur für **maschinelle, kurzlebige, fremd-konsumierte** Token (OAuth-Access-Token, OIDC-ID-Token, Service-zu-Service) — mit `iss`/`aud`-Validierung, harter Algorithmus-Allowlist, kurzer TTL. |
| 5 | Session-Token-Form | **Identifier+Verifier-Split**: Cookie trägt öffentliche ID + geheimen Verifier; Server speichert ID + SHA-256(Verifier), Vergleich konstantzeitig. Verifier ≥ 128 Bit CSPRNG-Entropie (OWASP: lieber 160 Bit). |
| 6 | Rotation/Widerruf | Neue Session-ID **bei jeder Privilegienänderung** (Login, Passwortwechsel, Rollenwechsel), alte ID serverseitig zerstören. Idle-Timeout + absolutes Timeout serverseitig erzwingen, Logout serverseitig invalidieren. |
| 7 | CSRF | **Synchronizer-Token** (stateful) **plus** Origin-/`Sec-Fetch-Site`-Prüfung als zweite Schicht. Bei `SameSite=None` ist ein Token **Pflicht**. Signiertes Double-Submit nur, wenn Zustandslosigkeit erzwungen ist. |
| 8 | Rate Limiting Login | Dreistufig, **erfolgsbasiert gezählt**: z. B. 4 Fehlversuche/Minute → Challenge, 10/10 min → Challenge, 20/Stunde → 1 Tag Block. Zähler **pro Konto** *und* **pro IP**, Argon2id **nach** dem Limit. |
| 9 | API-Schlüssel | Präfix (`ph_live_…` / `ph_svc_…`) + Lookup-ID im Klartext **neben** SHA-256 des Gesamtschlüssels. Hash ist hier richtig (hohe Entropie), kein bcrypt. Schlüssel nur einmal anzeigen. |
| 10 | Fremd-Anbieter-Schlüssel (z. B. DeepSeek) | **AES-256-GCM mit Umschlagverfahren**: pro Datensatz ein DEK, DEK mit einem KEK aus Umgebungsvariable/Secret-Datei gewrappt. `key_id` + `alg` mit jedem Chiffrat speichern (Krypto-Agilität). |
| 11 | Verschlüsselung im Ruhezustand | **Server-seitige Verschlüsselung ausgewählter Felder** mit AES-256-GCM — als Schutz gegen Backup-/DB-Diebstahl, **nicht** gegen Anwendungs-Kompromittierung. |
| 12 | „Ende-zu-Ende" | Für Einzelnutzer/Kleingruppe **nicht** als Werbeversprechen führen. Wenn E2EE: MLS (RFC 9420) im Browser, aber dann ist serverseitige Suche/Indexierung unmöglich — beides gleichzeitig ist Etikettenschwindel. |

Die Begründungen, Quellen und Gegenargumente stehen in den Abschnitten 2–11. Die Abschnitte 12 und 13 nennen ausdrücklich, was ich **nicht** empfehle und was in „professionellen" Auth-Systemen typischerweise Etikettenschwindel ist.

---

## 2. Frage 1 — Passwort-Hashing (Server-Passwörter)

### Empfehlung

**Argon2id** ist 2026 der Standard. Konkret: eines der fünf OWASP-Minimalprofile, für einen Bun-Server mit 19 MiB pro Login beginnend:

```
m = 19456 KiB (19 MiB), t = 2, p = 1
```

Höher skalieren, wenn die Hardware es erlaubt, aber immer messen. Kein SHA-256/512 mit Salt. Peppering: optional als Defense-in-Depth, nie als Ersatz. Bibliothek: `@node-rs/argon2` (nativ) oder `Bun.password` (eingebaut).

### Begründung — was OWASP wörtlich sagt

Das Password Storage Cheat Sheet nennt als Zusammenfassung:

> „**Use Argon2id with a minimum configuration of 19 MiB of memory, an iteration count of 2, and 1 degree of parallelism.**" — [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Die vollständige Liste der gleichwertigen Minimalprofile lautet dort:

- `m=47104 (46 MiB), t=1, p=1`
- `m=19456 (19 MiB), t=2, p=1`
- `m=12288 (12 MiB), t=3, p=1`
- `m=9216 (9 MiB), t=4, p=1`
- `m=7168 (7 MiB), t=5, p=1`

> „These configuration settings provide an equal level of defense, and the only difference is a trade off between CPU and RAM usage." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Wichtig für die Parameterwahl — OWASP warnt davor, Parallelität als Kostenfaktor zu missverstehen:

> „Parallelism controls the number of lanes over which the memory is divided; increasing p does not multiply the total memory or act as an iteration count." […] „increasing parallelism is not a guarantee of slower password guessing. Use one of the following minimum configurations" — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Zur Wahl des Algorithmus: Argon2 gewann 2015 die Password Hashing Competition, und von den drei Argon2-Varianten:

> „use the Argon2id variant since it provides a balanced approach to resisting both side-channel and GPU-based attacks." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

**scrypt** ist der Fallback, wenn Argon2id nicht verfügbar ist. OWASP nennt auch hier fünf gleichwertige Profile, angefangen bei `N=2^17 (128 MiB), r=8 (1024 bytes), p=1` bis `N=2^13 (8 MiB), r=8, p=10` ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)).

**bcrypt** ist ausdrücklich Legacy:

> „The bcrypt password hashing function **should only** be used for password storage in legacy systems where Argon2 and scrypt are not available. The work factor should be as large as verification server performance will allow, with a minimum of 10." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

bcrypt hat außerdem ein hartes Eingabelimit von 72 Bytes. Die bei vielen Bibliotheken übliche „Lösung", lange Passwörter vorher zu hashen, bewertet OWASP als **gefährlich** (Password Shucking):

> „Just using pure SHA-512, (i.e. `bcrypt(base64(sha512($password))), $salt, $cost)`) is a **dangerous practice** and is as secure as just using pure SHA-512." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Zum Zeitbudget:

> „As a general rule, calculating a hash should take less than one second." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

### Warum NICHT SHA-256/512 mit Salt

> „Fast hashing algorithms such as SHA‑256 are not suitable for password storage because they allow attackers to perform large numbers of guesses quickly. Using slow, memory‑hard algorithms makes brute‑force attacks significantly more difficult, expensive, and time‑consuming." — [Password Storage Cheat Sheet, Introduction](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Salting verhindert nur Vorberechnung und gleiche Hashes für gleiche Passwörter — es verlangsamt den Angriff nicht:

> „As the salt is unique for every user, an attacker has to crack hashes one at a time using the respective salt rather than calculating a hash once and comparing it against every stored hash. This makes cracking large numbers of hashes significantly harder, as the time required grows in direct proportion to the number of hashes." — [ebd., „Salting"](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Die konkrete Größenordnung, wie schnell SHA-256 auf GPU-Hardware ist, lässt sich aus einer unabhängigen Benchmark-Quelle belegen:

> „Hashcat performance benchmarks: H200 vs. MI300X vs. RTX 5090 — SHA-256: 15092.3 MH/s (H200) / 24673.6 MH/s (MI300X) / **27681.6 MH/s (RTX 5090)**" — [Specops Software, „Do AI GPUs Make Password Cracking Faster"](https://specopssoft.com/blog/gpu-password-cracking-nvidia-amd/)

Das sind ~2,8 × 10¹⁰ SHA-256-Hashes **pro Sekunde** auf einer einzelnen Consumer-GPU. Genau dieser Geschwindigkeitsvorteil ist der Grund, warum ein schneller Hash für Passwörter ungeeignet ist. Argon2id entfernt diesen Vorteil, weil der Angreifer Speicher **und** Zeit pro Kandidat aufwenden muss.

### Peppering / Server-Key

OWASP erlaubt Peppering als zusätzliche Schicht, mit klaren Einschränkungen:

> „Consider using a pepper to provide additional defense in depth (**though alone, it provides no additional secure characteristics**)." — [ebd., Zusammenfassung](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Die Anforderungen:

> „A pepper is **shared between stored passwords**, rather than being unique to an individual password like a password salt." … „the pepper should not be public and **should not be stored along with the generated hash**. The pepper should be stored separately from the password database." … „Peppers are secrets and should be stored in 'secrets vaults' or HSMs" — [ebd., „Peppering"](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Und die Betriebskonsequenz, die man vorher wissen muss:

> „In the event of a pepper's compromise, the pepper will have to be changed. Peppers cannot be changed without knowledge of a user's password. Therefore changing a pepper will require forcing all users whose passwords were protected by the previous pepper to reset their passwords." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Zwei zulässige Varianten: **Pre-Hashing** (Pepper vor dem Hashing an das Passwort anhängen) und **Post-Hashing** (Ergebnis des Passwort-Hashs mit HMAC nachhashen, Pepper = HMAC-Key). OWASP nennt für den bcrypt-Sonderfall konkret `bcrypt(base64(hmac-sha384(data:$password, key:$pepper)), $salt, $cost)` ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)).

### Bibliotheken für Bun/Node

**Bun-eingebaut (`Bun.password`)** — laut Bun-Doku:

> „`Bun.password` is a collection of utility functions for hashing and verifying passwords… Hash and verify passwords using argon2 or bcrypt. The default is argon2. … The underlying implementation of these functions is provided by the `rust-argon2` and `bcrypt` Rust crates." — [Bun API Reference](https://bun.com/reference/bun/password)

Die Standardausgabe zeigt die tatsächlichen Voreinstellungen:

> `$argon2id$v=19$m=65536,t=2,p=1$…` — [Bun Hashing Docs](https://bun.com/docs/api/hashing)

Das entspricht `m=65536 KiB` (64 MiB), `t=2`, `p=1` — **stärker** als das OWASP-Minimum von 19 MiB. Für Bun gilt: Argon2id ist die Voreinstellung und erfüllt das OWASP-Minimum; wer die Parameter im Code explizit setzt, muss `memoryCost` **in KiB** angeben (`memoryCost: 8` in der Doku ist die dokumentierte Untergrenze, nicht eine Empfehlung — [Bun Hashing Docs](https://bun.com/docs/api/hashing)). Bei bcrypt wandelt Bun Passwörter über 72 Bytes vorher durch SHA-512 — genau die Praxis, die OWASP als gefährlich einstuft; daraus folgt: **bcrypt in Bun für neue Passwörter nicht verwenden**.

**`@node-rs/argon2`** — argon2-Rust-Bindung für Node.js, veröffentlicht als reguläres npm-Paket mit kurzen Release-Abständen ([npm: @node-rs/argon2](https://www.npmjs.com/package/@node-rs/argon2), [napi-rs/node-rs](https://github.com/napi-rs/node-rs)). Das Bindeglied ist die Rust-Crate-Implementierung, wie sie auch Bun einsetzt — also dieselbe Krypto-Basis, nur mit Kontrolle über die Parameter und ohne Bindung an die Bun-Laufzeit. Das ist die Wahl, wenn der Code auch unter Node laufen soll.

**`argon2-browser` / WASM-Varianten** — die Bibliothek selbst begründet, warum WASM hier die falsche Wahl ist:

> „Of course you can use generated WASM in node.js, but it's not sensible: you will get much better speed by compiling it as a native node.js addon" — [argon2-browser, npm](https://www.npmjs.com/package/argon2-browser)

Für serverseitiges Passwort-Hashing ist WASM also langsamer als nativ. Für eine reine Browser-Anwendung wäre es anders, aber hier wird serverseitig gehasht.

**Wartungsstand und Sicherheitshistorie:** Ich habe **keine CVE-Angabe zu `@node-rs/argon2`, `Bun.password` oder der `rust-argon2`-Crate recherchiert und belege sie daher nicht.** Was sich belegen lässt: Die PHC-Referenzimplementierung (`P-H-C/phc-winner-argon2`) existiert und ist die Spezifikationsreferenz ([GitHub: phc-winner-argon2](https://github.com/p-h-c/phc-winner-argon2)). Für die Bibliothekswahl sollte vor dem Festschreiben ein Blick in die jeweilige Advisory-Datenbank erfolgen — das ist eine offene Prüfaufgabe, keine belegte Empfehlung.

### Was dagegen spricht / Unsicherheit

- **Argon2id-Parameter sind eine Betriebsentscheidung, keine Konstante.** 19 MiB pro Login heißt bei 100 gleichzeitigen Logins ~1,9 GiB RAM-Spitze. OWASP fordert deshalb ausdrücklich, die Parameter auf dem Zielsystem zu benchmarken ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)).
- **Bun-Implementierung ist nicht die PHC-Referenz.** Bun nutzt `rust-argon2`; das PHC-String-Format ist kompatibel, die Implementierung ist es nicht. Für Interoperabilität ist das irrelevant, für das Vertrauen in die Implementierung schon. Die Bun-Doku liefert kein FIPS-Attest oder Ähnliches — **nicht belegt**, dass eine Zertifizierung existiert.
- **Ich habe die inhaltliche Qualität der Argumentation im Paper „Evaluating Argon2 Adoption and Effectiveness in Real-World Software" nicht geprüft** („nicht belegt", was dessen Aussagen angeht); es wurde nur als Fundstelle gefunden.
- **Peppering kostet die Fähigkeit, einen Pepper zu rotieren, ohne alle Nutzer zur Passwortzurücksetzung zu zwingen.** Das ist ein harter Betriebsaufwand und muss gegen den Gewinn abgewogen werden.

---

## 3. Frage 2 — Sitzungen: Cookie gegen JWT

### Empfehlung

**Opakes Server-Session-Cookie** für die Web-App. Konkret:

1. Cookie-Name mit `__Host-`-Präfix, z. B. `__Host-ph_session`.
2. Attribute: `Secure; HttpOnly; SameSite=Lax; Path=/` — **kein `Domain`**.
3. Cookie-Wert = `identifier.verifier` (öffentliche ID + geheimer Verifier).
4. Serverseitig: Lookup über `identifier` (indiziert), dann konstantzeitiger Vergleich von `SHA-256(verifier)` gegen den gespeicherten Hash.
5. Session-Datensatz in PostgreSQL (Wahrheit), Redis als Cache für den heißen Pfad.
6. Rotation bei jeder Privilegienänderung, Idle- **und** absolutes Timeout serverseitig, Logout serverseitig.

**JWT nur dort**, wo ein *anderer Dienst* das Token ohne Rückfrage verifizieren können muss (OAuth-Access-Token, Service-zu-Service, Webhook-Signatur) — und dann kurzlebig, mit harter `alg`-Allowlist und validiertem `iss`/`aud`.

### Begründung

OWASP äußert sich 2026 sehr deutlich gegen JWT als Sitzung:

> „A JWT is often suggested for 'stateless' user sessions. However, this usage is **frowned upon**." — [OWASP JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)

und weiter:

> „JWTs are often suggested for 'stateless' user sessions. However, if you use JWTs for user sessions, you will need a solution for managing session invalidation. This can be achieved using a deny list of revoked sessions/tokens. If your application implements such a deny list, **user sessions won't be completely stateless anymore which might defeat the benefits of stateless sessions**. You might want to consider using a plain session system" — [ebd., „Not using JWTs"](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)

Das ist das Kernargument: Sobald man Widerruf braucht — und eine Anwendung mit Logout braucht ihn immer — ist JWT nicht mehr zustandslos, und man hat die Nachteile beider Ansätze.

Zusätzlich: Ein signiertes JWT ist **nicht vertraulich**:

> „A signed JWT (JWS) provides integrity and authenticity, but not confidentiality. The payload is only base64url encoded, not encrypted, so anyone who obtains the token can read every claim. … the claims remain exposed elsewhere: in application logs, in browser storage, in referrer headers, and to any intermediary that terminates TLS." — [ebd., „Signed JWTs are not confidential"](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)

Für Sitzungsinhalte (Nutzer-ID, Mandant, Rollen) heißt das: Alles, was im JWT steht, liegt beim Client im Klartext. Bei einem Cookie wird nur eine bedeutungslose ID ausgeliefert.

Die OWASP-Top-10-Ausgabe 2025 bestätigt den Cookie-Weg als Prävention gegen A07:2025 Authentication Failures:

> „Use a server-side, secure, built-in session manager that generates a new random session ID with high entropy after login. Session identifiers should not be in the URL, be securely stored in a secure cookie, and invalidated after logout, idle, and absolute timeouts." — [OWASP Top 10:2025, A07](https://top10.owasp.org/2025/A07_2025-Authentication_Failures/)

### Korrekte Session-Token-Form (der Teil, den fast alle falsch machen)

OWASP beschreibt zwei akzeptable Designs. Das erste ist „verbatim speichern" — akzeptabel, aber schwach:

> „Storing random session tokens verbatim can be acceptable in a tightly controlled session store, but **anyone who can read it can reuse unexpired tokens. High entropy protects against guessing; it does not protect exposed tokens.** If read-only disclosure of the store is in your threat model, store a one-way verifier instead." — [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Das zweite, bessere Design:

> „One approach is an **identifier and secret verifier split**. The cookie carries both values; the server stores the public lookup identifier and the full SHA-256 hash of the verifier. On every request, look up the session by identifier, hash the supplied verifier, and compare it with the stored hash using a constant-time comparison. **Never accept the identifier alone as proof of authentication.** … A fast hash is sufficient for these random verifiers; password hashing algorithms are unnecessary." — [ebd., „Server-Side Session Token Storage"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Entropie-Anforderung:

> „Generate the token, or the secret verifier in the split design, using a CSPRNG with **at least 128 bits of entropy; prefer 160 bits or more**… Generate the verifier independently of the identifier; the public identifier does not count toward the verifier's entropy." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Der ältere, allgemeinere Entropiewert derselben Seite lautet:

> „Session identifiers must have at least `64 bits` of entropy to prevent brute-force session guessing attacks." … „When using hexadecimal encoding, a session ID must be at least 16 hexadecimal characters long" — [ebd., „Session ID Entropy/Length"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Praktisch heißt das: **128–160 Bit Entropie für den Verifier**, nicht 64. Und die Obergrenze der Sinnhaftigkeit zeigt OWASP selbst mit einer Rechnung:

> „If a web application generates session IDs with 64 bits of entropy, an attacker can expect to spend approximately 585 years to successfully guess a valid session ID, assuming the attacker can try 10,000 guesses per second with 100,000 valid simultaneous sessions available" — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

### Cookie-Flags

| Flag | Empfehlung | Belegstelle |
|---|---|---|
| `Secure` | **Pflicht.** „This session protection mechanism is mandatory to prevent the disclosure of the session ID through MitM (Man-in-the-Middle) attacks." | [Session Mgmt CS](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) |
| `HttpOnly` | **Pflicht.** „This session ID protection is mandatory to prevent session ID stealing through XSS attacks." | [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) |
| `SameSite` | **`Strict` bevorzugt, `Lax` akzeptabel.** „Session cookies must explicitly set `SameSite=Strict` (preferred) or `SameSite=Lax`. Never use `SameSite=None` without `Secure`, and do not rely on the browser-default value, which varies across browsers and versions." | [ebd., „SameSite Attribute"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) |
| `__Host-` | **Empfohlen.** „`__Host-` — the cookie must be set with `Secure`, must not have a `Domain` attribute, and must use `Path=/`. Prevents subdomain forgery and HTTPS downgrade attacks. **Recommended for session IDs.**" | [ebd., „Cookie Name Prefixes"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) |
| `__Secure-` | Nur wenn Subdomain-Sharing nötig ist: „Use only when subdomain sharing is required." | [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) |
| `Domain` | **Nicht setzen.** „the `Domain` attribute should not be set (restricting the cookie just to the origin server)" | [ebd., „Domain and Path Attributes"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) |
| `Path` | „as restrictive as possible to the web application path" | [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) |

Beispiel aus der Doku: `Set-Cookie: __Host-SessionID=<value>; Secure; HttpOnly; SameSite=Strict; Path=/` ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)).

Wichtig zur Selbsttäuschung bei `Domain`: „Setting the `Domain` attribute to a too permissive value, such as `example.com` allows an attacker to launch attacks on the session IDs between different hosts and web applications belonging to the same domain, known as cross-subdomain cookies." ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html))

### Lifetime, Idle-Timeout, absolutes Timeout

> „All sessions should implement an idle or inactivity timeout." […] „All sessions should implement an absolute timeout, regardless of session activity." — [ebd., „Automatic Session Expiration"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Konkrete Bereiche, die OWASP nennt:

> „Common idle timeouts ranges are **2-5 minutes for high-value applications and 15-30 minutes for low risk applications**. Absolute timeouts depend on how long a user usually uses the application. If the application is intended to be used by an office worker for a full day, an appropriate absolute timeout range could be **between 4 and 8 hours**." — [ebd., „Session Expiration"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Und der Punkt, an dem viele Implementierungen scheitern:

> „**Session timeout management and expiration must be enforced server-side.** If the client is used to enforce the session timeout… an attacker could manipulate these to extend the session duration." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Ergänzend die **Renewal Timeout**-Variante: Die Session-ID wird mitten in der Session transparent erneuert; die alte ID bleibt für ein Sicherheitsintervall gültig, dann wird sie ungültig ([ebd., „Renewal Timeout"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)).

Zur Browser-Schließung — eine häufige Fehlannahme:

> „Browser close events cannot reliably enforce logout. For example, `beforeunload` may not fire when a mobile browser is closed from the app manager. Use server-side idle and absolute timeouts and an explicit logout action to invalidate sessions." — [ebd., „Limits of Logout on Browser Close"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Und zum Cookie-Löschen:

> „deleting a cookie alone does not invalidate a stolen copy of the session ID." — [ebd., „Expire and Max-Age Attributes"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

### Rotation und Session-Fixation

> „The session ID must be renewed or regenerated by the web application after **any privilege level change** within the associated user session. The most common scenario where the session ID regeneration is mandatory is during the authentication process… Common scenarios to consider include; password changes, permission changes, or switching from a regular user role to an administrator role… **any previous session IDs must be ignored, only the current session ID must be assigned to every new request received for the protected resource, and the old or previous session ID must be destroyed.**" — [ebd., „Renew the Session ID After Any Privilege Level Change"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Und eine Ergänzung, die direkt zur CSRF-Login-Thematik passt:

> „A complementary recommendation is to use a different session ID or token name (or set of session IDs) pre and post authentication, so that the web application can keep track of anonymous users and authenticated users without the risk of exposing or binding the user session between both states." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Zum strikten Modus (kein Akzeptieren selbstgesetzter IDs):

> „Web applications should never accept a session ID they have never generated, and in case of receiving one, they should generate and offer the user a new valid session ID. Additionally, this scenario should be detected as a suspicious activity and an alert should be generated." — [ebd., „Permissive and Strict Session Management"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Die OWASP-Top-10-Mapping-Liste nennt `CWE-384 Session Fixation` und `CWE-613 Insufficient Session Expiration` als zu A07:2025 gehörende Schwächen ([OWASP Top 10:2025, A07](https://top10.owasp.org/2025/A07_2025-Authentication_Failures/)).

### Bindung an den Client

OWASP ist hier differenziert und ehrlich über die Grenzen:

> „it is **highly recommended to bind the session ID to other user or client properties**, such as the client IP address, User-Agent, or client-based digital certificate. If the web application detects any change or anomaly between these different properties in the middle of an established session, this is a very good indicator of session manipulation and hijacking attempts" — [Session Management CS, „Binding the Session ID to Other User Properties"](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

aber unmittelbar danach:

> „Although these properties **cannot be used by web applications to trustingly defend against session attacks**, they significantly increase the web application detection (and protection) capabilities. However, a skilled attacker can bypass these controls by reusing the same IP address assigned to the victim user by sharing the same network (very common in NAT environments, like Wi-Fi hotspots)… or by manually modifying the User-Agent" — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

**Praktische Konsequenz für ein Agenten-Harness:** Bindung an IP oder User-Agent als *Signal* verwenden (loggen, bei Anomalie reauthentifizieren lassen), **nicht** als harte Ablehnung — sonst brechen mobile Clients beim Netzwechsel.

Für den JWT-Fall (z. B. Service-Token) nennt OWASP eine Cookie-Fingerprint-Technik: ein zufälliger Wert als gehärtetes Cookie, dessen SHA-256 im Token steckt, sodass ein gestohlenes Token ohne das Cookie nutzlos ist ([OWASP JSON Web Token for Java CS via Deteact-Spiegelung](https://owasp.deteact.com/cheat/cheatsheets/JSON_Web_Token_Cheat_Sheet_for_Java.html) — **Hinweis: die kanonische Java-Variante auf cheatsheetseries.owasp.org liefert 404; ich zitiere die Spiegelung und kennzeichne das als nicht-kanonische Fundstelle**).

### Widerruf bei JWT, wenn man ihn doch braucht

OWASP nennt drei Wege, in absteigender Empfehlung:

1. **Token Status List (TSL):** Das JWT trägt einen `status`-Claim mit URI und Index in eine komprimierte Statusliste ([JWT CS, „Token Status List"](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)).
2. **Nonce an die Session gebunden** für Freshness/Replay-Schutz.
3. **Denylist über `jti`+`iss`** — mit einer sehr konkreten Warnung:

> „Using the raw JWT or a secure hash of the JWT (`SHA-256(token)`) as the denylist key is **not safe** and might expose the application to **denylist bypass through JWT malleability**. An attacker in possession of a revoked JWT might be able to modify an alternative representation of the JWT that still passes signature verification: because of non-strict JWT parsing of the JWT implementation; for ECDSA JWTs, because of the malleability of ECDSA signatures." — [ebd., „JWT denylist"](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)

Zusätzlich zu vermeiden sind nach derselben Quelle: Key-Type-Confusion (public key als HMAC-Secret), Vertrauen in `jwk`/`jku`/`x5u` aus dem Token-Header, `iss`/`aud`-Konfusion, Cross-JWT-/Token-Typ-Konfusion (mitigation: `typ` = `at+jwt` und getrennte Schlüssel) — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html). Für MAC-basierte JWTs gilt: Secret mindestens so lang wie der Output, mindestens 160 Bit Entropie, nicht mit einer anderen Audience oder einem anderen Issuer wiederverwenden, kein Passwort als Secret ([ebd., „MAC"](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)).

### Was dagegen spricht

- **Sessions skalieren nicht „von allein".** Jede Anfrage braucht einen Store-Lookup. Redis als Cache und Postgres als Wahrheit ist der übliche Ausweg; bei Redis-Ausfall muss entschieden werden, ob man fail-open (Sicherheitsverlust) oder fail-closed (Totalausfall) geht. Das ist eine Betreiberentscheidung — siehe Abschnitt 9 und die offenen Fragen.
- **JWT hat legitime Einsatzfälle**, die ich nicht wegdiskutieren will: Wenn viele unabhängige Dienste (Go- und Rust-Dienste im Harness!) ein Token ohne DB-Zugriff prüfen sollen, ist ein kurzlebiges, publik-key-verifiziertes Token die richtige Antwort. Der Fehler ist nicht JWT, sondern JWT als *Sitzung eines Browsers*.
- **`SameSite=Strict` ist ein UX-Kompromiss.** Es bricht legitime Cross-Site-Links (z. B. ein Link aus einem Chat in die App führt dazu, dass der Nutzer nicht eingeloggt erscheint). OWASP akzeptiert deshalb `Lax` als gleichwertig, verlangt dann aber zusätzliche CSRF-Maßnahmen (siehe Abschnitt 4).
- **Das Identifier+Verifier-Split-Design ist nicht gratis:** Es sind zwei Werte im Cookie, ein zusätzlicher Hash pro Anfrage und ein konstantzeitiger Vergleich. Der Gewinn ist real (Lesen des Session-Stores genügt nicht mehr zum Token-Diebstahl), aber der Aufwand sollte bewusst getragen werden.

---

## 4. Frage 3 — CSRF: aktueller Stand

### Empfehlung

Für eine cookie-basierte Sitzung mit Server-Rendering **und** API: **Synchronizer-Token-Pattern plus Fetch-Metadata-/Origin-Prüfung.** Nicht das naive Double-Submit-Cookie. Bei `SameSite=None` ist ein servervalidiertes Token Pflicht.

### Begründung

Die Grundregeln aus dem CSRF-Cheat-Sheet wörtlich:

> „**Stateful software should use the synchronizer token pattern**" … „**Stateless software should use double submit cookies**" … „**Implement at least one mitigation from Defense in Depth Mitigations section**" — [OWASP CSRF Prevention CS](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Und die wichtigste Vorbemerkung überhaupt:

> „**IMPORTANT: Remember that Cross-Site Scripting (XSS) can defeat all CSRF mitigation techniques!**" — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

**Synchronizer Token Pattern** — die Anforderungen an das Token:

> „CSRF tokens should be: Unique per user session. Secret. Unpredictable (large random value generated by a secure method)." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Wo es **nicht** hingehört:

> „A CSRF token **should not be transmitted in a cookie for synchronized patterns**. A CSRF token must not be leaked in the server logs or in the URL." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Übertragung: als Hidden-Field im Formular **oder** als Custom Header. Der Header ist sicherer:

> „Since requests with custom headers are automatically subject to the same-origin policy, it is more secure to insert the CSRF token in a custom HTTP request header via JavaScript than adding a CSRF token in the hidden field form parameter." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Für Server-Rendering empfehlt OWASP das Token im `<meta>`-Element:

> „the server can include the token in the page, such as a `<meta>` element, and the client can read it when constructing protected requests. Use your template's attribute encoder when rendering the value. Do not put tokens in URLs or logs." — [ebd., „Storing the CSRF Token Value in the DOM"](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

**Naives Double-Submit ist ausdrücklich abgelehnt:**

> „**WARNING** The Naive Double-Submit Cookie pattern is bypassable by an attacker who can write cookies on the target domain (e.g., via a vulnerable sibling subdomain, DNS takeover, or plaintext-HTTP cookie injection on a non-`__Host-` cookie). For new code, use the Signed Double-Submit Cookie pattern above. The naive pattern is documented for reference only." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Wenn Double-Submit, dann **signiert und session-gebunden**:

> „The most secure implementation of the Double Submit Cookie pattern is the Signed Double-Submit Cookie, which explicitly ties tokens to the user's authenticated session (e.g., session ID). **Simply signing tokens without session binding provides minimal protection and remains vulnerable to cookie injection attacks.**" — [ebd., „Signed Double-Submit Cookie (RECOMMENDED)"](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Das Pseudocode-Muster dort: `message = sessionID.length + "!" + sessionID + "!" + randomValue.length + "!" + randomValue`, `hmac = HMAC-SHA256(secret, message)`, `csrfToken = hmac.toHex() + "." + randomValue`, Cookie `Secure`, **ohne `HttpOnly`** (das JS muss lesen können), Token-Wert geht per Header/Form-Feld — nicht per Cookie — zurück, und der Vergleich erfolgt konstantzeitig ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)).

Ein wichtiger Punkt, der oft falsch gemacht wird:

> „It's a common misconception to include timestamps as a value to specify the CSRF token expiration time. A CSRF Token is not an access token. They are used to verify the authenticity of requests throughout a session, using session information. **A new session should generate a new token.**" — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

### Fetch Metadata — die günstigste zweite Schicht

> „Fetch Metadata request headers provide extra information about the context from which an HTTP request was made. Servers can use these headers — most importantly `Sec-Fetch-Site` — as a lightweight and reliable method to block obvious cross-site requests." — [ebd., „Fetch Metadata headers"](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

> „`Sec-Fetch-Site` — the primary signal for CSRF protection. It indicates the relationship between the request initiator's origin and its target's origin: `same-origin`, `same-site`, `cross-site`, or `none`." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Verbreitung und Pflicht-Fallback:

> „Fetch Metadata request headers are supported in all modern browsers on both desktop and mobile… with **over 98% global coverage**. For the rare cases of outdated or embedded browsers that lack `Sec-Fetch-*` support, a fallback to standard origin verification should provide the required coverage." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

> „Because some legacy browsers do not send `Sec-Fetch-*` headers, a fallback to standard origin verification headers **is a mandatory requirement** for any Fetch Metadata implementation." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Origin-Verifikation korrekt machen:

> „In both cases, make sure the target origin check is strong. For example, if your site is `example.org` make sure `example.org.attacker.com` does not pass your origin check" … „Missing headers and `Origin: null` are not evidence of a same-origin request." — [ebd., „Using Standard Headers to Verify Origin"](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

### Was OWASP für `SameSite=None` sagt

`SameSite=None` wird nicht verboten, aber die Bedingungen werden streng:

> „Never use `SameSite=None` without `Secure`" — [Session Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Für CSRF bedeutet `SameSite=None` konkret: Der Cookie-basierte CSRF-Schutz durch SameSite entfällt vollständig, und die „SameSite allein genügt"-Bedingung ist nicht mehr erfüllbar. OWASP listet, wann SameSite überhaupt allein reichen kann:

> „In narrow deployments `SameSite` alone can provide a reasonable CSRF defense, provided every one of the following holds: The application does not share a registrable domain with any host, subdomain, or service you do not fully control. No `GET` (or other safe-method) endpoint in the application performs a state-changing action… The session cookie is set with `SameSite=Strict`, or `SameSite=Lax` combined with the `__Host-` prefix and a strict audit of every `GET` handler. Origin or Referer verification… is in place… For any application that does not meet all of the above, `SameSite` should be treated as a defense-in-depth layer and combined with a CSRF token or a double-submit pattern rather than relied on alone." — [CSRF CS, „When SameSite May Be Sufficient On Its Own"](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

**Für das Harness heißt das:** Wenn die React-Oberfläche und die API auf *verschiedenen Origins* laufen und die Session per `SameSite=None` übermittelt wird, ist ein servervalidiertes CSRF-Token **zwingend**, und die Origin-Allowlist muss explizit gepflegt werden.

### Logout und Login

Ergänzend aus derselben Quelle: State-Changing-Operationen dürfen nie per `GET` erfolgen („Do not use GET requests for state changing operations"), und Login-Formulare brauchen ebenfalls CSRF-Schutz:

> „Login CSRF can be mitigated by creating pre-sessions (sessions before a user is authenticated) and including tokens in login form. … Remember that pre-sessions cannot be transitioned to real sessions once the user is authenticated - the session should be destroyed and a new one should be made to avoid session fixation attacks." — [ebd., „Possible CSRF Vulnerabilities in Login Forms"](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Das deckt sich exakt mit der Session-ID-Rotation beim Login (Abschnitt 3).

### Was dagegen spricht

- **Zwei Mechanismen sind mehr Code.** Origin-Prüfung und Token-Prüfung können sich widersprechen (z. B. gültiges Token, aber `Origin` fehlt wegen eines Proxys). OWASP adressiert das explizit: „Do not bypass CSRF validation merely to preserve compatibility with missing or `null` source origins." ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)). Die Reihenfolge muss bewusst definiert werden.
- **Hinter einem Proxy ist die Ziel-Origin-Bestimmung fehleranfällig.** OWASP warnt: „Do not trust the header merely because it is present." `X-Forwarded-Host` darf nur von vertrauenswürdigen Proxies akzeptiert werden, und diese müssen client-gelieferte Forwarded-Header überschreiben ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)).
- **`Sec-Fetch-Site` schützt nicht vor client-seitigem CSRF**, bei dem eigenes JavaScript im gleichen Origin eine Aktion auslöst ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)).
- **CAPTCHA ist kein CSRF-Schutz:** „Do NOT use CAPTCHA because it is specifically designed to protect against bots." ([ebd., „User Interaction-Based CSRF Defense"](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html))

---

## 5. Frage 4 — Rate Limiting, Enumeration, Credential Stuffing, Argon2-DoS

### Empfehlung

1. **Dreistufige, graduierte Antwort** auf Login-Fehlversuche, gezählt auf **Fehlerantworten** (401/403), nicht auf alle Requests.
2. **Zwei Zähler parallel:** pro Konto *und* pro IP. Nur-IP-Limits sind wirkungslos gegen verteilte Angriffe.
3. **Argon2id erst nach dem Limit** ausführen. Ein Aufruf von Argon2id ist teuer — ein ungeschützter Login-Endpunkt ist ein DoS-Vektor gegen den eigenen Server.
4. **Generische Fehlermeldungen und konstante Antwortzeit** gegen Enumeration und Timing.
5. **Breached-Password-Prüfung** bei Registrierung und Passwortwechsel.
6. **MFA anbieten**, aber im Wissen, dass SMS/PSTN NIST-eingeschränkt ist.

### Begründung — NIST

NIST SP 800-63B-4 fordert Rate Limiting normativ für Verifier:

> „The verifier SHALL implement a rate-limiting mechanism that effectively limits the number of failed authentication attempts that can be made on the subscriber's account as described in Section 5.2.2." — [NIST SP 800-63B-4 (PDF)](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf)

Und die konkrete Obergrenze:

> „the verifier **SHALL limit consecutive failed authentication attempts on a single account to no more than 100**." — [NIST SP 800-63B, Section 5.2.2](https://pages.nist.gov/800-63-3/sp800-63b.html#throttle)

Diese 100 ist eine **Obergrenze**, keine Zielgröße. NIST nennt zusätzlich Techniken, um Aussperrung legitimer Nutzer zu vermeiden:

> „Additional techniques MAY be used to reduce the likelihood that an attacker will lock the legitimate claimant out as a result of rate limiting. These include: Requiring the claimant to complete a CAPTCHA before attempting authentication. **Requiring the claimant to wait following a failed attempt for a period of time that increases as the account approaches its maximum allowance for consecutive failed attempts (e.g., 30 seconds up to an hour).** Accepting only authentication requests that come from a white list of IP addresses from which the subscriber has been successfully authenticated before. Leveraging other risk-based or adaptive authentication techniques…" — [ebd.](https://pages.nist.gov/800-63-3/sp800-63b.html#throttle)

Zusätzlich relevant für OTP-Fälle (falls das Harness später TOTP/Mail-Codes bekommt): NIST nennt für OTP „In all cases, the authentication SHALL be considered invalid if not completed within 10 minutes" und fordert Nonce-Wechsel mindestens alle zwei Minuten ([NIST SP 800-63B-4](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf)).

### Begründung — OWASP Login Throttling und Account Lockout

> „The counter of failed logins should be **associated with the account itself, rather than the source IP address**, in order to prevent an attacker from making login attempts from a large number of different IP addresses." — [OWASP Authentication CS, „Account Lockout"](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

Die drei Stellschrauben: Lockout-Treshold, Beobachtungsfenster, Lockout-Dauer. Und zur Verzögerungsstrategie:

> „Rather than implementing a fixed lockout duration (e.g., ten minutes), some applications use an **exponential lockout**, where the lockout duration starts as a very short period (e.g., one second), but doubles after each failed login attempt." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

Und die DoS-Gegenrichtung, die man mitdenken muss:

> „When designing an account lockout system, care must be taken to prevent it from being used to cause a denial of service by locking out other users' accounts. One way this could be performed is to allow the use of the forgotten password functionality to log in, even if the account is locked out." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

Zur Rolle von CAPTCHA — ehrlich eingeordnet:

> „The use of an effective CAPTCHA can help to prevent automated login attempts against accounts. However, many CAPTCHA implementations have weaknesses that allow them to be solved using automated techniques or can be outsourced to services that can solve them. As such, the use of CAPTCHA should be viewed as a **defense-in-depth control**… rather than as a preventative." — [ebd., „CAPTCHA"](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### Konkrete Schwellenwerte — Cloudflare-Beispiel für Login

Cloudflare dokumentiert ein dreistufiges Login-Muster; die Zahlen sind ein belegtes Beispiel, nicht die einzige richtige Wahl:

| Regel | Zähleigenschaft | Zählbedingung | Rate | Aktion |
|---|---|---|---|---|
| #1 | IP | `/login` POST, Status 401/403 | 4 Requests / 1 Minute | Managed Challenge |
| #2 | IP | `/login` POST, Status 401/403 | 10 Requests / 10 Minuten | Managed Challenge |
| #3 | IP | `/login` POST, Status 401/403 | 20 Requests / 1 Stunde | **Block für 1 Tag** |

Quelle: [Cloudflare, „Rate limiting best practices"](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/)

Begründung der Eskalation aus derselben Quelle:

> „Rule #1 allows up to four requests per minute, after which a Managed Challenge is triggered. This configuration allows legitimate customers a few attempts to remember their password… if a human gets and passes the challenge when reaching rule #1's rate limit, rule #2 will provide the next level of protection, allowing for up to 10 requests over the next 10 minutes. For clients exceeding this second threshold, rule #3 (the most severe) will apply, blocking the client for one day." — [ebd.](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/)

Der Schlüssel ist die Trennung von Zähl- und Mitigationsausdruck:

> „These three rules have a counting expression separate from the rule expression (also known as mitigation expression). When you configure a separate counting expression, the matching criteria will only be used when an action is triggered. In the counting expression you can include conditions based on the HTTP response status code… For example, rule #3 computes the rate considering `POST` requests to `/login` that returned a `401` or `403` HTTP status code." — [ebd.](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/)

Und der wichtigste Satz für verteidigte Systeme — der Grund, warum IP allein nicht reicht:

> „If your application tracks sessions using a cookie, you can use the cookie to set the rate limiting context… By setting the rate limiting characteristic to Cookie, the rule will group together requests from different IP addresses but belonging to the same session, which is a common scenario when dealing with a bot network performing a distributed attack." — [ebd.](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/)

Für GraphQL-APIs (relevant, falls das Harness eine hat) warnt OWASP vor Batching als Rate-Limit-Umgehung:

> „To brute force log in with a victim's account, bad actors leverage GraphQL query batching to bypass the request rate limiting, speeding up the attack" — [OWASP API2:2023 Broken Authentication](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)

**Konsequenz:** Das Limit muss auf *Login-Versuche innerhalb des Requests* zählen, nicht auf Requests.

### Algorithmen

Redis dokumentiert drei Familien und wann welche passt:

| Algorithmus | Speicher | Genauigkeit | Burst-Verhalten | Geeignet für |
|---|---|---|---|---|
| Token bucket | 1 Key (Hash) | Exakt | Kontrollierte Bursts | APIs mit bursty Traffic |
| Sliding window log | O(n) Einträge | Exakt | Keine Bursts | High-value APIs, Audit-Trails |
| Sliding window counter | 2 Keys (String) | Nahezu exakt | Geglättete Grenzen | General-purpose APIs |

Quelle: [Redis Docs — Token bucket rate limiter, „Alternative rate limiting algorithms"](https://redis.io/docs/latest/develop/use-cases/rate-limiter/go/)

> „**Sliding window log** Records the exact timestamp of every request in a sorted set. Provides a true rolling window with no boundary bursts. **Trade-off**: Memory grows O(n) with request volume. Not ideal for high-volume, high-cardinality rate limiting." […] „**Sliding window counter** … Near-exact accuracy with the same low memory footprint as a fixed window. The two keys use hash tags so they map to the same slot in Redis Cluster." — [ebd.](https://redis.io/docs/latest/develop/use-cases/rate-limiter/go/)

Du hast das Redis-Dokument: https://redis.io/docs/latest/develop/use-cases/rate-limiter/ — es bestätigt, dass fixed window, sliding window und token bucket auf einer einzigen Redis-Instanz laufen ([Redis rate limiter](https://redis.io/docs/latest/develop/use-cases/rate-limiter/)) und dass Hashes, Sorted Sets und Strings die nötigen Datenformen liefern.

**Für Login-Endpunkte:** Ein **Sliding Window Counter** (2 Keys, geringer Speicher) für das Massenlimit pro IP, plus ein **langfristiger Zähler pro Konto** (z. B. mit exponentialem Backoff) für die kontobezogene Sperre. Token Bucket ist für Login ungeeignet — er erlaubt genau die Bursts, die man bei Credential Stuffing verhindern will.

### Benutzer-Enumeration verhindern

> „Using any of the authentication mechanisms (login, password reset, or password recovery), an application must respond with a generic error message regardless of whether: The user ID or password was incorrect. The account does not exist. The account is locked or disabled. … The objective is to prevent the creation of a discrepancy factor, allowing an attacker to mount a user enumeration action against the application." — [OWASP Authentication CS, „Authentication and Error Messages"](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

Korrekte vs. inkorrekte Antworten (wörtlich aus der Quelle):

| Kontext | Falsch | Richtig |
|---|---|---|
| Login | „Login failed, invalid user ID." / „Login failed; account disabled." | „Login failed; Invalid user ID or password." |
| Passwort-Reset | „We just sent you a password reset link." / „This email address doesn't exist in our database." | „If that email address is in our database, we will send you an email to reset your password." |
| Registrierung | „This user ID is already in use." | „A link to activate your account has been emailed to the address provided." |

Quelle: [ebd., „Incorrect and correct response examples"](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

Auch die **Antwortzeit** ist ein Enumeration- und Timing-Kanal:

> „It is interesting to note that the business logic itself can bring a discrepancy factor related to the processing time taken. Indeed, depending on the implementation, the processing time can be significantly different according to the case (success vs failure) allowing an attacker to mount a time-based attack" — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

Die Lösung ist im Cheat Sheet als Pseudocode hinterlegt: **nicht** per „quick exit" bei unbekanntem Nutzer abbrechen, sondern **immer** den Hash-Vorgang durchlaufen:

```
password_hash = HASH(password)
IS_VALID = LOOKUP_CREDENTIALS_IN_STORE(username, password_hash)
IF NOT IS_VALID THEN
   RETURN Error("Invalid Username or Password!")
ENDIF
```

> „This code will go through the same process no matter what the user or the password is, allowing the application to return in approximately the same response time." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

Zugehörige Schwachstellen-Kennungen: `CWE-204: Observable Response Discrepancy` und `CWE-208: Observable Timing Discrepancy` ([CWE-208](https://cwe.mitre.org/data/definitions/208.html), [API2:2023](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)).

### Credential Stuffing — was tatsächlich hilft

> „**Multi-factor authentication (MFA) is by far the best defense against the majority of password-related attacks, including credential stuffing and password spraying**, with analysis by Microsoft suggesting that it would have stopped 99.9% of account compromises." — [OWASP Credential Stuffing Prevention CS](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)

Die Angriffsarten in Abgrenzung:

| Angriffsart | Beschreibung |
|---|---|
| Brute Force | mehrere Passwörter gegen **ein** Konto |
| Credential Stuffing | gestohlene Nutzer/Passwort-Paare von einer anderen Seite |
| Password Spraying | **ein** schwaches Passwort gegen viele Konten |

Quelle: [ebd., Introduction](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)

Zur IP-Sperre — die wichtigste Warnung für ein Harness mit offener API:

> „Blocking IP addresses may be sufficient to stop less sophisticated attacks, but **should not be used as the sole or primary defense** due to the ease in circumvention. It is more effective to have a graduated response to abuse that leverages multiple defensive measures…" […] „Many credential stuffing toolkits, such as Sentry MBA, offer built-in use of proxy networks to distribute requests across a large volume of unique IP addresses. **This may defeat both IP block-lists and rate limiting**, as per IP request volume may remain relatively low" — [ebd., „IP Mitigation and Intelligence"](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)

Weitere dort genannte Maßnahmen: kurze und lange Zeitfenster kombinieren, IP-Klassifikation (Residential vs. Hosting) und Geodaten als Signale, Mitigationen zeitlich befristen, Konten bei auffälligen IPs sperren und den Nutzer benachrichtigen ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)).

Breached-Password-Prüfung:

> „ASVS v4.0 Password Security Requirements provision (2.1.7) on verifying new passwords presence in breached password datasets should be implemented. There are both commercial and free services that may be of use… A well known free service for this is Pwned Passwords. You can **host a copy of the application yourself**, or use the API." — [ebd., „Identifying Leaked Passwords"](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)

Die OWASP-Top-10-2025-Ausgabe nennt dasselbe:

> „Implement weak password checks, such as testing new or changed passwords against the top 10,000 worst passwords list. During new account creation and password changes validate against lists of known breached credentials" — [OWASP Top 10:2025, A07](https://top10.owasp.org/2025/A07_2025-Authentication_Failures/)

Zum Selbsthosting der Liste: „Alternatively, you can download the Pwned Passwords database using this mechanism to host it yourself." ([Authentication CS](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)) — relevant für ein Harness, das keine Fremd-API im Login-Pfad haben will.

### Benutzer-Enumeration durch Registrierung und Username-Wahl

Ein oft übersehener Punkt, gerade für ein Harness mit Einladungen:

> „Credential stuffing attacks rely on not just the re-use of passwords between multiple sites, but also the re-use of usernames. A significant number of websites use the email address as the username… **Requiring users to create their own username** when registering on the website makes it harder for an attacker to obtain valid username and password pairs for credential stuffing" — [Credential Stuffing Prevention CS, „Require Unpredictable Usernames"](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)

Und zur User-ID-Gestaltung:

> „Ideally, User IDs should be **randomly generated** to prevent the creation of predictable or sequential IDs, which could pose a security risk, especially in systems where User IDs might be exposed or inferred from external sources." — [OWASP Authentication CS, „User IDs"](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### Argon2id-DoS: rate limit **vor** dem Hash

Das ist die am wenigsten dokumentierte, aber operativ wichtigste Regel. Was sich belegen lässt:

**Aus dem Password Storage Cheat Sheet** — die Kosten eines hohen Work-Faktors sind selbst ein DoS-Vektor:

> „If the work factor is too high, the performance of the application may be degraded, **which could be used by an attacker to carry out a denial of service attack by exhausting the server's CPU with a large number of login attempts**." — [Password Storage CS, „Using Work Factors"](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

**Aus dem Authentication Cheat Sheet** — lange Passwörter als eigener DoS-Vektor:

> „Note that certain implementations of hashing algorithms may cause [long password denial of service](https://www.acunetix.com/vulnerabilities/web/long-password-denial-of-service/)." — [Authentication CS, „Implement Proper Password Strength Controls"](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

und, für den Vergleichsvorgang:

> „ensure that the comparison function: Has a **maximum input length**, to protect against denial of service attacks with very long inputs." — [Authentication CS, „Compare Password Hashes Using Safe Functions"](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

**Die explizite Aussage „Rate Limit muss vor dem Hash erfolgen" habe ich in den geprüften OWASP-Quellen nicht gefunden — sie ist in dieser Form nicht belegt.** Was belegbar ist und dieselbe Konsequenz hat: (a) hoher Work-Faktor ist ein CPU-DoS-Vektor, (b) lange Eingaben sind ein DoS-Vektor, (c) NIST fordert ein Rate-Limit auf Kontoebene, (d) API2:2023 fordert, dass Anti-Brute-Force-Mechanismen „stricter than the regular rate limiting mechanisms on your APIs" sein sollen ([API2:2023](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)).

**Abgeleitete, klar gekennzeichnete Empfehlung (meine Schlussfolgerung, keine zitierte Norm):** Ein Login-Request muss in dieser Reihenfolge verarbeitet werden:

1. Request-Größe und Passwortlänge begrenzen (z. B. 64–128 Zeichen hart ablehnen, nicht abschneiden).
2. Rate-Limit-Check (IP + Konto) — **vor** jedem Krypto-Aufruf.
3. Generische Antwort bei Limit erreicht (idealerweise mit denselben Zeitkosten wie ein echter Fehlversuch, sonst leakt man den Limit-Zustand).
4. Erst danach Argon2id.

Damit ist ein Angreifer mit 10.000 Anfragen pro Sekunde ein Rate-Limit-Problem und kein RAM-/CPU-Erschöpfungsproblem.

### Was dagegen spricht

- **Aggressive Kontosperren sind ein Selbst-DoS.** OWASP: „care must be taken to prevent it from being used to cause a denial of service by locking out other users' accounts" ([Authentication CS](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)). Ein Angreifer, der 100 falsche Logins gegen ein fremdes Konto fährt, sperrt es damit aus. Deshalb: exponentielle Verzögerung statt harter Sperre, und Passwort-Reset darf nicht mitgesperrt werden.
- **Rate Limiting macht den Login langsamer und Fehlermeldungen unschärfer.** Das ist bewusst. OWASP räumt den UX-Konflikt ein: „The problem with returning a generic error message for the user is a User Experience (UX) matter." ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html))
- **Pwned-Passwords-Abruf ist ein Netzwerk-Call im Registrierungs-/Wechselpfad** und leakt (bei Nutzung der API) einen Hash-Präfix an Dritte. OWASP bietet deshalb das Selbsthosting an — das ist die Variante, die ich für das Harness empfehle.
- **SMS/PSTN-Kanäle sollte man nicht als MFA-Kern planen:** „NIST SP 800-63B-4 designates SMS and PSTN-delivered codes as a *restricted* authenticator because of SS7 interception, SIM-swap, and number-porting attacks. Do not use SMS for high-value or PII-handling applications." ([OWASP MFA CS](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)). TOTP als Standard, WebAuthn/Passkeys als Ziel.

---

## 6. Frage 5 — API-Schlüssel

### Empfehlung

| Aspekt | Empfehlung |
|---|---|
| Format | `ph_<typ>_<env>_<random>` — z. B. `ph_sk_live_…`, `ph_svc_live_…`, `ph_usr_test_…` |
| Speicherung | Lookup-Präfix im Klartext **+** `SHA-256(vollschlüssel)` in der DB. **Kein** bcrypt/Argon2. |
| Entropie | ≥ 128 Bit im Zufallsteil |
| Anzeige | Einmalig bei Erstellung, danach nie wieder vollständig |
| Rotation | Neuer Schlüssel parallel, alter mit Ablaufdatum, dann löschen |
| Scopes | Explizite, minimale Scopes pro Schlüssel; Dienst-Schlüssel nicht als Benutzer-Schlüssel |
| Fremd-Anbieter-Schlüssel | AES-256-GCM mit Umschlagverfahren, `key_id` pro Datensatz (siehe Abschnitt 7) |

### Begründung

**Warum Hash (und warum ein schneller Hash hier richtig ist):**

> „Unlike passwords, API keys are high-entropy random strings, so you do not need a slow hash like bcrypt." — [apikeys.guide, „Validation & Lookup"](https://apikeys.guide/docs/implementation/validation-and-lookup)

Das ist konsistent mit der OWASP-Logik: Argon2/bcrypt existieren, um niedrige Entropie auszugleichen. Ein 128-Bit-Zufallsschlüssel lässt sich nicht brute-forcen, der teure Hash bringt also nichts — kostet aber bei jedem API-Request CPU. Das ist der entscheidende Performance-Unterschied zu Passwörtern: **API-Key-Verifikation liegt auf dem heißen Pfad jeder Anfrage.**

**Warum zusätzlich ein Klartext-Präfix:**

> „A raw Base64 string is a perfectly valid API key, but it tells you nothing at a glance. You cannot determine which service issued it, whether it is a live or test credential, or whether it is a public or secret key. Prefixes solve this by embedding lightweight metadata directly in the key string. Prefixes serve three critical functions: 1. **Identification**… 2. **Leak detection:** Secret scanners (GitHub, GitGuardian, TruffleHog) use prefix patterns to detect exposed credentials in code, logs, and commits. 3. **Routing:** API gateways and middleware can route requests to the correct authentication backend based on the prefix alone, before performing any cryptographic verification." — [apikeys.guide, „The Case for Prefixes"](https://apikeys.guide/docs/implementation/key-formats-and-prefixes)

**Warum Lookup-Präfix + Hash statt Hash allein:**

> „The solution is to store a short, non-secret prefix alongside the hash." — mit dem Schema `prefix | lookup portion | secret portion`, wobei Präfix und Lookup-Teil im Klartext und der SHA-256 des Gesamtschlüssels daneben liegen. — [apikeys.guide, „Hashing & Storage"](https://apikeys.guide/docs/security/hashing-and-storage)

Der Grund ist praktisch: Ein Hash über den *gesamten* Schlüssel lässt sich nur per Full-Table-Scan finden. Mit einem Klartext-Lookup-Teil ist es ein indizierter Punktzugriff. Der Vergleich muss konstantzeitig erfolgen — die Quelle zeigt `timingSafeEqual` ([ebd.](https://apikeys.guide/docs/security/hashing-and-storage)).

Der Vollständigkeitshinweis, damit nichts fehlt: Das dokumentierte Lookup-Muster ist

```sql
SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL
```

mit optionalem Negativ-Cache für ungültige Schlüssel ([apikeys.guide, „Validation & Lookup"](https://apikeys.guide/docs/implementation/validation-and-lookup)).

**Industriekonvention als Beleg für das Präfixmuster** (die Quelle nennt die etablierten Beispiele):

> „The convention popularized by Stripe has become a de facto standard across the industry: `sk_live_<key>`, `sk_test_<key>`, `pk_live_<key>`, `pk_test_<key>`" … „**AWS:** `AKIA` prefix for access key IDs. **GitHub:** `ghp_` (personal access tokens), `ghs_` (server-to-server), `ghu_` (user-to-server). **Slack:** `xoxb-` (bot tokens)… **OpenAI:** `sk-` prefix for API keys" — [apikeys.guide, „Common Prefix Patterns"](https://apikeys.guide/docs/implementation/key-formats-and-prefixes)

Bemerkenswert für den Harness-Use-Case: GitHub unterscheidet bereits `ghp_` (persönlich), `ghs_` (Server-zu-Server) und `ghu_` (User-zu-Server). Das ist genau die Unterscheidung, die in Frage 5 gefordert war — **Benutzer-Schlüssel vs. Dienst-Schlüssel werden im Präfix unterscheidbar gemacht**, und damit auch in Logs, Secret-Scannern und Routing.

Prüfsumme (optional, aber billig):

> „Some implementations append a short checksum to the random portion of the key. This allows fast client-side validation without a network round-trip" … „GitHub's token format uses a CRC32 checksum suffix, allowing their secret scanning infrastructure to verify whether a detected string is structurally valid before raising an alert." — [ebd., „Checksums in Keys"](https://apikeys.guide/docs/implementation/key-formats-and-prefixes)

**Anzeige und Rotation** — Stripe dokumentiert die Praxis am klarsten:

> „Wenn Sie einen geheimen API-Schlüssel im Stripe-Dashboard erstellen, wird er Ihnen **nur einmal** angezeigt. Speichern Sie den Schlüssel sofort im Secrets Vault Ihrer Plattform und speichern Sie ihn nirgendwo sonst." — [Stripe, Best Practices für API-Schlüssel](https://docs.stripe.com/keys-best-practices)

> „**Rotieren Sie geheime API-Schlüssel regelmäßig**: Legen Sie einen Prozess für die Rotation Ihrer Stripe-API-Schlüssel fest und setzen Sie diesen konsequent um. Durch regelmäßige Rotation stellen Sie sicher, dass Sie wissen, wo jeder Schlüssel verwendet wird, und dass Ihr Team einen Schlüssel kurzfristig ersetzen kann." — [ebd.](https://docs.stripe.com/keys-best-practices)

> „Wenn ein eingeschränkter oder API-Geheimschlüssel offengelegt oder kompromittiert wird, **rotieren Sie ihn sofort, auch wenn Sie nicht sicher sind, ob ihn jemand gesehen hat.** Behandeln Sie jede Offenlegung als potenzielle Kompromittierung." — [ebd., „Umgang mit kompromittierten API-Schlüsseln"](https://docs.stripe.com/keys-best-practices)

Und zur Anzeige eines *bereits erstellten* Schlüssels:

> „If you lose a key, rotate or delete it and create another. In live mode, you can reveal only API keys that Stripe creates for you, such as a default secret key or a key generated by a scheduled rotation." — [Stripe, „API keys"](https://docs.stripe.com/keys)

**Scopes/Audience/Ablauf** — die belegbare Grundlage:

> „**Befolgen Sie das Prinzip der geringsten Berechtigungen** … Verwenden Sie **eingeschränkte API-Schlüssel** mit begrenzten Berechtigungen anstelle von uneingeschränkten API-Geheimschlüsseln." — [Stripe, Best Practices](https://docs.stripe.com/keys-best-practices)

> „Eingeschränkte API-Schlüssel helfen Ihnen, die potenziellen Auswirkungen einer Kompromittierung zu begrenzen." — [ebd.](https://docs.stripe.com/keys-best-practices)

Zusätzlich als **kein Ersatz** für Benutzer-Authentifizierung:

> „**API keys should not be used for user authentication. They should only be used for API clients authentication.**" — [OWASP API2:2023 Broken Authentication, „How To Prevent"](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)

> „Read about your authentication mechanisms. Make sure you understand what and how they are used. **OAuth is not authentication, and neither are API keys.**" — [ebd.](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)

**Für das Harness bedeutet das konkret:** Ein `ph_svc_…`-Schlüssel authentifiziert einen *Dienst* und trägt Scopes, aber niemals eine Nutzeridentität. Wenn ein Agent im Namen eines Nutzers handeln soll, braucht er ein delegiertes, ablaufendes Token mit dem Nutzer als Subjekt — nicht einen Dienst-Schlüssel mit Nutzer-ID im Payload.

**Ablauf/Expiry** — belegbar als allgemeine Secret-Anforderung:

> „You should create secrets to **expire** after a defined time where possible. This expiration can either be active expiration by the secret consuming system, or an expiration date set at the secrets management system forcing supporting processes to be triggered, resulting in a secret rotation. You should apply policies through the secrets management solution to ensure credentials are only made available for a limited time appropriate for the type of credentials. Applications should verify that the secret is still active before trusting it." — [OWASP Secrets Management CS, „Expiration"](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

Und die Lebenszyklus-Stufen:

> „Secrets follow a lifecycle. The stages of the lifecycle are as follows: Creation, Rotation, Revocation, Expiration" — [ebd., „Secret Lifecycle"](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

Wichtig zum Unterschied zwischen Nutzer-Passwörtern und Dienst-Geheimnissen:

> „User credentials are excluded from regular rotation. These should only be rotated if there is suspicion or evidence that they have been compromised, according to NIST recommendations." — [ebd., „Rotation"](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

Das ist der belegte Beleg dafür, dass **Dienst-Schlüssel regelmäßig rotiert werden sollen, Benutzer-Passwörter dagegen nicht**. (Deckt sich mit OWASP Top 10 A07: „Do not force human beings to rotate passwords unless you suspect breach." — [Top 10:2025 A07](https://top10.owasp.org/2025/A07_2025-Authentication_Failures/))

**Kontenaufzählung über API-Keys vermeiden:** Ein ungültiger Schlüssel und ein gültiger-aber-falsch-gescopeter Schlüssel sollten dieselbe generische Antwort liefern. Die apikeys.guide-Quelle zeigt einen Negativ-Cache speziell dafür, wiederholte ungültige Schlüssel ohne DB-Treffer schnell abzuweisen ([ebd.](https://apikeys.guide/docs/implementation/validation-and-lookup)) — das ist gleichzeitig Rate-Limit-Schutz gegen Schlüssel-Raten.

### Zum Ablegen von Fremd-Anbieter-Schlüsseln (z. B. DeepSeek)

Das ist der Fall, wo **Verschlüsselung** und nicht Hashing richtig ist — man braucht den Klartext, um damit einen Fremd-API-Call zu machen.

**Empfehlung — Umschlagverfahren mit AES-256-GCM:**

1. Pro Datensatz ein **DEK** (Data Encryption Key, 32 Byte zufällig).
2. DEK mit einem **KEK** (Key Encryption Key) wrappen; der KEK liegt außerhalb der DB.
3. In der DB gespeichert: `ciphertext`, `nonce/iv`, `wrapped_dek`, **`key_id`**, **`alg`** (z. B. `AES-256-GCM`).
4. Beim Lesen: `key_id` → KEK auswählen → DEK entpacken → entschlüsseln.

**Belege:**

OWASP zur Trennung von Schlüssel und Daten:

> „Where possible, encryption keys should be stored in a **separate location** from encrypted data. For example, if the data is stored in a database, the keys should be stored in the filesystem. This means that if an attacker only has access to one of these (for example through directory traversal or SQL injection), they cannot access both the keys and the data." — [OWASP Cryptographic Storage CS, „Separation of Keys and Data"](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

OWASP zum Umschlagverfahren selbst:

> „Where possible, encryption keys should themselves be stored in an encrypted form. At least two separate keys are required for this: The **Data Encryption Key (DEK)** is used to encrypt the data. The **Key Encryption Key (KEK)** is used to encrypt the DEK. For this to be effective, **the KEK must be stored separately from the DEK**. The encrypted DEK can be stored with the data, but will only be usable if an attacker is able to also obtain the KEK, which is stored on another system. **The KEK should also be at least as strong as the DEK.**" — [ebd., „Encrypting Stored Keys"](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Beim Schlüsselwechsel (Rotation) unterscheidet OWASP zwei Vorgänge sauber:

> „To retire a Key Encryption Key (KEK), **re-wrap stored Data Encryption Keys (DEKs) under the replacement KEK before destroying the old one. Rewrapping leaves the DEKs unchanged and does not reset their cryptoperiods or usage limits. Replacing a DEK for existing ciphertext requires re-encrypting that data.**" — [OWASP Key Management CS, „Cryptoperiods and Rotation"](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

Und eine harte Obergrenze, die man bei AES-GCM kennen muss:

> „when using Advanced Encryption Standard in Galois/Counter Mode (AES-GCM) with random 96-bit initialization vectors (IVs), **limit each key to at most `2^32` (4,294,967,296) encryption operations across all devices sharing that key** to limit IV-collision risk" — [ebd., „Usage-Based Rotation Limits"](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

Zur Wahl des Modus:

> „**For symmetric encryption AES** with a key that's at least **128 bits** (ideally **256 bits**) and a secure mode should be used as the preferred algorithm." […] „Where available, **authenticated modes should always be used**. These provide guarantees of the integrity and authenticity of the data, as well as confidentiality. The most commonly used authenticated modes are **GCM** and **CCM**, which should be used as a first preference." — [OWASP Cryptographic Storage CS, „Algorithms"/„Cipher Modes"](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Zur Herkunft des KEK ohne Cloud-KMS: siehe Abschnitt 10.

### Was dagegen spricht

- **apikeys.guide ist keine Norm.** Es ist eine Zuplo-betriebene Dokumentationsseite, keine OWASP-/IETF-/NIST-Quelle. Die Praktiken dort sind mit Stripe-, GitHub- und Google-Doku verlinkt und decken sich mit der OWASP-Logik, aber sie sind **Sekundärquelle**. Für eine Audit-Begründung sollten die Primärquellen (OWASP API2:2023 für „keine API-Keys zur Nutzer-Auth", Stripe für die Rotations- und Einmalanzeige-Praxis, OWASP Key Management für das Umschlagverfahren) herangezogen werden.
- **SHA-256 über den Gesamtschlüssel ist kein Peppering.** Wer den DB-Dump hat und einen Schlüssel *rates*, hat es leicht. Das ist aber kein realistischer Angriff gegen 128-Bit-Zufall. Wenn das Bedrohungsmodell „DB-Dump + bekannter Schlüssel vom Client" umfasst, wäre der Hash wertlos — dann hilft nur ein separater HMAC-Pepper bzw. das Umschlagverfahren.
- **Umschlagverschlüsselung für Fremdschlüssel schützt nicht gegen Anwendungs-Kompromittierung.** Wer die App übernehmen kann, kann die Fremdschlüssel benutzen (aber nicht unbedingt auslesen, falls der Entschlüsselungsdienst getrennt ist). Ehrlich benannt: Der Gewinn liegt bei DB-Dump, Backup-Abfluss und Read-only-SQL-Injection.
- **Praxiswarnung zur Rotation:** Ein neuer API-Schlüssel muss eine Übergangszeit haben, in der alter und neuer Schlüssel parallel gültig sind — sonst ist jede Rotation ein Ausfall. Stripe dokumentiert ein `rolling keys`-Konzept ([Stripe API keys](https://docs.stripe.com/keys)). Wie lang die Übergangszeit sein muss, ist **nicht belegt** und eine Betreiberentscheidung.

---

## 7. Frage 6 — Verschlüsselung im Ruhezustand und „P2P"

### Empfehlung

1. **Server-seitige Verschlüsselung ausgewählter Felder mit AES-256-GCM**, Keys über Umschlagverfahren (`DEK` pro Workspace/Chat, `KEK` getrennt gehalten), Envelope-Header mit `alg_id`/`key_id`. Das ist der pragmatische Standard.
2. **Grenzen ausdrücklich dokumentieren:** Verschlüsselung im Ruhezustand schützt gegen DB-Dump, Backup-Abfluss und entsorgte Medien — **nicht** gegen eine kompromittierte Anwendung.
3. **Kein „E2EE"-Label ohne E2EE.** Wenn der Server Klartext sieht (für Suche, Index, Agenten-Prompts, Zusammenfassungen), ist es keine Ende-zu-Ende-Verschlüsselung.
4. **P2P-WebRTC nicht als Vertraulichkeitsgarantie verkaufen.** DTLS schützt den Transport, bindet aber keine Identität.

### AES-GCM: der Algorithmus und seine harte Grenze

> „For symmetric encryption **AES** with a key that's at least **128 bits** (ideally **256 bits**) and a secure mode should be used as the preferred algorithm." — [OWASP Cryptographic Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

> „Where available, **authenticated modes should always be used.** These provide guarantees of the integrity and authenticity of the data, as well as confidentiality. The most commonly used authenticated modes are **GCM** and **CCM**, which should be used as a first preference." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

> „**ECB** should not be used outside of very specific circumstances." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Und die kürzeste Anweisung in allen OWASP-Cheat-Sheets:

> „### Custom Algorithms — **Don't do this.**" — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

**Die harte Grenze von GCM** — NIST SP 800-38D warnt ungewöhnlich deutlich:

> „An important caution to the use of GCM is that **a breach of the requirement in Sec. 8 for the uniqueness of the initialization strings may compromise the security assurance almost entirely**" — [NIST SP 800-38D, Introduction](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)

Und was bei Nonce-Wiederverwendung konkret passiert:

> „In particular, if IVs are ever repeated for the GCM authenticated encryption function for a given key, then it is likely that an adversary will be able to determine the **hash subkey** from the resulting ciphertexts. The adversary then could easily construct a ciphertext forgery." … „Worse, the loss of authentication means that GCM inherits the problematic malleability of its Counter mode ciphertext." — [ebd., Appendix A](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)

**Das Operationsbudget, wörtlich §8.3:**

> „The following requirement applies to all implementations that use either 1) the deterministic construction with IVs whose length is not 96, or 2) the RBG-based construction, for IVs of any length. In other words, **unless an implementation only uses 96-bit IVs that are generated by the deterministic construction: The total number of invocations of the authenticated encryption function shall not exceed 2^32**, including all IV lengths and all instances of the authenticated encryption function with the given key." — [ebd., §8.3](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)

**Wichtige Präzisierung, die man nicht falsch weitergeben darf:** Das Limit gilt **auch für den praktischen Normalfall zufälliger 96-Bit-IVs**. Es entfällt nur bei der *deterministischen* IV-Konstruktion (z. B. ein Zähler). Da OWASP zufällige IVs empfiehlt, fällt der übliche Aufbau **unter** das 2^32-Limit — und OWASP sagt das ausdrücklich:

> „**Usage-Based Rotation Limits**: Key rotation must account for usage volume in addition to calendar time. For example, when using AES-GCM with **random 96-bit initialization vectors (IVs)**, limit each key to at most `2^32` (4,294,967,296) encryption operations across all devices sharing that key to limit IV-collision risk" — [OWASP Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

Es ist außerdem ein **globales** Budget über alle Instanzen: „This is a „global" requirement that can be achieved by appropriate „local" limits on each instance of the authenticated encryption function with a given key." ([NIST SP 800-38D §8.3](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf))

**Und GCM schützt nicht gegen Replay:**

> „In other words, GCM, like many other authentication mechanisms, **does not inherently prevent an adversary from intercepting the output of an invocation of authenticated encryption and „replaying" it** for authenticated decryption at a later time." — [ebd., Appendix D](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)

**Praktische Konsequenz für das Harness:** Ein DEK pro Workspace/Chat statt ein globaler Datenschlüssel. Bei 2^32 Operationen pro Key ist das Limit für ein Kleingruppen-System praktisch unerreichbar — aber der Zähler bzw. die Rotation muss *designt* sein, nicht nachgerüstet. Und: **Replay-Schutz muss die Anwendung leisten** (z. B. Nachrichten-ID + Zeitstempel im AAD), nicht GCM.

### Umschlagverfahren und Krypto-Agilität

> „Where possible, encryption keys should themselves be stored in an encrypted form. At least two separate keys are required for this: The **Data Encryption Key (DEK)** is used to encrypt the data. The **Key Encryption Key (KEK)** is used to encrypt the DEK. For this to be effective, **the KEK must be stored separately from the DEK.**" — [OWASP Cryptographic Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

**Rewrapping gegen Re-Encryption — die Unterscheidung, die den Betriebsaufwand bestimmt:**

> „To retire a Key Encryption Key (KEK), **re-wrap stored Data Encryption Keys (DEKs) under the replacement KEK before destroying the old one. Rewrapping leaves the DEKs unchanged and does not reset their cryptoperiods or usage limits. Replacing a DEK for existing ciphertext requires re-encrypting that data.**" — [OWASP Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

**Krypto-Agilität ist Pflicht, nicht Kür:**

> „It is important that the code and processes required to rotate a key are in place **before** they are required, so that keys can be quickly rotated in the event of a compromise. **Additionally, processes should also be implemented to allow the encryption algorithm or library to be changed, in case a new vulnerability is found in the algorithm or implementation.**" — [OWASP Cryptographic Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Und der belegte Mechanismus dafür:

> „2. **Marking each item with the ID of the key that was used to encrypt it**, and storing multiple keys to allow the old data to be decrypted." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

**Ehrliche Einschränkung von OWASP selbst:**

> „In simpler application architectures (such as shared hosting environments) where the KEK and DEK cannot be stored separately, **there is limited value to this approach**, as an attacker is likely to be able to obtain both of the keys at the same time." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Für ein selbstgehostetes System heißt das konkret: Wenn App, KEK und PostgreSQL auf demselben Host unter demselben Konto laufen, ist die Trennung **nominell**. Der Gewinn entsteht erst, wenn der KEK auf einem anderen System oder in Hardware liegt.

**Kryptoperioden (aus OWASP-Wiedergabe von NIST SP 800-57 Part 1 Rev. 5 §5.3.6):**

> „**Symmetric Data Encryption Keys**: Originator usage (encrypting new data) should be capped at up to **2 years** for general low-volume applications, or on the order of **a day or a week** for high-volume or link-encryption systems. Recipient usage (decryption) should typically be limited to **no more than 3 years** beyond the originator usage period." — [OWASP Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

**Vorbehalt:** Diese Zahlenwerte stammen aus der **wörtlichen Wiedergabe durch OWASP**; die NIST-PDF selbst wurde nicht im Volltext gegengelesen (der Teilbericht weist das ausdrücklich aus). Vor einer Produktiventscheidung am Primärtext prüfen.

**Zeroization ist in Bun/Node nur begrenzt möglich — ehrlich benannt:**

> „**Software Memory**: Overwriting key material is best-effort in managed runtimes, where copies can survive in **garbage-collected memory, immutable strings, or swapped-out pages.**" — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

> „**Cryptographic Erasure**: For encrypted key material at rest, consider cryptographic erasure only when all copies of the protecting keys can be destroyed and no recoverable plaintext copies of the target material remain. **Destroying a wrapping key does not erase plaintext copies of the keys it protected.**" — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

Das ist der belegte Grund, warum Vault/Transit (Abschnitt 10, Stufe 3) für hochsensible Schlüssel überlegen ist: Der Schlüssel liegt dann nie im Bun-Prozess.

### Die Grenzen serverseitiger Verschlüsselung — belegt

**Die wörtliche Aussage „encryption at rest does not protect against SQL injection" existiert in den OWASP-Cheat-Sheets nicht.** Das ist ausdrücklich festzuhalten. Belegt sind aber vier funktional äquivalente Aussagen, und eine davon ist sogar stärker:

> „Which layer(s) are most appropriate will depend on the threat model. **For example, hardware level encryption is effective at protecting against the physical theft of the server, but will provide no protection if an attacker is able to compromise the server remotely.**" — [OWASP Cryptographic Storage CS, „Where to Perform Encryption"](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

> „Securely storing cryptographic keys is one of the hardest problems to solve, **as the application always needs to have some level of access to the keys in order to decrypt the data.** While it may not be possible to fully protect the keys from an attacker who has fully compromised the application, a number of steps can be taken to make it harder for them to obtain the keys." — [ebd., „Key Storage"](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

**Und die entscheidende Stelle, die SQL-Injection ausdrücklich als Angriffsvektor nennt** — mit der Trennung von Schlüssel und Daten als Gegenmaßnahme, *nicht* der Verschlüsselung:

> „Where possible, encryption keys should be stored in a separate location from encrypted data. For example, if the data is stored in a database, the keys should be stored in the filesystem. **This means that if an attacker only has access to one of these (for example through directory traversal or SQL injection), they cannot access both the keys and the data.**" — [ebd., „Separation of Keys and Data"](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

**Daraus folgt logisch:** Liegen Schlüssel und Chiffrat in derselben Datenbank, liefert eine SQL-Injection **beide** — die Verschlüsselung hilft dann gegen nichts.

> „Applications should be designed to still be secure even if cryptographic controls fail. Any information that is stored in an encrypted form should also be protected by additional layers of security." — [ebd., „Defense in Depth"](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

**Die ehrliche Formulierung für die eigene Dokumentation:**

> Server-seitige Verschlüsselung im Ruhezustand schützt gegen Angriffe auf das Speichermedium (Diebstahl, Backup-Abzug, Offline-Dump), **nicht** gegen eine kompromittierte Anwendung: Wer die Anwendung kontrolliert, kontrolliert typischerweise die Entschlüsselungsfähigkeit und damit die Klartextdaten. Verschlüsselung ersetzt keine Zugriffskontrolle und keine Eingabevalidierung.

### WebCrypto im Browser — was sie kann und was nicht

Die W3C-Spezifikation ist bei diesem Thema ungewöhnlich klar. **Skript-Injektion ist RCE-äquivalent:**

> „**Conceptually, issues such as script injection are the equivalent to remote code execution in other operating environments, and allowing hostile script to be injected may allow for the exfiltration of keys or data.**" — [W3C Web Cryptography API Level 2, §6.2](https://w3c.github.io/webcrypto/) *(Editor's Draft vom 11. August 2026; die Security-Considerations-Abschnitte sind laut Dokument non-normativ)*

**Keine Garantie über die Schlüsselspeicherung:**

> „Authors should be aware that this specification places **no normative requirements on implementations as to how the underlying cryptographic key material is stored.** The only requirement is that key material is not exposed to script, except through the use of the `exportKey` and `wrapKey` operations. In particular, **it does not guarantee that the underlying cryptographic key material will not be persisted to disk, possibly unencrypted, nor that it will be inaccessible to users or other applications running with the same privileges as the User Agent.**" — [ebd., §6.2](https://w3c.github.io/webcrypto/)

**Schlüssel gelten standardmäßig nur für die Lebensdauer der Seite:**

> „By default, unless specific effort is taken by the author to persist keys, such as through the use of the Indexed Database API, **keys created with this API will only be valid for the duration of the current page** (e.g. until a navigation event)." — [ebd., §6.2](https://w3c.github.io/webcrypto/)

**Gleiche Origin = voller Schlüsselzugriff:**

> „two origins with the same `CryptoKey` object **have full access to the underlying key**" — [ebd., §6.1](https://w3c.github.io/webcrypto/)

**Und die ausdrückliche Warnung vor eigenen Protokollen:**

> „In general, application developers are **strongly** discouraged from inventing new cryptographic protocols; as with all applications, users of this specification will be best served through the use of existing protocols, of which this specification provides the necessary building blocks to implement." — [ebd., §6.2](https://w3c.github.io/webcrypto/)

`SubtleCrypto` ist nur in Secure Contexts verfügbar — für ein selbstgehostetes System mit reinem HTTP (außer `localhost`/`127.0.0.1`) bedeutet das **kein WebCrypto im Browser überhaupt**:

> „**Secure context:** This feature is available only in secure contexts (HTTPS), in some or all supporting browsers." — [MDN, `Crypto.subtle`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle)

An origins, die als „potentially trustworthy" gelten (relevant für Dev-Setups): „A scheme of `https`, `wss`, or `file`. A host value of `127.0.0.0/8` or `::1/128`. A host value of `localhost` or `localhost.`" — [MDN, Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)

**Ob `extractable: false` gegen XSS hilft:** Wörtlich belegt ist, dass Skript-Injektion „may allow for the exfiltration of keys or data". Die verbreitete Aussage „nicht-extrahierbare Schlüssel schützen nicht gegen XSS, weil das Skript `decrypt()` aufrufen kann" ist eine **Schlussfolgerung** aus der WebCrypto-Semantik und in dieser Form **nicht zitiert**. Korrekt ist: `extractable: false` ist eine **Skript-Schranke** (verhindert den stillen Export), aber **keine Speichergarantie** — das ist wörtlich belegt („it does not guarantee that the underlying cryptographic key material will not be persisted to disk, possibly unencrypted").

### MLS / RFC 9420 — der aktuelle Stand für Gruppen

RFC 9420 ist ein **Standards-Track-RFC (Juli 2023)**, keine Draft-Bastelei:

> „we specify a key establishment protocol that provides efficient asynchronous group key establishment with forward secrecy (FS) and post-compromise security (PCS) **for groups in size ranging from two to thousands**." — [RFC 9420, Abstract](https://www.rfc-editor.org/rfc/rfc9420.html)

Die Architektur ist in [RFC 9750 (Informational, April 2025)](https://www.rfc-editor.org/rfc/rfc9750.html) beschrieben. Zwei Abstraktionen, die der Betreiber bereitstellen muss:

> „An **Authentication Service (AS)**, which is responsible for attesting to bindings between application-meaningful identifiers and the public key material used for authentication in the MLS protocol." / „A **Delivery Service (DS)**, which can receive and distribute messages between group members." — [RFC 9750, §2.2](https://www.rfc-editor.org/rfc/rfc9750.html)

**Und der Punkt, der direkt das Harness betrifft — der DS ist typischerweise der eigene Server:**

> „**MLS provides no mechanism to protect the group ID and epoch of a message from the DS, so the group ID and the frequency of messages and epoch changes are not protected against inspection by the DS.**" — [RFC 9420, §16.4.1](https://www.rfc-editor.org/rfc/rfc9420.html)

> „**Applications that expose the group's ratchet tree outside the group also leak the group's membership.**" … „**A party that sees all of these changes can reconstruct the group membership.**" — [RFC 9420, §16.4.3](https://www.rfc-editor.org/rfc/rfc9420.html)

> „However, **servers may learn this information through traffic analysis. Unfortunately, in a server-side fanout model, the Delivery Service can learn that a given client is sending the same message to a set of other clients.** … **While this knowledge is not a breach of the protocol's authentication or confidentiality guarantees, it is a serious issue for privacy.**" — [RFC 9750, §8.4.3.2](https://www.rfc-editor.org/rfc/rfc9750.html)

Und eine konkrete Designentscheidung mit Privacy-Effekt:

> „**Applications MUST use PrivateMessage to encrypt application messages and SHOULD use PrivateMessage to encode handshake messages**, but they MAY transmit handshake messages encoded as PublicMessage objects in cases where it is necessary for the Delivery Service to examine such messages." — [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html)

> „Everything else being equal, **using encrypted handshake messages provides stronger privacy properties than using unencrypted handshake messages**, as it prevents intermediaries from learning about the structure of the group." — [RFC 9750, §6.4](https://www.rfc-editor.org/rfc/rfc9750.html)

**Der Kompromiss ist verheerend, ehrlich benannt:**

> „**The signature keys held by group members are critical to the security of MLS against active attacks. If a member's signature key is compromised, then an attacker can create LeafNodes and KeyPackages impersonating the member**" — [RFC 9420, §16.5](https://www.rfc-editor.org/rfc/rfc9420.html)

> „If the AS is compromised, it could validate a signature key pair (or generate a new one) for an attacker." Und die Empfehlungen: „Provide a key transparency mechanism for the AS to allow public verification of the credentials authenticated by this service." / „Provide one or more out-of-band authentication mechanisms to limit the impact of an AS compromise." — [RFC 9750, §8.4.3.1](https://www.rfc-editor.org/rfc/rfc9750.html)

**Implementierungslage (OpenMLS, abgerufen Oktober 2026):**

> „_OpenMLS_ is a Rust implementation of the Messaging Layer Security (MLS) protocol, as specified in [RFC 9420]." — [openmls/openmls](https://github.com/openmls/openmls)

Unterstützte Ciphersuiten (vollständige Liste): `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519 (MTI)`, `MLS_128_DHKEMP256_AES128GCM_SHA256_P256`, `MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519` ([ebd.](https://github.com/openmls/openmls)) — **die MTI-Suite ist AES-128-GCM, nicht AES-256.**

**Der entscheidende WASM-Vorbehalt, wörtlich:**

> „### Unsupported, but built on CI — The Github CI **also builds (but doesn't test)** the following rust targets. […] `wasm32-unknown-unknown`" — [ebd.](https://github.com/openmls/openmls)

Das `js`-Feature („enable compilation to wasm") existiert, aber **WASM ist ein Build-Ziel, kein unterstütztes Ziel**. Eine Aussage wie „OpenMLS läuft im Browser" ist **nicht belegt**; belegt ist „kompiliert in der CI, ohne Tests".

**Konsequenz für das Harness:** Die MLS-Logik in Rust (Server oder native Komponente) halten, den Browser als Transport/UI nutzen — oder WASM einsetzen und die Testlücke selbst schließen. Die erste Variante ist risikoärmer.

### Signal-Protokoll — was es leistet und wo die Web-Grenzen liegen

> „X3DH establishes a shared secret key between two parties who mutually authenticate each other based on public keys. X3DH provides forward secrecy and cryptographic deniability." — [Signal, X3DH](https://signal.org/docs/specifications/x3dh/) *(Revision 1, 2016-11-04)*

**Die Authentifizierung ist Voraussetzung, nicht Beiwerk:**

> „Before or after an X3DH key agreement, the parties may compare their identity public keys through some authenticated channel. For example, they may compare public key fingerprints manually, or by scanning a QR code. **Methods for doing this are outside the scope of this document. If authentication is not performed, the parties receive no cryptographic guarantee as to who they are communicating with.**" — [ebd., §4.1](https://signal.org/docs/specifications/x3dh/)

**Was ein bösartiger Server noch kann, wenn authentifiziert wurde:**

> „A malicious server could cause communication between Alice and Bob to fail (e.g. by refusing to deliver messages). If Alice and Bob authenticate each other as in Section 4.1, then **the only additional attack available to the server is to refuse to hand out one-time prekeys**" — [ebd., §4.3](https://signal.org/docs/specifications/x3dh/)

**Und die Einschränkung, die die Authentifizierung nicht löst:**

> „Authentication as in Section 4.1 **does not necessarily prevent an „identity misbinding" or „unknown key share" attack.**" — [ebd.](https://signal.org/docs/specifications/x3dh/)

**Aktueller Stand:** X3DH ist Revision 1 von 2016; für den Schlüsselaustausch ist **PQXDH** die post-quanten-erweiterte Variante:

> „PQXDH provides post-quantum forward secrecy and a form of cryptographic deniability but still **relies on the hardness of the discrete log problem for mutual authentication** in this revision of the protocol." — [Signal, PQXDH](https://signal.org/docs/specifications/pqxdh/)

**Double Ratchet ist aktuell (Revision 4, 2025-11-04)** und nennt die drei Garantien:

> „**Resilience:** The output keys appear random to an adversary without knowledge of the KDF keys. […] **Forward security:** Output keys from the past appear random to an adversary who learns the KDF key at some point in time. **Break-in recovery:** Future output keys appear random to an adversary who learns the KDF key at some point in time, provided that future inputs have added sufficient entropy." — [Signal, Double Ratchet Rev. 4](https://signal.org/docs/specifications/doubleratchet/)

**Mit dem ehrlichen Kompromiss-Hinweis:**

> „Despite this mitigation, **a compromise of secret keys or of device integrity will have a devastating effect on the security of future communications.**" — [ebd., §8.2](https://signal.org/docs/specifications/doubleratchet/)

**Und einer konkreten DoS-Falle bei der Implementierung:**

> „A malicious sender could induce recipients to store large numbers of skipped message keys, possibly causing denial-of-service due to consuming storage space." Mitigation: „parties should set reasonable per-session limits on the number of skipped message keys that will be stored (e.g. 1000)." — [ebd., §8.4](https://signal.org/docs/specifications/doubleratchet/)

**Mehrgeräte-Problem (Sesame, Revision 2, 2017-04-14):**

> „Alice and Bob might each have several devices, so encrypting a message from Alice to Bob might require creating sessions from Alice's sending device to **all of Bob's devices, and also to Alice's other devices**" … „**For the Double Ratchet to be maximally effective Alice and Bob must send and receive messages using matching sessions, so somehow they must agree on which matching sessions to use.**" — [Signal, Sesame, §2.1](https://signal.org/docs/specifications/sesame/)

Der Konvergenzmechanismus:

> „A central idea is for each device to keep track of an „active" session for each other device it is communicating with, and use the active session when sending to that device. **When a message is received on an „inactive" session, that becomes the new active session.**" — [ebd.](https://signal.org/docs/specifications/sesame/)

Und die harte Anforderung an das UI:

> „**Whenever a change in identity keys is detected users must repeat the authentication process or they will receive no cryptographic guarantee as to who they are communicating with.** A device may wish to pause (or abort) the sending, receiving, or resending processes if a key change occurs, and only continue (or restart) the process if the user affirmatively acknowledges the key change." — [ebd., §6.1](https://signal.org/docs/specifications/sesame/)

**Wichtig:** Der Begriff „Safety Numbers" erscheint in **keiner** der gelesenen Signal-Spezifikationen — das ist **nicht belegt**. Belegt ist nur der Mechanismus „compare public key fingerprints manually, or by scanning a QR code" ([X3DH §4.1](https://signal.org/docs/specifications/x3dh/), [Sesame §6.1](https://signal.org/docs/specifications/sesame/)). Die Details sind ausdrücklich „outside the scope" — **den Teil muss man selbst entwerfen.**

**Key Transparency ist noch kein Standard:**

`draft-ietf-keytrans-architecture` ist ein **Internet-Draft** mit Intended Status **Informational**, zum Recherchezeitpunkt **In Last Call** — **kein RFC**. Die Aussage „Key Transparency ist standardisiert" wäre **nicht belegt**.

### P2P in der Web-App — die belegte Ernüchterung

> „WebRTC allows real-time, peer-to-peer, media exchange between two devices. A connection is established through a discovery and negotiation process called **signaling**." Und: „**Establishing a WebRTC connection between two devices requires the use of a signaling server** to resolve how to connect them over the internet." — [MDN, Signaling and video calling](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling)

Und der Relay-Fall:

> „**Traversal Using Relays around NAT (TURN)** is meant to bypass the Symmetric NAT restriction by **opening a connection with a TURN server and relaying all information through that server.**" — [MDN, Introduction to WebRTC protocols](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols)

**Und die Kernaussage, warum DTLS keine Identitätsgarantie ist:**

> „Even if HTTPS is used, **the signaling server can potentially mount a man-in-the-middle attack unless implementations have some mechanism for independently verifying keys.** The UI requirements in Section 6.5 are designed to provide such a mechanism for motivated/security conscious users, **but are not suitable for general use.**" — [RFC 8827, WebRTC Security Architecture](https://www.rfc-editor.org/rfc/rfc8827.html)

> „If Alice and Bob authenticated via their IdPs, then they also know that the signaling service is not mounting a man-in-the-middle attack on their traffic. **Even if they do not use an IdP, as long as they have minimal trust in the signaling service not to perform a man-in-the-middle attack, they know that their communications are secure against the signaling service as well**" — [ebd., §4.3](https://www.rfc-editor.org/rfc/rfc8827.html)

Der DataChannel ist verschlüsselt — aber die Vertrauensgrenze bleibt der Server:

> „All data transferred using WebRTC is encrypted. In the case of `RTCDataChannel`, the encryption used is Datagram Transport Layer Security (DTLS)" — [MDN, Using WebRTC data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels)

Und die API darf das Schlüsselmaterial nicht herausgeben:

> „**API Requirement: When DTLS-SRTP is used, the API MUST NOT permit the JS to obtain the negotiated keying material. This requirement preserves the end-to-end security of the media.**" — [RFC 8827, §6.5](https://www.rfc-editor.org/rfc/rfc8827.html)

**Für das Harness heißt das:** Für Chat + Workspaces mit persistenter Speicherung in PostgreSQL bietet ein Server-vermittelter Transport (WebSocket/HTTP über TLS) dieselben Sicherheitseigenschaften mit deutlich weniger Komplexität. P2P/WebRTC löst ein Problem (niedrige Latenz für Medien), das hier nicht besteht, und führt neue Probleme ein (Signaling, NAT/TURN, Identity-Binding, Out-of-Band-Verifikation). **Das ist eine Bewertung, gestützt auf die belegten Zusatzkosten.**

### Metadaten: was auch mit E2EE sichtbar bleibt

| Was sichtbar bleibt | Belegte Quelle |
|---|---|
| **Wer mit wem** — der Server speichert Absender-IDs an jeder Nachricht | [Sesame §2.2](https://signal.org/docs/specifications/sesame/): „The server stores the sending device's UserID and DeviceID alongside the message." |
| **Wann** — Nachrichtenfrequenz und Epoch-Wechsel | [RFC 9420 §16.4.1](https://www.rfc-editor.org/rfc/rfc9420.html) |
| **Gruppenzugehörigkeit** — rekonstruierbar aus Handshake-Nachrichten | [RFC 9420 §16.4.3](https://www.rfc-editor.org/rfc/rfc9420.html) |
| **Fanout-Muster** — ein Absender → Menge von Empfängern | [RFC 9750 §8.4.3.2](https://www.rfc-editor.org/rfc/rfc9750.html) |
| **Schlüssel-zu-Identität-Zuordnung**, falls die Infrastruktur sie speichert | [RFC 9750 §8.4.3.2](https://www.rfc-editor.org/rfc/rfc9750.html) |
| **Replay ist nicht verhindert** | [NIST SP 800-38D, Appendix D](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf) |

**Nicht belegt:** Die **Nachrichtenlänge** als Metadaten-Leck. RFC 9420 §16.4.1 nennt ausdrücklich nur die Nachrichten*frequenz*. Die Aussage „E2EE verbirgt die Nachrichtenlänge nicht" ist technisch plausibel (AEAD ist längenerhaltend), aber in den geprüften Primärquellen **nicht belegt** und darf nicht als Zitat geführt werden. Ebenso **nicht belegt**: eine OWASP-Basis für E2EE-Metadaten.

### Bewertung: verantwortbar gegen Etikettenschwindel

**Verantwortbar für ein Einzelnutzer-/Kleingruppen-System:**

| Maßnahme | Begründung |
|---|---|
| **AES-256-GCM mit Umschlagverfahren** | Schaden eines Offline-Abzugs geht gegen null; Kosten gering; OWASP-Empfehlung klar |
| **DEK pro Workspace/Chat, KEK getrennt** | Ohne diese Trennung gibt es keinen billigen Rotationspfad; OWASP beschreibt Rewrapping explizit |
| **Envelope-Header mit `alg_id`/`key_id`** | Krypto-Agilität ist OWASP-Pflicht; nachträglich wäre es eine Datenmigration |
| **Ehrliche Benennung der Grenzen** | Die OWASP-Belege ergeben zwingend, dass man Anwendungsübernahme-Schutz nicht behaupten darf |
| **Nutzerseitiger Root-Key für Mehrgeräte** (Passphrase oder QR) statt Signal/MLS | Für *einen Nutzer mit N Geräten* ist die Frage Gerätesynchronisation, nicht Peer-Authentifizierung (Bewertung, gestützt auf Sesame §2.1/§6.1) |

**Etikettenschwindel — was man nicht behaupten darf:**

1. **„E2EE", während serverseitig Klartext für Suche/Index existiert.** Der klarste Fall. OWASP: „the application always needs to have some level of access to the keys in order to decrypt the data." Wer Volltextsuche braucht, muss das benennen.
2. **„E2EE", während der Server die Schlüssel ausliefert.** W3C: Skript-Injektion „is the equivalent to remote code execution".
3. **„E2EE" ohne Benennung der Metadaten.** RFC 9420 §16.4.1/§16.4.3 und RFC 9750 §8.4.3.2 widerlegen die Aussage „wir sehen nicht, wer mit wem schreibt", sobald ein Server zustellt.
4. **„E2EE", obwohl MLS-Handshakes als `PublicMessage` laufen** — dann ist die Gruppenmitgliedschaft rekonstruierbar (RFC 9420 §16.4.3).
5. **„P2P = vertrauensfrei"** — RFC 8827: der Signaling-Server kann MITM fahren, wenn es keinen unabhängigen Schlüsselprüfmechanismus gibt, und der ist laut RFC „not suitable for general use".
6. **„P2P ohne Server"** — MDN: ein Signaling-Server ist strukturell notwendig; bei Symmetric NAT wird zusätzlich über TURN **alles** relayed.
7. **`extractable: false` als Speicherschutz verkaufen.** W3C: „it does not guarantee that the underlying cryptographic key material will not be persisted to disk, possibly unencrypted".
8. **„Key Transparency ist standardisiert"** — es ist ein Draft im Last Call.
9. **„Wir haben E2EE" nach Eigenimplementierung von X3DH/Double Ratchet.** W3C: Entwickler werden „**strongly** discouraged from inventing new cryptographic protocols". OWASP: „Custom Algorithms — Don't do this." X3DH: „Failure to randomize Bob's encryption key may cause catastrophic key reuse."
10. **„AES-GCM" als vollständige Sicherheitsantwort**, ohne Nonce-Management und Rotationspfad. NIST SP 800-38D: bei IV-Wiederholung „the authentication assurance essentially is lost".

### Die ehrliche Gesamtaussage für dieses Vorhaben

> Das System speichert Chats und Workspaces **verschlüsselt im Ruhezustand** mit AES-256-GCM, DEK pro Workspace/Chat, KEK getrennt gehalten, Envelope-Header mit `alg_id`/`key_id`. Das schützt gegen Offline-Abfluss (Backups, Dumps, entsorgte Medien).
> **Es ist keine Ende-zu-Ende-Verschlüsselung.** Der Server sieht die Inhalte zur Laufzeit, weil er entschlüsseln muss, um zu bedienen; er sieht die Metadaten (wer, wann, mit wem) ohnehin, weil er Nachrichten zustellt und speichert.
> **Echtes E2EE** würde bedeuten: Schlüssel entstehen und bleiben beim Nutzer, der Server speichert ausschließlich Chiffrat. Das ist mit WebCrypto möglich, aber dann gilt: (a) der vom Server ausgelieferte JS-Code ist die Vertrauensgrenze, (b) nicht-extrahierbare Schlüssel sind eine Skript-Schranke, keine Speichergarantie, (c) **jede serverseitige Suche/Indexierung über den Klartext ist ausgeschlossen**. Wer (a)–(c) akzeptiert, kann E2EE bauen. Wer Volltextsuche und serverseitige Verarbeitung braucht, darf es nicht „E2EE" nennen.

### Was dagegen spricht

- **Der größte Schwachpunkt ist nie der Algorithmus, sondern der Schlüssel.** OWASP sagt selbst, dass ein vollständig kompromittiertes Anwendungssystem die Schlüssel prinzipiell preisgibt.
- **KEK/DEK-Trennung ist bei Einzelnutzer-Selbsthosting oft nur nominell** — OWASP: „there is limited value to this approach". Der echte Gewinn entsteht erst mit getrennten Systemen oder Hardware.
- **Rewrapping ist nicht gratis:** OWASP stellt klar, dass Rewrapping die Kryptoperiode und die Nutzungsgrenzen der DEKs **nicht zurücksetzt**. Wer einen kompromittierten DEK „durch KEK-Rotation reparieren" will, irrt.
- **MLS bringt erheblichen Komplexitäts- und Betriebsaufwand** (Epochs, Ratchet Trees, Welcome-Nachrichten, Proposal/Commit, Credentials, PSK) — und Komplexität ist selbst ein Sicherheitsrisiko. Für ein Einzelnutzer-System mit gelegentlichen Kleingruppen ist das meist Überkonstruktion.
- **Der AS ist ein Vertrauenskonzentrationspunkt** und typischerweise Teil derselben Web-App. Ohne Key Transparency und Out-of-Band-Verifikation ist die Identitätsprüfung so stark wie das AS.
- **Post-Quanten-Lage:** RSA und ECC (inkl. Curve25519) sind nicht post-quanten-sicher; OWASP verweist auf ML-KEM (FIPS 203), typischerweise hybrid. AES-256 ist der robuste Teil; verwundbar ist der *Schlüsselaustausch*. XChaCha20-Poly1305 wäre wegen der 24-Byte-Nonce strukturell entspannter beim Nonce-Problem, wird in den gelesenen OWASP-Cheat-Sheets aber **nicht als erste Wahl genannt** — die Aussage „XChaCha20 ist von OWASP empfohlen" ist **nicht belegt**.
- **Nicht geprüft und daher nicht belegt:** Redis-seitige Verschlüsselungseigenschaften (RDB-/AOF-Verschlüsselung); `libsignal`-Bindings für TypeScript/Bun; andere MLS-Implementierungen als OpenMLS; Post-Quanten-Unterstützung in MLS.

*Der Teilbericht `docs/research/auth-crypto-e2ee.md` (1420 Zeilen) enthält die vollständige Belegkette mit allen gelesenen URLs und einer nach Relevanz sortierten Liste der 15 nicht belegten Punkte.*

---

## 8. Frage 7 — PostgreSQL-Speicher

### Empfehlung

- **Schema:** `users` → `tenants`/`workspaces` → `chats` → `messages`; `sessions` als eigene Tabelle mit Fremdschlüssel auf `users`. `ON DELETE CASCADE` für Session-Zeilen (eine Session ohne Nutzer ist bedeutungslos).
- **Paginierung:** **Keyset/Cursor statt `OFFSET`** — aus Korrektheits- *und* Performance-Gründen.
- **Primärschlüssel:** **UUIDv7** (`uuidv7()`, ab PostgreSQL 18) für neue Tabellen.
- **Chats:** Keyset-Pagination über `(chat_id, created_at DESC, id DESC)` mit passendem zusammengesetzten Index.
- **Partitionierung:** nicht vorab, sondern erst wenn die Tabelle „die Größe des physischen Speichers des Datenbankservers übersteigt".
- **Zeitstempel:** `timestamptz`, nie `timestamp`. *(Diese Regel ist plausibel und in der PostgreSQL-Doku zur Datentypwahl begründet, aber **ich habe die Datentyp-Seite nicht im Original gelesen** — siehe Grenzen.)*

### Keyset-Pagination statt OFFSET

`use-the-index-luke.com` ist die Referenz für dieses Argument, und der Grund ist **nicht nur Performance, sondern Korrektheit**:

> „`Offset` instructs the DBMS skip the first N results of a query. However, **the database must still fetch these rows from the disk and bring them in order before it can send the following ones.**" — [Use The Index, Luke — „We need tool support for keyset pagination"](https://use-the-index-luke.com/no-offset)

> „x1FETCH FIRST 10 ROWS ONLY… INSERT new row… When using `offset` to skip the previously fetched entries, **you'll get duplicates in case there were new rows inserted between fetching two pages**. There are other anomalies possible too, this is just the most common one." … „**Warning:** The idea to use the number of rows seen to skip over them later is simply wrong." — [ebd.](https://use-the-index-luke.com/no-offset)

Das ist der Punkt, der in Chat-UIs direkt sichtbar wird: Neue Nachrichten während des Blätterns erzeugen Duplikate oder übersprungene Nachrichten.

Die Lösung wörtlich aus der Quelle:

```sql
SELECT ...
  FROM ...
 WHERE ...
   AND id < ?last_seen_id
 ORDER BY id DESC
 FETCH FIRST 10 ROWS ONLY
```

> „This approach—called *seek method* or *keyset pagination*—solves the problem of drifting results as illustrated above and **is even faster than `offset`**." — [ebd.](https://use-the-index-luke.com/no-offset)

**Die belegte Einschränkung:**

> „you can also see that keyset pagination has some limitations: most notably that **you cannot directly navigate to arbitrary pages**. However, this is not a problem when using infinite scrolling." — [ebd.](https://use-the-index-luke.com/no-offset)

Für einen Chat ist das irrelevant (Infinite Scroll ist die natürliche UI). Für eine Admin-Tabelle mit „Seite 47 von 200" wäre es ein Problem — dann braucht man beide Mechanismen.

**Zusatzbeleg zur Indexnutzung:** Beim Keyset-Verfahren kann die Datenbank die Bedingung für den Indexzugriff nutzen: „This has a huge benefit in terms of performance because the database can use the `SALE_DATE < ?` condition for index access." — [Use The Index, Luke — „OFFSET is bad for skipping previous rows"](https://use-the-index-luke.com/sql/partial-results/fetch-next-page)

**Wichtig für die Bundle/API-Grenze:** Die Quelle weist darauf hin, dass Keyset-Pagination den ganzen Stack betrifft: „instead of passing a simple page number to the server, you must pass a full keyset (often multiple columns) down to the server." ([ebd.](https://use-the-index-luke.com/no-offset)) — d. h. der Cursor muss im API-Vertrag auftauchen (typischerweise als undurchsichtiger Base64-kodierter Cursor), und die React-Komponente muss den Cursor weiterreichen statt einer Seitennummer.

### UUIDv7 statt UUIDv4

PostgreSQL 18 führte eine native Funktion ein:

> „Add `UUID` version 7 generation function `uuidv7()` (Andrey Borodin)" — [PostgreSQL 18 Release Notes, §E.6.3.4 Functions](https://www.postgresql.org/docs/current/release-18.html)

Die praktische Verwendbarkeit (Prüfbeispiel, nicht als Norm formuliert):

```sql
CREATE TABLE test (
    id uuid DEFAULT uuidv7() PRIMARY KEY,
    name text
);
```

> „SELECT uuid_extract_version(uuidv7()); → 7" … „SELECT uuid_extract_timestamp(uuidv7()); → 2025-05-19 20:50:40.381+00" — [Nile Postgres, „UUIDv7 Comes to PostgreSQL 18"](https://www.thenile.dev/blog/uuidv7) *(Sekundärquelle für die Beispiele; die Existenz der Funktion selbst ist durch die PostgreSQL-Release-Notes belegt.)*

Zusätzlich nützlich für Debugging und Keyset-Cursor: `uuid_extract_timestamp(uuid)` macht den Zeitanteil lesbar ([ebd.](https://www.thenile.dev/blog/uuidv7)).

**Belegte Einschränkung, die man kennen muss:** UUIDv7 ist nicht kollisionsfrei garantiert, wenn mehrere Clients unabhängig voneinander IDs erzeugen — die Zeitordnung ist monoton, die Zufallsanteile aber unabhängig. Ein **Unique-Constraint/Primary Key auf der Spalte bleibt Pflicht**, und Konflikte sind bei hoher Insert-Rate nicht ausgeschlossen. *(Das ist eine mechanische Schlussfolgerung aus dem Aufbau von UUIDv7 und wird hier **nicht** durch eine zitierte Quelle belegt.)*

### Partitionierung — wann sie sich lohnt und wann nicht

Die PostgreSQL-Doku nennt den Schwellenwert klar:

> „These benefits will normally be worthwhile **only when a table would otherwise be very large**. The exact point at which a table will benefit from partitioning depends on the application, although **a rule of thumb is that the size of the table should exceed the physical memory of the database server.**" — [PostgreSQL 18 Docs, §5.12.1 Table Partitioning Overview](https://www.postgresql.org/docs/current/ddl-partitioning.html)

Und der Hauptgrund, der für ein Chat-System relevant ist:

> „Bulk loads and deletes can be accomplished by adding or removing partitions… **Dropping an individual partition using `DROP TABLE`, or doing `ALTER TABLE DETACH PARTITION`, is far faster than a bulk operation. These commands also entirely avoid the `VACUUM` overhead caused by a bulk `DELETE`.**" — [ebd.](https://www.postgresql.org/docs/current/ddl-partitioning.html)

Und die Warnung gegen „mehr Partitionen sind besser":

> „Not having enough partitions may mean that indexes remain too large and that data locality remains poor which could result in low cache hit ratios. However, dividing the table into too many partitions can also cause issues. **Too many partitions can mean longer query planning times and higher memory consumption** during both query planning and execution" … „**Never just assume that more partitions are better than fewer partitions, nor vice-versa.**" — [ebd., §5.12.6 Best Practices](https://www.postgresql.org/docs/current/ddl-partitioning.html)

Betriebsrelevante Details aus derselben Quelle:

- `DROP TABLE <partition>` auf einer Partition „requires taking an `ACCESS EXCLUSIVE` lock on the parent table."
- `ALTER TABLE ... DETACH PARTITION ... CONCURRENTLY` benötigt nur `SHARE UPDATE EXCLUSIVE` auf der Parent-Tabelle — die schonende Variante.
- Ein Index, der auf der partitionierten Tabelle erzeugt wird, wird automatisch auf alle Partitionen angewandt; **`CREATE INDEX CONCURRENTLY` ist auf partitionierten Tabellen aber nicht möglich.** Umgehung: `CREATE INDEX ON ONLY` am Parent, dann `CONCURRENTLY` je Partition, dann `ALTER INDEX ... ATTACH PARTITION`. Ein sehr praktisch relevanter Fallstrick.
- Einschränkung für Unique-Constraints: „the constraint's columns must include **all of the partition key columns**" ([ebd., §5.12.2.3 Limitations](https://www.postgresql.org/docs/current/ddl-partitioning.html)).

**Für ein Agenten-Harness heißt das:** `messages` **nicht** vorab partitionieren. Erst messen. Wenn überhaupt, dann Range-Partitionierung nach Zeit mit dem Ziel, alte Daten per `DETACH`/`DROP` loszuwerden — nicht, um Queries zu beschleunigen. Bei `sessions` ist Partitionierung fast nie sinnvoll, weil die Tabellen klein bleiben (abgelaufene Zeilen werden gelöscht).

### Schema und Fremdschlüssel

Die PostgreSQL-Doku liefert die Auswahlregel für `ON DELETE` wörtlich:

> „The appropriate choice of `ON DELETE` action depends on what kinds of objects the related tables represent. When the referencing table represents something that is a component of what is represented by the referenced table and cannot exist independently, then **`CASCADE`** could be appropriate. If the two tables represent independent objects, then **`RESTRICT` or `NO ACTION`** is more appropriate." — [PostgreSQL 18 Docs, §5.5 Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

Und der Default, der überrascht, wenn man ihn nicht kennt:

> „The default `ON DELETE` action is `ON DELETE NO ACTION`; this does not need to be specified." — [ebd.](https://www.postgresql.org/docs/current/ddl-constraints.html)

Der mandantenspezifische Fallstrick — die Doku benutzt dafür **genau** das `tenants`/`users`/`posts`-Muster, das für dieses Harness passt:

> „Without the specification of the column, the foreign key would also set the column `tenant_id` to null, **but that column is still required as part of the primary key**." — mit dem Beispiel `FOREIGN KEY (tenant_id, author_id) REFERENCES users ON DELETE SET NULL (author_id)` — [ebd.](https://www.postgresql.org/docs/current/ddl-constraints.html)

**Und der Fehler, der am häufigsten Performance kostet:**

> „Since a `DELETE` of a row from the referenced table or an `UPDATE` of a referenced column will require a scan of the referencing table for rows matching the old value, it is often a good idea to index the referencing columns too. **Because this is not always needed, and there are many choices available on how to index, the declaration of a foreign key constraint does not automatically create an index on the referencing columns.**" — [ebd.](https://www.postgresql.org/docs/current/ddl-constraints.html)

**Für das Harness heißt das konkret:** `ON DELETE CASCADE` für `messages` → `chats` → `workspaces` → `tenants` und für `sessions` → `users` (Komposition). **Jeder** Fremdschlüssel auf der Kindseite braucht einen expliziten Index — insbesondere `messages (chat_id)` und `sessions (user_id)`. Ohne diesen Index wird jedes Löschen eines Chats zum Seq Scan über die gesamte Nachrichtentabelle.

`NOT NULL` als Default: „In most database designs the majority of columns should be marked not null." ([ebd.](https://www.postgresql.org/docs/current/ddl-constraints.html))

### Indizes — die konkrete Regel für `(tenant_id, created_at)`

> „A multicolumn B-tree index can be used with query conditions that involve any subset of the index's columns, but **the index is most efficient when there are constraints on the leading (leftmost) columns.** The exact rule is that **equality constraints on leading columns, plus any inequality constraints on the first column that does not have an equality constraint**, will always be used to limit the portion of the index that is scanned." — [PostgreSQL 18 Docs, §11.3 Multicolumn Indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)

Daraus folgt für Chat-Verläufe: **`(tenant_id, chat_id, created_at DESC, id DESC)`** — Gleichheit zuerst (`tenant_id`, `chat_id`), dann Ungleichheit (`created_at < ?`), dann Tiebreaker (`id`).

Und die Doku begrenzt die Indexbreite selbst:

> „Multicolumn indexes should be used sparingly. In most situations, an index on a single column is sufficient and saves space and time. **Indexes with more than three columns are unlikely to be helpful unless the usage of the table is extremely stylized.**" — [ebd.](https://www.postgresql.org/docs/current/indexes-multicolumn.html)

Das steht in Spannung zum obigen Vier-Spalten-Index. Die Auflösung: Für `messages` **ist** die Nutzung „extremely stylized" (es gibt praktisch nur eine Abfrage: „Nachrichten dieses Chats, rückwärts"). Der Index ist damit gerechtfertigt — aber er ist der **einzige** breite Index auf dieser Tabelle.

**Teilindizes sind kein Ersatz für Partitionierung** — die Doku hat dafür ein eigenes Anti-Pattern-Beispiel:

> „**Example 11.4. Do Not Use Partial Indexes as a Substitute for Partitioning** … This is a bad idea! Almost certainly, you'll be better off with a single non-partial index, declared like `CREATE INDEX mytable_cat_data ON mytable (category, data);` (Put the category column first, for the reasons described in Section 11.3.)" — [PostgreSQL 18 Docs, §11.8 Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)

Zusätzliche belegte Einschränkung für Teilindizes: „a partial index can be used in a query only if the system can recognize that the `WHERE` condition of the query mathematically implies the predicate of the index" und „As a result, **parameterized query clauses do not work with a partial index**." ([ebd.](https://www.postgresql.org/docs/current/indexes-partial.html)) — relevant, wenn die Anwendung parametrisierte Queries mit Prepared Statements fährt (unter PgBouncer-Transaction-Pooling üblich, siehe unten).

**Index-Only-Scans** sind nur bei „all-visible" Seiten ein Gewinn:

> „while an index-only scan is possible given the two fundamental requirements, it will be a win only if a significant fraction of the table's heap pages have their all-visible map bits set." — [PostgreSQL 18 Docs, §11.9 Index-Only Scans](https://www.postgresql.org/docs/current/indexes-index-only-scans.html)

Und zur Vorsicht bei `INCLUDE`:

> „It's wise to be conservative about adding non-key payload columns to an index, especially wide columns. If an index tuple exceeds the maximum size allowed for the index type, **data insertion will fail.**" — [ebd.](https://www.postgresql.org/docs/current/indexes-index-only-scans.html)

Das ist ein harter Fehler, kein Performance-Problem — bei einer `INCLUDE (content)`-Spalte wäre ein Insert über der Index-Tuple-Grenze ein 500er.

### TOAST — wann es greift

> „The TOAST management code is triggered only when a row value to be stored in a table is wider than `TOAST_TUPLE_THRESHOLD` bytes (normally 2 kB). The TOAST code will compress and/or move field values out-of-line until the row value is shorter than `TOAST_TUPLE_TARGET` bytes (also normally 2 kB, adjustable) or no more gains can be had." — [PostgreSQL 18 Docs, §65.2 TOAST](https://www.postgresql.org/docs/current/storage-toast.html)

Und der Effekt, der die Architektur rechtfertigt:

> „the main table is much smaller and more of its rows fit in the shared buffer cache than would be the case without any out-of-line storage. […] A little test showed that a table containing typical HTML pages and their URLs was stored in about half of the raw data size including the TOAST table, and that the main table contained only about 10% of the entire data". — [ebd.](https://www.postgresql.org/docs/current/storage-toast.html)

Wichtig für Chat-Nachrichten: ein Update, das den Text **nicht** ändert, kostet kein TOAST:

> „During an `UPDATE` operation, values of unchanged fields are normally preserved as-is; so an `UPDATE` of a row with out-of-line values incurs no TOAST costs if none of the out-of-line values change." — [ebd.](https://www.postgresql.org/docs/current/storage-toast.html)

**Korrektur einer verbreiteten Behauptung:** „PG14/16 hat den TOAST-Default auf LZ4 geändert" ist **nicht belegt und nach der aktuellen Doku falsch**. LZ4 wurde in **PG14 als Option** hinzugefügt („Add ability to use LZ4 compression on TOAST data", [PostgreSQL 14 Release Notes](https://www.postgresql.org/docs/release/14.0/)), aber die aktuelle Doku sagt:

> „The supported compression methods are `pglz` and (if PostgreSQL was compiled with `--with-lz4`) `lz4`. **The default is `pglz`.**" — [PostgreSQL 18 Docs, `default_toast_compression`](https://www.postgresql.org/docs/current/runtime-config-client.html)

### Partitionierung — wann sie sich lohnt und wann nicht

Die PostgreSQL-Doku nennt den Schwellenwert klar:

> „These benefits will normally be worthwhile **only when a table would otherwise be very large**. The exact point at which a table will benefit from partitioning depends on the application, although **a rule of thumb is that the size of the table should exceed the physical memory of the database server.**" — [PostgreSQL 18 Docs, §5.12.1 Table Partitioning Overview](https://www.postgresql.org/docs/current/ddl-partitioning.html)

Und der Hauptgrund, der für ein Chat-System relevant ist:

> „Bulk loads and deletes can be accomplished by adding or removing partitions… **Dropping an individual partition using `DROP TABLE`, or doing `ALTER TABLE DETACH PARTITION`, is far faster than a bulk operation. These commands also entirely avoid the `VACUUM` overhead caused by a bulk `DELETE`.**" — [ebd.](https://www.postgresql.org/docs/current/ddl-partitioning.html)

Und die Warnung gegen „mehr Partitionen sind besser":

> „Not having enough partitions may mean that indexes remain too large and that data locality remains poor which could result in low cache hit ratios. However, dividing the table into too many partitions can also cause issues. **Too many partitions can mean longer query planning times and higher memory consumption** during both query planning and execution" … „**Never just assume that more partitions are better than fewer partitions, nor vice-versa.**" — [ebd., §5.12.6 Best Practices](https://www.postgresql.org/docs/current/ddl-partitioning.html)

Betriebsrelevante Details aus derselben Quelle:

- **Irreversibel:** „It is not possible to turn a regular table into a partitioned table or vice versa." → Die Entscheidung muss **vor** dem Datenwachstum fallen.
- `DROP TABLE <partition>` auf einer Partition „requires taking an `ACCESS EXCLUSIVE` lock on the parent table."
- `ALTER TABLE ... DETACH PARTITION ... CONCURRENTLY` benötigt nur `SHARE UPDATE EXCLUSIVE` auf der Parent-Tabelle — die schonende Variante.
- Ein Index auf der partitionierten Tabelle wird automatisch auf alle Partitionen angewandt; **`CREATE INDEX CONCURRENTLY` ist auf partitionierten Tabellen aber nicht möglich.** Umgehung: `CREATE INDEX ON ONLY` am Parent, dann `CONCURRENTLY` je Partition, dann `ALTER INDEX ... ATTACH PARTITION`. Ein sehr praktisch relevanter Fallstrick.
- Einschränkung für Unique-Constraints: „the constraint's columns must include **all of the partition key columns**" ([ebd., §5.12.2.3 Limitations](https://www.postgresql.org/docs/current/ddl-partitioning.html)). → Wenn `messages` nach Zeit partitioniert wird, **muss** der Primärschlüssel die Zeitspalte enthalten (z. B. `(chat_id, created_at, id)`). Das ist eine heute zu treffende Entscheidung.
- **Autovacuum-Analyze-Lücke:** „Partitioned tables do not directly store tuples and consequently are not processed by autovacuum. (Autovacuum does process table partitions just like other tables.) Unfortunately, this means that **autovacuum does not run `ANALYZE` on partitioned tables**, and this can cause suboptimal plans for queries that reference partitioned table statistics." ([PostgreSQL 18 Docs, §24.1 Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html))

**Für ein Agenten-Harness heißt das:** `messages` **nicht** vorab partitionieren. Erst messen. Wenn überhaupt, dann Range-Partitionierung nach Zeit mit dem Ziel, alte Daten per `DETACH`/`DROP` loszuwerden — nicht, um Queries zu beschleunigen. Bei `sessions` ist Partitionierung fast nie sinnvoll.

### VACUUM, Bloat und HOT-Updates

Warum es Bloat überhaupt gibt:

> „In PostgreSQL, an `UPDATE` or `DELETE` of a row does not immediately remove the old version of the row. This approach is necessary to gain the benefits of multiversion concurrency control (MVCC) […] eventually, an outdated or deleted row version is no longer of interest to any transaction. The space it occupies must then be reclaimed for reuse by new rows, to avoid unbounded growth of disk space requirements." — [PostgreSQL 18 Docs, §24.1](https://www.postgresql.org/docs/current/routine-vacuuming.html)

Und die Zielvorstellung:

> „**the idea is not to keep tables at their minimum size, but to maintain steady-state usage of disk space**" — [ebd.](https://www.postgresql.org/docs/current/routine-vacuuming.html)

`VACUUM FULL` ist kein Betriebswerkzeug:

> „`VACUUM FULL` requires an `ACCESS EXCLUSIVE` lock on the table it is working on, and therefore cannot be done in parallel with other use of the table. Generally, therefore, **administrators should strive to use standard `VACUUM` and avoid `VACUUM FULL`.**" — [ebd.](https://www.postgresql.org/docs/current/routine-vacuuming.html)

**HOT-Updates — der größte Einzelhebel für eine Session-Tabelle.** Die Bedingungen wörtlich:

> „This optimization is possible when: **The update does not modify any columns referenced by the table's indexes**, not including summarizing indexes. […] **There is sufficient free space on the page containing the old row** for the updated row." — [PostgreSQL 18 Docs, §65.4 Heap-Only Tuples](https://www.postgresql.org/docs/current/storage-hot.html)

> „You can increase the likelihood of sufficient page space for HOT updates by decreasing a table's `fillfactor`." — [ebd.](https://www.postgresql.org/docs/current/storage-hot.html)

**Die konkrete Konsequenz für das Harness (meine Schlussfolgerung aus dieser Regel):** Wenn `sessions` bei jedem Request `last_seen_at` aktualisiert (Idle-Timeout!) und `last_seen_at` **indiziert** ist, ist **jedes** Session-Update ein Non-HOT-Update → ein neuer Indexeintrag pro Request → Index-Bloat und Vacuum-Druck auf der heißesten Tabelle des Systems. Der Idle-Timeout-Mechanismus aus Abschnitt 3 und die Indexgestaltung müssen also zusammen geplant werden: **`last_seen_at` nicht indizieren**, oder das Idle-Timeout über eine separate, grob granulare Struktur führen.

**Wichtig zum Zeitverhalten bei einem Kleingruppen-System:** Der Verlust von Sessions ist billig (Nutzer melden sich neu an), aber Bloat auf `sessions` ist teuer. Die Tabelle ist update-lastig und klein — genau das Profil, für das HOT gedacht ist.

### Volltextsuche

> „**GIN indexes are the preferred text search index type.** As inverted indexes, they contain an index entry for each word (lexeme), with a compressed list of matching locations." — [PostgreSQL 18 Docs, §12.9 Preferred Index Types for Text Search](https://www.postgresql.org/docs/current/textsearch-indexes.html)

GIN-Grenze: „GIN indexes store only the words (lexemes) of `tsvector` values, and not their weight labels. Thus **a table row recheck is needed when using a query that involves weights.**" ([ebd.](https://www.postgresql.org/docs/current/textsearch-indexes.html))

GiST als Alternative ist verlustbehaftet: „A GiST index is *lossy*, meaning that the index might produce false matches, and it is necessary to check the actual table row to eliminate such false matches. […] **Since random access to table records is slow, this limits the usefulness of GiST indexes.**" ([ebd.](https://www.postgresql.org/docs/current/textsearch-indexes.html))

Für Teilstring- und Tippfehlertoleranz ist `pg_trgm` die dokumentierte Option:

> „These index types support the above-described similarity operators, and additionally **support trigram-based index searches for `LIKE`, `ILIKE`, `~`, `~*` and `=` queries.**" … „Unlike B-tree based searches, **the search string need not be left-anchored.**" — [PostgreSQL 18 Docs, `pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html)

Mit der Degenerationswarnung:

> „For both `LIKE` and regular-expression searches, keep in mind that **a pattern with no extractable trigrams will degenerate to a full-index scan**." — [ebd.](https://www.postgresql.org/docs/current/pgtrgm.html)

**Wichtig zur Erwartungshaltung:** Die PostgreSQL-Doku empfiehlt **nirgends** einen externen Suchindex. Der einzige dokumentierte Skalierungspfad ist:

> „Partitioning of big collections and the proper use of GIN and GiST indexes allows the implementation of very fast searches with online update. Partitioning can be done at the database level using table inheritance, or by **distributing documents over servers and collecting external search results**, e.g., via Foreign Data access. The latter is possible because ranking functions use only local information." — [ebd.](https://www.postgresql.org/docs/current/textsearch-indexes.html)

**Aussagen der Form „Postgres-FTS reicht ab X Millionen Zeilen nicht mehr" sind damit nicht belegt.** Die Doku nennt keine Schwelle.

**Und der entscheidende Zusammenhang mit Abschnitt 7:** Volltextsuche über **verschlüsselte** Nachrichten funktioniert nicht. GIN über `tsvector` verlangt Klartext. Wer Nachrichteninhalte verschlüsselt, verliert die serverseitige Suche — es sei denn, er baut ein durchsuchbares Verschlüsselungsverfahren oder einen Klartext-Index, was das E2EE-Versprechen untergräbt. Das ist eine der härtesten Kopplungen in diesem ganzen Bericht.

### Isolation und Connection Pooling

> „In PostgreSQL, you can request any of the four standard transaction isolation levels, but internally only three distinct isolation levels are implemented, i.e., **PostgreSQL's Read Uncommitted mode behaves like Read Committed.**" — [PostgreSQL 18 Docs, §13.2 Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

> „*Read Committed* is the default isolation level in PostgreSQL." — [ebd.](https://www.postgresql.org/docs/current/transaction-iso.html)

Bei höheren Stufen ist Retry-Logik Pflicht:

> „Applications using this level must be prepared to retry transactions due to serialization failures." Und: „It is important that an environment which uses this technique have a generalized way of handling serialization failures (which always return with an **SQLSTATE value of '40001'**)" — [ebd.](https://www.postgresql.org/docs/current/transaction-iso.html)

**PgBouncer-Transaction-Pooling bricht Session-Features.** Die PgBouncer-Doku ist explizit:

> „**Transaction pooling** — A server connection is assigned to a client only during a transaction. […] **This mode breaks a few session-based features of PostgreSQL. You can use it only when the application cooperates by not using features that break.**" — [PgBouncer Features](https://www.pgbouncer.org/features.html)

> „Note that 'transaction' pooling breaks client expectations of the server *by design* and can be used only if the application cooperates by not using non-working features." — [ebd.](https://www.pgbouncer.org/features.html)

Die Feature-Matrix für `transaction`-Pooling nennt `Never` für: `SET/RESET`, `LISTEN`, `WITH HOLD CURSOR`, `PREPARE`/`DEALLOCATE`, `PRESERVE/DELETE ROWS`-Temp-Tabellen, Session-Level-Advisory-Locks. `Protocol-level prepared plans` ist `Yes` — mit der Fußnote „You need to change `max_prepared_statements` to a non-zero value to enable this support." ([ebd.](https://www.pgbouncer.org/features.html))

**Konsequenz für das Harness:** Wenn Rate-Limiting oder Live-Updates über Postgres-`LISTEN`/`NOTIFY` laufen sollen — **das geht mit Transaction-Pooling nicht.** Für Live-Updates ist Redis (Streams, Abschnitt 9) die richtige Antwort, nicht Postgres-Notify. Das ist ein konkretes Architekturkriterium, kein Detail.

### Typische Fehler (mit Beleg)

1. **`OFFSET` für Chat-Verlauf** → Duplikate und übersprungene Einträge bei gleichzeitigen Inserts. Belegt oben.
2. **Kein Index auf der Fremdschlüssel-Kindseite** → „will require a scan of the referencing table" ([Constraints-Doku](https://www.postgresql.org/docs/current/ddl-constraints.html)). Das ist der häufigste Performance-Fehler in mandantenfähigen Schemata.
3. **Teilindizes als Partitionierungsersatz** → „This is a bad idea!" ([Partial-Index-Doku](https://www.postgresql.org/docs/current/indexes-partial.html)).
4. **Partitionieren, bevor es nötig ist, oder nachträglich wollen** → „It is not possible to turn a regular table into a partitioned table or vice versa" ([Partitionierungs-Doku](https://www.postgresql.org/docs/current/ddl-partitioning.html)).
5. **`timestamp` statt `timestamptz`** → „PostgreSQL never examines the content of a literal string before determining its type, and therefore will treat both of the above as `timestamp without time zone`." Und: „In a value that has been determined to be `timestamp without time zone`, PostgreSQL will **silently ignore** any time zone indication." ([Datentyp-Doku](https://www.postgresql.org/docs/current/datatype-datetime.html)) Bei Windows-Dev/Linux-Prod ist das eine reale Fehlerquelle.
6. **`time with time zone` benutzen** → „We do *not* recommend using the type `time with time zone`" ([ebd.](https://www.postgresql.org/docs/current/datatype-datetime.html)).
7. **Sich auf lückenlose Sequenz-IDs verlassen** → „changes made to a sequence (and therefore the counter of a column declared using `serial`) are **immediately visible to all other transactions and are not rolled back if the transaction that made the changes aborts.**" ([Transaktions-Doku](https://www.postgresql.org/docs/current/transaction-iso.html)) → ID-Lücken sind normal; Nachrichtennummerierung pro Chat darf **nicht** daraus abgeleitet werden.
8. **`idle in transaction` liegen lassen** → „an open transaction prevents vacuuming away recently-dead tuples that may be visible only to this transaction; so remaining idle for a long time can contribute to table bloat" ([`idle_in_transaction_session_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html)).
9. **`ANALYZE`-Last auf heißen Tabellen** → „Regularly running commands that acquire locks conflicting with a `SHARE UPDATE EXCLUSIVE` lock (e.g., ANALYZE) can effectively prevent autovacuums from ever completing." ([Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html))

**Nicht belegt in diesem Abschnitt** (ausdrücklich): „JSONB als Anti-Pattern" — ich habe die JSON-Datentyp-Doku nicht gelesen; „`tsvector` als `GENERATED ... STORED`-Spalte ist der Standardweg" — die Generated-Columns-Doku wurde nicht gelesen; „UUIDv4 verschlechtert die Index-Insert-Lokalität" — die Postgres-Doku sagt das an keiner gelesenen Stelle, das ist eine verbreitete, aber hier **nicht** belegte Behauptung; konkrete `fillfactor`-Werte.

### Was dagegen spricht

- **Keyset-Pagination ist mehr Code als `OFFSET`** — Cursor-Kodierung, Cursor-Validierung gegen Manipulation, und die Einschränkung, dass man nicht zu beliebigen Seiten springen kann ([use-the-index-luke](https://use-the-index-luke.com/sql/partial-results/fetch-next-page): „you cannot fetch arbitrary pages. Moreover you need to reverse all comparison and sort operations to change the browsing direction").
- **Der Vier-Spalten-Index widerspricht der Doku-Faustregel** („more than three columns are unlikely to be helpful"). Er ist nur gerechtfertigt, weil das Zugriffsmuster „extremely stylized" ist. Wenn später mandantenübergreifende Analysen dazukommen, ist er nutzlos und kostet nur Schreibzeit.
- **UUIDv7 leakt einen Zeitstempel.** Wer die ID sieht, kennt den ungefähren Erstellungszeitpunkt. Sequenzielle Integer-PKs leaken stattdessen die Gesamtzahl (Enumeration!). Beide Optionen haben einen Preis.
- **Die Postgres-Doku liefert Mechanismen, keine Benchmarks.** Alle Leistungsaussagen hier sind qualitativ. Für dein Datenvolumen muss gemessen werden.
- **PgBouncer auf Windows** ist in der gelesenen Doku nicht adressiert (**nicht belegt**), und ob der Bun-Postgres-Treiber Prepared Statements implizit nutzt, ist ebenfalls **nicht belegt** — beides vor Produktivbetrieb testen.

*Der Teilbericht `docs/research/auth-postgres-redis.md` (906 Zeilen) enthält die vollständige Belegkette inklusive der gelesenen URLs, der ausdrücklich nicht gelesenen Seiten und einer Liste aller nicht belegten Zahlen.*

---

## 9. Frage 8 — Redis

### Empfehlung

| Zweck | Empfehlung |
|---|---|
| Session-Store | **Ja, aber nur als beschleunigende Kopie.** Postgres hält die Wahrheit (Abschnitt 3), Redis ist der Cache. |
| Rate-Limiting | **Ja** — die Redis-Doku ordnet das Redis ausdrücklich zu. |
| Live-Updates (Chat) | **Ja, aber mit Streams, nicht Pub/Sub.** |
| Cache | **Ja** — eigener Keyspace mit eigener Eviction-Policy. |
| Primäre Datenbank | **Nein.** |
| Einzige Auth-Wahrheit | **Nein.** |
| Queue ohne Persistenzgarantie | **Nein** (Pub/Sub). |

### Wofür — und wofür ausdrücklich nicht

Die Redis-Doku nennt die Rolle selbst:

> „Sub-millisecond reads and writes from memory, so streaming runs on the same Redis instance already handling **cache, sessions, or rate limiting** at zero marginal cost." — [Redis Docs, Streaming Use Case](https://redis.io/docs/latest/develop/use-cases/streaming/)

Und die Grenze, die über die Architektur entscheidet — **dies ist der stärkste einzelne Beleg gegen „Redis als Auth-Wahrheit" im ganzen Bericht:**

> „In general Redis + Sentinel as a whole are an **eventually consistent system** where the merge function is **last failover wins**, and the data from old masters are discarded to replicate the data of the current master, so there is **always a window for losing acknowledged writes**." — [Redis Docs, High Availability / Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)

Und weiter, ungewöhnlich direkt für eine Herstellerdoku:

> „There are only two ways to avoid losing acknowledged writes: 1. Use synchronous replication (and a proper consensus algorithm to run a replicated state machine). 2. Use an eventually consistent system where different versions of the same object can be merged. **Redis currently is not able to use any of the above systems, and is currently outside the development goals.**" — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)

**Das ist die belegte Begründung dafür, dass Login-Zustand nicht ausschließlich in Redis liegen darf.** Ein Redis-Failover kann bestätigte Schreibvorgänge verlieren — also auch eine Session-Erstellung oder einen Logout.

Redis selbst setzt den Sicherheitsmaßstab unter Postgres an:

> „The general indication you should use both persistence methods is if you want a degree of data safety **comparable to what PostgreSQL can provide you**." — [Redis Docs, Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)

### Persistenz: RDB, AOF, fsync — und was das Verlustfenster ist

> „**RDB** (Redis Database): RDB persistence performs point-in-time snapshots of your dataset at specified intervals." / „**AOF** (Append Only File): AOF persistence logs every write operation received by the server." — [Redis Docs, Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)

> „RDB is NOT good if you need to minimize the chance of data loss in case Redis stops working (for example after a power outage). […] you'll usually create an RDB snapshot every five minutes or more, so in case of Redis stopping working without a correct shutdown for any reason **you should be prepared to lose the latest minutes of data**." — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)

Die fsync-Policies mit den Verlustfenstern, wörtlich:

| Policy | Doku-Formulierung | Verlustfenster |
|---|---|---|
| `appendfsync always` | „`fsync` every time new commands are appended to the AOF. **Very very slow, very safe.**" | ~0 |
| `appendfsync everysec` | „`fsync` every second. Fast enough … and **you may lose 1 second of data if there is a disaster.**" | ~1 s |
| `appendfsync no` | „**Never `fsync`**… The faster and less safe method. **Normally Linux will flush data every 30 seconds** with this configuration" | ~30 s (kernelabhängig) |

Quelle: [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/). Der Default: „The suggested (and default) policy is to `fsync` every second." ([ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/))

AOF allein wird abgeraten: „There are many users using AOF alone, but **we discourage it** since to have an RDB snapshot from time to time is a great idea for doing database backups, for faster restarts, and in the event of bugs in the AOF engine." ([ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/))

**Der gefährlichste Betriebsfehler** — und der, der bei einem Docker-Compose-Setup realistisch ist:

> „We have a setup with node A acting as master, with persistence turned down, and nodes B and C replicating from node A. / Node A crashes, however it has some auto-restart system, that restarts the process. However since persistence is turned off, the node restarts with an empty data set. / **Nodes B and C will replicate from node A, which is empty, so they'll effectively destroy their copy of the data.**" — [Redis Docs, Replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)

Die daraus folgende Betriebsregel, wörtlich:

> „In setups where Redis replication is used, it is strongly advised to have persistence turned on in the master and in the replicas. […] instances should be configured to **avoid restarting automatically** after a reboot." — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)

Und die belegte Grenze jeder Replikation:

> „However, because Redis uses asynchronous replication **it is not possible to ensure the replica actually received a given write, so there is always a window for data loss.**" — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)

Gegenmaßnahme (`min-replicas-to-write` / `min-replicas-max-lag`):

> „You may think of it as a best effort data safety mechanism, where consistency is not ensured for a given write, but at least **the time window for data loss is restricted to a given number of seconds**. In general bound data loss is better than unbound one." — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)

### TTL und Eviction — welche Policy Sessions zerstört

> „Set `maxmemory` to zero to specify that you don't want to limit the memory for the dataset. **This is the default behavior for 64-bit systems**" — [Redis Docs, Key eviction](https://redis.io/docs/latest/develop/reference/eviction/)

Der Default ist also **kein Limit** — und damit greift nie eine Eviction.

Die Policies und ihre Wirkung auf Session-Keys:

| Policy | Doku-Formulierung | Für Sessions? |
|---|---|---|
| `noeviction` | „Keys are not evicted but the server will return an **error** when you try to execute commands that cache new data." | Nur wenn Redis Datenspeicher ist |
| `allkeys-lru` | „Evict the least recently used (LRU) keys." | **Gefährlich**, wenn Sessions ohne TTL existieren |
| `allkeys-lfu` / `allkeys-random` | LFU bzw. zufällig | **Gefährlich**, s.o. |
| `volatile-lru` | „Evict the least recently used keys **that have an associated expiration (TTL)**." | **Ja — wenn jede Session eine TTL hat** |
| `volatile-ttl` | „Evict keys with an associated expiration (TTL) **that have the shortest remaining TTL value**." | **Ja — die sauberste Wahl für Sessions** |

Quelle: [ebd.](https://redis.io/docs/latest/develop/reference/eviction/)

**Die kritische Regel, die man kennen muss:**

> „The `volatile-xxx` policies behave like `noeviction` if no keys have an associated expiration." — [ebd.](https://redis.io/docs/latest/develop/reference/eviction/)

Das heißt: Eine `volatile-`Policy ohne TTL auf den Sessions ist **kein** Schutz, sondern führt zu Schreibfehlern. **Wenn `volatile-ttl` gewählt wird, muss jede Session zwingend eine TTL haben** — was ohnehin zum Idle-Timeout-Design aus Abschnitt 3 passt.

Und die Empfehlung zur Instanzentrennung:

> „The `volatile-lru`, `volatile-lrm`, and `volatile-random` policies are mainly useful when you want to use a single Redis instance for both caching and for a set of persistent keys. **However, you should consider running two separate Redis instances in a case like this, if possible.**" — [ebd.](https://redis.io/docs/latest/develop/reference/eviction/)

**Für das Harness:** zwei getrennte Redis-Instanzen (oder mindestens zwei klar getrennte Keyspaces mit unterschiedlichen Policies):
- **Cache:** `allkeys-lru`, keine TTL nötig, darf alles verlieren.
- **Sessions:** `volatile-ttl`, TTL Pflicht, darf nur abgelaufene Sessions verlieren.

LRU ist approximiert, nicht exakt:

> „The Redis LRU algorithm uses an approximation of the least recently used keys rather than calculating them exactly. **It samples a small number of keys at random** and then evicts the ones with the longest time since last access." … „The reason Redis does not use a true LRU implementation is because it costs more memory." — [ebd.](https://redis.io/docs/latest/develop/reference/eviction/)

Und auf Replicas: „By default, a replica will ignore `maxmemory` […] **it may end up using more memory than what is set via `maxmemory`**" ([Redis Docs, Replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)) — die Replica muss also mehr RAM bekommen als der Master, sonst wird sie vom OOM-Killer getötet.

### Pub/Sub gegen Streams für Live-Chat — die Antwort ist eindeutig

> „**Pub/sub** (Redis Pub/Sub, MQTT) is **fire-and-forget transport**: messages are delivered to whoever is connected and **discarded, with no persistence, replay, or consumer tracking**." — [Redis Docs, Streaming Use Case](https://redis.io/docs/latest/develop/use-cases/streaming/)

> „This pattern is distinct from pub/sub, which is **at-most-once transport with no history**: a subscriber that's offline when a message is published **misses it for good**." — [ebd.](https://redis.io/docs/latest/develop/use-cases/streaming/)

> „Streaming retains the ordered history, so many independent consumer groups can read the same events at their own pace and replay from any point." — [ebd.](https://redis.io/docs/latest/develop/use-cases/streaming/)

Was Streams liefern (wörtlich aus der Doku):

> „Deliver ordered events to multiple independent consumer groups, each processing the full stream at its own pace. / Scale consumers horizontally within a group to share work across workers, with **at-least-once delivery** and per-consumer tracking. / **Replay historical events** for debugging, bootstrapping a new projection, or rebuilding a downstream system from scratch. / **Bound memory by retaining events by length or by minimum ID**, without a separate cleanup job. / Recover unacknowledged entries from crashed consumers" — [ebd.](https://redis.io/docs/latest/develop/use-cases/streaming/)

Der Mechanismus:

> „producers append events to a stream with `XADD` and Redis assigns each entry an auto-generated, time-ordered ID. Consumers either read the stream directly with `XREAD`, or join a *consumer group* and read with `XREADGROUP`. Each consumer gets its own pending-entries list of in-flight messages, while the group as a whole tracks a single `last-delivered-id` cursor that advances as entries are handed out to any consumer. Once a consumer finishes processing an entry, it acknowledges it with `XACK`; entries left unacknowledged past a timeout can be reassigned to a healthy consumer with `XCLAIM` or `XAUTOCLAIM`." — [ebd.](https://redis.io/docs/latest/develop/use-cases/streaming/)

**Und der Fallstrick, den man kennen muss, bevor man `MAXLEN ~` benutzt:**

> „entries trimmed by `MAXLEN ~` before they are acked are surfaced in `XAUTOCLAIM`'s deleted-IDs list, so the caller can route them to a dead-letter store rather than retry against a missing payload" — [ebd.](https://redis.io/docs/latest/develop/use-cases/streaming/)

Ein Stream kann also Einträge verlieren, **bevor** sie verarbeitet wurden. Für ein Chat-Harness heißt das zwingend: **Die Nachricht muss bereits in Postgres liegen, bevor sie in den Stream geht.** Streams sind Transport- und Replay-Puffer, nicht das Archiv.

Streams mit Consumer Groups bleiben auch bei 0 Einträgen bestehen:

> „A difference between streams and other Redis data structures is that when the other data structures no longer have any elements […] the key itself will be removed. […] **Streams, on the other hand, are allowed to stay at zero elements**" … „The reason why such an asymmetry exists is because Streams may have associated consumer groups, and we do not want to lose the state that the consumer groups defined just because there are no longer any items in the stream." — [Redis Docs, Streams](https://redis.io/docs/latest/develop/data-types/streams/)

**At-least-once heißt: Verarbeitung muss idempotent sein.** Die Doku nennt „at-least-once delivery" und sagt nichts über Deduplizierung — Idempotenz ist Aufgabe der Anwendung, nicht des Transports.

Durchsatzangabe der Doku (mit Vorsicht zu lesen): „`XADD` is very fast and can easily insert **from half a million to one million items per second** in an average machine if pipelining is used." ([ebd.](https://redis.io/docs/latest/develop/data-types/streams/)) — das ist ein Doku-Benchmark, keine Zusage für dein System.

### Rate-Limiting in Redis — die belegten Muster

Der offizielle Weg, ein fixes Fenster zu bauen, inklusive der dokumentierten Race Condition:

```
FUNCTION LIMIT_API_CALL(ip)
ts = CURRENT_UNIX_TIME()
keyname = ip+":"+ts
MULTI
    INCR(keyname)
    EXPIRE(keyname,10)
EXEC
current = RESPONSE_OF_INCR_WITHIN_MULTI
IF current > 10 THEN
    ERROR "too many requests per second"
ELSE
    PERFORM_API_CALL()
END
```

> „**In the above code there is a race condition.** If for some reason the client performs the `INCR` command but does not perform the `EXPIRE` the key will be leaked until we'll see the same IP address again." — [Redis Docs, `INCR`](https://redis.io/docs/latest/commands/incr/)

Der offizielle Fix aus derselben Quelle:

```lua
local current
current = redis.call("incr",KEYS[1])
if current == 1 then
    redis.call("expire",KEYS[1],1)
end
```

> „This can be easily fixed by turning the `INCR` with optional `EXPIRE` into a Lua script that is then sent using the `EVAL` command" — [ebd.](https://redis.io/docs/latest/commands/incr/)

Warum Lua und nicht `MULTI`/`EXEC` — die präzise Begründung:

> „The entire increment-and-expire sequence runs inside a single `EVAL` call. Redis executes Lua scripts atomically, so no other command can interleave between the `INCR` and the `EXPIRE`. Without this, a crash between the two commands could leave a key with no expiry, permanently blocking that client. **A `MULTI`/`EXEC` transaction can't conditionally set `EXPIRE` only when `count == 1` since it can't branch on intermediate results**" — [Redis Tutorials, „Build 5 Rate Limiters with Redis"](https://redis.io/tutorials/howtos/ratelimiting/)

Die Redis-Doku liefert außerdem fertige Implementierungen für **Fixed Window, Sliding Window Log (ZSET), Sliding Window Counter (2 Keys, gewichtet), Token Bucket (`HASH` mit `tokens`/`last_refill`) und Leaky Bucket** ([ebd.](https://redis.io/tutorials/howtos/ratelimiting/)). Für einen Login-Endpunkt (Abschnitt 5): **Sliding Window Counter** für das Massenlimit pro IP, **langfristiger Zähler pro Konto** für die Kontosperre.

Verbindung zum Cluster-Betrieb: Der Sliding-Window-Counter braucht zwei Keys und liegt nur dann im selben Slot, wenn er Hash Tags verwendet.

### Cluster und HA — die Fallstricke für Sessions

Key-Slots:

> „The cluster's key space is split into **16384 slots**" … `HASH_SLOT = CRC16(key) mod 16384` — [Redis Docs, Cluster Specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)

> „Commands performing complex multi-key operations like set unions and intersections are implemented for cases where **all the keys involved in the operation hash to the same slot.**" — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)

Hash Tags als Lösung:

> „Hash tags are a way to ensure that multiple keys are allocated in the same hash slot. This is used in order to implement multi-key operations in Redis Cluster. […] If the key contains a "{...}" pattern only the substring between `{` and `}` is hashed in order to obtain the hash slot." — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)

Beispiele der Doku: `{user1000}.following` und `{user1000}.followers` liegen im gleichen Slot; bei `foo{{bar}}zap` wird `{bar` gehasht; bei `foo{bar}{zap}` wird `bar` gehasht.

**Für das Harness:** Wenn eine Session mehrere Keys braucht (Session-Daten + Rate-Limit-Zähler), dann `{sess:<id>}:data` und `{sess:<id>}:rate` — gleicher Slot. **Aber Vorsicht:** Wenn Lua über Keys *verschiedener* Sessions arbeitet, funktioniert das im Cluster nicht. Die exakte Fehlersemantik von `EVAL` bei Cross-Slot-Keys ist in der gelesenen Doku **nicht belegt** — vor dem Einsatz testen.

Weitere belegte Cluster-Regeln:

> „Redis Cluster does not support multiple databases like the standalone version of Redis. **We only support database `0`; the `SELECT` command is not allowed.**" — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)

> „Acceptable degree of write safety: the system tries (in a best-effort way) to retain all the writes originating from clients connected with the majority of the master nodes. **Usually there are small windows where acknowledged writes can be lost.**" — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)

> „This means that Redis Cluster is designed to survive failures of a few nodes in the cluster, but **it is not a suitable solution for applications that require availability in the event of large net splits**." — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)

Sentinel statt Cluster für ein kleines HA-Setup:

> „Redis Sentinel provides high availability for Redis when **not using Redis Cluster**." … „You need **at least three Sentinel instances** for a robust deployment." … „The three Sentinel instances should be placed into computers or virtual machines that are believed to fail in an independent way." — [Redis Docs, Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)

> „In practical terms this means during failures **Sentinel never starts a failover if the majority of Sentinel processes are unable to talk**" — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)

**Der Docker-/Windows-Entwicklungs-Fallstrick — direkt relevant für dein Setup:**

> „Sentinel auto-discovery of other Sentinels no longer works, since it is based on *hello* messages where each Sentinel announce at which port and IP address they are listening for connection. However Sentinels have no way to understand that an address or port is remapped" … „there is currently no way to monitor with Sentinel a set of master and replica instances deployed with Docker, **unless you instruct Docker to map the port 1:1**." — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)

Workaround laut Doku: `sentinel announce-ip` / `sentinel announce-port`.

Und die Betriebsregel, die man nicht ignorieren sollte:

> „There is no HA setup which is safe if you don't test from time to time in development environments, or even better if you can, in production environments, if they work." — [ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)

### Was das konkret für „Session weg = Benutzer abgemeldet" bedeutet

**Das ist meine Schlussfolgerung aus den belegten Mechanismen — kein einzelnes Doku-Zitat:**

| Ereignis | Belegter Mechanismus | Folge für Sessions |
|---|---|---|
| Absturz, **RDB allein** | „you should be prepared to lose the latest minutes of data" | Bis zu mehrere Minuten an Logins weg → Nutzer abgemeldet |
| Absturz, **AOF + `everysec`** (Default) | „you may lose 1 second of data" | Verlustfenster ≈ 1 s |
| **`appendfsync no`** | „Normally Linux will flush data every 30 seconds" | Bis ~30 s |
| **Eviction** durch `maxmemory` | „Redis evicts keys according to the chosen eviction policy" | Session-Keys werden **aktiv gelöscht**, unabhängig von Persistenz |
| **Failover** (Sentinel/Cluster) | „acknowledged writes can still be lost during a failover" | Letzte Logins/Updates können verschwinden |
| **Persistenzloser Master mit Auto-Restart + Replica** | „they'll effectively destroy their copy of the data" | **Totalverlust aller Sessions** |

**Die Antwort auf deine Frage lautet also:** „Sitzung weg = Benutzer abgemeldet" ist **akzeptabel, wenn Postgres die Wahrheit hält** und ein Redis-Verlust nur bedeutet, dass aktive Sessions neu aufgebaut werden müssen — nicht, dass Daten verloren sind. Wenn Logins ausschließlich in Redis liegen, ist ein Redis-Failover ein Sicherheitsereignis (Zustand unklar) und kein Verfügbarkeitsereignis.

### Was dagegen spricht

- **Zwei Redis-Instanzen sind mehr Betrieb.** Aber eine Instanz mit gemischten Zwecken erzwingt eine Policy, die für einen der beiden Zwecke falsch ist — und die falsche Wahl trifft Sessions oder Cache.
- **Sentinel im Docker-Compose-Setup ist fummelig** (Port-Remapping, `announce-ip`). Für ein Kleingruppen-System kann ein einzelner Redis mit akzeptiertem Ausfall die ehrlichere Wahl sein — dann muss die Anwendung aber sauber mit „Redis ist kurz weg" umgehen können.
- **`WAIT` löst das Problem nicht vollständig:** „it does not turn a set of Redis instances into a CP system with strong consistency" ([Replication-Doku](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)).
- **Der `maxmemory-policy`-Default ist in der gelesenen Doku nicht genannt — nicht belegt.** Vor dem Deployment explizit setzen und prüfen.
- **Kein Doku-Beleg für „Session weg = Benutzer abgemeldet" als Formulierung** — die Doku beschreibt Verlustfenster und Eviction, nicht die Anwendungsfolge. Die Tabelle oben ist begründete Schlussfolgerung.
- **Streams im Redis Cluster** (Resharding, Consumer Groups, Hot Spots) sind in der gelesenen Cluster-Spec **nicht** behandelt. Ein Stream pro Chat bindet den Chat an einen Master — bei einem sehr aktiven Chat ist das ein Hot Spot. **Nicht belegt**, aber ein reales Risiko.
- **`MAXLEN ~` ist approximativ** (die Tilde). Für „wir behalten die letzten 1000 Nachrichten" ist `MAXLEN ~ 1000` **keine exakte Garantie**.
- **Ob dein Bun-Redis-Client Sentinel unterstützt, ist nicht belegt.** Die Sentinel-Doku sagt nur: „You need Sentinel support in your clients. Popular client libraries have Sentinel support, but not all." ([ebd.](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/))

*Der Teilbericht `docs/research/auth-postgres-redis.md` enthält die vollständige Belegkette, inklusive der belegten Sentinel-Quorum-Regeln, der Replica-Auswahllogik, des TILT-Modus, der PgBouncer-Feature-Matrix und einer Liste aller nicht belegten Zahlen.*

---

## 10. Frage 9 — Schlüsselverwaltung im Betrieb (ohne Cloud-KMS)

### Empfehlung — minimal vernünftige Lösung, dreistufig

**Stufe 1 (Minimum, sofort umsetzbar):**
Master-Key in einer Datei mit restriktiven Rechten, **nicht** in einer Umgebungsvariable, gemountet als Docker-Secret (`/run/secrets/<name>`), Datei-Besitzer = Service-User, `chmod 400`. Master-Key **nicht** im selben Verzeichnisbaum wie der DB-Dump.

**Stufe 2 (empfohlen für Produktion):**
Master-Key mit **SOPS + age** verschlüsselt im Repository; Entschlüsselung nur auf dem Zielhost mit einem privaten age-Key, der nie im Repository liegt.

**Stufe 3 (bei mehreren Diensten/Compliance-Bedarf):**
**HashiCorp Vault** mit Transit-Engine: Die Anwendung sieht den Schlüssel nie, sie schickt Klartext zum Verschlüsseln und Chiffrat zum Entschlüsseln.

### Begründung

**Warum nicht Umgebungsvariable** — OWASP sagt es zweimal, wörtlich:

> „Avoid storing keys in environment variables, as these can be accidentally exposed through functions such as `phpinfo()` or through the `/proc/self/environ` file." — [OWASP Cryptographic Storage CS, „Key Storage"](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Und Docker begründet dasselbe aus Betriebssicht:

> „Environment variables are often available to all processes, and it can be difficult to track access. They can also be **printed in logs when debugging errors without your knowledge**. Using secrets mitigates these risks." — [Docker Docs, „Manage secrets securely in Docker Compose"](https://docs.docker.com/compose/how-tos/use-secrets/)

**Docker-Secrets, konkret:**

> „Secrets are mounted as a file in `/run/secrets/<secret_name>` inside the container." — [ebd.](https://docs.docker.com/compose/how-tos/use-secrets/)

> „Compose delivers each secret by bind-mounting a single file into the container, and **Windows containers support bind-mounting directories only**." — [ebd.](https://docs.docker.com/compose/how-tos/use-secrets/)

> „Unlike the other methods, this permits granular access control within a service container via standard filesystem permissions." — [ebd.](https://docs.docker.com/compose/how-tos/use-secrets/)

**Wichtig für die Windows-Entwicklung:** Docker-Secrets sind laut Doku auf Linux-Container beschränkt. Für die Windows-Entwicklungsumgebung heißt das: denselben Dateipfad-Mechanismus (`/run/secrets/...` bzw. eine konfigurierbare Secret-Datei) verwenden, aber **nicht** davon ausgehen, dass Compose-Secrets unter Windows-Containern identisch funktionieren. Das ist ein konkreter Grund, die Secret-Auflösung im Code über einen konfigurierbaren Pfad zu machen, nicht hart über `/run/secrets/`.

**SOPS + age:**

> „**SOPS** is an editor of encrypted files that supports YAML, JSON, ENV, INI and BINARY formats and encrypts with AWS KMS, GCP KMS, Azure Key Vault, HuaweiCloud KMS, **age**, and PGP." — [SOPS Docs](https://getsops.io/docs/)

> „SOPS was initially launched as a project at Mozilla in 2015 and has been graciously donated to the **CNCF as a Sandbox project in 2023**" — [ebd.](https://getsops.io/docs/)

SOPS nutzt intern bereits das Umschlagverfahren: Es verschlüsselt die Daten mit einem DEK und legt *mehrere* verschlüsselte Kopien des DEK ab, je eine pro KEK — d. h. mehrere age-Recipients können dieselbe Datei entschlüsseln ([SOPS Encryption Protocol, referenziert in getsops.io/docs](https://getsops.io/docs/) — die Detailbeschreibung des Protokolls steht im SOPS-Repository/der Doku; als Sekundärbeschreibung u. a. [NWM, „Secrets with SOPS & Age"](https://nicholas-morris.com/articles/sops), die das DEK/KEK-Modell auf die SOPS-Doku zurückführt).

> „age is a simple, modern and secure encryption tool, format, and Go library." — [FiloSottile/age](https://github.com/Filosottile/age)

age unterstützt inzwischen auch Post-Quantum-Hybridverschlüsselung (`mlkem768x25519`), was für langfristig zu schützende Daten relevant ist ([ebd., „Inspecting encrypted files"](https://github.com/Filosottile/age)).

**Vault Transit:**

> „Transit secrets engine … as 'cryptography as a service' or 'encryption as a service'." — Ausgabe zeigt: `vault write transit/encrypt/my-key plaintext=$(echo "my secret data" | base64)` → `ciphertext  vault:v1:8SDd3WHDOjf7mq69CyCqYjBXAiQQAVZRkFM13ok481zoCmHnSeDX9vyf7w==` — [HashiCorp Vault Docs, Transit](https://developer.hashicorp.com/vault/docs/secrets/transit)

Bemerkenswert an dieser Ausgabe: Das Präfix `vault:v1:` ist genau die geforderte **Key-Version im Chiffrat** — Krypto-Agilität durch Design. Der Rotationsbefehl `vault write -force transit/keys/cha/rotate` erhält alte Versionen (`keys map[1:… 2:… 3:…]`, `min_decryption_version 1`), sodass Altdaten weiter lesbar bleiben.

**OWASP zur Bevorzugung von Vault/HSM:**

> „Where available, the secure storage mechanisms provided by the operating system, framework or cloud service provider should be used. These include: A physical Hardware Security Module (HSM). A virtual HSM. Key vaults such as Amazon KMS or Azure Key Vault. An external secrets management service such as Conjur or **HashiCorp Vault**. Secure storage APIs provided by the ProtectedData class in the .NET framework." — [OWASP Cryptographic Storage CS, „Key Storage"](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Für OWASP ASVS Level 3 fordert die Key-Management-Quelle Hardware:

> „For higher-assurance deployments (such as OWASP ASVS 5.0 Level 3), applications should use hardware-backed modules, such as a Hardware Security Module (HSM) or Trusted Platform Module (TPM), to significantly reduce the risk of key extraction or compromise in software memory." — [OWASP Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

Und zur Trennung von Entwicklung und Produktion — wörtlich:

> „Is there no way to reduce access to certain secrets within a secrets management solution? **Consider separating the production and development secrets by having separate secret management solutions. Then, reduce access to the production secrets management solution.**" — [OWASP Secrets Management CS, „Ensure limitations are in place"](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

Weitere belegte Anforderungen an die Betriebsabläufe:

- **Automatisierte Rotation:** „Prefer automated key rotation using Key Management Services (KMS)… to reduce operational error and ensure timely updates." ([OWASP Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html))
- **Backup/Break-Glass:** „Data that has been encrypted with lost cryptographic keys will never be recovered. Therefore, it is essential that the application incorporate a secure key backup capability" … „you should implement emergency ('break-glass') processes… emergency break-glass credentials should be regularly backed up securely in a secondary secrets management system and tested routinely to verify they work." ([Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html), [Secrets Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html))
- **Niemals Secrets im Repo:** „Cryptographic keys, secrets, and API keys should **never** be committed to source code repositories or embedded in build artifacts (such as binaries, container images, or configuration files)." ([Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html))
- **Zeroization ist in GC-Sprachen nur begrenzt möglich:** „Overwriting key material is best-effort in managed runtimes, where copies can survive in garbage-collected memory, immutable strings, or swapped-out pages." ([Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)) — relevant, weil Bun/TypeScript genau so eine Laufzeit ist. Das ist ein ehrlicher Grund, warum Vault (Stufe 3) für hochsensible Schlüssel überlegen ist: Der Schlüssel liegt dann nie im Bun-Prozess.

### Was dagegen spricht

- **Vault ist ein zusätzlicher Dienst mit eigener Ausfallart.** Fällt Vault aus, kann die Anwendung nicht entschlüsseln. OWASP verlangt deshalb explizit Break-Glass-Prozesse und getestete Notfallzugänge. Für ein Einzelnutzer-/Kleingruppen-Harness kann das mehr Betriebsrisiko schaffen als es löst.
- **SOPS+age verlagert das Problem auf den age-Private-Key.** Liegt der auf demselben Host wie die DB und wird dieser Host kompromittiert, ist der Gewinn gering. Der Gewinn liegt bei Repo-Leaks und Backup-Abfluss.
- **Dateirechte auf Windows sind nicht POSIX-Dateirechte.** Die Entwicklungs-/Produktionsdifferenz (Windows vs. Linux) muss beim Secret-Loading berücksichtigt werden, sonst testet man in Dev etwas anderes als in Prod. Wie Windows-ACLs korrekt zu setzen sind, ist **nicht belegt** in den geprüften Quellen.
- **Schlüsselrotation ist der eigentliche Aufwand, nicht die Schlüsselspeicherung.** OWASP: „It is important that the code and processes required to rotate a key are in place **before** they are required" ([Cryptographic Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)). Wer keine Rotation testet, hat sie nicht.

---

## 11. Frage 10 — Etikettenschwindel: was oft behauptet wird und nicht hält

Dieser Abschnitt ist die wichtigste Liste im Bericht — hier steht, was ich nicht kaufen würde.

### 11.1 „Wir verschlüsseln alles" (Ende-zu-Ende)

**Warum es meistens nicht stimmt:** Eine Web-App, die Suchfunktion, Zusammenfassungen, Agenten-Kontexte oder Push-Vorschauen anbietet, hält Klartext oder ein Äquivalent. „Verschlüsselt" ohne Angabe *gegen wen* ist eine inhaltsleere Aussage. OWASP fordert genau diese Präzisierung ein:

> „Which layer(s) are most appropriate will depend on the threat model. For example, **hardware level encryption is effective at protecting against the physical theft of the server, but will provide no protection if an attacker is able to compromise the server remotely.**" — [OWASP Cryptographic Storage CS, „Where to Perform Encryption"](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Das ist die belegte Formulierung des Betrugs: Verschlüsselung wird beworben, ohne das Bedrohungsmodell zu nennen, für das sie gilt.

**Was in der Werbung fehlt:** Bei serverseitiger Verschlüsselung ist die Anwendung selbst der Angriffsweg. OWASP sagt dazu:

> „While it may not be possible to fully protect the keys from an attacker who has fully compromised the application, a number of steps can be taken to make it harder for them to obtain the keys." — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

**Ehrliche Formulierung:** „Daten sind auf Feldebene verschlüsselt; die Schlüssel liegen getrennt von der Datenbank. Das schützt gegen DB- und Backup-Diebstahl, nicht gegen eine kompromittierte Anwendung."

### 11.2 Selbstgebautes Krypto

Kürzeste belegbare Antwort: **„### Custom Algorithms — Don't do this."** ([OWASP Cryptographic Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html))

Und für den Browser zusätzlich: „It's very easy to misuse them… don't guarantee or imply the security of your work before an individual knowledgeable in this subject matter thoroughly reviews it." ([MDN, Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API))

**Etikettenschwindel:** „Wir haben unser eigenes Verschlüsselungsverfahren / eigenes Token-Format / eigenen KDF entwickelt." Selbst wenn die Primitive korrekt ist, ist die Komposition fast nie geprüft.

### 11.3 JWT als Sitzung

**Behauptung:** „Wir sind stateless und skalieren deshalb besser."
**Wirklichkeit:** Sobald Logout oder Widerruf gebraucht wird, kommt die Denylist und damit der Zustand zurück: „user sessions won't be completely stateless anymore which might defeat the benefits of stateless sessions" ([OWASP JWT CS](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)). Praktisch tauscht man einen schnellen Session-Lookup gegen eine Denylist-Prüfung — plus die ganze JWT-Fehlerklasse (Algorithmus-Konfusion, `iss`/`aud`-Konfusion, Token-Typ-Konfusion, Vertrauen in Header-Keys).

**Zusatzproblem, das fast nie erwähnt wird:** JWT-Inhalte sind lesbar, nicht verschlüsselt („The payload is only base64url encoded, not encrypted, so anyone who obtains the token can read every claim", [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)). Wer Rollen oder Mandanten ins JWT schreibt, veröffentlicht sie gegenüber dem Client.

### 11.4 „Wir prüfen die Rolle im Frontend"

Client-seitige Autorisierung ist keine Autorisierung. Die belegbare Deckung: `CWE-602`-artige clientseitige Durchsetzung ist genau das Muster, gegen das OWASP A01:2025 Broken Access Control steht („Broken Access Control" ist Platz 1 der Top 10 2025, [top10.owasp.org/2025](https://top10.owasp.org/2025/en/)); der OWASP-Top-10-Kommentar dazu: „**Enforce deny-by-default on all endpoints.** Validate permissions server-side on every request".

Ehrlicher Hinweis zur Quellenlage: Die Formulierung „Enforce deny-by-default on all endpoints. Validate permissions server-side on every request" stammt aus einer **Sekundärquelle** ([SentinelOne, „OWASP Top 10"](https://www.sentinelone.com/cybersecurity-101/cybersecurity/owasp-top-10/)), nicht von OWASP selbst. Das Prinzip ist in der OWASP-Top-10-Kategorie A01 enthalten, aber **ich habe die OWASP-A01-Seite nicht im Original gelesen** und zitiere sie daher nicht wörtlich — die Aussage gilt als Prinzip, nicht als Zitat.

### 11.5 Rate-Limit nur pro IP

**Behauptung:** „Wir haben Rate Limiting, also sind wir gegen Credential Stuffing geschützt."
**Wirklichkeit, belegt:** „Blocking IP addresses may be sufficient to stop less sophisticated attacks, but should not be used as the sole or primary defense" … „Many credential stuffing toolkits, such as Sentry MBA, offer built-in use of proxy networks to distribute requests across a large volume of unique IP addresses. This may defeat both IP block-lists and rate limiting" ([OWASP Credential Stuffing Prevention CS](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)).

**Zweiter Fehler:** Rate Limiting auf *Requests* statt auf *Login-Versuche*. OWASP dokumentiert GraphQL-Batching als konkrete Umgehung ([API2:2023](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)).

**Dritter Fehler:** Zähler nur im Speicher des App-Prozesses. Bei mehreren Instanzen oder nach einem Neustart ist das Limit wirkungslos. (Die Notwendigkeit eines geteilten Zählers ist eine mechanische Schlussfolgerung; **nicht belegt** durch eine der geprüften Quellen.)

### 11.6 „Wir haben MFA" (aber nur SMS)

> „NIST SP 800-63B-4 designates SMS and PSTN-delivered codes as a *restricted* authenticator because of SS7 interception, SIM-swap, and number-porting attacks. Do not use SMS for high-value or PII-handling applications." — [OWASP MFA CS](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

Und zur MFA-Fatigue:

> „Attackers repeatedly send MFA push notifications, often combined with social engineering, hoping the user eventually approves one." Mitigation: „Require challenge-response push authentication (for example, number matching)… **Rate-limit or cap push notifications**" — [ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

### 11.7 „Passwortwechsel alle 90 Tage erhöht die Sicherheit"

Das Gegenteil ist die aktuelle Empfehlung:

> „**Do not force human beings to rotate passwords unless you suspect breach.** If you suspect breach, force password resets immediately." — [OWASP Top 10:2025, A07](https://top10.owasp.org/2025/A07_2025-Authentication_Failures/)

> „Ensure credential rotation when a password leak occurs… **Avoid requiring periodic password changes**; instead, encourage users to pick strong passwords and enable MFA. According to NIST guidelines, verifiers should not mandate arbitrary password changes (e.g., periodically)." — [OWASP Authentication CS](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### 11.8 „Komplexitätsregeln machen Passwörter stark"

> „Allow usage of **all** characters including unicode and whitespace. **There should be no password composition rules limiting the type of characters permitted. There should be no requirement for upper or lower case or numbers or special characters.**" — [OWASP Authentication CS](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### 11.9 „Sicherheitsfragen als Kontowiederherstellung"

> „**Security questions are no longer recognized as an acceptable authentication factor** per NIST SP 800-63… Account recovery is just an alternate way to authenticate so it should be no weaker than regular authentication." — [OWASP MFA CS](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

Zusätzlich: „Do not use security questions for authentication or re-authentication; ASVS 6.4.2 excludes knowledge-based authentication." ([OWASP Authentication CS](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html))

### 11.10 „Lockout schützt vor Brute Force" (ohne DoS-Abwehr gedacht)

Ein harter Lockout nach n Fehlversuchen ist ein Werkzeug, mit dem ein Angreifer beliebige Konten aussperren kann. OWASP benennt das als eigenen Fehlerfall und empfiehlt Gegenmaßnahmen ([Authentication CS, „Account Lockout"](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)) — und `CWE-307: Improper Restriction of Excessive Authentication Attempts` steht in der A07:2025-Liste ([Top 10:2025 A07](https://top10.owasp.org/2025/A07_2025-Authentication_Failures/)).

### 11.11 „SameSite=Strict löst CSRF"

Nicht nach OWASP: „Treat `SameSite` as defense in depth against CSRF, **not as a replacement for a CSRF token**." ([Session Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)). Und SameSite schützt nicht vor client-seitigem CSRF, nicht auf alten Browsern, und nicht gegen Top-Level-Navigation-Tricks ([CSRF CS](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)).

### 11.12 „Wir haben eine Denylist, also können wir JWT widerrufen"

> „Using the raw JWT or a secure hash of the JWT (`SHA-256(token)`) as the denylist key is **not safe** and might expose the application to denylist bypass through JWT malleability." — [OWASP JWT CS](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)

### 11.13 „Ein Logout-Button genügt"

> „**Session timeout management and expiration must be enforced server-side.**" ([Session Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)) … „deleting a cookie alone does not invalidate a stolen copy of the session ID." ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)) Und: „Browser close events cannot reliably enforce logout." ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html))

### 11.14 „Unsere API-Keys sind gehasht, also sicher"

Wenn der Hash ein *schneller* Hash über einen *niedrig-entropischen* Schlüssel ist, ist er wertlos. Wenn der Schlüssel dagegen 128 Bit Zufall hat, ist der schnelle Hash richtig (siehe Abschnitt 6) — aber dann schützt der Hash gegen DB-Lesezugriff, nicht gegen eine kompromittierte Anwendung. Was fehlt, ist meist: **Rotation, Ablauf, Scopes, Einmalanzeige, Monitoring**.

### 11.15 „Wir speichern die Schlüssel der Nutzer für Fremd-APIs sicher"

Nur wenn die Master-Keys tatsächlich außerhalb der DB liegen und die App sie nicht in Klartext loggen kann. `console.log(config)` mit einem Fremdschlüssel darin ist der häufigste reale Vorfall — und Docker benennt genau das als Grund für Secrets statt Umgebungsvariablen: „They can also be printed in logs when debugging errors without your knowledge." ([Docker Docs](https://docs.docker.com/compose/how-tos/use-secrets/))

### 11.16 „Wir haben Rate Limiting vor dem Hash"

Falls nicht: Ein ungeschützter Login-Endpunkt mit Argon2id ist ein selbstgebauter DoS-Verstärker. OWASP benennt den Mechanismus: „which could be used by an attacker to carry out a denial of service attack by exhausting the server's CPU with a large number of login attempts." ([Password Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html))

---

## 12. Was ich NICHT empfehle und warum

| Nicht empfehlen | Grund (belegt) |
|---|---|
| **SHA-256/512 + Salt für Passwörter** | „Fast hashing algorithms such as SHA‑256 are not suitable for password storage because they allow attackers to perform large numbers of guesses quickly." ([Password Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)) |
| **bcrypt für neue Passwörter** | „should only be used for password storage in legacy systems where Argon2 and scrypt are not available" ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)). Zusätzlich 72-Byte-Limit und in Bun eine SHA-512-Vorverarbeitung, die OWASP als „dangerous practice" einstuft. |
| **Argon2i oder Argon2d für Passwörter** | Argon2id ist die Variante mit dem ausgewogenen Schutz; die OWASP-Minimalprofile sind für Argon2i ausdrücklich mit „Do not use with Argon2i" markiert ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)) |
| **Parallelität (`p`) als Kostenfaktor hochdrehen** | „increasing p does not multiply the total memory or act as an iteration count" (ebd.) — man zahlt nichts Zusätzliches, gewinnt aber auch nichts gegen den Angreifer |
| **WASM-Argon2 serverseitig** | Langsamer als natives Addon, und das ist der einzige Zweck des Vorschlags ([argon2-browser](https://www.npmjs.com/package/argon2-browser)) |
| **JWT als Browser-Sitzung** | „frowned upon" ([OWASP JWT CS](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)); Widerruf erzwingt Zustand zurück |
| **Session-Token unverändert („verbatim") speichern** | „anyone who can read it can reuse unexpired tokens. High entropy protects against guessing; it does not protect exposed tokens." ([Session Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)) |
| **Naives Double-Submit-Cookie** | „bypassable by an attacker who can write cookies on the target domain… For new code, use the Signed Double-Submit Cookie pattern" ([CSRF CS](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)) |
| **CSRF-Token im Cookie (beim Synchronizer-Pattern)** | „A CSRF token should not be transmitted in a cookie for synchronized patterns." ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)) |
| **CSRF-Token in URL/GET** | „A CSRF token must not be leaked in the server logs or in the URL." (ebd.) |
| **`SameSite=None` ohne `Secure`** | „Never use `SameSite=None` without `Secure`" ([Session Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)) |
| **`Domain`-Attribut am Session-Cookie setzen** | „the `Domain` attribute should not be set" (ebd.) — Subdomain-Übernahme wird sonst zum Session-Diebstahl |
| **Sich auf Browser-Schließen als Logout verlassen** | „Browser close events cannot reliably enforce logout." (ebd.) |
| **CAPTCHA als CSRF-Schutz** | „Do NOT use CAPTCHA because it is specifically designed to protect against bots." ([CSRF CS](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)) |
| **CAPTCHA als Brute-Force-Schutz (allein)** | „should be viewed as a defense-in-depth control… rather than as a preventative" ([Authentication CS](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)) |
| **Rate Limit nur pro IP** | „should not be used as the sole or primary defense" ([Credential Stuffing CS](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)) |
| **Konto-Lockout mit fester langer Dauer** | Erzeugt selbst ein DoS-Werkzeug; OWASP empfiehlt exponentielle Verzögerung statt fester Dauer ([Authentication CS](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)) |
| **Periodische Passwortwechsel erzwingen** | „Do not force human beings to rotate passwords unless you suspect breach." ([Top 10:2025 A07](https://top10.owasp.org/2025/A07_2025-Authentication_Failures/)) |
| **Zusammensetzungsregeln für Passwörter** | „There should be no password composition rules limiting the type of characters permitted." ([Authentication CS](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)) |
| **Sicherheitsfragen** | „no longer recognized as an acceptable authentication factor" ([MFA CS](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)) |
| **SMS als MFA-Kern** | „restricted authenticator because of SS7 interception, SIM-swap, and number-porting attacks" (ebd.) |
| **API-Keys zur Benutzer-Authentifizierung** | „API keys should not be used for user authentication. They should only be used for API clients authentication." ([OWASP API2:2023](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)) |
| **OAuth als Authentifizierung missverstehen** | „OAuth is not authentication, and neither are API keys." (ebd.) |
| **bcrypt/Argon2 für API-Key-Hashing** | „Unlike passwords, API keys are high-entropy random strings, so you do not need a slow hash like bcrypt." ([apikeys.guide](https://apikeys.guide/docs/implementation/validation-and-lookup)) |
| **API-Key nach der Erstellung erneut vollständig anzeigen** | Stripe zeigt einen neu erstellten Secret-Key nur einmal ([Stripe](https://docs.stripe.com/keys-best-practices)); ein wiederholbarer „Key anzeigen"-Pfad ist ein zusätzlicher Kompromittierungsweg |
| **Master-Keys in Umgebungsvariablen** | „Avoid storing keys in environment variables, as these can be accidentally exposed through… `/proc/self/environ`." ([Cryptographic Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)) |
| **Schlüssel im selben Backup wie die Daten** | „Where possible, encryption keys should be stored in a separate location from encrypted data." ([ebd.](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)) |
| **AES-GCM mit unbegrenzt vielen Operationen pro Key** | „limit each key to at most `2^32` … encryption operations across all devices sharing that key to limit IV-collision risk" ([Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)) |
| **Eigenes Krypto** | „### Custom Algorithms — Don't do this." ([Cryptographic Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)) |
| **Nicht-authentifizierte Verschlüsselungsmodi (CBC/CTR ohne MAC, ECB)** | „Where available, authenticated modes should always be used." … „ECB should not be used outside of very specific circumstances." (ebd.) |
| **Denylist über `SHA-256(JWT)`** | „not safe… denylist bypass through JWT malleability" ([JWT CS](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)) |
| **Verifikationskey aus dem Token-Header (`jwk`/`jku`/`x5u`) vertrauen** | „Do not take the verification key from the token unless that key can be tied, through a chain of trust, to a root trust anchor associated with the issuer." (ebd.) |
| **`alg: none` oder Algorithmus-Mix akzeptieren** | „Make sure that `\"alg\":\"none\"` is not accepted by your JWT parser." (ebd.) |
| **Secrets im Repo oder in Build-Artefakten** | „should **never** be committed to source code repositories or embedded in build artifacts" ([Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)) |

---

## 13. Offene Fragen an den Betreiber

Das sind echte Entscheidungen, die ich nicht für dich treffen kann. Jede hat direkte Konsequenzen im Code.

**1. Ist die React-Oberfläche same-origin mit der API oder cross-origin?**
Bestimmt, ob `SameSite=Lax` mit `__Host-`-Präfix genügt oder ob `SameSite=None` plus Pflicht-CSRF-Token und explizite Origin-Allowlist nötig ist. Beides ist umsetzbar, aber die Anforderungen unterscheiden sich deutlich.

**2. Ist Redis im Ausfall „fail-open" oder „fail-closed"?**
Wenn Session-Cache und Rate-Limiter beide in Redis liegen: Fällt Redis aus, ist die Wahl (a) alle Nutzer abgemeldet und alle Logins blockiert, oder (b) Sessions funktionieren weiter (Postgres), aber Rate Limiting ist aus. Für ein Sicherheitssystem ist (b) gefährlich, für ein Verfügbarkeitssystem ist (a) gefährlich. Postgres als Session-Wahrheit und Redis als Cache macht (b) möglich — willst du das?

**3. Welches ist das konkrete Bedrohungsmodell für „Verschlüsselung im Ruhezustand"?**
DB-Dump und Backup-Abfluss, oder auch ein Angreifer mit Code-Ausführung in der Anwendung? Bei Ersterem reicht Umschlagverschlüsselung mit Datei-KEK. Bei Letzterem braucht es Vault/Transit oder HSM, weil der Bun-Prozess sonst alles entschlüsseln kann.

**4. Ist MFA verpflichtend, optional oder nicht geplant?**
Wenn verpflichtend: TOTP ab Tag eins, WebAuthn/Passkeys als Ziel. Wenn optional: Das Harness braucht trotzdem die Rate-Limiting- und Lockout-Mechanik, weil ohne MFA Credential Stuffing direkt durchschlägt („MFA is by far the best defense", [Credential Stuffing CS](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)).

**5. Multi-Tenant oder Single-Tenant?**
Bestimmt, ob jede Tabelle eine `tenant_id`-Spalte mit Teilindex braucht und ob Row-Level-Security (Postgres RLS) eingesetzt wird. Ein Agenten-Harness mit Workspaces kann beides sein; die Schema-Entscheidung ist später teuer zu ändern.

**6. Sollen Agenten/Services im Namen eines Nutzers handeln?**
Wenn ja: Braucht es delegierte, ablaufende Tokens mit Nutzer als Subjekt (`act`/`may_act`-Muster, siehe [OWASP JWT CS, Claims-Tabelle](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)) — nicht Dienst-API-Keys mit Nutzer-ID im Payload. Wenn nein: Dienst-Keys mit Scopes genügen.

**7. Welche Daten müssen durchsuchbar bleiben, wenn sie verschlüsselt werden?**
Volltextsuche über verschlüsselte Nachrichten ist ohne aufwendige Krypto (oder Klartext-Index) nicht möglich. Die Antwort bestimmt, welche Felder überhaupt verschlüsselt werden können und ob ein „E2EE"-Versprechen haltbar ist.

**8. Wie lang darf die Übergangszeit bei API-Key- und Master-Key-Rotation sein?**
Ohne Übergangsfenster ist jede Rotation ein Ausfall; mit zu langem Fenster bleibt ein kompromittierter Schlüssel zu lange gültig. Die Zahl ist eine Risikoentscheidung. (Belegte Vorgaben zur konkreten Dauer habe ich **nicht** gefunden.)

**9. Wer darf im Notfall entschlüsseln (Break-Glass)?**
OWASP verlangt getestete Break-Glass-Prozesse und ein zweites Secrets-System ([Secrets Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)). Für ein Kleingruppen-Harness ist das eine reale Frage: Wer hat den age-Key, und passiert das auf demselben Host?

**10. Ist „E2EE" ein Produktversprechen oder eine technische Option?**
Wenn es ein Versprechen ist, muss die serverseitige Klartext-Verarbeitung (Agenten-Prompts, Suche, Zusammenfassungen) ausgeschlossen oder klar als Ausnahme benannt werden. Wenn es eine Option ist, sollte die UI den Unterschied sichtbar machen.

**11. Gilt für Produktion eine Compliance-Anforderung (FIPS 140-3, PCI DSS, DSGVO-Auftragsverarbeitung)?**
FIPS würde die Algorithmuswahl ändern (PBKDF2 statt Argon2id: „If FIPS-140 compliance is required, use PBKDF2 with a work factor of 600,000 or more and set with an internal hash function of HMAC-SHA-256", [Password Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)). Das ist die eine Frage, die die Empfehlung aus Abschnitt 2 vollständig umwerfen würde.

---

## 14. Quellen

### OWASP Cheat Sheet Series
- Password Storage — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Authentication — https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- Session Management — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Cross-Site Request Forgery Prevention — https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- JSON Web Token — https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html
- Credential Stuffing Prevention — https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html
- Multifactor Authentication — https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- Cryptographic Storage — https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- Key Management — https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
- Secrets Management — https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- Forgot Password — https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- GitHub-Spiegel der Cheat Sheets — https://github.com/OWASP/CheatSheetSeries

### OWASP Top 10 / API Security
- OWASP Top 10:2025 (Übersicht) — https://top10.owasp.org/2025/en/
- OWASP Top 10:2025 — A07 Authentication Failures — https://top10.owasp.org/2025/A07_2025-Authentication_Failures/
- OWASP API Security Top 10 — API2:2023 Broken Authentication — https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/
- OAT-008 Credential Stuffing — https://owasp.org/www-project-automated-threats-to-web-applications/assets/oats/EN/OAT-008_Credential_Stuffing
- OAT-007 Credential Cracking — https://owasp.org/www-project-automated-threats-to-web-applications/assets/oats/EN/OAT-007_Credential_Cracking

### NIST
- NIST SP 800-63B-4 (PDF) — https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf
- NIST SP 800-63B, Section 5.2.2 Rate Limiting (Throttling) — https://pages.nist.gov/800-63-3/sp800-63b.html#throttle
- NIST SP 800-63B-4, Password Verifiers — https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver
- NIST SP 800-57 Part 1 Rev. 5 — https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final
- NIST SP 800-38D (GCM) — https://csrc.nist.gov/pubs/sp/800/38/d/final
- NIST SP 800-88 Rev. 2 — https://csrc.nist.gov/pubs/sp/800/88/r2/final
- NIST FIPS 203 (ML-KEM) — https://csrc.nist.gov/pubs/fips/203/final

### IETF / RFCs
- RFC 9106 — Argon2 — https://www.rfc-editor.org/rfc/rfc9106.html
- RFC 7914 — scrypt — https://www.rfc-editor.org/rfc/rfc7914.html
- RFC 8725 — JWT Best Current Practices — https://www.rfc-editor.org/info/rfc8725/
- draft-ietf-oauth-rfc8725bis-10 — https://datatracker.ietf.org/doc/draft-ietf-oauth-rfc8725bis/
- RFC 9700 — OAuth 2.0 Security Best Current Practice — https://www.rfc-editor.org/info/rfc9700/
- RFC 7519 — JWT — https://datatracker.ietf.org/doc/html/rfc7519
- RFC 7516 — JWE — https://datatracker.ietf.org/doc/html/rfc7516
- RFC 6749 §10.10 — https://www.rfc-editor.org/rfc/rfc6749.html#section-10.10
- RFC 6819 §4.3.2 — https://www.rfc-editor.org/rfc/rfc6819.html#section-4.3.2
- RFC 6265bis (Cookie-Präfixe §4.1.3) — https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis
- RFC 9420 — MLS Protocol (Standards Track, Juli 2023) — https://www.rfc-editor.org/rfc/rfc9420.html
- RFC 9750 — MLS Architecture (Informational, April 2025) — https://www.rfc-editor.org/rfc/rfc9750.html
- RFC 8827 — WebRTC Security Architecture — https://www.rfc-editor.org/rfc/rfc8827.html
- RFC 8831 — WebRTC Data Channels — https://www.rfc-editor.org/info/rfc8831/
- RFC 9180 — HPKE — https://www.rfc-editor.org/rfc/rfc9180.html
- RFC 9449 — DPoP — https://datatracker.ietf.org/doc/html/rfc9449
- RFC 8705 — mTLS-gebundene Tokens — https://www.rfc-editor.org/rfc/rfc8705.html
- RFC 6238 — TOTP — https://www.rfc-editor.org/rfc/rfc6238.html
- draft-ietf-keytrans-architecture (In Last Call) — https://datatracker.ietf.org/doc/draft-ietf-keytrans-architecture/
- W3C Fetch Metadata — https://www.w3.org/TR/fetch-metadata/
- W3C Web Cryptography API Level 2 (Editor's Draft) — https://w3c.github.io/webcrypto/

### PostgreSQL
- §5.5 Constraints (FK, `ON DELETE`, `NOT NULL`) — https://www.postgresql.org/docs/current/ddl-constraints.html
- §5.12 Table Partitioning — https://www.postgresql.org/docs/current/ddl-partitioning.html
- §65.2 TOAST — https://www.postgresql.org/docs/current/storage-toast.html
- §65.4 Heap-Only Tuples (HOT) — https://www.postgresql.org/docs/current/storage-hot.html
- §11.3 Multicolumn Indexes — https://www.postgresql.org/docs/current/indexes-multicolumn.html
- §11.8 Partial Indexes (inkl. Example 11.4) — https://www.postgresql.org/docs/current/indexes-partial.html
- §11.9 Index-Only Scans — https://www.postgresql.org/docs/current/indexes-index-only-scans.html
- §12.9 Preferred Index Types for Text Search — https://www.postgresql.org/docs/current/textsearch-indexes.html
- §13.2 Transaction Isolation — https://www.postgresql.org/docs/current/transaction-iso.html
- §24.1 Routine Vacuuming — https://www.postgresql.org/docs/current/routine-vacuuming.html
- Datentypen: Datum/Zeit — https://www.postgresql.org/docs/current/datatype-datetime.html
- `pg_trgm` — https://www.postgresql.org/docs/current/pgtrgm.html
- UUID-Funktionen (`uuidv7()`) — https://www.postgresql.org/docs/current/functions-uuid.html
- Release 18 — https://www.postgresql.org/docs/current/release-18.html
- Release 14 (LZ4-TOAST) — https://www.postgresql.org/docs/release/14.0/
- Release 16 (HOT+BRIN) — https://www.postgresql.org/docs/release/16.0/
- `default_toast_compression` / `idle_in_transaction_session_timeout` — https://www.postgresql.org/docs/current/runtime-config-client.html

### Use The Index, Luke / PgBouncer
- We need tool support for keyset pagination — https://use-the-index-luke.com/no-offset
- OFFSET is bad for skipping previous rows — https://use-the-index-luke.com/sql/partial-results/fetch-next-page
- PgBouncer Features (Pooling-Modi, Feature-Matrix) — https://www.pgbouncer.org/features.html

### Redis
- Persistence (RDB, AOF, fsync-Policies) — https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- Replication — https://redis.io/docs/latest/operate/oss_and_stack/management/replication/
- High Availability / Sentinel — https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/
- Cluster Specification (Slots, Hash Tags) — https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/
- Key eviction — https://redis.io/docs/latest/develop/reference/eviction/
- Streams — https://redis.io/docs/latest/develop/data-types/streams/
- Streaming Use Case (Pub/Sub vs. Streams) — https://redis.io/docs/latest/develop/use-cases/streaming/
- `INCR` (Rate-Limiter-Patterns) — https://redis.io/docs/latest/commands/incr/
- Build 5 Rate Limiters with Redis — https://redis.io/tutorials/howtos/ratelimiting/
- Rate limiter (Use Case) — https://redis.io/docs/latest/develop/use-cases/rate-limiter/
- Rate Limiting (Glossar) — https://redis.io/glossary/rate-limiting/

### NIST
- NIST SP 800-63B-4 (PDF) — https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf
- NIST SP 800-63B, Section 5.2.2 Rate Limiting (Throttling) — https://pages.nist.gov/800-63-3/sp800-63b.html#throttle
- NIST SP 800-63B-4, Password Verifiers — https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver
- NIST SP 800-38D — GCM and GMAC (§8.3, Appendix A, Appendix D) — https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf
- NIST SP 800-57 Part 1 Rev. 5 — https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final
- NIST SP 800-88 Rev. 2 — https://csrc.nist.gov/pubs/sp/800/88/r2/final
- NIST FIPS 203 (ML-KEM) — https://csrc.nist.gov/pubs/fips/203/final

### Signal / MLS-Implementierung
- Signal Docs (Übersicht) — https://signal.org/docs/
- X3DH (Revision 1, 2016-11-04) — https://signal.org/docs/specifications/x3dh/
- PQXDH — https://signal.org/docs/specifications/pqxdh/
- Double Ratchet (Revision 4, 2025-11-04) — https://signal.org/docs/specifications/doubleratchet/
- Sesame (Revision 2, 2017-04-14) — https://signal.org/docs/specifications/sesame/
- libsignal — https://github.com/signalapp/libsignal
- OpenMLS — https://github.com/openmls/openmls

### Hersteller- und Projektdoku
- Bun — Hashing API — https://bun.com/docs/api/hashing
- Bun — `Bun.password` API Reference — https://bun.com/reference/bun/password
- npm — `@node-rs/argon2` — https://www.npmjs.com/package/@node-rs/argon2
- napi-rs/node-rs — https://github.com/napi-rs/node-rs
- npm — `argon2-browser` — https://www.npmjs.com/package/argon2-browser
- PHC-Referenzimplementierung Argon2 — https://github.com/p-h-c/phc-winner-argon2
- PHC String Format — https://github.com/P-H-C/phc-string-format/blob/master/phc-sf-spec.md
- Cloudflare — Rate limiting best practices — https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/
- Cloudflare — Rate limiting rules — https://developers.cloudflare.com/waf/rate-limiting-rules/
- Stripe — Best Practices für API-Schlüssel (DE) — https://docs.stripe.com/keys-best-practices
- Stripe — API keys — https://docs.stripe.com/keys
- Stripe — Restricted API keys — https://docs.stripe.com/keys/restricted-api-keys
- Google Cloud — API keys best practices — https://cloud.google.com/docs/authentication/api-keys-best-practices
- apikeys.guide — Key Formats & Prefixes — https://apikeys.guide/docs/implementation/key-formats-and-prefixes
- apikeys.guide — Hashing & Storage — https://apikeys.guide/docs/security/hashing-and-storage
- apikeys.guide — Validation & Lookup — https://apikeys.guide/docs/implementation/validation-and-lookup
- GitHub — Secret scanning partner program — https://docs.github.com/en/code-security/secret-scanning/secret-scanning-partner-program
- Docker — Manage secrets securely in Docker Compose — https://docs.docker.com/compose/how-tos/use-secrets/
- Docker — Compose File Reference: Secrets — https://docs.docker.com/reference/compose-file/secrets/
- SOPS — Dokumentation — https://getsops.io/docs/
- SOPS — Repository — https://github.com/getsops/sops
- age — Repository — https://github.com/FiloSottile/age
- HashiCorp Vault — Transit secrets engine — https://developer.hashicorp.com/vault/docs/secrets/transit
- HashiCorp Vault — Lease-Konzept — https://developer.hashicorp.com/vault/docs/concepts/lease
- MDN — Web Crypto API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- MDN — `Crypto.subtle` — https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle
- MDN — Secure Contexts — https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts
- MDN — Using WebRTC data channels — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels
- MDN — Signaling and video calling — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling
- MDN — Introduction to WebRTC protocols — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols
- MDN — Set-Cookie — https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie

### CWE / Sonstiges
- CWE-307 — https://cwe.mitre.org/data/definitions/307.html
- CWE-208 — https://cwe.mitre.org/data/definitions/208.html
- CWE-256 — https://cwe.mitre.org/data/definitions/256.html
- CWE-798 — https://cwe.mitre.org/data/definitions/798.html
- CWE-799 — https://cwe.mitre.org/data/definitions/799.html
- CWE-204 — https://cwe.mitre.org/data/definitions/204.html
- Specops Software — GPU-Password-Cracking-Benchmarks (SHA-256-Hashrate) — https://specopssoft.com/blog/gpu-password-cracking-nvidia-amd/
- OWASP JWT for Java (nicht-kanonische Spiegelung) — https://owasp.deteact.com/cheat/cheatsheets/JSON_Web_Token_Cheat_Sheet_for_Java.html
- SentinelOne — OWASP Top 10 Übersicht (Sekundärquelle) — https://www.sentinelone.com/cybersecurity-101/cybersecurity/owasp-top-10/

### Teilberichte (beigefügt)
- `docs/research/auth-postgres-redis.md` — PostgreSQL- und Redis-Details (Fragen 7 und 8)
- `docs/research/auth-crypto-e2ee.md` — Verschlüsselung, E2EE, MLS (Frage 6)

---

## 15. Grenzen dieses Berichts

**Was ich nicht getan habe:**

1. **Keine Bibliotheks-Sicherheitshistorie recherchiert.** Ich habe **keine** CVE- oder Advisory-Prüfung für `@node-rs/argon2`, `Bun.password`, `rust-argon2` oder für Bun-interne Krypto-Pfade durchgeführt. Die Empfehlung stützt sich auf Funktionalität und dokumentiertes Verhalten, nicht auf eine geprüfte Schwachstellenhistorie. Das ist vor dem Festschreiben nachzuholen.
2. **Keine eigenen Benchmarks.** Alle Parameterzahlen stammen aus OWASP- und Bun-Dokumentation. OWASP verlangt ausdrücklich, auf der Zielhardware zu messen — dieser Schritt steht noch aus.
3. **Kein FIPS-/Compliance-Kontext geprüft.** Falls eine Zertifizierungsanforderung besteht, ändert sich die Hashing-Empfehlung (PBKDF2 600.000 Iterationen). Das ist als offene Frage formuliert.

**Ausdrücklich als „nicht belegt" gekennzeichnete Punkte:**

| # | Punkt |
|---|---|
| 1 | CVE-/Advisory-Historie der Hashing-Bibliotheken |
| 2 | Explizite Aussage „Rate Limit muss vor dem Hash erfolgen" — in keiner geprüften OWASP-Quelle gefunden; als Schlussfolgerung markiert |
| 3 | Konkrete Übergangsdauer bei API-Key- und Master-Key-Rotation |
| 4 | „`extractable: false` schützt nicht gegen XSS" — mechanische Schlussfolgerung, nicht zitiert |
| 5 | OWASP-Originaltext zu A01 (die zitierte Formulierung stammt aus einer Sekundärquelle) |
| 6 | Windows-ACL-Details für Secret-Dateien |
| 7 | „UUIDv4 verschlechtert die Index-Insert-Lokalität" — steht nicht in der Postgres-Doku |
| 8 | „PG16 hat den TOAST-Default auf LZ4 geändert" — **falsch**; die PG18-Doku sagt „The default is `pglz`" |
| 9 | JSONB als Anti-Pattern; `tsvector` als `GENERATED ... STORED`-Spalte |
| 10 | Empfehlung eines externen Suchindex und jede Schwelle „ab X Zeilen" — die Postgres-Doku spricht sie nirgends aus |
| 11 | Redis-`maxmemory-policy`-Defaultwert |
| 12 | Cross-Slot-`EVAL`-Fehlersemantik im Redis-Cluster; Streams im Cluster (Resharding, Hot Spots) |
| 13 | PgBouncer auf Windows; Bun-Treiber + Transaction-Pooling + Prepared Statements |
| 14 | Ob der Bun-Redis-Client Sentinel unterstützt |
| 15 | **Nachrichtenlänge** als Metadaten-Leck bei E2EE — in keiner Primärquelle wörtlich belegt |
| 16 | „Signal Safety Numbers" — der Begriff steht in keiner gelesenen Signal-Spezifikation; belegt ist nur der Fingerprint-/QR-Mechanismus |
| 17 | `libsignal`-Sprachbindungen für TypeScript/Bun; andere MLS-Implementierungen als OpenMLS; Post-Quanten-Unterstützung in MLS |
| 18 | Redis-seitige Verschlüsselungseigenschaften (RDB-/AOF-Verschlüsselung) |
| 19 | NIST SP 800-57 Part 1 Rev. 5 im Primärtext — die Kryptoperioden-Zahlen stammen aus der wörtlichen OWASP-Wiedergabe |
| 20 | Produktionsreife von MLS in WASM (OpenMLS: „built but doesn't test") |

**Zahlen wurden nicht nachgerechnet.** Der Leser prüft jede Zahl — genau deshalb steht bei jeder die Quelle. Die 585-Jahre-Rechnung, die 2^32-Grenze, die MH/s-Benchmarks und die Cryptoperioden sind so zitiert, wie sie in den Quellen stehen.

**Strukturelle Grenze dieses Berichts:** Er beantwortet, *was* der Stand der Technik ist und *wo* die Belege stehen. Er beantwortet **nicht**, welche Parameter für `prometheus-harness` auf der konkreten Zielhardware richtig sind — dafür braucht es Messungen am System, nicht weitere Recherche.
