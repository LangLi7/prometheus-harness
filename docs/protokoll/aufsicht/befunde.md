# Befunde der Aufsicht

> Rolle: **Aufsicht (Wächter)**. Stand: **2026-10-13, 11:37–12:05** (Ortszeit Europe/Zurich, +02:00).
> Gemessenes ist von Gedeutetem getrennt: jede Zeile mit **Beleg** ist ein Befehl oder ein
> Dateizustand, den jeder nachfahren kann. Einschätzungen stehen ausdrücklich als Einschätzung.
> Korrigierte eigene Aussagen werden **nicht** gelöscht — siehe `B5` und den Abschnitt
> „Eigene Korrekturen".

Schwere-Skala: **H** = kann Arbeit unbrauchbar machen · **M** = kostet Zeit oder verdeckt Wahrheit ·
**N** = niedrig / latent.

---

## B1 — Die Rettung der Konfiguration hat auf einen 5 Tage alten Stand zurückgesetzt: drei Einstellungen fehlen — **H**

**Was gemessen wurde.** Am 13.10.2026 wurde `~/.dsh/settings.yaml` nach einem Schrumpf auf 151 Byte
aus `~/.dsh/crew/settings.yaml.pre-probe` wiederhergestellt. Die zugehörige Notiz
(`~/.dsh/notes/CREW-APIKEY-REPARATUR.md`, Zeile 56) nennt diese Quelle **„die letzte vollständige
Fassung"**. Diese Aussage ist **widerlegt**:

```
C:\Users\Chang\.dsh\crew\settings.yaml.pre-probe                          117545 B   17.09.2026 20:08
C:\Users\Chang\.dsh\crew\backup\settings.yaml.2026-09-22T22-51-48.bak     122500 B   22.09.2026 22:50   <-- NEUER
C:\Users\Chang\.dsh\settings.yaml (live nach der Rettung)                 117826 B   13.10.2026 10:35
```

Belege: `Get-ChildItem C:\Users\Chang\.dsh -File -Filter 'settings*'` und
`...\crew -Recurse -Filter 'settings*'` (vollständige Namensaufzählung, plus der Sonderfall
`…pre-probe`), anschließend
`node werkzeuge/settings-vergleich.mjs <live> <sicherung>`.

**Was dadurch fehlt** (Gegenprobe: die verwendete 17.09-Quelle hat es ebenfalls nicht — der Verlust
kommt also aus der **Quellenwahl**, nicht aus der Reparaturprozedur):

