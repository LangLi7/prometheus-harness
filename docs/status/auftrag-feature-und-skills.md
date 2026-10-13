# Auftrag: Feature-Plugins, Skill-Export und Usage-Anzeige

> **Weisung des Betreibers, wörtlich:**
> *„danach implementieren wir feature plugin aus diesem DSH ausser crew die nutzen wir als vorlage
> also kannst du es mal ignorieren oder eine anleitung erstellen wie crew funktioniert, ich möchte
> das du der skill übertragen kannst also exportieren von mir aus erstelle weitere github push also
> ein anderes projekt für alle skill und implementierung einzeln wenn du willst. den: usage würde
> ich gerne auch implementieren die anzeige wird anders gehandhabt beim neue agent harness"*
>
> **Reihenfolge:** *„danach"* — also **nach** der Kernarbeit (A und B). Diese Datei hält den Auftrag
> fest, damit er nicht verlorengeht; sie beansprucht **keine** Erledigung.

## F1 — Feature-Plugins aus dem DSH übernehmen, **außer crew**

Die Feature-Plugins des DeepSeek Harness sollen in unseren Harness übernommen werden.
**`crew` ist ausdrücklich ausgenommen** — es dient als **Vorlage**, nicht als Nachbau.

Je übernommenem Plugin gehört festgehalten:

| Angabe | Warum |
|---|---|
| **Quelle im Core** | Paketname und Dateipfad — damit nachprüfbar bleibt, was die Vorlage tut |
| **Unsere Schnittstelle** | worüber es bei uns eingehängt wird (Cordis-Plugin, Profil-Eintrag, Endpunkt) |
| **Nachweis** | Befehl, Ausgabe, Exit-Code — nicht „ist eingebaut" |

**Vor dem Übernehmen zu klären:** welche Plugins **Node voraussetzen**. Zwei sind bereits gemessen
und beide brechen unter Bun stumm (`docs/status/api-nachweis.md`, `bunfig.toml`):
`module.stripTypeScriptTypes` fehlt, und Bun verschluckt den `--`-Trenner. **Wer ein Plugin
übernimmt, prüft zuerst seine Laufzeitannahmen** — sonst entsteht ein dritter stiller Ausfall.

## F2 — Anleitung: wie `crew` funktioniert

Statt `crew` zu implementieren, eine **Anleitung** schreiben. Sie muß beantworten:

* Was `crew` ist: Rollen (planner, executor, reviewer, vision, helper), je Rolle ein **eigenes
  Ziel** und eine **eigene To-do-Liste**, dauerhaft je **Projekt** (Arbeitsbereich) gespeichert.
* Wo der Zustand liegt: `.dsh/crew/goals/<crew>/<workspace>.json` — je Crew eine eigene Datei.
  **Der Fallstrick, der schon zugeschlagen hat:** ein Aufruf **ohne** `crew`-Angabe geht an die
  Crew `default` mit **eigener Datei**. Wer die Crew vergißt, schreibt woanders hin und hält es
  für eine Änderung an seiner Liste. (Genau das ist am 13.10.2026 passiert — `crew-1` blieb
  unversehrt, aber nur, weil die Zustände getrennt liegen.)
* Die vier Ebenen: **Arbeitsbereichs-Ziel** → **Projekte** (Archiv von Arbeitsströmen mit je
  eigener Liste) → **Rollen-Ziel** → **Rollen-To-do**.
* Wie ein Lauf abläuft: Ziel → Zerlegung in einen Abhängigkeitsgraphen → unabhängige Schritte
  parallel, abhängige danach → Prüfer mit begrenzter Korrekturschleife und Token-Budget.
* Was `todo_write` davon unterscheidet: das eine ist die Liste **dieser** Sitzung, das andere
  **dauerhafter** Zustand über Sitzungen hinweg.

## F3 — Skills exportieren

Die Skills sollen **übertragen/exportiert** werden. Der Betreiber stellt frei, dafür ein
**eigenes GitHub-Repository** anzulegen („für alle Skill und Implementierung einzeln").

Zu klären, **bevor** etwas veröffentlicht wird:

1. **Herkunft.** Welche Skills sind **eigene** Arbeit, welche sind **übernommen**?
   Übernommene brauchen Lizenz und Quellenangabe — sonst wird aus einem Export eine
   Rechtsfrage. (`docs/decisions/` führt bereits Entscheidungen zu Vorlagen und Lizenzen.)
2. **Geheimwerte.** Vor jedem Push die Historie prüfen. Heute ist sie sauber (gemessen:
   `.env` nie versioniert, `sk-…` 0 Treffer, privater Schlüssel 0 Treffer) — **aber
   `gitleaks` fehlt** (Punkt **E2**), und der Zustand ist damit ungesichert.
3. **Maschinengebundene Pfade.** `docs/protokoll/aufsicht/hilfen/` enthält **22 feste Pfade**
   auf den Rechner des Betreibers (Punkt **E4**) — in einem öffentlichen Repository Ballast
   und eine Auskunft über die Verzeichnisstruktur.
4. **Ein Repository oder mehrere?** Der Betreiber stellt beides frei. Eine Entscheidung, keine
   Aufgabe — sie bestimmt, ob Skills und Implementierung getrennte Historien bekommen.

## F4 — Usage-Anzeige (Verbrauchsanzeige)

Der Betreiber: *„usage würde ich gerne auch implementieren die anzeige wird anders gehandhabt
beim neue agent harness"*.

**Die Anzeige ist im neuen Harness anders** — das ist der Kern des Auftrags, nicht die Zahl.
Zu klären: **was** gezählt wird (Tokens je Aufruf? je Sitzung? je Benutzer?), **woher** die
Zahlen kommen, und **wie** sie dargestellt werden.

**Was im Bestand schon da ist und dafür in Frage kommt:**

| Baustein | Zustand |
|---|---|
| `packages/llm/token-meter` | vorhanden (eigenes Paket, mißt Tokens) |
| `usage`-Ereignis im Sitzungsstrom | **gemessen**: `docs/status/api-nachweis.md` zeigt `session-log-deepseek/delivery-accepted`; der Verlauf trägt Ereignisse, aus denen sich Verbrauch ableiten läßt |
| Sitzungsablage | `<home>/sessions/<cwd-slug>/<sessionId>/session.v4.jsonl.zstd` — **zstd-komprimiert** |

**Vorbedingung, die nicht übersprungen werden darf:** eine Verbrauchsanzeige je **Benutzer**
setzt **Mandantentrennung** voraus (Befund **B-S1**, Punkt **B4**). Ohne sie zeigt sie entweder
nichts oder **fremden** Verbrauch.

## Einordnung

Diese vier Punkte stehen **nach** der Kernarbeit. Die Reihenfolge im Ziel gilt weiter:
**A** (Kern) → **B** (Verdrahtung) → **C** (Geheimnisse) → **D** und **F** (Zielliste) →
**E** (Betrieb und Veröffentlichung). **F3 und F4 hängen an E2/E4** (Geheimwerte und
maschinengebundene Pfade), sobald veröffentlicht wird.
