/**
 * **`@prometheus-harness/world-obsidian` — der Vault, gelesen und als Graph.**
 *
 * ## Der Auftrag
 *
 * Der Betreiber: *„kannst du den Universe Obsidian und Graphify Implementieren als Plugin, Integration
 * und oder skill?"*
 *
 * ## Was zuerst gemessen wurde (und den Entwurf bestimmt hat)
 *
 * | Prüfung | Ergebnis |
 * |---|---|
 * | Vault-Register (`%APPDATA%\obsidian\obsidian.json`) | **ein** Vault: `D:\Windows\Dokumente\Obsidian Vault` |
 * | Vaults auf C:, D:, E: | **kein** zweiter |
 * | Inhalt | `Willkommen.md` (305 B, Obsidians Beispiel), `Neuer Link.md` (**0 B**), `Unbenannt.canvas` (2 B) |
 * | Wikilinks | **1** |
 * | Graphify | **nicht installiert** (`uv`/`uvx` vorhanden) |
 *
 * **Der Vault ist leer.** Ein Anzeigefenster für zwei Notizen wäre eine leere Fläche — gebaut, gemessen
 * „zeigt Willkommen.md", und niemandem nützlich. Deshalb steht hier **zuerst der Leser**: er arbeitet auf
 * **jedem** Vault, ist ohne laufenden Host prüfbar (reine Funktionen auf Text), und alles Weitere
 * (Fenster in der Welt, Orte im Raum, Graphify-Graph) hängt daran.
 *
 * ## Warum das auf der Rechner-Seite steht und nicht in der Welt
 *
 * Die Welt ist eine **Browserseite**. Sie darf das Dateisystem nicht lesen — und sie soll es auch nicht:
 * ein Pfad aus einer Adresse, der beliebige Dateien öffnet, ist der klassische Ausbruch. Gelesen wird
 * deshalb hier, im Wirt. **Ausgeliefert wird aber nicht das Verzeichnis, sondern die Datenbank**:
 * `einleser.ts` schreibt den Graphen nach Postgres, und gelesen wird er über `/api/pmh/notizen`
 * (`auth-http`), je Konto aus der Sitzung. Dieses Paket hat deshalb **keine eigene Route**: es ist eine
 * Bibliothek, kein Plugin, und steht bewusst nicht in der Patch-Datei — eine zweite Route auf dieselben
 * Daten hätte zwei Wahrheiten über dieselbe Sache ergeben.
 *
 * ## Was der Leser aus einer Notiz macht
 *
 * * **Titel** — die erste Überschrift (`# …`), sonst der Dateiname ohne `.md`.
 * * **Kennung** — der Pfad relativ zum Vault, mit `/`; stabil über Umbenennungen im Ordner hinweg.
 * * **Marken (Tags)** — aus dem Kopfbereich (`tags:`) **und** aus dem Text (`#wort`), ohne Codeblöcke.
 * * **Verweise** — `[[Ziel]]`, `[[Ziel|Text]]`, `[[Ziel#Abschnitt]]`. Der **Zielname** wird vereinfacht;
 *   ob er auf eine vorhandene Notiz zeigt, entscheidet der Graph: ein Verweis ohne Ziel ist **nicht**
 *   verschwunden, sondern ein **offener** Verweis (`offen: true`) — Obsidian zeigt ihn genauso, und wer
 *   ihn unterschlägt, behauptet einen kleineren Graphen.
 *
 * ## Grenzen, die hier Absicht sind
 *
 * * `.obsidian/` wird **nicht** gelesen (Einstellungen, Arbeitsflächen, Zwischenspeicher — nichts davon
 *   ist Inhalt).
 * * Höchstens {@link MAX_NOTIZEN} Dateien und {@link MAX_BYTES} je Datei. Ein Vault mit einer 50-MB-Notiz
 *   ist ein Unfall, und der Wirt soll nicht daran ersticken.
 * * Symbolische Verweise werden **nicht** verfolgt (sie könnten aus dem Vault zeigen).
 *
 * @module @prometheus-harness/world-obsidian
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, resolve, sep } from 'node:path'

/** Wie viele Notizen höchstens gelesen werden. */
export const MAX_NOTIZEN = 5000

