/**
 * **Die Notizen in der Welt — als Plugin, nicht als Sonderfall.**
 *
 * ## Was dieses Plugin tut
 *
 * Es zeigt die Notizen des **angemeldeten Kontos** aus Postgres: eine Liste, eine Suche, und
 * — wenn das Konto noch keinen Vault hat — den **Vorschlag**, den der Wirt aus `obsidian.json`
 * kennt. Übernommen wird er erst durch einen Klick, nie von selbst.
 *
 * ## Warum das Panel nichts selbst rechnet
 *
 * Die Welt ist eine Browserseite; sie darf kein Verzeichnis lesen (§ „Warum das auf der
 * Rechner-Seite steht" in `world-obsidian`). Sie fragt `/api/pmh/notizen` und bekommt, was der
 * Wirt aus der Datenbank liest — mit der Sitzung, die der Browser ohnehin mitschickt. Das Plugin
 * ist damit **Anzeige**, keine zweite Wahrheit: was hier steht, steht auch dort.
 *
 * ## Der CSRF-Wert
 *
 * Die beiden ändernden Wege verlangen `x-pmh-csrf`. Der Wert liegt in einem **lesbaren** Keks
 * (`pmh_csrf`) — genau dafür: eine fremde Seite kann ihn nicht lesen (gleiche Herkunft), diese
 * Seite schon. Fehlt er (jemand hat die Kekse gelöscht), sagt das Plugin das und tut nichts, statt
 * einen 403 als „kaputt" zu melden.
 */
import type { Field } from './settings'
import type { HealthReport, Plugin } from './plugins'

/** Wie viele Notizen das Panel höchstens holt — eine Einstellung, keine feste Zahl. */
const GRENZE_FELD: Field = {
  kind: 'number',
  key: 'notes.limit',
  category: 'plugins',
  default: 50,
  min: 5,
  max: 500,
  step: 5,
  unit: 'plain',
}

/** Der Kopf, mit dem die Welt sagt: „diese Anfrage kommt von mir". */
const WELT_KOPF = { 'x-pmh-welt': '1' } as const

/** Wie spät die Suche frühestens fragt, während jemand tippt (Millisekunden). */
const SUCH_PAUSE = 250

/**
 * Wie lange ein geholter Stand als frisch gilt (Millisekunden).
 *
 * **Gemessen, nicht geschätzt.** Ein Aufbau der Fläche ruft `render` erneut auf — bei einer
 * Sprachumstellung, einem Plugin-Wechsel, einem Zonenwechsel. Ohne diese Frist standen im
 * Netzwerkprotokoll **sieben** Abrufe für einen offenen Reiter (`?grenze=50`), alle mit derselben
 * Frage. Zwei Sekunden sind kurz genug, daß „neu einlesen" sofort wirkt, und lang genug, daß ein
 * Aufbau-Sturm eine Anfrage ergibt statt sieben.
 */
const FRISCH_MS = 2000

/** Der zuletzt geholte Stand je Frage — der Zwischenspeicher gegen Aufbau-Stürme. */
const zwischengespeichert = new Map<string, { readonly lage: Lage; readonly zeit: number }>()

/** Laufende Abrufe: ein zweiter Aufbau wartet auf denselben Abruf, statt einen neuen zu starten. */
const unterwegs = new Map<string, Promise<Lage>>()

/** Was dieses Plugin von außen braucht. */
export interface NotizenEnv {
  /** Der Übersetzer der Oberfläche — das Plugin kennt keine Sätze, nur Schlüssel. */
  readonly tr: (key: string, vars?: Readonly<Record<string, string | number>>) => string
  /** Die Einstellungsverwaltung — für das Abfragen und das Beschreiben des Feldes. */
  readonly settings: {
    get<T extends number | boolean | string>(key: string, fallback: T): T
    describe(field: Field): void
  }
}

/** Eine Notiz, so wie sie angezeigt wird. */
interface Notiz {
  readonly id: string
  readonly pfad: string
  readonly titel: string
  readonly tags: readonly string[]
}

/** Der Stand eines Kontos. */
export interface NotizenStand {
  readonly vaults: number
  readonly notizen: number
  readonly verweise: number
  readonly etiketten: number
}

/** Was ein Abruf ergeben hat. */
export interface Lage {
  readonly notizen: readonly Notiz[]
  readonly vaults: number
  readonly kandidat: string | null
  readonly stand: NotizenStand | undefined
  /** `undefined` heißt: kein Fehler. Sonst ein **stabiler** Code, kein Satz. */
  readonly fehler: string | undefined
}

