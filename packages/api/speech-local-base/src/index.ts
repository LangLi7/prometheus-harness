/**
 * Lokaler Spracherkenner auf sherpa-onnx — die Host-Hälfte.
 *
 * ## Was dieses Paket ist
 *
 * Ein **Anbieter** am Dienst `ctx.speechToText` des Kerns. Er bringt seine
 * Gewichte selbst mit (Herkunft, Größe und Prüfsumme stehen in `manifest.ts`),
 * prüft sie vor dem ersten Gebrauch, lädt sie in einen **Kindprozeß** und schickt
 * Aufnahmen dorthin. Welches Modell benutzt wird, entscheidet allein die
 * Zusammensetzung: die Pakete `speech-whisper-local` und `speech-nemo-de-local`
 * sind dünne Hüllen um dieses hier.
 *
 * ## Warum überhaupt ein Kindprozeß
 *
 * Die Erkennung ist synchron und läuft in nativem Code (`sherpa-onnx-node`). Im
 * Host würde sie den Ereignisknoten blockieren — die Weboberfläche stünde während
 * jeder Aufnahme still — und ein Absturz im nativen Teil könnte den Host
 * mitnehmen. Der Kindprozeß wird über eine Schleifenschnittstelle mit
 * Kennwort angesprochen, damit nur der Host ihn erreichen kann.
 *
 * ## Was dieses Paket NICHT tut
 *
 * Es lädt **nichts** beim Aktivieren: die Prüfung liest nur Verzeichnis und
 * Prüfsummen. Geladen wird beim ersten Vorbereiten oder bei der ersten Aufnahme.
 * Es schickt Aufnahmen **nirgendwohin** außer an den eigenen Kindprozeß auf
 * 127.0.0.1. Und es erfindet keinen Text: ist die Aufnahme still, kommt eine leere
 * Zeichenkette zurück.
 *
 * @module @prometheus-harness/speech-local-base
 */

import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type {
  SpeechProvider,
  SpeechProviderInfo,
  SpeechPreparation,
  SpeechPreparationState,
  SpeechInput,
  Transcript,
} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { MODEL_ORIGINS, SILERO_VAD, assetUrl, type ModelFile, type ModelVariant } from './manifest.ts'

/** Der Dateiname des Kindprozesses, wie er im Paket ausgeliefert wird. */
export const WORKER_ENTRY = '@prometheus-harness/speech-local-base/worker'

/**
 * Ermittelt den Ablageordner der Gewichte.
 *
 * ## Warum das Paket den Ort selbst sucht
 *
 * Die Zeilen des Profils, die unsere Pakete eintragen, entstehen in
 * `scripts/profile-patch.mjs` und tragen **keine** `config`-Werte (die Form ist
 * `id` + `name` + `inject`). Ein Pflichtfeld `dataRoot` wäre damit nicht setzbar —
 * die Aktivierung scheiterte. Die Zusammensetzung **kann** den Ort auch gar nicht
 * wissen: den Wohnort des Harness kennt nur der Host.
 *
 * Deshalb wird er hier aus derselben Quelle gelesen, aus der der Kern ihn nimmt:
 * `DSH_HOME`. Fehlt die Angabe, wird **nicht** geraten, sondern die Aktivierung
 * scheitert mit einer Meldung, die den fehlenden Namen nennt.
 *
 * @param ausdruecklich - ein ausdrücklich gesetzter Pfad, falls vorhanden.
 * @param unterordner - der Ordner innerhalb des Harness-Wohnorts.
 * @returns der absolute Ablageordner.
 */
export function ermittleAblageort(ausdruecklich: string | undefined, unterordner: string): string {
  if (ausdruecklich !== undefined && ausdruecklich.length > 0) return ausdruecklich
  const wohnort = process.env.DSH_HOME
  if (wohnort === undefined || wohnort.length === 0) {
    throw new Error(
      `Wohnort des Harness unbekannt: DSH_HOME ist nicht gesetzt und kein Ablageort angegeben (erwartet für ${unterordner})`,
    )
  }
  return join(wohnort, unterordner)
}

