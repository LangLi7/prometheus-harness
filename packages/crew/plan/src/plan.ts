/**
 * Zerlegen, reihen, ausführen — der Ablauf einer Crew.
 *
 * ## Die drei Schritte, die den Unterschied zwischen „Plan" und „Abarbeitung" machen
 *
 * 1. **Zerlegen** (`zerlegePlan`): aus der Antwort des Planers wird eine Schritttabelle. Ein Modell
 *    liefert nicht immer JSON; deshalb ist der Nicht-JSON-Fall **kein Fehler**, sondern ein Plan
 *    mit einem Schritt. Ein Lauf, der an der Form der Antwort scheitert, ist ein Lauf, der nie
 *    beginnt.
 * 2. **Reihen** (`wellen`): Schritte ohne offene Vorbedingung laufen **zusammen**, abhängige in
 *    einer späteren Welle. Ein Ring in den Abhängigkeiten hält den Lauf nicht an — der Rest läuft
 *    hintereinander, damit niemand auf etwas wartet, das nie kommt.
 * 3. **Ausführen** (`fuehreAus`): jede Welle gleichzeitig, dann die Prüfung. Beanstandet der
 *    Prüfer, läuft **dieselbe** Tabelle mit den Mängeln erneut — nicht ein neuer Plan. Wer neu
 *    plant, verschiebt das Ziel; wer dieselbe Tabelle wiederholt, arbeitet die Mängel ab.
 *
 * ## Warum die Rolle **je Schritt** gewählt werden kann
 *
 * Der Harness schickt jeden Schritt an den `executor`. Damit ist „starkes Modell für die Planung,
 * billiges für die Arbeit" eine Aussage über **zwei** Rollen, und Bild- oder Suchschritte gibt es
 * gar nicht. Hier trägt jeder Schritt seine Rolle: der Planer kann einen Rechercheschritt der
 * Rolle `search` geben und einen Bildschritt der Rolle `vision`. Das ist die Stelle, an der
 * „starkes Modell **oder** Bildmodell **oder** Browser-Suche" aus einer Absicht ein Ablauf wird.
 *
 * @module @prometheus-harness/crew-plan/plan
 */

import { CREW_ROLLEN, istRolle, type CrewRolle } from './types.ts'
import { personaPrompt, PERSONA_VORLAGEN, type BeanstandungSchwere, type CrewPersona } from './personas.ts'

/** Ein Schritt, wie der Planer ihn liefert — nach der Bereinigung. */
export interface PlanSchritt {
  /** Stabile Kennung innerhalb des Plans. */
  id: string
  /** Was zu tun ist. */
  auftrag: string
  /** Die Kennungen, deren Ergebnisse vorliegen müssen. */
  abhaengigVon: string[]
  /** Welche Rolle den Schritt ausführt. */
  rolle: CrewRolle
}

/** Das, was eine Rolle zurückgibt. */
export interface Rollenaufruf {
  /** Der Text der Antwort. */
  text: string
  /** Die verbrauchten Token. */
  tokens: { hinein: number; heraus: number }
}

/** Wie eine Rolle gerufen wird. */
export type RufeRolle = (rolle: CrewRolle, auftrag: string) => Promise<Rollenaufruf>

/**
 * Wie eine **Persona** gerufen wird.
 *
 * **Warum ein eigener Weg und nicht `rufe` mit einer Rolle.** Die Personas sind keine
 * Ablaufrollen (`CREW_ROLLEN`); welches Modell eine Persona bedient, entscheidet die Naht über
 * ihr Tier. Der Kern kennt den Prompt, die Naht das Modell — dieselbe Trennung wie überall.
 *
 * @param persona - die Persona
 * @param auftrag - der Prüfauftrag (Entwurf, Rubric, Mängel)
 * @param system - der Persona-Prompt (Kopf, Prüfauftrag, Ausgabeschema)
 */
export type RufePersona = (
  persona: CrewPersona,
  auftrag: string,
  system: string,
) => Promise<Rollenaufruf>

/** Eine Beanstandung, wie eine Persona sie liefert. */
export interface Beanstandung {
  /** Zitat oder Abschnitt, auf den sich die Beanstandung bezieht. */
  fundstelle: string
  /** Was nicht trägt — ein Satz, konkret. */
  befund: string
  /** Warum es nicht trägt — Regel, Zahl, Widerspruch oder fehlende Angabe. */
  beleg: string
  /** Die Schwere. */
  schwere: BeanstandungSchwere
}

/** Der Sitz einer Persona im Rat. */
export interface RatSitzung {
  /** Die Persona. */
  persona: CrewPersona
  /** Ihre Beanstandungen (leer bei `pass`). */
  beanstandungen: Beanstandung[]
  /** Ihr Urteil über den Entwurf. */
  urteil: 'pass' | 'revise' | 'fail'
  /** Ihre Begründung. */
  begruendung: string
  /** Die verbrauchten Token. */
  tokens: { hinein: number; heraus: number }
}

