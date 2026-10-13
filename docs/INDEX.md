# Katalog — Dokumentation Prometheus Harness

> **Was diese Datei ist:** das Register. Jedes Dokument mit einem Satz, nach Themen
> geordnet, wie in einer Bibliothek. Wer hier landet, findet in einer Minute die richtige
> Datei — ohne im Baum zu suchen.
>
> Stand: 12.10.2026 · 17 Arbeitsdokumente, 4 Ordner im Bestand, dazu der Doku-Bestand des
> Cores mit 692 Dateien.

---

## 0. In einer Minute: worum es geht

Ein **Assistent-Agent-Harness** wird neu gebaut — nicht als Abwandlung, sondern von Grund
auf, mit dem DeepSeek Harness als **Vorlage** statt als Codebasis. Alles Zusätzliche ist
eine steckbare **Unit**: anschließbar, absteckbar, mit eigener Version. Der Core bleibt
unangetastet.

- Zielbild: [vision.md](vision.md)
- Kurzprofil in einem Dokument: [project-profile.md](project-profile.md)
- Warum überhaupt: [concept.md](concept.md)

---

## 1. Ausrichtung — *wohin das Ganze soll*

| Dokument | In einem Satz |
|---|---|
| [vision.md](vision.md) | Nordstern: Assistent-Agent-Harness mit Docking-Oberfläche, eigenem Gedächtnis, Arbeit als Forscher und Automatisierer |
| [project-profile.md](project-profile.md) | Kurzprofil: Sprachen, Infrastruktur, Vorbilder, was entschieden ist und was offen |
| [concept.md](concept.md) | Das Problem (eingenähte Anpassungen) und die Antwort: alles ist ein Unit, der Core ist unantastbar |
| [roadmap.md](roadmap.md) | Die Reihenfolge: Core läuft → ein Unit beweist die Kette → dann Sprachgrenzen |

## 2. Technik — *womit gebaut wird*

| Dokument | In einem Satz |
|---|---|
| [stack.md](stack.md) | Schichten und Sprachgrenzen: TypeScript-Core als Kernel, Go und Rust als Dienste, C als Muster |
| [risks.md](risks.md) | Die Risiken mit Gegenmaßnahmen — zuerst die ungeprüfte Bun-Frage bei nativen Addons |

## 3. Entscheidungen — *was noch zu klären ist*

| Dokument | In einem Satz |
|---|---|
| [decisions/core-supply.md](decisions/core-supply.md) | **Entschieden:** der Agent-Core kommt als Abhängigkeit vom Upstream (Weg B, Hybrid) — besessen werden nur Host, Units und Dienste |
| [decisions/hybrid-then-self-build.md](decisions/hybrid-then-self-build.md) | **Entschieden:** Hybrid ist der erste Meilenstein, Eigenbau (A) das Ziel — samt NixOS-Selbständerung, Plugin-Export, Web-Attach und den verbindlichen Subagent-Regeln |
| [decisions/open-questions.md](decisions/open-questions.md) | Der Fragenkatalog mit Abhängigkeiten: Laufzeit, Umfang des Cores, Loop, Gedächtnis, Git-Plattform, Netzwerk |
| [decisions/first-login-container-permissions.md](decisions/first-login-container-permissions.md) | **Erster Login über den Rechner selbst** (Maschinen-Claim mit Hostname, lokalem Nutzer und Gerätekennung — keine voreingestellten Zugangsdaten), Adminkonto daraus, Benutzerverwaltung durch den Admin, **container-artiges Isolationsprofil je Benutzer** (auf `SandboxPolicy` abgebildet) und — der Kern — die **Spiegelung der Befugnisse**: der Agent handelt mit den Rechten des fragenden Benutzers und niemals mit mehr. Umgesetzt in `packages/auth/permissions` (30 Prüfungen) und `packages/auth/claim` (21 Prüfungen) |

## 4. Gestaltung — *wie es aussehen und sich anfühlen soll*

| Dokument | In einem Satz |
|---|---|
| [design/ui-keep-cut.md](design/ui-keep-cut.md) | **Die Auswahl:** was aus der Web-UI-Vorlage in den neuen Harness wandert, was ersetzt wird, was entfällt |
| [design/sketches.md](design/sketches.md) | Das Varianten-Verfahren der Skizzen-Sammlung und wie wir es weiterführen |
| [design/realtime-collaboration.md](design/realtime-collaboration.md) | Zielbild: mehrere Menschen **und** Agenten bearbeiten gleichzeitig dasselbe Dokument |
| [design/README.md](design/README.md) | Einstieg in den Gestaltungsbereich samt Bildmaterial |
| [design/3d-zoom-konzept.md](design/3d-zoom-konzept.md) | Konzept (kein Code): warum die Wegdwerf-Messdatei verpixelt war, die verbindliche Koordinatensystem-Konvention, „5D" sauber in drei Begriffe zerlegt, Canvas 2D für die Welt + SVG fürs Overlay, Dolly-Zoom |

## 5. Nachschlagewerk — *Belege und Vorlagen*

| Dokument | In einem Satz |
|---|---|
| [reference/reference-dsh.md](reference/reference-dsh.md) | Gemessene Zahlen zum DeepSeek Harness: Build, TypeScript 7, was er schon kann, Fallstricke |
| [reference/reference-templates.md](reference/reference-templates.md) | Die vier festgelegten Vorlage-Verzeichnisse mit exakten Pfaden und Upstream-Adresse |
| [reference/webui-dev.md](reference/webui-dev.md) | Wie man die Web-UI-Vorlage startet, samt Fallstricken und protokolliertem Testlauf |
| [reference/skills-index.md](reference/skills-index.md) | Das Register-Format der Skill-Bibliothek — übernommenes Konzept, nicht kopierter Inhalt |
| [reference/ChatGPT-stackexplane.md](reference/ChatGPT-stackexplane.md) | Fremde Stellungnahme zum Gesamtaufbau: modulare Plattform, Schnittstellen statt Eigenbau |

