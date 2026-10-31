# Crew, Dual Council und Modell-Mix — was die Evidenz trägt

> **Frage des Betreibers.** Wie lässt sich der Crew-Modus signifikant verbessern und um einen
> „Dual Council" erweitern — als asynchroner/synchroner Teams-Chat für Agenten, als Skill, mit
> Personas und Diskussion? Führt das zu signifikanten Ergebnissen? Lässt sich das mit MiroFish
> prüfen? Und: Kann man je Rolle ein anderes Modell nehmen (Planner teuer, Worker billig), ohne
> für „nur Thinking" 20 Dollar zu zahlen?
>
> **Stand:** 28.10.2026. Quellen geprüft, lokaler Code gelesen. Was nicht belegt ist, steht als
> offen da.

---

## 1. Kurzantwort

**Ja, ein Council kann signifikant besser sein — aber nicht, weil debattiert wird.**

Die drei belastbaren Befunde der Literatur:

1. **Debatte hilft, aber nicht zuverlässig.** Du et al. (2023) zeigen Verbesserungen bei Mathematik,
   Strategie und Faktenvalidität. Smit et al. (2024) benchmarken dieselbe Idee breiter und finden:
   *„multi-agent debating systems, in their current form, do not reliably outperform other proposed
   prompting strategies, such as self-consistency and ensembling using multiple reasoning paths"* —
   mit einer wichtigen Einschränkung: **mit Hyperparameter-Tuning** (u. a. Multi-Persona und dem
   Grad der Übereinstimmung) übertreffen einzelne Debatten-Protokolle die anderen Ansätze. Ihr
   Schluss: Debatte ist nicht schlechter, sondern **empfindlicher** und schwerer zu optimieren.
