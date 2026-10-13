# Ist die Datenbank bereit für RAG und Obsidian?

**Kurze Antwort: die Maschine ja, das Schema nein.** Für Vektorsuche ist alles Nötige
installiert und eingeschaltet. Es gibt aber **keine einzige Tabelle und keine einzige
Spalte**, in die ein Textstück, ein Vektor, eine Notiz oder ein Verweis darauf passen würde.
Und zwei Fragen sind **vor** der ersten Tabelle zu entscheiden, weil sie die Tabellenform
bestimmen.

Alles hier Genannte ist am 13.10.2026 an der laufenden Datenbank nachgemessen
(`docker exec pmh-postgres psql -U pmh_app -d pmh`); die Befehle stehen bei jeder Zahl.

---

## 1. Was da ist

| Ding | Stand | Nachweis |
|---|---|---|
| `vector` (pgvector) | **0.8.7, installiert und angelegt** | `pg_extension` → `vector 0.8.7` |
| `pg_trgm` | 1.6, angelegt | `pg_extension` |
| `unaccent` | 1.1, angelegt | `pg_extension` |
| `pgcrypto` | 1.3, angelegt | `pg_extension` |
| PostgreSQL | 17.11 | `server_version` |

Der Vektorweg ist damit **offen**. Die Erweiterung liegt im Abbild
(`pgvector/pgvector:pg17`) und ist in der Datenbank eingeschaltet — nicht nur verfügbar.

## 2. Was fehlt

Gemessen: **11 Tabellen** im Schema `pmh` —

```
api_keys  auth_events  auth_sessions  chats  conversation_sessions
messages  one_time_tokens  schema_migrations  user_secrets  users  workspaces
```

Gemessen: **0** Spalten vom Typ `vector`. **0** Spalten vom Typ `tsvector`. **0** von 29
Indizes benutzt `gin_trgm_ops`, `unaccent` oder `to_tsvector` — alle 29 sind btree.

Was für RAG fehlt, ist damit keine Frage der Auslegung, sondern eine Liste:

| Was | Warum es gebraucht wird | Vorhanden? |
|---|---|---|
| `documents` (Quelle, Pfad, Prüfsumme, Stand) | ein Textstück ohne seine Herkunft ist für RAG wertlos — man kann es nicht neu erzeugen und nicht belegen | **nein** |
| `chunks` (Text, Position, `document_id`) | Vektoren gehören zu Stücken, nicht zu Dokumenten | **nein** |
| `chunks.embedding vector(n)` | die Ähnlichkeitssuche selbst | **nein** |
| Ein Vektorindex (`hnsw` oder `ivfflat`) | ohne ihn liest jede Suche die ganze Tabelle | **nein** |
| Das **Modell** je Vektor (Name, Fassung, Dimension) | zwei Modelle in einer Spalte vergleichen ist stiller Unsinn; die Dimension ist an das Modell gebunden | **nein** |
| `sources` (URL, Abrufzeit, Hash) | „woher stammt diese Behauptung" — die Zielliste fordert es ausdrücklich | **nein** |

Für Obsidian fehlt **alles**: kein `notes`, kein `vaults`, kein `tags`, kein `links`. Gemessen
im ganzen Projekt: **0** Treffer für `obsidian` im Anwendungscode (die Treffer liegen alle in
Dokumentation und Konzepten).

## 3. Die zwei Fragen, die **vor** der ersten Tabelle zu entscheiden sind

### 3.1 Der Mandantenfilter — sonst **ist** RAG das Leck

Für RAG ist das der wichtigste Punkt, und er ist heute **ungelöst**.

Eine Vektorsuche ist eine **Leseabfrage**, die über Ähnlichkeit filtert. Die natürliche Form
ist:

```sql
SELECT id, text FROM chunks ORDER BY embedding <=> $1 LIMIT 20;
```