/**
 * Die Antwort des Kindprozesses auf eine Aufnahme.
 *
 * **Warum hier `loose()` steht und nicht `strict()`.** Der Kindprozeß schickt zwei
 * Felder mehr, als der Vertrag verlangt: `segments` (Zahl der Sprachstücke) und
 * `hash` (Kurzform des Aufnahme-Hashes). Sie sind **Diagnose**, nicht Vertrag — der
 * Anbieter gibt sie nicht weiter. `strict()` würde eine spätere Ergänzung im
 * Kindprozeß zu einem harten Fehler machen; `loose()` läßt sie zu und prüft die
 * drei Felder, auf die es ankommt.
 */
const transcriptSchema = z
  .object({
    text: z.string(),
    audioSeconds: z.number().nonnegative(),
    inferenceSeconds: z.number().nonnegative(),
  })
  .loose()

/** Die Bereitschaftsmeldung des Kindprozesses. */
const readySchema = z.object({ port: z.number().int().min(1).max(65535) }).loose()

/** Was ein Anbieter dieses Pakets zusätzlich zu seiner Umgebung wissen muß. */
export interface LocalProviderConfig {
  /** Eindeutige Kennung am Register; Verbraucher wählen genau diese. */
  providerId: string
  /** Anzeigename in der Oberfläche. */
  displayName: string
  /** Angenommene Sprachhinweise, in der Reihenfolge der Anzeige. */
  languages: string[]
  /** Vorgabe, wenn eine Aufnahme keinen Hinweis mitbringt. */
  language: string
  /** Ablageordner für die geprüften Gewichte; fehlt er, wird er aus `DSH_HOME` gebildet. */
  dataRoot?: string | undefined
  /** Ordner innerhalb des Harness-Wohnorts, wenn `dataRoot` fehlt. */
  dataSubdir: string
  /** Das Modell samt Herkunft und Prüfsummen. */
  variant: ModelVariant
  /** Ursprünge für den Abruf, in der Reihenfolge des Versuchs. */
  modelOrigins: string[]
  /** Fäden für die Erkennung. */
  threads: number
  /** Obergrenze eines Sprachstücks in Sekunden. */
  segmentSeconds: number
  /** Sprechwahrscheinlichkeit ab der Silero Sprache annimmt. */
  vadThreshold: number
  /** Kürzeste Sprache in Sekunden. */
  minSpeechSeconds: number
  /** Stille, die zwei Sprachstücke trennt. */
  minSilenceSeconds: number
  /** Frist für Abruf und Prüfung der Gewichte. */
  prepareTimeoutMs: number
  /** Frist für eine Erkennung einschließlich Start des Kindprozesses. */
  inferenceTimeoutMs: number
  /** Ruhezeit, nach der der Kindprozeß beendet wird; 0 hält ihn warm. */
  idleTimeoutMs: number
  /** Höchstzahl gleichzeitig angenommener Aufnahmen. */
  maxPending: number
  /** Nachsichtsfrist beim Beenden. */
  graceMs: number
  /** Obergrenze der Kindprozeß-Protokolle. */
  maxLogBytes: number
  /** Obergrenze der Antwortgröße. */
  maxResponseBytes: number
  /** Obergrenze der Aufnahmegröße in Bytes. */
  maxAudioBytes: number
}

/** Ein lebender Kindprozeß samt Kennwort und Adresse. */
interface Worker {
  readonly handle: SubprocessHandle
  readonly url: string
  readonly token: string
  closed: boolean
}

/**
 * Rechnet den SHA-256 einer Datei nach, ohne sie ganz in den Speicher zu lesen.
 *
 * **Warum in Stücken.** Die größte Datei ist 131 MB. Sie ganz in den Speicher zu
 * holen ginge, wäre aber unnötig: die Prüfung läuft bei jeder Aktivierung.
 *
 * @param pfad - die zu prüfende Datei.
 * @returns die Prüfsumme in Kleinschreibung.
 */
