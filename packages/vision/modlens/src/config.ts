/**
 * Die Ausstattung: was auf dieser Maschine für die Bildbrücke bereitsteht — **ohne den Schlüssel**.
 *
 * ## Warum dieses Modul den Schlüssel nie zurückgibt
 *
 * `~/.modlens/config.json` liegt mit dem API-Schlüssel darin (auf dieser Maschine am 18.10.2026
 * gemessen: `provider: "openai"`, Basis `https://api.deepseek.com`, Modell `deepseek-flash`, ein
 * Schlüssel **vorhanden**). Ein Auskunftsmodul, das ihn mitliefert, verteilt ihn in jede Anzeige und
 * jeden Bericht. Hier bleibt es bei der **Tatsache**: „ein Schlüssel ist gesetzt" — nicht bei dem
 * Wert.
 *
 * ## Warum die Suche über Pfade läuft und nicht über eine feste Adresse
 *
 * Die Konfiguration ist bewusst **geteilt** zwischen CLI und allen Harnessen (so steht es in der
 * Doku des Pakets). Ein zweiter Speicherort wäre eine zweite Wahrheit. Deshalb wird die **eine**
 * Datei gesucht — an derselben Stelle, die auch die CLI nimmt (`$MODLENS_CONFIG` oder
 * `<home>/.modlens/config.json`).
 *
 * @module @prometheus-harness/modlens/config
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Was über die Ausstattung bekannt ist. */
export interface Ausstattung {
  /** Ob eine Konfigurationsdatei gefunden und gelesen wurde. */
  gefunden: boolean
  /** Wo sie liegt (oder liegen sollte). */
  pfad: string
  /** Der festgelegte Anbieter (`openai`), falls genannt. */
  provider?: string
  /** Das eingestellte Modell, falls genannt. */
  modell?: string
  /** Die Basisadresse des Anbieters, falls genannt. */
  basis?: string
  /** Ob ein Schlüssel gesetzt ist — **nie** der Schlüssel. */
  hatSchluessel: boolean
  /** Welche Anbieter Abschnitte haben (`openai`, `anthropic`, …). */
  anbieter: string[]
}

/**
 * Der Ort der Konfiguration, wie die CLI ihn nimmt.
 *
 * @returns der Pfad; `$MODLENS_CONFIG` hat Vorrang
 */
export function konfigurationsPfad(): string {
  const ausUmgebung = process.env['MODLENS_CONFIG']
  if (ausUmgebung !== undefined && ausUmgebung.trim() !== '') return ausUmgebung
  return join(homedir(), '.modlens', 'config.json')
}

/**
 * Liest die Ausstattung — ohne den Schlüssel.
 *
 * @param pfad - der Pfad der Konfiguration (Vorgabe: {@link konfigurationsPfad})
 * @returns was bekannt ist; eine fehlende Datei ist kein Fehler, sondern `gefunden: false`
 */
export function liesAusstattung(pfad: string = konfigurationsPfad()): Ausstattung {
  const leer: Ausstattung = { gefunden: false, pfad, hatSchluessel: false, anbieter: [] }
  let roh: string
  try {
    roh = readFileSync(pfad, 'utf8')
  } catch {
    return leer
  }
  let gelesen: unknown
  try {
    gelesen = JSON.parse(roh)
  } catch {
    return leer
  }
  if (typeof gelesen !== 'object' || gelesen === null) return leer
  const feld = gelesen as Record<string, unknown>
  const ausstattung: Ausstattung = { gefunden: true, pfad, hatSchluessel: false, anbieter: [] }

  if (typeof feld['provider'] === 'string' && feld['provider'].trim() !== '') {
    ausstattung.provider = feld['provider'].trim()
  }
  const anbieter = feld['providers']
  if (typeof anbieter === 'object' && anbieter !== null) {
    for (const [name, eintrag] of Object.entries(anbieter as Record<string, unknown>)) {
      ausstattung.anbieter.push(name)
      if (typeof eintrag !== 'object' || eintrag === null) continue
      const werte = eintrag as Record<string, unknown>
      const schluessel = werte['apiKey']
      // **Nur die Tatsache.** Der Wert wird hier gelesen und **nicht** weitergegeben.
      if (typeof schluessel === 'string' && schluessel.trim() !== '') ausstattung.hatSchluessel = true
      if (ausstattung.provider === name) {
        if (typeof werte['model'] === 'string' && werte['model'].trim() !== '') ausstattung.modell = werte['model'].trim()
        if (typeof werte['baseUrl'] === 'string' && werte['baseUrl'].trim() !== '') ausstattung.basis = werte['baseUrl'].trim()
      }
    }
  }
  if (ausstattung.provider !== undefined && ausstattung.anbieter.length === 0) {
    ausstattung.anbieter.push(ausstattung.provider)
  }
  return ausstattung
}

/**
 * Nimmt Geheimwerte aus einem Text, bevor er in einer Meldung landet.
 *
 * **Warum das nötig ist.** Die CLI schreibt im Fehlerfall ihren Aufrufkontext nach stderr. Steht
 * dort ein Schlüssel, wäre eine Fehlermeldung im Chat eine Veröffentlichung. Deshalb wird jeder
 * Wert hinter `apiKey`/`api_key` ersetzt, **bevor** jemand ihn liest.
 *
 * @param text - der rohe Text
 * @returns derselbe Text mit ersetzten Werten
 */
export function entschaerfe(text: string): string {
  return text.replace(/(api[_-]?key["'\s:=]+)([^\s"',}]+)/giu, '$1***')
}
