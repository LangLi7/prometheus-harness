# Sprachpaket — Bestandsaufnahme vor dem Bau

> **Stand:** 14.10.2026 · **zwei** getrennte Zählungen, jede mit ihrem Muster benannt.
> Die Zahlen stammen aus zwei Durchgängen: einem eigenen (Muster unten genannt)
> und einer **schreibgeschützten** Bestandsaufnahme durch einen Unteragenten
> (keine Datei geändert, kein Bau, keine Suite). Wo die beiden Zahlen abweichen,
> liegt es am **Muster**, nicht an der Wirklichkeit — beide stehen mit ihrem
> Muster da, statt sie zu einer Zahl zu verschmelzen.

## 1. Der Befund in einem Satz

**Unser Fork hat keine Sprachschicht — der Kern hat eine, und wir stehen daneben.**
Alle deutschen Sätze sind **handgeschrieben** in Aufrufe hineingetippt, und der Kern
bietet seit jeher einen Erweiterungspunkt, den wir nicht benutzen.

## 2. Was der Kern mitbringt (nachgelesen, nicht vermutet)

`@deepseek-ai/dsh-client-locale` v0.2.1-alpha.2, und in seinen eigenen
Typdeklarationen steht:

```ts
/** Locale identifiers shipped by the browser client. */
export declare const LOCALE_IDS: readonly ["zh", "en"];
/** Open locale identifier accepted from language-pack plugins. */
export type LocaleId = string;
```

**`LocaleId` ist absichtlich offen** — der Kern nennt den Erweiterungspunkt selbst
„**language-pack plugins**". Das Rezept steht in seiner README:

```js
export const inject = ['locale']

export function apply(ctx) {
  ctx.effect(
    () => ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }),
    'my-locale: language',
  )
  ctx.effect(
    () => ctx.locale.register('common', 'ja', { cancel: 'キャンセル', … }),
    'my-locale: common dictionary',
  )
}
```

Durchgesetzt wird dabei: ASCII-BCP-47-Kennung, die **Fallback-Kette muß bei `en`
enden**, unbekannte Ziele / doppelte Kennungen / Kreise **scheitern bei der
Anmeldung**, und ein Sprachpaket kann **jeden Namensraum einzeln** nachliefern —
German läßt sich also anhängen, **ohne** die eingebauten `zh`/`en`-Wörterbücher
anzufassen.

**Drei weitere Stellen, die für uns zählen:**

| Was | Wo | Bedeutung für uns |
|---|---|---|
| `verify-client-ui-i18n` | Kern, Werkzeug | erzwingt schon heute, daß Oberflächentexte **nur** über typisierte Wörterbücher hereinkommen — der Wächter, den wir für unsere Ausgaben nachbauen müssen |
| `__DSH_LOCALE__` | Kern, `read()` + `onChange(locale)` | die **eine** Quelle für Oberfläche **und** Terminal, statt zweier Schalter |
| Sprache ist **pro Benutzer**, auf Nicht-Loopback-Seiten sogar nur **prozeßlokal** | Kern, README | „der Admin setzt es für alle" ist **keine** Nachbildung, sondern eine **neue Ebene** über einer bewußten Kern-Entscheidung |

## 3. Wo die Texte heute stehen — gezählt

| Bereich | Zahl | Muster |
|---|---|---|
| `scripts/**.mjs` — Ausgabestellen, **ohne** Tests | **59** | `process\.(stdout\|stderr)\.write\|console\.(log\|error\|warn\|info)\|throw new Error\(`, Testdateien abgezogen |
| `scripts/**` — Hüllen-Ausgabestellen (`.ps1/.sh/.cmd`) | **144** | `Write-Host\|Write-Error\|Write-Warning\|echo \|printf\|>&2` |
| `packages/**/src` — Ausgabestellen | **81** | dieselbe Musterfamilie, `*.test.ts` abgezogen |
| davon allein `units/unit-export/src/cli.ts` | **38** | — (also fast die Hälfte) |
| `apps/cli/src` — echte Laufzeitstellen | **5** | dieselbe Familie; die sechste Fundstelle liegt in einem JSDoc-Block |
| `apps/web/src` — sichtbare Texte | **6** | davon **4 deutsch**, 2 englisch/Marke |
| `services/**` (Go) — Ausgabestellen | **228** | `fmt\.Print\|log\.Print\|http\.Error\|errors\.New\(\|fmt\.Errorf\(` |
| eigene Messung, engeres Muster: `[pmh]`-Zeilen in `scripts/` + `apps/cli/src` | **21** | `\[pmh\]` |

