# Generationen, Zeiger, Bündel — was gebaut ist und was gemessen ist

Stand: 18.10.2026. **Alle Zahlen sind gemessen**, mit dem Befehl, der sie
gemessen hat. Was nicht gebaut ist, steht als **nicht gebaut** und nicht als
„geplant".

## 0. Die Lücke, die geschlossen wurde

Das Konzept [`../design/harness-generationen.md`](../design/harness-generationen.md)
beschreibt drei Takte, zwei Zeiger, ein Journal und einen Rückweg — und sagte von
sich selbst: *„Es beschreibt Absicht, Vertrag und Reihenfolge, nicht eine fertige
Umsetzung."* Gemessen war der Ist-Zustand: **11 `unit.json`**, `units/` enthielt
**kein** Unit, `.pmh/` enthielt **genau** `base.json` — keine `generations/`,
kein `current`, kein `next`, kein `journal.jsonl`, `packages/guard/*` leer.

Gebaut ist jetzt `packages/units/unit-system` (Unit `unit-system`, Fassung
0.1.0, Art `plugin`, Takt `idle`): Deklaration, Abschluß, Generationen, zwei
Zeiger, Journal, Aufräumen, Vergleich — und Implementierungsbündel mit Signatur.

## 1. Der Lauf gegen **diesen** Baum

```
$ pmh-gen check
prüfung   ok
units     12
takt      boot
dateien   1
warnungen 6

$ pmh-gen build
generation 1
fingerabdruck sha256:6759f014edf3450bdf4b05712f3526296e43ccdd4a068b4dc40d864daef5ee9f
units     12
takt      boot
wirkung   keine — der Zeiger bleibt, wo er ist

$ pmh-gen build      # zweiter Lauf, nichts geändert
generation 1 (unverändert — nicht neu gebaut)
```

| Beobachtung | Wert |
|---|---|
| Aufgelöste Units | **12** (4 Go unter `services/`, 6 Rust unter `native/`, 2 TypeScript unter `packages/units/`) |
| Warnungen | **6** — sämtlich `unit_name_directory_mismatch` (`native/atomicfs` trägt den Namen `pmh-atomicfs`, …) |
| Erste Generation | **#1**, Fingerabdruck `sha256:6759f014…ee9f` |
| Wirkung des Baus | **keine** — `current` und `next` beide leer (`pmh-gen status`) |
| Journal | **1** Eintrag `build`, mit dem `reason` der Deklaration |

Die Deklaration liegt als [`../../harness/units.json`](../../harness/units.json)
im Repository. Sie nennt **`schema: 7`** — die Fassung, die
`packages/api/readiness` erwartet — und trägt im `reason` den Grund, warum dieser
Bau **nicht** scharf geschaltet wurde: die Betriebsdatenbank steht gemessen auf
**5**.

## 2. Was die 58 Prüfungen belegen

| Bereich | Beleg |
|---|---|
| Deklaration | unbekanntes Feld, höheres Format, fehlendes `core`, **leere Wurzelliste**, doppeltes Unit, unbekannter Takt, negatives `schema` — jede Ablehnung mit eigenem Code, und zu jeder abgelehnten Form eine **angenommene** |
| Abschluß | Abhängigkeit wird mitgeschlossen (`declared: false`), abgeschaltetes Unit sperrt (`generation_declaration_unit_disabled`), fehlende Pflichtdatei sperrt |
| Fingerabdruck | gleicher Inhalt = gleicher Abdruck **auch bei anderer Reihenfolge**; Version, Inhaltsdigest und **Takt** ändern ihn; Form `sha256:<64 hex>` |
| Ablage | Generation byte-gleich zurückgelesen; Nummern werden **nicht wiederverwendet**, auch nach dem Aufräumen; Zeiger trägt eine Zahl und sonst nichts; unlesbarer Zeiger wird gemeldet, nicht geraten |
| Journal | append-only, Reihenfolge erhalten, `limit` schneidet am Ende; **eine kaputte Zeile macht den Rest nicht unlesbar** |
| Aufräumen | aktive, vorgemerkte und neueste Generation bleiben immer |
| Umschalten | `switch` setzt beide Zeiger, `boot` nur `next`, `test` nur `current` |
| Einbahnstraße | `irreversible`-Unit → `generation_approval_required`; mit Freigabe läuft es |
| Datenbankschema | `schemaStand: 5` gegen erwartete `7` → `generation_schema_mismatch`; `schemaStand: 7` läuft |
| Rückweg | auf die vorige aufbewahrte Generation; ohne vorige → `generation_nothing_to_do` |
| Drift | unverändert = kein Drift; geänderte Deklaration ohne Bau = Drift **gemeldet**, nicht geglättet |
| Bündel | Import ohne Vertrauen → `implbundle_key_missing`, **und es wird nichts geschrieben**; nach Ablegen des `.pub` kommt es an, landet auf `next` und **nicht** auf `current` |
| Manipulation | verändertes Bündel → `implbundle_digest_mismatch` |
| Herkunft | unsigniertes Bündel → `implbundle_signature_missing` |
| Rundlauf | Export → Import → Export ergibt **dieselben Inhaltsdigests** der Units |
| Ausschluß | das Bündel enthält **keine** Sitzung, **kein** Journal, **keinen** Zustand |

