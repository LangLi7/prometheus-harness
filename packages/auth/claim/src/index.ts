/**
 * `@prometheus-harness/claim` — die Erstinbetriebnahme über den Rechner selbst.
 *
 * ## Die Weisung
 *
 * *„beim first login sollte der claim ect über den rechner selbst wo es läuft
 * bestätigt werden und danach user, login ect erstellt werden bzw muss."*
 *
 * ## Warum das die richtige Vertrauenswurzel ist
 *
 * Ein frisch installiertes System hat **keine** Benutzer. Wer das erste Konto
 * anlegt, ist der Eigentümer. Der klassische Fehler ist ein voreingestelltes
 * Kennwort (`admin/admin`) — ein Hintertürchen, das niemand schließt.
 *
 * Der Claim bindet stattdessen an **lokalen Zugang**. Das ist keine Willkür,
 * sondern die **ehrliche** Grenze: wer eine Shell auf diesem Rechner hat, könnte
 * ohnehin alles lesen und ändern. Ein Claim über das Netz wäre **schwächer** als
 * die Wirklichkeit — er würde eine Grenze behaupten, die es nicht gibt.
 *
 * ## Was gebunden wird — und warum drei Dinge
 *
 * | Bindung | Was sie beweist |
 * |---|---|
 * | **Hostname** | der Rechner ist der erwartete |
 * | **lokaler Nutzer** | das Konto gehört dem, der am Rechner sitzt |
 * | **Gerätekennung** (32 Zufallsbytes, Datei `0600`, einmal erzeugt) | **Zugriff auf dieses Dateisystem** — ein Hostname ist eine Behauptung, eine Datei mit Rechten `0600` ist ein Nachweis |
 *
 * Ohne die dritte Bindung genügte das Kopieren von `claim.txt` auf einen anderen
 * Rechner mit gleichem Hostnamen. Mit ihr scheitert es.
 *
 * ## Was dieses Paket **nicht** tut
 *
 * Es legt **keine** Konten an und kennt **keine** Datenbank. Es entscheidet
 * ausschließlich: *ist dieser Claim gültig, und darf damit jetzt das erste Konto
 * entstehen?* Das Anlegen selbst gehört in die Auth-Schicht, wo Argon2id und die
 * Sitzungen liegen. Diese Trennung macht die Entscheidung ohne laufenden Stapel
 * prüfbar — eine Prüfung, die nur mit Datenbank läuft, wird nicht geprüft.
 *
 * @module @prometheus-harness/claim
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Die Maschinenbindung
// ---------------------------------------------------------------------------

/** Der Name der Datei, die den Rechner ausweist. */
export const GERAETEDATEI = 'geraet'

/** Der Name der Datei, in die der Claim für den Eigentümer gelegt wird. */
export const CLAIMDATEI = 'claim.txt'

/** Wie lange ein Claim gilt. */
export const CLAIM_GUELTIG_SEKUNDEN = 15 * 60

/** Die Merkmale, an die ein Claim gebunden ist. */
export interface Maschinenbindung {
  readonly hostname: string
  readonly lokalerNutzer: string
  /** Hexadezimale Gerätekennung — 32 Zufallsbytes, einmal erzeugt. */
  readonly geraeteId: string
}

/** Ein gespeicherter Claim — **nie** im Klartext. */
export interface ClaimEintrag {
  /** SHA-256-Hash des Tokens, hexadezimal. */
  readonly tokenHash: string
  readonly hostname: string
  readonly lokalerNutzer: string
  readonly geraeteId: string
  /** Ablaufzeitpunkt. */
  readonly laeuftAb: Date
  /** Ob er schon eingelöst wurde. */
  readonly verbraucht: boolean
}

/**
 * Wo ein Claim liegt. **Als Schnittstelle, damit die Prüfung keine Datenbank braucht.**
 *
 * Die echte Ablage ist `one_time_tokens` mit `purpose = 'erster-admin'`. Diese
 * Schnittstelle ist die kleinste Form davon, und die Prüfungen benutzen einen
 * Speicher.
 */
