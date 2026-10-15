# Der Verwalterlauf — lebend gemessen

Stand: 15.10.2026, 12:54 UTC. **Der erste echte Lauf** des Verwalters: sieben Familien sondiert
(kostenlos) und von **DeepSeek Flash** auslegen lassen (`deepseek/deepseek-v4-flash-0731` über
OpenRouter), mit dem **Wächter** vor jedem Modellaufruf.

## Was herauskam

| Familie | Modelle | Wege, die die Sonde fand | Auslegung | Sicherheit |
|---|---|---|---|---|
| OpenRouter | 462 | **6** (alle) | nicht übernommen | 0,65 |
| DeepSeek | 2 | 2 (Chat) | nicht übernommen | 0,10 |
| Anthropic | 14 | 2 (Chat) | nicht übernommen | 0,20 |
| Z.ai | 11 | **6** (alle) | **übernommen** — „keine der bekannten Fähigkeiten" | 0,93 |
| ZenMux | 208 | **keine** | Ausleger **gescheitert** (Zeitüberschreitung) | — |
| Nous Research | 423 | 2 (Chat) | nicht übernommen | 0,60 |
| OpenCode Zen | 86 | **keine** | Ausleger **gescheitert** (Zeitüberschreitung) | — |

Ergebnis: **7 geprüft, 0 übersprungen, 0 gescheitert.** Katalog: 46 384 Zeichen JSON.

## Der Befund, der die Sache umdreht

**Die eine Auslegung, die übernommen wurde, war FALSCH.**

DeepSeek Flash legte für Z.ai mit Sicherheit **0,93** fest: *„der Dienst bietet nach dieser
Auslegung KEINE der bekannten Fähigkeiten an."* Die Sonde hat für **dieselbe** Familie im
**selben** Lauf gemessen: **alle sechs Wege vorhanden** — Chat, Sprache, Ton, Einbetten, Bild.

Damit steht fest: **die Schwelle allein schützt nicht.** 0,93 ist über jeder vernünftigen Grenze,
und die Antwort war trotzdem falsch. Eine Auslegung kann sich **sicher irren**.

Und der Grund ist sichtbar: **aus Namen läßt sich keine Fähigkeit ableiten.** Das Modell bekam eine
Liste von Kennungen und den Namen des Dienstes — mehr hatte es nicht. Ob ein Dienst einbettet,
steht nicht in seinen Modellnamen. Die Frage war **nicht beantwortbar**, und das Modell hat trotzdem
mit 0,93 geantwortet.

## Was die Bauweise trotzdem geleistet hat

