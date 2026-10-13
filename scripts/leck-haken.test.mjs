/**
 * `scripts/leck-haken.mjs` — die Prüfung des Hakens (E2).
 *
 * ## Warum beide Zweige gefahren werden
 *
 * Auf diesem Rechner ist **gitleaks nicht installiert** — der „gefunden"-Zweig
 * läuft hier also **nie** von selbst. Genau das ist die Gefahr: ein Haken, dessen
 * entscheidender Zweig nur auf einem anderen Rechner läuft, ist hier ungeprüft.
 *
 * Deshalb ist die Werkzeugsuche ein **Einschub** (`finde`): die Prüfung fährt
 * beide Welten — mit und ohne Werkzeug —, ohne etwas zu installieren.
 *
 * **Und der wichtigste Fall:** fehlt das Werkzeug, muß die Ausgabe **sagen**, daß
 * nichts geprüft wurde. Ein grüner Haken ohne Werkzeug ist kein Beweis, sondern die
 * Abwesenheit eines Beweises.
 */

import { describe, expect, test } from 'bun:test'
import { INSTALLATION, WERKZEUG, findeWerkzeug, fuehreAus } from './leck-haken.mjs'

/** Fängt die Ausgabe ein. */
function fange(argumente, finde) {
  const aus = []
  const code = fuehreAus(argumente, process.env, (t) => aus.push(t), finde)
  return { code, text: aus.join('') }
}

/** Ein Werkzeug, das es gibt. */
const da = () => '8.28.0'
/** Eines, das es nicht gibt. */
const fehlt = () => undefined

describe('Ohne Werkzeug: es wird GESAGT, nicht verschwiegen', () => {
  test('die Ausgabe nennt das Werkzeug, den Installationsweg und das Nichtgeprüftsein', () => {
    const { code, text } = fange(['pruefen'], fehlt)
    expect(code).toBe(0)
    expect(text).toContain('NICHT GEPRÜFT')
    expect(text).toContain(WERKZEUG)
    for (const zeile of INSTALLATION) expect(text).toContain(zeile)
  })

  test('und sie sagt den Satz, auf den es ankommt', () => {
    // Ein grüner Haken ohne Werkzeug darf nicht wie ein Beweis aussehen.
    const { text } = fange(['pruefen'], fehlt)
    expect(text).toContain('kein Beweis')
    expect(text).toContain('Abwesenheit eines Beweises')
  })

  test('sie verweist auf die ANDERE Prüfung — die schärfere für diesen Rechner', () => {
    const { text } = fange(['pruefen'], fehlt)
    expect(text).toContain('leck-pruefung.mjs')
    expect(text).toContain('ECHTEN Werte')
  })

  test('Exit 0 — ein fehlendes Werkzeug blockiert keinen Commit', () => {
    // **Die Entwurfsentscheidung, geprüft.** Ein Haken, der ohne Werkzeug alles
    // abweist, wird nach dem dritten Mal mit `--no-verify` umgangen — und dann
    // schützt er gar nichts mehr.
    expect(fange(['pruefen'], fehlt).code).toBe(0)
  })
})

describe('Mit Werkzeug', () => {
  test('die Einbindung wird erklärt — mit core.hooksPath', () => {
    const { code, text } = fange(['haken'], da)
    expect(code).toBe(0)
    expect(text).toContain('git config core.hooksPath .githooks')
    // **Und warum nicht `.git/hooks/`.** Das wird nicht versioniert; ein Haken dort
    // gilt nur hier und ist beim nächsten Klon weg.
    expect(text).toContain('nicht versioniert')
  })

  test('die Einbindung nennt die Fassung, wenn es das Werkzeug gibt', () => {
    expect(fange(['haken'], da).text).toContain('8.28.0')
    expect(fange(['haken'], fehlt).text).toContain('NICHT installiert')
  })

  test('findeWerkzeug gibt für ein nicht vorhandenes Programm undefined', () => {
    // **Der echte Aufruf, nicht der Einschub.** `gitleaks` ist hier nicht
    // installiert, also ist das der gemessene Ist-Zustand dieses Rechners.
    expect(findeWerkzeug('gitleaks-gibt-es-sicher-nicht-12345')).toBeUndefined()
  })

  test('ohne Befehl gibt es Exit 1 und den Aufruf', () => {
    const { code, text } = fange([], da)
    expect(code).toBe(1)
    expect(text).toContain('Aufruf:')
  })
})

describe('Der Ist-Zustand dieses Rechners', () => {
  test('die Werkzeugsuche antwortet mit Zeichenkette oder undefined — nie mit Unsinn', () => {
    // **Kein Fall, der in jedem Fall bestanden hätte.** Der erste Entwurf hier war
    // leer (`if undefined … else …` — beides grün). Ein solcher Fall ist keine
    // Prüfung. Dieser prüft den **Vertrag**: kein Wurf, kein leerer Text.
    const fassung = findeWerkzeug()
    expect(fassung === undefined || typeof fassung === 'string').toBe(true)
    if (typeof fassung === 'string') expect(fassung.length).toBeGreaterThan(0)
    // **Was auf diesem Rechner gilt, steht gemessen im Nachweis**
    // (`docs/status/leck-haken.md`) — nicht als Behauptung in einer Prüfung, die
    // beim Installieren des Werkzeugs umfallen würde.
  })
})
