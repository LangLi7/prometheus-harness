/**
 * Gibt die Adresse **mit Anmeldetoken** aus, sobald der Host sie meldet.
 *
 * ## Warum es diese Datei gibt
 *
 * Der Host meldet `http://127.0.0.1:<port>/?token=…` — und **ohne** dieses Token
 * antwortet die Oberfläche mit **401**. Gemessen am 13.10.2026: `bun run start`
 * nennt die Adresse, aber wer sie aus der Konsole abschreibt und in den Browser
 * tippt, landet auf einer Fehlerseite. Die Anleitung war damit befolgbar und
 * trotzdem falsch.
 *
 * Der Launcher kann das besser als ein Mensch: er liest die Ausgabe des Hosts
 * ohnehin und kennt den Token. Er liefert die **benutzbare** Adresse nach.
 *
 * ## Warum der Host nicht einfach einen Browser öffnet
 *
 * Er versucht es — und scheitert auf diesem Rechner sichtbar:
 *
 * ```
 * web-app: could not open the default browser because browser launcher exited with code null
 * ```
 *
 * Ein Start, der einen Fehler meldet, obwohl alles läuft, ist verwirrend. Eine
 * Zeile mit der vollständigen Adresse ist außerdem in einem Container richtig, wo
 * es gar keinen Browser gibt.
 *
 * ## Die eine Frage, die dieser Code beantworten muss
 *
 * **Wann ist die Adresse vollständig?** Die Ausgabe kommt in Stücken (gemessen:
 * bis zu 158 Zeichen je Stück), und ein Stück kann mitten im Token enden. Wer zu
 * früh ausgibt, gibt Unsinn aus und **verwirft danach die echte Adresse**, weil er
 * sie für „schon gemeldet" hält.
 *
 * Die Antwort kommt aus dem Datenstrom, nicht aus einer geratenen Längenschranke:
 *
 * | Der Host … | und die Adresse ist … | also |
 * |---|---|---|
 * | schreibt eine neue Zeile | damit zu Ende | vollständig |
 * | beendet die Ausgabe | damit zu Ende | vollständig |
 * | schreibt weiter | noch offen | warten |
 * | — | Token hat volle Länge | vollständig, sofort melden |
 *
 * Nur der **letzte** Fall ist eine Annahme: er benutzt die gemessene Tokenlänge
 * des Hosts, damit die Adresse auch **ohne** abschließende Zeile sofort erscheint.
 * Trifft die Annahme nicht mehr, wird die Meldung **später** — nie falsch.
 *
 * @module scripts/token-adresse
 */

/**
 * Tokenlänge, die der Host erzeugt — 32 Byte Zufall als base64url.
 *
 * Nachgerechnet: `ceil(32 / 3) * 4 - 1 = 43` Zeichen ohne Auffüllung. Gemessen an
 * der Adresse vom 13.10.2026 (Port 3081): genau 43 Zeichen.
 *
 * **Wozu die Zahl dient.** Nur dazu, eine vollständige Adresse **sofort** zu
 * melden, wenn der Host noch keine Zeile abgeschlossen hat. Eine abgeschnittene
 * Adresse wird durch diese Zahl **nicht** ausgeschlossen — das leistet sie nicht
 * und soll sie nicht: ob die Ausgabe zu Ende ist, weiß nur der Aufrufer.
 */
export const TOKEN_VOLLE_LAENGE = 43

/** Ab hier gilt überhaupt etwas hinter `?token=` als Tokenanfang. */
export const TOKEN_MINIMALLAENGE = 8

/**
 * Findet die Anmeldeadresse in einer **abgeschlossenen** Ausgabezeile.
 *
 * **Die Form ist gemessen, nicht angenommen.** Der Host (`@deepseek-ai/dsh-web-app`)
 * schreibt:
 *
 * ```
 * dsh web: http://127.0.0.1:3081/?token=<43 Zeichen base64url>
 * ```
 *
 * Gesucht wird nach `127.0.0.1` / `localhost` / `::1` **mit** Token-Parameter —
 * nicht nach irgendeiner URL. Sonst würde die erste beliebige Adresse im Protokoll
 * genommen, und die kann von einem Werkzeug stammen, das längst fertig ist.
 *
 * Zurückgegeben wird der **ganze Rest der Zeile** ab `http`, nicht nur der
 * Tokenlauf: der Host hängt nichts an, und ein Muster mit fester Zeichenklasse
 * würde bei einem Sonderzeichen im Token abschneiden — eine Annahme über die Form
 * des Tokens, die hier nichts zu suchen hat.
 *
 * @param {string} line - eine abgeschlossene Ausgabezeile
 * @returns {string | undefined} die Adresse, falls die Zeile eine trägt
 */
