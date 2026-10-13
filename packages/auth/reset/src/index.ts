/**
 * `@prometheus-harness/reset` — Passwort zurücksetzen, ohne daß die Datenbank
 * das Geheimnis kennt.
 *
 * ## Die Weisung, die diesen Entwurf bestimmt
 *
 * > *„für einen DB-Administrator unlesbar, Passwort trotzdem zurücksetzbar"*
 *
 * Beides zusammen ist der Kern: wer die Datenbank lesen kann, darf **kein**
 * Passwort setzen können — und trotzdem muß ein vergessenes Passwort
 * zurücksetzbar bleiben. Das geht nur, wenn in der Datenbank **nur der Hash**
 * des Einmal-Tokens liegt. Wer `one_time_tokens` liest, hat damit nichts in der
 * Hand: 32 Zufallsbytes sind nicht zu erraten, und aus dem SHA-256-Hash lassen
 * sie sich nicht zurückrechnen.
 *
 * **Warum SHA-256 und kein Argon2id.** Dasselbe Argument wie bei den
 * Sitzungstoken: das Token hat 256 Bit Zufall. Ein langsames Verfahren schützt
 * gegen das Durchprobieren **schwacher** Geheimnisse; hier gibt es nichts zu
 * probieren. Ein Argon2id-Lauf je Prüfung wäre reine Rechenzeit ohne Gewinn.
 *
 * ## Was dieses Paket NICHT kennt
 *
 * Keine Datenbank, kein HTTP, keinen Versand. Die Ablage kommt als
 * {@link TokenAblage} herein, das neue Passwort als Text. Damit sind alle Regeln
 * **ohne laufende Infrastruktur** prüfbar — und die Prüfungen können genau die
 * Eigenschaften angreifen, auf die es ankommt.
 *
 * ## Die vier Eigenschaften, die gelten müssen
 *
 * | Eigenschaft | Warum |
 * |---|---|
 * | **nur der Hash liegt in der Datenbank** | die Weisung oben |
 * | **ein Token gilt genau einmal** | sonst bliebe ein abgefangenes Token für immer gültig |
 * | **es läuft ab** | ein Token in einer alten E-Mail ist sonst ein Schlüssel ohne Verfallsdatum |
 * | **nach dem Zurücksetzen sind ALLE Sitzungen widerrufen** | sonst behält ein Angreifer, der das Passwort geändert hat, seinen Zugang über seine **alten** Sitzungen — die Passwortänderung sperrt ihn nicht aus. Der Regelkern sagt das selbst: *„Wer sein Passwort ändert, erwartet das Gegenteil."* |
 *
 * @module @prometheus-harness/reset
 */

import {
  checkPassword,
  randomToken,
  revokeAllSessions,
  tokenHash,
  type AuthEventSink,
  type PasswordHasher,
  type SessionStore,
  type UserStore,
} from '@prometheus-harness/auth'

/**
 * Wie lange ein Reset-Token gilt — 15 Minuten.
 *
 * **Warum nicht länger.** Das Token wird **außerhalb** der Datenbank übertragen
 * (der Bediener gibt es weiter). Je länger es gilt, desto größer das Fenster, in
 * dem ein abgefangenes Token noch etwas wert ist. Fünfzehn Minuten reichen für
 * „sag es mir gerade jetzt" und nicht für „ich schaue morgen in die Datei".
 */
export const RESET_GUELTIG_SEKUNDEN = 15 * 60

/** Der Zweck, unter dem ein Reset-Token liegt. Muß der Prüfregel des Schemas entsprechen. */
export const RESET_ZWECK = 'password-reset'

/**
 * Der eine Satz, den ein abgelehntes Token nach außen zu hören bekommt.
 *
 * **Warum ein gemeinsamer Satz und nicht drei.** Ob ein Token nie existiert hat,
 * abgelaufen ist oder verbraucht wurde, darf von außen **nicht** unterscheidbar
 * sein. Ein Unterschied wäre meßbar: wer Token rät, könnte daran ablesen, ob er
 * einen Treffer gelandet hat, und müßte nur noch den Verfall abwarten. Die
 * Unterscheidung bleibt intern in {@link ResetRegel} erhalten — dort, wo sie für
 * Protokoll und Ratenbegrenzung gebraucht wird, aber nicht ausgeliefert wird.
 */
export const RESET_ABWEISUNG = 'dieses Token ist unbekannt, abgelaufen oder wurde bereits eingelöst'

/** Ein Eintrag, wie ihn die Ablage braucht. */
export interface TokenEintrag {
  /** Kennung; das Schema hat keine Vorgabe dafür, also wird sie mitgegeben. */
  readonly id: string
  readonly userId: string
  readonly zweck: string
  /** **Nur der Hash.** Das Klartext-Token verläßt diese Funktion und geht nie in die Ablage. */
  readonly tokenHash: string
  readonly laeuftAb: Date
}