/** Das Ergebnis eines Schritts. */
export interface SchrittErgebnis {
  /** Die Kennung des Schritts. */
  id: string
  /** Die Rolle, die ihn ausgeführt hat. */
  rolle: CrewRolle
  /** Die Antwort. */
  ergebnis: string
  /** Die verbrauchten Token. */
  tokens: { hinein: number; heraus: number }
}

/** Wie ein Lauf ausgeht. */
export type Urteil = 'pass' | 'fail' | 'exhausted'

/** Was ein Lauf vorzuweisen hat. */
export interface Lauf {
  /** Die Crew. */
  crew: string
  /** Das Ziel. */
  ziel: string
  /** Der Plan, mit dem gearbeitet wurde. */
  plan: PlanSchritt[]
  /** Die Ergebnisse der **letzten** Runde, in Planreihenfolge. */
  ergebnisse: SchrittErgebnis[]
  /** Das Urteil. */
  urteil: Urteil
  /** Wie viele Runden gelaufen sind. */
  versuche: number
  /** Die offenen Mängel (leer bei `pass`). */
  maengel: string[]
  /** Die verbrauchten Token über **alle** Runden und Rollen. */
  tokens: { hinein: number; heraus: number }
  /** Die Sitzungen des Rats in der letzten Runde (leer, wenn ohne Rat gelaufen wurde). */
  rat: RatSitzung[]
  /** Die Entscheidung des Richters; `null`, wenn ohne Rat gelaufen wurde. */
  richter: { urteil: 'pass' | 'revise' | 'fail'; begruendung: string } | null
}

/** Was zum Ausführen nötig ist. */
export interface Ausfuehrung {
  /** Die Crew. */
  crew: string
  /** Das Ziel. */
  ziel: string
  /** Der Plan. */
  plan: PlanSchritt[]
  /** Wie eine Rolle gerufen wird. */
  rufe: RufeRolle
  /** Wie viele Runden höchstens (Vorgabe 3). */
  maxVersuche?: number
  /** Kumulatives Token-Budget; 0 oder fehlend heißt unbegrenzt. */
  maxTokens?: number
  /** Die prüfende Rolle; `null` heißt: keine Prüfung, der Lauf gilt als bestanden. */
  pruefer?: CrewRolle | null
  /**
   * Die Personas des Rats; leer oder fehlend heißt: keine Ratssitzung.
   *
   * **Warum der Rat nicht `pruefer` ersetzt.** Ohne Rat läuft die alte Prüfschleife
   * unverändert — ein Lauf, der heute funktioniert, funktioniert weiter. Mit Rat tritt der
   * Richter an die Stelle des einzelnen Prüfers.
   */
  rat?: readonly CrewPersona[]
  /**
   * Die Prüfkriterien.
   *
   * **Ohne Rubric kann der Richter nur „revise" sagen.** Er hat dann keine Skala, an der er
   * „pass" festmachen könnte; er entscheidet nach den Beanstandungen (blocker → fail,
   * wichtig → revise, nur hinweis → pass). Das ist ehrlich, aber gröber.
   */
  rubric?: string
  /** Wie eine Persona gerufen wird — nötig, sobald `rat` gesetzt ist. */
  rufePersona?: RufePersona
  /** Die Rolle des Richters (Vorgabe `reviewer`); `null` heißt: der Rat entscheidet selbst. */
  richter?: CrewRolle | null
  /**
   * Ein zusätzlicher Prüfmaßstab für den Richter — etwa der Text einer Skill.
   *
   * **Warum das ein Text ist und kein Werkzeug.** Der Richter prüft einen Entwurf; er führt keine
   * Werkzeuge aus. Eine Skill (z. B. „Sicherheitsprüfung") liefert Kriterien, gegen die er prüft —
   * als Text im Auftrag, nachvollziehbar im Protokoll.
   */
  richterZusatz?: string
}

/** Eine Welle: die Schritte, die zusammen laufen dürfen. */
export type Wellenplan = PlanSchritt[][]

/**
 * Entscheidet, welche Rolle eine Anfrage beantwortet.
 *
 * Die Reihenfolge ist die Regel: ein Bild geht an **eine** Bildrolle (sonst behauptet der Executor,
 * es gesehen zu haben); ohne Bild an den Executor; ist der frei, an den Planer. Ist keine dieser
 * Rollen gebunden, gibt es keinen Weg — und das wird gesagt, statt an eine leere Rolle zu schicken.
 *
 * @param feld - ob ein Bild dabei ist und welche Rollen gebunden sind
 * @returns die Rolle, die antwortet
 * @throws Error wenn keine der drei Rollen gebunden ist
 */
