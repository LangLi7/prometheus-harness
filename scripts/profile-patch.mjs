/**
 * Trägt unsere Plugin-Zeilen in die Patch-Schicht des Profils ein.
 *
 * ## Warum das ein Skript ist und keine eingecheckte Datei
 *
 * Die Patch-Schicht des Profils (`cordis.patch.yml`) liegt in
 * `.pmh-build/harness-home/profiles/web/` — und `.pmh-build/` ist **nicht**
 * versioniert (Bau- und Laufzeitordner, siehe `.gitignore`). Eine handgeschriebene
 * Datei dort wäre beim nächsten Klon **weg**, und die Anleitung „trag die Zeile
 * ein" liefe stillschweigend ins Leere.
 *
 * Deshalb steht der Eintrag **hier** im Repo und wird bei jedem Start in die
 * Profildatei geschrieben. Wer das Projekt klont und startet, bekommt den
 * Endpunkt — ohne Handgriff.
 *
 * ## Die Form des Eintrags — hier lagen zwei Fehler
 *
 * Die Patch-Semantik des Loaders (`applyEntryPatches` in `dsh-app-boot`) ist
 * **nicht** „jede Zeile ist eine neue Zeile". Sie kennt genau zwei Formen:
 *
 * | Form | Wirkung |
 * |---|---|
 * | `{ insert: [zeile, …] }` | **hängt Zeilen an** die Eintragsliste an |
 * | `{ id, name?, …felder }` | **ändert** die Zeile mit dieser `id`; `name` wird geprüft, nicht gesetzt |
 *
 * Daraus folgen die beiden Fehler, die dieses Skript zuerst hatte:
 *
 * 1. **`- id: health` + `name: '…'`** — das ist die **Änderungs**form ohne
 *    `insert`. Der Loader sucht eine Zeile mit der id `health`, findet keine und
 *    meldet „patch: entry health not found". Unsere Zeile wäre **nie** eingehängt
 *    worden; im Protokoll stünde eine Warnung, und der Host liefe ohne unseren
 *    Endpunkt weiter. Nachgelesen, nachdem der Endpunkt im Host fehlte.
 * 2. **An eine leere Liste angehängt** — `[]` ist die *leere Liste*, nicht ein
 *    Platzhalter. Zeilen dahinter sind kein YAML mehr; der Host brach mit
 *    „end of the stream or a document separator is expected" ab.
 *
 * Beides ist behoben: der Eintrag benutzt `insert:`, und der `[]`-Platzhalter der
 * Vorlage wird **ersetzt** statt ergänzt.
 *
 * @module scripts/profile-patch
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Beginn des Bereichs, den dieses Skript besitzt. */
export const MARKE_ANFANG = '# >>> pmh: eigene Einträge (von scripts/profile-patch.mjs geschrieben)'

/** Ende des Bereichs, den dieses Skript besitzt. */
export const MARKE_ENDE = '# <<< pmh: eigene Einträge'

/**
 * Der Platzhalter der Vorlage: eine **leere Liste** als ganzes Dokument.
 *
 * Erkannt wird genau `[]` in einer Zeile für sich (mit beliebigem Leerraum). Das
 * ist der Inhalt, den `dsh` beim Anlegen eines Profils schreibt — gemessen an
 * `.pmh-build/harness-home/profiles/web/cordis.patch.yml` am 13.10.2026.
 */
const LEERE_LISTE = /^\s*\[\]\s*$/u

/**
 * Die Zeilen, die wir in die Patch-Schicht eintragen.
 *
 * **Die Form ist `insert:` — die einzige, die Zeilen anfügt.** Siehe Dateikopf.
 *
 * **Warum `name` ein Paketname ist und kein Dateipfad.** Der Loader löst ihn über
 * die Knotenauflösungskette auf. Unsere Arbeitsbereichs-Pakete liegen als
 * Verweise in `node_modules/@prometheus-harness/`; der Name genügt deshalb und
 * bleibt richtig, wenn das Paket umzieht. Ein Dateipfad wäre an eine
 * Ordnerstruktur gebunden. (Der Loader wandelt absolute und mit `./` beginnende
 * Namen ausdrücklich in Datei-URLs um — hier wird beides nicht gebraucht.)
 *
 * **Warum `inject: [webServer]`.** Damit der Loader mit dem Einhängen wartet, bis
 * der Webserver-Dienst existiert, statt uns in einen `undefined`-Zugriff laufen
 * zu lassen.
 *
 * ## Das PTC-Zwischenstück wird abgeschaltet, wo es nicht laufen kann
 *
 * **Der Befund, der diese Zeilen erzwungen hat.** Der Host startete und lieferte
 * HTTP 200 — aber **keine neue Sitzung ließ sich anlegen**:
 *
 * ```
 * New session failed: agent-preset/invalid:
 *   workflow-ptc (@deepseek-ai/dsh-workflow-ptc): waiting for ptcRuntime
 *   tool-workflow (@deepseek-ai/dsh-tool-workflow): waiting for workflowEngine
 * ```
 *
 * Die Ursache ist gemessen und liegt **nicht** bei uns:
 *
 * | Laufzeit | `process.getBuiltinModule('node:module').stripTypeScriptTypes` |
 * |---|---|
 * | Node v24.19.0 | **function** |
 * | Bun 1.4.0 | **`undefined`** |
 *
 * `@deepseek-ai/dsh-ptc-runtime-node` **importiert** diese Funktion in Zeile 1
 * seines `lib/index.js` und benutzt sie in Zeile 955, um TypeScript aus einem
 * PTC-Programm zu entfernen. Unter Bun scheitert schon der Import
 * (`Export named 'stripTypeScriptTypes' not found in module 'node:module'`),
 * also registriert sich `ptcRuntime` nie, `workflow-ptc` wartet ewig, und die
 * Voreinstellung `standard` gilt als ungültig. **Das PTC-Zwischenstück ist ein
 * reines Node-Paket.**
 *
 * **Warum abschalten und nicht nachbauen.** Ein Ersatz für
 * `stripTypeScriptTypes` wäre eine Attrappe an einer sicherheitsrelevanten Stelle:
 * die Funktion bereitet Programmtext auf, der danach **ausgeführt** wird. Wer sie
 * falsch nachbaut, führt falschen Code aus. Das Zwischenstück wird deshalb
 * **ehrlich abgeschaltet**, wo es nicht laufen kann — und auf Node bleibt es an.
 * Die Prüfung ist eine **Fähigkeitsprüfung**, keine Plattformabfrage: käme die
 * Funktion in einer künftigen Bun-Fassung, schaltet sie sich selbst wieder ein.
 *
 * **Was das kostet, ehrlich benannt:** PTC (Werkzeuge in Stapeln aufrufen statt
 * einzeln) steht unter Bun **nicht** zur Verfügung. Wer es braucht, muß den Host
 * unter Node starten — dann sind aber unsere TypeScript-Pakete betroffen, die
 * `Bun.CryptoHasher` und `Bun.password` benutzen (`packages/auth/auth`). Das ist
 * eine offene Entscheidung, kein Zustand.
 *
 * @param packages - Paketnamen in der Reihenfolge, in der sie eingehängt werden
 * @returns die YAML-Zeilen des Bereichs
 */
export function bereichsZeilen(packages, umgebung = undefined) {
  const zeilen = [MARKE_ANFANG, '- insert:']
  for (const eintrag of packages) {
    const paket = paketName(eintrag)
    zeilen.push(`  - id: ${idAus(paket)}`)
    zeilen.push(`    name: '${paket}'`)
    zeilen.push(`    inject: [${paketInject(eintrag).join(', ')}]`)
  }
  for (const zeile of BLEIBENDE_EINTRAEGE) {
    zeilen.push(zeile)
  }
  for (const zeile of terminalZeilen(umgebung)) {
    zeilen.push(zeile)
  }
  // **Die Subagenten-Abschaltung steht hier und nicht in `BLEIBENDE_EINTRAEGE`.**
  // Der erste Versuch spreadete sie dort hinein — und `BLEIBENDE_EINTRAEGE` wird
  // beim Laden des Moduls ausgewertet, die Konstante aber **später** deklariert.
  // In ESM ist das ein `ReferenceError` (temporal dead zone), und zwar beim
  // **Import**: die ganze Datei wäre unbenutzbar geworden. Hier wird sie zur
  // **Laufzeit** von `bereichsZeilen` gelesen — dann ist sie initialisiert.
  for (const zeile of SUBIAGENTEN_ABSCHALTUNG) {
    zeilen.push(zeile)
  }
  zeilen.push(MARKE_ENDE)
  return zeilen
}

