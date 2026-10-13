# Sammelstelle aller Befunde

> **Wozu diese Datei.** Der Betreiber hat angeordnet: *„alles ansammeln"*. Die Befunde
> dieses Projekts liegen verstreut — in `docs/protokoll/aufsicht/` (Aufsicht, B1–B37), in
> `docs/review/` (eigene Prüfungen), in Berichten von Fremdwerkzeugen und im Vollaudit unter
> `.pmh-build/security-audit/`. Diese Datei ist der **eine Ort**, an dem alle stehen.
>
> **Regel (Hausregel H6 der Aufsicht):** korrigiert wird durch einen **neuen** Eintrag, nie
> durch Überschreiben. Ein Befund, der erledigt ist, wird als erledigt **gekennzeichnet**,
> nicht gelöscht. Was nie existierte, wird nicht behauptet.
>
> **Stand:** 13.10.2026, Quellstand `c4d8b63`.

## Wie man diese Datei liest

| Spalte | Bedeutung |
|---|---|
| **ID** | stabiler Name; `B-` = eigener Befund, `A-` = Aufsicht, `CR-` = Fremdprüfung CodeRabbit, `V-` = Vollaudit |
| **Schwere** | kritisch / hoch / mittel / niedrig / Hinweis — vergeben **nur** für bestätigte Befunde |
| **Status** | **offen** · **behoben** · **gemeldet, nicht angefasst** (fremder Schreibbereich) · **unbelegt** (braucht eine andere Vertrauensstufe) · **zurückgewiesen** |
| **Beleg** | der Befehl, die Messung oder die Datei, die den Befund trägt — keine Behauptung ohne Beleg |

---

## 1. Sicherheit — Datenbank und Mandantentrennung

| ID | Schwere | Befund | Status | Beleg |
|---|---|---|---|---|
| **B-S1** | mittel | Die Datenbank erzwingt **keine Mandantentrennung** an den Verweisen. Ein Fremdschlüssel zeigt auf den Primärschlüssel der Vaterspalte, nie auf einen zusammengesetzten Schlüssel mit Eigentümer. Nachgewiesen: eine Sitzung von Mandant B nimmt eine Sitzung von Mandant A als Elternteil an, und Sitzung wie Chat von B nehmen A's Arbeitsbereich an. Row-Level-Security ist auf **allen elf** Tabellen aus. | **offen** | `docs/review/sicherheits-befunde.md` §B-S1. Messung: `INSERT … parent_session='sitzung-von-A'` mit `user_id` von B gelingt; `pg_class.relrowsecurity = f` für alle Tabellen in `pmh` |
| **B-S1b** | mittel | **Mein eigener Behebungsvorschlag zu B-S1 war nicht ausführbar — von der Aufsicht widerlegt.** Ich hatte den zusammengesetzten Fremdschlüssel mit `ON DELETE SET NULL` vorgeschlagen und die Spannung zu `NOT NULL` als „offene Entwurfsfrage" abgelegt. Gemessen: PostgreSQL führt `SET NULL` auf einem zusammengesetzten Verweis als `UPDATE … SET workspace_id = NULL, user_id = NULL` aus und **scheitert** an `user_id NOT NULL`. Der Weg ist richtig, die Löschregel muß `NO ACTION` (oder `CASCADE`) lauten. | **behoben** — Vorschlag in `docs/review/sicherheits-befunde.md` §B-S1 korrigiert, Behebung lautet jetzt `ON DELETE NO ACTION` | Messung der Aufsicht: `docs/protokoll/aufsicht/hilfen/mandantentrennung-probe.sql`, Lauf 13.10.2026 16:33, an eigenen Wegwerf-Tabellen mit `ROLLBACK`. Der Verweis **weist ab**: `violates foreign key constraint "chat_raum_same_user_fkey"` |
| **B-S1a** | unbelegt | Erreicht ein mandantenfremder `workspace_id`-Verweis einen **Lesepfad**? Eine Abfrage allein über `workspace_id` gibt es heute nicht (`workspace_id` kommt im Anwendungscode nur in Tests vor, 3 Treffer). | **unbelegt** | `docs/review/sicherheits-befunde.md` §B-S1 „Was daraus folgt — und was nicht belegt ist" |
| **B-S2** | niedrig | Migration 0003 hat **zwei Objekte nicht mit umbenannt**, obwohl sie im selben Atemzug begründet, warum das nötig ist: `sessions_user_id_fkey` und `sessions_pkey` liegen weiter auf `auth_sessions`. | **offen** | `pg_constraint` und `pg_indexes`: `sessions_pkey` auf `pmh.auth_sessions`. Gefunden durch **Nachzählen** aller 29 Indizes, nicht durch Hinsehen |
| **B-S3** | Hinweis | `messages.content_cipher` ist `bytea` und die **einzige** Inhaltsspalte. `tsvector`, `pg_trgm` und `unaccent` können darüber nichts finden — verschlüsselter Text hat keine Wörter. Für RAG heißt das: Einbetten erfordert Klartext, also eine Entscheidung über den Zugriff des Einbettungsdienstes. | **offen** (Entwurfsentscheidung) | `information_schema.columns`; `docs/review/rag-und-obsidian-bereitschaft.md` §3.2 |
| **B-S4** | Hinweis | Es gibt **keine** Vektor- und keine Volltext-Infrastruktur: 0 Spalten `vector`, 0 Spalten `tsvector`, 0 von 29 Indizes mit `gin_trgm_ops`/`to_tsvector`. pgvector 0.8.7 ist aber **angelegt**. | **offen** (Ausbaustufe) | `pg_extension` → `vector 0.8.7`; `pg_indexes` |

