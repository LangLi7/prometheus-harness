/**
 * **Die Crew als Panel — Rollen binden, Standard setzen, Plan sehen.**
 *
 * ## Was dieses Panel ist und was nicht
 *
 * Es ist die **Oberfläche** eines Dokuments, dessen Wahrheit auf dem Server liegt: die Liste der
 * Crews eines Kontos, die Standard-Crew, das Projekt und die Frage, ob der Host sie bedient. Es
 * entscheidet **keine** Regel selbst — ob eine Rolle auf `crew` zeigen darf, ob eine Kennung
 * vergeben ist, ob eine Crew ohne Rolle steht, antwortet der Server
 * (`@prometheus-harness/crew-store`, dieselbe Prüfung, die der Adapter beim Bau benutzt).
 *
 * ## Warum gespeichert wird, obwohl jede Änderung schon im Entwurf steht
 *
 * Ein Feld, das bei jedem Tastendruck schreibt, ist ein Feld, das bei jedem Tastendruck **halb**
 * schreibt. Der Entwurf ist lokal; `Speichern` schickt den ganzen Stand in **einem** `PUT`, und
 * die Antwort ist der gespeicherte Stand — nicht eine Behauptung darüber.
 *
 * ## Woher die Rollenliste kommt
 *
 * Aus `@prometheus-harness/crew-plan` (`CREW_ROLLEN`). Hier steht sie **abgeschrieben**, weil das
 * Paket `node:crypto` zieht und damit nicht in ein Browserbündel gehört. Die Quelle bleibt die
 * eine: ändert sie sich, ist diese Zeile die zweite Stelle — und der Server weist eine unbekannte
 * Rolle ab, statt sie zu übergehen.
 *
 * @module @prometheus-harness/crew
 */

import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// **Für die Slot-Karte `plugins.item`** — der Typ kommt aus dem Plugin-Manager, zur Laufzeit wird
// nichts davon importiert.
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// **Für den Dienst `configForms`.** Das Modul erweitert den Kontext um ihn; ohne den Import kennt
// der Compiler `ctx.configForms` nicht.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { EN } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    crew: keyof typeof EN
  }
}

/** Die Kennung im main-Slot und in der Seitenleiste. */
export const PANEL_ID = 'crew'

/** Die Kennung dieser Seite in der Plugins-Liste (Einstellungen). */
const PLUGIN_ID = 'pmh-crew'

/**
 * Der Eintrag im Profil — **der Schlüssel der Einstellungen**.
 *
 * Die Einstellungsseite eines Plugins speist sich aus der `Config` seines **Profil-Eintrags**,
 * nicht aus seinem Paketnamen. Derselbe Text wie `PLUGIN_ID`, aber eine andere Bedeutung: dort ist
 * er die Kennung einer Slot-Anmeldung, hier der Name des Cordis-Eintrags (`id:` in
 * `cordis.patch.yml`). Zwei Bedeutungen, und eine darf sich ändern, ohne die andere mitzunehmen.
 */
export const ENTRY_ID = 'pmh-crew'

/** Der Namensraum der Texte. */
const NS = 'crew'

/** Was dieses Plugin vom Client verlangt. */
export const inject = ['slots', 'locale', 'layout', 'configForms']

/**
 * Die Anzeige-Einstellungen — **die Form der `Config` auf der Host-Hälfte** (`src/server.ts`).
 *
 * Alle Felder sind optional: die Einstellungsseite schickt nur, was der Nutzer geändert hat, und
 * eine fehlende Angabe heißt „Vorgabe", nicht „leer".
 */
interface DisplayConfig {
  /** Wo das Panel erscheint: `sidebar`, `plugins`, `both` oder `none`. */
  readonly surface?: string
  /** Platz in der Leiste bzw. in der Plugin-Liste; kleinere Zahl steht weiter oben. */
  readonly order?: number
  /** Eigene Beschriftung. Leer heißt: der Text aus dem Sprachpaket. */
  readonly label?: string
}

/** Die Anzeige, wie sie nach dem Lesen der Einstellungen gilt — Vorgaben schon eingesetzt. */
interface Anzeige {
  readonly oberflaeche: 'sidebar' | 'plugins' | 'both' | 'none'
  readonly reihenfolge: number
  readonly beschriftung: string | undefined
}

/** Der Platz, den das Plugin ohne Einstellung hatte — ein Bestand soll sich nicht verschieben. */
const STANDARD_REIHENFOLGE = 14

/**
 * Setzt die Vorgaben in die Einstellungen ein.
 *
 * **Warum das eine eigene Funktion ist.** Dieselbe Auslegung wird an zwei Stellen gebraucht (den
 * beiden Anmeldungen). Stünde sie zweimal da, wäre die Vorgabe `sidebar` irgendwann an einer Stelle
 * `both` — und das fiele niemandem auf.
 *
 * @param config - der gelesene Abschnitt, oder `undefined`, solange der Host noch nicht geantwortet hat
 * @returns die geltende Anzeige
 */
function liesAnzeige(config: DisplayConfig | undefined): Anzeige {
  const flaeche = config?.surface
  const oberflaeche: Anzeige['oberflaeche'] =
    flaeche === 'plugins' || flaeche === 'both' || flaeche === 'none' || flaeche === 'sidebar'
      ? flaeche
      : 'sidebar'
  const platz = config?.order
  const reihenfolge = typeof platz === 'number' && Number.isFinite(platz) ? platz : STANDARD_REIHENFOLGE
  const roh = config?.label
  const beschriftung = typeof roh === 'string' && roh.trim() !== '' ? roh.trim() : undefined
  return { oberflaeche, reihenfolge, beschriftung }
}

/** Der Weg — dieselbe Adresse wie in `src/server.ts`. */
const WEG = '/api/pmh/crew'

/** Wo die wählbaren Routen und Modelle stehen. */
const WEG_KATALOG = '/api/pmh/crew/katalog'

/** Eine Anbieter-Route mit ihren Modellen, wie der Host sie nennt. */
interface Weg {
  readonly id: string
  readonly name: string
  readonly modelle: readonly { readonly id: string; readonly name: string }[]
}

/** Antwort des Katalogs. */
interface Katalog {
  readonly wege: readonly Weg[]
  readonly hinweis?: string
}

/**
 * Die Route, die eine Crew selbst ist.
 *
 * **Warum abgeschrieben.** Dieselbe Kennung wie `CREW_ROUTE` in `crew-provider`; das Paket zieht
 * Server-Code (`node:path`) und gehört nicht ins Browserbündel. Der Server weist eine Rolle auf
 * dieser Route ab (`pruefeCrew`) — hier wird sie gar nicht erst angeboten, damit die Auswahl nicht
 * in eine Sackgasse führt.
 */
const CREW_ROUTE = 'crew'

/**
 * Die Modelle einer Route.
 *
 * **Warum die Crew-Route leer bleibt.** Ihre „Modelle" sind Crews. Eine Crew als Modell einer
 * Rolle wäre eine Crew in einer Crew — genau das, was der Server verbietet.
 *
 * @param wege - der Katalog
 * @param familie - die gewählte Route
 * @returns die Modelle dieser Route; leer für die Crew-Route
 */
