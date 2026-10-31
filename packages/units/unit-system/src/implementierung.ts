/**
 * Implementierungsbündel — „Rezept statt Inhalt", mit Herkunft.
 *
 * **Das Problem, das dieses Modul löst.** Man kann den Harness nicht
 * verschicken: frischer Klon 88 MB, gebaut 2 491 MB. Man kann ihn auch nicht
 * „einfach kopieren", ohne Geheimnisse, Sitzungen und fremde Lizenzen
 * mitzuschleppen. Was sich verschicken läßt, ist das **Rezept**: die
 * Deklaration, die Schichtdateien, die Pins — und, wenn man will, die eigenen
 * Quellen.
 *
 * **Was ausdrücklich NICHT mitreist**, und zwar unabhängig von jeder Option:
 *
 * | Nicht mitnehmen | Warum |
 * |---|---|
 * | `node_modules`, `target`, `.pmh-build`, Caches | genau die 2,49 GB, die man nicht verschicken will |
 * | Sitzungen (`sessions/**`, `session.v4.jsonl.zstd`) | das ist der Zustand **eines** Menschen |
 * | Geheimnisse (`.credentials.yaml`, `.env`, `user_secrets`, `claim.txt`) | ein Bündel ist Fremddaten; Geheimnisse darin sind ein Leck mit Anleitung |
 * | `.pmh/` | Zustand, nicht Deklaration — er ist aus ihr herstellbar |
 *
 * **Und die Grenze, die keine Signatur aufhebt.** Eine Signatur beweist, **wer**
 * ein Bündel gebaut hat, nicht **was** es tut. Der Kern sagt es selbst:
 * installierter Host-Code läuft im Prozeß und außerhalb des Arbeitsbereich-
 * Sandkastens. Ein Import ist damit gleichbedeutend mit Codeausführung. Deshalb
 * gilt hier **fail closed**: ohne geprüften Schlüssel wird nichts entpackt.
 *
 * @module @prometheus-harness/unit-system/implementierung
 */

import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import {
  UnitFailure,
  unitError,
  validateRelativePath,
  type UnitError,
  type UnitKind,
  type UnitLanguage,
  type UnitReload,
} from '@prometheus-harness/unit-export'

import { kanonisch, sammleDateien, sha256Hex, zuPosix } from './hash.ts'
import { journalAnhaengen, layoutFor, leseGeneration, leseZeiger, listGenerationen, type StateLayout } from './generation.ts'
import { baue, schalte, type BasisAnfrage } from './operations.ts'
import { declarationPath } from './declaration.ts'

/** Das Format dieses Bündels. Ein höherer Wert wird abgelehnt, nicht geraten. */
export const IMPL_FORMAT = 1

/** Die Endung einer Implementierungsdatei. */
export const IMPL_EXTENSION = '.pmhimpl'

/** Wer dieses Format schreibt. */
export const IMPL_CREATED_BY = '@prometheus-harness/unit-system'

/** Eine Datei im Bündel — Inhalt optional, je nach Stufe des Teilens. */
export interface ImplDatei {
  /** Relativ zur Projektwurzel, immer mit `/`, nie absolut. */
  readonly path: string
  readonly sha256: string
  readonly size: number
  /** Der Inhalt, base64 — fehlt bei reinen Rezepten. */
  readonly content?: string
}

/** Ein Unit im Bündel — als Deklaration, nicht als Quelltext. */
export interface ImplUnit {
  readonly name: string
  readonly version: string
  readonly kind: UnitKind
  readonly language: UnitLanguage
  readonly reload: UnitReload
  readonly irreversible: boolean
  /** Der Inhaltsdigest des Unit-Ordners beim Export. */
  readonly contentDigest: string
  readonly directory: string
}

/** Die Herkunft einer Datei. */
export interface Signatur {
  readonly alg: 'ed25519'
  /** Der Fingerabdruck des öffentlichen Schlüssels, der geprüft werden muß. */
  readonly key: string
  /** Die Signatur über den Digest, base64. */
  readonly value: string
}

