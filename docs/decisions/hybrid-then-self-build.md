# Entscheidung — Hybrid zuerst, danach Eigenbau (Weg A)

> **Status: ENTSCHIEDEN** · Richtung und Reihenfolge · 12.10.2026
> **Vorgänger:** [`core-supply.md`](core-supply.md) — dort steht die *Versorgung des Cores
> heute* (Weg B, Hybrid). **Diese Datei legt fest, dass B ein Durchgang ist und A das Ziel.**
> **Bezug:** `docs/concept.md` · `docs/stack.md` · `docs/vision.md` ·
> `docs/project-profile.md` §4 (NewDawn0 / NixOS) · `docs/decisions/open-questions.md`
> §2, §4, §5, §6 · `MAPPING.md` §3.1

---

## 1. Die Entscheidung in einem Absatz

**Hybrid ist der erste Meilenstein, der Eigenbau ist das Ziel.** Der Agent-Core wird zuerst
als Upstream-Abhängigkeit benutzt (`0.2.1-alpha.2`, siehe `core-supply.md`), damit in
kurzer Zeit ein **laufender** Harness existiert — Typecheck exit 0, HTTP 200. **Sobald das
nachweislich funktioniert**, wird schrittweise auf Ansatz **A** übergegangen: ein eigener
Agent-Core in **Go / Bun / TS 7 / Rust**, der die Schnittstellen des Hybrid-Kerns bewahrt.
Der Grund ist nicht Geschmack, sondern die Anforderungsliste: NixOS-Selbständerung,
Plugin-Export über den Harness, Web-Attach-Dienst und die API-Fläche sind Dinge, die der
Standard-Upstream-Harness **nicht vorsieht** — und jede davon wäre als „Anpassung im
Upstream-Code" genau das Problem, das `docs/concept.md` beschreibt (56 fremde Dateien,
129 neue Dateien quer über 16 Pakete).

**Reihenfolge statt Gleichzeitigkeit.** `docs/vision.md` schließt mit dem eigentlichen
Problem: „Sie nennt rund fünfzehn Systeme über fünf Sprachen. Was fehlt, ist nicht die Idee,
sondern die **Reihenfolge**." Diese Entscheidung ist diese Reihenfolge.

---

## 2. Warum diese Reihenfolge — und nicht sofort A

### 2.1 Was B leistet (und warum es nicht verschwendet ist)

| B liefert | Nutzen für A |
|---|---|
| Ein **laufender** Harness mit HTTP 200 | es gibt einen Vergleichsmaßstab: A wird gegen ein *funktionierendes* B gemessen, nicht gegen eine Beschreibung |
| Die **echten** Cordis-Seams in Betrieb | A kann nur plugin-kompatibel sein, wenn die Seams einmal real gelaufen sind |
| Ein **gemessener** Session-/Protokollstand (Format v4) | die Schnittstellenkompatibilität aus §5 hat damit ein Orakel |
| Die **Dienstgrenzen** (Go/Rust) im Betrieb | die Dienste aus `MAPPING.md` §3.7 werden **nicht** von A verändert — sie bleiben |

**Nichts davon muss bei A weggeworfen werden.** Host, Units und Dienste sind schon heute
Eigenbesitz (`core-supply.md` §1); A ersetzt den **Kern**, nicht das Drumherum.

### 2.2 Was A erzwingt (die belegten Anlässe)

Die Doku nennt drei Anforderungen, die im Upstream **keinen Steckplatz** haben. Jede
einzelne ist für sich genommen ein Grund, den Code zu besitzen:

