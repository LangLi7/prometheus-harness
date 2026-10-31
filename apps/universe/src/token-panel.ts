/**
 * **Das Token-Panel — der sichere Weg, einen Anbieter-Schlüssel zu setzen.**
 *
 * ## Warum ein Panel und kein Befehl mit Argument
 *
 * Ein Schlüssel als Argument steht in der Prozeßliste, im Verlauf und im
 * Protokoll — `docs/status/geheimnisse-ablage.md` sagt das ausdrücklich. Der
 * Wert kommt deshalb über ein **Paßwortfeld** in einem Panel; der Befehl
 * `/token` öffnet nur das Panel.
 *
 * ## Was das Panel **nicht** tut
 *
 * Es speichert nichts im Browser. Kein `localStorage`, kein `sessionStorage`,
 * kein Keks. Der Schlüssel geht per `POST` an den Host, wird dort verpackt und
 * ist danach nur noch als **Hinweis** (acht Hexzeichen) sichtbar. Wer das Panel
 * neu öffnet, sieht „gesetzt" — nicht den Schlüssel.
 *
 * ## Was der Server liefert
 *
 * `GET /api/pmh/token` gibt die Anbieter **mit ihrem Zustand** zurück. Das Panel
 * kennt deshalb keine eigene Anbieterliste: eine zweite Liste würde still
 * auseinanderlaufen, und dann böte die Oberfläche einen Anbieter an, den der
 * Host nicht kennt.
 *
 * @module apps/universe/src/token-panel
 */

/** Was das Panel vom Wirt braucht. */
export interface TokenPanelEnv {
  readonly tr: (key: string, vars?: Readonly<Record<string, string | number>>) => string
}

/** Ein Anbieter, so wie ihn der Host beschreibt. */
interface Anbieter {
  readonly id: string
  readonly name: string
  readonly ref: string
  readonly herkunft: string
  readonly gesetzt: boolean
  readonly hinweis?: string
  readonly fassung?: number
  readonly aktualisiert?: string
}

/** Ein Fehler mit einem **stabilen** Code — kein Satz, der übersetzt werden müßte. */
class TokenFehler extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/** Der CSRF-Wert aus dem lesbaren Keks — `undefined`, wenn es keinen gibt. */
function csrfAusKeks(keks: string): string | undefined {
  const treffer = /(?:^|;\s*)pmh_csrf=([^;]*)/u.exec(keks)
  if (treffer === null) return undefined
  const wert = decodeURIComponent(treffer[1] ?? '')
  return wert === '' ? undefined : wert
}

/** Ein Knoten mit Klasse und Text. */
function knoten(dokument: Document, tag: string, klasse: string, text?: string): HTMLElement {
  const el = dokument.createElement(tag)
  el.className = klasse
  if (text !== undefined) el.textContent = text
  return el
}

/**
 * Baut das Panel.
 *
 * **Wird erneut gerufen**, wenn die Fläche neu aufgebaut wird (Sprachwechsel,
 * Zonenwechsel). Der Zustand kommt dann frisch vom Host; das ist gewollt, denn
 * ein gemerkter Zustand könnte einen Schlüssel zeigen, den es nicht mehr gibt.
 *
 * @param host - wohin gemalt wird
 * @param env - der Übersetzer
 */
