/**
 * Der Plugin-Kern.
 *
 * **Was der Betreiber damit meint:** „die meisten stuff die ich da erklärt habe sollte
 * everything is plugin damit meinte ich das man es einfügen kann und wegnehmen kann wie ein
 * art package."
 *
 * Also ist ein Plugin hier **kein** Sonderfall, sondern die **einzige** Form, in der die
 * Oberflaeche waechst. Es gibt drei Dinge, die ein Plugin beisteuern kann:
 *
 *   - **panel**      — ein Fenster in der Docking-Flaeche
 *   - **command**    — einen Befehl im Terminal
 *   - **healthCheck** — eine Pruefung fuer den Gesundheitsbericht
 *
 * **Warum das erst jetzt kommt und nicht am Anfang.** Man kann ein Plugin-System nicht vor
 * seinen Plugins entwerfen: was ein Plugin koennen muss, weiss man erst, wenn man zwei gebaut
 * hat. Das Terminal ist das erste, der Health-Check das zweite — und der Health-Check ist
 * bewusst **kein eigener Befehl**, sondern eine Faehigkeit, die Plugins beisteuern koennen.
 *
 * **Was hier bewusst NICHT steht:** kein Laden aus dem Netz, keine Sandbox zwischen Plugins,
 * keine Versionierung von Abhaengigkeiten ueber Semver-Spannen. Der Kern kann so wenig wie
 * moeglich; das haelt ihn pruefbar. Die echte Haerte kommt erst mit der Harness-Kopplung.
 */
import type { Field } from './settings'

/** Was ein Panel aus dem Docking beisteuert. */
export interface PanelContribution {
  /**
   * Der Reitertitel.
   *
   * **Als Funktion, wenn er uebersetzt werden soll.** Ein fester Titel wird **einmal** gesetzt,
   * naemlich beim Eintragen des Plugins — und traegt danach die Sprache, die zu diesem Zeitpunkt
   * galt. Mit `() => tr('panel.debug')` wird er bei **jedem** Aufbau der Flaeche neu geholt.
   *
   * Beides ist erlaubt, und das ist Absicht: ein Plugin, das nur eine Kennung anzeigt
   * (`pmh-nix`), braucht keine Uebersetzung und schreibt schlicht den Text hin.
   */
  readonly title: string | (() => string)
  /** Startzone in der Docking-Flaeche. `closed` heisst: liegt in der Leiste, nicht im Bild. */
  readonly zone: 'left' | 'right' | 'bottom' | 'floating' | 'closed'
  readonly size: number
  /**
   * Malt den Inhalt. Wird **erneut** aufgerufen, wenn die Flaeche neu aufgebaut wird —
   * ein Plugin darf sich also nicht darauf verlassen, nur einmal gerufen zu werden.
   */
  readonly render: (host: HTMLElement) => void
}

/** Ein Befehl im Terminal. */
export interface CommandContribution {
  readonly name: string
  readonly help: string
  /** Fuehrt den Befehl aus und liefert die Zeilen zurueck, die im Terminal erscheinen. */
  readonly run: (args: readonly string[], context: CommandContext) => readonly string[]
}

/**
 * Was ein Plugin **beschreibt**, ohne es selbst anzuzeigen.
 *
 * Das ist die Form, in der eine Einstellung beigesteuert wird — dieselbe Rolle wie `configuration`
 * in einer VS-Code-Extension. Das Plugin liefert das **Schema** (Typ, Grenzen, Vorgabe), die
 * Oberflaeche liefert die **Anzeige**. Deshalb steht im Schema kein Text — und deshalb ist ein
 * neues Plugin kein neuer Bildschirm.
 */
export interface SettingContribution {
  /** Typ, Grenzen, Vorgabe, Einheit — siehe `settings.ts`. */
  readonly field: Field
}

/** Was ein Befehl ueber seine Umgebung wissen darf. */
export interface CommandContext {
  /** Spricht Text — auf einem Geraet mit Stimme hoerbar, sonst still. */
  readonly speak: (text: string) => void
  /** Meldet, dass die Anzeigen neu gezeichnet werden sollen. */
  readonly refresh: () => void
  /**
   * Holt ein Panel in die Fläche — der Weg für Befehle, die **eine Fläche** brauchen.
   *
   * **Warum ein Rückruf und kein zweiter Befehl.** Der Token-Befehl kann den
   * Schlüssel nicht als Argument annehmen (er stünde im Verlauf); er öffnet ein
   * Panel. Der Befehl soll trotzdem ohne Browser prüfbar bleiben — fehlt der
   * Rückruf, sagt er das, statt zu werfen.
   */
  readonly oeffnePanel?: (id: string) => void
}

