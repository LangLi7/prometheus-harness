# Figma MCP in Prometheus — ohne einen Schlüssel im Harness

**Stand:** 18.10.2026 · **Gilt für:** DSH-Profil `web` (`C:\Users\Chang\.dsh\profiles\web`)

## 1. Die kurze Antwort

Für **Design-Kontext und Variablen** (lesen) brauchst du **keinen Figma-Token in Prometheus**. Nimm den
**Figma-Desktop-MCP-Server**: Er läuft lokal unter `http://127.0.0.1:3845/mcp`, die Anmeldung liegt in
der Figma-Desktop-App, und Prometheus bekommt nur eine lokale Adresse. Kein PAT, kein OAuth-Token, kein
Geheimnis in `cordis.patch.yml`, `.env` oder im Browser.

Für **Schreiben auf die Figma-Canvas** gilt: Der offizielle Remote-Server
(`https://mcp.figma.com/mcp`) authentifiziert per **OAuth** im Client. Der DSH-MCP-Client kennt nur
**statische Header** und keinen OAuth-Fluss. Ein PAT in den Header zu schreiben ist deshalb weder
vorgesehen noch sicher. Schreibe lieber in einem dafür unterstützten Client (Claude Code, Codex,
Cursor, VS Code) — oder nutze den Desktop-Server, der nur liest.

## 2. Die drei Wege, nach Risiko

| Weg | Token im Harness? | Risiko | Wofür |
|---|---|---|---|
| **Figma-Desktop-Server** `127.0.0.1:3845/mcp` | **nein** | niedrig | Design-Kontext, Screenshots, Variablen, Code Connect — **nur lesen** |
| Lokaler Token-Server (`figma-developer-mcp`, PAT) | **ja**, im Kindprozess | mittel | Design-Kontext ohne Figma-Desktop; der Harness kann den Schlüssel benutzen |
| Offizieller Remote-Server `mcp.figma.com/mcp` | OAuth, kein statischer PAT | niedrig, aber **im DSH-Client nicht unterstützt** | Schreiben auf die Canvas; in einem unterstützten Client |

**Der entscheidende Punkt:** Das Risiko ist nicht nur „die Datei könnte gelesen werden", sondern **der
Agent kann mit dem Schlüssel alles tun, was das Figma-Konto darf**. Ein PAT im Harness ist per
Definition ein Schlüssel, den der Harness benutzt. Wenn du ihn nicht im Harness haben willst, nimm den
Desktop-Server.

## 3. Desktop-Server einrichten (empfohlen)

### In Figma

1. Figma-Desktop-App öffnen und aktualisieren.
2. Eine Design-Datei öffnen, **nichts** auswählen, mit **Shift+D** in den Dev Mode.
3. Rechts in der Seitenleiste **MCP server → Enable desktop MCP server**.
4. Der Server läuft unter `http://127.0.0.1:3845/mcp`.

### In DSH

Am **Ende** von `C:\Users\Chang\.dsh\profiles\web\cordis.patch.yml` — **außerhalb** der
`# >>> dsh-stack`-Blöcke, damit ein späteres `install` es nicht überschreibt:

```yaml
- insert:
    - id: mcp-figma-desktop
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: streamable-http
        serverName: figma-desktop
        url: http://127.0.0.1:3845/mcp
        headers: {}
        toolCallTimeoutMs: 120000
```

Dann **DSH neu starten** (das Profil wird beim Start gelesen). In der Sitzung erscheinen die Tools als
`mcp__figma-desktop__…`:

- `get_metadata` — Datei/Frame-Struktur
- `get_design_context` — Layout, Farben, Typografie, Abstände
- `get_screenshot` — Bild des Frames
- `get_variable_defs` — **Figma-Variablen** (Design-Tokens)
- `get_code_connect_map` — Komponenten-Zuordnung

**Prüfen:** Figma-Frame auswählen → „Copy link to selection" → im Chat:

> Use the figma-use skill: call `get_variable_defs` for this frame and map the variables to CSS custom
> properties. Do not change any files yet.

## 4. Wenn du wirklich einen PAT brauchst

Nur für den lokalen `figma-developer-mcp`-Server, **nicht** für den Remote-Endpunkt. Dann:

### 4.1 Ein eigenes Figma-Konto, nicht dein Hauptkonto

Ein Figma-PAT gilt für das **ganze Konto**. Lege ein separates Konto an (z. B. `prometheus-figma`),
lade es nur zu den Dateien/Projekten ein, die der Agent sehen soll, und erzeuge dort den PAT. Dann ist
ein kompromittierter Token auf diese Dateien begrenzt — nicht auf dein ganzes Figma.

### 4.2 Token in Postgres, nicht in einer Datei

Der Figma-PAT gehört in **`user_secrets`** — dieselbe Tabelle und dieselbe Umschlagverschlüsselung wie
die Modell-Schlüssel. Der Wert kommt über **STDIN**, nicht als Argument (Argumente stehen in der
Prozeßliste):

```powershell
bun scripts/secret.mjs set FIGMA_API_TOKEN --benutzer <deine@adresse>
# Token einfügen, Enter, dann Strg+Z und Enter (Windows) bzw. Strg+D (POSIX)
bun scripts/secret.mjs liste --benutzer <deine@adresse>
```

`liste` zeigt nur `ref`, Fassung, Hinweis und Zeitpunkt — **keinen Klartext und keinen Geheimtext**.
`pruefe FIGMA_API_TOKEN --benutzer …` bestätigt, daß sich der Wert öffnen läßt; ohne `--zeigen` wird er
nicht ausgegeben.

