/**
 * Werkszeug: **das Register gießen, das Bündel bauen — und das Gebaute ausführen.**
 *
 * ## Warum das Register hier entsteht
 *
 * Der Browser kann `units/skills/index.json` nicht lesen. Also wird die Zuordnung
 * Sammlung → Fähigkeiten beim Bau in `src/register.ts` gegossen. Quelle ist ausschließlich
 * das Register, das `units/skills/link-skills.ps1` beim Verknüpfen schreibt — keine
 * Pfad-Heuristik, keine gepflegte Zweitliste.
 *
 * ## Warum die Prüfung der eigentliche Zweck ist
 *
 * Ein Bau, der eine Datei schreibt, ist kein Nachweis. Deshalb wird das **Gebaute**
 * ausgeführt: der Umschlag mit einem mitgeschriebenen `window` ausgewertet, die Fabrik
 * aufgerufen, `apply` an einem mitschreibenden `ctx` gelaufen — und die Quelle danach
 * **befragt**:
 *
 * * meldet sie sich am `/` an, mit `order` vor der eingebauten Liste?
 * * liefert die leere Eingabe die Sammlungen, jede mit `drill`?
 * * liefert `emilkowalski` genau die Fähigkeiten aus `ui-motion-picks`, jede mit `section`?
 * * liefert eine unbekannte Eingabe **nichts** (die eingebaute Quelle bleibt zuständig)?
 * * bleibt ein fehlgeschlagener Katalogabruf folgenlos (leere Liste, kein Wurf)?
 *
 * ```powershell
 * bun run packages/client/skills-by-package/build.mjs            # bauen + prüfen
 * bun run packages/client/skills-by-package/build.mjs --pruefen  # nur die vorhandene Datei prüfen
 * ```
 *
 * @module @prometheus-harness/client-skills-by-package/build
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Das Verzeichnis dieses Pakets. */
const HIER = dirname(fileURLToPath(import.meta.url))

/** Die Kennung, unter der der Kern das Bündel lädt — sie MUSS dem Paketnamen entsprechen. */
const KENNUNG = '@prometheus-harness/client-skills-by-package'

/** Wo das Register liegt, aus dem die Zuordnung kommt. */
const REGISTER = resolve(HIER, '../../../units/skills/index.json')

/** Wohin die gegossene Zuordnung geht. */
const GENERIERT = join(HIER, 'src', 'register.ts')

/** Die Zieldatei des Bündels. */
const ZIEL = join(HIER, 'lib', 'client.js')

/**
 * Die Baseline der Shell — gemessen, nicht geraten. Fundstelle:
 * `deepseek-harness/packages/client/web/src/platform.ts` (`PLATFORM_MODULES`).
 *
 * Dieses Plugin braucht **nichts** davon: es rendert nicht und importiert nichts. Die Liste
 * steht hier, damit die Prüfung unten fremde Modulwünsche bemerkt, statt sie durchzureichen.
 */
const BASELINE = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/**
 * Liest das Register und schreibt `src/register.ts`.
 *
 * @returns Anzahl der Sammlungen
 */
function giesseRegister() {
  const register = JSON.parse(readFileSync(REGISTER, 'utf8'))
  const sammlungen = [...register.collections]
    // Größte zuerst: die leere Eingabe zeigt sie in dieser Reihenfolge.
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((collection) => {
      const skills = register.skills
        .filter((skill) => skill.source === collection.name)
        .map((skill) => skill.name)
        .sort()
      return {
        name: collection.name,
        aliases: collection.aliases ?? [],
        skills,
      }
    })

  const kopf = `/**
 * **Erzeugt.** Nicht von Hand ändern — Quelle ist \`units/skills/index.json\`,
 * geschrieben von \`units/skills/link-skills.ps1\`, gegossen von \`build.mjs\`.
 *
 * Stand: ${register.generatedAt} · ${register.total} Fähigkeiten in ${sammlungen.length} Sammlungen.
 */

/** Eine Sammlung, wie der Client sie braucht. */
export interface CollectionIndex {
  readonly name: string
  readonly aliases: readonly string[]
  readonly skills: readonly string[]
}

/** Alle Sammlungen, größte zuerst. */
export const COLLECTIONS: readonly CollectionIndex[] = ${JSON.stringify(sammlungen, null, 2)}

/** Wie viele Fähigkeiten das Register insgesamt kennt. */
export const TOTAL = ${register.total}

/** Wann das Register geschrieben wurde (UTC). */
export const GENERATED_AT = ${JSON.stringify(register.generatedAt)}
`
  mkdirSync(dirname(GENERIERT), { recursive: true })
  writeFileSync(GENERIERT, kopf, 'utf8')
  return sammlungen.length
}

