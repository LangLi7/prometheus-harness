/**
 * Der Stand aus der Verbrauchsdatei — Rechnung ohne Host, ohne Netz, ohne Schlüssel.
 *
 * ## Warum dieses Paket eine fremde Datei liest
 *
 * Der Betreiber kennt „Usage" aus dem alten Harness: *„dort zeigt es an wie viel budget nutzung
 * ect"* (21.10.2026). Dessen Datei `$DSH_HOME/usage-budget/usage.json` trägt zwei Dinge, die
 * unsere eigenen Pakete nicht haben:
 *
 * | Feld | Was es sagt |
 * |---|---|
 * | `balances` | Guthaben **und Monatslimit** je Schlüsselname — ohne einen Schlüssel zu benutzen |
 * | `records` | abgerechnete Aufrufe mit `cost` (19 287 am 21.10.2026) |
 *
 * Damit ist sie die einzige Quelle im Haus, die „wieviel ist noch übrig" **und** „was hat der
 * Monat gekostet" beantworten kann, ohne ins Netz zu gehen.
 *
 * ## Warum hier nur gelesen wird
 *
 * Die Datei gehört dem alten Harness. Zwei Schreiber auf einer Datei sind ein Wettlauf, den keiner
 * gewinnt — und eine Anzeige, die ihre Quelle verändert, ist keine Anzeige mehr.
 *
 * ## Warum „unbepreist" eine eigene Zahl ist
 *
 * Ein Datensatz ohne `cost` hat Geld gekostet, das niemand kennt. Er zählt bei `anfragen` mit und
 * **nicht** bei `usd`; jede Summe nennt deshalb zusätzlich, wie viele Datensätze unbepreist waren.
 * Wer sie als 0 führt, meldet einen Verbrauch von null für Arbeit, die Geld gekostet hat.
 *
 * ## Warum die Tage lokal gerechnet werden
 *
 * „Heute" ist der Kalendertag des Betrachters, nicht ein UTC-Fenster. Die Grenzen entstehen
 * deshalb über `new Date(jahr, monat, tag - n)` und nicht über `- n * 86_400_000`: bei einer
 * Zeitumstellung wäre das zweite Verfahren um eine Stunde daneben.
 *
 * @module @prometheus-harness/usage/stand
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/** Wie viele Tage die Tagesreihe zeigt. */
export const VERLAUF_TAGE = 30

/** Wie viele Modelle die Rangliste zeigt. */
export const ANZEIGE_MODELLE = 8

/** Ein Guthaben, wie der alte Harness es abgelegt hat. */
export interface Saldo {
  /** Der **Name** der Credential-Ref (`OPENROUTER_API_KEY`) — nie der Schlüsselwert. */
  readonly schluessel: string
  /**
   * Woher der Wert kommt.
   *
   * **`datei` ist keine Nebensache.** Die `balances` der Verbrauchsdatei sind ein
   * Zwischenspeicher des alten Harness — auf dieser Maschine drei Tage alt. Ein Guthaben ohne
   * dieses Wort sieht aus wie eine Auskunft, ist aber eine Erinnerung.
   */
  readonly quelle?: 'live' | 'datei'
  /** Das Guthaben in USD, wenn der Anbieter eins nennt. */
  readonly guthabenUsd?: number
  /** Die Währung, wie sie dastand. */
  readonly waehrung?: string
  /** Die Erklärung des Anbieters („40.49 eingezahlt − 20.72 verbraucht"). */
  readonly detail?: string
  /**
   * Was **je** auf das Konto eingezahlt wurde — nicht der Saldo, sondern seine Herkunft.
   *
   * `total_credits` bei OpenRouter: kumuliert über alle Aufladungen, sinkt nie. Ohne eigenen Namen
   * stand die Zahl nur im `detail`-Text und wurde dort als Geschenk gelesen.
   */
  readonly eingezahltUsd?: number
  /** Was seit Kontoeröffnung verbraucht wurde (OpenRouter: `total_usage`). */
  readonly verbrauchtGesamtUsd?: number
  /** Das Limit des Schlüssels, wenn gesetzt. */
  readonly limitUsd?: number
  /** Was vom Limit übrig ist. */
  readonly limitRestUsd?: number
  /**
   * Worauf sich das Limit bezieht (`daily`, `weekly`, `monthly`), wenn der Anbieter es sagt.
   *
   * Das Limit gehört dem **Schlüssel**, nicht dem Konto; ohne den Zeitraum sieht eine Zahl neben
   * dem Guthaben wie ein zweites, widersprüchliches Budget aus.
   */
  readonly limitZeitraum?: string
  /** Was im laufenden Zeitraum abgerechnet wurde. */
  readonly verbrauchtUsd?: number
  /** Wann der Anbieter das Guthaben genannt hat (ISO 8601). */
  readonly stand?: string
  /**
   * Ob der Schlüssel **geteilt** ist.
   *
   * Das Guthaben gehört dann mehreren; wer das Panel liest, muß wissen, daß die Zahl über ihm nicht
   * seine ist. Die Markierung kommt **nur** aus `PMH_GETEILT` — nicht aus fremden Kennungen in der
   * Datei.
   */
  readonly geteilt?: boolean
  /**
   * Was **dieser Rechner** in den letzten 30 Tagen über den Schlüssel verbraucht hat.
   *
   * **Warum 30 Tage.** Ein Guthaben ist ein Stand von jetzt; eine Summe „seit Beginn" daneben ist
   * ein Vergleich zweier Zeiträume, der wie ein Rechenfehler aussieht. Genau das war am 21.10.2026
   * der Fall: „davon hier 111,01 USD" (alles) neben 113,17 USD (30 Tage) im Anbieter-Dashboard.
   */
  readonly hier30Usd?: number
  /** Warum kein Guthaben vorliegt — **nie** stillschweigend. */
  readonly fehler?: string
  /**
   * Was der Abruf **technisch** gesagt hat (`getaddrinfo ENOTFOUND openrouter.ai`).
   *
   * **Warum getrennt von `fehler`.** `fehler` steht als Zeile im Panel und muß ein Satz sein, den
   * man lesen kann. Die Rohmeldung ist die Auskunft für den, der nachsehen will — sie gehört in den
   * Tooltip, nicht in die Zeile. Am 28.10.2026 stand sie in der Zeile, und das Panel las sich wie
   * ein Absturz.
   */
  readonly fehlerTechnisch?: string
}

