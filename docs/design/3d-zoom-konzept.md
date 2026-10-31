# 3D-Welt, Rotation und Zoom — Konzept

> **Angelegt am 13.10.2026** als Antwort auf den Befund des Betreibers: *„alles verpixelt, weil
> kein canvas genutzt wird und auch svg"*, dazu fehlendes Koordinatensystem, fehlende
> 5D-Rotation und fehlender 3D-Zoom.
> **Stand 13.10.2026 (Fassung 3):** Die Fragen aus §7 sind **beantwortet bzw. als Vorschlag
> gekennzeichnet**. Drei Entscheidungen hat der Betreiber getroffen (Renderer, echte 3D-Achse mit
> Perspektive, Rotation als zeitveränderliche Parameterisierung — §7.1). Zwei Punkte sind
> **Vorschläge, nicht entschieden** (§7.2). **P7.7 bleibt offen** (§7.3).
> **Status: Konzept, kein Code.** Der Betreiber hat „erst Konzept, dann Code" gewählt. Diese
> Datei ändert **nichts** an `apps/web`, legt keine Datei an, die Darstellung erzeugt, und
> stellt keine gelöschte Datei wieder her. **P7.8–P7.15 sind gesperrt**, bis P7.7 abgenommen ist.
> **Wichtig vorab:** Der Befund wurde an einer **gelöschten Wegwerf-Datei** erhoben
> (`docs/status/zoom-probe.html`, entfernt am 13.10.2026 wegen fehlenden Auftrags). Der Fehler
> darin ist echt und lehrreich — er ist der Anlass dieses Konzepts. `apps/web` hat ihn **nicht**,
> weil dort gar nichts gezeichnet wird (§4).

---

## 1. Was schiefging — die Ursache in drei Zeilen

`zoom-probe.html` zeichnete Sterne **einmal** in ein 1024×1024-Bitmap und vergrößerte dieses
Bitmap anschließend auf die Bildschirmgröße:

```js
const t = makeTile(cx, cy, level)      // Sterne einmal in 1024 px malen
ctx.drawImage(t, sx, sy, tileScreen, tileScreen)   // dann vergrößern
```

Zusätzlich war die Zoomstufe gedeckelt:

```js
return Math.max(0, Math.min(20, Math.floor(Math.log2(z * CHUNK / 512))))
```

**Was daraus folgt:** Bei Zoom 10¹² wird die Stufe auf 20 geklemmt, das Bitmap also um
2¹⁰ ≈ 1024-fach vergrößert. Aus einem 1024-Pixel-Bitmap werden 2,1 · 10⁹ Bildschirmpixel →
**Klötzchen**. Die Deckelung war als Speicherschutz gedacht und hat genau das erzeugt, was
vermieden werden sollte.

**Die Lehre, in einem Satz:** *Ein gerastertes Bild, das man vergrößert, wird unscharf — egal
wie schön es aussah, als es gemalt wurde.* Raster ist nur zulässig, wo die Größe **feststeht**.
Für alles, was skaliert wird, muss pro Zoomstufe **neu gezeichnet** werden.

### 1.1 Zweiter, eigener Fehler in derselben Sache

In `docs/status/newdawn0-recherche.md` §4 steht, „naives Rebase" sei „nicht die Lösung", weil die
vierspaltige Messung durchgehend „andere Kachel" ergab. **Diese Schlussfolgerung war falsch
gezogen.** Richtig ist:

- Die Messung zeigt nur, dass sich zwei **weit entfernte** Punkte nicht in *einem* lokalen
  Bezugssystem ausdrücken lassen — das ist trivial.
- Sie zeigt **nicht**, dass das lokale Bezugssystem untauglich ist. Sie hat es schlicht nie
  geprüft, weil die Bedingung „beide Punkte in derselben Kachel" nie erfüllt war.
- Tatsächlich ist das **kachel-lokale, normierte** Bezugssystem die Lösung (§3): Jede Kachel
  rechnet in eigenen Einheiten, der Kachelindex trägt die grobe Position. Damit wachsen die
  Zahlen nie, unabhängig von der Weltgröße.

Korrektur ist in §4 des genannten Berichts eingetragen. Kein Snapshot wird überschrieben.

---

## 2. Koordinatensystem — die Konvention

Die Konvention steht hier **verbindlich**, damit später niemand raten muss.

### 2.1 Achsen und Händigkeit

| Frage | Festlegung | Warum |
|---|---|---|
| Händigkeit | **rechtshändig** | Standard für 3D-Mathematik, `three` rechnet so |
| `+x` | rechts | Bildschirm |
| `+y` | **oben** | wie in der Mathematik, *nicht* wie in Bildschirmkoordinaten |
| `+z` | **zum Betrachter** | rechtshändig zu x/y |
| Bildschirmachse | `+x` rechts, `+y` **nach unten** | Browser-Canvas; die Umkehr passiert **genau einmal**, in der Projektion |
| Winkel | Bogenmaß, Gegenuhrzeigersinn um die Achse blickend von `+` nach `0` | eine Regel, überall gleich |

**Der Fehler, der hier vermieden wird:** `+y` zeigt in der Welt nach oben und im Canvas nach
unten. Wer das an zwei Stellen umdreht, bekommt eine Welt, die bei Rotation kippt. Deshalb:
**eine** Umkehr, in **einer** Funktion (`worldToScreen`), nirgends sonst.

