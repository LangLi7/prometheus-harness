/**
 * Die Einstellungen — der Bildschirm.
 *
 * **Warum er ein Plugin ist und keine feste Flaeche.** Der Betreiber: „die könnte man in settings
 * implementieren fuer stuerung". Ein Einstellungsbildschirm, der fest im Kern steht, muesste den
 * Kern erweitern, sobald ein neues Plugin eine Einstellung mitbringt. Hier ist es umgekehrt:
 * dieses Plugin **liest** die Registry und malt, was es findet. Ein Plugin, das drei Zeilen
 * spaeter dazukommt, erscheint ohne eine Aenderung an dieser Datei — bis auf den Text, und der
 * kommt aus dem Sprachpaket.
 *
 * **Beschreibung und Anzeige sind getrennt.** Das Schema (Typ, Grenzen, Vorgabe) steht beim
 * Plugin, der Text im Sprachpaket, das Aussehen hier. Deshalb enthaelt diese Datei **keinen**
 * deutschen Satz und **keine** Grenze einer Einstellung.
 *
 * **Warum keine „Übernehmen"-Taste.** Jede Aenderung wirkt sofort. Ein Formular mit Senden-Knopf
 * verschiebt die Rueckmeldung an eine Stelle, an der man den Zusammenhang nicht mehr sieht — und
 * dann weiss niemand, welche der zwanzig Aenderungen die Ansicht kaputt gemacht hat.
 */
import type { Field, FieldValue, Settings } from './settings'
import { CATEGORIES, formatValue } from './settings'
import type { PluginRegistry, Plugin } from './plugins'
import type { Translator } from './i18n'
// Die Zeichen kommen aus EINER Quelle (packages/assets/icons) — keine Schriftzeichen mehr.
import { iconMarkup } from '@prometheus-harness/icons'

export interface SettingsScreenEnv {
  readonly settings: Settings
  readonly registry: PluginRegistry
  readonly t: () => Translator
  /** Wird nach jeder Aenderung gerufen — der Wirt wendet den Wert an. */
  readonly apply?: (key: string, value: FieldValue) => void
}

/**
 * Baut den Inhalt. **Wird erneut gerufen**, wenn sich etwas aendert — die Flaeche wird dann
 * vollstaendig neu gebaut.
 *
 * **Warum komplett neu und nicht fein aktualisiert.** Ein Einstellungsbildschirm wird beim
 * Aendern nicht „durchgeblättert" wie eine Liste mit hundert Zeilen; er passt auf einen Blick.
 * Ein Neuaufbau ist hier **richtig** und billig. Bei der Achsenanzeige war er falsch, weil sie
 * sich sechsmal in der Sekunde aendert — das ist der Unterschied, und er ist die Regel: neu
 * bauen, wo sich selten etwas aendert; Knoten behalten, wo sich staendig etwas aendert.
 */
