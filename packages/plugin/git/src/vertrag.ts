/**
 * Der Vertrag des Git-Plugins — alles, was ohne Host prüfbar ist.
 *
 * ## Warum Parser hier und nicht im Server
 *
 * `git status --porcelain=v2`, `git diff --numstat`, `git log` und `git remote -v` sind
 * **Textformate**. Sie zu lesen ist die einzige Stelle, an der dieses Plugin falsch liegen kann, und
 * die einzige, die man ohne Repository prüfen kann. Deshalb steht sie in einer Datei ohne
 * Node-Abhängigkeit: die Tests füttern echte Ausgaben hinein und vergleichen den Stand.
 *
 * ## Warum drei Modi
 *
 * Der Betreiber hat die Überprüfungsansicht des alten Werkzeugs gezeigt (21.10.2026): ein Umschalter
 * **Git changes**, **Branch changes**, **Änderungen der letzten Runde**. Das sind drei verschiedene
 * Fragen an dasselbe Repository:
 *
 * | Modus | Frage | Befehl |
 * |---|---|---|
 * | `arbeitsbaum` | was ist jetzt nicht committet | `status` + `diff` |
 * | `zweig` | was hat dieser Zweig seit der Abzweigung geändert | `diff <basis>` |
 * | `letzte-runde` | was hat der letzte Commit geändert | `diff HEAD~1 HEAD` |
 *
 * @module @prometheus-harness/git/vertrag
 */

/** Die drei Ansichten der Überprüfung. */
export type Modus = 'arbeitsbaum' | 'zweig' | 'letzte-runde'

/** Die Modi in Anzeigereihenfolge — die Quelle für den Umschalter im Panel. */
export const MODI: readonly Modus[] = ['arbeitsbaum', 'zweig', 'letzte-runde']

/**
 * Ob ein Modus bekannt ist.
 *
 * **Warum eine eigene Prüfung.** Ein unbekannter Modus aus einer Anfrage ist ein Fehler (400), kein
 * stiller Rückfall auf den Arbeitsbaum — sonst zeigte das Panel etwas anderes, als der Nutzer
 * angeklickt hat.
 *
 * @param wert - der geprüfte Text
 * @returns ob er einen Modus nennt
 */
export function istModus(wert: string): wert is Modus {
  return (MODI as readonly string[]).includes(wert)
}

/** Der Zustand einer Datei in der Anzeige — die Wörter, die das Panel ausgibt. */
export type Dateistatus =
  | 'hinzugefuegt'
  | 'geaendert'
  | 'geloescht'
  | 'umbenannt'
  | 'kopiert'
  | 'typwechsel'
  | 'konflikt'
  | 'unversioniert'
  | 'unbekannt'

/** Aus welchem Bereich eine Änderung stammt. */
export type Bereich = 'index' | 'werk' | 'unversioniert' | 'zweig' | 'runde'

/** Eine Zeile der Überprüfungsliste. */
export interface Aenderung {
  /** Pfad relativ zur Repository-Wurzel, mit Schrägstrichen. */
  readonly pfad: string
  /** Der frühere Pfad bei einer Umbenennung. */
  readonly altpfad?: string
  /** Was mit der Datei geschehen ist. */
  readonly status: Dateistatus
  /** Wo die Änderung liegt: im Index, im Arbeitsbaum, unversioniert oder im Vergleich. */
  readonly bereich: Bereich
  /** Hinzugefügte Zeilen; `null`, wenn git keine Zahl nennt (binär, Umbenennung ohne Inhalt). */
  readonly zusatz: number | null
  /** Entfernte Zeilen; `null` wie oben. */
  readonly abzug: number | null
  /** Ob git die Seite als binär meldet. */
  readonly binaer: boolean
}

/** Der Zweig und seine Stellung zum Upstream. */
export interface Zweigstand {
  /** Der Zweigname; `null` bei losgelöstem HEAD. */
  readonly name: string | null
  /** Der Commit, auf dem HEAD steht. */
  readonly kopf: string | null
  /** Der Upstream (`origin/main`), wenn einer eingetragen ist. */
  readonly upstream: string | null
  /** Wie viele Commits der Zweig voraus ist. */
  readonly voraus: number
  /** Wie viele Commits er zurückliegt. */
  readonly zurueck: number
}

