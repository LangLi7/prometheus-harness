# Verschlüsselung im Ruhezustand und Ende-zu-Ende-Verschlüsselung/P2P in Web-Anwendungen

**Frage 6 der Gesamtrecherche · Belegte Recherche, Stand 2025/2026**

**Kontext des Vorhabens:** selbstgebautes Agenten-Harness — TypeScript auf Bun, TypeScript/Go/Rust,
kein Python, PostgreSQL, Redis, React-Weboberfläche, Einzelnutzer- bis Kleingruppen-System.
Chats und Workspaces sollen verschlüsselt gespeichert werden.

**Methodik und Belegdisziplin**

Alle Primärquellen wurden tatsächlich abgerufen und im Volltext gelesen (nicht nur Suchergebnis-Snippets).
Wörtliche Zitate sind als englische Kurzzitate mit Anführungszeichen und URL wiedergegeben.
Wo eine Aussage in den gelesenen Quellen **nicht** belegt werden konnte, steht ausdrücklich
„nicht belegt". Wo eine Aussage eine **Schlussfolgerung** aus belegten Fakten ist, ist sie als solche
gekennzeichnet. Es wurde keine Quelle, URL, Zahl oder kein Zitat erfunden.

**Abrufzeitpunkt der Quellen:** Die abgerufenen Fassungen tragen Datumsangaben aus 2025 und 2026
(u. a. W3C WebCrypto Editor's Draft vom 11. August 2026, MDN-Seiten zuletzt geändert September/Oktober 2026,
Signal Double Ratchet Revision 4 vom 4. November 2025, OpenMLS-Commit vom 12. Oktober 2026).
Die Recherche deckt damit den geforderten Stand 2025/2026 ab.

---

## 1. Server-seitige Verschlüsselung im Ruhezustand: Was ist 2025/2026 der pragmatische Standard?

### Empfehlung

Für ein Einzelnutzer- bis Kleingruppen-System ist der pragmatische Standard:

1. **Algorithmus:** AES-256 (mindestens AES-128) in einem **authentifizierten** Modus, erste Wahl **AES-GCM**.
   GCM liefert Vertraulichkeit **und** Integrität/Authentizität in einem Schritt, ohne dass eine
   separate MAC-Konstruktion gebaut werden muss.
2. **Kein ECB.** Kein selbstgebauter Algorithmus, keine selbstgebaute Verkettung von Primitive.
3. **Nonce/IV:** pro Chiffrat ein **frischer Zufalls-IV mit 96 Bit** für GCM, **niemals** wiederverwenden.
   IV-Generierung der Bibliothek überlassen, nicht selbst basteln.
4. **Nonce-Buchhaltung ist Pflicht, nicht Kür:** Für AES-GCM mit zufälligen 96-Bit-IVs gilt ein **hartes
   Budget von 2^32 Verschlüsselungsoperationen pro Schlüssel**, summiert über *alle* Instanzen, die den
   Schlüssel teilen. Das ist für ein Kleingruppen-System praktisch unerreichbar, aber der Zähler bzw. die
   Rotation muss *designt* sein, nicht nachgerüstet.
5. **Verschlüsselungsgranularität:** pro Nachricht bzw. pro Workspace-Chunk ein eigenes Chiffrat mit
   eigenem IV (nicht ein einziger Riesenciphertext für die ganze Tabelle). Das hält das
   Operations-Budget pro Schlüssel kontrollierbar und macht Suche/Selektion auf Metadatenebene möglich.
6. **Schlüsselspeicher:** Schlüssel **nicht** im Quellcode, **nicht** im Versionskontrollsystem, **nicht**
   in Umgebungsvariablen. Bevorzugt OS-Keychain, Key-Vault oder HSM.
7. **Keys und Daten räumlich trennen** (Datenbank vs. Dateisystem bzw. verschiedene Systeme).
8. **Defense in Depth:** Verschlüsselung ist eine zusätzliche Schicht, kein Ersatz für Zugriffskontrolle.

### Belege

**OWASP Cryptographic Storage Cheat Sheet** — <https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html>

- Schlüssellänge und Algorithmus:
  > „For symmetric encryption **AES** with a key that's at least **128 bits** (ideally **256 bits**) and a secure mode should be used as the preferred algorithm."
- Authentifizierte Modi sind erste Wahl:
  > „Where available, authenticated modes should always be used. These provide guarantees of the integrity and authenticity of the data, as well as confidentiality. The most commonly used authenticated modes are **GCM** and **CCM**, which should be used as a first preference."
- Fallback ohne AEAD braucht separate Authentifizierung:
  > „If GCM or CCM are not available, then CTR mode or CBC mode should be used. As these do not provide any guarantees about the authenticity of the data, separate authentication should be implemented, such as using the Encrypt-then-MAC technique."
- ECB:
  > „[ECB] should not be used outside of very specific circumstances."
- IV/Nonce-Handling liegt bei der Bibliothek:
  > „Some of the modes have requirements to generate secure initialization vectors (IVs) and other attributes, but these should be handled automatically by the library."
- Keine Eigenbau-Kryptografie:
  > „Custom Algorithms — Don't do this."
- Schlüssel müssen unabhängig sein:
  > „Where multiple keys are used (such as data separate data-encrypting and key-encrypting keys), they should be fully independent from each other."
- Rotation muss auch die **Nutzungsgrenzen des Modus** berücksichtigen:
  > „Before reaching the usage limits of the selected encryption mode. Enforce the mode's limits on message size, encryption operations, and initialization vector (IV) uniqueness across all instances sharing the key. Block size alone does not determine a safe data-volume limit. For example, AES-GCM has separate requirements for input lengths and IV construction in [NIST SP 800-38D, Sections 5.2.1.1 and 8]."
- Schlüsselspeicher — die zentrale, ehrliche Einschränkung:
  > „Securely storing cryptographic keys is one of the hardest problems to solve, as the application always needs to have some level of access to the keys in order to decrypt the data. While it may not be possible to fully protect the keys from an attacker who has fully compromised the application, a number of steps can be taken to make it harder for them to obtain the keys."
- Konkrete Verbote beim Schlüsselspeicher:
  > „Do not hard-code keys into the application source code." / „Do not check keys into version control systems." / „Protect the configuration files containing the keys with restrictive permissions." / „Avoid storing keys in environment variables, as these can be accidentally exposed through functions such as `phpinfo()` or through the `/proc/self/environ` file."

**NIST SP 800-38D (GCM/GMAC)** — <https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf>
(November 2007, Morris Dworkin; im Volltext gelesen)

- Die Einleitung warnt unmissverständlich:
  > „An important caution to the use of GCM is that a breach of the requirement in Sec. 8 for the uniqueness of the initialization strings may compromise the security assurance almost entirely, as detailed in Ref. [5] and summarized in Appendix A. Therefore, this mode of operation should not be deployed unless compliance with this uniqueness requirement is ensured."
- Was bei IV-Wiederverwendung konkret passiert (Appendix A):
  > „In particular, if IVs are ever repeated for the GCM authenticated encryption function for a given key, then it is likely that an adversary will be able to determine the hash subkey from the resulting ciphertexts. The adversary then could easily construct a ciphertext forgery."
  > „Worse, the loss of authentication means that GCM inherits the problematic malleability of its Counter mode ciphertext."
- **Das 2^32-Limit, wörtlich, §8.3 „Constraints on the Number of Invocations":**
  > „The following requirement applies to all implementations that use either 1) the deterministic construction with IVs whose length is not 96, or 2) the RBG-based construction, for IVs of any length. In other words, unless an implementation only uses 96-bit IVs that are generated by the deterministic construction:
  > **The total number of invocations of the authenticated encryption function shall not exceed 2^32, including all IV lengths and all instances of the authenticated encryption function with the given key.**"
- Das Limit ist ausdrücklich ein *globales* Budget, das durch lokale Limits pro Instanz erfüllt werden kann:
  > „This is a „global" requirement that can be achieved by appropriate „local" limits on each instance of the authenticated encryption function with a given key."
- Zusätzliche Obergrenze auf das Datenvolumen (Appendix B):
  > „Therefore, the total number of blocks of plaintext and AAD that are protected by invocations of the authenticated encryption function during the lifetime of the key should be limited. A reasonable limit for most applications would be 2^64, consistent with the requirement on the number of invocations in Sec. 8.3."
- GCM schützt **nicht** gegen Replay (Appendix D):
  > „In other words, GCM, like many other authentication mechanisms, does not inherently prevent an adversary from intercepting the output of an invocation of authenticated encryption and „replaying" it for authenticated decryption at a later time."

**Wichtige Präzisierung zum 2^32-Limit (Fehlinterpretation vermeiden):**
Das Limit gilt, *sofern* nicht ausschließlich 96-Bit-IVs aus der **deterministischen** Konstruktion verwendet
werden. Wer also — wie in der Praxis üblich und wie von OWASP empfohlen — **zufällige** 96-Bit-IVs
(RBG-based construction nach §8.2.2) einsetzt, fällt **unter** das 2^32-Limit. OWASP formuliert genau das:

**OWASP Key Management Cheat Sheet** — <https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html>

- > „**Usage-Based Rotation Limits**: Key rotation must account for usage volume in addition to calendar time. For example, when using Advanced Encryption Standard in Galois/Counter Mode (AES-GCM) with random 96-bit initialization vectors (IVs), limit each key to at most `2^32` (4,294,967,296) encryption operations across all devices sharing that key to limit IV-collision risk ([NIST SP 800-38D §8.3])".

**Nonce-Handling als Gegenbeispiel (wie es *richtig* gelöst wird):**
Die Signal-Double-Ratchet-Spezifikation zeigt die saubere Variante — Nonce muss nicht zufällig sein, wenn der
Schlüssel garantiert nur einmal benutzt wird:

- <https://signal.org/docs/specifications/doubleratchet/> (Revision 4, 2025-11-04), §3.1:
  > „Because each message key is only used once, the AEAD nonce may handled in several ways: fixed to a constant; derived from _mk_ alongside an independent AEAD encryption key; derived as an additional output from _KDF_CK()_; or chosen randomly and transmitted."

  Das ist der Kontrast zum serverseitigen Storage-Fall: Bei einem **langlebigen** Datenschlüssel, der viele
  Nachrichten verschlüsselt, ist die Nonce-Wiederverwendung das reale Risiko, und Zufall allein hat ein Budget.

### Was dagegen spricht / Unsicherheit

- **Der größte Schwachpunkt ist nie der Algorithmus, sondern der Schlüssel.** OWASP sagt selbst, dass ein
  vollständig kompromittiertes Anwendungssystem die Schlüssel prinzipiell preisgibt, weil die Anwendung sie
  zum Entschlüsseln braucht. Server-seitige Verschlüsselung schützt gegen *Speichermedien-, Backup- und
  Datenbank-Dump-Angriffe*, nicht gegen eine übernommene Anwendung. Siehe Abschnitt 4.
- **Umgebungsvariablen-Verbot ist im Container-/Bun-Alltag oft nicht praktikabel.** OWASP nennt das Verbot,
  empfiehlt aber gleichzeitig Key-Vaults; für ein Einzelnutzer-System ist die realistische Zwischenstufe
  „Schlüssel in Datei mit restriktiven Rechten, getrennt von der Datenbank" — das entspricht wörtlich der
  OWASP-Empfehlung, ist aber schwächer als ein HSM.
- **GCM vs. XChaCha20-Poly1305:** OWASP nennt GCM/CCM als erste Wahl; XChaCha20-Poly1305 (24-Byte-Nonce)
  entschärft das Nonce-Wiederverwendungsproblem strukturell, wird in den hier gelesenen OWASP-Cheat-Sheets
  aber **nicht als erste Wahl genannt**. Die Aussage „XChaCha20 ist von OWASP empfohlen" ist damit
  **nicht belegt**. In den hier gelesenen Primärquellen erscheint ChaCha20-Poly1305 nur als von OpenMLS
  unterstützte MLS-Ciphersuite (siehe Abschnitt 5c).
- **Post-Quanten-Lage:** OWASP weist ausdrücklich darauf hin, dass RSA und ECC (inkl. Curve25519) nicht
  post-quanten-sicher sind und verweist auf ML-KEM (FIPS 203), typischerweise hybrid. Für Daten, die
  Jahrzehnte vertraulich bleiben müssen, ist AES-256 allein (symmetrisch) der robustere Teil der Lösung —
  verwundbar ist der *Schlüsselaustausch*, nicht AES.
- **AES-GCM in JavaScript/Bun:** Ein reiner Software-GCM kann in JS nicht konstantzeitig sein. Die
  Nonce/IV-Fehler, die zählen, sind aber logisch (Wiederverwendung), nicht timing-basiert. Für
  Node/Bun ist `crypto.createCipheriv('aes-256-gcm', ...)` bzw. die WebCrypto-Implementierung des
  Laufzeitsystems die richtige Wahl. Ob eine konkrete Laufzeit-Version einen bestimmten
  Nicht-Extrahierbar-Status durchsetzt, ist **nicht belegt** (siehe 5a).

---

## 2. Umschlagverschlüsselung (Envelope Encryption): KEK/DEK-Trennung, Rewrapping vs. Re-Encryption, Cryptoperioden

### Empfehlung

