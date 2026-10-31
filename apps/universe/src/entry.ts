/**
 * `entry.ts` — **wie man in die Welt kommt und wie man sie verlaesst.**
 *
 * ## Der kürzeste Weg, den es gibt
 *
 * Seit dem 14.10.2026 liegen **Chat und Welt auf einem Port** (`docs/status/welt-ein-port.md`):
 * der Chat an `/`, die Welt an `/universe/`. Damit braucht der Umschalter **keine Adresse** mehr
 * mitzuschicken — er wechselt nur den **Pfad**:
 *
 * ```
 * http://127.0.0.1:3081/            der Chat
 * http://127.0.0.1:3081/universe/   die Welt      ← ein Pfad daneben
 * ```
 *
 * **Was hier vorher stand — und warum es weg ist.** Ein Zusatz `?ansicht=os` und ein Zusatz
 * `?chat=<fremde Adresse>`; die Adresse des Chats wurde sogar **je Raum** gemerkt. Alles drei waren
 * Notwendigkeiten aus der Zeit **zweier Ports**:
 *
 * | Was | Warum es damals nötig war | Warum es heute weg ist |
 * |---|---|---|
 * | `?chat=…` | die Welt lag auf einer **anderen Herkunft** — sie musste erfahren, wo der Chat ist | der Chat liegt auf **derselben** Herkunft, an `/` |
 * | `istChatAdresse()` | eine Adresse **aus der Zeile** ist Eingabe von außen (`javascript:…`) und musste geprüft werden | es gibt keine fremde Adresse mehr — die Wurzel der eigenen Herkunft kann niemand unterschieben |
 * | `merkeChatAdresse()` | die fremde Adresse musste den Reload überleben | die Herkunft steht in `location.origin`; sie zu speichern wäre eine zweite Wahrheit |
 *
 * ## Und der Ankunftswunsch — jetzt ohne Adreßzeile
 *
 * Eine Sache bleibt: **wer den Umschalter drückt, will die Welt sehen** — nicht die Ansicht, die in
 * diesem Browser zuletzt eingestellt war. Stand dort `chat`, kam der Betreiber genau im
 * Platzhalter-Chat des Prototyps heraus („Hier entsteht der Chat", Bild vom 14.10.2026).
 *
 * Damals wurde das über `?ansicht=os` gelöst — in der **Adreßzeile**, für jeden sichtbar:
 * *„der link ist nur zu lange so lol"* (Betreiber, 15.10.2026). Mit **einem** Port geht es ohne:
 * Chat und Welt teilen sich denselben `localStorage`. Der Chat hinterlegt dort einen
 * **Ankunftswunsch** ({@link ARRIVAL_KEY}), die Welt liest ihn beim Start und **nimmt ihn weg**.
 *
 * **Einmalig, und das ist Absicht.** Blieb der Wunsch stehen, würde jeder spätere Aufruf der Welt
 * die gespeicherte Wahl überschreiben — wer die Welt auf die Chat-Ansicht stellt und neu lädt, sähe
 * wieder das Universum, und ein Reload würde aussehen wie ein vergessener Klick.
 *
 * @module entry
 */

import { alsAnsicht } from './camera'
import type { Ansicht } from './camera'

/**
 * Der Schlüssel, unter dem der Chat den Ankunftswunsch hinterlegt.
 *
 * **Warum ein fester Schlüssel und kein Raum.** Der Wunsch gehört nicht einem Raum, sondern dem
 * **nächsten Öffnen** — er wird beim Lesen verbraucht. Ein Raum-Zusatz wäre eine zweite Wahrheit
 * über etwas, das einen Augenblick später nicht mehr existiert.
 *
 * Derselbe Wert steht im Umschalter des Chats (`packages/client/world-switch/src/index.ts`); der
 * Bündel-Prüfer **vergleicht** beide (`scripts/client-buendel.mjs`) — driftet einer, faellt der Bau
 * rot aus, statt daß der Umschalter in die zuletzt gespeicherte Ansicht führt.
 */
export const ARRIVAL_KEY = 'pmh.world.arrival'

/** Was der Chat als Ankunftswunsch hinterlegen darf: die Ansicht, die gezeigt werden soll. */
export const ARRIVAL_VALUE: Ansicht = 'os'

