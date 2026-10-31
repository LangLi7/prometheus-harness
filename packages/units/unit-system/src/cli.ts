/**
 * `pmh-gen` — die Kommandozeile des Plugin-Managers.
 *
 * Eine **dünne Hülle**: jeder Unterbefehl ruft genau eine Funktion aus
 * `operations.ts` oder `implementierung.ts`. Es gibt keine zweite Umsetzung und
 * damit keinen zweiten Weg, auf dem sich ein Fehler verstecken könnte.
 *
 * Exit-Codes: `0` Erfolg · `1` Befund (Prüfung, Tor, Signatur) · `2` Aufruffehler.
 *
 * @module @prometheus-harness/unit-system/cli
 */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { UnitError } from '@prometheus-harness/unit-export'

import { IMPL_EXTENSION, exportiere, importiere, ladeOderErzeugeSchluessel, pruefeBuendel } from './implementierung.ts'
import { journalLesen, layoutFor } from './generation.ts'
import { fuehrePruefbauAus } from './pruefbau.ts'
import {
  baue,
  liste,
  pruefe,
  pruefeGeneration,
  raeume,
  rolleZurueck,
  schalte,
  vergleicheGenerationen,
  zustand,
  type BasisAnfrage,
} from './operations.ts'

const USAGE = `pmh-gen — Deklaration, Generationen und Bündel

  pmh-gen check    [--declaration <pfad>] [--ausfuehren]
  pmh-gen build    [--declaration <pfad>] [--force] [--mit-pruefung] [--schema-stand <n>]
  pmh-gen pruefe   [<n>]
  pmh-gen list     [--json]
  pmh-gen status   [--json]
  pmh-gen diff     [--von <n>] [--nach <n>]
  pmh-gen switch   [<n>] [--freigabe] [--erzwinge] [--schema-stand <n>]
  pmh-gen boot     [<n>]
  pmh-gen test     [<n>]
  pmh-gen rollback
  pmh-gen prune    --keep <n>
  pmh-gen export   --out <datei>${IMPL_EXTENSION} [--nummer <n>] [--payload] [--ohne-signatur] [--note <text>]
  pmh-gen import   --bundle <datei> [--ohne-schreiben] [--scharf --freigabe]
  pmh-gen inspect  --bundle <datei>
  pmh-gen key      [--show]
  pmh-gen journal  [--limit <n>]

Gemeinsame Flags:
  --project <dir>   Projektwurzel (Vorgabe: das aktuelle Verzeichnis)
  --state <dir>     Zustandsordner, relativ zur Wurzel (Vorgabe: .pmh)
  --actor <name>    wer handelt — steht im Journal
  --json            Ausgabe als JSON

Exit: 0 Erfolg · 1 Befund · 2 Aufruffehler
`

class Aufruffehler extends Error {}

interface Argv {
  readonly befehl: string
  readonly werte: ReadonlyMap<string, string>
  readonly schalter: ReadonlySet<string>
  readonly rest: readonly string[]
}

/** Flags, die einen Wert erwarten. Alles andere ist ein Schalter. */
const MIT_WERT = new Set(['project', 'state', 'actor', 'declaration', 'schema-stand', 'von', 'nach', 'keep', 'out', 'nummer', 'bundle', 'note', 'limit'])

function parseArgs(argv: readonly string[]): Argv {
  const werte = new Map<string, string>()
  const schalter = new Set<string>()
  const rest: string[] = []
  let befehl = ''
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    if (argument.startsWith('--')) {
      const [name = '', inline] = argument.slice(2).split('=', 2)
      if (MIT_WERT.has(name)) {
        const wert = inline ?? argv[index + 1]
        if (wert === undefined || wert.startsWith('--')) {
          throw new Aufruffehler(`Flag --${name} braucht einen Wert.`)
        }
        werte.set(name, wert)
        if (inline === undefined) index += 1
        continue
      }
      schalter.add(name)
      continue
    }
    if (befehl.length === 0) {
      befehl = argument
      continue
    }
    rest.push(argument)
  }
  return { befehl, werte, schalter, rest }
}