### 2.2 Welten und Kacheln

| Begriff | Festlegung |
|---|---|
| Weltenheit | **1 Ganzzahl** = 1 Pixel bei Zoom 1 (die feinste sinnvolle Auflösung) |
| Kachel (Chunk) | **1024 Welteneinheiten** je Kante — Zweierpotenz, damit Teilung exakt bleibt |
| Kachelkoordinate | `floor(welt / 1024)` — **ganzzahlig**, O(1), ohne Baum (siehe `newdawn0-recherche.md` §3) |
| Kachelindex | `(stufe, kachelX, kachelY)` — die Stufe gehört **in den Index** |
| Stufe `L` | Kachelspanne auf dem Bildschirm = `512 · 2^L` Pixel |
| Sichtbarer Inhalt | `Kachelzahl = Bildfläche / Kachelgröße` — **unabhängig von der Weltgröße** |

### 2.3 Zwei Zahlenräume (das ist der Kern der Genauigkeit)

Gemessen in `newdawn0-recherche.md` §4: float32 einer Größe X löst nur Schritte von `X · 2⁻²⁴`
auf. Daraus folgt die Regel:

| Wo | Genauigkeit | Was dort lebt |
|---|---|---|
| **CPU / Zustand** | `double` (JavaScript-Zahl) | Kameraposition, Zoom, Weltkoordinaten — **dürfen beliebig groß sein** |
| **GPU / Zeichnung** | `float32` | **nur kameranahe Werte**, Zielgröße unter ~10⁴ |

**Rechenweg, wörtlich:** `versatz = (welt − kamera) · pixelJeEinheit`, gerechnet in `double`,
und **erst das Ergebnis** geht an die Zeichenfläche. Nie `welt · pixelJeEinheit` — dann steht
`kamera · zoom` in float32, und ab 10⁸ ist der Fehler viele Pixel groß.

### 2.4 Zoom als getrennte Größe

Der Zoom wird **logarithmisch** geführt: `logZoom` ist die Größe, `zoom = exp(logZoom)`.
Damit ist ein Radklick überall derselbe *wahrgenommene* Schritt, `zoom` kann nie 0 oder negativ
werden, und die Zoom-**Stufe** ist `floor(logZoom / ln2)` — die Stufe folgt dem Zoom, nicht
umgekehrt. Die Deckelung, die §1 die Verpixelung eingebaut hat, entfällt ersatzlos: **jede
Stufe zeichnet neu.**

---

## 3. Dimensionen — „5D" sauber zerlegt

„5D" ist im ganzen Projekt nicht definiert. Statt es zu raten, wird es in **drei Begriffe**
zerlegt, die nicht dasselbe sind:

| Begriff | Bedeutung | Wird gebraucht für |
|---|---|---|
| **N-dimensionaler Vektorraum** | Punkt in `R^N`; Rotationen bilden die Gruppe `SO(N)` mit `N(N−1)/2` Drehflächen (5D → **10**) | das Rechenmodul (allgemein, prüfbar) |
| **3D-Welt** | die sichtbare Welt: Sterne, Planeten, Umlaufbahnen | die Darstellung |
| **Semantische Stufe** | Zoomstufe als eigene Achse (Sonnensystem → Galaxie → …) | Bedeutungsebenen (`docs/vision.md`) |

**Entscheidung des Betreibers:** *beides* — das Rechenmodul **allgemein für n Dimensionen**
(auch 5D) **und** die sichtbare 3D-Welt, die es benutzt. Damit ist „5D" keine Behauptung,
sondern eine prüfbare Eigenschaft des Moduls.

**Warum nicht Euler-Winkel:** drei Winkel nacheinander zu drehen erzeugt **Gimbal-Sperre** —
bei bestimmten Stellungen fällt ein Freiheitsgrad weg und die Drehung „springt". Für echte
360°-Drehung in beliebiger Richtung sind Euler-Winkel die falsche Wahl. Verwendet werden
stattdessen:

- **für 3D:** Einheits-**Quaternion** (4 Zahlen) oder Rotor — keine Sperre, glatt interpolierbar,
  Zusammensetzen durch Multiplikation.
- **für n Dimensionen:** volle **Rotationsmatrix** aus der Exponentialabbildung eines
  **Bivektors** (schiefymmetrische Matrix, `N(N−1)/2` freie Werte), oder als Produkt von
  Givens-Drehungen je Flächenpaar. Für `N = 5` sind das 10 Flächen, jede um 360° drehbar.
- **Zusammensetzen** immer durch Matrix-/Quaternion-Multiplikation — dadurch bleiben alle
  Kombinationen ohne Sperre.

---

## 4. Darstellung — was scharf bleibt und was nicht

### 4.1 Der Befund am ausgelieferten Stand

`apps/web` zeichnet heute **gar nichts**: `src/lib/Universe.tsx` ist ein leeres `<div>` mit
`radial-gradient(ellipse at 50% 35%, #0c0a10, #050507 75%)`, die Dynamic Island ist eine Pille
aus HTML. `three` ist in `apps/web/package.json` deklariert und liegt in `node_modules`, wird
aber **von keiner Zeile benutzt** — die Datei sagt das selbst.

