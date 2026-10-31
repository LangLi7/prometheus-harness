import { defineConfig } from 'vite'

/**
 * Die Welt — **nur noch gebaut, nicht mehr selbst ausgeliefert.**
 *
 * ## Was sich am 14.10.2026 geändert hat
 *
 * Der Betreiber: *„der ganze port ist mir bisschen zu piss 2 port offen zu haben ich möchte es als
 * ein port haben … und im folder: apps/universe anstatt in snapshot, dann alles in einem port."*
 *
 * Vorher hatte dieser Prototyp einen **eigenen Entwicklungsserver** auf Port 5176. Damit waren zwei
 * Adressen offen (Chat `:3081`, Welt `:5176`), und der Umschalter musste eine **fremde Herkunft**
 * kennen — mit allen Folgen: zwei Keks-Speicher, zwei Namen (`127.0.0.1` und `localhost`), und ein
 * Port, der beim Start belegt sein konnte.
 *
 * Jetzt gibt es **einen** Weg: `vite build` erzeugt `dist/`, und der **Host** liefert das Ergebnis
 * unter dem Pfad `/universe/` aus — auf **demselben** Port wie der Chat
 * (`packages/web/world-static`). Deshalb steht hier **kein** `server`- und **kein**
 * `preview`-Abschnitt mehr: es gibt keinen zweiten Port, den man versehentlich öffnen könnte.
 *
 * ## Warum `base: './'` — und warum das keine Kleinheit ist
 *
 * Die Welt liegt nicht an der Wurzel, sondern unter einem **Pfad**. Vite schreibt standardmäßig
 * absolute Adressen ins HTML (`/assets/index-*.js`); die zeigten dann auf die Wurzel des Harness —
 * also auf die **Chat**-Oberfläche, und die Welt bliebe schwarz. Mit `base: './'` werden die
 * Adressen **relativ** (`./assets/…`) und stimmen unter jedem Pfad.
 *
 * ## Was hier noch steht und warum
 *
 * `build.outDir`/`emptyOutDir`: das Ziel ist `dist/`, und es wird geleert — ein alter Bau soll nicht
 * neben dem neuen liegen bleiben. `dist/` ist über `.gitignore` ausgeschlossen (ein Bauergebnis
 * gehört nicht in die Geschichte des Projekts).
 *
 * ## Die gelbe Warnung „Some chunks are larger than 500 kB" — und warum sie zwei Zeilen kostet
 *
 * Am 27.10.2026 meldete jeder Bau **einen** Block von 751,47 kB (202,15 kB gzip). Die Ursache ist
 * nicht die Anwendung, sondern die **Grafikbibliothek**: `three` ist über `scene.ts`, `lighting.ts`,
 * `camera.ts` und `main.ts` eingebunden, und ihre WebGL-Kernschicht läßt sich nicht wegoptimieren —
 * gemessen sind es **534,50 kB** (132,35 kB gzip) in **einem** Modul.
 *
 * Die Zahl allein war also kein Befund über den eigenen Code; sie versteckte ihn nur. Deshalb zwei
 * Schritte, und zwar **beide**, weil keiner für sich reicht:
 *
 * 1. **Trennen** (`codeSplitting.groups`): die Bibliothek bekommt einen **eigenen** Block, die
 *    Anwendung einen zweiten. Ergebnis: `three` 534,50 kB, Anwendung 216,35 kB. Erst damit ist die
 *    Größe *unseres* Codes wieder eine eigene, lesbare Zahl — und ein Wachstum der Anwendung fällt
 *    am Anwendungsblock auf, nicht in der Summe.
 * 2. **Grenze anheben** (`chunkSizeWarningLimit`): die Vorgabe von 500 kB liegt **unter** der
 *    Bibliothek, also würde sie für immer warnen — auch bei unverändertem Anwendungscode. Eine
 *    Warnung, die sich nicht abstellen läßt, wird überlesen; sie erzieht dazu, die nächste zu
 *    überlesen. Die Grenze steht deshalb bei 600 kB: über dem gemessenen Bibliotheksblock (Luft für
 *    eine Aktualisierung von `three`), aber so weit unter einem gewachsenen Anwendungsblock, daß
 *    dieser den Bau weiterhin meldet, wenn er sich mehr als verdoppelt.
 *
 * **Was hier bewußt nicht steht.** Ein `import()` der Szene (das die Warnung selbst vorschlägt) würde
 * die 534 kB erst beim Öffnen der 3D-Ansicht laden — ein echter Gewinn für den Chat-Pfad. Es ist
 * trotzdem nicht Teil dieser Änderung: es braucht einen asynchronen Start in `main.ts`, und die
 * Warnung ginge davon **nicht** weg (der Bibliotheksblock bliebe über 500 kB). Zwei Ursachen, zwei
 * Änderungen — diese hier ist die, die den gelben Block beseitigt.
 */
export default defineConfig({
  // Siehe oben: die Welt wird unter einem Pfad ausgeliefert, nicht an der Wurzel.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Siehe oben: die Grafikbibliothek ist 534 kB groß und wäre unter der Vorgabe (500 kB) für immer
    // gemeldet. Die Grenze deckt genau diesen Block ab — kein Freibrief für den Anwendungscode.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Siehe oben: eigener Block für `three`, damit die Anwendung eine eigene Größe hat.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three/ }],
        },
      },
    },
  },
})