export function routen(feld: { bild: boolean; gebunden: readonly CrewRolle[] }): CrewRolle {
  const reihe: CrewRolle[] = feld.bild ? ['vision', 'executor', 'planner'] : ['executor', 'planner']
  for (const rolle of reihe) {
    if (feld.gebunden.includes(rolle)) return rolle
  }
  throw new Error(
    feld.bild
      ? 'die Crew bindet keine Bildrolle (vision) und keine Ausfuehrungsrolle (executor)'
      : 'die Crew bindet keine Ausfuehrungsrolle (executor) und keine Planungsrolle (planner)',
  )
}

/**
 * Macht aus der Antwort des Planers eine Schritttabelle.
 *
 * **Was toleriert wird und warum.** Ein Modell antwortet in Prosa, in JSON, in JSON mit falschem
 * Feldnamen oder gar nicht. Statt die Antwort zu verwerfen, wird sie gelesen: `instruction` wie
 * `auftrag`, `dependsOn` wie `abhaengigVon`, `role` wie `rolle`. Doppelte Kennungen bekommen einen
 * Zusatz, damit kein Ergebnis das andere überschreibt. Vorbedingungen, die der Plan nie liefert,
 * fallen weg — sonst wartet der Schritt auf etwas, das nicht kommt.
 *
 * @param antwort - die Antwort des Planers
 * @param ziel - das Ziel, falls die Antwort nichts Verwertbares enthält
 * @returns die Schritttabelle; nie leer
 */
export function zerlegePlan(antwort: string, ziel: string): PlanSchritt[] {
  const text = antwort.trim()
  const einzeln = (auftrag: string): PlanSchritt[] => [{
    id: 't1',
    auftrag,
    abhaengigVon: [],
    rolle: 'executor',
  }]
  if (text === '') return einzeln(ziel)

  const roh = liesJson(text)
  const eintraege = alsSchrittliste(roh)
  if (eintraege === undefined) return einzeln(text)

  const schritte: PlanSchritt[] = []
  const vergeben = new Set<string>()
  for (const eintrag of eintraege) {
    if (typeof eintrag !== 'object' || eintrag === null) continue
    const feld = eintrag as Record<string, unknown>
    const auftrag = liesText(feld['instruction']) ?? liesText(feld['auftrag']) ?? liesText(feld['text'])
    if (auftrag === undefined) continue
    const rohId = liesText(feld['id']) ?? `t${String(schritte.length + 1)}`
    const id = eindeutig(rohId, vergeben)
    const rolle = istRolle(feld['role']) ? feld['role'] : istRolle(feld['rolle']) ? feld['rolle'] : 'executor'
    const abhaengigVon = liesListe(feld['dependsOn'] ?? feld['abhaengigVon'])
    schritte.push({ id, auftrag, abhaengigVon, rolle })
  }
  if (schritte.length === 0) return einzeln(text)

  const bekannt = new Set(schritte.map((schritt) => schritt.id))
  for (const schritt of schritte) {
    schritt.abhaengigVon = schritt.abhaengigVon.filter(
      (kennung) => kennung !== schritt.id && bekannt.has(kennung),
    )
  }
  return schritte
}

/**
 * Reiht die Schritte in Wellen.
 *
 * **Warum ein Ring nicht wirft.** Ein Plan mit `a → b → a` ist ein Fehler des Planers, aber kein
 * Grund, die Arbeit liegenzulassen. Der Rest des Plans wird abgearbeitet, und die Schritte im Ring
 * laufen hintereinander — sichtbar in ihrer eigenen Welle.
 *
 * @param schritte - die Schritttabelle
 * @returns die Wellen in Ausführungsreihenfolge
 */
export function wellen(schritte: readonly PlanSchritt[]): Wellenplan {
  const wartet = new Map<string, number>()
  const nachfolger = new Map<string, string[]>()
  for (const schritt of schritte) {
    wartet.set(schritt.id, schritt.abhaengigVon.length)
    for (const abhaengig of schritt.abhaengigVon) {
      const liste = nachfolger.get(abhaengig) ?? []
      liste.push(schritt.id)
      nachfolger.set(abhaengig, liste)
    }
  }
  const plan: Wellenplan = []
  const offen = new Map(schritte.map((schritt) => [schritt.id, schritt]))
  while (offen.size > 0) {
    const welle: PlanSchritt[] = []
    for (const [id, schritt] of offen) {
      if ((wartet.get(id) ?? 0) === 0) welle.push(schritt)
    }
    if (welle.length === 0) {
      // Ring: die übrigen Schritte laufen einzeln, in Planreihenfolge.
      for (const schritt of offen.values()) plan.push([schritt])
      return plan
    }
    plan.push(welle)
    for (const schritt of welle) {
      offen.delete(schritt.id)
      for (const folge of nachfolger.get(schritt.id) ?? []) {
        wartet.set(folge, (wartet.get(folge) ?? 0) - 1)
      }
    }
  }
  return plan
}

