/**
 * `@prometheus-harness/permissions` — wer darf was, und **in wessen Auftrag**.
 *
 * ## Die Regel, die dieses Paket durchsetzt
 *
 * **Der Agent handelt mit den Rechten des fragenden Benutzers. Er bekommt niemals
 * mehr.** Das ist die Weisung des Betreibers wörtlich: *„der harness & agent
 * spiegelt der befugnisse vom User Permission selbst. somit läuft der agent
 * harness nicht amok mit anfrage eine normale user und Harness selbst zb mit
 * admin permission"*.
 *
 * ## Der Fehler, gegen den es gebaut ist
 *
 * Läuft der Harness als `admin` und ist der Agent ein Teil von ihm, dann **erbt**
 * jede Werkzeugausführung die Admin-Rechte — auch für die Anfrage eines normalen
 * Benutzers. Der Benutzer wäre dann nur noch eine **Beschriftung**, und die
 * Anmeldung wäre Zierde. Genau so läuft ein Agent „Amok": nicht durch Absicht,
 * sondern durch **Vererbung**.
 *
 * Deshalb trennt dieses Paket zwei Größen, die man leicht vermischt:
 *
 * | | Was es ist | Woher es kommt |
 * |---|---|---|
 * | **Akteur** | der Benutzer, in dessen Auftrag gehandelt wird | die Anmeldung |
 * | **Herkunft** | `'benutzer'` oder `'harness'` | die **Aufrufstelle**, nicht der Akteur |
 *
 * ## Warum reine Logik und kein Datenbankbezug
 *
 * Eine Rechteprüfung, die nur mit laufender Datenbank prüfbar ist, wird **nicht**
 * geprüft — und dann ist sie eine Absicht. Alle Eingaben kommen als Werte herein,
 * alle Entscheidungen gehen als Wert heraus. Es gibt hier keinen Dateizugriff,
 * keine Uhr und keine Verbindung; `jetzt` wird übergeben.
 *
 * ## Die Grenze, die dieses Paket **nicht** überschreiten kann
 *
 * Eine Pfadprüfung in reiner Logik sieht **symbolische Verweise nicht**. Ein Pfad,
 * der formal innerhalb einer Wurzel liegt, kann über einen Symlink nach außen
 * zeigen. Diese Prüfung ist deshalb die **erste** Schicht, nicht die letzte: die
 * Durchsetzung gehört in den Kernel (`landlock`) bzw. in `services/pmh-sandbox`.
 * Wer sich allein auf den Textvergleich verläßt, baut eine Attrappe.
 *
 * @module @prometheus-harness/permissions
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

// ---------------------------------------------------------------------------
// Rollen, Herkunft, Isolation
// ---------------------------------------------------------------------------

/**
 * Die Rollen. **Genau die zwei, die das Schema kennt.**
 *
 * `packages/auth/db-schema/migrations/0001_identitaet.sql:35` hat
 * `CHECK (role IN ('user','admin'))`. Eine dritte Rolle hier zu erfinden, die die
 * Datenbank nicht annimmt, wäre ein Typ, der beim Schreiben scheitert.
 */
export type Rolle = 'user' | 'admin'

/**
 * Woher eine Anfrage kommt.
 *
 * **Der Akteur ist NICHT die Herkunft.** Ein Harness-interner Vorgang kann im
 * Auftrag eines normalen Benutzers laufen (`'benutzer'`) — und eine Anfrage, die
 * der Benutzer stellt, ist niemals `'harness'`, egal welcher Prozeß sie ausführt.
 */
export type Herkunft = 'benutzer' | 'harness'

/** Der Grad des Dateizugriffs. Spiegelt `FileAccess` aus `services/pmh-sandbox`. */
export type Dateizugriff = 'none' | 'read-only' | 'read-write'

/**
 * Das Isolationsprofil eines Benutzers — „wie ein VPS".
 *
 * **Warum diese fünf Felder.** Sie sind genau die Felder von `SandboxPolicy`
 * (`services/pmh-sandbox/src/lib.rs:99–110`), damit dasselbe Profil ohne
 * Übersetzung an die durchsetzende Stelle geht. Ein eigenes, reicheres Modell hier
 * wäre ein zweites Modell, das auseinanderläuft.
 */
