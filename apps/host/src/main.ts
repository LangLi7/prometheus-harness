/**
 * Prometheus Harness — eigener Anwendungs-Einstieg (Host).
 *
 * **Was dieser Host ist.** Der eigene Einstieg, der den Agent-Core startet und
 * die Oberfläche ausliefert. Er ist **kein Nachbau** des Upstream-Hosts
 * (`apps/cli`): er benutzt die Core-Pakete und ruft deren dokumentierte
 * Boot-Schnittstelle auf (`@deepseek-ai/dsh-app-boot`).
 *
 * **Warum er nicht `apps/cli` heißt.** `MAPPING.md` §3.5 führt den Host als
 * `apps/cli` (Stufe A). Die drei kopierten Apps (`cli`, `desktop`,
 * `desktop-host`) hatten jedoch zusammen **1.043 byte-identische Dateien** und
 * **158 unauflösbare `workspace:*`-Verweise** — sie haben jedes `bun install`
 * blockiert (Auflage **A1** in `docs/review/backend-review.md`). Sie wurden am
 * 13.10.2026 entfernt; dieser Host tritt an ihre Stelle.
 *
 * **Die Entscheidung, die hier umgesetzt wird:** `docs/decisions/core-supply.md`
 * (Hybrid: Core als Abhängigkeit) und
 * `docs/decisions/hybrid-then-self-build.md` (Hybrid zuerst, Eigenbau danach).
 * Dieser Host ist der Teil, den wir **besitzen**; der Kern ist eine Abhängigkeit
 * auf der gepinnten Version `0.2.1-alpha.2`.
 *
 * **Kommandofläche** (siehe `parseHostFlags`): ein Unterkommando setzt das
 * Profil (`pmh web`), `--profile` überschreibt es, `--port` wird an das
 * Web-Bündel durchgereicht, `--patches` lädt Overlays über die Profil-Schichten.
 *
 * bleibt eine Abhängigkeit auf der gepinnten Version `0.2.1-alpha.2`.
 *
 * **Warum der Host nicht einfach den Upstream-CLI aufruft.** Der Upstream-CLI ist
 * ein fertiges Produkt mit eigener Kommandofläche, Profilverwaltung und
 * `pnpm`-Anbindung. Unser Host braucht davon ein Bruchstück: Profil auflösen,
 * Patch-Schichten stapeln, Baum booten. Genau das tut er — in der Reihenfolge,
 * die der Upstream selbst dokumentiert.
 *
 * **Vier Schritte, mehr nicht:**
 *   1. Profil sicherstellen (`<PMH_HOME>/profiles/pmh`, aus der Vorlage initialisiert)
 *   2. leere Wurzelkonfiguration schreiben — die Komposition entsteht aus Patches
 *   3. Profil laden (Bündel-Schichten + eigene Patch-Schicht)
 *   4. `boot()` gegen die Wurzel, mit `profileContext` und Kommandozeilen-Argumenten
 *
 * **Was dieser Host bewusst nicht tut:** keine Plugin-Verwaltung, kein
 * Konfigurations-Dump, kein `pnpm`. Was fehlt, steht im README unter „Grenzen".
 *
 * @module @prometheus-harness/host/main
 */

import {
  boot,
  initProfile,
  loadOverlayPatches,
  loadProfile,
  readProfilePatches,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Diagnose-Präfix aller Zeilen dieses Hosts auf stderr. */
const BIN = 'pmh'

/** Profilname unterhalb von `<PMH_HOME>/profiles`. */
const PROFILE_NAME = 'pmh'

/** Dateiname der Wurzelkonfiguration innerhalb eines Profilverzeichnisses. */
const PROFILE_ROOT_FILENAME = 'cordis.yml'

/**
 * Leere Wurzel-Entry-Liste. Die Komposition des Baumes entsteht **ausschließlich**
 * aus Patch-Schichten; die Datei existiert nur, weil der Loader eine echte
 * Include-Wurzel braucht, an der er `baseUrl` verankern kann. Sie wird bei jedem
 * Start neu geschrieben: schreibt der Loader einen komponierten Baum zurück,
 * würde sonst jedes Bündel-Insert beim nächsten Start verdoppelt.
 */
const PROFILE_ROOT_CONFIG = `# pmh profile root — leere Entry-Liste. Der Baum wird komponiert aus:
# jeder Bündel-Schicht aus package.json (dsh.profile.bundles), dann cordis.patch.yml,
# dann etwaigen --patch-Overlays. Diese Datei nicht von Hand bearbeiten.
[]
`

/**
 * Absolute Pfade dieses Hosts, abgeleitet aus dem eigenen Modulpfad — nie aus der
 * Umgebung. Keine Umgebungsvariable darf entscheiden, welcher Code läuft (dieselbe
 * Regel, die der Referenz-Harness für seine Binärpfad-Auflösung befolgt).
 *
 * `src/main.ts` → `apps/host` → `apps/host/package.json` ist der
 * Installations-Anker, gegen den Profil-Bündel aufgelöst werden.
 */
const HOST_PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const HOST_ANCHOR = join(HOST_PACKAGE_DIR, 'package.json')

/**
 * Die Bündel unseres Profils — **nicht** die Vorgabeliste.
 *
 * `DEFAULT_PROFILE_BUNDLES` ist `["@deepseek-ai/dsh-base"]`, also der agentische
 * Kern ohne jede Oberfläche. Ein Host, der eine Web-Oberfläche ausliefern soll,
 * braucht die Web-Vorlage: `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]`
 * (aus `PROFILE_TEMPLATES.web`). Genau das war der erste gemessene Fehler dieses
 * Hosts: mit der Vorgabeliste lief der Baum, aber es gab keinen Webserver.
 */
const PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] as const

