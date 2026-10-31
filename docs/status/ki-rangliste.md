# KI-Rangliste — die bevorzugte Wahl je Fähigkeit

> **Anlass.** Der Betreiber, 15.10.2026: *„kannst du alle Plugin erstellen die wir besprochen haben
> betreff des AI models und schnittstelle ect? und verwaltung checking updating Free API model tier
> auf funktionalität und Verdrahtung als eine art liste Bevorzugt, ranking dazu? der Plugin core
> für den AI Models und auch schnittstelle local auch noch insgesamt existiert 3 dinge die
> miteinander arbeiten"* — und auf die Rückfrage nach dem Zuschnitt: **„komplett"**, mit der
> Datenbasis **„Tabelle als Saat, Messung schlägt sie"**.
>
> **Befund vor dem Bau:** zwei der drei Dinge **existierten schon**. Dieses Dokument sagt zuerst,
> was schon da war — und dann, was fehlte und gebaut wurde.

---

## 1. Was schon da war (nicht neu gebaut)

Gemessen am 15.10.2026 im Arbeitsbaum. Die acht Pakete der Gruppe `packages/ai` und drei der Gruppe
`packages/api` tragen die drei Rollen, die der Betreiber nennt:

| Rolle des Betreibers | Paket | Dateien |
|---|---|---:|
| **„Plugin core für die AI Models"** | `packages/ai/capabilities` — der Vertrag: sechs `Faehigkeit`en, `Anbieter`, die Registratur `Faehigkeiten`, Eskalation `handeln`/`rueckfrage`/`mensch` | 5 |
| | `packages/ai/composition` — fügt Einstellungen, Anbieter und den Menschen zusammen | 4 |
| | `packages/ai/settings` — die Wahl des Endnutzers (Fähigkeit → Anbieter + Modell) | 6 |
| | `packages/ai/guard` — prüft vor der Tat, entschärft Geheimnisse in Texten | 5 |
| **„Schnittstelle"** | `packages/ai/provider-directory` — **sieben** API-Familien mit ihrem Weg je Fähigkeit, plus die **Sonde** (6 Dateien; **auf 7 gewachsen** — siehe §2) | 7 |
| | `packages/ai/openrouter` — die Umsetzung: vier Fähigkeiten, Schlüssel nur als Quelle | 5 |
| **„Verwaltung, checking, updating"** | `packages/ai/directory-curator` — Katalog mit Meßdatum, Verwalter (`start`, `zeitplan`, `schluessel-fehlt`, `von-hand`), Ausleger | 7 |
| **„local"** | `packages/ai/local` — lokale Gewichte: holen, prüfen, ablegen | 4 |
| | `packages/api/speech-local-base`, `speech-nemo-de-local`, `speech-whisper-local` | 8 |

Die Sonde ist der Teil, der das „checking" trägt: sie schickt einen **absichtlich unbrauchbaren**
Auftrag und liest nur den Status — `404` heißt „den Weg gibt es nicht", `400` heißt „den Weg gibt
es, der Auftrag war falsch", `401` heißt **unbekannt**. Eine abgewiesene Anfrage erzeugt keine
Rechnung; deshalb kostet die Prüfung nichts.

### 1.1 Was trotzdem fehlte — und wie es gemessen wurde

| Prüfung | Befund |
|---|---|
| Suche über `packages/ai` nach `kostenlos\|gratis\|free\|tier\|tarif\|preis` | **kein Preis als Daten.** Nur der Satz, daß die *Sonde* kostenlos ist |
| Suche über `packages/ai` nach `rangliste\|bevorzugt\|ranking\|rang` | **nichts.** Nur in `capabilities` der Satz „die Reihenfolge ist die Rangfolge" — und das ist die Eintragsreihenfolge **im Quelltext** |
| `provider-directory.frageModelle()` | gibt `readonly string[]` zurück — **das Preisfeld der Models-API wurde beim Lesen verworfen** |
| `directory-curator.Katalogeintrag` | trägt `geprueftAm`, `wege`, `auslegung`, `widerspruch` — **keine Bewertung, keinen Rang** |

**Die drei Teile waren gebaut, aber nicht zur Liste verbunden.** Genau das war die Lücke.

---

## 2. Was gebaut wurde — vier Units und eine Ansicht

