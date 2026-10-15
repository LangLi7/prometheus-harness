/**
 * `@prometheus-harness/login-web/redirect` — **wohin nach der Anmeldung**.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Der Betreiber hat gesagt: *„wir machen später eine Steuerung settings, was nach dem login
 * passiert — also was danach weitermachen, weiterleitet."* Damit diese Einstellung später
 * **eine** Stelle hat und nicht in der Oberfläche verstreut liegt, steht das Ziel hier.
 *
 * ## Die zweite Aufgabe dieser Datei: **kein offener Weiterleiter**
 *
 * Ein Ziel aus der Adresse (`?weiter=…`) zu übernehmen ist bequem und gefährlich: wer
 * `?weiter=https://boese.example/anmeldung` verschickt, bekommt eine Seite, die nach der
 * echten Anmeldung auf eine **fremde** Seite schickt — und der Betroffene hat gerade eben
 * sein Kennwort eingegeben. Deshalb gilt: **nur relative Ziele** dieser Seite.
 *
 * Abgelehnt werden insbesondere:
 *
 * | Eingabe | Warum |
 * |---|---|
 * | `https://boese.example` | fremde Herkunft |
 * | `//boese.example` | **protokollrelativ** — sieht relativ aus und ist fremd |
 * | `/\boese.example` | Umgehung, die manche Browser als `//` lesen |
 * | `javascript:…` | kein Pfad |
 * | `weiter` | kein Pfad (muß mit `/` beginnen) |
 *
 * Bei jedem abgelehnten Ziel gilt die **Vorgabe** — kein Fehler, kein leeres Ziel.
 *
 * @module @prometheus-harness/login-web/redirect
 */

/** Der Name des Parameters in der Adresse — **eine** Stelle, auch für Links auf diese Seite. */
export const ZIEL_PARAMETER = 'weiter'

/**
 * Das Ziel, wenn keines genannt ist.
 *
 * **Die Schnittstelle des Hosts**: `/start` (`packages/api/auth-http/src/login.ts`). Dort
 * steht, wer angemeldet ist, und von dort geht es weiter. Ohne gültige Sitzung leitet `/start`
 * auf die Anmeldeseite zurück — es gibt also keine Schleife, sondern einen Kreis, der sich
 * schließt, sobald die Anmeldung gelingt.
 *
 * **Hier docken später die Einstellungen an.** Wer die Einstellung einbaut, ersetzt diesen Wert
 * durch das Gelesene — und muß ihn durch dieselbe Prüfung schicken (`istRelativ`), denn eine
 * Einstellung kann falsch sein.
 */
export const VORGABE_ZIEL = '/start'

/**
 * Ist das Ziel ein **relativer Pfad dieser Seite**?
 *
 * Die Prüfung ist absichtlich streng und mischt keine Herkünfte hinein: sie sieht sich nur
 * die Zeichenkette an.
 *
 * @param ziel - der geprüfte Wert
 * @returns ob er als Ziel taugt
 */
export function istRelativ(ziel: string): boolean {
  if (!ziel.startsWith('/')) return false
  // `//host` und `/\host` sind fremde Herkünfte.
  if (ziel.startsWith('//')) return false
  if (ziel.startsWith('/\\')) return false
  // Ein Rückstrich irgendwo im Pfad wird von manchen Browsern wie `/` gelesen.
  if (ziel.includes('\\')) return false
  // Steuerzeichen und Zeilenumbrüche haben in einem Pfad nichts zu suchen.
  if (/[\u0000-\u001f\u007f]/u.test(ziel)) return false
  return true
}

/**
 * Ermittelt das Ziel aus der Adresse der Seite.
 *
 * @param suche - `location.search` (mit oder ohne führendes `?`)
 * @param vorgabe - das Ziel ohne Angabe (später aus den Einstellungen)
 * @returns ein **relatives** Ziel; bei allem anderen die Vorgabe
 */
export function ermittleZiel(suche: string, vorgabe: string = VORGABE_ZIEL): string {
  const roh = new URLSearchParams(suche).get(ZIEL_PARAMETER)
  if (roh === null || roh === '') return vorgabe
  if (!istRelativ(roh)) return vorgabe
  return roh
}
