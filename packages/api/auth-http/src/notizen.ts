/**
 * Die Notizen eines Kontos — lesen, suchen, den Vault setzen, einlesen.
 *
 * | Weg | Methode | Was er tut | CSRF |
 * |---|---|---|---|
 * | `/api/pmh/notizen` | GET | Notizen und Suche aus Postgres (`?q=`, `?grenze=`, `?vault=`) | nein |
 * | `/api/pmh/notizen/vault` | POST | den Vault-Pfad dieses Kontos setzen | ja |
 * | `/api/pmh/notizen/einlesen` | POST | den Vault in die Datenbank einlesen | ja |
 *
 * ## Warum aus der Datenbank und nicht aus dem Verzeichnis
 *
 * Ein Verzeichnis ist eine Ablage, kein Gedächtnis: es kennt keine Etiketten,
 * keine Verweise in beide Richtungen, keine Suche und keine Rechte. Die
 * Tabellen unter `pmh` (`vaults`, `notes`, `tags`, `note_tags`, `links`) sind
 * die Wahrheit — das Verzeichnis ist die **Quelle**, aus der `einlesen` sie
 * füllt. Was im Verzeichnis fehlt, wird dabei **nicht** gelöscht: eine
 * Schreibfunktion, die löscht, ist eine Datenverlust-Maschine mit Zeitplan
 * (siehe `einleser.ts`).
 *
 * ## Jeder hat seinen Vault
 *
 * Wie bei den Arbeitsbereichen: die `user_id` kommt aus der Sitzung und steht
 * in **jeder** Abfrage des Speichers. Es gibt keinen Weg, einen fremden Vault
 * zu lesen — auch nicht mit geratener Kennung, weil der Speicher sie mitprüft.
 *
 * ## Der Pfad wird vorgeschlagen, nicht übernommen
 *
 * `GET` liefert bei einem Konto ohne Vault einen `kandidat` — den auf dieser
 * Maschine geöffneten Vault aus `obsidian.json`. Er wird **nicht** still
 * eingetragen. Ein Wirt, der von sich aus ein Verzeichnis übernimmt, trägt
 * Daten eines Kontos in ein anderes ein, sobald zwei Leute dieselbe Maschine
 * benutzen; „der Admin hat auch seinen eigenen" wäre dann nur noch eine
 * Behauptung. Der Aufrufer entscheidet, mit `POST /vault`.
 *
 * @module @prometheus-harness/auth-http/notizen
 */

import { statSync, type Stats } from 'node:fs'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import {
  notizenLesen,
  vaultSichern,
  vaultsLesen,
  vaultStand,
  type SqlZugang,
} from '@prometheus-harness/store-postgres'
import { einlesen, type EinleseBericht } from '@prometheus-harness/world-obsidian/einleser'
import { vaultPfad } from '@prometheus-harness/world-obsidian'
import { leseKoerper, macheWeg, sende, type Weg } from './http.ts'
import { gut, schlecht, type Antwort, type Umgebung } from './paths.ts'
import { csrfFehlt, pruefeSitzung, type SitzungsZusatz } from './sitzung.ts'

/** Die Notizen eines Kontos. */
export const PFAD_NOTIZEN = '/api/pmh/notizen'

/** Den Vault-Pfad dieses Kontos setzen. */
export const PFAD_NOTIZEN_VAULT = '/api/pmh/notizen/vault'

/** Den Vault dieses Kontos einlesen. */
export const PFAD_NOTIZEN_EINLESEN = '/api/pmh/notizen/einlesen'

/** Was beim Einlesen eines Vaults herauskam — je Vault ein Eintrag, auch der Mißerfolg. */
interface EinleseErgebnis {
  readonly pfad: string
  readonly bericht?: EinleseBericht
  readonly fehler?: string
}

/**
 * Übersetzt einen Datenbankfehler in eine Meldung für Menschen.
 *
 * @param fehler - was die Datenbank geworfen hat
 * @returns die Antwort
 */
function fehlerAntwort(fehler: unknown): Antwort {
  const code = (fehler as { code?: string }).code ?? ''
  if (code === '23505') {
    return schlecht(409, 'vault-schon-da', 'Dieser Vault ist für dieses Konto schon eingetragen.')
  }
  if (code === '23514') {
    return schlecht(400, 'pfad-unbrauchbar', 'Der Pfad muß absolut sein und darf kein „.." enthalten.')
  }
  if (code === '23503') {
    return schlecht(404, 'vault-unbekannt', 'Diesen Vault gibt es nicht.')
  }
  return schlecht(500, 'unerwartet', 'Die Notizen konnten nicht gelesen oder geschrieben werden.')
}