export async function sha256Datei(pfad: string): Promise<string> {
  const hasher = createHash('sha256')
  await pipeline(createReadStream(pfad), new Transform({
    transform(stueck, _kodierung, fertig) {
      hasher.update(stueck)
      fertig()
    },
  }))
  return hasher.digest('hex')
}

/**
 * Prüft, ob eine Datei vollständig und unverändert vorliegt.
 *
 * @param pfad - die Datei.
 * @param datei - erwartete Größe und Prüfsumme.
 * @returns wahr, wenn Größe stimmt und die Prüfsumme — sofern angegeben — ebenfalls.
 */
export async function istGeprueft(pfad: string, datei: ModelFile): Promise<boolean> {
  const angaben = await stat(pfad).catch(() => undefined)
  if (angaben?.size !== datei.bytes) return false
  if (datei.sha256 === undefined) return true
  return (await sha256Datei(pfad)) === datei.sha256
}

/**
 * Lädt eine Datei von einem der Ursprünge und benennt sie erst nach bestandener
 * Prüfung um.
 *
 * **Warum die Zwischendatei.** Ein Abbruch darf keine Datei hinterlassen, die die
 * Prüfung später für vollständig hält. Die Zwischendatei trägt die Endung `.teil`
 * und wird **nicht** fortgesetzt — ein halber Download wird verworfen, nicht
 * zusammengesetzt. Bei 131 MB kostet das im schlimmsten Fall einen erneuten Abruf;
 * eine falsch zusammengesetzte Datei würde dagegen still falsch erkennen.
 *
 * @param variant - Modell mit Repositorium und Revision.
 * @param datei - die gewünschte Datei.
 * @param ziel - Zielpfad.
 * @param origins - Ursprünge in der Reihenfolge des Versuchs.
 * @param signal - Frist oder Abbruch.
 * @param fortschritt - Rückruf mit den bisher empfangenen Bytes.
 * @returns die Herkunft, von der geladen wurde.
 */
export async function ladeDatei(
  variant: ModelVariant,
  datei: ModelFile,
  ziel: string,
  origins: readonly string[],
  signal: AbortSignal,
  fortschritt: (bytes: number) => void,
): Promise<string> {
  const teil = `${ziel}.teil`
  const fehler: unknown[] = []
  for (const origin of origins) {
    signal.throwIfAborted()
    try {
      const antwort = await fetch(assetUrl(origin, variant, datei), { signal })
      if (!antwort.ok || antwort.body === null) {
        throw new Error(`HTTP ${antwort.status}`)
      }
      await mkdir(join(ziel, '..'), { recursive: true })
      let empfangen = 0
      const zaehler = new Transform({
        transform(stueck: Buffer, _kodierung, fertig) {
          empfangen += stueck.byteLength
          fortschritt(empfangen)
          fertig(null, stueck)
        },
      })
      const { createWriteStream } = await import('node:fs')
      await pipeline(antwort.body as unknown as AsyncIterable<Uint8Array>, zaehler, createWriteStream(teil))
      signal.throwIfAborted()
      const angaben = await stat(teil)
      if (angaben.size !== datei.bytes) throw new Error(`${angaben.size} B statt ${datei.bytes} B`)
      if (datei.sha256 !== undefined && (await sha256Datei(teil)) !== datei.sha256) {
        throw new Error('Prüfsumme stimmt nicht')
      }
      await rename(teil, ziel)
      return origin
    } catch (grund) {
      await rm(teil, { force: true })
      if (signal.aborted) throw signal.reason
      fehler.push(`${origin}: ${grund instanceof Error ? grund.message : String(grund)}`)
    }
  }
  throw new Error(`Gewichte nicht abrufbar — ${fehler.join('; ')}`)
}

/**
 * Wartet auf eine Zusage, ohne die Verfügungsgewalt über ihr späteres Ergebnis zu
 * verlieren: bricht die Frist ab, wird der Aufruf abgelehnt, das Laufen aber nicht
 * vergessen.
 *
 * @param pending - die erwartete Zusage.
 * @param signal - Frist oder Abbruch.
 * @returns das Ergebnis der Zusage.
 */