/** Ein Commit der kurzen Liste. */
export interface Commit {
  /** Kurzer Hash, wie ihn `git log --pretty=%h` liefert. */
  readonly hash: string
  /** Der vollständige Hash. */
  readonly voll: string
  /** Verfasser. */
  readonly autor: string
  /** Zeitpunkt als ISO-Text. */
  readonly zeit: string
  /** Die erste Zeile der Nachricht. */
  readonly betreff: string
}

/** Ein Anbieter, den dieses Plugin erkennt. */
export type Anbieter = 'github' | 'gitlab' | 'gitea' | 'forgejo' | 'bitbucket' | 'unbekannt'

/** Ein Remote und was sich daraus ableiten läßt. */
export interface Remote {
  /** Der Name in der git-Konfiguration (`origin`). */
  readonly name: string
  /** Die rohe URL. */
  readonly url: string
  /** Der erkannte Anbieter. */
  readonly anbieter: Anbieter
  /** Der Hostname. */
  readonly host: string
  /** Der Eigner oder die Gruppe; bei GitLab dürfen das mehrere Ebenen sein. */
  readonly eigner: string | null
  /** Der Repository-Name ohne `.git`. */
  readonly repo: string | null
  /** Die Weboberfläche, wenn die URL eine zuläßt. */
  readonly webUrl: string | null
}

/**
 * Erkennt den Anbieter an einem Hostnamen.
 *
 * **Warum eine Vermutung und keine Messung.** Ob `git.firma.de` Forgejo oder Gitea oder etwas
 * Drittes ist, steht in keiner URL. Erkannt wird nur, was im Namen steht (Codeberg ist Forgejo);
 * alles andere bleibt `unbekannt` und wird im Panel auch so genannt.
 *
 * @param host - der Hostname, kleingeschrieben erwartet
 * @returns der Anbieter
 */
export function anbieterAusHost(host: string): Anbieter {
  const h = host.toLowerCase()
  if (h === 'github.com' || h.endsWith('.github.com') || h.includes('github')) return 'github'
  if (h === 'gitlab.com' || h.endsWith('.gitlab.com') || h.includes('gitlab')) return 'gitlab'
  if (h === 'codeberg.org' || h.includes('forgejo')) return 'forgejo'
  if (h.includes('gitea')) return 'gitea'
  if (h === 'bitbucket.org' || h.includes('bitbucket')) return 'bitbucket'
  return 'unbekannt'
}

/**
 * Zerlegt eine Remote-URL in Host, Eigner und Repository.
 *
 * Verstanden werden die drei Formen, die git wirklich schreibt:
 *
 * | Form | Beispiel |
 * |---|---|
 * | SCP wie OpenSSH | `git@github.com:eigner/repo.git` |
 * | HTTPS | `https://gitlab.com/gruppe/repo.git` |
 * | SSH mit Port | `ssh://git@host:2222/gruppe/repo.git` |
 *
 * Ein lokaler Pfad (`/srv/repo.git`, `C:\repos\x.git`) ist kein Anbieter: er bekommt `host: ''` und
 * `anbieter: 'unbekannt'`. Das ist die ehrliche Antwort — ein Pfad hat keine Weboberfläche.
 *
 * @param roh - die URL, wie sie in `remote.origin.url` steht
 * @returns Host, Pfadteile und das Schema, soweit erkennbar
 */
export function zerlegeUrl(roh: string): {
  readonly host: string
  readonly pfad: string
  readonly schema: string
} {
  const text = roh.trim()
  if (text === '') return { host: '', pfad: '', schema: '' }

  const schemaTreffer = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//u.exec(text)
  if (schemaTreffer !== null) {
    const schema = (schemaTreffer[1] ?? '').toLowerCase()
    try {
      const url = new URL(text)
      const pfad = url.pathname.replace(/^\/+/u, '').replace(/\/+$/u, '')
      return { host: url.hostname.toLowerCase(), pfad, schema }
    } catch {
      return { host: '', pfad: '', schema }
    }
  }

  // SCP-Form: [benutzer@]host:pfad — der Doppelpunkt ist der Trenner, nicht ein Schema.
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/u.exec(text)
  if (scp !== null) {
    return { host: (scp[1] ?? '').toLowerCase(), pfad: (scp[2] ?? '').replace(/^\/+/u, ''), schema: 'ssh' }
  }

  // Ein lokaler Pfad — kein Host, keine URL.
  return { host: '', pfad: '', schema: '' }
}