## 2. Geheimnisse — Anforderung des Betreibers vom 13.10.2026

Anforderung wörtlich: *„Datenbank vor allem API keys sollten nicht von admin gelesen werden
können egal wie … inkl passwort aber passwort sollte resettet werden können"*.

**Der Beleg und der Entwurf stehen in [`geheimnisse-entwurf.md`](geheimnisse-entwurf.md)** —
Stand der Technik mit wörtlichen Zitaten, die Ebenen-Unterscheidung (Datenbank-Administrator /
Host-Administrator / KMS-Administrator), der Entwurf für dieses Schema und die ehrliche Grenze.
Kurzfassung der Antwort: **die Frage zerfällt in drei**, und für zwei davon ist der Bestand
schon richtig (Hash) — für die dritte fehlt der Schlüsselgeber.

**Was der Bestand schon richtig macht** (gemessen):

| Was | Stand | Beleg |
|---|---|---|
| Passwort | **Argon2id** `m=19456, t=2, p=1` — ein Hash, aus dem sich nichts ableiten läßt | `packages/auth/auth/src/index.ts:118` |
| Passwort, **Kosten auf dieser Maschine** | **Median 19,7 ms** (min 18,4 · max 21,2, 12 Läufe, nach 3 Aufwärmläufen). OWASP verlangt, die Parameter auf dem Zielsystem zu messen, Ziel < 1000 ms — **erfüllt, mit Faktor 50 Luft**. Speicher 19,0 MiB je Hash → bei 1,9 GiB Spitze ~100 gleichzeitige Anmeldungen | eigene Messung mit `Bun.password.hash`, 13.10.2026 |
| Passwort, **Stand der Parameter** | **genau auf** dem OWASP-Minimum, nicht darüber | wörtlich: „Use [Argon2id] with a minimum configuration of 19 MiB of memory, an iteration count of 2, and 1 degree of parallelism" — [Password Storage CS](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| Sitzungs- und CSRF-Token | 32 Zufallsbytes (256 Bit) aus `crypto.getRandomValues`, gespeichert als **SHA-256** | `packages/auth/auth/src/index.ts:342,365` |
| Anbieter-Schlüssel | **Umschlagverfahren** angelegt: `value_cipher`, `wrapped_key`, `master_key_version` | `packages/auth/db-schema/migrations/0001_identitaet.sql:143` |
| API-Schlüssel | nur `key_id` (Klartext-Präfix) + `token_hash` (64 Hex) — **kein** Klartext | ebd.:89 |
| Passwort-Reset | braucht **keinen** Datenschlüssel → kein Datenverlust beim Reset | weil Hash und Datenschlüssel getrennt sind |

