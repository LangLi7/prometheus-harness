/**
 * **Die KI-Rangliste — eine lesende Ansicht.**
 *
 * ## Woher sie kommt, und warum sie HIER steht
 *
 * `@prometheus-harness/ai-ranking` stellt die bevorzugte Liste unter `GET /api/ai/ranking` bereit.
 * Bis hierher hatte sie **keine Anzeige**: der Endpunkt war da, die Zahlen waren da, und niemand sah
 * sie.
 *
 * Sie steht als **Panel in der Welt** (`apps/universe`) und nicht als eigenes Client-Paket: dort ist
 * ein Panel die **einzige** Form, in der eine Ansicht wächst (`plugins.ts`: „ein Plugin hier ist
 * kein Sonderfall, sondern die **einzige** Form, in der die Oberfläche wächst") — mit Andocken,
 * Reiter, Insel-Eintrag und Sprache. Ein zweiter Weg für dieselbe Sache wäre ein zweiter Weg.
 *
 * ## Was sie NICHT tut
 *
 * Sie **liest**. Kein Schreiben, keine Modellwahl, keine eigene Reihenfolge: was hier steht, ist die
 * Antwort des Dienstes in der Reihenfolge, die `ranking` gerechnet hat. Eine zweite Sortierung wäre
 * eine zweite Wahrheit über dieselbe Frage.
 *
 * ## Kein stiller Fehlschlag
 *
 * Jeder Ausgang ist ein **Satz**:
 *
 *   * fehlt der Endpunkt, ist er nicht verbunden (503), verlangt er eine Anmeldung (401) oder
 *     antwortet er mit Unsinn — dann erscheint **der Grund**, nicht eine leere Fläche,
 *   * fehlt einem Eintrag das Modell, steht dort **„kein Modell genannt"** — nicht nichts,
 *   * ist ein Preis unbekannt, steht dort **„unbekannt"** — niemals `0` und niemals `-1`.
 *
 * ## Warum die Typen hier stehen und nicht importiert werden — **gemessen**
 *
 * Der naheliegende Weg wäre `import type { Rangliste } from '@prometheus-harness/ranking'`. Er ist
 * **rot**. Gemessen am 16.10.2026 mit
 * `tsgo --noEmit -p apps/universe/tsconfig.json` über die ganze Kette:
 *
 * ```
 * packages/ai/ranking/src/index.ts(30,8):  error TS5097: An import path can only end
 * packages/ai/tariffs/src/index.ts(41,8):  with a '.ts' extension when
 * packages/ai/directory-curator/src/index.ts(43,8):  'allowImportingTsExtensions' is enabled.
 * ```
 *
 * Die Pakete importieren mit **ausdrücklicher** `.ts`-Endung (`./rang.ts`); diese Anwendung erbt
 * nicht von `tsconfig.base.json` und hat die Option nicht. (Man könnte sie in
 * `apps/universe/tsconfig.json` ergänzen — das ist **nicht gemessen**, und die Option nur wegen
 * eines fremden Importstils in eine Anwendung zu schreiben, wäre die falsche Richtung.)
 *
 * Dazu kommt der Grund, der auch mit der Option gilt: was über das Netz kommt, ist **JSON**. Kein
 * Typ kann das prüfen. Diese Datei beschreibt deshalb, was sie **liest**, und prüft es zur Laufzeit
 * ({@link pruefeAntwort}). Driftet der Dienst, erscheint ein **Grund** — kein Feld mit `undefined`.
 *
 * ## Warum „unbekannt" nie zu `0.00` wird
 *
 * Der Dienst nennt einen unbekannten Preis `-1` (`tariffs/preis.ts`: „`-1` heißt unbekannt"). Wird
 * er als Zahl gedruckt, steht dort `-1.00` — und wer schnell liest, sieht einen Preis. Wird er als
 * `0` gelesen, steht der Kandidat ganz **vorn**, als der billigste. Beides ist falsch. Deshalb gibt
 * es hier genau **einen** Weg für einen Preis ({@link preisText}), und `0.00 / 0.00` erscheint
 * **nur**, wenn `0` wirklich gemessen wurde.
 *
 * ## Warum der Text dieses Panels deutsch ist
 *
 * Die Sätze **im Inhalt** kommen vom Dienst und sind deutsch (`gruende[]`, `ohneEmpfehlung`,
 * `hinweise`) — eine Übersetzung dafür gibt es nicht. Ein Fenster mit englischem Rahmen und
 * deutschem Inhalt liest sich schlechter als eines in einer Sprache; deshalb bleibt auch der Rahmen
 * deutsch. Übersetzt ist allein der **Reitertitel** (`panel.ranking`): er steht in der Leiste neben
 * den anderen Reitern, und die gehören der Oberfläche.
 *
 * ## Wann geladen wird
 *
 * **Nicht** beim Einschalten des Plugins, sondern wenn das Panel erscheint. Ein Plugin, das beim
 * Start eine Verbindung aufbaut, macht den Start von einem Dienst abhängig, der nichts mit dem
 * Start zu tun hat — und in der Prüfung der Hülle (`tests/boot.test.ts`) hinge dann jeder Test am
 * Netz.
 *
 * @module apps/universe/src/ai-rangliste
 */

