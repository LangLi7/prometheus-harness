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
