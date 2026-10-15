/**
 * Die Regeln des Wächters — **rein**: kein Netz, kein Modell, kein Dateisystem.
 *
 * ## Warum das erste, was geprüft wird, KEIN Modell braucht
 *
 * Ein Geheimnis zu erkennen ist in fast allen Fällen eine **Formfrage**: `sk-or-v1-` gefolgt von 64
 * Zeichen ist ein Schlüssel, und zwar mit Gewißheit. Ein Modell dafür zu bezahlen wäre langsamer,
 * teurer und **unsicherer** — es könnte „harmlos" sagen. Was eine Regel entscheiden kann, entscheidet
 * die Regel.
 *
 * Das Modell kommt erst dort zum Zug, wo die Form **nichts** verrät: bei einem Geheimnis, das
 * keiner bekannten Form folgt und das niemand eingetragen hat. Das ist Stufe 2 und steht in
 * `index.ts`.
 *
 * ## Warum ein Fund NIE den Wert trägt
 *
 * Ein Wächter, der meldet „hier steht `sk-or-v1-ab12…`", hat das Geheimnis **selbst** ausgegeben —
 * in ein Protokoll, in eine Anzeige, in eine Fehlermeldung. Deshalb trägt ein
 * {@link Treffer} nur **wo** (Stelle), **wie lang** (Länge) und **welche Regel**. Wer den Wert
 * braucht, hat ihn schon: er steht im geprüften Text.
 *
 * ## Warum es KEINE Regel für „lange Zufallswerte" gibt
 *
 * Das war der naheliegende nächste Gedanke — und er ist falsch. Eine Prüfsumme, ein
 * Git-Commit-Hash (40 Hexzeichen), eine Sitzungskennung: alles sieht aus wie ein Geheimnis. Eine
 * Regel, die bei jedem Git-Hash anschlägt, wird nach zwei Tagen **abgeschaltet** — und dann findet
 * sie auch das echte Geheimnis nicht mehr. Ein Wächter, der zu oft ruft, ist kein Wächter.
 *
 * @module @prometheus-harness/guard/regeln
 */

/** Ein Fund — **niemals** der Wert, immer nur wo, wie lang und wonach. */
export interface Treffer {
  /** Der Name der Regel, die angeschlagen hat. */
  readonly regel: string
  /** An welcher Stelle im Text der Fund beginnt (0-basiert). */
  readonly stelle: number
  /** Wie lang der Fund ist. */
  readonly laenge: number
  /**
   * Wie der Wert heißt — **nur** bei einem eingetragenen Wert (`OPENROUTER_API_KEY`).
   *
   * **Warum der Name erlaubt ist und der Wert nicht.** Der Name hilft dem Menschen („ach, der
   * Schlüssel für OpenRouter"), und er ist kein Geheimnis. Der Wert wäre eines.
   */
  readonly bezeichnung?: string
}

/** Eine Regel: ein Muster und der Grund, warum es anschlägt. */
export interface Regel {
  /** Kurzname, stabil — er steht in Meldungen und Prüfungen. */
  readonly name: string
  /** Was sie findet, in einem Satz. */
  readonly findet: string
  /** Das Muster als **Quelle**, nicht als fertiges Objekt — siehe {@link findeMitRegeln}. */
  readonly muster: string
  /** Die Schalter für das Muster (`g` immer). */
  readonly schalter: string
}

/**
 * Die Regeln.
 *
 * **Alle Muster stammen aus echten Formen** — nicht ausgedacht, sondern die Schreibweise der
 * Anbieter, wie sie in dieser Umgebung vorkommen (gemessen am 15.10.2026 im Schlüsselspeicher).
 */
