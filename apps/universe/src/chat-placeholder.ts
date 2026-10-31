/**
 * **Der Chat-Platzhalter — bewusst leer.**
 *
 * **Was hier steht und warum so wenig.** Der Betreiber hat die Chat-Implementierung aus diesem
 * Prototyp **herausgenommen**, um sie einem anderen Agenten zu übergeben: „entferne mal den chat
 * implementierung stattdessen das es quasi nur das öffnen ux, gui existiert. quasi fast kein spur
 * stattdessen beschreibe es was vorhaben ist funktion und projekt stack".
 *
 * **Was bleibt — und das ist Absicht:**
 *
 *   - der **Weg dorthin**: die Dynamic Island, der Eintrag `Chat`, `view chat` im Terminal
 *   - die **Fläche**: `#screen-chat` mit Kopfzeile und einem Hinweis
 *   - der **Rahmen**: Design-System, Tokens, Übersetzungen, Einstellungen
 *   - die **Beschreibung**: was gebaut werden soll, in `chat-auftrag.md` und im Panel „Auftrag"
 *
 * **Was nicht mehr da ist:** der Verlauf, die Blasen, der Composer, die Seitenleiste mit Orten, die
 * Beispieldaten. Das ist die Arbeit des nächsten Agenten — und ein halbfertiger Aufbau wäre dabei
 * hinderlicher als gar keiner: er sieht aus wie eine Vorgabe, ist aber keine.
 *
 * **Warum überhaupt ein Platzhalter und kein leerer Bildschirm.** Ein leerer Bildschirm ist von
 * einem Fehler nicht zu unterscheiden. Der Hinweis sagt: hier fehlt nichts, hier kommt etwas hin —
 * und wo es beschrieben steht.
 */
import type { Message } from './chat-types'

export type { Message } from './chat-types'

export interface ChatCallbacks {
  readonly onOpenUniverse: () => void
  readonly tr: (key: string, vars?: Readonly<Record<string, string | number>>) => string
  readonly locale: string
}

/**
 * Baut den **Platzhalter**.
 *
 * Rückgabe ist die Eingabefunktion, damit die Hülle ihre Schnittstelle behält: sie muss sich nicht
 * ändern, wenn der nächste Agent den Chat füllt. Eine Signatur, die morgen noch stimmt, ist das
 * Nützlichste, was ein Platzhalter beitragen kann.
 */
export function mountChat(host: HTMLElement, callbacks: ChatCallbacks): (message: Message) => void {
  const { tr } = callbacks
  host.replaceChildren()
  host.className = 'chat-platzhalter'

  const kopf = document.createElement('div')
  kopf.className = 'top'

  const titel = document.createElement('h1')
  titel.textContent = 'Prometheus'
  const spacer = document.createElement('span')
  spacer.className = 'spacer'
  const meta = document.createElement('span')
  meta.className = 'meta'
  meta.id = 'chatMeta'
  meta.textContent = tr('chat.offline')
  kopf.append(titel, spacer, meta)
  host.appendChild(kopf)

  const flaeche = document.createElement('div')
  flaeche.className = 'platzhalter-flaeche'

  const karte = document.createElement('div')
  karte.className = 'platzhalter-karte'

  const ueberschrift = document.createElement('b')
  ueberschrift.textContent = tr('chat.placeholderTitle')

  const text = document.createElement('p')
  text.className = 'platzhalter-text'
  text.textContent = tr('chat.placeholderText')

  const ort = document.createElement('p')
  ort.className = 'platzhalter-hinweis'
  ort.textContent = tr('chat.placeholderWhere')

  const weiter = document.createElement('button')
  weiter.type = 'button'
  weiter.className = 'set-knopf'
  weiter.textContent = tr('chat.openWorld')
  weiter.addEventListener('click', callbacks.onOpenUniverse)

  // **Ein zweiter Weg nach draussen: der Auftrag.** Ein Platzhalter, der nur sagt „hier kommt
  // etwas hin", laesst einen stehen. Der Befehl `order` zeigt, **was** hier hinkommt — und ein
  // Knopf, der ihn nennt, ist die kuerzeste Verbindung dorthin.
  const auftrag = document.createElement('code')
  auftrag.className = 'platzhalter-befehl'
  auftrag.textContent = 'order'

  karte.append(ueberschrift, text, ort, weiter, auftrag)
  flaeche.appendChild(karte)
  host.appendChild(flaeche)

  // Die Signatur bleibt: die Hülle darf Nachrichten schicken, auch wenn sie noch niemand anzeigt.
  return () => undefined
}