/**
 * Einträge, die **nicht** von uns stammen, aber in unserem Bereich überleben müssen.
 *
 * ## Der Schaden, der diese Liste erzwungen hat
 *
 * `mitBereich` **ersetzt** unseren Bereich vollständig — das ist Absicht und macht
 * den Aufruf wiederholbar. Die Kehrseite: **wer innerhalb der Marken von Hand
 * etwas einträgt, verliert es beim nächsten Start.** Genau das ist passiert: ein
 * anderer Agent hatte
 *
 * ```yaml
 * - id: ui-settings-general
 *   name: "@deepseek-ai/dsh-client-ui-settings-general"
 *   config:
 *     welcomeNoticeVersion: 2026-09-28.1
 * ```
 *
 * zwischen die Marken geschrieben, um den Begrüßungshinweis der Oberfläche für
 * diese Fassung als gesehen zu markieren. Der nächste Start hat den Eintrag
 * **gelöscht** — und niemand hätte es bemerkt, außer am Wiederauftauchen eines
 * Hinweises.
 *
 * **Warum er hier steht und nicht wieder von Hand hinein.** Solange er innerhalb
 * der Marken liegt, ist er unser — also muß er **aus dem Erzeuger** kommen.
 * Alles andere wäre eine Handänderung, die der nächste Start wieder wegnimmt.
 *
 * **Was daraus als Regel folgt:** wer in dieser Datei etwas eintragen will, trägt
 * es **hier** ein, nicht in die erzeugte Profildatei. Der Bereich gehört dem
 * Erzeuger.
 */
/**
 * Die MCP-Zeilen — sie sind **eigene Zeilen im `insert`-Block**, keine
 * Änderungen an bestehenden Einträgen. Deshalb stehen sie als eigene Liste hier
 * und nicht in {@link BLEIBENDE_EINTRAEGE}, das auch oberste Einträge trägt.
 */
export const MCP_EINTRAEGE = [
  // **Browser-Use als MCP-Server — vorbereitet, aber ABGESCHALTET.**
  //
  // Was gemessen funktioniert: der Server antwortet auf `initialize` und
  // `tools/list` mit **16 Werkzeugen** (`browser_navigate`, `browser_click`,
  // `browser_get_state`, `browser_screenshot`, …) — **ohne** `OPENAI_API_KEY`,
  // weil die direkte Steuerung kein Modell aufruft.
  //
  // Was gemessen **nicht** funktioniert: jeder Browser-Aufruf endet mit
  // `-32000 Connection closed`. Ursache ist der Start des Browsers, nicht das
  // Werkzeug: browser-use startet Chromium mit 60 Argumenten, und der Prozess
  // beendet sich nach **0,2 s**, bevor CDP antwortet. Dieselbe Argumentliste von
  // Hand gestartet läuft — es ist also nicht Chrome, sondern die Umgebung, die
  // browser-use dem Kind mitgibt. `BU_CDP_URL` hilft hier **nicht**: das wird nur
  // vom CLI-Pfad (`browser-harness`) gelesen, nicht vom MCP-Server.
  //
  // Solange das so ist, wäre ein Eintrag mit 16 toten Werkzeugen schlechter als
  // keiner. Der funktionierende Weg steht in `scripts/browser-local.mjs` und in
  // der Fähigkeit `browser-local` (CDP-Attach an ein selbst gestartetes Chromium).
  // Zum Wiedereinschalten: `disabled` entfernen, sobald ein Aufruf
  // `browser_navigate` nicht mehr mit „Connection closed" antwortet.
  '  - id: browser-use',
  "    name: '@deepseek-ai/dsh-mcp-client'",
  '    disabled: true',
  '    config:',
  '      serverName: browser-use',
  '      transport: stdio',
  "      command: !!js (process.env.LOCALAPPDATA + '/hermes/bin/uvx.exe')",
  "      args: ['--from', 'browser-use[cli]', 'browser-use', '--mcp']",
  '      env:',
  "        UV_CACHE_DIR: !!js (process.cwd() + '/.pmh-build/uv-cache')",
  '        UV_LINK_MODE: copy',
  "        BH_HOME: !!js (process.cwd() + '/.pmh-build/browser-harness')",
  "        BROWSER_USE_CONFIG_DIR: !!js (process.cwd() + '/.pmh-build/browseruse')",
  '        BROWSER_USE_HEADLESS: false',
  '      cwd: !!js process.cwd()',
  '      toolCallTimeoutMs: 120000',
  '      failOnStartupError: false',
  // **`pmh-research` als MCP-Server — der Aufrufer, der bisher fehlte.**
  //
  // Befund vor diesem Eintrag: `grep` über `packages/`, `apps/`, `scripts/`
  // fand **null** Verweise auf `pmh/research`, `research_fetch` oder Port 4114 —
  // der Dienst war gebaut, getestet und von niemandem erreichbar. Ein Dienst,
  // den der Host je Sitzung startet, ist billiger als ein Dauerprozess auf 4114:
  // kein Port, kein Supervisor, kein Eintrag in `start.mjs`.
  //
  // Gemessen am 21.10.2026 über stdio: `initialize` → `tools/list`
  // (`research_search`, `research_fetch`) → `research_fetch https://example.com`
  // liefert den Text **vom Renderer** (kein Firecrawl-Schlüssel gesetzt, also
  // firecrawl → renderer → browser).
  //
  // **Das Binary ist ein Bauartefakt** (`bun run start` baut es). Fehlt es,
  // bleiben die zwei Werkzeuge weg und der Host startet trotzdem — dafür steht
  // `failOnStartupError: false`.
  //
  // `PMH_RESEARCH_PRIVAT` ist **absichtlich nicht gesetzt**: der Zielschutz
  // gegen Loopback und 169.254 bleibt an. Für localhost-Recherche muss man ihn
  // bewusst auf `1` setzen — eine Entscheidung, kein Vorgabewert.
  '  - id: pmh-research',
  "    name: '@deepseek-ai/dsh-mcp-client'",
  '    config:',
  '      serverName: research',
  '      transport: stdio',
  "      command: !!js (process.cwd() + '/.pmh-build/bin/pmh-research.exe')",
  "      args: ['mcp']",
  '      env:',
  '        PMH_SEARXNG_URL: http://127.0.0.1:8081',
  '        PMH_BROWSER_RENDER_URL: http://127.0.0.1:9335',
  '      cwd: !!js process.cwd()',
  '      toolCallTimeoutMs: 120000',
  '      failOnStartupError: false',
]

/**
 * Einträge, die **keine** MCP-Zeilen sind: Änderungen an bestehenden Zeilen des
 * Kerns oder bleibende Einstellungen der Oberfläche.
 */
export const BLEIBENDE_EINTRAEGE = [
  ...MCP_EINTRAEGE,
  // **`ui-settings-general` steht ZULETZT — das ist YAML, keine Ordnungsliebe.**
  // Die Zeile ist eine Änderung auf oberster Ebene. Käme danach noch eine
  // eingerückte `- id:`-Zeile, läse der Parser sie als Fortsetzung des
  // `insert`-Blocks über `welcomeNoticeVersion` und bricht ab
  // („A block sequence may not be used as an implicit map key", gemessen).
  '- id: ui-settings-general',
  '  name: "@deepseek-ai/dsh-client-ui-settings-general"',
  '  config:',
  '    welcomeNoticeVersion: 2026-09-28.1',
]