Typprüfung: **0 Fehler** (TS 7, `tsgo --noEmit`), **58 pass · 0 fail**, 129
`expect`-Aufrufe. Gegenprobe `unit-export`: **158 pass · 0 fail** — die
Manifest-Erweiterung (`reload`, `irreversible`) bricht nichts.

## 3. Die zwei eigenen Fehler, die erst die Prüfungen zeigten

**Erstens: der Bau deduplizierte gegen die falsche Generation.** Die ersten
Fassungen hingen an `current`. Solange nichts umgeschaltet ist, ist `current`
leer — also erzeugte jeder Aufruf eine neue Nummer für **unveränderten** Inhalt,
und die Liste wüchse ohne Anlaß. Der Anker ist die **neueste** Generation; ob sie
auch aktiv ist, sagt `zustand` und nicht der Bau.

**Zweitens: `export` konnte nach einem Import nicht exportieren.** Der Import
setzt absichtlich nur `next`; `export` sah aber nur `current`. Wer importiert und
gleich weitergeben will — genau der Weg, um den es hier geht — lief in
`generation_pointer_missing`. Jetzt gilt dieselbe Reihenfolge wie beim
Umschalten: `current` → `next` → das zuletzt Gebaute, und **die Quelle steht im
Ergebnis** (`quelle`), damit „irgendetwas" nie stillschweigend geschieht.

Beide Fehler waren nicht im Entwurf sichtbar; sie brauchten eine echte Platte.

## 5. Die Laufzeit: aus Buchführung wird Wirkung

Bis hierher war der Plugin-Host vollständig und **ohne Aufrufer**. Gebaut ist
jetzt `src/runtime.ts` (hängt die Plugin-Units einer Generation ein und wieder
ab), `src/rahmen.ts` (ein HTTP-Rahmen für Plugins ohne den Core) und das erste
echte Plugin-Unit **`units/pmh-status`** (Takt `hot`, zwei lesende Wege, gibt
beim Abstecken beide wieder frei).

**Der Beweislauf — `bun run units:host`, exit 0:**

```
rahmen     http://127.0.0.1:11899 (Port 11899)
generation 4  sha256:9f306cbfcb46…
eingehängt pmh-status@0.1.0
übersprungen unit-export: kein Einstiegspunkt in "entry" — eine Bibliothek, kein einhängbares Plugin.
übersprungen unit-system: kein Einstiegspunkt in "entry" — eine Bibliothek, kein einhängbares Plugin.
(+ zehn `kind: service` aus `services/` und `native/`, je mit Grund)

  ok   die Laufzeit meldet keinen Abweisungsbefund
  ok   das Unit pmh-status ist eingehängt
  ok   der Generationsweg ist belegt
  ok   der Auskunftsweg ist belegt
GET /api/pmh/gen/status -> 200
{"plugin":"pmh-status","generation":{"current":null,"next":null,"hatDrift":false,"befunde":[]}}
GET /api/pmh/plugin/info -> 200
{"plugin":"pmh-status","version":"0.1.0","vertrag":"0.2.1-alpha.2","wege":[...]}
  ok   die Laufzeit hat etwas abgesteckt
  ok   nach dem Abstecken ist kein Weg mehr belegt
  ok   der Weg antwortet nach dem Abstecken 404

ERGEBNIS: alle Erwartungen eingetroffen
```

Damit ist `reload: "hot"` zum ersten Mal **belegt** und nicht behauptet: das
Plugin legt einen Seiteneffekt an und räumt ihn beim Abstecken nachweislich weg.

## 6. Was der Beweislauf selbst gefunden hat

