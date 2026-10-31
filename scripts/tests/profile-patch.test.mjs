/**
 * Prüfungen für {@link module:scripts/profile-patch}.
 *
 * **Warum diese Datei mehr prüft als „schreibt die Zeile hinein".** Die
 * Patch-Datei ist die oberste Schicht des Benutzers und wird bei **jedem Start**
 * angefaßt. Dabei sind drei Fehler möglich, und alle drei sind still — der Start
 * läuft, nur eben falsch:
 *
 * 1. **Falsche Patch-Form.** Eine Zeile mit `id` und ohne `insert` ist ein
 *    *Änderungs*-Patch. Sie würde „entry not found" melden und **nichts**
 *    einhängen. Genau das ist passiert.
 * 2. **An eine leere Liste angehängt.** `[]` ist die leere Liste, kein
 *    Platzhalter; Zeilen dahinter sind kein YAML. Der Host brach ab. Ebenfalls
 *    passiert.
 * 3. **Bei jedem Lauf ein weiterer Eintrag.** Nach zehn Starts stünde die Zeile
 *    zehnmal in der Datei.
 *
 * Fall 1 wird hier **gegen die echte Patch-Semantik** geprüft: die erzeugten
 * Zeilen werden geparst und die Form `{ insert: [...] }` nachgewiesen.
 */
import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  EIGENE_PAKETE,
  MCP_EINTRAEGE,
  PTC_EINTRAEGE,
  SUBIAGENTEN_ABSCHALTUNG,
  MARKE_ANFANG,
  MARKE_ENDE,
  bereichsZeilen,
  findeGitBash,
  hatWsl2Distribution,
  idAus,
  mitBereich,
  paketInject,
  paketName,
  patchPfad,
  terminalZeilen,
  verdrahte,
  wslBereit,
} from '../profile-patch.mjs'

/** Die Zeilen der Vorlage, wie `dsh` sie anlegt (gemessen am 13.10.2026). */
const VORLAGE = [
  '# Your patch layer for this dsh profile, applied after every bundle layer:',
  '# a top-level YAML array of loader patch entries (id-targeted config',
  '# overrides, disables, and insert lists; `!!js` expressions allowed).',
  '[]',
  '',
].join('\n')

const ZEILEN = bereichsZeilen(['@prometheus-harness/health'])
/** Ein Inhaltsblock genau so, wie ihn YAML nach dem Einrücken sieht. */
const BLOCK = ZEILEN.join('\n')

describe('idAus', () => {
  test('macht aus dem Paketnamen eine zuordenbare id', () => {
    expect(idAus('@prometheus-harness/health')).toBe('pmh-health')
  })

  test('ersetzt Zeichen, die in einer id nichts zu suchen haben', () => {
    expect(idAus('@a/mein.ding_x')).toBe('pmh-mein-ding-x')
  })

  test('kommt auch ohne Bereich aus', () => {
    expect(idAus('health')).toBe('pmh-health')
  })
})