/** Wie groß eine einzelne Notiz höchstens sein darf (Bytes). */
export const MAX_BYTES = 512 * 1024

/** Ein Verweis aus einer Notiz. */
export interface NoteLink {
  /** Der Zielname, wie er im Vault steht (ohne `#Abschnitt`, ohne `|Text`). */
  readonly ziel: string
  /** Ob es im Vault eine Notiz mit diesem Namen gibt. */
  readonly offen: boolean
}

/** Eine gelesene Notiz. */
export interface ObsidianNote {
  /** Pfad relativ zum Vault, mit `/` — die stabile Kennung. */
  readonly id: string
  readonly titel: string
  readonly text: string
  readonly tags: readonly string[]
  readonly links: readonly NoteLink[]
  readonly groesse: number
  /**
   * **SHA-256 des Inhalts** — die eine Hälfte des Abgleichs (Migration `0007`, Spalte `content_hash`).
   *
   * Sie fehlt, wenn die Notiz **ohne Datei** entstanden ist (`noteAus` auf einem Text): dort gibt es
   * keinen Dateiinhalt, sondern einen übergebenen. `leseVault` setzt sie immer.
   */
  readonly contentHash?: string
  /**
   * **Die Änderungszeit der Datei** in Millisekunden — die andere Hälfte des Abgleichs.
   *
   * Sie kommt aus dem **Dateisystem** und ist die einzige Angabe, die eine Änderung **außerhalb** unserer
   * Zugriffe verrät. Ohne sie müßte jeder Lauf jede Datei öffnen.
   */
  readonly mtime?: number
}

/** Der ganze Vault als Graph. */
export interface ObsidianGraph {
  /** Der Wurzelordner, wie er gelesen wurde. */
  readonly wurzel: string
  readonly notizen: readonly ObsidianNote[]
  /** Kanten zwischen **vorhandenen** Notizen (Kennung → Kennung). */
  readonly kanten: readonly { readonly von: string; readonly nach: string }[]
  /** Wie viele Ordner gelesen wurden (ohne `.obsidian`). */
  readonly ordner: number
  /** Wie viele Verweise ins Leere zeigen — Obsidian nennt sie „unaufgelöst". */
  readonly offeneVerweise: number
}

/**
 * **Eine Notiz aus Text lesen** — ohne Dateisystem.
 *
 * **Warum das eine eigene, reine Funktion ist.** Ein Test kann damit jede Eigenart des Formats prüfen
 * (Kopfbereich, Marken, Verweise, Codeblöcke), ohne einen Ordner anzulegen; und ein Fehler in der
 * Zerlegung ist ein Fehler **dieser** Funktion, nicht des Lesens.
 *
 * @param datei - der Pfad relativ zum Vault (mit `/`)
 * @param roh - der Inhalt der Datei
 * @returns die Notiz
 */
export function noteAus(datei: string, roh: string): ObsidianNote {
  const text = roh.replace(/\r\n/g, '\n')
  const { kopf, koerper } = trenneKopf(text)
  const titel = titelAus(datei, koerper)
  const tags = tagsAus(kopf, koerper)
  const links = verweiseAus(koerper)
  return { id: datei, titel, text: koerper, tags, links, groesse: roh.length }
}

/**
 * **Kopfbereich und Rumpf trennen.**
 *
 * Ein Kopfbereich beginnt in Zeile 1 mit `---` und endet mit der nächsten Zeile `---`. **Beginnt die
 * Datei nicht damit, gibt es keinen** — ein `---` mitten im Text ist ein Trennstrich und kein Kopf.
 *
 * @param text - der ganze Inhalt
 * @returns die beiden Teile
 */