/**
 * Prüft einen Vault-Pfad, **bevor** er in die Datenbank geht.
 *
 * Die Bedingungen der Datenbank (absolut, kein `..`) stehen dort noch einmal
 * und bleiben die letzte Instanz. Hier stehen sie davor, aus zwei Gründen: der
 * Aufrufer bekommt einen Satz statt eines Fehlercodes, und ein nicht
 * vorhandenes Verzeichnis fällt **jetzt** auf statt beim Einlesen — sonst
 * entstünde ein Vault-Eintrag, den nie jemand füllen kann.
 *
 * @param pfad - der rohe Pfad aus dem Körper
 * @returns der Pfad oder die Antwort, die statt seiner geht
 */
function pruefeVaultPfad(
  pfad: string,
): { readonly ok: true; readonly pfad: string } | { readonly ok: false; readonly antwort: Antwort } {
  if (pfad === '') {
    return { ok: false, antwort: schlecht(400, 'eingabe-fehlt', 'Es fehlt der Pfad des Vaults.') }
  }
  // Windows (`C:\…`, `\\server\…`) und POSIX (`/…`) — beides ist absolut.
  if (!/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/u.test(pfad)) {
    return { ok: false, antwort: schlecht(400, 'pfad-nicht-absolut', 'Der Pfad muß absolut sein.') }
  }
  if (pfad.split(/[\\/]+/u).includes('..')) {
    return { ok: false, antwort: schlecht(400, 'pfad-unbrauchbar', 'Der Pfad darf kein „.." enthalten.') }
  }
  let stand: Stats
  try {
    stand = statSync(pfad)
  } catch {
    return { ok: false, antwort: schlecht(404, 'pfad-weg', 'Diesen Pfad gibt es nicht oder er ist nicht lesbar.') }
  }
  if (!stand.isDirectory()) {
    return { ok: false, antwort: schlecht(400, 'pfad-kein-ordner', 'Der Pfad ist kein Ordner.') }
  }
  return { ok: true, pfad }
}

/**
 * Der auf dieser Maschine geöffnete Vault — als **Vorschlag**, nie als Eintrag.
 *
 * `vaultPfad()` liest `PMH_OBSIDIAN_VAULT` oder `obsidian.json` und wirft, wenn
 * beides fehlt. Ein fehlender Vorschlag ist kein Fehler: dann gibt es eben
 * keinen, und der Aufrufer tippt einen Pfad ein.
 *
 * @returns der Pfad oder `undefined`
 */
function ausObsidianJson(): string | undefined {
  try {
    return vaultPfad()
  } catch {
    return undefined
  }
}