/**
 * Macht aus einer Remote-URL einen Anzeigesatz.
 *
 * @param name - der Remote-Name
 * @param url - die rohe URL
 * @returns der erkannte Remote
 */
export function erkenneRemote(name: string, url: string): Remote {
  const { host, pfad, schema } = zerlegeUrl(url)
  const ohneGit = pfad.replace(/\.git$/u, '')
  const teile = ohneGit.split('/').filter((teil) => teil !== '')
  const repo = teile.length === 0 ? null : (teile[teile.length - 1] ?? null)
  const eigner = teile.length < 2 ? null : teile.slice(0, -1).join('/')
  const anbieter = anbieterAusHost(host)
  const webUrl =
    host === '' || ohneGit === ''
      ? null
      : `${schema === 'http' ? 'http' : 'https'}://${host}/${ohneGit}`
  return { name, url, anbieter, host, eigner, repo, webUrl }
}

/**
 * Liest `git remote -v`.
 *
 * **Warum die erste Zeile je Name genügt.** `-v` nennt jede URL zweimal (fetch und push). Die erste
 * ist die, die der Nutzer meint; zwei Zeilen für dasselbe Ziel wären nur Rauschen.
 *
 * @param text - die Ausgabe
 * @returns die Remotes in der Reihenfolge von git
 */
export function parseRemotes(text: string): Remote[] {
  const gesehen = new Set<string>()
  const aus: Remote[] = []
  for (const zeile of text.split('\n')) {
    const treffer = /^(\S+)\s+(\S+)\s+\((fetch|push)\)\s*$/u.exec(zeile.trimEnd())
    if (treffer === null) continue
    const name = treffer[1] ?? ''
    const url = treffer[2] ?? ''
    if (name === '' || url === '' || gesehen.has(name)) continue
    gesehen.add(name)
    aus.push(erkenneRemote(name, url))
  }
  return aus
}

/**
 * Macht aus dem XY-Feld von `git status --porcelain=v2` einen Dateistatus.
 *
 * @param zeichen - `M`, `A`, `D`, `R`, `C`, `T`, `U` oder `.`
 * @returns der Status
 */
export function statusAusZeichen(zeichen: string): Dateistatus {
  switch (zeichen) {
    case 'M':
      return 'geaendert'
    case 'A':
      return 'hinzugefuegt'
    case 'D':
      return 'geloescht'
    case 'R':
      return 'umbenannt'
    case 'C':
      return 'kopiert'
    case 'T':
      return 'typwechsel'
    case 'U':
      return 'konflikt'
    case '?':
      return 'unversioniert'
    default:
      return 'unbekannt'
  }
}

/** Ein Eintrag aus `--numstat`. */
export interface NumstatEintrag {
  /** Hinzugefügte Zeilen; `null` bei binär. */
  readonly zusatz: number | null
  /** Entfernte Zeilen; `null` bei binär. */
  readonly abzug: number | null
  /** Ob git die Seite als binär meldet. */
  readonly binaer: boolean
}

/**
 * Liest `git diff --numstat -z`.
 *
 * Das Format mit `-z` ist das einzige, in dem ein Pfad mit Leerzeichen nicht zerbricht:
 * `zusatz TAB abzug TAB pfad NUL`, bei einer Umbenennung `zusatz TAB abzug TAB NUL alt NUL neu NUL`.
 *
 * @param text - die Ausgabe mit NUL-Trennern
 * @returns die Zahlen je Pfad, bei Umbenennungen unter dem neuen Pfad
 */
