/**
 * Das Plugin: die Units in den **Host** hängen.
 *
 * ## Was `apply` tut — in dieser Reihenfolge
 *
 * 1. **Crew am Kern-Seam anmelden** — `ctx.llm.registerAdapter(['crew'], new CrewAdapter(ctx.llm, crews))`.
 *    Damit erscheint jede Crew als Modell und wird über den Adapter geroutet.
 * 2. **Werkzeuge anmelden** — die vier Zustandswerkzeuge der Crew, dazu (wenn eingerichtet) das
 *    Bildwerkzeug und die beiden Suchwerkzeuge, jedes durch {@link alsKernWerkzeug} übersetzt.
 * 3. **Buchung am `llm/stream`-Waterfall** — der Kern bietet den Wasserfall (`dsh-llm` 0.2.1,
 *    `'llm/stream'(options, next)`). Jeder Aufruf wird mit seinen Token an den Aufzeichner gegeben,
 *    **je Nutzer**. Der Wasserfall wird durchgereicht, nie verändert — ein Abrechnungsfehler darf
 *    keine Antwort verhindern.
 *
 * ## Was dieses Plugin ausdrücklich NICHT kann
 *
 * - **Keine Sitzung → Nutzer.** `GenerateOptions` trägt keinen Nutzer; der Plugin-Konfiguration wird
 *   er **vorgegeben** (`nutzer`). Wer mehrere Menschen bedient, braucht diese Zuordnung aus der
 *   Sitzung — sie ist gemessen **nicht vorhanden** (siehe Installationsliste §11).
 * - **Ein Projekt, eine Crew für die Werkzeuge.** `crew` und `projekt` stehen in der Konfiguration;
 *   die Werkzeuge adressieren genau diesen Bereich. Eine Sitzung, die eine andere Crew wählt,
 *   bekommt weiterhin den Plan dieses Bereichs — bewußt, weil ein Rateweg schlimmer wäre.
 * - **Ohne Nutzer startet es nicht.** Fail-closed: ein Plugin, das stillschweigend unter einem
 *   Sammelkonto bucht, macht die Nutzertrennung zur Behauptung.
 *
 * ## Was im Host gemessen ist (Kern 0.2.1, Profil `web`)
 *
 * - Die Zeile `pmh-crew-plugin` im Profil-Patch wird **wirklich** geladen: `apply` läuft, `config`
 *   ist leer, der Weg geht über {@link applyAusDatei} (Stapel im Startprotokoll, ausgelöst durch
 *   eine absichtlich kaputte Datei).
 * - `ctx.logger` ist bei cordis **aufrufbar** — `ctx.logger?.warn?.(…)` schreibt ins Nichts. Siehe
 *   {@link protokollAus}.
 * - Der **einzige** Exporter des Hosts sammelt `warn`/`error` für die Startdiagnose; sichtbar wird
 *   davon nur, was zu einem **fehlgeschlagenen** Eintrag gehört. Ein gelungenes Einhängen ist über
 *   den Logger also unsichtbar — deshalb schreibt {@link protokollAus} zusätzlich auf `stderr`.
 * - `DSH_HOME` reicht der Host **wörtlich** weiter; bei `--home .pmh-build/harness-home` ist der Wert
 *   relativ. Siehe {@link homeAusUmgebung}.
 * - Ein **werfendes** `apply` hält den Host **nicht** an: der Eintrag zählt als „did not activate",
 *   der Stapel steht im Protokoll, der Kern läuft weiter.
 *
 * @module @prometheus-harness/crew-plugin/plugin
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { crewWerkzeuge } from '@prometheus-harness/crew-provider'
import { CrewZustandSpeicher, projektbereich } from '@prometheus-harness/crew-plan'
import { CREW_ROUTE, CrewAdapter, type CrewEintrag } from '@prometheus-harness/crew-core-adapter'
import { modlensWerkzeug, type Ausfuehren as ModlensAusfuehren } from '@prometheus-harness/modlens'
import { suchWerkzeuge, netzHole, type Hole } from '@prometheus-harness/deepseek-search-tools'
import { SAAT, type Tarifeintrag } from '@prometheus-harness/tariffs'
import { Verbrauchsspeicher } from '@prometheus-harness/usage-budget'
import { Aufzeichner } from '@prometheus-harness/usage-recorder'

import { alsKernWerkzeug } from './tool-bridge.ts'
import { konfigurationsdatei, liesKonfiguration } from './config-file.ts'

/** Die Konfiguration des Plugins. */
export interface Konfiguration {
  /** Die Crews; die erste ist die Vorgabe. */
  crews: CrewEintrag[]
  /** Welche Crew die Werkzeuge adressieren (Kennung). */
  crew: string
  /** Wem Pläne und Kosten gehören — **Pflicht**. */
  nutzer: string
  /** Das Projekt der Werkzeuge (Pfad); fehlt es, gilt „ohne Projekt". */
  projekt?: string
  /** Wurzel für Plandokumente und Verbrauchsdateien; fehlt sie, bleibt alles im Arbeitsspeicher. */
  verzeichnis?: string
  /** Die Tarife für die Buchung; Vorgabe `SAAT` aus `tariffs`. */
  tarife?: readonly Tarifeintrag[]
  /** Die Bildbrücke, wenn eingerichtet. */
  modlens?: {
    cliPfad: string
    programm?: string
    timeoutMs?: number
    ausfuehren: ModlensAusfuehren
  }
  /** Die Suche, wenn eingerichtet. `hole` fehlt in einer Datei — dann gilt der echte Netzweg. */
  suche?: { apiKey: string; basis?: string; hole?: Hole }
  /**
   * **Nur die Modelle.** Der Adapter hängt ein, Werkzeuge und Buchung bleiben aus.
   *
   * Anlaß (21.10.2026): das Plugin bedient die Crews **aller** aktiven Konten als Modelle, aber
   * Werkzeuge und Buchung brauchen **ein** Konto — und der Kern reicht dem Werkzeug keine Sitzung.
   * Gibt es kein Betriebskonto, ist ein leerer `nutzer` keine Lösung (er würde buchen, nur unter
   * wem?), sondern dieses Feld.
   */
  nurAdapter?: boolean
}