export function mountSettings(host: HTMLElement, env: SettingsScreenEnv): void {
  host.replaceChildren()
  host.classList.add('settings')

  const { t, locale } = env.t()

  const kopf = document.createElement('div')
  kopf.className = 'set-kopf'
  const suche = document.createElement('input')
  suche.className = 'field'
  suche.type = 'search'
  suche.placeholder = t('panel.search')
  suche.setAttribute('aria-label', t('panel.search'))
  const zurueck = document.createElement('button')
  zurueck.type = 'button'
  zurueck.className = 'set-reset'
  zurueck.innerHTML = iconMarkup('chevron-left')
  zurueck.title = t('island.action.reset')
  kopf.append(suche, zurueck)
  host.appendChild(kopf)

  const liste = document.createElement('div')
  liste.className = 'set-liste'
  host.appendChild(liste)

  let filter = ''

  /**
   * Sichtbar ist, **was einen Text hat**.
   *
   * **Warum das die Regel ist und nicht eine Liste.** Eine Einstellung ohne Beschriftung kann man
   * nicht bedienen — sie waere eine Zeile mit leerem Namen und einem Schalter daneben. Manche Werte
   * sind aber **Marken** statt Vorlieben (`language.chosen`: „hat der Nutzer die Sprache selbst
   * gesetzt"). Solche tragen `internal: true` und erscheinen hier nicht; lesen und setzen lassen sie
   * sich weiterhin.
   *
   * Die Alternative waere eine Liste blinder Schluessel in diesem Bildschirm — und die waere bei
   * jeder neuen Marke zu pflegen.
   */
  const passt = (field: Field): boolean => {
    if (field.internal === true) return false
    if (filter === '') return true
    const heu = [
      field.key,
      t(`setting.${field.key}.label`),
      t(`setting.${field.key}.description`),
      t(`category.${field.category}`),
      ...(field.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase()
    return heu.includes(filter)
  }

  const malen = (): void => {
    liste.replaceChildren()
    let gezeigt = 0
    for (const category of CATEGORIES) {
      const felder = env.settings.inCategory(category).filter(passt)
      if (!felder.length) continue
      gezeigt += felder.length
      const gruppe = document.createElement('section')
      gruppe.className = 'set-grp'
      const titel = document.createElement('h4')
      titel.textContent = t(`category.${category}`)
      gruppe.appendChild(titel)
      for (const field of felder) gruppe.appendChild(zeile(field))
      liste.appendChild(gruppe)
    }
    if (gezeigt === 0) {
      const leer = document.createElement('p')
      leer.className = 'hint'
      leer.textContent = t('term.noHits', { query: filter })
      liste.appendChild(leer)
    }
  }

  const zeile = (field: Field): HTMLElement => {
    const row = document.createElement('div')
    row.className = 'set-row'
    row.dataset.key = field.key

    const links = document.createElement('div')
    links.className = 'set-text'
    const label = document.createElement('label')
    label.className = 'set-label'
    const id = `set-${field.key.replace(/\./g, '-')}`
    label.htmlFor = id
    label.textContent = t(`setting.${field.key}.label`)
    // Ein geaenderter Wert wird **gekennzeichnet**, nicht versteckt: sonst sucht man spaeter,
    // warum sich die Welt anders anfuehlt als beim ersten Start.
    if (env.settings.get(field.key, field.default) !== field.default) {
      const punkt = document.createElement('span')
      punkt.className = 'set-changed'
      punkt.textContent = '•'
      punkt.title = String(field.default)
      label.appendChild(punkt)
    }
    const desc = document.createElement('p')
    desc.className = 'set-desc'
    desc.textContent = t(`setting.${field.key}.description`)
    links.append(label, desc)
    row.appendChild(links)

    const rechts = document.createElement('div')
    rechts.className = 'set-ctl'
    row.appendChild(rechts)

    const melden = (value: FieldValue): void => {
      env.settings.set(field.key, value)
      env.apply?.(field.key, value)
      malen()
    }

    if (field.kind === 'boolean') {
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.id = id
      box.checked = env.settings.getBoolean(field.key, field.default)
      box.addEventListener('change', () => melden(box.checked))
      rechts.appendChild(box)
    } else if (field.kind === 'choice') {
      const select = document.createElement('select')
      select.id = id
      select.className = 'field'
      const aktuell = env.settings.getString(field.key, field.default)
      for (const option of field.options()) {
        const el = document.createElement('option')
        el.value = option.value
        /*
         * **Der Sprachschlüssel geht vor, das Etikett bleibt der Rückfall.**
         *
         * Ein Wert wie „Nur der Sternenhimmel" muss mit der Sprache wechseln; ein Eigenname wie `CAD`
         * nicht (siehe `ChoiceField.options` in `settings.ts`). Beides steht am selben Ort, und die
         * Oberfläche entscheidet nichts — sie liest nur.
         */
        el.textContent = option.labelKey === undefined ? option.label : t(option.labelKey)
        el.selected = option.value === aktuell
        select.appendChild(el)
      }
      select.addEventListener('change', () => melden(select.value))
      rechts.appendChild(select)
    } else {
      const wert = env.settings.getNumber(field.key, field.default)
      const regler = document.createElement('input')
      regler.type = 'range'
      regler.id = id
      regler.min = String(field.min)
      regler.max = String(field.max)
      regler.step = String(field.step)
      regler.value = String(wert)
      const zahl = document.createElement('input')
      zahl.type = 'number'
      zahl.className = 'set-zahl'
      zahl.min = String(field.min)
      zahl.max = String(field.max)
      zahl.step = String(field.step)
      zahl.value = String(wert)
      const anzeige = document.createElement('span')
      anzeige.className = 'set-wert'
      anzeige.textContent = formatValue(field, wert, locale)

      // **Zwei Bedienelemente, ein Wert.** Der Regler ist zum Fuehlen da (Drehen ist „zu fast"),
      // die Zahl zum Einstellen eines genauen Werts. Wer nur den Regler hat, trifft 0,00175 nie;
      // wer nur die Zahl hat, findet den Bereich nicht.
      const setzen = (value: number, nurZahl = false): void => {
        if (!nurZahl) regler.value = String(value)
        zahl.value = String(value)
        melden(value)
      }
      regler.addEventListener('input', () => setzen(Number(regler.value), true))
      zahl.addEventListener('change', () => {
        const value = Number(zahl.value)
        if (Number.isFinite(value)) setzen(value)
      })
      rechts.append(anzeige, regler, zahl)
    }

    return row
  }

  suche.addEventListener('input', () => {
    filter = suche.value.trim().toLowerCase()
    malen()
  })

  zurueck.addEventListener('click', () => {
    env.settings.resetAll()
    env.apply?.('*', 0)
    malen()
  })

  malen()
}

/**
 * Das Plugin `ui-settings`.
 *
 * Es steuert **nichts** bei ausser der Flaeche — die Einstellungen selbst kommen von den Plugins,
 * die sie beschreiben. Das ist die Trennung, die das Ganze tragfaehig macht: dieses Plugin kennt
 * keine einzige Einstellung.
 */
export function settingsPlugin(env: SettingsScreenEnv): Plugin {
  return {
    id: 'ui-settings',
    name: 'Einstellungen',
    version: '0.1.0',
    description: 'Zeigt die Einstellungen aller Plugins an einer Stelle an und schreibt sie zurück.',
    panel: {
      title: () => env.t().t('panel.settings'),
      /*
       * **Abgesteckt — wie alle Panels.** Der Betreiber will die Flächen **rufen**, nicht vorfinden
       * („sollte nicht da sein sollange man es per button oder per command … macht"). Die
       * Einstellungen sind ohnehin über die Insel erreichbar (`settingsModal`), das Panel ist der
       * zweite Weg.
       */
      zone: 'closed',
      size: 340,
      render: (host) => mountSettings(host, env),
    },
    commands: [
      {
        name: 'settings',
        help: 'zeigt oder ändert eine Einstellung: settings [list|<key> [wert]]',
        run: (args) => {
          const { t } = env.t()
          const [key = 'list', wert = ''] = args
          if (key === 'list') {
            return env.settings.all().map((feld) => {
              const value = env.settings.get(feld.key, feld.default)
              const marke = value !== feld.default ? '*' : ' '
              return `${marke} ${feld.key.padEnd(26)} ${formatValue(feld, value).padEnd(26)} ${t(`setting.${feld.key}.label`)}`
            })
          }
          const feld = env.settings.field(key)
          if (!feld) return [t('term.setting.unknown', { key })]
          if (wert === '') {
            const value = env.settings.get(feld.key, feld.default)
            return [
              `${feld.key} = ${value}`,
              formatValue(feld, value),
              t(`setting.${feld.key}.description`),
              `Vorgabe ${String(feld.default)} · Bereich ${feld.kind === 'number' ? `${feld.min} … ${feld.max}` : feld.kind}`,
            ]
          }
          const value: FieldValue =
            feld.kind === 'boolean'
              ? wert === 'true' || wert === 'on' || wert === '1'
              : feld.kind === 'number'
                ? Number(wert)
                : wert
          if (feld.kind === 'number' && !Number.isFinite(value as number)) {
            return [`Keine Zahl: ${wert}`]
          }
          env.settings.set(feld.key, value)
          env.apply?.(feld.key, value)
          return [t('term.setting.set', { key: feld.key, value: String(env.settings.get(feld.key, feld.default)) })]
        },
      },
    ],
    healthChecks: [
      () => {
        const geaendert = env.settings.changed()
        return {
          name: 'ui-settings:werte',
          // Geaenderte Werte sind **kein** Befund — sie sind der Zweck der Einstellung.
          ok: true,
          message:
            geaendert.length === 0
              ? 'alle Einstellungen auf Vorgabe'
              : `${geaendert.length} von ${env.settings.all().length} geändert`,
          ...(geaendert.length ? { details: { geaendert: geaendert.map((c) => c.key).join(', ') } } : {}),
        }
      },
      () => {
        // **Der Fall, der wirklich weh tut:** eine Einstellung, die es gibt, aber die niemand
        // beschreibt. Dann kann man sie setzen und sieht sie nie — die unangenehmste Sorte Fehler.
        const unbekannt = env.settings
          .all()
          .filter((feld) => env.registry.list().every((entry) => !(entry.plugin.settings ?? []).some((s) => s.field.key === feld.key)))
        return {
          name: 'ui-settings:herkunft',
          ok: true,
          message: `${env.settings.all().length} Einstellungen aus ${env.registry.list().filter((e) => (e.plugin.settings ?? []).length > 0).length} Plugins`,
          ...(unbekannt.length ? { details: { ohnePlugin: unbekannt.map((f) => f.key).join(', ') } } : {}),
        }
      },
    ],
  }
}