describe('bereichsZeilen', () => {
  test('benutzt die Form `insert:` — die einzige, die Zeilen anfügt', () => {
    // **Der Fehler, der hier verhindert wird.** Ohne `insert` wäre der Eintrag
    // ein Änderungs-Patch: der Loader sucht die id, findet sie nicht und hängt
    // nichts ein. Der Endpunkt fehlte im Host, ohne daß etwas abbrach.
    //
    // **Und `- insert:` statt `insert:`.** Ohne den Bindestrich ist der Bereich
    // eine YAML-*Abbildung*; verlangt ist eine *Liste* von Patch-Einträgen. Der
    // Host brach mit „must be a top-level YAML array of loader patch entries" ab.
    expect(ZEILEN[0]).toBe(MARKE_ANFANG)
    expect(ZEILEN[1]).toBe('- insert:')
    expect(ZEILEN.at(-1)).toBe(MARKE_ENDE)
    expect(ZEILEN.some((z) => z.trimStart().startsWith('- id: pmh-health'))).toBe(true)
    expect(ZEILEN).toContain("    name: '@prometheus-harness/health'")
    expect(ZEILEN).toContain('    inject: [webServer]')
  })

  test('nimmt mehrere Pakete in der gegebenen Reihenfolge', () => {
    const zeilen = bereichsZeilen(['@a/erst', '@b/zweit'])
    expect(zeilen).toContain('  - id: pmh-erst')
    expect(zeilen).toContain('  - id: pmh-zweit')
    expect(zeilen.indexOf('  - id: pmh-erst')).toBeLessThan(zeilen.indexOf('  - id: pmh-zweit'))
  })

  test('alle Zeilen unter dem Listeneintrag sind gleich tief eingerückt', () => {
    // YAML ist hier empfindlich: ein falscher Einzug macht aus einem Feldsatz
    // eine neue Listenposition — oder aus dem Listeneintrag eine zweite Zeile.
    const zeilen = bereichsZeilen(['@a/erst', '@b/zweit'])
    // **Nur der `insert`-Block wird gezählt, nicht der ganze Bereich.** Seit der
    // Bereich auch Abschaltungen und einen bleibenden Eintrag trägt, wäre eine
    // Zählung über alle Zeilen falsch: sie würde bei jeder sinnvollen Ergänzung
    // rot und müsste dann angepasst werden — und eine Prüfung, die man bei jeder
    // Änderung anpasst, prüft nichts.
    // **`i > 1`, nicht `i > 0`.** `zeilen[1]` IST `- insert:` — mit `i > 0` fand
    // die Suche den Block selbst und schnitt ihn weg (der Block wäre leer gewesen,
    // und die Prüfung meldete `undefined`). Der eigene Fehler, der zeigt, warum
    // hier gezählt statt geschätzt wird.
    const endeInsert = zeilen.findIndex((z, i) => i > 1 && z.startsWith('- '))
    const insertBlock = zeilen.slice(1, endeInsert < 0 ? zeilen.length - 1 : endeInsert)
    expect(insertBlock[0]).toBe('- insert:')
    // **Die MCP-Zeilen zählen mit, und zwar aus ihrer eigenen Liste.** Sie sind
    // echte `insert`-Einträge (mit `config:`), keine Änderungen; wer eine
    // hinzufügt, ändert `MCP_EINTRAEGE` — und die Zahl hier zieht mit, statt
    // bei jeder Ergänzung rot zu werden.
    expect(insertBlock.filter((z) => z.startsWith('  - id: '))).toHaveLength(2 + MCP_EINTRAEGE.filter((z) => z.startsWith('  - id: ')).length)
    // `inject` tragen nur die Paket-Einträge; die MCP-Zeilen haben `config`.
    expect(insertBlock.filter((z) => z.startsWith('    inject: '))).toHaveLength(2)

    // **Die obersten Einträge — und warum hier gezählt wird.**
    // Der Bereich ist NICHT nur der `insert`-Block: er trägt zusätzlich den
    // bleibenden Eintrag der Oberfläche. Die Prüfung hält die Zusammensetzung
    // fest, damit ein verschwundener Eintrag auffällt — genau der Fehler, der
    // beim ersten Überschreiben des Bereichs passiert ist.
    const oben = zeilen.filter((z) => z.startsWith('- '))
    expect(oben[0]).toBe('- insert:')
    // **Vier oberste Einträge waren es bis zum 18.10.2026** — der `insert`-Block,
    // der bleibende Eintrag der Oberfläche und die zwei Subagenten-Abschaltungen.
    // Seitdem kommt der Eintrag des Terminal-Controllers dazu (Shell-Auswahl je
    // Plattform). Die Zahl wird aus den Konstanten gebildet und nicht
    // hingeschrieben — sonst müßte sie bei jeder Ergänzung nachgezogen werden, und
    // eine Prüfung, die man bei jeder Änderung anpasst, prüft nichts.
    // **Fünf oberste Einträge** (auf Windows; auf Linux einer weniger): der
    // `insert`-Block, der bleibende Eintrag der Oberfläche, der Eintrag des
    // Terminal-Controllers (seit 18.10.2026) und die zwei Subagenten-Abschaltungen.
    // Die Terminal-Zeilen liefert der Erzeuger selbst, damit die Plattformabhängigkeit
    // nicht doppelt gepflegt wird.
    const terminalOben = terminalZeilen({ plattform: process.platform }).filter((z) => z.startsWith('- '))
    expect(oben).toHaveLength(1 + 1 + terminalOben.length + SUBIAGENTEN_ABSCHALTUNG.length / 2)
    expect(oben).toContain('- id: ui-settings-general')
    expect(oben).toContain('- id: terminal-controller')
    expect(oben).toContain('- id: subagent-claude-code')
    expect(oben).toContain('- id: subagent-codex')
  })

  test('das PTC-Zwischenstück wird NICHT abgeschaltet — es wurde ladbar gemacht', () => {
    // **Die Prüfung, die eine zurückgenommene Entscheidung festhält.** Der erste
    // Versuch war, `ptc-runtime`, `workflow-ptc` und `tool-workflow` hier
    // abzuschalten, weil `ptc-runtime` unter Bun nicht ladbar war. Das war eine
    // **Umgehung**: sie kostete PTC dauerhaft. Die Ursache ist jetzt behoben
    // (`scripts/ptc-type-stripping.mjs`), deshalb darf hier **keine** Abschaltung
    // mehr stehen. Wer sie wieder einbaut, bekommt eine rote Prüfung und muß sich
    // entscheiden.
    //
    // **Und die Gegenprobe, damit die Prüfung nicht zu breit wird.** Seit die zwei
    // Subagenten-Adapter abgeschaltet werden, gibt es `disabled:`-Zeilen im
    // Bereich — eine Prüfung auf „gar keine Abschaltung" wäre damit rot, obwohl
    // das PTC-Teil richtig dasteht. Geprüft wird deshalb **genau das PTC-Teil**
    // und **genau die zwei Adapter**.
    const zeilen = bereichsZeilen(['@a/erst'])
    for (const id of PTC_EINTRAEGE) {
      expect(zeilen).not.toContain(`- id: ${id}`)
    }
    // **Die Nachbarzeile wird im ORIGINAL gesucht, nicht im gefilterten Feld.**
    // Der erste Versuch filterte erst auf `- id: ` und prüfte dann `alle[i + 1]` —
    // in einem Feld, das nur noch `- id:`-Zeilen enthält, ist die nächste Zeile
    // eine **andere id**, nie `disabled:`. Die Prüfung war damit immer leer und
    // meldete einen Unterschied, den es nicht gab.
    const abgeschaltet = zeilen.filter(
      (z, i) => z.startsWith('- id: ') && zeilen[i + 1] === '  disabled: true',
    )
    expect(abgeschaltet).toEqual(['- id: subagent-claude-code', '- id: subagent-codex'])
  })
})