| Unit | Aufgabe | Dateien |
|---|---|---:|
| `packages/ai/tariffs` | **Was es kostet.** Preismodell, Saat-Tabelle, Kostenart, Verschmelzungsregel | 7 |
| `packages/ai/ranking` | **Was zuerst.** Die Ordnung, die Empfehlung, die Begründung | 5 |
| `packages/ai/router` | **Die Auswahl.** Erst die Wahl des Endnutzers, dann die Rangfolge — oder ein Wurf mit allen Gründen | 4 |
| `packages/api/ai-ranking` | **Die Schnittstelle.** Dienst `ctx.aiRanking`, `GET /api/ai/ranking` und die Anmeldung beim Start | 4 |

Dazu **zwei Änderungen an Bestehendem**:

- `provider-directory` kann jetzt Preise lesen (`frageModelleMitPreis`). Die alte Fläche
  `frageModelle` bleibt unverändert — ein eigener Testfall hält das fest.
- `composition` trägt `meldeQuellen()` — **das** Stück, das die drei Teile verbindet (siehe §3.1).

### 2.1 Der Router — die Lücke zwischen „gerechnet" und „gewählt"

`Faehigkeiten.waehle()` aus `capabilities` nimmt den **ersten einsatzbereiten** Anbieter in
**Eintragsreihenfolge** — also in der Reihenfolge, in der jemand `anbieten()` gerufen hat. Das ist
eine Reihenfolge **im Quelltext**, keine Bewertung. Die gerechnete Rangfolge hatte bis hierher
**keinen Aufrufer**: sie war eine Liste, die niemand las.

`packages/ai/router` ist der Aufrufer. Die Reihenfolge der beiden Fragen ist die Entscheidung:

| # | Frage | Warum |
|---|---|---|
| 1 | Hat der Endnutzer **ausdrücklich gewählt** — und ist die Wahl bereit? | Eine ausdrückliche Wahl ist die Entscheidung eines Menschen. Sie schlägt jede Rechnung |
| 2 | Was sagt die **Rangfolge**? | Erst hier entscheidet die Rechnung: Verdrahtung, Befund, Preis |

**Eine nicht bereite Wahl wird nicht stillschweigend übergangen.** Wer `zai` wählt und den
Schlüssel vergisst, bekäme sonst `openrouter` — und erführe nie, daß seine Wahl nicht griff. Der
Grund steht in `Wahl.verworfen`, und die Wahl **kommt zustande**; sie ist nur nicht die gewünschte,
und das ist sichtbar. Ein Testfall hält genau das fest.

Kann niemand, **wirft** `waehle()` — mit **allen** Gründen, je Kandidat einer. Ein Urteil, das
niemand gefällt hat, sieht aus wie eine Antwort.

### 2.2 Lokal und entfernt — der Fall, der vorher unsichtbar war

Die Rangliste baute ihre Kandidaten **nur aus `FAMILIEN`**. Ein lokaler Anbieter steht in keiner
solchen Tabelle: er hat keine Basisadresse, keinen Schlüssel, keinen Modellweg. Er war damit
**gar nicht in der Liste** — und eine Rangliste, die nur Dienste kennt, ist für „lokal und
entfernt" die halbe Antwort.

Jetzt sind es **zwei Arten von Kandidat**, und das Ergebnis trägt den Unterschied als Feld
`imVerzeichnis`:

| Fall | `imVerzeichnis` | `verdrahtet` | Befund | Rang |
|---|---|---|---|---|
| Familie des Verzeichnisses | `true` | je nach Umsetzung | gemessen | nach Befund |
| **Umsetzung ohne Verzeichniseintrag** (lokal) | **`false`** | `true` | `unbekannt` | hinter jedem **gemessenen**, vor einem gemessen **fehlenden** |

Der Grund steht in der Zeile: *„NICHT im Verzeichnis: … Das ist der normale Fall eines LOKALEN
Anbieters."* Wer das später liest, soll den Unterschied sehen und nicht rätseln, warum kein Befund
dasteht.

### 2.3 Der Mensch steht ganz hinten — und warum das eine eigene Regel braucht

