/**
 * **Der Favoriten-Filter in der Seitenleiste — als wiederholbarer Eingriff.**
 *
 * ## Warum es diese Datei gibt
 *
 * Die Seitenleiste (`@deepseek-ai/dsh-client-ui-workspace`) bringt Anheften, Sortieren und
 * die Archivfilter mit; ein Filter „nur Favoriten" fehlt. Der Betreiber (28.10.2026):
 * *„… um es per sortieren schneller sehen kann …"* — und auf die Frage, ob das Bündel
 * angefaßt werden darf: *„sollte nicht geben weil es kein plugin ist oder andere relevant es
 * sollte intern dazu gehören"*.
 *
 * Das Bündel liegt in `node_modules` und wird von `bun install` ersetzt. Diese Datei
 * **schreibt die Änderung nach jedem Install erneut** — idempotent, mit Prüfung. Sie läuft
 * beim Start (`scripts/start.mjs`) und von Hand:
 *
 * ```powershell
 * bun scripts/client-favoriten.mjs            # anwenden (still, wenn schon da)
 * bun scripts/client-favoriten.mjs --pruefen  # nur prüfen
 * ```
 *
 * ## Warum Ersetzungen mit Ankern und keine Kopie des Bündels
 *
 * Eine Kopie des 223-KB-Bündels im Repo wäre beim nächsten Kern-Update veraltet, ohne daß es
 * auffällt. Jede Ersetzung hier **muß genau einmal** passen; paßt sie nicht mehr (der Kern hat
 * die Stelle umgebaut), bricht das Werkzeug mit der Stelle ab und ändert **nichts**. Dann ist
 * die Änderung nachzuziehen — sichtbar, nicht still.
 *
 * ## Was geändert wird
 *
 * | Stelle | Änderung |
 * |---|---|
 * | Sichtungs-Store | Feld `favoritesOnly` (Vorgabe `false`), Aktion `setFavoritesOnly` |
 * | Ableitung | bei `favoritesOnly` gilt alles Nicht-Angeheftete als verdeckt — dieselbe Mechanik wie „Archivierte ausblenden", keine zweite Filterlogik |
 * | Ansichtsmenü | ein Eintrag **„Nur Favoriten"** unter den Archivfiltern |
 * | Texte | `viewOptions.onlyFavorites` in Englisch und Chinesisch im Bündel; Deutsch im Sprachpaket (`packages/client/locale/de.json`) |
 *
 * @module scripts/client-favoriten
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ZIEL = join('node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js')

/** Ein Ersetzungsschritt: ein Anker, der genau einmal vorkommen muß. */
const SCHRITTE = [
  {
    name: 'Store: Feld favoritesOnly',
    alt: '\t\t\t\t\tarchivedFilter: "default"\n\t\t\t\t}),',
    neu: '\t\t\t\t\tarchivedFilter: "default",\n\t\t\t\t\tfavoritesOnly: false\n\t\t\t\t}),',
  },
  {
    name: 'Store: Aktion setFavoritesOnly',
    alt: '\t\t\t\t\tsetArchivedFilter: (d, filter) => {\n\t\t\t\t\t\td.archivedFilter = filter;\n\t\t\t\t\t}\n',
    neu: '\t\t\t\t\tsetArchivedFilter: (d, filter) => {\n\t\t\t\t\t\td.archivedFilter = filter;\n\t\t\t\t\t},\n\t\t\t\t\tsetFavoritesOnly: (d, an) => {\n\t\t\t\t\t\td.favoritesOnly = an;\n\t\t\t\t\t}\n',
  },
  {
    name: 'Fläche: Haken lesen',
    alt: '\t\t\tconst archivedFilter = useStore((s) => s.archivedFilter ?? "default");\n',
    neu: '\t\t\tconst archivedFilter = useStore((s) => s.archivedFilter ?? "default");\n\t\t\tconst favoritesOnly = useStore((s) => s.favoritesOnly === true);\n',
  },
  {
    name: 'Fläche: verdeckte Zeilen',
    alt: '\t\t\tconst rowState = (0, react.useMemo)(() => ({\n\t\t\t\t...orderState,\n\t\t\t\tarchivedFilter\n\t\t\t}), [orderState, archivedFilter]);',
    neu: '\t\t\tconst verdeckt = (0, react.useMemo)(() => {\n\t\t\t\tif (!favoritesOnly) return archivedSessionIds;\n\t\t\t\tconst angeheftet = new Set(pinnedSessionIds);\n\t\t\t\treturn list.ids.filter((id) => !angeheftet.has(id) || archivedSessionIds.includes(id));\n\t\t\t}, [\n\t\t\t\tarchivedSessionIds,\n\t\t\t\tfavoritesOnly,\n\t\t\t\tlist.ids,\n\t\t\t\tpinnedSessionIds\n\t\t\t]);\n\t\t\tconst rowState = (0, react.useMemo)(() => ({\n\t\t\t\tpinnedSessionIds,\n\t\t\t\tarchivedSessionIds: verdeckt,\n\t\t\t\tarchivedFilter: favoritesOnly ? "default" : archivedFilter\n\t\t\t}), [\n\t\t\t\tarchivedFilter,\n\t\t\t\tfavoritesOnly,\n\t\t\t\tpinnedSessionIds,\n\t\t\t\tverdeckt\n\t\t\t]);',
  },
  {
    name: 'Suche: verdeckte Zeilen',
    alt: '\t\t\t\t\t\t\tworkspaces,\n\t\t\t\t\t\t\tarchivedSessionIds,\n\t\t\t\t\t\t\tarchivedFilter,\n\t\t\t\t\t\t\tquery: normalizedQuery,',
    neu: '\t\t\t\t\t\t\tworkspaces,\n\t\t\t\t\t\t\tarchivedSessionIds: verdeckt,\n\t\t\t\t\t\t\tarchivedFilter: favoritesOnly ? "default" : archivedFilter,\n\t\t\t\t\t\t\tquery: normalizedQuery,',
  },
  {
    name: 'Menü: Signatur',
    alt: 'function ViewOptionsMenu({ groupBy, orderBy, archivedFilter, onGroupPick, onOrderPick, onArchivedFilterPick, t }) {',
    neu: 'function ViewOptionsMenu({ groupBy, orderBy, archivedFilter, favoritesOnly, onGroupPick, onOrderPick, onArchivedFilterPick, onFavoritesPick, t }) {',
  },
  {
    name: 'Menü: Eintrag und Auswahl',
    alt: '\t\t\t\t\t{\n\t\t\t\t\t\tid: "only-archived",\n\t\t\t\t\t\tlabel: t("viewOptions.onlyArchived"),\n\t\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveCheckOutlineRegular, {})\n\t\t\t\t\t}\n\t\t\t\t],',
    neu: '\t\t\t\t\t{\n\t\t\t\t\t\tid: "only-archived",\n\t\t\t\t\t\tlabel: t("viewOptions.onlyArchived"),\n\t\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveCheckOutlineRegular, {})\n\t\t\t\t\t},\n\t\t\t\t\t{\n\t\t\t\t\t\tid: "only-favorites",\n\t\t\t\t\t\tlabel: t("viewOptions.onlyFavorites"),\n\t\t\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPinOutlineRegular, {})\n\t\t\t\t\t}\n\t\t\t\t],',
  },
  {
    name: 'Menü: Auswahlstand',
    alt: '\t\t\t\tselectedIds: [\n\t\t\t\t\tgroupBy,\n\t\t\t\t\torderBy,\n\t\t\t\t\t{\n\t\t\t\t\t\tdefault: "hide-archived",\n\t\t\t\t\t\tshow: "show-archived",\n\t\t\t\t\t\tonly: "only-archived"\n\t\t\t\t\t}[archivedFilter]\n\t\t\t\t],',
    neu: '\t\t\t\tselectedIds: [\n\t\t\t\t\tgroupBy,\n\t\t\t\t\torderBy,\n\t\t\t\t\t{\n\t\t\t\t\t\tdefault: "hide-archived",\n\t\t\t\t\t\tshow: "show-archived",\n\t\t\t\t\t\tonly: "only-archived"\n\t\t\t\t\t}[archivedFilter],\n\t\t\t\t\t...(favoritesOnly ? ["only-favorites"] : [])\n\t\t\t\t],',
  },
  {
    name: 'Menü: Klick',
    alt: '\t\t\t\t\telse if (id === "only-archived") onArchivedFilterPick("only");',
    neu: '\t\t\t\t\telse if (id === "only-archived") onArchivedFilterPick("only");\n\t\t\t\t\telse if (id === "only-favorites") onFavoritesPick(!favoritesOnly);',
  },
  {
    name: 'Aufruf: Eigenschaften',
    alt: '\t\t\t\t\t\t\t\t\tgroupBy,\n\t\t\t\t\t\t\t\t\torderBy,\n\t\t\t\t\t\t\t\t\tarchivedFilter,',
    neu: '\t\t\t\t\t\t\t\t\tgroupBy,\n\t\t\t\t\t\t\t\t\torderBy,\n\t\t\t\t\t\t\t\t\tarchivedFilter,\n\t\t\t\t\t\t\t\t\tfavoritesOnly,',
  },
  {
    name: 'Aufruf: Rückweg',
    alt: '\t\t\t\t\t\t\t\t\tonArchivedFilterPick: actions.setArchivedFilter,',
    neu: '\t\t\t\t\t\t\t\t\tonArchivedFilterPick: actions.setArchivedFilter,\n\t\t\t\t\t\t\t\t\tonFavoritesPick: actions.setFavoritesOnly,',
  },
  {
    name: 'Animation: Filter im Schlüssel',
    alt: 'animationResetKey: `${groupBy}/${orderBy}/${archivedFilter}`',
    neu: 'animationResetKey: `${groupBy}/${orderBy}/${archivedFilter}/${favoritesOnly}`',
    mehrfach: true,
  },
  {
    name: 'Texte: Chinesisch',
    alt: '\t\t\t"viewOptions.onlyArchived": "仅显示已归档",',
    neu: '\t\t\t"viewOptions.onlyArchived": "仅显示已归档",\n\t\t\t"viewOptions.onlyFavorites": "仅显示收藏",',
  },
  {
    name: 'Texte: Englisch',
    alt: '\t\t\t"viewOptions.onlyArchived": "Archived only",',
    neu: '\t\t\t"viewOptions.onlyArchived": "Archived only",\n\t\t\t"viewOptions.onlyFavorites": "Favorites only",',
  },
]