/**
 * Führt einen Plan aus: Wellen, Prüfung, Mängel.
 *
 * @param ausfuehrung - Plan, Ruf-Funktion und Grenzen
 * @returns der Lauf mit Urteil, Ergebnissen und Token
 * @throws Error wenn eine Rolle scheitert (der Fehler wird nicht verschluckt)
 */
export async function fuehreAus(ausfuehrung: Ausfuehrung): Promise<Lauf> {
  const maxVersuche = ausfuehrung.maxVersuche ?? 3
  if (!Number.isSafeInteger(maxVersuche) || maxVersuche < 1) {
    throw new Error(`maxVersuche muss eine positive ganze Zahl sein, war ${String(maxVersuche)}`)
  }
  const grenze = ausfuehrung.maxTokens ?? 0
  if (!Number.isSafeInteger(grenze) || grenze < 0) {
    throw new Error(`maxTokens muss eine ganze Zahl >= 0 sein, war ${String(grenze)}`)
  }
  const pruefer = ausfuehrung.pruefer === undefined ? 'reviewer' : ausfuehrung.pruefer
  const rat = ausfuehrung.rat ?? []
  if (rat.length > 0 && ausfuehrung.rufePersona === undefined) {
    throw new Error('ein Rat ist gesetzt, aber rufePersona fehlt — der Kern ruft keine Modelle')
  }

  const reihen = wellen(ausfuehrung.plan)
  const tokens = { hinein: 0, heraus: 0 }
  const ergebnisse = new Map<string, SchrittErgebnis>()
  let maengel: string[] = []
  let versuche = 0
  let urteil: Urteil = 'fail'
  let ratSitzungen: RatSitzung[] = []
  let richterspruch: { urteil: 'pass' | 'revise' | 'fail'; begruendung: string } | null = null
  const budgetErschoepft = (): boolean => grenze > 0 && tokens.hinein + tokens.heraus > grenze

  while (versuche < maxVersuche) {
    versuche += 1
    let angehalten = false
    for (const reihe of reihen) {
      if (budgetErschoepft()) {
        angehalten = true
        break
      }
      const erledigt = await Promise.all(reihe.map(async (schritt) => {
        const auftrag = baueAuftrag(ausfuehrung.crew, ausfuehrung.ziel, schritt, ergebnisse, maengel)
        const antwort = await ausfuehrung.rufe(schritt.rolle, auftrag)
        return { schritt, antwort }
      }))
      for (const { schritt, antwort } of erledigt) {
        tokens.hinein += antwort.tokens.hinein
        tokens.heraus += antwort.tokens.heraus
        ergebnisse.set(schritt.id, {
          id: schritt.id,
          rolle: schritt.rolle,
          ergebnis: antwort.text,
          tokens: { ...antwort.tokens },
        })
      }
      if (budgetErschoepft()) {
        angehalten = true
        break
      }
    }
    if (angehalten) {
      urteil = 'exhausted'
      maengel = [...maengel, `Token-Budget von ${String(grenze)} ueberschritten`]
      break
    }
    if (rat.length > 0) {
      // **Der Rat prüft, der Richter entscheidet.** Beides in einem Schritt, damit die Schleife
      // nur ein Urteil kennt — und damit die Beanstandungen der Runde an die nächste gehen.
      const befund = await pruefeMitRat(ausfuehrung, rat, ergebnisse, maengel)
      tokens.hinein += befund.tokens.hinein
      tokens.heraus += befund.tokens.heraus
      ratSitzungen = befund.sitzungen
      richterspruch = befund.richter
      if (befund.pass) {
        urteil = 'pass'
        maengel = []
        break
      }
      maengel = befund.maengel
      urteil = 'fail'
      continue
    }
    if (pruefer === null) {
      urteil = 'pass'
      maengel = []
      break
    }
    const pruefung = await ausfuehrung.rufe(pruefer, bauePruefauftrag(ausfuehrung.ziel, ergebnisse, maengel))
    tokens.hinein += pruefung.tokens.hinein
    tokens.heraus += pruefung.tokens.heraus
    const befund = liesPruefung(pruefung.text)
    if (befund.pass) {
      urteil = 'pass'
      maengel = []
      break
    }
    maengel = befund.maengel.length > 0 ? befund.maengel : ['der Pruefer hat ohne Begruendung beanstandet']
    urteil = 'fail'
  }

  const inReihenfolge = ausfuehrung.plan
    .map((schritt) => ergebnisse.get(schritt.id))
    .filter((eintrag): eintrag is SchrittErgebnis => eintrag !== undefined)

  return {
    crew: ausfuehrung.crew,
    ziel: ausfuehrung.ziel,
    plan: ausfuehrung.plan,
    ergebnisse: inReihenfolge,
    urteil,
    versuche,
    maengel: urteil === 'pass' ? [] : maengel,
    tokens,
    rat: ratSitzungen,
    richter: richterspruch,
  }
}