// ---------------------------------------------------------------------------
// Was gelesen wird
// ---------------------------------------------------------------------------

/** Wie eine Familie abgerechnet wird. Vier Aussagen, nicht drei — siehe `tariffs`. */
export type Kostenart = 'kostenlos' | 'freibetrag' | 'kostenpflichtig' | 'unbekannt'

/**
 * Was über die Fähigkeit bei einer Familie **gemessen** ist.
 *
 * `fehlt` und `unbekannt` sind verschiedene Aussagen: das eine ist ein Befund (404 gemessen), das
 * andere ein Nichtwissen. Wer beide gleich anzeigt, macht aus „nie geprüft" ein „geht nicht".
 */
export type Funktionsstand = 'vorhanden' | 'unbekannt' | 'fehlt'

/** Ein Preis in USD je 1 Mio Token. `-1` heißt unbekannt. */
export interface Preis {
  readonly hinein: number
  readonly heraus: number
}

/** Ein Kandidat der Liste — so, wie der Dienst ihn nennt. */
export interface Ranglisteneintrag {
  /** Der Platz, eins-basiert. */
  readonly rang: number
  readonly faehigkeit: string
  readonly familie: string
  /** Der Name der Familie für Menschen. */
  readonly familienname: string
  /** Fehlt, wenn weder Models-API noch Tabelle eines nennen — das ist ein **Befund**, keine Lücke. */
  readonly modell?: string
  /** Gibt es eine eingetragene Umsetzung für diese Fähigkeit? */
  readonly verdrahtet: boolean
  readonly funktionalitaet: Funktionsstand
  readonly kostenart: Kostenart
  readonly preis: Preis
  /** Wann gemessen wurde, falls je. */
  readonly gemessenAm?: string
  /** Ob die Messung älter ist als die Frist. */
  readonly veraltet: boolean
  /** Warum dieser Platz — **jeder** Eintrag trägt seine Begründung. */
  readonly gruende: readonly string[]
}

/** Die geordnete Liste **einer** Fähigkeit. */
export interface Faehigkeitsliste {
  readonly faehigkeit: string
  /** Der deutsche Name für die Anzeige. */
  readonly name: string
  readonly eintraege: readonly Ranglisteneintrag[]
  /** Die bevorzugte Wahl — der erste brauchbare Eintrag. */
  readonly empfehlung?: Ranglisteneintrag
  /** Warum es keine Empfehlung gibt. Fehlt nie, wenn `empfehlung` fehlt. */
  readonly ohneEmpfehlung?: string
}

/** Die ganze Rangliste. */
export interface Rangliste {
  readonly erstelltAm: string
  readonly listen: readonly Faehigkeitsliste[]
  readonly hinweise: readonly string[]
}

/** Was die Liste belegt — gezählt, nicht behauptet. */
export interface Rangzahlen {
  readonly eintraege: number
  readonly verdrahtet: number
  readonly gemessen: number
  readonly kostenlos: number
  readonly ohnePreis: number
}

/**
 * Die Antwort des Endpunkts, soweit diese Ansicht sie liest.
 *
 * **Warum nur ein Teil.** Was hier nicht steht, wird nicht angezeigt — und ein Feld im Typ zu
 * führen, das niemand liest, ist eine Behauptung über eine Absicht.
 */
export interface Rangantwort {
  readonly rangliste: Rangliste
  /** Fehlt, wenn der Dienst keine Zahlen mitschickt. Dann entfällt die Zeile. */
  readonly zahlen?: Rangzahlen
}