**Und die Gegenprobe zur Frage „gibt es schon etwas?"** — die Antwort ist belegbar
*nein*: `i18n|l10n|locale|übersetz|Sprachwahl|messageCatalog` über alle Codebäume
ergibt **37 Treffer, und jeder einzelne ist etwas anderes**: „übersetzt" heißt dort
*Daten umformen* (Flags → argv, Werkzeugaufruf → Anbieterformat), „Übersetzer" ist
der **JIT-Compiler**, und `website/docs.ts:47 i18n: 'Übersetzungen'` ist eine
**Kapitelüberschrift**. `\bt\(['"]` in `packages` → **0**.

## 4. Die vier harten Sperren

**1. ~859 Zusicherungen in Prüfungen binden den deutschen Wortlaut.** `packages`
**644**, `scripts` **215** (Muster `\.to(Be|Contain|Equal|Match|Throw|…)(['"\`]`).
Die brüchigste Klasse sind Zusicherungen auf `Error.message`, weil sie **Quelltext**
festnageln: `toThrow('Pfadtrenner')`, `toThrow('Lücken')`,
`toBe('Werkzeug "kaputt" ist gescheitert: Platte weg')`,
`toBe('5 ein / 2 aus (gemeldet) · 1 Anfrage')`,
`toContain('GRENZE ÜBERSCHRITTEN')` … **Wer die Quelltexte übersetzt, muß die
Prüfungen im selben Schritt mitziehen** — sonst wird eine Übersetzung zur roten Suite.

**2. Zwei Verbraucher hängen am Wort `[pmh]`, und ihr Ausfall ist STUMM.**

| Verbraucher | Muster | Was passiert, wenn sich das Wort ändert |
|---|---|---|
| `scripts/port-test.ps1:200` | `-match '^\[pmh\]'` | filtert die Zeilen des Starters — **die Prüfung testet danach nichts mehr und sagt trotzdem „bestanden"** |
| `docs/status/messsonden/startkosten.mjs:85` | `.includes('[pmh]')` | wirft die Starter-Zeilen weg, bevor `JSON.parse` läuft |

Dazu **vier Verbraucher auf deutschen Teilzeichenketten**
(`port-test.ps1:213,237,250,251,252,279`, `windows-host-check.ps1:35`,
`windows-host-eigenes-home.ps1:47`) — u.a. auf `core running` aus (bis 14.10.2026 stand dort der deutsche Satz „Core läuft" —
**als Maschinenschnittstelle**; er ist auf eine englische, stabile Kennung
umgestellt, weil die Maschinenausgabe nicht deutsch sein soll)
`apps/cli/src/main.ts:480`. Auch sie brechen **stumm**, nicht laut.

**3. `readme-paarung.mjs` koppelt `README.md` ↔ `README.de.md` strukturell**
(Überschriften, Codeblöcke, Linkziele). Ein Sprachumschalter, der die Struktur
einer der beiden ändert, läuft sofort auf Befunde.

**4. Es gibt weder einen Ort für die Einstellung noch eine Rückfrage.**
`packages/settings/settings/` enthält **0 Dateien** — das Einstellungspaket ist ein
leerer Platzhalter. `install.mjs` liest **kein** stdin (nur zwei Stellen im ganzen
Repoat lesen stdin: die Geheimnis-Schleifen in `geheimnis.mjs:41` und
`reset.mjs:47`), und es gibt genau **eine** Option: `--ohne-stapel`.

## 5. Was strukturell billig ist — der vorhandene Haken

In `scripts/` ist ein **injizierbarer Ausgabe-Senkkasten** schon fast überall
vorhanden:

```js
export function fuehreAus(…, schreibe = (t) => process.stdout.write(t))
```

Dreizehn Skripte nehmen `schreibe` bereits als Parameter
(`claim`, `migrate`, `apischluessel`, `geheimnis`, `reset`, `schluessel`,
`maschinenpfade`, `leck-haken`, `schema-stand`, `ledger-nachziehen`, `typecheck`,
`verlauf-reset`, `readme-paarung`). **Eine Sprachschicht kann dort andocken, ohne
einen einzigen Aufrufer zu ändern.**

Dazu drei bereits formförmige Stellen, die als Naht taugen:
`scripts/port-wahl.mjs:194 describePortChoice()`,
`scripts/token-adresse.mjs:123 announceAuthUrl(write)` und
`scripts/install-teile.mjs:281 umgebungsHinweise()` — dessen JSDoc sagt heute schon
*„Die Hinweise, die zu einer Umgebung gehören — **in der Sprache des Benutzers**"*
und hält die Sätze **fest verdrahtet auf Deutsch**.

