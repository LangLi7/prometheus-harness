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
export function bereichsZeilen(packages) {
  const zeilen = [MARKE_ANFANG, '- insert:']
  for (const paket of packages) {
    zeilen.push(`  - id: ${idAus(paket)}`)
    zeilen.push(`    name: '${paket}'`)
    zeilen.push(`    inject: [webServer]`)
  }
  for (const zeile of BLEIBENDE_EINTRAEGE) {
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
export const BLEIBENDE_EINTRAEGE = [
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
 * **Die eigentliche Ursache ist jetzt behoben:** `scripts/ptc-typentfernung.mjs`
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
 * Entfernt unseren Bereich aus einem Inhalt.
 *
 * @param text - der Inhalt
 * @returns der Inhalt ohne unseren Bereich
 */
function ohneBereich(text) {
  let rest = text
  for (;;) {
    const anfang = rest.indexOf(MARKE_ANFANG)
    if (anfang < 0) return rest
    const ende = rest.indexOf(MARKE_ENDE, anfang)
    // Ein Anfang ohne Ende ist ein halb geschriebener Bereich: alles ab dem
    // Anfang gehört uns. Sonst bliebe der Rest stehen und die Datei wäre kaputt.
    if (ende < 0) return rest.slice(0, anfang)
    // Die Zeilenenden mitnehmen, damit keine Leerzeile zurückbleibt.
    let nach = ende + MARKE_ENDE.length
    if (rest.startsWith('\r\n', nach)) nach += 2
    else if (rest.startsWith('\n', nach)) nach += 1
    rest = rest.slice(0, anfang) + rest.slice(nach)
  }
}

/**
 * Setzt den eigenen Bereich in den Inhalt einer Patch-Datei.
 *
 * **Reine Funktion, damit sie prüfbar ist.** Sie kennt kein Dateisystem: aus
 * Eingabe wird Ausgabe. Die Regeln — einmalig, stabil, nichts außerhalb anfassen
 * — lassen sich damit ohne Datei prüfen.
 *
 * Ablauf: erst unseren alten Bereich entfernen (macht den Aufruf wiederholbar),
 * dann den `[]`-Platzhalter der Vorlage durch unsere Zeilen **ersetzen**, sonst
 * anhängen.
 *
 * @param vorher - der bisherige Inhalt (darf leer sein)
 * @param zeilen - die Bereichszeilen
 * @returns der neue Inhalt
 */
export function mitBereich(vorher, zeilen) {
  const block = zeilen.join('\n')
  const entkernt = ohneBereich(vorher)
  const gemischt = entkernt.split(/\r?\n/u)
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
export function verdrahte(patchPfad, packages) {
  const ordner = dirname(patchPfad)
  if (!existsSync(ordner)) mkdirSync(ordner, { recursive: true })
  const vorher = existsSync(patchPfad) ? readFileSync(patchPfad, 'utf8') : ''
  const nachher = mitBereich(vorher, bereichsZeilen(packages))
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
]
