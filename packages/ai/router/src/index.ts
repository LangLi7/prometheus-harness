/**
 * `@prometheus-harness/router` — die **Auswahl**.
 *
 * ## Die Lücke, die dieses Paket schließt
 *
 * Am 15.10.2026 gab es drei Teile, die zusammen einen Router ergeben — und keinen Router:
 *
 * | Teil | Was er liefert |
 * |---|---|
 * | `capabilities` | die **Registratur**: wer eine Fähigkeit nennt, und `waehle(faehigkeit)` |
 * | `ranking` | die **Rangfolge**: wer zuerst zu nehmen ist, mit Begründung |
 * | `settings` | die **Wahl des Endnutzers** |
 *
 * `Faehigkeiten.waehle()` nimmt den **ersten einsatzbereiten** Anbieter in
 * **Eintragsreihenfolge** — also in der Reihenfolge, in der jemand `anbieten()` gerufen hat. Das
 * ist eine Reihenfolge **im Quelltext**, keine Bewertung. Die gerechnete Rangfolge aus `ranking`
 * hatte bis hierher **keinen Aufrufer**: sie war eine Liste, die niemand las.
 *
 * Dieses Paket ist der Aufrufer.
 *
 * ## Die Reihenfolge der beiden Fragen
 *
 * | # | Frage | Warum |
 * |---|---|---|
 * | 1 | Hat der Endnutzer **ausdrücklich gewählt** — und ist die Wahl bereit? | Eine ausdrückliche Wahl ist eine Entscheidung eines Menschen. Sie schlägt jede Rechnung |
 * | 2 | Was sagt die **Rangfolge**? | Erst hier entscheidet die Rechnung: Verdrahtung, gemessener Befund, Preis |
 *
 * **Warum eine nicht bereite Wahl nicht stillschweigend übergangen wird.** Wer `zai` wählt und
 * einen Schlüssel vergessen hat, bekäme sonst `openrouter` — und würde nie erfahren, daß seine
 * Wahl nicht griff. Der Grund steht deshalb in {@link Wahl.verworfen}, und die Wahl **kommt
 * zustande**; sie ist nur nicht die gewünschte, und das ist sichtbar.
 *
 * ## Kein stiller Rückfall, kein Raten
 *
 * Ist keine Wahl möglich, **wirft** die Funktion — mit **allen** Gründen, je Kandidat einer. Die
 * Alternative wäre, „irgendeinen" Anbieter zu nehmen; ein Urteil, das niemand gefällt hat, sieht
 * aber aus wie eine Antwort. Dieselbe Regel wie in `capabilities`.
 *
 * ## Kein Netzzugriff
 *
 * `bereit(faehigkeit)` ist eine Auskunft **des Anbieters** — „habe ich einen Schlüssel, ein Modell,
 * eine Verbindung". Dieses Paket ruft kein Modell auf und liest keine Datei.
 *
 * @module @prometheus-harness/router
 */

import type { Anbieter, Faehigkeit, Faehigkeiten } from '@prometheus-harness/capabilities'
import { NAME_DER_FAEHIGKEIT } from '@prometheus-harness/capabilities'
import type { Rangliste, Ranglisteneintrag } from '@prometheus-harness/ranking'

/** Wie eine Wahl zustande kam. */
export type Wahlweg =
  /** Die ausdrückliche Wahl des Endnutzers hat gegriffen. */
  | 'gewaehlt'
  /** Die gerechnete Rangfolge hat entschieden. */
  | 'rangfolge'

/** Eine getroffene Wahl. */
export interface Wahl {
  /** Der gewählte Anbieter. */
  readonly anbieter: Anbieter
  /** Wie sie zustande kam. */
  readonly wegen: Wahlweg
  /** Der Eintrag der Rangfolge, wenn sie aus ihr kam. */
  readonly eintrag?: Ranglisteneintrag
  /** Der Rang dieses Eintrags, wenn es einen gibt. */
  readonly rang?: number
  /**
   * Was auf dem Weg verworfen wurde — je Zeile ein Grund.
   *
   * **Warum das mitgeliefert wird und nicht nur im Fehlerfall.** Auch eine **gelungene** Wahl kann
   * eine verfehlte Nutzerwahl enthalten („`zai` gewählt, aber kein Schlüssel — es antwortet
   * `openrouter`"). Ohne diese Liste wäre das unsichtbar.
   */
  readonly verworfen: readonly string[]
}

/** Was die Auswahl braucht. */
export interface Wahloptionen {
  /** Die Registratur mit den eingetragenen Anbietern. */
  readonly registratur: Faehigkeiten
  /** Die gerechnete Rangfolge. */
  readonly rangliste: Rangliste
  /** Die Fähigkeit, für die gewählt wird. */
  readonly faehigkeit: Faehigkeit
  /**
   * Die ausdrückliche Wahl des Endnutzers — eine **Anbieter**-Kennung, kein Modell.
   *
   * Welches *Modell* läuft, steht in `settings` und ist Sache des Anbieters; hier geht es darum,
   * **wer** antwortet.
   */
  readonly gewaehlt?: string
}

/** Warum keine Wahl möglich war. */
export class KeineWahlError extends Error {
  /**
   * @param faehigkeit - die Fähigkeit, für die niemand bereitstand
   * @param gruende - je Kandidat ein Grund, in Rangfolge
   */
  constructor(
    readonly faehigkeit: Faehigkeit,
    readonly gruende: readonly string[],
  ) {
    super(
      `Für „${NAME_DER_FAEHIGKEIT[faehigkeit]}" ist keine Wahl möglich.` +
        (gruende.length === 0 ? ' Die Rangliste ist für diese Fähigkeit leer.' : `\n  ${gruende.join('\n  ')}`),
    )
    this.name = 'KeineWahlError'
  }
}

