/**
 * Der Eval, der die Frage beantwortet: **Bringt der Rat mehr als Sampling?**
 *
 * ## Warum das die erste Priorität ist
 *
 * Acht Personas, ein Richter, drei Runden — das kostet pro Lauf ein Vielfaches eines einzelnen
 * Aufrufs. Ob es das wert ist, ist keine Geschmacksfrage: Es ist messbar. Ohne Messung ist jede
 * weitere Persona eine Annahme mit Rechnung.
 *
 * ## Die vier Arme
 *
 * | Arm | Aufbau | Zweck |
 * |---|---|---|
 * | A | ein starkes Modell, ein Aufruf | Referenzqualität |
 * | B | ein billiges Modell, ein Aufruf | Kostenreferenz |
 * | C | Rat: billige Macher + Prüfer + starker Richter | die These |
 * | D | fünf billige Samples + Mehrheitsentscheid | die unbequeme Baseline |
 *
 * ## Das Abbruchkriterium — vorher festgelegt
 *
 * C gilt nur dann als gerechtfertigt, wenn es D bei **gleichen Kosten** um mindestens den doppelten
 * Standardfehler schlägt. Sonst ist der Rat für diese Kategorie nicht belegt, und D ist die
 * bessere Wahl. Die Regel steht hier im Code, damit sie nach dem Lauf nicht weichgeklopft wird.
 *
 * ## Was dieses Modul **nicht** kann
 *
 * Es ruft kein Modell und bewertet keine Antwort selbst. `beantworte` und `bewerte` kommen von
 * außen — der Eval rechnet nur. Und: 24 Aufgaben sind eine Indikation, kein Beweis.
 *
 * @module @prometheus-harness/crew-provider/eval
 */

/** Die Kategorien der Aufgaben. */
export const EVAL_KATEGORIEN = ['code', 'fakten', 'planung', 'analyse'] as const

/** Eine Kategorie. */
export type EvalKategorie = (typeof EVAL_KATEGORIEN)[number]

/** Eine Aufgabe des Evals. */
export interface EvalAufgabe {
  /** Stabile Kennung. */
  id: string
  /** Die Kategorie. */
  kategorie: EvalKategorie
  /** Der Auftrag an das Modell. */
  auftrag: string
  /** Woran die Antwort gemessen wird. */
  rubric: string
}

/** Das Ergebnis einer Aufgabe in einem Arm. */
export interface AufgabenErgebnis {
  /** Die Kennung der Aufgabe. */
  id: string
  /** Ob die Antwort den Rubric erfüllt. */
  pass: boolean
  /** Warum. */
  begruendung: string
  /** Die geschätzten Kosten in US-Dollar. */
  usd: number
}

/** Das Ergebnis eines Arms über alle Aufgaben. */
export interface ArmErgebnis {
  /** Der Name des Arms (`A`, `B`, `C`, `D`). */
  arm: string
  /** Die Ergebnisse je Aufgabe. */
  aufgaben: AufgabenErgebnis[]
  /** Der Anteil bestandener Aufgaben. */
  passRate: number
  /** Die geschätzten Gesamtkosten. */
  usd: number
  /** Die Wanduhrzeit. */
  dauerMs: number
}

/** Wie ein Arm eine Aufgabe beantwortet. */
export type Beantworte = (aufgabe: EvalAufgabe) => Promise<{ antwort: string; usd: number }>

/** Wie eine Antwort gegen den Rubric bewertet wird. */
export type Bewerte = (aufgabe: EvalAufgabe, antwort: string) => Promise<{ pass: boolean; begruendung: string }>

/**
 * Die 24 Aufgaben: sechs je Kategorie.
 *
 * **Warum gemischt und nicht nur Code.** Ein Rat, der bei Code hilft und bei Planung schadet, ist
 * kein Fortschritt — er verschiebt das Problem. Die Kategorien trennen das.
 */