/** Ein Implementierungsbündel. */
export interface Implementierung {
  readonly format: 1
  readonly kind: 'implementation'
  readonly createdAt: string
  readonly createdBy: string
  readonly core: { readonly version: string; readonly contract?: string }
  readonly platform: string
  /** Die erwartete Datenbankfassung, `null` = nicht deklariert. */
  readonly schema: number | null
  /** Der Fingerabdruck der Generation, aus der exportiert wurde. */
  readonly fingerprint: string
  /** Die rohe Deklaration, damit sie beim Empfänger unverändert ankommt. */
  readonly declaration: unknown
  readonly units: readonly ImplUnit[]
  /** Schicht- und Pindateien; Inhalt ist normalerweise dabei (klein). */
  readonly files: readonly ImplDatei[]
  /** Unit-Quellen; nur mit `payload`. */
  readonly payload: readonly ImplDatei[]
  /** SHA-256 über das kanonische Manifest ohne `digest` und `signature`. */
  readonly digest: string
  readonly signature?: Signatur
  /** Was der Absender sagen will; erscheint beim Empfänger. */
  readonly notes: readonly string[]
}

/** Was ein Export mitnimmt. */
export interface ExportAnfrage extends BasisAnfrage {
  /** Die Zieldatei. */
  readonly out: string
  /** Die Generation, aus der exportiert wird; ohne Angabe die aktive. */
  readonly nummer?: number
  /** `true` = die Quellen der Units mitnehmen (größer, aber selbsttragend). */
  readonly payload?: boolean
  /** `false` = nicht signieren (dann ist die Herkunft unbelegt, und das steht drin). */
  readonly signiere?: boolean
  /** Was der Absender mitgeben will. */
  readonly notes?: readonly string[]
}

/** Das Ergebnis eines Exports. */
export interface ExportErgebnis {
  readonly out: string
  readonly digest: string
  readonly signiert: boolean
  readonly schluessel?: string
  readonly dateien: number
  readonly nutzlast: number
  readonly bytes: number
  /** Welche Generation exportiert wurde, und woher die Nummer stammt. */
  readonly generation: number
  readonly quelle: 'nummer' | 'current' | 'next' | 'neueste'
}

function schluesselDateien(layout: StateLayout): { privat: string; oeffentlich: string } {
  return {
    privat: join(layout.keysDir, 'impl-signing.pem'),
    oeffentlich: join(layout.keysDir, 'impl-signing.pub'),
  }
}

/** Der Fingerabdruck eines öffentlichen Schlüssels (SHA-256 über die DER-Form). */
export function schluesselAbdruck(oeffentlichPem: string): string {
  const der = createPublicKey(oeffentlichPem).export({ type: 'spki', format: 'der' })
  return `sha256:${createHash('sha256').update(der).digest('hex')}`
}

/** Lädt das Signaturschlüsselpaar oder erzeugt es beim ersten Mal. */
export async function ladeOderErzeugeSchluessel(layout: StateLayout): Promise<{ privat: string; oeffentlich: string; abdruck: string }> {
  const dateien = schluesselDateien(layout)
  await mkdir(layout.keysDir, { recursive: true })
  let privat: string
  let oeffentlich: string
  try {
    privat = await readFile(dateien.privat, 'utf8')
    oeffentlich = await readFile(dateien.oeffentlich, 'utf8')
  }
  catch {
    const paar = generateKeyPairSync('ed25519')
    privat = paar.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    oeffentlich = paar.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    await writeFile(dateien.privat, privat, { encoding: 'utf8', mode: 0o600 })
    await writeFile(dateien.oeffentlich, oeffentlich, 'utf8')
  }
  return { privat, oeffentlich, abdruck: schluesselAbdruck(oeffentlich) }
}

/**
 * Die öffentlichen Schlüssel, denen dieser Rechner traut.
 *
 * **Warum eine Ablage und kein Parameter.** Ein Vertrauen, das bei jedem Aufruf
 * neu übergeben wird, ist kein Vertrauen — es ist eine Gewohnheit. Wer einem
 * Absender traut, legt seinen Schlüssel **einmal** in `.pmh/keys/*.pub` ab; ab
 * dann gilt er, bis jemand ihn löscht.
 */