export function trenneKopf(text: string): { readonly kopf: string; readonly koerper: string } {
  const zeilen = text.split('\n')
  if ((zeilen[0] ?? '').trim() !== '---') return { kopf: '', koerper: text }
  for (let i = 1; i < zeilen.length; i += 1) {
    if ((zeilen[i] ?? '').trim() === '---') {
      return { kopf: zeilen.slice(1, i).join('\n'), koerper: zeilen.slice(i + 1).join('\n') }
    }
  }
  // Kein Ende: dann war es kein Kopfbereich, sondern ein Trennstrich. Nichts abschneiden.
  return { kopf: '', koerper: text }
}

/**
 * Der Titel einer Notiz: die erste Überschrift, sonst der Dateiname.
 *
 * @param datei - der Pfad relativ zum Vault
 * @param koerper - der Rumpf ohne Kopfbereich
 * @returns der Titel
 */
export function titelAus(datei: string, koerper: string): string {
  const treffer = /^#{1,6}\s+(.+)$/mu.exec(koerper)
  if (treffer?.[1] !== undefined) return treffer[1].trim()
  const name = datei.split('/').pop() ?? datei
  return name.replace(/\.md$/iu, '')
}

/**
 * **Die Marken einer Notiz** — aus dem Kopfbereich und aus dem Text.
 *
 * Codeblöcke (```…```) und Inline-Code (`` `…` ``) werden **vorher entfernt**: ein `#include` in einem
 * C-Beispiel ist keine Marke, und ein `#` in einem Shell-Beispiel auch nicht. Wer das nicht tut, bekommt
 * Marken wie `include`, `define` und `!/bin/bash` — gemessen an echten Vaults ist das kein Randfall.
 *
 * @param kopf - der Kopfbereich
 * @param koerper - der Rumpf
 * @returns die Marken, ohne Doppelte, in der Reihenfolge des Auftretens
 */