## 6. Entscheidungen des Betreibers (14.10.2026)

1. **Der Admin schaltet Sprachen FREI**, der Benutzer wählt **unter den
   freigeschalteten**. (Nicht: eine Sprache für alle erzwingen.)
2. **Vorgabe ist Englisch** — auch beim Install.
3. **Der Installer wird „modern"**: Deutsch **und weitere Sprachen** sind dort
   **auswählbar**.
4. **Reihenfolge: erst diese Bestandsaufnahme, dann bauen** — sie liegt hiermit vor.

## 7. Was als nächstes gebaut wird (Fundament zuerst)

1. **Sprachpaket als Plugin** — `inject = ['locale']`, `addLanguage({id:'de', …})`
   plus Wörterbücher je Namensraum. Der Kern prüft die Fallback-Kette selbst.
2. **Instanz-Einstellung des Admin** — welche Sprachen freigeschaltet sind
   (Namensraum `locale`, Feld `preference` des Kerns bleibt für die **Wahl** des
   Benutzers; die **Freigabe** kommt von uns).
3. **Terminal über dieselbe Quelle** — `__DSH_LOCALE__` in `apps/cli`, damit
   Oberfläche und Terminal **einen** Schalter haben.
4. **Der Wächter** — ein Werkzeug, das anschlägt, sobald wieder ein fest
   verdrahteter deutscher Satz in einer **Ausgabe** steht. Ohne ihn ist die
   Mischung in vier Wochen zurück. Und die zwei stummen `[pmh]`-Verbraucher werden
   **zuerst** auf eine stabile Kennung umgestellt, die nicht die Ausgabesprache ist.
5. **Der Installer** bekommt die Sprachwahl: Vorgabe Englisch, Rückfrage nur am
   Terminal, `--sprache`/`PMH_LANG` für die Skriptbarkeit — damit bleibt er
   automatisierbar wie heute.

**Was ausdrücklich NICHT in diesen Schritt gehört:** die 228 Go-Ausgaben in
`services/**` (fremde Hand) und `website/.vitepress` (Bauzeit-Wert `lang: 'de-DE'`,
eigene Baustelle).

---

## 8. Die Namensräume des Kerns — nachgemessen am 14.10.2026 (**Korrektur zu §2 und §7**)

§2 sagt richtig, **daß** der Kern Wörterbücher je Namensraum führt, und §7 verlangt, sie
„je Namensraum" zu liefern. **Welche Namen das sind, stand bis heute falsch fest** — und
zwar an der Stelle, die den Auftrag bemaß.

### 8.1 Der Befund

| | alte Annahme | gemessen |
|---|---|---|
| Fächer | **39** (`docs/status/sprachumfang.json`, aus `export declare const NS`) | **56** (aus den Registrierungsaufrufen der Bündel) |
| Texte | 1786 | **2374** |
| davon Paketname statt Namensraum | — | **30 der 39** |

Der Grund steht in einer Zeile des Bündels:

```js
// node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js
ctx.locale.register("shortcuts.layout", { zh, en })
```

Das Paket heißt `dsh-client-ui-layout`, der Namensraum heißt **`shortcuts.layout`**. Wo die
Typdeklaration **kein** `NS` nennt, hatte der Trichter den **Paketnamen** als Notnamen
benutzt — und der Trichter **sagte das auch**: *„Fächer insgesamt: 39 (die übrigen sind
Behelfsnamen aus Paketnamen — Pakete ohne eigenes NS)"*. Der Hinweis stand da und wurde beim
Bauen des Pakets überlesen.

| Paket | Namensraum der Laufzeit |
|---|---|
| `dsh-client-ui-layout` | `shortcuts.layout` |
| `dsh-client-ui-approval` | `approval` |
| `dsh-client-ui-settings-plugins` | `settings.plugins` |
| `dsh-client-ui-sidebar-files` | `sidebarFiles` |
| `dsh-client-ui-settings-session-log` | `settings.sessionLog` |
| `dsh-client-ui-input-trigger` | `slash.menu` |
| `dsh-client-ui-workspace` | `workspace` |
| `dsh-client-ui-settings-general` | `settings` |
| … 22 weitere | siehe `docs/status/sprachquelle.json` |

### 8.2 Was das für das Paket bedeutet