/** Das Ergebnis einer Gesundheitspruefung. */
export interface HealthReport {
  readonly name: string
  readonly ok: boolean
  /** Kurze Aussage — das, was im Bericht steht. Messwerte gehoeren in `details`. */
  readonly message: string
  readonly details?: Readonly<Record<string, string | number | boolean>>
}

/** Ein Plugin. */
export interface Plugin {
  /** Kennung, stabil und eindeutig — wie eine Paketkennung. */
  readonly id: string
  readonly name: string
  readonly version: string
  /** Was dieses Plugin im Projekt bedeutet, in einem Satz. */
  readonly description: string
  /**
   * Kennungen, die vorhanden sein **muessen**. Fehlt eine, laesst sich das Plugin nicht
   * einschalten — und der Grund wird genannt, statt still zu scheitern.
   */
  readonly requires?: readonly string[]
  readonly panel?: PanelContribution
  readonly commands?: readonly CommandContribution[]
  readonly healthChecks?: readonly (() => HealthReport)[]
  /**
   * Einstellungen, die dieses Plugin beschreibt.
   *
   * **Warum hier und nicht im Plugin selbst.** Ein Plugin, das seine Einstellung auch **anzeigt**,
   * muesste ein eigenes Fenster bauen — und dann gaebe es so viele Einstellungsfenster wie Plugins.
   * Hier beschreibt es nur **was** es gibt; angezeigt wird es an **einer** Stelle. Wer die
   * Einstellung schliesslich liest, ist ebenfalls egal: `settings.get(key, vorgabe)` funktioniert
   * auch, wenn das Plugin abgeschaltet ist — dann gilt die Vorgabe.
   *
   * **Was hier bewusst NICHT steht:** kein `onChange` je Feld. Wer auf eine Aenderung reagieren
   * will, meldet sich **einmal** an der Einstellungsverwaltung an und prueft die Kennung. Ein
   * Rueckruf je Feld waere ein Gedaechtnisleck bei jedem Umschalten.
   */
  readonly settings?: readonly SettingContribution[]
  /** Laeuft beim Einschalten. */
  readonly onEnable?: () => void
  /** Laeuft beim Ausschalten — hier wird aufgeraeumt, was `onEnable` angelegt hat. */
  readonly onDisable?: () => void
}

export interface PluginEntry {
  readonly plugin: Plugin
  readonly enabled: boolean
  /** Fehlende Abhaengigkeiten, falls es welche gibt. Dann bleibt `enabled` false. */
  readonly missing: readonly string[]
}

/**
 * Die Registry.
 *
 * Sie haelt **alles**, was die Oberflaeche anzeigt. Wer ein Panel sehen will, fragt die
 * Registry — nicht eine feste Liste. Damit ist „abstecken" keine Ausnahme mehr, sondern der
 * Normalfall: ein ausgeschaltetes Plugin liefert einfach nichts.
 */
export class PluginRegistry {
  private readonly entries = new Map<string, PluginEntry>()
  private readonly listeners = new Set<() => void>()

  /** Meldet sich an, um bei jeder Aenderung benachrichtigt zu werden. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Traegt ein Plugin ein.
   *
   * Ein Plugin ohne erfuellte Abhaengigkeiten wird **eingetragen, aber nicht eingeschaltet**.
   * So ist es sichtbar und der Grund nachlesbar, statt zu verschwinden.
   */
  register(plugin: Plugin): PluginEntry {
    if (this.entries.has(plugin.id)) {
      throw new Error(`Plugin bereits eingetragen: ${plugin.id}`)
    }
    const missing = (plugin.requires ?? []).filter((id) => !this.entries.has(id))
    const entry: PluginEntry = { plugin, enabled: missing.length === 0, missing }
    this.entries.set(plugin.id, entry)
    if (entry.enabled) plugin.onEnable?.()
    this.emit()
    return entry
  }

  /** Schaltet ein Plugin ein — nur mit erfuellten Abhaengigkeiten. */
  enable(id: string): boolean {
    const entry = this.entries.get(id)
    if (!entry) return false
    const missing = (entry.plugin.requires ?? []).filter((dep) => !this.entries.get(dep)?.enabled)
    if (missing.length > 0) {
      this.entries.set(id, { ...entry, enabled: false, missing })
      this.emit()
      return false
    }
    if (!entry.enabled) entry.plugin.onEnable?.()
    this.entries.set(id, { ...entry, enabled: true, missing: [] })
    this.emit()
    return true
  }