/**
 * Das Protokoll, das dieses Plugin schreibt — mehr braucht es nicht.
 *
 * Zwei Zeilen genügen: „eingehängt" (damit der Betrieb sieht, was läuft) und „nicht eingehängt"
 * (damit er sieht, was fehlt). Alles andere protokolliert der Host.
 */
export interface Protokoll {
  info(meldung: string): void
  warn(meldung: string): void
}

/**
 * Die Form, in der cordis seinen Protokolldienst reicht.
 *
 * `ctx.logger` ist bei cordis **aufrufbar**: `ctx.logger('name')` gibt einen benannten Logger,
 * `ctx.logger.info(...)` schreibt ohne Namen (`cordis/lib/types/logger.d.ts`, `LoggerService`).
 */
export type LoggerDienst = ((name?: string) => Partial<Protokoll> | undefined) & Partial<Protokoll>

/** Was ein Kontext als Protokoll reichen darf: den cordis-Dienst **oder** ein schlichtes Objekt. */
export type Protokollplatz = Partial<Protokoll> | LoggerDienst

/** Was der Kern an Diensten reicht — strukturell, damit Prüfungen ohne Host laufen. */
export interface HostKontext {
  llm: {
    registerAdapter(providers: string[], adapter: unknown): () => void
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>
  }
  tools: {
    register(definition: ToolDefinition): () => void
  }
  on(
    event: 'llm/stream',
    listener: (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>,
  ): () => void
  effect?(setup: () => () => void, label?: string): void
  logger?: Protokollplatz
}

/** Das Präfix jeder Zeile: dieselbe Form, die die übrigen Plugins dieses Projekts schreiben. */
const PRAEFIX = '[pmh] pmh-crew: '

/**
 * Holt aus dem Kontext ein Protokoll, das im Betrieb **wirklich ankommt**.
 *
 * ## Warum zusätzlich auf `stderr` — gemessen
 *
 * `ctx.logger` ist vorhanden (gemessen: `logger=function`), und der Aufruf ist richtig. Trotzdem war
 * von diesem Plugin **keine einzige Zeile** zu sehen. Der Grund steht im Boot:
 * `dsh-app-boot/lib/index.js:4213` hängt den **einzigen** Exporter ein, und der sammelt nur
 * `warn`/`error` für die Startdiagnose (`startupLogs`) — diese Sammlung erscheint ausschließlich im
 * Bericht über **fehlgeschlagene** Einträge. Ein Plugin, das erfolgreich einhängt und dabei etwas
 * meldet, schreibt in einen Sammler, den niemand ausgibt.
 *
 * Deshalb geht jede Zeile zusätzlich auf `process.stderr` — dieselbe Form, die `pmh-auth-http`
 * benutzt (`packages/api/auth-http/src/index.ts:459`). Der cordis-Logger wird weiterhin bedient:
 * ein Host, der Logs wirklich ausgibt, bekommt die strukturierte Fassung.
 *
 * @param ctx - der Kern-Kontext
 * @returns `info` und `warn`; ohne Dienst bleibt es bei `stderr`
 */
export function protokollAus(ctx: HostKontext): Protokoll {
  const dienst = ctx.logger
  const ziel: Partial<Protokoll> | undefined = dienst === undefined
    ? undefined
    : typeof dienst === 'function' ? (dienst(name) ?? undefined) : dienst
  const schreibe = (art: 'info' | 'warn', meldung: string): void => {
    process.stderr.write(`${PRAEFIX}${meldung}\n`)
    if (ziel === undefined) return
    const methode = ziel[art] ?? ziel.warn
    if (methode !== undefined) methode.call(ziel, meldung)
  }
  return {
    info: (meldung: string): void => { schreibe('info', meldung) },
    warn: (meldung: string): void => { schreibe('warn', meldung) },
  }
}

/** Der Name des Plugins — zugleich der Name des Cordis-Eintrags. */
export const name = 'pmh-crew'

/** Die Dienste, ohne die das Plugin nicht einhängt. */
export const inject = ['llm', 'tools'] as const

/**
 * Hängt das Plugin ein.
 *
 * @param ctx - der Kern-Kontext
 * @param konfiguration - Crews, Nutzer, Projekt und die optionalen Wege
 * @returns die Abmelde-Funktion (für `hot` und für Prüfungen)
 * @throws Error wenn keine Crew, kein Nutzer oder eine unbrauchbare Crew angegeben ist
 */
export function applyMitKonfiguration(ctx: HostKontext, konfiguration: Konfiguration): () => void {
  if (konfiguration.crews.length === 0) throw new Error('pmh-crew: ohne Crew wird nichts angemeldet')
  if (!konfiguration.crews.some((crew) => crew.id === konfiguration.crew)) {
    throw new Error(`pmh-crew: die Crew "${konfiguration.crew}" steht nicht in der Konfiguration`)
  }
  const nurAdapter = konfiguration.nurAdapter === true
  if (!nurAdapter && konfiguration.nutzer.trim() === '') {
    throw new Error('pmh-crew: ohne Nutzer wird nicht gebucht — sonst waere die Nutzertrennung eine Behauptung')
  }
  // **Nur Modelle heißt: kein Bereich, kein Plan, keine Buchung.** Ein leerer Nutzer würde
  // `projektbereich` werfen; deshalb wird hier gar nichts davon gebaut.
  const bereich = nurAdapter
    ? undefined
    : projektbereich({
        nutzer: konfiguration.nutzer,
        ...(konfiguration.projekt === undefined ? {} : { pfad: konfiguration.projekt }),
      })
  const speicherPlan = nurAdapter
    ? undefined
    : new CrewZustandSpeicher({
        ...(konfiguration.verzeichnis === undefined ? {} : { verzeichnis: konfiguration.verzeichnis }),
      })
  const speicherVerbrauch = nurAdapter
    ? undefined
    : new Verbrauchsspeicher({
        ...(konfiguration.verzeichnis === undefined ? {} : { verzeichnis: konfiguration.verzeichnis }),
      })
  const aufzeichner = nurAdapter || speicherVerbrauch === undefined
    ? undefined
    : new Aufzeichner({
        speicher: speicherVerbrauch,
        tarife: konfiguration.tarife ?? SAAT,
      })

  const abmeldungen: (() => void)[] = []
  const protokoll = protokollAus(ctx)
  const melde = (fehler: unknown): void => {
    protokoll.warn(fehler instanceof Error ? fehler.message : String(fehler))
  }

  // 1. Die Crew am Kern-Seam.
  const adapter = new CrewAdapter(ctx.llm, konfiguration.crews)
  abmeldungen.push(ctx.llm.registerAdapter([CREW_ROUTE], adapter))

  if (nurAdapter) {
    // **Ende hier.** Der Adapter bietet die Modelle an; Werkzeuge und Buchung brauchen ein Konto,
    // und ohne Sitzung im Werkzeug wäre jede Wahl geraten. Der Betrieb sieht den Grund im
    // Protokoll — ein stilles „nur halb" wäre von einem Fehler nicht zu unterscheiden.
    const abmelden = (): void => {
      for (const abmeldung of abmeldungen.reverse()) {
        try {
          abmeldung()
        } catch (fehler) {
          melde(fehler)
        }
      }
    }
    ctx.effect?.(() => abmelden, 'pmh-crew: Adapter abmelden')
    protokoll.info(
      `eingehaengt (nur Modelle) — ${String(konfiguration.crews.length)} Crews, `
      + 'ohne Werkzeuge und ohne Buchung (kein Betriebskonto)',
    )
    return abmelden
  }

  if (bereich === undefined || speicherPlan === undefined || aufzeichner === undefined) {
    throw new Error('pmh-crew: die Verdrahtung ohne Adapter ist unvollstaendig')
  }

  // 2. Die Werkzeuge.
  const werkzeuge = crewWerkzeuge({
    crew: konfiguration.crew,
    bereich,
    aufrufer: 'executor',
    speicher: speicherPlan,
  })
  if (konfiguration.modlens !== undefined) {
    werkzeuge.push(modlensWerkzeug({
      cliPfad: konfiguration.modlens.cliPfad,
      ...(konfiguration.modlens.programm === undefined ? {} : { programm: konfiguration.modlens.programm }),
      ...(konfiguration.modlens.timeoutMs === undefined ? {} : { timeoutMs: konfiguration.modlens.timeoutMs }),
      ausfuehren: konfiguration.modlens.ausfuehren,
    }))
  }
  if (konfiguration.suche !== undefined) {
    werkzeuge.push(...suchWerkzeuge({
      apiKey: konfiguration.suche.apiKey,
      ...(konfiguration.suche.basis === undefined ? {} : { basis: konfiguration.suche.basis }),
      // Der echte Netzweg als Vorgabe: eine JSON-Datei kann keine Funktion liefern, und ohne diese
      // Vorgabe wäre die Suche aus der Datei **nicht** einschaltbar (gemessen: `hole` war Pflicht).
      hole: konfiguration.suche.hole ?? netzHole(),
    }))
  }
  for (const werkzeug of werkzeuge) {
    abmeldungen.push(ctx.tools.register(alsKernWerkzeug(werkzeug)))
  }

  // 3. Die Buchung am Wasserfall — durchgereicht, nie verändert.
  abmeldungen.push(ctx.on('llm/stream', (options, next) => {
    const strom = next()
    return (async function* () {
      for await (const stueck of strom) {
        if (stueck.type === 'usage') {
          void aufzeichner
            .verbuchen({
              nutzer: konfiguration.nutzer,
              familie: options.provider,
              modell: options.model,
              tokens: {
                inputTokens: stueck.usage.inputTokens,
                outputTokens: stueck.usage.outputTokens,
                ...(stueck.usage.cacheReadTokens === undefined ? {} : { cacheReadTokens: stueck.usage.cacheReadTokens }),
                ...(stueck.usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: stueck.usage.cacheWriteTokens }),
              },
            })
            .catch(melde)
        }
        yield stueck
      }
    })()
  }))

