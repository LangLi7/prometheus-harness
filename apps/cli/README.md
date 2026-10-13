# apps/cli — der Anwendungs-Einstieg (Host)

> **Was diese Datei ist:** Zweck, Start, Grenzen und die **gemessenen** Befunde dieses Hosts.
> Die Entscheidung dahinter steht in
> [`docs/decisions/core-supply.md`](../../docs/decisions/core-supply.md) (Weg B — Hybrid) und
> [`docs/decisions/hybrid-then-self-build.md`](../../docs/decisions/hybrid-then-self-build.md).

## Wozu

Der eigene Einstieg, der den Agent-Core startet und die Oberfläche ausliefert. Er liegt an der
Stelle, die `MAPPING.md` §3.5 für den Host vorsieht: **`apps/cli`**. Bis zum 13.10.2026 lagen
hier **220 byte-identische Dateien** der Vorlage mit **129 unauflösbaren
`workspace:*`-Verweisen** — sie haben jedes `bun install` und damit jeden Typecheck blockiert
(Auflage **A1** in `docs/review/backend-review.md`). Sie wurden entfernt; dieser Host tritt an
ihre Stelle.

Er ist **keine Kopie**: er benutzt den Core als **Abhängigkeit** auf der gepinnten Version
`0.2.1-alpha.2` und ruft nur dessen dokumentierte Boot-Schnittstelle auf.

Umfang: `src/main.ts`. Was fehlt, steht unten unter „Grenzen" — ehrlich und vollständig,
nicht beschönigt.

## Start

```powershell
$env:PMH_HOME = 'C:\Users\Chang\.pmh'      # Home der eigenen Installation
bun run apps/cli/src/main.ts web --port 5199 --no-open
```

Der Core meldet beim Start seine Adresse **mit Token**:

```
dsh web: http://127.0.0.1:5199/?token=<token>
```

**Der Token ist Pflicht.** `GET /` ohne Token antwortet mit **401** — gemessen. Der Nachweis
lautet also `GET /?token=<token>` → **200**. Das ist Upstream-Verhalten (eine
Browser-Trust-Schranke), keine Eigenheit dieses Hosts.

Nachweis vom 12.10.2026 auf diesem Rechner:

| Prüfung | Ergebnis |
|---|---|
| `bun install` (Wurzel) | **exit 0**, 330 + 136 Pakete |
| Host bootet | `pmh: Core läuft (Profil "pmh", Loader aktiv)` |
| Port | `127.0.0.1:5199` ABHÖREND (pid nachgewiesen) |
| `GET /?token=…` | **200**, `text/html; charset=utf-8`, 3.845 B |
| `GET /` ohne Token | 401 (Upstream-Schranke) |

## Was der Host tut — vier Schritte

| # | Schritt | Aufruf |
|---|---|---|
| 1 | Profil sicherstellen (`<PMH_HOME>/profiles/pmh`) | `resolveProfileDir` + `initProfile` |
| 2 | leere Wurzelkonfiguration schreiben | `cordis.yml` = `[]` |
| 3 | Profil laden (Bündel-Schichten + eigene Patch-Schicht) | `loadProfile` + `readProfilePatches` |
| 4 | Baum booten | `boot()` mit `profileContext` und App-Argumenten |

Die Komposition des Baumes entsteht **ausschließlich aus Patch-Schichten**. Die Wurzel wird bei
jedem Start neu geschrieben, weil sie nur als Anker für `baseUrl` existiert — schreibt der
Loader einen komponierten Baum zurück, würde sonst jedes Bündel-Insert beim nächsten Start
verdoppelt.

**Die Argument-Trennung ist nicht kosmetisch.** Der Host kennt genau **ein** eigenes Token: den
Profilnamen als Unterkommando. Alles danach gehört der App (`--port`, `--no-open`). Reicht man
das Unterkommando mit durch, liest `commander` es als positionales Argument und bricht mit
`too many arguments. Expected 0 arguments but got 1: web` ab — der Webserver startet dann nie.
Das war der zweite gemessene Fehler beim Bau dieses Hosts.