export const EVAL_AUFGABEN: readonly EvalAufgabe[] = [
  // ── Code ──────────────────────────────────────────────────────────────────
  { id: 'c1', kategorie: 'code', auftrag: 'Schreibe eine Funktion, die Duplikate aus einem Array entfernt und die Reihenfolge des ersten Vorkommens erhält.', rubric: 'Erhält die Reihenfolge; funktioniert für Zahlen und Strings; keine quadratische Laufzeit ohne Hinweis.' },
  { id: 'c2', kategorie: 'code', auftrag: 'Finde den Fehler: `for (let i = 0; i <= liste.length; i++) { summe += liste[i] }`', rubric: 'Benennt `<=` als Ursache; nennt `undefined`/NaN als Folge; schlägt `<` vor.' },
  { id: 'c3', kategorie: 'code', auftrag: 'Eine Schleife lädt für jede Bestellung den Kunden einzeln. Wie vermeidest du das?', rubric: 'Benennt N+1; schlägt eine Sammelabfrage (IN/Join) vor; nennt den Unterschied in der Anzahl der Abfragen.' },
  { id: 'c4', kategorie: 'code', auftrag: 'Was muss eine Funktion prüfen, die eine JSON-Datei einliest und ein Objekt zurückgibt?', rubric: 'Leere/fehlende Datei; ungültiges JSON; JSON, das kein Objekt ist; Fehler weiterreichen statt schlucken.' },
  { id: 'c5', kategorie: 'code', auftrag: 'Vereinfache: `if (a) { if (b) { tue() } }` — und sage, wann die Vereinfachung falsch ist.', rubric: 'Schlägt `if (a && b)` vor; nennt den Fall, in dem die Verschachtelung Absicht ist (Nebenwirkungen/Reihenfolge).' },
  { id: 'c6', kategorie: 'code', auftrag: 'Schreibe einen Test für eine Funktion, die einen Rabatt berechnet, und nenne die wichtigste Grenze.', rubric: 'Testet 0 %, 100 % und einen Wert dazwischen; benennt negative Beträge oder Rundung als Grenze.' },

  // ── Fakten ────────────────────────────────────────────────────────────────
  { id: 'f1', kategorie: 'fakten', auftrag: 'Was ist der Unterschied zwischen `let` und `const` in JavaScript?', rubric: '`const` verhindert Neuzuweisung, nicht Mutation; `let` erlaubt beides; Blockgültigkeit bei beiden.' },
  { id: 'f2', kategorie: 'fakten', auftrag: 'Was bedeutet Idempotenz bei einer HTTP-Methode?', rubric: 'Mehrfache Ausführung hat dieselbe Wirkung wie einmal; nennt PUT/DELETE als idempotent, POST als nicht.' },
  { id: 'f3', kategorie: 'fakten', auftrag: 'Was besagt das CAP-Theorem in einem Satz — und was ist die häufigste Fehlinterpretation?', rubric: 'Bei Netzpartition muss zwischen Konsistenz und Verfügbarkeit gewählt werden; Fehlinterpretation: „zwei von drei wählen" ohne Partition.' },
  { id: 'f4', kategorie: 'fakten', auftrag: 'Was ist der Unterschied zwischen einem Prozess und einem Thread?', rubric: 'Prozess hat eigenen Speicher; Threads teilen den Speicher eines Prozesses; Konsequenz für Isolation und Fehler.' },
  { id: 'f5', kategorie: 'fakten', auftrag: 'Was macht `git rebase` — und wann ist es gefährlich?', rubric: 'Setzt Commits auf eine neue Basis (neue Hashes); gefährlich bei bereits geteilten Branches.' },
  { id: 'f6', kategorie: 'fakten', auftrag: 'Wozu dient ein Datenbankindex — und was kostet er?', rubric: 'Beschleunigt Suche/Sortierung; kostet Schreibzeit und Speicher; hilft nicht bei führendem Wildcard.' },

  // ── Planung ───────────────────────────────────────────────────────────────
  { id: 'p1', kategorie: 'planung', auftrag: 'Plane die Migration einer Tabelle mit 50 Millionen Zeilen ohne Ausfall.', rubric: 'Schritte mit Rückweg; Online-Migration (Shadow-Tabelle/Trigger); Prüfpunkt vor dem Umschalten; Rollback benannt.' },
  { id: 'p2', kategorie: 'planung', auftrag: 'Entwirf eine Backup-Strategie für eine kleine Firma mit einer Datenbank und Dateien.', rubric: '3-2-1 oder gleichwertig; Wiederherstellung getestet; Aufbewahrung; Verschlüsselung; Verantwortlicher.' },
  { id: 'p3', kategorie: 'planung', auftrag: 'Ein Dienst ist seit zehn Minuten nicht erreichbar. Was tust du in den ersten fünf Minuten?', rubric: 'Erst Eindämmen/Status; dann Ursache; Kommunikation; keine blinden Neustarts ohne Beleg.' },
  { id: 'p4', kategorie: 'planung', auftrag: 'Plane die Teststrategie für ein Feature, das Geld überweist.', rubric: 'Grenzfälle und Doppelbuchung; Idempotenz; Testdaten; manuelle Abnahme; was NICHT automatisiert wird.' },
  { id: 'p5', kategorie: 'planung', auftrag: 'Schätze die monatlichen Kosten eines Dienstes mit 10 000 Anfragen pro Tag und einem Modellaufruf je Anfrage.', rubric: 'Rechnet mit Tarif je 1 000 Token; nennt Unsicherheit; nennt den größten Kostentreiber; nennt eine billigere Variante.' },
  { id: 'p6', kategorie: 'planung', auftrag: 'Ein Deploy ist fehlgeschlagen. Beschreibe den Rückweg.', rubric: 'Vorherigen Stand wiederherstellen; Datenmigration rückgängig oder vorwärts; Kommunikation; Ursache erst danach.' },

  // ── Analyse ───────────────────────────────────────────────────────────────
  { id: 'a1', kategorie: 'analyse', auftrag: 'Wann sind Microservices die falsche Wahl?', rubric: 'Kleines Team; unklare Domäne; hohe Betriebskosten; Netzwerkfehler als neue Fehlerquelle; nennt eine Alternative.' },
  { id: 'a2', kategorie: 'analyse', auftrag: 'Warum ist ein Log voller Warnungen ein Risiko?', rubric: 'Alarmmüdigkeit; echte Fehler gehen unter; keine Priorisierung; nennt eine Gegenmaßnahme.' },
  { id: 'a3', kategorie: 'analyse', auftrag: 'Wann ist Caching schädlich?', rubric: 'Veraltete Daten; Invalidierung komplexer als der Gewinn; personenbezogene Daten; nennt ein Beispiel.' },
  { id: 'a4', kategorie: 'analyse', auftrag: 'Wann ist eine Queue die falsche Wahl?', rubric: 'Sofortige Antwort nötig; Reihenfolge/Genauigkeit; Betriebsaufwand; nennt eine Alternative.' },
  { id: 'a5', kategorie: 'analyse', auftrag: 'Wann sollte man *nicht* refaktorieren?', rubric: 'Kein Test als Netz; kurz vor dem Release; unklarer Nutzen; nennt die Bedingung, unter der es doch sinnvoll ist.' },
  { id: 'a6', kategorie: 'analyse', auftrag: 'Woran erkennt man eine unzuverlässige Metrik?', rubric: 'Keine Definition; schwankt ohne Änderung; wird nur bei Erfolg gemeldet; nennt eine Gegenprobe.' },
]

