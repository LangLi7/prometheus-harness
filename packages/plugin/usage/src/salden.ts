/**
 * Lebende Salden — was der Anbieter **jetzt** sagt, nicht was die Datei zuletzt sah.
 *
 * ## Warum das nötig wurde
 *
 * Der Betreiber am 21.10.2026: *„beim budget stimmt es nicht mehr, openrouter ist unter 20 dollar,
 * so rund 19.77"*. Er hatte recht, und die Ursache war nicht die Rechnung, sondern das **Alter**:
 * die `balances` in der Verbrauchsdatei sind ein Zwischenspeicher des alten Harness — auf dieser
 * Maschine vom 18.10., drei Tage alt. Ein Guthaben, das drei Tage alt ist, ist keine Auskunft mehr.
 *
 * | Schlüssel | Quelle | Antwort |
 * |---|---|---|
 * | `OPENROUTER_API_KEY` | `GET /api/v1/credits` | `total_credits − total_usage` = **19,77 USD** |
 * | | `GET /api/v1/key` | Limit 5,00 · übrig 4,50 · verbraucht 0,50 (Monat) |
 * | `DEEPSEEK_API_KEY` | `GET /user/balance` | `total_balance` = **48,49 USD** (42,50 gewährt + 5,98 aufgeladen) |
 *
 * **Die zweite Korrektur ist die größere.** Die Datei nannte für DeepSeek `5.98` — das ist nur der
 * aufgeladene Teil. Wer damit arbeitet, hält 42,50 USD für nicht vorhanden.
 *
 * ## Warum das Scheitern sichtbar bleibt
 *
 * Antwortet ein Anbieter nicht (kein Schlüssel, Netz, 401), bleibt der **alte** Wert stehen — aber
 * mit `quelle: 'datei'` und einem `fehler`. Ein stiller Rückfall auf einen drei Tage alten Wert
 * wäre schlimmer als gar keiner.
 *
 * @module @prometheus-harness/usage/salden
 */

import type { Context } from '@deepseek-ai/cordis'

import type { Saldo } from './stand.ts'

/** Der Weg zum Guthaben bei OpenRouter (Konto, nicht Schlüssel). */
export const WEG_OPENROUTER_CREDITS = 'https://openrouter.ai/api/v1/credits'

/** Der Weg zum Schlüssel selbst — Limit und Monatsverbrauch. */
export const WEG_OPENROUTER_KEY = 'https://openrouter.ai/api/v1/key'

/** Der Weg zum Guthaben bei DeepSeek. */
export const WEG_DEEPSEEK_BALANCE = 'https://api.deepseek.com/user/balance'

/** Wie lange eine Abfrage höchstens dauern darf. */
export const ABFRAGE_FRIST_MS = 6_000

/** Wie ein Schlüssel aufgelöst wird (der Speicher des Hosts, dann die Umgebung). */
export type Schluesselquelle = (ref: string) => Promise<string | undefined>

/** Was eine Abfrage braucht — alles hereingereicht, damit sie ohne Host prüfbar bleibt. */
export interface Abfrageoptionen {
  /** Löst einen Schlüsselnamen zu einem Wert auf; `undefined` heißt „nicht hinterlegt". */
  readonly schluessel: Schluesselquelle
  /** Die Uhr. */
  readonly jetzt: Date
  /** Der HTTP-Abruf (im Test ersetzbar). */
  readonly abruf?: typeof fetch
}

/**
 * Baut eine Schlüsselquelle, die den **Namen** beachtet.
 *
 * **Warum nicht `schluesselquelle` aus `ai-capabilities`.** Diese Funktion nimmt keinen Ref: sie
 * löst immer denselben Umweltschlüssel auf. Als `(ref) => …` ist sie typkompatibel — und würde
 * damit **still den OpenRouter-Schlüssel an DeepSeek schicken**. Genau diese Falle ist der Grund,
 * warum die Auflösung hier steht und einen Test hat, der die Namen prüft.
 *
 * @param ctx - der Plugin-Kontext
 * @returns eine Quelle, die je Ref den Speicher, dann die Umgebung fragt
 */
