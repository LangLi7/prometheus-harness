/**
 * Der **KI-Stapel** — was von der KI-Seite im Repo liegt, in welcher Form, und wofür.
 *
 * ## Warum diese Tabelle im Code steht und nicht erzeugt wird
 *
 * Ein Verzeichnis, das die Ordner selbst durchläuft, wäre „automatisch richtig" — aber es wüßte
 * nicht, **wofür** ein Paket da ist, und es würde einen vergessenen Ordner genauso führen wie ein
 * fertiges Paket. Hier steht deshalb eine **gepflegte** Liste mit Zweck, ergänzt durch Prüfungen,
 * die gegen die Wirklichkeit halten:
 *
 * | Prüfung | Was sie verhindert |
 * |---|---|
 * | jeder `pfad` existiert auf der Platte | ein Eintrag auf einen umbenannten Ordner |
 * | jede Form stimmt mit `scripts/profile-patch.mjs` | ein Paket, das als Plugin geführt wird und keines ist — und umgekehrt |
 * | jedes Bündel deklariert `dsh.bundle.patch` | ein „Bündel", das keines ist |
 *
 * ## Die drei Formen, und was sie unterscheiden
 *
 * | Form | Bedeutung | Woran man es erkennt |
 * |---|---|---|
 * | `plugin` | wird vom Host **geladen** | es steht in `EIGENE_PAKETE` |
 * | `bibliothek` | wird **importiert**, nicht geladen | es steht **nicht** dort und hat kein `apply` |
 * | `buendel` | **trägt andere ein** | `package.json` hat `dsh.bundle.patch` |
 *
 * **Warum die Unterscheidung nicht kosmetisch ist.** Ein Plugin kann man abschalten und in einer
 * Liste sehen; eine Bibliothek nicht — sie ist nur da, wenn jemand sie importiert. Wer beides als
 * „installiert" zusammenwirft, sucht eine Bibliothek in der Plugin-Liste und findet sie nie.
 *
 * @module @prometheus-harness/ai-ranking/stapel
 */

/** In welcher Form ein Teil des Stapels wirkt. */
export type Form =
  /** Der Host lädt es; es erscheint in der Entry-Prüfung. */
  | 'plugin'
  /** Es wird importiert. Kein Lebenszyklus, keine Abschaltbarkeit. */
  | 'bibliothek'
  /** Es trägt andere Einträge in den Host. */
  | 'buendel'

/** Ein Teil des KI-Stapels. */
export interface Stapeleintrag {
  /** Der Paketname. */
  readonly paket: string
  /** Der Ordner, relativ zur Projektwurzel. */
  readonly pfad: string
  /** In welcher Form es wirkt. */
  readonly form: Form
  /** Wofür es da ist — ein Satz. */
  readonly zweck: string
  /** Der Endpunkt, wenn es einen gibt. */
  readonly route?: string
}

/**
 * Die Teile des Stapels, **in der Reihenfolge ihres Zusammenwirkens**.
 *
 * Erst der Vertrag, dann die Umsetzungen, dann die Auskunft. Wer die Liste liest, soll den Aufbau
 * sehen und nicht ein Alphabet.
 */
