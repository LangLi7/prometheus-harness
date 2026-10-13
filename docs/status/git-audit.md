# Git-Audit — jeder Push mit Nachweis

> **Regel:** Nach **jedem** Push wird hier eine Zeile eingetragen. Der Nachweis ist die
> Übereinstimmung von lokalem `HEAD` und `origin/main`, ausgelesen über die GitHub-API.
> Ein Push ohne Eintrag gilt als **nicht erfolgt**.

**Remote:** `https://github.com/LangLi7/prometheus-harness.git` · **Sichtbarkeit: privat**
· **Default-Branch:** `main`

---

## Warum privat (Entscheidung mit Begründung)

Der Betreiber wollte Push zu **LangLi7**. Die Sichtbarkeit war offen; die pessimistische
Wahl ist **privat**, und zwar aus einem konkreten Grund:

Dieses Repository behandelt demnächst **Zugangsdaten, Sandbox-Policies und
Sicherheitsprüfungen** — genau die Inhalte, bei denen eine versehentliche Veröffentlichung
teuer ist. Eine `.gitignore` schützt gegen bekannte Muster, nicht gegen Unachtsamkeit. Ein
öffentliches Repository lässt sich nicht zurücknehmen: Forks und Caches überleben ein
„Sichtbarkeit ändern". Privat ist die Richtung, die sich korrigieren lässt.

**Umstellen auf öffentlich ist ein Befehl** (`gh repo edit --visibility public`).
Der umgekehrte Weg ist es nicht.

---

### 2026-10-12 · 23:32 UTC · Backlog: erinnerte Technikliste (Abschnitt R)

| Prüfung | Ergebnis |
|---|---|
| Auslöser | Betreiber legte die Technik-/Anforderungsliste erneut vor; Auftrag: als Backlog aufnehmen, **nichts** implementieren |
| `HEAD` / `origin/main` | `9dcfe0dc` — **identisch**, zusätzlich **über die API** bestätigt (`2026-10-12T23:32:09Z`) |
| Umfang | `docs/status/arbeitspakete.md` (neuer Abschnitt R), 2.676 versionierte Dateien |
| Art | **reine Dokumentation** — keine Code-, Build- oder Web-Änderung, keine Installation |

**Was aufgenommen wurde:** 25 Punkte der Technikliste mit Statusklasse **A** (belegt) /
**B** (geplant) / **C** (neu) / **D** (Konflikt), je mit Phase und Beleg. Dazu **sechs
ausdrücklich benannte Konflikte** — LangChain/LangGraph (Python-verankert, Regel verbietet
Python), n8n (kein Kern-Orchestrator), Tesseract (nur über die Prozessgrenze), GUI/UI/Web
(bleibt außen vor), Mirage-Tesseract (ungeprüft), NixOS-Installation (bleibt ausgeschlossen).

**Warum das als eigener Push geführt wird:** eine Anforderungsliste, die nur im Chat steht,
ist nach dem nächsten Kontextwechsel weg — und dann wird sie entweder doppelt gebaut oder
stillschweigend als „erledigt" angenommen. Beides ist teurer als diese 60 Zeilen Doku.

### 2026-10-13 · 00:34 UTC · Auflage A1: kopierte Apps entfernt, Host erweitert

| Prüfung | Ergebnis |
|---|---|
| Auslöser | Auflage **A1** aus `docs/review/backend-review.md`: die 1.043 byte-identischen Dateien in `apps/` entfernen oder bewusst dokumentieren |
| `HEAD` / `origin/main` | `f0ac6f70` — **identisch**, zusätzlich **über die API** bestätigt (`2026-10-13T00:34:45Z`) |
| Umfang | **1.636** versionierte Dateien (vorher 2.676) — die Differenz sind die entfernten Kopien |
| Art | **Codeänderung** (Host-Flags) + **Löschung** (1.043 Dateien) + Doku |

**Entfernt:** `apps/cli` (220) · `apps/desktop` (773) · `apps/desktop-host` (50) — zusammen
**1.043 Dateien**, alle byte-identisch mit der Vorlage, mit **158 unauflösbaren
`workspace:*`-Verweisen**. Sie hatten jedes `bun install` blockiert und damit jeden Typecheck.

