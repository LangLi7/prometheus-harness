/**
 * Die Rechte — wer was darf.
 *
 * ## Was hier steht und was nicht
 *
 * `packages/auth/permissions` **entscheidet** (`darfAusfuehren`) und hat seine
 * eigenen Prüfungen. Diese Datei tut zwei Dinge: sie baut aus einem Benutzer
 * einen {@link Akteur} — also die Frage „wer handelt, und was darf seine Umgebung
 * überhaupt" — und sie reicht das Urteil weiter, ohne es zu verändern.
 *
 * **Keine Entscheidung ist hier dupliziert.** Wer in dieser Datei eine Regel
 * fände, die es in `permissions` auch gibt, hätte zwei Wahrheiten: die eine
 * getestet, die andere im Betrieb wirksam. Das ist die Sorte Abweichung, die
 * still entsteht und laut auffällt.
 *
 * ## Warum der Akteur die Isolation braucht
 *
 * Ein `Akteur` besteht aus Kennung, Rolle **und** `Isolation`
 * (Dateizugriff, Lese- und Schreibwurzeln, Netz, Prozesse). Die Isolation ist
 * keine Zierde: `darfAusfuehren` prüft bei einem Dateizugriff die Wurzeln, nicht
 * die Rolle. Ein Admin ohne Schreibwurzel darf trotzdem nicht schreiben — und
 * genau das ist der Sinn der Trennung.
 *
 * @module @prometheus-harness/auth-http/rechte
 */

import type { UserRecord } from '@prometheus-harness/auth'
import {
  adminProfil,
  darfAusfuehren,
  vorgabeProfil,
  type Akteur,
  type Isolation,
  type Urteil,
} from '@prometheus-harness/permissions'

/**
 * Baut den handelnden Akteur.
 *
 * **Warum das Harness-Home die Wurzel ist.** Ein Admin dieses Harness verwaltet
 * **das Harness** — sein Home ist der Bereich, den er schreiben darf. Die
 * Wurzeln der **Arbeitsbereiche** gehören hier bewußt nicht hinein: sie sind je
 * Arbeitsbereich verschieden und werden beim Zugriff auf einen konkreten Pfad
 * geprüft, nicht global erteilt. Ein Profil, das alle Arbeitsbereiche umfaßt,
 * wäre ein Freibrief — und ein Freibrief wird irgendwann an der falschen Stelle
 * benutzt.
 *
 * @param benutzer - der angemeldete Benutzer
 * @param home - das Harness-Home
 * @returns der Akteur mit seiner Isolation
 */
export function akteurAus(benutzer: UserRecord, home: string): Akteur {
  return {
    userId: benutzer.id,
    rolle: benutzer.role,
    isolation: benutzer.role === 'admin' ? adminProfil([home]) : vorgabeProfil(home),
  }
}

/**
 * Prüft, ob dieser Akteur ein Konto anlegen darf.
 *
 * **Warum es hier einen eigenen Namen bekommt und nicht direkt
 * `darfAusfuehren` heißt.** Der Aufrufer soll nicht selbst zusammenbauen müssen,
 * welche Aktion gemeint ist — ein `{art: 'benutzer-anlegen'}` an drei Stellen
 * wäre dreimal dieselbe Angabe, und eine davon wird irgendwann falsch.
 *
 * `herkunft: 'benutzer'` ist die Angabe für eine Handlung **im Namen eines
 * Menschen** über die Oberfläche — im Gegensatz zu `'harness'`, wo zusätzlich
 * eine unterschriebene Freigabe nötig ist (siehe `packages/auth/permissions`).
 *
 * @param akteur - wer handelt
 * @param email - welche Adresse angelegt werden soll
 * @param jetzt - die Prüfzeit
 * @returns das Urteil mit Regel und Grund
 */
export function darfBenutzerAnlegen(akteur: Akteur, email: string, jetzt: Date): Urteil {
  return darfAusfuehren({
    akteur,
    herkunft: 'benutzer',
    aktion: { art: 'benutzer-anlegen', email },
    jetzt,
  })
}

/** Die Isolation, wie sie das Haus verläßt. */
export interface IsolationAnsicht {
  readonly dateizugriff: Isolation['dateizugriff']
  readonly lesewurzeln: readonly string[]
  readonly schreibwurzeln: readonly string[]
  readonly netz: boolean
  readonly prozesse: boolean
}

/**
 * Macht die Isolation zu einem Wert für die Antwort.
 *
 * **Warum eine eigene Funktion und nicht die Isolation selbst.** Die Antwort
 * geht an eine Oberfläche. Was dort steht, ist damit **öffentlich** — und eine
 * Angabe, die versehentlich hineingerät, ist hinaus. Eine benannte Auswahl ist
 * eine Stelle, an der man sieht, was hinausgeht; ein durchgereichtes Objekt ist
 * eine, an der man es nicht sieht.
 *
 * @param isolation - die Isolation des Akteurs
 * @returns die Ansicht
 */
export function isolationAnsicht(isolation: Isolation): IsolationAnsicht {
  return {
    dateizugriff: isolation.dateizugriff,
    lesewurzeln: [...isolation.lesewurzeln],
    schreibwurzeln: [...isolation.schreibwurzeln],
    netz: isolation.netz,
    prozesse: isolation.prozesse,
  }
}
