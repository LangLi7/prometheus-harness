/**
 * Woher der Hauptschlüssel kommt — und was passiert, wenn er nicht da ist.
 *
 * ## Die Reihenfolge, und warum sie so ist
 *
 * Der Auftrag nennt sie vor: **Datei 0600 → Docker-Secret → Vault/KMS.** Diese
 * Datei baut die **erste** Stufe und die Übergangsstufe, die es heute gibt:
 *
 * | Stufe | Quelle | Stand |
 * |---|---|---|
 * | 1 | Datei mit Modus 0600 | **gebaut** |
 * | 2 | Docker-Secret (`/run/secrets/…`) | offen — ist eine Datei an einem anderen Ort, die Stufe 1 mit anderem Pfad |
 * | 3 | Vault/KMS | offen — braucht einen Dienst |
 * | — | **Umgebungsvariable** | **Übergang**, siehe unten |
 *
 * ## Warum die Umgebungsvariable noch gelesen wird — und trotzdem das Ziel ist, sie loszuwerden
 *
 * Heute steht `PMH_MASTER_KEY` in `.env`. Sie sofort nicht mehr zu lesen hieße:
 * die bestehende Installation verliert ihren Hauptschlüssel, und **jede bereits
 * verschlüsselte Zeile wäre nicht mehr zu öffnen**. Deshalb bleibt sie als
 * **letzte** Stufe — und die erste Stufe, die gefunden wird, gewinnt.
 *
 * **Warum die Umgebungsvariable das Ziel ist, das weg soll.** Eine
 * Umgebungsvariable ist für **jeden Prozeß desselben Benutzers** lesbar
 * (`/proc/<pid>/environ` unter Linux, die Prozeßliste unter Windows) und landet
 * in Fehlerberichten und Container-Inspektionen. Eine Datei mit 0600 ist enger.
 *
 * ## Der gemessene Befund, der den Rechteprüfstand bestimmt
 *
 * Auf **NTFS meldet `fs.Stats.mode` immer `0o666`** — gemessen:
 *
 * ```
 * writeFileSync(p, 'x', { mode: 0o600 })  ->  statSync(p).mode & 0o777 === 0o666
 * chmodSync(p, 0o600)                     ->  statSync(p).mode & 0o777 === 0o666
 * ```
 *
 * **Was daraus folgt.** Eine strenge Prüfung „die Datei muß 0600 sein" würde auf
 * diesem Rechner **immer** scheitern — die Stufe wäre unbenutzbar. Eine stille
 * Prüfung, die immer durchgeht, wäre schlimmer: sie **sieht aus wie ein Schutz
 * und ist keiner**. Deshalb gilt:
 *
 * * **Auf POSIX** ist eine gruppen- oder weltlesbare Schlüsseldatei ein
 *   **Fehler**. Dort ist der Modus eine echte Aussage.
 * * **Auf Windows** wird **gesagt**, daß die Prüfung nicht möglich ist — und
 *   benannt, was die Datei wirklich schützt (das Benutzerprofil). Kein
 *   stillschweigendes „bestanden".
 *
 * @module @prometheus-harness/secrets/schluesselgeber
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { platform } from 'node:os'
import { KryptoFehler, SCHLUESSEL_BYTES, erzeugeSchluessel, pruefeSchluessel } from './krypto.ts'

/** Woher ein Schlüssel kommen kann. */
export type Schluesselart = 'datei' | 'docker-secret' | 'vault' | 'umgebung'

/** Eine Quelle für den Hauptschlüssel. */
export interface Schluesselquelle {
  /** Ein Name für Meldungen, z. B. `Datei …\\.pmh\\master.key`. */
  readonly name: string
  readonly art: Schluesselart
  /**
   * Versucht, den Schlüssel zu holen.
   *
   * @returns den Schlüssel, oder `undefined`, wenn diese Quelle keinen hat —
   *   `undefined` heißt **nicht** „Fehler", sondern „hier ist keiner, probier die
   *   nächste"
   * @throws KryptoFehler, wenn die Quelle einen Schlüssel HAT, er aber
   *   unbrauchbar ist (falsche Länge, unlesbar). Ein solcher Fehler darf **nicht**
   *   zur nächsten Quelle führen: er würde eine kaputte Konfiguration verdecken.
   */
  versuche(): Uint8Array | undefined
}