export interface ClaimAblage {
  /** Legt einen Claim ab und gibt ihn mit Ablauf zurück. */
  legeAb(eintrag: ClaimEintrag): Promise<void>
  /** Liest den jüngsten nicht verbrauchten Claim. */
  liesJüngsten(): Promise<ClaimEintrag | undefined>
  /** Markiert den Claim als verbraucht. */
  verbrauche(tokenHash: string): Promise<void>
}

/** Ein Urteil über einen Claim. */
export type ClaimUrteil =
  | { readonly gueltig: true }
  | { readonly gueltig: false; readonly regel: ClaimRegel; readonly grund: string }

/** Warum ein Claim abgewiesen wurde. */
export type ClaimRegel =
  | 'gueltig'
  | 'kein-claim'
  | 'abgelaufen'
  | 'verbraucht'
  | 'token-falsch'
  | 'anderer-rechner'
  | 'anderer-nutzer'
  | 'andere-geraetekennung'

// ---------------------------------------------------------------------------
// Zufall und Hash
// ---------------------------------------------------------------------------

/**
 * Erzeugt ein Claim-Token: 32 Zufallsbytes als base64url.
 *
 * **256 Bit, dieselbe Größe wie Sitzungstoken.** Ein Claim ist ein
 * Einmal-Geheimnis; ein kürzeres wäre erratbar, und ein erratener Claim heißt:
 * ein Fremder legt das Adminkonto an.
 *
 * @returns der Klartext des Tokens
 */