**Sechs von sieben Auslegungen wurden NICHT als Tatsache eingetragen.** Der Katalog trägt bei ihnen
`auslegungOffen` mit dem Grund („unsicher", „zu unsicher", „gescheitert") statt einer Behauptung.
Die Wahrheit steht dort, wo sie gemessen wurde: in den **Wegen der Sonde**.

Hätte die Bauweise die Auslegung als Messung eingetragen, stünde jetzt für OpenRouter, DeepSeek,
Anthropic und Nous ein Modell-Urteil im Katalog, das niemand geprüft hat — und Z.ai stünde als
„kann nichts" darin, obwohl sechs Wege antworten.

## Drei weitere Messungen

**Der Ausleger ist LANGSAM.** 73,4 s · 51,7 s · 10,0 s · 72,8 s · 68,0 s für fünf Auslegungen; zwei
weitere liefen in die **Frist von 120 s**. Die **Sonden** dagegen brauchten 0,9 bis 6,5 s. Ein
voller Lauf über sieben Familien dauert also **über zehn Minuten** — nicht wegen des Netzes,
sondern wegen des Auslegers.

**Die Modelllisten ÄNDERN sich.** ZenMux nannte in der Erkundung **207** Modelle, im Lauf **208**.
Das ist der Beweis, daß ein Katalog veralten kann — und der Grund, warum es diesen Verwalter gibt.

**Der Zähler des Schlüssels hinkt nach — jetzt belegt.** Früher stand er unverändert bei
0,00045874 $, während die Antworten zusammen 0,0028 $ meldeten; das habe ich damals nicht erklären
können. Jetzt steht er bei **0,03224358 $**. Er holt also auf. **Was der Verwalterlauf allein
gekostet hat, ist daraus nicht zu trennen** — ich nenne die Zahl deshalb nicht.

## Was daraus folgt

1. **Die Auslegung muß gegen die Sonde geprüft werden.** Widerspricht sie dem, was die Sonde
   gemessen hat, gehört der **Widerspruch** in den Katalog — nicht die Auslegung. Das ist die
   Änderung, die dieser Lauf erzwingt.
2. **Die Frage muß beantwortbar sein.** Aus Kennungen allein läßt sich die Fähigkeit nicht ableiten.
   Der Ausleger braucht die **Antwort der Models-API** (die Kennungen) **und** die **Wegbefunde der
   Sonde** — dann beurteilt er nicht ins Leere, sondern prüft.
3. **Die Frist muß großzügiger sein** (oder das Modell ein anderes): 120 s reichen für 200 Kennungen
   nicht.

## Zweiter Lauf, 13:09 UTC — nach den beiden Änderungen

Geändert wurde: der Ausleger bekommt die **Wegbefunde der Sonde** als Eingabe, und jede Auslegung
wird **gegen die Messung** geprüft (`widerspruchZwischen`). Die Frist steht auf **300 s**.

| Familie | Modelle | Wege (Sonde) | Ergebnis der Auslegung |
|---|---|---|---|
| OpenRouter | 461 | 6 | nicht übernommen (0,60) |
| DeepSeek | 2 | 2 | nicht übernommen (0,00) |
| Anthropic | 14 | 2 | nicht übernommen (0,30) |
| Z.ai | 11 | **6** | nicht übernommen (**0,00**) |
| ZenMux | 208 | keine | nicht übernommen (0,85) |
| **Nous Research** | 422 | 2 | **WIDERSPRUCH** |
| OpenCode Zen | 86 | keine | nicht übernommen (0,00) |

### Was die Änderung geleistet hat

**Der Widerspruch fing einen echten Fall — bei einer ANDEREN Familie.** Nous Research: das Modell
behauptete **Sprache, Ton, Einbetten und Bild**, während die Sonde für alle vier **404** gemessen
hatte. Im Katalog steht jetzt der Widerspruch, nicht die Behauptung:

> „Text zu Sprache": der Weg gibt 404, die Auslegung sagt „gibt es"; „Sprache zu Text": …;
> „Einbetten": …; „Bild": …

**Und Z.ai ist nicht wieder falsch geworden — sondern ehrlich.** Im ersten Lauf legte das Modell
hier mit **0,93** fest, der Dienst biete nichts. Jetzt sagt es **0,00**. Die verbesserte Frage hat
aus einer **sicheren falschen** Antwort eine **unsichere** gemacht — und eine unsichere Antwort
wird nicht eingetragen. Das ist der Unterschied, auf den es ankommt.

### Und die unbequeme Messung dazu

**Keine der sieben Auslegungen wurde übernommen.** Sechs waren zu unsicher, eine widersprach der
Messung. Der Ausleger hat in diesem Lauf **nichts** zum Katalog beigetragen — und dafür

**628 Sekunden** gebraucht (87,5 · 75,4 · **139,4** · 55,2 · 101,5 · 129,3 · 37,6 s), also gut zehn
Minuten. Die Sonden brauchten zusammen **17,2 s**.

**Das ist kein Fehler der Schwellen.** Das Modell antwortet mit niedriger Sicherheit, weil die Frage
**nicht beantwortbar** ist: aus Modellnamen folgt keine Fähigkeit. Die niedrige Sicherheit ist die
**richtige** Antwort. Die Schwellen richtig zu stellen, indem man sie senkt, hieße: die falschen
Antworten wieder durchlassen.

**Zwei Änderungen am Katalog zwischen den Läufen, ohne Zutun:** OpenRouter 462 → **461** Kennungen,
Nous 423 → **422**. Die Listen bewegen sich — der Grund, warum es diesen Verwalter gibt.

### Der ehrliche Schluß

Die **Sonde** ist der verläßliche Teil: schnell, kostenlos, geprüft, mit Gegenprobe. Der
**Ausleger** trägt derzeit **nichts** bei und kostet zehn Minuten. Wer ihn behalten will, muß ihm
eine **beantwortbare** Frage stellen — oder ein Modell nehmen, das sie beantworten kann. Beides ist
**nicht** gemessen. Bis dahin gilt: der Katalog lebt von der Sonde, und die Auslegung steht als
**offen** darin, mit Grund.

