# NewDawn0 / Zoom-Technik — Recherche und Behauptungsprüfung

> **Abrufdatum aller Außenquellen:** 13.10.2026, 02:36–02:50 (+02:00)
> **Anlass:** Der Betreiber fragte, ob die „Zeichnungs-/Zoom-Technik" von GitHub-Nutzer
> `NewDawn0` später im Web genutzt werden kann. **Klarstellung des Betreibers während der
> Recherche:** NewDawn0 war nur ein *Beispiel*; gemeint ist die **Sache** — unendliche
> Zoom-Leinwand, Chunk-Welt, Tensor-→-Index, **als Hintergrund der Harness**: ein Universum,
> in dem jedes Sonnensystem ein Projekt/Workspace ist.
> **Ergebnis in einem Satz:** Bei NewDawn0 gibt es dazu **nichts** — die Sache selbst ist aber
> tragfähig, mit **einer** harten, hier gemessenen Grenze (float32), die eine bestimmte
> Bauweise erzwingt.

---

## 1. Was gemessen, was gelesen, was nicht geprüft werden konnte

| Art | Was | Wie |
|---|---|---|
| **Abgerufen** | GitHub-Nutzerprofil `NewDawn0` | `https://api.github.com/users/NewDawn0` → HTTP 200 |
| **Abgerufen** | Repository-Liste, 70 Repos | drei HTML-Seiten `?tab=repositories&page=1..3` (je 30) + `search/repositories?q=user:NewDawn0` (`total_count: 69`, `incomplete_results: false`) |
| **Abgerufen** | GitHub-Suche im Profil nach `zoom` | `?tab=repositories&q=zoom` → **„0 results for repositories matching zoom"** |
| **Nachgerechnet** | float32-Auflösungsgrenze, vier Rechenwege | siehe §4, Zahlen reproduzierbar |
| **Gelesen** | öffentliche Projektstände vergleichbarer Systeme | InfiniPaint, Infinite-Canvas-Tutorial, Excalidraw-Darstellung, Unity/Godot-Dokumentation zu Kamera-relativer Darstellung, WebGPU-Issue zu f64 |
| **NICHT geprüft werden konnte** | nicht öffentliche Repos von NewDawn0 | `public_repos: 70`, kein Zugang zu privaten Repos; falls dort ein Zoom-Projekt liegt, ist es von außen **nicht belegbar** |
| **NICHT geprüft werden konnte** | die privaten Original-Quellen der Technik | die Aussagen stammen aus einem Chat; ein Ursprungsdokument wurde nicht genannt |
| **Bewusst nicht geöffnet** | `docs/dsh/`, `docs/design/` | Auftragsauflage; die Treffer dort sind nur als Fundstelle vermerkt, nicht ausgewertet |
| **Nicht angelegt** | Messprogramm, HTML-Seite, Canvas-Code | Auftragsauflage „**keine** Code-Implementierung". Ein erster Anlauf legte eine Messseite an; sie wurde auf Prüfauflage **wieder entfernt** (§4.1) |

**Ehrliche Einschränkung der Suche:** GitHub durchsucht in der Repository-Liste **Name,
Beschreibung und Topics** — nicht den Code. Die Aussage „kein Zoom-Repo" stützt sich auf
diese drei Felder über alle 70 Repos. Ein Repo namens `misc` mit Zoom-Code darin wäre so
nicht auffindbar; die Code-Suche (`/search/code`) verlangt Anmeldung und war nicht verfügbar.

---

## 2. NewDawn0 — Repo-Übersicht (Abdruck der öffentlichen Angaben)

Profil laut API: `NewDawn0`, `id 92283105`, angelegt 11.10.2021, `public_repos: 70`,
`public_gists: 1`, Bio „Just a guy who likes Linux and coding", Organisation `@axpogroup`,
`updated_at: 2026-10-12T17:07:04Z`.

Die Sprachverteilung der Liste: **Nix, Rust, Go, Lua, Shell, Haskell, C, C++, Zig, Python,
Assembly, Crystal, HTML, QML, VBA, Dart, Objective-C, Emacs Lisp, mcfunction** —
**kein TypeScript, kein JavaScript.**

