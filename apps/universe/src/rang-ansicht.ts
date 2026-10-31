/**
 * **Die Anzeige der KI-Rangliste.**
 *
 * ## Warum Anzeige und Lesen getrennt sind
 *
 * `ai-rangliste.ts` beantwortet eine Frage: *Was steht in der Antwort des Dienstes — und was heißt
 * es, wenn sie fehlt?* Diese Datei beantwortet die zweite: *Wie sieht das aus, ohne daß man raten
 * muß, was wichtig ist?*
 *
 * Die Trennung ist keine Formsache. Der Leser ist über `tests/ai-rangliste.test.ts` ohne Browser
 * prüfbar; die Anzeige braucht ein Dokument, Farben, Abstände und einen echten Rahmen. Beides in
 * einer Datei hieße: jede Farbänderung berührt die Prüfung des Lesers.
 *
 * ## Die eine Regel, die bleibt
 *
 * **Diese Ansicht wählt nichts.** Sie ordnet nicht um, sie filtert nicht nach Meinung, sie
 * versteckt keinen Kandidaten. Was hier steht, ist die Antwort des Dienstes in der Reihenfolge, die
 * `ranking` gerechnet hat. Die einzige Auswahl, die die Oberfläche trifft, ist **welche Fähigkeit
 * man ansieht** — und „Alle" ist die Voreinstellung.
 *
 * ## Was die Gestaltung tragen muß
 *
 * Die alte Fassung war eine Liste unter einer Liste: eine Zeile Zahlen, dann Absätze, dann wieder
 * Absätze. Auf 1440 px stand links ein schmaler Streifen Text und rechts blieb die Fläche leer.
 * Das ist keine Ansicht, das ist ein ausgedrucktes Protokoll.
 *
 * Die neue Fassung beantwortet drei Fragen in dieser Reihenfolge:
 *
 *   1. **Was ist die Lage?** — die Zahlenleiste: wie viele Kandidaten, wie viele verdrahtet, wie
 *      viele gemessen, wie viele kostenlos, wie viele ohne Preis.
 *   2. **Was wird empfohlen — und warum?** — die Empfehlung steht in der Karte der Fähigkeit, mit
 *      ihren Gründen. Nicht als Fußnote.
 *   3. **Was gibt es sonst?** — die Kandidaten darunter, mit Rang, Modell, Preis und Merkern.
 *
 * ## Warum die Karte je Fähigkeit und nicht eine lange Liste
 *
 * Eine Fähigkeit ist eine **Frage** („Welches Modell für Text?"). Zwei Karten nebeneinander sind
 * zwei Fragen, die man getrennt lesen kann. Eine lange Liste untereinander ist eine Frage, die
 * aussieht wie sechzehn. Deshalb ist die Fläche ein Raster: ab 1100 px zwei Spalten, darunter eine.
 *
 * ## Farbe und Form kommen aus dem Blatt
 *
 * Keine eigenen Farbwerte, keine eigenen Radien, keine eigenen Schatten. Was hier steht, liest
 * `app.css` aus den Tokens der Welt. Eine zweite Palette wäre der Anfang einer zweiten Gestaltung.
 *
 * @module apps/universe/src/rang-ansicht
 */

import {
  RANGLISTE_PFAD,
  istPreisBekannt,
  ladeRangliste,
  preisText,
} from './ai-rangliste'
import type {
  Faehigkeitsliste,
  Kostenart,
  Rangantwort,
  Ranglisteneintrag,
  Rangumgebung,
  Rangzahlen,
} from './ai-rangliste'

// ---------------------------------------------------------------------------
// Kleine Bausteine
// ---------------------------------------------------------------------------

/** Wie viele Gründe eine Empfehlung zeigt. Dieselbe Zahl wie in der Textform. */
export const GRUENDE_ANZEIGE = 3

/** Wie viele Kandidaten eine Karte zunächst zeigt. Der Rest ist einen Klick entfernt. */
export const KANDIDATEN_ANZEIGE = 5

/** Wie eine Kostenart im Bild heißt. `unbekannt` bleibt `unbekannt` — nie „kostenlos". */
const KOSTEN_NAME: Readonly<Record<Kostenart, string>> = {
  kostenlos: 'kostenlos',
  freibetrag: 'Freibetrag',
  kostenpflichtig: 'kostenpflichtig',
  unbekannt: 'unbekannt',
}

/** Ein Element mit Klasse und Text — die eine Stelle, an der Knoten entstehen. */
function knoten(dokument: Document, tag: string, klasse = '', text?: string): HTMLElement {
  const el = dokument.createElement(tag) as HTMLElement
  if (klasse !== '') el.className = klasse
  if (text !== undefined) el.textContent = text
  return el
}

