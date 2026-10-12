# Offene Entscheidungen

Stand: Konzeptphase. Nichts hier ist entschieden — die Liste hält fest, **was** entschieden
werden muss und **wovon** die Entscheidung abhängt.

## 1. Laufzeit des Agent-Cores

**Zur Wahl:** Bun · Node · beide (Bun für Entwicklung, Node für Auslieferung).

**Hängt ab von:** der Bun-Messung in [risks.md](../risks.md) — native Addons.

**Neigung:** Bun, weil TypeScript direkt ausgeführt wird (kein `tsc` im Weg) und der
Typecheck mit TS 7 separat läuft. Fällt die Messung negativ aus, ist Node + TS 7 als
reiner Typecheck der Rückfallweg.

## 2. Umfang des Cores

**Zur Wahl:** eigener Core von Grund auf · Cordis + Agent-Loop aus dem Referenz-Harness
übernehmen · Cordis als Abhängigkeit nutzen und nur den Loop selbst bauen.

**Hängt ab von:** wie viel vom Harness wir wirklich ersetzen wollen. Fest steht nur, dass
das Plugin-System JavaScript sein muss.

**Neigung:** Cordis nicht nachbauen — der Seam ist erprobt und dokumentiert.

## 3. Erster Baustein nach der Bun-Messung

**Zur Wahl:** Modell-Anbindung (LLM-Adapter) · Agent-Loop · Session-Persistenz ·
Anwendungseinstieg und Oberfläche.

**Hängt ab von:** was als Erstes ein sichtbares Ergebnis liefert.

**Neigung:** die kleinste Kette, die einen Chat mit einem Modell ermöglicht — Adapter,
Loop, Einstieg. Alles andere ist danach ein Unit.

## 4. Wo Go wirklich beginnt

**Zur Wahl:** Gateway · Scheduler · Startup-Supervisor · Datei- und Git-Anbindung.

**Hängt ab von:** Lastmessungen am laufenden TypeScript-Core. Vorher ist jede Antwort geraten.

**Neigung:** **Startup-Supervisor zuerst** — „Dienste starten mit der Harness" ist eine
Anforderung mit klarem Nutzen und ohne Semantik-Duplikat. Das Gateway erst, wenn es
messbar der Engpass ist.

## 5. Wo Rust wirklich beginnt

**Zur Wahl:** Sandbox · Parser und Indizierung · Kryptografie · nichts davon.

**Hängt ab von:** welcher Teil tatsächlich rechenintensiv oder sicherheitskritisch wird.

**Neigung:** Sandbox — dort gibt es im Referenz-Harness bereits Bedarf (Windows-ACL,
Landlock) und mit `native/system` ein fertiges Paketmuster.

## 6. Verhältnis zum DeepSeek Harness langfristig

**Zur Wahl:** Fork mit eigenen Units · eigener Core, Harness nur als Vorlage ·
Hybrid (Core vom Upstream, Fähigkeiten als Units).

**Neigung:** Hybrid. Es hält Fehlerbehebungen des Upstream verfügbar und kostet nur
Disziplin bei den vier Regeln aus [concept.md](../concept.md).

## 7. Sprache der Oberfläche und Übersetzungen

**Offen.** Der Referenz-Harness hat einen **Language-Pack-Steckplatz**
(`LocaleRuntime.addLanguage`), der ausdrücklich „when a language-pack plugin adds a
selectable language" existiert — und von niemandem benutzt wird. Eine deutsche Übersetzung
wäre damit **ein Paket** statt 59 geänderter Dateien.

**Hängt ab von:** ob Mehrsprachigkeit für Prometheus Harness von Anfang an vorgesehen wird.

## 8. Verbleibende Aufräumarbeiten

| Sache | Stand |
|---|---|
| `C:\Users\Chang\dsh-de` (1,4 GB) | Arbeit ist als Patch gesichert (`~/.dsh/notes/de-locale-aa5cf13.patch`), Löschung offen |
| Alter Paket-Ordner `C:\Users\Chang\dsh-stack` | nicht mehr die Richtung, Bestand ungeprüft |
| `apiproxy`-Analyse des Referenz-Forks | geparkt auf Anweisung |
| Units `crew`, `ui-git`, `ui-settings-crew` | geparkt, bis der Core steht |
