/**
 * `scripts/world-path.mjs` — **wo die Welt liegt: ein Pfad, kein zweiter Port.**
 *
 * ## Warum das eine eigene Datei ist
 *
 * Die Angabe wird an **drei** Orten gebraucht, die nichts voneinander wissen:
 *
 * | Wer | Wozu |
 * |---|---|
 * | `packages/web/world-static` | liefert die gebaute Welt unter diesem Pfad aus |
 * | `packages/client/world-switch` | der Umschalter im Chat öffnet genau diesen Pfad |
 * | `scripts/start.mjs` | baut die Welt und gibt die Adresse aus |
 *
 * Drei Nennungen derselben Sache driften — und zwar **still**: der Umschalter zeigt dann auf einen
 * Pfad, unter dem nichts liegt, und das sieht aus wie ein kaputter Knopf statt wie eine veraltete
 * Angabe. Deshalb steht der Wert hier, `start.mjs` liest ihn, und der Bündel-Prüfer
 * (`scripts/client-buendel.mjs`) vergleicht ihn mit dem, was **wirklich im gebauten Bündel steht**
 * **und** mit dem, was der Auslieferer (`packages/web/world-static`) nennt. Driftet eine Seite,
 * fällt der Bau **rot** aus.
 *
 * ## Warum nicht mehr 5176 — der Befund, der es geändert hat
 *
 * Bis zum 14.10.2026 hatte die Welt einen **eigenen** Entwicklungsserver auf Port `5176`; hier stand
 * damals `WELT_PORT`/`WELT_URL`. Der Betreiber: *„der ganze port ist mir bisschen zu piss 2 port
 * offen zu haben ich möchte es als ein port haben … und im folder: apps/universe anstatt in
 * snapshot, dann alles in einem port."*
 *
 * Zwei Ports hießen zwei **Herkünfte**, und das musste einzeln repariert werden: zwei Keks-Speicher,
 * zwei Namen (`127.0.0.1` und `localhost`), eine Adresse, die der Umschalter **mitschicken** musste,
 * und ein Port, der beim Start belegt sein konnte. Mit einem Pfad auf **derselben** Herkunft fällt
 * das alles weg: die Welt liegt neben dem Chat, und der Weg dorthin ist ein Wechsel des Pfades.
 *
 * @module scripts/world-path
 */

/**
 * Der Pfad, unter dem die Welt ausgeliefert wird — **ohne** Schlußstrich.
 *
 * Der Schlußstrich fehlt nicht zufällig: `WebRoute.path` des Kerns verlangt einen absoluten Pfad
 * **ohne** ihn (`packages/web/world-static`), und der Auslieferer leitet `/universe` auf
 * `/universe/` um (die `index.html` lädt ihre Dateien relativ — siehe `base: './'` in
 * `apps/universe/vite.config.ts`).
 */
export const WORLD_PATH = '/universe'

/**
 * Der Ordner der Welt, **relativ zur Projektwurzel**.
 *
 * `start.mjs` baut genau diesen Ordner. Ein absoluter Pfad stünde hier falsch: das Projekt liegt auf
 * jedem Rechner woanders, und ein Pfad, der nur auf einem gilt, ist der Fehler, den
 * `scripts/maschinenpfade.mjs` sucht.
 */
export const WORLD_APP_DIR = 'apps/universe'

/** Der Name des Ordners, in dem der Bau liegt (relativ zu {@link WORLD_APP_DIR}). */
export const WORLD_DIST_DIR = 'dist'

/**
 * Die vollständige Adresse der Welt für eine gegebene Herkunft.
 *
 * @param herkunft - die Herkunft des Harness, z. B. `http://127.0.0.1:3081` (ohne Schlußstrich)
 * @returns die Adresse der Welt, z. B. `http://127.0.0.1:3081/universe/`
 */
export function worldUrl(herkunft) {
  return `${String(herkunft).replace(/\/+$/u, '')}${WORLD_PATH}/`
}
