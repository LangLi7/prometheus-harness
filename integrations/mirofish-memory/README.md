# MiroFish ohne Zep Cloud

Ein lokaler Ersatz für Zep Cloud, begrenzt auf die 17 Routen, die MiroFish
tatsächlich aufruft. Speicher ist PostgreSQL 17, die Extraktion von Entitäten und
Kanten läuft über die vorhandene Prometheus-Bridge — kein zweites Konto, kein
zweiter Schlüssel, keine Cloud.

## Warum das geht

Die Simulations-Engine OASIS enthält **keinen** Zep-Bezug. Zep hängt an genau fünf
Backend-Diensten, alle über eine Fabrik (`get_zep_client()` in
`backend/app/utils/zep.py`). Diesen einen Nahtpunkt biegt `ZEP_API_URL` um.

## Betrieb

```powershell
# Datenbank einmalig anlegen (Rolle besitzt nur diese Datenbank)
docker exec -e PGPASSWORD=<admin> pmh-postgres psql -U pmh_admin -d pmh `
  -c "CREATE ROLE mirofish_memory LOGIN PASSWORD '<passwort>'"
docker exec -e PGPASSWORD=<admin> pmh-postgres psql -U pmh_admin -d pmh `
  -c "CREATE DATABASE mirofish_memory OWNER mirofish_memory"

# Dienst starten (Token der Bridge wird gebraucht)
$env:BRIDGE_TOKEN = Get-Content ..\mirofish-bridge\token.txt -Raw
docker compose up -d --build
```

In MiroFish (`.tmp/mirofish/.env`):

```
ZEP_API_URL=http://host.docker.internal:8798
ZEP_API_KEY=local-shim
```

`ZEP_API_URL` ist der **Host ohne Pfad** — das SDK hängt selbst `/api/v2` an
(`zep_cloud/client.py:22-24`). Mit `/api/v2` in der Variable entstehen
`/api/v2/api/v2/...` und jeder Aufruf endet in einem 404.

Zum Zurückschalten beide Zeilen entfernen; dann spricht MiroFish wieder Zep Cloud.

## Gemessen

Gleicher Seed (`mirofish-seed-reference.md`), gleicher Weg, gleicher LLM-Pfad:

| Kennzahl | Zep Cloud | Lokal (PostgreSQL) |
|---|---|---|
| Chunks | 9 | 9 |
| Knoten | 35 | **36** |
| Kanten | 54 | **23** |
| Graph-Bau | 73 s | 54 s |
| Konten nötig | 1 (Zep) | 0 |

Knoten deckungsgleich, Beziehungen weniger als die Hälfte. Das ist der Preis
dafür, eine mehrstufige Extraktions-Pipeline durch einen Prompt zu ersetzen: die
Entitäten sind da, ihre Vernetzung ist dünner.

## Vier Fallen, die beim Bau aufgefallen sind

Alle vier sind am echten SDK gemessen, nicht vermutet:

1. **Auth-Header**: Zep erwartet `Authorization: Api-Key <key>`, nicht `Bearer`.
2. **Gechunkte Bodies**: große Episoden kommen mit `Transfer-Encoding: chunked`.
   Wer nur `Content-Length` liest, desynchronisiert den Socket und jeder folgende
   Aufruf scheitert mit „Bad request syntax".
3. **Ontologie-Schlüssel**: `PUT /entity-types` sendet `entity_types` und
   `edge_types` als Listen, nicht `entities`/`edges`. Wer die falschen Schlüssel
   liest, speichert eine leere Ontologie — und alle Kanten heißen danach
   `RELATES_TO`.
4. **Antwortschlüssel**: das JSON enthält `uuid`, nicht `uuid_`. Der Unterstrich
   ist nur der Python-Name im SDK.

## Grenzen

- Keine Embeddings: die Suche ist ein Wort-Treffer über Name, Zusammenfassung und
  Fakt (`ILIKE` je Token, sortiert nach Trefferzahl). Recall liegt unter Zeps
  Reranker-Kette, ist aber brauchbar: eine ganze Frage liefert 5 Knoten, 5 Kanten
  und 1040 Zeichen Kontext statt null Treffern.
- Kein `graph.patterns`, `clone`, `custom-instructions` — von MiroFish nicht
  aufgerufen.
- Ein Extraktions-Prompt statt mehrerer Durchgänge: gröbere Typzuordnung. Ein
  Werkzeug wie „Bun" landet schon mal im Typ `PlatformEngineer`, weil die
  Ontologie von Personentypen geprägt ist.
- Die Repo-Tests `backend/tests/test_zep_cloud_contracts.py` prüfen die
  Cloud-Anbindung und bleiben gegen den Ersatz teilweise rot. Sie sind die
  Spezifikation, nicht der Maßstab.
- **Der Simulationspfad ist damit noch nicht bewiesen.** Der Graph-Bau läuft
  gegen den Ersatz durch, der Lauf selbst kommt nicht über Runde 0. Befunde in
  der Reihenfolge, in der sie auftraten:
  1. `KeyError: 'user_char'` in `oasis/social_agent/agents_generator.py:630`.
     `twitter_profiles.csv` wurde über `to_twitter_format()` ohne diese Spalte
     geschrieben. **Behoben** in `oasis_profile_generator.py`: `user_char` und
     `description` stehen jetzt in der Realtime-CSV.
  2. `IndexError: list index out of range` beim Cache-Refresh der
     Empfehlungs-Engine (`platform.py:update_rec_table`, `post_table[-1]` bei
     leerer Tabelle). **Abgefangen** in `run_twitter_simulation.py` durch
     `_patch_rec_table_refresh()`; der Refresh ist jetzt unkritisch.
  3. Nach beiden Korrekturen bleibt der Lauf vor der ersten Runde stehen: nach
     `performed all actions` des Initial-Schritts folgt weder
     `update rec table` noch `已发布`, bei 39 Threads und **null**
     CPU-Ticks über fünf Sekunden. Kein Socket offen, keine Ausnahme im Log.
     Das ist ein Hänger in OASIS/MiroFish, nicht im Graph-Speicher — mit Zep
     tritt er genauso auf.

## Dateien

| Datei | Zweck |
|---|---|
| `server.py` | 17 Routen, PostgreSQL, Extraktion über die Bridge |
| `smoke.py` | fährt alle Routen mit dem unveränderten Zep-SDK durch |
| `contract.md` | der gemessene Vertrag: Routen, Pflichtfelder, Patches |
| `docker-compose.yml` | der Dienst, Port 8798 |
