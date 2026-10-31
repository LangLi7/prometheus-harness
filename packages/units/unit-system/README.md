# `unit-system` — der Plugin-Manager: Deklaration, Generationen, Bündel

> **Zweck.** Bis hierher hieß „Unit" in diesem Projekt: ein Ordner, den man
> kopiert. Dieses Paket macht daraus ein **System**: eine Deklaration sagt, was
> gelten soll; daraus entsteht ein **Abschluß**; daraus eine **Generation** mit
> Fingerabdruck; und ein **Zeiger** entscheidet, was läuft. Umschalten ist dann
> ein Zeiger, der Rückweg ein Zeiger zurück — und Weitergeben ist derselbe
> Vorgang mit einer fremden Quelle.
>
> Das ist der NixOS-Bauplan, auf Units abgebildet. Was er hier **nicht** ist,
> steht unter [Grenzen](#7-grenzen) und ist länger als der Erfolgsteil.

Alles in diesem Paket ist ohne laufenden Host benutzbar: es startet nichts, hängt
nichts ein und schreibt keine Datenbank. Es **führt Buch**.

---

## 1. Was drin ist

| Modul | Inhalt |
|---|---|
| `src/hash.ts` | SHA-256, Dateiabdrücke, kanonisches JSON, Inhaltsdigest (byte-gleich mit `unit-export`) |
| `src/declaration.ts` | `harness/units.json` — Modell, Prüfung, Lesen |
| `src/closure.ts` | Abschlußauflösung gegen die Registry: `requires` transitiv, Takt, Einbahnstraßen |
| `src/generation.ts` | Fingerabdruck, Ablage unter `.pmh/generations`, zwei Zeiger, Journal, Aufräumen, Vergleich |
| `src/implementierung.ts` | Implementierungsbündel: Export, Prüfung, Signatur (Ed25519), Import |
| `src/operations.ts` | Die Vorgänge: `pruefe`, `baue`, `schalte`, `rolleZurueck`, `liste`, `zustand`, `raeume` |
| `src/runtime.ts` | **Die Laufzeit:** hängt die Plugin-Units einer Generation wirklich ein — und steckt sie wieder ab |
| `src/rahmen.ts` | Der **Prüfrahmen**: ein kleiner HTTP-Rahmen, in den Plugins ihre Wege legen |
| `src/cli.ts` | die Kommandozeile `pmh-gen` — eine dünne Hülle, keine zweite Umsetzung |
| `src/index.ts` | die öffentliche Fläche für Host, Oberfläche und HTTP-Handler |

**Eine Umsetzung.** CLI und Bibliothek rufen dieselben Funktionen. Es gibt keinen
zweiten Weg, auf dem sich ein Fehler verstecken könnte.

---

## 2. Die Deklaration — `harness/units.json`

Das Gegenstück zu `configuration.nix`: die eine Stelle, an der steht, **was gelten
soll**. Versioniert, von Hand lesbar, vom Agenten schreibbar.

```jsonc
{
  "format": 1,
  "core":     { "version": "0.2.1-alpha.2", "contract": "^0.2.0" },
  "platform": "windows",              // optional; sonst die des Aufrufers
  "schema":   7,                      // die erwartete Datenbankfassung (siehe §6)
  "roots":    ["units", "services", "native", "packages/units"],
  "units": [
    { "name": "pmh-supervisor", "reload": "idle" },   // Takt überschreibt unit.json
    { "name": "pmh-nix",        "reload": "boot" },
    { "name": "pmh-attach",     "enabled": false },   // deklariert, aber nicht Teil der Generation
    { "name": "unit-export",    "version": "^0.1.0" } // Fassung oder Spanne
  ],
  "files": [
    "docker-compose.yml",                            // Kurzform = Pflichtdatei
    { "path": "harness/layers/base.yml", "required": true }
  ],
  "reason": "ein Satz, der im Journal landet"
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `format` | ja | genau `1`; ein höherer Wert wird **abgelehnt**, nicht geraten |
| `core` | ja | Core-Fassung und Vertragsspanne — ohne sie ist keine Verträglichkeit prüfbar |
| `roots` | nein | Wo Units liegen. **Vorgabe: `units`, `services`, `native`** — eine leere Liste ist ein Fehler, denn sie ergäbe einen leeren Bau, und der sieht aus wie ein Erfolg |
| `units` | ja | Was gelten soll. Ein abgeschaltetes Unit, das gebraucht wird, **sperrt** den Bau |
| `files` | nein | Dateien, die zur Implementierung gehören; ihr Hash geht in den Fingerabdruck |
| `schema` | nein | Erwartete Datenbankfassung. Sie macht eine Generation zur Einbahnstraße, wenn sie sich **ändert** |
| `platform`, `reason` | nein | Prüfplattform; ein Satz fürs Journal |

**Kein Zustand.** In `.pmh/` liegt, was aus dieser Datei **herstellbar** ist. Diese
Trennung ist die einzige Regel, die „weitergeben" überhaupt möglich macht.

---

## 3. Der Abschluß — was aus der Deklaration folgt

`loeseAbschluss` prüft die Deklaration gegen die Registry und liefert **alle**
Befunde. Vier Fälle, die es ausdrücklich abfängt:

| Fall | Befund | Warum überhaupt |
|---|---|---|
| Unit in keiner Wurzel | `generation_declaration_unit_unknown` | ein Tippfehler soll auffallen |
| Abgeschaltet, aber gebraucht | `generation_declaration_unit_disabled` | sonst scheitert es später, an anderer Stelle |
| Pflichtdatei fehlt | `generation_declaration_file_missing` | ein Fingerabdruck über nichts ist keine Aussage |
| Zyklus in `requires` | `registry_dependency_cycle` | ein Bau, der sich selbst braucht, endet nicht |

`requires` wird **transitiv** geschlossen — über dieselbe Registry-Auflösung, die
`unit-export` schon benutzt. Ein Unit, das nur als Abhängigkeit hereinkommt, steht
mit `declared: false` im Abschluß; das ist der Unterschied zwischen „gewollt" und
„mitgebracht".

**Der Takt** jedes Units ist `reload` aus der Deklaration, sonst aus `unit.json`,
sonst **`boot`**. Die Vorgabe ist die vorsichtige: wer eine Änderung für heiß
erklärt, muß sie belegen — und der Beleg ist eine Prüfung, kein Satz. Der Takt
der ganzen Generation ist der **teuerste** ihrer Units.

---

## 4. Generationen, Zeiger, Journal

```
harness/                    DEKLARATION — versioniert
.pmh/                       ZUSTAND — nicht versioniert, aus der Deklaration herstellbar
  generations/000001/generation.json
  current                   was JETZT gilt        (eine Datei mit einer Zahl)
  next                      was ein NEUER Prozeß beim Start liest
  journal.jsonl             append-only
  keys/impl-signing.pem     Signaturschlüssel (0600) · *.pub = Vertrauen
```

**Der Zeiger ist eine Datei, keine Verknüpfung.** Gemessen am 13.10.2026 auf
diesem Wirt: `mklink /D` scheitert („Ihre Berechtigungen reichen nicht aus"),
`mklink /J` geht. NixOS schaltet mit einem Symlink um; hier trägt eine Junction
einen *Pfad* statt einer *Nummer* und ist nicht atomar ersetzbar. Deshalb: eine
Datei mit einer Zahl, geschrieben über temporäre Datei plus `rename`. Der
Nebengewinn ist echt — der Notausgang ist ein Texteditor.

**Der Fingerabdruck** geht über Inhalt — Core, Plattform, Fassung, je Unit Name,
Version, Art, Takt, Einbahnstraßen-Kennzeichen und Inhaltsdigest, je Datei Pfad
und Hash. **Nicht** über Zeitpunkt und **nicht** über die Nummer: sonst wäre
derselbe Inhalt bei jedem Bau eine neue Generation, und „hat sich etwas
geändert?" wäre nicht beantwortbar.

**Ein Bau dedupliziert gegen die neueste Generation**, nicht gegen die aktive.
Solange nichts umgeschaltet ist, gäbe es sonst bei jedem Aufruf eine neue Nummer
für unveränderten Inhalt.

### Die Kommandos

| Kommando | Wirkung | NixOS-Entsprechung |
|---|---|---|
| `check` | prüft Deklaration und Abschluß, schreibt nichts | — |
| `build` | schreibt eine Generation, **rührt keinen Zeiger an** | `nixos-rebuild build` |
| `boot [n]` | setzt nur `next` | `nixos-rebuild boot` |
| `test [n]` | setzt nur `current` | `nixos-rebuild test` |
| `switch [n]` | setzt `current` **und** `next` | `nixos-rebuild switch` |
| `rollback` | `current` auf die vorige aufbewahrte Generation | `--rollback` |
| `list` | alle Generationen mit Marke `AKTIV`/`NEXT` | — |
| `status` | was läuft, was vorbereitet ist, **und Drift** | — |
| `diff` | Unterschied zweier Generationen samt nötigem Takt | — |
| `prune --keep n` | räumt alte Generationen weg — und **nennt**, welche | `nix-collect-garbage` |
| `export` / `import` / `inspect` | Implementierungsbündel (§5) | — |
| `journal` | was geschah, in der Reihenfolge | — |
| `key` | Signaturschlüssel zeigen oder erzeugen | — |

Ohne Nummer gilt beim Umschalten: erst `next`, dann `current`, zuletzt das zuletzt
Gebaute — und **die Quelle steht im Ergebnis** (`quelle: 'next' | 'current' |
'neueste'`) und im Journal. „Irgendetwas" geschieht hier nicht stillschweigend.

**Was nie wegfällt beim Aufräumen:** die aktive Generation, die vorgemerkte und
die neueste. *„Once an old ReplicaSet is deleted, you lose the ability to
rollback"* — Aufbewahren ist keine Höflichkeit, sondern die Rückrollbarkeit
selbst.

---

## 5. Implementierungsbündel — Rezept statt Inhalt

Man kann den Harness nicht verschicken: frischer Klon **88 MB**, gebaut
**2 491 MB**. Man kann ihn auch nicht einfach kopieren, ohne Geheimnisse und
fremde Sitzungen mitzuschleppen. Was sich verschicken läßt, ist das **Rezept**.

```
pmh-gen export --out meine.pmhimpl [--payload] [--ohne-signatur] [--note "..."]
pmh-gen inspect --bundle seine.pmhimpl
pmh-gen import  --bundle seine.pmhimpl [--ohne-schreiben] [--scharf --freigabe]
```

Eine `.pmhimpl` ist JSON und trägt:

| Feld | Inhalt |
|---|---|
| `declaration` | die **rohe** Deklaration, damit sie beim Empfänger unverändert ankommt |
| `units[]` | Name, Fassung, Art, Takt, Einbahnstraßen-Kennzeichen, **Inhaltsdigest** |
| `files[]` | Schicht- und Pindateien **mit** Inhalt (base64) — sie sind klein |
| `payload[]` | die Quellen der Units — **nur** mit `--payload` |
| `digest` | SHA-256 über das kanonische Manifest **ohne** `digest` und `signature` |
| `signature` | Ed25519 über den Digest; `key` ist der Fingerabdruck des öffentlichen Schlüssels |

**Was unter keinen Umständen mitreist:** `node_modules`, `target`,
`.pmh-build`; Sitzungen (`session.v4.jsonl.zstd`); Geheimnisse
(`.credentials.yaml`, `.env`, `user_secrets`, `claim.txt`); `.pmh/` selbst. Eine
eigene Prüfung hält das fest (`das Bündel trägt keine Sitzungen und keinen
Zustand`).

### Der Ablauf beim Empfänger

```
inspect → Format · Digest · jeder Dateihash · Signatur
import  → Deklaration schreiben → Dateien schreiben → Generation bauen
        → Zeiger auf NEXT, niemals auf CURRENT
```

Ein Import macht **nichts scharf**. Was beim Absender gilt, gilt hier erst, wenn
jemand umschaltet. Das ist die einzige Reihenfolge, in der ein fremdes Bündel
keinen laufenden Betrieb umbringt.

### Vertrauen ist eine Handlung

**Fail closed, ohne Ausnahme:** ohne geprüften Schlüssel wird **nichts** entpackt.
Wer einem Absender traut, legt seinen öffentlichen Schlüssel als `.pub` in
`.pmh/keys/` ab — ab dann gilt er, bis jemand ihn löscht. Ein Vertrauen, das bei
jedem Aufruf neu übergeben wird, ist keine Entscheidung, sondern eine Gewohnheit.

---

## 6. Das Tor: die Datenbankfassung wird gemessen

`schema` in der Deklaration ist die Fassung, die eine Generation **erwartet**.
`schalte` nimmt eine gemessene Fassung entgegen (`schemaStand`) und **sperrt** bei
Abweichung mit `generation_schema_mismatch`.

Der Grund steht in diesem Projekt gemessen: die Betriebsdatenbank stand auf
Fassung **5**, die Wegwerf-Datenbank auf **7** — *„der Zustand ist nicht falsch
gemeldet, sondern falsch"*. Kein Digest und keine Signatur helfen dagegen. Nur
Messen hilft.

**Und die Grenze, die dazugehört:** eine *geänderte* Datenbankfassung ist eine
Einbahnstraße (`irreversible`), und `schalte` verlangt dafür ausdrückliche
Freigabe (`generation_approval_required`). Der Übergang von „nicht deklariert"
auf „deklariert 7" ist dagegen **keine** Migration, sondern eine neue Auskunft —
wer beides gleich behandelt, sperrt den ersten Wechsel jeder jungen Installation.

**Ein Rückweg stellt keine Daten wieder her.** Eine geschehene Migration bleibt
geschehen; wer zurück will, braucht eine Generation, die mit dem **neuen** Schema
läuft.

---

## 7. Der Prüfbau — das Tor vor jedem Wechsel

**Der Satz, den er durchsetzt:** *bauen und prüfen frei, umschalten nur nach
grünem Prüfbau.* Ohne ihn ist der Rückweg blind — eine ungeprüfte Generation ist
von einer geprüften nicht zu unterscheiden, und `rollback` rollt auf etwas
zurück, von dem niemand weiß, ob es trug.

Die Prüfschritte stehen in der **Deklaration**, nicht im Code:

```jsonc
"checks": [
  { "name": "go-tests", "command": "go", "args": ["test", "./..."],
    "cwd": "services/pmh-research",
    "env": { "GOCACHE": "../../.pmh-build/go-cache" }, "timeoutMs": 300000 },
  { "name": "ts-tests", "command": "bun", "args": ["test", "packages"], "required": true }
],
"policy": { "requireCheck": true }
```

| Eigenschaft | Regel |
|---|---|
| Ein Schritt | ein Prozeß mit Exit-Code — dieselbe Form für jede Sprache |
| Ausgabe | über **Datei-Deskriptoren**, nicht über Pipes: kein Puffer, keine Blockade |
| `required: false` | ein Fehlschlag **sperrt nicht**, steht aber im Ergebnis |
| leere Prüfliste | **nicht grün** — „nichts geprüft" ist keine Freigabe |
| Ablage | das Ergebnis steht in der Generation (`pruefung`), **nicht** im Fingerabdruck |
| Tor | `schalte` verweigert `generation_check_missing` / `generation_check_failed` |
| Ausnahme | `--freigabe` nimmt das Risiko **ausdrücklich** auf sich |

**Warum das Ergebnis nicht in den Fingerabdruck gehört:** der Fingerabdruck
beschreibt Inhalt, der Prüfbau ist eine Messung *an* diesem Inhalt. Gehörte er
hinein, wäre jeder zweite Prüflauf eine neue Generation — und „hat sich etwas
geändert?" nicht mehr beantwortbar. **Die Prüfliste dagegen gehört hinein:** eine
andere Prüfliste ist ein anderes Versprechen an dasselbe System.

```sh
pmh-gen check --ausfuehren      # Prüfbau fahren, nichts schreiben
pmh-gen build --mit-pruefung    # bauen und das Ergebnis in der Generation ablegen
pmh-gen pruefe [n]              # einen bestehenden Stand nachprüfen
```

## 8. Zug-Tor und Quittung — kein Zug wird abgerissen, und es wird gesagt

**Der Anlaß ist ein echter Fehlschlag** (18.10.2026): ein Werkzeugaufruf brach
mitten im Zug ab, und das Ergebnis war nicht dauerhaft abgelegt — *„no result
durably recorded"*. Die Frage des Betreibers war, ob Prometheus das bekommt, weil
„einfach alles neu gestartet wird".

Zwei Antworten, beide gebaut:

**1. Das Zug-Tor.** Ein Wechsel, dessen Takt `boot` ist (also ein neuer Prozess),
wird **abgelehnt**, solange ein Zug läuft:

```
generation_zug_laeuft — „Es läuft ein Zug (2 Werkzeuge offen); ein Wechsel mit
Takt "boot" würde ihn abreißen. Warte auf das Zugende oder gib ausdrücklich frei."
```

Ein Wechsel im Takt `hot` läuft dagegen durch — er berührt keinen Zug. **Und
„unbekannt" ist nicht „ruhig":** ohne Auskunft über laufende Züge wird nicht
gesperrt, aber es wird gesagt.

**2. Die Quittung.** Jeder Wechsel liefert eine Auskunft, die man lesen kann:

| Feld | Bedeutung |
|---|---|
| `prozessWechsel` | `true` genau dann, wenn der Takt `boot` ist — also die **geänderten** Units einen neuen Prozess verlangen |
| `fortsetzung` | `nicht-noetig` · `moeglich` (vom Aufrufer zugesichert) · **`unbekannt`** (niemand hat es gesagt) |
| `zug` | was der Aufrufer über laufende Arbeit mitgeteilt hat |
| `hinweis` | ein Satz, den ein Mensch verstehen kann |

**Warum `unbekannt` der Vorgabewert ist:** „fortgesetzt" und „nicht fortgesetzt"
sehen für den Aufrufer gleich aus, wenn niemand es sagt. Socket.IO hat dafür ein
Feld (`recovered`) — es gibt keinen Grund, es nicht zu haben. Die Zusicherung
`fortsetzbar: true` ist eine **Behauptung des Aufrufers**, und sie steht damit
sichtbar in der Quittung; diese Bibliothek erfindet sie nicht.

Die Quittung landet im **Journal**, nicht nur in der Antwort — sonst wäre nach
einem Wechsel nicht mehr feststellbar, was er über die Sitzung gesagt hat.

## 9. Die Laufzeit — von der Buchführung zur Wirkung

**Die Lücke, die bis zum 18.10.2026 offen war.** `plugin-host.ts` konnte seit dem
12.10. laden, prüfen, einhängen und abstecken — aber **nichts rief ihn auf**. Ein
scharf geschalteter Zeiger war damit eine Absicht ohne Wirkung. `UnitRuntime`
ist der Aufrufer:

```
Generation lesen → jedes kind:plugin vorbereiten → in requires-Reihenfolge einhängen
                 → (die Wege tun ihre Arbeit) → in umgekehrter Reihenfolge abstecken
```

| Eigenschaft | Regel |
|---|---|
| Auswahl | **nur `kind: 'plugin'`** mit `entry`. Dienste startet der Supervisor, Skills gehören dem Agenten, Patches dem Core |
| Bibliothek | ein `plugin` **ohne** `entry` ist eine Bibliothek — es wird **übersprungen und genannt**, nicht abgewiesen |
| Reihenfolge | `requires` vor dem Verbraucher; abgesteckt wird umgekehrt |
| Ein defektes Plugin | wird **abgewiesen und genannt**; die übrigen hängen. Hier ist fail-closed falsch: ein fremdes Plugin darf nicht den ganzen Host verhindern |
| `ok` in der Auskunft | heißt **nichts wurde abgewiesen** — nicht „es wurde etwas eingehängt". Eine Generation ohne Plugins ist kein Fehler |

Der **Prüfrahmen** (`src/rahmen.ts`) ist der Ort, an dem ein Plugin ohne den Core
beweisbar läuft: `127.0.0.1`, freier Port, genaue Wege, JSON, und jedes
Abmelden räumt **nur den eigenen** Eintrag weg. Er ist **kein** Produktionsserver.

### Der erste echte Plugin-Unit: `units/pmh-status`

Selbsttragend (keine `import`-Anweisung auf ein fremdes Paket), Takt `hot`, und
zwei lesende Wege: `/api/pmh/gen/status` und `/api/pmh/plugin/info`. Beim
Abstecken meldet es **beide** wieder ab — das ist der Beleg dafür, daß `hot` eine
geprüfte Eigenschaft und keine Behauptung ist.

```sh
bun run units:host      # scripts/units-host.mjs — Beweislauf, Exit-Code ist das Ergebnis
```

---

## 10. Grenzen

Ehrlich, und in der Reihenfolge, in der es weh tut:

1. **Nicht im Core gemessen — nur im Prüfrahmen.** Die Laufzeit hängt die
   Generation wirklich ein, und das ist über echtes HTTP belegt. Was **nicht**
   belegt ist: daß der Core-Prozeß sie beim Start aufruft. Dafür fehlt der
   Eintrag in `scripts/profile-patch.mjs`; der Vertrag ist derselbe
   (`services.routen` / `ctx.webServer.register`), die Verdrahtung fehlt.
2. **Unsichtbares Umschalten ist unbewiesen.** Der Verbindungsannehmer sitzt im
   Prozeß, der gewechselt wird. Solange `pmh-attach` keinen echten Upstream hat,
   ist jeder Wechsel für bestehende Verbindungen **sichtbar** — unabhängig davon,
   wie schnell der Zeiger umgelegt wird.
3. **Keine Signatur für Unit-Bündel.** Nur das **Implementierungsbündel** ist
   signiert. `PMHUNITB` (Format 1) bleibt unsigniert; dort beweist der Digest
   Unversehrtheit, nicht Herkunft.
4. **Der Import schreibt die Deklaration des Absenders.** Er **verschmilzt**
   nichts und meldet **keinen** Zeilenkonflikt gegen die eigenen Schichten — das
   ist §3.5 des Konzepts und **nicht gebaut**. Wer ein fremdes Bündel annimmt,
   ersetzt seine Deklaration; das steht im Journal, aber es wird nicht verhandelt.
5. **Keine Verhandlung über den Core.** Ein Bündel mit einer anderen
   Core-Fassung wird nicht abgewiesen — es wird importiert, und der Vertragsbruch
   fällt erst beim nächsten `check` auf. Ein Core-Sprung ist eine **kalte**
   Generation und damit eigentlich ein eigener Vorgang.
6. **Keine Zustandsübernahme.** Der Import überträgt keine Daten. Eine fremde
   Generation auf einer eigenen Datenbank ist genau so gut wie ihre Migrationen.
7. **`prune` kennt keine Aufbewahrungsfrist.** Es gibt kein „behalte 30 Tage",
   nur „behalte die letzten n".
8. **Verknüpfungen werden nicht verfolgt.** Ein Unit, das über Symlinks aufbaut,
   wird unvollständig abgedruckt.
9. **Kein Wiederaufnehmen eines abgebrochenen Baus.** Bricht ein Schreibvorgang
   ab, bleibt eine halbe Generation liegen; sie ist über ihren fehlenden
   Fingerabdruck als unvollständig erkennbar, aber es gibt kein Kommando, das sie
   aufräumt.
10. **Die Deklaration ist die einzige Wahrheit über den Core-Pin.** `.pmh/base.json`
    trägt dieselbe Angabe und wird von **keinem** Kode gelesen (Befund B15). Zwei
    Quellen für eine Aussage sind eine zu viel; die Auflösung steht noch aus.

---

## 11. Gemessen

| Was | Zahl | Womit |
|---|---|---|
| Prüfungen dieses Pakets | **71 pass · 0 fail** (58 Buchführung + 13 Laufzeit), 4 Dateien | `bun test` in diesem Ordner |
| Typprüfung, alle Pakete | **48 grün · 0 rot** (einschließlich `units/pmh-status`) | `tsgo --noEmit -p …` je `tsconfig.json` |
| Gegenprobe `unit-export` | **38 pass** in der Plugin-Host-Datei, **158** im ganzen Paket | `bun test` in `../unit-export` |
| Lauf gegen **diesen** Baum | **13 Units**, 1 Datei, Takt `boot`, 6 Warnungen (Ordnernamen `native/`) | `pmh-gen check` |
| Erste Generation | **#1**, `sha256:6759f014…` | `pmh-gen build` |
| Zweiter Bau | **„unverändert — nicht neu gebaut"** | `pmh-gen build` |
| Generation mit dem Plugin | **#3**, `sha256:9f306cbf…` — 13 Units, davon 1 einhängbar | `pmh-gen build` |
| **Beweislauf des Plugins** | **exit 0**, alle 12 Erwartungen eingetroffen | `bun run units:host` |
| Belegte Wirkung | `pmh-status@0.1.0` eingehängt, 2 Wege belegt, beide über HTTP **200**; nach dem Abstecken **kein Weg** belegt und **404** | ebd. |

**Was daran nicht gemessen ist:** der Aufruf durch den **Core**-Prozeß, ein
Wechsel bei laufender Sitzung, und der Typprüf-Läufer `scripts/typecheck.mjs`
selbst — er startet Kinder mit gepufferten Ausgaben, was in dieser Sitzung an der
Sandbox scheitert (`EPERM: uv_spawn`). Die 48 Läufe oben sind einzeln und ohne
Pipe gefahren; das ist dasselbe Prüfverfahren, nur ohne den Sammler.
