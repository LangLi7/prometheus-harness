/**
 * Der Quellordner-Dialog — **reine Komponente**, ohne Host und ohne Netz.
 *
 * ## Was er zeigt, und woher die Form kommt
 *
 * Das Vorbild ist der Dialog *„Projekt bearbeiten / Quellordner"* aus dem Codex-Harness: ein Name,
 * eine Liste von Ordnern mit dem **Arbeitsplatz** als erstem Eintrag, ein Knopf zum Hinzufügen. Die
 * Form ist übernommen, die Umsetzung ist unsere.
 *
 * ## Warum diese Datei KEINEN Host kennt
 *
 * Weil sie sonst nicht prüfbar wäre: auf diesem Rechner ist **kein Browser** installiert
 * (gemessen, `chrome-devtools`: *„Could not find Google Chrome executable"*). Eine Komponente, die
 * den Host braucht, ließe sich hier **nicht ansehen**.
 *
 * Diese Komponente ist deshalb **rein**: sie bekommt Daten und Rückrufe als Eigenschaften und gibt
 * Markup zurück. Damit läßt sie sich mit `react-dom/server` zu HTML rendern und **Zeichen für
 * Zeichen prüfen** — was hier der einzige mögliche Nachweis ist.
 *
 * ## Die Regeln, die in der Form stecken
 *
 * | Regel | Wo sie steht |
 * |---|---|
 * | Der Arbeitsplatz ist **primär** und läßt sich **weder entfernen noch auf Lesen stellen** | {@link Ordner.istPrimaer} steuert beide Knöpfe |
 * | Ein Zusatzordner kann **lesen oder schreiben** | {@link Ordner.zugriff} |
 * | Der **Pfad** steht immer da — auch bei einem Namen | sonst weiß niemand, welcher Ordner gemeint ist |
 *
 * Die ersten beiden Regeln stehen **auch im Schema und in den Wegen** (Migration 0009/0010, zwölf
 * Prüfungen). Daß sie hier noch einmal in der Form stehen, ist Absicht: die Datenbank wehrt ab, die
 * Oberfläche **erklärt**.
 *
 * @module @prometheus-harness/client-source-folders
 */

/** Ein Quellordner, wie ihn der Weg `/api/pmh/ordner` liefert. */
export interface Ordner {
  /** Die Kennung in der Datenbank. */
  readonly id: string
  /** Der absolute Pfad — **immer** sichtbar. */
  readonly pfad: string
  /** Ob es der Arbeitsplatz ist. Genau einer je Arbeitsbereich. */
  readonly istPrimaer: boolean
  /** Was in diesem Ordner erlaubt ist. Der Arbeitsplatz ist immer `schreiben`. */
  readonly zugriff: 'lesen' | 'schreiben'
  /** Ein Name für Menschen; darf fehlen. */
  readonly bezeichnung?: string
}

/** Was der Dialog braucht. */
export interface DialogEigenschaften {
  /** Der Name des Arbeitsbereichs. */
  readonly name: string
  /** Die Ordner; der primäre steht immer zuerst. */
  readonly ordner: readonly Ordner[]
  /** Wird beim Ändern des Namens gerufen. */
  readonly beiName?: (name: string) => void
  /** Wird beim Hinzufügen gerufen — der Host öffnet danach seinen Verzeichniswähler. */
  readonly beiHinzufuegen?: () => void
  /** Wird beim Entfernen eines Zusatzordners gerufen. */
  readonly beiEntfernen?: (id: string) => void
  /** Wird beim Umschalten des Zugriffs gerufen. */
  readonly beiZugriff?: (id: string, zugriff: 'lesen' | 'schreiben') => void
  /** Wird beim Schließen gerufen. */
  readonly beiSchliessen?: () => void
  /** Ein laufender Vorgang — die Knöpfe sind dann gesperrt. */
  readonly beschaeftigt?: boolean
  /** Was schiefging, in Worten. */
  readonly fehler?: string
}

/** Die Beschriftungen — an einer Stelle, damit die Sprache später austauschbar bleibt. */
export const TEXTE = {
  titel: 'Quellordner',
  name: 'Name',
  quellordner: 'Quellordner',
  primaer: 'Primär',
  hinzufuegen: 'Ordner hinzufügen',
  entfernen: 'Entfernen',
  schliessen: 'Schließen',
  lesen: 'Nur lesen',
  schreiben: 'Lesen und schreiben',
  arbeitsplatzHinweis: 'Der Arbeitsplatz läßt sich weder entfernen noch auf „nur lesen" stellen.',
} as const

/**
 * Ein einzelner Ordner als Zeile.
 *
 * @param eigenschaften - der Ordner und die Rückrufe
 * @returns die Zeile
 */
