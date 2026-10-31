/**
 * `@prometheus-harness/modlens` — die Bildbrücke als Prometheus-Unit.
 *
 * ## Was hier gebaut ist
 *
 * Drei Stücke, die zusammen die Fähigkeit „ein Bild lesen" ergeben, ohne Netz im Paket:
 *
 * 1. **Ausstattung** (`src/config.ts`) — findet `~/.modlens/config.json` (oder `$MODLENS_CONFIG`)
 *    und sagt, ob ein Anbieter bereit ist. Den **Schlüssel** gibt sie nie zurück, nur die Tatsache,
 *    daß einer gesetzt ist. Gemessen am 18.10.2026 auf dieser Maschine: `provider: "openai"`, Basis
 *    `https://api.deepseek.com`, Modell `deepseek-flash`, Schlüssel **vorhanden**.
 * 2. **Engine** (`src/engine.ts`) — baut den Kindprozeß (`node <cli> -i <bild> --timeout …`) und
 *    liest die Antwort `{ image, provider, result, meta }`. Ein `result` ohne `summary` ist **kein**
 *    Leseergebnis und wird geworfen.
 * 3. **Werkzeug** (`src/tool.ts`) — `modlens_read_image` als `AgentTool` für den Loop: Pfad oder
 *    URL hinein, Evidenz als JSON heraus.
 *
 * ## Was hier ausdrücklich NICHT gebaut ist
 *
 * - **Kein Cordis-Plugin.** Die Anmeldung im Host (eine Zeile in `EIGENE_PAKETE`, ein
 *   `ctx.tools.register`) ist ein eigener Zug — dieses Paket ist der Kern, den sie einhängt.
 * - **Kein Bildteil im Seam.** Die Evidenz kommt als **Text** an; der Seam von Prometheus trägt
 *   keine Bilder (`MessagePart`). Genau deshalb ist die Brücke nötig und nicht überflüssig.
 * - **Kein Netz, kein Schlüssel im Code.** Der Aufruf geht an die CLI; was sie mit dem Schlüssel
 *   tut, ist ihre Sache und steht in ihrer Konfiguration.
 *
 * @module @prometheus-harness/modlens
 */

export {
  entschaerfe,
  konfigurationsPfad,
  liesAusstattung,
  type Ausstattung,
} from './config.ts'

export {
  STANDARD_ZEITLIMIT_MS,
  baueAufruf,
  liesAntwort,
  type Antwort,
  type Aufruf,
  type Bildauftrag,
  type Evidenz,
  type Region,
} from './engine.ts'

export { WERKZEUGNAME, modlensWerkzeug, type Ausfuehren, type ModlensOptionen } from './tool.ts'