/** Die leere Lage — auch der Anfangszustand vor dem ersten Abruf. */
const LEER: Lage = { notizen: [], vaults: 0, kandidat: null, stand: undefined, fehler: undefined }

/** Macht aus einer ungeprüften Zeile der Datenbank eine Notiz — oder verwirft sie. */
function alsNotiz(roh: unknown): Notiz | undefined {
  if (typeof roh !== 'object' || roh === null) return undefined
  const daten = roh as Record<string, unknown>
  const id = typeof daten.id === 'string' ? daten.id : undefined
  const pfad = typeof daten.pfad === 'string' ? daten.pfad : undefined
  if (id === undefined || pfad === undefined) return undefined
  const titel = typeof daten.titel === 'string' && daten.titel.trim() !== '' ? daten.titel : pfad
  const tags = Array.isArray(daten.tags) ? daten.tags.filter((t): t is string => typeof t === 'string') : []
  return { id, pfad, titel, tags }
}

/** Prüft eine Zahl aus einer Antwort, ohne `NaN` weiterzureichen. */
function alsZahl(wert: unknown, vorgabe = 0): number {
  return typeof wert === 'number' && Number.isFinite(wert) ? wert : vorgabe
}

/**
 * Holt den Stand des Kontos über den Weg des Wirts.
 *
 * Wiederholte Aufbauten fragen nicht erneut, solange der Stand frisch ist
 * ({@link FRISCH_MS}); ein laufender Abruf wird geteilt.
 *
 * @param q - der Suchbegriff, leer heißt „alles"
 * @param grenze - wie viele Zeilen höchstens
 * @returns die Lage — ein Fehler wird **zurückgegeben**, nicht geworfen
 */
export async function hole(q: string, grenze: number): Promise<Lage> {
  const schluessel = `${q.trim()}|${String(grenze)}`
  const frisch = zwischengespeichert.get(schluessel)
  if (frisch !== undefined && Date.now() - frisch.zeit < FRISCH_MS) return frisch.lage
  const laufend = unterwegs.get(schluessel)
  if (laufend !== undefined) return await laufend

  const auftrag = holeWirklich(q, grenze).then((lage) => {
    zwischengespeichert.set(schluessel, { lage, zeit: Date.now() })
    return lage
  })
  unterwegs.set(schluessel, auftrag)
  try {
    return await auftrag
  } finally {
    unterwegs.delete(schluessel)
  }
}

/**
 * Der eigentliche Abruf — ohne Zwischenspeicher.
 *
 * @param q - der Suchbegriff, leer heißt „alles"
 * @param grenze - wie viele Zeilen höchstens
 * @returns die Lage — ein Fehler wird **zurückgegeben**, nicht geworfen
 */
async function holeWirklich(q: string, grenze: number): Promise<Lage> {
  // **Ein relativer Pfad, keine zusammengebaute Adresse.** `window.location.origin` ist in einer
  // Umgebung ohne Seite leer (Tests, Prüfstände), und `new URL(…, '')` wirft dann — ein Wurf, der
  // nicht hier auffällt, sondern beim nächsten Test. `fetch` nimmt den relativen Pfad selbst.
  const parameter = new URLSearchParams()
  if (q.trim() !== '') parameter.set('q', q.trim())
  parameter.set('grenze', String(grenze))
  const pfad = `/api/pmh/notizen?${parameter.toString()}`

  let antwort: Response
  try {
    antwort = await fetch(pfad, {
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...WELT_KOPF },
    })
  } catch {
    return { ...LEER, fehler: 'netz' }
  }
  const daten = (await antwort.json().catch(() => undefined)) as
    | { readonly ok?: boolean; readonly value?: unknown; readonly error?: { readonly code?: string } }
    | undefined
  if (daten?.ok !== true) {
    return { ...LEER, fehler: daten?.error?.code ?? `http-${antwort.status}` }
  }
  const wert = (daten.value ?? {}) as Record<string, unknown>
  const roheNotizen = Array.isArray(wert.notizen) ? wert.notizen : []
  const notizen = roheNotizen.map(alsNotiz).filter((n): n is Notiz => n !== undefined)
  const stand =
    typeof wert.stand === 'object' && wert.stand !== null ? (wert.stand as Record<string, unknown>) : undefined
  return {
    notizen,
    vaults: alsZahl(wert.vaults),
    kandidat: typeof wert.kandidat === 'string' && wert.kandidat !== '' ? wert.kandidat : null,
    stand:
      stand === undefined
        ? undefined
        : {
            vaults: alsZahl(stand.vaults),
            notizen: alsZahl(stand.notizen),
            verweise: alsZahl(stand.verweise),
            etiketten: alsZahl(stand.etiketten),
          },
    fehler: undefined,
  }
}

