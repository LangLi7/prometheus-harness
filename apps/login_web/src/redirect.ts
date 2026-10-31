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
 * Der Name des Einladungs-Tokens in der Adresse.
 *
 * **Warum der Token in der Adresse steht und nicht in einem Formularfeld.**
 * Ein Link, den man weitergeben kann, ist der ganze Zweck: `?token=…` ist das,
 * was man in einen Chat legt. Der Preis ist, daß er im Verlauf und in
 * Zugriffsprotokollen steht — deshalb gilt er **einmal** und läuft ab, und der
 * Server nimmt ihn aus dem `Referer`-Kopf heraus (`no-referrer` auf der Seite).
 */
export const TOKEN_PARAMETER = 'token'

/**
 * Liest das Einladungs-Token aus der Adresse.
 *
 * **Warum geprüft und nicht einfach durchgereicht.** Der Wert geht zurück an
 * den Server (der ohnehin prüft) — hier wird nur verhindert, daß Unsinn in der
 * Oberfläche landet und wie ein gültiger Link aussieht. Das Zeichenalphabet ist
 * das von base64url (`A–Z a–z 0–9 _ -`); 32 zufällige Bytes ergeben 43 Zeichen.
 * Die Grenzen sind bewußt weit: ein Token, das 32 Zeichen hat, ist nicht
 * kürzer als nötig, und ein längerer Wert ist eher ein alter Link als ein
 * Angriff.
 *
 * @param suche - `location.search` (mit oder ohne führendes `?`)
 * @returns das Token oder `undefined`, wenn keines (brauchbar) dasteht
 */
export function einladungsToken(suche: string): string | undefined {
  const roh = new URLSearchParams(suche).get(TOKEN_PARAMETER)
  if (roh === null) return undefined
  const wert = roh.trim()
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(wert)) return undefined
  return wert
}

/**
 * Der Parameter des **Passwort-Links**.
 *
 * `?reset=` statt `?token=`: es ist ein anderer Vorgang. Ein Einladungs-Token
 * legt ein Konto an; ein Reset-Token setzt das Passwort eines **bestehenden**
 * Kontos. Beide sind Einmal-Token, aber wer sie verwechselt, soll das an der
 * Adresse sehen und nicht an einer Fehlermeldung.
 */
export const RESET_PARAMETER = 'reset'

/**
 * Liest das Reset-Token aus der Adresse.
 *
 * Dieselbe Prüfung wie bei der Einladung — dasselbe Alphabet, dieselbe Länge,
 * derselbe Grund: der Wert geht zurück an den Server, der ohnehin prüft; hier
 * wird nur verhindert, daß Unsinn wie ein gültiger Link aussieht.
 *
 * @param suche - `location.search` (mit oder ohne führendes `?`)
 * @returns das Token oder `undefined`
 */
export function resetToken(suche: string): string | undefined {
  const roh = new URLSearchParams(suche).get(RESET_PARAMETER)
  if (roh === null) return undefined
  const wert = roh.trim()
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(wert)) return undefined
  return wert
}

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