/**
 * Der Weg **zurück in den Chat**: die Wurzel **derselben** Herkunft.
 *
 * **Warum `/` und nicht eine gemerkte Adresse.** Der Host liefert den Chat an `/` aus — dieselbe
 * Herkunft, derselbe Port, derselbe Keks-Speicher. Eine Adresse zu speichern wäre die zweite Wahrheit
 * über einen Ort, den `location.origin` schon kennt.
 *
 * **Warum der Schlussstrich weg ist.** `http://127.0.0.1:3081` und `http://127.0.0.1:3081/` sind
 * **dieselbe** Seite, aber **zwei** Zeichenketten. Die Beschriftung der Marke nennt die Adresse als
 * Kurzhinweis (`title`) — dort ist der Strich nur Laenge, und ein Vergleich zweier Adressen wuerde an
 * ihm scheitern. Also eine Form: ohne.
 *
 * **Warum trotzdem eine Funktion mit `undefined`.** Wird die Welt **nicht** von einem Webserver
 * ausgeliefert (etwa als Datei geöffnet), gibt es keine Herkunft — dann gibt es auch keinen Chat in
 * Reichweite, und die Marke bleibt in der Welt (die Chat-Ansicht des Prototyps, erreichbar über
 * `view chat`).
 *
 * **Warum `'null'` mitgeprueft wird.** Ein `file://`-Dokument hat `location.origin === 'null'` — das
 * ist der Text „null", keine Herkunft. Wer ihn durchreicht, baut die Adresse `null/` und navigiert
 * damit ins Leere.
 *
 * @param herkunft - `location.origin` (darf fehlen)
 * @returns die Adresse des Chats oder `undefined`
 */
export function chatUrl(herkunft: string | undefined): string | undefined {
  if (herkunft === undefined || herkunft === '' || herkunft === 'null') return undefined
  return herkunft.replace(/\/+$/u, '')
}

/** Der Speicher, aus dem der Ankunftswunsch kommt — `localStorage`, oder nichts. */
export interface StorageLike {
  readonly getItem: (schluessel: string) => string | null
  readonly removeItem: (schluessel: string) => void
}

/**
 * **Liest den Ankunftswunsch und nimmt ihn weg** — einmalig.
 *
 * Ein unbekannter oder unsinniger Wert wird verworfen (und ebenfalls entfernt): im Speicher kann ein
 * Wert aus einer älteren Fassung liegen, und der darf nicht zu einer Ansicht führen, die es nicht
 * gibt. Was nicht gelesen werden kann, ist kein Fehler — dann gilt die gespeicherte Einstellung.
 *
 * @param speicher - der Speicher der Herkunft (im Browser `localStorage`)
 * @returns die gewünschte Ansicht oder `undefined`
 */
export function takeArrival(speicher: StorageLike | undefined): Ansicht | undefined {
  if (speicher === undefined) return undefined
  let roh: string | null = null
  try {
    roh = speicher.getItem(ARRIVAL_KEY)
    if (roh === null) return undefined
    // **Erst wegnehmen, dann urteilen.** Ein zweiter Blick darf denselben Wunsch nicht noch einmal
    // sehen — auch dann nicht, wenn er unbrauchbar war.
    speicher.removeItem(ARRIVAL_KEY)
  } catch {
    // Gesperrter Speicher (Privatmodus): kein Grund, den Start scheitern zu lassen.
    return undefined
  }
  if (roh === ARRIVAL_VALUE) return ARRIVAL_VALUE
  return undefined
}

/**
 * **Der Ankunftswunsch schlaegt die gespeicherte Einstellung.**
 *
 * Rein und ohne Zustand, damit die Regel pruefbar ist (`tests/entry.test.ts`): aus zwei Eingaben
 * wird eine Ausgabe. Was hier steht, ist die eine Aussage des Umschalters — *ich will die Welt
 * sehen* —, und sie ist juenger und ausdruecklicher als das, was in diesem Browser zuletzt stand.
 *
 * @param gewuenscht - die Ansicht aus dem Ankunftswunsch (darf fehlen)
 * @param gespeichert - der Wert der Einstellung `interface.mode` (darf fehlen oder Unsinn sein)
 * @returns die Ansicht, die gilt
 */
export function waehleAnsicht(gewuenscht: Ansicht | undefined, gespeichert: unknown): Ansicht {
  return gewuenscht ?? alsAnsicht(gespeichert)
}

/**
 * **Wohin die Marke fuehrt — die eine Entscheidung, und sie hat zwei Formen.**
 *
 * Wer `◆ PROMETHEUS` drueckt, will in den Chat. Es gibt aber **zwei** Dinge, die so heissen, und
 * genau die sind einmal verwechselt worden:
 *
 *   * den **echten Prometheus-Chat** auf derselben Herkunft (an `/`) — man **verlaesst** die Welt,
 *   * die **Chat-Ansicht dieses Prototyps** („Hier entsteht der Chat") — man **bleibt** in ihr.
 *
 * „Adresse da → navigieren, sonst umblenden" ist die ganze Regel. Sie steht **hier** und nicht in
 * `main.ts`, weil sie ohne Browser pruefbar ist — `tests/entry.test.ts` fuehrt beide Faelle vor.
 * Der Unterschied ist keine Kleinigkeit: behandelt man beide gleich, blendet der Austritt aus der
 * Welt **zusaetzlich** auf den Platzhalter um — genau das Bild, das der Betreiber gemeldet hat.
 *
 * **Warum die Marke nicht einfach immer navigiert.** Die Welt laesst sich auch ohne Webserver
 * oeffnen (`file://`, oder ein Standalone-Bau). Dort gibt es keinen Chat an `/`; ein Klick auf die
 * Marke wuerde ins Leere fuehren. Dann — und nur dann — bleibt sie das, was sie in der Welt ohnehin
 * ist: der Umschalter der Ansicht.
 */
