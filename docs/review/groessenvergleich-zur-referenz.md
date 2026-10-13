# Warum unser Ordner kleiner ist als die Referenz — gemessen

> **Gemessen:** 13.10.2026, aus zwei Windows-Ordner-Eigenschaften des Betreibers
> plus eigener Zerlegung beider Bäume. Anlass der Frage: *„das sind ja verdammt
> wenig zu vergleichen, außer es wurde in dem Sinne improve — aber ich vermute mal
> nicht, dass es so ist."*
>
> **Die Vermutung trifft zu.** Es ist keine Verbesserung. Es ist **nicht gebaute
> Anwendung**.

## 1. Die beiden Zahlen aus den Screenshots

| | unser Projekt | Referenz (Basis) |
|---|---:|---:|
| Größe | **1,82 GB** | 8,81 GB |
| Dateien | **51.934** | 110.468 |
| Ordner | **6.375** | 18.270 |

**Der Unterschied ist 6,86 GB.** Die Zerlegung zeigt, wem er gehört — und er
verteilt sich auf **drei völlig verschiedene Ursachen**.

## 2. Ursache 1: der Paketspeicher (4,3 GB) — **kein Unterschied des Projekts**

| | unser Projekt | Referenz |
|---|---:|---:|
| `node_modules` gesamt | **792 MB** | **8.642 MB** |
| davon `.pnpm/` (Store) | — (Bun linkt direkt) | **8.642 MB** |
| unser größter Posten darin | `@deepseek-ai` **382 MB** | (im Store enthalten) |

**Was hier passiert.** Die Referenz benutzt **pnpm** mit einem
Content-Addressable-Store: jedes Paket liegt als Datei- und Hardlink-Kopie unter
`node_modules/.pnpm/`. Unser Projekt benutzt **Bun**, das bei `linker = "hoisted"`
direkt verlinkt.

**Das ist ein Unterschied des Werkzeugs, nicht des Projekts.** Dasselbe
`@deepseek-ai`-Paket kostet dort ein Vielfaches — allein wegen der Speicherform.
**Würde man nur diesen Posten vergleichen, wäre unser Projekt „besser" — und das
wäre eine sinnlose Aussage**, weil beide dieselben 245 Pakete benutzen.

**Teilweise echte Einsparung:** unser `node_modules` enthält nur **das, was wir
erklären** (`@deepseek-ai` 382 MB, `@rolldown` 58, `@typescript` 56, `@img` 56,
`node-pty` 27, `three` 19). Die Referenz hat den Store **aller** Pakete des
Monorepos, auch der ~230, die wir nicht benutzen.

## 3. Ursache 2: erzeugter Ballast in UNSEREM Baum (0,93 GB) — **echter Mangel**

| Posten | Größe | Was es ist |
|---|---:|---|
| `target/` | **731 MB** | **Rust-Buildartefakte** — 5.851 Dateien. Steht in `.gitignore`, ist aber auf der Platte |
| `website/` | **199 MB** | VitePress-Cache — **davon 2,8 MB versioniert**, obwohl er erzeugt ist |
| `apps/web/node_modules` | **110 MB** | eigene Abhängigkeiten der Oberfläche |
| `.bun-tmp` | 0,8 MB | Zwischenstände |

**`target/` ist der größte einzelne Posten unseres Baums — 731 MB für
Übersetzungszwischenstände von sechs Rust-Crates, die niemand aufruft**
([rust-bestand.md](rust-bestand.md)). **Erzeugter Code, der mehr Platz belegt als
das ganze Projekt an Quellcode hat (4,8 MB).**

## 4. Ursache 3: fehlende Umsetzung — **der eigentliche Grund**

Das ist der Posten, der die Frage beantwortet, **und die Vermutung des Betreibers
bestätigt**:

| | unser Projekt | Referenz |
|---|---:|---:|
| **Quellcode** in `packages/` + `services/` + `native/` + `apps/cli/src` | **112 Dateien · 1.420 KB** | **5.205 Dateien · 48.991 KB** |
| Davon unser Kern (`packages/`) | 81 Dateien · 0,8 MB | 245 Pakete |
| Applikationspakete | **14** | **245** |

**Unser Quellcode ist rund 46-mal kleiner als der Anwendungscode der Referenz**
(1,4 MB gegen 49 MB). Und was unser Projekt an Umfang **hat**, ist überwiegend
**fremder Inhalt**:

| Kategorie (versioniert) | Dateien | Größe |
|---|---:|---:|
| `docs/` (Vorlagen-Spiegel, 1.376 Dateien allein unter `docs/dsh`) | 1.461 | **56,0 MB** |
| `website/.vitepress/cache` (**erzeugt**, gehört nicht ins Repo) | 28 | 2,8 MB |
| `packages/` (**unser Kern**) | 81 | **0,8 MB** |
| `services/` (Go + Rust) | 62 | 0,5 MB |
| `native/` (Rust) | 33 | 0,3 MB |
| `apps/` (Host + Oberfläche) | 22 | 0,1 MB |
| `scripts/` | 11 | 0,1 MB |
| sonstige | 21 | 0,3 MB |