/** Ein Knopf, der wie ein Knopf funktioniert — Typ, Klasse, Text, Rückruf. */
function knopf(dokument: Document, klasse: string, text: string, beiKlick: () => void): HTMLButtonElement {
  const el = knoten(dokument, 'button', klasse, text) as HTMLButtonElement
  el.type = 'button'
  el.addEventListener('click', beiKlick)
  return el
}

/** Ob ein Text etwas sagt — nicht nur Leerzeichen. */
function hatText(wert: string | undefined): wert is string {
  return wert !== undefined && wert.trim() !== ''
}

/** Der Rang mit führender Null. `1` wird `01`, `10` bleibt `10`. */
function rangText(rang: number): string {
  return rang < 10 ? `0${String(rang)}` : String(rang)
}

/** Ein Datum aus dem Dienst, lesbar gemacht. Was nicht lesbar ist, bleibt der Rohwert. */
function zeitText(iso: string): string {
  if (iso === '') return 'Zeitpunkt unbekannt'
  const datum = new Date(iso)
  if (Number.isNaN(datum.getTime())) return iso
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(datum)
  } catch {
    return iso
  }
}

/** Der kurze Stand einer Messung — `2026-10-15` wird `15.10.2026`. */
function messText(iso: string): string {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})/u.exec(iso)
  if (treffer === null) return iso
  return `${treffer[3]}.${treffer[2]}.${treffer[1]}`
}

/** Ein Merker im Bild: was er sagt, wie er aussieht, und was er ausführlich bedeutet. */
interface Merker {
  readonly text: string
  readonly art: 'gut' | 'info' | 'warn' | 'leer' | 'schlecht'
  readonly titel: string
}

/**
 * Die Merker eines Eintrags — **aus seinen Feldern, nicht aus seiner Begründung.**
 *
 * Warum nicht die Gründe: sie sind Sätze. Fünf Kandidaten mit je drei Sätzen ergeben eine Wand, in
 * der die Reihenfolge untergeht. Der Merker ist dieselbe Aussage in einem Wort; den ausführlichen
 * Satz trägt sein `title` und die Empfehlung.
 *
 * @param eintrag - der Eintrag
 * @returns die Merker in fester Reihenfolge
 */
export function merkerChips(eintrag: Ranglisteneintrag): readonly Merker[] {
  const raus: Merker[] = [
    eintrag.verdrahtet
      ? { text: 'verdrahtet', art: 'gut', titel: 'Eine Umsetzung nennt diese Fähigkeit.' }
      : { text: 'nicht verdrahtet', art: 'leer', titel: 'Keine Umsetzung nennt diese Fähigkeit.' },
  ]
  if (eintrag.funktionalitaet === 'vorhanden') {
    raus.push({
      text: 'gemessen',
      art: 'info',
      titel: `Weg gemessen vorhanden${hatText(eintrag.gemessenAm) ? ` (${eintrag.gemessenAm})` : ''}.`,
    })
  } else if (eintrag.funktionalitaet === 'fehlt') {
    raus.push({ text: 'Weg fehlt', art: 'schlecht', titel: 'Der Weg wurde gemessen und fehlt (404).' })
  } else {
    raus.push({ text: 'nicht gemessen', art: 'leer', titel: 'Für diesen Weg liegt keine Messung vor.' })
  }
  if (hatText(eintrag.gemessenAm)) {
    raus.push({
      text: `Stand ${messText(eintrag.gemessenAm)}`,
      art: 'leer',
      titel: `Gemessen am ${eintrag.gemessenAm}.`,
    })
  }
  if (eintrag.veraltet) {
    raus.push({ text: 'veraltet', art: 'warn', titel: 'Die Messung ist älter als die Frist.' })
  }
  return raus
}

/**
 * Die Merker als ein Satz — dieselbe Auswahl wie in der Textform.
 *
 * Sie steht in `title` und in der Empfehlung. Wer die Liste im Terminal liest und hier, soll
 * dieselbe Auswahl sehen.
 *
 * @param eintrag - der Eintrag
 * @returns die Merker, mit ` · ` verbunden
 */
export function merker(eintrag: Ranglisteneintrag): readonly string[] {
  const raus: string[] = [eintrag.verdrahtet ? 'verdrahtet' : 'nicht verdrahtet']
  raus.push(
    eintrag.funktionalitaet === 'vorhanden'
      ? 'Weg gemessen vorhanden'
      : eintrag.funktionalitaet === 'fehlt'
        ? 'Weg gemessen FEHLEND'
        : 'Weg nicht gemessen',
  )
  if (hatText(eintrag.gemessenAm)) raus.push(`gemessen am ${eintrag.gemessenAm}`)
  if (eintrag.veraltet) raus.push('Messung veraltet')
  return raus
}