export function schluesselAusContext(ctx: Context): Schluesselquelle {
  return async (ref: string) => {
    const speicher = ctx.get('credentials') as
      | { resolve?: (name: string) => Promise<{ readonly value: string } | undefined> }
      | undefined
    if (speicher !== undefined && typeof speicher.resolve === 'function') {
      try {
        const gelesen = await speicher.resolve(ref)
        if (gelesen !== undefined && gelesen.value.trim() !== '') return gelesen.value
      } catch {
        // **Kein Wurf nach außen.** Ein unlesbarer Speicher ist ein Grund für den Ausweichweg,
        // kein Grund, die ganze Anzeige aufzugeben.
      }
    }
    const ausUmgebung = process.env[ref]
    return ausUmgebung !== undefined && ausUmgebung.trim() !== '' ? ausUmgebung : undefined
  }
}

/**
 * Baut eine Prüfung, ob ein Schlüssel **hinterlegt** ist.
 *
 * ## Warum das die Frage „was habe ich" beantwortet
 *
 * Die Verbrauchsdatei nennt **jeden Namen, der je benutzt wurde** — auf dieser Maschine 14. Wer
 * das Panel öffnet, sieht dann elf Zeilen „kein Guthaben genannt", und keine davon ist eine
 * Auskunft über *seine* Schlüssel. Der Speicher des Hosts weiß es besser: `describe(ref)` sagt,
 * ob das Auflösen einen Wert ergäbe, **ohne den Wert zu nennen**.
 *
 * ## Warum ein Fehler „sichtbar" bedeutet
 *
 * Ist `describe` nicht lesbar, wird **nicht** ausgeblendet. Eine Zeile zu viel ist ein Ärgernis;
 * eine Zeile zu wenig ist ein verschwiegener Schlüssel.
 *
 * @param ctx - der Plugin-Kontext
 * @returns eine Prüfung je Ref
 */
export function verfuegbarkeitAusContext(ctx: Context): Verfuegbarkeit {
  return async (ref: string) => {
    const dienst = ctx.get('credentials') as
      | { describe?: (name: string) => Promise<{ readonly configured: boolean }> }
      | undefined
    if (dienst === undefined || typeof dienst.describe !== 'function') return true
    try {
      const info = await dienst.describe(ref)
      return info.configured
    } catch {
      return true
    }
  }
}

/** Ob ein Schlüssel hinterlegt ist. */
export type Verfuegbarkeit = (ref: string) => Promise<boolean>

/** Liest eine endliche Zahl, ohne `null` zu 0 zu machen. */
function zahl(feld: unknown): number | undefined {
  return typeof feld === 'number' && Number.isFinite(feld) ? feld : undefined
}

/** Liest ein Textfeld. */
function text(feld: unknown): string | undefined {
  return typeof feld === 'string' && feld.trim() !== '' ? feld : undefined
}

/** Kommt man an das `data`-Objekt heran? */
function daten(json: unknown): Record<string, unknown> | undefined {
  if (typeof json !== 'object' || json === null) return undefined
  const inhalt = (json as Record<string, unknown>)['data']
  if (typeof inhalt !== 'object' || inhalt === null) return undefined
  return inhalt as Record<string, unknown>
}

/** Das Guthaben aus `GET /api/v1/credits`. */
export interface Credits {
  readonly guthabenUsd?: number
  /** Was **je** auf das Konto gebucht wurde — die Summe aller Aufladungen. */
  readonly eingezahltUsd?: number
  /** Was davon seit Kontoeröffnung verbraucht wurde. */
  readonly verbrauchtGesamtUsd?: number
  readonly detail?: string
}

/**
 * Rechnet das Guthaben aus Guthaben und Verbrauch.
 *
 * **Warum hier und nicht im Aufrufer.** `total_credits − total_usage` ist die einzige Stelle, an
 * der ein Vorzeichenfehler still bliebe: er sähe wie ein Guthaben aus. Die Subtraktion steht
 * deshalb in einer eigenen Funktion mit eigenem Test.
 *
 * **Warum „eingezahlt" und nicht „Credits".** Das Wort „Credits" liest sich wie ein Geschenk des
 * Anbieters; `total_credits` ist aber die Summe dessen, was der Kunde **selbst** aufgeladen hat.
 * Nebeneinander mit einem gewährten Guthaben (DeepSeek: „20,16 gewährt") wäre das die falsche
 * Auskunft. Die beiden Teile stehen deshalb als eigene Zahlen im Ergebnis, nicht nur als Text.
 *
 * **Warum zwei Nachkommastellen.** Der Saldo darüber wird mit zwei Stellen gezeigt; vier Stellen
 * für denselben Betrag daneben sähen wie zwei verschiedene Zahlen aus.
 *
 * @param json - die gelesene Antwort
 * @returns das Guthaben, wenn beide Zahlen dastehen
 */
