---
title: "api-anything — jede Website als API für den Agenten"
stand: 2026-10-31
tags:
  - pmh/subsystem
  - pmh/mcp
  - pmh/skills
---

# api-anything — jede Website als API für den Agenten

## Kurzfassung

`api-anything` (`goodnight000/api-anything`, MIT, <https://github.com/goodnight000/api-anything>)
lernt aus den eigenen Requests einer Website eine Operation: ein kopfloser Browser
lädt die Seite einmal pro Beispielwert, was sich mit dem Wert ändert, wird zum
Parameter, der Rest bleibt byteweise stehen. Ein Aufruf geht danach als **ein**
HTTP-Request über `fetch`, ohne Browser und ohne Modell. Driftet die Seite,
repariert der Lauf die Operation; ein geteilter Katalog verteilt gelernte
Leseoperationen.

Im Harness läuft es als **MCP-Server** in den Profilen `web` (Oberfläche) und
`pmh` (Terminal); die mitgelieferte Fähigkeit (`SKILL.md`) liegt im Repo. Eigenen
Code gibt es dafür nicht — der vorhandene Weg (`@deepseek-ai/dsh-mcp-client` plus
`pmh mcp add`) trägt.

## Warum MCP und kein eigenes Tool-Paket

- **Der Weg ist schon da.** `docs/subsystems/plugin-marketplace.md` §6 beschreibt
  genau diesen Eintrag; `pmh mcp add` schreibt ihn.
- **Die Werkzeuge sind schon fertig.** `find_sites`, `list_operations`,
  `call_operation`, `learn_site`, `login`, `get_job`, `list_sites` — ein Paket
  unter `packages/web` hätte dieselben Aufrufe nachgebaut.
- **Schreiben bleibt aus.** Ohne `--allow-writes` gibt es `call_write_operation`
  gar nicht; `call_operation` sendet nur Lesen. Das ist die engere Schnittmenge.

## Was installiert ist

| Bestandteil | Ort | Fassung |
|---|---|---|
| npm-Paket | `%APPDATA%\npm\node_modules\api-anything` | **0.3.1** (gepinnt) |
| MCP-Eintrag | `.pmh-build/harness-home/profiles/web/cordis.patch.yml` und `…/profiles/pmh/cordis.patch.yml` | `pmh-mcp-api-anything` |
| Fähigkeit | [`.agents/skills/api-anything/SKILL.md`](../../.agents/skills/api-anything/SKILL.md) | Quelle `goodnight000/api-anything` |

Der npm-Präfix `C:\Users\Chang\AppData\Roaming\npm` steht im **Maschinen-PATH**;
damit findet der Host den Befehl ohne weiteren Eintrag. Das npm-Paket hängt am
Benutzer, der Eintrag an diesem Harness-Home, die Fähigkeit am Projekt.

## Installation

```powershell
npm install -g api-anything@0.3.1
pmh mcp add api-anything --optional -- api-anything mcp
pmh mcp add api-anything --optional --profile web -- api-anything mcp
pmh skill install goodnight000/api-anything
```

Die Fassung ist gepinnt; ein `npm install -g api-anything` ohne Nummer würde beim
nächsten Lauf eine andere Fassung ziehen. Der Skill-Install braucht einen
beschreibbaren `TEMP`-Ordner (hier `.tmp/pmh-temp`), sonst bricht er mit `EPERM`
ab.

## Der Eintrag

```yaml
- id: pmh-mcp-api-anything
  name: "@deepseek-ai/dsh-mcp-client"
  config:
    transport: stdio
    serverName: api-anything
    command: api-anything
    args: [mcp]
    failOnStartupError: false
```

Eingetragen in beide Profile mit `pmh mcp add api-anything --optional -- api-anything mcp`
(Profil `pmh`) und demselben Befehl plus `--profile web` (Profil `web`). Der Befehl
ersetzt denselben `serverName`, statt ihn zu verdoppeln.

- **`command: api-anything`, nicht `npx -y …`.** Das Paket ist global installiert
  und liegt im Maschinen-PATH; `npx` würde bei jedem Host-Start erneut auflösen.
- **`failOnStartupError: false`.** Wie die übrigen optionalen Server: fehlt das
  Paket auf einem anderen Rechner, startet der Host trotzdem.
- **Kein `--allow-writes`.** Schreiben ist bewusst nicht freigeschaltet. Wer es
  braucht, startet einen zweiten Eintrag mit eigenem `serverName` und
  `args: [mcp, --allow-writes]` — dann erst existiert `call_write_operation`.

## Werkzeuge

| Werkzeug | Aufgabe |
|---|---|
| `find_sites` | Katalog und lokalen Bestand nach Bedarf, Domain oder URL durchsuchen |
| `list_sites` | Sites auf dieser Maschine samt Zahl ihrer Operationen |
| `list_operations` | Operationen einer Site mit JSON-Schema der Argumente und den Notizen der Site |
| `call_operation` | eine Leseoperation aufrufen |
| `learn_site` | eine noch fehlende Leseoperation aus Seiten-URL und drei Werten lernen und beantworten |
| `login` | Sitzung aus einem Browserprofil erneuern oder ein Anmeldefenster öffnen |
| `get_job` | Ergebnis eines Aufrufs, der nach etwa 25 s noch lief |

Jede Antwort ist JSON-Text und bei Objekten zusätzlich `structuredContent`. Die
Felder `class`, `reason`, `next`, `retry`, `write` sagen, was geschah und was als
Nächstes zu tun ist.

## Benutzen

Über MCP, ohne Shell:

```text
find_sites { "query": "book ratings" }
list_operations { "site": "goodreads" }
call_operation { "site": "goodreads", "op": "searchBooks", "args": { "q": "piranesi" } }
```

Über die CLI (eine Zeile JSON pro Aufruf):

```powershell
api-anything.cmd sites
api-anything.cmd ops goodreads
api-anything.cmd call goodreads searchBooks q=piranesi
```

In PowerShell löst `api-anything` auf `api-anything.ps1` auf; die
Ausführungsrichtlinie dieses Rechners verbietet Skripte, deshalb **`.cmd`**. Der
Host startet über Bun und löst `api-anything` ohne Endung auf — dort funktioniert
der nackte Name, ein explizites `.cmd` scheitert mit `EINVAL`.

## Nachprüfung (gemessen am 31.10.2026)

| Prüfung | Ergebnis |
|---|---|
| `api-anything.cmd --version` | `0.3.1` |
| MCP-Handshake (stdio, `initialize` + `tools/list`) | `serverInfo` 0.3.1, Protokoll `2024-11-05`, **7 Werkzeuge** |
| `api-anything.cmd call hacker-news search query=sqlite` | `ok: true`, `class: ok`, **`tier: 1`**, 263 ms, Trefferliste |
| `api-anything.cmd sites` | gebündelte Sites samt Operationen und Beschreibungen |
| MCP-Client im Host | verbunden; `mcp__api-anything__*` in der Sitzung, **7 Werkzeuge** |
| `call_operation goodreads searchBooks q=piranesi` | `ok: true`, **`tier: 1`**, 532 ms, `data` als `{columns, rows}` |

Der Handshake lief über `spawn('api-anything', ['mcp'])` unter Bun — derselbe Weg,
den der MCP-Client nimmt. Der **laufende Host** hat den Patch übernommen, ohne
neu zu starten: die Werkzeuge standen in derselben Sitzung bereit. Ein Host, der
seine Patch-Schicht nicht neu liest, braucht dafür einen Neustart.

## Grenzen

- **Nur Lesen.** Schreiboperationen brauchen einen Server mit `--allow-writes`;
  dieser Eintrag hat ihn nicht.
- **Lernen braucht Chromium.** Aufrufe geteilter Operationen nicht; ohne Browser
  läuft `tier 1` weiter.
- **Katalog teilt.** Beim ersten Lernen fragt der Client einmal, ob geteilte
  Leseoperationen hochgehen dürfen. Abschalten:
  `api-anything setup --no-share --share-only`.
- **Sitzungen liegen lokal** unter `~/.api-anything`; `login` importiert Cookies
  aus dem Alltagsbrowser. Unter Windows öffnet `login` ein Fenster, es liest
  keine Cookies.
- **Nur Gelerntes.** Die Abdeckung ist die Liste der Operationen, nicht die ganze
  Site; nummerierte Seiten bekommen keinen Cursor-Hinweis.
- **Überlappung mit `reverse-api`.** Jene Fähigkeit zerlegt Artefakte und Verkehr
  und baut einen typisierten Client; `api-anything` lernt zur Laufzeit aus dem
  Browser und teilt das Ergebnis.

## Was bewusst nicht gebaut wurde

- **Kein Paket unter `packages/`.** Der MCP-Client ist die vorgesehene
  Anschlussstelle; ein Wrapper wäre eine zweite Wahrheit über dieselben Aufrufe.
- **Keine Änderung an `pmh mcp add`.** Der Befehl trug unverändert, einschließlich
  YAML-Rundreise und Idempotenz.
- **Keine Fähigkeit im Benutzer-Scope.** `pmh skill install … --global` scheitert
  in dieser Umgebung an der Sandbox-ACL (`EPERM` bei `mkdtemp` und `mkdir`); der
  Projekt-Scope schreibt ins Repo und ist im Diff prüfbar. Der Preis: die
  Fähigkeit gilt nur in diesem Projekt.

## Offen

- **Schreiben bleibt zu.** Wer es braucht, legt einen zweiten Eintrag mit
  `--allow-writes` an; die Freigabe ist eine eigene Entscheidung, kein Schalter.
- Der Katalog ist jung; eine Operation, die anderswo lief, kann hier an Region
  oder Netzsperre scheitern. `class: blocked` sagt das, kein stiller Fehler.
- `pmh skill install … --global` bleibt an der Sandbox-ACL hängen. Der
  Projekt-Scope ist der Ausweg, nicht die Lösung des ACL-Problems.