describe('Einträge lesen — Name und inject', () => {
  test('ein Name gilt als Eintrag mit der Vorgabe webServer', () => {
    expect(paketName('@a/b')).toBe('@a/b')
    expect(paketInject('@a/b')).toEqual(['webServer'])
  })

  test('ein Gegenstand bringt sein eigenes inject mit', () => {
    const eintrag = { paket: '@a/b', inject: ['subprocess'] }
    expect(paketName(eintrag)).toBe('@a/b')
    expect(paketInject(eintrag)).toEqual(['subprocess'])
  })

  test('das Terminal-Paket wartet auf subprocess — nicht auf webServer', () => {
    // **Der Fehler, der hier verhindert wird.** Ein falsches `inject` ist nicht
    // laut: der Loader hängt das Plugin ein, ohne daß der Dienst da ist, und das
    // Plugin tut still gar nichts. Das Terminal bliebe schwarz, und niemand hätte
    // einen Anhaltspunkt.
    const eintrag = EIGENE_PAKETE.find((e) => paketName(e) === '@prometheus-harness/terminal-pty')
    expect(eintrag).toBeDefined()
    expect(paketInject(eintrag)).toEqual(['subprocess'])
  })

  test('der insert-Block schreibt das inject des Eintrags', () => {
    const zeilen = bereichsZeilen([{ paket: '@a/b', inject: ['subprocess'] }])
    expect(zeilen).toContain('    inject: [subprocess]')
    expect(zeilen).not.toContain('    inject: [webServer]')
  })
})