**Erstens: die Addon-Prüfung bestrafte Sorgfalt.** `checkNativeAddons` suchte im
**rohen** Manifest-Text — also auch in `notes`. Folge: `unit-export` wurde
abgewiesen, weil seine Notizen den Interzeptor `node-addon-require-builtin`
namentlich nennen, und zwar um die **gemessene** Lücke festzuhalten. Wer ein
Risiko aufschreibt, flog raus; wer es verschweigt, kam durch. **Behoben:**
`notes` ist Prosa und wird nicht mehr durchsucht; alles andere schon. Zwei
Prüfungen in `unit-export` halten beide Seiten fest (38 pass in der Datei, 158 im
Paket).

**Zweitens: `plugin` ohne `entry` ist eine Bibliothek.** `unit-export` und
`unit-system` deklarieren sich als `plugin` und haben keinen Einstiegspunkt. Die
Laufzeit hätte sie „abgewiesen" — richtig wäre: sie sind **nicht einhängbar**,
weil sie eine Fläche bereitstellen statt eines Aufrufpunkts. **Behoben:** der
Abschluß trägt jetzt `einstieg`; ohne ihn wird ein Plugin als Bibliothek
**übersprungen und genannt**. Das ist der Unterschied zwischen einem Mangel und
einer anderen Art von Beitrag.

**Drittens, und es bleibt offen: der Fingerabdruck deckt den *Datensatz* nicht
vollständig.** `einstieg` kommt aus `unit.json`, dessen Hash im Inhaltsdigest
steckt — die **Quelle** ist also gedeckt. Aber eine Generation, die **vor** dem
Feld gebaut wurde, trägt es nicht, und ihr Fingerabdruck ist derselbe wie der
einer neuen. Ein `build --force` schließt das; eine Formatfassung
(`GENERATION_FORMAT`) wäre der saubere Weg und ist **nicht** gebaut.

## 7. Der Prüfbau — das Tor, das die Selbstverbesserung erst sicher macht

**Der Anlass, wörtlich der Betreiber (18.10.2026):** *„die idee ist von nixos das
der Harness self Improvement aka scaffolding im harness Machen kann also wie nixos
konzept logic. das der harness es komplett testen kann rückgängig machen kann
ect."*

Bis dahin fehlte genau der Satz aus `docs/design/harness-generationen.md` §4.1:
*„bauen und prüfen frei, umschalten nur mit Freigabe."* `switch` schaltete eine
Generation auch dann scharf, wenn sie **nie** geprüft worden war — der Rückweg
war damit blind.

**Gebaut:** `checks` als deklarative Prüfschritte in `harness/units.json`, ein
Prüfbau, der sie wirklich fährt, das Ergebnis **in** der Generation (`pruefung`,
nicht im Fingerabdruck), und ein Tor in `schalte`
(`generation_check_missing` / `generation_check_failed`; `--freigabe` als
ausdrückliche Ausnahme).

**Die eine technische Entscheidung, die gemessen ist:** die Ausgabe der Schritte
läuft über **Datei-Deskriptoren**, nicht über Pipes. Ein Pipe kann bei viel
Ausgabe blockieren, und in einer eingeschränkten Sandkastenumgebung scheitert das
Starten ganz (`EPERM`). Nachgemessen: `stdio: ['ignore', fd, fd]` → `exit=0`,
Ausgabe in der Datei. Der Prüfbau kann damit auf **diesem** Rechner wirklich
Prozesse fahren.

### Der Lauf gegen diesen Baum — drei Befunde, alle wahr

```
$ pmh-gen check --ausfuehren
  ROT   go-tests     264 ms   pattern ./...: open …\go-build\… : Access is denied
  ROT   ts-tests      48 ms   bun.exe ist mit der ausgeführten Windows-Version nicht kompatibel
  ROT   ts-typen      30 ms   (derselbe Grund)
prüfbau   ROT — gescheitert: go-tests, ts-tests, ts-typen
```

Danach wurde die Deklaration um `env` und `cwd` erweitert (beides relativ,
maschinenunabhängig), und derselbe Lauf ergibt:

```
  ok    go-tests    4383 ms
  ROT   ts-tests      35 ms   bun.exe … nicht kompatibel
  ROT   ts-typen      33 ms   (derselbe Grund)
prüfbau   ROT — gescheitert: ts-tests, ts-typen
```

**Was daran zählt:** der zweite Lauf zeigt, daß der Prüfbau **echte Prozesse**
fährt und echte Exit-Codes meldet — `go test ./...` läuft in 4,4 s durch. Und die
zwei roten Schritte sind kein Fehler des Prüfbaus, sondern der **gemessene**
Zustand dieses Rechners: `bun` im PATH ist der defekte npm-Shim, genau der
Fallstrick, den `scripts/start.mjs` seit dem 13.10. beschreibt. Das Tor schließt
deshalb — **zu Recht**. Wer den PATH ordnet (`%USERPROFILE%\.bun\bin` vor
`%APPDATA%\npm`), bekommt grün, ohne eine Zeile Code zu ändern.