// ---------------------------------------------------------------------------
// Der Weg zum Dienst
// ---------------------------------------------------------------------------

/**
 * Der Pfad der Liste.
 *
 * Derselbe Wert steht als `RANKING_PATH` in `packages/api/ai-ranking/src/index.ts`. Er wird hier
 * **nicht** importiert (siehe Dateikopf) — dafür gibt es eine Prüfung, die beide nennt:
 * `tests/ai-rangliste.test.ts` liest den Pfad aus dem Paket und vergleicht.
 */
export const RANGLISTE_PFAD = '/api/ai/ranking'

/** Was diese Ansicht von einer HTTP-Antwort braucht — **nur** das. */
export interface Antwortartig {
  readonly ok: boolean
  readonly status: number
  text: () => Promise<string>
}

/** Was sich einhängen läßt — für die Prüfung, und für einen Aufrufer mit eigenem Weg. */
export interface Rangumgebung {
  /** Ein anderer Pfad. Vorgabe: {@link RANGLISTE_PFAD}. */
  readonly pfad?: string
  /** Ein anderer Abruf. Vorgabe: `globalThis.fetch`. */
  readonly hole?: (pfad: string) => Promise<Antwortartig>
  /** Ein anderes Dokument. Vorgabe: `globalThis.document`. */
  readonly dokument?: Document
}

/** Das Ergebnis eines Abrufs — **ein** Ausgang, und beide sind Sätze. */
export type Ladung =
  | { readonly art: 'ok'; readonly antwort: Rangantwort }
  | { readonly art: 'fehler'; readonly grund: string }

/**
 * Der Abruf über den Browser.
 *
 * **Warum `accept` und sonst nichts.** Ohne den Kopfsatz antwortet der Dienst zwar auch JSON, aber
 * ein Zwischenspeicher oder ein Vertreter davor darf dann etwas anderes liefern. Anmeldung und
 * Herkunft regelt der Browser von selbst — die Sitzung liegt im selben Ursprung (`/universe/` und
 * `/api/` liegen auf **einem** Port), und ein selbstgebauter Kopfsatz wäre eine zweite Meinung
 * darüber, wer man ist.
 *
 * @param pfad - der Pfad der Liste
 * @returns die Antwort
 */
function standardHole(pfad: string): Promise<Antwortartig> {
  const f = (globalThis as { fetch?: (eingabe: string, optionen?: unknown) => Promise<unknown> }).fetch
  if (typeof f !== 'function') {
    // **Ein fehlender Abruf ist ein Grund, kein Absturz.** In einer Umgebung ohne `fetch` (alte
    // Einbettung, hartes Skript-Verbot) soll das Panel das sagen.
    throw new Error('Diese Umgebung kennt kein `fetch`')
  }
  return f(pfad, { headers: { accept: 'application/json' } }) as Promise<Antwortartig>
}

/**
 * Der Grund, wenn die Verbindung gar nicht zustande kam.
 *
 * **Warum der Pfad im Satz steht.** „Netzwerkfehler" schickt den Leser auf die Suche; ein Satz mit
 * Pfad und Ursache sagt ihm, **was** nicht erreichbar war.
 *
 * @param fehler - was geworfen wurde
 * @param pfad - der angefragte Pfad
 * @returns der Grund
 */
function netzGrund(fehler: unknown, pfad: string): string {
  const ursache = fehler instanceof Error ? fehler.message : String(fehler)
  return (
    `Der Dienst ist nicht erreichbar: ${ursache}. ` +
    `Angefragt wurde \`GET ${pfad}\` auf dieser Herkunft — läuft der Host, und ist der Endpunkt eingehängt?`
  )
}

/**
 * Der Grund, wenn der Dienst mit einem Fehlerstatus antwortet.
 *
 * **Warum 401, 403 und 503 eigene Sätze bekommen.** Es sind die drei Fälle, in denen man **etwas
 * tun** kann, und sie haben verschiedene Antworten: anmelden, die Herkunft prüfen, den Host starten.
 * Ein gemeinsames „HTTP-Fehler" würde alle drei verdecken. Der eigene Fehlerbegriff des Dienstes
 * (`unauthenticated`, `untrusted_origin`, `unavailable`) wird **mitgenannt**, wenn er da ist.
 *
 * @param status - der Statuscode
 * @param koerper - der Text der Antwort
 * @param pfad - der angefragte Pfad
 * @returns der Grund
 */
