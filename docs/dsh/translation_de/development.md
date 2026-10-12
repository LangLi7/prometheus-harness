# Entwicklungsleitfaden

Englisch | [中文](development.zh.md)

Das Einrichtungs-Tutorial führt einen neuen Beitragenden von den Voraussetzungen bis zu einem geprüften Checkout. Die anschließende Referenz für Beitragende behandelt Repository-Layout, täglichen Workflow und CI-Organisation. Designbegründungen und Implementierungsdetails gehören zu den verlinkten Agent Notes und Skripten.

## Einrichtungs-Tutorial

### Voraussetzungen

- Node.js unterstützt 22.19+ und 24+. Die CI deckt 22.19, 24 und 26 ab; siehe die [Node engine floor Agent Note](../.agents/notes/implemented/process/2026-07-06-node-engine-floor.md).
- Node.js TypeScript type stripping aktiviert. Die Build-Skripte des Repositorys laden `tsdown.config.ts` mit dem nativen Config-Loader von tsdown, schlagen also fehl, wenn `--no-experimental-strip-types` in `NODE_OPTIONS` steht oder dem Node.js-Build die TypeScript-Unterstützung fehlt; `pnpm run build` prüft dies zuerst und benennt die Ursache.
- Corepack-fähiges pnpm. Das Repo pinnt `pnpm@11.28.5` in `package.json`; `corepack enable` ausführen, wenn `pnpm --version` nicht über Corepack aufgelöst wird.
- Git 2.26 oder neuer; die Hook-Einrichtung aktiviert die worktree-spezifische Konfigurationserweiterung von Git.
- Optional: ein DeepSeek-API-Schlüssel für die Web-, Headless- und ACP-Automations-Demos und für echte-API-e2e-Tests.

### Windows und WSL 2

Unter Windows kann mit nativen Tools entwickelt oder WSL 2 für eine Linux-Umgebung verwendet werden. WSL 2 ist nützlich, um Linux-Verhalten zu verifizieren und Linux-Toolchains zu nutzen, wenn die Kompilierung nativer Abhängigkeiten oder Dateisystem-Berechtigungen die Windows-Entwicklung behindern. Jede Umgebung benötigt ihre eigene Runtime, ihre eigenen Build-Tools und Berechtigungen; WSL ist optional.