/** Das Ergebnis eines Ratsschlags. */
interface Ratbefund {
  /** Ob der Lauf als bestanden gilt. */
  pass: boolean
  /** Die Mängel für die nächste Runde. */
  maengel: string[]
  /** Die Sitzungen aller Personas. */
  sitzungen: RatSitzung[]
  /** Der Spruch des Richters; `null`, wenn der Rat selbst entschieden hat. */
  richter: { urteil: 'pass' | 'revise' | 'fail'; begruendung: string } | null
  /** Die verbrauchten Token. */
  tokens: { hinein: number; heraus: number }
}

/**
 * Hält eine Ratssitzung: alle Personas prüfen den Entwurf, dann entscheidet der Richter.
 *
 * **Warum alle gleichzeitig.** Die Personas prüfen **denselben** Entwurf; sie voneinander
 * abhängig zu machen, würde nur die Laufzeit erhöhen. Der Richter sieht danach alle Sitzungen.
 *
 * **Warum der Richter nicht wegfällt, wenn der Rat „pass" sagt.** Ein Rat aus acht Zustimmungen
 * ohne Rubric ist kein Beweis. Der Richter ist die Stelle, an der aus Beanstandungen ein Urteil
 * wird — und an der ein fehlender Rubric auffällt.
 *
 * @param ausfuehrung - die Ausführung (enthält `rufePersona`, `rubric`, `richter`)
 * @param rat - die Personas
 * @param ergebnisse - die Ergebnisse der Runde
 * @param maengel - die offenen Mängel der Vorrunde
 * @returns der Ratbefund
 */
async function pruefeMitRat(
  ausfuehrung: Ausfuehrung,
  rat: readonly CrewPersona[],
  ergebnisse: Map<string, SchrittErgebnis>,
  maengel: readonly string[],
): Promise<Ratbefund> {
  const rufePersona = ausfuehrung.rufePersona
  if (rufePersona === undefined) {
    throw new Error('ein Rat ist gesetzt, aber rufePersona fehlt')
  }
  const tokens = { hinein: 0, heraus: 0 }
  const auftrag = baueRatAuftrag(ausfuehrung.ziel, ausfuehrung.rubric, entwurfAus(ausfuehrung.plan, ergebnisse), maengel)
  const antworten = await Promise.all(rat.map(async (persona) => {
    const antwort = await rufePersona(persona, auftrag, personaPrompt(persona))
    return { persona, antwort }
  }))
  const sitzungen: RatSitzung[] = antworten.map(({ persona, antwort }) => {
    tokens.hinein += antwort.tokens.hinein
    tokens.heraus += antwort.tokens.heraus
    return {
      persona,
      ...liesSitzung(antwort.text),
      tokens: { ...antwort.tokens },
    }
  })

  const richter = ausfuehrung.richter === undefined ? 'reviewer' : ausfuehrung.richter
  if (richter === null) {
    // Ohne Richter entscheidet der Rat selbst — nur wenn **alle** zustimmen.
    return {
      pass: sitzungen.every((sitzung) => sitzung.urteil === 'pass'),
      maengel: maengelAus(sitzungen),
      sitzungen,
      richter: null,
      tokens,
    }
  }

  const entscheidung = await ausfuehrung.rufe(richter, baueRichterAuftrag(ausfuehrung.ziel, ausfuehrung.rubric, sitzungen, ausfuehrung.richterZusatz))
  tokens.hinein += entscheidung.tokens.hinein
  tokens.heraus += entscheidung.tokens.heraus
  const spruch = liesRichter(entscheidung.text)
  return {
    pass: spruch.urteil === 'pass',
    maengel: spruch.maengel,
    sitzungen,
    richter: { urteil: spruch.urteil, begruendung: spruch.begruendung },
    tokens,
  }
}

/**
 * Formt den Entwurf, den der Rat prüft — die Ergebnisse in Planreihenfolge.
 *
 * @param plan - der Plan
 * @param ergebnisse - die Ergebnisse
 * @returns der Entwurf als Text
 */
function entwurfAus(plan: readonly PlanSchritt[], ergebnisse: Map<string, SchrittErgebnis>): string {
  const zeilen: string[] = []
  for (const schritt of plan) {
    const ergebnis = ergebnisse.get(schritt.id)
    if (ergebnis === undefined) continue
    zeilen.push(`### ${schritt.id} (${schritt.rolle})`, ergebnis.ergebnis)
  }
  return zeilen.length > 0 ? zeilen.join('\n\n') : '(kein Ergebnis)'
}