function statusGrund(status: number, koerper: string, pfad: string): string {
  const tat = `\`GET ${pfad}\``
  const erklaerung =
    status === 401
      ? `Der Dienst verlangt eine Anmeldung (HTTP 401). Die Liste nennt Preise und Modellkennungen — ohne Sitzung gibt er sie nicht heraus.`
      : status === 403
        ? `Der Dienst lehnt die Herkunft dieser Seite ab (HTTP 403).`
        : status === 503
          ? `Der Dienst ist nicht verbunden (HTTP 503). Der Endpunkt braucht den Verbindungsdienst des Hosts; ohne ihn antwortet er lieber gar nicht, als ungeschützt.`
          : status === 400
            ? `Der Dienst hat die Anfrage abgelehnt (HTTP 400) — vermutlich ein unbekannter Wert in der Adresse.`
            : status === 405
              ? `Diese Adresse kennt nur GET und HEAD (HTTP 405).`
              : `Der Dienst hat mit HTTP ${status} geantwortet.`
  const name = fehlerbegriff(koerper)
  return `${erklaerung} ${tat}${name === undefined ? '' : ` — der Dienst nennt es \`${name}\``}.`
}

/**
 * Der Fehlerbegriff des Dienstes, falls der Körper einen nennt.
 *
 * **Warum das Lesen scheitern darf.** Ein Fehlerkörper ist oft HTML (ein Vertreter davor) statt
 * JSON. Dann gibt es eben keinen Begriff — der Status trägt den Satz allein.
 *
 * @param koerper - der Text der Antwort
 * @returns der Begriff oder `undefined`
 */
function fehlerbegriff(koerper: string): string | undefined {
  try {
    const gelesen: unknown = JSON.parse(koerper)
    if (typeof gelesen === 'object' && gelesen !== null) {
      const wert = (gelesen as { readonly error?: unknown }).error
      if (typeof wert === 'string' && wert.trim() !== '') return wert
    }
  } catch {
    /* Kein JSON — dann steht der Begriff eben nicht zur Verfügung. */
  }
  return undefined
}

/**
 * Holt die Liste und **sagt, was geschah**.
 *
 * **Diese Funktion wirft nicht.** Jeder Ausgang ist eine {@link Ladung}; ein geworfener Fehler wäre
 * im Panel ein leeres Fenster, und genau das soll es nicht geben.
 *
 * @param umgebung - Pfad, Abruf und Dokument (alles austauschbar)
 * @returns die Liste oder der Grund
 */
export async function ladeRangliste(umgebung: Rangumgebung = {}): Promise<Ladung> {
  const pfad = umgebung.pfad ?? RANGLISTE_PFAD
  const hole = umgebung.hole ?? standardHole

  let antwort: Antwortartig
  try {
    antwort = await hole(pfad)
  } catch (fehler) {
    return { art: 'fehler', grund: netzGrund(fehler, pfad) }
  }

  let koerper: string
  try {
    koerper = await antwort.text()
  } catch (fehler) {
    return { art: 'fehler', grund: netzGrund(fehler, pfad) }
  }

  if (!antwort.ok) return { art: 'fehler', grund: statusGrund(antwort.status, koerper, pfad) }

  let roh: unknown
  try {
    roh = JSON.parse(koerper)
  } catch (fehler) {
    const ursache = fehler instanceof Error ? fehler.message : String(fehler)
    return {
      art: 'fehler',
      grund: `Die Antwort ist kein JSON: ${ursache}. Erwartet wurde die Liste als JSON.`,
    }
  }

  return pruefeAntwort(roh)
}

// ---------------------------------------------------------------------------
// Das Prüfen
// ---------------------------------------------------------------------------

/** Ein geprüfter Wert oder der Grund, warum er keiner ist. */
type Geprueft<T> = { readonly ok: true; readonly wert: T } | { readonly ok: false; readonly grund: string }

/** Ist das ein Objekt im Sinne dieser Datei — also eines, aus dem man lesen kann? */
function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert)
}

/** Ein nicht-leerer Text, oder `undefined`. */
function alsText(wert: unknown): string | undefined {
  return typeof wert === 'string' && wert.trim() !== '' ? wert : undefined
}

/** Eine endliche Zahl, oder `undefined`. */
function alsZahl(wert: unknown): number | undefined {
  return typeof wert === 'number' && Number.isFinite(wert) ? wert : undefined
}

/**
 * Die Kostenart — **im Zweifel `unbekannt`, nie `kostenlos`.**
 *
 * **Warum die Richtung so herum ist.** Ein Wert, den dieser Leser nicht kennt (eine neuere Fassung
 * des Dienstes, ein Tippfehler), darf nicht als „kostenlos" durchgehen: das wäre die freundlichste
 * und damit die teuerste Fehlannahme. „Unbekannt" ist die ehrliche Antwort, und sie steht im Bild.
 *
 * @param wert - der gelesene Wert
 * @returns die Kostenart
 */
export function alsKostenart(wert: unknown): Kostenart {
  return wert === 'kostenlos' || wert === 'freibetrag' || wert === 'kostenpflichtig' || wert === 'unbekannt'
    ? wert
    : 'unbekannt'
}

/**
 * Der Funktionsstand — **im Zweifel `unbekannt`, nie `vorhanden`.**
 *
 * Dieselbe Richtung wie bei {@link alsKostenart}: „vorhanden" ist eine Zusage, die nur ein Befund
 * geben darf.
 *
 * @param wert - der gelesene Wert
 * @returns der Stand
 */
export function alsStand(wert: unknown): Funktionsstand {
  return wert === 'vorhanden' || wert === 'unbekannt' || wert === 'fehlt' ? wert : 'unbekannt'
}

/**
 * Ist dieser Preis **bekannt**?
 *
 * **Warum eine eigene Prüfung und nicht `< 0`.** `-1` heißt unbekannt (siehe Dateikopf), und **beide**
 * Seiten müssen bekannt sein: `0.02` hinein und „unbekannt" heraus ist kein Preis, sondern ein
 * halber — und ein halber Preis lässt sich nicht mit einem ganzen vergleichen.
 *
 * @param preis - der Preis oder `undefined`
 * @returns ob er als Preis gelesen werden darf
 */
export function istPreisBekannt(preis: Preis | undefined): boolean {
  if (preis === undefined) return false
  return preis.hinein >= 0 && Number.isFinite(preis.hinein) && preis.heraus >= 0 && Number.isFinite(preis.heraus)
}

/**
 * Ein Preis, wie er im Bild steht — **nie `-1`, nie leer.**
 *
 * Drei Fälle, und alle drei sind sichtbar:
 *
 * ```
 *   0.15 / 0.60 USD je 1 Mio Token      beide Seiten bekannt
 *   unbekannt (nur hinein 0.15)         eine Seite bekannt — die andere ist NICHT null
 *   unbekannt                           keine Seite bekannt
 * ```
 *
 * **Warum die Einheit nur im ersten Fall steht.** „unbekannt USD je 1 Mio Token" wäre eine Einheit
 * an einer Zahl, die es nicht gibt.
 *
 * @param preis - der Preis oder `undefined`
 * @returns der Text
 */
export function preisText(preis: Preis | undefined): string {
  if (!istPreisBekannt(preis)) {
    const bekanntes: string[] = []
    if (preis !== undefined && Number.isFinite(preis.hinein) && preis.hinein >= 0) bekanntes.push(`nur hinein ${preis.hinein.toFixed(2)}`)
    if (preis !== undefined && Number.isFinite(preis.heraus) && preis.heraus >= 0) bekanntes.push(`nur heraus ${preis.heraus.toFixed(2)}`)
    return bekanntes.length === 0 ? 'unbekannt' : `unbekannt (${bekanntes.join(', ')})`
  }
  // `preis` ist hier bekannt — der Zugriff ist die Folge der Prüfung, nicht eine Annahme.
  const p = preis as Preis
  return `${p.hinein.toFixed(2)} / ${p.heraus.toFixed(2)} USD je 1 Mio Token`
}

/**
 * Liest einen Preis.
 *
 * **Warum ein unlesbarer Preis kein Grund zum Verwerfen ist.** Ein fehlender oder kaputter Preis ist
 * inhaltlich genau die Aussage „niemand hat nachgesehen" — und die zeigt diese Ansicht als
 * `unbekannt`. Das ist die ehrliche Antwort; die ganze Liste deshalb fallen zu lassen wäre die
 * unehrliche.
 *
 * @param roh - der gelesene Wert
 * @returns der Preis oder `undefined`
 */
function pruefePreis(roh: unknown): Preis | undefined {
  if (!istObjekt(roh)) return undefined
  const hinein = alsZahl(roh['hinein'])
  const heraus = alsZahl(roh['heraus'])
  if (hinein === undefined || heraus === undefined) return undefined
  return { hinein, heraus }
}

/** Liest einen Eintrag. */
function pruefeEintrag(roh: unknown, wo: string): Geprueft<Ranglisteneintrag> {
  if (!istObjekt(roh)) return { ok: false, grund: `In ${wo} steht ein Eintrag, der kein Objekt ist.` }
  const rang = alsZahl(roh['rang'])
  if (rang === undefined) return { ok: false, grund: `In ${wo} hat ein Eintrag keinen lesbaren Rang.` }
  const familienname = alsText(roh['familienname']) ?? alsText(roh['familie'])
  if (familienname === undefined) {
    return { ok: false, grund: `In ${wo} hat der Eintrag auf Platz ${String(rang)} keinen Familiennamen.` }
  }
  const modell = alsText(roh['modell'])
  const gemessenAm = alsText(roh['gemessenAm'])
  const gruende = Array.isArray(roh['gruende'])
    ? roh['gruende'].map((grund) => alsText(grund)).filter((grund): grund is string => grund !== undefined)
    : []
  const preis = pruefePreis(roh['preis'])
  return {
    ok: true,
    wert: {
      rang,
      faehigkeit: alsText(roh['faehigkeit']) ?? '',
      familie: alsText(roh['familie']) ?? '',
      familienname,
      ...(modell === undefined ? {} : { modell }),
      verdrahtet: roh['verdrahtet'] === true,
      funktionalitaet: alsStand(roh['funktionalitaet']),
      kostenart: alsKostenart(roh['kostenart']),
      // Ein unbekannter Preis steht hier als `-1 / -1` — **dieselbe Marke wie im Dienst**, damit
      // ein Wert, der nicht gelesen werden konnte, nach nichts anderem aussieht als „unbekannt".
      preis: preis ?? { hinein: -1, heraus: -1 },
      ...(gemessenAm === undefined ? {} : { gemessenAm }),
      veraltet: roh['veraltet'] === true,
      gruende,
    },
  }
}

/** Liest die Zahlen des Dienstes. */
function pruefeZahlen(roh: unknown): Geprueft<Rangzahlen> | undefined {
  if (roh === undefined) return undefined
  if (!istObjekt(roh)) return { ok: false, grund: 'Die Antwort trägt `zahlen`, aber nicht als Objekt.' }
  const namen = ['eintraege', 'verdrahtet', 'gemessen', 'kostenlos', 'ohnePreis'] as const
  const werte: number[] = []
  for (const name of namen) {
    const wert = alsZahl(roh[name])
    if (wert === undefined) return { ok: false, grund: `In \`zahlen\` fehlt die Zahl \`${name}\`.` }
    werte.push(wert)
  }
  return {
    ok: true,
    wert: {
      eintraege: werte[0] ?? 0,
      verdrahtet: werte[1] ?? 0,
      gemessen: werte[2] ?? 0,
      kostenlos: werte[3] ?? 0,
      ohnePreis: werte[4] ?? 0,
    },
  }
}

