/**
 * Die Rangliste — die **bevorzugte** Wahl je Fähigkeit, mit Begründung.
 *
 * ## Die Lücke, die dieses Paket schließt
 *
 * Am 15.10.2026 standen die drei Teile nebeneinander und **redeten nicht miteinander**:
 *
 * | Teil | Was er wußte | Was er nicht sagte |
 * |---|---|---|
 * | `provider-directory` | **wo** eine Familie eine Fähigkeit anbietet | ob es dazu eine **Umsetzung** gibt |
 * | `directory-curator` | **was** gemessen wurde, mit Datum | was davon **zuerst** zu nehmen ist |
 * | `tariffs` | **was** ein Modell kostet | für **welche** Fähigkeit das gilt |
 * | `capabilities` | **wer** eine Fähigkeit umsetzt | wie gut er im Vergleich dasteht |
 *
 * Gemessen: eine Suche über `packages/ai` nach `rangliste|bevorzugt|ranking` findet **nichts** —
 * nur den Satz in `capabilities`, daß die *Eintragsreihenfolge* die Rangfolge sei. Das ist eine
 * Reihenfolge im Quelltext, keine bewertete Liste. Dieses Paket rechnet sie aus.
 *
 * ## Die vier Fragen, in dieser Reihenfolge
 *
 * Die Rangfolge ist **lexikografisch**, und die Reihenfolge der Fragen ist die eigentliche
 * Entscheidung dieses Pakets:
 *
 * | # | Frage | Warum **so** früh |
 * |---|---|---|
 * | 1 | Gibt es eine **Umsetzung**? | Ohne sie ist alles andere gleichgültig: ein noch so billiger, gemessener, vorhandener Weg ist unbenutzbar, wenn niemand ihn aufruft |
 * | 2 | Ist die Fähigkeit **gemessen vorhanden**? | „Der Weg ist da" ist nicht „die Fähigkeit wirkt" — der Befund steht in `directory-curator` mit Datum |
 * | 3 | Was **kostet** es? | Erst wenn zwei Kandidaten brauchbar sind, entscheidet Geld |
 * | 4 | Name von Familie und Modell | **Nur** damit zwei gleiche Läufe dieselbe Liste ergeben |
 *
 * **Was NICHT nach vorn sortiert: ein unbekannter Preis.** `KOSTEN_RANG` gibt `unbekannt` den
 * höchsten Wert. Ohne diese Zeile stünde das Modell, dessen Rechnung niemand kennt, ganz oben —
 * weil ein fehlender Wert in jeder Sortierung als kleinster durchgeht.
 *
 * ## Kein Netzzugriff
 *
 * Alles wird **hereingereicht**: Familien, Katalog, Anbieter, Tarife, gemessene Modelllisten. Damit
 * ist die Rangfolge ohne Schlüssel und ohne Verbindung prüfbar — und ein Lauf ist wiederholbar.
 *
 * ## Was dieses Paket NICHT tut
 *
 * Es **wählt nicht**. Es legt eine Reihenfolge **vor**. Welches Modell läuft, entscheidet der
 * Endnutzer über `@prometheus-harness/settings` — dieselbe Grenze, die der Verwalter zieht.
 *
 * @module @prometheus-harness/ranking
 */

import {
  FAEHIGKEITEN,
  MENSCH_ID,
  NAME_DER_FAEHIGKEIT,
  type Anbieter,
  type Faehigkeit,
} from '@prometheus-harness/capabilities'
import type { Familie, Modellangabe } from '@prometheus-harness/provider-directory'
import { TAKT_TAG, istFrisch, type Katalog, type Takt } from '@prometheus-harness/directory-curator'
import {
  KOSTEN_RANG,
  PREIS_UNBEKANNT,
  alsText,
  kostenartFuer,
  preisBekannt,
  summe,
  tarifFuer,
  type Kostenart,
  type Preis,
  type Tarifeintrag,
} from '@prometheus-harness/tariffs'

// ---------------------------------------------------------------------------
// Was ein Eintrag aussagt
// ---------------------------------------------------------------------------

