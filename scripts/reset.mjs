/**
 * `scripts/reset.mjs` — ein vergessenes Paßwort zurücksetzen.
 *
 * ## Warum es das geben muß
 *
 * Seit Runde 12 gibt es `@prometheus-harness/reset` (die Regeln) und
 * `erzeugeTokenAblage` in `store-postgres` (die Ablage). Aber **nichts** rief das
 * auf: `erzeugeResetToken` hatte außerhalb der Prüfungen keinen Aufrufer. Ein
 * Verfahren ohne Aufrufer ist eine Behauptung — dasselbe Muster wie bei `claim`,
 * `permissions`, `user_profiles`, der Kryptographie und den Geheimnissen.
 *
 * ## Warum ein Skript und kein Endpunkt
 *
 * **Es gibt keinen Postausgang.** Ohne Mailübergang kann kein Endpunkt ein Token
 * *zuschicken* — er könnte es nur zurückgeben, und dann läge es im Antwortkörper
 * einer HTTP-Anfrage, im Verlauf des Browsers und in jedem Zwischenprotokoll.
 * Der Bediener ist hier der **Bote**: er fordert an und gibt weiter. Genau
 * deshalb gilt das Token **15 Minuten** und nicht einen Tag.
 *
 * ## Die zwei Entscheidungen über Geheimnisse
 *
 * | Geheimnis | Wie es hereinkommt | Warum |
 * |---|---|---|
 * | das **neue Paßwort** | über **STDIN**, nie als Argument | ein Argument steht in der Prozeßliste (`/proc/<pid>/cmdline`) und ist für jeden Benutzer desselben Rechners lesbar |
 * | das **Reset-Token** | wird **ausgegeben** | es ist der einzige Zweck dieses Tokens, weitergegeben zu werden. Es wird **einmal** ausgegeben, mit dem Hinweis, daß es jetzt im Verlauf steht |
 *
 * In der Datenbank steht von beidem **nichts im Klartext**: das Token nur als
 * SHA-256-Hash, das Paßwort nur als Argon2id-Hash.
 *
 * @module scripts/reset
 */

import { join } from 'node:path'
import { resolveEigenesHome } from '../packages/util/home-paths/src/index.ts'
import { Argon2PasswordHasher } from '../packages/auth/auth/src/index.ts'
import { erzeugeTokenAblage, erzeugeSpeicher } from '../packages/auth/store-postgres/src/index.ts'
import {
  RESET_GUELTIG_SEKUNDEN,
  erzeugeResetToken,
  loeseResetTokenEin,
  pruefeResetToken,
} from '../packages/auth/reset/src/index.ts'

/** Liest die gesamte Standardeingabe. */
async function leseStdin() {
  const stuecke = []
  for await (const stueck of process.stdin) stuecke.push(Buffer.from(stueck))
  return Buffer.concat(stuecke).toString('utf8')
}

/**
 * Baut den Datenbankzugang.
 *
 * @param umgebung - Umgebungsvariablen
 * @returns Zugang und Home
 */
async function aufbau(umgebung) {
  const adresse = umgebung.DATABASE_URL?.trim() ?? ''
  if (adresse === '') {
    throw new Error(
      'DATABASE_URL ist nicht gesetzt. Das Skript braucht die Rolle der Anwendung (`pmh_app`), ' +
        'weil es Daten schreibt — nicht die des Eigentümers.',
    )
  }
  const { default: postgres } = await import('postgres')
  const sql = postgres(adresse, { max: 1, connect_timeout: 5, onnotice: () => undefined })
  // **Keine Typangabe.** Diese Datei ist eine `.mjs` und wird von Bun als
  // **JavaScript** ausgeführt; `const zugang: SqlZugang = …` ist dort ein
  // Syntaxfehler — derselbe, der in `scripts/migrate.mjs` dokumentiert ist.
  const zugang = {
    async unsafe(anweisung, werte = []) {
      return await sql.unsafe(anweisung, werte)
    },
  }
  // **Zwei Argumente, und das erste ist NICHT die Umgebung.** Die Unterschrift ist
  // `(configured?, env?)`; `resolveEigenesHome(umgebung)` brach ab mit
  // `path.startsWith is not a function`.
  const home = resolveEigenesHome(undefined, umgebung)
  return { sql, zugang, home }
}

/** Liest einen Schalterwert, z. B. `--benutzer a@b.de`. */
function schalter(argv, name) {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}

/** Die Vorgabe für die Ratenbegrenzung: fünf Anforderungen je Stunde und Konto. */
const GRENZE_PRO_STUNDE = 5

/**
 * Führt einen Befehl aus.
 *
 * @param argv - die Argumente ohne `node` und Skriptpfad
 * @param umgebung - Umgebungsvariablen
 * @param schreibe - Ausgabe
 * @param lese - Eingabe; ein eigener Leser ist der **Einschub für die Prüfung**
 * @returns der Exit-Code
 */