/** Eine Summe über einen Zeitraum. */
export interface Fenster {
  /** Die bekannten Kosten in USD. */
  readonly usd: number
  /** Die Aufrufe. */
  readonly anfragen: number
  /** Wie viele Datensätze **keinen** bekannten Preis hatten. */
  readonly unbepreist: number
}

/** Ein Tag der Tagesreihe. */
export interface Tagesposten {
  /** Der Tag (`2026-10-21`). */
  readonly tag: string
  /** Die bekannten Kosten des Tages. */
  readonly usd: number
  /** Die Aufrufe des Tages. */
  readonly anfragen: number
}

/** Ein Modell der Rangliste. */
export interface Modellposten {
  /** Die Modellkennung, wie der Anbieter sie nennt. */
  readonly modell: string
  /** Die Familie der Route (`deepseek-official`, `openrouter`). */
  readonly familie: string
  /** Die bekannten Kosten. */
  readonly usd: number
  /** Die Aufrufe. */
  readonly anfragen: number
}

/** Der ganze Stand — das, was das Panel zeigt. */
export interface Stand {
  /** Die gelesene Datei; `null` heißt: keine gefunden. */
  readonly datei: string | null
  /** Wann gelesen wurde (ISO 8601). */
  readonly gelesenAm: string
  /** Wann die Guthaben abgefragt wurden (ISO 8601), wenn die Datei es sagt. */
  readonly saldenStand: string | null
  /** Die Guthaben je Schlüssel. */
  readonly salden: readonly Saldo[]
  /** Die Summen über vier Zeiträume. */
  readonly fenster: {
    readonly tag: Fenster
    readonly woche: Fenster
    readonly monat: Fenster
    readonly gesamt: Fenster
  }
  /** Die Tagesreihe der letzten 30 Tage, aufsteigend und lückenlos. */
  readonly jeTag: readonly Tagesposten[]
  /** Die teuersten Modelle. */
  readonly jeModell: readonly Modellposten[]
  /**
   * Der Verbrauch je Schlüssel — **die geteilte Rechnung**.
   *
   * Bei einem Team-Schlüssel ist das Guthaben gemeinsam, der Verbrauch aber je Rechner (und je
   * Eigner, wenn die Datei `REF:eigner` bucht) getrennt. Die Summe über die Rechner ist die
   * Team-Summe; dieser Eintrag ist der Anteil **dieses** Rechners.
   */
  readonly jeSchluessel: readonly Schluesselposten[]
  /**
   * Wie viele Buchungen eine **fremde** Eigner-Kennung trugen (`REF:name`) und deshalb nicht
   * mitgezählt wurden.
   *
   * Auf dieser Maschine waren es 37 Buchungen über 0,23 USD aus *openalice/finance* — ein anderes
   * Werkzeug, das dieselbe Datei benutzt. Sie in eine PMH/DSH-Abrechnung zu rechnen wäre falsch;
   * sie zu verschweigen auch.
   */
  readonly fremd: number
  /** Warum der Stand unvollständig ist — in Worten. */
  readonly hinweis?: string
}

