"""Smoke test: drive the local Zep replacement with the unmodified Zep SDK.

Runs inside the MiroFish container so the SDK version matches what the backend
uses. Exits non-zero on the first broken route.
"""

from __future__ import annotations

import sys
import time

from zep_cloud.client import Zep
from zep_cloud.types import BatchAddItem

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://host.docker.internal:8798/api/v2"
GRAPH_ID = "shimtest"


def main() -> int:
    zep = Zep(api_key="local-shim", base_url=BASE_URL)

    graph = zep.graph.create(graph_id=GRAPH_ID, name="Shim smoke", description="local")
    print(f"graph.create        -> {graph.graph_id} / {graph.name}")

    fetched = zep.graph.get(GRAPH_ID)
    print(f"graph.get           -> {fetched.graph_id}")

    zep.graph.set_ontology(entities={}, edges={}, graph_ids=[GRAPH_ID])
    print("graph.set_ontology  -> ok")

    text = (
        "Prometheus Harness ist ein Agenten-Harness auf Basis des DeepSeek-Harness. "
        "Alice baut damit Kundenprojekte. Der Kern bleibt Kern, alles andere ist eine Unit. "
        "Das Installationsskript installiert Bun und startet PostgreSQL 17."
    )
    episode = zep.graph.add(data=text, type="text", graph_id=GRAPH_ID)
    print(f"graph.add           -> {episode.uuid_}")

    processed = False
    for _ in range(40):
        time.sleep(3)
        episode = zep.graph.episode.get(episode.uuid_)
        if episode.processed:
            processed = True
            break
    print(f"episode.processed   -> {processed}")

    nodes = zep.graph.node.with_raw_response.get_by_graph_id(GRAPH_ID).data
    edges = zep.graph.edge.with_raw_response.get_by_graph_id(GRAPH_ID).data
    print(f"nodes / edges       -> {len(nodes)} / {len(edges)}")
    for node in nodes[:4]:
        print(f"   node {node.name!r} labels={node.labels}")

    if nodes:
        detail = zep.graph.node.get(nodes[0].uuid_)
        related = zep.graph.node.get_edges(node_uuid=nodes[0].uuid_)
        print(f"node.get / edges    -> {detail.name!r} / {len(related)} related")

    results = zep.graph.search(query="Prometheus", graph_id=GRAPH_ID, limit=5)
    print(
        "graph.search        -> "
        f"nodes={len(results.nodes or [])} edges={len(results.edges or [])} "
        f"context={len(results.context or '')} chars"
    )

    batch = zep.batch.create()
    zep.batch.add(
        batch.batch_id,
        items=[BatchAddItem(graph_id=GRAPH_ID, data="Bob nutzt LangGraph statt Prometheus.", type="text")],
    )
    zep.batch.process(batch.batch_id)
    status = ""
    for _ in range(40):
        time.sleep(3)
        summary = zep.batch.get(batch.batch_id)
        status = summary.status
        if status in {"succeeded", "partial", "failed"}:
            break
    items = zep.batch.list_items(batch.batch_id).items or []
    print(f"batch lifecycle     -> {status}, items={len(items)}")
    print(f"batch.list          -> {len(zep.batch.list().batches or [])} batches")

    zep.graph.delete(GRAPH_ID)
    print("graph.delete        -> ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