/**
 * Die zwei Subagenten-Adapter, die **bewußt abgeschaltet** werden.
 *
 * ## Der Befund
 *
 * Der Host meldet bei jedem Start:
 *
 * ```
 * [host] pmh: warning: 2 entries did not activate
 * [host] subagent-claude-code (@deepseek-ai/dsh-subagent-claude-code): failed to import
 * [host] subagent-codex        (@deepseek-ai/dsh-subagent-codex): failed to import
 * ```
 *
 * **Gemessen:** beide Pakete liegen in **keinem** Baum (weder im Ziel noch in
 * `harness\prometheus-harness` noch in `harness\deepseek-harness`) und stehen
 * **nicht** in unserem `package.json`. Deklariert sind sie in
 * `@deepseek-ai/dsh-app-boot` als
 *
 * ```js
 * const ON_DEMAND_BUNDLES = ["@deepseek-ai/dsh-subagent-claude-code",
 *                            "@deepseek-ai/dsh-subagent-codex"];
 * ```
 *
 * ## Warum abschalten und nicht nachinstallieren
 *
 * **Beide gibt es im Register** — aber in der Fassung **`0.0.1-rc.1`**, während der
 * Kern auf **`0.2.1-alpha.2`** läuft. Ein **älterer** Adapter gegen einen
 * **neueren** Kern ist ein Vertragsrisiko, das niemand geprüft hat — und der
 * Betreiber nutzt weder die Claude-Code- noch die Codex-CLI.
 *
 * **Sie blockieren nichts.** Belegt: mit genau diesen zwei Fehlschlägen liefen
 * `session/create`, `session/prompt` und ein vollständiger Turn bis
 * `turn/end {"kind":"completed"}` durch, und **alle fünf Werkzeuge** waren grün
 * (`docs/status/werkzeug-nachweis.md`). Es sind **`ON_DEMAND_BUNDLES`** — der Kern
 * sieht sie ausdrücklich als **auf Anfrage**, nicht als Grundausstattung.
 *
 * ## Was das kostet, ehrlich benannt
 *
 * **Zwei Subagenten-Arten stehen nicht zur Verfügung:** der Claude-Code- und der
 * Codex-Adapter. Wer sie braucht, muß sie **ausdrücklich** installieren und diese
 * Abschaltung zurücknehmen — dann aber gegen die **Fassungsfrage** prüfen, nicht
 * gegen die Annahme „wird schon passen".
 *
 * **Warum die Abschaltung im Erzeuger steht und nicht von Hand in der Profildatei.**
 * Der Bereich gehört dem Erzeuger; eine Handänderung darin verschwindet beim
 * nächsten Start. Genau das ist schon einmal passiert (`ui-settings-general`).
 */
export const SUBIAGENTEN_ABSCHALTUNG = [
  '- id: subagent-claude-code',
  '  disabled: true',
  '- id: subagent-codex',
  '  disabled: true',
]

/**
 * Die Einträge der Bundle-Schicht, die das PTC-Zwischenstück ausmachen.
 *
 * **Sie werden NICHT mehr abgeschaltet — und warum das die bessere Lösung ist.**
 *
 * Der erste Versuch war, `ptc-runtime`, `workflow-ptc` und `tool-workflow` hier
 * abzuschalten, weil `ptc-runtime` unter Bun nicht ladbar war. Das war eine
 * **Umgehung**: sie kostete PTC dauerhaft, und die Voreinstellung `standard` setzt
 * die beiden letzteren ohnehin **je Sitzung** selbst zusammen
 * (`dsh-web-app/presets/standard.patch.yml`) — die Profil-Abschaltung hätte dafür
 * womöglich gar nicht gereicht.
 *
 * **Die eigentliche Ursache ist jetzt behoben:** `scripts/ptc-type-stripping.mjs`
 * ergänzt `stripTypeScriptTypes` für Laufzeiten, die es nicht mitbringen. Damit
 * **lädt** `ptc-runtime` unter Bun, und **nichts** muß abgeschaltet werden.
 *
 * **Warum diese Liste trotzdem stehenbleibt.** Sie benennt die drei Einträge, die
 * zusammengehören: fällt der erste, warten die beiden anderen. Wer sie sucht, soll
 * den Zusammenhang finden — und den Hinweis, wo die Ursache behandelt wird.
 */
export const PTC_EINTRAEGE = ['ptc-runtime', 'workflow-ptc', 'tool-workflow']

/**
 * Leitet die Eintrags-`id` aus einem Paketnamen ab.
 *
 * `@prometheus-harness/health` → `pmh-health`.
 *
 * **Warum nicht einfach der Paketname ohne Bereich** (`health`). Die id steht in
 * der Entry-Prüfung des Hosts und in jeder Warnung. Ein nacktes `health` wäre
 * zwischen hunderten fremder Zeilen nicht als unseres erkennbar. Das Präfix `pmh-`
 * macht es zuordenbar — und `dsh-web-app` macht es genauso (`web-runtime`,
 * `web-startup`).
 *
 * @param paket - der Paketname
 * @returns die id
 */
export function idAus(paket) {
  const ohneBereich = paket.replace(/^@[^/]+\//u, '')
  return `pmh-${ohneBereich.replace(/[^A-Za-z0-9-]/gu, '-')}`
}

/**
 * Der Paketname eines Eintrags aus {@link EIGENE_PAKETE}.
 *
 * Ein Eintrag ist entweder ein Name (dann gilt die Vorgabe `inject: [webServer]`)
 * oder ein Gegenstand mit eigenem `inject`. Beides muß überall gleich gelesen
 * werden — hier steht die eine Stelle dafür.
 *
 * @param {string | { paket: string, inject?: readonly string[] }} eintrag - der Eintrag
 * @returns {string} der Paketname
 */
export function paketName(eintrag) {
  return typeof eintrag === 'string' ? eintrag : eintrag.paket
}

/**
 * Die Dienste, auf die der Loader warten soll.
 *
 * **Warum das je Paket und nicht für alle gleich ist.** Die Vorgabe
 * `[webServer]` gilt für die Plugins, die eine Route eintragen. Ein Plugin, das
 * einen **Dienst** austauscht (das Terminal-Backend braucht `subprocess`), wartet
 * auf etwas anderes — und ein falsches `inject` ist nicht harmlos: der Loader
 * hängt dann zu früh ein, das Plugin sieht keinen Dienst und tut still gar
 * nichts. Genau diese stille Abweichung soll hier unmöglich sein.
 *
 * @param {string | { paket: string, inject?: readonly string[] }} eintrag - der Eintrag
 * @param {readonly string[]} vorgabe - was ohne eigene Angabe gilt
 * @returns {readonly string[]} die Kennungen der Dienste
 */
export function paketInject(eintrag, vorgabe = ['webServer']) {
  return typeof eintrag === 'string' ? vorgabe : (eintrag.inject ?? vorgabe)
}

/**
 * Die Zeilen, die dem Terminal-Controller seine Shells vorgeben.
 *
 * ## Warum das überhaupt nötig ist
 *
 * Der Kern bietet ohne Vorgabe `zsh, bash, fish, pwsh, powershell, cmd` an —
 * **auf jeder Plattform**. Auf Linux erscheinen damit `powershell` und `cmd` in
 * der Auswahl, auf Windows fehlt eine klare WSL-Shell, und `bash` löst dort auf
 * `C:\WINDOWS\system32\bash.exe` auf: den alten WSL-Starter, nicht Git-Bash.
 *
 * Weisung des Betreibers (18.10.2026): „der bash würde ich mit WSL2 verbinden
 * oder so falls Prometheus im windows umgebung gestartet ist und wenn linux dann
 * sollte powershell cmd überhaupt gar nicht anzeigen".
 *
 * ## Die Regel, die daraus folgt
 *
 * | Plattform | Vorgabe (erster Eintrag) | weitere Kandidaten |
 * |---|---|---|
 * | Windows **mit** WSL2 | `bash (WSL)` — `wsl.exe -e bash -l` | `powershell`, `cmd`, Git-Bash |
 * | Windows **ohne** WSL | die Vorgabe des Kerns (`cmd.exe`) | `powershell`, `cmd`, Git-Bash |
 * | Linux/macOS | die Vorgabe des Kerns (`$SHELL`) | `zsh`, `bash`, `fish` |
 *
 * **Warum Git-Bash als Pfad und nicht als Name.** `bash` steht auf Windows für
 * `system32\bash.exe` (WSL). Git-Bash liegt nicht im `PATH`, und der Controller
 * löst Kandidaten über den `PATH` auf — ein absoluter Pfad ist dort ausdrücklich
 * zugelassen und ist der einzige Weg, beide Shells anzubieten.
 *
 * @param {{ plattform?: string, wslBereit?: boolean, gitBash?: string | undefined }} [umgebung] -
 *   Plattform und was vorhanden ist
 * @returns {string[]} die YAML-Zeilen des Eintrags
 */
export function terminalZeilen(umgebung = {}) {
  const plattform = umgebung.plattform ?? process.platform
  if (plattform !== 'win32') {
    // **Kein `powershell`, kein `cmd` außerhalb von Windows.** Sie sind dort
    // nicht vorhanden; als Kandidat wären sie nur eine Zeile, die nie trifft.
    return ['- id: terminal-controller', '  config:', '    shellCandidates: [zsh, bash, fish]']
  }
  const kandidaten = ['powershell', 'cmd']
  const gitBash = umgebung.gitBash
  if (typeof gitBash === 'string' && gitBash.length > 0) kandidaten.push(`'${gitBash}'`)
  const zeilen = ['- id: terminal-controller', '  config:']
  if (umgebung.wslBereit === true) {
    // Ein vollständiges Shell-Profil: nur so kommt der Name „bash (WSL)" in die
    // Auswahl und nur so bekommt `wsl.exe` seine Argumente (der Kern leitet sie
    // aus dem Dateinamen ab — `wsl.exe` bekäme dort `-i`, was nichts tut).
    zeilen.push('    shell:')
    zeilen.push("      path: 'wsl.exe'")
    zeilen.push("      name: 'bash (WSL)'")
    zeilen.push("      args: ['-e', 'bash', '-l']")
  }
  zeilen.push(`    shellCandidates: [${kandidaten.join(', ')}]`)
  return zeilen
}

/**
 * Sucht Git-Bash an den üblichen Orten.
 *
 * @param {(pfad: string) => boolean} [existiert] - Dateiprüfung, austauschbar für Prüfungen
 * @returns der Pfad oder `undefined`
 */
export function findeGitBash(existiert = existsSync) {
  const kandidaten = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ]
  return kandidaten.find((pfad) => existiert(pfad))
}