/** Der Verbrauch eines Schlüssels. */
export interface Schluesselposten {
  /** Der Schlüsselname (`DEEPSEEK_API_KEY`). */
  readonly schluessel: string
  /** Was **insgesamt** über diesen Schlüssel abgerechnet wurde. */
  readonly usd: number
  /**
   * Was in den **letzten 30 Tagen** abgerechnet wurde.
   *
   * **Warum die zweite Zahl.** Ein Guthaben ist ein Stand von *jetzt*; daneben eine Summe „seit
   * Beginn" zu stellen ist ein Vergleich zweier Zeiträume, der wie ein Fehler aussieht. Am
   * 21.10.2026 stand im Panel „davon hier 111,01 USD", während das Anbieter-Dashboard für 30 Tage
   * 113,17 USD zeigte — die Zahl war nicht falsch, nur der Zeitraum fehlte.
   */
  readonly usd30: number
  /** Die Aufrufe. */
  readonly anfragen: number
  /** Wie viele davon ohne Preis waren. */
  readonly unbepreist: number
}

/** Wie der Stand gebaut wird. */
export interface Standoptionen {
  /** Der gelesene Pfad oder `null`. */
  readonly datei: string | null
  /** Die Uhr; im Test setzbar. */
  readonly jetzt: Date
  /** Ein Hinweis, den der Aufrufer schon weiß (fehlende oder kaputte Datei). */
  readonly hinweis?: string
}

/** Ein Datensatz, so wie ihn die Rechnung braucht. */
interface Datensatz {
  readonly zeit: number
  readonly usd: number | undefined
  readonly anfragen: number
  readonly familie: string
  readonly modell: string
  /** Der Schlüssel, unter dem abgerechnet wurde (`OPENROUTER_API_KEY`). */
  readonly schluessel: string
}

/**
 * Die Orte, an denen die Verbrauchsdatei liegen kann — in der Reihenfolge, in der gesucht wird.
 *
 * **Warum eine Liste.** Die Datei gehört dem alten Harness (`~/.dsh`); dieser Host hat sein eigenes
 * `DSH_HOME` (`.pmh-build/harness-home`). Welche der beiden existiert, ist eine Eigenschaft des
 * Rechners, nicht des Plugins — also wird gesucht statt geraten.
 *
 * **Warum `PMH_USAGE_DATEI` die Suche beendet.** Ein ausdrücklich genannter Pfad ist eine
 * Behauptung darüber, wo die Wahrheit liegt. Fiele die Suche bei einem Tippfehler still auf eine
 * andere Datei zurück, zeigte die Anzeige Zahlen, die niemand bestellt hat — unter einem Pfad, den
 * niemand genannt hat. Ist der Pfad gesetzt, ist er der einzige Kandidat.
 *
 * @param umgebung - die Umgebung (im Test setzbar)
 * @param heim - das Heimatverzeichnis (im Test setzbar)
 * @returns die Kandidaten, ohne Doppelte, in Suchreihenfolge
 */
export function kandidaten(
  umgebung: Readonly<Record<string, string | undefined>> = process.env,
  heim: string = homedir(),
): string[] {
  const ausdruecklich = umgebung['PMH_USAGE_DATEI']
  if (ausdruecklich !== undefined && ausdruecklich.trim() !== '') return [ausdruecklich]
  const aus = [
    umgebung['DSH_HOME'] === undefined
      ? undefined
      : join(umgebung['DSH_HOME'], 'usage-budget', 'usage.json'),
    join(heim, '.dsh', 'usage-budget', 'usage.json'),
  ]
  const gesehen = new Set<string>()
  const liste: string[] = []
  for (const pfad of aus) {
    if (pfad === undefined || pfad.trim() === '') continue
    if (gesehen.has(pfad)) continue
    gesehen.add(pfad)
    liste.push(pfad)
  }
  return liste
}