**Deshalb ist dort keine Verpixelung durch Rasterung möglich** (es gibt kein Rasterbild). Was
dort aber auftreten kann, ist **Banding**: zwischen `#0c0a10` und `#050507` liegen sehr wenige
Farbstufen, und ein Verlauf über den ganzen Bildschirm zeigt dann sichtbare Stufen. Das sieht
auf einem einfachen Panel „pixelig" aus, ist aber etwas anderes als Klötzchen. **Nicht geprüft**
— dafür muss die Seite auf dem Zielrechner offen sein.

### 4.2 Was bei jedem Zoom scharf ist

| Technik | Scharf bei jedem Zoom? | Geeignet für |
|---|---|---|
| **Canvas, pro Stufe neu gezeichnet** | **ja** — Vektorbefehle (`arc`, `lineTo`) werden mit aktueller Auflösung gerastert | die Welt selbst: Sterne, Bahnen, Knoten |
| **SVG** | **ja** — Auflösung ist Sache des Browsers | **Overlays**: Achsen, Gitter, Beschriftung, Maßstab |
| **Canvas mit Bitmap vergrößert** | **nein** — genau der Fehler aus §1 | nichts, was skaliert wird |
| **WebGL/WebGPU** | ja, aber Float32-Grenze (§2.3) | erst, wenn Canvas nachweislich zu langsam ist |

**Entscheidung des Betreibers (13.10.2026):** **Canvas, three.js vorerst nicht** — auch nicht,
obwohl es bereits im Projekt liegt.

**Klarstellung zur Benennung — sie ist eine Falle und wird hier festgehalten.** „Canvas 2D"
heißt die **Zeichen-API** (`CanvasRenderingContext2D`). Das Wort „2D" darin sagt **nichts**
über die Welt. Der Betreiber hat das ausdrücklich richtiggestellt:

> „im grunde genommen ist es nicht 2d sondern 3D achse also nach vorne und bei 5D ist es
> rotation ect."

**Also verbindlich:**
- Die **Welt ist 3D** — mit `z` als Tiefe „nach vorne" (§2.1) und **echter
  Perspektivprojektion** (§5.4), nicht flach.
- Die **Zeichenfläche** ist Canvas. Sie ist ein flaches Rechteck aus Pixeln — das ist die
  Leinwand, nicht der Raum. Ein Gemälde ist auch flächig und zeigt trotzdem Tiefe.
- **Kein** flaches Draufsicht-Bild, **keine** orthografische Notlösung. Perspektive ist
  gesetzt, nicht optional.

`three` bleibt ungenutzt; es zu benutzen wäre eine eigene Entscheidung mit eigener Begründung.

**Ehrliche Einschränkung:** Die Schärfe-Regel aus diesem Abschnitt hängt **nicht** am Renderer.
Kein Renderer kann unbegrenzt zoomen — die Fähigkeit entsteht aus der **Hierarchie** (§2.2,
§2.4) und daraus, dass pro Stufe **neu gezeichnet** wird. Der Renderer entscheidet nur über
Geschwindigkeit und Abhängigkeiten, nicht über Schärfe.

**Pflicht bei jedem Zeichnen:** `devicePixelRatio` berücksichtigen. Die Zeichenfläche bekommt
`breite = cssBreite · dpr` **Pixel**, und alle Koordinaten werden in CSS-Pixeln gerechnet —
sonst ist auf einem 4K-Bildschirm alles halb so scharf.

### 4.3 Warum „einfach größer zeichnen" nicht reicht

Ein Bitmap hilft nur, wenn seine Pixelgröße **zur Anzeigegröße passt**. Bei unbegrenztem Zoom
müsste es unbegrenzt wachsen (Speicher) oder geklemmt werden (Klötzchen — §1). Es gibt keinen
dritten Weg. Deshalb: **Vektor pro Stufe, kein Bitmap-Cache für Skaliertes.** Ein Bitmap-Cache
ist nur zulässig für Dinge, deren Bildschirmgröße **feststeht** — zum Beispiel ein
Beschriftungsschild, das immer 12 px hoch ist.

---

## 5. Aufbau

### 5.1 Bausteine (Namen und Verantwortung, noch kein Code)

| Baustein | Verantwortung | Prüfbar durch |
|---|---|---|
| `rotation` | Rotationen in `n` Dimensionen: aus Bivektor/Givens bauen, zusammensetzen, auf Vektor anwenden | Längentreue, 360°-Rückkehr, Orthogonalität, Determinante +1 |
| `quaternion` | 3D-Spezialfall für die Darstellung, ohne Sperre | 360°-Rückkehr, keine Singularität |
| `kamera` | `logZoom`, Drehlage (Quaternion), Position — alles in `double`; **die eine** Projektionsfunktion Welt → Bildschirm (§5.4) | Zoom-Äquivalenz, Perspektive, Rundreise |
| `zeit` | Parameter `t` für Eigenrotation und Übergänge (§5.5) | Drehlage nach `2π` wieder Ausgangslage |
| `kachelindex` | Koordinate → Kachelschlüssel, O(1), ganzzahlig | Schlüssel stabil, Kachelzahl = Bildfläche/Kachelgröße |
| `szene` | erzeugt je Stufe den sichtbaren Inhalt (deterministisch aus dem Index) | gleicher Index → gleiches Bild |
| `koordinatensystem` | **SVG-Overlay**: Achsen, Gitter, Teilstriche, Einheiten, Maßstab | bleibt unter Rotation/Zoom konsistent |
| `universe` | verbindet alles: Canvas-Fläche + Overlay | — |