/** Was eine Ablage können muß. */
export interface TokenAblage {
  /** Legt einen Eintrag ab. */
  legeAb(eintrag: TokenEintrag): Promise<void>
  /** Sucht einen Eintrag über den Hash und den Zweck. */
  finde(tokenHash: string, zweck: string): Promise<{ readonly id: string; readonly userId: string; readonly laeuftAb: Date; readonly verbraucht: boolean } | undefined>
  /**
   * Markiert einen Eintrag als verbraucht — **nur wenn er noch offen ist**.
   *
   * @param id - die Kennung
   * @param at - der Zeitpunkt
   * @returns ob DIESER Aufruf ihn verbraucht hat; `false` heißt: ein anderer war
   *   schneller
   */
  verbrauche(id: string, at: Date): Promise<boolean>
  /** Zählt die Einträge eines Zwecks seit einem Zeitpunkt — für die Ratenbegrenzung. */
  zaehleSeit(userId: string, zweck: string, seit: Date): Promise<number>
}

/** Warum ein Token abgewiesen wurde. */
export type ResetRegel = 'gueltig' | 'unbekannt' | 'abgelaufen' | 'verbraucht' | 'passwort-zu-schwach' | 'konto-gesperrt' | 'zu-viele-anfragen'

/** Das Urteil über ein Token. */
export type ResetUrteil =
  | { readonly gueltig: true; readonly id: string; readonly userId: string }
  | { readonly gueltig: false; readonly regel: ResetRegel; readonly grund: string }

/** Was beim Erzeugen herauskommt. */
export interface NeuerReset {
  /** Das **Klartext**-Token. Es geht an den Bediener und **nirgends sonst hin**. */
  readonly token: string
  readonly id: string
  readonly laeuftAb: Date
}

/**
 * Erzeugt ein Reset-Token.
 *
 * @param ablage - wo der Hash abgelegt wird
 * @param userId - für wen
 * @param jetzt - die Prüfzeit
 * @param grenze - die Höchstzahl je Zeitfenster; `undefined` heißt unbegrenzt
 * @param fensterSekunden - die Länge des Fensters
 * @returns das Klartext-Token, seine Kennung und den Ablauf
 * @throws Error, wenn die Grenze erreicht ist
 */
export async function erzeugeResetToken(
  ablage: TokenAblage,
  userId: string,
  jetzt: Date,
  grenze?: number,
  fensterSekunden = 60 * 60,
): Promise<NeuerReset> {
  if (grenze !== undefined) {
    const seit = new Date(jetzt.getTime() - fensterSekunden * 1000)
    const bisher = await ablage.zaehleSeit(userId, RESET_ZWECK, seit)
    if (bisher >= grenze) {
      // **Die Grenze vor dem Erzeugen.** Ohne sie könnte ein Angreifer, der die
      // Adresse kennt, beliebig viele Tokens erzeugen — und jedes davon ist ein
      // weiterer Versuch, eines abzufangen.
      throw new Error(
        `zu viele Reset-Anfragen: ${String(bisher)} in den letzten ${String(Math.round(fensterSekunden / 60))} Minuten ` +
          `(Grenze ${String(grenze)})`,
      )
    }
  }

  const token = randomToken(32)
  const id = crypto.randomUUID()
  const laeuftAb = new Date(jetzt.getTime() + RESET_GUELTIG_SEKUNDEN * 1000)
  await ablage.legeAb({
    id,
    userId,
    zweck: RESET_ZWECK,
    // **Nur der Hash geht in die Ablage.** Das Klartext-Token steht danach nur
    // noch im Rückgabewert — und der Aufrufer gibt es dem Bediener.
    tokenHash: tokenHash(token),
    laeuftAb,
  })
  return { token, id, laeuftAb }
}

/**
 * Prüft ein vorgelegtes Token — **ohne es zu verbrauchen**.
 *
 * @param ablage - die Ablage
 * @param token - das Klartext-Token
 * @param jetzt - die Prüfzeit
 * @returns das Urteil
 */
export async function pruefeResetToken(ablage: TokenAblage, token: string, jetzt: Date): Promise<ResetUrteil> {
  if (token === '') {
    return { gueltig: false, regel: 'unbekannt', grund: 'kein Token vorgelegt' }
  }
  const eintrag = await ablage.finde(tokenHash(token), RESET_ZWECK)
  if (eintrag === undefined) {
    // **Dieselbe Meldung wie bei einem abgelaufenen oder verbrauchten Token** —
    // siehe {@link RESET_ABWEISUNG}. Ein Unterschied verriete, ob ein geratenes
    // Token je existiert hat.
    return { gueltig: false, regel: 'unbekannt', grund: RESET_ABWEISUNG }
  }
  if (eintrag.verbraucht) {
    return { gueltig: false, regel: 'verbraucht', grund: RESET_ABWEISUNG }
  }
  if (!(jetzt < eintrag.laeuftAb)) {
    // Der **Grund** ist für den Bediener und landet im Protokoll; nach außen geht
    // er nicht. Die Regel bleibt unterscheidbar — das ist gewollt, denn die
    // Ratenbegrenzung muß „abgelaufen" von „geraten" trennen können.
    return { gueltig: false, regel: 'abgelaufen', grund: RESET_ABWEISUNG }
  }
  return { gueltig: true, id: eintrag.id, userId: eintrag.userId }
}