  const abmelden = (): void => {
    for (const abmeldung of abmeldungen.reverse()) {
      try {
        abmeldung()
      } catch (fehler) {
        melde(fehler)
      }
    }
  }
  ctx.effect?.(() => abmelden, 'pmh-crew: Adapter, Werkzeuge und Buchung abmelden')
  // Die eine Zeile, an der der Betrieb erkennt, daß das Plugin **wirklich** eingehaengt ist:
  // ein Eintrag, der stillschweigend nichts tut, sieht im Startprotokoll genauso aus wie keiner.
  protokoll.info(
    `eingehaengt — Crew "${konfiguration.crew}", Nutzer "${konfiguration.nutzer}", `
    + `${werkzeuge.length} Werkzeuge, Buchung am llm/stream`,
  )
  return abmelden
}

/**
 * Das Konto eines Nutzers, wie die Anzeige es braucht.
 *
 * @param konfiguration - dieselbe Konfiguration wie beim Einhängen
 * @param feld - Zeitraum und Budget
 * @param aufzeichner - optional ein eigener Aufzeichner (Tests)
 * @returns Stand und Zusammenfassung
 */
export async function kontoFuer(
  konfiguration: Konfiguration,
  feld: { tage?: number } = {},
): Promise<{ kostenUsd: number; anfragen: number; unbepreistProzent: number }> {
  const speicher = new Verbrauchsspeicher({
    ...(konfiguration.verzeichnis === undefined ? {} : { verzeichnis: konfiguration.verzeichnis }),
  })
  const aufzeichner = new Aufzeichner({ speicher, tarife: konfiguration.tarife ?? SAAT })
  const konto = await aufzeichner.konto(konfiguration.nutzer, {
    ...(feld.tage === undefined ? {} : { tage: feld.tage }),
  })
  return {
    kostenUsd: konto.uebersicht.kostenUsd,
    anfragen: konto.uebersicht.anfragen,
    unbepreistProzent: konto.uebersicht.unbepreistProzent,
  }
}
/**
 * Hängt das Plugin aus einer **Datei** ein — der Weg, den der Loader nimmt.
 *
 * **Warum dieser Einstieg der richtige ist.** Die Zeile im Profil trägt keine Konfiguration; die
 * Datei ist der einzige Ort, an dem Crews, Nutzer und Projekt stehen können. Diese Variante
 * unterscheidet: **fehlt** die Datei, wird **nichts** eingehängt und der Grund protokolliert. Ist sie
 * da und **kaputt**, wird geworfen — sichtbar im Startprotokoll. Warum ein Wurf den Host trotzdem
 * nicht anhält, steht bei {@link liesKonfiguration} in `config-file.ts`.
 *
 * @param ctx - der Kern-Kontext
 * @param wurzel - das Home des Hosts
 * @returns die Abmelde-Funktion; bei fehlender Datei eine, die nichts tut
 * @throws Error wenn die Datei existiert, aber keine brauchbare Konfiguration enthält
 */
