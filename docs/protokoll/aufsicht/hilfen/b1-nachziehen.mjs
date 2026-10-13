/**
 * b1-nachziehen.mjs — Auftrag des Betreibers vom 13.10.2026: den Stand vom 22.09.2026
 * in die laufende `~/.dsh/settings.yaml` nachziehen (Befund B1).
 *
 * ## Warum dieses Skript nicht einfach die Datei kopiert
 *
 * Die laufende Konfiguration wird von **zwei arbeitenden Sitzungen** gelesen, und das Harness lädt
 * eine geschriebene Datei **im Betrieb neu** (belegt in `notes/CREW-APIKEY-REPARATUR.md` §2.3: der
 * `request/header` nennt nach dem Schreiben um 10:35 den Wert `contextWindow: 1000000` aus dem neuen
 * Block). Ein Fehler hier trifft also sofort beide Sitzungen — und ein **Neustart ist nach Hausregel
 * H1 ausgeschlossen**, also auch keine Rettung durch Neustart.
 *
 * Deshalb gilt: **prüfen, dann tauschen.** Das Dokument wird zuerst als `<live>.tmp-aufsicht`
 * geschrieben, dort gegen die echten Plugin-Schemata validiert und gegen Invarianten geprüft. Erst
 * wenn alles hält, wird es über die Live-Datei gelegt — mit Sicherung.
 *
 * ## Was nachgezogen wird — und was ausdrücklich **nicht**
 *
 * Nachgezogen (additiv, kein bestehender Wert wird verändert):
 *   1. `agent-loop`                     → `{maxParallelToolCalls: 9}`      (fehlte vollständig)
 *   2. `llm-pi-ai.providers.openai`     → 38 Modelle, `apiKeyEnv: OPENAI_API_KEY`  (Route fehlte)
 *   3. `crew.crews[]` += `crew-2`       → „Test RouterFree"                (zweite Crew fehlte)
 *
 * **Nicht** nachgezogen, mit Beleg (siehe `../befunde.md` B1, Nachtrag):
 *   * `agent-default-model` — der 151-Byte-Rest vor der Rettung
 *     (`settings.yaml.bak-t63-before-repair-20261013-103555`) trägt **denselben** Wert wie live
 *     (`deepseek-official` / `deepseek-flash` / `high`). Der 22.09-Wert (`crew` / `crew-1`) ist damit
 *     **älter als der Vorzustand**, keine Wiederherstellung. Ein Zurückziehen würde außerdem genau
 *     das Verhalten herstellen, das der Betreiber beanstandet hat („kein Crew-Auswahl, trotzdem Crew
 *     genutzt").
 *   * `llm-deepseek.models` — der 22.09-Katalog führt `deepseek-flash` **nur** als `{id, name}`: ohne
 *     `contextWindow: 1000000`, ohne `inputModalities: [text, image]`, ohne Bildbudget. Die laufenden
 *     Sitzungen fahren auf `deepseek-flash`; ein Zurückziehen würde **Kontextfenster und
 *     Bildfähigkeit im Betrieb** beschneiden. Der aktuelle Block ist die bewusste Neufassung der
 *     t63-Reparatur und ist diesem Katalog nachweislich überlegen.
 *   * `crew.crews[0].roles` — die 22.09-Rollen binden die Vision-Rolle an die **zurückgezogene** ID
 *     `deepseek-v4-flash-vision-exp`. Niedriger Gewinn, echter Fehlgriff-Risiko; die aktuellen Rollen
 *     stehen auf dem bildfähigen `deepseek-flash`.
 *
 * Aufruf:
 *   node b1-nachziehen.mjs              # nur prüfen: zeigt die Änderungen, validiert, schreibt nichts
 *   node b1-nachziehen.mjs --anwenden   # schreiben (Sicherung + atomarer Tausch)
 */
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire('file:///C:/Users/Chang/deepseek-harness/')
const yaml = require('js-yaml')

