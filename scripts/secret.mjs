/**
 * `scripts/secret.mjs` — die Geheimnisse eines Benutzers setzen, ansehen, prüfen.
 *
 * ## Warum es das geben muß
 *
 * Seit Runde 10 gibt es die Umschlagverschlüsselung (`@prometheus-harness/secrets`),
 * und seit Runde 11 kann der Speicher sie ablegen. Aber **nichts** rief das auf:
 * die Tabelle `user_secrets` hatte keinen Aufrufer. Ein Verfahren ohne Aufrufer
 * ist eine Behauptung — dasselbe Muster wie bei `claim`, `permissions`,
 * `user_profiles` und der Kryptographie selbst.
 *
 * ## Die Entscheidung, die dieses Skript trifft: der Wert kommt über STDIN
 *
 * **Nicht als Argument.** Ein Argument steht in der Prozeßliste — unter Linux in
 * `/proc/<pid>/cmdline`, unter Windows in der Prozeßabfrage — und ist für
 * **jeden Benutzer desselben Rechners** lesbar. Ein Anbieterschlüssel, der so
 * hereinkommt, ist bereits geleakt, bevor er verschlüsselt ist.
 *
 * Dasselbe gilt für die **Ausgabe**: `hol` zeigt den Klartext **nur** mit
 * `--zeigen`, und der Hinweis darauf steht in der Ausgabe. Ohne den Schalter
 * bestätigt es nur, daß das Geheimnis sich öffnen läßt.
 *
 * ## Was es tut — und was es nicht tut
 *
 * Es **entschlüsselt nichts heimlich** und **schreibt nichts ins Protokoll**. Die
 * Prüfspur (`auth_events`) bekommt **keinen** Eintrag mit dem Wert — die Tabelle
 * ist ausdrücklich ohne Klartext-Geheimnisse angelegt.
 *
 * @module scripts/secret
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveEigenesHome } from '../packages/util/home-paths/src/index.ts'
import { HAUPTSSCHLUESSELDATEI, holeHauptschluessel, standardQuellen } from '../packages/auth/secrets/src/index.ts'
import { ladeGeheimnis, listeGeheimnisse, speichereGeheimnis } from '../packages/auth/store-postgres/src/index.ts'

/** Liest die gesamte Standardeingabe. */
async function leseStdin() {
  const stuecke = []
  for await (const stueck of process.stdin) stuecke.push(Buffer.from(stueck))
  return Buffer.concat(stuecke).toString('utf8')
}

/**
 * Baut den Datenbankzugang und den Hauptschlüssel.
 *
 * @param umgebung - Umgebungsvariablen
 * @returns Zugang und Hauptschlüssel
 */