export function applyAusDatei(ctx: HostKontext, wurzel: string): () => void {
  const pfad = konfigurationsdatei(wurzel)
  const lesung = liesKonfiguration(pfad)
  if (lesung.art === 'fehlt') {
    protokollAus(ctx).warn(
      `keine Konfiguration unter ${pfad} — nichts eingehaengt (Crews, Nutzer und crew eintragen)`,
    )
    return () => {}
  }
  const konfiguration: Konfiguration = {
    ...lesung.konfiguration,
    ...(lesung.konfiguration.verzeichnis === undefined ? { verzeichnis: join(wurzel, 'crew') } : {}),
  }
  return applyMitKonfiguration(ctx, konfiguration)
}
/**
 * Das Home des Hosts aus der Umgebung.
 *
 * **Warum nicht ein fester Pfad.** Der Loader kennt den Wohnort des Hosts; ein Plugin, das `~/.dsh`
 * fest einträgt, schreibt auf einer Maschine mit `--home` in einen fremden Baum. Genommen wird
 * deshalb `DSH_HOME`, das der Host selbst setzt, und erst dann der Vorgabeort.
 *
 * **Warum `DSH_HOME` und nicht `PMH_HOME`.** `PMH_HOME` ist das **eigene** Home dieses Projekts
 * (Prometheus' Ablage, gelesen von `@prometheus-harness/home-paths`). Dieses Plugin ist ein Plugin
 * des **Kerns** und lebt in dessen Baum; ein Blick in `PMH_HOME` suchte die Konfiguration am
 * falschen Ort. Gemessen: mit `PMH_HOME` auf das Harness-Home gezeigt, verweigerte `pmh-auth-http`
 * den Start („das eigene Home zeigt auf das Home des DeepSeek Harness").
 *
 * **Warum `resolve`.** Der Host reicht das Home **so weiter, wie es auf der Befehlszeile stand**.
 * Gemessen mit `--home .pmh-build/harness-home`: `DSH_HOME` ist genau dieser relative Text, und
 * `join('…', 'crew')` ergab `.pmh-build\harness-home\crew\config.json` — relativ zum
 * Arbeitsverzeichnis des Hosts. Wer aus einem anderen Verzeichnis startet, schriebe woandershin.
 * Deshalb wird der Pfad hier absolut gemacht.
 *
 * @returns das Home, absolut
 */