describe('terminalZeilen — welche Shells angeboten werden', () => {
  test('Linux bietet KEIN powershell und KEIN cmd an', () => {
    // Weisung des Betreibers (18.10.2026): „wenn linux dann sollte powershell cmd
    // überhaupt gar nicht anzeigen".
    const text = terminalZeilen({ plattform: 'linux' }).join('\n')
    expect(text).toContain('- id: terminal-controller')
    expect(text).toContain('shellCandidates: [zsh, bash, fish]')
    expect(text).not.toContain('powershell')
    expect(text).not.toContain('cmd')
    expect(text).not.toContain('wsl.exe')
  })

  test('Windows mit WSL2 bekommt bash aus WSL als Vorgabe', () => {
    // „der bash würde ich mit WSL2 verbinden … und wenn linux dann …" — der
    // Betreiber will beide Wege sehen: WSL-Bash als Vorgabe und Git-Bash daneben.
    const text = terminalZeilen({
      plattform: 'win32',
      wslBereit: true,
      gitBash: 'C:\\Program Files\\Git\\bin\\bash.exe',
    }).join('\n')
    expect(text).toContain('shell:')
    expect(text).toContain("path: 'wsl.exe'")
    expect(text).toContain("name: 'bash (WSL)'")
    expect(text).toContain("args: ['-e', 'bash', '-l']")
    // **Git-Bash als absoluter Pfad.** Als Name `bash` löste er auf
    // `C:\WINDOWS\system32\bash.exe` auf — das ist der alte WSL-Starter, nicht Git.
    expect(text).toContain("'C:\\Program Files\\Git\\bin\\bash.exe'")
    expect(text).toContain('powershell')
    expect(text).toContain('cmd')
  })

  test('Windows ohne WSL2 erfindet keine WSL-Zeile', () => {
    const text = terminalZeilen({ plattform: 'win32', wslBereit: false }).join('\n')
    expect(text).not.toContain('wsl.exe')
    expect(text).toContain('shellCandidates: [powershell, cmd]')
  })
})

describe('Was die Maschine hergibt', () => {
  test('findeGitBash nimmt den ersten vorhandenen Ort', () => {
    expect(findeGitBash((pfad) => pfad.includes('Program Files\\Git'))).toBe(
      'C:\\Program Files\\Git\\bin\\bash.exe',
    )
    expect(findeGitBash(() => false)).toBeUndefined()
  })

  test('wslBereit liest die UTF-16-Ausgabe der Distributionsliste', () => {
    // Die echte Ausgabe kommt UTF-16 (gemessen); hier wird sie nachgebaut.
    const utf16 = (text) => text.split('').join('\u0000')
    const bereit = wslBereit(() =>
      utf16('  NAME              STATE           VERSION\r\n* Ubuntu            Stopped         2\r\n'))
    expect(bereit).toBe(true)
  })

  test('die gemessene Form OHNE `Standarddistribution` zählt trotzdem', () => {
    // **Der Fehler, der diese Prüfung erzwungen hat.** Der erste Anlauf las
    // `wsl --version` und verlangte `Standardversion: 2`. Auf der Zielmaschine
    // (18.10.2026) steht das dort nicht — gemessen: `WSL-Version: 2.6.3.0`,
    // `Kernelversion: 6.6.87.2-1`, dann nur noch Versionen. Ergebnis wäre
    // „WSL2 fehlt" auf einem Rechner mit drei Distributionen gewesen.
    const gemessen = [
      '  NAME              STATE           VERSION',
      '* Ubuntu            Stopped         2',
      '  docker-desktop    Running         2',
      '  kali-linux        Stopped         2',
      '',
    ].join('\r\n')
    expect(wslBereit(() => gemessen)).toBe(true)
  })

  test('nur Docker-Distributionen ergeben keine Shell', () => {
    // `docker-desktop` hat keine Shell. Eine WSL-Bash dorthin anzubieten wäre ein
    // Terminal, das beim ersten Befehl scheitert.
    const nurDocker = '  NAME              STATE           VERSION\r\n  docker-desktop    Running         2\r\n'
    expect(wslBereit(() => nurDocker)).toBe(false)
  })

  test('ohne WSL ist es nicht bereit — und ohne Distribution auch nicht', () => {
    expect(wslBereit(() => '')).toBe(false)
    expect(wslBereit(() => 'WSL-Version: 2.6.3.0\r\nStandardversion: 2\r\n')).toBe(false)
    // Die Kopfzeile allein nennt `VERSION` ohne Zahl — sie ist keine Distribution.
    expect(hatWsl2Distribution('  NAME   STATE   VERSION\r\n')).toBe(false)
  })

  test('ein Fehler beim Aufruf gilt als „nicht bereit" und nicht als Absturz', () => {
    expect(
      wslBereit(() => {
        throw new Error('kein wsl.exe')
      }),
    ).toBe(false)
  })
})