/**
 * Baut den Auftrag an den Rat.
 *
 * **Warum der Rubric mitkommt.** Ohne ihn prüft jede Persona gegen ihr eigenes Gefühl von „gut".
 * Mit ihm prüfen alle gegen dieselbe Skala — die Voraussetzung dafür, dass der Richter
 * vergleichen kann.
 *
 * @param ziel - das Ziel
 * @param rubric - die Prüfkriterien (optional)
 * @param entwurf - der Entwurf
 * @param maengel - die offenen Mängel der Vorrunde
 * @returns der Auftrag
 */
function baueRatAuftrag(
  ziel: string,
  rubric: string | undefined,
  entwurf: string,
  maengel: readonly string[],
): string {
  const teile = [`Ziel: ${ziel}`]
  teile.push(rubric === undefined || rubric.trim() === ''
    ? 'Rubric: (keiner gesetzt — prüfe gegen das Ziel und benenne, was fehlt)'
    : `Rubric:\n${rubric}`)
  teile.push(`Entwurf:\n${entwurf}`)
  if (maengel.length > 0) {
    teile.push(`Offene Mängel der Vorrunde:\n${maengel.map((mangel) => `- ${mangel}`).join('\n')}`)
  }
  teile.push('Prüfe diesen Entwurf aus deiner Perspektive. Antworte ausschließlich im Ausgabeschema.')
  return teile.join('\n\n')
}

/**
 * Baut den Auftrag an den Richter.
 *
 * @param ziel - das Ziel
 * @param rubric - die Prüfkriterien (optional)
 * @param sitzungen - die Sitzungen des Rats
 * @returns der Auftrag
 */
function baueRichterAuftrag(
  ziel: string,
  rubric: string | undefined,
  sitzungen: readonly RatSitzung[],
  zusatz?: string,
): string {
  const zeilen = sitzungen.map((sitzung) => {
    const beanstandungen = sitzung.beanstandungen.length === 0
      ? '  (keine)'
      : sitzung.beanstandungen
        .map((b) => `  - [${b.schwere}] ${b.fundstelle}: ${b.befund} — ${b.beleg}`)
        .join('\n')
    return `${PERSONA_VORLAGEN[sitzung.persona].name} (${sitzung.urteil}): ${sitzung.begruendung}\n${beanstandungen}`
  })
  const teile = [`Ziel: ${ziel}`]
  teile.push(rubric === undefined || rubric.trim() === ''
    ? 'Rubric: (keiner gesetzt — entscheide nach den Beanstandungen: blocker → fail, wichtig → revise, nur hinweis → pass)'
    : `Rubric:\n${rubric}`)
  if (zusatz !== undefined && zusatz.trim() !== '') {
    teile.push(`Zusätzlicher Prüfmaßstab:\n${zusatz}`)
  }
  teile.push(`Sitzungen des Rats:\n${zeilen.join('\n\n')}`)
  teile.push(
    'Entscheide. Antworte ausschließlich mit JSON in dieser Form:\n'
    + '{"urteil":"pass | revise | fail","begruendung":"ein bis zwei Sätze","maengel":["was in der nächsten Runde behoben werden muss"]}\n'
    + 'Regeln: "pass" nur, wenn keine Beanstandung der Schwere wichtig oder blocker offen ist. '
    + '"fail" bei mindestens einem blocker. "revise" sonst. Erfinde keine Mängel.',
  )
  return teile.join('\n\n')
}

/**
 * Liest die Antwort einer Persona.
 *
 * **Warum eine unlesbare Antwort keine Zustimmung ist.** Wer kein JSON liefert, hat nicht geprüft.
 * Das wird als Mangel der Schwere „wichtig" gemeldet — nicht als „pass" und nicht als Absturz.
 *
 * @param text - die Antwort
 * @returns Beanstandungen, Urteil und Begründung (ohne Token)
 */
function liesSitzung(text: string): Omit<RatSitzung, 'persona' | 'tokens'> {
  const roh = liesJson(text)
  if (typeof roh !== 'object' || roh === null) {
    return {
      beanstandungen: [{
        fundstelle: '(Antwort)',
        befund: 'Die Antwort war kein JSON — die Prüfung ist nicht auswertbar.',
        beleg: 'Das Ausgabeschema verlangt JSON mit beanstandungen, urteil und begruendung.',
        schwere: 'wichtig',
      }],
      urteil: 'revise',
      begruendung: 'Antwort nicht auswertbar',
    }
  }
  const feld = roh as Record<string, unknown>
  const beanstandungen = liesBeanstandungen(feld['beanstandungen'])
  const rohUrteil = liesText(feld['urteil'])
  const urteil: 'pass' | 'revise' | 'fail' = rohUrteil === 'pass' || rohUrteil === 'revise' || rohUrteil === 'fail'
    ? rohUrteil
    : beanstandungen.some((b) => b.schwere === 'blocker')
      ? 'fail'
      : beanstandungen.length > 0
        ? 'revise'
        : 'pass'
  return {
    beanstandungen,
    urteil,
    begruendung: liesText(feld['begruendung']) ?? '',
  }
}