export function liesCredits(json: unknown): Credits {
  const inhalt = daten(json)
  if (inhalt === undefined) return {}
  const guthaben = zahl(inhalt['total_credits'])
  const verbrauch = zahl(inhalt['total_usage'])
  if (guthaben === undefined || verbrauch === undefined) return {}
  return {
    guthabenUsd: guthaben - verbrauch,
    eingezahltUsd: guthaben,
    verbrauchtGesamtUsd: verbrauch,
    detail: `${guthaben.toFixed(2)} eingezahlt − ${verbrauch.toFixed(2)} verbraucht`,
  }
}

/** Limit und Monatsverbrauch aus `GET /api/v1/key`. */
export interface Schluesselstand {
  readonly limitUsd?: number
  readonly limitRestUsd?: number
  readonly verbrauchtUsd?: number
  /**
   * Worauf sich das Limit bezieht (`daily`, `weekly`, `monthly`), wenn der Anbieter es sagt.
   *
   * **Warum das mitgelesen wird.** „5,00 USD" neben „25,10 USD Guthaben" sieht wie ein Widerspruch
   * aus, solange niemand sagt, daß das Limit dem **Schlüssel** gehört und je Zeitraum gilt.
   */
  readonly zeitraum?: string
}

/**
 * Liest Limit, Rest und Verbrauch des Schlüssels.
 *
 * @param json - die gelesene Antwort
 * @returns was dastand; fehlende Felder fehlen
 */
export function liesSchluesselstand(json: unknown): Schluesselstand {
  const inhalt = daten(json)
  if (inhalt === undefined) return {}
  const limitUsd = zahl(inhalt['limit'])
  const limitRestUsd = zahl(inhalt['limit_remaining'])
  const verbrauchtUsd = limitUsd === undefined || limitRestUsd === undefined ? undefined : limitUsd - limitRestUsd
  const zeitraum = text(inhalt['limit_reset'])
  return {
    ...(limitUsd === undefined ? {} : { limitUsd }),
    ...(limitRestUsd === undefined ? {} : { limitRestUsd }),
    ...(verbrauchtUsd === undefined ? {} : { verbrauchtUsd }),
    ...(zeitraum === undefined ? {} : { zeitraum: zeitraum.toLowerCase() }),
  }
}

/** Das Guthaben aus `GET /user/balance`. */
export interface Deepseekstand {
  readonly guthabenUsd?: number
  readonly detail?: string
}

/**
 * Liest das DeepSeek-Guthaben.
 *
 * **Warum `total_balance` und nicht `topped_up_balance`.** Die Datei nannte nur den aufgeladenen
 * Teil (5,98 USD); verfügbar sind 48,49 USD, weil 42,50 USD gewährt wurden. Wer den kleineren
 * Wert anzeigt, verschweigt Geld.
 *
 * @param json - die gelesene Antwort
 * @returns Guthaben und eine Zeile, die die Zusammensetzung nennt
 */
export function liesDeepseekstand(json: unknown): Deepseekstand {
  if (typeof json !== 'object' || json === null) return {}
  const liste = (json as { balance_infos?: unknown }).balance_infos
  if (!Array.isArray(liste) || liste.length === 0) return {}
  const erster = liste[0]
  if (typeof erster !== 'object' || erster === null) return {}
  const feld = erster as Record<string, unknown>
  const gesamt = zahl(Number(text(feld['total_balance']) ?? Number.NaN))
  if (gesamt === undefined) return {}
  const gewaehrt = zahl(Number(text(feld['granted_balance']) ?? Number.NaN))
  const aufgeladen = zahl(Number(text(feld['topped_up_balance']) ?? Number.NaN))
  const teile =
    gewaehrt === undefined || aufgeladen === undefined
      ? undefined
      : `${gewaehrt.toFixed(2)} gewährt + ${aufgeladen.toFixed(2)} aufgeladen`
  return {
    guthabenUsd: gesamt,
    ...(teile === undefined ? {} : { detail: teile }),
  }
}

