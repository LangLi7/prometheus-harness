# Entscheidungen des Betreibers (13.10.2026) — und was sie ändern

> **Quelle:** Weisung des Betreibers, wörtlich zusammengefasst und gegen den
> Bestand geprüft. **Diese Datei ändert nichts** — sie hält fest, was gilt, damit
> die nächste Sitzung nicht wieder anders anfängt.

## 1. Die Reihenfolge wird korrigiert: Kette zuerst

| | vorher (mein Vorschlag) | **jetzt gültig** |
|---|---|---|
| 1 | Login/Postgres/Redis, dann eigener API-Weg | **Kleinste Kette: Adapter → Agent-Loop → Session** |
| 2 | — | **Erst dann** Login, Postgres und Redis |
| 3 | — | E2E/Mandantentrennung als **eigene** Entscheidung davor |

**Die Begründung des Betreibers, und sie ist zwingend:** *„Ohne laufenden Kern
gibt es nichts, was man absichern oder skalieren könnte."*

**Was das praktisch heißt.** Die Auth-Arbeit ist **nicht verloren** — sie ist
gebaut, getestet (108 + 36 Tests) und liegt im Repository. Sie ist nur **nicht
mehr der nächste Schritt**. Der nächste Schritt ist die Kette, die seit dem
Nachweis `kleinste-kette-nachweis.md` **gebaut, getestet und nicht verdrahtet**
ist. Genau das steht auch dort schon als offener Punkt P8.13 — der Betreiber hat
ihn jetzt zur Priorität erklärt.