/**
 * Erkennt aus der Ausgabe von `wsl -l -v`, ob eine benutzbare WSL2-Distribution da ist.
 *
 * ## Warum die Distributionsliste und **nicht** `wsl --version`
 *
 * Der erste Anlauf benutzte `wslLage` (aus `install-parts.mjs`) auf der Ausgabe
 * von `wsl.exe --version`. **Gemessen am 18.10.2026 auf der Zielmaschine:**
 * `--version` schreibt dort
 *
 * ```
 * WSL-Version: 2.6.3.0
 * Kernelversion: 6.6.87.2-1
 * …
 * ```
 *
 * — die Zeilen `Standarddistribution:` und `Standardversion:`, die `wslLage`
 * erwartet, stehen **nur** in `wsl --status`. Ergebnis: `wslLage.bereit === false`
 * auf einem Rechner mit installiertem WSL2 und drei Distributionen. Die
 * WSL-Bash wäre also gar nicht angeboten worden — ein Ausfall, den niemand als
 * Ausfall erkannt hätte.
 *
 * `wsl -l -v` dagegen nennt die Distributionen mit ihrer Fassung, und zwar in
 * jeder Fassung und Sprache gleich aufgebaut:
 *
 * ```
 *   NAME              STATE           VERSION
 * * Ubuntu            Stopped         2
 * ```
 *
 * ## Die zwei Fallen, die hier behandelt werden
 *
 * * **UTF-16.** `wsl.exe` schreibt Nullbytes zwischen die Zeichen; ohne Entfernen
 *   findet kein Muster etwas (dieselbe Falle wie in `wslLage`).
 * * **Docker-Distributionen.** `docker-desktop` und `docker-desktop-data` sind
 *   technische Distributionen ohne Shell. Sie zählen **nicht** — sonst böten wir
 *   eine WSL-Bash an, die beim ersten Befehl scheitert, sobald Docker Desktop der
 *   einzige WSL-Inhalt ist.
 *
 * @param {string} listentext - die Ausgabe von `wsl -l -v` (darf UTF-16 sein)
 * @returns {boolean} ob mindestens eine echte WSL2-Distribution vorhanden ist
 */
export function hatWsl2Distribution(listentext) {
  const sauber = String(listentext ?? '').replace(/\u0000/gu, '')
  return sauber.split(/\r?\n/u).some((zeile) => {
    // **Drei Spalten, nicht nur „endet auf 2".** Der erste Anlauf prüfte bloß
    // `/\\s[12]$/` — damit galt auch `Standardversion: 2` als Distribution
    // (gefunden von der eigenen Prüfung, nicht im Betrieb). Eine echte Zeile hat
    // Name, Zustand und Fassung, jeweils durch Spaltenabstand getrennt.
    if (!/^\s*\*?\s*\S+\s{2,}\S+\s{2,}[12]\s*$/u.test(zeile)) return false
    // `docker-desktop` hat keine Shell. Eine WSL-Bash dorthin wäre ein Terminal,
    // das beim ersten Befehl scheitert.
    return !/docker-desktop/iu.test(zeile)
  })
}

/**
 * Fragt `wsl.exe`, ob WSL2 mit einer benutzbaren Distribution eingerichtet ist.
 *
 * **Warum mit Frist.** `wsl.exe` kann auf einem halb eingerichteten System
 * hängen. Ein Startskript, das auf die WSL wartet, startet den Host nicht.
 *
 * @param {(argumente: string[]) => string} [ausfuehren] - Kommandoausführung, austauschbar
 * @returns ob eine WSL2-Shell angeboten werden kann
 */
export function wslBereit(ausfuehren = standardWslAufruf) {
  try {
    return hatWsl2Distribution(ausfuehren(['-l', '-v']))
  } catch {
    // Kein `wsl.exe`, ein Abbruch durch die Frist oder eine unlesbare Ausgabe:
    // in jedem Fall gibt es keine WSL-Shell anzubieten.
    return false
  }
}

/** Ruft `wsl.exe` auf und liefert seine Ausgabe als Text (UTF-16-Reste bleiben stehen). */
function standardWslAufruf(argumente) {
  const lauf = Bun.spawnSync({
    cmd: ['wsl.exe', ...argumente],
    stdout: 'pipe',
    stderr: 'ignore',
    timeout: 5_000,
  })
  return new TextDecoder().decode(lauf.stdout ?? new Uint8Array())
}

/**
 * Stellt fest, was das Terminal auf dieser Maschine anbieten kann.
 *
 * @param {string} [plattform] - die Plattform (austauschbar für Prüfungen)
 * @returns die Angaben für {@link terminalZeilen}
 */
export function terminalUmgebung(plattform = process.platform) {
  if (plattform !== 'win32') return { plattform, wslBereit: false, gitBash: undefined }
  return { plattform, wslBereit: wslBereit(), gitBash: findeGitBash() }
}

/**
 * **Fremde Zeilen aus dem eigenen Bereich retten.**
 *
 * ## Der Fehler, der diese Funktion erzwungen hat (gemessen am 16.10.2026)
 *
 * Der Kommentar in `start.mjs` behauptete: „ein eigener markierter Bereich, **fremde Einträge bleiben
 * unangetastet**". Das war **falsch**, und der Schaden ist reproduzierbar.
 *
 * Der Einstellungseditor des Harness schreibt seine Zeilen — etwa `- id: ui-theme` mit `fontSize: 15` —
 * ans **Ende des YAML-Inhalts**, und dort stand unsere Endmarke `# <<< pmh: eigene Einträge` als letzte
 * Zeile. Gemessen im Browser: nach einer Schriftgrößenänderung im Chat lag die `ui-theme`-Zeile
 * **zwischen** unseren Einträgen und der Endmarke, also **innerhalb** unseres Bereichs. Beim nächsten
 * Start entfernte `mitBereich` den ganzen Bereich — und mit ihm die Einstellung des Nutzers.
 *
 * Nachgerechnet: `mitBereich` lieferte für `id: ui-theme` danach **`false`** (nicht mehr enthalten), die
 * Datei schrumpfte von 1581 auf 1423 Zeichen. **Jede im Chat geänderte Einstellung war beim nächsten
 * Start weg** — und niemand hätte es bemerkt, außer am Verschwinden einer Wahl.
 *
 * ## Was jetzt gilt
 *
 * Unser Bereich beansprucht nur noch **seine eigenen Zeilen**. Alles andere innerhalb der Marken wird
 * beim Ersetzen **gerettet** und hinter unseren Block geschrieben.
 *
 * **Warum ein Zeilenvergleich und keine Suche nach der letzten eigenen Zeile.** Beim zweiten Lauf stehen
 * die geretteten Fremdzeilen **hinter** unseren; eine Regel „alles nach unserer letzten Zeile ist fremd"
 * wäre beim dritten Lauf falsch. Der Vergleich je Zeile ist idempotent: was nicht von uns ist, bleibt.
 *
 * @param text - der bisherige Inhalt der Patch-Datei
 * @param unsere - die Zeilen, die dieser Erzeuger schreibt
 * @returns der Inhalt ohne unseren Bereich und die geretteten fremden Zeilen
 */
