# Geheimnisse, die ein Administrator nicht lesen kann — Beleg und Entwurf

> **Die Anforderung des Betreibers, wörtlich:** *„Datenbank vor allem API keys sollten nicht
> von admin gelesen werden können egal wie. Dementsprechend solltest du herausfinden wie man
> das professionell und industrielle Standard machen kann inkl passwort aber passwort sollte
> resettet werden können."*
>
> **Diese Datei beantwortet sie.** Erst der Stand der Technik mit wörtlichen Belegen, dann der
> Entwurf für **dieses** Schema, dann die ehrliche Grenze. Jede Zahl nennt den Befehl, der sie
> gemessen hat; jede Norm nennt das Zitat und die Quelle.

---

## 1. Die Frage zerfällt in drei, nicht in eine

Der wichtigste Schritt ist die Unterscheidung. „API keys" sind in diesem Projekt **zwei
völlig verschiedene Dinge**, und für sie gilt **nicht** dieselbe Lösung:

| | Was es ist | Muß der Server es im Klartext können? | Richtige Lösung | Kann ein DB-Admin es lesen? |
|---|---|---|---|---|
| **(a)** | **Unser eigener API-Schlüssel** — ein Benutzer weist sich damit bei uns aus | **nein**, wir müssen ihn nur *prüfen* | **Hash** | **nein** — auch wir nicht |
| **(b)** | **Das Passwort des Benutzers** | **nein**, wir müssen es nur *prüfen* | **Argon2id-Hash** | **nein** — auch wir nicht |
| **(c)** | **Der Anbieter-Schlüssel des Benutzers** (DeepSeek), den *wir* für ihn benutzen | **ja**, wir rufen damit beim Anbieter an | **Umschlagverschlüsselung, KEK außerhalb der Datenbank** | **nein, solange der KEK nicht in der Datenbank liegt** |

**Wer diese drei in einen Topf wirft, baut eine Lösung, die für zwei von drei falsch ist.**
Ein Passwort zu verschlüsseln statt zu hashen wäre ein Fehler (Abschnitt 4). Einen
Anbieter-Schlüssel zu hashen wäre unmöglich — dann könnten wir ihn nicht mehr benutzen.

## 2. „Egal wie" — was der Standard dazu sagt, und wo er selbst die Grenze zieht

Die Anforderung lautet: **nicht vom Administrator lesbar, egal wie.** Damit das eine
technische Aussage wird und keine Hoffnung, muß man sagen, **welcher** Administrator.

### Die drei Ebenen

| Ebene | Was dieser Administrator kann | Was gegen ihn hilft |
|---|---|---|
| **Datenbank-Administrator** | `SELECT *`, Dumps, Backups, Replikate, eine SQL-Injektion ausnutzen | **Hashing und Verschlüsselung.** Er sieht Hash bzw. Chiffrat. **Erreichbar, und das ist der Kern der Anforderung.** |
| **Host-Administrator** (Administrator des Anwendungsprozesses) | Speicher auslesen, Code ändern, sich zwischen Anwendung und Anbieter hängen, den Schlüssel beim Entschlüsseln mitlesen | **Nur ein Vertrauensanker außerhalb**: HSM oder KMS mit **getrennter** Administration, so daß der Schlüssel nie im Anwendungsprozeß liegt |
| **Administrator des Schlüsseldienstes** (KMS/HSM) | die Entschlüsselung **anweisen** | **Nichts Technisches mehr.** Die Kontrolle ist **Richtlinie, getrennte Administration und Prüfpfad** — nicht Kryptografie |

### Der Standard sagt die Grenze selbst — das ist der wertvollste Beleg

OWASP formuliert es nicht als „niemand kann Schlüssel sehen", sondern als **Rechenschaft**:

