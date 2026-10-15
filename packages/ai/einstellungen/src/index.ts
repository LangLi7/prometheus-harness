/**
 * `@prometheus-harness/einstellungen` — die Einstellungen des Endnutzers als **Datei**.
 *
 * ## Warum zuerst eine Datei und nicht eine Oberfläche
 *
 * Weil sie **sofort benutzbar** ist: eine Datei ist in einer Minute geschrieben und in einer Minute
 * gelesen, eine Oberfläche in Tagen. Und weil die Oberfläche später nur noch **darauf zeigen** muß
 * — sie liest und schreibt dieselben Funktionen, statt eine zweite Wahrheit aufzumachen.
 *
 * ## Was hier nicht hineingehört
 *
 * **Keine Schlüssel.** Sie gehören in den Schlüsselspeicher. Diese Datei wird angezeigt, geteilt,
 * gesichert und verglichen; ein Schlüssel darin wäre überall mit dabei. Die Struktur hat für ihn
 * **keinen Platz** — das ist besser als ein Verbot, denn ein Verbot vergißt man.
 *
 * ## Warum es keine Vorgabemodelle gibt
 *
 * Der Betreiber hat entschieden: **welches Modell läuft, wählt der Endnutzer.** Ein Vorgabewert im
 * Quelltext wäre eine Entscheidung, die niemand getroffen hat — und die Rechnung käme später.
 * Ohne Wahl ist der Anbieter für die Fähigkeit **nicht bereit**, und die Kette läuft weiter bis zum
 * Menschen.
 *
 * @module @prometheus-harness/einstellungen
 */

export {
  DENKSTUFEN,
  FASSUNG,
  VORGABE,
  EinstellungenFehler,
  denkhilfeAn,
  leseEinstellungen,
  mitDenken,
  mitDenkhilfe,
  mitStufen,
  mitWahl,
  modelleFuer,
  ohneWahl,
  schreibeEinstellungen,
  wahlFuer,
  type Denkstufe,
  type Einstellungen,
  type Wahl,
} from './einstellungen.ts'

export {
  DATEINAME,
  EIGENES_HAUS,
  FREMDES_HAUS,
  eigenesZuhause,
  istFremdesZuhause,
  ladeEinstellungen,
  pfadDerEinstellungen,
  sichereEinstellungen,
  unserPfad,
} from './datei.ts'
