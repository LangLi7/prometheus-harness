/**
 * Die Texte des Panels — Deutsch und Englisch, wie die Oberfläche sie kennt.
 *
 * **Warum kein eigener Sprachdienst.** Die Texte gehören zu diesem Plugin; der
 * Kern bindet sie über `ctx.locale.register` an den Namensraum {@link NS}. Alles
 * andere (Umschalten der Sprache, Rückfall) macht der Kern.
 *
 * @module @prometheus-harness/client-tabs/locales
 */

/** Der Namensraum — er steht am Panel, am Sidebar-Eintrag und an den Texten. */
export const NS = 'tabs'

/** Deutsch. */
export const DE = {
  panel: 'Workspaces',
  title: 'Workspaces',
  lead: 'Jeder Arbeitsbereich mit seinen Sitzungen. Ein Klick öffnet den Chat hier, Strg- oder Mittelklick öffnet ihn in einem neuen Tab.',
  empty: 'Noch kein Arbeitsbereich. Lege einen in der Seitenleiste an.',
  noSessions: 'Noch keine Sitzung.',
  newChat: 'Neuer Chat',
  openTab: 'In neuem Tab öffnen',
  openHere: 'Hier öffnen',
  blank: 'Neue Sitzung',
}

/** Englisch. */
export const EN: typeof DE = {
  panel: 'Workspaces',
  title: 'Workspaces',
  lead: 'Every workspace with its sessions. A click opens the chat here; Ctrl-click or middle-click opens it in a new tab.',
  empty: 'No workspace yet. Add one from the sidebar.',
  noSessions: 'No session yet.',
  newChat: 'New chat',
  openTab: 'Open in new tab',
  openHere: 'Open here',
  blank: 'New session',
}