/**
 * Ein Patch-Overlay, das dieser Host lädt.
 *
 * Ein Overlay ist eine YAML-Datei im Format des Include-Plugins: gezielte
 * Konfigurations-Überschreibungen (`id`-adressiert), `insert`-Listen und
 * `!!js`-Ausdrücke. Der Upstream-Launcher nennt die Option `--patch` und
 * erlaubt sie mehrfach; die Overlays werden **über** Profil- und Home-Schicht
 * angewendet, in der Reihenfolge ihres Auftretens.
 *
 * Warum wir das brauchen: eine Änderung an der Komposition soll **nicht**
 * bedeuten, dass jemand `cordis.patch.yml` im Harness-Home von Hand bearbeitet.
 * Ein Overlay ist ein Argument, keine Zustandsänderung — nachvollziehbar und
 * wiederholbar.
 */
export interface HostFlags {
  /**
   * Profilname. **Immer gesetzt**, weil {@link parseHostFlags} ihn auflöst:
   * `--profile` schlägt das Unterkommando, sonst bleibt es `undefined` und der
   * Aufrufer setzt die Vorgabe. Als Pflichtfeld modelliert, damit
   * `exactOptionalPropertyTypes` nicht zwischen „fehlt" und „undefined"
   * unterscheiden muss — hier ist beides dasselbe.
   */
  readonly profile: string | undefined
  /** Port für die Oberfläche (`--port`), wie vom Web-Bündel gelesen. */
  readonly port: string | undefined
  /** Patch-Overlays in Auftretens-Reihenfolge (`--patches a.yml,b.yml`, wiederholbar). */
  readonly patches: readonly string[]
  /** Die Argumente, die dem gebooteten Baum gehören. */
  readonly inner: readonly string[]
}

/**
 * Zerlegt die Kommandozeile in **Host**- und **App**-Argumente.
 *
 * Bis hierher kannte der Host nur ein einziges eigenes Token (den Profilnamen als
 * Unterkommando). Jetzt kennt er drei Familien:
 *
 * | Form | Bedeutung |
 * |---|---|
 * | `web`, `headless`, `sdk` | Unterkommando = **Profilname** (wie im Upstream: `dsh <name>`) |
 * | `--profile <name>` / `-p <name>` | Profil ausdrücklich; **gewinnt** gegen ein Unterkommando |
 * | `--port <n>` | Port — wird **durchgereicht**, weil das Web-Bündel ihn liest |
 * | `--patches a.yml,b.yml` / wiederholbar | Patch-Overlays, in Reihenfolge |
 * | alles andere | dem Baum übergeben (`ctx.cmdlineArgs`) |
 *
 * **Warum `--port` durchgereicht und nicht hier ausgewertet wird:** Der
 * Webserver gehört dem Web-Bündel, nicht dem Host. Der Host würde sonst die
 * Semantik des Bündels nachbauen müssen — genau die doppelte Semantik, die
 * `docs/stack.md` beim Gateway verbietet. Der Host **erkennt** die Option nur,
 * damit sein `--help` sie nennt, und reicht sie unverändert weiter.
 *
 * @param argv - `process.argv` ohne die ersten beiden Einträge
 * @returns die vier Felder; `inner` ist immer definiert, `patches` ggf. leer
 */