export const REGELN: readonly Regel[] = [
  {
    name: 'privater-schluessel',
    findet: 'Ein privater Schlüssel im PEM-Format',
    muster: '-----BEGIN [A-Z ]*PRIVATE KEY-----',
    schalter: 'g',
  },
  {
    name: 'schluessel-form-sk',
    findet: 'Ein Schlüssel der Form sk-… (OpenAI, OpenRouter, Anthropic, Stripe)',
    // Die Vorsilben der Anbieter stehen ausdrücklich davor, damit die Form enger wird und seltener
    // falsch anschlägt.
    muster: '\\b(?:sk|rk|pk)-(?:or-v1-|ant-|proj-|live-|test-|admin-)?[A-Za-z0-9_-]{20,}',
    schalter: 'g',
  },
  {
    name: 'schluessel-form-gsk',
    findet: 'Ein Schlüssel der Form gsk_… (Groq)',
    muster: '\\bgsk_[A-Za-z0-9]{20,}',
    schalter: 'g',
  },
  {
    name: 'kennung-aws',
    findet: 'Eine AWS-Kennung (AKIA…/ASIA…)',
    muster: '\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b',
    schalter: 'g',
  },
  {
    name: 'schluessel-form-aiza',
    findet: 'Ein Google-Schlüssel (AIza…)',
    muster: '\\bAIza[0-9A-Za-z_-]{35}\\b',
    schalter: 'g',
  },
  {
    name: 'kennung-github',
    findet: 'Ein GitHub-Token (ghp_… und Verwandte)',
    muster: '\\bgh[pousr]_[A-Za-z0-9]{36,}',
    schalter: 'g',
  },
  {
    name: 'kennung-slack',
    findet: 'Ein Slack-Token (xox…)',
    muster: '\\bxox[abprs]-[A-Za-z0-9-]{10,}',
    schalter: 'g',
  },
  {
    name: 'kennung-jwt',
    findet: 'Ein JSON-Web-Token (drei durch Punkte getrennte Teile)',
    // `eyJ` ist der Anfang von `{"` in Base64 — deshalb beginnen fast alle JWT so.
    muster: '\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}',
    schalter: 'g',
  },
  {
    name: 'verbindung-mit-passwort',
    findet: 'Eine Verbindungsadresse mit Paßwort (postgres://benutzer:paßwort@…)',
    // Das ist der Fall, der in dieser Arbeit wirklich vorkam: die Datenbankadresse in `.env`.
    muster: '\\b[a-z][a-z0-9+.-]*://[^:@/\\s]+:[^@/\\s]{3,}@',
    schalter: 'g',
  },
  {
    name: 'feld-mit-geheimnisnamen',
    findet: 'Eine Stelle, die ihr Geheimnis SELBST so nennt (secret:, password:, token:, api_key:)',
    /**
     * **Warum diese Regel die Lücke schließt.** Manche Geheimnisse haben keine erkennbare Form —
     * eine 43 Zeichen lange Zeichenkette aus Buchstaben und Ziffern sieht aus wie alles mögliche.
     * Aber der Text **sagt selbst**, was sie ist: `secret:`, `password:`, `token:`.
     *
     * Das ist kein Raten nach einer Form, sondern **Lesen einer Aussage**.
     *
     * ## Der Fehler, der hier fast stehengeblieben wäre
     *
     * Zuerst stand am Anfang `\b`. Das verlangt eine **Wortgrenze** — und `_` **ist** ein
     * Wortzeichen. Bei `secret: …` (Leerzeichen davor) griff die Regel deshalb, bei
     * `FIRECRAWL_FALLBACK_API_KEY: …` **nicht**: dort steht vor `API_KEY` ein `_`, also keine
     * Wortgrenze. Das ist der **häufigste** Fall überhaupt, und die Einzelprüfung mit `secret: …`
     * war trotzdem grün.
     *
     * Deshalb jetzt `(?<![A-Za-z0-9])`: es verbietet einen **Buchstaben oder eine Ziffer** davor,
     * erlaubt aber `_`. Und der Name darf davorstehen (`[A-Za-z0-9]*_`), damit `…_API_KEY`,
     * `…_TOKEN` und `…_SECRET` alle greifen.
     */
    muster:
      '(?<![A-Za-z0-9])(?:[A-Za-z0-9]*_)?(?:secret|key|token|password|passwort|passwd|bearer|apikey)\\s*[:=]\\s*["\']?[A-Za-z0-9_+/=.-]{12,}',
    schalter: 'gi',
  },
]

