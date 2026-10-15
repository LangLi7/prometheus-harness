/**
 * Prüfungen für `scripts/secret-scan.mjs`.
 *
 * Der wichtigste Fall steht **zuerst**: der Scanner darf `redis://127.0.0.1:6379`
 * **nicht** melden. Genau das hat `leck-pruefung.mjs` getan, weil es nur auf die
 * Länge sah — ein Fehlalarm, der einen echten Fund entwertet.
 */

import { describe, expect, test } from 'bun:test'

import { berichte, entropie, finde, fingerabdruck, istPlatzhalter, markenGrund, siehtNachGeheimnisAus } from './secret-scan.mjs'

describe('Der Fehlalarm, der nicht zurückkommen darf', () => {
  test('eine Adresse OHNE Zugangsdaten ist kein Geheimnis', () => {
    expect(finde('REDIS_URL=redis://127.0.0.1:6379', 'probe')).toHaveLength(0)
    expect(finde('DATABASE_URL=postgres://127.0.0.1:5432/pmh', 'probe')).toHaveLength(0)
  })

  test('dieselbe Adresse MIT Zugangsdaten ist eines', () => {
    const funde = finde('DATABASE_URL=postgres://pmh_app:echtesKennwort123@127.0.0.1:5432/pmh', 'probe')
    expect(funde.length).toBeGreaterThan(0)
    expect(funde[0]?.art).toBe('Verbindung mit Zugangsdaten')
  })

  test('Platzhalter werden nicht gemeldet', () => {
    for (const p of ['bitte-aendern-admin', 'CHANGEME', 'your-token-here', 'xxxxxxxx', '12345678']) {
      expect({ p, platzhalter: istPlatzhalter(p) }).toEqual({ p, platzhalter: true })
    }
    expect(finde("PMH_APP_PASSWORD='bitte-aendern-app'", 'probe')).toHaveLength(0)
  })
})

describe('Was gefunden werden MUSS', () => {
  test('bekannte Formen', () => {
    // **Ein echter Schlüssel, nicht AWS' Beispielschlüssel.** `AKIAIOSFODNN7EXAMPLE`
    // ist der Schlüssel aus AWS' eigener Dokumentation und enthält „EXAMPLE" — er
    // wird von der Platzhalterregel **absichtlich** nicht gemeldet. Der nächste
    // Test hält beide Seiten dieser Entscheidung fest.
    expect(finde('AKIAIOSFODNN7REALKEY', 'probe')[0]?.art).toBe('AWS-Zugangsschluessel')  // pmh-scan: allow - erfundene Testvorlage
    expect(finde('ghp_0123456789abcdefghijklmnopqrstuvwxyz', 'probe')[0]?.art).toBe('GitHub-Token')  // pmh-scan: allow - erfundene Testvorlage
    expect(finde('-----BEGIN RSA PRIVATE KEY-----', 'probe')[0]?.art).toBe('privater Schluessel')  // pmh-scan: allow - erfundene Testvorlage
  })

  test('AWS\' eigener Beispielschluessel wird NICHT gemeldet — und warum', () => {
    // Er enthält „EXAMPLE", und „example" steht auf der Platzhalterliste. Das ist
    // Absicht: dieser Wert steht in jeder AWS-Anleitung, er ist kein Geheimnis.
    // Die Kehrseite wird hier benannt, nicht verschwiegen: ein **echter**
    // Schlüssel, der zufällig „example" enthält, würde ebenfalls durchfallen.
    // Deshalb hängt die Entropieprüfung nicht an dieser Liste.
    expect(finde('AKIAIOSFODNN7EXAMPLE', 'probe')).toHaveLength(0)
    expect(istPlatzhalter('AKIAIOSFODNN7EXAMPLE')).toBe(true)
  })

  test('eine Zuweisung mit hoher Entropie', () => {
    // Ein echter 32-Byte-Schluessel als base64url — kein Platzhalter.
    const wert = 'kR7pQ2mX9vT4bN1sL6wZ3yH8jC5dF0gA2eU4iO7aS1k'  // pmh-scan: allow - erfundene Testvorlage, kein echtes Geheimnis
    const funde = finde(`PMH_MASTER_KEY='${wert}'`, 'probe')
    expect(funde.map((f) => f.art)).toContain('Zuweisung mit hoher Entropie')
  })

  test('Fließtext ist kein Geheimnis', () => {
    expect(finde('Die Migration laeuft jetzt als eigener Prozess und das ist gut so.', 'probe')).toHaveLength(0)
  })
})

