# `@prometheus-harness/icons` — der Zeichensatz

**33 gezeichnete Zeichen** für die Oberfläche des Prometheus Harness: 24 × 24 Raster, Strichlinie,
`currentColor`, aus **einer** Quelle (`src/shapes.ts`).

> *„emoji sieht schon scheisse aus und umprofessionell"* — der Betreiber, 15.10.2026, nachdem er die
> Insel mit `◆ ▤ ◉ ⟲ # ~ ⚙ ✕ ❯` gesehen hatte.

Er hat recht, und der Grund ist nicht Geschmack:

| | Ein Schriftzeichen | Ein gezeichnetes Zeichen |
|---|---|---|
| **Wie es aussieht** | entscheidet die **Schriftart** des Rechners; fehlt es, steht dort ein Platzhalterkästchen | auf jedem Rechner dasselbe Bild |
| **Was es bedeutet** | `#` heisst „Nummer", nicht „Ort"; `~` heisst „ungefähr", nicht „Körper" | die Form ist für die Sache gezeichnet |
| **Wie es sich einfügt** | mal Vollton, mal Strich, mal 10 px breit, mal 14 | eine Strichstärke, ein Raster |
| **Farbe** | bringt sie mit | erbt sie vom Zusammenhang (`currentColor`) |
| **Sprache** | ein Vorleser liest „Raute orte" | die Beschriftung daneben sagt es |

## Was drin ist

| Gruppe | Zeichen |
|---|---|
| **Das Thema** | `prometheus` (die Marke), `torch`, `vessel`, `chain`, `anvil` |
| **Navigation** | `orbit`, `chat`, `reset-view`, `settings`, `gear`, `close`, `chevron-right/down/left/up`, `plus`, `prompt`, `panels`, `layers`, `search` |
| **Der Himmel** | `place`, `constellation`, `stack`, `solar-system`, `galaxy`, `cluster`, `star`, `planet`, `object`, `code-file` |
| **Der Zustand** | `pulse`, `spark`, `chip` |

Die vollständige Liste **mit Beschreibung** steht in [`svg/README.md`](svg/README.md) — erzeugt aus der
Quelle, also nie veraltet. Zum Ansehen: [`svg/index.html`](svg/index.html) im Browser öffnen (alle
Zeichen groß, auf hellem und dunklem Grund).

### Das Thema: Prometheus

Fünf Zeichen tragen die Geschichte — der Titan, der das Feuer stahl, es im **Narthex** (einem Gefäß)
trug, an den Kaukasus **gekettet** wurde und den Hephaistos' **Amboss** begleitet:

* **`prometheus`** — die Flamme mit zwei Zungen. Die Marke: Kopfzeile, Pille, Favicon.
* **`torch`** — die Fackel. Das Feuer wird getragen.
* **`vessel`** — das Gefäß. Behälter, Bestand, Sitzung.
* **`chain`** — die Kette. Festgelegt, unveränderlich.
* **`anvil`** — der Amboss. Bauen, umsetzen.

Die übrigen 28 sind **Werkzeug**. Ein Satz, der nur aus Mythen bestünde, wäre ein Poster und keine
Oberfläche.

## Wie man es benutzt

```ts
import { iconMarkup, iconElement, spriteMarkup, iconId } from '@prometheus-harness/icons'

// 1. Als Markup — für Vorlagen und innerHTML.
knopf.innerHTML = iconMarkup('prometheus', 'marke')      // zweites Argument: zusätzliche Klasse(n)

// 2. Als fertiges Element.
zeile.append(iconElement(document, 'chat'))

// 3. Als Sprite — einmal je Seite, danach nur noch <use>.
document.body.insertAdjacentHTML('afterbegin', spriteMarkup())
// <svg class="pmh-icon"><use href="#pmh-icon-chat"/></svg>
```

Aus einer anderen Sprache oder ohne Bundler: die fertigen Dateien in [`svg/`](svg) nehmen —
`svg/<name>.svg` ist ein vollständiges, skalierbares Dokument.

