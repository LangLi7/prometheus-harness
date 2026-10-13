# Risiken

Nach Schwere sortiert. Jedes Risiko hat eine **Messung**, die es klärt — nicht eine Meinung.

## 1. Bun und native Addons — offen, höchste Priorität

**Das Risiko.** Bun ist gewählt, weil es TypeScript direkt ausführt und damit die
Transpilation umgeht. Der Referenz-Harness hängt aber an nativen Addons:

| Addon | Wofür | Risiko |
|---|---|---|
| `koffi` | JSONL-Dauerhaftigkeit, `MoveFileExW` mit Write-Through (Windows) | **hoch** |
| `node-pty` | persistentes Terminal, ConPTY auf Windows | mittel |

`koffi` ist der kritische Punkt: Der Referenz-Harness **baut es aus dem Quellcode**, weil
Prebuilts unter GCC 13 scheitern (belegt in dessen `pnpm-workspace.yaml`). Ein
Quellcode-Build gegen Buns ABI ist ungeprüft.

**Wie es sich klärt.** Bun installieren, im Referenz-Fork die beiden Addons laden und je
eine echte Operation ausführen — nicht nur importieren:

1. `node-pty`: PTY öffnen, ein Kommando senden, Ausgabe lesen, schließen (ConPTY auf Windows).
2. `koffi`: `MoveFileExW` mit `MOVEFILE_WRITE_THROUGH` binden und eine Datei schreiben.

**Wenn es scheitert:** Optionen in dieser Reihenfolge — (a) Ersatz-Addon suchen,
(b) die betroffene Fähigkeit als eigenen Dienst aus dem Core herausziehen (passt zur
Architektur), (c) Laufzeit auf Node bleiben lassen und TS 7 nur als Typecheck nutzen.

## 2. TypeScript 7 und die Build-Werkzeuge — bekannte Größe

**Das Risiko.** 288 Skripte des Referenz-Harness nutzen die alte Compiler-API
(132 Funktionen), die in TS 7 umgezogen ist. Kein Laufzeitcode betroffen, aber
`pnpm run build` würde mit TS 7 brechen.

**Warum es uns weniger trifft.** Wir schreiben diese Skripte nicht neu — mit Bun entfallen
sie. Und der Typecheck läuft mit TS 7 fehlerfrei (12,7 s statt 129,7 s).

**Restrisiko.** Falls wir doch Generatoren nachbauen (Kataloge, Dokumentationsgraphen),
müssen sie gegen die **neue** API geschrieben werden: `typescript/ast` für Prädikate,
`typescript/sync` für Typinformation. Nie gegen die alte.

**Blocker nicht vergessen.** `peerDependencyRules.allowedVersions.typescript: '>=5 <7'` im
Referenz-Fork blockt TS 7. Erst anheben, wenn die Werkzeuge portiert sind.

## 3. Drei Sprachen gleichzeitig — Zeitrisiko

**Das Risiko.** Go, Rust und Bun parallel einzuführen macht jeden Fehler mehrdeutig: Bei
einem Ausfall kann man nicht sagen, welche Sprache schuld ist. Und es verdreifacht die
Werkzeugketten (Build, Test, Abhängigkeiten, CI).

**Gegenmaßnahme.** Die Reihenfolge aus [concept.md](concept.md): Core läuft → ein Unit
beweist die Kette → dann Sprachgrenzen. Jede Auslagerung wird mit einer Messung begründet.

## 4. Core-Abwanderung vom Upstream

**Das Risiko.** Wenn der eigene Core stark vom DeepSeek Harness abweicht, verliert man
dessen Fehlerbehebungen und Sicherheitsupdates.

**Gegenmaßnahme.** Zwei getrennte Dinge nicht vermischen:
- **Core** — wo möglich am Upstream bleiben; dort sind die Steckplätze schon vorgesehen.
- **Units** — unsere Fähigkeiten, die den Core nur benutzen.

Der Referenz-Fork bleibt als Vergleichsobjekt erhalten, damit ein Auseinanderdriften
sichtbar wird, bevor es teuer ist.