describe('mitBereich', () => {
  test('ersetzt den `[]`-Platzhalter der Vorlage', () => {
    // **Der zweite Fehler.** `[]` ist die leere Liste. Wer dahinter Zeilen
    // anhängt, macht die Datei zu ungültigem YAML — der Host brach mit
    // „end of the stream or a document separator is expected" ab.
    const neu = mitBereich(VORLAGE, ZEILEN)
    const zeilen = neu.split('\n')
    expect(zeilen.some((z) => /^\s*\[\]\s*$/u.test(z))).toBe(false)
    expect(neu).toContain('insert:')
  })

  test('läßt die Kommentare der Vorlage stehen', () => {
    const neu = mitBereich(VORLAGE, ZEILEN)
    expect(neu).toContain('# Your patch layer for this dsh profile')
    expect(neu).toContain('# overrides, disables, and insert lists')
  })

  test('benutzt den Platzhalter wirklich, statt anzuhängen', () => {
    const neu = mitBereich('kopf\n[]\n# fuss\n', ZEILEN)
    expect(neu).toContain('kopf')
    expect(neu).toContain('# fuss')
    expect(neu).not.toContain('[]')
    // Der Block steht dort, wo `[]` stand — also zwischen den beiden Zeilen.
    expect(neu.indexOf('kopf')).toBeLessThan(neu.indexOf('insert:'))
    expect(neu.indexOf('insert:')).toBeLessThan(neu.indexOf('# fuss'))
  })

  test('hängt an, wenn es keinen Platzhalter gibt', () => {
    const neu = mitBereich('# nur ein Kommentar\n', ZEILEN)
    expect(neu).toContain('# nur ein Kommentar')
    expect(neu).toContain('insert:')
    expect(neu.indexOf('# nur ein Kommentar')).toBeLessThan(neu.indexOf('insert:'))
  })

  test('kommt mit leerem Inhalt zurecht', () => {
    const neu = mitBereich('', ZEILEN)
    expect(neu).toContain('insert:')
    expect(neu.endsWith('\n')).toBe(true)
  })

  test('setzt keinen abschließenden Umbruch voraus', () => {
    const neu = mitBereich('[]', ZEILEN)
    expect(neu).toContain('insert:')
  })

  test('ist bei zweimaligem Aufruf stabil — kein zweiter Eintrag', () => {
    const einmal = mitBereich(VORLAGE, ZEILEN)
    const zweimal = mitBereich(einmal, ZEILEN)
    expect(zweimal).toBe(einmal)
    expect(zweimal.split('insert:')).toHaveLength(2)
  })

  test('ersetzt einen geänderten Bereich, statt ihn zu verdoppeln', () => {
    const alt = mitBereich(VORLAGE, bereichsZeilen(['@a/alt']))
    const neu = mitBereich(alt, bereichsZeilen(['@a/neu']))
    expect(neu).toContain('@a/neu')
    expect(neu).not.toContain('@a/alt')
    expect(neu.split('insert:')).toHaveLength(2)
  })

  test('ein Bereich ohne Ende wird entfernt, nicht ergänzt', () => {
    const halb = `${VORLAGE}${MARKE_ANFANG}\ninsert:\n  - id: rest\n`
    const neu = mitBereich(halb, ZEILEN)
    expect(neu).not.toContain('- id: rest')
    expect(neu).toContain('- id: pmh-health')
  })

  test('fremde Einträge bleiben unangetastet', () => {
    // Die Datei gehört dem Benutzer. Ein Eintrag, den jemand absichtlich dort
    // hat, darf nicht verschwinden.
    const vorher = '# mein Kopf\n- id: fremd\n  name: "@fremd/paket"\n# mein Fuss\n'
    const neu = mitBereich(vorher, ZEILEN)
    expect(neu).toContain('- id: fremd')
    expect(neu).toContain('# mein Kopf')
    expect(neu).toContain('# mein Fuss')
    expect(neu).toContain('- id: pmh-health')
  })

  test('der erzeugte Bereich ist gültiges YAML mit der Form `insert:`', () => {
    // **Die Prüfung gegen die echte Semantik.** Bis hierher wurde nur Text
    // verglichen. Hier wird geparst — und die Form nachgewiesen, die der Loader
    // als „anhängen" versteht.
    const inhalt = mitBereich(VORLAGE, ZEILEN)
    const ohneKommentare = inhalt
      .split('\n')
      .filter((z) => !z.trimStart().startsWith('#'))
      .join('\n')
    const eintraege = parseEinfach(ohneKommentare)
    // **Der erste Eintrag ist der `insert`-Block; danach kommen die weiteren.**
    // Früher stand hier `toHaveLength(1)` — das galt, solange der Bereich nur den
    // `insert`-Block trug. Jetzt trägt er zusätzlich die Abschaltungen des
    // PTC-Zwischenschritts, einen bleibenden Eintrag der Oberfläche und den
    // Eintrag des Terminal-Controllers. Geprüft wird deshalb der **erste** Eintrag
    // genau und die Anzahl insgesamt; die Terminal-Zeilen zählt der Erzeuger selbst.
    const terminalOben = terminalZeilen({ plattform: process.platform }).filter((z) => z.startsWith('- '))
    expect(eintraege).toHaveLength(1 + 1 + terminalOben.length + SUBIAGENTEN_ABSCHALTUNG.length / 2)
    expect(Object.keys(eintraege[0])).toEqual(['insert'])
    const eingefuegt = eintraege[0].insert
    expect(eingefuegt).toHaveLength(1 + MCP_EINTRAEGE.filter((z) => z.startsWith('  - id: ')).length)
    expect(eingefuegt[0].id).toBe('pmh-health')
    expect(eingefuegt[0].name).toBe('@prometheus-harness/health')
    expect(eingefuegt[0].inject).toEqual(['webServer'])
    // **Und die Abschaltungen sind angekommen** — als oberste Einträge mit `id`.
    const ids = eintraege.slice(1).map((e) => e.id)
    expect(ids).toContain('ui-settings-general')
  })
})

