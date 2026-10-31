/**
 * Die beiden Texte des Plugins: der Prompt-Abschnitt und der Skill-Rumpf.
 *
 * **Warum zwei und nicht einer.** Der Abschnitt wirkt in **jeder** Antwort und muß deshalb
 * kurz sein — er wird pro Anfrage bezahlt. Der Skill wird **geladen**, wenn jemand ihn
 * aufruft, und darf die Beispiele und die Prüfwege tragen. Beide sagen dasselbe; nur
 * einmal als Regel und einmal als Anleitung.
 *
 * @module @prometheus-harness/ponytail/text
 */

import type { Modus } from './modus.ts'

/** Was die drei Stufen voneinander unterscheidet. */
const STUFEN: Readonly<Record<Exclude<Modus, 'off'>, string>> = {
  lite: 'Nur offensichtlichen Ballast weglassen. Bestehendes bleibt, wo es ist.',
  full: 'Die Leiter ganz gehen. Das Minimum, das funktioniert.',
  ultra: 'Nichts, was nicht gebraucht wird — und in einem Satz sagen, was weggelassen wurde.',
}

/** Der Satz, der in jeder Stufe gilt. */
const KERN = `Schreibe nur, was die Aufgabe wirklich braucht. Lies zuerst den Code, den die Änderung berührt, und verfolge den echten Datenfluß — faul bei der Lösung, nie beim Lesen.

Leiter — halt bei der ersten Stufe, die trägt:
1. Muss das überhaupt existieren? (YAGNI)
2. Steht es schon im Repo? (Helfer, Typ, Muster)
3. Tut es die Standardbibliothek?
4. Tut es die Plattform?
5. Tut es eine installierte Abhängigkeit?
6. Geht es in einer Zeile?
7. Erst dann: das Minimum, das funktioniert.

Nicht verhandelbar: Validierung an Vertrauensgrenzen, Umgang mit Datenverlust, Sicherheit, Barrierefreiheit. Logik mit Verzweigung, Schleife, Parser, Geld oder Sicherheit hinterläßt einen kleinen Test.

Jede Antwort endet mit dem, was ausgelassen wurde, und dem Risiko, das bleibt.`

/**
 * Der Prompt-Abschnitt für eine Stufe.
 *
 * @param modus - die Stufe; `off` ergibt einen leeren Text
 * @returns der Text, oder `''` bei `off`
 */
export function promptText(modus: Modus): string {
  if (modus === 'off') return ''
  return `## Ponytail — ${modus}\n\n${KERN}\n\nStufe ${modus}: ${STUFEN[modus]}`
}

/**
 * Die Kurzbeschreibung, an der das Modell den Skill erkennt.
 *
 * @param modus - die Stufe
 * @returns der Beschreibungstext
 */
export function skillBeschreibung(modus: Modus): string {
  return `Die faule Senior-Lösung: die kleinste Änderung, die die Aufgabe wirklich löst. `
    + `Leiter von „muß das existieren?" bis „das Minimum, das funktioniert", `
    + `ohne Abstriche an Validierung, Fehlerbehandlung, Sicherheit und Barrierefreiheit. `
    + `Stufe: ${modus}.`
}

/**
 * Der Skill-Rumpf.
 *
 * @param modus - die Stufe, mit der der Rumpf antritt
 * @returns das Markdown
 */
export function skillInhalt(modus: Modus): string {
  return `# Ponytail (${modus})

${KERN}

## Warum das nicht „weniger Tokens" heißt

Die Regel ist nicht *möglichst klein*, sondern *nur was der Auftrag braucht*. Der Code wird
klein, weil er notwendig ist — nicht, weil Zeichen gespart wurden. Wer Validierung, Fehler,
Sicherheit oder Barrierefreiheit streicht, hat nicht Ponytail gemacht, sondern den Auftrag
verfehlt.

## Vor dem Schreiben

1. **Lesen.** Welche Dateien berührt die Änderung? Wie fließt das Geld, das Bild, die Sitzung?
2. **Suchen.** Gibt es den Helfer, den Typ, das Muster schon? Suchen ist billiger als schreiben.
3. **Erst dann die Leiter.** Die Stufe, die trägt, gewinnt — nicht die, die am meisten kann.

## Was nie wegfällt

| Bereich | Pflicht |
|---|---|
| Vertrauensgrenze | Eingaben prüfen, bevor sie wirken |
| Datenverlust | Schreiben ist atomar oder es ist kein Schreiben |
| Sicherheit | Rechte, Geheimnisse, Injection |
| Barrierefreiheit | Fokus, Rolle, Tastatur |
| Logik | Ein kleiner Test bei Verzweigung, Schleife, Parser, Geld, Sicherheit |

## Am Ende jeder Antwort

Ein bis drei Zeilen: was ausgelassen wurde, was nicht geprüft wurde, welches Risiko bleibt.
Wer das wegläßt, hat gespart, ohne es zu sagen.

## Prüfen statt bauen

- **Review** — den geänderten Code wie der Bereitschaftshabende lesen: Fehler, Sicherheit,
  echte Last, ungetestete Pfade, langsame Wege, und was gestrichen gehört. Jeder Befund sagt:
  was der Code tut, was schiefgeht, wie man es behebt, was passiert, wenn man es läßt.
- **Audit** — dasselbe über das ganze Repo, das Wichtigste zuerst. Erst die Karte (Einstiege,
  Datenwege, erwartete Last), dann der Befund.
- **Schuld** — jede Marke \`shortcut:\` im Code sammeln, damit aus „später" kein „nie" wird.

## Stufen

| Stufe | Bedeutung |
|---|---|
| \`off\` | Aus. Kein Abschnitt, kein Skill. |
| \`lite\` | Nur offensichtlichen Ballast weglassen. |
| \`full\` | Die Leiter ganz. Vorgabe. |
| \`ultra\` | Nichts, was nicht gebraucht wird — und es sagen. |
`
}