/** Der CSRF-Wert aus dem lesbaren Keks — `undefined`, wenn es keinen gibt. */
export function csrfAusKeks(keks: string): string | undefined {
  const treffer = /(?:^|;\s*)pmh_csrf=([^;]*)/u.exec(keks)
  if (treffer === null) return undefined
  const wert = decodeURIComponent(treffer[1])
  return wert === '' ? undefined : wert
}

/**
 * Ein ändernder Aufruf gegen die Notiz-Wege.
 *
 * @param pfad - der Weg
 * @param koerper - der Rumpf
 * @param keks - die Kekse der Seite (im Betrieb `document.cookie`)
 * @returns `ok` oder ein stabiler Fehlercode
 */
export async function sendeNotizWeg(
  pfad: string,
  koerper: unknown,
  keks: string,
): Promise<{ readonly ok: boolean; readonly code?: string }> {
  const csrf = csrfAusKeks(keks)
  if (csrf === undefined) return { ok: false, code: 'kein-csrf' }
  let antwort: Response
  try {
    antwort = await fetch(pfad, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-pmh-csrf': csrf, ...WELT_KOPF },
      body: JSON.stringify(koerper),
    })
  } catch {
    return { ok: false, code: 'netz' }
  }
  const daten = (await antwort.json().catch(() => undefined)) as
    | { readonly ok?: boolean; readonly error?: { readonly code?: string } }
    | undefined
  if (daten?.ok === true) {
    // **Ein ändernder Aufruf macht den Zwischenspeicher ungültig.** Sonst zeigte das Panel nach
    // „einlesen" noch bis zu {@link FRISCH_MS} den alten Stand — und das sähe aus, als hätte der
    // Knopf nichts getan.
    zwischengespeichert.clear()
    return { ok: true }
  }
  return { ok: false, code: daten?.error?.code ?? `http-${antwort.status}` }
}

/** Wie das Plugin eingehängt wird — ohne Panel, wenn die Oberfläche es nicht anbietet. */
export interface NotizenOptionen {
  /** `false` läßt das Panel weg; Befehl und Gesundheitsprüfung bleiben. */
  readonly panel?: boolean
}

/**
 * Baut das Notiz-Plugin.
 *
 * @param env - Übersetzer und Einstellungen
 * @param optionen - ob das Panel angeboten wird (Vorgabe: ja)
 * @returns das Plugin für die Registry
 */