/**
 * Ein winziger YAML-Leser für **genau** die Form, die dieses Skript erzeugt.
 *
 * **Warum kein echtes YAML-Paket.** Das Projekt hat keines als Abhängigkeit, und
 * eine neue Abhängigkeit nur für eine Prüfung wäre teuer. Dieser Leser deckt die
 * benutzte Teilmenge ab — eine Liste auf oberster Ebene mit einem Eintrag
 * `insert:`, darunter Feldsätze — und **wirft** bei allem anderen. Damit kann er
 * nicht stillschweigend etwas Falsches durchwinken.
 *
 * **Was er nicht kann:** Anker, mehrzeilige Werte, `!!js`. Braucht er auch nicht.
 *
 * **Die Erweiterung, die nötig wurde.** Ursprünglich verstand er **genau einen**
 * Eintrag: `- insert:` mit einer Liste darunter. Der Bereich enthält aber
 * inzwischen **mehrere** oberste Einträge: den `insert`-Block, die drei
 * Abschaltungen des PTC-Zwischenschritts (Feldsätze ohne `insert`) und einen
 * bleibenden Eintrag der Oberfläche. Der alte Leser **warf** bei ihnen — die
 * Prüfung wäre rot geworden, obwohl die erzeugte Datei richtig ist.
 *
 * Ein oberster Eintrag ist jetzt entweder `- insert:` (mit einer Liste darunter,
 * 2 Zeichen Einzug) oder ein **Feldsatz** (`- id: …` mit Feldern auf 2 Zeichen).
 * Alles andere wirft weiterhin.
 *
 * @param text - YAML ohne Kommentarzeilen
 * @returns die Liste der Einträge
 */
