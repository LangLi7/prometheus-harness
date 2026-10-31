/**
 * Sprachpaket **Deutsch**.
 *
 * Reine Daten — kein Code, keine Verzweigung, kein Zugriff auf die Oberflaeche. Wer hier etwas
 * aendert, aendert nur, wie es klingt.
 *
 * **Warum flache Schluessel.** `'chat.send': 'Senden'` ist im Terminal lesbar (`lang missing`
 * zeigt genau diese Namen), in einem Diff Zeile fuer Zeile vergleichbar und ohne Laufzeit-
 * Rekursion. Verschachtelung waere eleganter zu schreiben und schlechter zu pruefen.
 */
import type { LocalePack } from '../i18n'

export const de: LocalePack = {
  id: 'de',
  label: 'Deutsch',
  english: 'German',
  messages: {
    // ── Die Insel ────────────────────────────────────────────────────────────────────────
    /*
     * **Ohne Zeichen im Text — die Zeichen sind gezeichnet.**
     *
     * Hier stand `'# orte'`, `'⌥ objekte'`, `'◉ ansichten'`, `'⚙ einstellungen'`, `'▤ panels'`: das
     * Zeichen war **Teil der Beschriftung**. Das war doppelt falsch. Erstens ist ein Schriftzeichen
     * auf dem Rechner des Betrachters ein anderes Bild als hier (der Betreiber: *„emoji sieht schon
     * scheisse aus und umprofessionell"*), und zweitens gehört ein Zeichen **nicht in einen Satz**:
     * ein Übersetzer übersetzt Wörter, keine Bilder, und ein Vorleser liest „Raute orte" vor.
     *
     * Das Zeichen steht jetzt im Aufbau der Insel (`ISLAND_GROUPS.icon`, gezeichnet in
     * `@prometheus-harness/icons`), der Text ist reiner Text.
     */
    'island.open': 'Übersicht öffnen',
    'island.close': 'schliessen',
    'island.group.places': 'orte',
    'island.group.objects': 'objekte',
    'island.group.views': 'ansichten',
    'island.group.settings': 'einstellungen',
    /*
     * **Die Panels sind eine Gruppe der Insel — nicht eine Leiste am unteren Rand.**
     *
     * Betreiber: „sollten wir das nicht in dynamic illand implementieren als ein punkt oder Button".
     * Die Insel ist die **einzige** Navigation (Entwurf: „Eine Seitenleiste gibt es nicht"), und die
     * zwölf Knöpfe quer über den Bildschirm waren ein zweiter Weg für dieselbe Sache.
     */
    'island.group.panels': 'panels',
    'island.panels.count': '{offen} von {gesamt} offen',
    /*
     * **Die drei Gruppen der Panelliste.**
     *
     * Die Liste war vierzehn Zeilen ohne Ordnung — und zwei Namen doppelt. Die Gruppen sagen, wozu
     * ein Fenster gehört: Ansicht, System, Werkzeuge. „Weitere" ist der ehrliche Rest für Panels,
     * die ein späteres Plugin beisteuert, ohne hier eingetragen zu sein.
     */
    'island.panels.group.view': 'Ansicht',
    'island.panels.group.system': 'System',
    'island.panels.group.tools': 'Werkzeuge',
    'island.panels.group.more': 'Weitere',
    /* Die Zeile der Ansichts-Leiste — „Ansicht" wäre unter der Gruppe „Ansicht" ein Doppler. */
    'island.panel.viewbar': 'Ansichtsleiste',
    /*
     * **Die Ansichts-Leiste — Striche statt Knöpfe.**
     *
     * Vier Sätze, und jeder hat eine Aufgabe. `out`/`in`/`show` sind mit den „−"/„+"-Knöpfen
     * **entfallen**: die Striche **sind** die Bedienung (Klick, Rad, Ziehen), und ein Schlüssel ohne
     * Benutzer ist eine Zeile, die man später für einen Fehler hält — der Test `locale-keys` meldet ihn
     * zu Recht.
     */
    'view.controls.title': 'Ansicht',
    'view.controls.hide': 'Leiste ausblenden',
    /*
     * **Der Zoomabstand steht in Klammern hinter der echten Größe.**
     *
     * Er ist die Angabe über die **Kamera**, nicht über die Welt — deshalb ein eigenes Wort und nicht
     * dieselbe Zeile. „100 000 Lj · Zoom 983,0 k" heisst: diese Stufe ist 100 000 Lichtjahre gross, und
     * die Kamera steht 983 000 Einheiten weit weg.
     *
     * **`view.controls.distance` ist gelöscht, nicht geduldet.** Er trug „{wert} Einheiten" und wurde
     * nach der Umstellung auf die echte Größe **von niemandem mehr aufgerufen** — der Test
     * (`locale-keys`) hat genau das gemeldet. Ein Schlüssel, den niemand benutzt, ist keine Reserve,
     * sondern eine zweite Wahrheit über dieselbe Sache.
     */
    'view.controls.zoom': 'Zoom {wert}',
    'island.panel.open': 'offen',
    'island.panel.closed': 'abgesteckt',
    'island.item.solar': 'Sonnensystem',
    'island.item.stack': 'projekt-stack',
    'island.item.prometheus': 'prometheus',
    'island.item.overview': 'kosmischer Überblick',
    'island.item.sun': 'Sonne',
    'island.item.earth': 'Erde',
    'island.item.appcss': 'app.css',
    'island.action.world': 'Universe',
    'island.action.chat': 'Chat',
    /*
     * **Und derselbe Unterschied wie an der Marke** (`hud.toHarness`): der Eintrag der Insel heisst
     * „Prometheus-Chat", wenn er **dorthin** fuehrt — sonst bleibt es bei „Chat" fuer die
     * Chat-Ansicht dieses Prototyps. Der Betreiber: *„kannst du noch den neue
     * implementierungsverknuepfung auch hier machen: ◉ ansichten · ▤ Chat · ⟲ Ansicht
     * zuruecksetzen"*.
     */
    'island.action.harness': 'Prometheus-Chat',
    'island.action.reset': 'Ansicht zurücksetzen',
    'island.action.settings': 'Einstellungen',
    'island.badge.star': 'stern',
    'island.badge.planet': 'planet',
    'island.badge.live': 'live',

    // ── Die Statuszeile ──────────────────────────────────────────────────────────────────
    /*
     * **Drei Teile statt einer Zeile — damit nur die Zahl sich ändert.**
     *
     * Der Betreiber: „**die fps zahlen sollte eigentlich einzeln aktualisieren ohne den text**". Hier
     * stand **ein** Satz (`Ebene {level} · {distance} · {fps} fps`), der alle 700 ms **ganz** neu
     * geschrieben wurde. Ändert sich die Bildrate, wird damit auch der Text daneben neu gesetzt —
     * sichtbar als Zittern, obwohl sich „Ebene Sonnensystem" nie ändert.
     *
     * Jetzt sind es drei Stücke. Ebene und Abstand werden **nur bei Änderung** geschrieben, die
     * Bildrate bekommt ein eigenes Feld mit **fester Breite** (siehe `main.ts`), damit die Zeile beim
     * Wechsel von 60 auf 280 fps nicht springt.
     */
    'hud.level': 'Ebene {level}',
    /*
     * **Die echte Größe — der Grund, warum hier eine Einheit steht und nicht nur eine Zahl.**
     *
     * Betreiber: „**ändere masseinheit also einheit in lichtjahre oder so**". Der Wert kommt aus
     * `echteGroesse()` in `universe.ts` und trägt seine Einheit schon mit sich — deshalb steht hier nur
     * das Trennzeichen davor. Eine zweite Einheit im Satz wäre eine zweite Wahrheit.
     */
    'hud.size': '· {size}',
    'hud.distance': 'Zoom {distance}',
    'hud.fps': '· {fps} fps',
    /*
     * **Zwei Saetze fuer dieselbe Marke — weil zwei verschiedene Dinge gemeint sind** (siehe
     * `hudMarke` in `main.ts`). Der Satz ist **kein** Etikett der Kopfzeile, sondern die Beschriftung
     * eines Bedienelements: er steht als `aria-label` und (mit der Adresse) als Kurzhinweis an der
     * Marke. Wer ihn liest, soll wissen, was ein Klick tut — „PROMETHEUS" allein sagt das nicht.
     *
     * `hud.toChat` gilt, wenn die Welt **direkt** aufgerufen wurde: dann fuehrt die Marke in die
     * Chat-Ansicht dieses Prototyps (den Platzhalter).
     *
     * `hud.toHarness` gilt, wenn ein Chat in Reichweite ist — die Welt laeuft auf einem Server, also
     * liegt der Harness-Chat an der Wurzel **derselben** Herkunft (`chatZiel` in `main.ts`, `chatUrl`
     * in `entry.ts`): dann fuehrt die Marke **dorthin**. Der Betreiber hat genau diesen Unterschied
     * gemeldet: er klickte die Marke und landete im Platzhalter, obwohl er „den standard Prometheus
     * Chat" erwartet hatte.
     */
    'hud.toChat': 'Zum Chat wechseln',
    'hud.toHarness': 'Zum Prometheus-Chat wechseln',

    // ── Panels ───────────────────────────────────────────────────────────────────────────
    'panel.search': 'Suche',
    'panel.ruler': 'Achsen',
    'panel.status': 'Zustand',
    'panel.room': 'Raum',
    'panel.found': 'Sichtbare',
    'panel.settings': 'Einstellungen',
    'panel.language': 'Sprache',
    'panel.debug': 'Terminal',
    /*
     * **Die Namen, die vorher doppelt waren.**
     *
     * „Zustand" stand zweimal in der Panelliste (das Zustands-Panel und die Gesundheitsprüfung),
     * „Einstellungen" ebenfalls (der Dialog-Eintrag und das Einstellungs-Panel). Wer die Liste las,
     * konnte nicht wissen, welches Fenster er bekommt. Jetzt gibt es **einen** Einstellungs-Eintrag
     * (`panel.settings`, das Panel), die Prüfung heißt `panel.health`, das Gerät `panel.device`.
     */
    'panel.health': 'Systemprüfung',
    'panel.device': 'Gerät',
    /*
     * **Der einzige Satz der Rangliste, der der Oberfläche gehört.**
     *
     * Der Reitertitel steht in der Leiste neben „Suche", „Zustand" und „Terminal" — also wird er
     * übersetzt. Der **Inhalt** des Fensters bleibt deutsch: er kommt vom Dienst (`gruende[]`,
     * `ohneEmpfehlung`, `hinweise`), und eine Übersetzung dafür gibt es nicht. Zwei Sprachen in
     * einem Fenster wären schlechter zu lesen als eine — die Begründung steht in
     * `src/ai-rangliste.ts`.
     */
    'panel.ranking': 'KI-Rangliste',
    'panel.token': 'API-Token',

    // ── API-Token (Panel) ────────────────────────────────────────────────────────────────
    'token.mark': 'Zugang',
    'token.title': 'Deine Schlüssel',
    'token.lead':
      'Je Konto, verschlüsselt auf dem Host. Nach dem Speichern zeigt die Ansicht nur einen Hinweis — nie den Schlüssel.',
    'token.loading': 'Lese die Anbieter …',
    'token.empty': 'Der Host nennt keinen Anbieter.',
    'token.summary': '{gesetzt} von {gesamt} gesetzt',
    'token.field': 'Schlüssel',
    'token.fieldFor': 'Schlüssel für {anbieter}',
    'token.placeholder': 'Schlüssel einfügen …',
    'token.replacePlaceholder': 'Neuen Schlüssel einsetzen …',
    'token.foot':
      'Der Wert geht nur an den Host. Er liegt verschlüsselt in user_secrets und erscheint nie wieder im Browser.',
    'token.save': 'Speichern',
    'token.remove': 'Entfernen',
    'token.saving': 'Speichere …',
    'token.saved': 'Gespeichert',
    'token.removing': 'Entferne …',
    'token.removed': 'Entfernt',
    'token.hint': 'Hinweis',
    'token.status.set': 'gesetzt',
    'token.status.unset': 'nicht gesetzt',
    'token.signin': 'Zur Anmeldung',
    'token.error.auth': 'Nicht angemeldet — bitte anmelden.',
    'token.error.master':
      'Kein Hauptschlüssel eingerichtet. Einmal `bun scripts/schluessel.mjs` ausführen und den Host neu starten.',
    'token.error.csrf': 'Die Sitzung ist nicht mehr gültig — bitte neu anmelden.',
    'token.error.store': 'Der Host konnte den Schlüssel nicht lesen oder schreiben.',
    'token.error.net': 'Der Host ist nicht erreichbar.',
    'token.error.empty': 'Bitte einen Schlüssel eingeben.',
    'token.error.unknown': 'Unbekannter Fehler.',
    'token.command.help': 'Token-Panel geöffnet.',

    // ── Suchpanel ────────────────────────────────────────────────────────────────────────
    'search.hint': 'Jedes Objekt hat einen Namen. {n} Objekte in diesem Universum — tippe einen ein, die Kamera fährt hin.',
    'search.placeholder': 'z. B. web · Sonne · main.ts',
    'search.all': '{n} Objekte im Universum.',
    'settings.hint': 'Drehgeschwindigkeit, Zoom, Achsen, Sprache — alles ist eine Einstellung, keine Konstante im Code.',
    'language.hint': 'Jede Sprache ist ein eigenes Paket. Der Wechsel wirkt sofort und wird gemerkt.',

    // ── Achsenpanel ──────────────────────────────────────────────────────────────────────
    'axes.caption': 'ACHSEN · ZIEHEN',
    'axes.hint':
      'Rechtshändig: x rechts, y oben, z zum Betrachter. Zieh einen Endpunkt, um die Welt um die beiden anderen Achsen zu drehen.',
    'axes.level': 'Bezugsebene',
    'axes.distance': 'Abstand',
    'axes.focus': 'Fokus',
    'axes.unit': 'Einheit',

    // ── Zustands- und Raumpanel ──────────────────────────────────────────────────────────
    'status.hint':
      'Prototyp **ohne Harness-Anbindung**. Alles außer Suche, Zustand und Raum ist ein **Plugin** — absteckbar über die Leiste unten.',
    'room.hint':
      'Raum „{room}": eigene Instanz, kein Filter in einer gemeinsamen Datenbank. Gespeichert unter {key}. Im Prototyp ist der Raum nur ein Name aus der Adresse (?room=…) — kein Sicherheitsmerkmal.',
    'mobile.note': 'Kleiner Bildschirm — die Welt braucht Platz. Hier läuft der Chat.',
    'mobile.switch': 'Zum Chat',

    // ── Docking ──────────────────────────────────────────────────────────────────────────
    'dock.detached': 'abgesteckt:',
    'dock.grab': 'ziehen = andocken',
    'dock.detach': 'abstecken',

    // ── Objekte in der Fläche ────────────────────────────────────────────────────────────
    /*
     * **Zwei Sätze, und beide sind Saetze** — sie gehören deshalb ins Sprachpaket und nicht in den
     * Code. Die Meldung erscheint nur, solange eine Datei über der Fläche gehalten wird (siehe
     * `canvas-view.ts`), und der Titel am „✕" sagt, was der Knopf tut.
     */
    'canvas.drop': 'Datei hier ablegen',
    'canvas.remove': 'aus der Fläche nehmen',

    // ── Chat ─────────────────────────────────────────────────────────────────────────────
    'chat.offline': 'Chat-Modus — noch nicht gebaut',
    'chat.openWorld': 'Zur Welt',
    'chat.placeholderTitle': 'Hier entsteht der Chat',
    'chat.placeholderText':
      'Der Aufbau ist diesem Prototyp bewusst entnommen und als Auftrag beschrieben. Was bleibt, ist der Weg dorthin: die Insel, der Eintrag Chat und view chat im Terminal.',
    'chat.placeholderWhere': 'Der Auftrag steht im Panel Auftrag und hinter dem Befehl order.',
    'panel.order': 'Auftrag: Chat',
    'order.task.title': 'Vorhaben',
    'order.task.body':
      'Ein Chat-Modus, der die Form des DeepSeek-Harness-Web-GUI hat und ohne Harness läuft.\nDer Betreiber: das Layout des Harness, die Struktur des Harness, 1:1 als Vorlage.\nBeim Anschluss des Harness wird aus dem Prototyp die echte Oberfläche.',
    'order.function.title': 'Funktion',
    'order.function.body':
      '- Verlauf mit Nachrichten: Nutzer rechts in einer Blase, Agent links als Text ohne Rahmen\n- Absendernamen: keine. Die Ausrichtung sagt, wer spricht\n- Denkvorgang als eigene Zeile über der Antwort\n- Composer als Karte mit Radius 28 px, Werkzeugzeile darunter, Senden als 34-px-Kreis\n- Seitenleiste 280 px mit Orten und Sitzungen, einklappbar auf 56 px\n- Eingabe: Enter sendet, Shift+Enter bricht um\n- Ohne Harness: die Nachricht erscheint, die Antwort fehlt mit ehrlichem Hinweis',
    'order.stack.title': 'Projekt-Stack',
    'order.stack.body':
      '- Bun als Laufzeit, TypeScript 7 (tsgo), Vite als Bauschritt\n- Kein Rahmenwerk: die Oberfläche ist DOM, kein React. Ein Nachbau in React wäre ein zweiter Baum neben dem Harness\n- Design-System importiert aus dem Harness (src/design-system.css): Tokens, Schriften, Bildlaufleiste\n- Muster und Klassen der Vorlage: .chat, .side, .chat-main, .feed, .w, .in, .box\n- Plugins als Form für alles Beisteuerbare: panel, commands, healthChecks, settings\n- Sprache und Einstellungen sind Kerne; ihre Inhalte sind Pakete (locale-de, locale-en, ui-controls)',
    'order.open.title': 'Offene Entscheidungen',
    'order.open.body':
      '- Woher die Sitzungen in der Leiste kommen: aus dem Universum (wie bisher) oder aus dem Harness\n- Ob der Verlauf im Speicher bleibt oder je Sitzung getrennt liegt\n- Ob die Schnittstelle zum Harness über HTTP, einen Strom oder ein Plugin läuft\n- Ob Markdown gerendert wird oder Text bleibt\n- Ob der Chat die dritte Ansicht ersetzt oder neben ihr steht',    'web.project': 'projekt',
    'web.summary': 'übersicht',
    'term.view.current': 'Ansicht',
    'term.view.set': 'Ansicht gewechselt',    

// ── Einstellungen: Gruppen ───────────────────────────────────────────────────────────
    'category.control': 'Steuerung',
    'category.universe': 'Universe',
    'category.interface': 'Oberfläche',
    'category.language': 'Sprache',
    'category.plugins': 'Plugins',

    // ── Einstellungen: Steuerung ─────────────────────────────────────────────────────────
    'setting.control.rotateSpeed.label': 'Drehgeschwindigkeit',
    'setting.control.rotateSpeed.description':
      'Wie weit ein Zug über den Bildschirm dreht, in Grad je Bildschirmbreite. 128° heißt: zwei Züge, einmal herum.',
    'setting.control.zoomFactor.label': 'Zoom je Rastschritt',
    'setting.control.zoomFactor.description':
      'Faktor je Radzug. 1,25 halbiert den Abstand in drei Schritten.',
    'setting.control.axisSpin.label': 'Drehen am Achsenkreuz',
    'setting.control.axisSpin.description':
      'Wie weit ein Zug an einem Achsen-Endpunkt dreht, in Grad je Bildschirmbreite.',
    'setting.control.panFactor.label': 'Schieben',
    'setting.control.panFactor.description':
      'Wie weit die mittlere Taste oder Shift+Ziehen das Bild verschiebt, bezogen auf den Abstand.',
    'setting.control.showAxes.label': 'Achsen anzeigen',
    'setting.control.showAxes.description':
      'Das Achsenkreuz unten links. Es ist zugleich das Drehwerkzeug.',
    'setting.control.scheme.label': 'Steuerung',
    'setting.control.scheme.description':
      'CAD: linke Taste dreht, mittlere Taste schiebt. Shift: linke Taste dreht immer, nur Shift schiebt — die vorherige Belegung.',
    'setting.control.keys.label': 'Tastatur',
    'setting.control.keys.description': '0 setzt die Ansicht zurück, + und − zoomen.',

    // ── Einstellungen: Welt ──────────────────────────────────────────────────────────────
    'setting.universe.orbits.label': 'Bahnen laufen',
    'setting.universe.orbits.description':
      'Ob sich Planeten bewegen. Die Bewegung folgt den Keplerschen Umlaufzeiten, nicht einer Gravitationssimulation.',
    'setting.universe.orbitSpeed.label': 'Tempo der Bahnen',
    'setting.universe.orbitSpeed.description': 'Ein Faktor auf die Umlaufgeschwindigkeit.',
    'setting.universe.rolling.label': 'Zeit dreht das Universe',
    'setting.universe.rolling.description':
      'Die Drehlage des Universe ändert sich von selbst — die Zeit als fünfter Freiheitsgrad.',
    'setting.universe.rollSpeed.label': 'Tempo der Universe-Zeit',
    'setting.universe.rollSpeed.description': 'Wie schnell die Zeit die Drehlage des Universe verändert.',
    'setting.universe.dimensions.label': 'Dimensionen',
    'setting.universe.dimensions.description':
      'Wie viele Drehachsen gleichzeitig wirken. 3 ist der anschauliche Fall, 5 nutzt alle zehn Drehflächen.',

    // ── Einstellungen: Oberfläche ────────────────────────────────────────────────────────
    'setting.interface.mode.label': 'Ansicht',
    'setting.interface.mode.description': 'Universe oder Chat. Auf schmalen Bildschirmen nur Chat.',
    'setting.interface.hud.label': 'Statuszeile',
    'setting.interface.hud.description': 'Die Zeile oben mit Ebene, Abstand und fps.',
    'setting.interface.labels.label': 'Namen an den Körpern',
    'setting.interface.labels.description': 'Beschriftungen im Bild.',
    /*
     * **Die Stilvorlage — der Schalter zum Prüfen.**
     *
     * Der Betreiber: „erstelle mal ein Template side oder eine möglichkeit es zu switchen damit man
     * es auch testen könnte". Die Werte (`base`, `prometheus`) sind Kennungen und stehen deshalb
     * englisch; hier steht, was der Nutzer liest. Der zweite Eintrag nennt die Richtung beim Namen
     * („Schmiede"), nicht die Farben — ein Name wie „Orange" beschriebe einen Wert statt einer Sache.
     */
    'setting.interface.style.label': 'Stilvorlage',
    'setting.interface.style.description':
      'Die Gestaltung der Oberfläche: Werkstoff, Form und Bewegung. Die Welt bleibt in beiden Fällen dunkel.',
    'setting.interface.style.base': 'Grundgerüst',
    'setting.interface.style.prometheus': 'Schmiede — Prometheus',
    /*
     * **Wenn die Maschine nicht die volle Stufe hergibt.**
     *
     * Der Betreiber: „noch nebenbei sollte es auch IGPU und CPU supporten". Passiert das, wird es
     * **gesagt** — eine stille Reduktion wäre von einem Fehler nicht zu unterscheiden, und dann sucht
     * jemand den Grund in der Welt statt im Rechner.
     */
    'geraet.reduziert': 'Gerät: sparsam',
    'geraet.keinWebgl': 'Gerät: kein WebGL',
    'geraet.kontextVerloren': 'Grafikkarte entzogen',
    /*
     * **Was das Universum zeigt — eine Auswahl, kein Schalter.**
     *
     * Betreiber: *„die sterne finde ich gut gemacht sollte man dort belassen das man via einstellung
     * machen kann evt als dropdown liste auswahl oder so"*.
     *
     * Der Schalter hiess vorher „Himmelskörper zeichnen" und schaltete in Wahrheit zwei Dinge: die
     * Körper **und** den Sternenhimmel. Wer die Körper wegwollte, verlor die Sterne. Jetzt sind es
     * drei Werte, und jeder ist ein Bild, das man beschreiben kann.
     *
     * `setting.interface.starfield.*` ist **entfallen**: das Feld hatte Beschriftungen und wurde im
     * Code gelesen, stand aber in keiner Einstellung — es war unerreichbar. Der Sternenhimmel ist
     * jetzt der mittlere Wert dieser Liste.
     */
    'setting.universe.visuals.label': 'Was das Universum zeigt',
    'setting.universe.visuals.description':
      'Leer lässt nur die Schnittstelle stehen — die Logik läuft in jedem Fall weiter.',
    'setting.universe.visuals.none': 'Leer (nur die Schnittstelle)',
    'setting.universe.visuals.stars': 'Nur der Sternenhimmel',
    'setting.universe.visuals.all': 'Körper und Sternenhimmel',

    // ── Einstellungen: Sprache ───────────────────────────────────────────────────────────
    'setting.language.locale.label': 'Sprache der Oberfläche',
    'settings.resetAll': 'Alle zurücksetzen',
    'settings.opened': 'Einstellungen geöffnet.',
    'settings.empty': 'In diesem Abschnitt gibt es gerade nichts einzustellen.',
    'setting.language.locale.description':
      'Jede Sprache ist ein eigenes Paket. Englisch ist der Standard, Deutsch liegt bei.',

    // ── Einstellungen: Plugins ───────────────────────────────────────────────────────────
    'setting.plugins.enabled.label': 'Plugins',
    'setting.plugins.enabled.description':
      'Plugins lassen sich im Terminal mit enable und disable schalten.',
    'setting.plugins.count.label': 'Eingeschaltete Plugins',
    'setting.plugins.count.description': 'Wie viele Plugins gerade etwas beisteuern.',

    // ── Terminal ─────────────────────────────────────────────────────────────────────────
    'term.unknown': 'Unbekannter Befehl: {name}. „help" zeigt alle.',
    'term.help.title': 'Befehle:',
    'term.usage': 'Verwendung',
    'term.universe': 'Universum',
    'term.levelHint': '1 = Kleinkörper … 7 = Überblick',
    'term.noHits': 'Kein Treffer für „{query}".',
    'term.hits': '{n} Treffer.',
    'term.plugins': '{n} Plugins, {on} eingeschaltet.',
    'term.disabled': 'Plugin abgeschaltet: {id}.',
    'term.enabled': 'Plugin eingeschaltet: {id}.',
    'term.lang.set': 'Sprache: {locale}',
    'term.lang.unknown': 'Kein Sprachpaket für „{id}". Vorhanden: {list}',
    'term.lang.missing': '{n} Schluessel fehlen in {locale}.',
    'term.lang.complete': '{locale} ist vollstaendig.',
    'term.setting.set': '{key} = {value}',
    'term.setting.unknown': 'Unbekannte Einstellung: {key}',
    'term.bodies': 'Objekte im Universum: {n}',
    'term.prompt': 'Befehl',
    'term.intro': 'Jeder Befehl in diesem Fenster kommt aus einem Plugin — nicht aus der Hülle.',

    // ── Gesundheitsbericht ───────────────────────────────────────────────────────────────
    'health.ok': 'ok',
    'health.fail': 'FEHL',
    'health.none': 'Keine Prüfungen vorhanden.',
    'health.summary': '{n} Prüfungen · {ok} in Ordnung · {bad} Befund(e)',
    'health.locale': 'Sprachpaket {id}',

    // ── Notizen (Plugin `notes`) ─────────────────────────────────────────────────────────
    'panel.notes': 'Notizen',
    'notes.title': 'Notizen',
    'notes.search': 'In den Notizen suchen',
    'notes.loading': 'lädt …',
    'notes.empty': 'Noch keine Notizen. Vault übernehmen und einlesen.',
    'notes.emptySearch': 'Kein Treffer.',
    'notes.count': '{n} von {gesamt} Notizen',
    'notes.vault.missing': 'Vorschlag, noch nicht übernommen:',
    'notes.vault.take': 'Vault übernehmen',
    'notes.import': 'Neu einlesen',
    'notes.command.help': 'zeigt die Notizen des Kontos (das Panel „Notizen" holt und sucht)',
    'notes.command.empty': 'Noch nichts geholt — Panel „Notizen" öffnen; dieser Befehl liest den zuletzt geholten Stand.',
    'notes.health.unchecked': 'nicht geprüft — das Panel war noch nicht offen',
    'notes.health.ok': '{notizen} Notizen, {verweise} Verweise im Gedächtnis',
    'notes.error.netz': 'Keine Verbindung zum Wirt.',
    'notes.error.kein-csrf': 'Kein CSRF-Wert im Keks — neu anmelden, dann geht es wieder.',
    'notes.error.nicht-angemeldet': 'Diese Sitzung gilt nicht mehr — neu anmelden.',
    'notes.error.unerwartet': 'Der Wirt konnte die Anfrage nicht beantworten.',
    'notes.error.pfad-weg': 'Diesen Pfad gibt es nicht (mehr).',
    'notes.error.pfad-kein-ordner': 'Der Pfad ist eine Datei, kein Ordner.',
    'notes.error.pfad-nicht-absolut': 'Der Pfad muß absolut sein.',
    'notes.error.pfad-unbrauchbar': 'Der Pfad darf kein „.." enthalten.',
    'notes.error.vault-fehlt': 'Dieses Konto hat noch keinen Vault.',
    'notes.error.vault-schon-da': 'Dieser Vault ist schon eingetragen.',
    'notes.error.unbekannt': 'Unbekannter Fehler',
    'notes.signin': 'Zur Anmeldung',
    'setting.notes.limit.label': 'Notizen je Abruf',
    'setting.notes.limit.description':
      'Wie viele Notizen das Panel höchstens holt. Mehr Zeilen kosten mehr Zeit beim Aufbau.',
  },
}