/**
 * Führt einen Arm über die Aufgaben.
 *
 * @param arm - der Name des Arms
 * @param aufgaben - die Aufgaben
 * @param beantworte - wie eine Aufgabe beantwortet wird
 * @param bewerte - wie eine Antwort bewertet wird
 * @returns das Ergebnis des Arms
 */
export async function fuehreEval(
  arm: string,
  aufgaben: readonly EvalAufgabe[],
  beantworte: Beantworte,
  bewerte: Bewerte,
): Promise<ArmErgebnis> {
  const start = Date.now()
  const ergebnisse: AufgabenErgebnis[] = []
  let usd = 0
  for (const aufgabe of aufgaben) {
    const { antwort, usd: kosten } = await beantworte(aufgabe)
    const urteil = await bewerte(aufgabe, antwort)
    usd += kosten
    ergebnisse.push({ id: aufgabe.id, pass: urteil.pass, begruendung: urteil.begruendung, usd: kosten })
  }
  return {
    arm,
    aufgaben: ergebnisse,
    passRate: ergebnisse.length === 0 ? 0 : ergebnisse.filter((eintrag) => eintrag.pass).length / ergebnisse.length,
    usd,
    dauerMs: Date.now() - start,
  }
}

/**
 * Die häufigste Antwort — für Arm D (Sampling + Mehrheitsentscheid).
 *
 * **Warum normalisiert verglichen wird.** Drei Antworten, die sich nur in Leerzeichen oder
 * Groß-/Kleinschreibung unterscheiden, sind dieselbe Antwort. Ein exakter Vergleich würde die
 * Mehrheit künstlich zersplittern.
 *
 * @param antworten - die Antworten
 * @returns die häufigste; bei Gleichstand die erste
 */