export async function vertrauensschluessel(layout: StateLayout): Promise<readonly { datei: string; pem: string; abdruck: string }[]> {
  let namen: string[]
  try {
    namen = await readdir(layout.keysDir)
  }
  catch {
    return []
  }
  const gefunden: { datei: string; pem: string; abdruck: string }[] = []
  for (const name of namen.filter((eintrag) => eintrag.endsWith('.pub')).sort()) {
    try {
      const pem = await readFile(join(layout.keysDir, name), 'utf8')
      gefunden.push({ datei: name, pem, abdruck: schluesselAbdruck(pem) })
    }
    catch {
      // Ein unlesbarer Schlüssel ist kein Vertrauen. Er wird übergangen.
    }
  }
  return gefunden
}

/**
 * Der Digest eines Bündels.
 *
 * Gerechnet über **alle** Felder außer `digest` und `signature` — nicht über
 * eine handverlesene Liste. Der Unterschied ist nicht kosmetisch: eine Liste
 * wäre bei jedem neuen Feld still unvollständig, und ein Feld, das nicht im
 * Digest steht, ist ein Feld, das niemand bemerkt, wenn es verändert wird.
 */
export function buendelDigest(buendel: unknown): string {
  const quelle = (typeof buendel === 'object' && buendel !== null ? buendel : {}) as Record<string, unknown>
  const ziel: Record<string, unknown> = {}
  for (const [schluessel, wert] of Object.entries(quelle)) {
    if (schluessel === 'digest' || schluessel === 'signature') continue
    ziel[schluessel] = wert
  }
  return `sha256:${sha256Hex(kanonisch(ziel))}`
}

function dateiEintrag(path: string, sha256: string, size: number, content?: string): ImplDatei {
  return { path, sha256, size, ...(content === undefined ? {} : { content }) }
}

/**
 * Exportiert eine Generation als Implementierungsbündel.
 *
 * **Was hier bewußt fehlt:** jede Form von „und dann nimm noch die Sitzungen
 * mit". Es gibt sie nicht, und es wird sie nicht geben — ein Bündel, das
 * Sitzungen trägt, ist ein Bündel, das niemand weitergeben darf.
 */
