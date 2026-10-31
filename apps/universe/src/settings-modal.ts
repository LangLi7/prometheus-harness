/**
 * **Die Einstellungen als eigener Bildschirm** — in der Form des Harness.
 *
 * **Was der Betreiber gesagt hat:** „settings funktioniert nicht per dynamic illand bzw sollte es den
 * settings öffnen vom Harness die man auch in chat hat".
 *
 * **Was daran wirklich fehlte.** Das Klicken war richtig verdrahtet — der Eintrag ⚙ in der Insel
 * rief `dock.openPanel('plugin:ui-settings')`. Nur: das Ergebnis war ein **schmales Panel in einer
 * Dock-Zone**, kein Bildschirm. Und im Harness sind die Einstellungen **kein Panel**: sie sind eine
 * eigene Fläche mit einer **Navigationsleiste links** und dem Abschnitt rechts — dieselbe Form wie
 * die Einstellungen eines Editors.
 *
 * **Woher die Form kommt** (`packages/client`, elf `ui-settings-*`-Pakete):
 *
 *   `ui-settings-shell`     die Hülle
 *   `ui-settings-general`   Allgemein
 *   `ui-settings-models`    Modelle
 *   `ui-settings-plugins`   Eingebaute Plugins
 *   `ui-settings-web-search` Websuche
 *   `ui-settings-subagent`  Subagent
 *   `ui-settings-agent-loop` Agent-Schleife
 *   `ui-settings-account`   Konto
 *
 * Diese Abschnitte gibt es hier **nicht** — es gibt diese Anwendung nicht. Was es gibt, sind die
 * Einstellungen, die **die Plugins dieses Prototyps beschreiben** (`Steuerung`, `Welt`,
 * `Oberfläche`, `Sprache`, `Plugins`). Der Bildschirm zeigt sie in derselben Form: links die
 * Abschnitte, rechts die Zeilen. Damit ist er **kein Nachbau eines fremden Inhalts**, sondern
 * dieselbe Form für den eigenen.
 *
 * **Kein neues Fenster, sondern ein Overlay.** Der Harness legt die Einstellungen **über** den Chat,
 * damit man den Verlauf nicht verliert. Genau das ist der Unterschied zum Dock-Panel, und deshalb
 * ist es hier ein Overlay.
 */
import type { Field, FieldValue, Settings } from './settings'
import { CATEGORIES, formatValue } from './settings'
import type { PluginRegistry } from './plugins'
import type { Translator } from './i18n'
// Die Zeichen kommen aus EINER Quelle (packages/assets/icons) — keine Schriftzeichen mehr.
import { iconMarkup } from '@prometheus-harness/icons'

export interface SettingsModalEnv {
  readonly settings: Settings
  readonly registry: PluginRegistry
  readonly t: () => Translator
  /** Wird nach jeder Änderung gerufen — der Wirt wendet den Wert an. */
  readonly apply: (key: string) => void
}

/**
 * Der Einstellungsbildschirm.
 *
 * **Eigene Klasse statt einer Funktion mit losen Zuhoerern.** Das Overlay wird **auf- und
 * zugemacht**, und zwar oft. Ein Aufbau aus freien Funktionen müsste bei jedem Öffnen die
 * Tastatur-Zuhoerer erneut anhängen und beim Schliessen wieder abnehmen — die Stelle, an der man
 * einen vergisst und danach zwei Reaktionen auf eine Taste hat.
 */
export class SettingsModal {
  private readonly host: HTMLElement
  private readonly env: SettingsModalEnv
  private offen = false
  private abschnitt = 'control'

  constructor(host: HTMLElement, env: SettingsModalEnv) {
    this.host = host
    this.env = env
  }

  isOpen(): boolean {
    return this.offen
  }

  open(): void {
    if (this.offen) return
    this.offen = true
    this.host.classList.add('offen')
    this.malen()
    document.addEventListener('keydown', this.aufTaste)
  }

  close(): void {
    if (!this.offen) return
    this.offen = false
    this.host.classList.remove('offen')
    this.host.replaceChildren()
    document.removeEventListener('keydown', this.aufTaste)
  }

  toggle(): void {
    if (this.offen) this.close()
    else this.open()
  }