**Prüfungen:** +16 in `tests/pruefbau.test.ts` (5 Verhalten mit Attrappe,
4 **echte** Prozesse inklusive Frist, 7 Tor), zusammen **87 pass · 0 fail**.

## 8. Zug-Tor und Quittung — die Antwort auf „wird da nicht einfach alles neu gestartet?"

**Der Anlaß ist ein echter Fehlschlag im laufenden Betrieb** (Bild des Betreibers,
18.10.2026): `subprocess-local: Windows job runner exited with exit code 127`
(127 = *command not found*), ein Werkzeugaufruf, der *„interrupted after it was
recorded, but no result durably recorded"* war — und die Frage: *„bedeutet das
jetzt das prometheus nicht einfach alles neugestartet wird und so ein issue
bekommt das ein crash gleichkommt?"*

**Was daran nicht unser Baum ist** (gemessen: **null** Treffer für `managed
range` im Quelltext; die Pakete heißen `@deepseek-ai/dsh-subprocess-local`,
`dsh-jobs-local`, `dsh-tool-jobs`): der Subprozess-Runner und die Sitzungsablage
des **Cores**. Und es war **kein Absturz** — der Prozeß lief weiter.

**Was daraus gebaut ist** — zwei Stücke, die ohne laufenden Host prüfbar sind:

| Stück | Wirkung | Prüfung |
|---|---|---|
| **Zug-Tor** | Ein Wechsel mit Takt `boot` wird abgelehnt, solange ein Zug läuft: `generation_zug_laeuft`; der Zeiger bleibt unberührt. Takt `hot` läuft durch — er berührt keinen Zug | 4 Prüfungen |
| **Quittung** | jeder Wechsel sagt: `prozessWechsel`, `fortsetzung` (`nicht-noetig` / `moeglich` / **`unbekannt`**), `zug`, `hinweis` — und landet im **Journal** | 4 Prüfungen |

**Der eigene Fehler, den die Prüfung fand:** die erste Fassung der Quittung sagte
bei Takt `hot` nur „kein Prozeßwechsel nötig" und **verschwieg den laufenden
Zug**, obwohl der Aufrufer ihn mitgeteilt hatte. Eine Quittung, die eine
übergebene Auskunft nicht weitergibt, ist keine. Behoben — der Satz nennt jetzt
beides.

**Und die Grenze, die bleibt:** die *Quelle* der Auskunft „es läuft ein Zug" ist
der Host (offene Züge, laufende Werkzeuge, laufende Subagenten). Diese Bibliothek
kann die Frage nicht beantworten — sie kann sie **verlangen**. Fehlt die Antwort,
steht `unbekannt` da und nicht `ruhig`. Die Ruhe-Sonde im Host ist **nicht
gebaut**.

**Prüfungen:** +10 in `tests/quittung.test.ts`, zusammen **103 pass · 0 fail**.

## 9. Nicht gebaut — mit Grund

| Lücke | Wirkung |
|---|---|
| **Nicht im Core gemessen** | Die Laufzeit hängt die Generation wirklich ein — belegt über den Prüfrahmen. Daß der **Core-Prozeß** sie beim Start aufruft, ist **nicht** belegt: der Eintrag in `scripts/profile-patch.mjs` fehlt. Der Vertrag ist derselbe, die Verdrahtung nicht. |
| **Unsichtbares Umschalten** | Der Verbindungsannehmer sitzt im gewechselten Prozeß; `pmh-attach` hat keinen echten Upstream. Jeder Wechsel bleibt sichtbar. |
| **Kein Zeilenkonflikt** | Der Import **ersetzt** die Deklaration, statt gegen die eigenen Schichten zu verhandeln (§3.5 des Konzepts). |
| **Keine Signatur für Unit-Bündel** | Nur `.pmhimpl` ist signiert; `PMHUNITB` Format 1 bleibt unsigniert. |
| **Kein Wächter** | `build`/`switch` sind Aufrufe, keine Schleife; die Ruhe-Sonde („zwischen zwei Zügen") fehlt. |
| **Core-Pin doppelt** | `.pmh/base.json` und `harness/units.json` nennen beide die Core-Fassung; nur die Deklaration wird gelesen (Befund **B15** bleibt damit halb offen). |