/**
 * Liest die Datensätze aus dem Rohbestand.
 *
 * **Was verworfen wird.** Ein Eintrag ohne brauchbare `time` ist kein Verbrauch; er stillschweigend
 * zu übernehmen verfälschte die Summe. Verworfen wird deshalb — und zwar ohne Zahl, weil die
 * Anzeige die Verluste der Quelle nicht kennt.
 *
 * @param roh - der gelesene Rohbestand
 * @returns die brauchbaren Datensätze (nach Zeit) und die Zahl der **fremden** Buchungen
 */
function liesDatensaetze(roh: unknown): { datensaetze: Datensatz[]; fremd: number } {
  if (typeof roh !== 'object' || roh === null) return { datensaetze: [], fremd: 0 }
  const liste = (roh as { records?: unknown }).records
  if (!Array.isArray(liste)) return { datensaetze: [], fremd: 0 }
  const aus: Datensatz[] = []
  let fremd = 0
  for (const eintrag of liste) {
    if (typeof eintrag !== 'object' || eintrag === null) continue
    const feld = eintrag as Record<string, unknown>
    const zeit = feld['time']
    if (typeof zeit !== 'number' || !Number.isFinite(zeit)) continue
    const kosten = feld['cost']
    const usd = typeof kosten === 'number' && Number.isFinite(kosten) ? kosten : undefined
    const rohAnfragen = feld['requests']
    const anfragen =
      typeof rohAnfragen === 'number' && Number.isFinite(rohAnfragen) && rohAnfragen > 0 ? rohAnfragen : 1
    const familie = typeof feld['provider'] === 'string' ? feld['provider'] : '—'
    const modell = typeof feld['model'] === 'string' ? feld['model'] : '—'
    const schluessel = typeof feld['keyRef'] === 'string' && feld['keyRef'].trim() !== '' ? feld['keyRef'] : '—'
    // **Fremde Eigner-Kennungen fliegen raus.** `DEEPSEEK_API_KEY:openalice` stammt aus einem
    // anderen Werkzeug (openalice/finance) und gehört nicht in eine PMH/DSH-Abrechnung. Sie werden
    // gezählt, nicht stillschweigend verschluckt.
    if (schluessel.includes(':')) {
      fremd += 1
      continue
    }
    aus.push({ zeit, usd, anfragen, familie, modell, schluessel })
  }
  aus.sort((a, b) => a.zeit - b.zeit)
  return { datensaetze: aus, fremd }
}

/** Liest eine endliche Zahl aus einem Feld — oder `undefined`. */
function zahl(feld: Record<string, unknown>, name: string): number | undefined {
  const wert = feld[name]
  return typeof wert === 'number' && Number.isFinite(wert) ? wert : undefined
}

/** Liest einen nicht-leeren Text aus einem Feld — oder `undefined`. */
function text(feld: Record<string, unknown>, name: string): string | undefined {
  const wert = feld[name]
  return typeof wert === 'string' && wert.trim() !== '' ? wert : undefined
}

/**
 * Liest die Guthaben.
 *
 * **Was fehlt, fehlt.** Ein Anbieter ohne Guthaben-API schreibt `error`; ein Anbieter ohne Limit
 * schreibt kein `limitUsd`. Beides wird nicht zu 0 — sonst sähe ein unbekannter Saldo aus wie ein
 * leerer.
 *
 * @param roh - der gelesene Rohbestand
 * @returns die Salden, die mit Limit zuerst, Fehler zuletzt
 */
