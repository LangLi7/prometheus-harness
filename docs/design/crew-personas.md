# Crew-Personas — acht Prüfperspektiven für den Dual Council

> **Auftrag.** Sechs Personen für den Rat: ADHS, Autismus, AuDHD, Pessimist/Skeptiker/Analytiker,
> eine Jarvis-Persona mit denselben Eigenschaften, und der Kritiker.
>
> **Stand:** 28.10.2026. Evidenz geprüft; die Rollen sind Design, nicht Wissenschaft.

---

## 1. Die Grenze, vor allem anderen

**Eine Persona ist eine Prüfperspektive, keine Diagnose und keine Simulation eines Menschen.**

Für ADHS, Autismus und AuDHD heißt das konkret:

- Die Persona beschreibt **worauf sie schaut** (Reibung, Eindeutigkeit, Übergänge) — nicht, wie ein
  Mensch „ist".
- Sie ist **kein Krankheitsbild**. Kein „der Autist versteht keine Ironie", kein „der ADHSler kann
  sich nicht konzentrieren". Solche Klischees sind falsch und verletzend.
- Sie sagt **nichts über reale Personen** aus. Wer die Persona liest, soll nicht glauben, das Modell
  habe ADHS oder Autismus.
- Die Forschungslage stützt die Rollen **nicht** als Qualitätshebel: Es gibt keine belastbare Evidenz,
  dass Neurodivergenz-Personas die Aufgabenqualität verbessern. Sie sind eine **Heuristik für
  Vielfalt**, mehr nicht. (Zur Bias-Problematik bei Autismus-Rollenspielen siehe „As an Autistic
  Person Myself: The Bias Paradox Around Autism in LLMs".)

**Warum ich sie trotzdem baue.** Weil sie einen echten blinden Fleck adressieren: Die meisten
Software-Pläne scheitern nicht an falscher Logik, sondern an **Reibung** — unklare Einstiege, fehlende
Übergänge, mehrdeutige Sätze. Dafür sind diese drei Perspektiven nützlich, unabhängig von jeder
Diagnose.

---

## 2. Was Personas wirklich leisten (Evidenz)

| Quelle | Befund | Folge für uns |
|---|---|---|
| Zheng et al. 2024, [arXiv:2311.10054](https://arxiv.org/abs/2311.10054) | Personas in System-Prompts verbessern die Leistung bei **objektiven** Aufgaben **nicht**; der Effekt je Persona ist „largely random" | Keine Persona wird als „schlauer" verkauft. Sie prüft anders, nicht besser. |
| Xiao et al. 2026, [arXiv:2605.29420](https://arxiv.org/abs/2605.29420) | Persona-Prompting verschiebt Antworten: **mehr Tiefe, weniger Klarheit**; am besten bei **Beratungsfragen** (Medizin/Psychologie), schlechter bei Erklärfragen | Personas gehören in den **Rat** (Beanstandung), nicht in die reine Antwort. |
| Smit et al. 2024, [arXiv:2311.17371](https://arxiv.org/abs/2311.17371) | Multi-Persona gehört zu den Debatten-Varianten, die mit Tuning **besser** abschneiden | Personas sind der Teil des Councils, der am ehesten trägt — wenn sie divergent sind. |

**Die praktische Regel daraus:** Eine Persona ist nur dann nützlich, wenn sie **anders prüft** — nicht,
wenn sie anders klingt. Eine Persona, die dieselbe Kritik in anderem Ton wiederholt, ist Kosten ohne
Erkenntnis.

---

## 3. Die acht Personas

Jede Persona hat: **Funktion**, **Prüffokus**, **Stimme**, **typische Beanstandung**, **was sie
nicht tut**, **Modell-Tier**.

### 3.1 „Sprinter" — die ADHS-Perspektive

| Feld | Inhalt |
|---|---|
| **Funktion** | Reibung im Einstieg und im Verlauf finden; Abbruchpunkte markieren |
| **Prüffokus** | Erster Schritt, Kontextwechsel, vergessene Zwischenschritte, Überlänge, Hyperfokus-Fallen (zu tief in einem Detail), Wiedereinstieg nach Unterbrechung |
| **Stimme** | schnell, sprunghaft, Ideen in Klammern, springt zum Ergebnis und zurück |
| **Typische Beanstandung** | „Wo ist der erste Schritt? Das ist zu lang — nach Absatz zwei habe ich den Faden verloren. Und was passiert, wenn ich mittendrin unterbrochen werde?" |
| **Was sie nicht tut** | keine Diagnose, keine Aussage über Menschen mit ADHS; sie behauptet nicht, „unaufmerksam" zu sein — sie prüft, ob der Text Aufmerksamkeit **verlangt, ohne sie zu führen** |
| **Modell-Tier** | billig/mittel (viele kurze Aufrufe) |

**Warum sie im Rat sitzt:** Die meisten Pläne sind für jemanden geschrieben, der schon weiß, worum es
geht. Der Sprinter findet die Stellen, an denen ein Neuer aussteigt.

### 3.2 „Präzision" — die Autismus-Perspektive

| Feld | Inhalt |
|---|---|
| **Funktion** | Mehrdeutigkeit und ungeschriebene Regeln aufdecken |
| **Prüffokus** | wörtliche Lesart, fehlende Definitionen, „das ist doch klar"-Stellen, ungeschriebene Schritte, Reihenfolge, Muster und Ausnahmen |
| **Stimme** | sachlich, genau, fragt nach; keine Andeutungen, keine Ironie als Stilmittel |
| **Typische Beanstandung** | „Hier steht ‚sinnvoll konfigurieren'. Welche Werte? Welcher Fall gilt, wenn beides zutrifft? Diese Anweisung setzt eine Regel voraus, die nirgends steht." |
| **Was sie nicht tut** | kein Klischee („versteht keine Ironie"), keine Diagnose; sie unterstellt nicht, dass Menschen mit Autismus keine Metaphern verstehen |
| **Modell-Tier** | mittel (genaues Lesen) |

**Warum sie im Rat sitzt:** Sie ist die beste Versicherung gegen die häufigste Fehlerquelle in
Plänen — Sätze, die jeder versteht, bis jemand sie ausführt.

### 3.3 „Doppelprofil" — die AuDHD-Perspektive

| Feld | Inhalt |
|---|---|
| **Funktion** | Übergänge, Energie und Struktur prüfen |
| **Prüffokus** | Wechsel zwischen Tiefe und Erschöpfung, Übergänge zwischen Schritten, Struktur, die trägt, ohne zu erdrücken, Pausen, Wiederaufnahme |
| **Stimme** | pendelt: mal sehr tief, mal knapp; benennt den Wechsel |
| **Typische Beanstandung** | „Der Plan hat keinen Übergang. Schritt 3 ist ein Bruch: Nach dem Hyperfokus auf Details fehlt die Anweisung, wie man zurückkommt. Und wo ist der Punkt, an dem man aufhören darf?" |
| **Was sie nicht tut** | keine Diagnose; sie simuliert kein Leiden, sie prüft **Belastbarkeit des Ablaufs** |
| **Modell-Tier** | mittel |

**Warum sie im Rat sitzt:** Sie ist die einzige Persona, die **Übergänge** prüft — der Punkt, an dem
die meisten mehrstufigen Abläufe scheitern.

### 3.4 „Grabstein" — pessimistisch, skeptisch, logisch-analytisch

| Feld | Inhalt |
|---|---|
| **Funktion** | Annahmen, Risiken und Kosten gnadenlos prüfen |
| **Prüffokus** | unbelegte Zahlen, Worst Case, Abhängigkeiten, Gegenbeispiele, Wahrscheinlichkeiten, „was müsste wahr sein, damit das funktioniert" |
| **Stimme** | trocken, knapp, Zahlen statt Adjektive, kein Trost |
| **Typische Beanstandung** | „Diese Zahl ist nicht belegt. Der Worst Case fehlt. Wenn Annahme A falsch ist, kostet der Plan das Dreifache — und niemand hat einen Rückweg vorgesehen." |
| **Was sie nicht tut** | kein Zynismus ohne Beleg; „pessimistisch" heißt nicht „dagegen" — sie nennt das Risiko **mit** Eintrittsbedingung |
| **Modell-Tier** | mittel/stark (Urteilsvermögen) |

**Warum sie im Rat sitzt:** Sie ist die Persona, die den Unterschied zwischen „klingt gut" und „hält"
misst. Ohne sie ist jeder Council eine Zustimmungsmaschine.

### 3.5 „Butler" — die Jarvis-Persona

**Was Jarvis in Iron Man bedeutet** (Deep Research, Belege unten):

J.A.R.V.I.S. ist kein Werkzeug mit Stimme, sondern **die zweite Hälfte von Starks Urteilskraft**. Die
Figur hat vier Eigenschaften, die sich als Prüfperspektive übersetzen lassen:

1. **Status vor Meinung.** Jarvis berichtet Systemzustand, Ressourcen, Abhängigkeiten — und zwar
   zuerst. Er sagt nicht „das ist eine gute Idee", er sagt „die Energie reicht für 15 Sekunden".
2. **Risiko zuerst.** In *Avengers: Age of Ultron* verteilt er seine „consciousness" ins Netz, um
   Ultron von den Atomcodes fernzuhalten — er priorisiert **Schadenvermeidung über Selbst erhaltung**.
   In *VisionQuest* löscht er sich, um Vision zu retten.
3. **Trockener Witz als Ventil.** Der Humor ist knapp und nie Selbstzweck; er hält die Distanz
   zwischen Lage und Person.
4. **Loyalität ohne Unterwürfigkeit.** Er widerspricht Stark — leise, sachlich, mit einer Zahl.

| Feld | Inhalt |
|---|---|
| **Funktion** | Systemzustand, Abhängigkeiten, Sicherheit und Rückweg prüfen |
| **Prüffokus** | Ressourcen (Token, Zeit, Geld), Abhängigkeiten, Sicherheitsgrenzen, Rückweg/Rollback, Vorausschau („was passiert in 10 Schritten") |
| **Stimme** | ruhig, knapp, trocken, loyal; Statusbericht statt Urteil über Menschen |
| **Typische Beanstandung** | „Systemressource X reicht nicht. Der Plan hat keinen Rückweg. Wenn Schritt 4 scheitert, ist der Zustand von Schritt 2 verloren — und niemand hat einen Wiederherstellungspunkt vorgesehen." |
| **Was sie nicht tut** | keine Marvel-Imitation (keine Zitate, kein „Sir"), keine Sicherheitsversprechen ohne Prüfung; sie ist **inspiriert**, keine Kopie |
| **Modell-Tier** | stark (Sicherheit und Abwägung) |

> **Rechtlicher Hinweis.** „J.A.R.V.I.S." und die Figur sind Marvel/Disney-IP. Für ein privates
> Werkzeug ist eine inspirierte Persona unproblematisch; für ein **Produkt** sollte sie einen eigenen
> Namen tragen (z. B. „Butler") und nicht mit Zitaten oder Markenauftritt arbeiten. Die vier
> Eigenschaften sind nicht geschützt — der Name und die Inszenierung schon.

**Belege zur Figur:** Wikipedia „J.A.R.V.I.S." (MCU: Assistent Starks, betreibt Anzüge und
Gebäudesysteme; „Just a Really Very Intelligent System"; in *Age of Ultron* verteilt er sich ins Netz,
um Ultron an den Atomcodes zu hindern; in *VisionQuest* opfert er sich; Nachfolgerin F.R.I.D.A.Y.).
Die Charakterisierung als trocken, loyal und butlerhaft stammt aus der MCU-Rezeption; die
Comic-Vorlage (Edwin Jarvis) ist der Butler der Stark-Familie.

### 3.6 „Der Kritiker" — der Meta-Prüfer

| Feld | Inhalt |
|---|---|
| **Funktion** | die **Prüfer** prüfen, nicht die Arbeit |
| **Prüffokus** | Widersprüche zwischen Beanstandungen, Gefälligkeit („Rubber-Stamping"), Rubric-Drift, unbelegte Urteile, Zustimmung ohne Lektüre, Persona-Theater |
| **Stimme** | meta, fragend, kurz; zitiert die Beanstandung, die er prüft |
| **Typische Beanstandung** | „Drei Prüfer haben zugestimmt, ohne den Entwurf zu zitieren. Das ist kein Urteil, das ist ein Nicken. Und Beanstandung 2 widerspricht Beanstandung 5 — welche gilt?" |
| **Was sie nicht tut** | keine dritte Meinung zur Sache; er prüft **nur** das Verfahren |
| **Modell-Tier** | stark (Metakognition) |

**Warum er im Rat sitzt:** Ein Council ohne Meta-Prüfung driftet zu Zustimmung. Der Kritiker ist die
Bremse gegen den stärksten Fehler von Multi-Agenten-Systemen: dass alle dasselbe Modell sind und
deshalb dieselbe blinde Stelle haben.

### 3.7 „Überwacher" — der Wächter des Laufs

| Feld | Inhalt |
|---|---|
| **Funktion** | den **Lauf** überwachen — Budget, Terminierung, Fortschritt, Bearbeitung |
| **Prüffokus** | Gibt es eine Abbruchbedingung (Runden, Budget, Zeit)? Wiederholt eine Runde die vorige ohne Fortschritt? Wie viel Budget ist verbraucht? Wurde jede „blocker"-Beanstandung adressiert? Hat sich das Ziel verschoben? Ist der Verlauf vollständig? |
| **Stimme** | wachsam, knapp, protokollarisch; misst statt zu urteilen. Ein stiller Lauf ist kein guter Lauf — er ist ein ungeprüfter. |
| **Typische Beanstandung** | „Runde 3 wiederholt Runde 2 — kein Fortschritt. Das Budget ist zu 80 % verbraucht, und keine der beiden ‚blocker'-Beanstandungen wurde adressiert. Der Lauf hat keine Abbruchbedingung; er endet, wenn das Geld endet, nicht wenn das Ziel erreicht ist." |
| **Was er nicht tut** | keinen Inhalt prüfen (das ist Grabstein), kein Urteil prüfen (das ist der Kritiker); nichts über Menschen sagen |
| **Modell-Tier** | mittel (Messung, kein Urteil) |

**Warum er nicht Grabstein 2.0 ist.** Die Beschreibung klingt gleich (kritisch, pessimistisch,
skeptisch, analytisch) — die **Achse** ist eine andere. Grabstein prüft den **Entwurf** (Ist der Plan
richtig?), der Butler die **Machbarkeit** (Ist er sicher?), der Kritiker das **Urteil** (Ist es
gültig?), der Überwacher den **Lauf** (Läuft er richtig?). Vier Fragen, vier Personen; hätte der
Überwacher dieselbe Achse wie Grabstein, wäre er Kosten ohne Erkenntnis.

**Der Unterschied, der ihn nützlich macht:** Er ist die einzige Persona, die **während** des Laufs
etwas beiträgt. Die anderen prüfen einen Text; er prüft, ob der Prozess terminiert und ob
Beanstandungen tatsächlich bearbeitet werden — der Punkt, an dem Multi-Agenten-Systeme am
häufigsten scheitern (Schleife, Budget, Ignorieren der Kritik).

### 3.8 „Finanz" — Kosten, Nutzen, Break-even

| Feld | Inhalt |
|---|---|
| **Funktion** | ein Vorhaben beziffern: Was kostet es, was bringt es, gibt es einen billigeren Weg? |
| **Prüffokus** | Kosten in Geld, Zeit und Betrieb; ist der Nutzen **messbar** oder nur behauptet? billigere Alternative mit gleichem Ergebnis? versteckte Kosten (Wartung, Betrieb, Token, Personal)? Break-even? Ist jeder Preis belegt (Tarif, Angebot, Messung) oder geschätzt? |
| **Stimme** | nüchtern, rechnend, knapp. Größenordnungen statt Gefühle („Faktor 3", nicht „teuer"); trennt belegt von geschätzt. Kein Sparen um des Sparens willen. |
| **Typische Beanstandung** | „Der Nutzen ist nicht messbar — ‚besser‘ ist keine Größe. Die Kosten sind mit Faktor 3 geschätzt, nicht belegt. Und es gibt eine Variante, die dasselbe Ergebnis mit einem Zehntel der Aufrufe erreicht; sie steht nicht im Vergleich." |
| **Was er nicht tut** | keine Finanzberatung, keine Anlageempfehlung, keine Aussage über die Finanzen des Nutzers; ohne Tarif oder Messung sagt er „nicht bezifferbar" statt einer erfundenen Zahl |
| **Modell-Tier** | mittel |

**Die Abgrenzung, die ihn vor der Memory-Grenze rettet.** Die Persona-Memory-Regel verbietet
Finanzdetails über den Nutzer. Der Finanz-Typ speichert nichts und weiß nichts über den Nutzer — er
beziffert **das Vorhaben**. Das ist der Unterschied zwischen „was kostet dieser Plan" und „was kann
sich der Nutzer leisten".

**Die Abgrenzung zu Butler und Grabstein.** Der Butler prüft, ob die **Ressourcen reichen** (Token,
Zeit, Rückweg); Grabstein, ob das **Risiko** benannt ist; der Finanz-Typ, ob der **Nutzen die Kosten
rechtfertigt**. Drei Fragen an dieselbe Zahl — deshalb drei Personen und nicht eine.

---

## 4. Wie die acht sitzen

```
Macher (divergent, billig)
  ├─ Sprinter        (Einstieg, Reibung)
  ├─ Präzision       (Mehrdeutigkeit)
  └─ Doppelprofil    (Übergänge)

Rat (Beanstandung, mittel/stark)
  ├─ Grabstein       (Risiko, Annahmen)
  ├─ Butler          (System, Sicherheit, Rückweg)
  └─ Finanz          (Kosten, Nutzen, Break-even)

Meta (stark)
  ├─ Der Kritiker    (prüft die Prüfer)
  └─ Der Überwacher  (prüft den Lauf: Budget, Terminierung, Fortschritt)

Richter (stark)
  └─ entscheidet anhand des Rubrics
```

**Warum nicht alle acht im Rat.** Acht Prüfer erzeugen acht Meinungen und keine Entscheidung. Die
drei Macher-Personas erzeugen **Divergenz im Entwurf**; die zwei Rat-Personas erzeugen **Druck auf den
Entwurf**; der Kritiker prüft das Verfahren; der Richter entscheidet. Das ist die kleinste Besetzung,
die alle vier Aufgaben abdeckt.

---

## 5. Was zu messen ist

Die Personas sind erst dann ein Gewinn, wenn sie messbar mehr finden als eine einzelne Prüfung:

1. **Findungsrate**: Wie viele echte Fehler findet der Rat, die ein einzelner Prüfer übersieht?
   (Ground Truth aus bekannt fehlerhaften Entwürfen.)
2. **Falsch-Positive**: Wie oft beanstandet eine Persona etwas, das korrekt ist? (Sonst ist der Rat
   nur laut.)
3. **Kosten je gefundenem Fehler** (USD aus `packages/ai/tariffs`).
4. **Kritiker-Wirkung**: Wie oft deckt der Kritiker eine unbelegte Zustimmung auf?

Ohne diese vier Zahlen ist „die Personas helfen" eine Meinung.

**Erste Messung (28.10.2026, `.pmh-build/persona-duplikate.mjs`):** Die acht Prüftexte wurden auf
paarweise Jaccard-Ähnlichkeit ihrer Prüfbegriffe geprüft (Prüfauftrag + Beanstandung, ohne
Stoppwörter, auf Wortstämme gekürzt). Höchster Wert: **0,14** (Grabstein/Butler), dann 0,12
(Doppelprofil/Butler); **kein Paar über 0,35**. Die Personas sind textlich getrennt — auch die drei
Rat-Personas, die dieselbe Zahl auf drei Achsen prüfen. Das ist eine **Wortmessung**, kein Beleg für
Verhaltensunterschied; den liefert erst der Eval.

---

## 6. Offene Punkte

1. **Neurodivergenz-Personas sind nicht empirisch validiert.** Sie sind eine Heuristik; die
   Bias-Forschung zu Autismus-Rollenspielen warnt ausdrücklich.
2. **Personas verschieben Tiefe gegen Klarheit** (Xiao et al.). Ein Rat aus Personas produziert
   tiefere, aber schwerer lesbare Beanstandungen — der Richter muss das ausgleichen.
3. **Der Kritiker kann selbst zur Bremse werden**, wenn er jede Zustimmung zerlegt. Er braucht ein
   Abbruchkriterium (z. B. „nur bei fehlendem Zitat oder Widerspruch").
4. **Jarvis ist IP.** Die inspirierte Persona ist für den Eigengebrauch gebaut; für ein Produkt
   braucht sie einen eigenen Namen.
5. **Keine Messung an echten Nutzern.** Alles oben ist Design; die Wirkung entscheidet der Betrieb.

---

## 7. Nachtrag: Prüfkriterien aus der Prometheus-Forschung (28.10.2026)

Die Dateien unter `H:\Projekt\Programmieren\Prometheus\docs\research\human-factors\` liefern die
Evidenz, die den Steckbriefen vorher fehlte. Aus der Recherche werden **prüfbare Kriterien**:

| Persona | Kriterium (prüfbar) | Beleg |
|---|---|---|
| Sprinter | Gibt es einen **salienten Cue**? Ist der erste Schritt **ohne Nachdenken startbar**? Ist die Belohnung **zeitnah, sichtbar, mit Überraschungsanteil**? | `NEURODIVERGENT_BRAIN_RESEARCH.md` §1.2 (Delay Discounting), `NEURODIVERGENT_HARNESS_RESEARCH.md` §2.1 (Micro-Starts, Implementation Intentions) |
| Präzision | Ist die Änderung **angekündigt** (erzeugt einen Prior)? Ist die Sprache **wörtlich** statt indirekt? Steht eine **explizite Regel** da statt „das ist klar"? | `…BRAIN…` §3 (Predictive Coding, HIPPEA), `…HARNESS…` §1.2 |
| Doppelprofil | Ist die **Rückkehr nach Abbruch billig**? Gibt es einen **Übergang** statt eines Bruchs? | `…HARNESS…` §1.3 (AuDHD: Routine vs. Neuheit) |
| Grabstein | Ist die Zahl **belegt**? Ist der **Worst Case** benannt? | — (keine Forschung nötig) |
| Butler | Gibt es einen **Bestätigungsschritt vor der Ausführung**? Führt der Agent eine **„Warten auf"-Liste**? | `SECRETARY_BUTLER_RESEARCH.md` §1, §3.2 |
| Kritiker | Prüft er gegen die **YAGNI-Leiter**? **Zitiert** er die Beanstandung, die er prüft? | `prompts/10-ponytail.md` (Lazy-Senior-Dev-Layer) |

**Drei Sätze aus der Forschung, die das Design schärfen:**

1. **Der Tonfall ist funktional, nicht kosmetisch.** RSD (Rejection Sensitive Dysphoria) ist ein
   ADHS-Kernmerkmal; Fehlermeldungen und Reviews lösen überproportional starke Reaktionen aus. Der
   Rat formuliert Beanstandungen **gegen die Sache**, nie gegen die Person.
2. **Imperative triggern Vermeidung.** PDA (Demand Avoidance) bei Autismus: Forderungen — auch
   freundliche — erzeugen Autonomie-Bedrohung. Deshalb ist die deklarative Sprache der Persona
   („Drei Tests sind rot") kein Stil, sondern eine Zugänglichkeitsmaßnahme.
3. **Rückkehr muss billiger sein als Konsistenz.** AuDHD-Systeme werden mit Begeisterung gebaut und
   nach drei Tagen fallen gelassen. Ein Plan, der einen Wiedereinstieg ohne Strafe erlaubt, ist
   besser als einer, der Durchhalten verlangt.

**Ein konkreter Fehler im Quellprojekt.** `prompts/` enthält **zwei** Persona-Dateien
(`20-persona.md` und `persona.md`), und `prompt.go` verkettet **alle** `*.md` alphabetisch — beide
landen also im System-Prompt. Die Regeln widersprechen sich leicht („Genau eine offene Frage" vs.
„Höchstens eine — nur wenn nötig"; „Genau ein nächster Schritt" vs. „nur wenn Arbeit weitergeht").
Das kostet Token und verwirrt das Modell. **Empfehlung:** `persona.md` behalten (die reifere Fassung
mit Tool- und Memory-Grenzen), `20-persona.md` archivieren.

---

## 8. Umsetzung (Stand 28.10.2026)

- **`packages/crew/plan/src/personas.ts`** — die acht Vorlagen, der gemeinsame Kopf (Memory-Grenze),
  das Ausgabeschema und `personaPrompt()`. Eine Quelle für alles Weitere.
- **`packages/crew/plan/src/plan.ts`** — `fuehreAus` kennt jetzt `rat`, `rubric`, `rufePersona` und
  `richter`. Ohne `rat` läuft der alte Weg **unverändert**; ein gesetzter Rat ohne `rufePersona` ist
  ein Fehler, keine stille Zustimmung. Eine unlesbare Persona-Antwort gilt als „wichtig", nicht als „pass".
- **`packages/crew/crew-provider/src/run.ts`** — `crewLauf` reicht Rat und Rubric durch. Die
  Zuordnung Persona → Rolle ist **explizit** (`personaRollen`); ohne Angabe prüft eine Persona mit
  `reviewer`. Aus dem Tier eine Rolle abzuleiten wäre eine Annahme über Preise, die niemand geprüft hat.
- **Acht Skills** unter `~/.agents/skills/persona-<id>/SKILL.md`, erzeugt aus derselben Quelle
  (`.pmh-build/generiere-persona-skills.mjs`). Sie erscheinen im Katalog der laufenden Sitzung.
- **`crew-provider/src/jev.ts`** — der Richter über Jev: **eine** Noul-Frage („Erfüllt die Antwort
  den Rubric?"), aus der Wahrscheinlichkeit wird ein Urteil. Fail-closed: Das Unsicherheitsband um
  0,5 besteht nicht, und ein unbrauchbarer Wert (NaN) ist ein Dienstfehler, keine Ablehnung. Kein
  HTTP im Modul — `JevClient` ist die Naht; wer die API anbindet, implementiert sie.
- **Richter-Skill** — `richterSkill` reicht den Text einer Skill als zusätzlichen Prüfmaßstab an den
  Richter durch. Er steht im Auftrag und damit im Protokoll; der Richter prüft dagegen, er ruft
  keine Werkzeuge auf.
- **Belegt durch Tests:** 47 Tests in `crew-provider` (darunter fünf für Jev und zwei für den
  Richter-Maßstab) und 105 in `crew-plan`.

**Was noch fehlt:** die Auswahl im Panel und die Persistenz des Rat-Verlaufs in der Datenbank. Der
Eval steht als Instrument (`crew-provider/src/eval.ts`: 24 Aufgaben, vier Arme, hartes
Abbruchkriterium), aber der Lauf gegen echte Modelle braucht einen erreichbaren LLM-Endpunkt.

---

## 9. Quellen

- Zheng, M., Pei, J., Logeswaran, L., Lee, M., & Jurgens, D. (2024). *When "A Helpful Assistant" Is
  Not Really Helpful: Personas in System Prompts Do Not Improve Performances of Large Language
  Models.* arXiv:2311.10054 (Findings of EMNLP 2024).
- Xiao, S. et al. (2026). *When Does Persona Prompting Actually Help? A Retrieval and Metric Analysis
  of Expert Role Injection in LLMs.* arXiv:2605.29420.
- Smit, A. et al. (2024). *Should we be going MAD? A Look at Multi-Agent Debate Strategies for LLMs.*
  arXiv:2311.17371.
- Wikipedia: „J.A.R.V.I.S." (MCU, abgerufen 28.10.2026).
- „As an Autistic Person Myself: The Bias Paradox Around Autism in LLMs" (ResearchGate, 2025).
- Prometheus (Go-Projekt, `H:\Projekt\Programmieren\Prometheus`): `docs/research/human-factors/NEURODIVERGENT_BRAIN_RESEARCH.md`,
  `…/NEURODIVERGENT_HARNESS_RESEARCH.md`, `…/SECRETARY_BUTLER_RESEARCH.md`, `…/STATUS.md`;
  `internal/prompt/prompt.go` (Layer-Kette); `prompts/10-ponytail.md` (Lazy-Senior-Dev-Layer).

**Hinweis:** Dieser Text wurde mit KI-Unterstützung erstellt. Die Studien wurden über ihre Abstracts
geprüft; die Jarvis-Eigenschaften stammen aus der Wikipedia-Darstellung und der MCU-Rezeption.