## 6. Doku-Bestand des Cores — *die Vorlage selbst*

| Ordner | In einem Satz | Umfang |
|---|---|---|
| [dsh/README.md](dsh/README.md) | Einstieg in den Core-Doku-Bestand: Aufbau, Rollen der drei Ordner, Grobgliederung | — |
| [dsh/original/](dsh/README.md) | Der Doku-Stand der Vorlage, wie übernommen: 217 kanonische Dokumente, 212 chinesische Fassungen, 212 Übersetzungstabellen, 47 Schemadateien, 4 Bilder | 692 Dateien |
| [dsh/translation_en/](dsh/translation_en/README.md) | Englische Fassung aller 692 Dateien: Originale unverändert, chinesische Dokumente neu übersetzt | 692 Dateien |
| [dsh/translation_de/](dsh/translation_de/README.md) | Deutsche Fassung aller 217 kanonischen Dokumente; Stand und offene Liste stehen im Manifest | im Aufbau |

**Abdeckungsregel:** Zu **jeder** Datei in `dsh/original/` gibt es eine gleichnamige Datei in
`dsh/translation_en/` — Dateinamen samt Endung bleiben erhalten (`foo.md`, `foo.zh.md`,
`foo.i18n.yaml`, `foo.schema.json`, `bild.png`). `translation_en/foo.zh.md` enthält die
**englische** Übersetzung des chinesischen Dokuments.

**Regel:** `dsh/original/` ist Quelle und wird **nie** geändert. Übersetzungen liegen
ausschließlich in `translation_*` — so bleibt der Vergleich mit dem Upstream möglich.

### Batching-Regel für Übersetzungsläufe (verbindlich)

In Scope sind **genau zwei Sprachen**: Deutsch (`translation_de`) und Englisch
(`translation_en`). Mehr Sprachen gibt es nicht, mehr Arbeiter braucht es nicht.