function parseEinfach(text) {
  const zeilen = text.split('\n').filter((z) => z.trim() !== '')
  const eintraege = []
  let liste
  let verschachtelt = false
  for (const zeile of zeilen) {
    if (/^- insert:\s*$/u.test(zeile)) {
      const eintrag = { insert: [] }
      eintraege.push(eintrag)
      liste = eintrag.insert
      continue
    }
    // **Ein oberster Feldsatz** — kein `insert`. Er beginnt bei Spalte 0 und
    // seine Felder stehen auf 2 Zeichen Einzug.
    const oberster = /^- (\w+): (.+)$/u.exec(zeile)
    if (oberster !== null) {
      const satz = {}
      satz[oberster[1]] = wert(oberster[2])
      eintraege.push(satz)
      liste = undefined
      continue
    }
    const neuerEintrag = /^ {2}- (\w+): (.+)$/u.exec(zeile)
    if (neuerEintrag !== null && liste !== undefined) {
      const satz = {}
      satz[neuerEintrag[1]] = wert(neuerEintrag[2])
      liste.push(satz)
      continue
    }
    const feld = /^ {2}(\w+): (.+)$/u.exec(zeile)
    if (feld !== null && liste === undefined && eintraege.length > 0) {
      eintraege[eintraege.length - 1][feld[1]] = wert(feld[2])
      continue
    }
    const feldTief = /^ {4}(\w+): (.+)$/u.exec(zeile)
    if (feldTief !== null && liste !== undefined && liste.length > 0) {
      liste[liste.length - 1][feldTief[1]] = wert(feldTief[2])
      continue
    }
    // **Ein Feld ohne Wert (`config:`) leitet eine Verschachtelung ein.** Der
    // Bereich enthält genau so einen Fall: den `config:`-Block des bleibenden
    // Oberflächen-Eintrags. Der Inhalt darunter ist hier ohne Bedeutung — geprüft
    // wird, daß die Zeile **gültig** ist und nicht verworfen wird.
    const feldLeer = /^ {2}(\w+):\s*$/u.exec(zeile)
    if (feldLeer !== null && liste === undefined && eintraege.length > 0) {
      eintraege[eintraege.length - 1][feldLeer[1]] = null
      verschachtelt = true
      continue
    }
    if (verschachtelt && /^ {4}\w+: /u.test(zeile)) continue
    // **Ein Feld auf sechs Zeichen** gehört zum `config:` eines MCP-Eintrags
    // (`serverName`, `transport`, `command`, `args`, `env`, `cwd`, …). Der Wert
    // ist hier ohne Bedeutung: geprüft wird, daß die erzeugte Datei gültig ist
    // und die Einträge die richtige Form haben. `!!js`-Werte bleiben Zeichenketten.
    // **Der Kopf der Verschachtelung** (`    config:`) steht auf vier Zeichen und
    // gehört zu einem `insert`-Eintrag; seine Kinder überspringt die Regel darüber.
    if (/^ {4}\w+:\s*$/u.test(zeile) && liste !== undefined) continue
    // Sechs und acht Zeichen: `config:`-Felder und deren `env:`-Kinder. Beide
    // ohne Bedeutung für diese Prüfung — sie müssen nur gültig bleiben.
    if (/^ {6}\w+:/u.test(zeile) && liste !== undefined) continue
    if (/^ {8}\w+:/u.test(zeile) && liste !== undefined) continue
    throw new Error(`parseEinfach: unerwartete Zeile ${JSON.stringify(zeile)}`)
  }
  return eintraege
}

/** Liest einen skalaren Wert oder eine einfache Liste `[a, b]`. */
function wert(roh) {
  const text = roh.trim()
  if (text.startsWith('[') && text.endsWith(']')) {
    const innen = text.slice(1, -1).trim()
    return innen === '' ? [] : innen.split(',').map((t) => entquote(t.trim()))
  }
  return entquote(text)
}

/** Entfernt einfache oder doppelte Anführungszeichen. */
function entquote(text) {
  if (text.length >= 2 && ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))) {
    return text.slice(1, -1)
  }
  return text
}

describe('patchPfad', () => {
  test('zeigt auf die Patch-Datei des Profils', () => {
    const p = patchPfad('C:\\home', 'web')
    expect(p).toContain('home')
    expect(p).toContain('profiles')
    expect(p).toContain('web')
    expect(p.endsWith('cordis.patch.yml')).toBe(true)
  })
})

describe('EIGENE_PAKETE', () => {
  test('nennt den Endpunkt dieses Projekts', () => {
    expect(EIGENE_PAKETE).toContain('@prometheus-harness/health')
  })

  test('jedes genannte Paket hat eine gültige id', () => {
    // **`paketName` und nicht der Eintrag selbst.** Seit ein Eintrag auch ein
    // Gegenstand sein darf (`{ paket, inject }`, für den Terminal-Controller-Weg),
    // ist der rohe Wert keine Zeichenkette mehr — der Fehler war hier sofort
    // sichtbar, statt später im Profil.
    for (const eintrag of EIGENE_PAKETE) {
      expect(idAus(paketName(eintrag))).toMatch(/^pmh-[a-z0-9-]+$/u)
    }
  })
})

