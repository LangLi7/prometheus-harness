# Obsidian-Schema — Migration 0007: der Vault trägt den Mandanten

> **Stand:** 13.10.2026 · **Migration:** `0007_obsidian.sql` (Fassung 6 → **7**) ·
> **Probe:** `tests/proben/obsidian.sql` — **11 Fälle, alle wie erwartet, exit 0**
> · **Entscheidung:** `docs/decisions/obsidian-gedaechtnis-oder-ansicht.md`
>
> **Der eine Satz:** Diese Migration **entscheidet nicht**, wer gewinnt — sie macht
> es entscheidbar. Sie trägt, was ein Abgleich in **beide** Richtungen braucht.

---

## 1. Was gebaut wurde

| Tabelle | Was sie trägt |
|---|---|
| `vaults` | ein Verzeichnis je Benutzer (`pfad`, `name`, `zuletzt_gesehen_am`) |
| `notes` | eine Notiz je **Datei** (`pfad` **relativ**, `titel`, `content_hash`, `mtime`, `gelesen_am`, `document_id`) |
| `tags`, `note_tags` | Etiketten je Benutzer, einmal je Name |
| `links` | Verweise: **roher** Text (`[[Ziel]]` → `Ziel`) **und** aufgelöstes Ziel |

**`notes` trägt `content_hash` und `mtime`** — die zwei Angaben, die ein Abgleich
braucht, egal in welche Richtung er läuft. **`mtime`** ist die einzige Angabe, die
eine Änderung **außerhalb** unserer Zugriffe verrät (der Mensch tippt in seinen
Editor); `gelesen_am` ist unsere Seite. `mtime > gelesen_am` heißt: seitdem geändert.

**`notes.document_id` zeigt in den Wissensspeicher (0006).** Die Notiz **verweist**
auf ein Dokument — nicht umgekehrt: Text und Vektoren liegen an **einer** Stelle, und
das ist `chunks`. Damit gibt es keine zweite Kopie des Inhalts (Befund B-L5).

**`links` speichert den rohen Text auch dann, wenn das Ziel fehlt.** In Obsidian ist
ein Verweis auf eine noch nicht geschriebene Notiz völlig normal. `ziel_note_id IS
NULL` heißt ausdrücklich *noch nicht geschrieben* und nicht *Verweis kaputt*.

### Der Mandant, wie in 0006

Alle fünf Tabellen tragen `user_id NOT NULL`, jeder Verweis ist **zusammengesetzt**
über `(…, user_id)` — **6** zusammengesetzte Fremdschlüssel. Und dieselbe Grenze wie
dort: das verhindert Übergriffe beim **Schreiben**, nicht beim **Lesen**.

**Zwei Bedingungen, die nur hier stehen:**

```sql
CONSTRAINT vaults_pfad_ohne_aufstieg CHECK (position('..' in pfad) = 0)
CONSTRAINT vaults_pfad_absolut       CHECK (pfad ~ '^([A-Za-z]:[\\/]|/)')
```