function warteAuf<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((erfuellen, ablehnen) => {
    const abbruch = (): void => {
      ablehnen(signal.reason instanceof Error ? signal.reason : new Error('Sprachvorgang abgebrochen'))
    }
    signal.addEventListener('abort', abbruch, { once: true })
    pending.then(erfuellen, ablehnen).finally(() => signal.removeEventListener('abort', abbruch))
  })
}

/**
 * Liest die Bereitschaftsmeldung des Kindprozesses und gibt den Port zurück.
 *
 * Der Port wird vom Betriebssystem vergeben (der Kindprozeß bindet auf 0) und
 * **nur** über diese Zeile bekanntgegeben. Deshalb ist diese Meldung der Vertrag,
 * nicht eine feste Nummer.
 *
 * @param handle - frisch gestarteter Kindprozeß mit geleiteter Standardausgabe.
 * @param limit - Obergrenze der Bereitschaftsmeldung.
 * @param signal - Startfrist oder Abbruch.
 * @returns der vergebene Schleifenport.
 */
export async function leseBereitschaft(
  handle: SubprocessHandle,
  limit: number,
  signal: AbortSignal,
): Promise<number> {
  const stdout = handle.stdout
  if (!stdout) throw new Error('Standardausgabe des Sprachprozesses fehlt')
  signal.throwIfAborted()
  let text = ''
  const pending = Promise.withResolvers<number>()
  const daten = (stueck: Buffer): void => {
    text += stueck.toString('utf8')
    if (Buffer.byteLength(text) > limit) {
      pending.reject(new Error('Bereitschaftsmeldung überschreitet die Byte-Grenze'))
      return
    }
    const ende = text.indexOf('\n')
    if (ende < 0) return
    try {
      pending.resolve(readySchema.parse(JSON.parse(text.slice(0, ende))).port)
    } catch (grund) {
      pending.reject(new Error('ungültige Bereitschaftsmeldung', { cause: grund }))
    }
  }
  stdout.on('data', daten)
  stdout.on('error', pending.reject)
  void handle.done.then(
    () => pending.reject(new Error(`Sprachprozeß endete vor der Bereitschaft: ${handle.collected.stderr?.readFrom(0).text ?? ''}`)),
    pending.reject,
  )
  try {
    return await warteAuf(pending.promise, signal)
  } finally {
    stdout.off('data', daten)
    stdout.off('error', pending.reject)
    stdout.resume()
  }
}

/**
 * Liest eine begrenzte JSON-Antwort des Kindprozesses.
 *
 * @param antwort - die Antwort.
 * @param limit - Obergrenze der gelesenen Bytes.
 * @returns die geprüfte Erkennung.
 */
export async function leseAntwort(antwort: Response, limit: number): Promise<Transcript> {
  if (!antwort.body) throw new Error('Sprachprozeß hat nichts geantwortet')
  const leser = antwort.body.getReader()
  const stuecke: Uint8Array[] = []
  let gesamt = 0
  for (;;) {
    const { done, value } = await leser.read()
    if (done) break
    if (value) {
      gesamt += value.byteLength
      if (gesamt > limit) {
        await leser.cancel()
        throw new Error('Antwort des Sprachprozesses überschreitet die Byte-Grenze')
      }
      stuecke.push(value)
    }
  }
  const text = Buffer.concat(stuecke).toString('utf8')
  if (!antwort.ok) {
    throw new Error(`Sprachprozeß lehnte ab (HTTP ${antwort.status}): ${text.slice(0, 200)}`)
  }
  return transcriptSchema.parse(JSON.parse(text))
}

/**
 * Ein lokaler Erkenner: Vorbereitung, Kindprozeß-Verwaltung und Erkennung.
 *
 * **Nebenläufigkeit.** Aufnahmen werden **nacheinander** abgearbeitet (eine
 * Warteschlange mit `maxPending`), weil der Kindprozeß eine Aufnahme zur Zeit
 * erkennt. Der Kindprozeß wird nach `idleTimeoutMs` Ruhe beendet; die Gewichte
 * bleiben liegen und werden beim nächsten Mal nur geladen.
 */
