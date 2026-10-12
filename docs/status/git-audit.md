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