export function homeAusUmgebung(): string {
  const gesetzt = process.env['DSH_HOME']
  if (gesetzt !== undefined && gesetzt.trim() !== '') return resolve(gesetzt)
  return join(homedir(), '.dsh')
}

/**
 * Der Einstieg, den der **Loader** ruft.
 *
 * **Warum es zwei Wege gibt und nicht einen.** Der Loader ruft `apply(ctx, config)` mit der
 * Konfiguration aus der Eintragszeile — und die ist bei uns leer. Eine leere Konfiguration darf
 * weder stillschweigend unter einem Sammelkonto buchen noch den Boot abbrechen. Deshalb:
 *
 * | gerufen mit | Verhalten |
 * |---|---|
 * | vollständiger Konfiguration (`crews` vorhanden) | {@link applyMitKonfiguration} |
 * | leer/fehlend | {@link applyAusDatei} mit {@link homeAusUmgebung} — fehlt die Datei, wird **nichts** eingehängt und protokolliert |
 *
 * @param ctx - der Kern-Kontext
 * @param konfiguration - die Konfiguration aus der Zeile, falls es eine gibt
 * @returns die Abmelde-Funktion
 */
export function apply(ctx: HostKontext, konfiguration?: Partial<Konfiguration>): () => void {
  const crews = konfiguration?.crews
  if (Array.isArray(crews) && crews.length > 0) {
    return applyMitKonfiguration(ctx, konfiguration as Konfiguration)
  }
  return applyAusDatei(ctx, homeAusUmgebung())
}
