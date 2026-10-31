/**
 * Der Projektbereich — welcher Nutzer, in welchem Projekt.
 *
 * ## Warum der Nutzer zur Adresse gehört und nicht zum Datensatz
 *
 * Ein Plan ist ein Arbeitsstand, kein Protokoll: er darf geteilt werden, wenn zwei Menschen am
 * selben Vorhaben arbeiten — aber **nur**, wenn jemand es ausdrücklich teilt. Der Harness legt den
 * Plan pro Rechner ab (`$DSH_HOME/crew/goals/<crew>/<projekt>.json`); bei zwei Menschen an einer
 * Maschine liegen damit zwei Pläne im selben Ordner, und nur das Etikett des Projekts
 * unterscheidet sie.
 *
 * Hier steht der Nutzer **vor** dem Projekt im Pfad. Zwei Nutzer können denselben Projektpfad
 * bearbeiten, ohne daß einer den Plan des anderen liest — nicht weil eine Abfrage filtert, sondern
 * weil der Pfad verschiedene ist.
 *
 * ## Warum das Etikett einen Abdruck trägt
 *
 * Der Projektpfad wird lesbar gemacht (`D:\Projekte\Shop` → `projekte-shop`), und danach ein
 * achtstelliger Abdruck angehängt. Zwei verschiedene Pfade können denselben lesbaren Rest haben
 * (`D:\a\shop` und `D:\b\shop` werden beide `shop`); ohne Abdruck läge ihr Plan in derselben Datei,
 * und der zweite Leser sähe den Plan des ersten. Der Abdruck macht die Kollision unmöglich, nicht
 * unwahrscheinlich.
 *
 * @module @prometheus-harness/crew-plan/scope
 */

import { createHash } from 'node:crypto'

/**
 * Was ein Nutzername im Pfad sein darf.
 *
 * Dieselbe Form wie eine Kennung: Buchstaben, Ziffern, `-`, `_`, `.` als Trenner. Kein `..`, kein
 * Pfadtrenner, kein Leerzeichen — ein Name, der aus dem Ordner führt, ist kein Name.
 */
export const NUTZER_MUSTER = /^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$/

/** Das Etikett, unter dem ein Lauf **ohne** Projekt abgelegt wird. */
export const OHNE_PROJEKT = 'no-workspace'

/** Der Bereich, in dem ein Plan gilt: Nutzer, Projekt-Etikett, Projektpfad. */
export interface Projektbereich {
  /** Der Nutzer, dem der Plan gehört. */
  nutzer: string
  /** Das Etikett des Projekts im Pfad — stabil, lesbar, eindeutig. */
  label: string
  /** Der Projektpfad; leer, wenn es kein Projekt gibt. */
  pfad: string
}

/**
 * Macht aus einem Pfad ein lesbares Etikett.
 *
 * @param pfad - der Projektpfad
 * @param grenze - die Höchstlänge des lesbaren Teils (Vorgabe 48)
 * @returns das Etikett ohne Abdruck
 */
export function slug(pfad: string, grenze = 48): string {
  const lesbar = pfad
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  const gekuerzt = lesbar.slice(0, grenze).replace(/-+$/u, '')
  return gekuerzt === '' ? '' : gekuerzt
}

/**
 * Bestimmt den Bereich eines Laufs.
 *
 * @param feld - Nutzer, Projektpfad und optional die Kennung eines **registrierten** Arbeitsbereichs
 * @returns der Bereich; ohne Pfad der Bereich „ohne Projekt"
 * @throws Error wenn der Nutzername nicht als Pfadsegment taugt
 */
export function projektbereich(feld: {
  nutzer: string
  pfad?: string
  workspaceId?: string
}): Projektbereich {
  if (!NUTZER_MUSTER.test(feld.nutzer)) {
    throw new Error(
      `Nutzername "${feld.nutzer}" taugt nicht als Pfadsegment (erlaubt: Buchstaben, Ziffern, - _ .)`,
    )
  }
  const pfad = feld.pfad?.trim() ?? ''
  if (pfad === '') return { nutzer: feld.nutzer, label: OHNE_PROJEKT, pfad: '' }

  const grund = feld.workspaceId !== undefined && feld.workspaceId.trim() !== ''
    ? `workspace-${feld.workspaceId.trim()}`
    : pfad
  const abdruck = createHash('sha1').update(grund).digest('hex').slice(0, 8)
  const lesbar = slug(pfad)
  const label = lesbar === '' ? `p-${abdruck}` : `${lesbar}-${abdruck}`
  return { nutzer: feld.nutzer, label, pfad }
}
