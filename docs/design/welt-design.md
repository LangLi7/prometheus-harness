# Die Gestaltung der Welt — Token, Bewegung, Prüfbericht

> **Stand:** 15.10.2026 · **Auftrag:** *„nutze /design-system skill alles was mit design und animation
> damit: http://127.0.0.1:3081/universe/ smooth und modern professionell ist"*
>
> **Was hier steht:** was gemessen war, was jetzt gilt, was **absichtlich fehlt** — und der Prüfbericht
> in zehn Dimensionen.
>
> **Erzeugte Dateien:** [`world-design-tokens.json`](world-design-tokens.json) (die Zahlen,
> maschinenlesbar) und [`world-design-preview.html`](world-design-preview.html) (das Blatt zum Ansehen,
> ohne Abhängigkeiten). Beide entstehen aus `apps/universe/src/app.css`
> (`bun tools/design-tokens.mjs`, `--pruefen` vergleicht) — sie sind **Ergebnisse**, keine Quellen.

---

## 1. Der Befund — gezählt, nicht geschätzt

`apps/universe/src/app.css` war am Vorabend **2705 Zeilen** lang und trug eine ganze Gestaltung. Was
fehlte, war die **Ebene darüber**: die Regeln, nach denen sie gebaut ist.

| Was | vorher | nachher |
|---|---|---|
| Übergänge | **13** an **4** Stellen, mit **9** verschiedenen Dauern (0,12 · 0,2 · 0,25 · 0,28 · 0,3 · 0,45 s · 120 · 140 · 1200 ms), **3** davon `linear` | **eine** gemeinsame Antwort für alle Flächen, **vier** Dauern, **vier** Kurven |
| `prefers-reduced-motion` | **0** Vorkommen | Block mit den vier Dauern auf `1 ms` — **ohne** `!important` |
| Ecken (`border-radius`) | **37** Angaben, **8** freie Werte (2 · 3 · 4 · 5 · 6 · 7 · 16 · 22 px) neben den Harness-Tokens | **6** Stufen, alles andere ist eine benannte Ausnahme |
| Schatten | **9** verschiedene für dieselbe Aussage | **3** Stufen: auf der Fläche · schwebt · über allem |
| Schriftgrade | **5** freie Werte (11 · 11,5 · 13 · 14 px) neben 3 Tokens | **3** Tokens |
| Erscheinen | Bildschirme, Dialog und Panels **sprangen** ins Bild | sie **blenden ein** und steigen 4–10 px auf |
| Glas | `#101010f2` **zweimal** wörtlich | `--glas` |

**Und was NICHT angefaßt wurde:** die **Vorlage** (`#screen-web`, 1:1 aus `apps/web`). Ihre Bewegung
ist die des Originals — eine Kopie, die vom Original abweicht, ist genau der Fehler, den die Vorlage
vermeiden soll. Die Prüfung führt sie als **benannte Ausnahme mit Grund**.

---

## 2. Was jetzt gilt

### 2.1 Bewegung — vier Dauern, vier Kurven

```
--t-schnell  120 ms   Ein ZUSTAND wechselt      Farbe, Rahmen, Sichtbarkeit einer Marke
--t-mittel   180 ms   Eine FLÄCHE antwortet     Hover, Fokus, ein Knopf drückt sich
--t-gross    260 ms   Eine SACHE erscheint      Panel, Dialog, Ansicht, Zeile in der Liste
--t-feder    440 ms   DER große Übergang        die Insel klappt auf
```