export function erzeugeToken(): string {
  return randomBytes(32).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

/**
 * Bildet den SHA-256-Hash eines Tokens.
 *
 * **Warum SHA-256 und kein Argon2id.** Dasselbe Argument wie bei den
 * Sitzungstoken in `packages/auth/auth`: 256 Bit Zufall sind nicht zu erraten,
 * gleichgültig wie schnell das Verfahren ist. Ein langsames Verfahren kostete hier
 * nur Zeit und brächte nichts.
 *
 * @param token - der Klartext
 * @returns 64 hexadezimale Zeichen
 */
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Vergleicht zwei Hex-Werte in konstanter Zeit. */
function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

// ---------------------------------------------------------------------------
// Die Gerätekennung — der Nachweis von Dateizugriff
// ---------------------------------------------------------------------------

/**
 * Liest die Gerätekennung oder erzeugt sie beim ersten Mal.
 *
 * **Warum eine Datei und nicht die Maschinenkennung des Systems.** Die
 * Systemkennung (`/etc/machine-id`, Windows `MachineGuid`) ist lesbar, sobald
 * jemand irgendwo Zugriff hat — sie beweist nichts über **diesen** Nutzer. Eine
 * Datei mit Rechten `0600` im Home des lokalen Nutzers beweist, daß der Claim
 * von jemandem kommt, der **hier** schreiben darf.
 *
 * **Warum `wx` beim Anlegen.** Exklusiv, damit zwei gleichzeitige Starts nicht
 * zwei verschiedene Kennungen erzeugen und einer davon ungültig wird. Scheitert
 * das Anlegen, weil die Datei inzwischen da ist, wird sie gelesen.
 *
 * @param home - das Harness-Home
 * @returns die hexadezimale Kennung
 */
export function leseOderErzeugeGeraeteId(home: string): string {
  const pfad = join(home, GERAETEDATEI)
  try {
    const vorhanden = readFileSync(pfad, 'utf8').trim()
    if (/^[0-9a-f]{64}$/u.test(vorhanden)) return vorhanden
    // Eine unbrauchbare Datei wird NICHT stillschweigend ersetzt: sie könnte
    // bedeuten, daß jemand daran war. Ein Fehler ist hier ehrlicher.
    throw new Error(
      `${pfad} enthält keine gültige Gerätekennung (64 Hex-Zeichen erwartet) — ` +
        `die Datei wurde von Hand verändert; bitte prüfen und entfernen`,
    )
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException).code !== 'ENOENT') throw fehler
  }
  const neu = randomBytes(32).toString('hex')
  mkdirSync(home, { recursive: true })
  writeFileSync(pfad, `${neu}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  return neu
}

/**
 * Liest die Bindung dieses Rechners.
 *
 * @param home - das Harness-Home
 * @returns Hostname, lokaler Nutzer und Gerätekennung
 */
export function leseMaschinenbindung(home: string): Maschinenbindung {
  return {
    hostname: hostname(),
    lokalerNutzer: userInfo().username,
    geraeteId: leseOderErzeugeGeraeteId(home),
  }
}

// ---------------------------------------------------------------------------
// Der Claim
// ---------------------------------------------------------------------------

/** Was beim Anlegen eines Claims herauskommt. */
export interface NeuerClaim {
  /** Der Klartext — geht **nur** an die Konsole und in die Datei, nie in die Ablage. */
  readonly token: string
  /** Wohin er geschrieben wurde. */
  readonly datei: string
  readonly laeuftAb: Date
}

/**
 * Erzeugt einen Claim und legt ihn ab.
 *
 * **Die Ablage bekommt nur den Hash.** Wer die Ablage liest, hat damit kein
 * Token — und ohne Token kein Adminkonto.
 *
 * @param home - das Harness-Home
 * @param bindung - die Bindung dieses Rechners
 * @param ablage - wo der Claim liegt
 * @param jetzt - die Prüfzeit
 * @returns Token, Dateipfad und Ablauf
 */
export async function erzeugeClaim(
  home: string,
  bindung: Maschinenbindung,
  ablage: ClaimAblage,
  jetzt: Date,
): Promise<NeuerClaim> {
  const token = erzeugeToken()
  const laeuftAb = new Date(jetzt.getTime() + CLAIM_GUELTIG_SEKUNDEN * 1000)
  await ablage.legeAb({
    tokenHash: tokenHash(token),
    hostname: bindung.hostname,
    lokalerNutzer: bindung.lokalerNutzer,
    geraeteId: bindung.geraeteId,
    laeuftAb,
    verbraucht: false,
  })
  const datei = join(home, CLAIMDATEI)
  mkdirSync(home, { recursive: true })
  writeFileSync(
    datei,
    [
      'Erstinbetriebnahme des Prometheus Harness',
      '',
      'Wer diese Datei lesen kann, darf das erste Konto anlegen — und es wird ein Admin.',
      'Das ist Absicht: lokaler Zugang ist die Vertrauenswurzel.',
      '',
      `  Claim-Token: ${token}`,
      `  Gültig bis:  ${laeuftAb.toISOString()}`,
      '',
      'Nach dem Einlösen wird diese Datei gelöscht und es entsteht kein neuer Claim.',
      '',
    ].join('\n'),
    { encoding: 'utf8', mode: 0o600 },
  )
  return { token, datei, laeuftAb }
}

/**
 * Prüft einen vorgelegten Claim.
 *
 * **Die Reihenfolge ist Absicht** — und die Abweisungen sind **unterscheidbar**,
 * anders als bei einer Anmeldung. Das ist hier richtig: der Claim ist kein
 * Anmeldeversuch eines Fremden, sondern der **Eigentümer**, der wissen muß, was
 * schiefging. Bei einer Anmeldung wäre eine unterscheidbare Meldung eine
 * Auskunft über fremde Konten; hier gibt es genau einen Claim und genau einen
 * Berechtigten.
 *
 * @param vorgelegt - das vorgelegte Token
 * @param bindung - die Bindung dieses Rechners
 * @param ablage - wo der Claim liegt
 * @param jetzt - die Prüfzeit
 * @returns das Urteil
 */
export async function pruefeClaim(
  vorgelegt: string,
  bindung: Maschinenbindung,
  ablage: ClaimAblage,
  jetzt: Date,
): Promise<ClaimUrteil> {
  const eintrag = await ablage.liesJüngsten()
  if (eintrag === undefined) {
    return {
      gueltig: false,
      regel: 'kein-claim',
      grund: 'es liegt kein Claim vor — entweder ist das System schon eingerichtet oder es kam keiner',
    }
  }
  if (eintrag.verbraucht) {
    return { gueltig: false, regel: 'verbraucht', grund: 'dieser Claim wurde bereits eingelöst' }
  }
  if (!(jetzt < eintrag.laeuftAb)) {
    return {
      gueltig: false,
      regel: 'abgelaufen',
      grund: `der Claim lief am ${eintrag.laeuftAb.toISOString()} ab`,
    }
  }
  // **Der Bindungsvergleich kommt VOR dem Tokenvergleich.** Beide sind nötig;
  // die Reihenfolge entscheidet nur, welche Auskunft der Eigentümer bekommt — und
  // „falscher Rechner" ist die nützlichere.
  if (eintrag.hostname !== bindung.hostname) {
    return {
      gueltig: false,
      regel: 'anderer-rechner',
      grund: `der Claim gehört zum Rechner "${eintrag.hostname}", hier läuft "${bindung.hostname}"`,
    }
  }
  if (eintrag.lokalerNutzer !== bindung.lokalerNutzer) {
    return {
      gueltig: false,
      regel: 'anderer-nutzer',
      grund: `der Claim gehört dem lokalen Nutzer "${eintrag.lokalerNutzer}", vorgelegt von "${bindung.lokalerNutzer}"`,
    }
  }
  if (!gleich(eintrag.geraeteId, bindung.geraeteId)) {
    return {
      gueltig: false,
      regel: 'andere-geraetekennung',
      grund:
        'die Gerätekennung stimmt nicht — die Claim-Datei stammt von einem anderen Dateisystem; ' +
        'das Kopieren der Datei genügt nicht',
    }
  }
  if (!gleich(eintrag.tokenHash, tokenHash(vorgelegt))) {
    return { gueltig: false, regel: 'token-falsch', grund: 'das Claim-Token stimmt nicht' }
  }
  await ablage.verbrauche(eintrag.tokenHash)
  return { gueltig: true }
}

/**
 * Räumt den Claim weg, nachdem das Adminkonto steht.
 *
 * **Warum das Löschen zur Entscheidung gehört und nicht zum Aufräumen.** Bliebe
 * die Datei liegen, läge das Token weiter auf der Platte — und ein Token, das
 * nicht mehr gilt, aber noch existiert, ist eine Einladung, es wieder gültig zu
 * machen.
 *
 * @param home - das Harness-Home
 * @returns ob eine Datei entfernt wurde
 */
export function entferneClaimdatei(home: string): boolean {
  const datei = join(home, CLAIMDATEI)
  try {
    rmSync(datei)
    return true
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw fehler
  }
}

// ---------------------------------------------------------------------------
// Die Erstinbetriebnahme als Entscheidung
// ---------------------------------------------------------------------------

/**
 * Darf jetzt ein erstes Konto entstehen?
 *
 * **Warum diese Funktion und nicht ein `if` beim Aufrufer.** Die Regel lautet:
 * **solange ein Benutzer existiert, wird kein Claim erzeugt**. Stünde sie beim
 * Aufrufer, gäbe es zwei Aufrufer und zwei Fassungen der Regel — und die zweite
 * wäre die Lücke.
 *
 * @param anzahlBenutzer - wie viele Benutzer es gibt
 * @returns ob die Erstinbetriebnahme offen ist
 */
export function erstinbetriebnahmeOffen(anzahlBenutzer: number): boolean {
  return anzahlBenutzer === 0
}
