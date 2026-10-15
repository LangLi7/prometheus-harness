/**
 * Werkszeug: **ein deutsches Sprachpaket gegen die englische Quelle prüfen.**
 *
 * ## Warum es das gibt
 *
 * 2374 Texte zu übersetzen ist Handarbeit, und Handarbeit macht Fehler, die man **nicht
 * sieht**: ein verlorener Platzhalter (`{n}` fehlt), ein Schlüssel, der beim Abschreiben
 * umbenannt wurde, ein leerer Wert, ein Text, der versehentlich englisch geblieben ist.
 * Dieses Werkszeug findet genau diese Fehler **deterministisch** — es urteilt nicht über
 * Stil, nur über Struktur.
 *
 * ## Was es prüft
 *
 * | Prüfung | Schwere |
 * | --- | --- |
 * | Schlüssel fehlt oder ist leer | **Fehler** |
 * | Schlüssel im Paket, den die Quelle nicht kennt | **Fehler** |
 * | Platzhalter `{…}` stimmen nicht überein (Menge **und** Anzahl) | **Fehler** |
 * | führende/abschließende Leerzeichen weichen ab | **Fehler** |
 * | Wert stimmt mit dem englischen überein, obwohl er ein Wort ist | Verdacht |
 * | Wert enthält `TODO`, `XXX`, `tbd` | Verdacht |
 *
 * `common` und `settings.locale` stammen aus dem Bündel des Sprach-Plugins, nicht aus einem
 * Paket — für sie liefert die Quelle die Texte trotzdem (sie liest die Bündel).
 *
 * ```powershell
 * bun scripts/sprachpruefer.mjs --paket packages/client/locale/de.json
 * bun scripts/sprachpruefer.mjs --paket teil-3.json --nur dsh-client-ui-chat,chat
 * ```
 *
 * Exit: 0 sauber, 1 nur Verdachtsfälle, 2 Fehler (oder Vorbedingung verletzt).
 *
 * @module scripts/sprachpruefer
 */

import { readFileSync } from 'node:fs'

const QUELLE = 'docs/status/sprachquelle.json'

/** Alle `{…}`-Platzhalter mit Anzahl. */
function platzhalter(text) {
  const raus = []
  for (const m of text.matchAll(/\{[^{}]*\}/gu)) raus.push(m[0])
  raus.sort()
  return raus
}

/**
 * Grobe Wortprüfung: besteht der Text nur aus Buchstaben, Leerzeichen und Satzzeichen?
 *
 * **Kürzel sind ausgenommen.** Beim ersten Lauf meldete die Prüfung `json.label: "JSON"` als
 * „unverändert englisch" — zu Recht nach der Regel, aber falsch als Verdacht: `JSON`, `OK`,
 * `ID`, `URL` heißen im Deutschen genauso. Deshalb gilt ein Text, der **nur** aus Großbuchstaben
 * und Ziffern besteht, nicht als Wort.
 *
 * @param {string} text
 * @returns {boolean}
 */