### 5.2 Interaktion

| Geste | Wirkung |
|---|---|
| Ziehen (Maus/Stift) | drehen — volle 360°, auch über den Pol hinweg (Quaternion) |
| Rad / Kneifen | **Dolly-Zoom** entlang der Blickrichtung, logarithmisch |
| Ziehen mit Zusatztaste | verschieben (Pan) |
| Pfeiltasten | drehen in festen Schritten (Tastaturweg, Barrierefreiheit) |
| `+` / `−` | Zoom in festen Log-Schritten |
| `0` | Ausgangslage (Zoom und Drehung zurück) |

**Dolly-Zoom** heißt: nicht „Bild größer", sondern „**näher heran**" entlang der Blickrichtung.
Weil die Projektion perspektivisch ist (§5.4), wandert die **Perspektive mit** und der Zoom
zeigt Tiefe statt nur Größe.

### 5.3 Was die Tests beweisen müssen

| Test | Kriterium |
|---|---|
| Längentreue | `‖R·v‖ = ‖v‖` für 1000 Zufallsvektoren in 3D und 5D, Abweichung < 10⁻¹² |
| 360°-Rückkehr | `R(2π) = I` je Drehfläche, Abweichung < 10⁻¹² |
| Zusammensetzen ohne Sperre | 10 000 Multiplikationen: Determinante bleibt 1 ± 10⁻¹², Matrix orthogonal |
| Zoom-Äquivalenz | `n` Schritte `delta` = **ein** Schritt `n·delta` im Log-Raum, Abweichung < 10⁻¹² |
| Dolly-Richtung | Zoom hinein verkürzt den Kameraabstand, das Objekt bleibt zentriert |
| **Perspektive trägt Tiefe** | zwei gleich große Punkte in verschiedener Tiefe erscheinen **verschieden groß**; der hintere kleiner — bei flacher Projektion wären sie gleich groß |
| **Abschneiden hinter der Kamera** | ein Punkt mit `z ≤ 0` erscheint **gar nicht**, nicht gespiegelt |
| **Drehlage über die Zeit** | nach einer vollen Eigenrotation `t = 2π` ist die Drehlage wieder die Ausgangslage, Abweichung < 10⁻¹² |
| Welt↔Bildschirm | Rundreise ergibt den Ausgangspunkt, Abweichung < 10⁻⁹ px |
| Schärfe-Grenze | ein Kreis bleibt bei Zoom 10⁰…10¹² rund (Radius konstant in px) — **das ist der Test gegen §1** |
| Kachelzahl | bleibt bei jeder Zoomstufe gleich groß (Bildfläche / Kachelgröße) |

Der Schärfe-Test ist der wichtigste: er prüft genau die Eigenschaft, die in §1 verloren ging.
Der Perspektiv-Test ist der zweite wichtige: er unterscheidet **echte** 3D-Darstellung von einer
flachen, die nur so aussieht.

### 5.4 Die Projektion — 3D-Achse, Tiefe, Perspektive

**Entscheidung des Betreibers:** echte 3D-Achse mit `z` **nach vorne**, **echte
Perspektivprojektion** — nicht flach.

| Schritt | Was passiert | Wo es lebt |
|---|---|---|
| 1. Weltpunkt | `(x, y, z)` in `double`, Welteneinheiten | Zustand |
| 2. Kamera-Bezug | Punkt **relativ zur Kamera** verschieben — in `double` (§2.3) | `double` |
| 3. Kamera-Drehung | Punkt in **Kamerakoordinaten** drehen (Quaternion, §3) | `double` |
| 4. Perspektive | `x' = x / z · brennweite`, `y' = y / z · brennweite` | `double` |
| 5. Bildschirm | `sy` **einmal** umkehren (§2.1), `devicePixelRatio` anwenden | `double` → Zeichenfläche |

**Vier Regeln, die daraus folgen:**

1. **Genau eine Projektionsfunktion.** Jede Stelle, die selbst „mal eben" rechnet, erzeugt eine
   zweite Wahrheit — und eine Welt, die bei Drehung kippt. Es gibt `worldToScreen`, sonst nichts.
2. **Die Brennweite ist nicht der Zoom.** Die Brennweite bestimmt den **Bildwinkel** (Weitwinkel
   vs. Tele), der Zoom bestimmt den **Abstand**. Beides zu vermischen ist der klassische Fehler,
   bei dem „Zoom" irgendwann wie eine Verzerrung aussieht.
3. **`z` hinter der Kamera ist ungültig.** Punkte mit `z ≤ 0` werden **abgeschnitten**, nicht
   gespiegelt — sonst erscheint die Welt hinter dem Betrachter noch einmal, auf dem Kopf.
4. **Die Tiefe braucht eine je Stufe gesetzte ferne Ebene.** Verhältnis nächster zu fernstem
   Punkt über ~10⁶ → flackernde Flächen (Z-Kämpfe). Deshalb wird die ferne Ebene **je Stufe**
   gesetzt — die Hierarchie aus §2.2, hier als unmittelbarer Nutzen.