**Hinzugekommen:** `apps/host` besitzt eine eigene Kommandofläche — das Unterkommando setzt
das Profil (`pmh web`), `--profile`/`-p` überschreibt es, `--port` wird an das Web-Bündel
durchgereicht, `--patches` lädt Overlays **hinter** die Profil-Schichten.

**Regressionsnachweis (WSL2, Linux 6.6.87.2):**

```
bun install         → exit 0 · 522 installs across 610 packages
bun run typecheck   → exit 0 · 6/6 Pakete
Host-Start 3×       → 6 s · 6 s · 6 s   (erster, kalter Lauf: 35 s)
GET /?token=…       → 303 · GET / mit Cookie → HTTP 200 · 32.184 B
```

**`apps/` vorher → nachher:** 5 Ordner / 1.064 Dateien → **2 Ordner**: `host` (4) · `web` (17).

**Außerdem angelegt:** `LICENSE` (MIT, *Copyright (c) 2026 DeepSeek*). Mit der Nutzung als
**Codebasis** verlangt die Lizenz, den Copyright-Hinweis in allen Kopien zu führen — er fehlte
bis hierher vollständig.

## Einträge

### 2026-10-12 · 21:27 UTC · Ausgangsstand

| Prüfung | Ergebnis |
|---|---|
| Auslöser | Betreiber: „alle 4h in github rein, LangLi7" — erster Durchlauf, dazu die Reparatur des defekten `.git` |
| Branch | `main` |
| Lokaler `HEAD` | `39eeaa596d97960bd6a7c9eb954b9055292f159c` (`39eeaa5`) |
| `origin/main` (lokal gelesen) | `39eeaa596d97960bd6a7c9eb954b9055292f159c` — **identisch** |
| `origin/main` (über API gelesen) | `39eeaa59`, Datum `2026-10-12T21:27:06Z` |
| Versionierte Dateien | **2.660** |
| Arbeitsbaum gesamt | 47.002 Dateien / 1.271,2 MB |
| Push-Befehl | `git push -u origin main` → exit **0**, `* [new branch] main -> main` |

**Vorher festgestellter Zustand — und warum ein neues Repository nötig war:**

| Prüfung | Ergebnis |
|---|---|
| `.git` vorhanden | ja, aber **0 Dateien** — rekursiv gezählt |
| `HEAD`, `config`, `index`, `packed-refs` | **alle fehlend** |
| `refs/` | leer — **keine** Branches |
| Objekte (loose + packs) | **0** |
| `git rev-parse --is-inside-work-tree` | `fatal: not a git repository` |

**Urteil:** Die Historie war **nicht reparierbar** — es gab nichts zu reparieren, nicht einmal
einen Verweis auf einen Commit. Der Zustand erklärt außerdem den bekannten Nebenbefund, dass
`go build` ohne `-buildvcs=false` mit „error obtaining VCS status" scheitert: Go fragt ein
Repository, das nicht antworten konnte. **Dieser Nebenbefund ist damit erledigt** — `go build`
ohne Flag ist jetzt zu prüfen (offener Punkt, siehe unten).

**Ausgeschlossen vom Commit** (`.gitignore`, mit Begründung in der Datei):

| Ausgeschlossen | Warum |
|---|---|
| `node_modules/` (28.751 Dateien, 518,1 MB) | aus `bun.lock` reproduzierbar |
| `target/` (3.074 Dateien, 388,1 MB) | Rust-Buildartefakte |
| `website/`-Cache (4.617 Dateien, ~98 MB) | `.bun-cache`, erzeugt |
| `.bun-tmp/` | Laufzeitmüll |
| `.github/` (56 Dateien) | **Kopie** des Referenz-Forks — widerspricht `docs/concept.md`; enthält zudem Python und 60 Workflows des Forks |

**Offene Punkte aus diesem Audit** — bewusst als offen geführt:

