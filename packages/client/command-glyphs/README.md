# `@prometheus-harness/client-command-glyphs`

Zeichen für Befehle, die der Kern nicht kennt — damit im `/`-Menü nicht vier Zeilen ein Bild haben
und fünf bloß Text sind.

| Befehl | Zeichen |
|---|---|
| `/bild`, `/image` | ein Bild: Rahmen, Sonne, zwei Grate |
| `/ui` | vier Karten, eine gefüllt |
| `/usage`, `/verbrauch` | die Messuhr des Kerns (Pfade wörtlich übernommen) |

## Warum es das Plugin gibt

Die Palette (`@deepseek-ai/dsh-client-ui-commands`) gibt einem Host-Befehl nur dann ein Zeichen,
wenn er in ihrer festen Tabelle steht: sie erkennt ihn an seiner Herkunft (`definitionId`) und holt
das Zeichen aus `HOST_FACES`. Ein Befehl aus einem Plugin steht dort nicht — und ein Client-Beitrag
kann ihn nicht überdecken, weil ein Beitrag mit demselben Namen laut kollidiert
(`contribution /ui collides with a host command`).

Dieses Plugin **zeichnet** die fehlenden Zeichen und stellt sie als Dienst `pmhCommandGlyphs`
bereit. Die Palette fragt diesen Dienst — das ist die **Naht**, und sie liegt nicht in diesem
Paket, sondern im Abhängigkeitsbaum: `scripts/client-naht.mjs` schneidet sie, `bun install` nimmt
sie wieder heraus.

## Bauen und prüfen

```powershell
bun run packages/client/command-glyphs/build.mjs            # bauen + prüfen
bun run packages/client/command-glyphs/build.mjs --pruefen  # nur prüfen
```

Die Prüfung tut drei Dinge, und keins davon ist Textvergleich allein:

1. **Rendern.** Jedes Zeichen wird mit echtem React (`react-dom/server`) in der Größe der Palette
   (14) aufgerufen und das Markup befragt: Raster 16, Strich 1, `currentColor`, Formenzahl.
2. **Naht am laufenden Code.** Das ausgelieferte Bündel der Palette wird ausgewertet, ihre
   `CommandUiRuntime` in einen echten Cordis-Kontext gebaut und `candidates()` mit einem Katalog aus
   eingebauten und eigenen Befehlen aufgerufen: `compact` trägt das Zeichen des Kerns, `ui` und die
   übrigen unseres, `skills` keins. Ohne den Dienst steht `ui` ohne Zeichen da — und wirft nicht.
3. **Herkunft der Messuhr.** Jeder Pfad der Messuhr muß im Bündel des Kerns vorkommen. Ändert der
   Kern sein Zeichen, wird die Prüfung rot.

Beide Wächter sind rot gesehen worden: ohne die Naht meldet (2) fünf Zeilen ohne Zeichen, mit einer
Zuordnung, die alles beantwortet, meldet (1) acht fremde Befehle.

## Die Naht

```powershell
bun scripts/client-naht.mjs            # schneiden (oder: schon genäht)
bun scripts/client-naht.mjs --pruefen  # nur nachsehen
```

Sie fügt in `candidates()` zwei Dinge ein: eine Methode `glyphFor(name)` (fragt den Dienst über den
Kontext) und die Zeile, die sie für Host-Zeilen ohne eingebautes Zeichen aufruft. Das Skript sucht
**Muster**, nicht Zeilennummern; findet es sie nicht, schreibt es nichts und nennt den Unterschied.
Nach jedem `bun install`, das die Palette neu auspackt, ist sie erneut zu schneiden — fehlt sie,
wird der Bau oben rot und nennt den Befehl.

Der Grund für ein Werkzeug statt `patches/`: `bunfig.toml` hält fest, daß dieses Projekt keinen
Patch im Abhängigkeitsbaum führt („`patches/` bleibt leer, `patchedDependencies` gibt es nicht").

## Wo es eingehängt ist

`scripts/profile-patch.mjs` (`EIGENE_PAKETE`) trägt den Paketnamen in die Patch-Schicht des Profils
ein. Eine Browser-Hälfte ohne diese Zeile gibt es nicht — der Kern baut die Startliste des Browsers
aus den aktivierten Ladeprogramm-Zeilen.
