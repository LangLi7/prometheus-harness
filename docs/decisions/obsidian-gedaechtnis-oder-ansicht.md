# Obsidian: Gedächtnis oder Ansicht? — die Entscheidung, die vor dem Schema fällt

> **Stand:** 13.10.2026 · **Paket:** D2 · **Status:** Entscheidungsvorlage.
> Der Auftrag sagt zu D2: *„erst entscheiden: ist Obsidian das Gedächtnis oder eine
> Ansicht"* — und die Reihenfolge ist kein Formalismus: **davon hängt jede Spalte ab.**
>
> **Gemessener Ausgangspunkt** (`docs/review/rag-und-obsidian-bereitschaft.md`,
> nachgezählt am 13.10.2026): `pgvector 0.8.7` installiert, **0** Vektorspalten,
> **0** `tsvector`, **0** GIN-/trgm-Indizes, **0** RLS-Richtlinien, **12** Tabellen
> im Schema `pmh` — und **keine** Tabelle `notes`, `vaults`, `tags` oder `links`.
> **0 Treffer** für `obsidian` im Anwendungscode.

---

## 1. Warum die Frage überhaupt eine ist

„Obsidian anbinden" klingt nach einer Aufgabe. Es sind **zwei**, und sie schließen
einander aus:

| | **A: Obsidian IST das Gedächtnis** | **B: Obsidian ist eine ANSICHT** |
|---|---|---|
| Wo die Notizen liegen | im **Vault** des Benutzers: `.md`-Dateien auf der Platte, `[[Verweise]]`, Ordner | in **unserer** Datenbank: `notes`, `tags`, `links` mit Mandantenspalte |
| Wer die Wahrheit hat | das Dateisystem | die Datenbank |
| Was wir bauen | einen **Leser und Schreiber** über dem Vault-Verzeichnis | ein **Schema** und einen **Abgleich** mit dem Vault |
| Wo die Suche läuft | über Dateien (und einen eigenen Index) | über die Datenbank (Vektor **und** Volltext) |
| Der Vault ist … | die Speicherung | ein **Austauschformat** und ein Arbeitsplatz des Menschen |

**Der Unterschied, der alles entscheidet:** Wem gehört eine Notiz, wenn beide Seiten
sie ändern können? Bei **A** ist die Antwort einfach (dem Vault) und der Preis hoch:
jede Suche, jede Verknüpfung, jede Rechteprüfung geht über das **Dateisystem** — und
damit an der Mandantentrennung **vorbei**, die seit Migration 0004 in der Datenbank
sitzt. Bei **B** ist es umgekehrt: die Datenbank kann filtern und indizieren, aber
der Vault kann von außen geändert werden und muß **abgeglichen** werden — und ein
Abgleich braucht eine Regel für „beide Seiten haben geändert".

---

## 2. Was die Zahlen dazu sagen — und was sie ausschließen

**Gemessen ist:** es gibt **keine** Tabelle für Notizen. Der Vault eines Benutzers
ist heute ein Verzeichnis auf der Platte, und unsere Datenbank weiß nichts davon.
Es gibt **keinen** Code, der `obsidian` erwähnt.

**Ebenso gemessen und wichtiger:** die Datenbank hat **0 Vektorspalten** — aber seit
Migration `0006` **doch** einen Wissensspeicher (`documents`, `chunks`), und der
trägt den Mandanten **von Anfang an**. Die Frage ist damit nicht mehr „ob", sondern
**„in welche Richtung"**: Sind Notizen **Dokumente** in diesem Speicher (Richtung B),
oder ist der Vault die Quelle, aus der wir **hineinlesen** (Richtung A mit B als
Ableitung)?

### Die drei Bedingungen, die jede Antwort erfüllen muß

