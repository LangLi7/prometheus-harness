# Review r1 / r2 — Referenzangaben und Unversehrtheit der Vorlagen

> Prüfung vom **12.10.2026**, 17:22 UTC (19:22 Ortszeit) durch die Rolle *reviewer* (crew-1).
> Gegenstand: die Referenznotiz [../reference-templates.md](../reference-templates.md) und die
> beiden dort genannten Vorlagenverzeichnisse. Reine Textprüfung — HTTP, Hashes, Zeitstempel,
> Dateilisten; keine Bildauswertung.

---

## r1 — Referenznotiz gegen die ursprüngliche Anforderung

| Gefordert | Gefunden | Ort in der Notiz | Urteil |
|---|---|---|---|
| Pfad `C:\Users\Chang\harness\prometheus-harness` als **Harness-Core-Vorlage** | wörtlich vorhanden, bezeichnet als „Kanonische **Vorlage / Fork-Basis** für den neuen Harness-Core" | §1 „Harness-Core-Vorlage" | **erfüllt** |
| Upstream `https://github.com/deepseek-ai/deepseek-harness` **zur Core-Vorlage** | wörtlich vorhanden und ausdrücklich als „aktueller Upstream des Harness-Core-Vorlagenstandes" zugeordnet | §1 | **erfüllt** |
| Pfad `H:\Projekt\Programmieren\Prometheus\webui` als **Web-UI-Vorlage** | wörtlich vorhanden, mit dem Hinweis „Nur das Unterverzeichnis `webui` ist relevant" und „Der Rest von `H:\Projekt\Programmieren\Prometheus` wird **ignoriert**" | §2 „Web-UI-Vorlage" | **erfüllt** |
| Fokus auf die **webui** | eigener Abschnitt, eigener Startleitfaden ([webui-dev.md](../webui-dev.md)), eigener Nachweis des Testlaufs | §2 und §5 | **erfüllt** |

### Abweichungen von den Annahmen des Auftrags (keine Fehler in der Notiz)

1. **Ort der Notiz.** Der Auftrag nennt `docs\reference-templates.md`. Die Datei liegt unter
   **`docs\reference\reference-templates.md`** — sie wurde beim Katalogisieren (Aufgabe t9)
   in den Ordner `reference/` verschoben. Die Notiz dokumentiert das selbst in §6
   („Wo diese Notiz steht"). Inhaltlich dieselbe Datei, kein Verlust.
2. **Die Notiz enthält mehr als die Ursprungsanfrage.** Neben den beiden Vorlagen auch
   Skizzen (`H:\Projekt\Programmieren\Prometheus\sketches`, §3), Skill-Bibliothek (§4) und
   einen Statusabschnitt (§5). Das geht auf die Aufgaben t4/t5 zurück und widerspricht der
   Ursprungsanfrage nicht — die beiden geforderten Vorlagen bleiben klar getrennt und
   vollständig.
3. **§5 „Status der referenzierten Verzeichnisse"** behauptet, es sei nichts verändert
   worden, mit einer benannten Ausnahme (Vite-Cache des Dev-Servers in `node_modules/.vite/`).
   Diese Aussage deckt sich mit dem Befund unten — sie ist korrekt, nicht nur behauptet.

**Ergebnis r1: bestanden.** Keine Korrektur an der Notiz nötig; sie wurde **nicht** verändert.

---

## r2 — Unversehrtheit beider Vorlagenverzeichnisse

**Methode.** Von jedem Verzeichnis wurde eine Liste aus relativem Pfad, Dateigröße,
Änderungszeit und **SHA-256** erzeugt — vor und nach der Arbeit. `node_modules/` und `.git/`
sind ausgenommen (Laufzeitverzeichnisse, siehe Einschränkung unten).

| Vorlage | Dateien | Manifest „vorher" | Manifest „nachher" | Vergleich |
|---|---|---|---|---|
| `H:\Projekt\Programmieren\Prometheus\webui` | 22 | `webui-template-before.txt`, 16:42:16 UTC | `webui-template-after.txt`, 17:06:55 UTC | **identisch** |
| `C:\Users\Chang\harness\prometheus-harness` | 27.093 | `core-template-before.txt`, 16:42:44 UTC | `core-template-after.txt`, 16:59:15 UTC | **identisch** |

Belege im Ordner [verify/](.): die vier genannten Dateien.
`Compare-Object` über beide Paare ergab **0 Abweichungen** — kein Eintrag hinzugefügt, geändert
oder entfernt.

**Zusätzliche Gegenprobe über Änderungszeiten** (unabhängig von den Hashes):

| Verzeichnis | Neueste Änderung (ohne `node_modules/`, `.git/`) | Innerhalb des Belegfensters (16:42–17:07 UTC)? |
|---|---|---|
| `H:\Projekt\Programmieren\Prometheus\webui` | `src\App.svelte`, **2026-08-06** 23:37 UTC | nein — über zwei Monate alt |
| `C:\Users\Chang\harness\prometheus-harness` | `.pmh\base.json`, **2026-10-12** 13:50:43 UTC | nein — 2 h 51 min vor dem Fenster |

Es existiert also in **keinem** der beiden Verzeichnisse eine Datei (außerhalb von
`node_modules/`), deren Änderungszeit in unser Arbeitsfenster fällt.

### Einschränkung, die dazugehört

- **`node_modules/` ist nicht durch Hashes abgedeckt.** Beide Bäume zeigen dort Aktivität von
  heute: `H:\...\webui` 127 Dateien, die Core-Vorlage 32.560 Dateien. Die Zeitstempel der
  Core-Vorlage liegen bei **13:11–13:22 UTC** und damit **vor** unserem Fenster (älter als die
  erste Aufnahme um 16:42 UTC); im `webui`-Baum schreibt der laufende Dev-Server seinen
  Vite-Cache — genau die Ausnahme, die §5 der Referenznotiz nennt. Unsere Arbeit hat dort
  nichts angelegt: beide Dev-Server (5174 Vorlage, 5175 unser Prototyp) wurden außerhalb der
  Vorlage gestartet.
- **Der Nachweis beginnt um 16:42 UTC**, nicht beim allerersten Handgriff der Sitzung. Alles
  davor Liegende ist über die Änderungszeiten abgedeckt (siehe Gegenprobe), nicht über Hashes.

**Ergebnis r2: bestanden.** Beide Verzeichnisse sind unverändert; nichts wurde angelegt,
geändert oder gelöscht. Diese Prüfung selbst hat in beiden Verzeichnissen nur gelesen.

---

## Gesamturteil

Die festgehaltenen Referenzangaben entsprechen der ursprünglichen Anforderung (r1), und beide
Vorlagenverzeichnisse sind unverändert (r2). Die Aussage in §5 der Referenznotiz ist damit
belegt. Es war keine Korrektur an der Notiz und kein Eingriff in eines der Verzeichnisse
erforderlich — entsprechend wurde keiner von beiden angefasst.