Diese Abfrage liest **über alle Mandanten**. Der Filter, der sie rettet, ist
`WHERE user_id = $2` (oder ein Arbeitsbereich). Und genau die Spalte, die diesen Filter
trägt, ist heute **nicht** abgesichert: `docs/review/sicherheits-befunde.md` B-S1 weist
nach, daß die Datenbank mandantenfremde Verweise **annimmt** — Row-Level-Security ist auf
allen elf Tabellen aus, und kein Fremdschlüssel führt den Eigentümer mit.

**Was das heißt.** Bei `chats` und `workspaces` ist die fehlende Zusicherung heute eine
**Integritätslücke**: man muß erst eine Abfrage schreiben, die allein über `workspace_id`
zugreift, damit daraus ein Leck wird — und eine solche Abfrage gibt es noch nicht. **Bei
Vektorsuche entsteht sie mit der ersten Abfrage**, weil die Ähnlichkeitssuche die
Einschränkung nicht von selbst mitbringt: sie ist der Zweck der Abfrage. Wer RAG vor B-S1
baut, baut das Leck mit.

**Die kleinste wirksame Form.** Zwei Dinge, beide klein:

1. **Row-Level-Security auf den Mandantentabellen**, mit einer Vorgabe, die **verbietet**
   statt zu erlauben:

   ```sql
   ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
   ALTER TABLE chunks FORCE ROW LEVEL SECURITY;
   CREATE POLICY chunks_eigener_mandant ON chunks
     USING (user_id = current_setting('pmh.user_id', true)::uuid);
   ```

   Wichtig ist `ENABLE` **und** `FORCE`: ohne `FORCE` gilt die Regel nicht für den
   Tabelleneigentümer — und die Anwendung könnte genau der sein.

2. **`user_id` in jeder Vektorabfrage**, und der Index so gebaut, daß er beides trägt. Ein
   `hnsw`-Index allein kennt keine Mandanten; die übliche Form ist ein **Teilindex je
   Mandant** oder ein Vorfilter. Bei vielen Mandanten ist der Teilindex je Mandant die
   ehrliche Wahl — er ist auch der Grund, warum man die Mandantenzahl kennen muß, bevor man
   die Tabellenform festlegt.

### 3.2 Der Nachrichteninhalt ist verschlüsselt — Volltextsuche darüber geht nicht

Gemessen an `messages`: die einzige Inhaltsspalte heißt `content_cipher` und ist **`bytea`**.
Es gibt **keine** Klartextspalte.

Daraus folgt hart: **`tsvector`, `pg_trgm` und `unaccent` können über den Nachrichteninhalt
nichts finden.** Sie indizieren Text; verschlüsselter Text hat keine Wörter. Das ist keine
Einschränkung, die man umgehen kann, ohne die Verschlüsselung aufzugeben.

**Die Folge für den Entwurf** — und sie ist eine **Entscheidung**, keine Selbstverständlichkeit:

* Entweder die Volltextsuche über Gespräche bleibt dort, wo der Kern sie schon hat (er baut
  aus dem JSONL-Ereignisstrom einen **wegwerfbaren** Volltextindex und setzt ihn bei einer
  inkompatiblen Fassung zurück — `dsh-session-query-sqlite`). Dann ist PostgreSQL für
  **Vektoren** zuständig und der Kern für **Volltext**, und die beiden Welten werden über
  die Sitzungskennung verbunden. Das ist die Aufteilung, die der Kern schon vorsieht.
