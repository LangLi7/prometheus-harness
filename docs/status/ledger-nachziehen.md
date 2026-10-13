# Was sich seit dem Ledger geändert hat — und ein Fund, der wichtiger ist

> **Stand:** 13.10.2026 · **Anlaß:** Der Audit-Ledger (`.pmh-build/security-audit/run-1/`)
> entstand **14:40** und steht auf der damaligen Lage. Ein Vollaudit ohne Nachziehen
> würde **behobene** Befunde erneut jagen.
>
> **Und beim Messen fiel etwas auf, das nichts mit dem Audit zu tun hat** (§2) — und
> das dringender ist.

---

## 1. Was seit 14:40 geschehen ist — gemessen

```
git log --since='2026-10-13 14:40' --oneline | Measure-Object   → 84 Commits
```

**Sieben Migrationen** liegen jetzt im Baum, **drei** davon gab es damals nicht:

| Fassung | Datei | Stand 14:40 |
|---|---|---|
| 0001–0003 | identitaet · workspaces/chats · sitzungen | vorhanden |
| **0004** | mandantentrennung-an-fremdschluesseln | **B-S1 geschlossen** — der Ledger führt B-S1 noch als *„already evidenced, excluded from hunting"* |
| **0005** | benutzerprofile-isolation-je-benutzer | neu |
| **0006** | wissensspeicher-dokumente-und-textstuecke | neu |
| **0007** | obsidian-vaults-notizen-etiketten-verweise | neu |

**Was das für den Audit heißt:**

1. **B-S1 ist kein „bereits belegter, ausgenommener" Befund mehr, sondern ein
   BEHOBENER.** Die Strukturseite ist geschlossen: **4** zusammengesetzte
   Fremdschlüssel (gemessen), ein Übergriff wird mit `23503` abgewiesen (Probe
   `tests/proben/mandantentrennung.sql`, 4 von 4 + 2 Löschfälle).
2. **Die Verhaltensseite ist NICHT geschlossen** — und das ist der Teil, den ein
   Audit weiter jagen **muß**: `policies=0`, `tabellen_mit_rls=0` (gemessen, §2).
   Wer B-S1 pauschal ausnimmt, nimmt **zu viel** aus.
3. **Drei neue Tabellengruppen** sind zu prüfen, die es damals nicht gab:
   `documents`/`chunks` (0006) und `vaults`/`notes`/`tags`/`note_tags`/`links`
   (0007) — jede mit Mandantenspalte und zusammengesetzten Verweisen, jede mit
   eigener Probe.
4. **Neue Angriffsflächen** seit 14:40: die Anmeldeseite aus eigenem Host
   (`/pmh/anmelden`), die vier Wege unter `/api/pmh/auth/…`, `scripts/reset.mjs`,
   `scripts/apischluessel.mjs`, `scripts/verlauf-reset.mjs`, `.githooks/pre-commit`.

**Der Ledger gehört also nachgezogen, bevor gejagt wird** — sonst jagt der Lauf
Altlasten und übersieht die drei neuen Tabellengruppen.

---

## 2. Der Fund, der dringender ist: **die Betriebsdatenbank läuft zwei Fassungen hinterher**

Gemessen in **`pmh`** (der Betriebsdatenbank, nicht der Wegwerf-Datenbank):

```
fassung=5   tabellen=12
```

Gemessen in **`pmh_test`**: `fassung=7`.

**Die Migrationen 0006 und 0007 wurden nur gegen die Wegwerf-Datenbank angewendet.**
In der Betriebsdatenbank fehlen damit:

| Fehlt in `pmh` | Was daran hängt |
|---|---|
| `documents`, `chunks` (0006) | der ganze Wissensspeicher — die Suche findet **nichts**, weil die Tabellen nicht existieren |
| `vaults`, `notes`, `tags`, `note_tags`, `links` (0007) | das Obsidian-Schema |
| die Spalte `chunks.embedding` samt HNSW-Index | die Vektorsuche |

### Und die Folge, die sofort sichtbar wird

`packages/api/readiness/src/index.ts` trägt `ERWARTETE_SCHEMAFASSUNG = 7` — mit der
Begründung, die dort steht: *„Eine Abschrift veraltet aber still: sie bleibt grün und
meldet trotzdem Unsinn."* Der Fall, den der Kommentar beschreibt, ist der **umgekehrte**
von damals (0003: Sonde zu alt, Datenbank gesund). Jetzt ist die **Datenbank zu alt**:

> Eine **gesunde** Betriebsdatenbank meldet über `/api/ready` **nicht bereit** —
> und das ist **korrekt**: die Migration fehlt wirklich.

**Der Zustand ist also nicht falsch gemeldet, sondern falsch.** Die Prüfung gehört
ausgeführt, bevor der Host gegen die Betriebsdatenbank läuft.

### Was das kostet — und warum ich es nicht getan habe

```
$env:MIGRATION_DATABASE_URL = <die Betriebsdatenbank>     # NICHT pmh_test
bun scripts/migrate.mjs
```

Das ist **eine Änderung an der Betriebsdatenbank des Betreibers** — sie legt sieben
Tabellen, zwei Indizes und ein Dutzend Nebenbedingungen an. Sie ist **rückwärts
verträglich** (nur `CREATE`, kein `DROP`, kein `ALTER` an bestehenden Spalten — die
Migrationen 0006/0007 legen ausschließlich Neues an), aber sie ist **seine**
Entscheidung. **Ich habe sie nicht ausgeführt.**

**Und die Vorbedingung, die dabei zu prüfen ist:** die Erweiterung `vector` liegt in
`pmh` vor (gemessen: `vector 0.8.7`), in `pmh_test` **fehlte** sie und mußte
nachgelegt werden (§4 in `wissensspeicher-d1.md`). Vor dem Nachziehen gehört geprüft,
daß sie in `pmh` noch da ist — sonst bricht die Migration mit einem Hinweis ab (was
sie soll).

---

## 3. Was ich als nächstes ohne Entscheidung tun kann

| Schritt | Was | Warum zuerst |
|---|---|---|
| 1 | **Den Ledger nachziehen**: B-S1 von „ausgenommen" auf „Struktur behoben, Verhalten offen" umstellen, die drei neuen Tabellengruppen als Einheiten aufnehmen | sonst jagt der Lauf Altlasten und übersieht Neues |
| 2 | Die **neuen Angriffsflächen** aus §1.1 in die `starting_paths` aufnehmen | sie sind seit 14:40 entstanden |
| 3 | **Dann** den Vollaudit starten — mit dem Validator unter WSL | braucht eine Aufwandsentscheidung des Betreibers |

**Was eine Entscheidung braucht:** ob die Betriebsdatenbank nachgezogen wird (§2) —
und wann der Vollaudit läuft.

---

## 4. Nachfahren

```powershell
cd C:\Users\Chang\prometheus-harness

# Was ist seit dem Ledger geschehen?
git log --since='2026-10-13 14:40' --oneline | Measure-Object

# Steht die Betriebsdatenbank hinten?
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc "SELECT max(version) FROM pmh.schema_migrations;"
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='pmh';"

# Und was erwartet die Sonde?
Select-String -Path packages/api/readiness/src/index.ts -Pattern 'ERWARTETE_SCHEMAFASSUNG'

# Der Zustand der Mandantentrennung (Struktur ja, Verhalten nein)
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc "SELECT count(*) FROM pg_constraint WHERE connamespace='pmh'::regnamespace AND contype='f' AND array_length(conkey,1) > 1;"
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='pmh';"
```