/** Die Marke, an der ein bereits angewendetes Bündel erkennbar ist. */
const MARKE = 'only-favorites'

/**
 * Wendet den Filter an — oder sagt, warum nicht.
 *
 * **Kein `process.exit` hier:** der Start (`scripts/start.mjs`) ruft diese
 * Funktion bei jedem Hochfahren; ein Abbruch des Startvorgangs wegen einer
 * Geschmacksfrage wäre der falsche Preis. Sie meldet den Zustand zurück, und
 * der Aufrufer entscheidet, was er damit tut.
 *
 * @param {{ trocken?: boolean }} [optionen] - `trocken` ändert nichts.
 * @returns {{ status: 'schon-da' | 'angewendet' | 'nicht-da' | 'passt-nicht' | 'fehlt', meldung: string, fehlend?: string[] }}
 */
export function wendeFavoritenFilterAn(optionen = {}) {
  let text
  try {
    text = readFileSync(ZIEL, 'utf8')
  } catch (fehler) {
    return {
      status: 'fehlt',
      meldung: `${ZIEL} ist nicht lesbar — ist das Paket installiert? (${fehler instanceof Error ? fehler.message : String(fehler)})`,
    }
  }

  if (text.includes(MARKE)) return { status: 'schon-da', meldung: 'schon angewendet' }

  // Erst prüfen, dann schreiben: kein halb angewendetes Bündel.
  const fehlend = []
  for (const schritt of SCHRITTE) {
    const zahl = text.split(schritt.alt).length - 1
    const erwartet = schritt.mehrfach === true ? 2 : 1
    if (zahl !== erwartet) fehlend.push(`${schritt.name}: Anker ${String(zahl)}× gefunden, erwartet ${String(erwartet)}`)
  }
  if (fehlend.length > 0) {
    return {
      status: 'passt-nicht',
      meldung: 'Der Filter paßt nicht mehr auf dieses Bündel — nichts geändert.',
      fehlend,
    }
  }

  if (optionen.trocken === true) {
    return { status: 'nicht-da', meldung: 'noch nicht angewendet (Trockenlauf, nichts geändert)' }
  }

  let geaendert = text
  for (const schritt of SCHRITTE) {
    // Die Anzahl ist oben geprüft; `split/join` ersetzt jede Fundstelle genau einmal.
    geaendert = geaendert.split(schritt.alt).join(schritt.neu)
  }

  writeFileSync(ZIEL, geaendert, 'utf8')
  return { status: 'angewendet', meldung: `${ZIEL} (${String(Buffer.byteLength(geaendert))} B)` }
}

// Direkt aufgerufen (nicht importiert): Bericht auf der Konsole, Rückgabewert als Exit-Code.
if (import.meta.main) {
  const ergebnis = wendeFavoritenFilterAn({ trocken: process.argv.includes('--pruefen') })
  if (ergebnis.status === 'fehlt' || ergebnis.status === 'passt-nicht') {
    console.error(ergebnis.meldung)
    for (const zeile of ergebnis.fehlend ?? []) console.error(`  ${zeile}`)
    process.exit(1)
  }
  if (process.argv.includes('--pruefen') && ergebnis.status !== 'schon-da') {
    console.error(ergebnis.meldung)
    process.exit(1)
  }
  console.log(`Favoriten-Filter: ${ergebnis.meldung}`)
}