**56 MB von 61 MB versionierten Bytes sind Dokumentation** — und die stammt
überwiegend aus der Vorlage (`docs/dsh/`). **Unser eigener Code sind 1,4 MB.**

## 5. Wo die Referenz größer ist — und warum das fehlt

| Ordner | Referenz | unser Projekt | Was dort steckt |
|---|---:|---:|---|
| `packages/` | **215 MB** (19.540 Dateien) | 0,8 MB (81 Dateien) | der Anwendungskern: `client/` 89 MB, `experimental/` 42 MB, `api/`, `session/`, `extensions/` |
| `apps/` | 32,9 MB (1.885 Dateien) | 0,1 MB (22 Dateien) | `desktop/` 814 Dateien, `web/` 786 Dateien |
| `scripts/` | 4,7 MB (388 Dateien) | 0,1 MB (11 Dateien) | Werkzeuge der Vorlage |
| `python/` | 0,4 MB (53 Dateien) | **fehlt** | Python-Anteile — laut Projektregel **bewusst** nicht übernommen |
| `vendor/` | 1,5 MB (252 Dateien) | **fehlt** | eingebundener Fremdcode |
| `snapshots/` | 8,8 MB (1.562 Dateien) | **fehlt** | Vorlagen-Zustände |
| `patches/` | 0,5 MB (7 Dateien) | **fehlt** | Korrekturdateien für den Core |
| `benchmarks/` | 0,3 MB (51 Dateien) | **fehlt** | — |

**Das ist die Liste dessen, was nicht gebaut ist.** Kein einziger dieser Posten
ist dadurch kleiner, dass wir weniger brauchen — sie sind **nicht da**.

## 6. Die Antwort in vier Sätzen

1. **Es ist keine Verbesserung.** Unser Projekt ist kleiner, weil **245
   Applikationspakete gegen 14** stehen — unser Quellcode ist rund **46-mal
   kleiner** als der Anwendungscode der Referenz.
2. **Ein Teil des Unterschieds ist ein Werkzeugunterschied, kein Projektunterschied:**
   8,6 GB liegen im pnpm-Store der Referenz. Würde man das vergleichen, wäre das
   Ergebnis bedeutungslos — beide benutzen dieselben 245 Pakete.
3. **Und ein Teil ist echter Mangel auf unserer Seite:** 731 MB Rust-Buildartefakte
   (`target/`) und 2,8 MB versionierter VitePress-Cache. **Erzeugter Code belegt
   mehr Platz als unser gesamter Quellcode.**
4. **Was unser Projekt an Umfang hat, ist überwiegend fremde Dokumentation**
   (56 MB von 61 MB versionierten Bytes). Unser eigener Code: **1,4 MB**.

**Der Vergleich, der wirklich zählt:** 112 Quelldateien gegen 5.205. Das ist kein
Größen-, sondern ein **Fortschrittsmaß** — und es sagt, wie weit die Arbeit noch
geht.

## 7. Was daraus folgt

| # | Folgerung | Dringlichkeit |
|---|---|---|
| 1 | **Der Kern fehlt** — und genau deshalb ist „erst die Kette verdrahten, dann absichern" richtig. Der Vergleich bestätigt die Reihenfolge des Betreibers mit Zahlen | hohe |
| 2 | **`website/.vitepress/cache` gehört in `.gitignore`** — 28 Dateien erzeugter Code, die im Repo liegen. Ein kleiner, klarer Auftrag | mittlere |
| 3 | **`target/` (731 MB) ist Ballast von sechs Rust-Crates, die niemand aufruft.** Wer `pmh-crypto` und `pmh-pty` zurückzieht ([rust-bestand.md](rust-bestand.md)), spart auch hier | mittlere |
| 4 | **`docs/dsh/` mit 1.376 Dateien ist der größte Posten im Repo.** Das ist der Vorlagen-Spiegel — nützlich als Nachschlagewerk, aber er überdeckt die eigenen 1,4 MB in jeder Statistik. Ob er im Repo bleiben soll, ist eine **Entscheidung des Betreibers** | offen |

## 8. Was NICHT belegt ist

| Offen | Warum |
|---|---|
| Ob der pnpm-Store-Gewinn **netto** 4,3 GB beträgt | `target/` und `website/` liegen **in** unserem Baum; der Vergleich der Stores ist überschlägig, nicht auf die Datei genau |
| Wie viel die Referenz **ohne** `.pnpm` belegt | nicht gemessen — dafür müsste man den Store temporär auflösen |
| Ob `docs/dsh/` vollständig aus der Vorlage stammt | die Dateien liegen unter `docs/dsh/original` und `docs/dsh/translation_*`; die Zuordnung ist **plausibel, aber nicht geprüft** |