const LIVE = 'C:\\Users\\Chang\\.dsh\\settings.yaml'
const QUELLE = 'C:\\Users\\Chang\\.dsh\\crew\\backup\\settings.yaml.2026-09-22T22-51-48.bak'
const VORZUSTAND = 'C:\\Users\\Chang\\.dsh\\settings.yaml.bak-t63-before-repair-20261013-103555'
const anwenden = process.argv.includes('--anwenden')

const BASE = 'file:///C:/Users/Chang/deepseek-harness/packages/'
const SCHEMAS = [
  ['llm-pi-ai', `${BASE}llm/llm-pi-ai/lib/index.js`, 'Config'],
  ['llm-deepseek', `${BASE}llm/llm-deepseek/lib/index.js`, 'Config'],
  ['crew', `${BASE}llm/crew/lib/index.js`, 'CREW_SETTINGS_SCHEMA'],
]

const liveText = readFileSync(LIVE, 'utf8')
const live = yaml.load(liveText)
const quelle = yaml.load(readFileSync(QUELLE, 'utf8'))
const vorzustand = yaml.load(readFileSync(VORZUSTAND, 'utf8'))

/** Stabile Textform — unabhängig von Schlüsselreihenfolge. */
function canonical(value) {
  const json = JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
  return createHash('sha256').update(json ?? 'undefined').digest('hex').slice(0, 12)
}

console.log('=== B1: Stand vom 22.09.2026 nachziehen ===')
console.log(`live   : ${LIVE}`)
console.log(`quelle : ${QUELLE}`)
console.log(`Modus  : ${anwenden ? 'ANWENDEN (schreibt)' : 'nur prüfen'}\n`)

/** ---- Vorbedingungen, die sich nicht verhandeln lassen ---- */

const kommentarZeilen = liveText.split(/\r?\n/).filter((line) => line.trimStart().startsWith('#')).length
console.log(`Vorbedingung 1 — Kommentare in der Live-Datei: ${kommentarZeilen}`)
if (kommentarZeilen !== 0) {
  console.log('ABBRUCH: die Live-Datei hat Kommentare. Ein YAML-Rundlauf würde sie verlieren.')
  process.exit(1)
}

console.log('Vorbedingung 2 — der Vorzustand stützt die Auslassungen:')
const gleichDefault = canonical(vorzustand['agent-default-model']) === canonical(live['agent-default-model'])
console.log(`  agent-default-model Vorzustand == live: ${gleichDefault}  ${gleichDefault ? '(Zurückziehen wäre eine Änderung, keine Wiederherstellung)' : '(WARNUNG: hier ist eine Wiederherstellung denkbar)'}`)
const alt = quelle['llm-deepseek']?.models?.find((m) => m.id === 'deepseek-flash')
const neu = live['llm-deepseek']?.models?.find((m) => m.id === 'deepseek-flash')
console.log(`  deepseek-flash im 22.09-Katalog: contextWindow=${alt?.contextWindow ?? 'FEHLT'}, Modalitäten=${JSON.stringify(alt?.inputModalities ?? null)}`)
console.log(`  deepseek-flash live            : contextWindow=${neu?.contextWindow ?? 'FEHLT'}, Modalitäten=${JSON.stringify(neu?.inputModalities ?? null)}`)

/** ---- Die drei additiven Änderungen ---- */

const neuDokument = structuredClone(live)
const aenderungen = []

if (neuDokument['agent-loop'] !== undefined) {
  console.log('\nagent-loop: schon vorhanden — übersprungen')
} else {
  neuDokument['agent-loop'] = structuredClone(quelle['agent-loop'])
  aenderungen.push(`+ agent-loop = ${JSON.stringify(neuDokument['agent-loop'])}`)
}

const piProviders = neuDokument['llm-pi-ai']?.providers ?? {}
if (piProviders.openai !== undefined) {
  console.log('llm-pi-ai.providers.openai: schon vorhanden — übersprungen')
} else {
  piProviders.openai = structuredClone(quelle['llm-pi-ai'].providers.openai)
  aenderungen.push(`+ llm-pi-ai.providers.openai (${piProviders.openai.models.length} Modelle, apiKeyEnv ${piProviders.openai.apiKeyEnv})`)
}