`capabilities` sagt es an zwei Stellen: *„Der Mensch ist der letzte Anbieter."* Ohne eine eigene
Regel im Vergleich entschied aber der **Name**: `mensch` steht alphabetisch vor `openrouter` und
hätte jeden verdrahteten, noch **ungemessenen** Anbieter geschlagen. Ein Mensch, der eine Maschine
verdrängt, weil sein Name früher im Alphabet steht, wäre genau der stille Fehler, den diese Liste
verhindern soll. Zwei Testfälle halten es fest — einer prüft die Reihenfolge, einer den Aufruf (der
Mensch **wirft**, wenn er gefragt wird: so beweist der Test, daß er nicht gefragt wurde).

### 2.1 Die Ordnung, und warum sie so herum liegt

Die Rangfolge ist **lexikografisch**. Die Reihenfolge der vier Fragen ist die eigentliche
Entscheidung dieses Baus:

| # | Frage | Warum **so** früh |
|---|---|---|
| 1 | Gibt es eine **Umsetzung**? | Ein noch so billiger, gemessener, vorhandener Weg ist **unbenutzbar**, wenn niemand ihn aufruft |
| 2 | Ist die Fähigkeit **gemessen vorhanden**? | „Der Weg ist da" ist nicht „die Fähigkeit wirkt" |
| 3 | Was **kostet** es? | Erst wenn zwei Kandidaten brauchbar sind, entscheidet Geld |
| 4 | Familienname, dann Modellname | **Nur** damit zwei gleiche Läufe dieselbe Liste ergeben |

**Die eine Zeile, an der die Liste hängt:** ein **unbekannter Preis sortiert sich nach hinten**.
`KOSTEN_RANG` gibt `unbekannt` den höchsten Wert, nicht den niedrigsten. Ohne diese Umkehr stünde
das Modell, dessen Rechnung niemand kennt, ganz vorn — weil ein fehlender Wert in jeder Sortierung
als kleinster durchgeht. Ein eigener Testfall hält das fest.

### 2.2 Vier Kostenarten, und warum drei nicht reichen

| Kostenart | Wann sie gilt | Was sie heißt |
|---|---|---|
| `kostenlos` | Preis bekannt **und** Summe `0` | Der Aufruf kostet nichts |
| `freibetrag` | Ein Kontingent ist **benannt** (Menge, Einheit, Beleg) | Ein Teil ist frei, danach wird abgerechnet |
| `kostenpflichtig` | Preis bekannt **und** Summe `> 0` | Es kostet, und wir wissen wieviel |
| `unbekannt` | Kein Preis | **Nicht** billig — nur unbekannt |

Vorrang: ein Preis von `0` schlägt ein genanntes Kontingent (dann ist das Kontingent
bedeutungslos); sonst schlägt der Freibetrag den Preis, weil er die Frage „geht das umsonst?"
beantwortet.

### 2.3 Die Saat und die Messung

**Die Regel, in einem Satz: die Messung schlägt die Tabelle; wo nichts gemessen ist, bleibt die
Tabelle.**

Eingetragen sind **sieben** Tarife, alle am 15.10.2026 über
`GET /api/v1/models/<kennung>/endpoints` gemessen und im Wortlaut aus
`packages/ai/openrouter/src/index.ts` übernommen — **nicht neu gemessen**, **nicht umgeschrieben**:

| Modell | hinein | heraus |
|---|---:|---:|
| `openai/gpt-oss-20b` | 0,02 | 0,09 |
| `inclusionai/ling-3.0-flash` | 0,02 | 0,06 |
| `google/gemini-3.8-flash` | 0,75 | 3,75 |
| `google/gemini-3.8-flash-tts` | 0,50 | **9,00** |
| `google/gemini-3.5-transcribe` | 2,00 | 12,00 |
| `google/gemini-embedding-2` | 0,20 | 0 |
| `typesafe/jev-router` | **unbekannt** (`-1`) | **unbekannt** |

Alle Angaben in USD je 1 Mio Token.

**Ein gemessener unbekannter Preis überschreibt die Tabelle NICHT.** `-1` heißt „diese API nennt
keinen Preis" — nicht „dieser Anbieter kostet nichts". Beides als Überschreibung zu lesen hieße:
eine API ohne Preisfeld löschte jeden eingetragenen Preis. Eigener Testfall.