export async function aufbau(umgebung) {
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
  // Syntaxfehler. Derselbe Fehler steht in `scripts/migrate.mjs` dokumentiert —
  // und ich bin trotzdem hineingelaufen: `error: Expected "}" but found "SqlZugang"`.
  const zugang = {
    async unsafe(anweisung, werte = []) {
      return await sql.unsafe(anweisung, werte)
    },
  }

  // **Zwei Argumente, und das erste ist NICHT die Umgebung.** Der erste Entwurf
  // schrieb `resolveEigenesHome(umgebung)` — damit wurde das ganze
  // Umgebungsobjekt als **Pfad** behandelt, und `expandHomePath` brach ab mit
  // `path.startsWith is not a function`. Die Unterschrift ist
  // `(configured?, env?)`.
  const home = resolveEigenesHome(undefined, umgebung)
  const version = Number(umgebung.PMH_MASTER_KEY_VERSION?.trim() ?? '1')
  // **Die Leiter steht an einer Stelle** (`standardQuellen`): Datei im Home →
  // Docker-Secret → Umgebungsvariable. Vorher stand die Reihenfolge hier und in
  // `scripts/api-key.mjs` — zwei Kopien einer Sicherheitsaussage.
  const haupt = holeHauptschluessel(
    standardQuellen(umgebung, home),
    Number.isInteger(version) && version > 0 ? version : 1,
  )
  return { sql, zugang, haupt, home }
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
  if (befehl === undefined || !['set', 'liste', 'pruefe'].includes(befehl)) {
    schreibe(
      'Aufruf:\n' +
        '  bun scripts/secret.mjs set <ref> --benutzer <email>      (Wert über STDIN)\n' +
        '  bun scripts/secret.mjs liste --benutzer <email>\n' +
        '  bun scripts/secret.mjs pruefe <ref> --benutzer <email> [--zeigen]\n' +
        '\n' +
        '  Der Wert kommt über die Standardeingabe, NICHT als Argument: Argumente\n' +
        '  stehen in der Prozeßliste und sind für jeden Benutzer dieses Rechners lesbar.\n',
    )
    return 1
  }

  const email = schalter(argv, '--benutzer')
  if (email === undefined) {
    schreibe('FEHLER: --benutzer <email> fehlt. Ohne Benutzer ist nicht klar, wem das Geheimnis gehört.\n')
    return 1
  }

  const { sql, zugang, haupt, home } = await aufbau(umgebung)
  try {
    const nutzer = await zugang.unsafe(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email])
    const userId = nutzer[0]?.id
    if (userId === undefined) {
      schreibe(`FEHLER: kein Benutzer mit der Adresse ${email}.\n`)
      return 1
    }

    if (befehl === 'liste') {
      const eintraege = await listeGeheimnisse(zugang, userId)
      if (eintraege.length === 0) {
        schreibe(`Keine Geheimnisse für ${email}.\n`)
        return 0
      }
      schreibe(`Geheimnisse von ${email} (${String(eintraege.length)}):\n`)
      for (const e of eintraege) {
        schreibe(`  ${e.ref.padEnd(28)} Fassung ${String(e.masterKeyVersion)}  Hinweis ${e.keyHint}  ${e.updatedAt}\n`)
      }
      schreibe('\nKein Klartext und kein Geheimtext — für diese Auskunft wird kein Hauptschlüssel gebraucht.\n')
      return 0
    }

    const ref = argv[1]
    if (ref === undefined || ref.trim() === '') {
      schreibe(`FEHLER: ${befehl} braucht einen Namen (ref), z. B. DEEPSEEK_API_KEY.\n`)
      return 1
    }

    if (befehl === 'set') {
      const wert = (await leseStdin()).replace(/\r?\n$/u, '')
      if (wert.trim() === '') {
        schreibe('FEHLER: die Eingabe war leer. Der Wert wird über STDIN erwartet.\n')
        return 1
      }
      await speichereGeheimnis(zugang, haupt, {
        userId,
        ref,
        klartext: new TextEncoder().encode(wert),
      })
      const danach = await listeGeheimnisse(zugang, userId)
      const eintrag = danach.find((e) => e.ref === ref)
      schreibe(
        `Geheimnis gespeichert: ${ref} für ${email}\n` +
          `  Fassung ${String(eintrag?.masterKeyVersion ?? haupt.version)}  Hinweis ${eintrag?.keyHint ?? '?'}\n` +
          `  Hauptschlüssel aus: ${haupt.herkunft}\n` +
          `  Home: ${home}\n` +
          '\nDer Wert wurde NICHT angezeigt und steht in keiner Ausgabe.\n',
      )
      return 0
    }

    // befehl === 'pruefe'
    const klartext = await ladeGeheimnis(zugang, haupt, { userId, ref })
    if (klartext === undefined) {
      schreibe(`FEHLER: kein Geheimnis mit dem Namen ${ref} für ${email}.\n`)
      return 1
    }
    if (argv.includes('--zeigen')) {
      schreibe(`${new TextDecoder().decode(klartext)}\n`)
      return 0
    }
    schreibe(
      `${ref} läßt sich öffnen: ${String(klartext.length)} Byte Klartext.\n` +
        '  Der Wert wurde NICHT angezeigt. Mit --zeigen wird er ausgegeben —\n' +
        '  dann steht er im Verlauf und in der Bildschirmausgabe.\n',
    )
    return 0
  } catch (fehler) {
    schreibe(`FEHLER: ${fehler instanceof Error ? fehler.message : String(fehler)}\n`)
    return 1
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined)
  }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('secret.mjs')) {
  process.exitCode = await fuehreAus(process.argv.slice(2))
}
