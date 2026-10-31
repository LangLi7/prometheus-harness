/**
 * `scripts/units-host.mjs` — der Nachweis, daß die Laufzeit **wirkt**.
 *
 * ## Was hier geschieht
 *
 * 1. Die aktive Generation wird gelesen (bzw. `next`, sonst die neueste).
 * 2. Ein Prüfrahmen auf `127.0.0.1` mit einem freien Port startet.
 * 3. Die Laufzeit hängt jedes `kind: plugin` dieser Generation ein — über
 *    `prepare` und `PluginHost`, also über **denselben** Weg, den der Core
 *    benutzen würde.
 * 4. Die Wege, die das Plugin angelegt hat, werden **über echtes HTTP** abgerufen.
 * 5. Alles wird wieder abgesteckt, und es wird geprüft, daß die Wege weg sind.
 *
 * ## Warum das Skript sich selbst beendet
 *
 * Ein Beweislauf, der einen Prozess stehen läßt, ist kein Beweis, sondern eine
 * Bürde: der nächste Lauf findet den Port belegt. Deshalb: starten, messen,
 * abstellen, Exit-Code setzen. Der Exit-Code ist das Ergebnis — `0` heißt, jede
 * der Erwartungen ist eingetroffen.
 *
 * ## Was es ausdrücklich NICHT ist
 *
 * Kein Ersatz für den Core. Es beweist, daß die Kette
 * **Generation → prepare → mount → Weg → unmount** auf einer echten Platte
 * trägt. Es beweist **nicht**, daß der Core-Prozeß sie beim Start aufruft —
 * dafür fehlt die Verdrahtung in `scripts/profile-patch.mjs`, und das steht als
 * Grenze im README.
 *
 * @module scripts/units-host
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { UnitRuntime, starteRahmen, zustand } from '../packages/units/unit-system/src/index.ts'

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Zählt Erwartungen, die nicht eingetroffen sind — der Exit-Code. */
let fehlschlaege = 0

function pruefe(bedingung, beschreibung) {
  const zeichen = bedingung ? 'ok  ' : 'ROT '
  process.stdout.write(`  ${zeichen} ${beschreibung}\n`)
  if (!bedingung) fehlschlaege += 1
}

const anfrage = { projectRoot: WURZEL, hostContract: '0.2.1-alpha.2' }

const rahmen = await starteRahmen()
process.stdout.write(`rahmen     ${rahmen.url} (Port ${String(rahmen.port)})\n`)

/**
 * Der Zustand, den das Plugin ausliefert.
 *
 * **Warum hier `zustand()` und nicht die rohe Datei:** ein Plugin soll das
 * sehen, was ein Mensch auch sieht — sonst wäre die Auskunft des Plugins eine
 * zweite Wahrheit über den Zustand.
 */
const zustandsdienst = async () => {
  const bericht = await zustand(anfrage)
  return {
    current: bericht.current?.number ?? null,
    next: bericht.next?.number ?? null,
    hatDrift: bericht.hatDrift,
    befunde: bericht.befunde.map((befund) => befund.code),
  }
}

const laufzeit = await UnitRuntime.starte({
  ...anfrage,
  services: { routen: rahmen.routen, zustand: zustandsdienst },
})

process.stdout.write(`generation ${String(laufzeit.zustand.generation)}  ${laufzeit.zustand.fingerprint.slice(0, 19)}…\n`)
process.stdout.write(`eingehängt ${laufzeit.zustand.eingehaengt.map((unit) => `${unit.name}@${unit.version}`).join(', ') || '—'}\n`)
for (const eintrag of laufzeit.zustand.uebersprungen) {
  process.stdout.write(`übersprungen ${eintrag.name}: ${eintrag.grund}\n`)
}
for (const befund of laufzeit.zustand.abgewiesen) {
  process.stdout.write(`abgewiesen ${befund.unit ?? '?'}: [${befund.code}] ${befund.message}\n`)
}

process.stdout.write('\nErwartungen:\n')
pruefe(laufzeit.zustand.ok, 'die Laufzeit meldet keinen Abweisungsbefund')
pruefe(laufzeit.zustand.eingehaengt.some((unit) => unit.name === 'pmh-status'), 'das Unit pmh-status ist eingehängt')
const wege = [...rahmen.routen.liste()]
pruefe(wege.includes('/api/pmh/gen/status'), 'der Generationsweg ist belegt')
pruefe(wege.includes('/api/pmh/plugin/info'), 'der Auskunftsweg ist belegt')

const zustandAntwort = await fetch(`${rahmen.url}/api/pmh/gen/status`)
const zustandKoerper = await zustandAntwort.json()
process.stdout.write(`\nGET /api/pmh/gen/status -> ${String(zustandAntwort.status)}\n${JSON.stringify(zustandKoerper)}\n`)
pruefe(zustandAntwort.status === 200, 'der Generationsweg antwortet 200')
pruefe(zustandKoerper?.plugin === 'pmh-status', 'die Antwort nennt das Plugin')
pruefe(zustandKoerper?.generation?.current !== undefined, 'die Antwort trägt den Generationszustand')

const auskunftAntwort = await fetch(`${rahmen.url}/api/pmh/plugin/info`)
const auskunftKoerper = await auskunftAntwort.json()
process.stdout.write(`\nGET /api/pmh/plugin/info -> ${String(auskunftAntwort.status)}\n${JSON.stringify(auskunftKoerper)}\n`)
pruefe(auskunftKoerper?.version === '0.1.0', 'die Auskunft nennt die Fassung des Units')

// --- Abstecken: die Wirkung muß verschwinden -------------------------------
const abgesteckt = await laufzeit.stoppe()
pruefe(abgesteckt.length > 0, 'die Laufzeit hat etwas abgesteckt')
pruefe(rahmen.routen.liste().length === 0, 'nach dem Abstecken ist kein Weg mehr belegt')
const nachher = await fetch(`${rahmen.url}/api/pmh/gen/status`)
pruefe(nachher.status === 404, 'der Weg antwortet nach dem Abstecken 404')

await rahmen.stoppe()

process.stdout.write(fehlschlaege === 0 ? '\nERGEBNIS: alle Erwartungen eingetroffen\n' : `\nERGEBNIS: ${String(fehlschlaege)} Erwartung(en) NICHT eingetroffen\n`)
process.exitCode = fehlschlaege === 0 ? 0 : 1