/** Liest eine Fähigkeitsliste. */
function pruefeFaehigkeitsliste(roh: unknown, stelle: number): Geprueft<Faehigkeitsliste> {
  if (!istObjekt(roh)) return { ok: false, grund: `Der ${String(stelle)}. Eintrag in \`rangliste.listen\` ist kein Objekt.` }
  const name = alsText(roh['name']) ?? alsText(roh['faehigkeit'])
  if (name === undefined) {
    return { ok: false, grund: `Der ${String(stelle)}. Eintrag in \`rangliste.listen\` hat weder \`name\` noch \`faehigkeit\`.` }
  }
  const faehigkeit = alsText(roh['faehigkeit']) ?? name
  if (!Array.isArray(roh['eintraege'])) {
    return { ok: false, grund: `Für „${name}" fehlt \`eintraege\` — erwartet wurde eine Liste.` }
  }
  const wo = `„${name}"`
  const eintraege: Ranglisteneintrag[] = []
  for (const eintragRoh of roh['eintraege']) {
    const geprueft = pruefeEintrag(eintragRoh, wo)
    if (!geprueft.ok) return geprueft
    eintraege.push(geprueft.wert)
  }

  const ohneEmpfehlung = alsText(roh['ohneEmpfehlung'])
  const empfehlungRoh = roh['empfehlung']
  if (empfehlungRoh === undefined || empfehlungRoh === null) {
    return {
      ok: true,
      wert: { faehigkeit, name, eintraege, ...(ohneEmpfehlung === undefined ? {} : { ohneEmpfehlung }) },
    }
  }
  const empfehlung = pruefeEintrag(empfehlungRoh, wo)
  if (!empfehlung.ok) return empfehlung
  return { ok: true, wert: { faehigkeit, name, eintraege, empfehlung: empfehlung.wert } }
}