export class LocalSpeechProvider implements SpeechProvider, SpeechPreparation {
  readonly info: SpeechProviderInfo
  readonly preparation: SpeechPreparation = this
  /** Die Schritte, die die Oberfläche als Fortschritt zeigt. */
  private readonly schritte = ['check', 'model', 'verify', 'load'] as const
  private state: SpeechPreparationState
  private readonly listeners = new Set<() => void>()
  private worker: Worker | undefined
  /** Läuft gerade eine Vorbereitung? */
  private task: { completed: boolean; abort: AbortController; settled: Promise<void> } | undefined
  private lifetime = new AbortController()
  private kette: Promise<unknown> = Promise.resolve()
  private offen = 0
  private ruhe: NodeJS.Timeout | undefined
  private disposed = false

  /** Der Ablageordner der Gewichte, absolut. */
  private readonly dataRoot: string

  /** Der Kontext: liefert `subprocess`, `logger` und die Wirkungssammlung. */
  private readonly ctx: Context
  /** Die geprüften Laufzeitangaben. */
  private readonly config: LocalProviderConfig

  /**
   * @param ctx - Kontext mit `subprocess`, `logger` und `effect`.
   * @param config - geprüfte Laufzeitangaben mit **aufgelöstem** Ablageort.
   */
  constructor(ctx: Context, config: LocalProviderConfig & { dataRoot: string }) {
    this.ctx = ctx
    this.config = config
    this.dataRoot = config.dataRoot
    this.info = {
      id: config.providerId as SpeechProviderInfo['id'],
      name: config.displayName,
      location: 'host-local',
      languages: config.languages,
      setupEstimate: {
        recommendedDiskBytes: config.variant.files.reduce((summe, datei) => summe + datei.bytes, 0) * 2,
        expectedMemoryBytes: config.variant.files.reduce((summe, datei) => summe + datei.bytes, 0) * 2,
        minimumMinutes: 1,
        maximumMinutes: 15,
      },
    }
    this.state = {
      phase: 'unprepared',
      steps: this.schritte.map((kind) => ({ kind, status: 'pending' as const })),
    }
  }

  /** Der Pfad einer Gewichtsdatei im Ablageordner. */
  private pfad(datei: ModelFile): string {
    return join(this.dataRoot, datei.name)
  }

  /**
   * Liest die Bereitschaft, ohne etwas zu laden oder zu laden beginnen.
   *
   * @returns der aktuelle Zustand.
   */
  snapshot(): SpeechPreparationState {
    return this.state
  }

  /**
   * Beobachtet Zustandsänderungen.
   *
   * @param listener - Rückruf ohne Argumente.
   * @returns Abbestellung.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Veröffentlicht einen neuen Zustand und benachrichtigt die Beobachter.
   *
   * @param state - der neue Zustand.
   */
  private publish(state: SpeechPreparationState): void {
    if (this.task && ['ready', 'standby', 'unprepared', 'failed', 'cancelled'].includes(state.phase)) {
      this.task.completed = true
    }
    const vorher = this.state
    const steps = (state.steps ?? vorher.steps ?? []).map((schritt) => {
      if (state.phase === 'ready') return { ...schritt, status: 'complete' as const }
      if (state.phase === 'failed' || state.phase === 'cancelled') {
        return schritt.status === 'running' ? { ...schritt, status: state.phase } : schritt
      }
      if (state.step === schritt.kind) {
        return schritt.status === 'running' ? schritt : { ...schritt, status: 'running' as const, startedAt: Date.now() }
      }
      if (state.step === undefined && schritt.status === 'running') return { ...schritt, status: 'complete' as const }
      return schritt
    })
    this.state = { ...state, steps }
    for (const listener of this.listeners) listener()
  }

