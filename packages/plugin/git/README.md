# @prometheus-harness/git

**Git als eigenes DSH-Plugin** — ein Sidebar-Eintrag **Git**, ein Panel im Hauptfeld, derselbe
Inhalt als beweglicher Tab in der rechten Leiste, und **gruppiert nach Workspaces**: die
Projektliste kommt vom Host (`ctx.workspaceRegistry`), nicht aus dem Browser.

Anlaß (Betreiber, 21.10.2026): *„ich möchte das du git implementierst local und cloud wie zb Gitlab
und github und local git: Git, Forgejo, gitea oder Gitlab CE — das es nach workspaces anpasst …
wahrscheinlich als plugin"* — mit der Überprüfungsansicht des alten Werkzeugs als Vorbild:
**Git changes · Branch changes · Änderungen der letzten Runde**, Dateiliste mit Status und `+/−`,
aufklappbare Diffs, „Vereinheitlicht / Geteilt".

## Wo es erscheint

| Ort | Anmeldung | Was der Nutzer sieht |
|---|---|---|
| Seitenleiste | `sidebar.panellist`, `order: 14` | Knopf **Git**, neben Verbrauch und Obsidian |
| Hauptfeld | `main`, `key: 'git'` | das Panel, schließbar über **Schließen** |
| **Rechte Leiste** | Tab-Typ `pmh-git`, Rumpf in `sidebar.right.pane.tab` | Guide-Eintrag **Git** (Reihenfolge 37) → andockbar, schwebend, splittbar |

## Ein Workspace, nicht zwei Karten (seit 21.10.2026)

Mit zwei Workspaces standen zwei Karten untereinander — die zweite begann erst nach der ersten, und
bei 2925 Dateien sah man sie nie. Der Betreiber: *„das sollte smart sein … und wenn es 2 anzeigen
sollten wir moderne dropdown machen"*. Also:

- **Auswahlfeld im Kopf** statt gestapelter Karten; es nennt `Titel · Zweig · Anzahl` bzw. `· kein Repo`.
- Beim Öffnen ist der Workspace **mit Repository** gewählt; die Auswahl bleibt über „Aktualisieren" stehen.
- **Schmale Leiste (< 520 px):** gemessen per `ResizeObserver`, nicht per Medienabfrage — der Tab
  kann 300 px oder 900 px breit sein. Dort fallen Kicker, Statuswort, `+/−`, Commit-/Remote-Spalten
  und der Ansichtsumschalter weg; das Auswahlfeld nimmt die volle Breite.


## Die drei Modi

| Modus | Frage | Was auf dem Host läuft |
|---|---|---|
| **Git changes** (`arbeitsbaum`) | was ist jetzt nicht committet | `status --porcelain=v2 --branch -z` + `diff --numstat -z` (Index und Arbeitsbaum) |
| **Branch changes** (`zweig`) | was hat dieser Zweig seit der Abzweigung geändert | `diff --name-status -z <basis>` + `--numstat`; Basis ist Upstream, sonst `origin/HEAD`, sonst `main`/`master` |
| **Letzte Runde** (`letzte-runde`) | was hat der letzte Commit geändert | `diff --name-status -z HEAD~1 HEAD` |

Ein unbekannter Modus ist **400** — kein stiller Rückfall auf den Arbeitsbaum. Sonst zeigte das
Panel etwas anderes, als der Nutzer angeklickt hat.

## Routen

| Weg | Methode | Antwort |
|---|---|---|
| `/api/pmh/git/stand?modus=&workspace=` | GET | alle Workspaces mit Repostand, Commits und Remotes |
| `/api/pmh/git/diff?workspace=&modus=&pfad=&bereich=&basis=` | GET | Hunks mit Zeilennummern beider Seiten |
| `/api/pmh/git/aktion` | POST | `{ workspace, aktion, pfade?, nachricht? }` → Ergebnis **und** neuer Stand |
| `/api/pmh/git/fern?workspace=` | GET | offene Pull Requests und Issues (nur lesend) |

Alle vier sind gesperrt: ohne Anmeldung **401**, ohne Verbindungsdienst **503**. Ein Panel, das
Pfade und Commits jedes Repositories im Netz zeigt, wäre eine Einladung.

## Aktionen