function fremdesRetten(text, unsere) {
  const anfang = text.indexOf(MARKE_ANFANG)
  if (anfang < 0) return { rest: text, fremd: [] }
  const ende = text.indexOf(MARKE_ENDE, anfang)
  // Ein Anfang ohne Ende ist ein halb geschriebener Bereich: alles ab dem Anfang gehört uns.
  const bisEnde = ende < 0 ? text.length : ende + MARKE_ENDE.length

  /*
   * **Wie ein fremder Eintrag erkannt wird — und warum nicht über die Zeile.**
   *
   * Der erste Anlauf dieser Rettung verglich **Zeilen**: was der Erzeuger nicht schreibt, ist fremd.
   * Zwei Wächter haben ihn widerlegt (`scripts/tests/profile-patch.test.mjs`):
   *
   *   * **Geänderte eigene Zeilen** wurden zu Fremden: wechselt ein Paket (`@a/alt` → `@a/neu`), steht
   *     die alte Zeile nicht mehr in der Liste des Erzeugers — und wäre damit **gerettet** worden.
   *     Der Bereich hätte sich bei jeder Änderung **verdoppelt**.
   *   * Ein halb geschriebener Bereich (`insert:` ohne Marke am Ende) hätte seine Zeilen behalten.
   *
   * **Jetzt wird ein Eintrag gebildet, nicht eine Zeile verglichen.** Ein Eintrag der Patch-Schicht
   * beginnt mit `- ` in **Spalte 0**; alles Folgende gehört dazu. Dann gilt:
   *
   *   * Der `- insert:`-Block ist **unser** — die Untereinträge darin sind eingezogen, ihre Kennungen
   *     hängen an der Paketliste und ändern sich mit ihr.
   *   * Ein Eintrag mit einer **unserer festen Kennungen** ist unser (`BLEIBENDE_EINTRAEGE`,
   *     `SUBIAGENTEN_ABSCHALTUNG` — sie stehen in jedem Lauf gleich da).
   *   * Ein Eintrag **ohne** `id` in Spalte 0 kann kein fremder Patch-Eintrag sein (der Loader braucht
   *     Kennungen): er liegt in unserem Bereich und gehört uns.
   *   * Alles andere — jeder fremde Eintrag mit Kennung, wie ihn der Einstellungseditor des Harness
   *     schreibt (`- id: ui-theme` mit `config:`) — wird **gerettet**.
   */
  const stabileIds = new Set()
  for (const zeile of unsere) {
    const treffer = /^- id:\s*(\S+)\s*$/u.exec(zeile)
    if (treffer?.[1] !== undefined) stabileIds.add(treffer[1])
  }

  const fremd = []
  let eintrag = null
  const abschliessen = () => {
    if (eintrag === null) return
    const kopf = eintrag[0] ?? ''
    const istInsert = /^- insert:/u.test(kopf)
    const id = /^- id:\s*(\S+)/u.exec(kopf)?.[1]
    const unser = istInsert || id === undefined || stabileIds.has(id)
    if (!unser) fremd.push(...eintrag)
    eintrag = null
  }
  for (const zeile of text.slice(anfang, bisEnde).split(/\r?\n/u)) {
    if (zeile === MARKE_ANFANG || zeile === MARKE_ENDE) continue
    if (/^- /u.test(zeile)) {
      abschliessen()
      eintrag = [zeile]
      continue
    }
    if (eintrag === null) eintrag = [zeile]
    else eintrag.push(zeile)
  }
  abschliessen()

  // Die Zeilenenden mitnehmen, damit keine Leerzeile zurückbleibt.
  let nach = bisEnde
  if (text.startsWith('\r\n', nach)) nach += 2
  else if (text.startsWith('\n', nach)) nach += 1
  return {
    rest: text.slice(0, anfang) + text.slice(nach),
    // Leerzeilen sind keine Einträge — sie mitzuschleppen ließe die Datei bei jedem Start wachsen.
    fremd: fremd.filter((zeile) => zeile.trim() !== ''),
  }
}

/**
 * Setzt den eigenen Bereich in den Inhalt einer Patch-Datei.
 *
 * **Reine Funktion, damit sie prüfbar ist.** Sie kennt kein Dateisystem: aus
 * Eingabe wird Ausgabe. Die Regeln — einmalig, stabil, nichts außerhalb anfassen,
 * **fremde Zeilen im eigenen Bereich retten** — lassen sich damit ohne Datei prüfen.
 *
 * Ablauf: erst die fremden Zeilen aus dem alten Bereich retten ({@link fremdesRetten}),
 * dann den `[]`-Platzhalter der Vorlage durch unsere Zeilen **ersetzen**, sonst
 * anhängen. Die geretteten Fremdzeilen stehen **hinter** unserem Block — als
 * eigene Einträge der Patch-Schicht, angewandt nach unseren.
 *
 * @param vorher - der bisherige Inhalt (darf leer sein)
 * @param zeilen - die Bereichszeilen
 * @returns der neue Inhalt
 */
export function mitBereich(vorher, zeilen) {
  const { rest, fremd } = fremdesRetten(vorher, zeilen)
  const block = [...zeilen, ...fremd].join('\n')
  const gemischt = rest.split(/\r?\n/u)
  const platzhalter = gemischt.findIndex((z) => LEERE_LISTE.test(z))
  if (platzhalter >= 0) {
    // **Ersetzen, nicht ergänzen.** `[]` ist die leere Liste; Zeilen dahinter
    // wären kein YAML mehr.
    gemischt[platzhalter] = block
  } else {
    // Kein Platzhalter: die Datei hat schon Inhalt (oder ist leer). Dann ist
    // Anhängen richtig — der Inhalt ist entweder eine Liste oder besteht nur aus
    // Kommentaren, und `insert` ergänzt sie.
    const text = gemischt.join('\n')
    const trenner = text.length === 0 || text.endsWith('\n') ? '' : '\n'
    return `${text}${trenner}${block}\n`
  }
  return gemischt.join('\n')
}

/**
 * Schreibt den Bereich in die Patch-Datei des Profils.
 *
 * @param patchPfad - Pfad der `cordis.patch.yml` des Profils
 * @param packages - Paketnamen, die eingehängt werden sollen
 * @returns was geschehen ist, für die Ausgabe
 */
export function verdrahte(patchPfad, packages, umgebung = undefined) {
  const ordner = dirname(patchPfad)
  if (!existsSync(ordner)) mkdirSync(ordner, { recursive: true })
  const vorher = existsSync(patchPfad) ? readFileSync(patchPfad, 'utf8') : ''
  const nachher = mitBereich(vorher, bereichsZeilen(packages, umgebung))
  if (nachher === vorher) return { geaendert: false, pfad: patchPfad }
  writeFileSync(patchPfad, nachher, 'utf8')
  return { geaendert: true, pfad: patchPfad }
}

/**
 * Der Ort der Patch-Datei für ein Harness-Home und ein Profil.
 *
 * @param home - das Harness-Home
 * @param profil - der Profilname
 * @returns der Pfad der Patch-Datei
 */
export function patchPfad(home, profil) {
  return join(home, 'profiles', profil, 'cordis.patch.yml')
}