/** Der gefundene Hauptschlüssel samt Herkunft. */
export interface Hauptschluessel {
  readonly schluessel: Uint8Array
  /** Die Fassung aus `PMH_MASTER_KEY_VERSION`; mindestens 1. */
  readonly version: number
  /** Aus welcher Quelle er kommt — für das Protokoll. */
  readonly herkunft: string
}

/**
 * Wandelt einen Text in Schlüsselbytes — base64url, base64 oder Hex.
 *
 * **Warum drei Formen.** Der bestehende Wert in `.env` ist base64url (43
 * Zeichen für 32 Byte, gemessen). Eine Datei von Hand könnte Hex sein. Beides zu
 * akzeptieren kostet nichts; **eine** Form zu erzwingen hieße, den vorhandenen
 * Wert zu ändern — und damit jede verschlüsselte Zeile unlesbar zu machen.
 *
 * **Warum die Länge danach geprüft wird.** Ein base64-Text, der nicht
 * aufgeht, ergibt stillschweigend einen kürzeren Puffer. `pruefeSchluessel`
 * fängt das ab — statt AES-128 mit halber Stärke zu benutzen.
 *
 * @param text - der rohe Text
 * @param wo - für die Fehlermeldung
 * @returns die Schlüsselbytes
 */
export function textZuSchluessel(text: string, wo: string): Uint8Array {
  const sauber = text.trim()
  if (sauber === '') throw new KryptoFehler('zu-kurz', `${wo}: der Wert ist leer`)

  const kandidaten: Uint8Array[] = []
  if (/^[0-9a-fA-F]{64}$/u.test(sauber)) kandidaten.push(Buffer.from(sauber, 'hex'))
  try {
    kandidaten.push(Buffer.from(sauber.replaceAll('-', '+').replaceAll('_', '/'), 'base64'))
  } catch {
    // Kein gültiges base64 — der Hex- oder der Längenfehler greift ohnehin.
  }

  const passend = kandidaten.find((einer) => einer.length === SCHLUESSEL_BYTES)
  if (passend === undefined) {
    throw new KryptoFehler(
      'falsche-schluessellaenge',
      `${wo}: aus dem Wert lassen sich keine ${String(SCHLUESSEL_BYTES)} Byte gewinnen ` +
        `(Länge des Textes: ${String(sauber.length)} Zeichen). Erwartet wird base64url, base64 oder Hex.`,
    )
  }
  pruefeSchluessel(passend, wo)
  return passend
}

/**
 * Prüft, ob eine Schlüsseldatei für andere lesbar ist — **soweit das meßbar ist**.
 *
 * @param pfad - die Datei
 * @returns eine Warnung, wenn der Schutz nicht geprüft werden konnte, sonst `undefined`
 * @throws KryptoFehler, wenn die Datei auf POSIX gruppen- oder weltlesbar ist
 */
export function pruefeDateirechte(pfad: string): string | undefined {
  const modus = statSync(pfad).mode & 0o777

  if (platform() === 'win32') {
    // **Kein stilles „bestanden".** Siehe die Messung im Kopf dieser Datei:
    // `mode` ist auf NTFS immer 0o666 und sagt nichts. Wer das verschweigt,
    // behauptet einen Schutz, den es nicht gibt.
    return (
      `Die Rechte von ${pfad} lassen sich auf dieser Plattform NICHT prüfen: ` +
      `NTFS meldet für jede Datei den Modus 0o${modus.toString(8)} (gemessen), ` +
      'unabhängig von chmod oder der Angabe beim Anlegen. Geschützt ist die Datei durch ' +
      'die Zugriffsrechte des Benutzerprofils — nicht durch diesen Modus.'
    )
  }

  if ((modus & 0o077) !== 0) {
    throw new KryptoFehler(
      'nicht-entschluesselbar',
      `${pfad} ist für Gruppe oder Andere lesbar (Modus 0o${modus.toString(8)}). ` +
        'Ein Hauptschlüssel, den andere lesen können, ist kein Geheimnis: ' +
        `chmod 600 ${pfad}`,
    )
  }
  return undefined
}

