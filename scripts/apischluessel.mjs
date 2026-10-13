/**
 * `scripts/apischluessel.mjs` — API-Schlüssel anlegen, auflisten, widerrufen, prüfen.
 *
 * ## Warum es das geben muß
 *
 * Die Tabelle `api_keys` steht seit Migration **0001** im Schema — mit Form,
 * Nebenbedingungen, Indizes und der Begründung, warum der Hash über das *ganze*
 * Token geht. Sie hatte **keinen Schreiber**. Dasselbe Muster wie bei `claim`,
 * `permissions`, `user_profiles`, der Kryptographie, den Geheimnissen und den
 * Einmal-Token: ein Verfahren ohne Aufrufer ist eine Behauptung.
 *
 * ## Was dieses Skript entscheidet
 *
 * | Frage | Antwort | Warum |
 * |---|---|---|
 * | Woher kommt der Pfeffer? | aus dem **Hauptschlüssel**, abgeleitet mit `pfefferAus` | er muß außerhalb der Datenbank liegen — sonst wäre er kein Pfeffer |
 * | Wann wird das Token gezeigt? | **einmal**, beim Anlegen | es ist nur als Hash gespeichert; ein zweites Mal gibt es nichts zu zeigen |
 * | Was passiert beim Widerrufen? | `revoked_at` wird gesetzt, **einmal** | ein zweiter Widerruf darf die Begründung des ersten nicht verwischen |
 *
 * ## Die ehrliche Grenze
 *
 * **Der Hauptschlüsselwechsel macht alle API-Schlüssel ungültig.** Der Pfeffer
 * wird aus ihm abgeleitet und liegt nirgends sonst; nach einem Wechsel läßt sich
 * kein alter Schlüssel mehr prüfen. Das ist der Preis dafür, daß der Pfeffer
 * nicht in der Datenbank liegt — und es steht auch in `packages/auth/apikey`.
 *
 * @module scripts/apischluessel
 */

import { join } from 'node:path'
import { resolveEigenesHome } from '../packages/util/home-paths/src/index.ts'
import { holeHauptschluessel, standardQuellen } from '../packages/auth/secrets/src/index.ts'
import {
  erzeugeApiKeyAblage,
  listeApiSchluessel,
  widerrufeApiSchluessel,
} from '../packages/auth/store-postgres/src/index.ts'
import {
  SCHLUESSEL_TAGE,
  erzeugeApiSchluessel,
  hasheToken,
  pfefferAus,
  pruefeApiSchluessel,
} from '../packages/auth/apikey/src/index.ts'

/**
 * Baut den Datenbankzugang, den Pfeffer und den Home-Pfad.
 *
 * @param umgebung - Umgebungsvariablen
 * @returns Zugang, Pfeffer und Home
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
  // Syntaxfehler.
  const zugang = {
    async unsafe(anweisung, werte = []) {
      return await sql.unsafe(anweisung, werte)
    },
  }
  const home = resolveEigenesHome(undefined, umgebung)
  const version = Number(umgebung.PMH_MASTER_KEY_VERSION?.trim() ?? '1')
  // **Die Leiter steht an einer Stelle** (`standardQuellen`): Datei im Home →
  // Docker-Secret → Umgebungsvariable. Vorher stand die Reihenfolge hier **und**
  // in `scripts/geheimnis.mjs`; mit der Docker-Stufe wären es drei Kopien einer
  // Sicherheitsaussage geworden.
  const haupt = holeHauptschluessel(
    standardQuellen(umgebung, home),
    Number.isInteger(version) && version > 0 ? version : 1,
  )
  // **Der Pfeffer ist nicht der Hauptschlüssel** — er wird daraus abgeleitet
  // (Ein-Schritt-HKDF-Expand). Derselbe Schlüssel für zwei Zwecke zu benutzen ist
  // genau das, was man nicht tut.
  const pfeffer = pfefferAus(haupt.schluessel)
  return { sql, zugang, pfeffer, home, haupt }
}

/** Liest einen Schalterwert, z. B. `--benutzer a@b.de`. */
function schalter(argv, name) {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}

/**
 * Führt einen Befehl aus.
 *
 * @param argv - die Argumente ohne `node` und Skriptpfad
 * @param umgebung - Umgebungsvariablen
 * @param schreibe - Ausgabe
 * @returns der Exit-Code
 */