/**
 * Wie die Fähigkeit gemessen wurde.
 *
 * **Warum drei Werte und nicht ein Wahrheitswert.** `fehlt` und `unbekannt` sind verschiedene
 * Aussagen: das eine ist ein **Befund** (404 gemessen), das andere ein **Nichtwissen** (kein
 * Schlüssel, Netzfehler, nie geprüft). Wer beide als „nicht vorhanden" liest, wirft einen
 * gemessenen Anbieter weg; wer beide als „vorhanden" liest, trägt einen ein, der nichts kann.
 */
export type Funktionsstand =
  /** Gemessen: der Weg antwortet (400 auf einen leeren Auftrag, nicht 404). */
  | 'vorhanden'
  /** Nicht gemessen — oder nicht meßbar. */
  | 'unbekannt'
  /** Gemessen: der Weg gibt 404. */
  | 'fehlt'

/** Die Rangfolge der Funktionsstände — kleiner ist besser. */
export const FUNKTIONS_RANG: Readonly<Record<Funktionsstand, number>> = {
  vorhanden: 0,
  unbekannt: 1,
  fehlt: 2,
}

/** Ein Eintrag der Rangliste. */
export interface Ranglisteneintrag {
  /** Der Platz, **eins-basiert**. Zwei Einträge mit gleichem Rang gibt es nicht — siehe `vergleiche`. */
  readonly rang: number
  /** Die Fähigkeit, für die dieser Eintrag gilt. */
  readonly faehigkeit: Faehigkeit
  /** Die Kennung der Familie (`openrouter`). */
  readonly familie: string
  /** Der Name der Familie für Menschen. */
  readonly familienname: string
  /** Die Modellkennung — **fehlt**, wenn die Familie keine genannt hat. */
  readonly modell?: string
  /** Gibt es eine eingetragene **Umsetzung** für diese Fähigkeit? */
  readonly verdrahtet: boolean
  /**
   * Steht die Quelle im Verzeichnis?
   *
   * **Warum das ein eigenes Feld ist.** `false` heißt: es gibt eine Umsetzung, aber **keine**
   * Familie dieses Namens — der lokale Fall. Wer nur {@link Ranglisteneintrag.verdrahtet} liest,
   * hielte einen lokalen Anbieter für einen gemessenen Dienst und suchte den fehlenden Befund bei
   * der Sonde statt im Verzeichnis.
   */
  readonly imVerzeichnis: boolean
  /** Was über die Fähigkeit bei dieser Familie gemessen ist. */
  readonly funktionalitaet: Funktionsstand
  /** Wie sie abgerechnet wird. */
  readonly kostenart: Kostenart
  /** Der wirksame Preis — Messung vor Tabelle. */
  readonly preis: Preis
  /** Wann das gemessen wurde, falls je. */
  readonly gemessenAm?: string
  /** Ob die Messung älter ist als die Frist. */
  readonly veraltet: boolean
  /** Ein benanntes Kontingent, falls eines bekannt ist. */
  readonly freibetrag?: Tarifeintrag['freibetrag']
  /** Warum dieser Platz. **Jeder** Eintrag trägt seine Begründung. */
  readonly gruende: readonly string[]
}

/** Die geordnete Liste **einer** Fähigkeit. */
export interface Faehigkeitsliste {
  readonly faehigkeit: Faehigkeit
  /** Der deutsche Name für die Anzeige. */
  readonly name: string
  readonly eintraege: readonly Ranglisteneintrag[]
  /** Die bevorzugte Wahl — der erste brauchbare Eintrag. */
  readonly empfehlung?: Ranglisteneintrag
  /** Warum es keine Empfehlung gibt. **Fehlt nie, wenn `empfehlung` fehlt.** */
  readonly ohneEmpfehlung?: string
}

/** Die ganze Rangliste. */
export interface Rangliste {
  /** Wann gerechnet wurde (ISO). */
  readonly erstelltAm: string
  readonly listen: readonly Faehigkeitsliste[]
  /** Was sonst zu sagen ist — je Zeile eine Aussage. */
  readonly hinweise: readonly string[]
}

