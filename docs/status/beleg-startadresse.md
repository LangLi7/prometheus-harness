# Beleg: die Startadresse war unbenutzbar

**Datum:** 13.10.2026 · **Anlass:** die README-Anleitung wurde befolgt und
führte auf eine Fehlerseite.

## Der Befund

Die Anleitung sagte: `bun run start`, dann `http://127.0.0.1:3080/` öffnen. Der
Start lief, die Adresse stimmte — und der Aufruf antwortete mit **401**.

Nachgemessen am laufenden Host (Port 3081, weil 3080 vom Harness des Betreibers
gehalten wird):

| Aufruf | Antwort | Bytes |
|---|---|---|
| `GET /` ohne Token | **401** | 16.004 (Fehlerseite) |
| `GET /` mit dem Token aus der Hostausgabe | **200** | 35.664 |
| `GET /?token=<43 Zeichen, falsch>` | **401** | — |

Der Host gibt die benutzbare Adresse aus — aber **nach** der Zeile, die die
Anleitung nannte, und in einer Zeile, die wie eine Protokollzeile eines fremden
Werkzeugs aussieht:

```
[host] dsh web: http://127.0.0.1:3081/?token=TWyrTSWfD3BBmIGzLgc5Hjm2klR5eSFqaw1D0wzdhz8
```

**Das ist kein Anleitungsfehler, sondern ein Mangel des Starters.** Er kennt die
Adresse — er liest die Hostausgabe ohnehin — und gab sie nicht weiter.

## Die Korrektur

`scripts/token-adresse.mjs` liest die Adresse aus der Hostausgabe,
`scripts/start.mjs` hängt sich als Beobachter an `stdout` und `stderr` des Hosts
und gibt sie **einmal** aus. Ergebnis am selben Tag, Port 3081:

```
[pmh] Anmeldung nötig — diese Adresse öffnen (enthält den Token):
[pmh]   http://127.0.0.1:3081/?token=TWyrTSWfD3BBmIGzLgc5Hjm2klR5eSFqaw1D0wzdhz8
```

## Die drei Fehler, die auf dem Weg dorthin im eigenen Code steckten

Jeder wurde von einer Prüfung gefunden, nicht durch Nachdenken.

| # | Fehler | Wirkung | Wie er gefunden wurde |
|---|---|---|---|
| 1 | Der Puffer wartete auf einen **Zeilenumbruch** | die Adresse als **letzte** Zeile ohne Umbruch wurde nie gemeldet — und zwar nur dann nicht, wenn danach nichts mehr kam | Prüfung „letzte Zeile ohne Umbruch" war rot |
| 2 | Eine Längenschranke von **8 Zeichen** galt als „vollständig" | ein über zwei Stücke verteilter Anfang `…?token=jWQ3mZm0Qk` wurde für fertig gehalten, ausgegeben — und die **echte** Adresse danach verworfen, weil „schon gemeldet" | Prüfung „über zwei Stücke geteilt" war rot |
| 3 | Der Puffer gab den Rest **sofort** aus (erste Fassung) | dieselbe Wirkung wie 2, nur früher | Prüfung „abgeschnittener Rest bleibt ungemeldet" war rot |

**Fehler 2 und 3 sind derselbe Denkfehler:** „vollständig" wurde aus einer
**geratenen Längenschranke** abgeleitet. Die Antwort steht aber im Datenstrom —
eine abgeschlossene Zeile oder ein beendeter Prozeß sind **Tatsachen**; eine
Länge ist eine Annahme. Die jetzige Fassung benutzt die Tatsachen und die
gemessene Tokenlänge nur noch für den einen Fall, in dem beides fehlt.

Die Tokenlänge ist **nicht** geraten: 32 Byte Zufall als base64url sind
`ceil(32/3)*4 - 1 = 43` Zeichen, und die gemessene Adresse trug genau 43. Eine
Prüfung vergleicht die Prüfdaten mit der Schranke und schlägt fehl, wenn beides
auseinanderläuft.

## Die Lücke in der Prüfung, die den 401 durchgelassen hat

`scripts/port-test.ps1` prüfte in Fall 1–3, daß die genannte Adresse den
**gewählten Port** nennt — als Zeichenkette. Sie nannte ihn. Der Aufruf
antwortete trotzdem 401.

Genau solche Prüfungen sind wertlos: sie sehen grün aus und berühren die Sache
nicht. Deshalb **ruft** Fall 4 die Adresse jetzt auf:

| Prüfung | Ergebnis |
|---|---|
| Adresse in der Ausgabe gefunden | `http://127.0.0.1:5790/?token=K9BjQz1roqIjBAlD5_aHhomQVDIZrPSXCkgqatYReWE` |
| Tokenlänge | 43 |
| Aufruf **mit** Token | **200**, 35.664 Zeichen |
| Aufruf **ohne** Token | **401** — geschützt |

Lauf: `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/port-test.ps1`
→ **4 Fälle, 0 Befunde**. Die Richtlinie dieses Rechners steht auf `Restricted`;
ohne `-ExecutionPolicy Bypass` lädt PowerShell die Datei nicht.

Prüfungen der Rechenteile: `bun test scripts/tests/` → **34 grün, 0 rot**
(18 davon für `token-adresse.mjs`).

## Was daran Geheimnis ist

Die Adresse **ist** der Zugang: wer sie hat, kommt ohne weitere Anmeldung hinein
(genau das ist gemessen — mit Token 200, mit falschem Token 401). Der Starter
schreibt sie deshalb nur auf die Konsole: nicht in eine Datei, nicht in die
Umgebung, nicht in ein Protokoll. Diese Entscheidung steht in der README, weil
sie den Benutzer betrifft.

## Was hier **nicht** belegt ist

* **Ein echter Browser.** Geprüft wurde mit `Invoke-WebRequest`, also ohne
  JavaScript und ohne die Anmeldeweiterleitung des Cores (Token → `303` →
  Cookie). Daß die Oberfläche im Browser vollständig funktioniert, ist damit
  **nicht** gezeigt.
* **Ein zweiter Start.** Die Adresse ist einmal gemeldet und einmal aufgerufen
  worden. Ob die Ausgabe bei jedem Start gleich aussieht, ist nicht gemessen —
  die Prüfungen decken die Stückgrenzen ab, nicht die Wirklichkeit jedes Laufs.
* **Der Fremdprozeß auf Port 3080.** Auf diesem Rechner hält der Harness des
  Betreibers 3080 und antwortet **200** (16.004 Bytes). Das ist eine **andere**
  Anwendung; sie wurde nicht angefaßt und nicht bewertet.