/**
 * Prüft die Antwort: **was fehlt, wird benannt.**
 *
 * **Die Regel, nach der hier geprüft wird.**
 *
 *   * **Pflicht ist, was eine Aussage trägt**: die Liste selbst, die Fähigkeit, der Rang, die Familie.
 *     Fehlt eines davon, ist die Antwort nicht die, die dieser Leser kennt — dann erscheint der
 *     Grund.
 *   * **Beiwerk darf fehlen**: der Zeitstempel, die Hinweise, die Zahlen. Ein fehlender Zeitstempel
 *     ist kein Grund, eine ganze Liste zu verschweigen.
 *   * **Ein fehlendes Modell und ein fehlender Preis sind keine Fehler**, sondern **Aussagen**
 *     („kein Modell genannt", „unbekannt") — sie werden angezeigt.
 *
 * @param roh - das gelesene JSON
 * @returns die Antwort oder der Grund
 */
export function pruefeAntwort(roh: unknown): Ladung {
  if (!istObjekt(roh)) return { art: 'fehler', grund: 'Die Antwort ist kein Objekt — erwartet wurde die Rangliste als JSON.' }
  const listeRoh = roh['rangliste']
  if (!istObjekt(listeRoh)) {
    return {
      art: 'fehler',
      grund: 'Die Antwort trägt keine `rangliste`. Erwartet wurde `{ rangliste: { listen: [ … ] } }`.',
    }
  }
  if (!Array.isArray(listeRoh['listen'])) {
    return { art: 'fehler', grund: 'In der `rangliste` fehlt `listen` — erwartet wurde eine Liste von Fähigkeiten.' }
  }

  const listen: Faehigkeitsliste[] = []
  for (const [index, eintragRoh] of listeRoh['listen'].entries()) {
    const geprueft = pruefeFaehigkeitsliste(eintragRoh, index + 1)
    if (!geprueft.ok) return { art: 'fehler', grund: geprueft.grund }
    listen.push(geprueft.wert)
  }

  const hinweise = Array.isArray(listeRoh['hinweise'])
    ? listeRoh['hinweise'].map((hinweis) => alsText(hinweis)).filter((hinweis): hinweis is string => hinweis !== undefined)
    : []

  const zahlen = pruefeZahlen(roh['zahlen'])
  if (zahlen !== undefined && !zahlen.ok) return { art: 'fehler', grund: zahlen.grund }

  return {
    art: 'ok',
    antwort: {
      rangliste: { erstelltAm: alsText(listeRoh['erstelltAm']) ?? '', listen, hinweise },
      ...(zahlen === undefined ? {} : { zahlen: zahlen.wert }),
    },
  }
}

// ---------------------------------------------------------------------------
// Die Anzeige steht nebenan
// ---------------------------------------------------------------------------

/*
 * **Warum hier kein `createElement` mehr steht.**
 *
 * Diese Datei beantwortet eine Frage: *Was steht in der Antwort des Dienstes — und was heißt es,
 * wenn sie fehlt?* Die zweite Frage — *Wie sieht das aus?* — beantwortet `rang-ansicht.ts`.
 *
 * Die Trennung ist keine Formsache: der Leser ist ohne Browser prüfbar, die Anzeige braucht ein
 * Dokument, Farben, Abstände und einen echten Rahmen. Beides in einer Datei hieße, daß jede
 * Farbänderung die Prüfung des Lesers berührt.
 *
 * Wer die Ansicht einhängt, importiert `fuelleRangliste` aus `rang-ansicht.ts`.
 */