/** Was zum Rechnen hineingegeben wird. */
export interface Rangoptionen {
  /** Die Familien aus dem Verzeichnis. */
  readonly familien: readonly Familie[]
  /**
   * Der Katalog des Verwalters.
   *
   * Fehlt er, ist **jede** Fähigkeit `unbekannt` — und die Liste sagt das, statt „vorhanden" zu
   * vermuten.
   */
  readonly katalog?: Katalog
  /**
   * Die eingetragenen **Umsetzungen**.
   *
   * **Warum Anbieter und nicht bloß Kennungen.** Ein Anbieter nennt seine Fähigkeiten **selbst** —
   * daraus ergibt sich die Verdrahtung, ohne daß jemand eine zweite Liste pflegen muß, die
   * veralten könnte.
   */
  readonly anbieter?: readonly Anbieter[]
  /** Die Tarife; Saat und Messung sind hier schon verschmolzen (`verschmelze`). */
  readonly tarife?: readonly Tarifeintrag[]
  /**
   * Die **gemessenen** Modelllisten je Familie, mit Preis soweit genannt
   * (`frageModelleMitPreis`).
   *
   * Fehlt eine Familie hier, greifen die Tarife als Saat — und wenn auch die schweigen, steht ein
   * Eintrag **ohne Modell** in der Liste. Das ist keine Lücke, sondern die ehrliche Form von
   * „wir wissen, daß es die Fähigkeit gibt, aber nicht womit".
   */
  readonly modelle?: Readonly<Record<string, readonly Modellangabe[]>>
  /** Die Fähigkeiten, für die eine Liste entstehen soll. Vorgabe: alle. */
  readonly faehigkeiten?: readonly Faehigkeit[]
  /** Der Zeitpunkt, der als „jetzt" gilt. Vorgabe: die Uhr. */
  readonly jetzt?: Date
  /** Wie lange eine Messung als frisch gilt. Vorgabe: ein Tag. */
  readonly takt?: Takt
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/**
 * Vergleicht zwei Zeichenketten nach Code-Einheit.
 *
 * Absichtlich **nicht** `localeCompare`: dessen Reihenfolge hängt an der ICU-Version und der
 * Systemsprache. Diese Liste verspricht aber, daß zwei Aufrufe zweimal dasselbe ergeben.
 */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Der gemessene Funktionsstand einer Familie für eine Fähigkeit. */
function funktionsstandAus(katalog: Katalog | undefined, familie: string, faehigkeit: Faehigkeit): Funktionsstand {
  const befund = katalog?.eintraege[familie]?.wege[faehigkeit]
  if (befund === 'vorhanden') return 'vorhanden'
  if (befund === 'fehlt') return 'fehlt'
  return 'unbekannt'
}

/**
 * Die vollständige Ordnung zweier Einträge.
 *
 * **Warum eine totale Ordnung und nicht „gleich gut".** Zwei Einträge, die sich in nichts
 * unterscheiden, bekämen ohne Schlußkriterium die Reihenfolge der Einfügung — und die hinge daran,
 * in welcher Reihenfolge die Familien ins Verzeichnis kamen. Der Name am Ende macht die Liste
 * **wiederholbar**; das ist der ganze Zweck.
 */
function vergleiche(a: Ranglisteneintrag, b: Ranglisteneintrag): number {
  // 0. **Der Mensch immer zuletzt.** `capabilities` sagt es an zwei Stellen: „Der Mensch ist der
  //    letzte Anbieter" — er ist die Antwort auf „keiner kann es". Ohne diese Zeile entschiede der
  //    **Name**: `mensch` steht alphabetisch vor `openrouter` und gewönne gegen jeden verdrahteten,
  //    aber noch ungemessenen Anbieter. Ein Mensch, der eine Maschine verdrängt, weil sein Name
  //    früher im Alphabet steht, wäre genau der stille Fehler, den diese Liste verhindern soll.
  const aMensch = a.familie === MENSCH_ID
  const bMensch = b.familie === MENSCH_ID
  if (aMensch !== bMensch) return aMensch ? 1 : -1
  // 1. Vernunft: eine Umsetzung schlägt alles.
  if (a.verdrahtet !== b.verdrahtet) return a.verdrahtet ? -1 : 1
  // 2. Befund: gemessen vorhanden vor unbekannt vor gemessen fehlend.
  const funktion = FUNKTIONS_RANG[a.funktionalitaet] - FUNKTIONS_RANG[b.funktionalitaet]
  if (funktion !== 0) return funktion
  // 3. Geld — mit `unbekannt` ganz hinten.
  const kosten = KOSTEN_RANG[a.kostenart] - KOSTEN_RANG[b.kostenart]
  if (kosten !== 0) return kosten
  const summeA = summe(a.preis)
  const summeB = summe(b.preis)
  if (summeA !== undefined && summeB !== undefined && summeA !== summeB) return summeA - summeB
  // 4. Und zuletzt: der Name. Nur für die Wiederholbarkeit.
  return byName(a.familie, b.familie) || byName(a.modell ?? '', b.modell ?? '')
}

// ---------------------------------------------------------------------------
// Das Rechnen
// ---------------------------------------------------------------------------

/**
 * Rechnet die bevorzugte Liste aus.
 *
 * @param optionen - Familien, Katalog, Anbieter, Tarife, gemessene Modelllisten
 * @returns die Rangliste samt Hinweisen
 */
export function baueRangliste(optionen: Rangoptionen): Rangliste {
  const jetzt = optionen.jetzt ?? new Date()
  const takt = optionen.takt ?? TAKT_TAG
  const tarife = optionen.tarife ?? []
  const anbieter = optionen.anbieter ?? []
  const faehigkeiten = optionen.faehigkeiten ?? FAEHIGKEITEN
  const hinweise: string[] = []
  const listen: Faehigkeitsliste[] = []

  if (optionen.katalog === undefined) {
    hinweise.push(
      'Es ist KEIN Katalog gereicht worden. Damit ist jede Fähigkeit `unbekannt` — die Liste ' +
        'behauptet nichts, was niemand gemessen hat. Ein Verwalterlauf füllt das.',
    )
  }
  if (anbieter.length === 0) {
    hinweise.push(
      'Es ist KEINE Umsetzung eingetragen. Jeder Eintrag steht damit als `nicht verdrahtet` — ' +
        'die Liste zeigt, was es gäbe, nicht was benutzbar ist.',
    )
  }

  for (const faehigkeit of faehigkeiten) {
    const eintraege: Ranglisteneintrag[] = []

    // **Zwei Arten von Kandidat, und beide müssen vorkommen.**
    //
    // 1. **Die Familien des Verzeichnisses** — der entfernte Fall. Über sie ist gemessen, welcher
    //    Weg antwortet.
    // 2. **Die Umsetzungen OHNE Verzeichniseintrag** — der **lokale** Fall. Ein lokaler Anbieter
    //    (`piper-local`, ein Whisper-Anbieter) steht in **keiner** `FAMILIEN`-Tabelle: er hat keine
    //    Basisadresse, keinen Schlüssel und keinen Modellweg. Bis hierher war er damit in der Liste
    //    **unsichtbar** — und eine Rangliste, die nur Dienste kennt, ist für „lokal und entfernt"
    //    die halbe Antwort.
    //
    // **Warum der lokale Fall nicht weggelassen wird, obwohl er ungemessen ist.** Sein Weg ist
    // nicht beim Anbieter gemessen worden, aber seine **Umsetzung existiert** — und genau das prüft
    // die Rangfolge zuerst. Er steht als `unbekannt` hinter jedem gemessenen, aber **vor** einem
    // gemessen *fehlenden* Weg. Eine Zeile mit dem Grund „nicht im Verzeichnis" ist ehrlicher als
    // sein Fehlen.
    for (const quelle of quellenFuer(faehigkeit, optionen, anbieter)) {
      const stand = funktionsstandAus(optionen.katalog, quelle.id, faehigkeit)
      // **Kein Eintrag ohne Anhaltspunkt.** Wer die Fähigkeit weder im Verzeichnis führt, noch als
      // vorhanden gemessen hat, noch eine Umsetzung besitzt, gehört nicht in eine Liste: er wäre
      // eine Zeile ohne Aussage.
      if (!quelle.kenntWeg && stand !== 'vorhanden' && !quelle.verdrahtet) continue

      const katalogeintrag = optionen.katalog?.eintraege[quelle.id]
      const gemessenAm = katalogeintrag?.geprueftAm
      const veraltet = katalogeintrag !== undefined && !istFrisch(katalogeintrag, jetzt, takt)

      // Die Kandidaten: erst die gemessene Liste, sonst die Tarife als Saat, sonst „ohne Modell".
      const gemessen = optionen.modelle?.[quelle.id]
      const kandidaten: { readonly modell?: string; readonly preis?: Preis }[] =
        gemessen !== undefined && gemessen.length > 0
          ? gemessen.map((eintrag) =>
              eintrag.preis === undefined ? { modell: eintrag.kennung } : { modell: eintrag.kennung, preis: eintrag.preis })
          : tarife
              .filter((eintrag) => eintrag.familie === quelle.id)
              .map((eintrag) => ({ modell: eintrag.modell }))

      if (kandidaten.length === 0) kandidaten.push({})

      for (const kandidat of kandidaten) {
        eintraege.push(
          baueEintrag({
            faehigkeit,
            quelle,
            ...(kandidat.modell === undefined ? {} : { modell: kandidat.modell }),
            ...(kandidat.preis === undefined ? {} : { gemessenerPreis: kandidat.preis }),
            stand,
            tarife,
            ...(gemessenAm === undefined ? {} : { gemessenAm }),
            veraltet,
          }),
        )
      }
    }

    eintraege.sort(vergleiche)
    const mitRang = eintraege.map((eintrag, index) => ({ ...eintrag, rang: index + 1 }))

    // **Die Empfehlung ist eine Auswahl, keine Behauptung.** Sie verlangt BEIDES: eine Umsetzung
    // und einen gemessenen Weg. Ein Vorschlag ohne Umsetzung wäre ein Vorschlag, der nicht läuft.
    const empfehlung = mitRang.find((eintrag) => eintrag.verdrahtet && eintrag.funktionalitaet === 'vorhanden')
    const liste: Faehigkeitsliste = {
      faehigkeit,
      name: NAME_DER_FAEHIGKEIT[faehigkeit],
      eintraege: mitRang,
      ...(empfehlung === undefined
        ? { ohneEmpfehlung: ohneEmpfehlungFuer(mitRang, anbieter.length > 0, optionen.katalog !== undefined) }
        : { empfehlung }),
    }
    listen.push(liste)

    if (mitRang.length === 0) {
      hinweise.push(
        `Für „${NAME_DER_FAEHIGKEIT[faehigkeit]}" gibt es KEINEN Eintrag: keine Familie führt diesen ` +
          'Weg, und keine hat ihn als vorhanden gemessen.',
      )
    }
  }

  return { erstelltAm: jetzt.toISOString(), listen, hinweise }
}

/** Warum eine Fähigkeit keine Empfehlung hat — mit dem **ersten** fehlenden Glied. */
function ohneEmpfehlungFuer(
  eintraege: readonly Ranglisteneintrag[],
  hatAnbieter: boolean,
  hatKatalog: boolean,
): string {
  if (eintraege.length === 0) return 'Es gibt keinen Eintrag für diese Fähigkeit.'
  const verdrahtet = eintraege.filter((eintrag) => eintrag.verdrahtet)
  if (verdrahtet.length === 0) {
    return hatAnbieter
      ? 'Kein Eintrag ist verdrahtet: es gibt keine Umsetzung, die diese Fähigkeit mit dieser Familie verbindet.'
      : 'Es ist keine Umsetzung eingetragen — deshalb kann nichts empfohlen werden.'
  }
  const gemessen = verdrahtet.filter((eintrag) => eintrag.funktionalitaet === 'vorhanden')
  if (gemessen.length === 0) {
    return hatKatalog
      ? 'Verdrahtet ja — aber kein Weg ist als vorhanden GEMESSEN. Die Liste empfiehlt nichts, was nur vermutet ist.'
      : 'Verdrahtet ja — aber es gibt keinen Katalog, also ist kein Weg gemessen.'
  }
  const fehlt = verdrahtet.filter((eintrag) => eintrag.funktionalitaet === 'vorhanden' && eintrag.kostenart !== 'unbekannt')
  if (fehlt.length === 0) {
    return 'Verdrahtet und gemessen vorhanden — aber für keinen Kandidaten ist ein Preis bekannt.'
  }
  return 'Kein Kandidat erfüllt alle Bedingungen.'
}

/**
 * Eine Quelle, aus der ein Kandidat stammt — **entweder** eine Familie des Verzeichnisses
 * **oder** eine Umsetzung, die dort nicht steht (der lokale Fall).
 *
 * **Warum beide in einem Typ.** Für die Rangfolge sind sie dasselbe: eine Kennung, ein Name, ein
 * gemessener Befund und die Frage, ob es eine Umsetzung gibt. Der Unterschied ist **ein Feld**
 * ({@link Quelle.imVerzeichnis}) — ihn in zwei getrennte Wege zu gießen hieße, die Ordnung zweimal
 * zu schreiben.
 */
interface Quelle {
  /** Die Kennung — bei einer Familie die der Familie, sonst die des Anbieters. */
  readonly id: string
  /** Der Name für die Anzeige. */
  readonly name: string
  /** Ob das Verzeichnis für diese Quelle einen Weg zu dieser Fähigkeit nennt. */
  readonly kenntWeg: boolean
  /** Ob es eine eingetragene Umsetzung gibt, die diese Fähigkeit nennt. */
  readonly verdrahtet: boolean
  /** Ob die Quelle im Verzeichnis steht. */
  readonly imVerzeichnis: boolean
}

/**
 * Sammelt die Quellen für **eine** Fähigkeit.
 *
 * Die Reihenfolge ist ohne Bedeutung — sortiert wird später über {@link vergleiche}.
 *
 * @param faehigkeit - die Fähigkeit
 * @param optionen - die gereichten Quellen
 * @param anbieter - die eingetragenen Umsetzungen
 * @returns die Quellen
 */
function quellenFuer(
  faehigkeit: Faehigkeit,
  optionen: Rangoptionen,
  anbieter: readonly Anbieter[],
): readonly Quelle[] {
  const quellen: Quelle[] = []
  const verdrahtet = (id: string): boolean =>
    anbieter.some((eintrag) => eintrag.id === id && eintrag.faehigkeiten.includes(faehigkeit))

  for (const familie of optionen.familien) {
    quellen.push({
      id: familie.id,
      name: familie.name,
      kenntWeg: familie.wege[faehigkeit] !== undefined,
      verdrahtet: verdrahtet(familie.id),
      imVerzeichnis: true,
    })
  }

  // **Der lokale Fall.** Eine Umsetzung ohne Verzeichniseintrag — sie hat keine Basisadresse und
  // keinen Modellweg, also steht sie in keiner `FAMILIEN`-Tabelle. Ihr Fehlen wäre der Fehler.
  for (const eintrag of anbieter) {
    if (!eintrag.faehigkeiten.includes(faehigkeit)) continue
    if (quellen.some((vorhanden) => vorhanden.id === eintrag.id)) continue
    quellen.push({
      id: eintrag.id,
      name: eintrag.name,
      kenntWeg: false,
      verdrahtet: true,
      imVerzeichnis: false,
    })
  }

  return quellen
}

/** Was {@link baueEintrag} braucht. */
interface Eintragsoptionen {
  readonly faehigkeit: Faehigkeit
  readonly quelle: Quelle
  readonly modell?: string
  readonly gemessenerPreis?: Preis
  readonly stand: Funktionsstand
  readonly tarife: readonly Tarifeintrag[]
  readonly gemessenAm?: string
  readonly veraltet: boolean
}

/**
 * Baut **einen** Eintrag samt Begründung.
 *
 * **Die Messung schlägt die Tabelle** — dieselbe Regel wie in `verschmelze`, hier auf den einzelnen
 * Kandidaten angewandt: nennt die Models-API einen Preis, gilt er; sonst der eingetragene.
 */
function baueEintrag(optionen: Eintragsoptionen): Ranglisteneintrag {
  const { quelle, modell } = optionen
  const tarif = modell === undefined ? undefined : tarifFuer(optionen.tarife, quelle.id, modell)

  const preis = optionen.gemessenerPreis ?? tarif?.preis ?? PREIS_UNBEKANNT
  const ersatz: Tarifeintrag = tarif ?? {
    familie: quelle.id,
    modell: modell ?? '',
    preis: PREIS_UNBEKANNT,
    stand: optionen.gemessenAm ?? '',
    quelle: 'gemessen',
    herkunft: 'gemessen',
  }
  const wirksam: Tarifeintrag =
    optionen.gemessenerPreis === undefined ? ersatz : { ...ersatz, preis: optionen.gemessenerPreis, herkunft: 'gemessen' }
  const kostenart = kostenartFuer(wirksam)

  const gruende: string[] = []
  gruende.push(
    quelle.verdrahtet
      ? `Verdrahtet: der Anbieter „${quelle.id}" nennt diese Fähigkeit selbst.`
      : `NICHT verdrahtet: es gibt keine Umsetzung „${quelle.id}", die diese Fähigkeit nennt.`,
  )
  gruende.push(
    optionen.stand === 'vorhanden'
      ? `Weg gemessen vorhanden${optionen.gemessenAm === undefined ? '' : ` (${optionen.gemessenAm})`}.`
      : optionen.stand === 'fehlt'
        ? `Weg gemessen FEHLEND (404)${optionen.gemessenAm === undefined ? '' : ` (${optionen.gemessenAm})`}.`
        : 'Weg NICHT gemessen — kein Befund, also kein Beleg.',
  )
  if (!quelle.imVerzeichnis) {
    // **Der Grund gehört in die Zeile.** Ein lokaler Anbieter ist nicht „schlechter gemessen" — er
    // ist **gar nicht** im Verzeichnis, weil er keine Adresse hat. Wer das später liest, soll den
    // Unterschied sehen und nicht rätseln, warum hier kein Befund steht.
    gruende.push(
      'NICHT im Verzeichnis: für diese Kennung nennt keine Familie einen Weg. Das ist der ' +
        'normale Fall eines LOKALEN Anbieters — er hat keine Basisadresse und keinen Schlüssel.',
    )
  }
  if (modell === undefined) {
    gruende.push('Kein Modell bekannt: die Models-API hat keines genannt und die Tabelle trägt keines ein.')
  }
  if (kostenart === 'unbekannt') {
    gruende.push(
      'KEIN Preis bekannt. Das ist nicht günstig — es heißt nur, daß niemand nachgesehen hat. ' +
        'Deshalb steht der Eintrag hinter jedem bezifferten.',
    )
  } else if (optionen.gemessenerPreis !== undefined) {
    gruende.push(`Preis GEMESSEN: ${alsText(preis)} USD je 1 Mio Token — die Messung schlägt die Tabelle.`)
  } else if (tarif !== undefined) {
    gruende.push(`Preis aus der Tabelle (Stand ${tarif.stand}): ${alsText(preis)} USD je 1 Mio Token.`)
  }
  if (wirksam.freibetrag !== undefined) {
    gruende.push(
      `Freibetrag: ${String(wirksam.freibetrag.menge)} ${wirksam.freibetrag.einheit} — Beleg: ${wirksam.freibetrag.beleg}.`,
    )
  }
  if (optionen.veraltet) {
    gruende.push('Die Messung ist ÄLTER als die Frist — sie kann überholt sein.')
  }

  return {
    rang: 0,
    faehigkeit: optionen.faehigkeit,
    familie: quelle.id,
    familienname: quelle.name,
    ...(modell === undefined ? {} : { modell }),
    verdrahtet: quelle.verdrahtet,
    imVerzeichnis: quelle.imVerzeichnis,
    funktionalitaet: optionen.stand,
    kostenart,
    preis,
    ...(optionen.gemessenAm === undefined ? {} : { gemessenAm: optionen.gemessenAm }),
    veraltet: optionen.veraltet,
    ...(wirksam.freibetrag === undefined ? {} : { freibetrag: wirksam.freibetrag }),
    gruende,
  }
}

// ---------------------------------------------------------------------------
// Die Liste als Text
// ---------------------------------------------------------------------------

/** Wie viele Gründe eine Zeile zeigt, wenn nicht ausdrücklich mehr verlangt werden. */
export const GRUENDE_KURZ = 3

/**
 * Schreibt die Rangliste für Menschen.
 *
 * **Warum der Text hier steht und nicht in der Oberfläche.** Es gibt heute **zwei** Verbraucher
 * ohne gemeinsame Anzeige: ein Terminal und die Welt unter `/universe/`. Beide sollen dieselbe
 * Reihenfolge und dieselben Worte sehen; eine zweite Formatierung wäre eine zweite Wahrheit.
 *
 * @param rangliste - die Rangliste
 * @param optionen - wie ausführlich
 * @returns der Text, mit Zeilenumbruch am Ende
 */
export function alsListe(
  rangliste: Rangliste,
  optionen: { readonly gruende?: number; readonly nurBrauchbare?: boolean } = {},
): string {
  const zeilen: string[] = []
  const grenze = optionen.gruende ?? GRUENDE_KURZ

  for (const liste of rangliste.listen) {
    zeilen.push(`${liste.name} (${liste.faehigkeit})`)
    const sichtbar = optionen.nurBrauchbare === true
      ? liste.eintraege.filter((eintrag) => eintrag.verdrahtet && eintrag.funktionalitaet === 'vorhanden')
      : liste.eintraege

    if (sichtbar.length === 0) {
      zeilen.push('  — kein Eintrag')
    }
    for (const eintrag of sichtbar) {
      const modell = eintrag.modell ?? '(kein Modell genannt)'
      const merker =
        (eintrag.verdrahtet ? '' : ' [nicht verdrahtet]') +
        (eintrag.imVerzeichnis ? '' : ' [ohne Verzeichnis — lokal]')
      zeilen.push(
        `  ${String(eintrag.rang).padStart(2)}. ${eintrag.familienname} · ${modell} — ` +
          `${eintrag.kostenart}, ${alsText(eintrag.preis)}${merker}`,
      )
      for (const grund of eintrag.gruende.slice(0, grenze)) zeilen.push(`      · ${grund}`)
    }

    zeilen.push(
      liste.empfehlung === undefined
        ? `  Bevorzugt: KEINE — ${liste.ohneEmpfehlung ?? 'kein Kandidat erfüllt die Bedingungen'}`
        : `  Bevorzugt: ${liste.empfehlung.familienname}` +
            `${liste.empfehlung.modell === undefined ? '' : ` · ${liste.empfehlung.modell}`} ` +
            `(${liste.empfehlung.kostenart}, ${alsText(liste.empfehlung.preis)})`,
    )
    zeilen.push('')
  }

  for (const hinweis of rangliste.hinweise) zeilen.push(`! ${hinweis}`)
  return `${zeilen.join('\n').trimEnd()}\n`
}

/**
 * Zählt, was die Liste belegt — für eine Anzeige, die eine Zahl braucht.
 *
 * @param rangliste - die Rangliste
 * @returns die Zahlen, getrennt nach Beleg
 */
export function zaehle(rangliste: Rangliste): {
  readonly eintraege: number
  readonly verdrahtet: number
  readonly gemessen: number
  readonly kostenlos: number
  readonly ohnePreis: number
  /** Wie viele Einträge zu einer Umsetzung OHNE Verzeichniseintrag gehören — der lokale Anteil. */
  readonly ohneVerzeichnis: number
} {
  const alle = rangliste.listen.flatMap((liste) => liste.eintraege)
  return {
    eintraege: alle.length,
    verdrahtet: alle.filter((eintrag) => eintrag.verdrahtet).length,
    gemessen: alle.filter((eintrag) => eintrag.funktionalitaet === 'vorhanden').length,
    kostenlos: alle.filter((eintrag) => eintrag.kostenart === 'kostenlos').length,
    ohnePreis: alle.filter((eintrag) => !preisBekannt(eintrag.preis)).length,
    ohneVerzeichnis: alle.filter((eintrag) => !eintrag.imVerzeichnis).length,
  }
}
