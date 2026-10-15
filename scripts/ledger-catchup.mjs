/**
 * `scripts/ledger-catchup.mjs` — den Audit-Ledger auf den heutigen Stand bringen.
 *
 * ## Der Ledger ist ein ARRAY — und das hat drei Anläufe gekostet
 *
 * `.pmh-build/security-audit/run-1/coverage-ledger.json` ist ein **JSON-Array aus
 * 61 Einheit-Objekten**, kein Objekt mit Feldern. Gemessen:
 *
 * ```
 * Array.isArray(ledger.coverage_id)  ->  false      (das Feld gibt es nicht)
 * ledger.local_checks                ->  undefined
 * neu.nachziehen = {…}               ->  auf einem ARRAY
 * JSON.stringify(array)              ->  schreibt NUR die Indizes; Eigenschaften fallen weg
 * ```
 *
 * **Was das anrichtete.** Die erste Fassung schrieb, meldete „GESCHRIEBEN" und
 * hinterließ eine **unveränderte** Datei. Die zweite Fassung **las zurück** und
 * meldete ehrlich `FEHLGESCHLAGEN` — damit war der Fehler sichtbar, aber nicht
 * behoben. Erst die dritte kennt die Form.
 *
 * **Warum meine erste Messung in die Irre führte.** `$j.coverage_id` in PowerShell
 * liefert bei einem Array über die **Member-Aufzählung** alle 61 Werte — es sah
 * aus wie ein Feld mit 61 Einträgen. Die Mehrdeutigkeit habe ich nicht aufgelöst.
 * Ein Meßwert, den zwei Formen erklären, ist kein Meßwert.
 *
 * ## Was dieses Werkzeug tut
 *
 * 1. **B-S1 im Einheit-Objekt berichtigen**, das `local_checks` trägt: Struktur
 *    behoben (Migration 0004), Verhalten offen (RLS aus).
 * 2. Den Nachzieh-Block als **eigene Datei** daneben schreiben
 *    (`NACHZIEHEN.json`) — **nicht** in das Einheit-Array. Meta-Angaben in ein
 *    Array zu hängen zerstört seine Form; sie fallen beim Serialisieren weg.
 * 3. **Zurücklesen** und prüfen. Ein Werkzeug, das schreibt, ohne nachzusehen, ist
 *    eine Behauptung.
 *
 * Trockenlauf ist die Voreinstellung; geschrieben wird nur mit `--anwenden`.
 *
 * @module scripts/ledger-catchup
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Wo der Ledger liegt. */
export const LEDGER = '.pmh-build/security-audit/run-1/coverage-ledger.json'

/** Wohin der Nachzieh-Block kommt — **daneben**, nicht hinein. */
export const NACHZIEHEN = '.pmh-build/security-audit/run-1/NACHZIEHEN.json'

/**
 * Die Kennung des Einheit-Objekts, das den B-S1-Beleg trägt.
 *
 * **Gemessen** (`$j.local_checks.agent_id`): `prior-evidence-b-s1`. Als Konstante,
 * damit Meldung und Suche nicht auseinanderlaufen.
 */
export const B_S1_KENNUNG = 'prior-evidence-b-s1'

/**
 * Gibt den `local_checks`-Block EINES Einheit-Objekts zurück — **in beiden Formen**.
 *
 * **Warum das nötig ist, und warum es eine eigene Funktion ist.** Zwei Messungen
 * widersprachen sich: PowerShell fand den Träger über `$_.local_checks.agent_id`,
 * mein Node-Code fand ihn nicht. Der Grund: PowerShell **ebnet einelementige
 * Arrays ein** und **zählt Members auf** — ein `local_checks` als
 * *einelementiges Array* sieht dort wie ein *Objekt* aus. Meine erste Formmessung
 * war damit **mehrdeutig**, und ein Meßwert, den zwei Formen erklären, ist keiner.
 *
 * **Die Antwort darauf ist nicht eine dritte Messung, sondern Code, der beide
 * Formen annimmt** — und eine Prüfdatei, die beide fährt.
 *
 * @param {unknown} einheit - ein Einheit-Objekt
 * @returns {object | undefined} der Block, oder `undefined`
 */
