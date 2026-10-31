# MiroFish HTTP-Referenz

Backend: `http://127.0.0.1:5001` (Flask, kein Auth, nur lokal gedacht).
Frontend: `http://127.0.0.1:3000`.

Die **UI ist die Quelle der Wahrheit**; diese Referenz ist für automatisierte
Läufe und zum Verstehen der Reihenfolge. Feldnamen aus den Route-Docstrings,
Stand 27.10.2026.

## Health

```http
GET /health
→ {"status":"ok","service":"MiroFish Backend"}
```

## 1. Projekt und Ontologie

```http
POST /api/graph/ontology/generate
Content-Type: multipart/form-data

files=@mirofish-seed.md        (PDF/MD/TXT, mehrfach möglich)
simulation_requirement=...     (Pflicht)
project_name=...
additional_context=...
→ data.project_id, data.ontology {entity_types, edge_types, analysis_summary}
```

## 2. Graph bauen (Zep, teuer)

```http
POST /api/graph/build
{"project_id":"proj_…","graph_name":"…","chunk_size":500,"chunk_overlap":50}
→ data.task_id

GET /api/graph/task/{task_id}          # Fortschritt
GET /api/graph/project/{project_id}    # danach: graph_id
```

## 3. Simulation anlegen und vorbereiten

```http
POST /api/simulation/create
{"project_id":"proj_…","graph_id":"mirofish_…","enable_twitter":true,"enable_reddit":true}
→ data.simulation_id

POST /api/simulation/prepare
{"simulation_id":"sim_…","use_llm_for_profiles":true,"parallel_profile_count":5}
→ data.task_id

POST /api/simulation/prepare/status
{"task_id":"task_…"}                   # Fortschritt
```

## 4. Laufen lassen

```http
POST /api/simulation/start
{"simulation_id":"sim_…","platform":"parallel","max_rounds":25,"enable_graph_memory_update":false}
→ data.runner_status

GET /api/simulation/{simulation_id}/run-status
GET /api/simulation/{simulation_id}/run-status/detail
GET /api/simulation/{simulation_id}/posts
GET /api/simulation/{simulation_id}/timeline
```

`platform`: `twitter` | `reddit` | `parallel`. Erster Lauf: `max_rounds` 20–30.

## 5. Report

```http
POST /api/report/generate
{"simulation_id":"sim_…","force_regenerate":false}
→ data.task_id

POST /api/report/generate/status
{"task_id":"task_…"}

GET /api/report/by-simulation/{simulation_id}
GET /api/report/{report_id}
GET /api/report/{report_id}/sections
```

## 6. Nachfragen (optional)

```http
POST /api/report/chat                 # mit dem Report-Agenten sprechen
POST /api/simulation/interview        # einen Agenten befragen
POST /api/simulation/interview/all    # alle Agenten zu einer Frage
```

## Grenzen

- Keine Authentifizierung: nicht ins Internet stellen.
- Zep Cloud und der LLM-Anbieter werden bei jedem Lauf belastet.
- Die Simulation ist synthetisch; Aussagen sind Hypothesen, keine Messungen.