| Aktion | Befehl | Anmerkung |
|---|---|---|
| `stage` | `git add -A [-- <pfade>]` | ohne Pfadliste der ganze Baum |
| `unstage` | `git reset -q -- <pfade>` | ohne Pfadliste **abgewiesen** — ein Zurücksetzen von allem ist keine Aktion, die man versehentlich auslöst |
| `commit` | `git commit -m <nachricht> [-- <pfade>]` | leere Nachricht wird abgewiesen, **bevor** git läuft |
| `fetch` | `git fetch --prune` | |
| `pull` | `git pull --ff-only` | kein Merge-Commit aus dem Panel |
| `push` | `git push`, bei fehlendem Upstream `push -u origin <zweig>` | der einzige Fall, in dem Konfiguration geschrieben wird |

Ein Pfad, der mit `-` beginnt, wäre eine Option: deshalb steht vor jeder Pfadliste ein `--`, und
leere oder NUL-haltige Pfade werden abgewiesen.

## Cloud: GitHub, GitLab, Forgejo, Gitea

Erkannt wird der Anbieter am Remote (SSH, HTTPS, SCP-Form). **Erkannt heißt vermutet:** ob
`git.firma.de` Forgejo oder etwas Drittes ist, steht in keiner URL — solche Hosts bleiben
`unbekannt` und werden auch so genannt. Codeberg gilt als Forgejo.

Gelesen werden **offene Pull Requests und Issues** (je 5), über:

| Anbieter | API | Token |
|---|---|---|
| GitHub | `api.github.com` bzw. `/api/v3` | `GITHUB_TOKEN`, `GH_TOKEN` |
| GitLab | `/api/v4` | `GITLAB_TOKEN`, `GL_TOKEN` |
| Forgejo | `/api/v1` | `FORGEJO_TOKEN`, `GITEA_TOKEN` |
| Gitea | `/api/v1` | `GITEA_TOKEN` |

**Ohne Token sagt das Panel es** — statt einer leeren Liste, die wie „nichts offen" aussieht.
Schreibende Cloud-Aktionen (kommentieren, mergen) gibt es bewusst nicht: das ist eine Entscheidung
mit Folgen für andere Menschen, kein Knopf in einer Randleiste.

## Warum git **nicht** durch `ctx.subprocess` läuft (seit 21.10.2026)

Ursprünglich lief jeder Befehl durch `ctx.subprocess` — die Naht, die die Umgebung säubert und
Prozesse verwaltet. **Sie ist unter Windows nach dem ersten Lauf gestorben**, und zwar so:

```
subprocess failed before reporting an outcome:
  Error: subprocess-local: Windows Job runner exited with exit code 127
         before proving its managed range empty
```

Danach lieferte jeder `spawn` ein **Handle ohne Kind**, und `done` löste nie auf — das Panel blieb
bei „Lese Repositories …" stehen. Gemessen am 21.10.2026: Lauf 1 in 731 ms, Lauf 2 und 3 in einen
90-s-Timeout. Drei `rev-parse` wurden gespawnt, kein `ende` kam, und **es lief kein git-Prozess**.
Das trifft jeden Verbraucher dieser Naht, nicht nur dieses Plugin.

Deshalb führt `BunAusfuehrung` (siehe `src/repo.ts`) git selbst über `Bun.spawn` aus. **Die
Säuberung bleibt:** `scrubbedParentEnv()` wird weiterhin aus `@deepseek-ai/dsh-subprocess` benutzt —
credential-förmige Namen und `DSH_*` erreichen das Kind nicht. Zusätzlich bekommt jeder Befehl:

| Variable | Warum |
|---|---|
| `GIT_TERMINAL_PROMPT=0` | ohne sie wartet ein `push` ewig auf eine Eingabe, die niemand geben kann |
| `GIT_OPTIONAL_LOCKS=0` | ein Lesebefehl soll keine Sperren nehmen, die einen parallelen Commit stören |
| `GIT_PAGER=cat` | kein Pager in einem Prozess ohne Terminal |
| `LC_ALL=C`, `LANG=C` | vergleichbare Fehlerausgabe |

Dazu eine Frist je Befehl (lokal 15 s, Netz 120 s), eine Obergrenze der Ausgabe (8 MiB) und
höchstens vier Repositories gleichzeitig — fünfzig Workspaces hießen sonst fünfzig git-Prozesse auf
einmal.

**Der Nachweis, daß der Wechsel half:** vier aufeinanderfolgende `GET /stand` auf demselben Host —
**667, 524, 593, 518 ms**, 3 Workspaces, 2925 Änderungen. Vorher hing der zweite Aufruf dauerhaft.