1. **Mandantentrennung.** Ein Vault gehört **einem** Benutzer. Wenn die Notizen nur
   auf der Platte liegen, gibt es keine Datenbankzeile, an der ein zusammengesetzter
   Fremdschlüssel greifen könnte — die Trennung wäre dann eine Sache der
   **Pfadprüfung**. Die haben wir (`packages/auth/permissions`, 30 Prüfungen), aber
   sie wirkt **pro Anfrage**, nicht **in der Struktur**.
2. **Zwei Kopien desselben Inhalts sind ein Befund, kein Zustand.** Genau das ist
   B-L5 bei `messages`: `content_cipher` verschlüsselt in der Datenbank, derselbe
   Text im Klartext im JSONL-Ereignisstrom. Ein Vault **und** eine Tabelle mit
   demselben Text sind **dieselbe** Doppelung — nur diesmal mit Absicht.
3. **Obsidian ist ein Fremdformat.** `.md` mit `[[Verweisen]]`, Frontmatter,
   Anhängen. Wer es einliest, muß sagen, was er **verliert**: Obsidian-Erweiterungen,
   Plugins, Canvas-Dateien, Anhänge.

---

## 3. Die Empfehlung: **B mit A als Quelle** — und warum

**Der Vault bleibt der Arbeitsplatz des Menschen. Die Datenbank wird das Gedächtnis
des Agenten.** Konkret:

```
   Vault (Dateien, [[Verweise]])  ──einlesen──▶  documents/chunks  ──▶  Suche
        des Menschen                                  das Gedächtnis
              ▲                                                                │
              └──────────────  zurückschreiben?  NUR auf Ansage  ◀────────────┘
```

**Warum nicht A (Vault als Gedächtnis).** Ein Agent, der über das Dateisystem sucht,
umgeht jede Struktur, die wir gebaut haben: keine Mandantenspalte, kein
zusammengesetzter Fremdschlüssel, keine Vektorsuche über `chunks`. Die Vektorsuche
ist genau die Funktion, um die es bei RAG geht — und sie lebt in der Datenbank.

**Warum nicht reines B.** Wer die Notizen **nur** in die Datenbank kopiert, nimmt dem
Menschen sein Werkzeug. Obsidian ist ein guter Editor mit Verweisen; ihn zu ersetzen
ist nicht der Auftrag.

**Was daraus folgt — die vier Sätze, die das Schema bestimmen:**

1. Es gibt **`vaults`** (ein Verzeichnispfad je Benutzer) und **`notes`** (eine
   Notiz je Datei) — beide mit `user_id NOT NULL` und zusammengesetzten Verweisen,
   wie `documents`/`chunks` seit 0006.
2. Eine Notiz **verweist** auf ein Dokument im Wissensspeicher (`documents`, `kind =
   'notiz'`) — **nicht** umgekehrt. Der Wissensspeicher bleibt die eine Stelle, an
   der Textstücke und Vektoren liegen; die Notiztabelle trägt die
   **Obsidian-Eigenschaften** (Pfad, Verweise, Etiketten).
3. **Der Klartext steht genau einmal** — in `chunks.content_cipher`, verschlüsselt.
   Die Notiztabelle trägt **keinen** Text. Damit gibt es keine zweite Kopie, und der
   Vault bleibt die Kopie **außerhalb** unserer Verantwortung.
4. **Links werden zu Zeilen** (`links` von Notiz zu Notiz), damit „was hängt
   zusammen?" eine Abfrage ist und keine Dateisuche — und damit der Agent dem
   Verweisnetz folgen kann.

### Was diese Empfehlung **kostet** — offen benannt

* **Ein Abgleich ist nötig** und er ist die schwerste Stelle: der Vault ändert sich
  außerhalb unseres Zugriffs (der Mensch tippt). Es braucht eine Regel „geändert
  seit wann" (`content_hash` haben wir in `documents`) und eine Entscheidung, was
  **Löschen** heißt: eine Datei ist weg — ist die Notiz weg, oder nur „nicht mehr
  gefunden"?
* **Zurückschreiben ist eine eigene Entscheidung.** Ein Agent, der in den Vault
  schreibt, kann das Werk eines Menschen überschreiben. Vorschlag: **nur auf Ansage**
  und nur als **neue** Datei oder mit ausdrücklichem Ziel — nicht als stiller Abgleich.