describe('verdrahte — mit einer echten Datei', () => {
  /** Ein frisches Verzeichnis mit der Vorlage darin. */
  function mitVorlage() {
    const dir = mkdtempSync(join(tmpdir(), 'pmh-patch-'))
    const ordner = join(dir, 'profiles', 'web')
    mkdirSync(ordner, { recursive: true })
    const pfad = join(ordner, 'cordis.patch.yml')
    writeFileSync(pfad, VORLAGE, 'utf8')
    return { dir, pfad, weg: () => rmSync(dir, { recursive: true, force: true }) }
  }

  test('legt die Datei an, wenn es sie nicht gibt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pmh-patch-'))
    try {
      const pfad = join(dir, 'profiles', 'web', 'cordis.patch.yml')
      const ergebnis = verdrahte(pfad, EIGENE_PAKETE)
      expect(ergebnis.geaendert).toBe(true)
      expect(readFileSync(pfad, 'utf8')).toContain('@prometheus-harness/health')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('meldet beim zweiten Lauf, dass nichts geändert wurde', () => {
    const w = mitVorlage()
    try {
      expect(verdrahte(w.pfad, EIGENE_PAKETE).geaendert).toBe(true)
      expect(verdrahte(w.pfad, EIGENE_PAKETE).geaendert).toBe(false)
    } finally {
      w.weg()
    }
  })

  test('läßt den Inhalt der Vorlage stehen', () => {
    const w = mitVorlage()
    try {
      verdrahte(w.pfad, EIGENE_PAKETE)
      const inhalt = readFileSync(w.pfad, 'utf8')
      expect(inhalt).toContain('# Your patch layer for this dsh profile')
      expect(inhalt).not.toContain('[]')
    } finally {
      w.weg()
    }
  })

  test('nach zehn Läufen steht der Eintrag genau einmal darin', () => {
    // Die Wirklichkeit: der Start ruft das bei **jedem** Lauf auf.
    const w = mitVorlage()
    try {
      for (let i = 0; i < 10; i += 1) verdrahte(w.pfad, EIGENE_PAKETE)
      const inhalt = readFileSync(w.pfad, 'utf8')
      expect(inhalt.split('insert:')).toHaveLength(2)
      expect(inhalt.split('@prometheus-harness/health')).toHaveLength(2)
    } finally {
      w.weg()
    }
  })
})

test('eine fremde Einstellung IM eigenen Bereich wird gerettet', () => {
  /*
   * ## Der gemessene Schaden (16.10.2026)
   *
   * Der Einstellungseditor des Harness schreibt seine Zeilen ans Ende des YAML-Inhalts — und dort stand
   * unsere Endmarke als letzte Zeile. Nach einer Schriftgrößenänderung im Chat lag `- id: ui-theme` also
   * **innerhalb** unseres Bereichs, und der nächste Start löschte ihn mit. Nachgerechnet: die Datei
   * schrumpfte von 1581 auf 1423 Zeichen, `id: ui-theme` war danach **weg** — jede im Chat geänderte
   * Einstellung verschwand beim nächsten Start.
   *
   * ## Was hier festgehalten wird
   *
   * Eine fremde Zeile in unserem Bereich überlebt **jeden** Lauf, wird **nicht** verdoppelt, und die
   * Datei kommt innerhalb von zwei Läufen zur Ruhe.
   */
  const fremd = ['- id: locale', '  name: "@deepseek-ai/dsh-client-locale"', '  config:', '    preference: de']
  const datei = `${MARKE_ANFANG}\n${ZEILEN.join('\n')}\n${fremd.join('\n')}\n${MARKE_ENDE}\n`

  const einmal = mitBereich(datei, ZEILEN)
  expect(einmal, 'die fremde Einstellung ging beim ersten Lauf verloren').toContain('preference: de')
  expect((einmal.match(/preference: de/g) ?? []).length, 'die fremde Einstellung wurde verdoppelt').toBe(1)

  const zweimal = mitBereich(einmal, ZEILEN)
  expect(zweimal, 'die fremde Einstellung ging beim zweiten Lauf verloren').toContain('preference: de')

  // **Ab dem dritten Lauf passiert nichts mehr** — die Rettung ist eine einmalige Umschichtung, keine
  // dauerhafte Änderung. Ohne diese Prüfung würde bei jedem Start geschrieben, und niemand merkte es.
  const dreimal = mitBereich(zweimal, ZEILEN)
  expect(dreimal, 'die Datei kommt nicht zur Ruhe').toBe(zweimal)

  // Und unsere eigenen Zeilen stehen weiterhin genau einmal darin.
  expect((dreimal.match(/id: pmh-health/g) ?? []).length).toBe(1)
})
