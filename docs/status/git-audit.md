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