**Was der Aufrufer tun muss:** die **Größe** setzen (das Zeichen bringt keine mit) und die **Farbe**
über `color` (das Zeichen malt mit `currentColor`).

```css
.pmh-icon { width: 15px; height: 15px; }
.knopf   { color: #ff9d3f; }   /* das Zeichen folgt */
```

## Die Regeln

1. **24 × 24 Raster.** Nichts ragt hinaus — auch nicht mit der halben Strichstärke. Geprüft.
2. **Strichlinie**, `stroke-width: 1.7`, runde Enden. Gefüllt wird nur, was sonst unsichtbar wäre
   (Punkte: Sterne, Körper auf einer Bahn).
3. **`currentColor` und `none` — sonst keine Farbangabe.** Ein Zeichen mit eigener Farbe ist in einem
   dunklen Bild unbrauchbar.
4. **Keine Größe im Markup.** Sie gehört in den Zusammenhang.
5. **Nur `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, `g`** — kein `script`,
   kein `foreignObject`, keine Adresse, kein `style`. Die Oberfläche setzt Zeichen als Markup in den
   Baum; was hereinkommt, ist damit **Inhalt**, kein Programm. Geprüft.
6. **Zwei Namen, zwei Zeichnungen.** Ein Zeichen, das zweimal dasselbe malt, ist ein Name zu viel.
   Geprüft.
7. **Namen sind englisch und klein** (`kebab-case`), wie alle Dateinamen in diesem Projekt (Regel 42).

## Ein Zeichen hinzufügen

1. Eintrag in `src/shapes.ts` — Name, ein Satz Beschreibung, die Geometrie. Wer eine Form **rechnet**
   (Kreisumfang, Zahnrad, Strahlenkranz), nimmt die Helfer derselben Datei; die Koordinaten von Hand
   zu schreiben ist die Stelle, an der sich ein Zahlendreher versteckt.
2. `bun build.mjs` — schreibt `svg/<name>.svg`, das Sprite, das Übersichtsblatt und `svg/README.md`.
3. `bun test` — prüft Raster, Sicherheit, Doppelungen, Benennung und daß die Dateien zur Quelle passen.
4. **Hinsehen.** `svg/index.html` öffnen. Eine Form, die als Pfaddaten stimmt, kann als Bild trotzdem
   falsch aussehen — die erste Fassung von `torch` war ein Kelch, und das fiel erst im Blatt auf.

## Die Prüfungen

```powershell
$BUN = "$env:USERPROFILE\.bun\bin\bun.exe"
cd packages\assets\icons

& $BUN test                     # 16 Prüfungen: Raster, Sicherheit, Doppelungen, Dateien
& $BUN run typecheck            # tsgo --noEmit
& $BUN build.mjs                # schreiben
& $BUN build.mjs --pruefen      # nur vergleichen (Exit 1 bei Abweichung)
```

**Die Prüfung auf das Raster rechnet die Hülle jedes Pfades aus** — für `M`, `L`, `C`, `S` und `Z` aus
den Stützpunkten (die Kontrollpunkte sind eine obere Schranke), für `A` aus der **Mittelpunktform**
des Bogens nach der SVG-Spezifikation (Anhang F.6.5). Ohne diese Umrechnung müßte man den Kreis um den
Bogen nehmen, und der ist bei einem Viertelbogen dreimal so groß wie der Bogen — die Prüfung schlüge
falsch Alarm und wäre damit wertlos.

## Was dieses Paket nicht tut

* **Keine Farben, keine Größen, keine Schriften.** Siehe oben.
* **Keine Animationen.** Ein Zeichen ist eine Zeichnung; Bewegung gehört zur Oberfläche.
* **Kein eigenes Bauen für den Browser.** Das Paket liefert TypeScript-Quellen und SVG-Dateien; wer
  Bündel braucht, baut sie mit seinem Werkzeug (Vite tut das hier von selbst, weil
  `apps/universe` das Paket als Arbeitsbereichsabhängigkeit liest).
