# E3 — der Vollaudit: was wirklich dasteht, und warum der Validator POSIX braucht

> **Stand:** 13.10.2026 · **Auftrag (E3):** *„Vollaudit zu Ende führen: 61
> Ledger-Einheiten liegen in `.pmh-build/security-audit/run-1/`, Validator läuft nur
> auf POSIX."*
>
> **Der Befund, der die Formulierung korrigiert:** der Audit ist **nicht** „zu Ende
> zu führen" — er ist **am Anfang**. Von **61** Einheiten sind **60 `planned`** und
> **1 `candidate`**; **keine einzige** ist bearbeitet, und **vier** Ausgabedateien
> fehlen ganz. Gemessen, nicht geschätzt.

---

## 1. Was im Lauf liegt

```
.pmh-build/security-audit/run-1/
  architecture.md                    (Rekognoszierung, vorhanden)
  coverage-ledger.json               (61 Einheiten, vorhanden)
  run-metadata.json                  (run_status: in_progress)
  recherche-passwort-und-apikeys.md
  recherche-schluesselverwaltung.md
  agents/                            0 Dateien
  artifacts/                         0 Dateien
```

**Die 61 Einheiten** (`coverage-ledger.json`, je 61 Einträge in `coverage_id`,
`agent_id`, `attack_class`, `boundary`, `surface`, `subsystem`, `status`, `wave`):

| Status | Anzahl |
|---|---|
| `planned` | **60** |
| `candidate` | **1** |
| erledigt | **0** |

Alle in **Welle 1**. Dazu 130 `reconnaissance_leads`, 270
`selected_companion_blocks`, 103 `starting_paths`.

**Die vier Ausgabedateien, die `run-metadata.json` als Aufgabe nennt und die
fehlen** (gemessen mit `Test-Path`):

| Datei | vorhanden |
|---|---|
| `findings.json` | **nein** |
| `REPORT.md` | **nein** |
| `FINDINGS-DETAIL.md` | **nein** |
| `NEEDS-VALIDATION.md` | **nein** |

Der Lauf steht damit dort, wo die Rekognoszierung aufgehört hat: **das Gelände ist
abgesteckt, gejagt wurde nicht.**

## 2. Was der Lauf selbst über sich sagt — und was er offenlegt

`run-metadata.json` nennt zwei Abweichungen **ausdrücklich**, und beide gehören in
eine Veröffentlichung:

> `execution_policy: sandboxed-source-and-local-only` · `sandbox_capability_missing:
> kein OS-erzwungener Sandkasten für zielgesteuerten Code (Netzsperre, leere
> Umgebung, Schreibgrenzen, Ressourcengrenzen)`

> *„Quelltext lesen ist frei. Ausführen von zielgesteuertem Code fand NICHT statt …
> Das ist als Abweichung gemeldet, nicht verschwiegen."*

Und zur Schreibisolation:

> *„Abgewichen wurde in EINEM Punkt: die Rekognoszierung durfte `architecture.md`
> und `coverage-ledger.json` direkt schreiben. Begründung: diese Unteragenten sind
> vertrauenswürdige Agenten auf der Elternseite, kein zielgesteuerter Code in einem
> Sandkasten."*

**Das ist die richtige Art, mit einer Abweichung umzugehen** — sie steht da, mit
Begründung, statt zu fehlen.

## 3. Warum der Validator POSIX braucht — die Ursache, wörtlich

Sie steht im Kopf des Validators selbst
(`C:\Users\Chang\security-audit-skill\deepseek-harness\run-1\validate.sh`):

```bash
#!/usr/bin/env bash
# Runs the security-audit-skill validators under a real POSIX Node (WSL).
# Reason: the shipped validators hard-refuse input when Node exposes no
# O_NOFOLLOW/O_NONBLOCK, which is the case on win32.
```

**Also nicht „ein Shell-Skript, das auf Windows nicht läuft", sondern eine
inhaltliche Sperre:** die Validatoren **verweigern die Arbeit**, wenn Node die
Konstanten `O_NOFOLLOW`/`O_NONBLOCK` nicht kennt — und auf `win32` kennt es sie
nicht. Das ist eine **Sicherheitsentscheidung**, keine Unbequemlichkeit: die
Validatoren prüfen Dateizugriffe, und ohne diese Flags könnten sie einem Symbol-…
oder Blockierangriff aufsitzen, statt ihn zu **bemerken**.

**Gemessen:** WSL ist vorhanden und einsatzbereit — `wsl --status` meldet
*„Standarddistribution: Ubuntu, Standardversion: 2"*. Der Weg ist also **da**: der
Validator läuft unter WSL gegen denselben Baum (`/mnt/c/...`).

## 4. Was zu tun ist — und was davon eine Entscheidung braucht

| Schritt | Was | Art |
|---|---|---|
| 1 | Die **61 Einheiten abarbeiten** — der Skill führt das über Wellen von Jägern und Prüfern | **Entscheidung:** Aufwand. Ein Vollaudit über `packages/`, `services/`, `native/`, `apps/`, `scripts/`, `benchmarks/`, `docker/` ist ein eigener Lauf mit eigenem Budget |
| 2 | Die vier Ausgabedateien erzeugen | folgt aus 1 |
| 3 | Validieren **unter WSL** (`validate.sh`) | Werkzeug ist da (§3) |
| 4 | Die Befunde in die **eine Sammelstelle** (`docs/review/BEFUNDE-ALLE.md`, Hausregel des Betreibers) | folgt aus 1 |
| 5 | Die zwei **bereits belegten** Wurzeln **nicht** neu jagen | stehen in `run-metadata.json`: B-S1 (Mandantentrennung, inzwischen **behoben** durch Migration 0004/0006 — der Ledger weiß das noch nicht) und B-S2 (nicht umbenannte Objekte) |

**Der wichtigste Punkt ist 5.** Der Ledger wurde am 13.10. um 14:40 angelegt — **vor**
den Migrationen 0004, 0005, 0006, 0007 und vor dem Schließen von B-S1. Ein Lauf, der
jetzt ohne Nachziehen startet, würde **behobene** Befunde erneut jagen und den
Bericht mit Altlasten füllen. **Das Nachziehen des Ledgers ist billiger als ein
falscher Lauf** — und es ist der erste Schritt, den ich ohne Entscheidung tun kann.

## 5. Nachfahren

```powershell
cd C:\Users\Chang\prometheus-harness
$r = '.pmh-build/security-audit/run-1'

# Wie viele Einheiten, und in welchem Zustand?
$j = Get-Content "$r/coverage-ledger.json" -Raw | ConvertFrom-Json
$j.status | Group-Object | ForEach-Object { "$($_.Name): $($_.Count)" }   # planned 60, candidate 1

# Welche Ausgabedateien fehlen?
foreach ($f in 'findings.json','REPORT.md','FINDINGS-DETAIL.md','NEEDS-VALIDATION.md') { "$f = $(Test-Path "$r/$f")" }

# Ist WSL da (der Validator braucht POSIX)?
wsl --status
```