export function parseHostFlags(argv: readonly string[]): HostFlags {
  const patches: string[] = []
  const inner: string[] = []
  let profile: string | undefined
  let port: string | undefined
  /** Position des ausdrücklich genannten Unterkommandos, falls es eines gibt. */
  let subcommand: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) continue

    // `--profile x`, `--port x`, `--patches x` — Wert im nächsten Argument.
    const takesValue = arg === '--profile' || arg === '-p' || arg === '--port' || arg === '--patches'
    if (takesValue) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('-')) {
        // Kein Wert: das ist ein Aufruf-Fehler. Der Host meldet ihn sichtbar
        // (Regel 3: ein fehlgeschlagener Start ist ein sichtbarer Fehler) und
        // beendet sich, statt stillschweigend ohne die Option weiterzulaufen.
        throw new Error(`${arg} verlangt einen Wert`)
      }
      index += 1
      if (arg === '--profile' || arg === '-p') profile = value
      else if (arg === '--port') port = value
      else {
        // Mehrere Dateien in einem Argument sind erlaubt, damit ein Skript
        // nicht für jede Datei ein eigenes Flag schreiben muss.
        for (const file of value.split(',')) {
          const trimmed = file.trim()
          if (trimmed !== '') patches.push(trimmed)
        }
      }
      continue
    }

    // `--profile=x` — Wert am Gleichheitszeichen.
    if (arg.startsWith('--profile=')) {
      profile = arg.slice('--profile='.length)
      continue
    }
    if (arg.startsWith('--port=')) {
      port = arg.slice('--port='.length)
      continue
    }
    if (arg.startsWith('--patches=')) {
      for (const file of arg.slice('--patches='.length).split(',')) {
        const trimmed = file.trim()
        if (trimmed !== '') patches.push(trimmed)
      }
      continue
    }

    // Ein nacktes Wort an erster Stelle ist das Unterkommando. Nur das erste
    // zählt: `pmh web --port 5199` — `web` ist das Profil, alles danach gehört
    // der App, auch wenn dort weitere nackte Wörter stehen.
    if (index === 0 && !arg.startsWith('-')) {
      subcommand = arg
      continue
    }

    inner.push(arg)
  }

  return {
    // Ausdrückliches `--profile` schlägt das Unterkommando: wer beides nennt,
    // meint die ausdrückliche Angabe.
    profile: profile ?? subcommand,
    port,
    patches,
    inner,
  }
}

/**
 * Hängt die Overlays **hinter** die Profil-Schichten.
 *
 * Die Reihenfolge ist bindend und stammt aus dem Upstream: erst die
 * Bündel-Schichten, dann die Profil-eigene `cordis.patch.yml`, dann die
 * `--patch`-Overlays. Spätere Schichten überschreiben frühere — ein Overlay
 * gewinnt also gegen die Profil-Datei, was der Sinn eines Overlays ist.
 *
 * @param base - die Schichten aus dem Profil
 * @param overlays - die geladenen `--patches`-Overlays
 * @returns eine neue Liste; die Eingaben werden nicht verändert
 */
function mergePatches(
  base: readonly PatchOptions[],
  overlays: readonly PatchOptions[],
): PatchOptions[] {
  return overlays.length === 0 ? [...base] : [...base, ...overlays]
}

/**
 * Profil auflösen und bei Bedarf aus der Web-Vorlage anlegen.
 *
 * Ein vorhandenes Profil wird **nie** überschrieben: `initProfile` fasst
 * existierende Dateien nicht an. Ein Profil, das nur das Basis-Bündel kennt,
 * bleibt deshalb unverändert — wer sein Profil bewusst selbst pflegt, soll das
 * dürfen; das README nennt den einen Befehl, der es auf die Web-Vorlage hebt.
 *
 * @param name - Profilname (`--profile` oder Unterkommando); ohne Angabe `pmh`
 * @returns das aufgelöste Profilverzeichnis
 */
function ensureProfile(name: string): string {
  const dir = resolveProfileDir(name)
  if (!existsSync(join(dir, 'package.json'))) {
    mkdirSync(dirname(dir), { recursive: true })
    initProfile(dir, PROFILE_BUNDLES)
  }
  return dir
}

/**
 * Übersetzt die Host-Flags in die Argumente, die der gebootete Baum bekommt.
 *
 * Der Host wertet `--port` **nicht** selbst aus, sondern gibt es weiter — der
 * Webserver gehört dem Web-Bündel. Damit die Übergabe trotzdem einheitlich ist,
 * wird hier normalisiert: `--port=5199` und `--port 5199` werden beide zu
 * `--port 5199`, und die ursprüngliche Schreibweise verschwindet aus `inner`.
 *
 * @param flags - Ergebnis von {@link parseHostFlags}
 * @returns die Argumentliste für den Baum, in stabiler Reihenfolge
 */
function argsForTree(flags: HostFlags): readonly string[] {
  const out: string[] = [...flags.inner]
  if (flags.port !== undefined) out.push('--port', flags.port)
  return out
}

