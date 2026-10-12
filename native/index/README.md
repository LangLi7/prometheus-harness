# `pmh-index` — Indizierung und Symbol-Extraktion (Rust)

> **Kein Gegenstück in der Vorlage** — Neubau (Mapping-Stufe **C**).
> **Mapping:** [`../../MAPPING.md`](../../MAPPING.md) §3.7 und §6.2
> **Doku-Grundlage:** [`../../docs/stack.md`](../../docs/stack.md) nennt „Parsing,
> Indizierung" ausdrücklich als Rust-Aufgabe; [`../../docs/vision.md`](../../docs/vision.md)
> braucht Projektbaum und Wissensnetz.

## Was es tut

Indiziert einen Quellbaum: pro Datei Pfad, Sprache, Größe, einen Änderungs-Digest und — auf
Wunsch — die gefundenen **Deklarationen**. Zusätzlich ein Filter auf einen Symbolnamen.

## Aufruf

```text
pmh-index tree    <root> [--depth <n>] [--symbols]
pmh-index symbols <root> [--name <identifier>]
pmh-index probe
```

Eine JSON-Zeile **pro Datei** auf stdout. Das hält die Ausgabe strömbar: der Kern kann einen
großen Baum verarbeiten, ohne den ganzen Index im Speicher zu halten.

| Ereignis | Zeile |
|---|---|
| Kopf | `{"event":"index","version":1,"root":"…","files":N,"skipped":M,"truncated":bool}` |
| Datei | `{"path":"…","language":"rust","bytes":N,"digest":"…","symbols":[…]}` |
| übersprungen | `{"event":"skipped","path":"…","reason":"…"}` |

| Exit-Code | Bedeutung |
|---|---|
| `0` | vollständiger Index |
| `1` | der Lauf wurde durch `MAX_FILES` begrenzt (`truncated: true`) — ein Aufrufer darf einen Teilindex nicht für vollständig halten |
| `125` | Fehler (stderr: JSON-Objekt) |

## Sprachen und Regeln

| Sprache | Endungen | Export-Erkennung |
|---|---|---|
| Rust | `.rs` | `pub `, `pub(crate) ` |
| TypeScript | `.ts .tsx .mts .cts` | `export …` |
| JavaScript | `.js .jsx .mjs .cjs` | `export …` |
| Go | `.go` | **Großbuchstabe am Anfang** (Go hat kein `export`) |
| C | `.c .h` | `static`/`extern`/`inline` werden als Modifier entfernt |
| Python | `.py` | `def`, `async def`, `class` (Dekoratoren verdecken sie nicht) |
| Markdown/JSON/YAML | — | keine Symbole, aber indiziert |

## Die Grenze, offen gesagt

Der Extraktor ist **lexikalisch, kein Parser**. Er erkennt Deklarationen an ihrem
Schlüsselwort und notiert die Zeilennummer. Er baut **keinen** Typgraphen, löst **keine**
Importe auf Dateien auf und wertet **keine** Makros aus.

Gründe für diese Grenze: ein lexikalischer Index ist schnell, hat keine
Grammatik-Abhängigkeiten, scheitert **nie** an syntaktisch ungültiger Eingabe und reicht für
Baumansicht und „wo ist das definiert". Ein semantischer Index bräuchte pro Sprache eine
Grammatik — eine viel größere Verpflichtung, die erst bei einem konkreten Feature dazugehören
sollte.

Was der Extraktor **garantiert**: er panikt nie bei kaputter Eingabe, liest nie außerhalb des
angefragten Roots, und meldet jede nicht lesbare Datei, statt sie stillschweigend zu
überspringen. **Ein Index, der seine eigenen Lücken verbirgt, ist schlechter als kein Index.**

### Bekannte Grenzen einzelner Sprachen

| Fall | Ergebnis | Warum |
|---|---|---|
| C: `int main(void) { … }` | **nicht** gemeldet | Eine C-Funktionsdefinition hat kein führendes Schlüsselwort; sie zu erkennen braucht einen echten Parser. Nichts zu melden ist besser als zu raten. |
| C: `typedef struct { … } point;` | **nicht** gemeldet | Der Name steht in einer späteren Zeile ohne Schlüsselwort. |
| C: `typedef int Count;` | `Count` | Der **abschließende** Name ist die Deklaration, nicht das Wort nach `typedef`. |
| C: `typedef unsigned long;` | nichts | `long` ist ein Typ-Schlüsselwort; es als Symbol zu melden würde eines erfinden. |
| Kommentare | werden übersprungen | Auch Block-Kommentare über mehrere Zeilen, damit auskommentierter Code nicht indiziert wird. |
| Binärdateien / ungültiges UTF-8 | keine Symbole, **kein Fehler** | Eine Binärdatei im Baum darf den Index nicht abbrechen. |

## Übersprungene Verzeichnisse

`node_modules`, `.git`, `target`, `dist`, `build`, `out`, `.venv`, `venv`, `__pycache__`,
`.next`, `.cache`, `.turbo`, `coverage`, `.svelte-kit`.

## Der Digest ist **keine** kryptografische Prüfsumme

Das `digest`-Feld ist **FNV-1a 64** (`fnv1a64:…`) und ausdrücklich nur zur
**Änderungserkennung** gedacht — schnell, ohne Abhängigkeit. Wer eine echte Prüfsumme
braucht, ruft [`pmh-crypto`](../crypto/) auf.

Die Verdopplung ist bewusst: `pmh-crypto` ist ein **Binary-Dienst**, und dessen Bibliothek in
einen anderen Dienst zu linken würde die Prozessgrenze verwischen, auf der dieser Port
aufbaut.

## Bauen und Testen

```powershell
cargo build -p pmh-index
cargo test  -p pmh-index
```

Von Hand:

```powershell
.\target\debug\pmh-index.exe probe
.\target\debug\pmh-index.exe tree . --depth 2
.\target\debug\pmh-index.exe symbols . --name SessionStore
```

## Tests

22 Unit-Tests: Symbolerkennung je Sprache, kommentierter Code wird übersprungen,
einzeilige Block-Kommentare verdecken die nächste Deklaration nicht, Go-Export über
Großbuchstaben, Python-Dekoratoren, alle C-Grenzfälle oben, Sprache ohne Regeln liefert
nichts statt Fehler, ungültiges UTF-8, sieben kaputte Quelltexte ohne Panik, Namensgrenzen
(kein führendes Zifferzeichen), Endungszuordnung, übersprungene Verzeichnisse, ein echter
Baum mit stabiler Reihenfolge, `--depth`-Begrenzung, fehlender Root als sauberer Fehler.

## Was noch fehlt

- **Keine Import-Auflösung.** „Wer benutzt dieses Symbol?" ist nicht beantwortbar.
- **Keine Inkrementalität.** Jeder Lauf liest alles neu; der Digest ist die Grundlage, aber
  ein Cache existiert nicht.
- **Kein Wissensgraph.** `docs/vision.md` will Verknüpfungen zwischen Dokumenten, Skills,
  Quellen und Modulen sichtbar machen. Dieser Index liefert die Knoten, nicht die Kanten.
- **`MAX_FILES` ist eine feste Zahl** (200 000), nicht konfigurierbar.
