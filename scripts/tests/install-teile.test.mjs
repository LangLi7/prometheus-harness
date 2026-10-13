/**
 * Prüfungen für {@link module:scripts/install-teile}.
 *
 * **Warum diese Datei die beiden anderen Dokumente mitliest.** Ein Installer, der
 * eine Variable setzt, die `docker-compose.yml` nicht kennt, ist wirkungslos —
 * und ein Compose-File, das eine Variable erwartet, die der Installer nicht setzt,
 * startet mit einem leeren Wert. Beides ist **still**. Deshalb vergleicht diese
 * Prüfung die Liste der Geheimnisse mit **beiden** Dateien: läuft in einer davon
 * ein Name ein, wird sie rot.
 *
 * Das ist keine Stilfrage: es ist die einzige Stelle, an der ein Auseinanderlaufen
 * zwischen Installer, Vorlage und Stapel auffällt.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  GEHEIMNIS_NAMEN,
  kennwortKonfliktHinweise,
  pruefeKennwortAbgleich,
  erkenneUmgebung,
  umgebungsHinweise,
  abgeleiteteWerte,
  fassePruefungenZusammen,
  familie,
  gesetzteNamen,
  neuesGeheimnis,
  setzeWerte,
  werkzeugBefehl,
} from '../install-teile.mjs'

const WURZEL = join(import.meta.dir, '..', '..')
const VORLAGE = readFileSync(join(WURZEL, '.env.example'), 'utf8')
const COMPOSE = readFileSync(join(WURZEL, 'docker-compose.yml'), 'utf8')

describe('familie', () => {
  test('erkennt Windows', () => {
    expect(familie('win32')).toBe('windows')
  })

  test('alles andere ist POSIX', () => {
    for (const p of ['linux', 'darwin', 'freebsd', 'aix']) {
      expect(familie(p)).toBe('posix')
    }
  })
})

describe('werkzeugBefehl', () => {
  test('auf Windows mit .exe', () => {
    // Gemessen: auf dem Zielrechner gibt es `powershell` (5.1) und `pwsh` (7.6);
    // `sh` und `unzip` fehlen. Ein Aufruf ohne Endung gelingt über den PATH,
    // `spawn` ohne `shell` findet die Datei zuverlässiger mit Endung.
    expect(werkzeugBefehl('bun', 'win32')).toBe('bun.exe')
    expect(werkzeugBefehl('docker', 'win32')).toBe('docker.exe')
    expect(werkzeugBefehl('git', 'win32')).toBe('git.exe')
  })

  test('auf POSIX ohne Endung', () => {
    expect(werkzeugBefehl('bun', 'linux')).toBe('bun')
    expect(werkzeugBefehl('docker', 'darwin')).toBe('docker')
  })
})

describe('neuesGeheimnis', () => {
  test('hat 43 Zeichen bei 32 Byte — base64url ohne Auffüllung', () => {
    // `ceil(32/3)*4 - 1 = 43`. Dieselbe Rechnung wie beim Token des Hosts.
    expect(neuesGeheimnis(32)).toHaveLength(43)
  })

  test('enthält keine Zeichen, die in einer URL oder .env stören', () => {
    for (let i = 0; i < 50; i += 1) {
      const g = neuesGeheimnis(32)
      expect(g).toMatch(/^[A-Za-z0-9_-]+$/u)
      expect(g).not.toContain('=')
      expect(g).not.toContain('+')
      expect(g).not.toContain('/')
    }
  })

  test('zwei Aufrufe liefern verschiedene Werte', () => {
    // **Der Fehler, der hier verhindert wird.** Ein festes „Beispielgeheimnis"
    // in der .env wäre auf jeder Installation dasselbe — und damit keines.
    const gesehen = new Set()
    for (let i = 0; i < 100; i += 1) gesehen.add(neuesGeheimnis(32))
    expect(gesehen.size).toBe(100)
  })

  test('die Länge folgt der Bytelänge', () => {
    expect(neuesGeheimnis(16)).toHaveLength(22)
    expect(neuesGeheimnis(64)).toHaveLength(86)
  })
})

describe('setzeWerte', () => {
  const vorlage = ['# Kommentar', 'A=alt', '', 'B=alt', '# C=auskommentiert', '  D=alt'].join('\n')

  test('ersetzt nur die genannten Namen', () => {
    const { inhalt, ersetzt } = setzeWerte(vorlage, { A: 'neu' })
    expect(ersetzt).toBe(1)
    expect(inhalt).toContain('A=neu')
    expect(inhalt).toContain('B=alt')
  })

  test('läßt Kommentare und Leerzeilen unberührt', () => {
    // Die Kommentare der Vorlage **sind** die Anleitung. Wer sie löscht, nimmt
    // dem Benutzer die Begründung.
    const { inhalt } = setzeWerte(vorlage, { A: 'neu', B: 'neu' })
    expect(inhalt.split('\n')[0]).toBe('# Kommentar')
    expect(inhalt.split('\n')[2]).toBe('')
  })

  test('eine AUSKOMMENTIERTE Zeile wird nicht ersetzt', () => {
    // **Der stille Fehler, der hier verhindert wird.** `# PMH_READY_REDIS_URL=…`
    // ist ein Beispiel, kein Wert. Würde es ersetzt, machte der Installer aus
    // einem Beispiel eine Einstellung — und änderte damit das Verhalten, ohne
    // daß jemand es gesagt hätte.
    const { inhalt, ersetzt } = setzeWerte(vorlage, { C: 'neu' })
    expect(ersetzt).toBe(0)
    expect(inhalt).toContain('# C=auskommentiert')
    expect(inhalt).not.toContain('C=neu')
  })

  test('führender Leerraum bleibt erhalten', () => {
    const { inhalt } = setzeWerte(vorlage, { D: 'neu' })
    expect(inhalt).toContain('  D=neu')
  })

  test('ein unbekannter Name fügt keine Zeile hinzu', () => {
    // Eine neue Zeile anzuhängen hieße: zwei Orte, an denen eine Variable
    // entsteht — und der zweite wäre unsichtbar.
    const { inhalt, ersetzt } = setzeWerte(vorlage, { GIBTESNICHT: 'x' })
    expect(ersetzt).toBe(0)
    expect(inhalt).toBe(vorlage)
  })

  test('zählt auch mehrere Ersetzungen', () => {
    const { ersetzt } = setzeWerte(vorlage, { A: '1', B: '2', D: '3' })
    expect(ersetzt).toBe(3)
  })

  test('ein Wert mit Sonderzeichen wird nicht zerlegt', () => {
    const lang = 'a-b_c.d~e:f/g?h&i'
    const { inhalt } = setzeWerte('X=alt', { X: lang })
    expect(inhalt).toBe(`X=${lang}`)
  })

  // ---------------------------------------------------------------------------
  // CRLF — der Fall, der die erste Fassung zerlegt hat
  // ---------------------------------------------------------------------------
  // **Der Befund, der diese Fälle erzwungen hat.** Gemessen am 13.10.2026 in
  // einem **frischen Klon** auf Windows: `Ersetzt: 0`. Kein einziger Wert wurde
  // geschrieben, obwohl die Namen alle dastanden — und die Installation lief
  // danach in „MIGRATION_DATABASE_URL ist nicht gesetzt".
  //
  // **Die Ursache:** `.` matcht in JavaScript **kein** `\r`. Bei einer Zeile
  // `"X=alt\r"` scheiterte `=(.*)$`, weil zwischen `alt` und dem Zeilenende noch
  // ein `\r` steht.
  //
  // **Warum keine Prüfung das fand:** alle Eingaben waren im Speicher gebaut,
  // mit `\n`. Die Wirklichkeit auf einem Windows-Rechner mit
  // `core.autocrlf=true` ist `\r\n`. Die Prüfungen waren grün und die
  // Installation kaputt.
  describe('mit CRLF-Zeilenenden', () => {
    const crlf = (text) => text.split('\n').join('\r\n')

    test('ersetzt Werte auch in einer CRLF-Datei', () => {
      const { inhalt, ersetzt } = setzeWerte(crlf('A=alt\nB=alt'), { A: 'neu' })
      expect(ersetzt).toBe(1)
      expect(inhalt).toContain('A=neu')
      expect(inhalt).toContain('B=alt')
    })

    test('behält die CRLF-Zeilenenden bei', () => {
      // **Kein stilles Umwandeln.** Wer eine CRLF-Datei einliest, sie ändert und
      // zurückschreibt, erwartet dieselbe Datei — nur mit einem anderen Wert.
      // Würde die Funktion auf LF umstellen, zeigte `git diff` jede Zeile als
      // geändert.
      const { inhalt } = setzeWerte(crlf('A=alt\nB=alt'), { A: 'neu' })
      expect(inhalt).toBe('A=neu\r\nB=alt')
    })

    test('verwechselt einen CRLF-Wert nicht mit dem Zeilenende', () => {
      // Ohne die Korrektur hätte der Wert ein `\r` am Ende bekommen — und ein
      // Kennwort mit einem unsichtbaren Zeichen wäre bei der Anmeldung falsch.
      const { inhalt } = setzeWerte('A=alt\r', { A: 'neu' })
      expect(inhalt).toBe('A=neu\r')
    })

    test('eine auskommentierte CRLF-Zeile bleibt auskommentiert', () => {
      // Das `#` ist der ganze Punkt: `# C=aus` ist ein Beispiel, kein Wert.
      const { inhalt, ersetzt } = setzeWerte('# C=aus\r', { C: 'neu' })
      expect(ersetzt).toBe(0)
      expect(inhalt).toBe('# C=aus\r')
    })

    test('gesetzteNamen liest auch aus CRLF', () => {
      expect(gesetzteNamen(crlf('A=1\n# B=2\nC=3'))).toEqual(['A', 'C'])
    })

    test('ersetzt in der ECHTEN Vorlage — in beiden Zeilenenden', () => {
      // **Die Prüfung, die den Fehler gefunden hätte.** Sie benutzt nicht eine im
      // Speicher gebaute Zeichenkette, sondern die Datei aus dem Repository.
      //
      // **Und der Fehler, den SIE zuerst hatte.** Die Umformung lautete
      // `VORLAGE.split('\n').join('\r\n')`. Auf diesem Rechner hat die
      // ausgecheckte `.env.example` **schon** CRLF (`core.autocrlf=true`) —
      // daraus wurde `\r\r\n`, und die Prüfung war rot, obwohl die Funktion
      // richtig arbeitete. Gemessen im sauberen Klon am 13.10.2026:
      //
      //     CRLF doppelt: true
      //     --- Original ---       ersetzt: 1
      //     --- CRLF-Fassung ---   ersetzt: 0
      //
      // Die Umformung normalisiert jetzt **erst** auf LF. Eine Prüfung, die die
      // Wirklichkeit verdoppelt, prüft nicht die Wirklichkeit.
      const aufLf = (text) => text.split('\r\n').join('\n')
      const aufCrlf = (text) => aufLf(text).split('\n').join('\r\n')

      const werte = { POSTGRES_SUPERUSER_PASSWORD: 'neu' }
      // Die Datei so, wie Git sie hier ausgibt — auf Windows CRLF, auf Linux LF.
      expect(setzeWerte(VORLAGE, werte).ersetzt).toBe(1)
      // Und ausdrücklich als CRLF-Fassung.
      expect(setzeWerte(aufCrlf(VORLAGE), werte).ersetzt).toBe(1)
      // Und ausdrücklich als LF-Fassung — damit beide Enden geprüft sind,
      // unabhängig davon, wie Git hier einstellt.
      expect(setzeWerte(aufLf(VORLAGE), werte).ersetzt).toBe(1)
    })

    test('setzt ALLE Geheimnisse der echten Vorlage — in beiden Zeilenenden', () => {
      // Der vollständige Fall: der Installer setzt neun Werte. Wird auch nur
      // einer nicht gesetzt, scheitert später ein Schritt mit einer Meldung, die
      // nicht auf die Ursache zeigt.
      const aufLf = (text) => text.split('\r\n').join('\n')
      const aufCrlf = (text) => aufLf(text).split('\n').join('\r\n')

      const werte = {}
      for (const name of GEHEIMNIS_NAMEN) werte[name] = 'x'.repeat(43)
      for (const inhalt of [VORLAGE, aufLf(VORLAGE), aufCrlf(VORLAGE)]) {
        const { ersetzt } = setzeWerte(inhalt, werte)
        expect(ersetzt).toBe(GEHEIMNIS_NAMEN.length)
      }
    })

    test('eine verdoppelte CRLF-Fassung ist kein gueltiger Eingang', () => {
      // **Die Sicherung gegen den Prüfungsfehler.** Wird die Wirklichkeit
      // verdoppelt (`\r\r\n`), ist das Ergebnis kein `.env` mehr — und die
      // Funktion darf es nicht stillschweigend als eines behandeln.
      const verdoppelt = VORLAGE.split('\n').join('\r\n')
      if (!verdoppelt.includes('\r\r\n')) {
        // Auf einem LF-Checkout entsteht keine Verdopplung — dann ist dieser Fall
        // nicht anwendbar und wird übersprungen statt falsch geprüft.
        return
      }
      const { ersetzt } = setzeWerte(verdoppelt, { POSTGRES_SUPERUSER_PASSWORD: 'neu' })
      expect(ersetzt).toBe(0)
    })
  })
})

describe('gesetzteNamen', () => {
  test('liest nur gesetzte Namen, nicht auskommentierte', () => {
    const namen = gesetzteNamen(['A=1', '# B=2', '  C=3', 'kein-eintrag', ''].join('\n'))
    expect(namen).toEqual(['A', 'C'])
  })

  test('nimmt auch Namen mit Leerraum davor', () => {
    expect(gesetzteNamen('   D=4')).toEqual(['D'])
  })

  test('ein leerer Wert gilt als gesetzt', () => {
    // `X=` ist gesetzt und leer — das ist etwas anderes als „fehlt", und der
    // Unterschied zählt bei einer Bereitschaftsprüfung.
    expect(gesetzteNamen('X=')).toEqual(['X'])
  })
})

describe('abgeleiteteWerte', () => {
  test('benutzt die App-Rolle für die Anwendung', () => {
    const w = abgeleiteteWerte({ PMH_APP_PASSWORD: 'geheim', PMH_OWNER_PASSWORD: 'eigen' })
    expect(w.DATABASE_URL).toContain('pmh_app:geheim@')
  })

  test('benutzt die Eigentuemerrolle fuer die Migrationen', () => {
    const w = abgeleiteteWerte({ PMH_APP_PASSWORD: 'geheim', PMH_OWNER_PASSWORD: 'eigen' })
    expect(w.MIGRATION_DATABASE_URL).toContain('pmh_owner:eigen@')
  })

  test('NICHT den Superuser — das waere das Ende des Rechtemodells', () => {
    const w = abgeleiteteWerte({
      PMH_APP_PASSWORD: 'geheim',
      PMH_OWNER_PASSWORD: 'eigen',
      POSTGRES_SUPERUSER_PASSWORD: 'admin',
    })
    for (const adresse of [w.DATABASE_URL, w.MIGRATION_DATABASE_URL, w.PMH_TEST_DATABASE_URL]) {
      expect(adresse).not.toContain('pmh_admin')
      expect(adresse).not.toContain('admin@')
    }
  })

  test('die Adressen sind gueltige URLs mit dem erwarteten Wirt und Port', () => {
    const w = abgeleiteteWerte({ PMH_APP_PASSWORD: 'g', PMH_OWNER_PASSWORD: 'e' })
    for (const adresse of [w.DATABASE_URL, w.MIGRATION_DATABASE_URL, w.PMH_TEST_DATABASE_URL]) {
      const u = new URL(adresse)
      expect(u.protocol).toBe('postgres:')
      expect(u.hostname).toBe('127.0.0.1')
      expect(u.port).toBe('5432')
      expect(u.pathname).toBe('/pmh')
    }
  })
})

describe('erkenneUmgebung', () => {
  test('erkennt WSL an /proc/version', () => {
    // **Die einzige verläßliche Spur.** Ein Verzeichnis `/mnt/c` könnte auch von
    // einem manuell gemounteten System stammen; der Hersteller im Versionstext
    // nicht.
    const e = erkenneUmgebung({
      versionstext: 'Linux version 5.15.153.1-microsoft-standard-WSL2 (root@x)',
      hatMntC: true,
    })
    expect(e.wsl).toBe(true)
    expect(e.wslVersion).toBe('2')
    expect(e.windowsDateisystem).toBe(true)
  })

  test('erkennt WSL1', () => {
    expect(erkenneUmgebung({ versionstext: 'Linux version 4.4.0-19041-Microsoft' }).wsl).toBe(true)
  })

  test('ein echtes Linux ist kein WSL', () => {
    const e = erkenneUmgebung({ versionstext: 'Linux version 6.8.0-45-generic (buildd@lcy02)' })
    expect(e.wsl).toBe(false)
    expect(e.wslVersion).toBeUndefined()
  })

  test('ohne Versionstext wird nichts behauptet', () => {
    const e = erkenneUmgebung({})
    expect(e.wsl).toBe(false)
    expect(e.windowsDateisystem).toBe(false)
  })
})

describe('umgebungsHinweise', () => {
  test('WSL ohne erreichbares Docker bekommt den Weg zur Integration', () => {
    // **Der gemessene Fall.** In WSL2 ist `docker` im PATH und `docker info`
    // scheitert. Ohne diesen Hinweis sucht der Benutzer an der falschen Stelle.
    const e = erkenneUmgebung({ versionstext: 'x-microsoft-WSL2' })
    const h = umgebungsHinweise(e, false)
    const text = h.join('\n')
    expect(text).toContain('WSL erkannt')
    expect(text).toContain('WSL Integration')
    expect(text).toContain('install.cmd')
  })

  test('WSL MIT erreichbarem Docker bekommt keinen Docker-Hinweis', () => {
    const e = erkenneUmgebung({ versionstext: 'x-microsoft-WSL2' })
    const text = umgebungsHinweise(e, true).join('\n')
    expect(text).not.toContain('WSL Integration')
  })

  test('ein echtes Linux bekommt keinen WSL-Hinweis', () => {
    const e = erkenneUmgebung({ versionstext: 'Linux version 6.8.0-generic' })
    expect(umgebungsHinweise(e, false)).toEqual([])
  })

  test('das Windows-Dateisystem unter WSL wird als langsam benannt', () => {
    const e = erkenneUmgebung({ versionstext: 'x-microsoft-WSL2', hatMntC: true })
    expect(umgebungsHinweise(e, true).join('\n')).toContain('/mnt/')
  })
})

describe('pruefeKennwortAbgleich', () => {
  test('kein Container: nichts zu prüfen, kein Konflikt', () => {
    // Der erste Start legt an — da gibt es nichts abzugleichen.
    const r = pruefeKennwortAbgleich({ POSTGRES_SUPERUSER_PASSWORD: 'x' }, undefined)
    expect(r.geprueft).toBe(false)
    expect(r.passt).toBe(true)
  })

  test('gleiche Kennwörter: alles in Ordnung', () => {
    const r = pruefeKennwortAbgleich(
      { POSTGRES_SUPERUSER_PASSWORD: 'gleich' },
      { POSTGRES_PASSWORD: 'gleich' },
    )
    expect(r.geprueft).toBe(true)
    expect(r.passt).toBe(true)
  })

  test('verschiedene Kennwörter: Konflikt, und das Container-Kennwort wird genannt', () => {
    // **Der gemessene Fall.** Das Container-Kennwort wird mitgeliefert, weil es
    // der einzige Weg A ist: es zu übernehmen.
    const r = pruefeKennwortAbgleich(
      { POSTGRES_SUPERUSER_PASSWORD: 'neu' },
      { POSTGRES_PASSWORD: 'alt' },
    )
    expect(r.geprueft).toBe(true)
    expect(r.passt).toBe(false)
    expect(r.imContainer).toBe('alt')
  })

  test('ein fehlender Wert in .env ist ein Konflikt, kein Freibrief', () => {
    // **Fail-closed.** Ohne Wert kann sich die Anwendung nicht anmelden; „passt"
    // wäre eine Behauptung ohne Grundlage.
    const r = pruefeKennwortAbgleich({}, { POSTGRES_PASSWORD: 'alt' })
    expect(r.passt).toBe(false)
    expect(r.grund).toContain('fehlt')
  })

  test('ein leerer Wert in .env ist ebenfalls ein Konflikt', () => {
    const r = pruefeKennwortAbgleich({ POSTGRES_SUPERUSER_PASSWORD: '   ' }, { POSTGRES_PASSWORD: 'alt' })
    expect(r.passt).toBe(false)
  })

  test('ein Container ohne Kennwort ist kein Konflikt', () => {
    const r = pruefeKennwortAbgleich({ POSTGRES_SUPERUSER_PASSWORD: 'x' }, { ANDERES: 'y' })
    expect(r.geprueft).toBe(false)
    expect(r.passt).toBe(true)
  })
})

describe('kennwortKonfliktHinweise', () => {
  test('nennt BEIDE Wege und den Preis jedes Weges', () => {
    // **Eine Anweisung, die nur „lösche das Volume" sagt, ist eine Anweisung zum
    // Datenverlust.** Beide Wege müssen dastehen — mit den Kosten.
    const text = kennwortKonfliktHinweise({ POSTGRES_PASSWORD: 'alt' }).join('\n')
    expect(text).toContain('übernehmen')
    expect(text).toContain('kein Datenverlust')
    expect(text).toContain('Datenverlust')
    expect(text).toContain('docker compose down -v')
  })

  test('nennt das Kennwort des Containers, damit Weg A gangbar ist', () => {
    const text = kennwortKonfliktHinweise({ POSTGRES_PASSWORD: 'geheim-von-damals' }).join('\n')
    expect(text).toContain('POSTGRES_SUPERUSER_PASSWORD=geheim-von-damals')
  })

  test('sagt ehrlich, was NICHT im Container steht', () => {
    // Die Rollenkennwörter von pmh_owner/pmh_app stehen nicht in der
    // Container-Umgebung. Wer sie nicht kennt, muß Weg B nehmen — das gehört
    // gesagt, sonst sucht jemand nach Werten, die es dort nicht gibt.
    const text = kennwortKonfliktHinweise({ POSTGRES_PASSWORD: 'alt' }).join('\n')
    expect(text).toContain('stehen nicht im')
    expect(text).toMatch(/pmh_owner/)
  })

  test('kommt ohne Containerwerte zurecht', () => {
    expect(() => kennwortKonfliktHinweise(undefined)).not.toThrow()
  })
})

describe('fassePruefungenZusammen', () => {
  test('alles da', () => {
    const r = fassePruefungenZusammen([
      { name: 'bun', ok: true },
      { name: 'docker', ok: true },
    ])
    expect(r.allesDa).toBe(true)
    expect(r.fehlend).toHaveLength(0)
    expect(r.zeilen[0]).toMatch(/^ok\s+bun$/u)
  })

  test('ein Fehlendes wird benannt, mit Hinweis', () => {
    const r = fassePruefungenZusammen([
      { name: 'bun', ok: true },
      { name: 'docker', ok: false, hinweis: 'https://docs.docker.com/get-docker/' },
    ])
    expect(r.allesDa).toBe(false)
    expect(r.fehlend).toHaveLength(1)
    expect(r.zeilen[1]).toContain('FEHLT')
    expect(r.zeilen[1]).toContain('docs.docker.com')
  })
})

describe('Abgleich mit .env.example und docker-compose.yml', () => {
  test('die Vorlage setzt alle Geheimnisse, die der Installer erzeugt', () => {
    // **Der Abgleich, der ein Auseinanderlaufen findet.** Setzt der Installer
    // einen Namen, den die Vorlage nicht kennt, wird er nie geschrieben —
    // `setzeWerte` fügt keine Zeilen hinzu. Der Fehler wäre still.
    const gesetzt = new Set(gesetzteNamen(VORLAGE))
    for (const name of GEHEIMNIS_NAMEN) {
      expect(gesetzt.has(name), `${name} fehlt in .env.example`).toBe(true)
    }
  })

  test('die Vorlage setzt auch die abgeleiteten Werte', () => {
    const gesetzt = new Set(gesetzteNamen(VORLAGE))
    for (const name of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'PMH_TEST_DATABASE_URL', 'REDIS_URL']) {
      expect(gesetzt.has(name), `${name} fehlt in .env.example`).toBe(true)
    }
  })

  test('der Stapel benutzt die Geheimnisse, die der Installer erzeugt', () => {
    // Erwartet das Compose-File eine Variable, die der Installer nicht setzt,
    // startet der Stapel mit einem leeren Wert — und das ist still.
    //
    // **Eine Ausnahme, und sie ist begründet:** `PMH_MASTER_KEY` kommt in
    // `docker-compose.yml` **nicht** vor. Gemessen am 13.10.2026:
    //
    //     Select-String -Path docker-compose.yml -Pattern PMH_MASTER_KEY  → kein Treffer
    //
    // Der Grund ist ein Befund der Aufsicht (**B14**): die
    // Umschlagverschlüsselung existiert als **Schema** (`value_cipher`,
    // `wrapped_key` in der Migration), aber **nicht als Code** — es gibt keine
    // Stelle, die den Schlüssel liest. Er wird vom Installer erzeugt, damit eine
    // spätere Fassung ihn vorfindet, und **nicht** vom Stapel gebraucht.
    //
    // Diese Ausnahme steht hier **namentlich** und nicht als stille Lücke: kommt
    // ein weiteres Geheimnis dazu, das der Stapel nicht kennt, wird die Prüfung rot.
    const AUSNAHMEN = new Set(['PMH_MASTER_KEY'])
    for (const name of GEHEIMNIS_NAMEN) {
      if (AUSNAHMEN.has(name)) continue
      expect(COMPOSE.includes(name), `${name} kommt in docker-compose.yml nicht vor`).toBe(true)
    }
  })

  test('die Ausnahme ist nicht gewachsen — nur EIN Geheimnis fehlt im Stapel', () => {
    // **Warum das ausdrücklich geprüft wird.** Eine Ausnahmeliste wächst still:
    // wer eine Prüfung rot sieht, trägt den Namen ein, und nach drei Monaten ist
    // die Liste länger als die Regel. Dieser Fall hält die Liste kurz.
    const fehlend = GEHEIMNIS_NAMEN.filter((n) => !COMPOSE.includes(n))
    expect(fehlend).toEqual(['PMH_MASTER_KEY'])
  })

  test('jedes Geheimnis ist in der Vorlage eine echte Zeile, kein Kommentar', () => {
    for (const name of GEHEIMNIS_NAMEN) {
      expect(new RegExp(`^${name}=`, 'mu').test(VORLAGE), `${name} ist auskommentiert`).toBe(true)
    }
  })

  test('kein Geheimnis steht mit einem echten Wert in der Vorlage', () => {
    // **Die Sicherheitsprüfung.** `.env.example` wird versioniert. Stünde dort
    // ein echter Schlüssel, wäre er im Repository — und damit in jeder Kopie.
    const OHNE_PLATZHALTER = new Set(['PMH_MASTER_KEY'])
    for (const name of GEHEIMNIS_NAMEN) {
      // **`[^\r\n]*` statt `(.*)`.** Dieselbe CRLF-Falle: `.` matcht kein `\r`,
      // und auf Windows liefert die Vorlage CRLF.
      const treffer = new RegExp(`^${name}=([^\\r\\n]*)`, 'mu').exec(VORLAGE)
      expect(treffer).not.toBeNull()
      const wert = (treffer?.[1] ?? '').trim()
      if (OHNE_PLATZHALTER.has(name)) {
        // **Leer, mit Absicht.** `PMH_MASTER_KEY` wird vom Installer erzeugt.
        // Stünde hier ein Beispielwert, würde er von jemandem übernommen — und
        // ein geteilter Hauptschlüssel ist kein Schlüssel. Die Zeile ist leer,
        // damit der Name sichtbar ist und der Wert trotzdem fehlt.
        expect(wert).toBe('')
        continue
      }
      // Ein Platzhalter ist erlaubt, ein zufällig aussehender Wert nicht.
      expect(wert).toMatch(/bitte-aendern|example|changeme|platzhalter/iu)
    }
  })

  test('der Master-Key ist leer, damit ihn niemand versehentlich uebernimmt', () => {
    // **Der Grund steht im Klartext.** Ein Beispielwert in einer versionierten
    // Datei wird kopiert. Bei einem Hauptschlüssel wäre das ein geteilter
    // Hauptschlüssel — und niemand würde es bemerken, weil alles funktioniert.
    expect(/^PMH_MASTER_KEY=[^\r\n]*$/mu.test(VORLAGE)).toBe(true)
    expect(/^PMH_MASTER_KEY=$/mu.test(VORLAGE.replace(/\r/gu, ''))).toBe(true)
  })
})
