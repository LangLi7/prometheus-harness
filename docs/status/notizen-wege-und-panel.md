# Die Notizen in der Welt — Wege, Panel, Messungen

**Stand:** 2026-02 (Runde: Notiz-Wege im Wirt + Welt-Plugin `notes`)
**Ziel:** Die Notizen aus Obsidian sind nicht mehr nur in Postgres, sondern **über den Wirt
abrufbar** und **in der Welt sichtbar** — je Konto, ohne zweite Wahrheit.

## 1. Was gebaut wurde

| Ort | Was |
|---|---|
| `packages/api/auth-http/src/notizen.ts` | Drei Wege: `GET /api/pmh/notizen`, `POST /api/pmh/notizen/vault`, `POST /api/pmh/notizen/einlesen` |
| `packages/api/auth-http/src/sitzung.ts` | Sitzungs- und CSRF-Prüfung **einmal** statt je Modul (vorher privat in `folders.ts`) |
| `packages/auth/store-postgres/src/notizen.ts` | `vaultsLesen` — Kennung, Pfad und Anzahl Notizen eines Kontos |
| `apps/universe/src/notizen.ts` | Das Plugin `notes`: Panel (Liste + Suche), Befehl `notizen`, Gesundheitsprüfung, Einstellung |
| `apps/universe/src/app.css` | Der Stil des Panels, ausschließlich aus Tokens (Vorlage kann umfärben) |
| `apps/universe/src/locales/{de,en}.ts` | 32 Schlüssel je Sprache |
| `apps/universe/tools/cdp.mjs` | Port kommt aus `DevToolsActivePort` (siehe §5) |

### Der offene Punkt der letzten Runde ist entschieden

Die Frage war: **wie** kommt ein Konto zu seinem Vault-Pfad — still aus `obsidian.json`
übernehmen, oder ausdrücklich setzen? Entschieden ist **beides getrennt**:

* `GET /api/pmh/notizen` liefert bei einem Konto ohne Vault einen **`kandidat`** (den auf dieser
  Maschine geöffneten Vault aus `obsidian.json`) — und trägt ihn **nicht** ein.
* Eingetragen wird nur durch `POST /api/pmh/notizen/vault` (CSRF-geschützt, Pfad geprüft).

**Warum nicht still übernehmen.** Ein Wirt, der von sich aus ein Verzeichnis übernimmt, trägt
Daten eines Kontos in ein anderes ein, sobald zwei Leute dieselbe Maschine benutzen. „Der Admin
hat auch sein eigenes" wäre dann nur noch eine Behauptung. Der Vorschlag ist Bequemlichkeit, der
Eintrag ist eine Entscheidung.

## 2. Was gemessen wurde — über HTTP mit echter Sitzung

Prüfskript: `.pmh-build/notizen-http.mjs` (legt zwei Prüfkonten über **dieselbe** `register`-Funktion
an, die auch der HTTP-Weg ruft, meldet sich über `POST /api/pmh/auth/login` an, benutzt die
gesetzten Kekse). **16 von 16 Prüfungen grün:**

| Prüfung | Ergebnis |
|---|---|
| ohne Cookie | `401 nicht-angemeldet` |
| POST ohne CSRF-Kopf | `403 csrf-fehlt` |
| relativer Pfad | `400 pfad-nicht-absolut` |
| Pfad mit `..` | `400 pfad-unbrauchbar` |
| Pfad, den es nicht gibt | `404 pfad-weg` |
| Datei statt Ordner | `400 pfad-kein-ordner` |
| vor dem Setzen | `vaults: 0`, `kandidat: "D:\Windows\Dokumente\Obsidian Vault"` |
| `POST /vault` | `200`, Vault-Kennung |
| `POST /einlesen` | `neu: 2, verweise: 1, offeneVerweise: 0` |
| zweiter Lauf | `neu: 0, geaendert: 0, unveraendert: 2` — der Abgleich greift |
| Liste | `notizen: 2`, `stand: {vaults:1, notizen:2, verweise:1, etiketten:0}` |
| ohne Vault | `kandidat: null` — der Vorschlag verschwindet mit dem Eintrag |
| Suche `q=Willkommen` | 1 Treffer |
| Suche `q=zzz-nichts-4821` | 0 Treffer |
| zweites Konto | `notizen: 0`, `vaults: 0` |
| zweites Konto mit **geratener** Vault-Kennung | `notizen: 0` |