export function mehrheit(antworten: readonly string[]): string {
  const zaehler = new Map<string, { anzahl: number; original: string }>()
  for (const antwort of antworten) {
    const schluessel = antwort.trim().toLowerCase().replace(/\s+/gu, ' ')
    const eintrag = zaehler.get(schluessel)
    if (eintrag === undefined) {
      zaehler.set(schluessel, { anzahl: 1, original: antwort })
    } else {
      eintrag.anzahl += 1
    }
  }
  let beste: { anzahl: number; original: string } | undefined
  for (const eintrag of zaehler.values()) {
    if (beste === undefined || eintrag.anzahl > beste.anzahl) beste = eintrag
  }
  return beste?.original ?? ''
}

/** Das Urteil über das Abbruchkriterium. */
export interface Kriterium {
  /** Ob C gerechtfertigt ist. */
  gerechtfertigt: boolean
  /** Die Begründung mit den Zahlen. */
  begruendung: string
}

/**
 * Prüft das **vorher festgelegte** Abbruchkriterium.
 *
 * **Die Regel.** C gilt nur dann als gerechtfertigt, wenn es D bei gleichen Kosten um mindestens
 * den doppelten Standardfehler schlägt. „Gleiche Kosten" heißt hier: höchstens 10 % teurer — eine
 * Toleranz, die vor dem Lauf feststeht und nicht nachträglich angepasst wird.
 *
 * @param c - das Ergebnis des Rats
 * @param d - das Ergebnis der Sampling-Baseline
 * @param toleranz - erlaubte Kostenüberschreitung (Vorgabe 0,1 = 10 %)
 * @returns das Urteil
 */
export function pruefeKriterium(c: ArmErgebnis, d: ArmErgebnis, toleranz = 0.1): Kriterium {
  const n = c.aufgaben.length
  if (n === 0) return { gerechtfertigt: false, begruendung: 'keine Aufgaben' }
  const differenz = c.passRate - d.passRate
  const standardfehler = Math.sqrt(
    (c.passRate * (1 - c.passRate)) / n + (d.passRate * (1 - d.passRate)) / n,
  )
  const schwelle = 2 * standardfehler
  const kostenGleich = c.usd <= d.usd * (1 + toleranz)
  if (!kostenGleich) {
    return {
      gerechtfertigt: false,
      begruendung: `C kostet ${c.usd.toFixed(4)} USD, D ${d.usd.toFixed(4)} USD — nicht gleiche Kosten.`,
    }
  }
  if (differenz >= schwelle && differenz > 0) {
    return {
      gerechtfertigt: true,
      begruendung: `C schlägt D um ${(differenz * 100).toFixed(1)} Punkte (Schwelle ${(schwelle * 100).toFixed(1)}).`,
    }
  }
  return {
    gerechtfertigt: false,
    begruendung: `C schlägt D nur um ${(differenz * 100).toFixed(1)} Punkte (Schwelle ${(schwelle * 100).toFixed(1)}) — nicht belegt.`,
  }
}

/** Eine Zeile der Vergleichstabelle. */
export interface Vergleichszeile {
  /** Der Arm. */
  arm: string
  /** Pass-Rate in Prozent. */
  passRate: number
  /** Kosten in US-Dollar. */
  usd: number
  /** Durchschnittliche Dauer je Aufgabe in Millisekunden. */
  msJeAufgabe: number
}

/**
 * Macht aus den Armen eine Vergleichstabelle.
 *
 * @param ergebnisse - die Arme
 * @returns die Zeilen in Armreihenfolge
 */
export function vergleiche(ergebnisse: readonly ArmErgebnis[]): Vergleichszeile[] {
  return ergebnisse.map((arm) => ({
    arm: arm.arm,
    passRate: arm.passRate,
    usd: arm.usd,
    msJeAufgabe: arm.aufgaben.length === 0 ? 0 : arm.dauerMs / arm.aufgaben.length,
  }))
}
