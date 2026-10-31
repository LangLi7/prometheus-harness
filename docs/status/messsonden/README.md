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
| [`startkosten.mjs`](startkosten.mjs) | **Was der Start kostet — im Prozeß gemessen, nicht von außen abgetastet.** Der erste Versuch las alle 15 ms `WorkingSet64` und verfehlte bei 70–120-ms-Prozessen die Spitze; „unser Speicherpaket" zeigte **weniger** als „bun allein". Jetzt mißt sich das Kind **selbst** (`hrtime`, `memoryUsage`) und schreibt eine JSON-Zeile. Gemessen: **25 MB und 0 ms** bevor irgendetwas geladen ist, **37 MB und 26,8 ms** mit dem Kern-App-Boot — der Kern legt **12 MB** drauf | `bun docs/status/messsonden/startkosten.mjs` (Exit 2, wenn ein Ziel nicht lädt) |
| [`suite-nebenlaeufigkeit.mjs`](suite-nebenlaeufigkeit.mjs) | **Laufen Testdateien nebenläufig?** Legt Testdateien an, die Anfang und Ende in **eine** Protokolldatei schreiben (700 ms Pause dazwischen); aus der Reihenfolge folgt die Antwort. Gemessen: **nacheinander**, auch mit acht Dateien — damit ist die geteilte Datenbank als Ursache der Suite-Ausreißer **widerlegt** (`../suite-flatterigkeit.md` §2a) | `bun docs/status/messsonden/suite-nebenlaeufigkeit.mjs [anzahl]` |

| [`envelope-cost.mjs`](envelope-cost.mjs) | **Lohnt sich ein Umschlag je Stück?** Mißt `verschluessele` (ein Schlüssel je Benutzer) gegen `verpacke` (Umschlag je Stück: Schlüsselerzeugung **und** Wickeln) über je 1200-Byte-Stücke. Gemessen: **4,748 µs gegen 7,931 µs — nur 1,7×**, über 10 Mio. Stücke **47,5 s gegen 79,3 s (+32 s)**. Damit ist mein eigener Verdacht widerlegt, ein Umschlag je Stück sei um Größenordnungen teurer — die Schema-Arbeit ist mit Schreibleistung **nicht** zu begründen, in keine Richtung. Aufschlag je Stück: **100 Byte = 8,3 %**. Entschieden wird deshalb über **Schlüsselwechsel** (O(Benutzer) gegen O(Stücke)) und die Löscheinheit, nicht über Tempo (`../../decisions/schluessel-je-stueck-oder-je-benutzer.md`) | `bun docs/status/messsonden/envelope-cost.mjs [stuecke]` (exit 2, wenn ein Ziel nicht lädt) |

**Ergebnis der beiden Host-Sonden, gemessen am 13.10.2026** (Einzelheiten in
[`../kleinste-kette-nachweis.md`](../kleinste-kette-nachweis.md) §6):

```
Windows nativ (Bun 1.4.0)  27 Einträge deaktiviert · kein Token · kein HTTP
WSL2          (Bun 1.4.3)   0 Einträge deaktiviert · Token · 401 → 303 → 200 (32.184 B)
```

**Die Sonden sind absichtlich klein und ohne Abhängigkeiten.** Sie sollen auch in
einem Jahr noch laufen, wenn sich am Projekt viel geändert hat — ein Messweg, der
selbst gepflegt werden muss, wird nicht benutzt.

---

## Sonden anderer Berichte

Sie gehören **nicht** zur Tabelle oben (die gilt `kleinste-kette-nachweis.md` §6),
sondern zu ihrem jeweiligen Bericht.

| Sonde | Was sie beantwortet | Wie sie läuft |
|---|---|---|
| [`terminal-sonde.mjs`](terminal-sonde.mjs) | **Warum meldet das Terminal „Prozess beendet (-1073741502)"?** Mißt die drei Behauptungen, die den Ausfall erklären und den Ersatz tragen: `node-pty` trägt unter **Node** (Exit 0, Marker kommt an), `node-pty` trägt unter **Bun** nicht (kein Marker), **Buns eigenes PTY** (`Bun.spawn({ terminal })`) trägt unter Bun (Exit 0, Marker). Gemessen am 18.10.2026: genau so — daraus folgt `packages/terminal/terminal-pty`. Ändert sich die Lage (node-pty läuft unter Bun), meldet die Sonde **„LAGE GEÄNDERT"**, und der Austausch gehört zurückgenommen | `bun docs/status/messsonden/terminal-sonde.mjs` (exit 0 = Erwartung erfüllt · 1 = Abweichung mit benanntem Grund) |
| [`verknuepfung-probe.ps1`](verknuepfung-probe.ps1) | **Darf dieser Wirt Verknüpfungen anlegen?** Trennt **Symlink** (`mklink /D`, braucht `SeCreateSymbolicLinkPrivilege`) von **Junction** (`mklink /J`, braucht es nicht) und nennt die Folge für den Generationen-Zeiger. Gemessen am 13.10.2026 (Windows 10.0.26200): Symlink **exit 1** („Ihre Berechtigungen reichen nicht aus"), Junction **exit 0** mit `LinkType=Junction` — deshalb sieht [`harness-generationen.md`](../../design/harness-generationen.md) §3.4 eine **Zeigerdatei** vor, keine Verknüpfung | `pwsh -NoProfile -ExecutionPolicy Bypass -File docs/status/messsonden/verknuepfung-probe.ps1` (exit 0 = beide Wege offen · **1 = nur Junction** · 2 = keiner · 3 = Aufruf-/Aufräumfehler) |
