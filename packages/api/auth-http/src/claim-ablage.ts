/**
 * Der Claim-Speicher als **Datei** im Harness-Home.
 *
 * ## Warum eine Datei und keine Datenbanktabelle
 *
 * `packages/auth/claim` sagt über die echte Ablage:
 *
 * > *„Die echte Ablage ist `one_time_tokens` mit `purpose = 'erster-admin'`."*
 *
 * **Das ist mit dem heutigen Schema unmöglich — gemessen, zwei unabhängige Gründe:**
 *
 * ```
 * ERROR:  new row for relation "one_time_tokens" violates check constraint
 *         "one_time_tokens_purpose_known"
 * DETAIL:  Failing row contains (…, erster-admin, …)
 * ```
 *
 * und `one_time_tokens.user_id` ist `NOT NULL` mit Fremdschlüssel auf `users` —
 * beim Erstlauf gibt es aber **keinen Benutzer**. Die Tabelle kann einen Claim
 * also nicht halten, auch wenn man die Prüfregel erweiterte.
 *
 * ## Warum die Datei hier nicht der bequemere, sondern der bessere Ort ist
 *
 * Ein Claim ist kein Datensatz über einen Benutzer — er ist eine Aussage über
 * **diesen Rechner**: `Maschinenbindung` besteht aus Rechnername, lokalem Nutzer
 * und einer Gerätekennung, die selbst aus einer Datei kommt (`geraete`, Modus
 * 0600). Wer den Claim in die Datenbank legt, trennt ihn von genau der Bindung,
 * die ihn ausmacht.
 *
 * Und die Sicherheitseigenschaft ist stärker: wer Zugang zur **Datenbank** hat,
 * kann einen Claim nicht fälschen — die Gerätekennung stimmt dann nicht, und
 * `pruefeClaim` weist ihn ab (`andere-geraetekennung`). Wer Zugang zum
 * **Dateisystem** hat, hat ohnehin schon gewonnen — die Vertrauenswurzel ist der
 * lokale Zugang, und das schreibt `erzeugeClaim` selbst in die Datei.
 *
 * ## Was hier abgelegt wird
 *
 * **Nur der Hash.** `erzeugeClaim` schreibt den Klartext nach `claim.txt` (für
 * den Eigentümer) und gibt `legeAb` **nur den Hash**. Wer die Ablage liest, hat
 * damit kein Token — und ohne Token kein Adminkonto.
 *
 * @module @prometheus-harness/auth-http/claim-ablage
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClaimAblage, ClaimEintrag } from '@prometheus-harness/claim'

/**
 * Der Dateiname der Ablage.
 *
 * **Nicht `claim.txt`.** Diese Datei ist die **Notiz für den Eigentümer** und
 * enthält den Klartext des Tokens. Die Ablage enthält **nur den Hash**. Zwei
 * Dateien mit derselben Aufgabe wären eine Einladung, den Klartext dorthin zu
 * schreiben, wo er nicht hingehört.
 */
export const ABLAGEDATEI = 'claim-ablage.json'

/** Was in der Datei steht. */
interface AblageInhalt {
  readonly tokenHash: string
  readonly hostname: string
  readonly lokalerNutzer: string
  readonly geraeteId: string
  /** ISO-8601 — als Text, damit die Datei lesbar bleibt. */
  readonly laeuftAb: string
  readonly verbraucht: boolean
}

/** Ist das ein brauchbarer Eintrag aus der Datei? */
function istEintrag(wert: unknown): wert is AblageInhalt {
  if (typeof wert !== 'object' || wert === null) return false
  const e = wert as Record<string, unknown>
  return (
    typeof e['tokenHash'] === 'string' &&
    typeof e['hostname'] === 'string' &&
    typeof e['lokalerNutzer'] === 'string' &&
    typeof e['geraeteId'] === 'string' &&
    typeof e['laeuftAb'] === 'string' &&
    typeof e['verbraucht'] === 'boolean'
  )
}