**Was ich daraus für meine eigene Arbeit ableite:** ich habe die Reihenfolge
zweimal gedreht (erst „Kette verdrahten", dann „API zuerst", dann „Auth zuerst")
und jedes Mal mit einem guten Einzelargument. Das war der Fehler: ein Argument
pro Schritt ist kein Plan. Der Plan kommt vom Betreiber, und er lautet **Kette
zuerst**.

## 2. „P2P-Verschlüsselung" war der falsche Begriff — es ist Mandantentrennung

**Der Widerspruch, den der Betreiber benannt hat, und er ist echt:**

> *„Der Harness muss den Chat-Klartext an das LLM schicken. Bei
> Ende-zu-Ende-Verschlüsselung geht das nur, wenn der Client entschlüsselt und
> selbst ans LLM sendet. Serverseitige Suche, Caching und Subagents fallen dann
> weg."*

**Das ist zwingend.** Ein Agent, der den Klartext **nicht** sieht, kann keine
Werkzeuge ausführen, keinen Kontext verdichten, keine Zusammenfassung bilden und
keine Subagenten starten — jede dieser Fähigkeiten braucht den Text. **E2E und
Agent schließen sich aus.** Das ist keine Abwägung, sondern eine Folgerung.

**Die richtige Bezeichnung für das Gewünschte ist Mandantentrennung.** Was
gefordert ist: *kein Benutzer kann Chats, Verläufe oder Dateien eines anderen
lesen* — **nicht**: *niemand außer dem Benutzer kann sie lesen*.

| | Mandantentrennung (gewollt) | Ende-zu-Ende (nicht gewollt) |
|---|---|---|
| Server sieht Klartext | **ja** — muss er, für den Agenten | nein |
| Werkzeuge, Subagenten, Verdichtung | **möglich** | unmöglich |
| Serverseitige Suche | **möglich** | unmöglich (GIN über `tsvector` braucht Klartext) |
| Schutz gegen einen neugierigen Betreiber | nein | ja |
| Schutz gegen einen **vergessenen Filter** im Code | **ja**, über RLS | ja |

**Was für den Start reicht** (Weisung): **Verschlüsselung at rest und TLS.**
Kein E2E. Und kein Versprechen, das die Architektur nicht halten kann.

**Wo das im Auth-Bestand steht:** das Schema hat `user_id` auf `workspaces`,
`chats`, `api_keys`, `user_secrets` — die Grundlage für RLS ist da. **RLS selbst
ist nicht eingebaut** und wird zur Pflicht, sobald es mehr als einen Benutzer
gibt.

## 3. „Passwort als Key" wird verworfen — der Bestand macht es schon richtig

Der Betreiber: *„Ein aus dem Passwort abgeleiteter Schlüssel heißt, dass bei
vergessenem Passwort die Daten weg sind. Der Industriestandard ist Argon2id für
den Passwort-Hash und Envelope Encryption für die API-Keys."*

**Das ist genau das, was `packages/auth` bereits tut** — und es ist gut, dass es
hier ausdrücklich steht, weil die Anforderung „Passwort als eine Art Key" in
diese Falle führt:

| | Bestand | Bewertung |
|---|---|---|
| Passwort | **Argon2id**, `m=19456,t=2,p=1` — ein **Hash**, aus dem sich nichts ableiten lässt | richtig |
| Anbieter-Schlüssel | **Umschlagverschlüsselung**: eigener Datenschlüssel je Zeile, mit dem Hauptschlüssel verschlüsselt (`user_secrets`) | richtig |
| Passwort-Reset | möglich, **ohne** Datenverlust — weil das Passwort nichts entschlüsselt | richtig |

**Warum das zusammengehört:** würde der Passwort-Hash die Datenschlüssel
entschlüsseln, wäre ein Passwort-Reset gleichbedeutend mit **Datenverlust**. Genau
deshalb sind Passwort-Hash und Datenschlüssel **getrennt**. Der Bestand macht das
schon so — die Weisung bestätigt ihn.

## 4. Der Git-Punkt: der Reset entfernt nichts aus der Historie

> *„Der Reset auf eine frische Installation entfernt nichts aus der
> Git-Historie. Wenn irgendwann ein Key oder privater Chat committet wurde, ist
> er für immer drin."*

**Das ist richtig und war in meinem Plan falsch.** „Reset auf Frischinstallation"
hätte nur den **Arbeitsbaum** geleert. Die Objekte bleiben in `.git` — und mit
ihnen jeder je committete Schlüssel.

**Die Weisung, und ich folge ihr:**

1. **Privat bleiben** (ist so: `visibility: private` in `.pmh/base.json`).
2. **Veröffentlichen später als neuer Orphan-Branch oder neues Repository** — dann
   beginnt die Historie **neu**, und nichts Altes geht mit.
3. **`.env` und Geheimnisse von Anfang an absichern** — `gitleaks` oder
   pre-commit.

**Was ich geprüft habe (gemessen, 13.10.2026):**

| Prüfung | Ergebnis |
|---|---|
| Wurde je eine Geheimnis-**Datei** committet? | **keine** echte — die Treffer sind `.env.example`, Vorlage-Dokumente und Testdateien der Vorlage |
| Steht ein echter Schlüssel**wert** in der Historie? | **nein** — die Treffer sind `sk-example`, `sk-your-key-here`, `sk-...` (Platzhalter in Vorlagen-Doku) |
| `gitleaks` installiert? | **nein** |
| pre-commit-Haken? | **nein** |

**Der Stand ist damit sauber — aber ungesichert.** Es fehlt genau das, was der
Betreiber verlangt: eine Prüfung, die einen künftigen Fehler **verhindert**,
statt einer, die den heutigen Zustand bestätigt.

## 5. Der Adapter: die Weisung lautet **übernehmen oder portieren**, nicht neu bauen

> *„Adapter aus dsh: Ja, den würde ich dort übernehmen oder portieren, statt neu
> zu schreiben. Er gehört als erste Implementierung hinter das Seam. Ich kenne den
> Code von dsh nicht, prüf also, was dort schon existiert, bevor der Agent etwas
> neu baut."*

**Geprüft — und es existiert mehr, als ich gebaut habe:**

| Paket der Vorlage | Quelldateien | Was drin ist |
|---|---|---|
| `packages/llm/llm-deepseek` | **11 Dateien** in `src/` | `adapter.ts`, `file-id.ts`, `file-store.ts`, `files-api.ts`, … |
| `packages/llm/llm` | **14 Dateien** in `src/` | `adapter-failure.ts`, `api-key.ts`, `assembler.ts`, `attribution.ts`, … |
| `packages/llm/llm-pi-ai` | **12 Dateien** | `adapter.ts`, `auth.ts`, `catalog.ts`, `config.ts` — **ein zweiter Anbieter** als Muster |
| `packages/llm/llm-retry` | 5 Dateien | — |
| `packages/llm/token-meter` | 10 Dateien | — |

**Unser `packages/llm/llm-deepseek` hat 1 Quelldatei (493 Zeilen).** Die Vorlage
hat 11. Das ist der Unterschied zwischen „ein Aufruf, der funktioniert" und
„ein Adapter, der Dateien, Anhänge, Fehlerarten und die Anbieter-Erweiterungen
kennt".

**Die Entscheidung, die daraus folgt — und sie ist noch nicht getroffen:** ob wir
den Vorlagen-Adapter **übernehmen** (er ist TypeScript, er läuft im Core, er ist
nicht unser Code und darf nicht geändert werden) oder **portieren** (unser Seam,
unsere Typen). Beides ist vertretbar; **neu schreiben ist es nicht.**

**Was für „übernehmen" spricht:** die Vorlage hat ihn gegen die echte API
getestet. Was für „portieren" spricht: unser Seam ist anbieter-unabhängig und um
einiges kleiner, und `docs/concept.md` verbietet, Interna des Cores zu importieren.
**Beides gleichzeitig geht nicht** — das ist die Entscheidung.

## 6. freellmapi: nur zwei Muster sind brauchbar

> *„Für Adapter und Key-Handling taugt es, den Rest kannst du ignorieren."*

Übernommen werden — laut Weisung — genau diese vier Muster:

| Muster | Was daraus folgt |
|---|---|
| **Alle Anbieter über eine OpenAI-kompatible `/v1`-Schnittstelle** | **DeepSeek ist dann nur eine Konfiguration** (Base-URL + Key), kein eigener Adapter. Das ist kleiner als unser heutiges Paket |
| `server/src/providers/openai-compat.ts` als Vorlage für neue Anbieter | ein **generischer** OpenAI-compat-Adapter, Anbieter als Daten |
| **Provider-Keys AES-256-GCM-verschlüsselt in der DB**, je Anfrage im Speicher entschlüsselt; nach außen ein einheitliches Token | genau unser `user_secrets`-Modell — bestätigt |
| **429/5xx: Cooldown, Key-Rotation, Failover auf das nächste Modell**; RPM/TPM-Zähler je Key | **das fehlt uns** — unser `llm-retry` wiederholt einen Schlüssel, es rotiert nicht |

**Der letzte Punkt ist ein echter Zugewinn:** wir haben `llm-retry` (Wiederholung
mit Rückzug), aber **keine Schlüsselrotation**. Bei mehreren Schlüsseln je
Benutzer — was das Schema mit `api_keys` und `user_secrets` erlaubt — ist
Rotation die richtige Antwort auf 429, nicht Warten.

## 7. Was ausdrücklich offen bleibt

| Offen | Warum |
|---|---|
| **Übernehmen oder portieren** (Punkt 5) | eine Entscheidung, keine Aufgabe — sie bestimmt, wie viel vom Vorlagen-Adapter wir übernehmen |
| **E2E: endgültig verworfen oder später?** | für den Start verworfen (Punkt 2); die Weisung sagt „für den Start reichen at rest und TLS" |
| **Mandantentrennung: wann?** | nach der Kette. RLS, `workspace_members`, Redis-Namensräume und **pro-Benutzer-Sandbox** |
| **Agent-Isolation** | der kritischste Punkt der Weisung: *„pro User/Session eine eigene Sandbox und nie ein gemeinsamer Harness-Prozess für mehrere User"* — heute gibt es **weder Sandbox noch Mehrbenutzerbetrieb**, also auch kein Risiko; es entsteht mit dem zweiten Benutzer |
| **Deep Research und Subagent-in-Subagent** | laut Weisung **eigene Aufgaben** und im Konflikt mit der 10-Subagenten-Regel — hier **nicht** weiterverfolgt |