describe('Die Entropie unterscheidet Zufall von Sprache', () => {
  test('Zufall liegt über Sprache', () => {
    const zufall = entropie('kR7pQ2mX9vT4bN1sL6wZ3yH8jC5dF0gA2eU4iO7aS1k')
    const sprache = entropie('die migration laeuft jetzt als eigener prozess')
    expect(zufall).toBeGreaterThan(sprache)
    expect(zufall).toBeGreaterThan(3.5)
  })

  test('Wiederholung und reine Ziffern fallen durch', () => {
    expect(siehtNachGeheimnisAus('aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false)
    expect(siehtNachGeheimnisAus('1234567890123456789012345')).toBe(false)
  })

  test('zu kurz ist kein Geheimnis', () => {
    expect(siehtNachGeheimnisAus('kurz')).toBe(false)
  })
})

describe('Die Marke befreit nur MIT Begruendung', () => {
  const wert = 'ghp_0123456789abcdefghijklmnopqrstuvwxyz'

  test('ein gueltiger Grund befreit — englisch und deutsch', () => {
    expect(markenGrund(`x = '${wert}'  // pmh-scan: allow — dokumentierter Beispielwert`)).toBe(
      'dokumentierter Beispielwert',
    )
    expect(markenGrund(`x = '${wert}'  # pmh-scan: erlaubt - Beispiel aus der Anleitung`)).toBe(
      'Beispiel aus der Anleitung',
    )
  })

  test('eine zu kurze „Begruendung" befreit NICHT', () => {
    // Genau das soll die Marke verhindern: eine stille Ausnahme mit einem
    // Buchstaben daneben. Ohne Grund bleibt der Fund ein Fund.
    expect(markenGrund(`x = '${wert}'  // pmh-scan: allow — ok`)).toBeUndefined()
    expect(markenGrund(`x = '${wert}'  // pmh-scan: allow — x`)).toBeUndefined()
    expect(markenGrund(`x = '${wert}'  // pmh-scan: allow`)).toBeUndefined()
    expect(finde(`x = '${wert}'  // pmh-scan: allow — ok`, 'p').filter((f) => f.grund === undefined)).toHaveLength(1)
  })

  test('befreit heisst NICHT unsichtbar', () => {
    const text = `const BEISPIEL = '${wert}'  // pmh-scan: allow — Beispielwert aus der Anleitung`
    const funde = finde(text, 'probe.mjs')
    const zeilen = []
    const ohne = berichte(funde, (t) => zeilen.push(t))
    const ausgabe = zeilen.join('')
    // Es bleibt kein Fund ohne Begruendung …
    expect(ohne).toBe(0)
    // … und die Befreiung steht MIT Grund in der Ausgabe, statt zu verschwinden.
    expect(ausgabe).toContain('Befreit durch Marke')
    expect(ausgabe).toContain('Beispielwert aus der Anleitung')
    expect(ausgabe).not.toContain(wert)
  })
})

describe('Kein Wert verlaesst die Ausgabe', () => {
  test('der Bericht nennt Fingerabdruck und Ort, aber NIE den Wert', () => {
    const wert = 'ghp_0123456789abcdefghijklmnopqrstuvwxyz'
    const funde = finde(`token = ${wert}`, 'probe.txt')
    const zeilen = []
    berichte(funde, (t) => zeilen.push(t))
    const ausgabe = zeilen.join('')
    expect(ausgabe).toContain(fingerabdruck(wert))
    expect(ausgabe).toContain('probe.txt')
    // Die eigentliche Behauptung: der Wert steht NICHT in der Ausgabe.
    expect(ausgabe).not.toContain(wert)
  })
})