export async function exportiere(request: ExportAnfrage): Promise<ExportErgebnis> {
  const layout = layoutFor(resolve(request.projectRoot), request.stateDir ?? undefined)

  // **Dieselbe Reihenfolge wie beim Umschalten, und aus demselben Grund:** erst
  // was läuft, dann was vorbereitet ist, zuletzt das zuletzt Gebaute. Ohne den
  // Rückfall wäre der einfache Weg — importieren und gleich weitergeben —
  // unmöglich, weil ein Import absichtlich nur `next` setzt.
  let nummer = request.nummer
  let quelle: 'nummer' | 'current' | 'next' | 'neueste' = 'nummer'
  if (nummer === undefined) {
    const aktiv = await leseZeiger(layout, 'current')
    const vorgemerkt = await leseZeiger(layout, 'next')
    if (aktiv !== undefined) {
      nummer = aktiv
      quelle = 'current'
    }
    else if (vorgemerkt !== undefined) {
      nummer = vorgemerkt
      quelle = 'next'
    }
    else {
      const alle = await listGenerationen(layout)
      nummer = alle.length === 0 ? undefined : alle[alle.length - 1]
      quelle = 'neueste'
    }
  }
  if (nummer === undefined) {
    throw new UnitFailure(unitError(
      'generation_pointer_missing',
      'Es gibt keine Generation: weder aktiv noch vorgemerkt, und gebaut wurde auch nichts. Es gibt nichts zu exportieren.',
    ))
  }
  const generation = await leseGeneration(layout, nummer)
  const jetzt = request.jetzt ?? new Date().toISOString()

  const deklarationText = await readFile(declarationPath(request.projectRoot), 'utf8')
  const deklaration = JSON.parse(deklarationText) as unknown

  // --- 1. Die deklarierten Dateien (Schichten, Pins) ----------------------
  const files: ImplDatei[] = []
  for (const datei of generation.files) {
    try {
      const bytes = await readFile(join(resolve(request.projectRoot), datei.path))
      files.push(dateiEintrag(datei.path, datei.sha256, datei.size, bytes.toString('base64')))
    }
    catch {
      // Eine deklarierte Datei ist verschwunden, seit die Generation gebaut
      // wurde. Das ist ein Befund und kein Grund, ein halbes Bündel zu schreiben.
      throw new UnitFailure(unitError(
        'implbundle_file_digest_mismatch',
        `Die deklarierte Datei "${datei.path}" ist nicht mehr lesbar; das Bündel wäre unvollständig.`,
      ))
    }
  }

  // --- 2. Optional: die Quellen der Units -------------------------------
  const payload: ImplDatei[] = []
  if (request.payload === true) {
    for (const unit of generation.units) {
      const ordner = resolve(request.projectRoot, unit.directory)
      const dateien = await sammleDateien(ordner)
      for (const datei of dateien) {
        const bytes = await readFile(join(ordner, datei.path))
        payload.push(dateiEintrag(`${unit.directory}/${datei.path}`, datei.sha256, datei.size, bytes.toString('base64')))
      }
    }
    payload.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  }

  const ohneDigest: Omit<Implementierung, 'digest'> = {
    format: IMPL_FORMAT,
    kind: 'implementation',
    createdAt: jetzt,
    createdBy: IMPL_CREATED_BY,
    core: generation.core,
    platform: generation.platform,
    schema: generation.schema,
    fingerprint: generation.fingerprint,
    declaration: deklaration,
    units: generation.units.map((unit) => ({
      name: unit.name,
      version: unit.version,
      kind: unit.kind,
      language: unit.language,
      reload: unit.reload,
      irreversible: unit.irreversible,
      contentDigest: unit.contentDigest,
      directory: unit.directory,
    })),
    files,
    payload,
    notes: [...(request.notes ?? [])],
  }
  const digest = buendelDigest(ohneDigest)

  let signatur: Signatur | undefined
  if (request.signiere !== false) {
    const schluessel = await ladeOderErzeugeSchluessel(layout)
    const wert = sign(null, Buffer.from(digest, 'utf8'), schluessel.privat)
    signatur = { alg: 'ed25519', key: schluessel.abdruck, value: wert.toString('base64') }
  }

  const implementierung: Implementierung = { ...ohneDigest, digest, ...(signatur === undefined ? {} : { signature: signatur }) }
  const text = `${JSON.stringify(implementierung, null, 2)}\n`
  await mkdir(dirname(resolve(request.out)), { recursive: true })
  await writeFile(resolve(request.out), text, 'utf8')

  await journalAnhaengen(layout, {
    at: jetzt,
    event: 'export',
    generation: generation.number,
    fingerprint: generation.fingerprint,
    ...(request.actor === undefined ? {} : { actor: request.actor }),
    detail: `${String(files.length)} Datei(en), ${String(payload.length)} Nutzlast, ${signatur === undefined ? 'unsigniert' : `signiert ${signatur.key}`}`,
  })

  return {
    out: resolve(request.out),
    digest,
    signiert: signatur !== undefined,
    ...(signatur === undefined ? {} : { schluessel: signatur.key }),
    dateien: files.length,
    nutzlast: payload.length,
    bytes: Buffer.byteLength(text, 'utf8'),
    generation: generation.number,
    quelle,
  }
}

/** Das Ergebnis einer Prüfung. */
export interface PruefErgebnis {
  readonly ok: boolean
  readonly befunde: readonly UnitError[]
  readonly implementierung?: Implementierung
  /** Der Schlüssel, gegen den die Signatur geprüft wurde. */
  readonly geprueftMit?: string
  readonly signaturGeprueft: boolean
}

/**
 * Prüft ein Bündel vollständig, ohne etwas zu schreiben.
 *
 * Die Reihenfolge ist Absicht: Format → Digest → jeder Dateihash → Signatur.
 * Eine Signatur über einen falschen Digest wäre eine bestätigte Unwahrheit.
 */