* Oder man indiziert verschlüsselt (Suchindex über verschlüsselte Wörter, „searchable
  encryption"). Das ist ein eigener Forschungsbereich mit eigenen Leaks und **sicher nicht**
  die erste Ausbaustufe.

**Wichtig für RAG:** RAG über **Nachrichten** hieße, den Klartext zum Einbetten zu haben.
Zum Einbetten **muß** entschlüsselt werden. Damit hat der Einbettungsdienst den Klartext —
und die Frage „wer darf einbetten" wird zu einer Sicherheitsfrage, nicht zu einer
Leistungsfrage. Das gehört entschieden, **bevor** die erste Vektorspalte entsteht.

## 4. Obsidian

Zwei Dinge, die nicht verwechselt werden dürfen:

* **Als Dateien.** Ein Obsidian-Vault ist ein Verzeichnis mit Markdown-Dateien und
  Wikilinks. Dafür braucht die Datenbank **nichts**: das Dateisystem ist die Ablage, Git die
  Fassung, `pmh-memory` der Dienst, der liest und schreibt. Heute gibt es diesen Dienst
  nicht (`MAPPING.md` §3.7, `docs/status/arbeitspakete.md`).
* **Als Wissensgraph in der Datenbank.** Dann braucht sie `notes`, `links`, `tags` — und die
  Verweise müssen **strukturiert** liegen, nicht nur als Wikilink im Text. Die Zielliste
  sagt das selbst: „Für eine echte Wissensgraph-Abfrage solltest du die Beziehungen
  zusätzlich strukturiert speichern, statt nur die Obsidian-Links zu zeichnen."

**Und der Konflikt ist im Projekt offen, nicht entschieden.** `docs/vision.md`: „Wenn
Obsidian das Gedächtnis *ist*, liegt es in Dateien… Ob Obsidian das Gedächtnis *ist* oder nur
eine **Ansicht**, ist offen." Dieselbe Offenheit steht in `docs/status/arbeitspakete.md`
(Zeile 446) und `MAPPING.md` (Zeile 145).

**Warum die Frage die Tabellenform bestimmt.** Ist Obsidian das Gedächtnis, ist die Datenbank
ein **Index darüber** — dann sind ihre Zeilen aus den Dateien ableitbar und dürfen jederzeit
verworfen und neu gebaut werden (wie der Volltextindex des Kerns). Ist Obsidian nur eine
Ansicht, ist die Datenbank die **Wahrheit** und die Dateien sind Ausgabe — dann braucht sie
Prüfsummen, Herkunft und eine Regel für Gleichzeitigkeit. Das sind zwei verschiedene Schemata,
und die Migration dazwischen ist teuer. Deshalb: **erst entscheiden, dann migrieren.**

## 5. Was ich als nächstes tun würde — klein und in dieser Reihenfolge

1. **B-S1 schließen** (zusammengesetzte Fremdschlüssel oder RLS). Es ist die Voraussetzung
   dafür, daß RAG überhaupt sicher gebaut werden kann, nicht ein späterer Feinschliff.
2. **Entscheiden**, ob Obsidian das Gedächtnis oder eine Ansicht ist. Eine Zeile in
   `open-questions.md` reicht nicht — es ist eine Architekturentscheidung.
3. **Entscheiden**, ob über Nachrichten eingebettet wird. Fällt das Ja, gehören die
   Zugriffsregeln des Einbettungsdienstes in dieselbe Sitzung wie die Tabellen.
4. **`documents` + `chunks` + Vektorindex** bauen, zusammen mit der Herkunft
   (`sources`) — die Zielliste fordert sie ausdrücklich, und ein Vektor ohne Quelle ist
   nicht belegbar.
5. **Ein Modell je Vektor vermerken** (Name, Fassung, Dimension). Ohne diese drei Angaben
   ist eine Vektorspalte in einem Jahr nicht mehr deutbar.

## 6. Ein veralteter Stand, der korrigiert gehört

`docs/review/stack-aufklaerung.md` Zeile 82 sagt: „**pgvector nicht installiert**, Redis
ungenutzt". Gemessen ist pgvector **0.8.7 installiert und angelegt**. Wer dieser
Bestandsaufnahme glaubt, hält den Vektorweg für versperrt und plant ihn nicht ein. Nach
Hausregel H6 wird korrigiert, indem ein **neuer** Eintrag dazukommt — nicht durch
Überschreiben.