export type MarkeZiel =
  | { readonly art: 'ort'; readonly adresse: string }
  | { readonly art: 'ansicht'; readonly ansicht: Ansicht }

/**
 * Was ein Klick auf die Marke tut — **die eine Stelle**, an der das entschieden wird.
 *
 * @param herkunft - `location.origin` der Welt (darf fehlen)
 * @returns das Ziel: die Adresse des Chats oder die Ansicht dieses Prototyps
 */
export function markeZiel(herkunft: string | undefined): MarkeZiel {
  const adresse = chatUrl(herkunft)
  return adresse === undefined ? { art: 'ansicht', ansicht: 'chat' } : { art: 'ort', adresse }
}

/**
 * **Der Satz auf der Marke — und er nennt das Ziel.**
 *
 * Eine Marke, die in den echten Chat fuehrt, darf nicht „Chat" heissen: dann sieht der Nutzer zwei
 * Dinge mit demselben Namen und weiss nicht, welches er bekommt. Der Betreiber hat genau das
 * gemeldet — er klickte und landete im **Platzhalter** statt im Chat. Also zwei Schluessel, je einer
 * fuer jedes Ziel.
 *
 * **Warum eine Tabelle mit `labelKey` und nicht zwei `return`-Zeilen.** `labelKey` ist der Name, den
 * dieses Projekt fuer *den Sprachschluessel einer Beschriftung* benutzt (die Insel-Eintraege tragen
 * ihn, siehe `ISLAND_GROUPS` in `main.ts`) — die Tabelle spricht also dieselbe Sprache wie der Rest.
 * **Und der Schluessel wird dadurch pruefbar:** `tests/locale-keys.test.ts` liest genau diese Form
 * aus dem Quelltext. Ein Schluessel, der nur als Zeichenkette in einem `return` steht, ist fuer
 * diesen Waechter **unsichtbar** — und dann meldet er einen **benutzten** Schluessel als tot, was
 * schlimmer ist als ein ungenauer Befund: man sucht den Fehler im Sprachpaket statt im Aufruf.
 * (Gemessen am 15.10.2026: mit `return '…' ? … : …'` meldete der Waechter genau die drei Schluessel
 * dieser Tabelle als ueberzaehlig.)
 */
const MARKE_TEXTE: Readonly<Record<MarkeZiel['art'], { readonly labelKey: string }>> = {
  ort: { labelKey: 'hud.toHarness' },
  ansicht: { labelKey: 'hud.toChat' },
}

/**
 * **Derselbe Unterschied fuer den Insel-Eintrag `▤ Chat`.**
 *
 * Er fuehrt ueber **dieselbe** Stelle wie die Marke (`geheZumChat` in `main.ts`), also muss er auch
 * dasselbe sagen. Der Betreiber: *„kannst du noch den neue implementierungsverknuepfung auch hier
 * machen: ◉ ansichten · ▤ Chat · ⟲ Ansicht zuruecksetzen"*. Nur der Sprachschatz ist ein anderer —
 * die Insel hat kuerzere Namen als die Marke.
 */
const INSEL_TEXTE: Readonly<Record<MarkeZiel['art'], { readonly labelKey: string }>> = {
  ort: { labelKey: 'island.action.harness' },
  ansicht: { labelKey: 'island.action.chat' },
}

/**
 * **Welches der beiden Ziele gilt** — die Art, ohne die Adresse selbst.
 *
 * @param herkunft - `location.origin` der Welt (darf fehlen)
 * @returns `'ort'` (es gibt einen Chat an `/`) oder `'ansicht'` (es gibt keinen)
 */
export function zielArt(herkunft: string | undefined): MarkeZiel['art'] {
  return chatUrl(herkunft) === undefined ? 'ansicht' : 'ort'
}

/**
 * @param herkunft - `location.origin` der Welt (darf fehlen)
 * @returns der Schluessel im Sprachschatz der **Marke**
 */
export function markeTextKey(herkunft: string | undefined): string {
  return MARKE_TEXTE[zielArt(herkunft)].labelKey
}

/**
 * @param herkunft - `location.origin` der Welt (darf fehlen)
 * @returns der Schluessel im Sprachschatz der **Insel**
 */
export function inselChatTextKey(herkunft: string | undefined): string {
  return INSEL_TEXTE[zielArt(herkunft)].labelKey
}