/**
 * Lädt die Patch-Overlays und bricht bei einem fehlenden sichtbar ab.
 *
 * Ein Overlay, das der Aufrufer **ausdrücklich genannt** hat und das nicht
 * existiert, ist eine Fehlkonfiguration — kein „nimm eben die Vorgabe". Der
 * Upstream unterscheidet genau so: eine fehlende optionale Schicht ist keine
 * Schicht, eine genannte Datei muss da sein. Wir folgen dem, weil ein
 * stillschweigend übergangenes Overlay den Benutzer glauben lässt, seine
 * Änderung sei wirksam.
 *
 * @param flags - Ergebnis von {@link parseHostFlags}
 * @returns die geladenen Overlays in Reihenfolge
 */
function overlaysFor(flags: HostFlags): readonly PatchOptions[] {
  const loaded: PatchOptions[] = []
  for (const file of flags.patches) {
    const absolute = resolve(file)
    if (!existsSync(absolute)) {
      throw new Error(`--patches: Datei nicht gefunden: ${file}`)
    }
    loaded.push(...loadOverlayPatches(BIN, absolute))
  }
  return loaded
}

/**
 * Startet den Core und lässt den Prozess leben, solange Plugins ihn tragen.
 *
 * Die Argumente dieses Hosts werden **unverändert** an den Baum gereicht: jedes
 * App-Plugin liest sie aus `ctx.cmdlineArgs` und druckt seine eigene `--help`.
 * So erreicht `web --port 5199` den Webserver und nicht diesen Host — dieselbe
 * Trennung von Launcher- und App-Flags, die der Upstream dokumentiert.
 *
 * **Bewusste Auslassung — `PluginPackages` wird nicht eingehängt.** Dieses
 * Upstream-Plugin installiert profil-deklarierte Pakete und hängt dafür einen
 * Laufzeit-Interzeptor ein, der das native Addon `node-addon-require-builtin`
 * braucht. Dieses Addon verlangt V8-Interna, die **Bun nicht bereitstellt**
 * (gemessen: `Unsupported/no-context`, `has_v8_context: false`, Bun 1.4.0).
 * Der Einhängepunkt ist damit unter Bun nicht benutzbar. Er wird deshalb
 * weggelassen statt umgangen — die Bündel-Pakete dieses Hosts stehen als
 * gewöhnliche Abhängigkeiten in `package.json` und werden über den Anker
 * aufgelöst, nicht über den Interzeptor. Die Grenze steht im README.
 */
async function main(): Promise<void> {
  const flags = parseHostFlags(process.argv.slice(2))
  const profileName = flags.profile ?? PROFILE_NAME

  const dir = ensureProfile(profileName)
  const rootConfig = join(dir, PROFILE_ROOT_FILENAME)

  // Der Loader braucht eine reale Include-Wurzel; sie ist immer leer.
  writeFileSync(rootConfig, PROFILE_ROOT_CONFIG)

  // Overlays zuerst laden: eine genannte, aber fehlende Datei soll **vor** dem
  // Boot scheitern, nicht mitten im Baumaufbau.
  const overlays = overlaysFor(flags)

  const profile = loadProfile(BIN, profileName, HOST_ANCHOR)
  const profileContext: ProfileContext = {
    name: profileName,
    dir: profile.dir,
    patchPath: profile.patchPath,
    installAnchor: HOST_ANCHOR,
    startedBundles: profile.layers.map((layer) => layer.packageName),
    cwd: process.cwd(),
    home: resolveDshHome(),
    overlays: [],
    // Pflichtfeld mit `string | undefined`: der Upstream liest den Startwert des
    // Telemetrie-Schalters durch (jeder nicht-leere Wert schaltet ab, auch "0").
    telemetryDisabledEnv: process.env.DSH_TELEMETRY_DISABLED,
  }

  const hostArgs = argsForTree(flags)

  const ctx = await boot(
    BIN,
    rootConfig,
    // Overlays **hinter** die Profil-Schichten: ein Overlay gewinnt gegen die
    // Profil-Datei — das ist der Sinn eines `--patch`-Arguments.
    mergePatches(readProfilePatches(BIN, profileContext, profile), overlays),
    async (hostCtx) => {
    hostCtx.provide('profileContext', profileContext)
    provideCmdline(hostCtx, {
      args: hostArgs,
      exit: (code: number) => { process.exitCode = code },
    })
  })

  const loader = ctx.get('loader')
  process.stderr.write(`${BIN}: Core läuft (Profil "${profileName}", Loader ${loader === undefined ? 'fehlt' : 'aktiv'})\n`)

  // Lebensdauer liegt bei den Plugins — der Webserver hält den Prozess offen.
  // Ein Abbruchsignal entsorgt den Baum sauber, statt den Prozess hart zu töten.
  const shutdown = (signal: string): void => {
    process.stderr.write(`${BIN}: ${signal} empfangen — Baum wird entsorgt\n`)
    void ctx.fiber.dispose().finally(() => { process.exitCode = 0 })
  }
  process.on('SIGINT', () => { shutdown('SIGINT') })
  process.on('SIGTERM', () => { shutdown('SIGTERM') })
}

await main()