  /** Escape schliesst — wie im Harness, und wie in jedem Dialog. */
  private readonly aufTaste = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.close()
  }

  /** Baut den ganzen Bildschirm neu auf. Er ändert sich selten — ein Neubau ist hier richtig. */
  private malen(): void {
    const { t } = this.env.t()
    this.host.replaceChildren()

    // Der Hintergrund fängt jeden Klick ab: wer **neben** den Dialog klickt, will ihn schliessen.
    // Ohne diese Fläche ginge der Klick an die Oberfläche darunter — und man würde versehentlich
    // etwas in der Welt auslösen, während die Einstellungen offen sind.
    const schleier = document.createElement('div')
    schleier.className = 'set-schleier'
    schleier.addEventListener('click', () => this.close())

    const dialog = document.createElement('div')
    dialog.className = 'set-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-label', t('panel.settings'))
    // Ein Klick **im** Dialog darf nicht als „daneben" gelten.
    dialog.addEventListener('click', (event) => event.stopPropagation())

    dialog.append(this.kopf(t), this.koerper(t))
    this.host.append(schleier, dialog)
  }

  /** Kopfzeile: Titel links, Zurücksetzen und Schliessen rechts. */
  private kopf(t: Translator['t']): HTMLElement {
    const kopf = document.createElement('div')
    kopf.className = 'set-kopf'

    const titel = document.createElement('b')
    titel.textContent = t('panel.settings')

    const spacer = document.createElement('span')
    spacer.className = 'spacer'

    const zurueck = document.createElement('button')
    zurueck.type = 'button'
    zurueck.className = 'set-knopf'
    zurueck.textContent = t('settings.resetAll')
    zurueck.addEventListener('click', () => {
      this.env.settings.resetAll()
      this.env.apply('*')
      this.malen()
    })

    const zu = document.createElement('button')
    zu.type = 'button'
    zu.className = 'set-knopf'
    zu.innerHTML = iconMarkup('close')
    /*
     * **Ein stabiler Griff — seit das Zeichen keines mehr ist.**
     *
     * Hier stand ein `✕`. Ein Test konnte den Knopf damit **am Text** finden; ein gezeichnetes Zeichen
     * hat keinen Text. Ein Test, der jetzt nach dem Bild sucht, wäre ein Test über das Bild — und der
     * bricht beim nächsten Zeichenwechsel, obwohl die Sache stimmt.
     *
     * `aria-label` wäre sprachabhängig („Schliessen" / „Close"), `data-close` nicht. Dasselbe
     * Verfahren wie bei den Insel-Einträgen (`data-action`): **die Handlung ist der Griff, nicht die
     * Beschriftung.**
     */
    zu.dataset.close = 'settings'
    zu.setAttribute('aria-label', t('island.close'))
    zu.addEventListener('click', () => this.close())

    kopf.append(titel, spacer, zurueck, zu)
    return kopf
  }

  /** Der Körper: links die Abschnitte, rechts die Zeilen des gewählten Abschnitts. */
  private koerper(t: Translator['t']): HTMLElement {
    const koerper = document.createElement('div')
    koerper.className = 'set-koerper'

    const nav = document.createElement('nav')
    nav.className = 'set-nav'
    for (const kategorie of CATEGORIES) {
      // **Nur Abschnitte, die etwas enthalten.** Ein leerer Abschnitt in der Leiste wäre ein Ziel,
      // hinter dem nichts steht — und genau das sieht aus wie ein Fehler.
      const felder = this.env.settings.inCategory(kategorie).filter((f) => f.internal !== true)
      if (felder.length === 0) continue
      const knopf = document.createElement('button')
      knopf.type = 'button'
      knopf.className = kategorie === this.abschnitt ? 'set-navitem on' : 'set-navitem'
      knopf.textContent = t(`category.${kategorie}`)
      knopf.addEventListener('click', () => {
        this.abschnitt = kategorie
        this.malen()
      })
      nav.appendChild(knopf)
    }

    const inhalt = document.createElement('div')
    inhalt.className = 'set-inhalt'
    const felder = this.env.settings.inCategory(this.abschnitt).filter((f) => f.internal !== true)
    // **Ein leerer Abschnitt erklärt sich.** Wenn die letzte Einstellung eines Abschnitts
      // verschwindet (Plugin abgeschaltet), steht hier ein Satz statt einer leeren Fläche.
    if (felder.length === 0) {
      const leer = document.createElement('p')
      leer.className = 'hint'
      leer.textContent = t('settings.empty')
      inhalt.appendChild(leer)
    }
    for (const feld of felder) inhalt.appendChild(this.zeile(feld, t))

    koerper.append(nav, inhalt)
    return koerper
  }

  /** Eine Zeile: Beschriftung und Erklärung links, Bedienung rechts. */
  private zeile(feld: Field, t: Translator['t']): HTMLElement {
    const zeile = document.createElement('div')
    zeile.className = 'set-zeile'
    /*
     * **Der stabile Griff an der Zeile — hier fehlte er.**
     *
     * `settings-screen.ts` setzt seit jeher `row.dataset.key = field.key`. Dieser Bildschirm nicht.
     * Gemessen am 16.10.2026: eine Prüfung suchte `.set-zeile[data-key="interface.style"]` und fand
     * **nichts** — obwohl die Zeile dastand. Der Fehler lag nicht in der Zeile, sondern im Griff.
     *
     * **Warum der Schlüssel und nicht die `id`.** Die `id` des Bedienelements ist aus dem Schlüssel
     * **gebaut** (`set-interface-style`); sie ändert sich, sobald sich die Bauweise ändert. Der
     * Schlüssel ist die Kennung der Sache — dieselbe, die in der Einstellung, im Sprachpaket und im
     * Befehl steht. Zwei Bildschirme, zwei verschiedene Griffe für dieselbe Zeile wären genau die
     * Sorte Unterschied, die beim nächsten Umbau eine Prüfung ins Leere laufen läßt.
     */
    zeile.dataset.key = feld.key
    const id = `set-${feld.key.replace(/\./g, '-')}`

    const links = document.createElement('div')
    links.className = 'set-text'
    const label = document.createElement('label')
    label.className = 'set-label'
    label.htmlFor = id
    label.textContent = t(`setting.${feld.key}.label`)
    // Ein geänderter Wert wird **gekennzeichnet**, nicht versteckt: sonst sucht man später, warum
    // sich etwas anders anfühlt als beim ersten Start.
    if (this.env.settings.get(feld.key, feld.default) !== feld.default) {
      const punkt = document.createElement('span')
      punkt.className = 'set-geaendert'
      punkt.textContent = '•'
      punkt.title = String(feld.default)
      label.appendChild(punkt)
    }
    const desc = document.createElement('p')
    desc.className = 'set-desc'
    desc.textContent = t(`setting.${feld.key}.description`)
    links.append(label, desc)

    const rechts = document.createElement('div')
    rechts.className = 'set-ctl'
    const melden = (wert: FieldValue): void => {
      this.env.settings.set(feld.key, wert)
      this.env.apply(feld.key)
      this.malen()
    }

    if (feld.kind === 'boolean') {
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.id = id
      box.className = 'set-schalter'
      box.checked = this.env.settings.getBoolean(feld.key, feld.default)
      box.addEventListener('change', () => melden(box.checked))
      rechts.appendChild(box)
    } else if (feld.kind === 'choice') {
      const auswahl = document.createElement('select')
      auswahl.id = id
      auswahl.className = 'set-auswahl'
      const aktuell = this.env.settings.getString(feld.key, feld.default)
      for (const option of feld.options()) {
        const el = document.createElement('option')
        el.value = option.value
        // Sprachschlüssel vor Etikett — siehe `settings-screen.ts` und `ChoiceField.options`.
        el.textContent = option.labelKey === undefined ? option.label : t(option.labelKey)
        el.selected = option.value === aktuell
        auswahl.appendChild(el)
      }
      auswahl.addEventListener('change', () => melden(auswahl.value))
      rechts.appendChild(auswahl)
    } else {
      const wert = this.env.settings.getNumber(feld.key, feld.default)
      const regler = document.createElement('input')
      regler.type = 'range'
      regler.id = id
      regler.className = 'set-regler'
      regler.min = String(feld.min)
      regler.max = String(feld.max)
      regler.step = String(feld.step)
      regler.value = String(wert)
      const zahl = document.createElement('input')
      zahl.type = 'number'
      zahl.className = 'set-zahl'
      // **Eine echte `id` — nicht nur `htmlFor` am Label.** Der Beschriftungsknoten trägt
      // `for="…"`, aber das Zuordnen läuft über den **Browser**; ein Werkzeug, das den Baum liest,
      // findet das Feld nur über seine eigene `id`. Und die Beschriftung ist ein Klickziel nur,
      // wenn die Zuordnung stimmt.
      zahl.id = id
      zahl.min = String(feld.min)
      zahl.max = String(feld.max)
      zahl.step = String(feld.step)
      zahl.value = String(wert)
      const anzeige = document.createElement('span')
      anzeige.className = 'set-wert'
      anzeige.textContent = formatValue(feld, wert, this.env.t().locale)

      // **Zwei Bedienelemente, ein Wert.** Der Regler ist zum Fühlen da, die Zahl zum Einstellen
      // eines genauen Werts. Wer nur den Regler hat, trifft 0,00175 nie.
      const setzen = (neu: number, nurZahl = false): void => {
        if (!nurZahl) regler.value = String(neu)
        zahl.value = String(neu)
        melden(neu)
      }
      regler.addEventListener('input', () => setzen(Number(regler.value), true))
      zahl.addEventListener('change', () => {
        const neu = Number(zahl.value)
        if (Number.isFinite(neu)) setzen(neu)
      })
      rechts.append(anzeige, regler, zahl)
    }

    zeile.append(links, rechts)
    return zeile
  }
}