function modelleDerRoute(wege: readonly Weg[], familie: string): Weg['modelle'] {
  if (familie === CREW_ROUTE) return []
  return wege.find((weg) => weg.id === familie)?.modelle ?? []
}

/** Der Keks, den die Seite lesen darf — das Sitzungskek ist `HttpOnly`. */
const CSRF_KEKS = 'pmh_csrf'

/** Der Kopf, den der Server für Zustandsänderungen verlangt. */
const CSRF_KOPF = 'x-pmh-csrf'

/**
 * Die Rollen einer Crew — abgeschrieben aus `CREW_ROLLEN` (`crew-plan/src/types.ts`).
 *
 * `search` ist Prometheus-eigen (der Harness kennt sie nicht), `helper` bleibt wählbar und
 * unbenutzt — beides steht dort begründet.
 */
const ROLLEN = ['planner', 'executor', 'reviewer', 'vision', 'search', 'helper'] as const

interface Rollenbindung {
  readonly familie: string
  readonly modell: string
}

interface Crewzeile {
  readonly id: string
  readonly name?: string
  readonly rollen: Readonly<Record<string, Rollenbindung>>
}

interface Plansicht {
  readonly crew: string
  readonly rollen: readonly {
    readonly rolle: string
    readonly ziel?: { readonly text: string; readonly stand: string }
    readonly aufgaben: readonly { readonly text: string; readonly stand: string }[]
  }[]
}

interface Sicht {
  readonly art: 'postgres' | 'datei'
  readonly crews: readonly Crewzeile[]
  readonly standard: string | null
  readonly projekt: string | null
  readonly aktiv: boolean
  readonly betrieb: {
    readonly nutzer: string | null
    readonly verzeichnis: string
    readonly werkzeuge: boolean
    readonly grund?: string
  }
  readonly plan: Plansicht | null
  readonly hinweis?: string
}

interface Entwurfrolle {
  readonly rolle: string
  readonly familie: string
  readonly modell: string
}

interface Entwurfcrew {
  readonly id: string
  readonly name: string
  readonly rollen: readonly Entwurfrolle[]
}

interface Entwurf {
  readonly crews: readonly Entwurfcrew[]
  readonly standard: string | null
  readonly projekt: string
  readonly aktiv: boolean
}

interface Props {
  readonly close: () => void
  readonly t: TranslateNS<'crew'>
  /** Die aktive Sprache der Oberfläche — sie geht mit jeder Anfrage an den Host. */
  readonly sprache: () => string
}

/** Liest einen Kekswert; leer, wenn er fehlt. */
function keksWert(name: string): string {
  for (const stueck of document.cookie.split(';')) {
    const i = stueck.indexOf('=')
    if (i === -1) continue
    if (stueck.slice(0, i).trim() === name) return decodeURIComponent(stueck.slice(i + 1).trim())
  }
  return ''
}

/** Ein Fehler aus einer Antwort des Servers — mit dem stabilen Code. */
class Serverfehler extends Error {
  readonly status: number
  readonly befunde: readonly string[]
  readonly crewId: string | undefined

  constructor(status: number, meldung: string, befunde: readonly string[] = [], crewId?: string) {
    super(meldung)
    this.status = status
    this.befunde = befunde
    this.crewId = crewId
  }
}

/** Ein GET auf den eigenen Ursprung — mit Keksen und der aktiven Sprache. */
async function hole<T>(url: string, sprache: string): Promise<T> {
  const antwort = await fetch(`${url}?sprache=${encodeURIComponent(sprache)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const daten = (await antwort.json().catch(() => undefined)) as unknown
  if (!antwort.ok) {
    const fehler = daten as { fehler?: string; text?: string } | undefined
    throw new Serverfehler(antwort.status, fehler?.text ?? `HTTP ${String(antwort.status)}`)
  }
  return daten as T
}

/** Ein PUT auf den eigenen Ursprung — mit CSRF-Kopf und der aktiven Sprache. */
async function schicke<T>(url: string, koerper: unknown, sprache: string): Promise<T> {
  const antwort = await fetch(`${url}?sprache=${encodeURIComponent(sprache)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', [CSRF_KOPF]: keksWert(CSRF_KEKS) },
    body: JSON.stringify(koerper),
  })
  const daten = (await antwort.json().catch(() => undefined)) as unknown
  if (!antwort.ok) {
    const fehler = daten as { fehler?: string; text?: string; befunde?: readonly string[]; crewId?: string } | undefined
    throw new Serverfehler(
      antwort.status,
      fehler?.text ?? fehler?.fehler ?? `HTTP ${String(antwort.status)}`,
      fehler?.befunde ?? [],
      fehler?.crewId,
    )
  }
  return daten as T
}

/** Macht aus der Sicht einen bearbeitbaren Entwurf. */
function entwurfAus(sicht: Sicht): Entwurf {
  return {
    crews: sicht.crews.map((crew) => ({
      id: crew.id,
      name: crew.name ?? '',
      rollen: Object.entries(crew.rollen).map(([rolle, bindung]) => ({
        rolle,
        familie: bindung.familie,
        modell: bindung.modell,
      })),
    })),
    standard: sicht.standard ?? sicht.crews[0]?.id ?? null,
    projekt: sicht.projekt ?? '',
    aktiv: sicht.aktiv,
  }
}

/** Macht aus dem Entwurf den Rumpf des `PUT`. */
function rumpfAus(entwurf: Entwurf): unknown {
  return {
    crews: entwurf.crews.map((crew) => {
      const rollen: Record<string, Rollenbindung> = {}
      for (const eintrag of crew.rollen) {
        if (eintrag.rolle === '' || eintrag.familie.trim() === '' || eintrag.modell.trim() === '') continue
        rollen[eintrag.rolle] = { familie: eintrag.familie.trim(), modell: eintrag.modell.trim() }
      }
      return {
        id: crew.id.trim(),
        ...(crew.name.trim() === '' ? {} : { name: crew.name.trim() }),
        rollen,
      }
    }),
    standard: entwurf.standard,
    projekt: entwurf.projekt.trim() === '' ? null : entwurf.projekt.trim(),
    aktiv: entwurf.aktiv,
  }
}

/** Eine neue, leere Crew. */
function neueCrew(nummer: number): Entwurfcrew {
  return {
    id: `crew-${String(nummer)}`,
    name: '',
    rollen: [{ rolle: 'executor', familie: 'deepseek-official', modell: 'deepseek-flash' }],
  }
}

/**
 * Die nächste freie Kennung `crew-N`.
 *
 * **Warum nicht `crews.length + 1`.** Nach dem Löschen der zweiten von drei Crews wäre die Länge 2
 * — und `crew-2` schon vergeben. Die Kennung ist der Modellname; eine doppelte wäre ein Konflikt,
 * den der Server erst beim Speichern meldet.
 *
 * @param crews - die vorhandenen Crews
 * @returns eine noch nicht benutzte Kennung
 */
function freieKennung(crews: readonly Entwurfcrew[]): string {
  let nummer = 1
  while (crews.some((crew) => crew.id === `crew-${String(nummer)}`)) nummer += 1
  return `crew-${String(nummer)}`
}