### 5.5 Rotation als zeitveränderliche Projektion

**Entscheidung des Betreibers:** höherdimensionale Rotation als **Parameterisierung**, die sich
**über die Zeit** ändert — wörtlich: „bei 5D ist es rotation ect."

Damit sind es **fünf Freiheitsgrade**, und jeder hat einen klaren Platz:

| # | Freiheitsgrad | Bedeutung | Umsetzung |
|---|---|---|---|
| 1 | `x` | Raumachse | Position |
| 2 | `y` | Raumachse | Position |
| 3 | `z` | Raumachse, Tiefe nach vorne | Position + Perspektive (§5.4) |
| 4 | **Drehlage** | Orientierung der Kamera | **Quaternion** — 3D, ohne Gimbal-Sperre |
| 5 | **Zeit** | die Drehlage **ändert sich**: Eigenrotation, Umlauf, Übergang | ein Parameter `t`, der in die Drehlage eingeht |

**Regel:** Die Zeit ist **kein** zusätzlicher Raumvektor, sondern der Parameter, mit dem die
Drehlage berechnet wird. Wer Zeit als vierte Raumachse behandelt, bekommt eine Welt, die im
Stillstand nicht mehr definiert ist.

**Die volle Allgemeinheit bleibt daneben bestehen:** Das Modul `rotation` (§5.1) kann Rotationen
in **n Dimensionen** (`SO(n)`; für `n = 5` sind das **10 Drehflächen**). Es ist die
Rechenmaschine — die sichtbare Welt benutzt davon die 3D-Drehung plus Zeit. Damit ist „5D" keine
Behauptung, sondern eine **prüfbare Eigenschaft des Moduls**, und die sichtbare Welt bleibt
verständlich.

---

## 6. Abgrenzung — was dieses Konzept ausdrücklich **nicht** tut

- **Kein Code.** Kein Eingriff in `apps/web`, keine neue Datei, die Darstellung erzeugt.
- **Keine Wiederherstellung** von `docs/status/zoom-probe.html`. Die Datei war nicht beauftragt
  und wurde auf Prüfauflage entfernt; dieses Konzept tritt an ihre Stelle.
- **Keine neue Abhängigkeit.** `three` bleibt ungenutzt — der Betreiber hat entschieden, es
  vorerst **nicht** zu verwenden (§7.1). Es wird nichts installiert.
- **Keine Datenanbindung.** Woher Masse, Chatmenge und Speicher kommen (`pmh-attach`,
  Session-Modell), ist **nicht** Teil dieses Konzepts.
- **Keine Leistungszusage.** Ob die Darstellung auf dem Zielrechner flüssig läuft, ist
  **offen** und wird gemessen, nicht behauptet.
- **Keine Subagenten.**

## 7. Offene Punkte und Freigabestand

### 7.1 Vom Betreiber entschieden (13.10.2026)

| Frage | Entscheidung | Wo es steht |
|---|---|---|
| Renderer | **Canvas**, `three.js` vorerst **nicht** benutzen — auch nicht, obwohl vorhanden | §4.2 |
| Ist die Welt flach? | **Nein.** Echte **3D-Achse** mit `z` nach vorne und **echte Perspektivprojektion**. „Canvas 2D" benennt die API, nicht die Welt | §4.2, §5.4 |
| Was ist „5D"? | **Parameterisierung**, die sich über die **Zeit** ändert: 3 Raumachsen + Drehlage + Zeit; daneben das Modul für **n** Dimensionen (5D → 10 Drehflächen) | §5.5, §3 |

### 7.2 Vorschläge — **nicht** entschieden

Beide Punkte hat der Betreiber **nicht** beantwortet. Sie sind hier als **Vorschlag** markiert
und gelten **erst nach Bestätigung** als gesetzt. Nichts davon ist erfindenischerweise als
Entscheidung eingetragen.

