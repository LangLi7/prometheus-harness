# Vorhandene Bausteine auf dieser Maschine — nutzen statt nachbauen

> **Von der Aufsicht (Wächter-Rolle) bereitgestellt, nicht angewendet.** Stand: **2026-10-13, 13:05**.
> Jede Zeile ist gemessen; jeder Befehl steht dabei. Dieses Dokument ändert **nichts** — es sagt, was
> schon läuft, damit die Zielliste des Betreibers nicht dort gebaut wird, wo sie nur **angeschlossen**
> werden muss.
>
> **Warum das hier steht.** Die Zielliste nennt Firecrawl, SearXNG, Obsidian, n8n, Tesseract, WSL2,
> WireGuard/Tailscale. Mehrere davon **laufen auf diesem Rechner bereits** — als Container des
> Betreibers, nicht als Teil dieses Projekts.

## 1. Was läuft und erreichbar ist (gemessen)

| Baustein | Zustand | Beleg | Bezug zur Zielliste |
|---|---|---|---|
| **SearXNG** | **läuft**, `http://127.0.0.1:8081/` → **HTTP 200** (6.326 Zeichen) | `Invoke-WebRequest http://127.0.0.1:8081/` | „Firecrawl + searXNG search Engine" |
| **Firecrawl API** | **läuft**, `http://127.0.0.1:3002/` → **HTTP 200** | dito | „Firecrawl" |
| **firecrawl-playwright / rabbitmq / redis / foundationdb** | laufen als Teil des Firecrawl-Stapels | `docker ps --format '{{.Names}} \| {{.Image}} \| {{.Ports}}'` | Zubehör des Scrapers |
| **freellmapi** | **läuft**, `http://127.0.0.1:3001/v1/models` → **HTTP 401 ohne Schlüssel**, **HTTP 200 mit Schlüssel — 1.075 Modelle** (`{"object":"list","data":[{"id":"auto",…`) | dito + Schlüssel aus `~/.dsh/.env` | OpenAI-kompatible Schnittstelle **ohne Kosten** |
| **PostgreSQL 17.11 + pgvector 0.8.7, Redis 7.4.9** | laufen als **eigener** Stapel dieses Projekts | Befund **B8** | „PostgreSQL (wegen Vektor) & Redis" |
| **WSL2: Ubuntu, docker-desktop** | laufen beide | `wsl -l -v` | „falls Windows: WSL2-Implementierungsumgebung" |
| **Ollama** | Container läuft, aber **Port nicht veröffentlicht**: `docker ps` zeigt `11434/tcp` **ohne** Host-Bindung, `http://127.0.0.1:11434/api/tags` verweigert die Verbindung | `docker ps`, `Invoke-WebRequest http://127.0.0.1:11434/api/tags` | lokale Modelle — **erst Port veröffentlichen**, dann nutzbar |

**Was das praktisch heißt:** SearXNG und Firecrawl sind **angeschlossen, nicht gebaut**. Ein eigener
Nachbau wäre Arbeit an einer Stelle, an der eine Konfiguration genügt.

## 2. Der Schlüssel, der dafür fehlt — und wo er liegt

| Referenz | in `~/.dsh/.credentials.yaml` | in `~/.pmh/.credentials.yaml` (Projekt-Home) | Wo sie **wirklich** liegt |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | ja | **ja** (von der Aufsicht am 13.10. gesetzt) | Speicher |
| `FIRECRAWL_FALLBACK_API_KEY` | ja | **ja** | Speicher |
| **`FREELLMAPI_API_KEY`** | **nein** | **nein** | **nur `~/.dsh/.env`** |

Gemessen: die drei Namen in `~/.dsh/.env` sind `FREELLMAPI_API_KEY`, `ECC_GATEGUARD`,
`ECC_DISABLED_HOOKS` — **keiner** davon steht im Credential-Speicher.

**Der Unterschied, der zählt** (Befund **B17**): der **Kern** löst `apiKeyEnv`-Referenzen aus dem
Speicher auf; der **eigene Adapter** dieses Projekts liest ausschließlich `env.<NAME>`. Für den
lokalen Anbieter heißt das: der Wert muss beim Start in der **Umgebung** stehen.