/**
 * Liest die Beanstandungen einer Persona.
 *
 * @param wert - das Feld `beanstandungen`
 * @returns die Beanstandungen
 */
function liesBeanstandungen(wert: unknown): Beanstandung[] {
  if (!Array.isArray(wert)) return []
  const liste: Beanstandung[] = []
  for (const eintrag of wert) {
    if (typeof eintrag !== 'object' || eintrag === null) continue
    const feld = eintrag as Record<string, unknown>
    const befund = liesText(feld['befund'])
    if (befund === undefined) continue
    liste.push({
      fundstelle: liesText(feld['fundstelle']) ?? '(ohne Fundstelle)',
      befund,
      beleg: liesText(feld['beleg']) ?? '(ohne Beleg)',
      // **Unbekannte Schwere gilt als „wichtig".** Eine fehlende Angabe darf nicht als harmlos
      // durchgehen — sonst wird eine kaputte Antwort zur Zustimmung.
      schwere: alsSchwere(feld['schwere']),
    })
  }
  return liste
}

/**
 * Liest die Schwere einer Beanstandung.
 *
 * @param wert - der Rohwert
 * @returns die Schwere; unbekannt wird zu „wichtig"
 */
function alsSchwere(wert: unknown): BeanstandungSchwere {
  return wert === 'blocker' || wert === 'wichtig' || wert === 'hinweis' ? wert : 'wichtig'
}

/**
 * Liest den Spruch des Richters.
 *
 * @param text - die Antwort
 * @returns Urteil, Begründung und Mängel
 */
function liesRichter(text: string): { urteil: 'pass' | 'revise' | 'fail'; begruendung: string; maengel: string[] } {
  const roh = liesJson(text)
  if (typeof roh !== 'object' || roh === null) {
    return {
      urteil: 'revise',
      begruendung: 'Der Richter hat kein auswertbares JSON geliefert.',
      maengel: [text.trim() === '' ? 'der Richter hat ohne Begruendung entschieden' : text.trim()],
    }
  }
  const feld = roh as Record<string, unknown>
  const rohUrteil = liesText(feld['urteil'])
  const urteil: 'pass' | 'revise' | 'fail' = rohUrteil === 'pass' || rohUrteil === 'revise' || rohUrteil === 'fail'
    ? rohUrteil
    : 'revise'
  const maengel = liesListe(feld['maengel'])
  return {
    urteil,
    begruendung: liesText(feld['begruendung']) ?? '',
    maengel: maengel.length > 0 ? maengel : urteil === 'pass' ? [] : ['der Richter hat ohne Mangel entschieden'],
  }
}

/**
 * Macht aus den Sitzungen die Mängelliste für die nächste Runde.
 *
 * @param sitzungen - die Sitzungen
 * @returns die Mängel als Zeilen (ohne reine Hinweise)
 */
function maengelAus(sitzungen: readonly RatSitzung[]): string[] {
  const zeilen: string[] = []
  for (const sitzung of sitzungen) {
    for (const beanstandung of sitzung.beanstandungen) {
      if (beanstandung.schwere === 'hinweis') continue
      zeilen.push(
        `[${PERSONA_VORLAGEN[sitzung.persona].name}] ${beanstandung.fundstelle}: ${beanstandung.befund} — ${beanstandung.beleg}`,
      )
    }
  }
  return zeilen
}

/**
 * Baut den Auftrag eines Schritts.
 *
 * **Warum der Kontext klein bleibt.** Ein Worker bekommt das Ziel, seinen Schritt und die
 * Ergebnisse, auf die er sich stützt — nicht das ganze Gespräch. Sonst zahlt jeder Schritt für den
 * gesamten Verlauf, und die Arbeit eines Schritts verschwindet in der Menge.
 *
 * @param crew - die Crew
 * @param ziel - das Ziel
 * @param schritt - der Schritt
 * @param ergebnisse - die bisherigen Ergebnisse
 * @param maengel - die offenen Mängel
 * @returns der Auftragstext
 */
function baueAuftrag(
  crew: string,
  ziel: string,
  schritt: PlanSchritt,
  ergebnisse: ReadonlyMap<string, SchrittErgebnis>,
  maengel: readonly string[],
): string {
  const teile: string[] = [
    `Crew: ${crew}`,
    `Ziel: ${ziel}`,
    `Dein Auftrag (${schritt.id}): ${schritt.auftrag}`,
  ]
  if (schritt.abhaengigVon.length > 0) {
    teile.push('Ergebnisse, auf die du dich stuetzt:')
    for (const kennung of schritt.abhaengigVon) {
      const ergebnis = ergebnisse.get(kennung)
      teile.push(`- ${kennung}: ${ergebnis?.ergebnis.trim() ?? '(noch kein Ergebnis)'}`)
    }
  }
  if (maengel.length > 0) {
    teile.push('Maengel aus der letzten Pruefung, die dieser Lauf beheben soll:')
    for (const mangel of maengel) teile.push(`- ${mangel}`)
  }
  return teile.join('\n')
}