**Sechs Familien haben gar keinen Eintrag** (`deepseek`, `anthropic`, `zai`, `zenmux`, `nous`,
`opencode`). Das ist keine Leerstelle, sondern eine Aussage — `OHNE_PREIS` nennt sie ausdrücklich,
damit niemand die Abwesenheit als „gratis" liest.

### 2.4 Was ausdrücklich NICHT behauptet wird

**Kein einziger Gratis-Tarif ist eingetragen.** Nicht, weil es keine gäbe — sondern weil **keiner
gemessen** ist. Eine Liste, die einen Freibetrag behauptet, den niemand geprüft hat, schickt den
Betreiber in eine Grenze hinein, die er erst beim Überschreiten bemerkt. Ein Testfall hält fest,
daß die Saat **null** Einträge mit Kontingent und **null** als `kostenlos` enthält.

Wo ein Freibetrag gemessen wird, entsteht er als Eintrag mit `freibetrag` und Beleg.

---

## 3. Die Schnittstelle

```
  provider-directory ─► meldeFamilie()  ─┐
  directory-curator  ─► meldeKatalog()   ─┤
  capabilities/…     ─► meldeAnbieter()  ─┼─►  ctx.aiRanking  ─►  GET /api/ai/ranking
  tariffs            ─► meldeTarife()    ─┤                          ?faehigkeit=<name>
  die Sonde          ─► meldeModelle()   ─┘                          ?text=1
```

**Warum die Teile sich anmelden und nicht dieses Paket sie aufruft.** Dieselbe Regel, die `health`
für die Bereitschaftssonden zieht: `ai-ranking` darf `provider-directory` nicht kennen. Sonst hinge
die Liste an jeder neuen Familie, und ein Fehler in der Sonde risse den Endpunkt mit, der ihn
melden soll.

| Zusage | Umsetzung |
|---|---|
| **Geschützt** | `GET`/`HEAD` erst nach `requestRejection`; fehlt der Verbindungsdienst, **503** statt 200 |
| **Sperre vor Methode** | Ein Fremder mit `POST` bekommt **401**, nicht 405 — sonst wäre jede Antwort eine Auskunft über die erlaubten Methoden |
| **Kein Tippfehler als Vollauskunft** | `?faehigkeit=quatsch` ergibt **400** mit der Liste der gültigen Werte (nicht die volle Liste) |
| **`Content-Length`** | Der Kern verdichtet ab 1.024 Byte; ohne Längenangabe würde jede Antwort gzipiert |
| **`Cache-Control: no-store`** | Eine zwischengespeicherte Preisliste ist eine falsche Preisliste |
| **Keine Zugangsdaten** | `Anbieter` trägt seinen Schlüssel nicht; was hinausgeht, sind Kennungen, Preise und Gründe |
| **Erklärbare Leere** | Die Antwort nennt die Quellenzahlen — „es gibt nichts" und „niemand hat etwas angemeldet" sehen sonst gleich aus |

### 3.1 Die Verdrahtung — erstmals läuft das Paket im Host

Ein gebautes Paket ist noch nicht verdrahtet. `scripts/profile-patch.mjs` ist die **eine** Stelle,
die festhält, was von uns im Host läuft (`EIGENE_PAKETE`, daneben `health`, `readiness`,
`auth-http`, `client-locale`, `client-select-contrast`, `client-world-switch`, `world-static` und
die beiden lokalen Spracherkenner). Dort steht jetzt auch:

```
'@prometheus-harness/ai-ranking',
```

**Was das ändert.** Vorher war der Endpunkt ein Paket ohne Eintrag — er hätte nie geladen. Mit der
Zeile erscheint er in der Entry-Prüfung des Hosts und antwortet.

### 3.2 Die Quellen melden sich beim Start — die letzte Lücke

Der Endpunkt war gebaut, verdrahtet und **leer**: niemand meldete etwas an. Eine leere Liste mit
Grund ist besser als ein 404, aber sie ist noch keine Auskunft. Diese Lücke ist jetzt geschlossen —
und zwar an **einer** Stelle:

```
composition.meldeQuellen(register)   ←   gerufen von api/ai-ranking in `apply`
```