// ---------------------------------------------------------------------------
// Die Zahlen
// ---------------------------------------------------------------------------

/**
 * Die Zahlen der Lage — vom Dienst, oder aus der Liste gezählt.
 *
 * **Warum gezählt werden darf.** `zahlen` ist Beiwerk: der Dienst darf es weglassen. Die Zahlen,
 * die diese Ansicht dann zeigt, sind keine Schätzung — sie sind dieselben Aussagen, nur hier
 * ausgezählt. Was **nicht** passiert: eine fehlende Zahl als `0` zu drucken, ohne daß jemand
 * gezählt hat.
 *
 * @param antwort - die geprüfte Antwort
 * @returns die fünf Zahlen
 */
export function zahlenAus(antwort: Rangantwort): Rangzahlen {
  if (antwort.zahlen !== undefined) return antwort.zahlen
  const eintraege = antwort.rangliste.listen.flatMap((liste) => liste.eintraege)
  return {
    eintraege: eintraege.length,
    verdrahtet: eintraege.filter((eintrag) => eintrag.verdrahtet).length,
    gemessen: eintraege.filter((eintrag) => eintrag.funktionalitaet === 'vorhanden').length,
    kostenlos: eintraege.filter((eintrag) => eintrag.kostenart === 'kostenlos').length,
    ohnePreis: eintraege.filter((eintrag) => !istPreisBekannt(eintrag.preis)).length,
  }
}

// ---------------------------------------------------------------------------
// Preis
// ---------------------------------------------------------------------------

/** Eine Seite eines Preises: „in" oder „out" plus Zahl. */
function preisSeite(dokument: Document, marke: string, wert: number | undefined): HTMLElement {
  const box = knoten(dokument, 'span', 'rang-preis')
  box.appendChild(knoten(dokument, 'span', 'rang-preis-marke', marke))
  box.appendChild(knoten(dokument, 'b', 'rang-preis-zahl', wert === undefined || wert < 0 ? '—' : wert.toFixed(2)))
  return box
}

/**
 * Der Preis als zwei Zahlen — und **nie als `-1`.**
 *
 * Die Textform (`preisText`) bleibt die Wahrheit für Vorlesegeräte und den `title`. Im Bild stehen
 * zwei Spalten, weil man Preise vergleicht, indem man Zahlen untereinander liest, nicht Sätze.
 *
 * @param dokument - das Dokument
 * @param eintrag - der Eintrag
 * @returns der Preisblock
 */
function preisBlock(dokument: Document, eintrag: Ranglisteneintrag): HTMLElement {
  const box = knoten(dokument, 'span', 'rang-preisgruppe')
  const preis = eintrag.preis
  const bekannt = istPreisBekannt(preis)
  box.dataset.bekannt = bekannt ? '1' : '0'
  box.setAttribute('aria-label', preisText(preis))
  box.title = preisText(preis)
  if (!bekannt && preis.hinein < 0 && preis.heraus < 0) {
    box.appendChild(knoten(dokument, 'span', 'rang-preis-unbekannt', 'unbekannt'))
    return box
  }
  box.appendChild(preisSeite(dokument, 'in', preis.hinein))
  box.appendChild(knoten(dokument, 'span', 'rang-preis-trenner', '/'))
  box.appendChild(preisSeite(dokument, 'out', preis.heraus))
  box.appendChild(knoten(dokument, 'span', 'rang-preis-einheit', 'USD / 1M'))
  return box
}

// ---------------------------------------------------------------------------
// Die Empfehlung
// ---------------------------------------------------------------------------

/**
 * Der Block der bevorzugten Wahl — mit ihren Gründen.
 *
 * **Warum er in der Karte steht und nicht in einer Seitenleiste.** Die Empfehlung ist die Antwort
 * auf die Frage der Karte. Eine Seitenleiste würde sie von der Frage trennen, und bei zwei Karten
 * gäbe es zwei Empfehlungen in einer Leiste.
 *
 * @param dokument - das Dokument
 * @param liste - die Fähigkeitsliste
 * @returns der Block
 */