  /** Schaltet ein Plugin aus. Das Plugin selbst bleibt eingetragen und kann zurueckkommen. */
  disable(id: string): boolean {
    const entry = this.entries.get(id)
    if (!entry) return false
    // Wer ein Plugin ausschaltet, von dem andere abhaengen, reisst sie mit. Sonst zeigt die
    // Oberflaeche etwas an, dessen Grundlage fehlt.
    const dependents = [...this.entries.values()].filter(
      (candidate) => candidate.enabled && (candidate.plugin.requires ?? []).includes(id),
    )
    for (const dependent of dependents) {
      dependent.plugin.onDisable?.()
      this.entries.set(dependent.plugin.id, { ...dependent, enabled: false, missing: [id] })
    }
    if (entry.enabled) entry.plugin.onDisable?.()
    this.entries.set(id, { ...entry, enabled: false, missing: [] })
    this.emit()
    return true
  }

  /** Nimmt ein Plugin ganz heraus — wie ein Paket entfernen. */
  unregister(id: string): boolean {
    const entry = this.entries.get(id)
    if (!entry) return false
    this.disable(id)
    this.entries.delete(id)
    this.emit()
    return true
  }

  list(): readonly PluginEntry[] {
    return [...this.entries.values()]
  }

  get(id: string): PluginEntry | undefined {
    return this.entries.get(id)
  }

  isEnabled(id: string): boolean {
    return this.entries.get(id)?.enabled === true
  }

  /** Alle Panels der **eingeschalteten** Plugins. */
  panels(): readonly { readonly pluginId: string; readonly panel: PanelContribution }[] {
    const out: { pluginId: string; panel: PanelContribution }[] = []
    for (const entry of this.entries.values()) {
      if (entry.enabled && entry.plugin.panel) out.push({ pluginId: entry.plugin.id, panel: entry.plugin.panel })
    }
    return out
  }

  /** Alle Befehle der eingeschalteten Plugins, nach Name sortiert. */
  commands(): readonly { readonly pluginId: string; readonly command: CommandContribution }[] {
    const out: { pluginId: string; command: CommandContribution }[] = []
    for (const entry of this.entries.values()) {
      if (!entry.enabled) continue
      for (const command of entry.plugin.commands ?? []) out.push({ pluginId: entry.plugin.id, command })
    }
    return out.sort((a, b) => a.command.name.localeCompare(b.command.name))
  }

  /**
   * Alle Einstellungen, die **eingeschaltete** Plugins beschreiben — in Eintragsreihenfolge.
   *
   * Die Reihenfolge ist **nicht** alphabetisch: das Sprach-Plugin beschreibt seine Auswahl, und
   * die Auswahl selbst haengt von den Paketen ab, die zu diesem Zeitpunkt da sind. Die
   * Einstellungsverwaltung loest die Optionen deshalb **beim Anzeigen** auf (`options()`), nicht
   * beim Eintragen.
   */
  settings(): readonly { readonly pluginId: string; readonly setting: SettingContribution }[] {
    const out: { pluginId: string; setting: SettingContribution }[] = []
    for (const entry of this.entries.values()) {
      if (!entry.enabled) continue
      for (const setting of entry.plugin.settings ?? []) out.push({ pluginId: entry.plugin.id, setting })
    }
    return out
  }

  /**
   * Fuehrt **alle** Gesundheitspruefungen der eingeschalteten Plugins aus.
   *
   * Eine werfende Pruefung beendet den Bericht nicht: sie wird zu einem eigenen Befund
   * „abgestuerzt". Andernfalls wuerde ein einziges kaputtes Plugin den ganzen Bericht
   * unbrauchbar machen — und genau dann braucht man ihn.
   */
  health(): readonly HealthReport[] {
    const out: HealthReport[] = []
    for (const entry of this.entries.values()) {
      if (!entry.enabled) continue
      for (const check of entry.plugin.healthChecks ?? []) {
        try {
          out.push(check())
        } catch (error) {
          out.push({
            name: `${entry.plugin.id}: ?`,
            ok: false,
            message: `Pruefung abgestuerzt: ${error instanceof Error ? error.message : String(error)}`,
          })
        }
      }
    }
    return out
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