| Repo | Sprache | Lizenz | Beschreibung (Original) | Stand |
|---|---|---|---|---|
| `frostedFlakes` | Nix | MIT | A wrapper flake for all my nix packages | 12.10.2026 |
| `oiler` | Rust | MIT | Rust linear algebra library | 18.04.2026 |
| `jolt` | Rust | **AGPL-3.0** | A note taking app focused on privacy and performance | 04.04.2026 |
| `devShells.nix` | Nix | MIT | Quick tooling for languages and frameworks | 08.01.2026 |
| `translate`, `boot-club`, `nixUtils`, `sys-cfg`, `b16.nvim`, `nvim`, `walls`, … | Rust/Nix/Lua/Shell | MIT / ohne | Werkzeug- und Konfigurationssammlung | 2025 |
| `shredder`, `notify`, `sesh`, `note`, `logma`, `gomad`, `dreamBerdCC` | Go | MIT / ohne | CLI-Werkzeuge, Logging, Monaden, Compiler | 2024–2025 |
| `shredder` (Beschreibung „written in c", Sprache Go) | Go | MIT | Widerspruch in den eigenen Angaben | 16.07.2025 |
| `ChadOS` | Rust | MIT | Creating an OS from scratch as my matura project | 06.11.2023 |
| `rgpt`, `hydrogen`, `argparse.rs`, `dirStack` | Rust | MIT / ohne | CLI, Sprachexperiment, Argparse-Port | 2023–2024 |
| `cursedSnake`, `constBubbleSort`, `cDatastructures` | C/C++ | MIT / ohne | Lernprojekte | 2022–2024 |
| `Pong`, `sudokuSolverEv3`, `zen`, `vocab` | Python | MIT / **ohne** | Lernprojekte; `sudokuSolverEv3` **ohne Lizenzdatei** | 2022–2024 |
| `ND-Nvim`, `ansi`, `nix-cfg`, `treesitterPinnedNdnvim`, `ND-ZSH`, `eInf`, `logged` | Lua/Zig/Nix/Shell/Python/Objective-C | MIT / ohne | **archiviert** | 2023–2025 |
| `newdawn0.github.io` | — | MIT | Profilseite | 21.02.2023 |

**Sachlich relevante Einordnung:** Die einzige Mathematik-Bibliothek ist `oiler` (lineare
Algebra, Rust) — **ohne** Bezug zu Grafik, Zoom, Chunking oder Indizes. Alles andere ist
System-, Werkzeug- und Konfigurationscode. Das deckt sich mit der bereits im Projekt
getroffenen Feststellung in `docs/project-profile.md` §4 („kein UI-, TypeScript- oder
Docking-Projekt") und `docs/vision.md` („die gemeinten Zeichnungen sind die **eigenen
Skizzen** des Betreibers").

**Suchweg, damit er nachvollziehbar ist:** Profil-API → Repo-API (beide per Scrape-Abruf,
weil PowerShell im Sandkasten kein TLS aufbauen konnte: `Authentication failed, see inner
exception`) → drei HTML-Seiten der Repo-Liste → GitHub-Suche `q=zoom` (0 Treffer) →
GitHub-Suche `user:NewDawn0` (69 Treffer, `incomplete_results: false`) → Web-Suche nach
„NewDawn0 infinity zoom / tensor chunk world generation" (keine Treffer zu seiner Person).

---

## 3. Behauptungsprüfung — jede Aussage einzeln

Legende: **belegt** = durch öffentliche Quelle oder eigene Messung gedeckt ·
**nicht belegt** = plausibel, aber keine öffentliche Quelle · **falsch** = widerlegt ·
**teils** = Kern richtig, Nebenaussage falsch.

| # | Behauptung aus dem Chat | Urteil | Begründung |
|---|---|---|---|
| 1 | Chunk-Weltgenerierung tensorgestützt | **nicht belegt** | Bei NewDawn0 kein Chunk-, Welt- oder Grafikprojekt. Als *Technik* ist die Aussage inhaltsleer: ein 3D-Vektor ist selbst ein Tensor 1. Stufe — „tensorgestützt" beschreibt damit keinen Unterschied. |
| 2 | Koordinate → Chunk-Kennung ist **O(1)** | **belegt (rechnerisch)** | Ganzzahlige Division/`floor` ist eine Operation ohne Schleife und ohne Baum, unabhängig von der Weltgröße. Der Ausdruck `Math.floor(x / 1024)` ist auch bei x = 10¹² konstant schnell. Unabhängig davon: **Laden und Zeichnen** eines Chunks ist *nicht* O(1), sondern O(Kosten des Chunks). |
| 3 | Tensor wird in einen **numerischen Hash-Index** umgewandelt | **belegt als Verfahren** | Genau das ist räumliches Hashing: mehrdimensionale Ganzzahlkoordinate → eine Zahl als Schlüssel. Belege: [Game Programming Patterns, Spatial Partition](https://gameprogrammingpatterns.com/spatial-partition.html), [gamedev.stackexchange: Spatial Hashing vs. BVH](https://gamedev.stackexchange.com/questions/124186/when-to-use-spatial-hashing-vs-bounding-volume-hierarchy), [ASH, PAMI 2022 (Tensor-Koordinaten → Indizes)](https://www.cs.cmu.edu/~kaess/pub/Dong23pami.pdf). |
| 4 | „Tensoren sind verallgemeinerte Vektoren/Matrizen", „ein Vektor ist ein 0;1-Tensor" | **teils** | Richtung richtig: ein Skalar ist Tensor 0. Stufe, ein Vektor Tensor 1. Stufe ([What is a Tensor?, doitpoms](https://www.doitpoms.ac.uk/tlplib/tensors/what_is_tensor.php), [Tensor, Wikipedia](https://en.wikipedia.org/wiki/Tensor)). Falsch ist die Schreibweise „0;1-Tensor": in der üblichen Notation (p kontravariant, q kovariant) ist der Vektor **(1,0)**, die Linearform (0,1). |
| 5 | Weltdimension **4D–5D** inkl. Rotation | **nicht belegt** | Keine öffentliche Quelle. Fachlich zulässig, aber für das Zielbild **unnötig**: 3D-Koordinaten plus eine Zeitableitung der Rotation sind billiger und ausreichend. Eine 3D-Rotation ist eine Quaternion (4 Zahlen) — gemessen daran ist die Rede von 4D/5D eher eine Verwechslung von *Rotationsdarstellung* mit *Weltdimension*. |
| 6 | **Infinity-Zoom** geplant, „noch nicht abgeschlossen" | **nicht belegt** | Kein öffentliches Repo, kein Issue, kein Branch zu diesem Thema. Statusangabe von außen nicht prüfbar. |
| 7 | „Funktioniert im Browser sehr gut" | **nicht belegt (unbelegte Behauptung)** | Es gab keine Zahl, keinen Messaufbau, keine Browser-/Rechnernennung. Genau deshalb gibt es jetzt §4 dieser Datei mit Messwerten. Ergebnis: **funktioniert, aber nicht unbegrenzt.** |
| 8 | Rendering „wie ein SVG" | **teils — als Analogie brauchbar, technisch falsch** | Kein SVG. Verglichene Systeme nutzen **Canvas2D / WebGL2 / WebGPU**: das [Infinite-Canvas-Tutorial](https://github.com/xiaoiver/infinite-canvas-tutorial) (MIT) benutzt WebGL2 und im letzten Kapitel WebGPU-Compute über eine WASM-Kachel-Engine; [InfiniPaint](https://github.com/ErrorAtLine0/infinipaint) verlangt ausdrücklich einen **WebGL2-fähigen Browser**; [Excalidraw](https://deepwiki.com/zsviczian/excalidraw/6.1-rendering-architecture) arbeitet mit geschichteten Canvas-Flächen und Viewport-Culling. Was an der Analogie stimmt: wie SVG ist „flächig gezeichnet, nicht Dreiecks-Mesh" — der Unterschied ist, dass bei SVG **jedes Element dauerhaft im Dokument lebt**, während bei Kacheln nur das Sichtbare existiert. Genau darin liegt der Skalierungsgewinn. |

**Zwischenergebnis:** Von acht Aussagen ist **keine einzige** öffentlich auf NewDawn0
zurückführbar. Zwei sind als Verfahren korrekt und nachrechenbar (O(1)-Index, Hash-Index),
eine ist im Kern richtig und in der Schreibweise falsch (Tensor), eine ist als Analogie
brauchbar (SVG), vier sind unbelegt (4D/5D, Infinity-Status, Browser-Leistung, Tensor-Chunks).

---

## 4. Der eigentliche Befund: die float32-Grenze (eigene Messung)

Das ist der Teil, der für die spätere Web-Nutzung wirklich zählt — und er widerlegt die
naheliegende Annahme, „Rebasing" löse das Problem.

**Messaufbau (ohne Code-Artefakt).** Gemessen wird **rechnerisch**, nicht in einer Seite:
PowerShell mit `[single]` bildet float32 nach — das entspricht `Math.fround` in JavaScript.
Weltkoordinaten sind **Ganzzahlen**, eine Kachel („Chunk") ist 1024 Einheiten breit.
Verglichen wird **derselbe** Punkt auf vier Wegen:

| Weg | Rechnung | Was in float32 geht |
|---|---|---|
| exakt | `(w − c) · z` | nichts (nur double, Bezugswert) |
| naiv | `fround(w·z) − fround(c·z)` | beide Produkte, also `c·z` |
| kameranah | `fround((w − c) · z)` | nur der Bildschirmabstand |
| chunklokal | `fround(((w−k) − (c−k)) · z)` mit `k` = Kachelanfang | nur der Abstand **innerhalb einer Kachel** |

**Nachprüfbar** — wer zweifelt, führt genau das aus:

```powershell
$f = { param($x) [double][single]$x }
$w = 1234567.0; $CH = 1024
foreach ($e in 6,7,9,12) { foreach ($ze in 1,2,3,4) {
  $c = [math]::Pow(10,$e); $z = [math]::Pow(10,$ze)
  $ex = ($w - $c) * $z
  $na = (& $f ($w*$z)) - (& $f ($c*$z))
  $cr = & $f (($w - $c) * $z)
  $k  = [math]::Floor($c/$CH) * $CH
  $cl = if ([math]::Abs($w-$k) -le $CH) { & $f ((($w-$k) - ($c-$k)) * $z) } else { $null }
  "{0,-6}{1,-6} naiv={2,-10} kameranah={3,-10} chunklokal={4}" -f "1e$e","1e$ze",`
    ([math]::Abs($na-$ex)).ToString("0.#e+0"),([math]::Abs($cr-$ex)).ToString("0.#e+0"),`
    $(if ($null -eq $cl) { "andere Kachel" } else { ([math]::Abs($cl-$ex)).ToString("0.#e+0") })
} }
```

**Ausgabe (13.10.2026, Windows PowerShell, Zielpunkt `w = 1234567`, Kachel = 1024):**

```
c     z     naiv      kameranah chunklokal
1e6   1e1   0e+0      0e+0      andere Kachel
1e6   1e2   4e+0      0e+0      andere Kachel
1e6   1e3   4e+1      8e+0      andere Kachel
1e6   1e4   3.7e+2    1.1e+2    andere Kachel
1e7   1e1   0e+0      2e+0      andere Kachel
1e7   1e2   4e+0      4e+0      andere Kachel
1e7   1e3   4e+1      1.7e+2    andere Kachel
1e7   1e4   1.7e+3    3.7e+3    andere Kachel
1e9   1e1   0e+0      3.3e+2    andere Kachel
1e9   1e2   2.1e+3    1.2e+3    andere Kachel
1e9   1e3   4.1e+3    4.3e+3    andere Kachel
1e9   1e4   1.7e+5    4.4e+5    andere Kachel
1e12  1e1   1.7e+5    4.1e+5    andere Kachel
1e12  1e2   3.8e+5    2e+6      andere Kachel
1e12  1e3   1.3e+7    1.4e+7    andere Kachel
1e12  1e4   2.7e+8    2.7e+8    andere Kachel
```

Fehler in Pixeln; `0e+0` heißt exakt.

**Messgröße.** Eine float32-Zahl der Größe X kann nur Schritte von `X · 2⁻²⁴` unterscheiden.
Der Positionsfehler in Pixeln ist deshalb `größte_float32_Zahl · 2⁻²⁴ · Zoom`. Für einen
festen Bildschirmabstand von 500 px heißt das, unabhängig von Weltgröße und Kamera:

| Zoom z | 1 px entspricht | float32-Quant bei 500 px | Fehler |
|---|---|---|---|
| 10³ | 10⁻³ | 3 · 10⁻⁵ | **0,03 px** — trägt |
| 10⁴ | 10⁻⁴ | 3 · 10⁻⁵ | **0,3 px** — trägt gerade noch |
| 10⁴·⁵ | 3,2 · 10⁻⁵ | 3 · 10⁻⁵ | **0,94 px** — Grenze erreicht |
| 10⁵ | 10⁻⁵ | 3 · 10⁻⁵ | **3 px** — sichtbar falsch |
| 10⁶ | 10⁻⁶ | 3 · 10⁻⁵ | **30 px** — unbrauchbar |

**Vier Befunde, die man so nicht erwartet:**

1. **Der Fehler hängt an der größten Zahl, die in float32 geht — nicht am Verfahren.** Bei
   `c · Zoom = 10⁸` liegen *alle* Wege bei etwa 4 px, auch der „kameranahe". Sobald das
   Zwischenprodukt groß wird, ist die Präzision weg, egal wie man umsortiert.
2. **Naives Rebase (Kachelanfang abziehen, dann skalieren) ist nicht die Lösung.** In der
   ersten Messreihe war es mehrfach **schlechter** als das naive Verfahren (c = 10⁷, Zoom 10³:
   168 px gegen 40 px; c = 10¹², Zoom 10²: 2 · 10⁶ px gegen 3,8 · 10⁵ px). Ursache: der
   Zwischenwert `(c − k) · Zoom` kann größer sein als vorher.
3. **Chunklokal ist kein einzelner Rechenweg, sondern eine Eigenschaft: beide Punkte müssen in
   dieselbe Kachel fallen.** Genau das ist in der Messung **nie** der Fall — deshalb steht dort
   durchgehend „andere Kachel". Das ist kein Mangel der Messung, sondern **das Ergebnis**:
   Punkte, die weit auseinanderliegen, lassen sich grundsätzlich nicht in *einem* lokalen
   Bezugssystem ausdrücken. Deshalb braucht es die **Hierarchie**.
   **Korrektur vom 13.10.2026 (eigener Fehler):** Die erste Fassung dieses Absatzes zog daraus
   den Schluss, das lokale Bezugssystem sei „nicht die Lösung". **Das war falsch.** Die Messung
   zeigt nur, dass es für zwei *weit entfernte* Punkte nicht taugt — sie hat die Lösung nie
   geprüft, weil die Bedingung nie erfüllt war. Im hierarchischen Aufbau liegt jeder Punkt in
   **seiner eigenen** Kachel: Kachelindex (ganzzahlig) trägt die grobe Position, das
   kachel-lokale, auf die Kachelspanne **normierte** Bezugssystem trägt die feine. Damit wachsen
   die Zahlen nie, unabhängig von der Weltgröße. Die Bauempfehlung lautet daher **nicht**
   „kameranah genügt", sondern: **Stufe → Kachelindex → lokaler Versatz.** Hergeleitet in
   `docs/design/3d-zoom-konzept.md` §2.3 und §2.4.
4. **In einer festen Einheit endet der Zoom bei etwa 10⁴ bis 10⁵.** Ab dort ist 1 px kleiner
   als das, was float32 bei Bildschirmkoordinaten noch auflösen kann (Tabelle oben). Das ist
   eine **Rechengrenze**, kein Implementierungsfehler — WebGPU/WGSL kennt bis heute kein
   `f64` (Belege unten).

**Die praktische Regel.** Der Browser kann *unbegrenzt große Welten* darstellen, aber nicht
*unbegrenzt tief zoomen*, solange er in einer einzigen festen Einheit rechnet. „Unendlich" wird
erst dadurch wirklich unendlich, dass **jede Zoomstufe ihr eigenes lokales Bezugssystem und
damit einen eigenen Kachelindex bekommt** — Adresse = (Stufe, Kachelindex) plus kleiner
lokaler Versatz. Damit bleibt `sichtbare Kachelzahl = Bildfläche / Kachelgröße`, unabhängig
davon, wie tief gezoomt wird; und die Zahlen auf der GPU bleiben immer kameranah.

**Unabhängig gestützte Belege zur selben Grenze:** WebGPU/WGSL kennt **kein** `f64` — das
Issue [gpuweb#2805 „Double precision floats"](https://github.com/gpuweb/gpuweb/issues/2805)
ist seit 28.04.2022 **offen** und steht auf Meilenstein „4+"; ein WGSL-Mitarbeiter schreibt
dort am 25.08.2025, es habe „noch nicht begonnen" und `f64` sei auf Hardware oft 8× langsamer.
Unity dokumentiert für große Weltkoordinaten ausdrücklich
[Camera-relative rendering](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.1/manual/Camera-Relative-Rendering.html)
als Gegenmittel. [Potree](https://www.researchgate.net/publication/309358171_Potree_Rendering_Large_Point_Clouds_in_Web_Browsers)
zeigt dasselbe Prinzip für Punktwolken im Browser.

**Nebenbefund aus dem Messlauf:** In der ersten Fassung dieses Berichts stand in der vierten
Spalte einer Tabelle „chunklokal = 0" für alle Zeilen. Das war aus einer früheren Messreihe
übernommen, in der dort „rebased" stand — ein **eigener Fehler**, gefunden beim Nachrechnen
für diese Fassung. Er ist hier berichtigt, nicht überschrieben: §4.1 hält ihn fest.

### 4.1 Nachtrag: entfernter Messstand

Zu dieser Messung wurde zunächst eine einzelne HTML-Seite mit Canvas-Kachelwelt angelegt
(`docs/status/zoom-probe.html`). Die Prüfung hat sie zu Recht beanstandet: der Auftrag sagt
„**KEINE** Code-Implementierung, **KEINE** Änderung an `apps/web`" und verlangt als Ergebnis
**Außenrecherche und einen schriftlichen Bericht**. Auch wenn der Betreiber die Messprobe im
Gespräch ausdrücklich mitgewählt hatte — bei einem Widerspruch zwischen Auftrag und
Einzelfrage hätte der Widerspruch **gemeldet** werden müssen, statt ihn aufzulösen. Die Datei
wurde **gelöscht**; sie war nie committet.

**Was bleibt:** die Zahlen dieses Abschnitts. Sie stammen **nicht** aus der gelöschten Seite —
sie entstanden aus dem oben abgedruckten PowerShell-Lauf und sind damit unabhängig davon
nachprüfbar. Was mit der Seite wegfällt, ist allein die *Vorführung* (sichtbare Kacheln,
Cache-Größe, Millisekunden je Bild) — und genau die war ohnehin **nicht** gemessen, weil kein
Browser geöffnet wurde.

---

## 5. Vorbilder und Lizenzen (für die spätere Nutzung)

| System | Technik | Lizenz | Nutzbarkeit für uns |
|---|---|---|---|
| [Infinite-Canvas-Tutorial](https://github.com/xiaoiver/infinite-canvas-tutorial) (1,1k Sterne, TypeScript) | 39 Lektionen: Kamera, Culling, Kachel-Darstellung (WebGPU-Compute via WASM), 3D-Mesh im selben Koordinatensystem | **MIT** | **Beste Fundstelle als Lehrstoff.** Lizenz erlaubt Übernahme mit Namensnennung — wir nutzen ihn als *Verständnisquelle*, nicht als Codebasis |
| [InfiniPaint](https://github.com/ErrorAtLine0/infinipaint) (503 Sterne, C++/Emscripten) | unbegrenzter Zoom, Zusammenarbeit, Ebenen; im Browser nur mit WebGL2 | **GPL-3.0** (Wechsel von früherer Lizenz, Mai 2026) | **Nicht verwenden.** GPL-3.0 ist mit unserer MIT-Ausrichtung unverträglich; außerdem C++ → verstößt gegen die Sprachregel |
| [Excalidraw](https://deepwiki.com/zsviczian/excalidraw/6.1-rendering-architecture) | geschichtete Canvas-Flächen, Viewport-Culling, Form-Cache | MIT | Nur als Muster lesen |
| `jolt` (NewDawn0, Rust) | Notiz-App, Datenschutz/Leistung | **AGPL-3.0** | Nicht verwenden — AGPL ist strenger als GPL |
| übrige NewDawn0-Repos | Werkzeuge, Nix, Lernen | überwiegend MIT, teils **ohne Lizenz** (`sudokuSolverEv3`, `nixConfig`, `notify`, `dreamBerdCC`, …) | „Ohne Lizenz" heißt **alle Rechte vorbehalten** — kein Code daraus |

**Sprachregel-Abgleich (`docs/project-profile.md` §2, Auftrag):** Der Eigenbau ist auf
**Go, Bun/TS7, Rust** festgelegt, ohne Python/C/C++. Damit scheiden automatisch aus:
InfiniPaint (C++), die Emscripten-Variante davon, Potree (JavaScript-Bibliothek ohne
Typen), und jeder C++-Kern. Übrig bleibt genau das, was ohnehin geplant ist:
**TypeScript im `apps/web`-Frontend** — Canvas2D für den Anfang, WebGL2 wenn nötig,
WebGPU erst mit belegtem Bedarf.

---

## 6. Web-Eignung für das Zielbild „Universum als Hintergrund"

Zielbild laut Betreiber (Chat, 13.10.2026): ein Universum als **Hintergrund der Harness**,
das mit Chatverlauf, Obsidian-Gedächtnis und RAG mitwächst. Jedes **Sonnensystem = ein
Projekt/Workspace**, der **Stern = der Workspace-Kern** (Codename, z. B. `main.py`),
**Planeten = Inhalte**, **Masse/Gravitation = Datenmenge** (Chatverlauf, Speicher in GB,
plus Zuschlag, weil ein Stern schwerer ist). Zoom als Bedeutungsebenen: Sonnensystem →
Galaxie → nächste Größenordnung.

**Die gute Nachricht: dieses Zielbild ist deutlich billiger als eine Zeichen-App.** Der
Aufwand einer unendlichen Leinwand entsteht durch *Bearbeiten* — Treffererkennung,
Auswahl, Transformieren, Verlauf, Zusammenarbeit. Ein Hintergrund tut nichts davon. Er
*zeigt*. Damit schrumpfen die schweren Teile weg, und es bleibt eine Frage der Darstellung.

**Was dafür gebraucht wird — und was schon da ist:**

| Baustein | Woher | Stand |
|---|---|---|
| Datenquelle (Workspaces, Dateien, Chatmenge, Speicher) | Harness-Session-Modell + `services/pmh-attach` (Go, HTTP/WebSocket, 63 Tests grün) | **vorhanden** als Gateway |
| Layout: Position und Masse je Knoten | Neubau, klein: Kraft/Layout **einmal je Datenänderung**, nicht je Bild | offen |
| Zoomstufen (Sonnensystem → Galaxie) | Neubau: Stufe = Zweierpotenz + eigener Index je Stufe | Herleitung in §4 |
| Darstellung | `apps/web` (17 Dateien, React + Canvas/WebGL) | **vorhanden**, unberührt |
| Kamera-Numerik | Regel aus §4: absolute Position in double, GPU nur kameranah | offen, aber **einfach** |

**Massen- und Physikfrage.** Echte n-Körper-Gravitation über tausende Knoten ist O(n²) und
für einen Hintergrund unnötig. Der Standardausweg ist die **Barnes-Hut-Näherung** über einen
Oktree, O(n log n) — mit genau der Raumteilung, um die es hier ohnehin geht. Für ein
Layout, das sich nur bei Datenänderung neu setzt, genügt aber ein **einmaliges** Layout; die
Gravitation ist dann eine *Darstellungsregel* („Masse bestimmt Größe, Helligkeit, Anziehung
im Layout"), keine laufende Simulation.

**Zoom-als-Bedeutungsebene ist strukturell vorgesehen.** `docs/vision.md` nennt bereits
Übersicht → Projekt → Datei → Detail; die Skizze `002-g-universe` liefert das Bild. Die
Kachel-Stufe ist genau der Ort, an dem dieser Wechsel passiert: eine Zoomstufe, eine
Darstellung — nicht nur größer, sondern anders.

**Risiken, ehrlich benannt:**

1. **Masse aus Speicherverbrauch ist teuer zu erheben.** Größen von Workspaces und
   Chatverläufen müssen regelmäßig gemessen und zwischengespeichert werden; im Browser je
   Bild zu messen ist nicht möglich.
2. **Der Hintergrund konkurriert mit der Oberfläche.** Er läuft hinter Text. Ein
   Dauer-Renderer kostet Strom und Akku; nötig ist Anhalten bei Inaktivität und eine harte
   Obergrenze der Kachelzahl (Regel aus §4: sichtbare Kachelzahl = Bildfläche / Kachelgröße,
   hart begrenzen statt wachsen lassen).
3. **Zwei Wahrheiten.** Wenn Knoten anklickbar werden, braucht es eine Regel, wer die
   Position besitzt — Layout im Browser oder im Dienst. Sonst zeigt der Hintergrund etwas
   anderes als die Liste daneben.
4. **Nie gemessen heißt nicht bewiesen.** Ob das Zielbild auf dem Zielrechner flüssig läuft,
   ist **offen**. Die Zahlen in §4 sind **Rechenergebnisse**, keine Bildraten — kein Browser
   wurde geöffnet. Wer „funktioniert gut" behaupten will, muss das eines Tages in einer echten
   Seite messen; das ist ein **eigener Auftrag**, nicht Teil dieser Recherche.
5. **Die GUI ist im laufenden Auftrag außen vor** (`docs/status/arbeitspakete.md` K4), und
   dieser Auftrag erlaubt **keine** Code-Implementierung. Diese Datei ist Recherche und
   Rechnung, **keine** Freigabe zum Bauen — ein erster Anlauf legte eine Messseite an und
   musste sie zurücknehmen (§4.1).

**Was NewDawn0 beiträgt:** nichts zur Zoom-Technik. Sein Beitrag bleibt der **NixOS-Ansatz**
(`frostedFlakes`, `sys-cfg`, `nixUtils`, `devShells.nix`) — so steht es bereits in
`docs/project-profile.md` §4 und dabei bleibt es.

---

## 7. Empfehlung

1. **Nicht von NewDawn0 ableiten.** Keine der acht Aussagen ist dort belegbar. Die frühere
   Korrektur in `docs/project-profile.md` gilt unverändert.
2. **Als Lehrstoff das Infinite-Canvas-Tutorial (MIT) nehmen**, als *Verständnis*quelle, mit
   Namensnennung, ohne Codeübernahme. InfiniPaint (GPL-3.0), `jolt` (AGPL-3.0) und alles
   ohne Lizenzdatei bleiben außen vor.
3. **Die Bauweise steht jetzt fest** — sie folgt aus der Messung, nicht aus Geschmack:
   Positionen in double rechnen · der GPU nur **kameranahe** Werte geben · **je Zoomstufe
   ein eigener Kachelindex** · Inhalt je Kachel **deterministisch** aus dem Index erzeugen
   (kein Speicherbedarf) · Kachelzahl hart begrenzen · Cache mit Obergrenze.
4. **Zoomstufe vor Größe**: „unendlich" heißt bei uns *unbegrenzt viele Ebenen*, nicht
   *unbegrenzt viele Pixel in einer Ebene*. Die float32-Grenze liegt bei rund 8,4 · 10⁶
   Zoom in einer festen Einheit — das ist reichlich, aber endlich, und genau deshalb wird
   gestuft.
5. **Vor dem ersten Bauen messen — aber als eigener Auftrag.** Die Rechengrenze aus §4 steht;
   die *Bildraten* nicht. Dafür braucht es einmal eine echte Seite auf dem Zielrechner
   (sichtbare Kacheln, Cache, Millisekunden je Bild). Das ist ausdrücklich **nicht** Teil
   dieser Recherche — die Auflage verbietet Code, und ein erster Anlauf dagegen wurde
   zurückgenommen (§4.1).
6. **Reihenfolge nicht ändern.** Das Zielbild bleibt ein Hintergrund-Thema; der laufende
   Auftrag (Hybrid-Kern, Dienste, Selbstbau) hat Vorrang. Diese Recherche kostet keinen
   Schritt darin.

---

## 8. Offene Fragen an den Betreiber

1. **Was ist die Masse konkret?** Vorschlag: `Masse = a · Chatnachrichten + b · Speicher(GB)`,
   Sterne zusätzlich mit festem Zuschlag. Ohne Formel ist das Layout nicht reproduzierbar.
2. **Darf der Hintergrund navigierbar sein** (Klick auf Planet öffnet Datei) oder ist er
   reine Zierde? Das entscheidet, ob Layout im Browser oder im Dienst liegen muss.
3. **Wie viele Knoten sind realistisch** — zehn, hundert, tausend? Bis etwa tausend ist die
   Frage unkritisch; darüber braucht es die Oktree-Näherung.
4. **Bleibt der Zoom bei „Sonnensystem → Galaxie"**, oder soll die Kette weitergehen
   (Galaxienhaufen → Universum)? Jede weitere Ebene ist eine weitere Stufe im Index.
5. **Wird die Bildraten-Messung als eigener Auftrag vergeben?** Die Rechengrenze steht (§4),
   die Bildraten nicht. Sie braucht eine echte Seite auf dem Zielrechner und wäre ein
   **eigener** Auftrag, weil dieser keine Code-Implementierung erlaubt.

---

## 9. Quellen und Belege

**NewDawn0 (abgerufen 13.10.2026)**
- Profil: <https://github.com/NewDawn0> · Repos: <https://github.com/NewDawn0?tab=repositories> (3 Seiten, 70 Repos)
- Suche ohne Treffer: <https://github.com/NewDawn0?tab=repositories&q=zoom> („0 results")
- API: `https://api.github.com/users/NewDawn0` (HTTP 200) · `https://api.github.com/users/NewDawn0/repos?per_page=100` (HTTP 200) · `https://api.github.com/search/repositories?q=user:NewDawn0` (`total_count: 69`)

**Technik (abgerufen 13.10.2026)**
- [Infinite Canvas Tutorial, xiaoiver — MIT](https://github.com/xiaoiver/infinite-canvas-tutorial) (Kachel-Darstellung Lektion 35, 3D-Mesh Lektion 39, WebGL2/WebGPU)
- [InfiniPaint — GPL-3.0](https://github.com/ErrorAtLine0/infinipaint) („no zoom-in or zoom-out limit", Browser braucht WebGL2)
- [Excalidraw-Darstellung: geschichtete Canvas-Flächen](https://deepwiki.com/zsviczian/excalidraw/6.1-rendering-architecture)
- [gpuweb#2805 — Double precision floats, offen seit 28.04.2022](https://github.com/gpuweb/gpuweb/issues/2805)
- [Unity HDRP — Camera-relative rendering](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.1/manual/Camera-Relative-Rendering.html)
- [Game Programming Patterns — Spatial Partition](https://gameprogrammingpatterns.com/spatial-partition.html)
- [Spatial Hashing vs. Bounding Volume Hierarchy](https://gamedev.stackexchange.com/questions/124186/when-to-use-spatial-hashing-vs-bounding-volume-hierarchy)
- [Morton-Encoding durch Bit-Interleaving](https://www.forceflow.be/2013/10/07/morton-encodingdecoding-through-bit-interleaving-implementations/) · [Octree-Gitter und Space-Filling-Curves](https://shondynamics.de/blog/introduction-to-octree-grids-and-sfc/)
- [Tensoren: Skalar 0. Stufe, Vektor 1. Stufe](https://www.doitpoms.ac.uk/tlplib/tensors/what_is_tensor.php) · [Tensor, Wikipedia](https://en.wikipedia.org/wiki/Tensor)
- [Potree: Punktwolken im Browser](https://www.researchgate.net/publication/309358171_Potree_Rendering_Large_Point_Clouds_in_Web_Browsers) (Kamera-relativ, Stufen)
- [ASH: paralleles räumliches Hashing, Tensor-Koordinaten → Indizes](https://www.cs.cmu.edu/~kaess/pub/Dong23pami.pdf)

**Projektinterne Fundstellen (gelesen)**
- `docs/project-profile.md` §2, §4 (NewDawn0-Korrektur vom 12.10.2026)
- `docs/vision.md` (Zoom als Bedeutungsebenen; Skizzen `002-g-universe` als Darstellungsvorbild)
- `docs/status/arbeitspakete.md` Abschnitt R (NewDawn-Zoom-Technik Status D, Konflikt K4 GUI außen vor)
- `docs/reference/web-frontend.md` §1–§4 (Ort und Aufbau von `apps/web`)
- `docs/status/README.md` (Regeln für Snapshots: Datum, Befehl, Gemessenes von Gedeutetem getrennt)

**Messung**
- Kein Programm, keine Seite, kein Artefakt: die Zahlen in §4 entstehen aus dem dort
  abgedruckten PowerShell-Lauf (`[single]` bildet float32 nach, entspricht `Math.fround`).
  Wer zweifelt, kopiert das Kommando und sieht dieselbe Ausgabe.
- Eine erste Fassung legte dafür eine HTML-Messseite an (`docs/status/zoom-probe.html`).
  Sie war **nicht beauftragt**, wurde beanstandet und **gelöscht** — nie committet. Siehe §4.1.

**Hinweis zur Gleichzeitigkeit (Ablaufbefund).** Während dieser Recherche lief ein zweiter
Arbeiter am selben Arbeitsbaum und verschob den Host von `apps/host` nach `apps/cli`
(`git status` zeigt `?? apps/cli/` und `D apps/host/…`). Dieser Bericht hat **nur**
Dokumentationsdateien angefasst (`docs/status/`, `docs/INDEX.md`) — die Berührungspunkte sind
null. Die Projektregel „Tests nicht parallel zu Schreibvorgängen auf denselben Dateien"
(`docs/status/arbeitspakete.md`, Eintrag vom 13.10.2026) gilt hier sinngemäß: eine Messung
über einen halbfertigen Stand ist kein Befund über den Code.
