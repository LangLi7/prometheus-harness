# Nachweis — Plugin-Export (t14)

> **Zweck:** der **belegte** Durchlauf, nicht die Behauptung. Jede Zeile nennt den Befehl und
> die Ausgabe. Gemessen am 13.10.2026, 00:2x, auf diesem Rechner.

## 1. Der Rundlauf: Export → Import → Rückexport

**Warum dreistufig und nicht zweistufig.** Ein Export, der ein Bündel erzeugt, und ein Import,
der es entpackt, beweisen noch nicht, dass **kein Inhalt verloren geht**. Der Beweis braucht
den **Rückexport**: erst wenn aus dem *importierten* Unit wieder ein Bündel entsteht, das
**denselben Digest** trägt, ist die Kette geschlossen. Ein Vergleich von Dateihashes allein
würde an Zeitstempeln scheitern — verglichen wird deshalb der **Inhalts-Digest** des Bündels.

### Schritt 1 — Export

```powershell
cd packages/units/unit-export
bun run src/cli.ts export --unit C:\Users\Chang\prometheus-harness\services\pmh-nix `
  --out $env:TEMP\pmh-t14-roundtrip\pmh-nix.pmhunit `
  --created-at 2026-10-13T00:00:00Z --core-version 0.2.1 --platform windows
```

```
exit=0
unit      pmh-nix 0.2.0
bundle    ...\pmh-t14-roundtrip\pmh-nix.pmhunit
digest    sha256:ac37e0ec2a21f1c8a48ab26963c6716cc8fcfeb015612ec257e4b03e993d3e38
content   sha256:84cef3f8ab80895e7f148d7d7126fa877622c8e2f04831479697481dabe604d0
closure   pmh-nix
files     20 (223508 Bytes)
```

### Schritt 2 — Import in eine frische Registry

```powershell
bun run src/cli.ts import --bundle ...\pmh-nix.pmhunit --into $env:TEMP\pmh-t14-roundtrip\registry `
  --core-version 0.2.1 --platform windows
```

```
exit=0
bundle    sha256:ac37e0ec2a21f1c8a48ab26963c6716cc8fcfeb015612ec257e4b03e993d3e38
into      C:\Users\Chang\AppData\Local\Temp\pmh-t14-roundtrip\registry
installed pmh-nix 0.2.0 -> ...\registry\pmh-nix (20 Dateien)
rolled    nein
```

### Schritt 3 — Rückexport aus dem importierten Unit

```powershell
bun run src/cli.ts export --unit ...\registry\pmh-nix --out ...\pmh-nix-re.pmhunit `
  --created-at 2026-10-13T00:00:00Z --core-version 0.2.1 --platform windows
```

```
exit=0
digest    sha256:ac37e0ec2a21f1c8a48ab26963c6716cc8fcfeb015612ec257e4b03e993d3e38   <- IDENTISCH
content   sha256:84cef3f8ab80895e7f148d7d7126fa877622c8e2f04831479697481dabe604d0   <- IDENTISCH
files     20 (223508 Bytes)
```

### Ergebnis

| Prüfung | Wert | Urteil |
|---|---|---|
| Bündel-Digest nach Export | `sha256:ac37e0ec…` | — |
| Bündel-Digest nach Rückexport | `sha256:ac37e0ec…` | **identisch** |
| Inhalts-Digest | `sha256:84cef3f8…` | **identisch** |
| Dateizahl / Größe | 20 / 223.508 B | **identisch** |

**Der Inhalt überlebt den Rundlauf unverändert.** Getrennt davon ist der **Dateihash des
Bündels** nicht stabil (`06A69695…` beim ersten Lauf) — das ist kein Mangel, sondern die
Folge der Provenienz-Metadaten (Erzeugungszeit) und ausdrücklich **nicht** das Vergleichsmaß.
Wer den Dateihash vergleicht, vergleicht Zeitstempel.

## 2. Herkunft (Provenance) — beim Import aufgezeichnet

`registry/pmh-nix/.pmh-export.json`:

```json
{
  "format": 1,
  "bundleDigest": "sha256:ac37e0ec2a21f1c8a48ab26963c6716cc8fcfeb015612ec257e4b03e993d3e38",
  "contentDigest": "sha256:84cef3f8ab80895e7f148d7d7126fa877622c8e2f04831479697481dabe604d0",
  "source": { "unit": "pmh-nix", "version": "0.2.0", "path": "...\\pmh-nix.pmhunit" },
  "createdBy": "@prometheus-harness/unit-export",
  "installedAt": "2026-10-12T22:19:15.714Z"
}
```