export function parseNumstat(text: string): Map<string, NumstatEintrag> {
  const aus = new Map<string, NumstatEintrag>()
  const felder = text.split('\0')
  for (let i = 0; i < felder.length; i += 1) {
    const zeile = felder[i]
    if (zeile === undefined || zeile.trim() === '') continue
    const teile = zeile.split('\t')
    const rohZusatz = teile[0] ?? ''
    const rohAbzug = teile[1] ?? ''
    const binaer = rohZusatz === '-' || rohAbzug === '-'
    const zusatz = binaer ? null : Number.parseInt(rohZusatz, 10)
    const abzug = binaer ? null : Number.parseInt(rohAbzug, 10)
    const eintrag: NumstatEintrag = {
      zusatz: zusatz !== null && Number.isFinite(zusatz) ? zusatz : null,
      abzug: abzug !== null && Number.isFinite(abzug) ? abzug : null,
      binaer,
    }
    const pfad = teile.slice(2).join('\t')
    if (teile.length <= 2 || pfad === '') {
      // Umbenennung: das Pfadfeld ist leer, der neue Pfad folgt als eigenes NUL-Feld.
      const alt = felder[i + 1]
      const neu = felder[i + 2]
      i += 2
      if (neu !== undefined && neu !== '') aus.set(neu, eintrag)
      else if (alt !== undefined && alt !== '') aus.set(alt, eintrag)
      continue
    }
    aus.set(pfad, eintrag)
  }
  return aus
}

/**
 * Liest den Kopf von `git status --porcelain=v2 --branch`.
 *
 * Die Zweigzeilen beginnen mit `# `, die Dateizeilen mit `1 `, `2 `, `u `, `? ` oder `! `.
 *
 * @param text - die Ausgabe mit NUL-Trennern
 * @param numstat - Zahlen je Pfad aus {@link parseNumstat}; fehlt sie, bleiben die Zahlen `null`
 * @returns Zweigstand und Änderungen
 */
export function parseStatus(
  text: string,
  numstat: ReadonlyMap<string, NumstatEintrag> = new Map(),
): { readonly zweig: Zweigstand; readonly aenderungen: readonly Aenderung[] } {
  let name: string | null = null
  let kopf: string | null = null
  let upstream: string | null = null
  let voraus = 0
  let zurueck = 0
  const aenderungen: Aenderung[] = []

  const felder = text.split('\0')
  for (let i = 0; i < felder.length; i += 1) {
    const zeile = felder[i]
    if (zeile === undefined || zeile === '') continue

    if (zeile.startsWith('# ')) {
      // **Ein NUL-Feld kann mehrere Kopfzeilen tragen.** Gemessen am 21.10.2026 schreibt git jede
      // `#`-Zeile als eigenes NUL-Feld; andere Versionen fassen sie zusammen. Beides wird gelesen,
      // statt sich auf eine Form zu verlassen.
      for (const teil of zeile.split('\n')) {
        if (!teil.startsWith('# ')) continue
        const inhalt = teil.slice(2)
        if (inhalt.startsWith('branch.oid ')) kopf = inhalt.slice('branch.oid '.length).trim()
        else if (inhalt.startsWith('branch.head ')) {
          const wert = inhalt.slice('branch.head '.length).trim()
          name = wert === '(detached)' ? null : wert
        } else if (inhalt.startsWith('branch.upstream ')) upstream = inhalt.slice('branch.upstream '.length).trim()
        else if (inhalt.startsWith('branch.ab ')) {
          const treffer = /^\+(\d+)\s+-(\d+)$/u.exec(inhalt.slice('branch.ab '.length).trim())
          if (treffer !== null) {
            voraus = Number.parseInt(treffer[1] ?? '0', 10)
            zurueck = Number.parseInt(treffer[2] ?? '0', 10)
          }
        }
      }
      continue
    }

    if (zeile.startsWith('1 ') || zeile.startsWith('2 ') || zeile.startsWith('u ')) {
      const art = zeile[0]
      const teile = zeile.split(' ')
      const xy = teile[1] ?? '..'
      const x = xy[0] ?? '.'
      const y = xy[1] ?? '.'
      const abPfad = art === '1' ? 8 : art === '2' ? 9 : 10
      const pfad = teile.slice(abPfad).join(' ')
      if (pfad === '') continue
      let altpfad: string | undefined
      if (art === '2') {
        const alt = felder[i + 1]
        i += 1
        if (alt !== undefined && alt !== '') altpfad = alt
      }
      const zahlen = numstat.get(pfad)
      const basis = {
        pfad,
        ...(altpfad === undefined ? {} : { altpfad }),
        zusatz: zahlen?.zusatz ?? null,
        abzug: zahlen?.abzug ?? null,
        binaer: zahlen?.binaer ?? false,
      }
      if (x !== '.' && x !== ' ') {
        aenderungen.push({ ...basis, status: statusAusZeichen(x), bereich: 'index' })
      }
      if (y !== '.' && y !== ' ') {
        aenderungen.push({ ...basis, status: statusAusZeichen(y), bereich: 'werk' })
      }
      continue
    }

    if (zeile.startsWith('? ')) {
      const pfad = zeile.slice(2)
      if (pfad === '') continue
      aenderungen.push({
        pfad,
        status: 'unversioniert',
        bereich: 'unversioniert',
        zusatz: null,
        abzug: null,
        binaer: false,
      })
    }
  }

  return { zweig: { name, kopf, upstream, voraus, zurueck }, aenderungen }
}