| Was eingetragen wird | Woher | Warum es beim Start gehen darf |
|---|---|---|
| **7 Familien** | `provider-directory.FAMILIEN` | eine **Konstante**: kein Netz, keine Datei, kein Fehlerfall |
| **7 Tarife** | `tariffs.SAAT` | eine **Konstante**, jeder mit Meßdatum und Fundstelle |
| Katalog | **gereicht**, nicht geholt | er kommt aus einem **Verwalterlauf** — sonst bliebe jede Fähigkeit `unbekannt` |
| Modelllisten | **gereicht** | sie kommen von der **Sonde** |
| Anbieter | **melden sich selbst** | sie sind Umsetzungen, keine Daten |

**Kein Katalog wird erfunden.** Fehlt er, wird **kein** leerer Katalog angemeldet — ein
`{fassung: 1, eintraege: {}}` behauptete, es sei gemessen worden und nichts gefunden. Der
Unterschied ist der zwischen „unbekannt" und „nichts vorhanden", und ein eigener Testfall hält ihn
fest.

**Was NICHT beim Start läuft:** die **Sonde** und der **Verwalter**. Sie messen und schreiben,
haben ihren eigenen Anlaß (`start`, `zeitplan`, `schluessel-fehlt`, `von-hand`) und würden in einem
lesenden Endpunkt eine Last und eine Fehlerquelle einführen, die er nicht braucht.

**Warum das eine Ausnahme von der eigenen Regel ist.** Der Dateikopf von `api/ai-ranking` sagt:
dieses Paket ruft `provider-directory` nicht auf. Genau **eine** Ausnahme gibt es, und sie ist eng:
die **Datentabellen**. Sie stehen im Kopf des Pakets benannt, mit dem Grund — und die Anmeldung
selbst liegt in `composition`, damit die Form **einmal** beschrieben ist und nicht zweimal.

**Und die Antwort sagt es.** Jede Antwort trägt `quellenbericht` — die Zeilen der Anmeldung. Damit
ist „die Liste ist leer" von „niemand hat etwas angemeldet" **und** von „beim Start ging etwas
schief" unterscheidbar, ohne im Host-Protokoll zu suchen.

### 3.3 Die Ansicht in der Oberfläche

Die Liste ist auch **sichtbar**, nicht nur abrufbar: ein Panel in der gebauten Oberfläche
`apps/universe`.

| Was | Wo |
|---|---|
| Die Ansicht | `apps/universe/src/ai-rangliste.ts` |
| Ihre Prüfungen | `apps/universe/tests/ai-rangliste.test.ts` — 24 |
| Eingehängt | `apps/universe/src/builtin-plugins.ts`, Heimatzone in `src/main.ts` |
| Stil | `src/app.css` (nur Tokens — keine eigenen Farben, keine Zahlen) |
| Beschriftung | `src/locales/de.ts` und `en.ts` — je **ein** Schlüssel `panel.ranking` |

Erreichbar über die Insel → Gruppe „Panels" → **KI-Rangliste**. Warum ein Panel und kein eigenes
Paket: in `apps/universe` ist das Panel die **einzige** Form, in der eine Ansicht wächst (Docking,
Reiter, Insel-Eintrag, Sprache, Reload-fest) — `apps/web` ist ein Gerüst ohne Panels, und ein
zweites Paket unter `packages/client/` wäre ein zweiter Weg für dieselbe Sache.

**Die Ansicht sortiert nicht.** Ein Testfall gibt eine Antwort mit **durcheinanderliegenden**
Rängen weiter und findet die Reihenfolge des Dienstes unverändert wieder — die Ordnung gehört dem
Dienst, nicht der Anzeige. Sie schreibt auch nichts und verlangt keine Modellwahl.

### 3.4 Das Bündel — der Weg in eine Plugin-Liste

Ein Paket mit `apply` ist geladen, aber es **erscheint in keiner Plugin-Liste**. Dafür braucht es
ein **Bündel**: die Kompositionsform des Kerns. Am Sprachbündel des Kerns gemessen sind es **fünf
Angaben**, und fehlt eine, verschwindet das Paket still aus der Liste:

| Angabe | Wofür | Wo |
|---|---|---|
| `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` | **der Marker** — ohne ihn ist es kein Bündel | `package.json` |
| `"icon": "./icon.svg"` | das Zeichen in der Liste | `package.json` + Datei |
| `locale/*.json` mit `meta.title` und `meta.description` | **genau dieser Satz steht im Fenster** | `locale/en.json`, `locale/de.json` |
| `exports` für `./cordis.patch.yml` und `./locale/*.json` | damit der Loader beides findet | `package.json` |
| `files` | damit beides mitgeliefert wird | `package.json` |