1. **Zwei-Ebenen-Modell einführen, sofort:**
   - **DEK (Data Encryption Key):** ein zufälliger AES-256-Schlüssel **pro Workspace bzw. pro Chat**.
     Er verschlüsselt die tatsächlichen Nachrichten/Chunks.
   - **KEK (Key Encryption Key):** verschlüsselt („wrappt") die DEKs. Er liegt **räumlich getrennt**
     von den DEKs.
2. **Gespeichertes Format:** `{ alg_id, key_id, iv, ciphertext, tag }`. Der DEK selbst wird nur als
   „Wrapped DEK" zusammen mit `kek_id` gespeichert.
3. **Rewrapping ist die billige Operation, Re-Encryption die teure.** Beim Wechsel des KEK werden nur die
   DEKs neu gewrappt — Ciphertexte bleiben unangetastet. Beim Wechsel eines DEK muss der gesamte
   zugehörige Ciphertext neu verschlüsselt werden.
4. **Konsequenz für das Design:** DEK pro Workspace/Chat (nicht pro Nachricht) macht KEK-Rotation billig
   und DEK-Rotation teuer; DEK pro Nachricht macht beides teuer. Für ein Kleingruppen-System ist
   **DEK pro Chat/Workspace** der richtige Kompromiss.
5. **Kryptoperioden explizit dokumentieren**, nicht implizit lassen. OWASP nennt als repräsentative Werte
   für symmetrische Datenschlüssel: bis zu **2 Jahre** für allgemeine Anwendungen mit niedrigem Volumen,
   aber **in der Größenordnung eines Tages bis einer Woche** für Systeme mit hohem Volumen; Empfänger-
   Nutzung (Entschlüsselung) typischerweise nicht mehr als **3 Jahre** über die Erzeuger-Nutzungsperiode
   hinaus. Für ein Kleingruppen-System ist eine Kombination sinnvoll: **zeitbasiert (z. B. jährlich)** plus
   **nutzungsbasiert (Zähler für GCM-Operationen, Grenze deutlich unter 2^32)** plus **ereignisbasiert
   (Verdacht auf Kompromittierung, Personenwechsel)**.
6. **Alten Schlüssel nach Rotation nicht sofort löschen** — alte Backups müssen noch entschlüsselbar sein.
7. **KEK mindestens so stark wie DEK.** Der DEK kann zusätzlich aus einer Nutzer-Passphrase abgeleitet
   werden, damit sich der KEK bei Passphrase-Wechsel ändern lässt, ohne die Daten neu zu verschlüsseln.

### Belege

**OWASP Cryptographic Storage Cheat Sheet** — <https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html>

- Die KEK/DEK-Definition wörtlich:
  > „Where possible, encryption keys should themselves be stored in an encrypted form. At least two separate keys are required for this:
  > - The Data Encryption Key (DEK) is used to encrypt the data.
  > - The Key Encryption Key (KEK) is used to encrypt the DEK.
  >
  > For this to be effective, the KEK must be stored separately from the DEK. The encrypted DEK can be stored with the data, but will only be usable if an attacker is able to also obtain the KEK, which is stored on another system."
- Stärkeverhältnis und Passphrase-Variante:
  > „The KEK should also be at least as strong as the DEK."
  > „A key derivation function (KDF) could be used to generate a KEK from user-supplied input (such a passphrase), which would then be used to encrypt a randomly generated DEK. This allows the KEK to be easily changed (when the user changes their passphrase), without needing to re-encrypt the data (as the DEK remains the same)."
- Ehrliche Einschränkung bei fehlender Trennung:
  > „In simpler application architectures (such as shared hosting environments) where the KEK and DEK cannot be stored separately, there is limited value to this approach, as an attacker is likely to be able to obtain both of the keys at the same time."
- **Rewrapping vs. Re-Encryption — die entscheidende Stelle:**
  > „**Handling Existing Encrypted Data (Envelope Encryption)**: To retire a Key Encryption Key (KEK), re-wrap stored Data Encryption Keys (DEKs) under the replacement KEK before destroying the old one. **Rewrapping leaves the DEKs unchanged and does not reset their cryptoperiods or usage limits.** Replacing a DEK for existing ciphertext requires re-encrypting that data."
- Zwei Strategien bei der Rotation:
  > „There are two main approaches for how existing data that was encrypted with the old key(s) should be handled:
  > 1. Decrypting it and re-encrypting it with the new key.
  > 2. Marking each item with the ID of the key that was used to encrypt it, and storing multiple keys to allow the old data to be decrypted.
  >
  > The first option should generally be preferred, as it greatly simplifies both the application code and key management processes; however, it may not always be feasible. Note that old keys should generally be stored for a certain period after they have been retired, in case old backups of copies of the data need to be decrypted."

**OWASP Key Management Cheat Sheet** — <https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html>

- Definition Kryptoperiode:
  > „A cryptoperiod is the time span during which a specific cryptographic key is authorized for use. Limiting cryptoperiods restricts the amount of data protected by a single key and reduces the window of exposure if a key is compromised ([NIST SP 800-57 Part 1 Rev. 5] Section 5.3)."
- Repräsentative Kryptoperioden (OWASP-Wiedergabe von NIST SP 800-57 Part 1 Rev. 5 §5.3.6):
  > „**Symmetric Data Encryption Keys**: Originator usage (encrypting new data) should be capped at up to 2 years for general low-volume applications, or on the order of a day or a week for high-volume or link-encryption systems ([NIST SP 800-57 Part 1 Rev. 5] §5.3.6, item 6(b)). Recipient usage (decryption) should typically be limited to no more than 3 years beyond the originator usage period."
  > „**Key Establishment Keys**: Static key-agreement pairs typically have an originator cryptoperiod of up to 1 to 2 years; ephemeral pairs are used for a single key-agreement transaction."
- Rewrapping nochmals aus Key-Management-Sicht:
  > „**Handling Existing Encrypted Data (Envelope Encryption)**: To retire a Key Encryption Key (KEK), re-wrap stored Data Encryption Keys (DEKs) under the replacement KEK before destroying the old one. Rewrapping leaves the DEKs unchanged and does not reset their cryptoperiods or usage limits."
- Key Encryption Keys:
  > „Symmetric key-wrapping keys are used to encrypt other keys using symmetric-key algorithms. Key-wrapping keys are also known as key encrypting keys."
  > „When encrypting keys for storage or distribution, always encrypt a cryptographic key with another key of equal or greater cryptographic strength."
- Ein Schlüssel, ein Zweck:
  > „According to NIST, in general, a single key should be used for only one purpose (e.g., encryption, authentication, key wrapping, random number generation, or digital signatures)."
  > „1. The use of the same key for two different cryptographic processes may weaken the security provided by one or both of the processes. 2. Limiting the use of a key limits the damage that could be done if the key is compromised."
- Kryptografische Operationen im Modul, nicht im Anwendungscode:
  > „All cryptographic operations (such as key generation, encryption, decryption, and digital signing) should be performed inside the isolated cryptographic security module boundary so that plaintext key material is never exposed outside the module."
  > „Ensure that standard application level code never reads or uses raw cryptographic keys in any way and use key management libraries."
- Rotation automatisieren:
  > „**Automated Rotation**: Prefer automated key rotation using Key Management Services (KMS) or automated certificate management protocols (such as Automated Certificate Management Environment (ACME)) to reduce operational error and ensure timely updates."
- Löschen / Zeroization — **wichtig für Bun/Node/Go/Rust:**
  > „**Software Memory**: Overwriting key material is best-effort in managed runtimes, where copies can survive in garbage-collected memory, immutable strings, or swapped-out pages. Use platform secure-memory or zeroization APIs where available."
  > „**Cryptographic Erasure**: For encrypted key material at rest, consider cryptographic erasure only when all copies of the protecting keys can be destroyed and no recoverable plaintext copies of the target material remain (NIST SP 800-88 Rev. 2 Section 3.2). **Destroying a wrapping key does not erase plaintext copies of the keys it protected.**"

**NIST SP 800-57 Part 1 Rev. 5** — <https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final>

Diese Publikation ist die von OWASP referenzierte Primärquelle für Kryptoperioden. **Einschränkung, die
hier offengelegt werden muss:** Der NIST-Primärtext (PDF) wurde in dieser Recherche **nicht** im Volltext
gelesen und verifiziert. Die konkreten Zahlenwerte (2 Jahre / 1 Tag bis 1 Woche / 3 Jahre) stammen aus der
**wörtlichen Wiedergabe durch OWASP**, die NIST SP 800-57 Part 1 Rev. 5 §5.3.6, item 6(b) als Quelle nennt.
Die NIST-PDF ist über die genannte URL erreichbar; die Zahlen sollten vor einer Produktiventscheidung am
Primärtext gegengelesen werden.

### Was dagegen spricht / Unsicherheit

- **Rewrapping ist nicht gratis.** OWASP stellt ausdrücklich klar, dass Rewrapping die Kryptoperiode und die
  Nutzungsgrenzen der DEKs **nicht zurücksetzt**. Wer einen kompromittierten DEK „durch KEK-Rotation
  reparieren" will, irrt: Nur Re-Encryption hilft.
- **KEK/DEK-Trennung ist bei Einzelnutzer-Selbsthosting oft nur nominell.** Wenn Anwendung, KEK und
  Ciphertext auf derselben Maschine mit demselben Nutzerkonto liegen, ist der Zusatznutzen gering —
  OWASP sagt das selbst („limited value to this approach"). Der echte Gewinn entsteht erst, wenn der KEK
  auf einem *anderen* System oder in Hardware liegt.
- **Der „Prozess vor dem Bedarf"-Punkt ist der praktisch schwierigste.** OWASP:
  > „It is important that the code and processes required to rotate a key are in place **before** they are required, so that keys can be quickly rotated in the event of a compromise."
  Ohne vorher gebauten Rotationspfad ist eine Notfallrotation ein Datenmigration-Projekt.
- **Backup-/Escrow-Frage ist ungelöst und muss entschieden werden.** OWASP Key Management:
  > „Data that has been encrypted with lost cryptographic keys will never be recovered. Therefore, it is essential that the application incorporate a secure key backup capability, especially for applications that support data at rest encryption for long-term data stores."
  Für ein Einzelnutzer-System heißt das: Wo liegt das KEK-Backup? Diese Entscheidung hat direkte
  Sicherheitsfolgen und ist nicht durch Technik abnehmbar.
- **Kryptoperioden sind Richtwerte, keine Norm.** OWASP betont: „Organizations should define cryptoperiods
  through risk assessment in accordance with NIST SP 800-57 Part 1 Rev. 5." Im Einzelnutzer-Kontext ist
  die Bedrohungslage anders als im Enterprise-Betrieb; die NIST-Zahlen sind Orientierung, nicht Vorschrift.

---

## 3. Krypto-Agilität: Was ist das und warum ist sie Pflicht?

### Empfehlung

1. **Krypto-Agilität heißt: das System kann den Algorithmus wechseln, ohne die Daten zu verlieren.**
   Konkret bedeutet das: jedes Chiffrat trägt die Information, *wie* und *womit* es verschlüsselt wurde.
2. **Pflichtfelder pro gespeichertem Chiffrat (Envelope-Header):**
   - `alg_id` — Algorithmus- und Modus-Kennung (z. B. `AES-256-GCM`), versioniert
   - `key_id` — ID des verwendeten DEK
   - `kek_id` — ID des KEK, der diesen DEK gewrappt hat
   - `iv` / `nonce` — pro Chiffrat
   - `tag` — Authentifizierungs-Tag (bei AEAD)
   - `v` — Formatversion des Envelopes selbst (Header-Schema kann sich ändern)
3. **Key-ID pro Chiffrat ist der entscheidende Mechanismus.** OWASP nennt genau zwei Strategien bei der
   Rotation, und die zweite ist die Key-ID-Variante. Ohne Key-ID pro Chiffrat ist die *einzige* Option
   „alles neu verschlüsseln" — ein Ausfall- und Migrationsrisiko, genau dann, wenn es eilig ist.
4. **Vorbereitung vor dem Bedarf:** Der Rotationspfad und der Algorithmuswechsel-Pfad müssen **vor** dem
   Kompromittierungsfall existieren und getestet sein.
5. **Für Schicht-2/3-Protokolle (HPKE, MLS) gilt eine Besonderheit:** Die Algorithmus-IDs sind dort
   teilweise **implizit** und werden nicht im Chiffrat transportiert. Die Anwendung muss sie dann selbst
   mitführen — siehe Belege unten. Das ist ein häufiger Agilitäts-Fallstrick.
6. **Version nicht mit Algorithmus verwechseln:** Neben `alg_id` braucht es eine Envelope-Formatversion,
   sonst blockiert jede Header-Erweiterung die Migration.

### Belege

**OWASP Cryptographic Storage Cheat Sheet** — <https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html>

- Krypto-Agilität explizit gefordert:
  > „It is important that the code and processes required to rotate a key are in place **before** they are required, so that keys can be quickly rotated in the event of a compromise. **Additionally, processes should also be implemented to allow the encryption algorithm or library to be changed, in case a new vulnerability is found in the algorithm or implementation.**"
- Key-ID pro Chiffrat als Rotationsstrategie:
  > „2. Marking each item with the ID of the key that was used to encrypt it, and storing multiple keys to allow the old data to be decrypted."
- Rotationskriterium „Algorithmus kompromittiert":
  > „If there is a significant change to the security provided by the algorithm (such as a new attack being announced). — Once one of these criteria have been met, a new key should be generated and used for encrypting any new data."
- Post-Quanten-Migration als Agilitätsfall:
  > „Where post-quantum key establishment is required, use a supported protocol or library integration of a standardized mechanism such as **[ML-KEM (NIST FIPS 203)]**, typically in a hybrid construction alongside a classical algorithm during migration. […] Include the public-key protection of stored encryption keys in the migration plan."

**OWASP Key Management Cheat Sheet** — <https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html>

- Eindeutige Schlüsselidentifikation ist ein Accountability-Prinzip:
  > „1. Uniquely identifying keys. 2. Identifying the key user. 3. Identifying the dates and times of key use, along with the data that is protected. 4. Identifying other keys that are protected by a symmetric or private key."
- Key-IDs und Datenmigration werden ausdrücklich an den Crypto-Storage-Cheat-Sheet delegiert:
  > „For key IDs and data-migration choices, see the [Cryptographic Storage Cheat Sheet]."
- Kein Klartext-Schlüsselmaterial:
  > „Keys should never be stored in plaintext format."
  > „4. Keys should never be stored in plaintext format."

**RFC 9180 (HPKE)** — <https://www.rfc-editor.org/rfc/rfc9180.html> (IRTF, Informational, Februar 2022)

Die entscheidende Agilitäts-Feinheit — Algorithmus-IDs sind in HPKE **implizit**, nicht im Chiffrat:

> „The HPKE algorithm identifiers, i.e., the KEM `kem_id`, KDF `kdf_id`, and AEAD `aead_id` 2-byte code points, as defined in Tables 2, 3, and 5, respectively, are **assumed implicit from the implementation and not passed as parameters**. The implicit `suite_id` value used within `LabeledExtract` and `LabeledExpand` is defined based on them as follows:"

Auch die Domain-Separation hängt an der ID:

> „The implicit `suite_id` value used within `LabeledExtract` and `LabeledExpand` is defined as follows, where `kem_id` is defined in Section 7.1: `suite_id = concat("KEM", I2OSP(kem_id, 2))`"

**Schlussfolgerung (als Schlussfolgerung gekennzeichnet):** Wer HPKE einsetzt und die Algorithmus-IDs nicht
selbst im eigenen Envelope-Header mitführt, hat in der Praxis *keine* Krypto-Agilität: Nach einem
Algorithmuswechsel kann alte gespeicherte Daten nicht mehr eindeutig zugeordnet werden. Das ist genau das
Problem, das OWASP mit „Marking each item with the ID of the key that was used" adressiert.

**RFC 9420 (MLS)** — <https://www.rfc-editor.org/rfc/rfc9420.html>, §16 (Security Considerations), zur
Zukunftssicherheit von Ciphersuiten:

> „[…] is no more than 2^-128. Any future cipher suite MUST use an AE1-secure AEAD algorithm."

**RFC 9750 (MLS Architecture)** — <https://www.rfc-editor.org/rfc/rfc9750.html> (Informational, April 2025)

> „Another important consideration is the ease of redistributing new keys on client compromise, which helps recovering security faster in various cases."

### Was dagegen spricht / Unsicherheit

- **Krypto-Agilität wird fast immer unterschätzt, weil sie im Normalbetrieb unsichtbar ist.** Sie kostet
  Header-Bytes pro Chiffrat und etwas Komplexität in jedem Lese-/Schreibpfad. Der Nutzen zeigt sich
  ausschließlich im Notfall. Das ist ein klassisches Aufwand-Nutzen-Ungleichgewicht, das dazu verleitet,
  sie wegzulassen.
- **OWASP fordert Algorithmuswechsel, gibt aber kein Datenformat vor.** Die konkreten Feldnamen,
  Versionierungsstrategie und Migrationslogik sind **nicht belegt** — hier gibt es keine Primärquelle, die
  ein bestimmtes Header-Schema normiert. Der Envelope-Header muss selbst entworfen werden.
- **Agilität ohne Test ist wertlos.** Ein `alg_id`-Feld, das nie ein anderer Wert als der erste war, ist
  ungetesteter Code. Die wiederkehrende Rotation (z. B. jährlich) ist auch ein *Test* des Rotationspfads.
- **Rekursive Verschlüsselung ist real:** Wenn KEK-Rotation und DEK-Rotation und Algorithmuswechsel
  gleichzeitig nötig sind, muss die Reihenfolge definiert sein (`old_alg`-Daten mit `old_key` unter
  `new_kek` lesen können). Diese Reihenfolge ist in den gelesenen Quellen **nicht belegt** und muss selbst
  festgelegt und getestet werden.

---

## 4. Grenzen serverseitiger Verschlüsselung: „Encryption at rest does not protect against SQL injection / application compromise"

### Empfehlung

Diese Aussage ist **sinngemäß richtig und in OWASP-Dokumentation belegt — aber nicht in dieser wörtlichen
Formulierung.** Die ehrliche Formulierung für die eigene Dokumentation lautet:

> Server-seitige Verschlüsselung im Ruhezustand schützt gegen Angriffe auf das Speichermedium
> (Diebstahl, Backup-Abzug, Offline-Dump), **nicht** gegen eine kompromittierte Anwendung: Wer die
> Anwendung kontrolliert, kontrolliert typischerweise auch die Entschlüsselungsfähigkeit und damit die
> Klartextdaten. Verschlüsselung ersetzt keine Zugriffskontrolle und keine Eingabevalidierung.

Für die Praxis folgt daraus: Verschlüsselung im Ruhezustand ist eine **Reduktionsmaßnahme für
Datenabfluss**, kein **Schutz gegen Anwendungsübernahme**. SQL-Injection-Abwehr ist eine eigene,
unabhängige Schicht.

### Belege

**Wörtliche Formulierung „encryption at rest does not protect against SQL injection":**
In den für diese Recherche gelesenen OWASP-Seiten **nicht belegt**. Diese exakte Aussage konnte nicht als
Zitat nachgewiesen werden. Belegt sind jedoch vier funktional äquivalente OWASP-Aussagen:

**Beleg 1 — OWASP Cryptographic Storage Cheat Sheet, „Where to Perform Encryption"**
(URL: <https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html>):

> „Which layer(s) are most appropriate will depend on the threat model. **For example, hardware level encryption is effective at protecting against the physical theft of the server, but will provide no protection if an attacker is able to compromise the server remotely.**"

**Beleg 2 — derselbe Cheat Sheet, „Key Storage"** (die zentrale Kapitulationserklärung):

> „Securely storing cryptographic keys is one of the hardest problems to solve, **as the application always needs to have some level of access to the keys in order to decrypt the data. While it may not be possible to fully protect the keys from an attacker who has fully compromised the application**, a number of steps can be taken to make it harder for them to obtain the keys."

**Beleg 3 — derselbe Cheat Sheet, „Separation of Keys and Data"** (SQL Injection wird ausdrücklich als
Angriffsvektor genannt, gegen den die Trennung — nicht die Verschlüsselung — wirkt):

> „Where possible, encryption keys should be stored in a separate location from encrypted data. For example, if the data is stored in a database, the keys should be stored in the filesystem. **This means that if an attacker only has access to one of these (for example through directory traversal or SQL injection), they cannot access both the keys and the data.**"

Dies ist der wichtigste Beleg: OWASP behandelt **SQL Injection ausdrücklich als realen Angriffsvektor**,
und die Gegenmaßnahme ist die **räumliche Trennung von Schlüssel und Daten** — nicht die Verschlüsselung
selbst. Damit ist implizit belegt, dass Verschlüsselung ohne Schlüsseltrennung gegen SQL Injection
**nichts** hilft: Liegen Schlüssel und Ciphertext in derselben Datenbank, liefert eine SQL-Injection beide.

**Beleg 4 — derselbe Cheat Sheet, „Defense in Depth"** (Verschlüsselung als *zusätzliche* Schicht):

> „Applications should be designed to still be secure even if cryptographic controls fail. Any information that is stored in an encrypted form should also be protected by additional layers of security. Application should also not rely on the security of encrypted URL parameters, and should enforce strong access control to prevent unauthorized access to information."

**Ergänzender Beleg — OWASP Kubernetes Security Cheat Sheet** (dieselbe Logik eine Ebene tiefer,
URL: <https://cheatsheetseries.owasp.org/cheatsheets/Kubernetes_Security_Cheat_Sheet.html>):

> „This helps protect secrets against read access to etcd or backups, but **does not protect them if an attacker also obtains the decryption keys.**"

### Was dagegen spricht / Unsicherheit

- **Die Grenze ist nicht binär.** Verschlüsselung im Ruhezustand reduziert den Schaden eines
  *Offline*-Abzugs auf null und den Schaden einer *Online*-Übernahme auf nahezu null, **sofern** die
  Schlüssel nicht im selben Vertrauensbereich liegen. Die pauschale Aussage „bringt nichts" wäre zu stark
  und ist durch die Belege nicht gedeckt.
- **Bei Einzelnutzer-Selbsthosting ist Beleg 3 praktisch schwer umzusetzen.** Wenn App, KEK und PostgreSQL
  auf demselben Host unter demselben Konto laufen, ist die Trennung nominell. Eine echte Trennung
  erfordert getrennte Systeme oder eine externe Key-Management-Komponente. Das ist ein realer
  Architektur- und Betriebsaufwand, der gegen den Nutzen abgewogen werden muss.
- **OWASP gibt keine Garantie, sondern eine Reduktion.** Alle Formulierungen sind probabilistisch
  („make it harder", „may not be possible to fully protect"). Es gibt hier keine Zusage, nur eine
  Risikoverringerung. Das gilt es in der eigenen Dokumentation genauso zu formulieren.
- **Zusätzliche Lücke, die aus den Belegen folgt, aber nicht ausdrücklich adressiert wird:** Schlüssel,
  die sich im Arbeitsspeicher des Anwendungsprozesses befinden, sind über einen Prozess-Kompromiss,
  Core-Dumps und Swap erreichbar. OWASP adressiert das nur im Key-Management-Cheat-Sheet über
  „Memory Management Considerations" („Keys stored in memory for a long time can become „burned in"") und
  relativiert es für verwaltete Laufzeiten. Für Bun/Node gilt: Klartextschlüssel im JS-Heap sind nicht
  zuverlässig löschbar — das ist belegt (siehe Abschnitt 2, Zeroization-Beleg), aber die *Konsequenz* für
  ein konkretes Bedrohungsmodell ist eine eigene Bewertung.

---

## 5. Echte Ende-zu-Ende-Verschlüsselung im Web: Was ist heute realistisch?

### 5a. WebCrypto API: Was sie kann, was sie NICHT kann

#### Empfehlung

WebCrypto ist der **richtige Baustein**, aber die Erwartungshaltung muss korrigiert werden:

1. **WebCrypto liefert Primitive, kein Protokoll.** Sie ist ausdrücklich nicht dafür gedacht, dass man
   darauf ein eigenes Verschlüsselungsprotokoll baut; die Spezifikation rät davon ausdrücklich ab.
2. **WebCrypto schützt nicht gegen XSS.** Ein Skript-Injektions-Angriff ist laut Spezifikation
   „the equivalent to remote code execution". Wer XSS hat, hat die Schlüssel *und* den Klartext —
   unabhängig davon, ob der Schlüssel extrahierbar ist, denn die Angreiferin kann die
   `decrypt`-Operation einfach selbst aufrufen.
3. **`extractable: false` ist eine Skript-Schranke, keine Speichergarantie.** Der Schutz besteht darin,
   dass `exportKey`/`wrapKey` fehlschlagen. Die Spezifikation gibt **keine** Zusage über die
   Speicherung des Schlüsselmaterials.
4. **`SubtleCrypto` ist nur in Secure Contexts verfügbar.** Eine Self-Hosted-App auf reinem HTTP hat
   kein WebCrypto (außer localhost). Das ist für ein selbstgehostetes Harness ein realer Stolperstein.
5. **Der vom Server ausgelieferte JavaScript-Code ist die Vertrauensgrenze und bleibt es.** Die
   Spezifikation sagt: Skript-Injektion kann zur Exfiltration von Schlüsseln oder Daten führen. Ein
   Server, der JS ausliefert, kann per Definition beim nächsten Seitenaufruf anderen Code ausliefern.
   Das ist **strukturell**, nicht behebbar durch API-Nutzung.
6. **Für die Praxis:** Wenn der Vertrauensgegenstand „der Server" ist, ist E2EE im Browser
   bedeutungslos. Wenn der Vertrauensgegenstand „der Speicher/das Backup, aber nicht der Betreiber
   zur Laufzeit" ist, ist WebCrypto sinnvoll — aber dann muss die Web-App als *angreifbare* Komponente
   modelliert werden, und der Sicherheitsgewinn kommt aus der **Schlüsselherkunft** (Passphrase/Out-of-Band),
   nicht aus der API.

#### Belege

**W3C Web Cryptography API Level 2, Editor's Draft vom 11. August 2026**
URL: <https://w3c.github.io/webcrypto/>

- §6.2 „Security considerations for authors" — **Skript-Injektion = RCE-Äquivalent:**
  > „In order to use the APIs defined in this specification to provide any meaningful cryptographic assurances, authors must be familiar with existing threats to web applications, as well as the underlying security model employed. **Conceptually, issues such as script injection are the equivalent to remote code execution in other operating environments, and allowing hostile script to be injected may allow for the exfiltration of keys or data.** Script injection may come from other applications, for which the judicious use of Content Security Policy may mitigate, or it may come from hostile network intermediaries, for which the use of Transport Layer Security may mitigate."
- §6.2 — **keine Garantie über die Schlüsselspeicherung:**
  > „Authors should be aware that this specification places no normative requirements on implementations as to how the underlying cryptographic key material is stored. **The only requirement is that key material is not exposed to script, except through the use of the `exportKey` and `wrapKey` operations.** In particular, **it does not guarantee that the underlying cryptographic key material will not be persisted to disk, possibly unencrypted, nor that it will be inaccessible to users or other applications running with the same privileges as the User Agent.** Any application or user that has access to the device storage may be able to recover the key material, even through scripts may be prohibited."
- §6.2 — **Schlüssel sind standardmäßig nur für die Lebensdauer der Seite gültig:**
  > „This specification does not define any specific mechanisms for the storage of cryptographic keys. By default, unless specific effort is taken by the author to persist keys, such as through the use of the Indexed Database API, keys created with this API will only be valid for the duration of the current page (e.g. until a navigation event). Authors that wish to use the same key across different pages or multiple browsing sessions must employ existing web storage technologies. Authors should be aware of the security assumptions of these technologies, such as the same-origin security model; that is, any application that shares the same scheme, host, and port have access to the same storage partition, even if other information, such as the path, may differ."
- §6.1 „Security considerations for implementers" — **gleiche Origin = gleicher Schlüssel:**
  > „Application authors rely upon this for the security of their applications; **two origins with the same `CryptoKey` object have full access to the underlying key**, and as such, messages from these applications cannot be distinguished, and messages sent to these applications can be fully recovered."
- §4.3 „Out of scope" — **keine Aussage über sichere Speicherung/Hardware:**
  > „This API, while allowing applications to generate, retrieve, and manipulate keying material, does not specifically address the provisioning of keys in particular types of key storage, such as secure elements or smart cards."
- §5.1 — Implementierung kann reine Software sein:
  > „While it is assumed that most user agents will be interacting with a cryptographic provider that is implemented purely in software, it is not required by this specification. As a result, the capabilities of some implementations may be limited by the capabilities of the underlying hardware, and, depending on how the user has configured the underlying cryptographic library, this may be entirely opaque to the User Agent."
- §4.2 — **kein verpflichtender Algorithmus-Satz:**
  > „[…] this specification does not dictate a mandatory set of algorithms that _MUST_ be implemented."
- §6.2 — **ausdrückliche Warnung vor eigenen Protokollen:**
  > „In general, application developers are **strongly** discouraged from inventing new cryptographic protocols; as with all applications, users of this specification will be best served through the use of existing protocols, of which this specification provides the necessary building blocks to implement."
- §6.2 — was der Autor selbst entscheiden muss:
  > „Authors may explicitly choose to relax this security through the use of inter-origin sharing, such as `postMessage`."

**MDN — `Crypto.subtle`** (zuletzt geändert 10. Oktober 2026)
URL: <https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle>

- > „**Secure context:** This feature is available only in secure contexts (HTTPS), in some or all supporting browsers."
- > „Baseline — Widely available. This feature is well established and works across many devices and browser versions. It's been available across browsers since September 2017."

**MDN — Secure contexts** (zuletzt geändert 14. September 2026)
URL: <https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts>

- > „A **secure context** is an environment such as a `Window` or `Worker` which meets a defined standard of authentication and confidentiality. Many Web APIs and features are accessible only in a secure context."
- > „Some APIs on the web are very powerful, giving an attacker the ability to do the following and more: Invade a user's privacy. Get low-level access to a user's computer. Get access to data such as user credentials. If these APIs were available to content that was not delivered over a secure connection, then a man in the middle (MITM) attacker would be able to access them."
- Potentially trustworthy origins (relevant für Self-Hosting):
  > „An origin is potentially trustworthy if has: A scheme of `https`, `wss`, or `file`. A host value of `127.0.0.0/8` or `::1/128`. A host value of `localhost` or `localhost.` […]"

#### Was dagegen spricht / Unsicherheit

- **Die Aussage „non-extractable Keys schützen nicht gegen XSS" ist eine Schlussfolgerung, kein Zitat.**
  Wörtlich belegt ist: (a) Skript-Injektion kann zur Exfiltration von Schlüsseln *oder Daten* führen,
  (b) Schlüsselmaterial ist Skript nicht zugänglich *außer* über `exportKey`/`wrapKey`.
  Die Schlussfolgerung, dass ein nicht-extrahierbarer Schlüssel trotzdem über `subtle.decrypt()`
  *benutzt* werden kann und damit nutzlos gegen einen aktiven Angreifer ist, folgt logisch aus (a)+(b),
  ist aber **nicht als Satz zitiert**. Sie sollte in der eigenen Dokumentation als Schlussfolgerung
  gekennzeichnet werden.
- **„Nicht-extrahierbar" hat trotzdem Wert**, und das sollte man nicht wegdiskutieren: Es verhindert den
  *stillen* Export und die Offline-Weiterverarbeitung des Schlüssels. Es hebt XSS nicht auf, erhöht aber
  den Aufwand für persistente Angriffe. Die gelesenen Quellen quantifizieren diesen Nutzen **nicht**.
- **Ob eine konkrete Browser-/Laufzeit-Implementierung nicht-extrahierbare Schlüssel tatsächlich in einem
  OS-Keychain oder Secure Element ablegt, ist nicht belegt.** Die Spezifikation lässt es ausdrücklich
  offen („places no normative requirements … nor that it will be inaccessible to users or other
  applications"). Jede Aussage wie „nicht-extrahierbare Schlüssel liegen im TPM" wäre für WebCrypto
  **nicht belegt**.
- **WebCrypto Level 2 ist ein Editor's Draft, kein Recommendation.** Der abgerufene Text ist als
  „W3C Editor's Draft, 11 August 2026" ausgewiesen, mit dem Hinweis: „This document is a draft document
  and may be updated, replaced, or obsoleted by other documents at any time. It is inappropriate to cite
  this document as other than a work in progress." Die Security-Considerations-Aussagen sind
  **non-normativ** („_This section is non-normative._"). Das mindert ihre Autorität als Beleg nicht,
  sollte aber korrekt eingeordnet werden.
- **Kein Schutz gegen einen Server, der Absicht ändert.** Das ist strukturell: Wer heute vertrauenswürdiges
  JS ausliefert, kann morgen bösartiges ausliefern. Die Spezifikation nennt dafür keine Lösung — CSP und
  TLS mildern *fremde* Injektion, nicht *eigene* Absicht. Diese Grenze ist fundamental und nicht
  durch WebCrypto behebbar.

---

### 5b. Signal-Protokoll (X3DH / Double Ratchet): Leistung, Spezifikationsstand, Web-Probleme

#### Empfehlung

1. **Nicht selbst implementieren.** X3DH + Double Ratchet ist ein Protokoll mit langer Analyse-Historie,
   veröffentlichten Revisionen und formalen Sicherheitsbeweisen. Die WebCrypto-Spezifikation rät
   ausdrücklich von eigenen Protokollen ab. Eine Eigenimplementierung ist ein hohes Risiko ohne
   entsprechenden Nutzen.
2. **Wenn Signal-Protokoll, dann über die Bibliothek:** Die Signal-Dokumentationsseite verweist als
   Software-Bibliothek auf `libsignal`. Für eine TypeScript/Bun/React-Umgebung ist die Verfügbarkeit
   einer gepflegten JS/WASM-Bindung von `libsignal` die **entscheidende Vorabfrage** — diese Frage ist in
   dieser Recherche **nicht belegt** (die Signal-Doku-Seite nennt nur das Repository, keine
   Sprachbindungs-Übersicht).
3. **Das Web-spezifische Hauptproblem ist der Schlüsselspeicher, nicht das Protokoll.** Das Protokoll
   verlangt persistente, langlebige private Identitätsschlüssel und Session-State. Im Browser gibt es
   dafür nur IndexedDB/OPFS, und die WebCrypto-Spezifikation garantiert ausdrücklich **nicht**, dass
   nicht-extrahierbares Material sicher liegt. Damit sind die privaten Identitätsschlüssel im Web
   strukturell schwächer geschützt als in einer nativen App.
4. **Mehrgeräte/Prekeys/Session-Management sind der unterschätzte Aufwand**, nicht die Krypto.
5. **Für ein Einzelnutzer-System ist Signal-Protokoll fast immer Überkonstruktion:** Bei einem Nutzer mit
   mehreren Geräten gibt es keine „zwei Parteien" — die relevante Frage ist Geräte-Synchronisation, nicht
   Ratcheting. Für Kleingruppen ist MLS (5c) das passendere Modell.

#### Belege

**Signal-Dokumentationsübersicht** — <https://signal.org/docs/>

Verzeichnete Spezifikationen (Stand des Abrufs): XEdDSA/VXEdDSA, **X3DH**, **PQXDH**,
**Double Ratchet**, **Sesame**, **ML-KEM Braid**. Als Software-Bibliothek wird genannt:
> „[Signal Protocol library](https://github.com/signalapp/libsignal)"

**X3DH Key Agreement Protocol** — <https://signal.org/docs/specifications/x3dh/>
(Revision 1, 2016-11-04, Moxie Marlinspike, Trevor Perrin (editor)). **Hinweis: Revision 1 von 2016 —
seitdem keine neue Revision auf dieser Seite.** Der aktuelle Signal-Stand für den Schlüsselaustausch
ist PQXDH (siehe unten), das X3DH um Post-Quanten-Komponenten erweitert.

- Leistungsumfang:
  > „X3DH establishes a shared secret key between two parties who mutually authenticate each other based on public keys. X3DH provides forward secrecy and cryptographic deniability."
- Asynchronität / Offline-Empfänger:
  > „X3DH is designed for asynchronous settings where one user („Bob") is offline but has published some information to a server."
- Prekeys:
  > „Bob also has a signed prekey _SPKB_, which he will change periodically, and a set of one-time prekeys _OPKB_, which are each used in a single X3DH protocol run. („Prekeys" are so named because they are essentially protocol messages which Bob publishes to the server _prior_ to Alice beginning the protocol run)."
- Server-Verhalten bei Prekey-Ausgabe:
  > „The server should provide one of Bob's one-time prekeys if one exists, and then delete it. If all of Bob's one-time prekeys on the server have been deleted, the bundle will not contain a one-time prekey."
- **Authentifizierung ist die Voraussetzung — ohne sie keine Garantie:**
  > „Before or after an X3DH key agreement, the parties may compare their identity public keys _IKA_ and _IKB_ through some authenticated channel. For example, they may compare public key fingerprints manually, or by scanning a QR code. Methods for doing this are outside the scope of this document.
  > **If authentication is not performed, the parties receive no cryptographic guarantee as to who they are communicating with.**"
- Server-Vertrauen (die belastbare Aussage über die Grenzen des Servers):
  > „A malicious server could cause communication between Alice and Bob to fail (e.g. by refusing to deliver messages).
  > **If Alice and Bob authenticate each other as in Section 4.1, then the only additional attack available to the server is to refuse to hand out one-time prekeys**, causing forward secrecy for _SK_ to depend on the signed prekey's lifetime (as analyzed in the previous section)."
- Identity Misbinding — **die Authentifizierung löst das Identitätsproblem nicht vollständig:**
  > „Authentication as in Section 4.1 **does not necessarily prevent an „identity misbinding" or „unknown key share" attack.**"
  > „However, **there is no way to reliably prevent Charlie from lying about additional values**, and including more identity information into the protocol often brings trade-offs in terms of privacy, flexibility, and user interface."
- Deniability:
  > „X3DH doesn't give either Alice or Bob a publishable cryptographic proof of the contents of their communication or the fact that they communicated."
- Replay / Key Reuse (harte Anforderung an das Folgeprotokoll):
  > „For this reason, any post-X3DH protocol MUST randomize the encryption key before Bob sends encrypted data. […] **Failure to randomize Bob's encryption key may cause catastrophic key reuse.**"

**PQXDH Key Agreement Protocol** — <https://signal.org/docs/specifications/pqxdh/>

- Was PQXDH leistet — und was ausdrücklich *nicht*:
  > „PQXDH establishes a shared secret key between two parties who mutually authenticate each other based on public keys. **PQXDH provides post-quantum forward secrecy and a form of cryptographic deniability but still relies on the hardness of the discrete log problem for mutual authentication in this revision of the protocol.**"
- Post-Quanten-KEM als Parameter:
  > „_pqkem_ — A post-quantum key encapsulation mechanism that has IND-CCA post-quantum security (e.g. Crystals-Kyber-1024)"
- Server-Vertrauen (identisch zur X3DH-Argumentation):
  > „A malicious server could cause communication between Alice and Bob to fail (e.g. by refusing to deliver messages). If Alice and Bob authenticate each other as in Section 4.1, then the only additional attack available to the server is to refuse to hand out one-time prekeys, causing forward secrecy for SK to depend on the signed prekey's lifetime"
- Identity Binding (dieselbe Einschränkung wie X3DH):
  > „Authentication as in Section 4.1 does not necessarily prevent an „identity misbinding" or „unknown key share" attack."
- Die Spezifikation enthält die Abschnitte „4.11. Risks of weak randomness sources", „4.12 Preventing KEM Re-encapsulation Attacks" und „4.13. Key Identifiers" (Abschnittstitel aus dem Inhaltsverzeichnis verifiziert).

**Double Ratchet Algorithm** — <https://signal.org/docs/specifications/doubleratchet/>
(**Revision 4, 2025-11-04** — deutlich aktuell; Autoren Trevor Perrin (editor), Moxie Marlinspike,
Rolfe Schmidt (revision 3+))

- Leistung:
  > „The parties derive new keys for every Double Ratchet message so that earlier keys cannot be calculated from later ones. The parties also send Diffie-Hellman public values attached to their messages. The results of Diffie-Hellman calculations are mixed into the derived keys so that later keys cannot be calculated from earlier ones. These properties gives some protection to earlier or later encrypted messages in case of a compromise of a party's keys."
- Die drei Ketten und ihre Garantien:
  > „**Resilience:** The output keys appear random to an adversary without knowledge of the KDF keys. […] **Forward security:** Output keys from the past appear random to an adversary who learns the KDF key at some point in time. **Break-in recovery:** Future output keys appear random to an adversary who learns the KDF key at some point in time, provided that future inputs have added sufficient entropy."
- Nonce-Handling (§3.1, zitierter Beleg in Abschnitt 1 dieses Berichts):
  > „Because each message key is only used once, the AEAD nonce may handled in several ways: fixed to a constant; derived from _mk_ alongside an independent AEAD encryption key; derived as an additional output from _KDF_CK()_; or chosen randomly and transmitted."
- Empfohlene Algorithmen (§7.2): X25519/X448 (RFC 7748), HKDF mit SHA-256/512, KDF_CK über HMAC mit SHA-256/512, ENCRYPT über SIV oder **AES-256-CBC mit HMAC**; für hybrid-post-quanten Sicherheit **ML-KEM Braid** als SCKA-Protokoll.
- **Kompromiss ist verheerend (§8.2):**
  > „Despite this mitigation, **a compromise of secret keys or of device integrity will have a devastating effect on the security of future communications.**"
  > „If a party suspects its keys or devices have been compromised, it must replace them immediately."
- **Harvest-Now-Decrypt-Later — die aktuelle (2025) Motivation für PQ (§8.11):**
  > „The primary motivation for introducing post-quantum ratcheting today is protection against adversaries who compromise devices today, record encrypted communications, and wait for cryptographically relevant quantum computers. **Against such adversaries, classical Double Ratchet healing provides no protection—all recorded messages remain vulnerable regardless of subsequent Diffie-Hellman based key rotation.**"
- Skalierungs-/DoSS-Falle bei übersprungenen Nachrichten (§8.4):
  > „A malicious sender could induce recipients to store large numbers of skipped message keys, possibly causing denial-of-service due to consuming storage space."
  > „To mitigate the first risk parties should set reasonable per-session limits on the number of skipped message keys that will be stored (e.g. 1000)."
- Implementierungs-Fingerprinting (§8.7) — relevant für Web-Apps:
  > „If this protocol is used in settings with anonymous parties, care should be taken that implementations behave identically in all cases. In an anonymous context, implementations are advised to follow the algorithms from Sections 3 and 4 precisely. Such implementations are also advised to use identical limits for the number of skipped message keys stored, and identical deletion policies for skipped message keys. **Deletion policies should be based on deterministic events (e.g. messages received), rather than time.**"
- Post-Quanten-Bausteine: „5. The Sparse Post-Quantum Ratchet", „6. The Triple Ratchet: combining Secure Messaging protocols for hybrid security"; die Triple-Ratchet-Hybridisierung verweist auf ePrint 2025/078 (<https://eprint.iacr.org/2025/078>) und ML-KEM Braid (<https://signal.org/docs/specifications/mlkembraid/>).

#### Was dagegen spricht / Unsicherheit

- **Die Web-spezifischen Probleme sind in den Signal-Spezifikationen selbst nicht adressiert.** Die
  Spezifikationen sind protokoll- und plattformneutral formuliert. Aussagen wie „Session-State in
  IndexedDB ist ein Problem" oder „Prekey-Verwaltung im Browser ist unpraktisch" sind
  **Schlussfolgerungen aus den Spezifikationsanforderungen kombiniert mit der WebCrypto-Lage**,
  **nicht belegt** als Zitate aus Signal-Dokumentation.
- **`libsignal`-Bindings für TypeScript/Bun/React sind in dieser Recherche nicht belegt.** Die
  Signal-Doku-Seite nennt nur `<https://github.com/signalapp/libsignal>`. Welche Sprachen offiziell
  unterstützt werden und ob es eine gepflegte JS/WASM-Bindung gibt, wurde **nicht verifiziert**. Das ist
  eine offene, entscheidungskritische Frage (siehe „Nicht belegt / offene Punkte").
- **X3DH ist Revision 1 von 2016.** Wer X3DH als „aktuellen Stand" bezeichnet, ist ungenau: Für den
  Schlüsselaustausch ist PQXDH die neuere, post-quanten-erweiterte Variante. Das ist ein belegbarer
  Unterschied und in der eigenen Dokumentation korrekt zu benennen.
- **Double Ratchet Revision 4 (2025-11-04) enthält Post-Quanten-Konstruktionen (SPQR, Triple Ratchet,
  ML-KEM Braid), die noch jung sind.** Die Spezifikation selbst verweist auf 2025er-Papers
  (ePrint 2025/078, „How to compare two-party secure messaging protocols", 2025). Diese Teile haben
  deutlich weniger Analyse-Historie als der klassische Double Ratchet. **Konkrete Produktionsreife-
  Aussagen dazu sind nicht belegt.**
- **Der Server sieht mehr, als man bei „E2EE" erwartet.** X3DH/PQXDH setzen einen Server voraus, der
  Prekey-Bundles und Nachrichten speichert; die Spezifikationen beschreiben Angriffe eines *bösartigen*
  Servers, aber die Metadaten-Sicht ist nicht Gegenstand von X3DH/Double Ratchet — siehe Sesame (5d) und
  Abschnitt 5e.
- **Ein-Personen-System vs. Protokoll-Passung:** Bei einem einzelnen Nutzer mit mehreren Geräten gibt es
  keine zweite Partei, gegen die man sich per X3DH authentifiziert. Die Sicherheitsgewinne von X3DH
  („mutual authentication based on public keys") adressieren ein Problem, das in diesem Szenario anders
  aussieht (Geräte-Synchronisation). Das ist eine **Bewertung**, gestützt auf die belegten
  Protokollanforderungen.

---

### 5c. MLS / RFC 9420: Gruppen-Messaging — Stand, Implementierungen, Web/JS/WASM

#### Empfehlung

1. **Für „Kleingruppen-Chats" ist MLS das konzeptionell richtige Modell.** RFC 9420 ist ein
   **Standards-Track-RFC (Juli 2023)** — keine Draft-Bastelei. Es löst genau das Problem, das
   Zwei-Parteien-Protokolle bei Gruppen nicht sauber lösen: asynchrone Gruppen-Schlüsseletablierung mit
   Forward Secrecy **und** Post-Compromise Security für Gruppen „von zwei bis tausenden".
2. **Der Delivery Service (DS) ist Teil des Designs, nicht ein Unfall.** Metadaten-Leckage an den DS ist
   in RFC 9420 ausdrücklich dokumentiert. Wer MLS einsetzt, muss die DS-Sicht bewusst designen
   (Client-Fanout vs. Server-Fanout, PrivateMessage vs. PublicMessage).
3. **Handshake-Nachrichten als `PrivateMessage` senden, nicht als `PublicMessage`** — das ist eine
   konkrete, aus dem RFC ableitbare Designentscheidung mit direktem Privacy-Effekt.
4. **Rust-Implementierung: OpenMLS** ist die etablierte Referenz (RFC-9420-konform, gepflegt von
   Phoenix R&D und CE Labs, Stand Oktober 2026 aktiv).
5. **Für die Web/React-Oberfläche: WASM ist möglich, aber nicht „supported".** OpenMLS hat ein
   `js`-Feature, das die Kompilierung zu WASM aktiviert, und `wasm32-unknown-unknown` wird in der CI
   **gebaut, aber nicht getestet**. Das ist ein **wesentlicher Vorbehalt**, der in der
   Architekturentscheidung explizit stehen muss: WASM ist ein *Build-Ziel*, kein *unterstütztes Ziel*.
6. **Konsequenz für die Architektur:** Die MLS-Logik in Rust/Go halten (Server oder native Komponente),
   den Browser nur als Transport/UI nutzen — oder WASM einsetzen und die Testlücke selbst schließen
   (eigene Test-Suite gegen das WASM-Target). Die erste Variante ist risikoärmer und für ein
   Einzelnutzer-/Kleingruppen-System ausreichend.

#### Belege

**RFC 9420 — The Messaging Layer Security (MLS) Protocol**
<https://www.rfc-editor.org/rfc/rfc9420.html> · Text: <https://www.rfc-editor.org/rfc/rfc9420.txt>
**Kategorie: Standards Track.** Autoren: R. Barnes (Cisco), B. Beurdouche (Inria & Mozilla),
R. Robert (Phoenix R&D), J. Millican (Meta Platforms), E. Omara, K. Cohn-Gordon (University of Oxford).
**Datum: Juli 2023.**

- Abstract — Leistungsumfang und Gruppengröße:
  > „In this document, we specify a key establishment protocol that provides efficient asynchronous group key establishment with forward secrecy (FS) and post-compromise security (PCS) for groups in size ranging from two to thousands."
- §16.4.1 „GroupID, Epoch, and Message Frequency" — **der DS sieht Gruppenzugehörigkeit und Aktivität:**
  > „**MLS provides no mechanism to protect the group ID and epoch of a message from the DS, so the group ID and the frequency of messages and epoch changes are not protected against inspection by the DS.** However, any modifications to these will cause decryption failure."
- §16.4.3 „Group Membership" — **Mitgliedschaft ist nicht verborgen:**
  > „The group's membership is represented directly by its ratchet tree, since each member's LeafNode contains members' cryptographic keys, a credential that contains information about the member's identity, and possibly other identifiers. **Applications that expose the group's ratchet tree outside the group also leak the group's membership.**"
  > „If these proposals are sent as PublicMessage, then information will be leaked about the corresponding changes to the group's membership. **A party that sees all of these changes can reconstruct the group membership.**"
  > „Welcome messages contain a hash of each KeyPackage for which the Welcome message is encrypted. If a party has access to a pool of KeyPackages and observes a Welcome message, then they can identify the KeyPackage representing the new member. If the party can also associate the Welcome with a group, then the party can infer that the identified new member was added to that group."
  > „Note that these information leaks reveal the group's membership only to the degree that membership is revealed by the contents of a member's LeafNode in the ratchet tree. In some cases, this may be quite direct, e.g., due to credentials attesting to identifiers such as email addresses. An application could construct a member's leaf node to be less identifying, e.g., by using a pseudonymous credential and frequently rotating encryption and signature keys."
- §16.4 preamble — **explizite Liste der nicht geschützten Felder:**
  > „**MLS does not provide confidentiality protection to some messages and fields within messages:** — KeyPackage messages — […] — Group membership"
  > „The amount of metadata exposed to parties outside the group, and thus the ability of these parties to infer the group's properties, depends on several aspects of the DS design, such as: How KeyPackages are distributed. How the ratchet tree is distributed."
- §16.4.2 „Group Extensions":
  > „A GroupContextExtensions proposal sent as a PublicMessage leaks the group's extensions."
- §16.5 „Authentication" — **Signature Keys sind der kritische Punkt:**
  > „The first form of authentication we provide is that group members can verify a message originated from one of the members of the group. […] The second form of authentication is that group members can verify a message originated from a particular member of the group. This is guaranteed by a digital signature on each message from the sender's signature key."
  > „**The signature keys held by group members are critical to the security of MLS against active attacks. If a member's signature key is compromised, then an attacker can create LeafNodes and KeyPackages impersonating the member**; depending on the application, this can then allow the attacker to join the group with the compromised member's identity."
  > „Applications can mitigate the risks of signature key compromise using pre-shared keys. If a group requires joiners to know a PSK in addition to authenticating with a credential, then in order to mount an impersonation attack, the attacker would need to compromise the relevant PSK as well as the victim's signature key."
- §16.6 „Forward Secrecy and Post-Compromise Security" — die Definitionen:
  > „**Forward secrecy means that messages sent at a certain point in time are secure in the face of later compromise of a group member. Post-compromise security means that messages are secure even if a group member was compromised at some point in the past.**"
- Application message vs. Handshake message (PrivateMessage/PublicMessage im Fließtext):
  > „PrivateMessage represents a signed and encrypted message, with protections for both the content of the message and related metadata. PublicMessage represents a message that is only signed, and not encrypted. **Applications MUST use PrivateMessage to encrypt application messages and SHOULD use PrivateMessage to encode handshake messages, but they MAY transmit handshake messages encoded as PublicMessage objects in cases where it is necessary for the Delivery Service to examine such messages.**"

**RFC 9750 — The Messaging Layer Security (MLS) Architecture**
<https://www.rfc-editor.org/rfc/rfc9750.html> · Text: <https://www.rfc-editor.org/rfc/rfc9750.txt>
**Kategorie: Informational.** Autoren: B. Beurdouche (Inria & Mozilla), E. Rescorla, E. Omara,
S. Inguva, A. Duric. **Datum: April 2025.**

- Abstract:
  > „The Messaging Layer Security (MLS) protocol (RFC 9420) provides a group key agreement protocol for messaging applications."
- §6.4 — Handshake-Verschlüsselung als Privacy-Entscheidung:
  > „While MLS application messages are always encrypted, MLS handshake messages can be sent either encrypted (in an MLS PrivateMessage) or unencrypted (in an MLS PublicMessage). Applications may be designed such that intermediaries need to see handshake messages, for example to enforce policy on which commits are allowed, or to provide MLS ratchet tree data in a central location. **If handshake messages are unencrypted, it is especially important that they be sent over a channel with strong transport encryption** […] **Everything else being equal, using encrypted handshake messages provides stronger privacy properties than using unencrypted handshake messages, as it prevents intermediaries from learning about the structure of the group.**"
- §8.4.3.2 „Privacy of the Group Membership" — **Metadaten-Leckage im Server-Fanout, ausdrücklich
  als „serious issue for privacy" bewertet:**
  > „Group membership is itself sensitive information, and MLS is designed to limit the amount of persistent metadata. However, large groups often require an infrastructure that provides server fanout. In the case of client fanout, the destination of a message is known by all clients; hence, the server usually does not need this information. **However, servers may learn this information through traffic analysis. Unfortunately, in a server-side fanout model, the Delivery Service can learn that a given client is sending the same message to a set of other clients.** In addition, there may be applications of MLS in which the group membership list is stored on some server associated with the DS.
  > **While this knowledge is not a breach of the protocol's authentication or confidentiality guarantees, it is a serious issue for privacy.**"
  > „Some infrastructures keep a mapping between keys used in the MLS protocol and user identities. An attacker with access to this inf[ormation] …"

**OpenMLS** — <https://github.com/openmls/openmls> (abgerufen Oktober 2026; jüngster Commit
12. Oktober 2026; jüngstes Release **v0.9.0, 25. August 2026**)

- Was es ist:
  > „_OpenMLS_ is a Rust implementation of the Messaging Layer Security (MLS) protocol, as specified in [RFC 9420]. It is a software library that can serve as a building block in applications that require end-to-end encryption of messages. It has a safe and easy-to-use interface that hides the complexity of the underlying cryptographic operations."
- **Unterstützte Ciphersuiten (vollständige Liste):**
  > „- MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519 (MTI)
  > - MLS_128_DHKEMP256_AES128GCM_SHA256_P256
  > - MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519"
  Damit ist belegt: die **MTI-Suite (Mandatory To Implement) ist AES128GCM** — nicht AES-256.
- **Unterstützte Plattformen („built and tested on the Github CI"):**
  > „x86_64-unknown-linux-gnu, x86_64-pc-windows-msvc, aarch64-apple-darwin, aarch64-unknown-linux-gnu"
- **Der entscheidende WASM-Vorbehalt — wörtlich:**
  > „### Unsupported, but built on CI
  > The Github CI also builds (but doesn't test) the following rust targets.
  > […] wasm32-unknown-unknown […]"
- WASM-Feature vorhanden:
  > „Features — **js**: enable compilation to wasm"
- Repository-Verzeichnis `openmls-wasm` existiert (im Datei-Baum der Repo-Ansicht gelistet).
- Krypto-Primitive werden nicht selbst implementiert:
  > „OpenMLS does not implement its own cryptographic primitives. Instead, it relies on existing implementations of the cryptographic primitives used by MLS. There are two different cryptography providers implemented right now. But consumers can bring their own implementation."
- Pflege und Anforderungen:
  > „OpenMLS is maintained and developed by [Phoenix R&D] and [CE Labs]."
  > Rust-Version: „rustc 1.94+"; Lizenz MIT; ~1,0k Stars, 194 Forks, 310 abhängige Projekte (Stand Abruf).

#### Was dagegen spricht / Unsicherheit

- **WASM ist kein unterstütztes Ziel von OpenMLS.** Das ist der wichtigste belegte Vorbehalt. Die
  Formulierung „built (but doesn't test)" ist eindeutig. Eine Aussage wie „OpenMLS läuft im Browser" ist
  **nicht belegt**; belegt ist „kompiliert für `wasm32-unknown-unknown` in der CI, ohne Tests".
  Konkrete Performance-, Speicher- oder Korrektheitsdaten für MLS in WASM sind **nicht belegt**.
- **Nur drei Ciphersuiten, MTI ist AES-128-GCM.** Wer AES-256 oder eine post-quanten-hybride MLS-Suite
  will, findet das in der OpenMLS-Ciphersuiten-Liste **nicht** — die Aussage „OpenMLS unterstützt
  Post-Quanten-MLS" ist damit **nicht belegt**. Ob es dafür andere Implementierungen gibt, wurde in
  dieser Recherche **nicht** geprüft.
- **Andere MLS-Implementierungen wurden nicht geprüft.** Die Aufgabe nennt Web/JS/WASM und OpenMLS
  exemplarisch. Ob es etablierte, gepflegte MLS-Implementierungen mit offizieller WASM-Unterstützung
  gibt (z. B. aus der MLS-Interop-Landschaft), ist in dieser Recherche **nicht belegt**. Es gibt
  Hinweise auf eine Interop-Szene (OpenMLS enthält ein Verzeichnis `interop_client` und ein
  `compat_tests`-Verzeichnis), aber eine belastbare Liste von Produktions-Implementierungen wurde
  **nicht** erhoben.
- **MLS löst explizit nicht das Metadaten-Problem.** RFC 9420 §16.4.1 und RFC 9750 §8.4.3.2 sind hier
  eindeutig. Wer MLS einsetzt und „Metadaten-Verbergung" verspricht, macht eine durch die RFCs widerlegte
  Aussage.
- **Der Authentication Service (AS) ist ein Vertrauenskonzentrationspunkt.** RFC 9750 §8.4.3.2
  empfiehlt ausdrücklich Key Transparency **und** Out-of-Band-Authentifizierung, um den Einfluss eines
  AS-Kompromisses zu begrenzen. Ohne diese beiden Maßnahmen ist die Identitätsprüfung so stark wie das
  AS — und das AS ist typischerweise Teil derselben Web-App.
- **Added complexity is real.** MLS bringt Epochs, Ratchet Trees, Welcome-Nachrichten, Proposal/Commit,
  ReInit, externe Joins, PSKs, Credentials. Für ein Einzelnutzer-System mit gelegentlichen
  Kleingruppen ist das ein erheblicher Komplexitäts- und Betriebsaufwand — und Komplexität ist selbst
  ein Sicherheitsrisiko.

---

### 5d. Mehrgeräte-Problem und Schlüsselverteilung: Wie lösen etablierte Systeme das?

#### Empfehlung

1. **Mehrgeräte ist ein eigenständiges, hartes Problem — nicht ein Anhang zum Ratcheting.**
   Signal widmet ihm eine eigene Spezifikation (Sesame). Die Kernfrage lautet: Wie konvergiert man auf
   *eine* Session pro entferntem Gerät, wenn Geräte hinzukommen, wegfallen, neu installiert oder aus
   Backups wiederhergestellt werden?
2. **Kernmechanismus von Sesame übernehmen:** jedes Gerät führt pro entferntem Gerät eine „aktive"
   Session und wechselt die aktive Session, wenn auf einer „inaktiven" Session eine Nachricht empfangen
   wird. Das ist ein einfaches, robustes Konvergenz-Verfahren.
3. **Geräteverifikation muss out-of-band erfolgen und muss bei Schlüsselwechsel wiederholt werden.**
   Beide Signal-Spezifikationen (X3DH §4.1, PQXDH §4.10, Sesame §6.1) sagen übereinstimmend: Ohne
   Authentifizierung gibt es keine kryptografische Garantie über die Identität des Gegenübers.
   Der Mechanismus ist Fingerprint-Vergleich oder QR-Code-Scan.
4. **Explizite Key-Change-Behandlung im UI einbauen.** Sesame §6.1 fordert: Bei Änderung eines
   Identity-Keys **muss** die Authentifizierung wiederholt werden, sonst gibt es keine Garantie.
   Praktisch heißt das: Warnung anzeigen, Senden/Empfangen pausieren, bis der Nutzer bestätigt.
5. **Key Transparency ist der richtige, aber noch nicht fertige Weg.** RFC 9750 empfiehlt sie
   ausdrücklich für den AS. Der IETF-Draft ist aber **noch kein RFC** (Stand: In Last Call, Informational).
   Wer sie jetzt baut, baut gegen einen sich bewegenden Standard.
6. **Für ein Einzelnutzer-System ist die pragmatische Antwort:**
   - Ein Nutzer mit N Geräten braucht **Gerätesynchronisation**, nicht Peer-Authentifizierung.
   - Die ehrliche Lösung ist ein **vom Nutzer gehaltener Master-Key** (aus Passphrase abgeleitet, oder
     per QR von Gerät zu Gerät übertragen), der die Workspace-/Chat-Keys umhüllt. Neue Geräte werden
     per QR-Transfer oder Passphrase autorisiert.
   - Das ist *nicht* MLS und *nicht* Signal-Protokoll, sondern **Envelope Encryption mit nutzerseitigem
     Root** — einfacher, auditierbarer und dem Bedrohungsmodell angemessen.

#### Belege

**Sesame: Session Management for Asynchronous Message Encryption**
<https://signal.org/docs/specifications/sesame/> (**Revision 2, 2017-04-14**, Moxie Marlinspike,
Trevor Perrin (editor)). **Hinweis: Revision 2 von 2017 — die Spezifikation ist seit 2017 unverändert.**

- Zweck:
  > „This document describes the Sesame algorithm for managing message encryption sessions in an asynchronous multi-device setting. Sesame was designed to manage Double Ratchet sessions created with X3DH key agreement."
- **Das Mehrgeräte-Problem wörtlich:**
  > „Alice and Bob might each have several devices, so encrypting a message from Alice to Bob might require creating sessions from Alice's sending device to **all of Bob's devices, and also to Alice's other devices** (so they receive a copy of the message).
  > Alice and Bob might add and remove devices, so they will have to add and delete sessions to handle these changes.
  > Alice and Bob might simultaneously initiate a new session with each other, so that two new sessions are created.
  > For the Double Ratchet to be maximally effective Alice and Bob must send and receive messages using matching sessions, so somehow they must agree on which matching sessions to use.
  > Alice might choose to erase her device's session state, or restore from a backup, thus causing either her or Bob to possess orphaned sessions which no longer match one of the other party's sessions."
- Der Konvergenz-Kernmechanismus:
  > „A central idea is for each device to keep track of an „active" session for each other device it is communicating with, and use the active session when sending to that device. When a message is received on an „inactive" session, that becomes the new active session. By this process each device converges on using a single session for each remote device it communicates with."
- Server-Annahmen — **und die Metadaten-Sicht des Servers, wörtlich:**
  > „**Server** — There is a server which stores the current record of all users and devices. The server temporarily stores the messages that devices send to each other, until the messages are fetched."
  > „Users — At any point in time there is a set of users. […] Each user has a UserID (e.g. a username or phone number). After a user is deleted, its UserID can be taken by a new user."
  > „Devices — At any point in time each user has a nonempty set of devices. […] Each device has a DeviceID which is unique for the UserID."
  > „Mailboxes — The server stores a mailbox for each device. […] Devices can send messages to other devices' mailboxes. **The server stores the sending device's UserID and DeviceID alongside the message.**"
- **Geräteverifikation und Key-Change-Behandlung, §6.1 wörtlich:**
  > „Sesame relies on users to authenticate identity public keys with their correspondents. For example, a pair of users might compare public key fingerprints for all their devices manually, or by scanning a QR code. The details of authentication methods are outside the scope of this document. **If authentication is not performed, users receive no cryptographic guarantee as to who they are communicating with.**"
  > „A Sesame device might encounter a changed identity public key (or keys) for some remote user when sending, receiving, or resending messages. This might indicate that a new user is using the UserID, that the user re-installed the application, or that the user added new devices (if per-device identity keys are being used). **It might also indicate an attempt to impersonate the remote user by a malicious server, or by a malicious user who hijacked the original user's UserID.**"
  > „**Whenever a change in identity keys is detected users must repeat the authentication process or they will receive no cryptographic guarantee as to who they are communicating with.** A device may wish to pause (or abort) the sending, receiving, or resending processes if a key change occurs, and only continue (or restart) the process if the user affirmatively acknowledges the key change."
- Gerätekompromiss, §6.2:
  > „**Security is catastrophically compromised if an attacker learns a device's secret values, such as the identity private key and session state. Recovery from a device compromise requires the user to replace the compromised device and compromised identity key pair and notify all correspondents of the new public key.**"
  > „An attacker with a device's identity private key can impersonate the compromised device to other devices. An attacker who can compromise a device may be able to keep persistent backdoor access to the device, or tamper with it to reduce its future security (e.g. weakening the random number generator)."

**X3DH §4.1** (URL wie oben) — Geräte-/Identitätsverifikation als Out-of-Band-Vorgang:
> „Before or after an X3DH key agreement, the parties may compare their identity public keys _IKA_ and _IKB_ through some authenticated channel. For example, they may compare public key fingerprints manually, or by scanning a QR code. **Methods for doing this are outside the scope of this document.** If authentication is not performed, the parties receive no cryptographic guarantee as to who they are communicating with."

**RFC 9750 — Key Transparency als ausdrückliche Empfehlung** (<https://www.rfc-editor.org/rfc/rfc9750.html>, §8.4.3.2-Umfeld):

> „*Recommendation:* **Provide a key transparency mechanism for the AS to allow public verification of the credentials authenticated by this service.**"

> „While the ways to handle MLS credentials are not defined by the protocol or the architecture documents, the MLS protocol has been designed with a mechanism that can be used to provide out-of-band authentication to users. **The `authentication_secret` generated for each user at each epoch of the group is a one-time, per-client authentication secret which can be exchanged between users to prove their identities to each other. This can be done, for instance, using a QR code that can be scanned by the other parties.**
> *Recommendation:* **Provide one or more out-of-band authentication mechanisms to limit the impact of an AS compromise.**"

> „We note, again, that the AS may not be a centralized system and could be realized by many mechanisms such as establishing prior one-to-one deniable channels, gossiping, or using trust on first use (TOFU) for credentials used by the MLS protocol."

> „[…](log of state of the device so that the user can examine it.) *Recommendation:* Provide a key transparency mechanism for the AS […]"

**IETF Key Transparency — Status (Stand des Abrufs): noch kein RFC.**
URLs: <https://datatracker.ietf.org/doc/draft-ietf-keytrans-architecture/> ·
<https://datatracker.ietf.org/doc/draft-ietf-keytrans-protocol/> ·
<https://datatracker.ietf.org/wg/keytrans/>

Belegter Status:
- `draft-ietf-keytrans-architecture-10` — „Key Transparency Architecture", **Intended RFC status: Informational**, Responsible AD: Deb Cooley.
- Die IETF-Arbeitsgruppe keytrans listet: „**In Last Call (ends 2026-10-23)**" für `draft-ietf-keytrans-architecture-10` (26 Seiten). Ein früherer Stand `draft-ietf-keytrans-architecture-03` ist auf 20. Februar 2025 datiert (Informational, Expires 24. August 2025).
- Zusätzlich existiert `draft-ietf-keytrans-protocol-05` — „Key Transparency Protocol".

**Damit belegt:** Key Transparency ist zum Recherchezeitpunkt ein **Internet-Draft im Last Call**, **kein RFC**.
Die Aussage „Key Transparency ist standardisiert" wäre **nicht belegt**.

#### Was dagegen spricht / Unsicherheit

- **„Safety Numbers" sind in den gelesenen Signal-Spezifikationen nicht belegt.** Der Begriff erscheint
  in X3DH, PQXDH, Double Ratchet und Sesame **nicht**. Belegt ist der *Mechanismus* („compare public key
  fingerprints manually, or by scanning a QR code" — X3DH §4.1, Sesame §6.1). Die Aussage „Signal nutzt
  Safety Numbers zur Geräteverifikation" ist in dieser Recherche **nicht belegt**; belegt ist nur, dass
  die Spezifikationen Fingerprint-/QR-Vergleich als Mechanismus vorsehen und dass die Details
  „outside the scope" liegen. Signal-Produktdokumentation (nicht Spezifikation) wurde **nicht geprüft**.
- **Die Details der Geräteverifikation sind absichtlich außerhalb der Spezifikationen.** Sowohl X3DH
  §4.1 als auch Sesame §6.1 sagen das ausdrücklich („Methods for doing this are outside the scope of
  this document" / „The details of authentication methods are outside the scope of this document"). Das
  bedeutet: Diesen Teil muss man **selbst entwerfen** — es gibt keine Spezifikation, an die man sich halten
  kann. Das ist ein reales, oft unterschätztes Design- und UX-Problem.
- **Trust-on-First-Use (TOFU) ist bequem und schwach.** RFC 9750 nennt TOFU als eine mögliche
  Realisierung des AS, und Sesame §6.1 beschreibt die Warnung bei Key-Change — aber TOFU bedeutet
  strukturell: Der erste Kontakt ist ungeschützt. Wer TOFU einsetzt und „verifizierte Identitäten"
  behauptet, macht eine nicht gedeckte Aussage.
- **Sesame ist Revision 2 von 2017 und X3DH Revision 1 von 2016.** Diese beiden für Mehrgeräte und
  Schlüsselaustausch zentralen Spezifikationen sind die ältesten der gelesenen Signal-Dokumente. Der
  Double Ratchet wurde 2025 auf Revision 4 aktualisiert (mit Post-Quanten-Erweiterungen), Sesame und
  X3DH **nicht**. Ob es neuere interne Nachfolger für das Mehrgeräte-Management gibt, ist in dieser
  Recherche **nicht belegt**.
- **Ob Key Transparency in einer Einzelnutzer-/Kleingruppen-App überhaupt sinnvoll ist, ist eine offene
  Bewertung.** Key Transparency adressiert das Problem, dass ein *Server* gefälschte Schlüssel
  ausliefern könnte. Bei einem selbstgehosteten System für einen Nutzer ist der Server
  typischerweise derselbe Vertrauensbereich wie der Nutzer — der Angreifer, gegen den KT schützt, ist
  dann der Betreiber selbst, was das Bedrohungsmodell inkonsistent macht. Diese Bewertung stützt sich
  auf die belegte Funktion von KT („allow public verification of the credentials authenticated by this
  service") und die X3DH-Aussage über bösartige Server.
- **Der „alle Geräte"-Fanout skaliert nicht.** Sesame §2.1 beschreibt, dass eine Nachricht Sessions zu
  *allen* Geräten beider Parteien benötigt. Für ein Einzelnutzer-System mit 3–5 Geräten ist das
  handhabbar; für Kleingruppen skaliert es quadratisch. Das ist eine **Schlussfolgerung** aus der
  belegten Beschreibung, keine zitierte Zahl.

---

### 5e. Metadaten: Was verrät E2EE nicht?

#### Empfehlung

**In der eigenen Dokumentation und im UI muss der Metadaten-Rest klar benannt werden.** Die belegbare
Liste dessen, was auch mit korrekter E2EE sichtbar bleibt:

| Was sichtbar bleibt | Belegte Quelle |
|---|---|
| **Wer mit wem** (Geräte-/Nutzer-IDs an jeder Nachricht) | Sesame §2.2: „The server stores the sending device's UserID and DeviceID alongside the message." |
| **Wann** (Nachrichtenfrequenz, Epoch-Wechsel) | RFC 9420 §16.4.1: „the group ID and the frequency of messages and epoch changes are not protected against inspection by the DS" |
| **Gruppenzugehörigkeit / Mitgliedschaft** | RFC 9420 §16.4.3: „A party that sees all of these changes can reconstruct the group membership" |
| **Gruppen-ID und Epoch** | RFC 9420 §16.4.1 (wörtlich) |
| **Fanout-Muster: ein Absender → Menge von Empfängern** | RFC 9750 §8.4.3.2: „the Delivery Service can learn that a given client is sending the same message to a set of other clients" |
| **Zuordnung von MLS-Schlüsseln zu Nutzeridentitäten, wenn die Infrastruktur sie speichert** | RFC 9750 §8.4.3.2: „Some infrastructures keep a mapping between keys used in the MLS protocol and user identities." |
| **Replay ist nicht verhindert** | NIST SP 800-38D Appendix D: „GCM, like many other authentication mechanisms, does not inherently prevent an adversary from intercepting the output of an invocation of authenticated encryption and „replaying" it" |
| **Kompromittierte Geräte/Schlüssel zerstören die Garantie für die Zukunft** | Double Ratchet §8.2: „a compromise of secret keys or of device integrity will have a devastating effect on the security of future communications" |

Konkrete Empfehlungen, die daraus folgen:

1. **Kein Versprechen über Metadaten.** Formulierung wie „wir sehen nicht, wer mit wem schreibt" sind
   durch die RFCs widerlegt, wenn ein Server Nachrichten zustellt.
2. **PrivateMessage statt PublicMessage für MLS-Handshakes**, um Gruppenstruktur-Leaks gegenüber
   Zwischeninstanzen zu reduzieren (RFC 9420 + RFC 9750 §6.4).
3. **Client-Fanout statt Server-Fanout**, wo möglich (RFC 9750 §8.4.3.2: „In the case of client fanout,
   the destination of a message is known by all clients; hence, the server usually does not need this
   information.").
4. **Pseudonyme Credentials und rotierende Schlüssel in LeafNodes** erwägen (RFC 9420 §16.4.3:
   „An application could construct a member's leaf node to be less identifying, e.g., by using a
   pseudonymous credential and frequently rotating encryption and signature keys.").
5. **Keine Session-IDs/Query-Parameter, die Rückschlüsse erlauben**, an Stellen, die in Logs landen.

#### Belege

Alle Belege sind in der Tabelle oben mit wörtlichem Zitat und URL aufgeführt. Zusätzlich:

- **OWASP zum Metadaten-Aspekt:** In den gelesenen OWASP-Cheat-Sheets findet sich **keine** systematische
  Behandlung von Metadaten-Leckage bei E2EE. Die OWASP-**Defense-in-Depth**-Aussage ist die einzige
  anschlussfähige Stelle:
  > „Applications should be designed to still be secure even if cryptographic controls fail. Any information that is stored in an encrypted form should also be protected by additional layers of security."
  Darüber hinaus ist eine OWASP-Aussage zu Metadaten in E2EE **nicht belegt**.

#### Was dagegen spricht / Unsicherheit

- **Nachrichtenlänge: nicht belegt.** Die Aufgabe fragt ausdrücklich nach der Nachrichtenlänge. In
  RFC 9420, RFC 9750, den Signal-Spezifikationen und den gelesenen OWASP-Seiten wurde **keine wörtliche
  Aussage** gefunden, die Nachrichtenlängen-Leckage benennt. RFC 9420 §16.4.1 nennt ausdrücklich
  Nachrichten*frequenz*, nicht Länge. Eine Aussage wie „E2EE verbirgt die Nachrichtenlänge nicht" ist
  technisch plausibel (AEAD ist längenerhaltend), aber in den gelesenen Primärquellen **nicht belegt**
  und sollte entweder als Schlussfolgerung gekennzeichnet oder durch eine weitere Quelle belegt werden.
- **Die Metadaten-Liste ist nicht vollständig.** Sie enthält nur, was in den gelesenen Quellen wörtlich
  benannt ist. Weitere Leckagen (z. B. IP-Adressen der Peers bei P2P, Timing-Korrelation über
  Verbindungsaufbau, Geräte-Fingerprints, Zugriffszeiten) sind technisch zu erwarten, aber in den
  gelesenen Quellen **nicht belegt**. Für die eigene Bedrohungsanalyse sollten sie separat bewertet werden.
- **RFC 9750 lässt den DS-Spielraum offen.** Der RFC sagt ausdrücklich, dass das Ausmaß der Leckage
  „depends on several aspects of the DS design". Das bedeutet: Metadaten-Schutz ist eine
  **Anwendungsdesign-Aufgabe**, nicht eine Protokolleigenschaft. Es gibt keinen Schalter, den man umlegt.
- **OWASP deckt diesen Bereich nicht ab.** Wer Metadaten-Anforderungen belegen will, muss auf
  RFC 9420/RFC 9750 (MLS-Welt) oder Signal-Dokumentation zurückgreifen. Eine OWASP-Basis für
  E2EE-Metadaten ist **nicht belegt**.

---

## 6. „P2P" in einer Web-App: Was ist realistisch?

### Empfehlung

1. **„Browser-zu-Browser ohne Server" ist praktisch nicht möglich — und die WebRTC-Spezifikation sagt das
   selbst.** Es braucht immer einen Signaling-Kanal, und in vielen Netztopologien zusätzlich einen
   TURN-Relay, der den Datenverkehr sieht.
2. **Der DataChannel ist transportverschlüsselt (SCTP über DTLS), aber das ist keine
   Identitätsgarantie.** Die DTLS-Identität ist **nicht automatisch** an eine Nutzer- oder
   Anwendungsidentität gebunden. RFC 8827 sagt ausdrücklich, dass der Signaling-Server einen
   Man-in-the-Middle-Angriff fahren kann, wenn es keinen unabhängigen Mechanismus zur Schlüsselprüfung gibt.
3. **Wer WebRTC für „E2EE" hält, irrt.** DTLS schützt gegen *Dritte*, nicht gegen einen kompromittierten
   oder bösartigen Signaling-Server, solange nicht unabhängig verifiziert wird.
4. **Für die eigene Architektur ist P2P daher fast immer die falsche Antwort.** Für Chat + Workspaces
   mit Speicherung in PostgreSQL ist ein klassischer Server-vermittelter Transport (WebSocket/HTTP)
   einfacher, robuster, auditierbarer und in der Sicherheitsanalyse klarer. P2P/WebRTC löst ein Problem
   (niedrige Latenz für Medien), das hier nicht besteht, und führt neue Probleme ein (NAT, TURN,
   Signaling, Identity-Binding).
5. **Wenn WebRTC doch eingesetzt wird** (z. B. für Live-Sprachchat im Harness):
   - DataChannel nur als Transport nutzen und die **eigene** E2EE-Schicht darüber legen (MLS oder
     eigene Envelope-Logik), nicht DTLS als „fertige E2EE" verbuchen.
   - Die im RFC geforderte **Out-of-Band-Verifikation** (Fingerprint / Short Authentication String)
     im UI umsetzen, wenn Server-MITM aus dem Bedrohungsmodell ausgeschlossen werden soll.
   - `RTCDataChannel`-Schlüsselmaterial darf dem JS nicht zugänglich sein (RFC-Anforderung).

### Belege

**RFC 8827 — WebRTC Security Architecture**
<https://www.rfc-editor.org/rfc/rfc8827.html> · Text: <https://www.rfc-editor.org/rfc/rfc8827.txt>
**Kategorie: Standards Track.** Autor: E. Rescorla (Mozilla). **Datum: Januar 2021.**

- §3.1 „Authenticated Entities" — **DTLS-Identität als Authentifizierungsquelle, ausdrücklich ohne
  Vertrauenszusage:**
  > „There are two major classes of authenticated entities in the system:
  > **Calling services:** Web sites whose origin we can verify (optimally via HTTPS, but in some cases because we are on a topologically restricted network, such as behind a firewall, and can infer authentication from firewall behavior).
  > **Other users:** **WebRTC peers whose origin we can verify cryptographically (optimally via DTLS-SRTP).**
  > **Note that merely being authenticated does not make these entities trusted.** For instance, just because we can verify that <https://www.example.org/> is owned by Dr. Evil does not mean that we can trust Dr. Evil to access our camera and microphone."
- §3.2 „Unauthenticated Entities" — alles andere ist nicht vertrauenswürdig:
  > „Other than the above entities, we are not generally able to identify other network elements; thus, we cannot trust them. This does not mean that it is not possible to have any interaction with them, but it means that we must assume that they will behave maliciously and design a system which is secure even if they do so."
- §4.3 „DTLS Handshake" — **DataChannel ist SCTP über DTLS, und die Vertrauensgrenze hängt am IdP:**
  > „[…] This is performed via DTLS [RFC6347] and DTLS-SRTP [RFC5763] keying for SRTP [RFC3711] for the media channel and the **Stream Control Transmission Protocol (SCTP) over DTLS [RFC8261] for data channels.**"
  > „At this point, Alice and Bob know that they share a set of secure data and/or media channels with keys which are not known to any third-party attacker. **If Alice and Bob authenticated via their IdPs, then they also know that the signaling service is not mounting a man-in-the-middle attack on their traffic. Even if they do not use an IdP, as long as they have minimal trust in the signaling service not to perform a man-in-the-middle attack, they know that their communications are secure against the signaling service as well** (i.e., that the signaling service cannot mount a passive attack on the communications)."
- **Die entscheidende MITM-Aussage (§9.4-Umfeld wörtlich):**
  > „Even if HTTPS is used, **the signaling server can potentially mount a man-in-the-middle attack unless implementations have some mechanism for independently verifying keys.** The UI requirements in Section 6.5 are designed to provide such a mechanism for motivated/security conscious users, **but are not suitable for general use.**"
- §6.5 „Communications Security" — **die harten Anforderungen an den DataChannel-Schutz:**
  > „Implementations MUST support SRTP [RFC3711]. Implementations MUST support DTLS [RFC6347] and DTLS-SRTP [RFC5763] [RFC5764] for SRTP keying. Implementations MUST support SCTP over DTLS [RFC8261]."
  > „Implementations MUST favor cipher suites which support Forward Secrecy (FS) over non-FS cipher suites and SHOULD favor Authenticated Encryption with Associated Data (AEAD) over non-AEAD cipher suites."
  > „**API Requirement: When DTLS-SRTP is used, the API MUST NOT permit the JS to obtain the negotiated keying material. This requirement preserves the end-to-end security of the media.**"
  > „API Requirement: The API MUST generate a new authentication key pair for every new call by default. This is intended to allow for unlinkability."
  > „API Requirement: Unless the user specifically configures an external key pair, different key pairs MUST be used for each origin. (This avoids creating a super-cookie.)"
- §6.5 „UI Requirements" — **Out-of-Band-Verifikation ist vorgeschrieben, aber nur für motivierte Nutzer:**
  > „The „security characteristics" MUST indicate the cryptographic algorithms in use (for example, „AES-CBC"). […] The „security characteristics" MUST indicate whether FS is provided."
  > „The „security characteristics" **MUST include some mechanism to allow an out-of-band verification of the peer, such as a certificate fingerprint or a Short Authentication String (SAS). These are compared by the peers to authenticate one another.**"
- §7 „Web-Based Peer Authentication" — **Identität kommt aus einem separaten IdP, nicht aus DTLS:**
  > „Figure 1, but separates Alice's and Bob's identities from the process of signaling. Specifically, **Alice and Bob have relationships with some Identity Provider (IdP) that supports a protocol (such as OpenID Connect) that can be used to demonstrate their identity to other parties.**"
  > „This separation of identity provision and signaling isn't particularly important in „closed world" cases where Alice and Bob are users on the same social network and have identities based on that domain (Figure 3). However, there are important settings where that is not the case, such as federation (calls from one domain to […]"
  > „Note that the servers themselves are also authenticated by an external identity service, the SSL/TLS certificate infrastructure (not shown). As is conventional in the Web, **all identities are ultimately rooted in that system.**"

**MDN — Signaling and video calling** (zuletzt geändert 22. September 2026)
URL: <https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling>

- **Der Server ist strukturell notwendig:**
  > „WebRTC allows real-time, peer-to-peer, media exchange between two devices. A connection is established through a discovery and negotiation process called **signaling**."
  > „WebRTC is a fully peer-to-peer technology for the real-time exchange of audio, video, and data, **with one central caveat. A form of discovery and media format negotiation must take place, as discussed elsewhere, in order for two devices on different networks to locate one another. This process is called signaling and involves both devices connecting to a third, mutually agreed-upon server.** Through this third server, the two devices can locate one another, and exchange negotiation messages."
  > „**Establishing a WebRTC connection between two devices requires the use of a signaling server to resolve how to connect them over the internet.** A signaling server's job is to serve as an intermediary to let two peers find and establish a connection while minimizing exposure of potentially private information as much as possible."
- Der Signaling-Transport ist nicht normiert:
  > „WebRTC doesn't specify a transport mechanism for the signaling information. You can use anything you like, from WebSocket to `fetch()` to carrier pigeons to exchange the signaling information between the two peers."

**MDN — Introduction to WebRTC protocols** (zuletzt geändert 17. September 2026)
URL: <https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols>

- NAT/ICE/STUN/TURN — **der Relay-Fall, in dem ein Server den Verkehr leitet:**
  > „Interactive Connectivity Establishment (ICE) is a framework to allow your web browser to connect with peers. There are many reasons why a straight up connection from Peer A to Peer B won't work. It needs to bypass firewalls that would prevent opening connections, give you a unique address if like most situations your device doesn't have a public IP address, and relay data through a server if your router doesn't allow you to directly connect with peers. ICE uses STUN and/or TURN servers to accomplish this."
  > „Some routers using NAT employ a restriction called 'Symmetric NAT'. This means the router will only accept connections from peers you've previously connected to."
  > „**Traversal Using Relays around NAT (TURN)** is meant to bypass the Symmetric NAT restriction by **opening a connection with a TURN server and relaying all information through that server.** You would create a connection with a TURN server and tell all peers to send packets to the server which will then be forwarded to you. **This obviously comes with some overhead so it is only used if there are no other alternatives.**"

### Was dagegen spricht / Unsicherheit

- **DTLS ist kein Nichts.** Der DataChannel ist gegen passive Angreifer im Netz und gegen Dritte
  kryptografisch geschützt. RFC 8827 §4.3 sagt ausdrücklich, dass „keys which are not known to any
  third-party attacker" bestehen. Die Aussage „WebRTC ist unverschlüsselt" wäre falsch. Falsch ist nur
  die Aussage „DTLS = E2EE gegen den Serverbetreiber".
- **Die IdP-basierte Identität ist in RFC 8827 beschrieben, aber der Reifegrad ist unklar.** Der RFC
  enthält ein eigenes Kapitel „7.3. Items for Standardization" und verweist auf „the status of
  IdP-based authentication" — was impliziert, dass Teile zum Zeitpunkt des RFC noch nicht final
  standardisiert waren. **Was genau der aktuelle Stand der WebRTC-Identity-Mechanismen (2025/2026) ist,
  wurde in dieser Recherche nicht verifiziert und ist damit nicht belegt.**
- **`RTCDataChannel` kann `ordered`/`maxRetransmits` konfigurieren**, was Auswirkungen auf die
  Nachrichtenreihenfolge hat. Für einen auf E2EE aufbauenden Nachrichtenkanal ist das relevant
  (Reihenfolge, Duplikate, Verluste) — die Details wurden in dieser Recherche **nicht** geprüft.
- **NAT-Traversierung ist kein „manchmal"-Problem, sondern der Regelfall in Mobilfunknetzen.** MDN nennt
  Symmetric NAT als Bedingung für TURN; wie häufig das in der Praxis ist, wird von MDN **nicht
  quantifiziert**. Eine Prozentangabe wäre **nicht belegt**.
- **Der Signaling-Server sieht die Verbindungsmetadaten** (IP-Adressen über ICE-Kandidaten,
  wer mit wem spricht, wann). Das ist aus MDN ableitbar (ICE-Kandidaten enthalten IP und Port:
  „Each ICE message suggests a communication protocol (TCP or UDP), IP address, port number, connection
  type"). Eine wörtliche Aussage über die *Metadaten-Sicht des Signaling-Servers* wurde in den gelesenen
  Quellen jedoch **nicht** gefunden — das ist eine Schlussfolgerung, kein Zitat.
- **Kein WebRTC-Fall im beschriebenen Harness belegt einen Nutzen.** Für Chat + Workspaces mit
  persistenter Speicherung in PostgreSQL bietet ein Server-vermittelter Transport
  (WebSocket/HTTP mit TLS) dieselben Sicherheitseigenschaften mit deutlich weniger Komplexität. Das ist
  eine **Bewertung**, gestützt auf die belegten WebRTC-Zusatzkosten (Signaling-Infrastruktur, STUN/TURN,
  Identity-Binding, Out-of-Band-Verifikation).

---

## 7. Bewertung: Was ist verantwortbar, was ist Etikettenschwindel?

> Dieser Abschnitt ist ausdrücklich **Bewertung**. Die technischen Fakten darin sind mit den Belegen
> aus den Abschnitten 1–6 unterlegt; die Wertungen sind als solche formuliert.

### 7.1 Verantwortbar für ein Einzelnutzer- bis Kleingruppen-System

**A. Server-seitige Verschlüsselung im Ruhezustand — ja, uneingeschränkt sinnvoll.**

**Begründung (belegt):** Der Schaden eines Offline-Abzugs (Backup, Datenbank-Dump, entsorgte Platte,
Fehlkonfiguration eines Read-Replicas) geht auf nahezu null. Die Kosten sind gering. Die Empfehlung ist
klar und in OWASP dokumentiert (AES mind. 128, idealerweise 256 Bit; GCM als erste Wahl; IV pro Chiffrat).

**Verantwortbare Umsetzung für den gegebenen Stack:**
- AES-256-GCM über die Laufzeit-Krypto von Bun/Node (`crypto.createCipheriv('aes-256-gcm', …)`) oder
  über die native Krypto von Go/Rust. **Keine** JS-Eigenimplementierung.
- **DEK pro Workspace und pro Chat** (nicht global, nicht pro Nachricht).
- **KEK getrennt** — mindestens als Datei mit restriktiven Rechten außerhalb des Datenbank-Backups,
  besser in OS-Keychain oder externem Key-Store.
- Envelope-Header: `{ v, alg_id, key_id, kek_id, iv, tag, ciphertext }`.
- **Redis:** Nur Ciphertext oder kurzlebiger Klartext cachen; keine langlebigen Klartextkopien. Wenn
  Klartext in Redis liegt, ist die Datenbank-Verschlüsselung wirkungslos — das folgt direkt aus dem
  OWASP-Argument („the application always needs to have some level of access to the keys"). **Achtung:
  eine Aussage über Redis' eigene Persistenz-/RDB-/AOF-Verschlüsselungseigenschaften ist in dieser
  Recherche nicht belegt und müsste separat geprüft werden.**

**B. Envelope Encryption — ja, das ist der strukturelle Kern.**

**Begründung (belegt):** Ohne KEK/DEK-Trennung gibt es keinen billigen Rotationspfad; OWASP beschreibt
Rewrapping als die Operation, die Ciphertexte unangetastet lässt und nur die DEKs neu umhüllt. Für ein
System, das Chats „verschlüsselt speichern" soll, ist das die Voraussetzung dafür, dass Verschlüsselung
im Betrieb beherrschbar bleibt und nicht zu einem Migrationsprojekt wird.

**C. Krypto-Agilität — ja, Pflicht, und billig, wenn früh eingebaut.**

**Begründung (belegt):** OWASP fordert sie explizit („processes should also be implemented to allow the
encryption algorithm or library to be changed, in case a new vulnerability is found"), und der
Key-ID-pro-Chiffrat-Mechanismus ist Teil der OWASP-Rotationsstrategie. Nachträglich ist das eine
Datenmigration; vorab ist es ein paar Felder im Header.

**D. Ehrliche Benennung der Grenzen — ja, und zwar als Teil des Produkts.**

Die belegten Facts (OWASP-Belege 1–4 in Abschnitt 4) ergeben zwingend, dass man nicht behaupten darf,
Verschlüsselung im Ruhezustand schütze gegen Anwendungsübernahme. Wer das im UI oder in der Doku
behauptet, macht eine durch die eigene Referenzliteratur widerlegte Aussage.

**E. Für Mehrgeräte: nutzerseitiger Root-Key statt Signal/MLS.**

**Begründung (Bewertung, gestützt auf Belege):** Sesame §2.1 und §6.1 zeigen, dass echtes
Mehrgeräte-Management ein erhebliches Protokoll- und UI-Problem ist (Key-Change-Warnungen,
Session-Konvergenz, Auth-Wiederholung). Für **einen Nutzer mit N Geräten** ist die relevante Frage
Gerätesynchronisation, nicht Peer-Authentifizierung. Ein aus Passphrase abgeleiteter oder per QR
übertragener Master-Key, der die DEKs umhüllt, ist:
- deutlich einfacher,
- vollständig auditierbar,
- dem Bedrohungsmodell angemessen (der Nutzer ist die Vertrauenswurzel, nicht ein Server).

### 7.2 Etikettenschwindel — was man NICHT behaupten darf

**F1. „E2EE", während serverseitig eine Klartextkopie für Suche/Index existiert.**

Das ist der klarste Fall von Etikettenschwindel.

**Belege:**
- W3C WebCrypto §6.2: Die Spezifikation gibt **keine** Garantie über die Schlüsselspeicherung;
  Schlüsselmaterial ist Skript nur über `exportKey`/`wrapKey` entzogen, und „it does not guarantee that
  the underlying cryptographic key material will not be persisted to disk, possibly unencrypted".
- OWASP Cryptographic Storage, Key Storage: „**the application always needs to have some level of access
  to the keys in order to decrypt the data**" — und „While it may not be possible to fully protect the
  keys from an attacker who has fully compromised the application".
- OWASP Defense in Depth: „Applications should be designed to still be secure even if cryptographic
  controls fail."

**Bewertung:** Wenn der Server Klartext für Suche/Index hält, ist die Server-seitige Verschlüsselung
**keine** E2EE und **kein** Schutz gegen Anwendungsübernahme. Sie ist weiterhin nützlich (Backup-Schutz)
— aber die Bezeichnung „Ende-zu-Ende" ist falsch, weil ein Ende der Server ist. Wer Volltextsuche
braucht, muss das **benennen**: „Verschlüsselte Speicherung, Server sieht Klartext für die Suche."

**F2. „E2EE", während der Server die Schlüssel ausliefert.**

**Beleg:** W3C WebCrypto §6.2 — Skript-Injektion „is the equivalent to remote code execution in other
operating environments, and allowing hostile script to be injected may allow for the exfiltration of
keys or data."

**Bewertung:** Wer das JavaScript ausliefert *und* die Schlüssel ausliefert, ist kein Ende, sondern der
Mittelpunkt. Ein Nutzer, der die Seite lädt, muss dem ausgelieferten Code vertrauen. Das ist definitiv
**keine** E2EE gegen den Betreiber.

**F3. „E2EE" ohne Benennung der Metadaten.**

**Belege:** RFC 9420 §16.4.1 (Gruppen-ID, Epoch, Nachrichtenfrequenz nicht geschützt);
RFC 9420 §16.4.3 (Mitgliedschaft rekonstruierbar); RFC 9750 §8.4.3.2 (DS sieht Fanout-Muster;
„serious issue for privacy"); Sesame §2.2 (Server speichert UserID und DeviceID an jeder Nachricht).

**Bewertung:** „Wir können nicht sehen, wer mit wem schreibt" ist durch die RFCs widerlegt, sobald ein
Server Nachrichten zustellt. Die korrekte Formulierung ist: „Wir können den Inhalt nicht lesen;
wer mit wem und wann, sieht der Server."

**F4. „E2EE", obwohl MLS-Handshakes als `PublicMessage` laufen.**

**Beleg:** RFC 9420 §16.4.3: „If these proposals are sent as PublicMessage, then information will be
leaked about the corresponding changes to the group's membership. A party that sees all of these
changes can reconstruct the group membership." RFC 9750 §6.4: „Everything else being equal, using
encrypted handshake messages provides stronger privacy properties than using unencrypted handshake
messages, as it prevents intermediaries from learning about the structure of the group."

**Bewertung:** Wenn die Applikation Handshakes unverschlüsselt lässt, um Server-Policy durchzusetzen,
ist das eine legitime Designentscheidung — aber sie muss benannt werden, und sie kostet Privacy.

**F5. „WebRTC P2P ist E2EE, also brauchen wir keinen Server zu vertrauen."**

**Beleg:** RFC 8827 (MITM-Aussage): „Even if HTTPS is used, the signaling server can potentially mount a
man-in-the-middle attack unless implementations have some mechanism for independently verifying keys.
The UI requirements in Section 6.5 are designed to provide such a mechanism for motivated/security
conscious users, but are not suitable for general use."

**Bewertung:** DTLS schützt gegen Dritte, nicht gegen den Signaling-Server ohne Out-of-Band-Verifikation.
Wer „P2P = vertrauensfrei" behauptet, macht eine durch den Standard-RFC widerlegte Aussage.

**F6. „P2P ohne Server".**

**Beleg:** MDN: „Establishing a WebRTC connection between two devices requires the use of a signaling
server to resolve how to connect them over the internet." MDN zu TURN: „opening a connection with a TURN
server and relaying all information through that server."

**Bewertung:** Die Aussage „unsere App braucht keinen Server" ist für eine Browser-Web-App technisch
falsch.

**F7. „Kryptografische Sicherheit durch nicht-extrahierbare WebCrypto-Schlüssel".**

**Beleg + Bewertung:** Die W3C-Spezifikation garantiert **nicht**, dass nicht-extrahierbares
Schlüsselmaterial nicht unverschlüsselt auf der Platte landet oder für andere Prozesse mit denselben
Rechten unzugänglich ist. Wörtlich: „it does not guarantee that the underlying cryptographic key material
will not be persisted to disk, possibly unencrypted, nor that it will be inaccessible to users or other
applications running with the same privileges as the User Agent." Wer `extractable: false` als
Speicherschutz verkauft, macht eine nicht gedeckte Aussage. `extractable: false` ist eine
**Skript-Schranke** — wertvoll, aber nicht das, was der Name suggeriert.

**F8. „Key Transparency ist standardisiert".**

**Beleg:** `draft-ietf-keytrans-architecture-10` ist ein **Internet-Draft** mit Intended Status
Informational, zum Recherchezeitpunkt **In Last Call (ends 2026-10-23)** — **kein RFC**.

**Bewertung:** Key Transparency ist eine sinnvolle Richtung mit expliziter RFC-9750-Empfehlung, aber
„standardisiert" wäre zum Recherchezeitpunkt **nicht belegt**.

**F9. „Wir haben E2EE" nach einer Eigenimplementierung von X3DH/Double Ratchet.**

**Beleg:** W3C WebCrypto §6.2: „application developers are **strongly** discouraged from inventing new
cryptographic protocols". OWASP Cryptographic Storage: „Custom Algorithms — Don't do this."
X3DH §4.3: „Failure to randomize Bob's encryption key may cause catastrophic key reuse."
Double Ratchet §8.4 nennt DoS durch übersprungene Nachrichten-Schlüssel als reale Falle.

**Bewertung:** Eine „Wir-haben-X3DH-nachgebaut"-Lösung ist mit hoher Wahrscheinlichkeit **schwächer**
als die anerkannten Bibliotheken und trägt das Etikett „E2EE" zu Unrecht, wenn die Randbedingungen
(Key-Change-Handling, Replay-Mitigation, Skip-Limits, Geräteverifikation) nicht vollständig umgesetzt
sind. Belegte Fallen: unbegrenzte Skip-Speicherung (DoS), fehlende Key-Reuse-Vermeidung („catastrophic"),
fehlende Key-Change-Warnung (keine Identitätsgarantie).

**F10. „Non-extractable + GCM = sicher" — die GCM-Budget-Falle.**

**Beleg:** NIST SP 800-38D §8.3: „The total number of invocations of the authenticated encryption
function shall not exceed 2^32 … with the given key." Appendix A: bei IV-Wiederholung „the
authentication assurance essentially is lost". Appendix B: „GCM is not well-suited for use with short
tag lengths or very long messages."

**Bewertung:** Für ein Kleingruppen-System ist das 2^32-Budget praktisch irrelevant — die Empfehlung ist
deshalb nicht „Panik", sondern „Zähler oder Rotation designt haben, nicht nachrüsten". Etikettenschwindel
wäre es, „AES-GCM" als vollständige Sicherheitsantwort zu präsentieren, ohne Nonce-Management und
Rotationspfad. Konkret falsch wäre eine Kurz-Tag-Variante (z. B. 32-Bit-Tag) zur Platzersparnis.

### 7.3 Die ehrliche Gesamtaussage für dieses Vorhaben

Für das beschriebene Harness (Bun/TS, Go/Rust, PostgreSQL, Redis, React, Einzelnutzer bis Kleingruppe,
Chats + Workspaces verschlüsselt gespeichert) ist die verantwortbare Position:

> Das System speichert Chats und Workspaces **verschlüsselt im Ruhezustand** mit AES-256-GCM,
> DEK pro Workspace/Chat, KEK getrennt gehalten, Envelope-Header mit `alg_id`/`key_id`/`iv`/`tag`.
> Das schützt gegen Offline-Abfluss (Backups, Dumps, entsorgte Medien).
> **Es ist keine Ende-zu-Ende-Verschlüsselung.** Der Server sieht die Inhalte zur Laufzeit, weil er
> entschlüsseln muss, um zu bedienen; er sieht die Metadaten (wer, wann, mit wem) ohnehin, weil er
> Nachrichten zustellt und speichert (belegt: Sesame §2.2, RFC 9420 §16.4.1, RFC 9750 §8.4.3.2).
> **Echtes E2EE** würde bedeuten: Schlüssel entstehen und bleiben beim Nutzer, der Server speichert
> ausschließlich Chiffrat. Das ist mit WebCrypto möglich, aber dann gilt: (a) der vom Server
> ausgelieferte JS-Code ist die Vertrauensgrenze (W3C WebCrypto §6.2), (b) nicht-extrahierbare
> Schlüssel sind eine Skript-Schranke, keine Speichergarantie (W3C WebCrypto §6.2), (c) jede
> serverseitige Suche/Indexierung über den Klartext ist ausgeschlossen.
> Wer (a)–(c) akzeptiert, kann E2EE bauen. Wer Volltextsuche und Server-seitige Verarbeitung braucht,
> darf es nicht „E2EE" nennen.

---

## Alle Quellen

**OWASP Cheat Sheet Series (Primärquellen, Volltext gelesen)**
1. Cryptographic Storage Cheat Sheet — <https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html>
2. Key Management Cheat Sheet — <https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html>
3. Kubernetes Security Cheat Sheet (ergänzend, „Encrypt secrets at rest") — <https://cheatsheetseries.owasp.org/cheatsheets/Kubernetes_Security_Cheat_Sheet.html>
4. Secrets Management Cheat Sheet (referenziert, nicht im Volltext gelesen) — <https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html>
5. Post-Quantum Cryptography Cheat Sheet (referenziert, nicht im Volltext gelesen) — <https://cheatsheetseries.owasp.org/cheatsheets/Post_Quantum_Cryptography_Cheat_Sheet.html>
6. OWASP ASVS 5.0 (referenziert über Key Management, nicht im Volltext gelesen) — <https://github.com/OWASP/ASVS/blob/v5.0.0_release/5.0/en/0x22-V13-Configuration.md>

**NIST / FIPS (Primärquellen)**
7. NIST SP 800-38D, „Recommendation for Block Cipher Modes of Operation: GCM and GMAC" (Nov. 2007; Volltext gelesen) — <https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf>
8. NIST SP 800-38D, Landing-Page — <https://csrc.nist.gov/pubs/sp/800/38/d/final>
9. NIST SP 800-57 Part 1 Rev. 5, „Recommendation for Key Management" (**nicht im Volltext gelesen**; Zitate über OWASP-Wiedergabe) — <https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final>
10. NIST FIPS 203, ML-KEM (referenziert über OWASP) — <https://csrc.nist.gov/pubs/fips/203/final>
11. NIST SP 800-88 Rev. 2, Media Sanitization (referenziert über OWASP) — <https://csrc.nist.gov/pubs/sp/800/88/r2/final>

**IETF / RFCs (Primärquellen)**
12. RFC 9420, „The Messaging Layer Security (MLS) Protocol" (Standards Track, Juli 2023; Volltext lokal gelesen) — <https://www.rfc-editor.org/rfc/rfc9420.html> · <https://www.rfc-editor.org/rfc/rfc9420.txt> · <https://datatracker.ietf.org/doc/html/rfc9420>
13. RFC 9750, „The Messaging Layer Security (MLS) Architecture" (Informational, April 2025; Volltext lokal gelesen) — <https://www.rfc-editor.org/rfc/rfc9750.html> · <https://www.rfc-editor.org/rfc/rfc9750.txt>
14. RFC 8827, „WebRTC Security Architecture" (Standards Track, Januar 2021; Volltext lokal gelesen) — <https://www.rfc-editor.org/rfc/rfc8827.html> · <https://www.rfc-editor.org/rfc/rfc8827.txt>
15. RFC 9180, „Hybrid Public Key Encryption (HPKE)" (IRTF, Informational, Februar 2022; Volltext lokal gelesen) — <https://www.rfc-editor.org/rfc/rfc9180.html> · <https://www.rfc-editor.org/rfc/rfc9180.txt>
16. draft-ietf-keytrans-architecture (Key Transparency Architecture, Informational, In Last Call) — <https://datatracker.ietf.org/doc/draft-ietf-keytrans-architecture/>
17. draft-ietf-keytrans-protocol (Key Transparency Protocol) — <https://datatracker.ietf.org/doc/draft-ietf-keytrans-protocol/>
18. IETF Working Group „keytrans" — <https://datatracker.ietf.org/wg/keytrans/>

**W3C / WHATWG / MDN (Primärquellen)**
19. W3C Web Cryptography API Level 2, Editor's Draft 11. August 2026 (Volltext gelesen) — <https://w3c.github.io/webcrypto/> · veröffentlichte Fassung: <https://www.w3.org/TR/webcrypto-2/>
20. MDN, „Crypto: subtle property" (zuletzt geändert 10.10.2026) — <https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle>
21. MDN, „Secure contexts" (zuletzt geändert 14.09.2026) — <https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts>
22. MDN, „Signaling and video calling" (zuletzt geändert 22.09.2026) — <https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling>
23. MDN, „Introduction to WebRTC protocols" (zuletzt geändert 17.09.2026) — <https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols>

**Signal (Primärquellen)**
24. Signal Documentation (Übersicht) — <https://signal.org/docs/>
25. The X3DH Key Agreement Protocol (Revision 1, 2016-11-04) — <https://signal.org/docs/specifications/x3dh/> · PDF: <https://signal.org/docs/specifications/x3dh/x3dh.pdf>
26. The PQXDH Key Agreement Protocol — <https://signal.org/docs/specifications/pqxdh/>
27. The Double Ratchet Algorithm (Revision 4, 2025-11-04) — <https://signal.org/docs/specifications/doubleratchet/> · PDF: <https://signal.org/docs/specifications/doubleratchet/doubleratchet.pdf>
28. The Sesame Algorithm: Session Management for Asynchronous Message Encryption (Revision 2, 2017-04-14) — <https://signal.org/docs/specifications/sesame/>
29. The ML-KEM Braid Protocol (referenziert) — <https://signal.org/docs/specifications/mlkembraid/>
30. XEdDSA and VXEdDSA (referenziert) — <https://signal.org/docs/specifications/xeddsa/>
31. Signal Protocol library (libsignal), Repository — <https://github.com/signalapp/libsignal>

**MLS-Implementierung**
32. OpenMLS, Repository (abgerufen Oktober 2026) — <https://github.com/openmls/openmls>
33. OpenMLS Buch/Dokumentation — <https://book.openmls.tech/>
34. OpenMLS auf docs.rs — <https://docs.rs/crate/openmls/latest>
35. MLS Extensions Draft (referenziert von OpenMLS) — <https://messaginglayersecurity.rocks/mls-extensions/draft-ietf-mls-extensions.html>

**Weitere in Belegen referenzierte Standards**
36. RFC 5869, HKDF — <https://www.rfc-editor.org/rfc/rfc5869>
37. RFC 7748, Elliptic Curves for Security — <https://www.rfc-editor.org/rfc/rfc7748>
38. RFC 8017, PKCS #1 (RSAES-OAEP) — <https://www.rfc-editor.org/rfc/rfc8017>
39. RFC 8261, SCTP over DTLS (referenziert in RFC 8827) — <https://www.rfc-editor.org/rfc/rfc8261>
40. RFC 8445, ICE (referenziert in MDN) — <https://datatracker.ietf.org/doc/html/rfc8445>
41. Triple Ratchet Paper, ePrint 2025/078 (referenziert in Double Ratchet §8.8) — <https://eprint.iacr.org/2025/078>

---

## Nicht belegt / offene Punkte

Die folgenden Punkte konnten in dieser Recherche **nicht** belegt werden. Sie sind nach Relevanz für
Entscheidungen sortiert und enthalten jeweils einen Hinweis, wie sie belegt werden könnten.

**1. Wörtliche OWASP-Aussage „Encryption at rest does not protect against SQL injection / application
compromise" — NICHT BELEGT.**
Diese exakte Formulierung existiert in den gelesenen OWASP-Seiten nicht. Belegt sind vier funktional
äquivalente Aussagen (siehe Abschnitt 4, Belege 1–4), darunter die zentrale Stelle, die SQL Injection
ausdrücklich als Angriffsvektor nennt und die Schlüssel-/Daten-Trennung als Gegenmaßnahme beschreibt.
*Empfehlung:* In eigener Doku die OWASP-Belege zitieren, nicht die nicht existierende Paraphrase.

**2. NIST SP 800-57 Part 1 Rev. 5 im Primärtext — NICHT VERIFIZIERT.**
Die konkreten Cryptoperioden-Zahlen (2 Jahre / Tag bis Woche / 3 Jahre; 1–2 Jahre für
Key-Establishment-Schlüssel) stammen aus der wörtlichen Wiedergabe durch das OWASP Key Management
Cheat Sheet, das NIST SP 800-57 Part 1 Rev. 5 §5.3.6, item 6(b) als Quelle nennt. Das NIST-PDF wurde
**nicht** im Volltext gelesen.
*Empfehlung:* Vor einer Produktiventscheidung die Zahlen in §5.3.6 der NIST-PDF gegenlesen
(<https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final>).

**3. Signal „Safety Numbers" — NICHT BELEGT.**
Der Begriff „Safety Numbers" erscheint in keiner der gelesenen Signal-Spezifikationen (X3DH, PQXDH,
Double Ratchet, Sesame). Belegt ist der Mechanismus „compare public key fingerprints manually, or by
scanning a QR code" (X3DH §4.1, Sesame §6.1) — die Spezifikationen erklären die Umsetzung aber
ausdrücklich für „outside the scope". Signal-**Produkt**dokumentation wurde nicht geprüft.
*Empfehlung:* Für eine belastbare Aussage die Signal-Support-/Produktdokumentation oder den
`libsignal`-Quellcode prüfen.

**4. Nachrichtenlängen-Leckage bei E2EE — NICHT BELEGT (kein wörtlicher Beleg).**
Die Aufgabe fragt ausdrücklich danach. RFC 9420 §16.4.1 nennt „message frequency", nicht Länge. In
RFC 9420, RFC 9750, den Signal-Spezifikationen und den gelesenen OWASP-Seiten wurde **keine** Aussage
zur Nachrichtenlänge gefunden. Technisch ist sie plausibel (AEAD ist längenerhaltend, Padding nur wenn
explizit implementiert), aber das ist eine Schlussfolgerung.
*Empfehlung:* Entweder als Schlussfolgerung kennzeichnen oder über eine Quelle zu
Traffic-Analysis/Padding belegen (nicht Teil dieser Recherche).

**5. `libsignal`-Sprachbindungen für TypeScript/Bun/React — NICHT BELEGT.**
Die Signal-Doku-Seite nennt nur das Repository `<https://github.com/signalapp/libsignal>` und macht
**keine** Aussage über unterstützte Sprachen oder eine gepflegte JS/WASM-Bindung. Diese Frage ist
**entscheidungskritisch** für jede Überlegung, das Signal-Protokoll in einem TS/Bun/React-Stack
einzusetzen.
*Empfehlung:* `libsignal`-Repository direkt prüfen (Sprach-/WASM-Targets, Release-Kadenz,
Wartungsstatus). Dies sollte vor jeder Architekturentscheidung in Richtung Signal-Protokoll geschehen.

**6. Andere MLS-Implementierungen als OpenMLS — NICHT GEPRÜFT.**
Es wurde ausschließlich OpenMLS untersucht (wie in der Aufgabe exemplarisch genannt). Ob es etablierte,
gepflegte MLS-Implementierungen mit **offizieller** WASM-Unterstützung gibt, ist **nicht belegt**.
Hinweise auf eine Interop-Landschaft existieren (OpenMLS enthält `interop_client` und
`compat_tests`), aber eine Implementierungsliste wurde nicht erhoben.
*Empfehlung:* MLS-Interop-Landschaft (z. B. die MLS-Interop-Testinfrastruktur) prüfen, falls
Browser-seitiges MLS ernsthaft in Betracht kommt.

**7. Produktionsreife von MLS in WASM — NICHT BELEGT.**
Belegt ist nur: OpenMLS hat ein `js`-Feature („enable compilation to wasm"), und `wasm32-unknown-unknown`
wird in der CI **gebaut, aber nicht getestet** („Unsupported, but built on CI … builds (but doesn't
test)"). Konkrete Performance-, Speicher-, Korrektheits- oder Sicherheitsdaten für MLS in WASM sind
**nicht belegt**.
*Empfehlung:* Eigene Test-/Benchmark-Suite gegen das WASM-Target, falls dieser Weg gewählt wird.

**8. Post-Quanten-Unterstützung in MLS (hybride Ciphersuiten) — NICHT BELEGT.**
Die drei von OpenMLS gelisteten Ciphersuiten sind klassisch (X25519/P-256, AES-128-GCM bzw.
ChaCha20-Poly1305). Die Aussage „OpenMLS unterstützt Post-Quanten-MLS" ist damit **nicht belegt**.
Die Post-Quanten-Konstruktionen, die in dieser Recherche belegt sind, stammen aus der **Signal**-Welt
(PQXDH, ML-KEM Braid, SPQR, Triple Ratchet — Double Ratchet Rev. 4, 2025).
*Empfehlung:* Falls Post-Quanten für MLS gebraucht wird: MLS-PQ-Drafts und deren
Implementierungsstand separat recherchieren.

**9. Speicherort nicht-extrahierbarer WebCrypto-Schlüssel in konkreten Browsern — NICHT BELEGT.**
Die W3C-Spezifikation lässt es ausdrücklich offen („places no normative requirements on implementations
as to how the underlying cryptographic key material is stored … nor that it will be inaccessible to
users or other applications running with the same privileges as the User Agent"). Jede Aussage wie
„nicht-extrahierbare Schlüssel liegen im OS-Keychain/TPM" ist für WebCrypto **nicht belegt**.
*Empfehlung:* Browser-spezifische Implementierungsdokumentation prüfen, falls dieses Argument in einer
Bewertung verwendet werden soll.

**10. Reifegrad der WebRTC-Identity-Mechanismen (IdP-basiert), Stand 2025/2026 — NICHT VERIFIZIERT.**
RFC 8827 enthält ein Kapitel „7.3. Items for Standardization" und verweist auf „the status of
IdP-based authentication", was impliziert, dass Teile zum RFC-Zeitpunkt (Januar 2021) nicht final waren.
Der aktuelle Stand wurde nicht verifiziert.
*Empfehlung:* Aktuellen Stand der WebRTC-Identity-Spezifikationen prüfen, falls IdP-basierte
Peer-Authentifizierung eingesetzt werden soll.

**11. Redis-spezifische Verschlüsselungseigenschaften — NICHT GEPRÜFT.**
Der Bericht empfiehlt, in Redis nur Chiffrat oder kurzlebigen Klartext zu halten. Ob Redis
(RDB-Persistenz, AOF, Redis Enterprise) eigene Verschlüsselungsmechanismen bietet und wie diese zu
bewerten sind, wurde **nicht** geprüft.
*Empfehlung:* Redis-Dokumentation zu Encryption-at-Rest und zur Persistenzkonfiguration prüfen —
relevant, weil ein Redis-Snapshot sonst eine zusätzliche Klartext-/Chiffrat-Kopie erzeugt.

**12. Konkrete Nonce-Kollisionswahrscheinlichkeiten für AES-GCM bei 96-Bit-Zufalls-IVs — NICHT BELEGT
als eigene Zahl.**
NIST SP 800-38D liefert die **Regel** (2^32 Operationen, §8.3) und die **Konsequenz** bei Verletzung
(Appendix A: „the authentication assurance essentially is lost"), aber in dieser Recherche wurde keine
explizite Geburtstagsparadox-Formel oder Wahrscheinlichkeitstabelle aus der Quelle extrahiert.
Die 2^32-Zahl ist die normative Vorgabe, nicht eine hergeleitete Kollisionswahrscheinlichkeit.
*Empfehlung:* Für eine quantitative Aussage NIST SP 800-38D §8.2.2, Appendix A und die dort
referenzierten Arbeiten ([4], [5]) im Detail lesen.

**13. WebCrypto Level 2 ist Editor's Draft — Statusvorbehalt, kein „nicht belegt".**
Die Security-Considerations-Abschnitte sind laut Dokument **non-normativ**, und das Dokument ist ein
Editor's Draft („It is inappropriate to cite this document as other than a work in progress"). Die
inhaltlichen Belege sind dadurch nicht entwertet, aber die Statusangabe muss bei Zitaten mitgeführt
werden. Zusätzlich wurde die als „Latest published version" genannte Fassung
(<https://www.w3.org/TR/webcrypto-2/>) **nicht** separat abgeglichen — es ist möglich, dass die
veröffentlichte Fassung vom Editor's Draft abweicht.
*Empfehlung:* Bei formaler Verwendung die veröffentlichte TR-Fassung zitieren und Versionsdatum angeben.

**14. Verhältnis von „Encryption at rest" zu angreiferseitigem Zugriff auf Prozessspeicher (Core Dumps,
Swap) — nur teilweise belegt.**
OWASP Key Management behandelt „Memory Management Considerations" („Keys stored in memory for a long
time can become „burned in"") und Zeroization („Overwriting key material is best-effort in managed
runtimes, where copies can survive in garbage-collected memory, immutable strings, or swapped-out
pages"). Für Bun/Node konkret bedeutet das: Klartextschlüssel im JS-Heap sind nicht zuverlässig
löschbar. Das ist belegt. Die **Konsequenz** für das konkrete Bedrohungsmodell (wie schwer ist ein
Core-Dump-/Swap-Angriff in einem selbstgehosteten Einzelnutzer-Setup?) ist eine eigene Bewertung und
**nicht belegt**.

**15. Segmentierung/Egress-Kontrollen und „Encryption at rest plus X" — nicht Teil dieser Recherche.**
Die Aufgabe umfasste Encryption at rest und E2EE/P2P. Verwandte, für die Gesamtentscheidung relevante
Themen (secrets management im Detail, Log-Redaction, Datenbank-Härtung, Backup-Verschlüsselung,
Zugriffskontrolle) wurden nur gestreift und sind hier **nicht** belegt.

---

*Bericht erstellt als Teil der Gesamtrecherche, Frage 6. Alle Quellen wurden im Rahmen dieser
Recherche tatsächlich abgerufen; wörtliche Zitate stammen aus den abgerufenen Fassungen.
Fehlende Belege sind an jeder Stelle ausdrücklich als solche gekennzeichnet und am Ende
zusammengefasst.*