export function notizenPlugin(env: NotizenEnv, optionen: NotizenOptionen = {}): Plugin {
  const t = env.tr

  // **Der letzte Stand steht außerhalb des Panels.** Befehl und Gesundheitsprüfung sind synchron
  // (`run` liefert Zeilen, `healthChecks` einen Bericht) — sie können nicht warten und lesen
  // deshalb, was zuletzt geholt wurde. Nie geholt ist etwas anderes als „nichts da", und das
  // sagen beide auch so.
  let letzteLage: Lage | undefined
  let letzteSuche = ''

  /**
   * Der Text zu einem stabilen Fehlercode.
   *
   * **Ausgeschrieben als Aufrufe, nicht zusammengesetzt.** Der Sprachwächter
   * (`tests/locale-keys.test.ts`) findet nur ausgeschriebene Übersetzer-Aufrufe; ein aus Präfix
   * und Code zusammengesetzter Schlüssel wäre für ihn unsichtbar, und die Sätze sähen aus wie
   * Ballast, den niemand liest. Hier steht jeder Code einmal, und ein **neuer** Code fällt auf: er
   * landet im Rückfall und sagt seinen Namen.
   */
  const fehlerTexte: Readonly<Record<string, () => string>> = {
    netz: () => t('notes.error.netz'),
    'kein-csrf': () => t('notes.error.kein-csrf'),
    'nicht-angemeldet': () => t('notes.error.nicht-angemeldet'),
    unerwartet: () => t('notes.error.unerwartet'),
    'pfad-weg': () => t('notes.error.pfad-weg'),
    'pfad-kein-ordner': () => t('notes.error.pfad-kein-ordner'),
    'pfad-nicht-absolut': () => t('notes.error.pfad-nicht-absolut'),
    'pfad-unbrauchbar': () => t('notes.error.pfad-unbrauchbar'),
    'vault-fehlt': () => t('notes.error.vault-fehlt'),
    'vault-schon-da': () => t('notes.error.vault-schon-da'),
  }

  /** Der Text zu einem stabilen Fehlercode — mit Rückfall, damit nie ein Schlüssel dasteht. */
  const fehlerText = (code: string): string => {
    const text = fehlerTexte[code]
    return text === undefined ? `${t('notes.error.unbekannt')} (${code})` : text()
  }

  const grenze = (): number => {
    const wert = env.settings.get(GRENZE_FELD.key, GRENZE_FELD.default as number)
    return typeof wert === 'number' && Number.isFinite(wert) ? wert : (GRENZE_FELD.default as number)
  }

  return {
    id: 'notes',
    name: 'Notizen',
    version: '0.1.0',
    description:
      'Die Notizen des angemeldeten Kontos aus Postgres: Liste, Suche, Vault übernehmen und einlesen — je Konto, nie über Konten hinweg.',
    settings: [{ field: GRENZE_FELD }],
    onEnable: () => {
      env.settings.describe(GRENZE_FELD)
    },
    panel: optionen.panel === false ? undefined : {
      title: () => t('panel.notes'),
      /*
       * **Abgesteckt und nicht in der Panelliste.**
       *
       * Das Panel zeigt Titel und Pfad — es kann keine Notiz öffnen, ändern oder anlegen. Als
       * dauerhaft rechte Spalte war es eine Sackgasse, die die Welt verdeckt hat; als Zeile in der
       * Insel wäre es derselbe Sackgassen-Klick. Der **Befehl `notizen`** bleibt: er listet im
       * Terminal, wo eine Liste ohne Editor ehrlich ist. Wenn es einen Lese-/Schreibweg gibt, kann
       * das Panel zurückkommen — dann mit einer Handlung.
       */
      zone: 'closed',
      size: 380,
      render: (host) => {
        host.replaceChildren()
        host.classList.add('notizen')

        const titel = document.createElement('strong')
        titel.className = 'notizen-titel'
        titel.textContent = t('notes.title')
        host.appendChild(titel)

        const suche = document.createElement('input')
        suche.type = 'search'
        suche.className = 'notizen-suche'
        suche.placeholder = t('notes.search')
        suche.value = letzteSuche
        suche.setAttribute('aria-label', t('notes.search'))
        host.appendChild(suche)

        const liste = document.createElement('div')
        liste.className = 'notizen-liste'
        liste.textContent = t('notes.loading')
        host.appendChild(liste)

        const fuss = document.createElement('div')
        fuss.className = 'notizen-fuss'
        host.appendChild(fuss)

        // Jeder Aufbau zählt seine Abrufe. Eine Antwort, die zu einem **früheren** Aufbau gehört,
        // wird verworfen — sonst überschreibt ein langsamer alter Abruf die neue Suche.
        let lauf = 0

        const zeichne = (lage: Lage): void => {
          liste.replaceChildren()
          fuss.replaceChildren()

          if (lage.fehler !== undefined) {
            const meldung = document.createElement('p')
            meldung.className = 'notizen-fehler'
            meldung.textContent = fehlerText(lage.fehler)
            liste.appendChild(meldung)
            // **Mit einem Weg hinaus, nicht nur mit einer Meldung.** Fehlt die Sitzung, ist das
            // keine Sackgasse: die Notiz-Wege gehören zur Konto-Tür, und dort kann man sich
            // anmelden. Ohne diesen Knopf stünde da ein Satz und sonst nichts.
            if (lage.fehler === 'nicht-angemeldet' || lage.fehler === 'kein-csrf') {
              const hin = document.createElement('a')
              hin.className = 'notizen-knopf'
              hin.href = '/anmeldung/'
              hin.textContent = t('notes.signin')
              liste.appendChild(hin)
            }
            return
          }

          if (lage.notizen.length === 0) {
            const leer = document.createElement('p')
            leer.className = 'notizen-leer'
            leer.textContent = letzteSuche.trim() === '' ? t('notes.empty') : t('notes.emptySearch')
            liste.appendChild(leer)
          } else {
            for (const notiz of lage.notizen) {
              const zeile = document.createElement('div')
              zeile.className = 'notizen-eintrag'
              const name = document.createElement('span')
              name.className = 'notizen-name'
              name.textContent = notiz.titel
              zeile.appendChild(name)
              const pfad = document.createElement('span')
              pfad.className = 'notizen-pfad'
              pfad.textContent = notiz.pfad
              zeile.appendChild(pfad)
              for (const tag of notiz.tags.slice(0, 4)) {
                const marke = document.createElement('span')
                marke.className = 'notizen-marke'
                marke.textContent = `#${tag}`
                zeile.appendChild(marke)
              }
              liste.appendChild(zeile)
            }
          }

          const zaehler = document.createElement('span')
          zaehler.className = 'notizen-zaehler'
          zaehler.textContent = t('notes.count', {
            n: lage.notizen.length,
            gesamt: lage.stand?.notizen ?? 0,
          })
          fuss.appendChild(zaehler)

          // **Nur ohne eigenen Vault.** Der Vorschlag ist ein Angebot, kein Eintrag.
          if (lage.kandidat !== null) {
            const box = document.createElement('div')
            box.className = 'notizen-vorschlag'
            const text = document.createElement('span')
            text.textContent = `${t('notes.vault.missing')} ${lage.kandidat}`
            box.appendChild(text)
            const knopf = document.createElement('button')
            knopf.type = 'button'
            knopf.className = 'notizen-knopf'
            knopf.textContent = t('notes.vault.take')
            knopf.addEventListener('click', () => {
              void sendeNotizWeg('/api/pmh/notizen/vault', { pfad: lage.kandidat }, document.cookie).then((ergebnis) => {
                if (!ergebnis.ok) zeichne({ ...lage, fehler: ergebnis.code })
                else void aktualisiere()
              })
            })
            box.appendChild(knopf)
            liste.appendChild(box)
          }

          if (lage.vaults > 0) {
            const knopf = document.createElement('button')
            knopf.type = 'button'
            knopf.className = 'notizen-knopf'
            knopf.textContent = t('notes.import')
            knopf.addEventListener('click', () => {
              knopf.disabled = true
              void sendeNotizWeg('/api/pmh/notizen/einlesen', {}, document.cookie).then((ergebnis) => {
                knopf.disabled = false
                if (!ergebnis.ok) zeichne({ ...lage, fehler: ergebnis.code })
                else void aktualisiere()
              })
            })
            fuss.appendChild(knopf)
          }
        }

        const aktualisiere = async (): Promise<void> => {
          lauf += 1
          const meiner = lauf
          const lage = await hole(letzteSuche, grenze())
          if (meiner !== lauf) return
          letzteLage = lage
          zeichne(lage)
        }

        let zeitgeber: number | undefined
        suche.addEventListener('input', () => {
          letzteSuche = suche.value
          if (zeitgeber !== undefined) window.clearTimeout(zeitgeber)
          zeitgeber = window.setTimeout(() => {
            void aktualisiere()
          }, SUCH_PAUSE)
        })

        void aktualisiere()
      },
    },
    commands: [
      {
        name: 'notizen',
        help: t('notes.command.help'),
        run: (args) => {
          const wort = (args[0] ?? '').trim()
          if (wort !== '') letzteSuche = wort
          // Der Abruf läuft nebenher — `run` muß synchron antworten können.
          void hole(letzteSuche, grenze()).then((lage) => {
            letzteLage = lage
          })
          const lage = letzteLage
          if (lage === undefined) return [t('notes.command.empty')]
          if (lage.fehler !== undefined) return [fehlerText(lage.fehler)]
          const zeilen: string[] = [
            t('notes.count', { n: lage.notizen.length, gesamt: lage.stand?.notizen ?? 0 }),
          ]
          for (const notiz of lage.notizen.slice(0, 20)) zeilen.push(`  ${notiz.titel} — ${notiz.pfad}`)
          if (lage.notizen.length > 20) zeilen.push(`  … ${lage.notizen.length - 20} weitere im Panel`)
          return zeilen
        },
      },
    ],
    healthChecks: [
      (): HealthReport => {
        if (letzteLage === undefined) {
          // **Nicht geprüft ist ein Befund, kein „in Ordnung".** Wer hier `ok: true` sagt, behauptet
          // etwas über Daten, die nie geholt wurden.
          return { name: 'notes:ungeprueft', ok: false, message: t('notes.health.unchecked') }
        }
        if (letzteLage.fehler !== undefined) {
          return {
            name: 'notes:fehler',
            ok: false,
            message: fehlerText(letzteLage.fehler),
            details: { Code: letzteLage.fehler },
          }
        }
        const stand = letzteLage.stand
        return {
          name: 'notes',
          ok: true,
          message: t('notes.health.ok', {
            notizen: stand?.notizen ?? letzteLage.notizen.length,
            verweise: stand?.verweise ?? 0,
          }),
          details: {
            Notizen: stand?.notizen ?? letzteLage.notizen.length,
            Verweise: stand?.verweise ?? 0,
            Etiketten: stand?.etiketten ?? 0,
            Vaults: letzteLage.vaults,
          },
        }
      },
    ],
  }
}