Gebaut: **`packages/bundle/ai-stack`** — 9 Dateien, keine Laufzeitlogik (`src/index.ts` besteht wie
beim Kern-Sprachbündel aus `export {}`). Die Substanz ist `cordis.patch.yml` mit **einer**
`insert`-Zeile.

**Die Kollisionsregel, und sie ist kein Detail:** der Core **wirft** bei doppeltem `(kind, path)`.
Die Kennung `pmh-ai-ranking` steht deshalb **entweder** im Bündel **oder** in
`scripts/profile-patch.mjs` (`EIGENE_PAKETE`) — **nie in beiden**, sonst startet der Host nicht.
Heute führt sie `profile-patch.mjs`; das Bündel ist die Bahn für die Plugin-Liste. Ein Testfall
hält fest, daß die Warnung **in der Patch-Datei selbst** steht — dort, wo die Gefahr ist.

**Installierbar ist es schon jetzt**, über den Unit-Export des Projekts:

```
$ bun packages/units/unit-export/src/cli.ts export --unit packages/bundle/ai-stack --out ai-stack.pmhunit --root packages
unit      ai-stack 0.1.0
digest    sha256:1c97f19356153821e63ba5c454c26dbf6758d1aaead760980d8e172ac47b53a8
content   sha256:bfa3b07af0793a5dc10d8935eaf1990dc21c6313bd3a968667704c3880e9395d
closure   ai-stack, ai-ranking
files     14 (55856 Bytes)
```

`closure ai-stack, ai-ranking` ist der Punkt: `requires: ["ai-ranking"]` im `unit.json` sorgt dafür,
daß wer das Bündel exportiert **das Plugin mitbekommt**, das es einträgt. `inspect` liest die Datei
unabhängig nach — 55 856 Bytes, alle Hashes bestätigt.

**Was fehlt, um es im Fenster zu sehen:** das Bündel muß im **Profil** aktiviert sein
(`dsh.profile.bundles`) — das ist eine Handlung am Profil, nicht am Paket. Und der Host auf
Port 3080 ist der **Referenz-Harness**, nicht Prometheus (Port 3081); Prometheus' eigene
Oberfläche hat **noch keine** Plugin-Verwaltungsseite.

### 3.5 Was `unit.json` bekommt — und was bewußt nicht

| Unit | `unit.json` | Warum |
|---|---|---|
| `packages/api/ai-ranking` | **ja** — `kind: plugin`, `provides: ["ai-ranking"]` | es **ist** ein Plugin (`name`, `inject`, `apply`) |
| `packages/bundle/ai-stack` | **ja** — `kind: plugin`, `requires: ["ai-ranking"]` | ein Bündel ist eine Kompositionsform |
| `packages/ai/tariffs`, `ranking`, `router` | **nein** | es sind **Bibliotheken**: kein `apply`, kein `inject`, kein Lebenszyklus |

**Warum die drei keines bekommen.** `units/README.md` kennt vier Arten: `plugin`, `service`,
`patch`, `skill`. **Keine davon paßt auf eine Bibliothek.** Sie als `plugin` zu deklarieren wäre
eine Aussage, die der Code nicht einlöst — und `unit-export` würde sie als ladbar ausgeben. Das ist
eine Erweiterung der Konvention (eine fünfte Art), und die ist eine Entscheidung des Betreibers,
keine Nebenwirkung dieses Baus.

`requires` bleibt bei `ai-ranking` **leer**, obwohl es von sechs Paketen abhängt: das Unit-Modell
kennt nur **Unit**-Abhängigkeiten. Eine Paketabhängigkeit dort einzutragen fände die Auflösung
nicht.

---