/**
 * Liest `git diff --name-status -z`.
 *
 * **Warum getrennt von `--numstat`.** `numstat` nennt Zahlen ohne Status, `name-status` Status ohne
 * Zahlen. Beides in einem Aufruf gibt es nicht; die Anzeige braucht aber beides nebeneinander.
 *
 * @param text - die Ausgabe mit NUL-Trennern
 * @param bereich - in welchen Bereich die Einträge gehören
 * @param numstat - Zahlen je Pfad
 * @returns die Änderungen
 */
export function parseNameStatus(
  text: string,
  bereich: Bereich,
  numstat: ReadonlyMap<string, NumstatEintrag> = new Map(),
): Aenderung[] {
  const aus: Aenderung[] = []
  const felder = text.split('\0')
  for (let i = 0; i < felder.length; i += 1) {
    const status = felder[i]
    if (status === undefined || status.trim() === '') continue
    const zeichen = status[0] ?? ''
    const zahlen = (pfad: string): { zusatz: number | null; abzug: number | null; binaer: boolean } => {
      const eintrag = numstat.get(pfad)
      return { zusatz: eintrag?.zusatz ?? null, abzug: eintrag?.abzug ?? null, binaer: eintrag?.binaer ?? false }
    }
    if (zeichen === 'R' || zeichen === 'C') {
      const alt = felder[i + 1] ?? ''
      const neu = felder[i + 2] ?? ''
      i += 2
      if (neu === '') continue
      aus.push({ pfad: neu, altpfad: alt, status: statusAusZeichen(zeichen), bereich, ...zahlen(neu) })
      continue
    }
    const pfad = felder[i + 1] ?? ''
    i += 1
    if (pfad === '') continue
    aus.push({ pfad, status: statusAusZeichen(zeichen), bereich, ...zahlen(pfad) })
  }
  return aus
}

/**
 * Liest die kurze Commit-Liste (`%h%x1f%H%x1f%an%x1f%ad%x1f%s`).
 *
 * @param text - die Ausgabe, eine Zeile je Commit
 * @returns die Commits in der Reihenfolge von git (neueste zuerst)
 */
export function parseLog(text: string): Commit[] {
  const aus: Commit[] = []
  for (const zeile of text.split('\n')) {
    if (zeile.trim() === '') continue
    const teile = zeile.split('\u001f')
    const hash = teile[0] ?? ''
    const voll = teile[1] ?? ''
    if (hash === '' || voll === '') continue
    aus.push({
      hash,
      voll,
      autor: teile[2] ?? '',
      zeit: teile[3] ?? '',
      betreff: teile[4] ?? '',
    })
  }
  return aus
}

/** Eine Zeile eines Diffs. */
export interface Diffzeile {
  /** `kopf` ist die `@@`-Zeile, `meta` alles vor dem ersten Hunk. */
  readonly art: 'kopf' | 'meta' | 'kontext' | 'plus' | 'minus'
  /** Der Text ohne das führende Zeichen. */
  readonly text: string
  /** Die Zeilennummer auf der alten Seite, wenn bekannt. */
  readonly alt: number | null
  /** Die Zeilennummer auf der neuen Seite, wenn bekannt. */
  readonly neu: number | null
}

/** Ein Hunk eines Diffs. */
export interface Hunk {
  /** Die `@@`-Zeile, wie git sie schreibt. */
  readonly kopf: string
  /** Die Zeilen des Hunks. */
  readonly zeilen: readonly Diffzeile[]
}