/**
 * Baut den Rumpf als CommonJS.
 *
 * `process.env.NODE_ENV` wird festgenagelt: ohne den Produktionsmodus baut Bun mit der
 * Entwicklungs-Laufzeit, und das Bündel verlangt Module, die der Modullader nicht kennt.
 *
 * @returns der Rumpf
 */
async function baueRumpf() {
  const ergebnis = await Bun.build({
    entrypoints: [join(HIER, 'src', 'index.ts')],
    target: 'browser',
    format: 'cjs',
    external: BASELINE,
    minify: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  })
  if (!ergebnis.success || ergebnis.outputs.length === 0) {
    throw new Error(`Der Bau scheiterte: ${ergebnis.logs.map((log) => String(log)).join(' ')}`)
  }
  return await ergebnis.outputs[0].text()
}

/**
 * Legt den Umschlag um den Rumpf, den der Kern erwartet.
 *
 * @param rumpf - das gebaute CommonJS
 * @returns die auszuliefernde Datei
 */
function umschliesse(rumpf) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(KENNUNG)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${rumpf}
    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
`
}

/**
 * Führt das Gebaute aus und befragt es.
 *
 * @param text - der Inhalt von `lib/client.js`
 * @returns die Befunde; leer heißt „bestanden"
 */
async function pruefe(text) {
  const befunde = []
  let geladen
  const fenster = { __ModuleLoader__: { load: (eintrag) => { geladen = eintrag } } }

  // **Wirklich auswerten**, nicht im Text nachsehen.
  // eslint-disable-next-line no-new-func
  new Function('window', text)(fenster)

  if (geladen === undefined) return ['Der Umschlag ruft window.__ModuleLoader__.load NICHT auf.']
  if (geladen.id !== KENNUNG) befunde.push(`Die Kennung ist „${String(geladen.id)}".`)

  const require = createRequire(join(HIER, 'package.json'))
  const verlangt = []
  const plugin = geladen.factory((modul) => {
    verlangt.push(modul)
    return require(modul)
  })
  const fremd = verlangt.filter((modul) => !BASELINE.includes(modul))
  if (fremd.length > 0) befunde.push(`Die Fabrik verlangt Module außerhalb der Baseline: ${fremd.join(', ')}.`)

  if (plugin.name !== 'skills-by-package') befunde.push(`name ist „${String(plugin.name)}".`)
  for (const dienst of ['inputTriggers', 'sessions', 'remote.skills']) {
    if (!Array.isArray(plugin.inject) || !plugin.inject.includes(dienst)) {
      befunde.push(`inject nennt "${dienst}" nicht.`)
    }
  }
  if (typeof plugin.apply !== 'function') return [...befunde, 'apply ist keine Funktion.']

  // Die Quelle mitschreiben. Der Katalog wird nachgebildet, nicht erfunden: die Form
  // (`{ ok, value: { skills } }`) steht so in dsh-client-ui-skill/lib/client.js.
  const { COLLECTIONS, TOTAL } = await import(`${GENERIERT}?stand=${Date.now()}`)
  const katalog = COLLECTIONS.flatMap((collection) =>
    collection.skills.map((skill) => ({ name: skill, description: `Beschreibung von ${skill}`, modelInvocable: skill !== 'review-animations' })),
  )
  let katalogFehler = false
  let quelle
  let registriert = 0
  // Das Popup mitschreiben. `setDraft` ist der Weg in den Entwurf — gemessen an
  // `SessionInput` in dsh-client-ui-conversation (`setDraft(text)`, `focus()`), erreicht
  // über `ctx.conversation.input.for(SessionBinding.ctx)`.
  let beitrag
  const entwurf = { draft: '/skills' }
  const eingabeAufrufe = []
  const eingabe = {
    state: { getSnapshot: () => ({ draft: entwurf.draft }) },
    setDraft: (text) => {
      eingabeAufrufe.push(['setDraft', text])
      entwurf.draft = text
    },
    focus: () => eingabeAufrufe.push(['focus']),
  }
  const ctx = {
    effect: (run, label) => {
      if (typeof label !== 'string' || label.length === 0) befunde.push('effect ohne Bezeichnung.')
      return run()
    },
    inputTriggers: {
      registerSource: (source) => {
        registriert++
        quelle = source
        return () => undefined
      },
    },
    commandUi: {
      register: (contribution) => {
        beitrag = contribution
        return () => undefined
      },
    },
    conversation: {
      input: {
        for: (actx) => {
          if (actx !== 'sitzungs-ctx') befunde.push('input.for bekam nicht den Sitzungskontext.')
          return eingabe
        },
      },
    },
    sessions: {
      binding: () => ({ ctx: 'sitzungs-ctx' }),
      using: async (_id, _optionen, run) =>
        run({ binding: { session: { getSnapshot: () => ({ openState: 'open' }) } } }),
    },
    remote: {
      skills: {
        list: async () => {
          if (katalogFehler) throw new Error('Katalog nicht erreichbar')
          return { ok: true, value: { skills: katalog } }
        },
      },
    },
  }
  plugin.apply(ctx)

  if (registriert !== 1) return [...befunde, `registerSource wurde ${registriert}-mal gerufen, erwartet: 1.`]
  if (quelle.trigger !== '/') befunde.push(`trigger ist „${String(quelle.trigger)}".`)
  if (quelle.name !== 'skills-by-package') befunde.push(`Quellenname ist „${String(quelle.name)}".`)
  if (quelle.order !== 1) befunde.push(`order ist ${String(quelle.order)}; die eingebaute Liste hat 2.`)
  if (quelle.showGroupTitle !== true) befunde.push('showGroupTitle fehlt.')

  const frage = (query, sessionId = 'sitzung-1') =>
    quelle.candidates({ sessionId }, { query, signal: new AbortController().signal })

  // 1. Leere Eingabe: die Sammlungen, jede aufklappbar.
  const leer = await frage('')
  if (!Array.isArray(leer) || leer.length !== COLLECTIONS.length) {
    befunde.push(`Leere Eingabe liefert ${leer?.length} Zeilen, erwartet: ${COLLECTIONS.length}.`)
  } else {
    if (!leer.every((zeile) => zeile.drill === true)) befunde.push('Nicht jede Sammlungszeile trägt drill.')
    if (leer.some((zeile) => zeile.section !== undefined)) befunde.push('Sammlungszeilen tragen eine section.')
    if (!leer.every((zeile) => typeof zeile.description === 'string' && /Fähigkeit/.test(zeile.description))) {
      befunde.push('Sammlungszeile ohne Anzahl in der Beschreibung.')
    }
  }

  // 2. Der Alias-Fall aus der Anforderung: /emilkowalski.
  const emil = await frage('emilkowalski')
  const erwartet = COLLECTIONS.find((collection) => collection.name === 'ui-motion-picks')
  if (erwartet === undefined) {
    befunde.push('Die Sammlung ui-motion-picks fehlt im Register.')
  } else {
    const namen = emil.map((zeile) => zeile.name).sort()
    const soll = [...erwartet.skills].sort()
    if (JSON.stringify(namen) !== JSON.stringify(soll)) {
      befunde.push(`emilkowalski liefert ${JSON.stringify(namen)}, erwartet ${JSON.stringify(soll)}.`)
    }
    if (!emil.every((zeile) => zeile.section === 'ui-motion-picks')) {
      befunde.push('Die Zeilen aus emilkowalski tragen nicht durchgehend section "ui-motion-picks".')
    }
    const menschlich = emil.find((zeile) => zeile.name === 'review-animations')
    if (menschlich === undefined || !menschlich.description.startsWith('nur menschlich')) {
      befunde.push('Eine nicht modell-aufrufbare Fähigkeit ist nicht als „nur menschlich" markiert.')
    }
  }

  // 3. Zwei Sammlungen in einem Suchwort.
  const motion = await frage('motion')
  const abschnitte = new Set(motion.map((zeile) => zeile.section))
  for (const name of ['iart-motion-skills', 'ui-motion-picks']) {
    if (!abschnitte.has(name)) befunde.push(`"motion" liefert keinen Abschnitt "${name}".`)
  }

  // 4. Unbekannt: die eingebaute Quelle bleibt zuständig.
  const unbekannt = await frage('zzz-nichts')
  if (unbekannt.length !== 0) befunde.push(`Unbekannte Eingabe liefert ${unbekannt.length} Zeilen statt 0.`)

  // 5. Katalogfehler bleibt folgenlos. Eigene Sitzung: der Zwischenspeicher gilt je Sitzung,
  //    ein Treffer aus Schritt 3 würde den Fehler verdecken.
  //    Die Meldung wird dabei aufgefangen: sie ist gewollt, soll den Baubericht aber nicht
  //    mit einem Stapelüberlauf fluten — und ihr Vorhandensein wird geprüft.
  const gemeldet = []
  const echterFehler = console.error
  console.error = (...argumente) => gemeldet.push(argumente.join(' '))
  katalogFehler = true
  const katalogWeg = await frage('pstack', 'sitzung-ohne-katalog')
  katalogFehler = false
  console.error = echterFehler
  if (!Array.isArray(katalogWeg) || katalogWeg.length !== 0) {
    befunde.push('Ein fehlgeschlagener Katalogabruf liefert Zeilen oder wirft aus der Quelle heraus.')
  }
  if (!gemeldet.some((zeile) => zeile.includes('catalog failed'))) {
    befunde.push('Ein fehlgeschlagener Katalogabruf wird verschluckt, ohne gemeldet zu werden.')
  }

  // 6. Das Popup `/skills` — Muster von `/model`.
  if (beitrag === undefined) return [...befunde, 'commandUi.register wurde nicht gerufen.']
  if (beitrag.name !== 'skills') befunde.push(`Befehlsname ist „${String(beitrag.name)}".`)
  if (typeof beitrag.label !== 'function' || typeof beitrag.description !== 'function') {
    befunde.push('label/description sind keine Funktionen.')
  } else {
    if (typeof beitrag.label() !== 'string' || beitrag.label().length === 0) befunde.push('label() ist leer.')
    if (!String(beitrag.description()).includes(String(TOTAL))) {
      befunde.push('description() nennt die Gesamtzahl nicht.')
    }
  }
  if (typeof beitrag.available !== 'function' || beitrag.available({ sessionId: 's' }) !== true) {
    befunde.push('available() meldet nicht true.')
  }

  const ui = beitrag.ui ?? {}
  if (ui.kind !== 'popupSelect') befunde.push(`ui.kind ist „${String(ui.kind)}".`)
  if (ui.searchMode !== 'substring') befunde.push(`searchMode ist „${String(ui.searchMode)}".`)
  if (typeof ui.searchLabels !== 'function') {
    befunde.push('searchLabels fehlt.')
  } else {
    const labels = ui.searchLabels()
    if (!labels.placeholder.includes('suchen')) befunde.push('Platzhalter nennt die Suche nicht.')
    if (!labels.empty || !labels.noResults) befunde.push('Leer- oder Nichttreffer-Text fehlt.')
  }

  // Optionen: alle Fähigkeiten, jede mit Sammlung als Gruppe.
  const optionen = await ui.options({ sessionId: 'sitzung-1' }, new AbortController().signal)
  const sollGesamt = COLLECTIONS.reduce((summe, collection) => summe + collection.skills.length, 0)
  if (!Array.isArray(optionen) || optionen.length !== sollGesamt) {
    befunde.push(`options liefert ${optionen?.length} Zeilen, erwartet: ${sollGesamt}.`)
  } else {
    if (new Set(optionen.map((zeile) => zeile.id)).size !== optionen.length) {
      befunde.push('Die Optionen haben doppelte Kennungen.')
    }
    const ohneGruppe = optionen.filter((zeile) => zeile.group === undefined)
    if (ohneGruppe.length !== 0) befunde.push(`${ohneGruppe.length} Optionen ohne Sammlungsgruppe.`)
    const ersteGruppe = optionen[0]?.group
    const groesste = [...COLLECTIONS].sort((a, b) => b.skills.length - a.skills.length)[0]
    if (ersteGruppe === undefined || ersteGruppe.name !== groesste.name) {
      befunde.push(`Erste Gruppe ist „${String(ersteGruppe?.name)}", erwartet „${groesste.name}".`)
    }
    const fremd = optionen.filter(
      (zeile) => zeile.group !== undefined && !COLLECTIONS.some((collection) => collection.name === zeile.group.name),
    )
    if (fremd.length !== 0) befunde.push(`${fremd.length} Optionen mit unbekannter Sammlung.`)
  }

  // Auswahl: der Pick landet im Entwurf, der Rest der Zeile bleibt stehen.
  ui.onSelect({ id: 'animate', label: 'animate' }, { sessionId: 'sitzung-1' })
  if (entwurf.draft !== '/animate') befunde.push(`Pick schrieb „${entwurf.draft}" statt „/animate".`)
  if (!eingabeAufrufe.some(([art]) => art === 'focus')) befunde.push('Der Fokus ging nicht zurück ins Eingabefeld.')

  // Mit getipptem Anhang: nur das Befehlswort wird ersetzt.
  entwurf.draft = '/skills baue mir eine Tabelle'
  eingabeAufrufe.length = 0
  ui.onSelect({ id: 'animate', label: 'animate' }, { sessionId: 'sitzung-1' })
  if (entwurf.draft !== '/animate baue mir eine Tabelle') {
    befunde.push(`Pick mit Anhang schrieb „${entwurf.draft}".`)
  }

  // Ohne eingehängte Sitzung: kein Wurf, kein Schreiben.
  const bindungVorher = ctx.sessions.binding
  ctx.sessions.binding = () => undefined
  entwurf.draft = '/skills'
  eingabeAufrufe.length = 0
  ui.onSelect({ id: 'animate' }, { sessionId: 'ohne-sitzung' })
  ctx.sessions.binding = bindungVorher
  if (eingabeAufrufe.length !== 0) befunde.push('Ohne Sitzungsbindung wurde trotzdem in den Entwurf geschrieben.')

  // 7. Die Reihenfolge in der Startliste: jeder Dienst, den die Fabrik verlangt, braucht sein
  //    Paket in `dsh.client.inject` — sonst lädt der Kern dieses Plugin vor seinem Anbieter.
  const dienstPakete = {
    inputTriggers: '@deepseek-ai/dsh-client-ui-input-trigger',
    commandUi: '@deepseek-ai/dsh-client-ui-commands',
    conversation: '@deepseek-ai/dsh-client-ui-conversation',
    sessions: '@deepseek-ai/dsh-api-session-controller',
    'remote.skills': '@deepseek-ai/dsh-api-remotes',
  }
  const paket = JSON.parse(readFileSync(join(HIER, 'package.json'), 'utf8'))
  const startliste = paket?.dsh?.client?.inject ?? []
  for (const dienst of plugin.inject) {
    const erwartet = dienstPakete[dienst]
    if (erwartet === undefined) {
      befunde.push(`Dienst "${dienst}" ist in der Zuordnung dieses Prüfers unbekannt.`)
      continue
    }
    if (!startliste.includes(erwartet)) {
      befunde.push(`"${dienst}" verlangt ${erwartet} in dsh.client.inject — fehlt.`)
    }
  }

  return befunde
}

