# `unit-export` — Units ausgeben und annehmen, über die Harness selbst

> **Zweck.** Alles in diesem Projekt ist ein Unit (`docs/concept.md`). Bis hierher
> hieß das: ein Unit ist ein Ordner, den man von Hand kopiert. Dieses Paket
> schließt die Lücke: der **laufende** Harness gibt ein Unit als **eine**
> weitergebbare Datei aus und nimmt eine solche Datei wieder an — mit
> Prüfsumme, Herkunft und ohne Handarbeit.
>
> Fundstelle: `docs/decisions/hybrid-then-self-build.md` §3.2 („Plugin-Export
> über den Harness"). Wortlaut des Betreibers: *„der Agent-Konzept everything is
> plugin — genauso möchte ich auch Plugins und Anpassungen exportieren und
> weitergeben können, per Harness selbst."*

Das Paket hat **keine** Laufzeitabhängigkeit außer `node:crypto`, `node:fs` und
`node:path`. Es läuft unter Bun und wird mit TypeScript 7 geprüft.

---

## 1. Was drin ist

| Modul | Inhalt |
|---|---|
| `src/errors.ts` | Befundmodell: jeder Verstoß hat einen stabilen `code`, einen Ort (`at`) und optional maschinenlesbare Angaben |
| `src/manifest.ts` | Manifest-Modell und -Prüfung nach `units/README.md` |
| `src/registry.ts` | Registry über konfigurierte Wurzeln, Abhängigkeitsauflösung, Verträglichkeitsprüfung, Installierbarkeit |
| `src/bundle.ts` | Bündelformat: Aufbau, Hashes, Digests, Pfadsicherheit, Planung des Schreibens |
| `src/operations.ts` | `exportUnit`, `importBundle`, `inspectBundle`, `planBundleInstall`, `listRegistry` — Export/Import mit Fail-closed und Herkunft |
| `src/index.ts` | die öffentliche Fläche: dieselben Aufrufe, die die CLI macht |
| `src/cli.ts` | die vier Kommandos `export`, `import`, `inspect`, `list` |

Es gibt **eine** Umsetzung. Die CLI ist eine dünne Hülle über `src/index.ts`;
ein Cordis-Plugin oder ein HTTP-Handler ruft dieselben Funktionen auf.

---

## 2. Bündelformat `PMHUNITB`, Format 1

Ein Bündel ist eine flache Datei: Kopfzeile, Manifest, Nutzlast. Keine
Kompression, kein Archivformat, keine Fremdbibliothek. Die folgende Tabelle ist
vollständig genug, dass eine zweite Umsetzung sie in einer anderen Sprache lesen
kann.

### 2.1 Kopfzeile — genau 66 Bytes

| Offset | Länge | Inhalt |
|---:|---:|---|
| 0 | 8 | Magic `PMHUNITB` (ASCII) |
| 8 | 1 | `\n` (0x0A) |
| 9 | 12 | Formatversion, ASCII-Dezimal, 12 Stellen, führende Nullen (`000000000001`) |
| 21 | 1 | Leerzeichen (0x20) |
| 22 | 12 | Länge des Manifests in Bytes, ASCII-Dezimal, 12 Stellen |
| 34 | 1 | Leerzeichen (0x20) |
| 35 | 12 | Länge der Nutzlast in Bytes, ASCII-Dezimal, 12 Stellen |
| 47 | 1 | Leerzeichen (0x20) |
| 48 | 12 | Länge von H1, ASCII-Dezimal, 12 Stellen — immer `000000000012` |
| 60 | 1 | Leerzeichen (0x20) |
| 61 | 1 | `\n` (0x0A) |
| 62 | 4 | reserviert, vier Leerzeichen (0x20) |
| 66 | L | Manifest (UTF-8 JSON, ohne BOM, ohne Leerzeichen, kanonische Schlüsselreihenfolge) |
| 66+L | 12 | H1: die ersten 12 hexadezimalen Zeichen des SHA-256 aus Abschnitt 2.4 |
| 78+L | P | Nutzlast |

Es gilt `Dateigröße = 66 + L + 12 + P`. Die Zahlenfelder sind fest breit, damit
ein Leser sie ohne Suche schneiden kann. Ein Leser muss prüfen: Magic, beide
`\n`-Trenner, die Feldbreite von H1, und die Gesamtlänge gegen die tatsächliche
Dateigröße.

### 2.2 Manifest

Kanonisch serialisiertes JSON mit genau diesen Feldern, in dieser Reihenfolge:

```jsonc
{
  "format": 1,                       // Zahl, muss zur Kopfzeile passen
  "createdAt": "2026-10-12T00:00:00.000Z",  // ISO-8601, Zeitpunkt des Exports
  "createdBy": "@prometheus-harness/unit-export",
  "source": { "unit": "pmh-supervisor", "version": "0.1.0" },
  "entrypoint": "pmh-supervisor",    // bei Services der entry.command, sonst units/<name>
  "units": [                         // das Quell-Unit zuerst, dann die Abhängigkeiten
    { "name": "...", "version": "...", "kind": "plugin",
      "manifest": { /* das vollständige unit.json, geprüft */ } }
  ],
  "files": [
    { "unit": "pmh-supervisor", "path": "unit.json",
      "size": 512, "sha256": "…64 hex…", "offset": 0 }
  ],
  "closure": ["pmh-supervisor"],     // Abschluss einschließlich des Quell-Units
  "contentDigest": "sha256:…",
  "digest": "sha256:…",              // der Bündeldigest
  "payloadBytes": 109825
}
```

`files[].path` ist **relativ zum Unit-Ordner**, immer mit `/` als Trenner,
niemals absolut. `files[].offset` zählt ab dem ersten Byte der Nutzlast.

### 2.3 Nutzlast

Die Nutzlast ist die Verkettung aller Dateiinhalte in der Reihenfolge von
`manifest.files`. Kein Padding, keine Ausrichtung:

```
offset[0] = 0
offset[i+1] = offset[i] + size[i]
Summe(size) = payloadBytes = P
```

Beim Lesen werden alle drei Beziehungen geprüft, und jede Datei wird gegen ihren
`sha256` nachgerechnet.

### 2.4 H1 und Bündeldigest

```
H1 = sha256( kanonisch(manifest mit digest = DIGEST_PLACEHOLDER) )      # voller Hex-Digest
H2 = sha256( Nutzlast )                                                 # voller Hex-Digest
Bündeldigest = "sha256:" + sha256( "PMHUNITB\n1\n" + H1 + H2 + "\n" )
```

mit

```
DIGEST_PLACEHOLDER = "sha256:0000000000000000000000000000000000000000000000000000000000000000"
```

Der Platzhalter steht an der Stelle von `digest`, weil ein Digest sich nicht
selbst enthalten kann. Er ist genauso lang wie der fertige Wert, und die
kanonische Serialisierung hängt nicht von ihm ab.

**Nachrechnen aus der Datei allein:** Manifest aus der Datei lesen, `digest` auf
den Platzhalter setzen, kanonisch serialisieren (Abschnitt 2.5), hashen — das
ergibt H1. Nutzlast hashen — das ergibt H2. Beides zusammensetzen. Es geht
**kein** Wert in seine eigene Berechnung ein.

Die 12 Zeichen H1 in der Kopfzeile sind der Anfang desselben Werts. Sie sind
eine billige Vorprüfung, kein Ersatz für den Bündeldigest.

### 2.5 Kanonische Serialisierung

Genau die Feldreihenfolge aus Abschnitt 2.2, `JSON.stringify`-Form ohne
Leerzeichen, UTF-8 ohne BOM. Innerhalb von `units[].manifest` gilt die
Feldreihenfolge aus `serializeManifest` (`src/manifest.ts`): `name`, `version`,
`kind`, `language`, `description`, `entry` (nur wenn gesetzt), `core`,
`contract` (nur wenn gesetzt), `provides`, `requires`, `platforms`, `notes`.
Leere Listen stehen als `[]`, nicht als fehlendes Feld.

### 2.6 Inhaltsdigest

```
Inhaltsdigest = "sha256:" + sha256(
  "unit-content-1\n" +
  für jede Datei in Manifest-Reihenfolge: unit + "\u0000" + path + "\u0000" + sha256 + "\n"
)
```

Er hängt **nicht** an `createdAt`, `createdBy`, Quellpfaden oder der
Dateireihenfolge auf der Platte. Er ist damit die Größe, mit der zwei Bündel
desselben Inhalts verglichen werden — und die Größe, die ein Rundlauf
vergleicht, wenn das Quell-Verzeichnis sich ändert.

---

## 3. CLI

```powershell
bun run src/cli.ts export  --unit <ordner>  --out <datei> [--root <pfad>]… [--include <pfad>]…
bun run src/cli.ts import  --bundle <datei> --into <wurzel> [--force]
bun run src/cli.ts inspect --bundle <datei>
bun run src/cli.ts list    --root <wurzel> [--root <wurzel>]… [--detail] [--json]
```

Gemeinsame Flags:

| Flag | Bedeutung |
|---|---|
| `--core-version <v>` | Version des Core-Vertrags, gegen die geprüft wird (z. B. `0.2.1-alpha.2`) |
| `--default-contract <spanne>` | Spanne für Units ohne eigenes `contract`; ohne Angabe gilt ein **fehlender** Vertrag als Befund |
| `--platform <p>` | Host-Plattform, Default `process.platform` |
| `--created-at <iso>` | Zeitstempel des Bündels festhalten (reproduzierbare Läufe) |
| `--installed-at <iso>` | Zeitstempel der Installation festhalten |
| `--include <pfad>` | eine sonst übersprungene Datei mitnehmen (mehrfach möglich) |
| `--force` | beim Import eine vorhandene Fassung ersetzen (`overwrite`) |

Exit-Codes: `0` Erfolg, `1` Befund (Validierung, Digest, Pfad, Konflikt),
`2` Aufruffehler.

Ausgabe auf stdout, Befunde auf stderr. Beispiel (echter Lauf, gekürzt):

```
$ bun run src/cli.ts export --unit ../../../services/pmh-supervisor --out $env:TEMP\pmh-cli-demo\pmh-supervisor.pmhunit --root ../../../services --created-at 2026-10-12T00:00:00.000Z
unit      pmh-supervisor 0.1.0
bundle    C:\Users\Chang\AppData\Local\Temp\pmh-cli-demo\pmh-supervisor.pmhunit
digest    sha256:b3067ce27614f22f53193f62039e6e596ce70adeed890261c18ba1cb2ad21259
content   sha256:18499bcf5380111ed330cf4d506e8fc7844dfc0c2a048de40e70dcaf32fb9310
closure   pmh-supervisor
files     20 (114494 Bytes)

$ bun run src/cli.ts import --bundle …\pmh-supervisor.pmhunit --into …\units
bundle    sha256:b3067ce27614f22f53193f62039e6e596ce70adeed890261c18ba1cb2ad21259
into      C:\Users\Chang\AppData\Local\Temp\pmh-cli-demo\units
installed pmh-supervisor 0.1.0 -> C:\Users\Chang\AppData\Local\Temp\pmh-cli-demo\units\pmh-supervisor (20 Dateien)
rolled    nein
```

---

## 4. Programmatische Fläche

```ts
import {
  exportUnit, importBundle, inspectBundle, scanRegistry, planInstall,
} from '@prometheus-harness/unit-export'
```

### `scanRegistry(request) → Registry`

```ts
const registry = await scanRegistry({
  roots: [{ path: 'units', label: 'units' }, { path: 'services', label: 'services' }],
  host: { coreVersion: '0.2.1-alpha.2', defaultContract: '^0.2.0', platform: process.platform },
})
registry.units        // stabil sortiert: Wurzel, Name, Version, Pfad
registry.diagnostics  // jeder Befund mit code, at, Ort und severity
```

`severity: 'error'` heißt: dieses Unit ist nicht nutzbar und fehlt deshalb in
`units`. `severity: 'warning'` heißt: das Unit ist nutzbar, aber etwas soll
sichtbar sein — etwa ein Ordnername, der vom Unit-Namen abweicht. Eine Warnung
ist kein Fehlschlag; die CLI beendet sich deswegen nicht mit Exit-Code 1.

Die Registry **erfindet keinen Zustand**: sie liest `unit.json` aus den Wurzeln.
Kein zusätzlicher Index, der veralten kann — der Ordner ist die Installation.

### `planInstall(registry, name) → Installability`

Beantwortet „ist dieses Unit hier installierbar, und wenn nicht, warum genau".
Geprüft wird **alles**, nicht nur das Erste: fehlende Abhängigkeiten, Zyklen,
Core-Vertrag, Plattform, Sprache und Fähigkeitskollisionen. Jeder Grund ist ein
eigener Befund mit eigenem Code.

### `exportUnit(request) → ExportResult`

```ts
const result = await exportUnit({
  unit: 'services/pmh-supervisor',
  out: 'pmh-supervisor.pmhunit',
  roots: ['services'],
  host: { coreVersion: '0.2.1-alpha.2', defaultContract: '^0.2.0' },
  createdAt: '2026-10-12T00:00:00.000Z',   // optional, für reproduzierbare Läufe
})
result.digest         // Bündeldigest
result.contentDigest  // Inhaltsdigest
result.closure        // ['pmh-supervisor', …]
```

Eine fehlende Abhängigkeit ist ein Wurf (`UnitExportFailure`) mit **allen**
Befunden — kein stiller Teil-Export.

### `inspectBundle(path) → InspectResult`

Prüft das Bündel vollständig, ohne etwas zu schreiben: Format, Längen, H1,
jeden Dateihash, den Bündeldigest, jeden Pfad, jedes eingebettete Manifest und
die Vollständigkeit des Abschlusses. `digestVerified` sagt, ob der eingebettete
Digest zu den Bytes passt. Defekte Bündel werfen mit der vollständigen
Befundliste.

### `importBundle(request) → ImportResult`

```ts
const installed = await importBundle({
  bundle: 'pmh-supervisor.pmhunit',
  into: '.pmh/units',
  ifExists: 'fail',            // oder 'overwrite'
  host: { coreVersion: '0.2.1-alpha.2' },
  source: { path: 'https://example.invalid/pmh-supervisor.pmhunit' },
})
installed.digest      // == result.digest oben; die Herkunft ist belegt
installed.rolledBack  // false im Erfolgsfall; bei einem Fehlschlag wird geworfen
```

### `planBundleInstall({ bundle, into, host }) → BundleInstallPlan`

Sagt vorher, welche Units entstehen, welche schon da sind und welche Dateien
geschrieben würden — **ohne** etwas zu schreiben. Für eine Oberfläche, die vor
dem Klick fragen will.

---

## 5. Sicherheit

Ein Bündel ist **Fremddaten**. Wer eines annimmt, nimmt einen Dateibaum an, den
jemand anderes gebaut hat. Deshalb gilt:

- **Pfadprüfung auf jedem Eintrag**, zweimal: beim Lesen des Bündels
  (`checkBundle`) und noch einmal beim Planen des Schreibens (`planExtract`).
  Abgelehnt werden:
  - absolute Pfade (`/etc/passwd`) — `path_absolute`
  - `..` in jedem Segment, auch in der Mitte — `path_traversal`
  - Laufwerksbuchstaben (`C:…`) — `path_drive_letter`
  - UNC-Pfade (`//server/share`) — `path_unc`
  - Backslashes (im Bündel ist `/` der Trenner) — `path_backslash`
  - Null-Bytes — `path_nul_byte`
  - leere Segmente, abschließende Schrägstriche — `path_empty_segment`
  - reservierte Windows-Gerätenamen (`nul`, `con`, `com1`, …) — `path_segment_reserved_device`
  - Segmente mit abschließendem Punkt oder Leerzeichen — `path_segment_trailing_dot`
  - Segmentzeichen `<>:"|?*`
  - jeden Pfad, der den Zielordner rechnerisch verlassen würde — `path_escape`
  Jede dieser Ablehnungen hat einen eigenen Test in `tests/bundle.test.ts`.
- **Vollständige Prüfung vor jeder Schreibung.** „Fail closed" heißt hier
  konkret: ein Bündel wird gelesen, geprüft, in einen Nebenordner der Zielwurzel
  geschrieben, dort **Hash für Hash nachgerechnet** und erst dann je Unit
  umgeschoben. Scheitert ein Schritt, laufen die erledigten Schritte rückwärts,
  und die vorherige Fassung wird aus der Sicherung zurückgeschoben.
- **Digest, der sich nicht selbst enthält.** Der Bündeldigest geht über den
  Platzhalter, nicht über den fertigen Wert. Damit kann niemand ein Manifest so
  ändern, dass der Digest „wieder passt".
- **Herkunft als Datei im Unit.** Ein Import schreibt `.pmh-export.json` mit
  Bündeldigest, Inhaltsdigest, Quelle und Zeitstempel. Diese Datei wird beim
  Export **nie** mitgenommen — sonst wäre ein Re-Export nie byte-gleich.
- **Kein Netz, kein Code-Ausführen.** Dieses Paket liest, hasht, schreibt. Es
  führt kein Unit aus, das es importiert. Ein Plugin-Host ist nicht Teil dieses
  Pakets (siehe Grenzen).

---

## 6. Grenzen

Ehrlich, und in der Reihenfolge, in der es weh tut:

1. **Kein Plugin-Host.** §3.2 der Entscheidung nennt zwei Hälften:
   Export/Import über die Harness-API *und* einen Host, der ein Bündel lädt,
   einhängt und wieder absteckt. Dieses Paket deckt die **erste** Hälfte ab.
   `importBundle` legt den Ordner an; das Einhängen in einen Cordis-Bundle ist
   ein eigener Arbeitsschritt und steht noch aus.
2. **Keine Kompression, keine Signatur.** Ein Bündel ist unkomprimiert — bei
   einem Go-Dienst mit Binary ist das die Größe des Binaries plus Manifest.
   Es ist auch nicht **signiert**: der Digest beweist Unversehrtheit gegenüber
   dem Manifest, nicht die Identität des Absenders. Wer Bündel von Fremden
   annimmt, braucht eine Signatur, die es hier nicht gibt.
3. **Keine Versionierung über Zeit.** Ein Bündel trägt `format: 1`. Der Leser
   lehnt höhere Versionen ab (`bundle_format_version_unsupported`), statt zu
   raten. Eine Migrationskette wie beim Session-Format (v0→v4) gibt es hier
   noch nicht.
4. **Nur vier Spannen-Operatoren.** `satisfiesContract` kennt exakt, `^`, `~`,
   `>=`, `>`, `<=`, `<` und `*`. Keine `||`-Klauseln, keine Bereichs-Schnitte,
   keine `x`-Wildcards. Für die Verträge, die im Baum stehen, reicht das; mehr
   wird ausdrücklich nicht versprochen.
5. **Der Bündeldigest hängt am Zeitstempel.** Zwei Exporte desselben Units zu
   verschiedenen Zeitpunkten ergeben verschiedene Digests — das ist gewollt
   (das Manifest ist Teil des Inhalts), aber es heißt: für Vergleiche über Zeit
   ist der **Inhaltsdigest** die richtige Größe, nicht der Bündeldigest.
6. **`contract` ist eine Erweiterung.** `units/README.md` kennt nur
   `core: optional | required_core` — das sagt *ob* ein Core nötig ist, nicht
   *welcher*. §3.2 verlangt die Core-Vertragsversion, also liest dieses Paket
   das Feld `contract` (und `notes`, das alle acht vorhandenen `unit.json`
   benutzen, aber im README fehlt). Beide sind im Manifest-Modell als
   Erweiterung dokumentiert; fehlt `contract`, gilt der Host-Default, und ohne
   Host-Default ist der Vertrag **unbelegt** und wird als Befund gemeldet.
7. **Der Ordnername wird nicht erzwungen.** `units/README.md` sagt „entspricht
   dem Ordnernamen"; die vorhandenen Units halten das nicht ein
   (`native/atomicfs` trägt den Namen `pmh-atomicfs`). Deshalb ist eine
   Abweichung eine Warnung (`unit_name_directory_mismatch`), kein Fehler. Der
   **importierte** Ordner heißt immer wie das Unit.
8. **`units/` enthält noch kein Unit.** Der Rundlauf-Test (`tests/round-trip.test.ts`)
   soll laut Auftrag ein echtes Unit aus `units/` nehmen. Dort liegt aber nur die
   `README.md`: kein `units/<name>/unit.json`. Die Suche des Tests ist deshalb
   eine Kette — `units/`, dann `services/`, dann `native/` — und sie **sagt an**,
   woher sie genommen hat (`[unit-export] Rundlauf über …`). Sobald ein echtes
   Unit unter `units/` liegt, greift der Test es automatisch auf, ohne dass
   jemand den Test ändern muss; ein eigener Testfall hält diese Reihenfolge fest.
8. **Kein Entfernen, kein Rollback auf Befehl.** Ein Import kann eine vorhandene
   Fassung ersetzen (`--force`) und macht das mit Sicherung; ein Kommando
   „deinstalliere dieses Unit und stelle den vorherigen Stand wieder her" gibt
   es nicht.
9. **Symlinks werden nicht verfolgt.** `collectUnitFiles` nimmt reguläre Dateien
   und Verzeichnisse; ein Symlink auf eine Datei außerhalb wird nicht
   mitgenommen, und ein Symlink-Verzeichnis wird nicht betreten. Das ist die
   sichere Wahl, heißt aber: ein Unit, das bewusst über Symlinks aufbaut, wird
   unvollständig exportiert.
10. **Manifest-Feld `notes` wird nicht ausgewertet.** Es wandert mit, mehr nicht.
