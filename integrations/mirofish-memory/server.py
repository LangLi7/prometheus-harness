"""Local replacement for Zep Cloud, limited to the routes MiroFish calls.

The contract is measured, not guessed: see contract.md in this directory for the
17 routes, the response shapes and the two patches MiroFish needs. Storage is
PostgreSQL; entity and edge extraction is delegated to the Prometheus bridge, so
no external service and no separate API key are required.
"""

from __future__ import annotations

import json
import os
import re
import threading
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import psycopg

PORT = int(os.environ.get("SHIM_PORT", "8798"))
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://pmh_admin:bitte-aendern-admin@host.docker.internal:5432/mirofish_memory",
)
BRIDGE_URL = os.environ.get("BRIDGE_URL", "http://host.docker.internal:8799/v1")
BRIDGE_TOKEN = os.environ.get("BRIDGE_TOKEN", "")
MODEL = os.environ.get("SHIM_MODEL", "qwen/qwen-plus")
MAX_BODY = 8 * 1024 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS graphs (
    graph_id    text PRIMARY KEY,
    name        text,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ontologies (
    graph_id   text PRIMARY KEY REFERENCES graphs(graph_id) ON DELETE CASCADE,
    entities   jsonb NOT NULL DEFAULT '{}'::jsonb,
    edges      jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS episodes (
    uuid        text PRIMARY KEY,
    graph_id    text NOT NULL REFERENCES graphs(graph_id) ON DELETE CASCADE,
    content     text NOT NULL,
    source      text DEFAULT 'text',
    metadata    jsonb DEFAULT '{}'::jsonb,
    processed   boolean NOT NULL DEFAULT false,
    task_id     text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nodes (
    uuid       text PRIMARY KEY,
    graph_id   text NOT NULL REFERENCES graphs(graph_id) ON DELETE CASCADE,
    name       text NOT NULL,
    summary    text DEFAULT '',
    labels     text[] NOT NULL DEFAULT '{}',
    attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nodes_graph_name ON nodes (graph_id, lower(name));
CREATE TABLE IF NOT EXISTS edges (
    uuid             text PRIMARY KEY,
    graph_id         text NOT NULL REFERENCES graphs(graph_id) ON DELETE CASCADE,
    name             text NOT NULL,
    fact             text NOT NULL DEFAULT '',
    source_node_uuid text NOT NULL,
    target_node_uuid text NOT NULL,
    attributes       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS batches (
    batch_id     text PRIMARY KEY,
    status       text NOT NULL DEFAULT 'draft',
    item_count   integer NOT NULL DEFAULT 0,
    progress     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz
);
CREATE TABLE IF NOT EXISTS batch_items (
    item_id        text PRIMARY KEY,
    batch_id       text NOT NULL REFERENCES batches(batch_id) ON DELETE CASCADE,
    graph_id       text,
    episode_uuid   text,
    status         text NOT NULL DEFAULT 'pending',
    sequence_index integer NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now()
);
"""


def iso(value: Any) -> str:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


def connect() -> psycopg.Connection:
    return psycopg.connect(DATABASE_URL, autocommit=True)


_lock = threading.Lock()


def db() -> psycopg.Connection:
    """One connection per request, created under a lock so a cold start is safe."""

    with _lock:
        conn = connect()
    return conn


def graph_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "uuid": row["graph_id"],
        "graph_id": row["graph_id"],
        "id": 1,
        "name": row.get("name") or row["graph_id"],
        "description": row.get("description") or "",
        "created_at": iso(row["created_at"]),
        "project_uuid": "00000000-0000-0000-0000-000000000000",
    }


def node_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "uuid": row["uuid"],
        "name": row["name"],
        "graph_id": row["graph_id"],
        "labels": row["labels"] or [],
        "summary": row["summary"] or "",
        "attributes": row["attributes"] or {},
        "created_at": iso(row["created_at"]),
    }


def edge_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "uuid": row["uuid"],
        "name": row["name"],
        "fact": row["fact"],
        "graph_id": row["graph_id"],
        "source_node_uuid": row["source_node_uuid"],
        "target_node_uuid": row["target_node_uuid"],
        "attributes": row["attributes"] or {},
        "created_at": iso(row["created_at"]),
    }


def episode_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "uuid": row["uuid"],
        "content": row["content"],
        "source": row["source"],
        "metadata": row["metadata"] or {},
        "processed": row["processed"],
        "task_id": row["task_id"],
        "created_at": iso(row["created_at"]),
    }


def batch_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "batch_id": row["batch_id"],
        "status": row["status"],
        "item_count": row["item_count"],
        "progress": row["progress"] or {},
        "created_at": iso(row["created_at"]),
        "processed_at": iso(row["processed_at"]) if row["processed_at"] else None,
    }


def batch_item_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "item_id": row["item_id"],
        "batch_id": row["batch_id"],
        "graph_id": row["graph_id"],
        "episode_uuid": row["episode_uuid"],
        "status": row["status"],
        "sequence_index": row["sequence_index"],
        "kind": "graph_episode",
        "created_at": iso(row["created_at"]),
    }


def call_bridge(prompt: str, system: str) -> str:
    """Ask the bridge for a completion; the bridge handles credentials and timeouts."""

    payload = {
        "model": MODEL,
        "temperature": 0.1,
        # Without an explicit budget the provider may stop after a few dozen
        # tokens, which silently yields one or two entities per chunk.
        "max_tokens": 2000,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    }
    request = urllib.request.Request(
        f"{BRIDGE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {BRIDGE_TOKEN}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        body = json.loads(response.read().decode("utf-8"))
    return body["choices"][0]["message"]["content"] or ""


EXTRACTION_SYSTEM = (
    "You extract a knowledge graph from a document fragment. "
    "Answer with JSON only, no prose, no markdown fences."
)


def _describe(kind: str, mapping: dict[str, Any]) -> str:
    """Render ontology types with their descriptions for the prompt."""

    lines = []
    for name, definition in mapping.items():
        description = ""
        if isinstance(definition, dict):
            description = str(definition.get("description") or "")[:160]
        lines.append(f"- {name}{(': ' + description) if description else ''}")
    return f"Allowed {kind}:\n" + "\n".join(lines)


def extraction_prompt(content: str, ontology: dict[str, Any]) -> str:
    entities = ontology.get("entities") or {}
    edges = ontology.get("edges") or {}
    return (
        f"{_describe('entity types', entities)}\n\n"
        f"{_describe('edge types', edges)}\n\n"
        "Rules:\n"
        "1. Extract every named thing the text actually mentions: products, tools, "
        "organisations, roles, licences, scripts, numbers used as a claim.\n"
        "2. Map each thing to the closest allowed entity type. The type is a bucket, "
        "not a filter: never drop a thing because no type fits exactly.\n"
        "3. Return between 3 and 12 entities and 0 to 12 edges for a fragment this size. "
        "Only return an empty list when the fragment names nothing at all.\n"
        "4. Edges connect two entity names from your own list and use an allowed edge type.\n\n"
        'Answer exactly: {"entities":[{"name":"...","type":"<allowed entity type>",'
        '"summary":"one sentence"}],"edges":[{"source":"<entity name>","target":"<entity name>",'
        '"name":"<allowed edge type>","fact":"one sentence"}]}\n\n'
        f"Text:\n{content}"
    )


def extract(conn: psycopg.Connection, graph_id: str, content: str) -> None:
    """Turn one episode into nodes and edges. Failures stay local to that episode."""

    ontology_row = conn.execute(
        "SELECT entities, edges FROM ontologies WHERE graph_id = %s", (graph_id,)
    ).fetchone()
    ontology = {"entities": ontology_row[0], "edges": ontology_row[1]} if ontology_row else {}

    try:
        raw = call_bridge(
            extraction_prompt(content[:12000], ontology),
            EXTRACTION_SYSTEM,
        )
        data = json.loads(raw)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as exc:
        print(f"[shim] extraction failed for {graph_id}: {exc!r}", flush=True)
        return

    name_to_uuid: dict[str, str] = {}
    for entity in data.get("entities") or []:
        name = (entity.get("name") or "").strip()
        if not name:
            continue
        node_uuid = str(uuid.uuid4())
        row = conn.execute(
            """
            INSERT INTO nodes (uuid, graph_id, name, summary, labels, attributes)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (graph_id, lower(name)) DO UPDATE SET summary = EXCLUDED.summary
            RETURNING uuid
            """,
            (
                node_uuid,
                graph_id,
                name,
                (entity.get("summary") or "")[:2000],
                [entity.get("type") or "Entity"],
                json.dumps({"name": name, "type": entity.get("type")}),
            ),
        ).fetchone()
        name_to_uuid[name.lower()] = row[0]

    for edge in data.get("edges") or []:
        source = name_to_uuid.get((edge.get("source") or "").strip().lower())
        target = name_to_uuid.get((edge.get("target") or "").strip().lower())
        if not source or not target or source == target:
            continue
        conn.execute(
            """
            INSERT INTO edges (uuid, graph_id, name, fact, source_node_uuid, target_node_uuid)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                str(uuid.uuid4()),
                graph_id,
                (edge.get("name") or "RELATES_TO")[:120],
                (edge.get("fact") or "")[:2000],
                source,
                target,
            ),
        )


def extract_async(graph_id: str, episode_uuid: str, content: str) -> None:
    def run() -> None:
        conn = db()
        try:
            extract(conn, graph_id, content)
            conn.execute("UPDATE episodes SET processed = true WHERE uuid = %s", (episode_uuid,))
        finally:
            conn.close()

    threading.Thread(target=run, daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "mirofish-memory/0.1"

    def log_message(self, fmt: str, *args: Any) -> None:  # keep one line per request
        print(f"[shim] {fmt % args}", flush=True)

    def send_json(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self) -> bytes:
        """Read the whole request body, chunked or length-delimited.

        The SDK sends large episode payloads chunked; reading only
        Content-Length desynchronises the connection and every later request on
        that socket fails with a syntax error.
        """

        if self.headers.get("expect", "").lower() == "100-continue":
            self.send_response_only(100)
            self.end_headers()

        if "chunked" in (self.headers.get("transfer-encoding") or "").lower():
            chunks: list[bytes] = []
            total = 0
            while True:
                line = self.rfile.readline(1024).strip()
                if not line:
                    break
                size = int(line.split(b";")[0], 16)
                if size == 0:
                    self.rfile.readline(1024)
                    break
                total += size
                if total > MAX_BODY:
                    raise ValueError("body too large")
                chunks.append(self.rfile.read(size))
                self.rfile.read(2)
            return b"".join(chunks)

        length = int(self.headers.get("content-length") or 0)
        if length <= 0:
            return b""
        if length > MAX_BODY:
            raise ValueError("body too large")
        return self.rfile.read(length)

    def read_json(self) -> dict[str, Any]:
        raw = self._body if self._body is not None else self.read_body()
        self._body = b""
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8") or "{}")

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        self.route("GET")

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        self.route("POST")

    def do_PUT(self) -> None:  # noqa: N802 - http.server API
        self.route("PUT")

    def do_DELETE(self) -> None:  # noqa: N802 - http.server API
        self.route("DELETE")

    def route(self, method: str) -> None:
        path = self.path.split("?")[0]
        if path.startswith("/api/v2"):
            path = path[len("/api/v2") :]
        # Always consume the body, even for a 404: an unread body would be parsed
        # as the next request line on a keep-alive connection.
        self._body = self.read_body()
        try:
            handler = self.match(method, path)
            if handler is None:
                self.send_json(404, {"message": f"no route for {method} {path}"})
                return
            handler(path)
        except ValueError as exc:
            self.send_json(400, {"message": str(exc)})
        except Exception as exc:  # noqa: BLE001 - a shim must answer, not crash
            print(f"[shim] {method} {path} failed: {exc!r}", flush=True)
            self.send_json(500, {"message": f"{type(exc).__name__}: {exc}"})

    def match(self, method: str, path: str):
        routes = [
            ("POST", r"^/graph/create$", self.create_graph),
            ("POST", r"^/graph$", self.add_episode),
            ("POST", r"^/graph/search$", self.search),
            ("PUT", r"^/entity-types$", self.set_ontology),
            ("GET", r"^/graph/([^/]+)$", self.get_graph),
            ("DELETE", r"^/graph/([^/]+)$", self.delete_graph),
            ("GET", r"^/graph/episodes/([^/]+)$", self.get_episode),
            ("GET", r"^/graph/node/([^/]+)/entity-edges$", self.node_edges),
            ("GET", r"^/graph/node/([^/]+)$", self.get_node),
            ("POST", r"^/graph/node/graph/([^/]+)$", self.nodes_by_graph),
            ("POST", r"^/graph/edge/graph/([^/]+)$", self.edges_by_graph),
            ("POST", r"^/batches$", self.create_batch),
            ("GET", r"^/batches$", self.list_batches),
            ("GET", r"^/batches/([^/]+)$", self.get_batch),
            ("POST", r"^/batches/([^/]+)/items$", self.add_batch_items),
            ("GET", r"^/batches/([^/]+)/items$", self.batch_items),
            ("POST", r"^/batches/([^/]+)/process$", self.process_batch),
        ]
        for allowed, pattern, handler in routes:
            if allowed != method:
                continue
            match = re.match(pattern, path)
            if match:
                return lambda _p, h=handler, m=match: h(*m.groups())
        return None

    # --- graphs ---------------------------------------------------------
    def create_graph(self, *_):
        body = self.read_json()
        graph_id = body.get("graph_id") or f"mirofish_{uuid.uuid4().hex[:16]}"
        conn = db()
        try:
            row = conn.execute(
                """
                INSERT INTO graphs (graph_id, name, description) VALUES (%s, %s, %s)
                ON CONFLICT (graph_id) DO UPDATE SET name = EXCLUDED.name
                RETURNING graph_id, name, description, created_at
                """,
                (graph_id, body.get("name") or graph_id, body.get("description") or ""),
            ).fetchone()
        finally:
            conn.close()
        self.send_json(200, graph_json(self.row(row, ("graph_id", "name", "description", "created_at"))))

    def get_graph(self, graph_id: str):
        conn = db()
        try:
            row = conn.execute(
                "SELECT graph_id, name, description, created_at FROM graphs WHERE graph_id = %s",
                (graph_id,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            self.send_json(404, {"message": "graph not found"})
            return
        self.send_json(200, graph_json(self.row(row, ("graph_id", "name", "description", "created_at"))))

    def delete_graph(self, graph_id: str):
        conn = db()
        try:
            conn.execute("DELETE FROM graphs WHERE graph_id = %s", (graph_id,))
        finally:
            conn.close()
        self.send_json(200, {"message": "OK"})

    def set_ontology(self, *_):
        body = self.read_json()
        graph_ids = body.get("graph_ids") or []

        # The SDK sends `entity_types` / `edge_types` as sequences of objects
        # (zep_cloud/graph/raw_client.py:451). Accept the dict form too, so a
        # hand-written call cannot silently store an empty ontology.
        def as_map(items: Any) -> dict[str, Any]:
            if isinstance(items, dict):
                return items
            collected: dict[str, Any] = {}
            for item in items or []:
                if isinstance(item, dict):
                    key = item.get("name") or item.get("type")
                    if key:
                        collected[str(key)] = item
            return collected

        entities = as_map(body.get("entity_types") or body.get("entities"))
        edges = as_map(body.get("edge_types") or body.get("edges"))
        print(f"[shim] ontology: entities={list(entities)[:6]} edges={list(edges)[:6]}", flush=True)
        conn = db()
        try:
            for graph_id in graph_ids:
                conn.execute(
                    """
                    INSERT INTO ontologies (graph_id, entities, edges) VALUES (%s, %s, %s)
                    ON CONFLICT (graph_id) DO UPDATE
                    SET entities = EXCLUDED.entities, edges = EXCLUDED.edges, updated_at = now()
                    """,
                    (graph_id, json.dumps(entities), json.dumps(edges)),
                )
        finally:
            conn.close()
        self.send_json(200, {"message": "OK"})

    # --- episodes -------------------------------------------------------
    def add_episode(self, *_):
        body = self.read_json()
        graph_id = body.get("graph_id")
        content = body.get("data") or ""
        if not graph_id or not content:
            raise ValueError("graph_id and data are required")
        episode_uuid = str(uuid.uuid4())
        conn = db()
        try:
            row = conn.execute(
                """
                INSERT INTO episodes (uuid, graph_id, content, source, metadata, task_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING uuid, content, source, metadata, processed, task_id, created_at
                """,
                (
                    episode_uuid,
                    graph_id,
                    content,
                    body.get("type") or "text",
                    json.dumps(body.get("metadata") or {}),
                    str(uuid.uuid4()),
                ),
            ).fetchone()
        finally:
            conn.close()
        extract_async(graph_id, episode_uuid, content)
        self.send_json(
            200,
            episode_json(
                self.row(row, ("uuid", "content", "source", "metadata", "processed", "task_id", "created_at"))
            ),
        )

    def get_episode(self, episode_uuid: str):
        conn = db()
        try:
            row = conn.execute(
                """
                SELECT uuid, content, source, metadata, processed, task_id, created_at
                FROM episodes WHERE uuid = %s
                """,
                (episode_uuid,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            self.send_json(404, {"message": "episode not found"})
            return
        self.send_json(
            200,
            episode_json(
                self.row(row, ("uuid", "content", "source", "metadata", "processed", "task_id", "created_at"))
            ),
        )

    # --- nodes and edges ------------------------------------------------
    def get_node(self, node_uuid: str):
        conn = db()
        try:
            row = conn.execute(
                "SELECT uuid, graph_id, name, summary, labels, attributes, created_at FROM nodes WHERE uuid = %s",
                (node_uuid,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            self.send_json(404, {"message": "node not found"})
            return
        self.send_json(
            200,
            node_json(self.row(row, ("uuid", "graph_id", "name", "summary", "labels", "attributes", "created_at"))),
        )

    def node_edges(self, node_uuid: str):
        conn = db()
        try:
            rows = conn.execute(
                """
                SELECT uuid, graph_id, name, fact, source_node_uuid, target_node_uuid, attributes, created_at
                FROM edges WHERE source_node_uuid = %s OR target_node_uuid = %s
                """,
                (node_uuid, node_uuid),
            ).fetchall()
        finally:
            conn.close()
        fields = (
            "uuid", "graph_id", "name", "fact", "source_node_uuid",
            "target_node_uuid", "attributes", "created_at",
        )
        self.send_json(200, [edge_json(self.row(r, fields)) for r in rows])

    def nodes_by_graph(self, graph_id: str):
        conn = db()
        try:
            rows = conn.execute(
                """
                SELECT uuid, graph_id, name, summary, labels, attributes, created_at
                FROM nodes WHERE graph_id = %s ORDER BY created_at
                """,
                (graph_id,),
            ).fetchall()
        finally:
            conn.close()
        fields = ("uuid", "graph_id", "name", "summary", "labels", "attributes", "created_at")
        self.send_json(200, [node_json(self.row(r, fields)) for r in rows])

    def edges_by_graph(self, graph_id: str):
        conn = db()
        try:
            rows = conn.execute(
                """
                SELECT uuid, graph_id, name, fact, source_node_uuid, target_node_uuid, attributes, created_at
                FROM edges WHERE graph_id = %s ORDER BY created_at
                """,
                (graph_id,),
            ).fetchall()
        finally:
            conn.close()
        fields = (
            "uuid", "graph_id", "name", "fact", "source_node_uuid",
            "target_node_uuid", "attributes", "created_at",
        )
        self.send_json(200, [edge_json(self.row(r, fields)) for r in rows])

    # --- search ---------------------------------------------------------
    def search(self, *_):
        body = self.read_json()
        graph_id = body.get("graph_id")
        query = (body.get("query") or "").strip()
        limit = min(int(body.get("limit") or 10), 50)
        if not graph_id or not query:
            raise ValueError("graph_id and query are required")

        # A whole-sentence query never matches with a single ILIKE pattern, so
        # the search works on its significant words and ranks by how many hit.
        tokens = [t for t in re.split(r"\W+", query) if len(t) >= 4][:8] or [query]
        patterns = [f"%{t}%" for t in tokens]
        conn = db()
        try:
            node_rows = conn.execute(
                """
                SELECT uuid, graph_id, name, summary, labels, attributes, created_at,
                       (SELECT count(*) FROM unnest(%s::text[]) AS p
                        WHERE nodes.name ILIKE p OR nodes.summary ILIKE p) AS hits
                FROM nodes WHERE graph_id = %s
                ORDER BY hits DESC, length(name) LIMIT %s
                """,
                (patterns, graph_id, limit),
            ).fetchall()
            node_rows = [r for r in node_rows if r[7]]
            edge_rows = conn.execute(
                """
                SELECT uuid, graph_id, name, fact, source_node_uuid, target_node_uuid, attributes, created_at,
                       (SELECT count(*) FROM unnest(%s::text[]) AS p WHERE edges.fact ILIKE p) AS hits
                FROM edges WHERE graph_id = %s
                ORDER BY hits DESC, length(fact) LIMIT %s
                """,
                (patterns, graph_id, limit),
            ).fetchall()
            edge_rows = [r for r in edge_rows if r[8]]
            episode_rows = conn.execute(
                """
                SELECT uuid, content, source, metadata, processed, task_id, created_at,
                       (SELECT count(*) FROM unnest(%s::text[]) AS p WHERE episodes.content ILIKE p) AS hits
                FROM episodes WHERE graph_id = %s
                ORDER BY hits DESC LIMIT %s
                """,
                (patterns, graph_id, limit),
            ).fetchall()
            episode_rows = [r for r in episode_rows if r[7]]
        finally:
            conn.close()

        node_fields = ("uuid", "graph_id", "name", "summary", "labels", "attributes", "created_at", "hits")
        edge_fields = (
            "uuid", "graph_id", "name", "fact", "source_node_uuid",
            "target_node_uuid", "attributes", "created_at", "hits",
        )
        episode_fields = ("uuid", "content", "source", "metadata", "processed", "task_id", "created_at", "hits")
        nodes = [node_json(self.row(r, node_fields)) for r in node_rows]
        edges = [edge_json(self.row(r, edge_fields)) for r in edge_rows]
        episodes = [episode_json(self.row(r, episode_fields)) for r in episode_rows]
        context = "\n".join(
            [f"{n['name']}: {n['summary']}" for n in nodes]
            + [f"{e['name']}: {e['fact']}" for e in edges]
        )[:4000]
        self.send_json(
            200,
            {
                "nodes": nodes,
                "edges": edges,
                "episodes": episodes,
                "context": context,
                "response": {"query": query, "engine": "local-postgres"},
            },
        )

    # --- batches --------------------------------------------------------
    def create_batch(self, *_):
        body = self.read_json()
        batch_id = str(uuid.uuid4())
        conn = db()
        try:
            row = conn.execute(
                """
                INSERT INTO batches (batch_id, status, item_count, progress)
                VALUES (%s, 'draft', 0, %s)
                RETURNING batch_id, status, item_count, progress, created_at, processed_at
                """,
                (batch_id, json.dumps({"succeeded": 0, "failed": 0, "total": 0})),
            ).fetchone()
        finally:
            conn.close()
        fields = ("batch_id", "status", "item_count", "progress", "created_at", "processed_at")
        self.send_json(200, batch_json(self.row(row, fields)))

    def list_batches(self, *_):
        conn = db()
        try:
            rows = conn.execute(
                """
                SELECT batch_id, status, item_count, progress, created_at, processed_at
                FROM batches ORDER BY created_at DESC LIMIT 100
                """
            ).fetchall()
        finally:
            conn.close()
        fields = ("batch_id", "status", "item_count", "progress", "created_at", "processed_at")
        self.send_json(200, {"batches": [batch_json(self.row(r, fields)) for r in rows], "next_cursor": None})

    def get_batch(self, batch_id: str):
        conn = db()
        try:
            row = conn.execute(
                """
                SELECT batch_id, status, item_count, progress, created_at, processed_at
                FROM batches WHERE batch_id = %s
                """,
                (batch_id,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            self.send_json(404, {"message": "batch not found"})
            return
        fields = ("batch_id", "status", "item_count", "progress", "created_at", "processed_at")
        self.send_json(200, batch_json(self.row(row, fields)))

    def add_batch_items(self, batch_id: str):
        body = self.read_json()
        items = body.get("items") or []
        created = []
        conn = db()
        try:
            for index, item in enumerate(items):
                graph_id = item.get("graph_id")
                content = item.get("data") or ""
                if not graph_id or not content:
                    continue
                episode_uuid = str(uuid.uuid4())
                item_id = str(uuid.uuid4())
                conn.execute(
                    """
                    INSERT INTO episodes (uuid, graph_id, content, source, metadata, task_id)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        episode_uuid,
                        graph_id,
                        content,
                        item.get("type") or "text",
                        json.dumps(item.get("metadata") or {}),
                        str(uuid.uuid4()),
                    ),
                )
                row = conn.execute(
                    """
                    INSERT INTO batch_items (item_id, batch_id, graph_id, episode_uuid, status, sequence_index)
                    VALUES (%s, %s, %s, %s, 'pending', %s)
                    RETURNING item_id, batch_id, graph_id, episode_uuid, status, sequence_index, created_at
                    """,
                    (item_id, batch_id, graph_id, episode_uuid, index),
                ).fetchone()
                created.append(row)
            conn.execute(
                "UPDATE batches SET item_count = item_count + %s WHERE batch_id = %s",
                (len(created), batch_id),
            )
        finally:
            conn.close()
        fields = ("item_id", "batch_id", "graph_id", "episode_uuid", "status", "sequence_index", "created_at")
        self.send_json(200, [batch_item_json(self.row(r, fields)) for r in created])

    def batch_items(self, batch_id: str):
        conn = db()
        try:
            rows = conn.execute(
                """
                SELECT item_id, batch_id, graph_id, episode_uuid, status, sequence_index, created_at
                FROM batch_items WHERE batch_id = %s ORDER BY sequence_index
                """,
                (batch_id,),
            ).fetchall()
        finally:
            conn.close()
        fields = ("item_id", "batch_id", "graph_id", "episode_uuid", "status", "sequence_index", "created_at")
        self.send_json(
            200,
            {"items": [batch_item_json(self.row(r, fields)) for r in rows], "next_cursor": None},
        )

    def process_batch(self, batch_id: str):
        conn = db()
        try:
            rows = conn.execute(
                "SELECT item_id, graph_id, episode_uuid FROM batch_items WHERE batch_id = %s",
                (batch_id,),
            ).fetchall()
            conn.execute(
                "UPDATE batches SET status = 'processing', processed_at = now() WHERE batch_id = %s",
                (batch_id,),
            )
        finally:
            conn.close()

        def run() -> None:
            succeeded = 0
            failed = 0
            for item_id, graph_id, episode_uuid in rows:
                worker = db()
                try:
                    content_row = worker.execute(
                        "SELECT content FROM episodes WHERE uuid = %s", (episode_uuid,)
                    ).fetchone()
                    if not content_row:
                        raise ValueError("episode vanished")
                    extract(worker, graph_id, content_row[0])
                    worker.execute("UPDATE episodes SET processed = true WHERE uuid = %s", (episode_uuid,))
                    worker.execute("UPDATE batch_items SET status = 'succeeded' WHERE item_id = %s", (item_id,))
                    succeeded += 1
                except Exception as exc:  # noqa: BLE001 - one item must not kill the batch
                    print(f"[shim] batch item {item_id} failed: {exc!r}", flush=True)
                    worker.execute("UPDATE batch_items SET status = 'failed' WHERE item_id = %s", (item_id,))
                    failed += 1
                finally:
                    worker.close()
            final = db()
            try:
                final.execute(
                    """
                    UPDATE batches
                    SET status = %s, progress = %s
                    WHERE batch_id = %s
                    """,
                    (
                        "succeeded" if failed == 0 else "partial",
                        json.dumps({"succeeded": succeeded, "failed": failed, "total": succeeded + failed}),
                        batch_id,
                    ),
                )
            finally:
                final.close()

        threading.Thread(target=run, daemon=True).start()
        self.send_json(
            200,
            {
                "batch_id": batch_id,
                "status": "processing",
                "item_count": len(rows),
                "progress": {"succeeded": 0, "failed": 0, "total": len(rows)},
                "created_at": iso(datetime.now(timezone.utc)),
                "processed_at": None,
            },
        )

    @staticmethod
    def row(values: Any, fields: tuple[str, ...]) -> dict[str, Any]:
        return dict(zip(fields, values))


def main() -> None:
    conn = connect()
    try:
        conn.execute(SCHEMA)
    finally:
        conn.close()
    print(f"[shim] listening on 0.0.0.0:{PORT}", flush=True)
    print(f"[shim] database {DATABASE_URL.split('@')[-1]}", flush=True)
    print(f"[shim] extraction via {BRIDGE_URL} model={MODEL}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
