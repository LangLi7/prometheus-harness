/**
 * `@prometheus-harness/crew-plugin` — das Cordis-Plugin für den Host.
 *
 * Hängt die Units ein: **Crew-Adapter** am Kern-Seam (`registerAdapter(['crew'])`), **Werkzeuge** in
 * der Tool-Registry (übersetzt durch `alsKernWerkzeug`) und die **Buchung** am `llm/stream`-Waterfall
 * — je Nutzer, durchgereicht statt verändert.
 *
 * Die Grenze, die bleibt und benannt ist: der Nutzer kommt aus der **Konfiguration**, nicht aus der
 * Sitzung. Ohne Nutzer startet das Plugin nicht — fail-closed.
 *
 * @module @prometheus-harness/crew-plugin
 */

export { alsKernWerkzeug, type BrueckenOptionen } from './tool-bridge.ts'

export { KONFIGURATIONSDATEI, konfigurationsdatei, liesKonfiguration, type Lesung } from './config-file.ts'

export {
  apply,
  applyAusDatei,
  applyMitKonfiguration,
  homeAusUmgebung,
  inject,
  kontoFuer,
  name,
  protokollAus,
  type HostKontext,
  type Konfiguration,
  type LoggerDienst,
  type Protokollplatz,
  type Protokoll,
} from './plugin.ts'
