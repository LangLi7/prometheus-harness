# Messsonden zu `kleinste-kette-nachweis.md` §6

> **Was das ist.** Kleine Programme, mit denen die Messungen dieses Berichts
> **nachvollziehbar** sind. Ein Befund ohne wiederholbaren Messweg ist eine
> Behauptung — diese Dateien sind der Messweg.
>
> **Was die Tabelle unten ist — und was nicht.** Sie listet die Sonden, die zu
> `kleinste-kette-nachweis.md` §6 gehören. Im Ordner liegen **weitere** (u. a.
> `api-sonde.ts`, `api-test.ps1`, `boot-schleife.ps1`, `wsl-count.sh`,
> `windows-host-eigenes-home.ps1`); sie sind anderen Berichten zugeordnet und
> stehen deshalb nicht hier. Die Zahl der Dateien steht **nicht** in dieser Zeile,
> weil sie sonst veraltet, sobald jemand eine hinzufügt.
>
> **Nichts davon fasst das Projekt an.** Die Sonden **lesen** nur: Paketdateien,
> Dateisystem, Auflösung. Sie starten einen Host auf einem freien Port und
> beenden ihn wieder. Keine Änderung an Projektdateien, keine Installation.
> Ausnahme, ausdrücklich benannt: `subprozess-naht.mjs` **startet Kindprozesse**
> (Bun, Node, den Runner) — es ändert aber keine Datei.

| Sonde | Was sie beantwortet | Wie sie läuft |
|---|---|---|
| [`runtime-version-probe.ts`](runtime-version-probe.ts) | **Welche** `dsh-app-boot`-Fassung liest die Laufzeit, und gibt es eine zweite Kopie im Baum? | `bun docs/status/messsonden/runtime-version-probe.ts` |
| [`resolve-probe.ts`](resolve-probe.ts) | Welchen Ordner findet die Node-Kette und `Bun.resolveSync` für `@deepseek-ai/dsh-llm`? | `bun docs/status/messsonden/resolve-probe.ts` |
| [`windows-host-check.ps1`](windows-host-check.ps1) | Windows nativ: fängt **alle** Ausgabe ein, zählt die „version-incompatible"-Zeilen, prüft Port und Token | `pwsh -NoProfile -ExecutionPolicy Bypass -File docs/status/messsonden/windows-host-check.ps1 -Port 5333` |
| [`wsl-host-check.sh`](wsl-host-check.sh) | WSL2: Token lesen, dann `GET /` ohne Token, mit Token und mit Cookie — die Kette bis HTTP 200 | `wsl -e bash /mnt/c/Users/Chang/prometheus-harness/docs/status/messsonden/wsl-host-check.sh 5311` |
| [`subprozess-naht.mjs`](subprozess-naht.mjs) | **Fährt die Naht des Subprozesses wirklich?** Bun verschluckt den `--`-Trenner, Node nicht; die **Bibliothek** zu starten ergibt exit 0 **ohne Wirkung**, der **Eingang** ohne Selection **127**. Beantwortet, warum die Häufigkeit des `glob`-Ausfalls auf diesem Weg **nicht** zu bestimmen ist | `bun docs/status/messsonden/subprozess-naht.mjs` (exit 0 = beide Erwartungen erfüllt) |
| [`suite-nebenlaeufigkeit.mjs`](suite-nebenlaeufigkeit.mjs) | **Laufen Testdateien nebenläufig?** Legt Testdateien an, die Anfang und Ende in **eine** Protokolldatei schreiben (700 ms Pause dazwischen); aus der Reihenfolge folgt die Antwort. Gemessen: **nacheinander**, auch mit acht Dateien — damit ist die geteilte Datenbank als Ursache der Suite-Ausreißer **widerlegt** (`../suite-flatterigkeit.md` §2a) | `bun docs/status/messsonden/suite-nebenlaeufigkeit.mjs [anzahl]` |

**Ergebnis der beiden Host-Sonden, gemessen am 13.10.2026** (Einzelheiten in
[`../kleinste-kette-nachweis.md`](../kleinste-kette-nachweis.md) §6):

```
Windows nativ (Bun 1.4.0)  27 Einträge deaktiviert · kein Token · kein HTTP
WSL2          (Bun 1.4.3)   0 Einträge deaktiviert · Token · 401 → 303 → 200 (32.184 B)
```

**Die Sonden sind absichtlich klein und ohne Abhängigkeiten.** Sie sollen auch in
einem Jahr noch laufen, wenn sich am Projekt viel geändert hat — ein Messweg, der
selbst gepflegt werden muss, wird nicht benutzt.
