/**
 * Öffentliche Fläche des Plugin-Managers `@prometheus-harness/unit-system`.
 *
 * **Die eine Idee.** Ein Unit ist kein Ordner, den man kopiert, sondern ein
 * Eintrag in einer **Deklaration**. Aus der Deklaration entsteht ein
 * **Abschluß**; aus dem Abschluß eine **Generation** mit Fingerabdruck; aus der
 * Generation ein **Zeiger**, den man umlegen kann. Genau das ist der
 * NixOS-Bauplan — und der Grund, warum „weitergeben" und „umschalten" derselbe
 * Vorgang mit verschiedener Quelle sind.
 *
 * ```ts
 * import { baue, schalte, zustand, exportiere, importiere } from '@prometheus-harness/unit-system'
 *
 * const gebaut = await baue({ projectRoot: '.' })            // wirkt nicht
 * const status = await zustand({ projectRoot: '.' })        // was läuft, was driftet
 * await schalte({ projectRoot: '.', nummer: 3, art: 'boot' })
 * await exportiere({ projectRoot: '.', out: 'meine.pmhimpl' })   // signiert
 * await importiere({ projectRoot: '.', datei: 'seine.pmhimpl' }) // landet auf `next`
 * ```
 *
 * **Was dieses Paket nicht tut:** es startet nichts, hängt nichts ein und
 * schreibt keine Datenbank. Es führt Buch. Das Einhängen in den laufenden Host
 * ist ein eigener Schritt und steht als Grenze im README.
 */

// --- Hashing und Abdrücke ---
export {
  digestLabel,
  hashFile,
  inhaltsDigest,
  kanonisch,
  sammleDateien,
  sha256Hex,
  zuPosix,
  type DateiAbdruck,
} from './hash.ts'

// --- Deklaration ---
export {
  DECLARATION_DIR,
  DECLARATION_FILE,
  DECLARATION_FORMAT,
  STANDARD_PRUEF_FRIST_MS,
  VORGABE_WURZELN,
  declarationPath,
  parseDeclaration,
  readDeclaration,
  type Declaration,
  type DeclarationPolicy,
  type DeclarationSource,
  type DeclaredCheck,
  type DeclaredFile,
  type DeclaredUnit,
} from './declaration.ts'

// --- Abschluß ---
export {
  abdrueckeDerDateien,
  loeseAbschluss,
  type Closure,
  type ClosureFile,
  type ClosureRequest,
  type ClosureResult,
  type ClosureUnit,
} from './closure.ts'

// --- Prüfbau: das Tor vor jedem Wechsel ---
export {
  STANDARD_AUSFUEHRUNG,
  fuehrePruefbauAus,
  type Pruefbau,
  type Schrittauffuehrung,
  type SchrittErgebnis,
} from './pruefbau.ts'

// --- Generationen, Zeiger, Journal ---
export {
  GENERATION_FORMAT,
  STATE_DIR,
  deklarationsDigest,
  fingerabdruck,
  generationDatei,
  journalAnhaengen,
  journalLesen,
  layoutFor,
  legeLayoutAn,
  leseGeneration,
  leseZeiger,
  listGenerationen,
  naechsteNummer,
  ordnerName,
  raeumeAuf,
  schreibeGeneration,
  schreibePruefung,
  schreibeZeiger,
  vergleiche,
  type GenerationInhalt,
  type GenerationRecord,
  type GenerationsVergleich,
  type JournalEintrag,
  type StateLayout,
  type UnitAenderung,
  type ZeigerName,
} from './generation.ts'

// --- Vorgänge ---
export {
  abschluss,
  baue,
  hostAus,
  liste,
  pruefe,
  pruefeGeneration,
  raeume,
  rolleZurueck,
  schalte,
  unitImBestand,
  vergleicheGenerationen,
  zustand,
  type BauErgebnis,
  type BasisAnfrage,
  type ListenEintrag,
  type PrufBericht,
  type PruefGenerationErgebnis,
  type Quittung,
  type RueckwegErgebnis,
  type UmschaltArt,
  type UmschaltErgebnis,
  type ZugLage,
  type ZustandsBericht,
} from './operations.ts'

// --- Laufzeit: die Generation wirklich einhängen ---
export {
  UnitRuntime,
  type RuntimeAnfrage,
  type RuntimeZustand,
  type Uebersprungen,
} from './runtime.ts'

// --- Prüfrahmen: ein HTTP-Rahmen für Plugins ohne den Core ---
export {
  erstelleRouten,
  starteRahmen,
  type Rahmen,
  type RahmenAnfrage,
  type RahmenAntwort,
  type RahmenHandler,
  type Routenregister,
} from './rahmen.ts'

// --- Implementierungsbündel ---
export {
  IMPL_CREATED_BY,
  IMPL_EXTENSION,
  IMPL_FORMAT,
  buendelDigest,
  exportiere,
  importiere,
  ladeOderErzeugeSchluessel,
  pruefeBuendel,
  schluesselAbdruck,
  vertrauensschluessel,
  type ExportAnfrage,
  type ExportErgebnis,
  type ImplDatei,
  type ImplUnit,
  type Implementierung,
  type ImportErgebnis,
  type PruefErgebnis,
  type Signatur,
} from './implementierung.ts'