export function mountTokenPanel(host: HTMLElement, env: TokenPanelEnv): void {
  const dokument = host.ownerDocument
  const t = env.tr

  host.replaceChildren()
  host.classList.add('token-panel')

  const kopf = knoten(dokument, 'header', 'token-kopf')
  kopf.appendChild(knoten(dokument, 'span', 'token-marke', t('token.mark')))
  kopf.appendChild(knoten(dokument, 'h3', 'token-titel', t('token.title')))
  kopf.appendChild(knoten(dokument, 'p', 'token-lead', t('token.lead')))
  host.appendChild(kopf)

  // **Der lebende Bereich steht vor der Liste.** Ein Satz erscheint dort, wo
  // ihn ein Vorlesegerät ansagt; die Liste selbst ist keine Ansage.
  const status = knoten(dokument, 'p', 'token-status', t('token.loading'))
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  host.appendChild(status)

  const liste = knoten(dokument, 'div', 'token-liste')
  host.appendChild(liste)

  const form = knoten(dokument, 'form', 'token-form')
  form.setAttribute('autocomplete', 'off')
  const feldKopf = dokument.createElement('label')
  feldKopf.className = 'token-feld-kopf'
  feldKopf.textContent = t('token.field')
  feldKopf.htmlFor = 'token-wert'
  form.appendChild(feldKopf)
  const eingabe = dokument.createElement('input')
  eingabe.id = 'token-wert'
  eingabe.className = 'token-eingabe'
  eingabe.type = 'password'
  eingabe.autocomplete = 'off'
  eingabe.spellcheck = false
  eingabe.placeholder = t('token.placeholder')
  eingabe.setAttribute('aria-describedby', 'token-fuss')
  form.appendChild(eingabe)
  const fuss = knoten(dokument, 'p', 'token-fuss', t('token.foot'))
  fuss.id = 'token-fuss'
  form.appendChild(fuss)
  const aktionen = knoten(dokument, 'div', 'token-aktionen')
  const speichern = knoten(dokument, 'button', 'token-knopf token-knopf-haupt', t('token.save')) as HTMLButtonElement
  speichern.type = 'submit'
  const entfernen = knoten(dokument, 'button', 'token-knopf token-knopf-weg', t('token.remove')) as HTMLButtonElement
  entfernen.type = 'button'
  aktionen.append(speichern, entfernen)
  form.appendChild(aktionen)
  host.appendChild(form)

  let anbieter: readonly Anbieter[] = []
  let gewaehlt: string | undefined
  let laeuft = false

  const fehlerText = (code: string, fallback: string): string => {
    switch (code) {
      case 'nicht-angemeldet':
        return t('token.error.auth')
      case 'kein-hauptschluessel':
        return t('token.error.master')
      case 'csrf-fehlt':
      case 'nur-mit-konto':
        return t('token.error.csrf')
      case 'speicher-fehler':
        return t('token.error.store')
      case 'netz':
        return t('token.error.net')
      default:
        return fallback
    }
  }

  const sage = (text: string, art: 'normal' | 'gut' | 'fehler' = 'normal'): void => {
    status.textContent = text
    status.dataset.art = art
  }

  /** Ein Aufruf an den Host — mit CSRF, ohne den Schlüssel je in die Adresse zu schreiben. */
  const ruf = async (
    methode: 'GET' | 'POST' | 'DELETE',
    koerper?: unknown,
    pfad = '/api/pmh/token',
  ): Promise<unknown> => {
    const f = (globalThis as { fetch?: typeof fetch }).fetch
    if (typeof f !== 'function') throw new TokenFehler('netz', 'Diese Umgebung kennt kein fetch.')
    const csrf = csrfAusKeks(dokument.cookie)
    const kopfzeilen: Record<string, string> = { accept: 'application/json' }
    if (csrf !== undefined) kopfzeilen['x-pmh-csrf'] = csrf
    if (koerper !== undefined) kopfzeilen['content-type'] = 'application/json'
    let antwort: Response
    try {
      antwort = await f(pfad, {
        method: methode,
        credentials: 'same-origin',
        headers: kopfzeilen,
        ...(koerper === undefined ? {} : { body: JSON.stringify(koerper) }),
      })
    } catch {
      throw new TokenFehler('netz', 'Der Host ist nicht erreichbar.')
    }
    const daten = (await antwort.json().catch(() => undefined)) as
      | { readonly ok?: boolean; readonly value?: unknown; readonly error?: { readonly code?: string; readonly message?: string } }
      | undefined
    if (daten?.ok === true) return daten.value
    throw new TokenFehler(daten?.error?.code ?? `http-${antwort.status}`, daten?.error?.message ?? antwort.statusText)
  }

  const anbieterStatus = (id: string): Anbieter | undefined => anbieter.find((eintrag) => eintrag.id === id)

  /**
   * Zeichnet die Liste — und **nur** sie.
   *
   * Die Form bleibt stehen, damit ein Tippen im Feld nicht durch einen neuen
   * Baum ersetzt wird. Ein Neuaufbau nach jedem Klick wäre der Grund, warum
   * eine Eingabe „springt".
   */
  const zeichneListe = (): void => {
    liste.replaceChildren()
    for (const eintrag of anbieter) {
      const zeile = knoten(dokument, 'button', 'token-anbieter') as HTMLButtonElement
      zeile.type = 'button'
      zeile.dataset.anbieter = eintrag.id
      zeile.dataset.an = eintrag.id === gewaehlt ? '1' : '0'
      zeile.setAttribute('aria-pressed', eintrag.id === gewaehlt ? 'true' : 'false')
      zeile.title = eintrag.herkunft
      const name = knoten(dokument, 'span', 'token-anbieter-name', eintrag.name)
      const ref = knoten(dokument, 'span', 'token-anbieter-ref', eintrag.ref)
      const marke = knoten(dokument, 'span', 'token-anbieter-marke', eintrag.gesetzt ? t('token.status.set') : t('token.status.unset'))
      marke.dataset.gesetzt = eintrag.gesetzt ? '1' : '0'
      zeile.append(name, ref, marke)
      if (eintrag.gesetzt && eintrag.hinweis !== undefined) {
        zeile.appendChild(knoten(dokument, 'span', 'token-anbieter-hinweis', `${t('token.hint')} ${eintrag.hinweis}`))
      }
      zeile.addEventListener('click', () => {
        gewaehlt = eintrag.id
        zeichneListe()
        zeichneForm()
      })
      liste.appendChild(zeile)
    }
  }

  /** Die Form zeigt, für welchen Anbieter sie gilt — und ob es etwas zu entfernen gibt. */
  const zeichneForm = (): void => {
    const eintrag = gewaehlt === undefined ? undefined : anbieterStatus(gewaehlt)
    feldKopf.textContent =
      eintrag === undefined ? t('token.field') : t('token.fieldFor', { anbieter: eintrag.name })
    eingabe.disabled = eintrag === undefined || laeuft
    speichern.disabled = eintrag === undefined || laeuft
    entfernen.disabled = eintrag === undefined || !eintrag.gesetzt || laeuft
    eingabe.placeholder = eintrag?.gesetzt === true ? t('token.replacePlaceholder') : t('token.placeholder')
  }

  const ausFehler = (fehler: unknown): void => {
    if (fehler instanceof TokenFehler) sage(fehlerText(fehler.code, fehler.message), 'fehler')
    else sage(t('token.error.unknown'), 'fehler')
  }

  const lade = async (): Promise<void> => {
    laeuft = true
    sage(t('token.loading'))
    zeichneForm()
    try {
      const wert = (await ruf('GET')) as { readonly anbieter?: unknown }
      const rohe = Array.isArray(wert.anbieter) ? wert.anbieter : []
      const gelesen: Anbieter[] = []
      for (const eintrag of rohe) {
        if (typeof eintrag !== 'object' || eintrag === null) continue
        const daten = eintrag as Record<string, unknown>
        if (typeof daten.id !== 'string' || typeof daten.name !== 'string' || typeof daten.ref !== 'string') continue
        gelesen.push({
          id: daten.id,
          name: daten.name,
          ref: daten.ref,
          herkunft: typeof daten.herkunft === 'string' ? daten.herkunft : '',
          gesetzt: daten.gesetzt === true,
          ...(typeof daten.hinweis === 'string' ? { hinweis: daten.hinweis } : {}),
          ...(typeof daten.fassung === 'number' ? { fassung: daten.fassung } : {}),
          ...(typeof daten.aktualisiert === 'string' ? { aktualisiert: daten.aktualisiert } : {}),
        })
      }
      anbieter = gelesen
      if (gewaehlt === undefined || !anbieter.some((eintrag) => eintrag.id === gewaehlt)) {
        gewaehlt = anbieter.find((eintrag) => !eintrag.gesetzt)?.id ?? anbieter[0]?.id
      }
      laeuft = false
      zeichneListe()
      zeichneForm()
      const gesetzt = anbieter.filter((eintrag) => eintrag.gesetzt).length
      sage(
        anbieter.length === 0
          ? t('token.empty')
          : t('token.summary', { gesetzt: String(gesetzt), gesamt: String(anbieter.length) }),
      )
    } catch (fehler) {
      laeuft = false
      zeichneForm()
      ausFehler(fehler)
      if (fehler instanceof TokenFehler && (fehler.code === 'nicht-angemeldet' || fehler.code === 'csrf-fehlt')) {
        const link = dokument.createElement('a')
        link.className = 'token-anmelden'
        link.textContent = t('token.signin')
        link.href = '/anmeldung/'
        liste.replaceChildren(link)
      }
    }
  }

  form.addEventListener('submit', (ereignis) => {
    ereignis.preventDefault()
    if (laeuft || gewaehlt === undefined) return
    const token = eingabe.value.trim()
    if (token === '') {
      sage(t('token.error.empty'), 'fehler')
      eingabe.focus()
      return
    }
    void (async () => {
      laeuft = true
      zeichneForm()
      sage(t('token.saving'))
      try {
        const wert = (await ruf('POST', { provider: gewaehlt, token })) as { readonly anbieter?: Anbieter }
        // **Der Wert verschwindet aus dem Feld, sobald der Host ihn hat.** Ein
        // stehengebliebener Klartext wäre die zweite Kopie, die niemand braucht.
        eingabe.value = ''
        if (wert.anbieter !== undefined) {
          anbieter = anbieter.map((eintrag) => (eintrag.id === wert.anbieter?.id ? { ...eintrag, ...wert.anbieter } : eintrag))
        }
        laeuft = false
        zeichneListe()
        zeichneForm()
        const hinweis = wert.anbieter?.hinweis
        sage(hinweis === undefined ? t('token.saved') : `${t('token.saved')} — ${t('token.hint')} ${hinweis}`, 'gut')
        eingabe.focus()
      } catch (fehler) {
        laeuft = false
        zeichneForm()
        ausFehler(fehler)
      }
    })()
  })

  entfernen.addEventListener('click', () => {
    if (laeuft || gewaehlt === undefined) return
    const id = gewaehlt
    void (async () => {
      laeuft = true
      zeichneForm()
      sage(t('token.removing'))
      try {
        await ruf('DELETE', undefined, `/api/pmh/token?provider=${encodeURIComponent(id)}`)
        anbieter = anbieter.map((eintrag) => (eintrag.id === id ? { ...eintrag, gesetzt: false, hinweis: undefined, fassung: undefined, aktualisiert: undefined } : eintrag))
        laeuft = false
        zeichneListe()
        zeichneForm()
        sage(t('token.removed'), 'gut')
      } catch (fehler) {
        laeuft = false
        zeichneForm()
        ausFehler(fehler)
      }
    })()
  })

  void lade()
}
