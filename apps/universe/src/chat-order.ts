/**
 * **Der Auftrag für den Chat** — als Panel im Prototyp, nicht in einer Datei, die niemand findet.
 *
 * **Warum das ein Plugin ist und kein Dokument.** Der Betreiber hat die Chat-Implementierung
 * herausgenommen und einem anderen Agenten übergeben: „entferne mal den chat implementierung
 * stattdessen das es quasi nur das öffnen ux, gui existiert … stattdessen beschreibe es was
 * vorhaben ist funktion und projekt stack".
 *
 * Eine Beschreibung, die nur in einer Datei steht, findet man nicht, wenn man den Prototyp öffnet.
 * Hier ist sie **im Programm**: als Panel, das man aufklappt, und als Befehl `order`, den man tippt.
 * Damit ist die Übergabe Teil der Oberfläche, die übergeben wird.
 *
 * **Der Inhalt ist gegliedert wie eine Übergabe:** Vorhaben, Funktion, Projekt-Stack, offene
 * Entscheidungen. Und ausdrücklich das, was **noch nicht entschieden** ist — sonst hält der nächste
 * Agent eine Vermutung für eine Vorgabe.
 */
import type { Plugin } from './plugins'

export interface OrderEnv {
  readonly t: () => { readonly t: (key: string, vars?: Readonly<Record<string, string | number>>) => string }
}

/**
 * Der Text, den Panel und Befehl zeigen.
 *
 * **Als eine Liste von Abschnitten und keinen grossen Zeichenkettenblock.** So lässt sich ein
 * Abschnitt ändern, ohne den ganzen Text neu zu setzen — und der Test kann prüfen, dass **jeder**
 * der vier Teile da ist, statt nur „irgendetwas steht drin".
 */
export function orderSections(t: (key: string) => string): readonly { readonly title: string; readonly lines: readonly string[] }[] {
  return [
    { title: t('order.task.title'), lines: t('order.task.body').split('\n') },
    { title: t('order.function.title'), lines: t('order.function.body').split('\n') },
    { title: t('order.stack.title'), lines: t('order.stack.body').split('\n') },
    { title: t('order.open.title'), lines: t('order.open.body').split('\n') },
  ]
}