Checkout, installierte Abhängigkeiten und Toolchain in derselben Betriebssystem-Umgebung halten. Für WSL 2 den Checkout im Linux-Dateisystem ablegen; für native Windows-Tools das Windows-Dateisystem verwenden. Der Zugriff auf Dateien über die beiden Dateisysteme hinweg erzeugt zusätzlichen Aufwand für I/O-intensive Operationen wie Git, Abhängigkeitsinstallation und Builds. Siehe Microsofts [file storage and performance guidance](https://learn.microsoft.com/en-us/windows/wsl/filesystems#file-storage-and-performance-across-file-systems).

Abhängigkeiten in jeder Umgebung separat installieren, da sich native Binärdateien und Links zwischen Betriebssystemen unterscheiden können. Testergebnisse gelten für die Umgebung, in der die Tests liefen; Windows-spezifisches Verhalten benötigt weiterhin eine native Windows-Validierung.

### Ersteinrichtung

pnpm verwendet seinen strikten symlink-basierten Linker, damit nicht deklarierte Abhängigkeiten fehlschlagen, statt sich auf Hoisting zu verlassen. Dependency-Build-Skripte ausdrücklich in `pnpm-workspace.yaml` auf die Allowlist setzen.

Abhängigkeiten aus dem Repo-Root installieren:

```sh
pnpm install
```

Die Installation konfiguriert außerdem worktree-lokale Lefthook-Hooks über `scripts/install-lefthook.mjs`. Die [worktree-local hooks Agent Note](../.agents/notes/implemented/process/2026-07-27-worktree-local-lefthook.md) besitzt den Sicherheitsvertrag für Hook-Pfade.

Das [DevTools-Frontend](../packages/experimental/inspector/README.md#use-this-package) wird lokal aus einem gepinnten npm-Quellpaket und Vite kompiliert. Nach der Installation der Abhängigkeiten benötigt sein Build keinen Netzwerkzugriff und keine Browser-Installation. Die Installation im Workspace und über das veröffentlichte Paket führt keinen Hook zum Herunterladen von DevTools-Ressourcen aus; veröffentlichte Inspector-Pakete enthalten das gebaute Frontend.

Wenn die Hooks fehlen, weil Abhängigkeiten aus dem Cache wiederhergestellt oder `postinstall` übersprungen wurde, sie manuell installieren:

```sh
node scripts/install-lefthook.mjs
```

Wenn der Wrapper eine bestehende Git-Konfiguration ablehnt oder einen veralteten Lock meldet, seinem Diagnosehinweis und der verlinkten Agent Note folgen, statt Worktree-Metadaten spekulativ zu bearbeiten. Nach dem Verschieben eines Checkouts den Wrapper erneut ausführen, um den verwalteten Pfad neu zu erzeugen.

Nach einem frischen Clone einmal typecheck ausführen:

```sh
pnpm run typecheck
```

Die Einrichtung ist abgeschlossen, wenn `pnpm run typecheck` erfolgreich beendet wird.

## Referenz für Beitragende

### TypeScript-Projektlayout

Das Repository verwendet isolierte Host- und Client-Aggregate. Ein gewöhnliches Paket ist in genau einem Aggregat registriert: Host-Pakete in `tsconfig.host.json` und Client-Pakete in `tsconfig.client.json`; drei Pakete (`host/webserver`, `compaction/compaction`, `typert/registry`) werden von beiden Aggregaten als gemeinsame Blätter referenziert, damit beide Seiten denselben Quellcode type-prüfen.

| Datei | Rolle | Bildet ein Programm? |
|---|---|---|
| `tsconfig.json` | Solution-Root: `extends` der Basis, `files: []` und Referenzen auf die beiden Aggregate. Es ist der Discovery-Einstieg für tsserver und der Einstieg zum expliziten Ausführen des vollständigen Project-Reference-Graphen; über die geerbten `paths` ist es außerdem die Auflösungskonfiguration für tsx beim Ausführen von `scripts/`. | Nein |
| `tsconfig.host.json` | Host-Aggregat: Host-Pakete, Beispiele, Tests, Skripte, Website und das außergewöhnliche Host-Projekt von `api/remotes`. | Ja |
| `tsconfig.client.json` | Client-Aggregat: Pakete aus `packages/client/*` und ihre Tests, `apps/web` und das außergewöhnliche Client-Projekt von `api/remotes`. | Ja |
| `tsconfig.base.json` | Gemeinsame compilerOptions und die `paths`-Map der Quellen. Außerdem die Auflösungs-Fassade, auf die die vitest-Konfigurationen vite-tsconfig-paths zeigen: Es hat kein `include`, seine `paths` gelten daher für jeden Importeur. | Nein |
| `tsconfig.base.client.json` | Browser-Compiler-Einstellungen (`jsx`, DOM-Libs, `types: []`), die vom Client-Aggregat und jedem Paket aus `packages/client/*` erweitert werden. | Nein |

Host und Client bleiben zwei Aggregat-Programme, weil beide Seiten das cordis-Interface `Context` unter denselben Schlüsseln mit unterschiedlichen Services per Declaration-Merging zusammenführen; ein Programm, das beide Merges sieht, meldet eine Kollision. Die Kollision existiert nur innerhalb eines `ts.Program` — die Modulauflösung löst sie nie aus —, weshalb die Solution auf beide Aggregate verweisen darf und eine paths-Fassade beide Seiten überspannen kann. Daraus folgen drei Disziplinen:

- `tsconfig.base.json` erhält niemals `include` oder `files`: Sie würden in jedes erweiternde Paketprojekt durchsickern und den Match-All-Umfang der Fassade einengen.
- Ein Skript, das ein repo-weites `ts.Program` baut, legt `tsconfig.host.json` oder `tsconfig.client.json` ausdrücklich zugrunde — niemals die Root-Solution, weil das Zusammenfassen beider Aggregate in ein Programm die `Context`-Merges kollidieren lässt.
- Ein neues Paket wird in genau einem Aggregat registriert; nur die oben genannten geteilten Pakete tragen beide Blatt-Konfigurationen, und die gemeinsamen Blätter sind in beiden Aggregaten registriert, weil jede Seite denselben Quellcode type-prüfen muss. Sowohl einen Node-Loader-Einstieg als auch einen Browser-Einstieg zu haben ist kein Grund, ein Paket zu teilen; ein gewöhnliches Client-Plugin erzeugt beide Runtime-Artefakte während der Client-Build-Phase.

Sechs Pakete teilen Host- und Client-tsconfigs: `api/remotes`, `api/gateway`, `api/session-controller`, `api/workspace-controller`, `client/connection` und `session-query/session-log-export`. Der Host-Einstieg von `api/remotes` nimmt am Host-Typert-Graphen teil, während sein Client-Einstieg generierte `/remote`-Deklarationen importiert; `session-log-export` hält die Node-Archiv-Erzeugung aus seinem Browser-Controller heraus. Jede geteilte `tsconfig.json` auf Paketwurzelebene ist daher nur eine Solution, und die beiden Aggregate und direkte Konsumenten referenzieren jeweils `tsconfig.host.json` oder `tsconfig.client.json`. Das `constraints`-Gate des Workspace durchläuft den erreichbaren Project-Reference-Graphen und prüft die jeweilige Compiler-Fassade jedes referenzierenden Projekts: Ein Ziel mit einer einzigen Konfiguration bleibt von beiden Fassaden aus gültig, während ein geteiltes Ziel das passende Blatt statt seiner Solution-Wurzel oder des gegenüberliegenden Blattes benennen muss; es entdeckt geteilte Pakete am Vorhandensein beider Blatt-Konfigurationen, sodass ein neues geteiltes Paket automatisch am Gate teilnimmt. Die [`api-remotes` README](../packages/api/remotes/README.md) und die [`session-log-export` README](../packages/session-query/session-log-export/README.md) erläutern ihre Teilungen.

Der Root-Build folgt der generierten Abhängigkeitsreihenfolge:

```sh
tsc -b tsconfig.host.json
tsdown --env.DSH_BUILD_FACE host
pnpm --filter @deepseek-ai/dsh-desktop run bundle
tsc -b tsconfig.client.json
tsdown --env.DSH_BUILD_FACE client
pnpm run build:web
```

`pnpm run build --artifacts-only` erzeugt dieselben Projekt- und Anwendungsartefakte, prüft und kompiliert dabei aber nur die bestehenden Paketreferenzen der jeweiligen Compiler-Fassade. Die erforderlichen normalen Linux- und Windows-Builds und das öffentliche `typecheck` prüfen zusätzlich die repo-weiten Test- und Skriptprogramme. Die Vorbereitung der CI-Benchmarks verwendet für ihre wegwerfbaren Bibliotheksausgaben zusätzlich `--noCheck` und verlässt sich für Diagnosen auf jene erforderlichen Builds; andere Artefakt-Builder behalten die Paketprüfung ([Begründung](../.agents/notes/implemented/process/2026-10-05-pr-artifact-typechecks.md)).

Beide tsdown-Durchläufe treffen auf `vendor/*`, `packages/*/*` und `apps/cli` zu; der Host-Durchlauf trifft zusätzlich auf `apps/desktop-host` zu. Sie scannen weder Build-Artefakte, um Client-Pakete zu entdecken, noch pflegen sie eine Host/Client-Paketfilterliste. Paketlokale tsdown-Konfigurationen wählen die Einstiege für die aktuelle Phase über `DSH_BUILD_FACE` aus: Ein gewöhnliches Client-Plugin erzeugt während der Client-Phase sowohl seinen Node-Loader als auch sein Browser-Bundle; `api-remotes` verwendet `hostPhase: true`, um seinen Host-Einstieg früh zu erzeugen und während der Client-Phase nur sein Browser-Bundle. Tsdown konsumiert nur das JavaScript, das die vorangehende tsc-Phase nach `lib/types` emittiert. Tsdown baut die passenden Workspace-Mitglieder nebenläufig, daher bündelt `apps/desktop`, dessen Haupt-Bundle Workspace-devDependencies aus deren `lib/`-Ausgabe einbettet, in einem eigenen Schritt nach dem Host-Durchlauf ([Desktop README](../apps/desktop/README.md#bundled-workspace-dependencies)).

Typert läuft nur während des Host-tsdown, angestoßen durch `tsconfig.host.json`. Es analysiert Host-Typen und erzeugt sowohl die Host-Reflexionsartefakte als auch die Host-for-Client-Remote-Projektion; das Client-tsdown startet Typert nicht. Folglich führt `pnpm run typecheck` die vollständige Host-lib-Phase vor dem Client-tsc aus, während `pnpm run build` über das Client-tsdown und den Web-Build weiterläuft.

`pnpm run build` bettet die Version des Root-Pakets, den siebenstelligen Quell-Commit und einen Dirty-Marker ein, wenn Git lokale Änderungen meldet; außerdem erbt es weitere vom Aufrufer gelieferte `DSH_CLIENT_*`-Werte. `pnpm run build:official` ist das plattformübergreifende lokale Äquivalent des CI- und Release-Artefakt-Builds und lässt den lokalen Dirty-Marker weg. Jeder erfolgreiche vollständige Build schreibt einen gitignorierten Datensatz, der die exakten öffentlichen Werte an die Vite-Ausgabe und die dynamischen Client-Bundles bindet; das Release-Packing und die Tests des gebauten Web lehnen einen fehlenden Datensatz oder durch einen späteren partiellen Build veränderte Artefakte ab. `pnpm run dev:web` führt zuerst diesen vollständigen Build aus (`--skip-build` verwendet stattdessen einen bestehenden Artefaktbaum wieder), tastet dann die aktuelle Version und den Git-Zustand einmal ab und teilt diese Umgebung für die Session über alle Watcher-Stufen hinweg; es validiert den Vollständig-Build-Datensatz nicht, weil die Watcher-Stufen seine aufgezeichneten Artefakte neu schreiben.

Statische Analyse und Tests lösen Workspace-Importe über die Basis-`paths`-Map auf `src` auf und müssen auf einem sauberen Baum bestehen; Gates, die gebaute `lib/`-Ausgabe konsumieren, deklarieren diese Abhängigkeit ausdrücklich. Generierte Host-for-Client-Remote-Deklarationen sind die bewusste Ausnahme: Die öffentlichen Befehle `typecheck`, `lint` und `doc-typecheck` erzeugen sie zuerst, während interne `*:contracts-ready`-Skripte davon ausgehen, dass ein aufrufender öffentlicher Befehl oder ein Scheduler-Gate bereits vom Typert-Contract-Generation-Durchlauf oder vom vollständigen Build abhängt. Den Vorbereitungsvertrag der Gates beschreibt die [Typert Remote note](../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.md).

Business-Services deklarieren aufrufbare Methoden auf dem Host mit `@Remote` oder `@RemoteScope`; der Host-Build erzeugt Host-for-Client-Typen und Laufzeit-Beiträge, und die `api-remotes`-Komposition des Clients lädt diese Beiträge unter den Namespaces `ctx.remote` und dem gescopten `agentCtx.remote`. Die generierten Artefakte auf beiden Seiten, ihre Assemblierungsbeziehungen, den SRC-Entwicklungs-Fallback und die Reihenfolge des Web-Builds beschreibt [API Gateway](api-gateway.md).

Wenn eine relevante lokale Prüfung gebaute Paketausgabe konsumiert, zuerst einmal bauen:

```sh
pnpm run build
```

`pnpm run hygiene` enthält `publint`, das Paket-Einstiegspunkte gegen die gebauten `lib/*.js`-Dateien validiert, und `verify-node-next-types`, das gebaute Deklarationen gegen einen temporären NodeNext-Konsumenten validiert. Ein frischer Worktree hat kein gebündeltes JS und keine Deklarationen, bis `pnpm run build` läuft; gewöhnliche Commits und Pushes erfordern diesen Build nicht, sofern ihre ausgewählten Prüfungen ihn nicht konsumieren.

### Umgebungsvariablen

Der echte DeepSeek-Adapter und die schlüsselgestützten Agent-Demos lesen Anmeldedaten aus der Umgebung oder aus einer gitignorierten `.env` im Repo-Root:

```sh
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://... # optional
```

`DEEPSEEK_BASE_URL` ist optional und verwendet standardmäßig die öffentliche API. Niemals echte Anmeldedaten committen. Die echte-API-e2e-Suites überspringen sich selbst, wenn `DEEPSEEK_API_KEY` nicht gesetzt ist.

### Git-Integrationen

`.i18n.yaml`-Datensätze verwenden den Standard-Textmerge von Git. Ein Datensatz kollidiert nur, wenn beide Branches sprachspezifische Inhalte im selben Überschriftenabschnitt geändert haben; das Markdown auflösen und dann `pnpm run verify-translation-pairing --write <pair>` erneut ausführen. Wenn `pre-merge-commit` einen ansonsten sauberen Merge ablehnt, lässt Git das vollständige Ergebnis ohne Commit gestaged; den Fehler beheben und `git commit` ausführen, oder `git merge --abort` ausführen.

lefthook ist in `lefthook.yml` als schneller lokaler Prüfpunkt konfiguriert:

- `pre-commit` verifiziert gestagte Pairing-Datensätze gegen die gestagten Owner-Blobs, validiert gestagte Dateien mit dem projektfreien Profil `.oxlintrc.staged.json` und wendet Oxlint-Fixes mit einem begrenzten Retry an, erzeugt `THIRD_PARTY_NOTICES.md` neu, wenn eine gestagte Datei eine seiner Eingaben ist, prüft den gestagten Diff auf Whitespace-Fehler und führt den Vendor-Manifest-Guard aus.
- `pre-merge-commit` führt dieselbe indexgestützte Pairing-Prüfung aus, bevor Git einen automatischen Merge-Commit erstellt.
- `pre-push` führt `pnpm run typecheck` aus, was die Host-lib-Phase einschließlich der generierten Typert-Contracts vor der TypeScript-Prüfung des Clients abschließt.

Der Vendor-Manifest-Guard prüft, dass Änderungen unter `vendor/*/src` zusammen mit der passenden Aktualisierung des Manifests `vendor/README.md` gestaged sind. Vor dem Bearbeiten von vendored Code `vendor/README.md` lesen.

Abgesehen von der gescopten Prüfung gestagter Datensätze führen die Hooks bewusst keine Tests, Snapshots, Dokumentationsprüfungen, Builds oder Hygiene aus. Beitragende führen die [für das geänderte Verhalten relevanten Prüfungen](../AGENTS.md#run-relevant-checks-locally) einmal aus; die CI besitzt die erschöpfende Abdeckung, Smoketests der gebauten Artefakte und die Kompatibilitätsmatrix für Node 22.19, 24 und 26.

Beitragende können sich mit `pnpm run check:all` für die umfassende lokale Gate-Menge entscheiden. Der Befehl ist unabhängig von den Git-Hooks und keine Agent-Anweisung.

### CI-Gates

Der schlüsselfreie [CI-Workflow](../.github/workflows/ci.yml) gruppiert unabhängige Gates in breite Lanes und führt ein kleineres Kompatibilitätssignal über die unterstützten Node-Versionen aus. Konsumenten von Artefakten warten innerhalb ihrer Lane auf einen Build. Coverage-Partitionen verwenden Dateitimings wieder, die auf ihre Plattform und ihren Runner-Pool zugeschnitten sind, um die Arbeit innerhalb des konfigurierten Worker-Limits auszugleichen. Erforderliche Benchmarks laufen separat auf standardmäßig von GitHub gehostetem Linux; die [Benchmark-Runner-Referenz](../benchmarks/AGENTS.md) besitzt Routing und Job-Timeout. Der separate echte-API-Workflow führt `pnpm run test:e2e` mit seiner konfigurierten Worker-Obergrenze aus. Das aktuelle Inventar an Gates und Jobs findet sich in [scripts/run-gates.ts](../scripts/run-gates.ts) und den Workflow-Dateien.

Die anmeldedatenfreien Probeläufe für das dsh-Abhängigkeitslayout und das dsh/vendor-Pack verwenden den bestehenden selbst gehosteten Linux-Pool nur, wenn `DSH_CI_FAILOVER_LINUX=selfhosted` gesetzt ist und das Ereignis ein vertrauenswürdiger Master-Push oder ein Pull Request aus demselben Repository ist, der kein Fork und kein Dependabot-PR ist. Alle anderen Fälle, einschließlich manueller Dispatch, verwenden `ubuntu-24.04`; die manuelle Veröffentlichung bleibt gehostet. Isolation des persistenten Speichers und Grenzen des Fallbacks beschreibt die [Release-Rehearsal-Runner-Referenz](../.agents/notes/implemented/process/2026-07-26-ci-failover-runbook.md).

### Tägliche Befehle

Die [Beitragenden-Anweisungen](../AGENTS.md#commands) im Root fassen gängige Befehle zusammen, während [`package.json`](../package.json) und [scripts/run-gates.ts](../scripts/run-gates.ts) das aktuelle Inventar an Skripten und Gates besitzen. Die kleinsten Prüfungen auswählen, die die geänderte Oberfläche abdecken. Dokumentationsänderungen verwenden `pnpm run doc-sync`; Änderungen am öffentlichen Verhalten von Paketen aktualisieren zusätzlich die zugehörige README oder JSDoc, und Prüfungen gebauter Artefakte erfordern zuerst `pnpm run build`.

### Profil-Läufe

Den Repository-Build separat ausführen, bevor diese Demos aus dem Quell-Checkout verwendet werden:

```sh
pnpm run build
```

Der einmalig laufende Headless-Coding-Agent benötigt `DEEPSEEK_API_KEY` in der Umgebung oder in der `.env` im Repo-Root:

```sh
pnpm dsh --profile headless "summarize this workspace"
```

Die Demo des PTC-Modus führt dasselbe Headless-Profil mit aktivierter Code-Präsentation aus:

```sh
pnpm run demo:ptc -- "summarize this workspace"
```

### Anwendungsbefehle

Web und Desktop teilen sich ein Befehlspaar. `start:*` startet die Artefakte eines vorangegangenen `pnpm run build`; `dev:*` führt zuerst diesen Build aus und startet dann. Web hält zusätzlich Client-Bundles bei Quelländerungen neu gebaut, weil sein Host aus dem Quellcode läuft, während der Browser gebaute Bundles lädt:

```sh
pnpm run start:web       # serve built Web artifacts through the source launcher (the same launch as pnpm dsh web)
pnpm run dev:web         # build, serve, and rebuild Web client bundles on source edits
pnpm run start:desktop   # launch built Desktop artifacts
pnpm run dev:desktop     # build, then launch Desktop
```

Argumente nach einem Web-Befehl erreichen `dsh web`, zum Beispiel `pnpm run dev:web --no-open --port 3081`; `dev:web` akzeptiert außerdem `--skip-build`, um den bestehenden Artefaktbaum wiederzuverwenden, und `--no-serve`, um nur die Rebuild-Watcher neben einem anderswo gestarteten Server laufen zu lassen. Beide Web-Befehle verwenden das normale Harness-Home, während die Desktop-Befehle das isolierte Entwicklungs-Home verwenden, das in der [Desktop README](../apps/desktop/README.md) beschrieben ist. Das Root-`Makefile` benennt dieselben Befehle als `make web`, `make dev-web`, `make desktop`, `make dev-desktop` und `make build`; `ARGS='--no-open'` leitet Optionen weiter.

### TODO-Marker

Eines von drei Kommentar-Tags verwenden, um bekannte Probleme im Code zu markieren, geordnet nach Dringlichkeit:

- `FIXME` — ein Problem, das ein neues Release blockieren sollte. Ein Release sollte nicht mit einem offenen `FIXME` ausgeliefert werden, es sei denn, Reviewer stimmen ausdrücklich zu, dass die Änderung trotzdem gemergt werden kann.
- `TODO` — ein Problem, das bald behoben werden sollte, sobald die Ressourcen vorhanden sind.
- `XXX` — ein Problem, das vielleicht irgendwann behoben wird; niedrigste Priorität, keine Zusage.

Das Tag wählen, das der Dringlichkeit entspricht, damit jeder, der den Code überfliegt, einen Release-Blocker von einem Vielleicht-Irgendwann unterscheiden kann.

### Typen wörtlich dokumentieren (`ts type-equiv`)

Die Seiten der [subsystems](subsystems/README.md) fügen quelläquivalente Deklarationen zusammen mit ihrem ursprünglichen JSDoc ein, damit ein Leser die exakte Typdefinition und den Quellvertrag sieht. Damit eine Einfügung nicht driftet, wenn sich die Quelle ändert, sie als ` ```ts type-equiv ` (statt ` ```ts `) einzäunen und in `scripts/type-equiv.manifest.json` mit der Quelldatei und dem Symbol registrieren, das sie spiegelt:

```json
{ "doc": "docs/subsystems/session.md", "symbol": "SessionEvent", "source": "packages/core/session/src/types.ts" }
```

`pnpm run verify-type-equiv` (Teil von `doc-sync`) extrahiert dann die Deklaration dieses Symbols und das angehängte JSDoc über den TypeScript-Parser aus der Quelle und stellt fest, dass der Block mit beidem übereinstimmt. Für eine Klasse, deren Implementierungsrümpfe nicht in den Katalog gehören, ` ```ts public-api ` verwenden und `"projection": "public-api"` setzen; die geprüfte Projektion behält die öffentlichen Felder, den Konstruktor, die Accessors, die Methoden und das ursprüngliche Klassen-/Member-JSDoc, lässt aber Rümpfe sowie private und protected Member weg. Der Vergleich ignoriert Whitespace und Nicht-JSDoc-Kommentare, verlangt aber jeden ursprünglichen JSDoc-Kommentar einschließlich der Member-Dokumentation, damit Leser den Quellvertrag neben der exakten Typdefinition sehen. Das Gate erzwingt eine 1:1-Entsprechung nach Dokument, Symbol und Projektion zwischen primären Blöcken und Manifest-Einträgen; ein gepaarter `.zh.md`-Block verwendet den Eintrag seines unsuffigierten Gegenstücks nur wieder, wenn die gesamte verfolgte Fence-Sequenz byte-identisch und in identischer Reihenfolge ist. `doc-typecheck` wendet dieselbe Ableitungsregel auf kompilierbare Fences an und überspringt dabei beide Arten von Quelläquivalenz-Fences von der Kompilierung und von seiner Opt-out-Quote. Wenn eine dokumentierte Deklaration oder ihr JSDoc geändert wird, schlägt das Gate fehl, bis die Einfügung aktualisiert ist; wenn ein primärer Block hinzugefügt oder entfernt wird, das Manifest in derselben Änderung aktualisieren.