export async function fuehreAus(
  argv,
  umgebung = process.env,
  schreibe = (t) => process.stdout.write(t),
  lese = leseStdin,
) {
  const befehl = argv[0]
  if (befehl === undefined || !['anfordern', 'pruefen', 'einloesen'].includes(befehl)) {
    schreibe(
      'Aufruf:\n' +
        '  bun scripts/reset.mjs anfordern --benutzer <email>\n' +
        '  bun scripts/reset.mjs pruefen <token>\n' +
        '  bun scripts/reset.mjs einloesen <token>          (neues Passwort über STDIN)\n' +
        '\n' +
        '  Das neue Passwort kommt über die Standardeingabe, NICHT als Argument:\n' +
        '  Argumente stehen in der Prozeßliste und sind für jeden Benutzer dieses\n' +
        '  Rechners lesbar. Das Token wird ausgegeben — es ist zum Weitergeben da.\n',
    )
    return 1
  }

  const { sql, zugang, home } = await aufbau(umgebung)
  try {
    const ablage = erzeugeTokenAblage(zugang)
    const speicher = erzeugeSpeicher(zugang)
    const jetzt = new Date()

    // -------------------------------------------------------------------
    // Anfordern
    // -------------------------------------------------------------------
    if (befehl === 'anfordern') {
      const email = schalter(argv, '--benutzer')
      if (email === undefined || email.trim() === '') {
        schreibe('FEHLER: --benutzer <email> fehlt. Ohne Benutzer ist nicht klar, wem das Token gehört.\n')
        return 1
      }
      const benutzer = await speicher.benutzer.findByEmail(email)
      if (benutzer === undefined) {
        // **Kein Unterschied nach außen wäre hier falsch am Platz.** Dieses
        // Skript bedient den **Bediener**, nicht einen Fremden über das Netz: er
        // muß wissen, ob er sich vertippt hat. Der Schutz gegen das Auskundschaften
        // von Adressen gehört an den Endpunkt (§7 im Belegtext) — dort, wo ein
        // Unbekannter fragt.
        schreibe(`FEHLER: kein Benutzer mit der Adresse ${email}.\n`)
        return 1
      }
      if (benutzer.disabledAt !== undefined) {
        schreibe(`FEHLER: das Konto ${email} ist gesperrt. Ein Reset würde es nicht entsperren.\n`)
        return 1
      }

      const neues = await erzeugeResetToken(ablage, benutzer.id, jetzt, GRENZE_PRO_STUNDE)
      const ablauf = neues.laeuftAb.toISOString()
      schreibe(
        `Reset-Token für ${email}:\n` +
          '\n' +
          `    ${neues.token}\n` +
          '\n' +
          `  gültig bis ${ablauf} (${String(RESET_GUELTIG_SEKUNDEN / 60)} Minuten)\n` +
          `  Home: ${home}\n` +
          `  Grenze: ${String(GRENZE_PRO_STUNDE)} Anforderungen je Stunde und Konto\n` +
          '\n' +
          'In der Datenbank steht NUR der SHA-256-Hash dieses Tokens — wer die\n' +
          'Datenbank liest, kann damit kein Passwort setzen. Das Token steht jetzt\n' +
          'in dieser Ausgabe und im Verlauf; geben Sie es weiter und schließen Sie\n' +
          'das Fenster danach.\n',
      )
      return 0
    }

    // -------------------------------------------------------------------
    // Prüfen und Einlösen — beide brauchen ein Token
    // -------------------------------------------------------------------
    const token = argv[1]
    if (token === undefined || token.trim() === '') {
      schreibe(`FEHLER: ${befehl} braucht ein Token.\n`)
      return 1
    }

    if (befehl === 'pruefen') {
      const urteil = await pruefeResetToken(ablage, token.trim(), jetzt)
      if (!urteil.gueltig) {
        // Die **Regel** ist für den Bediener; der **Grund** ist der gemeinsame
        // Satz, den auch ein Fremder zu hören bekäme.
        schreibe(`Das Token gilt nicht (${urteil.regel}): ${urteil.grund}\n`)
        return 2
      }
      const benutzer = await speicher.benutzer.findById(urteil.userId)
      schreibe(
        `Das Token gilt für ${benutzer?.email ?? urteil.userId}.\n` +
          '  Geprüft, NICHT verbraucht — es ist danach unverändert gültig.\n',
      )
      return 0
    }

    // befehl === 'einloesen'
    const neuesPasswort = (await lese()).replace(/\r?\n$/u, '')
    if (neuesPasswort.trim() === '') {
      schreibe('FEHLER: die Eingabe war leer. Das neue Passwort wird über STDIN erwartet.\n')
      return 1
    }

    const hasher = new Argon2PasswordHasher()
    const urteil = await loeseResetTokenEin(
      { ablage, benutzer: speicher.benutzer, sitzungen: speicher.sitzungen, hasher, spur: speicher.spur },
      token.trim(),
      neuesPasswort,
      jetzt,
    )
    if (!urteil.ok) {
      // Bei einem zu schwachen Paßwort ist das Token **absichtlich** noch gültig
      // (siehe `packages/auth/reset`): der Benutzer darf es noch einmal versuchen.
      const zusatz =
        urteil.regel === 'passwort-zu-schwach'
          ? '  Das Token ist WEITER gültig — wählen Sie ein anderes Passwort und rufen Sie erneut auf.\n'
          : ''
      schreibe(`Das Passwort wurde nicht gesetzt (${urteil.regel}): ${urteil.grund}\n${zusatz}`)
      return urteil.regel === 'passwort-zu-schwach' ? 3 : 2
    }

    const benutzer = await speicher.benutzer.findById(urteil.userId)
    schreibe(
      `Passwort neu gesetzt für ${benutzer?.email ?? urteil.userId}.\n` +
        `  Sitzungen widerrufen: ${String(urteil.sitzungenWiderrufen)}\n` +
        '  Das Token ist damit verbraucht und wirkt kein zweites Mal.\n' +
        '\n' +
        'Das Passwort wurde NICHT angezeigt und steht in keiner Ausgabe; in der\n' +
        'Datenbank steht nur sein Argon2id-Hash.\n',
    )
    return 0
  } catch (fehler) {
    schreibe(`FEHLER: ${fehler instanceof Error ? fehler.message : String(fehler)}\n`)
    return 1
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined)
  }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('reset.mjs')) {
  process.exitCode = await fuehreAus(process.argv.slice(2))
}