Damit ist nachvollziehbar, **woraus** ein installiertes Unit entstanden ist — Erzeuger,
Quellbündel und beide Digests. Das ist die Voraussetzung dafür, eine Weitergabe später
prüfen zu können.

## 3. Plugin-Host — Laden, Prüfen, Einhängen, Abstecken

**Der Bindungsbefund, der den Entwurf bestimmt.** Der Upstream-Harness hängt Plugins über
`PluginPackages` ein; dieses braucht den Laufzeit-Interzeptor
`node-addon-require-builtin`, der **unter Bun nicht ladbar** ist (gemessen:
`Unsupported/no-context`, `has_v8_context: false`; `docs/risks.md` §6).

**Der Weg dieses Hosts stützt sich nicht darauf:** der Einstiegspunkt wird über einen
**absoluten `file://`-URL-Pfad** dynamisch importiert. Kein Interzeptor, keine Umbiegung
bare Modulnamen, kein natives Addon. Zusätzlich:

| Eigenschaft | Umsetzung |
|---|---|
| **Whitelist** | nur Pfade innerhalb der erlaubten Wurzelverzeichnisse werden geladen (`isInside`) |
| **Native Addons werden abgewiesen** | `checkNativeAddons` prüft das rohe Manifest gegen eine Marker-Liste → `plugin-native-addon`, **fail-closed** |
| **Prüfen getrennt von Ausführen** | `prepare()` ist rein lesend; ein abgewiesenes Plugin wurde **nie** ausgeführt |
| **Abstecken in umgekehrter Reihenfolge** | ein Plugin, das auf einem früheren aufbaut, arbeitet nie gegen einen halb abgebauten Zustand |
| **Negativspur** | jede Abweisung landet mit Grund in `host.rejected` — was nicht eingehängt wurde, ist nachlesbar |

## 4. Verifikation

```
packages/units/unit-export
  bun run typecheck   -> exit 0
  bun test            -> exit 0 · 158 pass · 0 fail · 6 Dateien
```

## 5. Ein Fehlalarm, der zweimal auftrat — und was daraus folgt

Zweimal meldete ein Testlauf einen Fehlschlag (`checkBundle > lehnt ein verändertes Manifest
ab (H1)`), der isoliert und im sauberen Lauf **exit 0** ergab. Ursache: **paralleles Testen
während ein anderer Arbeiter dieselben Dateien schrieb.** In einem Fall lief die Suite,
während `errors.ts` um 00:06:57 und `plugin-host.test.ts` um 00:16:52 entstanden.

**Regel daraus:** Tests werden **nicht** parallel zu Schreibvorgängen auf denselben Dateien
ausgeführt. Ein Testergebnis über einen halbfertigen Stand ist kein Befund über den Code,
sondern über den Ablauf — und ein falsch gemeldeter Fehlschlag kostet mehr Zeit als das
Warten. Das gehört in die Arbeitsregeln, nicht nur in diesen Bericht.

## 6. Was dieser Nachweis **nicht** belegt

| Offen | Warum es zählt |
|---|---|
| **Plattform-Namensschema** | `unit.json` sagt `"windows"`, der Host meldet `process.platform` = **`win32`**. Der Export verweigert ohne `--platform windows`. Beide Bezeichner sind intern konsistent, aber **nicht ineinander übersetzt** — ein echter Befund, nicht kosmetisch. |
| **`contract`-Feld fehlte in 8 Units** | `native/atomicfs`, `crypto`, `flock`, `index`, `landlock-run`, `pty`, `pmh-sandbox`, `pmh-supervisor`. Behoben (Wert `>=0.2.0 <0.3.0`). Ursache war mein Versäumnis, nicht das Format — `contract` ist optional, aber **semantisch** relevant: ohne es ist die Core-Verträglichkeit unbelegt und der Export verweigert zu Recht. |
| Einhängen gegen den **echten** Core | Der Host wurde mit der eigenen Testfläche geprüft, nicht gegen einen laufenden Cordis-Kontext. Das ist der nächste Schritt, nicht dieser. |
| **`units/` enthält kein Unit** | Nur `README.md`. Der Rundlauf lief deshalb über `services/pmh-nix`. Ein echtes Unit unter `units/` wäre der wörtlichere Nachweis. |