Das ist kein Widerspruch zu „keine `.env` mehr": Die **Nutzer-Geheimnisse** liegen in Postgres. Der
**Hauptschlüssel** (`PMH_MASTER_KEY`) und `DATABASE_URL` bleiben außerhalb — läge der Hauptschlüssel in
derselben Datenbank, wäre die Verschlüsselung wirkungslos. Das ist die zwei-Ebenen-Regel aus
`docs/status/geheimnisse-ablage.md`.

### 4.3 Der Launcher liest aus Postgres

`scripts/figma-mcp.mjs` startet den MCP-Server und holt den Schlüssel vorher aus `user_secrets`:

```text
bun scripts/figma-mcp.mjs --benutzer <deine@adresse>
```

Der Launcher entschlüsselt mit `ladeGeheimnis`, setzt `FIGMA_API_KEY` **nur** in die Umgebung des
Kindprozesses und schreibt **nichts auf stdout** — stdout gehört dem JSON-RPC. Ohne `--benutzer` nimmt
er das einzige Administratorkonto; bei mehreren bricht er ab, statt zu raten.

**Der Kindprozess bekommt eine Whitelist, nicht `...process.env`.** `figma-developer-mcp` ist
Fremdcode; mit der vollen Umgebung sähe er `DATABASE_URL` und `PMH_MASTER_KEY` und könnte
`user_secrets` entschlüsseln. Er erbt nur `PATH`/`TEMP`/`APPDATA` und die Proxy-Variablen — plus
seinen eigenen `FIGMA_API_KEY`.

Profil-Eintrag:

```yaml
- insert:
    - id: mcp-figma-local
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: figma-local
        command: bun
        args:
          - 'C:/Users/Chang/prometheus-harness/scripts/figma-mcp.mjs'
          - '--benutzer'
          - '<deine@adresse>'
        env: {}
        toolCallTimeoutMs: 120000
```

Damit steht der Figma-Token **weder in der YAML noch in einer Datei noch in `.env`** — nur
verschlüsselt in Postgres und zur Laufzeit im Speicher des Launchers und des MCP-Kindes.

### 4.4 Getrenntes DSH-Profil

Starte diesen Server **nicht** im normalen `web`-Profil, in dem auch Shell, Dateisystem und die
Prometheus-Werkzeuge liegen. Ein Figma-Dokument ist **untrusted input**; eine Anweisung im Dokument
kann den Agenten zu Shell-Befehlen verleiten. Ein eigenes Profil (z. B. `dsh --profile figma`) mit
**nur** dem Figma-MCP und ohne Shell verkleinert den Schaden.

Zusätzlich: Schreib-Tools abschalten, wenn du nur lesen willst; Berechtigungsabfragen (Approvals)
anlassen; den PAT nach der Arbeit widerrufen und den Eintrag `FIGMA_API_TOKEN` löschen.

## 5. Remote-Server: warum nicht einfach PAT in den Header?

Der Remote-Server erwartet den **OAuth-Fluss** des Clients. Ein statischer PAT im `Authorization`-
Header ist kein Ersatz: Er läuft ab, hat andere Berechtigungen, und der DSH-Client hat keinen
Refresh-Fluss. Der offizielle Weg für Canvas-Schreiben ist ein unterstützter Client (Claude Code,
Codex, Cursor, VS Code); für Prometheus bleibt der Desktop-Server (lesen) oder ein lokaler
Token-Server (bewusst mit Risiko).

## 6. Wenn „Tokens" Figma-Variablen meint

Dann brauchst du **gar keinen Auth-Token**. Die Desktop-MCP-Tools liefern die Variablen:

```text
Use figma-use: get_variable_defs for <Figma-Link>.
Map the returned variables to CSS custom properties in apps/universe/src/app.css.
Do not edit files until I confirm.
```

Die Werte gehören dann in `docs/design/world-design-tokens.json` bzw. in die `--`-Tokens von
`app.css` — nicht in den MCP-Client. Der `figma-use`-Skill ist installiert.

## 7. Prüfliste

- [ ] Figma-Desktop-Server in Dev Mode aktiviert
- [ ] `cordis.patch.yml`-Eintrag **außerhalb** der Managed-Blöcke
- [ ] DSH neu gestartet
- [ ] `mcp__figma-desktop__get_metadata` erscheint
- [ ] Kein `FIGMA_API_KEY`/PAT in `.env`, `cordis.patch.yml`, `apps/universe` oder im Chat
- [ ] Falls PAT: eigenes Konto, `FIGMA_API_TOKEN` in `user_secrets` (`scripts/secret.mjs`), Launcher `scripts/figma-mcp.mjs`, getrenntes Profil
- [ ] Nach der Arbeit: Figma-Desktop-Server aus oder PAT widerrufen und `FIGMA_API_TOKEN` löschen

## 8. Der automatisierte Weg (seit 26.10.2026)

Statt den YAML-Block von Hand zu schreiben, trägt `pmh` ihn ein:

```bash
pmh mcp add figma-desktop --url http://127.0.0.1:3845/mcp --optional
pmh mcp list
```

`--optional` setzt `failOnStartupError: false`: der Host startet auch dann, wenn
die Figma-Desktop-App gerade nicht läuft. Der Eintrag ist idempotent — ein
zweiter Aufruf ersetzt die Konfiguration, statt sie zu verdoppeln. Die Datei wird
als YAML-Dokument bearbeitet; Kommentare bleiben stehen.

**Was weiterhin fehlt.** Der Scanner kann den Server nur eintragen, nicht
starten. Ob `http://127.0.0.1:3845/mcp` erreichbar ist, hängt an der
Figma-Desktop-App — am 26.10.2026 war der Port geschlossen, weil die App nicht
lief. Nach dem Aktivieren in Figma genügt ein Neustart des Hosts.