/**
 * Sammelt die Meldungen einer Fehlerkette.
 *
 * **Warum die Kette und nicht `message`.** `fetch` wirft bei einem DNS-Fehler ein `TypeError` mit
 * dem Text „fetch failed"; der Name, um den es geht, steht erst in `cause`. Wer nur `message` liest,
 * zeigt „fetch failed" und verschweigt `getaddrinfo ENOTFOUND openrouter.ai` — die einzige Angabe,
 * mit der sich etwas anfangen läßt.
 *
 * @param problem - was geworfen wurde
 * @returns die Meldungen, von außen nach innen, mit ` · ` verbunden
 */
function alleMeldungen(problem: unknown): string {
  const teile: string[] = []
  let laufend: unknown = problem
  for (let tiefe = 0; tiefe < 5 && laufend !== undefined && laufend !== null; tiefe += 1) {
    if (laufend instanceof Error) {
      teile.push(laufend.message)
      laufend = (laufend as { cause?: unknown }).cause
    } else {
      teile.push(String(laufend))
      break
    }
  }
  return teile.length === 0 ? 'unbekannt' : teile.join(' · ')
}

/**
 * Übersetzt einen Fehler des Abrufs in eine Zeile, die im Panel stehen kann.
 *
 * **Warum das nicht die Rohmeldung ist.** Am 28.10.2026 stand dort
 * „Guthaben: getaddrinfo ENOTFOUND openrouter.ai · Limit: getaddrinfo ENOTFOUND openrouter.ai" —
 * zweimal dieselbe Zeile, in der Sprache von Node, an der Stelle eines Betrags. Die Ursache war
 * dieselbe wie bei jedem anderen Rechner ohne Netz; nur las sie niemand.
 *
 * **Was die Rohmeldung nicht verliert.** Sie wandert nach `technisch` und von dort in den Tooltip.
 * Eine Zeile, die man versteht, und ein Beleg, den man nachlesen kann.
 *
 * @param problem - was geworfen wurde
 * @returns der Satz für die Anzeige und die Rohmeldung für den Tooltip
 */
export function fehlerInWorten(problem: unknown): { text: string; technisch: string } {
  const technisch = alleMeldungen(problem)
  const klein = technisch.toLowerCase()
  const text =
    klein.includes('getaddrinfo') || klein.includes('enotfound') || klein.includes('eai_again')
      ? 'Name nicht auflösbar'
      : klein.includes('timeout') || klein.includes('timedout') || klein.includes('aborted')
        ? 'Zeitüberschreitung'
        : klein.includes('econnrefused')
          ? 'Verbindung abgelehnt'
          : klein.includes('econnreset')
            ? 'Verbindung abgebrochen'
            : klein.includes('certificate') || klein.includes('ssl') || klein.includes('tls')
              ? 'TLS-Handshake gescheitert'
              : klein.includes('enotinternet') || klein.includes('enetunreach')
                ? 'kein Netz'
                : 'Abruf gescheitert'
  return { text, technisch }
}

/**
 * Fragt einen Anbieter und macht aus jedem Fehler eine Aussage.
 *
 * @param weg - die Adresse
 * @param schluessel - der Schlüssel
 * @param abruf - der HTTP-Abruf
 * @returns der gelesene Körper oder ein Fehler in Worten, mit der Rohmeldung daneben
 */
async function hole(
  weg: string,
  schluessel: string,
  abruf: typeof fetch,
): Promise<{ ok: true; json: unknown } | { ok: false; fehler: string; technisch: string }> {
  try {
    const antwort = await abruf(weg, {
      headers: { authorization: `Bearer ${schluessel}`, accept: 'application/json' },
      signal: AbortSignal.timeout(ABFRAGE_FRIST_MS),
    })
    if (!antwort.ok) {
      const zeile = `HTTP ${String(antwort.status)}`
      return { ok: false, fehler: zeile, technisch: zeile }
    }
    return { ok: true, json: (await antwort.json()) as unknown }
  } catch (problem) {
    const { text, technisch } = fehlerInWorten(problem)
    return { ok: false, fehler: text, technisch }
  }
}