1. **`go build` ohne `-buildvcs=false` ist erneut zu prüfen.** Die Ursache (defektes `.git`)
   ist behoben; ob das Flag nun entbehrlich ist, wurde **nicht** gemessen.
2. **Der 4-Stunden-Takt ist kein Dienst.** Er läuft nur, solange eine Sitzung läuft. Für
   Verlässlichkeit braucht es einen echten Scheduler — offener Punkt, siehe
   [`README.md`](README.md).
3. **`docs/dsh/` (1.412 Dateien) und `docs/design/` sind mitgepusht.** Sie sind Projektbestand
   und stehen unter der Regel „nie öffnen", nicht „nicht versionieren". Ob sie ins
   Repository gehören, ist eine eigene Entscheidung des Betreibers — **nicht** eigenmächtig
   getroffen.
4. **Keine Review-/Security-Prüfung in diesem Durchlauf.** Es gab keine Codeänderung seit dem
   letzten Stand außer der Reparatur selbst; `code-review` und die Security-Skills laufen im
   nächsten Takt über die dann aktuellen Änderungen.

### 2026-10-12 · 21:29 UTC · Dokumentation (zweiter Push)

| Prüfung | Ergebnis |
|---|---|
| Auslöser | Status-Ordner, Risiko 6, Index-Register |
| `HEAD` / `origin/main` | `50cfdb140eabe208d0181c50ef64b289ad477c18` (`50cfdb1`) — **identisch** |
| API-Bestätigung | `50cfdb14`, `2026-10-12T21:29:54Z` |
| Umfang | Status-Ordner (3 Dateien), `docs/risks.md` §6, `docs/INDEX.md` §7 |

**Neu aufgenommen:** `docs/risks.md` §6 — **Bun kann `PluginPackages` nicht laden.**
Der Befund war bis dahin nur im Chat und im Host-README; ein Risiko, das nirgends in der
Risikoliste steht, wird beim nächsten Kontextwechsel vergessen.

### 2026-10-12 · 21:31 UTC · Takt-Skript und Arbeitspaket-Register (dritter Push)

| Prüfung | Ergebnis |
|---|---|
| Auslöser | Weisung: Todo-Listen je Arbeitspaket; Takt in einem Befehl |
| `HEAD` / `origin/main` | `6ee57bef` — **identisch**, zusätzlich **über die API** bestätigt (`2026-10-12T21:31:38Z`) |
| Umfang | `scripts/takt.ps1`, `docs/status/arbeitspakete.md`, `docs/INDEX.md`, `docs/design/nixos-self-change.md` |
| Versionierte Dateien | **2.666** |
| Befehl | `pwsh -ExecutionPolicy Bypass -File scripts/takt.ps1 -Message "…" -IncludeSelf` → Commit **und** Push **und** Audit in einem Lauf, exit 0 |

**Erstmals belegt:** der Takt läuft als **ein** Befehl durch und prüft sich selbst
(lokal gegen `origin`, danach gegen die API). Das Skript nimmt bewusst **nur** Doku und
ausdrücklich genannte Pfade mit — die neun veränderten Dateien der laufenden Arbeitspakete
blieben unangetastet und wurden im Lauf namentlich als „nicht im Commit" ausgegeben.

#### Befund: der Credential-Helper ist falsch konfiguriert (niedrig, aber dauerhaft)

Bei **jedem** Push erscheint:

```
git: 'credential-gh' is not a git command. See 'git --help'.
```

**Was das ist:** `git config --global credential.helper` steht auf `gh` — der `gh`-CLI-Helper
heißt aber `gh auth git-credential`, nicht `credential-gh`. Git bildet den Wert zu
`git credential-gh` um und findet nichts.

**Warum es trotzdem funktioniert:** Der Push ging **dreimal** durch (exit 0). Git hat also
einen anderen Weg zur Anmeldung gefunden — vermutlich über den im Credential-Store
hinterlegten Eintrag. **Das ist eine Vermutung, keine Messung**, und genau deshalb als
offener Punkt geführt: ein Push, der „zufällig" klappt, ist kein verlässlicher Push.