function liesSalden(roh: unknown): Saldo[] {
  if (typeof roh !== 'object' || roh === null) return []
  const bestand = (roh as { balances?: unknown }).balances
  if (typeof bestand !== 'object' || bestand === null || Array.isArray(bestand)) return []
  const aus: Saldo[] = []
  for (const [schluessel, wert] of Object.entries(bestand as Record<string, unknown>)) {
    if (typeof wert !== 'object' || wert === null) continue
    const feld = wert as Record<string, unknown>
    const guthabenUsd = zahl(feld, 'balanceUsd')
    const waehrung = text(feld, 'currency')
    const detail = text(feld, 'detail')
    const limitUsd = zahl(feld, 'limitUsd')
    const limitRestUsd = zahl(feld, 'limitRemainingUsd')
    const verbrauchtUsd = zahl(feld, 'usageUsd')
    const limitZeitraum = text(feld, 'limitReset')
    const at = zahl(feld, 'at')
    const fehler = text(feld, 'error')
    aus.push({
      schluessel,
      // Aus der Datei — der Aufrufer ersetzt das durch `live`, wenn der Anbieter antwortet.
      quelle: 'datei',
      ...(guthabenUsd === undefined ? {} : { guthabenUsd }),
      ...(waehrung === undefined ? {} : { waehrung }),
      ...(detail === undefined ? {} : { detail }),
      ...(limitUsd === undefined ? {} : { limitUsd }),
      ...(limitRestUsd === undefined ? {} : { limitRestUsd }),
      ...(verbrauchtUsd === undefined ? {} : { verbrauchtUsd }),
      ...(limitZeitraum === undefined ? {} : { limitZeitraum: limitZeitraum.toLowerCase() }),
      ...(at === undefined ? {} : { stand: new Date(at).toISOString() }),
      ...(fehler === undefined ? {} : { fehler }),
    })
  }
  const rang = (saldo: Saldo): number => {
    if (saldo.fehler !== undefined) return 3
    if (saldo.limitUsd !== undefined) return 0
    if (saldo.guthabenUsd !== undefined) return 1
    return 2
  }
  aus.sort((a, b) => rang(a) - rang(b) || (b.guthabenUsd ?? -1) - (a.guthabenUsd ?? -1))
  return aus
}

/**
 * Der Tagesschlüssel eines Zeitpunkts, in Ortszeit.
 *
 * @param zeit - der Zeitpunkt in Millisekunden
 * @returns `2026-10-21`
 */
function tagesschluessel(zeit: number): string {
  const datum = new Date(zeit)
  const monat = String(datum.getMonth() + 1).padStart(2, '0')
  const tag = String(datum.getDate()).padStart(2, '0')
  return `${String(datum.getFullYear())}-${monat}-${tag}`
}

/**
 * Der Beginn eines Kalendertages, `tage` vor dem heutigen.
 *
 * @param jetzt - der Bezugspunkt
 * @param tage - wie viele Tage zurück (0 = heute)
 * @returns der Zeitpunkt in Millisekunden
 */
function tagesbeginn(jetzt: Date, tage: number): number {
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - tage).getTime()
}

/**
 * Summiert eine Auswahl.
 *
 * @param datensaetze - die Datensätze
 * @returns Kosten, Aufrufe und die Zahl der unbepreisten Datensätze
 */
function summiere(datensaetze: readonly Datensatz[]): Fenster {
  let usd = 0
  let anfragen = 0
  let unbepreist = 0
  for (const datensatz of datensaetze) {
    if (datensatz.usd === undefined) unbepreist += 1
    else usd += datensatz.usd
    anfragen += datensatz.anfragen
  }
  return { usd, anfragen, unbepreist }
}

/**
 * Baut die Tagesreihe.
 *
 * **Warum lückenlos.** Ein Tag ohne Aufruf ist eine Aussage („nichts ausgegeben"), und in einer
 * Reihe mit Löchern wäre er nicht zu sehen. Deshalb werden alle 30 Tage erzeugt und die fehlenden
 * mit 0 gefüllt.
 *
 * @param datensaetze - die Datensätze
 * @param jetzt - der Bezugspunkt
 * @returns die Reihe, aufsteigend, endend bei heute
 */
function tagesreihe(datensaetze: readonly Datensatz[], jetzt: Date): Tagesposten[] {
  const nach = new Map<string, { usd: number; anfragen: number }>()
  for (const datensatz of datensaetze) {
    const schluessel = tagesschluessel(datensatz.zeit)
    const posten = nach.get(schluessel) ?? { usd: 0, anfragen: 0 }
    if (datensatz.usd !== undefined) posten.usd += datensatz.usd
    posten.anfragen += datensatz.anfragen
    nach.set(schluessel, posten)
  }
  const reihe: Tagesposten[] = []
  for (let zurueck = VERLAUF_TAGE - 1; zurueck >= 0; zurueck -= 1) {
    const tag = tagesbeginn(jetzt, zurueck)
    const posten = nach.get(tagesschluessel(tag))
    reihe.push({ tag: tagesschluessel(tag), usd: posten?.usd ?? 0, anfragen: posten?.anfragen ?? 0 })
  }
  return reihe
}

/**
 * Baut die Rangliste der Modelle.
 *
 * @param datensaetze - die Datensätze
 * @returns die teuersten Modelle, absteigend nach Kosten
 */
