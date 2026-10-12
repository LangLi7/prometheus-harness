/**
 * Hintergrund.
 *
 * Angefordert war: **nur der schwarze Hintergrund, ohne Objekte, Farbe wie in der Vorlage.**
 * Deshalb steht hier nichts weiter als die dunkle Fläche mit dem Farbverlauf aus
 * H:\Projekt\Programmieren\Prometheus\webui\src\lib\Universe.svelte (<style>, Zeile 397):
 *
 *   radial-gradient(ellipse at 50% 35%, #0c0a10, #050507 75%)
 *
 * Bewusst **nicht** übernommen — das waren die Objekte der Vorlage, nicht ihr Hintergrund:
 * Kern, Leuchtring, Akkretionsscheibe, Modell-Knoten, Heartbeat-Ring, Sternenfeld sowie
 * Kamera und OrbitControls. `three` ist damit derzeit ungenutzt.
 *
 * Statt eines `<canvas>` steht hier ein `<div>`: ohne WebGL-Zeichnung wäre ein Canvas ein
 * leeres Element mit Ballast. Klasse und Farben bleiben dieselben.
 */
import './Universe.css'

export default function Universe() {
  return <div className="universe" aria-hidden="true" />
}
