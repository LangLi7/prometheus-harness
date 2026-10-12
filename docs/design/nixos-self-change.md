# NixOS-Selbständerung — Konzept und Schnittstelle

> **Was dieses Dokument ist:** das Konzept für eine Selbständerung des Systems als gestufter,
> umkehrbarer Vorgang — und die Schnittstelle, über die sie später ausgeführt wird. Es
> beschreibt **Absicht und Vertrag**, nicht eine Installation.
>
> **Grundlage:** [`../decisions/hybrid-then-self-build.md`](../decisions/hybrid-then-self-build.md)
> §3.1 (das Arbeitspaket samt der verbindlichen Abgrenzung), [`../project-profile.md`](../project-profile.md)
> §4 (NewDawn0 als NixOS-Vorbild), [`../concept.md`](../concept.md) Regel 4 („Sprachgrenzen
> sind Dienstgrenzen"), [`../stack.md`](../stack.md).
>
> **Umsetzung:** [`../../services/pmh-nix/`](../../services/pmh-nix/README.md).
>
> Stand: 12.10.2026 · Fassung 2 (zweite Phase: Flake im Repository, Branch mit Freigabe).

---

## 0. Einordnung — was zuerst kommt

**Der Betreiber ordnet ausdrücklich ein:**

> *„Nimm das erst als zweite Phase. Ein sinnvoller Start ist eine Flake im Git-Repo für
> reproduzierbare Umgebungen, und der Agent schlägt Änderungen nur als Branch mit Freigabe
> vor."*

Daraus folgt die Reihenfolge, und sie ist bindend:

| | Schritt | Was er liefert |
|---|---|---|
| **1** | **Flake im Git-Repository für reproduzierbare Umgebungen** — `nix develop` je Projekt | Dieselbe Umgebung auf jedem Rechner, ohne dass jemand ein System umstellt. Der Nutzen entsteht **ohne Actuation** |
| **2** | **Die Regel „Änderung nur als Branch mit Freigabe"** — der Agent schlägt vor, der Mensch entscheidet | Der Vertrauensweg ist etabliert, bevor ihm irgendetwas folgen kann |
| **3** | **Die Actuation** — `switch` und Rollback gegen ein entferntes Ziel | Erst jetzt wird aus dem Vorschlag ein Systemwechsel |

**Die Actuation ist das Ziel dahinter, nicht der Anfang.** Wer bei Schritt 3 beginnt, baut
eine Maschine, die ein System umstellen kann, bevor irgendjemand gelernt hat, ihren
Vorschlägen zu trauen.

## 1. Das Ziel: das System als Code

Das ganze System wird **als Code beschrieben, nicht von Hand eingerichtet.** Pakete, Dienste
(PostgreSQL, Redis, Forgejo, SearXNG, Tailscale) und Einstellungen stehen in einer
deklarativen Konfiguration — `configuration.nix` oder eine **Flake**. `nixos-rebuild switch`
baut daraus das System; jede Änderung erzeugt eine **Generation**, und ein Befehl führt auf
die vorherige zurück (**Rollback**). Das Ergebnis ist **reproduzierbar**: dieselbe
Konfiguration ergibt auf jedem Rechner dasselbe System.

**Warum das der richtige Anfang ist:** Eine deklarative Beschreibung ist die Voraussetzung
dafür, dass ein Vorschlag überhaupt prüfbar ist. Ein Diff gegen eine Datei kann man lesen,
vergleichen und freigeben; eine Folge von Befehlen, die ein System verändert, kann man nur
ausführen und bereuen.

## 2. Was „kann sich selbst ändern" konkret heißt

Der Agent ändert **nicht das laufende System direkt** — kein „wildes `apt install`". Er
ändert **die Konfigurationsdatei in einem Git-Repository** (z. B. Forgejo). Er arbeitet auf
einem **Branch** und baut mit `nixos-rebuild build` oder `test`, **ohne sofort zu
aktivieren**. Der Mensch sieht den **Diff** und gibt frei; **erst dann** folgt `switch`. Geht
etwas schief: Rollback auf die vorige Generation. Jede Änderung ist ein **Git-Commit**, also
nachvollziehbar.

### 2.1 Der präzisierte Vertrag

```text
Vorschlag   = Branch + Diff                  (NICHT eine "angewendete" Änderung)
Prüfbau     = build/test, ohne Aktivierung   ->  pmh-nix check
Freigabe    = menschliche Bestätigung, ausdrücklich, mit Identität/Zeitstempel
                                             ->  pmh-nix approve
Activation  = switch                         ->  pmh-nix apply
Rückweg     = Rollback auf die vorige Generation
                                             ->  pmh-nix rollback
```

| Stufe | Was geschieht | Fehlersemantik |
|---|---|---|
| **propose** | Legt einen **Branch** mit dem textuellen Diff an und zeichnet **Commit, Diff und Basisgeneration** auf. **Aktiviert nie** und berührt das System nie | Kein Flake-Pfad: Aufruffeher (2). Backend kann nicht: Backendfehler (125). **Es entsteht keine Wirkung, nur ein Datensatz.** |
| **check** | **Prüfbau ohne Aktivierung.** Die Befunde tragen Schwere (`info`, `warning`, `error`) und Text; das Ergebnis wird aufgezeichnet | Ein Befund der Schwere `error` sperrt: Politikfehler (1). Ab hier ist die Aufzeichnung die Grundlage jeder weiteren Entscheidung. |
| **approve** | Zeichnet die **ausdrückliche menschliche Freigabe** auf: **wer, wann, welcher Diff-Hash, welche Basisgeneration** | Ohne Namen keine Freigabe (2). Ohne vorherigen Prüfbau keine Freigabe (1) — eine Freigabe ohne Prüfbau wäre blind. Ein gesperrter Vorschlag lässt sich nicht freigeben (1). |
| **apply** | Die **Activation**: führt den Diff aus und liefert die entstandene Generation | Verweigert ohne Vorschlag, ohne Prüfbau, bei Fehler-Schwere-Befunden, bei getauschtem Diff, **ohne aufgezeichnete Freigabe** und bei nicht mehr aktiver Basisgeneration. Backend kann nicht: 125, **ohne** Generation. |
| **Generation** | Die neue Generation ist aktiv; die vorige bleibt liegen | Genau **eine** aktive Generation. Ein Vorschlag wirkt genau **einmal**. |
| **rollback** | Umschalten auf eine **aufgezeichnete** Generation, nicht auf eine wiederhergestellte | Unbekannte Generation: Politikfehler (1). Der Rückweg ist bewusst **nicht** gesperrt. |

**`propose` darf das System nie berühren und nie aktivieren.** Das ist im Dienst nicht nur
eine Zusage, sondern eine **getestete Eigenschaft**: `TestProposeNeverActivates` misst, dass
`propose`, `check` und `approve` zusammen **null** Aktivierungen auslösen und außerhalb der
Buchführung keine Datei entstehen lassen.

**`apply` darf ohne aufgezeichnete Freigabe nicht laufen.** Ebenfalls getestet:
`TestApplyRequiresRecordedApproval`. Hat sich der Diff nach der Freigabe geändert (der
Hash stimmt nicht mehr), lehnt `apply` **fail-closed** ab — `TestApplyRejectsChangedDiffHash`.

## 3. Warum NixOS das richtige Fundament ist

Die Begründung stammt nicht von uns, sondern aus einer Messung der Vorbilder. Sie steht in
[`../project-profile.md`](../project-profile.md) §4:

> **NewDawn0 — Systemaufbau und NixOS-Vorbild.** Geprüft am 12.10.2026 über alle drei Seiten
> seiner Repositories. Sein Profil: „Just a guy who likes Linux and coding". Sprachen: Nix,
> Rust, Go, Lua, C/C++, Haskell, Zig, Shell.
>
> | Repo | Sprache | Warum für uns interessant |
> |---|---|---|
> | `sys-cfg`, `nixConfig` | Nix | Systemkonfiguration als Code, Generationen, Umschalten |
>
> **Die Verbindung zu unserem Projekt** ist damit nicht die Oberfläche, sondern der
> **NixOS-Ansatz**, den der Betreiber von Anfang an genannt hat: Einheiten deklarieren,
> Generationen, atomares Umschalten und Zurückrollen, ein Wrapper als gemeinsame Basis.

Vier Eigenschaften machen NixOS für diesen Zweck geeignet, und keine davon ist Geschmack:

| Eigenschaft | Was sie bedeutet | Warum sie hier trägt |
|---|---|---|
| **Konfiguration als Code** | Die Systembeschreibung ist deklarativer Text in einem Flake, nicht eine Folge von Befehlen | Die Änderung ist **lesbar, bevor** sie wirkt — die Bedingung dafür, dass ein Mensch sie freigeben kann |
| **Generationen** | Jeder Wechsel erzeugt eine neue Generation, die vorige bleibt liegen | Eine Änderung ist kein Endzustand, sondern ein **Schritt** mit Vorgänger |
| **Atomares Umschalten** | Der Wechsel gilt ganz oder gar nicht | Es gibt keinen halb angewandten Zustand, über den niemand mehr Auskunft geben kann |
| **Rollback** | Zurückrollen ist das Umschalten auf die vorige Generation | Der Ausweg ist so billig wie der Weg hinein |

**Der entscheidende Punkt:** Ein System, das sich selbst ändern kann, ist nur dann
vertretbar, wenn jede Änderung atomar ist und zurückgerollt werden kann. Ohne diese beiden
Eigenschaften wäre Selbständerung eine Wette. Mit ihnen ist sie eine Transaktion.

## 4. Die Grenze — verbindlich: NixOS und Nix werden nicht installiert

> ### ⚠ Abgrenzung
>
> **Weisung des Betreibers vom 12.10.2026: „kein nixos installieren lol".**
>
> Der Anlass ist eine Messung, kein Vorbehalt: `nix` und `nixos-rebuild` sind auf diesem
> Rechner **nicht vorhanden** (Windows). Diese Feststellung ist der **Ist-Zustand**, kein
> Installationsauftrag ([§3.1](../decisions/hybrid-then-self-build.md): *„Die
> Umgebungsmessung dient damit nur der Feststellung des Ist-Zustands, nicht als
> Installationsauftrag."*).
>
> | Erlaubt | **Nicht** erlaubt |
> |---|---|
> | Das **Konzept** beschreiben: Module, Flakes, Generationen, Rollback | NixOS oder Nix auf diesem Rechner **installieren** |
> | Die **Schnittstelle** definieren: Actuation-API, Verträge, Fehlercodes | Eine Distribution austauschen, partitionieren, booten |
> | Den Dienst `pmh-nix` als **Gerüst** bauen, mit **Backend-Austausch** | Die Actuation gegen ein echtes System **ausführen** |
> | Eine **Attrappe** als Backend, damit alles testbar ist | `nixos-rebuild switch` irgendwo auslösen |
>
> Kein WSL-Subsystem wird eingerichtet (`wsl --install` ist ausgeschlossen), kein
> Paketmanager aufgerufen, keine Betriebssystem-Einstellung verändert.

### 4.1 Was stattdessen gebaut wird

1. **Das Konzept** — dieses Dokument.
2. **Die austauschbare Schnittstelle** — ein Interface mit sieben Methoden
   (`internal/actuation`), hinter dem die Ausführung liegt. Konzept und Schnittstelle ändern
   sich nicht, wenn später eine echte Ausführung dazukommt; es kommt eine **weitere
   Implementierung** hinzu.
3. **Zwei Backends**: `stub` (Vorgabe, ehrliche Attrappe, ändert nichts) und `nix`
   (vorhanden, aber inert; ohne `nix` auf dem Suchpfad scheitert **jeder** Aufruf laut,
   fail-closed, Exit 125, und `Apply` liefert **nie** eine erfundene Generation).

**Der Nutzen:** Die Vision ist geplant, ohne dass heute etwas installiert oder umgestellt
wird — und der Vertrag ist **heute schon messbar**.

## 5. Die zwei Betriebsarten

Beide Betriebsarten erfüllen **dasselbe Backend-Interface**; sie unterscheiden sich im
**Ort**, nicht in der Form des Aufrufs. Die Wahl geschieht per Flag
`--mode local|remote`, Vorgabe **`local`**.

| | **`local`** | **`remote`** |
|---|---|---|
| Ort | Flake im Repository auf dem Arbeitsrechner | Branch im Git-Repository, Zielmaschine ist ein **entfernter** Rechner |
| Was gebaut wird | Diff und **Prüfbau ohne Aktivierung** | Branch, Prüfbau auf der Zielmaschine, Freigabe, dann `switch` |
| Branch | `local/agent-<ziel>`, kein Push | `agent/nixos-<ziel>` auf `main`, mit Push |
| Aktivierung | nur in der Attrappe (Simulation) | `switch` auf der Zielmaschine, Rollback über die Generation |
| Rolle | **der Start** — zweite Phase, ohne Nix-Installation als Konzept und Vertrag ausformuliert und mit dem Attrappen-Backend **testbar** | **das Ziel** — entfernter NixOS-Rechner, per SSH oder Agent auf dem Ziel. **Nichts davon wird jetzt gebaut** |

`--mode` gilt für `propose` (Branch-Form), `detect` und die Anzeige; die Betriebsart eines
Vorschlags wird **im Diff mitgeführt**, damit die Activation nicht raten muss, wo sie
stattfindet. Eine unbekannte Betriebsart ist ein Aufruffeher (Exit 2).

## 6. Grenzen G1–G5 — vom Betreiber benannt

### G1 — NixOS läuft nur auf Linux

NixOS läuft **nur auf Linux**, auch auf einem **Raspberry Pi** und unter **WSL2** (über
NixOS-WSL). Auf reinem Windows gibt es nur den Umweg über **WSL2**.

**Folge für den Dienst:** Actuation findet **nie auf diesem Windows-Host** statt. `detect`
meldet das ehrlich: `available: false`, Grund *„nicht verfügbar: kein Nix auf diesem Wirt"*,
und in den Einzelheiten die Zeile *„Grenze G1: NixOS läuft nur auf Linux; auf diesem Wirt
findet keine Actuation statt"*. Ein ehrliches „nicht verfügbar" ist ein **gelungener**
Aufruf (Exit 0) — es ist die Wahrheit.

### G2 — steile Lernkurve, Speicherbedarf

Die **Nix-Sprache hat eine steile Lernkurve**, und Builds brauchen **Speicherplatz**.

**Folge:** **Flake klein halten.** Erklärungen gehören **in die Doku**, nicht in verstreute
Kommentare. Deshalb steht in `pmh-nix` jeder Vertrag in `README.md` und im Paketkommentar —
und die Attrappe trägt statt langer Kommentare einen kurzen Vermerk an jedem Datensatz.

### G3 — Netzwerk, Nutzerrechte und Secrets bekommen eine eigene, strengere Stufe

**Der Agent darf Netzwerk, Nutzerrechte und Secrets nicht ungeprüft ändern.**

**Folge:** Diese drei Kategorien sind im Politik-Layer eine **eigene Stufe** — nicht ein
Sonderfall der allgemeinen Branch-Regel. Die Zuordnung Pfad → Kategorie
(`internal/actuation`, `Classify`) erkennt die drei Kategorien an den Pfaden und am Inhalt:

| Kategorie | Erkannt an | Folge |
|---|---|---|
| `network` | `networking.*`, `network/*`, `firewall/*`, `tailscale`, `wireguard` | zwingende ausdrückliche Freigabe, **nie automatisch** |
| `users` | `users.*`, `users/*`, `home/*`, `sudoers` | zwingende ausdrückliche Freigabe |
| `secrets` | `secrets/*`, `sops`, `agenix`, ein Klartext-Geheimnis im Diff | zwingende ausdrückliche Freigabe |

Ohne ausdrückliche Freigabe wird ein solcher Diff **abgelehnt**, und die Ablehnung nennt die
strengere Stufe ausdrücklich (`strengere-kategorie`). Getestet:
`TestRestrictedCategoryNeedsExplicitApproval` (drei Fälle: Netzwerk, Nutzer, Geheimnis),
`TestRestrictedCategoriesAreNamedInTheCheck`, `TestClassifyRecognisesRestrictedCategories`.

**Die strenge Stufe verlangt eine Freigabe, sie verbietet die Änderung nicht.** Mit
ausdrücklicher Freigabe läuft auch ein `networking.*`-Diff durch — sonst ließe sich ein
Netzwerk nie ändern.

### G4 — Secrets gehören nicht in den Nix-Store

Der **Nix-Store ist world-readable.** Ein Geheimnis dort ist offen. Der vorgesehene Weg sind
**`sops-nix`** oder **`agenix`**.

**Folge:** Der Prüfbau enthält eine **eigene Prüfung**: ein Diff, der ein Secret **im
Klartext** in die Konfiguration schreibt, ist ein Befund der Schwere **`error`** — **kein
Hinweis**. Er sperrt die Anwendung, und ein gesperrter Vorschlag lässt sich nicht einmal
freigeben. Erkannt werden zugeordnete Literalwerte (`password = "…"`), eingebettete private
Schlüssel (`-----BEGIN … PRIVATE KEY-----`) und bekannte Token-Formate.

**Der richtige Weg wird nicht bestraft:** ein Verweis auf `sops.secrets.*`,
`config.sops…`, einen `.age`-Pfad oder `builtins.getEnv` ist **kein** Befund. Sonst wäre der
vorgesehene Weg der bestrafte. Getestet: `TestCheckReportsPlaintextSecretAsError` und die
Gegenprobe `TestSopsReferenceIsNotAFinding`.

### G5 — jede Änderung ist ein Git-Commit auf einem Branch

**Kein direkter Schreibzugriff auf den aktiven Stand.** Ein Vorschlag ist ein **Branch mit
Commit**; der aktive Stand bleibt unberührt.

**Folge:** `propose` zeichnet **Branch, Commit, Basis-Commit und Basisgeneration** auf, und
die Attrappe ruft dabei **kein `git`** auf — Branch und Commit sind Datensätze. Wer den
aktiven Stand ändern will, muss durch die Activation.

## 7. Warum das Selbständerung vertretbar macht

Drei Sätze, die den Unterschied ausmachen:

**1. Der Agent ändert Code, nicht Zustand.** Ein Vorschlag ist ein Text-Diff gegen eine
deklarative Beschreibung — **auf einem Branch**, nicht im aktiven Stand. Er beschreibt eine
Absicht, er trägt keine Befehlsfolge. Wer den Diff liest, weiß, was geschehen würde, **bevor**
es geschieht.

**2. `nixos-rebuild` ist der Transaktionsrand.** Innerhalb des Randes mag viel geschehen;
nach außen gibt es **einen** Übergang — ganz oder gar nicht.

**3. Rollback ist ein Umschalten, keine Wiederherstellung.** Es gibt kein Zurückspielen einer
Sicherung und keine Rekonstruktion. Die vorige Generation liegt noch da; der Rückweg zeigt
auf sie.

Zusammen: Die Änderung ist **lesbar** (1), **ganz oder gar nicht** (2) und **umkehrbar** (3).
Fehlt eine der drei, ist die Selbständerung eine Wette.

## 8. Die Sicherheitsregel und ihre geprüften Invarianten

> **Das Modell empfiehlt, die Policy entscheidet — ein Modell löst niemals einen
> Systemwechsel aus.**
>
> Ein Modell — oder jeder andere äußere Aufrufer — kann genau **eines**: einen Vorschlag
> aufnehmen. Was daraus wird, entscheidet die Politik. Und **freigeben kann nur ein Mensch**:
> die Freigabe trägt einen Namen und einen Zeitstempel.

Der Ablauf ist bindend, und der Aufruf der Politik steht **vor** jedem Backend-Aufruf:

```text
propose -> check -> approve -> policy.Require(apply) -> backend.Apply
```

| Invariante | Test | Was gemessen wird |
|---|---|---|
| **Ohne Freigabe keine Anwendung** | `TestApplyRequiresRecordedApproval` | ein geprüfter, aber nicht freigegebener Vorschlag wird abgewiesen; die Aufzeichnung nennt wer, wann, welchen Diff, welche Basisgeneration |
| **propose aktiviert nie** | `TestProposeNeverActivates` | null Aktivierungen nach propose/check/approve, keine Datei außerhalb der Buchführung, und genau eine Aktivierung durch apply |
| **Rückweg auf die Aufzeichnung** | `TestRollbackReturnsToRecordedGeneration` | der Rückweg landet auf einer aufgezeichneten Generation, beide bleiben erhalten, eine geratene Kennung wird abgewiesen |
| **Getauschter Diff fällt durch** | `TestApplyRejectsChangedDiffHash` | nach der Freigabe getauscht → fail-closed, Grund `diff-geaendert` / `freigabe-veraltet` |
| Ohne Prüfbau keine Anwendung | `TestApplyRejectsUncheckedProposal` | erst check, dann Freigabe, dann apply |
| Keine Umgehung über Vorschlagsfelder | `TestPolicyCannotBeBypassedByProposalFields` | ein Vorschlag, der sich selbst für geprüft, sicher, freigegeben und anwendbar erklärt, wird trotzdem abgewiesen |
| Nur eigene Kennungen | `TestApplyRejectsUnknownProposal` | nur eine von `propose` vergebene Kennung kommt durch |
| Einmal wirkt | `TestApplyRejectsAlreadyAppliedProposal` | ein Vorschlag erzeugt genau eine Generation |
| Sperrende Befunde sperren | `TestApplyRefusesWhenCheckFoundErrorSeverityFinding` | ein Befund der Schwere `error` verhindert die Anwendung und die Freigabe |
| Strenge Kategorien brauchen Freigabe | `TestRestrictedCategoryNeedsExplicitApproval` | Netzwerk, Nutzer, Geheimnis: ohne Freigabe abgelehnt, mit Freigabe erlaubt |
| Klartext-Secrets sind Fehler | `TestCheckReportsPlaintextSecretAsError` | Schwere `error`, Anwendung und Freigabe gesperrt |
| Veraltete Basisgeneration | `TestApplyRejectsStaleBaseGeneration` | Basis nicht mehr aktiv → fail-closed, neu bauen |
| Freigabe gilt genau für Bytes | `TestApprovalIsInvalidatedByNewCheck` | ein neuer Prüfbau über einen anderen Diff nimmt sie zurück |
| Nur `apply` ist gesperrt | `TestProposeIsTheOnlyOpenAction` | Vorschlagen, Prüfen, Freigeben und der Rückweg bleiben offen |
| Fail-closed ohne Werkzeugkasten | `TestNixRefusesEveryMutatingCallFailClosed` | ohne `nix` scheitert jeder Backend-Aufruf laut — und `Apply` liefert keine Generation |

**Die Politik liest kein Feld der Anfrage.** Sie liest ausschließlich die aufgezeichnete
Buchführung. Es gibt in `api.Proposal` absichtlich kein `checked`, kein `safe`, kein
`approved`, kein `policy_ok` — und ein von Hand in die Ablage geschriebenes
`"approved": true` ist wirkungslos.

**Ehrliche Einschränkung.** Auf diesem Wirt gibt es kein Nix. In der Vorgabe-Betriebsart
läuft der Vertrag der Attrappe deshalb **durch**: er erzeugt einen Datensatz, der wie eine
Generation aussieht — und der ausdrücklich als Attrappe gekennzeichnet ist (`system:
"attrappe"`, Vermerk *„nichts am System geändert, nur Buchführung"*). Wer „eine Generation
ist entstanden" mit „das System wurde umgestellt" gleichsetzt, liest die Ausgabe falsch.

## 9. Zielumgebung — Ausblick

**Kein Bauauftrag.** Später kommt eines von beidem:

| Ziel | Was es bedeutet |
|---|---|
| **Externer Server mit NixOS** | Der Dienst adressiert ein **entferntes** Ziel: per **SSH** oder über einen **Agenten auf dem Ziel** |
| **Raspberry Pi 5 mit 8 GB RAM** | Dasselbe Muster, im Gehäuse **Pironman 5** — ein kleiner, billiger, ersetzbarer Rechner, auf dem ein misslungener Wechsel nichts kostet |

Daraus folgt: die Actuation braucht die **`remote`-Betriebsart** — Prüfbau auf der
Zielmaschine, Freigabe, dann `switch`. Sie ist im Vertrag und im Interface **vorgesehen und
in der Attrappe testbar**, aber **nichts davon wird jetzt gebaut oder installiert**.

## 10. Offene Fragen — Messungen, keine Aufträge

Diese Fragen sind **offen**. Keine von ihnen wird hier entschieden, und **keine** ist ein
Auftrag, etwas zu installieren.

| Offene Frage | Warum sie offen ist | Was sie klären würde |
|---|---|---|
| **Wo läuft die Actuation später?** Eigener NixOS-Host, Raspberry Pi, Container oder WSL2-Rand | Die Umgebungsmessung (§3.1) hat WSL2 und Docker als *vorhanden* festgestellt, aber keine Option als *geeignet* gemessen | Eine Messung, kein Beschluss: Welcher Rand lässt sich am billigsten zurückrollen und am ehrlichsten überwachen? |
| **Wie wird der Diff berechnet?** | Ohne Werkzeugkasten gibt es keinen ehrlichen Diff. `nixos-rebuild build --dry-run` ist der geplante Weg, aber ungemessen | Ein Vergleich: Wie vollständig ist die Ausgabe eines Trockenlaufs gegenüber einem echten `nix store diff-closures`? |
| **Wie kommt der Vorschlag auf den Zielrechner?** | Die `remote`-Betriebsart ist im Vertrag, aber der Transport (SSH, Agent, Forgejo-Actions) ist ungemessen | Eine Messung an **einem** Rand, nicht drei Entwürfe |
| **Wer darf einen Vorschlag einreichen, wer freigeben?** | Heute ist der Rand die Prozessgrenze; die Freigabe trägt einen Namen, aber es gibt keine Signaturprüfung | Ein Modell für Herkunft und Prüfsumme — für den Einreicher **und** für den Freigeber |
| **Wie wird die Generationenliste ausgelesen?** | Geplant ist `nix-env --list-generations --profile /nix/var/nix/profiles/system` | Ob die Liste stabil genug ist, um Entscheidungen darauf zu stützen |
| **Was geschieht bei einem Rückweg über einen Neustart hinweg?** | Ein Rückweg ist ein Umschalten; ob der nächste Start dieselbe Generation sieht, ist Teil des Randes | Eine Messung auf dem gewählten Rand |

**Keine dieser Fragen rechtfertigt heute eine Installation.** Sie werden beantwortet, wenn ein
Rand gewählt und gemessen ist — und der Dienst ändert sich dafür nicht: es kommt eine weitere
Implementierung von `internal/actuation` hinzu.