/** Was zum Einlösen gebraucht wird. */
export interface EinloeseUmgebung {
  readonly ablage: TokenAblage
  readonly benutzer: UserStore
  readonly sitzungen: SessionStore
  readonly hasher: PasswordHasher
  readonly spur?: AuthEventSink
}

/** Das Ergebnis des Einlösens. */
export type EinloeseUrteil =
  | { readonly ok: true; readonly userId: string; readonly sitzungenWiderrufen: number }
  | { readonly ok: false; readonly regel: ResetRegel; readonly grund: string }

/**
 * Löst ein Reset-Token ein und setzt das neue Passwort.
 *
 * ## Die Reihenfolge ist Absicht
 *
 * 1. **Token prüfen** — wer kein gültiges Token hat, kommt nicht weiter.
 * 2. **Konto prüfen** — ein gesperrtes Konto bleibt gesperrt, auch mit Token.
 * 3. **Passwort prüfen** — dasselbe Regelwerk wie bei der Registrierung. Ein
 *    Reset darf nicht der Weg sein, an dem die Paßwortregeln vorbeiführen.
 * 4. **Verbrauchen** — **vor** dem Schreiben. Wer zuerst verbraucht, gewinnt;
 *    wer danach kommt, bekommt `verbraucht`. Andersherum könnten zwei Anfragen
 *    mit demselben Token beide ein Passwort setzen.
 * 5. **Schreiben**, dann **alle Sitzungen widerrufen**.
 *
 * @param umg - Ablage, Speicher, Hasher, Spur
 * @param token - das Klartext-Token
 * @param neuesPasswort - das neue Passwort im Klartext
 * @param jetzt - die Prüfzeit
 * @returns das Urteil
 */
export async function loeseResetTokenEin(
  umg: EinloeseUmgebung,
  token: string,
  neuesPasswort: string,
  jetzt: Date,
): Promise<EinloeseUrteil> {
  const geprueft = await pruefeResetToken(umg.ablage, token, jetzt)
  if (!geprueft.gueltig) {
    return { ok: false, regel: geprueft.regel, grund: geprueft.grund }
  }

  const benutzer = await umg.benutzer.findById(geprueft.userId)
  if (benutzer === undefined) {
    return { ok: false, regel: 'unbekannt', grund: 'zu diesem Token gibt es kein Konto mehr' }
  }
  if (benutzer.disabledAt !== undefined) {
    return { ok: false, regel: 'konto-gesperrt', grund: 'dieses Konto ist gesperrt' }
  }

  const passwortPruefung = checkPassword(neuesPasswort, benutzer.email)
  if (!passwortPruefung.ok) {
    // **Das Token bleibt gültig.** Wer ein zu schwaches Passwort wählt, soll es
    // noch einmal versuchen dürfen — ohne ein neues Token zu brauchen. Wer das
    // Token hier verbrauchte, bestrafte den falschen.
    return { ok: false, regel: 'passwort-zu-schwach', grund: passwortPruefung.hint }
  }

  // **Verbrauchen vor dem Schreiben** — und nur, wenn dieser Aufruf der erste ist.
  const verbraucht = await umg.ablage.verbrauche(geprueft.id, jetzt)
  if (!verbraucht) {
    return { ok: false, regel: 'verbraucht', grund: 'dieses Token wurde bereits eingelöst' }
  }

  const neuerHash = await umg.hasher.hash(neuesPasswort)
  await umg.benutzer.updatePasswordHash(benutzer.id, neuerHash)

  // **Und jetzt der Teil, der am häufigsten vergessen wird.** Ohne ihn behielte
  // ein Angreifer, der das Passwort kennt und es ändert, seinen Zugang über seine
  // ALTEN Sitzungen. Die Passwortänderung sperrt ihn dann nicht aus — und der
  // Benutzer erwartet das Gegenteil.
  //
  // **`() => jetzt` und nicht `jetzt`.** Der vierte Parameter ist eine
  // **Zeitquelle**, kein Zeitpunkt — die Funktion ruft sie selbst, wenn sie sie
  // braucht. Ein `Date` dort ist ein Typfehler, und er ist gut: er zwingt den
  // Aufrufer, sich zu entscheiden, ob die Zeit **einmal** genommen oder **bei
  // Bedarf** geholt wird. Hier ist sie einmal genommen — alle Vorgänge dieser
  // Einlösung sollen denselben Zeitpunkt sehen.
  const sitzungenWiderrufen = await revokeAllSessions(umg.sitzungen, benutzer.id, 'password-reset', () => jetzt)

  await umg.spur?.record({
    kind: 'password-changed',
    userId: benutzer.id,
    email: benutzer.email,
    detail: { durch: 'reset', sitzungenWiderrufen },
  })

  return { ok: true, userId: benutzer.id, sitzungenWiderrufen }
}