function Ordnerzeile({
  ordner,
  beiEntfernen,
  beiZugriff,
  beschaeftigt,
}: {
  readonly ordner: Ordner
  readonly beiEntfernen?: ((id: string) => void) | undefined
  readonly beiZugriff?: ((id: string, zugriff: 'lesen' | 'schreiben') => void) | undefined
  readonly beschaeftigt: boolean
}): React.ReactElement {
  return (
    <li className="pmh-ordner-zeile" data-primaer={ordner.istPrimaer ? 'ja' : 'nein'}>
      <span className="pmh-ordner-pfad" title={ordner.pfad}>
        {ordner.pfad}
      </span>
      {ordner.bezeichnung === undefined ? null : (
        <span className="pmh-ordner-bezeichnung">{ordner.bezeichnung}</span>
      )}
      {ordner.istPrimaer ? (
        // **Nur eine Kennzeichnung, kein Schalter.** Der Arbeitsplatz ist primär; ihn umzustellen
        // wäre ein anderer Vorgang (der primäre Ordner wechselt), nicht dieser Knopf.
        <span className="pmh-ordner-primaer" aria-label={TEXTE.primaer}>
          {TEXTE.primaer}
        </span>
      ) : (
        <span className="pmh-ordner-zugriff">
          {ordner.zugriff === 'schreiben' ? TEXTE.schreiben : TEXTE.lesen}
        </span>
      )}
      {ordner.istPrimaer ? null : (
        <>
          <button
            type="button"
            className="pmh-ordner-zugriff-schalten"
            disabled={beschaeftigt}
            onClick={() => {
              beiZugriff?.(ordner.id, ordner.zugriff === 'schreiben' ? 'lesen' : 'schreiben')
            }}
          >
            {ordner.zugriff === 'schreiben' ? TEXTE.lesen : TEXTE.schreiben}
          </button>
          <button
            type="button"
            className="pmh-ordner-entfernen"
            aria-label={`${TEXTE.entfernen}: ${ordner.pfad}`}
            disabled={beschaeftigt}
            onClick={() => {
              beiEntfernen?.(ordner.id)
            }}
          >
            ×
          </button>
        </>
      )}
    </li>
  )
}

/**
 * Der Dialog.
 *
 * @param eigenschaften - Name, Ordner und die Rückrufe
 * @returns das Markup
 */
export function QuellordnerDialog(eigenschaften: DialogEigenschaften): React.ReactElement {
  const beschaeftigt = eigenschaften.beschaeftigt === true
  // Der primäre Ordner steht vorn — **in der Form erzwungen**, damit die Reihenfolge nicht von
  // der Antwort des Weges abhängt.
  const sortiert = [...eigenschaften.ordner].sort((a, b) => Number(b.istPrimaer) - Number(a.istPrimaer))

  return (
    <div className="pmh-quellordner" role="dialog" aria-label={TEXTE.titel}>
      <div className="pmh-quellordner-kopf">
        <h2 className="pmh-quellordner-titel">{TEXTE.titel}</h2>
        <button
          type="button"
          className="pmh-quellordner-schliessen"
          aria-label={TEXTE.schliessen}
          disabled={beschaeftigt}
          onClick={() => {
            eigenschaften.beiSchliessen?.()
          }}
        >
          ×
        </button>
      </div>

      {eigenschaften.fehler === undefined ? null : (
        <p className="pmh-quellordner-fehler" role="alert">
          {eigenschaften.fehler}
        </p>
      )}

      <label className="pmh-quellordner-name">
        <span>{TEXTE.name}</span>
        <input
          type="text"
          value={eigenschaften.name}
          disabled={beschaeftigt}
          onChange={(e) => {
            eigenschaften.beiName?.(e.target.value)
          }}
        />
      </label>

      <div className="pmh-quellordner-liste">
        <h3>{TEXTE.quellordner}</h3>
        <ul>
          {sortiert.map((ordner) => (
            <Ordnerzeile
              key={ordner.id}
              ordner={ordner}
              beiEntfernen={eigenschaften.beiEntfernen}
              beiZugriff={eigenschaften.beiZugriff}
              beschaeftigt={beschaeftigt}
            />
          ))}
        </ul>
        <p className="pmh-quellordner-hinweis">{TEXTE.arbeitsplatzHinweis}</p>
        <button
          type="button"
          className="pmh-quellordner-hinzufuegen"
          disabled={beschaeftigt}
          onClick={() => {
            eigenschaften.beiHinzufuegen?.()
          }}
        >
          {TEXTE.hinzufuegen}
        </button>
      </div>
    </div>
  )
}