**Ein Nicht-Null-Exit ist kein Fehler.** `git diff` endet mit 1, wenn es Unterschiede gibt; erst der
Aufrufer entscheidet, was ein Exit bedeutet.

## NixOS und Linux — was geprüft ist und was nicht

Das Projekt hat ein NixOS-Konzept (`docs/design/nixos-self-change.md`) mit einer **verbindlichen
Grenze**: *„NixOS und Nix werden nicht installiert"* (Weisung des Betreibers, 12.10.2026). Ein
echter `nixos-rebuild`-Lauf ist damit kein Prüfweg. Geprüft ist der Rand, den NixOS mit jedem
Linux teilt — und die Betriebsarten, in denen ein NixOS-Host anders aussieht als dieser Windows-Host:

| Frage | Wie geprüft | Ergebnis |
|---|---|---|
| Läuft es unter Linux mit echtem git? | Container `oven/bun` + `git 2.47.3`, Kernel 6.6 (WSL2) | **43 Tests grün**, inkl. `init`/`commit`/`stage`/Diff im Temp-Repo |
| Findet es git im Nix-Store? | `Bun.which('git')` bzw. `PMH_GIT=/nix/store/…/bin/git` | der Pfad geht als `argv[0]` weiter; Test grün |
| Was, wenn git **fehlt**? | `Bun.which` liefert `null` | Route **503** mit „nicht auffindbar" — **keine** leere Liste, die wie „keine Änderungen" aussieht |
| Was, wenn das Repo einem anderen Benutzer gehört? | git antwortet `dubious ownership` | `erklaereGitFehler` macht daraus einen Satz mit dem Ausweg (`safe.directory`) — der rohe git-Text bleibt nicht stehen |
| Was, wenn das Verzeichnis kein Repo ist? | `not a git repository` | eigener Satz, getrennt von der Berechtigungssperre |

**Nicht geprüft:** ein NixOS selbst. Das ist die Grenze des Konzepts, nicht dieses Plugins — und sie
steht dort begründet.

## Grenzen, die dieses Paket nicht versteckt

- **Kein OAuth.** Tokens kommen aus der Umgebung; die Credential-Naht des Harness kennt heute die
  Modell-Anbieter, nicht GitHub.
- **`pull` nur `--ff-only`.** Ein Merge aus dem Panel wäre eine Entscheidung, die einen Konflikt
  erzeugen kann — die trifft der Nutzer im Terminal.
- **Diff-Grenzen:** 4000 Zeilen je Datei, 512 KiB je unversionierter Datei, 8 MiB je Befehl. Was
  darüber liegt, wird als Ausschnitt markiert, nicht stillschweigend gekürzt.
- **Die Dateiliste ist auf 300 Einträge begrenzt** — mit der Gesamtzahl daneben. Gemessen am
  21.10.2026 hat dieses Repository **2636** geänderte Dateien; alle zu rendern wäre kein Überblick,
  sondern ein Standbild. Die Liste kommt in rund einer Sekunde.
- **Der geteilte Modus paart Blöcke**, er führt keinen Zeilenabgleich über den Hunk hinaus durch.
- **Ein Workspace ohne Repository** erscheint mit Hinweis, nicht als Fehler — nicht jedes Projekt
  ist ein Repository.
- **Windows-Pfade** kommen aus git mit Schrägstrichen; die Anzeige normalisiert zusätzlich.

## Installieren

```powershell
bun run packages/plugin/git/install.mjs
```

Das Skript ist **idempotent** und prüft genau die drei Dinge, die von Hand schiefgingen:

| Punkt | Was es prüft | Was es tut |
|---|---|---|
| Wurzel-Verknüpfung | `node_modules/@prometheus-harness/git` | meldet, wenn `bun install` fehlt (der Loader importiert vom Repo, nicht vom Profil) |
| Profil | `dependencies` **und** `dsh.profile.bundles` | trägt fehlende Einträge ein, sonst nichts |
| Client-Bündel | `lib/client.js` | meldet, wenn `bun run packages/plugin/git/build.mjs` fehlt |
| git | `Bun.which('git')` / `PMH_GIT` | meldet, wenn das Panel mit 503 antworten würde |

Danach **Host neu starten**. Ein Neuladen der Seite genügt nicht.

Die Einzelheiten, die das Skript abkürzt:

```jsonc
// .pmh-build/harness-home/profiles/web/package.json
"dependencies": { "@prometheus-harness/git": "link:C:/Users/Chang/prometheus-harness/packages/plugin/git" },
"dsh": { "profile": { "bundles": [ /* … */ "@prometheus-harness/git" ] } }
```