export interface Isolation {
  readonly dateizugriff: Dateizugriff
  /** Wurzeln, unterhalb derer **gelesen** werden darf. */
  readonly lesewurzeln: readonly string[]
  /** Wurzeln, unterhalb derer **geschrieben** werden darf. */
  readonly schreibwurzeln: readonly string[]
  /** Ob ausgehender Netzzugriff erlaubt ist. Vorgabe für neue Benutzer: **nein**. */
  readonly netz: boolean
  /** Ob weitere Prozesse gestartet werden dürfen. Vorgabe für neue Benutzer: **nein**. */
  readonly prozesse: boolean
}

/** Ein Akteur: der Benutzer, in dessen Auftrag gehandelt wird. */
export interface Akteur {
  readonly userId: string
  readonly rolle: Rolle
  readonly isolation: Isolation
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

/**
 * Eine Aktion, die geprüft werden soll.
 *
 * **Warum eine unterscheidbare Vereinigung und keine Zeichenkette.** Eine
 * Zeichenkette wie `'datei-schreiben:/pfad'` läßt sich falsch zusammensetzen und
 * falsch zerlegen — und die Zerlegung ist dann die Sicherheitslücke. Als Typ
 * trägt jede Aktion ihre Angaben **strukturiert**, und der Typechecker sieht
 * einen fehlenden Pfad.
 */
export type Aktion =
  | { readonly art: 'datei-lesen'; readonly pfad: string }
  | { readonly art: 'datei-schreiben'; readonly pfad: string }
  | { readonly art: 'netz-zugriff'; readonly ziel: string }
  | { readonly art: 'prozess-starten'; readonly programm: string }
  | { readonly art: 'benutzer-anlegen'; readonly email: string }
  | { readonly art: 'benutzer-aendern'; readonly userId: string }
  | { readonly art: 'benutzer-entfernen'; readonly userId: string }
  | { readonly art: 'profil-aendern'; readonly userId: string }
  | { readonly art: 'plugin-einhaengen'; readonly name: string }
  | { readonly art: 'policy-aendern'; readonly bereich: string }

/** Die Aktionsarten, für die Admin-Recht nötig ist. */
export const ADMIN_AKTIONEN: ReadonlySet<Aktion['art']> = new Set([
  'benutzer-anlegen',
  'benutzer-aendern',
  'benutzer-entfernen',
  'profil-aendern',
  'plugin-einhaengen',
  'policy-aendern',
])

/**
 * Eine ausdrückliche Admin-Freigabe für eine **Harness**-Aktion.
 *
 * **Warum an die Aktion gebunden und nicht allgemein.** Eine Freigabe „der Harness
 * darf alles" ist ein Freibrief, und ein Freibrief wird irgendwann an der falschen
 * Stelle benutzt. Diese Freigabe gilt für **eine** Aktion (als kanonischer Text)
 * und **einen** Zeitraum — dieselbe Bauform wie die Freigabe in
 * `services/pmh-nix` (t13): `apply` ist ohne Freigabe und bei Abweichung gesperrt.
 */
export interface Freigabe {
  /** Wer sie erteilt hat. Muß ein Admin sein — geprüft wird das vom Aufrufer. */
  readonly vonUserId: string
  /** Wofür: der kanonische Text der Aktion (siehe {@link aktionsSchluessel}). */
  readonly aktionsschluessel: string
  /** Wann sie erteilt wurde (ISO 8601). */
  readonly erteiltAm: string
  /** Wie lange sie gilt, in Sekunden. */
  readonly giltSekunden: number
  /** Die Unterschrift über alle Felder oben — **nicht nachahmbar**. */
  readonly unterschrift: string
}

/** Ein Urteil. **Immer mit Grund und Regel** — ein „nein" ohne Grund ist nicht prüfbar. */
export type Urteil =
  | { readonly erlaubt: true; readonly regel: 'erlaubt' }
  | { readonly erlaubt: false; readonly regel: Regel; readonly grund: string }

/** Warum abgewiesen wurde. */
export type Regel =
  | 'erlaubt'
  | 'admin-erforderlich'
  | 'freigabe-fehlt'
  | 'freigabe-ungueltig'
  | 'freigabe-abgelaufen'
  | 'freigabe-fuer-andere-aktion'
  | 'dateizugriff-aus'
  | 'nicht-in-lesewurzel'
  | 'nicht-in-schreibwurzel'
  | 'kein-netz'
  | 'kein-prozessstart'
  | 'fremder-bereich'

/** Eine Anfrage an die Prüfung. */
export interface Anfrage {
  readonly akteur: Akteur
  readonly herkunft: Herkunft
  readonly aktion: Aktion
  /** Nur für `herkunft: 'harness'` bei einer Admin-Aktion. */
  readonly freigabe?: Freigabe
  /** Die Prüfzeit. Wird übergeben, damit die Funktion keine Uhr kennt. */
  readonly jetzt: Date
  /** Die Homes **anderer** Benutzer — für die eigene, klarere Abweisung. */
  readonly fremdeHomes?: readonly string[]
}

// ---------------------------------------------------------------------------
// Pfadbehandlung
// ---------------------------------------------------------------------------

/**
 * Bringt einen Pfad in eine vergleichbare Form.
 *
 * **Warum `..` **textuell** aufgelöst wird.** Der klassische Umgehungsversuch
 * lautet `/wurzel/../../etc/passwd`. Wer nur `startsWith` prüft, sieht einen Pfad,
 * der mit der Wurzel beginnt — und läßt ihn durch. Hier werden `.` und `..`
 * **vor** dem Vergleich verrechnet. Führende `..` **oberhalb** der Wurzel bleiben
 * stehen, und damit fällt der Pfad anschließend durch die Enthaltenseinprüfung.
 *
 * **Warum die Groß- und Kleinschreibung NICHT angeglichen wird.** Auf Linux ist
 * der Pfad fallabhängig; ihn dort zu vergleichgültigen öffnete eine Lücke. Auf
 * Windows und macOS ist das Dateisystem fallunabhängig, und ein Pfad, der sich nur
 * in der Schreibweise unterscheidet, gilt hier als **außerhalb** — die Prüfung
 * weist dann **mehr** ab, nicht weniger. Das ist die richtige Richtung für eine
 * Sicherheitsprüfung, und es steht hier, damit es niemand für einen Fehler hält.
 *
 * @param pfad - der zu prüfende Pfad
 * @returns der vereinfachte Pfad mit `/` als Trenner
 */
export function normalisiere(pfad: string): string {
  const teile = pfad.replaceAll('\\', '/').split('/')
  const stapel: string[] = []
  for (const teil of teile) {
    if (teil === '' || teil === '.') continue
    if (teil === '..') {
      // Über die Wurzel hinaus wird NICHT verrechnet — sonst verschwände die
      // Umgehung, statt aufzufallen.
      if (stapel.length > 0 && stapel[stapel.length - 1] !== '..') stapel.pop()
      else stapel.push('..')
      continue
    }
    stapel.push(teil)
  }
  const fuehrend = pfad.replaceAll('\\', '/').startsWith('/') ? '/' : ''
  return fuehrend + stapel.join('/')
}

/**
 * Ob ein Pfad innerhalb einer Wurzel liegt.
 *
 * **Warum nicht `startsWith` allein.** `'/home/u1-boes'.startsWith('/home/u1')`
 * ist **wahr** — ein Geschwisterverzeichnis mit passendem Präfix ginge durch.
 * Deshalb muß nach der Wurzel entweder Schluß sein oder ein Trenner folgen.
 *
 * @param pfad - der geprüfte Pfad
 * @param wurzel - die erlaubte Wurzel
 * @returns `true`, wenn der Pfad darunter liegt
 */
export function liegtIn(pfad: string, wurzel: string): boolean {
  const p = normalisiere(pfad)
  const w = normalisiere(wurzel)
  if (w === '' || w === '/') return p.startsWith('/')
  return p === w || p.startsWith(`${w}/`)
}

// ---------------------------------------------------------------------------
// Die Freigabe — Unterschrift und Prüfung
// ---------------------------------------------------------------------------

/**
 * Bildet den kanonischen Schlüssel einer Aktion.
 *
 * **Warum kanonisch und nicht `JSON.stringify(aktion)`.** Die Reihenfolge der
 * Felder in einem Objekt ist keine Zusage; zwei gleiche Aktionen könnten
 * verschiedene Schlüssel ergeben und eine gültige Freigabe würde scheitern — oder,
 * schlimmer, zwei verschiedene Aktionen denselben Schlüssel. Hier werden die
 * Felder **nach Namen sortiert** verkettet.
 *
 * @param aktion - die Aktion
 * @returns der kanonische Text
 */
export function aktionsSchluessel(aktion: Aktion): string {
  const felder = Object.entries(aktion as unknown as Record<string, unknown>)
    .filter(([name]) => name !== 'art')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, wert]) => `${name}=${String(wert)}`)
  return [aktion.art, ...felder].join('|')
}