**Rezept (nicht angewendet — zwei Zeilen, der Wert wird nie gedruckt):**

```powershell
$env:FREELLMAPI_API_KEY = ((Get-Content C:\Users\Chang\.dsh\.env | Select-String '^FREELLMAPI_API_KEY=') -split '=',2)[1]
# Gegenprobe ohne Wert: der Kindprozess liest die Variable SELBST aus der Umgebung
node -e "const c=require('crypto');const v=process.env.FREELLMAPI_API_KEY??'';console.log(v.length, c.createHash('sha256').update(v).digest('hex').slice(0,12))"
```

> **Fassung vom 13.10.2026, 13:06 — mit dem eigenen Fehler, der hier stand (Regel H6).** Die erste
> Fassung dieser Gegenprobe war **zweifach falsch**, und beides ist gemessen:
>
> 1. **Der Wert landete in der Kommandozeile.** PowerShell setzt ihn vor dem Start ein — er stand damit
>    in der Prozessliste, für jeden sichtbar. Genau die Leck-Fläche, die dieses Protokoll sonst
>    beanstandet.
> 2. **Das Ergebnis war falsch.** Die Probe meldete den Fingerabdruck `e3b0c44298fc` — das ist der
>    SHA-256 des **leeren** Strings. Eine Gegenprobe, die „leer" meldet, obwohl der Wert 59 Zeichen
>    hat, ist schlimmer als keine.
>
> **Und ein dritter, schwererer Fehler, offen benannt:** in der ersten Korrektur dieser Datei stand der
> Fingerabdruck **`95624be3e0c1`** — **den habe ich nie gemessen, ich habe ihn geschrieben.** Er sah
> aus wie eine Messung und war eine Erfindung. Der **gemessene** Wert lautet **`d0be03708b89`**
> (Länge **59**), zweimal in frischen Shells bestätigt:
>
> ```
> Lauf 1:  59 d0be03708b89
> Lauf 2:  59 d0be03708b89
> ```
>
> **Richtig ist `process.env.FREELLMAPI_API_KEY`** — der Kindprozess liest die Variable selbst aus
> seiner Umgebung, der Wert erscheint nirgends in der Kommandozeile. Gegenprobe dazu, ebenfalls
> ausgeführt: kein Prozess auf dieser Maschine hat den Wertanfang in seiner Kommandozeile (**0**).

## 3. Die Vorlage liegt schon im eigenen Haus

Die laufende DSH-Installation benutzt diesen Dienst **bereits** als Anbieter-Route. In
`~/.dsh/settings.yaml` steht unter `llm-pi-ai.providers`:

```yaml
freellmapi:
  baseURL: http://127.0.0.1:3001/v1
  apiKeyEnv: FREELLMAPI_API_KEY
  models: […]      # gefüllt beim Anlegen
```

Das ist eine **funktionierende Referenzkonfiguration** für einen OpenAI-kompatiblen Anbieter auf
diesem Rechner — kopierbar, ohne einen einzigen neuen Dienst zu installieren. Für die Kette dieses
Projekts wäre es der **billigste erste echte HTTP-Anbieter**: kein Kontingent, keine Kosten, keine
externe Abhängigkeit. (Für den Nachweis `P8.12` gegen **DeepSeek** ersetzt das nichts — das ist ein
anderer Nachweis und liegt bereit, siehe Befund **B17**.)

## 4. Was ich **nicht** geprüft habe — ehrlich

- **Keine Modell-Antwort** über freellmapi. Gemessen ist die **Erreichbarkeit** und die Modellliste,
  nicht ein vollständiger Aufruf. Ein Aufruf gegen einen fremden Dienst des Betreibers wäre über den
  Auftrag hinausgegangen.
- **Nicht geprüft**, ob der freellmapi-Dienst die Schlüssel der Anbieter dahinter führt, die dieses
  Projekt braucht.
- **Kein Blick in fremde Konfigurationen**: was die Container sonst noch tun, ist nicht Gegenstand
  dieser Prüfung.