const crews = neuDokument.crew?.crews ?? []
const fehlendeCrews = (quelle.crew?.crews ?? []).filter((kandidat) => !crews.some((c) => c.id === kandidat.id))
for (const kandidat of fehlendeCrews) {
  crews.push(structuredClone(kandidat))
  aenderungen.push(`+ crew.crews[] ${kandidat.id} „${kandidat.name}"`)
}

/**
 * 4. Fehlende Modelle **innerhalb** einer bereits vorhandenen Anbieter-Route ergänzen.
 *
 * **Warum das kein automatischer Abgleich ist, sondern Handarbeit sein muss:** der Katalog dieser
 * Route ist das Einstellungsdokument selbst. `packages/llm/llm-pi-ai/src/provider.ts` Zeile 141/142
 * sagt es wörtlich: „Catalog-owned dynamic refresh is dropped: this route's catalog is the settings
 * document, and a background refresh would contradict it." Es holt also **niemand** die Liste neu —
 * ein fehlendes Modell bleibt fehlend, bis es jemand einträgt.
 *
 * Gemessen: die Live-Liste von `openrouter` ist eine **echte Teilmenge** der 22.09-Liste (276 statt
 * 277 Modelle, kein einziges Modell nur live). Ergänzt werden deshalb nur die fehlenden.
 */
for (const [name, route] of Object.entries(quelle['llm-pi-ai']?.providers ?? {})) {
  const ziel = piProviders[name]
  if (!Array.isArray(route?.models) || !Array.isArray(ziel?.models)) continue
  const vorhanden = new Set(ziel.models.map((modell) => modell.id))
  const fehlend = route.models.filter((modell) => !vorhanden.has(modell.id))
  if (fehlend.length === 0) continue
  for (const modell of fehlend) ziel.models.push(structuredClone(modell))
  aenderungen.push(
    `+ llm-pi-ai.providers.${name}.models: ${fehlend.map((m) => m.id).join(', ')} (${ziel.models.length} Modelle)`,
  )
}

console.log('\nGeplante Änderungen:')
for (const zeile of aenderungen) console.log('  ' + zeile)
if (aenderungen.length === 0) {
  console.log('  (keine — der Stand ist bereits nachgezogen)')
  process.exit(0)
}

/** ---- Invarianten: alles, was NICHT geändert werden darf ---- */
console.log('\nInvarianten (müssen unverändert bleiben):')
const erwartetGleich = ['agent-default-model', 'llm-deepseek', 'web-search-deepseek', 'web-search-firecrawl', 'locale', 'dsh-i18n-de', 'ui-onboarding']
let verletzt = 0
for (const name of erwartetGleich) {
  const gleich = canonical(live[name]) === canonical(neuDokument[name])
  if (!gleich) verletzt += 1
  console.log(`  ${gleich ? 'ok    ' : 'GEÄNDERT'}  ${name}`)
}
const altCrews = JSON.stringify(live.crew?.crews?.[0]) === JSON.stringify(neuDokument.crew?.crews?.[0])
console.log(`  ${altCrews ? 'ok    ' : 'GEÄNDERT'}  crew.crews[0] (die bestehende Crew bleibt unangetastet)`)
if (!altCrews) verletzt += 1

const tempPfad = `${LIVE}.tmp-aufsicht`
const tempText = yaml.dump(neuDokument, { lineWidth: 120, noRefs: true, quotingType: '"', forceQuotes: false })
writeFileSync(tempPfad, tempText, 'utf8')
console.log(`\nEntwurf geschrieben: ${tempPfad} (${tempText.length} B)`)