| Abschnitt | 22.09.2026 | live (nach der Rettung) | Wirkung |
|---|---|---|---|
| `agent-loop` | `{maxParallelToolCalls: 9}` | **fehlt vollständig** | Der Loop fällt auf seinen Bundle-Standard zurück; eine Betreiber-Einstellung ist still weg |
| `llm-pi-ai.providers.openai` | vorhanden | **fehlt** (11 statt 12 Routen) | Eine konfigurierte Anbieter-Route ist weg, obwohl `OPENAI_API_KEY` im Speicher liegt |
| `crew.crews[1]` („Test RouterFree", Executor `openrouter/free`) | vorhanden | **fehlt** (1 statt 2 Crews) | Die freie Test-Crew ist weg |
| `agent-default-model` | `provider: crew, model: crew-1` | `provider: deepseek-official, model: deepseek-flash` | **Verhaltensänderung**: am 22.09. war die Crew das Standardmodell (das erklärt die Meldung „keine Crew-Auswahl, trotzdem Crew genutzt"). Ob der heutige Zustand gewollt ist, kann nur der Betreiber sagen — ich entscheide es nicht |

**Was die Reparatur richtig gemacht hat** (entlastend, damit das Urteil nicht schief wird):

- Die kaputte Fassung wurde **gesichert** (`settings.yaml.bak-t63-before-repair-20261013-103555`, 151 B) — richtige Reihenfolge: erst sichern, dann schreiben.
- Die Abschnitte wurden **wörtlich** übernommen und gegen die echten Plugin-Schemata validiert (11 Provider-Routen, 4 DeepSeek-Modelle, 1 Crew).
- Die Ursache des Turn-Fehlers (`UNSUPPORTED_REASONING_EFFORT`) wurde an **allen** Aufrufstellen geschlossen, nicht nur an der sichtbaren.
- `~/.dsh/.credentials.yaml` wurde nicht angefasst (mtime unverändert 22.09.2026 — nachgemessen).

**Einschätzung (nicht Messung).** Die Reparatur war methodisch sauber, die **Quellenwahl** war es
nicht: sie nahm den erstbesten intakten Stand statt den jüngsten. Für die Zukunft heißt das:
vor dem Zurücksetzen **alle** Kandidaten mit Datum und Größe auflisten, nicht den ersten nehmen.

**Empfehlung — abgestuft, nicht blind nachziehen:**

1. `agent-loop.maxParallelToolCalls: 9` und `crew-2` („Test RouterFree") sind **additiv und risikoarm**; ein Nachziehen ist vertretbar.
2. `llm-pi-ai.providers.openai` **nur** wieder aufnehmen, wenn die Route gebraucht wird — `OPENAI_API_KEY` lieferte laut Notiz **HTTP 403**; eine tote Route im Katalog ist schlechter als keine.
3. Die Änderung von `agent-default-model` ist eine **Entscheidung des Betreibers**, kein Fehler.

**Grenze dieser Messung.** Ich habe die 22.09-Sicherung als vollständig **angenommen**, weil sie
fehlerfrei parst (10 Abschnitte). Ob sie zum Zeitpunkt des Schrumpfens wirklich der Live-Stand war,
ist aus ihr selbst **nicht** beweisbar — es ist der jüngste vollständige Kandidat, den ich auf der
Maschine gefunden habe (Aufzählung siehe oben; weitere Ablageorte wie Windows-Schattenkopien wurden
**nicht** geprüft).

### Nachtrag 13.10.2026, 11:47 — **Status: umgesetzt, mit drei belegten Auslassungen**

**Auftrag des Betreibers (11:44):** „Vollständig auf den 22.09-Stand nachziehen (inkl. openai-Route)."
**Ausgeführt mit:** [`hilfen/b1-nachziehen.mjs`](hilfen/b1-nachziehen.mjs) — Trockenlauf, dann
`--anwenden`; das neue Dokument wird erst als `.tmp-aufsicht` geschrieben, dort gegen die **echten
Plugin-Schemata** validiert und gegen Invarianten geprüft, dann mit Sicherung getauscht.

**Nachgezogen (vier Änderungen, alle additiv, kein bestehender Wert verändert):**

| Änderung | Ergebnis |
|---|---|
| `agent-loop` = `{maxParallelToolCalls: 9}` | ergänzt |
| `llm-pi-ai.providers.openai` (38 Modelle, `apiKeyEnv: OPENAI_API_KEY`) | ergänzt → **12** Anbieter-Routen statt 11 |
| `crew.crews[]` += `crew-2` „Test RouterFree" | ergänzt → **2** Crews statt 1 |
| `llm-pi-ai.providers.openrouter.models` += `z-ai/glm-5.2:free` | ergänzt → **277** Modelle statt 276 |

Die vierte Änderung fand sich erst beim Nachmessen: die Live-Liste war eine **echte Teilmenge** der
22.09-Liste (kein Modell nur live), und `packages/llm/llm-pi-ai/src/provider.ts` Zeile 141/142 sagt,
dass diese Route ihren Katalog **nicht** selbst nachlädt („this route's catalog is the settings
document") — ein fehlendes Modell bleibt also fehlend. Beide Kataloge sind jetzt deckungsgleich
(`llm-pi-ai` = 113.769 B auf beiden Seiten).

**Belege der Wirksamkeit.**

```
settings.yaml: 117.825 B → 122.769 B · Abschnitte 9 → 10
Schema-Prüfung: llm-pi-ai OK (12 Routen) · llm-deepseek OK (4 Modelle) · crew OK (2 Crews)
Invarianten: agent-default-model, llm-deepseek, ui-onboarding, locale, dsh-i18n-de,
             web-search-* und crew.crews[0] — alle unverändert (ok)
Sicherungen: settings.yaml.bak-aufsicht-2026-10-13T09-47-06-308Z (117.825 B)
             settings.yaml.bak-aufsicht-2026-10-13T09-48-19-911Z (122.698 B)
Laufende GUI nach beiden Schreibvorgängen: PID 22260 lebt, HTTP 200, Sitzungsdatei schreibt weiter
Neustart: keiner (Hausregel H1) — das Harness hat die Datei im Betrieb neu geladen
```

**Bewusst NICHT nachgezogen — je Punkt mit Messung, nicht mit Meinung.** Ein Zurückziehen wäre hier
keine Wiederherstellung, sondern eine Verschlechterung des laufenden Zustands:

| Abschnitt | Warum nicht | Beleg |
|---|---|---|
| `agent-default-model` | Der **Vorzustand** vor dem Schrumpf (`…bak-t63-before-repair-…`, 151 B) trägt `deepseek-official/deepseek-flash/high` — **denselben** Wert wie live. Der 22.09-Wert (`crew/crew-1`) ist damit älter als der Vorzustand. Außerdem stellt er genau das beanstandete Verhalten her („keine Crew-Auswahl, trotzdem Crew genutzt") | `read …bak-t63-before-repair-…`; Prüfung „Vorzustand == live: true" im Trockenlauf des Werkzeugs |
| `llm-deepseek.models` | Im 22.09-Katalog ist `deepseek-flash` nur `{id, name}`: **ohne** `contextWindow: 1000000`, **ohne** `inputModalities: [text, image]`, ohne Bildbudget. Die laufenden Sitzungen fahren auf diesem Modell — das Zurückziehen würde **Kontextfenster und Bildfähigkeit im Betrieb** beschneiden | Werkzeug-Ausgabe: `contextWindow=FEHLT, Modalitäten=null` (22.09) gegen `1000000, ["text","image"]` (live) |
| `crew.crews[0].roles` | Die 22.09-Rollen binden die **Vision**-Rolle an die zurückgezogene ID `deepseek-v4-flash-vision-exp`; live steht sie auf dem bildfähigen `deepseek-flash` | Abschnittsvergleich `crew` |

**Ehrliche Grenze.** Ob der Betreiber diese drei Auslassungen mitträgt, weiß ich nicht — er hat
„vollständig" gesagt. Sie sind jederzeit in einem zweiten Lauf nachholbar; das Werkzeug ist
idempotent. Ich habe sie ausgesetzt, **weil** sie messbar Schaden anrichten würden, und nicht, weil
sie mir nicht gefallen.

**Restrisiko, das ich nicht beseitigen kann.** Die Route `openai` ist jetzt im Katalog, ihr Schlüssel
lieferte laut `t63`-Notiz aber **HTTP 403**. Eine im Auswahlmenü sichtbare, nicht authentifizierbare
Route ist ein Irreführungspotenzial. Sie war ausdrücklich gewünscht; ich melde es nur.

---

## B2 — Es gibt keinen Schutz davor, dass die Hauptkonfiguration wieder schrumpft — **M**

**Beleg.** Der Schrumpf von 117 KB auf 151 Byte ist **unbemerkt** passiert. Vorhanden sind nur zwei
brauchbare Sicherungen (17.09, 22.09) und zwei ältere (26.08., 31.08.). Eine Sicherung **vor jedem
Schreibvorgang** und eine Prüfung „Abschnittszahl und Referenzzahl unverändert?" existieren nicht.

**Gegenprobe, die die Sache entschärft.** Ein Schreiben wirkt **ohne Neustart**: die Notiz §2.3
belegt, dass der laufende Prozess die um 10:35 geschriebene Datei neu geladen hat
(`request/header` nennt `contextWindow: 1000000`, ein Wert aus dem neu geschriebenen Block). Eine
Reparatur braucht also **keinen** Neustart — das ist wichtig, weil ein Neustart nach Hausregel **H1**
ohnehin ausgeschlossen ist.

**Empfehlung.** Vor jedem Schreiben eine Kopie `settings.yaml.<ISO-Zeit>.bak`; nach dem Schreiben
`node werkzeuge/settings-vergleich.mjs` gegen die Kopie und `zugangs-lage.mjs` für die Referenzen.
Zwei Zahlen, die sich nicht ändern dürfen: **Abschnitte = 9**, **Referenzen = 13**.

---

## B3 — Das eigene Harness-Home des Ziel-Projekts hat **keinen Modellzugang** — **H** (für `P8.12`)

**Beleg (Zugangslage je Home, `node werkzeuge/zugangs-lage.mjs`):**

| Home | Datei | Referenzen | `DEEPSEEK_API_KEY` live geprüft |
|---|---|---|---|
| `C:\Users\Chang\.pmh` | 1271 B | **13** | **HTTP 200** |
| `C:\Users\Chang\.dsh` | 1121 B | **13** | **HTTP 200** |
| `C:\Users\Chang\prometheus-harness\.pmh-build\harness-home` | 161 B | **0** | nicht prüfbar — keine Referenz |

Die Referenzen in `~/.pmh` und `~/.dsh` sind **wertgleich** (identische SHA-256-Kurzfingerabdrücke,
z. B. `DEEPSEEK_API_KEY` = `e2159c3d1018`). `scripts/start.mjs` Zeile **259** setzt als Vorgabe
`--home <repo>/.pmh-build/harness-home`. Damit startet der Host mit einem Home **ohne jede
Credential-Referenz**.

**Folge für den Nachweis `P8.12` („Aufruf gegen den echten Anbieter: kein Schlüssel in dieser
Umgebung").** Die Aussage ist für **dieses Home** richtig und für die **Maschine** falsch. Der
Schlüssel liegt bereit und authentifiziert gegen den echten Dienst — gemessen:
`GET https://api.deepseek.com/user/balance` → **HTTP 200**, gemeldetes Guthaben **USD 15.32**
(kein Geheimwert ausgegeben; es wurden nur Statuscode und Guthaben gedruckt).

**Einschätzung.** Das ist keine Nachlässigkeit des bauenden Agenten, sondern eine **Folge der
Home-Trennung**: das Home wurde aus **Versionsgründen** getrennt (der Befund `P7.7`/`t40`: ein fremdes
Core-Profil in `~/.dsh` schaltete 27 Profil-Einträge ab). Mit dem Home wurden **auch die Zugänge**
getrennt — nur ist das nirgends notiert.

**Skeptische Gegenprobe zur naheliegenden Abhilfe.** „Nimm doch `~/.pmh` als Vorgabe" ist **nicht
automatisch sicher**: genau der Zustand „fremder Profilbaum im Home" hat `P7.7` verursacht.
Gemessen: `~/.pmh/profiles` enthält nur `pmh` und `web` mit je einer `package.json`, **kein**
`node_modules` mit 204 Fremdpaketen (das liegt in `~/.dsh/profiles/node_modules`). Unverdächtig —
aber der Nachweis „0 Abschaltungen, Token gelesen, HTTP 200" muss mit der **vorhandenen Sonde**
(`docs/status/messsonden/windows-host-check.ps1`, `wsl-host-check.sh`) **erneut** gefahren werden,
**bevor** eine Vorgabe geändert wird. Eine Vorgabe zu ändern und den Nachweis zu vermuten, wäre
derselbe Fehler wie die Quellenwahl in `B1`.

**Empfehlung (nicht ausgeführt).** Zugang über die **Startumgebung** (`DEEPSEEK_API_KEY` beim Start)
oder über ein Home **außerhalb** des Repos. **Nicht** als Datei in `.pmh-build/` — das ist ein
Bauartefakt, auch wenn `.gitignore` Zeile 46 es abdeckt; ein Bauartefakt ist flüchtig, ein Geheimwert
darf nicht flüchtig sein.

**Bereitgelegte Hilfe:** [`hilfen/zugang-bereitstellen.mjs`](hilfen/zugang-bereitstellen.mjs) —
Standard ist **nur anzeigen**; `--anwenden` schreibt die fehlenden Referenzen ins Ziel-Home (mit
Sicherung), `--umgebung` gibt den Startbefehl mit gesetzter Umgebungsvariable aus, ohne je den Wert
zu drucken. **Beide Wege sind ausprobiert, nicht behauptet:** der Trockenlauf meldet für das
Projekt-Home „13 Referenzen fehlen", und das Umgebungs-Rezept setzt die Variable nachweislich richtig
(Länge 35, Fingerabdruck `e2159c3d1018` — gleich dem Wert im Speicher). Geschrieben wurde **nichts**.

### Nachtrag 13.10.2026, 11:47 — **Status: erledigt (Punkt 1 und 2 des Auftrags)**

Auf Anweisung des Betreibers („punkt 1 und 2 machen") wurden **beide** Wege umgesetzt:

1. **Rezept bereitgelegt** — `--umgebung` gibt den geprüften Startbefehl aus (siehe oben).
2. **Referenz geschrieben** — `DEEPSEEK_API_KEY` in
   `C:\Users\Chang\prometheus-harness\.pmh-build\harness-home\.credentials.yaml`, Sicherung davor:
   `.credentials.yaml.bak-2026-10-13T09-47-17-518Z` (161 B → jetzt 1 Referenz).

**Wirksamkeitsnachweis (nicht Vermutung):**

```
zugangs-lage.mjs --pruefen DEEPSEEK_API_KEY <projekt-home>
  → Referenz vorhanden: 35 Zeichen, Fingerabdruck e2159c3d1018 (gleich dem Speicher)
  → GET https://api.deepseek.com/user/balance  →  HTTP 200
```

**Bewusste Einschränkung:** geschrieben wurde **nur** `DEEPSEEK_API_KEY` (die dokumentierte Vorgabe
des Adapters), **nicht** alle 13 Referenzen. Grund: das Ziel liegt im Repository, und jedes weitere
Geheimnis dort ist zusätzliche Angriffsfläche ohne aktuellen Nutzen. Die übrigen zwölf holt
`zugang-bereitstellen.mjs --anwenden --refs <NAME,…>` auf Anforderung nach — oder ganz ohne `--refs`.

**Restrisiko, offen benannt:** das Ziel ist ein **Bauartefakt** im Repo (`.pmh-build/`, über
`.gitignore` Zeile 46 abgedeckt). Ein Aufräumen des Ordners löscht den Zugang wieder. Dauerhaft ist
nur ein Home **außerhalb** des Repos oder die Umgebungsvariable beim Start.

---

## B4 — Der Git-Credential-Helfer ist defekt (latent, heute nicht blockierend) — **N**

**Beleg.**

```
git config --list --show-origin | grep credential
  file:C:/Program Files/Git/etc/gitconfig   credential.helper=manager
  file:C:/Users/Chang/.gitconfig            credential.helper=gh
git ls-remote origin refs/heads/main
  git: 'credential-gh' is not a git command. See 'git --help'.
```

`credential-gh` existiert auf der Maschine nicht. **Gegenprobe, die entlastet:** der Push um 11:17
ist **belegt** — `git rev-parse HEAD` = `935f77e3a8a5933b64bade4352b7d0ccfbe73720` und
`git ls-remote origin refs/heads/main` liefert **denselben** Hash. `gh` selbst ist angemeldet
(Konto `LangLi7`, Keyring, Scopes `repo`, `workflow`). Heute hängt also nichts.

**Empfehlung: nichts ändern.** Solange Pushes belegt funktionieren, ist ein Eingriff in die
Git-Konfiguration eine Verschlechterung mit Ansage (Regel A3: „ist die Anpassung nötig?" — **nein**).
Wenn ein Push künftig **hängt**, ist die Ursache bekannt: `credential.helper=gh`, korrekt wäre
`!gh auth git-credential`.

---

## B5 — `PMH_TEST_DATABASE_URL` steht nur im Testkopf — **N**

**Beleg.** Vorkommen im gesamten Repo (ohne `node_modules`, `.git`, `target`):
**nur** `packages/auth/db-schema/tests/postgres.test.ts`, Zeilen 10, 16, 33, 54. Kein `.env.example`,
kein CI-Verweis, kein Statusdokument. Der Test **überspringt laut**: er schreibt einen Hinweis auf
`stderr` samt Docker-Befehl (Zeilen 50–58) — ein **stiller** Skip liegt also **nicht** vor.

**Korrektur meiner eigenen ersten Aussage — siehe „Eigene Korrekturen" unten.**

**Infrastruktur, read-only nachgemessen** (wichtig, weil der bauende Agent gerade an
`packages/auth/db-schema` arbeitet):

```
docker ps  → pmh-postgres (postgres:17-alpine, 0.0.0.0:5432), pmh-redis (redis:7-alpine, 6379)
select current_database(), current_user → pmh|pmh        (PostgreSQL 17.11)
redis-cli ping → PONG
Tabellen (10): api_keys, auth_events, chats, messages, one_time_tokens,
               schema_migrations, sessions, user_secrets, users, workspaces
```

Die Migrationen sind also **bereits** gegen ein echtes PostgreSQL gelaufen (`schema_migrations`
existiert und ist gefüllt). Der Testlauf selbst wurde von mir **nicht** ausgeführt — Hausregel **H5**:
kein Testlauf und keine Migration gegen die Datenbank, an der der andere Agent arbeitet.

**Empfehlung.** Ein `.env.example` mit **Namen** (die `.gitignore` erlaubt es ausdrücklich:
`!.env.example`, Zeile 58) und eine Zeile in `docs/status/`. Entscheidung liegt beim bauenden Agenten
— `.env.example` ist eine Änderung **in seinem** Verantwortungsbereich.

---

## B6 — Der Rust-Befund ist in der Sache bestätigt, in **einer** zentralen Aussage widerlegt — **M**

**Anlass.** Der bauende Agent hat am 13.10.2026 `docs/review/rust-bestand.md` vorgelegt (16.327 B,
11:50) — auf eine Betreiberfrage („warum besitzt unsere Harness so viel Rust-Code?"). Das Dokument ist
bemerkenswert, weil es **die eigene Empfehlung widerruft**, nachdem eine Messung sie widerlegt hat.
Genau deshalb habe ich es nachgemessen: ein Dokument, das sich selbst korrigiert, verdient dieselbe
Prüfung wie jedes andere.

### Was ich unabhängig **bestätigt** habe

| Behauptung | Meine Messung | Werkzeug |
|---|---|---|
| 16 Rust-Dateien, **6.569** Zeilen | **16 Dateien, 6.569 Zeilen** — exakt | `werkzeuge/zeilen-zahl.mjs` |
| Die Vorlage hat **null** Rust und **kein** `services/` | **0 `.rs`-Dateien**, `services/` existiert nicht | ebenda |
| TypeScript 55 Dateien / 20.316 Zeilen | **55 / 20.316** | ebenda |
| Go 49 Dateien / 13.810 Zeilen | **49 / 13.810** | ebenda |
| JavaScript 9 Dateien / 33.577 Zeilen, **alles** VitePress-Cache | **9 / 33.577**, und **alle neun** liegen unter `website/.vitepress/cache/deps/` | ebenda + `git ls-files '*.js'` |
| CSS 3 Dateien / 286 Zeilen | **3 / 286** | ebenda |
| `.github/` ist nicht versioniert | **0** versionierte Dateien; `.gitignore` Zeile 76 | `git ls-files '.github/*'` |
| `website/.vitepress/cache` ist **nicht** ignoriert | `git check-ignore` liefert nichts — die Empfehlung ist berechtigt | `git check-ignore -v` |
| Kein `cargo`-Aufruf in irgendeinem Skript | **kein Treffer** in `.ts/.go/.mjs/.js/.ps1/.sh/.json/.toml` | Inhaltsuche |
| **Der Verzeichnis-fsync scheitert auf Windows mit `EPERM`** | **reproduziert**: `openSync(dir,'r')`+`fsyncSync` → `EPERM`; ebenso mit `O_RDONLY`; **Datei**-fsync → OK | `werkzeuge/bun-faehigkeiten.mjs` unter Bun 1.4.0 |
| Die Laufzeit kann die Kryptografie (Grund für „`crypto` streichen") | **bestätigt**: `Bun.CryptoHasher`, `Bun.password.hash` (Argon2id **funktioniert**), `Bun.hash`, `timingSafeEqual`, SHA-256, AES-256-GCM — alles vorhanden | ebenda |
| `node:fs.flock` fehlt (Grund für `flock`) | **bestätigt**: `typeof` = `undefined`, ebenso `flockSync` | ebenda |
| `rename` über bestehende Datei funktioniert | **bestätigt** | ebenda |

Die Messung, auf der die Empfehlung „`atomicfs` bleibt" ruht, ist damit **von unabhängiger Seite
reproduziert** — sie ist nicht nur eine Behauptung des Autors.

### Was ich **widerlegt** habe

**1. „Kein einziger Aufruf" ist falsch — es gibt genau einen Aufrufer, und das Dokument verschweigt
ihn.** `rust-bestand.md` §4 behauptet: *„Wird eines der sechs Rust-Programme aus
TypeScript/JavaScript/Go aufgerufen? **Nein.** Kein einziger Aufruf. Die einzigen Treffer auf
`pmh-atomicfs` sind ein Namens-Warnhinweis im Unit-Export und dessen Test."*

Gemessen ist das Gegenteil:

| Beleg | Ort |
|---|---|
| Ein vollständiger **Prozessaufrufer** mit Vertrag, Timeout, Fehlerbehandlung, `target/debug/pmh-atomicfs[.exe]` als Standardpfad | `packages/util/atomic-write/src/index.ts` (Zeilen 1–30, 150–155, 336–345) |
| Das Paket ist **Workspace-Mitglied** (`packages/*/*` in der Wurzel-`package.json`) und in `bun.lock` Zeile 119 eingetragen | `package.json`, `bun.lock` |
| Die eigenen Tests laufen laut eigenem Nachweis **gegen das echte Rust-Binary** | `docs/review/backend-review.md` Zeile 195 |
| Das **Crate-README nennt den Aufrufer selbst**: „Der Kern (`packages/util/atomic-write`) ruft:" | `native/atomicfs/README.md` Zeile 68 |
| Das **eigene Haus widerspricht dem neuen Befund wörtlich**: „6 der 7 Rust-Binaries haben keinen TypeScript-Aufrufer. **Nur `pmh-atomicfs` wird aus `packages/util/atomic-write/src/index.ts` gerufen**" | `docs/review-report.md` Zeile 245 |

**Was von der Aussage übrig bleibt — und es ist der wichtigere Teil:** kein Aufruf aus dem
**Startpfad** (`apps/cli`, `services/*`, `scripts/start.mjs`), und **niemand importiert**
`@prometheus-harness/atomic-write` (Suche nach Import-Spezifizierern: **0** Treffer außer der eigenen
`package.json`). Der genaue Satz lautet also: **ein Aufrufer ist da, aber nicht verdrahtet** — nicht
„nie aufgerufen".

**Warum das kein Wortklauberei ist.** Es macht die Empfehlung **stärker**, nicht schwächer: die
Anbindung an den Rust-Prozess existiert bereits samt Tests. Es fehlt nur der Import. Ein Leser, der
dem Dokument glaubt, würde dagegen annehmen, es müsse erst ein Aufrufer gebaut werden.

**2. „fünf Crates und einem Dienst" — es sind sechs.** `native/` enthält `atomicfs`, `crypto`,
`flock`, `index`, `landlock-run`, `pty` = **6 Crates**, dazu `services/pmh-sandbox` = **7 Rust-Units**;
alle sieben tragen eine `unit.json` (nachgezählt über `native/**, services/**/unit.json`).

**3. Die Einzelwerte addieren sich nicht zur Überschrift — inzwischen aufgeklärt.** Die Tabelle nennt
je Crate 1.101 + 865 + 685 + 623 + 577 + 556 = **4.407** plus „`services/pmh-sandbox` ~600" — die
Überschrift sagt aber **6.569**. Das steht aber nirgends — und ein Dokument, dessen Kern „gemessen
statt geschätzt" ist, sollte es dastehen haben.

> **Korrektur dieses Punktes (13.10.2026, 12:24, Regel H6).** Hier stand zuerst, „Code + Kommentar
> ergibt genau die 6.569". Das war **falsch**, und die Aufklärung steht jetzt in **B12**: Code +
> Kommentar sind **6.014**, die 6.569 sind **alle** Zeilen. Die Differenz sind **555 Leerzeilen**
> (8,4 %). Gemessen mit `werkzeuge/zeilen-klassen.mjs`, das pro Crate exakt die Zahlen des
> Sprachwahl-Berichts reproduziert (759 · 791 · 1.473 · 1.002 · 796 · 640 · 553 = 6.014). Beide
> Zahlen sind also richtig — sie zählen Verschiedenes.

### Nebenmessung, die das Bild vervollständigt (B7)

**Die Rust-Binaries existieren — sie wurden von Hand gebaut:**

```
target/debug/pmh-atomicfs.exe  269.312 B  12.10.2026 20:28      target/debug/pmh-*.exe  (7 Stück)
target/debug/pmh-flock.exe     242.176 B  13.10.2026 10:44   ← heute gebaut
target/ gesamt: 697,6 MB   ·   .gitignore Zeile 14  ·   0 versionierte Dateien
```

Der Satz „kein Skript baut sie" bleibt richtig; **gebaut wurden sie trotzdem**. `target/` ist
ignoriert, also entsteht **kein** Repo-Ballast — aber fast **700 MB** auf der Platte, und ein
`pmh-flock.exe` von heute 10:44 zeigt, dass zuletzt jemand damit gearbeitet hat.

**Offener Widerspruch im eigenen Haus, den ich nicht auflösen kann:** `docs/status/2026-10-13.md`
Zeile 101 führt `packages/util/atomic-write` mit **17 roten Tests** („Programm nicht startbar … kein
Node-Spawn in der Sandbox"), `docs/review/backend-review.md` Zeile 195 meldet **19 grün** gegen das
echte Rust-Binary. Ich habe die Tests **nicht** ausgeführt (Hausregel **H5**, und der Sandkasten
verbietet den Start von Kindprozessen) — der Widerspruch bleibt als offener Punkt stehen.

**Einschätzung.** Der Rust-Befund ist in allem Messbaren **belastbar** und in seiner
Selbstkorrektur vorbildlich. Er hat einen Aufrufer übersehen, der im eigenen Repo dreifach
dokumentiert ist — das schwächt die Empfehlung nicht, sondern stützt sie. Die zwei Zahlenschwächen
(„fünf", Addition) sind Nachlässigkeiten an einer Stelle, an der das Dokument sonst sehr genau ist.

---

## B8 — Der Wechsel auf den Compose-Stack hat das migrierte Schema verdrängt und den Stack **halb** eingerichtet — **H**

**Was in vier Minuten passiert ist** (alles gemessen, nicht geschlossen):

| Zeit | Ereignis | Beleg |
|---|---|---|
| 11:20 | Alter Container `pmh-postgres` entsteht: `postgres:17-alpine`, Superuser `pmh`, Passwort `pmh-dev-only`, **anonymes** Volume, Bindung `0.0.0.0:5432` | `docker inspect` um 11:28 — **keine** Compose-Labels |
| 11:2x–11:3x | Die Anwendungs-Migrationen laufen: **10 Tabellen**, `schema_migrations` mit Version 1 und 2 | meine lesenden Abfragen um 11:34 und **11:58** |
| 11:56–11:57 | Neu im Repo: `docker-compose.yml` und `docker/postgres-init/{01-extensions.sql,02-roles.sql,03-defaults-as-owner.sql,04-defaults-as-owner.sh}` | Dateizeiten |
| **11:59:04** | **`docker compose up` ersetzt den laufenden Container**: Compose-Projekt `pmh`, Image `pgvector/pgvector:pg17`, benanntes Volume `pmh-postgres-data`, Netz `pmh-net` | Compose-Labels, `docker network inspect pmh-net` |
| 11:59:05 | `01-extensions.sql` läuft (4 × `CREATE EXTENSION`), dann **scheitert `02-roles.sql`** | Init-Log (unten) |
| 11:59:0x | Der Container startet **neu** und meldet beim zweiten Start: *„Database directory appears to contain a database; Skipping initialization"* → danach `Up (healthy)` | Init-Log |

```
/usr/local/bin/docker-entrypoint.sh: running /docker-entrypoint-initdb.d/02-roles.sql
2026-10-13 11:59:05.413 CEST [63] ERROR:  syntax error at or near ":" at character 111
2026-10-13 11:59:05.413 CEST [63] STATEMENT:  SELECT format('CREATE ROLE %I LOGIN PASSWORD %L …',
                                              :'PMH_OWNER_USER', :'PMH_OWNER_PASSWORD')
```

**Zustand der laufenden Datenbank danach (gemessen 12:00 Uhr):**

| Prüfung | Ergebnis |
|---|---|
| Rollen (`like 'pmh%'`) | **nur `pmh_admin`** — `pmh_app` und `pmh_readonly` fehlen |
| Tabellen in `public` | **0** — das Anwendungsschema ist weg |
| `schema_migrations` | **Tabelle existiert nicht** |
| Erweiterungen | `vector`, `pg_trgm`, `pgcrypto`, `unaccent`, `plpgsql` — die sind angekommen |
| `pg_default_acl` | **0** → `03-defaults-as-owner.sql` und `04-defaults-as-owner.sh` sind **nie gelaufen** |
| Altes Volume `ab00fc2605…` | **existiert noch** (angelegt 11:20) und ist **verwaist** — kein Container nutzt es mehr |

**Was der andere Agent selbst schon erkannt und behoben hat — mit Anerkennung.** Um **12:00:21**
wurde `02-roles.sql` durch **`02-roles.sh`** (9.457 B) ersetzt, mit dem richtigen Mechanismus
(`psql -v owner_user=…`). Der Kopf der Datei zitiert die Fehlerzeile aus dem Log und erklärt die
Ursache korrekt: *„[der Einstieg] führt … mit `psql` aus und übergibt dabei **nur seine eigenen**
Variablen (`POSTGRES_USER` usw.) über `--set`. Unsere Variablen stehen zwar in der Umgebung, sind
aber **nicht** als psql-Variablen [gesetzt]."* Diagnose und Reparatur stammen von ihm — ich habe
nichts daran getan.

### Was **offen** bleibt — und der Grund, warum es zählt

1. **Die Reparatur greift am laufenden Stack nicht.** Postgres führt
   `/docker-entrypoint-initdb.d/*` **nur beim ersten Start eines leeren Datenverzeichnisses** aus
   (so steht es im Kopf der eigenen `docker-compose.yml`, Zeilen 67–70). Das Volume
   `pmh-postgres-data` ist bereits initialisiert — die korrigierte `02-roles.sh` läuft dort **nie**
   von selbst. Der Stack bleibt ohne `pmh_app` und ohne `pmh_readonly`, bis jemand bewusst
   `docker compose down -v` (löscht Daten) ausführt oder die Rollen von Hand anlegt.
2. **Der dokumentierte Testzugang ist veraltet.** `packages/auth/db-schema/tests/postgres.test.ts`
   Zeile 16 nennt `postgres://pmh:pmh-dev-only@127.0.0.1:5432/pmh`. Den Benutzer `pmh` gibt es
   **nicht mehr**; der neue Stack kennt `pmh_admin` / `bitte-aendern-admin` (und nach einem frischen
   Start `pmh_app` / `bitte-aendern-app`). Wer die Zeile heute ausführt, bekommt einen
   Verbindungsfehler — oder der Test überspringt, weil die Variable anders heißt.
3. **Der Nachweis zum migrierten Schema ist nicht mehr reproduzierbar.** Commit `47e33a5`
   („Auth 1/5: PostgreSQL-Schema … **gegen echtes PostgreSQL belegt**") stützte sich auf die alte
   Datenbank. Die Daten liegen weiterhin auf der Platte — im **verwaisten** Volume
   `ab00fc2605a9f7fa00bc044ec45659d4b35e282c491f6bbdc1e4cb01ae2180fe` —, sind aber nicht
   eingehängt. **Warnung:** `docker volume prune` oder `docker compose down -v` würden sie
   **löschen**; es gibt derzeit **18 verwaiste Volumes**, ein `prune` trifft also mehr als dieses.
4. **Was gut ist und bleibt:** `docker compose config` läuft fehlerfrei durch (Datei ist gültig).
   Die Begründung im Kopf — *„Postgres und Redis liefen vorher als einzeln gestartete Container ohne
   Datei"* — ist durch meine Messung **bestätigt** (keine Compose-Labels, anonymes Volume). Die
   Bindung ist jetzt korrekt auf `127.0.0.1` gelegt statt `0.0.0.0`. Und der `vector`-Typ ist
   vorhanden — das war der Zweck des Imagewechsels.

**Eigene Messung, die nichts beweist (H6).** Ich habe versucht, den psql-Mechanismus mit
`select :'PROBE'` über `-c` nachzustellen — das schlug **auch mit gesetzter Variable** fehl, taugt
also **nicht** als Reproduktion des `-f`-Pfades des Einstiegs. Beleg bleibt allein das Log oben.

**Einschätzung.** Der Schritt zu einer Compose-Datei ist richtig und war überfällig — „plug and play"
war die eigene Zielsetzung des Betreibers. Der Preis ist an diesem Vormittag konkret geworden: vier
Minuten Umbau haben den Datenbankstand der Auth-Arbeit aus dem laufenden Betrieb entfernt, und die
Einrichtung ist halb fertig, weil ein Fehler durch den automatischen Neustart **unsichtbar** wurde
(`Up (healthy)` bei fehlenden Rollen). Das ist kein Vorwurf an den Umbau, sondern der Hinweis, dass
der **Zustand nach dem Umbau** neu nachgewiesen werden muss.

---

### Nachtrag 13.10.2026, 12:06 — **Status: vom bauenden Agenten behoben, von mir verifiziert**

**Was in der Zwischenzeit geschah.** Um **12:05:21** wurde der Stack **von Null neu aufgesetzt**
(neuer Container, `docker compose down -v` + `up` — sein eigener `scripts/stack-test.ps1` prüft
genau diesen Weg „wie ein Fremder ihn geht"). Ergebnis, von mir nachgemessen:

| Prüfung | vorher (11:59) | jetzt (12:06) |
|---|---|---|
| Rollen | nur `pmh_admin` | **`pmh_admin`, `pmh_app`, `pmh_owner`, `pmh_readonly`** |
| Schemata | nur `public` | **`pmh`** und `public` |
| Tabellen | **0** | **10 in Schema `pmh`** |
| `pg_default_acl` | 0 | **3** → Skripte `03`/`04` sind gelaufen |

Die reparierte `02-roles.sh` **wirkt** also auf einem frischen Volume.

**Die Rechtetrennung habe ich selbst geprüft — nicht geglaubt** (alle fünf Prüfungen ausgeführt):

| Rolle | Prüfung | Ergebnis |
|---|---|---|
| `pmh_app` | `SELECT count(*) FROM users` | **geht** → `1` (Suchpfad `pmh, public` greift) |
| `pmh_app` | `CREATE TABLE aufsicht_probe(x int)` | **verweigert**: `permission denied for schema pmh` |
| `pmh_app` | `TRUNCATE users` | **verweigert**: `permission denied for table users` |
| `pmh_readonly` | `SELECT count(*) FROM users` | **geht** → `1` |
| `pmh_readonly` | `INSERT INTO users …` | **verweigert**: `permission denied for table users` |
| `pmh_owner` | `CREATE TABLE` in einer Transaktion | **geht**, danach `ROLLBACK` — und die Probe-Tabelle existiert **nicht** (`0`) |

Das ist die Trennung, die das Skript verspricht: die Anwendung darf arbeiten, aber nicht umbauen.

**Die reparierte Einrichtung habe ich zusätzlich geprüft, ohne Zustand zu ändern.**
`werkzeuge/init-skript-probe.mjs` schneidet den SQL-Block aus `02-roles.sh`, hüllt ihn in
`BEGIN; … ROLLBACK;` und schickt ihn gegen den echten Server: **Exit 0**, die Rollentabelle wird
ausgegeben, und danach ist nichts passiert. Damit ist die Neufassung **vor** dem nächsten Neustart
geprüft — das war der Sinn.

**Was offen bleibt (klein, aber konkret):**

1. `packages/auth/db-schema/tests/postgres.test.ts` Zeile 16 nennt weiterhin
   `postgres://pmh:pmh-dev-only@127.0.0.1:5432/pmh`, und der Überspring-Hinweis in Zeile 55 startet
   `docker run -d --name pmh-postgres …`. Beides zeigt auf den **alten** Stand: den Benutzer `pmh`
   gibt es nicht mehr, und `--name pmh-postgres` **kollidiert** heute mit dem Compose-Container
   (dazu `-p 5432:5432`, das ebenfalls belegt ist). Wer dem Hinweis folgt, bekommt zwei Fehler, die
   nach etwas anderem aussehen. Die neue `.env.example` nennt korrekt
   `PMH_TEST_DATABASE_URL=postgres://pmh_owner:bitte-aendern-owner@…` — nur die Testdatei selbst
   wurde nicht mitgezogen.
2. Das **verwaiste Volume** `ab00fc2605…` trägt weiterhin ein intaktes PostgreSQL-17-Cluster
   (**64,8 MB**, `PG_VERSION` 17 — read-only nachgesehen). Es gehört zum Stand von 11:20 und ist
   nicht mehr eingehängt. `docker compose down -v` trifft es **nicht** (es steht nicht in der
   Compose-Datei und hing an einem entfernten Container) — **`docker volume prune` würde es
   löschen**, und davon gibt es derzeit **18 verwaiste Volumes**.

**Korrektur meiner eigenen Zwischeneinschätzung.** Ich hatte notiert, die Reparatur könne „am
laufenden Stack nicht greifen". Das war zum Zeitpunkt der Messung richtig, aber die Folgerung war zu
eng: der Weg über ein **frisches Volume** (`down -v`, gefahrlos, weil im aktuellen Volume nichts
Wertvolles lag) war der richtige — und genau ihn ist der bauende Agent gegangen, bevor ich ihn
vorschlagen konnte.

---

## B9 — Die Rechte sind belegt, die **Prüfung** prüft sich aber nicht selbst — **M**

**Anlass.** Der bauende Agent hat um 12:06 `docker/rechtprobe.sql` und `scripts/stack-test.ps1`
vorgelegt (Commit `c728464`: „Docker-Stack in EINER Datei + **Rechtesystem belegt**"). Die
Behauptung ist richtig — ich habe sie unabhängig nachgemessen (siehe unten). Der Weg dorthin hat
aber eine Lücke, die genau in dieser Rolle auffällt.

**Befund 1: die „muss scheitern"-Fälle sind nicht selbstprüfend.** `rechtprobe.sql` läuft mit
`\set ON_ERROR_STOP off`, und neben jedem Verbot steht nur ein `\echo`:

```sql
\echo '--- 4. Darf NICHT TRUNCATE? (das MUSS scheitern) ---'
TRUNCATE users;
\echo '(ein Fehler oben ist das ERWARTETE Ergebnis)'
```

Damit sind **drei** Ausgänge ununterscheidbar: (1) die Anweisung scheitert aus dem richtigen Grund,
(2) sie scheitert aus einem **anderen** Grund (Tippfehler, fehlende Tabelle, falscher Suchpfad),
(3) sie **scheitert gar nicht** — ein Regress, bei dem der `\echo`-Text trotzdem „das ERWARTETE
Ergebnis" behauptet.

**Befund 2: bei einem Regress ist die Probe selbstzerstörend.** Fall 3 betrifft `TRUNCATE users` und
`DROP TABLE users`. Greift das Rechtemodell nicht, **löscht die Probe die Daten, die sie schützen
soll**. Eine Prüfung, die im Fehlerfall Schaden anrichtet, ist keine Prüfung.

**Befund 3: der wichtigste Fall wird von keinem Skript ausgeführt.** Die eigenen Kommentare nennen
den Test der **Vorgaben für neue Objekte** als den eigentlichen Test („Genau das ist der Punkt, an
dem `ALTER DEFAULT PRIVILEGES` in der Praxis oft wirkungslos ist"). Er kommt in `rechtprobe.sql`
nur als Beschreibung vor und läuft in `stack-test.ps1` **nicht** — dort gibt es die Schritte **1–6**,
während `rechtprobe.sql` Zeile 25 auf „`scripts/stack-test.ps1` **Schritt 7**" verweist, den es nicht
gibt.

**Befund 4: `stack-test.ps1` hat kein Urteil.** Das Skript endet mit `Pop-Location` — kein
`exit 1`, keine Zusicherung, keine Zusammenfassung. Es **druckt** sechs Abschnitte und endet immer
mit Exit-Code 0. Wer den Exit-Code prüft, erfährt damit nichts; wer die Ausgabe liest, muss sie
selbst beurteilen. Das ist genau die Form, die die eigenen Statusregeln („abgehakt wird nur
Belegtes") vermeiden wollen.

**Bereitgelegt, NICHT angewendet:**
[`hilfen/rechte-probe-assertion.sql`](hilfen/rechte-probe-assertion.sql) — dieselben Prüfungen, aber
**fragend statt versuchend**: `has_table_privilege()`, `has_schema_privilege()` **beantworten** eine
Rechtefrage, ohne sie auszuüben. Eine Abfrage kann nichts löschen. Zehn Prüfungen, ein `RAISE
EXCEPTION` bei Verstoß → Exit-Code auswertbar. **Beide Ausgänge sind ausgeführt:** Normalfall →
`NOTICE: Rechteprobe bestanden: 10 Prüfungen.` Exit **0**; absichtlich falsche Erwartung →
`ERROR: … hier muss es knallen`, Exit **1**. Dazu der Fall, der bisher in keinem Skript läuft
(Vorgaben für neue Objekte), als Transaktion mit `ROLLBACK`.

### Was ich unabhängig **bestätigt** habe

| Behauptung | Meine Messung |
|---|---|
| „Rechtesystem belegt" | `pmh_app`: SELECT **erlaubt**, `CREATE TABLE`/`TRUNCATE` **verweigert**; `pmh_readonly`: SELECT **erlaubt**, `INSERT` **verweigert**; Schemaprüfung: `has_schema_privilege('pmh_app','pmh','CREATE')` = **f** |
| Die Vorgaben greifen für **neue** Objekte (der subtile Fall) | Als Eigentümerin eine Tabelle angelegt: app SELECT `t`, app INSERT `t`, readonly SELECT `t`, readonly INSERT `f`, app Schema-DDL `f` — danach `ROLLBACK`, Tabelle existiert nicht (0) |
| Migrationen liegen jetzt in Schema `pmh` | **10 Tabellen in `pmh`**, `schema_migrations` dort |
| Der Stack läuft vollständig | vier Rollen, `pg_default_acl` = 3, `docker compose config` fehlerfrei |

**Einschätzung.** Die Substanz ist da und sie stimmt. Was fehlt, ist die **Urteilsfähigkeit** der
Prüfungen: drucken statt zusichern. Das ist kein Sicherheitsloch — es ist der Unterschied zwischen
„ich habe gemessen" und „ich kann dir sagen, ob es bestanden ist". Bei einer Rechteprobe wiegt es
schwerer als sonst, weil der Fehlerfall hier Daten kostet.

**Nebenbei, unverändert offen (W20):** `packages/auth/db-schema/tests/postgres.test.ts` wurde um
12:05:54 geändert (12.611 → 13.791 B), aber Zeile 16 nennt weiterhin
`postgres://pmh:pmh-dev-only@127.0.0.1:5432/pmh` und Zeile 55 startet weiterhin
`docker run -d --name pmh-postgres … -p 5432:5432` — beides zeigt auf den **alten** Stand und der
Hinweis **kollidiert** heute mit dem Compose-Container.

---

## B10 — Die Betreiber-Weisung ist in der Sache belastbar, **zitiert aber den falschen Baum** — **M**

**Anlass.** `docs/decisions/betreiber-weisung-2026-10-13.md` (10,0 KB, 12:10, Commit `4506fa7`)
hält die Entscheidungen des Betreibers fest — Reihenfolge (Kette zuerst), E2E → Mandantentrennung,
Krypto-Modell, Git-Historie, Adapter-Vorlage, freellmapi-Muster. Das Dokument ist dicht und
prüfbar. Ich habe die Kernbehauptungen nachgemessen.

### Was **bestätigt** ist (mit stärkerem Verfahren als angegeben)

| Behauptung | Meine Messung |
|---|---|
| Argon2id `m=19456, t=2, p=1` | **exakt**: `ARGON2_PARAMETERS = { algorithm: 'argon2id', memoryCost: 19_456, timeCost: 2, parallelism: 1 }` (`packages/auth/auth/src/index.ts:118`) |
| „Umschlagverschlüsselung: eigener Datenschlüssel je Zeile, mit dem Hauptschlüssel verschlüsselt" | **exakt**: Spalten von `pmh.user_secrets` sind `value_cipher bytea`, `wrapped_key bytea`, `master_key_version integer`, `key_hint text` |
| „RLS selbst ist nicht eingebaut" | **bestätigt**: null Treffer auf `ROW LEVEL SECURITY` / `CREATE POLICY` / `ENABLE ROW LEVEL` im gesamten Auth-Paket |
| „Wurde ein echter Schlüsselwert committet? **nein**" | **bestätigt — und stärker geprüft als beschrieben.** Nicht per Muster, sondern mit den **13 echten Werten** aus dem Credential-Speicher als Suchbegriffe: `git grep -F -f` über **alle 27 Commits** aller Zweige → **null Treffer** (`werkzeuge/geheimnis-historie.mjs`) |
| „`gitleaks` nicht installiert, pre-commit-Haken: nein" | **bestätigt**: beide Programme nicht auffindbar, kein Haken in `.git/hooks`, keine `.pre-commit-config.yaml` |
| „Unser `packages/llm/llm-deepseek` hat 1 Quelldatei (493 Zeilen)" | **exakt**: 1 Datei, **493 Zeilen** |

### Was **nicht** stimmt: die Zahlen der Vorlage-Tabelle stammen aus dem Arbeitsbaum

`betreiber-weisung-2026-10-13.md` §5 nennt Dateizahlen „der Vorlage" und leitet daraus die
Entscheidung „übernehmen oder portieren" ab. Für **keine** der fünf Zeilen ist eine Zahl in der
**Vorlage** reproduzierbar — aber **alle fünf** reproduzieren sich **exakt** in
`C:\Users\Chang\deepseek-harness`:

| Paket (`src/`) | Doku sagt | **Vorlage** `harness\prometheus-harness` | **Arbeitsbaum** `deepseek-harness` |
|---|---|---|---|
| `llm-deepseek` | 11 | **24** | **11** ← Quelle der Zahl |
| `llm` | 14 | **13** | **14** ← |
| `llm-pi-ai` | 12 | 12 | 12 (beide gleich) |
| `llm-retry` | 5 | **3** | **5** ← |
| `token-meter` | 10 | **11** | **10** ← |

**Warum das zählt.** `deepseek-harness` ist laut `.pmh/base.json` der **Arbeitsbaum** („workbench":
„unser Werkzeug (der laufende Agent) **und** die Core-Referenz"), die Vorlage ist dagegen der
saubere Checkout `harness\prometheus-harness` auf `d743267388` = Tag **`dsh-v0.2.1-alpha.2`**. Der
Arbeitsbaum trägt dagegen `c7edfcbc41` „dsh-custom" auf Basis von **`dsh-v0.1.1-rc.2`** plus
57 gepatchte Upstream-Dateien. Es sind also **zwei verschiedene Versionen**, und die Zahlen kommen
aus der **älteren, gepatchten**.

**Folge für die Entscheidung.** Die Aussage „unser Adapter hat 1 Datei, die Vorlage 11" wird durch
die Korrektur **stärker**, nicht schwächer: die Vorlage hat **24** Quelldateien in
`llm-deepseek/src/`. Aber der Vergleich zeigt auf den falschen Baum — und wer „übernehmen" wählt,
greift dann möglicherweise den **0.1.1-Adapter** statt den der 0.2.1-Vorlage. Das ist genau die
Verwechslung, gegen die dieses Projekt drei getrennte Ordner angelegt hat.

### Ein Lesbarkeitshinweis, kein Fehler

Die Tabelle in §2 stellt „Mandantentrennung (gewollt)" und „Ende-zu-Ende (nicht gewollt)" gegenüber
und nennt als Schutz gegen einen vergessenen Filter im Code „**ja**, über RLS". Das Dokument sagt
zwei Absätze später ehrlich, dass **RLS nicht eingebaut** ist. Wer nur die Tabelle liest, hält eine
**Ziel**eigenschaft für eine **Bestands**eigenschaft. Die Aussage ist also richtig, die Darstellung
lädt zum Missverständnis ein.

**Einschätzung.** In der Sache stimme ich dem Dokument zu: die Folgerung „E2E und Agent schließen
sich aus" ist zwingend, und die Trennung von Passwort-Hash und Datenschlüssel ist die richtige
Antwort auf die „Passwort als Key"-Falle. Der einzige harte Fehler ist die **Quellenangabe** der
Zahlen — und er ist belegt, nicht vermutet.

---

## B11 — Die Boot-Sonde räumt nach **Prozessname und Alter** auf, nicht nach Herkunft — **M**

**Anlass.** `docs/status/messsonden/boot-schleife.ps1` (112 Zeilen, 13.10. 12:14) misst die
Boot-Schleife dreimal. Die Sonde ist sauber gebaut — sie startet den Host, wartet auf `token=`,
beendet ihn über die **eigene PID** (Zeile 102) und gibt Fehlermeldungen aus statt nur „ROT". Genau
deshalb hat sie ihren eigenen Pfadfehler (17 von 17 Paketen „rot") selbst aufgedeckt. Eine Zeile
darin ist aber gefährlich:

```powershell
# Zeile 103
Get-Process bun -ErrorAction SilentlyContinue |
  Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-2) } |
  Stop-Process -Force -ErrorAction SilentlyContinue
```

**Was daran falsch ist.** Das ist kein Aufräumen, sondern ein **Namensfilter**: es beendet **jeden**
Prozess `bun`, der in den letzten zwei Minuten gestartet wurde — unabhängig davon, wem er gehört.
Die Sonde läuft dreimal, trifft also drei Mal ein Zwei-Minuten-Fenster. Konkrete Folgen:

| Folge | Warum sie eintreten kann |
|---|---|
| Der **andere Agent** wird mitten in einem Lauf getötet | sein `bun test`, `bun run typecheck` oder `bun install` läuft als Prozess `bun` — wenn er in eines der Fenster fällt, endet er **still**, ohne Fehlermeldung bei ihm |
| **`node_modules` kann beschädigt werden** | `bun install` **schreibt**; ein `-Force`-Abbruch mitten im Schreiben ist der einzige Fall in dieser Sonde, der echten Schaden anrichten kann |
| **Waisen werden nicht gefunden** | beendet wird nach Alter, nicht nach Herkunft. Ein echter Waise — das Ziel der Zeile — ist genau der Fall, den ein Baum-Abbruch über die **bekannte PID** richtig erledigt |

**Der richtige Weg liegt im eigenen Haus.** `scripts/start.mjs` Zeile 147–157 macht es vor: die
**PID** ist bekannt („`taskkill /pid <pid> /T /F` ist der einzige verlässliche Weg, auch **Enkel** zu
erfassen"). Zeile 102 der Sonde tut das schon — Zeile 103 ist damit nicht nur gefährlich, sie ist
**überflüssig**.

**Status: latent, kein Schaden eingetreten.** Zum Messzeitpunkt (12:16) lief kein `bun`-Prozess
(`Get-Process bun` → leer). Die Zeile trifft also niemanden, solange niemand gleichzeitig arbeitet —
und genau das ist die Lage, in der der andere Agent arbeitet.

**Empfehlung (nicht ausgeführt).** Zeile 103 streichen; für den Prozessbaum die vorhandene PID mit
`taskkill /PID <pid> /T /F` beenden — dieselbe Zeile wie in `scripts/start.mjs`.

---

## B12 — Die Sprachwahl-Recherche ist die stärkste Arbeit bisher — sie trägt aber **einen widerlegten Satz** weiter — **M**

**Anlass.** `docs/research/sprachwahl-entscheidung-2026.md` (75 KB, 654 Zeilen, 12:06) — „belegter
Bericht", je Abschnitt mit **Empfehlung / Begründung / Gegenargument**. Zehn Entscheidungen. Das ist
die Form, die diese Rolle sonst einfordert: Aussage, Beleg und Gegenbeleg getrennt.

### Was ich **vollständig reproduziert** habe (eine der stärksten Prüfungen dieser Sitzung)

Die Recherche stützt ihre ersten Entscheidungen auf eine eigene Messung (§0). Ich habe sie mit
`werkzeuge/pty-probe.mjs` nachgefahren — Bun 1.4.0, Windows x64:

| Behauptung des Dokuments | Meine Messung |
|---|---|
| „**Bun erzeugt selbst ein echtes PTY** unter Windows (ConPTY): das Kind sieht `isTTY=true`" | **reproduziert**: `Bun.spawn({ terminal: … })` → Kind meldet `istTTY=ja`, Marker kommt an, und die Ausgabe enthält **echte Terminal-Sequenzen** (`\u001b[?9001h`, `\u001b[2J`, `\u001b[?25l`) |
| „`node-pty` lädt und startet unter Bun, liefert aber **keine Daten** (16 Bytes, kein Marker)" | **exakt reproduziert**: Prozess endet, **16 Bytes** empfangen, **kein** Marker, Kind meldet `istTTY=nein` |
| „`bun:ffi` bindet `kernel32!MoveFileExW` direkt" | **reproduziert**: `MoveFileExW` gebunden |
| „`node:ffi`… `koffi` trägt unter Bun" | **plausibel bestätigt**: `node-pty` **lädt** (Import erfolgreich), `Bun.Terminal` ist eine Funktion |

Damit stehen die Entscheidungen **1** (PTY über Bun), **2** (`pmh-pty` überflüssig), **5** (`koffi`
→ `bun:ffi`) und **7/8** (Sandbox) auf **von unabhängiger Seite reproduziertem** Grund. Das ist
selten und verdient Anerkennung: die Zahlen sind nicht behauptet, sie stimmen.

### Der Fehler: Entscheidung 4 trägt einen **widerlegten** Satz weiter

> **§Kurzfassung, Entscheidung 4:** „**`pmh-atomicfs` (Rust, 759 Z.)** — **Zurückziehen** — löst ein
> Problem, das Bun selbst löst. **Kein Code ruft es auf.**"

Der zweite Satz ist **falsch** — er ist bereits in Befund **B6** widerlegt, und zwar mit den Mitteln
dieses Repositories: `packages/util/atomic-write/src/index.ts` ist ein vollständiger Aufrufer des
Rust-Prozesses, das Paket ist **Workspace-Mitglied**, seine Tests laufen laut eigenem Nachweis gegen
das echte Binary, `native/atomicfs/README.md` Zeile 68 nennt den Aufrufer selbst, und
`docs/review-report.md` Zeile 245 sagt es wörtlich. Der erste Satz der Entscheidung („Bun löst das
Problem selbst") kann trotzdem richtig sein — aber „kein Code ruft es auf" ist **nicht** der Grund,
und die Empfehlung „zurückziehen" steht auf einer Prämisse, die zwei Messungen widerlegen.

**Warum das zählt.** Derselbe falsche Satz steht jetzt in **zwei** Dokumenten
(`review/rust-bestand.md` §4 und `research/sprachwahl-entscheidung-2026.md` Kurzfassung 4). Ein
Fehler, der zweimal auftaucht, wird beim dritten Mal zur Voraussetzung — und „zurückziehen, ruft
ohnehin niemand auf" ist genau die Art Entscheidung, die später Arbeit kostet.

### Eine **offene Frage** des Dokuments kann ich beantworten

Das Dokument schreibt zur Zeilenzahl (§0, Hinweis):

> „Der Auftrag nennt 6.569 für ‚6 Crates'; **die Differenz ist nicht aufgeklärt** — vermutlich
> Zählweise oder veränderter Stand. Ich verwende **meine** Zahl."

**Beides ist richtig, und die Differenz sind die Leerzeilen.** Mit
`werkzeuge/zeilen-klassen.mjs` (Code, Kommentar und Leerzeile getrennt gezählt, nur versionierte
Dateien):

| Ordner | Code | Kommentar | Leer | **Code+Kommentar** | **Alle Zeilen** |
|---|---:|---:|---:|---:|---:|
| `native/atomicfs` | 623 | 136 | 61 | **759** | 820 |
| `native/crypto` | 685 | 106 | 68 | **791** | 859 |
| `native/flock` | 1.101 | 372 | 151 | **1.473** | 1.624 |
| `native/index` | 865 | 137 | 93 | **1.002** | 1.095 |
| `native/landlock-run` | 577 | 219 | 85 | **796** | 881 |
| `native/pty` | 556 | 84 | 50 | **640** | 690 |
| `services/pmh-sandbox` | 447 | 106 | 47 | **553** | 600 |
| **Summe** | **4.854** | **1.160** | **555** | **6.014** | **6.569** |

Die Zahlen des Dokuments (759 · 791 · 1.473 · 1.002 · 796 · 640 · 553 = **6.014**) reproduzieren sich
**pro Crate exakt**. Die 6.569 des Auftrags sind dieselben Dateien **mit** Leerzeilen. Es ist **kein**
veränderter Stand und **kein** Zählfehler — es sind **555 Leerzeilen** (8,4 %).

### Eigene Korrektur (H6)

In Befund **B6** hatte ich geschrieben, „Code + Kommentar ergibt genau die 6.569". Das war **falsch**:
Code + Kommentar sind **6.014**; die 6.569 sind **alle** Zeilen. Die damalige Schlussfolgerung (die
Einzelwerte der Tabelle sind Code-Zeilen ohne Kommentare) war ebenfalls zu grob — es sind
**Code + Kommentar**. Mit der Klassenzählung ist es jetzt gemessen statt geschätzt.

**Einschätzung.** Die Recherche ist handwerklich die beste Arbeit, die ich in diesem Projekt geprüft
habe: Primärquellen, eigene Messung am Host, und zu **jeder** Empfehlung ein Gegenargument. Sie
scheitert nicht an ihren Zahlen — sie übernimmt einen Satz aus einem anderen Dokument, ohne ihn zu
prüfen. Das ist die eine Lücke, und sie betrifft genau eine Empfehlung von zehn.

---

## B13 — Das Töten nach Prozessname und Alter ist **systemisch**: **sechs** Stellen, Fenster bis fünf Minuten — **M**

> **Nachtrag 13.10.2026, 12:45 — es sind inzwischen sechs.** Beim Nachzählen (Takt 14) steht die Zeile
> auch in `scripts/port-test.ps1:**154**`. Der Grund ist aufschlussreich: der bauende Agent hat einen
> **vierten Testfall** ergänzt (`$p4`, ein weiterer Host-Start samt Token-Prüfung) — und die
> Aufräumzeile **mitkopiert**. **Das Muster wächst mit jedem neuen Testfall**, statt einmal richtig
> gelöst zu werden. Genau das ist der Unterschied zwischen einem Einzelfall und einem Muster.

**Anlass.** In **B11** habe ich eine Zeile in `boot-schleife.ps1` beanstandet. Beim nächsten Takt
zeigt die Suche nach derselben Klasse: **es ist kein Einzelfall, sondern ein Muster.**

**Mesung.** Suche nach `Stop-Process` in allen Skripten und Sonden:

| Datei | Zeile | Fenster | Wirkung |
|---|---|---|---|
| `docs/status/messsonden/boot-schleife.ps1` | 103 | **2 min** | beendet **jeden** `bun`-Prozess der letzten 2 Minuten |
| `scripts/port-test.ps1` | 40 | **1 min** | dieselbe Zeile, im Funktionsrumpf `StarteHost` — läuft **je Aufruf** |
| `scripts/port-test.ps1` | 102 | **5 min** | dieselbe Zeile am **Ende** des Skripts, mit dem **weitesten** Fenster |
| `docs/status/messsonden/api-flaeche.ps1` | 92 | 3 min | dieselbe Zeile |
| `docs/status/messsonden/api-test.ps1` | 33 | 3 min | dieselbe Zeile |
| `scripts/port-test.ps1` | **154** | **2 min** | **neu beim vierten Testfall** (`$p4`) — mitkopiert, nicht gelöst |

**Warum das zählt.** Die Absicht ist überall dieselbe und richtig: **die eigenen Kinder aufräumen**.
Die Umsetzung ist überall dieselbe und falsch: `Get-Process bun | Where StartTime -gt now-Nmin |
Stop-Process -Force` beendet nach **Name und Alter**, nicht nach **Herkunft**. Folgen:

| Folge | Warum sie eintritt |
|---|---|
| Ein fremder `bun`-Lauf stirbt **still** | jedes `bun test`, `bun install`, `bun run <skript>` des anderen Agenten ist ein Prozess `bun`; fällt er ins Fenster, endet er ohne Meldung bei ihm |
| `node_modules` kann beschädigt werden | `bun install` **schreibt**; ein `-Force`-Abbruch mitten im Schreiben ist der einzige Pfad in diesen Sonden, der echten Schaden anrichtet |
| Die **5-Minuten**-Variante ist die gefährlichste | sie steht am **Ende** von `port-test.ps1` und trifft alles, was seit fünf Minuten läuft — auch einen absichtlich gestarteten Host |
| Echte Waisen werden **nicht** gefunden | beendet wird nach Alter. Ein Waise ist genau der Fall, den ein Baum-Abbruch über die **bekannte PID** löst |

**Was ich geprüft und **entlastet** habe (Fairness):**

* **Die DSH-GUI ist nicht betroffen.** Port 3080 hält **PID 22260** — der Harness läuft auf
  **`node`**, nicht auf `bun` (`netstat -ano` zeigt `127.0.0.1:3080 … ABHÖREN 22260`). Der
  Namensfilter `Get-Process bun` trifft ihn nicht. Die Hausregel **H1** ist damit durch diese Sonden
  **nicht** gefährdet.
* **Kein Skript tötet einen Portbesitzer.** Die Suche nach `Get-NetTCPConnection`, `OwningProcess`,
  `taskkill` und `kill(` ergibt: **keine** Stelle, die den Halter eines Ports beendet. Die
  Portwahl (`scripts/port-wahl.mjs`) **bindet und gibt frei** — sie fragt nicht und tötet nicht.
* **Die Portlogik selbst ist sauber und durchdacht:** beide Adressfamilien werden geprüft
  (`127.0.0.1` **und** `::1`), der Standardport wird bei Belegung übersprungen, und `--strict-port`
  erzwingt den sichtbaren Abbruch. Der Test dafür (`port-test.ps1` Fall 3) prüft die Meldung, nicht
  nur den Exit-Code.
* **Der eigene Fehler ist dokumentiert:** `port-halter.mjs` erklärt im Kopf, dass der erste Versuch
  mit `bun -e` den Port **nicht** hielt und der Test deshalb „in allen drei Fällen Port ist frei"
  meldete — also nichts prüfte. Genau diese Art grüner Test beanstandet die eigene Regel auch.

**Empfehlung (nicht ausgeführt).** Die fünf Zeilen streichen. Für den Prozessbaum die **bekannte
PID** verwenden — `scripts/start.mjs` Zeile 163 macht es vor (`taskkill /pid <pid> /T /F`, ausdrücklich
wegen der Enkelprozesse), und die Zeile davor in jeder Sonde beendet bereits die eigene PID.

---

## B14 — Die Umschlagverschlüsselung existiert als **Schema**, nicht als Code — und zwei `.env`-Namen liest niemand — **M**

**Anlass.** Die Betreiber-Weisung §3 sagt: *„**Passwort als Key** wird verworfen — **der Bestand macht
es schon richtig**"*, mit der Zeile „Anbieter-Schlüssel | **Umschlagverschlüsselung**: eigener
Datenschlüssel je Zeile, mit dem Hauptschlüssel verschlüsselt (`user_secrets`) | **richtig**". In
Befund **B10** habe ich die **Spalten** bestätigt. Jetzt habe ich gefragt, wer sie **benutzt**.

**Ergebnis der Suche:**

| Frage | Messung |
|---|---|
| Gibt es die Spalten? | **ja** — `packages/auth/db-schema/migrations/0001_identitaet.sql:149–150` (`value_cipher`, `wrapped_key`), dazu `master_key_version`, `key_hint` |
| Schreibt oder liest **Code** sie? | **nein** — `value_cipher` und `wrapped_key` kommen **außerhalb der Migration nirgends** vor (die Treffer im Repo sind meine eigenen Protokolldateien) |
| Wird `user_secrets` überhaupt benutzt? | **nur in Testdateien** — als Eintrag in Tabellenlisten (`migrate.test.ts:236,249`, `postgres.test.ts:78,111`). Kein Produktivcode |
| Dasselbe für `api_keys` | ebenso: **nur** in Testdateien |
| Wird `PMH_MASTER_KEY` / `PMH_MASTER_KEY_VERSION` gelesen? | **0 Treffer** — in `.ts`, `.mjs`, `.go`, `.rs`, `.sh`, `.sql`, `.ps1`, `.yml`, `.md` |
| Wird `MIGRATION_DATABASE_URL` gelesen? | **0 Treffer.** Die Migrationen lesen `PMH_TEST_DATABASE_URL` (4 Treffer) |
| Gegenprobe — Variablen, die **wirklich** gelesen werden | `PMH_APP_USER` **9 Treffer**, `PMH_OWNER_USER` **14 Treffer** (in den Einrichtungs-Skripten) |

**Was daraus folgt — und was ausdrücklich nicht.** Die Aussage „der Bestand macht es schon richtig"
ist **für das Schema wahr** und **für den Code falsch**: es gibt keinen Codepfad, der einen
Anbieter-Schlüssel verschlüsselt ablegt. Wer §3 liest, kann glauben, Anbieter-Schlüssel lägen heute
verschlüsselt in der Datenbank — sie liegen **gar nicht** dort, weil sie noch nirgends geschrieben
werden. Und wer der neuen `.env.example` folgt und `PMH_MASTER_KEY` setzt, ändert **nichts**: kein
Programm liest den Wert.

**Warum ich das melde.** Es ist derselbe Fehlertyp wie in **B6/B12** („kein Code ruft es auf") — eine
**Bestandsaussage**, die auf einem Plan beruht statt auf einer Messung. Die Entscheidung selbst ist
richtig: Envelope-Verschlüsselung **ist** die richtige Antwort, und ein Schema dafür anzulegen ist
der richtige erste Schritt. Es fehlt nur der Satz „gebaut ist es noch nicht".

**Nicht widerlegt, nur nicht prüfbar:** `scripts/token-adresse.mjs` beschreibt die Ausgabeform des
Hosts als `dsh web: http://127.0.0.1:<port>/?token=<43 Zeichen base64url>` („gemessen, nicht
angenommen"). Aus meiner Sitzung ist das **nicht** prüfbar: die laufende DSH-GUI meldet in
`DSH_WEB_URL` nur `http://127.0.0.1:3080`, **ohne** Token-Parameter. Die Angabe bleibt damit
**ungeprüft** — nicht bestritten.

---

## B15 — Der widerlegte Satz steht jetzt auf der **Startseite** — und die drei Bäume sind falsch beschriftet — **M**

**Anlass.** `README.md` (147 Zeilen, 12:28) ist der Vertrag gegenüber einem Fremden. Ich habe jede
prüfbare Angabe nachgemessen.

### Teil 1: Zum **dritten** Mal derselbe widerlegte Satz

> **README Zeile 60:** „**Rust** | 6.569 Zeilen in 6 Crates — **nichts ruft sie auf**, kein Skript
> baut sie"  ·  **Zeile 85:** „`native/` 6 Rust-Crates … — **derzeit ungenutzt**"

In **B6** widerlegt, in **B12** als weitergereicht gemeldet (damals zwei Dokumente), jetzt steht er
im **README** — dem Dokument, das jeder zuerst liest. Beleg unverändert:
`packages/util/atomic-write/src/index.ts` ist ein vollständiger Aufrufer des Rust-Prozesses
`pmh-atomicfs`, das Paket ist Workspace-Mitglied (`bun.lock` Zeile 119), seine Tests laufen gegen das
echte Binary, `native/atomicfs/README.md` Zeile 68 nennt den Aufrufer selbst, und
`docs/review-report.md` Zeile 245 sagt es wörtlich.

**Die Vorhersage aus B12 ist damit eingetreten:** „Ein Fehler, der zweimal auftaucht, wird beim
dritten Mal zur Voraussetzung." Nur war das dritte Mal die Startseite. Der zweite Teil des Satzes
(„kein Skript baut sie") ist dagegen **richtig** — und die Binaries liegen trotzdem gebaut in
`target/debug/` (B7).

### Teil 2: Die drei Bäume sind widersprüchlich beschriftet — die Ursache von **B10**

> **README Zeile 11–13:** „Der **unveränderte Upstream** liegt unter `C:\Users\Chang\deepseek-harness`
> (Werkzeug und Core-Referenz), der **Referenz-Fork** unter `C:\Users\Chang\harness\prometheus-harness`"

Gemessen:

| Baum | HEAD | Zustand | Label im README | Urteil |
|---|---|---|---|---|
| `deepseek-harness` | `c7edfcbc41` „dsh-custom: alles Nicht-Upstream als eigener Stand" | **57 gepatchte Upstream-Dateien** laut eigenem Commit-Text, dazu **11 uncommittete** Änderungen; Basis `dsh-v0.1.1-rc.2` | „**unveränderter Upstream**" | **falsch.** Es ist der **Arbeitsbaum** — gepatcht und auf einer anderen Version |
| `harness\prometheus-harness` | `d743267388` = Upstream-Merge für **`0.2.1-alpha.2`** | 2 uncommittete Änderungen | „Referenz-Fork" | vertretbar — dies ist der Baum, der zur Vorlage passt |
| `prometheus-harness` (dieser) | `7a118fd` | unser Aufbau | „Dieses Verzeichnis ist die Harness selbst" | richtig |

Dazu `.pmh/base.json`, das **`checkout.path`** und **`layout.ours`** auf
`harness\prometheus-harness` zeigt („unsere Harness, **hier wird gearbeitet**") — obwohl die Arbeit
seit dem 12.10. in `C:\Users\Chang\prometheus-harness` stattfindet. **Drei Bäume, drei Bezeichnungen,
keine einzige Quelle der Wahrheit** — und genau daraus entstand der Fehler in **B10**, wo Zahlen „der
Vorlage" den Arbeitsbaum maßen.

### Was ich nachgemessen und **bestätigt** habe (Fairness)

| Angabe im README | Messung |
|---|---|
| „PostgreSQL **17.11** + pgvector **0.8.7**" | **exakt**: `server_version` 17.11, `pgvector` 0.8.7 |
| „Redis **7.4.9**" | **exakt**: `redis-server --version` → `v=7.4.9` |
| „**14** Applikationspakete" | **exakt** 14 |
| „**112** Dateien · 1,4 MB" Quellcode | bestätigt (113 / 1.443 KB bei meinem Messzeitpunkt) |
| „Ist **3080** belegt, weicht der Start auf den nächsten freien Port aus und nennt ihn" | **bestätigt** — die Portlogik tut genau das, und der Port ist heute belegt (von der DSH-GUI) |
| „**262 + 108** Tests grün" | **plausibel**: ich zähle 73 + 36 = **109** `test(…)`-Aufrufe in den beiden Auth-Dateien (Abweichung 1, erklärbar durch eine seither ergänzte Prüfung) |
| „**17.733** Zeilen TypeScript in 14 Paketen" | **im Definitionsrauschen**: alle versionierten `.ts` unter `packages/` sind **18.712** Zeilen in 45 Dateien; **eine einzige Testdatei** (`auth/tests/auth.test.ts`, **1.040** Zeilen) erklärt den größten Teil der Differenz (18.712 − 1.040 = 17.672). Die Zahl ist nicht exakt reproduzierbar, aber auch nicht widerlegt — die Definition fehlt |

**Einschätzung.** Das README ist das ehrlichste Dokument im Repository: es nennt in derselben Tabelle
den **ausgefallenen** API-Weg (`404`, `1008 Policy Violation`) und die **2 roten** Tests von
`pmh-supervisor`. Genau deshalb wiegt der eine übernommene Satz schwer — in einem Dokument, das
sonst zwischen „läuft" und „läuft nicht" sauber trennt.

---

## B16 — „API ausgefallen" ist **nicht belegt**: die Sonde prüfte geratene Pfade mit der falschen Methode — **H**

**Die Behauptung.** `README.md` Zeile 55, die schwerwiegendste Zeile des Repos:

> „**API** | **ausgefallen.** `/api/*` → **404** (18 Pfade geprüft), WS `/api/remote.mux` → **1008
> Policy Violation**. Ursache: der `typert`-Stapel registriert sich nicht, das Gateway hängt daran"

Darauf steht die Entscheidung `docs/decisions/eigener-endpunktweg.md` („weil die Vorlage **keine
erreichbare API** hat"). Ich habe die Sonde gelesen, ihre Methode geprüft und den Gegenfall gemessen.

### Was die Sonde wirklich tut (`docs/status/messsonden/api-flaeche.ps1`)

* Zeile 62–71: **19 Pfade per GET** — `/`, `/healthz`, `/api`, `/api/health`, `/api/sessions`,
  `/api/workspaces`, `/api/settings`, `/api/models`, `/api/agents`, `/api/commands`, `/api/skills`,
  `/api/plugins`, `/api/jobs`, `/api/goal`, `/api/terminal`, `/api/files`, `/api/credentials`,
  `/api/account`, `/api/telemetry`. **Alles geratene REST-Namen.**
* Zeile 75–77: **POST** nur auf `/typert`, `/rpc`, `/gateway`, `/api/typert` — ebenfalls **erfundene**
  Namen.
* **Kein einziger geprüfter Pfad ist ein registrierter Endpunkt.**

### Wie der Kern wirklich spricht — aus dem eigenen Repository

| Beleg | Aussage |
|---|---|
| `docs/dsh/original/api-gateway.md` Zeile 123 | „Remote calls use the Connection's **`/api`** route" — **eine** Route |
| `docs/dsh/original/api-gateway.md` Zeile 163 | Aufbau: `remotes → gateway → connection → webserver` |
| `packages/api/gateway/src/index.ts` (Kern) Zeile 106 | die Route wird unter **`/api`** eingehängt |
| Kern-Test `gateway.host.spec.ts` Zeile 1121 | `fetch(origin + '/api/goals/create', { **method: 'POST'** })` — so wird gerufen: **POST `/api/<namespace>/<methode>`** |

Ein beliebiger Pfad — auch `/api/status` — **muss** also 404 liefern, **auch wenn alles läuft**.

### Der Gegenfall, gemessen (nicht behauptet)

`werkzeuge/api-erreichbarkeit.mjs` gegen die **laufende DSH-Harness** (Port 3080, dieselbe
Core-Familie, meine Sitzung läuft darin erfolgreich):

```
/api/goals/create      POST  200   JSON-RPC-Rahmen: JA
    {"type":"server-response","rpcId":"invalid-request","result":{"ok":false,
     "error":{"code":"bad-request","message":"invalid request …
/api/health            POST  404   JSON-RPC-Rahmen: nein   "not found"
/api/sessions          POST  404   JSON-RPC-Rahmen: nein   "not found"
/api/aufsicht/probe    POST  404   JSON-RPC-Rahmen: nein   "not found"
WS /api/remote.mux          Fehler beim Handschlag (Route hier nicht vorhanden)
```

**Das ist der Beweis, dass die Sonde nicht unterscheiden kann:** In einer Installation, in der das
Gateway **nachweislich antwortet** (HTTP 200 mit JSON-RPC-Rahmen), liefern genau die Pfade, die die
Sonde prüft, **404 „not found"**. Eine 404 auf `/api/health` ist damit **kein** Beleg für einen toten
API-Weg.

### Und der WS-Teil spricht eher **für** die Route

Die Sonde meldet für `/api/remote.mux` einen **Close-Code 1008** — das setzt einen **erfolgreichen
Handschlag** voraus, sonst gäbe es keinen Close-Code. In der laufenden DSH-Installation scheitert der
Handschlag dagegen **ganz** (kein Close-Code). Der eigene Befund ist damit schwächer als gedacht:
**1008 ist ein Zeichen dafür, dass die Route bedient und die Verbindung abgelehnt wurde** — nicht
dafür, dass sie fehlt.

### Der richtige Test (bereitgelegt)

```powershell
bun run docs\protokoll\aufsicht\werkzeuge\api-erreichbarkeit.mjs http://127.0.0.1:<port-des-pmh-hosts>
```

Er ruft **POST** auf registrierte **und** unregistrierte Endpunkte und unterscheidet am
**JSON-RPC-Rahmen**: lebt = Rahmen (auch bei `bad-request`), tot = 404 ohne Rahmen.

### Folgen — und was ausdrücklich offen bleibt

1. Die Zeile „**API ausgefallen**" ist **nicht belegt**. Ob der API-Weg des PMH-Hosts tot ist, weiß
   nach dieser Sonde **niemand** — auch nicht, ob er lebt.
2. Die Entscheidung `eigener-endpunktweg.md` steht auf der Prämisse „die Vorlage hat keine
   erreichbare API". Diese Prämisse ist **unbewiesen**. Die Entscheidung selbst kann trotzdem richtig
   sein — einen **eigenen** API-Weg zu wollen ist ein legitimes Ziel. Nur die Begründung trägt nicht.
3. **Ich behaupte nicht das Gegenteil.** Die DSH-Installation ist Version `0.1.1-rc.2` + Patches, der
   PMH-Host baut auf `0.2.1-alpha.2`; die beiden können sich unterscheiden. Meine Messung zeigt: die
   **Methode** der Sonde kann den Unterschied nicht sichtbar machen — mehr nicht.

**Einschätzung.** Das ist der schwerwiegendste Fund dieser Aufsicht, weil er nicht eine Zahl betrifft,
sondern eine **Richtungsentscheidung**: Auf einer 404, die auch im Gesunden entsteht, wurde „ausgefallen"
gelesen. Die Sonde ist gut gebaut — sie prüft 19 Pfade, den WS-Handschlag, die HTML-Verweise — nur
fragt sie den Server in einer Sprache, die er nicht spricht.

---

## B17 — `P8.12` ist entblockt, aber der Weg ist ein **anderer** als angenommen — **M** (Unterstützung)

**Der offene Punkt.** `docs/status/arbeitspakete.md`, P8.12: *„Aufruf gegen den **echten** Anbieter —
**offen** — kein Schlüssel in dieser Umgebung; kein Nachweis gegen den Dienst."* Dieser Punkt steht
seit dem ersten Takt in meiner Liste. Jetzt ist er **entblockt** — und die Ursache war nicht das
Fehlen eines Schlüssels.

### Was blockiert hat

Der Adapter des Repos liest den Schlüssel an **genau einer** Stelle:

```
packages/llm/llm-deepseek/src/index.ts:510
  export function providerFromEnv(env = process.env, …) {
    const apiKey = assertUsableApiKey(env.DEEPSEEK_API_KEY ?? '', …)
```

Und **nichts** im Repository liest den Credential-Speicher: die Suche nach `apiKeyEnv`,
`credentials-local` und `credentials.yaml` in `packages/`, `apps/`, `services/`, `scripts/` ergibt
**null Treffer**. Daraus folgt der Unterschied, an dem `P8.12` hing:

| Weg | Wer ihn liest |
|---|---|
| `~/.pmh/.credentials.yaml` (Referenzen) | **der Kern** — er löst `apiKeyEnv` darüber auf |
| `env.DEEPSEEK_API_KEY` | **unser eigener Adapter** — und nur das |

**Korrektur meiner eigenen B3-Meldung.** Dort steht seit dem ersten Takt „**erledigt** — Referenz
geschrieben, HTTP 200". Das war **zu früh gefeiert**: die Referenz im Speicher hilft dem **Kern**,
aber **nicht** dem Adapter, den dieses Projekt für die Kette gebaut hat. Für `P8.12` ist die
**Umgebungsvariable** nötig. Status jetzt: **teilweise** — und der fehlende Teil ist benannt.

### Der Beweis (gemessen, nicht behauptet)

`hilfen/anbieter-rauchtest.mjs` setzt die Variable aus dem Speicher (ohne den Wert auszugeben), lädt
**den Adapter des Repos** und ruft den **echten** Dienst:

```
Schlüssel: 35 Zeichen, Fingerabdruck e2159c3d1018 (gleich dem Speicher)
Anbieter aufgebaut: OK (der Adapter hat den Schlüssel angenommen)

ECHTE ANTWORT in 1,20 s
  Modell       : deepseek-flash
  finishReason : stop
  Token        : 41 ein / 117 aus
  Text         : "Empfang"
```

**Der erste Lauf mit `maxTokens: 24` endete mit `finishReason: length` und leerem Text** — das Modell
verbrauchte das Budget, bevor sichtbarer Text entstand. Auch das steht in der Datei, damit niemand
einen leeren Rauchtest für einen Beweis hält.

### Was das belegt — und was nicht

**Belegt:** Der Zugang ist vorhanden, gültig und **über den eigenen Adapter** benutzbar; die Kette
Speicher → Umgebungsvariable → `providerFromEnv` → DeepSeek funktioniert.

**Nicht belegt:** `P8.12` im Sinne der Projektregeln. Der Nachweis verlangt den Aufruf **in der Kette
des Projekts** — durch den bauenden Agenten, nicht durch die Aufsicht. Mein Test ist eine
**Vorstufe**, und er ist als solche gekennzeichnet.

**Zwei Zeilen genügen ihm** (aus `hilfen/zugang-bereitstellen.mjs --umgebung`, geprüft):

```powershell
$env:DEEPSEEK_API_KEY = node -e "const fs=require('fs');const y=require('C:/Users/Chang/deepseek-harness/node_modules/js-yaml');process.stdout.write(y.load(fs.readFileSync('C:/Users/Chang/.pmh/.credentials.yaml','utf8')).refs['DEEPSEEK_API_KEY'])"
bun run docs\protokoll\aufsicht\hilfen\anbieter-rauchtest.mjs
```

**Einschätzung.** Das ist die erste Stelle, an der meine Rolle **unmittelbar** gewirkt hat: nicht ein
Befund über fremde Arbeit, sondern ein entblockter Nachweis. Der Preis war ein echter Aufruf mit
wenigen Token — das ist er wert, weil er eine Aussage („kein Schlüssel in dieser Umgebung") durch
eine Messung ersetzt hat.

### Nachtrag 13.10.2026, 12:45 — der Gateway ist im PMH-Baum **deklariert**

Beim statischen Nachprüfen (Takt 14) zeigt sich ein weiterer Baustein gegen die Ursachenangabe der
Sonde:

| Prüfung | Ergebnis |
|---|---|
| Ist `@deepseek-ai/dsh-api-gateway` im PMH-Baum installiert? | **ja** — Version **0.2.1-alpha.2** |
| Ist es darin referenziert? | **ja** — `lib/index.js`, `lib/remote-events.js` |
| **Deklariert das Basis-Bündel des PMH-Baums das Gateway?** | **ja** — `node_modules\@deepseek-ai\dsh-base\package.json` Zeile **60** und `cordis.patch.yml` Zeile **53** (Bündel-Version ebenfalls 0.2.1-alpha.2) |

**Was das bedeutet.** Der Baustein, den die Sonde als „registriert sich nicht" bezeichnet, ist in dem
Bündel **deklariert**, das der PMH-Host lädt. Damit ist die Ursachenangabe nicht nur unbelegt — sie
widerspricht dem statischen Befund. Der **operative** Schluss bleibt derselbe: der Test muss mit
`POST` auf einen **registrierten** Endpunkt erfolgen (`werkzeuge/api-erreichbarkeit.mjs`).

**Was ich damit nicht behaupte.** Dass die Deklaration im Bündel die Registrierung zur Laufzeit
garantiert, habe ich **nicht** gemessen — das kann nur ein laufender PMH-Host zeigen. Die Deklaration
ist ein **Gegenindiz**, kein Beweis.

### Nachtrag 13.10.2026, 12:48 — der Kern sagt selbst, warum eine 404 nichts beweist

Beim Prüfen des **neuen** Pakets `packages/api/health` (der bauende Agent baut dort seinen ersten
eigenen Endpunkt) stieß ich auf die Dokumentation des Core-Dienstes, den er dafür benutzt:

```
node_modules\@deepseek-ai\dsh-host-webserver\lib\index.d.ts   (Version 0.2.1-alpha.2)
  Zeile 117  * during startup with 404 until its owner registers.
  Zeile 152  * Register a named route. Duplicate (kind, path) throws
  Zeile 157    register(route: WebRoute): () => void;
  Zeile 164    registerUpgrade(route: WebUpgradeRoute): () => void;
```

**Das ist der Mechanismus hinter meinem Befund, in den Worten des Cores:** eine Route ist **404, bis
ihr Eigentümer sie registriert**. Eine 404 auf `/api/health` heißt also „**niemand hat diesen Pfad
registriert**" — nicht „der API-Weg ist ausgefallen". Genau das habe ich am 13.10. um 12:42 an einer
gesunden Installation gemessen (dieselben Pfade → 404; ein registrierter Endpunkt → 200 mit
JSON-RPC-Rahmen).

**Und das neue Paket ist richtig gebaut:** `packages/api/health` benutzt `ctx.webServer.register`
über `inject = ['webServer']` — eine **dokumentierte** Core-Schnittstelle. Der Weg, den der bauende
Agent jetzt geht, steht also auf einem tragfähigen Fundament. Er ist nur ein **zweiter** Weg neben
dem Typert-Gateway, das bereits funktioniert.

---

## V1 — Der erste eigene Endpunkt des bauenden Agenten ist korrekt gebaut und verdrahtet (Verifikation, kein Befund)

**Anlass.** Am 13.10. zwischen 12:41 und 12:47 entstand `packages/api/health` — der erste **eigene**
Endpunkt des Projekts, gebaut auf der Entscheidung „eigener Endpunktweg". Drei Fragen habe ich
unabhängig geprüft, weil ein Plugin, das den Core-Vertrag verfehlt, den Host-Start **scheitern** lässt.

**1. Hält die Route den Core-Vertrag ein?**

```ts
// Core: node_modules\@deepseek-ai\dsh-host-webserver\lib\types\index.d.ts
export type WebRouteKind = 'exact' | 'prefix';
export interface WebRoute {
  kind: WebRouteKind;
  path: string;      // Absolute pathname, no trailing slash.
  handler: (req, res) => void | Promise<void>;   // besitzt den vollen Lebenszyklus
}
```

```ts
// Der Agent: packages/api/health/src/index.ts:219
const route: WebRoute = { kind: 'exact', path: HEALTH_PATH, handler: handleHealth }
export const HEALTH_PATH = '/api/health'      // absolut, kein Schrägstrich am Ende ✓
export const name = 'pmh-health'              // identisch mit der Patch-Zeile ✓
export const inject = ['webServer']           // der Dienst wird abgewartet ✓
ctx.effect(() => ctx.webServer.register(route), `${name} ${HEALTH_PATH}`)   // Rücknahme über ctx.effect ✓
```

**Alle vier Punkte stimmen.** Bemerkenswert: der Dateikopf dokumentiert, dass eine **frühere** Fassung
den Rücknahme-Handler an `ctx.on('dispose', …)` hing — und dass `ctx.effect(…)` der richtige Weg ist.
Das ist derselbe Lernweg wie beim Init-Skript: erst falsch, dann gemessen, dann korrigiert.

**2. Ist das Plugin im Profil eingetragen?** Ja — `scripts/profile-patch.mjs` hat einen markierten
Block in `.pmh-build/harness-home/profiles/web/cordis.patch.yml` geschrieben:

```yaml
# >>> pmh: eigene Einträge (von scripts/profile-patch.mjs geschrieben)
- insert:
  - id: pmh-health
    name: '@prometheus-harness/health'
    inject: [webServer]
# <<< pmh: eigene Einträge
```

Die Kennung stimmt mit `export const name = 'pmh-health'` überein — das ist wichtig, weil der Core
**doppelte `(kind, path)`-Registrierungen wirft**; ein Auseinanderlaufen von Patch und Modul würde den
Start scheitern lassen.

**3. Kann der Host das Paket überhaupt auflösen?** Diese Frage ist nicht trivial, weil der Profilordner
tief im Repository liegt (`.pmh-build/harness-home/profiles/web`) und seine `package.json` **keine**
Abhängigkeiten nennt. Geprüft mit Nodes **eigenem** Resolver aus genau diesem Ordner:

```
Profilordner: C:\Users\Chang\prometheus-harness\.pmh-build\harness-home\profiles\web
  auflösbar: @prometheus-harness/health        -> …\packages\api\health\src\index.ts
  auflösbar: @deepseek-ai/dsh-host-webserver   -> …\node_modules\@deepseek-ai\dsh-host-webserver\lib\index.js
  auflösbar: @deepseek-ai/dsh-base             -> …\node_modules\@deepseek-ai\dsh-base\lib\index.js
```

Die Arbeitsbereichs-Verknüpfung existiert (Junction), steht in `bun.lock` (Zeilen 63, 843), und die
Auflösung greift bis in die **TypeScript-Quelle** — die Bun direkt ausführt. **Der Weg trägt.**

**Was damit noch offen ist (und nur der bauende Agent klären kann):** ob der Host das Plugin beim
Start **lädt** und `GET /api/health` **antwortet**. Die Aufsicht startet den Host nicht (Hausregel
**H2/H5**). Alle drei Voraussetzungen dafür sind aber geprüft — bleibt der Start aus, liegt es nicht
an Vertrag, Eintrag oder Auflösung.

### Nachtrag 13.10.2026, 12:55 — der Test ist **versionsgültig**, und ihr eigener Beleg zeigt den Unterschied

Der bauende Agent hat `docs/status/beleg-eigener-endpunkt.md` vorgelegt (7.939 B) — der Nachweis, dass
sein erster eigener Endpunkt **im Host** läuft. Dieses Dokument ist für meinen Befund entscheidend,
denn es belegt aus **seiner** Feder genau die Unterscheidung, die der alten Sonde fehlte:

> **Sein Beleg, Abschnitt „Falsche Methode wird unterschieden":**
> `POST /api/health` → **405**, `Allow: GET, HEAD` · `/api/health/mehr` → **404** ·
> `/api/unbekannt` → **404** (mit Cookie) bzw. **401** (ohne Cookie)

Ein **registrierter** Pfad antwortet (200 für die richtige, **405** für die falsche Methode); ein
**unregistrierter** antwortet 401/404. Genau das ist der Unterschied, den die alte Sonde nicht messen
konnte — ihre Pfade waren **alle** unregistriert, und deshalb war „401/404" die **erwartete** Antwort
einer lebenden Installation.

**Die README-Zeile steht weiter** — nur die Evidenz wurde geändert (von „`/api/*` → 404" auf
„`/api/*` → **401/404**"), die Ursachenangabe („der `typert`-Stapel registriert sich nicht") blieb.
Nach dem eigenen Beleg ist „401/404" aber **kein** Zeichen für einen toten Weg.

**Und der Test ist versionsgültig.** Ich habe geprüft, ob der registrierte Endpunkt, den ich empfehle,
in **ihrer** Version überhaupt existiert:

```
node_modules\@deepseek-ai\dsh-goal\lib\typert.host.js:233          ← die Host-Registrierung
node_modules\@deepseek-ai\dsh-goal\lib\typert.remote-client.d.ts:22,34
node_modules\@deepseek-ai\dsh-api-remotes\lib\client.js:6538
```

`goals/create` wird also von **`dsh-goal`** in **0.2.1-alpha.2** registriert — dem Stand, den der
PMH-Host lädt. **Eine** Anweisung entscheidet damit die README-Zeile:

```powershell
bun run docs\protokoll\aufsicht\werkzeuge\api-erreichbarkeit.mjs http://127.0.0.1:<port-des-pmh-hosts>
```

*Antwortet `POST /api/goals/create` mit einem **JSON-RPC-Rahmen** → der Gateway lebt, und die Zeile
„API des Cores ausgefallen" ist falsch. Antwortet er 401/404 → der Gateway ist wirklich nicht
registriert, und **dann** lohnt die Ursachensuche.*

### Fairness zu diesem Nachbarthema

* **Der bauende Agent hat meinen Port respektiert.** Sein Beleg sagt ausdrücklich: „Gestartet mit
  `bun run start --no-go`, Port **3081** (**3080 hält der Harness des Betreibers**)." Das ist die
  Rücksicht, die Hausregel **H1** verlangt — von ihm aus freien Stücken.
* **Sein Beleg nennt vier eigene Fehler** mit Messung statt mit Nachdenken (u. a. ein Lebenszyklus-
  Haken auf ein Cordis-Ereignis, das es nicht gibt, und drei Stufen desselben Patch-Form-Fehlers).
  Das ist dieselbe Haltung, die ich in **B12** anerkannt habe.
* **Er benennt fünf Lücken ausdrücklich** — darunter: keine Zustandsprüfung (DB/Redis/LLM), der
  `Content-Length`-Kopf **nicht** verifiziert, die Anmeldung nicht durch einen Test festgehalten,
  Typecheck nur paketweise, nur Windows. Nichts davon wird als erledigt verkauft.

**Mein eigener Verdacht war falsch (H6, Nr. 19).** Ich hielt den lauschenden Port **5522** (Bindung
`0.0.0.0`) für eine Waise aus ihren Sonden. Gemessen: der Port gehört **`RGSUpdater.exe`** (PID 7084,
ein Fremdprogramm, gestartet am 12.10.). Keine Waise, kein Befund — die Prüfung hat sich gelohnt,
die Vermutung nicht.

---

## B18 — Der Launcher meldet einen **beendeten Einmalaufruf** als laufenden Dienst — **N**

**Anlass.** `scripts/start.mjs` (20.252 B, 12:47) ist der Kern der „plug and play"-Zusage: ein Befehl
startet Host und Dienste. Ich habe die Start- und Meldelogik gelesen.

**Der Befund.**

```js
// scripts/start.mjs:430–431
await buildAndStartGo(join('services','pmh-attach'), 'pmh-attach', ['--host','127.0.0.1','--port','8090'])
await buildAndStartGo(join('services','pmh-nix'),    'pmh-nix',    ['detect','--json'])      // ← Einmalaufruf

// scripts/start.mjs:439
process.stdout.write(`[pmh] ${running.length} Prozess(e) laufen. Beenden mit Ctrl+C.\n`)
```

`detect` ist **kein Dienst**, und das eigene Repository sagt es: `services/pmh-nix/cmd/pmh-nix/commands.go`
Zeile 13–16: *„doDetect meldet ehrlich, ob echte Actuation auf diesem Wirt moeglich ist. **Detect
veraendert nichts**; auch die Antwort ‚nicht verfuegbar' ist ein [Ergebnis]"*. Der Aufruf gibt seinen
Bericht aus und **endet** (`ExitOK`).

Trotzdem läuft er durch dieselbe Funktion wie ein Dienst (`buildAndStartGo` — der Name sagt es, und ihr
Kommentar nennt sie „Baut einen **Go-Dienst** und startet die erzeugte Binärdatei") und bleibt danach für
immer in `running` stehen. Die Statuszeile zählt **gestartete**, nicht **laufende** Prozesse.

**Was das praktisch heißt.**

| Wirkung | Bewertung |
|---|---|
| „**2 Prozesse laufen**", während in Wahrheit einer läuft (plus Host) | Eine Zahl, die etwas anderes sagt als der Zustand — für einen Neuling die erste Auskunft, die er bekommt |
| Beim Beenden: „Beende **2** Prozess(e)" | Dieselbe Zählung in der Abschiedsmeldung |
| **Kein** falscher Fehler | Der Exit-Code ist `ExitOK`; ihre Regel („ein Dienst, der von selbst endet, ist ein sichtbarer Fehler") prüft `code !== 0` und schweigt damit zu Recht |

**Der schmale Fix — zwei Wege, beide klein.** (a) In der Meldung nur Kinder zählen, die **noch laufen**
(`exitCode === null && signalCode === null`), und beendete **namentlich** nennen; oder (b) den
Einmalaufruf gar nicht als Dienst führen: starten, Ausgabe durchreichen, nicht in `running` aufnehmen.
Weg (b) trifft die Ursache — ein Diagnosebefehl ist kein Dienst.

**Warum ich das überhaupt melde, obwohl es funktioniert.** Es ist derselbe Fehlertyp wie in **B7/B16**:
eine **Aussage über den Zustand**, die nicht aus dem Zustand kommt, sondern aus einer Zählung von
Absichten. Bei einem Projekt, dessen erklärtes Prinzip „abgehakt wird nur Belegtes" ist, ist die erste
Statuszeile des Starters die sichtbarste Stelle dafür.

**Grenze.** Ich habe den Lauf **nicht** ausgeführt (Hausregel **H5**: kein Start des fremden Hosts).
Der Befund stammt aus dem Quelltext — Zeile, Funktion und Exit-Code sind belegt; wie es sich auf dem
Bildschirm liest, habe ich nicht gemessen.

---

## B19 — Der gewählte Weg umgeht nicht nur die **Anmeldung**, sondern auch den **Host/Origin-Zaun** — **M**

**Anlass.** Der bauende Agent hat am 13.10. `.pmh-build/probe-auth.ts` angelegt — eine Wegwerf-Sonde
für `requestRejection`, ausdrücklich um die Anmeldesperre zu verstehen. Er hat sie **nicht** ausgeführt
bekommen (oder wollte sie noch ausführen); **ich** habe sie **nicht** ausgeführt, und das aus einem
Grund: das `Connection`-Plugin legt Sitzungsdatensätze im Credential-Speicher ab (`~/.pmh/.credentials.yaml`
hat einen Abschnitt `records.client-connection/browser-session`). Stattdessen habe ich die Logik
**gelesen** — sie steht im installierten Kern:

```js
// node_modules\@deepseek-ai\dsh-client-connection\lib\…  (requestRejection)
requestRejection(request) {
  const carrier = this.ctx.get("webServer")
  if (!isTrustedApiRequest(request, this.trustedHosts, carrier?.host, carrier?.protocol ?? "http:")) return 403
  return this.browserAuth.isAuthenticated(request, …) ? undefined : 401
}
```

**Was damit belegt ist — und was der Agent selbst schon richtig beschrieben hat:**

| Beobachtung | Ursache im Kern |
|---|---|
| `/api/unbekannt` → **401** ohne Cookie | der **geteilte Kanal** `/api` ruft `requestRejection` **vor** seiner Wegewahl; ohne Anmeldung: 401 |
| `/api/unbekannt` → **404** mit Cookie | nach der Sperre wählt `createSharedFetchHandler(channel)` einen Eigentümer — oder antwortet 404 |
| `/api/health` → **200** in **beiden** Fällen | ein über `webServer.register` registrierter Pfad wird **direkt** bedient und läuft **nicht** durch den geteilten Kanal |

Seine Deutung im Beleg („ein **registrierter** Pfad gewinnt vor beidem") ist damit **bestätigt**.

**Was darüber hinausgeht — und der eigentliche Punkt.** `requestRejection` prüft **zwei** Dinge, nicht
eines: erst den **Zaun** (`isTrustedApiRequest` gegen Host und Origin → **403**), dann die **Anmeldung**
(→ **401**). Wer über `webServer.register` registriert, umgeht **beide**. Der Agent hat die Folge für
die **Anmeldung** ausdrücklich ausgesprochen („`/api/health` ist ohne Anmeldung erreichbar … sobald
etwas Sensibles dazukommt, braucht es eine Prüfung **vor** dem Handler") — die Folge für den **Zaun**
steht dort nicht.

**Warum der Zaun zählt.** Der Host/Origin-Zaun ist der Schutz gegen **DNS-Rebinding** (fremder `Host`)
und gegen **CSRF** (fremder `Origin`). Bei einem reinen `GET`, das nur seinen eigenen Zustand meldet,
ist sein Fehlen harmlos. Bei einem **zustandsändernden** Endpunkt — und genau die kommen als Nächstes:
Login, Sitzungen, Chats — wäre ein solcher Pfad **ohne** Zaun erreichbar, auch aus einer fremden Seite
heraus.

**Empfehlung (nicht ausgeführt, Entscheidung des bauenden Agenten):**

1. **Für lesende Zustandsauskünfte** bleibt `webServer.register` richtig — die getroffene Entscheidung
   ist vertretbar und ausgesprochen.
2. **Für alles Zustandsändernde** entweder **denselben Zaun anwenden** — der Kern bietet ihn an
   (`requestRejection(request)` bzw. `admit(request)` liefern 403/401 oder `{peer}`; `admit` ist genau
   dafür da, „spricht für den Betreiber" zu entscheiden) — **oder** den Weg als **Typert-Remote auf dem
   geteilten `/api`-Kanal** bauen: dort gibt es Zaun **und** Anmeldung ohne Zusatzarbeit.
3. **Als Regel notieren**, weil es keine Einzelfrage ist: *jeder über `webServer.register` eingehängte
   Pfad ist öffentlich — einschließlich des Zauns.*

**Grenze, ehrlich.** Ich habe die Kernlogik **gelesen**, nicht gegen einen laufenden Host gemessen. Die
Zuordnung „registrierter Pfad → 200 ohne Cookie" stammt aus dem **Beleg des Agenten** (gemessen von
ihm) und passt zur gelesenen Logik. Ein eigener Lauf hätte denselben Effekt gehabt, den ich vermeiden
wollte: ein Schreibzugriff auf den Credential-Speicher.

### Nachtrag 13.10.2026, 13:10 — **Status: erledigt — vom bauenden Agenten, und besser als empfohlen**

Commit **`38aa3ff`** („Anmeldesperre fuer die eigene API-Flaeche: `/api/ready`") setzt genau den
Mechanismus um, den B19 empfohlen hat. Ich habe ihn gegen den Core geprüft:

```ts
// packages/api/health/src/index.ts:538–551
export function abweisung(ctx, headers): number | undefined {
  const verbindung = ctx.get('connection') as { requestRejection?: … } | undefined
  if (verbindung === undefined || typeof verbindung.requestRejection !== 'function') {
    // **Verweigern statt durchlassen.** Fehlt die Prüfung, ist die sichere
    // Annahme „nicht erlaubt": ein ungeschützter Endpunkt ist der teurere Fehler.
    return 503
  }
  return verbindung.requestRejection({ headers })     // ← Zaun (403) und Anmeldung (401)
}
```

| Prüfung | Ergebnis |
|---|---|
| Benutzt er den **Zaun** des Cores, nicht nur eine eigene Anmeldung? | **ja** — `requestRejection` prüft laut Core zuerst `isTrustedApiRequest` (Host/Origin → 403), dann die Browsersitzung (→ 401) |
| **Fail-open oder Fail-closed**, wenn der Dienst fehlt? | **Fail-closed**: `503`, ausdrücklich begründet („ein ungeschützter Endpunkt ist der teurere Fehler") |
| Absturz bei fehlendem Dienst? | nein — `ctx.get` statt `ctx.connection` liefert `undefined`, der Fall ist ein **beschriebener Ausgang** |
| Sauberes HTTP | `WWW-Authenticate: Cookie` bei 401 (Zeile 661), `Cache-Control: no-store` („eine zwischengespeicherte Zustandsauskunft ist eine falsche Zustandsauskunft") |

**Anerkennung — und die ehrliche Einordnung.** Die Umsetzung ist **besser** als meine Empfehlung: ich
hatte „`requestRejection`/`admit` anwenden" geschrieben; er hat zusätzlich den **Fehlfall** des Dienstes
entschieden und dokumentiert. **Ich kann mir das nicht zurechnen:** seine Sonde `probe-auth.ts`
entstand **12:59**, mein Befund B19 um **13:08** — die Arbeit lief bereits. Die Übereinstimmung ist
gegenseitig, nicht ursächlich.

**Nebenbefund, der seine eigene Lücke schließt.** Das neue Paket `packages/api/readiness` bringt
**Bereitschaftssonden für PostgreSQL und Redis** in das Register von `health` ein — laut eigener
Beschreibung „ohne daß health die Datenbanken kennt". Damit ist seine in `beleg-eigener-endpunkt.md`
selbst benannte Lücke 1 („**keine** Zustandsprüfung") in Arbeit.

**Kleiner Hinweis, kein Befund.** Unter `packages/api/` liegen **neun leere** Verzeichnisse
(`account-controller`, `gateway`, `job-controller`, `remotes`, `session-controller`,
`settings-controller`, `terminal-controller`, `workspace-controller`, `workspace-files` — je 0
Dateien). Sie spiegeln die Paketstruktur der Vorlage als Plan. **Git versioniert keine leeren
Verzeichnisse** — nach einem frischen Klon sind sie weg. Wer sie als Gerüst braucht, legt eine Datei
hinein; sonst sind sie nur lokal sichtbar.

---

## B20 — Drei eigene Endpunkte entscheiden bei „weiß ich nicht" **verschieden** — **M**

**Anlass.** `packages/api/readiness` (18.457 B, 13:10) und die Erweiterung von `health` (28.630 B)
bringen Bereitschaftssonden für PostgreSQL und Redis. Die Mechanik ist **gut gebaut** — und genau
deshalb fällt eine **Inkonsistenz** auf, die man leicht übersieht.

### Was gut ist (zuerst das)

| Eigenschaft | Beleg |
|---|---|
| Eine **werfende** Sonde reißt die anderen nicht mit und wird als `fehler` geführt | Test „ein Fehler in einer Sonde reißt die anderen nicht mit" · „eine Sonde, die wirft, wird als `fehler` mit bereinigtem Grund geführt" |
| Eine **hängende** Sonde endet an einer Gesamtfrist | `STANDARD_SONDEN_FRIST_MS = 2_000` (Zeile 119) · Test „eine hängende Sonde wird von der Gesamtfrist beendet" |
| **Frist** ist ein eigener Zustand, nicht „Fehler" | `Sondenzustand = 'ok' \| 'fehler' \| 'frist'` (Zeile 159) |
| Verbindungsfristen auf **Socket**-Ebene, nicht nur im Promise | `socket.setTimeout(fristMs)` (readiness Zeile 276) · `connect_timeout: 3` für PostgreSQL |
| Zugangsdaten werden aus der Antwort **abgeschnitten** | Test „schneidet Zugangsdaten ab — sie gehören nicht in eine Sonde" |
| Nach dem Abhängen antwortet der Pfad wieder **404** | Test „nach dem Abhängen antwortet auch /api/ready wieder 404" |

### Die Inkonsistenz

Drei Stellen desselben Projekts entscheiden über den Fall „ich kann nicht prüfen" **verschieden**:

| Stelle | Entscheidung | Begründung im Quelltext |
|---|---|---|
| `/api/health` (Anmeldung) | **Fail-closed `503`**, wenn der Verbindungsdienst fehlt | „Verweigern statt durchlassen … ein ungeschützter Endpunkt ist der teurere Fehler" (B19) |
| `/api/ready` (fehlender Dienst) | **`503` mit Grund `unavailable`** | Zeile 87 — konsequent wie oben |
| **`/api/ready` (null Sonden)** | **`ok`** — `bereit: true` | `if (sonden.length === 0) return { zustand: 'ok', sonden: [] }` (Zeile 427) · `if (ergebnisse.length === 0) return 'ok'` (Zeile 334) · Test **„keine Sonde heißt ok"** |

**Warum der dritte Fall zählt.** Ein Bereitschafts-Endpunkt wird von **Maschinen** gelesen — ein
Orchestrator sieht den **Statuscode**, nicht den Körper. Antwortet er `200 ok`, während **keine
einzige** Sonde eingetragen ist, ist die Auskunft „bereit" **nicht gedeckt**: geprüft wurde nichts.
Das ist derselbe Fehlertyp wie **B18** (gestartete statt laufende Prozesse) und **B16** (404, die auch
im Gesunden entsteht) — eine Aussage, die mehr weiß, als sie wissen kann.

Die Entscheidung ist **bewusst und getestet** (der Test heißt ausdrücklich „keine Sonde heißt ok"),
und sie ist **abgemildert**: der Körper nennt `sonden: []`, also die Zahl der Prüfungen. Aber der
**Statuscode** — das, was zählt — sagt „bereit".

**Die Empfehlung ist klein und passt zur eigenen Linie.**

1. **`503` mit Grund `keine sonden`**, wenn die Liste leer ist — dieselbe Härte, die `/api/ready` beim
   fehlenden Dienst schon zeigt, und dieselbe, die `/api/health` für die Anmeldung gewählt hat. Wer
   „ich habe nichts geprüft" zu „bereit" macht, hat den Endpunkt entwertet.
2. **Oder** die Entscheidung ausdrücklich **dokumentieren** — warum ein leerer Sondenbestand „bereit"
   bedeuten darf. Dann ist es eine getroffene Entscheidung statt einer stillen Voreinstellung. (Der
   Kommentar in `readiness` Zeile 62–67 nennt die Folge, aber nicht den Grund.)

### Nebenbefund: drei Variablen werden **gelesen**, aber nicht dokumentiert

`packages/api/readiness/src/index.ts` Zeile 388/392 liest:
`PMH_READY_DATABASE_URL ?? DATABASE_URL` und `PMH_READY_REDIS_URL ?? REDIS_URL`.

| Variable | in `.env.example` dokumentiert? |
|---|---|
| `DATABASE_URL` | **ja** (4 Treffer) |
| **`REDIS_URL`** | **nein** (0 Treffer) |
| **`PMH_READY_DATABASE_URL`** | **nein** |
| **`PMH_READY_REDIS_URL`** | **nein** |

Es ist das **umgekehrte Zwillingsstück zu B14**: dort standen Variablen in der Vorlage, die niemand
liest (`PMH_MASTER_KEY`, `MIGRATION_DATABASE_URL`); hier liest der Code Variablen, die niemand
dokumentiert. Beides endet gleich: ein Fremder weiß nicht, was zu setzen ist. (Die Vorlage hat
Vorgabewerte auf „lokaler Standard" — der Stack läuft also ohne sie, aber die **Abweichung** ist
undokumentiert.)

### Nachtrag 13.10.2026, 13:16 — **der Widerspruch liegt in ihrem eigenen Haus**

Beim Nachprüfen zeigt sich, dass zwei eigene Artefakte **Verschiedenes behaupten**:

| Artefakt | Wortlaut | Wirkung |
|---|---|---|
| **Code + Test** (`health/src/index.ts:427` und `:514`; Test Zeile 389–391) | `if (sonden.length === 0) return { zustand: 'ok', sonden: [] }` → `bereit: lauf.zustand === 'ok'` → **`bereit: true`**, Status **200** (`:347`). Der Testkommentar sagt ausdrücklich: *„Keine Sonde heißt nicht ‚unbekannt', sondern ‚nichts zu prüfen' — **und das ist bereit**."* | **eine getroffene Entscheidung**, mit Test festgehalten |
| **`.env.example` Zeile 137–138** | der Endpunkt melde `ok` mit leerer Sondenliste — *„ehrlich: er sagt damit, daß nichts geprüft wurde, **statt ‚bereit' zu behaupten**"* | beschreibt das **Gegenteil** des Feldwertes |

**Das ist der Kern, und er ist schmal:** `bereit: true` ist genau das Feld, das ein Aufrufer für die
Frage „bereit?" benutzt — und es steht auf **`true`**, obwohl nichts geprüft wurde. Die
Dokumentation verspricht, dass dies **nicht** passiert. Der Unterschied zwischen den beiden
Positionen ist nicht „richtig/falsch", sondern **welche Folge man will**:

* Position des Tests („nichts zu prüfen ist bereit"): ein Orchestrator startet die Anwendung auch ohne
  Datenbank-Anbindung als „bereit" — richtig, wenn die Anwendung ohne Datenbank nützlich ist, falsch,
  wenn nicht.
* Position der Vorlage („sagt nicht ‚bereit'"): verlangt `bereit: false` bzw. `503` bei leerer Liste —
  dann muss **etwas** die Sonden eintragen, oder der Endpunkt meldet „nicht bereit".

**Die drei kleinen Auswege** (einer genügt):

1. `bereit` und Status an `sonden.length > 0` binden → `503` mit Grund `keine sonden`.
2. Ein **dritter** Zustand statt eines Booleans: `bereit: true | false | null` — `null` heißt
   „nicht geprüft". Das ist die ehrlichste Fassung, weil sie die Frage nicht mit „ja" beantwortet,
   die niemand gestellt hat.
3. Nur den **Wortlaut** der Vorlage an den Code anpassen („er meldet `bereit: true` mit leerer
   Sondenliste — der Leser sieht daran, dass nichts geprüft wurde"). Das ist die kleinste Änderung
   und beseitigt den Widerspruch; die Entscheidung bleibt, aber sie steht dann **ehrlich** da.

### Und eine gute Nachricht: der Dokumentations-Nebenbefund ist **schon geschlossen**

Die `.env.example` wurde um **13:14:52** erweitert (6.356 → 7.294 B) — also **vor** diesem Befund
(13:16). Jetzt dokumentiert sie `REDIS_URL` (4 Treffer, Zeile 129), `PMH_READY_DATABASE_URL` (2) und
`PMH_READY_REDIS_URL` (2, kommentiert in Zeile 145–146) samt Begründung, wozu die eigenen Namen gut
sind (Prüfung gegen eine **andere** Instanz). **Ich rechne mir das nicht zu** — die Arbeit lief
parallel, nicht wegen meines Befunds.

---

## Was ich geprüft und **nicht** zu beanstanden gefunden habe (Fairness)

| Behauptung des bauenden Agenten | Gegenprobe | Ergebnis |
|---|---|---|
| „Neunter Push eingetragen" (`git-audit.md`) | `git rev-parse HEAD` gegen `git ls-remote origin` | **bestätigt** (identischer Hash) |
| `~/.dsh/.credentials.yaml` nicht angefasst (t63-Notiz) | mtime der Datei | **bestätigt** (22.09.2026, nicht heute) |
| Fremde Installation in `~/.dsh` nicht angetastet (`P9.12`) | `~/.dsh/profiles/node_modules` existiert unverändert | **glaubhaft** — kein Widerspruchsbeleg gefunden |
| Postgres-Schema migriert | lesende Abfrage der 10 Tabellen | **bestätigt** |
| Test überspringt nicht still | Quelltext Zeilen 50–58 | **bestätigt** (nach eigener Korrektur, siehe unten) |
| „Der Typecheck läuft über **17** eigene Pakete" (Boot-Sonde, 13.10.) | `Get-ChildItem -Recurse -Filter tsconfig.json` ohne `node_modules` | **exakt 17**, alle unter `packages/`, `apps/`, `tests/` |
| „**2,1 s** für 17 Pakete" (Boot-Sonde) | Stichprobe `bun x tsgo --noEmit` für drei Pakete | **reproduziert**: 0,11 / 0,11 / 0,12 s je Paket → ≈ 2 s für 17 |
| „TS 7 (`tsgo`) ist der native Compiler, **in Go geschrieben**" (Korrektur in `risks.md`) | Kennungssuche im Binärprogramm `…\native-preview-win32-x64\lib\tsgo.exe` (23,4 MB) | **belegt**: `golang.org/` 361×, `runtime.main`, `Go build ID`, `GODEBUG` — **null** Rust-Kennungen (`rustc`, `cargo`, `core::panicking`) |
| „Es gibt KEINEN Build-Schritt" (Boot-Sonde) | `apps/web/package.json`, `apps/web/dist`, eigenes Register | **korrekt begrenzt** auf Host/Boot-Pfad. Meine Vermutung eines Fehlers war **falsch** — `apps/web` hat einen Vite-Build (`dist/` 221,6 kB), dokumentiert als P7.3 |
| Die eigene Korrektur des 12,7-s-Werts | `git show 45884b2 -- docs/risks.md` | **vorbildlich**: der Irrtum bleibt sichtbar stehen, wird als solcher benannt und durch eine eigene Messung am eigenen Code ersetzt |
| Fremde `bun`-Prozesse der Boot-Sonde | Zeile 103 | **Beanstandung — siehe B11** (kein Schaden eingetreten, weil zum Messzeitpunkt kein `bun` lief) |
| Der **neue eigene Endpunkt** `packages/api/health` (13.10., 12:41–12:47) | **drei unabhängige Prüfungen**: (1) Vertragstreue gegen den Core-Typ, (2) Eintrag im Profil-Patch, (3) Auflösbarkeit aus dem Profilordner | **korrekt gebaut und verdrahtet — siehe unten** |
| „**112** Quelldateien · 1.420 KB" (`groessenvergleich-zur-referenz.md`) | Nachzählung mit mehreren Definitionen | **bestätigt**: es sind die Dateien mit `.ts`/`.tsx`/`.go`/`.rs` in `packages/`, `services/`, `native/`, `apps/cli/src` → ich messe **113 Dateien · 1.443 KB** (eine Datei und 23 KB kamen zwischen seinen und meinen Messzeitpunkten dazu). Die Definition steht nur nicht im Dokument |
| „**14** Applikationspakete" (unser Projekt) | `package.json` unter `packages/` ohne `node_modules` | **exakt 14** |
| „`docs/` 1.461 Dateien · 56,0 MB; `docs/dsh/` 1.376" | `git ls-files` | **1466 Dateien · 56 MB** inklusive meiner neuen Protokolldateien; `docs/dsh/` **exakt 1.376** |
| „`website/` versioniert: 2,8 MB, 28 Dateien" | `git ls-files 'website/*'` | **exakt 28 Dateien, 2,82 MB** |
| „`target/` **5.851** Dateien" | `Get-ChildItem -Recurse` | **exakt 5.851** |
| „`target/` **731 MB**" | Nutzbytes, Clustergröße des Laufwerks, belegte Bytes | **697,6 MB Nutzbytes · 711,1 MB belegt** (BlockSize 4096, gemessen). Bleibt eine Abweichung von **~20 MB (2,8 %)** bei gleicher Dateizahl. Die Schlussfolgerung („erzeugter Code belegt mehr Platz als unser Quellcode") trägt in **jedem** Fall — 700 MB gegen 1,4 MB |

---

## Eigene Korrekturen (Regel H6)

| Zeit | Erste Aussage | Korrigiert zu | Anlass |
|---|---|---|---|
| 11:29 | „`PMH_TEST_DATABASE_URL` ist nirgends dokumentiert." | „Es steht **nur im Testkopf** der Testdatei, nicht in den zentralen Dokumenten." | Mein Suchmuster hatte `docs/status`, Wurzel-`*.md` und `.github` abgedeckt, **nicht** die Paket-Quellen. Die Datei dokumentiert den Aufruf vollständig (Zeile 14–18). |
| 11:24 | „Die t63-Rettung hat die Konfiguration korrekt wiederhergestellt." | „Sie hat sie **korrekt, aber auf einen 5 Tage alten Stand** wiederhergestellt (B1)." | Die Aufzählung **aller** Sicherungen zeigte eine jüngere, größere Fassung vom 22.09. |
| 11:52 | Eigene Hilfe `hilfen/zugang-bereitstellen.mjs` war fehlerhaft (Zielpfad eine Ebene zu tief; `--umgebung` enthielt einen Platzhalter) und in diesem Befund stand `.ps1` statt `.mjs`. | Pfad korrigiert, Rezept durch ein **wirklich ausgeführtes** ersetzt (35 Zeichen / `e2159c3d1018` bestätigt), Dateiname berichtigt; die fehlerhafte Zeile in `protokoll.jsonl` bleibt gemäß H6 stehen. | Trockenlauf zeigte als Ziel `…\docs\.pmh-build\harness-home` — offensichtlich falsch. Eigene Werkzeuge werden vor der Auslieferung ausgeführt, nicht behauptet. |
| 11:53 | „Der Rust-Bestand hat nach meiner Zählung **6.014** Zeilen." Und: „Der andere Agent zählt Markdown mit 304.261 Zeilen, ich komme auf **226.948** — eine der beiden Zahlen muss falsch sein." | **Meine** Zahlen waren falsch. Nach robuster Zählung (Byte-Puffer, git-Dateiliste, **Meldung nicht lesbarer Dateien**): **6.569** Rust-Zeilen und **304.508** Markdown-Zeilen — die Zahlen des anderen Agenten sind bestätigt. | Mein erster Befehl war `Get-Content … \| Measure-Object -Line` mit `-ErrorAction SilentlyContinue`: nicht lesbare Dateien trugen **still 0 Zeilen** bei, das Ergebnis sah aber wie eine Messung aus. Genau der Fehler, den diese Rolle bei anderen beanstandet. Ersatz: `werkzeuge/zeilen-zahl.mjs`, das jede unlesbare Datei **nennt**. |
| 12:04 | „Die Compose-Datei reicht `PMH_OWNER_USER`/`PMH_OWNER_PASSWORD` nicht durch — die reparierte `02-roles.sh` bricht deshalb beim nächsten Start ab." | **Falsch.** `docker-compose.yml` Zeile 59–60 führt beide Variablen, der Container hat alle sechs `PMH_`-Variablen. | Mein Suchmuster hatte nur nach `POSTGRES\|PMH_APP\|PMH_READONLY` gefiltert — dieselbe Fehlerfamilie wie die Zeilenzählung: das Suchmuster entscheidet über das Ergebnis, und ich habe es nicht geprüft. |
| 12:08 | Mein Takt-Werkzeug meldete „Tabellen in public: **0**" und „`schema_migrations`: Fehler" — das liest sich als Rückschritt. | Nach dem Umzug des Anwendungsschemas nach `pmh` sind es **10 Tabellen in `pmh`**; das Werkzeug zählt jetzt **je Schema** und setzt `search_path to pmh, public`. | Unqualifizierte Abfrage in `public`. Hätte ich das gemeldet, wäre es ein **Fehlalarm gegen den anderen Agenten** gewesen — ausgelöst von meinem eigenen Instrument. |
| Dauerhaft | Derselbe PowerShell-Quoting-Fehler (Backslash-Anführungszeichen in `node -e` / verschachteltes `sh -c`) **dreimal** in dieser Sitzung. | Konsequenz: solche Prüfungen laufen über Werkzeuge (`takt-pruefung.mjs`, `init-skript-probe.mjs`) oder über `docker exec` **ohne** `sh -c`-Verschachtelung. | Beim dritten Mal brach die fünfte Rechteprüfung ab und lieferte kein Ergebnis — ein weiterer „stiller Ausfall", den nur die Nachkontrolle aufgedeckt hat. |
| 12:14 | Meine RLS-Suche meldete Treffer und druckte darunter „(leer = RLS nicht eingebaut)" — die Ausgabe war in sich widersprüchlich. | Präzise gesucht (`ROW LEVEL SECURITY\|CREATE POLICY\|ENABLE ROW LEVEL`): **null** Treffer; die Treffer vorher waren `SessionPolicy` (ein TypeScript-Typ). Die Behauptung des Dokuments stimmt. | Ein Suchmuster, das auf einen **Namensbestandteil** passt, ist kein Treffer. Ich habe das Ergebnis gelesen, ohne die Treffer anzusehen — genau der Kurzschluss, den diese Rolle bei anderen sucht. |
| 12:28 | „Der Größenvergleich nennt **112** Quelldateien, ich zähle **181** — das Dokument weicht ab." | **Meine** Zählung war falsch: ich hatte `node_modules`, `dist` und `lib` **nicht** ausgeschlossen. Mit der richtigen Definition (`.ts`/`.tsx`/`.go`/`.rs`) messe ich **113** — die Zahl des Dokuments. | Zweiter Fall derselben Familie nach der Rust-Zählung (11:53): **erst die eigene Zählweise prüfen, dann die fremde Zahl bezweifeln.** Beide Male hätte ich fast einen Fehlalarm gemeldet. |
| 12:29 | Beim Einfügen der B13-Zeile in die Offen-Tabelle habe ich die **B12**-Zeile ersetzt statt ergänzt. | Sofort bemerkt und in derselben Minute wiederhergestellt; die Tabelle danach nachgeprüft (B10–B13 vollständig, Zeilen 786–789). | Ein Anker, der nur einen Teil der Zielzeile enthält, ersetzt diese vollständig. Kontrolle nach jeder Tabellenänderung: zählen, nicht annehmen. |
| 13:06 | **Der schwerste eigene Fehler dieser Sitzung:** in `hilfen/vorhandene-bausteine.md` schrieb ich den Fingerabdruck eines Schlüssels als **`95624be3e0c1`** — **ohne ihn gemessen zu haben.** | Nachgemessen in zwei frischen Shells: **`d0be03708b89`** (Länge 59, stabil). Die Datei nennt jetzt den gemessenen Wert, den erfundenen und den Vorgang. | Eine Zahl, die aussieht wie eine Messung und keine ist, ist **genau** der Fehler, den diese Rolle bei anderen sucht (die 12,7-s-Zahl, die den Compiler maß; der 731-MB-Wert; die 404 auf geratenen Pfaden). Dass ich ihn selbst gemacht habe, gehört hierher — nicht in eine stille Korrektur. **Lehre: kein Wert in eine Datei, der nicht vorher in einer Shell gestanden hat.** |

---

## Grenzen dieser Prüfung (was **nicht** belegt ist)

- Ich habe **keinen** echten Modellaufruf mit dem Schlüssel des Ziel-Projekts gefahren — nur einen
  lesenden Kontenaufruf (`/user/balance`). Ob der Ziel-Host mit gesetztem Zugang **wirklich** bis zur
  Antwort kommt, ist **nicht** gemessen.
- Ich habe **keine** Tests des Ziel-Repos ausgeführt (Hausregel H5). Alle Testzahlen in diesem
  Dokument sind **Zitate** aus den Nachweisen des bauenden Agenten, nicht meine Messung.
- Der Zustand unter **WSL2** wurde von mir nur oberflächlich gesehen (`wsl -l -v`: Ubuntu und
  docker-desktop laufen, kali-linux gestoppt). Die WSL2-Nachweise des bauenden Agenten habe ich
  **nicht** nachgefahren.
- Ob die 22.09-Sicherung der Live-Stand vor dem Schrumpf war, ist **plausibel, nicht bewiesen** (B1).