  /**
   * Prüft die Gewichte auf der Platte, ohne zu laden.
   *
   * **Warum das nicht „bereit" bedeutet.** Vollständige Gewichte heißen: der
   * nächste Ruf kann arbeiten. Geladen ist dann noch nichts — das kostet erst die
   * erste Aufnahme.
   *
   * @returns der Befund.
   */
  async inspect(): Promise<'ready' | 'unprepared'> {
    if (this.disposed) return 'unprepared'
    this.publish({ phase: 'checking', step: 'check', startedAt: Date.now() })
    const alle = await Promise.all(this.config.variant.files.map(async (datei) => await istGeprueft(this.pfad(datei), datei)))
    const vadDa = this.config.variant.family === 'whisper'
      ? await istGeprueft(join(this.dataRoot, SILERO_VAD.name), SILERO_VAD)
      : true
    if (alle.every(Boolean) && vadDa) {
      this.publish({ phase: 'ready' })
      return 'ready'
    }
    this.publish({
      phase: 'unprepared',
      steps: this.schritte.map((kind) => ({ kind, status: 'pending' as const })),
    })
    return 'unprepared'
  }

  /**
   * Startet die Vorbereitung oder tritt einer laufenden bei.
   *
   * @returns nach Abschluß der Vorbereitung (Erfolg wie Fehlschlag).
   */
  async prepare(): Promise<void> {
    if (this.disposed) throw new Error('Sprachanbieter ist abgebaut')
    if (this.task && !this.task.completed) return await this.task.settled
    if ((await this.inspect()) === 'ready') return
    const abort = new AbortController()
    const settled = this.laufeVorbereitung(abort).finally(() => {
      if (this.task?.abort === abort) this.task = undefined
    })
    this.task = { completed: false, abort, settled }
    await settled
  }

  /**
   * Führt eine Vorbereitung aus: fehlende Gewichte laden, prüfen, Kindprozeß laden.
   *
   * @param abort - Abbruch der Vorbereitung.
   */
  private async laufeVorbereitung(abort: AbortController): Promise<void> {
    const ende = setTimeout(() => abort.abort(new Error('Vorbereitung überschritt die Frist')), this.config.prepareTimeoutMs)
    try {
      for (const datei of this.config.variant.files) {
        const ziel = this.pfad(datei)
        if (await istGeprueft(ziel, datei)) continue
        this.publish({
          phase: 'downloading',
          step: 'model',
          resource: datei.name,
          completedBytes: 0,
          totalBytes: datei.bytes,
        })
        const origin = await ladeDatei(this.config.variant, datei, ziel, this.config.modelOrigins, abort.signal, (bytes) => {
          this.publish({ phase: 'downloading', step: 'model', resource: datei.name, completedBytes: bytes, totalBytes: datei.bytes })
        })
        this.ctx.logger.info(`Sprachgewichte geladen: ${datei.name} von ${origin}`)
      }
      if (this.config.variant.family === 'whisper') {
        const vadZiel = join(this.dataRoot, SILERO_VAD.name)
        if (!(await istGeprueft(vadZiel, SILERO_VAD))) {
          this.publish({ phase: 'downloading', step: 'model', resource: SILERO_VAD.name, completedBytes: 0, totalBytes: SILERO_VAD.bytes })
          await ladeDatei(
            { ...this.config.variant, repo: 'csukuangfj/vad', revision: 'fba88cd2e921609e7675c3aaf51e0b9b295da4bc' },
            SILERO_VAD,
            vadZiel,
            this.config.modelOrigins,
            abort.signal,
            (bytes) => this.publish({ phase: 'downloading', step: 'model', resource: SILERO_VAD.name, completedBytes: bytes, totalBytes: SILERO_VAD.bytes }),
          )
        }
      }
      this.publish({ phase: 'checking', step: 'verify', startedAt: Date.now() })
      for (const datei of this.config.variant.files) {
        if (!(await istGeprueft(this.pfad(datei), datei))) throw new Error(`Gewicht nicht prüfbar: ${datei.name}`)
      }
      this.publish({ phase: 'loading', step: 'load', startedAt: Date.now() })
      await this.start(abort.signal)
      this.publish({ phase: 'ready' })
    } catch (grund) {
      if (abort.signal.aborted) {
        this.publish({ phase: 'cancelled' })
        return
      }
      const meldung = grund instanceof Error ? grund.message : String(grund)
      this.ctx.logger.warn(`Sprachvorbereitung gescheitert: ${meldung}`)
      this.publish({ phase: 'failed', message: meldung })
    } finally {
      clearTimeout(ende)
    }
  }