export const KI_STAPEL: readonly Stapeleintrag[] = [
  // --- Der Vertrag und seine Registratur -------------------------------------
  {
    paket: '@prometheus-harness/capabilities',
    pfad: 'packages/ai/capabilities',
    form: 'bibliothek',
    zweck: 'Der Vertrag: sechs Fähigkeiten, Anbieter, Registratur, Eskalation handeln/rückfrage/mensch.',
  },
  {
    paket: '@prometheus-harness/settings',
    pfad: 'packages/ai/settings',
    form: 'bibliothek',
    zweck: 'Die Wahl des Endnutzers: welche Fähigkeit von welchem Anbieter mit welchem Modell.',
  },
  {
    paket: '@prometheus-harness/composition',
    pfad: 'packages/ai/composition',
    form: 'bibliothek',
    zweck: 'Fügt Einstellungen, Anbieter und den Menschen zusammen; meldet Verzeichnis und Saat an.',
  },
  {
    paket: '@prometheus-harness/guard',
    pfad: 'packages/ai/guard',
    form: 'bibliothek',
    zweck: 'Prüft vor der Tat und entschärft Geheimnisse in Texten.',
  },
  // --- Die Umsetzungen -------------------------------------------------------
  {
    paket: '@prometheus-harness/provider-directory',
    pfad: 'packages/ai/provider-directory',
    form: 'bibliothek',
    zweck: 'Sieben API-Familien mit ihren Wegen je Fähigkeit; dazu die Sonde, die kostenlos prüft.',
  },
  {
    paket: '@prometheus-harness/openrouter',
    pfad: 'packages/ai/openrouter',
    form: 'bibliothek',
    zweck: 'Die Umsetzung: Urteil, Text zu Sprache, Sprache zu Text, Einbetten. Bild absichtlich nicht.',
  },
  {
    paket: '@prometheus-harness/directory-curator',
    pfad: 'packages/ai/directory-curator',
    form: 'bibliothek',
    zweck: 'Der Katalog mit Meßdatum, der Verwalter und der Ausleger für fremde Antworten.',
  },
  {
    paket: '@prometheus-harness/local',
    pfad: 'packages/ai/local',
    form: 'bibliothek',
    zweck: 'Lokale Gewichte: holen, prüfen, ablegen. Ohne Prüfsumme gilt nichts als heil.',
  },
  // --- Die Rangliste ---------------------------------------------------------
  {
    paket: '@prometheus-harness/tariffs',
    pfad: 'packages/ai/tariffs',
    form: 'bibliothek',
    zweck: 'Preise je Familie und Modell, vier Kostenarten, Saat und Verschmelzung.',
  },
  {
    paket: '@prometheus-harness/ranking',
    pfad: 'packages/ai/ranking',
    form: 'bibliothek',
    zweck: 'Die Rangfolge je Fähigkeit: Verdrahtung, Befund, Preis — mit Begründung.',
  },
  {
    paket: '@prometheus-harness/router',
    pfad: 'packages/ai/router',
    form: 'bibliothek',
    zweck: 'Die Auswahl: erst die ausdrückliche Wahl, dann die Rangfolge — sonst ein Wurf mit Gründen.',
  },
  // --- Die Schnittstelle -----------------------------------------------------
  {
    paket: '@prometheus-harness/ai-ranking',
    pfad: 'packages/api/ai-ranking',
    form: 'plugin',
    zweck: 'Dienst ctx.aiRanking, meldet Verzeichnis und Saat beim Start an.',
    route: '/api/ai/ranking, /api/ai/stack',
  },
  {
    paket: '@prometheus-harness/ai-stack',
    pfad: 'packages/bundle/ai-stack',
    form: 'buendel',
    zweck: 'Trägt die KI-Rangliste als Eintrag in den Host — mit Marker, Zeichen und Beschreibung.',
  },
  // --- Die lokale Sprache ----------------------------------------------------
  {
    paket: '@prometheus-harness/speech-local-base',
    pfad: 'packages/api/speech-local-base',
    form: 'bibliothek',
    zweck: 'Gemeinsame Basis der lokalen Spracherkenner.',
  },
  {
    paket: '@prometheus-harness/speech-whisper-local',
    pfad: 'packages/api/speech-whisper-local',
    form: 'plugin',
    zweck: 'Lokaler Erkenner, Deutsch und Englisch, erkennt die Sprache selbst.',
  },
  {
    paket: '@prometheus-harness/speech-nemo-de-local',
    pfad: 'packages/api/speech-nemo-de-local',
    form: 'plugin',
    zweck: 'Lokaler Erkenner, nur Deutsch, genauer bei Fachbegriffen.',
  },
]

/**
 * Zählt die Formen — für eine Anzeige, die eine Zahl braucht.
 *
 * @returns je Form die Anzahl
 */
export function zaehleFormen(): Readonly<Record<Form, number>> {
  const zahlen: Record<Form, number> = { plugin: 0, bibliothek: 0, buendel: 0 }
  for (const eintrag of KI_STAPEL) zahlen[eintrag.form] += 1
  return zahlen
}

/**
 * Die Pakete des Stapels, die der Host **lädt**.
 *
 * **Warum das eine eigene Auskunft ist.** Genau diese Liste muß mit
 * `scripts/profile-patch.mjs` übereinstimmen — eine Prüfung hält es fest. Wer ein Paket als
 * `plugin` führt, das dort nicht steht, behauptet eine Ladung, die nicht stattfindet.
 *
 * @returns die Paketnamen der Plugins, in Stapel-Reihenfolge
 */
export function pluginPakete(): readonly string[] {
  return KI_STAPEL.filter((eintrag) => eintrag.form === 'plugin').map((eintrag) => eintrag.paket)
}