/** Ein geparster Diff einer Datei. */
export interface Dateidiff {
  /** Ob git die Datei als binär meldet. */
  readonly binaer: boolean
  /** Ob der Diff abgeschnitten wurde (nur bei sehr großen Dateien). */
  readonly abgeschnitten: boolean
  /** Die Hunks in der Reihenfolge von git. */
  readonly hunks: readonly Hunk[]
  /** Warum der Diff leer ist, wenn das einen Grund hat. */
  readonly hinweis?: string
}

/**
 * Liest einen unified diff (`git diff -U3`).
 *
 * **Warum Zeilennummern mitgezählt werden.** Die Anzeige soll „geteilt" zwei Spalten zeigen; dafür
 * braucht jede Zeile ihre Nummer auf beiden Seiten. Sie aus der `@@`-Zeile fortzuschreiben ist
 * billiger und richtiger, als sie im Browser zu raten.
 *
 * @param text - die Ausgabe von `git diff`
 * @param grenze - höchstens so viele Zeilen werden gelesen
 * @returns der geparste Diff
 */
export function parseDiff(text: string, grenze = 4000): Dateidiff {
  const hunks: Hunk[] = []
  let binaer = false
  let abgeschnitten = false
  let aktuell: { kopf: string; zeilen: Diffzeile[] } | null = null
  let alt = 0
  let neu = 0
  let gelesen = 0

  for (const zeile of text.split('\n')) {
    if (gelesen >= grenze) {
      abgeschnitten = true
      break
    }
    gelesen += 1

    if (zeile.startsWith('Binary files ') || zeile.startsWith('GIT binary patch')) {
      binaer = true
      continue
    }
    const hunkKopf = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(zeile)
    if (hunkKopf !== null) {
      if (aktuell !== null) hunks.push(aktuell)
      alt = Number.parseInt(hunkKopf[1] ?? '0', 10)
      neu = Number.parseInt(hunkKopf[2] ?? '0', 10)
      aktuell = { kopf: zeile, zeilen: [] }
      continue
    }
    if (aktuell === null) continue
    if (zeile.startsWith('+')) {
      aktuell.zeilen.push({ art: 'plus', text: zeile.slice(1), alt: null, neu })
      neu += 1
    } else if (zeile.startsWith('-')) {
      aktuell.zeilen.push({ art: 'minus', text: zeile.slice(1), alt, neu: null })
      alt += 1
    } else if (zeile.startsWith(' ')) {
      aktuell.zeilen.push({ art: 'kontext', text: zeile.slice(1), alt, neu })
      alt += 1
      neu += 1
    } else if (zeile.startsWith('\\')) {
      // „\ No newline at end of file" gehört zur vorigen Zeile.
      continue
    }
  }
  if (aktuell !== null) hunks.push(aktuell)
  return { binaer, abgeschnitten, hunks }
}

/**
 * Zählt die Zeilen einer Datei, ohne sie ganz zu lesen.
 *
 * **Warum überhaupt.** Eine unversionierte Datei steht in keinem `numstat` — git hat für sie keinen
 * Vergleich. Ohne Zahl stünde sie als „+0 −0" da, und das wäre falsch.
 *
 * @param text - der Inhalt
 * @returns die Zeilenzahl; 0 für leer
 */
export function zaehleZeilen(text: string): number {
  if (text === '') return 0
  const zeilen = text.split('\n')
  return text.endsWith('\n') ? zeilen.length - 1 : zeilen.length
}

/**
 * Formt einen Pfad für die Anzeige.
 *
 * Repository-Pfade sind immer mit Schrägstrichen; Windows-Pfade kommen mit Backslashes aus
 * `status`. Die Anzeige soll überall gleich aussehen.
 *
 * @param pfad - der Pfad
 * @returns der Pfad mit Schrägstrichen
 */
export function anzeigePfad(pfad: string): string {
  return pfad.replace(/\\/gu, '/')
}

/**
 * Kürzt eine Commit-Nachricht auf eine Zeile.
 *
 * @param text - die Nachricht
 * @param grenze - höchstens so viele Zeichen
 * @returns die gekürzte Zeile
 */
export function eineZeile(text: string, grenze = 72): string {
  const zeile = text.split('\n')[0] ?? ''
  return zeile.length <= grenze ? zeile : `${zeile.slice(0, grenze - 1)}…`
}