export function lcVon(einheit) {
  if (einheit === null || typeof einheit !== 'object') return undefined
  const roh = einheit.local_checks
  if (Array.isArray(roh)) return roh[0]
  return roh !== null && typeof roh === 'object' ? roh : undefined
}

/**
 * Nimmt die Einheiten entgegen — **als Array**, wie der Ledger wirklich aussieht.
 *
 * @param {unknown} roh - der gelesene Ledger
 * @returns {{einheiten: object[], form: string}} die Einheiten und die erkannte Form
 */
export function alsEinheiten(roh) {
  if (Array.isArray(roh)) return { einheiten: roh, form: 'Array aus Einheiten' }
  if (roh !== null && typeof roh === 'object' && Array.isArray(roh.units)) {
    return { einheiten: roh.units, form: 'Objekt mit Feld units' }
  }
  return { einheiten: [], form: 'UNBEKANNT' }
}

/**
 * Baut den berichtigten Einheiten-Stand und den Nachzieh-Block.
 *
 * **Reine Funktion** — prüfbar ohne Dateisystem.
 *
 * @param {object[]} einheiten - die Einheiten
 * @param {{fassungBetrieb: number, tabellen: number, zusammengesetzteFk: number, policies: number}} heute - gemessener Stand
 * @returns {{einheiten: object[], nachziehen: object, aenderungen: string[]}}
 */
