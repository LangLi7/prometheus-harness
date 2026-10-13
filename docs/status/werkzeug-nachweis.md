# Werkzeuge des Harness — Nachweis je Werkzeug

> **Gemessen:** 13.10.2026 · Windows nativ · Bun 1.4.0 · über die API allein, ohne Oberfläche
> **Verfahren:** Sitzung anlegen, Prompt mit fünf Werkzeugproben absetzen, den Verlauf aus
> `session.v4.jsonl.zstd` lesen — siehe `docs/status/api-nachweis.md` für die Schnittstellenform.

## 1. Ergebnis

**Alle fünf Werkzeuge grün, in zwei Läufen hintereinander.** Jeder Lauf ist eine **eigene
Sitzung** mit demselben Prompt; der Agent ruft die Werkzeuge selbst auf und meldet je eine Zeile.

```
Lauf 1  session-e0a96b3b-c371-4a68-bcbc-38a3a227f37b
Lauf 2  session-de62cba7-0b47-49e4-a9bb-5fc2294ce37c

  pwsh: OK
  glob: OK
  grep: OK
  read: OK
  write: OK
```

| Werkzeug | vorher | **jetzt** | Nachweis |
|---|---|---|---|
| `pwsh` | ❌ `subprocess runner requires target argv after a private -- delimiter` | **OK** | zwei Läufe |
| `grep` | ❌ `ripgrep provider failure` | **OK** | zwei Läufe |
| `glob` | ❌ `ripgrep provider failure` | **OK** | zwei Läufe, zusätzlich drei Einzelproben (3 392 / 3 392 / 1 153 Treffer) |
| `read` | ✅ | **OK** | zwei Läufe |
| `write` | ✅ | **OK** | zwei Läufe |

## 2. Der Vorbehalt, der dazugehört — `glob` war zwischenzeitlich noch rot

**Ehrlich benannt:** in der Sitzung `session-d2a76d09` — **nach** der `bunfig.toml`-Änderung —
meldete der Agent noch

```
Shell: OK
glob:  FEHLER glob subprocess failed before reporting an outcome (ripgrep provider failure)
grep:  OK
```

und in zwei späteren Läufen war `glob` **grün**. Ein Werkzeug, das einmal rot und zweimal grün
ist, ist **nicht** als grün belegt, sondern als **sprunghaft**. Die wahrscheinlichste Ursache ist
nicht ermittelt: in der roten Sitzung setzte der Agent **Shell, glob und grep in einem Schritt**
(nacheinander im selben Zug) ab, in den grünen Läufen ebenfalls — ein Unterschied ist damit
**nicht** belegt. **Was fehlt:** mehrere Läufe mit gezielter Wiederholung, um die Häufigkeit zu
bestimmen. Bis dahin gilt: **5 von 5 grün, aber `glob` mit einem beobachteten Ausfall.**

## 3. Die Ursache, die gemessen ist

```
bun  script.mjs -- cmd arg  ->  ["bun.exe",  "script.mjs",        "cmd", "arg"]   ← "--" fehlt
node script.mjs -- cmd arg  ->  ["node.exe", "script.mjs", "--",  "cmd", "arg"]   ← vorhanden
```

**Bun verschluckt den `--`-Trenner, Node reicht ihn an das Skript durch.** Der Subprozess-Runner
des Cores verlangt ihn **wörtlich**:

```js
// node_modules/@deepseek-ai/dsh-subprocess-local/lib/runner-launch-*.js
if (argv[0] !== "--" || argv.length < 2) throw new Error(
  "subprocess runner requires target argv after a private -- delimiter");
```

Der Runner ist der **gemeinsame** Weg für **Shell und Suche** — fällt er, fallen beide zugleich.
Und die Meldung erscheint als **Werkzeugfehler**, nicht als Startfehler: der Host startet sauber,
liefert HTTP 200, und erst bei der **Benutzung** fällt es auf.

**Behoben** durch `scripts/subprozess-argv-ergaenzung.mjs` (erweitert die Prüfung, schaltet sie
**nicht** ab) — eingehängt über `scripts/bun-luecken-vorladen.mjs`, geladen aus **`bunfig.toml`**.

## 4. Der eigene Fehler, der zwei Anläufe gekostet hat

Die Ergänzung hing zuerst **nur** als `--preload` am Host-Start. Der Host meldete brav
`[pmh] Bun-Lücke ergänzt: Subprozess-argv` — **und die Werkzeuge blieben rot.**

**Grund:** der Runner ist ein **eigener `bun`-Prozess** (`spawnRunnerInvocation()` gibt
`[process.execPath, <runner.js>]` zurück). Ein `--preload` beim **Elternprozeß** erreicht das
**Kind** nicht. Erst in `bunfig.toml` findet **jeder** Bun-Prozeß des Projekts die Vorladung von
selbst.

**Die Lehre, die bleibt:** eine Ergänzung, die **Erfolg meldet**, ist damit noch nicht **wirksam**.
Der Nachweis ist der Werkzeugaufruf, nicht die Meldung des Laders.

## 5. Was nicht geprüft ist

* **`web_fetch`** — im Selbsttest-Bericht rot (`dispatcher.close is not a function`). In unserer
  Werkzeugliste **nicht enthalten** und damit hier **nicht prüfbar**.
* **`subagent`** — im Selbsttest-Bericht grün. **Nicht nachgefahren.**
* **Die Häufigkeit des `glob`-Ausfalls** (Abschnitt 2).
* **`EISDIR … link …tmp`** aus dem Selbsttest-Bericht (Schreiben in den Arbeitsbereich auf `D:`).
  Unser Arbeitsbereich liegt auf `C:`, dort schreibt `write` nachweislich. **Offen und
  pfadspezifisch.** Dazu gehört der **getrennte** Befund `packages/util/atomic-write`:
  `Zugriff verweigert (os error 5)` beim Anlegen der temporären Datei — **nicht** durch unsere
  Änderung verursacht (ohne `bunfig.toml` scheitert derselbe Test identisch: 18 pass, 1 fail).