/**
 * Baut den Auftrag des Prüfers.
 *
 * @param ziel - das Ziel
 * @param ergebnisse - die Ergebnisse aller Schritte
 * @param maengel - die Mängel der letzten Runde
 * @returns der Prüfauftrag
 */
function bauePruefauftrag(
  ziel: string,
  ergebnisse: ReadonlyMap<string, SchrittErgebnis>,
  maengel: readonly string[],
): string {
  const zeilen: string[] = [
    `Ziel: ${ziel}`,
    'Pruefe die folgenden Ergebnisse gegen das Ziel.',
  ]
  if (maengel.length > 0) {
    zeilen.push('Diese Maengel waren zuletzt offen:')
    for (const mangel of maengel) zeilen.push(`- ${mangel}`)
  }
  zeilen.push('Ergebnisse:')
  for (const ergebnis of ergebnisse.values()) {
    zeilen.push(`- ${ergebnis.id} (${ergebnis.rolle}): ${ergebnis.ergebnis.trim()}`)
  }
  zeilen.push('Antworte NUR mit JSON: {"pass": true|false, "maengel": ["..."]}')
  return zeilen.join('\n')
}

/**
 * Liest die Antwort des Prüfers.
 *
 * @param text - die Antwort
 * @returns Urteil und Mängel
 */
function liesPruefung(text: string): { pass: boolean; maengel: string[] } {
  const roh = liesJson(text.trim())
  if (typeof roh === 'object' && roh !== null && !Array.isArray(roh)) {
    const feld = roh as Record<string, unknown>
    if (typeof feld['pass'] === 'boolean') {
      const liste = feld['maengel'] ?? feld['issues']
      return { pass: feld['pass'], maengel: liesListe(liste) }
    }
  }
  const inhalt = text.trim()
  if (/^(pass|bestanden|ok)\b/iu.test(inhalt)) return { pass: true, maengel: [] }
  return { pass: false, maengel: inhalt === '' ? [] : [inhalt] }
}

/**
 * Versucht, Text als JSON zu lesen — auch mit einem Satz davor.
 *
 * @param text - der Text
 * @returns das gelesene JSON oder `undefined`
 */
function liesJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // Zweiter Versuch: der erste JSON-Block im Text.
    const anfang = text.indexOf('{')
    const ende = text.lastIndexOf('}')
    if (anfang < 0 || ende <= anfang) return undefined
    try {
      return JSON.parse(text.slice(anfang, ende + 1))
    } catch {
      return undefined
    }
  }
}

/**
 * Liest die Schritte aus einer gelesenen JSON-Struktur.
 *
 * @param roh - die Struktur
 * @returns die Liste oder `undefined`, wenn keine darin steht
 */
function alsSchrittliste(roh: unknown): unknown[] | undefined {
  if (Array.isArray(roh)) return roh
  if (typeof roh === 'object' && roh !== null) {
    const schritte = (roh as Record<string, unknown>)['steps'] ?? (roh as Record<string, unknown>)['schritte']
    if (Array.isArray(schritte)) return schritte
  }
  return undefined
}

/**
 * Liest einen nicht-leeren Text.
 *
 * @param wert - der Wert
 * @returns der Text oder `undefined`
 */
function liesText(wert: unknown): string | undefined {
  if (typeof wert !== 'string') return undefined
  const sauber = wert.trim()
  return sauber === '' ? undefined : sauber
}

/**
 * Liest eine Liste von Zeichenketten.
 *
 * @param wert - der Wert
 * @returns die Liste (leer, wenn nichts daraus zu lesen ist)
 */
function liesListe(wert: unknown): string[] {
  if (!Array.isArray(wert)) return []
  const liste: string[] = []
  for (const eintrag of wert) {
    const text = liesText(eintrag)
    if (text !== undefined) liste.push(text)
  }
  return liste
}

/**
 * Macht eine Kennung eindeutig.
 *
 * @param roh - die gewünschte Kennung
 * @param vergeben - die schon vergebenen
 * @returns eine freie Kennung
 */
function eindeutig(roh: string, vergeben: Set<string>): string {
  if (!vergeben.has(roh)) {
    vergeben.add(roh)
    return roh
  }
  let zahl = 2
  while (vergeben.has(`${roh}-${String(zahl)}`)) zahl += 1
  const frei = `${roh}-${String(zahl)}`
  vergeben.add(frei)
  return frei
}

/** Die Rollen, die ein Plan als Schrittrolle zulässt — jede bekannte Rolle. */
export const SCHRITTROLLEN: readonly CrewRolle[] = CREW_ROLLEN