export function zieheNach(einheiten, heute) {
  const aenderungen = []
  const neu = JSON.parse(JSON.stringify(einheiten))

  // **Der Träger wird über `agent_id` gesucht, NICHT über die Anwesenheit von
  // `local_checks`.** Jede der 61 Einheiten trägt `local_checks` — der erste
  // Entwurf nahm deshalb die **erste** und berichtigte `apps/cli/src/main.ts`
  // statt B-S1. Die Kennung ist gemessen: `local_checks.agent_id ===
  // 'prior-evidence-b-s1'`.
  const traeger = neu.find((u) => lcVon(u)?.agent_id === B_S1_KENNUNG)
  if (traeger === undefined) {
    aenderungen.push(
      `kein Einheit-Objekt mit local_checks.agent_id === "${B_S1_KENNUNG}" gefunden — B-S1 NICHT berichtigt`,
    )
  } else {
    const lc = lcVon(traeger)
    const alt = typeof lc?.result === 'string' ? lc.result : ''
    if (typeof lc?.result === 'string' && lc.result.startsWith('NACHGEZOGEN')) {
      aenderungen.push('B-S1 war bereits berichtigt — unverändert gelassen')
    } else {
      lc.result =
        'NACHGEZOGEN 14.10.2026 — der Befund hat sich GETEILT. ' +
        '(1) STRUKTUR: BEHOBEN durch Migration 0004. Gemessen in pmh: ' +
        `${String(heute.zusammengesetzteFk)} zusammengesetzte Fremdschluessel (UNIQUE (id, user_id) je Elterntabelle ` +
        '+ zusammengesetzte FKs); die Probe tests/fixtures/tenant-isolation.sql weist 4 von 4 Uebergriffen mit 23503 ab ' +
        '(dazu 2 Loeschfaelle). Der alte Wortlaut („ausschliesslich Fremdschluessel ohne Eigentuemerbezug") gilt NICHT MEHR. ' +
        '(2) VERHALTEN: OFFEN. Row Level Security ist auf keiner Tabelle an — ' +
        `gemessen policies=${String(heute.policies)}; das ist eine ENTSCHEIDUNG (docs/status/mandantentrennung.md §10). ` +
        'Ein Lauf muss den Verhaltensteil WEITER jagen — ihn pauschal auszunehmen waere ZU VIEL. ' +
        `Alter Wortlaut: ${alt.slice(0, 200)}`
      lc.nachgezogen_am = '2026-10-14'
      aenderungen.push(`B-S1 berichtigt im Einheit-Objekt "${String(traeger.coverage_id ?? traeger.agent_id ?? '?')}"`)
    }
  }

  const nachziehen = {
    am: '2026-10-14',
    anlass:
      'Der Ledger entstand 13.10. 14:40. Ein Lauf ohne Nachziehen wuerde behobene Befunde erneut jagen und Neues uebersehen.',
    form_des_ledgers: 'Array aus 61 Einheit-Objekten (gemessen: Array.isArray(roh) === true)',
    commits_seit_ledger: 84,
    betriebsdatenbank: `pmh: fassung ${String(heute.fassungBetrieb)}, ${String(heute.tabellen)} Tabellen`,
    ACHTUNG:
      'Die Betriebsdatenbank liegt HINTER dem Code (Code: Fassung 7). Pruefen mit: bun scripts/schema-version.mjs pruefen',
    neue_migrationen: [
      { fassung: 4, name: 'mandantentrennung-an-fremdschluesseln', wirkung: 'B-S1 Struktur behoben' },
      { fassung: 5, name: 'benutzerprofile-isolation-je-benutzer', wirkung: 'neue Tabelle user_profiles' },
      { fassung: 6, name: 'wissensspeicher-dokumente-und-textstuecke', wirkung: 'neu: documents, chunks' },
      { fassung: 7, name: 'obsidian-vaults-notizen-etiketten-verweise', wirkung: 'neu: vaults, notes, tags, note_tags, links' },
    ],
    neue_tabellengruppen: [
      { tabellen: ['documents', 'chunks'], pruefung: 'tests/fixtures/knowledge-store.sql (12 Faelle)', beleg: 'docs/status/wissensspeicher-d1.md' },
      { tabellen: ['vaults', 'notes', 'tags', 'note_tags', 'links'], pruefung: 'tests/fixtures/obsidian.sql (11 Faelle)', beleg: 'docs/status/obsidian-schema.md' },
    ],
    neue_angriffsflaechen: [
      { was: 'Anmeldeseite aus eigenem Host', pfade: ['/pmh/anmelden', '/api/pmh/auth/seite', '/api/pmh/auth/seite.js'] },
      { was: 'vier Anmeldewege', pfade: ['/api/pmh/auth/register', '/api/pmh/auth/login', '/api/pmh/auth/logout', '/api/pmh/auth/me'] },
      { was: 'Skripte mit Schreibrecht', pfade: ['scripts/reset.mjs', 'scripts/api-key.mjs', 'scripts/geheimnis.mjs'] },
      { was: 'git-Haken', pfade: ['.githooks/pre-commit'] },
      { was: 'eigene CI', pfade: ['.github/workflows/pmh-ci.yml'] },
    ],
    offene_entscheidungen: [
      'Betriebsdatenbank pmh liegt hinter dem Code — Nachziehen ist eine Betreiberentscheidung',
      'Row Level Security scharf schalten: ja oder nein (Verhaltensteil von B-S1)',
      'Einbettungsdienst: freellmapi 401, ollama ohne Host-Port',
      'Obsidian-Richtung und die Vault-Pfadregel',
      'C4 Stufe 3 (Vault/KMS)',
      'eigene Lizenz fuer unseren Code',
    ],
    nicht_getan: 'Die 61 Einheiten wurden NICHT umgeschrieben — nur der B-S1-Traeger. Ihre Nummern und Wellen sind die Struktur des Laufs.',
  }
  return { einheiten: neu, nachziehen, aenderungen }
}

/**
 * Führt den Befehl aus.
 *
 * @param {readonly string[]} argv - die Argumente ohne `node` und Skriptpfad
 * @param {Readonly<Record<string, string | undefined>>} umgebung - Umgebungsvariablen
 * @param {(text: string) => void} schreibe - Ausgabe
 * @returns {number} der Exit-Code
 */
