# Multi-Agent-Teams — was aus der Prometheus-Recherche gilt

> **Herkunft.** Kuratiert aus `H:\Projekt\Programmieren\Prometheus\docs\research\domain\MULTI_AGENT_COMMS_RESEARCH.md`
> (Stand 07.08.2026) und `…/research/agent/HARNESS_STEAL_LIST.md` (Stand 2026-08). Die
> Go-spezifischen Teile (Voice-Hub, Pods, `internal/comms`) sind nicht übernommen; die
> Muster sind es.

---

## 1. Das Datenmodell

Die Go-Recherche beschreibt einen Messenger, nicht ein Agenten-Framework — und genau das
macht das Modell brauchbar:

```
Channel  = Conversation
  ├─ ID, Name, Mode (text | speech | call)
  ├─ Members = ["user", "agent:ornith", "agent:phi", ...]
  └─ Turns[]  = chronologischer Feed

Turn = eine Nachricht
  ├─ Modality: text | voice
  ├─ Role:     user | assistant | system | tool
  ├─ Speaker:  user_spoken | agent_spoken
  ├─ Content:  Text (bei voice: Transkript)
  ├─ AudioRef: Pfad zur Rohdatei (nur voice)
  └─ Model:    welches Modell geantwortet hat
```

**Warum das für den Council taugt.** Ein Rat ist ein Channel mit mehreren Members und einem
Turn-Feed. Die Felder `Speaker` und `Model` sind der Unterschied zu einem Chat: Man sieht
nachher, **wer** (welche Persona, welches Modell) **was** gesagt hat. Ohne sie ist jede
Debatte ein Textbrei.

## 2. Die drei Lehren

### 2.1 Modality-Loop: rein = raus

Die Recherche nennt den Fehler beim Namen: Der Agent antwortete auf eine Sprachnachricht mit
Text und auf eine Textnachricht mit einem Transkript — „der Agent muss in der Modality
antworten, die reinkam". Für den Council heißt das: **Die Antwortform folgt der Frageform.**
Wer eine Prüfung anfordert, bekommt eine Prüfung — keinen Aufsatz.

### 2.2 Eine Kette, kein Framework

Der wichtigste Satz der ganzen Datei: *„Agent↔Agent: `TextTurn` mit `from="agent:phi"` kann
einen zweiten Agent via weiterem `TextTurn` triggern. (ponytail: eine Kette, kein generisches
Multi-Agent-Framework.)"*

Das ist die Zurückhaltung, die auch für den Dual Council gilt: **kein Orchestrator-Baum**,
sondern eine Folge von Turns mit klaren Rollen. Ein Framework wäre eine Abstraktion, die
niemand angefordert hat — und die man später gegen den eigenen Willen pflegen muss.

### 2.3 Wer triggert wen?

Die Recherche beantwortet das bewusst nicht vorab: *„Erst wenn User echte Agent↔Agent-Workflows
will."* Für den Council ist die Antwort einfach: **Der Richter triggert**, nicht die Kammern
untereinander. Sonst entsteht ein Gespräch ohne Ende.

## 3. Was andere Harnesses haben (aus der Steal-List)

Die Steal-List ist für das Go-Projekt geschrieben, aber sie ist ein **Spiegel** für den
Harness: Sie nennt Fähigkeiten, die andere Harnesses haben und die hier fehlen.

| Fähigkeit | Wer hat es | Bedeutung für den Council |
|---|---|---|
| **Modell-Rollen** `default`/`smol`/`slow`/`plan`/`advisor`/`tiny` | omp | Genau der Modell-Mix: Planner teuer, Worker billig. Kein Neubau nötig — das Muster existiert. |
| **Advisor-Modell** über jedem Turn | omp | Die kleinste Form des Dual Council: ein zweites Modell prüft, was das erste getan hat. |
| **Checkpointer in Postgres** (Resume, Time-Travel) | langgraph | Der Council-Verlauf gehört in die Datenbank, nicht ins Dateisystem. |
| **Passives Memory** (Embedding jedes Turns, ohne Tool-Call) | jcode | Der Rat könnte frühere Beanstandungen erinnern, ohne Token für Memory-Aufrufe zu verbrennen. |
| **Hashline-Edits** (Content-Hash-Anker statt String-Replace) | omp | Verhindert „string not found"-Schleifen und Stale-File-Korruption — relevant, sobald der Rat Code ändert. |
| **Swarm-Notify bei Datei-Kollision** | jcode | Erst relevant, wenn mehrere Agenten **parallel** schreiben. |

**Was die Liste über den Harness sagt.** Sie nennt Dinge, die der Harness **hat** (Skills,
Cron, `clarify`, Deferred Tools, Session-DB) — und Dinge, die er **nicht** hat (Modell-Rollen,
Advisor, Checkpointer, passives Memory). Für den Council sind die letzten vier die Baustellen.

## 4. Was daraus folgt

1. **Channel + Turn ist das Datenmodell** — nicht ein neues „Council-Objekt".
2. **Der Richter triggert**, die Kammern nicht untereinander.
3. **Rollen-Tiering ist belegt**, nicht erfunden (omp).
4. **Der Advisor ist der kleinste Anfang**: ein zweites Modell über jedem Turn, bevor man
   drei Kammern baut.
5. **Checkpointer vor Debatte**: Ohne Persistenz ist jeder Council-Verlauf nach einem
   Prozesswechsel weg.
