# MiroFish-Report als PDF

Rendert einen fertigen MiroFish-Report als PDF. Die Vorlage folgt der Web-Ansicht:
`Step4Report.vue` setzt Titel und Fließtext in **Times New Roman**, Abschnittsnummern
und Kennungen in einer Mono-Schrift, dazu die schwarze `PREDICTION REPORT`-Plakette
und dünne Trennlinien. Genau das bildet `report-pdf.typ` ab.

## Aufruf

Am einfachsten über den Knopf **„Als PDF laden"** im Report-Tab der MiroFish-Oberfläche
(neben der Report-ID). Er fragt den lokalen Bridge-Dienst, der diesen Builder startet und
die PDF zurückgibt; der Browser lädt sie als Datei herunter. Voraussetzung: der Bridge
läuft (`integrations/mirofish-bridge`) und die Oberfläche ist über
`http://localhost:3000` oder `http://127.0.0.1:3000` geöffnet. Von einer LAN-Adresse aus
verweigert der Bridge den Aufruf, weil die Route den Origin prüft statt einen Token.

Von Hand:

```powershell
# neuester abgeschlossener Report
node build.mjs

# ein bestimmter Report
node build.mjs report_99e9fefe6fc1

# zusätzlich als Kopie in den Report-Ordner im Container
node build.mjs report_99e9fefe6fc1 --copy
```

Die PDF landet in `out/<report_id>.pdf`, der erzeugte Typst-Quelltext daneben in
`out/<report_id>.typ`. Beides ist Wegwerfmaterial und muss nicht versioniert werden.

## Woher die Daten kommen

Das Backend legt pro Report einen Ordner ab:

```
/app/backend/uploads/reports/<report_id>/
  outline.json    { title, summary, sections: [{ title, content }] }
  meta.json       { report_id, simulation_id, … }
```

`content` ist Markdown. `build.mjs` liest die Dateien per `docker exec cat` aus dem
Container `mirofish` (überschreibbar mit `MIROFISH_CONTAINER`) und übersetzt den
Teil, den MiroFish tatsächlich erzeugt: Überschriften, fett, Blockzitate,
Aufzählungen, Absätze.

## Voraussetzungen

- `typst` im `PATH` (getestet mit 0.14.2)
- der laufende Container mit dem Report-Volume
- Schriften: **Times New Roman** (Systemschrift unter Windows) und
  **DejaVu Sans Mono** für Nummern und Kennungen. Fehlt Times, fällt Typst auf
  seine Standardschrift zurück und das Layout wird sichtbar anders.

## Was nicht übernommen wird

- Die Abschnitte sind in der Web-Ansicht einklappbar, im PDF stehen sie offen.
- Sprachauswahl, Fortschrittsleiste und Hover-Zustände entfallen.
- Seitenumbrüche sind neu; die Web-Ansicht kennt keine Seiten.

## Stand

Erzeugt aus `report_99e9fefe6fc1` (Schweizer IT-Dienstleister, 150 Personas,
25 Runden): 6 Seiten, 161 KB, deutscher Titel und deutsche Abschnitte.