function empfehlungsblock(dokument: Document, liste: Faehigkeitsliste): HTMLElement {
  const box = knoten(dokument, 'div', 'rang-empfehlung')
  const empfehlung = liste.empfehlung

  if (empfehlung === undefined) {
    box.dataset.ohne = '1'
    const kopf = knoten(dokument, 'div', 'rang-empfehlung-kopf')
    kopf.appendChild(knoten(dokument, 'span', 'rang-empfehlung-marke', 'Bevorzugt'))
    kopf.appendChild(knoten(dokument, 'span', 'rang-empfehlung-titel', 'KEINE'))
    box.appendChild(kopf)
    box.appendChild(
      knoten(
        dokument,
        'p',
        'rang-empfehlung-grund',
        liste.ohneEmpfehlung ?? 'Kein Kandidat erfüllt die Bedingungen.',
      ),
    )
    return box
  }

  const kopf = knoten(dokument, 'div', 'rang-empfehlung-kopf')
  kopf.appendChild(knoten(dokument, 'span', 'rang-empfehlung-marke', 'Bevorzugt'))
  kopf.appendChild(
    knoten(dokument, 'span', 'rang-empfehlung-titel', `${empfehlung.familienname} · ${empfehlung.modell ?? 'kein Modell genannt'}`),
  )
  const preis = preisBlock(dokument, empfehlung)
  kopf.appendChild(preis)
  box.appendChild(kopf)

  const meta = knoten(
    dokument,
    'div',
    'rang-empfehlung-meta',
    `${KOSTEN_NAME[empfehlung.kostenart]} · ${preisText(empfehlung.preis)}`,
  )
  box.appendChild(meta)
  box.appendChild(knoten(dokument, 'div', 'rang-empfehlung-status', merker(empfehlung).join(' · ')))

  const gezeigt = empfehlung.gruende.slice(0, GRUENDE_ANZEIGE)
  if (gezeigt.length > 0) {
    const ul = knoten(dokument, 'ul', 'rang-gruende')
    for (const grund of gezeigt) {
      ul.appendChild(knoten(dokument, 'li', '', grund))
    }
    box.appendChild(ul)
  }
  const rest = empfehlung.gruende.length - gezeigt.length
  if (rest > 0) {
    box.appendChild(knoten(dokument, 'div', 'rang-gruende-rest', `… und ${String(rest)} weitere Gründe`))
  }
  return box
}

// ---------------------------------------------------------------------------
// Der Kandidat
// ---------------------------------------------------------------------------

/**
 * Eine Zeile der Kandidatenliste.
 *
 * Die Zeile ist **kein Knopf**: sie tut nichts. Ein Klick, der nichts tut, ist ein Versprechen, das
 * die Ansicht nicht hält. Was zusätzlich zu wissen ist, steht im `title` und in der Empfehlung.
 *
 * @param dokument - das Dokument
 * @param eintrag - der Eintrag
 * @param bevorzugt - ist das die Empfehlung?
 * @returns die Zeile
 */
function eintragszeile(dokument: Document, eintrag: Ranglisteneintrag, bevorzugt: boolean): HTMLElement {
  const zeile = knoten(dokument, 'article', 'rang-eintrag')
  zeile.dataset.rang = String(eintrag.rang)
  if (bevorzugt) zeile.dataset.bevorzugt = '1'
  zeile.setAttribute(
    'aria-label',
    `Platz ${String(eintrag.rang)}: ${eintrag.familienname}${hatText(eintrag.modell) ? `, ${eintrag.modell}` : ', kein Modell genannt'}`,
  )

  const platz = knoten(dokument, 'span', 'rang-platz', rangText(eintrag.rang))
  platz.setAttribute('aria-hidden', 'true')
  zeile.appendChild(platz)

  const kopf = knoten(dokument, 'div', 'rang-kopf')
  if (bevorzugt) kopf.appendChild(knoten(dokument, 'span', 'rang-bevorzugt-marke', 'Bevorzugt'))
  kopf.appendChild(knoten(dokument, 'span', 'rang-familie', eintrag.familienname))
  // **Ohne Modell steht hier ein Satz, nicht nichts.** Ein leeres Feld sieht aus wie ein Fehler der
  // Anzeige; „kein Modell genannt" ist der Befund selbst.
  kopf.appendChild(knoten(dokument, 'span', 'rang-modell', eintrag.modell ?? 'kein Modell genannt'))
  zeile.appendChild(kopf)

  const kosten = knoten(dokument, 'div', 'rang-kosten')
  const art = knoten(dokument, 'span', 'rang-kostenart', KOSTEN_NAME[eintrag.kostenart])
  art.dataset.kosten = eintrag.kostenart
  kosten.appendChild(art)
  kosten.appendChild(preisBlock(dokument, eintrag))
  zeile.appendChild(kosten)

  const merkerBox = knoten(dokument, 'div', 'rang-merker')
  for (const eintragMerker of merkerChips(eintrag)) {
    const chip = knoten(dokument, 'span', 'rang-chip', eintragMerker.text)
    chip.dataset.art = eintragMerker.art
    chip.title = eintragMerker.titel
    merkerBox.appendChild(chip)
  }
  zeile.appendChild(merkerBox)

  if (eintrag.gruende.length > 0) {
    const kurz = knoten(dokument, 'p', 'rang-grund-kurz', eintrag.gruende[0])
    kurz.title = eintrag.gruende.join(' ')
    zeile.appendChild(kurz)
  }
  zeile.title = merker(eintrag).join(' · ')
  return zeile
}