| Anforderung | Warum der Upstream sie nicht abdeckt |
|---|---|
| **NixOS-Selbständerung** (§3.1) | Der Upstream kennt System-Actuation nicht. `project-profile.md` §4 nennt den NixOS-Ansatz ausdrücklich als **unsere** Richtung (NewDawn0: „Einheiten deklarieren, Generationen, atomares Umschalten und Zurückrollen"). |
| **Plugin-Export über den Harness** (§3.2) | Der Upstream *lädt* Plugins; er **exportiert** sie nicht als weitergebbares Bündel. Für „alles ist ein Plugin" (`docs/concept.md`, Unit-Modell) ist das eine Kernfähigkeit, kein Extra. |
| **Web-Attach-Dienst** (§3.3) | Der Upstream liefert **eine** Oberfläche aus. Das Docking-/Zoom-Zielbild (`docs/vision.md`) braucht einen Anhängepunkt für mehrere Clients und Ansichten. |

Dazu kommt die Sprachbegründung des Betreibers: **Go, Bun, TS 7 und Rust handhaben
API-Fläche, Nebenläufigkeit und Systemnähe besser als der Standard-DeepSeek-Harness**, der
genau dafür keinen Platz lässt, ohne dass man in fremden Dateien schneidet.

### 2.3 Die Bedingung, die A auslöst (messbar, nicht gefühlt)

A beginnt **nicht** auf Zuruf, sondern wenn B belegt läuft:

1. `bun install` → exit 0
2. `bun run typecheck` → exit 0
3. Der eigene Host antwortet auf `http://127.0.0.1:<port>/` mit **HTTP 200**
4. Ein **Unit** beweist die Kette (Paket, Registrierung, Test, im GUI sichtbar, absteckbar)
   — das ist `docs/concept.md` Schritt 2 und die Voraussetzung dafür, dass A etwas zu
   ersetzen hat.

Erst dann beginnt der Übergang, und zwar **paketweise**: ein Core-Paket nach dem anderen
wird durch eine eigene Implementierung ersetzt, gegen denselben Vertrag getestet, und die
Abhängigkeit auf das Upstream-Paket fällt. **Kein Big Bang.**

### 2.4 Was A **nicht** ist

- **Kein Fork des Upstream-Repos.** Ein Fork wäre Weg C mit Extraschritten und widerspricht
  `docs/concept.md` wörtlich („Wir kopieren nicht 14.990 Dateien und schneiden darin").
- **Keine Kopie von `apps/cli`.** Der Host ist und bleibt Eigenbau.
- **Keine Aufgabe der vier Regeln.** Sie gelten in A unverändert; Regel 1 wird lediglich
  gegenstandslos, weil es dann keinen fremden Core mehr gibt, den man ändern könnte.

---

## 3. Die drei neuen Arbeitspakete

### 3.1 NixOS-Selbständerung

**Zielbild des Betreibers:** „NixOS-Systemkonzept implementieren, dass es sich selbst
ändern kann."

**Das Konzept in einem Satz (vom Betreiber präzisiert, 12.10.2026):** Das ganze System wird
**als Code beschrieben, nicht von Hand eingerichtet.** Pakete, Dienste (PostgreSQL, Redis,
Forgejo, SearXNG, Tailscale) und Einstellungen stehen in einer deklarativen Konfiguration —
`configuration.nix` oder eine **Flake**. `nixos-rebuild switch` baut daraus das System; jede
Änderung erzeugt eine **Generation**, und ein Befehl führt auf die vorherige zurück
(**Rollback**). Das Ergebnis ist **reproduzierbar**: dieselbe Konfiguration ergibt auf jedem
Rechner dasselbe System.

**Was „kann sich selbst ändern" hier konkret bedeutet — der entscheidende Unterschied:**

> **Der Agent ändert nicht das laufende System direkt** („kein wildes `apt install`"),
> **sondern die Konfigurationsdatei in einem Git-Repo** (z. B. Forgejo). Er arbeitet auf
> einem **Branch** und baut mit `nixos-rebuild build` oder `test`, **ohne sofort zu
> aktivieren**. Der Mensch sieht den **Diff** und gibt frei; **erst dann** folgt `switch`.
> Geht etwas schief, wird zurückgerollt. Jede Änderung ist ein **Git-Commit**, also
> nachvollziehbar.

**Damit ist Selbständerung kontrolliert statt riskant.** Der Ablauf ist ein Vier-Augen-Prinzip
mit Transaktionsrand:

```
Vorschlag (Branch + Diff)  →  Prüfbau (build/test, ohne Aktivierung)
                           →  menschliche Freigabe
                           →  switch (neue Generation)
                           →  bei Fehler: Rollback auf die vorige Generation
```

**Was dazu ebenfalls als Nix-Modul deklariert werden kann:** der Harness selbst, Plugins und
Dienste — sowie **reproduzierbare Dev-Umgebungen je Projekt** (`nix develop`) und
**Container-Images**. Das ist die Brücke zu `MAPPING.md` §3.7 und zum Plugin-Export (§3.2).

**Einordnung — verbindlich: zweite Phase.** Der Betreiber ordnet ausdrücklich ein: *„Nimm das
erst als zweite Phase. Ein sinnvoller Start ist eine Flake im Git-Repo für reproduzierbare
Umgebungen, und der Agent schlägt Änderungen nur als Branch mit Freigabe vor."* Der erste
Schritt ist deshalb **nicht** Actuation, sondern eine **Flake im Repo** für reproduzierbare
Umgebungen.

**Bekannte Grenzen (vom Betreiber genannt, unverändert übernommen):**

| # | Grenze | Folge für unser Design |
|---|---|---|
| G1 | **NixOS läuft nur auf Linux** (auch Raspberry Pi und WSL2 über NixOS-WSL). Auf reinem Windows gibt es nur den Umweg über **WSL2**. | Actuation findet nie auf dem Windows-Host statt. Der Dienst muss mit „nicht verfügbar" ehrlich umgehen können. |
| G2 | Die **Nix-Sprache hat eine steile Lernkurve**, Builds brauchen **Speicherplatz**. | Die Flake wird klein gehalten; Erklärungen gehören in die Doku, nicht in Kommentare verstreut. |
| G3 | **Der Agent darf Netzwerk, Nutzerrechte und Secrets nicht ungeprüft ändern.** | Diese drei Kategorien brauchen eine **eigene Policy-Stufe** mit zwingender Freigabe — über die generische Branch-Regel hinaus. |
| G4 | **Secrets gehören nicht in den Nix-Store** (`sops-nix` oder `agenix`). | Secret-Handling ist ein eigenes Arbeitspaket, kein Nebensatz. Der Nix-Store ist **world-readable**. |
| G5 | Freigabe und Nachvollziehbarkeit | jede Änderung ist ein Git-Commit auf einem Branch; kein direkter Schreibzugriff auf den aktiven Stand |

**Zielumgebung (vom Betreiber als Option genannt):** später ein **externer Server mit NixOS**
oder ein **Raspberry Pi 5 mit 8 GB RAM** (Gehäuse: Pironman 5). Das ist die künftige
Actuations-Zielmaschine — **nicht** dieser Entwicklungsrechner. Daraus folgt: der Dienst
adressiert ein **entferntes Ziel** (über SSH oder einen Agenten auf dem Ziel), nicht das
lokale System.

**Belegte Ausgangslage (gemessen am 12.10.2026, dieser Host):**

| Prüfung | Ergebnis | Folge |
|---|---|---|
| `nix` / `nixos-rebuild` auf dem Host | **nicht vorhanden** (Windows) | Actuation läuft **nicht** auf dem Host; deckt sich mit G1 |
| WSL2 | vorhanden, Distributionen `Ubuntu`, `kali-linux`, `docker-desktop` | WSL2 wäre der **einzige** Weg auf dieser Maschine — und ist laut Einordnung **Phase 2** |
| Docker | vorhanden (Daemon läuft über `docker-desktop`) | Container ist ein Prüfraum für Nix-Builds, ohne den Host zu riskieren |
| `go`, `cargo`, `bun`, `git` | vorhanden | die Dienste sind auf diesem Host baubar |

**Konsequenz für die Umsetzung:** Die Actuation wird ein **Go-Dienst** (`pmh-nix`), der nie
selbst `nix` *ist*, sondern den Nix-Werkzeugkasten in einer deklarierten Umgebung aufruft.
Der Dienst kennt **zwei Betriebsarten**:
- **`local`** — Flake im Repo, Prüfbau und Diff, **ohne Aktivierung** (Phase-2-Start, läuft ohne Nix-Installation als Konzept und Vertrag),
- **`remote`** — Branch im Git-Repo, Prüfbau auf dem Ziel, Freigabe, dann `switch` (die Zielumgebung aus G1/der Zielumgebung oben).

Die harte Regel aus `docs/backend-analysis.md` §2.5 gilt hier verschärft: **Das Modell
empfiehlt, die Policy entscheidet.** Ein Modell darf niemals `nixos-rebuild switch` auslösen;
es darf einen **Branch mit Diff** vorschlagen. Netzwerk, Nutzerrechte und Secrets (G3) sind
zusätzlich freigabepflichtig, nicht nur branch-pflichtig.

> ### ⚠ Abgrenzung — verbindlich: **NixOS wird nicht installiert.**
>
> **Weisung des Betreibers (12.10.2026): „kein nixos installieren lol".** Daraus folgt für
> dieses Arbeitspaket eine harte Grenze:
>
> | Erlaubt | **Nicht** erlaubt |
> |---|---|
> | Das **Konzept** beschreiben: Module, Flakes, Generationen, Rollback | NixOS oder Nix auf diesem Rechner **installieren** |
> | Die **Schnittstelle** definieren (Actuation-API, Verträge, Fehlercodes) | Eine Distribution austauschen, partitionieren, booten |
> | Den Dienst `pmh-nix` als **Gerüst** bauen, mit **Backend-Austausch** | Die Actuation gegen ein echtes System **ausführen** |
> | Eine **Attrappe** (`probe`) als Backend, damit alles testbar ist | `nixos-rebuild switch` irgendwo auslösen |
>
> **Konsequenz für den Entwurf:** Der Dienst wird von Anfang an **backend-fähig** gebaut —
> ein Interface, mehrere Implementierungen. Das erste Backend ist eine **Attrappe**, die
> nichts am System ändert und nur den Vertrag erfüllt (`local`-Betriebsart: Flake + Diff,
> ohne Aktivierung). Ein echtes Nix-Backend kommt später als **eine weitere
> Implementierung** für die Zielmaschine (`remote`-Betriebsart, §3.1 „Zielumgebung"), ohne
> dass Konzept oder Schnittstelle sich ändern. Damit ist die Vision geplant, ohne dass
> heute etwas installiert oder umgestellt wird.
>
> Die Umgebungsmessung (§3.1) dient damit **nur** der Feststellung des Ist-Zustands, nicht
> als Installationsauftrag.

### 3.2 Plugin-Export über den Harness

**Zielbild des Betreibers:** „der Agent-Konzept everything is plugin — genauso möchte ich
auch Plugins und Anpassungen exportieren und weitergeben können, per Harness selbst."

**Was das konkret verlangt:**

| Fähigkeit | Inhalt |
|---|---|
| **Manifest** | jedes Unit deklariert sich vollständig (Name, Version, Art `plugin`/`service`/`patch`/`skill`, Abhängigkeiten, Core-Vertragsversion) — das Format existiert bereits: `units/README.md` + 8 `unit.json` |
| **Registry** | Auffinden installierter Units, Auflösung der Abhängigkeiten, Verträglichkeitsprüfung gegen die Core-Version |
| **Bündelung** | ein Unit plus seine Abhängigkeiten als **ein** weitergebbares Artefakt (Bun/TS 7: `bun build`; Go/Rust: Binary + Manifest; Skills: Dateibaum) |
| **Export/Import über die Harness-API** | kein Kopieren von Ordnern von Hand — der laufende Harness gibt ein Bündel aus und nimmt eines an, mit Prüfsumme und Herkunft |
| **Plugin-Host** | die Gegenseite: ein Bündel laden, prüfen, einhängen, wieder abstecken |

**Warum das ein A-Anlass ist:** Der Upstream lädt Plugins über Cordis, kennt aber kein
**Ausgabeformat** für sie. Export ist die Fähigkeit, die „alles ist ein Plugin" erst
vollständig macht — ohne sie bleibt ein Unit eine lokale Datei.

### 3.3 Web-Attach-Dienst

**Zielbild:** „für die Web-Implementierung braucht man auch etwas, das anhängen kann."

Der Host liefert heute **eine** Oberfläche aus. Das Docking-/Zoom-Zielbild
(`docs/vision.md`: Zoom als Bedeutungsebenen, dockbare Panels, Projekt-Stack-Anzeige,
Echtzeit-Bearbeitung von Menschen **und** Agenten) braucht einen **Anhängepunkt**:
mehrere Clients, mehrere Ansichten desselben Inhalts, Agent und Mensch im selben Raum.

**Arbeitspaket:** ein Go-Dienst `pmh-attach` als HTTP/WebSocket-Gateway, hinter dem die
Oberfläche hängt — mit einem deklarierten Protokoll (Frames, Event-Namen, Fehlercodes
**wörtlich** wie im Core-Gateway, damit der TS-Seam nicht zwei Semantiken kennt). Er tritt
**neben** den TS-Gateway-Seam, nicht an seine Stelle — dieselbe Begründung wie in
`docs/stack.md` („das Gateway erst, wenn Lastmessungen zeigen, dass es der Engpass ist").

---

## 4. Verbindliche Regeln für die Ausführung (Subagenten)

Diese Regeln sind **Teil der Entscheidung**, nicht Beiwerk. Sie stehen hier, weil
Abweichung in der Vergangenheit messbaren Schaden erzeugt hat: **47 Agenten-Sitzungen und
426 MB Session-Daten ohne Ergebnisverbesserung** (Auftrag §5), und bei einem
Übersetzungslauf eskalierten 12 geplante Arbeiter auf **52 Sitzungen**, weil sich Arbeiter
selbst nachgestartet haben (`docs/INDEX.md`, „Vorfall vom 12.10.2026").

| # | Regel | Warum |
|---|---|---|
| **S1** | **Höchstens 10 Subagenten gleichzeitig aktiv** — parallel *oder* seriell, die Summe zählt. | Obergrenze statt Schwarm. `tool-subagent` begrenzt nur die **Tiefe** (`maxDepth`-Default 3), nicht die **Breite** — die Grenze muss die Auftragsseite setzen. |
| **S2** | **Ein Subagent erstellt keine weiteren Subagenten.** Braucht er mehr Arbeit, **meldet er den Bedarf zurück** an den Auftraggeber. | Genau der Vorfall vom 12.10.2026: Arbeiter starteten sich selbst nach, 12 wurden zu 52. |
| **S3** | **Neue Subagenten erst, wenn alle aktiven abgeschlossen sind** (freie Plätze). Kein Nachstarten, solange etwas läuft. | hält die Zahl wahrnehmbar und die Ergebnisse zuordenbar |
| **S4** | **Ein Auftrag, ein klar umrissenes Ergebnis mit messbarem Kriterium.** Große Dateien sind kein Grund zu teilen. | `docs/INDEX.md`, Batching-Regel |
| **S5** | **Seriell, wo die Reihenfolge zwingend ist** (Hybrid-Meilenstein vor A-Übergang). **Parallel nur für unabhängige** Arbeitspakete. | Nebenläufigkeit ohne Abhängigkeit ist die einzige, die nichts kaputt macht |

**Rückmeldung statt Delegation — das erwartete Meldeformat eines Subagenten:**

```
BEDARF: <was fehlt>
GRUND:  <warum er es selbst nicht kann>
UMFANG: <geschätzt: Anzahl Arbeiter, grob welche Teilaufgaben>
FERTIG: <was bis dahin fertig ist>
```

Ein Worker, der diese Zeilen liefert, hat die Regel **erfüllt** — nicht gebrochen.

---

## 5. Schnittstellenkompatibilität beim Übergang zu A

Damit der Übergang paketweise möglich ist, muss A **denselben Vertrag** erfüllen wie das
ersetzte Upstream-Paket. Diese Liste ist die Abnahmeliste (aus `MAPPING.md` §7):

| Vertrag | Erhaltungsanforderung |
|---|---|
| Cordis-Plugin-Anatomie | `name` / `inject` / `Config` / `apply(ctx, config)` **wörtlich** |
| Session-JSONL-Format | **Version 4**, Feldnamen, Record-Form, Header; Migrationskette v0→v4 **vollständig** |
| Gateway-Stream-Protokoll | Frame-Namen, Event-Namen, Fehlercodes **wörtlich** |
| Remote-/RPC-Methoden | Methodennamen, Parameter, Rückgabetypen |
| Unit-Format | `units/README.md` + `unit.json`-Felder |
| Home-Verzeichnis | `PMH_HOME` mit Fallback `~/.pmh` |
| CLI-Grammatik (Host) | Kommandos und Flags **wörtlich** |

**Prüfregel:** Ein Core-Paket gilt erst als ersetzt, wenn die **Hybrid-Fassung und die
A-Fassung dieselben Vertragstests bestehen**. Vorher wird die Abhängigkeit nicht entfernt.

---

## 6. Konsequenzen für die laufende Arbeit

| Bereich | Folge |
|---|---|
| `core-supply.md` | bleibt **gültig** und unverändert; diese Datei ergänzt es um die Zeitachse (B → A) |
| Schritt 2 des Auftrags (Aufräumen) | unverändert; die Kopie in `apps/` wird durch den eigenen Host ersetzt |
| Go-Dienste (`MAPPING.md` §3.7) | **drei neue** Arbeitspakete kommen hinzu: `pmh-nix` (§3.1), `pmh-attach` (§3.3), plus die Export-Fähigkeit im Kern (§3.2) |
| Rust | unverändert in Zuständigkeit (Sandbox, PTY, atomicfs, flock, index, crypto) |
| Tests | jeder neue Dienst braucht einen **messbaren** Nachweis: Befehl, Exit-Code, beobachtete Ausgabe |
| Doku | neue Units werden im Katalog `docs/INDEX.md` registriert (Konvention) |

---

## 7. Was diese Entscheidung ausdrücklich **nicht** festlegt

- **Nicht den Zeitpunkt** des Übergangs — nur die Bedingung (§2.3).
- **Nicht**, ob A den Upstream irgendwann ganz ersetzt; ersetzt wird, was einen belegten
  Anlass hat (§2.2). Was keinen hat, bleibt Abhängigkeit.
- **Nicht** die NixOS-*Betriebsart* (Dienst auf NixOS, Container, WSL2-Actuationsrand) —
  das ist eine eigene Messung im Arbeitspaket §3.1.
- **Nicht**, dass NixOS heute installiert wird — das ist ausdrücklich **ausgeschlossen**
  (§3.1). Gebaut wird das Konzept und die austauschbare Schnittstelle.
- **Nicht** die Laufzeitfrage (Bun/Node) und **nicht** die Frage, welche Oberfläche gewinnt.

---

## 8. Nachweis der Entscheidungsgrundlage

| Quelle | Verwendung |
|---|---|
| Vorgabe des Betreibers (12.10.2026) | „eher Eigenbau … wegen Bun und API … alles, was Golang besser handhaben kann als der Standard-Harness"; NixOS-Selbständerung; Plugin-Export; Web-Attach; Subagent-Regeln |
| `docs/concept.md` | vier Regeln, „Core wird benutzt, nicht besessen", Reihenfolge Core → Unit → Sprachgrenzen |
| `docs/vision.md` §„Das eigentliche Problem dieser Vision" | fünfzehn Systeme, fünf Sprachen — es fehlt die **Reihenfolge** |
| `docs/stack.md` | „TypeScript ist nicht verhandelbar"; Gateway erst bei belegtem Engpass |
| `docs/project-profile.md` §4 | NewDawn0 = **Nix**-Entwickler, kein UI-Projekt; NixOS-Ansatz: Generationen, atomares Umschalten, Rollback |
| `docs/backend-analysis.md` §2.5 | „Das Decision Model darf keine Sicherheitsregeln überschreiben" |
| `docs/decisions/open-questions.md` §2, §6 | Cordis nicht nachbauen; Neigung Hybrid |
| `docs/INDEX.md` („Vorfall vom 12.10.2026") | Beleg für die Subagent-Regeln §4 |
| eigener Auftrag §5 | „47 Agenten-Sitzungen und 426 MB Session-Daten ohne Ergebnisverbesserung" |
| eigene Messung (§3.1) | `nix` nicht vorhanden; WSL2 und Docker vorhanden |

**Abgrenzung:** `docs\dsh\` und `docs\design\` wurden für diese Entscheidung nicht geöffnet.