## 4. Nachweise, gemessen

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Typecheck über alle Pakete | `bun run scripts/typecheck.mjs` | **44 Pakete grün, 0 rot** (5,1 s) — vorher 40 |
| davon Preise | `bun test packages/ai/tariffs` | 20 pass |
| davon Sonde (alt und neu) | `bun test packages/ai/provider-directory` | 43 pass, 2 Dateien |
| davon Rangfolge | `bun test packages/ai/ranking` | pass (lokaler Fall, Mensch zuletzt) |
| davon **Router** | `bun test packages/ai/router` | **17 pass · 0 fail** |
| davon **Quellenanmeldung** | `bun test packages/ai/composition` | **18 pass · 0 fail**, 2 Dateien |
| davon Schnittstelle | `bun test packages/api/ai-ranking` | **27 pass · 0 fail** |
| **Die Ansicht in der Oberfläche** | `bun test apps/universe` | **330 pass · 0 fail**, 31 Dateien (vorher 306; neu: **24**) |
| Profil-Patch nach der Verdrahtungszeile | `bun test scripts` | 387 pass · 1 fail — der Fehlschlag ist **fremd** (siehe unten) |
| **Alles zusammen** (KI-Pakete + Schnittstelle + Ansicht) | `bun test packages/ai packages/api/ai-ranking apps/universe` | **683 pass · 0 fail**, 5176 Prüfaufrufe, 46 Dateien |
| Arbeitsbereich verlinkt | `bun install` | 3 Pakete installiert |
| Gesamtsuite dieses Rechners | `bun test packages scripts apps` | 2160 pass · 5 skip · **8 fail** · 1 error, 125 Dateien |

**Die Fehlschläge schwanken zwischen 8 und 9 und sind nicht aus diesem Bau.** Der Beweis ist eine
isolierte Messung: dieselben sechs Dateien **ohne** meine Pakete ergeben **21 pass · 6 fail** —
dieselben Fehlschläge. Es sind die im Projekt **dokumentierten**:
Datenbankprüfungen gegen die Betriebsdatenbank (`packages/auth/store-postgres`,
`packages/auth/db-schema`, `packages/api/auth-http`) und der Lauf gegen das **echte Rust-Binary**
(`packages/util/atomic-write` → `native/atomicfs`). Beides steht in
[grenzen-und-offenes.md](grenzen-und-offenes.md) als offen. **Kein Fehlschlag liegt in
`packages/ai/*`, `packages/api/ai-ranking` oder `apps/universe`.**

**Der eine Fehlschlag in `scripts/` ist nachweislich fremd.** Er heißt
`der Nachzieh-Block nennt die neuen Tabellengruppen und die DB-Warnung` und liegt in
`scripts/ledger-catchup.test.mjs`. Zwei Belege: (1) er stand **schon im Gesamtlauf, bevor**
`scripts/profile-patch.mjs` für die Verdrahtungszeile angefaßt wurde; (2) die Datei importiert
**nur** `./ledger-catchup.mjs` — kein `profile-patch`, kein `EIGENE_PAKETE`. Gemessen mit
`grep`; die Ausgabe ist im Protokoll dieses Baus.

**Vier eigene Fehler, die der Beleglauf gefunden hat** — und die Korrektur, nicht die Beschönigung:

| Fehler | Wie er gefunden wurde | Korrektur |
|---|---|---|
| `quellen()` als freier Name im Objektliteral aufgerufen | **Typecheck** (`TS2304`) — nicht der Testlauf | als benannte Funktion `holeQuellen()` herausgezogen |
| Feld hieß `verdratet` statt `verdrahtet` | Typecheck (`TS2551`) in beiden Testdateien | umbenannt; die Hausschreibweise ist „Verdrahtung" |
| `rangantwort` rechnete die Liste **zweimal** | eigene Durchsicht beim Schreiben der Schicht | einmal rechnen — sonst trügen `zahlen` und `rangliste` zwei verschiedene `erstelltAm` |
| Test griff auf `listen[0]` zu, das ist `gespraech` | Testlauf | der Test nennt jetzt die Fähigkeit, für die er etwas erwartet |

---

## 5. Grenzen — ehrlich, in der Reihenfolge, in der es weh tut

1. **Die Saat ist dünn, und das ist Absicht.** Sechs von sieben Familien haben keinen Preis. Bis
   die Sonde läuft, steht bei ihnen `unbekannt` — und damit hinter jedem bezifferten Modell.
2. **Die Preise sind nicht neu gemessen.** Sie stammen aus dem Kommentar in
   `packages/ai/openrouter/src/index.ts` vom 15.10.2026. Wer ihnen nicht traut, muß die Sonde
   laufen lassen (`frageModelleMitPreis`) — dann steht im Bericht, was überschrieben wurde.