| Regel | Bedeutung |
|---|---|
| **Ein Arbeiter pro Sprache — nicht pro Datei** | Ein Auftrag = ein ganzer Ordner (z. B. „alles unter `subsystems/`"), nie eine einzelne Datei |
| **Keine Enkel** | Ein Arbeiter startet **keine** Subagenten. Steht als wörtliche Anweisung im Auftrag |
| **Obergrenze 2–3 Arbeiter gleichzeitig** | Mehr ist Budgetverschwendung, nicht Schnelligkeit |
| **Erst messen, dann starten** | Vorher zählen, welche Dateien noch fehlen; nur die offenen an einen Arbeiter geben |
| **Große Dateien sind kein Grund zu teilen** | Eine Datei wird in mehreren Schreibvorgängen erledigt, nicht von mehreren Agenten |

**Warum das hier steht — der Vorfall vom 12.10.2026.** Der erste Übersetzungslauf eskalierte
von 12 geplanten Arbeitern auf **52 Agenten-Sitzungen**: 12 von mir gestartet, 40 von den
Arbeitern selbst nachgestartet, überwiegend eine Datei oder eine Dateigruppe pro Kind. Ursache
war kein Fehler der Harness, sondern ein Auftragsfehler: Die Aufträge listeten 18–46 Dateien
pro Arbeiter und sagten „arbeite große Dateien notfalls in mehreren Schreibvorgängen ab" —
gelesen wurde das als Lizenz zum Parallelisieren. `tool-subagent` begrenzt nur die **Tiefe**
(`maxDepth`-Default 3), nicht die **Breite**: ein Arbeiter darf beliebig viele Kinder
gleichzeitig starten. Unterbrechen half nicht, weil die Arbeiter Ersatz starteten.

**Erwartete Arbeiterzahl nach dieser Regel:** 1 je Sprache je Ordner, also **2–3 statt 12+**.
Der frühere Auftrag „je 18–46 Dateien an einen Arbeiter" ist damit ersetzt.

## 7. Stand und Nachweise — *was tatsächlich gilt*

| Dokument | In einem Satz |
|---|---|
| [status/README.md](status/README.md) | Die Regeln der Momentaufnahmen: jeder Snapshot mit Datum und Befehl, Gemessenes getrennt von Gedeutetem, der 4-Stunden-Takt und seine ehrliche Grenze |
| [status/git-audit.md](status/git-audit.md) | Jeder Push mit Nachweis: lokaler `HEAD` gegen `origin/main` über die API geprüft, samt der Entscheidung „privat" |
| [status/2026-10-12.md](status/2026-10-12.md) | Der erste Snapshot: Harness läuft (HTTP 200), Repository erstmals versioniert, und die sechs offenen Lücken L1–L6 |
| [status/arbeitspakete.md](status/arbeitspakete.md) | Das Register der Arbeitspakete mit eigener Todo-Liste je Paket, Phase und Nachweis — die Regel „abgehakt wird nur Belegtes" |
| [status/newdawn0-recherche.md](status/newdawn0-recherche.md) | Außenrecherche zur Zoom-/Chunk-Technik: NewDawn0 hat dazu **nichts** (70 Repos geprüft), jede der acht Behauptungen einzeln eingestuft — plus die gemessene float32-Grenze als eigentlicher Befund |
| [status/kleinste-kette-nachweis.md](status/kleinste-kette-nachweis.md) | **Der Nachweis der ersten vollständigen Kette**: Seam → Anbieter → Wiederholung → Loop → Werkzeuge → Sitzung → Persistenz → Wiederaufnahme. Acht Pakete, 262 Tests grün, je Testdatei gemessen — samt der zwei Fehler, die erst der durchgehende Test fand, und der namentlichen Liste dessen, was **nicht** belegt ist |
| [status/windows-start-nachweis.md](status/windows-start-nachweis.md) | Der Windows-Start (`t40`): drei `bun`-Einträge, zwei defekt; der Launcher funktioniert, der Host kommt unter Windows nativ **nicht** hoch (HTTP 200 nur unter WSL2) |
| [status/plugin-export-nachweis.md](status/plugin-export-nachweis.md) | Der Rundlauf des Unit-Exports: Export → Import → Rückexport mit **identischem** Digest (`sha256:ac37e0ec…`) |
| [status/messsonden/README.md](status/messsonden/README.md) | Vier kleine Sonden, mit denen die Messungen aus `kleinste-kette-nachweis.md` §6 nachvollziehbar sind — Laufzeitversion, Paketauflösung, Host-Start unter Windows und WSL2 |
| [status/beleg-startadresse.md](status/beleg-startadresse.md) | **Die Startadresse war unbenutzbar**: die README nannte eine Adresse, die mit **401** antwortet. Der Starter gibt jetzt die Adresse **mit** Token aus — samt der drei Fehler im eigenen Code, die erst eine Prüfung fand |
| [status/beleg-eigener-endpunkt.md](status/beleg-eigener-endpunkt.md) | **Der eigene Endpunktweg läuft im Host**: `GET /api/health` → **200** (offen), `GET /api/ready` → **401** ohne Anmeldung, **200** mit Sitzungscookie und **503** bei totem Redis — über `ctx.webServer.register`, die **Sperre des Cores** und ein **Sondenregister**. Mit den **sechs** Fehlern auf dem Weg (erfundener Lebenszyklus-Haken, falsche Patch-Form in drei Stufen, `inject` als Einhänge-Bedingung, `ctx.get` vor dem Ende von `apply`) und der Lücke in den Prüfungen, die den letzten durchgelassen hat |
| [status/beleg-installation.md](status/beleg-installation.md) | **Plug-and-Play für Windows und Linux**: ein Befehl vom frischen Klon bis zum laufenden Projekt, mit drei dünnen Hüllen (`install.cmd` / `install.ps1` / `install.sh`) und einer Logik in Bun. Gemessen: **826 Tests grün im installierten Klon**. Mit den **vier** eigenen Fehlern — `=(.*)$` scheitert an `\r` (an **zwei** Stellen), fehlende `.gitattributes` (**jede Linux-Installation wäre gescheitert**), eine Prüfung, die die Wirklichkeit verdoppelte — und **einem ungelösten** (Treiber-Import) |
| [status/mandantentrennung.md](status/mandantentrennung.md) | **Befund B-S1 geschlossen — die Datenbank erzwingt jetzt die Mandantentrennung.** Gemessen vorher: **0** zusammengesetzte Fremdschlüssel, RLS auf **11** Tabellen aus, **0** Policies. Migration `0004` legt die Trennung in die **Struktur** (11 Objekte einzeln nachgewiesen); die Probe `tests/proben/mandantentrennung.sql` zeigt vorher **3 von 4 Übergriffen angenommen**, nachher **4 von 4 mit `23503` abgelehnt**. Mit dem Fallstrick, der die Migration beinahe falsch gemacht hätte (`ON DELETE SET NULL` auf **zusammengesetzten** Schlüsseln leert auch die `NOT NULL`-Spalte), der **brechenden Änderung** `messages.user_id NOT NULL` (kein produktiver Schreiber betroffen — gemessen), einer **offengelegten Prüfsummen-Berichtigung**, fünf Nebenbefunden (M-1…M-5) und einer **eigenen Behauptung, die die Messung widerlegt hat** |
| [status/auth-verdrahtung.md](status/auth-verdrahtung.md) | **Die Anmeldung läuft gegen die eigene Datenbank.** `packages/auth/store-postgres` verbindet den Regelkern (51 Prüfungen, bis dahin **ohne Aufrufer**) mit dem Schema: `UserStore`, `SessionStore`, `AuthEventSink`. Die ganze Kette ist bewiesen — registrieren → anmelden → Sitzung → prüfen → fortschreiben → rotieren → abmelden. **41 neue Prüfungen**, 21 Pakete typprüfbar. Mit den **drei Fehlern, die erst der echte Server zeigte** (`inet::text` hängt die Netzmaske an: `203.0.113.7/32`; der Suchparameter wurde nicht kleingeschrieben; der Migrationsläufer braucht `exec` *und* `query`), **zwei Mängeln in fremden Paketen** (`db-schema` ist von außen nicht typisierbar — `TS2307` auf jede Migration; `NewUser` war nicht ausgeführt) und einem **unzuverlässigen Zeittest**, dessen Ausfallrate gemessen und dessen Mechanismus behoben wurde |
| [status/auth-im-host.md](status/auth-im-host.md) | **B1 abgeschlossen — die Anmeldung ist im Host und schreibt.** Vier Wege unter `/api/pmh/auth` (register, login, logout, me), **zehn Fälle über echtes HTTP gegen den laufenden Host: 10 von 10 wie erwartet** — inklusive der zwei, die zählen: unbekanntes und widerrufenes Token geben **wörtlich dieselbe** Meldung, und `logout` ohne CSRF ergibt 403. Gemessen vorab: der Kern besitzt `/api` als Präfix, aber `match()` sucht **zuerst exakt** — ein genauer Weg gewinnt. Mit den Entscheidungen (IP **vom Socket**, nie aus `X-Forwarded-For`; 8 KiB Körpergrenze **vor** dem Lesen; `HttpOnly` nur für das Sitzungscookie; Ausnahmen fangen, damit kein Socket offen bleibt), dem geratenen Ereignisnamen `login-ok`, den der Typlauf zu `login-success` korrigierte, und der **Sicherung**, die den Speichertest daran hindert, in die Betriebsdatenbank zu schreiben — nachdem dort drei Zeilen aus genau diesem Test gefunden wurden |
| [status/erstlogin-und-rechte.md](status/erstlogin-und-rechte.md) | **B2 abgeschlossen — die Registrierung ist ein Tor, und der Weg hinein ist ein Geheimnis auf dem Rechner.** `claim` (21 Prüfungen) und `permissions` (30) hatten **keinen Aufrufer**; jetzt entscheidet `darfAusfuehren` über `benutzer-anlegen`, und das erste Konto entsteht nur mit einem **Claim-Token** aus `claim.txt` samt Bindung an Rechner, Nutzer und Gerätekennung. **10 von 10 Fällen** über echtes HTTP gegen echtes PostgreSQL. Mit dem Fehler, den erst die **Datenbankzeile** zeigte (`register` meldete `"role":"admin"` und schrieb `user` — die Rolle erreichte die Zeile nie), der **Aussperrung**, die meine eigene Verdrahtung erzeugt hatte (`benutzer=4 admins=0` → niemand konnte mehr anlegen, im Host nachgemessen: **403 statt 401**), und **meinem eigenen schwersten Fehler**: `resolvePmhHome()` schrieb drei Dateien nach **`~/.dsh`** — zurückgenommen, belegt und durch `resolveEigenesHome()` mit **harter Sperre** unmöglich gemacht |
| [status/benutzerprofile.md](status/benutzerprofile.md) | **B3 abgeschlossen — die Isolation je Benutzer ist dauerhaft, und sie ist wörtlich die von `SandboxPolicy`.** Migration `0005` (Fassung 4 → **5**) mit fünf Bedingungen, die **dieselben drei Regeln** erzwingen wie `SandboxPolicy::validate()` in `services/pmh-sandbox`: Probe **10 von 10** auf der SQL-Seite, `cargo test` **14 pass** auf der Rust-Seite — beide weisen dieselben Fälle ab. Mit den zwei Entwurfsentscheidungen (`user_id` als Primärschlüssel statt einer künstlichen `id`; ein einfacher Fremdschlüssel, weil die Tabelle nur **eine** Mandantenangabe trägt — **keine** Ausnahme von der 0004-Regel) und dem **Beweis, daß die Tabelle einen Leser hat**: `ladeProfil`, `speichereProfil`, `akteurAus` und ein Ende-zu-Ende-Fall, in dem `GET /me` das gespeicherte Profil wörtlich zurückgibt. **Und mein schwerster Vorfall:** ich habe die **Betriebsdatenbank abgeräumt**, weil der zerstörende Schematest keine Sicherung hatte und `bun test` aus der Wurzel `.env` lädt — `auth_events` 12 → 0, gemessen, repariert und die Sicherung **vor** dem `DROP` nachgewiesen |
| [status/geheimnisse.md](status/geheimnisse.md) | **C1 und der erste Schritt von C4: es gibt jetzt eine Umschlagverschlüsselung — und der Hauptschlüssel kann aus einer Datei kommen.** Das Verfahren existierte seit Migration 0001 **nur als Schema** (`value_cipher`, `wrapped_key`, `master_key_version`, `key_hint`), und die Byte-Form war in 0002 schon vorgeschrieben (`version(1)‖nonce(12)‖ciphertext‖tag(16)`, AES-256-GCM). **29 Prüfungen** belegen nicht „es läuft", sondern die Eigenschaften: Veränderung wird **erkannt** statt Unsinn zu liefern, kein stilles AES-128, ein frischer Nonce je Verschlüsselung, und **die Rotation läßt den Geheimtext byte-gleich**. Dazu der **gemessene** Befund, der den Rechteprüfstand bestimmt: auf NTFS meldet `fs.Stats.mode` **immer `0o666`**, unabhängig von `chmod` — deshalb wird auf Windows **gesagt**, daß die Prüfung nicht möglich ist, statt einen Schutz zu behaupten. **Nachtrag 13.10.: C4 Stufe 2 ist gebaut** — die Leiter der Hauptschlüssel-Quellen steht jetzt an **einer** Stelle (`standardQuellen`: Datei → Docker-Secret → Umgebungsvariable, 8 Prüfungen), und die Docker-Quelle **prüft den Modus bewußt nicht**, weil Docker Secrets mit `0444` einhängt und die Stufe sonst immer scheiterte. `docker-compose.yml` ist **nicht** angefaßt (Wurzeldatei, anderer Agent) |
| [status/geheimnisse-ablage.md](status/geheimnisse-ablage.md) | **C1 abgeschlossen — `user_secrets` hat jetzt einen Aufrufer, und der Klartext kommt nie in die Spalte.** Fünf Funktionen in `store-postgres` auf **zwei Ebenen** (Bytes: `speichereUmschlag`/`ladeUmschlag`, entscheidet nichts; Umschlag: `speichereGeheimnis`/`ladeGeheimnis`, nimmt Klartext und Hauptschlüssel und verpackt selbst), dazu `scripts/geheimnis.mjs`, das den Wert **über stdin** annimmt statt über die Kommandozeile |
| [status/passwort-reset.md](status/passwort-reset.md) | **C2 — Passwort zurücksetzen, ohne daß die Datenbank das Geheimnis kennt.** Die Weisung *„für einen DB-Administrator unlesbar, Passwort trotzdem zurücksetzbar"* zerfällt in vier Eigenschaften, jede einzeln geprüft: in `one_time_tokens.token_hash` steht **nur** der SHA-256-Hash (32 Zufallsbytes sind nicht zu raten), ein Token gilt **genau einmal**, es läuft nach **15 Minuten** ab, und nach dem Zurücksetzen sind **alle** Sitzungen widerrufen. **22 Prüfungen** (15 ohne Infrastruktur, 7 gegen echtes PostgreSQL) — und **12 weitere, die den Aufrufer selbst fahren** (`scripts/reset.mjs`: `anfordern` / `pruefen` / `einloesen`, das neue Paßwort über **STDIN**, das Token wird ausgegeben, weil Weitergeben sein einziger Zweck ist). Die Atomarität von `verbrauche` ist bei **zwei gleichzeitigen** Aufrufen gemessen — samt eigener Sonde, die belegt, daß zwei verschiedene Backend-Kennungen wirklich gleichzeitig liefen (422 ms für zwei 400-ms-Wartezeiten). Mit **drei eigenen Fehlern**, darunter einer Behauptung im eigenen Kommentar, die der Code nicht einlöste (zwei verschiedene Ablehnungstexte = ein Orakel — behoben und die Prüfung per **Mutation** als nicht-leer nachgewiesen) und einer Attrappe, die **großzügiger rechnete als die Sache** (`laeuftAb` statt `created_at`). Der Aufrufer war nötig, weil `fuehreAus` in **allen** Skripten des Repos exportiert ist und in **keiner** Prüfung je gefahren wurde — **kein Endpunkt** dagegen offen: es gibt keinen Mailübergang, also bliebe einem Endpunkt nur, das Token im Antwortkörper zurückzugeben |
| [review/schnittstellen-bestand.md](review/schnittstellen-bestand.md) | **Welche Schnittstellen die Harness hat — und welche fehlen.** Der Core spricht **nicht REST**, sondern zwei Wege: `POST /api/<ns>/<methode>` (JSON-RPC-Rahmen) und `WS /api/remote.mux` (logische Ströme, acht Controller). Beide **gemessen**. Unser eigener Beitrag: **zwei lesende Endpunkte** — die Kette ist über **keine** Schnittstelle erreichbar |
| [review/datenbank-abgleich.md](review/datenbank-abgleich.md) | **Unsere Datenbank neben der des Kerns — und ein Namenskonflikt.** Der Kern hält in SQL nur einen **wegwerfbaren Suchindex** (`persisted_sessions`, `persisted_docs`), sein Bestand ist der JSONL-Ereignisstrom. Der Kern nennt **Gespräche** `sessions`; unsere Tabelle `sessions` sind **Anmeldungen**. Dazu: **14 Ereignisarten** im Kern gegen **unsere 9**, mit Zuordnungstabelle |
| [review/BEFUNDE-ALLE.md](review/BEFUNDE-ALLE.md) | **Die eine Sammelstelle aller Befunde** (Weisung des Betreibers: „alles ansammeln"). Stabile Kennung, Schwere, Status und Beleg je Befund; erledigt wird **gekennzeichnet**, nicht gelöscht (Hausregel H6). Befunde der Aufsicht werden **verwiesen**, nicht abgeschrieben — eine zweite Kopie wäre eine zweite Wahrheit |
| [review/sicherheits-befunde.md](review/sicherheits-befunde.md) | **Die Datenbank erzwingt keine Mandantentrennung an den Verweisen** — nachgewiesen in einer Transaktion mit `ROLLBACK`: eine Sitzung von Mandant B nimmt eine Sitzung von A als Elternteil an, Sitzung und Chat von B nehmen A's Arbeitsbereich an; RLS auf **allen elf** Tabellen aus. Dazu **B-S2**: Migration 0003 hat `sessions_user_id_fkey` und `sessions_pkey` **nicht** mit umbenannt, obwohl sie es im selben Atemzug begründet — gefunden durch **Nachzählen** aller 29 Indizes. Und der eigene Behebungsvorschlag war mit `ON DELETE SET NULL` **nicht ausführbar**; die Aufsicht hat es gemessen |
| [review/rag-und-obsidian-bereitschaft.md](review/rag-und-obsidian-bereitschaft.md) | **Ist die Datenbank bereit für RAG und Obsidian?** Die Maschine ja, das Schema nein: pgvector **0.8.7 angelegt**, aber **0** Vektorspalten, **0** `tsvector`, kein `documents`/`chunks`/`notes`. Dazu die zwei Entscheidungen, die **vor** der ersten Tabelle fallen müssen — der Mandantenfilter (ohne ihn **ist** Vektorsuche das Leck) und die Einbettung über die **verschlüsselten** Nachrichten (`content_cipher` ist `bytea`, darüber findet kein `tsvector` etwas) |
| [review/geheimnisse-entwurf.md](review/geheimnisse-entwurf.md) | **Können API-Schlüssel und Passwörter für einen Administrator unlesbar sein, und wie macht man das nach Industriestandard?** Die Frage **zerfällt in drei** — unser eigener API-Schlüssel (Hash), das Paßwort (Argon2id-Hash) und der Anbieter-Schlüssel des Benutzers (Umschlagverfahren, KEK **außerhalb** der Datenbank). Mit wörtlichen Belegen (NIST 800-63B, OWASP, ASVS, AWS KMS, PCI DSS), der Ebenen-Unterscheidung Datenbank-/Host-/KMS-Administrator, dem Befund, daß die Standards sich an einer Stelle **widersprechen** (NIST 800-57 §6.2.2.6 gegen OWASP), und der ehrlichen Grenze: „egal wie" ist auf der obersten Ebene nicht technisch erreichbar. Passwort-Reset ist möglich **ohne** Datenverlust, weil ein Hash einweg ist |
| [review/last-und-suche.md](review/last-und-suche.md) | **Last, Neuladen und Suche — gemessen, nicht geschätzt.** Ein `UPDATE` je Nachricht auf die Chat-Zeile kostet **88 %** des Durchsatzes (8 030 → 938 tps); die Verbindungsgrenze ist **100** und wird **vor** der Datenbank erreicht; der JSONL-Schreibpfad kostet **Faktor 64** und gibt trotzdem **keine** Haltbarkeit; zwei Prozesse auf einer Sitzung können still Daten verlieren. Dagegen: **40 Unteragenten am selben Elternteil = 16 463 tps** — der Baum ist die billigste Struktur im Schema. Dazu der Entwurf für Stichwort- **und** Vektorsuche über Arbeitsbereich, Chat und Sitzung, samt der Vorbedingung, die zuerst entschieden werden muß: **es gibt zwei Kopien desselben Inhalts, eine verschlüsselt, eine im Klartext** |
| [status/api-schluessel.md](status/api-schluessel.md) | **C3 — API-Schlüssel, die die Datenbank nicht kennt.** Die Form war seit Migration 0001 vorgeschrieben (`pmh_<key_id>_<secret>`, `key_id` **genau** 12 Zeichen, `secret` 32 Zufallsbytes, *„Der Hash wird ueber das GANZE Token gebildet … so ist auch die Kennung faelschungssicher"*) — die Tabelle hatte nur **keinen Schreiber**. Erzeugt werden **256 Bit**, verlangt waren **112** (NIST SP 800-57), erzwungen durch eine Selbstprüfung **beim Laden** des Moduls. Darüber ein **Pfeffer**, abgeleitet als `HMAC-SHA256(Hauptschlüssel, Zweck)` — nicht der Hauptschlüssel selbst, und die Folge offen benannt: ein Hauptschlüsselwechsel **macht alle Schlüssel ungültig**. **33 Prüfungen** (20 Regeln, 13 für den Aufrufer `scripts/apischluessel.mjs`). Der Pfeffer ist **am echten Server** bewiesen: derselbe Schlüssel, dieselbe Datenbank, **anderer Hauptschlüssel → abgewiesen**; dazu die scharfe Gegenprobe, daß der Eintrag dem HMAC **entspricht** und dem blanken `sha256(token)` **widerspricht** (beides 64 Hexzeichen, nur nachzurechnen). Und ein Fund, der fast durchgerutscht wäre: **`split('_')` ist mehrdeutig**, weil `base64url` selbst `_` enthält — gemessen über 10 000 Schlüssel liegen **16,57 %** falsch und **1,55 %** brechen hart ab, `zerlegeToken` **0 %**. **Kein Verbraucher im Anfrageweg** — ausdrücklich offen |
| [status/anmeldeseite-und-erstlogin.md](status/anmeldeseite-und-erstlogin.md) | **Die Anmeldeseite — und die gemessene Aussperrung der Betriebsdatenbank.** Die Seite kommt aus **unserem** Host (`packages/api/auth-http/src/seite.ts`): kein Byte Fremdressource, JavaScript in **eigener** Datei (damit die CSP **ohne** `'unsafe-inline'` auskommt), `default-src 'none'`, und **nichts** wird im Browser abgelegt. Die Pfade und der CSRF-Cookiename werden **vom Server eingesetzt**, nicht abgeschrieben — ein zweiter Name liefe still auseinander. **22 Prüfungen** (12 über einen echten Socket, 10 für die Erstinbetriebnahme). **Der Befund:** die Betriebsdatenbank ist **ausgesperrt** — gemessen `benutzer=3, admins=0`, und im Home **keine** `claim.txt`. Das Tor ist offen (`\|\| admins === 0`), aber der offene Weg verlangt ein Claim-Token, das es nicht gibt: **403 `claim-fehlt`**, gemessen. Und es ist **mein** Fehler: ich habe genau diesen Zustand als Begründung dafür aufgeschrieben, das Tor offen zu halten — offen ist es auch, nur nützt ein offenes Tor ohne den Schlüssel dazu nichts. Die Wiederherstellung ist **ein Befehl** (`scripts/claim.mjs`) und in allen acht Verzweigungen geprüft, samt verbrauchtem, abgelaufenem und an einen fremden Rechner gebundenem Claim. Offen: ein angemeldeter Admin kann über die Seite **keine weiteren** Konten anlegen, es gibt keine Geräteliste und keinen Paßwortwechsel — und der Browser selbst ist **nicht** nachgewiesen |
| [status/wissensspeicher-d1.md](status/wissensspeicher-d1.md) | **D1, erster Schritt — Tabellen, die den Mandanten TRAGEN.** Migration `0006` (Fassung 5 → **6**): `documents` und `chunks`, beide mit `user_id NOT NULL`, jeder Verweis **zusammengesetzt** über `(…, user_id)` — ein Stück von B kann strukturell nicht an einem Dokument von A hängen. Dazu `UNIQUE (id, user_id)` als **Ziel** für die Verweise, der Vektor als **nullbar** (eine Einbettung darf fehlschlagen) mit der Bedingung „**beides oder keines**" für Vektor und Modell, und **HNSW** statt IVFFlat (IVFFlat müßte trainiert werden und ist auf einer leeren Tabelle wertlos). Probe `wissensspeicher.sql`: **12 Fälle, alle wie erwartet, exit 0** — zu **jedem** abgelehnten Übergriff ein **angenommener** eigener Fall, denn eine Regel, die alles ablehnt, wäre ebenso grün; das Urteil **wirft** (belegt: der erste Lauf endete mit `1 von 12 falsch`, **exit 3**). **Der Befund, der nicht geplant war:** `docker/postgres-init/01-extensions.sql` läuft nur **einmal** für `POSTGRES_DB` — eine **zweite** Datenbank bekommt `vector`/`pg_trgm`/`pgcrypto`/`unaccent` **nie**, und die Migration bricht dort jetzt mit einem Hinweis ab statt mit `type "vector" does not exist`. **Vier eigene Fehler**, darunter eine Prüfabfrage, deren Name `erwartet_3` war und die **7** zählte (CHECK-Bedingungen zählen mit), und der **Prüfsummenwächter, der gegen mich griff**. Offen und benannt: **kein Aufrufer**, RLS weiter aus (**Entscheidung**), Dimension 768 ohne Modellentscheidung, Volltextsuche über `bytea` unmöglich (B-S3), und gefilterte Vektorsuche kann zu wenige Zeilen liefern (`hnsw.iterative_scan`, ungemessen). **Nachtrag:** der **Aufrufer ist da** (`erzeugeWissensspeicher` — `user_id` steht in **jeder** Abfrage, auch beim Lesen eines einzelnen Dokuments; 6 Prüfungen), und die gefilterte Vektorsuche ist **gemessen** — mit einem **umgedrehten** Ergebnis: bei 200 eigenen und 20 000 näheren fremden Stücken liefert `LIMIT 5` **fünf** Treffer, weil der Planer den Index **gar nicht** nimmt, sondern die 200 eigenen Zeilen **exakt** liest. Die HNSW-Frage bleibt offen — aber jetzt **mit Grund**: sie kann erst auftreten, wenn ein Mandant **selbst** zehntausende Stücke hat. Und die Einbettung ist eine **Sperre**, keine Bequemlichkeit: `freellmapi :3001` antwortet **401** (Route da, Schlüssel fehlt), `ollama` hat **keinen** veröffentlichten Port |

### Lücke im Register (gemessen 13.10.2026)

**Sieben** Dateien liegen in `docs/status/` und haben hier keine Zeile:

```
status/2026-10-13.md · status/api-nachweis.md · status/auftrag-feature-und-skills.md
status/delta-non-web.md · status/first-login-container-permissions.md
status/werkzeug-nachweis.md · status/wsl2-linux-nachweis.md
```

Nachgezählt mit einem Lauf über `docs/status/**/*.md`, der jede Datei gegen diesen Text hält:
**52** Verweise im Register, **7** Dateien ohne. Sie sind **nicht verlegt** — sie sind
**unregistriert**. Die Zeilen werden nachgetragen, sobald die Dateien gelesen sind; einen Satz
zu erfinden wäre schlimmer als die Lücke, und die Konvention dieses Katalogs verlangt *einen
Satz pro Dokument*, nicht einen vermuteten.

## 8. Weitere Ablage

| Ordner | In einem Satz |
|---|---|
| [source/README.md](source/README.md) | Rohmaterial und Auszüge, die noch nicht ausgewertet sind (derzeit leer) |

---

## 9. Protokoll der Aufsicht — *die zweite, unabhängige Spur*

> Angelegt **13.10.2026**. Der bauende Agent belegt seine Arbeit unter `status/`; die **Aufsicht**
> (Wächter-Rolle) führt daneben eine eigene Spur: Gegenproben, Zugangslage, Befunde. Getrennt, damit
> eine Prüfung den geprüften Nachweis nicht verändert.

| Dokument | In einem Satz |
|---|---|
| [protokoll/aufsicht/README.md](protokoll/aufsicht/README.md) | Auftrag und Hausregeln der Aufsicht — darunter **H1: kein Neustart** von DSH/`~/.dsh`/`~/.pmh`, solange der andere Agent arbeitet (Prompt-Caching) |
| [protokoll/aufsicht/protokoll.md](protokoll/aufsicht/protokoll.md) | Chronologie der Prüfungen mit Befehl und Ergebnis, append-only |
| [protokoll/aufsicht/protokoll.jsonl](protokoll/aufsicht/protokoll.jsonl) | dieselben Ereignisse maschinenlesbar, eine Zeile je Ereignis |
| [protokoll/aufsicht/LAGE.md](protokoll/aufsicht/LAGE.md) | **eine Seite für Entscheidungen**: §0 ist eine **Handlungsliste nach Wirkung** (neun Punkte, jeder mit *wer* / *warum zuerst* / *Befehl*), darunter was erledigt ist, was nicht prüfbar war — und wie man alles nachfährt |
| [protokoll/aufsicht/befunde.md](protokoll/aufsicht/befunde.md) | Befunde `B1`–`B33` samt Verifikationen (`V1`–`V6`) mit Schwere, Beleg und Empfehlung — darunter die **widerlegte** Behauptung „kein Code ruft den Rust-Bestand auf", der nicht belegte Satz „API ausgefallen", die laufende Datenbank **ohne Kennwortprüfung** (`pg_hba: trust`) und, offen benannt, **eigene** Fehler der Aufsicht |
| [protokoll/aufsicht/aufgaben.md](protokoll/aufsicht/aufgaben.md) | Dauerauftrag, eigene Aufgabenliste und das, was die Aufsicht ausdrücklich **nicht** tut |
| [protokoll/aufsicht/werkzeuge/settings-vergleich.mjs](protokoll/aufsicht/werkzeuge/settings-vergleich.mjs) | vergleicht die Live-Konfiguration gegen jede gefundene Sicherung, Abschnitt für Abschnitt, ohne Geheimwerte auszugeben |
| [protokoll/aufsicht/werkzeuge/zugangs-lage.mjs](protokoll/aufsicht/werkzeuge/zugangs-lage.mjs) | vergleicht die Credential-Referenzen aller Harness-Homes und prüft eine Referenz live (nur Statuscode) |
| [protokoll/aufsicht/werkzeuge/takt-pruefung.mjs](protokoll/aufsicht/werkzeuge/takt-pruefung.mjs) | die wiederkehrende Prüfung in einem Aufruf: Konfigurations-Invarianten, Zugänge, Git-Zustand, Prozesse, Datenbank (alles lesend) |
| [protokoll/aufsicht/werkzeuge/zeilen-zahl.mjs](protokoll/aufsicht/werkzeuge/zeilen-zahl.mjs) | zählt Dateien und Zeilen über die git-Dateiliste und **meldet jede unlesbare Datei namentlich** — statt sie still mit 0 zu zählen |
| [protokoll/aufsicht/werkzeuge/bun-faehigkeiten.mjs](protokoll/aufsicht/werkzeuge/bun-faehigkeiten.mjs) | misst die Laufzeit-Behauptungen nach, die über den Rust-Bestand entscheiden: Verzeichnis-fsync, Krypto, Dateisperre, atomarer Ersatz |
| [protokoll/aufsicht/werkzeuge/init-skript-probe.mjs](protokoll/aufsicht/werkzeuge/init-skript-probe.mjs) | prüft ein Einrichtungs-Skript gegen den echten Server **ohne Zustandsänderung** — der SQL-Block läuft in `BEGIN … ROLLBACK` |
| [protokoll/aufsicht/werkzeuge/geheimnis-historie.mjs](protokoll/aufsicht/werkzeuge/geheimnis-historie.mjs) | definitiver Negativbefund zur Git-Historie: sucht die **echten** Werte aus dem Credential-Speicher in allen Commits (kein Muster-Scanner, keine Ausgabe von Werten) |
| [protokoll/aufsicht/werkzeuge/zeilen-klassen.mjs](protokoll/aufsicht/werkzeuge/zeilen-klassen.mjs) | trennt Leerzeilen, Kommentare und Code — damit „6.014 gegen 6.569" nicht Vermutung bleibt, sondern eine Zählweise wird |
| [protokoll/aufsicht/werkzeuge/pty-probe.mjs](protokoll/aufsicht/werkzeuge/pty-probe.mjs) | misst die PTY-Behauptungen nach: echtes ConPTY über `Bun.spawn({ terminal })`, `node-pty` unter Bun, `bun:ffi` gegen `kernel32!MoveFileExW` |
| [protokoll/aufsicht/werkzeuge/api-erreichbarkeit.mjs](protokoll/aufsicht/werkzeuge/api-erreichbarkeit.mjs) | prüft, ob der API-Weg **erreichbar** ist: `POST` auf registrierte und unregistrierte Endpunkte, unterschieden am **JSON-RPC-Rahmen** — eine 404 allein beweist nichts |
| [protokoll/aufsicht/hilfen/zugang-bereitstellen.mjs](protokoll/aufsicht/hilfen/zugang-bereitstellen.mjs) | legt den Modellzugang für ein Home bereit — Standard ist **nur anzeigen**, geschrieben wird nur mit `--anwenden` |
| [protokoll/aufsicht/hilfen/rechte-probe-assertion.sql](protokoll/aufsicht/hilfen/rechte-probe-assertion.sql) | zusichernde Rechteprüfung statt „muss scheitern"-Kommentaren: `has_*_privilege()` fragt, übt keine Rechte aus und kann nichts löschen — Exit-Code auswertbar |
| [protokoll/aufsicht/hilfen/mandantentrennung-probe.sql](protokoll/aufsicht/hilfen/mandantentrennung-probe.sql) | prüft die **Mandantentrennung** an den Verweisen: liest den Katalog (nur lesend) und zeigt an **eigenen Wegwerf-Tabellen** in einer Transaktion mit `ROLLBACK`, daß der zusammengesetzte Fremdschlüssel fremde Verweise abweist — und daß `ON DELETE SET NULL` mit einer `NOT NULL`-Spalte **scheitert**; der Rückstand wird nachgewiesen (`0 \| 0`) |
| [protokoll/aufsicht/hilfen/anbieter-rauchtest.mjs](protokoll/aufsicht/hilfen/anbieter-rauchtest.mjs) | echter Anbieteraufruf **über den Adapter des Repos**: setzt den Schlüssel aus dem Speicher in die Umgebung (ohne ihn auszugeben) und belegt damit die Kette für `P8.12` |
| [protokoll/aufsicht/hilfen/vorhandene-bausteine.md](protokoll/aufsicht/hilfen/vorhandene-bausteine.md) | Inventar dessen, was auf dieser Maschine **schon läuft** (SearXNG `:8081`, Firecrawl `:3002`, ein OpenAI-kompatibler Dienst `:3001` mit 1.075 Modellen, WSL2) — samt der Zugänge, die dafür noch fehlen: nutzen statt nachbauen |
| [protokoll/aufsicht/werkzeuge/stand-abgleich.mjs](protokoll/aufsicht/werkzeuge/stand-abgleich.mjs) | **mißt nach, ob die offenen Befunde noch offen sind** — zwölf Prüfungen in einem Aufruf, je Befund die eine Tatsache, auf der er steht; meldet `BEHOBEN`, sobald einer erledigt ist (alles lesend) |
| [protokoll/aufsicht/werkzeuge/leck-pruefung.mjs](protokoll/aufsicht/werkzeuge/leck-pruefung.mjs) | definitiver Leck-Nachweis über **echte** Werte aus `.env` und den Credential-Speichern gegen **jeden** Commit, den verfolgten Baum und die unverfolgten Dateien — `--vorlage` trennt veröffentlichte Standardwerte von Geheimnissen |
| [protokoll/aufsicht/hilfen/kennwoerter-drehen.mjs](protokoll/aufsicht/hilfen/kennwoerter-drehen.mjs) | dreht die Kennwörter eines **laufenden** Stapels ohne Datenverlust (`ALTER ROLE … PASSWORD` über stdin, danach `.env` nachziehen) — Trockenlauf ist die Voreinstellung, und es **sagt selbst**, wenn `pg_hba` auf `trust` steht und die Drehung damit kosmetisch wäre |
| [protokoll/aufsicht/hilfen/waisen-aufraeumen.ps1](protokoll/aufsicht/hilfen/waisen-aufraeumen.ps1) | räumt verwaiste Prozesse **nach Herkunft** auf (Kommandozeile + Repository), nicht nach Name und Alter — das Alter siebt nur die lebenden Kinder eines laufenden Tests aus; beendet wird erst mit `-Anwenden` |

---

## Konventionen

- **Sprache:** Arbeitsdokumente auf Deutsch. Angelsächsische Fachbegriffe bleiben stehen,
  wo sie die genaueren sind (Agent-Loop, Session, Plugin, Unit, Bundle, Sandbox).
- **Belegt statt behauptet:** Zahlen und Befunde nennen Datum und Quelle. Gemessenes wird von
  Gedeutetem getrennt.
- **Ein Satz pro Dokument** in diesem Katalog — wer mehr braucht, öffnet das Dokument.
- **Neue Datei? Dann hier eintragen.** Ein Dokument, das im Katalog fehlt, gilt als
  verlegt und wird nicht gefunden.
- **Ordnerlogik:** Ausrichtung oben, Technik, Entscheidungen, Gestaltung, Nachschlagewerk,
  Core-Bestand. Wächst ein Thema über eine Handvoll Dateien, bekommt es einen eigenen Ordner
  mit `README.md`.