/** Baut das Panel „Auftrag" — es zeigt denselben Text wie der Befehl `order`. */
export function orderPlugin(env: OrderEnv): Plugin {
  const t = (key: string): string => env.t().t(key)
  return {
    id: 'chat-order',
    name: 'Auftrag: Chat',
    version: '0.1.0',
    description: 'Beschreibt das Vorhaben, die Funktion und den Projekt-Stack des Chat-Modus — die Übergabe an den nächsten Agenten.',
    // **Abgesteckt, nicht offen.** Der Auftrag ist ein Nachschlagewerk, kein Fenster, das man
    // dauerhaft offen hat. Wer ihn sucht, holt ihn über die Leiste unten oder tippt `order`.
    panel: {
      title: () => t('panel.order'),
      zone: 'closed',
      size: 380,
      render: (host) => {
        host.replaceChildren()
        host.classList.add('auftrag')
        const abschnitte = orderSections(t)

        /*
         * **Der Kopf sagt, was das hier ist, bevor die Abschnitte beginnen.**
         *
         * Vorher begann das Panel mit „Vorhaben" — eine Überschrift ohne Rahmen. Wer das Fenster
         * öffnete, sah eine Textwand und wusste nicht, ob er eine Aufgabe oder eine Notiz vor sich
         * hat. Jetzt steht oben: Übergabe, ein Satz, und die Zahl der offenen Entscheidungen.
         */
        const kopf = document.createElement('header')
        kopf.className = 'auftrag-kopf'
        const marke = document.createElement('span')
        marke.className = 'auftrag-marke'
        marke.textContent = 'Übergabe'
        const titel = document.createElement('h3')
        titel.className = 'auftrag-titel'
        titel.textContent = 'Ein Chat ohne Harness'
        const lead = document.createElement('p')
        lead.className = 'auftrag-lead'
        lead.textContent =
          'Der Chat-Modus übernimmt die Form des DeepSeek-Harness — und läuft, bevor der Harness angeschlossen ist.'
        const lage = document.createElement('div')
        lage.className = 'auftrag-lage'
        const abschnitteZahl = document.createElement('span')
        abschnitteZahl.textContent = `${String(abschnitte.length)} Abschnitte`
        const offene = abschnitte[3]?.lines.filter((zeile) => zeile.trim() !== '').length ?? 0
        const offeneZahl = document.createElement('span')
        offeneZahl.className = 'auftrag-lage-offen'
        offeneZahl.textContent = `${String(offene)} offene Entscheidungen`
        lage.append(abschnitteZahl, offeneZahl)
        kopf.append(marke, titel, lead, lage)
        host.appendChild(kopf)

        for (const [index, abschnitt] of abschnitte.entries()) {
          const box = document.createElement('section')
          box.className = 'auftrag-teil'
          const offen = index === 3
          if (offen) box.dataset.offen = '1'

          const kopfzeile = document.createElement('div')
          kopfzeile.className = 'auftrag-teil-kopf'
          const nummer = document.createElement('span')
          nummer.className = 'auftrag-nummer'
          nummer.textContent = String(index + 1).padStart(2, '0')
          const teilTitel = document.createElement('h4')
          teilTitel.className = 'auftrag-teil-titel'
          teilTitel.textContent = abschnitt.title
          kopfzeile.append(nummer, teilTitel)
          if (offen) {
            const markeOffen = document.createElement('span')
            markeOffen.className = 'auftrag-status'
            markeOffen.textContent = 'zu entscheiden'
            kopfzeile.appendChild(markeOffen)
          }
          box.appendChild(kopfzeile)

          const inhalt = document.createElement('div')
          inhalt.className = 'auftrag-inhalt'
          /*
           * **Eine Zeile mit `-` ist eine Aufzählung, eine ohne ist ein Absatz.**
           *
           * Die Grenze wird hier gezogen und nicht im Text: derselbe Text steht auch hinter dem
           * Befehl `order`, und dort ist `-` dasselbe Zeichen. Ein zweites Format für dieselbe
           * Aussage wäre eine zweite Wahrheit über den Auftrag.
           */
          let liste: HTMLUListElement | undefined
          for (const zeile of abschnitt.lines) {
            const text = zeile.trim()
            if (text === '') continue
            if (text.startsWith('- ')) {
              if (liste === undefined) {
                liste = document.createElement('ul')
                liste.className = 'auftrag-liste'
                inhalt.appendChild(liste)
              }
              const punkt = document.createElement('li')
              punkt.textContent = text.slice(2)
              liste.appendChild(punkt)
            } else {
              liste = undefined
              const absatz = document.createElement('p')
              absatz.className = 'auftrag-absatz'
              absatz.textContent = text
              inhalt.appendChild(absatz)
            }
          }
          box.appendChild(inhalt)
          host.appendChild(box)
        }

        const fuss = document.createElement('p')
        fuss.className = 'auftrag-fuss'
        fuss.textContent = 'Weitergabe: `order` im Terminal zeigt denselben Text.'
        host.appendChild(fuss)
      },
    },
    commands: [
      {
        name: 'order',
        help: 'zeigt den Auftrag für den Chat-Modus',
        run: () => {
          const zeilen: string[] = []
          for (const abschnitt of orderSections(t)) {
            zeilen.push(`${abschnitt.title}`)
            for (const zeile of abschnitt.lines) if (zeile.trim() !== '') zeilen.push(`  ${zeile}`)
            zeilen.push('')
          }
          return zeilen
        },
      },
    ],
    healthChecks: [
      () => ({
        name: 'chat-order:vollständig',
        // **Eine Prüfung mit Inhalt.** „Der Auftrag ist da" wäre wertlos; geprüft wird, dass alle
        // vier Teile **und** ihre Zeilen existieren — sonst wäre eine leere Vorlage „in Ordnung".
        ok: orderSections(t).every((a) => a.lines.filter((l) => l.trim() !== '').length > 0),
        message: `Auftrag mit ${orderSections(t).length} Teilen`,
        details: { Teile: orderSections(t).map((a) => a.title).join(', ') },
      }),
    ],
  }
}