function zahl(werte: ReadonlyMap<string, string>, name: string): number | undefined {
  const wert = werte.get(name)
  if (wert === undefined) return undefined
  const zahl = Number.parseInt(wert, 10)
  if (!Number.isInteger(zahl)) throw new Aufruffehler(`--${name} erwartet eine ganze Zahl, bekommen: "${wert}".`)
  return zahl
}

function basis(argv: Argv): BasisAnfrage {
  const projectRoot = argv.werte.get('project') ?? process.cwd()
  const actor = argv.werte.get('actor')
  const schemaStand = zahl(argv.werte, 'schema-stand')
  return {
    projectRoot: resolve(projectRoot),
    ...(argv.werte.get('state') === undefined ? {} : { stateDir: argv.werte.get('state') as string }),
    ...(actor === undefined ? {} : { actor }),
    ...(schemaStand === undefined ? {} : { schemaStand }),
  }
}

function meldeBefunde(befunde: readonly UnitError[]): void {
  for (const befund of befunde) {
    process.stderr.write(`  [${befund.code}] ${befund.at === undefined ? '' : `${befund.at}: `}${befund.message}\n`)
  }
}

function json(wert: unknown): void {
  process.stdout.write(`${JSON.stringify(wert, null, 2)}\n`)
}

async function fuehreAus(argv: Argv): Promise<number> {
  const request = basis(argv)
  const alsJson = argv.schalter.has('json')
  const deklarationPfad = argv.werte.get('declaration')

  switch (argv.befehl) {
    case 'check': {
      const bericht = await pruefe({
        ...request,
        ...(deklarationPfad === undefined ? {} : { declarationPath: resolve(deklarationPfad) }),
      })
      if (alsJson) {
        json({ ok: bericht.ok, befunde: bericht.befunde, warnungen: bericht.warnungen, units: bericht.closure?.units.length ?? 0 })
      }
      else {
        process.stdout.write(`prüfung   ${bericht.ok ? 'ok' : 'BEFUND'}\n`)
        if (bericht.closure !== undefined) {
          process.stdout.write(`units     ${String(bericht.closure.units.length)}\n`)
          process.stdout.write(`takt      ${bericht.closure.takt}\n`)
          process.stdout.write(`dateien   ${String(bericht.closure.files.length)}\n`)
        }
        if (bericht.warnungen.length > 0) process.stdout.write(`warnungen ${String(bericht.warnungen.length)}\n`)
      }
      if (!bericht.ok) {
        if (!alsJson) meldeBefunde(bericht.befunde)
        return 1
      }
      // `--ausfuehren` fährt den Prüfbau wirklich — das ist der Unterschied
      // zwischen „die Deklaration ist stimmig" und „das System trägt".
      if (argv.schalter.has('ausfuehren') && bericht.declaration !== undefined) {
        const pruefung = await fuehrePruefbauAus(bericht.declaration.checks, request.projectRoot)
        if (alsJson) json({ ok: bericht.ok && pruefung.ok, pruefung })
        else {
          for (const schritt of pruefung.schritte) {
            process.stdout.write(`  ${schritt.ok ? 'ok   ' : 'ROT  '} ${schritt.name.padEnd(22)} ${String(schritt.dauerMs).padStart(6)} ms${schritt.required ? '' : '  (unverbindlich)'}\n`)
            if (!schritt.ok && schritt.ausgabe.length > 0) {
              for (const zeile of schritt.ausgabe.split('\n').slice(-6)) process.stdout.write(`        ${zeile}\n`)
            }
          }
          process.stdout.write(`prüfbau   ${pruefung.ok ? 'grün' : `ROT — ${pruefung.grund}`}\n`)
        }
        return pruefung.ok ? 0 : 1
      }
      return 0
    }

    case 'build': {
      const ergebnis = await baue({
        ...request,
        ...(deklarationPfad === undefined ? {} : { declarationPath: resolve(deklarationPfad) }),
        ...(argv.schalter.has('force') ? { force: true } : {}),
        ...(argv.schalter.has('mit-pruefung') ? { mitPruefung: true } : {}),
      })
      if (!ergebnis.ok || ergebnis.generation === undefined) {
        if (alsJson) json({ ok: false, befunde: ergebnis.befunde })
        else meldeBefunde(ergebnis.befunde)
        return 1
      }
      const generation = ergebnis.generation
      if (alsJson) {
        json({ ok: true, generation: generation.number, fingerprint: generation.fingerprint, uebersprungen: ergebnis.uebersprungen })
      }
      else {
        process.stdout.write(`generation ${String(generation.number)}${ergebnis.uebersprungen ? ' (unverändert — nicht neu gebaut)' : ''}\n`)
        process.stdout.write(`fingerabdruck ${generation.fingerprint}\n`)
        process.stdout.write(`units     ${String(generation.units.length)}\n`)
        process.stdout.write(`takt      ${generation.takt}${generation.irreversible ? ' · EINBAHNSTRASSE' : ''}\n`)
        process.stdout.write('wirkung   keine — der Zeiger bleibt, wo er ist\n')
      }
      return 0
    }

    case 'pruefe': {
      const ausRest = argv.rest[0]
      if (ausRest !== undefined && !/^\d+$/.test(ausRest)) {
        throw new Aufruffehler(`"${ausRest}" ist keine Generationsnummer.`)
      }
      const nummer = ausRest === undefined ? zahl(argv.werte, 'nummer') : Number.parseInt(ausRest, 10)
      const ergebnis = await pruefeGeneration({ ...request, ...(nummer === undefined ? {} : { nummer }) })
      if (alsJson) json(ergebnis)
      else if (ergebnis.pruefung !== undefined) {
        for (const schritt of ergebnis.pruefung.schritte) {
          process.stdout.write(`  ${schritt.ok ? 'ok   ' : 'ROT  '} ${schritt.name.padEnd(22)} ${String(schritt.dauerMs).padStart(6)} ms\n`)
        }
        process.stdout.write(`generation ${String(ergebnis.generation?.number)} · prüfbau ${ergebnis.pruefung.ok ? 'grün' : `ROT — ${ergebnis.pruefung.grund}`}\n`)
      }
      if (!ergebnis.ok && ergebnis.befunde.length > 0) meldeBefunde(ergebnis.befunde)
      return ergebnis.ok ? 0 : 1
    }

    case 'list': {
      const eintraege = await liste(request)
      if (alsJson) {
        json(eintraege)
        return 0
      }
      if (eintraege.length === 0) {
        process.stdout.write('keine Generationen\n')
        return 0
      }
      for (const eintrag of eintraege) {
        const marke = eintrag.aktiv ? 'AKTIV' : eintrag.vorgemerkt ? 'NEXT ' : '     '
        process.stdout.write(
          `  ${marke} ${String(eintrag.number).padStart(4)}  ${eintrag.createdAt}  ${String(eintrag.units).padStart(2)} Units  ${eintrag.takt.padEnd(4)}  ${eintrag.pruefung.padEnd(6)}  ${eintrag.fingerprint.slice(7, 19)}${eintrag.irreversible ? '  einbahnig' : ''}${eintrag.wechselbar ? '' : '  NICHT wechselbar'}\n`,
        )
      }
      return 0
    }

    case 'status': {
      const bericht = await zustand({
        ...request,
        ...(deklarationPfad === undefined ? {} : { declarationPath: resolve(deklarationPfad) }),
      })
      if (alsJson) {
        json({
          current: bericht.current?.number ?? null,
          next: bericht.next?.number ?? null,
          hatDrift: bericht.hatDrift,
          ausstehend: bericht.ausstehend?.aenderungen ?? [],
          drift: bericht.drift?.aenderungen ?? [],
          befunde: bericht.befunde,
        })
        return bericht.befunde.length === 0 ? 0 : 1
      }
      process.stdout.write(`current   ${bericht.current === undefined ? '— (Generation 0)' : `Generation ${String(bericht.current.number)}`}\n`)
      process.stdout.write(`next      ${bericht.next === undefined ? '—' : `Generation ${String(bericht.next.number)}`}\n`)
      if (bericht.ausstehend !== undefined && !bericht.ausstehend.identisch) {
        process.stdout.write(`ausstehend ${String(bericht.ausstehend.aenderungen.length)} Änderung(en), Takt ${bericht.ausstehend.benoetigt}\n`)
        for (const aenderung of bericht.ausstehend.aenderungen) {
          process.stdout.write(`  ${aenderung.art.padEnd(11)} ${aenderung.name}${aenderung.von === undefined ? '' : ` ${aenderung.von}`}${aenderung.nach === undefined ? '' : ` -> ${aenderung.nach}`}\n`)
        }
      }
      if (bericht.hatDrift) {
        process.stdout.write('drift     die Deklaration paßt NICHT zur laufenden Generation\n')
        for (const aenderung of bericht.drift?.aenderungen ?? []) {
          process.stdout.write(`  ${aenderung.art.padEnd(11)} ${aenderung.name}${aenderung.von === undefined ? '' : ` ${aenderung.von}`}${aenderung.nach === undefined ? '' : ` -> ${aenderung.nach}`}\n`)
        }
        process.stdout.write('          (gemeldet, nicht geglättet — entschieden wird von einem Menschen)\n')
      }
      else if (bericht.current !== undefined) {
        process.stdout.write('drift     keine\n')
      }
      if (bericht.befunde.length > 0) meldeBefunde(bericht.befunde)
      return bericht.befunde.length === 0 ? 0 : 1
    }

    case 'diff': {
      const von = zahl(argv.werte, 'von')
      const nach = zahl(argv.werte, 'nach')
      const vergleich = await vergleicheGenerationen({
        ...request,
        ...(von === undefined ? {} : { von }),
        ...(nach === undefined ? {} : { nach }),
      })
      if (alsJson) {
        json(vergleich)
        return 0
      }
      if (vergleich.identisch) {
        process.stdout.write('keine Unterschiede\n')
        return 0
      }
      for (const aenderung of vergleich.aenderungen) {
        process.stdout.write(`  ${aenderung.art.padEnd(11)} ${aenderung.name}${aenderung.von === undefined ? '' : ` ${aenderung.von}`}${aenderung.nach === undefined ? '' : ` -> ${aenderung.nach}`}\n`)
      }
      for (const pfad of vergleich.dateienGeaendert) process.stdout.write(`  datei       ${pfad}\n`)
      process.stdout.write(`takt        ${vergleich.benoetigt}${vergleich.irreversible ? ' · EINBAHNSTRASSE' : ''}\n`)
      return 0
    }

    case 'switch':
    case 'boot':
    case 'test': {
      const ausRest = argv.rest[0]
      if (ausRest !== undefined && !/^\d+$/.test(ausRest)) {
        throw new Aufruffehler(`"${ausRest}" ist keine Generationsnummer.`)
      }
      const nummer = ausRest === undefined ? zahl(argv.werte, 'nummer') : Number.parseInt(ausRest, 10)
      const ergebnis = await schalte({
        ...request,
        ...(nummer === undefined ? {} : { nummer }),
        art: argv.befehl === 'boot' ? 'boot' : argv.befehl === 'test' ? 'test' : 'switch',
        ...(argv.schalter.has('freigabe') ? { freigabe: true } : {}),
        ...(argv.schalter.has('erzwinge') ? { erzwinge: true } : {}),
      })
      if (!ergebnis.ok) {
        if (alsJson) json({ ok: false, befunde: ergebnis.befunde, quittung: ergebnis.quittung ?? null })
        else {
          meldeBefunde(ergebnis.befunde)
          if (ergebnis.quittung !== undefined) process.stdout.write(`quittung  ${ergebnis.quittung.hinweis}\n`)
        }
        return 1
      }
      if (alsJson) json({ ok: true, zeiger: ergebnis.zeiger, generation: ergebnis.generation?.number, quittung: ergebnis.quittung ?? null })
      else {
        process.stdout.write(`zeiger    ${String(ergebnis.zeiger)}\n`)
        process.stdout.write(`generation ${String(ergebnis.generation?.number)}\n`)
        if (ergebnis.vergleich !== undefined && !ergebnis.vergleich.identisch) {
          process.stdout.write(`änderungen ${String(ergebnis.vergleich.aenderungen.length)}, Takt ${ergebnis.vergleich.benoetigt}\n`)
        }
        // **Die Quittung ist der ehrliche Teil.** Ohne sie sehen „fortgesetzt" und
        // „nicht fortgesetzt" für den Aufrufer gleich aus.
        if (ergebnis.quittung !== undefined) {
          process.stdout.write(`quittung  ${ergebnis.quittung.hinweis}\n`)
        }
      }
      return 0
    }

    case 'rollback': {
      const ergebnis = await rolleZurueck(request)
      if (!ergebnis.ok) {
        if (alsJson) json({ ok: false, befunde: ergebnis.befunde })
        else meldeBefunde(ergebnis.befunde)
        return 1
      }
      if (alsJson) json({ ok: true, von: ergebnis.von?.number ?? null, nach: ergebnis.nach?.number ?? null })
      else process.stdout.write(`zurück    ${String(ergebnis.von?.number)} -> ${String(ergebnis.nach?.number)}\n`)
      return 0
    }

    case 'prune': {
      const keep = zahl(argv.werte, 'keep')
      if (keep === undefined) throw new Aufruffehler('prune braucht --keep <n>.')
      const ergebnis = await raeume({ ...request, behalten: keep })
      if (alsJson) json(ergebnis)
      else {
        process.stdout.write(`behalten  ${ergebnis.behalten.join(', ') || '—'}\n`)
        process.stdout.write(`entfernt  ${ergebnis.entfernt.join(', ') || '—'}\n`)
      }
      return 0
    }

    case 'export': {
      const out = argv.werte.get('out')
      if (out === undefined) throw new Aufruffehler(`export braucht --out <datei>${IMPL_EXTENSION}.`)
      const nummer = zahl(argv.werte, 'nummer')
      const note = argv.werte.get('note')
      const ergebnis = await exportiere({
        ...request,
        out,
        ...(nummer === undefined ? {} : { nummer }),
        ...(argv.schalter.has('payload') ? { payload: true } : {}),
        ...(argv.schalter.has('ohne-signatur') ? { signiere: false } : {}),
        ...(note === undefined ? {} : { notes: [note] }),
      })
      if (alsJson) json(ergebnis)
      else {
        process.stdout.write(`bündel    ${ergebnis.out}\n`)
        process.stdout.write(`digest    ${ergebnis.digest}\n`)
        process.stdout.write(`herkunft  ${ergebnis.signiert ? `signiert (${String(ergebnis.schluessel)})` : 'UNSIGNIERT — die Herkunft ist unbelegt'}\n`)
        process.stdout.write(`dateien   ${String(ergebnis.dateien)} · nutzlast ${String(ergebnis.nutzlast)} · ${String(ergebnis.bytes)} Bytes\n`)
      }
      return 0
    }

    case 'inspect': {
      const bundle = argv.werte.get('bundle')
      if (bundle === undefined) throw new Aufruffehler('inspect braucht --bundle <datei>.')
      const layout = layoutFor(request.projectRoot, request.stateDir)
      const bericht = await pruefeBuendel(bundle, layout)
      if (alsJson) {
        json({
          ok: bericht.ok,
          digest: bericht.implementierung?.digest ?? null,
          signaturGeprueft: bericht.signaturGeprueft,
          geprueftMit: bericht.geprueftMit ?? null,
          units: bericht.implementierung?.units.length ?? 0,
          befunde: bericht.befunde,
        })
      }
      else {
        process.stdout.write(`prüfung   ${bericht.ok ? 'ok' : 'BEFUND'}\n`)
        process.stdout.write(`digest    ${bericht.implementierung?.digest ?? '—'}\n`)
        process.stdout.write(`herkunft  ${bericht.signaturGeprueft ? `geprüft mit ${String(bericht.geprueftMit)}` : 'NICHT geprüft'}\n`)
        process.stdout.write(`units     ${String(bericht.implementierung?.units.length ?? 0)}\n`)
      }
      if (!bericht.ok) meldeBefunde(bericht.befunde)
      return bericht.ok ? 0 : 1
    }

    case 'import': {
      const bundle = argv.werte.get('bundle')
      if (bundle === undefined) throw new Aufruffehler('import braucht --bundle <datei>.')
      const ergebnis = await importiere({
        ...request,
        datei: bundle,
        ...(argv.schalter.has('ohne-schreiben') ? { schreibe: false } : {}),
        ...(argv.schalter.has('scharf') ? { scharf: true } : {}),
        ...(argv.schalter.has('freigabe') ? { freigabe: true } : {}),
      })
      if (!ergebnis.ok) {
        if (alsJson) json({ ok: false, befunde: ergebnis.befunde, geschrieben: ergebnis.geschrieben })
        else {
          meldeBefunde(ergebnis.befunde)
          if (ergebnis.geschrieben.length > 0) process.stdout.write(`geschrieben dennoch: ${ergebnis.geschrieben.join(', ')}\n`)
        }
        return 1
      }
      if (alsJson) json(ergebnis)
      else {
        process.stdout.write(`generation ${String(ergebnis.generation)} · zeiger ${String(ergebnis.zeiger)}\n`)
        process.stdout.write(`geschrieben ${String(ergebnis.geschrieben.length)} Datei(en)\n`)
        process.stdout.write(`wirkung   ${ergebnis.zeiger === 'current' ? 'SCHARF' : 'nur vorbereitet — scharf wird es mit "switch"'}\n`)
      }
      return 0
    }

    case 'key': {
      const layout = layoutFor(request.projectRoot, request.stateDir)
      const schluessel = await ladeOderErzeugeSchluessel(layout)
      if (alsJson) json({ abdruck: schluessel.abdruck, oeffentlich: schluessel.oeffentlich })
      else if (argv.schalter.has('show')) {
        process.stdout.write(`abdruck    ${schluessel.abdruck}\n`)
        process.stdout.write(schluessel.oeffentlich)
      }
      else {
        process.stdout.write(`abdruck    ${schluessel.abdruck}\n`)
        process.stdout.write(`ablage     ${layout.keysDir}\n`)
      }
      return 0
    }

    case 'journal': {
      const layout = layoutFor(request.projectRoot, request.stateDir)
      const limit = zahl(argv.werte, 'limit') ?? 20
      const eintraege = await journalLesen(layout, limit)
      if (alsJson) json(eintraege)
      else {
        for (const eintrag of eintraege) {
          process.stdout.write(`  ${eintrag.at}  ${eintrag.event.padEnd(8)} ${eintrag.generation === undefined ? '' : `#${String(eintrag.generation)}`}  ${eintrag.detail ?? ''}\n`)
        }
      }
      return 0
    }

    case 'help':
    case '--help':
    case '': {
      process.stdout.write(USAGE)
      return argv.befehl === '' ? 2 : 0
    }

    default:
      throw new Aufruffehler(`Unbekannter Befehl "${argv.befehl}". "pmh-gen help" zeigt alle.`)
  }
}

// Nur ausführen, wenn dieses Modul **direkt** gerufen wurde. Ohne diese Prüfung
// würde ein Import (etwa aus einer Prüfdatei) die Kommandozeile starten.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const argv = parseArgs(process.argv.slice(2))
    process.exitCode = await fuehreAus(argv)
  }
  catch (error) {
    if (error instanceof Aufruffehler) {
      process.stderr.write(`Aufruffehler: ${error.message}\n\n${USAGE}`)
      process.exitCode = 2
    }
    else {
      const befund = (error as { error?: UnitError }).error
      if (befund !== undefined) {
        process.stderr.write(`[${befund.code}] ${befund.message}\n`)
        process.exitCode = 1
      }
      else {
        process.stderr.write(`${(error as Error).message}\n`)
        process.exitCode = 1
      }
    }
  }
}