* **Obsidian-Erweiterungen gehen verloren** beim Einlesen. Was nicht aus `.md`
  hervorgeht (Canvas, Plugins), ist nicht dabei — und wird es auch nicht.

---

## 4. Die Alternative, die ich verwerfe — und warum

**„Wir lesen den Vault bei jeder Suche neu ein."** Das klingt einfacher (kein
Abgleich, kein Schema) und ist es nicht:

* Die Suche würde **Dateien** durchsuchen, nicht Vektoren — also genau die Funktion
  nicht nutzen, um die es bei D1 geht.
* Die Mandantentrennung hinge an einer **Pfadprüfung je Anfrage** statt an der
  Struktur. Eine vergessene Prüfung wäre ein Leck, und sie wäre **unsichtbar** — die
  Datenbank könnte es nicht verhindern.
* Ein Vault mit 10 000 Notizen wäre bei jeder Suche neu zu lesen.

**Und die Gegenprobe zum eigenen Vorschlag:** Wenn sich zeigt, daß der Abgleich
teurer ist als der Nutzen — etwa weil der Vault sich ständig ändert —, dann ist die
richtige Antwort **nicht** „dann eben A", sondern: **nur lesen, wenn der Mensch es
sagt** (eine Ansicht, die man ausdrücklich lädt). Das ist ein Sonderfall von B, kein
anderer Entwurf.

---

## 5. Was als nächstes zu bauen ist — in dieser Reihenfolge

| Schritt | Was | Vorbedingung |
|---|---|---|
| 1 | **Diese Entscheidung** dem Betreiber vorlegen | — |
| 2 | Migration `0007`: `vaults`, `notes`, `note_tags`, `tags`, `links` — **mit** `user_id` und zusammengesetzten Verweisen, dem Muster aus 0006 | Entscheidung oben |
| 3 | Eine Probe wie `wissensspeicher.sql`: ein Übergriff auf einen fremden Vault wird abgelehnt, **und** der eigene Fall geht durch | 2 |
| 4 | Der **Einleser**: Vault-Verzeichnis → `documents` (`kind='notiz'`) → `chunks`. Braucht die **Pfadprüfung** aus `packages/auth/permissions` und die Mandantenspalte | 2, 3 |
| 5 | Der **Abgleich**: `content_hash` vergleichen, Änderungen erkennen, Löschungen behandeln | 4 |
| 6 | **Erst dann** die Suche über Notizen — sie ist dann die Suche über `chunks`, mit Mandantenfilter | 4 |

**Und die eine Frage, die Schritt 4 blockiert:** Ein Vault ist ein **Pfad** auf der
Platte. Nach welcher Regel wird entschieden, **welcher** Benutzer welchen Pfad
bekommt? Das ist keine technische Frage — sie ist dieselbe wie bei der Isolation
(`user_profiles`): der Administrator legt sie fest, oder der Benutzer zeigt auf sein
eigenes Verzeichnis. **Ohne diese Regel darf Schritt 4 nicht beginnen** — ein
Einleser, der den Pfad aus einer Anfrage nimmt, ist ein Einleser für **alle** Dateien.

---

## 6. Nachfahren

```powershell
# Was ist heute da? (nur lesend)
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc "SELECT 'tabellen=' || count(*) FROM information_schema.tables WHERE table_schema='pmh';"
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc "SELECT 'notiztabellen=' || count(*) FROM information_schema.tables WHERE table_schema='pmh' AND table_name IN ('notes','vaults','tags','links');"
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc "SELECT 'vektorspalten=' || count(*) FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid WHERE t.typname='vector' AND a.attnum>0;"

# Der Wissensspeicher, auf dem die Empfehlung aufsetzt
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc "SELECT table_name FROM information_schema.tables WHERE table_schema='pmh' AND table_name IN ('documents','chunks');"
```