/**
 * Holt die lebenden Salden für die Schlüssel, die eine Guthaben-Auskunft haben.
 *
 * **Was hier nicht steht.** Ein Anbieter ohne Guthaben-API (crew, ZAI, ZENMUX …) wird nicht
 * erfragt — er hat keine. Er bleibt in der Anzeige, mit dem, was die Datei sagt.
 *
 * @param optionen - Schlüsselquelle, Uhr und Abruf
 * @returns je Schlüsselname der lebende Stand; leer, wenn nichts erreichbar war
 */
export async function holeLebendeSalden(optionen: Abfrageoptionen): Promise<Map<string, Saldo>> {
  const abruf = optionen.abruf ?? fetch
  const stand = optionen.jetzt.toISOString()
  const aus = new Map<string, Saldo>()

  // **Beide Schlüssel zuerst, dann alle Abrufe gleichzeitig.** Drei Abrufe nacheinander hießen im
  // schlechtesten Fall 18 Sekunden Warten auf ein Panel, das nichts lieber täte als zu zeichnen.
  const [openrouter, deepseek] = await Promise.all([
    optionen.schluessel('OPENROUTER_API_KEY'),
    optionen.schluessel('DEEPSEEK_API_KEY'),
  ])

  const arbeiten: Promise<void>[] = []

  if (openrouter !== undefined) {
    arbeiten.push(
      (async (): Promise<void> => {
        const [guthaben, limit] = await Promise.all([
          hole(WEG_OPENROUTER_CREDITS, openrouter, abruf),
          hole(WEG_OPENROUTER_KEY, openrouter, abruf),
        ])
        const credits = guthaben.ok ? liesCredits(guthaben.json) : {}
        const schluessel = limit.ok ? liesSchluesselstand(limit.json) : {}
        const fehler = [
          guthaben.ok ? undefined : `Guthaben: ${guthaben.fehler}`,
          limit.ok ? undefined : `Limit: ${limit.fehler}`,
        ].filter((zeile): zeile is string => zeile !== undefined)
        const technisch = [
          guthaben.ok ? undefined : `Guthaben: ${guthaben.technisch}`,
          limit.ok ? undefined : `Limit: ${limit.technisch}`,
        ].filter((zeile): zeile is string => zeile !== undefined)
        aus.set('OPENROUTER_API_KEY', {
          schluessel: 'OPENROUTER_API_KEY',
          quelle: 'live',
          stand,
          ...(credits.guthabenUsd === undefined ? {} : { guthabenUsd: credits.guthabenUsd }),
          ...(credits.eingezahltUsd === undefined ? {} : { eingezahltUsd: credits.eingezahltUsd }),
          ...(credits.verbrauchtGesamtUsd === undefined ? {} : { verbrauchtGesamtUsd: credits.verbrauchtGesamtUsd }),
          ...(credits.detail === undefined ? {} : { detail: credits.detail }),
          ...(schluessel.limitUsd === undefined ? {} : { limitUsd: schluessel.limitUsd }),
          ...(schluessel.limitRestUsd === undefined ? {} : { limitRestUsd: schluessel.limitRestUsd }),
          ...(schluessel.verbrauchtUsd === undefined ? {} : { verbrauchtUsd: schluessel.verbrauchtUsd }),
          ...(schluessel.zeitraum === undefined ? {} : { limitZeitraum: schluessel.zeitraum }),
          ...(fehler.length === 0 ? {} : { fehler: fehler.join(' · ') }),
          ...(technisch.length === 0 ? {} : { fehlerTechnisch: technisch.join(' · ') }),
        })
      })(),
    )
  }

  if (deepseek !== undefined) {
    arbeiten.push(
      (async (): Promise<void> => {
        const antwort = await hole(WEG_DEEPSEEK_BALANCE, deepseek, abruf)
        const gelesen = antwort.ok ? liesDeepseekstand(antwort.json) : {}
        aus.set('DEEPSEEK_API_KEY', {
          schluessel: 'DEEPSEEK_API_KEY',
          quelle: 'live',
          stand,
          ...(gelesen.guthabenUsd === undefined ? {} : { guthabenUsd: gelesen.guthabenUsd }),
          ...(gelesen.detail === undefined ? {} : { detail: gelesen.detail }),
          ...(antwort.ok ? {} : { fehler: antwort.fehler }),
          ...(antwort.ok ? {} : { fehlerTechnisch: antwort.technisch }),
        })
      })(),
    )
  }

  await Promise.all(arbeiten)
  return aus
}
