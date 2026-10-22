/**
 * Knoten-Hälfte des Graphify-Plugins.
 *
 * Die Routen liegen im Provider; hier werden sie als Cordis-Plugin sichtbar.
 *
 * @module @prometheus-harness/graphify
 */

import z from '@deepseek-ai/schemastery'

export { apply, inject, name, default } from '@prometheus-harness/world-graphify'

/**
 * Die Anzeige des Panels — **eingestellt wird sie in den Plugin-Einstellungen**.
 *
 * ## Warum die Anzeige ein Feld des Host-Eintrags ist
 *
 * Die Oberfläche kennt zwei Orte, an denen ein Plugin erscheinen kann, und beide sind
 * **Anmeldungen** des Plugins selbst, keine Vorrechte:
 *
 * | Ort | Anmeldung | Was der Nutzer sieht |
 * |---|---|---|
 * | Seitenleiste | `sidebar.panellist` | Zeile links, neben Chat und Terminal |
 * | Plugins-Liste | `plugins.item` | Karte in der Gruppe „Offiziell" mit Kurzfassung und eigener Seite |
 *
 * Welchen der beiden ein Plugin nimmt, war bisher **im Code entschieden** (`order: 12`, always
 * `sidebar.panellist`). Hier steht es jetzt als Feld: der Eintrag `pmh-graphify` trägt es in seiner
 * Konfiguration, die Einstellungsseite zeigt es, und die Browser-Hälfte liest es über
 * `ctx.configForms.get('pmh-graphify')`.
 *
 * ## Warum `Config` auf der Host-Hälfte steht, obwohl die Anzeige im Browser passiert
 *
 * Die Einstellungsseite eines Eintrags speist sich aus dessen **Config-Schema** — es gibt keinen
 * zweiten Anmeldeweg für Einstellungen. Ein Feld, das nur der Browser kennt, wäre in keiner
 * Einstellungsseite sichtbar. Der Host liest die Werte nicht; er hält sie nur.
 *
 * **Vorgabe `sidebar`:** das ist das Verhalten von vorher. Ein Bestand soll sich durch das
 * Hinzufügen eines Feldes nicht ändern.
 *
 * **Kein `guide`.** Dieses Plugin meldet keine Start-Kachel an; ein Feld dafür wäre eine
 * Einstellung ohne Wirkung.
 */
export const Config = z.object({
  /**
   * Wo das Panel erscheint.
   *
   * `both` meldet beide Orte an — dieselbe Fläche an zwei Stellen, nicht zwei Flächen.
   */
  surface: z
    .union([z.const('sidebar'), z.const('plugins'), z.const('both'), z.const('none')])
    .default('sidebar')
    .description('sidebar · plugins · both · none'),
  /** Die Stelle in der Leiste bzw. in der Plugin-Liste. Kleinere Zahl steht weiter oben. */
  order: z.natural().max(999).default(12).description('Platz in der Liste, kleinere Zahl zuerst'),
  /** Eine eigene Beschriftung. Leer heißt: der Text aus dem Sprachpaket. */
  label: z.string().default('').description('leer = Beschriftung aus dem Sprachpaket'),
  /**
   * Wie das Panel aufgeht.
   *
   * `split` zeigt Liste, Graph und Knotendaten nebeneinander; `graph` nur Graph und Daten;
   * `list` nur Liste und Daten. Die Vorgabe `split` zeigt den gezeichneten Graphen, ohne die
   * Suche zu verstecken — vorher gab es keinen Graphen, also ist jede der drei Flächen neu.
   */
  view: z
    .union([z.const('split'), z.const('graph'), z.const('list')])
    .default('split')
    .description('split · graph · list — welche Flächen aufgehen'),
  /**
   * Die Ebene, mit der das Panel aufgeht.
   *
   * `gesamt` zeigt eine Stichprobe über die größten Gruppen — die Landschaft.
   * `gruppe` alle Knoten einer Gruppe, `nachbarschaft` nur die Umgebung eines
   * Knotens. Die Vorgabe ist `gesamt`, weil der erste Blick sonst an einem
   * einzelnen Hub hängt und der Graph kleiner wirkt, als er ist.
   */
  level: z
    .union([z.const('gesamt'), z.const('gruppe'), z.const('nachbarschaft')])
    .default('gesamt')
    .description('gesamt · gruppe · nachbarschaft — die Ebene beim Öffnen'),
  /** Wie viele Schritte der Nachbarschaft gezeichnet werden. */
  depth: z.natural().min(1).max(3).default(2).description('Nachbarschaft um den Knoten: 1 bis 3'),
  /** Wie viele Knoten höchstens gezeichnet werden. */
  limit: z.natural().min(20).max(400).default(160).description('Höchstzahl gezeichneter Knoten: 20 bis 400'),
  /** Namen an den Knoten. */
  labels: z.boolean().default(true).description('Namen an den Knoten zeichnen'),
  /** Wonach die Knoten gefärbt sind. */
  colour: z
    .union([z.const('community'), z.const('kind')])
    .default('community')
    .description('community · kind — Farbe nach Gruppe oder nach Art'),
  /** Ob das Layout weiterrechnet, wenn es angefaßt wird. */
  motion: z.boolean().default(true).description('Layout beim Öffnen und Ziehen weiterrechnen'),
  /** Wo die Knotendaten stehen. */
  inspector: z
    .union([z.const('right'), z.const('below'), z.const('off')])
    .default('right')
    .description('right · below · off — wohin die Knotendaten kommen'),
})
