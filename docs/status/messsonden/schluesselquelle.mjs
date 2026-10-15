/**
 * Meßsonde: **welche Quelle liefert den Hauptschlüssel — und ist er überhaupt da?**
 *
 * ## Warum diese Sonde existiert
 *
 * Der Auftrag (C1) lautete: *„kein Code liest `PMH_MASTER_KEY` — Umschlagverfahren ohne
 * Schlüsselgeber"*. **Gemessen ist das heute falsch:** es gibt einen Schlüsselgeber
 * (`packages/auth/secrets/src/key-provider.ts`) und vier Quellenarten in einer
 * festen Reihenfolge.
 *
 * Die Frage, die der Auftrag eigentlich stellt, ist damit eine **andere**: liefert bei
 * uns die **starke** Quelle (Datei) — oder fällt es auf die **Übergangsquelle**
 * (Umgebungsvariable) zurück, die weg soll?
 *
 * ## Was gemessen wird — und was NIEMALS
 *
 * Für **jede** Standardquelle wird `versuche()` aufgerufen und **nur berichtet, ob sie
 * einen Schlüssel hat**. Der Schlüssel selbst wird **nicht** ausgegeben, nicht gekürzt,
 * nicht gehasht — ein Fingerabdruck wäre schon eine Spur, und für diese Frage braucht es
 * ihn nicht.
 *
 * ## Die Reihenfolge ist der Befund
 *
 * Die erste Quelle, die einen Schlüssel hat, **gewinnt**. Steht die Umgebungsvariable
 * vorn, ist die Datei wirkungslos; steht sie hinten und die Datei fehlt, kommt jeder
 * Schlüssel aus der Umgebung — und **jede bereits verschlüsselte Zeile hängt daran**.
 *
 * @module docs/status/messsonden/schluesselquelle
 */

import { existsSync, statSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import {
  DOCKER_SECRET_PFAD,
  HAUPTSSCHLUESSELDATEI,
  standardQuellen,
  VERSION_VARIABLE,
} from '../../../packages/auth/secrets/src/index.ts'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const VORGABE_HOME = join(HIER, '..', '..', '..', '.pmh-build', 'harness-home')

function haupt() {
  const home = process.argv[2] ?? VORGABE_HOME
  const version = Number((process.env[VERSION_VARIABLE] ?? '1').trim())
  const dateiPfad = join(home, HAUPTSSCHLUESSELDATEI)

  console.log('Hauptschlüssel — welche Quelle liefert?')
  console.log(`  Platform:   ${platform()}`)
  console.log(`  Home:       ${home}`)
  console.log(`  Fassung:    ${String(version)}  (aus ${VERSION_VARIABLE})`)
  console.log('')

  // Die Reihenfolge ausgeben, BEVOR gefragt wird — sie ist der halbe Befund.
  const quellen = standardQuellen(process.env, home, DOCKER_SECRET_PFAD)
  console.log(`== Die Kette (${String(quellen.length)} Quellen, erste mit Schlüssel gewinnt) ==`)
  let gewinner = null
  for (const [i, q] of quellen.entries()) {
    let hat = false
    let fehler = null
    try {
      hat = q.versuche() !== undefined
    } catch (e) {
      // Ein **Fehler** heißt: die Quelle HAT einen Schlüssel, aber er ist unbrauchbar.
      // Das darf NICHT zur nächsten Quelle führen — es würde eine kaputte
      // Konfiguration verdecken. Deshalb wird es hier getrennt ausgewiesen.
      fehler = e instanceof Error ? e.message.slice(0, 140) : String(e)
    }
    const marke = fehler !== null ? 'FEHLER (unbrauchbar)' : hat ? 'HAT einen Schlüssel' : 'keiner'
    if (hat && gewinner === null) gewinner = q
    console.log(`  ${String(i + 1)}. ${String(q.art).padEnd(14)} ${marke}`)
    console.log(`      ${q.name}`)
    if (fehler !== null) console.log(`      -> ${fehler}`)
  }

  // Und der Zustand der Datei — unabhängig davon, ob sie gelesen wurde.
  console.log('')
  console.log('== Die Datei, auf die es ankommt ==')
  console.log(`  Pfad: ${dateiPfad}`)
  if (existsSync(dateiPfad)) {
    const st = statSync(dateiPfad)
    const modus = (st.mode & 0o777).toString(8).padStart(3, '0')
    console.log(`  VORHANDEN, ${String(st.size)} B, Modus ${modus}  (Vergleichswert: 600)`)
    if (platform() === 'win32') {
      console.log('  Auf Windows ist der Modus KEINE Aussage — NTFS meldet immer 666.')
      console.log('  Was die Datei schützt, ist das Benutzerprofil, nicht der Modus.')
      if (modus === '666') console.log('  (666 ist hier also ERWARTET und kein Befund.)')
    } else if (modus !== '600') {
      console.log('  BEFUND: auf POSIX ist eine gruppen- oder weltlesbare Schlüsseldatei ein Fehler.')
    }
  } else {
    console.log('  FEHLT.')
  }

  // Was die Umgebungsvariable betrifft — nur ihre ANWESENHEIT.
  const envDa = (process.env.PMH_MASTER_KEY ?? '').trim() !== ''
  console.log('')
  console.log(`  PMH_MASTER_KEY gesetzt: ${envDa ? 'JA (Wert nicht ausgegeben)' : 'nein'}`)
  console.log(`  PMH_HOME gesetzt:       ${(process.env.PMH_HOME ?? '').trim() !== '' ? 'JA' : 'nein'}`)
  console.log(`  Benutzerprofil:          ${homedir()}`)

  console.log('')
  console.log('== BEFUND ==')
  if (gewinner === null) {
    console.log('  KEINE Quelle hat einen Schlüssel. Dann läßt sich nichts entschlüsseln —')
    console.log('  und bestehende Umschläge wären unlesbar.')
    process.exitCode = 2
    return
  }
  console.log(`  Die erste Quelle mit Schlüssel ist: ${gewinner.art}`)
  console.log(`    ${gewinner.name}`)
  console.log('')
  if (gewinner.art === 'umgebung') {
    console.log('  Das ist die ÜBERGANGSQUELLE. Sie soll weg — und sie liefert.')
    console.log('  Wer sie entfernt, macht alles unlesbar, was mit ihr verschlüsselt wurde:')
    console.log('  erst eine Datei anlegen, umschlagen, DANN die Variable entfernen.')
  } else if (gewinner.art === 'datei') {
    console.log('  Das ist die STÄRKE erste Stufe. Die Umgebungsvariable ist damit wirkungslos —')
    console.log('  sie kann entfernt werden, sobald belegt ist, daß nichts mehr mit ihr läuft.')
  } else {
    console.log(`  Quelle der Art "${gewinner.art}".`)
  }
  console.log('')
  console.log('  Diese Sonde gibt den Schlüssel NICHT aus — auch nicht gekürzt oder gehasht.')
  process.exitCode = 0
}

if (import.meta.main === true) haupt()