**Der Standard für die Speicherung von API-Schlüsseln, wörtlich — und er bestätigt den
Bestand.** NIST SP 800-63B verlangt für diese Geheimnisklasse: *„All look-up secrets
**SHALL** be stored in a hashed form using an approved hashing function."*
([NIST SP 800-63B §5.1.1.2](https://pages.nist.gov/800-63-4/sp800-63b.html#lookupver)) Und
OWASP ASVS 6.5.2 ergänzt die Bedingung, unter der ein **schneller** Hash genügt:
*„A standard hash function can be used if the secret has 112 bits of entropy or more."*
Ein langsamer Hash (Argon2) wäre hier **falsch** — er wirkt nur gegen das Erraten
niederentropischer Passwörter und kostet bei jeder Anfrage.

**Daraus folgt die Bedingung, die dieses Projekt noch nicht erfüllt:** die Entropie der
API-Schlüssel muß **erzwungen** werden, nicht angenommen. Deshalb **B-K3** und **B-K4**.

| ID | Schwere | Befund | Status | Beleg |
|---|---|---|---|---|
| **B-K1** | hoch | **Kein Code liest `PMH_MASTER_KEY`.** Die Umschlagverschlüsselung ist ein Schema ohne Schlüsselgeber: `user_secrets` kann heute nichts aufnehmen, was jemand wieder entschlüsseln könnte. Die `.env.example` verspricht an drei Stellen, daß Anbieter-Schlüssel dort verschlüsselt liegen. | **offen** | 0 Treffer für `PMH_MASTER_KEY` in `packages/**/*.ts` (Muster über alle Typdateien). `.env.example:80–102` |
| **B-K2** | hoch | **Der Passwort-Reset ist nicht gebaut.** Die Tabelle `one_time_tokens` (Zweck, `token_hash`, `expires_at`, `consumed_at`) existiert, wird aber von **keinem** Anwendungscode benutzt. Ohne Reset ist ein vergessenes Passwort ein gesperrtes Konto. | **offen** | `one_time_tokens` erscheint nur in Schema und Tests, nie in `packages/**/src` |
| **B-K3** | mittel | **Es gibt keinen API-Schlüssel-Erzeuger und keinen Prüfer.** Die Tabelle ist da; wer einen Schlüssel ausstellt, wie er geprüft wird und wieviel Entropie er hat, ist nirgends festgelegt. Die Entropie ist die Voraussetzung dafür, daß das nackte SHA-256 im `token_hash` trägt. | **offen** | 0 Treffer für eine Erzeuger-Funktion; nur `newSessionToken`/`newCsrfPair` existieren |
| **B-K4** | mittel | **Kein Pepper für API-Schlüssel.** Ein Datenbank-Dump erlaubt heute jedem, einen geratenen oder anderweitig bekannten Schlüssel **offline** gegen den Hash zu prüfen. Bei 128 Bit Zufall ist das kein praktischer Angriff — die Entropie muß aber **erzwungen** werden, sonst ist die Begründung hohl. | **offen** (Entwurfsentscheidung) | `tokenHash` = nacktes `Bun.CryptoHasher('sha256')` |
| **B-K5** | Hinweis | Der Hauptschlüssel liegt als Umgebungsvariable vor. Die `.env.example` benennt das Problem selbst (`/proc/self/environ` ist für jeden im selben Container lesbar) und nennt Datei `0600`, Docker-Secret oder Vault als Betriebsweg — **gebaut ist keiner davon**. | **offen** | `.env.example:95–98` |

## 3. Fremdprüfung CodeRabbit (13.10.2026)

`coderabbit review --agent --base-commit 782f89d`, `status: review_completed`, 4 Befunde,
alle `minor`.

| ID | Schwere | Befund | Status |
|---|---|---|---|
| **CR-1** | minor | `benchmarks/messtechnik/lauf.mjs`: die Aufwärmprüfung berechnete `ok`, der Text begann aber **fest** mit `ok  ` — ein Befund hätte Erfolg gemeldet, während der Exit-Code 1 war. Dieselbe Sorte falscher Treffer wie in der quadratischen Gegenprobe, nur andersherum. | **behoben** (Commit `c4d8b63`), Text und `ok` kommen jetzt aus derselben Bedingung |
| **CR-2** | minor | `docs/protokoll/aufsicht/protokoll.md:2619` — B37 und V10 stehen in **einer** Tabellenzeile. | **gemeldet, nicht angefasst** — `docs/protokoll/` ist der Schreibbereich der Aufsicht (H3) |
| **CR-3** | minor | `native/flock/src/lib.rs`: die `# Panics`-Dokumentation zu `borrow_raw` soll nennen, daß ein negativer Wert panisch abbricht. | **gemeldet, nicht angefasst** — unversioniertes fremdes Werk im Arbeitsbaum |
| **CR-4** | minor | `services/pmh-nix/internal/state/state.go`: `Open` soll Schema-1-Zustandsdateien annehmen und beim Laden auf das aktuelle Schema heben. | **gemeldet, nicht angefasst** — unversioniertes fremdes Werk im Arbeitsbaum |

**Und ein Hinweis zur Datenübermittlung, der dazugehört.** Der Aufruf sollte auf meine zwei
Commits begrenzt sein (`--base-commit 782f89d`). Tatsächlich hat der Dienst **36 Dateien**
geprüft — darunter die fremden, unversionierten Dateien aus `services/pmh-nix`,
`services/pmh-attach` und `native/flock`. Der Arbeitsbaum ist Teil des Standardumfangs, auch
mit `--base-commit`. Vorher geprüft: **keine** Geheimniswerte im Diff (Muster für Passwort,
Secret, Token, Private Key und Zugangsdaten in URLs: 0 Treffer; die 2 Treffer für `api_key`
sind Dokumentationstext über eine leere Zeile `DEEPSEEK_API_KEY=`).

## 4. Aufsicht (B1–B37)

Die Aufsicht führt ihre eigenen Befunde in `docs/protokoll/aufsicht/befunde.md` und ihre
Offen-Tabelle in `docs/protokoll/aufsicht/LAGE.md`. Sie werden hier **nicht** abgeschrieben —
eine zweite Kopie wäre eine zweite Wahrheit, die auseinandergeht.

**Was hier steht, ist der Verweis:** `docs/protokoll/aufsicht/befunde.md` (Befunde mit
Nachweis), `docs/protokoll/aufsicht/LAGE.md` (was offen ist, mit Reihenfolge).

Drei davon sind erledigt und werden dort als erledigt geführt: **B13** (`$pid` in
PowerShell ist schreibgeschützt), **B16** (die Core-API ist erreichbar, nicht ausgefallen),
**B20** (Bereitschaft ohne Sonden meldete „ok" statt „ungeprüft").

## 5. Vollaudit

| ID | Schwere | Befund | Status |
|---|---|---|---|
| — | — | Der Vollaudit (`standard`, Quellstand `c4d8b63`, Ausgabe unter `.pmh-build/security-audit/run-1/`) läuft. Seine Befunde kommen **hierher**, sobald `findings.json` geschrieben und geprüft ist. | **läuft** |

Die Meta-Angaben des Laufs — Umfang, Ausnahmen, Abweichungen vom Verfahren — stehen in
`.pmh-build/security-audit/run-1/run-metadata.json`. Zwei Abweichungen sind dort **benannt**
statt verschwiegen: der Ausgabeort liegt im Projekt statt unter `~/security-audit-skill/`
(Weisung des Betreibers), und es gibt **keinen** OS-erzwungenen Sandkasten für
zielgesteuerten Code — deshalb wurde kein zielgesteuerter Code ausgeführt.

## 6. Hinweise ohne Sicherheitsbezug

| ID | Befund | Beleg |
|---|---|---|
| **H-1** | **48 von 55 Paketordnern sind leer.** Nur sieben enthalten Quelldateien (`agent`, `api`, `auth`, `core`, `llm`, `units`, `util`). Die leeren sind Reste der Vorlage und für Git unsichtbar, weil es keine Dateien gibt. Sie sehen aber wie geplante Pakete aus und werden beim Lesen für Arbeit gehalten. | Verzeichniszählung über `packages/*`, ohne `node_modules` |
| **H-2** | **`docs/review/stack-aufklaerung.md:82` ist überholt.** Dort steht „pgvector **nicht installiert**, Redis ungenutzt". Gemessen ist pgvector **0.8.7 installiert und angelegt**. Wer der Bestandsaufnahme glaubt, hält den Vektorweg für versperrt. | `pg_available_extensions` und `pg_extension` |

## 7. Last, Neuladen und Suche (gemessen 13.10.2026)

Vollständig in [`last-und-suche.md`](last-und-suche.md). Alle Zahlen aus `pgbench` gegen eine
**Wegwerf-Datenbank** `pmh_bench` (danach `DROP DATABASE`, Rückstand geprüft: 0); die echte
Datenbank unberührt (1 Benutzer, 1 Arbeitsbereich, 20 Chats, 10 000 Nachrichten, Fassung 3).

| ID | Schwere | Befund | Status | Beleg |
|---|---|---|---|---|
| **B-L1** | mittel | **Ein `UPDATE` je Nachricht auf die Chat-Zeile kostet 88 % des Durchsatzes.** Isoliert bei 10 Clients im selben Chat: nur Einfügen **8 030 tps**, mit `message_count` **938 tps**, mit `updated_at` (indiziert) **775 tps**. Ursache ist die Zeilensperre auf derselben `chats`-Zeile, nicht ein Indexproblem. Dazu: nur **13,1 %** HOT-Updates, weil `updated_at` im Index `chats_user_recent_idx` liegt. | **offen** | `pgbench -f bench_f/g/h.sql -c 10 -T 15`; `pg_stat_user_tables` (78883 Updates, 27 HOT vor der Behebung) |
| **B-L2** | mittel | **Die Verbindungsgrenze ist 100 (97 nutzbar) und wird vor der Datenbank erreicht.** Ein Lauf mit 100 Clients scheiterte vollständig: `FATAL: remaining connection slots are reserved for roles with the SUPERUSER attribute`. Eine Verbindung je Agent ergibt bei 10 Nutzern × 3 Agenten × 2 Unteragenten **90** — die Grenze ist dann erreicht, ohne daß die Datenbank gefordert war (2 400 von ~8 000 tps). | **offen** | `show max_connections` → 100; `show superuser_reserved_connections` → 3 |
| **B-L3** | mittel | **Der JSONL-Schreibpfad kostet Faktor 64 — und gibt trotzdem keine Haltbarkeit.** `flushEvery: 1` (die Vorgabe) ≈ 600–632 ms für 2000 Ereignisse gegen 9,4–12,0 ms gebündelt; Ursache ist die **Zahl der Aufrufe**, nicht die Reihenfolge und nicht ein `fsync`. Und: im ganzen Paket **null** Treffer für `sync(`/`fsync`/`datasync` — der Core synct an **fünf** Stellen. `flushEvery: 1` kauft Reihenfolge, keinen Sync. | **offen** | `benchmarks/session-open/lauf.mjs`; Mustersuche über `packages/agent/session-persistence-jsonl` |
| **B-L4** | hoch | **Eine Sitzung, zwei Prozesse: stiller Datenverlust möglich.** Die Versprechenskette wirkt nur **innerhalb** eines Prozesses. `schneideAbgebrocheneZeileAb` schreibt die Datei beim Öffnen mit `writeFile` **neu** (`src/index.ts:544`) — ein zweiter Prozeß, der gerade angehängt hat, verliert seine Ereignisse. Genau der Fall „Agent und Unteragent". | **offen** | `src/index.ts:226` (Kette), `:544` (`writeFile`) |
| **B-L5** | mittel | **Zwei Kopien desselben Inhalts — eine verschlüsselt, eine im Klartext.** `messages.content_cipher` ist verschlüsselt; der Ereignisstrom `.jsonl` wird mit `appendFile(path, block, 'utf8')` als **JSON-Klartext** geschrieben (`src/index.ts:308`). „Verschlüsselung at rest" gilt damit nur für **eine** Kopie. Positiv: der Strom liegt **außerhalb** der Datenbank, ein DBA kommt nicht heran. | **offen** (Entwurfsentscheidung) | `src/index.ts:308`; kein Verschlüsselungsschritt im Paket |
| **B-L6** | Hinweis | **Der Atomaritätsbefund der Anhänge ist eine Beobachtung, keine Zusicherung.** 8 gleichzeitige Schreiber, 120 Zeilen je Schreiber, Zeilengrößen 600 B bis 1 MB: **960/960 Zeilen rissfrei**, je Schreiber vollständig. Das trägt, weil die Laufzeit **einen** `write()` je Ereignis absetzt — ein Umsetzungsdetail von Bun/Node und NTFS, kein Vertrag. | **Hinweis** | eigene Messung, 13.10.2026 |
| **B-L7** | mittel | **Die Ursachenangabe zu B-L3 war falsch — sie war ein Windows-Artefakt.** Auf Anregung einer Fremdprüfung **auf beiden Plattformen** nachgemessen, 2000 Zeilen à 280 Bytes: **Windows/Bun 1.4.0** — `appendFile` je Zeile 299 ms, ein Griff 36 ms, `sync` je Zeile 693 ms, Puffer + ein `sync` **2 ms**, Faktor **8,3**. **Linux (WSL2)/Bun 1.4.3** — 108 ms, 105 ms, 223 ms, **1 ms**, Faktor **1,0**. **Unter Linux kostet das Öffnen und Schließen NICHTS.** Die Aussage „das Öffnen und Schließen ist der Kostentreiber" gilt also **nur unter Windows**; die Produktion läuft auf **Linux**, und die daraus abgeleitete Empfehlung „nimm einen offenen Griff" wäre dort **wirkungslos**. Was auf **beiden** Plattformen gilt: `sync` je Ereignis ist der teuerste Weg, und **Puffer + ein `sync` kostet 1–2 ms** — der einzige Weg, der schnell **und** haltbar ist. Richtige Behebung: **bündeln und am Turn-Ende syncen**. | **Ursachenangabe behoben**; die Behebung selbst ist **offen** | Windows: `benchmarks/messtechnik/lauf.mjs`. Linux: derselbe Code unter WSL2 mit `~/.bun/bin/bun` 1.4.3, `linux x64` |
| **B-L8** | niedrig | **Zwei Steuerzeichen (Seitenvorschub, Code 12) standen an der Stelle des `f` in `flushEvery`** — `benchmarks/session-open/lauf.mjs` Zeile 72 und 74. Aus dem Namen der Vorgabe wurde `lushEvery` in einem Kommentar, den jemand liest, um genau diesen Namen zu erfahren. **Gefunden nicht durch Lesen** — ein Seitenvorschub hat keine Breite — sondern beim Nachzählen einer Zahl in derselben Datei. Ursache: ein Werkzeug hat `\f` als Escape gedeutet. | **behoben** — Zeichen ersetzt; neue Prüfung `scripts/quelltext-pruefung.mjs` samt `scripts/tests/quelltext-pruefung.test.mjs` (394 Dateien, 6 Prüfungen). **Probe:** künstlich eingebaut → 2 Treffer, Exit-Code 1; entfernt → sauber | eigener Scan über alle Quelldateien |
| **B-L9** | Hinweis | **Zwei Zahlen in `benchmarks/lauf.mjs` waren veraltet** („Acht Ordner … sieben davon leer", tatsächlich **9** Ordner, **8** Gates, **6** übersprungen). Aufgefallen ist das einer **Fremdprüfung**, nicht dem Lesen. | **behoben** — Kopf korrigiert; `benchmarks/support/tests/lauf.test.mjs` zählt die Zahlen jetzt gegen `GATES` und die Ordner auf der Platte. **Probe:** verfälschte Zahl → 2 Prüfungen rot, zurückgenommen → 7 grün | eigene Zählung |
| **B-L10** | mittel | **Die Schreibmessungen prüften nicht, ob sie Arbeit geleistet haben.** Die **Lese**messung in `benchmarks/session-open/lauf.mjs` prüfte seit dem `0,00 ms`-Fehler, daß sie lesen konnte; die **Schreib**messungen nicht — sie übergaben ihr Ergebnis ungeprüft an die Budgetprüfung. Genau die Lücke, aus der `readSession: 0,00 ms` entstand. | **behoben** — `pruefeGeschrieben` zählt vor jedem Urteil die Zeilen der Ereignisdatei (`sessionPaths(root, id).events`). **Probe in beide Richtungen:** Sitzung absichtlich falsch nachgesehen → `ROT … keine Ereignisdatei geschrieben`; zurückgenommen → echtes Urteil | `benchmarks/session-open/lauf.mjs` |

**Was entgegen der Erwartung *nicht* bricht — und das ist die gute Nachricht:** der
Selbstbezug der Sitzung. 40 gleichzeitige **Unteragenten am selben Elternteil**: **16 463 tps,
2,4 ms**. `FOR KEY SHARE`-Sperren sind miteinander verträglich. **Der Unteragenten-Baum ist
die billigste Struktur in diesem Schema** — und die Regel des Betreibers („Agent und
Unteragent wie ein Benutzer behandeln") ist damit meßbar die richtige.

**Die gemessene Kapazität in einer Zeile:** die Maschine sättigt bei **~2 400 tps**; bei 10
Nutzern ist die Datenbank **nicht** der Engpass, sondern der Schreibpfad der Sitzungsdatei.

## 8. Was diese Datei nicht behauptet

* **Keine Vollständigkeit.** Ein Lauf deckt keine 20.000 Zeilen ab. Der Vollaudit sagt am Ende
  selbst, was er **nicht** abgedeckt hat.
* **Keine Schwere ohne Bestätigung.** `unbelegt` bekommt **keine** Schwere — eine Vermutung
  mit Zahl sieht aus wie ein Ergebnis.
* **Keine zweite Kopie.** Befunde der Aufsicht werden verwiesen, nicht dupliziert.