/**
 * Der **eine** Text, der unterschrieben wird.
 *
 * **Warum es diese Funktion gibt — und warum sie der wichtigste Teil ist.** Die
 * erste Fassung baute den Text zum Unterschreiben und den Text zum Prüfen **an
 * zwei Stellen** zusammen. Sie stimmten nicht überein (fünf Felder gegen vier,
 * dazu ein Schreibfehler) — jede Unterschrift wäre damit **ungültig** gewesen,
 * und zwar **still**: die Freigabe hätte nie funktioniert, und die Fehlersuche
 * hätte an der falschen Stelle begonnen. Hier steht der Text **einmal**; wer ihn
 * ändert, ändert ihn für beide Seiten.
 *
 * **Warum die Felder in fester Reihenfolge und nicht als JSON.** Die
 * Feldreihenfolge eines Objekts ist keine Zusage der Sprache. Eine feste Liste ist
 * sie.
 *
 * @param freigabe - die Freigabe ohne Unterschrift
 * @returns der zu unterschreibende Text
 */
export function freigabeText(freigabe: Omit<Freigabe, 'unterschrift'>): string {
  return [
    freigabe.vonUserId,
    freigabe.aktionsschluessel,
    freigabe.erteiltAm,
    String(freigabe.giltSekunden),
  ].join('|')
}

