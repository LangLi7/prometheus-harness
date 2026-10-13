# Befund: unsere Datenbank neben der des Kerns

**Datum:** 13.10.2026 · **Anlaß:** Betreiber-Frage: *„Ist die Datenbank vom
DeepSeek-Harness strukturell quasi die gleiche, außer dem neu Hinzugefügten? Nur
ist es in PostgreSQL, sollte aber trotzdem gleiche Datenbankstruktur und Naming
bekommen."*

**Die Antwort ist nein — und es gibt dabei einen echten Namenskonflikt.** Dieser
Beleg messen den Bestand und schlägt die Zuordnung vor.

---

## 1. Was der Kern **tatsächlich** in SQL hält

Der Kern hat genau **ein** SQL-Schema: `@deepseek-ai/dsh-session-query-sqlite`,
SQLite, `node:sqlite`. Gemessen in
`node_modules/@deepseek-ai/dsh-session-query-sqlite/lib/index.js`:

```sql
CREATE TABLE search_state (
  singleton         INTEGER PRIMARY KEY CHECK (singleton = 1),
  global_generation INTEGER NOT NULL
);

CREATE TABLE persisted_sessions (
  id               TEXT PRIMARY KEY,
  version          INTEGER NOT NULL,
  created_at       INTEGER NOT NULL,
  cwd              TEXT,
  parent_session   TEXT,
  seed_length      INTEGER,
  delegation_depth INTEGER,
  agent_preset     TEXT,
  revision         TEXT NOT NULL,
  generation       INTEGER NOT NULL
);

CREATE VIRTUAL TABLE persisted_docs USING fts5(
  text, session_id UNINDEXED, seq UNINDEXED, type UNINDEXED,
  time UNINDEXED, surface UNINDEXED, codepoint_length UNINDEXED,
  tokenize = 'unicode61'
);
```

Dazu eine temporäre Fassung (`live_sessions`, `temp.live_docs`) für den
laufenden Prozeß.

### Und was dieses Schema **ist** — der entscheidende Punkt

Der Kopf der Typdatei sagt es wörtlich:

> `/** SQLite schema for the disposable session full-text read model. */`

Und:

> `/** Current derived-index schema version. Incompatible versions reset in place. */`
> `/** SQLite application id protecting unrelated databases from derived resets. */`

**Das ist kein Bestand. Das ist ein wegwerfbarer Index** — eine Ableitung aus den
JSONL-Dateien, die die eigentliche Wahrheit sind. Bei einer inkompatiblen Fassung
wird er **an Ort und Stelle zurückgesetzt** und neu gebaut. Es gibt keine
Migrationen, weil es nichts zu migrieren gibt.

**Die dauerhafte Ablage des Kerns ist der JSONL-Ereignisstrom.** `session-persistence`
sagt es ebenso deutlich:

> *„Backends store `SessionEvent`s as the event-sourced log and carry
> non-replayable `SessionHeader` metadata separately."*

---

## 2. Was der Kern an einer Sitzung führt

`SessionHeader` aus `@deepseek-ai/dsh-session` — das ist die Struktur, die eine
Sitzung ausmacht:

| Feld | Typ | Bedeutung |
|---|---|---|
| `version` | `typeof SESSION_FORMAT_VERSION` | Formatfassung |
| `id` | `SessionId` | die Kennung |
| `createdAt` | number | Unix-Epoch **Millisekunden** |
| `cwd?` | string | **absolutes Arbeitsverzeichnis**, kein Arbeitsbereichs-Verweis |
| `parentSession?` | `SessionId` | woraus diese Sitzung hervorging (Saat-Linie) |
| `isSeeded` | boolean | ob ein geerbter Ereignispräfix enthalten ist |
| `origin?` | `'subagent'` | grobe Produktklassifikation |
| `delegationDepth?` | number | Tiefe der Delegation; **dauerhaft**, damit ein Neustart das Rekursionsbudget nicht zurücksetzt |
| `agentPreset?` | string | aus welcher Voreinstellung der Agent zusammengesetzt wurde |