/**
 * Sucht alle Funde im Text.
 *
 * ## Warum die Muster hier erst zu RegExp **gemacht** werden
 *
 * Ein `RegExp` mit dem Schalter `g` **merkt sich**, wo es zuletzt war (`lastIndex`). Wird dasselbe
 * Objekt zweimal benutzt, findet der zweite Lauf nichts mehr — oder erst wieder ab der alten
 * Stelle. Das ist ein Fehler, der **nur beim zweiten Aufruf** auftritt und deshalb in einer
 * einzelnen Prüfung unsichtbar bleibt. Ein frisches Objekt je Lauf schließt ihn aus.
 *
 * @param text - der zu prüfende Text
 * @param regeln - abweichende Regeln; Vorgabe: {@link REGELN}
 * @returns die Funde, nach Stelle geordnet
 */
export function findeMitRegeln(text: string, regeln: readonly Regel[] = REGELN): Treffer[] {
  const funde: Treffer[] = []
  for (const regel of regeln) {
    const suche = new RegExp(regel.muster, regel.schalter)
    for (const treffer of text.matchAll(suche)) {
      const stelle = treffer.index
      if (stelle === undefined) continue
      funde.push({ regel: regel.name, stelle, laenge: treffer[0].length })
    }
  }
  return funde.sort((a, b) => a.stelle - b.stelle)
}

/**
 * Sucht **eingetragene** Werte im Text.
 *
 * **Warum das die schärfste Regel ist.** Eine Form kann man umgehen; einen Wert, den man kennt,
 * nicht. Wer die Schlüssel seines Rechners eingetragen hat, findet sie **immer** — auch in einer
 * Form, die keine Regel kennt.
 *
 * **Werte unter 12 Zeichen werden übersprungen.** Ein kurzer Wert (`de`, `127.0.0.1`, `admin`)
 * stünde in jedem zweiten Text und machte den Wächter unbrauchbar. Und ein Wert, der kürzer als 12
 * Zeichen ist, ist kein Geheimnis.
 *
 * @param text - der zu prüfende Text
 * @param werte - die eingetragenen Werte **mit Namen**
 * @returns die Funde, nach Stelle geordnet
 */
export function findeBekannte(
  text: string,
  werte: readonly { readonly name: string; readonly wert: string }[],
): Treffer[] {
  const funde: Treffer[] = []
  for (const { name, wert } of werte) {
    if (wert.trim().length < 12) continue
    let ab = 0
    for (;;) {
      const stelle = text.indexOf(wert, ab)
      if (stelle === -1) break
      funde.push({ regel: 'bekannter-wert', stelle, laenge: wert.length, bezeichnung: name })
      ab = stelle + wert.length
    }
  }
  return funde.sort((a, b) => a.stelle - b.stelle)
}

/**
 * Ersetzt jeden Fund durch `***` — **dieselbe Länge**, damit Stellen im Text stimmen bleiben.
 *
 * **Warum die Länge erhalten bleibt.** Der entschärfte Text wird weiterverarbeitet (angezeigt,
 * protokolliert, gezählt). Wäre er kürzer, verschöben sich alle nachfolgenden Stellen — und die
 * Fundstellen, die der Befund nennt, zeigten auf etwas anderes als das, was gemeint war.
 *
 * @param text - der Text
 * @param funde - die zu ersetzenden Stellen, **nach Stelle geordnet und ohne Überschneidung**
 * @returns der entschärfte Text
 */
export function entschaerfeText(text: string, funde: readonly Treffer[]): string {
  if (funde.length === 0) return text
  let ergebnis = ''
  let gelesen = 0
  for (const fund of funde) {
    if (fund.stelle < gelesen) continue
    ergebnis += text.slice(gelesen, fund.stelle)
    ergebnis += '*'.repeat(fund.laenge)
    gelesen = fund.stelle + fund.laenge
  }
  return ergebnis + text.slice(gelesen)
}