// ---------------------------------------------------------------------------
// Die Karte einer Fähigkeit
// ---------------------------------------------------------------------------

/**
 * Eine Fähigkeit als Karte: Kopf, Empfehlung, Kandidaten, mehr.
 *
 * @param dokument - das Dokument
 * @param liste - die Fähigkeitsliste
 * @param id - die stabile Kennung der Karte (für „mehr anzeigen")
 * @param offen - sind alle Kandidaten sichtbar?
 * @param umschalten - schaltet „mehr anzeigen" um
 * @returns die Karte
 */
function faehigkeitskarte(
  dokument: Document,
  liste: Faehigkeitsliste,
  id: string,
  offen: boolean,
  umschalten: () => void,
): HTMLElement {
  const box = knoten(dokument, 'section', 'rang-faehigkeit')
  box.dataset.faehigkeit = liste.faehigkeit
  box.dataset.kennung = id
  box.setAttribute('aria-label', `Fähigkeit ${liste.name}`)

  const kopf = knoten(dokument, 'div', 'rang-faehig-kopf')
  const titel = knoten(dokument, 'h3', 'rang-titel', liste.name)
  kopf.appendChild(titel)
  if (hatText(liste.faehigkeit) && liste.faehigkeit !== liste.name) {
    kopf.appendChild(knoten(dokument, 'span', 'rang-faehig-id', liste.faehigkeit))
  }
  kopf.appendChild(
    knoten(
      dokument,
      'span',
      'rang-faehig-anzahl',
      `${String(liste.eintraege.length)} ${liste.eintraege.length === 1 ? 'Kandidat' : 'Kandidaten'}`,
    ),
  )
  box.appendChild(kopf)

  box.appendChild(empfehlungsblock(dokument, liste))

  if (liste.eintraege.length === 0) {
    box.appendChild(knoten(dokument, 'p', 'rang-leer', 'kein Eintrag'))
    return box
  }

  const listenBox = knoten(dokument, 'div', 'rang-liste')
  const sichtbar = offen ? liste.eintraege : liste.eintraege.slice(0, KANDIDATEN_ANZEIGE)
  /*
   * **Verglichen wird der RANG, nicht das Objekt.**
   *
   * Über JSON gibt es keine gemeinsamen Objekte: die bevorzugte Wahl kommt als **zweite Kopie**
   * desselben Eintrags an. Ein Vergleich mit `===` wäre deshalb **immer** falsch — und die Marke
   * „bevorzugt" stünde nie im Bild.
   */
  const bevorzugterRang = liste.empfehlung?.rang
  for (const eintrag of sichtbar) {
    listenBox.appendChild(
      eintragszeile(dokument, eintrag, bevorzugterRang !== undefined && eintrag.rang === bevorzugterRang),
    )
  }
  box.appendChild(listenBox)

  const verborgen = liste.eintraege.length - sichtbar.length
  if (offen && liste.eintraege.length > KANDIDATEN_ANZEIGE) {
    box.appendChild(knopf(dokument, 'rang-mehr', 'Weniger anzeigen', umschalten))
  } else if (verborgen > 0) {
    box.appendChild(
      knopf(dokument, 'rang-mehr', `… und ${String(verborgen)} weitere Kandidaten`, umschalten),
    )
  }
  return box
}

// ---------------------------------------------------------------------------
// Der Kopf der Ansicht
// ---------------------------------------------------------------------------

/** Eine Zahl mit Namen — die Bausteine der Lage. */
function zahl(dokument: Document, wert: number, name: string, art: string, titel: string): HTMLElement {
  const box = knoten(dokument, 'div', 'rang-zahl')
  box.dataset.art = art
  box.title = titel
  box.appendChild(knoten(dokument, 'b', 'rang-zahl-wert', String(wert)))
  box.appendChild(knoten(dokument, 'span', 'rang-zahl-name', name))
  return box
}