**Schwere: niedrig.** Kein Datenverlust, keine Offenlegung. Aber es ist Lärm bei jedem Takt,
und Lärm verdeckt echte Fehler. Behebung ist eine Zeile
(`git config --global credential.helper "!gh auth git-credential"`) — **noch nicht
ausgeführt**, weil eine Änderung an der globalen Git-Konfiguration eine Änderung außerhalb
des Projekts ist und dem Betreiber gehört.

#### Offene Punkte, die dieses Audit stehen lässt

1. **`docs/design/nixos-self-change.md` kam mit diesem Commit mit** — geschrieben vom
   Subagenten für `pmh-nix`, dessen Paket noch **nicht** abgenommen ist
   (`docs/status/arbeitspakete.md`, P1: `Nachweis offen`). Das widerspricht Regel **A6**
   („nur Fertiges wird committet") **teilweise**: die Datei ist inhaltlich fertig, das
   *Paket* nicht. Der Widerspruch wird hier festgehalten statt weggeredet; ob Doku eines
   offenen Pakets mitgehen darf, ist eine **offene Regelentscheidung**.
2. **Die 4-Stunden-Kadenz ist bisher dreimal innerhalb von vier Minuten gefeuert** — das ist
   kein Takt, das ist die Ersteinrichtung. Der Takt beginnt ab jetzt zu zählen.
3. **`credential-gh`** bleibt bis zur Entscheidung des Betreibers offen (siehe oben).

### 2026-10-13 · 08:48 UTC · Die kleinste Kette (achter Push)

| Prüfung | Ergebnis |
|---|---|
| Auslöser | Der Übergabepunkt des vorigen Berichts: „`llm-retry` → danach der Agent-Loop" — und alles, was zur ersten vollständigen Kette gehört |
| `HEAD` / `origin/main` | `730b0ede` — **identisch**, zusätzlich **über die API** bestätigt (`2026-10-13T08:48:00Z`) |
| Umfang | **35 Dateien** in einem Commit: acht Pakete, ein durchgehender Test, zwei Berichte, `package.json`, `bun.lock` |
| Versionierte Dateien | **1.674** (laut API-Baum) |
| Art | **Codeänderung** (TypeScript) + Doku. **Keine** Installation außer `bun install` (nur Verknüpfungen im eigenen Arbeitsbereich), **keine** Web-Änderung, kein Go-Dienst gestartet |

**Nachweis des Commits:** [`kleinste-kette-nachweis.md`](kleinste-kette-nachweis.md) —
262 Tests grün, 671 `expect()`-Aufrufe, 13 Einzel-Typechecks `exit 0`.

**Neu in diesem Commit:** `packages/llm/llm-retry`, `packages/llm/token-meter`,
`packages/core/agent-tools`, `packages/core/agent-loop`,
`packages/agent/session-format`, `packages/agent/session-persistence-jsonl`,
`tests/integration/kleinste-kette.test.ts`; dazu Erweiterungen an `packages/llm/llm`
(`ToolCallPart`, `checkHistory`), `packages/llm/llm-deepseek` (`tool_calls` in der
Nutzlast) und `package.json` (der Workspace-Eintrag zeigt jetzt auf `apps/cli`).

#### Was dieser Push **nicht** enthält — und warum

**Die 31 veränderten Dateien der Arbeitspakete P1 (Go) und der Rust-Crates bleiben
unangetastet.** Sie stammen aus früheren Sitzungen und sind hier **nicht** nachgemessen
worden; Regel **A6** („nur Fertiges wird committet") verbietet, sie unter einen Beleg zu
mischen, der sie nicht abdeckt. Der Zustand ist damit derselbe Widerspruch, der oben unter
Punkt 1 schon steht — und er wird hier **nicht** stillschweigend erweitert.

#### Befund: zwei Supervisor-Tests sind rot — und zwar schon am `HEAD` davor

Beim Prüfen der Go-Dienste (nicht Teil dieses Commits) fielen zwei Fehlschläge auf:

```
--- FAIL: TestShutdownReverseOrder (15.04s)
    Abschaltfrist ueberschritten: [gamma beta alpha]; beendete Dienste = []
--- FAIL: TestSingleRestartStartetNeu (2.10s)
    PID blieb gleich (6660); der Dienst wurde nicht neu gestartet
```

**Nachgemessen in einem eigenen `git worktree` auf `7e23932` (dem Stand *vor** diesem
Commit): **identisch rot**, dieselben zwei Tests, dieselben Meldungen. Die Fehlschläge
sind also **nicht** durch diese Sitzung entstanden — und sie betreffen `pmh-supervisor`,
ein Paket, das in diesem Register noch **kein** Arbeitspaket hat.

**Was daran auffällt:** beide Fehlschläge sehen nach **Windows-Prozessführung** aus
(Abschaltreihenfolge, PID-Wechsel). `pmh-supervisor` hat Tests für genau das — und sie
laufen auf diesem Wirt nicht durch. Ob die Tests zu streng sind oder die Umsetzung zu
schwach, ist **nicht geklärt** und gehört in ein eigenes Paket.

**Die übrigen Dienste sind grün:** `pmh-nix` (`vet=0`, `test=0`), `pmh-attach`
(`vet=0`, `test=0` — auch das früher hängende `internal/wire` läuft jetzt durch),
`native/flock` (Rust, 17 Tests grün).

#### Offene Punkte, die dieses Audit stehen lässt

1. **`bun run typecheck` läuft in dieser Umgebung nicht** — der Sandkasten verbietet
   erfasste Kindprozesse (benannte Pipes). Ersatzweg: 13 Einzelaufrufe, alle `exit 0`.
   Ob das Skript geändert werden soll (damit es ohne `--filter` auskommt), ist eine
   **offene Regelentscheidung**.
2. **`credential-gh`** ist bei diesem Push **erneut** aufgetreten — vierter Push, vierte
   Warnung. Der Befund von oben bleibt unverändert offen.
3. **`pmh-supervisor` hat kein Arbeitspaket** im Register, obwohl es Tests hat, die rot
   sind. Das ist eine Registerlücke, kein Codefehler — und sie gehört geschlossen.

### 2026-10-13 · 09:01 UTC · Korrektur: der Windows-Blocker ist keine Bun-Grenze (neunter Push)

| Prüfung | Ergebnis |
|---|---|
| Auslöser | Der Windows-Start ließ sich nicht erklären; die bisherige Erklärung (`windows-start-nachweis.md` §5: „Laufzeit-Grenze von Bun") war eine **Hypothese**, keine Messung |
| `HEAD` / `origin/main` | `85c4c84` — **identisch**, zusätzlich **über die API** bestätigt (`2026-10-13T09:01:32Z`) |
| Umfang | **Dokumentation + vier Messsonden** (`docs/status/kleinste-kette-nachweis.md` §6, `docs/status/arbeitspakete.md` P9, `docs/status/messsonden/*`) |
| Art | **keine Codeänderung** am Produkt. Kein pnpm, kein npx, kein Docker, kein Nix. Ein Go-Dienst wurde **getestet**, nicht gestartet |
| Commits | `b62da20` (Korrektur + Nachweis), `85c4c84` (Messsonden) |

**Was gemessen wurde — Windows nativ gegen WSL2, gleicher Baum, gleiche Quelldatei:**

| | Windows nativ (Bun 1.4.0) | WSL2 (Bun 1.4.3) |
|---|---|---|
| deaktivierte Profil-Einträge | **27** | **0** |
| Token-Zeile | fehlt | vorhanden |
| `GET /?token=…` | nicht erreichbar | **303** + `set-cookie` |
| `GET /` mit Cookie | nicht erreichbar | **200 · 32.184 B** · Titel „DeepSeek Harness" |

**Damit ist die frühere Erklärung widerlegt:** unter WSL2 läuft **dieselbe
Laufzeit** (Bun) — wäre es eine Bun-Grenze, liefe es dort ebenso wenig. Das
Verhalten ist **plattform**abhängig, nicht laufzeitabhängig.

**Der Fehlertext beschreibt ein Paket, das es hier nicht gibt:**
`Plugin @deepseek-ai/dsh-llm@0.1.1-rc.2 is incompatible with dsh 0.2.1-alpha.2`.
Nachgemessen: die installierte `dsh-llm` ist `0.2.1-alpha.2` und deklariert als Peer
**nur** `@deepseek-ai/cordis`; `bun pm ls` findet genau **eine** Kopie; die
Zeichenkette `0.1.1-rc.2` kommt in `bun.lock`, `apps/cli/package.json` und allen
245 `@deepseek-ai`-Paketen des Projekts **nicht** vor. Die Laufzeitversion selbst
ist korrekt (`dsh-app-boot/package.json` → `0.2.1-alpha.2`, per Sonde geprüft).

**Die Korrektur steht nur in den neuen Dokumenten.** `windows-start-nachweis.md`
wird **nicht** nachträglich geändert — nach der eigenen Regel dieses Ordners wird ein
Snapshot nicht korrigiert, sondern ein **neuer** Befund daneben gestellt.

#### Offene Punkte, die dieses Audit stehen lässt

1. **Die Herkunft der fremden Paketidentität ist ungeklärt.** Ohne sie ist der
   Windows-Start nicht zu reparieren, nur zu umgehen (WSL2). Das ist der
   wichtigste offene Punkt des ganzen Vorhabens — er blockiert `t40`.
2. **`credential-gh`** — fünfter Push, fünfte Warnung; unverändert offen.
3. **`bun run typecheck`** bleibt in dieser Umgebung nur einzeln ausführbar
   (Sandkasten: benannte Pipes). 13 Einzelaufrufe, alle `exit 0`.

### 2026-10-13 · 09:20 UTC · Die Ursache des Windows-Blockers ist gefunden (zehnter Push)

| Prüfung | Ergebnis |
|---|---|
| Auslöser | Offener Punkt aus dem neunten Push: „die Herkunft der fremden Paketidentität ist ungeklärt" |
| Umfang | `docs/status/kleinste-kette-nachweis.md` §6 (Ursache), `docs/status/arbeitspakete.md` P9.10–P9.12 |
| Art | **Dokumentation.** Eine **temporäre** Instrumentierung des Rumpfes in `node_modules` (nicht versioniert) wurde nach der Messung **vollständig zurückgenommen** — geprüft: die Datei enthält keine Spur mehr |

**Die Ursache, gemessen:** `C:\Users\Chang\.dsh\profiles\node_modules` enthält eine
**alte Installation des DeepSeek Harness** (204 Pakete der Linie `0.1.1-rc.2`).
Der Auflösungsanker des Baums (`parentURL`) zeigt ins Harness-Home; Node sucht von
dort **aufwärts** und nimmt den **ersten** Treffer — die alte Installation. Der
Projektbaum wird gar nicht gefragt.

**Messung der Instrumentierung:** **120 von 120** aufgelösten Paketpfaden zeigten
nach `…\.dsh\profiles\node_modules`, **0** in den Projektbaum.

**Gegenprobe WSL2:** `~/.dsh/profiles/node_modules` existiert dort **nicht**
(`~/.dsh` enthält nur `profiles` und `storages`) → die Kette läuft in den
Projektbaum durch → `0.2.1-alpha.2` → **0 Deaktivierungen** → HTTP 200.

#### Was dieses Audit stehen lässt — und warum hier **nichts** geändert wurde

Die Behebung verlangt einen Eingriff **außerhalb dieses Repositories**
(`C:\Users\Chang\.dsh` entfernen, umbenennen oder den Anker umlenken). In `~/.dsh`
liegt die Installation, mit der der Betreiber arbeitet — und über die diese
Sitzung selbst läuft. **Ein Aufräumversuch könnte die laufende Umgebung
beschädigen.** Deshalb: Befund gemessen, Behebung **nicht** ausgeführt, drei Wege
benannt (P9.11). Die Entscheidung gehört dem Betreiber.

**Das ist die wichtigste offene Entscheidung des Vorhabens:** sie blockiert den
Windows-Start und damit `t40`.
