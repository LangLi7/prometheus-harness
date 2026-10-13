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
| **P7.7 (Betreiber-Abnahme)** | **OFFEN** — wartet auf Bestätigung der Vorschläge A, B, C |
| P7.8–P7.15 (Implementierung, Test, Nachweis) | **gesperrt**, bis P7.7 abgenommen ist |

**Solange P7.7 offen ist, wird kein Code geschrieben.** Auch die Vorschläge A–C werden **nicht**
umgesetzt, bevor der Betreiber sie bestätigt oder korrigiert hat.