/** Die Zahlenleiste — die Lage in fünf Aussagen. */
function zahlenleiste(dokument: Document, zahlen: Rangzahlen): HTMLElement {
  const box = knoten(dokument, 'div', 'rang-zahlen')
  box.appendChild(zahl(dokument, zahlen.eintraege, 'Kandidaten', 'normal', 'Alle Kandidaten der Liste.'))
  box.appendChild(zahl(dokument, zahlen.verdrahtet, 'verdrahtet', 'gut', 'Kandidaten mit einer eingetragenen Umsetzung.'))
  box.appendChild(zahl(dokument, zahlen.gemessen, 'gemessen', 'info', 'Kandidaten, deren Weg als vorhanden gemessen wurde.'))
  box.appendChild(zahl(dokument, zahlen.kostenlos, 'kostenlos', 'frei', 'Kandidaten ohne Kosten.'))
  box.appendChild(zahl(dokument, zahlen.ohnePreis, 'ohne Preis', 'warn', 'Kandidaten ohne bekannten Preis — niemals als 0 gezählt.'))
  return box
}

// ---------------------------------------------------------------------------
// Die Ansicht
// ---------------------------------------------------------------------------

/**
 * Schreibt die Liste in ein Element.
 *
 * **Warum `replaceChildren` und kein Anhängen.** Wird das Panel neu gebaut, kommt hier ein **neuer**
 * Aufruf; ohne das Leeren stünde die Liste zweimal im Baum und läse sich wie zwei Stände.
 *
 * @param host - wohin gemalt wird
 * @param antwort - die geprüfte Antwort
 * @param umgebung - nur das Dokument ist hier von Belang
 */
export function maleRangliste(host: HTMLElement, antwort: Rangantwort, umgebung: Rangumgebung = {}): void {
  const dokument = umgebung.dokument ?? globalThis.document
  const pfad = umgebung.pfad ?? RANGLISTE_PFAD
  host.replaceChildren()

  const wurzel = knoten(dokument, 'div', 'rang')
  const zahlen = zahlenAus(antwort)
  const listen = antwort.rangliste.listen
  const kennungen = listen.map((liste, index) => `${liste.faehigkeit || liste.name}#${String(index)}`)

  // ── Kopf ────────────────────────────────────────────────────────────────────────────────
  const dach = knoten(dokument, 'header', 'rang-dach')
  const marke = knoten(dokument, 'div', 'rang-marke')
  const punkt = knoten(dokument, 'span', 'rang-punkt')
  punkt.setAttribute('aria-hidden', 'true')
  marke.appendChild(punkt)
  marke.appendChild(knoten(dokument, 'span', 'rang-marke-text', 'Übersicht'))
  marke.appendChild(knoten(dokument, 'span', 'rang-moment', 'Momentaufnahme'))
  dach.appendChild(marke)

  const titelzeile = knoten(dokument, 'div', 'rang-titelzeile')
  titelzeile.appendChild(knoten(dokument, 'h2', 'rang-haupttitel', 'Die bevorzugte Wahl je Fähigkeit'))
  titelzeile.appendChild(
    knoten(
      dokument,
      'p',
      'rang-untertitel',
      'Gelesen aus dem Anbieter-Katalog. Die Reihenfolge rechnet der Dienst — diese Ansicht wählt nichts.',
    ),
  )
  dach.appendChild(titelzeile)

  const recht = knoten(dokument, 'div', 'rang-dach-rechts')
  const quelle = knoten(dokument, 'span', 'rang-quelle', `GET ${pfad}`)
  quelle.title = 'Die Quelle dieser Ansicht.'
  recht.appendChild(quelle)
  recht.appendChild(
    knopf(dokument, 'rang-knopf', 'Aktualisieren', () => {
      void fuelleRangliste(host, umgebung)
    }),
  )
  dach.appendChild(recht)
  wurzel.appendChild(dach)

  // ── Lage ────────────────────────────────────────────────────────────────────────────────
  wurzel.appendChild(zahlenleiste(dokument, zahlen))

  // ── Leiste: Fähigkeiten und Stand ───────────────────────────────────────────────────────
  const leiste = knoten(dokument, 'div', 'rang-leiste')
  const tabs = knoten(dokument, 'div', 'rang-tabs')
  tabs.setAttribute('role', 'group')
  tabs.setAttribute('aria-label', 'Fähigkeit wählen')
  const tabKnoepfe: HTMLButtonElement[] = []
  const zustand = { aktiv: 'alle', offen: {} as Record<string, boolean> }

  /** Zeichnet nur die Fläche neu — Kopf, Zahlen und Leiste bleiben stehen. */
  const zeichne = (): void => {
    flaeche.replaceChildren()
    const sichtbar = listen
      .map((liste, index) => ({ liste, id: kennungen[index] ?? String(index) }))
      .filter((eintrag) => zustand.aktiv === 'alle' || eintrag.id === zustand.aktiv)
    if (sichtbar.length === 0) {
      flaeche.appendChild(knoten(dokument, 'p', 'rang-leer', 'Für diese Fähigkeit gibt es keinen Eintrag.'))
      return
    }
    for (const eintrag of sichtbar) {
      flaeche.appendChild(
        faehigkeitskarte(dokument, eintrag.liste, eintrag.id, zustand.offen[eintrag.id] === true, () => {
          zustand.offen[eintrag.id] = zustand.offen[eintrag.id] !== true
          zeichne()
        }),
      )
    }
  }

  const tabsAktualisieren = (): void => {
    for (const tab of tabKnoepfe) {
      const an = tab.dataset.rangTab === zustand.aktiv
      tab.dataset.an = an ? '1' : '0'
      tab.setAttribute('aria-pressed', an ? 'true' : 'false')
    }
  }

  if (listen.length > 1) {
    const alle = knopf(dokument, 'rang-tab', 'Alle', () => {
      zustand.aktiv = 'alle'
      tabsAktualisieren()
      zeichne()
    })
    alle.dataset.rangTab = 'alle'
    tabKnoepfe.push(alle)
    tabs.appendChild(alle)
    for (const [index, liste] of listen.entries()) {
      const id = kennungen[index] ?? String(index)
      const tab = knopf(dokument, 'rang-tab', liste.name, () => {
        zustand.aktiv = id
        tabsAktualisieren()
        zeichne()
      })
      tab.dataset.rangTab = id
      tabKnoepfe.push(tab)
      tabs.appendChild(tab)
    }
  } else if (listen.length === 1) {
    const einzige = listen[0]
    if (einzige !== undefined) {
      const tab = knopf(dokument, 'rang-tab', einzige.name, () => {
        zustand.aktiv = kennungen[0] ?? '0'
        tabsAktualisieren()
        zeichne()
      })
      tab.dataset.rangTab = kennungen[0] ?? '0'
      tabKnoepfe.push(tab)
      tabs.appendChild(tab)
    }
  }
  leiste.appendChild(tabs)
  leiste.appendChild(
    knoten(
      dokument,
      'span',
      'rang-stand',
      antwort.rangliste.erstelltAm === ''
        ? 'Stand unbekannt'
        : `gerechnet ${zeitText(antwort.rangliste.erstelltAm)}`,
    ),
  )
  wurzel.appendChild(leiste)

  // ── Fläche ─────────────────────────────────────────────────────────────────────────────
  const flaeche = knoten(dokument, 'div', 'rang-flaeche')
  flaeche.id = 'rang-flaeche'
  wurzel.appendChild(flaeche)
  if (listen.length > 0) zeichne()
  tabsAktualisieren()

  if (listen.length === 0) {
    wurzel.appendChild(knoten(dokument, 'p', 'rang-leer', 'Der Dienst hat für keine Fähigkeit einen Eintrag geliefert.'))
  }

  // ── Hinweise ───────────────────────────────────────────────────────────────────────────
  if (antwort.rangliste.hinweise.length > 0) {
    const box = knoten(dokument, 'section', 'rang-hinweise')
    box.appendChild(knoten(dokument, 'h4', 'rang-hinweise-titel', 'Hinweise'))
    for (const hinweis of antwort.rangliste.hinweise) {
      box.appendChild(knoten(dokument, 'p', 'rang-hinweis', hinweis))
    }
    wurzel.appendChild(box)
  }

  host.appendChild(wurzel)
}

