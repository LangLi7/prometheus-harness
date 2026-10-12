/**
 * Prometheus Harness — eigener Anwendungs-Einstieg (Host).
 *
 * **Was dieser Host ist.** Der kleine, selbst geschriebene Einstieg, der den
 * Agent-Core startet. Er ist **keine** Kopie des Referenz-Hosts (`apps/cli` des
 * Referenz-Forks, 1.043 byte-identische Dateien): er benutzt die veröffentlichten
 * Core-Pakete als **Abhängigkeit** und ruft nur deren dokumentierte
 * Boot-Schnittstelle auf (`@deepseek-ai/dsh-app-boot`).
 *
 * **Die Entscheidung, die hier umgesetzt wird:** `docs/decisions/core-supply.md`
 * (Weg B — Hybrid) und `docs/decisions/hybrid-then-self-build.md` (Hybrid zuerst,
 * Eigenbau danach). Dieser Host ist der Teil, den wir **besitzen**; der Kern
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
  loadProfile,
  readProfilePatches,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
 * Zerlegt die Kommandozeile in **Launcher**- und **App**-Argumente.
 *
 * Der Upstream-Launcher trennt beides: die ersten Token, die er nicht kennt,
 * beginnen die inneren Argumente (`dsh --profile web --port 8080`). Unser Host
 * hat genau **ein** eigenes Token: den Profilnamen als Unterkommando. Alles
 * danach gehört der App.
 *
 * Warum das nicht kosmetisch ist — gemessener Fehler: reicht man `web` mit
 * durch, liest `commander` es als **positionales** Argument und bricht mit
 * `too many arguments. Expected 0 arguments but got 1: web` ab. Der Webserver
 * startet dann nie.
 *
 * @param argv - `process.argv` ohne die ersten beiden Einträge
 * @returns die Argumente, die dem gebooteten Baum übergeben werden
 */
function innerArgs(argv: readonly string[]): readonly string[] {
  const [first, ...rest] = argv
  if (first === undefined) return []
  // Ein Unterkommando ist ein nacktes Wort ohne führenden Bindestrich.
  return first.startsWith('-') ? argv : rest
}

/**
 * Profil auflösen und bei Bedarf aus der Web-Vorlage anlegen.
 *
 * Ein vorhandenes Profil wird **nie** überschrieben: `initProfile` fasst
 * existierende Dateien nicht an. Ein Profil, das nur das Basis-Bündel kennt,
 * bleibt deshalb unverändert — wer sein Profil bewusst selbst pflegt, soll das
 * dürfen; das README nennt den einen Befehl, der es auf die Web-Vorlage hebt.
 *
 * @returns das aufgelöste Profilverzeichnis
 */
function ensureProfile(): string {
  const dir = resolveProfileDir(PROFILE_NAME)
  if (!existsSync(join(dir, 'package.json'))) {
    mkdirSync(dirname(dir), { recursive: true })
    initProfile(dir, PROFILE_BUNDLES)
  }
  return dir
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
  const dir = ensureProfile()
  const rootConfig = join(dir, PROFILE_ROOT_FILENAME)

  // Der Loader braucht eine reale Include-Wurzel; sie ist immer leer.
  writeFileSync(rootConfig, PROFILE_ROOT_CONFIG)

  const profile = loadProfile(BIN, PROFILE_NAME, HOST_ANCHOR)
  const profileContext: ProfileContext = {
    name: PROFILE_NAME,
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

  const hostArgs = innerArgs(process.argv.slice(2))

  const ctx = await boot(BIN, rootConfig, readProfilePatches(BIN, profileContext, profile), async (hostCtx) => {
    hostCtx.provide('profileContext', profileContext)
    provideCmdline(hostCtx, {
      args: hostArgs,
      exit: (code: number) => { process.exitCode = code },
    })
  })

  const loader = ctx.get('loader')
  process.stderr.write(`${BIN}: Core läuft (Profil "${PROFILE_NAME}", Loader ${loader === undefined ? 'fehlt' : 'aktiv'})\n`)

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