## 5. Das Home wird geteilt — Betriebsrisiko

**Das Risiko.** `~/.pmh` und `~/.dsh` haben getrennte Credential-Dateien, aber zwei
gleichzeitig laufende Instanzen könnten beim Start um die Store-Auswahl konkurrieren.

**Gegenmaßnahme.** Schreibende Modell-Konfiguration nur in einer Instanz gleichzeitig
ändern. Die Dateien sind getrennt, die Verwechslung entsteht nur durch Bedienung.

## 6. Bun kann `PluginPackages` nicht laden — **gemessen**, nicht vermutet

**Das Risiko ist eingetreten, an einer Stelle, die niemand auf der Liste hatte.** Der
Web-Host des Upstreams hängt das Boot-Plugin `PluginPackages` ein. Dieses Plugin installiert
profil-deklarierte Pakete und hängt dafür einen **Laufzeit-Interzeptor** ein, der das native
Addon **`node-addon-require-builtin`** braucht, um Nodes interne ESM-Loader-Schnittstelle zu
erreichen.

**Die Messung (12.10.2026, Bun 1.4.0, Windows x64, Node 26 als Vergleich):**

```
bun run apps/cli/src/main.ts web --port 5199 --no-open
→ pmh: host preparation failed: node-addon-require-builtin unsupported:
       Unsupported/no-context (required V8 current-context symbols were not found)
   diagnostics: { mode: "napi", backend: "napi", node: "26.3.0",
                  has_v8_context: false, status: "Unsupported/no-context" }
```

`has_v8_context: false` ist der Kern: Bun stellt die V8-Interna nicht bereit, die dieses
Addon braucht. Es ist **kein** Fehler in unserer Konfiguration — dasselbe Addon würde unter
einer Node-Laufzeit funktionieren.

**Was wir daraufhin tun (und warum das die Architektur bestätigt).** `PluginPackages` wird
im eigenen Host **weggelassen**, nicht umgangen. Die Bündel-Pakete stehen als gewöhnliche
Abhängigkeiten in `apps/cli/package.json` und werden über den Installations-Anker
aufgelöst. Damit läuft der Harness — belegt: `GET /?token=…` → **HTTP 200** (3.845 B).

**Was dadurch fehlt.** Profil-deklarierte Plugins werden **nicht** automatisch installiert.
Für den Hybrid-Meilenstein ist das ohne Wirkung; für **t14 (Plugin-Export)** ist es
wesentlich: das Einhängen von Bündeln darf sich nicht auf diesen Interzeptor stützen,
sondern muss über den Anker und den Loader gehen.

**Warum das risiko-architektonisch gut ausgeht.** Es ist genau der Fall, für den Regel 4
(`docs/concept.md`: jede andere Sprache ist ein Prozess) und die Prozesstrennung aus
`MAPPING.md` §1.1 gebaut wurden: Eine Kernfähigkeit, die unter der gewählten Laufzeit nicht
trägt, wird **nicht** durch einen Laufzeitwechsel geheilt, sondern durch eine Grenze —
hier durch ausdrückliche Deklaration statt Interzeption.

**Nicht geklärt.** Ob eine Node-Laufzeit denselben Code vollständig trägt, ist **ungeprüft**
(und damit auch, ob der Weg „Node statt Bun" dieses Risiko wirklich schließt). Das ist die
nächste Messung, wenn Plugin-Verwaltung gebraucht wird.

## Erledigt und dokumentiert

- **pnpm-Junctions mit absolutem Pfad** — jeder Umzug des Checkouts braucht
  `pnpm install --force`. Belegt: ~1400 Junctions zeigten nach einem Umzug ins Leere.
- **`AGENTS.md` des Upstream liegt im Repo-Wurzelverzeichnis** — der Agent lädt ihn
  automatisch. Bei Arbeit im Fork ist das erwünscht (Konventionen), nicht ein Konflikt.
  Eine `.local.md`-Ebene existiert, ist aber nur für `CLAUDE.local.md` gitignoriert.