const nurPruefen = process.argv.includes('--pruefen')

if (!nurPruefen) {
  if (!existsSync(REGISTER)) {
    console.error(`Das Register fehlt: ${REGISTER} — zuerst units/skills/link-skills.ps1 laufen lassen.`)
    process.exit(1)
  }
  const anzahl = giesseRegister()
  console.log(`Register gegossen: ${anzahl} Sammlungen -> src/register.ts`)

  const rumpf = await baueRumpf()
  mkdirSync(dirname(ZIEL), { recursive: true })
  writeFileSync(ZIEL, umschliesse(rumpf), 'utf8')
  console.log(`Bündel geschrieben: lib/client.js (${readFileSync(ZIEL, 'utf8').length} Zeichen)`)
}

if (!existsSync(ZIEL)) {
  console.error(`Kein Bündel zum Prüfen: ${ZIEL}`)
  process.exit(1)
}

const befunde = await pruefe(readFileSync(ZIEL, 'utf8'))
if (befunde.length > 0) {
  console.error('Prüfung FEHLGESCHLAGEN:')
  for (const befund of befunde) console.error(`  - ${befund}`)
  process.exit(1)
}
console.log('Prüfung bestanden: Quelle registriert, Sammlungstreffer belegt, Popup gruppiert und schreibend, Katalogfehler folgenlos.')