**Was hier fehlt, ist so wichtig wie was dasteht:** es gibt **kein**
`workspace_id`, **kein** `chat_id` und **keine** `user_id`. Der Kern kennt an
einer Sitzung **keinen Benutzer** — Mandantentrennung ist bei ihm keine
Datenbankfrage. Ein Arbeitsbereich ist bei ihm ein **Pfad** (`cwd`), kein
Datensatz.

---

## 3. Was wir haben

Neun Tabellen in zwei Migrationen:

| Tabelle | Wozu |
|---|---|
| `users` | Konten |
| `sessions` | **Anmelde**sitzungen des Browsers |
| `api_keys` | Schlüssel je Benutzer |
| `one_time_tokens` | Einmalmarken |
| `user_secrets` | Umschlagverschlüsseltes |
| `auth_events` | Anmeldeereignisse |
| `workspaces` | Arbeitsbereiche |
| `chats` | Gespräche |
| `messages` | Nachrichten |

### Der Konflikt

Unsere Tabelle `sessions`:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash          text NOT NULL,
  csrf_hash           text NOT NULL,
  ...
  idle_expires_at     timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at          timestamptz,
  ...
);
```

Sie hält **Anmeldungen**: Token-Hash, CSRF-Paar, Leerlauf- und Absolutfirst,
Widerruf.

Der Kern nennt **Agenten-Gespräche** `sessions`.

**Zwei verschiedene Dinge, ein Name.** Und schlimmer: **für die Bedeutung des
Kerns haben wir gar keine Tabelle.** Es gibt bei uns nichts, was `cwd`,
`parent_session`, `delegation_depth`, `agent_preset`, `revision` oder
`is_seeded` trägt.

---

## 4. Die Antwort auf die Frage

**Nein, die Struktur ist nicht dieselbe.** Und der Grund ist nicht Nachlässigkeit,
sondern ein Unterschied in der **Rolle**:

| | Kern | Wir |
|---|---|---|
| Was SQL hält | einen **wegwerfbaren Suchindex** | den **Bestand** |
| Die Wahrheit liegt | im JSONL-Ereignisstrom | in PostgreSQL |
| Bei Schemaänderung | zurücksetzen und neu bauen | **migrieren** |
| Benutzer an einer Sitzung | **nein** | ja (`user_id`) |
| Arbeitsbereich | ein **Pfad** (`cwd`) | ein **Datensatz** |
| Ein Gespräch | `persisted_sessions` + Ereignisse | `chats` + `messages` |

**Die Struktur zu kopieren wäre also falsch.** Der Kern speichert, was er zum
**Suchen** braucht; wir speichern, was wir zum **Betreiben** brauchen. Ein
wegwerfbarer Index hat keine Fremdschlüssel, keine Aufbewahrungsfristen und keine
Mandantenprüfung — weil er jederzeit neu gebaut werden kann.

**Was richtig ist und was fehlt:**

1. **Das Naming muß angeglichen werden, wo beide dieselbe Sache meinen.** Tun sie
   aber fast nirgends.
2. **Der Namenskonflikt muß weg.** Unsere `sessions` sind Anmeldungen; die des
   Kerns sind Gespräche. Wer beide Dokumentationen liest, verwechselt sie.
3. **Für die Sitzung des Kerns fehlt eine Tabelle.** Wenn wir Adapter, Loop und
   Sitzung anschließen — der nächste Schritt —, braucht der Kern eine dauerhafte
   Ablage. Sie muß seine Felder tragen: `cwd`, `parent_session`,
   `delegation_depth`, `agent_preset`, `revision`, `is_seeded`.

---

## 5. Der Vorschlag — eine Zuordnung, keine Kopie

### 5a. Namen angleichen, wo es dieselbe Sache ist

| Uns | Vorschlag | Warum |
|---|---|---|
| `sessions` | **`auth_sessions`** | es sind **Anmeldungen**; der Name `sessions` gehört dem Kern für Gespräche |
| `workspaces` | `workspaces` **bleibt** | der Kern hat diesen Begriff nicht; `cwd` ist ein Pfad, kein Datensatz |
| `chats` | **`chat_sessions`** erwägen | oder bleiben — ein `chat` ist bei uns ein Gespräch **mit** Benutzerbezug, was der Kern nicht kennt |
| `messages` | `messages` **bleibt** | der Kern hält Nachrichten als **Ereignisse** (`SessionEvent`), nicht als Zeilen; die Begriffe decken sich nicht |

### 5b. Die fehlende Tabelle — die Felder des Kerns, in PostgreSQL

```sql
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id                text PRIMARY KEY,           -- SessionId des Kerns (nicht uuid)
  version           integer NOT NULL,           -- SESSION_FORMAT_VERSION
  created_at        timestamptz NOT NULL,       -- aus createdAt (Epoch-Millisekunden)
  cwd               text,                       -- absolutes Arbeitsverzeichnis
  parent_session    text REFERENCES conversation_sessions (id),
  is_seeded         boolean NOT NULL DEFAULT false,
  origin            text,                       -- 'subagent' oder NULL
  delegation_depth  integer,                    -- Absicht: dauerhaft
  agent_preset      text,
  revision          text NOT NULL,
  -- Unsere Zusätze, die der Kern nicht kennt und nicht braucht:
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workspace_id      uuid REFERENCES workspaces (id) ON DELETE SET NULL
);
```

**Warum `text` für die Kennung und nicht `uuid`.** Der Kern hat sein
Kennungsformat; es als UUID zu erzwingen wäre eine Annahme über fremde Daten. Eine
Kennung wird gespeichert, wie sie kommt.

**Warum unsere Zusätze ausdrücklich getrennt stehen.** `user_id` und
`workspace_id` sind **unsere** Anforderung, nicht die des Kerns. Sie in derselben
Tabelle zu führen ist richtig — aber sie als „Teil der Kernstruktur" auszugeben
wäre eine Behauptung, die nicht stimmt.

### 5c. Was **nicht** getan wird

* **Der Suchindex wird nicht nach PostgreSQL übersetzt.** Der Kern baut ihn aus
  JSONL neu; ihn zu duplizieren schüfe zwei Wahrheiten, die auseinandergehen.
  PostgreSQL hat eigene Mittel (`tsvector`, `pg_trgm` — beide liegen bereits im
  Stapel), wenn wir später suchen wollen.
* **Der JSONL-Ereignisstrom bleibt die Ablage der Ereignisse.** Er ist die
  dauerhafte Form des Kerns, und sie zu ersetzen wäre der Anfang eines
  Formatstreits.

---

## 6. Der zweite Abgleich: unsere Ereignisarten gegen die des Kerns

**Auch hier weichen sie ab** — und das ist die Stelle, an der es beim Anschließen
der Kette teuer wird. Beides gemessen:

**Der Kern hat 14 Ereignisarten** (`SessionEventMap` in
`@deepseek-ai/dsh-session/lib/types/types.d.ts`):

```
turn/start      turn/end        step/start      step/end
user/message    developer/message  system/message  assistant/message
assistant/attempt  tool/call     tool/result     request/header
request/context    session/end-seed
```

**Wir haben 9** (`packages/agent/session-format/src/index.ts`):

```
session-start   system-prompt   user-input      turn-start
step-start      model-reply     tool-result     usage
turn-end
```

| Unsere Art | Nächste im Kern | Gleich? |
|---|---|---|
| `session-start` | — (Kopfzeile `SessionHeader`) | **nein** — bei uns ein **Ereignis**, beim Kern **Metadaten** |
| `system-prompt` | `system/message` | **nein** — Kern hat `turn` und `step` |
| `user-input` | `user/message` | **nein** — Kern unterscheidet `source` (Mensch, Einspritzung, Zielrunde) |
| `turn-start` | `turn/start` | ja, bis auf den Namen (`-` gegen `/`) |
| `step-start` | `step/start` | ja, bis auf den Namen |
| `model-reply` | `assistant/message` | **nein** — Kern führt `turn`, `step`, `stream`, `interrupted` |
| `tool-result` | `tool/result` | **nein** — dem Kern fehlt bei uns das **`tool/call`** |
| `usage` | — **eingebettet** | **nein** — beim Kern reist `usage` **in** `assistant/message`; es gibt keinen eigenen Eintrag |
| `turn-end` | `turn/end` | **nein** — Kern führt einen `reason` |
| — | `assistant/attempt` | **fehlt bei uns** |
| — | `developer/message` | **fehlt bei uns** |
| — | `request/header` | **fehlt bei uns** |
| — | `request/context` | **fehlt bei uns** |
| — | `session/end-seed` | **fehlt bei uns** |
| `unknown` | — | **nur bei uns** — der Kern verlangt `ignorable` **oder** Verweigerung |

### Auch die Felder weichen ab

| Gemeint | Kern | Wir |
|---|---|---|
| Zähler | `seq` | `seq` ✓ |
| Zeitpunkt | `time` (Epoch-**Millisekunden**) | `at` |
| Fassung | `version` — **einmal in der Kopfzeile** | `v` — **auf jeder Zeile** |
| Oberflächenänderung | `surfaceOp` (`append` oder `replace` mit `startSeq`/`endSeq`) | **fehlt** |

**Der `surfaceOp` ist der wichtigste fehlende Punkt.** Der Kern kann damit eine
**Verdichtung** aufzeichnen: ein neuer Knoten **ersetzt** einen Bereich
(`startSeq` bis `endSeq`), und die ersetzten Knoten bleiben als Quelle zitiert.
Ohne dieses Feld kann eine Sitzung nicht verdichtet werden, ohne ihre Geschichte
zu verlieren — und Verdichtung ist genau der offene Punkt `P8.11` dieses
Projekts.

---

## 7. Was hier **nicht** belegt ist — ehrlich

1. **Die Änderung ist NICHT umgesetzt.** Dieser Beleg schlägt vor; er ändert
   nichts. Eine Umbenennung von `sessions` berührt Migration, Code und Prüfungen.
2. **`chat_sessions` ist ein Vorschlag, keine Entscheidung.** Ob wir `chats`
   umbenennen, hängt davon ab, ob wir den Begriff des Kerns übernehmen wollen —
   und das ist eine Produktentscheidung, keine technische.
3. **Die Felder des `SessionHeader` sind aus den Typen gelesen, nicht aus einer
   laufenden Sitzung.** Ob eine echte Sitzung alle Felder setzt, ist nicht
   gemessen.
4. **Ob der Kern je auf eine SQL-Ablage umstellt, ist offen.** Sein
   `session-persistence` ist eine Schnittstelle (`SessionHandle`, `create`/`open`);
   ein SQL-Backend wäre daneben möglich. Dann wäre unsere Tabelle eine von zwei.
5. **Die Bedeutung der 14 Ereignisarten ist nur teilweise gelesen.** Die Namen und
   die Zuordnung stehen fest; was `request/context` und `assistant/attempt` im
   Betrieb genau tragen, ist **nicht** untersucht.
6. **Unser Sitzungsformat ist aus den eigenen Typen gelesen, nicht aus einer
   geschriebenen Datei.** Ob eine echte JSONL-Datei noch weitere Felder trägt,
   ist nicht geprüft.
7. **Die Zuordnung ist ein Vorschlag, keine Migration.** Sie sagt, wie die Arten
   einander entsprechen — nicht, wie eine bestehende Datei umgeschrieben wird.
   Unser Format steht auf `v1`; die vier Migrationen der Vorlage fehlen.