/**
 * Eine Datei als Quelle.
 *
 * @param pfad - der Pfad der Schlüsseldatei
 * @param warnung - wohin Hinweise gehen; Vorgabe: nach stderr
 * @returns die Quelle
 */
export function dateiQuelle(pfad: string, warnung: (text: string) => void = (t) => process.stderr.write(t)): Schluesselquelle {
  return {
    name: `Datei ${pfad}`,
    art: 'datei',
    versuche(): Uint8Array | undefined {
      if (!existsSync(pfad)) return undefined
      const hinweis = pruefeDateirechte(pfad)
      if (hinweis !== undefined) warnung(`[pmh] Hauptschlüssel: ${hinweis}\n`)
      return textZuSchluessel(readFileSync(pfad, 'utf8'), `Datei ${pfad}`)
    },
  }
}

/**
 * Die Umgebungsvariable als Quelle — die **Übergangsstufe**.
 *
 * @param env - die Umgebung
 * @param nameDerVariablen - Vorgabe `PMH_MASTER_KEY`
 * @returns die Quelle
 */
export function umgebungsQuelle(
  env: Readonly<Record<string, string | undefined>>,
  nameDerVariablen = 'PMH_MASTER_KEY',
): Schluesselquelle {
  return {
    name: `Umgebungsvariable ${nameDerVariablen}`,
    art: 'umgebung',
    versuche(): Uint8Array | undefined {
      const roh = env[nameDerVariablen]?.trim() ?? ''
      if (roh === '') return undefined
      return textZuSchluessel(roh, `Umgebungsvariable ${nameDerVariablen}`)
    },
  }
}

/** Wo ein Docker-Secret liegt, wenn es als `pmh_master_key` eingehängt wird. */
export const DOCKER_SECRET_PFAD = '/run/secrets/pmh_master_key'

/**
 * Ein **Docker-Secret** als Quelle — Stufe 2 der Leiter.
 *
 * ## Warum das nicht einfach `dateiQuelle` ist
 *
 * In der Leiter (`src/index.ts`) steht zu dieser Stufe: *„ist eine Datei an einem
 * anderen Ort, die Stufe 1 mit anderem Pfad"*. Das ist **fast** richtig, und der
 * Unterschied ist der Grund für diese eigene Funktion:
 *
 * **Docker hängt Secrets mit Modus `0444` ein** — für Gruppe und Andere lesbar.
 * Die Rechteprüfung aus {@link dateiQuelle} würde auf POSIX also **werfen**, und
 * die ganze Stufe wäre **unbenutzbar**: sie stünde in der Leiter und könnte nie
 * greifen. Eine Stufe, die immer scheitert, ist schlimmer als keine — sie sieht
 * aus wie eine Möglichkeit und ist keine.
 *
 * **Warum das Weglassen der Prüfung hier richtig ist.** Der Schutz eines
 * Docker-Secrets ist **nicht** der Dateimodus, sondern die **Grenze des
 * Containers**: `/run/secrets` ist ein `tmpfs`, das nur innerhalb des Containers
 * sichtbar ist. Wer darin lesen kann, ist bereits im Container — und dort nützt
 * ihm der Modus nichts.
 *
 * **Und es wird gesagt, nicht verschwiegen.** Genau wie auf NTFS: die Quelle
 * **meldet**, daß sie den Modus nicht prüft und warum. Ein stilles Überspringen
 * wäre ein Schutz, der nur so aussieht.
 *
 * @param pfad - der Pfad des Secrets; Vorgabe {@link DOCKER_SECRET_PFAD}
 * @param warnung - wohin der Hinweis geht; Vorgabe: nach stderr
 * @returns die Quelle
 */