1. **Ein Paket, das unter dem Paketnamen registriert, übersetzt nichts.** Es legt einen
   Namensraum an, den kein Aufruf abfragt. Die zwei bis heute „vollständigen" Fächer waren
   davon **nicht** betroffen: `common` und `settings.locale` sind beide echte
   Laufzeit-Namensräume, angelegt vom Sprach-Plugin-Kern `dsh-client-locale`
   (`COMMON_NS`, `SETTINGS_NS`).
2. **`common` ist die Fallback-Kette.** Im Kern steht wörtlich
   `this.lookup(ns, key, chain) ?? (ns !== "common" ? this.lookup("common", key, chain) : void 0)`.
   Ein deutsches `common` deckt damit **jede** Lücke eines anderen Namensraums — es ist der
   Hebel mit der größten Wirkung pro Text.
3. **Die Prüfung maß gegen die falsche Liste.** `--pruefen` verglich das Paket mit
   `sprachumfang.json` und hätte ein Paket **gelobt**, das 30 nutzlose Namensräume füllt —
   und den **richtigen** Namen (`approval`) als „Namensraum, den der Kern NICHT kennt"
   gemeldet. Die Maßlatte ist jetzt `docs/status/sprachquelle.json`.
4. **Der Umfang ist größer als gedacht.** Die größten Fächer der alten Liste stimmen
   (`conversation` 371, `chat` 190, `cordis` 51), aber `pluginManager` (206), `trajectory`
   (192), `schedule.manager` (134), `settings.account` (94) und `settings.models` (113)
   standen **gar nicht** darin.

### 8.3 Der Weg, auf dem die Zahl entstand — vier Korrekturen an einer Sonde

Jede Korrektur kam aus einer Messung, nicht aus Nachdenken; jede ist in
`docs/status/messsonden/sprachnamensraum-sonde.mjs` im Kopf dokumentiert.

| # | Fehler | Wirkung | Beleg |
|---|---|---|---|
| 1 | nur **Literale** als erstes Argument gesucht | 14 Namensräume statt 56 | `const NS = "chat"; locale.register(NS, …)` |
| 2 | `.locale.register(` verlangt einen **Punkt** vor `locale` | 26 Registrierungen sahen wie Leser aus | `locale.register("chat", {zh, en})` |
| 3 | Tafel nach Namensraum gekeyt, **letzte Nennung gewinnt** | `chat` galt als Nur-Leser | `register("chat", …)` **vor** `bind("chat")` |
| 4 | Objektblock mit den **meisten Treffern** | englische Texte waren chinesisch | `en` und `zh` haben denselben Schlüsselsatz |

Dazu eine **ungültige Gegenprobe** (Arbeitsweise Regel 18): die erste Fassung verlangte,
daß `common` als Literal in einem Bündel vorkommt — `common` steht aber in **keinem**
Paket-Bündel. Die zweite Fassung nimmt `chat`, belegt durch `const NS = "chat"` @307341.

### 8.4 Die Werkzeuge, die daraus entstanden sind

| Werkzeug | Aufgabe | Gegenprobe |
|---|---|---|
| `scripts/sprachquelle.mjs` | englische Wörterbücher aus den **Registrierungsaufrufen** lesen | 4 unabhängige Zahlen: `chat` 190, `conversation` 371, `cordis` 51, `deliverables` 60 — **alle vier exakt** |
| `scripts/sprachpruefer.mjs` | Paket gegen die Quelle prüfen (Platzhalter, Rand-Leerzeichen, erfundene Schlüssel) | `scripts/tests/sprachpruefer.test.mjs`, **12 Prüfungen**, sechs Fehlerarten müssen rot werden |
| `scripts/sprachaufteilung.mjs` | Auftrag teilen **und** Vereinigung nachrechnen | Fächer ohne `common` = 55, in Teilen = 55 |
| `scripts/sprachwerte.mjs` | englischen Text **eines** Fachs ausgeben (Nachschlagewerk) | wählt den Block `en`, nicht den ersten |

### 8.5 Stand

**2374 von 2374 Texten übersetzt, 56 von 56 Fächern VOLLSTÄNDIG** (Stand 14.10.2026).