/**
 * Das Panel.
 *
 * @param props - `close` aus dem Slot, `t` aus dem Namensraum
 * @returns das Panel
 */
export function CrewPanel({ close, t, sprache }: Props): ReactElement {
  const [sicht, setSicht] = useState<Sicht | null>(null)
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [befunde, setBefunde] = useState<readonly string[]>([])
  const [arbeitet, setArbeitet] = useState(false)
  const [gespeichert, setGespeichert] = useState<string | null>(null)
  const [wege, setWege] = useState<readonly Weg[]>([])

  /** Die aktive Sprache — der Host antwortet darin. */
  const spracheJetzt = useCallback((): string => {
    try {
      return sprache() === '' ? 'en' : sprache()
    } catch {
      return 'en'
    }
  }, [sprache])

  /**
   * Der Katalog der Routen und Modelle.
   *
   * **Warum getrennt vom Stand.** Er gehört dem Host, nicht dem Konto, und kann langsam sein
   * (jeder Anbieter wird gefragt). Scheitert er, bleiben die Felder freie Eingabe — ein Ausfall
   * des Katalogs darf das Binden einer Rolle nicht verhindern.
   */
  useEffect(() => {
    let ab = false
    hole<Katalog>(WEG_KATALOG, spracheJetzt())
      .then((katalog) => {
        if (!ab) setWege(katalog.wege)
      })
      .catch(() => {
        if (!ab) setWege([])
      })
    return () => {
      ab = true
    }
  }, [spracheJetzt])

  const lade = useCallback(async (): Promise<void> => {
    setFehler(null)
    setBefunde([])
    try {
      const stand = await hole<Sicht>(WEG, spracheJetzt())
      setSicht(stand)
      setEntwurf(entwurfAus(stand))
    } catch (grund) {
      setFehler(grund instanceof Error ? grund.message : String(grund))
    }
  }, [spracheJetzt])

  useEffect(() => {
    void lade()
  }, [lade])

  /**
   * Ob der Entwurf vom gespeicherten Stand abweicht.
   *
   * **Warum sichtbar.** „Crew entfernen" ändert zuerst den Entwurf; gespeichert wird mit
   * **Speichern**. Ohne diese Marke sieht ein Klick wie ein Datenverlust aus, der keiner ist — und
   * ein vergessenes Speichern wie eine kaputte Funktion.
   */
  const ungespeichert =
    sicht !== null &&
    entwurf !== null &&
    JSON.stringify(rumpfAus(entwurf)) !== JSON.stringify(rumpfAus(entwurfAus(sicht)))

  const beimSpeichern = useCallback(async (): Promise<void> => {
    if (entwurf === null) return
    setArbeitet(true)
    setFehler(null)
    setBefunde([])
    try {
      const stand = await schicke<Sicht>(WEG, rumpfAus(entwurf), spracheJetzt())
      setSicht(stand)
      setEntwurf(entwurfAus(stand))
      setGespeichert(new Date().toLocaleTimeString())
    } catch (grund) {
      if (grund instanceof Serverfehler) {
        setFehler(grund.message)
        setBefunde(grund.befunde)
      } else {
        setFehler(grund instanceof Error ? grund.message : String(grund))
      }
    } finally {
      setArbeitet(false)
    }
  }, [entwurf, spracheJetzt])

  const aendere = useCallback((aenderung: (alt: Entwurf) => Entwurf): void => {
    setEntwurf((alt) => (alt === null ? alt : aenderung(alt)))
    setGespeichert(null)
  }, [])

  const setzeCrew = useCallback(
    (index: number, feld: Partial<Entwurfcrew>): void => {
      aendere((alt) => ({
        ...alt,
        crews: alt.crews.map((crew, i) => (i === index ? { ...crew, ...feld } : crew)),
      }))
    },
    [aendere],
  )

  const setzeRolle = useCallback(
    (crewIndex: number, rollenIndex: number, feld: Partial<Entwurfrolle>): void => {
      aendere((alt) => ({
        ...alt,
        crews: alt.crews.map((crew, i) =>
          i === crewIndex
            ? { ...crew, rollen: crew.rollen.map((rolle, r) => (r === rollenIndex ? { ...rolle, ...feld } : rolle)) }
            : crew,
        ),
      }))
    },
    [aendere],
  )

  const freieRolle = (crew: Entwurfcrew): string =>
    ROLLEN.find((rolle) => !crew.rollen.some((eintrag) => eintrag.rolle === rolle)) ?? 'helper'

  const plan = sicht?.plan ?? null

  return (
    <div className="pmh-cr">
      <header className="pmh-cr__head">
        <div className="pmh-cr__brand">
          <CrewIcon size={22} />
          <div className="pmh-cr__brandtext">
            <span className="pmh-cr__kicker">{t('kicker')}</span>
            <h2 className="pmh-cr__title">{t('title')}</h2>
          </div>
        </div>
        <div className="pmh-cr__actions">
          {gespeichert !== null && <span className="pmh-cr__marke pmh-cr__marke--gut">{t('saved')}</span>}
          {ungespeichert && <span className="pmh-cr__marke">{t('unsaved')}</span>}
          <button className="pmh-cr__btn pmh-cr__btn--ghost" type="button" onClick={() => void lade()}>
            {t('refresh')}
          </button>
          <button
            className="pmh-cr__btn pmh-cr__btn--primary"
            type="button"
            disabled={arbeitet || entwurf === null || sicht?.art === 'datei'}
            onClick={() => void beimSpeichern()}
          >
            {arbeitet ? t('saving') : t('save')}
          </button>
          <button className="pmh-cr__btn pmh-cr__btn--ghost" type="button" onClick={close}>
            {t('close')}
          </button>
        </div>
      </header>

      {fehler !== null && (
        <div className="pmh-cr__fehler" role="alert">
          <span>{fehler}</span>
          {befunde.length > 0 && (
            <ul>
              {befunde.map((befund) => (
                <li key={befund}>{befund}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sicht === null && fehler === null && (
        <div className="pmh-cr__body">
          <div className="pmh-cr__skelett" aria-busy="true" aria-label={t('loading')}>
            <i />
            <i />
            <i />
          </div>
          <p className="pmh-cr__still">{t('loading')}</p>
        </div>
      )}

      {sicht !== null && entwurf !== null && (
        <div className="pmh-cr__body">
          {sicht.hinweis !== undefined && (
            <div className="pmh-cr__hinweis">
              <strong>{t('fileMode')}</strong>
              <p>{t('fileModeHint')}</p>
              <small>{sicht.hinweis}</small>
            </div>
          )}

          <section className="pmh-cr__abschnitt" aria-labelledby="pmh-cr-crews">
            <div className="pmh-cr__abschnittkopf">
              <h3 id="pmh-cr-crews">{t('roles')}</h3>
              <span className="pmh-cr__zahl">{entwurf.crews.length}</span>
              {/* **Der Ablauf steht neben der Handlung.** Wer „Crew entfernen" drückt, sieht die
                  Karte verschwinden; ohne diesen Satz sieht der nächste Blick wie Datenverlust aus. */}
              <small>{t('manageHint')}</small>
            </div>

            {entwurf.crews.length === 0 && <p className="pmh-cr__leer">{t('noCrews')}</p>}

            <div className="pmh-cr__crews">
              {entwurf.crews.map((crew, crewIndex) => (
                <article className="pmh-cr__crew" key={`crew-${String(crewIndex)}`}>
                  <div className="pmh-cr__crewzeile">
                    <label className="pmh-cr__feld">
                      <span>{t('crewId')}</span>
                      <input
                        type="text"
                        value={crew.id}
                        spellCheck={false}
                        aria-describedby={`pmh-cr-id-hinweis-${String(crewIndex)}`}
                        onChange={(ereignis: ChangeEvent<HTMLInputElement>) =>
                          setzeCrew(crewIndex, { id: ereignis.target.value })
                        }
                      />
                      {/* **Warum es beides gibt.** Die Kennung ist der Name, den das Modell im
                          Wähler trägt; der Anzeigename ist die Bequemlichkeit darüber. */}
                      <small id={`pmh-cr-id-hinweis-${String(crewIndex)}`}>{t('crewIdHint')}</small>
                    </label>
                    <label className="pmh-cr__feld">
                      <span>{t('crewName')}</span>
                      <input
                        type="text"
                        value={crew.name}
                        placeholder={t('crewNameHint')}
                        aria-describedby={`pmh-cr-name-hinweis-${String(crewIndex)}`}
                        onChange={(ereignis: ChangeEvent<HTMLInputElement>) =>
                          setzeCrew(crewIndex, { name: ereignis.target.value })
                        }
                      />
                      <small id={`pmh-cr-name-hinweis-${String(crewIndex)}`}>{t('crewNameHint')}</small>
                    </label>
                    <label className="pmh-cr__vorgabe">
                      <input
                        type="radio"
                        name="crew-standard"
                        checked={entwurf.standard === crew.id}
                        onChange={() => aendere((alt) => ({ ...alt, standard: crew.id }))}
                      />
                      <span>{t('standard')}</span>
                    </label>
                    <div className="pmh-cr__crewaktionen">
                      <button
                        className="pmh-cr__btn pmh-cr__btn--klein"
                        type="button"
                        onClick={() =>
                          aendere((alt) => ({
                            ...alt,
                            crews: [
                              ...alt.crews,
                              {
                                // Eine Kopie bekommt eine **neue** Kennung: sie ist der Modellname.
                                id: freieKennung(alt.crews),
                                name: crew.name === '' ? '' : `${crew.name} (Kopie)`,
                                rollen: crew.rollen.map((rolle) => ({ ...rolle })),
                              },
                            ],
                          }))
                        }
                      >
                        {t('duplicate')}
                      </button>
                      {/* **Auch die letzte Crew darf gehen.** Vorher war der Knopf bei genau einer
                          Crew abgeschaltet — und damit war „löschen" unerreichbar. Der leere Zustand
                          sagt, was dann zu tun ist. */}
                      <button
                        className="pmh-cr__btn pmh-cr__btn--klein"
                        type="button"
                        onClick={() =>
                          aendere((alt) => {
                            const crews = alt.crews.filter((_, i) => i !== crewIndex)
                            return {
                              ...alt,
                              crews,
                              standard: alt.standard === crew.id ? (crews[0]?.id ?? null) : alt.standard,
                            }
                          })
                        }
                      >
                        {t('removeCrew')}
                      </button>
                    </div>
                  </div>

                  <div className="pmh-cr__rollen">
                    {crew.rollen.map((rolle, rollenIndex) => (
                      <div className="pmh-cr__rolle" key={`r-${String(crewIndex)}-${String(rollenIndex)}`}>
                        <select
                          aria-label={t('role')}
                          value={rolle.rolle}
                          onChange={(ereignis: ChangeEvent<HTMLSelectElement>) =>
                            setzeRolle(crewIndex, rollenIndex, { rolle: ereignis.target.value })
                          }
                        >
                          {/* **Eine unbekannte Rolle bleibt sichtbar.** Sie kann aus einer
                              älteren Datei oder aus einem `curl` stammen; ein Auswahlfeld, das
                              sie still auf die erste bekannte Rolle zieht, würde beim nächsten
                              Speichern eine andere Crew schreiben als die gelesene. */}
                          {(ROLLEN.includes(rolle.rolle as (typeof ROLLEN)[number])
                            ? ROLLEN
                            : [rolle.rolle, ...ROLLEN]
                          ).map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={t('route')}
                          value={rolle.familie}
                          onChange={(ereignis: ChangeEvent<HTMLSelectElement>) =>
                            setzeRolle(crewIndex, rollenIndex, { familie: ereignis.target.value })
                          }
                        >
                          {/* **Der eigene Wert steht immer zur Wahl.** Ein Katalog, der ihn nicht
                              (mehr) kennt, darf die Zeile nicht auf einen anderen Anbieter
                              umschreiben. */}
                          {(rolle.familie === '' || wege.some((weg) => weg.id === rolle.familie)
                            ? []
                            : [{ id: rolle.familie, name: rolle.familie }]
                          ).map((weg) => (
                            <option key={weg.id} value={weg.id}>
                              {weg.name === rolle.familie ? rolle.familie : `${weg.name} · ${weg.id}`}
                            </option>
                          ))}
                          {rolle.familie === '' && <option value="">{t('route')}</option>}
                          {/* **Die Crew-Route wird nicht angeboten.** Sie ist der Punkt, an dem
                              eine Crew sich selbst als Modell wählen würde. */}
                          {wege
                            .filter((weg) => weg.id !== CREW_ROUTE)
                            .map((weg) => (
                              <option key={weg.id} value={weg.id}>
                                {weg.name === weg.id ? weg.id : `${weg.name} · ${weg.id}`}
                              </option>
                            ))}
                        </select>
                        {/* **Freitext mit Vorschlägen.** Ein Auswahlfeld ersetzt das Tippen
                            nicht: Bei hunderten Modellen ist eine Liste ohne Suche unbrauchbar.
                            Die Vorschläge kommen aus dem Katalog dieser Route; die Crew-Route
                            bleibt ausgenommen, weil ihre „Modelle" Crews sind. */}
                        <input
                          type="text"
                          aria-label={t('model')}
                          placeholder={t('model')}
                          value={rolle.modell}
                          spellCheck={false}
                          list={`pmh-cr-modell-${String(crewIndex)}-${String(rollenIndex)}`}
                          onChange={(ereignis: ChangeEvent<HTMLInputElement>) =>
                            setzeRolle(crewIndex, rollenIndex, { modell: ereignis.target.value })
                          }
                        />
                        <datalist id={`pmh-cr-modell-${String(crewIndex)}-${String(rollenIndex)}`}>
                          {modelleDerRoute(wege, rolle.familie).map((modell) => (
                            <option key={modell.id} value={modell.id}>
                              {modell.name}
                            </option>
                          ))}
                        </datalist>
                        <button
                          className="pmh-cr__btn pmh-cr__btn--klein"
                          type="button"
                          aria-label={t('removeRole')}
                          onClick={() =>
                            setzeCrew(crewIndex, {
                              rollen: crew.rollen.filter((_, r) => r !== rollenIndex),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="pmh-cr__btn pmh-cr__btn--klein"
                      type="button"
                      onClick={() =>
                        setzeCrew(crewIndex, {
                          rollen: [
                            ...crew.rollen,
                            { rolle: freieRolle(crew), familie: 'deepseek-official', modell: '' },
                          ],
                        })
                      }
                    >
                      + {t('addRole')}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <button
              className="pmh-cr__btn"
              type="button"
              disabled={entwurf.crews.length >= 32}
              onClick={() =>
                aendere((alt) => {
                  const crews = [...alt.crews, { ...neueCrew(1), id: freieKennung(alt.crews) }]
                  return {
                    ...alt,
                    crews,
                    standard: alt.standard ?? crews[0]?.id ?? null,
                  }
                })
              }
            >
              + {t('addCrew')}
            </button>
          </section>

          <section className="pmh-cr__abschnitt" aria-labelledby="pmh-cr-settings">
            <div className="pmh-cr__abschnittkopf">
              <h3 id="pmh-cr-settings">{t('settings')}</h3>
            </div>
            <div className="pmh-cr__einstellungen">
              <label className="pmh-cr__feld pmh-cr__feld--breit">
                <span>{t('project')}</span>
                <input
                  type="text"
                  value={entwurf.projekt}
                  spellCheck={false}
                  placeholder={t('projectPlaceholder')}
                  onChange={(ereignis: ChangeEvent<HTMLInputElement>) =>
                    aendere((alt) => ({ ...alt, projekt: ereignis.target.value }))
                  }
                />
                <small>{t('projectHint')}</small>
              </label>
              <label className="pmh-cr__vorgabe">
                <input
                  type="checkbox"
                  checked={entwurf.aktiv}
                  onChange={(ereignis: ChangeEvent<HTMLInputElement>) =>
                    aendere((alt) => ({ ...alt, aktiv: ereignis.target.checked }))
                  }
                />
                <span>
                  {t('active')}
                  <small>{t('activeHint')}</small>
                </span>
              </label>
            </div>
          </section>

          <section className="pmh-cr__abschnitt" aria-labelledby="pmh-cr-betrieb">
            <div className="pmh-cr__abschnittkopf">
              <h3 id="pmh-cr-betrieb">{t('operation')}</h3>
            </div>
            <dl className="pmh-cr__daten">
              <dt>{t('billedTo')}</dt>
              <dd>
                {sicht.betrieb.nutzer === null ? t('noAccount') : sicht.betrieb.nutzer}
                {' · '}
                {sicht.betrieb.werkzeuge ? t('toolsOn') : t('toolsOff')}
                {sicht.betrieb.grund === undefined ? '' : ` (${sicht.betrieb.grund})`}
              </dd>
              <dt>{t('planRoot')}</dt>
              <dd className="pmh-cr__pfad">{sicht.betrieb.verzeichnis}</dd>
              {gespeichert !== null && (
                <>
                  <dt>{t('status')}</dt>
                  <dd>
                    {t('saved')} {gespeichert}
                  </dd>
                </>
              )}
            </dl>
          </section>

          <section className="pmh-cr__abschnitt" aria-labelledby="pmh-cr-plan">
            <div className="pmh-cr__abschnittkopf">
              <h3 id="pmh-cr-plan">{t('plan')}</h3>
              {plan !== null && <span className="pmh-cr__zahl">{plan.crew}</span>}
            </div>
            {plan === null || plan.rollen.length === 0 ? (
              <p className="pmh-cr__leer">{t('planEmpty')}</p>
            ) : (
              <div className="pmh-cr__plan">
                {plan.rollen.map((rolle) => (
                  <article className="pmh-cr__planrolle" key={rolle.rolle}>
                    <h4>{rolle.rolle}</h4>
                    {rolle.ziel !== undefined && (
                      <p className="pmh-cr__ziel">
                        <span>{t('goal')}</span> {rolle.ziel.text} <small>{rolle.ziel.stand}</small>
                      </p>
                    )}
                    <ul>
                      {rolle.aufgaben.length === 0 && <li className="pmh-cr__still">{t('noTasks')}</li>}
                      {rolle.aufgaben.map((aufgabe, index) => (
                        <li key={`${rolle.rolle}-${String(index)}`} className={`is-${aufgabe.stand}`}>
                          <span>{aufgabe.text}</span>
                          <small>{aufgabe.stand}</small>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* **Die Aktionen am Ende des Inhalts.** Der Kopf scrollt in engen Behältern aus dem Bild;
              wer unten am Plan ankommt, soll nicht nach oben zurückscrollen müssen, um zu speichern. */}
          <div className="pmh-cr__fussleiste">
            <span className="pmh-cr__fussleiste-text">
              {ungespeichert ? t('unsaved') : gespeichert !== null ? t('saved') : ''}
            </span>
            <button className="pmh-cr__btn pmh-cr__btn--ghost" type="button" onClick={() => void lade()}>
              {t('refresh')}
            </button>
            <button
              className="pmh-cr__btn pmh-cr__btn--primary"
              type="button"
              disabled={arbeitet || sicht?.art === 'datei'}
              onClick={() => void beimSpeichern()}
            >
              {arbeitet ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Drei verbundene Punkte — Rollen, die zusammenarbeiten. */
export function CrewIcon({ size = 20 }: { readonly size?: number }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="5.5" r="2.6" />
      <circle cx="5.5" cy="17" r="2.6" />
      <circle cx="18.5" cy="17" r="2.6" />
      <path d="M10.3 7.7 7.2 14.6M13.7 7.7l3.1 6.9M8.1 17h7.8" />
    </svg>
  )
}

/**
 * **Die Crew-Einstellungen — als Seite unter „Plugins".**
 *
 * ## Warum hier und nicht mehr nur im Panel
 *
 * Die Konfiguration eines Plugins gehört dorthin, wo Plugins konfiguriert werden: in die
 * Einstellungen, Seite **Plugins** (Slot `settings.plugins.tab`). Das Panel bleibt die Arbeit
 * (Rollen binden, Plan sehen); diese Seite ist der Ort für „welche Crew ist die Vorgabe?", „welches
 * Projekt?", „bedient der Host sie?".
 *
 * ## Warum derselbe Weg wie im Panel
 *
 * Geladen, geändert und **als Ganzes** geschrieben wird über `entwurfAus`/`rumpfAus` — dieselbe
 * Prüfung wie im Panel, nur mit weniger Feldern. Ein zweiter Speicherweg mit eigenen Regeln wäre
 * eine zweite Wahrheit über dasselbe Dokument.
 *
 * @param props - Texte und die aktive Sprache
 * @returns die Seite
 */
function CrewSettings({ t, sprache }: { readonly t: TranslateNS<'crew'>; readonly sprache: () => string }): ReactElement {
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laden, setLaden] = useState(true)
  const [arbeitet, setArbeitet] = useState(false)
  const [gespeichert, setGespeichert] = useState(false)

  useEffect(() => {
    let ab = false
    setLaden(true)
    hole<Sicht>(WEG, sprache())
      .then((sicht) => {
        if (ab) return
        setEntwurf(entwurfAus(sicht))
        setLaden(false)
      })
      .catch((problem: unknown) => {
        if (ab) return
        setFehler(problem instanceof Error ? problem.message : String(problem))
        setLaden(false)
      })
    return () => {
      ab = true
    }
  }, [sprache])

  const aendere = useCallback((aenderung: (alt: Entwurf) => Entwurf): void => {
    setGespeichert(false)
    setEntwurf((alt) => (alt === null ? alt : aenderung(alt)))
  }, [])

  const speichern = useCallback(async (): Promise<void> => {
    const aktuell = entwurf
    if (aktuell === null) return
    setArbeitet(true)
    setFehler(null)
    try {
      const sicht = await schicke<Sicht>(WEG, rumpfAus(aktuell), sprache())
      setEntwurf(entwurfAus(sicht))
      setGespeichert(true)
    } catch (problem) {
      setFehler(
        problem instanceof Serverfehler
          ? [problem.message, ...problem.befunde].filter((zeile) => zeile !== '').join(' · ')
          : problem instanceof Error
            ? problem.message
            : String(problem),
      )
    } finally {
      setArbeitet(false)
    }
  }, [entwurf, sprache])

  if (laden) return <p className="pmh-cr__leer">{t('loading')}</p>
  if (entwurf === null) return <p className="pmh-cr__fehler">{fehler ?? t('error')}</p>

  return (
    <div className="pmh-cr__body">
      {entwurf.crews.length === 0 ? (
        <p className="pmh-cr__leer">{t('noCrews')}</p>
      ) : (
        <div className="pmh-cr__einstellungen">
          <label className="pmh-cr__feld">
            <span>{t('standard')}</span>
            <select
              value={entwurf.standard ?? ''}
              onChange={(ereignis: ChangeEvent<HTMLSelectElement>) =>
                aendere((alt) => ({
                  ...alt,
                  standard: ereignis.target.value === '' ? null : ereignis.target.value,
                }))
              }
            >
              {entwurf.crews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.name === '' ? crew.id : crew.name}
                </option>
              ))}
            </select>
            <small>{t('standardHint')}</small>
          </label>
          <label className="pmh-cr__feld pmh-cr__feld--breit">
            <span>{t('project')}</span>
            <input
              type="text"
              value={entwurf.projekt}
              spellCheck={false}
              placeholder={t('projectPlaceholder')}
              onChange={(ereignis: ChangeEvent<HTMLInputElement>) =>
                aendere((alt) => ({ ...alt, projekt: ereignis.target.value }))
              }
            />
            <small>{t('projectHint')}</small>
          </label>
          <label className="pmh-cr__vorgabe">
            <input
              type="checkbox"
              checked={entwurf.aktiv}
              onChange={(ereignis: ChangeEvent<HTMLInputElement>) =>
                aendere((alt) => ({ ...alt, aktiv: ereignis.target.checked }))
              }
            />
            <span>
              {t('active')}
              <small>{t('activeHint')}</small>
            </span>
          </label>
        </div>
      )}
      {fehler !== null && <p className="pmh-cr__fehler">{fehler}</p>}
      <div className="pmh-cr__actions">
        <button
          type="button"
          className="pmh-cr__btn"
          disabled={arbeitet || entwurf.crews.length === 0}
          onClick={() => void speichern()}
        >
          {arbeitet ? t('saving') : t('save')}
        </button>
        {gespeichert && <span className="pmh-cr__leer">{t('saved')}</span>}
      </div>
    </div>
  )
}

/**
 * Die Karte in der Plugin-Liste — der zweite Ort, den ein Plugin nehmen kann.
 *
 * **Was hier steht und warum.** Der Plugin-Manager fragt eine Anmeldung in `plugins.item` zweimal:
 * einmal für die **Kurzfassung** in der Liste (`view: 'summary'`) und einmal für den **Rumpf** der
 * eigenen Seite (`view: 'page'`). Die Kurzfassung ist eine Zeile; der Rumpf ist dasselbe Panel wie
 * im Hauptfeld — nicht eine zweite Anzeige, sondern dieselbe an einem zweiten Ort.
 *
 * **Was hier bewusst nicht steht.** Kein eigener Speichern-Knopf: das Panel bringt seinen mit, und
 * die Anzeige selbst wird in den Einstellungen des Eintrags geändert — dort, wo die `Config` liegt,
 * und nicht in einer zweiten Steuerung daneben.
 *
 * **Warum `close` und `sprache` mitkommen.** `CrewPanel` braucht beide; die Anmeldung reicht sie
 * über `inject` durch, genau wie die des `main`-Slots.
 */
function CrewItem({ view, t, close, sprache }: PluginConfigViewProps & Props): ReactElement {
  if (view === 'summary') return <span className="pmh-cr__marke">{t('panel')}</span>
  return <CrewPanel close={close} t={t} sprache={sprache} />
}

/**
 * Hängt das Panel ein — dieselbe Form wie Konten und Verbrauch.
 *
 * @param ctx - der Client-Kontext
 */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)
  // **Englisch zuerst, Deutsch danach.** Die englische Fassung ist die vollständige; Deutsch ist
  // gegen ihre Schlüssel typisiert (siehe `locales.ts`), eine fehlende Übersetzung wäre ein
  // Übersetzungsfehler und kein stiller Rückfall.

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pmhCrew = ''
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'crew: Stil')

  const close = (): void => {
    ctx.layout.selectPanel(null)
  }

  /**
   * Die aktive Sprache der Oberfläche.
   *
   * **Warum die Oberfläche sie mitschickt.** Der Host kann sie nicht raten: `Accept-Language`
   * beschreibt den Browser, nicht die Wahl im Sprachpaket. Der Server antwortet in dieser Sprache
   * (`?sprache=`), und sein Vorgabewert ist Englisch.
   */
  const sprache = (): string => {
    try {
      return ctx.locale.getLocale().active
    } catch {
      return 'en'
    }
  }

  /*
   * **Die Texte kommen jetzt aus dem Sprachpaket.**
   *
   * Hier standen zwei `ctx.locale.register`-Aufrufe. Sie sind entfallen, weil
   * `@prometheus-harness/client-locale` denselben Namensraum anmeldet — und der Kern läßt je
   * (Namensraum, Sprache) **genau einen** Eigentümer zu: eine zweite Anmeldung wirft beim Laden.
   * Die Quelle bleibt `locale/de.json`/`locale/en.json` in diesem Paket; sie wird von
   * `scripts/language-merge.mjs` ins Sprachpaket übernommen.
   */
  ctx.slots.inject('main', function* () {
    yield ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ close, sprache }),
      },
      CrewPanel,
    )
  })

  /*
   * **Die Anzeige kommt jetzt aus den Einstellungen.**
   *
   * Vorher stand hier `order: 14` fest und `sidebar.panellist` wurde immer angemeldet. Jetzt liest
   * dieser Block den Eintrag `pmh-crew` über `configForms` und meldet **je nach `surface`** an: die
   * Seitenleiste, die Karte in der Plugin-Liste, oder beides — oder nichts.
   *
   * **Warum neu angemeldet statt nur umgeschaltet.** `order` ist Teil der Anmeldung; ein Eintrag mit
   * geänderter Reihenfolge ist ein anderer Eintrag. Deshalb wird bei jeder Änderung abgemeldet und
   * neu angemeldet — aber nur, wenn sich der **Wirkschlüssel** wirklich geändert hat, sonst würde
   * jeder Schnappschuss des Hosts die Oberfläche neu bauen.
   *
   * **Keine Start-Kachel.** Dieses Plugin meldet keine an; es gibt deshalb weder ein `guide`-Feld
   * noch eine Anmeldung, die davon abhinge.
   */
  ctx.effect(() => {
    const form = ctx.configForms.get<DisplayConfig>(ENTRY_ID)
    let abgemeldet: (() => void)[] = []
    let zuletzt = ''

    const anmelden = (): void => {
      const anzeige = liesAnzeige(form.getSnapshot().value)
      const schluessel = JSON.stringify(anzeige)
      if (schluessel === zuletzt) return
      zuletzt = schluessel

      for (const ab of abgemeldet) ab()
      abgemeldet = []

      const titel = (): string => anzeige.beschriftung ?? t('panel')

      if (anzeige.oberflaeche === 'sidebar' || anzeige.oberflaeche === 'both') {
        abgemeldet.push(
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: anzeige.reihenfolge,
                label: titel,
                locale: NS,
              },
              CrewIcon,
            ),
          ),
        )
      }

      if (anzeige.oberflaeche === 'plugins' || anzeige.oberflaeche === 'both') {
        abgemeldet.push(
          ctx.slots.inject('plugins.item', () =>
            ctx.slots.register(
              {
                name: 'plugins.item',
                id: PANEL_ID,
                order: anzeige.reihenfolge,
                label: titel,
                locale: NS,
                inject: () => ({ close, sprache }),
              },
              CrewItem,
            ),
          ),
        )
      }
    }

    anmelden()
    const abhoeren = form.subscribe(anmelden)
    return () => {
      abhoeren()
      for (const ab of abgemeldet) ab()
      abgemeldet = []
    }
  }, 'crew: Anzeige nach den Einstellungen')

  // **Die Konfiguration liegt bei den Plugins, nicht in einem eigenen Abschnitt.** Der
  // Plugin-Manager (`ui-settings-plugins`) stellt `settings.plugins.tab` bereit; jeder Eintrag dort
  // ist ein Tab der Seite „Plugins".
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      {
        name: 'settings.plugins.tab',
        id: PLUGIN_ID,
        order: 30,
        label: () => t('settingsTab'),
        locale: NS,
        inject: () => ({ sprache }),
      },
      CrewSettings,
    ),
  )
}

const CSS = `
.pmh-cr{
  --cr-bg:#0a0b0d; --cr-panel:#0f1014; --cr-card:#15161b; --cr-card-2:#1a1b22;
  --cr-line:rgba(255,255,255,.07); --cr-line-2:rgba(255,255,255,.13);
  --cr-text:#eef0f5; --cr-muted:rgba(238,240,245,.56); --cr-faint:rgba(238,240,245,.34);
  --cr-gold:#e9c68f; --cr-gold-soft:rgba(233,198,143,.12);
  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
  background:
    radial-gradient(90% 60% at 12% -10%,rgba(233,198,143,.07) 0%,transparent 60%),
    radial-gradient(70% 50% at 100% 0%,rgba(120,160,220,.05) 0%,transparent 55%),
    var(--cr-bg);
  color:var(--cr-text);
  font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.pmh-cr *{box-sizing:border-box}
.pmh-cr :focus-visible{outline:2px solid rgba(233,198,143,.75);outline-offset:2px}

/* ---------- Kopf ---------- */
.pmh-cr__head{
  position:sticky;top:0;z-index:5;flex:none;
  display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px;
  padding:16px 24px;border-bottom:1px solid var(--cr-line);
  background:color-mix(in srgb,var(--cr-bg) 82%,transparent);
  backdrop-filter:blur(12px) saturate(120%);
}
.pmh-cr__brand{display:flex;align-items:center;gap:12px;min-width:0}
.pmh-cr__brandtext{min-width:0;display:flex;flex-direction:column;gap:2px}
.pmh-cr__kicker{
  font:600 9.5px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.16em;text-transform:uppercase;color:var(--cr-faint);
}
.pmh-cr__title{
  margin:0;font-size:19px;font-weight:600;letter-spacing:-.015em;line-height:1.2;
  text-wrap:balance;
}
.pmh-cr__actions{display:flex;align-items:center;gap:8px}
.pmh-cr__marke{
  display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;
  border:1px solid rgba(233,198,143,.35);background:rgba(233,198,143,.1);
  color:#f0d3a4;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;
}
.pmh-cr__marke--gut{border-color:rgba(120,220,170,.32);background:rgba(120,220,170,.1);color:#a7e7c6}

/* ---------- Knöpfe ---------- */
.pmh-cr__btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  height:34px;padding:0 14px;border-radius:10px;cursor:pointer;
  border:1px solid var(--cr-line-2);background:var(--cr-card-2);color:var(--cr-text);
  font:500 13px/1 inherit;letter-spacing:.005em;white-space:nowrap;
  transition:background .16s ease,border-color .16s ease,transform .12s ease,color .16s ease;
}
.pmh-cr__btn:hover{background:#22232b;border-color:rgba(255,255,255,.2)}
.pmh-cr__btn:active{transform:scale(.98)}
.pmh-cr__btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
.pmh-cr__btn--primary{
  background:var(--cr-gold);border-color:transparent;color:#1b1608;font-weight:600;
  box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 6px 18px rgba(233,198,143,.16);
}
.pmh-cr__btn--primary:hover{background:#f0d2a4;border-color:transparent}
.pmh-cr__btn--ghost{background:transparent;border-color:var(--cr-line-2)}
.pmh-cr__btn--ghost:hover{background:rgba(255,255,255,.05)}
.pmh-cr__btn--klein{height:30px;padding:0 10px;font-size:12px;border-radius:9px}

/* ---------- Körper ---------- */
.pmh-cr__body{
  flex:1;min-height:0;overflow:auto;padding:24px;
  display:flex;flex-direction:column;gap:18px;
  scrollbar-color:rgba(255,255,255,.16) transparent;
}
.pmh-cr__body>*{width:100%;max-width:1120px;margin-inline:auto}

/* ---------- Abschnitt (Karte) ---------- */
.pmh-cr__abschnitt{
  border:1px solid var(--cr-line);border-radius:16px;
  background:linear-gradient(180deg,rgba(255,255,255,.022),transparent 42%),var(--cr-card);
  box-shadow:0 1px 0 rgba(255,255,255,.03) inset,0 18px 40px -28px rgba(0,0,0,.9);
  padding:18px 20px 20px;
}
.pmh-cr__abschnittkopf{display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin-bottom:14px}
.pmh-cr__abschnittkopf h3{
  margin:0;display:flex;align-items:center;gap:9px;
  font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--cr-muted);
}
.pmh-cr__zahl{
  display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:19px;padding:0 6px;
  border-radius:999px;background:var(--cr-gold-soft);color:var(--cr-gold);
  font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;
}
.pmh-cr__abschnittkopf small{color:var(--cr-faint);font-size:11.5px}

/* ---------- Crew-Karten ---------- */
.pmh-cr__crews{display:flex;flex-direction:column;gap:14px}
.pmh-cr__crew{
  border:1px solid var(--cr-line);border-radius:14px;background:var(--cr-card-2);
  padding:14px;
}
.pmh-cr__crewzeile{
  display:grid;grid-template-columns:132px minmax(0,300px) auto auto;
  gap:12px;align-items:end;justify-content:start;
}
.pmh-cr__crewzeile>.pmh-cr__feld{min-width:0}
.pmh-cr__crewaktionen{display:flex;gap:6px;align-items:center}
.pmh-cr__rollen{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.pmh-cr__rolle{
  display:grid;grid-template-columns:150px minmax(0,1fr) minmax(0,1.5fr) 32px;
  gap:8px;align-items:center;
  padding:8px;border:1px solid var(--cr-line);border-radius:11px;background:rgba(0,0,0,.18);
}
.pmh-cr__rolle:hover{border-color:var(--cr-line-2)}

/* ---------- Felder ---------- */
.pmh-cr__feld{display:flex;flex-direction:column;gap:5px;min-width:0}
.pmh-cr__feld--breit{flex:1 1 320px}
.pmh-cr__feld>span{
  font:600 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.1em;text-transform:uppercase;color:var(--cr-faint);
}
.pmh-cr__feld>small{color:var(--cr-faint);font-size:11px;line-height:1.45}
.pmh-cr input[type=text],
.pmh-cr select{
  height:34px;min-width:0;width:100%;padding:0 10px;
  border:1px solid var(--cr-line-2);border-radius:9px;
  background:var(--cr-panel);color:var(--cr-text);
  font:13px/1 inherit;
  transition:border-color .16s ease,box-shadow .16s ease,background .16s ease;
}
.pmh-cr input[type=text]::placeholder{color:var(--cr-faint)}
.pmh-cr input[type=text]:hover,
.pmh-cr select:hover{border-color:rgba(255,255,255,.2)}
.pmh-cr input[type=text]:focus,
.pmh-cr select:focus{
  outline:none;border-color:rgba(233,198,143,.6);
  box-shadow:0 0 0 3px rgba(233,198,143,.14);background:#101116;
}
.pmh-cr select{
  appearance:none;padding-right:30px;cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,var(--cr-faint) 50%),linear-gradient(135deg,var(--cr-faint) 50%,transparent 50%);
  background-position:calc(100% - 15px) 15px,calc(100% - 10px) 15px;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat;
}
.pmh-cr__rolle input[type=text]{height:32px}
.pmh-cr__rolle select{height:32px;background-color:rgba(0,0,0,.25)}
.pmh-cr__vorgabe{
  display:inline-flex;align-items:center;gap:8px;cursor:pointer;
  font-size:12px;color:var(--cr-muted);padding:6px 2px;
}
.pmh-cr__vorgabe input[type=checkbox]{
  width:16px;height:16px;accent-color:#e9c68f;cursor:pointer;flex:none;
}
.pmh-cr__vorgabe small{display:block;color:var(--cr-faint);font-size:10.5px;line-height:1.4}
.pmh-cr__einstellungen{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
.pmh-cr__einstellungen>.pmh-cr__feld{flex:1 1 260px}

/* ---------- Betrieb, Plan ---------- */
.pmh-cr__daten{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 18px;margin:0}
.pmh-cr__daten dt{color:var(--cr-faint);font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.pmh-cr__daten dd{
  margin:0;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:var(--cr-text);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;
}
.pmh-cr__pfad{
  display:block;margin-top:4px;color:var(--cr-faint);
  font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;
}
.pmh-cr__plan{display:flex;flex-direction:column;gap:12px}
.pmh-cr__planrolle{border:1px solid var(--cr-line);border-radius:12px;background:rgba(0,0,0,.16);padding:12px}
.pmh-cr__ziel{margin:0 0 6px;color:var(--cr-text);font-size:12.5px;line-height:1.5}
.pmh-cr__planrolle ul{margin:0;padding-left:16px;color:var(--cr-muted);font-size:12px;line-height:1.6}

/* ---------- Zustände ---------- */
.pmh-cr__leer{
  margin:0;padding:22px 18px;border:1px dashed var(--cr-line-2);border-radius:12px;
  color:var(--cr-faint);font-size:12.5px;text-align:center;text-wrap:pretty;
}
.pmh-cr__fehler{
  margin:0;padding:11px 14px;border:1px solid rgba(255,120,120,.28);border-radius:11px;
  background:rgba(255,90,90,.07);color:#ffb4b4;font-size:12.5px;line-height:1.5;
}
.pmh-cr__fehler ul{margin:6px 0 0;padding-left:18px}
.pmh-cr__hinweis{
  margin:0;padding:11px 14px;border:1px solid rgba(233,198,143,.28);border-radius:11px;
  background:rgba(233,198,143,.06);color:rgba(255,240,214,.8);font-size:12.5px;line-height:1.55;
}
.pmh-cr__hinweis strong{display:block;margin-bottom:3px;color:#ffe3ac;font-weight:600}
.pmh-cr__hinweis p{margin:0 0 5px}
.pmh-cr__hinweis small{font:10.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--cr-faint);word-break:break-all}
.pmh-cr__fussleiste{
  position:sticky;bottom:-24px;z-index:4;margin:4px auto -24px;
  display:flex;align-items:center;justify-content:flex-end;gap:8px;width:100%;max-width:1120px;
  padding:12px 24px;border-top:1px solid var(--cr-line);
  background:color-mix(in srgb,var(--cr-bg) 88%,transparent);backdrop-filter:blur(10px);
}
.pmh-cr__fussleiste-text{flex:1;color:var(--cr-faint);font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase}
.pmh-cr__still{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

/* ---------- Laden: Knochen statt Kreisel ---------- */
.pmh-cr__skelett{display:flex;flex-direction:column;gap:12px;padding:22px;border:1px solid var(--cr-line);border-radius:16px;background:var(--cr-card)}
.pmh-cr__skelett i{
  display:block;height:12px;border-radius:6px;
  background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.11),rgba(255,255,255,.05));
  background-size:200% 100%;animation:pmh-cr-schimmer 1.4s ease-in-out infinite;
}
.pmh-cr__skelett i:first-child{width:34%;height:16px}
.pmh-cr__skelett i:nth-child(2){width:72%}
.pmh-cr__skelett i:nth-child(3){width:58%}
@keyframes pmh-cr-schimmer{0%{background-position:140% 0}100%{background-position:-40% 0}}
@media (prefers-reduced-motion:reduce){
  .pmh-cr *{transition:none!important;animation:none!important}
}

/* ---------- Schmal ---------- */
@media (max-width:820px){
  .pmh-cr__head{padding:12px 14px;grid-template-columns:minmax(0,1fr);gap:10px}
  .pmh-cr__actions{justify-content:flex-start;flex-wrap:wrap}
  .pmh-cr__body{padding:14px}
  .pmh-cr__crewzeile{grid-template-columns:1fr 1fr}
  .pmh-cr__rolle{grid-template-columns:1fr 1fr;grid-auto-rows:min-content}
  .pmh-cr__rolle>button{justify-self:end}
  .pmh-cr__daten{grid-template-columns:1fr;gap:2px}
}
`

