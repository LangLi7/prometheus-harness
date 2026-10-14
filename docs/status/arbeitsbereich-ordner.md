# Ein Arbeitsbereich mit mehreren Quellordnern

Stand: 15.10.2026. Gemessen gegen echte PostgreSQL.

## Warum

Der Betreiber hat eine Vorlage gezeigt: dort hat ein Projekt einen **Primär**ordner und weitere
Quellordner („Ordner hinzufügen"). Unser Schema hatte dafür **einen** Pfad:
`workspaces.root_path`. Mehrere Ordner je Arbeitsbereich waren nicht vorgesehen — „aus
Ordnungsgründen" sollten sie es sein.

## Was jetzt gilt

Neue Tabelle `workspace_folders` (Migration 0009): je Zeile ein Ordner.

| Regel | Wie sie durchgesetzt wird |
|---|---|
| Genau **ein** Primärordner je Arbeitsbereich | Teilindex `workspace_folders_ein_primaer_idx` (`WHERE ist_primaer`) → zweiter primärer Ordner ist ein Verstoß (23505) |
| Derselbe Ordner nicht zweimal **im selben** Arbeitsbereich | `UNIQUE (workspace_id, pfad)` |
| Derselbe Ordner in **zwei** Arbeitsbereichen erlaubt | bewußt **nicht** verboten: zwei Projekte können denselben Ordner betrachten wollen |
| Der Pfad ist absolut | Prüfregel `^([A-Za-z]:[\\/]|/)` |
| Kein Aufstieg im Pfad | `position('..' in pfad) = 0` |
| Ein Ordner hängt nie am fremden Mandanten | zusammengesetzter Verweis `(workspace_id, user_id) → workspaces (id, user_id)` |
| Mit dem Arbeitsbereich verschwinden seine Ordner | `ON DELETE CASCADE` |
| Die Trennung ist **laut** | RLS mit `current_setting('pmh.user_id')::uuid` — ohne `missing_ok` (42704 statt still 0 Zeilen) |

## Der Umzug — und die alte Spalte ist weg

`workspaces.root_path` wird **umgezogen** und dann **entfernt**: jeder vorhandene Pfad wird der
Primärordner seines Arbeitsbereichs. Zwei Orte für denselben Pfad wären zwei Wahrheiten.

**Gemessen** (Fassung 8 → 9, reproduzierbar: die Migrationsdateien 0001–0008 einzeln, dann ein
Arbeitsbereich mit Pfad, dann 0009):

```
vorher:   pmh.workspaces.root_path = 'D:\Umzug\Ordner'
nachher:  pmh.workspace_folders → 1 Zeile, pfad = 'D:\Umzug\Ordner', ist_primaer = t
          Spalten namens root_path in workspaces: 0
```

In den vorhandenen Datenbanken bewegte der Umzug **nichts**: alle drei Arbeitsbereiche hatten
einen **leeren** `root_path` (gemessen vorher in `pmh` und `pmh_test`).

## Zahlen

| Was | Ergebnis |
|---|---|
| Neue Prüfungen (`arbeitsbereich-ordner.test.ts`) | **11 pass, 0 fail** |
| Schemaprüfungen (`postgres.test.ts`) | **16 pass, 0 fail** |
| Sitzungsprotokoll (`sitzungsprotokoll.test.ts`) | **8 pass, 0 fail** |
| Typlauf | **27 Pakete grün, 0 rot** |
| Fassung aller Datenbanken | **9** |

## Ein zweiter Fund: die Rechte fehlen auf einem frischen Stapel

Beim ersten Lauf gegen eine von Hand angelegte Datenbank: **42501** (`permission denied for table
workspace_folders`). Zwei Ursachen, beide gemessen:

- Die **Tabelle** hatte keine Rechte — weil `ALTER DEFAULT PRIVILEGES` **je Datenbank** gilt und
  eine von Hand angelegte Datenbank sie nie bekommen hat. Migration 0009 setzt sie deshalb
  **ausdrücklich** (kostet nichts, wo sie schon gelten).
- Das **Schema** hatte kein `USAGE` (`has_schema_privilege('pmh_app','pmh','USAGE')` → **f**).
  Das gehört zur Installation (`docker/postgres-init/02-roles.sh`) und wird **nicht** in einer
  Migration nachgeholt: eine Migration, die die Installation ersetzt, verdeckt genau die Lücke,
  die man sehen soll.

Damit sind es **drei** Dinge, die einem frischen Stapel fehlen: das Schema `pmh`, die
Erweiterung `vector`, die Rechte (Schema-`USAGE` und Vorgaberechte). Siehe
`pruefstand-und-frische-stapel.md`.

## Was offen ist

- **Die Anwendung benutzt die Tabelle noch nicht.** Der Rechner führt weiter **einen**
  Arbeitsbereichspfad; die Oberfläche zeigt weiter den einen Ordner aus der Vorlage. Das Modell
  steht, der Anschluss fehlt.
- **Keine Bezeichnung je Ordner in der Oberfläche** — die Spalte `bezeichnung` gibt es, benutzt
  wird sie nicht.
- Der zweite und dritte Riegel (`store-postgres`, `einmaltoken`, `auth-http`) vergleichen weiter
  nur mit der Umgebung — siehe `unfall-betriebsdatenbank.md`.
