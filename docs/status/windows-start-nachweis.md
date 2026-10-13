# Windows-Startnachweis

> **Gemessen:** 13.10.2026 · Windows nativ (PowerShell) · Bun **1.4.0** aus
> `C:\Users\Chang\.bun\bin\bun.exe` · Go **1.26.2 windows/amd64**
>
> **Auftrag:** `t40`. Ziel war ein Start wie `pnpm dsh web` — aber über **Bun**,
> ohne pnpm/npx, mit TS7-Compile und den Go-Diensten über denselben Einstieg.

## 1. Ergebnis in drei Zeilen

| Kommando | Windows nativ |
|---|---|
| `bun install` | **exit 0** |
| `bun run typecheck` | **exit 0 — 8/8 Pakete** |
| `bun run build` (Vite/TS7) | **exit 0** — `dist/` erzeugt, 221,78 kB JS, **1 s** |
| `bun run start:web` | **exit 0** des Launchers — **aber der Host-Prozess scheitert** (§5) |

**Der Launcher funktioniert. Der Host kommt unter Windows nativ nicht hoch** — aus
einem Grund, der **nicht** bei uns liegt (§5). Unter WSL2 lief er (HTTP 200).

## 2. Der Windows-Fallstrick: drei `bun`-Einträge, zwei defekt

| Eintrag | Verhalten |
|---|---|
| `%APPDATA%\npm\bun.ps1` | **blockiert** — „Das Ausführen von Skripten ist auf diesem System deaktiviert" (Ausführungsrichtlinie `Restricted`) |
| `%APPDATA%\npm\bun.cmd` | **inkompatibel** — „Die Version von …\npm\node_modules\bun\bin\bun.exe ist mit der ausgeführten Windows-Version nicht kompatibel" |
| **`%USERPROFILE%\.bun\bin\bun.exe`** | **funktioniert** — 1.4.0 |

**Warum das den Typecheck zerlegt:** Das Skript ist
`bun run --filter '*' typecheck` — ein **verschachtelter** Aufruf. Der zweite Aufruf
löst `bun` über den **PATH** auf und trifft dort das defekte npm-Paket:

```
$ bun run --filter '*' typecheck
Die Version von ...\npm\node_modules\bun\bin\bun.exe ist mit der
ausgeführten Windows-Version nicht kompatibel.
error: script "typecheck" exited with code 1
```

**Reparatur:** `C:\Users\Chang\.bun\bin` **vor** den npm-Pfad stellen. Danach läuft
`bun run typecheck` mit exit 0. **Kein Skript musste geändert werden** — es war die
PATH-Reihenfolge.

## 3. Der Starter: `scripts/start.mjs`

**Warum ein eigenes Skript und nicht ein Einzeiler in `package.json`.** Drei Gründe,
jeder gemessen:

1. **`process.execPath` statt `'bun'`.** Ein nackter Programmname wird über den PATH
   aufgelöst — und dort steht das defekte Paket. `process.execPath` ist die
   **laufende** Binärdatei und damit nachweislich funktionsfähig. Der Start wird damit
   **unabhängig von der PATH-Reihenfolge**.
2. **Go bauen statt `go run`.** `go run` startet einen Wrapper-Prozess, der das
   Programm als Kind führt; beim Beenden bleibt dann leicht ein Enkel übrig. Dieses
   Skript baut nach `.pmh-build/` und startet die Binärdatei direkt.
3. **Gemeinsame Logs mit Präfix** (`[host]`, `[pmh-attach]`) und **umgekehrtes
   Beenden** — der Host wird zuletzt abgesteckt, weil er auf Diensten aufbauen kann.

**Kommandofläche:**

| Kommando | Wirkung |
|---|---|
| `bun run start` | Host **und** Go-Dienste |
| `bun run start:web` | nur der Host (`--no-go`) |
| `bun run start:go` | nur die Dienste (`--no-host`) |
| `bun run start -- --port 5200 --profile web` | Flags werden durchgereicht |

**Belegter Launcher-Lauf (Windows, `start:web`):**

```
[pmh] Start — Bun 1.4.0 auf win32
[pmh] Laufzeit: C:\Users\Chang\.bun\bin\bun.exe
[pmh] Host: apps/cli (Profil "web", Port 5199)
[pmh] 1 Prozess(e) laufen. Beenden mit Ctrl+C.
```

## 4. Behobener Befund: HMR verhindert den Start unter Bun

Das Basis-Bündel bringt diese Zeile mit:

```yaml
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  disabled: !!js "!ctx.get('profileContext')"
```