/**
 * Unterschreibt eine Freigabe mit einem geheimen Schlüssel (HMAC-SHA-256).
 *
 * **Warum HMAC und nicht ein Hash der Felder.** Ein nackter Hash wäre von jedem
 * nachrechenbar, der die Felder kennt — und die Felder kennt jeder. Erst der
 * geheime Schlüssel macht die Freigabe **nicht nachahmbar**, und genau das ist ihr
 * ganzer Zweck: der Benutzer darf sie nicht selbst erzeugen können.
 *
 * @param freigabe - die Freigabe ohne Unterschrift
 * @param geheimnis - der geheime Schlüssel (bleibt außerhalb der Datenbank)
 * @returns die hexadezimale Unterschrift
 */
export function unterschreibeFreigabe(
  freigabe: Omit<Freigabe, 'unterschrift'>,
  geheimnis: string,
): string {
  return createHmac('sha256', geheimnis).update(freigabeText(freigabe)).digest('hex')
}

/**
 * Prüft die Unterschrift einer Freigabe in **konstanter Zeit**.
 *
 * **Warum konstante Zeit.** Ein byteweiser Vergleich bricht beim ersten
 * abweichenden Zeichen ab; aus der Laufzeit ließe sich die richtige Unterschrift
 * Byte für Byte erraten. Dasselbe Verfahren benutzt `packages/auth/auth` für seine
 * Tokenvergleiche.
 *
 * @param freigabe - die vollständige Freigabe
 * @param geheimnis - der geheime Schlüssel
 * @returns `true`, wenn die Unterschrift stimmt
 */