Ein Vault-Pfad mit `..` ist kein Pfad, sondern ein **Ausbruchsversuch**; ein
relativer Pfad ist keine Angabe, sondern eine Frage („relativ wozu?"). Beides wird
von der **Datenbank** abgewiesen und nicht erst vom Anwendungscode.

---

## 2. Die Probe: 11 Fälle

```
Gesendet:  Get-Content …/obsidian.sql -Raw | docker exec -i pmh-postgres psql -U pmh_admin -d pmh_test -v ON_ERROR_STOP=1
Ergebnis:  NOTICE: PROBE BESTANDEN: alle 11 Faelle wie erwartet        exit 0
```

```
L1  Notiz von A im EIGENEN Vault                      | angenommen                | ok
L2  Notiz von A im Vault von B                        | 23503                     | ok
L3  derselbe Pfad zweimal im Vault                    | 23505                     | ok
L4  Vault-Pfad mit Aufstieg (..)                      | 23514                     | ok
L5  relativer Vault-Pfad                              | 23514                     | ok
L6  Verweis von A auf die Notiz von B                 | 23503                     | ok
L7  Verweis auf eine ungeschriebene Notiz             | angenommen                | ok
L8  dasselbe Etikett zweimal                          | 23505                     | ok
L8b Etikett an die eigene Notiz                       | angenommen                | ok
L9  Ziel geloescht: ziel_note_id leer, user_id NICHT  | 1 -> 0 und Mandant bleibt | ok
L10 Notiz loeschen nimmt Verweise und Etiketten mit   | vorher >= 1, nachher 0    | ok
```

**L9 prüft den Fallstrick aus Migration 0004 an einer zweiten Tabelle:**
`ON DELETE SET NULL (ziel_note_id)` darf **nur** die eine Spalte leeren. Ohne die
Spaltenliste leerte PostgreSQL auch `user_id` — und die ist `NOT NULL`, die
Löschung schlüge fehl. Gemessen: `1 -> 0 und Mandant bleibt`.

---

## 3. Zwei eigene Fehler — beide in der Probe, beide lehrreich

| Fehler | Wie er auffiel |
|---|---|
| **L9 war falsch gebaut: mandantenübergreifend.** Ich legte einen Verweis von B's Notiz auf A's Notiz — und bekam `links_ziel_note_user_fkey`. Das Schema hat **richtig** abgelehnt; der Fallstrick aus 0004 läßt sich nur **innerhalb** eines Mandanten messen. Jetzt: A's zweite Notiz verweist auf A's erste | die Probe, **exit 3** |
| **L10 war LEER.** Er meldete „Verweise 0 -> 0" und galt als bestanden: B's Notiz hatte gar keine ausgehenden Verweise, und ob es je ein Etikett gab, wurde nicht gemessen. **Ein Fall, der 0 gegen 0 prüft, ist keine Prüfung.** Jetzt werden die Zahlen **vorher** gemessen und müssen **mindestens 1** sein — die Vorbedingung steckt **im Urteil**, sonst wäre der Fall wieder leer | beim Lesen der Ausgabe, **nicht** durch einen Fehlschlag |

**Und ein dritter, der beinahe in die Migration gegangen wäre:** in meinem
Kommentarkopf begann eine Zeile mit `;` statt mit `--`. Damit stand dort **SQL-Code**
statt eines Kommentars — `;` beendet eine Anweisung, das folgende `*` ist ein
Syntaxfehler. Die Migration wäre gescheitert, und die Ursache hätte wie ein Fehler in
einer Anweisung zwanzig Zeilen weiter unten ausgesehen. Gefunden beim Durchlesen vor
dem ersten Lauf.

---

## 4. Was gemessen ist

| Messung | Befehl | Wert |
|---|---|---|
| Schemafassung | `SELECT max(version) FROM pmh.schema_migrations` | 6 → **7** |
| Migration angewendet | `bun scripts/migrate.mjs` (auf `pmh_test`) | *„Schema aktualisiert: 1 Migration(en) (7) — jetzt Fassung 7."* — exit **0** |
| Prüfabfrage der Migration | dieselbe Abfrage in `psql` | `tabellen=5  zusammengesetzte_fremdschluessel=6` |
| Probe | `… obsidian.sql \| docker exec -i … psql -v ON_ERROR_STOP=1` | **11/11**, exit **0**; bei einem falschen Fall exit **3** |
| `db-schema` allein | `bun test packages/auth/db-schema` | **38 pass, 0 fail** |
| Typprüfung | `bun scripts/typecheck.mjs` | **25 Pakete grün, 0 rot** |
| Voller Lauf | `bun test` | **1195 pass, 2 fail** in 49 Dateien — die zwei roten sind die bekannten fremden (`atomic-write`, `apps/cli`) |

Nachgezogen, weil festgenagelt: `ERWARTETE_SCHEMAFASSUNG` 6 → **7** (sonst meldet die
Bereitschaftssonde eine **gesunde** Datenbank als nicht bereit), die Migrationsliste
1–7, die Tabellenliste und die Zählung („dreizehn" → **„achtzehn"**).

---

## 5. Was **nicht** da ist — und warum

| Offen | Warum |
|---|---|
| **Kein Einleser.** Kein Code liest einen Vault, keine Zeile dieser Tabellen wird geschrieben | **die Regel fehlt, nach welcher ein Benutzer welchen Pfad bekommt.** Ohne sie wäre ein Einleser einer für **alle** Dateien. Sie steht als offene Frage in der Entscheidung — und sie ist keine technische Frage, sondern dieselbe wie bei `user_profiles` |
| **Kein Abgleich** (neu / geändert / gelöscht) | braucht den Einleser |
| **Kein Zurückschreiben** | der Agent könnte das Werk eines Menschen überschreiben. Vorschlag in der Entscheidung: nur auf Ansage |
| **Keine Volltextsuche über Notizen** | derselbe offene Punkt wie bei `messages`: `content_cipher` ist `bytea`, darüber findet `tsvector` nichts (B-S3) — und ein Klartext daneben wäre die zweite Kopie (B-L5) |
| **`notes.document_id` wird von nichts gefüllt** | der Einleser füllt es |
| **Die Richtungsentscheidung selbst** | liegt beim Betreiber: ist der Vault das Gedächtnis (A) oder eine Ansicht (B)? Das Schema trägt beide; **die Empfehlung** ist B mit A als Quelle |

---

## 6. Nachfahren

```powershell
$map = @{}; foreach ($l in (Get-Content .env)) { if ($l -match '^\s*([A-Za-z_]\w*)\s*=') { $k,$v = $l -split '=',2; $map[$k.Trim()] = $v.Trim() } }
$env:MIGRATION_DATABASE_URL = $map['MIGRATION_DATABASE_URL'] -replace '/pmh(\?|$)','/pmh_test$1'

& 'C:\Users\Chang\.bun\bin\bun.exe' scripts/migrate.mjs

Get-Content packages/auth/db-schema/tests/proben/obsidian.sql -Raw |
  docker exec -i pmh-postgres psql -U pmh_admin -d pmh_test -v ON_ERROR_STOP=1
```
