# Konzept

## Das Problem, das dieses Projekt löst

Der DeepSeek Harness ist als Monorepo gebaut: unsere Anpassungen lagen in **56 fremden
Dateien** und **129 neuen Dateien quer über 16 Pakete**. Folge:

- Jeder Upstream-Sprung erzeugt Merge-Konflikte in denselben Dateien.
- Die Anpassung ist nicht absteckbar — sie ist eingenäht.
- Um sie zu behalten, muss man eine zweite vollständige Installation pflegen
  (1,4 GB, 71.849 Dateien im Fall der deutschen Übersetzung).

Prometheus Harness dreht das um: **Der Core wird benutzt, nicht besessen.**

## Der Kern: alles ist ein Unit

Eine Harness ist eine **Komposition aus Plugins**. Der Upstream sagt es selbst:

> „A real agent is this composition plus more plugins: an LLM adapter, the agent loop,
> persistence, and an application entry."

Daraus folgt das Unit-Modell:

| Unit-Art | Was es tut | Beispiel |
|---|---|---|
| `plugin` | Cordis-Plugin, in einen Bundle eingehängt | Multi-Modell-Router, Git-Panel |
| `service` | startet einen externen Dienst **mit** der Harness | Firecrawl, SearXNG, PostgreSQL |
| `patch` | Änderung an einer Core-Datei, die keinen Steckplatz hat | nur mit Begründung |
| `skill` | Agent-Skill ohne Host-Code | Selbstverbesserung |

Jedes Unit liegt in **einem** Ordner, den wir besitzen, hat eine Version, deklariert seine
Abhängigkeiten und ist **an- und absteckbar**.

## Die vier Regeln

1. **Der Core ist unantastbar.** Keine Änderung in Upstream-Dateien. Wer eine Änderung
   braucht, baut sie als Unit.
2. **Kein Unit importiert Interna des Cores** — nur öffentliche Steckplätze (`ctx.*`,
   Service-Interfaces, deklarierte Interface-Maps). Nur so kostet ein Core-Sprung keine
   Unit-Arbeit.
3. **Dienste starten mit der Harness.** Ein Dienst wird vom Unit gestartet, nicht vom Core
   eingebaut. Fehlgeschlagener Start ist ein sichtbarer Fehler, kein stiller Ausfall.
4. **Sprachgrenzen sind Dienstgrenzen.** Der JS-Core bleibt der Kernel; jede andere Sprache
   ist ein Prozess, den er aufruft.

## Warum der Core JavaScript sein muss

Nicht Geschmack, sondern Zwang: Das Plugin-System des Harness heißt **Cordis** und ist
JavaScript. Plugins sind JS-Module, die über `ctx.*` Dienste anbieten und abfragen. Ein
Core in Go oder Rust könnte keine Cordis-Plugins laden — und genau die sind der Sinn des
Projekts.

Daraus folgt: **TypeScript ist gesetzt**, die Frage ist nur die Laufzeit.

## Die Reihenfolge, die vor Nacharbeit schützt

1. **Core läuft** — Agent-Core auf TypeScript/Bun, ein Modell angebunden, Chat funktioniert.
2. **Ein Unit beweist die Kette** — Paket, Registrierung, Test, im GUI sichtbar, absteckbar.
3. **Erst dann Sprachgrenzen** — jede Auslagerung nach Go oder Rust wird mit einer Messung
   begründet, nicht mit einer Vorliebe.

Wer Schritt 3 vorzieht, baut drei Sprachen gleichzeitig und kann bei einem Fehler nicht
sagen, welche schuld ist.

## Verhältnis zum DeepSeek Harness

| | |
|---|---|
| **Als Vorlage** | Architektur, Plugin-Modell, Kompositionsformat, Doku-Konventionen |
| **Als Referenz** | Was es schon gibt, damit wir nichts doppelt bauen |
| **Als Core-Kandidat** | Der aktuelle Core ist TS-7-fähig; ein Fork bleibt möglich |
| **Nicht als Codebasis** | Wir kopieren nicht 14.990 Dateien und schneiden darin |

Der Referenz-Fork unter `C:\Users\Chang\harness\prometheus-harness` bleibt erhalten, damit
wir Verhalten vergleichen können — und weil er die einzige lauffähige Installation ist.