> „Although it is preferred that no humans are able to view keys, **as a minimum, the key
> management system should account for all individuals who are able to view plaintext
> cryptographic keys.**"
> — [OWASP Key Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

Und zur Einweg-Speicherung derselben Quelle:

> „One-way storage … **does not protect against … modification of session records, or
> compromise of the application.**"
> — ebd.

**Das ist die ehrliche Antwort auf „egal wie".** Für die **Datenbank-Ebene** ist sie
erreichbar und wird erreicht. Für die **Host-Ebene** braucht sie ein HSM oder einen KMS mit
getrennter Administration — und selbst dann kann der Administrator des Schlüsseldienstes eine
Entschlüsselung anweisen. **Was dann schützt, ist nicht das Chiffrat, sondern die
Protokollierung und die getrennte Zuständigkeit.**

### Warum HSM/KMS und nicht eine Datei mit dem Hauptschlüssel

> „For higher-assurance deployments (such as OWASP ASVS 5.0 Level 3), applications should use
> hardware-backed modules, such as a **Hardware Security Module (HSM)** or Trusted Platform
> Module (TPM), to significantly reduce the risk of **key extraction or compromise in software
> memory.**"
> — [OWASP Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

> „Where available, the secure storage mechanisms provided by the operating system, framework
> or cloud service provider should be used. These include: **A physical Hardware Security
> Module (HSM). A virtual HSM. Key vaults such as Amazon KMS or Azure Key Vault.** An external
> secrets management service such as Conjur or **HashiCorp Vault.**"
> — [OWASP Cryptographic Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Und der Grund, warum eine Datei auf **demselben** Rechner die Trennung nur nominell ist —
OWASP sagt es über den Fall, in dem KEK und DEK nicht getrennt liegen können:

> „In simpler application architectures (such as shared hosting environments) where the KEK
> and DEK cannot be stored separately, **there is limited value to this approach**, as an
> attacker is likely to be able to obtain both of the keys at the same time."
> — ebd.

**Für dieses Projekt heißt das konkret:** App, Hauptschlüssel und PostgreSQL liegen heute auf
**demselben** Rechner (Compose-Stapel `pmh`, gemessen: ein Container je Dienst, ein
gemeinsames Netz). Die Trennung ist damit **nominell** — der Gewinn entsteht erst, wenn der
Hauptschlüssel den Rechner verläßt. Das ist keine Kleinigkeit und gehört in den Entwurf, nicht
in eine Fußnote.

**Bekannt und selbst benannt:** OWASP weist auch darauf hin, daß in einer
speicherbereinigten Laufzeit (Bun/TypeScript ist eine) das Überschreiben von Schlüsselmaterial
nur „best-effort" ist — Kopien können im Speicher überleben. Genau deshalb ist Vault/Transit
überlegen: der Schlüssel liegt dann **nie** im Anwendungsprozeß.

### Was gegen einen Datenbank-Administrator **nicht** hilft: Scheibenverschlüsselung

Das ist der naheliegende Fehlschluß, und er ist wichtig genug für einen eigenen Absatz:
**TDE, LUKS, ein verschlüsseltes Volume oder ein verschlüsselter Tablespace helfen gegen
diesen Administrator nicht.** Die Entschlüsselung geschieht in **derselben Vertrauensdomäne**,
die er kontrolliert — er fragt die Datenbank, und die Datenbank antwortet im Klartext. Gegen
einen gestohlenen Datenträger hilft es; gegen `SELECT *` nicht. Der einzige Angriff, der
zieht, ist Verschlüsselung **in der Anwendung** mit einem Schlüssel **außerhalb** der
Datenbank.

### Und die Standards widersprechen sich an genau dieser Stelle

Ehrlich benannt, weil es die Empfehlung beeinflußt: **NIST SP 800-57 Teil 1 Rev. 5
§6.2.2.6 empfiehlt, Schlüssel und Schutzschlüssel *zusammen* zu verwahren** („Storing the key
information together … helps to satisfy the association requirement"), während OWASP die
**Trennung** verlangt. NIST läßt für ruhende Schlüssel **eine von drei** Alternativen genügen —
Verschlüsselung, ein physisch geschütztes FIPS-140-Modul, **oder ein kontrollierter Verwahrort**
— und verlangt die systemübergreifende KEK/DEK-Trennung **nicht**. Dazu NIST wörtlich:
*„Absolute protection against modification is not possible."*

**Was ich daraus mache:** OWASP ist hier **strenger** und für diesen Fall passender — die
Anforderung des Betreibers lautet ausdrücklich „nicht vom Administrator lesbar", und die
Trennung ist die einzige Antwort darauf. Ich folge OWASP und **nenne den Widerspruch**, statt
ihn zu verschweigen. Wer beruflich nach NIST arbeitet, wird an dieser Stelle eine andere
Entscheidung treffen dürfen.

### Die eigentliche Kontrolle auf der obersten Ebene — und wie weich sie ist

Sobald der Schlüssel in einem KMS oder HSM liegt, ist die Kontrolle **nicht mehr Kryptografie**.
Normativ faßbar ist sie am ehesten über **PCI DSS v4.0 Anforderung 3.7.6**:

> „Where manual cleartext cryptographic-key-management operations are performed by personnel,
> key-management policies and procedures are implemented include managing these operations
> using **split knowledge and dual control.**"

**Zwei Einschränkungen, die dazugehören.**
*Diese Fassung ist aus einer gespiegelten PCI-DSS-v4.0-Ausgabe zitiert* — die offizielle
Ablage war nicht erreichbar (dokumentiert als W8 der Recherche). Der Wortlaut gilt als
**unbestätigt**, bis jemand ihn gegen die offizielle v4.0.1 prüft. Die **Begriffe** „dual
control" und „split knowledge" sind dagegen direkt bei
[pcisecuritystandards.org/glossary](https://www.pcisecuritystandards.org/glossary/) belegt.
Und NIST SP 800-57 enthält die Definition „dual control" in Rev. 5 **nicht** mehr — der
Vier-Augen-Beleg kommt deshalb von PCI, nicht von NIST.

**Und der Prüfpfad selbst ist abschaltbar.** AWS schreibt über CloudTrail:

> „AWS CloudTrail lets you exclude AWS KMS events from a trail. … **Excluding AWS KMS events
> from a CloudTrail Log can obscure actions that use your KMS keys.**"
> — [AWS KMS Kryptografie-Grundlagen](https://docs.aws.amazon.com/kms/latest/developerguide/kms-cryptography.html)

Wer also sagt „der Prüfpfad schützt", muß dazusagen, **wer ihn abschalten darf**. Auf der
obersten Ebene gibt es keine technische Garantie — nur Zuständigkeit, Protokoll und die
Möglichkeit, beides zu umgehen.

### Die unvermeidbare Klartextgrenze — von AWS selbst benannt

> „You can even encrypt the data encryption key under another encryption key, and encrypt that
> encryption key under another encryption key. **But, eventually, one key must remain in
> plaintext so you can decrypt the keys and your data.** This top-level plaintext key
> encryption key is known as the root key."
> — [AWS KMS Kryptografie-Grundlagen](https://docs.aws.amazon.com/kms/latest/developerguide/kms-cryptography.html)

Das ist die klarste Formulierung des ganzen Problems: **jede** Umschlagkette endet bei einem
Schlüssel, der irgendwo im Klartext existieren muß. Die Frage ist nur, **wer** ihn sehen kann —
und genau das ist die Ebenen-Unterscheidung aus diesem Abschnitt.

## 3. (a) Unser eigener API-Schlüssel — gehasht, und der Bestand ist richtig

**Der Standard verlangt einen Hash, keine Verschlüsselung:**

> „All look-up secrets **SHALL** be stored in a hashed form using an approved hashing
> function."
> — NIST SP 800-63B **§5.1.2.2 „Look-Up Secret Verifiers"**
> ([NIST SP 800-63-4, §5.1.2.2](https://pages.nist.gov/800-63-4/sp800-63b.html))

**Zwei Korrekturen an dieser Fundstelle, beide von der Aufsicht (Befund B39) — und beide
waren meine Fehler.** Die erste Fassung nannte **§5.1.1.2**; das ist „**Memorized Secret
Verifiers**", also die **Paßwort**-Regel, nicht die für Nachschlage-Geheimnisse. Die Regel
für Look-up-Secrets steht in **§5.1.2.2**, und NISTs eigenes Konformitätsdokument zitiert sie
als „(5.1.2.2)". Zweitens war die **Fassung gemischt**: der Wortlaut stammt aus **Revision 4**,
die Nummer wurde wie Revision 3 gelesen. **Ein Beleg, der nicht trägt, unter einer
Entwurfsentscheidung, ist genau die Klasse, die dieses Projekt bei anderen beanstandet.**

**Und ein *schneller* Hash ist hier richtig — mit einer Bedingung, die ZWEI Sätze hat:**

> „**If [a look-up secret] is hashed, it SHALL be salted and the hash SHALL be computed with
> an approved password hashing algorithm** … A standard hash function can be used if the
> secret has **112 bits of entropy or more.**"
> — OWASP ASVS 6.5.2

**Der erste Satz ist der bindende, und die erste Fassung zitierte nur den zweiten.**
Das war eine Verkürzung zu meinen Gunsten: der Standard **verlangt** unterhalb von 112 Bit
ein **Paßwort**-Hashverfahren und **erlaubt** den schnellen Hash erst **darüber**. Wer nur
den zweiten Satz liest, hört „schneller Hash ist in Ordnung" und überhört die Bedingung —
die dann zur bloßen Fußnote wird. Hier steht sie als das, was sie ist: **eine Voraussetzung.**

> „Unlike passwords, API keys are high-entropy random strings, so you do not need a slow hash
> like bcrypt. **There is nothing to brute-force when the input space is 2^128 or larger.**"
> — [apikeys.guide, Validation and Lookup](https://apikeys.guide/docs/implementation/validation-and-lookup)

**Der Bestand erfüllt das — gemessen, nicht angenommen.** `api_keys` hat `key_id`
(Klartext-Präfix) und `token_hash` (`^[0-9a-f]{64}$`, also SHA-256) — **keine**
Klartextspalte. Ein Datenbank-Administrator liest dort nichts Verwertbares. Und die Entropie
ist **vorhanden**: `randomToken(bytes = 32)` (`packages/auth/auth/src/index.ts:342`) zieht
**32 Bytes aus `crypto.getRandomValues`** = **256 Bit**; `newSessionToken()` (`:385`) und
`newCsrfPair()` (`:397`) rufen es mit 32 auf; `tokenHash()` (`:365`) ist SHA-256 hex.

**Was fehlt, ist nicht die Entropie — es ist ihre ERZWINGUNG.** Das ist die zweite Korrektur
der Aufsicht (Befund **B40**), und sie geht gegen meine eigene Formulierung: die erste Fassung
schrieb, die Bedingung sei „noch nicht erfüllt". **Sie ist erfüllt** — mit **256 Bit gegen
geforderte 112**. Falsch war der Schluß, nicht der Bestand.

**Der wirkliche Mangel, in einem Satz:** `randomToken` prüft nur `bytes >= 1`. **`randomToken(4)`
wäre heute gültig** — 32 Bit, und damit ein Hash, den ein Administrator in Sekunden
zurückrechnet. Und **kein Test hält ≥ 112 Bit fest**. Die ganze Begründung dieses Abschnitts
hängt damit an einer Zahl, die **nirgends zugesichert** ist.

**Die Behebung ist deshalb eine Zeile, kein neuer Erzeuger:**

```ts
// In randomToken: die Untergrenze ist keine Bequemlichkeit, sondern die Bedingung,
// unter der ein schneller Hash überhaupt zulässig ist (ASVS 6.5.2: 112 Bit).
if (bytes < 16) {
  throw new RangeError(`Zufallsbytes müssen ≥ 16 sein (128 Bit) — ist ${String(bytes)}`)
}
```

Dazu ein Längentest, der die Bit-Zahl **festhält** statt sie zu behaupten. Das ist derselbe
Unterschied wie beim Befund B16: **„nicht geprüft" ist nicht „nicht vorhanden"** — und im
Umkehrschluß: **„vorhanden" ist nicht „zugesichert".**

**Der Entwurf.**

```
Format:      pmh_<key_id>_<secret>      (key_id ist eine KENNUNG, kein Teil des Geheimnisses)
key_id:      12 Zeichen base64url, EIGENE 72 Bit Zufall — nicht aus dem Geheimnis abgeleitet
secret:      32 Zufallsbytes = 256 Bit, base64url (43 Zeichen)
gespeichert: key_id im Klartext (Nachschlagen), SHA-256(secret) als token_hash
Anzeige:     display_prefix = die ersten Zeichen des Geheimnisses, für den Benutzer
Prüfung:     key_id nachschlagen -> Hash des vorgelegten Geheimnisses -> constantTimeEquals
```

**Warum `key_id` nicht aus dem Geheimnis abgeleitet wird.** Wäre `key_id` ein Präfix des
Geheimnisses, stünden 72 Bit davon im Klartext in der Datenbank, und die verbleibende
Entropie sänke auf 184 Bit. Das ist noch weit über 112 — aber es ist ein Geschenk ohne
Gegenwert. Eine eigene Zufallskennung kostet nichts und läßt die 256 Bit unangetastet.

**Und eine zweite Bedingung, die dazugehört: Ablauf.** Gemessen: `api_keys.expires_at` ist
`NOT NULL` mit `CHECK (expires_at > created_at)` — **jeder** Schlüssel muß ablaufen. Das ist
richtig und bleibt. `revoked_at` und `revoked_reason` sind vorhanden.

**Zum Pepper — eine Abwägung, keine Pflicht.** Ein serverseitiger Pepper (HMAC mit einem
Schlüssel außerhalb der Datenbank) macht einen Dump **allein** wertlos: ohne den Pepper ist
der Hash nicht prüfbar. Aber: der Pepper muß überall dort verfügbar sein, wo ein Schlüssel
geprüft wird — also auf dem heißen Pfad **jeder** Anfrage. Für Passwörter räumt OWASP den
Preis selbst ein: *„Peppers cannot be changed without knowledge of a user's password.
Therefore changing a pepper will require forcing all users whose passwords were protected by
the previous pepper to reset their passwords."* Für **API-Schlüssel** ist das billiger — sie
lassen sich neu ausstellen. Deshalb: **Pepper ja, aber mit einer Fassungsnummer je Zeile**,
damit ein Wechsel möglich ist, ohne alle Schlüssel auf einmal zu erneuern.

## 4. (b) Das Passwort — Hash, und warum ein Reset nichts zerstört

**Der Bestand ist richtig und wird durch die Norm bestätigt.** Argon2id mit
`memoryCost: 19_456, timeCost: 2, parallelism: 1` — wörtlich das OWASP-Minimalprofil:

> „**Use [Argon2id] with a minimum configuration of 19 MiB of memory, an iteration count of
> 2, and 1 degree of parallelism.**"
> — [OWASP Password Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

**Nachgemessen auf dieser Maschine** (OWASP verlangt das ausdrücklich): **Median 19,7 ms**,
min 18,4 / max 21,2 über 12 Läufe nach 3 Aufwärmläufen. OWASP-Ziel < 1000 ms → **erfüllt mit
Faktor 50 Luft.** Speicher 19,0 MiB je Hash; bei 1,9 GiB Spitze sind ~100 gleichzeitige
Anmeldungen möglich. Die Parameter sind allerdings **genau auf** dem Minimum, nicht darüber —
nach oben ist Raum, und er kostet nur Anmeldezeit.

**Warum ein Passwort-Reset die Daten nicht zerstört — der ganze Grund steht in einem Satz:**

> „Because **hashing is a one-way function** (i.e., it is impossible to ‚decrypt' a hash and
> obtain the original plaintext value), it is the most appropriate approach for password
> validation."
> — [OWASP Password Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Aus einem Hash läßt sich **kein** Datenschlüssel ableiten. Also berührt ein Passwort-Reset
`user_secrets` **nicht**. Genau deshalb ist der Bestand so gebaut: Passwort-Hash und
Datenschlüssel sind getrennt.

**Und die Gegenprobe, warum das nicht selbstverständlich ist.** OWASP beschreibt auf derselben
Seite die Variante, bei der der Datenschlüssel **aus dem Paßwort** abgeleitet wird — sie gilt
ausdrücklich nur für „the user changes their passphrase", und für den Vergessen-Fall sagt die
Key-Management-Seite nüchtern:

> „**Data that has been encrypted with lost cryptographic keys will never be recovered.**"
> — [OWASP Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

Das ist genau die Falle, die der Betreiber in seiner ersten Weisung benannt und verworfen hat.
**Der Bestand fällt nicht hinein — aber nur, solange niemand einen Datenschlüssel aus dem
Paßwort ableitet.** Diese Regel gehört als Kommentar an die Stelle, an der jemand es tun würde.

### Der Reset-Ablauf — was der Standard verlangt

Die Tabelle `one_time_tokens` ist da (`purpose`, `token_hash`, `expires_at`, `consumed_at`) —
**benutzt wird sie von keiner Zeile Anwendungscode** (B-K2). Der Ablauf ist zu bauen, und
OWASP ist dabei erfreulich konkret. Was gelten muß:

| Anforderung | Wörtlich |
|---|---|
| Zufall | „Generated using a **cryptographically secure random number generator.**" |
| Länge | „Sufficiently long to protect against brute-force attacks." — die Zahl nennt diese Seite **nicht** |
| Speicherung | „**Stored securely**" — nicht im Klartext |
| Einmalig und befristet | „**Single use and expire** after an appropriate period." / „Invalidated after they have been used." |
| Benutzerbindung | „**Linked to an individual user** in the database." |
| Keine Auskunft | „Return a **consistent message for both existent and non-existent accounts.**" + „Ensure that the time taken for the user response message is **uniform.**" |
| Kein Kontozustand vor dem Token | „**Do not make a change to the account until a valid token is presented**, such as locking out the account." |
| Gegen Massenanfragen | Rate-Limiting **pro Konto**, CAPTCHA oder gleichwertig; „Implement appropriate protection to prevent users from **brute-forcing tokens in the URL.**" |
| Die Adresse | „Don't rely on the **Host header** while creating the reset URLs … hard-coded, or validated against a list of trusted domains. Ensure that the URL is using **HTTPS.**" |
| Kein Referrer-Leck | „Referrer Policy tag with the **`no-referrer`** value." |
| Nach dem Reset | „**Don't automatically log the user in.**" + Bestätigungsmail **ohne** Paßwort |
| Sitzungen | „Ask the user if they want to invalidate all of their existing sessions, **or** invalidate the sessions automatically." — eine **Wahl**; zwingend erst bei vermuteter Kompromittierung: „After successful recovery, **invalidate existing sessions and outstanding password reset and recovery links** or codes so they cannot restore an attacker's access." |
| Nicht sperren | „Accounts **should not be locked out** in response to a forgotten password attack." |

Quelle durchgängig: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

**Die eine Zahl, die fehlt — und wie ich sie begründe.** Das Forgot-Password-Cheatsheet nennt
**keine** Entropie. Drei andere Quellen nennen drei Zahlen:
[Session Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
„at least **128 bits** of entropy; prefer 160 bits or more",
[NIST SP 800-63B §4.2.1](https://pages.nist.gov/800-63-4/sp800-63b.html) für Wiederherstellungscodes
„**SHALL** include at least **64 bits**",
[ebd. §3.2.12](https://pages.nist.gov/800-63-4/sp800-63b.html) für generische Zufallswerte „at least … **112 bits**".

**Meine Wahl: 32 Zufallsbytes = 256 Bit**, also genau das, was `randomToken(32)` heute schon
liefert. Die strengste der drei Zahlen ist 128 — 256 Bit erfüllt sie mit Abstand, kostet nichts
und ist **dieselbe Funktion**, die Sitzungstoken erzeugt. Eine zweite Zufallsquelle mit
eigener Länge wäre eine zweite Stelle, an der man es falsch machen kann.

**Warum der `token_hash` ein schneller Hash sein darf.** Weil das Token 256 Bit Zufall hat —
dieselbe Begründung wie bei API-Schlüsseln (ASVS 6.5.2: ≥ 112 Bit → Standard-Hash genügt).
Ein Argon2id auf ein Reset-Token zu rechnen wäre der DoS-Verstärker, den OWASP an anderer
Stelle beschreibt.

## 5. (c) Der Anbieter-Schlüssel — hier ist die echte Lücke

Das ist der einzige der drei Fälle, in dem **Verschlüsselung** die Antwort ist. Der Server
muß den Schlüssel benutzen können, also muß er ihn entschlüsseln können.

**Der Bestand ist angelegt, aber nicht angeschlossen.** Gemessen:

* `user_secrets` hat `value_cipher bytea`, `wrapped_key bytea`, `master_key_version integer`
  — das ist genau das Umschlagverfahren (DEK je Zeile, mit dem KEK gewrappt).
* **`PMH_MASTER_KEY` wird von keiner Zeile Code gelesen** (0 Treffer über alle Typdateien).
  Das Schema kann heute nichts aufnehmen, was jemand wieder entschlüsseln könnte.
* `.env.example:80–102` verspricht an drei Stellen, daß Anbieter-Schlüssel dort verschlüsselt
  liegen — und benennt das Problem der Umgebungsvariable selbst: `/proc/self/environ` ist für
  jeden lesbar, der im selben Container etwas ausführen darf.

**Was OWASP zum Umschlagverfahren verlangt:**

> „The **Data Encryption Key (DEK)** is used to encrypt the data. The **Key Encryption Key
> (KEK)** is used to encrypt the DEK. For this to be effective, **the KEK must be stored
> separately from the DEK.** The encrypted DEK can be stored with the data, but will only be
> usable if an attacker is able to also obtain the KEK, which is stored on another system.
> **The KEK should also be at least as strong as the DEK.**"
> — [OWASP Cryptographic Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

**Der Entwurf — ein Schlüsselgeber hinter einem Seam, drei Stufen.** Das Muster ist bewußt
dasselbe wie beim LLM-Adapter: **erst der Seam, dann die Stufen.** Die kleinste Stufe läuft
heute, die stärkste wird möglich, ohne die Aufrufer zu ändern.

```
interface Schluesselgeber {
  fassung(): number                                  // der aktuelle master_key_version
  entpacke(wrapped: Uint8Array, fassung: number): Uint8Array   // KEK -> DEK
  verpacke(dek: Uint8Array): { wrapped: Uint8Array; fassung: number }
}
```

| Stufe | KEK liegt | Schützt gegen | Kostet |
|---|---|---|---|
| **1 — Datei** | Datei `0600` **außerhalb** des Repos, Pfad aus `PMH_MASTER_KEY_FILE` | DB-Dump, Backup, Replikat, SQL-Injektion, neugieriger DBA | nichts; **läuft lokal, aber ein Host-Administrator liest mit** |
| **2 — Docker-Secret / eigener Container** | Docker-Secret oder ein zweiter, getrennter Dienst | zusätzlich: Neustarts, versehentliche Protokolle, Image-Layer | ein Betriebsschritt |
| **3 — Vault Transit oder KMS/HSM** | **nie im Anwendungsprozeß** | zusätzlich: der Host-Administrator — mit **Prüfpfad** und getrennter Richtlinie | ein zusätzlicher Dienst mit eigener Ausfallart; OWASP verlangt Break-Glass-Prozesse |

**Warum Stufe 1 nicht als Endstand verkauft werden darf.** Wegen des OWASP-Satzes oben: bei
App, KEK und Datenbank auf demselben Rechner ist die Trennung **nominell**. Stufe 1 ist ein
echter Gewinn gegen den DBA und gegen jede Kopie der Datenbank — und **kein** Gewinn gegen
einen Administrator des Rechners. Das muß dastehen, sonst ist es ein Versprechen, das die
Architektur nicht hält.

**Und die Gegenstimme zu Stufe 3, die dazugehört.** AWS sagt über sein **eigenes** stärkstes
Angebot (external key store, „HYOK"):

> „For most workloads, the additional operational burden and greater risks to availability and
> performance **will exceed the perceived security benefits** of external key stores."
> — [AWS KMS Kryptografie-Grundlagen](https://docs.aws.amazon.com/kms/latest/developerguide/kms-cryptography.html)

Das ist der Anbieter, der daran verdient, und er rät für die meisten Lasten ab. **Für dieses
Projekt heißt das:** Stufe 3 ist eine Entscheidung, die einen zweiten Dienst, eine eigene
Ausfallart und Break-Glass-Prozesse mitbringt. Sie ist richtig, wenn mehrere Benutzer und
echte Fremddaten dazukommen — und **falsch als erste Ausbaustufe**, weil sie Betriebsrisiko
schafft, bevor es Daten gibt, die sie schützt. Die Reihenfolge in Abschnitt 6 folgt daraus.

**Was noch zum Umschlagverfahren gehört, damit es nicht nachträglich weh tut:**

* **`key_id` und Algorithmus mit jedem Chiffrat** — Krypto-Agilität. `user_secrets` hat
  `master_key_version`, aber **keine** Angabe des Algorithmus. Ein Feld `alg` gehört dazu,
  sonst ist ein Wechsel von AES-256-GCM eine Datenmigration statt einer Fallunterscheidung.
* **AAD binden.** Der Chiffrat darf nicht zwischen Zeilen oder Mandanten verschiebbar sein.
  `user_id` und `ref` gehören als Additional Authenticated Data hinein — sonst kann jemand mit
  Schreibzugriff auf die Tabelle ein Chiffrat von A nach B kopieren. (Das ist dieselbe
  Fehlerklasse wie B-S1: die Datenbank fragt nicht, wem eine Zeile gehört.)
* **Rotation ist Rewrapping, nicht Neuverschlüsselung.** OWASP: *„Retire a Key Encryption Key
  (KEK), re-wrap stored Data Encryption Keys (DEKs) under the replacement KEK before destroying
  the old one. **Rewrapping leaves the DEKs unchanged** and does not reset their cryptoperiods
  or usage limits."* — [Key Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)
* **Rotation ist kein Ersatz für Unlesbarkeit.** Hashing macht ein Geheimnis unlesbar;
  Rotation verkürzt nur das Zeitfenster. Das sind zwei verschiedene Dinge, und der Bestand
  braucht **beide**.

## 6. Die Lücken dieses Projekts — und die Reihenfolge

| # | Lücke | Beleg | Aufwand |
|---|---|---|---|
| **B-K1** | Kein Code liest `PMH_MASTER_KEY` → das Umschlagverfahren ist ein Schema ohne Schlüsselgeber | 0 Treffer in `packages/**/*.ts` | **mittel** — Seam + Stufe 1 + Tests |
| **B-K2** | Der Passwort-Reset ist nicht gebaut; `one_time_tokens` wird von keiner Zeile Code benutzt | `one_time_tokens` nur in Schema und Tests | **mittel** — Ablauf nach Abschnitt 4 |
| **B-K3** | Kein Erzeuger und kein Prüfer für API-Schlüssel; die Entropie ist nirgends erzwungen | 0 Treffer | **klein** — nach Abschnitt 3 |
| **B-K4** | Kein Pepper; ein Dump erlaubt das Offline-Prüfen eines bekannten Schlüssels | `tokenHash` = nacktes SHA-256 | **klein** — ein Feld + HMAC |
| **B-K5** | Der Hauptschlüssel liegt als Umgebungsvariable; Datei/Docker-Secret/Vault sind **benannt, aber nicht gebaut** | `.env.example:95–98` | **klein** für Stufe 1, **groß** für Stufe 3 |

**Die Reihenfolge, die ich empfehle — nach Wirkung je Aufwand:**

1. **B-K3 + B-K4** (klein, und sie machen die bereits richtige Speicherung **haltbar**). Ohne
   erzwungene Entropie ist das heutige SHA-256 eine Behauptung.
2. **B-K2** (der Reset — sonst ist ein vergessenes Paßwort ein gesperrtes Konto).
3. **B-K1** (der Schlüsselgeber, Stufe 1). Erst damit existiert Fall (c) überhaupt.
4. **B-K5 Stufe 2** und **Stufe 3**, wenn ein zweiter Benutzer dazukommt.

## 7. Was diese Datei **nicht** behauptet

* **„Egal wie" ist nicht erreichbar** — und der Standard sagt es selbst. Gegen einen
  Datenbank-Administrator: ja. Gegen einen Host-Administrator: nur mit HSM/KMS. Gegen den
  Administrator des KMS: überhaupt nicht technisch, sondern durch Richtlinie und Protokoll —
  und selbst der Prüfpfad ist abschaltbar (Abschnitt 2).
* **Jede Umschlagkette endet im Klartext.** AWS sagt es selbst: *„eventually, one key must
  remain in plaintext."* Es gibt keine Konstruktion, die das umgeht; es gibt nur die Wahl,
  **wer** diesen Schlüssel sehen kann.
* **Auch der Speicher ist nicht zu sichern.** OWASP Secrets Management: *„if an attacker
  already has access to the memory of the process handling the secret, by that time a security
  breach may have already occurred. … **The only foolproof approach** to protecting memory
  against these and similar attacks is to fully physically isolate your process memory from
  all other untrusted processes."* Für dieses Projekt: kein eigener Speicherschutz vorgesehen
  und keiner gebaut.
* **Suchbare Verschlüsselung ist kein Ausweg — sie leckt konstruktionsbedingt.** In **keinem**
  der geprüften Standards geregelt (**nicht belegt** als Empfehlung); belegt sind nur die
  Leckagen: *„Searchable encryption schemes typically reveal some formally-defined
  information, known as leakage"* (NIST CSRC, „Revisiting Leakage in Searchable Encryption"),
  und Vault Transit Version 2 war *„susceptible to offline plaintext-confirmation attacks,
  which could allow attackers to brute force decryption if the plaintext size was small."*
  Das betrifft **direkt** die RAG-Frage: wer verschlüsselte Daten durchsuchen will, tauscht
  Vertraulichkeit gegen Suchbarkeit.
* **Kein Betrieb ohne Ausfallart.** Fällt der KMS aus, kann die Anwendung nicht entschlüsseln.
  OWASP verlangt dafür Break-Glass-Prozesse, und die sind nicht gebaut.
* **Stufe 1 ist nicht Stufe 3.** Heute liegen App, KEK und Datenbank auf demselben Rechner
  (gemessen: ein Compose-Stapel). Jede Aussage, die mehr verspricht, wäre falsch.
* **Die Empfehlung zu einem Pepper für API-Schlüssel ist Praxis, keine Norm.**
  [apikeys.guide](https://apikeys.guide/docs/implementation/validation-and-lookup) sieht nur ein
  Salt vor. Die Übertragung aus dem Paßwort-Kontext ist meine Folgerung, nicht ein Zitat.
* **Ein Zitat dieser Datei ist unbestätigt.** Der PCI-DSS-Wortlaut (Anforderung 3.7.6) stammt
  aus einer gespiegelten Fassung, weil die offizielle Ablage nicht erreichbar war. Er ist als
  unbestätigt gekennzeichnet und darf nicht als geprüfte Norm weitergegeben werden, bevor das
  jemand nachholt.
* **Argon2id steht auf dem Minimum, nicht darüber.** Eine Erhöhung ist eine Betriebsentscheidung
  und muß auf der Zielmaschine gemessen werden — bei 19,7 ms ist reichlich Platz, aber die
  Entscheidung ist nicht meine.

## 8. Quellen

* [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
* [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
* [OWASP Key Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)
* [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
* [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
* [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
* [NIST SP 800-63B, Digital Identity Guidelines](https://pages.nist.gov/800-63-4/sp800-63b.html)
* [apikeys.guide — Validation and Lookup](https://apikeys.guide/docs/implementation/validation-and-lookup)
* [HashiCorp Vault — Transit secrets engine](https://developer.hashicorp.com/vault/docs/secrets/transit)
* [AWS KMS — envelope encryption](https://docs.aws.amazon.com/kms/latest/developerguide/kms-cryptography.html)
* [Stripe — API key best practices](https://docs.stripe.com/keys-best-practices)

Die vollständigen Zitatketten mit 12 dokumentierten Widersprüchen liegen unter
`.pmh-build/security-audit/run-1/recherche-passwort-und-apikeys.md` (770 Zeilen). Dort ist
jede Aussage als `[VERLANGT]` / `[EMPFOHLEN]` / `[PRAXIS]` eingeordnet — hier steht nur, was
für den Entwurf zählt.