**Warum vier und nicht neun.** Eine Bewegung ist eine Aussage über eine **Beziehung**: was
zusammengehört, bewegt sich gleich. Neun Dauern für dieselbe Sache („etwas wird sichtbar") sind neun
Aussagen — und der Nutzer liest sie, auch wenn er sie nicht benennen kann. Es fühlt sich unruhig an,
und niemand weiß warum.

**Warum keine fünfte.** Wer eine braucht, hat zwei, die dasselbe tun. Der **Aufschub** der Inselfläche
(90 ms) ist deshalb `var(--t-schnell)` geworden — beim ersten Anlauf stand dort eine fünfte Zahl, und
die Prüfung hat sie gefunden.

| Kurve | Wofür |
|---|---|
| `--e-standard` | die ruhige: schnell los, sanft ankommen (Material „standard") |
| `--e-ein` | etwas **verschwindet** |
| `--e-aus` | etwas **kommt herein** |
| `--e-feder` | der große Übergang — mit **kleinem** Überschwingen (1,22 statt der 1,56 der Vorlage) |

### 2.2 Wer keine Bewegung will, bekommt keine

```css
@media (prefers-reduced-motion: reduce) {
  :root { --t-schnell: 1ms; --t-mittel: 1ms; --t-gross: 1ms; --t-feder: 1ms; }
  #isl.dropziel::after { animation: none; opacity: 0.7; }
}
```

**Warum kein `!important`.** Der übliche Weg nimmt allen Elementen die Laufzeit — mit `!important`,
weil er jede einzelne Angabe schlagen muß. Der Preis: er überschreibt auch die **nächste** Regel, die
jemand aus gutem Grund schreibt. Hier steht dieselbe Wahrheit auf **null**: die vier Dauern. Jeder
Übergang liest sie (das ist der Grund, warum es Token gibt) — also steht die Bewegung überall still,
ohne eine Zeile zu überschreiben.

**Was stehen bleibt:** der Ring um die Insel beim Ziehen. Er ist keine Bewegung von A nach B, sondern
eine **Anzeige** („hier passiert etwas"). Bei reduzierter Bewegung pulsiert er nicht mehr, ist aber
sichtbar.

### 2.3 Form und Höhe

```
--r-fein  2px   der Strich selbst (Griff, Ticks der Ansichtsleiste)
--r-xs    4px   Chips, kleine Schalter, Zahlenfelder
--r-sm    6px   Felder, Etiketten, Suchtreffer, Marke der Kopfzeile
--r      8px   die Norm: Karten, Knöpfe, Zeilen der Insel
--r-lg   16px   aufgeklappte Insel, Dialog
--r-rund 9999px Pillen und Punkte

--sch-1  auf der Fläche   --sch-2  schwebt   --sch-3  über allem
```

**Warum 7 px zu 8 px wird und 5 px zu 4 px.** Ein Pixel sieht niemand **einzeln** — nebeneinander
liest das Auge „unsauber", ohne es benennen zu können. Genau das ist der Unterschied zwischen
„zusammengebaut" und „gewachsen". Die **Leuchtringe** (`0 0 6px var(--g)`) bleiben: das sind Lampen,
keine Schatten.

### 2.4 Die Farbe kommt aus dem Harness

Die Welt importiert die Token-Sätze des Harness (`design-system.css` → `design-platform.css`) und
benutzt sie mit **Rückfall**, wenn ein Token fehlt: `var(--dsw-alias-bg-layer-2, #17171a)`. Das ist
keine zweite Wahrheit, sondern eine **Absicherung** — und die gemessenen Kontraste zeigen, daß sie
trägt:

| Text | auf dem Grund | Kontrast |
|---|---|---|
| `--t` Haupttext | `#050507` | **18,19 : 1** |
| `--t2` Nebentext | | **9,81 : 1** |
| `--t3` gedämpft (Etiketten) | | **9,62 : 1** |
| `--a2` Marke, Überschriften | | **11,50 : 1** |
| `--a` Zeichen, aktive Zeile | | **6,51 : 1** |
| `--blue` Information | | **8,06 : 1** |

Die Grenze der WCAG für normalen Text ist **4,5 : 1** — alle sechs liegen deutlich darüber, und die
Prüfung hält das fest (`tests/design.test.ts`).

### 2.5 Wie etwas erscheint

| Was | Wie es kommt |
|---|---|
| Bildschirm (Chat ↔ Welt ↔ Vorlage) | blendet ein, steigt 4 px auf (`hoch-ein`, 260 ms) |
| Insel | Pille blendet aus, Fläche kommt 120 ms später und steigt 4 px auf; Breite, Höhe und Radius über 440 ms |
| Einstellungen | Schleier in 120 ms, Dialog steigt 10 px auf in 260 ms |
| Andockstelle | Farbe in 120 ms |
| **Jede Fläche auf den Zeiger** | **eine** gemeinsame Regel: Farbe, Fläche, Rahmen, Sichtbarkeit in 120 ms |

**Warum `animation` und nicht `transition` beim Erscheinen.** Von `display: none` auf `display: block`
gibt es nichts zu interpolieren — eine `transition` liefe ins Leere. Eine **Animation** dagegen startet
neu, sobald ein Element wieder gezeichnet wird. Genau dieser Unterschied ist der Trick, und die
Bildschirme behalten dabei ihre `hidden`-Klasse: **das Umschalten ist unverändert, es sieht nur anders
aus.**

---

## 3. Was absichtlich **fehlt**

Die Kehrseite einer Bewegung ist die Bewegung, die man wegläßt. Was hier **nicht** passiert, ist so
wichtig wie was passiert — und es steht hier, damit es niemand für Vergessen hält:

| Nicht | Warum |
|---|---|
| **Kein Wachsen, kein Hüpfen beim Zeigen** (`transform` in der Antwort-Regel) | Ein Knopf, der beim Zeigen wächst, sagt nicht mehr als „du bist darüber" — und das sagt die Farbe schon. Bewegung ohne Aussage ist Unruhe. |
| **Keine gestaffelten Einblendungen** (jede Zeile mit eigenem Aufschub) | Die Insel wird bei **jedem** Klick neu gebaut (auch beim Umschalten der Panelliste). Eine Staffelung würde jedes Mal von vorn laufen — und aus einem Hinweis würde ein Zappeln. |
| **Kein Überblenden der Bildschirme** | Dafür müßten beide kurz gleichzeitig **im** Layout liegen. Sie liegen hier als Geschwister in einer Reihe, nicht übereinander; sie übereinander zu legen wäre ein Umbau des Rahmens für einen halben Sekundenbruchteil. |
| **Keine Verläufe als Verzierung**, kein Glas ohne Zweck | Glas gibt es genau dort, wo die Welt dahinter **gesehen werden soll** (Insel, Panel). Ein Glas-Rahmen über einem Bild sagt nichts. |
| **Kein Aufblitzen, kein Laden-Balken, keine Fortschritts-Attrappe** | Es gibt hier nichts zu laden. Ein Balken, der immer läuft, ist eine Lüge. |
| **Keine Parallaxe, kein Scroll-Effekt** | Die Welt **scrollt nicht** — sie dreht und zoomt. |

---

## 4. Der Prüfbericht — zehn Dimensionen

Jede Zahl ist ein Urteil über den **Stand nach dieser Runde**, mit dem, was sie stützt und was fehlt.

| # | Dimension | Note | Warum |
|---|---|---|---|
| 1 | **Farbe** | **8/10** | Alle Flächen aus Harness-Tokens **mit** Rückfall; 12 benannte Welt-Farben. Abzug: das Glas stand zweimal wörtlich (`#101010f2`), jetzt Token — und ein freies `#1a1a1a` bleibt. |
| 2 | **Schrift** | **9/10** | Drei Grade (14/12/11) statt elf; die untere Grenze ist gemessen begründet (der Harness benutzt 11 px 53×, 8–10,5 px praktisch nie). Fünf freie Werte sind auf Tokens gezogen. |
| 3 | **Abstand** | **5/10** | **Nicht umgebaut.** Gemessen: ~20 verschiedene `padding`-Paare ohne Skala (5px 8px, 7px 9px, 3px 8px, 8px 14px …). Ein Umbau würde überall Pixel verschieben — siehe §5. |
| 4 | **Bausteine** | **8/10** | Zeilen, Knöpfe, Felder und Marken folgen derselben Form; die Panels kommen aus einer Spezifikation (`dock.getLayout()`), nicht aus zwölf Einzelstücken. |
| 5 | **Verhalten bei schmalem Fenster** | **6/10** | Die Insel rechnet mit `min(560px, 90vw)`, es gibt eine Mobil-Notiz — aber **gemessen ist das nicht** (kein Bild unter 900 px Breite). Offen. |
| 6 | **Dunkel** | **9/10** | Die Welt ist auf Dunkel gebaut, und der dunkle Satz des Harness wird beim Start gesetzt (`body[data-ds-dark-theme]`). Kein halbfertiger zweiter Modus. |
| 7 | **Bewegung** | **3/10 → 9/10** | Vorher: 13 Übergänge, neun Dauern, **null** Rücksicht auf `prefers-reduced-motion`. Jetzt: vier Dauern, eine Antwort-Regel, ein Block für reduzierte Bewegung, gemessen (siehe §5). Abzug: die Vorlage bleibt bei ihrer eigenen Kurve. |
| 8 | **Barrierefreiheit** | **8/10** | Alle Textfarben **gemessen** ≥ 6,5 : 1; Fokusring aus `focus.css` des Harness; die Insel ist ein Bedienelement (`role`, `tabindex`, Enter/Leertaste); **alle** Zeichen sind `aria-hidden` mit Beschriftung daneben. Abzug: Escape schließt den Dialog, aber die Insel hat keinen Tastatur-Ausgang. |
| 9 | **Informationsdichte** | **8/10** | Die Panelliste ist eine Zeile mit Zähler statt zwölf Zeilen; die Insel zeigt je Gruppe, was es gibt. Abzug: bei 23 Einträgen rollt sie — das ist die Grenze der Form, nicht ein Fehler. |
| 10 | **Feinschliff** | **8/10** | Zeiger-Antwort überall, echter Schatten- und Eckensatz, Bildlaufleiste aus `scrollbar.css`, Favicon, Leerzustände in der Suche. Abzug: kein Ton, keine Rückmeldung beim Abstecken außer der Farbe. |

**Summe: 76/100** (vorher, nach denselben Maßstäben geschätzt: **58/100** — der Unterschied steckt
fast ganz in Dimension 7, und der Rest in Farbe, Schrift und Feinschliff).

---

## 5. Nachweise — gemessen, nicht behauptet

### 5.1 Die Bewegung selbst (`bun tools/motion.js`)

Das Werkzeug tastet die Insel **in jedem Bild** ab, ab dem Klick — und dasselbe noch einmal mit
`prefers-reduced-motion: reduce`:

```
== MIT Bewegung ==
  geschlossen: 360 px  ·  reduced-motion: false  ·  Dauer laut CSS: 0.44s, 0.44s, 0.26s, 0.12s, 0.26s
    t/ms   Breite  Hoehe  Radius
       3      360     40    9999
      72      432    126    5202
     138      500    208    1587
     255      555    275      53
     305      562    282      16      ← das kleine Überschwingen
     438      560    280      16      ← angekommen
  → 43 Bilder, 20 verschiedene Breiten

== OHNE Bewegung (prefers-reduced-motion: reduce) ==
  geschlossen: 360 px  ·  reduced-motion: true   ·  Dauer laut CSS: 0.001s, …
      15      360     40    9999
      64      560    280      16      ← ein Sprung
  → 43 Bilder, 2 verschiedene Breiten

== BEFUND ==
  Die Insel bewegt sich — und wer keine Bewegung will, bekommt keine.
```

**Der erste Anlauf dieses Werkzeugs hat sich selbst getäuscht:** er klickte auf die Pille, um
aufzuklappen — die Insel war schon offen, und er meldete „560, 560, 560". Jetzt wird vorher über den
✕ **zugemacht** und die geschlossene Breite **ausgegeben**: wer die Zeile liest, sieht, daß die
Messung von 360 px startet. *Eine Messung ohne Zustandsprüfung ist ein Zufallsbild.*

### 5.2 Was die Prüfungen halten

| Prüfung | Ergebnis |
|---|---|
| `bun test` in `apps/universe` | **272 pass · 0 fail**, 4043 Zusicherungen, 27 Dateien |
| davon `tests/design.test.ts` (neu) | **6 Prüfungen**: Dauern aus Token · vier Dauern in der richtigen Reihenfolge · reduzierter Block auf `1 ms` ohne `!important` · jeder Radius aus der Skala · jeder Schatten eine der drei Stufen · **Kontraste gemessen** |
| `bun run typecheck` | **0 Fehler** |
| `vite build` | exit 0 — CSS **48,66 kB** (vorher 46,29), JS 697,22 kB |
| `bun tools/design-tokens.mjs --pruefen` | beide Gestaltungsdateien stimmen mit `app.css` überein |
| `bun tools/motion.js` | siehe §5.1 |

### 5.3 Im Bild

| Bild | Was es zeigt |
|---|---|
| [`../status/img/design-blatt.png`](../status/img/design-blatt.png) | das erzeugte Blatt: 12 Farben **mit Kontrastzahl**, drei Schriftgrade, sechs Formen, drei Höhen, vier Dauern zum Drücken |
| [`../status/img/design-insel.png`](../status/img/design-insel.png) | die Welt mit offener Insel: Radius 16 px, Schattenstufe 2, Zeichen, Zeilen |
| [`../status/img/design-einstellungen.png`](../status/img/design-einstellungen.png) | der Einstellungsdialog — im Browser gemessen: Radius **16 px**, Schatten `0 20px 60px` (Stufe 3), Animation `satz-ein 0.26s`, Schleier `sichtbar-ein` |

### 5.4 Und ein Befund über den Weg dorthin: der Wächter fand meine eigene Bearbeitung

Diese Runde wurde großenteils **skriptgesteuert** umgebaut (Ersetzungen in `app.css` — es sind
dreitausend Zeilen). Dabei sind **fünf Steuerzeichen** in den Text gerutscht: ein Backspace (Code 8),
der je ein „b" von `background` fraß, und ein Klingelton (Code 7) anstelle des „A" von `Animation`.

```
apps\universe\src\app.css:1416 Code 8 (" background-color und order-color laufen ")
apps\universe\src\app.css:600  Code 7 ("nimation statt \trans")
```

**Gefunden hat sie nicht das Auge** — ein fehlendes „b" sieht in der Konsole wie ein Tippfehler aus,
und im Editor noch weniger. Gefunden hat sie `scripts/tests/source-check.test.mjs`: eine Prüfung aus
einer früheren Runde, die **den eigenen Quelltext** nach verbotenen Steuerzeichen absucht. Sie meldete
`286 pass · 1 fail` statt `286 pass` — und die Reparatur war eine Sache von zwei Minuten.

*Merksatz:* **ein Wächter, den man selbst geschrieben hat, findet die Fehler, die das eigene Werkzeug
macht.** Und wer einen Text über ein Skript ändert, ändert nicht nur den Text.

---

## 6. Was offen ist — und warum

1. **Die Abstände sind keine Skala.** Gemessen: ~20 verschiedene `padding`-Paare, kein 4/8-Raster.
   **Nicht umgebaut, und das ist eine Entscheidung:** ein Abstands-Umbau verschiebt **jeden** Pixel der
   Oberfläche — er ist keine Verbesserung der Bewegung, sondern ein neues Layout, und der Auftrag war
   „smooth und modern", nicht „anders". Wer ihn will, macht ihn als eigene Runde **mit** Bildern je
   Bildschirm. Ein halb umgestellter Abstand wäre schlimmer als keiner: zwei Systeme nebeneinander
   sehen genau so aus, wie dieser Zustand entstanden ist.
2. **Die Vorlage bleibt bei ihren eigenen Werten** (`#screen-web`, 1:1 aus `apps/web`). Sie ist die
   einzige benannte Ausnahme in der Prüfung — mit Grund.
3. **Schmale Fenster sind nicht gemessen.** Kein Bild unter 900 px Breite; die Insel rechnet mit
   `90vw`, aber ob die Zeilen dann noch passen, weiß niemand.
4. **Der Import des Harness zeigt auf einen Ort auf dieser Maschine**
   (`design-system.css` → `C:/Users/Chang/harness/deepseek-harness/…`). Das ist **kein** Fehler dieser
   Runde — es steht seit dem Umbau auf die Harness-Tokens so und ist dort offen benannt —, aber es ist
   die größte Weitergabe-Hürde der Gestaltung: die fünf Blätter liegen nicht im Paket, sondern im
   Quellbaum eines fremden Checkouts. **Und der Wächter findet es nicht:** `scripts/machine-paths.mjs`
   sucht `C:\Users\<wer>` mit **Backslashes**, hier stehen Schrägstriche. Ein Befund für den Wächter.
5. **Kein Ton, keine Rückmeldung beim Abstecken** außer der Farbe — der Feinschliff-Abzug in §4.