/** ---- Validierung gegen die echten Plugin-Schemata (wie das Harness selbst) ---- */
console.log('\nSchema-Prüfung des Entwurfs (dieselben Prüfer wie t63-validate-settings.mjs):')
const entwurf = yaml.load(readFileSync(tempPfad, 'utf8'))
let abgelehnt = 0
for (const [section, modulePath, exportName] of SCHEMAS) {
  const wert = entwurf[section]
  if (wert === undefined) {
    console.log(`  ${section.padEnd(14)} fehlt`)
    continue
  }
  try {
    const mod = await import(modulePath)
    const validated = mod[exportName](wert)
    const routen = validated?.providers === undefined ? '' : ` -> ${Object.keys(validated.providers).length} Anbieter-Routen`
    const modelle = validated?.models === undefined ? '' : ` -> ${validated.models.length} Modelle`
    const cre = validated?.crews === undefined ? '' : ` -> ${validated.crews.length} Crews`
    console.log(`  ${section.padEnd(14)} OK${routen}${modelle}${cre}`)
  } catch (error) {
    abgelehnt += 1
    console.log(`  ${section.padEnd(14)} ABGELEHNT: ${error?.message ?? error}`)
  }
}

const abschnitteVorher = Object.keys(live).length
const abschnitteNachher = Object.keys(entwurf).length
console.log(`\nAbschnitte: ${abschnitteVorher} -> ${abschnitteNachher} (erwartet: +1 durch agent-loop)`)
const refsVorher = [...liveText.matchAll(/apiKeyEnv\s*:\s*"?([A-Za-z0-9_]+)"?/g)].map((m) => m[1])
const refsNachher = [...tempText.matchAll(/apiKeyEnv\s*:\s*"?([A-Za-z0-9_]+)"?/g)].map((m) => m[1])
console.log(`Referenzen: ${new Set(refsVorher).size} -> ${new Set(refsNachher).size} distinkt, ${refsVorher.length} -> ${refsNachher.length} Vorkommen`)

if (verletzt > 0 || abgelehnt > 0) {
  console.log('\nABBRUCH: Invariante verletzt oder Schema abgelehnt — die Live-Datei bleibt unangetastet.')
  console.log(`Der Entwurf liegt zur Ansicht: ${tempPfad}`)
  process.exit(1)
}

if (!anwenden) {
  console.log('\nAlles grün. Geschrieben wurde NICHTS (Modus „nur prüfen").')
  console.log(`Entwurf: ${tempPfad}   ·   zum Anwenden: --anwenden`)
  process.exit(0)
}

/** ---- Tausch: Sicherung, dann atomar ---- */
const stempel = new Date().toISOString().replace(/[:.]/g, '-')
const sicherung = `${LIVE}.bak-aufsicht-${stempel}`
copyFileSync(LIVE, sicherung)
console.log(`\nSicherung: ${sicherung} (${liveText.length} B)`)
renameSync(tempPfad, LIVE)
console.log(`Getauscht: ${LIVE} (${tempText.length} B)`)

/** ---- Nachkontrolle am lebenden Objekt ---- */
const nachherText = readFileSync(LIVE, 'utf8')
const nachher = yaml.load(nachherText)
console.log('\nNachkontrolle:')
console.log(`  Abschnitte        : ${Object.keys(nachher).length}`)
console.log(`  agent-loop        : ${JSON.stringify(nachher['agent-loop'])}`)
console.log(`  openai-Route      : ${Object.keys(nachher['llm-pi-ai'].providers).length} Anbieter (openai ${nachher['llm-pi-ai'].providers.openai ? 'vorhanden' : 'FEHLT'})`)
console.log(`  Crews             : ${nachher.crew.crews.map((c) => c.id).join(', ')}`)
console.log(`  deepseek-flash    : contextWindow=${nachher['llm-deepseek'].models.find((m) => m.id === 'deepseek-flash')?.contextWindow}, Modalitäten=${JSON.stringify(nachher['llm-deepseek'].models.find((m) => m.id === 'deepseek-flash')?.inputModalities)}`)
console.log(`  agent-default-model: ${JSON.stringify(nachher['agent-default-model'])}`)
console.log(`  YAML gültig       : ja (geparst, ${nachherText.length} B)`)
console.log('\nKein Neustart ausgeführt (Hausregel H1). Das Harness lädt die Datei im Betrieb neu.')
