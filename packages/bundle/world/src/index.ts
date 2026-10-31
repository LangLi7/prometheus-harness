/**
 * `@prometheus-harness/world` — das Bündel selbst hat keinen Laufzeitkörper.
 *
 * Seine Arbeit steht in `cordis.patch.yml`: drei Zeilen, die der Loader in den
 * Host einträgt. Diese Datei existiert nur, damit `exports["."]` auf etwas
 * zeigt und das Paket als Bündel vollständig ist.
 *
 * @module @prometheus-harness/world
 */

export {}
