# Entscheidung — Versorgung des Agent-Cores

> **Status: ENTSCHIEDEN** · Weg **B (Hybrid)** · 12.10.2026
> **Gegenstand:** Wie der Agent-Core in dieses Projekt kommt — selbst bauen, als
> Abhängigkeit benutzen oder aus der Vorlage kopieren.
> **Bezug:** `docs/decisions/open-questions.md` §2 und §6 · `docs/concept.md` ·
> `docs/stack.md` · `MAPPING.md` §1.1 und §8

---

## 1. Die Entscheidung in einem Absatz

Der Agent-Core wird **vom Upstream als Abhängigkeit benutzt**, nicht selbst gebaut und
nicht kopiert. Das Zielprojekt besitzt **nur**, was es selbst beiträgt: einen **eigenen
kleinen Host** als Anwendungseinstieg, die **Units** (Plugins, Skills, Dienste) und die
**Go-/Rust-Dienste** hinter der Prozessgrenze. Der Core wird auf die **exakt gemessene
Version `0.2.1-alpha.2`** festgenagelt — dieselbe Version wie der Referenz-Fork
(`d743267388`). Damit ist `open-questions.md` §6 („Neigung: Hybrid") entschieden und §2
(„Cordis nicht nachbauen") auf den ganzen Core ausgeweitet.

**Kurzformel:** *Der Core ist eine Abhängigkeit. Besessen wird nur der Host, die Units und
die Dienste.*

---

## 2. Die drei Wege

| Weg | Was er bedeutet | Aufwand | Urteil |
|---|---|---|---|
| **A — Core selbst bauen** | ~340 TS-Pakete (Agent-Loop, Session-Format + 4 Migrationen, LLM-Adapter, API-Controller, Typert, SDK, ACP, Host, Tools) neu implementieren | sehr groß | **verworfen** |
| **B — Hybrid** | Core aus dem Upstream als **Abhängigkeit**; eigener kleiner Host, eigene Units, eigene Dienste | mittel | **gewählt** |
| **C — Vorlagenkopie** | `apps/cli` des Referenz-Forks übernehmen und darin arbeiten | klein | **verboten** |

---

## 3. Begründung

### 3.1 Warum B — und zwar nicht aus Bequemlichkeit

1. **`docs/concept.md` fordert genau das.** „**Der Core wird benutzt, nicht besessen.**"
   Der Auslöser des ganzen Projekts war, dass Anpassungen „eingenäht" statt absteckbar waren
   (56 fremde Dateien, 129 neue Dateien quer über 16 Pakete). Eine eigene Core-Implementierung
   ist die **teuerste Form des Besitzens**: sie besitzt die Merge-Konflikte nicht mehr, aber
   dafür jede künftige Upstream-Fehlerbehebung als Nachbauarbeit.
2. **`open-questions.md` §6 neigt bereits zu B** — „Hybrid. Es hält Fehlerbehebungen des
   Upstream verfügbar und kostet nur Disziplin bei den vier Regeln." Diese Entscheidung ist
   die Ausführung dieser Neigung, mit **einer** Verschärfung: nicht nur Cordis (§2), sondern
   der **gesamte** Core kommt als Abhängigkeit.
3. **Der Core muss JavaScript sein — das ist gemessen, nicht Geschmack.**
   `docs/stack.md`: „Das Plugin-System (Cordis) ist JavaScript … Ein Core in einer anderen
   Sprache könnte sie nicht laden. **TypeScript ist deshalb nicht verhandelbar.**" Jede
   Eigenbau-Variante wäre also ohnehin TypeScript gegen dieselben ~340 Pakete.
4. **Das Risiko, das den Eigenbau begründen könnte, existiert nicht mehr.** Die einzige
   dokumentierte Ursache für „man müsste den Core anfassen" war der Bun-Addon-Verdacht
   (`koffi`, `node-pty`). `MAPPING.md` §1.1 hat ihn **strukturell** aufgelöst: beide
   Fähigkeiten sind jetzt Prozesse (`native/atomicfs`, `native/pty`). Damit gibt es **keinen
   bekannten Grund**, vom Upstream-Code abzuweichen — und ohne solchen Grund ist eine
   eigene Implementierung reine Kosten.
5. **B ist die Voraussetzung für die Reihenfolge aus `concept.md`.** Dort steht:
   1. Core läuft → 2. ein Unit beweist die Kette → 3. erst dann Sprachgrenzen. Nur B
   liefert Schritt 1 **jetzt**. A schiebt „Core läuft" um die Bauzeit von ~340 Paketen
   nach hinten — und `docs/risks.md` §3 warnt vor genau dieser Reihenfolge-Umkehr
   („drei Sprachen gleichzeitig, jeder Fehler mehrdeutig").

### 3.2 Warum A verworfen ist

A ist **regelkonform**, aber nicht das, was die Doku verlangt — und die Begründung ist keine
Bequemlichkeit, sondern eine Messung: dasselbe Ergebnis (ein Core, der Cordis-Plugins lädt)
entsteht bei B **sofort** und bei A **nach dem Nachbau von ~340 Paketen**. Der Nachbau würde
nichts schützen, was B nicht auch schützt: die vier Regeln aus `concept.md` gelten für B
unverändert, und die Unantastbarkeit des Cores ist bei B sogar **technisch erzwungen** — ein
Paket aus dem `node_modules`-Baum kann man nicht versehentlich ändern, ohne es zu bemerken.

**Wann A richtig wäre** (Bedingung, unter der diese Entscheidung widerrufen gehört): wenn
eine belegte, unumgehbare Anforderung auftaucht, die der Upstream-Core nicht erfüllen kann
und die sich auch nicht als Unit oder Dienst daneben bauen lässt. Diese Bedingung ist heute
**nicht** belegt.

### 3.3 Warum C verboten bleibt

C widerspricht `docs/concept.md` wörtlich: *„Nicht als Codebasis — Wir kopieren nicht 14.990
Dateien und schneiden darin."* Der Ist-Zustand in `apps/` ist genau das und ist im
Prüfbericht als **Befund 1 (schwer)** festgehalten
(`docs/review/backend-review.md`, r2). Dass B gewählt ist, ändert daran nichts: eine
**Abhängigkeit** ist keine Kopie. Der Unterschied ist nicht kosmetisch —

| | Abhängigkeit (B) | Kopie (C) |
|---|---|---|
| Upstream-Fehlerbehebung | kommt mit dem nächsten Versionssprung | muss selbst nachgezogen werden |
| „Core unantastbar" | technisch erzwungen | nur eine Regel, die man brechen kann |
| Umfang im Repo | 0 Dateien | 1.043 byte-identische Dateien |
| Vergleich mit der Vorlage | eindeutig (Version gepinnt) | zweideutig (welche Fassung gilt?) |

---

## 4. Belege — gemessen am 12.10.2026

Alle Zahlen sind mit lesenden Befehlen erhoben; die Vorlage wurde **nicht** verändert und
`docs\dsh` / `docs\design` wurden **nicht** geöffnet.

### 4.1 Der heutige Zustand (das Problem)

| Prüfung | Ergebnis |
|---|---|
| `apps/cli/node_modules/@deepseek-ai/` | **129 Ordner, 0 Dateien** — alle 129 leer |
| `apps/cli/package.json`, `dependencies` | **138** Einträge, davon **129 × `workspace:*`** — und diese 129 sind **genau** die 129 leeren Ordner |
| `packages/` im Ziel: Dateien | **16** (Vorlage: 19.540) |
| `packages/` im Ziel: echte Pakete | **3** — `core/scope`, `util/atomic-write`, `util/home-paths` |
| `bun install --dry-run` in `apps/cli` | **exit 1**, u. a. `@deepseek-ai/dsh-web-app@workspace:* failed to resolve` (82 solcher Meldungen) |

**Diagnose.** Das Problem ist **kein fehlender Code, sondern ein fehlendes Ziel für die
`workspace:*`-Verweise.** Die 129 Hüllen sind leer, weil die Pakete, auf die sie zeigen, im
Zielprojekt nicht existieren — und sie existieren dort nicht, weil die Entscheidung, wie der
Core versorgt wird, bisher offen war. **Diese Entscheidung löst die Ursache, nicht das
Symptom.**

### 4.2 Ist Weg B überhaupt möglich? — ja, geprüft

Die Pakete sind **veröffentlicht und öffentlich**, samt der Vorabversionen, die der
Referenz-Fork benutzt:

| Prüfung | Ergebnis |
|---|---|
| `@deepseek-ai/dsh-app-boot` auf npm | vorhanden, `dist-tags.alpha = 0.2.1-alpha.2` |
| `@deepseek-ai/dsh` (der Host, `bin: dsh`) | vorhanden, `dist-tags.alpha = 0.2.1-alpha.2` |
| Die 82 `workspace:*`-Abhängigkeiten der CLI | **77** liegen als `0.2.1-alpha.2` vor; die 5 übrigen sind die Cordis-Familie, die **unabhängig versioniert** und ebenfalls publiziert ist |
| Cordis-Familie | `cordis@4.0.5-alpha.1` ✓ · `cordis-plugin-include@1.0.10-alpha.1` ✓ · `cordis-plugin-loader@1.0.6-alpha.1` ✓ · `cordis-plugin-group@1.0.5-alpha.1` ✓ · `cordis-plugin-timer@1.1.7-alpha.1` ✓ · `cosmokit@1.8.6-alpha.1` ✓ · `schemastery@3.18.5-alpha.1` ✓ — **jede** verlangte Vorabversion existiert |
| Publikationsregeln im Quell-Repo | **330 von 340** `packages/*/*` sind nicht `private` und tragen `publishConfig.access = public` |
| `packages/` der Vorlage | **340** `package.json`, davon 10 privat (Testhilfen u. ä.) |

**Belegt ist damit:** die direkten Abhängigkeiten der CLI und die **Peer-Abhängigkeiten** der
Kernpakete lösen sich vollständig auf. Jede Version, die ein `0.2.1-alpha.2`-Paket
verlangt, ist am Registry vorhanden.

### 4.3 Die zwei Nebenbedingungen, die aus der Messung folgen

| # | Befund | Konsequenz für die Umsetzung |
|---|---|---|
| N1 | `workspace:*` ist ein **pnpm-/Bun-Arbeitsbereichs-Marker**, kein Versionsbereich. Ein Paket von der Registry kann ihn nicht erfüllen. | Beim Umstellen muss **jede** `workspace:*`-/`workspace:~`-Angabe auf die explizite Version `0.2.1-alpha.2` gesetzt werden. Mechanisch, aber vollständig — ein übersehener Marker lässt `bun install` wieder mit exit 1 enden. |
| N2 | Das Quell-Repo überschreibt **zwei** Pakete per `link:` auf eigene Patches: `@deepseek-ai/cosmokit` (`vendor/cosmokit`) und `@deepseek-ai/schemastery` (`vendor/schemastery`), `pnpm-workspace.yaml` → `overrides`. Rein von der Registry kommen die **ungepatchten** Fassungen. | Die beiden Patches sind als **Unit** zu führen, falls sie sich als nötig erweisen. Der Upstream-Core bleibt dabei unangetastet (Regel 1); gepatcht würde ein **Abhängigkeitspaket**, dokumentiert und einzeln absteckbar. Ob sie nötig sind, ist eine **Messung**, keine Annahme. |

---

## 5. Konsequenzen für die Folgeschritte

| Schritt | Was die Entscheidung dort ändert |
|---|---|
| **2 — Kaputten Zustand bereinigen** | `apps/cli`, `apps/desktop`, `apps/desktop-host` werden **nicht** „ausdrücklich als Übergangslösung dokumentiert", sondern **entfernt** und durch einen eigenen, kleinen Host ersetzt. Die 129 leeren `@deepseek-ai`-Hüllen entfallen mit ihnen. C ist damit nicht nur verboten, sondern beseitigt. |
| **3 — Go-Dienste** | unverändert: die 11 Dienste aus `MAPPING.md` §3.7 bleiben Eigenbau. Die Entscheidung betrifft **nur** den Core, nicht die Dienste. |
| **5 — Testinfrastruktur** | Der CI-Lauf (A9) wird zur **ersten Messung, die Weg B belegt**: `bun install` → exit 0, Typecheck exit 0, Host liefert HTTP 200. Solange das nicht gemessen ist, ist B eine belegte **Erwartung**, kein bewiesenes Ergebnis. |
| **Host-Umfang** | Der eigene Host ist **neu zu schreiben** und klein zu halten — er startet den Core und liefert die Oberfläche aus. Er ist **keine** Kopie von `apps/cli` (220 Dateien im Ziel, 1.043 byte-identisch mit der Vorlage). |
| `MAPPING.md` §3.1/§3.5 | `MAPPING.md` führt den Core als Stufe **A** („1:1 übernehmen, Stack wechseln"). Das ist mit dieser Entscheidung **präzisiert**: Stufe A heißt für den Core *„als Abhängigkeit benutzen"*, nicht *„nachbauen"*. Die Stufenlogik bleibt gültig; die Umsetzungsart ist festgelegt. |

---

## 6. Was diese Entscheidung ausdrücklich **nicht** festlegt

- **Nicht** den Umfang des eigenen Hosts — er wird in Schritt 2 zugeschnitten.
- **Nicht**, ob die beiden Vendor-Patches (N2) übernommen werden müssen. Das ist eine Messung
  nach dem ersten erfolgreichen Start.
- **Nicht** die Laufzeitfrage (`open-questions.md` §1). Die Entscheidung ist
  laufzeitneutral: sie gilt für Bun wie für den Node-Rückfall.
- **Nicht** die Frage, ob später einzelne Core-Pakete durch eigene ersetzt werden. Die
  Architektur lässt das zu (jedes Paket ist einzeln adressierbar), aber es braucht dafür
  einen belegten Grund — dieselbe Bedingung wie in §3.2.

---

## 7. Nachweis der Entscheidungsgrundlage

| Quelle | Verwendung hier |
|---|---|
| `docs/concept.md` | Regel 1–4, „Core wird benutzt, nicht besessen", Reihenfolge Core → Unit → Sprachgrenzen |
| `docs/stack.md` | „TypeScript ist nicht verhandelbar", „Der JS-Core bleibt der Kernel" |
| `docs/decisions/open-questions.md` §2, §6 | Cordis nicht nachbauen; Neigung Hybrid |
| `docs/backend-analysis.md` §2.1, §3.1, §7, §8 | Leitbild, Kernel-Aufgaben, Reihenfolge, offene Punkte 2 und 6 |
| `MAPPING.md` §1.1, §3.1, §5, §8 | Auflösung des Addon-Risikos; Core als TS; Zeile „Verhältnis zum DSH: Hybrid" |
| `docs/review/backend-review.md` r2, A1, A7, R4 | Befund 1 und 2 (die Kopie und ihre Folge), offener TS-Umfang, Risiko der Zweideutigkeit |
| Eigene Messungen (§4) | npm-Registry-Abfragen, Dateizählungen, `bun install --dry-run` |

**Abgrenzung:** `docs\dsh\` und `docs\design\` wurden für diese Entscheidung nicht geöffnet.