// ---------------------------------------------------------------------------
// Laden und Scheitern
// ---------------------------------------------------------------------------

/** Das Skelett, solange gelesen wird — dieselbe Form wie die Ansicht, nur ohne Inhalt. */
function ladeskelett(dokument: Document, pfad: string): HTMLElement {
  const wurzel = knoten(dokument, 'div', 'rang rang-laden')
  wurzel.setAttribute('aria-busy', 'true')
  wurzel.appendChild(knoten(dokument, 'span', 'rang-sr', `Liest GET ${pfad} …`))

  const dach = knoten(dokument, 'div', 'rang-dach')
  const marke = knoten(dokument, 'div', 'rang-marke')
  marke.appendChild(knoten(dokument, 'span', 'rang-skelett rang-skelett-punkt'))
  marke.appendChild(knoten(dokument, 'span', 'rang-skelett rang-skelett-marke'))
  dach.appendChild(marke)
  dach.appendChild(knoten(dokument, 'div', 'rang-skelett rang-skelett-titel'))
  wurzel.appendChild(dach)

  const zahlen = knoten(dokument, 'div', 'rang-zahlen')
  for (let i = 0; i < 5; i += 1) {
    const kachel = knoten(dokument, 'div', 'rang-zahl rang-zahl-skelett')
    kachel.appendChild(knoten(dokument, 'span', 'rang-skelett rang-skelett-zahl'))
    kachel.appendChild(knoten(dokument, 'span', 'rang-skelett rang-skelett-name'))
    zahlen.appendChild(kachel)
  }
  wurzel.appendChild(zahlen)

  const flaeche = knoten(dokument, 'div', 'rang-flaeche')
  for (let i = 0; i < 2; i += 1) {
    const karte = knoten(dokument, 'div', 'rang-faehigkeit rang-skelett-karte')
    karte.appendChild(knoten(dokument, 'span', 'rang-skelett rang-skelett-titel-klein'))
    karte.appendChild(knoten(dokument, 'span', 'rang-skelett rang-skelett-empfehlung'))
    for (let z = 0; z < 3; z += 1) {
      karte.appendChild(knoten(dokument, 'span', 'rang-skelett rang-skelett-zeile'))
    }
    flaeche.appendChild(karte)
  }
  wurzel.appendChild(flaeche)
  return wurzel
}

