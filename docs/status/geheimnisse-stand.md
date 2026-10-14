# Geheimnisse — der gemessene Stand, nicht die Aufgabenliste

> **Gemessen:** 14.10.2026 · Sonde
> [`messsonden/schluesselquelle.mjs`](messsonden/schluesselquelle.mjs) · Exit **0**
> **Warum dieses Blatt neben [`geheimnisse.md`](geheimnisse.md) steht.** Jenes belegt den
> **Bau** (13.10.2026). Dieses belegt, was davon **im Betrieb wirkt** — und was die
> Aufgabenliste dazu noch behauptet.

## 1. Die Aufgabenliste war an drei von vier Stellen veraltet

Meine Liste führte C1 bis C4 als **offen**. Nachgemessen:

| Punkt | Aufgabenliste | Gemessen |
|---|---|---|
| **C1** „kein Code liest `PMH_MASTER_KEY` — Umschlagverfahren ohne Schlüsselgeber" | offen | **gebaut.** `packages/auth/secrets/src/schluesselgeber.ts` mit vier Quellenarten; aufgerufen von `store-postgres`, `apischluessel.mjs`, `geheimnis.mjs`, `schluessel.mjs` |
| **C2** „`one_time_tokens` existiert, kein Code benutzt sie" | offen | **gebaut und verdrahtet.** Benutzt in `auth-http/claim-ablage.ts`, `auth/claim`, `auth/reset`, `store-postgres` (5 Stellen) |
| **C3** „API-Schlüssel-Erzeuger mit erzwungener Entropie (≥ 112 Bit) + Pepper" | offen | **gebaut und verdrahtet.** `MIN_ENTROPIE_BITS = 112` steht im Code; `api_keys` benutzt in `readiness`, `apikey`, `store-postgres` (6 Stellen) |
| **C4** „Hauptschlüssel aus der Umgebungsvariable heraus" | offen | **Stufe 1 gebaut, aber NICHT IN BENUTZUNG** — siehe §2 |

**Die Lehre ist dieselbe wie bei C1 selbst und wie bei der Agent-Kern-Karte:** wer die
Prüfliste aus dem Gedächtnis führt, prüft das Falsche. Die Liste stand seit dem 13.10. und
war überholt, weil **gebaut** wurde, ohne sie nachzuziehen.

## 2. Der Betriebszustand — die entscheidende Zahl

```
1. datei          keiner      (.pmh-build/harness-home/master.key FEHLT)
2. docker-secret  keiner      (/run/secrets/pmh_master_key)
3. umgebung       HAT einen   (PMH_MASTER_KEY gesetzt: JA)
```

**Die erste Quelle mit Schlüssel gewinnt — es ist der Übergang.** Stufe 1 ist gebaut und
**wirkungslos**, weil die Datei fehlt. Jeder `wrapped_key` in der Datenbank hängt damit an
der Umgebungsvariable, also an der Quelle, die **weg soll**.

**Der Weg ist einen Befehl weit und verlustfrei:**

```powershell
bun scripts/schluessel.mjs --uebernehmen
```

Er schreibt **denselben** Schlüssel in die Datei. **Nicht ausgeführt** — wo der
Hauptschlüssel langfristig liegen soll (im Arbeitsbaum unter `.pmh-build/`, das
**gitignoriert** ist — geprüft: `.gitignore:46`, 0 versionierte Dateien — oder unter
`~/.pmh`), ist eine **Betreiberentscheidung**.

## 3. Der Datenverlust-Fallstrick, der dabei gefunden wurde

`scripts/schluessel.mjs` sicherte nur mit `existsSync(pfad)` — also gegen die **Datei**. In
genau dem Zustand aus §2 (Datei fehlt, Umgebung liefert) lief der Aufruf **ohne Warnung**
durch und legte einen **neuen** Schlüssel an. Jeder mit dem Umgebungsschlüssel
verschlüsselte `wrapped_key` wäre **unlesbar** geworden — und dieser Aufruf wäre nicht als
Ursache zu erkennen gewesen.

Die vorhandene Warnung sagt sogar *„Die Stufe ‚Umgebungsvariable' wird nicht mehr
gebraucht"* — was **hier falsch** ist: sie ist die Quelle, die den Bestand verschlüsselt hat.

**Behoben** (Commit `96df664`): der Wächter prüft den **wirksamen** Schlüssel über
**dieselbe Kette, die der Betrieb benutzt** (`standardQuellen`). Damit kann er nicht anders
urteilen als der Betrieb.

| Aufruf | Was geschieht |
|---|---|
| ohne Schalter, wirksamer Schlüssel liegt woanders | **Abbruch, es wird NICHTS geschrieben** |
| `--uebernehmen` | derselbe Schlüssel in die Datei — **verlustfrei** |
| `--neu` | neuer Schlüssel, ausdrücklich gewollt |

**9 Prüfungen** in `scripts/schluessel.test.mjs`, die wichtigste ist die **Gegenprobe**:
Datei fehlt + Umgebung liefert → Exit 1 **und die Datei wird nicht angelegt**. Dazu: nach
`--uebernehmen` ist der wirksame Schlüssel **derselbe**, und der Schlüssel wird **nicht
ausgegeben** — auch nicht gekürzt.

## 4. Was für C2 und C3 **nicht** belegt ist

Beide Pakete sind gebaut, verdrahtet und haben eigene Prüfungen. **Aber:**

| Frage | Befund |
|---|---|
| Nennen die **HTTP**-Tests des Hosts `reset`/`apikey`? | **0 Treffer** in `packages/api/auth-http/tests/erstlogin.test.ts` und `postgres.test.ts` |
| Welche Wege bietet `auth-http` an? | **unschlüssig gemessen** — mein Muster fand nur `/api/pmh` und greift damit nicht. **Die Frage ist offen, nicht beantwortet.** |

**„Gebaut und geprüft" im Paket ist nicht „über den Host erreichbar".** Das ist derselbe
Unterschied wie zwischen *komponiert* und *wirkt* in der [Agent-Kern-Karte](agent-kern.md).
Nachweis dafür wäre ein Aufruf über die API — **gemessen ist er nicht.**

## 5. Reproduktion

```powershell
bun docs/status/messsonden/schluesselquelle.mjs        # welche Quelle liefert (Exit 0)
bun test scripts/schluessel.test.mjs                   # 9 Prüfungen, inkl. Gegenprobe
```

Die Sonde gibt den Schlüssel **nicht** aus — auch nicht gekürzt oder gehasht. Für diese
Frage braucht es ihn nicht, und eine Spur wäre schon eine Offenlegung.