export async function pruefeBuendel(datei: string, layout: StateLayout): Promise<PruefErgebnis> {
  const befunde: UnitError[] = []
  let text: string
  try {
    text = await readFile(resolve(datei), 'utf8')
  }
  catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') {
      return { ok: false, befunde: [unitError('implbundle_missing', `Kein Bündel unter "${datei}".`)], signaturGeprueft: false }
    }
    return { ok: false, befunde: [unitError('implbundle_unreadable', `Bündel nicht lesbar: ${(error as Error).message}`)], signaturGeprueft: false }
  }

  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  }
  catch (error) {
    return { ok: false, befunde: [unitError('implbundle_not_json', `Bündel ist kein gültiges JSON: ${(error as Error).message}`)], signaturGeprueft: false }
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, befunde: [unitError('implbundle_not_object', 'Bündel ist kein JSON-Objekt.')], signaturGeprueft: false }
  }

  const buendel = json as Implementierung
  if (buendel.format !== IMPL_FORMAT || buendel.kind !== 'implementation') {
    return {
      ok: false,
      befunde: [unitError(
        'implbundle_format_unsupported',
        `Format ${String(buendel.format)} / Art ${String(buendel.kind)}; dieser Stand liest Format ${String(IMPL_FORMAT)}.`,
      )],
      signaturGeprueft: false,
    }
  }

  // --- Digest -------------------------------------------------------------
  const erwartet = buendelDigest(buendel)
  if (erwartet !== buendel.digest) {
    befunde.push(unitError(
      'implbundle_digest_mismatch',
      `Der Bündeldigest stimmt nicht: gerechnet ${erwartet}, angegeben ${buendel.digest}.`,
      undefined,
      { gerechnet: erwartet, angegeben: buendel.digest },
    ))
  }

  // --- jeder Dateihash ----------------------------------------------------
  for (const eintrag of [...buendel.files, ...buendel.payload]) {
    const fehler = validateRelativePath(eintrag.path, 'implbundle:path')
    if (fehler.length > 0) {
      befunde.push(...fehler)
      continue
    }
    if (eintrag.content === undefined) continue
    const bytes = Buffer.from(eintrag.content, 'base64')
    const gerechnet = sha256Hex(bytes)
    if (gerechnet !== eintrag.sha256) {
      befunde.push(unitError(
        'implbundle_file_digest_mismatch',
        `"${eintrag.path}" hat nicht den angegebenen Hash.`,
        eintrag.path,
        { gerechnet, angegeben: eintrag.sha256 },
      ))
    }
    if (bytes.byteLength !== eintrag.size) {
      befunde.push(unitError(
        'implbundle_file_digest_mismatch',
        `"${eintrag.path}" hat ${String(bytes.byteLength)} Bytes, angegeben sind ${String(eintrag.size)}.`,
        eintrag.path,
      ))
    }
  }

  // --- Signatur -----------------------------------------------------------
  if (buendel.signature === undefined) {
    befunde.push(unitError(
      'implbundle_signature_missing',
      'Das Bündel ist nicht signiert. Damit ist die Unversehrtheit belegt, die Herkunft nicht — und ein Import wäre Codeausführung ohne Absender.',
    ))
    return { ok: false, befunde, implementierung: buendel, signaturGeprueft: false }
  }
  if (buendel.signature.alg !== 'ed25519') {
    befunde.push(unitError('implbundle_signature_invalid', `Unbekanntes Verfahren "${String(buendel.signature.alg)}"; erlaubt ist ed25519.`))
    return { ok: false, befunde, implementierung: buendel, signaturGeprueft: false }
  }

  const schluessel = await vertrauensschluessel(layout)
  const passend = schluessel.filter((eintrag) => eintrag.abdruck === buendel.signature?.key)
  if (passend.length === 0) {
    befunde.push(unitError(
      'implbundle_key_missing',
      `Dem Schlüssel ${buendel.signature.key} wird auf diesem Rechner nicht getraut. Lege seinen öffentlichen Teil als .pub in .pmh/keys/ ab — Vertrauen ist eine Handlung, keine Annahme.`,
      undefined,
      { key: buendel.signature.key },
    ))
    return { ok: false, befunde, implementierung: buendel, signaturGeprueft: false }
  }

  let geprueft = false
  for (const eintrag of passend) {
    try {
      geprueft = verify(null, Buffer.from(buendel.digest, 'utf8'), eintrag.pem, Buffer.from(buendel.signature.value, 'base64'))
    }
    catch {
      geprueft = false
    }
    if (geprueft) {
      return {
        ok: befunde.length === 0,
        befunde,
        implementierung: buendel,
        geprueftMit: eintrag.datei,
        signaturGeprueft: true,
      }
    }
  }

  befunde.push(unitError('implbundle_signature_invalid', 'Die Signatur paßt nicht zum Digest. Das Bündel wurde nach dem Signieren verändert.'))
  return { ok: false, befunde, implementierung: buendel, signaturGeprueft: false }
}