  /**
   * Bricht eine laufende Vorbereitung ab.
   *
   * @returns nach dem Settle der Vorbereitung.
   */
  async cancel(): Promise<void> {
    if (!this.task) return
    this.task.abort.abort(new Error('Sprachvorbereitung abgebrochen'))
    await this.task.settled
  }

  /**
   * Startet den Kindprozeß oder gibt den laufenden zurück.
   *
   * @param signal - Startfrist oder Abbruch.
   * @returns der lebende Kindprozeß.
   */
  private async start(signal: AbortSignal): Promise<Worker> {
    if (this.worker?.closed) await this.stop()
    if (this.worker) return this.worker
    await mkdir(this.dataRoot, { recursive: true })
    const token = randomBytes(32).toString('hex')
    const workerPfad = fileURLToPath(new URL('./worker.ts', import.meta.url))
    const handle = this.ctx.subprocess.spawn({
      argv: [
        process.execPath,
        workerPfad,
        JSON.stringify({
          modelDirectory: this.dataRoot,
          family: this.config.variant.family,
          // **`encoder` und `model` sind bei sherpa-onnx zwei Rollen für dieselbe
          // Sache.** Whisper hat Encoder und Decoder getrennt, ein NeMo-CTC-Modell
          // ist eine einzige Datei. Deshalb wird hier nach beiden Rollen gesucht —
          // sonst übergibt der Host `undefined` und der Kindprozeß scheitert beim
          // Pfadbau.
          encoderName: this.config.variant.files.find((datei) => datei.role === 'encoder' || datei.role === 'model')?.name,
          decoderName: this.config.variant.files.find((datei) => datei.role === 'decoder')?.name,
          tokensName: this.config.variant.files.find((datei) => datei.role === 'tokens')?.name,
          vadModelPath: this.config.variant.family === 'whisper' ? join(this.dataRoot, SILERO_VAD.name) : undefined,
          threads: this.config.threads,
          language: this.config.language,
          segmentSeconds: this.config.segmentSeconds,
          vadThreshold: this.config.vadThreshold,
          minSpeechSeconds: this.config.minSpeechSeconds,
          minSilenceSeconds: this.config.minSilenceSeconds,
        }),
      ],
      cwd: this.dataRoot,
      stdio: {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: { maxBytes: this.config.maxLogBytes },
      },
      graceMs: this.config.graceMs,
      env: { DSH_SPEECH_TOKEN: token },
    })
    try {
      const port = await leseBereitschaft(handle, this.config.maxLogBytes, signal)
      const worker: Worker = { handle, url: `http://127.0.0.1:${port}`, token, closed: false }
      handle.done.then(
        () => {
          if (!worker.closed) {
            worker.closed = true
            if (!this.disposed) this.publish({ phase: 'standby' })
          }
        },
        () => {
          if (!worker.closed) {
            worker.closed = true
            if (!this.disposed) this.publish({ phase: 'standby' })
          }
        },
      )
      this.worker = worker
      return worker
    } catch (grund) {
      handle.terminate()
      await handle.waitForExit()
      throw grund
    }
  }

  /**
   * Beendet den Kindprozeß, falls einer läuft.
   *
   * @returns nach dem Ende des Prozesses.
   */
  private async stop(): Promise<void> {
    const worker = this.worker
    if (!worker) return
    this.worker = undefined
    worker.closed = true
    worker.handle.terminate()
    await worker.handle.waitForExit()
  }