Sie ist **nur dann aktiv, wenn ein `profileContext` existiert** — und unser Host setzt
ihn. HMR verlangt dann Node-Interna:

```js
if (process.execArgv.includes('--expose-internals')) try { return require(id) } catch {}
if (!this.ctx.loader.internal) throw new Error('--expose-internals is required for HMR service')
```

Unter Bun gibt es dieses Flag nicht. **Behoben** durch eine Patch-Zeile im Host
(`HMR_DISABLE_PATCH`, `{ id: 'hmr', disabled: true }`), die **vor** die
Aufrufer-Overlays gehängt wird — ein `--patches`-Argument kann HMR also wieder
einschalten, wenn die Laufzeit es trägt.

**Warum Abschalten hier richtig ist:** `hmr` steht **nicht** in
`requiredStartupEntryIds` — Pflicht sind nur `agent-loop`, `webserver`, `web-runtime`,
`modules`, `connection`, `headless-runner`, `acp`, `sdk-jsonrpc-server`. HMR ist
Nachladen bei Quelltextänderung, sonst nichts.

## 5. Der offene Blocker: `connection` wartet auf `webRuntime`

Nach der HMR-Korrektur bleibt **ein** Pflicht-Eintrag rot:

```
Failed plugins (7):
  connection (required)
    Package: @deepseek-ai/dsh-client-connection
    Error: cannot get property "webRuntime" without inject
```

**Was daran auffällt — und was ich nicht behaupte:** `web-runtime` ist **kein eigenes
Paket**. Es ist eine Zeile im Web-Bündel, die auf `@deepseek-ai/dsh-web-app` zeigt —
also genau auf das Paket, das in unserem Host als Abhängigkeit steht. Der Fehler sagt
damit: die Zeile `connection` versucht `webRuntime` zu lesen, **bevor** die Zeile
`web-runtime` ihn bereitgestellt hat.

**Was ich geprüft und ausgeschlossen habe:**

| Prüfung | Ergebnis |
|---|---|
| `@liustack/modlens` installiert? | **nein** — `node_modules\@liustack` fehlt vollständig; das Plugin scheitert deshalb beim Import |
| Steht `modlens` im Web-Bündel oder im Profil-Patch? | **nein** — in keiner der durchsuchten YAML-Dateien |
| Kennt unser Host diese Pakete? | **nein** — `apps/cli/package.json` nennt weder `modlens` noch `ptc-runtime`, `typert-loader`, `mcp-firecrawl` |

**Ehrliche Einordnung:** Ich habe die **Ursache der Reihenfolge** nicht bis zum Ende
geklärt. Belegt ist: der Pflicht-Eintrag `connection` scheitert an einem Dienst, der
laut Bündel von `@deepseek-ai/dsh-web-app` kommen soll — und dieser zeigt sich unter
**Bun** nicht. Unter **WSL2** lief derselbe Host und lieferte **HTTP 200**.

**Die wahrscheinlichste Erklärung** (Hypothese, nicht Messung): Es ist **derselbe
Bun-Grenzbefund** wie bei `node-addon-require-builtin` (`docs/risks.md` §6) — ein
Laufzeit-Interzeptor, den das Web-Bündel braucht und Bun nicht bereitstellt. Das ist
**nicht** durch eine Patch-Zeile zu beheben, sondern ist eine Grenze der Laufzeit.

**Was daraus folgt:** Für **Windows nativ** ist der Host derzeit nicht startfähig;
**WSL2 ist der Weg** — genau die Entscheidung, die `docs/status/README.md` schon
festhält. Der Launcher bleibt trotzdem richtig: er startet unter WSL2 und wird unter
Windows nativ, sobald die Kette es trägt.

## 6. Was **nicht** belegt ist

| Offen | Grund |
|---|---|
| `bun run start` mit **Go-Diensten** | Der Launcher-Build-Pfad ist geschrieben, aber im vollen Lauf nicht bis zum HTTP-Nachweis gekommen, weil der Host vorher scheitert |
| **cmd**-Nachweis | Nur PowerShell getestet; cmd steht aus |
| **Ctrl+C** und Waisenprozesse | Nicht geprüft |
| Web-Host **HTTP 200** unter Windows nativ | **nicht erreicht** — siehe §5 |

Diese Punkte werden **nicht** als erledigt geführt. `t40` bleibt deshalb **offen**.

## 7. Was auf diesem Rechner **nicht** angefasst wurde

Kein pnpm, kein npx. Keine Installation. `docs\dsh` und `docs\design` nicht geöffnet.
Die Vorlage nur gelesen. `apps/web` unverändert.