Die letzte Zeile ist die Mandantengrenze: sie hängt nicht daran, daß die Kennung unbekannt ist,
sondern daran, daß **jede** Abfrage `user_id` mitprüft.

## 3. Was im Browser gemessen wurde

Prüfskript: `.pmh-build/notizen-panel.mjs` — meldet sich per HTTP an, setzt die Kekse per CDP
(`Network.setCookie`), öffnet `http://127.0.0.1:3081/universe/` und **liest das DOM**:

| Messung | Ergebnis |
|---|---|
| Anmeldung | `HTTP 200`, Kekse `pmh_session`, `pmh_csrf` |
| Panel im DOM | ja (`.notizen-liste`) |
| Einträge | **2** — `["Neuer Link", "Willkommen"]` |
| Zähler | `2 von 2 Notizen` |
| Fehlerzeile | leer |
| Abrufe an den Wirt | **1** × `/api/pmh/notizen?grenze=50` |
| Suche „Willkommen" | **1** Eintrag |

**Der eine Abruf ist ein Befund, kein Zufall.** Der erste Lauf zeigte **sieben** Abrufe für einen
offenen Reiter: jeder Neuaufbau der Fläche (Sprache, Zone, Plugin-Wechsel) ruft `render` erneut auf,
und jedes `render` fragte den Wirt. Mit einem Zwischenspeicher (`FRISCH_MS = 2000`, geteilte
laufende Abrufe) ist es einer. Ein ändernder Aufruf (Vault setzen, Einlesen) leert den Speicher —
sonst zeigte das Panel nach „einlesen" bis zu zwei Sekunden den alten Stand, und das sähe aus, als
hätte der Knopf nichts getan.

## 4. Die Gesundheitsprüfung sagt „nicht geprüft", nicht „in Ordnung"

Befehl und Gesundheitsprüfung sind **synchron**; sie können nicht warten und lesen deshalb den
zuletzt geholten Stand. War das Panel nie offen, meldet die Prüfung
`notes:ungeprueft — nicht geprüft — das Panel war noch nicht offen` mit `ok: false`. Wer hier
`ok: true` sagte, behauptete etwas über Daten, die nie geholt wurden.

## 5. Zwei Werkzeugfunde (gemessen, nicht vermutet)

