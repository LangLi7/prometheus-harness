/**
 * Werkszeug: **Übersetzungen nebeneinanderlegen** — englisch links, deutsch rechts.
 *
 * ## Warum es das gibt
 *
 * `sprachpruefer.mjs` prüft **Struktur**: Schlüssel, Platzhalter, Leerzeichen. Es prüft
 * **nicht**, ob der deutsche Text gut ist — das kann es nicht, und ein Werkzeug, das es
 * behauptet, wäre eine Attrappe.
 *
 * Dieses Werkzeug macht die andere Hälfte billig: es legt beide Fassungen nebeneinander,
 * damit sie **gelesen** werden können. Bei 2374 Texten geht das nicht in einem Zug; deshalb
 * wird **jeder n-te** gezeigt — ein systematischer Ausschnitt, kein Zufall.
 *
 * ```powershell
 * bun scripts/sprachvergleich.mjs teil-6            # jeder 20. Schlüssel
 * bun scripts/sprachvergleich.mjs teil-6 --jeder 5  # dichter
 * bun scripts/sprachvergleich.mjs teil-6 --nur chat
 * bun scripts/sprachvergleich.mjs --alle            # alle vorhandenen Teile
 * bun scripts/sprachvergleich.mjs --alle --begriffe Workspace,Session
 * ```
 *
 * ## `--begriffe`: englische Wörter im deutschen Text finden
 *
 * **Der Fall (gemessen).** Der Auftrag sagte „`Workspace` und `Session` bleiben englisch",
 * die bereits ausgelieferte `de.json` benutzt aber „Standard-Arbeitsbereich". Zwei
 * Übersetzer haben die Frage **gegensätzlich** entschieden — Teil 1 ließ `Workspace` stehen,
 * Teil 5 schrieb „Arbeitsbereich". Beide haben sich an etwas gehalten; das Ergebnis wäre
 * eine Oberfläche mit zwei Wörtern für dieselbe Sache.
 *
 * Ein Suchen-Ersetzen-Lauf wäre hier **falsch**, weil nicht jede Fundstelle dieselbe ist
 * (`groupBy.workspace` heißt im Englischen „WorkSpace", und in zusammengesetzten Wörtern wie
 * „Workspace-Liste" steckt das Wort anders). Deshalb **zeigt** dieses Werkzeug jede Stelle
 * einzeln, damit sie angesehen und dann einzeln entschieden wird.
 *
 * @module scripts/sprachvergleich
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const QUELLE = 'docs/status/sprachquelle.json'
const ORDNER = 'docs/status/uebersetzung'

function haupt() {
  const args = process.argv.slice(2)
  const alle = args.includes('--alle')
  const jeder = args.includes('--jeder') ? Number(args[args.indexOf('--jeder') + 1]) : 20
  const nur = args.includes('--nur') ? args[args.indexOf('--nur') + 1] : undefined
  const begriffe =
    args.includes('--begriffe') && args[args.indexOf('--begriffe') + 1] !== undefined
      ? (args[args.indexOf('--begriffe') + 1] ?? '').split(',').filter((b) => b.length > 0)
      : undefined
  // `--paket <datei>` liest das **vereinigte** Paket statt der Teile. Nötig, weil die
  // Terminologie-Prüfung am zusammengefügten Text laufen muß: nur dort steht `common`
  // (aus der alten Datei) neben den Teilen.
  const paketPfad = args.includes('--paket') ? args[args.indexOf('--paket') + 1] : undefined
  const teile = args.includes('--alle')
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
    : args.filter((a) => /^teil-\d+$/u.test(a)).map((a) => Number(a.slice(5)))

  if (teile.length === 0 && paketPfad === undefined) {
    console.log('Aufruf: bun scripts/sprachvergleich.mjs teil-6   |   --alle   |   --paket packages/client/locale/de.json')
    process.exit(2)
  }

  const quelle = JSON.parse(readFileSync(QUELLE, 'utf8'))
  let gezeigt = 0
  let fehlend = 0

  /** Wortsuche: trifft `Workspace` und `Workspace-Liste`, nicht `Arbeitsbereich`. */
  const trifft = (text, begriff) =>
    new RegExp(`(?<![\\p{L}])${begriff.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![\\p{L}])`, 'iu').test(text)

  const quellen =
    paketPfad !== undefined
      ? [{ titel: `Paket ${paketPfad}`, daten: JSON.parse(readFileSync(paketPfad, 'utf8')) }]
      : teile.map((n) => {
          const pfad = join(ORDNER, `teil-${String(n)}.json`)
          if (!existsSync(pfad)) return { titel: `Teil ${String(n)}`, daten: undefined }
          return { titel: `Teil ${String(n)}`, daten: JSON.parse(readFileSync(pfad, 'utf8')) }
        })

  for (const quelleEintrag of quellen) {
    const teil = quelleEintrag.daten
    console.log(`\n===== ${quelleEintrag.titel} =====`)
    if (teil === undefined) {
      console.log('   FEHLT')
      continue
    }
    for (const [ns, fach] of Object.entries(teil)) {
      if (ns.startsWith('_')) continue
      if (nur !== undefined && ns !== nur) continue
      const englisch = quelle.faecher[ns]?.englisch ?? {}
      const schluessel = Object.keys(fach)

      if (begriffe !== undefined) {
        const treffer = schluessel.filter((k) => begriffe.some((b) => trifft(String(fach[k]), b)))
        if (treffer.length === 0) continue
        console.log(`\n-- ${ns}  (${String(treffer.length)} von ${String(schluessel.length)} Stellen mit „${begriffe.join('", "')}")`)
        for (const k of treffer) {
          gezeigt += 1
          console.log(`   ${k}`)
          console.log(`      EN  ${String(englisch[k] ?? '?').replace(/\n/gu, '\\n')}`)
          console.log(`      DE  ${String(fach[k]).replace(/\n/gu, '\\n')}`)
        }
        continue
      }

      console.log(`\n-- ${ns}  (${String(schluessel.length)} Texte, jeder ${String(jeder)}. gezeigt)`)
      let i = 0
      for (const k of schluessel) {
        if (i % jeder !== 0) {
          i += 1
          continue
        }
        i += 1
        const en = englisch[k]
        if (en === undefined) {
          fehlend += 1
          console.log(`   !! ${k} — steht NICHT in der Quelle`)
          continue
        }
        gezeigt += 1
        console.log(`   ${k}`)
        console.log(`      EN  ${en.replace(/\n/gu, '\\n')}`)
        console.log(`      DE  ${String(fach[k]).replace(/\n/gu, '\\n')}`)
      }
    }
  }
  console.log('')
  console.log(
    begriffe === undefined
      ? `Gezeigt: ${String(gezeigt)} Paare.${fehlend > 0 ? ` Nicht in der Quelle: ${String(fehlend)}.` : ''}`
      : `Fundstellen mit „${begriffe.join('", "')}": ${String(gezeigt)}.`,
  )
}

if (import.meta.main === true) haupt()