3. **Für Sprache und Transkription ist „je 1 Mio Token" die Form des Anbieters, nicht
   zwingend seine Abrechnung.** Die Zahl für `gemini-3.8-flash-tts` (9,00 heraus) ist der teuerste
   Posten der Tabelle und bei Sprache ist „heraus" der Ton. Ob OpenRouter so abrechnet, ist
   **nicht** geprüft.
4. **Die Rangliste wählt nicht — der Router tut es.** Die Liste legt eine Reihenfolge vor
   (§2.1); `router.waehle()` wählt daraus. Welches **Modell** läuft, entscheidet weiterhin der
   Endnutzer über `settings` — der Router wählt **wer** antwortet, nicht **womit**. Diese Grenze
   ist dieselbe, die der Verwalter zieht.
5. **Der Katalog muß von außen kommen.** Ohne Verwalterlauf ist jede Fähigkeit `unbekannt`, und
   die Liste empfiehlt **nichts**. Das ist gewollt (eine Empfehlung verlangt einen gemessenen Weg),
   heißt aber: ohne Sonde ist die Liste eine Aufzählung, keine Empfehlung.
6. **Der Katalog und die Modelllisten kommen beim Start NICHT an.** Familien und Saat melden sich
   selbst (§3.2) — der **Katalog** braucht einen Verwalterlauf, die **Modelllisten** einen
   Sonnenlauf. Bis dahin ist jede Fähigkeit `unbekannt`, und die Liste empfiehlt **nichts**. Das ist
   gewollt (eine Empfehlung verlangt einen gemessenen Weg), heißt aber: ohne einen Lauf der beiden
   ist die Liste eine Aufzählung mit Preisen, keine Empfehlung. **Wer sie fährt, ist offen** — der
   Verwalter hat dafür vier Anlässe, aber keinen Aufrufer im Host.
7. **Der Router hat noch keinen Aufrufer im Agenten-Loop.** `waehle()` ist gebaut, geprüft und
   dokumentiert — aber der Kern wählt sein Modell weiterhin über `settings` und
   `Faehigkeiten.waehle()`. Den Router dort einzuhängen **ändert das Auswahlverhalten des
   Harness** und ist deshalb eine Entscheidung des Betreibers, nicht dieses Baus. Was fehlt, ist
   eine Zeile an der richtigen Stelle — und die Festlegung, ob die Rangfolge die Eintragsreihenfolge
   **ersetzen** oder nur **beraten** soll.
8. **Kein Verlauf.** Die Liste ist eine Momentaufnahme. Ob ein Preis gestiegen ist, sagt sie
   nicht — dafür müßte der Katalog über Zeit verglichen werden.
9. **Die Ansicht importiert die Typen des Dienstes NICHT.** Gemessen: `tsgo -p
   apps/universe/tsconfig.json` meldet über die ganze Kette **`TS5097`**, weil
   `apps/universe/tsconfig.json` **nicht** von `tsconfig.base.json` erbt und die Pakete mit
   `.ts`-Endung importieren. Die Option `allowImportingTsExtensions` wurde **bewusst nicht** in die
   Anwendung geschrieben; die Leser-Typen stehen deshalb lokal, und die Antwort wird zur Laufzeit
   geprüft. Zwei Prüfungen halten die Kopplung fest, indem sie den Pfad und die gelesenen
   Feldnamen gegen `packages/api/ai-ranking/src/index.ts` und `packages/ai/ranking/src/rang.ts`
   **vergleichen**. **Driftet der Vertrag, fällt es beim Testen auf — nicht beim Lesen.**
10. **Kein Bild und kein Build.** Ob die Ansicht *gut aussieht* — Umbruch in der Zone, Abstände —
   ist **nicht** gemessen; die Gestaltungsprüfungen (`design.test.ts`, `typo-scale.test.ts`) sind
   grün, das ist alles. Ein Vite-Build von `apps/universe/dist` wurde **nicht** gefahren, und ein
   Lauf gegen den **echten** Host steht aus: `401`, `503` und der Netzfehler sind über
   **injizierte** Antworten geprüft, nicht über HTTP.