/**
 * Der Claim-Speicher über einer Datei im Harness-Home.
 *
 * **Was bei einem kaputten Inhalt geschieht: gar nichts — und das ist fail-closed.**
 * Läßt sich die Datei nicht lesen oder ist sie kein gültiger Eintrag, gilt
 * „kein Claim". Die Folge ist, daß sich **kein** erstes Adminkonto anlegen läßt.
 * Das ist die sichere Richtung: der Eigentümer erzeugt einen neuen Claim
 * (`bun scripts/claim.mjs`), und alles ist wieder in Ordnung. Die unsichere
 * Richtung wäre, bei unlesbarer Datei einen Claim **anzunehmen**.
 *
 * @param home - das Harness-Home
 * @returns der Speicher
 */
export function claimAblageImHome(home: string): ClaimAblage {
  const pfad = join(home, ABLAGEDATEI)

  /**
   * Liest den Eintrag — **als lokale Funktion, nicht als Methode mit `this`**.
   *
   * Der erste Entwurf schrieb in `verbrauche` ein `this.liesJüngsten()`. Das
   * funktioniert nur, solange der Aufruf über das Objekt geht: sobald jemand die
   * Methode abgreift (`const {verbrauche} = ablage`), ist `this` nicht mehr das
   * Objekt, und der Aufruf scheitert zur Laufzeit — an einer Stelle, die mit der
   * Ursache nichts zu tun hat.
   */
  async function liesen(): Promise<ClaimEintrag | undefined> {
    if (!existsSync(pfad)) return undefined
    let roh: string
    try {
      roh = readFileSync(pfad, 'utf8')
    } catch {
      // Nicht lesbar → es gilt „kein Claim". Siehe oben: die sichere Richtung.
      return undefined
    }
    let gelesen: unknown
    try {
      gelesen = JSON.parse(roh)
    } catch {
      return undefined
    }
    if (!istEintrag(gelesen)) return undefined
    const ablauf = new Date(gelesen.laeuftAb)
    if (Number.isNaN(ablauf.getTime())) return undefined
    return {
      tokenHash: gelesen.tokenHash,
      hostname: gelesen.hostname,
      lokalerNutzer: gelesen.lokalerNutzer,
      geraeteId: gelesen.geraeteId,
      laeuftAb: ablauf,
      verbraucht: gelesen.verbraucht,
    }
  }

  return {
    async legeAb(eintrag: ClaimEintrag): Promise<void> {
      // **Immer überschreiben, nie anhängen.** Es gibt genau **einen** gültigen
      // Claim: den jüngsten. Eine Liste wäre eine zweite Wahrheit — und ein alter
      // Eintrag, den niemand mehr ansieht, wäre ein zweites gültiges Token.
      const inhalt: AblageInhalt = {
        tokenHash: eintrag.tokenHash,
        hostname: eintrag.hostname,
        lokalerNutzer: eintrag.lokalerNutzer,
        geraeteId: eintrag.geraeteId,
        laeuftAb: eintrag.laeuftAb.toISOString(),
        verbraucht: eintrag.verbraucht,
      }
      // `mode: 0o600` — die Datei enthält zwar nur den Hash, aber sie nennt
      // Rechnername, lokalen Nutzer und Gerätekennung. Das ist ein Fingerabdruck
      // des Rechners und geht niemanden sonst etwas an.
      writeFileSync(pfad, `${JSON.stringify(inhalt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    },

    liesJüngsten: liesen,

    async verbrauche(tokenHash: string): Promise<void> {
      // **Nur den passenden Eintrag.** Ein blindes Setzen würde bei einem
      // beliebigen vorgelegten Token den echten Claim verbrauchen — und damit
      // den Eigentümer aussperren, ohne daß jemand das Adminkonto bekommen hätte.
      const vorhanden = await liesen()
      if (vorhanden === undefined || vorhanden.tokenHash !== tokenHash) return
      writeFileSync(
        pfad,
        `${JSON.stringify(
          {
            tokenHash: vorhanden.tokenHash,
            hostname: vorhanden.hostname,
            lokalerNutzer: vorhanden.lokalerNutzer,
            geraeteId: vorhanden.geraeteId,
            laeuftAb: vorhanden.laeuftAb.toISOString(),
            verbraucht: true,
          } satisfies AblageInhalt,
          null,
          2,
        )}\n`,
        { encoding: 'utf8', mode: 0o600 },
      )
    },
  }
}
