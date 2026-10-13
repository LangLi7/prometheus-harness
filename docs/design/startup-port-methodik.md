# Die Startup-Methodik: auto-port, wenn `3080` belegt ist

> **Gemessen:** 13.10.2026 · Windows nativ · Bun 1.4.0 · Sonde:
> [`port-test.ps1`](../../scripts/port-test.ps1) · Modul: [`port-wahl.mjs`](../../scripts/port-wahl.mjs)
> · 16 Tests: [`scripts/tests/port-wahl.test.mjs`](../../scripts/tests/port-wahl.test.mjs)

## 1. Das Problem, und warum „prüfen" die falsche Antwort ist

Der Standardport `3080` kann belegt sein — von einer laufenden Harness, von einem
Docker-Container oder von irgendetwas anderem. Auf diesem Rechner **ist** er
belegt: `node.exe` (PID 22260) hält ihn, mit aktiven Verbindungen aus einem
Browser. Das ist der Normalfall, nicht die Ausnahme.

**Der naheliegende Weg** ist, den Port zu **prüfen** (Verbindung aufbauen) und
dann zu starten. Er hat zwei Fehler:

| # | Fehler | Warum er zählt |
|---|---|---|
| 1 | **Zwei Adressfamilien** | `0.0.0.0` und `::` sind getrennt. Ein Port kann auf `127.0.0.1` belegt und auf `::1` frei sein — gemessen auf diesem Rechner: genau so ist es bei 3080 |
| 2 | **Der Wettlauf** | zwischen Prüfung und Bindung kann ein anderer Prozess den Port nehmen. Öfter prüfen hilft nicht — es ist ein Wettlauf |

## 2. Die Methodik: **binden statt fragen**

```
1. Port BINDEN (127.0.0.1 UND ::1 — beide müssen frei sein)
2. sofort wieder freigeben
3. den Port dem Host übergeben
```

Wer einen Port **halten** kann, hat ihn. Diese Prüfung ist die einzige, die nicht
raten kann — und sie prüft **beide** Adressfamilien, weil der Browser den Host je
nach Auflösung über `127.0.0.1` oder `::1` erreicht.

**Das Restfenster ist benannt.** Zwischen Freigabe (Schritt 2) und Bindung durch
den Host liegen **Mikrosekunden**. Wird der Port genau dort genommen, scheitert
der Host **sichtbar** — und das ist der richtige Ausgang, kein stiller Fehlstart.
Die Alternative wäre, den Port zu halten und weiterzureichen — das kann Node/Bun
nicht über eine Prozessgrenze.

## 3. Die drei Fälle — alle gemessen

| Fall | Verhalten | Gemessene Ausgabe |
|---|---|---|
| **Port frei** | er wird genommen, ohne Umweg | `[pmh] Port 5780 (Standard) ist frei.`<br>`[pmh] Oberfläche: http://127.0.0.1:5780/` |
| **Port belegt** | nächster freier, **mit Begründung** | `[pmh] Port 5780 ist belegt — gewählt: 5781 (belegt: 5780)`<br>`[pmh] Oberfläche: http://127.0.0.1:5781/` |
| **belegt + `--strict-port`** | **sichtbarer Abbruch** | `[pmh] FEHLER: Kein freier Port im Bereich 5780–5780: belegt sind 5780. Ein anderer Port lässt sich mit --port <n> wählen.` |

**Der echte Fall auf diesem Rechner** (Port 3080 wird von der DSH-Harness
gehalten):

```
[pmh] Port 3080 ist belegt — gewählt: 3081 (belegt: 3080)
[pmh] Oberfläche: http://127.0.0.1:3081/
```

## 4. Die Entscheidungen dahinter, jede mit Preis

| Entscheidung | Warum | Der Preis |
|---|---|---|
| **`3080` als Standard** | dieselbe Adresse, unter der die Vorlage ausliefert — ein Benutzer kennt sie schon; jede Anleitung nennt dieselbe Zahl | wenn 3080 belegt ist, startet der Host woanders — deshalb **muss** die Ausgabe den Port nennen |
| **Ausweichen statt abbrechen** | ein belegter Port ist kein Fehler, sondern eine Umgebungstatsache | der Benutzer muss die Adresse aus der Ausgabe **lesen** statt sie zu kennen |
| **Fester Bereich (20 Ports), kein Zufall** | ein zufälliger Port ist nicht wiederfindbar: Neustart ergibt eine andere Adresse, Lesezeichen und Anleitungen werden falsch | bei 20 belegten Ports in Folge bricht der Start ab — mit einem Hinweis auf `--port` |
| **`--strict-port` gibt es** | in einem Container oder hinter einem Reverse-Proxy **muss** der Port feststehen; ein stilles Ausweichen macht den Proxy falsch | der Start kann fehlschlagen, obwohl ein Ausweichen möglich wäre — das ist dort gewollt |
| **Beide Adressfamilien geprüft** | gemessen: bei 3080 ist `127.0.0.1` belegt und `::1` frei. Eine Prüfung nur auf einer Adresse wäre eine Münze | zwei Bind-Versuche je Kandidat statt einem — Millisekunden |
| **`PMH_PORT` schlägt den Standard, `--port` schlägt `PMH_PORT`** | ein Container setzt die Umgebung; ein ausdrückliches Argument darf **nie** überstimmt werden | drei Quellen für denselben Wert — die Reihenfolge muss dokumentiert sein (ist sie) |

## 5. Was der Benutzer tun kann

```bash
bun run start                      # 3080, weicht bei Belegung aus
bun run start -- --port 4000       # ab 4000 suchen
bun run start -- --strict-port     # nicht ausweichen: belegt = Abbruch
PMH_PORT=4000 bun run start        # über die Umgebung
```

**Es gibt kein Flag, das die Suche abschaltet** — sie kostet zwei Bind-Versuche
und verhindert den häufigsten Startfehler. Wer den Port **garantiert** will,
nimmt `--strict-port`.

## 6. Was NICHT belegt ist

| Offen | Warum |
|---|---|
| Verhalten unter **Last** (viele gleichzeitige Suchen) | nicht gemessen; die Suche ist sequenziell, bei 20 Kandidaten also 40 Bind-Versuche |
| Ob `SO_REUSEADDR` das Verhalten ändert | nicht geprüft; hier wird bewusst **nicht** gesetzt (ein Port gilt als frei, wenn er bindbar ist — nicht, wenn er bindbar *wäre*) |
| IPv6 auf Wirten **ohne** `::1` | die Prüfung schlägt dort fehl und meldet den Port als belegt. Auf diesem Rechner existiert `::1`, deshalb ist der Fall nicht aufgetreten — **ein Wirt ohne IPv6 würde fälschlich ausweichen** |
| Der Halter `scripts/port-halter.mjs` in der Produktion | er ist ein **Testwerkzeug** und wird nie vom Starter aufgerufen |