/**
 * Wählt einen Anbieter für **eine** Fähigkeit.
 *
 * @param optionen - Registratur, Rangfolge, Fähigkeit und die ausdrückliche Wahl
 * @returns die Wahl samt dem, was verworfen wurde
 * @throws KeineWahlError - wenn weder die Wahl noch die Rangfolge einen bereiten Anbieter ergibt
 */
export async function waehle(optionen: Wahloptionen): Promise<Wahl> {
  const { registratur, rangliste, faehigkeit } = optionen
  const verworfen: string[] = []

  const liste = rangliste.listen.find((eintrag) => eintrag.faehigkeit === faehigkeit)
  if (liste === undefined) {
    throw new KeineWahlError(faehigkeit, [
      `Die Rangliste enthält keine Liste für „${faehigkeit}" — sie wurde für andere Fähigkeiten gerechnet.`,
    ])
  }

  // Die Anbieter, die diese Fähigkeit **selbst** nennen — die Registratur kennt nur diese.
  const kandidaten = registratur.fuer(faehigkeit)

  // --- 1. Die ausdrückliche Wahl des Endnutzers -------------------------------
  if (optionen.gewaehlt !== undefined) {
    const gewuenscht = kandidaten.find((eintrag) => eintrag.id === optionen.gewaehlt)
    if (gewuenscht === undefined) {
      verworfen.push(
        `„${optionen.gewaehlt}" ist gewählt — aber es gibt KEINEN Anbieter mit dieser Kennung. ` +
          'Die Wahl bleibt gespeichert und wirkt nicht.',
      )
    } else {
      const stand = await gewuenscht.bereit(faehigkeit)
      if (stand.bereit) {
        return { anbieter: gewuenscht, wegen: 'gewaehlt', verworfen }
      }
      verworfen.push(`„${optionen.gewaehlt}" ist gewählt — aber nicht bereit: ${stand.grund}`)
    }
  }

  // --- 2. Die gerechnete Rangfolge -------------------------------------------
  for (const eintrag of liste.eintraege) {
    const anbieter = kandidaten.find((kandidat) => kandidat.id === eintrag.familie)
    if (anbieter === undefined) {
      // Der Eintrag nennt eine Familie, die **niemand** umsetzt. Er ist ein Hinweis auf einen
      // möglichen Anbieter, keine Möglichkeit — und genau das steht als Grund da.
      verworfen.push(
        `Rang ${String(eintrag.rang)} (${eintrag.familienname}): keine Umsetzung eingetragen ` +
          '— der Eintrag zeigt, was es gäbe, nicht was läuft.',
      )
      continue
    }
    const stand = await anbieter.bereit(faehigkeit)
    if (stand.bereit) {
      return { anbieter, wegen: 'rangfolge', rang: eintrag.rang, eintrag, verworfen }
    }
    verworfen.push(`Rang ${String(eintrag.rang)} (${eintrag.familienname}): nicht bereit — ${stand.grund}`)
  }

  // Der Mensch als letzter: er ist in der Registratur, hat aber **keinen** Verzeichniseintrag.
  // Findet ihn die Schleife oben nicht, wird er hier ausdrücklich versucht — sonst gäbe es für
  // „niemand kann es" nur noch einen Fehler statt einer Rückfrage.
  const mensch = kandidaten.find((eintrag) => !liste.eintraege.some((e) => e.familie === eintrag.id))
  if (mensch !== undefined) {
    const stand = await mensch.bereit(faehigkeit)
    if (stand.bereit) {
      return { anbieter: mensch, wegen: 'rangfolge', verworfen }
    }
    verworfen.push(`„${mensch.id}" (nicht in der Rangliste): nicht bereit — ${stand.grund}`)
  }

  throw new KeineWahlError(faehigkeit, verworfen)
}

/** Ein Kandidat, wie ihn eine Oberfläche anzeigen kann. */
export interface Moeglichkeit {
  /** Der Rang in der Liste. */
  readonly rang: number
  /** Der Eintrag der Rangfolge. */
  readonly eintrag: Ranglisteneintrag
  /** Der eingetragene Anbieter — **fehlt**, wenn es keine Umsetzung gibt. */
  readonly anbieter?: Anbieter
}

/**
 * Die Möglichkeiten einer Fähigkeit, in Rangfolge — **ohne** einen Anbieter zu befragen.
 *
 * **Warum das getrennt von {@link waehle} steht.** `bereit()` kann einen Blick kosten (Schlüssel
 * vorhanden? Modell eingestellt?). Eine Oberfläche, die nur **zeigen** will, soll diese Blicke
 * nicht auslösen — und eine Liste, die beim Aufbau 462 Modelle prüft, wäre langsam und
 * überraschend. Angezeigt wird die Rangfolge; gefragt wird erst bei der Wahl.
 *
 * @param registratur - die Registratur
 * @param rangliste - die Rangfolge
 * @param faehigkeit - die Fähigkeit
 * @returns die Kandidaten in Rangfolge
 */
export function moeglichkeiten(
  registratur: Faehigkeiten,
  rangliste: Rangliste,
  faehigkeit: Faehigkeit,
): readonly Moeglichkeit[] {
  const liste = rangliste.listen.find((eintrag) => eintrag.faehigkeit === faehigkeit)
  if (liste === undefined) return []
  const kandidaten = registratur.fuer(faehigkeit)
  return liste.eintraege.map((eintrag) => {
    const anbieter = kandidaten.find((kandidat) => kandidat.id === eintrag.familie)
    return anbieter === undefined ? { rang: eintrag.rang, eintrag } : { rang: eintrag.rang, eintrag, anbieter }
  })
}