* **Der Wirt stürzt ab — dreimal belegt, und die erste Erklärung war falsch.**
  `GLib-ERROR: g_system_thread_free: error Das Handle ist ungültig … during CloseHandle`,
  danach `beendet (exit 9)` und `FEHLER: unerwartet beendet`. Die drei Male:
  **18:50**, **19:27**, **19:30** — und der **dritte** Lauf hatte *keinen* kopflosen Browser
  davor. Meine Zwischenbehauptung („kommt von den CDP-Prüfskripten") ist damit **widerlegt**;
  sie stand eine Runde lang in diesem Dokument und wird hier berichtigt statt gelöscht.
  Gemeinsam ist den dreien etwas anderes: zwischen Start und Absturz liefen **Werkzeug-Aufrufe**
  des Wirts (jeder Turn startet Unterprozesse). **Berichtigt am 21.10.2026 — die damalige
  Vermutung war falsch.** Nicht Bun räumt hier auf: `bun.exe` (1.4.0+34cbb9a40) enthält **kein**
  GLib. Die Zeile kommt aus **libvips 8.18.7**, das GLib 2.90.0 statisch mitbringt und das der
  Anhang-Pfad beim ersten Bild in den Wirt lädt; im jüngsten Fall lag die letzte Bild-Annahme
  **vier Sekunden** vor dem Absturz. Beleg, Eindämmung und Rückweg:
  [bild-absturz.md](bild-absturz.md). Was folgt: der Zustand liegt in Postgres und im
  Harness-Home, ein Neustart von `scripts/start.mjs` stellt alles wieder her; die Oberfläche ist
  danach sofort da (gemessen: `GET /universe/` **200**, Notiz-Weg **200**).
* **Brave 155.1.97.59 öffnet den gewünschten CDP-Port nicht.** Mit
  `--remote-debugging-port=9223` lauschte nichts (`netstat` leer, `/json/version` verweigert);
  mit `--remote-debugging-port=0` schreibt der Browser den **tatsächlichen** Port in
  `<profil>/DevToolsActivePort`. `tools/cdp.mjs` liest ihn jetzt von dort und gibt ihn als
  `port` zurück — die alte feste Nummer war auf dieser Maschine stillschweigend wirkungslos.

## 6. Was (c) braucht: ein belegtes Einbettungsmodell

Die Vektorsuche über `pmh.chunks.embedding` ist **nicht** gebaut, und der Grund ist meßbar:

| Prüfung | Ergebnis |
|---|---|
| Spalte `chunks.embedding` | vorhanden (`vector 0.8.7`) |
| Chunker im Repo | vorhanden (`chunker.ts`) |
| Ollama installiert | **ja** — im Benutzerprofil unter `AppData\Local\Programs\Ollama\ollama.exe` |
| Ollama-Dienst | **läuft nicht** (`127.0.0.1:11434` antwortet nicht) |
| Einbettungsmodell | **keins gezogen** |

Ohne Modell gäbe es keine Vektoren; eine Suche „nach Ähnlichkeit" würde dann über lauter leere
Spalten laufen und **null Treffer** liefern — das sieht aus wie „funktioniert, findet nichts", und
genau das ist die Falle. Deshalb steht hier die Entscheidung offen, statt eine Attrappe zu bauen:

| Möglichkeit | Größe | Anmerkung |
|---|---|---|
| `ollama pull all-minilm` (384 Dimensionen) | ~46 MB | klein, lokal, schnell; gut genug für Titel und kurze Absätze |
| `ollama pull nomic-embed-text` (768) | ~274 MB | deutlich besser auf längeren Texten |
| Remote-Anbieter | — | kostet je Aufruf, sendet Notizinhalte aus dem Haus |

**Was danach zu tun ist** (unabhängig von der Wahl): `chunks` beim Einlesen füllen (der Einleser
schreibt bisher nur `notes`), `embedding` je Abschnitt schreiben, und die Suche um einen Modus
„ähnlich" erweitern — mit derselben `user_id`-Bedingung wie alles andere.

## 7. Offene Punkte dieser Runde

1. **Kein Test für das Panel selbst.** Gemessen ist es im Browser (§3), aber es gibt keine
   Prüfung im Testlauf (`apps/universe/tests`) — die Sprache, der Befehl und die
   Gesundheitsprüfung sind ungeprüft. Das ist die nächste Lücke.
2. **`register` wirft bei belegter Adresse.** Der Weg `POST /api/pmh/auth/register` fängt
   `email-taken` ab — aber die Funktion `register` läßt den Eindeutigkeitsfehler der Datenbank
   (`23505`) durch, statt ihn in `reason: 'email-taken'` zu übersetzen. Gemessen: das Prüfskript
   bekam `PostgresError … users_email_lower_key`. Über HTTP wäre das ein `500`, nicht ein `409`.
   Nicht in dieser Runde behoben (fremder Weg), aber aufgeschrieben.
3. **Rollen und Rechte der Notiz-Wege.** Jeder darf seinen eigenen Vault setzen — auch ein Konto
   ohne Admin-Recht. Das ist Absicht (eigener Vault wie eigener Arbeitsbereich), aber es ist
   nirgends als Regel festgehalten.

## 8. Entschieden vom Betreiber (diese Runde)

### 8.1 Einbettungen: **remote zuerst**, lokal später

Der Betreiber: *„ich würde remote anbieter also punkt 3, dementsprechen sollte später auch local
host oder self host suporten können für embed hat doch google ai und oder auch openrouter ein
gutes Usage, wegen api key sollten wir wie üblich machen per datenbank des user benutzen api key,
wahrscheinlich könnte man auch im plugin mehr einstellen implementieren ect"*.

Daraus folgt, in dieser Reihenfolge:

1. **Anbieter austauschbar**, nicht einer fest verdrahtet: Google AI und OpenRouter als erste
   zwei, je mit Modellkennung; ein späterer lokaler Dienst (Ollama, `llama-server`) ist ein
   **dritter** Anbieter derselben Schnittstelle — nicht ein Umbau.
2. **Der Schlüssel gehört dem Benutzer** und kommt aus der Datenbank (wie bei den vorhandenen
   API-Schlüsseln, `packages/auth/{secrets,apikey}`), nicht aus einer Umgebungsvariablen des
   Wirts. Damit ist „jeder zahlt seine Einbettungen" die Vorgabe und nicht die Ausnahme.
3. **Anbieter und Modell sind Einstellungen des Plugins** (`settings`-Beitrag), nicht Konstanten
   im Code — der Betreiber will sie im Panel umstellen können.
4. **Der Vektorraum gehört zum Modell.** Zwei Modelle erzeugen nicht dieselben Zahlen; die
   Dimension steht in der Spalte (`chunks.embedding`, derzeit 768). Ein Modellwechsel ist deshalb
   eine **Migration** (neu einbetten) und keine Einstellung, die man beiläufig umlegt. Das gehört
   als Warnung in die Einstellung, nicht in eine Fußnote.

**Stand (Runde 3) — die Blockade ist aufgehoben, und zwar anders als gedacht.** Beide Hälften
existieren **schon**, ich hatte in Runde 2 die eine nachgebaut und die andere übersehen:

| Hälfte | Wo | Zustand |
|---|---|---|
| Speicher der Vektorsuche | `erzeugeWissensspeicher` (`packages/auth/store-postgres`) — `legeDokumentAb`, `legeStueckeAb`, `offeneStuecke`, `setzeEinbettung`, `suche` | **gebaut und getestet**; `knowledge.test.ts` setzt fremde Vektoren *näher* heran und verlangt, daß kein fremder Treffer kommt (**6 pass**) |
| Anbieter | `packages/ai/capabilities` — `einbetten` ist **eine der sechs** Fähigkeiten, `Einbetter` ist eine eigene Schnittstelle; `packages/ai/openrouter` setzt sie um (`modellOderFehler('einbetten')`) | **gebaut** |

**Was wirklich fehlt, sind drei Stücke — und ein viertes, das ich in Runde 2 versehentlich
mitgelöscht habe:**

1. **Das Bindeglied beim Einlesen.** `world-obsidian/einleser.ts` schreibt heute nur `notes`; es
   zerlegt nichts, bettet nichts ein und legt keine Stücke ab. Ein `haben` von Wissensspeicher und
   Anbieter hilft erst, wenn jemand sie verbindet.
2. **Der Schlüssel je Benutzer** muss aus `user_secrets` (`speichereGeheimnis`/`ladeUmschlag`) zum
   Anbieter — heute gibt es dafür keinen Weg und keine Oberfläche (das ist der geplante
   Konten-Abschnitt in den Chat-Einstellungen).
3. **Der Weg `?aehnlich=…`** und die Anzeige im Panel.
4. **Das Packen eines Umschlags in *einen* Blob.** `verpacke` liefert vier Teile, der Wissensspeicher
   speichert `content_cipher` **undurchsichtig** (`index.ts:1215` gibt die Bytes direkt weiter,
   `:1285` liest sie als Buffer zurück) — es gibt also **keine** fertige Packfunktion im Haus
   (Grep nach `packeUmschlag` leer). Genau diese Packfunktion hatte ich in Runde 2 selbst
   geschrieben und mit dem duplizierten Modul gelöscht; sie gehört zurück, **allein** und geprüft,
   ohne die Speicherfläche daneben.

**Gemessen in dieser Runde:** die Fläche des Wissensspeichers und die Fähigkeitenliste
(`FAEHIGKEITEN` enthält `einbetten`, `NAME_DER_FAEHIGKEIT` übersetzt es), sowie die Umsetzung in
`openrouter` — alles gelesen, nicht angenommen. **Nicht** gemessen: ein echter Einbettungsaufruf;
ohne Schlüssel gibt es keinen, und das bleibt so, bis ein Schlüssel eingetragen ist.

### 8.5 Das Bindeglied steht (Runden 5–7)

**Gebaut, typgeprüft (54 Pakete grün):**

* `packages/auth/store-postgres/src/index.ts` exportiert jetzt `zerlege`, `ZERLEGER_VORGABEN` und
  `type Stueck`. Vorher war der Zerleger **nicht erreichbar**, obwohl der Speicher selbst nicht
  zerlegt (`index.ts:1148`: *„Kein Zerlegen und kein Einbetten"*) — jeder Aufrufer hätte das
  Schneiden nachgebaut, und zwei Zerleger ergäben zwei Stückgrenzen für denselben Text.
* `packages/web/world-obsidian/src/einleser.ts` hat einen **optionalen** vierten Parameter
  `einbettung` (Wissensspeicher, Hauptschlüssel, Modell, Einbetter) und einen **dritten Durchlauf**:
  je geänderter Notiz `legeDokumentAb` → `zerlege` → `packeUmschlag(verpacke(text))` →
  `legeStueckeAb` → `setzeEinbettung`. Ohne `einbettung` läuft der bisherige Weg unverändert.

**Gemessen** (`.pmh-build/einlesen-stuecke.mjs`, echter Prüf-Vault, echter Bestand,
deterministischer Einbetter — kein Modell):

| Prüfung | Ergebnis |
|---|---|
| beide Notizen eingelesen | ok (`neu=2`) |
| Suche findet etwas | ok (3 Treffer) |
| **bester Treffer ist die Phönix-Notiz** | ok (Ähnlichkeit 0,4330 vor 0,0000) |
| fremdes Konto findet nichts | ok (0 Treffer) |
| Stücke gezählt / Umschlag geöffnet | **nachgeholt (Runde 8): grün** — `+4` Stücke, `+4` mit Vektor, Umschlag öffnet („…# Phoenix Der Phönix verbre"), Aufräumen `Rest: 0` |

**Zu den zwei roten Zeilen, ohne Beschönigung:** ich habe die Stücke über
`d.source_path LIKE <Prüf-Vault>` gezählt und über denselben Filter den Umschlag geöffnet. Der
Filter traf nicht (die Herkunft landet nicht in `source_path`) — die **Suche** beweist aber, daß die
Stücke liegen, denn sie kamen aus derselben, mandantengebundenen Abfrage. Der Versuch, den Filter
per `-replace` zu korrigieren, hat **nicht** gegriffen; geprüft ist immerhin, daß die Datei dabei
nicht beschädigt wurde (5230 Byte, 115 Zeilen, 0 CRLF). Die Zählung bleibt damit **ungemessen** und
wird in der nächsten Runde mit einem korrekt adressierten Filter nachgeholt — nicht mit einem Regex.

**Damit fehlen für (c) noch zwei Stücke:** der **Schlüssel je Benutzer** (aus `user_secrets` zum
Anbieter, samt Oberfläche im Konten-Abschnitt) und der **Weg** `?aehnlich=…` samt Panel-Anzeige.

> **Der folgende Absatz ist überholt (Runde 2) und bleibt als Spur stehen.** Er beschreibt ein
> Modul `stuecke.ts`, das ich geschrieben und **wieder gelöscht** habe, weil es den Wissensspeicher
> doppelte. Was von ihm bleibt, ist einzig die Beobachtung zur Umschlag-Lücke (Punkt 4 oben).
> Die Zahlen darunter messen dieses gelöschte Modul — sie belegen die Maschinerie, nicht den Code,
> der heute im Haus steht.

* `packages/auth/store-postgres/src/stuecke.ts` — `dokumentSichern`, `stueckeSchreiben`,
  `textEinbetten` (Zerlegen → Einbetten → Verschlüsseln → Schreiben) und `aehnlicheStuecke`
  (Kosinus-Distanz `<=>` über `chunks.embedding`, `ORDER BY` auf den Abstand, `user_id` **und**
  Verbund auf `documents.user_id`).
* **Eine Lücke im Schema, die ich schließen mußte:** `verpacke` liefert **vier** Teile
  (`valueCipher`, `wrappedKey`, `masterKeyVersion`, `keyHint`), die Spalte `chunks.content_cipher`
  ist **ein** `bytea`. `user_secrets` hat je Teil eine Spalte, `chunks` nicht. Ohne den
  eingewickelten Datenschlüssel wäre der Text nicht zu öffnen. Deshalb hat der Blob jetzt ein
  **ausgeschriebenes Format** (`packeUmschlag`/`entpackeUmschlag`: Fassung, Schlüsselfassung,
  Längen, Teile) — dokumentiert im Dateikopf, nicht beiläufig.
* **Gemessen** (`.pmh-build/vektorsuche.mjs`, echte Datenbank, **7 von 7 grün**): 3 Stücke
  geschrieben; Suche `„Phönix Flamme Asche"` → Treffer bei **0,5799 / 0,6985 / 0,7327**, der
  passende Absatz **vorn**; Reihenfolge aufsteigend; Text **entschlüsselt** zurück; **Konto B
  sieht 0**; ein Vektor falscher Dimension wird **abgewiesen** statt still zu treffen; Aufräumen
  `Rest: 0`.
* **Was daran ehrlich offen ist:** der Vektor kam aus einem **Prüf-Einbetter** (Wörter gehasht auf
  768 Dimensionen, normalisiert). Der belegt die **Maschinerie**, nicht die Qualität — er versteht
  keine Bedeutung. Das Modell kommt als austauschbarer Anbieter (Google AI / OpenRouter, Schlüssel
  je Benutzer aus der Datenbank) im nächsten Schritt; bis dahin gibt es **keine** Aussage darüber,
  wie gut die Treffer bei echten Texten sind.

**Noch nicht gebaut:** der Anbieter selbst und das Füllen der Stücke beim Einlesen der Notizen.
Danach die Suche „ähnlich" als Weg (`GET /api/pmh/notizen?aehnlich=…`) und im Panel.

### 8.2 Zur Anmeldung: zwei Türen, ein Keks

Der Betreiber: *„die anmeldung ist ja schon passiert idk why es überhaupt ein issue hat"* — und
er hat recht, was den **Betrieb** angeht. Die Klärung aus den Dokumenten
(`docs/status/auth-im-host.md`, `packages/api/auth-http/src/access.ts`):

* Die **Konto-Tür** (`/anmeldung`, `/start`) setzt `pmh_session` und `pmh_csrf` auf `path=/`.
* Die **Token-Tür** (`/`) setzt den signierten Keks des Kerns; nach der Konto-Anmeldung gibt
  `GET /api/pmh/auth/zugang` einem Administrator die Token-Adresse.
* Wer den **normalen** Weg geht, hat danach **beide** Kekse — und das Panel arbeitet.

Der „nicht angemeldet"-Satz aus §3 war deshalb **kein Produktfehler, sondern ein Fehler meines
Prüfskripts**: es hatte die Abkürzung `/?token=…` genommen und die Konto-Tür übersprungen — ein
Zustand, den der gewachsene Weg nicht herstellt. Zwei Dinge folgen daraus:

1. **Gemessen:** `/universe/` lädt **ohne** jede Anmeldung (in einem frischen Browser, ohne Kekse).
   Die Welt ist also offen; nur die Notiz-Wege verlangen die Sitzung.
2. **Geändert:** das Panel zeigt bei `nicht-angemeldet`/`kein-csrf` jetzt einen **Knopf
   „Zur Anmeldung"** auf `/anmeldung/` statt nur einen Satz. Eine Meldung ohne Weg hinaus ist eine
   Sackgasse.

**Offen:** der Nachweis über den **echten** Weg (Formular der gebauten Anmeldeseite
`apps/login_web` → Welt → Panel) steht noch aus; das Prüfskript kennt die Selektoren dieser
React-Seite noch nicht. Bis dahin ist der Weg über die gesetzten Kekse belegt, nicht über den Klick.

### 8.3 Die zweite Tür — und der Grund, warum sie zuerst nicht aufging

Der Betreiber, nachdem er den Hinweis „neu anmelden" im Panel sah: *„was hat das den für ein sinn
lol ;D, ich bin ja schon im Harness drinn warum nochmals ein login?"* — berechtigt. Wer den Token
des Wirts hat, ist der Besitzer dieser Maschine; ein Notizfenster darf ihn nicht nach einem
zweiten Konto fragen.

**Was zuerst gemessen wurde (und was nicht ging):**

| Versuch | Ergebnis |
|---|---|
| `authorizeIndex(req, res)` als Token-Prüfung für `/api/…` | **untauglich** — der Kern sagt selbst: *„true only when the caller may serve index.html"*. Auf einem API-Pfad antwortet die Sperre mit „nein" |
| Trust-Fence als Identitätsnachweis | **untauglich** — `api-request-trust.d.ts`: *„this fence never establishes identity"* |
| Keks des Wirts selbst prüfen | **nicht möglich** — der Kern speichert nur den Hash; der Signaturschlüssel liegt bei ihm |

**Was jetzt gilt (drei Bedingungen, alle nötig):**

1. **Herkunft:** der Socket ist Loopback (`127.0.0.1`/`::1`, IP **vom Socket**, nie aus
   `X-Forwarded-For`).
2. **Absicht:** die Anfrage trägt `x-pmh-welt: 1` — die Welt schickt ihn, ein nacktes `curl`
   bekommt weiterhin **401**. Das ist keine Sicherheitsgrenze (ein lokaler Aufrufer kann den Kopf
   setzen), sondern eine Grenze der Absicht — und ein **fremder Browser** kann sie nicht setzen,
   weil der Trust-Fence des Kerns ihn vorher abweist.
3. **Eindeutigkeit:** es gibt **genau ein** Verwalterkonto. Bei 0 oder ≥2 gibt es **keine**
   Zuordnung — dann bleibt es bei 401, statt zu raten.

**Nur lesen.** Der Token-Weg hat keinen Sitzungsdatensatz, gegen den sich ein CSRF-Wert prüfen
ließe; schreibende Wege antworten deshalb **403 `nur-mit-konto`**.

**Gemessen** (`.pmh-build/notizen-token.mjs`, kopfloser Browser, **nur** Token-Keks, kein Konto):

| Prüfung | Ergebnis |
|---|---|
| Panel zeigt Notizen ohne zweiten Login | **ja** — `["Neuer Link","Willkommen"]`, Zähler `2 von 2 Notizen`, keine Fehlerzeile |
| Schreiben mit Token | **403 `nur-mit-konto`** |
| Konto-Weg unverändert | `.pmh-build/notizen-http.mjs` **16 von 16 grün** (ohne Kopf bleibt „ohne Anmeldung → 401") |

### 8.4 Ein Befund, der größer ist als das Panel: **es gab kein Verwalterkonto**

Beim ersten Versuch blieb die zweite Tür zu — und der Grund stand in der Datenbank, nicht im Code:

```
Rollen:  user: 5          admin: 0
```

Alle fünf Konten (`trennung-a@`, `trennung-b@`, `index@`, `notiz-probe-a@`, `notiz-probe-b@`) waren
`role='user'`. Der Entwurf sagt: das **erste** Konto ist der Verwalter, angelegt über den
Claim-Weg. Diese Konten sind über `register()` entstanden (Prüfskripte), nicht über den Claim —
die Absicht des Erstbetriebs war damit **nie hergestellt**. Das ist derselbe Befund, den
`docs/status/grenzen-und-offenes.md` als „3 Benutzer, 0 Admins" führt; er ist jetzt belegt und
**repariert**: `.pmh-build/verwalter-setzen.mjs` macht **genau ein** Konto zum Verwalter
(`index@example.org`, das Konto mit dem Vault) und stuft jedes andere ab. Umkehrbar.

**Was daran offen bleibt, ehrlich:** die Regel „bei genau einem Verwalter ist der lokale Aufrufer
dieses Konto" ist eine **Betriebsannahme für einen Einzelplatz**, keine Mandantentrennung. Ein
zweiter lokaler Benutzer käme an die Notizen des Besitzers — er käme allerdings auch an `/universe/`
(gemessen: die Welt lädt ohne jede Anmeldung) und an die Datenbank. Wer das nicht will, braucht
`pmh_session` für **alles** — dann ist der zweite Login wieder nötig, und das ist eine Entscheidung
und kein Versehen.