export function dockerSecretQuelle(
  pfad: string = DOCKER_SECRET_PFAD,
  warnung: (text: string) => void = (t) => process.stderr.write(t),
): Schluesselquelle {
  return {
    name: `Docker-Secret ${pfad}`,
    art: 'docker-secret',
    versuche(): Uint8Array | undefined {
      // **`undefined` heißt hier „es gibt keines".** Auf einem Rechner ohne
      // Docker ist das der Normalfall und **kein** Fehler — die Leiter geht
      // weiter zur nächsten Stufe.
      if (!existsSync(pfad)) return undefined
      // Der Modus wird **nicht** geprüft — siehe oben. Der Hinweis steht nur
      // einmal, damit er bei jedem Start nicht zur Flut wird.
      if (!schonGemeldet.has(pfad)) {
        schonGemeldet.add(pfad)
        warnung(
          `[pmh] Hauptschlüssel aus Docker-Secret ${pfad}: der Dateimodus wird hier NICHT geprüft ` +
            '(Docker hängt Secrets mit 0444 ein). Der Schutz ist die Grenze des Containers, nicht der Modus.\n',
        )
      }
      return textZuSchluessel(readFileSync(pfad, 'utf8'), `Docker-Secret ${pfad}`)
    },
  }
}

/** Damit der Hinweis des Docker-Secrets nicht bei jedem Zugriff wiederholt wird. */
const schonGemeldet = new Set<string>()

/**
 * Holt den Hauptschlüssel aus der **ersten** Quelle, die einen hat.
 *
 * **Warum ein Fehler einer Quelle nicht zur nächsten führt.** Hat eine Quelle
 * einen Wert und der ist unbrauchbar, wird **abgebrochen**. Sonst würde eine
 * kaputte Schlüsseldatei stillschweigend durch die Umgebungsvariable überdeckt —
 * und der Betreiber glaubte, seine Datei werde benutzt.
 *
 * **Warum die Meldung sagt, was zu tun ist.** „Kein Hauptschlüssel" ohne den
 * nächsten Schritt kostet den Betreiber eine halbe Stunde.
 *
 * @param quellen - die Quellen in ihrer Reihenfolge
 * @param version - die Fassung aus `PMH_MASTER_KEY_VERSION`
 * @returns der Schlüssel samt Herkunft
 * @throws KryptoFehler, wenn keine Quelle einen Schlüssel hat
 */
export function holeHauptschluessel(quellen: readonly Schluesselquelle[], version: number): Hauptschluessel {
  const versucht: string[] = []
  for (const quelle of quellen) {
    const schluessel = quelle.versuche()
    if (schluessel !== undefined) {
      return { schluessel, version, herkunft: quelle.name }
    }
    versucht.push(quelle.name)
  }
  throw new KryptoFehler(
    'zu-kurz',
    'kein Hauptschlüssel gefunden. Versucht wurden: ' +
      `${versucht.join(', ')}.\n` +
      '  Einen erzeugen und in eine Datei mit Modus 0600 schreiben:\n' +
      '    bun scripts/schluessel.mjs\n' +
      '  Die Datei liegt dann im Harness-Home; `PMH_HOME` bestimmt, wo das ist.',
  )
}

/**
 * Erzeugt einen neuen Hauptschlüssel als Text — für die Installation.
 *
 * @returns der Schlüssel als base64url, 43 Zeichen für 32 Byte
 */
export function erzeugeHauptschluesselText(): string {
  const schluessel = erzeugeSchluessel()
  return Buffer.from(schluessel).toString('base64url')
}