/**
 * Schreibt den **Grund** in ein Element.
 *
 * **Warum das ein eigener Weg ist und nicht ein leerer Zustand der Liste.** Der Unterschied ist die
 * ganze Aussage dieser Ansicht: eine leere Fläche sagt „es gibt nichts", ein Grund sagt „ich kam
 * nicht heran, und zwar deshalb". Wer beides gleich malt, schickt den Leser an die falsche Stelle.
 *
 * @param host - wohin gemalt wird
 * @param grund - warum es nichts zu zeigen gibt
 * @param umgebung - Dokument, Pfad und Abruf
 */
export function maleGrund(host: HTMLElement, grund: string, umgebung: Rangumgebung = {}): void {
  const dokument = umgebung.dokument ?? globalThis.document
  const pfad = umgebung.pfad ?? RANGLISTE_PFAD
  host.replaceChildren()

  const box = knoten(dokument, 'div', 'rang rang-fehler')
  box.appendChild(knoten(dokument, 'span', 'rang-fehler-marke', 'Verbindung'))
  box.appendChild(knoten(dokument, 'h3', 'rang-fehler-titel', 'Die Rangliste konnte nicht gelesen werden'))
  box.appendChild(knoten(dokument, 'p', 'rang-grund', grund))

  const fuss = knoten(dokument, 'div', 'rang-fehler-fuss')
  const quelle = knoten(dokument, 'span', 'rang-quelle', `GET ${pfad}`)
  quelle.title = 'Die Quelle dieser Ansicht.'
  fuss.appendChild(quelle)
  fuss.appendChild(
    knopf(dokument, 'rang-knopf', 'Erneut versuchen', () => {
      void fuelleRangliste(host, umgebung)
    }),
  )
  box.appendChild(fuss)
  host.appendChild(box)
}

/**
 * Lädt und malt — **der eine Einstieg**, den das Panel ruft.
 *
 * **Warum diese Funktion nicht wirft.** Sie ist der Rückruf eines Panels; ein geworfener Fehler wäre
 * dort ein leeres Fenster, das nach „lädt noch" aussieht. Jeder Ausgang endet in einem **Satz im
 * Bild** — notfalls in dem letzten, den man ohne Elemente schreiben kann (`textContent`).
 *
 * **Warum geprüft wird, ob der Knoten noch im Baum hängt.** Das Laden dauert; in der Zwischenzeit
 * kann der Nutzer das Panel abstecken. Wer dann in einen abgehängten Knoten malt, arbeitet für ein
 * Fenster, das niemand mehr sieht.
 *
 * @param host - das Element des Panels
 * @param umgebung - Pfad, Abruf und Dokument (alles austauschbar)
 */
export async function fuelleRangliste(host: HTMLElement, umgebung: Rangumgebung = {}): Promise<void> {
  const dokument = umgebung.dokument ?? globalThis.document
  const pfad = umgebung.pfad ?? RANGLISTE_PFAD
  try {
    host.replaceChildren(ladeskelett(dokument, pfad))
    const ladung = await ladeRangliste(umgebung)
    if (!host.isConnected) return
    if (ladung.art === 'ok') maleRangliste(host, ladung.antwort, umgebung)
    else maleGrund(host, ladung.grund, umgebung)
  } catch (fehler) {
    // **Der letzte Satz, der ohne Elemente auskommt.** Wenn selbst das Bauen von Knoten scheitert,
    // bleibt nur Text — aber auch dann steht der Grund im Bild, statt einer leeren Fläche.
    const ursache = fehler instanceof Error ? fehler.message : String(fehler)
    try {
      host.textContent = `Die Ansicht ist beim Anzeigen gescheitert: ${ursache}`
    } catch {
      /* Auch das Schreiben von Text ist gescheitert — mehr ist von hier aus nicht zu tun. */
    }
  }
}