  /**
   * Erkennt eine Aufnahme.
   *
   * @param input - WAV-Bytes und Sprachhinweis.
   * @param signal - Abbruch des Aufrufers.
   * @returns der erkannte Text samt gemessenen Zeiten.
   */
  async transcribe(input: SpeechInput, signal: AbortSignal): Promise<Transcript> {
    if (!this.config.languages.includes(input.language)) {
      throw new Error(`Sprache wird nicht angenommen: ${input.language}`)
    }
    const zusammen = AbortSignal.any([signal, this.lifetime.signal])
    zusammen.throwIfAborted()
    if (this.offen >= this.config.maxPending) throw new Error('Warteschlange der Spracherkennung ist voll')
    clearTimeout(this.ruhe)
    this.offen++
    const auftrag = this.kette.then(async () => {
      zusammen.throwIfAborted()
      return await this.erkenne(input, zusammen)
    })
    this.kette = auftrag.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      this.offen--
      if (this.offen === 0 && !this.lifetime.signal.aborted && this.config.idleTimeoutMs > 0) {
        this.ruhe = setTimeout(() => {
          void this.stop().catch((grund: unknown) => {
            this.ctx.logger.warn('Sprachprozeß konnte nicht beendet werden', grund)
          })
        }, this.config.idleTimeoutMs)
      }
    })
    return await auftrag
  }

  /**
   * Führt eine Erkennung aus: Kindprozeß sicherstellen, Aufnahme schicken, Antwort prüfen.
   *
   * @param input - WAV-Bytes und Sprachhinweis.
   * @param signal - Abbruch.
   * @returns die Erkennung.
   */
  private async erkenne(input: SpeechInput, signal: AbortSignal): Promise<Transcript> {
    const frist = new AbortController()
    const zeitgeber = setTimeout(() => frist.abort(new Error('Erkennung überschritt die Frist')), this.config.inferenceTimeoutMs)
    const zusammen = AbortSignal.any([signal, frist.signal])
    try {
      const worker = await this.start(zusammen)
      const antwort = await fetch(`${worker.url}/transcribe?language=${encodeURIComponent(input.language)}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${worker.token}`, 'content-type': 'audio/wav' },
        body: Buffer.from(input.audio),
        signal: zusammen,
      })
      return await leseAntwort(antwort, this.config.maxResponseBytes)
    } finally {
      clearTimeout(zeitgeber)
    }
  }

  /**
   * Baut den Anbieter ab: Aufnahmen abbrechen, Kindprozeß beenden.
   *
   * @returns nach dem Ende des Prozesses.
   */
  async dispose(): Promise<void> {
    this.disposed = true
    clearTimeout(this.ruhe)
    if (this.task && !this.task.completed) this.task.abort.abort(new Error('Sprachanbieter wird abgebaut'))
    this.lifetime.abort(new Error('Sprachanbieter wird abgebaut'))
    await this.kette
    await this.stop()
  }
}

/**
 * Meldet einen lokalen Anbieter am Register des Kerns an.
 *
 * **Warum diese Funktion im Basispaket liegt und nicht in den Hüllen.** Die Hüllen
 * unterscheiden sich nur in Modell und Namen; die Anmeldung, die Prüfung der
 * Pfade und der Abbau sind bei beiden gleich. Eine Kopie wäre die Stelle, an der
 * eine spätere Berichtigung nur die Hälfte erreicht.
 *
 * @param ctx - der Kontext des ladenden Pakets.
 * @param config - geprüfte Laufzeitangaben.
 * @returns der eingerichtete Anbieter (für Prüfungen).
 */
export function registriere(ctx: Context, config: LocalProviderConfig): LocalSpeechProvider {
  // **Hier wird der Ablageort festgelegt, bevor der Anbieter entsteht.** So sieht
  // der Anbieter selbst nur noch einen fertigen, absoluten Pfad — und ein fehlendes
  // `DSH_HOME` scheitert beim Laden des Pakets, nicht erst bei der ersten Aufnahme.
  const vollstaendig: LocalProviderConfig = {
    ...config,
    dataRoot: ermittleAblageort(config.dataRoot, config.dataSubdir),
  }
  const anbieter = new LocalSpeechProvider(ctx, vollstaendig)
  ctx.effect(() => {
    const abmelden = ctx.speechToText.register(anbieter)
    void anbieter.inspect()
    return async () => {
      const entfernen = abmelden()
      await anbieter.dispose()
      await entfernen
    }
  })
  return anbieter
}

/** Die Standardursprünge, die jede Hülle übernehmen kann. */
export const STANDARD_ORIGINS = MODEL_ORIGINS