function istWort(text) {
  if (/^[A-Z0-9]+$/u.test(text)) return false
  return /^[\p{L}][\p{L}\s'’.!?,:;/()-]*$/u.test(text) && text.length > 2
}

/**
 * Prüft ein Paket gegen die Quelle — **die Rechenfunktion**, ohne Ausgabe.
 *
 * Sie ist exportiert, damit ein Test sie **rot** laufen lassen kann: eine Prüfung, die nicht
 * rot werden kann, mißt nichts (Arbeitsweise Regel 5). Siehe
 * `scripts/tests/language-checker.test.mjs`.
 *
 * @param {{faecher: Record<string, {englisch: Record<string, string>}>}} quelle
 * @param {Record<string, Record<string, string>>} paket
 * @param {readonly string[]} namen - die zu prüfenden Namensräume
 * @returns {{fehler: string[], verdacht: string[], geprueft: number}}
 */
export function pruefe(quelle, paket, namen) {
  const faecher = quelle.faecher
  const fehler = []
  const verdacht = []
  let geprueft = 0

  for (const ns of namen) {
    const quelleFach = faecher[ns]
    const paketFach = paket[ns]
    if (quelleFach === undefined) {
      fehler.push(`${ns}: Namensraum kennt die Quelle NICHT`)
      continue
    }
    if (paketFach === undefined) {
      verdacht.push(`${ns}: im Paket noch nicht angelegt (${String(Object.keys(quelleFach.englisch).length)} Texte offen)`)
      continue
    }
    const englisch = quelleFach.englisch
    for (const [schluessel, en] of Object.entries(englisch)) {
      geprueft += 1
      const de = paketFach[schluessel]
      if (de === undefined) {
        fehler.push(`${ns} · ${schluessel}: fehlt`)
        continue
      }
      // ---- Ein leerer englischer Wert ist eine ANWEISUNG, kein Versehen ----
      //
      // **Der Fall (gemessen am 14.10.2026).** Der erste Entwurf dieser Prüfung verlangte
      // „kein Wert ist leer" — und ein Übersetzer hielt sich daran, obwohl die Quelle für
      // `chat · message.stepProcess.sharedPrefix` den Wert `""` führt. Er schrieb „Erledigt"
      // hinein, und das ist **falsch**: der Code zieht dieses Präfix nur ab, wenn beide
      // Beschriftungen damit beginnen. Aus einer Prüfregel wurde eine Änderung am Verhalten.
      //
      // Gezählt: im ganzen Kern gibt es **genau einen** leeren Wert und **einen**, der nur
      // aus einem Leerzeichen besteht (`pluginManager · sentenceSeparator` = `" "`). Beide
      // sind Absicht — also verlangt die Prüfung jetzt **Gleichheit**, nicht Fülle.
      if (en.trim() === '') {
        if (de.trim() !== '') {
          fehler.push(
            `${ns} · ${schluessel}: englischer Wert ist leer (${JSON.stringify(en)}), deutscher nicht (${JSON.stringify(de)}) — leer heißt hier „nichts anzeigen"`,
          )
        } else if (de !== en) {
          fehler.push(`${ns} · ${schluessel}: Leerraum weicht ab — ${JSON.stringify(en)} → ${JSON.stringify(de)}`)
        }
        continue
      }
      if (de === '') {
        fehler.push(`${ns} · ${schluessel}: fehlt oder ist leer`)
        continue
      }
      const pEn = platzhalter(en)
      const pDe = platzhalter(de)
      if (pEn.join('|') !== pDe.join('|')) {
        fehler.push(`${ns} · ${schluessel}: Platzhalter [${pEn.join(' ')}] → [${pDe.join(' ')}]`)
      }
      if (/^\s/u.test(en) !== /^\s/u.test(de) || /\s$/u.test(en) !== /\s$/u.test(de)) {
        fehler.push(`${ns} · ${schluessel}: Leerzeichen am Rand weicht ab`)
      }
      if (de === en && istWort(en)) {
        verdacht.push(`${ns} · ${schluessel}: unverändert englisch — „${en}“`)
      }
      if (/\b(?:TODO|XXX|tbd|TBD)\b/u.test(de)) {
        verdacht.push(`${ns} · ${schluessel}: Platzhaltertext im Wert — „${de}“`)
      }
    }
    for (const schluessel of Object.keys(paketFach)) {
      if (englisch[schluessel] === undefined) {
        fehler.push(`${ns} · ${schluessel}: Schlüssel steht NICHT in der Quelle`)
      }
    }
  }

  for (const ns of Object.keys(paket)) {
    if (ns.startsWith('_')) continue
    if (faecher[ns] === undefined) fehler.push(`${ns}: Namensraum kennt die Quelle NICHT`)
  }

  // **Doppelmeldungen zusammenfassen.** Der erste Testlauf zeigte denselben Fehler zweimal:
  // einmal aus der Schleife über die geprüften Namen, einmal aus der Schleife über die
  // Schlüssel des Pakets. Zweimal dasselbe zu melden macht die Zahl falsch, die der Leser
  // für die Menge hält.
  return { fehler: [...new Set(fehler)], verdacht, geprueft }
}

function haupt() {
  const args = process.argv.slice(2)
  const paketPfad = args.includes('--paket') ? args[args.indexOf('--paket') + 1] : undefined
  const nur = args.includes('--nur') ? (args[args.indexOf('--nur') + 1] ?? '').split(',') : undefined

  if (paketPfad === undefined) {
    console.log('Aufruf: bun scripts/sprachpruefer.mjs --paket <datei.json> [--nur ns1,ns2]')
    process.exit(2)
  }

  let quelle
  let paket
  try {
    quelle = JSON.parse(readFileSync(QUELLE, 'utf8'))
    paket = JSON.parse(readFileSync(paketPfad, 'utf8'))
  } catch (f) {
    console.log(`ABBRUCH: Datei nicht lesbar — ${f instanceof Error ? f.message : String(f)}`)
    console.log(`  Quelle: ${QUELLE}  (anlegen: bun scripts/sprachquelle.mjs --json ${QUELLE})`)
    process.exit(2)
  }

  const namen = nur ?? Object.keys(paket).filter((k) => !k.startsWith('_'))
  const { fehler, verdacht, geprueft } = pruefe(quelle, paket, namen)

  console.log(`== Prüfung: ${paketPfad}`)
  console.log(`   gegen:   ${QUELLE}`)
  console.log(`   Fächer geprüft: ${String(namen.length)}   Texte geprüft: ${String(geprueft)}`)
  console.log('')

  if (fehler.length === 0) {
    console.log('FEHLER: keine')
  } else {
    console.log(`FEHLER: ${String(fehler.length)}`)
    for (const f of fehler.slice(0, 40)) console.log(`   ${f}`)
    if (fehler.length > 40) console.log(`   … und ${String(fehler.length - 40)} weitere`)
  }
  console.log('')
  if (verdacht.length === 0) {
    console.log('VERDACHT: keiner')
  } else {
    console.log(`VERDACHT: ${String(verdacht.length)} (kein Fehler, aber ansehen)`)
    for (const v of verdacht.slice(0, 25)) console.log(`   ${v}`)
    if (verdacht.length > 25) console.log(`   … und ${String(verdacht.length - 25)} weitere`)
  }
  console.log('')

  if (fehler.length > 0) {
    console.log(`BEFUND: ${String(fehler.length)} Fehler — das Paket ist so NICHT brauchbar.`)
    process.exit(2)
  }
  if (verdacht.length > 0) {
    console.log(`BEFUND: strukturell sauber, ${String(verdacht.length)} Verdachtsfälle.`)
    process.exit(1)
  }
  console.log('BEFUND: strukturell sauber, kein Verdacht.')
  process.exit(0)
}

if (import.meta.main === true) haupt()