function modellreihe(datensaetze: readonly Datensatz[]): Modellposten[] {
  const nach = new Map<string, { usd: number; anfragen: number; familie: string; modell: string }>()
  for (const datensatz of datensaetze) {
    const kennung = `${datensatz.familie}/${datensatz.modell}`
    const posten = nach.get(kennung) ?? {
      usd: 0,
      anfragen: 0,
      familie: datensatz.familie,
      modell: datensatz.modell,
    }
    if (datensatz.usd !== undefined) posten.usd += datensatz.usd
    posten.anfragen += datensatz.anfragen
    nach.set(kennung, posten)
  }
  return [...nach.values()]
    .sort((a, b) => b.usd - a.usd || b.anfragen - a.anfragen)
    .slice(0, ANZEIGE_MODELLE)
    .map((posten) => ({
      modell: posten.modell,
      familie: posten.familie,
      usd: posten.usd,
      anfragen: posten.anfragen,
    }))
}

/**
 * Baut den Verbrauch je Schlüssel — insgesamt und für die letzten 30 Tage.
 *
 * **Warum zwei Zeiträume.** Die Kacheln zeigen schon Heute/Woche/Monat/Gesamt; ein Schlüssel mit
 * einer Summe „seit Beginn" neben einem Guthaben „jetzt" wäre die einzige Stelle, an der zwei
 * Zeiträume unbemerkt nebeneinanderstehen. Deshalb trägt jeder Posten beide Zahlen, und die
 * Anzeige nimmt die, die zum Vergleich paßt.
 *
 * @param datensaetze - die Datensätze
 * @param abMonat - Beginn des 30-Tage-Fensters (Millisekunden)
 * @returns je Schlüssel die Summen, absteigend nach Gesamtkosten
 */
function schluesselreihe(datensaetze: readonly Datensatz[], abMonat: number): Schluesselposten[] {
  const nach = new Map<string, { usd: number; usd30: number; anfragen: number; unbepreist: number }>()
  for (const datensatz of datensaetze) {
    const posten = nach.get(datensatz.schluessel) ?? { usd: 0, usd30: 0, anfragen: 0, unbepreist: 0 }
    if (datensatz.usd === undefined) posten.unbepreist += 1
    else {
      posten.usd += datensatz.usd
      if (datensatz.zeit >= abMonat) posten.usd30 += datensatz.usd
    }
    posten.anfragen += datensatz.anfragen
    nach.set(datensatz.schluessel, posten)
  }
  return [...nach.entries()]
    .sort((a, b) => b[1].usd - a[1].usd || b[1].anfragen - a[1].anfragen)
    .map(([schluessel, posten]) => ({
      schluessel,
      usd: posten.usd,
      usd30: posten.usd30,
      anfragen: posten.anfragen,
      unbepreist: posten.unbepreist,
    }))
}

/**
 * Rechnet den ganzen Stand aus.
 *
 * @param roh - der gelesene Rohbestand (darf `undefined` sein)
 * @param optionen - Pfad, Uhr und ein etwaiger Hinweis
 * @returns der Stand; bei fehlender Datei sind alle Summen 0 und `datei` ist `null`
 */
export function liesStand(roh: unknown, optionen: Standoptionen): Stand {
  const gelesen = liesDatensaetze(roh)
  const datensaetze = gelesen.datensaetze
  const salden = liesSalden(roh)
  const jetzt = optionen.jetzt
  const abTag = tagesbeginn(jetzt, 0)
  const abWoche = tagesbeginn(jetzt, 6)
  const abMonat = tagesbeginn(jetzt, VERLAUF_TAGE - 1)
  const saldenStand =
    typeof roh === 'object' && roh !== null
      ? (() => {
          const wert = (roh as { balanceFetchedAt?: unknown }).balanceFetchedAt
          return typeof wert === 'number' && Number.isFinite(wert) ? new Date(wert).toISOString() : null
        })()
      : null
  return {
    datei: optionen.datei,
    gelesenAm: jetzt.toISOString(),
    saldenStand,
    salden,
    fenster: {
      tag: summiere(datensaetze.filter((d) => d.zeit >= abTag)),
      woche: summiere(datensaetze.filter((d) => d.zeit >= abWoche)),
      monat: summiere(datensaetze.filter((d) => d.zeit >= abMonat)),
      gesamt: summiere(datensaetze),
    },
    jeTag: tagesreihe(datensaetze, jetzt),
    jeModell: modellreihe(datensaetze),
    jeSchluessel: schluesselreihe(datensaetze, abMonat),
    fremd: gelesen.fremd,
    ...(optionen.hinweis === undefined ? {} : { hinweis: optionen.hinweis }),
  }
}
