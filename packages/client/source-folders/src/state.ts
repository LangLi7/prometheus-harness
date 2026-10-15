/**
 * Woher der Client seine zwei Auskünfte nimmt — **reine Funktionen**, damit sie prüfbar sind.
 *
 * ## Warum das NICHT im Container steht
 *
 * Eine Regel, die in einer React-Komponente vergraben ist, läßt sich hier **nicht** prüfen: es gibt
 * keinen Browser. Als reine Funktion ist sie Zeichen für Zeichen prüfbar — und der Container ruft
 * sie nur noch auf.
 *
 * ## Beide Auskünfte sind NACHGESEHEN, nicht erfunden
 *
 * | Auskunft | Wo sie steht | Was dort steht |
 * |---|---|---|
 * | Der CSRF-Wert | `packages/api/auth-http/src/seite.ts:274` | `cookieWert(CSRF_COOKIE)` — sie kommt aus einem **Keks**, nicht aus einem Meta-Feld |
 * | Der Keksname | `packages/auth/auth/src/session.ts:450` | `CSRF_COOKIE_NAME = 'pmh_csrf'` |
 * | Der Arbeitsbereich | `ui-git/src/client/index.ts:204` | die **Sitzung** gewinnt, sonst der **erste**, sonst **nichts** |
 *
 * **Meine erste Fassung las den CSRF-Wert aus einem Meta-Feld** (`meta[name="pmh-csrf"]`) und
 * nannte das ausdrücklich eine „Festlegung dieser Datei". Sie war **falsch**: die Anmeldeseite
 * liest ihn seit jeher aus dem Keks. Nun steht hier, was gemessen ist.
 *
 * **Warum der Keksname hier noch einmal steht.** `@prometheus-harness/auth` ist ein
 * **Server**-Paket; es in ein Browser-Bündel zu ziehen brächte Server-Code in die Seite. Der Name
 * ist deshalb abgeschrieben — mit der Fundstelle daneben, damit er nachprüfbar bleibt.
 *
 * @module @prometheus-harness/client-source-folders/stand
 */

/** Der Keks, in dem der CSRF-Wert steht — gemessen, siehe Dateikopf. */
export const CSRF_KEKS = 'pmh_csrf'

/**
 * Liest einen Wert aus einer Keks-Zeichenkette.
 *
 * **Warum das eine eigene Funktion ist.** `document.cookie` ist eine Zeichenkette der Form
 * `a=1; b=2`, und der gesuchte Name kann als **Teil** eines anderen vorkommen (`pmh_csrf` in
 * `xpmh_csrf`). Wer mit `includes` sucht, findet den falschen. Hier wird **je Keks** verglichen.
 *
 * @param kekse - die Keks-Zeichenkette
 * @param name - der gesuchte Name
 * @returns der Wert, oder `undefined`
 */
export function wertAusKeks(kekse: string, name: string): string | undefined {
  for (const stueck of kekse.split(';')) {
    const gleich = stueck.indexOf('=')
    if (gleich === -1) continue
    if (stueck.slice(0, gleich).trim() !== name) continue
    const wert = stueck.slice(gleich + 1).trim()
    if (wert === '') return undefined
    try {
      return decodeURIComponent(wert)
    } catch {
      // Ein unlesbarer Wert ist kein Wert — aber auch kein Grund, alles fallen zu lassen.
      return wert
    }
  }
  return undefined
}

/**
 * Der CSRF-Wert aus der Seite.
 *
 * @param kekse - die Keks-Zeichenkette; Vorgabe: `document.cookie`, wenn es ein Dokument gibt
 * @returns der Wert, oder `undefined`
 */
export function csrfWert(kekse?: string): string | undefined {
  const quelle = kekse ?? globalThis.document?.cookie
  if (quelle === undefined) return undefined
  return wertAusKeks(quelle, CSRF_KEKS)
}

/** Ein Arbeitsbereich, wie ihn die Client-Registratur führt — nur die Felder, die hier zählen. */
export interface Arbeitsbereichsstand {
  /** Die Kennung. */
  readonly workspaceId: string
  /** Die Sitzungen, die zu ihm gehören. */
  readonly sessionIds: readonly string[]
}

/**
 * Welcher Arbeitsbereich gemeint ist — die Regel aus `ui-git`, nachgebaut.
 *
 * 1. Die **Sitzung** gewinnt: der Bereich, dem die aktuelle Sitzung gehört.
 * 2. Sonst der **erste** Bereich (der Fall mit genau einem Projekt).
 * 3. Sonst **nichts** — dann wird **nichts** angezeigt, statt zu raten.
 *
 * @param bereiche - die Bereiche in Registratur-Reihenfolge
 * @param sitzung - die aktuelle Sitzung, wenn es eine gibt
 * @returns die Kennung, oder `undefined`
 */
export function arbeitsbereichId(
  bereiche: readonly Arbeitsbereichsstand[],
  sitzung: string | undefined,
): string | undefined {
  if (sitzung !== undefined) {
    const eigener = bereiche.find((b) => b.sessionIds.includes(sitzung))
    if (eigener !== undefined) return eigener.workspaceId
  }
  // **Eine leere Liste ergibt `undefined`, nicht einen leeren Text.** Ein leerer Text wäre eine
  // Kennung, die es nicht gibt — und der Weg würde mit `arbeitsbereich-unbekannt` antworten,
  // ohne daß jemand erführe, daß es gar keinen Bereich gibt.
  return bereiche[0]?.workspaceId
}
