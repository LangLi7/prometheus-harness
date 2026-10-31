# Zep-Vertrag: was ein lokaler Ersatz erfüllen muss

Grundlage für einen eigenen Graph-Speicher, der MiroFish ohne Zep-Cloud-Konto
betreibt. Alle Angaben sind am installierten SDK `zep-cloud 3.25.0` gemessen
(MockTransport-Probe gegen `Zep(api_key=..., base_url=...)`), nicht aus der
Dokumentation abgeleitet.

> **Stand:** umgesetzt in `server.py` — alle 17 Routen, PostgreSQL statt Cloud.
> Gemessen gegen die Referenz: **36 Knoten / 23 Kanten in 54 s** lokal gegenüber
> **35 Knoten / 54 Kanten in 73 s** bei Zep Cloud. Die vier SDK-Fallen (Auth-
> Header, chunked bodies, `entity_types`-Schlüssel, `uuid` statt `uuid_`) stehen
> in `README.md`.

## Warum das überhaupt geht

Die Simulations-Engine OASIS enthält **keinen einzigen** Zep-Bezug
(`grep` über `site-packages/oasis`: 0 Treffer). Zep hängt ausschließlich an fünf
Backend-Diensten:

| Dienst | Rolle |
|---|---|
| `app/services/graph_builder.py` | Dokument → Graph (Ontologie, Episoden, Batch-Ingestion) |
| `app/services/zep_entity_reader.py` | Knoten und Kanten lesen |
| `app/services/zep_tools.py` | Suche für die Report-Werkzeuge |
| `app/services/zep_graph_memory_updater.py` | Simulationsrunden zurück in den Graphen schreiben |
| `app/services/oasis_profile_generator.py` | Persona-Kontext aus dem Graphen ziehen |

Alle fünf beziehen ihren Client aus **einer** Fabrik: `get_zep_client()` in
`app/utils/zep.py`. Das ist der Nahtpunkt.

## Die 17 Routen

Basis: `https://api.getzep.com/api/v2` — im Code als Konstante
`ZEP_CLOUD_BASE_URL`.

| SDK-Aufruf | Methode | Pfad | Aufrufer | Antwortmodell |
|---|---|---|---|---|
| `graph.create` | POST | `/graph/create` | graph_builder | `Graph` |
| `graph.get` | GET | `/graph/{graph_id}` | graph_builder | `Graph` |
| `graph.delete` | DELETE | `/graph/{graph_id}` | graph_builder, api/graph | `SuccessResponse` |
| `graph.set_ontology` | PUT | `/entity-types` | graph_builder | — |
| `graph.add` | POST | `/graph` | graph_builder, memory_updater | `Episode` |
| `graph.search` | POST | `/graph/search` | zep_tools, profile_generator | `GraphSearchResults` |
| `graph.episode.get` | GET | `/graph/episodes/{uuid}` | graph_builder, memory_updater | `Episode` |
| `graph.node.get` | GET | `/graph/node/{uuid}` | zep_tools, entity_reader | `EntityNode` |
| `graph.node.get_edges` | GET | `/graph/node/{uuid}/entity-edges` | entity_reader | `List[EntityEdge]` |
| `node.get_by_graph_id` | POST | `/graph/node/graph/{graph_id}` | zep_paging | `EntityNode`-Liste |
| `edge.get_by_graph_id` | POST | `/graph/edge/graph/{graph_id}` | zep_paging | `EntityEdge`-Liste |
| `batch.create` | POST | `/batches` | graph_builder | `BatchSummary` |
| `batch.list` | GET | `/batches` | graph_builder | `BatchListResponse` |
| `batch.add` | POST | `/batches/{batch_id}/items` | graph_builder | `List[BatchItemDetail]` |
| `batch.process` | POST | `/batches/{batch_id}/process` | graph_builder | `BatchSummary` |
| `batch.get` | GET | `/batches/{batch_id}` | graph_builder | `BatchSummary` |
| `batch.list_items` | GET | `/batches/{batch_id}/items` | graph_builder | `BatchItemListResponse` |