/**
 * `GET /api/pmh/notizen` — Notizen, Suche und der Stand dieses Kontos.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegNotizenListe(umg: Umgebung, sql: SqlZugang, zusatz: SitzungsZusatz = {}): Weg {
  return async (req, res) => {
    const wer = await pruefeSitzung(umg, req, zusatz)
    if (!wer.ok) {
      sende(res, wer.antwort)
      return
    }
    const adresse = new URL(req.url ?? '/', 'http://127.0.0.1')
    const q = (adresse.searchParams.get('q') ?? '').trim()
    const rohGrenze = Number(adresse.searchParams.get('grenze') ?? '')
    const grenze = Number.isFinite(rohGrenze) && rohGrenze > 0 ? Math.trunc(rohGrenze) : undefined
    const vaultId = (adresse.searchParams.get('vault') ?? '').trim()
    try {
      const notizen = await notizenLesen(sql, wer.wer.userId, {
        ...(q !== '' ? { q } : {}),
        ...(grenze !== undefined ? { grenze } : {}),
        ...(vaultId !== '' ? { vaultId } : {}),
      })
      const stand = await vaultStand(sql, wer.wer.userId)
      const vaults = await vaultsLesen(sql, wer.wer.userId)
      // **Nur ein Vorschlag, und nur ohne eigenen Vault.** Wer schon einen hat, bekommt keinen.
      const kandidat = vaults.length > 0 ? undefined : ausObsidianJson()
      sende(res, gut({ notizen, gesucht: q, stand, vaults, kandidat: kandidat ?? null }))
    } catch (fehler) {
      sende(res, fehlerAntwort(fehler))
    }
  }
}

/**
 * `POST /api/pmh/notizen/vault` — den Vault-Pfad dieses Kontos setzen.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegNotizenVault(umg: Umgebung, sql: SqlZugang, zusatz: SitzungsZusatz = {}): Weg {
  return async (req, res) => {
    const wer = await pruefeSitzung(umg, req, zusatz)
    if (!wer.ok) {
      sende(res, wer.antwort)
      return
    }
    const ohneCsrf = csrfFehlt(wer.wer)
    if (ohneCsrf !== undefined) {
      sende(res, ohneCsrf)
      return
    }
    const koerper = await leseKoerper(req)
    if (!koerper.ok) {
      sende(res, schlecht(koerper.status, koerper.code, koerper.message))
      return
    }
    const daten = koerper.wert as { readonly pfad?: unknown }
    const roh = typeof daten.pfad === 'string' ? daten.pfad.trim() : ''
    const geprueft = pruefeVaultPfad(roh)
    if (!geprueft.ok) {
      sende(res, geprueft.antwort)
      return
    }
    try {
      const vault = await vaultSichern(sql, wer.wer.userId, geprueft.pfad)
      sende(res, gut({ vault }))
    } catch (fehler) {
      sende(res, fehlerAntwort(fehler))
    }
  }
}

/**
 * `POST /api/pmh/notizen/einlesen` — den Vault dieses Kontos einlesen.
 *
 * Ohne `pfad` werden **alle** Vaults dieses Kontos eingelesen: wer zwei hat,
 * will beide. Mit `pfad` wird dieser vorher eingetragen (wie `POST /vault`),
 * damit ein erster Aufruf genügt.
 *
 * **Ein Vault, der weg ist, wird gemeldet und nicht verschwiegen** — seine
 * Zeilen bleiben in der Datenbank stehen (der Einleser löscht nicht), aber der
 * Bericht sagt, daß dieser Pfad nicht mehr lesbar war. Sonst sähe ein
 * abgezogenes Laufwerk wie ein unveränderter Vault aus.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegNotizenEinlesen(umg: Umgebung, sql: SqlZugang, zusatz: SitzungsZusatz = {}): Weg {
  return async (req, res) => {
    const wer = await pruefeSitzung(umg, req, zusatz)
    if (!wer.ok) {
      sende(res, wer.antwort)
      return
    }
    const ohneCsrf = csrfFehlt(wer.wer)
    if (ohneCsrf !== undefined) {
      sende(res, ohneCsrf)
      return
    }
    const koerper = await leseKoerper(req)
    if (!koerper.ok) {
      sende(res, schlecht(koerper.status, koerper.code, koerper.message))
      return
    }
    const daten = koerper.wert as { readonly pfad?: unknown }
    const roh = typeof daten.pfad === 'string' ? daten.pfad.trim() : ''

    try {
      if (roh !== '') {
        const geprueft = pruefeVaultPfad(roh)
        if (!geprueft.ok) {
          sende(res, geprueft.antwort)
          return
        }
        await vaultSichern(sql, wer.wer.userId, geprueft.pfad)
      }

      const vaults = await vaultsLesen(sql, wer.wer.userId)
      if (vaults.length === 0) {
        sende(
          res,
          schlecht(
            400,
            'vault-fehlt',
            'Dieses Konto hat noch keinen Vault. Erst `POST /api/pmh/notizen/vault` mit einem Pfad.',
          ),
        )
        return
      }

      const ergebnisse: EinleseErgebnis[] = []
      for (const vault of vaults) {
        try {
          ergebnisse.push({ pfad: vault.pfad, bericht: await einlesen(sql, wer.wer.userId, vault.pfad) })
        } catch (fehler) {
          const code = (fehler as { code?: string }).code ?? ''
          ergebnisse.push({
            pfad: vault.pfad,
            fehler: code === 'ENOENT' ? 'pfad-weg' : 'einlesen-fehlgeschlagen',
          })
        }
      }
      const stand = await vaultStand(sql, wer.wer.userId)
      sende(res, gut({ ergebnisse, stand }))
    } catch (fehler) {
      sende(res, fehlerAntwort(fehler))
    }
  }
}

/**
 * Alle Wege dieses Moduls, fertig für `ctx.webServer.register`.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns die Wege
 */
export function notizenWege(umg: Umgebung, sql: SqlZugang, zusatz: SitzungsZusatz = {}): readonly WebRoute[] {
  const liste = macheWeg('GET', wegNotizenListe(umg, sql, zusatz), 'notizen-liste')
  const vault = macheWeg('POST', wegNotizenVault(umg, sql, zusatz), 'notizen-vault')
  const einlese = macheWeg('POST', wegNotizenEinlesen(umg, sql, zusatz), 'notizen-einlesen')
  const wege: readonly WebRoute[] = [
    { kind: 'exact', path: PFAD_NOTIZEN, handler: liste },
    { kind: 'exact', path: PFAD_NOTIZEN_VAULT, handler: vault },
    { kind: 'exact', path: PFAD_NOTIZEN_EINLESEN, handler: einlese },
  ]
  return wege
}