export async function fuehreAus(argv, umgebung = process.env, schreibe = (t) => process.stdout.write(t)) {
  const befehl = argv[0]
  if (befehl === undefined || !['anlegen', 'liste', 'widerrufen', 'pruefe'].includes(befehl)) {
    schreibe(
      'Aufruf:\n' +
        '  bun scripts/apischluessel.mjs anlegen --benutzer <email> [--name Text] [--tage 90] [--scopes chat,search]\n' +
        '  bun scripts/apischluessel.mjs liste --benutzer <email>\n' +
        '  bun scripts/apischluessel.mjs widerrufen <key_id> [--grund Text]\n' +
        '  bun scripts/apischluessel.mjs pruefe <token>\n' +
        '\n' +
        '  Das Token wird beim Anlegen EINMAL ausgegeben. Danach gibt es nur noch\n' +
        '  den Hash — es läßt sich nicht erneut anzeigen, auch nicht von einem\n' +
        '  Administrator der Datenbank.\n',
    )
    return 1
  }

  const { sql, zugang, pfeffer, home, haupt } = await aufbau(umgebung)
  try {
    const ablage = erzeugeApiKeyAblage(zugang)
    const jetzt = new Date()

    if (befehl === 'anlegen') {
      const email = schalter(argv, '--benutzer')
      if (email === undefined || email.trim() === '') {
        schreibe('FEHLER: --benutzer <email> fehlt. Ohne Benutzer ist nicht klar, wem der Schlüssel gehört.\n')
        return 1
      }
      const nutzer = await zugang.unsafe(`SELECT id, disabled_at FROM users WHERE lower(email) = lower($1)`, [email])
      const userId = nutzer[0]?.id
      if (userId === undefined) {
        schreibe(`FEHLER: kein Benutzer mit der Adresse ${email}.\n`)
        return 1
      }
      if (nutzer[0]?.disabled_at !== null && nutzer[0]?.disabled_at !== undefined) {
        schreibe(`FEHLER: das Konto ${email} ist gesperrt. Ein Schlüssel dafür würde sofort abgewiesen.\n`)
        return 1
      }

      const tageText = schalter(argv, '--tage')
      const tage = tageText === undefined ? SCHLUESSEL_TAGE : Number(tageText)
      const scopesText = schalter(argv, '--scopes')
      const scopes =
        scopesText === undefined
          ? ['chat']
          : scopesText
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s !== '')
      if (scopes.length === 0) {
        schreibe('FEHLER: --scopes war leer. Ein Schlüssel ohne einen einzigen Umfang kann nichts.\n')
        return 1
      }

      const s = erzeugeApiSchluessel(jetzt, tage)
      // **Der Name wird angezeigt und nicht nur gespeichert.** Ein Name, den der
      // Bediener nach dem Anlegen nicht sieht, hilft ihm nicht beim
      // Unterscheiden — und genau dafür ist er da.
      const name = schalter(argv, '--name') ?? ''
      await ablage.legeAb({
        userId,
        keyId: s.keyId,
        tokenHash: hasheToken(pfeffer, s.token),
        displayPrefix: s.displayPrefix,
        name,
        scopes,
        laeuftAb: s.laeuftAb,
      })
      schreibe(
        `API-Schlüssel angelegt für ${email}:\n` +
          '\n' +
          `    ${s.token}\n` +
          '\n' +
          `  Kennung      ${s.keyId}\n` +
          `  Anzeige      ${s.displayPrefix}\n` +
          `  Name         ${name === '' ? '(ohne Namen)' : name}\n` +
          `  Umfänge      ${scopes.join(', ')}\n` +
          `  gültig bis   ${s.laeuftAb.toISOString()} (${String(tage)} Tage)\n` +
          `  Home         ${home}\n` +
          `  Pfeffer aus  ${haupt.herkunft}, Fassung ${String(haupt.version)}\n` +
          '\n' +
          'In der Datenbank steht NUR der HMAC dieses Tokens — und der HMAC allein\n' +
          'genügt nicht zum Prüfen: dafür wird der Pfeffer gebraucht, der aus dem\n' +
          'Hauptschlüssel kommt und NICHT in der Datenbank liegt. Wer die Datenbank\n' +
          'abzieht, kann einen Schlüssel damit weder lesen noch prüfen.\n' +
          '\n' +
          'Das Token steht jetzt in dieser Ausgabe und im Verlauf. Es wird NICHT\n' +
          'erneut angezeigt — kopieren Sie es jetzt.\n',
      )
      return 0
    }

    if (befehl === 'liste') {
      const email = schalter(argv, '--benutzer')
      if (email === undefined || email.trim() === '') {
        schreibe('FEHLER: --benutzer <email> fehlt.\n')
        return 1
      }
      const nutzer = await zugang.unsafe(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email])
      const userId = nutzer[0]?.id
      if (userId === undefined) {
        schreibe(`FEHLER: kein Benutzer mit der Adresse ${email}.\n`)
        return 1
      }
      const eintraege = await listeApiSchluessel(zugang, userId)
      if (eintraege.length === 0) {
        schreibe(`Keine API-Schlüssel für ${email}.\n`)
        return 0
      }
      schreibe(`API-Schlüssel von ${email} (${String(eintraege.length)}):\n`)
      for (const e of eintraege) {
        const zustand =
          e.widerrufenAm !== undefined
            ? `WIDERRUFEN am ${e.widerrufenAm}${e.widerrufenGrund === undefined ? '' : ` (${e.widerrufenGrund})`}`
            : e.laeuftAb <= jetzt.toISOString()
              ? `ABGELAUFEN am ${e.laeuftAb}`
              : `gültig bis ${e.laeuftAb}`
        schreibe(
          `  ${e.displayPrefix}  ${e.keyId}  ${e.name === '' ? '(ohne Namen)' : e.name}\n` +
            `      Umfänge ${e.scopes.join(', ')}  ${zustand}\n` +
            `      zuletzt benutzt: ${e.benutztAm ?? 'nie'}\n`,
        )
      }
      schreibe('\nKein Hash und kein Geheimnis — für diese Auskunft wird kein Hauptschlüssel gebraucht.\n')
      return 0
    }

    if (befehl === 'widerrufen') {
      const keyId = argv[1]
      if (keyId === undefined || keyId.trim() === '') {
        schreibe('FEHLER: widerrufen braucht eine key_id (die 12 Zeichen aus `liste`).\n')
        return 1
      }
      const grund = schalter(argv, '--grund') ?? 'widerrufen über scripts/apischluessel.mjs'
      const getroffen = await widerrufeApiSchluessel(zugang, keyId.trim(), grund, jetzt)
      if (!getroffen) {
        // **Zwei Möglichkeiten, und beide werden genannt.** „Gibt es nicht" und
        // „ist schon widerrufen" sind hier nicht zu unterscheiden — und das ist
        // Absicht: der zweite Widerruf darf die Begründung des ersten nicht
        // überschreiben.
        schreibe(
          `Kein offener Schlüssel mit der Kennung ${keyId}. Entweder gibt es ihn nicht, ` +
            'oder er ist bereits widerrufen (die Begründung des ersten Widerrufs bleibt stehen).\n',
        )
        return 2
      }
      schreibe(`Schlüssel ${keyId} widerrufen. Grund: ${grund}\n`)
      return 0
    }

    // befehl === 'pruefe'
    const token = argv[1]
    if (token === undefined || token.trim() === '') {
      schreibe('FEHLER: pruefe braucht ein Token.\n')
      return 1
    }
    const urteil = await pruefeApiSchluessel({ ablage, pfeffer }, token.trim(), jetzt)
    if (!urteil.gueltig) {
      // Die **Regel** für den Bediener, der **Satz** für jeden anderen.
      schreibe(`Der Schlüssel gilt nicht (${urteil.regel}): ${urteil.grund}\n`)
      return 2
    }
    const nutzer = await zugang.unsafe(`SELECT email FROM users WHERE id = $1`, [urteil.userId])
    schreibe(
      `Der Schlüssel gilt für ${nutzer[0]?.email ?? urteil.userId}.\n` +
        `  Kennung ${urteil.keyId}  Umfänge ${urteil.scopes.join(', ')}\n` +
        '  Der Zeitpunkt der Benutzung wurde vermerkt (last_used_at).\n',
    )
    return 0
  } catch (fehler) {
    schreibe(`FEHLER: ${fehler instanceof Error ? fehler.message : String(fehler)}\n`)
    return 1
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined)
  }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('apischluessel.mjs')) {
  process.exitCode = await fuehreAus(process.argv.slice(2))
}
