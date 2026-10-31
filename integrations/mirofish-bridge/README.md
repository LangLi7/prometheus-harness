# MiroFish-Brücke zu Prometheus

MiroFish spricht ausschließlich das Wire-Format des OpenAI-SDK. Prometheus Harness
stellt keinen Modellserver bereit, sondern hält Anbieter-Zugänge und spricht selbst
mit OpenRouter. Diese Brücke schließt die Lücke: MiroFish ruft
`/v1/chat/completions` auf der Brücke auf, die Brücke authentifiziert den Aufrufer
und reicht die Anfrage mit dem Zugang weiter, den Prometheus bereits besitzt.

```
MiroFish (Docker)          Brücke (Host, Node)              OpenRouter
  LLM_BASE_URL   ──────►   :8799/v1/chat/completions  ──►  /chat/completions
  LLM_API_KEY    ──────►   Token-Prüfung
                           Zugang aus ~/.pmh/.credentials.yaml
```

## Start

```powershell
node integrations\mirofish-bridge\bridge.mjs
```

Oder über `start.cmd` im selben Verzeichnis. Die Brücke muss laufen, solange
MiroFish simuliert; sie ist der einzige Weg von MiroFish zum Modell.

## PDF-Export

`POST /pdf` mit `{ "report_id": "report_…" }` startet
`integrations/mirofish-report-pdf/build.mjs`, wartet auf die Datei und gibt sie als
`application/pdf` zurück. Ausgelöst wird das durch den Knopf „Als PDF laden" im
Report-Tab der Oberfläche.

Der Aufruf ist **nicht** token-geschützt: der Browser kann das Token nicht halten.
Stattdessen prüft die Route den `Origin` und akzeptiert nur `http://localhost:3000`
und `http://127.0.0.1:3000`; alles andere bekommt 403. Von einer LAN-Adresse aus
funktioniert der Knopf deshalb nicht.

## Konfiguration

| Variable | Vorgabe | Zweck |
|---|---|---|
| `BRIDGE_PORT` | `8799` | Port, auf dem MiroFish die Brücke erreicht |
| `BRIDGE_HOST` | `0.0.0.0` | Bind-Adresse; `0.0.0.0` ist nötig, damit der Container `host.docker.internal` erreicht |
| `BRIDGE_TOKEN` | Inhalt von `token.txt` | Gemeinsames Geheimnis mit MiroFish |
| `BRIDGE_CREDENTIAL_STORE` | `~/.pmh/.credentials.yaml` | Quelle des Anbieter-Zugangs |
| `BRIDGE_UPSTREAM` | `https://openrouter.ai/api/v1` | Ziel-API |
| `OPENROUTER_API_KEY` | – | Übersteuert den Credential-Store |

Das Token liegt in [`token.txt`](token.txt) und steht in MiroFish' `.env` als
`LLM_API_KEY`. Beide Seiten müssen übereinstimmen; bei Abweichung antwortet die
Brücke mit `401`.

## Modell wechseln

Das Modell wählt MiroFish, nicht die Brücke: `LLM_MODEL_NAME` in
`.tmp/mirofish/.env`. Jeder OpenRouter-Slug funktioniert, etwa
`qwen/qwen-plus` (Vorgabe), `deepseek/deepseek-chat` oder
`anthropic/claude-sonnet-4.5`.

Nach einer Änderung den Container neu starten, weil `env_file` nur beim Anlegen
gelesen wird:

```powershell
cd .tmp\mirofish
docker compose up -d --force-recreate
```

## Prüfen

```powershell
# Brücke allein
Invoke-RestMethod http://127.0.0.1:8799/healthz

# aus dem Container heraus (Netzweg und Token)
docker exec mirofish sh -lc 'node -e "fetch(\"http://host.docker.internal:8799/healthz\").then(r=>r.text()).then(console.log)"'

# MiroFish' eigener Client gegen die Brücke
docker exec mirofish sh -lc 'cd /app/backend && uv run python -c "from app.utils.llm_client import LLMClient; print(LLMClient().chat([{\"role\":\"user\",\"content\":\"ping\"}], max_tokens=10))"'
```

## Grenzen

- **Zep Cloud bleibt zwingend.** Der Graph-Teil nutzt das `zep_cloud`-SDK, und
  `backend/app/config.py` weist `ZEP_API_URL` ausdrücklich zurück. Ohne
  `ZEP_API_KEY` startet MiroFish, aber Projektanlage und Graph-Bau scheitern.
  Ein lokaler Ersatz (Neo4j, pgvector) ist ohne Eingriff in den Backend-Code nicht
  möglich.
- **Nur Chat Completions.** Weitere OpenAI-Endpunkte werden nicht durchgereicht;
  MiroFish braucht sie nicht.
- **Die Brücke ist kein Anonymisierer.** Prompts und Antworten laufen im Klartext
  über OpenRouter.

## Sicherheit

- Die Brücke lauscht auf `0.0.0.0`, damit Docker sie erreicht. Damit ist sie im
  lokalen Netz erreichbar; das Token schützt die Nutzung, nicht die Sichtbarkeit.
  Wer das nicht will, bindet auf die Docker-Bridge-Adresse und trägt sie in
  `LLM_BASE_URL` ein.
- `~/.pmh/.credentials.yaml` enthält die Anbieter-Schlüssel im Klartext. Die Brücke
  liest nur, sie schreibt nie. Wer die Datei teilt oder sichert, gibt alle Schlüssel
  weiter.
