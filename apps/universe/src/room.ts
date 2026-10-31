/**
 * Der Raum — die Grenze zwischen zwei Nutzern.
 *
 * **Was der Betreiber gemeint hat:** nicht „jeder Nutzer hat eigene Daten in einer gemeinsamen
 * Datenbank", sondern **eine eigene Instanz** — „komplett sein eigenes wie eine Sandbox /
 * Container". Ein Container, ein Nutzer, ein Universum.
 *
 * **Was das fuer diesen Prototyp bedeutet.** Die Isolierung ist hier **nicht** eine Abfrage
 * mit Nutzerfilter, sondern eine **Grenze um die ganze Instanz**. Alles, was ein Nutzer
 * anfasst, gehoert ihm:
 *
 *   - seine Kamera, seine Panel-Anordnung, sein Modus  → eigener Speicher je Raum
 *   - sein Universum                                   → eigener Baum, eigene Kennungen
 *   - seine Daten (spaeter: PostgreSQL/pgvector)       → eigene Datenbank im Container
 *
 * **Warum der Speicher trotzdem einen Namensraum braucht:** Ein Browser ist *ein* Prozess.
 * Wer zwei Instanzen auf demselben Rechner aufruft — etwa `?room=alice` und `?room=bob` —
 * teilt sich denselben `localStorage`. Ohne Namensraum ueberschreibt der zweite Aufruf die
 * Ansicht des ersten. Genau deshalb ist `storageKey()` raumgebunden und wird geprueft.
 *
 * **Und was hier bewusst NICHT passiert:** Es gibt keinen Nutzer-Login, keine Rechtepruefung
 * und keine Verschlüsselung. Im Prototyp ist der Raum ein **Name**, kein Sicherheitsmerkmal.
 * Die echte Grenze zieht spaeter der Container — nicht diese Datei.
 */

/** Der Standardraum, wenn keiner genannt ist. */
export const DEFAULT_ROOM = 'default'

/**
 * Ermittelt den Raum.
 *
 * Reihenfolge: `?room=` in der Adresse schlaegt alles; danach der zuletzt benutzte Raum;
 * sonst der Standard. Der Wert wird **bereinigt**, weil er in einen Speicherschluessel
 * eingeht — ein Name mit Leerzeichen oder Sonderzeichen wuerde dort stoeren.
 */
export function resolveRoom(search: string, fallback = DEFAULT_ROOM): string {
  const param = new URLSearchParams(search).get('room')
  return normalizeRoom(param ?? fallback)
}

/**
 * Macht aus einem beliebigen Namen einen brauchbaren Raumnamen.
 *
 * **Punkte fliegen mit heraus.** Sie waeren in einem Bezeichner erlaubt, aber sie sind das
 * Zeichen, mit dem Pfadanteile gebaut werden (`..`). Ein Raumname soll ein **Name** sein und
 * kein Pfad — deshalb bleiben nur Buchstaben, Ziffern, `_` und `-`. Ein Name wie
 * `../../bob` wird damit zu `bob`: der Schluessel kann nicht aus seinem Namensraum zeigen.
 */
export function normalizeRoom(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_ROOM
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return clean === '' ? DEFAULT_ROOM : clean
}

/**
 * Ein Speicherschluessel, der **nur** diesem Raum gehoert.
 *
 * Zwei Raeume koennen sich damit nicht ueberschreiben — auch dann nicht, wenn sie im selben
 * Browser laufen.
 */
export function storageKey(room: string, name: string): string {
  return `prometheus.${normalizeRoom(room)}.${name}`
}

/**
 * Hat dieser Raum seinen Speicher schon einmal eingerichtet?
 *
 * **Wozu das gebraucht wird:** Beim **ersten** Start soll die Sprache aus dem Browser kommen
 * (`navigator.language` — auf einem deutschen System also Deutsch). Danach gilt die **Entscheidung
 * des Nutzers**, auch wenn er Englisch gewaehlt hat. Ohne diese Unterscheidung muesste man raten,
 * ob ein gespeicherter Wert eine Wahl oder ein Zufall ist — und die Voreinstellung „Englisch" waere
 * entweder nie sichtbar oder nach jedem Reload wieder da.
 *
 * Der Schluessel ist **kein** Zustand, sondern eine Tatsache: „hier wurde schon einmal etwas
 * eingerichtet". Deshalb steht hier `true` und keine Version.
 */
export function hasSetup(room: string): boolean {
  try {
    return globalThis.localStorage?.getItem(storageKey(room, 'setup.v1')) === 'true'
  } catch {
    // Ohne lesbaren Speicher gilt „noch nie eingerichtet": beim naechsten Start wird die
    // Browsersprache wieder vorgeschlagen. Das ist der harmlosere Fehler.
    return false
  }
}

/** Merkt sich, dass dieser Raum eingerichtet ist. */
export function markSetup(room: string): void {
  try {
    globalThis.localStorage?.setItem(storageKey(room, 'setup.v1'), 'true')
  } catch {
    // Voller Speicher oder Privatmodus: dann schlaegt der naechste Start die Browsersprache vor.
  }
}

/**
 * Beschreibung des Raums fuer die Oberflaeche.
 *
 * Der Prototyp zeigt **sichtbar**, in welchem Raum man ist. Ein Nutzer, der glaubt, in
 * seinem eigenen Container zu sein, waehrend er in einem anderen schaut, ist der teuerste
 * Fehler, den dieses Modell haben kann.
 */
export function describeRoom(room: string): string {
  return room === DEFAULT_ROOM ? 'Standardraum' : `Raum „${room}"`
}