**Vorschlag A — Koordinatensystem-Overlay: gefaltetes Lineal statt Vollflächen-Gitter.**
Ein **kleines Lineal in der Ecke**, das die Projektion der drei Achsen zeigt: drei kurze
Striche mit `x`, `y`, `z`, ein Maßstabswert („1 Kachel = 1024 Einheiten") und Teilstriche, die
sich beim Zoomen **umskalieren**. Dazu eine dünne Achsenkreuz-Anzeige am Rand.
*Warum nicht das Vollflächen-Gitter:* Ein Gitter über die ganze Fläche stellt eine **Ebene** dar.
Eine 3D-Welt hat aber Ebenen in jeder Tiefe — ein flaches Gitter wäre eine **Lüge über die
Tiefe** und würde bei Drehung sofort falsch aussehen. Das Lineal zeigt stattdessen die
**Achsenrichtungen auf dem Bildschirm**, und die sind bei jeder Drehung korrekt.
*Gegenstimme, ehrlich:* Ein Lineal ist diskreter, aber weniger beeindruckend als ein Gitter.
Wer das Gitter will, braucht es **in der Welt** (auf einer echten Ebene, z. B. der
Bahnebene eines Sonnensystems) — nicht als Bildschirm-Overlay.

**Vorschlag B — Zoomtiefe: keine harte Grenze, aber eine benannte Schwelle.**
- **Geführt wird der Logarithmus** `logZoom`, ohne obere Grenze (§2.4): die Stufe folgt dem
  Zoom, jede Stufe zeichnet neu — deshalb ist Tiefe **kein** Speicher- oder Schärfeproblem.
- **Benannte Schwelle:** Bis **10⁶** Zoom in einer festen Einheit ist die Rechnung sicher
  (gemessen: 10⁴ → 0,3 px, 10⁵ → 3 px, 10⁶ → 30 px Fehler in `newdawn0-recherche.md` §4).
  Darüber **muss** die Hierarchie greifen — sonst wird der Fehler sichtbar. Die Schwelle wird
  im Betrieb **angezeigt**, damit sie nicht überrascht.
- **Bezug der Skalen:** Welteneinheit = Ganzzahl, Kachel = 1024, Stufe `L` = `512 · 2^L`
  Bildschirmpixel. Daraus ergibt sich die Zahl der Stufen aus der **Zielspanne** — und die ist
  Vorschlag C.
- *Was noch fehlt:* eine konkrete Zielspanne („Sonnensystem bis Galaxie sind wie viele
  Welteneinheiten?"). **Ohne diese Zahl ist die Zahl der Stufen nicht bestimmbar** — sie ist
  weiterhin offen.

**Vorschlag C — Zielspanne der Welt (offen, weil die Angabe fehlt).**
Vorschlag: **ein Sonnensystem ≈ 10⁶ Welteneinheiten** breit, **eine Galaxie ≈ 10¹²**. Damit
bräuchte es rund **20 Zoomstufen** vom Detail bis zur Übersicht. Das ist eine **Schätzung**, kein
Wissen — sie muss vom Betreiber korrigiert werden.

### 7.3 Freigabestand

| Punkt | Stand |
|---|---|
| P7.1–P7.6 (Untersuchung, Konzept) | **erledigt** |
| **P7.7 (Betreiber-Abnahme)** | **teilweise erteilt** — siehe §8. Freigegeben ist, was der Prototyp braucht; **nicht** freigegeben sind Barrierefreiheit, Leistungsnachweis und Datenanbindung |
| P7.8–P7.15 (Implementierung, Test, Nachweis) | **in Arbeit** fuer den Prototyp (§8). Die uebrigen Teile bleiben gesperrt |

---

## 8. Der Prototyp (ab 13.10.2026)

Der Betreiber hat einen **Prototypen beauftragt** — ausdruecklich **noch ohne**
Harness-Anbindung. Er liegt in **`apps/universe`** (umgezogen am 14.10.2026 aus `snapshots/web`;
ein Port statt zwei, Nachweis und Messungen: [../status/welt-ein-port.md](../status/welt-ein-port.md)).

### 8.1 Entscheidungen des Betreibers (13.10.2026)

| Frage | Entscheidung | Wirkung |
|---|---|---|
| Zeichenweg | **three.js** (also WebGL), nicht selbst gerechnet | Die Aussage „Canvas 2D zuerst" aus §4.2 ist damit **ersetzt**. Der Betreiber hat sie selbst korrigiert: „es ist 3D also xyz und mit rotation und zoom" |
| Was „2D" im Namen bedeutet | **nichts ueber die Welt** | Die Welt bleibt 3D mit Perspektive. „Canvas 2D" ist ein API-Name, keine Aussage ueber den Raum |
| Mobil | **nur Chat** | Unter 860 px Breite wird die Welt nicht aufgebaut |
| Zustand | **Reload darf nichts verlieren** | Modus, Kamera und Panel-Anordnung liegen im Speicher — **je Raum getrennt** |
| Isolierung | **eigene Instanz je Nutzer** | „komplett sein eigenes wie ein **Sandbox / Container**" — **nicht** ein Filter in einer gemeinsamen Datenbank. Korrektur einer frueheren Fehldeutung |
| Datenbank | **PostgreSQL/pgvector**, spaeter | Der Betreiber will die Vektorsuche der Datenbank fuer das **Finden** von Objekten nutzen |

### 8.2 Was aus §4.2 unveraendert gilt

Die **Schaerfe-Regel** haengt nicht am Renderer: pro Bezugsebene **neu gezeichnet**, kein
vergroessertes Bitmap, Beschriftungen als Text und **nicht als Textur**. Der Renderer
entscheidet ueber Geschwindigkeit und Abhaengigkeiten — nicht ueber Schaerfe. Waere die
Beschriftung eine Textur, waere sie genau der Fehler aus §1 in neuer Form.

### 8.3 Die Bezugsebenen

Die Nummerierung ist **absteigend in der Groesse**: je **kleiner** die Zahl, desto **groesser**
der Bezug. Das ist kein Geschmack — es macht „welche Ebene ist gerade ein Punkt" zu einem
Vergleich statt zu einer Sonderfallliste. (Ein erster Anlauf hatte es andersherum; die Tests
haben es aufgedeckt.)

| Ebene | Name | Im Projekt |
|---|---|---|
| 1 | Kosmisches Netz | alles |
| 2 | Filament | Projektgruppe — die groessten bekannten Strukturen des Universums |
| 3 | Galaxie | ein Projekt |
| 4 | Sternhaufen | eine Gruppe von Workspaces |
| 5 | Sonnensystem | ein Workspace; Planeten = Dateien |

### 8.4 Was der Prototyp **nicht** ist

- **Keine Harness-Anbindung.** Chat-Antworten sind erfunden und als solche gekennzeichnet.
- **Keine echte Physik.** Bahnen sind gerechnete Lagen, keine n-Koerper-Simulation. Der
  Betreiber will „realistische Physik" — das ist **Scheibe 3** und noch offen.
- **Keine Datenbank.** Die Massen sind Attrappen.
- **Kein Sicherheitsmerkmal.** Der Raum ist ein Name aus der Adresse, keine Zugangskontrolle.
  Die echte Grenze zieht spaeter der Container.

### 8.5 Nachweis

| Pruefung | Ergebnis |
|---|---|
| `bun test` | **166 Tests, 0 Fehler** (14 Dateien) |
| `tsgo --noEmit` (TypeScript 7) | **exit 0** |
| `vite build` | **exit 0** |
| Entwicklungsserver | **HTTP 200** auf `127.0.0.1:5176` |

**Was nicht geprueft ist:** Das Bild selbst. Kein Browser wurde geoeffnet — es gibt kein Chrome auf
diesem Rechner, und der Pruefweg ueber DevTools findet keine Installation. Weder Bildrate noch
Darstellung sind also **gemessen**; wer „sieht gut aus" behaupten will, muss es ansehen.
Rechnerisch belegt ist, dass der Startblick die Welt in den Bildbereich legt
(`tests/opening-view.test.ts` projiziert Sonne, innere Planeten und Neptun mit echter
Kamerarechnung) und dass die Huelle ohne Absturz laedt (`tests/boot.test.ts`).

### 8.6 Steuerung und Sprache — Einstellungen als Plugins (13.10.2026)

**Weisung des Betreibers:** „die koennte man in settings implementieren fuer stuerung" und „sprache
nicht vergessen das wir auf englisch standard und deutsch unterstuetzen diese sprache fuer den
harness wird durch eine language package/plugin implementiert, wie beim Visual studio code
extension verstehst du?"

Das ist die Form, in der dieser Prototyp waechst — **Verwaltungen im Kern, Inhalte als Pakete**:

| Teil | Ort | Kennt |
|---|---|---|
| Einstellungen | `settings.ts` | kein einziges Feld — nur Schema, Grenzen, Speicherung je Raum |
| Sprachkern | `i18n.ts` | keine einzige Sprache — nur Schluessel, aktive Sprache, Rueckfall |
| Sprachpakete | `locales/de.ts`, `locales/en.ts` | Saetze, sonst nichts; je als **Plugin** eingetragen |
| Sprachauswahl | `locale-plugins.ts` | die Einstellung `language.locale` |
| Steuerung | `control-settings.ts` | Drehen, Zoomen, Schieben, Achsen, Dimensionen, Namen |
| Einstellungsbildschirm | `settings-screen.ts` | keine Einstellung — er zeigt an, was andere beschreiben |

**Warum das die Voraussetzung fuer die Harness-Kopplung ist.** Ein Harness, der Sprachen und
Einstellungen als Liste im Code fuehrt, muss bei jeder neuen Sprache und jedem neuen Werkzeug
angefasst werden. Hier legt man ein Paket daneben: `locales/ja.ts`, ein Plugin, fertig. Der Kern
bleibt unveraendert — und damit pruefbar.

**Die Steuerungswerte sind keine Konstanten mehr**, sondern werden bei jeder Bewegung **gelesen**:
`control.rotateSpeed` (ersetzt `ROTATE_SPEED`), `control.zoomFactor`, `control.axisSpin`,
`control.panFactor`, `control.showAxes`, `world.dimensions` (3 … 5, ersetzt die feste 5 in der
Matrix). Die alten Konstanten bleiben als **Rueckfall**: ein abgeschaltetes Plugin nimmt seine
Beschreibung mit, die Kamera darf deshalb nicht stehenbleiben.

**Ein eigener Rechenfehler, der hier festgehalten gehoert.** In einem Zwischenschritt stand in
`camera.ts`, `0,00175 rad/px` seien „57 Pixel je Grad" und in CAD-Programmen liege man bei 40 bis 60.
Nachgerechnet ist `(π/180)/0,00175` = **9,97 px/°**. Der erste Korrekturversuch machte es nicht
besser (erst „9,97", dann „32,7" — beide Male dieselbe Verwechslung von Grad und Radiant). Richtig
ist **9,97** (alter Wert: 4,15). Der **Faktor 2,4** zwischen alt und neu stimmt, und die
Entscheidung, langsamer zu drehen, bleibt richtig.

Geblieben ist daraus mehr als eine Korrektur:

- Die Umrechnung steht **an einer Stelle** (`settings.ts`) und ist **mit Gegenprobe** geprueft: 10 px
  Zug × 0,00175 rad/px = 1,0°.
- Die Anzeige nennt die Groesse, die man **spuert**: **Grad je Bildschirmbreite**. `0,00175` sind
  **128° je 1280 px** — zwei Zuege, einmal herum. Der alte Wert waren **308°**, also mehr als einmal
  herum in **einem** Zug. Genau das war „wenn ich versuche zu drehen ist es zu fast".
- „Pixel je Grad" allein waere die schlechtere Anzeige: sie haengt an der Fensterbreite, und 10 px/°
  liest sich wie „sehr feinfuehlig", obwohl ein Zug quer ueber den Schirm um 128° dreht.

### 8.7 Der Fehler, der das Bild leer liess

Der Betreiber sah „komplett leer": schwarzes Canvas, halb gezeichnetes Achsenkreuz, sonst nichts.
Die Ursache war **kein** Zeichen- und **kein** Rechenfehler, sondern ein `ReferenceError` **beim
Laden der Huelle**: `registerLocalePlugins` ruft beim Eintragen `onSwitch → relabel()`, und
`relabel()` griff auf `dock` zu, das erst weiter unten deklariert wird. Das Modul starb, **bevor**
`requestAnimationFrame(loop)` erreicht war.

**Warum das der lehrreichste Fehler dieser Runde ist:**

1. Er war **unsichtbar** — kein Overlay, keine Meldung, nur ein leeres Bild.
2. Keine der 120 bisherigen Pruefungen fand ihn, weil **keine die Huelle lud**. Sie prueften
   Bausteine: Kamera, Szene, Rotation, Docking, Terminal. Die Naht dazwischen war ungeprueft.
3. Ein erster Reparaturtest meldete **Gruen**, obwohl der Fehler wieder eingebaut war — er fing den
   `ReferenceError` als „erwarteten three.js-Fehler" ab.

Behoben ist er durch die Marke `aufgebaut` (was vor dem Aufbau passiert, beschriftet nichts) und
durch `tests/boot.test.ts`, der die Huelle gegen ein winziges DOM (`tests/dom-stub.ts`) **wirklich
laedt**. Der Test ist **gegengeprueft**: mit wieder eingebautem Fehler meldet er
`ReferenceError: Cannot access 'dock' before initialization`. Merksatz: *ein Test, der den Fehler
nicht faengt, ist schlimmer als keiner — er erzeugt Vertrauen.*

### 8.8 Der Umschalter zwischen Chat und Welt (14.10.2026)

**Der Betreiber hat den Weg in beide Richtungen an dieselbe Stelle gelegt:** im Chat an die Marke der
Seitenleiste, in der Welt an die Kopfzeile `◆ PROMETHEUS`. Damit ist die Welt nicht mehr nur ein
eigener Entwicklungsserver, den man kennen muss, sondern aus dem Harness erreichbar — und der
Prototyp startet mit ihm zusammen (`scripts/start.mjs`, `--no-welt` schaltet ihn ab).

Der Wechsel geht in der Welt durch **eine** Stelle (`src/view-switch.ts`): gemerkt **und**
umgeblendet. Vorher merkten die Insel-Eintraege nichts, und nach dem Neuladen stand wieder das
Universum da.

Vollstaendiger Nachweis, die Zahlen und die offenen Punkte:
[../status/umschalter-marke.md](../status/umschalter-marke.md).

**Nachtrag am selben Tag: die Regel musste nachgeschaerft werden.** Der Betreiber hat den Umschalter
getestet (Klick auf die Marke in der Welt) und landete im **Platzhalter-Chat** des Prototyps —
*„Hier entsteht der Chat"*, *„Chat-Modus — noch nicht gebaut"*. Zwei Dinge heissen „Chat": der
Harness-Chat und der Platzhalter dieser Ansicht. Seither gilt:

* **Die Marke fuehrt zwischen Harness und Welt** — sie hinterlegt beim Klick den **Ankunftswunsch**
  (`localStorage`: `pmh.world.arrival = 'os'` — *ich will die Welt*) und **navigiert** dann auf
  `/universe/`; zurueck geht es ueber die **eigene** Herkunft. Kein Zusatz in der Adreßzeile:
  *„der link ist nur zu lange so lol"* (Betreiber, 15.10.2026).
* **Der Insel-Eintrag `▤ Chat` tut dasselbe** — auf ausdrueckliche Ansage: *„kannst du noch den neue
  implementierungsverknuepfung auch hier machen: ◉ ansichten · ▤ Chat · ⟲ Ansicht zuruecksetzen"*.
  Zwei Wege mit demselben Namen muessen dasselbe tun, sonst fuehrt der eine in den echten Chat und
  der andere in den Platzhalter. `⟲ Ansicht zuruecksetzen` bleibt, was es ist: Kamera zurueck und
  **in** die Welt — es verlaesst die Oberflaeche nicht.
* **Der Platzhalter bleibt erreichbar** — ueber `view chat` im Terminal. Er ist damit nicht mehr der
  Irrweg, den der Umschalter nimmt.
* Die uebrigen Insel-Eintraege (`◉ Universe`, Orte, Objekte, Panels, Einstellungen) fuehren weiter
  **innerhalb** der Welt.

Dazu die zweite Haelfte desselben Befunds: die Welt oeffnete sich in der **zuletzt gespeicherten**
Ansicht. Der Adresszusatz **schlaegt** sie jetzt — wer den Umschalter drueckt, will die Welt sehen.

**Nachtrag zu §8.5.** Die dort genannten **166 Tests in 14 Dateien** sind der Stand vom 13.10.2026.
Am 14.10.2026 gemessen: **262 Pruefungen in 24 Dateien, 0 Fehler** — die Zahl ist gewachsen, weil
weitere Bausteine des Prototyps dazugekommen sind (Docking, Objekte, Ansichts-Leiste, Sprache,
Umschalter), nicht weil die alten weniger geworden waeren.



