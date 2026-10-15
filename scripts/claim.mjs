/**
 * `scripts/claim.mjs` — den Erstinbetriebnahme-Claim erzeugen.
 *
 * ## Warum es das geben muß
 *
 * Seit dem 13.10.2026 hat die Registrierung ein **Tor**: das erste Konto braucht
 * das Claim-Token aus `claim.txt`, und danach braucht jedes weitere einen
 * angemeldeten Administrator. `packages/auth/claim` kann einen Claim **erzeugen**
 * (`erzeugeClaim`) — aber nichts rief es auf.
 *
 * Gemessen, was das bedeutete (Host auf 3084, Betriebsdatenbank mit 4 Benutzern
 * und **0** Administratoren):
 *
 * ```
 * POST /api/pmh/auth/register  ->  403  {"code":"claim-fehlt", …}
 * POST … mit geratenem Token   ->  403  {"code":"claim-kein-claim"}
 * ```
 *
 * Der Weg war also offen und **niemand konnte ihn betreten**: ohne Skript gab es
 * keinen Claim. Ein Tor ohne Schlüssel ist eine Wand.
 *
 * ## Was es tut — und was es NICHT tut
 *
 * Es legt das Token in **zwei** Dateien: `claim-ablage.json` (nur der **Hash**,
 * Modus 0600) und `claim.txt` (der **Klartext**, Modus 0600, für den Eigentümer).
 * Wer die Ablage liest, hat damit kein Token — und ohne Token kein Adminkonto.
 *
 * Es **erzeugt keinen Administrator**. Das geschieht über den Weg
 * `POST /api/pmh/auth/register` mit dem Token — dort, wo die Regeln liegen und
 * geprüft werden. Dieses Skript bereitet nur den Nachweis vor.
 *
 * ## Wo der Claim liegt
 *
 * In **unserem** Home: `PMH_HOME`, sonst `~/.pmh`. **Nicht** im Home des Kerns
 * (`--home` des Hosts) — das ist ein anderer Ort, dort liegen die Sitzungen des
 * Kerns.
 *
 * **Und ausdrücklich NICHT in `~/.dsh`.** Der erste Entwurf nahm
 * `resolvePmhHome()`, dessen Kette `PMH_HOME → DSH_HOME → ~/.pmh` lautet. Auf
 * diesem Rechner ist `DSH_HOME` gesetzt, also schrieb das Skript nach
 * `C:\Users\Chang\.dsh` — dem Home des **anderen** Harness, das unangetastet
 * bleiben muß. Gemessen und zurückgenommen; jetzt entscheidet
 * `resolveEigenesHome()`, und die wirft, wenn der Pfad auf ein DSH-Home zeigt.
 *
 * @module scripts/claim
 */

import { existsSync } from 'node:fs'
import { resolveEigenesHome } from '../packages/util/home-paths/src/index.ts'
import { erzeugeClaim, leseMaschinenbindung, leseOderErzeugeGeraeteId, CLAIM_GUELTIG_SEKUNDEN } from '../packages/auth/claim/src/index.ts'
import { claimAblageImHome } from '../packages/api/auth-http/src/claim-store.ts'

/**
 * Zählt die Administratoren über die Datenbank der Anwendung.
 *
 * **Warum über `DATABASE_URL` und nicht über `MIGRATION_DATABASE_URL`.** Lesen
 * darf die Anwendungsrolle; das ist genau die Rolle, die auch die Anmeldung
 * benutzt. Wer für eine Abfrage die Eigentümerrolle nimmt, hebt das Rechtemodell
 * auf, ohne daß es auffällt.
 *
 * @param schreibe - wohin Ausgaben gehen
 * @returns die Zahl der Administratoren, oder `undefined`, wenn nicht lesbar
 */
async function zaehleAdmins(schreibe) {
  const adresse = process.env.DATABASE_URL?.trim() ?? ''
  if (adresse === '') {
    schreibe('WARNUNG: DATABASE_URL ist nicht gesetzt — die Zahl der Administratoren bleibt unbekannt.\n')
    return undefined
  }
  try {
    const { default: postgres } = await import('postgres')
    const sql = postgres(adresse, { max: 1, connect_timeout: 5, onnotice: () => undefined })
    try {
      const zeilen = await sql.unsafe(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`)
      return zeilen[0]?.n ?? 0
    } finally {
      await sql.end({ timeout: 5 })
    }
  } catch (fehler) {
    schreibe(`WARNUNG: die Administratoren ließen sich nicht zählen: ${fehler instanceof Error ? fehler.message : String(fehler)}\n`)
    return undefined
  }
}

/**
 * Erzeugt einen Claim.
 *
 * @param optionen - Ausgabe und Zeitquelle, austauschbar für Prüfungen
 * @returns der Exit-Code
 */
export async function erzeuge(optionen = {}) {
  const schreibe = optionen.schreibe ?? ((t) => process.stdout.write(t))
  const jetzt = optionen.jetzt ?? (() => new Date())
  const home = optionen.home ?? resolveEigenesHome()

  const admins = await zaehleAdmins(schreibe)
  // **Ein Claim, den niemand einlösen kann, ist ein Geheimnis auf der Platte.**
  // Gibt es schon einen Administrator, ist der Claim-Weg zu — dann wäre die Datei
  // ein Token ohne Wirkung, und ein Token ohne Wirkung ist eine Einladung, es
  // wieder wirksam zu machen. Deshalb wird hier abgebrochen.
  if (admins !== undefined && admins > 0) {
    schreibe(
      `Kein Claim erzeugt: es gibt bereits ${String(admins)} Administrator(en).\n` +
        '  Der Weg über den Claim ist damit zu — weitere Konten legt ein angemeldeter\n' +
        '  Administrator an. Wird der Zugang gebraucht, weil niemand mehr hineinkommt:\n' +
        '  die Rolle eines Kontos in der Datenbank auf `admin` setzen.\n',
    )
    return 1
  }

  // Die Gerätekennung **zuerst**: die Bindung braucht sie, und beim allerersten
  // Lauf gibt es die Datei noch nicht. Sie wird dabei angelegt (Modus 0600).
  leseOderErzeugeGeraeteId(home)
  const bindung = leseMaschinenbindung(home)
  const ablage = claimAblageImHome(home)
  const claim = await erzeugeClaim(home, bindung, ablage, jetzt())

  schreibe(
    'Claim für die Erstinbetriebnahme erzeugt.\n' +
      '\n' +
      `  Home:        ${home}\n` +
      `  Rechner:     ${bindung.hostname}\n` +
      `  Nutzer:      ${bindung.lokalerNutzer}\n` +
      `  Gültig bis:  ${claim.laeuftAb.toISOString()}  (${String(CLAIM_GUELTIG_SEKUNDEN / 60)} Minuten)\n` +
      '\n' +
      `  Claim-Token: ${claim.token}\n` +
      '\n' +
      `Der Klartext steht in ${claim.datei} (Modus 0600); die Ablage enthält nur den Hash.\n` +
      'Das Token gehört in den Körper von `POST /api/pmh/auth/register` als `claimToken`.\n' +
      'Das erste Konto wird damit ein **Administrator**.\n',
  )
  return 0
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('claim.mjs')) {
  process.exitCode = await erzeuge()
}
