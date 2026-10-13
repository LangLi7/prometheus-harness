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
 * Die Fähigkeitsprüfung für das PTC-Zwischenstück — siehe {@link bereichsZeilen}.
 *
 * **Warum als Ausdruck im YAML und nicht als Entscheidung hier.** Wird die
 * Patch-Schicht auf einen anderen Rechner oder eine andere Laufzeit kopiert, muß
 * sie dort **weiter stimmen**. Eine hier getroffene Entscheidung stünde als
 * `disabled: true` fest und wäre auf Node **falsch** — dort funktioniert PTC.
 */
const PTC_FEHLT =
  "typeof process.getBuiltinModule('node:module').stripTypeScriptTypes !== 'function'"

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
  // **Die Abschaltungen stehen NACH dem `insert`-Block**, weil sie bestehende
  // Einträge der Bundle-Schicht treffen und nicht neue anlegen.
  for (const id of PTC_EINTRAEGE) {
    zeilen.push(`- id: ${id}`)
    zeilen.push(`  disabled: !!js ${PTC_FEHLT}`)
  }
  for (const zeile of BLEIBENDE_EINTRAEGE) {
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
 * Die Einträge der Bundle-Schicht, die das PTC-Zwischenstück ausmachen.
 *
 * **Warum diese drei und in dieser Reihenfolge.** `ptc-runtime` ist der
 * Laufzeitdienst, `workflow-ptc` die Ausführungsschicht darüber (`provider: spawn`),
 * `tool-workflow` das Werkzeug, das der Agent sieht. Fällt der erste, warten die
 * beiden anderen — deshalb müssen **alle drei** weg, sonst bleibt der Zustand
 * „wartet".
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
 */
export const EIGENE_PAKETE = ['@prometheus-harness/health', '@prometheus-harness/readiness']