export function pruefeUnterschrift(freigabe: Freigabe, geheimnis: string): boolean {
  const erwartet = createHmac('sha256', geheimnis).update(freigabeText(freigabe)).digest('hex')
  const a = Buffer.from(erwartet, 'utf8')
  const b = Buffer.from(freigabe.unterschrift, 'utf8')
  // **Längenprüfung zuerst, und das ist kein Leck.** `timingSafeEqual` wirft bei
  // verschieden langen Puffern; die Länge einer Hex-Unterschrift ist ohnehin
  // bekannt (64 Zeichen) und verrät nichts.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// Die Prüfung
// ---------------------------------------------------------------------------

/** Ein „nein" mit Regel und Grund. */
function nein(regel: Regel, grund: string): Urteil {
  return { erlaubt: false, regel, grund }
}

/**
 * Darf diese Anfrage ausgeführt werden?
 *
 * **Die Prüfung ist eine Gleichheit, keine Obergrenze.** Der Agent bekommt genau
 * die Rechte des fragenden Benutzers: nicht mehr (sonst läuft er Amok) und nicht
 * weniger (sonst wird die Regel umgangen, indem jemand einen zweiten Weg baut).
 *
 * Die Reihenfolge der Prüfungen ist Absicht:
 *
 * 1. **Fremder Bereich zuerst.** Ein Pfad im Home eines **anderen** Benutzers
 *    bekommt eine eigene, klare Abweisung. Er würde ohnehin an der Wurzelprüfung
 *    scheitern — aber „nicht in deiner Lesewurzel" und „das gehört jemand anderem"
 *    sind für den Leser zwei verschiedene Aussagen, und die zweite ist die
 *    wichtigere.
 * 2. **Admin-Recht.** Verlangt die Aktion Admin, entscheidet bei Herkunft
 *    `'benutzer'` die **Rolle des Akteurs**; bei Herkunft `'harness'` genügt die
 *    Rolle **nicht** — es braucht eine unterschriebene Freigabe.
 * 3. **Profil.** Erst danach das Isolationsprofil.
 *
 * @param anfrage - Akteur, Herkunft, Aktion, Freigabe und Zeit
 * @param geheimnis - der Schlüssel für die Freigabeprüfung; fehlt er, ist **jede**
 *                    Harness-Admin-Aktion abgewiesen (fail-closed)
 * @returns das Urteil
 */
export function darfAusfuehren(anfrage: Anfrage, geheimnis?: string): Urteil {
  const { akteur, herkunft, aktion, freigabe, jetzt, fremdeHomes } = anfrage

  // ── 1. Fremder Bereich ────────────────────────────────────────────────────
  if (aktion.art === 'datei-lesen' || aktion.art === 'datei-schreiben') {
    for (const fremd of fremdeHomes ?? []) {
      if (liegtIn(aktion.pfad, fremd)) {
        return nein(
          'fremder-bereich',
          `${aktion.pfad} liegt im Bereich eines anderen Benutzers — auch der Agent des ` +
            `Auftraggebers kommt dort nicht heran`,
        )
      }
    }
  }

  // ── 2. Admin-Recht ────────────────────────────────────────────────────────
  if (ADMIN_AKTIONEN.has(aktion.art)) {
    if (herkunft === 'benutzer') {
      if (akteur.rolle !== 'admin') {
        return nein(
          'admin-erforderlich',
          `${aktion.art} verlangt Admin-Recht; der Akteur hat die Rolle "${akteur.rolle}"`,
        )
      }
    } else {
      // **Der Amok-Schutz.** Der Harness darf nicht deshalb mehr dürfen, weil er
      // der Harness ist. Ohne vorzeigbare, unterschriebene Freigabe: nein.
      if (freigabe === undefined) {
        return nein(
          'freigabe-fehlt',
          `${aktion.art} aus dem Harness heraus verlangt eine ausdrückliche Admin-Freigabe — ` +
            `„der Harness ist der Harness" ist keine Befugnis`,
        )
      }
      if (freigabe.aktionsschluessel !== aktionsSchluessel(aktion)) {
        return nein(
          'freigabe-fuer-andere-aktion',
          `die Freigabe gilt für "${freigabe.aktionsschluessel}", nicht für ` +
            `"${aktionsSchluessel(aktion)}"`,
        )
      }
      const ablauf = new Date(new Date(freigabe.erteiltAm).getTime() + freigabe.giltSekunden * 1000)
      if (!(jetzt < ablauf)) {
        return nein(
          'freigabe-abgelaufen',
          `die Freigabe lief am ${ablauf.toISOString()} ab, geprüft wurde um ${jetzt.toISOString()}`,
        )
      }
      if (geheimnis === undefined) {
        return nein(
          'freigabe-ungueltig',
          'ohne Prüfschlüssel läßt sich keine Freigabe bestätigen — es wird abgewiesen, nicht geraten',
        )
      }
      if (!pruefeUnterschrift(freigabe, geheimnis)) {
        return nein('freigabe-ungueltig', 'die Unterschrift der Freigabe stimmt nicht')
      }
    }
  }

  // ── 3. Das Isolationsprofil ───────────────────────────────────────────────
  const profil = akteur.isolation
  switch (aktion.art) {
    case 'datei-lesen': {
      if (profil.dateizugriff === 'none') {
        return nein('dateizugriff-aus', 'das Profil erlaubt keinen Dateizugriff')
      }
      const erlaubt = [...profil.lesewurzeln, ...profil.schreibwurzeln].some((w) => liegtIn(aktion.pfad, w))
      return erlaubt
        ? { erlaubt: true, regel: 'erlaubt' }
        : nein(
            'nicht-in-lesewurzel',
            `${aktion.pfad} liegt in keiner Lesewurzel des Profils ` +
              `(${[...profil.lesewurzeln, ...profil.schreibwurzeln].join(', ') || 'keine'})`,
          )
    }
    case 'datei-schreiben': {
      if (profil.dateizugriff !== 'read-write') {
        return nein(
          'dateizugriff-aus',
          `das Profil erlaubt "${profil.dateizugriff}", nicht "read-write"`,
        )
      }
      const erlaubt = profil.schreibwurzeln.some((w) => liegtIn(aktion.pfad, w))
      return erlaubt
        ? { erlaubt: true, regel: 'erlaubt' }
        : nein(
            'nicht-in-schreibwurzel',
            `${aktion.pfad} liegt in keiner Schreibwurzel des Profils ` +
              `(${profil.schreibwurzeln.join(', ') || 'keine'})`,
          )
    }
    case 'netz-zugriff':
      return profil.netz
        ? { erlaubt: true, regel: 'erlaubt' }
        : nein('kein-netz', 'das Profil erlaubt keinen ausgehenden Netzzugriff')
    case 'prozess-starten':
      return profil.prozesse
        ? { erlaubt: true, regel: 'erlaubt' }
        : nein('kein-prozessstart', 'das Profil erlaubt keinen Start weiterer Prozesse')
    default:
      // Die Admin-Aktionen sind oben schon entschieden. Wer hier ankommt, ist
      // Admin **und** befugt.
      return { erlaubt: true, regel: 'erlaubt' }
  }
}

// ---------------------------------------------------------------------------
// Das Vorgabeprofil
// ---------------------------------------------------------------------------

/**
 * Das Isolationsprofil für einen **neuen** Benutzer — restriktiv.
 *
 * **Warum restriktiv und nicht freizügig.** Ein Vorgabewert, der zu viel erlaubt,
 * wird nie korrigiert, weil niemand einen Fehler bemerkt, der nicht auftritt. Ein
 * Vorgabewert, der zu wenig erlaubt, fällt sofort auf und wird **ausdrücklich**
 * erweitert — und diese Erweiterung ist dann eine Entscheidung mit einem Datum.
 *
 * **Warum `netz: false`.** Ein Agent, der für einen fremden Benutzer läuft, darf
 * nicht ohne ausdrückliche Erteilung nach außen. Wer den Anbieter erreichen muß,
 * bekommt es ausdrücklich.
 *
 * @param home - das Home des Benutzers
 * @returns das Vorgabeprofil
 */
export function vorgabeProfil(home: string): Isolation {
  return {
    dateizugriff: 'read-write',
    lesewurzeln: [home],
    schreibwurzeln: [`${normalisiere(home)}/workspace`],
    netz: false,
    prozesse: false,
  }
}

/**
 * Das Isolationsprofil eines Admins — **weit, aber nicht unbegrenzt**.
 *
 * **Warum nicht ohne Grenzen.** Auch ein Adminprofil hat Wurzeln: ein Profil ohne
 * jede Grenze ließe sich nicht mehr von „kein Profil" unterscheiden, und
 * `pmh-sandbox` weist ein `none`-Profil mit gesetzten Wurzeln ausdrücklich als
 * widersprüchlich ab. Ein Profil, das alles erlaubt, wäre die Rückkehr zu „keine
 * Prüfung" — und dann wäre die ganze Mechanik Zierde.
 *
 * @param wurzeln - die erlaubten Wurzeln des Administrators
 * @returns das Adminprofil
 */
export function adminProfil(wurzeln: readonly string[]): Isolation {
  return {
    dateizugriff: 'read-write',
    lesewurzeln: [...wurzeln],
    schreibwurzeln: [...wurzeln],
    netz: true,
    prozesse: true,
  }
}