| Schritt | Ergebnis | Beleg |
|---|---|---|
| Umfang gemessen | 56 Namensräume, 2374 Texte | `bun scripts/sprachquelle.mjs` — vier Gegenproben exakt |
| Auftrag geteilt | 9 Teile, 55 Fächer, 2333 Texte | `bun scripts/sprachaufteilung.mjs` — Gegenprobe 55 = 55 |
| übersetzt | 9 Teile abgeliefert | `docs/status/uebersetzung/teil-*.json` |
| geprüft | **keine** Strukturfehler | `bun scripts/sprachpruefer.mjs --paket packages/client/locale/de.json` |
| vereinigt | kein Schlüssel fehlt | `bun scripts/sprachaufteilung.mjs --vereinigen` |
| Terminologie | 28 Stellen vereinheitlicht | `bun scripts/sprachbegriffe.mjs` |
| Testsuite | 1404 pass, 13 fail | die 13 liegen in Datenbank-, Rust- und Zeitsperren-Prüfungen; **keine** Prüfung unter `packages/**` nennt die Sprachdateien |

**Was der Prüfer weiter meldet:** 72 „Verdachtsfälle" der Art *unverändert englisch*. Das sind
Wörter, die im Deutschen gleich lauten (`Status`, `Revision`, `Minute`, `To-dos`) oder
Werkzeug- und Produktnamen (`bash`, `glob`, `grep`, `JSON`, `DSH`, `DeepSeek Harness`). Der
Prüfer **urteilt nicht** über sie — er nennt sie, damit sie angesehen werden.

**Was noch offen ist:**

1. **~~Die Komposition fehlt.~~ ERLEDIGT am 14.10.2026.** `packages/client/locale/` hat jetzt
   eine `package.json` mit `dsh.client` (`platform: web`,
   `inject: ["@deepseek-ai/dsh-client-locale"]`), eine leere Knoten-Hälfte (`lib/index.js`,
   wie beim Kern) und eine **gebaute** Browser-Hälfte (`lib/client.js`, 149 kB, mit allen
   2374 Texten). Die Zeile steht in `scripts/profile-patch.mjs` (`EIGENE_PAKETE`); der Starter
   schreibt sie bei jedem Start in die Patch-Schicht.

   Gemessen am **lebenden Host** (`bun scripts/start.mjs --no-go --port 3081`) mit
   `docs/status/messsonden/client-komposition-sonde.mjs`, **Exit 0**:

   | Stufe | Ergebnis |
   |---|---|
   | Patch-Schicht | Zeile steht in `profiles/web/cordis.patch.yml` |
   | Startliste des Browsers | **67 Einträge**; unser Eintrag mit `inject: ["@deepseek-ai/dsh-client-locale"]` |
   | ausgeliefertes Bündel | HTTP **200**, **151 522 Zeichen**, Umschlag, Kennung, `inject`, deutscher Text |

   `lib/client.js` ist **erzeugt** (`scripts/client-buendel.mjs`), nicht handgeschrieben — die
   Quelle bleibt `src/index.ts` + `de.json`. `bun.lock` wuchs um **6 Zeilen**, nur um unser Paket.
2. **Der Client als Zeuge — GEMESSEN, mit benannter Grenze.** Die Sonde
   `docs/status/messsonden/sprachpaket-laufzeit-sonde.mjs` (**Exit 0**) lädt die
   **Originalklasse** `LocaleRuntime` aus dem Kern-Bündel und führt **unser gebautes Bündel**
   daran aus:

   * Sprachliste danach: `[{zh, 中文}, {en, English}, {id: "de", label: "Deutsch", fallback: "en"}]`
   * `setLocale("de")` → aktive Sprache `de`
   * **7 von 7** Proben liefern genau den Text aus `de.json`, darunter ein ganzer Satz
   * **Gegenprobe:** die Laufzeit wirft bei doppelter Sprachanmeldung — sie ist echt, keine Attrappe

   **Grenze:** der Cordis-Kontext ist mitgeschrieben (`new Context()`), die Anzeige-Sitze
   (`ctx.slots`, `document`) sind nicht besetzt, und die eingebauten englischen Wörterbücher
   des Kerns sind in dieser Messung **nicht** angemeldet. Gemessen ist die **Laufzeit und ihre
   Regeln** — nicht, was ein **Browser anzeigt**.
3. **Zwei Werte sind bewußt leer** (`chat · message.stepProcess.sharedPrefix` = `""`,
   `pluginManager · sentenceSeparator` = `" "`). Beide bleiben unverändert; ein früherer
   Auftragstext verlangte fälschlich „kein Wert ist leer" und hat einen Übersetzer zu einer
   Erfindung verleitet (Arbeitsweise Regel 21).

4. **Nicht gemessen: der volle Client im Browser** (React-Mount, Einstellungszeile „Sprache",
   HMR-Nachladen). Ein Browser stand nicht zur Verfügung — `chrome-devtools` meldet
   *„Could not find Google Chrome executable"*. Das ist eine **Grenze der Umgebung**, kein
   offener Punkt des Pakets.