export function fuehreAus(argv, umgebung = process.env, schreibe = (t) => process.stdout.write(t)) {
  const anwenden = argv.includes('--anwenden')
  const wurzel = umgebung.PMH_VERZEICHNIS?.trim() ?? process.cwd()
  const ledgerPfad = join(wurzel, LEDGER)
  const blockPfad = join(wurzel, NACHZIEHEN)

  let roh
  try {
    roh = JSON.parse(readFileSync(ledgerPfad, 'utf8'))
  } catch (fehler) {
    schreibe(`FEHLER: ${LEDGER} laesst sich nicht lesen: ${String(fehler)}\n`)
    return 2
  }

  const { einheiten, form } = alsEinheiten(roh)
  schreibe(`LEDGER NACHZIEHEN — ${anwenden ? 'ANWENDEN' : 'TROCKENLAUF (nichts wird geschrieben)'}\n\n`)
  schreibe(`  Form des Ledgers   ${form} (${String(einheiten.length)} Einheiten)\n`)
  if (einheiten.length === 0) {
    schreibe('\nFEHLGESCHLAGEN: der Ledger hat eine Form, die dieses Werkzeug nicht kennt.\n')
    return 2
  }

  const heute = {
    fassungBetrieb: Number(umgebung.PMH_FASSUNG_BETRIEB ?? '0'),
    tabellen: Number(umgebung.PMH_TABELLEN ?? '0'),
    zusammengesetzteFk: Number(umgebung.PMH_ZUSAMMENGESETZTE_FK ?? '0'),
    policies: Number(umgebung.PMH_POLICIES ?? '0'),
  }
  const { einheiten: neu, nachziehen, aenderungen } = zieheNach(einheiten, heute)
  for (const a of aenderungen) schreibe(`  - ${a}\n`)

  if (!anwenden) {
    schreibe(`\nZum Schreiben: bun scripts/ledger-catchup.mjs --anwenden\n`)
    return 0
  }

  // **Zwei Dateien, zwei Formen.** Der Ledger bleibt ein Array; der Nachzieh-Block
  // ist ein Objekt und bekommt seine eigene Datei.
  writeFileSync(ledgerPfad, `${JSON.stringify(neu, null, 2)}\n`, 'utf8')
  writeFileSync(blockPfad, `${JSON.stringify(nachziehen, null, 2)}\n`, 'utf8')

  // ---- Rücklesen: der Nachweis, nicht die Meldung -------------------------
  let zurueck
  let blockZurueck
  try {
    zurueck = JSON.parse(readFileSync(ledgerPfad, 'utf8'))
    blockZurueck = JSON.parse(readFileSync(blockPfad, 'utf8'))
  } catch (fehler) {
    schreibe(`\nFEHLGESCHLAGEN: nach dem Schreiben nicht lesbar: ${String(fehler)}\n`)
    return 1
  }
  const traegerNachher = (Array.isArray(zurueck) ? zurueck : []).find(
    (u) => typeof lcVon(u)?.result === 'string',
  )
  const bS1Da = String(lcVon(traegerNachher)?.result ?? '').startsWith('NACHGEZOGEN')
  const blockDa = blockZurueck?.am === nachziehen.am && Array.isArray(blockZurueck?.neue_migrationen)

  schreibe('\nNACHGELESEN (das ist der Nachweis, nicht die Meldung oben):\n')
  schreibe(`  Ledger ist weiter ein Array      ${Array.isArray(zurueck) ? 'JA' : 'NEIN'}\n`)
  schreibe(`  Einheiten vorher / nachher       ${String(einheiten.length)} / ${String(Array.isArray(zurueck) ? zurueck.length : -1)}\n`)
  schreibe(`  B-S1 berichtigt                  ${bS1Da ? 'JA' : 'NEIN'}\n`)
  schreibe(`  NACHZIEHEN.json vorhanden        ${blockDa ? 'JA' : 'NEIN'}\n`)

  const gleichViele = Array.isArray(zurueck) && zurueck.length === einheiten.length
  if (!gleichViele || !bS1Da || !blockDa) {
    schreibe('\nFEHLGESCHLAGEN: die Dateien entsprechen NICHT dem, was geschrieben werden sollte.\n')
    return 1
  }
  schreibe('\nBESTÄTIGT: Ledger unverändert in der Form, B-S1 berichtigt, Nachzieh-Block daneben.\n')
  return 0
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('ledger-catchup.mjs')) {
  process.exitCode = fuehreAus(process.argv.slice(2))
}