/**
 * Die Pakete, die dieses Projekt in den Host einträgt.
 *
 * **Warum als benannte Liste und nicht als verstreute Zeichenketten.** Diese
 * Liste ist die eine Wahrheit darüber, was von uns im Host läuft. Kommt ein Paket
 * dazu, steht es hier — und die Ausgabe des Starters nennt es.
 *
 * **Die Reihenfolge ist bindend.** `readiness` trägt seine Sonden in das Register
 * von `health` ein und fordert es über `inject: ['readyness']`. Der Loader wartet
 * selbst, bis der Dienst da ist — die Reihenfolge hier ist deshalb nicht
 * kritisch, aber sie ist lesbar: erst der Endpunkt, dann was er prüft.
 *
 * **`auth-http` steht seit dem 13.10.2026 hier** — es ist das erste Paket, das
 * nicht nur liest, sondern **schreibt**: es hängt vier Wege unter
 * `/api/pmh/auth` ein und legt Benutzer und Sitzungen in PostgreSQL an. Es
 * braucht `DATABASE_URL`; fehlt die Angabe, meldet es das und hängt sich
 * **nicht** ein, statt den Host scheitern zu lassen. Danach steht es im
 * Protokoll des Hosts, nicht in einem 404.
 */
export const EIGENE_PAKETE = [
  '@prometheus-harness/health',
  '@prometheus-harness/readiness',
  '@prometheus-harness/auth-http',
  // **`@prometheus-harness/accounts` steht hier BEWUSST NICHT.**
  //
  // Es ist seit dem 21.10.2026 ein **Bündel** (`dsh.bundle.patch` →
  // `cordis.patch.yml`) und wird über `dsh.profile.bundles` geladen — so, wie
  // Obsidian, Graphify und Usage es auch tun. Damit ist es im Plugin-Fenster
  // einzeln abschaltbar.
  //
  // **Beides zugleich geht nicht.** Der Kern wirft bei doppelter Kennung
  // (`(kind, path)`), und der Host startet dann nicht. Wer die Zeile wieder
  // aufnimmt, muß das Bündel abschalten — und umgekehrt.
  // **Das Sprachpaket Deutsch — die erste CLIENT-Zeile dieser Liste.**
  //
  // Es ist kein Host-Plugin: die Arbeit tut seine Browser-Hälfte
  // (`packages/client/locale/lib/client.js`). Die Zeile steht trotzdem hier, weil die
  // Modul-Hälfte des Kerns die Startliste des Browsers aus den **aktivierten
  // Ladeprogramm-Zeilen** baut — wörtlich im Patch des Web-Bündels
  // (`@deepseek-ai/dsh-web-app/cordis.patch.yml`):
  //
  // > *„`dsh.client` rows are the browser roster the modules node half scans into
  // > `window.__DSH_BOOT__`; the modules row is simultaneously a host row."*
  //
  // Ohne diese Zeile gibt es keine Browser-Hälfte; mit ihr erscheint das Paket in der
  // Startliste und die Sprache `de` wird anmeldbar. Die Reihenfolge gegen
  // `@deepseek-ai/dsh-client-locale` (unser `dsh.client.inject`) ordnet der Kern selbst.
  '@prometheus-harness/client-locale',
  // **Kontrast nativer Auswahlfenster.** Reine Oberflächen-Ergänzung: sie hängt eine
  // Stilregel ein, damit die Einträge eines aufgeklappten `<select>` Grund und Schriftfarbe
  // aus den Theme-Variablen bekommen. Anlaß war das Bild des Betreibers vom 14.10.2026:
  // „HF-Mirror (China mirror)" war weiß auf weiß, weil die CSS des Sprachpakets
  // `background: transparent; color: inherit` auf ein **natives** Bedienelement setzt.
  '@prometheus-harness/client-select-contrast',
  // **Sammlungen im `/`-Menü und als Popup.**
  //
  // Der Betreiber (27.10.2026): „können wir irgendwie beim "/" nutzen ein skill search nach
  // package machen zb "/emilkowalski" … siehe bild ist schon bad ux, wenn es viel wird" — und
  // zum Muster: „ich dachte sowas hier wie im bild von models search ähnlichkeit nur beim "/"",
  // dann: „kannst du das mit dem popup search machen implementieren wie beim models als
  // beispiel? weil verdammt viel skill ist ja nicht so geil zu suchen wenn man nur ungefähr
  // weiss was man sucht".
  //
  // Die eingebaute Quelle (`dsh-client-ui-skill`) rangiert nur über den **Namen**; die Sammlung
  // steht in keinem Feld, das sie liest. Diese Browser-Hälfte arbeitet zweigleisig:
  //
  // * eine zweite Quelle am `/`, die nur bei Sammlungstreffern antwortet (leer: die Sammlungen
  //   selbst, `drill` klappt auf; sonst deren Fähigkeiten mit `section`-Überschrift),
  // * der Befehl `/skills` als `popupSelect` — Suchfeld, Gruppen je Sammlung, Pick schreibt
  //   `/name` über `SessionInput.setDraft` in den Entwurf und holt den Fokus zurück.
  //
  // Das Bündel ist gebaut (`packages/client/skills-by-package/lib/client.js`), die Prüfung
  // führt es aus; die Zuordnung kommt aus `units/skills/index.json`, das
  // `units/skills/link-skills.ps1` beim Verknüpfen schreibt.
  '@prometheus-harness/client-skills-by-package',
  // **Zeichen für die Befehle, die der Kern nicht kennt.**
  //
  // Anlaß (Betreiber, 27.10.2026): Im `/`-Menü standen die vier eingebauten Befehle mit Zeichen da,
  // die der Plugins — `/bild`, `/image`, `/ui`, `/usage`, `/verbrauch` — als reine Textzeilen. Der
  // Betreiber: *„kannst du dazu ein passende svg icon nutzen machen?"*
  //
  // Der Kern malt für Host-Befehle **kein** Zeichen: die Palette erkennt einen Befehl an seiner
  // Herkunft (`definitionId`) und holt das Zeichen aus `HOST_FACES`. Ein Plugin-Befehl steht dort
  // nicht, und ein Client-Beitrag darf ihn nicht überdecken (Kollision wirft). Dieses Plugin stellt
  // deshalb den Dienst `pmhCommandGlyphs` bereit; die Frage danach ist die **Naht** in
  // `scripts/client-naht.mjs` — nach jedem `bun install` neu zu schneiden.
  //
  // Die Zeichnungen: ein Bild (`/bild`, `/image`), vier Karten (`/ui`) und die Messuhr des Kerns
  // (`/usage`, `/verbrauch`, Pfade aus den Primitives, im Bau gegen deren Bündel geprüft).
  '@prometheus-harness/client-command-glyphs',
  // **Der Umschalter zwischen Chat und Welt.**
  //
  // Der Betreiber (14.10.2026): „genau genommen moechte ich das man beim start den standard
  // Prometheus Chat sieht … und ueber web app sollte man den andere version wechseln koennen" — und
  // auf die Frage, wo der Weg sitzen soll: „die Marke selbst wird zum Schalter."
  //
  // Das Paket faengt den Klick auf die Marke oben links ab (Logo und Text, `sidebar.brand.*` des
  // Kerns) und oeffnet die Welt (`apps/universe`, Pfad aus `scripts/world-path.mjs`).
  // Es schreibt **kein** Element in den Baum und aendert **kein** Aussehen — nur zwei
  // Beschriftungen an der Marke.
  '@prometheus-harness/client-world-switch',
  // **Workspaces und Chat als zwei Ansichten mit eigener Adresse — jetzt als PFAD.**
  //
  // Der Betreiber wollte es „wie ChatGPT": jede Unterhaltung eine echte Adresse, damit
  // „In neuem Tab öffnen" eine Eigenschaft der Adresse ist und nicht ein Knopf, den jemand
  // gebaut hat. Der erste Versuch lag falsch: die Adresse war eine **Abfrage** (`?w`,
  // `?s=…`), weil der Wirt gemessen nur `/` ausliefert. Ergebnis: *„was ich da sehe ist eine
  // tonne: `http://127.0.0.1:3080/?w`"* und *„es kommt und verschwindet sich wieder"*.
  //
  // **Seit 28.10.2026 ist die Adresse ein Pfad** — auf beiden Seiten:
  //
  // * Der Wirt liefert die Hülle für `/c/<Sitzung>` und `/w` aus
  //   (`packages/api/auth-http/src/huelle.ts`: Prefix `/c`, exakt `/w`, Index durch
  //   `renderIndex`, Basis absolut, Sitzung nur über den Keks).
  // * Der Client liest `location.pathname` und schreibt dorthin zurück — **ein**
  //   Wiederhersteller, kein Nachfassen mehr (`packages/client/tabs/src/adresse.ts`).
  // * `?w`/`?s=…` bleiben als Alias: sie werden beim Start auf den Pfad umgeschrieben und
  //   dabei **ersetzt**, damit ein altes Lesezeichen keinen Verlaufseintrag erzeugt.
  //
  // Die Sitzungszeilen sind weiterhin Knöpfe des Kerns (`ui-workspace` verdrahtet sie); der
  // Rechtsklick dieses Pakets bietet dort „In neuem Tab öffnen" mit einem echten `<a href>`.
  // Echte Anker an jeder Zeile kommen mit der übernommenen Seitenleiste.
  "@prometheus-harness/client-tabs",
  // **Die Quellordner je Arbeitsbereich — der Dialog.**
  //
  // Der Betreiber (28.10.2026, mit Bildern aus Codex): *„ich würde gerne allgemein den workspaces
  // zugriff erweitern können zb mehr ordner path geben wie beim ChatGPT Codex"*.
  //
  // Gebaut war das meiste schon (Migration 0009/0010, `workspace_folders`, vier HTTP-Wege unter
  // `/api/pmh/ordner`, dieser Dialog) — aber **nicht angeschlossen**: die Zeile fehlte hier, und in
  // der Datenbank fehlte der Arbeitsbereich selbst (nichts legte `workspaces` an, also lief jeder
  // Ordner in einen Fremdschlüssel-Fehler 23503). Seit dieser Runde schließt
  // `POST /api/pmh/ordner/bereich` die Lücke (`stelleBereit` in `store-postgres`), und der Dialog
  // ruft ihn beim Öffnen — erst die Brücke, dann die Liste. Den Arbeitsplatz (den Pfad des
  // Arbeitsbereichs) legt dieselbe Funktion als ersten Ordner an, wenn es noch keinen gibt.
  '@prometheus-harness/client-source-folders',
  // **Video und Ton in der rechten Seitenleiste.**
  //
  // Der Betreiber (28.10.2026, mit Bild der Vorschau): *„kannst du das hier beheben? das man alle
  // formate richtig nutzen kann in dem rechte seite des tap?"* — die Vorschau zeigte für
  // `brag-output-2026-10-28-171440/brag.mp4` nur noch *„Für diesen Dateityp ist noch keine Vorschau
  // verfügbar."*
  //
  // Der Kern bringt Text, Markdown, Code, Bilder, PDF, HTML und Tabellen mit; Video und Ton stehen in
  // seiner Liste der **nicht darstellbaren** Binärformate (`unviewable.js`). Dieses Paket meldet einen
  // Renderer über `ctx.documentPreviews.register(...)` an und stellt den Körper unter
  // `sidebar.right.tab.document` — beides über die Schnittstelle, die der Kern dafür freigibt. Kein
  // Eingriff in `node_modules`, keine zweite Route: die Bytes kommen über den Leseweg, den der Kern
  // schon für PDF und Bilder benutzt.
  '@prometheus-harness/client-media-preview',
  // **Die Welt auf DEMSELBEN Port wie der Chat.**
  //
  // Der Betreiber (14.10.2026): „der ganze port ist mir bisschen zu piss 2 port offen zu haben ich
  // möchte es als ein port haben und im folder: apps/universe anstatt in snapshoot, dann alles in
  // einem port."
  //
  // Bis dahin hatte die Welt einen eigenen Vite-Server auf `5176` — zwei Adressen, zwei Herkünfte,
  // zwei Keks-Speicher, ein Umschalter, der eine fremde Adresse kennen und mitschicken musste.
  // Dieses Paket registriert eine Route am Webserver des Kerns und liefert die **gebaute** Welt
  // (`apps/universe/dist`) unter `/universe/` aus — derselbe Port, dieselbe Herkunft.
  '@prometheus-harness/world-static',
  // **`world-obsidian` steht hier BEWUSST NICHT.**
  //
  // Es war als Plugin eingetragen, als es noch eine eigene Route `GET /universe/api/notes` hatte, die
  // den Vault bei jeder Anfrage von der Platte las. Das war die zweite Wahrheit neben der Datenbank.
  // Seit dem 16.10.2026 ist die **Datenbank** die Wahrheit (`vaults`, `notes`, `tags`, `note_tags`,
  // `links` — Migration `0007`, angewendet), und das Paket ist, was es sein soll: ein **Leser** und ein
  // **Einleser** (Bibliothek, kein Plugin). Eine Zeile hier würde ein Plugin laden, das nichts einträgt.
  //
  // Die HTTP-Route kommt wieder — in `packages/api/auth-http/src/notizen.ts`, wo die Sitzung liegt
  // (`verifySession` → `userId`, wie `folders.ts`). Ohne diese Zuordnung gäbe es keinen Eigentümer, und
  // „jeder Benutzer hat seinen eigenen Vault" wäre nicht einzuhalten.
  // **Zwei lokale Spracherkenner für Deutsch und Englisch.**
  //
  // Anlaß (Betreiber, 14.10.2026): Das mitgelieferte Sprachbündel erkennt
  // Englisch und Asien (SenseVoice `zh-en-ja-ko-yue`) — **Deutsch fehlt**. Diese
  // beiden Anbieter hängen sich an **denselben** Dienst `ctx.speechToText` und
  // erscheinen damit im Auswahlfeld der Spracheingabe; der Kern verteilt nach
  // Namen, es wird nichts ersetzt.
  //
  // * `speech-whisper-local` — Whisper base int8, **Deutsch und Englisch**, kann
  //   die Sprache selbst erkennen (`auto`). Gemessen: 2,75 s Deutsch in 271 ms,
  //   6,63 s Englisch in 516 ms (CPU, 4 Fäden).
  // * `speech-nemo-de-local` — NVIDIA NeMo German fastconformer int8, **nur
  //   Deutsch**, dafür genauer bei Fachbegriffen und Namen. Gemessen: 2,75 s in
  //   50 ms — 55× Echtzeit.
  //
  // **Der Ablageort kommt aus `dshHomePath`**, nicht aus dem Paket: den Wohnort des
  // Harness kennt nur die Zusammensetzung. Die Gewichte liegen bereits dort
  // (`speech-to-text/whisper/models/whisper-onnx` und
  // `speech-to-text/nemo-de/models/nemo-onnx`), geprüft über Größe und SHA-256.
  '@prometheus-harness/speech-whisper-local',
  '@prometheus-harness/speech-nemo-de-local',
  // **Die KI-Fähigkeiten selbst — Endpunkte UND Werkzeuge.**
  //
  // Anlaß (Betreiber, 19.10.2026): *„ist schon ein plugin implementiert für bild generierung? …
  // TTS/STT? … ja implementieren als plugin"*. Bis dahin waren die Fähigkeiten **gebaut und
  // geprüft**, aber im Host **nicht angeschlossen** — `openrouter` konnte fünf Fähigkeiten, und
  // niemand konnte sie aufrufen.
  //
  // Was das Paket einträgt:
  //
  // | Fläche | Adresse |
  // |---|---|
  // | Auskunft | `GET /api/ai/capabilities` |
  // | Urteil | `POST /api/ai/decide` |
  // | Text zu Sprache | `POST /api/ai/speak` (PCM → WAV) |
  // | Sprache zu Text | `POST /api/ai/transcribe` |
  // | Einbetten | `POST /api/ai/embed` |
  // | Bild | `POST /api/ai/draw` (Bytes oder Base64) |
  //
  // Dazu fünf Agent-Werkzeuge: `image_generate`, `speech_speak`, `speech_transcribe`,
  // `text_embed`, `ai_decide`. Sie werden ueber `ctx.get('tools')` angemeldet — fehlt der Dienst,
  // bleiben die Endpunkte stehen (deshalb KEIN hartes `inject: ['tools']`).
  //
  // Der Schluessel kommt aus `ctx.credentials.resolve('OPENROUTER_API_KEY')`, ersatzweise aus der
  // Umgebung; er erscheint in keiner Antwort. Die Kette wird **je Anfrage** gebaut, damit eine
  // geaenderte Einstellungsdatei sofort wirkt.
  '@prometheus-harness/ai-capabilities',
  // **`/bild` — der Befehl für den Menschen, nicht für das Modell.**
  //
  // Anlaß (Betreiber, 21.10.2026): *„Der /bild-Befehl wäre relevanter tbh … damit man es richtig
  // mitgeben kann wie zb bild referenz ect format bild prompt"*.
  //
  // Der Befehl ruft **dieselbe** Kette wie das Werkzeug `image_generate` — keine zweite Wahrheit.
  // Was er zusätzlich kann: die gemessenen Felder der Bild-API setzen.
  //
  // ```text
  // /bild --stil icon ein Flammenlogo für Prometheus
  // /bild --format 16:9 --auflösung 2K ein Fuchs im Schnee, fotografisch
  // /bild --pfad assets/logo/neu.png --stil icon ein Dreieck
  // ```
  //
  // `inject: ['commands']` — ohne den Befehlsdienst gibt es nichts zu registrieren.
  '@prometheus-harness/command-bild',
  // **`/verbrauch` (de) bzw. `/usage` (en) — Verbrauch und Kostenschätzung.**
  //
  // Anlaß (Betreiber, 21.10.2026): *„Plugin … namens Usage, dort zeigt es an wie viel budget
  // nutzung ect … das würde ich zb hier auch nutzen das es als skill oder bzw der harness eine
  // kosten schätzung macht wie viel ein bild generierung kostet"*.
  //
  // Der Verbrauch ist **gemessen** (`GET /api/v1/key`); die Bildkosten sind eine **Schätzung** mit
  // genannter Grundlage. Die Sprache kommt aus den Einstellungen — daraus folgt der Befehlsname.
  '@prometheus-harness/usage-ansicht',
  // **Die bevorzugte Wahl je KI-Fähigkeit — erstmals also eine Liste, keine Einzelfrage.**
  //
  // Anlaß (Betreiber, 14.10.2026): „verwaltung checking updating Free API model tier auf
  // funktionalitaet und Verdrahtung als eine art liste Bevorzugt, ranking dazu?"
  //
  // Das Paket haengt **eine** geschuetzte Route ein: `GET /api/ai/ranking` (JSON,
  // `?faehigkeit=<name>` schraenkt ein, `?text=1` gibt die lesbare Form). Es rechnet
  // nichts selbst — es sammelt nur, was andere anmelden, und rechnet dann mit
  // `@prometheus-harness/ranking`.
  //
  // **Warum es hier stehen kann, obwohl die Quellen noch niemand anmeldet.** Dann ist die
  // Liste leer — und sagt **warum**: die Antwort nennt die Zahl der angemeldeten Familien,
  // Anbieter und Tarife, damit „es gibt nichts" von „niemand hat etwas angemeldet" zu
  // unterscheiden ist. Eine leere Liste mit Grund ist besser als ein 404.
  //
  // `inject: ['webServer']` — ohne den Webserver gaebe es nichts zu registrieren. Die
  // Pruefung der Anmeldung holt sich das Paket zur Laufzeit ueber `ctx.get('connection')`;
  // fehlt der Dienst, antwortet die Route **503** statt ungeschuetzt 200.
  //
  // **`@prometheus-harness/ai-ranking` stand hier bis zum 18.10.2026 — jetzt kommt es ueber das
  // Buendel `@prometheus-harness/ai-stack`**, das der Betreiber im Plugin-Fenster als lokales
  // Verzeichnis installiert hat (`dsh.profile.bundles` nennt es seitdem). Die Kennung
  // `pmh-ai-ranking` darf nur EINE Quelle haben: der Core wirft bei doppeltem `(kind, path)`, und
  // der Host startet dann nicht. Wer die Zeile wieder aufnimmt, muss das Buendel abschalten.
  //
  // **Das Terminal-Backend — und der erste Eintrag mit eigenem `inject`.**
  //
  // Befund des Betreibers (18.10.2026): „beim prometheus funktioniert diese terminal feature ect
  // gar nicht komplett nicht alles same issue; Prozess beendet (-1073741502)". Gemessen mit einer
  // eigenen Sonde auf derselben Maschine (`docs/protokoll/aufsicht/werkzeuge/pty-probe.mjs` hatte
  // es schon notiert, ohne daß ein Ersatz gebaut wurde):
  //
  // | Laufzeit | `cmd.exe` über `node-pty` |
  // |---|---|
  // | Node v24.19.0 | Exit **0**, Ausgabe kommt an |
  // | Bun 1.4.0 | **16 Bytes** ConPTY-Init, dann tot (`0xC0000142`) |
  //
  // Der Host läuft unter Bun (`scripts/start.mjs` startet ihn mit `bun.exe`), und
  // `@deepseek-ai/dsh-subprocess-local` startet jedes Terminal über `require("node-pty")`. Der
  // Terminal-Weg ist **nicht** eingezäunt — die Sandbox war nie die Ursache. Buns eigenes PTY
  // (`Bun.spawn({ terminal })`) ist auf derselben Maschine grün, auch für `wsl.exe -e bash`.
  //
  // Deshalb tauscht dieses Paket genau eine Methode des Subprozess-Dienstes
  // (`spawnTerminal`) und läßt `spawn` unangetastet. Es braucht dafür `subprocess` — daher
  // `inject` als Gegenstand statt der Vorgabe `[webServer]`.
  {
    paket: '@prometheus-harness/terminal-pty',
    inject: ['subprocess'],
  },
  // **`@prometheus-harness/crew` steht hier BEWUSST NICHT — die Crew ist seit dem 21.10.2026 ein
  // Bündel.** Sie ist damit im Plugin-Fenster einzeln abschaltbar, so wie Konten, Obsidian, Graphify
  // und Verbrauch.
  //
  // | Teil | Wo er liegt |
  // |---|---|
  // | Wege `/api/pmh/crew` | `packages/plugin/crew/src/server.ts` |
  // | Adapter am Kern-Seam, Werkzeuge, Buchung | dieselbe Datei über `crew-plugin` |
  // | Sidebar-Eintrag, Panel | `packages/plugin/crew/src/index.tsx` → `lib/client.js` |
  // | Ablage je Konto | PostgreSQL (`crew_definitionen`, `crew_einstellungen`), Datei als Rückfall |
  //
  // **Warum die Zeile nicht zurückkommen darf.** Ein Paket als Bündel **und** als Patch-Zeile ist
  // kein zweiter Weg: der Kern wirft bei doppelter Kennung `(kind, path)`, und der Adapter wirft
  // `DUPLICATE_ADAPTER`, wenn die Route `crew` zweimal belegt wird
  // (`dsh-llm/lib/index.js:1852-1858`). Wer den Datei-Weg ohne Plugin-Fenster will, nimmt **nur**
  // diesen Eintrag wieder auf (und schaltet das Bündel ab) — nicht beides.
  //
  // Die alte Zeile trug `@prometheus-harness/crew-plugin`; dieses Paket bleibt die **Bibliothek**
  // (Adapter, Werkzeuge, Buchung, Konfigurationsdatei) und wird jetzt vom Bündel aufgerufen.
  // **Der lebende Modellkatalog.**
  //
  // Anlaß (Betreiber, 26.10.2026): *„wo ist `recursive/flint-v1.0:free` im model suche?"* — das
  // Modell stand bei OpenRouter, aber `llm-pi-ai` führt je Route nur, was in seinem npm-Paket steht.
  // Dieses Plugin holt `GET /models` je Routing-Anbieter, hält die Antwort zehn Minuten und schreibt
  // die Vereinigung nach `llm-pi-ai.providers.<id>.models`.
  //
  // **Warum das `inject` hier stehen muß.** Es braucht drei Dienste: `webServer` für die Routen,
  // `settings` als Ziel des Schreibens und `llm` für die Liste, die die Route heute führt. Mit der
  // Vorgabe `[webServer]` allein hinge der Eintrag zu früh ein und täte still nichts — genau die
  // stille Abweichung, die `scripts/profile-patch.mjs` verhindern soll.
  {
    paket: '@prometheus-harness/model-catalog',
    inject: ['webServer', 'settings', 'llm'],
  },
]