export function findAuthUrl(line) {
  if (typeof line !== 'string') return undefined
  const match = /(https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/\?token=\S*)/u.exec(line)
  const url = match?.[1]
  if (url === undefined) return undefined
  return tokenOf(url).length >= TOKEN_MINIMALLAENGE ? url : undefined
}

/**
 * Liest den Token aus einer Adresse.
 *
 * @param {string} url
 * @returns {string}
 */
export function tokenOf(url) {
  const marker = '?token='
  const at = url.indexOf(marker)
  return at < 0 ? '' : url.slice(at + marker.length)
}

/**
 * Der **Anfang** einer Anmeldeadresse — ohne Anspruch auf Vollständigkeit.
 *
 * Wird gebraucht, weil eine Adresse über eine Stück-Grenze laufen kann: dann
 * steht im Puffer ein Anfang wie `…:3081/?token=jWQ`, der noch **kein** Ergebnis
 * ist, aber auch nicht weggeworfen werden darf.
 */
const ANFANG = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/\?token=\S*/u

/**
 * Gibt die Anmeldeadresse genau einmal aus.
 *
 * @param {(text: string) => void} write - Senke für die Ausgabe (austauschbar für Tests)
 * @returns {{ feed: (chunk: unknown) => void, flush: () => void, done: () => boolean }}
 */
export function announceAuthUrl(write) {
  let announced = false
  /** Noch nicht abgeschlossener Rest der Ausgabe. */
  let carry = ''

  /**
   * @param {string} url - die gefundene Adresse
   */
  const emit = (url) => {
    if (announced) return
    announced = true
    write('')
    write('[pmh] Anmeldung nötig — diese Adresse öffnen (enthält den Token):')
    write(`[pmh]   ${url}`)
    write('')
  }

  /**
   * Verarbeitet einen **abgeschlossenen** Abschnitt Ausgabe.
   *
   * @param {string} abschnitt
   */
  const abschluss = (abschnitt) => {
    if (announced) return
    const url = findAuthUrl(abschnitt)
    if (url !== undefined) emit(url)
  }

  /**
   * Verarbeitet einen **offenen** Rest — nur bei voller Tokenlänge.
   *
   * **Warum die Länge hier zählt.** Ein offener Rest ist kein Ergebnis: er kann
   * mitten im Token stehen. Gemeldet wird er nur, wenn er so lang ist, wie der
   * Host Token erzeugt. Ein kürzerer Rest bleibt liegen und wird gemeldet, sobald
   * der Host zeigt, dass er fertig ist.
   *
   * @param {string} rest
   */
  const offen = (rest) => {
    if (announced) return
    const anfang = ANFANG.exec(rest)?.[0]
    if (anfang === undefined) return
    if (tokenOf(anfang).length >= TOKEN_VOLLE_LAENGE) emit(anfang)
  }

  /**
   * Nimmt einen Ausgabestück entgegen.
   *
   * **Warum gepuffert wird.** Ausgaben kommen in Stücken, nicht in Zeilen. Eine
   * Adresse kann mitten in einem Stück enden — ohne Puffer würde sie je nach
   * Schreibweise des Kindprozesses mal gefunden und mal nicht. Ein Fehler, der
   * „manchmal" auftritt, bleibt lange unentdeckt; deshalb wird hier gepuffert und
   * nicht gehofft.
   */
  const feed = (chunk) => {
    carry += String(chunk)
    const cut = Math.max(carry.lastIndexOf('\n'), carry.lastIndexOf('\r'))
    if (cut < 0) {
      // Noch keine Zeile vollständig. Der ganze Rest ist offen.
      offen(carry)
      return
    }
    const fertig = carry.slice(0, cut)
    carry = carry.slice(cut + 1)
    abschluss(fertig)
    // Der neue Rest kann die vollständige Adresse **ohne** Umbruch enthalten —
    // gemessen: der Host schreibt sie als letzte Zeile ohne Umbruch.
    offen(carry)
  }

  /**
   * Meldet, dass keine weitere Ausgabe kommt.
   *
   * **Der Weg, der die Adresse ohne abschließenden Umbruch rettet.** Ohne ihn
   * bliebe sie im Puffer liegen und wartete auf einen Umbruch, der nie kommt.
   */
  const flush = () => {
    abschluss(carry)
    carry = ''
  }

  return { feed, flush, done: () => announced }
}