2. **Die Zahl der Stimmen wirkt, die Diskussion nicht zwingend.** Li et al. (2024, TMLR) zeigen:
   reines **Sampling plus Voting** („Agent Forest") skaliert mit der Zahl der Agenten — und ist
   orthogonal zu komplizierteren Methoden. Das ist die unbequeme Baseline: Wer fünf billige Modelle
   sampelt und abstimmen lässt, bekommt einen großen Teil des Effekts ohne Debattenprotokoll.
3. **Heterogenität schlägt Homogenität.** Mixture-of-Agents (Wang et al., 2024) erreicht mit
   **offenen** Modellen Spitzenwerte, indem es Schichten verschiedener Modelle kombiniert. Der
   Gewinn kommt aus **Vielfalt plus Auswahl**, nicht aus dem Gespräch.

**Daraus folgt für den Dual Council:** Der Wert liegt in (a) **verschiedenen** Modellen/Personas,
(b) einem **starken Judge/Verifier**, (c) Aufgaben mit **prüfbarer** Antwort. Ein Council aus fünf
Kopien desselben Modells mit fünf Rollennamen ist die teuerste Art, Self-Consistency zu bauen.

---

## 2. Was der Crew-Modus heute ist

| Baustein | Ort | Stand |
|---|---|---|
| Sechs Rollen | `packages/crew/plan/src/types.ts:29` | `planner`, `executor`, `reviewer`, `vision`, `search`, `helper` |
| Plan → Wellen → Prüfschleife | `packages/crew/plan/src/plan.ts:234` (`fuehreAus`) | `maxVersuche` (Vorgabe 3), `maxTokens`, `pruefer` (Vorgabe `reviewer`) |
| Rollen an Modelle binden | `packages/crew/crew-provider/README.md` | **schon vorhanden**: `rollen: { planner: { familie, modell }, executor: { … } }` |
| Crew als Modell am Seam | `packages/crew/crew-plugin/README.md` | Adapter, Werkzeuge, Buchung je Nutzer am `llm/stream` |
| Ablage je Konto | `packages/plugin/crew/src/server.ts` | PostgreSQL, Datei als Rückfall |

**Der Modell-Mix ist also keine neue Baustelle** — er ist im Datenschema bereits vorgesehen. Was
fehlt, ist die *Steuerung* (Budget, Kaskade, Judge) und die *Messung*.

**Die benannten Grenzen** (aus den READMEs, nicht von mir erfunden):

1. **Kein Neuplanen nach einer Beanstandung.** Die Prüfschleife wiederholt dieselbe Schritttabelle
   mit den Mängeln; ein Plan, der am Ziel vorbeigeht, endet nach `maxVersuche` mit `fail`.
2. **Die Werkzeuge sind im Betrieb nicht angemeldet** — welcher Nutzer und welches Projekt gelten,
   entscheidet die Sitzung, und die kennt den Nutzer heute nicht.
3. **Kein Bildteil im eigenen Seam** — `vision` läuft nur über eine Textbeschreibung.
4. **Der Speicher ist ein Dateisystem** (im Planungskern), nicht die Datenbank.

Ein Council dockt an Punkt 1 an: Statt „dieselbe Tabelle nochmal" würde eine zweite Kammer den
**Plan** beanstanden, bevor er läuft.

---

## 3. Die Evidenz im Einzelnen

| Quelle | Befund | Was daraus folgt |
|---|---|---|
| Du et al. 2023, [arXiv:2305.14325](https://arxiv.org/abs/2305.14325) | Mehrere Instanzen schlagen Antworten vor und debattieren über Runden; „significantly enhances mathematical and strategic reasoning", reduziert halluzinierte Antworten | Debatte ist ein echter Hebel — bei **prüfbaren** Aufgaben |
| Smit et al. 2024, [arXiv:2311.17371](https://arxiv.org/abs/2311.17371) | Debatte schlägt Self-Consistency/Ensembling **nicht zuverlässig**; mit Tuning (Multi-Persona, Agreement) schon; „more sensitive to hyperparameter settings" | Ein Council braucht **Tuning und Messung**, sonst ist er teurer Zufall |
| Li et al. 2024, [arXiv:2402.05120](https://arxiv.org/abs/2402.05120) | Sampling+Voting skaliert mit der Agentenzahl; orthogonal zu komplexen Methoden | Die Baseline „n billige Modelle + Vote" muss der Council **schlagen**, nicht nur erreichen |
| Wang et al. 2024, [arXiv:2406.04692](https://arxiv.org/abs/2406.04692) | Geschichtete Mixture-of-Agents mit offenen Modellen erreicht Spitzenwerte auf AlpacaEval/Arena-Hard | **Heterogene** Modelle sind der Kern, nicht die Runden |
| Chen et al. 2023, [arXiv:2305.05176](https://arxiv.org/abs/2305.05176) | LLM-Kaskade: GPT-4-Niveau bei bis zu **98 %** geringeren Kosten oder +4 % Genauigkeit bei gleichen Kosten | Der Preis-Hebel liegt in der **Kaskade**, nicht im Sparen am Worker |

**Was die Quellen nicht sagen.** Keine dieser Arbeiten belegt, dass „mehrere Personas diskutieren"
bei *offenen* Aufgaben (Text, Konzept, Design) signifikant besser ist. Der gemessene Gewinn liegt
bei Aufgaben mit **einer richtigen Antwort** oder einem klaren Qualitätsmaß.

---

## 4. Was „signifikant" hier heißen kann

Drei Größen, die man getrennt messen muss — sonst ist „besser" eine Behauptung:

1. **Qualität** je Aufgabe (Goldcheck oder Judge mit festem Rubric, nicht „sieht gut aus").
2. **Kosten** in USD je Aufgabe (die Tarife liegen in `packages/ai/tariffs`).
3. **Latenz und Varianz** (drei Läufe; ein Council, der einmal gut war, ist kein Beleg).

Ein Council ist nur dann gerechtfertigt, wenn er die **einfache Baseline** (n billige Samples +
Vote) bei **gleichen Kosten** schlägt. Sonst kauft man Stil.

---

## 5. Dual Council — der Vorschlag

### 5.1 Die zwei Kammern

| Kammer | Besetzung | Aufgabe | Modell-Tier |
|---|---|---|---|
| **Macher** („forge") | 2–3 Personas mit *verschiedenen* Blickwinkeln (z. B. Umsetzer, Skeptiker, Nutzer-Anwalt) | Entwurf, Plan, Umsetzung | billig/mittel |
| **Rat** („council") | 2 Prüfer mit *verschiedenen* Maßstäben (Korrektheit, Aufwand/Risiko) | Beanstandung, Alternativen, Urteil | mittel/stark |
| **Richter** | 1 starkes Modell | entscheidet zwischen den Fassungen anhand des Rubrics | **stark** |

Der Richter ist der teuerste Punkt — und der, an dem die Qualität hängt. Ein billiger Richter macht
aus einem guten Council eine Münze.

### 5.2 Synchron oder asynchron

| Betrieb | Wie | Vorteil | Risiko |
|---|---|---|---|
| **Synchron** | Rundenbarriere: alle Kammern antworten, dann nächste Runde | deterministisch, leicht zu prüfen | langsam, blockiert bei einem langsamen Modell |
| **Asynchron** | append-only Log; jede Rolle liest den Stand und schreibt | schnell, ausfallsicher | Konvergenz unklar, Endlosschleifen |
| **Getaktet** (Empfehlung) | asynchron, aber alle *n* Nachrichten eine Barriere | beides | etwas mehr Steuerung |

Für den Harness passt **getaktet**: Die Sitzung ist ohnehin asynchron, und ein Log ist genau das,
was `crew-plan` mit dem Zustandsdokument schon tut.

### 5.3 Das Protokoll (Runden)

```
1. Ziel + Rubric festlegen (Richter formuliert die Prüfkriterien ZUERST)
2. Macher: 2–3 unabhängige Entwürfe (kein gegenseitiges Lesen — Divergenz)
3. Rat: jeder Prüfer beanstandet JEDEN Entwurf mit Rubric-Bezug
4. Macher: überarbeiten (dürfen fremde Beanstandungen sehen, nicht die Entwürfe)
5. Richter: wählt oder verschmilzt, begründet mit Rubric
6. Abbruch: Rubric erfüllt ODER Rundenlimit ODER Budget erschöpft
```

**Warum Schritt 2 ohne gegenseitiges Lesen.** Smit et al. zeigen, dass Konvergenz zu früh schadet;
Divergenz erzeugt die Vielfalt, aus der der Richter schöpfen kann. Erst die Beanstandung führt
zusammen.

### 5.4 Personas, die etwas verändern

Eine Persona ist nur dann nützlich, wenn sie **anders prüft**, nicht anders klingt:

| Persona | Prüft | Typische Beanstandung |
|---|---|---|
| Umsetzer | Machbarkeit, Aufwand | „Das braucht eine Tabelle, die es nicht gibt" |
| Skeptiker | Annahmen, Gegenbeispiele | „Woher weißt du, dass der Nutzer das will?" |
| Nutzer-Anwalt | Verständlichkeit, Reibung | „Das erklärt nicht, was bei Fehler passiert" |
| Sicherheit | Grenzen, Rechte | „Wer darf das aufrufen?" |

### 5.5 Andocken im Code

Der Council ist **keine neue Engine**, sondern eine Erweiterung von `fuehreAus`:

- `pruefer` wird zu einer **Liste** von Rollen (statt einer).
- Ein neuer Schritt `richter` mit eigenem Modell.
- `maxTokens` bleibt der Deckel; ein `maxUsd` kommt dazu (Tarife sind vorhanden).
- Der Verlauf (Runden, Beanstandungen, Urteile) geht in das bestehende Zustandsdokument.

Als **Skill** formuliert wird nur das Protokoll (wer prüft was, wann wird abgebrochen); die
Ausführung bleibt im Kern. Ein Skill, der die Diskussion nur beschreibt, produziert Text, keine
Verbesserung.

---

## 6. Modell-Mix und Kosten

**Der Befund.** FrugalGPT belegt: Eine Kaskade erreicht Spitzenqualität bei bis zu 98 % weniger
Kosten — oder +4 % Qualität bei gleichen Kosten. Der Hebel ist die **Zuordnung**, nicht das Sparen
an jeder Stelle.

**Die Regel für den Crew-Modus:**

| Aufgabe | Modell-Tier | Begründung |
|---|---|---|
| Planung, Zerlegung, Richter | stark | ein Fehler hier kostet alle folgenden Schritte |
| Ausführung, Text, Umformulierung | billig/mittel | viele Aufrufe, geringe Einzelwirkung |
| Prüfung, Beanstandung | mittel/stark | muss Fehler *finden*, nicht produzieren |
| Vision | Spezialmodell | kein Allzweckmodell |

**Was fehlt, damit das nicht in die 20-Dollar-Falle läuft:**

1. **Ein Kosten-Deckel je Lauf** (`maxUsd`), nicht nur Token.
2. **Eine Kaskade**: billiges Modell zuerst; nur bei Unsicherheit/Beanstandung das teure.
3. **Buchung je Rolle** — die Buchung am `llm/stream` gibt es; sie muss die Rolle mitführen, sonst
   sieht man nicht, welcher Teil teuer war.
4. **Ein Abbruch bei „nur Thinking"**: Wenn ein Modell nur Reasoning-Token produziert und keine
   verwertbare Antwort, ist das ein Fehlschlag, kein Ergebnis. Der Judge muss das erkennen.

---

## 7. MiroFish — wofür es taugt und wofür nicht

MiroFish ist laut `docs/subsystems/mirofish.md` eine **Schwarm-Simulation für Websites**: Seed
rein, Persona-Graph, hunderte Agenten in einer Twitter-/Reddit-Umgebung, Report raus. Es beantwortet
die Frage *„wie kommt Versprechen, Preis und Beweis an?"* — und die Doku sagt ausdrücklich:
*„Synthetische Reaktionen sind Hypothesen, keine Messungen."*

**Für die Council-Frage ist es das falsche Werkzeug.** Es misst Reaktionen auf Botschaften, nicht
die Qualität einer Aufgabenlösung. Ein MiroFish-Lauf würde sagen, ob Personas den *Eindruck* einer
Debatte überzeugend finden — nicht, ob die Debatte bessere Ergebnisse liefert.

**Was stattdessen gemessen werden muss:** ein eigener Eval-Harness (siehe §8). MiroFish kann später
eine *andere* Frage beantworten: ob die Council-Ergebnisse für Menschen verständlicher wirken.

---

## 8. Der Test, der die Frage beantwortet

**Aufgaben:** 24 Aufgaben aus vier Kategorien (Code, Faktenwissen, Planung, offene Analyse), je mit
Goldantwort oder festem Rubric.

**Arme:**

| Arm | Aufbau | Zweck |
|---|---|---|
| A | ein starkes Modell, ein Aufruf | Referenzqualität |
| B | ein billiges Modell, ein Aufruf | Kostenreferenz |
| C | **Dual Council**: 3 billige Macher + 2 Prüfer + starker Richter | die These |
| D | 5 billige Samples + Mehrheitsentscheid | die unbequeme Baseline |

**Metriken:** Pass-Rate, USD je Aufgabe (aus `tariffs`), Wanduhrzeit, Streuung über 3 Läufe.

**Abbruchkriterium (vorher festlegen):** C gilt nur dann als gerechtfertigt, wenn es D bei
**gleichen Kosten** um mindestens den doppelten Standardfehler schlägt. Sonst ist der Council für
diese Kategorie nicht belegt — und D ist die bessere Wahl.

**Was der Test nicht kann:** Er misst 24 Aufgaben, nicht „Intelligenz". Ein Ergebnis von 24 Aufgaben
ist eine Indikation, kein Beweis.

**Stand 28.10.2026 — das Instrument ist gebaut.** `packages/crew/crew-provider/src/eval.ts` enthält
die 24 Aufgaben (sechs je Kategorie), `fuehreEval`, `mehrheit`, `vergleiche` und `pruefeKriterium`;
`arme.ts` baut die vier Arme über einem `LlmProvider`. Das Abbruchkriterium ist im Code
festgeschrieben (gleiche Kosten mit 10 % Toleranz, doppelter Standardfehler) — es lässt sich nach
dem Lauf nicht mehr weichreden. **Der Lauf selbst steht aus:** Er braucht einen erreichbaren
LLM-Endpunkt.

Ein Befund aus den Tests, der die Erwartung dämpft: Bei 24 Aufgaben liegt ein Unterschied von
**75 % gegen 50 %** unter der Schwelle (0,25 < 0,27). Der Rat müsste D deutlich schlagen, nicht nur
knapp — sonst ist das Ergebnis Zufall.

---

## 9. Offene Punkte

1. **Der Judge ist ungetestet.** Ob ein starkes Modell fremde Entwürfe zuverlässig bewertet, ist
   nicht belegt; ein Judge, der Gefälligkeit belohnt, macht den Council wertlos.
2. **Rundenkosten.** Jede Runde multipliziert die Aufrufe; ohne `maxUsd` ist ein Council ein
   offenes Budget.
3. **Die Werkzeuge sind im Betrieb nicht angemeldet** (Grenze 2 des `crew-plugin`) — ein Council,
   der nicht auf Werkzeuge zugreifen kann, diskutiert nur über Text.
4. **Persistenz.** Der Planungskern speichert im Dateisystem; ein Council-Verlauf gehört in die
   Datenbank, sonst ist er nach einem Prozesswechsel weg.
5. **Keine Messung an echten Nutzern.** Alles oben ist Labor; ob der Council im Betrieb hilft,
   entscheidet der Betrieb.

---

## 10. Quellen

- Du, Y., Li, S., Torralba, A., Tenenbaum, J. B., & Mordatch, I. (2023). *Improving Factuality and
  Reasoning in Language Models through Multiagent Debate.* arXiv:2305.14325.
- Smit, A., Duckworth, P., Grinsztajn, N., Barrett, T. D., & Pretorius, A. (2024). *Should we be
  going MAD? A Look at Multi-Agent Debate Strategies for LLMs.* arXiv:2311.17371 (ICML 2024).
- Li, J., Zhang, Q., Yu, Y., Fu, Q., & Ye, D. (2024). *More Agents Is All You Need.* arXiv:2402.05120
  (TMLR).
- Wang, J. et al. (2024). *Mixture-of-Agents Enhances Large Language Model Capabilities.*
  arXiv:2406.04692 (ICLR 2025).
- Chen, L., Zaharia, M., & Zou, J. (2023). *FrugalGPT: How to Use Large Language Models While
  Reducing Cost and Improving Performance.* arXiv:2305.05176.

**Lokale Belege:** `packages/crew/plan/src/types.ts`, `packages/crew/plan/src/plan.ts`,
`packages/crew/crew-provider/README.md`, `packages/crew/crew-plugin/README.md`,
`packages/plugin/crew/src/server.ts`, `docs/subsystems/mirofish.md`, `packages/ai/tariffs`.

**Hinweis:** Dieser Bericht wurde mit KI-Unterstützung erstellt. Die zitierten Studien wurden über
ihre Abstracts geprüft; die lokalen Aussagen stammen aus dem Code und den READMEs des Repos.