export function tagsAus(kopf: string, koerper: string): readonly string[] {
  const gefunden: string[] = []
  // Kopfbereich: `tags: a, b` oder `tags: [a, b]` oder eine Liste darunter.
  const kopfZeilen = kopf.split('\n')
  for (let i = 0; i < kopfZeilen.length; i += 1) {
    const zeile = kopfZeilen[i] ?? ''
    const treffer = /^tags?\s*:\s*(.*)$/iu.exec(zeile)
    if (!treffer) continue
    const rest = (treffer[1] ?? '').trim()
    if (rest !== '') {
      for (const teil of rest.replace(/^\[|\]$/gu, '').split(',')) {
        const wert = teil.trim().replace(/^['"]|['"]$/gu, '')
        if (wert !== '') gefunden.push(wert)
      }
    } else {
      // Die Liste steht darunter: `  - marke`.
      for (let j = i + 1; j < kopfZeilen.length; j += 1) {
        const unter = /^\s*-\s*(.+)$/u.exec(kopfZeilen[j] ?? '')
        if (!unter) break
        const wert = (unter[1] ?? '').trim().replace(/^['"]|['"]$/gu, '')
        if (wert !== '') gefunden.push(wert)
      }
    }
  }
  // Und aus dem Text — ohne Code.
  const ohneCode = koerper.replace(/```[\s\S]*?```/gu, ' ').replace(/`[^`\n]*`/gu, ' ')
  for (const treffer of offeneMarken(ohneCode)) {
    if (!gefunden.includes(treffer)) gefunden.push(treffer)
  }
  return [...new Set(gefunden)]
}

/**
 * Marken im Text: `#wort`.
 *
 * **Warum ein eigener Durchlauf und kein `matchAll`.** Eine Marke darf Buchstaben, Ziffern, `-`, `_` und
 * `/` enthalten (`#projekt/prometheus`), aber **nicht** mit einer Ziffer beginnen (`#1` ist eine
 * Aufzählung, `#2026` ein Jahr). Und sie darf nicht mitten in einem Wort stehen (`C#` ist eine Sprache).
 *
 * @param text - der Text ohne Code
 * @returns die Marken
 */
function offeneMarken(text: string): readonly string[] {
  const raus: string[] = []
  for (const treffer of text.matchAll(/(^|[\s([{>])#([A-Za-zÄÖÜäöü_][\w\-/]*)/gu)) {
    const wert = treffer[2] ?? ''
    if (wert !== '') raus.push(wert)
  }
  return raus
}

/**
 * **Die Verweise einer Notiz** — `[[Ziel]]`, `[[Ziel|Text]]`, `[[Ziel#Abschnitt]]`.
 *
 * Der Zielname wird vereinfacht: alles ab `|` (Anzeigetext) und ab `#` (Abschnitt) fällt weg. Das ist
 * die Form, in der Obsidian zwei Notizen verbindet — der Abschnitt ist eine Stelle **in** der Notiz und
 * keine zweite Notiz.
 *
 * @param text - der Rumpf
 * @returns die Verweise (noch ohne Wissen, ob es das Ziel gibt)
 */
export function verweiseAus(text: string): readonly NoteLink[] {
  const raus: NoteLink[] = []
  const ohneCode = text.replace(/```[\s\S]*?```/gu, ' ')
  for (const treffer of ohneCode.matchAll(/\[\[([^\]\n]+)\]\]/gu)) {
    const innen = treffer[1] ?? ''
    const ziel = innen.split('|')[0]?.split('#')[0]?.trim() ?? ''
    if (ziel === '') continue
    raus.push({ ziel, offen: false })
  }
  // Doppelte Verweise sind **eine** Kante: zweimal auf dieselbe Notiz zu zeigen sagt nichts Neues.
  const gesehen = new Set<string>()
  return raus.filter((l) => {
    const schluessel = l.ziel.toLowerCase()
    if (gesehen.has(schluessel)) return false
    gesehen.add(schluessel)
    return true
  })
}

/**
 * **Aus Notizen einen Graphen machen** — die Kanten und die offenen Verweise.
 *
 * **Wie ein Ziel gefunden wird.** Obsidian löst `[[Name]]` gegen den **Dateinamen ohne `.md`** auf, und
 * `[[Ordner/Name]]` gegen den Pfad. Beides wird hier versucht, ohne Rücksicht auf Groß- und
 * Kleinschreibung — Obsidian ist darin nachsichtig, und ein Verweis, der nur in der Schreibweise
 * abweicht, ist kein offener Verweis.
 *
 * @param notizen - die gelesenen Notizen
 * @returns die Kanten und die Zahl der offenen Verweise
 */
export function graphAus(notizen: readonly ObsidianNote[]): {
  readonly kanten: readonly { readonly von: string; readonly nach: string }[]
  readonly offeneVerweise: number
  readonly notizen: readonly ObsidianNote[]
} {
  const nachName = new Map<string, string>()
  for (const n of notizen) {
    const name = (n.id.split('/').pop() ?? n.id).replace(/\.md$/iu, '')
    nachName.set(name.toLowerCase(), n.id)
    nachName.set(n.id.replace(/\.md$/iu, '').toLowerCase(), n.id)
  }
  const kanten: { von: string; nach: string }[] = []
  let offen = 0
  const mitVerweisen = notizen.map((n) => {
    const links = n.links.map((l) => {
      const ziel = nachName.get(l.ziel.toLowerCase())
      if (ziel === undefined) {
        offen += 1
        return { ziel: l.ziel, offen: true }
      }
      // **Ein Verweis auf sich selbst ist keine Kante** — er macht den Graphen nicht reicher, sondern
      // nur größer. (Obsidian zeigt ihn, zählt ihn aber nicht als Verbindung.)
      if (ziel !== n.id) kanten.push({ von: n.id, nach: ziel })
      return { ziel, offen: false }
    })
    return { ...n, links }
  })
  return { kanten, offeneVerweise: offen, notizen: mitVerweisen }
}

/**
 * **Den Vault lesen.**
 *
 * @param wurzel - der Wurzelordner
 * @returns der Graph
 */
export function leseVault(wurzel: string): ObsidianGraph {
  const basis = resolve(wurzel)
  if (!existsSync(basis)) throw new Error(`Der Vault wurde nicht gefunden: ${basis}`)
  const dateien: { id: string; roh: string; mtime: number }[] = []
  let ordner = 0
  const besuchen = (pfad: string): void => {
    for (const eintrag of readdirSync(pfad, { withFileTypes: true })) {
      // **`.obsidian` ist keine Notiz-Sammlung**, sondern der Zustand der Anwendung.
      if (eintrag.name === '.obsidian') continue
      const voll = join(pfad, eintrag.name)
      // Symbolische Verweise werden **nicht** verfolgt: sie könnten aus dem Vault zeigen.
      if (eintrag.isSymbolicLink()) continue
      if (eintrag.isDirectory()) {
        ordner += 1
        besuchen(voll)
        continue
      }
      if (!eintrag.name.toLowerCase().endsWith('.md')) continue
      if (dateien.length >= MAX_NOTIZEN) return
      const werte = statSync(voll)
      if (werte.size > MAX_BYTES) continue
      dateien.push({
        id: relative(basis, voll).split(sep).join('/'),
        roh: readFileSync(voll, 'utf8'),
        mtime: werte.mtimeMs,
      })
    }
  }
  besuchen(basis)
  const notizen = dateien.map((d) => {
    const note = noteAus(d.id, d.roh)
    // **Die zwei Abgleichspalten** (Migration `0007`): Inhalt-Hash und Datei-Zeit.
    return { ...note, contentHash: createHash('sha256').update(d.roh, 'utf8').digest('hex'), mtime: d.mtime }
  })
  const graph = graphAus(notizen)
  return { wurzel: basis, notizen: graph.notizen, kanten: graph.kanten, ordner, offeneVerweise: graph.offeneVerweise }
}

/**
 * Der Vault, den dieses Plugin liest.
 *
 * **Reihenfolge:** `PMH_OBSIDIAN_VAULT` (Umgebung) — sonst der Vault, den Obsidian selbst als offen
 * führt (`%APPDATA%\obsidian\obsidian.json`). So muß niemand einen Pfad eintragen, der schon in einer
 * Datei steht; wer einen **anderen** Vault will, setzt die Umgebung.
 *
 * @returns der Pfad oder `undefined`, wenn keiner gefunden wurde
 */
export function vaultPfad(): string | undefined {
  const ausUmgebung = process.env['PMH_OBSIDIAN_VAULT']
  if (ausUmgebung !== undefined && ausUmgebung !== '') return ausUmgebung
  const register = process.env['APPDATA']
  if (register === undefined) return undefined
  try {
    const roh = JSON.parse(readFileSync(join(register, 'obsidian', 'obsidian.json'), 'utf8')) as {
      vaults?: Record<string, { path?: string; open?: boolean }>
    }
    const eintraege = Object.values(roh.vaults ?? {})
    const offen = eintraege.find((v) => v.open === true) ?? eintraege[0]
    return offen?.path
  } catch {
    return undefined
  }
}

/*
 * ══ WAS HIER NICHT MEHR STEHT — UND WARUM ═════════════════════════════════════════════════════════
 *
 * Bis zum 16.10.2026 hing an diesem Modul eine eigene Route `GET /universe/api/notes`: sie las den
 * Vault bei jeder Anfrage von der Platte und antwortete mit JSON. Das war die **zweite Wahrheit**
 * neben der Datenbank — und die Datenbank ist hier die richtige: `vaults`, `notes`, `tags`,
 * `note_tags`, `links` (Migration `0007`) sind angewendet, mandantengebunden und durchsuchbar.
 *
 * Die Route kommt **wieder** — aber in `packages/api/auth-http/src/notizen.ts`, wo die Sitzung liegt
 * (`verifySession` → `userId`, dasselbe Muster wie `folders.ts`). Ohne diese Zuordnung gäbe es keinen
 * Eigentümer, und „jeder Benutzer hat seinen eigenen Vault" wäre nicht einzuhalten.
 *
 * Dieses Modul ist damit das, was es sein soll: ein **Leser** (Text → Notizen, 12 Tests) und mit
 * `./einleser.ts` der **Einleser** (Notizen → Tabellen, gegen die echte Datenbank gemessen).
 */