Die Probe lief ohne Fehlschlag: jede Methode trifft genau eine Route, keine
davon wird über einen anderen Pfad aufgelöst.

## Pflichtfelder der Antworten

Nur diese Felder werden vom SDK validiert (`null`-bar, aber vorhanden):

- `Graph`: `graph_id`, `name`, `description`, `created_at`, `uuid_`, `id`, `time_zone`, `project_uuid`
- `Episode`: `uuid_`, `content`, `created_at`, `source`, `processed`, `task_id`
- `EntityNode`: `uuid_`, `name`, `summary`, `labels`, `attributes`, `created_at`
- `EntityEdge`: `uuid_`, `name`, `fact`, `source_node_uuid`, `target_node_uuid`, `attributes`, `created_at`
- `GraphSearchResults`: `nodes`, `edges`, `episodes`, `context`, `response` (alle optional)
- `BatchSummary`: `batch_id`, `status`, `item_count`, `progress`, `created_at`
- `BatchItemDetail`: `item_id`, `status`, `episode_uuid`, `graph_id`, `sequence_index`
- `BatchListResponse` / `BatchItemListResponse`: `batches` / `items`, `next_cursor`

Statuswerte sind geschlossene Aufzählungen: Batch
`draft | invalid | queued | processing | succeeded | partial | failed | canceled`,
Item `pending | queued | processing | succeeded | failed | skipped | canceled`.

## Zwei Eingriffe in MiroFish

1. `app/utils/zep.py:21` — `ZEP_CLOUD_BASE_URL` durch `os.environ.get("ZEP_API_URL") or ZEP_CLOUD_BASE_URL` ersetzen.
2. `app/utils/zep.py:71-72` und `app/config.py:71-72` — die Ablehnung von
   `ZEP_API_URL` entfernen (sie schützt davor, versehentlich gegen einen
   Fremdendpunkt zu laufen; genau das ist hier Absicht).

Mehr nicht. Der Rest des Backends bleibt unverändert.

## Was der Ersatz semantisch leisten muss

Die Routen sind trivial, die Bedeutung ist es nicht:

- **Ontologie** (`set_ontology`) liefert Pydantic-Klassen, die der Builder
  erzeugt. Diese Beschreibungen müssen die Extraktion steuern, sonst entstehen
  Knoten ohne die Labels, die `zep_entity_reader` erwartet.
- **Extraktion**: Aus Episodentext müssen Knoten und Kanten werden. Zep macht
  das intern mit einem eigenen Modell. Ein lokaler Ersatz muss es selbst tun —
  über den vorhandenen Bridge-Endpunkt (`host.docker.internal:8799/v1`).
- **Suche** (`graph.search`) liefert `nodes`/`edges`/`episodes` plus einen
  `context`-String, den der Report-Agent direkt in seinen Prompt bekommt. Eine
  rein lexikalische Suche ist möglich, hat aber schlechteren Recall als Zeps
  Reranker-Kette.
- **Batch-Lebenszyklus**: `create → add → process → poll(get/get items)` mit
  asynchronem Status. Der Builder wartet bis zu 600 s auf `succeeded`.

## Grenzen, die bleiben

- Extraktionsqualität: ein kleiner Prompt gegen `deepseek` erreicht nicht Zeps
  mehrstufige Pipeline. Weniger Kanten, gröbere Fakten, mehr Fehlzuordnungen.
- Suche ohne Embeddings: Keyword-Treffer statt semantischer Nähe.
- Kein `graph.patterns`, kein `clone`, keine `custom-instructions` — wird von
  MiroFish nicht aufgerufen, bleibt also unimplementiert.
- Die Repo-Tests unter `backend/tests/test_zep_cloud_contracts.py` prüfen die
  Cloud-Anbindung und werden gegen einen lokalen Ersatz teilweise fehlschlagen.
  Sie sind die Spezifikation, nicht der Maßstab für den Ersatz.