## Grenzen — was dieser Host nicht kann

| # | Grenze | Warum / Beleg |
|---|---|---|
| **H1** | **`PluginPackages` wird nicht eingehängt.** | Dieses Upstream-Plugin installiert profil-deklarierte Pakete und hängt dafür einen Laufzeit-Interzeptor ein, der das native Addon `node-addon-require-builtin` braucht. **Unter Bun nicht ladbar** — gemessen: `Unsupported/no-context`, `has_v8_context: false`, Bun 1.4.0. Folge: profil-deklarierte Pakete werden nicht automatisch installiert; die Bündel dieses Hosts stehen als gewöhnliche Abhängigkeiten in `package.json`. **Das ist ein eigener Befund gegen die Annahme „Bun führt den Core unverändert aus"** und gehört in die Risikoliste. |
| **H2** | Keine Plugin-Verwaltung, kein Konfigurations-Dump, kein `--patch`. | Der Upstream-CLI kann das; dieser Host braucht es noch nicht. Bei Bedarf als eigenes Arbeitspaket, nicht durch Hineinwachsen. |
| **H3** | HMR ist inaktiv. | `hmr: --expose-internals is required for HMR service`. Ein Bun-Host startet nicht mit diesem Node-Flag. Kein Verlust für den Betrieb, aber `client-hmr` bleibt ohne Wirkung. |
| **H4** | `ptc-runtime-node` importiert nicht. | Wird als nicht-aktivierter Eintrag gemeldet (Warnung, kein Abbruch). Ursache nicht eingegrenzt. |
| **H5** | Profil wird nur angelegt, wenn es fehlt. | Ein vorhandenes Profil wird **nie** überschrieben. Wer sein Profil auf die Web-Vorlage heben will, löscht `<PMH_HOME>/profiles/pmh` und startet neu. |
| **H6** | Kein Typecheck-Nachweis in dieser Sitzung. | `tsgo` (`@typescript/native-preview`) war zum Zeitpunkt des Baus nicht auflösbar; der `typecheck`-Skripteintrag ist gesetzt, der Lauf steht aus. **Nicht als bestanden behauptet.** |

## Was der Host braucht — und warum diese Liste so aussieht

Der Host deklariert seine Core-Pakete **explizit**, nicht transitiv. Gemessener Grund: das
Profil listet die Bündel `@deepseek-ai/dsh-base` und `@deepseek-ai/dsh-web-app`, aber **keines
der beiden Pakete hängt das andere als Abhängigkeit ein**. Ohne den ausdrücklichen Eintrag
fehlt das Basis-Bündel im `node_modules` und der Start scheitert mit
`startup failed: 1 required plugin did not activate` — der `credentials`-Dienst fehlt, und der
`connection`-Eintrag wartet darauf. Dieselbe Ursache bei `@deepseek-ai/dsh-credentials-local`:
der Dienst `credentials` wird als Paket geliefert, aber von keiner Bündel-Schicht
mitgebracht.

| Abhängigkeit | Warum |
|---|---|
| `@deepseek-ai/dsh-base` | Basis-Bündel — liefert die Kern-Einträge (u. a. die `credentials`-Zeile) |
| `@deepseek-ai/dsh-web-app` | Web-Bündel — Webserver, `web-runtime`, Verbindung, Oberfläche |
| `@deepseek-ai/dsh-credentials-local` | stellt den Dienst `credentials` bereit, auf den `connection` (required) wartet |
| `@deepseek-ai/dsh-app-boot`, `-home-paths` | die Boot- und Home-Schnittstellen, die dieser Host aufruft |
| `@deepseek-ai/cordis*`, `cosmokit`, `schemastery` | die Plugin-Laufzeit; Versionen wie vom Upstream verlangt (`~4.0.5-alpha.1` usw.), nicht frei gewählt |

Die Versionen sind **gepinnt**, nicht „latest": der Core ist die Vorlage, gegen die gemessen
wurde (`d743267388` = DSH 0.2.1-alpha.2, siehe `core-supply.md`).