/** Das Ergebnis eines Imports. */
export interface ImportErgebnis {
  readonly ok: boolean
  readonly befunde: readonly UnitError[]
  readonly generation?: number
  readonly geschrieben: readonly string[]
  readonly zeiger?: 'next' | 'current'
}

/**
 * Nimmt ein Bündel an — und macht es **nicht** scharf.
 *
 * Der Ablauf ist der eines `nixos-rebuild boot`: Dateien schreiben, Generation
 * bauen, Zeiger auf `next`. Was beim Absender gilt, gilt hier erst, wenn jemand
 * umschaltet. Das ist die einzige Reihenfolge, in der ein fremdes Bündel keinen
 * laufenden Betrieb umbringt.
 */
export async function importiere(request: BasisAnfrage & {
  readonly datei: string
  /** `true` = die Deklaration und die Dateien wirklich schreiben. */
  readonly schreibe?: boolean
  /** `true` = auch `current` umlegen (verlangt Freigabe, siehe `schalte`). */
  readonly scharf?: boolean
  readonly freigabe?: boolean
  readonly notes?: readonly string[]
}): Promise<ImportErgebnis> {
  const layout = layoutFor(resolve(request.projectRoot), request.stateDir ?? undefined)
  const geprueft = await pruefeBuendel(request.datei, layout)
  if (!geprueft.ok || geprueft.implementierung === undefined) {
    return { ok: false, befunde: geprueft.befunde, geschrieben: [] }
  }
  const buendel = geprueft.implementierung
  const geschrieben: string[] = []

  if (request.schreibe !== false) {
    // Die Deklaration zuerst: sie ist die Absicht. Dateien ohne Absicht wären
    // ein Haufen, den niemand mehr zuordnen kann.
    const ziel = declarationPath(request.projectRoot)
    await mkdir(dirname(ziel), { recursive: true })
    await writeFile(ziel, `${JSON.stringify(buendel.declaration, null, 2)}\n`, 'utf8')
    geschrieben.push('harness/units.json')

    for (const datei of [...buendel.files, ...buendel.payload]) {
      if (datei.content === undefined) continue
      const fehler = validateRelativePath(datei.path, 'implbundle:path')
      if (fehler.length > 0) {
        return { ok: false, befunde: fehler, geschrieben }
      }
      const zielPfad = join(resolve(request.projectRoot), zuPosix(datei.path))
      await mkdir(dirname(zielPfad), { recursive: true })
      await writeFile(zielPfad, Buffer.from(datei.content, 'base64'))
      geschrieben.push(datei.path)
    }
  }

  const gebaut = await baue(request)
  if (!gebaut.ok || gebaut.generation === undefined) {
    return { ok: false, befunde: [...gebaut.befunde], geschrieben }
  }

  const umgeschaltet = await schalte({
    ...request,
    nummer: gebaut.generation.number,
    art: request.scharf === true ? 'switch' : 'boot',
    ...(request.freigabe === undefined ? {} : { freigabe: request.freigabe }),
  })
  if (!umgeschaltet.ok) {
    return { ok: false, befunde: umgeschaltet.befunde, generation: gebaut.generation.number, geschrieben }
  }

  await journalAnhaengen(layout, {
    at: request.jetzt ?? new Date().toISOString(),
    event: 'import',
    generation: gebaut.generation.number,
    fingerprint: gebaut.generation.fingerprint,
    ...(request.actor === undefined ? {} : { actor: request.actor }),
    detail: `von ${buendel.core.version}, signiert ${buendel.signature?.key ?? 'nein'}, ${String(geschrieben.length)} Datei(en)`,
  })

  return {
    ok: true,
    befunde: [],
    generation: gebaut.generation.number,
    geschrieben,
    zeiger: request.scharf === true ? 'current' : 'next',
  }
}