Das Paket ist **Bündel und Plugin zugleich**:

- `dsh.bundle.patch` → `cordis.patch.yml` fügt die Zeile `pmh-git` ein
- `dsh.client` → `lib/client.js` registriert `main:git`, `sidebar.panellist:git` und den Tab-Typ
- `main`/`exports["."]` → `src/server.ts` (die Host-Hälfte)

**Entweder Bündel oder `scripts/profile-patch.mjs` — nie beides.** Der Core wirft bei doppeltem
`(kind, path)`, und der Host startet dann nicht.

Nach der Änderung **muß der Host neu starten**: Server-Plugins lädt der Host beim Start, nicht beim
Öffnen eines Panels. Die Browser-Hälfte allein genügt nicht.

## Zwei Fallen, die einen Start gekostet haben (21.10.2026)

**1. Das Paket muß im Wurzelverzeichnis verlinkt sein, nicht nur im Profil.**

Der Cordis-Loader importiert unter Bun **ohne `baseUrl`** (`cordis-plugin-loader`: `import(name)`).
Aufgelöst wird damit vom **`node_modules` des Repos**, nicht vom Profil. Eine Junction im Profil
genügt deshalb nicht. Ohne den Wurzel-Eintrag meldet der Host:

```
pmh: warning: 1 entry did not activate
pmh-git (@prometheus-harness/git): failed to import
```

**Die Ursache steht nirgends** — `dsh-app-boot` sieht nur `fiber === undefined`. Der Weg dahin war
ein Schattenstart mit eigenem Home (`bun run start --no-go --port 3222 --home <tmp>`), der die
Meldung sichtbar macht. Die Abhilfe:

```powershell
bun install        # legt node_modules/@prometheus-harness/git an
```

**2. Ein laufender Host sieht ein neues Paket nicht — und `401` beweist nichts.**

Der `/api`-Prefix antwortet **ohne Anmeldung immer 401**, auch für Wege, die es nicht gibt. Ein
`401` auf `/api/pmh/git/stand` heißt also **nicht**, daß die Route existiert. Der belastbare
Nachweis vor dem Neustart ist der Boot-Roster im HTML:

```powershell
# nach Anmeldung: enthält die Antwort "@prometheus-harness/git/client.js"?
Invoke-WebRequest "http://127.0.0.1:3222/" -WebSession $s | Select-String 'prometheus-harness/git/client.js'
```

## Geprüft

- **65 Tests** grün (`bun test packages/plugin/git`), darunter ein **echtes Repository** unter
  `tmpdir()`: `init`, Commit, Änderung, `stage`, `commit`, die drei Modi und ein Diff — alles gegen
  git selbst, nicht gegen eine Attrappe.
- Parser gegen gemessene Formen: `status --porcelain=v2 -z` (jede `#`-Zeile ein NUL-Feld, gemessen),
  Umbenennungen in `numstat`, `name-status`, `log`, `remote -v`, Diffs mit fortgeschriebenen
  Zeilennummern.
- Routen: vier Adressen, 401 ohne Anmeldung, 503 ohne Verbindungsdienst, 400 für unbekannte Modi und
  unzulässige Pfade (abgewiesen, **bevor** git schreibt), 404 für unbekannte Workspaces.
- Browser-Hälfte **ausgeführt**: vier Slots, Tab-Typ mit Guide-Eintrag, Stil-Lebenszyklus — und das
  Panel **mit echtem React gerendert** (`renderToStaticMarkup`): Kopf, Modus-Umschalter und
  Ladezustand stehen im HTML.
- `tsgo --noEmit` für beide Hälften: exit 0; im ganzen Baum **81 Pakete grün**.
- Bündel: 58,7 KB, Selbstprüfung meldet Kennung,
  `inject: ["slots","locale","layout","sidebarRightTabs"]` und `Panel: git`.
- **Live gegen dieses Repository** (21.10.2026): Zweig `main`, upstream `origin/main`, 145 voraus,
  **2636** Änderungen → **300 geliefert**, `gekuerzt: true`, erste Zeile `Cargo.lock 24/2`,
  Remote `github` → `https://github.com/LangLi7/prometheus-harness`; Dauer der Route **1,0 s**.

**Nicht geprüft:** ein Bildschirmfoto der Oberfläche im laufenden Host — dafür muß der Host mit
diesem Bündel neu starten.

